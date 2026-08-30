import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VueGlobale } from '../donnees';
import type { EtatSuperAdmin } from '../superadmin';

/**
 * L'écran Super Admin.
 *
 * ## Ce que cet écran ne décide pas
 *
 * Rien. « Pas d'action sur soi-même », le quota d'un code, l'unicité du dernier
 * super admin : tout cela vit en SQL, sous verrou, et les deux Edge Functions
 * redemandent `est_super_admin()` avec le jeton de l'appelant. L'écran envoie
 * des demandes et affiche des verdicts.
 *
 * Ce qu'il fait quand même : ne pas proposer un geste que le serveur refusera à
 * coup sûr. Sa propre ligne ne porte donc pas de bouton — non pour protéger
 * quoi que ce soit, mais pour ne pas offrir un clic dont la seule issue est un
 * message d'erreur.
 *
 * ## Le journal n'est pas ici
 *
 * `super_admin_journal()` existe en base, testée et fermée, mais aucune Edge
 * Function ne la sert encore. Un onglet « Journal » vide apprendrait à
 * l'administrateur que l'interface promet ce qu'elle ne tient pas — la leçon que
 * `BarreLaterale.tsx` porte déjà deux fois. Il arrivera avec sa route.
 */

const agirSuperAdmin = vi.fn();
const recharger = vi.fn();
const utiliserEtat = vi.fn();

vi.mock('../superadmin', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useEtatSuperAdmin: () => utiliserEtat(),
  agirSuperAdmin: (...args: unknown[]) => agirSuperAdmin(...args),
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
    { id: AUTRE, nom: 'Bakary Touré', palier: 'pro' },
    { id: 'ccc', nom: 'Chantal Yao', palier: 'starter' },
  ],
} as unknown as VueGlobale;

function poser(etat: Record<string, unknown>) {
  utiliserEtat.mockReturnValue({ ...etat, recharger });
}

afterEach(() => {
  cleanup();
  agirSuperAdmin.mockReset();
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

    // Cherché dans sa ligne : le même collecteur figure aussi dans les remises
    // en cours, et un `getByText` global y trouverait deux fois son nom.
    expect(within(screen.getByTestId(`admin-${MOI}`)).getByText(/Aya Konan/)).toBeDefined();
    const autre = within(screen.getByTestId(`admin-${AUTRE}`));
    expect(autre.getByText(/Bakary Touré/)).toBeDefined();
    expect(autre.getByText(/^Administrateur ·/)).toBeDefined();
  });

  it('marque sa propre ligne et n’y propose aucun geste', () => {
    poser({ statut: 'ok', etat: ETAT });

    render(<SuperAdmin vue={VUE} />);

    const maLigne = screen.getByTestId(`admin-${MOI}`);
    expect(within(maLigne).getByText(/c’est toi/i)).toBeDefined();
    expect(within(maLigne).queryByRole('button')).toBeNull();
  });

  it('promeut un administrateur', async () => {
    poser({ statut: 'ok', etat: ETAT });
    agirSuperAdmin.mockResolvedValue({ ok: true, corps: { fait: true } });

    render(<SuperAdmin vue={VUE} />);
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
    agirSuperAdmin.mockResolvedValue({ ok: false, message: 'Ton compte n’est plus super.' });

    render(<SuperAdmin vue={VUE} />);
    within(screen.getByTestId(`admin-${AUTRE}`))
      .getByRole('button', { name: /révoquer/i })
      .click();

    expect(await screen.findByText('Ton compte n’est plus super.')).toBeDefined();
    expect(recharger).not.toHaveBeenCalled();
  });
});

describe('les codes promo', () => {
  it('liste les codes avec leur consommation', () => {
    poser({ statut: 'ok', etat: ETAT });

    render(<SuperAdmin vue={VUE} />);

    const ligne = screen.getByTestId('code-RENTREE');
    expect(within(ligne).getByText('12 / 50')).toBeDefined();
  });

  it('crée un code', async () => {
    poser({ statut: 'ok', etat: ETAT });
    agirSuperAdmin.mockResolvedValue({ ok: true, corps: { fait: true } });

    render(<SuperAdmin vue={VUE} />);

    fireEvent.change(screen.getByLabelText(/^code$/i), { target: { value: 'noel' } });
    fireEvent.change(screen.getByLabelText(/remise/i), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText(/du/i), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText(/^au$/i), { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByLabelText(/quota/i), { target: { value: '100' } });
    screen.getByRole('button', { name: /créer le code/i }).click();

    await waitFor(() =>
      expect(agirSuperAdmin).toHaveBeenCalledWith({
        action: 'creer_code',
        // Saisi en minuscules, envoyé en majuscules : la contrainte de table
        // n'admet que `[A-Z0-9]`, et refuser la frappe de l'utilisateur pour
        // une casse serait lui faire deviner une règle de stockage.
        code: 'NOEL',
        remise_pct: 25,
        valide_du: '2026-12-01',
        valide_au: '2026-12-31',
        quota: 100,
      }),
    );
  });

  it('envoie un quota nul quand la case est vide, pas zéro', async () => {
    // `quota: 0` serait un code épuisé d'avance ; `null` veut dire « sans
    // limite ». Les deux se ressemblent dans un formulaire vide et n'ont rien à
    // voir dans la base.
    poser({ statut: 'ok', etat: ETAT });
    agirSuperAdmin.mockResolvedValue({ ok: true, corps: { fait: true } });

    render(<SuperAdmin vue={VUE} />);

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

    // Cherché dans sa carte : « Lignes de journal » figure aussi parmi les
    // indicateurs du haut, et un `getByText` global le trouverait deux fois.
    const carte = within(screen.getByTestId('plateforme'));
    expect(carte.getByText('Collecteurs')).toBeDefined();
    expect(carte.getByText('Lignes de journal')).toBeDefined();
  });

  it('nomme les tables journalisées', () => {
    poser({ statut: 'ok', etat: ETAT });

    render(<SuperAdmin vue={VUE} />);

    const carte = within(screen.getByTestId('plateforme'));
    expect(carte.getByText('collecteurs')).toBeDefined();
    expect(carte.getByText('admins')).toBeDefined();
  });

  it('alerte quand des rejets de synchronisation attendent un arbitrage', () => {
    // L'argent a changé de main dans le monde réel : ces lignes ne doivent pas
    // dormir. Un compteur parmi douze autres ne se remarque pas.
    poser({
      statut: 'ok',
      etat: { ...ETAT, volumes: { ...ETAT.volumes, rejets_non_traites: 3 } },
    });

    render(<SuperAdmin vue={VUE} />);

    expect(screen.getByRole('alert').textContent).toMatch(/arbitrage/i);
  });
});

describe('les remises en cours', () => {
  it('nomme le collecteur, son code et la fin de la remise', () => {
    poser({ statut: 'ok', etat: ETAT });

    render(<SuperAdmin vue={VUE} />);

    const ligne = screen.getByTestId(`remise-${AUTRE}`);
    expect(within(ligne).getByText(/RENTREE/)).toBeDefined();
    expect(within(ligne).getByText(/30\s*%/)).toBeDefined();
  });
});
