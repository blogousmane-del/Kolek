import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { mouvementsDepuis } from '../../packages/core/src/mouvements';
import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';
import { MISE_PIEGE, poserCartePiegee, poserJeuPiege, poserRattrapage, type JeuPiege } from './jeu-piege';

/**
 * La vue `mouvements` : ce qu'elle rend, à qui, et ce qu'elle refuse.
 *
 * Le point qui décide de tout est `security_invoker = true`. Sans lui, une vue
 * PostgreSQL s'exécute avec les droits de son propriétaire et **contourne les
 * politiques RLS des tables sous-jacentes** : elle exposerait à chaque
 * collecteur l'argent de tous les autres. L'épreuve d'isolation plus bas est le
 * contrôle de cette ligne, et elle n'est pas optionnelle.
 */

afterAll(nettoyer);

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

const COLONNES = 'id, nature, sens, montant, main_id, carte_id, survenu_le, est_commission';

interface LigneVue {
  id: string;
  nature: string;
  sens: number;
  montant: number;
  main_id: string;
  carte_id: string;
  survenu_le: string;
  est_commission: boolean;
}

const parId = <T extends { id: string }>(lignes: readonly T[]): T[] =>
  [...lignes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

let a: CollecteurTest;
let b: CollecteurTest;
let jeuA: JeuPiege;
let jeuB: JeuPiege;

beforeAll(async () => {
  a = await creerCollecteur('Registre A', telephone());
  b = await creerCollecteur('Registre B', telephone());
  jeuA = await poserJeuPiege(a);
  jeuB = await poserJeuPiege(b);
});

describe('ce que la vue rend', () => {
  it('réunit les trois natures du jeu piégé', async () => {
    const { data, error } = await a.client.from('mouvements').select(COLONNES);
    expect(error).toBeNull();
    const lignes = (data ?? []) as LigneVue[];

    expect(lignes.filter((l) => l.nature === 'mise')).toHaveLength(30);
    expect(lignes.filter((l) => l.nature === 'retrait')).toEqual([
      expect.objectContaining({ sens: -1, montant: 29_000, est_commission: false }),
    ]);
    expect(lignes.filter((l) => l.nature === 'rattrapage')).toEqual([
      expect.objectContaining({
        id: jeuA.rattrapageId,
        sens: 1,
        montant: MISE_PIEGE,
        main_id: a.id,
        est_commission: false,
      }),
    ]);
  });

  it('compte 31 000 encaissés, et 2 000 encore en main', async () => {
    const { data } = await a.client.from('mouvements').select('sens, montant');
    const lignes = (data ?? []) as Array<{ sens: number; montant: number }>;

    expect(lignes.filter((l) => l.sens === 1).reduce((s, l) => s + l.montant, 0)).toBe(31_000);
    expect(lignes.reduce((s, l) => s + l.sens * l.montant, 0)).toBe(2_000);
  });

  it('porte le client de la carte, pour les trois natures', async () => {
    const { data } = await a.client.from('mouvements').select('nature, client_id, collecteur_id');

    for (const ligne of (data ?? []) as Array<{ client_id: string; collecteur_id: string }>) {
      expect(ligne.client_id).toBe(jeuA.clientId);
      expect(ligne.collecteur_id).toBe(a.id);
    }
  });

  it('rend exactement les lignes que le téléphone calcule', async () => {
    const [vue, mises, retraits, rattrapages] = await Promise.all([
      a.client.from('mouvements').select(COLONNES),
      admin
        .from('mises')
        .select('id, carte_id, montant, encaisse_par, encaisse_le, est_commission')
        .eq('collecteur_id', a.id),
      admin
        .from('retraits')
        .select('id, carte_id, montant_restitue, restitue_par, effectue_le')
        .eq('collecteur_id', a.id),
      admin.from('rattrapages').select('id, carte_id, montant, main_id, encaisse_le').eq('collecteur_id', a.id),
    ]);
    for (const r of [vue, mises, retraits, rattrapages]) expect(r.error).toBeNull();

    const calcule = mouvementsDepuis({
      mises: ((mises.data ?? []) as Array<Record<string, never>>).map((m: Record<string, unknown>) => ({
        id: String(m.id),
        carteId: String(m.carte_id),
        montant: Number(m.montant),
        encaissePar: String(m.encaisse_par),
        encaisseLe: String(m.encaisse_le),
        estCommission: Boolean(m.est_commission),
      })),
      retraits: ((retraits.data ?? []) as Array<Record<string, never>>).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        carteId: String(r.carte_id),
        montantRestitue: Number(r.montant_restitue),
        restituePar: String(r.restitue_par),
        effectueLe: String(r.effectue_le),
      })),
      rattrapages: ((rattrapages.data ?? []) as Array<Record<string, never>>).map(
        (t: Record<string, unknown>) => ({
          id: String(t.id),
          carteId: String(t.carte_id),
          montant: Number(t.montant),
          mainId: String(t.main_id),
          encaisseLe: String(t.encaisse_le),
        }),
      ),
    });

    const depuisLaVue = parId((vue.data ?? []) as LigneVue[]).map((l) => ({
      id: l.id,
      nature: l.nature,
      sens: l.sens,
      montant: l.montant,
      mainId: l.main_id,
      carteId: l.carte_id,
      survenuLe: l.survenu_le,
      estCommission: l.est_commission,
    }));

    expect(depuisLaVue).toEqual(parId(calcule));
  });
});

describe('à qui la vue rend', () => {
  it('ne rend à un collecteur que ses lignes, rattrapage compris', async () => {
    const { data } = await a.client.from('mouvements').select('id, collecteur_id');
    const lignes = (data ?? []) as Array<{ id: string; collecteur_id: string }>;

    // `every` est vrai sur une liste vide, et `not.toContain` aussi : une vue qui
    // ne rendrait plus rien du tout passerait cette épreuve d'isolation sans rien
    // isoler. On compte donc le jeu de A avant de regarder à qui il appartient.
    expect(lignes).toHaveLength(32); // 30 mises + 1 retrait + 1 rattrapage
    expect(lignes.map((l) => l.id)).toContain(jeuA.rattrapageId);

    expect(lignes.every((l) => l.collecteur_id === a.id)).toBe(true);
    expect(lignes.map((l) => l.id)).not.toContain(jeuB.rattrapageId);
  });

  it('ne rend rien à anon', async () => {
    const { data, error } = await anonyme.from('mouvements').select('id');

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('rend au collaborateur et au titulaire ce que leurs tables leur rendent', async () => {
    const patron = await creerCollecteur('Registre Patron', telephone());
    const awa = await creerCollecteur('Registre Awa', telephone());
    expect(
      (
        await admin
          .from('collecteurs')
          .update({ palier: 'illimite', abonnement_statut: 'actif' })
          .eq('id', patron.id)
      ).error,
    ).toBeNull();
    expect((await admin.from('collecteurs').update({ titulaire_id: patron.id }).eq('id', awa.id)).error).toBeNull();

    // La carte est à Awa ; le titulaire encaisse et rend pour elle. La main
    // n'est donc pas le propriétaire, et c'est le cas que la vue doit tenir.
    const carte = await poserCartePiegee(awa);
    await poserRattrapage(awa, carte, { mainId: patron.id });
    const client2 = crypto.randomUUID();
    const carte2 = crypto.randomUUID();
    await admin.from('clients').insert({ id: client2, collecteur_id: awa.id, nom: 'Cliente du patron' });
    await admin.from('cartes').insert({ id: carte2, collecteur_id: awa.id, client_id: client2, mise: MISE_PIEGE });
    const miseId = crypto.randomUUID();
    await admin.from('mises').insert({
      id: miseId,
      collecteur_id: awa.id,
      carte_id: carte2,
      montant: MISE_PIEGE,
      encaisse_le: new Date().toISOString(),
      encaisse_par: patron.id,
    });
    await admin.from('retraits').insert({
      collecteur_id: awa.id,
      carte_id: carte2,
      montant_restitue: 0,
      commission: MISE_PIEGE,
      restitue_par: patron.id,
    });

    for (const qui of [patron, awa]) {
      const [vue, mises, retraits, rattrapages] = await Promise.all([
        qui.client.from('mouvements').select('id'),
        qui.client.from('mises').select('id'),
        qui.client.from('retraits').select('id'),
        qui.client.from('rattrapages').select('id'),
      ]);
      const depuisLesTables = [
        ...((mises.data ?? []) as Array<{ id: string }>),
        ...((retraits.data ?? []) as Array<{ id: string }>),
        ...((rattrapages.data ?? []) as Array<{ id: string }>),
      ]
        .map((l) => l.id)
        .sort();

      // Deux listes vides sont égales : l'égalité ne prouve rien tant qu'aucune
      // ligne connue n'a été vue passer. On l'exige de la propriétaire des
      // cartes ; pour le titulaire, seule l'égalité est affirmée ici — ce que la
      // RLS lui accorde au juste est le sujet des épreuves d'équipe.
      if (qui === awa) expect(depuisLesTables).toContain(miseId);

      expect(((vue.data ?? []) as Array<{ id: string }>).map((l) => l.id).sort()).toEqual(depuisLesTables);
    }
  });
});

describe('ce que la table des rattrapages refuse', () => {
  it('refuse à un collecteur d’en écrire un', async () => {
    const insertion = await a.client.from('rattrapages').insert({
      collecteur_id: a.id,
      main_id: a.id,
      carte_id: jeuA.carteId,
      rejet_id: crypto.randomUUID(),
      montant: MISE_PIEGE,
      encaisse_le: new Date().toISOString(),
    });
    const modification = await a.client.from('rattrapages').update({ montant: 5000 }).eq('id', jeuA.rattrapageId);
    const suppression = await a.client.from('rattrapages').delete().eq('id', jeuA.rattrapageId);

    expect(insertion.error).not.toBeNull();
    expect(modification.error).not.toBeNull();
    expect(suppression.error).not.toBeNull();

    const { data } = await admin.from('rattrapages').select('montant').eq('id', jeuA.rattrapageId).single();
    expect(data?.montant).toBe(MISE_PIEGE);
  });

  it('refuse même à la clé de service de modifier ou d’effacer', async () => {
    const modification = await admin.from('rattrapages').update({ montant: 5000 }).eq('id', jeuA.rattrapageId);
    const suppression = await admin.from('rattrapages').delete().eq('id', jeuA.rattrapageId);

    expect(modification.error?.message).toContain('LIGNE_IMMUABLE');
    expect(suppression.error?.message).toContain('LIGNE_IMMUABLE');
  });

  it('refuse un second rattrapage pour le même refus', async () => {
    const { error } = await admin.from('rattrapages').insert({
      collecteur_id: a.id,
      main_id: a.id,
      carte_id: jeuA.carteId,
      rejet_id: jeuA.rejetId,
      montant: MISE_PIEGE,
      encaisse_le: new Date().toISOString(),
    });

    expect(error?.code).toBe('23505');
  });
});
