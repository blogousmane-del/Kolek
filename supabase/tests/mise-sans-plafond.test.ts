import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Ce que la base accepte une fois le plafond de 10 000 FCFA levé — et ce
 * qu'elle sait encore restituer au-delà de ce qu'un `integer` porte.
 *
 * Les deux moitiés du chantier se testent ensemble et pas séparément : la
 * contrainte élargie est ce qui permet de créer la carte qui ferait déborder le
 * produit, et le produit coulé en `bigint` est ce qui rend cette carte
 * utilisable.
 */

/** Code SQLSTATE d'une violation de contrainte CHECK. */
const CHECK_VIOLE = '23514';

/**
 * Assez grande pour faire déborder `(mises_encaissees - 1) * mise` dès la
 * troisième mise : 2 × 2 000 000 000 = 4 000 000 000, au-delà des
 * 2 147 483 647 d'un `integer`. Et elle tient elle-même dans la colonne.
 */
const MISE_ENORME = 2_000_000_000;

/** Le solde attendu après trois mises : la première est la commission. */
const SOLDE_ATTENDU = 2 * MISE_ENORME;

const MARQUE = crypto.randomUUID().slice(0, 8);
let collecteur: CollecteurTest;

beforeAll(async () => {
  collecteur = await creerCollecteur(`Plafond ${MARQUE}`, `+225073${Date.now() % 10000000}`);
});

afterAll(nettoyer);

async function creerClient(avecAvis = false): Promise<string> {
  const clientId = crypto.randomUUID();
  const { error } = await collecteur.client.from('clients').insert({
    id: clientId,
    collecteur_id: collecteur.id,
    nom: `Client ${MARQUE}`,
    telephone: avecAvis ? `+22507${Date.now() % 100000000}` : null,
    avis_actifs: avecAvis,
  });
  if (error) throw error;
  return clientId;
}

async function ouvrirCarte(clientId: string, mise: number) {
  const carteId = crypto.randomUUID();
  const { error } = await collecteur.client
    .from('cartes')
    .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise });
  return { carteId, error };
}

/**
 * Encaisse une mise, datée d'il y a `joursAvant` jours.
 *
 * Relatif à `now()` et non à une date fixe : `mises_avant_insert` refuse tout
 * `encaisse_le` hors de la fenêtre glissante [-90 jours, +1 jour] (voir
 * `20260819010000_socle_bornes_texte.sql`), donc une date figée en dur finit
 * par tomber hors fenêtre au seul effet du temps qui passe. Même parti pris
 * que `decale()` dans `mises.test.ts`.
 *
 * Un jour distinct par mise, délibérément : `cash_attendu_du_jour` additionne
 * par journée et rend un `integer`. Trois mises énormes le même jour feraient
 * échouer sa conversion finale — c'est la limite résiduelle documentée dans la
 * migration, pas ce que ce fichier mesure.
 */
async function encaisser(carteId: string, montant: number, joursAvant: number): Promise<string> {
  const miseId = crypto.randomUUID();
  const { error } = await collecteur.client.from('mises').insert({
    id: miseId,
    collecteur_id: collecteur.id,
    carte_id: carteId,
    montant,
    encaisse_le: new Date(Date.now() - joursAvant * 86_400_000).toISOString(),
  });
  if (error) throw error;
  return miseId;
}

describe('les bornes de la mise', () => {
  it('accepte une carte à 50 000 FCFA, que l’ancienne borne refusait', async () => {
    const { error } = await ouvrirCarte(await creerClient(), 50_000);
    expect(error).toBeNull();
  });

  it('refuse toujours une mise sous le plancher', async () => {
    // Le plancher n'est pas un reliquat : sous 500 FCFA, la commission du
    // collecteur ne paie pas son déplacement.
    const { error } = await ouvrirCarte(await creerClient(), 499);
    expect(error?.code).toBe(CHECK_VIOLE);
  });

  it('encaisse une mise de 50 000 FCFA', async () => {
    // `mises.montant` porte sa propre borne, distincte de celle de
    // `cartes.mise`. Élargir l'une sans l'autre laisserait ouvrir la carte puis
    // refuserait le premier versement.
    const { carteId, error } = await ouvrirCarte(await creerClient(), 50_000);
    expect(error).toBeNull();
    await expect(encaisser(carteId, 50_000, 5)).resolves.toBeTypeOf('string');
  });
});

describe('ce que la base restitue au-delà de l’integer', () => {
  it('rend un solde juste sur une carte qui ferait déborder le produit', async () => {
    const { carteId, error } = await ouvrirCarte(await creerClient(), MISE_ENORME);
    expect(error).toBeNull();

    // Une par une, jamais en lot : les déclencheurs AFTER sont différés en fin
    // d'instruction, donc un lot verrait toutes les mises avec le même compteur
    // et les marquerait toutes commission.
    await encaisser(carteId, MISE_ENORME, 10);
    await encaisser(carteId, MISE_ENORME, 11);
    await encaisser(carteId, MISE_ENORME, 12);

    const { data, error: erreurVue } = await admin.rpc('admin_vue_globale');
    expect(erreurVue).toBeNull();

    const cartes = (data as { cartes: { id: string; solde_restituable: number }[] }).cartes;
    const trouvee = cartes.find((c) => c.id === carteId);
    expect(trouvee?.solde_restituable).toBe(SOLDE_ATTENDU);
  });

  it('écrit un avis dont le total dépasse ce qu’un integer porte', async () => {
    await admin
      .from('avis_reglages')
      .upsert(
        { collecteur_id: collecteur.id, canal: 'sms', sur_mise: true, quota_mensuel: 1000 },
        { onConflict: 'collecteur_id' },
      );

    const clientId = await creerClient(true);
    const { carteId, error } = await ouvrirCarte(clientId, MISE_ENORME);
    expect(error).toBeNull();

    await encaisser(carteId, MISE_ENORME, 20);
    await encaisser(carteId, MISE_ENORME, 21);
    // La troisième : c'est elle qui porte un total de 2 × 2 000 000 000, donc
    // celle dont le texte déborderait. La première est la commission et ne
    // produit aucun avis.
    const troisieme = await encaisser(carteId, MISE_ENORME, 22);

    // Retrouvé par `source_id` et non par date : `avis_clients` porte
    // l'idempotence sur (source_table, source_id), donc c'est la clé qui
    // désigne l'avis d'une mise précise sans dépendre d'un ordre.
    const { data } = await admin
      .from('avis_clients')
      .select('corps')
      .eq('source_table', 'mises')
      .eq('source_id', troisieme);

    // `grouper_milliers` sépare par une espace simple : l'insécable n'est pas
    // en GSM-7, et un SMS qui la porte coûte deux segments au lieu d'un.
    expect(data?.[0]?.corps).toContain('4 000 000 000');
  });
});
