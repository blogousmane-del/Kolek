import { describe, expect, it, vi } from 'vitest';

import { carte, client, tournee } from './hors-ligne/fabriques';
import { tourneeVide, type Tournee } from './hors-ligne/modele';
import { TourneeAbsente } from './hors-ligne/vues';

/**
 * L'accueil et la liste des clients lisent le téléphone, jamais le réseau
 * (spec J2b §5.4).
 *
 * L'épreuve « au-delà de mille lignes » qui vivait ici a suivi la pagination
 * là où elle est partie : `hors-ligne/rafraichir.test.ts`, et contre le vrai
 * PostgREST, `supabase/tests/lectures-paginees.test.ts`.
 */

const lectureCourante = vi.fn();

vi.mock('./hors-ligne/moteur', () => ({ lectureCourante: () => lectureCourante() }));

const { chargerListeClients, chargerTableauCollecteur } = await import('./lectures');

const lu = (t: Tournee) => ({ tournee: t, operations: [], refus: [], profil: null });

describe('les lectures de la collecte', () => {
  it('calculent sur la tournée gardée', async () => {
    lectureCourante.mockResolvedValue(
      lu(tournee({ clients: [client('c1', 'Awa')], cartes: [carte('k1', 'c1')] })),
    );

    expect((await chargerTableauCollecteur()).clients).toBe(1);
    expect((await chargerListeClients()).clients.map((c) => c.nom)).toEqual(['Awa']);
  });

  it('disent que la tournée manque, plutôt que de rendre une liste vide', async () => {
    lectureCourante.mockResolvedValue(lu(tourneeVide()));

    await expect(chargerTableauCollecteur()).rejects.toThrow(TourneeAbsente);
    await expect(chargerListeClients()).rejects.toThrow(TourneeAbsente);
  });
});
