import { MISES_PAR_CYCLE } from '@kolek/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tableFactice, type Ligne } from './postgrest-factice';

/**
 * Ce que les alertes disent d'une carte arrivée au bout de son cycle.
 *
 * Elles annonçaient : « La carte **doit** être clôturée et 30 000 FCFA
 * restitués. » C'était vrai tant qu'un client ne pouvait tenir qu'une carte à la
 * fois — il fallait fermer l'ancienne pour en ouvrir une neuve, donc rendre
 * l'argent. La contrainte est tombée le 2026-08-25, et cette phrase avec elle :
 * le client peut désormais laisser son épargne chez le collecteur et repartir
 * sur une carte de plus.
 *
 * Une alerte qui présente un choix comme une obligation ne se contente pas
 * d'être imprécise. Elle pousse le collecteur à réclamer une clôture que
 * personne ne demande, et à rendre un argent que le client voulait garder.
 *
 * Le seuil, lui, ne bouge pas — ni celui-ci ni celui de la dormance. Le cycle
 * est un compte de 31 mises, pas 31 jours de calendrier ; les alertes de jours
 * sans mise restent des repères de tournée, pas des reproches, et leurs textes
 * disent déjà des faits.
 *
 * ## Et ce que les lectures font au-delà de mille lignes
 *
 * Le client Supabase est remplacé par `tableFactice`, qui coupe à mille lignes
 * sans `range` — comme le vrai. Les épreuves « au-delà de mille » échouent donc
 * sur un code qui oublie de paginer, pour la raison exacte de la production.
 */

const from = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { from: (table: string) => from(table) },
}));

const {
  chargerAlertes,
  chargerCartesCloturables,
  chargerEtatAvis,
  chargerProfil,
  chargerRapprochement,
  chargerRecus,
} = await import('./lectures-ecrans');

/** L'instant des épreuves. Seul `Date` est figé : les promesses tournent. */
const MAINTENANT = '2026-09-11T10:00:00.000Z';

let tables: Record<string, Ligne[]> = {};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(MAINTENANT));
  tables = {};
  from.mockImplementation((table: string) => tableFactice(tables[table] ?? []));
});

afterEach(() => {
  vi.useRealTimers();
  from.mockReset();
});

const rang = (i: number) => String(i).padStart(4, '0');

/**
 * `n` clients, une carte active chacun, rangés par identifiant.
 *
 * Le dernier — le 1 001e quand `n` vaut 1 001 — est celui que PostgREST coupe
 * sans `range`. Son client s'appelle « Dernière » et sa carte est pleine : une
 * épreuve peut demander « l'a-t-on vu ? » en une ligne.
 */
function parc(n: number) {
  const clients = Array.from({ length: n }, (_, i) => ({
    id: `c${rang(i)}`,
    nom: i === n - 1 ? 'Dernière' : `Client ${rang(i)}`,
    avis_actifs: true,
    telephone: '+2250700000000',
  }));
  const cartes = Array.from({ length: n }, (_, i) => ({
    id: `k${rang(i)}`,
    client_id: `c${rang(i)}`,
    mise: 500,
    statut: 'active',
    mises_encaissees: i === n - 1 ? MISES_PAR_CYCLE : 1,
    ouverte_le: MAINTENANT,
  }));
  return { clients, cartes };
}

describe('alerte d’une carte au bout de son cycle', () => {
  beforeEach(() => {
    tables = {
      clients: [{ id: 'cli1', nom: 'Hj' }],
      // Une seule carte, pleine, et toujours active : la base ne clôture qu'au retrait.
      cartes: [
        {
          id: 'k1',
          client_id: 'cli1',
          mise: 1000,
          statut: 'active',
          mises_encaissees: MISES_PAR_CYCLE,
          ouverte_le: '2026-07-01T08:00:00.000Z',
        },
      ],
      mises: [{ id: 'm1', carte_id: 'k1', encaisse_le: MAINTENANT }],
    };
  });

  it('ne présente plus le retrait comme une obligation', async () => {
    const alertes = await chargerAlertes();
    const complete = alertes.find((a) => a.cle === 'complete-k1');

    expect(complete).toBeTruthy();
    // « doit être clôturée » était la règle d'une seule carte active. Elle est
    // tombée avec l'index unique.
    expect(complete?.detail).not.toContain('doit');
  });

  it('nomme les deux issues, et dit que le solde reste dû', async () => {
    const alertes = await chargerAlertes();
    const complete = alertes.find((a) => a.cle === 'complete-k1');

    // Les deux portes se valent : une alerte qui n'en montre qu'une choisit à la
    // place du client.
    expect(complete?.detail).toContain('restituer');
    expect(complete?.detail).toContain('carte de plus');
    // Sans ce rappel, laisser l'argent ressemble à le perdre.
    expect(complete?.detail).toContain('dû');
  });

  it('rappelle toujours le montant en jeu', async () => {
    const alertes = await chargerAlertes();
    const complete = alertes.find((a) => a.cle === 'complete-k1');

    // 31 mises de 1 000, moins la première qui est la commission du collecteur.
    expect(complete?.detail).toContain('30 000');
  });
});

describe('les alertes d’un collecteur au-delà de mille lignes', () => {
  it('ne déclare pas endormie une carte dont la mise tombe après la millième', async () => {
    // Mille mises d'aujourd'hui sur une carte, une seule d'hier sur une autre,
    // ouverte il y a trente jours. Du plus récent au plus ancien, celle d'hier
    // est la 1 001e : c'est elle que `max_rows` coupe.
    tables = {
      clients: [
        { id: 'cli1', nom: 'Awa' },
        { id: 'cli2', nom: 'Hier' },
      ],
      cartes: [
        {
          id: 'k1',
          client_id: 'cli1',
          mise: 500,
          statut: 'active',
          mises_encaissees: 5,
          ouverte_le: '2026-09-01T08:00:00.000Z',
        },
        {
          id: 'k2',
          client_id: 'cli2',
          mise: 500,
          statut: 'active',
          mises_encaissees: 3,
          ouverte_le: '2026-08-12T08:00:00.000Z',
        },
      ],
      mises: [
        ...Array.from({ length: 1000 }, (_, i) => ({
          id: `m${rang(i)}`,
          carte_id: 'k1',
          encaisse_le: '2026-09-11T09:00:00.000Z',
        })),
        { id: 'm1000', carte_id: 'k2', encaisse_le: '2026-09-10T09:00:00.000Z' },
      ],
    };

    const alertes = await chargerAlertes();

    // Coupée, la mise d'hier disparaît : la carte retombe sur sa date
    // d'ouverture, et l'écran dit « Hier — 30 jours sans mise ».
    expect(alertes.find((a) => a.cle === 'dormante-k2')).toBeUndefined();
  });

  it('signale la carte pleine d’un client au-delà du millième, et le nomme', async () => {
    const { clients, cartes } = parc(1001);
    tables = { clients, cartes, mises: [] };

    const alertes = await chargerAlertes();

    expect(alertes.find((a) => a.cle === 'complete-k1000')?.titre).toBe(
      'Dernière — cycle terminé',
    );
  });
});

describe('le rapprochement d’une journée au-delà de mille lignes', () => {
  it('compte toutes les mises et tous les retraits du jour', async () => {
    // Aucune déclaration encore : l'attendu est calculé ici. Coupées à mille,
    // les deux listes rendraient 100 000 − 10 000 = 90 000 au lieu de 90 090.
    tables = {
      caisses_jour: [],
      mises: Array.from({ length: 1001 }, (_, i) => ({
        id: `m${rang(i)}`,
        montant: 100,
        encaisse_le: MAINTENANT,
      })),
      retraits: Array.from({ length: 1001 }, (_, i) => ({
        id: `r${rang(i)}`,
        montant_restitue: 10,
        effectue_le: MAINTENANT,
      })),
    };

    const rapprochement = await chargerRapprochement();

    expect(rapprochement.cashAttendu).toBe(100_100 - 10_010);
  });
});

describe('l’écran Retrait au-delà de mille cartes', () => {
  it('propose toutes les cartes, la 1 001e comprise, avec le nom de son client', async () => {
    const { clients, cartes } = parc(1001);
    tables = { clients, cartes };

    const cloturables = await chargerCartesCloturables();

    expect(cloturables).toHaveLength(1001);
    expect(cloturables.find((c) => c.carteId === 'k1000')?.clientNom).toBe('Dernière');
  });
});

describe('les comptes et les noms au-delà de mille lignes', () => {
  it('chargerProfil compte tous les clients et toutes les cartes actives', async () => {
    const { clients, cartes } = parc(1001);
    tables = { clients, cartes };

    const profil = await chargerProfil();

    expect(profil.clients).toBe(1001);
    expect(profil.cartesActives).toBe(1001);
  });

  it('chargerRecus nomme le client d’une carte au-delà de la millième', async () => {
    const { clients, cartes } = parc(1001);
    tables = {
      clients,
      cartes,
      mises: [
        { id: 'm1', carte_id: 'k1000', montant: 500, est_commission: false, encaisse_le: MAINTENANT },
      ],
    };

    const [recu] = await chargerRecus();

    // Coupé à mille, ce reçu disait « Client inconnu », pour une mise de 0.
    expect(recu?.clientNom).toBe('Dernière');
    expect(recu?.mise).toBe(500);
  });

  it('chargerEtatAvis compte tous les clients qui acceptent les avis', async () => {
    tables = { clients: parc(1001).clients };

    const etat = await chargerEtatAvis();

    expect(etat.clientsConsentants).toBe(1001);
  });
});
