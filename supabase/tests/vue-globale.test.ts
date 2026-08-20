import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * `admin_vue_globale()` est la première fonction du schéma qui rend, en une
 * réponse, des données appartenant à *tous* les collecteurs. C'est exactement ce
 * que les seize politiques RLS existent pour empêcher — et elle y échappe par
 * construction, étant `SECURITY DEFINER`.
 *
 * Ce qui la rend acceptable tient donc entièrement à qui peut l'appeler. Le
 * premier bloc de ce fichier teste cela et rien d'autre. Le second vérifie que
 * les chiffres rendus sont les bons, parce qu'un tableau de bord faux se
 * remarque tard et se croit longtemps.
 */

afterAll(nettoyer);

let a: CollecteurTest;
let b: CollecteurTest;

/**
 * Cette vue est globale par nature : elle agrège *tous* les collecteurs. Or
 * `npm run test:db` ne réinitialise pas la base — seul `npm run verifier` le
 * fait, en tête. Deux exécutions successives laissent donc deux « Collecteur
 * A » en base, et toute assertion sur un total absolu devient fausse au
 * deuxième lancement.
 *
 * D'où la règle tenue dans tout ce fichier : les valeurs absolues ne sont
 * vérifiées que sur des clés uniques à cette exécution, et les totaux ne sont
 * vérifiés que *relativement* à la somme des lignes. Un test qui ne passe qu'une
 * fois n'est pas un test.
 */
const MARQUE = crypto.randomUUID().slice(0, 8);
const ZONE_A = `Adjamé-${MARQUE}`;
const ZONE_B = `Plateau-${MARQUE}`;

/** Fait échouer bruyamment. Un `insert` non vérifié rend un test vert sur une base vide. */
function exigerSucces(etiquette: string, erreur: { message: string } | null): void {
  if (erreur) throw new Error(`Préparation « ${etiquette} » : ${erreur.message}`);
}

beforeAll(async () => {
  a = await creerCollecteur('Vue A', `+225079${Date.now() % 10000000}`);
  b = await creerCollecteur('Vue B', `+22508${(Date.now() + 1) % 100000000}`);

  // A : deux clients, une carte, deux mises dont la commission. B : un client
  // sans activité — le cas du collecteur qui doit apparaître à l'écran avec des
  // zéros plutôt que de disparaître d'une jointure.
  exigerSucces(
    'zone de A',
    (await admin
      .from('collecteurs')
      .update({ zone: ZONE_A, palier: 'pro', abonnement_statut: 'actif' })
      .eq('id', a.id)).error,
  );
  exigerSucces(
    'zone de B',
    (await admin
      .from('collecteurs')
      .update({ zone: ZONE_B, palier: 'essai', abonnement_statut: 'actif' })
      .eq('id', b.id)).error,
  );

  const client1 = crypto.randomUUID();
  const client2 = crypto.randomUUID();
  const carte1 = crypto.randomUUID();

  exigerSucces(
    'clients de A',
    (await admin.from('clients').insert([
      { id: client1, collecteur_id: a.id, nom: 'Client A1' },
      { id: client2, collecteur_id: a.id, nom: 'Client A2' },
    ])).error,
  );
  exigerSucces(
    'client de B',
    (await admin
      .from('clients')
      .insert({ id: crypto.randomUUID(), collecteur_id: b.id, nom: 'Client B1' })).error,
  );
  exigerSucces(
    'carte de A',
    (await admin
      .from('cartes')
      .insert({ id: carte1, collecteur_id: a.id, client_id: client1, mise: 1000 })).error,
  );

  // Une mise par instruction, et jamais un `insert` groupé.
  //
  // `mises_avant_insert` lit `cartes.mises_encaissees` pour décider si la mise
  // est la commission ; c'est `mises_apres_insert`, un déclencheur AFTER, qui
  // incrémente ce compteur. Or PostgreSQL diffère les déclencheurs AFTER à la
  // fin de l'instruction : dans un INSERT à deux lignes, les deux BEFORE lisent
  // `mises_encaissees = 0`, marquent les deux comme commission, et l'index
  // partiel `mises_une_commission_par_carte` rejette le tout.
  //
  // Ce n'est pas un défaut du schéma — le téléphone envoie ses mises une par
  // une. C'est une contrainte du modèle, et la voici écrite pour le prochain.
  for (const attendu of [true, false]) {
    const { error } = await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: a.id,
      carte_id: carte1,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
    });
    exigerSucces(`mise (commission attendue : ${attendu})`, error);
  }
});

describe('admin_vue_globale — qui a le droit de l’appeler', () => {
  it('1. refuse un collecteur authentifié, même administrateur de rien', async () => {
    // Le cas qui compte. Sans le `revoke ... from public` de la migration,
    // `authenticated` hériterait du droit d'exécution par défaut, et ce seul
    // appel rendrait la plateforme entière à n'importe quel collecteur muni de
    // son propre téléphone. La fonction étant SECURITY DEFINER, aucune politique
    // RLS ne l'arrêterait.
    const { error } = await a.client.rpc('admin_vue_globale');

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
    expect(error!.message).toContain('permission denied');
  });

  it('2. refuse le rôle anonyme', async () => {
    const { error } = await anonyme.rpc('admin_vue_globale');

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('3. refuse même un collecteur inscrit aux admins', async () => {
    // Le point le plus contre-intuitif du dispositif, et celui qu'une relecture
    // pressée « corrigerait » en accordant l'exécution à `authenticated`.
    //
    // Être administrateur n'accorde pas le droit d'appeler cette fonction
    // *directement* : le portillon vit dans l'Edge Function, qui vérifie
    // `est_admin()` sous l'identité de l'appelant puis appelle avec la clé de
    // service. Si `authenticated` pouvait exécuter la fonction, le portillon
    // deviendrait contournable — il suffirait d'un `rpc` depuis la console du
    // navigateur, sans jamais passer par l'Edge Function.
    await admin.from('admins').insert({ user_id: a.id });
    try {
      const { data: bienAdmin } = await a.client.rpc('est_admin');
      expect(bienAdmin).toBe(true);

      const { error } = await a.client.rpc('admin_vue_globale');
      expect(error).not.toBeNull();
      expect(error!.code).toBe('42501');
    } finally {
      await admin.from('admins').delete().eq('user_id', a.id);
    }
  });

  it('4. accepte la clé de service', async () => {
    const { data, error } = await admin.rpc('admin_vue_globale');

    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });
});

describe('admin_vue_globale — ce qu’elle compte', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let vue: any;

  beforeAll(async () => {
    const { data, error } = await admin.rpc('admin_vue_globale');
    if (error) throw error;
    vue = data;
  });

  it('5. sépare la commission du collecteur de ce qui reste dû au client', async () => {
    // Deux mises de 1 000, dont une commission. Confondre les deux colonnes
    // donnerait 2 000 d'encours ou 0 — les deux erreurs sont invisibles à l'œil
    // sur un tableau de bord.
    const ligne = vue.collecteurs.find((c: { id: string }) => c.id === a.id);

    expect(ligne.encaisse).toBe(2000);
    expect(ligne.commissions).toBe(1000);
    expect(ligne.encours).toBe(1000);
  });

  it('6. garde le collecteur sans activité, à zéro plutôt qu’absent', () => {
    const ligne = vue.collecteurs.find((c: { id: string }) => c.id === b.id);

    expect(ligne).toBeDefined();
    expect(ligne.clients).toBe(1);
    expect(ligne.cartes_actives).toBe(0);
    expect(ligne.encaisse).toBe(0);
    expect(ligne.encours).toBe(0);
  });

  it('7. répartit par zone sans perdre personne', () => {
    const zones = vue.zones as Array<{ zone: string; collecteurs: number; encaisse: number }>;
    const zoneDeA = zones.find((z) => z.zone === ZONE_A);
    const zoneDeB = zones.find((z) => z.zone === ZONE_B);

    // Zones marquées par cette exécution : un seul collecteur chacune, donc des
    // valeurs absolues défendables même sur une base déjà peuplée.
    expect(zoneDeA!.collecteurs).toBe(1);
    expect(zoneDeA!.encaisse).toBe(2000);
    expect(zoneDeB!.collecteurs).toBe(1);
    expect(zoneDeB!.encaisse).toBe(0);

    // L'invariant qui compte vraiment : aucun collecteur ne tombe entre deux
    // zones. `zone` étant nullable, un `group by zone` sans `coalesce` perdrait
    // silencieusement tous ceux qui n'en ont pas.
    const totalZones = zones.reduce((s, z) => s + z.collecteurs, 0);
    expect(totalZones).toBe(vue.abonnements.collecteurs_total);
  });

  it('8. compte les paliers sans jamais nommer un prix', () => {
    // La fonction SQL ne connaît aucun montant : c'est l'Edge Function qui
    // applique la grille tarifaire, engendrée depuis packages/core. Ce test fige
    // cette frontière — un `prix` qui apparaîtrait ici serait une troisième
    // copie des tarifs.
    const parPalier = vue.par_palier as Array<Record<string, unknown>>;

    expect(parPalier.length).toBeGreaterThan(0);
    for (const p of parPalier) {
      // Tri explicite : `jsonb_build_object` ne garantit pas l'ordre des clés au
      // retour, et le figer reviendrait à tester PostgreSQL plutôt que la vue.
      expect([...Object.keys(p)].sort()).toEqual(['actifs', 'palier', 'total']);
    }

    // Le palier de A est `pro` et son abonnement est actif : il doit être compté
    // au moins une fois. « Au moins », parce que d'autres exécutions ont pu en
    // laisser d'autres — voir la note en tête de fichier.
    const pro = parPalier.find((p) => p.palier === 'pro');
    expect(pro).toBeDefined();
    expect(pro!.actifs as number).toBeGreaterThanOrEqual(1);
  });

  it('9. rend les mouvements du plus récent au plus ancien, restitutions en négatif', () => {
    const mouvements = vue.mouvements as Array<{ type: string; montant: number }>;

    expect(mouvements.length).toBeGreaterThanOrEqual(2);
    expect(mouvements.map((m) => m.type)).toContain('commission');
    expect(mouvements.map((m) => m.type)).toContain('mise');

    const dates = mouvements.map((m) => new Date((m as unknown as { survenu_le: string }).survenu_le).getTime());
    expect([...dates].sort((x, y) => y - x)).toEqual(dates);
  });

  it('10. fait tenir les totaux avec la somme des lignes', () => {
    // Le tableau de bord affiche un total et une liste. S'ils divergent,
    // personne ne saura lequel croire.
    const lignes = vue.collecteurs as Array<{ encaisse: number; clients: number }>;
    const sommeEncaisse = lignes.reduce((s, l) => s + l.encaisse, 0);
    const sommeClients = lignes.reduce((s, l) => s + l.clients, 0);

    expect(vue.totaux.total_encaisse).toBe(sommeEncaisse);
    expect(vue.totaux.clients).toBe(sommeClients);
    expect(vue.totaux.encours_clients).toBe(
      vue.totaux.total_encaisse - vue.totaux.commissions - vue.totaux.restitutions,
    );
  });
});
