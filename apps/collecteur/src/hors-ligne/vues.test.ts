import { soldeRestituable } from '@kolek/core';
import { describe, expect, it } from 'vitest';

import { INSTANT, caisse, carte, client, operationMise, tournee } from './fabriques';
import type { MiseLocale, ProfilLocal } from './modele';
import {
  TourneeAbsente,
  ficheDepuis,
  listeDepuis,
  profilDepuis,
  rapprochementDepuis,
  tableauDepuis,
} from './vues';

const MAINTENANT = Date.parse('2026-09-13T12:00:00.000Z');
const ilYA = (ms: number) => new Date(MAINTENANT - ms).toISOString();
const mise = (id: string, carteId: string, quand: string, reste: Partial<MiseLocale> = {}): MiseLocale => ({
  id,
  carteId,
  montant: 1000,
  encaisseLe: quand,
  estCommission: false,
  ...reste,
});

describe('l’accueil, calculé sur la tournée', () => {
  // « Aujourd'hui » part de minuit local : la mise du jour est posée à l'instant
  // même, celle d'hier trente heures avant — vrai sous tous les fuseaux.
  const T = tournee({
    clients: [client('c1', 'Awa'), client('c2', 'Bintou')],
    cartes: [
      carte('k1', 'c1', { mise: 1000, misesEncaissees: 5 }),
      carte('k2', 'c2', { mise: 500, misesEncaissees: 30 }),
      carte('k3', 'c2', { mise: 2000, misesEncaissees: 31, statut: 'cloturee' }),
    ],
    mises: [
      mise('hier', 'k1', ilYA(30 * 3_600_000)),
      mise('m1', 'k1', ilYA(0)),
      mise('m2', 'k2', ilYA(0), { montant: 500, estCommission: true }),
    ],
  });

  it('compte les clients, les cartes actives, l’encours et l’encaissé depuis minuit', () => {
    expect(tableauDepuis(T, MAINTENANT)).toMatchObject({
      clients: 2,
      cartesActives: 2,
      encaisseAujourdhui: 1500,
      encoursTotal: soldeRestituable(5, 1000) + soldeRestituable(30, 500),
    });
  });

  it('propose la carte active la plus avancée, avec le nom de son client', () => {
    expect(tableauDepuis(T, MAINTENANT).carteDuJour).toEqual({
      carteId: 'k2',
      clientId: 'c2',
      nom: 'Bintou',
      mise: 500,
      misesEncaissees: 30,
      solde: soldeRestituable(30, 500),
    });
  });

  it('départage deux cartes aussi avancées par leur identifiant, pour ne pas changer d’un rendu à l’autre', () => {
    const egales = tournee({
      clients: [client('c1')],
      cartes: [carte('kb', 'c1', { misesEncaissees: 7 }), carte('ka', 'c1', { misesEncaissees: 7 })],
    });
    expect(tableauDepuis(egales, MAINTENANT).carteDuJour?.carteId).toBe('ka');
  });

  it('montre les cinq dernières mises, la plus récente d’abord, nommées', () => {
    // Insérées dans le désordre, l'une à la façon du serveur (`+00:00`) : le tri
    // porte sur l'instant, ni sur l'ordre d'arrivée ni sur le texte.
    const quand = (n: number) => (n === 1 ? ilYA(n * 60_000).replace('Z', '+00:00') : ilYA(n * 60_000));
    const six = tournee({
      clients: [client('c1', 'Awa')],
      cartes: [carte('k1', 'c1')],
      mises: [4, 1, 6, 2, 5, 3].map((n) => mise(`m${n}`, 'k1', quand(n))),
    });

    const { dernieres } = tableauDepuis(six, MAINTENANT);

    expect(dernieres.map((d) => d.quand)).toEqual([1, 2, 3, 4, 5].map(quand));
    expect(dernieres[0]).toEqual({ nom: 'Awa', montant: 1000, estCommission: false, quand: quand(1) });
  });

  it('n’a pas de carte du jour sans carte active', () => {
    expect(tableauDepuis(tournee({ clients: [client('c1')] }), MAINTENANT).carteDuJour).toBeNull();
  });
});

describe('la liste des clients', () => {
  it('trie les noms à la française, accents compris, puis par identifiant', () => {
    const t = tournee({
      clients: [client('c3', 'Zoé'), client('c2', 'Émile'), client('c1', 'awa'), client('c0', 'Émile')],
    });
    expect(listeDepuis(t).clients.map((c) => c.id)).toEqual(['c1', 'c0', 'c2', 'c3']);
  });

  it('rend les colonnes que l’écran lisait du serveur, cartes clôturées comprises', () => {
    const t = tournee({
      clients: [{ ...client('c1', 'Awa'), marche: 'Adjamé', telephone: '0700', avisActifs: true }],
      cartes: [carte('k1', 'c1', { statut: 'cloturee', misesEncaissees: 31 })],
    });

    expect(listeDepuis(t)).toEqual({
      clients: [{ id: 'c1', nom: 'Awa', marche: 'Adjamé', telephone: '0700', avis_actifs: true }],
      cartes: [
        { id: 'k1', client_id: 'c1', mise: 1000, statut: 'cloturee', mises_encaissees: 31, ouverte_le: INSTANT },
      ],
    });
  });
});

describe('la fiche d’un client', () => {
  it('n’existe pas pour un client absent du téléphone', () => {
    expect(ficheDepuis(tournee(), 'c9')).toBeNull();
  });

  it('rend ses cartes, la plus récente d’abord, et les seules mises de ses cartes', () => {
    const t = tournee({
      clients: [client('c1', 'Awa'), client('c2', 'Bintou')],
      cartes: [
        carte('ancienne', 'c1', { ouverteLe: '2026-06-01T08:00:00.000Z', statut: 'cloturee' }),
        carte('recente', 'c1', { ouverteLe: '2026-09-01T08:00:00.000Z' }),
        carte('autre', 'c2'),
      ],
      mises: [mise('m1', 'recente', ilYA(60_000)), mise('m2', 'autre', ilYA(0)), mise('m3', 'recente', ilYA(0))],
    });

    const fiche = ficheDepuis(t, 'c1');

    expect(fiche?.cartes.map((k) => k.id)).toEqual(['recente', 'ancienne']);
    expect(fiche?.mises.map((m) => m.id)).toEqual(['m3', 'm1']);
  });

  it('borne les versements à quarante, comme la lecture qu’elle remplace', () => {
    const t = tournee({
      clients: [client('c1')],
      cartes: [carte('k1', 'c1')],
      mises: Array.from({ length: 45 }, (_, i) => mise(`m${i}`, 'k1', ilYA(i * 1000))),
    });
    expect(ficheDepuis(t, 'c1')?.mises).toHaveLength(40);
  });
});

describe('le profil', () => {
  const PROFIL: ProfilLocal = {
    nom: 'Awa',
    telephone: '+2250700000000',
    zone: 'Adjamé',
    palier: 'pro',
    abonnementStatut: 'actif',
    abonnementEcheance: null,
    titulaireId: null,
    lueLe: INSTANT,
  };

  it('compte les clients et les cartes actives de la tournée', () => {
    const t = tournee({
      clients: [client('c1'), client('c2')],
      cartes: [carte('k1', 'c1'), carte('k2', 'c2', { statut: 'cloturee' })],
    });

    expect(profilDepuis(PROFIL, t)).toEqual({
      nom: 'Awa',
      telephone: '+2250700000000',
      zone: 'Adjamé',
      palier: 'pro',
      abonnementStatut: 'actif',
      abonnementEcheance: null,
      titulaireId: null,
      clients: 2,
      cartesActives: 1,
    });
  });

  it('refuse d’inventer un profil jamais lu sur ce téléphone', () => {
    expect(() => profilDepuis(null, tournee())).toThrow(TourneeAbsente);
  });
});

describe('la caisse du jour (§6.4)', () => {
  const MIDI = Date.parse('2026-09-13T12:00:00.000Z');
  const RELUE = '2026-09-13T08:00:00.000Z';

  it('reprend les chiffres du serveur quand rien du jour n’attend', () => {
    const t = tournee({
      lueLe: RELUE,
      caisses: [caisse({ id: 'l1', date: '2026-09-13', cashAttendu: 5000, cashDeclare: 4500, ecart: -500 })],
    });

    expect(rapprochementDepuis(t, [], MIDI)).toEqual({
      date: '2026-09-13',
      cashAttendu: 5000,
      cashDeclare: 4500,
      ecart: -500,
      provisoire: false,
    });
  });

  it('recalcule un attendu provisoire quand une mise du jour attend l’envoi', () => {
    const op = operationMise(1, { carteId: 'k1', encaisseLe: '2026-09-13T11:00:00.000Z' });
    // La tournée arrive réappliquée : la mise en file y est déjà.
    const t = tournee({
      lueLe: RELUE,
      mises: [mise('m0', 'k1', '2026-09-13T09:00:00.000Z'), mise(op.charge.id, 'k1', op.charge.encaisseLe)],
      retraits: [{ id: 'r1', carteId: 'k2', montantRestitue: 300, effectueLe: '2026-09-13T10:00:00.000Z' }],
      caisses: [caisse({ date: '2026-09-13', cashAttendu: 1000, cashDeclare: 1000, ecart: 0 })],
    });

    expect(rapprochementDepuis(t, [op], MIDI)).toEqual({
      date: '2026-09-13',
      cashAttendu: 1700,
      cashDeclare: 1000,
      ecart: -700,
      provisoire: true,
    });
  });

  it('sans déclaration ni attente, calcule ce que le serveur calculera', () => {
    const t = tournee({ lueLe: RELUE, mises: [mise('m1', 'k1', '2026-09-13T09:00:00.000Z')] });

    expect(rapprochementDepuis(t, [], MIDI)).toEqual({
      date: '2026-09-13',
      cashAttendu: 1000,
      cashDeclare: null,
      ecart: null,
      provisoire: false,
    });
  });

  it('se dit provisoire sur une tournée qui n’a pas été relue aujourd’hui', () => {
    expect(rapprochementDepuis(tournee({ lueLe: '2026-09-12T18:00:00.000Z' }), [], MIDI).provisoire).toBe(true);
  });

  it('découpe la journée en UTC, comme cash_attendu_du_jour', () => {
    const t = tournee({
      lueLe: RELUE,
      mises: [mise('veille', 'k1', '2026-09-12T23:30:00.000Z'), mise('jour', 'k1', '2026-09-13T00:30:00.000Z')],
    });
    expect(rapprochementDepuis(t, [], MIDI).cashAttendu).toBe(1000);
  });
});
