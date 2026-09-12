import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TAILLE_PAGE, type CleNavSuper } from '@kolek/ui';

import type { VueGlobale } from '../donnees';
import type { EtatSuperAdmin } from '../superadmin';

/**
 * La console de plateforme, découpée en cinq écrans.
 *
 * Chaque groupe de tests rend directement l'entrée concernée : la navigation a
 * quitté cet écran pour la barre latérale de la coquille. L'entrée par défaut —
 * « Abonnements » — montre les KPI financiers, les paliers et le tableau des
 * collecteurs ; les quatre autres reprennent le contenu existant.
 *
 * ## Ce que cet écran ne décide pas
 *
 * Rien. « Pas d'action sur soi-même », le quota d'un code, l'unicité du dernier
 * super admin : tout cela vit en SQL, sous verrou, et les deux Edge Functions
 * redemandent `est_super_admin()` avec le jeton de l'appelant. L'écran envoie
 * des demandes et affiche des verdicts.
 */

const agirSuperAdmin = vi.fn();
const chargerJournal = vi.fn();
const recharger = vi.fn();
const rechargerVue = vi.fn();
const utiliserEtat = vi.fn();

const modifierCollecteur = vi.fn();

// `../donnees` n'est pas remplacé en entier : `FicheModifiable` et le tableau
// des abonnés n'en tirent que cette écriture, et le reste du module — les types,
// les messages d'erreur — sert tel quel.
vi.mock('../donnees', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  modifierCollecteur: (...args: unknown[]) => modifierCollecteur(...args),
}));

vi.mock('../superadmin', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useEtatSuperAdmin: () => utiliserEtat(),
  agirSuperAdmin: (...args: unknown[]) => agirSuperAdmin(...args),
  chargerJournal: (...args: unknown[]) => chargerJournal(...args),
}));

const { SuperAdmin } = await import('./SuperAdmin');

const MOI = '11111111-1111-4111-8111-111111111111';
const AUTRE = '22222222-2222-4222-8222-222222222222';

const ETAT: EtatSuperAdmin = {
  genere_le: '2026-08-30T08:00:00Z',
  appelant: MOI,
  administrateurs: [
    {
      user_id: MOI,
      niveau: 'super',
      nom: 'Aya Konan',
      telephone: '+2250700000001',
      ajoute_le: '2026-01-05T09:00:00Z',
      ajoute_par: null,
    },
    {
      user_id: AUTRE,
      niveau: 'admin',
      nom: 'Bakary Touré',
      telephone: '+2250700000002',
      ajoute_le: '2026-06-12T09:00:00Z',
      ajoute_par: MOI,
    },
  ],
  codes_promo: [
    {
      code: 'RENTREE',
      remise_pct: 30,
      valide_du: '2026-08-01',
      valide_au: '2026-09-30',
      quota: 50,
      utilisations: 12,
      cree_le: '2026-07-30T09:00:00Z',
      statut: 'en_cours',
    },
  ],
  remises: [
    {
      collecteur_id: AUTRE,
      nom: 'Bakary Touré',
      palier: 'pro',
      promo_code: 'RENTREE',
      remise_pct: 30,
      remise_fin: '2026-09-30',
    },
  ],
  volumes: { collecteurs: 42, audit_log: 1284 },
  journal: { derniere_ecriture: '2026-08-30T07:59:00Z', tables: ['collecteurs', 'admins'] },
  postgres: 'PostgreSQL 15.8',
};

const VUE = {
  collecteurs: [
    {
      id: AUTRE,
      nom: 'Bakary Touré',
      telephone: '+2250700000002',
      zone: 'Cocody',
      palier: 'pro',
      abonnement_statut: 'actif',
      abonnement_echeance: '2027-06-12T00:00:00Z',
      cree_le: '2026-06-12T09:00:00Z',
      clients: 10,
      cartes_actives: 5,
      encaisse: 50000,
      commissions: 5000,
      restitutions: 0,
      encours: 45000,
    },
    {
      id: 'ccc',
      nom: 'Chantal Yao',
      telephone: '+2250700000003',
      zone: 'Plateau',
      palier: 'standard',
      abonnement_statut: 'actif',
      abonnement_echeance: '2027-03-01T00:00:00Z',
      cree_le: '2026-03-01T09:00:00Z',
      clients: 5,
      cartes_actives: 3,
      encaisse: 20000,
      commissions: 2000,
      restitutions: 0,
      encours: 18000,
    },
  ],
  abonnements: {
    collecteurs_total: 2,
    collecteurs_actifs: 2,
    suspendus: 0,
    expires: 0,
    expirations_ce_mois: 0,
    expirations_a_venir_30j: 0,
    mrr: 7500,
    parPalier: [
      { palier: 'pro', nom: 'Pro', prix: 5000, limiteClients: 150, total: 1, actifs: 1, mrr: 5000 },
      { palier: 'standard', nom: 'Standard', prix: 2500, limiteClients: 50, total: 1, actifs: 1, mrr: 2500 },
    ],
  },
  totaux: {
    clients: 15, cartes_actives: 8, cartes_total: 10, mises: 70000,
    total_encaisse: 70000, commissions: 7000, restitutions: 0, encours_clients: 63000,
  },
  zones: [],
  mouvements: [],
  cartes: [],
  cartes_total_lignes: 0,
  genereLe: '2026-08-30T08:00:00Z',
} as unknown as VueGlobale;

/** Une configuration complète et acceptée par la boutique. */
const COMPLET = {
  cleConfiguree: true,
  cleIndice: 'MNOP',
  webhookConfigure: true,
  produits: [
    { palier: 'standard', configure: true },
    { palier: 'pro', configure: true },
    { palier: 'illimite', configure: true },
  ],
  boutique: 'joignable' as const,
};

function poser(etat: Record<string, unknown>) {
  utiliserEtat.mockReturnValue({ ...etat, recharger });
}

/**
 * Rend la console de plateforme sur une de ses entrées.
 *
 * L'écran n'a plus de barre d'onglets à cliquer : depuis le 2026-08-30, sa
 * navigation est celle de la coquille — la barre latérale — et il reçoit
 * l'entrée courante en propriété. Où mène chaque entrée est donc vérifié dans
 * `Coquille.test.tsx` ; ici, on vérifie ce que chacune affiche.
 */
function rendre(onglet: CleNavSuper) {
  return render(<SuperAdmin vue={VUE} onglet={onglet} onRecharger={rechargerVue} />);
}

afterEach(() => {
  cleanup();
  agirSuperAdmin.mockReset();
  chargerJournal.mockReset();
  recharger.mockReset();
  rechargerVue.mockReset();
  modifierCollecteur.mockReset();
  utiliserEtat.mockReset();
});

describe('les états de chargement', () => {
  it('annonce le chargement plutôt qu’un écran vide', () => {
    poser({ statut: 'chargement' });

    rendre('abonnements');

    expect(screen.getByRole('status')).toBeDefined();
  });

  it('dit pourquoi rien ne s’affiche, et propose de réessayer', () => {
    poser({ statut: 'erreur', message: 'Cet écran est réservé aux super administrateurs.' });

    rendre('abonnements');

    expect(screen.getByRole('alert').textContent).toMatch(/réservé/i);
    screen.getByRole('button', { name: /réessayer/i }).click();
    expect(recharger).toHaveBeenCalled();
  });
});

describe('les administrateurs', () => {
  it('liste les comptes avec leur niveau', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('administrateurs');

    expect(within(screen.getByTestId(`admin-${MOI}`)).getByText(/Aya Konan/)).toBeDefined();
    const autre = within(screen.getByTestId(`admin-${AUTRE}`));
    expect(autre.getByText(/Bakary Touré/)).toBeDefined();
    expect(autre.getByText(/^Administrateur ·/)).toBeDefined();
  });

  it('marque sa propre ligne et n’y propose aucun geste', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('administrateurs');

    const maLigne = screen.getByTestId(`admin-${MOI}`);
    expect(within(maLigne).getByText(/c'est toi/i)).toBeDefined();
    expect(within(maLigne).queryByRole('button')).toBeNull();
  });

  it('promeut un administrateur', async () => {
    poser({ statut: 'ok', etat: ETAT });
    agirSuperAdmin.mockResolvedValue({ ok: true, corps: { fait: true } });

    rendre('administrateurs');

    within(screen.getByTestId(`admin-${AUTRE}`))
      .getByRole('button', { name: /promouvoir/i })
      .click();

    await waitFor(() =>
      expect(agirSuperAdmin).toHaveBeenCalledWith({
        action: 'definir_niveau',
        cible: AUTRE,
        niveau: 'super',
      }),
    );
    await waitFor(() => expect(recharger).toHaveBeenCalled());
  });

  it('affiche le refus du serveur sans le maquiller en succès', async () => {
    poser({ statut: 'ok', etat: ETAT });
    agirSuperAdmin.mockResolvedValue({ ok: false, message: 'Ton compte n\u2019est plus super.' });

    rendre('administrateurs');

    within(screen.getByTestId(`admin-${AUTRE}`))
      .getByRole('button', { name: /révoquer/i })
      .click();

    expect(await screen.findByText('Ton compte n\u2019est plus super.')).toBeDefined();
    expect(recharger).not.toHaveBeenCalled();
  });
});

describe('les codes promo', () => {
  it('liste les codes avec leur consommation', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('promos');

    const ligne = screen.getByTestId('code-RENTREE');
    expect(within(ligne).getByText('12 / 50')).toBeDefined();
  });

  it('crée un code', async () => {
    poser({ statut: 'ok', etat: ETAT });
    agirSuperAdmin.mockResolvedValue({ ok: true, corps: { fait: true } });

    rendre('promos');

    fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: 'noel' } });
    fireEvent.change(screen.getByLabelText(/remise/i), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText(/du/i), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText(/^au$/i), { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByLabelText(/quota/i), { target: { value: '100' } });
    screen.getByRole('button', { name: /créer le code/i }).click();

    await waitFor(() =>
      expect(agirSuperAdmin).toHaveBeenCalledWith({
        action: 'creer_code',
        code: 'NOEL',
        remise_pct: 25,
        valide_du: '2026-12-01',
        valide_au: '2026-12-31',
        quota: 100,
      }),
    );
  });

  it('envoie un quota nul quand la case est vide, pas zéro', async () => {
    poser({ statut: 'ok', etat: ETAT });
    agirSuperAdmin.mockResolvedValue({ ok: true, corps: { fait: true } });

    rendre('promos');

    fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: 'LIBRE' } });
    fireEvent.change(screen.getByLabelText(/remise/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/du/i), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText(/^au$/i), { target: { value: '2026-12-31' } });
    screen.getByRole('button', { name: /créer le code/i }).click();

    await waitFor(() =>
      expect(agirSuperAdmin).toHaveBeenCalledWith(expect.objectContaining({ quota: null })),
    );
  });

  it('applique un code à un collecteur', async () => {
    poser({ statut: 'ok', etat: ETAT });
    agirSuperAdmin.mockResolvedValue({ ok: true, corps: { fait: true, remise_pct: 30 } });

    rendre('promos');

    fireEvent.change(screen.getByLabelText(/collecteur/i), { target: { value: 'ccc' } });
    fireEvent.change(screen.getByLabelText(/code à appliquer/i), { target: { value: 'RENTREE' } });
    screen.getByRole('button', { name: /appliquer/i }).click();

    await waitFor(() =>
      expect(agirSuperAdmin).toHaveBeenCalledWith({
        action: 'appliquer_code',
        collecteur: 'ccc',
        code: 'RENTREE',
      }),
    );
  });
});

describe('la plateforme', () => {
  it('porte le titre « Santé du système »', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('plateforme');

    expect(screen.getAllByText('Santé du système').length).toBeGreaterThan(0);
  });

  it('dit la santé indisponible quand la route ne la rend pas, et garde les volumes', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('plateforme');

    expect(screen.getByText(/Santé indisponible/)).toBeDefined();
    expect(screen.getByTestId('plateforme')).toBeDefined();
  });

  it('traduit les noms de tables en libellés lisibles', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('plateforme');

    const carte = within(screen.getByTestId('plateforme'));
    expect(carte.getByText('Collecteurs')).toBeDefined();
    expect(carte.getByText('Lignes de journal')).toBeDefined();
  });

  it('nomme les tables journalisées', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('plateforme');

    const carte = within(screen.getByTestId('plateforme'));
    expect(carte.getByText('collecteurs')).toBeDefined();
    expect(carte.getByText('admins')).toBeDefined();
  });

  it('alerte quand des rejets de synchronisation attendent un arbitrage', () => {
    poser({
      statut: 'ok',
      etat: { ...ETAT, volumes: { ...ETAT.volumes, rejets_non_traites: 3 } },
    });

    rendre('plateforme');

    expect(screen.getByRole('alert').textContent).toMatch(/arbitrage/i);
  });

  it('sort les deux signaux opérationnels de la grille des comptages', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('plateforme');

    expect(screen.getByText('Rejets de synchro non traités')).toBeDefined();
    expect(screen.getByText('Journées de caisse')).toBeDefined();
    expect(screen.getByText('Détail technique')).toBeDefined();
  });

  /**
   * L'ancienne alerte vivait dans la grille des comptages. Elle remonte
   * au-dessus du repli : elle se déplace, elle ne se duplique pas. La
   * `precision` de la carte porte bien le mot « arbitrage », mais dans un
   * `span` sans rôle — le compte reste à une.
   */
  it('ne lève qu’une seule alerte quand des rejets attendent', () => {
    poser({
      statut: 'ok',
      etat: { ...ETAT, volumes: { ...ETAT.volumes, rejets_non_traites: 3 } },
    });

    rendre('plateforme');

    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});

describe('le paiement des abonnements', () => {
  it('n’offre aucun champ où saisir une clé', () => {
    // Le cœur de cet écran. Un champ imposerait que la clé traverse le
    // navigateur d'un administrateur, se pose quelque part, et revienne à
    // l'écran à chaque ouverture. Ce test tombe si quelqu'un en ajoute un.
    poser({ statut: 'ok', etat: { ...ETAT, paiement: COMPLET } });

    rendre('paiement');

    const carte = within(screen.getByTestId('paiement'));
    expect(carte.queryAllByRole('textbox')).toEqual([]);
    expect(carte.queryAllByRole('button')).toEqual([]);
  });

  it('montre les quatre derniers caractères de la clé, et rien de plus', () => {
    poser({ statut: 'ok', etat: { ...ETAT, paiement: COMPLET } });

    rendre('paiement');

    const carte = within(screen.getByTestId('paiement'));
    expect(carte.getByText('…MNOP')).toBeDefined();
    expect(carte.getByText('Posée')).toBeDefined();
  });

  it('nomme le palier dont le produit manque, et ce qu’il en coûtera', () => {
    poser({
      statut: 'ok',
      etat: {
        ...ETAT,
        paiement: {
          ...COMPLET,
          produits: [
            { palier: 'standard', configure: true },
            { palier: 'pro', configure: false },
            { palier: 'illimite', configure: true },
          ],
        },
      },
    });

    rendre('paiement');

    const alerte = screen.getByRole('alert').textContent ?? '';
    expect(alerte).toContain('pro');
    expect(alerte).toMatch(/refus/i);
  });

  it('distingue une clé refusée d’un service en panne', () => {
    // Les confondre enverrait GTCS régénérer une clé parfaitement correcte.
    poser({ statut: 'ok', etat: { ...ETAT, paiement: { ...COMPLET, boutique: 'refusee' } } });
    rendre('paiement');
    expect(screen.getByRole('alert').textContent).toMatch(/refuse la clé/i);

    cleanup();

    poser({ statut: 'ok', etat: { ...ETAT, paiement: { ...COMPLET, boutique: 'injoignable' } } });
    rendre('paiement');
    expect(screen.getByRole('alert').textContent).toMatch(/n’a pas répondu/i);
  });

  it('ne prétend pas avoir interrogé la boutique quand aucune clé n’est posée', () => {
    poser({
      statut: 'ok',
      etat: {
        ...ETAT,
        paiement: {
          ...COMPLET,
          cleConfiguree: false,
          cleIndice: null,
          boutique: 'non_configuree' as const,
        },
      },
    });

    rendre('paiement');

    const carte = within(screen.getByTestId('paiement'));
    expect(carte.getByText('Absente')).toBeDefined();
    expect(carte.getByText(/rien n’a été demandé à la boutique/)).toBeDefined();
  });

  it('dit que la fonction en ligne est en retard plutôt que de se rendre vide', () => {
    // Le front part par Netlify à la poussée, la fonction attend un
    // déploiement. Entre les deux, la clé `paiement` n'existe pas dans la
    // réponse — un écran vide se lirait comme « rien n'est configuré ».
    poser({ statut: 'ok', etat: ETAT });

    rendre('paiement');

    expect(screen.getByText(/ne rend pas encore l’état du paiement/)).toBeDefined();
  });
});

describe('les remises en cours', () => {
  it('nomme le collecteur, son code et la fin de la remise', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('promos');

    const ligne = screen.getByTestId(`remise-${AUTRE}`);
    expect(within(ligne).getByText(/RENTREE/)).toBeDefined();
    expect(within(ligne).getByText(/30\s*%/)).toBeDefined();
  });
});

describe('le journal de sécurité', () => {
  const LIGNE = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    survenu_le: '2026-08-30T07:59:00Z',
    table_cible: 'collecteurs',
    action: 'update',
    ligne_id: AUTRE,
    acteur_id: MOI,
    collecteur_id: AUTRE,
    acteur_nom: 'Aya Konan',
    cible_nom: 'Bakary Touré',
    donnees: { palier: 'pro' },
  };

  it('ne lit rien tant qu’on ne le demande pas', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('securite');

    expect(chargerJournal).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /afficher le journal/i })).toBeDefined();
  });

  it('affiche les lignes une fois demandé', async () => {
    poser({ statut: 'ok', etat: ETAT });
    chargerJournal.mockResolvedValue({ lignes: [LIGNE], a_suivre: false, page: 1, taille: 50 });

    rendre('securite');

    fireEvent.click(screen.getByRole('button', { name: /afficher le journal/i }));

    expect(await screen.findByTestId(`journal-${LIGNE.id}`)).toBeDefined();
    expect(chargerJournal).toHaveBeenCalledWith({ page: 1, taille: 50, consultations: false });
  });

  it('avance d’une page quand il en reste', async () => {
    poser({ statut: 'ok', etat: ETAT });
    chargerJournal.mockResolvedValue({ lignes: [LIGNE], a_suivre: true, page: 1, taille: 50 });

    rendre('securite');

    fireEvent.click(screen.getByRole('button', { name: /afficher le journal/i }));

    fireEvent.click(await screen.findByRole('button', { name: /page suivante/i }));

    await waitFor(() =>
      expect(chargerJournal).toHaveBeenCalledWith({ page: 2, taille: 50, consultations: false }),
    );
  });

  it('montre les consultations à la demande', async () => {
    poser({ statut: 'ok', etat: ETAT });
    chargerJournal.mockResolvedValue({ lignes: [LIGNE], a_suivre: false, page: 1, taille: 50 });

    rendre('securite');

    fireEvent.click(screen.getByRole('button', { name: /afficher le journal/i }));
    await screen.findByTestId(`journal-${LIGNE.id}`);

    fireEvent.click(screen.getByLabelText(/consultations/i));

    await waitFor(() =>
      expect(chargerJournal).toHaveBeenCalledWith({ page: 1, taille: 50, consultations: true }),
    );
  });

  it('dit pourquoi la page n’est pas venue', async () => {
    poser({ statut: 'ok', etat: ETAT });
    chargerJournal.mockRejectedValue(new Error('La base n\u2019a pas pu produire cette page.'));

    rendre('securite');

    fireEvent.click(screen.getByRole('button', { name: /afficher le journal/i }));

    expect(await screen.findByText(/n\u2019a pas pu produire/)).toBeDefined();
  });

  /**
   * Une console de securite qui affiche « acteur 3f2a… » ne dit pas qui a
   * agi, et c'est sa seule raison d'etre.
   */
  it('nomme l’acteur plutôt que d’afficher son identifiant', async () => {
    poser({ statut: 'ok', etat: ETAT });
    chargerJournal.mockResolvedValue({ lignes: [LIGNE], a_suivre: false, page: 1, taille: 50 });

    rendre('securite');
    fireEvent.click(screen.getByRole('button', { name: /afficher le journal/i }));

    expect(await screen.findByText(/par Aya Konan/)).toBeDefined();
  });
});

/**
 * Les deux commandes de ligne du tableau des abonnés.
 *
 * Elles étaient `disabled` depuis la maquette — dessinées, jamais branchées.
 * Ce dépôt a retiré trois fois des commandes de ce genre ; celles-ci ont été
 * branchées plutôt que retirées, parce que les routes existaient déjà :
 * `admin-modifier-collecteur` pour le palier et le statut, `appliquer_code`
 * pour la remise. Ces tests sont ce qui les empêche de redevenir décoratives.
 */
describe('les commandes d’une ligne d’abonné', () => {
  it('ouvre la fiche du collecteur au crayon', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('abonnements');
    fireEvent.click(screen.getByRole('button', { name: /modifier Bakary Touré/i }));

    expect(screen.getByText('Modifier la fiche')).toBeDefined();
  });

  it('suspend un abonnement depuis le menu, et recharge la vue', async () => {
    poser({ statut: 'ok', etat: ETAT });
    modifierCollecteur.mockResolvedValue({ ok: true });

    rendre('abonnements');
    fireEvent.click(screen.getByRole('button', { name: /plus d.options pour Chantal Yao/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /suspendre l.abonnement/i }));

    await waitFor(() =>
      expect(modifierCollecteur).toHaveBeenCalledWith('ccc', { abonnementStatut: 'suspendu' }),
    );
    // La vue globale porte la liste des collecteurs : sans rechargement, la
    // ligne resterait « Actif » alors que la base dit le contraire.
    await waitFor(() => expect(rechargerVue).toHaveBeenCalled());
  });

  it('dit pourquoi la suspension a échoué, et ne recharge rien', async () => {
    poser({ statut: 'ok', etat: ETAT });
    modifierCollecteur.mockResolvedValue({ ok: false, message: 'Modification impossible.' });

    rendre('abonnements');
    fireEvent.click(screen.getByRole('button', { name: /plus d.options pour Chantal Yao/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /suspendre l.abonnement/i }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/impossible/i);
    expect(rechargerVue).not.toHaveBeenCalled();
  });

  it('applique un code promo au collecteur de la ligne', async () => {
    poser({ statut: 'ok', etat: ETAT });
    agirSuperAdmin.mockResolvedValue({ ok: true, corps: { fait: true } });

    rendre('abonnements');
    fireEvent.click(screen.getByRole('button', { name: /plus d.options pour Chantal Yao/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /code promo/i }));

    fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: 'RENTREE' } });
    screen.getByRole('button', { name: /^appliquer$/i }).click();

    await waitFor(() =>
      expect(agirSuperAdmin).toHaveBeenCalledWith({
        action: 'appliquer_code',
        collecteur: 'ccc',
        code: 'RENTREE',
      }),
    );
  });

  it('ne propose que les codes en cours', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('abonnements');
    fireEvent.click(screen.getByRole('button', { name: /plus d.options pour Chantal Yao/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /code promo/i }));

    const choix = screen.getByLabelText(/^code$/i) as HTMLSelectElement;
    const valeurs = [...choix.options].map((o) => o.value).filter(Boolean);
    const enCours = ETAT.codes_promo.filter((c) => c.statut === 'en_cours').map((c) => c.code);

    // Un code programmé ou expiré ne s'applique pas : la base le refuserait, et
    // le proposer ferait porter le refus à l'écran plutôt qu'au formulaire.
    expect(valeurs).toEqual(enCours);
  });
});

/**
 * Le filtrage des abonnés.
 *
 * ## Pourquoi ce bloc arrive après les autres
 *
 * `SuperAdmin.tsx` fait 1 634 lignes et l'audit du 2026-09-09 proposait de le
 * découper. Ces trente tests couvraient déjà huit de ses parties — l'audit
 * disait « aucun test ne le nomme », ce qui était faux — mais **pas** celle-ci,
 * qui est pourtant la seule vraie logique de décision du fichier.
 *
 * Ce sont donc des tests de **caractérisation** : ils passent dès l'écriture,
 * et ce n'est pas un défaut, c'est leur objet. Ils ne cherchent pas un bogue,
 * ils fixent le comportement d'aujourd'hui pour qu'un découpage qui le change
 * échoue au lieu de passer inaperçu. Le dire est important : un test qui passe
 * du premier coup ne prouve rien sur le code, seulement sur ce qu'on a écrit.
 *
 * ## La frontière qui compte
 *
 * `jours = ceil((échéance − maintenant) / 86 400 000)`, puis `> 7` pour
 * « Actif » et `<= 7` pour « Expirant ». Sept jours pile tombe donc dans
 * « Expirant ». Une réécriture qui prendrait `floor`, ou `< 7`, déplacerait
 * silencieusement le moment où GTCS voit qu'un abonnement s'éteint.
 */
function echeanceDans(jours: number, heures = 0): string {
  return new Date(Date.now() + jours * 86_400_000 + heures * 3_600_000).toISOString();
}

function collecteur(
  nom: string,
  abonnement_statut: string,
  echeance: string,
  telephone = '+2250700000009',
) {
  return {
    id: `id-${nom}`,
    nom,
    telephone,
    zone: 'Cocody',
    palier: 'pro',
    abonnement_statut,
    abonnement_echeance: echeance,
    cree_le: '2026-06-12T09:00:00Z',
    clients: 1,
    cartes_actives: 1,
    encaisse: 0,
    commissions: 0,
    restitutions: 0,
    encours: 0,
  };
}

function rendreAbonnes(collecteurs: unknown[]) {
  poser({ statut: 'ok', etat: ETAT });
  return render(
    <SuperAdmin
      vue={{ ...VUE, collecteurs } as unknown as VueGlobale}
      onglet="abonnements"
      onRecharger={rechargerVue}
    />,
  );
}

/** Les noms visibles dans le tableau des abonnés. */
function nomsAffiches(): string[] {
  // Des noms qui ne peuvent pas entrer en collision avec les libellés des
  // filtres : une première version appelait un collecteur « Suspendu », et
  // `queryByText` trouvait aussi le bouton du même nom.
  return ['Adjoa', 'Brahima', 'Cisse', 'Diarra', 'Ekra'].filter(
    (n) => screen.queryByText(n) !== null,
  );
}

describe('le filtrage des abonnés', () => {
  const TOUS = [
    collecteur('Adjoa', 'actif', echeanceDans(30)),
    collecteur('Brahima', 'actif', echeanceDans(3)),
    collecteur('Cisse', 'actif', echeanceDans(7)),
    collecteur('Diarra', 'suspendu', echeanceDans(30)),
    collecteur('Ekra', 'expire', echeanceDans(-5)),
  ];

  it('montre tout le monde par défaut', () => {
    rendreAbonnes(TOUS);

    expect(nomsAffiches()).toEqual(['Adjoa', 'Brahima', 'Cisse', 'Diarra', 'Ekra']);
  });

  it('« Actif » écarte ceux dont l’échéance est dans sept jours ou moins', () => {
    rendreAbonnes(TOUS);
    fireEvent.click(screen.getByRole('button', { name: 'Actif' }));

    expect(nomsAffiches()).toEqual(['Adjoa']);
  });

  it('« Expirant » ne prend que les actifs à sept jours ou moins', () => {
    // Sept jours pile en fait partie : `ceil` d'un écart de sept jours vaut
    // sept, et la borne est `<= 7`. C'est le cas qu'une réécriture déplace.
    rendreAbonnes(TOUS);
    fireEvent.click(screen.getByRole('button', { name: 'Expirant' }));

    expect(nomsAffiches()).toEqual(['Brahima', 'Cisse']);
  });

  it('deux heures de plus font basculer d’« Expirant » à « Actif »', () => {
    // La frontière, éprouvée des deux côtés plutôt qu'affirmée : sans ce test,
    // un `>=` mis à la place d'un `>` resterait vert.
    rendreAbonnes([collecteur('Cisse', 'actif', echeanceDans(7, 2))]);
    fireEvent.click(screen.getByRole('button', { name: 'Actif' }));

    expect(screen.queryByText('Cisse')).not.toBeNull();
  });

  it('« Suspendu » ramasse aussi les abonnements expirés', () => {
    // Deux statuts distincts en base, un seul filtre à l'écran : pour GTCS, un
    // abonnement éteint est un abonnement éteint, quelle qu'en soit la cause.
    rendreAbonnes(TOUS);
    fireEvent.click(screen.getByRole('button', { name: 'Suspendu' }));

    expect(nomsAffiches()).toEqual(['Diarra', 'Ekra']);
  });

  it('cherche par nom et par téléphone', () => {
    rendreAbonnes([
      collecteur('Adjoa', 'actif', echeanceDans(30), '+2250701010101'),
      collecteur('Brahima', 'actif', echeanceDans(3), '+2250702020202'),
    ]);
    const champ = screen.getByPlaceholderText('Rechercher…');

    fireEvent.change(champ, { target: { value: 'adjoa' } });
    expect(nomsAffiches()).toEqual(['Adjoa']);

    fireEvent.change(champ, { target: { value: '0702020202' } });
    expect(nomsAffiches()).toEqual(['Brahima']);
  });

  it('cumule la recherche et le filtre', () => {
    rendreAbonnes(TOUS);
    fireEvent.change(screen.getByPlaceholderText('Rechercher…'), { target: { value: 'rra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Expirant' }));

    // « rra » ne prend que Diarra, que le filtre écarte ensuite : suspendu.
    // Aucun des deux seul ne donnerait une liste vide.
    expect(nomsAffiches()).toEqual([]);
  });

  it('ne cherche qu’à partir de trois caractères', () => {
    // Seuil délibéré : sous trois lettres, presque tout le monde correspond et
    // le tableau clignoterait à chaque frappe. Un découpage qui le perdrait ne
    // casserait rien de visible — la liste se mettrait seulement à sauter dès
    // la première lettre.
    //
    // Noté au passage : l'écran client du collecteur n'a pas ce seuil et
    // filtre dès le premier caractère. Les deux se défendent, mais rien
    // n'indique que l'écart soit voulu.
    rendreAbonnes(TOUS);
    const champ = screen.getByPlaceholderText('Rechercher…');

    fireEvent.change(champ, { target: { value: 'ad' } });
    expect(nomsAffiches()).toHaveLength(5);

    fireEvent.change(champ, { target: { value: 'adj' } });
    expect(nomsAffiches()).toEqual(['Adjoa']);
  });

  it('dit lequel des quatre filtres est actif', () => {
    // Manque relevé en écrivant ce bloc : les quatre boutons ne se
    // distinguaient que par leur couleur — `bg-primary` contre
    // `text-muted-foreground`. Au lecteur d'écran, les quatre étaient
    // identiques, et rien ne disait sur quel sous-ensemble portait le tableau.
    rendreAbonnes(TOUS);

    // `getAttribute` et non `toHaveAttribute` : ce dépôt ne charge pas les
    // matchers de jest-dom, et l'assertion serait `undefined` à l'exécution.
    const bouton = (nom: string) =>
      screen.getByRole('button', { name: nom }).getAttribute('aria-pressed');

    expect(bouton('Tous')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Expirant' }));

    expect(bouton('Expirant')).toBe('true');
    expect(bouton('Tous')).toBe('false');
  });
});

/**
 * La pagination du tableau des abonnés.
 *
 * ## Pourquoi ici, alors que le Journal paginait déjà
 *
 * Le Journal de sécurité, juste à côté, pagine **côté serveur** depuis le
 * 2026-08-30 : il demande une page à la fois à `chargerJournal`. Ce tableau-ci
 * ne peut pas faire pareil — ses lignes viennent de `vue.collecteurs`, chargée
 * en une fois pour tout l'écran, et lui redemander des pages ajouterait un
 * aller-retour par clic sur des données déjà en mémoire.
 *
 * C'est donc une pagination d'**affichage**, et les deux gardent la même taille
 * de page. Deux tailles différentes dans la même console se justifieraient mal.
 *
 * ## Le piège que ces tests gardent
 *
 * Si le découpage se faisait **avant** le filtrage, la recherche ne porterait
 * plus que sur les cinquante lignes affichées : GTCS chercherait un abonné qui
 * existe, ne le verrait pas, et conclurait qu'il n'est pas inscrit. Sur un
 * écran qui sert à suspendre et à réactiver des abonnements payants, c'est la
 * mauvaise conclusion à laisser prendre.
 */
describe('la pagination des abonnés', () => {
  /** `n` abonnés numérotés, tous actifs et loin de leur échéance. */
  const beaucoup = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      collecteur(`Abonne ${String(i + 1).padStart(3, '0')}`, 'actif', echeanceDans(30)),
    );

  /** Les lignes réellement rendues. Une par abonné affiché, et une seule. */
  const lignesRendues = () => screen.queryAllByTestId(/^abonne-/);

  const chercher = (terme: string) =>
    fireEvent.change(screen.getByPlaceholderText('Rechercher…'), { target: { value: terme } });

  it('ne rend qu’une page de lignes, quel que soit le nombre d’abonnés', () => {
    rendreAbonnes(beaucoup(120));

    expect(lignesRendues()).toHaveLength(TAILLE_PAGE);
  });

  it('mène à la page suivante', () => {
    rendreAbonnes(beaucoup(120));

    fireEvent.click(screen.getByRole('button', { name: /page suivante/i }));

    expect(screen.getByText('Abonne 051')).toBeDefined();
    expect(screen.queryByText('Abonne 001')).toBeNull();
  });

  it('cherche dans tous les abonnés, et non dans la page affichée', () => {
    // Le test qui compte. `Abonne 099` est en troisième page ; s'il ne
    // remontait pas, GTCS conclurait qu'il n'est pas abonné.
    rendreAbonnes(beaucoup(120));

    chercher('Abonne 099');

    expect(screen.getByText('Abonne 099')).toBeDefined();
  });

  it('revient à la première page quand la recherche change', () => {
    // Sans ce retour, on cherche depuis la page 2 et l'écran répond par le
    // cinquante-et-unième résultat. Les cinquante premiers existent, et sont
    // invisibles.
    rendreAbonnes(beaucoup(120));

    fireEvent.click(screen.getByRole('button', { name: /page suivante/i }));
    chercher('Abonne');

    expect(screen.getByText('Abonne 001')).toBeDefined();
  });

  it('revient à la première page quand le filtre change', () => {
    rendreAbonnes(beaucoup(120));

    fireEvent.click(screen.getByRole('button', { name: /page suivante/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Actif' }));

    expect(screen.getByText('Abonne 001')).toBeDefined();
  });

  it('n’affiche aucune commande de page quand tout tient sur une', () => {
    // Deux flèches inertes sous cinq lignes sont du bruit, et GTCS
    // apprendrait à ne plus les regarder.
    rendreAbonnes(beaucoup(5));

    expect(screen.queryByRole('button', { name: /page suivante/i })).toBeNull();
  });
});

/**
 * Le filtre et la pastille doivent dire la même chose de la même ligne.
 *
 * ## Pourquoi ce test existe, et ce qu'il protège
 *
 * Écrit le 2026-09-10 en traitant le point F de l'auto-audit, qui proposait de
 * mémoïser `collecteursFiltres` pour que le `useMemo` de `usePagination` serve
 * enfin son cache.
 *
 * Ça ne se fait pas ici, et voici pourquoi. Le filtre calcule les jours
 * restants depuis `Date.now()` ; `PastilleStatut` refait **le même calcul**, à
 * chaque rendu, pour écrire « Expire dans N j ». Mémoïser le filtre le figerait
 * au dernier changement de dépendance pendant que la pastille resterait vivante.
 * Au passage d'une frontière de jour, la même ligne serait alors classée
 * « Actif » par le filtre et annoncée « Expire dans 7 j » par sa pastille — un
 * écran qui se contredit lui-même, sur la console qui sert à facturer.
 *
 * Ces tests passent aujourd'hui : ce sont des tests de caractérisation, et ils
 * gardent la raison de ne pas mémoïser. Une réécriture qui figerait l'un des
 * deux calculs les ferait tomber.
 */
describe('la pastille d’échéance et le filtre s’accordent', () => {
  it('« Expirant » garde une ligne dont la pastille annonce l’échéance', () => {
    rendreAbonnes([collecteur('Cisse', 'actif', echeanceDans(7))]);

    fireEvent.click(screen.getByRole('button', { name: 'Expirant' }));

    // La ligne est là…
    expect(screen.getByText('Cisse')).toBeDefined();
    // …et sa pastille dit la même chose que le filtre.
    expect(screen.getByText(/Expire dans 7 j/)).toBeDefined();
  });

  it('« Actif » garde une ligne dont la pastille ne parle pas d’échéance', () => {
    rendreAbonnes([collecteur('Adjoa', 'actif', echeanceDans(30))]);

    fireEvent.click(screen.getByRole('button', { name: 'Actif' }));

    expect(screen.getByText('Adjoa')).toBeDefined();
    // À trente jours, la pastille dit « Actif » et non un compte à rebours.
    expect(screen.queryByText(/Expire dans/)).toBeNull();
  });
});

/**
 * L'export CSV des abonnés — le seul chemin de ce fichier qu'aucune épreuve ne
 * touchait avant le 2026-09-11.
 *
 * Il sort le nom, le téléphone, la zone, le palier, le prix, le statut,
 * l'échéance et le nombre de clients de **tous** les collecteurs. `versCsv` ne
 * vérifie aucune arité : en-têtes et cellules sont assemblés séparément.
 * Ajouter une colonne à l'un sans l'autre rend un CSV valide dont les colonnes
 * sont décalées — les téléphones sous « Zone ». Rien ne se voit à l'écran, et
 * le fichier part par courriel.
 *
 * Cette épreuve est écrite **avant** le découpage de ce fichier, et c'est tout
 * son intérêt : c'est pendant un déplacement de code qu'une colonne se perd.
 */
describe('l’export CSV des abonnés', () => {
  /** Rend le contenu du fichier produit par un clic sur « Exporter ». */
  function csvApresClic(vue: VueGlobale = VUE): string {
    // `jsdom` n'implémente ni l'un ni l'autre, et `telechargerCsv` les appelle.
    const url = URL as unknown as Record<string, unknown>;
    url.createObjectURL = vi.fn(() => 'blob:faux');
    url.revokeObjectURL = vi.fn();

    // Le `Blob` est le seul endroit où le contenu du fichier passe en clair.
    const contenus: string[] = [];
    const vraiBlob = globalThis.Blob;
    globalThis.Blob = class extends vraiBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        contenus.push(parts.map(String).join(''));
      }
    } as unknown as typeof Blob;

    try {
      poser({ statut: 'ok', etat: ETAT });
      render(<SuperAdmin vue={vue} onglet="abonnements" onRecharger={rechargerVue} />);
      fireEvent.click(screen.getByRole('button', { name: 'Exporter' }));
      return contenus.join('');
    } finally {
      globalThis.Blob = vraiBlob;
    }
  }

  it('aligne chaque cellule sous son en-tête', () => {
    // Le contrôle que `versCsv` ne fait pas : autant de cellules que d'en-têtes,
    // sur chaque ligne. Un décalage rend un fichier valide et faux.
    const lignes = csvApresClic()
      .split('\r\n')
      .filter((l) => l.length > 0);
    const colonnes = lignes[0]!.split(';').length;

    expect(colonnes).toBe(8);
    expect(lignes).toHaveLength(1 + VUE.collecteurs.length);
    for (const ligne of lignes) {
      expect(ligne.split(';')).toHaveLength(colonnes);
    }
  });

  it('nomme ses huit colonnes, dans cet ordre', () => {
    // L'ordre est le contrat : un tableur ouvre le fichier sans rien demander,
    // et une colonne déplacée se lit comme une donnée fausse. `\uFEFF` est la
    // marque d'ordre des octets que `telechargerCsv` pose en tête — sans elle,
    // Excel lit « Téléphone » comme « TÃ©lÃ©phone ».
    expect(csvApresClic().split('\r\n')[0]).toBe(
      '\uFEFFCollecteur;Téléphone;Zone;Palier;Prix mensuel;Statut;Échéance;Clients',
    );
  });

  it('exporte tous les collecteurs, pas la page affichée', () => {
    // Même défaut que celui gardé par `Collecteurs.test.tsx` : un fichier d'une
    // page que l'administrateur croirait complet. Deux collecteurs ne le
    // montreraient pas — il en faut plus qu'une page.
    const nombreux = Array.from({ length: TAILLE_PAGE + 5 }, (_, i) => ({
      ...VUE.collecteurs[0]!,
      id: `c${i}`,
      nom: `Collecteur ${String(i + 1).padStart(3, '0')}`,
    }));

    const csv = csvApresClic({ ...VUE, collecteurs: nombreux } as VueGlobale);

    expect(csv).toContain('Collecteur 001');
    expect(csv).toContain(`Collecteur ${String(TAILLE_PAGE + 5).padStart(3, '0')}`);
    expect(csv.split('\r\n').filter((l) => l.length > 0)).toHaveLength(1 + TAILLE_PAGE + 5);
  });
});

/**
 * Cinq onglets s'ouvraient sans rien annoncer. Chaque chiffre pose ici existe
 * deja dans l'etat : aucun n'est calcule pour l'occasion, et aucune tendance
 * n'est affichee — il n'existe pas de periode precedente pour ces valeurs.
 */
describe('les têtes d’onglet', () => {
  it('Facturation annonce le MRR et garde son alerte en rouge', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('abonnements');

    expect(screen.getByText('MRR total')).toBeDefined();
    expect(screen.getByText('En défaut')).toBeDefined();
  });

  it('Administrateurs compte les comptes et les super administrateurs', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('administrateurs');

    expect(screen.getByText('Comptes d’administration')).toBeDefined();
    expect(screen.getByText('Super administrateurs')).toBeDefined();
  });

  it('Promotions compte les codes en cours', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('promos');

    expect(screen.getByText('Codes en cours')).toBeDefined();
  });

  it('Sécurité annonce la taille du journal sans le lire', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('securite');

    expect(screen.getByText('Lignes de journal')).toBeDefined();
    // La tete annonce la taille ; le journal lui-meme reste a demander, car
    // le consulter s'enregistre.
    expect(screen.getByText('Afficher le journal')).toBeDefined();
  });

  /**
   * `ETAT` ne porte aucune cle `paiement` : avec lui seul, l'ecran rendrait sa
   * branche « la fonction en ligne ne rend pas encore l'etat du paiement » et
   * ce libelle n’existerait jamais.
   */
  it('Paiement annonce les produits déclarés', () => {
    poser({ statut: 'ok', etat: { ...ETAT, paiement: COMPLET } });

    rendre('paiement');

    expect(screen.getByText('Produits déclarés')).toBeDefined();
  });

  /**
   * La précision de la carte et l’alerte juste dessous énoncent le même
   * fait. Elles doivent donc compter pareil : « un palier ne peut pas être
   * payé », sous un « 0 / 3 », contredisait « 3 paliers n’ont pas de produit
   * déclaré » écrit à trois centimètres de là.
   */
  it('accorde la précision au nombre de paliers sans produit', () => {
    poser({
      statut: 'ok',
      etat: {
        ...ETAT,
        paiement: {
          ...COMPLET,
          produits: [
            { palier: 'standard', configure: false },
            { palier: 'pro', configure: false },
            { palier: 'illimite', configure: false },
          ],
        },
      },
    });

    rendre('paiement');

    expect(screen.getByText('3 paliers ne peuvent pas être payés')).toBeDefined();

    cleanup();

    poser({
      statut: 'ok',
      etat: {
        ...ETAT,
        paiement: {
          ...COMPLET,
          produits: [
            { palier: 'standard', configure: true },
            { palier: 'pro', configure: false },
            { palier: 'illimite', configure: true },
          ],
        },
      },
    });

    rendre('paiement');

    expect(screen.getByText('un palier ne peut pas être payé')).toBeDefined();
  });
});
