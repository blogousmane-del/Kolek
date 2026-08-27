# Invitation et mot de passe oublié — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes
> utilisent la syntaxe à cases (`- [ ]`) pour le suivi.

**But :** un prospect saisit son adresse sur la vitrine, GTCS accorde, le compte
naît et le prospect reçoit un courriel portant un lien pour choisir son mot de
passe. S'il l'oublie ensuite, le même dispositif le lui rend.

**Architecture :** une passerelle courriel calquée sur la passerelle SMS, deux
modules purs de plus (validation d'adresse, textes des messages), une table
compteur pour borner les deux fonctions publiques, une migration qui ajoute
`email` aux demandes, l'accord qui envoie **avant** de marquer, une nouvelle
fonction publique `mot-de-passe-oublie`, et deux écrans dans l'application
collecteur.

**Pile :** PostgreSQL / Supabase (migrations SQL, RLS, Edge Functions Deno),
React 19 + TypeScript, Tailwind 4, Vitest + jsdom + `@testing-library/react`.

**Spec :** `Docs/specs/2026-08-27-invitation-et-mot-de-passe-oublie-design.md`

---

## Trois écarts avec la spécification, décidés ici

La spécification a été relue contre le code au moment d'écrire ce plan. Trois
points ne tenaient pas ; ils sont tranchés ici, et c'est ce plan qui fait foi.

**1. `admin_traiter_demande` ne rendra pas la ligne enrichie.** La spécification
demandait qu'elle rende aussi `email`, `nom`, `telephone` et `palier` « car la
fonction appelante en a besoin pour composer le compte ». Mais l'autre décision
de la même spécification — envoyer **avant** de marquer — veut ces champs
*avant* l'appel, pas dans sa réponse. On ajoute donc une fonction de **lecture**,
`admin_demande(uuid)`, et `admin_traiter_demande` reste inchangée.

**2. `generateLink` de type `invite` n'est pas idempotent.** GoTrue refuse une
adresse **déjà confirmée** (`Email address already registered by another user`).
Une relance après que le prospect a cliqué échouerait donc. La fonction retombe
sur `type: 'recovery'`, qui, lui, vaut pour un compte existant. Les deux mènent
au même écran.

**3. Le contrôle HIBP n'est pas appelé par nous sur ce chemin.** L'en-tête de
`_shared/hibp.ts` dit lui-même que `admin.updateUser` applique les règles de mot
de passe — c'est `admin.createUser` qui ne les applique pas. L'écran appelle
`supabase.auth.updateUser`, donc GoTrue applique la longueur minimale **et** le
réglage « Prevent use of leaked passwords ». Appeler HIBP depuis le navigateur
serait de toute façon bloqué par la CSP du collecteur (`connect-src 'self'` plus
Supabase). Il n'y a rien à ajouter : il y a des messages d'erreur à traduire.

---

## Contraintes globales

- **Langue :** tout le code, les commentaires, les identifiants et les textes
  d'interface sont en **français**. Convention du dépôt, sans exception.
- **Commentaires :** ils disent *pourquoi*, jamais *quoi*.
- **Aucun contrôle inerte.** Un bouton qui ne fait rien n'est pas livré.
- **Rien ne prétend avoir envoyé.** C'est la règle portée par l'en-tête de
  `_shared/passerelle-sms.ts` et elle vaut ici mot pour mot : sans identifiants,
  `passerelleDepuis` rend `null`, l'appelant le dit, et **aucune ligne n'est
  marquée traitée**. Pas d'envoi simulé, pas de mode « journal ».
- **Aucune réponse ne distingue un compte existant d'un compte inexistant** sur
  `mot-de-passe-oublie`. Statut et corps identiques, octet pour octet.
- **Jamais de mot de passe dans un courriel.** Le seul secret qui voyage est un
  lien à usage unique.
- **`create or replace function` rétablit `EXECUTE` à `PUBLIC`.** Toute
  redéfinition d'une fonction `security definer` est suivie de ses `revoke`.
  C'est écrit dans `20260823090000_demandes_ouverture.sql`, et c'est le défaut
  que l'audit du 2026-08-25 a retrouvé sur `grouper_milliers`.
- **Noms d'environnement** — exactement ceux-ci, nulle part d'autres :
  `COURRIEL_FOURNISSEUR`, `COURRIEL_CLE`, `COURRIEL_EXPEDITEUR`,
  `REDIRECTION_MOT_DE_PASSE`.
- **Adresse de retour par défaut** — exactement
  `https://app.kolek.cash/nouveau-mot-de-passe`.
- **Commandes :**
  - tests d'un paquet : `cd packages/ui && npx vitest run <chemin>`
  - tests de base et d'Edge Functions : `npm run db:reset` puis `npm run test:db`
  - vérification complète : `npm run verifier`

---

## Ce que ce plan ne fait pas

Il ne révoque pas la clé `service_role` publiée le 2026-08-24 — bloquant ouvert,
consigné dans `Docs/audits/2026-08-25-audit-securite-20-controles.md`. Les deux
nouvelles fonctions s'appuient sur elle comme les neuf autres. Il ne pose pas
non plus Turnstile : la borne livrée ici est un compteur par IP, qui est une
autre réponse au même manque.

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `supabase/migrations/20260827090000_debit_public.sql` | **créer** — table compteur et `consommer_debit` | 1 |
| `supabase/functions/_shared/debit.ts` | **créer** — l'empreinte d'une requête, pure | 1 |
| `supabase/tests/debit.test.ts` | **créer** — le module pur | 1 |
| `supabase/tests/debit-public.test.ts` | **créer** — la base | 1 |
| `supabase/functions/_shared/passerelle-courriel.ts` | **créer** — le transport | 2 |
| `supabase/functions/_shared/message-acces.ts` | **créer** — les textes | 2 |
| `supabase/tests/passerelle-courriel.test.ts` | **créer** | 2 |
| `supabase/tests/message-acces.test.ts` | **créer** | 2 |
| `supabase/functions/_shared/valider-email.ts` | **créer** — une adresse, une seule règle | 3 |
| `supabase/functions/_shared/valider-demande.ts` | **modifier** — la demande porte une adresse | 3 |
| `supabase/tests/valider-email.test.ts` | **créer** | 3 |
| `supabase/tests/valider-demande.test.ts` | **modifier** | 3 |
| `supabase/migrations/20260827100000_demandes_email.sql` | **créer** — colonne, borne, index, `admin_demande` | 4 |
| `supabase/tests/demandes-ouverture.test.ts` | **modifier** | 4 |
| `supabase/functions/demander-ouverture/index.ts` | **modifier** — écrit l'adresse, applique la borne | 5 |
| `supabase/tests/demander-ouverture.test.ts` | **créer** — la fonction, servie en local | 5 |
| `supabase/functions/admin-demandes/index.ts` | **modifier** — l'accord invite, dans l'ordre | 6 |
| `supabase/tests/accord-demande.test.ts` | **créer** — l'ordre, c'est le cœur | 6 |
| `supabase/functions/mot-de-passe-oublie/index.ts` | **créer** | 7 |
| `supabase/tests/mot-de-passe-oublie.test.ts` | **créer** | 7 |
| `apps/site/src/vitrine/demande.ts` | **modifier** — le champ et ses refus traduits | 8 |
| `apps/site/src/vitrine/Inscription.tsx` | **modifier** — le champ, et la phrase devenue fausse | 8 |
| `apps/site/vitest.config.ts` | **créer** — la vitrine n'avait pas de suite | 8 |
| `apps/site/src/vitrine/Inscription.test.tsx` | **créer** | 8 |
| `packages/ui/src/EcranConnexion.tsx` | **modifier** — le lien « Mot de passe oublié ? » | 9 |
| `packages/ui/src/EcranConnexion.test.tsx` | **créer** | 9 |
| `apps/collecteur/src/motDePasse.ts` | **créer** — les deux appels, et leurs refus traduits | 9 |
| `apps/collecteur/src/ecrans/MotDePasseOublie.tsx` | **créer** | 9 |
| `apps/collecteur/src/ecrans/NouveauMotDePasse.tsx` | **créer** | 9 |
| `apps/collecteur/src/App.tsx` | **modifier** — deux chemins avant la session | 9 |
| `apps/collecteur/src/Connexion.tsx` | **modifier** — passe le lien | 9 |
| `apps/collecteur/src/ecrans/MotDePasseOublie.test.tsx` | **créer** | 9 |
| `apps/collecteur/src/ecrans/NouveauMotDePasse.test.tsx` | **créer** | 9 |
| `supabase/config.toml` | **modifier** — l'adresse de retour | 10 |
| `Docs/deploiement.md` | **modifier** — les secrets, le DNS, le tableau de bord | 10 |

`valider-email.ts` est un fichier à part, et non trois lignes dans
`valider-demande.ts` : deux appelants s'en servent — la demande d'ouverture et
`mot-de-passe-oublie` — et deux règles d'adresse qui divergeraient laisseraient
passer d'un côté ce que l'autre refuse.

---

## Tâche 1 — La borne de débit

**Fichiers :**
- Créer : `supabase/migrations/20260827090000_debit_public.sql`
- Créer : `supabase/functions/_shared/debit.ts`
- Créer : `supabase/tests/debit.test.ts`
- Créer : `supabase/tests/debit-public.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit :
  - SQL `public.consommer_debit(cle text, plafond integer, fenetre_secondes integer) returns boolean`
    — rend `true` si l'appel est **dans** le plafond, `false` s'il le dépasse.
  - TS `export function empreinteRequete(route: string, entetes: Headers): string`

**Pourquoi cette tâche d'abord.** Les tâches 5 et 7 posent deux fonctions
publiques, et l'audit du 2026-08-25 chiffre déjà l'absence de borne sur la
première — `grep -cin "ratelimit\|captcha\|turnstile"` rend **0**. Livrer la
seconde sans rien serait doubler un manquement connu.

- [ ] **Étape 1 : écrire le test du module pur**

Créer `supabase/tests/debit.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { empreinteRequete } from '../functions/_shared/debit.ts';

/**
 * L'empreinte qui sert de clé au compteur.
 *
 * Elle est extraite dans un module pur pour la raison établie par le défaut
 * CORS du 2026-08-20 : ce qui n'est pas testable finit par être faux. Ici,
 * « faux » veut dire soit une borne qui ne borne personne — toutes les requêtes
 * partagent la même clé —, soit une borne qui range chaque requête sous une clé
 * distincte et ne refuse jamais rien.
 */

function entetes(valeurs: Record<string, string>): Headers {
  return new Headers(valeurs);
}

describe('empreinteRequete', () => {
  it('range deux appels de la même IP sur la même route sous la même clé', () => {
    const a = empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.2' }));
    const b = empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.2' }));
    expect(a).toBe(b);
  });

  it('sépare deux routes de la même IP', () => {
    // Sans cela, trois demandes de réinitialisation épuiseraient le quota de
    // dépôt de demandes, et l'un des deux formulaires cesserait de répondre
    // sans qu'on comprenne pourquoi.
    const depot = empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.2' }));
    const oubli = empreinteRequete('mot-de-passe-oublie', entetes({ 'x-forwarded-for': '41.66.1.2' }));
    expect(depot).not.toBe(oubli);
  });

  it('sépare deux IP', () => {
    const a = empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.2' }));
    const b = empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.3' }));
    expect(a).not.toBe(b);
  });

  it('ne retient que le premier saut de x-forwarded-for', () => {
    // Les sauts suivants sont ajoutés par les relais traversés : les inclure
    // ferait varier la clé au gré du chemin réseau, et un même visiteur
    // repartirait à zéro à chaque changement de route.
    const cle = empreinteRequete(
      'demander-ouverture',
      entetes({ 'x-forwarded-for': '41.66.1.2, 10.0.0.1, 10.0.0.2' }),
    );
    expect(cle).toBe(empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.2' })));
  });

  it('retombe sur cf-connecting-ip quand x-forwarded-for manque', () => {
    const cle = empreinteRequete('demander-ouverture', entetes({ 'cf-connecting-ip': '41.66.1.2' }));
    expect(cle).toBe(empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.2' })));
  });

  it('rend une clé stable et non vide quand aucun en-tête ne porte d’IP', () => {
    // Le cas où la borne se referme sur tout le monde à la fois. C'est le bon
    // sens du défaut : sans IP, on ne peut pas distinguer les appelants, et
    // laisser passer serait offrir un contournement en retirant un en-tête.
    const cle = empreinteRequete('demander-ouverture', entetes({}));
    expect(cle).toBe('demander-ouverture:inconnue');
  });

  it('borne la longueur de la clé', () => {
    // La colonne `empreinte` porte un `check` à 200 caractères. Un en-tête
    // forgé de dix kilo-octets ferait lever `23514` à chaque appel, et la
    // fonction publique répondrait 500 au lieu de borner.
    const long = 'x'.repeat(5000);
    const cle = empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': long }));
    expect(cle.length).toBeLessThanOrEqual(200);
  });
});
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

```bash
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/debit.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "../functions/_shared/debit.ts"`.

- [ ] **Étape 3 : écrire le module**

Créer `supabase/functions/_shared/debit.ts` :

```ts
/**
 * L'empreinte d'un appelant public.
 *
 * Module sans aucune API Deno — même raison que `cors.ts` et
 * `valider-demande.ts` : le seul endroit où l'erreur serait silencieuse est
 * ici. Une empreinte trop large borne tout le monde ensemble ; une empreinte
 * trop fine ne borne personne, et dans les deux cas la fonction répond
 * normalement.
 *
 * ## L'adresse vient des en-têtes, pas de `Deno.serve`
 *
 * `info.remoteAddr` désigne le relais de la plateforme, identique pour tous les
 * appelants. La seule adresse utile est celle que le relais a écrite dans
 * `x-forwarded-for`, dont **le premier saut** est le client ; les suivants sont
 * les relais traversés et changent avec le chemin réseau.
 *
 * ## Sans adresse, on serre plutôt que d'ouvrir
 *
 * Une requête sans aucun en-tête d'adresse retombe sur une clé unique et
 * partagée. Elle est donc bornée avec les autres requêtes sans adresse —
 * strictement. L'inverse offrirait un contournement en une ligne : retirer
 * l'en-tête.
 */

/** Reprise du `check` de `public.debit_public.empreinte`. */
export const EMPREINTE_MAX = 200;

export function empreinteRequete(route: string, entetes: Headers): string {
  const transmise = entetes.get('x-forwarded-for')?.split(',')[0]?.trim();
  const cloudflare = entetes.get('cf-connecting-ip')?.trim();
  const adresse = transmise || cloudflare || 'inconnue';

  return `${route}:${adresse}`.slice(0, EMPREINTE_MAX);
}
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

```bash
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/debit.test.ts
```

Attendu : SUCCÈS, 7 tests.

- [ ] **Étape 5 : écrire la migration**

Créer `supabase/migrations/20260827090000_debit_public.sql` :

```sql
-- Le compteur d'appels des fonctions publiques.
--
-- ## Pourquoi une table et non Redis
--
-- La question s'est posée le 2026-08-26. Netlify sert des fichiers statiques et
-- les Edge Functions sont des processus Deno sans état : un Redis serait un
-- fournisseur externe de plus, avec son adresse, son jeton et sa panne
-- possible. Or la base est déjà là, déjà sous RLS, déjà auditée — et le volume
-- attendu tient dans quelques centaines de lignes. Le jour où un verrou
-- distribué ou une file de travaux apparaîtra, la porte reste ouverte ; ce
-- besoin-ci ne la justifie pas.
--
-- ## Ce que cette table borne, et ce qu'elle ne borne pas
--
-- Elle borne le nombre d'appels **acceptés** par IP et par route. Elle
-- n'empêche pas un réseau d'adresses de contourner la borne — c'est le travail
-- d'un CAPTCHA, resté ouvert dans l'audit du 2026-08-25. Elle empêche le cas
-- réel et bon marché : un script sur une machine qui noie l'écran
-- d'administration en faisant varier le numéro.

create table if not exists public.debit_public (
  empreinte text primary key,
  fenetre timestamptz not null default now(),
  compte integer not null default 0,

  -- La borne tient même si `empreinteRequete` change ou si quelqu'un écrit par
  -- un autre chemin. `debit.ts` tronque à la même valeur.
  constraint debit_empreinte_borne check (length(empreinte) between 1 and 200)
);

-- Pour la purge ci-dessous, qui balaie par date.
create index if not exists debit_public_fenetre on public.debit_public (fenetre);

alter table public.debit_public enable row level security;

-- Aucun droit pour les rôles du navigateur. La table n'est touchée que par
-- `consommer_debit`, elle-même réservée à la clé de service : un compteur que
-- l'appelant peut remettre à zéro ne compte rien.
revoke all on public.debit_public from public;
revoke all on public.debit_public from anon;
revoke all on public.debit_public from authenticated;
grant all on public.debit_public to service_role;

/**
 * Consomme un appel, et dit s'il est dans le plafond.
 *
 * Tout tient dans **une seule instruction** — `insert ... on conflict do
 * update ... returning`. Lire puis écrire en deux temps laisserait deux appels
 * simultanés lire la même valeur et l'incrémenter chacun de leur côté : la
 * borne laisserait passer le double sous la charge, c'est-à-dire exactement
 * quand elle sert.
 *
 * La fenêtre est glissante par bloc : le premier appel la pose, les suivants
 * s'y ajoutent, et le premier appel arrivé après son expiration la repose à
 * neuf.
 */
create or replace function public.consommer_debit(
  cle text,
  plafond integer,
  fenetre_secondes integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  n integer;
begin
  -- La purge vit ici plutôt que dans une tâche planifiée : la table n'a pas
  -- d'autre écrivain, et une tâche de plus à surveiller pour quelques
  -- centaines de lignes coûterait plus qu'elle ne rapporte. L'index sur
  -- `fenetre` la rend négligeable.
  delete from public.debit_public
   where fenetre < now() - interval '1 day';

  insert into public.debit_public (empreinte, fenetre, compte)
  values (cle, now(), 1)
  on conflict (empreinte) do update
     set compte = case
           when debit_public.fenetre < now() - make_interval(secs => fenetre_secondes) then 1
           else debit_public.compte + 1
         end,
         fenetre = case
           when debit_public.fenetre < now() - make_interval(secs => fenetre_secondes) then now()
           else debit_public.fenetre
         end
  returning compte into n;

  return n <= plafond;
end;
$fn$;

revoke all on function public.consommer_debit(text, integer, integer) from public;
revoke all on function public.consommer_debit(text, integer, integer) from anon;
revoke all on function public.consommer_debit(text, integer, integer) from authenticated;
grant execute on function public.consommer_debit(text, integer, integer) to service_role;

comment on function public.consommer_debit is
  'Compte les appels d''une empreinte dans une fenêtre glissante. Rend faux au-delà du plafond. Réservée à service_role : le compteur est tenu par les Edge Functions publiques.';

-- Garde-fou, même dispositif que `20260823090000` : un `revoke` oublié sur une
-- fonction `security definer` est exactement le genre de défaut qui ne se voit
-- pas.
do $garde$
begin
  if has_table_privilege('anon', 'public.debit_public', 'select')
     or has_table_privilege('anon', 'public.debit_public', 'update')
     or has_table_privilege('authenticated', 'public.debit_public', 'select') then
    raise exception 'GARDE_FOU : debit_public reste accessible depuis un navigateur.';
  end if;

  if has_function_privilege('anon', 'public.consommer_debit(text, integer, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.consommer_debit(text, integer, integer)', 'execute') then
    raise exception 'GARDE_FOU : consommer_debit reste exécutable sans clé de service.';
  end if;
end;
$garde$;
```

- [ ] **Étape 6 : écrire le test de la base**

Créer `supabase/tests/debit-public.test.ts` :

```ts
import { afterAll, describe, expect, it } from 'vitest';

import { admin, anonyme } from './harnais';

/**
 * Le compteur des fonctions publiques.
 *
 * Deux choses à prouver, et elles ne se recouvrent pas : que personne ne peut
 * remettre le compteur à zéro depuis un navigateur, et qu'il compte juste.
 */

const CLE = `test-debit-${crypto.randomUUID()}`;

afterAll(async () => {
  await admin.from('debit_public').delete().like('empreinte', 'test-debit-%');
});

describe('le verrou', () => {
  it('refuse la lecture anonyme de la table', async () => {
    const { error } = await anonyme.from('debit_public').select('*');
    expect(error).not.toBeNull();
  });

  it('refuse consommer_debit à un anonyme', async () => {
    // Le point qui compte : un appelant qui peut appeler la fonction lui-même
    // peut épuiser le quota d'un tiers, ou remettre le sien à neuf.
    const { error } = await anonyme.rpc('consommer_debit', {
      cle: CLE,
      plafond: 1,
      fenetre_secondes: 60,
    });
    expect(error).not.toBeNull();
  });
});

describe('le comptage', () => {
  it('accepte jusqu’au plafond, refuse au-delà', async () => {
    const cle = `${CLE}-plafond`;
    const appel = () =>
      admin.rpc('consommer_debit', { cle, plafond: 2, fenetre_secondes: 60 });

    expect((await appel()).data).toBe(true);
    expect((await appel()).data).toBe(true);
    expect((await appel()).data).toBe(false);
    expect((await appel()).data).toBe(false);
  });

  it('repart à neuf une fois la fenêtre passée', async () => {
    // Sans ce comportement, la borne serait définitive : le premier visiteur
    // d'une adresse partagée — un cybercafé d'Adjamé — fermerait le formulaire
    // pour tous les suivants, à jamais.
    const cle = `${CLE}-fenetre`;
    await admin.rpc('consommer_debit', { cle, plafond: 1, fenetre_secondes: 60 });
    expect(
      (await admin.rpc('consommer_debit', { cle, plafond: 1, fenetre_secondes: 60 })).data,
    ).toBe(false);

    // On vieillit la fenêtre plutôt que d'attendre : le test doit mesurer la
    // règle, pas la patience de celui qui le lance.
    await admin
      .from('debit_public')
      .update({ fenetre: new Date(Date.now() - 120_000).toISOString() })
      .eq('empreinte', cle);

    const { data } = await admin.rpc('consommer_debit', { cle, plafond: 1, fenetre_secondes: 60 });
    expect(data).toBe(true);

    const { data: ligne } = await admin
      .from('debit_public')
      .select('compte')
      .eq('empreinte', cle)
      .single();
    expect(ligne?.compte).toBe(1);
  });

  it('compte séparément deux empreintes', async () => {
    const a = `${CLE}-a`;
    const b = `${CLE}-b`;
    await admin.rpc('consommer_debit', { cle: a, plafond: 1, fenetre_secondes: 60 });

    const { data } = await admin.rpc('consommer_debit', { cle: b, plafond: 1, fenetre_secondes: 60 });
    expect(data).toBe(true);
  });
});
```

- [ ] **Étape 7 : appliquer la migration et lancer les tests**

```bash
npm run db:reset && npm run test:db
```

Attendu : SUCCÈS. La migration s'applique sans lever de `GARDE_FOU`, et
`debit-public.test.ts` passe ses 5 tests.

- [ ] **Étape 8 : commit**

```bash
git add supabase/migrations/20260827090000_debit_public.sql \
        supabase/functions/_shared/debit.ts \
        supabase/tests/debit.test.ts \
        supabase/tests/debit-public.test.ts
git commit -m "feat(debit): un compteur par IP pour les fonctions publiques"
```

---

## Tâche 2 — La passerelle courriel et ses textes

**Fichiers :**
- Créer : `supabase/functions/_shared/passerelle-courriel.ts`
- Créer : `supabase/functions/_shared/message-acces.ts`
- Créer : `supabase/tests/passerelle-courriel.test.ts`
- Créer : `supabase/tests/message-acces.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit :
  ```ts
  // passerelle-courriel.ts
  export type Fournisseur = 'resend';
  export interface Identifiants { fournisseur: Fournisseur; cle: string; expediteur: string }
  export interface Requete { url: string; entetes: Record<string, string>; corps: string }
  export type Issue = { ok: true } | { ok: false; reessayable: boolean; raison: string };
  export function passerelleDepuis(env: Record<string, string | undefined>): Identifiants | null;
  export function construireRequete(i: Identifiants, destinataire: string, sujet: string, corps: string): Requete;
  export function lireIssue(statut: number): Issue;
  export function envoyer(i: Identifiants, destinataire: string, sujet: string, corps: string, recuperer?: typeof fetch): Promise<Issue>;

  // message-acces.ts
  export interface Courriel { sujet: string; corps: string }
  export type Evenement =
    | { type: 'invitation'; nom: string; lien: string }
    | { type: 'reinitialisation'; lien: string };
  export function composer(evenement: Evenement): Courriel;
  ```

**Deux fichiers et non un.** Le dépôt sépare déjà le transport
(`passerelle-sms.ts`) de la rédaction (`message-client.ts`), et pour une bonne
raison : changer de fournisseur ne doit pas faire relire les textes, et corriger
une phrase ne doit pas faire relire l'authentification.

- [ ] **Étape 1 : écrire le test du transport**

Créer `supabase/tests/passerelle-courriel.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';

import {
  construireRequete,
  envoyer,
  lireIssue,
  passerelleDepuis,
  type Identifiants,
} from '../functions/_shared/passerelle-courriel.ts';

/**
 * La passerelle courriel.
 *
 * Elle porte la même promesse que sa jumelle SMS, et c'est la seule qui
 * compte : **elle ne prétend jamais avoir envoyé**. Un dispositif qui
 * marquerait une demande « ouverte » sur un envoi imaginaire produirait un
 * prospect classé traité qui n'a jamais rien reçu — découvert des semaines plus
 * tard, par un appel.
 */

const IDENTIFIANTS: Identifiants = {
  fournisseur: 'resend',
  cle: 're_test_123',
  expediteur: 'Kolek <acces@kolek.cash>',
};

describe('passerelleDepuis', () => {
  it('lit une configuration complète', () => {
    const p = passerelleDepuis({
      COURRIEL_FOURNISSEUR: 'resend',
      COURRIEL_CLE: 're_test_123',
      COURRIEL_EXPEDITEUR: 'Kolek <acces@kolek.cash>',
    });
    expect(p).toEqual(IDENTIFIANTS);
  });

  it('rend null quand la clé manque', () => {
    // Rendre `null` est le comportement qui tient toute la chaîne : l'appelant
    // le voit, le dit, et ne marque rien.
    expect(
      passerelleDepuis({
        COURRIEL_FOURNISSEUR: 'resend',
        COURRIEL_EXPEDITEUR: 'Kolek <acces@kolek.cash>',
      }),
    ).toBeNull();
  });

  it('rend null quand l’expéditeur manque', () => {
    expect(
      passerelleDepuis({ COURRIEL_FOURNISSEUR: 'resend', COURRIEL_CLE: 're_test_123' }),
    ).toBeNull();
  });

  it('rend null pour un fournisseur inconnu', () => {
    // Un nom mal orthographié doit couper, pas retomber en silence sur Resend :
    // celui qui a écrit `resent` doit l'apprendre.
    expect(
      passerelleDepuis({
        COURRIEL_FOURNISSEUR: 'resent',
        COURRIEL_CLE: 're_test_123',
        COURRIEL_EXPEDITEUR: 'Kolek <acces@kolek.cash>',
      }),
    ).toBeNull();
  });

  it('rend null sur un environnement vide', () => {
    expect(passerelleDepuis({})).toBeNull();
  });
});

describe('construireRequete', () => {
  it('compose l’appel Resend', () => {
    const r = construireRequete(IDENTIFIANTS, 'mariam@example.ci', 'Ton compte Kolek', 'Bonjour.');

    expect(r.url).toBe('https://api.resend.com/emails');
    expect(r.entetes.Authorization).toBe('Bearer re_test_123');
    expect(r.entetes['Content-Type']).toBe('application/json');

    const corps = JSON.parse(r.corps);
    expect(corps.from).toBe('Kolek <acces@kolek.cash>');
    expect(corps.to).toEqual(['mariam@example.ci']);
    expect(corps.subject).toBe('Ton compte Kolek');
    expect(corps.text).toBe('Bonjour.');
  });

  it('n’envoie qu’en texte', () => {
    // Pas de `html` : un corps HTML demanderait une seconde rédaction à tenir à
    // jour, et le message ne porte qu'un lien. Le texte simple passe partout et
    // ne peut pas diverger de lui-même.
    const corps = JSON.parse(construireRequete(IDENTIFIANTS, 'a@b.ci', 'S', 'C').corps);
    expect(corps.html).toBeUndefined();
  });
});

describe('lireIssue', () => {
  it('accepte les 2xx', () => {
    expect(lireIssue(200)).toEqual({ ok: true });
    expect(lireIssue(202)).toEqual({ ok: true });
  });

  it('marque 429 réessayable', () => {
    expect(lireIssue(429)).toEqual({ ok: false, reessayable: true, raison: 'DEBIT_DEPASSE' });
  });

  it('marque les 5xx réessayables', () => {
    expect(lireIssue(503)).toEqual({ ok: false, reessayable: true, raison: 'PASSERELLE_503' });
  });

  it('marque 401 et 403 définitifs', () => {
    // Réessayer mille fois ne changera pas une clé refusée, et il faut que
    // quelqu'un le voie.
    expect(lireIssue(401)).toEqual({
      ok: false,
      reessayable: false,
      raison: 'IDENTIFIANTS_REFUSES',
    });
    expect(lireIssue(403).reessayable).toBe(false);
  });

  it('nomme les autres refus', () => {
    expect(lireIssue(422)).toEqual({ ok: false, reessayable: false, raison: 'REFUS_422' });
  });
});

describe('envoyer', () => {
  it('rend ok sur une réponse 200', async () => {
    const recuperer = vi.fn(async () => new Response('{}', { status: 200 }));
    const issue = await envoyer(IDENTIFIANTS, 'a@b.ci', 'S', 'C', recuperer as unknown as typeof fetch);

    expect(issue).toEqual({ ok: true });
    expect(recuperer).toHaveBeenCalledOnce();
  });

  it('rend un échec réessayable sur une coupure réseau', async () => {
    // Le cas qui doit surtout **ne rien marquer** : la demande reste en l'état,
    // et l'administrateur peut relancer.
    const recuperer = vi.fn(async () => {
      throw new TypeError('network');
    });
    const issue = await envoyer(IDENTIFIANTS, 'a@b.ci', 'S', 'C', recuperer as unknown as typeof fetch);

    expect(issue.ok).toBe(false);
    if (issue.ok) return;
    expect(issue.reessayable).toBe(true);
    expect(issue.raison).toBe('RESEAU_TypeError');
  });

  it('refuse une adresse vide sans appeler le fournisseur', async () => {
    const recuperer = vi.fn();
    const issue = await envoyer(IDENTIFIANTS, '   ', 'S', 'C', recuperer as unknown as typeof fetch);

    expect(issue).toEqual({ ok: false, reessayable: false, raison: 'ADRESSE_VIDE' });
    expect(recuperer).not.toHaveBeenCalled();
  });
});
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

```bash
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/passerelle-courriel.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import ".../passerelle-courriel.ts"`.

- [ ] **Étape 3 : écrire le transport**

Créer `supabase/functions/_shared/passerelle-courriel.ts` :

```ts
/**
 * La passerelle courriel.
 *
 * Calquée sur `passerelle-sms.ts` — même forme, même contrat, et surtout même
 * promesse : **elle n'invente aucun identifiant et ne prétend jamais avoir
 * envoyé**. Sans configuration, `passerelleDepuis` rend `null`, et l'appelant
 * laisse l'état intact. Rien n'est marqué « ouvert », rien n'est perdu, et tout
 * repart tel quel le jour où la clé arrive.
 *
 * ## Pourquoi ce module plutôt que le mailer de Supabase
 *
 * Supabase sait envoyer lui-même, par un SMTP réglé au tableau de bord. On ne
 * s'en sert pas : le service intégré plafonne à deux courriels par heure —
 * `email_sent = 2` dans `config.toml` — et le troisième prospect de la journée
 * ne recevrait rien **sans qu'aucune erreur ne le dise**. Une clé d'API chez un
 * fournisseur est nécessaire dans les deux cas ; ce chemin-ci nous donne en
 * plus la maîtrise du texte et un seul mécanisme pour l'invitation comme pour
 * l'oubli.
 *
 * ## Un seul fournisseur, pour l'instant
 *
 * `passerelle-sms.ts` en porte deux parce que le coût au message décidait du
 * choix. Ici le volume est de quelques courriels par semaine : un second
 * fournisseur serait du code non exercé. Le type `Fournisseur` existe quand
 * même — c'est lui qui fait qu'en ajouter un se lira comme une addition et non
 * comme une réécriture.
 */

export type Fournisseur = 'resend';

export interface Identifiants {
  fournisseur: Fournisseur;
  /** La clé d'API du fournisseur. */
  cle: string;
  /** L'expéditeur affiché, au format `Nom <adresse>`. Le domaine doit être
      vérifié chez le fournisseur, sinon l'envoi est refusé en 403. */
  expediteur: string;
}

export interface Requete {
  url: string;
  entetes: Record<string, string>;
  corps: string;
}

/** Lit les identifiants dans l'environnement, ou rend `null`. */
export function passerelleDepuis(
  env: Record<string, string | undefined>,
): Identifiants | null {
  const fournisseur = env.COURRIEL_FOURNISSEUR;
  const cle = env.COURRIEL_CLE;
  const expediteur = env.COURRIEL_EXPEDITEUR;

  if (fournisseur !== 'resend') return null;
  if (!cle || !expediteur) return null;

  return { fournisseur, cle, expediteur };
}

/**
 * Construit la requête d'envoi.
 *
 * Rien que du texte. Un corps HTML demanderait une seconde rédaction à tenir
 * synchronisée avec la première, pour un message qui ne porte qu'un lien.
 */
export function construireRequete(
  identifiants: Identifiants,
  destinataire: string,
  sujet: string,
  corps: string,
): Requete {
  return {
    url: 'https://api.resend.com/emails',
    entetes: {
      Authorization: `Bearer ${identifiants.cle}`,
      'Content-Type': 'application/json',
    },
    corps: JSON.stringify({
      from: identifiants.expediteur,
      to: [destinataire],
      subject: sujet,
      text: corps,
    }),
  };
}

export type Issue =
  | { ok: true }
  | { ok: false; reessayable: boolean; raison: string };

/**
 * Interprète la réponse du fournisseur.
 *
 * Même découpe que `passerelle-sms.ts`, et la distinction qui compte est la
 * même : **réessayable ou non**. Un 5xx se rejoue ; une clé refusée se
 * rejouerait mille fois pour le même échec.
 */
export function lireIssue(statut: number): Issue {
  if (statut >= 200 && statut < 300) return { ok: true };

  if (statut === 429) return { ok: false, reessayable: true, raison: 'DEBIT_DEPASSE' };
  if (statut >= 500) return { ok: false, reessayable: true, raison: `PASSERELLE_${statut}` };

  if (statut === 401 || statut === 403) {
    return { ok: false, reessayable: false, raison: 'IDENTIFIANTS_REFUSES' };
  }
  return { ok: false, reessayable: false, raison: `REFUS_${statut}` };
}

/** Envoie un message. `recuperer` est injectable pour les tests. */
export async function envoyer(
  identifiants: Identifiants,
  destinataire: string,
  sujet: string,
  corps: string,
  recuperer: typeof fetch = fetch,
): Promise<Issue> {
  const adresse = destinataire.trim();
  if (!adresse) return { ok: false, reessayable: false, raison: 'ADRESSE_VIDE' };

  const requete = construireRequete(identifiants, adresse, sujet, corps);

  try {
    const reponse = await recuperer(requete.url, {
      method: 'POST',
      headers: requete.entetes,
      body: requete.corps,
    });
    return lireIssue(reponse.status);
  } catch (cause) {
    // Une coupure réseau est réessayable, et surtout : on ne marque rien.
    return {
      ok: false,
      reessayable: true,
      raison: cause instanceof Error ? `RESEAU_${cause.name}` : 'RESEAU',
    };
  }
}
```

- [ ] **Étape 4 : lancer, vérifier le succès**

```bash
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/passerelle-courriel.test.ts
```

Attendu : SUCCÈS, 15 tests.

- [ ] **Étape 5 : écrire le test des textes**

Créer `supabase/tests/message-acces.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { composer } from '../functions/_shared/message-acces.ts';

/**
 * Les deux courriels d'accès.
 *
 * Un seul invariant vaut d'être tenu par un test plutôt que par la relecture :
 * **le lien est le seul secret qui voyage**. Un mot de passe écrit dans un
 * courriel dort dans une boîte de réception pour toujours, et rien n'oblige à
 * le changer.
 */

const LIEN = 'https://yfnwmokxkznejotgpfgf.supabase.co/auth/v1/verify?token=abc&type=invite';

describe('l’invitation', () => {
  it('porte le lien et le nom', () => {
    const { sujet, corps } = composer({ type: 'invitation', nom: 'Mariam Koné', lien: LIEN });

    expect(sujet.length).toBeGreaterThan(0);
    expect(corps).toContain(LIEN);
    expect(corps).toContain('Mariam Koné');
  });

  it('ne porte le lien qu’une fois', () => {
    // Deux occurrences dans un message texte se lisent comme deux liens
    // différents, et le second clic tombe sur un jeton déjà consommé.
    const { corps } = composer({ type: 'invitation', nom: 'Mariam', lien: LIEN });
    expect(corps.split(LIEN).length - 1).toBe(1);
  });

  it('dit que le lien expire', () => {
    // Sans cette phrase, le prospect qui ouvre son courriel deux jours plus
    // tard croit son compte cassé et appelle GTCS.
    const { corps } = composer({ type: 'invitation', nom: 'Mariam', lien: LIEN });
    expect(corps).toMatch(/heure/i);
  });

  it('ne laisse pas de trou quand le nom est vide', () => {
    // `admin_demande` rend ce que le prospect a saisi ; la validation borne à
    // deux caractères, mais une ligne déposée avant ce lot peut surprendre.
    const { corps } = composer({ type: 'invitation', nom: '', lien: LIEN });
    expect(corps).not.toContain('undefined');
    expect(corps).not.toContain(', ,');
  });
});

describe('la réinitialisation', () => {
  it('porte le lien', () => {
    const { sujet, corps } = composer({ type: 'reinitialisation', lien: LIEN });
    expect(sujet.length).toBeGreaterThan(0);
    expect(corps).toContain(LIEN);
  });

  it('ne nomme personne', () => {
    // Ce message part sur une adresse saisie par quelqu'un qui n'a pas encore
    // prouvé qu'il la possède. Y écrire le nom du titulaire livrerait une
    // information sur le compte à qui a tapé l'adresse au hasard.
    const { corps } = composer({ type: 'reinitialisation', lien: LIEN });
    expect(corps).not.toMatch(/Bonjour\s+\S/);
  });

  it('dit quoi faire si le message n’a pas été demandé', () => {
    const { corps } = composer({ type: 'reinitialisation', lien: LIEN });
    expect(corps).toMatch(/ignore/i);
  });
});

describe('les deux', () => {
  it('n’écrivent jamais le mot « mot de passe » suivi d’une valeur', () => {
    // L'invariant du lot : aucun secret ne voyage par courriel, sauf le lien.
    for (const courriel of [
      composer({ type: 'invitation', nom: 'Mariam', lien: LIEN }),
      composer({ type: 'reinitialisation', lien: LIEN }),
    ]) {
      expect(courriel.corps).not.toMatch(/mot de passe\s*[:=]\s*\S/i);
    }
  });
});
```

- [ ] **Étape 6 : écrire les textes**

Créer `supabase/functions/_shared/message-acces.ts` :

```ts
/**
 * Les courriels qui donnent accès au compte.
 *
 * Module sans aucune API Deno, comme `message-client.ts` : le texte est ce qui
 * se relit le plus souvent et se casse le plus discrètement.
 *
 * ## Ce qui ne doit jamais figurer ici
 *
 * **Un mot de passe.** Ni engendré, ni provisoire, ni « à changer à la première
 * connexion ». Un mot de passe écrit dans un courriel dort dans une boîte de
 * réception pour toujours, et rien n'oblige à le changer. Le lien à usage
 * unique laisse le prospect choisir le sien, et c'est ce qui permet à
 * l'invitation et à l'oubli de partager un seul dispositif.
 *
 * ## Deux messages, deux tons
 *
 * L'invitation nomme la personne : GTCS lui a parlé, l'a rappelée, et lui ouvre
 * son compte. La réinitialisation ne nomme personne — elle part sur une adresse
 * saisie par quelqu'un qui n'a pas encore prouvé qu'il la possède, et y écrire
 * le nom du titulaire livrerait un fait sur le compte à qui a tapé l'adresse au
 * hasard.
 *
 * Pas de conversion typographique ici, contrairement à `message-client.ts` :
 * un courriel se facture au message, pas au segment, et l'apostrophe française
 * ne coûte rien.
 */

export interface Courriel {
  sujet: string;
  corps: string;
}

export type Evenement =
  | { type: 'invitation'; nom: string; lien: string }
  | { type: 'reinitialisation'; lien: string };

/** L'adresse de l'application, pour la ligne qui suit le clic. */
const APPLICATION = 'https://app.kolek.cash';

export function composer(evenement: Evenement): Courriel {
  if (evenement.type === 'invitation') {
    // Le nom peut manquer sur une demande déposée avant ce lot : on retombe
    // sur une salutation sans nom plutôt que sur une virgule orpheline.
    const salutation = evenement.nom.trim() ? `Bonjour ${evenement.nom.trim()},` : 'Bonjour,';

    return {
      sujet: 'Ton compte Kolek est ouvert',
      corps: [
        salutation,
        '',
        'GTCS vient d’ouvrir ton compte collecteur.',
        '',
        'Choisis ton mot de passe ici. Le lien vaut une heure et ne sert qu’une fois :',
        evenement.lien,
        '',
        `Ensuite, tu te connectes sur ${APPLICATION} avec cette adresse et le mot de passe que tu viens de choisir.`,
        '',
        'Tu n’as rien demandé ? Ignore ce message : sans le clic, rien ne s’ouvre.',
        '',
        'GTCS — Kolek',
      ].join('\n'),
    };
  }

  return {
    sujet: 'Choisir un nouveau mot de passe Kolek',
    corps: [
      'Une réinitialisation de mot de passe a été demandée pour cette adresse.',
      '',
      'Choisis ton nouveau mot de passe ici. Le lien vaut une heure et ne sert qu’une fois :',
      evenement.lien,
      '',
      'Tu n’as rien demandé ? Ignore ce message. Ton mot de passe actuel reste valable, et personne n’a appris quoi que ce soit sur ton compte.',
      '',
      'GTCS — Kolek',
    ].join('\n'),
  };
}
```

- [ ] **Étape 7 : lancer les deux fichiers de test**

```bash
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/passerelle-courriel.test.ts supabase/tests/message-acces.test.ts
```

Attendu : SUCCÈS, 23 tests.

- [ ] **Étape 8 : commit**

```bash
git add supabase/functions/_shared/passerelle-courriel.ts \
        supabase/functions/_shared/message-acces.ts \
        supabase/tests/passerelle-courriel.test.ts \
        supabase/tests/message-acces.test.ts
git commit -m "feat(courriel): une passerelle qui ne prétend jamais avoir envoyé"
```

---

## Tâche 3 — L'adresse entre dans la validation

**Fichiers :**
- Créer : `supabase/functions/_shared/valider-email.ts`
- Créer : `supabase/tests/valider-email.test.ts`
- Modifier : `supabase/functions/_shared/valider-demande.ts`
- Modifier : `supabase/tests/valider-demande.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit :
  ```ts
  // valider-email.ts
  export const EMAIL_MAX = 160;
  export type RefusEmail = 'EMAIL_MANQUANT' | 'EMAIL_TROP_LONG' | 'EMAIL_INVALIDE';
  export type ResultatEmail = { ok: true; email: string } | { ok: false; erreur: RefusEmail };
  export function validerEmail(brut: unknown): ResultatEmail;

  // valider-demande.ts — DemandeBrute gagne `email?: unknown`,
  // DemandeValide gagne `email: string`. BORNES gagne `email: { max: 160 }`.
  ```

**L'ordre des refus est décidé ici** : absent, puis trop long, puis mal formé.
Une chaîne de trois cents caractères rend `EMAIL_TROP_LONG` et non
`EMAIL_INVALIDE` — le visiteur qui a collé un paragraphe apprend le vrai
problème.

**La normalisation est en minuscules**, et c'est ce qui rend l'index unique
utile : `Mariam@Example.ci` et `mariam@example.ci` sont la même boîte, et sans
cela deux demandes en attente cohabiteraient.

- [ ] **Étape 1 : écrire le test de `valider-email`**

Créer `supabase/tests/valider-email.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { EMAIL_MAX, validerEmail } from '../functions/_shared/valider-email.ts';

/**
 * La règle d'adresse, une seule pour tout le produit.
 *
 * Deux appelants s'en servent — le dépôt de demande et la réinitialisation de
 * mot de passe. Deux règles qui divergeraient laisseraient passer d'un côté ce
 * que l'autre refuse : un prospect déposerait une adresse que l'écran d'oubli
 * refuserait ensuite de reconnaître.
 */

describe('ce qui passe', () => {
  it('accepte une adresse ordinaire', () => {
    const r = validerEmail('mariam@example.ci');
    expect(r).toEqual({ ok: true, email: 'mariam@example.ci' });
  });

  it('rabat en minuscules et retire les espaces', () => {
    // Ce que rend cette fonction est ce qui sera écrit en base, et l'index
    // unique porte dessus. Sans cette normalisation, il suffirait d'une
    // majuscule pour redéposer une demande.
    const r = validerEmail('  Mariam@Example.CI  ');
    expect(r).toEqual({ ok: true, email: 'mariam@example.ci' });
  });

  it('accepte un sous-domaine et un signe plus', () => {
    // Le `+` est le seul moyen dont dispose quelqu'un pour se créer une adresse
    // dédiée sans ouvrir une boîte. Le refuser fermerait la porte à des gens de
    // bonne foi.
    expect(validerEmail('mariam+kolek@mail.example.ci').ok).toBe(true);
  });
});

describe('ce qui est refusé', () => {
  it('refuse l’absence', () => {
    expect(validerEmail(undefined)).toEqual({ ok: false, erreur: 'EMAIL_MANQUANT' });
    expect(validerEmail('')).toEqual({ ok: false, erreur: 'EMAIL_MANQUANT' });
    expect(validerEmail('   ')).toEqual({ ok: false, erreur: 'EMAIL_MANQUANT' });
  });

  it('refuse ce qui n’est pas une chaîne', () => {
    // La fonction lit un corps JSON venu d'Internet : un nombre, un tableau ou
    // un objet y arrivent aussi bien qu'une chaîne.
    expect(validerEmail(42)).toEqual({ ok: false, erreur: 'EMAIL_MANQUANT' });
    expect(validerEmail({ email: 'a@b.ci' })).toEqual({ ok: false, erreur: 'EMAIL_MANQUANT' });
  });

  it('refuse une adresse sans arobase, sans domaine ou sans point', () => {
    expect(validerEmail('mariam').erreur).toBe('EMAIL_INVALIDE');
    expect(validerEmail('mariam@').erreur).toBe('EMAIL_INVALIDE');
    expect(validerEmail('@example.ci').erreur).toBe('EMAIL_INVALIDE');
    expect(validerEmail('mariam@example').erreur).toBe('EMAIL_INVALIDE');
  });

  it('refuse une adresse qui contient un espace', () => {
    expect(validerEmail('mar iam@example.ci').erreur).toBe('EMAIL_INVALIDE');
  });

  it('refuse deux adresses collées', () => {
    expect(validerEmail('a@b.ci,c@d.ci').erreur).toBe('EMAIL_INVALIDE');
  });

  it('refuse plus long que la borne, avant de juger la forme', () => {
    // L'ordre est une décision : celui qui a collé un paragraphe apprend que
    // c'est trop long, pas que « ce n'est pas une adresse ».
    const trop = `${'x'.repeat(EMAIL_MAX)}@example.ci`;
    expect(validerEmail(trop)).toEqual({ ok: false, erreur: 'EMAIL_TROP_LONG' });
  });

  it('mesure la longueur après normalisation', () => {
    const juste = `${'x'.repeat(EMAIL_MAX - '@example.ci'.length)}@example.ci`;
    expect(validerEmail(`  ${juste}  `).ok).toBe(true);
  });
});
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

```bash
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/valider-email.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import ".../valider-email.ts"`.

- [ ] **Étape 3 : écrire le module**

Créer `supabase/functions/_shared/valider-email.ts` :

```ts
/**
 * La règle d'adresse électronique du produit.
 *
 * Module sans aucune API Deno, et à part de `valider-demande.ts` parce qu'il a
 * deux appelants : le dépôt de demande, et `mot-de-passe-oublie`. Deux règles
 * qui divergeraient laisseraient un prospect déposer une adresse que l'écran
 * d'oubli refuserait ensuite de reconnaître.
 *
 * ## Ce que cette expression cherche à faire, et ce qu'elle renonce à faire
 *
 * Elle ne prétend pas décider si une adresse existe — seule une lettre envoyée
 * le dit, et c'est justement ce que fait le lien d'invitation. Elle écarte les
 * saisies qui ne peuvent en aucun cas en être une : pas d'arobase, pas de
 * domaine, un espace au milieu, une virgule qui trahit deux adresses collées.
 *
 * Une expression rationnelle « complète » au sens de la RFC 5322 fait plusieurs
 * milliers de caractères, refuse des adresses valides et se relit par personne.
 * Celle-ci tient sur une ligne et se relit.
 *
 * ## La normalisation est la moitié du travail
 *
 * Ce que rend cette fonction est **ce qui sera écrit en base**, et l'index
 * unique partiel des demandes en attente porte dessus. Sans le passage en
 * minuscules, une majuscule suffirait à redéposer une demande.
 */

/** Reprise du `check` de `public.demandes_ouverture.email`. */
export const EMAIL_MAX = 160;

const FORME = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

export type RefusEmail = 'EMAIL_MANQUANT' | 'EMAIL_TROP_LONG' | 'EMAIL_INVALIDE';

export type ResultatEmail =
  | { ok: true; email: string }
  | { ok: false; erreur: RefusEmail };

export function validerEmail(brut: unknown): ResultatEmail {
  const email = typeof brut === 'string' ? brut.trim().toLowerCase() : '';

  if (!email) return { ok: false, erreur: 'EMAIL_MANQUANT' };
  // La longueur d'abord : celui qui a collé un paragraphe doit apprendre le
  // vrai problème, pas « ce n'est pas une adresse ».
  if (email.length > EMAIL_MAX) return { ok: false, erreur: 'EMAIL_TROP_LONG' };
  if (!FORME.test(email)) return { ok: false, erreur: 'EMAIL_INVALIDE' };

  return { ok: true, email };
}
```

- [ ] **Étape 4 : lancer, vérifier le succès**

```bash
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/valider-email.test.ts
```

Attendu : SUCCÈS, 10 tests.

- [ ] **Étape 5 : écrire les tests de la demande enrichie**

Ajouter à la fin de `supabase/tests/valider-demande.test.ts` :

```ts
describe('l’adresse électronique', () => {
  // Ajoutée le 2026-08-27. Le formulaire n'en demandait pas, et rien ne
  // permettait donc de joindre un prospect autrement qu'en composant son
  // numéro — ni, surtout, de lui ouvrir son compte.
  it('refuse une demande sans adresse', () => {
    const { email: _, ...sansEmail } = { ...VALIDE, email: 'mariam@example.ci' };
    const r = validerDemande(sansEmail);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreur).toBe('EMAIL_MANQUANT');
    expect(r.champ).toBe('email');
  });

  it('accepte une demande complète et rend l’adresse normalisée', () => {
    const r = validerDemande({ ...VALIDE, email: '  Mariam@Example.CI ' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.demande.email).toBe('mariam@example.ci');
  });

  it('nomme le champ sur un refus de forme', () => {
    // Le formulaire de la vitrine surligne le champ nommé ici. Un `champ`
    // absent ou faux laisse le visiteur chercher.
    const r = validerDemande({ ...VALIDE, email: 'mariam' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreur).toBe('EMAIL_INVALIDE');
    expect(r.champ).toBe('email');
  });

  it('refuse une adresse trop longue', () => {
    const r = validerDemande({ ...VALIDE, email: `${'x'.repeat(200)}@example.ci` });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreur).toBe('EMAIL_TROP_LONG');
  });

  it('juge le nom avant l’adresse', () => {
    // L'ordre des contrôles est stable : le premier champ du formulaire est le
    // premier refusé. Sans cela, un formulaire vide surlignerait le troisième
    // champ.
    const r = validerDemande({ nom: 'M' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.champ).toBe('nom');
  });
});
```

Modifier également la constante `VALIDE` en tête du fichier pour qu'elle porte
l'adresse — sans quoi tous les tests existants deviendraient rouges :

```ts
const VALIDE = {
  nom: 'Mariam Koné',
  telephone: '+225 07 01 02 03 04',
  email: 'mariam@example.ci',
  zone: 'Adjamé',
  palier: 'pro',
  message: 'Je collecte au marché depuis six ans.',
};
```

- [ ] **Étape 6 : lancer, vérifier l'échec**

```bash
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/valider-demande.test.ts
```

Attendu : ÉCHEC — les cinq nouveaux tests tombent, `r.erreur` valant `undefined`
là où `EMAIL_MANQUANT` est attendu.

- [ ] **Étape 7 : brancher l'adresse dans `valider-demande.ts`**

Dans `supabase/functions/_shared/valider-demande.ts` :

1. Ajouter l'import en tête :

```ts
import { EMAIL_MAX, validerEmail } from './valider-email.ts';
```

2. Ajouter la borne dans `BORNES`, après `telephone` :

```ts
export const BORNES = {
  nom: { min: 2, max: 120 },
  telephone: { min: 8, max: 64 },
  email: { max: EMAIL_MAX },
  zone: { max: 80 },
  message: { max: 500 },
} as const;
```

3. Ajouter le champ aux deux interfaces :

```ts
export interface DemandeBrute {
  nom?: unknown;
  telephone?: unknown;
  email?: unknown;
  zone?: unknown;
  palier?: unknown;
  message?: unknown;
}

export interface DemandeValide {
  nom: string;
  telephone: string;
  email: string;
  zone: string | null;
  palier: PalierDemande;
  message: string | null;
}
```

4. Insérer le contrôle **après** celui du téléphone et **avant** celui de la
   zone, pour que l'ordre des refus suive l'ordre du formulaire :

```ts
  // L'adresse est obligatoire depuis le 2026-08-27, et c'est un revirement
  // assumé : `admin-creer-collecteur` explique qu'« attendre une confirmation
  // par courriel bloquerait un collecteur qui n'a pas d'adresse à lui — cas
  // courant sur ce marché ». C'est vrai du collecteur qu'on équipe au comptoir.
  // Ce n'est pas vrai de celui qui remplit ce formulaire-ci : il choisit une
  // offre, il paiera, et sans adresse aucun des trois services demandés ne peut
  // exister. Une adresse créée pour l'occasion suffit.
  const verdictEmail = validerEmail(brut.email);
  if (!verdictEmail.ok) {
    return { ok: false, erreur: verdictEmail.erreur, champ: 'email' };
  }
```

5. Ajouter le champ à la valeur rendue :

```ts
  return {
    ok: true,
    demande: {
      nom,
      telephone,
      email: verdictEmail.email,
      zone: zone || null,
      palier: palierBrut as PalierDemande,
      message: message || null,
    },
  };
```

- [ ] **Étape 8 : lancer, vérifier le succès**

```bash
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/valider-email.test.ts supabase/tests/valider-demande.test.ts
```

Attendu : SUCCÈS. Aucun test existant de `valider-demande` ne doit rester rouge.

- [ ] **Étape 9 : commit**

```bash
git add supabase/functions/_shared/valider-email.ts \
        supabase/functions/_shared/valider-demande.ts \
        supabase/tests/valider-email.test.ts \
        supabase/tests/valider-demande.test.ts
git commit -m "feat(demande): l'adresse electronique devient obligatoire"
```

---

## Tâche 4 — La base accueille l'adresse

**Fichiers :**
- Créer : `supabase/migrations/20260827100000_demandes_email.sql`
- Modifier : `supabase/tests/demandes-ouverture.test.ts`

**Interfaces :**
- Consomme : la borne de 160 caractères posée en tâche 3.
- Produit :
  - colonne `public.demandes_ouverture.email text` (**nullable**)
  - index unique partiel `demandes_email_en_attente`
  - `public.admin_demandes()` rend `email` en plus
  - **nouveau** `public.admin_demande(demande_id uuid) returns jsonb` — lit une
    demande sans la modifier. Rend `null` si elle n'existe pas.

**La colonne est nullable, et c'est délibéré.** Les demandes déjà déposées n'en
portent pas ; un `not null` rétroactif obligerait à leur inventer une adresse.
L'obligation vit à l'entrée, dans la validation ; la colonne enregistre ce qui
est arrivé.

**`admin_demande` existe à cause de l'ordre d'envoi.** L'accord doit lire la
demande *avant* d'inviter et d'envoyer, puisqu'il ne la marque qu'après. Enrichir
le retour d'`admin_traiter_demande` — ce que demandait la spécification — livrerait
ces champs trop tard.

- [ ] **Étape 1 : écrire la migration**

Créer `supabase/migrations/20260827100000_demandes_email.sql` :

```sql
-- L'adresse électronique des demandes d'ouverture.
--
-- ## Le revirement, et pourquoi il est légitime
--
-- `20260823090000` écrivait, en toutes lettres : « Aucun secret, aucune adresse
-- électronique obligatoire : le strict nécessaire pour rappeler quelqu'un à
-- Abidjan, c'est-à-dire un nom et un numéro. » C'était juste tant que la seule
-- suite d'une demande était un appel téléphonique.
--
-- Depuis le 2026-08-27, l'accord d'une demande **ouvre le compte** et envoie une
-- invitation. Sans adresse, ce chemin n'existe pas : il faudrait rappeler,
-- demander l'adresse au téléphone, la ressaisir. Le formulaire la demande donc,
-- et la validation la refuse absente.
--
-- ## La colonne reste nullable
--
-- Les demandes déposées avant ce jour n'en portent pas. Un `not null`
-- rétroactif obligerait à leur inventer une adresse — c'est-à-dire à écrire en
-- base quelque chose que personne n'a saisi. L'obligation vit à l'entrée ; la
-- colonne enregistre ce qui est arrivé.

alter table public.demandes_ouverture
  add column if not exists email text;

alter table public.demandes_ouverture
  drop constraint if exists demandes_email_borne;

-- Jumelle de `demandes_nom_borne` et consorts : la borne est la dernière ligne
-- de défense, celle qui tient même si l'Edge Function change.
alter table public.demandes_ouverture
  add constraint demandes_email_borne
  check (email is null or (length(email) between 6 and 160 and position('@' in email) > 1));

-- Le garde-spam de l'adresse, jumeau de `demandes_telephone_en_attente`.
--
-- Sur `lower(email)` et non sur `email` : `valider-email.ts` normalise déjà en
-- minuscules, mais l'index doit tenir même pour une écriture faite par un autre
-- chemin sous clé de service. Deux protections qui se recouvrent valent mieux
-- qu'une qui dépend de l'autre.
--
-- Partiel, comme son jumeau : une fois la demande traitée, la personne peut en
-- refaire une.
create unique index if not exists demandes_email_en_attente
  on public.demandes_ouverture (lower(email))
  where statut = 'nouvelle' and email is not null;

/**
 * La liste des demandes — redéfinie pour rendre l'adresse.
 *
 * L'écran d'administration l'affiche : c'est elle qui recevra l'invitation, et
 * l'administrateur doit pouvoir la relire avant d'accorder.
 */
create or replace function public.admin_demandes()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'nom', d.nom,
        'telephone', d.telephone,
        'email', d.email,
        'zone', d.zone,
        'palier', d.palier,
        'message', d.message,
        'statut', d.statut,
        'cree_le', d.cree_le,
        'traite_le', d.traite_le
      )
      order by (d.statut = 'nouvelle') desc, d.cree_le desc
    ),
    '[]'::jsonb
  )
  from public.demandes_ouverture d;
$fn$;

-- `create or replace function` rétablit silencieusement `EXECUTE` à `public`.
-- Il faut donc le retirer à chaque redéfinition, et non une fois. L'audit du
-- 2026-08-25 a retrouvé ce défaut ailleurs dans le schéma : il ne se voit pas.
revoke all on function public.admin_demandes() from public;
revoke all on function public.admin_demandes() from anon;
revoke all on function public.admin_demandes() from authenticated;
grant execute on function public.admin_demandes() to service_role;

/**
 * Une demande, lue sans être touchée.
 *
 * Elle existe pour l'ordre d'envoi décidé le 2026-08-27 : l'accord lit la
 * demande, crée le compte, envoie l'invitation, et **ne marque la demande
 * qu'ensuite**. Il lui faut donc nom, téléphone, adresse, zone et palier
 * *avant* d'appeler `admin_traiter_demande`, pas dans sa réponse.
 *
 * Rend `null` — et non une exception — quand la demande n'existe pas :
 * l'appelant traduit ce cas en 404, et une exception l'obligerait à lire un
 * message d'erreur pour distinguer l'absence d'une panne.
 */
create or replace function public.admin_demande(demande_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'id', d.id,
    'nom', d.nom,
    'telephone', d.telephone,
    'email', d.email,
    'zone', d.zone,
    'palier', d.palier,
    'statut', d.statut
  )
  from public.demandes_ouverture d
  where d.id = demande_id;
$fn$;

revoke all on function public.admin_demande(uuid) from public;
revoke all on function public.admin_demande(uuid) from anon;
revoke all on function public.admin_demande(uuid) from authenticated;
grant execute on function public.admin_demande(uuid) to service_role;

comment on function public.admin_demande is
  'Une demande d''ouverture, lue sans modification. Réservée à service_role : le contrôle est_admin() se fait dans l''Edge Function appelante.';

-- Garde-fou, même dispositif que `20260823090000`.
do $garde$
begin
  if has_function_privilege('anon', 'public.admin_demandes()', 'execute')
     or has_function_privilege('authenticated', 'public.admin_demandes()', 'execute') then
    raise exception 'GARDE_FOU : admin_demandes est redevenue exécutable sans clé de service.';
  end if;

  if has_function_privilege('anon', 'public.admin_demande(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.admin_demande(uuid)', 'execute') then
    raise exception 'GARDE_FOU : admin_demande reste exécutable sans clé de service.';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'demandes_email_en_attente'
  ) then
    raise exception 'GARDE_FOU : rien n''empêche une adresse de déposer mille demandes.';
  end if;
end;
$garde$;
```

- [ ] **Étape 2 : écrire les tests**

Ajouter à `supabase/tests/demandes-ouverture.test.ts`, dans le `describe` des
verrous de fonctions, puis en fin de fichier :

```ts
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
```

Étendre aussi le nettoyage de `afterAll`, qui filtre déjà sur `Sonde ${MARQUE}%` :
aucune modification n'est nécessaire, les noms ci-dessus respectent ce préfixe.

- [ ] **Étape 3 : appliquer et lancer**

```bash
npm run db:reset && npm run test:db
```

Attendu : SUCCÈS. La migration s'applique sans lever de `GARDE_FOU`.

- [ ] **Étape 4 : commit**

```bash
git add supabase/migrations/20260827100000_demandes_email.sql \
        supabase/tests/demandes-ouverture.test.ts
git commit -m "feat(demandes): la colonne email, son index et admin_demande"
```

---

## Tâche 5 — Le dépôt public écrit l'adresse et compte les appels

**Fichiers :**
- Modifier : `supabase/functions/demander-ouverture/index.ts`
- Créer : `supabase/tests/demander-ouverture.test.ts`

**Interfaces :**
- Consomme : `empreinteRequete` (tâche 1), `consommer_debit` (tâche 1),
  `validerDemande` enrichi (tâche 3), la colonne `email` (tâche 4).
- Produit : deux refus supplémentaires dans la réponse — `EMAIL_MANQUANT`,
  `EMAIL_INVALIDE`, `EMAIL_TROP_LONG` (400) et `TROP_DE_DEMANDES` (429).

**Les Edge Functions sont servies en local.** `config.toml` porte
`[edge_runtime] enabled = true` : `npx supabase start` les sert à
`${SUPABASE_URL}/functions/v1/<nom>`. Le dépôt ne s'en était pas encore servi
dans ses tests ; à partir d'ici, si.

**La borne s'applique après la validation.** Une requête malformée n'atteint
jamais la base et ne coûte que du calcul ; la borner d'abord ferait payer un
aller-retour en base à chaque saisie ratée d'un visiteur honnête.

- [ ] **Étape 1 : écrire le test**

Créer `supabase/tests/demander-ouverture.test.ts` :

```ts
import { afterAll, describe, expect, it } from 'vitest';

import { admin } from './harnais';

/**
 * La fonction publique de dépôt, appelée pour de vrai.
 *
 * `config.toml` porte `[edge_runtime] enabled = true` : la pile locale sert les
 * Edge Functions. Les tests précédents du dépôt ne couvraient que les modules
 * purs — ce qui laissait hors mesure ce que la fonction fait de leurs verdicts.
 */

const URL_FONCTIONS = `${process.env.SUPABASE_URL}/functions/v1/demander-ouverture`;
const CLE = process.env.SUPABASE_ANON_KEY!;
const MARQUE = crypto.randomUUID().slice(0, 8);

/** Chaque appel prend sa propre IP : la borne est d'une demande par minute, et
    un test qui les partagerait toutes se bornerait lui-même. */
function deposer(corps: unknown, ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`) {
  return fetch(URL_FONCTIONS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: CLE,
      Authorization: `Bearer ${CLE}`,
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(corps),
  });
}

function demande(suffixe: string) {
  return {
    nom: `Sonde ${MARQUE} ${suffixe}`,
    telephone: `+22507${MARQUE}${suffixe}`,
    email: `sonde-${MARQUE}-${suffixe}@example.ci`,
    zone: 'Adjamé',
    palier: 'essai',
  };
}

afterAll(async () => {
  await admin.from('demandes_ouverture').delete().like('nom', `Sonde ${MARQUE}%`);
  await admin.from('debit_public').delete().like('empreinte', 'demander-ouverture:10.0.%');
});

describe('le dépôt', () => {
  it('accepte une demande complète et écrit l’adresse', async () => {
    const reponse = await deposer(demande('a'));
    expect(reponse.status).toBe(201);

    const { data } = await admin
      .from('demandes_ouverture')
      .select('email')
      .eq('nom', `Sonde ${MARQUE} a`)
      .single();
    expect(data?.email).toBe(`sonde-${MARQUE}-a@example.ci`);
  });

  it('ne rend rien de ce qu’il a écrit', async () => {
    // Un formulaire public qui renverrait la ligne écrite devient un moyen de
    // vérifier ce que la table contient déjà.
    const reponse = await deposer(demande('b'));
    const corps = await reponse.json();

    expect(corps).toEqual({ recue: true });
  });

  it('refuse une demande sans adresse', async () => {
    const { email: _, ...sansEmail } = demande('c');
    const reponse = await deposer(sansEmail);

    expect(reponse.status).toBe(400);
    expect(await reponse.json()).toEqual({ erreur: 'EMAIL_MANQUANT', champ: 'email' });
  });

  it('refuse une adresse mal formée', async () => {
    const reponse = await deposer({ ...demande('d'), email: 'mariam' });

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('EMAIL_INVALIDE');
  });
});

describe('la borne de débit', () => {
  it('refuse la seconde demande de la même IP dans la minute', async () => {
    // C'est le manque chiffré par l'audit du 2026-08-25 : sans borne, un script
    // qui fait varier le numéro noie l'écran d'administration.
    const ip = `10.9.9.${Math.floor(Math.random() * 250)}`;

    expect((await deposer(demande('e'), ip)).status).toBe(201);

    const seconde = await deposer(demande('f'), ip);
    expect(seconde.status).toBe(429);
    expect((await seconde.json()).erreur).toBe('TROP_DE_DEMANDES');
  });

  it('laisse passer une autre IP', async () => {
    const ip = `10.9.8.${Math.floor(Math.random() * 250)}`;
    await deposer(demande('g'), ip);

    expect((await deposer(demande('h'), `10.9.7.${Math.floor(Math.random() * 250)}`)).status).toBe(
      201,
    );
  });

  it('ne consomme pas de quota pour une saisie refusée', async () => {
    // La borne s'applique après la validation : un visiteur qui se trompe de
    // format ne doit pas se retrouver enfermé dehors pour une minute.
    const ip = `10.9.6.${Math.floor(Math.random() * 250)}`;
    await deposer({ ...demande('i'), email: 'pas-une-adresse' }, ip);

    expect((await deposer(demande('j'), ip)).status).toBe(201);
  });
});
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

```bash
npm run db:reset && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/demander-ouverture.test.ts
```

Attendu : ÉCHEC. Les tests d'adresse tombent en 400 `EMAIL_MANQUANT` seulement
si la tâche 3 est faite ; ceux de la borne tombent en 201 au lieu de 429.

- [ ] **Étape 3 : brancher la borne dans la fonction**

Dans `supabase/functions/demander-ouverture/index.ts` :

1. Ajouter l'import :

```ts
import { empreinteRequete } from '../_shared/debit.ts';
```

2. Ajouter les deux constantes sous `ORIGINES_AUTORISEES` :

```ts
/**
 * Une demande par minute et par adresse IP.
 *
 * Le chiffre est volontairement bas : personne n'ouvre deux comptes dans la
 * même minute, et un visiteur qui a cliqué deux fois voit le 429 comme une
 * confirmation que sa demande est passée. Ce qu'il ferme, c'est le script qui
 * fait varier le numéro — manque chiffré par l'audit du 2026-08-25, où
 * `grep -cin "ratelimit\|captcha\|turnstile"` rendait 0 sur ce fichier.
 */
const PLAFOND = 1;
const FENETRE_SECONDES = 60;
```

3. Après la validation et la création du `client`, avant l'insertion :

```ts
  // La borne vient **après** la validation : une saisie malformée n'atteint pas
  // la base et ne coûte que du calcul, et un visiteur qui se trompe de format
  // ne doit pas se retrouver enfermé dehors pour une minute.
  const { data: dansLePlafond, error: erreurDebit } = await client.rpc('consommer_debit', {
    cle: empreinteRequete('demander-ouverture', requete.headers),
    plafond: PLAFOND,
    fenetre_secondes: FENETRE_SECONDES,
  });

  if (erreurDebit) {
    // Le compteur est en panne. On refuse plutôt que d'ouvrir : cette fonction
    // est la seule écriture publique du produit, et une borne qui se désactive
    // toute seule sous la panne est une borne qui ne borne rien le jour où on
    // en a besoin.
    console.error('consommer_debit a échoué :', erreurDebit.message);
    return reponse({ erreur: 'ENREGISTREMENT_IMPOSSIBLE' }, 500, requete);
  }

  if (dansLePlafond !== true) {
    return reponse({ erreur: 'TROP_DE_DEMANDES' }, 429, requete);
  }
```

Aucune autre modification : `verdict.demande` porte déjà `email` depuis la tâche
3, et l'`insert` l'écrit sans changement.

4. Compléter le commentaire d'en-tête, sous la puce « Elle borne avant
   d'écrire » :

```
 * * **Elle compte les appels par IP** depuis le 2026-08-27, par
 *   `consommer_debit`. Une demande par minute. Ce n'est pas un CAPTCHA — un
 *   réseau d'adresses passe encore — mais c'est ce qui ferme le cas réel : un
 *   script sur une machine qui fait varier le numéro.
```

- [ ] **Étape 4 : lancer, vérifier le succès**

```bash
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/demander-ouverture.test.ts
```

Attendu : SUCCÈS, 7 tests.

- [ ] **Étape 5 : commit**

```bash
git add supabase/functions/demander-ouverture/index.ts \
        supabase/tests/demander-ouverture.test.ts
git commit -m "feat(demander-ouverture): l'adresse est ecrite, les appels sont comptes"
```

---

## Tâche 6 — L'accord ouvre le compte et invite, dans cet ordre

**Fichiers :**
- Modifier : `supabase/functions/admin-demandes/index.ts`
- Créer : `supabase/tests/accord-demande.test.ts`

**Interfaces :**
- Consomme : `passerelleDepuis` / `envoyer` (tâche 2), `composer` (tâche 2),
  `admin_demande` (tâche 4).
- Produit : quatre refus nommés dans la réponse du `POST` —
  `COURRIEL_NON_CONFIGURE` (500), `EMAIL_ABSENT` (400), `COMPTE_NON_CREE` (500),
  `COURRIEL_NON_PARTI` (502).

**C'est la tâche centrale du lot, et l'ordre en est le cœur.** Marquer la
demande traitée avant l'envoi produirait, à la première panne de la passerelle,
une demande classée « ouverte » dont le prospect n'a jamais rien reçu —
invisible dans l'écran d'administration, découverte des semaines plus tard par
un appel.

L'ordre livré va plus loin que la spécification : **la passerelle est vérifiée
avant même de créer le compte**. Une configuration absente ne laisse alors
strictement aucune trace — ni compte orphelin, ni demande à moitié traitée.

- [ ] **Étape 1 : écrire le test**

Créer `supabase/tests/accord-demande.test.ts` :

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * L'accord d'une demande d'ouverture.
 *
 * ## Ce que ces tests gardent
 *
 * **L'ordre.** La demande ne passe à « ouverte » qu'après un envoi réussi. Une
 * demande marquée traitée dont le prospect n'a rien reçu est le pire des états
 * possibles : elle disparaît de l'écran d'administration, et personne ne
 * saura jamais qu'il faut la reprendre.
 *
 * ## Ce que ces tests ne peuvent pas garder
 *
 * Le chemin nominal — courriel réellement parti — demande une clé de
 * fournisseur et un envoi réel. La pile locale n'en a pas, et **on ne feint
 * rien** : c'est la règle portée par l'en-tête de `passerelle-sms.ts`. Ce que
 * ces tests mesurent, c'est que sans passerelle configurée, **rien n'est créé
 * et rien n'est marqué**. Le reste figure dans la vérification manuelle du
 * plan, avec la procédure exacte.
 */

const URL_FONCTION = `${process.env.SUPABASE_URL}/functions/v1/admin-demandes`;
const MARQUE = crypto.randomUUID().slice(0, 8);

let patron: CollecteurTest;
let jeton: string;

beforeAll(async () => {
  patron = await creerCollecteur(`Patron ${MARQUE}`, `+225050${MARQUE}`);
  await admin.from('admins').insert({ user_id: patron.id });

  const { data } = await patron.client.auth.getSession();
  jeton = data.session!.access_token;
});

afterAll(async () => {
  await admin.from('demandes_ouverture').delete().like('nom', `Sonde ${MARQUE}%`);
  await admin.from('admins').delete().eq('user_id', patron.id);
  await nettoyer();
});

function traiter(id: string, statut: string) {
  return fetch(URL_FONCTION, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${jeton}`,
    },
    body: JSON.stringify({ id, statut }),
  });
}

async function deposer(suffixe: string, email: string | null): Promise<string> {
  const { data, error } = await admin
    .from('demandes_ouverture')
    .insert({
      nom: `Sonde ${MARQUE} ${suffixe}`,
      telephone: `+22508${MARQUE}${suffixe}`,
      email,
      palier: 'pro',
      zone: 'Adjamé',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function statutDe(id: string): Promise<string> {
  const { data } = await admin
    .from('demandes_ouverture')
    .select('statut')
    .eq('id', id)
    .single();
  return data!.statut;
}

describe('sans passerelle configurée', () => {
  it('refuse d’accorder, et ne marque rien', async () => {
    // L'invariant du lot. Si ce test tombe, une panne de courriel produit des
    // prospects perdus en silence.
    const id = await deposer('a', `sonde-${MARQUE}-a@example.ci`);

    const reponse = await traiter(id, 'ouverte');

    expect(reponse.status).toBe(500);
    expect((await reponse.json()).erreur).toBe('COURRIEL_NON_CONFIGURE');
    expect(await statutDe(id)).toBe('nouvelle');
  });

  it('ne crée aucun compte', async () => {
    // La passerelle est vérifiée **avant** `generateLink`. Sans cela, une
    // configuration absente laisserait derrière elle un compte orphelin par
    // tentative — et le collecteur créé par le déclencheur avec.
    const email = `sonde-${MARQUE}-b@example.ci`;
    const id = await deposer('b', email);

    await traiter(id, 'ouverte');

    const { data } = await admin.auth.admin.listUsers();
    expect(data.users.some((u) => u.email === email)).toBe(false);
  });

  it('laisse passer « contactée » et « refusée »', async () => {
    // Ces deux statuts n'envoient rien et ne doivent pas dépendre du courriel :
    // sinon l'écran d'administration cesserait de fonctionner entièrement le
    // jour où la clé expire.
    const id = await deposer('c', `sonde-${MARQUE}-c@example.ci`);

    expect((await traiter(id, 'contactee')).status).toBe(200);
    expect(await statutDe(id)).toBe('contactee');

    expect((await traiter(id, 'refusee')).status).toBe(200);
    expect(await statutDe(id)).toBe('refusee');
  });
});

describe('les refus nommés', () => {
  it('refuse d’accorder une demande sans adresse', async () => {
    // Les demandes déposées avant le 2026-08-27 n'en portent pas. Elles doivent
    // le dire, et rester en l'état pour qu'on puisse rappeler.
    const id = await deposer('d', null);

    const reponse = await traiter(id, 'ouverte');

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('EMAIL_ABSENT');
    expect(await statutDe(id)).toBe('nouvelle');
  });

  it('rend 404 pour une demande inexistante', async () => {
    const reponse = await traiter(crypto.randomUUID(), 'ouverte');
    expect(reponse.status).toBe(404);
    expect((await reponse.json()).erreur).toBe('DEMANDE_INTROUVABLE');
  });

  it('refuse un statut inconnu', async () => {
    const id = await deposer('e', `sonde-${MARQUE}-e@example.ci`);
    const reponse = await traiter(id, 'archivee');

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('STATUT_INVALIDE');
  });
});

describe('le portillon', () => {
  it('refuse un collecteur ordinaire', async () => {
    // Le portillon existant ne doit pas s'être relâché en gagnant ce chemin :
    // ce que garde cette fonction, c'est une liste de prospects de GTCS.
    const ordinaire = await creerCollecteur(`Ordinaire ${MARQUE}`, `+225051${MARQUE}`);
    const { data } = await ordinaire.client.auth.getSession();

    const reponse = await fetch(URL_FONCTION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${data.session!.access_token}`,
      },
      body: JSON.stringify({ id: crypto.randomUUID(), statut: 'ouverte' }),
    });

    expect(reponse.status).toBe(403);
  });

  it('refuse une requête sans jeton', async () => {
    const reponse = await fetch(URL_FONCTION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_ANON_KEY! },
      body: JSON.stringify({ id: crypto.randomUUID(), statut: 'ouverte' }),
    });

    expect(reponse.status).toBe(401);
  });
});
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

```bash
npm run db:reset && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/accord-demande.test.ts
```

Attendu : ÉCHEC. `sans passerelle configurée > refuse d'accorder` rend 200 et un
statut `ouverte` — c'est le comportement actuel.

- [ ] **Étape 3 : écrire la fonction**

Dans `supabase/functions/admin-demandes/index.ts` :

1. Ajouter les imports :

```ts
import { composer } from '../_shared/message-acces.ts';
import { envoyer, passerelleDepuis, type Identifiants } from '../_shared/passerelle-courriel.ts';
```

2. Ajouter la constante sous `STATUTS` :

```ts
/**
 * Où atterrit le prospect après avoir cliqué.
 *
 * Cette adresse doit figurer dans `additional_redirect_urls` du projet, sinon
 * GoTrue **renvoie silencieusement sur `site_url`** et le lien mène nulle part.
 * Le symptôme n'est pas une erreur : c'est un écran de connexion ordinaire, et
 * le prospect croit que son compte n'existe pas.
 */
const REDIRECTION =
  Deno.env.get('REDIRECTION_MOT_DE_PASSE') ?? 'https://app.kolek.cash/nouveau-mot-de-passe';
```

3. Ajouter les deux fonctions, avant `Deno.serve` :

```ts
interface DemandeLue {
  id: string;
  nom: string;
  telephone: string;
  email: string | null;
  zone: string | null;
  palier: string;
  statut: string;
}

type Acces =
  | { ok: true; lien: string; collecteurId: string; reprise: boolean }
  | { ok: false; erreur: string; statut: number };

/**
 * Crée le compte et rend le lien, sans rien envoyer.
 *
 * `generateLink` fait exactement ce qu'il nous faut : il crée l'utilisateur et
 * rend l'adresse à cliquer, mais laisse l'envoi à l'appelant. Le déclencheur
 * `creer_collecteur_apres_signup` compose ensuite la ligne `collecteurs` en
 * lisant `nom` et `telephone` dans les métadonnées — le chemin déjà emprunté
 * par `admin-creer-collecteur`.
 *
 * ## La retombée sur `recovery` n'est pas un raffinement
 *
 * `type: 'invite'` refuse une adresse **déjà confirmée** : GoTrue répond
 * « Email address already registered by another user ». Une relance après que
 * le prospect a cliqué échouerait donc, exactement au moment où l'on veut
 * relancer. `type: 'recovery'`, lui, vaut pour un compte existant, et mène au
 * même écran. Les deux chemins sont donc gardés, et le texte du courriel suit
 * — « ton compte est ouvert » pour l'un, « choisis un nouveau mot de passe »
 * pour l'autre.
 */
async function lienDacces(
  clientService: ReturnType<typeof createClient>,
  demande: DemandeLue & { email: string },
): Promise<Acces> {
  const invitation = await clientService.auth.admin.generateLink({
    type: 'invite',
    email: demande.email,
    options: {
      data: { nom: demande.nom, telephone: demande.telephone },
      redirectTo: REDIRECTION,
    },
  });

  if (!invitation.error && invitation.data.user) {
    return {
      ok: true,
      lien: invitation.data.properties!.action_link,
      collecteurId: invitation.data.user.id,
      reprise: false,
    };
  }

  const message = invitation.error?.message ?? 'lien impossible';
  if (!/already|exist|registered/i.test(message)) {
    console.error('generateLink invite a échoué :', message);
    return { ok: false, erreur: 'COMPTE_NON_CREE', statut: 500 };
  }

  const reprise = await clientService.auth.admin.generateLink({
    type: 'recovery',
    email: demande.email,
    options: { redirectTo: REDIRECTION },
  });

  if (reprise.error || !reprise.data.user) {
    console.error('generateLink recovery a échoué :', reprise.error?.message);
    return { ok: false, erreur: 'COMPTE_NON_CREE', statut: 500 };
  }

  return {
    ok: true,
    lien: reprise.data.properties!.action_link,
    collecteurId: reprise.data.user.id,
    reprise: true,
  };
}

/**
 * L'accord d'une demande : compte, courriel, puis marquage.
 *
 * **L'ordre est le dessin.** Marquer avant d'envoyer produirait, à la première
 * panne de passerelle, une demande classée « ouverte » dont le prospect n'a
 * jamais rien reçu — invisible dans l'écran, découverte par un appel des
 * semaines plus tard. En marquant après, un échec laisse la demande en l'état
 * et rend un code distinct : l'administrateur lit « compte créé, courriel non
 * parti » et relance.
 *
 * La passerelle est vérifiée **avant même** de créer le compte. Une
 * configuration absente ne laisse alors aucune trace du tout : ni compte
 * orphelin, ni ligne `collecteurs` sans propriétaire.
 */
async function accorder(
  clientService: ReturnType<typeof createClient>,
  passerelle: Identifiants,
  demandeId: string,
  administrateur: string,
  requete: Request,
): Promise<Response> {
  const { data, error } = await clientService.rpc('admin_demande', { demande_id: demandeId });
  if (error) {
    console.error('admin_demande a échoué :', error.message);
    return reponse({ erreur: 'LECTURE_IMPOSSIBLE' }, 500, requete);
  }

  const demande = data as DemandeLue | null;
  if (!demande) return reponse({ erreur: 'DEMANDE_INTROUVABLE' }, 404, requete);
  if (!demande.email) {
    // Les demandes déposées avant le 2026-08-27 n'en portent pas. Le dire, et
    // laisser la demande en l'état : GTCS rappelle et demande l'adresse.
    return reponse({ erreur: 'EMAIL_ABSENT' }, 400, requete);
  }

  const acces = await lienDacces(clientService, { ...demande, email: demande.email });
  if (!acces.ok) return reponse({ erreur: acces.erreur }, acces.statut, requete);

  // Palier et zone ne font pas partie des métadonnées d'inscription : on les
  // pose ensuite, comme le fait déjà `admin-creer-collecteur`.
  const complement: Record<string, string> = { palier: demande.palier };
  if (demande.zone) complement.zone = demande.zone;
  const { error: erreurComplement } = await clientService
    .from('collecteurs')
    .update(complement)
    .eq('id', acces.collecteurId);
  if (erreurComplement) {
    // Le compte fonctionne ; seuls la zone et le palier manquent. On continue :
    // interrompre ici priverait le prospect de son courriel pour une colonne.
    console.error('complément collecteur :', erreurComplement.message);
  }

  const { sujet, corps } = composer(
    acces.reprise
      ? { type: 'reinitialisation', lien: acces.lien }
      : { type: 'invitation', nom: demande.nom, lien: acces.lien },
  );

  const issue = await envoyer(passerelle, demande.email, sujet, corps);
  if (!issue.ok) {
    console.error('invitation non partie :', issue.raison);
    // La demande reste intacte. C'est tout l'objet de l'ordre choisi.
    return reponse(
      { erreur: 'COURRIEL_NON_PARTI', raison: issue.raison, collecteurId: acces.collecteurId },
      502,
      requete,
    );
  }

  const { data: marquee, error: erreurMarquage } = await clientService.rpc(
    'admin_traiter_demande',
    { demande_id: demandeId, nouveau_statut: 'ouverte', administrateur },
  );

  if (erreurMarquage) {
    // Le prospect a son courriel ; seule la trace administrative manque. Le
    // dire tel quel : annoncer un échec ferait recommencer l'accord, et le
    // prospect recevrait un second message.
    console.error('admin_traiter_demande a échoué après envoi :', erreurMarquage.message);
    return reponse(
      { erreur: 'MARQUAGE_INCOMPLET', collecteurId: acces.collecteurId },
      207,
      requete,
    );
  }

  return reponse({ ...(marquee as object), collecteurId: acces.collecteurId }, 200, requete);
}
```

4. Dans le corps de `Deno.serve`, remplacer le bloc final — celui qui appelle
   `admin_traiter_demande` — par le branchement :

```ts
  if (statut === 'ouverte') {
    // La passerelle d'abord : sans elle, rien ne doit être créé ni marqué.
    const passerelle = passerelleDepuis(Deno.env.toObject());
    if (!passerelle) {
      console.error('COURRIEL_FOURNISSEUR / COURRIEL_CLE / COURRIEL_EXPEDITEUR absents.');
      return reponse({ erreur: 'COURRIEL_NON_CONFIGURE' }, 500, requete);
    }
    return await accorder(clientService, passerelle, id, administrateur, requete);
  }

  const { data, error } = await clientService.rpc('admin_traiter_demande', {
    demande_id: id,
    nouveau_statut: statut,
    administrateur,
  });

  if (error) {
    if (/DEMANDE_INTROUVABLE/.test(error.message)) {
      return reponse({ erreur: 'DEMANDE_INTROUVABLE' }, 404, requete);
    }
    if (/STATUT_INVALIDE/.test(error.message)) {
      return reponse({ erreur: 'STATUT_INVALIDE' }, 400, requete);
    }
    console.error('admin_traiter_demande a échoué :', error.message);
    return reponse({ erreur: 'MISE_A_JOUR_IMPOSSIBLE' }, 500, requete);
  }

  return reponse(data, 200, requete);
```

5. Compléter le commentaire d'en-tête du fichier :

```
 * ## Depuis le 2026-08-27, accorder ouvre le compte
 *
 * `POST { statut: 'ouverte' }` ne se contente plus de changer une colonne : il
 * crée l'utilisateur, envoie l'invitation, **et ne marque la demande
 * qu'ensuite**. L'ordre est délibéré et il est gardé par
 * `supabase/tests/accord-demande.test.ts` : marquer avant d'envoyer produirait,
 * à la première panne, une demande classée traitée dont le prospect n'a rien
 * reçu.
 *
 * Les trois autres statuts — `contactee`, `refusee` — n'envoient rien et
 * n'appellent pas la passerelle. L'écran d'administration continue donc de
 * fonctionner entièrement le jour où la clé du fournisseur expire.
```

- [ ] **Étape 4 : ajouter les messages côté administration**

Dans `apps/admin/src/demandes.ts`, ajouter au dictionnaire `MESSAGES` :

```ts
  COURRIEL_NON_CONFIGURE:
    'Le service de courriel n’est pas configuré. Rien n’a été créé — préviens GTCS.',
  EMAIL_ABSENT:
    'Cette demande a été déposée sans adresse électronique. Rappelle le prospect pour l’obtenir.',
  COMPTE_NON_CREE: 'Le compte n’a pas pu être créé. Réessaie dans un instant.',
  COURRIEL_NON_PARTI:
    'Le compte est créé, mais le courriel n’est pas parti. La demande reste ouverte : réessaie.',
  MARQUAGE_INCOMPLET:
    'Le prospect a reçu son courriel, mais la demande n’a pas pu être classée. Ne recommence pas : préviens GTCS.',
  LECTURE_IMPOSSIBLE: 'La base n’a pas pu rendre les demandes.',
```

Ajouter aussi `email: string | null;` à l'interface `Demande` du même fichier.

- [ ] **Étape 5 : lancer, vérifier le succès**

```bash
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/accord-demande.test.ts
```

Attendu : SUCCÈS, 8 tests.

- [ ] **Étape 6 : commit**

```bash
git add supabase/functions/admin-demandes/index.ts \
        supabase/tests/accord-demande.test.ts \
        apps/admin/src/demandes.ts
git commit -m "feat(accord): ouvrir le compte et inviter, puis seulement marquer"
```

---

## Tâche 7 — Le mot de passe oublié, côté serveur

**Fichiers :**
- Créer : `supabase/functions/mot-de-passe-oublie/index.ts`
- Créer : `supabase/tests/mot-de-passe-oublie.test.ts`

**Interfaces :**
- Consomme : `validerEmail` (tâche 3), `empreinteRequete` / `consommer_debit`
  (tâche 1), `passerelleDepuis` / `envoyer` / `composer` (tâche 2).
- Produit : une deuxième fonction publique. Réponse nominale exacte :
  `200 { "envoye": true }`.

**L'ordre des contrôles est une décision de sécurité.** Forme de l'adresse,
puis passerelle, puis borne, puis envoi. La passerelle **avant** la borne : sinon
une réponse rendrait 500 quand la configuration manque et 200 quand la borne
mord, et l'écart se lirait. Ici, une même configuration produit toujours la même
réponse.

- [ ] **Étape 1 : écrire le test**

Créer `supabase/tests/mot-de-passe-oublie.test.ts` :

```ts
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
 * L'assertion est écrite sur le **texte brut** de la réponse, pas sur un objet
 * relu : deux corps qui diffèrent d'un champ ou d'un ordre de clés seraient
 * aussi lisibles qu'un message explicite.
 */

const URL_FONCTION = `${process.env.SUPABASE_URL}/functions/v1/mot-de-passe-oublie`;
const MARQUE = crypto.randomUUID().slice(0, 8);

let connu: CollecteurTest;

beforeAll(async () => {
  connu = await creerCollecteur(`Oubli ${MARQUE}`, `+225052${MARQUE}`);
});

afterAll(async () => {
  await admin.from('debit_public').delete().like('empreinte', 'mot-de-passe-oublie:10.1.%');
  await nettoyer();
});

function demander(email: string, ip = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`) {
  return fetch(URL_FONCTION, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY!}`,
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
    // Sinon la borne elle-même deviendrait un signal : trois essais sur une
    // adresse, et la quatrième réponse dirait si les trois premières ont
    // envoyé quelque chose.
    const ip = `10.1.9.${Math.floor(Math.random() * 250)}`;
    const premiere = await demander(connu.email, ip);
    const texte = await premiere.text();

    for (let i = 0; i < 4; i += 1) {
      const suivante = await demander(connu.email, ip);
      expect(suivante.status).toBe(premiere.status);
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
        apikey: process.env.SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY!}`,
      },
      body: JSON.stringify({}),
    });

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('EMAIL_MANQUANT');
  });

  it('refuse une méthode autre que POST', async () => {
    const reponse = await fetch(URL_FONCTION, {
      method: 'GET',
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY!}`,
      },
    });

    expect(reponse.status).toBe(405);
  });

  it('refuse un corps illisible', async () => {
    const reponse = await fetch(URL_FONCTION, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY!}`,
      },
      body: 'pas du json',
    });

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('CORPS_ILLISIBLE');
  });
});

describe('le préalable CORS', () => {
  it('accorde l’origine de l’application collecteur', async () => {
    const reponse = await fetch(URL_FONCTION, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Headers': 'authorization, content-type, apikey',
      },
    });

    expect(reponse.status).toBe(204);
    expect(reponse.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });

  it('n’accorde pas une origine inconnue', async () => {
    const reponse = await fetch(URL_FONCTION, {
      method: 'OPTIONS',
      headers: { Origin: 'https://ailleurs.example' },
    });

    expect(reponse.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

```bash
npm run db:reset && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/mot-de-passe-oublie.test.ts
```

Attendu : ÉCHEC — la fonction n'existe pas, toutes les requêtes rendent 404.

- [ ] **Étape 3 : écrire la fonction**

Créer `supabase/functions/mot-de-passe-oublie/index.ts` :

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_COLLECTEUR, entetesCors, listerOrigines } from '../_shared/cors.ts';
import { empreinteRequete } from '../_shared/debit.ts';
import { composer } from '../_shared/message-acces.ts';
import { envoyer, passerelleDepuis } from '../_shared/passerelle-courriel.ts';
import { validerEmail } from '../_shared/valider-email.ts';

/**
 * Le mot de passe oublié.
 *
 * ## C'est la deuxième fonction publique du produit
 *
 * `demander-ouverture` était la seule. Celle-ci accepte aussi une requête sans
 * session — par définition, quelqu'un qui a perdu son mot de passe ne peut pas
 * s'authentifier. Elle est donc écrite comme une surface exposée.
 *
 * ## La règle qui gouverne tout ce fichier
 *
 * **La réponse ne dépend jamais de l'existence du compte.** Même statut, même
 * corps, qu'une adresse soit connue, inconnue, ou que la borne ait mordu.
 *
 * L'audit du 2026-08-25 a mesuré que Kolek ne permet pas d'énumérer ses
 * comptes : un compte inexistant et un mot de passe faux rendent le même
 * `invalid_credentials`. Une porte qui distinguerait ici « adresse inconnue »
 * de « courriel envoyé » serait un annuaire des collecteurs de GTCS,
 * interrogeable à la seconde — et il n'y a pas de moitié de fuite.
 *
 * Conséquences assumées, dans l'ordre où elles se présentent :
 *
 * * **Un échec d'envoi rend quand même la réponse nominale.** Il est
 *   journalisé, et le collecteur peut redemander. Perdre un courriel est
 *   réparable ; livrer la liste des comptes ne l'est pas.
 * * **La borne rend la réponse nominale**, pas un 429. Sinon la borne
 *   deviendrait elle-même le signal.
 * * **La passerelle est vérifiée avant la borne.** Dans l'autre ordre, une
 *   configuration absente rendrait 500 aux premiers appels et la réponse
 *   nominale au quatrième, et l'écart se lirait.
 *
 * Une seule chose est refusée franchement : une adresse **mal formée**. La
 * forme est visible du client, elle ne renseigne sur aucun compte, et le
 * silence ferait chercher longtemps quelqu'un qui a fait une faute de frappe.
 */

const ORIGINES_AUTORISEES = listerOrigines(
  Deno.env.get('ORIGINES_COLLECTEUR'),
  ORIGINES_COLLECTEUR,
);

/** Trois par quart d'heure et par IP. Assez pour celui qui n'a pas reçu et
    réessaie ; trop peu pour balayer un annuaire. */
const PLAFOND = 3;
const FENETRE_SECONDES = 900;

const REDIRECTION =
  Deno.env.get('REDIRECTION_MOT_DE_PASSE') ?? 'https://app.kolek.cash/nouveau-mot-de-passe';

/** La réponse nominale, en un seul endroit. Deux littéraux finiraient par
    diverger d'un espace, et cet espace serait la fuite. */
const NOMINALE = { envoye: true };

function entetesPour(requete: Request): Record<string, string> {
  return entetesCors({
    origine: requete.headers.get('Origin'),
    entetesDemandes: requete.headers.get('Access-Control-Request-Headers'),
    origines: ORIGINES_AUTORISEES,
  });
}

function reponse(corps: unknown, statut: number, requete: Request): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: entetesPour(requete) });
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesPour(requete) });
  }
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }

  let brut: { email?: unknown };
  try {
    brut = await requete.json();
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  const verdict = validerEmail(brut?.email);
  if (!verdict.ok) return reponse({ erreur: verdict.erreur }, 400, requete);

  const url = Deno.env.get('SUPABASE_URL');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cleService) {
    console.error('Configuration incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  // Avant la borne : voir l'en-tête. Une configuration absente doit produire la
  // même réponse à tous les appels, bornés ou non.
  const passerelle = passerelleDepuis(Deno.env.toObject());
  if (!passerelle) {
    console.error('COURRIEL_FOURNISSEUR / COURRIEL_CLE / COURRIEL_EXPEDITEUR absents.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  const client = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: dansLePlafond } = await client.rpc('consommer_debit', {
    cle: empreinteRequete('mot-de-passe-oublie', requete.headers),
    plafond: PLAFOND,
    fenetre_secondes: FENETRE_SECONDES,
  });

  // Au-delà : la réponse nominale, sans rien envoyer. Un 429 dirait à
  // l'attaquant qu'il a atteint la borne, donc que les appels précédents ont
  // compté.
  if (dansLePlafond !== true) return reponse(NOMINALE, 200, requete);

  // `generateLink` refuse une adresse inconnue. On s'en sert comme d'une
  // recherche : il n'y a donc **aucun** appel qui liste les comptes, et rien
  // dans ce fichier ne peut décider de répondre différemment selon le résultat.
  const { data, error } = await client.auth.admin.generateLink({
    type: 'recovery',
    email: verdict.email,
    options: { redirectTo: REDIRECTION },
  });

  if (error || !data.properties) {
    // Adresse inconnue, le plus souvent. Journalisé au niveau `info` : ce n'est
    // pas un incident, et le noter en erreur ferait du bruit à chaque faute de
    // frappe.
    console.info('lien de réinitialisation non engendré :', error?.message ?? 'sans propriétés');
    return reponse(NOMINALE, 200, requete);
  }

  const { sujet, corps } = composer({ type: 'reinitialisation', lien: data.properties.action_link });
  const issue = await envoyer(passerelle, verdict.email, sujet, corps);

  if (!issue.ok) {
    // On journalise et on rend la réponse nominale. Le collecteur redemandera ;
    // c'est réparable. Distinguer ce cas ne le serait pas.
    console.error('courriel de réinitialisation non parti :', issue.raison);
  }

  return reponse(NOMINALE, 200, requete);
});
```

- [ ] **Étape 4 : lancer, vérifier le succès**

```bash
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/mot-de-passe-oublie.test.ts
```

Attendu : SUCCÈS, 8 tests.

> **Ce que ce succès prouve, et ce qu'il ne prouve pas.** Sans clé de
> fournisseur, la pile locale rend `500 CONFIGURATION` à tous les appels — et
> l'égalité connue/inconnue est donc vérifiée sur ce chemin. Le chemin
> configuré est couvert par la vérification manuelle en fin de plan, qui refait
> la même comparaison sur le projet distant.

- [ ] **Étape 5 : commit**

```bash
git add supabase/functions/mot-de-passe-oublie/index.ts \
        supabase/tests/mot-de-passe-oublie.test.ts
git commit -m "feat(mot-de-passe-oublie): une porte publique qui n'enumere rien"
```

---

## Tâche 8 — Le champ sur la vitrine

**Fichiers :**
- Modifier : `apps/site/src/vitrine/demande.ts`
- Modifier : `apps/site/src/vitrine/Inscription.tsx`
- Modifier : `apps/site/package.json`
- Créer : `apps/site/vitest.config.ts`
- Créer : `apps/site/src/vitrine/Inscription.test.tsx`

**Interfaces :**
- Consomme : les trois refus nommés en tâche 3 (`EMAIL_MANQUANT`,
  `EMAIL_INVALIDE`, `EMAIL_TROP_LONG`).
- Produit : `interface Demande` gagne `email: string`.

**La vitrine n'avait pas de suite de tests.** `npm test` la saute — `--workspaces
--if-present`, et le script `test` manque. Le harnais est ajouté ici plutôt que
dans une tâche à part parce que rien d'autre n'en avait besoin, et parce qu'un
harnais sans test à faire tourner est une dépendance qu'on installe pour rien.

**Une phrase du formulaire devient fausse.** « Nom, numéro et zone uniquement »
est écrit sous le bouton d'envoi, et son commentaire dit pourquoi : « c'est ce
que le visiteur a le droit de savoir ». La laisser telle quelle transformerait
une promesse tenue en mensonge.

- [ ] **Étape 1 : installer le harnais de test**

```bash
npm install -D -w @kolek/site vitest@^4.1.10 jsdom@^30.0.1 @testing-library/react@^16.3.2
```

Puis ajouter le script dans `apps/site/package.json`, sous `"preview"` :

```json
    "test": "vitest run"
```

Créer `apps/site/vitest.config.ts` :

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Même gabarit que `apps/admin/vitest.config.ts` et `packages/ui/vitest.config.ts` :
// un seul modèle de configuration dans le dépôt, pour que celui qui ouvre l'un
// reconnaisse l'autre.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Même valeur et même raison que `packages/ui/vitest.config.ts`, qui la
    // porte en toutes lettres.
    testTimeout: 20000,
  },
});
```

- [ ] **Étape 2 : écrire le test**

Créer `apps/site/src/vitrine/Inscription.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Inscription } from './Inscription';

// `globals` n'est pas activé : sans cet appel, chaque rendu s'ajoute au
// précédent et les requêtes trouvent deux champs du même nom.
afterEach(cleanup);

// La vitrine anime son entrée avec GSAP, qui mesure des éléments que jsdom ne
// dispose pas. L'animation n'est pas ce qu'on teste ici.
vi.mock('./animation', () => ({
  entree: vi.fn(),
  useAnimations: () => ({ current: null }),
}));

describe('le formulaire d’ouverture', () => {
  it('demande une adresse électronique', () => {
    // Le manque du 2026-08-27 : la demande arrivait sur le serveur sans aucun
    // moyen d'ouvrir le compte autrement qu'en rappelant.
    render(<Inscription />);

    const champ = screen.getByLabelText(/adresse e-mail/i) as HTMLInputElement;
    expect(champ.type).toBe('email');
    expect(champ.required).toBe(true);
  });

  it('garde le nom et le numéro obligatoires', () => {
    render(<Inscription />);

    expect((screen.getByLabelText(/nom complet/i) as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText(/ton numéro/i) as HTMLInputElement).required).toBe(true);
  });

  it('laisse la zone et le message facultatifs', () => {
    render(<Inscription />);

    expect((screen.getByLabelText(/zone de collecte/i) as HTMLInputElement).required).toBe(false);
    expect((screen.getByLabelText(/un mot sur ton activité/i) as HTMLTextAreaElement).required).toBe(
      false,
    );
  });

  it('ne promet plus que seuls le nom, le numéro et la zone partent', () => {
    // La phrase sous le bouton disait « Nom, numéro et zone uniquement ». Elle
    // est devenue fausse le jour où le champ e-mail est apparu, et une promesse
    // fausse sur une page qui collecte des données personnelles est pire qu'une
    // promesse absente.
    render(<Inscription />);

    expect(screen.queryByText(/nom, numéro et zone uniquement/i)).toBeNull();
    expect(screen.getByText(/aucun mot de passe/i)).toBeTruthy();
  });
});
```

- [ ] **Étape 3 : lancer, vérifier l'échec**

```bash
cd apps/site && npx vitest run src/vitrine/Inscription.test.tsx
```

Attendu : ÉCHEC — `Unable to find a label with the text of: /adresse e-mail/i`.

- [ ] **Étape 4 : ajouter le champ**

Dans `apps/site/src/vitrine/Inscription.tsx` :

1. Ajouter l'état, sous `telephone` :

```tsx
  const [email, setEmail] = useState('');
```

2. Le passer à l'envoi :

```tsx
    const resultat = await envoyerDemande({ nom, telephone, email, zone, palier, message });
```

3. Insérer le champ **après** le bloc du numéro et avant celui de la zone :

```tsx
              <div className="mb-4">
                <Etiquette pour="email">Ton adresse e-mail</Etiquette>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={160}
                  autoComplete="email"
                  placeholder="mariam@exemple.ci"
                  className={CHAMP_SOMBRE}
                />
                {/* Dire à quoi elle sert au moment où on la demande. Un
                    formulaire qui réclame une adresse sans expliquer pourquoi
                    fait hésiter, et l'hésitation coûte des demandes. */}
                <p className="mt-1.5 font-body text-xs text-white/30">
                  C’est là que tu recevras ton accès quand GTCS aura ouvert ton compte.
                </p>
              </div>
```

4. Corriger la phrase sous le bouton, qui est devenue fausse :

```tsx
              {/* La seule donnée qui part est celle de ce formulaire. Le dire
                  sur une page qui demande un numéro et une adresse n'est pas du
                  décor : c'est ce que le visiteur a le droit de savoir. La
                  phrase a été corrigée le 2026-08-27, quand le champ e-mail est
                  apparu — une promesse devenue fausse est pire qu'une promesse
                  absente. */}
              <p className="mt-4 text-center font-body text-xs text-white/30">
                Nom, numéro, adresse e-mail et zone. Aucun mot de passe, aucun paiement à cette
                étape.
              </p>
```

5. Compléter l'écran de confirmation, qui ne parle que du téléphone :

```tsx
            <p className="mb-6 font-body text-base leading-relaxed text-white/60">
              GTCS te rappelle sur le <strong className="text-white">{telephone}</strong> pour
              ouvrir ton compte et te montrer l’application. Ton accès partira ensuite sur{' '}
              <strong className="text-white">{email}</strong> — garde ton téléphone à portée et
              surveille tes courriels.
            </p>
```

- [ ] **Étape 5 : traduire les nouveaux refus**

Dans `apps/site/src/vitrine/demande.ts` :

1. Ajouter le champ à l'interface :

```ts
export interface Demande {
  nom: string;
  telephone: string;
  email: string;
  zone: string;
  palier: Palier;
  message: string;
}
```

2. Ajouter les trois entrées au dictionnaire `MESSAGES`, après celles du
   téléphone :

```ts
  EMAIL_MANQUANT: 'Indique ton adresse e-mail — c’est par là que ton accès arrivera.',
  EMAIL_INVALIDE: 'Cette adresse n’a pas la bonne forme. Vérifie l’arobase et le domaine.',
  EMAIL_TROP_LONG: 'Cette adresse est trop longue.',
  TROP_DE_DEMANDES:
    'Une demande vient de partir depuis cette connexion. Patiente une minute avant de réessayer.',
```

- [ ] **Étape 6 : lancer, vérifier le succès**

```bash
cd apps/site && npx vitest run && npm run build -w @kolek/site
```

Attendu : SUCCÈS, 4 tests, et la construction passe.

- [ ] **Étape 7 : commit**

```bash
git add apps/site/package.json apps/site/vitest.config.ts \
        apps/site/src/vitrine/Inscription.tsx \
        apps/site/src/vitrine/Inscription.test.tsx \
        apps/site/src/vitrine/demande.ts \
        package-lock.json
git commit -m "feat(vitrine): le formulaire demande une adresse electronique"
```

---

## Tâche 9 — Les deux écrans du collecteur

**Fichiers :**
- Modifier : `packages/ui/src/EcranConnexion.tsx`
- Créer : `packages/ui/src/EcranConnexion.test.tsx`
- Créer : `apps/collecteur/src/motDePasse.ts`
- Créer : `apps/collecteur/src/ecrans/MotDePasseOublie.tsx`
- Créer : `apps/collecteur/src/ecrans/NouveauMotDePasse.tsx`
- Créer : `apps/collecteur/src/ecrans/MotDePasseOublie.test.tsx`
- Créer : `apps/collecteur/src/ecrans/NouveauMotDePasse.test.tsx`
- Modifier : `apps/collecteur/src/App.tsx`
- Modifier : `apps/collecteur/src/Connexion.tsx`

**Interfaces :**
- Consomme : la fonction `mot-de-passe-oublie` (tâche 7).
- Produit :
  ```ts
  // packages/ui — EcranConnexion gagne une propriété facultative
  motDePasseOublie?: string;   // l'adresse du lien ; absente, aucun lien n'est rendu

  // apps/collecteur/src/motDePasse.ts
  export type Issue = { ok: true } | { ok: false; message: string };
  export function demanderReinitialisation(email: string): Promise<Issue>;
  export function poserMotDePasse(motDePasse: string): Promise<Issue>;
  export function sessionOuverte(): Promise<boolean>;
  ```

**Le lien est facultatif** parce que les trois applications partagent
`EcranConnexion` et que l'administration n'a pas le même besoin — un compte
d'administration se récupère par GTCS, pas par un formulaire public. C'est la
même raison qui rend `federee` facultative dans ce fichier.

**Un seul écran pour les deux parcours.** L'invité et celui qui a oublié
atterrissent au même endroit et demandent la même chose : choisir un mot de
passe. Deux écrans divergeraient à la première correction.

**Le contrôle des mots de passe divulgués n'est pas appelé ici.** Voir l'écart
n° 3 en tête de plan : `supabase.auth.updateUser` fait appliquer par GoTrue la
longueur minimale **et** le réglage « Prevent use of leaked passwords ». Il n'y
a que des messages d'erreur à traduire.

- [ ] **Étape 1 : écrire le test du lien dans `EcranConnexion`**

Créer `packages/ui/src/EcranConnexion.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EcranConnexion } from './EcranConnexion';

// `globals` n'est pas activé dans ce paquet : sans cet appel, chaque rendu
// s'ajoute au précédent.
afterEach(cleanup);

const BASE = {
  titre: 'Kolek',
  sousTitre: 'Chaque mise compte',
  onSoumettre: async () => null,
};

describe('le lien « Mot de passe oublié »', () => {
  it('n’apparaît pas quand aucune adresse n’est donnée', () => {
    // L'administration partage ce composant et n'a pas ce besoin : un compte
    // d'administration se récupère par GTCS, pas par un formulaire public.
    render(<EcranConnexion {...BASE} />);

    expect(screen.queryByRole('link', { name: /mot de passe oublié/i })).toBeNull();
  });

  it('mène à l’adresse donnée', () => {
    render(<EcranConnexion {...BASE} motDePasseOublie="/mot-de-passe-oublie" />);

    const lien = screen.getByRole('link', { name: /mot de passe oublié/i });
    expect(lien.getAttribute('href')).toBe('/mot-de-passe-oublie');
  });
});

describe('ce qui ne bouge pas', () => {
  it('garde les deux champs et le bouton', () => {
    render(<EcranConnexion {...BASE} motDePasseOublie="/mot-de-passe-oublie" />);

    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Mot de passe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy();
  });

  it('garde le bouton fédéré quand il est fourni', () => {
    render(
      <EcranConnexion
        {...BASE}
        motDePasseOublie="/mot-de-passe-oublie"
        federee={{ libelle: 'Continuer avec Google', onActiver: vi.fn(async () => null) }}
      />,
    );

    expect(screen.getByRole('button', { name: /continuer avec google/i })).toBeTruthy();
  });
});
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

```bash
cd packages/ui && npx vitest run src/EcranConnexion.test.tsx
```

Attendu : ÉCHEC — `Unable to find an accessible element with the role "link"`.

- [ ] **Étape 3 : ajouter le lien**

Dans `packages/ui/src/EcranConnexion.tsx` :

1. Ajouter à l'interface `Props`, après `retourAccueil` :

```ts
  /** L'adresse de l'écran « mot de passe oublié ». Absente sur
      l'administration, qui partage ce composant : un compte d'administration se
      récupère par GTCS, pas par un formulaire public. */
  motDePasseOublie?: string;
```

2. La déstructurer dans la signature du composant, après `retourAccueil`.

3. Rendre le lien **sous le bouton de connexion**, avant le lien de retour :

```tsx
        {motDePasseOublie && (
          <a
            href={motDePasseOublie}
            className="mt-4 block text-center font-body text-sm text-or/70 underline underline-offset-2 transition-colors hover:text-or"
          >
            Mot de passe oublié ?
          </a>
        )}
```

- [ ] **Étape 4 : lancer, vérifier le succès**

```bash
cd packages/ui && npx vitest run src/EcranConnexion.test.tsx
```

Attendu : SUCCÈS, 4 tests.

- [ ] **Étape 5 : écrire le module d'appel**

Créer `apps/collecteur/src/motDePasse.ts` :

```ts
import { supabase } from './supabase';

/**
 * Les deux gestes du mot de passe : en redemander un, en poser un.
 *
 * ## Deux chemins, deux natures
 *
 * `demanderReinitialisation` passe par **notre** Edge Function, pas par
 * `supabase.auth.resetPasswordForEmail`. Deux raisons, et la seconde suffirait :
 * le service de courriel intégré plafonne à deux messages par heure
 * (`email_sent = 2`), et sa réponse distingue une adresse connue d'une adresse
 * inconnue. Notre fonction ne le fait pas — voir son en-tête.
 *
 * `poserMotDePasse` passe en revanche par `supabase.auth.updateUser`, donc
 * directement par GoTrue. C'est délibéré : contrairement à
 * `admin.createUser`, `updateUser` **applique les règles de mot de passe** —
 * longueur minimale et réglage « Prevent use of leaked passwords ». C'est écrit
 * dans l'en-tête de `supabase/functions/_shared/hibp.ts`. Passer par une
 * fonction à nous pour refaire ce contrôle ajouterait un chemin sans rien
 * ajouter, et la CSP de cette application interdit de toute façon d'appeler
 * l'API de Have I Been Pwned depuis le navigateur.
 */

export type Issue = { ok: true } | { ok: false; message: string };

const REFUS_ENVOI: Record<string, string> = {
  EMAIL_MANQUANT: 'Saisis ton adresse.',
  EMAIL_INVALIDE: 'Cette adresse n’a pas la bonne forme.',
  EMAIL_TROP_LONG: 'Cette adresse est trop longue.',
  CORPS_ILLISIBLE: 'La demande n’a pas pu être lue. Réessaie.',
  CONFIGURATION: 'Le service de courriel n’est pas disponible. Contacte GTCS.',
};

/** Extrait le code d'erreur du corps, quand `functions.invoke` a signalé un
    non-2xx. Même dispositif que `apps/admin/src/demandes.ts`. */
async function codeDe(erreur: unknown): Promise<string | undefined> {
  try {
    const contexte = (erreur as { context?: Response }).context;
    if (contexte && typeof contexte.json === 'function') {
      return ((await contexte.json()) as { erreur?: string }).erreur;
    }
  } catch {
    // Corps illisible : l'appelant retombe sur son message générique.
  }
  return undefined;
}

export async function demanderReinitialisation(email: string): Promise<Issue> {
  const { error } = await supabase.functions.invoke('mot-de-passe-oublie', {
    method: 'POST',
    body: { email },
  });

  if (!error) return { ok: true };

  const code = await codeDe(error);
  return {
    ok: false,
    message: (code && REFUS_ENVOI[code]) ?? 'Envoi impossible. Vérifie ton réseau et réessaie.',
  };
}

export async function poserMotDePasse(motDePasse: string): Promise<Issue> {
  const { error } = await supabase.auth.updateUser({ password: motDePasse });
  if (!error) return { ok: true };

  const message = error.message ?? '';

  // GoTrue répond en anglais. Les trois refus qu'un collecteur peut réellement
  // rencontrer sont nommés ; le reste passe par un message générique, parce
  // qu'un détail d'erreur GoTrue ne l'aiderait pas.
  //
  // La longueur est testée **avant** la faiblesse : le message d'un mot de
  // passe trop court contient lui aussi le mot « weak » selon les versions, et
  // l'ordre inverse dirait « il figure dans une fuite » à quelqu'un qui a
  // simplement tapé six caractères.
  if (/at least|too short|should be at least/i.test(message)) {
    return { ok: false, message: 'Choisis un mot de passe d’au moins 10 caractères.' };
  }
  if (/weak|pwned|leaked|breach/i.test(message)) {
    return {
      ok: false,
      message: 'Ce mot de passe figure dans une fuite connue. Choisis-en un autre.',
    };
  }
  if (/session|not authenticated|jwt|expired/i.test(message)) {
    return {
      ok: false,
      message: 'Ce lien a expiré. Redemande-en un depuis « Mot de passe oublié ».',
    };
  }
  return { ok: false, message: 'Impossible d’enregistrer ce mot de passe. Réessaie.' };
}

/**
 * Y a-t-il une session ouverte ?
 *
 * `getSession` attend l'initialisation du client, qui est ce qui lit le jeton
 * accroché à l'adresse après un clic sur un lien d'invitation ou de
 * réinitialisation. Un `getSession` appelé une fois, après le montage, suffit
 * donc — inutile de guetter `onAuthStateChange`.
 */
export async function sessionOuverte(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return data.session !== null;
}
```

- [ ] **Étape 6 : écrire les tests des deux écrans**

Créer `apps/collecteur/src/ecrans/MotDePasseOublie.test.tsx` :

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MotDePasseOublie } from './MotDePasseOublie';

afterEach(cleanup);

const demanderReinitialisation = vi.fn();
vi.mock('../motDePasse', () => ({
  demanderReinitialisation: (...args: unknown[]) => demanderReinitialisation(...args),
}));

describe('MotDePasseOublie', () => {
  it('envoie l’adresse saisie', async () => {
    demanderReinitialisation.mockResolvedValue({ ok: true });
    render(<MotDePasseOublie />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'mariam@example.ci' },
    });
    fireEvent.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    await waitFor(() => expect(demanderReinitialisation).toHaveBeenCalledWith('mariam@example.ci'));
  });

  it('ne dit jamais si le compte existe', async () => {
    // C'est la moitié visible de la règle tenue côté serveur. Un message du
    // genre « aucun compte pour cette adresse » annulerait tout le travail de
    // la fonction publique.
    demanderReinitialisation.mockResolvedValue({ ok: true });
    render(<MotDePasseOublie />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'personne@example.ci' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    const confirmation = await screen.findByText(/si un compte porte cette adresse/i);
    expect(confirmation).toBeTruthy();
    expect(screen.queryByText(/aucun compte/i)).toBeNull();
  });

  it('affiche le refus quand l’envoi échoue', async () => {
    demanderReinitialisation.mockResolvedValue({
      ok: false,
      message: 'Cette adresse n’a pas la bonne forme.',
    });
    render(<MotDePasseOublie />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'mariam' } });
    fireEvent.click(screen.getByRole('button', { name: /envoyer le lien/i }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Cette adresse n’a pas la bonne forme.',
    );
  });

  it('offre le retour à la connexion', async () => {
    render(<MotDePasseOublie />);
    expect(screen.getByRole('link', { name: /retour à la connexion/i })).toBeTruthy();
  });
});
```

Créer `apps/collecteur/src/ecrans/NouveauMotDePasse.test.tsx` :

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NouveauMotDePasse } from './NouveauMotDePasse';

afterEach(cleanup);

const poserMotDePasse = vi.fn();
const sessionOuverte = vi.fn();
vi.mock('../motDePasse', () => ({
  poserMotDePasse: (...args: unknown[]) => poserMotDePasse(...args),
  sessionOuverte: () => sessionOuverte(),
}));

describe('quand le lien est valide', () => {
  it('enregistre le mot de passe saisi', async () => {
    sessionOuverte.mockResolvedValue(true);
    poserMotDePasse.mockResolvedValue({ ok: true });
    render(<NouveauMotDePasse />);

    const champ = await screen.findByLabelText('Nouveau mot de passe');
    fireEvent.change(champ, { target: { value: 'gouro-marche-2026' } });
    fireEvent.change(screen.getByLabelText('Répète-le'), {
      target: { value: 'gouro-marche-2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(poserMotDePasse).toHaveBeenCalledWith('gouro-marche-2026'));
  });

  it('refuse deux saisies différentes sans appeler le serveur', async () => {
    // Le mot de passe est masqué : une faute de frappe ne se voit pas, et sans
    // confirmation le collecteur se retrouve dehors avec un mot de passe qu'il
    // croit connaître.
    sessionOuverte.mockResolvedValue(true);
    render(<NouveauMotDePasse />);

    fireEvent.change(await screen.findByLabelText('Nouveau mot de passe'), {
      target: { value: 'gouro-marche-2026' },
    });
    fireEvent.change(screen.getByLabelText('Répète-le'), { target: { value: 'gouro-marche-202' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Les deux saisies ne sont pas identiques.',
    );
    expect(poserMotDePasse).not.toHaveBeenCalled();
  });

  it('affiche le refus du serveur', async () => {
    sessionOuverte.mockResolvedValue(true);
    poserMotDePasse.mockResolvedValue({
      ok: false,
      message: 'Ce mot de passe figure dans une fuite connue. Choisis-en un autre.',
    });
    render(<NouveauMotDePasse />);

    fireEvent.change(await screen.findByLabelText('Nouveau mot de passe'), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText('Répète-le'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Ce mot de passe figure dans une fuite connue. Choisis-en un autre.',
    );
  });
});

describe('quand le lien a expiré', () => {
  it('le dit et renvoie vers une nouvelle demande', async () => {
    // Sans session, `updateUser` échouerait avec un message anglais et le
    // collecteur croirait son compte perdu. Le cas est nommé avant même la
    // saisie.
    sessionOuverte.mockResolvedValue(false);
    render(<NouveauMotDePasse />);

    expect(await screen.findByText(/ce lien n’est plus valable/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /demander un nouveau lien/i })).toBeTruthy();
    expect(screen.queryByLabelText('Nouveau mot de passe')).toBeNull();
  });
});
```

- [ ] **Étape 7 : lancer, vérifier l'échec**

```bash
cd apps/collecteur && npx vitest run src/ecrans/MotDePasseOublie.test.tsx src/ecrans/NouveauMotDePasse.test.tsx
```

Attendu : ÉCHEC — `Failed to resolve import "./MotDePasseOublie"`.

- [ ] **Étape 8 : écrire les deux écrans**

Créer `apps/collecteur/src/ecrans/MotDePasseOublie.tsx` :

```tsx
import { Bouton, Champ, Onde, Rosace } from '@kolek/ui';
import { useState } from 'react';

import { demanderReinitialisation } from '../motDePasse';

/**
 * Redemander un accès.
 *
 * ## Le message de confirmation est le point délicat
 *
 * Il ne dit **jamais** si un compte porte cette adresse. C'est la moitié
 * visible de la règle tenue par l'Edge Function : une réponse qui distinguerait
 * « adresse inconnue » de « courriel envoyé » serait un annuaire des
 * collecteurs de GTCS. Le serveur ne le dit pas, cet écran non plus, et les
 * deux tiennent ensemble ou pas du tout.
 *
 * L'écran reprend le vert coffre des deux portes du produit. Un collecteur qui
 * clique « Mot de passe oublié ? » et change de monde visuel doute d'être au bon
 * endroit — et sur un produit qui manipule l'épargne d'autrui, ce doute coûte.
 */
export function MotDePasseOublie() {
  const [email, setEmail] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [parti, setParti] = useState(false);

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (envoi) return;

    setEnvoi(true);
    setErreur(null);
    const issue = await demanderReinitialisation(email);
    setEnvoi(false);

    if (issue.ok) {
      setParti(true);
      return;
    }
    setErreur(issue.message);
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[image:var(--degrade-hero)] grid place-items-center p-5">
      <Rosace
        petales={20}
        excentricite={0.4}
        animee
        className="pointer-events-none absolute -right-[20%] top-1/2 w-[80vmin] -translate-y-1/2 text-or/15"
      />
      <Onde
        lignes={8}
        className="pointer-events-none absolute bottom-0 left-0 h-32 w-full text-or/10"
      />

      <form
        onSubmit={soumettre}
        className="relative z-10 w-full max-w-formulaire rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-6 shadow-lg backdrop-blur-xl"
      >
        <h1 className="mb-2 font-headings text-xl font-bold leading-tight text-white">
          Mot de passe oublié
        </h1>
        <p className="mb-6 font-body text-sm text-white/50">
          Saisis l’adresse de ton compte. On t’envoie un lien pour en choisir un nouveau.
        </p>

        {parti ? (
          <p className="mb-4 rounded-md bg-or/10 p-3 font-body text-sm text-white/70">
            Si un compte porte cette adresse, le lien vient de partir. Regarde tes courriels — le
            lien vaut une heure.
          </p>
        ) : (
          <>
            <Champ
              libelle="Email"
              type="email"
              valeur={email}
              onChange={setEmail}
              requis
              autoComplete="username"
              className="mb-5"
              sombre
            />

            {erreur && (
              <p
                role="alert"
                className="mb-4 rounded-md bg-negative/15 p-3 font-body text-sm text-negative-tint"
              >
                {erreur}
              </p>
            )}

            <Bouton type="submit" pleineLargeur disabled={envoi}>
              {envoi ? 'Envoi…' : 'Envoyer le lien'}
            </Bouton>
          </>
        )}

        <a
          href="/"
          className="mt-5 block text-center font-body text-sm text-white/40 transition-colors hover:text-white/70"
        >
          ← Retour à la connexion
        </a>
      </form>
    </main>
  );
}
```

Créer `apps/collecteur/src/ecrans/NouveauMotDePasse.tsx` :

```tsx
import { Bouton, Champ, Onde, Rosace } from '@kolek/ui';
import { useEffect, useState } from 'react';

import { poserMotDePasse, sessionOuverte } from '../motDePasse';

/**
 * Choisir son mot de passe.
 *
 * ## Un écran pour deux parcours
 *
 * L'invité qui ouvre son compte et le collecteur qui a oublié le sien
 * atterrissent tous deux ici, et demandent exactement la même chose. Deux
 * écrans divergeraient à la première correction.
 *
 * ## Ce que fait le lien avant que cet écran s'affiche
 *
 * Le clic passe par `/auth/v1/verify`, qui vérifie le jeton et redirige ici en
 * accrochant la session à l'adresse. `supabase-js` la lit à l'initialisation —
 * d'où l'attente au montage plutôt qu'un rendu immédiat : sans elle,
 * `updateUser` échouerait, et le collecteur lirait un message anglais sur un
 * compte qu'il croirait perdu.
 *
 * ## La confirmation n'est pas du zèle
 *
 * Le champ est masqué. Une faute de frappe ne se voit pas, et sans seconde
 * saisie le collecteur se retrouve dehors avec un mot de passe qu'il croit
 * connaître — sur un téléphone, au marché, sans personne pour l'aider.
 */
export function NouveauMotDePasse() {
  const [session, setSession] = useState<boolean | null>(null);
  const [motDePasse, setMotDePasse] = useState('');
  const [repetition, setRepetition] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pose, setPose] = useState(false);

  useEffect(() => {
    let vivant = true;
    void sessionOuverte().then((ouverte) => {
      if (vivant) setSession(ouverte);
    });
    return () => {
      vivant = false;
    };
  }, []);

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (envoi) return;

    if (motDePasse !== repetition) {
      // Refusé ici, sans aller-retour : le serveur ne peut pas voir cette
      // erreur-là, il ne reçoit qu'une seule valeur.
      setErreur('Les deux saisies ne sont pas identiques.');
      return;
    }

    setEnvoi(true);
    setErreur(null);
    const issue = await poserMotDePasse(motDePasse);
    setEnvoi(false);

    if (issue.ok) {
      setPose(true);
      return;
    }
    setErreur(issue.message);
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[image:var(--degrade-hero)] grid place-items-center p-5">
      <Rosace
        petales={20}
        excentricite={0.4}
        animee
        className="pointer-events-none absolute -right-[20%] top-1/2 w-[80vmin] -translate-y-1/2 text-or/15"
      />
      <Onde
        lignes={8}
        className="pointer-events-none absolute bottom-0 left-0 h-32 w-full text-or/10"
      />

      <form
        onSubmit={soumettre}
        className="relative z-10 w-full max-w-formulaire rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-6 shadow-lg backdrop-blur-xl"
      >
        <h1 className="mb-2 font-headings text-xl font-bold leading-tight text-white">
          Choisis ton mot de passe
        </h1>

        {session === false && (
          <>
            <p className="mb-4 font-body text-sm text-white/60">
              Ce lien n’est plus valable — il ne sert qu’une fois et vaut une heure.
            </p>
            <a
              href="/mot-de-passe-oublie"
              className="block text-center font-body text-sm text-or underline underline-offset-2"
            >
              Demander un nouveau lien
            </a>
          </>
        )}

        {session === true && pose && (
          <>
            <p className="mb-4 rounded-md bg-or/10 p-3 font-body text-sm text-white/70">
              C’est fait. Tu peux entrer dans Kolek.
            </p>
            {/* Une navigation franche plutôt qu'un `<a>` autour du bouton : un
                `<button>` dans un `<a>` est un imbriquement invalide, et les
                lecteurs d'écran annoncent alors deux contrôles pour un. */}
            <Bouton
              pleineLargeur
              onClick={() => {
                window.location.href = '/';
              }}
            >
              Ouvrir Kolek
            </Bouton>
          </>
        )}

        {session === true && !pose && (
          <>
            <p className="mb-6 font-body text-sm text-white/50">
              Au moins 10 caractères. Évite un mot de passe déjà utilisé ailleurs.
            </p>

            <Champ
              libelle="Nouveau mot de passe"
              type="password"
              valeur={motDePasse}
              onChange={setMotDePasse}
              requis
              autoComplete="new-password"
              className="mb-3"
              sombre
            />
            <Champ
              libelle="Répète-le"
              type="password"
              valeur={repetition}
              onChange={setRepetition}
              requis
              autoComplete="new-password"
              className="mb-5"
              sombre
            />

            {erreur && (
              <p
                role="alert"
                className="mb-4 rounded-md bg-negative/15 p-3 font-body text-sm text-negative-tint"
              >
                {erreur}
              </p>
            )}

            <Bouton type="submit" pleineLargeur disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </Bouton>
          </>
        )}
      </form>
    </main>
  );
}
```

- [ ] **Étape 9 : brancher les deux chemins**

Dans `apps/collecteur/src/App.tsx` :

1. Ajouter les imports :

```ts
import { MotDePasseOublie } from './ecrans/MotDePasseOublie';
import { NouveauMotDePasse } from './ecrans/NouveauMotDePasse';
```

2. Insérer le routage **avant** le test de session, juste après `if (!pret)` :

```tsx
  // Deux chemins traités avant la session, et l'ordre compte. Le lien
  // d'invitation **ouvre** une session en atterrissant : sans ce branchement,
  // l'application afficherait sa coquille et le prospect n'aurait jamais
  // l'écran où choisir son mot de passe.
  //
  // Lu une seule fois, comme le fait `apps/site/src/App.tsx` : deux chemins ne
  // justifient pas une bibliothèque de routage, et on n'y passe qu'une fois.
  const chemin = window.location.pathname.replace(/\/+$/, '');
  if (chemin === '/nouveau-mot-de-passe') return <NouveauMotDePasse />;
  if (chemin === '/mot-de-passe-oublie') return <MotDePasseOublie />;
```

> Placer ces trois lignes **après** `if (!pret) return null;` et avant
> `if (!session) return <Connexion />;`. Le calcul de `chemin` doit rester
> au-dessus des deux `return`, jamais dans une branche.

3. Dans `apps/collecteur/src/Connexion.tsx`, passer le lien à `EcranConnexion` :

```tsx
      retourAccueil={VITRINE}
      motDePasseOublie="/mot-de-passe-oublie"
```

- [ ] **Étape 10 : lancer, vérifier le succès**

```bash
cd packages/ui && npx vitest run
cd ../../apps/collecteur && npx vitest run
```

Attendu : SUCCÈS. Les 12 nouveaux tests passent — 4 dans `packages/ui`, 8 dans
`apps/collecteur` — et aucun test existant de `Connexion.test.tsx` ni de
`premier-rendu.test.ts` ne tombe.

- [ ] **Étape 11 : commit**

```bash
git add packages/ui/src/EcranConnexion.tsx packages/ui/src/EcranConnexion.test.tsx \
        apps/collecteur/src/motDePasse.ts \
        apps/collecteur/src/ecrans/MotDePasseOublie.tsx \
        apps/collecteur/src/ecrans/NouveauMotDePasse.tsx \
        apps/collecteur/src/ecrans/MotDePasseOublie.test.tsx \
        apps/collecteur/src/ecrans/NouveauMotDePasse.test.tsx \
        apps/collecteur/src/App.tsx apps/collecteur/src/Connexion.tsx
git commit -m "feat(collecteur): choisir son mot de passe, et en redemander un"
```

---

## Tâche 10 — Les réglages hors code

**Fichiers :**
- Modifier : `supabase/config.toml`
- Modifier : `Docs/deploiement.md`

**Interfaces :**
- Consomme : les noms d'environnement fixés dans les contraintes globales.
- Produit : rien de programmable. Cette tâche existe parce que **le lot ne
  fonctionne pas sans elle**, et parce que les réglages qui ne vivent pas dans
  le dépôt sont ceux qu'on oublie.

**Un lien qui mène nulle part ne lève aucune erreur.** Si l'adresse de retour
n'est pas dans `additional_redirect_urls`, GoTrue **renvoie silencieusement sur
`site_url`**. Le prospect atterrit sur l'écran de connexion ordinaire, n'a pas de
mot de passe, et conclut que son compte n'existe pas. C'est déjà écrit dans
`config.toml`, en toutes lettres : « C'est ce qui fait chercher longtemps. »

- [ ] **Étape 1 : l'adresse de retour en local**

Dans `supabase/config.toml`, étendre `additional_redirect_urls` :

```toml
additional_redirect_urls = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  # Le lien d'invitation et celui de réinitialisation y renvoient. Une adresse
  # absente de cette liste ne provoque aucune erreur visible : GoTrue renvoie
  # sur `site_url`, et le prospect atterrit sur un écran de connexion sans avoir
  # de mot de passe. **À poser aussi dans le tableau de bord du projet
  # distant** — ce fichier ne pilote que la pile locale.
  "http://localhost:5173/nouveau-mot-de-passe",
  "https://app.kolek.cash/nouveau-mot-de-passe",
]
```

- [ ] **Étape 2 : documenter les réglages du distant**

Ajouter à `Docs/deploiement.md` une section, à la suite de celles qui existent :

````markdown
## Le courriel d'accès

Deux fonctions envoient des courriels depuis le 2026-08-27 : `admin-demandes`
quand elle accorde une demande, et `mot-de-passe-oublie`. Toutes deux passent
par `_shared/passerelle-courriel.ts`, jamais par le mailer intégré de Supabase —
celui-ci plafonne à deux messages par heure (`email_sent = 2`) et le troisième
prospect de la journée ne recevrait rien **sans qu'aucune erreur ne le dise**.

### 1. Chez le fournisseur (Resend)

1. Créer un compte, ajouter le domaine `kolek.cash`.
2. Poser les enregistrements DNS qu'il indique — SPF, DKIM, et l'enregistrement
   de retour. Tant qu'ils ne sont pas vérifiés, tout envoi est refusé en 403,
   que `lireIssue` traduit en `IDENTIFIANTS_REFUSES`.
3. Créer une clé d'API en écriture seule.

### 2. Secrets d'Edge Function

Sur le projet Supabase, *Edge Functions → Secrets* :

| Secret | Valeur |
|---|---|
| `COURRIEL_FOURNISSEUR` | `resend` |
| `COURRIEL_CLE` | la clé d'API |
| `COURRIEL_EXPEDITEUR` | `Kolek <acces@kolek.cash>` |
| `REDIRECTION_MOT_DE_PASSE` | `https://app.kolek.cash/nouveau-mot-de-passe` |

Sans les trois premiers, `passerelleDepuis` rend `null` : `admin-demandes`
refuse d'accorder avec `COURRIEL_NON_CONFIGURE` et **ne crée rien**, et
`mot-de-passe-oublie` rend `CONFIGURATION`. C'est délibéré : rien ne prétend
avoir envoyé.

`REDIRECTION_MOT_DE_PASSE` a une valeur par défaut dans le code. Le secret n'est
utile que pour une pré-production.

### 3. Tableau de bord Auth

*Authentication → URL Configuration → Redirect URLs* : ajouter
`https://app.kolek.cash/nouveau-mot-de-passe`.

**C'est le réglage qui ne prévient pas.** Absent, GoTrue renvoie silencieusement
sur la Site URL : le prospect arrive sur l'écran de connexion, sans mot de
passe, et croit que son compte n'existe pas. Aucune erreur nulle part.

### 4. Déployer les fonctions

```bash
npx supabase functions deploy demander-ouverture
npx supabase functions deploy admin-demandes
npx supabase functions deploy mot-de-passe-oublie
```
````

- [ ] **Étape 3 : vérifier que la pile locale accepte le réglage**

```bash
npm run db:reset
```

Attendu : la pile redémarre sans erreur de configuration.

- [ ] **Étape 4 : commit**

```bash
git add supabase/config.toml Docs/deploiement.md
git commit -m "docs(deploiement): les secrets du courriel et l'adresse de retour"
```

---

## Vérification finale

- [ ] **La suite entière**

```bash
npm run verifier
```

Attendu : SUCCÈS de bout en bout — thème, marque, paliers, tests de tous les
espaces de travail, tests des scripts, tests de base, construction, bundles.

- [ ] **Ce que la suite ne peut pas mesurer**

Trois choses demandent une clé de fournisseur et un envoi réel. À faire sur le
projet distant, une fois les secrets posés.

| À vérifier | Comment | Attendu |
|---|---|---|
| Le chemin nominal | Déposer une demande depuis `kolek.cash` avec une adresse à soi, l'accorder depuis `admin.kolek.cash` | Le courriel arrive ; le lien mène à `/nouveau-mot-de-passe` ; le mot de passe est accepté ; on entre dans `app.kolek.cash` |
| `COURRIEL_NON_PARTI` | Remplacer `COURRIEL_CLE` par une valeur fausse, accorder une demande de test, puis **rétablir la clé** | L'écran d'administration affiche « le compte est créé, mais le courriel n'est pas parti » ; la demande est **toujours** `nouvelle` dans la liste |
| L'indistinguabilité en configuration complète | `curl` deux fois sur `mot-de-passe-oublie`, avec une adresse connue puis une inconnue, et comparer les deux sorties | Statut et corps identiques, octet pour octet |

La commande de la troisième ligne :

```bash
for a in collecteur.connu@example.ci personne.inconnue@example.ci; do
  curl -s -o /dev/stdout -w " [%{http_code}]\n" \
    -X POST "https://yfnwmokxkznejotgpfgf.supabase.co/functions/v1/mot-de-passe-oublie" \
    -H "Content-Type: application/json" \
    -H "apikey: $CLE_ANON" -H "Authorization: Bearer $CLE_ANON" \
    -d "{\"email\":\"$a\"}"
done
```

Les deux lignes doivent être identiques.

- [ ] **Un mot de passe divulgué est bien refusé**

Sur `/nouveau-mot-de-passe`, saisir `password123` — relevé à 2 266 543
occurrences le 2026-08-20. Attendu : « Ce mot de passe figure dans une fuite
connue. Choisis-en un autre. »

Si le mot de passe est **accepté**, c'est que le réglage *Prevent use of leaked
passwords* n'est plus actif sur le projet. Le réactiver : c'est lui qui porte ce
contrôle sur ce chemin, et non `_shared/hibp.ts`.

---

## Ce qui reste ouvert après ce lot

- **La clé `service_role` publiée le 2026-08-24 n'est toujours pas révoquée.**
  Bloquant le plus ancien du projet, et les deux nouvelles fonctions s'appuient
  dessus comme les autres.
- **Aucun CAPTCHA sur les fonctions publiques.** La borne par IP livrée ici
  ferme le script sur une machine ; elle ne ferme pas un réseau d'adresses.
  Turnstile reste la réponse recommandée par l'audit du 2026-08-25.
- **La vérification de l'adresse avant l'accord.** Un prospect peut saisir une
  adresse qui n'est pas la sienne ; c'est GTCS qui tranche en accordant.
- **La révocation d'un accès** et **le paiement de l'abonnement** ne sont pas
  touchés.
