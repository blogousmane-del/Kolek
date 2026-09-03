import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  JOURS_RATTRAPAGE,
  chargerPaiementsRattrapables,
  creerDepot,
  creerVenteChariow,
  lireVenteChariow,
} from '../functions/_shared/depot-chariow';
import { couperNom } from '../functions/_shared/chariow';
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

  const charger = (id: string) => chargerPaiementsRattrapables(admin as never, { collecteur: id });

  const demandesPosees: string[] = [];

  beforeAll(async () => {
    alice = await creerCollecteur('Alice Rattrapage', telephone());
    bob = await creerCollecteur('Bob Rattrapage', telephone());
  });

  afterAll(async () => {
    // `demande_id` est en `on delete restrict` : le paiement part d'abord. Et la
    // demande n'appartient à aucun compte, donc `nettoyer` ne la voit pas.
    for (const id of demandesPosees.splice(0)) {
      await admin.from('paiements_abonnement').delete().eq('demande_id', id);
      await admin.from('demandes_ouverture').delete().eq('id', id);
    }
    await nettoyer();
  });

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

  it('sert aussi une demande, dont le paiement précède le compte', async () => {
    // Le chemin du prospect : il paie avant d'avoir un compte, donc son paiement
    // ne porte aucun `collecteur_id`. Filtrer sur cette seule colonne
    // laisserait le webhook les yeux fermés sur la moitié des règlements — la
    // moitié qui fait naître les comptes.
    const { data: demande, error } = await admin
      .from('demandes_ouverture')
      .insert({ nom: 'Prospect Rattrapage', telephone: telephone(), email: 'prospect@example.ci', palier: 'pro' })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    const demandeId = (demande as { id: string }).id;
    demandesPosees.push(demandeId);

    const id = await poser(null as never, { demande_id: demandeId });

    const lot = await chargerPaiementsRattrapables(admin as never, { demande: demandeId });

    expect(lot.map((p) => p.id)).toEqual([id]);
    expect(lot[0]).toMatchObject({ collecteur_id: null, demande_id: demandeId });
    // Et il ne se laisse pas prendre pour un paiement de compte : une cible
    // mal branchée qui filtrerait toujours sur `collecteur_id` rendrait ici la
    // liste entière des paiements sans compte, pas celle-ci.
    expect(await charger(alice.id)).not.toContainEqual(expect.objectContaining({ id }));
  });
});

describe('creerVenteChariow', () => {
  const SAISIE = {
    produitId: 'prod_pro',
    email: 'mariam@example.ci',
    prenom: 'Mariam',
    nomFamille: 'Koné',
    telephone: { number: '0701020304', country_code: 'CI' },
    urlRetour: 'https://app.kolek.cash/?paiement=retour',
    metadonnees: { palier: 'pro' },
  };

  function repondre(corps: unknown, statut = 200): Response {
    return new Response(JSON.stringify(corps), {
      status: statut,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const COMPLETE = {
    data: {
      purchase: { id: 'v_42', amount: { value: 5000, currency: 'xof' } },
      payment: { checkout_url: 'https://pay.chariow.test/v_42' },
    },
  };

  it('n’envoie aucun montant — c’est la boutique qui décide du débit', async () => {
    // La propriété centrale du dispositif. Si un montant partait d'ici, il
    // suffirait d'un appelant fautif pour vendre un abonnement à un franc.
    const appel = vi.fn(async () => repondre(COMPLETE));
    vi.stubGlobal('fetch', appel);

    await creerVenteChariow(SAISIE, OPTIONS);

    const corps = JSON.parse((appel.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(corps).toMatchObject({ product_id: 'prod_pro' });
    expect(Object.keys(corps)).not.toContain('amount');
    expect(Object.keys(corps)).not.toContain('price');
    expect(JSON.stringify(corps)).not.toMatch(/\b5000\b/);
  });

  it('rend le montant et la devise de la réponse, normalisés', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => repondre(COMPLETE)));

    const issue = await creerVenteChariow(SAISIE, OPTIONS);

    expect(issue).toEqual({
      ok: true,
      venteId: 'v_42',
      checkoutUrl: 'https://pay.chariow.test/v_42',
      montant: 5000,
      devise: 'XOF',
    });
  });

  it('n’ajoute un code de remise que s’il y en a un', async () => {
    // Chariow valide la **présence** de la clé, pas seulement sa valeur : un
    // `discount_code: null` fait répondre 422 à une vente irréprochable.
    const appel = vi.fn(async () => repondre(COMPLETE));
    vi.stubGlobal('fetch', appel);

    await creerVenteChariow({ ...SAISIE, codeRemise: null }, OPTIONS);
    let corps = JSON.parse((appel.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(Object.keys(corps)).not.toContain('discount_code');

    await creerVenteChariow({ ...SAISIE, codeRemise: 'RENTREE20' }, OPTIONS);
    corps = JSON.parse((appel.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(corps.discount_code).toBe('RENTREE20');
  });

  it('distingue une saisie refusée d’une panne du fournisseur', async () => {
    // 422 est le seul cas que celui qui paie puisse corriger lui-même. Les
    // confondre l'enverrait relire une saisie irréprochable.
    vi.stubGlobal('fetch', vi.fn(async () => repondre({ message: 'invalid phone' }, 422)));
    expect(await creerVenteChariow(SAISIE, OPTIONS)).toMatchObject({
      ok: false,
      erreur: 'SAISIE_REFUSEE',
      statut: 400,
    });

    vi.stubGlobal('fetch', vi.fn(async () => repondre({}, 500)));
    expect(await creerVenteChariow(SAISIE, OPTIONS)).toMatchObject({
      ok: false,
      erreur: 'CHECKOUT_IMPOSSIBLE',
      statut: 502,
    });
  });

  it('ne rend jamais de lien sur une réponse incomplète', async () => {
    // Ce que ce test empêche : envoyer quelqu'un vers une page qui n'existe
    // pas, ou enregistrer une vente qu'on ne saurait rattacher à personne.
    const incompletes = [
      { data: { purchase: { id: 'v_42', amount: { value: 5000, currency: 'XOF' } } } },
      { data: { payment: { checkout_url: 'https://pay.chariow.test/v_42' } } },
      {
        data: {
          purchase: { id: '', amount: { value: 5000, currency: 'XOF' } },
          payment: { checkout_url: 'https://pay.chariow.test/v_42' },
        },
      },
      {
        data: {
          purchase: { id: 'v_42', amount: { value: 'cinq mille', currency: 'XOF' } },
          payment: { checkout_url: 'https://pay.chariow.test/v_42' },
        },
      },
      {
        data: {
          purchase: { id: 'v_42', amount: { value: 5000 } },
          payment: { checkout_url: 'https://pay.chariow.test/v_42' },
        },
      },
    ];

    for (const corps of incompletes) {
      vi.stubGlobal('fetch', vi.fn(async () => repondre(corps)));
      const issue = await creerVenteChariow(SAISIE, OPTIONS);
      expect(issue).toMatchObject({ ok: false, erreur: 'CHECKOUT_INCOMPLET', statut: 502 });
      expect(JSON.stringify(issue)).not.toContain('pay.chariow.test');
    }
  });

  it('traite un corps illisible comme une réponse incomplète', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 200 })));

    expect(await creerVenteChariow(SAISIE, OPTIONS)).toMatchObject({
      ok: false,
      erreur: 'CHECKOUT_INCOMPLET',
    });
  });

  it('rend un refus plutôt que de lever quand le réseau tombe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      }),
    );

    expect(await creerVenteChariow(SAISIE, OPTIONS)).toMatchObject({
      ok: false,
      erreur: 'CHECKOUT_IMPOSSIBLE',
      statut: 502,
    });
  });
});

describe('couperNom', () => {
  it('coupe au premier espace', () => {
    expect(couperNom('Mariam Koné')).toEqual({ prenom: 'Mariam', nomFamille: 'Koné' });
    expect(couperNom('Awa Konan Yao')).toEqual({ prenom: 'Awa', nomFamille: 'Konan Yao' });
  });

  it('replie plutôt que de refuser un nom d’un seul mot', () => {
    // Quelqu'un enregistré sous un seul mot ne doit pas être empêché de payer
    // parce qu'un fournisseur veut deux cases.
    expect(couperNom('Adama')).toEqual({ prenom: 'Adama', nomFamille: 'Kolek' });
    expect(couperNom('   ')).toEqual({ prenom: 'Collecteur', nomFamille: 'Kolek' });
    expect(couperNom('')).toEqual({ prenom: 'Collecteur', nomFamille: 'Kolek' });
  });

  it('ne laisse pas des espaces multiples fabriquer un nom vide', () => {
    expect(couperNom('  Mariam    Koné  ')).toEqual({ prenom: 'Mariam', nomFamille: 'Koné' });
  });
});
