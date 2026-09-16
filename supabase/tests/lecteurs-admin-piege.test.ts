import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';
import { ATTENDU_PIEGE, MISE_PIEGE, poserCartePiegee, poserJeuPiege, poserRattrapage } from './jeu-piege';

/**
 * Les trois lecteurs de l'administration et de l'équipe, sur le jeu piégé.
 *
 * Ces fonctions agrègent *toute* la plateforme, et `npm run test:db` ne
 * réinitialise pas la base : un total absolu serait faux au deuxième
 * lancement. Les totaux sont donc mesurés **en écart** — avant et après la pose
 * d'un rattrapage — et les valeurs absolues seulement sur la ligne du
 * collecteur de l'épreuve, qui lui est propre.
 */

afterAll(nettoyer);

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

type Objet = Record<string, number>;

async function vueGlobale(): Promise<Record<string, unknown>> {
  const { data, error } = await admin.rpc('admin_vue_globale');
  expect(error).toBeNull();
  return data as Record<string, unknown>;
}

async function tendances(jours: number): Promise<Record<string, unknown>> {
  const { data, error } = await admin.rpc('admin_tendances', { p_jours: jours });
  expect(error).toBeNull();
  return data as Record<string, unknown>;
}

describe('admin_vue_globale', () => {
  it('compte le rattrapage sur la ligne du collecteur', async () => {
    const c = await creerCollecteur('Globale piégée', telephone());
    await poserJeuPiege(c);

    const ligne = ((await vueGlobale()).collecteurs as Array<Record<string, unknown>>).find(
      (l) => l.id === c.id,
    );

    expect(ligne).toMatchObject({
      encaisse: ATTENDU_PIEGE.encaisse,
      commissions: ATTENDU_PIEGE.commissions,
      restitutions: ATTENDU_PIEGE.restitue,
      encours: ATTENDU_PIEGE.duAuClient,
    });
  });

  it('ajoute un versement aux totaux, et rien d’autre', async () => {
    const c = await creerCollecteur('Globale totaux', telephone());
    const carte = await poserCartePiegee(c);

    const avant = (await vueGlobale()).totaux as Objet;
    await poserRattrapage(c, carte);
    const apres = (await vueGlobale()).totaux as Objet;

    expect({
      mises: apres.mises! - avant.mises!,
      total_encaisse: apres.total_encaisse! - avant.total_encaisse!,
      commissions: apres.commissions! - avant.commissions!,
      restitutions: apres.restitutions! - avant.restitutions!,
      encours_clients: apres.encours_clients! - avant.encours_clients!,
    }).toEqual({
      mises: 1,
      total_encaisse: MISE_PIEGE,
      commissions: 0,
      restitutions: 0,
      encours_clients: MISE_PIEGE,
    });
  });

  it('nomme un rattrapage dans les derniers mouvements', async () => {
    const c = await creerCollecteur('Globale liste', telephone());
    const carte = await poserCartePiegee(c);
    // Daté de cinq jours en avant : `mises.encaisse_le` est bornée à un jour
    // devant, donc aucune mise de la base ne peut l'être — ce rattrapage est le
    // plus récent, et il entre à coup sûr dans les vingt derniers. La table des
    // rattrapages n'a pas de borne de date ; le geste du chantier suivant lui en
    // posera une.
    await poserRattrapage(c, carte, { encaisseLe: new Date(Date.now() + 5 * 86_400_000).toISOString() });

    const derniers = (await vueGlobale()).mouvements as Array<Record<string, unknown>>;

    expect(derniers[0]).toMatchObject({ type: 'rattrapage', collecteur_id: c.id, montant: MISE_PIEGE });
  });
});

describe('admin_tendances', () => {
  it('ajoute le rattrapage aux flux, à la série de son jour et au compte', async () => {
    const c = await creerCollecteur('Tendances piégée', telephone());
    const carte = await poserCartePiegee(c);

    const avant = await tendances(7);
    await poserRattrapage(c, carte);
    const apres = await tendances(7);

    const duJour = (t: Record<string, unknown>) =>
      (t.serie as Array<Record<string, unknown>>).find((p) => p.jour === carte.jour) as Objet;
    const flux = (t: Record<string, unknown>) => t.flux as Objet;

    expect(flux(apres).encaisse! - flux(avant).encaisse!).toBe(MISE_PIEGE);
    expect(flux(apres).mises! - flux(avant).mises!).toBe(1);
    expect(flux(apres).commissions! - flux(avant).commissions!).toBe(0);
    expect(flux(apres).restitutions! - flux(avant).restitutions!).toBe(0);
    expect((apres.mouvements_total as number) - (avant.mouvements_total as number)).toBe(1);
    expect(duJour(apres).encaisse! - duJour(avant).encaisse!).toBe(MISE_PIEGE);
  });
});

describe('equipe_vue', () => {
  it('rend au titulaire l’encours qu’un rattrapage a créé chez son collaborateur', async () => {
    const patron = await creerCollecteur('Équipe patron', telephone());
    const awa = await creerCollecteur('Équipe awa', telephone());
    expect(
      (
        await admin
          .from('collecteurs')
          .update({ palier: 'illimite', abonnement_statut: 'actif' })
          .eq('id', patron.id)
      ).error,
    ).toBeNull();
    expect((await admin.from('collecteurs').update({ titulaire_id: patron.id }).eq('id', awa.id)).error).toBeNull();

    await poserJeuPiege(awa);

    const { data, error } = await patron.client.rpc('equipe_vue');
    expect(error).toBeNull();

    expect((data as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: awa.id,
      encours: ATTENDU_PIEGE.duAuClient,
      commissions: ATTENDU_PIEGE.commissions,
    });
  });
});
