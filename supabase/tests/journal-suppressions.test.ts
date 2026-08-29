import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Ce que le journal ne voyait pas : les suppressions, et les administrateurs.
 *
 * ## Le constat du 2026-08-29
 *
 * Le journal d'identités du 2026-08-21 couvre `clients`, `cartes`,
 * `collecteurs`, `caisses_jour` et `demandes_ouverture`. Il les couvre en
 * `INSERT` et `UPDATE`. **Pas en `DELETE`** — `journaliser()` lisait `new`, qui
 * est nul sur une suppression.
 *
 * L'argument du journal est écrit dans sa propre migration : « le remède n'est
 * pas l'interdiction, c'est la trace ». Or l'opération qui détruit ce qu'on
 * voulait pouvoir relire était précisément la seule sans trace. Modifier le nom
 * d'un client se voyait ; supprimer le client, non.
 *
 * `mises`, `retraits` et `audit_log` ne sont pas concernés : `interdire_modification`
 * y bloque déjà `UPDATE` et `DELETE`. L'argent est immuable, le journal aussi.
 * C'est pourquoi ils ne journalisent que l'insertion — le reste ne peut pas
 * arriver.
 *
 * ## `admins`, la table qui n'avait aucune trace
 *
 * Elle décide qui est administrateur. RLS active, zéro politique : seul
 * `service_role` peut y écrire. C'est une bonne fermeture — et c'est aussi
 * exactement la clé publiée le 2026-08-24, restée valide quatre jours.
 *
 * Pendant cette fenêtre, une ligne insérée ici accordait l'administration de
 * tout le produit, et **rien ne l'aurait enregistré**. La colonne `cree_le`
 * date une création, elle ne dit rien d'une suppression ni d'une modification,
 * et elle ne survit pas à la ligne.
 *
 * Une table de privilèges sans journal est le seul endroit où une intrusion
 * peut devenir permanente sans laisser de quoi la constater.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
let collecteur: CollecteurTest;

beforeAll(async () => {
  collecteur = await creerCollecteur(`Suppr ${MARQUE}`, `+225074${MARQUE}`);
});

afterAll(async () => {
  await nettoyer();
});

/**
 * Les traces d'une ligne, **sur une table nommee**.
 *
 * Le filtre par table n'est pas une precaution de style. Sans lui, le premier
 * jet de ce fichier voyait vert le test « l'octroi est journalise » alors que
 * rien ne journalisait `admins` : `audit_log` portait deja la creation du
 * collecteur sous le meme `ligne_id`, puisque `admins.user_id` **est**
 * l'identifiant du compte. Un test qui passe sans la fonctionnalite est pire
 * qu'un test absent.
 */
async function tracesSur(
  ligneId: string,
  table: string,
): Promise<Array<{ action: string; donnees: unknown }>> {
  const { data } = await admin
    .from('audit_log')
    .select('action, donnees, table_cible')
    .eq('ligne_id', ligneId)
    .eq('table_cible', table)
    .order('survenu_le');
  return (data ?? []) as Array<{ action: string; donnees: unknown }>;
}

describe('la suppression laisse une trace', () => {
  it('journalise la suppression d’un client', async () => {
    const clientId = crypto.randomUUID();
    await admin
      .from('clients')
      .insert({ id: clientId, collecteur_id: collecteur.id, nom: `Effacé ${MARQUE}` });

    await admin.from('clients').delete().eq('id', clientId);

    expect((await tracesSur(clientId, 'clients')).map((t) => t.action)).toEqual(['insert', 'delete']);
  });

  it('conserve dans la trace ce que la suppression a emporté', async () => {
    // Sans les données d'avant, la trace dirait qu'une ligne a disparu sans
    // dire laquelle — ce qui ne permet ni de constater ni de restituer.
    const clientId = crypto.randomUUID();
    const nom = `Kouadio ${MARQUE}`;
    await admin.from('clients').insert({ id: clientId, collecteur_id: collecteur.id, nom });

    await admin.from('clients').delete().eq('id', clientId);

    const traces = await tracesSur(clientId, 'clients');
    const suppression = traces.find((t) => t.action === 'delete');
    expect((suppression?.donnees as { nom?: string } | undefined)?.nom).toBe(nom);
  });
});

describe('la table des administrateurs', () => {
  it('journalise l’octroi des droits d’administrateur', async () => {
    // Le compte d'un collecteur sert de sujet : `admins.user_id` référence
    // `auth.users`, il faut donc un compte réel.
    await admin.from('admins').insert({ user_id: collecteur.id });

    const traces = await tracesSur(collecteur.id, 'admins');
    expect(traces.map((t) => t.action)).toContain('insert');
  });

  it('journalise le retrait des droits d’administrateur', async () => {
    // Le geste qu'un intrus ferait en dernier : reprendre ses droits pour ne
    // pas figurer dans la liste. Sans trace du retrait, la liste courante
    // suffirait à effacer le passage.
    await admin.from('admins').delete().eq('user_id', collecteur.id);

    const traces = await tracesSur(collecteur.id, 'admins');
    expect(traces.map((t) => t.action)).toContain('delete');
  });
});
