import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * `chargerHistoriqueCarte` contre la vraie base, avec la session d'un vrai
 * collecteur.
 *
 * ## Ce que cette épreuve garde, et qu'aucun bouchon ne peut garder
 *
 * Le niveau 2 de l'écran d'historique mêle deux tables — `mises` et `retraits`
 * — dont la seconde est **fermée en écriture** à `authenticated` : seule la
 * clôture, côté serveur, y écrit. La question qui décide de l'écran n'est donc
 * pas « le code trie-t-il bien » mais « le collecteur a-t-il seulement le droit
 * de **lire** son propre retrait ». Un bouchon répond oui par construction.
 * Ici, `retraits_select` répond, ou l'épreuve tombe.
 *
 * Elle garde aussi les noms de colonnes. `montant_restitue` et `effectue_le`
 * n'existent que dans `retraits` ; `montant` et `encaisse_le` que dans `mises`.
 * Une faute de frappe dans un `select` PostgREST ne lève pas : elle rend
 * `data: null` et une erreur qu'on ignore, donc une liste vide. À l'écran, ça
 * ressemble à « ce client n'a rien versé » — le pire mensonge possible sur un
 * écran d'historique.
 *
 * ## Pourquoi le module client est remplacé plutôt que la fonction réécrite
 *
 * `lectures-ecrans.ts` lit `supabase` depuis `./supabase`, qui se construit sur
 * `import.meta.env` — absent de cette suite. Le module est donc remplacé par un
 * accesseur qui rend le client **authentifié** du harnais : RLS s'applique
 * exactement comme dans l'application. Recopier les deux requêtes dans
 * l'épreuve aurait été plus simple et n'aurait rien prouvé — une faute de
 * frappe dans la vraie fonction serait passée sans que rien ne bouge ici.
 */

const etat = vi.hoisted(() => ({ client: null as { from: unknown } | null }));

vi.mock('../../apps/collecteur/src/supabase', () => ({
  // Un accesseur et non une valeur : le client n'existe qu'après la connexion,
  // dans `beforeAll`, alors que la fabrique est évaluée au premier import.
  get supabase() {
    if (!etat.client) throw new Error('Client de test non posé — voir beforeAll.');
    return etat.client;
  },
}));

const { chargerHistoriqueCarte } = await import('../../apps/collecteur/src/lectures-ecrans');

const MARQUE = crypto.randomUUID().slice(0, 8);
const MISE = 2000;

let collecteur: CollecteurTest;
let carteId: string;
let autreCarteId: string;

async function creerClient(): Promise<string> {
  const clientId = crypto.randomUUID();
  const { error } = await collecteur.client
    .from('clients')
    .insert({ id: clientId, collecteur_id: collecteur.id, nom: `Client ${MARQUE}` });
  if (error) throw error;
  return clientId;
}

async function ouvrirCarte(clientId: string): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await collecteur.client
    .from('cartes')
    .insert({ id, collecteur_id: collecteur.id, client_id: clientId, mise: MISE });
  if (error) throw error;
  return id;
}

/**
 * Encaisse `combien` mises, une par une, à des heures distinctes.
 *
 * Une par une, jamais en lot : les déclencheurs `AFTER` sont différés en fin
 * d'instruction, donc un lot verrait toutes les mises avec le même compteur et
 * les marquerait toutes commission. C'est le défaut trouvé le 2026-08-19, et
 * `cartes-multiples.test.ts` porte la même précaution.
 *
 * Des heures distinctes parce que l'ordre est ce que l'épreuve mesure : trois
 * mises au même horodatage rendraient un tri « juste » par accident.
 */
async function encaisser(cible: string, combien: number): Promise<void> {
  for (let i = 0; i < combien; i += 1) {
    const quand = new Date(Date.now() - (combien - i) * 3_600_000).toISOString();
    const { error } = await collecteur.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      carte_id: cible,
      montant: MISE,
      encaisse_le: quand,
    });
    if (error) throw error;
  }
}

beforeAll(async () => {
  collecteur = await creerCollecteur(`Historique ${MARQUE}`, `+225073${MARQUE}`);
  etat.client = collecteur.client as unknown as { from: unknown };

  const clientId = await creerClient();
  carteId = await ouvrirCarte(clientId);
  autreCarteId = await ouvrirCarte(clientId);

  await encaisser(carteId, 3);
  await encaisser(autreCarteId, 1);

  // Par `admin` : aucune politique n'autorise `authenticated` à écrire dans
  // `retraits`. C'est la garantie centrale de `cloture-carte.test.ts`, et
  // ouvrir la table pour les besoins de cette épreuve serait la payer du prix
  // de ce qu'elle protège.
  //
  // (3 − 1) × 2000 : la première mise est la commission du collecteur.
  const { error } = await admin.from('retraits').insert({
    collecteur_id: collecteur.id,
    carte_id: carteId,
    montant_restitue: 4000,
    commission: MISE,
  });
  if (error) throw error;
});

afterAll(async () => {
  await nettoyer();
});

describe('chargerHistoriqueCarte', () => {
  it('rend les mises et le retrait d’une carte, du plus récent au plus ancien', async () => {
    const evenements = await chargerHistoriqueCarte(carteId);

    expect(evenements.map((e) => e.genre)).toEqual(['retrait', 'mise', 'mise', 'mise']);

    const dates = evenements.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('rend le montant réellement restitué, et non un recalcul', async () => {
    // L'écran affiche ce chiffre à un client qui conteste une somme. Il doit
    // venir de la ligne écrite le jour du retrait, et de nulle part ailleurs.
    const [retrait] = await chargerHistoriqueCarte(carteId);

    expect(retrait?.montant).toBe(4000);
  });

  it('marque la mise de commission, que la base seule connaît', async () => {
    // `est_commission` est posé par un déclencheur `BEFORE` — le client ne
    // l'envoie jamais. Sans ce drapeau, l'écran listerait trois mises de 2 000
    // sous un solde restituable de 4 000, et le client compterait 6 000.
    const mises = (await chargerHistoriqueCarte(carteId)).filter((e) => e.genre === 'mise');

    expect(mises.filter((m) => m.estCommission)).toHaveLength(1);
    // La commission est la première encaissée, donc la dernière de la liste.
    expect(mises[mises.length - 1]?.estCommission).toBe(true);
  });

  it('ne rend que les événements de la carte demandée', async () => {
    const evenements = await chargerHistoriqueCarte(autreCarteId);

    expect(evenements.map((e) => e.genre)).toEqual(['mise']);
  });

  it('rend une liste vide pour une carte qui n’est pas la sienne', async () => {
    // RLS, pas un `if` de l'application : un identifiant inventé ne franchit
    // pas `mises_select`, et la fonction n'a rien à filtrer elle-même.
    expect(await chargerHistoriqueCarte(crypto.randomUUID())).toEqual([]);
  });
});
