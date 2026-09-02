import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le registre des paiements d'abonnement.
 *
 * Ce que ces tests protègent tient en une phrase : **un abonnement ne
 * s'obtient qu'en payant, et un paiement ne se crédite qu'une fois.** Le reste
 * — l'isolation, l'immuabilité — est le socle habituel du dépôt, appliqué à une
 * table qui porte de l'argent.
 */

/**
 * Un téléphone unique, dans cette exécution comme entre deux exécutions.
 *
 * `collecteurs.telephone` est unique en base, et une collision ne se présente
 * pas comme une collision : le déclencheur `creer_collecteur_apres_signup`
 * échoue, et GoTrue rend « Database error creating new user ». Le plan écrivait
 * `Date.now() % 1000`, qui repasse par les mêmes mille valeurs chaque seconde ;
 * l'horodatage et un compteur, ensemble, ne se répètent pas.
 */
const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

let alice: CollecteurTest;
let bob: CollecteurTest;

/** Insère un paiement en attente, à la clé de service. */
async function poserPaiement(collecteurId: string, venteId: string, montant = 5000) {
  const { data, error } = await admin
    .from('paiements_abonnement')
    .insert({
      collecteur_id: collecteurId,
      palier: 'pro',
      vente_id: venteId,
      montant,
      devise: 'XOF',
      echeance_avant: '2026-01-01',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  alice = await creerCollecteur('Alice Paiement', telephone());
  bob = await creerCollecteur('Bob Paiement', telephone());
});

afterAll(async () => {
  await nettoyer();
});

describe('isolation', () => {
  it('un collecteur ne voit que ses propres paiements', async () => {
    await poserPaiement(alice.id, `vente-iso-${crypto.randomUUID()}`);

    const mien = await alice.client.from('paiements_abonnement').select('id');
    const autre = await bob.client.from('paiements_abonnement').select('id');

    expect(mien.error).toBeNull();
    expect(mien.data?.length).toBeGreaterThan(0);
    // Invisible, pas refusé : distinguer les deux dirait à Bob que la ligne existe.
    expect(autre.error).toBeNull();
    expect(autre.data).toEqual([]);
  });

  it('le rôle anonyme ne lit rien', async () => {
    const { error } = await anonyme.from('paiements_abonnement').select('id');
    expect(error).not.toBeNull();
  });

  it('un collecteur ne peut pas écrire son propre paiement', async () => {
    const { error } = await alice.client.from('paiements_abonnement').insert({
      collecteur_id: alice.id,
      palier: 'pro',
      vente_id: 'forge',
      montant: 5000,
      devise: 'XOF',
      echeance_avant: '2026-01-01',
    });
    expect(error).not.toBeNull();
  });
});

describe('immuabilité', () => {
  it('refuse la suppression, même à la clé de service', async () => {
    const id = await poserPaiement(alice.id, `vente-del-${crypto.randomUUID()}`);
    const { error } = await admin.from('paiements_abonnement').delete().eq('id', id);
    expect(error?.message).toContain('PAIEMENT_IMMUABLE');
  });

  it('refuse de rouvrir un paiement réglé', async () => {
    const id = await poserPaiement(alice.id, `vente-fig-${crypto.randomUUID()}`);
    await admin.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });

    const { error } = await admin
      .from('paiements_abonnement')
      .update({ statut: 'echoue' })
      .eq('id', id);
    expect(error?.message).toContain('PAIEMENT_TERMINAL');
  });

  it('autorise en revanche echoue → regle : c’est la fenêtre de rattrapage', async () => {
    const id = await poserPaiement(alice.id, `vente-ratt-${crypto.randomUUID()}`);
    await admin.from('paiements_abonnement').update({ statut: 'echoue' }).eq('id', id);

    const { data, error } = await admin.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });
    expect(error).toBeNull();
    expect(data?.[0]?.credite).toBe(true);
  });

  it('refuse de changer le collecteur pendant la transition', async () => {
    const id = await poserPaiement(alice.id, `vente-vol-${crypto.randomUUID()}`);
    const { error } = await admin
      .from('paiements_abonnement')
      .update({ collecteur_id: bob.id })
      .eq('id', id);
    expect(error?.message).toContain('PAIEMENT_IDENTITE_FIGEE');
  });
});

describe('crediter_abonnement', () => {
  it('crédite une fois, et une seule', async () => {
    const id = await poserPaiement(bob.id, `vente-idem-${crypto.randomUUID()}`);

    const premier = await admin.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });
    const second = await admin.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });

    expect(premier.data?.[0]?.credite).toBe(true);
    expect(second.data?.[0]?.credite).toBe(false);

    const { data } = await admin
      .from('collecteurs')
      .select('palier, abonnement_statut, abonnement_echeance')
      .eq('id', bob.id)
      .single();
    expect(data?.palier).toBe('pro');
    expect(data?.abonnement_statut).toBe('actif');
    // L'échéance du second appel doit être la même que celle du premier.
    expect(data?.abonnement_echeance).toBe(premier.data?.[0]?.echeance);
  });

  it('repart d’aujourd’hui quand l’échéance est passée', async () => {
    const retardataire = await creerCollecteur('Retard', telephone());
    await admin
      .from('collecteurs')
      .update({ abonnement_echeance: '2020-01-01' })
      .eq('id', retardataire.id);

    const id = await poserPaiement(retardataire.id, `vente-retard-${crypto.randomUUID()}`);
    const { data } = await admin.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });

    const attendu = new Date();
    attendu.setUTCDate(attendu.getUTCDate() + 30);
    // Sans le `greatest`, il aurait acheté du passé : 2020-01-31.
    expect(data?.[0]?.echeance).toBe(attendu.toISOString().slice(0, 10));
  });

  it('prolonge à partir de l’échéance quand elle est à venir', async () => {
    const enAvance = await creerCollecteur('Avance', telephone());
    await admin
      .from('collecteurs')
      .update({ abonnement_echeance: '2099-01-01' })
      .eq('id', enAvance.id);

    const id = await poserPaiement(enAvance.id, `vente-avance-${crypto.randomUUID()}`);
    const { data } = await admin.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });
    expect(data?.[0]?.echeance).toBe('2099-01-31');
  });

  it('n’est pas exécutable par un collecteur', async () => {
    const id = await poserPaiement(alice.id, `vente-priv-${crypto.randomUUID()}`);
    const { error } = await alice.client.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });
    expect(error).not.toBeNull();
  });
});

describe('contraintes', () => {
  it('refuse deux paiements pour la même vente', async () => {
    const vente = `vente-double-${crypto.randomUUID()}`;
    await poserPaiement(alice.id, vente);
    const { error } = await admin.from('paiements_abonnement').insert({
      collecteur_id: alice.id,
      palier: 'pro',
      vente_id: vente,
      montant: 5000,
      devise: 'XOF',
      echeance_avant: '2026-01-01',
    });
    expect(error?.code).toBe('23505');
  });

  it('refuse un palier qui ne se vend pas', async () => {
    const { error } = await admin.from('paiements_abonnement').insert({
      collecteur_id: alice.id,
      palier: 'essai',
      vente_id: `vente-essai-${crypto.randomUUID()}`,
      montant: 0,
      devise: 'XOF',
      echeance_avant: '2026-01-01',
    });
    expect(error?.code).toBe('23514');
  });

  it('journalise chaque écriture', async () => {
    const vente = `vente-journal-${crypto.randomUUID()}`;
    await poserPaiement(alice.id, vente);

    const { data } = await admin
      .from('audit_log')
      .select('table_cible, action')
      .eq('collecteur_id', alice.id)
      .eq('table_cible', 'paiements_abonnement');
    expect(data?.length).toBeGreaterThan(0);
  });
});
