import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';
import { ATTENDU_PIEGE, MISE_PIEGE, jourUtc, poserJeuPiege, poserRattrapage, poserRefus, type JeuPiege } from './jeu-piege';

/**
 * Les lectures en ligne du collecteur, sur le jeu piégé, avec la session d'un
 * vrai collecteur et les vraies politiques RLS.
 *
 * Le module client est remplacé par un accesseur qui rend le client authentifié
 * du harnais : recopier les requêtes dans l'épreuve aurait été plus simple et
 * n'aurait rien prouvé.
 */

const etat = vi.hoisted(() => ({ client: null as { from: unknown } | null }));

vi.mock('../../apps/collecteur/src/supabase', () => ({
  get supabase() {
    if (!etat.client) throw new Error('Client de test non posé — voir beforeAll.');
    return etat.client;
  },
}));

const { chargerAlertes, chargerBilan, chargerHistoriqueCarte, chargerRecus } = await import(
  '../../apps/collecteur/src/lectures-ecrans'
);

afterAll(nettoyer);

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

let c: CollecteurTest;
let jeu: JeuPiege;

beforeAll(async () => {
  c = await creerCollecteur('Lectures piégées', telephone());
  etat.client = c.client as unknown as { from: unknown };
  jeu = await poserJeuPiege(c);
});

describe('le bilan', () => {
  it('compte le rattrapage dans les trente derniers jours', async () => {
    const bilan = await chargerBilan();
    const trente = bilan.tranches.find((t) => t.libelle === '30 derniers jours');

    expect(trente).toMatchObject({
      encaisse: ATTENDU_PIEGE.encaisse,
      commissions: ATTENDU_PIEGE.commissions,
      nombreMises: ATTENDU_PIEGE.versements,
      restitue: ATTENDU_PIEGE.restitue,
    });
  });
});

describe('les reçus', () => {
  it('rend les trente-et-un versements, dont le rattrapage', async () => {
    const recus = await chargerRecus();

    expect(recus).toHaveLength(ATTENDU_PIEGE.versements);
    expect(recus.reduce((somme, r) => somme + r.montant, 0)).toBe(ATTENDU_PIEGE.encaisse);
    expect(recus.filter((r) => r.nature === 'rattrapage')).toEqual([
      expect.objectContaining({ id: jeu.rattrapageId, montant: MISE_PIEGE, estCommission: false }),
    ]);
  });
});

describe('l’historique d’une carte', () => {
  it('mêle les mises, le retrait et le rattrapage, du plus récent au plus ancien', async () => {
    const evenements = await chargerHistoriqueCarte(jeu.carteId);

    expect(evenements).toHaveLength(32);
    expect(evenements.filter((e) => e.genre === 'rattrapage')).toEqual([
      expect.objectContaining({ id: jeu.rattrapageId, montant: MISE_PIEGE }),
    ]);
    expect(evenements.find((e) => e.genre === 'retrait')?.montant).toBe(ATTENDU_PIEGE.restitue);

    const dates = evenements.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe('les alertes', () => {
  it('ne dit pas endormie une carte dont le dernier versement est un rattrapage', async () => {
    const dormeur = await creerCollecteur('Alertes piégées', telephone());
    etat.client = dormeur.client as unknown as { from: unknown };

    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    await admin.from('clients').insert({ id: clientId, collecteur_id: dormeur.id, nom: 'Cliente alerte' });
    await admin
      .from('cartes')
      .insert({ id: carteId, collecteur_id: dormeur.id, client_id: clientId, mise: MISE_PIEGE });
    await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: dormeur.id,
      carte_id: carteId,
      montant: MISE_PIEGE,
      encaisse_le: `${jourUtc(10)}T09:00:00Z`,
    });

    // Avant-hier, et jamais hier : `tendances.test.ts` affirme qu'hier est un
    // jour creux pour toute la plateforme, et un rattrapage est un versement.
    // Deux jours restent loin des sept de la dormance.
    const avantHier = jourUtc(2);
    const rejetId = await poserRefus(dormeur, { carteId, jour: avantHier });
    await poserRattrapage(dormeur, { clientId, carteId, rejetId, jour: avantHier });

    const alertes = await chargerAlertes();

    // Le client a versé avant-hier : la carte n'est pas endormie, même si le serveur
    // a refusé ce versement-là.
    expect(alertes.find((a) => a.cle === `dormante-${carteId}`)).toBeUndefined();

    etat.client = c.client as unknown as { from: unknown };
  });
});
