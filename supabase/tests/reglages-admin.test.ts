import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * `admin_reglages()` — l'état de la plateforme servi à l'écran Réglages.
 *
 * Deux choses sont vérifiées ici, et la première compte plus que la seconde.
 *
 * **Le verrou.** Cette fonction rend la liste des administrateurs de la
 * plateforme. Une fonction `security definer` laissée exécutable par `public` —
 * ce que `create or replace` rétablit silencieusement à chaque redéfinition —
 * donnerait à n'importe quel collecteur authentifié la liste de ceux qui
 * détiennent les droits. C'est le défaut que la migration garde par un
 * `do $garde$`, et que ces tests reprennent depuis l'extérieur.
 *
 * **Le contenu.** Les volumes doivent être des comptes exacts, et la liste des
 * tables journalisées doit venir de `pg_trigger` — donc suivre une migration
 * qui ajouterait un déclencheur, sans qu'on ait à toucher au code.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
let collecteur: CollecteurTest;

beforeAll(async () => {
  collecteur = await creerCollecteur(`Réglages ${MARQUE}`, `+225075${MARQUE}`);
});

afterAll(async () => {
  await nettoyer();
});

describe('le verrou', () => {
  it('refuse un appel anonyme', async () => {
    const { error } = await anonyme.rpc('admin_reglages');

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|not exist|not find/i);
  });

  it('refuse un collecteur authentifié', async () => {
    // Le cas qui compte : ce compte est légitime, il a une session valide, et il
    // ne doit pas pouvoir lire qui administre la plateforme.
    const { error } = await collecteur.client.rpc('admin_reglages');

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|not exist|not find/i);
  });

  it('accepte la clé de service', async () => {
    const { data, error } = await admin.rpc('admin_reglages');

    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });
});

describe('le contenu', () => {
  it('rend les clés attendues par l’écran', async () => {
    const { data } = await admin.rpc('admin_reglages');
    const vue = data as Record<string, unknown>;

    // L'écran lit ces cinq clés. Une clé oubliée par une future réécriture ferait
    // planter une section sur `undefined` — le défaut exact trouvé le 2026-08-20
    // sur `admin-vue-globale`, qui recomposait sa réponse à la main.
    for (const cle of ['genere_le', 'administrateurs', 'volumes', 'journal', 'postgres']) {
      expect(vue).toHaveProperty(cle);
    }
  });

  it('compte les collecteurs exactement, pas approximativement', async () => {
    const { count } = await admin
      .from('collecteurs')
      .select('id', { count: 'exact', head: true });

    const { data } = await admin.rpc('admin_reglages');
    const volumes = (data as { volumes: Record<string, number> }).volumes;

    expect(volumes.collecteurs).toBe(count);
  });

  it('nomme les tables réellement journalisées, lues dans pg_trigger', async () => {
    const { data } = await admin.rpc('admin_reglages');
    const tables = (data as { journal: { tables: string[] } }).journal.tables;

    // Les six déclencheurs en vigueur au 2026-08-22. Cette liste n'est écrite
    // nulle part dans la fonction : elle est déduite du catalogue, donc une
    // migration qui ajoute un déclencheur la fait grandir toute seule.
    for (const attendue of ['mises', 'cartes', 'retraits', 'caisses_jour', 'clients', 'collecteurs']) {
      expect(tables).toContain(attendue);
    }
  });

  it('rend une liste d’administrateurs, jamais nulle', async () => {
    // `coalesce(..., '[]')` : une base sans administrateur doit rendre un
    // tableau vide, pas `null`. L'écran ferait `null.map` sinon.
    const { data } = await admin.rpc('admin_reglages');
    const admins = (data as { administrateurs: unknown[] }).administrateurs;

    expect(Array.isArray(admins)).toBe(true);
  });

  it('ne divulgue aucune adresse électronique ni aucun secret', async () => {
    // La règle de l'écran Réglages : les administrateurs sont identifiés par
    // leur nom et leur téléphone. L'adresse sert à se connecter ; elle n'a pas à
    // circuler vers un navigateur pour un besoin d'affichage.
    const { data } = await admin.rpc('admin_reglages');
    const texte = JSON.stringify(data);

    expect(texte).not.toMatch(/@/);
    expect(texte.toLowerCase()).not.toMatch(/service_role|encrypted_password|secret/);
  });

  it('rend la version de Postgres, et rien de plus sur le serveur', async () => {
    const { data } = await admin.rpc('admin_reglages');
    const version = (data as { postgres: string }).postgres;

    // `version()` rendrait aussi le système d'exploitation et le compilateur.
    // On n'en garde que le numéro : le reste renseigne sans servir.
    expect(version).toMatch(/^\d+(\.\d+)*$/);
  });
});

describe('les administrateurs', () => {
  it('met un nom sur chaque identifiant', async () => {
    const { data: ligneAdmin } = await admin.from('admins').select('user_id').limit(1).maybeSingle();
    if (!ligneAdmin) return; // base de test sans administrateur : rien à vérifier

    const { data } = await admin.rpc('admin_reglages');
    const admins = (data as { administrateurs: Array<{ user_id: string; nom: string }> })
      .administrateurs;

    const trouve = admins.find((a) => a.user_id === ligneAdmin.user_id);
    expect(trouve).toBeTruthy();
    // La jointure est en `left join` : un compte présent dans `admins` sans
    // ligne `collecteurs` doit apparaître quand même, avec une mention explicite
    // plutôt qu'un nom vide.
    expect(trouve!.nom.length).toBeGreaterThan(0);
  });
});
