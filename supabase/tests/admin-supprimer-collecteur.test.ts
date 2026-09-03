import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

/**
 * `admin-supprimer-collecteur` — ce que la fonction dit quand elle refuse.
 *
 * La base refuserait de toute façon : `mises`, `retraits` et, depuis la
 * tâche 2, `paiements_abonnement` référencent le collecteur en `on delete
 * restrict`. Ce que la fonction ajoute, c'est de dire **pourquoi** avec un
 * nombre, au lieu de laisser remonter une violation de clé étrangère que
 * personne ne sait lire.
 *
 * Le cas du paiement mérite son propre code : le remède n'est pas le même. Un
 * compte qui a encaissé porte l'argent de ses clients ; un compte qui a payé
 * porte une écriture comptable de GTCS. On ne suspend pas un abonnement pour
 * effacer une facture.
 */

const BASE = `${process.env.SUPABASE_URL}/functions/v1/admin-supprimer-collecteur`;

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

async function appeler(jeton: string, collecteurId: string): Promise<Response> {
  return fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: JSON.stringify({ collecteurId }),
  });
}

async function jetonDe(collecteur: CollecteurTest): Promise<string> {
  const { data } = await collecteur.client.auth.getSession();
  return data.session!.access_token;
}

/** Un compte inscrit aux admins, seul habilité à franchir le portillon. */
async function administrateur(nom: string): Promise<CollecteurTest> {
  const compte = await creerCollecteur(nom, telephone());
  const { error } = await admin.from('admins').insert({ user_id: compte.id });
  expect(error).toBeNull();
  return compte;
}

async function poserPaiement(collecteurId: string) {
  const { error } = await admin.from('paiements_abonnement').insert({
    collecteur_id: collecteurId,
    palier: 'pro',
    vente_id: `vente-suppr-${crypto.randomUUID()}`,
    montant: 5000,
    devise: 'XOF',
    echeance_avant: '2026-01-01',
  });
  if (error) throw error;
}

describe('admin-supprimer-collecteur', () => {
  it('refuse un collecteur qui a réglé un abonnement, et compte les règlements', async () => {
    const gtcs = await administrateur('GTCS Suppression');
    const payeur = await creerCollecteur('A Paye', telephone());
    await poserPaiement(payeur.id);

    const reponse = await appeler(await jetonDe(gtcs), payeur.id);

    expect(reponse.status).toBe(409);
    const corps = await reponse.json();
    expect(corps.erreur).toBe('COMPTE_A_PAYE');
    expect(corps.paiements).toBe(1);

    // Et le compte est toujours là : le refus précède la suppression, il ne la
    // rattrape pas.
    const { data } = await admin.from('collecteurs').select('id').eq('id', payeur.id).single();
    expect(data?.id).toBe(payeur.id);
  });

  it('supprime un collecteur qui n’a ni encaissé ni payé', async () => {
    // Le contrôle négatif. Sans lui, un comptage qui refuserait tout le monde
    // passerait pour un succès — le test précédent ne verrait pas la
    // différence.
    const gtcs = await administrateur('GTCS Suppression Nette');
    const neuf = await creerCollecteur('Rien A Son Nom', telephone());

    const reponse = await appeler(await jetonDe(gtcs), neuf.id);

    expect(reponse.status).toBe(200);

    const { data } = await admin.from('collecteurs').select('id').eq('id', neuf.id).maybeSingle();
    expect(data).toBeNull();
  });
});
