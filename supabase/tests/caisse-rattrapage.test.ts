import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';
import {
  ATTENDU_PIEGE,
  MISE_PIEGE,
  jourUtc,
  poserCartePiegee,
  poserJeuPiege,
  poserRattrapage,
  poserRefus,
} from './jeu-piege';

/**
 * Le cash attendu compte les rattrapages, et à leur date d'origine.
 *
 * Le déroulé que cette épreuve garde : lundi, le collecteur a 1 000 FCFA de
 * plus que ce que le serveur attendait — une mise refusée qu'il a bien
 * encaissée. Mercredi, le rattrapage arrive, daté du lundi ; l'attendu du lundi
 * se recalcule et l'écart se referme de lui-même. Si l'attendu était figé, cet
 * écart resterait faux pour toujours, et personne ne saurait jamais pourquoi.
 */

afterAll(nettoyer);

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

async function cashAttendu(collecteurId: string, jour: string): Promise<number> {
  const { data, error } = await admin.rpc('cash_attendu_du_jour', {
    p_collecteur: collecteurId,
    p_date: jour,
  });
  expect(error).toBeNull();
  return data as number;
}

async function caisse(collecteurId: string, jour: string) {
  const { data, error } = await admin
    .from('caisses_jour')
    .select('cash_attendu, cash_declare, ecart')
    .eq('collecteur_id', collecteurId)
    .eq('date', jour)
    .maybeSingle();
  expect(error).toBeNull();
  return data as { cash_attendu: number; cash_declare: number; ecart: number } | null;
}

/** Un client, une carte active, et `combien` mises à `jour`, une par une. */
async function carteAvecMises(c: CollecteurTest, jour: string, combien: number): Promise<string> {
  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();
  await admin.from('clients').insert({ id: clientId, collecteur_id: c.id, nom: 'Cliente caisse' });
  await admin.from('cartes').insert({ id: carteId, collecteur_id: c.id, client_id: clientId, mise: MISE_PIEGE });
  for (let i = 0; i < combien; i += 1) {
    const { error } = await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: c.id,
      carte_id: carteId,
      montant: MISE_PIEGE,
      encaisse_le: `${jour}T09:0${i}:00Z`,
    });
    expect(error).toBeNull();
  }
  return carteId;
}

describe('le cash attendu', () => {
  it('compte le rattrapage du jeu piégé dans la caisse de son jour', async () => {
    const c = await creerCollecteur('Caisse piégée', telephone());
    const jeu = await poserJeuPiege(c);

    // 30 000 encaissés, 1 000 rattrapés, 29 000 rendus : il reste 2 000.
    expect(await cashAttendu(c.id, jeu.jour)).toBe(ATTENDU_PIEGE.caisseDuJour);
  });

  it('referme l’écart du lundi quand le rattrapage arrive le mercredi', async () => {
    const c = await creerCollecteur('Caisse lundi', telephone());
    const lundi = jourUtc(2);
    const carteId = await carteAvecMises(c, lundi, 2);

    // Le collecteur déclare les trois mises qu'il a réellement prises ; le
    // serveur n'en connaît que deux.
    const { error } = await c.client
      .from('caisses_jour')
      .insert({ collecteur_id: c.id, date: lundi, cash_declare: 3000 });
    expect(error).toBeNull();
    expect(await caisse(c.id, lundi)).toMatchObject({ cash_attendu: 2000, ecart: 1000 });

    const rejetId = await poserRefus(c, { carteId, jour: lundi });
    await poserRattrapage(c, { clientId: '', carteId, rejetId, jour: lundi });

    expect(await caisse(c.id, lundi)).toMatchObject({ cash_attendu: 3000, ecart: 0 });
  });

  it('ne crée aucune caisse un jour où il n’y en avait pas', async () => {
    const c = await creerCollecteur('Caisse absente', telephone());
    const carte = await poserCartePiegee(c, 4);

    await poserRattrapage(c, carte);

    const { count, error } = await admin
      .from('caisses_jour')
      .select('id', { count: 'exact', head: true })
      .eq('collecteur_id', c.id);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it('range le rattrapage dans la caisse de la main, pas du propriétaire', async () => {
    const patron = await creerCollecteur('Caisse patron', telephone());
    const awa = await creerCollecteur('Caisse awa', telephone());
    await admin
      .from('collecteurs')
      .update({ palier: 'illimite', abonnement_statut: 'actif' })
      .eq('id', patron.id);
    await admin.from('collecteurs').update({ titulaire_id: patron.id }).eq('id', awa.id);

    const jour = jourUtc(1);
    const carteId = await carteAvecMises(awa, jour, 1);
    const rejetId = await poserRefus(awa, { carteId, jour });

    const patronAvant = await cashAttendu(patron.id, jour);
    const awaAvant = await cashAttendu(awa.id, jour);

    await poserRattrapage(awa, { clientId: '', carteId, rejetId, jour }, { mainId: patron.id });

    // La carte est à Awa ; l'argent est dans la sacoche du titulaire.
    expect(await cashAttendu(patron.id, jour)).toBe(patronAvant + MISE_PIEGE);
    expect(await cashAttendu(awa.id, jour)).toBe(awaAvant);
  });
});
