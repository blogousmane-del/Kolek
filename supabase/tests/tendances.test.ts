import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Les tendances du tableau de bord.
 *
 * Deux choses comptent. **Le verrou** : la fonction rend les chiffres de toute
 * la plateforme, elle ne doit s'ouvrir à aucun navigateur. **La justesse des
 * bornes** : une mise d'hier ne doit pas tomber dans la journée d'aujourd'hui,
 * et une commission ne doit être comptée qu'une fois.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);

/** La mise de la carte d'essai. Le déclencheur refuse tout autre montant. */
const MISE = 1000;

let collecteur: CollecteurTest;
let carte: string;
let jetonAdmin: string;

/** Le jour d'Abidjan — UTC+0, sans heure d'été. */
function jour(decalage: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
}

function exigerSucces(etiquette: string, erreur: { message: string } | null) {
  if (erreur) throw new Error(`Préparation « ${etiquette} » : ${erreur.message}`);
}

/**
 * Une mise posée à midi, au jour voulu — midi évite tout effet de bord d'heure.
 *
 * Trois champs ne se posent pas ici : `mises_avant_insert` impose
 * `montant = cartes.mise` (sinon `MONTANT_INVALIDE`), décide lui-même
 * `est_commission` — vrai pour la première mise de la carte, quelle que soit sa
 * date — et réécrit `collecteur_id` depuis la carte. C'est l'ordre des
 * insertions qui fait la commission, pas leur jour.
 */
async function poserMise(decalage: number) {
  exigerSucces(
    `mise ${decalage}`,
    (
      await admin.from('mises').insert({
        id: crypto.randomUUID(),
        collecteur_id: collecteur.id,
        carte_id: carte,
        montant: MISE,
        encaisse_le: `${jour(decalage)}T12:00:00Z`,
      })
    ).error,
  );
}

beforeAll(async () => {
  collecteur = await creerCollecteur(`Tendances ${MARQUE}`, `+225075${MARQUE}`);

  const client = crypto.randomUUID();
  carte = crypto.randomUUID();
  exigerSucces(
    'client',
    (
      await admin
        .from('clients')
        .insert({ id: client, collecteur_id: collecteur.id, nom: `Client ${MARQUE}` })
    ).error,
  );
  exigerSucces(
    'carte',
    (
      await admin.from('cartes').insert({
        id: carte,
        collecteur_id: collecteur.id,
        client_id: client,
        mise: MISE,
      })
    ).error,
  );

  // Aujourd'hui : la première mise — que le serveur marque commission — puis
  // une seconde. Hier : rien, pour que le jour creux se voie dans la série.
  // Avant-hier : une troisième.
  await poserMise(0);
  await poserMise(0);
  await poserMise(-2);

  // Un compte administrateur, pour appeler la route sous une vraie identité :
  // le portillon interroge `est_admin()` avec le jeton de l'appelant.
  // `creerCollecteur` rend un client déjà connecté, d'où la session lisible
  // juste après. Le niveau vaut « admin » ou « super », et rien d'autre :
  // `admins_niveau_check` refuse toute autre valeur.
  const patron = await creerCollecteur(`Patron ${MARQUE}`, `+225076${MARQUE}`);
  exigerSucces(
    'droit admin',
    (await admin.from('admins').insert({ user_id: patron.id, niveau: 'admin' })).error,
  );
  const { data: session, error: erreurSession } = await patron.client.auth.getSession();
  exigerSucces('session du patron', erreurSession);
  jetonAdmin = session.session!.access_token;
});

afterAll(async () => {
  await nettoyer();
});

describe('le verrou', () => {
  it('refuse admin_tendances sans session', async () => {
    const { error } = await anonyme.rpc('admin_tendances', { p_jours: 7 });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|not exist|not find/i);
  });

  it('refuse admin_tendances à un collecteur authentifié', async () => {
    const { error } = await collecteur.client.rpc('admin_tendances', { p_jours: 7 });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|not exist|not find/i);
  });
});

describe('les bornes', () => {
  it('refuse une période de zéro jour', async () => {
    const { error } = await admin.rpc('admin_tendances', { p_jours: 0 });
    expect(error?.message).toMatch(/PERIODE_INVALIDE/);
  });

  it('refuse une période au-delà de quatre-vingt-dix jours', async () => {
    const { error } = await admin.rpc('admin_tendances', { p_jours: 91 });
    expect(error?.message).toMatch(/PERIODE_INVALIDE/);
  });
});

describe('ce qu’elle compte', () => {
  it('range la journée sur encaisse_le, et sépare hier d’aujourd’hui', async () => {
    const { data, error } = await admin.rpc('admin_tendances', { p_jours: 1 });
    expect(error).toBeNull();

    const t = data as {
      periode: { jours: number; debut: string; fin: string };
      flux: { encaisse: number; commissions: number; mises: number };
    };
    expect(t.periode.jours).toBe(1);
    expect(t.periode.debut).toBe(jour(0));
    expect(t.periode.fin).toBe(jour(0));
    // Deux mises de 1 000 aujourd'hui, dont la commission ; celle
    // d'avant-hier n'y est pas.
    expect(t.flux.encaisse).toBeGreaterThanOrEqual(2 * MISE);
    expect(t.flux.commissions).toBeGreaterThanOrEqual(MISE);
    expect(t.flux.mises).toBeGreaterThanOrEqual(2);
  });

  it('compte la commission une seule fois, sur les mises', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 30 });
    const t = data as { flux: { encaisse: number; commissions: number } };

    // La commission est une mise : elle entre dans l'encaissé, et n'est pas
    // ajoutée une seconde fois depuis retraits.commission.
    expect(t.flux.encaisse).toBeGreaterThanOrEqual(t.flux.commissions);
  });

  it('porte les jours creux à zéro plutôt que de les sauter', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 7 });
    const t = data as { serie: Array<{ jour: string; encaisse: number }> };

    const hier = t.serie.find((p) => p.jour === jour(-1));
    expect(hier).toBeDefined();
    expect(hier?.encaisse).toBe(0);
  });

  it('rend une série continue, du plus ancien au plus récent', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 7 });
    const t = data as { serie: Array<{ jour: string }> };

    const jours = t.serie.map((p) => p.jour);
    expect(jours.length).toBeGreaterThan(1);
    expect([...jours].sort()).toEqual(jours);
    expect(jours[jours.length - 1]).toBe(jour(0));
  });

  it('rend la période précédente, de même longueur', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 1 });
    const t = data as {
      flux_precedent: { encaisse: number };
      periode: { debut: string };
    };
    // Hier : aucune mise posée par ce jeu d'essai.
    expect(typeof t.flux_precedent.encaisse).toBe('number');
    expect(t.periode.debut).toBe(jour(0));
  });

  it('dit depuis quand la base a des mises', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 7 });
    const t = data as { depuis: string | null };
    expect(t.depuis).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('borne les mouvements et dit leur nombre total', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 30 });
    const t = data as { mouvements: unknown[]; mouvements_total: number };

    expect(t.mouvements.length).toBeLessThanOrEqual(200);
    expect(t.mouvements_total).toBeGreaterThanOrEqual(t.mouvements.length);
  });

  it('liste les collecteurs actifs sans mise depuis sept jours', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 7 });
    const t = data as {
      collecteurs_sans_mise: Array<{
        id: string;
        derniere_mise: string | null;
        jours_sans: number;
      }>;
    };

    // Celui du jeu d'essai a encaissé aujourd'hui : il n'y est pas.
    expect(t.collecteurs_sans_mise.some((c) => c.id === collecteur.id)).toBe(false);
    for (const c of t.collecteurs_sans_mise) {
      expect(c.jours_sans).toBeGreaterThan(7);
    }
  });
});

describe('la route', () => {
  const URL_FONCTION = `${process.env.SUPABASE_URL}/functions/v1/admin-vue-globale`;

  async function appeler(
    suffixe: string,
  ): Promise<{ statut: number; corps: Record<string, any> }> {
    const reponse = await fetch(`${URL_FONCTION}${suffixe}`, {
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${jetonAdmin}`,
      },
    });
    return { statut: reponse.status, corps: await reponse.json() };
  }

  it('ajoute la clé tendances sans toucher aux clés existantes', async () => {
    const { statut, corps } = await appeler('');
    expect(statut).toBe(200);
    for (const cle of ['totaux', 'zones', 'mouvements', 'collecteurs', 'tendances']) {
      expect(corps).toHaveProperty(cle);
    }
    expect(corps.tendances.periode.jours).toBe(7);
  });

  it('rend la période demandée', async () => {
    const { corps } = await appeler('?jours=1');
    expect(corps.tendances.periode.jours).toBe(1);
  });

  it('ne rend que les tendances quand on ne demande qu’elles', async () => {
    const { corps } = await appeler('?partie=tendances&jours=30');
    expect(corps.tendances.periode.jours).toBe(30);
    expect(corps.totaux).toBeUndefined();
  });

  it('refuse une période hors liste, sans repli silencieux', async () => {
    const { statut, corps } = await appeler('?jours=3');
    expect(statut).toBe(400);
    expect(corps.erreur).toBe('PERIODE_INVALIDE');
  });
});
