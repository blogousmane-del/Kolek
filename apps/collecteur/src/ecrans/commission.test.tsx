import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { viderCache } from '../cache';

/**
 * Les quatre écrans qui promettaient au collaborateur une commission qu'il ne
 * touche pas.
 *
 * Les collaborateurs sont salariés, pas commissionnés : la première mise du
 * cycle revient toujours au titulaire, quel que soit qui l'encaisse. Quatre
 * écrans annonçaient au collecteur qu'elle était la sienne, et devenaient donc
 * faux pour un collaborateur.
 *
 * Ce fichier les couvre tous les quatre, ensemble. Les répartir dans les quatre
 * suites d'écran aurait dispersé une règle unique en quatre endroits, et rendu
 * invisible le seul fait qui compte : ce sont QUATRE textes qui disent la même
 * chose, et ils doivent changer ensemble ou pas du tout.
 */

// Le cache de `useDonnees` vit dans un module, donc il survit à `cleanup`.
// Sans cette purge, le second test relirait le profil gardé par le premier, et
// un collaborateur y serait vu comme un titulaire — le test passerait au vert
// en mesurant la mauvaise chose.
afterEach(() => {
  cleanup();
  viderCache();
});

// Sans ce doublon, importer `../lectures-ecrans` — même pour n'en remplacer
// qu'une fonction — charge `../supabase`, qui lève faute de configuration. Même
// forme que `Clients.test.tsx`.
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
  chargerRecus: () =>
    Promise.resolve([
      {
        id: 'r1',
        clientNom: 'Aya Koffi',
        montant: 2000,
        encaisseLe: new Date('2026-09-02T09:00:00Z').toISOString(),
        estCommission: true,
      },
    ]),
  chargerBilan: () =>
    Promise.resolve({
      tranches: [
        {
          libelle: 'Aujourd’hui',
          encaisse: 6000,
          commissions: 2000,
          nombreMises: 3,
          cartesOuvertes: 1,
          cartesCloturees: 0,
          restitue: 0,
        },
      ],
      encoursTotal: 4000,
      clients: 3,
      cartesActives: 2,
    }),
  chargerCartesCloturables: () =>
    Promise.resolve([
      {
        carteId: 'k1',
        clientId: 'cli1',
        clientNom: 'Aya Koffi',
        mise: 2000,
        misesEncaissees: 12,
        restituable: 22000,
        cycleComplet: false,
      },
    ]),
}));

const { Bilan } = await import('./Bilan');
const { ChoixMise } = await import('./ChoixMise');
const { Recus } = await import('./Recus');
const { Retrait } = await import('./Retrait');

function profilAvecTitulaire(titulaireId: string | null) {
  profil.mockResolvedValue({
    nom: 'Awa Konan',
    telephone: '+2250700000000',
    zone: null,
    palier: 'illimite',
    abonnementStatut: 'actif',
    abonnementEcheance: null,
    clients: 3,
    cartesActives: 2,
    titulaireId,
  });
}

describe('le choix de la mise', () => {
  it('dit « ta commission » à un collecteur sans titulaire', () => {
    render(<ChoixMise mise={2000} onChoisir={() => {}} identifiant="t" />);
    expect(document.body.textContent).toContain('La première mise est ta commission.');
  });

  it('dit « ton titulaire » à un collaborateur', () => {
    render(<ChoixMise mise={2000} onChoisir={() => {}} identifiant="t" estCollaborateur />);
    expect(document.body.textContent).toContain('La première mise revient à ton titulaire.');
    // La promesse ne doit pas subsister à côté de sa correction.
    expect(document.body.textContent).not.toContain('ta commission');
  });
});

describe('les reçus', () => {
  it('marque « commission » à un collecteur sans titulaire', async () => {
    profilAvecTitulaire(null);
    render(<Recus revision={0} onRetour={() => {}} />);

    expect(await screen.findByText('commission')).toBeTruthy();
  });

  it('marque « commission titulaire » à un collaborateur', async () => {
    profilAvecTitulaire('patron-1');
    render(<Recus revision={0} onRetour={() => {}} />);

    expect(await screen.findByText('commission titulaire')).toBeTruthy();
  });
});

describe('le bilan', () => {
  it('montre la commission à un collecteur sans titulaire', async () => {
    profilAvecTitulaire(null);
    render(<Bilan revision={0} onRetour={() => {}} />);

    expect(await screen.findByText('Ta commission')).toBeTruthy();
  });

  it('retire la ligne pour un collaborateur', async () => {
    profilAvecTitulaire('patron-1');
    render(<Bilan revision={0} onRetour={() => {}} />);

    // On attend que l'écran ait ses données avant de conclure à l'absence :
    // sans ce point d'ancrage, l'assertion passerait sur un écran encore vide.
    expect(await screen.findByText('Encaissé')).toBeTruthy();
    // Un « +0 FCFA » tous les soirs pendant qu'il encaisse est pire qu'une
    // absence : il ressemble à une erreur de calcul, pas à une règle.
    expect(screen.queryByText('Ta commission')).toBeNull();
  });
});

describe('le retrait', () => {
  it('dit « ta commission » à un collecteur sans titulaire', async () => {
    profilAvecTitulaire(null);
    render(
      <Retrait
        revision={0}
        collecteurId="col1"
        onRetour={() => {}}
        onEcriture={() => {}}
        onToutesLesCartes={() => {}}
      />,
    );

    expect(await screen.findByText('Aya Koffi')).toBeTruthy();
    expect(document.body.textContent).toContain('qui est ta commission');
  });

  it('dit « ton titulaire » à un collaborateur', async () => {
    profilAvecTitulaire('patron-1');
    render(
      <Retrait
        revision={0}
        collecteurId="col1"
        onRetour={() => {}}
        onEcriture={() => {}}
        onToutesLesCartes={() => {}}
      />,
    );

    expect(await screen.findByText('Aya Koffi')).toBeTruthy();
    expect(document.body.textContent).toContain('qui revient à ton titulaire');
    expect(document.body.textContent).not.toContain('ta commission');
  });
});
