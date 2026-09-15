import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { operationMise, tournee } from './fabriques';
import type { Operation } from './modele';

const lectureCourante = vi.fn();
let ecouteur: () => void = () => {};
let courant: string | null = 'col-1';

vi.mock('./moteur', () => ({
  collecteurCourant: () => courant,
  ecouterChangements: (f: () => void) => {
    ecouteur = f;
    return () => {
      ecouteur = () => {};
    };
  },
  etatDuStockage: () => 'non_garanti',
  lectureCourante: () => lectureCourante(),
}));

const { useHorsLigne } = await import('./useHorsLigne');

afterEach(() => {
  cleanup();
  lectureCourante.mockReset();
  courant = 'col-1';
});

const lu = (operations: Operation[]) => ({ tournee: tournee(), operations, refus: [], profil: null });

describe('le crochet du hors-ligne', () => {
  it('lit la file et l’état du stockage à l’ouverture', async () => {
    lectureCourante.mockResolvedValue(lu([operationMise(1, { carteId: 'k1' })]));

    const { result } = renderHook(() => useHorsLigne());

    await waitFor(() => expect(result.current.file?.mises).toBe(1));
    expect(result.current.stockage).toBe('non_garanti');
  });

  it('relit quand le moteur signale un changement', async () => {
    lectureCourante.mockResolvedValue(lu([]));
    const { result } = renderHook(() => useHorsLigne());
    await waitFor(() => expect(result.current.file?.mises).toBe(0));

    lectureCourante.mockResolvedValue(lu([operationMise(1, { carteId: 'k1' })]));
    act(() => ecouteur());

    await waitFor(() => expect(result.current.file?.mises).toBe(1));
  });

  it('ne laisse pas une lecture lente écraser une plus récente', async () => {
    let finirAncienne: (valeur: unknown) => void = () => {};
    lectureCourante.mockImplementationOnce(
      () =>
        new Promise((resoudre) => {
          finirAncienne = resoudre;
        }),
    );
    lectureCourante.mockResolvedValueOnce(
      lu([operationMise(1, { carteId: 'k1' }), operationMise(2, { carteId: 'k1' })]),
    );

    const { result } = renderHook(() => useHorsLigne());
    act(() => ecouteur());
    await waitFor(() => expect(result.current.file?.mises).toBe(2));

    await act(async () => finirAncienne(lu([])));

    expect(result.current.file?.mises).toBe(2);
  });

  it('ne lit rien sans collecteur connecté', () => {
    courant = null;

    const { result } = renderHook(() => useHorsLigne());

    expect(lectureCourante).not.toHaveBeenCalled();
    expect(result.current.file).toBeNull();
  });
});
