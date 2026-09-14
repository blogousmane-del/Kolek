import 'fake-indexeddb/auto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

import { tableFactice, type Ligne } from '../postgrest-factice';
import { client, operationMise, tournee } from './fabriques';
import { rafraichir } from './rafraichir';
import { CLE_INSTANTANE, compterFile, fermerBases, lireProfil, lireRefus, lireTournee, ouvrirBase } from './stockage-local';

const MAINTENANT = Date.parse('2026-09-13T10:00:00.000Z');
/** Deux jours avant : hors de « la journée en cours » quel que soit le fuseau du poste. */
const AVANT = '2026-09-11T10:00:00.000Z';
const DU_JOUR = '2026-09-13T08:00:00.000Z';
const rang = (i: number) => String(i).padStart(4, '0');

const COLLECTEUR = { id: 'col-1', nom: 'Awa', telephone: '+2250700000000', zone: null, palier: 'pro', abonnement_statut: 'actif', abonnement_echeance: '2026-10-01', titulaire_id: null };

let tables: Record<string, unknown>;

function clientFactice(): SupabaseClient {
  return { from: (table: string) => tables[table] ?? tableFactice([]) } as unknown as SupabaseClient;
}

/** Une table en panne : toute requête rend une erreur. */
function tablePanne() {
  const reponse = { data: null, error: { message: 'panne' }, count: null };
  const chaine = Object.assign(Promise.resolve(reponse), {}) as unknown as Record<string, unknown>;
  for (const methode of ['select', 'eq', 'gte', 'in', 'order', 'range', 'limit']) chaine[methode] = () => chaine;
  chaine.maybeSingle = () => Promise.resolve(reponse);
  return chaine;
}

/** Une table qui compte plus de lignes qu'elle n'en rend. */
function tableComptee(lignes: Ligne[], count: number) {
  const chaine = {
    select: () => chaine,
    order: () => chaine,
    range: (debut: number, fin: number) =>
      Promise.resolve({ data: lignes.slice(debut, fin + 1), error: null, count, status: 200 }),
  };
  return chaine;
}

beforeEach(async () => {
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
  tables = { collecteurs: tableFactice([COLLECTEUR]) };
});

describe('ce qui est chargé (§5.1)', () => {
  it('charge tout au-delà de mille lignes, mises des cartes actives comprises', async () => {
    const n = 1001;
    tables.clients = tableFactice(Array.from({ length: n }, (_, i) => ({ id: `c${rang(i)}`, nom: `Client ${rang(i)}`, telephone: null, marche: null, activite: null, avis_actifs: false })));
    tables.cartes = tableFactice(Array.from({ length: n }, (_, i) => ({ id: `k${rang(i)}`, client_id: `c${rang(i)}`, mise: 500, statut: 'active', mises_encaissees: 1, ouverte_le: AVANT, cloturee_le: null })));
    tables.mises = tableFactice(Array.from({ length: n }, (_, i) => ({ id: `m${rang(i)}`, carte_id: `k${rang(i)}`, montant: 500, encaisse_le: AVANT, est_commission: true })));
    tables.retraits = tableFactice(Array.from({ length: n }, (_, i) => ({ id: `r${rang(i)}`, carte_id: `x${rang(i)}`, montant_restitue: 10, effectue_le: DU_JOUR })));
    const base = await ouvrirBase('col-1');

    expect(await rafraichir(clientFactice(), base, 'col-1', MAINTENANT)).toBe('fait');

    const { tournee: t } = await lireTournee(base);
    expect([t.clients.length, t.cartes.length, t.mises.length, t.retraits.length]).toEqual([n, n, n, n]);
    expect(t.lueLe).toBe('2026-09-13T10:00:00.000Z');
  });

  it('copie les mises du jour d’une carte clôturée, pas celles d’avant', async () => {
    tables.cartes = tableFactice([{ id: 'k1', client_id: 'c1', mise: 500, statut: 'cloturee', mises_encaissees: 2, ouverte_le: AVANT, cloturee_le: DU_JOUR }]);
    tables.mises = tableFactice([
      { id: 'ancienne', carte_id: 'k1', montant: 500, encaisse_le: AVANT, est_commission: true },
      { id: 'du-jour', carte_id: 'k1', montant: 500, encaisse_le: DU_JOUR, est_commission: false },
    ]);
    const base = await ouvrirBase('col-1');

    await rafraichir(clientFactice(), base, 'col-1', MAINTENANT);

    expect((await lireTournee(base)).tournee.mises.map((m) => m.id)).toEqual(['du-jour']);
  });

  it('ne copie pas deux fois la mise du jour d’une carte active', async () => {
    tables.cartes = tableFactice([{ id: 'k1', client_id: 'c1', mise: 500, statut: 'active', mises_encaissees: 1, ouverte_le: AVANT, cloturee_le: null }]);
    tables.mises = tableFactice([{ id: 'm1', carte_id: 'k1', montant: 500, encaisse_le: DU_JOUR, est_commission: true }]);
    const base = await ouvrirBase('col-1');

    await rafraichir(clientFactice(), base, 'col-1', MAINTENANT);

    expect((await lireTournee(base)).tournee.mises).toHaveLength(1);
  });

  it('garde le profil et remplace les refus par ceux du serveur', async () => {
    tables.caisses_jour = tableFactice([{ id: 'd1', date: '2026-09-13', cash_attendu: 1000, cash_declare: 900, ecart: -100 }]);
    tables.synchro_rejets = tableFactice([{ id: 'op-9', motif: 'CARTE_CLOTUREE', charge_utile: { version: 1 }, cree_le: DU_JOUR, traite: false }]);
    const base = await ouvrirBase('col-1');
    await base.put('refus', { id: 'vieux', motif: 'X', chargeUtile: { version: 1, type: 'mise', charge: operationMise(1, { carteId: 'k' }).charge, faiteLe: 'x', sequence: 1, dependDe: [] }, creeLe: 'x' });

    await rafraichir(clientFactice(), base, 'col-1', MAINTENANT);

    expect(await lireProfil(base)).toEqual({
      nom: 'Awa',
      telephone: '+2250700000000',
      zone: null,
      palier: 'pro',
      abonnementStatut: 'actif',
      abonnementEcheance: '2026-10-01',
      titulaireId: null,
      lueLe: '2026-09-13T10:00:00.000Z',
    });
    expect((await lireRefus(base)).map((r) => r.id)).toEqual(['op-9']);
    expect((await lireTournee(base)).tournee.caisses).toEqual([
      { id: 'd1', date: '2026-09-13', cashAttendu: 1000, cashDeclare: 900, ecart: -100 },
    ]);
  });
});

describe('ce qui n’est jamais écrit', () => {
  async function baseAvecAncienInstantane() {
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ clients: [client('c-hier')] }), CLE_INSTANTANE);
    return base;
  }

  it('une tournée amputée : une lecture en panne, et rien ne change', async () => {
    tables.cartes = tablePanne();
    const base = await baseAvecAncienInstantane();

    expect(await rafraichir(clientFactice(), base, 'col-1', MAINTENANT)).toBe('impossible');
    expect((await lireTournee(base)).tournee.clients.map((c) => c.id)).toEqual(['c-hier']);
  });

  it('une liste que le serveur dit plus longue que ce qu’il a rendu (précision 11)', async () => {
    tables.clients = tableComptee([{ id: 'c1', nom: 'A', telephone: null, marche: null, activite: null, avis_actifs: false }], 1200);
    const base = await baseAvecAncienInstantane();

    expect(await rafraichir(clientFactice(), base, 'col-1', MAINTENANT)).toBe('impossible');
    expect((await lireTournee(base)).tournee.clients.map((c) => c.id)).toEqual(['c-hier']);
  });

  it('une tournée sans fiche de collecteur', async () => {
    tables.collecteurs = tableFactice([]);
    const base = await baseAvecAncienInstantane();

    expect(await rafraichir(clientFactice(), base, 'col-1', MAINTENANT)).toBe('impossible');
  });

  it('la file : elle n’est jamais touchée, et reste montrée par-dessus', async () => {
    tables.clients = tableFactice([{ id: 'c1', nom: 'A', telephone: null, marche: null, activite: null, avis_actifs: false }]);
    tables.cartes = tableFactice([{ id: 'k1', client_id: 'c1', mise: 1000, statut: 'active', mises_encaissees: 0, ouverte_le: AVANT, cloturee_le: null }]);
    const base = await ouvrirBase('col-1');
    await base.add('file', operationMise(1, { carteId: 'k1' }));

    await rafraichir(clientFactice(), base, 'col-1', MAINTENANT);

    expect(await compterFile(base)).toBe(1);
    expect((await lireTournee(base)).tournee.cartes[0]!.misesEncaissees).toBe(1);
  });
});

describe('une lecture ne vaut preuve que sur son statut', () => {
  /** postgrest-js réécrit un 404 au corps vide en 204 sans erreur, `data` nul. */
  function tableReecrite() {
    const reponse = { data: null, error: null, count: null, status: 204 };
    const chaine = Object.assign(Promise.resolve(reponse), {}) as unknown as Record<string, unknown>;
    for (const methode of ['select', 'eq', 'gte', 'in', 'order', 'range', 'limit']) chaine[methode] = () => chaine;
    chaine.maybeSingle = () => Promise.resolve(reponse);
    return chaine;
  }

  async function baseDHier() {
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ clients: [client('c-hier')] }), CLE_INSTANTANE);
    return base;
  }

  it.each(['clients', 'cartes', 'mises', 'retraits', 'caisses_jour', 'collecteurs', 'synchro_rejets'])(
    'ne prend pas un 204 sans erreur sur « %s » pour une liste vide : rien ne change',
    async (table) => {
      tables.clients = tableFactice([{ id: 'c1', nom: 'A', telephone: null, marche: null, activite: null, avis_actifs: false }]);
      tables.cartes = tableFactice([{ id: 'k1', client_id: 'c1', mise: 1000, statut: 'active', mises_encaissees: 0, ouverte_le: AVANT, cloturee_le: null }]);
      tables[table] = tableReecrite();
      const base = await baseDHier();

      expect(await rafraichir(clientFactice(), base, 'col-1', MAINTENANT)).toBe('impossible');
      expect((await lireTournee(base)).tournee.clients.map((c) => c.id)).toEqual(['c-hier']);
    },
  );

  it('prend un 206 pour une page lue', async () => {
    const lignes = [{ id: 'c1', nom: 'A', telephone: null, marche: null, activite: null, avis_actifs: false }];
    const chaine = {
      select: () => chaine,
      order: () => chaine,
      range: () => Promise.resolve({ data: lignes, error: null, count: 1, status: 206 }),
    };
    tables.clients = chaine;
    const base = await baseDHier();

    expect(await rafraichir(clientFactice(), base, 'col-1', MAINTENANT)).toBe('fait');
    expect((await lireTournee(base)).tournee.clients.map((c) => c.id)).toEqual(['c1']);
  });
});
