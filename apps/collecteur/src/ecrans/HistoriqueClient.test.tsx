import { formatMontant, MISES_PAR_CYCLE, soldeRestituable } from '@kolek/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { CarteFiche } from '../lectures-ecrans';
import { HistoriqueClient } from './HistoriqueClient';

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
