import { afterAll, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le journal de securite nomme qui a agi.
 *
 * Deux choses comptent. **Le verrou** : la fonction rend le journal de toute
 * la plateforme, elle ne s'ouvre a aucun navigateur. **L'honnetete du nom** :
 * un acteur sans fiche se dit « Compte sans fiche », une ligne anterieure au
 * 2026-08-30 n'a pas d'acteur du tout, et aucun des deux ne s'invente.
 *
 * Le describe « les noms » suppose au moins une ligne dans le journal. Il la
 * doit au describe « le verrou », qui cree un collecteur juste avant — une
 * insertion journalisee. Reordonner les describes casserait cette epreuve
 * sans que la cause saute aux yeux.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);

let collecteur: CollecteurTest;

afterAll(async () => {
  await nettoyer();
});

describe('le verrou', () => {
  it('refuse super_admin_journal sans session', async () => {
    const { error } = await anonyme.rpc('super_admin_journal', { p_page: 1, p_taille: 5 });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|not exist|not find/i);
  });

  it('refuse super_admin_journal a un collecteur authentifie', async () => {
    collecteur = await creerCollecteur(`Journal ${MARQUE}`, `+2250700${MARQUE.slice(0, 4)}`);
    const { error } = await collecteur.client.rpc('super_admin_journal', {
      p_page: 1,
      p_taille: 5,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|not exist|not find/i);
  });
});

describe('les noms', () => {
  it('rend une cle de nom pour l’acteur et pour la cible', async () => {
    const { data, error } = await admin.rpc('super_admin_journal', { p_page: 1, p_taille: 5 });

    expect(error).toBeNull();
    const lignes = (data as { lignes: Record<string, unknown>[] }).lignes;
    expect(lignes.length).toBeGreaterThan(0);
    expect(lignes[0]).toHaveProperty('acteur_nom');
    expect(lignes[0]).toHaveProperty('cible_nom');
  });

  /**
   * Une ligne ecrite par la cle de service sans en-tete n'a pas d'acteur. Le
   * nom doit alors valoir null, jamais « Compte sans fiche » : retomber sur un
   * libelle ferait passer une absence pour une identite manquante.
   */
  it('n’invente aucun nom : la cle vaut null quand l’acteur n’en a pas', async () => {
    const { data } = await admin.rpc('super_admin_journal', { p_page: 1, p_taille: 50 });

    const lignes = (data as { lignes: { acteur_id: string | null; acteur_nom: string | null }[] })
      .lignes;
    for (const l of lignes) {
      if (l.acteur_id === null) expect(l.acteur_nom).toBeNull();
    }
  });
});
