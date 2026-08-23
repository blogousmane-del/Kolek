import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * La table des demandes d'ouverture, vue depuis l'extérieur.
 *
 * C'est la première table du produit qu'un chemin public alimente. Les tests
 * ci-dessous portent donc d'abord sur ce que le navigateur **ne peut pas**
 * faire : la liste des prospects de GTCS — des noms et des numéros de téléphone
 * de commerçants d'Abidjan — ne doit être lisible par personne d'autre que
 * l'administration.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
let collecteur: CollecteurTest;

beforeAll(async () => {
  collecteur = await creerCollecteur(`Demandes ${MARQUE}`, `+225076${MARQUE}`);
});

afterAll(async () => {
  await admin.from('demandes_ouverture').delete().like('nom', `Sonde ${MARQUE}%`);
  await nettoyer();
});

describe('le verrou de la table', () => {
  it('refuse la lecture anonyme', async () => {
    const { error } = await anonyme.from('demandes_ouverture').select('*');

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|not exist|not find/i);
  });

  it('refuse l’écriture anonyme directe', async () => {
    // Le formulaire passe par l'Edge Function, jamais par PostgREST. Écrire en
    // direct contournerait la validation et les bornes de la fonction.
    const { error } = await anonyme
      .from('demandes_ouverture')
      .insert({ nom: 'Contournement', telephone: '0700000000' });

    expect(error).not.toBeNull();
  });

  it('refuse la lecture à un collecteur authentifié', async () => {
    // Le cas qui compte : ce compte est légitime, sa session est valide, et il
    // ne doit pas pouvoir lire la liste des prospects de GTCS.
    const { error } = await collecteur.client.from('demandes_ouverture').select('*');

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|not exist|not find/i);
  });
});

describe('le verrou des fonctions', () => {
  it('refuse admin_demandes à un anonyme', async () => {
    const { error } = await anonyme.rpc('admin_demandes');
    expect(error).not.toBeNull();
  });

  it('refuse admin_demandes à un collecteur authentifié', async () => {
    const { error } = await collecteur.client.rpc('admin_demandes');
    expect(error).not.toBeNull();
  });

  it('refuse admin_traiter_demande à un collecteur authentifié', async () => {
    const { error } = await collecteur.client.rpc('admin_traiter_demande', {
      demande_id: crypto.randomUUID(),
      nouveau_statut: 'ouverte',
      administrateur: collecteur.id,
    });
    expect(error).not.toBeNull();
  });
});

describe('les bornes de la base', () => {
  it('refuse un nom trop long, même sous clé de service', async () => {
    // La borne est la dernière ligne de défense : elle tient même si l'Edge
    // Function change, ou si quelqu'un écrit par un autre chemin.
    const { error } = await admin.from('demandes_ouverture').insert({
      nom: 'x'.repeat(121),
      telephone: '0701020304',
    });

    expect(error?.code).toBe('23514');
  });

  it('refuse un palier inconnu', async () => {
    const { error } = await admin.from('demandes_ouverture').insert({
      nom: `Sonde ${MARQUE} palier`,
      telephone: `+2250700${MARQUE.slice(0, 4)}`,
      palier: 'gratuit',
    });

    expect(error?.code).toBe('23514');
  });

  it('refuse un traitement sans date', async () => {
    // `demandes_traitement_coherent` : une demande marquée « ouverte » sans
    // savoir quand ne vaut pas mieux qu'une demande perdue.
    const { error } = await admin.from('demandes_ouverture').insert({
      nom: `Sonde ${MARQUE} coherence`,
      telephone: `+2250701${MARQUE.slice(0, 4)}`,
      statut: 'ouverte',
    });

    expect(error?.code).toBe('23514');
  });

  it('n’accepte qu’une seule demande en attente par numéro', async () => {
    const telephone = `+2250702${MARQUE.slice(0, 4)}`;

    const premiere = await admin
      .from('demandes_ouverture')
      .insert({ nom: `Sonde ${MARQUE} un`, telephone });
    expect(premiere.error).toBeNull();

    const seconde = await admin
      .from('demandes_ouverture')
      .insert({ nom: `Sonde ${MARQUE} deux`, telephone });

    // Sans cette contrainte, un formulaire public se soumet mille fois.
    expect(seconde.error?.code).toBe('23505');
  });

  it('laisse redemander une fois la demande traitée', async () => {
    const telephone = `+2250703${MARQUE.slice(0, 4)}`;

    await admin.from('demandes_ouverture').insert({ nom: `Sonde ${MARQUE} a`, telephone });
    await admin
      .from('demandes_ouverture')
      .update({ statut: 'refusee', traite_le: new Date().toISOString() })
      .eq('telephone', telephone);

    // L'index est partiel : un collecteur refusé en août peut revenir en
    // décembre. Un verrou définitif sur le numéro serait une punition à vie.
    const retour = await admin
      .from('demandes_ouverture')
      .insert({ nom: `Sonde ${MARQUE} b`, telephone });

    expect(retour.error).toBeNull();
  });
});

describe('ce que rend admin_demandes', () => {
  it('rend un tableau, jamais null', async () => {
    const { data, error } = await admin.rpc('admin_demandes');

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('met les nouvelles demandes en tête', async () => {
    const { data } = await admin.rpc('admin_demandes');
    const lignes = data as Array<{ statut: string }>;
    if (lignes.length < 2) return;

    // L'ordre de travail de celui qui rappelle : ce qui n'a pas encore été
    // traité, d'abord.
    const premierTraite = lignes.findIndex((l) => l.statut !== 'nouvelle');
    const dernierNouveau = lignes.map((l) => l.statut).lastIndexOf('nouvelle');
    if (premierTraite !== -1 && dernierNouveau !== -1) {
      expect(dernierNouveau).toBeLessThan(premierTraite);
    }
  });

  it('journalise chaque demande', async () => {
    const telephone = `+2250704${MARQUE.slice(0, 4)}`;
    await admin.from('demandes_ouverture').insert({ nom: `Sonde ${MARQUE} journal`, telephone });

    const { data } = await admin
      .from('audit_log')
      .select('table_cible')
      .eq('table_cible', 'demandes_ouverture')
      .limit(1);

    expect((data ?? []).length).toBe(1);
  });
});
