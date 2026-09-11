import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { admin } from './harnais';

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
 * ## Les secrets de la pile locale
 *
 * Depuis le 2026-09-11, `supabase/functions/.env` porte un
 * `CHARIOW_SECRET_WEBHOOK` et un `CHARIOW_SECRET_SIGNATURE` **locaux** — même
 * statut que `DRAINAGE_SECRET` : ils n'ouvrent rien ailleurs que sur ce poste.
 * Il le fallait pour atteindre la borne par vente, qui se tient **après** la
 * signature.
 *
 * La propriété la plus utile d'avant reste vraie — une fonction déployée avant
 * son secret ne s'ouvre à personne, puisque `secretValide` refuse tout contre
 * un attendu vide —, mais elle s'éprouve désormais sur pièce, dans
 * `secret.test.ts` : la pile locale n'est plus sans secret.
 *
 * Ce que ces tests ne mesurent pas : la réconciliation. Elle demande
 * `CHARIOW_CLE_API`, absente ici — `abonnement-payer` et `abonnement-verifier`
 * l'attendent ainsi. Elle est éprouvée sans réseau dans
 * `reconciliation.test.ts`, `depot-chariow.test.ts` et `ouvrir-compte.test.ts` —
 * c'est-à-dire là où les décisions se prennent.
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

  it('refuse un secret faux, la chaîne vide comprise', async () => {
    // La pile locale a son secret depuis le 2026-09-11 : ce test mesure le
    // refus d'un secret faux, plus l'absence de secret. Celle-ci — une fonction
    // déployée avant son secret ne s'ouvre à personne — s'éprouve sur pièce
    // dans `secret.test.ts`, où `secretValide(x, '')` rend faux.
    for (const secret of ['', 'devine', 'x'.repeat(64)]) {
      const { statut, corps } = await appeler({ secret });
      expect(statut).toBe(401);
      expect(corps).toContain('SECRET_INVALIDE');
    }
  });

  it('ne s’ouvre pas davantage à qui présente un jeton valide', async () => {
    // La clé publiable est un JWT valide, servie dans le paquet JavaScript des
    // trois sites. Ici elle ne vaut rien : les portes sont le secret d'URL puis
    // la signature, et rien d'autre. Sans cette mesure, on pourrait croire le
    // webhook protégé par une identité qu'il ne consulte jamais.
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

/**
 * La borne par vente — cinquième garde-fou de `chariow-webhook`.
 *
 * Elle se tient **après** la signature : pour l'atteindre, un Pulse doit porter
 * le secret d'URL et une signature juste. D'où les deux secrets locaux, lus
 * dans le fichier même que le runtime charge — une constante recopiée ici
 * passerait au vert avec un runtime qui ne les a pas.
 *
 * Un Pulse pour une vente inconnue, sans métadonnées, ne trouve aucune cible :
 * la fonction répond `200` sans aucun appel réseau. C'est ce qui rend ces
 * épreuves possibles sans Chariow — et sans `CHARIOW_CLE_API`, absente ici.
 * Chaque épreuve tire une vente neuve : le compteur survit aux exécutions.
 */
const ENV_FONCTIONS = readFileSync('supabase/functions/.env', 'utf8');
const SECRET_URL = (ENV_FONCTIONS.match(/^CHARIOW_SECRET_WEBHOOK=(.+)$/m)?.[1] ?? '').trim();
const SECRET_SIGNATURE = (
  ENV_FONCTIONS.match(/^CHARIOW_SECRET_SIGNATURE=(.+)$/m)?.[1] ?? ''
).trim();

/** Un Pulse tel que Chariow l'enverrait : corps compact, signé sur ses octets. */
async function pulse(vente: string, signe = true): Promise<{ statut: number; corps: string }> {
  const corps = JSON.stringify({ data: { id: vente } });
  const signature = `sha256=${createHmac('sha256', SECRET_SIGNATURE).update(corps).digest('hex')}`;
  const reponse = await fetch(`${ROUTE}?secret=${encodeURIComponent(SECRET_URL)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signe ? { 'x-chariow-signature': signature } : {}),
    },
    body: corps,
  });
  return { statut: reponse.status, corps: await reponse.text() };
}

/** Les lignes du compteur pour une vente — lues avec la clé de service. */
async function lignesDuCompteur(vente: string): Promise<number | null> {
  const { count, error } = await admin
    .from('debit_public')
    .select('empreinte', { count: 'exact', head: true })
    .eq('empreinte', `chariow-webhook:vente:${vente}`);
  expect(error).toBeNull();
  return count;
}

describe('la borne par vente', () => {
  it('a bien ses deux secrets locaux — sans eux, rien de ce qui suit ne mesure rien', () => {
    expect(SECRET_URL.length).toBeGreaterThanOrEqual(32);
    expect(SECRET_SIGNATURE.length).toBeGreaterThan(0);
  });

  it(
    'laisse passer vingt Pulses d’une même vente, et refuse le vingt-et-unième',
    async () => {
      const vente = `v_borne_${crypto.randomUUID()}`;
      for (let i = 1; i <= 20; i += 1) {
        const { statut } = await pulse(vente);
        expect(statut, `Pulse n° ${i}`).toBe(200);
      }

      const { statut, corps } = await pulse(vente);
      expect(statut).toBe(429);
      expect(corps).toContain('TROP_DE_PULSES');
      // La sonde qui compte les lignes a trouvé quelque chose : son « 0 » de
      // l'épreuve sur les Pulses non signés veut donc dire quelque chose.
      expect(await lignesDuCompteur(vente)).toBe(1);
    },
    60_000,
  );

  it(
    'ne gêne pas une autre vente : c’est tout l’objet de compter par vente',
    async () => {
      const epuisee = `v_borne_${crypto.randomUUID()}`;
      for (let i = 0; i < 21; i += 1) await pulse(epuisee);

      const { statut } = await pulse(`v_borne_${crypto.randomUUID()}`);
      expect(statut).toBe(200);
    },
    60_000,
  );

  it('ne compte jamais un Pulse non signé : il ne coûte ni lecture ni écriture', async () => {
    const vente = `v_borne_${crypto.randomUUID()}`;
    for (let i = 0; i < 25; i += 1) {
      const { statut, corps } = await pulse(vente, false);
      expect(statut).toBe(401);
      expect(corps).toContain('SIGNATURE_INVALIDE');
    }

    expect(await lignesDuCompteur(vente)).toBe(0);
  });
});
