import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';
import { VERSION_CONDITIONS } from '../functions/_shared/version-conditions.ts';

/**
 * `abonnement-payer` — le portillon, et le refus qui ne dépend de personne.
 *
 * Cette route crée une vente chez Chariow. Ce que le téléphone n'a pas le droit
 * d'y décider est le sujet : ni son identité, qui vient du jeton, ni le montant,
 * qui vient du produit configuré dans la boutique. **Aucun montant ne transite
 * par le corps de la requête.**
 *
 * ## Ce que la base locale peut mesurer
 *
 * `CHARIOW_CLE_API` n'existe ni en local ni au CI. Sa garde a été descendue
 * (relecture de la tâche 7) à son premier usage réel, juste avant la
 * réconciliation, pour ne plus faire dépendre d'une clé de boutique des refus
 * qui n'ont rien à voir avec Chariow. Restent donc mesurables : le portillon,
 * le refus du collaborateur, le refus d'une version des conditions périmée, et
 * l'écriture de l'acceptation — posée, elle aussi, avant ce qui appelle
 * réellement Chariow. Hors d'atteinte : la réconciliation, la vente elle-même,
 * la remise qu'elle applique.
 *
 * Le plan le plaçait après. « Tu es collaborateur, tu n'as rien à payer » est
 * pourtant vrai que la boutique soit configurée ou non ; l'y faire dépendre
 * rendait la règle inobservable partout où elle est testée. C'est le même écart
 * que celui relevé sur `abonnement-verifier`, au même endroit.
 *
 * ## Les deux barrières, et une seule est à nous
 *
 * `verify_jwt` répond avant la fonction : sans porteur, ou avec un porteur mal
 * signé, le code n'est jamais atteint. La **clé publiable**, elle, est un JWT
 * valide : elle traverse la plateforme et se fait refuser par nous. C'est le
 * seul jeton qu'un attaquant possède à coup sûr — il est servi dans le paquet
 * JavaScript des trois sites — et c'est le test qui compte.
 */

const ROUTE = `${process.env.SUPABASE_URL}/functions/v1/abonnement-payer`;
const CLE_PUBLIABLE = process.env.SUPABASE_ANON_KEY as string;

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
let titulaire: CollecteurTest;
let collaborateur: CollecteurTest;

function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

async function appeler(
  jeton: string | null,
  corps: unknown = { palier: 'pro', telephone: '+2250700000001' },
  methode = 'POST',
): Promise<Response> {
  return fetch(ROUTE, {
    method: methode,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    ...(methode === 'POST' ? { body: JSON.stringify(corps) } : {}),
  });
}

async function jetonDe(compte: CollecteurTest): Promise<string> {
  const { data } = await compte.client.auth.getSession();
  return data.session!.access_token;
}

beforeAll(async () => {
  titulaire = await creerCollecteur('Titulaire Paiement', telephone());
  collaborateur = await creerCollecteur('Awa Paiement', telephone());

  await admin
    .from('collecteurs')
    .update({ palier: 'illimite', abonnement_statut: 'actif' })
    .eq('id', titulaire.id);
  const { error } = await admin
    .from('collecteurs')
    .update({ titulaire_id: titulaire.id })
    .eq('id', collaborateur.id);
  if (error) throw new Error(error.message);
});

afterAll(nettoyer);

describe('le portillon de abonnement-payer', () => {
  it('refuse une méthode qui n’est pas POST', async () => {
    expect((await appeler(CLE_PUBLIABLE, null, 'GET')).status).toBe(405);
  });

  it('n’est pas atteignable sans porteur', async () => {
    // Refus de la plateforme, pas le nôtre. On mesure qu'il a lieu.
    expect((await appeler(null)).status).toBe(401);
  });

  it('refuse la clé publiable, qui n’identifie personne', async () => {
    const reponse = await appeler(CLE_PUBLIABLE);

    expect(reponse.status).toBe(403);
    expect(await reponse.json()).toMatchObject({ erreur: 'ACCES_RESERVE' });
  });
});

describe('un collaborateur ne s’abonne pas', () => {
  it('le refuse par un 403 nommé, avant même de regarder la boutique', async () => {
    // Son palier vient de son titulaire, qui paie pour lui, et
    // `admin_vue_globale` ne compte pas son abonnement depuis `20260902140000`.
    // Encaisser ici lui vendrait ce qu'il a déjà, et la somme n'apparaîtrait
    // même pas au chiffre d'affaires.
    const reponse = await appeler(await jetonDe(collaborateur));

    expect(reponse.status).toBe(403);
    expect(await reponse.json()).toMatchObject({ erreur: 'ABONNEMENT_DU_TITULAIRE' });
  });

  it('laisse passer son titulaire, lui', async () => {
    // Le test qui empêche le précédent de passer pour de mauvaises raisons : un
    // refus posé trop haut refuserait tout le monde, y compris celui qui doit
    // payer. Ni 401 ni 403 ici.
    //
    // Le repère n'est plus `CONFIGURATION` : depuis que le contrôle de
    // `CHARIOW_CLE_API` a été descendu à son premier usage (juste avant la
    // réconciliation), le titulaire va plus loin et atteint le contrôle de
    // version — cet appel n'envoie pas de `version`, donc le serveur la refuse
    // comme périmée. C'est encore un repère qui ne dépend pas de
    // `CHARIOW_CLE_API`, absente ici comme au CI.
    const reponse = await appeler(await jetonDe(titulaire));

    expect([401, 403]).not.toContain(reponse.status);
    expect(await reponse.json()).toMatchObject({ erreur: 'VERSION_CONDITIONS_PERIMEE' });
  });
});

describe('la version des conditions, au renouvellement', () => {
  it('refuse une version des conditions que le serveur ne connaît pas', async () => {
    const reponse = await appeler(await jetonDe(titulaire), {
      palier: 'pro',
      telephone: telephone(),
      version: 'deadbeefdeadbeef',
    });

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('VERSION_CONDITIONS_PERIMEE');
  });

  it('écrit l’acceptation avec le collecteur connu d’emblée', async () => {
    // §3.3 : cette voie est plus propre que la voie publique — la personne est
    // authentifiée, donc `collecteur_id` est connu sans passer par une demande.
    // C'est aussi le rattrapage : chaque collecteur déjà en place accepte à son
    // prochain renouvellement, au moment où il y a de l'argent en jeu.
    await appeler(await jetonDe(titulaire), {
      palier: 'pro',
      telephone: telephone(),
      version: VERSION_CONDITIONS,
    });

    const { data } = await admin
      .from('acceptations_conditions')
      .select('collecteur_id, demande_id, version')
      .eq('collecteur_id', titulaire.id)
      .order('acceptee_le', { ascending: false })
      .limit(1)
      .single();

    expect(data?.collecteur_id).toBe(titulaire.id);
    expect(data?.demande_id, 'aucune demande sur cette voie').toBeNull();
    expect(data?.version).toBe(VERSION_CONDITIONS);
  });
});
