import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * La réinitialisation de mot de passe, vue de l'extérieur.
 *
 * ## Le seul invariant qui compte vraiment
 *
 * **Adresse connue et adresse inconnue rendent la même chose.** L'audit du
 * 2026-08-25 a mesuré que Kolek ne permet pas d'énumérer ses comptes : un
 * compte inexistant et un mot de passe faux rendent le même
 * `invalid_credentials`. Cette nouvelle porte publique ne doit pas ouvrir ce
 * que le reste ferme — une réponse qui distingue « adresse inconnue » de
 * « courriel envoyé » est un annuaire de comptes, interrogeable à la seconde.
 *
 * L'assertion porte sur le **texte brut** de la réponse, pas sur un objet
 * relu : deux corps qui différeraient d'un champ ou d'un ordre de clés
 * seraient aussi lisibles qu'un message explicite.
 *
 * ## Ce que la pile locale peut montrer, et ce qu'elle ne peut pas
 *
 * Sans clé de fournisseur, tous les appels rendent `CONFIGURATION`. L'égalité
 * connue/inconnue est donc vérifiée sur ce chemin-là. Le chemin configuré est
 * couvert par la vérification manuelle du plan, qui refait la même comparaison
 * sur le projet distant.
 */

const URL_FONCTION = `${process.env.SUPABASE_URL}/functions/v1/mot-de-passe-oublie`;
const CLE = process.env.SUPABASE_ANON_KEY!;
const MARQUE = crypto.randomUUID().slice(0, 8);
const NUMERIQUE = String(Date.now()).slice(-7);

let connu: CollecteurTest;

beforeAll(async () => {
  connu = await creerCollecteur(`Oubli ${MARQUE}`, `+2250${NUMERIQUE}80`);
});

afterAll(async () => {
  await admin.from('debit_public').delete().like('empreinte', 'mot-de-passe-oublie:10.1.%');
  await nettoyer();
});

function ipAuHasard(prefixe = '10.1'): string {
  return `${prefixe}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
}

function demander(email: string, ip = ipAuHasard()) {
  return fetch(URL_FONCTION, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: CLE,
      Authorization: `Bearer ${CLE}`,
      'x-forwarded-for': ip,
      Origin: 'http://localhost:5173',
    },
    body: JSON.stringify({ email }),
  });
}

describe('l’indistinguabilité', () => {
  it('rend exactement la même réponse pour une adresse connue et une inconnue', async () => {
    const avecCompte = await demander(connu.email);
    const sansCompte = await demander(`personne-${MARQUE}@example.ci`);

    expect(avecCompte.status).toBe(sansCompte.status);
    expect(await avecCompte.text()).toBe(await sansCompte.text());
  });

  it('rend la même réponse quand la borne mord', async () => {
    // Sinon la borne deviendrait elle-même un signal : trois essais sur une
    // adresse, et la quatrième réponse dirait si les trois premières ont envoyé
    // quelque chose.
    const ip = ipAuHasard('10.1.9');
    const premiere = await demander(connu.email, ip);
    const statut = premiere.status;
    const texte = await premiere.text();

    for (let i = 0; i < 4; i += 1) {
      const suivante = await demander(connu.email, ip);
      expect(suivante.status).toBe(statut);
      expect(await suivante.text()).toBe(texte);
    }
  });
});

describe('ce qui est refusé', () => {
  it('refuse une adresse mal formée', async () => {
    // La forme est visible du client : la refuser ne renseigne sur aucun
    // compte, et le silence ferait chercher longtemps quelqu'un qui a fait une
    // faute de frappe.
    const reponse = await demander('mariam');

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('EMAIL_INVALIDE');
  });

  it('refuse une adresse absente', async () => {
    const reponse = await fetch(URL_FONCTION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CLE,
        Authorization: `Bearer ${CLE}`,
      },
      body: JSON.stringify({}),
    });

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('EMAIL_MANQUANT');
  });

  it('refuse une méthode autre que POST', async () => {
    const reponse = await fetch(URL_FONCTION, {
      method: 'GET',
      headers: { apikey: CLE, Authorization: `Bearer ${CLE}` },
    });

    expect(reponse.status).toBe(405);
  });

  it('refuse un corps illisible', async () => {
    const reponse = await fetch(URL_FONCTION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CLE,
        Authorization: `Bearer ${CLE}`,
      },
      body: 'pas du json',
    });

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('CORPS_ILLISIBLE');
  });
});

/*
 * Pas de test CORS ici, et c'est une mesure, pas un oubli.
 *
 * Le 2026-08-27, sondé sur la pile locale : l'exécution des Edge Functions
 * **réécrit** `Access-Control-Allow-Origin` en `*`, aussi bien sur le préalable
 * `OPTIONS` que sur un `POST` ordinaire — quelle que soit l'origine envoyée, et
 * quels que soient les en-têtes que la fonction pose elle-même.
 *
 * Un test écrit ici mesurerait donc la plateforme locale et non notre code : il
 * passerait au vert le jour où `entetesCors` cesserait d'être appelé. Le
 * filtre d'origine est couvert là où il est observable — `supabase/tests/cors.test.ts`,
 * sur le module pur, qui est aussi la raison pour laquelle ce module existe à
 * part depuis le défaut du 2026-08-20.
 */
