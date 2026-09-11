import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * La santé du système : le relevé quotidien, la purge du journal pg_cron, et
 * ce que l'écran Super Admin lit.
 *
 * Deux choses comptent ici. **Le verrou** : trois fonctions `security definer`,
 * dont l'une supprime des lignes — aucune ne doit s'ouvrir à un navigateur.
 * **L'idempotence** : un relevé relancé le même jour remplace le premier, il
 * n'en ajoute pas un second qui fausserait la courbe.
 *
 * ## Ce que ce fichier ne prouve pas
 *
 * L'effet de la purge. PostgREST ne sert pas le schéma `cron`, et la clé de
 * service ne peut pas y poser de fausses traces anciennes : la purge est
 * éprouvée sur ses droits, sa borne et son exécution. Son effet se vérifie en
 * production après le 2026-09-22, par un compte agrégé.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
const FONCTIONS = ['releve_du_jour', 'sante_systeme', 'purger_journal_cron'] as const;

let collecteur: CollecteurTest;

/** Le jour d'Abidjan — UTC+0, sans heure d'été — au format de la base. */
const aujourdhui = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  collecteur = await creerCollecteur(`Santé ${MARQUE}`, `+225077${MARQUE}`);
});

afterAll(async () => {
  await nettoyer();
});

describe('le verrou', () => {
  for (const fonction of FONCTIONS) {
    it(`refuse ${fonction} sans session`, async () => {
      const { error } = await anonyme.rpc(fonction);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied|not exist|not find/i);
    });

    it(`refuse ${fonction} à un collecteur authentifié`, async () => {
      const { error } = await collecteur.client.rpc(fonction);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied|not exist|not find/i);
    });
  }

  it('ferme la table des relevés aux navigateurs', async () => {
    const { data, error } = await collecteur.client.from('releves_quotidiens').select('jour');
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});

describe('le relevé', () => {
  it('écrit la ligne du jour, et une seule même relancé', async () => {
    const premier = await admin.rpc('releve_du_jour');
    const second = await admin.rpc('releve_du_jour');

    expect(premier.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data).toBe(aujourdhui());

    const { data, error } = await admin
      .from('releves_quotidiens')
      .select('jour')
      .eq('jour', aujourdhui());
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('reprend les volumes et l’encours des fonctions qui les servent déjà', async () => {
    await admin.rpc('releve_du_jour');
    const [{ data: releve }, { data: reglages }] = await Promise.all([
      admin.from('releves_quotidiens').select('*').eq('jour', aujourdhui()).single(),
      admin.rpc('admin_reglages'),
    ]);

    // La même source que l'écran : deux calculs du même chiffre finiraient
    // par donner deux vérités.
    expect(releve.volumes).toEqual(reglages.volumes);
    expect(typeof releve.encours_clients).toBe('number');
    expect(releve.taille_base).toBeGreaterThan(0);
    expect(releve.taille_journal_cron).toBeGreaterThanOrEqual(0);
  });
});

describe('la lecture', () => {
  it('rend toutes les clés que l’écran lit', async () => {
    await admin.rpc('releve_du_jour');
    const { data, error } = await admin.rpc('sante_systeme');
    expect(error).toBeNull();

    expect(Object.keys(data).sort()).toEqual([
      'base',
      'drainage',
      'files',
      'journal_cron',
      'mesure_le',
      'releve',
      'releves',
    ]);
    expect(data.base.taille).toBeGreaterThan(0);
    expect(data.base.max_connexions).toBeGreaterThan(0);
    // L'appel lui-même occupe une connexion cliente.
    expect(data.base.connexions).toBeGreaterThanOrEqual(1);
    expect(typeof data.drainage.executions_24h).toBe('number');
    expect(typeof data.drainage.echecs_24h).toBe('number');
    expect(typeof data.files.rejets_non_traites).toBe('number');
    expect(data.releve.dernier_jour).toBe(aujourdhui());
  });

  it('rend les relevés du plus ancien au plus récent, quatre-vingt-dix au plus', async () => {
    const { data } = await admin.rpc('sante_systeme');
    const jours = (data.releves as Array<{ jour: string }>).map((r) => r.jour);

    expect(jours.length).toBeGreaterThanOrEqual(1);
    expect(jours.length).toBeLessThanOrEqual(90);
    expect([...jours].sort()).toEqual(jours);
  });
});

describe('la purge', () => {
  it('s’exécute sous la clé de service et dit combien elle a supprimé', async () => {
    const { data, error } = await admin.rpc('purger_journal_cron', { p_jours: 30 });
    expect(error).toBeNull();
    expect(typeof data).toBe('number');
  });

  it('refuse une borne sous un jour', async () => {
    const { error } = await admin.rpc('purger_journal_cron', { p_jours: 0 });
    expect(error?.message).toMatch(/PURGE_BORNE/);
  });
});
