import 'fake-indexeddb/auto';

import { AuthRetryableFetchError, AuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Issue } from './envoyer';
import { carte, client, operationClientCarte, operationMise, tournee } from './fabriques';
import type { Operation } from './modele';
import {
  CLE_INSTANTANE,
  effacerDonneesDeTournee,
  fermerBases,
  lireOperations,
  lireRefus,
  lireTournee,
  ouvrirBase,
  type BaseLocale,
} from './stockage-local';
import { passe } from './synchroniseur';

const T = Date.parse('2026-09-13T09:00:00.000Z');

const accepte = vi.fn(async (..._args: unknown[]) => ({ issue: 'acceptee' as const }));

beforeEach(async () => {
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
  // Partagé par plusieurs épreuves : sans cette remise à zéro, « non appelé »
  // compterait les appels de l'épreuve précédente.
  accepte.mockClear();
});

function authFactice(options: {
  session?: { user: { id: string } } | null;
  erreur?: unknown;
  renouvellement?: { data: { session: { user: { id: string } } | null }; error: unknown };
} = {}) {
  const refreshSession = vi.fn(async () =>
    options.renouvellement ?? { data: { session: { user: { id: 'col-1' } } }, error: null },
  );
  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: options.session === undefined ? { user: { id: 'col-1' } } : options.session },
        error: options.erreur ?? null,
      })),
      refreshSession,
    },
  };
  return { client: client as unknown as SupabaseClient, refreshSession };
}

/** La session change sous la passe : un autre compte s'est connecté pendant un envoi. */
function sessionDevient(c: SupabaseClient, id: string) {
  (c.auth.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { session: { user: { id } } },
    error: null,
  });
}

async function baseAvec(...operations: Operation[]): Promise<BaseLocale> {
  const base = await ouvrirBase('col-1');
  await base.put(
    'tournee',
    tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1'), carte('k2', 'c1')] }),
    CLE_INSTANTANE,
  );
  for (const op of operations) await base.add('file', op);
  return base;
}

/** Un envoi scénarisé : une issue par appel, dans l'ordre, puis « acceptée ». */
function envoiScenarise(...issues: Issue[]) {
  return vi.fn(async (_client: SupabaseClient, _op: Operation) => issues.shift() ?? { issue: 'acceptee' as const });
}

describe('une file vide', () => {
  it('ne demande même pas la session', async () => {
    const { client: c } = authFactice();
    const base = await baseAvec();

    expect(await passe({ client: c, base, collecteurId: 'col-1', maintenant: () => T })).toEqual({
      etat: 'vide',
      reveil: null,
      traitees: 0,
    });
    expect(c.auth.getSession).not.toHaveBeenCalled();
  });
});

describe('l’ordre (§6.6)', () => {
  it('envoie dans l’ordre du geste, retire, et porte chaque mise dans l’instantané', async () => {
    const base = await baseAvec(
      operationMise(2, { carteId: 'k1' }),
      operationMise(1, { carteId: 'k2' }),
      operationMise(3, { carteId: 'k1' }),
    );
    const envoyer = envoiScenarise();

    const bilan = await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer });

    expect(bilan).toEqual({ etat: 'vide', reveil: null, traitees: 3 });
    expect(envoyer.mock.calls.map(([, op]) => op.sequence)).toEqual([1, 2, 3]);
    const { tournee: t, operations } = await lireTournee(base);
    expect(operations).toEqual([]);
    expect(t.cartes.map((k) => k.misesEncaissees)).toEqual([2, 1]);
  });

  it('s’arrête au premier échec passager : les suivantes attendent', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }), operationMise(2, { carteId: 'k1' }));
    const envoyer = envoiScenarise({ issue: 'passager' });

    const bilan = await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer });

    expect(bilan.etat).toBe('hors_ligne');
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(await lireOperations(base)).toHaveLength(2);
  });

  it('annonce chaque opération sortie de la file, et non la passe entière', async () => {
    const base = await baseAvec(
      operationMise(1, { carteId: 'k1' }),
      operationMise(2, { carteId: 'k1' }),
      operationMise(3, { carteId: 'k1' }),
    );
    const surProgres = vi.fn();
    // Ce que `surProgres` avait déjà annoncé au moment de chaque envoi. C'est la
    // seule chose qui distingue « pendant la passe » de « à la fin » : une
    // annonce unique posée après la boucle rendrait [0, 0, 0] tout en gardant
    // le compte d'appels juste.
    const annoncesAvantChaqueEnvoi: number[] = [];
    const envoyer = vi.fn(async () => {
      annoncesAvantChaqueEnvoi.push(surProgres.mock.calls.length);
      return { issue: 'acceptee' as const };
    });

    const bilan = await passe({
      client: authFactice().client,
      base,
      collecteurId: 'col-1',
      maintenant: () => T,
      envoyer,
      surProgres,
    });

    expect(bilan.traitees).toBe(3);
    expect(surProgres).toHaveBeenCalledTimes(3);
    expect(annoncesAvantChaqueEnvoi).toEqual([0, 1, 2]);
  });

  it('n’annonce rien quand rien ne sort de la file', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }), operationMise(2, { carteId: 'k1' }));
    const surProgres = vi.fn();

    const bilan = await passe({
      client: authFactice().client,
      base,
      collecteurId: 'col-1',
      maintenant: () => T,
      envoyer: envoiScenarise({ issue: 'passager' }),
      surProgres,
    });

    expect(bilan.etat).toBe('hors_ligne');
    expect(surProgres).not.toHaveBeenCalled();
  });
});

describe('le sursis (§7)', () => {
  it('attend la fin du sursis et sa marge avant d’envoyer', async () => {
    const op = operationMise(1, { carteId: 'k1' }, { envoyableApres: '2026-09-13T09:00:06.000Z' });
    const base = await baseAvec(op);

    const bilan = await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T + 6000, envoyer: accepte });

    expect(bilan).toEqual({ etat: 'attente', reveil: T + 7000, traitees: 0 });
    expect(accepte).not.toHaveBeenCalled();
  });

  it('envoie tout de suite une opération sans sursis', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }));
    const envoyer = envoiScenarise();

    await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer });

    expect(envoyer).toHaveBeenCalledTimes(1);
  });
});

describe('une horloge corrigée en arrière', () => {
  it('ramène un sursis écrit dans le futur, et envoie toute la file', async () => {
    const enAvance = operationMise(1, { carteId: 'k1' }, {
      faiteLe: '2026-10-12T09:00:00.000Z',
      envoyableApres: '2026-10-12T09:00:06.000Z',
    });
    const base = await baseAvec(enAvance, operationMise(2, { carteId: 'k2' }));
    const envoyer = envoiScenarise();

    const bilan = await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer });

    expect(bilan).toEqual({ etat: 'vide', reveil: null, traitees: 2 });
    expect(envoyer).toHaveBeenCalledTimes(2);
  });

  it('ramène un nouvel essai prévu dans le futur, et réessaie', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }, { tentatives: 2, prochainEssai: '2026-10-12T09:01:00.000Z' }));
    const envoyer = envoiScenarise();

    expect((await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer })).etat).toBe('vide');
    expect(envoyer).toHaveBeenCalledTimes(1);
  });

  it('ramène la consignation d’un refus prévue dans le futur', async () => {
    const refusee = operationMise(1, { carteId: 'k1' }, {
      etat: 'refusee_a_consigner',
      motif: 'CARTE_CLOTUREE',
      tentatives: 3,
      prochainEssai: '2026-10-12T09:02:00.000Z',
    });
    const base = await baseAvec(refusee);

    expect((await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, consigner: accepte })).etat).toBe('vide');
    expect(accepte).toHaveBeenCalledTimes(1);
  });

  it('laisse tel quel un essai légitime à dix minutes', async () => {
    const dixMinutes = new Date(T + 600_000).toISOString();
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }, { tentatives: 5, prochainEssai: dixMinutes }));

    expect(await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer: accepte })).toEqual({
      etat: 'attente',
      reveil: T + 600_000,
      traitees: 0,
    });
    expect((await lireOperations(base))[0]!.prochainEssai).toBe(dixMinutes);
  });
});

describe('les refus', () => {
  it('consigne la chaîne dépendante en bloc, sans jamais envoyer l’enfant (§6.6)', async () => {
    const inscription = operationClientCarte(1, { clientId: 'c9', carteId: 'k9' });
    const miseEnfant = operationMise(2, { carteId: 'k9' }, { dependDe: ['op-1'] });
    const base = await baseAvec(inscription, miseEnfant);
    const envoyer = envoiScenarise({ issue: 'refusee', motif: 'ABONNEMENT_INACTIF' });
    const consigner = vi.fn(async () => ({ issue: 'acceptee' as const }));

    const bilan = await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer, consigner });

    expect(bilan).toMatchObject({ etat: 'vide', traitees: 4 });
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect((await lireRefus(base)).map((r) => [r.id, r.motif]).sort()).toEqual([
      ['op-1', 'ABONNEMENT_INACTIF'],
      ['op-2', 'PARENT_REFUSE'],
    ]);
  });

  it('marque l’enfant d’un parent déjà consigné lors d’une passe précédente', async () => {
    const base = await baseAvec(operationMise(2, { carteId: 'k9' }, { dependDe: ['op-1'] }));
    await base.put('refus', {
      id: 'op-1',
      motif: 'ABONNEMENT_INACTIF',
      chargeUtile: { version: 1, type: 'client_carte', charge: operationClientCarte(1, { clientId: 'c9', carteId: 'k9' }).charge, faiteLe: 'x', sequence: 1, dependDe: [] },
      creeLe: 'x',
    });
    const envoyer = envoiScenarise();

    await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer, consigner: accepte });

    expect(envoyer).not.toHaveBeenCalled();
    expect((await lireRefus(base)).find((r) => r.id === 'op-2')?.motif).toBe('PARENT_REFUSE');
  });

  it('ne laisse pas une consignation impossible bloquer la file (précision 5)', async () => {
    const refusee = operationMise(1, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' });
    const suivante = operationMise(2, { carteId: 'k2' });
    const base = await baseAvec(refusee, suivante);
    const consigner = vi.fn(async () => ({ issue: 'refusee' as const, motif: 'DROIT_REFUSE' }));
    const envoyer = envoiScenarise();

    await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer, consigner });

    expect(envoyer).toHaveBeenCalledTimes(1);
    const reste = await lireOperations(base);
    expect(reste).toHaveLength(1);
    expect(reste[0]).toMatchObject({ id: 'op-1', etat: 'refusee_a_consigner', tentatives: 1, prochainEssai: '2026-09-13T09:00:30.000Z' });
  });

  it('consigne INCONNU à la cinquième tentative, 8 min 30 s après la première, puis continue', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }), operationMise(2, { carteId: 'k2' }));
    const envoyer = vi.fn(async (_c: SupabaseClient, op: Operation) =>
      op.id === 'op-1' ? { issue: 'inconnue' as const } : { issue: 'acceptee' as const },
    );
    let horloge = T;
    const deps = { client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => horloge, envoyer, consigner: accepte };

    const reveils: Array<number | null> = [];
    for (const decalage of [0, 30_000, 90_000, 210_000]) {
      horloge = T + decalage;
      reveils.push((await passe(deps)).reveil);
    }
    expect(reveils).toEqual([T + 30_000, T + 90_000, T + 210_000, T + 510_000]);

    horloge = T + 510_000;
    const bilan = await passe(deps);

    expect(bilan.etat).toBe('vide');
    expect(envoyer).toHaveBeenCalledTimes(6);
    expect((await lireRefus(base)).map((r) => r.motif)).toEqual(['INCONNU']);
  });

  it('n’essaie pas plus tôt que prévu, même relancé', async () => {
    const op = operationMise(1, { carteId: 'k1' }, { tentatives: 1, prochainEssai: '2026-09-13T09:00:30.000Z' });
    const base = await baseAvec(op);
    const envoyer = envoiScenarise();

    const bilan = await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T + 1000, envoyer });

    expect(bilan).toMatchObject({ etat: 'attente', reveil: T + 30_000 });
    expect(envoyer).not.toHaveBeenCalled();
  });

  it('garde l’enfant « parent refusé » quand la déconnexion efface la copie des refus', async () => {
    const parent = operationClientCarte(1, { clientId: 'c9', carteId: 'k9' });
    const enfant = operationMise(2, { carteId: 'k9' }, { dependDe: ['op-1'], envoyableApres: '2026-09-13T09:00:06.000Z' });
    const base = await baseAvec(parent, enfant);
    const envoyer = envoiScenarise({ issue: 'refusee', motif: 'ABONNEMENT_INACTIF' });
    const deps = { client: authFactice().client, base, collecteurId: 'col-1', envoyer, consigner: accepte };

    // L'enfant est encore dans son sursis : marqué, mais pas encore consigné — il reste annulable.
    expect(await passe({ ...deps, maintenant: () => T })).toEqual({ etat: 'attente', reveil: T + 7000, traitees: 3 });
    expect((await lireOperations(base)).map((o) => [o.id, o.etat, o.motif])).toEqual([['op-2', 'refusee_a_consigner', 'PARENT_REFUSE']]);

    await effacerDonneesDeTournee(base);

    expect(await passe({ ...deps, maintenant: () => T + 7000 })).toMatchObject({ etat: 'vide' });
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(accepte).toHaveBeenCalledTimes(2);
    expect((await lireRefus(base)).map((r) => [r.id, r.motif])).toEqual([['op-2', 'PARENT_REFUSE']]);
  });
});

describe('la session (§4.5)', () => {
  it('n’envoie jamais sous une autre identité', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }));
    const { client: c } = authFactice({ session: { user: { id: 'col-2' } } });

    expect((await passe({ client: c, base, collecteurId: 'col-1', maintenant: () => T, envoyer: accepte })).etat).toBe('autre_compte');
    expect(accepte).not.toHaveBeenCalled();
  });

  it('attend le réseau quand le jeton ne peut pas être renouvelé faute de réseau', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }));
    const { client: c } = authFactice({ session: null, erreur: new AuthRetryableFetchError('Failed to fetch', 0) });

    expect((await passe({ client: c, base, collecteurId: 'col-1', maintenant: () => T })).etat).toBe('hors_ligne');
    expect(await lireOperations(base)).toHaveLength(1);
  });

  it('s’arrête sur une session finie, et garde la file', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }));
    const { client: c } = authFactice({
      session: null,
      renouvellement: { data: { session: null }, error: new AuthSessionMissingError() },
    });

    expect((await passe({ client: c, base, collecteurId: 'col-1', maintenant: () => T })).etat).toBe('session_finie');
    expect(await lireOperations(base)).toHaveLength(1);
  });

  it('renouvelle le jeton expiré en cours d’envoi, puis reprend', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }));
    const { client: c, refreshSession } = authFactice();
    const envoyer = envoiScenarise({ issue: 'session' });

    const bilan = await passe({ client: c, base, collecteurId: 'col-1', maintenant: () => T, envoyer });

    expect(bilan.etat).toBe('vide');
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(envoyer).toHaveBeenCalledTimes(2);
  });

  it('n’écrit aucun refus reçu sous une autre session, et s’arrête', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }), operationMise(2, { carteId: 'k2' }));
    const { client: c } = authFactice();
    const envoyer = vi.fn(async () => {
      sessionDevient(c, 'col-2');
      return { issue: 'refusee' as const, motif: 'DROIT_REFUSE' };
    });

    expect((await passe({ client: c, base, collecteurId: 'col-1', maintenant: () => T, envoyer })).etat).toBe('autre_compte');
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect((await lireOperations(base)).map((o) => [o.id, o.etat, o.tentatives])).toEqual([
      ['op-1', 'en_attente', 0],
      ['op-2', 'en_attente', 0],
    ]);
  });

  it('ne compte pas une tentative reçue sous une autre session', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }));
    const { client: c } = authFactice();
    const envoyer = vi.fn(async () => {
      sessionDevient(c, 'col-2');
      return { issue: 'inconnue' as const };
    });

    expect((await passe({ client: c, base, collecteurId: 'col-1', maintenant: () => T, envoyer })).etat).toBe('autre_compte');
    expect((await lireOperations(base))[0]).toMatchObject({ etat: 'en_attente', tentatives: 0, prochainEssai: null });
  });

  it('ne reprogramme pas une consignation refusée sous une autre session', async () => {
    const refusee = operationMise(1, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' });
    const base = await baseAvec(refusee);
    const { client: c } = authFactice();
    const consigner = vi.fn(async () => {
      sessionDevient(c, 'col-2');
      return { issue: 'refusee' as const, motif: 'DROIT_REFUSE' };
    });

    expect((await passe({ client: c, base, collecteurId: 'col-1', maintenant: () => T, consigner })).etat).toBe('autre_compte');
    expect((await lireOperations(base))[0]).toMatchObject({ tentatives: 0, prochainEssai: null });
  });
});

describe('la mémoire des étapes', () => {
  it('garde le client accepté même quand la carte n’a pas pu partir', async () => {
    const base = await baseAvec(operationClientCarte(1, { clientId: 'c9', carteId: 'k9' }));
    const envoyer = vi.fn(async (_c: SupabaseClient, _op: Operation, noter: (e: { client: boolean; carte: boolean }) => Promise<void>) => {
      await noter({ client: true, carte: false });
      return { issue: 'passager' as const };
    });

    await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer });

    const [op] = await lireOperations(base);
    expect(op).toMatchObject({ type: 'client_carte', etapes: { client: true, carte: false } });
  });
});

describe('une opération de version 1, écrite par une version antérieure (§9.2)', () => {
  it('est lue et envoyée par le code courant', async () => {
    const base = await baseAvec();
    // Littéral figé : la forme exacte qu'une version 1 publiée écrit sur le disque.
    await base.add('file', {
      version: 1,
      id: 'ancienne',
      sequence: 1,
      collecteurId: 'col-1',
      type: 'mise',
      charge: { id: 'm-ancienne', carteId: 'k1', montant: 1000, encaisseLe: '2026-09-01T08:00:00.000Z' },
      faiteLe: '2026-09-01T08:00:00.000Z',
      envoyableApres: '2026-09-01T08:00:00.000Z',
      dependDe: [],
      etat: 'en_attente',
      tentatives: 0,
      prochainEssai: null,
    });
    const envoyer = envoiScenarise();

    expect((await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer })).etat).toBe('vide');
    expect(envoyer.mock.calls[0]![1]).toMatchObject({ id: 'ancienne', charge: { montant: 1000 } });
  });
});
