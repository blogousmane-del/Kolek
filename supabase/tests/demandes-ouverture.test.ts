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

describe('le verrou d’admin_demande', () => {
  it('refuse la lecture d’une demande à un collecteur authentifié', async () => {
    // Une seule ligne suffit à livrer un prospect : nom, numéro, adresse.
    const { error } = await collecteur.client.rpc('admin_demande', {
      demande_id: crypto.randomUUID(),
    });
    expect(error).not.toBeNull();
  });

  it('refuse admin_demande à un anonyme', async () => {
    const { error } = await anonyme.rpc('admin_demande', {
      demande_id: crypto.randomUUID(),
    });
    expect(error).not.toBeNull();
  });
});

describe('l’adresse électronique', () => {
  it('accepte une demande sans adresse — les anciennes n’en ont pas', async () => {
    // La colonne est nullable exprès. Ce test garde cette décision : un
    // `not null` ajouté plus tard casserait la reprise des demandes déposées
    // avant le 2026-08-27.
    const { error } = await admin.from('demandes_ouverture').insert({
      nom: `Sonde ${MARQUE} sans adresse`,
      telephone: `+2250700${MARQUE}1`,
    });
    expect(error).toBeNull();
  });

  it('refuse une seconde demande en attente sur la même adresse', async () => {
    const adresse = `sonde-${MARQUE}@example.ci`;
    const premiere = await admin.from('demandes_ouverture').insert({
      nom: `Sonde ${MARQUE} A`,
      telephone: `+2250700${MARQUE}2`,
      email: adresse,
    });
    expect(premiere.error).toBeNull();

    const seconde = await admin.from('demandes_ouverture').insert({
      nom: `Sonde ${MARQUE} B`,
      telephone: `+2250700${MARQUE}3`,
      email: adresse,
    });
    expect(seconde.error?.code).toBe('23505');
  });

  it('refuse la même adresse écrite en majuscules', async () => {
    // L'index porte sur `lower(email)`. Sans cela, une majuscule suffirait à
    // redéposer, et le garde-spam ne garderait rien.
    const adresse = `casse-${MARQUE}@example.ci`;
    await admin.from('demandes_ouverture').insert({
      nom: `Sonde ${MARQUE} C`,
      telephone: `+2250700${MARQUE}4`,
      email: adresse,
    });

    const { error } = await admin.from('demandes_ouverture').insert({
      nom: `Sonde ${MARQUE} D`,
      telephone: `+2250700${MARQUE}5`,
      email: adresse.toUpperCase(),
    });
    expect(error?.code).toBe('23505');
  });

  it('laisse redéposer une fois la demande traitée', async () => {
    const adresse = `reprise-${MARQUE}@example.ci`;
    const { data } = await admin
      .from('demandes_ouverture')
      .insert({
        nom: `Sonde ${MARQUE} E`,
        telephone: `+2250700${MARQUE}6`,
        email: adresse,
      })
      .select('id')
      .single();

    await admin
      .from('demandes_ouverture')
      .update({ statut: 'refusee', traite_le: new Date().toISOString() })
      .eq('id', data!.id);

    // Un collecteur refusé en août peut revenir en décembre.
    const { error } = await admin.from('demandes_ouverture').insert({
      nom: `Sonde ${MARQUE} F`,
      telephone: `+2250700${MARQUE}7`,
      email: adresse,
    });
    expect(error).toBeNull();
  });

  it('refuse une adresse trop longue, même sous clé de service', async () => {
    const { error } = await admin.from('demandes_ouverture').insert({
      nom: `Sonde ${MARQUE} G`,
      telephone: `+2250700${MARQUE}8`,
      email: `${'x'.repeat(200)}@example.ci`,
    });
    expect(error?.code).toBe('23514');
  });

  it('rend l’adresse dans admin_demandes', async () => {
    const adresse = `liste-${MARQUE}@example.ci`;
    await admin.from('demandes_ouverture').insert({
      nom: `Sonde ${MARQUE} H`,
      telephone: `+2250700${MARQUE}9`,
      email: adresse,
    });

    const { data } = await admin.rpc('admin_demandes');
    const ligne = (data as Array<{ nom: string; email: string | null }>).find(
      (d) => d.nom === `Sonde ${MARQUE} H`,
    );
    expect(ligne?.email).toBe(adresse);
  });

  it('rend la demande entière par admin_demande, sans la modifier', async () => {
    const adresse = `unique-${MARQUE}@example.ci`;
    const { data: creee } = await admin
      .from('demandes_ouverture')
      .insert({
        nom: `Sonde ${MARQUE} I`,
        telephone: `+2250701${MARQUE}0`,
        email: adresse,
        palier: 'pro',
        zone: 'Adjamé',
      })
      .select('id')
      .single();

    const { data } = await admin.rpc('admin_demande', { demande_id: creee!.id });
    expect(data).toMatchObject({
      email: adresse,
      nom: `Sonde ${MARQUE} I`,
      palier: 'pro',
      zone: 'Adjamé',
      statut: 'nouvelle',
    });

    // « Sans la modifier » est la moitié de sa raison d'être.
    const { data: apres } = await admin
      .from('demandes_ouverture')
      .select('statut, traite_le')
      .eq('id', creee!.id)
      .single();
    expect(apres).toEqual({ statut: 'nouvelle', traite_le: null });
  });

  it('rend null pour une demande inexistante', async () => {
    const { data, error } = await admin.rpc('admin_demande', {
      demande_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});
