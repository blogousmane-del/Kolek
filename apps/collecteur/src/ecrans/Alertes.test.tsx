import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { viderCache } from '../cache';
import { carte, client, operationMise, tournee } from '../hors-ligne/fabriques';
import { chargeUtileDe } from '../hors-ligne/modele';

/**
 * Les refus sur l'écran des alertes (spec J2b §8.4).
 *
 * Le fait mesuré : un refus se lit sans réseau, et sa présence interdit « Rien
 * à signaler ». Les autres alertes viennent du serveur ; sans réseau, l'écran
 * le dit au lieu de se taire.
 */

const chargerAlertes = vi.fn();
vi.mock('../lectures-ecrans', () => ({ chargerAlertes: () => chargerAlertes() }));

let etatHorsLigne: Record<string, unknown> = {};
vi.mock('../hors-ligne/useHorsLigne', () => ({ useHorsLigne: () => etatHorsLigne }));

const { Alertes } = await import('./Alertes');

const MISE_REFUSEE = operationMise(1, { carteId: 'k1' });
const REFUS = {
  id: MISE_REFUSEE.id,
  motif: 'CARTE_CLOTUREE',
  chargeUtile: chargeUtileDe(MISE_REFUSEE),
  creeLe: MISE_REFUSEE.faiteLe,
};

beforeEach(() => {
  etatHorsLigne = {
    operations: [],
    refus: [],
    tournee: tournee({ clients: [client('c1', 'Awa')], cartes: [carte('k1', 'c1')] }),
    file: null,
    stockage: 'persistant',
  };
});

afterEach(() => {
  cleanup();
  chargerAlertes.mockReset();
  // Le cache de `useDonnees` survit au démontage : sans cette purge, une
  // épreuve relirait les alertes de la précédente.
  viderCache();
});

function afficher() {
  render(<Alertes onRetour={() => {}} revision={0} />);
}

describe('les refus en tête des alertes (§8.4)', () => {
  it('se lisent sans réseau : client, montant, motif et heure du geste', async () => {
    chargerAlertes.mockRejectedValue(new Error('réseau'));
    etatHorsLigne = { ...etatHorsLigne, refus: [REFUS] };
    afficher();

    expect(await screen.findByText('Les autres alertes demandent le réseau.')).toBeTruthy();
    // Espaces ordinaires : `getByText` ramène l'insécable de `formatMontant` à
    // une espace avant de comparer.
    expect(screen.getByText('Awa — mise de 1 000 FCFA')).toBeTruthy();
    expect(screen.getByText('La carte avait été clôturée.')).toBeTruthy();
    expect(screen.getByText(/^Geste du /)).toBeTruthy();
    expect(screen.getByText('1 refusée')).toBeTruthy();
  });

  it('empêchent « Rien à signaler », même quand le serveur n’a rien', async () => {
    chargerAlertes.mockResolvedValue([]);
    etatHorsLigne = {
      ...etatHorsLigne,
      operations: [
        operationMise(2, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CYCLE_COMPLET' }),
      ],
    };
    afficher();
    // Laisser la lecture des autres alertes aboutir : c'est après elle que
    // « Rien à signaler » apparaîtrait.
    await act(async () => {});

    expect(screen.getByText('Le cycle de 31 mises était déjà complet.')).toBeTruthy();
    expect(
      screen.getByText('Rien n’est effacé : chaque opération refusée est gardée telle quelle, avec son motif.'),
    ).toBeTruthy();
    expect(screen.queryByText('Rien à signaler')).toBeNull();
  });

  it('sans refus ni réseau, disent que l’écran demande le réseau, et rien de rassurant', async () => {
    chargerAlertes.mockRejectedValue(new Error('réseau'));
    afficher();

    expect(await screen.findByText('Cet écran demande le réseau.')).toBeTruthy();
    expect(screen.getByText('Réseau requis')).toBeTruthy();
    expect(screen.queryByText('Rien à signaler')).toBeNull();
    expect(screen.queryByText('Rien d’urgent')).toBeNull();
  });

  it('laissent « Rien à signaler » quand rien n’est refusé ni à faire', async () => {
    chargerAlertes.mockResolvedValue([]);
    afficher();

    expect(await screen.findByText('Rien à signaler')).toBeTruthy();
  });
});
