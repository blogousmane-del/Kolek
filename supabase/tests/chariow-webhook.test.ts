import { describe, expect, it } from 'vitest';

/**
 * `chariow-webhook` — la seule porte publique du produit.
 *
 * Toutes les autres Edge Functions exigent un jeton, et la plateforme referme
 * avant elles. Celle-ci ne peut pas : Chariow ne signe pas ses appels et ne
 * porte aucune identité Supabase. `verify_jwt = false` lui est donc accordé
 * dans `supabase/config.toml`, et ces tests mesurent ce que cela ouvre — et ce
 * que cela n'ouvre pas.
 *
 * ## Ce qui est mesurable ici, et pourquoi c'est le corps qui compte
 *
 * Un refus de la plateforme et un refus de la fonction portent tous deux `401`.
 * Le statut seul ne dirait donc rien. Ce qui les distingue est le **corps** :
 * Kong rend son propre message, la fonction rend `SECRET_INVALIDE`. Les
 * assertions portent sur ce corps — sans la section de `config.toml`, elles
 * tombent, parce que la requête n'atteindrait jamais notre code.
 *
 * ## La propriété la plus utile : sans secret, rien ne passe
 *
 * `CHARIOW_SECRET_WEBHOOK` n'existe ni en local ni au CI — c'est un secret de
 * production. `secretValide` compare donc à la chaîne vide, et refuse **tout**,
 * y compris une chaîne vide. C'est exactement le comportement voulu d'une
 * fonction déployée avant que son secret ne soit posé : elle ne s'ouvre à
 * personne. La comparaison en temps constant elle-même est éprouvée sur pièce
 * dans `secret.test.ts`.
 *
 * Ce que ces tests ne mesurent pas : la réconciliation. Elle demande un secret
 * juste et `CHARIOW_CLE_API`, ni l'un ni l'autre présent ici. Elle est éprouvée
 * sans réseau dans `reconciliation.test.ts`, `depot-chariow.test.ts` et
 * `ouvrir-compte.test.ts` — c'est-à-dire là où les décisions se prennent.
 */

const ROUTE = `${process.env.SUPABASE_URL}/functions/v1/chariow-webhook`;
const CLE_PUBLIABLE = process.env.SUPABASE_ANON_KEY as string;

async function appeler(
  options: { secret?: string; methode?: string; jeton?: string } = {},
): Promise<{ statut: number; corps: string }> {
  const { secret, methode = 'POST', jeton } = options;
  const adresse = secret === undefined ? ROUTE : `${ROUTE}?secret=${encodeURIComponent(secret)}`;

  const reponse = await fetch(adresse, {
    method: methode,
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    ...(methode === 'POST' ? { body: JSON.stringify({ data: { id: 'v_inconnue' } }) } : {}),
  });

  return { statut: reponse.status, corps: await reponse.text() };
}

describe('la porte du webhook', () => {
  it('est atteignable sans porteur — c’est tout l’objet de verify_jwt = false', async () => {
    // Sans la section `[functions.chariow-webhook]` de `config.toml`, Kong
    // répondrait ici son propre 401 et Chariow ne pourrait jamais nous notifier
    // un règlement. Le corps est ce qui distingue les deux refus.
    const { statut, corps } = await appeler({ secret: 'peu-importe' });

    expect(statut).toBe(401);
    expect(corps).toContain('SECRET_INVALIDE');
  });

  it('refuse une méthode qui n’est pas POST, et le refus est le nôtre', async () => {
    // Un GET suffirait à une préconnexion ou à un aspirateur de pages. Le corps
    // prouve à nouveau que la requête a bien traversé la plateforme.
    const { statut, corps } = await appeler({ methode: 'GET' });

    expect(statut).toBe(405);
    expect(corps).toContain('METHODE_NON_AUTORISEE');
  });

  it('refuse tout tant qu’aucun secret n’est posé, la chaîne vide comprise', async () => {
    // La propriété qui compte au déploiement : la fonction part avant son
    // secret, et pendant cet intervalle elle ne s'ouvre à personne. Une
    // comparaison qui accepterait « rien contre rien » ouvrirait le webhook au
    // premier venu — et déclencher des relectures n'est pas anodin.
    for (const secret of ['', 'devine', 'x'.repeat(64)]) {
      const { statut, corps } = await appeler({ secret });
      expect(statut).toBe(401);
      expect(corps).toContain('SECRET_INVALIDE');
    }
  });

  it('ne s’ouvre pas davantage à qui présente un jeton valide', async () => {
    // La clé publiable est un JWT valide, servie dans le paquet JavaScript des
    // trois sites. Ici elle ne vaut rien : la porte est le secret d'URL, et rien
    // d'autre. Sans cette mesure, on pourrait croire le webhook protégé par une
    // identité qu'il ne consulte jamais.
    const { statut, corps } = await appeler({ secret: 'peu-importe', jeton: CLE_PUBLIABLE });

    expect(statut).toBe(401);
    expect(corps).toContain('SECRET_INVALIDE');
  });

  it('ne dit rien de plus que le refus', async () => {
    // Pas de longueur attendue, pas de « secret manquant » distinct de « secret
    // faux » : les deux se répondent pareil. Un message qui distinguerait les
    // deux cas dirait à qui tâtonne s'il est sur la bonne piste.
    const sans = await appeler({});
    const faux = await appeler({ secret: 'devine' });

    expect(sans).toEqual(faux);
  });
});
