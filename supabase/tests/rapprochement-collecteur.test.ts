import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le rapprochement de caisse, **écrit par le collecteur lui-même**.
 *
 * `operations.test.ts` couvre déjà `caisses_jour`, mais toujours avec la clé de
 * service : elle contourne RLS *et* la liste blanche de colonnes. Or c'est
 * précisément ce que l'écran du collecteur ne peut pas contourner. Le chemin
 * réel — session du collecteur, `grant insert (id, collecteur_id, date,
 * cash_declare)`, `grant update (cash_declare)` — n'était vérifié par rien.
 *
 * Ce fichier le vérifie, et il vérifie surtout la raison pour laquelle
 * `declarerCaisse` lit puis écrit au lieu d'utiliser un `upsert` : PostgREST,
 * sur conflit, réaffecte toutes les colonnes envoyées, `id` et `collecteur_id`
 * compris. Un `upsert` marcherait donc à la première déclaration du jour et
 * échouerait à la correction — le cas le plus utile.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
let collecteur: CollecteurTest;

/** Le jour au sens du serveur : `cash_attendu_du_jour` découpe en UTC. */
function dateUtcDuJour(): string {
  return new Date().toISOString().slice(0, 10);
}

async function encaisser(montant: number): Promise<void> {
  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();

  const { error: e1 } = await collecteur.client
    .from('clients')
    .insert({ id: clientId, collecteur_id: collecteur.id, nom: `Caisse ${MARQUE}` });
  if (e1) throw e1;

  const { error: e2 } = await collecteur.client
    .from('cartes')
    .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise: montant });
  if (e2) throw e2;

  const { error: e3 } = await collecteur.client.from('mises').insert({
    id: crypto.randomUUID(),
    collecteur_id: collecteur.id,
    carte_id: carteId,
    montant,
    encaisse_le: new Date().toISOString(),
  });
  if (e3) throw e3;
}

beforeAll(async () => {
  collecteur = await creerCollecteur(`Caisse ${MARQUE}`, `+225071${MARQUE}`);
});

afterAll(async () => {
  await nettoyer();
});

describe('le chemin exact de l’écran', () => {
  let ligneId: string;

  it('déclare sa caisse du jour, et le serveur pose l’attendu', async () => {
    await encaisser(2000);
    await encaisser(3000);

    // Exactement ce que `declarerCaisse` envoie à la première déclaration :
    // trois colonnes, pas une de plus.
    const { data, error } = await collecteur.client
      .from('caisses_jour')
      .insert({
        collecteur_id: collecteur.id,
        date: dateUtcDuJour(),
        cash_declare: 5000,
      })
      .select('id, cash_attendu, cash_declare, ecart')
      .single();

    expect(error).toBeNull();
    expect(data!.cash_attendu).toBe(5000);
    expect(data!.cash_declare).toBe(5000);
    expect(data!.ecart).toBe(0);
    ligneId = data!.id;
  });

  it('corrige sa déclaration par un update sur la seule colonne permise', async () => {
    // Le cas le plus utile de l'écran : le collecteur recompte et se reprend.
    const { data, error } = await collecteur.client
      .from('caisses_jour')
      .update({ cash_declare: 4000 })
      .eq('id', ligneId)
      .select('cash_attendu, cash_declare, ecart')
      .single();

    expect(error).toBeNull();
    expect(data!.cash_declare).toBe(4000);
    expect(data!.ecart).toBe(-1000);
  });

  it('voit son écart bouger quand une mise arrive après sa déclaration', async () => {
    await encaisser(1000);

    const { data } = await collecteur.client
      .from('caisses_jour')
      .select('cash_attendu, ecart')
      .eq('id', ligneId)
      .single();

    // L'attendu suit les mises, sans que le collecteur ait rien à refaire.
    expect(data!.cash_attendu).toBe(6000);
    expect(data!.ecart).toBe(-2000);
  });
});

describe('ce que la liste blanche interdit', () => {
  it('refuse au collecteur d’écrire l’attendu à l’insertion', async () => {
    // Le geste qui masquerait un manquant : poser soi-même le terme de gauche du
    // rapprochement. `grant insert` ne nomme pas `cash_attendu`.
    const { error } = await collecteur.client.from('caisses_jour').insert({
      collecteur_id: collecteur.id,
      date: '2026-08-01',
      cash_attendu: 999_999,
      cash_declare: 999_999,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('refuse au collecteur de corriger l’attendu après coup', async () => {
    const { data } = await collecteur.client
      .from('caisses_jour')
      .select('id')
      .eq('date', dateUtcDuJour())
      .single();

    const { error } = await collecteur.client
      .from('caisses_jour')
      .update({ cash_attendu: 0 })
      .eq('id', data!.id);

    expect(error?.code).toBe('42501');
  });

  it('explique pourquoi `declarerCaisse` n’utilise pas d’upsert', async () => {
    // La démonstration du choix. Un `upsert` envoie `collecteur_id` et `date`
    // dans le `do update set`, or `update` n'est accordé que sur `cash_declare`.
    const { error } = await collecteur.client
      .from('caisses_jour')
      .upsert(
        { collecteur_id: collecteur.id, date: dateUtcDuJour(), cash_declare: 7000 },
        { onConflict: 'collecteur_id,date' },
      );

    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });
});

describe('cloisonnement entre collecteurs', () => {
  it('ne laisse pas déclarer une caisse au nom d’un autre', async () => {
    const autre = await creerCollecteur(`Voisin ${MARQUE}`, `+225072${MARQUE}`);

    const { error } = await collecteur.client.from('caisses_jour').insert({
      collecteur_id: autre.id,
      date: '2026-07-15',
      cash_declare: 100,
    });

    // La politique `caisses_insert` exige `collecteur_id = auth.uid()`. Sans
    // elle, un collecteur salirait le rapprochement d'un autre.
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });
});


/**
 * Le cash attendu, quand la journée comporte une restitution.
 *
 * Le défaut réparé le 2026-08-25 : `cash_attendu_du_jour` n'additionnait que
 * les mises. Un collecteur qui rendait 4 000 FCFA le matin voyait le soir un
 * attendu qui les contenait encore, donc un manquant de 4 000 qui n'existait
 * pas. Sur un produit dont le sujet est la confiance entre un collecteur et son
 * argent, le dispositif censé le rassurer devenait celui qui l'accusait.
 *
 * Le test exerce la journée entière, dans l'ordre réel : encaisser, rendre,
 * déclarer. C'est ce que l'audit demandait, et ce qui aurait attrapé au passage
 * la colonne inexistante que sa correction proposait — `cloture_le` au lieu de
 * `effectue_le`.
 */
describe('le cash attendu face aux restitutions', () => {
  it('soustrait ce qui est sorti de la sacoche', async () => {
    const seul = await creerCollecteur(`Sacoche ${MARQUE}`, `+225076${MARQUE}`);

    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    await seul.client
      .from('clients')
      .insert({ id: clientId, collecteur_id: seul.id, nom: `Rendu ${MARQUE}` });
    await seul.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: seul.id, client_id: clientId, mise: 1000 });

    for (let i = 0; i < 3; i += 1) {
      const { error } = await seul.client.from('mises').insert({
        id: crypto.randomUUID(),
        collecteur_id: seul.id,
        carte_id: carteId,
        montant: 1000,
        encaisse_le: new Date().toISOString(),
      });
      if (error) throw error;
    }

    // La restitution passe par la clé de service : la table est fermée en
    // écriture au collecteur, c'est l'Edge Function qui la rédige.
    // (3 − 1) × 1 000 — la première mise est la commission.
    const { error: eRetrait } = await admin.from('retraits').insert({
      collecteur_id: seul.id,
      carte_id: carteId,
      montant_restitue: 2000,
      commission: 1000,
    });
    expect(eRetrait).toBeNull();

    const { data, error } = await seul.client
      .from('caisses_jour')
      .insert({ collecteur_id: seul.id, date: dateUtcDuJour(), cash_declare: 1000 })
      .select('cash_attendu, ecart')
      .single();

    expect(error).toBeNull();
    // 3 000 encaissés − 2 000 rendus = 1 000 en main.
    expect((data as { cash_attendu: number }).cash_attendu).toBe(1000);
    // Et donc aucun écart : le collecteur a exactement ce qu'il doit avoir.
    expect((data as { ecart: number }).ecart).toBe(0);
  });

  it('rafraîchit une caisse déjà déclarée quand une carte se clôture après', async () => {
    // Le jumeau du déclencheur des mises. Sans lui, `cash_attendu` resterait
    // figé sur sa valeur d'avant la restitution — une lecture périmée côté
    // serveur, qu'aucune invalidation de cache côté téléphone ne rattrape.
    const seul = await creerCollecteur(`Tardif ${MARQUE}`, `+225077${MARQUE}`);

    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    await seul.client
      .from('clients')
      .insert({ id: clientId, collecteur_id: seul.id, nom: `Tardif ${MARQUE}` });
    await seul.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: seul.id, client_id: clientId, mise: 2000 });
    await seul.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: seul.id,
      carte_id: carteId,
      montant: 2000,
      encaisse_le: new Date().toISOString(),
    });

    const { data: avant } = await seul.client
      .from('caisses_jour')
      .insert({ collecteur_id: seul.id, date: dateUtcDuJour(), cash_declare: 2000 })
      .select('id, cash_attendu')
      .single();
    expect((avant as { cash_attendu: number }).cash_attendu).toBe(2000);

    await admin.from('retraits').insert({
      collecteur_id: seul.id,
      carte_id: carteId,
      montant_restitue: 500,
      commission: 2000,
    });

    const { data: apres } = await seul.client
      .from('caisses_jour')
      .select('cash_attendu')
      .eq('id', (avant as { id: string }).id)
      .single();

    expect((apres as { cash_attendu: number }).cash_attendu).toBe(1500);
  });
});
