import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  JOURS_RATTRAPAGE,
  chargerPaiementsRattrapables,
  creerDepot,
  lireVenteChariow,
} from '../functions/_shared/depot-chariow';
import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * L'adaptateur : Chariow d'un côté, la base de l'autre.
 *
 * `reconciliation.ts` décide, celui-ci traduit. Une traduction fausse ne se voit
 * pas — elle ne lève pas, elle ne casse aucun écran ; elle fait simplement
 * qu'un paiement réglé se lit « en attente », et personne ne l'apprend avant que
 * le collecteur ne réclame l'abonnement qu'il a payé.
 *
 * D'où les trois choses mesurées ici, et pas davantage :
 *
 * 1. **Les noms de date.** Chariow dit `settled_at`, `paid_at` ou
 *    `completed_at` selon la version. Se tromper de nom rend `regleLe: null`, et
 *    `reconcilier` repart alors sur `cree_le` — une échéance décalée, jamais une
 *    erreur.
 * 2. **La fenêtre de rattrapage et les colonnes lues.** `remise_pct` absent, et
 *    le contrôle de grille crie à chaque paiement remisé ; `collecteur_id` ou
 *    `demande_id` absents, et la réconciliation ne sait plus à qui créditer.
 * 3. **Le refus d'ouvrir un compte par défaut.** C'est une propriété de
 *    sécurité : ouvrir un compte est irréversible.
 */

const OPTIONS = { racine: 'https://api.chariow.test/v1', cleApi: 'cle-de-test' };

/** Une réponse Chariow, dans la forme réelle : tout est sous `data`. */
function reponseVente(vente: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ data: vente }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lireVenteChariow', () => {
  it('accepte les trois noms de date, dans l’ordre de préséance', async () => {
    const cas: Array<[Record<string, unknown>, string | null]> = [
      [{ settled_at: '2026-09-01T10:00:00Z' }, '2026-09-01T10:00:00Z'],
      [{ paid_at: '2026-09-02T10:00:00Z' }, '2026-09-02T10:00:00Z'],
      [{ completed_at: '2026-09-03T10:00:00Z' }, '2026-09-03T10:00:00Z'],
      // Deux noms présents : le premier de la liste gagne, sans quoi le même
      // règlement porterait deux dates selon la version de la boutique.
      [{ settled_at: '2026-09-01T10:00:00Z', paid_at: '2026-09-02T10:00:00Z' },
        '2026-09-01T10:00:00Z'],
      // Aucun : `reconcilier` repartira sur `cree_le`, jamais sur `now()`.
      [{ status: 'settled' }, null],
      // Chaîne vide : présente mais inutilisable. La traiter comme une date
      // écrirait une échéance à partir de rien.
      [{ settled_at: '' }, null],
    ];

    for (const [vente, attendu] of cas) {
      vi.stubGlobal('fetch', vi.fn(async () => reponseVente(vente)));
      expect((await lireVenteChariow('v1', OPTIONS)).regleLe).toBe(attendu);
    }
  });

  it('n’appelle que l’hôte d’API, avec la clé en porteur', async () => {
    const appel = vi.fn(async () => reponseVente({ status: 'settled' }));
    vi.stubGlobal('fetch', appel);

    await lireVenteChariow('vente/à échapper', OPTIONS);

    const [adresse, reglages] = appel.mock.calls[0] as [string, RequestInit];
    // L'identifiant est échappé : un identifiant portant une barre oblique
    // atteindrait sinon une autre route de l'API.
    expect(adresse).toBe('https://api.chariow.test/v1/sales/vente%2F%C3%A0%20%C3%A9chapper');
    expect((reglages.headers as Record<string, string>).Authorization).toBe('Bearer cle-de-test');
  });

  it('remonte le statut HTTP dans l’erreur, plutôt qu’un échec anonyme', async () => {
    // `reconcilier` journalise ce message sans créditer. Un 404 — vente
    // inconnue — et un 500 — Chariow en panne — se corrigent à des endroits
    // opposés, et la ligne du journal est tout ce qu'on aura.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    await expect(lireVenteChariow('v1', OPTIONS)).rejects.toThrow('HTTP_404');
  });

  it('normalise la devise et rend un statut vide plutôt qu’absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => reponseVente({ amount: { value: 5000, currency: 'xof' } })),
    );

    const vente = await lireVenteChariow('v1', OPTIONS);

    expect(vente).toMatchObject({ montant: 5000, devise: 'XOF' });
    // Pas `null` : `mapperStatut('')` range en « en attente », le seul verdict
    // sûr pour une réponse qu'on n'a pas comprise. Un défaut « réglé » aurait
    // crédité sur un corps illisible.
    expect(vente.statut).toBe('');
  });
});

describe('le dépôt n’ouvre pas de compte par défaut', () => {
  it('refuse, plutôt que de créer un compte sur un chemin non prévu pour ça', async () => {
    // La propriété qui protège `abonnement-verifier` : cette route réconcilie
    // les paiements du collecteur connecté et n'a aucune raison de faire naître
    // un compte. `reconcilier` rattrape ce refus, l'écrit et ne crédite pas.
    const depot = creerDepot(null as never, OPTIONS);

    await expect(
      depot.ouvrirCompte({
        id: 'p1',
        palier: 'pro',
        vente_id: 'v1',
        montant: 5000,
        devise: 'XOF',
        remise_pct: 0,
        collecteur_id: null,
        demande_id: 'd1',
        cree_le: '2026-09-01T10:00:00Z',
      }),
    ).rejects.toThrow('OUVERTURE_HORS_CONTEXTE');
  });

  it('emploie la stratégie qu’on lui donne quand on lui en donne une', async () => {
    const depot = creerDepot(null as never, OPTIONS, async () => 'compte-neuf');

    await expect(depot.ouvrirCompte({ demande_id: 'd1' } as never)).resolves.toBe('compte-neuf');
  });
});

describe('chargerPaiementsRattrapables', () => {
  const SERIE = String(Date.now()).slice(-7);
  let compteur = 0;
  let alice: CollecteurTest;
  let bob: CollecteurTest;

  function telephone(): string {
    compteur += 1;
    return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
  }

  async function poser(
    collecteurId: string,
    champs: Record<string, unknown> = {},
  ): Promise<string> {
    const { data, error } = await admin
      .from('paiements_abonnement')
      .insert({
        collecteur_id: collecteurId,
        palier: 'pro',
        vente_id: `v-${crypto.randomUUID()}`,
        montant: 5000,
        devise: 'XOF',
        echeance_avant: '2026-01-01',
        ...champs,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return (data as { id: string }).id;
  }

  const charger = (id: string) =>
    chargerPaiementsRattrapables(admin as never, id);

  beforeAll(async () => {
    alice = await creerCollecteur('Alice Rattrapage', telephone());
    bob = await creerCollecteur('Bob Rattrapage', telephone());
  });

  afterAll(nettoyer);

  it('rend en attente et échoué, jamais réglé ni abandonné', async () => {
    const attente = await poser(alice.id);
    const echoue = await poser(alice.id);
    const abandonne = await poser(alice.id);
    await admin.from('paiements_abonnement').update({ statut: 'echoue' }).eq('id', echoue);
    await admin.from('paiements_abonnement').update({ statut: 'abandonne' }).eq('id', abandonne);

    const lot = await charger(alice.id);

    expect(lot.map((p) => p.id).sort()).toEqual([attente, echoue].sort());
  });

  it('ne franchit pas la frontière d’un autre collecteur', async () => {
    await poser(bob.id);

    const lot = await charger(alice.id);

    expect(lot.every((p) => p.collecteur_id === alice.id)).toBe(true);
  });

  it('porte remise_pct, collecteur_id et demande_id', async () => {
    // Les trois colonnes que la version d'origine de ce fichier oubliait. Sans
    // `remise_pct`, le contrôle de grille de `reconcilier` écrit une anomalie à
    // chaque paiement remisé — et la vraie divergence de boutique se perd dans
    // un bruit qu'on aura appris à ignorer.
    const id = await poser(bob.id, { remise_pct: 20 });

    const ligne = (await charger(bob.id)).find((p) => p.id === id);

    expect(ligne).toMatchObject({ remise_pct: 20, collecteur_id: bob.id, demande_id: null });
    // Nombres, pas chaînes : PostgREST rend `numeric` en texte, et
    // `montantCoherent` comparerait alors une chaîne à un nombre — toujours
    // différents, donc jamais crédité.
    expect(typeof ligne?.montant).toBe('number');
    expect(typeof ligne?.remise_pct).toBe('number');
  });

  it('oublie ce qui a dépassé la fenêtre de quatorze jours', async () => {
    // La date se pose à l'insertion : `cree_le` est figée par le déclencheur
    // `paiements_immuables`, au même titre que la vente et le palier.
    const veille = new Date(Date.now() - (JOURS_RATTRAPAGE + 1) * 86_400_000).toISOString();
    const vieux = await poser(alice.id, { cree_le: veille });
    const recent = await poser(alice.id);

    const lot = (await charger(alice.id)).map((p) => p.id);

    expect(lot).not.toContain(vieux);
    // La borne mord dans un sens seulement : sans cette seconde assertion, une
    // fenêtre réglée à zéro jour passerait ce test.
    expect(lot).toContain(recent);
  });
});
