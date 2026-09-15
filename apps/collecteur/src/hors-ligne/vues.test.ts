import { formatMontant, soldeRestituable } from '@kolek/core';
import { describe, expect, it } from 'vitest';

import { appliquer, reappliquer } from './appliquer';
import {
  COLLECTEUR,
  INSTANT,
  caisse,
  carte,
  client,
  operationCaisse,
  operationCarte,
  operationClientCarte,
  operationMise,
  tournee,
} from './fabriques';
import {
  chargeUtileDe,
  type ChargeUtileRefus,
  type MiseLocale,
  type Operation,
  type ProfilLocal,
  type RefusLocal,
  type TypeOperation,
} from './modele';
import {
  TourneeAbsente,
  enAttenteSurCarte,
  etatFileDepuis,
  ficheDepuis,
  identifiantsEnAttente,
  joursDAttente,
  listeDepuis,
  phraseAttenteCarte,
  phraseAttenteLongue,
  profilDepuis,
  rapprochementDepuis,
  refusAffichables,
  tableauDepuis,
} from './vues';

const MAINTENANT = Date.parse('2026-09-13T12:00:00.000Z');
const ilYA = (ms: number) => new Date(MAINTENANT - ms).toISOString();
const mise = (id: string, carteId: string, quand: string, reste: Partial<MiseLocale> = {}): MiseLocale => ({
  id,
  carteId,
  montant: 1000,
  encaisseLe: quand,
  encaissePar: COLLECTEUR,
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
  const retrait = (id: string, carteId: string, montantRestitue: number, quand: string, restituePar = COLLECTEUR) => ({
    id,
    carteId,
    montantRestitue,
    effectueLe: quand,
    restituePar,
  });

  it('reprend les chiffres du serveur quand rien n’a changé depuis la lecture du jour', () => {
    const t = tournee({
      lueLe: RELUE,
      caisses: [caisse({ id: 'l1', date: '2026-09-13', cashAttendu: 5000, cashDeclare: 4500, ecart: -500 })],
    });

    expect(rapprochementDepuis(t, [], MIDI, COLLECTEUR)).toEqual({
      date: '2026-09-13',
      cashAttendu: 5000,
      cashDeclare: 4500,
      ecart: -500,
      provisoire: false,
    });
  });

  it('suit une mise acceptée depuis la lecture, et se dit provisoire', () => {
    // La mise a quitté la file pour l'instantané (`retirerAcceptee`) ; la ligne
    // du serveur a changé, la tournée ne l'a pas relue.
    const lue = tournee({
      lueLe: RELUE,
      clients: [client('c1')],
      cartes: [carte('k1', 'c1', { misesEncaissees: 3 })],
      caisses: [caisse({ date: '2026-09-13', cashAttendu: 10000, cashDeclare: 10000, ecart: 0 })],
    });
    const t = appliquer(lue, operationMise(1, { carteId: 'k1', encaisseLe: '2026-09-13T11:00:00.000Z' }));

    expect(rapprochementDepuis(t, [], MIDI, COLLECTEUR)).toEqual({
      date: '2026-09-13',
      cashAttendu: 11000,
      cashDeclare: 10000,
      ecart: -1000,
      provisoire: true,
    });
  });

  it('suit une mise du jour qui attend l’envoi, et se dit provisoire', () => {
    const op = operationMise(1, { carteId: 'k1', encaisseLe: '2026-09-13T11:00:00.000Z' });
    const lue = tournee({
      lueLe: RELUE,
      clients: [client('c1')],
      cartes: [carte('k1', 'c1', { misesEncaissees: 1 })],
      mises: [mise('m0', 'k1', '2026-09-13T09:00:00.000Z')],
      retraits: [retrait('r1', 'k2', 300, '2026-09-13T10:00:00.000Z')],
      caisses: [caisse({ date: '2026-09-13', cashAttendu: 700, cashDeclare: 700, ecart: 0 })],
    });

    // La tournée arrive réappliquée, comme `lireTournee` la rend.
    expect(rapprochementDepuis(reappliquer(lue, [op]), [op], MIDI, COLLECTEUR)).toEqual({
      date: '2026-09-13',
      cashAttendu: 1700,
      cashDeclare: 700,
      ecart: -1000,
      provisoire: true,
    });
  });

  it('garde la ligne du serveur pour base : elle compte ce que ce téléphone ne voit pas', () => {
    // 3 000 encaissés pour un coéquipier, sur une carte absente de cette
    // tournée : seul le serveur les connaît. L'écart a été oublié après le
    // dépannage.
    const t = tournee({
      lueLe: RELUE,
      mises: [mise('m1', 'k1', '2026-09-13T09:00:00.000Z')],
      caisses: [caisse({ date: '2026-09-13', cashAttendu: 4000, cashDeclare: 4000, ecart: null })],
    });

    expect(rapprochementDepuis(t, [], MIDI, COLLECTEUR)).toEqual({
      date: '2026-09-13',
      cashAttendu: 4000,
      cashDeclare: 4000,
      ecart: 0,
      provisoire: true,
    });
  });

  it('sans ligne du serveur, ne recompte que l’argent passé par cette main, et se dit provisoire', () => {
    // Le titulaire a encaissé 500 et rendu 200 sur les cartes de ce
    // collecteur : c'est dans sa caisse à lui (`cash_attendu_du_jour` filtre
    // sur `encaisse_par` et `restitue_par`).
    const t = tournee({
      lueLe: RELUE,
      mises: [
        mise('m1', 'k1', '2026-09-13T09:00:00.000Z'),
        mise('m2', 'k1', '2026-09-13T10:00:00.000Z', { montant: 500, encaissePar: 'titulaire-1' }),
      ],
      retraits: [
        retrait('r1', 'k2', 300, '2026-09-13T10:00:00.000Z'),
        retrait('r2', 'k3', 200, '2026-09-13T11:00:00.000Z', 'titulaire-1'),
      ],
    });

    expect(rapprochementDepuis(t, [], MIDI, COLLECTEUR)).toEqual({
      date: '2026-09-13',
      cashAttendu: 700,
      cashDeclare: null,
      ecart: null,
      provisoire: true,
    });
  });

  it('se dit provisoire sur une tournée qui n’a pas été relue aujourd’hui', () => {
    expect(
      rapprochementDepuis(tournee({ lueLe: '2026-09-12T18:00:00.000Z' }), [], MIDI, COLLECTEUR).provisoire,
    ).toBe(true);
  });

  it('découpe la journée en UTC, comme cash_attendu_du_jour', () => {
    const t = tournee({
      lueLe: RELUE,
      mises: [mise('veille', 'k1', '2026-09-12T23:30:00.000Z'), mise('jour', 'k1', '2026-09-13T00:30:00.000Z')],
    });
    expect(rapprochementDepuis(t, [], MIDI, COLLECTEUR).cashAttendu).toBe(1000);
  });
});

describe('ce que la file contient (§8.1)', () => {
  it('compte toute la file par nature, et sépare l’attente des refus à consigner', () => {
    const file = [
      operationMise(1, { carteId: 'k1' }, { faiteLe: '2026-07-01T08:00:00.000Z' }),
      operationMise(
        2,
        { carteId: 'k1' },
        { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE', faiteLe: '2026-06-01T08:00:00.000Z' },
      ),
      operationClientCarte(3, { clientId: 'c2', carteId: 'k2' }),
      operationCaisse(4, { cashDeclare: 5000 }),
    ];
    const refus = [
      {
        id: 'ancien',
        motif: 'INCONNU',
        chargeUtile: chargeUtileDe(operationCarte(9, { carteId: 'k9', clientId: 'c9' })),
        creeLe: INSTANT,
      },
    ];

    // La plus ancienne **en attente** : un refus à consigner ne sera plus
    // envoyé, la fenêtre des 90 jours ne le menace pas.
    expect(etatFileDepuis(file, refus)).toEqual({
      mises: 2,
      clients: 1,
      cartes: 0,
      caisses: 1,
      enAttente: 3,
      aConsigner: 1,
      refusees: 2,
      plusAncienne: '2026-07-01T08:00:00.000Z',
      plusAncienneType: 'mise',
    });
  });

  it('ne dit rien de plus ancien sur une file vide', () => {
    expect(etatFileDepuis([], [])).toEqual({
      mises: 0,
      clients: 0,
      cartes: 0,
      caisses: 0,
      enAttente: 0,
      aConsigner: 0,
      refusees: 0,
      plusAncienne: null,
      plusAncienneType: null,
    });
  });

  it('désigne ce qui n’a pas encore quitté le téléphone : clients, cartes et mises', () => {
    const ids = identifiantsEnAttente([
      operationClientCarte(1, { clientId: 'c2', carteId: 'k2' }),
      operationMise(2, { carteId: 'k2' }),
      operationCarte(3, { carteId: 'k3', clientId: 'c1' }),
      operationCaisse(4, { cashDeclare: 0 }),
    ]);
    expect([...ids].sort()).toEqual(['c2', 'k2', 'k3', 'mise-2']);
  });
});

describe('ce qui attend sur une carte (§7)', () => {
  it('compte les mises de la carte, et elles seules', () => {
    const file = [
      operationMise(1, { carteId: 'k1' }),
      operationMise(2, { carteId: 'k1' }),
      operationMise(3, { carteId: 'k2' }),
    ];

    expect(enAttenteSurCarte(file, 'k1')).toEqual({ mises: 2, creation: false });
    expect(phraseAttenteCarte(enAttenteSurCarte(file, 'k1'))).toBe(
      '2 mises de cette carte pas encore envoyées.',
    );
    expect(phraseAttenteCarte(enAttenteSurCarte(file, 'k2'))).toBe(
      '1 mise de cette carte pas encore envoyée.',
    );
  });

  it('dit la carte elle-même pas encore envoyée, qu’elle vienne d’une inscription ou non', () => {
    expect(
      enAttenteSurCarte([operationClientCarte(1, { clientId: 'c1', carteId: 'k1' })], 'k1'),
    ).toEqual({ mises: 0, creation: true });
    expect(
      phraseAttenteCarte(enAttenteSurCarte([operationCarte(1, { carteId: 'k2', clientId: 'c1' })], 'k2')),
    ).toBe('Cette carte n’est pas encore envoyée.');
  });

  it('ne compte pas un refus à consigner : il ne partira jamais', () => {
    const file = [
      operationMise(1, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' }),
      operationCarte(2, { carteId: 'k2', clientId: 'c1' }, { etat: 'refusee_a_consigner', motif: 'INCONNU' }),
    ];

    expect(enAttenteSurCarte(file, 'k1')).toEqual({ mises: 0, creation: false });
    expect(enAttenteSurCarte(file, 'k2')).toEqual({ mises: 0, creation: false });
    expect(phraseAttenteCarte(enAttenteSurCarte(file, 'k1'))).toBeNull();
  });

  it('se tait quand rien de la carte n’est en file', () => {
    expect(phraseAttenteCarte(enAttenteSurCarte([operationCaisse(1, { cashDeclare: 0 })], 'k1'))).toBeNull();
  });
});

describe('les refus, lisibles sans réseau (§8.4)', () => {
  const refusDe = (op: Operation, motif: string): RefusLocal => ({
    id: op.id,
    motif,
    chargeUtile: chargeUtileDe(op),
    creeLe: INSTANT,
  });

  it('titre chaque nature de geste, du plus récent au plus ancien', () => {
    const t = tournee({ clients: [client('c1', 'Awa')], cartes: [carte('k1', 'c1')] });
    const refus = [
      refusDe(
        operationMise(1, { carteId: 'k1', montant: 1000 }, { faiteLe: '2026-09-10T08:00:00.000Z' }),
        'CARTE_CLOTUREE',
      ),
      refusDe(
        operationCarte(2, { carteId: 'k2', clientId: 'c1', mise: 2000 }, { faiteLe: '2026-09-12T08:00:00.000Z' }),
        'ABONNEMENT_INACTIF',
      ),
      refusDe(
        operationCaisse(3, { cashDeclare: 5000, date: '2026-09-12' }, { faiteLe: '2026-09-11T08:00:00.000Z' }),
        'CONFLIT_UNIQUE',
      ),
    ];

    // Les montants passent par `formatMontant` : son séparateur est une
    // insécable, qu'on ne tape jamais à la main dans une épreuve.
    expect(refusAffichables(refus, [], t)).toEqual([
      {
        id: 'op-2',
        titre: `Awa — carte de ${formatMontant(2000)} FCFA`,
        detail: 'L’abonnement n’était plus actif.',
        quand: '2026-09-12T08:00:00.000Z',
      },
      {
        id: 'op-3',
        titre: `Caisse du 2026-09-12 — ${formatMontant(5000)} FCFA déclarés`,
        detail: 'Le serveur avait déjà une ligne à cette place.',
        quand: '2026-09-11T08:00:00.000Z',
      },
      {
        id: 'op-1',
        titre: `Awa — mise de ${formatMontant(1000)} FCFA`,
        detail: 'La carte avait été clôturée.',
        quand: '2026-09-10T08:00:00.000Z',
      },
    ]);
  });

  it('montre aussi les refus pas encore consignés, une seule fois chacun', () => {
    const t = tournee({ clients: [client('c1', 'Awa')], cartes: [carte('k1', 'c1')] });
    const aConsigner = operationMise(
      4,
      { carteId: 'k1' },
      { etat: 'refusee_a_consigner', motif: 'CYCLE_COMPLET' },
    );
    const enAttente = operationMise(5, { carteId: 'k1' });
    // La consignation est arrivée au serveur, la file n'a pas encore été
    // vidée : la même opération est des deux côtés, pour un seul geste.
    const dejaConsignee = operationMise(
      6,
      { carteId: 'k1' },
      { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' },
    );

    const vus = refusAffichables(
      [refusDe(dejaConsignee, 'CARTE_CLOTUREE')],
      [aConsigner, enAttente, dejaConsignee],
      t,
    );

    expect(vus.map((r) => [r.id, r.detail])).toEqual([
      ['op-6', 'La carte avait été clôturée.'],
      ['op-4', 'Le cycle de 31 mises était déjà complet.'],
    ]);
  });

  it('nomme le client d’une inscription refusée, et la mise qui en dépendait', () => {
    // Ni ce client ni sa carte ne sont jamais entrés dans la tournée : le nom
    // n'existe que dans la charge de l'inscription.
    const inscription = operationClientCarte(1, { clientId: 'c9', carteId: 'k9', nom: 'Bintou', mise: 500 });
    const mise = operationMise(
      2,
      { carteId: 'k9', montant: 500 },
      { etat: 'refusee_a_consigner', motif: 'PARENT_REFUSE', dependDe: ['op-1'] },
    );

    expect(refusAffichables([refusDe(inscription, 'ABONNEMENT_INACTIF')], [mise], tournee())).toEqual([
      {
        id: 'op-1',
        titre: `Bintou — inscription et carte de ${formatMontant(500)} FCFA`,
        detail: 'L’abonnement n’était plus actif.',
        quand: INSTANT,
      },
      {
        id: 'op-2',
        titre: `Bintou — mise de ${formatMontant(500)} FCFA`,
        detail: 'L’opération dont elle dépendait a été refusée.',
        quand: INSTANT,
      },
    ]);
  });

  it('se replie sur ce qu’elle sait lire d’une charge d’une autre version', () => {
    const inconnue: RefusLocal = {
      id: 'x',
      motif: 'MOTIF_FUTUR',
      chargeUtile: {} as unknown as ChargeUtileRefus,
      creeLe: INSTANT,
    };
    const sansNom = refusDe(operationMise(7, { carteId: 'absente' }), 'CARTE_INTROUVABLE');

    expect(refusAffichables([inconnue, sansNom], [], null)).toEqual([
      {
        id: 'op-7',
        titre: `Mise de ${formatMontant(1000)} FCFA`,
        detail: 'Le serveur ne connaissait pas cette carte.',
        quand: INSTANT,
      },
      {
        id: 'x',
        titre: 'Opération refusée',
        detail: 'Le serveur a refusé cette opération.',
        quand: null,
      },
    ]);
  });
});

describe('l’attente du plus ancien geste (§4.7, §8.8)', () => {
  it('compte les jours entiers écoulés, jamais en négatif', () => {
    expect(joursDAttente(null, MAINTENANT)).toBe(0);
    expect(joursDAttente('2026-06-29T12:00:01.000Z', MAINTENANT)).toBe(75);
    expect(joursDAttente('2026-06-28T12:00:00.000Z', MAINTENANT)).toBe(77);
    // Une horloge de téléphone en avance n'invente pas une attente.
    expect(joursDAttente('2026-09-14T12:00:00.000Z', MAINTENANT)).toBe(0);
  });

  it('prévient à partir de 75 jours, en nommant ce qui attend', () => {
    const avec = (plusAncienne: string | null, plusAncienneType: TypeOperation | null) => ({
      ...etatFileDepuis([], []),
      plusAncienne,
      plusAncienneType,
    });

    expect(phraseAttenteLongue(avec('2026-07-01T12:00:00.000Z', 'mise'), MAINTENANT)).toBeNull();
    expect(phraseAttenteLongue(avec('2026-06-30T12:00:00.000Z', 'mise'), MAINTENANT)).toBe(
      'Une mise attend depuis 75 jours. Retrouve du réseau avant 90 jours.',
    );
    expect(phraseAttenteLongue(avec('2026-06-25T12:00:00.000Z', 'caisse'), MAINTENANT)).toBe(
      'Une déclaration de caisse attend depuis 80 jours. Retrouve du réseau avant 90 jours.',
    );
    expect(phraseAttenteLongue(avec(null, null), MAINTENANT)).toBeNull();
    expect(phraseAttenteLongue(null, MAINTENANT)).toBeNull();
  });
});
