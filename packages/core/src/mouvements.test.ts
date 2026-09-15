import { describe, expect, it } from 'vitest';

import { argentTenu, mouvementsDepuis, versementsDe } from './mouvements';

const MISE = {
  id: 'm1',
  carteId: 'k1',
  montant: 1000,
  encaissePar: 'col',
  encaisseLe: '2026-09-12T08:00:00.000Z',
  estCommission: true,
};
const RETRAIT = {
  id: 'r1',
  carteId: 'k1',
  montantRestitue: 29_000,
  restituePar: 'patron',
  effectueLe: '2026-09-12T20:00:00.000Z',
};
const RATTRAPAGE = {
  id: 't1',
  carteId: 'k1',
  montant: 1000,
  mainId: 'col',
  encaisseLe: '2026-09-12T19:00:00.000Z',
};

const vide = { mises: [], retraits: [], rattrapages: [] };

describe('mouvementsDepuis', () => {
  it('rend une mise en entrée, tenue par la main qui a encaissé', () => {
    expect(mouvementsDepuis({ ...vide, mises: [MISE] })).toEqual([
      {
        id: 'm1',
        nature: 'mise',
        sens: 1,
        montant: 1000,
        mainId: 'col',
        carteId: 'k1',
        survenuLe: '2026-09-12T08:00:00.000Z',
        estCommission: true,
      },
    ]);
  });

  it('rend un retrait en sortie du montant rendu, jamais de la commission', () => {
    expect(mouvementsDepuis({ ...vide, retraits: [RETRAIT] })).toEqual([
      {
        id: 'r1',
        nature: 'retrait',
        sens: -1,
        montant: 29_000,
        mainId: 'patron',
        carteId: 'k1',
        survenuLe: '2026-09-12T20:00:00.000Z',
        estCommission: false,
      },
    ]);
  });

  it('rend un rattrapage en entrée, qui n’est jamais une commission', () => {
    expect(mouvementsDepuis({ ...vide, rattrapages: [RATTRAPAGE] })).toEqual([
      {
        id: 't1',
        nature: 'rattrapage',
        sens: 1,
        montant: 1000,
        mainId: 'col',
        carteId: 'k1',
        survenuLe: '2026-09-12T19:00:00.000Z',
        estCommission: false,
      },
    ]);
  });

  it('ne recopie que les huit champs du registre', () => {
    // Les sources en portent d'autres — le compteur d'une carte, un nom. Les
    // laisser passer ferait diverger la forme du téléphone de celle de la vue,
    // et l'épreuve de parité de `supabase/tests/mouvements.test.ts` avec elle.
    // Le champ en trop passe par une variable : appliqué à un littéral, le
    // contrôle des propriétés excédentaires de TypeScript refuserait l'appel,
    // alors que c'est exactement ce que reçoit le téléphone — des lignes de
    // tournée qui portent plus de champs que le registre n'en garde.
    const avecUnChampEnPlus = { ...MISE, nom: 'Aya' };
    const [ligne] = mouvementsDepuis({ ...vide, mises: [avecUnChampEnPlus] });

    expect(Object.keys(ligne!).sort()).toEqual([
      'carteId',
      'estCommission',
      'id',
      'mainId',
      'montant',
      'nature',
      'sens',
      'survenuLe',
    ]);
  });
});

describe('versementsDe', () => {
  it('garde les mises et les rattrapages, écarte les retraits', () => {
    const tout = mouvementsDepuis({ mises: [MISE], retraits: [RETRAIT], rattrapages: [RATTRAPAGE] });

    expect(versementsDe(tout).map((m) => m.id)).toEqual(['m1', 't1']);
  });
});

describe('argentTenu', () => {
  it('ajoute les entrées et retire les sorties', () => {
    // Le jeu piégé de la spec J1 §4.5 : 30 mises de 1 000 au serveur, un
    // rattrapage de 1 000, 29 000 rendus. Il reste 2 000 dans la sacoche.
    const mises = Array.from({ length: 30 }, (_, i) => ({ ...MISE, id: `m${i}`, estCommission: i === 0 }));

    expect(argentTenu(mouvementsDepuis({ mises, retraits: [RETRAIT], rattrapages: [RATTRAPAGE] }))).toBe(2000);
  });

  it('rend zéro sur un registre vide', () => {
    expect(argentTenu([])).toBe(0);
  });
});
