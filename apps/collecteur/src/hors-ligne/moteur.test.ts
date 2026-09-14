import 'fake-indexeddb/auto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const passe = vi.fn();
const rafraichir = vi.fn();

vi.mock('./synchroniseur', () => ({ passe: (...args: unknown[]) => passe(...args) }));
vi.mock('./rafraichir', () => ({ rafraichir: (...args: unknown[]) => rafraichir(...args) }));

const {
  apresGeste,
  arreterMoteur,
  collecteurCourant,
  compterFileDe,
  demarrerMoteur,
  ecouterChangements,
  effacerTourneeDe,
  lectureCourante,
  sousVerrou,
} = await import('./moteur');
const { CLE_INSTANTANE, fermerBases, ouvrirBase } = await import('./stockage-local');
const { client: fabriqueClient, operationMise, tournee } = await import('./fabriques');

const CLIENT = {} as SupabaseClient;

beforeEach(async () => {
  arreterMoteur();
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
  passe.mockReset().mockResolvedValue({ etat: 'vide', reveil: null, traitees: 0 });
  rafraichir.mockReset().mockResolvedValue('fait');
});

afterEach(() => {
  arreterMoteur();
  vi.unstubAllGlobals();
});

const laisserTourner = () => new Promise((r) => setTimeout(r, 0));

/** Attend la fin du premier tour — la passe, puis le rechargement — quelle que soit la lenteur d'une ouverture de base à froid. */
const premierTour = async () => {
  await vi.waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(1));
  await laisserTourner();
};

describe('démarrer', () => {
  it('passe et recharge la tournée dès l’ouverture, puis prévient les écrans', async () => {
    const ecouteur = vi.fn();
    ecouterChangements(ecouteur);

    demarrerMoteur(CLIENT, 'col-1');
    await premierTour();

    expect(collecteurCourant()).toBe('col-1');
    expect(passe).toHaveBeenCalledTimes(1);
    expect(passe.mock.calls[0]![0]).toMatchObject({ client: CLIENT, collecteurId: 'col-1' });
    expect(rafraichir).toHaveBeenCalledTimes(1);
    expect(ecouteur).toHaveBeenCalled();
  });

  it('repasse au retour du réseau', async () => {
    demarrerMoteur(CLIENT, 'col-1');
    await premierTour();

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(passe).toHaveBeenCalledTimes(2));

    expect(passe).toHaveBeenCalledTimes(2);
  });

  it('ne répond plus à rien une fois arrêté', async () => {
    const arreter = demarrerMoteur(CLIENT, 'col-1');
    await premierTour();
    arreter();

    window.dispatchEvent(new Event('online'));
    apresGeste();
    await laisserTourner();

    expect(passe).toHaveBeenCalledTimes(1);
    expect(collecteurCourant()).toBeNull();
  });
});

describe('après un geste', () => {
  it('prévient les écrans et demande une passe', async () => {
    demarrerMoteur(CLIENT, 'col-1');
    await premierTour();
    const ecouteur = vi.fn();
    ecouterChangements(ecouteur);

    apresGeste();
    await vi.waitFor(() => expect(passe).toHaveBeenCalledTimes(2));

    expect(ecouteur).toHaveBeenCalled();
    expect(passe).toHaveBeenCalledTimes(2);
  });
});

describe('lire et compter', () => {
  it('lit la tournée du collecteur connecté', async () => {
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ clients: [fabriqueClient('c1')] }), CLE_INSTANTANE);
    await base.add('file', operationMise(1, { carteId: 'k1' }));
    demarrerMoteur(CLIENT, 'col-1');

    const lu = await lectureCourante();

    expect(lu.tournee.clients.map((c) => c.id)).toEqual(['c1']);
    expect(lu.operations).toHaveLength(1);
    expect(lu.profil).toBeNull();
  });

  it('refuse de lire sans collecteur connecté', async () => {
    await expect(lectureCourante()).rejects.toThrow();
  });

  it('compte la file et efface la tournée, sans jamais toucher la file', async () => {
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ clients: [fabriqueClient('c1')] }), CLE_INSTANTANE);
    await base.add('file', operationMise(1, { carteId: 'k1' }));

    await effacerTourneeDe('col-1');

    expect(await compterFileDe('col-1')).toBe(1);
    expect((await base.get('tournee', CLE_INSTANTANE)) ?? null).toBeNull();
  });
});

describe('le verrou entre onglets', () => {
  it('exécute directement là où l’API manque', async () => {
    vi.stubGlobal('navigator', {});
    expect(await sousVerrou('v', async () => 'fait', () => 'occupe')).toBe('fait');
  });

  it('cède la place quand un autre onglet tient le verrou', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: (_nom: string, _o: unknown, rappel: (verrou: unknown) => unknown) => Promise.resolve(rappel(null)) },
    });
    expect(await sousVerrou('v', async () => 'fait', () => 'occupe')).toBe('occupe');
  });
});
