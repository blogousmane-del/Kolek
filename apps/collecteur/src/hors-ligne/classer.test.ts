import { describe, expect, it } from 'vitest';

import { classer, type Portee } from './classer';

const erreur = (code: string, message: string, status: number) => ({
  error: { code, message },
  status,
});

describe('succès', () => {
  it('accepte une réponse sans erreur', () => {
    expect(classer({ error: null, status: 201 }, 'mise')).toEqual({ cas: 'accepte' });
  });
});

describe('23505 sur la clé de l’opération : déjà là, à vérifier (§6.3)', () => {
  it('reconnaît le DOUBLON du déclencheur des mises', () => {
    expect(classer(erreur('23505', 'DOUBLON', 409), 'mise')).toEqual({ cas: 'deja_la' });
  });

  it.each([
    ['mise', 'mises_pkey'],
    ['client', 'clients_pkey'],
    ['client', 'clients_id_collecteur_unique'],
    ['carte', 'cartes_pkey'],
    ['consignation', 'synchro_rejets_pkey'],
  ] as Array<[Portee, string]>)('reconnaît %s par « %s »', (portee, contrainte) => {
    const message = `duplicate key value violates unique constraint "${contrainte}"`;
    expect(classer(erreur('23505', message, 409), portee)).toEqual({ cas: 'deja_la' });
  });
});

describe('épreuve de garde : aucun 23505 hors clé ne vaut succès', () => {
  it.each([
    ['mise', 'mises_une_commission_par_carte'],
    ['mise', 'clients_pkey'],
    ['client', 'cartes_pkey'],
    ['carte', 'clients_id_collecteur_unique'],
    ['carte', 'mises_pkey'],
    ['consignation', 'mises_pkey'],
    ['client', 'collecteurs_telephone_key'],
  ] as Array<[Portee, string]>)('%s sur « %s » est un refus CONFLIT_UNIQUE', (portee, contrainte) => {
    const message = `duplicate key value violates unique constraint "${contrainte}"`;
    expect(classer(erreur('23505', message, 409), portee)).toEqual({
      cas: 'refus',
      motif: 'CONFLIT_UNIQUE',
    });
  });

  it('ne prend pas un DOUBLON pour une clé hors des mises', () => {
    expect(classer(erreur('23505', 'DOUBLON', 409), 'carte')).toEqual({
      cas: 'refus',
      motif: 'CONFLIT_UNIQUE',
    });
  });
});

describe('23505 sur une caisse, quelle que soit la contrainte (§6.4)', () => {
  it.each(['caisses_jour_pkey', 'caisses_jour_collecteur_id_date_key'])('« %s » : à reprendre en mise à jour', (contrainte) => {
    const message = `duplicate key value violates unique constraint "${contrainte}"`;
    expect(classer(erreur('23505', message, 409), 'caisse')).toEqual({ cas: 'mettre_a_jour' });
  });
});

describe('refus métier du déclencheur', () => {
  it.each(['CARTE_INTROUVABLE', 'CARTE_CLOTUREE', 'CYCLE_COMPLET', 'MONTANT_INVALIDE', 'DATE_INVALIDE'])(
    '%s est un refus sous son propre code',
    (code) => {
      expect(classer(erreur('P0001', code, 400), 'mise')).toEqual({ cas: 'refus', motif: code });
    },
  );
});

describe('bornes, clés étrangères, droits', () => {
  it('23514 sur une longueur : BORNE', () => {
    const message = 'new row for relation "clients" violates check constraint "clients_nom_borne"';
    expect(classer(erreur('23514', message, 400), 'client')).toEqual({ cas: 'refus', motif: 'BORNE' });
  });

  it('23514 sur un montant : BORNE_MONTANT', () => {
    const message = 'new row for relation "cartes" violates check constraint "cartes_mise_check"';
    expect(classer(erreur('23514', message, 400), 'carte')).toEqual({ cas: 'refus', motif: 'BORNE_MONTANT' });
  });

  it('23503 : PARENT_ABSENT', () => {
    const message = 'insert or update on table "cartes" violates foreign key constraint "cartes_client_du_meme_collecteur"';
    expect(classer(erreur('23503', message, 409), 'carte')).toEqual({ cas: 'refus', motif: 'PARENT_ABSENT' });
  });

  it.each(['clients', 'cartes'])('42501 de politique sur %s : ABONNEMENT_INACTIF', (table) => {
    const message = `new row violates row-level security policy for table "${table}"`;
    expect(classer(erreur('42501', message, 403), 'client')).toEqual({
      cas: 'refus',
      motif: 'ABONNEMENT_INACTIF',
    });
  });

  it('42501 ailleurs : DROIT_REFUSE', () => {
    const message = 'new row violates row-level security policy for table "mises"';
    expect(classer(erreur('42501', message, 403), 'mise')).toEqual({ cas: 'refus', motif: 'DROIT_REFUSE' });
  });
});

describe('la session', () => {
  it('HTTP 401', () => {
    expect(classer(erreur('', 'Unauthorized', 401), 'mise')).toEqual({ cas: 'session' });
  });

  it.each(['PGRST301', 'PGRST303'])('%s, même sans statut', (code) => {
    expect(classer({ error: { code, message: 'JWT expired' } }, 'mise')).toEqual({ cas: 'session' });
  });
});

describe('les échecs passagers', () => {
  it('l’échec réseau de fetch, que supabase-js rend en statut 0', () => {
    expect(classer(erreur('', 'TypeError: Failed to fetch', 0), 'mise')).toEqual({ cas: 'passager' });
  });

  it('le délai dépassé, rendu en AbortError', () => {
    expect(classer(erreur('', 'AbortError: The operation was aborted', 0), 'mise')).toEqual({ cas: 'passager' });
  });

  it.each([500, 502, 503, 504, 408, 429])('HTTP %i', (status) => {
    expect(classer(erreur('', 'Erreur', status), 'mise')).toEqual({ cas: 'passager' });
  });
});

describe('le reste', () => {
  it('une réponse que rien ne reconnaît est inconnue, et ne vaut jamais succès', () => {
    expect(classer(erreur('PGRST116', 'JSON object requested', 406), 'mise')).toEqual({ cas: 'inconnu' });
  });
});
