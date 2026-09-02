import { afterAll, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer } from './harnais';

afterAll(nettoyer);

/**
 * Les collaborateurs du forfait Illimité.
 *
 * Le modèle tient dans une colonne, `collecteurs.titulaire_id`, et dans le
 * déclencheur qui la borne. Ce fichier vérifie les deux, puis ce qui en découle :
 * la suspension qui descend, les deux portes de lecture, et le chiffre
 * d'affaires qui cesse de facturer une équipe de quatre comme quatre
 * abonnements.
 *
 * Ce qu'il ne vérifie PAS, et c'est délibéré : que le titulaire lise les données
 * de son collaborateur par PostgREST. Il ne le peut pas, et `isolation.test.ts`
 * le prouve — aucune policy n'a été élargie pour cette fonctionnalité.
 */

/**
 * Un téléphone unique, dans cette exécution comme entre deux exécutions.
 *
 * `collecteurs.telephone` est unique en base, et une collision ne se présente
 * pas comme une collision : le déclencheur `creer_collecteur_apres_signup`
 * échoue, et GoTrue rend « Database error creating new user » — un message qui
 * n'aide personne à trouver la cause.
 *
 * Un compteur seul repart à 1 à chaque exécution et heurte les lignes de la
 * précédente tant que `db:reset` n'a pas tourné. L'horloge seule ne suffit pas
 * non plus : deux appels dans la même milliseconde donnent le même numéro. Les
 * deux ensemble, donc.
 */
const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

/** Passe un collecteur en titulaire Illimité actif, sous clé de service. */
async function rendreTitulaire(id: string): Promise<void> {
  const { error } = await admin
    .from('collecteurs')
    .update({ palier: 'illimite', abonnement_statut: 'actif' })
    .eq('id', id);
  expect(error).toBeNull();
}

/** Rattache `collaborateur` à `titulaire`, et rend le résultat tel quel. */
async function rattacher(collaborateur: string, titulaire: string | null) {
  return admin.from('collecteurs').update({ titulaire_id: titulaire }).eq('id', collaborateur);
}

describe('le rattachement', () => {
  it('pose titulaire_id quand le titulaire est Illimité actif', async () => {
    const patron = await creerCollecteur('Patron Un', telephone());
    const awa = await creerCollecteur('Awa Un', telephone());
    await rendreTitulaire(patron.id);

    const { error } = await rattacher(awa.id, patron.id);
    expect(error).toBeNull();

    const { data } = await admin
      .from('collecteurs')
      .select('titulaire_id')
      .eq('id', awa.id)
      .single();
    expect(data?.titulaire_id).toBe(patron.id);
  });

  it('refuse un titulaire qui n’est pas Illimité actif', async () => {
    const patron = await creerCollecteur('Patron Deux', telephone());
    const awa = await creerCollecteur('Awa Deux', telephone());
    await admin.from('collecteurs').update({ palier: 'pro' }).eq('id', patron.id);

    const { error } = await rattacher(awa.id, patron.id);
    expect(error?.message).toContain('TITULAIRE_SANS_DROIT');
  });

  it('refuse l’auto-rattachement', async () => {
    const seul = await creerCollecteur('Seul', telephone());
    await rendreTitulaire(seul.id);

    const { error } = await rattacher(seul.id, seul.id);
    expect(error?.message).toContain('RATTACHEMENT_A_SOI');
  });

  it('refuse la chaîne : un collaborateur ne recrute pas', async () => {
    const patron = await creerCollecteur('Patron Trois', telephone());
    const awa = await creerCollecteur('Awa Trois', telephone());
    const kofi = await creerCollecteur('Kofi Trois', telephone());
    await rendreTitulaire(patron.id);
    await rendreTitulaire(awa.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();

    const { error } = await rattacher(kofi.id, awa.id);
    expect(error?.message).toContain('CHAINE_INTERDITE');
  });

  it('refuse de rattacher quelqu’un qui a déjà des collaborateurs', async () => {
    const grand = await creerCollecteur('Grand', telephone());
    const moyen = await creerCollecteur('Moyen', telephone());
    const petit = await creerCollecteur('Petit', telephone());
    await rendreTitulaire(grand.id);
    await rendreTitulaire(moyen.id);
    expect((await rattacher(petit.id, moyen.id)).error).toBeNull();

    const { error } = await rattacher(moyen.id, grand.id);
    expect(error?.message).toContain('DEJA_TITULAIRE');
  });

  it('refuse le quatrième collaborateur', async () => {
    const patron = await creerCollecteur('Patron Quatre', telephone());
    await rendreTitulaire(patron.id);

    for (let i = 0; i < 3; i += 1) {
      const membre = await creerCollecteur(`Membre ${i}`, telephone());
      expect((await rattacher(membre.id, patron.id)).error).toBeNull();
    }

    const quatrieme = await creerCollecteur('Quatrième', telephone());
    const { error } = await rattacher(quatrieme.id, patron.id);
    expect(error?.message).toContain('EQUIPE_COMPLETE');
  });

  it('refuse de supprimer un titulaire qui a des collaborateurs', async () => {
    const patron = await creerCollecteur('Patron Cinq', telephone());
    const awa = await creerCollecteur('Awa Cinq', telephone());
    await rendreTitulaire(patron.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();

    // `on delete restrict` et non `cascade` : un `cascade` effacerait trois
    // comptes et leurs clients sur un clic dans l'administration.
    const { error } = await admin.auth.admin.deleteUser(patron.id);
    expect(error).not.toBeNull();
  });

  it('laisse un collaborateur lire son propre titulaire_id', async () => {
    const patron = await creerCollecteur('Patron Six', telephone());
    const awa = await creerCollecteur('Awa Six', telephone());
    await rendreTitulaire(patron.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();

    // `collecteurs` est en GRANT de colonne : sans `grant select (titulaire_id)`,
    // un collaborateur ne peut pas savoir qu'il en est un, et les quatre textes
    // de commission ne changeraient jamais.
    const { data, error } = await awa.client
      .from('collecteurs')
      .select('titulaire_id')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.titulaire_id).toBe(patron.id);
  });

  it('refuse qu’un collecteur se rattache lui-même par PostgREST', async () => {
    const patron = await creerCollecteur('Patron Sept', telephone());
    const malin = await creerCollecteur('Malin', telephone());
    await rendreTitulaire(patron.id);

    // Le GRANT de colonne est la défense : `titulaire_id` n'est pas dans
    // `grant update (nom, telephone, zone)`.
    const { error } = await malin.client
      .from('collecteurs')
      .update({ titulaire_id: patron.id })
      .eq('id', malin.id);
    expect(error).not.toBeNull();

    const { data } = await admin
      .from('collecteurs')
      .select('titulaire_id')
      .eq('id', malin.id)
      .single();
    expect(data?.titulaire_id).toBeNull();
  });
});

describe('la suspension', () => {
  it('descend du titulaire sur ses collaborateurs', async () => {
    const patron = await creerCollecteur('Patron Susp', telephone());
    const awa = await creerCollecteur('Awa Susp', telephone());
    await rendreTitulaire(patron.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();

    await admin.from('collecteurs').update({ abonnement_statut: 'suspendu' }).eq('id', patron.id);

    const { data } = await admin
      .from('collecteurs')
      .select('abonnement_statut, titulaire_id')
      .eq('id', awa.id)
      .single();
    expect(data?.abonnement_statut).toBe('suspendu');
    // Le rattachement reste : un retour à Illimité doit réactiver sans recréer,
    // et l'administration doit voir ce qui s'est passé.
    expect(data?.titulaire_id).toBe(patron.id);
  });

  it('descend aussi quand le titulaire quitte Illimité', async () => {
    const patron = await creerCollecteur('Patron Decl', telephone());
    const awa = await creerCollecteur('Awa Decl', telephone());
    await rendreTitulaire(patron.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();

    await admin.from('collecteurs').update({ palier: 'pro' }).eq('id', patron.id);

    const { data } = await admin
      .from('collecteurs')
      .select('abonnement_statut')
      .eq('id', awa.id)
      .single();
    expect(data?.abonnement_statut).toBe('suspendu');
  });

  it('interdit d’ajouter un client et d’ouvrir une carte, jamais d’encaisser', async () => {
    const actif = await creerCollecteur('Actif', telephone());

    // Un client et une carte, tant que l'abonnement est actif.
    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    expect(
      (
        await actif.client
          .from('clients')
          .insert({ id: clientId, collecteur_id: actif.id, nom: 'Cliente' })
      ).error,
    ).toBeNull();
    expect(
      (
        await actif.client
          .from('cartes')
          .insert({ id: carteId, collecteur_id: actif.id, client_id: clientId, mise: 1000 })
      ).error,
    ).toBeNull();

    await admin.from('collecteurs').update({ abonnement_statut: 'expire' }).eq('id', actif.id);

    // Interdit : un client de plus.
    expect(
      (
        await actif.client
          .from('clients')
          .insert({ id: crypto.randomUUID(), collecteur_id: actif.id, nom: 'Trop tard' })
      ).error,
    ).not.toBeNull();

    // Interdit : une carte de plus.
    expect(
      (
        await actif.client.from('cartes').insert({
          id: crypto.randomUUID(),
          collecteur_id: actif.id,
          client_id: clientId,
          mise: 1000,
        })
      ).error,
    ).not.toBeNull();

    // Autorisé : encaisser sur la carte déjà ouverte. Une carte ouverte est une
    // promesse à une cliente qui paie tous les jours ; la couper au milieu du
    // cycle punit la cliente, pas le collecteur.
    const { error } = await actif.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: actif.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
    });
    expect(error).toBeNull();
  });
});

describe('la vue d’équipe', () => {
  it('rend un tableau vide à qui n’a pas d’équipe', async () => {
    const seul = await creerCollecteur('Sans équipe', telephone());

    const { data, error } = await seul.client.rpc('equipe_vue');
    expect(error).toBeNull();
    // Ne pas avoir d'équipe est un état normal, pas une panne.
    expect(data).toEqual([]);
  });

  it('ne rend que son équipe à un titulaire', async () => {
    const patron = await creerCollecteur('Patron Vue', telephone());
    const awa = await creerCollecteur('Awa Vue', telephone());
    const voisin = await creerCollecteur('Voisin Vue', telephone());
    const sonAwa = await creerCollecteur('Awa Voisine', telephone());
    await rendreTitulaire(patron.id);
    await rendreTitulaire(voisin.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();
    expect((await rattacher(sonAwa.id, voisin.id)).error).toBeNull();

    const { data, error } = await patron.client.rpc('equipe_vue');
    expect(error).toBeNull();
    const equipe = data as Array<{ id: string; nom: string }>;
    expect(equipe.map((m) => m.id)).toEqual([awa.id]);
  });

  it('rend les chiffres du collaborateur, pas ceux du titulaire', async () => {
    const patron = await creerCollecteur('Patron Chiffres', telephone());
    const awa = await creerCollecteur('Awa Chiffres', telephone());
    await rendreTitulaire(patron.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();

    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    await awa.client.from('clients').insert({ id: clientId, collecteur_id: awa.id, nom: 'Aya' });
    await awa.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: awa.id, client_id: clientId, mise: 1000 });
    // Deux mises : la première est la commission, la seconde est due au client.
    for (let i = 0; i < 2; i += 1) {
      await awa.client.from('mises').insert({
        id: crypto.randomUUID(),
        collecteur_id: awa.id,
        carte_id: carteId,
        montant: 1000,
        encaisse_le: new Date().toISOString(),
      });
    }

    const { data } = await patron.client.rpc('equipe_vue');
    const membre = (data as Array<Record<string, number>>)[0]!;
    expect(membre.clients).toBe(1);
    expect(membre.cartes_actives).toBe(1);
    // La commission revient au titulaire : c'est pour cela qu'elle figure ici.
    expect(membre.commissions).toBe(1000);
    expect(membre.encours).toBe(1000);
  });

  it('est refusée à anon', async () => {
    const { error } = await anonyme.rpc('equipe_vue');
    expect(error).not.toBeNull();
  });
});

describe('les clients d’un coéquipier', () => {
  it('rend vide pour un identifiant qui existe mais n’est pas de l’équipe', async () => {
    const patron = await creerCollecteur('Patron Cli', telephone());
    const etranger = await creerCollecteur('Étranger', telephone());
    await rendreTitulaire(patron.id);
    await etranger.client.from('clients').insert({
      id: crypto.randomUUID(),
      collecteur_id: etranger.id,
      nom: 'Cliente de l’étranger',
    });

    // Le cas qui compte : l'identifiant existe bel et bien. Une erreur dirait
    // qu'il existe ; un tableau vide ne dit rien.
    const { data, error } = await patron.client.rpc('equipe_clients', {
      p_collaborateur: etranger.id,
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('rend les clients d’un vrai collaborateur, avec ses cartes actives', async () => {
    const patron = await creerCollecteur('Patron Cli2', telephone());
    const awa = await creerCollecteur('Awa Cli2', telephone());
    await rendreTitulaire(patron.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();

    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    await awa.client.from('clients').insert({ id: clientId, collecteur_id: awa.id, nom: 'Aya' });
    await awa.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: awa.id, client_id: clientId, mise: 2000 });
    await awa.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: awa.id,
      carte_id: carteId,
      montant: 2000,
      encaisse_le: new Date().toISOString(),
    });

    const { data, error } = await patron.client.rpc('equipe_clients', { p_collaborateur: awa.id });
    expect(error).toBeNull();
    const clients = data as Array<{
      id: string;
      nom: string;
      cartes: Array<{ id: string; mise: number; mises_encaissees: number; solde_restituable: number }>;
    }>;
    expect(clients).toHaveLength(1);
    expect(clients[0]?.nom).toBe('Aya');
    expect(clients[0]?.cartes).toHaveLength(1);
    expect(clients[0]?.cartes[0]?.mise).toBe(2000);
    expect(clients[0]?.cartes[0]?.mises_encaissees).toBe(1);
    // Une seule mise encaissée : elle est la commission, rien n'est dû au client.
    expect(clients[0]?.cartes[0]?.solde_restituable).toBe(0);
  });

  it('laisse l’appelant demander sa propre tournée', async () => {
    const seul = await creerCollecteur('Seul Cli', telephone());
    const clientId = crypto.randomUUID();
    await seul.client.from('clients').insert({ id: clientId, collecteur_id: seul.id, nom: 'Sien' });

    // L'écran d'encaissement du titulaire s'en sert pour sa propre tournée,
    // sans ouvrir un second chemin de lecture.
    const { data, error } = await seul.client.rpc('equipe_clients', { p_collaborateur: seul.id });
    expect(error).toBeNull();
    expect((data as Array<{ nom: string }>).map((c) => c.nom)).toEqual(['Sien']);
  });

  it('est refusée à anon', async () => {
    const { error } = await anonyme.rpc('equipe_clients', {
      p_collaborateur: '00000000-0000-4000-8000-000000000000',
    });
    expect(error).not.toBeNull();
  });
});
