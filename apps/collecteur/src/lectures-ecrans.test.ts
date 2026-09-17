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
  chargerJournal,
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
      mouvements: [{ id: 'm1', sens: 1, carte_id: 'k1', survenu_le: MAINTENANT }],
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
      mouvements: [
        ...Array.from({ length: 1000 }, (_, i) => ({
          id: `m${rang(i)}`,
          sens: 1,
          carte_id: 'k1',
          survenu_le: '2026-09-11T09:00:00.000Z',
        })),
        { id: 'm1000', sens: 1, carte_id: 'k2', survenu_le: '2026-09-10T09:00:00.000Z' },
      ],
    };

    const alertes = await chargerAlertes();

    // Coupée, la mise d'hier disparaît : la carte retombe sur sa date
    // d'ouverture, et l'écran dit « Hier : 30 jours sans mise ».
    expect(alertes.find((a) => a.cle === 'dormante-k2')).toBeUndefined();
  });

  it('signale la carte pleine d’un client au-delà du millième, et le nomme', async () => {
    const { clients, cartes } = parc(1001);
    tables = { clients, cartes, mouvements: [] };

    const alertes = await chargerAlertes();

    expect(alertes.find((a) => a.cle === 'complete-k1000')?.titre).toBe(
      'Dernière : cycle terminé',
    );
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

  it.each(['cartes', 'clients'])(
    'lève quand la lecture de « %s » échoue, plutôt que de dire « aucune carte »',
    async (enPanne) => {
      // Hors ligne, postgrest-js ne lève pas : il rend `{ error }`. Une liste vide
      // à la place ferait dire à l'écran que le client n'a plus de carte.
      const panne = { data: null, error: { message: 'Failed to fetch' }, count: null, status: 0 };
      const { clients, cartes } = parc(2);
      tables = { clients, cartes };
      from.mockImplementation((table: string) => {
        if (table !== enPanne) return tableFactice(tables[table] ?? []);
        const chaine = { select: () => chaine, order: () => chaine, range: () => Promise.resolve(panne) };
        return chaine;
      });

      await expect(chargerCartesCloturables()).rejects.toMatchObject({ message: 'Failed to fetch' });
    },
  );
});

describe('les comptes et les noms au-delà de mille lignes', () => {
  it('chargerJournal nomme le client d’une carte au-delà de la millième', async () => {
    const { clients, cartes } = parc(1001);
    tables = {
      clients,
      cartes,
      mouvements: [
        {
          id: 'm1',
          nature: 'mise',
          sens: 1,
          carte_id: 'k1000',
          montant: 500,
          est_commission: false,
          survenu_le: MAINTENANT,
        },
      ],
    };

    const [recu] = await chargerJournal();

    // Coupé à mille, ce reçu disait « Client inconnu », pour une mise de 0.
    expect(recu?.clientNom).toBe('Dernière');
    expect(recu?.mise).toBe(500);
  });

  /**
   * Le tri du journal, qui vient de deux tables.
   *
   * Les versements arrivent de `mouvements`, les clôtures de `cartes` : deux
   * requêtes, deux ordres, et c'est `chargerJournal` qui les met sur une seule
   * frise. Rien d'autre ne trie ensuite — l'écran rend la liste telle qu'il la
   * reçoit, et la regroupe par jour dans cet ordre.
   *
   * Un banc de rendu qui semait le cache à la main a montré ce que ça donne
   * quand l'ordre est faux : la carte close tombait en queue de liste, trois
   * jours après sa place. À l'écran ça ressemble à une donnée manquante.
   */
  it('chargerJournal met clôtures et versements sur un seul ordre', async () => {
    tables = {
      clients: [{ id: 'c1', nom: 'Aya Koffi' }],
      cartes: [
        {
          id: 'k1',
          client_id: 'c1',
          mise: 3000,
          statut: 'cloturee',
          mises_encaissees: MISES_PAR_CYCLE,
          ouverte_le: '2026-08-01T10:00:00.000Z',
          cloturee_le: '2026-09-10T10:00:00.000Z',
        },
      ],
      mouvements: [
        {
          id: 'avant',
          nature: 'mise',
          sens: 1,
          carte_id: 'k1',
          montant: 3000,
          est_commission: false,
          survenu_le: '2026-09-09T10:00:00.000Z',
        },
        {
          id: 'apres',
          nature: 'mise',
          sens: 1,
          carte_id: 'k1',
          montant: 3000,
          est_commission: false,
          survenu_le: '2026-09-11T09:00:00.000Z',
        },
      ],
    };

    const journal = await chargerJournal();

    // La clôture s'insère entre les deux mises, à sa date, et non en bout de
    // liste parce qu'elle vient d'une autre table.
    expect(journal.map((e) => e.id)).toEqual(['apres', 'cloture-k1', 'avant']);
  });

  /**
   * Ce qu'une clôture porte, et que les versements n'ont pas.
   *
   * Le montant d'une clôture n'est pas un versement : c'est le total encaissé
   * sur la carte, la seule somme qui ait un sens une fois qu'elle ne reçoit
   * plus rien. Et `carteId` est ce qui permet d'aller chercher son détail au
   * dépli — sans lui, les mises d'un vieux cycle sont hors d'atteinte.
   */
  it('chargerJournal chiffre une clôture au total encaissé, et garde sa carte', async () => {
    tables = {
      clients: [{ id: 'c1', nom: 'Aya Koffi' }],
      cartes: [
        {
          id: 'k1',
          client_id: 'c1',
          mise: 3000,
          statut: 'cloturee',
          mises_encaissees: 31,
          ouverte_le: '2026-08-01T10:00:00.000Z',
          cloturee_le: '2026-09-10T10:00:00.000Z',
        },
      ],
      mouvements: [],
    };

    const [cloture] = await chargerJournal();

    expect(cloture?.nature).toBe('cloture');
    expect(cloture?.clientNom).toBe('Aya Koffi');
    expect(cloture?.montant).toBe(31 * 3000);
    expect(cloture?.carteId).toBe('k1');
    expect(cloture?.cycle?.misesEncaissees).toBe(31);
  });

  /**
   * Une carte encore ouverte n'est pas un événement.
   *
   * Le journal dit ce qui s'est **passé**. Une carte active est en train de se
   * passer, et la faire entrer ici la ferait apparaître chaque jour dans la
   * liste sans que rien ne lui soit arrivé.
   */
  it('chargerJournal ignore les cartes encore actives', async () => {
    tables = {
      clients: [{ id: 'c1', nom: 'Aya Koffi' }],
      cartes: [
        {
          id: 'k1',
          client_id: 'c1',
          mise: 3000,
          statut: 'active',
          mises_encaissees: 4,
          ouverte_le: '2026-09-01T10:00:00.000Z',
          cloturee_le: null,
        },
      ],
      mouvements: [],
    };

    expect(await chargerJournal()).toEqual([]);
  });

  it('chargerEtatAvis compte tous les clients qui acceptent les avis', async () => {
    tables = { clients: parc(1001).clients };

    const etat = await chargerEtatAvis();

    expect(etat.clientsConsentants).toBe(1001);
  });
});
