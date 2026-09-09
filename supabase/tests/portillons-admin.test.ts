import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

/**
 * Le portillon des fonctions d'administration, éprouvé par table.
 *
 * ## Pourquoi ce fichier, et pas trois
 *
 * L'audit du 2026-09-09 a relevé que `admin-avis`,
 * `admin-modifier-collecteur` et `admin-reglages` n'étaient nommées dans aucun
 * des 64 fichiers de `supabase/tests/`. Leur portillon était pourtant relu et
 * correct — `est_admin()` par RPC, `403` sur `ACCES_RESERVE` comme sur
 * `VERIFICATION_IMPOSSIBLE`. Un portillon juste et non testé reste juste
 * jusqu'à la première modification.
 *
 * Écrire trois fichiers aurait éprouvé trois copies du même contrôle. Ce qui
 * compte ici n'est pas ce que chaque fonction fait ensuite — c'est que le
 * portillon soit **le même partout**, parce qu'une seule qui diffère est
 * exactement le défaut qu'on cherche.
 *
 * ## Le contrôle qui compte le plus
 *
 * Le dernier test compare la liste éprouvée à ce qui existe sur le disque. Sans
 * lui, ce fichier vieillirait de la seule manière qui compte : une huitième
 * fonction d'administration arriverait, personne ne l'ajouterait ici, et la
 * suite resterait verte en n'éprouvant plus que sept portillons sur huit.
 *
 * C'est la leçon du même audit, appliquée : un contrôle qui n'énumère pas ce
 * qu'il devrait couvrir finit par couvrir ce qu'il énumère.
 */

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

/** Les sept fonctions d'administration et la méthode qu'elles acceptent. */
const FONCTIONS: Array<{ nom: string; methode: string }> = [
  { nom: 'admin-avis', methode: 'GET' },
  { nom: 'admin-creer-collecteur', methode: 'POST' },
  { nom: 'admin-demandes', methode: 'GET' },
  { nom: 'admin-modifier-collecteur', methode: 'POST' },
  { nom: 'admin-reglages', methode: 'GET' },
  { nom: 'admin-supprimer-collecteur', methode: 'POST' },
  { nom: 'admin-vue-globale', methode: 'GET' },
];

function url(nom: string): string {
  return `${process.env.SUPABASE_URL}/functions/v1/${nom}`;
}

async function appeler(
  nom: string,
  methode: string,
  jeton: string | null,
): Promise<Response> {
  const entetes: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jeton) entetes.Authorization = `Bearer ${jeton}`;

  return fetch(url(nom), {
    method: methode,
    headers: entetes,
    body: methode === 'GET' ? undefined : JSON.stringify({}),
  });
}

async function jetonDe(compte: CollecteurTest): Promise<string> {
  const { data } = await compte.client.auth.getSession();
  return data.session!.access_token;
}

let jetonAdmin: string;
let jetonSimple: string;

describe('le portillon des fonctions d’administration', () => {
  it('prépare un compte admin et un compte ordinaire', async () => {
    const patron = await creerCollecteur('Portillon Patron', telephone());
    const { error } = await admin.from('admins').insert({ user_id: patron.id });
    expect(error).toBeNull();
    jetonAdmin = await jetonDe(patron);

    const simple = await creerCollecteur('Portillon Simple', telephone());
    jetonSimple = await jetonDe(simple);
  });

  for (const { nom, methode } of FONCTIONS) {
    describe(nom, () => {
      it('refuse un appel sans jeton', async () => {
        const reponse = await appeler(nom, methode, null);

        // `401` seulement, et pas le code `JETON_ABSENT` du corps : ces sept
        // fonctions gardent `verify_jwt` (seule `chariow-webhook` l'éteint),
        // donc la plateforme referme avant que notre code ne s'exécute. Le
        // `JETON_ABSENT` écrit dans chacune est une seconde barrière, atteinte
        // seulement si la première tombait.
        //
        // Mesuré : le corps rendu ici ne porte pas `erreur`. Une première
        // version de ce test l'exigeait et échouait sur les sept — l'assertion
        // décrivait ce que le code contient, pas ce que le service répond.
        expect(reponse.status).toBe(401);
      });

      it('refuse un collecteur qui n’est pas admin', async () => {
        // Le cas qui compte : le jeton est valide, la session est réelle. Seule
        // l'inscription à `admins` manque. C'est la forme qu'aurait une
        // tentative depuis un compte de collecteur légitime.
        const reponse = await appeler(nom, methode, jetonSimple);

        expect(reponse.status).toBe(403);
        expect((await reponse.json()).erreur).toBe('ACCES_RESERVE');
      });

      it('laisse passer un admin', async () => {
        const reponse = await appeler(nom, methode, jetonAdmin);

        // On n'affirme pas un `200` : plusieurs de ces fonctions demandent un
        // corps que ce test ne fournit pas, et répondent alors `400` sur le
        // fond. Ce qui est éprouvé est que le **portillon** s'ouvre — donc que
        // la réponse n'est plus ni 401 ni 403.
        expect([401, 403]).not.toContain(reponse.status);
      });

      it('répond 405 sur une méthode qu’elle n’accepte pas', async () => {
        const reponse = await appeler(nom, 'DELETE', jetonAdmin);

        expect(reponse.status).toBe(405);
        expect((await reponse.json()).erreur).toBe('METHODE_NON_AUTORISEE');
      });

      it('répond 204 au vol préparatoire du navigateur', async () => {
        // Sans ce `204`, l'admin ne peut appeler la fonction depuis aucun
        // navigateur — et la panne ne se voit pas en `curl`.
        const reponse = await appeler(nom, 'OPTIONS', null);

        expect(reponse.status).toBe(204);
      });
    });
  }

  it('éprouve toutes les fonctions d’administration présentes sur le disque', async () => {
    // Le contrôle qui empêche ce fichier de vieillir. Une huitième fonction
    // `admin-*` déployée sans être ajoutée ci-dessus fait échouer ce test —
    // plutôt que de laisser la suite verte en n'éprouvant plus qu'une partie.
    const { readdirSync } = await import('node:fs');
    const surDisque = readdirSync('supabase/functions')
      .filter((entree) => entree.startsWith('admin-'))
      .sort();

    expect(FONCTIONS.map((f) => f.nom).sort()).toEqual(surDisque);
  });
});
