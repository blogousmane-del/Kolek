import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

/**
 * `collecteur-creer-collaborateur` — la porte par laquelle un titulaire Illimité
 * active ses trois collaborateurs, en autonomie.
 *
 * Le patron des suites `super-admin-*` : sans jeton 401, jeton sans droit 403,
 * puis le cas nominal. Ce qui compte ici et qu'aucun autre test ne couvre :
 * l'appelant est contrôlé sur **quatre** conditions — palier, statut, absence de
 * titulaire, place restante — et les quatre rendent la même réponse. Distinguer
 * « mauvais palier » de « équipe complète » n'aiderait personne que l'écran ne
 * renseigne déjà.
 */

const BASE = `${process.env.SUPABASE_URL}/functions/v1/collecteur-creer-collaborateur`;

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

async function appeler(jeton: string | null, corps: unknown): Promise<Response> {
  return fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    body: JSON.stringify(corps),
  });
}

async function jetonDe(collecteur: CollecteurTest): Promise<string> {
  const { data } = await collecteur.client.auth.getSession();
  return data.session!.access_token;
}

function saisie() {
  const tel = telephone();
  return {
    email: `collab-${crypto.randomUUID()}@kolek.test`,
    // Aléatoire : un mot de passe fixe finirait dans une fuite, et le contrôle
    // HIBP de la fonction ferait échouer la suite sans rapport avec son objet.
    motDePasse: `Kb7-${crypto.randomUUID()}`,
    nom: 'Awa Konan',
    telephone: tel,
    zone: 'Adjamé',
  };
}

/** Un titulaire Illimité actif, prêt à recruter. */
async function titulaire(nom: string): Promise<CollecteurTest> {
  const compte = await creerCollecteur(nom, telephone());
  const { error } = await admin
    .from('collecteurs')
    .update({ palier: 'illimite', abonnement_statut: 'actif' })
    .eq('id', compte.id);
  expect(error).toBeNull();
  return compte;
}

describe('collecteur-creer-collaborateur', () => {
  it('refuse sans jeton', async () => {
    const reponse = await appeler(null, saisie());
    // Le statut seul, comme dans `super-admin-fonctions` et
    // `super-admin-journal-route` : `verify_jwt` est actif sur cette route, donc
    // c'est la passerelle qui répond, et son corps n'est pas le nôtre. La
    // branche `JETON_ABSENT` de la fonction reste une seconde barrière, jamais
    // atteinte tant que la passerelle est devant.
    expect(reponse.status).toBe(401);
  });

  it('refuse un collecteur qui n’est pas Illimité actif', async () => {
    const pro = await creerCollecteur('Pro', telephone());
    await admin.from('collecteurs').update({ palier: 'pro' }).eq('id', pro.id);

    const reponse = await appeler(await jetonDe(pro), saisie());
    expect(reponse.status).toBe(403);
    expect((await reponse.json()).erreur).toBe('ACCES_RESERVE');
  });

  it('nomme l’abonnement suspendu, au lieu de nier le forfait', async () => {
    // Constaté en production le 2026-09-03. Un titulaire Illimité dont
    // l'abonnement n'est plus actif lisait « Il te reste 3 places sur les 3 de
    // ton forfait », puis se voyait répondre « Réservé au forfait Illimité, et
    // à trois collaborateurs au plus » — un refus dont l'écran venait de
    // démentir les deux motifs affichés.
    //
    // Les trois autres conditions se confondent toujours : l'écran les connaît
    // et peut les vérifier lui-même. Le statut de l'abonnement, non.
    const suspendu = await creerCollecteur('Titulaire Suspendu', telephone());
    await admin
      .from('collecteurs')
      .update({ palier: 'illimite', abonnement_statut: 'suspendu' })
      .eq('id', suspendu.id);

    const reponse = await appeler(await jetonDe(suspendu), saisie());

    expect(reponse.status).toBe(403);
    expect((await reponse.json()).erreur).toBe('ABONNEMENT_INACTIF');
  });

  it('refuse un collaborateur qui voudrait recruter à son tour', async () => {
    const patron = await titulaire('Patron Chaine');
    const awa = await creerCollecteur('Awa Chaine', telephone());
    await admin
      .from('collecteurs')
      .update({ palier: 'illimite', abonnement_statut: 'actif' })
      .eq('id', awa.id);
    await admin.from('collecteurs').update({ titulaire_id: patron.id }).eq('id', awa.id);

    // Awa a le bon palier et le bon statut. Ce qui la retient, c'est son
    // `titulaire_id` : un collaborateur ne recrute pas.
    const reponse = await appeler(await jetonDe(awa), saisie());
    expect(reponse.status).toBe(403);
    expect((await reponse.json()).erreur).toBe('ACCES_RESERVE');
  });

  it('crée et rattache un collaborateur', async () => {
    const patron = await titulaire('Patron EF');

    const reponse = await appeler(await jetonDe(patron), saisie());
    expect(reponse.status).toBe(201);
    const corps = await reponse.json();
    expect(corps.collaborateurId).toBeTruthy();

    const { data } = await admin
      .from('collecteurs')
      .select('titulaire_id, nom, zone, palier')
      .eq('id', corps.collaborateurId)
      .single();
    expect(data?.titulaire_id).toBe(patron.id);
    expect(data?.zone).toBe('Adjamé');
    // Un collaborateur naît sur le palier de son titulaire : il n'y a pas de
    // second abonnement à vendre.
    expect(data?.palier).toBe('illimite');

    await admin.auth.admin.deleteUser(corps.collaborateurId);
  });

  it('refuse le quatrième', async () => {
    const patron = await titulaire('Patron Plein');
    const jeton = await jetonDe(patron);

    const crees: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await appeler(jeton, saisie());
      expect(r.status, `le collaborateur ${i + 1} doit être accepté`).toBe(201);
      crees.push((await r.json()).collaborateurId);
    }

    const quatrieme = await appeler(jeton, saisie());
    expect(quatrieme.status).toBe(403);
    expect((await quatrieme.json()).erreur).toBe('ACCES_RESERVE');

    for (const id of crees) await admin.auth.admin.deleteUser(id);
  });

  it('refuse une saisie invalide avant de créer quoi que ce soit', async () => {
    const patron = await titulaire('Patron Saisie');

    const reponse = await appeler(await jetonDe(patron), { ...saisie(), email: 'pas-une-adresse' });
    expect(reponse.status).toBe(400);

    // Rien n'a été créé : la validation précède toute écriture.
    const { count } = await admin
      .from('collecteurs')
      .select('id', { count: 'exact', head: true })
      .eq('titulaire_id', patron.id);
    expect(count).toBe(0);
  });

  it('nomme le numéro déjà pris, au lieu d’un « réessaie » sans issue', async () => {
    // Remonté de la production le 2026-09-03. Un titulaire voyait « Création
    // impossible. Réessaie. » sur un numéro déjà porté par un autre compte —
    // et réessayer ne pouvait pas marcher.
    //
    // Le chemin : `collecteurs.telephone` est unique, donc le déclencheur
    // `creer_collecteur_apres_signup` échoue, donc l'insertion dans
    // `auth.users` échoue, et GoTrue rend « Database error creating new user ».
    // Ce message ne nomme ni l'adresse ni le numéro : la fonction repliait sur
    // `CREATION_IMPOSSIBLE`, qui invite à recommencer une manœuvre condamnée.
    const patron = await titulaire('Patron Doublon');
    const occupe = telephone();
    await creerCollecteur('Deja La', occupe);

    const reponse = await appeler(await jetonDe(patron), { ...saisie(), telephone: occupe });

    expect(reponse.status).toBe(409);
    expect((await reponse.json()).erreur).toBe('TELEPHONE_DEJA_PRIS');

    // Et rien n'est resté derrière : l'insertion `auth.users` a été annulée
    // avec le déclencheur qui l'a fait échouer.
    const { count: rattaches } = await admin
      .from('collecteurs')
      .select('id', { count: 'exact', head: true })
      .eq('titulaire_id', patron.id);
    expect(rattaches).toBe(0);
  });

  it('nomme l’adresse déjà prise', async () => {
    // L'autre cause que le titulaire peut corriger seul. Celle-ci, GoTrue la
    // nomme ; ce test tient la lecture de son message, qui n'est pas un
    // contrat et peut changer d'une version à l'autre.
    const patron = await titulaire('Patron Adresse');
    const premier = saisie();

    const creation = await appeler(await jetonDe(patron), premier);
    expect(creation.status).toBe(201);
    const id = (await creation.json()).collaborateurId;

    const doublon = await appeler(await jetonDe(patron), { ...saisie(), email: premier.email });
    expect(doublon.status).toBe(409);
    expect((await doublon.json()).erreur).toBe('EMAIL_DEJA_PRIS');

    await admin.auth.admin.deleteUser(id);
  });
});
