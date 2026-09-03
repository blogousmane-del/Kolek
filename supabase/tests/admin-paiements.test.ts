import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

/**
 * `admin_paiements_recents()` — ce que l'administration voit de l'argent entré.
 *
 * Fonction séparée de `admin_vue_globale()`, qui fait déjà trois cents lignes.
 * Elle traverse toutes les lignes de `paiements_abonnement`, ce qu'aucune
 * politique RLS n'accorde : elle est donc `security definer`, et le seul
 * garde-fou qui vaille est le retrait d'`EXECUTE` à `authenticated`.
 *
 * Les totaux de cette fonction sont **globaux**. Les autres fichiers de la
 * suite laissent des règlements derrière eux, donc rien ici n'affirme une
 * valeur absolue : on mesure un écart avant/après. `fileParallelism: false`
 * rend cet écart déterministe.
 */

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

interface Recents {
  total_30j: number;
  nombre_30j: number;
  par_collecteur: Array<{
    collecteur_id: string;
    dernier_le: string;
    dernier_montant: number;
    derniere_devise: string;
  }>;
}

async function lire(): Promise<Recents> {
  const { data, error } = await admin.rpc('admin_paiements_recents');
  if (error) throw error;
  return data as Recents;
}

function ilYAJours(jours: number): string {
  return new Date(Date.now() - jours * 24 * 3600 * 1000).toISOString();
}

/** Un règlement déjà crédité, posé directement : cette suite lit, elle ne crédite pas. */
async function poserRegle(collecteurId: string, montant: number, regleLe: string) {
  const { error } = await admin.from('paiements_abonnement').insert({
    collecteur_id: collecteurId,
    palier: 'pro',
    vente_id: `vente-recents-${crypto.randomUUID()}`,
    montant,
    devise: 'XOF',
    echeance_avant: '2026-01-01',
    statut: 'regle',
    regle_le: regleLe,
    echeance_apres: '2026-02-01',
  });
  if (error) throw error;
}

let zoe: CollecteurTest;

beforeAll(async () => {
  zoe = await creerCollecteur('Zoe Paiements', telephone());
});

describe('admin_paiements_recents — les droits', () => {
  it('refuse un collecteur authentifié', async () => {
    // Sans le `revoke ... from public` de la migration, `authenticated`
    // hériterait de l'exécution par défaut, et ce seul appel rendrait à
    // n'importe quel collecteur les règlements de tous les autres.
    const { error } = await zoe.client.rpc('admin_paiements_recents');

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('refuse le rôle anonyme', async () => {
    const { error } = await anonyme.rpc('admin_paiements_recents');

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });
});

describe('admin_paiements_recents — ce qu’elle compte', () => {
  it('ajoute au total des trente jours un règlement récent', async () => {
    const avant = await lire();
    await poserRegle(zoe.id, 5000, ilYAJours(10));
    const apres = await lire();

    expect(Number(apres.total_30j) - Number(avant.total_30j)).toBe(5000);
    expect(apres.nombre_30j - avant.nombre_30j).toBe(1);
  });

  it('laisse hors du total un règlement plus vieux que trente jours', async () => {
    // La borne est la seule raison d'être du champ : un total « depuis
    // toujours » ne dirait rien du mois en cours.
    const vieux = await creerCollecteur('Vieux Reglement', telephone());
    const avant = await lire();
    await poserRegle(vieux.id, 7000, ilYAJours(40));
    const apres = await lire();

    expect(Number(apres.total_30j)).toBe(Number(avant.total_30j));
    expect(apres.nombre_30j).toBe(avant.nombre_30j);
  });

  it('ne retient qu’un règlement par collecteur, le plus récent', async () => {
    const client = await creerCollecteur('Deux Reglements', telephone());
    await poserRegle(client.id, 5000, ilYAJours(60));
    await poserRegle(client.id, 10000, ilYAJours(5));

    const ligne = (await lire()).par_collecteur.find((p) => p.collecteur_id === client.id);

    expect(ligne).toBeDefined();
    expect(Number(ligne!.dernier_montant)).toBe(10000);
    expect(ligne!.derniere_devise).toBe('XOF');
  });

  it('garde un collecteur dont le seul règlement est ancien', async () => {
    // Hors du total des trente jours, mais toujours dans la colonne « dernier
    // paiement » : « jamais payé » et « payé il y a six semaines » ne se
    // traitent pas pareil.
    const ancien = await creerCollecteur('Ancien Payeur', telephone());
    await poserRegle(ancien.id, 2500, ilYAJours(45));

    const ligne = (await lire()).par_collecteur.find((p) => p.collecteur_id === ancien.id);

    expect(ligne).toBeDefined();
    expect(Number(ligne!.dernier_montant)).toBe(2500);
  });

  it('ignore un paiement qui n’est pas réglé', async () => {
    // Une intention de payer n'est pas un paiement. Sans ce filtre, un
    // checkout abandonné apparaîtrait comme une facture honorée.
    const attente = await creerCollecteur('En Attente', telephone());
    const { error } = await admin.from('paiements_abonnement').insert({
      collecteur_id: attente.id,
      palier: 'pro',
      vente_id: `vente-attente-${crypto.randomUUID()}`,
      montant: 5000,
      devise: 'XOF',
      echeance_avant: '2026-01-01',
    });
    expect(error).toBeNull();

    const ligne = (await lire()).par_collecteur.find((p) => p.collecteur_id === attente.id);
    expect(ligne).toBeUndefined();
  });

  it('n’invente pas de ligne pour un paiement sans compte', async () => {
    // Depuis « payer vaut accord », un règlement peut porter une demande et pas
    // encore de collecteur. Une entrée à `collecteur_id` nul ne correspondrait
    // à aucune ligne de l'écran.
    const { data: demande, error: erreurDemande } = await admin
      .from('demandes_ouverture')
      .insert({
        nom: 'Prospect Recents',
        telephone: telephone(),
        palier: 'pro',
        email: `${crypto.randomUUID()}@kolek.test`,
      })
      .select('id')
      .single();
    expect(erreurDemande).toBeNull();

    const { error } = await admin.from('paiements_abonnement').insert({
      demande_id: demande!.id,
      palier: 'pro',
      vente_id: `vente-prospect-${crypto.randomUUID()}`,
      montant: 5000,
      devise: 'XOF',
      echeance_avant: '2026-01-01',
      statut: 'regle',
      regle_le: ilYAJours(3),
      echeance_apres: '2026-02-01',
    });
    expect(error).toBeNull();

    const sansCompte = (await lire()).par_collecteur.filter((p) => p.collecteur_id === null);
    expect(sansCompte).toEqual([]);
  });
});
