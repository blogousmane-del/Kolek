import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VueGlobale } from '../donnees';
import type { EtatSuperAdmin } from '../superadmin';

/**
 * L'écran Super Admin, restructuré en onglets.
 *
 * Chaque groupe de tests commence par naviguer vers l'onglet concerné. L'onglet
 * par défaut — « Abonnements » — montre les KPI financiers, les paliers et le
 * tableau des collecteurs ; les autres onglets reprennent le contenu existant.
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
const utiliserEtat = vi.fn();

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

function poser(etat: Record<string, unknown>) {
  utiliserEtat.mockReturnValue({ ...etat, recharger });
}

/** Navigue vers un onglet de l'écran Super Admin. */
function allerA(libelle: string) {
  fireEvent.click(screen.getByRole('button', { name: libelle }));
}

afterEach(() => {
  cleanup();
  agirSuperAdmin.mockReset();
  chargerJournal.mockReset();
  recharger.mockReset();
  utiliserEtat.mockReset();
});

describe('les états de chargement', () => {
  it('annonce le chargement plutôt qu’un écran vide', () => {
    poser({ statut: 'chargement' });

    render(<SuperAdmin vue={VUE} />);

    expect(screen.getByRole('status')).toBeDefined();
  });

  it('dit pourquoi rien ne s’affiche, et propose de réessayer', () => {
    poser({ statut: 'erreur', message: 'Cet écran est réservé aux super administrateurs.' });

    render(<SuperAdmin vue={VUE} />);

    expect(screen.getByRole('alert').textContent).toMatch(/réservé/i);
    screen.getByRole('button', { name: /réessayer/i }).click();
    expect(recharger).toHaveBeenCalled();
  });
});

describe('les administrateurs', () => {
  it('liste les comptes avec leur niveau', () => {
    poser({ statut: 'ok', etat: ETAT });

    render(<SuperAdmin vue={VUE} />);
    allerA('Administrateurs');

    expect(within(screen.getByTestId(`admin-${MOI}`)).getByText(/Aya Konan/)).toBeDefined();
    const autre = within(screen.getByTestId(`admin-${AUTRE}`));
    expect(autre.getByText(/Bakary Touré/)).toBeDefined();
    expect(autre.getByText(/^Administrateur ·/)).toBeDefined();
  });

  it('marque sa propre ligne et n’y propose aucun geste', () => {
    poser({ statut: 'ok', etat: ETAT });

    render(<SuperAdmin vue={VUE} />);
    allerA('Administrateurs');

    const maLigne = screen.getByTestId(`admin-${MOI}`);
    expect(within(maLigne).getByText(/c'est toi/i)).toBeDefined();
    expect(within(maLigne).queryByRole('button')).toBeNull();
  });

  it('promeut un administrateur', async () => {
    poser({ statut: 'ok', etat: ETAT });
    agirSuperAdmin.mockResolvedValue({ ok: true, corps: { fait: true } });

    render(<SuperAdmin vue={VUE} />);
    allerA('Administrateurs');

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

    render(<SuperAdmin vue={VUE} />);
    allerA('Administrateurs');

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

    render(<SuperAdmin vue={VUE} />);
    allerA('Promotions');

    const ligne = screen.getByTestId('code-RENTREE');
    expect(within(ligne).getByText('12 / 50')).toBeDefined();
  });

  it('crée un code', async () => {
    poser({ statut: 'ok', etat: ETAT });
    agirSuperAdmin.mockResolvedValue({ ok: true, corps: { fait: true } });

    render(<SuperAdmin vue={VUE} />);
    allerA('Promotions');

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

    render(<SuperAdmin vue={VUE} />);
    allerA('Promotions');

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

    render(<SuperAdmin vue={VUE} />);
    allerA('Promotions');

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
  it('traduit les noms de tables en libellés lisibles', () => {
    poser({ statut: 'ok', etat: ETAT });

    render(<SuperAdmin vue={VUE} />);
    allerA('Plateforme');

    const carte = within(screen.getByTestId('plateforme'));
    expect(carte.getByText('Collecteurs')).toBeDefined();
    expect(carte.getByText('Lignes de journal')).toBeDefined();
  });

  it('nomme les tables journalisées', () => {
    poser({ statut: 'ok', etat: ETAT });

    render(<SuperAdmin vue={VUE} />);
    allerA('Plateforme');

    const carte = within(screen.getByTestId('plateforme'));
    expect(carte.getByText('collecteurs')).toBeDefined();
    expect(carte.getByText('admins')).toBeDefined();
  });

  it('alerte quand des rejets de synchronisation attendent un arbitrage', () => {
    poser({
      statut: 'ok',
      etat: { ...ETAT, volumes: { ...ETAT.volumes, rejets_non_traites: 3 } },
    });

    render(<SuperAdmin vue={VUE} />);
    allerA('Plateforme');

    expect(screen.getByRole('alert').textContent).toMatch(/arbitrage/i);
  });
});

describe('les remises en cours', () => {
  it('nomme le collecteur, son code et la fin de la remise', () => {
    poser({ statut: 'ok', etat: ETAT });

    render(<SuperAdmin vue={VUE} />);
    allerA('Promotions');

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
    donnees: { palier: 'pro' },
  };

  it('ne lit rien tant qu’on ne le demande pas', () => {
    poser({ statut: 'ok', etat: ETAT });

    render(<SuperAdmin vue={VUE} />);
    allerA('Sécurité');

    expect(chargerJournal).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /afficher le journal/i })).toBeDefined();
  });

  it('affiche les lignes une fois demandé', async () => {
    poser({ statut: 'ok', etat: ETAT });
    chargerJournal.mockResolvedValue({ lignes: [LIGNE], a_suivre: false, page: 1, taille: 50 });

    render(<SuperAdmin vue={VUE} />);
    allerA('Sécurité');

    fireEvent.click(screen.getByRole('button', { name: /afficher le journal/i }));

    expect(await screen.findByTestId(`journal-${LIGNE.id}`)).toBeDefined();
    expect(chargerJournal).toHaveBeenCalledWith({ page: 1, taille: 50, consultations: false });
  });

  it('avance d’une page quand il en reste', async () => {
    poser({ statut: 'ok', etat: ETAT });
    chargerJournal.mockResolvedValue({ lignes: [LIGNE], a_suivre: true, page: 1, taille: 50 });

    render(<SuperAdmin vue={VUE} />);
    allerA('Sécurité');

    fireEvent.click(screen.getByRole('button', { name: /afficher le journal/i }));

    fireEvent.click(await screen.findByRole('button', { name: /page suivante/i }));

    await waitFor(() =>
      expect(chargerJournal).toHaveBeenCalledWith({ page: 2, taille: 50, consultations: false }),
    );
  });

  it('montre les consultations à la demande', async () => {
    poser({ statut: 'ok', etat: ETAT });
    chargerJournal.mockResolvedValue({ lignes: [LIGNE], a_suivre: false, page: 1, taille: 50 });

    render(<SuperAdmin vue={VUE} />);
    allerA('Sécurité');

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

    render(<SuperAdmin vue={VUE} />);
    allerA('Sécurité');

    fireEvent.click(screen.getByRole('button', { name: /afficher le journal/i }));

    expect(await screen.findByText(/n\u2019a pas pu produire/)).toBeDefined();
  });
});
