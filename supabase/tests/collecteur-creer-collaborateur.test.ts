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
    expect(reponse.status).toBe(401);
    expect((await reponse.json()).erreur).toBe('JETON_ABSENT');
  });

  it('refuse un collecteur qui n’est pas Illimité actif', async () => {
    const pro = await creerCollecteur('Pro', telephone());
    await admin.from('collecteurs').update({ palier: 'pro' }).eq('id', pro.id);

    const reponse = await appeler(await jetonDe(pro), saisie());
    expect(reponse.status).toBe(403);
    expect((await reponse.json()).erreur).toBe('ACCES_RESERVE');
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
});
