import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { viderCache } from '../cache';

/**
 * L'abonnement, sur l'écran « Plus ».
 *
 * Un seul fait est mesuré ici, et c'est le seul qui puisse coûter de l'argent à
 * quelqu'un : **un collaborateur ne doit pas se voir proposer de payer.** Son
 * abonnement est celui de son titulaire ; le bouton lui ferait régler une
 * seconde fois une place déjà achetée, et le remboursement d'un paiement
 * abouti est un geste manuel dans le tableau de bord du fournisseur.
 *
 * La phrase qui remplace le bouton n'est pas un ornement. Un collaborateur qui
 * ne voit rien, sur un écran qui affiche son palier juste au-dessus, se demande
 * où il paie — et finit par appeler GTCS.
 */

// Le cache de `useDonnees` vit dans un module : il survit à `cleanup`. Sans
// cette purge, le second test relirait le profil du premier et passerait au vert
// en mesurant la mauvaise chose. Même raison que `commission.test.tsx`.
afterEach(() => {
  cleanup();
  viderCache();
});

// Importer `../lectures-ecrans`, même pour n'en remplacer qu'une fonction,
// charge `../supabase`, qui lève faute de configuration.
vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'col1' } } }) },
  },
}));

const profil = vi.fn();
vi.mock('../lectures-ecrans', async (original) => ({
  ...((await original()) as object),
  chargerProfil: () => profil(),
}));

const { Plus } = await import('./Plus');

const PROFIL = {
  nom: 'Awa Traoré',
  telephone: '+2250701020304',
  zone: 'Adjamé',
  palier: 'pro',
  abonnementStatut: 'actif',
  abonnementEcheance: '2026-10-01',
  titulaireId: null as string | null,
  clients: 12,
  cartesActives: 9,
};

function afficher() {
  render(<Plus onRetour={() => {}} onDeconnexion={() => {}} onAbonnement={() => {}} />);
}

describe('le bouton de renouvellement', () => {
  it('est proposé à un collecteur qui paie son abonnement', async () => {
    profil.mockResolvedValue(PROFIL);
    afficher();

    expect(await screen.findByRole('button', { name: /Renouveler/ })).toBeTruthy();
  });

  it('ne l’est pas à un collaborateur, à qui on dit pourquoi', async () => {
    profil.mockResolvedValue({ ...PROFIL, palier: 'illimite', titulaireId: 'patron-1' });
    afficher();

    expect(await screen.findByText(/payé par ton titulaire/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Renouveler/ })).toBeNull();
  });

  it('appelle l’ouverture de l’écran d’abonnement', async () => {
    // Sans cette mesure, un bouton branché sur rien passerait les deux tests
    // précédents : il serait bien là, et bien absent pour un collaborateur.
    const onAbonnement = vi.fn();
    profil.mockResolvedValue(PROFIL);
    render(<Plus onRetour={() => {}} onDeconnexion={() => {}} onAbonnement={onAbonnement} />);

    (await screen.findByRole('button', { name: /Renouveler/ })).click();

    expect(onAbonnement).toHaveBeenCalledTimes(1);
  });
});
