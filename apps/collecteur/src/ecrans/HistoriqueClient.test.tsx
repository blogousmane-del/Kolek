import { formatMontant, MISES_PAR_CYCLE, soldeRestituable } from '@kolek/core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { viderCache } from '../cache';
import type { CarteFiche } from '../lectures-ecrans';

/**
 * Remplacement complet du module de lectures, et non `importActual`.
 *
 * `lectures-ecrans.ts` importe `./supabase`, qui se construit sur
 * `import.meta.env` et lève si la configuration manque. Le remplacer en entier
 * évite de l'évaluer — c'est déjà ce que fait `FicheClient.test.tsx`, pour la
 * même raison.
 */
const chargerHistoriqueCarte = vi.fn();

vi.mock('../lectures-ecrans', () => ({
  chargerHistoriqueCarte: (id: string) => chargerHistoriqueCarte(id),
}));

const { HistoriqueClient } = await import('./HistoriqueClient');

/**
 * L'écran d'historique d'un client : toutes ses cartes, et le passé de chacune.
 *
 * ## Pourquoi un écran plutôt qu'une section de la fiche
 *
 * `FicheClient` portait une section « Historique » sous un `cartes.length > 1`
 * — donc invisible pour un client qui n'a qu'une carte, c'est-à-dire la
 * majorité. Un historique court reste un historique, et le cacher surprend le
 * jour où il compte.
 *
 * ## Ce que la pile garde, et que rien d'autre ne garde
 *
 * Le montant d'une ligne est `soldeRestituable`, jamais `mise × misesEncaissees`.
 * La première mise de chaque carte est la commission du collecteur (cahier des
 * charges, lignes 57 et 137), donc la multiplication naïve annonce **une mise
 * de trop** — 155 000 au lieu de 150 000 sur une carte pleine à 5 000. Sur
 * l'écran même où un client vient contester une somme.
 */

afterEach(cleanup);

const MISE = 5000;

function CARTE(n: number, statut: 'active' | 'cloturee', encaissees: number): CarteFiche {
  return {
    id: `c${n}`,
    mise: MISE,
    statut,
    misesEncaissees: encaissees,
    ouverteLe: `2026-0${n}-01T08:00:00Z`,
    clotureeLe: statut === 'cloturee' ? `2026-0${n}-28T08:00:00Z` : null,
  };
}

describe('HistoriqueClient — la pile', () => {
  it('montre une ligne par carte', () => {
    render(
      <HistoriqueClient
        nomClient="Konfé Ali"
        cartes={[CARTE(3, 'active', 10), CARTE(2, 'cloturee', 31), CARTE(1, 'cloturee', 12)]}
        onFermer={() => {}}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('montre le solde restituable, pas la somme brute des mises', () => {
    render(
      <HistoriqueClient
        nomClient="Konfé Ali"
        cartes={[CARTE(2, 'cloturee', MISES_PAR_CYCLE)]}
        onFermer={() => {}}
      />,
    );

    // 150 000 et non 155 000. `textContent` parce que le séparateur de milliers
    // est une espace insécable (U+00A0), que le normaliseur de Testing Library
    // écrase en espace ordinaire — l'assertion passerait alors sur le défaut
    // qu'elle doit voir.
    const ligne = screen.getAllByRole('listitem')[0]?.textContent ?? '';
    expect(ligne).toContain(formatMontant(soldeRestituable(MISES_PAR_CYCLE, MISE)));
    expect(ligne).not.toContain(formatMontant(MISES_PAR_CYCLE * MISE));
  });

  it('dit « à restituer » et non « collecté »', () => {
    // Deux nombres différents, et les confondre est précisément le défaut.
    render(
      <HistoriqueClient
        nomClient="Konfé Ali"
        cartes={[CARTE(2, 'cloturee', MISES_PAR_CYCLE)]}
        onFermer={() => {}}
      />,
    );

    expect(screen.getAllByRole('listitem')[0]?.textContent).toContain('à restituer');
  });

  it('dit « Cycle terminé » pour une carte pleine, « Clôturée » sinon', () => {
    render(
      <HistoriqueClient
        nomClient="Konfé Ali"
        cartes={[CARTE(2, 'cloturee', MISES_PAR_CYCLE), CARTE(1, 'cloturee', 12)]}
        onFermer={() => {}}
      />,
    );

    const lignes = screen.getAllByRole('listitem');
    expect(lignes[0]?.textContent).toContain('Cycle terminé');
    expect(lignes[1]?.textContent).toContain('Clôturée');
  });

  it('dit « Actif » pour une carte encore ouverte', () => {
    render(
      <HistoriqueClient nomClient="Konfé Ali" cartes={[CARTE(3, 'active', 10)]} onFermer={() => {}} />,
    );

    expect(screen.getAllByRole('listitem')[0]?.textContent).toContain('Actif');
  });

  it('montre l’historique d’un client qui n’a qu’une carte', () => {
    // `FicheClient` cachait sa section sous `cartes.length > 1`.
    render(
      <HistoriqueClient nomClient="Konfé Ali" cartes={[CARTE(1, 'active', 3)]} onFermer={() => {}} />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('dit ce qu’il n’a pas plutôt que de rendre une liste vide', () => {
    render(<HistoriqueClient nomClient="Konfé Ali" cartes={[]} onFermer={() => {}} />);

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText(/aucune carte/i)).toBeTruthy();
  });

  it('nomme le client dont on lit l’historique', () => {
    // L'écran s'ouvre depuis une fiche, mais le collecteur y revient par la
    // barre du navigateur ou après une interruption. Sans le nom, il ne sait
    // pas de qui il lit les cartes.
    render(
      <HistoriqueClient nomClient="Konfé Ali" cartes={[CARTE(1, 'active', 3)]} onFermer={() => {}} />,
    );

    expect(screen.getByText('Konfé Ali')).toBeTruthy();
  });

  it('ne pagine pas trois cartes', () => {
    // `TAILLE_PAGE` vaut 50. Deux flèches inertes sous trois lignes sont du
    // bruit, et `Pagination` rend `null` — cette épreuve garde le branchement.
    render(
      <HistoriqueClient
        nomClient="Konfé Ali"
        cartes={[CARTE(3, 'active', 10), CARTE(2, 'cloturee', 31), CARTE(1, 'cloturee', 12)]}
        onFermer={() => {}}
      />,
    );

    expect(screen.queryByLabelText('Aller à la page')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });

  it('pagine au-delà d’une page, et n’en montre qu’une à la fois', () => {
    // Identifiants distincts : deux `key` identiques feraient rendre une seule
    // ligne à React, et l'épreuve accuserait la pagination d'un défaut de
    // montage.
    const beaucoup = Array.from({ length: 60 }, (_, i) => ({
      ...CARTE(1, 'cloturee', (i % 30) + 1),
      id: `c${i}`,
    }));

    render(<HistoriqueClient nomClient="Konfé Ali" cartes={beaucoup} onFermer={() => {}} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(50);
    expect(screen.getByLabelText('Aller à la page')).toBeTruthy();
  });
});

/**
 * Le niveau 2 : le passé d'une carte.
 *
 * ## Pourquoi il n'y a aucune pagination ici
 *
 * Ce n'est pas un oubli, c'est le point du dessin. Une carte porte
 * `MISES_PAR_CYCLE` cases donc au plus 31 mises, et `retraits.carte_id` est
 * unique donc au plus un retrait. Trente-deux lignes, pour toujours, garanties
 * par le schéma et non par une convention. Les deux épreuves ci-dessous
 * gardent cette absence — sans elles, quelqu'un « rétablirait » la pagination
 * par symétrie avec le niveau 1.
 */
describe('HistoriqueClient — le détail d’une carte', () => {
  beforeEach(() => {
    // Le cache de `useDonnees` est un `Map` de module : sans ce vidage, la
    // deuxième épreuve lirait les événements montés par la première, sous la
    // même clé.
    viderCache();
    chargerHistoriqueCarte.mockReset();
    chargerHistoriqueCarte.mockResolvedValue([
      { id: 'r1', genre: 'retrait', montant: 148000, date: '2026-02-28T08:00:00Z', estCommission: false },
      { id: 'm2', genre: 'mise', montant: MISE, date: '2026-02-02T08:00:00Z', estCommission: false },
      { id: 'm1', genre: 'mise', montant: MISE, date: '2026-02-01T08:00:00Z', estCommission: true },
    ]);
  });

  function ouvrirPremiereCarte() {
    render(
      <HistoriqueClient
        nomClient="Konfé Ali"
        cartes={[CARTE(2, 'cloturee', MISES_PAR_CYCLE)]}
        onFermer={() => {}}
      />,
    );
    fireEvent.click(screen.getAllByRole('listitem')[0]!.querySelector('button')!);
  }

  it('ouvre la carte et montre ses événements', async () => {
    ouvrirPremiereCarte();

    expect(await screen.findByText(/retrait/i)).toBeTruthy();
    expect(chargerHistoriqueCarte).toHaveBeenCalledWith('c2');
  });

  it('rend le montant enregistré du retrait, et non un recalcul', async () => {
    // 148 000 et non 150 000 : le montage écarte volontairement les deux
    // nombres. Le niveau 1 calcule `soldeRestituable` ; le niveau 2 lit la
    // ligne écrite le jour du retrait. Les confondre serait arbitrer en
    // silence lequel a raison, sur de l'argent déjà versé.
    ouvrirPremiereCarte();

    const lignes = await screen.findAllByRole('listitem');
    expect(lignes[0]?.textContent).toContain(formatMontant(148000));
  });

  it('marque la mise qui est la commission du collecteur', async () => {
    // Sans ce repère, l'écran listerait trente-et-une mises de 5 000 sous un
    // solde restituable de 150 000, et le client compterait 155 000.
    ouvrirPremiereCarte();

    const lignes = await screen.findAllByRole('listitem');
    expect(lignes[lignes.length - 1]?.textContent).toMatch(/commission/i);
    expect(lignes[lignes.length - 2]?.textContent).not.toMatch(/commission/i);
  });

  it('ne pagine jamais le détail — 32 lignes au maximum, par construction', async () => {
    chargerHistoriqueCarte.mockResolvedValue(
      Array.from({ length: MISES_PAR_CYCLE }, (_, i) => ({
        id: `m${i}`,
        genre: 'mise' as const,
        montant: MISE,
        date: `2026-02-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
        estCommission: i === 0,
      })),
    );

    ouvrirPremiereCarte();

    expect(await screen.findAllByRole('listitem')).toHaveLength(MISES_PAR_CYCLE);
    expect(screen.queryByLabelText('Aller à la page')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });

  it('revient à la pile par la flèche de l’en-tête', async () => {
    const fermetures: number[] = [];
    render(
      <HistoriqueClient
        nomClient="Konfé Ali"
        cartes={[CARTE(2, 'cloturee', MISES_PAR_CYCLE), CARTE(1, 'cloturee', 12)]}
        onFermer={() => fermetures.push(1)}
      />,
    );
    fireEvent.click(screen.getAllByRole('listitem')[0]!.querySelector('button')!);
    await screen.findByText(/retrait/i);

    fireEvent.click(screen.getByLabelText('Revenir aux cartes'));

    // La pile, et non l'écran appelant : la flèche du niveau 2 remonte d'un
    // cran. `onFermer` ne doit pas avoir été appelé.
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    expect(fermetures).toEqual([]);
  });
});
