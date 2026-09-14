import type { SupabaseClient } from '@supabase/supabase-js';

import { classer, type Classement, type ReponseServeur } from './classer';
import {
  chargeUtileDe,
  type Operation,
  type OperationCaisse,
  type OperationCarte,
  type OperationClientCarte,
  type OperationMise,
} from './modele';

/**
 * Envoyer une opération, et dire ce qu'il en est advenu.
 *
 * Chaque envoi est l'écriture d'aujourd'hui, colonne pour colonne (§5.5). Ce
 * module n'ajoute que trois choses :
 *
 * - **relire avant de conclure.** Un « déjà là » n'est cru qu'après relecture
 *   de la ligne par identifiant (§6.3). Un refus aussi : la ligne a pu arriver
 *   lors d'un envoi dont la réponse s'est perdue (précision 6 du plan) ;
 * - **la caisse en « dernière déclaration gagne »** (§6.4) ;
 * - **une réponse ne vaut preuve que sur son statut** : 201 pour une insertion,
 *   200 pour une relecture ou une mise à jour (voir `exigerCreation`).
 *
 * Il ne touche jamais au stockage : c'est le synchroniseur qui décide de ce que
 * l'issue fait à la file.
 */

export type Issue =
  | { issue: 'acceptee' }
  | { issue: 'refusee'; motif: string }
  | { issue: 'passager' }
  | { issue: 'session' }
  | { issue: 'inconnue' };

type Relecture = 'meme' | 'differente' | 'absente' | 'illisible';

/**
 * Une insertion ne prouve rien d'autre qu'un `201 Created`.
 *
 * postgrest-js 2.112.3 (`processResponse`) réécrit un 404 au corps vide en
 * `{ error: null, status: 204 }`, et un 404 au corps en tableau en
 * `{ error: null, status: 200 }`. Sans `.select()`, rien d'autre ne distingue ces
 * réponses d'une insertion réussie : les croire retirerait de la file une
 * opération qui n'est pas au serveur. Une réponse sans erreur et sans 201 devient
 * donc une erreur sans code : `classer` la range en `inconnu`, l'envoi est
 * retenté, et le rejeu tombe sur la clé si la ligne était arrivée.
 */
function exigerCreation(r: ReponseServeur): ReponseServeur {
  if (r.error || r.status === 201) return r;
  return { error: { code: '', message: `insertion sans preuve (statut ${r.status})` }, status: r.status };
}

async function relire(
  client: SupabaseClient,
  table: string,
  id: string,
  attendu: Record<string, unknown>,
): Promise<Relecture> {
  const { data, error, status } = await client
    .from(table)
    .select(Object.keys(attendu).join(', '))
    .eq('id', id)
    .maybeSingle();
  // Même piège qu'à l'insertion : une lecture ne vaut que sur 200 sans tableau.
  // Un 404 réécrit (204, ou 200 et un tableau) ne dit pas « absente ».
  if (error || status !== 200 || Array.isArray(data)) return 'illisible';
  if (!data) return 'absente';
  const ligne = data as unknown as Record<string, unknown>;
  return Object.entries(attendu).every(([colonne, valeur]) => ligne[colonne] === valeur)
    ? 'meme'
    : 'differente';
}

async function resoudre(c: Classement, relecture: () => Promise<Relecture>): Promise<Issue> {
  switch (c.cas) {
    case 'accepte':
      return { issue: 'acceptee' };
    case 'session':
      return { issue: 'session' };
    case 'passager':
      return { issue: 'passager' };
    case 'inconnu':
    case 'mettre_a_jour':
      return { issue: 'inconnue' };
    case 'deja_la': {
      const r = await relecture();
      if (r === 'meme') return { issue: 'acceptee' };
      if (r === 'illisible') return { issue: 'passager' };
      // Valeurs différentes, ou ligne que la session ne voit pas : ce n'est pas
      // notre opération, ou on ne peut pas le prouver. Consigner, jamais conclure.
      return { issue: 'refusee', motif: 'DOUBLON_INVERIFIABLE' };
    }
    case 'refus': {
      const r = await relecture();
      if (r === 'meme') return { issue: 'acceptee' };
      if (r === 'illisible') return { issue: 'passager' };
      return { issue: 'refusee', motif: c.motif };
    }
  }
}

async function envoyerMise(client: SupabaseClient, op: OperationMise): Promise<Issue> {
  const { id, carteId, montant, encaisseLe } = op.charge;
  const r = await client
    .from('mises')
    .insert({ id, collecteur_id: op.collecteurId, carte_id: carteId, montant, encaisse_le: encaisseLe });
  return resoudre(classer(exigerCreation(r), 'mise'), () => relire(client, 'mises', id, { carte_id: carteId, montant }));
}

async function envoyerClientCarte(
  client: SupabaseClient,
  op: OperationClientCarte,
  noterEtapes: (etapes: { client: boolean; carte: boolean }) => Promise<void>,
): Promise<Issue> {
  const { client: fiche, carte } = op.charge;
  let etapes = op.etapes;

  if (!etapes.client) {
    const r = await client.from('clients').insert({
      id: fiche.id,
      collecteur_id: op.collecteurId,
      nom: fiche.nom,
      telephone: fiche.telephone,
      marche: fiche.marche,
      activite: fiche.activite,
      avis_actifs: fiche.avisActifs,
    });
    // Relu par une colonne que rien ne modifie : le nom se corrige (administration,
    // autre appareil), et un nom changé ferait prendre pour refusée une
    // inscription arrivée. L'identifiant vient du téléphone et la ligne n'est
    // visible que pour ce collecteur : si elle existe, c'est la nôtre.
    const issue = await resoudre(classer(exigerCreation(r), 'client'), () =>
      relire(client, 'clients', fiche.id, { collecteur_id: op.collecteurId }),
    );
    if (issue.issue !== 'acceptee') return issue;
    etapes = { ...etapes, client: true };
    await noterEtapes(etapes);
  }

  if (!etapes.carte) {
    const r = await client
      .from('cartes')
      .insert({ id: carte.id, collecteur_id: op.collecteurId, client_id: fiche.id, mise: carte.mise });
    const issue = await resoudre(classer(exigerCreation(r), 'carte'), () =>
      relire(client, 'cartes', carte.id, { client_id: fiche.id, mise: carte.mise }),
    );
    if (issue.issue !== 'acceptee') return issue;
    etapes = { ...etapes, carte: true };
    await noterEtapes(etapes);
  }

  return { issue: 'acceptee' };
}

async function envoyerCarte(client: SupabaseClient, op: OperationCarte): Promise<Issue> {
  const { id, clientId, mise } = op.charge;
  const r = await client
    .from('cartes')
    .insert({ id, collecteur_id: op.collecteurId, client_id: clientId, mise });
  return resoudre(classer(exigerCreation(r), 'carte'), () =>
    relire(client, 'cartes', id, { client_id: clientId, mise }),
  );
}

async function envoyerCaisse(client: SupabaseClient, op: OperationCaisse): Promise<Issue> {
  const { id, date, cashDeclare } = op.charge;
  const r = await client
    .from('caisses_jour')
    .insert({ id, collecteur_id: op.collecteurId, date, cash_declare: cashDeclare });
  const c = classer(exigerCreation(r), 'caisse');
  if (c.cas === 'accepte') return { issue: 'acceptee' };

  // La fenêtre de 90 jours n'est appliquée qu'à l'insertion : une journée
  // ancienne dont la ligne existe se corrige encore (précision 7).
  const horsFenetre = c.cas === 'refus' && c.motif === 'DATE_INVALIDE';
  if (c.cas !== 'mettre_a_jour' && !horsFenetre) return resoudre(c, async () => 'absente');

  const u = await client
    .from('caisses_jour')
    .update({ cash_declare: cashDeclare })
    .eq('collecteur_id', op.collecteurId)
    .eq('date', date)
    .select('id');
  const cu = classer(u, 'caisse');
  if (cu.cas !== 'accepte') return resoudre(cu, async () => 'absente');
  // Même piège qu'à l'insertion : seul un 200 portant un tableau est un compte.
  if (u.status !== 200 || !Array.isArray(u.data)) return { issue: 'inconnue' };
  // Le `select` sert à compter : un `update` que RLS écarte répond sans erreur.
  if (u.data.length > 0) return { issue: 'acceptee' };
  return horsFenetre ? { issue: 'refusee', motif: 'DATE_INVALIDE' } : { issue: 'inconnue' };
}

export function envoyer(
  client: SupabaseClient,
  op: Operation,
  noterEtapes: (etapes: { client: boolean; carte: boolean }) => Promise<void>,
): Promise<Issue> {
  switch (op.type) {
    case 'mise':
      return envoyerMise(client, op);
    case 'client_carte':
      return envoyerClientCarte(client, op, noterEtapes);
    case 'carte':
      return envoyerCarte(client, op);
    case 'caisse':
      return envoyerCaisse(client, op);
  }
}

/**
 * Écrit le refus dans `synchro_rejets`, sous l'identifiant de l'opération :
 * un rejeu tombe sur la clé et se relit, il ne crée pas de seconde ligne.
 * `traite` n'est jamais écrit ici : il appartient au rattrapage (§6.5).
 */
export async function consigner(client: SupabaseClient, op: Operation): Promise<Issue> {
  const motif = op.motif ?? 'INCONNU';
  const r = await client.from('synchro_rejets').insert({
    id: op.id,
    collecteur_id: op.collecteurId,
    motif,
    charge_utile: chargeUtileDe(op),
  });
  return resoudre(classer(exigerCreation(r), 'consignation'), () =>
    relire(client, 'synchro_rejets', op.id, { motif }),
  );
}
