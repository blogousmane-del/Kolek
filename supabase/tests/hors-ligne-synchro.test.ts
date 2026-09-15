import 'fake-indexeddb/auto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { consigner } from '../../apps/collecteur/src/hors-ligne/envoyer';
import { ajouter } from '../../apps/collecteur/src/hors-ligne/file';
import {
  construireCaisse,
  construireClientCarte,
  construireMise,
} from '../../apps/collecteur/src/hors-ligne/gestes';
import type { Operation } from '../../apps/collecteur/src/hors-ligne/modele';
import { rafraichir } from '../../apps/collecteur/src/hors-ligne/rafraichir';
import {
  compterFile,
  fermerBases,
  lireOperations,
  lireRefus,
  lireTournee,
  ouvrirBase,
  type BaseLocale,
} from '../../apps/collecteur/src/hors-ligne/stockage-local';
import { passe } from '../../apps/collecteur/src/hors-ligne/synchroniseur';
import { admin, connecterAvec, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le hors-ligne contre la vraie base : clé anonyme, session du collecteur, RLS
 * active, déclencheurs réels. C'est ici que « aucune perte, aucun doublon » se
 * prouve — pas dans les épreuves de l'application, qui simulent le serveur.
 *
 * Le stockage du téléphone est `fake-indexeddb`, en mémoire. Le réseau est un
 * `fetch` qu'on tient : couper, perdre une réponse après l'écriture, rendre un
 * jeton expiré.
 */

afterAll(nettoyer);

beforeEach(async () => {
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
});

interface Reseau {
  coupe: boolean;
  /** La prochaine écriture arrive au serveur, puis sa réponse se perd. */
  perdreProchaineReponse: boolean;
  /** La prochaine requête d'API répond 401, jeton expiré. */
  expirerProchaineRequete: boolean;
  /** Nombre d'écritures encore permises avant la coupure. `null` : aucune coupure prévue. */
  ecrituresAvantCoupure: number | null;
  /** Nombre d'écritures encore permises avant que la suivante perde sa réponse, comme `perdreProchaineReponse`. `null` : aucune prévue au-delà. */
  ecrituresAvantPerte: number | null;
  /** Nombre de requêtes `POST` vues vers `/clients`, quelle qu'en soit l'issue. */
  requetesInsertionClients: number;
  fetch: typeof globalThis.fetch;
}

function reseauFactice(): Reseau {
  const r: Reseau = {
    coupe: false,
    perdreProchaineReponse: false,
    expirerProchaineRequete: false,
    ecrituresAvantCoupure: null,
    ecrituresAvantPerte: null,
    requetesInsertionClients: 0,
    fetch: async (entree, init) => {
      const adresse = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
      const methode = (init?.method ?? 'GET').toUpperCase();
      const api = adresse.includes('/rest/v1/');
      const ecriture = api && methode !== 'GET' && methode !== 'HEAD';
      if (methode === 'POST' && adresse.includes('/rest/v1/clients')) r.requetesInsertionClients += 1;

      if (r.coupe) throw new TypeError('Failed to fetch');
      if (api && r.expirerProchaineRequete) {
        r.expirerProchaineRequete = false;
        return new Response(JSON.stringify({ code: 'PGRST303', message: 'JWT expired', details: null, hint: null }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (ecriture && r.ecrituresAvantCoupure !== null) {
        if (r.ecrituresAvantCoupure === 0) throw new TypeError('Failed to fetch');
        r.ecrituresAvantCoupure -= 1;
      }
      if (ecriture && r.ecrituresAvantPerte !== null) {
        if (r.ecrituresAvantPerte === 0) {
          r.ecrituresAvantPerte = null;
          await fetch(entree, init);
          throw new TypeError('Failed to fetch');
        }
        r.ecrituresAvantPerte -= 1;
      }
      if (ecriture && r.perdreProchaineReponse) {
        r.perdreProchaineReponse = false;
        await fetch(entree, init);
        throw new TypeError('Failed to fetch');
      }
      return fetch(entree, init);
    },
  };
  return r;
}

const telephone = () => `+22507${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

interface Poste {
  c: CollecteurTest;
  reseau: Reseau;
  client: SupabaseClient;
  base: BaseLocale;
}

async function poste(nom: string): Promise<Poste> {
  const c = await creerCollecteur(nom, telephone());
  const reseau = reseauFactice();
  const client = await connecterAvec(c, reseau.fetch);
  return { c, reseau, client, base: await ouvrirBase(c.id) };
}

async function carteEnLigne(p: Poste, mise = 1000): Promise<{ clientId: string; carteId: string }> {
  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();
  const r1 = await p.c.client.from('clients').insert({ id: clientId, collecteur_id: p.c.id, nom: 'Cliente' });
  if (r1.error) throw r1.error;
  const r2 = await p.c.client.from('cartes').insert({ id: carteId, collecteur_id: p.c.id, client_id: clientId, mise });
  if (r2.error) throw r2.error;
  return { clientId, carteId };
}

async function geste<O extends Operation>(p: Poste, construire: Parameters<typeof ajouter<O>>[1]): Promise<O> {
  const r = await ajouter(p.base, construire);
  if (!r.ok) throw new Error(`geste refusé : ${r.echec.code}`);
  return r.operation;
}

const ctx = (p: Poste) => ({ collecteurId: p.c.id, maintenant: Date.now() });
const deps = (p: Poste) => ({ client: p.client, base: p.base, collecteurId: p.c.id });

async function misesDeLaCarte(carteId: string) {
  const { data, error } = await admin.from('mises').select('id, montant, est_commission').eq('carte_id', carteId);
  if (error) throw error;
  return data;
}

async function compteurDe(carteId: string): Promise<number> {
  const { data, error } = await admin.from('cartes').select('mises_encaissees').eq('id', carteId).single();
  if (error) throw error;
  return data.mises_encaissees as number;
}

describe('J2b contre la base locale', () => {
  it('1. réponse perdue : une ligne, un jour de plus, une seule fois', async () => {
    const p = await poste('Perdue');
    const { carteId } = await carteEnLigne(p);
    expect(await rafraichir(p.client, p.base, p.c.id)).toBe('fait');
    const op = await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date() }));

    p.reseau.perdreProchaineReponse = true;
    expect((await passe(deps(p))).etat).toBe('hors_ligne');
    expect(await compterFile(p.base)).toBe(1);
    expect(await misesDeLaCarte(carteId)).toHaveLength(1);

    expect((await passe(deps(p))).etat).toBe('vide');
    expect((await misesDeLaCarte(carteId)).map((m) => m.id)).toEqual([op.charge.id]);
    expect(await compteurDe(carteId)).toBe(1);
    const { count } = await admin.from('synchro_rejets').select('id', { count: 'exact', head: true }).eq('collecteur_id', p.c.id);
    expect(count).toBe(0);
  });

  it('2. carte clôturée pendant l’attente : un refus consigné, charge complète, jamais deux', async () => {
    const p = await poste('Close');
    const { carteId } = await carteEnLigne(p);
    await rafraichir(p.client, p.base, p.c.id);
    const op = await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date() }));
    const clot = await admin.from('cartes').update({ statut: 'cloturee', cloturee_le: new Date().toISOString() }).eq('id', carteId);
    expect(clot.error).toBeNull();

    expect((await passe(deps(p))).etat).toBe('vide');

    const { data: rejets } = await admin.from('synchro_rejets').select('id, motif, charge_utile, traite').eq('collecteur_id', p.c.id);
    expect(rejets).toEqual([
      {
        id: op.id,
        motif: 'CARTE_CLOTUREE',
        traite: false,
        charge_utile: { version: 1, type: 'mise', charge: op.charge, faiteLe: op.faiteLe, sequence: op.sequence, dependDe: [] },
      },
    ]);
    expect(await misesDeLaCarte(carteId)).toEqual([]);

    // La consignation rejouée — la réponse s'était perdue — ne crée rien de plus.
    expect(await consigner(p.client, { ...op, etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' })).toEqual({ issue: 'acceptee' });
    const { count } = await admin.from('synchro_rejets').select('id', { count: 'exact', head: true }).eq('collecteur_id', p.c.id);
    expect(count).toBe(1);
    expect((await lireRefus(p.base)).map((r) => r.motif)).toEqual(['CARTE_CLOTUREE']);
  });

  it('3. abonnement suspendu pendant l’attente : la chaîne entière consignée, aucune ligne orpheline', async () => {
    const p = await poste('Suspendu');
    await rafraichir(p.client, p.base, p.c.id);
    const inscription = await geste(
      p,
      construireClientCarte({ ...ctx(p), abonnementStatut: 'actif' }, { nom: 'Nouvelle', mise: 1000 }),
    );
    const mise = await geste(
      p,
      construireMise(ctx(p), { carteId: inscription.charge.carte.id, montant: 1000, encaisseLe: new Date() }),
    );
    expect(mise.dependDe).toEqual([inscription.id]);
    const suspension = await admin.from('collecteurs').update({ abonnement_statut: 'suspendu' }).eq('id', p.c.id);
    expect(suspension.error).toBeNull();

    expect((await passe(deps(p))).etat).toBe('vide');

    const { data: rejets } = await admin.from('synchro_rejets').select('id, motif').eq('collecteur_id', p.c.id).order('motif');
    expect(rejets).toEqual([
      { id: inscription.id, motif: 'ABONNEMENT_INACTIF' },
      { id: mise.id, motif: 'PARENT_REFUSE' },
    ]);
    for (const [table, id] of [
      ['clients', inscription.charge.client.id],
      ['cartes', inscription.charge.carte.id],
      ['mises', mise.charge.id],
    ] as const) {
      const { count } = await admin.from(table).select('id', { count: 'exact', head: true }).eq('id', id);
      expect(count, table).toBe(0);
    }
  });

  it('4a. caisse sur une ligne existante, déclarée deux fois : la dernière gagne, à chaque rejeu', async () => {
    const p = await poste('Caisse');
    const existante = await p.c.client.from('caisses_jour').insert({ collecteur_id: p.c.id, date: aujourdhui(), cash_declare: 3000 });
    expect(existante.error).toBeNull();
    // Sans rafraîchir : le téléphone ignore la ligne, et tire son propre identifiant.
    await geste(p, construireCaisse(ctx(p), { date: aujourdhui(), montant: 5000 }));
    await geste(p, construireCaisse(ctx(p), { date: aujourdhui(), montant: 7000 }));

    expect((await passe(deps(p))).etat).toBe('vide');
    await geste(p, construireCaisse(ctx(p), { date: aujourdhui(), montant: 7000 }));
    expect((await passe(deps(p))).etat).toBe('vide');

    const { data } = await admin.from('caisses_jour').select('cash_declare').eq('collecteur_id', p.c.id);
    expect(data).toEqual([{ cash_declare: 7000 }]);
  });

  it('4b. caisse sans ligne, déclarée deux fois : une ligne, la dernière déclaration', async () => {
    const p = await poste('Caisse neuve');
    await geste(p, construireCaisse(ctx(p), { date: aujourdhui(), montant: 4000 }));
    await geste(p, construireCaisse(ctx(p), { date: aujourdhui(), montant: 6000 }));

    expect((await passe(deps(p))).etat).toBe('vide');

    const { data } = await admin.from('caisses_jour').select('cash_declare').eq('collecteur_id', p.c.id);
    expect(data).toEqual([{ cash_declare: 6000 }]);
  });

  it('5. mise vieille de 91 jours : DATE_INVALIDE consigné, jamais réessayé', async () => {
    const p = await poste('Ancienne');
    const { carteId } = await carteEnLigne(p);
    await rafraichir(p.client, p.base, p.c.id);
    await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date(Date.now() - 91 * 86_400_000) }));

    expect((await passe(deps(p))).etat).toBe('vide');

    expect((await lireRefus(p.base)).map((r) => r.motif)).toEqual(['DATE_INVALIDE']);
    expect(await misesDeLaCarte(carteId)).toEqual([]);
    expect(await lireOperations(p.base)).toEqual([]);
  });

  it('6. jeton expiré au milieu de l’envoi : renouvelé, repris, aucun doublon', async () => {
    const p = await poste('Expire');
    const { carteId } = await carteEnLigne(p);
    await rafraichir(p.client, p.base, p.c.id);
    await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date() }));
    const avant = (await p.client.auth.getSession()).data.session?.access_token;

    p.reseau.expirerProchaineRequete = true;
    expect((await passe(deps(p))).etat).toBe('vide');

    expect((await p.client.auth.getSession()).data.session?.access_token).not.toBe(avant);
    expect(await misesDeLaCarte(carteId)).toHaveLength(1);
  });

  it('7. envoi interrompu au milieu : au redémarrage, le reste part une fois', async () => {
    const p = await poste('Interrompu');
    const { carteId } = await carteEnLigne(p);
    await rafraichir(p.client, p.base, p.c.id);
    for (let i = 0; i < 3; i += 1) {
      await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date() }));
    }

    p.reseau.ecrituresAvantCoupure = 1;
    expect((await passe(deps(p))).etat).toBe('hors_ligne');
    expect(await compterFile(p.base)).toBe(2);

    // Le téléphone redémarre : la base se rouvre, le réseau revient.
    await fermerBases();
    p.base = await ouvrirBase(p.c.id);
    p.reseau.ecrituresAvantCoupure = null;
    expect((await passe(deps(p))).etat).toBe('vide');

    expect(await misesDeLaCarte(carteId)).toHaveLength(3);
    expect(await compteurDe(carteId)).toBe(3);
  });

  it('8. une tournée complète hors ligne : les totaux du serveur égalent ceux du téléphone', async () => {
    const p = await poste('Tournee');
    const cartes: string[] = [];
    for (let i = 0; i < 10; i += 1) cartes.push((await carteEnLigne(p)).carteId);
    await rafraichir(p.client, p.base, p.c.id);

    p.reseau.coupe = true;
    for (const carteId of cartes) {
      for (let j = 0; j < 5; j += 1) {
        await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date() }));
      }
    }
    const inscrits = [];
    for (const nom of ['Premiere', 'Seconde']) {
      const op = await geste(p, construireClientCarte({ ...ctx(p), abonnementStatut: 'actif' }, { nom, mise: 1000 }));
      await geste(p, construireMise(ctx(p), { carteId: op.charge.carte.id, montant: 1000, encaisseLe: new Date() }));
      inscrits.push(op);
    }
    const { construireCarte } = await import('../../apps/collecteur/src/hors-ligne/gestes');
    await geste(p, construireCarte({ ...ctx(p), abonnementStatut: 'actif' }, { clientId: inscrits[0]!.charge.client.id, mise: 2000 }));
    await geste(p, construireCaisse(ctx(p), { date: aujourdhui(), montant: 52_000 }));

    expect((await passe(deps(p))).etat).toBe('hors_ligne');
    const { tournee: telephone } = await lireTournee(p.base);

    p.reseau.coupe = false;
    expect((await passe(deps(p))).etat).toBe('vide');

    const { data: mises } = await admin.from('mises').select('montant, est_commission').eq('collecteur_id', p.c.id);
    const { data: cartesServeur } = await admin.from('cartes').select('id, mises_encaissees').eq('collecteur_id', p.c.id);
    const { data: caisses } = await admin.from('caisses_jour').select('cash_declare').eq('collecteur_id', p.c.id);
    const { count: clients } = await admin.from('clients').select('id', { count: 'exact', head: true }).eq('collecteur_id', p.c.id);

    const somme = (l: Array<{ montant: number }>) => l.reduce((t, m) => t + m.montant, 0);
    expect(mises!.length).toBe(telephone.mises.length);
    expect(mises!.length).toBe(52);
    expect(somme(mises!)).toBe(somme(telephone.mises));
    expect(mises!.filter((m) => m.est_commission).length).toBe(telephone.mises.filter((m) => m.estCommission).length);
    expect(Object.fromEntries(cartesServeur!.map((k) => [k.id, k.mises_encaissees]))).toEqual(
      Object.fromEntries(telephone.cartes.map((k) => [k.id, k.misesEncaissees])),
    );
    expect(caisses).toEqual([{ cash_declare: telephone.caisses[0]!.cashDeclare }]);
    expect(clients).toBe(telephone.clients.length);
    expect(await compterFile(p.base)).toBe(0);
  }, 120_000);
});

describe('ce que seul le vrai serveur prouve', () => {
  it('inscription dont la réponse s’est perdue, client renommé entre-temps : la relecture par identité l’accepte, le nom renommé reste', async () => {
    const p = await poste('Renomme');
    const inscription = await geste(
      p,
      construireClientCarte({ ...ctx(p), abonnementStatut: 'actif' }, { nom: 'Ancienne Fiche', mise: 1000 }),
    );

    p.reseau.perdreProchaineReponse = true;
    expect((await passe(deps(p))).etat).toBe('hors_ligne');
    const { count: clientsAvant } = await admin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('id', inscription.charge.client.id);
    expect(clientsAvant).toBe(1);
    const { count: cartesAvant } = await admin
      .from('cartes')
      .select('id', { count: 'exact', head: true })
      .eq('id', inscription.charge.carte.id);
    expect(cartesAvant).toBe(0);

    const renomme = await admin
      .from('clients')
      .update({ nom: 'Nom Corrige Par Admin' })
      .eq('id', inscription.charge.client.id);
    expect(renomme.error).toBeNull();

    expect((await passe(deps(p))).etat).toBe('vide');

    const { data: clients } = await admin.from('clients').select('id, nom').eq('id', inscription.charge.client.id);
    expect(clients).toEqual([{ id: inscription.charge.client.id, nom: 'Nom Corrige Par Admin' }]);
    const { count: cartes } = await admin
      .from('cartes')
      .select('id', { count: 'exact', head: true })
      .eq('id', inscription.charge.carte.id);
    expect(cartes).toBe(1);
    const { count: rejets } = await admin
      .from('synchro_rejets')
      .select('id', { count: 'exact', head: true })
      .eq('collecteur_id', p.c.id);
    expect(rejets).toBe(0);
    expect(await compterFile(p.base)).toBe(0);
  });

  it('même inscription, mais abonnement suspendu entre-temps : le client est accepté par relecture, la carte est refusée et consignée', async () => {
    const p = await poste('SuspenduReel');
    const inscription = await geste(
      p,
      construireClientCarte({ ...ctx(p), abonnementStatut: 'actif' }, { nom: 'Cliente Attendue', mise: 1000 }),
    );

    p.reseau.perdreProchaineReponse = true;
    expect((await passe(deps(p))).etat).toBe('hors_ligne');

    const suspension = await admin.from('collecteurs').update({ abonnement_statut: 'suspendu' }).eq('id', p.c.id);
    expect(suspension.error).toBeNull();

    expect((await passe(deps(p))).etat).toBe('vide');

    const { count: clients } = await admin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('id', inscription.charge.client.id);
    expect(clients).toBe(1);
    const { count: cartes } = await admin
      .from('cartes')
      .select('id', { count: 'exact', head: true })
      .eq('id', inscription.charge.carte.id);
    expect(cartes).toBe(0);

    const { data: rejets } = await admin
      .from('synchro_rejets')
      .select('id, motif, charge_utile, traite')
      .eq('collecteur_id', p.c.id);
    expect(rejets).toEqual([
      {
        id: inscription.id,
        motif: 'ABONNEMENT_INACTIF',
        traite: false,
        charge_utile: {
          version: 1,
          type: 'client_carte',
          charge: inscription.charge,
          faiteLe: inscription.faiteLe,
          sequence: inscription.sequence,
          dependDe: [],
          etapes: { client: true, carte: false },
        },
      },
    ]);
    expect(await compterFile(p.base)).toBe(0);
  });

  it('réponse perdue sur la seconde mise : les deux lignes arrivent au serveur, jamais deux fois après redémarrage', async () => {
    const p = await poste('SecondeMise');
    const { carteId } = await carteEnLigne(p);
    await rafraichir(p.client, p.base, p.c.id);
    const m1 = await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date() }));
    const m2 = await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date() }));

    p.reseau.ecrituresAvantPerte = 1;
    expect((await passe(deps(p))).etat).toBe('hors_ligne');
    expect(await compterFile(p.base)).toBe(1);
    expect((await lireOperations(p.base)).map((o) => o.id)).toEqual([m2.id]);
    expect(await misesDeLaCarte(carteId)).toHaveLength(2);

    // Le téléphone redémarre : la base se rouvre, le réseau revient.
    await fermerBases();
    p.base = await ouvrirBase(p.c.id);
    expect((await passe(deps(p))).etat).toBe('vide');

    const mises = await misesDeLaCarte(carteId);
    expect(mises.map((m) => m.id).sort()).toEqual([m1.charge.id, m2.charge.id].sort());
    expect(await compteurDe(carteId)).toBe(2);
    const { count } = await admin.from('synchro_rejets').select('id', { count: 'exact', head: true }).eq('collecteur_id', p.c.id);
    expect(count).toBe(0);
    expect(await compterFile(p.base)).toBe(0);
  });

  it('inscription coupée entre ses deux écritures, puis redémarrage : la carte reprend seule, le client ne repart jamais', async () => {
    const p = await poste('Coupee');
    const inscription = await geste(
      p,
      construireClientCarte({ ...ctx(p), abonnementStatut: 'actif' }, { nom: 'Nouvelle Cliente', mise: 1000 }),
    );

    p.reseau.ecrituresAvantPerte = 1;
    expect((await passe(deps(p))).etat).toBe('hors_ligne');

    // Le téléphone redémarre : la base se rouvre, le réseau revient.
    await fermerBases();
    p.base = await ouvrirBase(p.c.id);
    expect(await lireOperations(p.base)).toEqual([{ ...inscription, etapes: { client: true, carte: false } }]);

    const avant = p.reseau.requetesInsertionClients;
    expect((await passe(deps(p))).etat).toBe('vide');
    expect(p.reseau.requetesInsertionClients).toBe(avant);

    const { count: clients } = await admin
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('id', inscription.charge.client.id);
    expect(clients).toBe(1);
    const { count: cartes } = await admin
      .from('cartes')
      .select('id', { count: 'exact', head: true })
      .eq('id', inscription.charge.carte.id);
    expect(cartes).toBe(1);
    const { count: rejets } = await admin
      .from('synchro_rejets')
      .select('id', { count: 'exact', head: true })
      .eq('collecteur_id', p.c.id);
    expect(rejets).toBe(0);
    expect(await compterFile(p.base)).toBe(0);
  });
});
