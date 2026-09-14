import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { consigner, envoyer } from './envoyer';
import { operationCaisse, operationCarte, operationClientCarte, operationMise } from './fabriques';
import { chargeUtileDe } from './modele';

interface Reponse {
  error: { code?: string; message?: string } | null;
  status: number;
  data?: unknown;
}

const OK: Reponse = { error: null, status: 201, data: null };
const RESEAU: Reponse = { error: { code: '', message: 'TypeError: Failed to fetch' }, status: 0 };
const doublon = (contrainte: string): Reponse => ({
  error: { code: '23505', message: `duplicate key value violates unique constraint "${contrainte}"` },
  status: 409,
});
const metier = (code: string): Reponse => ({ error: { code: 'P0001', message: code }, status: 400 });
/** `mises_avant_insert` lève `DOUBLON` sous `23505`, que PostgREST rend en 409. */
const DOUBLON: Reponse = { error: { code: '23505', message: 'DOUBLON' }, status: 409 };
const lu = (data: unknown): Reponse => ({ error: null, status: 200, data });

/**
 * Un client supabase de poche : chaque table rend, dans l'ordre, les réponses
 * qu'on lui a données ; tout le reste réussit. Chaque geste est noté.
 */
function clientFactice(scenario: {
  insert?: Record<string, Reponse[]>;
  relire?: Record<string, Reponse[]>;
  update?: Reponse[];
}) {
  const appels: Array<{ table: string; geste: string; valeur?: unknown; filtres?: Array<[string, unknown]> }> = [];
  const suivante = (liste: Reponse[] | undefined, defaut: Reponse) => liste?.shift() ?? defaut;

  const client = {
    from(table: string) {
      return {
        insert(valeur: unknown) {
          appels.push({ table, geste: 'insert', valeur });
          return Promise.resolve(suivante(scenario.insert?.[table], OK));
        },
        select() {
          const filtres: Array<[string, unknown]> = [];
          const chaine = {
            eq: (colonne: string, valeur: unknown) => {
              filtres.push([colonne, valeur]);
              return chaine;
            },
            maybeSingle: () => {
              appels.push({ table, geste: 'relire', filtres });
              return Promise.resolve(suivante(scenario.relire?.[table], lu(null)));
            },
          };
          return chaine;
        },
        update(valeur: unknown) {
          const filtres: Array<[string, unknown]> = [];
          appels.push({ table, geste: 'update', valeur, filtres });
          const chaine = {
            eq: (colonne: string, v: unknown) => {
              filtres.push([colonne, v]);
              return chaine;
            },
            select: () => Promise.resolve(suivante(scenario.update, lu([{ id: 'ligne' }]))),
          };
          return chaine;
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, appels };
}

const rien = async () => {};

describe('une mise', () => {
  const op = operationMise(1, { carteId: 'k1', montant: 2000 });

  it('envoie les colonnes d’aujourd’hui, jamais est_commission', async () => {
    const { client, appels } = clientFactice({});

    expect(await envoyer(client, op, rien)).toEqual({ issue: 'acceptee' });
    expect(appels).toEqual([
      {
        table: 'mises',
        geste: 'insert',
        valeur: {
          id: 'mise-1',
          collecteur_id: 'col-1',
          carte_id: 'k1',
          montant: 2000,
          encaisse_le: '2026-09-13T09:00:00.000Z',
        },
      },
    ]);
  });

  it('prend un DOUBLON relu à l’identique pour une mise arrivée (§6.3)', async () => {
    const { client, appels } = clientFactice({
      insert: { mises: [DOUBLON] },
      relire: { mises: [lu({ carte_id: 'k1', montant: 2000 })] },
    });

    expect(await envoyer(client, op, rien)).toEqual({ issue: 'acceptee' });
    expect(appels[1]).toMatchObject({ table: 'mises', geste: 'relire', filtres: [['id', 'mise-1']] });
  });

  it('refuse un DOUBLON dont la ligne diffère, ou reste invisible', async () => {
    const differente = clientFactice({
      insert: { mises: [DOUBLON] },
      relire: { mises: [lu({ carte_id: 'k2', montant: 2000 })] },
    });
    const invisible = clientFactice({ insert: { mises: [DOUBLON] } });

    expect(await envoyer(differente.client, op, rien)).toEqual({ issue: 'refusee', motif: 'DOUBLON_INVERIFIABLE' });
    expect(await envoyer(invisible.client, op, rien)).toEqual({ issue: 'refusee', motif: 'DOUBLON_INVERIFIABLE' });
  });

  it('ne conclut rien quand la relecture n’aboutit pas : c’est passager', async () => {
    const { client } = clientFactice({ insert: { mises: [DOUBLON] }, relire: { mises: [RESEAU] } });
    expect(await envoyer(client, op, rien)).toEqual({ issue: 'passager' });
  });

  it('refuse CARTE_CLOTUREE après avoir vérifié que la mise n’est pas déjà là', async () => {
    const { client, appels } = clientFactice({ insert: { mises: [metier('CARTE_CLOTUREE')] } });

    expect(await envoyer(client, op, rien)).toEqual({ issue: 'refusee', motif: 'CARTE_CLOTUREE' });
    expect(appels.map((a) => a.geste)).toEqual(['insert', 'relire']);
  });

  it('rend passager, session et inconnue tels quels, sans relire', async () => {
    const cas: Array<[Reponse, string]> = [
      [RESEAU, 'passager'],
      [{ error: { code: 'PGRST303', message: 'JWT expired' }, status: 401 }, 'session'],
      [{ error: { code: 'PGRST116', message: '?' }, status: 406 }, 'inconnue'],
    ];
    for (const [reponse, issue] of cas) {
      const { client, appels } = clientFactice({ insert: { mises: [reponse] } });
      expect(await envoyer(client, op, rien)).toEqual({ issue });
      expect(appels).toHaveLength(1);
    }
  });
});

describe('une inscription, en deux étapes', () => {
  const op = operationClientCarte(1, { clientId: 'c1', carteId: 'k1', nom: 'Awa', mise: 1500 });

  it('écrit le client puis la carte, et note chaque étape acceptée', async () => {
    const { client, appels } = clientFactice({});
    const noter = vi.fn(rien);

    expect(await envoyer(client, op, noter)).toEqual({ issue: 'acceptee' });
    expect(appels.map((a) => [a.table, a.valeur])).toEqual([
      [
        'clients',
        { id: 'c1', collecteur_id: 'col-1', nom: 'Awa', telephone: null, marche: null, activite: null, avis_actifs: false },
      ],
      ['cartes', { id: 'k1', collecteur_id: 'col-1', client_id: 'c1', mise: 1500 }],
    ]);
    expect(noter.mock.calls).toEqual([[{ client: true, carte: false }], [{ client: true, carte: true }]]);
  });

  it('reprend à la carte quand le client est déjà accepté', async () => {
    const { client, appels } = clientFactice({});
    const reprise = { ...op, etapes: { client: true, carte: false } };

    expect(await envoyer(client, reprise, rien)).toEqual({ issue: 'acceptee' });
    expect(appels.map((a) => a.table)).toEqual(['cartes']);
  });

  it('s’arrête au client refusé, sans tenter la carte', async () => {
    const refus: Reponse = {
      error: { code: '42501', message: 'new row violates row-level security policy for table "clients"' },
      status: 403,
    };
    const { client, appels } = clientFactice({ insert: { clients: [refus] } });

    expect(await envoyer(client, op, rien)).toEqual({ issue: 'refusee', motif: 'ABONNEMENT_INACTIF' });
    expect(appels.map((a) => a.geste)).toEqual(['insert', 'relire']);
  });

  it('prend pour arrivé un client refusé que la relecture trouve (précision 6)', async () => {
    const refus: Reponse = {
      error: { code: '42501', message: 'new row violates row-level security policy for table "clients"' },
      status: 403,
    };
    const { client } = clientFactice({
      insert: { clients: [refus] },
      relire: { clients: [lu({ collecteur_id: 'col-1' })] },
    });
    const noter = vi.fn(rien);

    expect(await envoyer(client, op, noter)).toEqual({ issue: 'acceptee' });
    expect(noter).toHaveBeenCalledWith({ client: true, carte: false });
  });

  it('reconnaît l’inscription rejouée par ses deux clés', async () => {
    const { client } = clientFactice({
      insert: { clients: [doublon('clients_pkey')], cartes: [doublon('cartes_pkey')] },
      relire: { clients: [lu({ collecteur_id: 'col-1' })], cartes: [lu({ client_id: 'c1', mise: 1500 })] },
    });

    expect(await envoyer(client, op, rien)).toEqual({ issue: 'acceptee' });
  });

  it('reconnaît l’inscription rejouée d’un client renommé depuis', async () => {
    const { client, appels } = clientFactice({
      insert: { clients: [doublon('clients_pkey')] },
      relire: { clients: [lu({ collecteur_id: 'col-1' })] },
    });
    const noter = vi.fn(rien);

    expect(await envoyer(client, op, noter)).toEqual({ issue: 'acceptee' });
    expect(appels[1]).toMatchObject({ table: 'clients', geste: 'relire', filtres: [['id', 'c1']] });
    expect(noter.mock.calls).toEqual([[{ client: true, carte: false }], [{ client: true, carte: true }]]);
  });
});

describe('une carte de plus', () => {
  it('envoie les colonnes d’aujourd’hui', async () => {
    const { client, appels } = clientFactice({});

    await envoyer(client, operationCarte(1, { carteId: 'k2', clientId: 'c1', mise: 500 }), rien);

    expect(appels[0]).toEqual({
      table: 'cartes',
      geste: 'insert',
      valeur: { id: 'k2', collecteur_id: 'col-1', client_id: 'c1', mise: 500 },
    });
  });
});

describe('une déclaration de caisse (§6.4)', () => {
  const op = operationCaisse(1, { id: 'd1', date: '2026-09-13', cashDeclare: 7000 });

  it('insère avec l’identifiant tiré sur le téléphone', async () => {
    const { client, appels } = clientFactice({});

    expect(await envoyer(client, op, rien)).toEqual({ issue: 'acceptee' });
    expect(appels[0]!.valeur).toEqual({ id: 'd1', collecteur_id: 'col-1', date: '2026-09-13', cash_declare: 7000 });
  });

  it.each(['caisses_jour_pkey', 'caisses_jour_collecteur_id_date_key'])(
    'sur « %s », met à jour la ligne de cette date : la dernière déclaration gagne',
    async (contrainte) => {
      const { client, appels } = clientFactice({ insert: { caisses_jour: [doublon(contrainte)] } });

      expect(await envoyer(client, op, rien)).toEqual({ issue: 'acceptee' });
      expect(appels[1]).toEqual({
        table: 'caisses_jour',
        geste: 'update',
        valeur: { cash_declare: 7000 },
        filtres: [
          ['collecteur_id', 'col-1'],
          ['date', '2026-09-13'],
        ],
      });
    },
  );

  it('ne conclut pas au succès quand la mise à jour ne touche aucune ligne', async () => {
    const { client } = clientFactice({ insert: { caisses_jour: [doublon('caisses_jour_pkey')] }, update: [lu([])] });
    expect(await envoyer(client, op, rien)).toEqual({ issue: 'inconnue' });
  });

  it('corrige une journée hors fenêtre dont la ligne existe (précision 7)', async () => {
    const { client } = clientFactice({ insert: { caisses_jour: [metier('DATE_INVALIDE')] } });
    expect(await envoyer(client, op, rien)).toEqual({ issue: 'acceptee' });
  });

  it('refuse une journée hors fenêtre sans ligne', async () => {
    const { client } = clientFactice({ insert: { caisses_jour: [metier('DATE_INVALIDE')] }, update: [lu([])] });
    expect(await envoyer(client, op, rien)).toEqual({ issue: 'refusee', motif: 'DATE_INVALIDE' });
  });

  it('reste passagère quand la mise à jour n’aboutit pas', async () => {
    const { client } = clientFactice({ insert: { caisses_jour: [doublon('caisses_jour_pkey')] }, update: [RESEAU] });
    expect(await envoyer(client, op, rien)).toEqual({ issue: 'passager' });
  });
});

describe('consigner un refus (§6.5)', () => {
  const op = operationMise(3, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' });

  it('écrit la ligne sous l’identifiant de l’opération, charge intacte', async () => {
    const { client, appels } = clientFactice({});

    expect(await consigner(client, op)).toEqual({ issue: 'acceptee' });
    expect(appels[0]).toEqual({
      table: 'synchro_rejets',
      geste: 'insert',
      valeur: { id: 'op-3', collecteur_id: 'col-1', motif: 'CARTE_CLOTUREE', charge_utile: chargeUtileDe(op) },
    });
  });

  it('ne crée pas de seconde ligne : une consignation rejouée est reconnue', async () => {
    const { client } = clientFactice({
      insert: { synchro_rejets: [doublon('synchro_rejets_pkey')] },
      relire: { synchro_rejets: [lu({ motif: 'CARTE_CLOTUREE' })] },
    });

    expect(await consigner(client, op)).toEqual({ issue: 'acceptee' });
  });

  it('consigne sous INCONNU une opération sans motif', async () => {
    const { client, appels } = clientFactice({});
    await consigner(client, { ...op, motif: undefined });
    expect((appels[0]!.valeur as { motif: string }).motif).toBe('INCONNU');
  });
});

describe('une réponse ne vaut preuve que sur son statut', () => {
  // postgrest-js réécrit un 404 au corps vide en 204 sans erreur, et un 404 au
  // corps en tableau en 200 sans erreur.
  const REECRIT_VIDE: Reponse = { error: null, status: 204, data: null };
  const REECRIT_TABLEAU: Reponse = { error: null, status: 200, data: [] };
  const inscription = () => operationClientCarte(1, { clientId: 'c1', carteId: 'k1', nom: 'Awa', mise: 1500 });

  it.each([
    ['204', REECRIT_VIDE],
    ['200', REECRIT_TABLEAU],
  ])('ne prend pas pour arrivée une mise dont l’insertion répond %s sans erreur', async (_statut, reponse) => {
    const { client, appels } = clientFactice({ insert: { mises: [reponse] } });

    expect(await envoyer(client, operationMise(1, { carteId: 'k1', montant: 2000 }), rien)).toEqual({ issue: 'inconnue' });
    expect(appels).toHaveLength(1);
  });

  it('ne note pas le client d’une inscription dont l’insertion répond 204', async () => {
    const { client, appels } = clientFactice({ insert: { clients: [REECRIT_VIDE] } });
    const noter = vi.fn(rien);

    expect(await envoyer(client, inscription(), noter)).toEqual({ issue: 'inconnue' });
    expect(noter).not.toHaveBeenCalled();
    expect(appels.map((a) => a.table)).toEqual(['clients']);
  });

  it('ne note pas la carte d’une inscription dont l’insertion répond 204', async () => {
    const { client } = clientFactice({ insert: { cartes: [REECRIT_VIDE] } });
    const noter = vi.fn(rien);

    expect(await envoyer(client, inscription(), noter)).toEqual({ issue: 'inconnue' });
    expect(noter.mock.calls).toEqual([[{ client: true, carte: false }]]);
  });

  it('ne prend pour arrivées ni une carte, ni une caisse, ni une consignation qui répondent 204', async () => {
    const carte = clientFactice({ insert: { cartes: [REECRIT_VIDE] } });
    expect(await envoyer(carte.client, operationCarte(1, { carteId: 'k2', clientId: 'c1', mise: 500 }), rien)).toEqual({
      issue: 'inconnue',
    });

    const caisse = clientFactice({ insert: { caisses_jour: [REECRIT_VIDE] } });
    expect(
      await envoyer(caisse.client, operationCaisse(1, { id: 'd1', date: '2026-09-13', cashDeclare: 7000 }), rien),
    ).toEqual({ issue: 'inconnue' });
    expect(caisse.appels).toHaveLength(1);

    const rejet = clientFactice({ insert: { synchro_rejets: [REECRIT_VIDE] } });
    const refusee = operationMise(3, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' });
    expect(await consigner(rejet.client, refusee)).toEqual({ issue: 'inconnue' });
  });

  it.each([
    ['204', REECRIT_VIDE],
    ['200 et un tableau', REECRIT_TABLEAU],
  ])('ne tient pas pour lue une relecture qui répond %s : c’est passager', async (_statut, reponse) => {
    const { client } = clientFactice({ insert: { mises: [metier('CARTE_CLOTUREE')] }, relire: { mises: [reponse] } });

    expect(await envoyer(client, operationMise(1, { carteId: 'k1', montant: 2000 }), rien)).toEqual({ issue: 'passager' });
  });

  it('ne refuse pas une journée hors fenêtre sur une mise à jour qui répond 204', async () => {
    const { client } = clientFactice({ insert: { caisses_jour: [metier('DATE_INVALIDE')] }, update: [REECRIT_VIDE] });

    expect(
      await envoyer(client, operationCaisse(1, { id: 'd1', date: '2026-09-13', cashDeclare: 7000 }), rien),
    ).toEqual({ issue: 'inconnue' });
  });

  it('ne conclut pas sur une mise à jour de caisse qui répond 204 après un conflit de date', async () => {
    const { client } = clientFactice({ insert: { caisses_jour: [doublon('caisses_jour_pkey')] }, update: [REECRIT_VIDE] });

    expect(
      await envoyer(client, operationCaisse(1, { id: 'd1', date: '2026-09-13', cashDeclare: 7000 }), rien),
    ).toEqual({ issue: 'inconnue' });
  });

  it('ne compte pas une mise à jour de caisse qui répond 200 sans tableau', async () => {
    const { client } = clientFactice({
      insert: { caisses_jour: [metier('DATE_INVALIDE')] },
      update: [{ error: null, status: 200, data: null }],
    });

    expect(
      await envoyer(client, operationCaisse(1, { id: 'd1', date: '2026-09-13', cashDeclare: 7000 }), rien),
    ).toEqual({ issue: 'inconnue' });
  });
});
