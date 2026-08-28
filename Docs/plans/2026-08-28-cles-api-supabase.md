# Fermer la clé `service_role` publiée le 2026-08-24 — plan d'implémentation

> **✅ PLAN TERMINÉ le 2026-08-28.** Les clés héritées sont désactivées.
> L'ancienne clé `anon` et le jeton `service_role` diffusé le 2026-08-24 rendent
> `401` sur l'authentification comme sur la lecture de table. Quatre jours
> d'exposition. Compte rendu, incidents de parcours et points restés ouverts :
> `Docs/audits/2026-08-28-fermeture-cle-service.md`.

> **Pour un agent d'exécution :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:executing-plans` ou `superpowers:subagent-driven-development`
> pour dérouler ce plan tâche par tâche. Les étapes portent des cases à cocher
> (`- [ ]`).

**But :** faire en sorte que le jeton `service_role` diffusé le 2026-08-24 cesse
d'ouvrir la base, sans interruption de service, en migrant les trois
applications et les onze Edge Functions des clés héritées `anon` /
`service_role` vers les clés `publishable` / `secret`.

**Architecture :** les deux systèmes de clés **coexistent**. C'est ce qui permet
une bascule sans coupure : on installe partout les clés neuves pendant que les
anciennes fonctionnent encore, on vérifie chaque surface, et on ne désactive les
héritées qu'à la toute fin. Le code lit la clé par un résolveur partagé qui
accepte l'ancien nom comme le nouveau — la bascule devient alors un changement
de configuration, réversible, et non une réécriture.

**Pile :** Supabase (JWT Signing Keys, Edge Functions Deno, Vault), Netlify,
Node 26, vitest 4.

## Contraintes globales

- **Tout est en français** : code, commentaires, messages, tests, commits.
- **Le dépôt est public.** Aucune clé n'y entre — ni `sb_secret_`, ni un JWT de
  rôle service. `scripts/verifier-bundles.mjs` fait déjà échouer la construction
  si une `sb_secret_` atteint un artefact.
- **Projet Supabase :** `yfnwmokxkznejotgpfgf`.
- **Aucune clé ne doit apparaître dans une conversation, un historique de
  terminal, ou une capture d'écran.** La leçon du 2026-08-27 : une clé Resend a
  dû être révoquée pour avoir été collée dans une invite PowerShell.
- **Style de commit :** `type(portée): phrase en français, en minuscule`.
- **L'ordre des tâches 3 à 6 n'est pas négociable.** Désactiver les clés
  héritées avant que les surfaces portent les neuves coupe l'administration, la
  vitrine et la file d'avis, sans message.

## La mesure qui fait foi

Un seul critère dit si ce plan a réussi. Il ne demande aucun accès privilégié :

```bash
# La clé anon d'avant l'incident — celle que le dépôt et les paquets servis
# portent aujourd'hui. Tant qu'elle répond 200, le secret qui la signe est
# vivant, et le jeton service_role diffusé le 24 août l'est avec elle.
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "apikey: <la clé anon actuelle>" \
  https://yfnwmokxkznejotgpfgf.supabase.co/auth/v1/settings
```

| Réponse | Signification |
|---|---|
| `200` | La clé volée ouvre toujours la base. **Rien n'est réglé.** |
| `401` | Le jeton hérité est refusé. **C'est terminé.** |

Mesuré le 2026-08-28 à 00 h 30 : **`200`**. Charge utile inchangée depuis le
2026-08-16 — `iat = 1786918110`, signature `DZOkT8cl…`.

## Résultat de la tâche 1, mesuré le 2026-08-28 — il supprime deux tâches

La sonde a été déployée, interrogée, puis supprimée (404 confirmé). Voici ce
qu'elle a rendu, et ce n'était pas ce qu'on attendait :

| Variable injectée | Présente | Longueur | Préfixe |
|---|---|---|---|
| `SUPABASE_URL` | oui | 40 | `https://` |
| `SUPABASE_ANON_KEY` | oui | 46 | **`sb_publi`** |
| `SUPABASE_SERVICE_ROLE_KEY` | oui | 41 | **`sb_secre`** |
| `SUPABASE_PUBLISHABLE_KEY` | non | — | — |
| `SUPABASE_PUBLISHABLE_KEYS` | oui | 60 | `{"defaul` |
| `SUPABASE_SECRET_KEY` | non | — | — |
| `SUPABASE_SECRET_KEYS` | oui | 107 | `{"defaul` |

**Supabase a déjà remplacé les valeurs derrière les anciens noms.** Les onze
Edge Functions reçoivent déjà les clés du nouveau format — `sb_publishable_` et
`sb_secret_` — sous les noms `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY`.

Conséquence directe : **les tâches 2 et 3 sont sans objet.** Le résolveur
`_shared/cles.ts` et la réécriture des onze fonctions ne servent à rien — le
code lit déjà les bonnes clés sans le savoir. Écrire ce résolveur aurait été du
travail parfaitement inutile, découvert seulement à la fermeture.

Les variantes au pluriel sont des **objets JSON** (`{"default":…`), pas des
listes séparées par des virgules : elles ne sont pas destinées à être lues
directement, et rien n'a besoin d'y toucher.

Ce qui reste à faire est donc uniquement là où le **format hérité** est encore
en place : les paquets servis par les trois sites, et le secret du Vault.

## État de départ

- Le projet a **déjà migré** vers les JWT Signing Keys. Le secret hérité ne sert
  plus qu'à *vérifier* les anciens jetons ; il n'y a plus de bouton *Generate new
  secret*. L'écran le dit : « Consider switching to publishable and secret API
  keys to disable them. »
- `npx supabase secrets list` montre que la plateforme injecte déjà
  `SUPABASE_PUBLISHABLE_KEYS` et `SUPABASE_SECRET_KEYS` — **au pluriel**, forme
  que la tâche 1 va établir.
- `scripts/garde-env.mjs:108` **accepte déjà** une clé `sb_publishable_` dans
  `VITE_SUPABASE_ANON_KEY`. Le garde-fou du build ne s'opposera pas à la
  bascule.
- Onze fonctions lisent les clés : huit lisent les deux (`admin-avis`,
  `admin-creer-collecteur`, `admin-demandes`, `admin-modifier-collecteur`,
  `admin-reglages`, `admin-supprimer-collecteur`, `admin-vue-globale`,
  `collecteur-cloturer-carte`), trois la seule clé de service
  (`demander-ouverture`, `envoyer-avis`, `mot-de-passe-oublie`).
- Le Vault porte `kolek_url` et `kolek_cle_service`, lus par
  `avis_declencher_drainage` — voir
  `supabase/migrations/20260823170000_avis_drainage_planifie.sql:63-64`.

## Ce que ce plan ne fait pas

- Il ne touche pas aux politiques RLS ni aux privilèges. Elles sont déjà justes ;
  elles ne protégeaient simplement pas de cette clé-là.
- Il ne migre pas les sessions utilisateurs vers les nouvelles clés de signature.
  Elles suivent d'elles-mêmes.
- Il n'ajoute pas de CAPTCHA sur les fonctions publiques — autre chantier, autre
  plan.

---

## Task 1 : Savoir ce que la plateforme injecte vraiment — ✅ TERMINÉE le 2026-08-28

Voir le tableau en tête de plan. La sonde a été déployée, interrogée, puis
supprimée — `404` confirmé, aucune trace dans le dépôt, jamais commitée.

Elle a rendu l'inverse de ce qu'on attendait, et supprimé deux tâches. Les
étapes ci-dessous restent, parce que la méthode resservira : la prochaine fois
qu'une plateforme changera un contrat sous nos pieds, c'est ainsi qu'on le
saura avant d'écrire du code pour rien.

Aucune ligne de code ne peut être écrite correctement sans cette réponse : les
noms sont au pluriel, et une valeur au pluriel est probablement une liste. Une
liste concaténée dans un en-tête `Authorization` donnerait un 401 qu'on
chercherait longtemps.

**Fichiers :**
- Créer : `supabase/functions/sonde-cles/index.ts` (temporaire, supprimé en fin
  de tâche)

- [ ] **Step 1 : Écrire la sonde**

Elle rapporte **des formes, jamais des valeurs**. Une sonde qui divulgue ce
qu'elle inspecte serait la répétition exacte de l'incident du 24 août.

```ts
// Sonde temporaire — à supprimer dès la tâche 1 terminée.
//
// Elle répond à une seule question : sous quels noms, et sous quelle forme, la
// plateforme injecte-t-elle les clés neuves ? `supabase secrets list` donne les
// noms mais masque les valeurs, et les noms sont au pluriel — ce qui laisse
// supposer une liste.
//
// **Elle ne rend aucune valeur.** Nom, longueur, préfixe de huit caractères, et
// la présence ou non d'un séparateur. C'est tout ce qu'il faut pour écrire le
// résolveur de la tâche 2, et c'est tout ce qu'on peut divulguer sans répéter
// l'incident qu'on est en train de refermer.
Deno.serve(() => {
  const noms = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEYS',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SECRET_KEYS',
  ];

  const formes = noms.map((nom) => {
    const valeur = Deno.env.get(nom);
    if (valeur === undefined) return { nom, present: false };
    return {
      nom,
      present: true,
      longueur: valeur.length,
      prefixe: valeur.slice(0, 8),
      virgule: valeur.includes(','),
      crochet: valeur.trimStart().startsWith('['),
    };
  });

  return new Response(JSON.stringify({ formes }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2 : Déployer la sonde seule**

```bash
npx supabase functions deploy sonde-cles
```

Nommer la fonction explicitement. Un `functions deploy` sans argument
redéploierait les onze, ce qui n'est pas le sujet de cette tâche.

- [ ] **Step 3 : L'interroger**

```bash
curl -sS "https://yfnwmokxkznejotgpfgf.supabase.co/functions/v1/sonde-cles" \
  -H "apikey: $CLE_ANON" -H "Authorization: Bearer $CLE_ANON"
```

`CLE_ANON` se lit dans le paquet servi par `https://kolek.cash` — c'est ce que
fait déjà `cleAnonyme()` dans `scripts/verifier-en-ligne.mjs`.

Noter, pour la tâche 2 :
- quel nom porte la clé secrète : `SUPABASE_SECRET_KEY` ou
  `SUPABASE_SECRET_KEYS` ;
- si `virgule` ou `crochet` vaut `true`, la valeur est une **liste** et le
  résolveur devra en extraire le premier élément ;
- le préfixe attendu : `sb_secret_` pour la secrète, `sb_publis` pour la
  publiable.

- [ ] **Step 4 : Supprimer la sonde**

```bash
npx supabase functions delete sonde-cles
rm -rf supabase/functions/sonde-cles
```

Une sonde qui inspecte l'environnement n'a rien à faire en production une minute
de plus que nécessaire. Elle n'est pas commitée.

- [ ] **Step 5 : Consigner le résultat**

Reporter les constats dans la section « État de départ » de ce plan, en une
ligne. Une mesure non écrite est une mesure à refaire.

---

## Task 2 : ~~Un résolveur de clés qui accepte les deux noms~~ — SANS OBJET

**La tâche 1 l'a rendue inutile** : `SUPABASE_SERVICE_ROLE_KEY` porte déjà une
clé `sb_secret_`, et `SUPABASE_ANON_KEY` une clé `sb_publishable_`. Le code lit
déjà les bonnes clés sans le savoir.

Les étapes ci-dessous sont conservées pour mémoire — **elles ne doivent pas être
exécutées**. Écrire ce résolveur aurait coûté une demi-journée, et le travail
n'aurait été reconnu inutile qu'à la fermeture : plus rien n'aurait cassé, et on
aurait cru que c'était grâce à lui.

C'est la pièce qui rend la bascule réversible. Le code cesse de nommer une clé
précise et demande « la clé secrète », que la plateforme la fournisse sous
l'ancien nom ou le nouveau.

**Fichiers :**
- Créer : `supabase/functions/_shared/cles.ts`
- Créer : `supabase/tests/cles.test.ts`

**Interfaces :**
- Produit : `cleSecrete(env)` et `clePubliable(env)`, toutes deux
  `(env: Record<string, string | undefined>) => string | undefined`.
- Consomme : rien.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `supabase/tests/cles.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { clePubliable, cleSecrete } from '../functions/_shared/cles.ts';

// Fonctions pures, testées sans Deno : elles reçoivent l'environnement plutôt
// que de le lire. C'est ce qui permet d'éprouver les six cas qui comptent — les
// deux noms, la liste, le vide — sans déployer quoi que ce soit.

describe('cleSecrete', () => {
  it('préfère le nom neuf quand les deux sont posés', () => {
    // Pendant la bascule, les deux coexistent. Préférer l'ancien reviendrait à
    // ne jamais basculer, et personne ne s'en apercevrait avant la coupure.
    const env = { SUPABASE_SECRET_KEY: 'sb_secret_NEUVE', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.ancienne' };
    expect(cleSecrete(env)).toBe('sb_secret_NEUVE');
  });

  it('accepte le nom au pluriel', () => {
    expect(cleSecrete({ SUPABASE_SECRET_KEYS: 'sb_secret_UNE' })).toBe('sb_secret_UNE');
  });

  it('retient le premier élément d’une liste séparée par des virgules', () => {
    // La plateforme peut poser plusieurs clés — une active, une de secours.
    // Concaténer la liste entière dans un en-tête donnerait un 401 qu'on
    // chercherait du mauvais côté.
    const env = { SUPABASE_SECRET_KEYS: 'sb_secret_UNE,sb_secret_DEUX' };
    expect(cleSecrete(env)).toBe('sb_secret_UNE');
  });

  it('retient le premier élément d’une liste JSON', () => {
    const env = { SUPABASE_SECRET_KEYS: '["sb_secret_UNE","sb_secret_DEUX"]' };
    expect(cleSecrete(env)).toBe('sb_secret_UNE');
  });

  it('retombe sur l’ancien nom tant que le neuf est absent', () => {
    expect(cleSecrete({ SUPABASE_SERVICE_ROLE_KEY: 'eyJ.ancienne' })).toBe('eyJ.ancienne');
  });

  it('rend undefined quand rien n’est posé', () => {
    // Et surtout pas une chaîne vide : le code appelant vérifie l'absence, et
    // une chaîne vide passerait le contrôle pour échouer plus loin, en 401.
    expect(cleSecrete({})).toBeUndefined();
  });

  it('ignore une valeur vide ou blanche', () => {
    expect(cleSecrete({ SUPABASE_SECRET_KEY: '   ', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.x' })).toBe('eyJ.x');
  });
});

describe('clePubliable', () => {
  it('préfère le nom neuf', () => {
    const env = { SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_NEUVE', SUPABASE_ANON_KEY: 'eyJ.anon' };
    expect(clePubliable(env)).toBe('sb_publishable_NEUVE');
  });

  it('retombe sur SUPABASE_ANON_KEY', () => {
    expect(clePubliable({ SUPABASE_ANON_KEY: 'eyJ.anon' })).toBe('eyJ.anon');
  });

  it('rend undefined quand rien n’est posé', () => {
    expect(clePubliable({})).toBeUndefined();
  });
});
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

```bash
npx vitest run supabase/tests/cles.test.ts --config supabase/tests/vitest.config.ts
```

Attendu : **FAIL** — `Failed to resolve import "../functions/_shared/cles.ts"`.

- [ ] **Step 3 : Écrire le résolveur**

Créer `supabase/functions/_shared/cles.ts` :

```ts
/**
 * D'où viennent les clés, pendant et après la bascule.
 *
 * ## Pourquoi ce module existe
 *
 * Le 2026-08-24, le jeton `service_role` a été publié quelques minutes dans un
 * paquet servi. Une clé publiée une fois est copiée pour toujours : seule sa
 * fermeture la referme. Or elle ne se ferme qu'en désactivant les clés héritées
 * du projet — ce qui casse les onze fonctions tant qu'elles nomment
 * `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * Ce module coupe le nœud. Le code ne demande plus une variable, il demande
 * **une clé secrète**, et accepte que la plateforme la lui donne sous l'ancien
 * nom ou le nouveau. La bascule devient un changement de configuration,
 * réversible, au lieu d'une réécriture de onze fichiers à l'instant précis où
 * l'on ferme la porte.
 *
 * ## Le nom neuf l'emporte, toujours
 *
 * Pendant la transition les deux coexistent. Préférer l'ancien reviendrait à ne
 * jamais basculer — et personne ne s'en apercevrait avant la coupure, c'est-à-dire
 * trop tard.
 *
 * ## Les listes
 *
 * Les noms injectés par la plateforme sont au pluriel. Une valeur au pluriel
 * peut porter plusieurs clés — une active, une de secours. Concaténer la liste
 * entière dans un en-tête `Authorization` donnerait un `401` qu'on chercherait
 * du côté des permissions, jamais du côté du parsing.
 */

/** Extrait la première clé d'une valeur qui peut en porter plusieurs. */
function premiere(valeur: string | undefined): string | undefined {
  if (valeur === undefined) return undefined;
  const brut = valeur.trim();
  if (brut === '') return undefined;

  if (brut.startsWith('[')) {
    try {
      const liste = JSON.parse(brut);
      if (Array.isArray(liste) && typeof liste[0] === 'string' && liste[0].trim() !== '') {
        return liste[0].trim();
      }
    } catch {
      // Un JSON illisible n'est pas une clé. On ne devine pas : le repli
      // ci-dessous s'applique, et l'absence se signale d'elle-même.
    }
    return undefined;
  }

  const tete = brut.split(',')[0].trim();
  return tete === '' ? undefined : tete;
}

/** La première valeur exploitable parmi une liste de noms, dans l'ordre. */
function resoudre(env: Record<string, string | undefined>, noms: string[]): string | undefined {
  for (const nom of noms) {
    const valeur = premiere(env[nom]);
    if (valeur !== undefined) return valeur;
  }
  return undefined;
}

/**
 * La clé qui ignore RLS. Elle ne quitte jamais une Edge Function.
 *
 * L'ordre des noms est la décision de ce module : le neuf d'abord.
 */
export function cleSecrete(env: Record<string, string | undefined>): string | undefined {
  return resoudre(env, ['SUPABASE_SECRET_KEY', 'SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY']);
}

/**
 * La clé publique, celle qui agit sous l'identité de l'appelant et à qui RLS
 * s'applique. C'est elle que les paquets servis portent, et c'est normal.
 */
export function clePubliable(env: Record<string, string | undefined>): string | undefined {
  return resoudre(env, [
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEYS',
    'SUPABASE_ANON_KEY',
  ]);
}
```

- [ ] **Step 4 : Lancer le test pour le voir passer**

```bash
npx vitest run supabase/tests/cles.test.ts --config supabase/tests/vitest.config.ts
```

Attendu : **PASS**, 10 tests.

- [ ] **Step 5 : Commit**

```bash
git add supabase/functions/_shared/cles.ts supabase/tests/cles.test.ts
git commit -m "$(cat <<'FIN'
feat(cles): demander une clé secrète, pas une variable d'environnement

Préalable à la fermeture du jeton service_role publié le 2026-08-24. Il
ne se ferme qu'en désactivant les clés héritées du projet, ce qui casse
les onze fonctions tant qu'elles nomment SUPABASE_SERVICE_ROLE_KEY.

Le résolveur accepte l'ancien nom comme le neuf, et préfère le neuf : la
bascule devient un changement de configuration réversible au lieu d'une
réécriture à l'instant où l'on ferme la porte.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
FIN
)"
```

---

## Task 3 : ~~Les onze fonctions passent par le résolveur~~ — SANS OBJET

Même motif que la tâche 2 : les onze fonctions reçoivent déjà les clés du
nouveau format. Aucune n'a besoin d'être touchée, et aucune ne cassera à la
fermeture. **À ne pas exécuter.**

Purement mécanique, et c'est voulu : la décision a été prise en tâche 2. Ici on
ne fait que remplacer un `Deno.env.get` par un appel.

**Fichiers :**
- Modifier : les onze `supabase/functions/*/index.ts` listés dans l'état de
  départ.

**Interfaces :**
- Consomme : `cleSecrete`, `clePubliable` de `_shared/cles.ts`.

- [ ] **Step 1 : Remplacer, fonction par fonction**

Dans chaque fichier, ajouter l'importation à côté des autres imports partagés :

```ts
import { clePubliable, cleSecrete } from '../_shared/cles.ts';
```

Puis remplacer les lectures. Avant :

```ts
  const cleAnon = Deno.env.get('SUPABASE_ANON_KEY');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
```

Après :

```ts
  const env = Deno.env.toObject();
  const cleAnon = clePubliable(env);
  const cleService = cleSecrete(env);
```

`SUPABASE_URL` **ne change pas** : l'adresse du projet n'est pas concernée par
la bascule de clés.

Les trois fonctions qui ne lisent que la clé de service — `demander-ouverture`,
`envoyer-avis`, `mot-de-passe-oublie` — n'ont besoin que de `cleSecrete`.

- [ ] **Step 2 : Vérifier qu'aucune lecture directe ne subsiste**

```bash
grep -rn "SUPABASE_SERVICE_ROLE_KEY\|SUPABASE_ANON_KEY" supabase/functions --include="*.ts" \
  | grep -v "_shared/cles.ts"
```

Attendu : **aucune ligne**. Les seules mentions de ces noms doivent vivre dans le
résolveur, à un seul endroit.

- [ ] **Step 3 : La suite complète**

```bash
npm run db:reset && npm run test:db
```

Attendu : tout au vert. La pile locale porte encore les clés héritées — le
repli du résolveur les trouve, et c'est précisément ce qu'on vérifie ici.

- [ ] **Step 4 : Déployer les onze**

```bash
npx supabase functions deploy
```

**Rien ne change en production à cette étape.** Les clés neuves ne sont pas
encore posées, le résolveur retombe sur les héritées. C'est le but : on prouve
que le nouveau code fonctionne avec l'ancienne configuration avant de changer la
configuration.

- [ ] **Step 5 : Constater que rien n'a bougé**

```bash
curl -si -X OPTIONS \
  https://yfnwmokxkznejotgpfgf.supabase.co/functions/v1/demander-ouverture \
  -H "Origin: https://kolek.cash" -H "Access-Control-Request-Method: POST" \
  | grep -i "access-control-allow-origin"
```

Attendu : `access-control-allow-origin: https://kolek.cash`.

Et l'écran d'administration doit continuer de lister les demandes. Si quelque
chose casse **ici**, c'est le résolveur qui est en cause, et il est encore temps
de revenir en arrière sans avoir touché à aucune clé.

- [ ] **Step 6 : Commit**

```bash
git add supabase/functions
git commit -m "$(cat <<'FIN'
refactor(fonctions): les onze demandent une clé, plus une variable

Aucun changement de comportement : les clés héritées sont encore les
seules posées, et le résolveur les trouve. C'est l'étape qui prouve que
le nouveau code tient avec l'ancienne configuration, avant qu'on change
la configuration.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
FIN
)"
```

---

## Task 4 : `cleAnonyme` reconnaît une clé publiable — ✅ TERMINÉE le 2026-08-28

Sans cette tâche, la tâche 5 casse le contrôle d'après-déploiement — et un
contrôle qui crie à tort finit par être ignoré, c'est écrit en toutes lettres en
tête de `scripts/verifier-en-ligne.mjs`.

`cleAnonyme()` ne reconnaît aujourd'hui qu'un JWT :

```js
const trouve = texte.match(/eyJhbGciOi[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
```

Dès que les sites serviront une `sb_publishable_`, le script rendra « aucune clé
anonyme reconnaissable dans les artefacts servis » — un faux manquement, sur un
déploiement parfaitement sain.

**Fichiers :**
- Modifier : `scripts/verifier-en-ligne.mjs`
- Modifier : `scripts/verifier-en-ligne.test.mjs`

- [ ] **Step 1 : Écrire le test qui échoue**

Dans `scripts/verifier-en-ligne.test.mjs`, ajouter au bloc `describe('cleAnonyme'…)`
existant :

```js
  it('reconnaît une clé publiable du nouveau format', () => {
    // Ajouté le 2026-08-28. Sans ce cas, la bascule vers les clés publishable
    // ferait crier le contrôle sur un déploiement sain — et un contrôle qui
    // crie à tort finit par être ignoré.
    const paquet = 'const k="sb_publishable_ACJWlzQHlZjBrEguHvfOxg";';
    expect(cleAnonyme(paquet)).toBe('sb_publishable_ACJWlzQHlZjBrEguHvfOxg');
  });

  it('reconnaît encore un JWT anon, tant que les deux formats coexistent', () => {
    expect(cleAnonyme('vl=`' + ENTIERE + '`')).toBe(ENTIERE);
  });

  it('ne prend pas une clé secrète pour une clé publiable', () => {
    // Celle-là ne doit jamais atteindre un paquet, et `verifier-bundles` la
    // refuse déjà. Mais si elle y était, la confondre avec la clé publique
    // ferait passer la fuite pour un déploiement normal.
    expect(cleAnonyme('const k="sb_secret_AbCdEf123456789";')).toBeNull();
  });
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

```bash
npx vitest run scripts/verifier-en-ligne.test.mjs
```

Attendu : **FAIL** — `expected null to be 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg'`.

- [ ] **Step 3 : Étendre la fonction**

Dans `scripts/verifier-en-ligne.mjs`, remplacer le corps de `cleAnonyme` :

```js
export function cleAnonyme(texte) {
  // Le format neuf d'abord. `sb_publishable_` est sans ambiguïté — et
  // `sb_secret_`, qui ne doit jamais atteindre un paquet, ne correspond pas :
  // la confondre avec la clé publique ferait passer une fuite pour un
  // déploiement normal. C'est `verifier-bundles.mjs` qui traque celle-là.
  const publiable = texte.match(/sb_publishable_[A-Za-z0-9_-]{8,}/);
  if (publiable) return publiable[0];

  const trouve = texte.match(/eyJhbGciOi[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  return trouve ? trouve[0] : null;
}
```

- [ ] **Step 4 : Corriger le message d'échec, qui devient faux**

Dans la même fonction `verifier()`, le message parle encore d'un préfixe de JWT :

```js
        'aucune clé anonyme reconnaissable dans les artefacts servis — ' +
          "variable d'environnement absente au build, ou clé tronquée (elle doit commencer par « eyJhbGciOi »)",
```

Le remplacer par :

```js
        'aucune clé anonyme reconnaissable dans les artefacts servis — ' +
          "variable d'environnement absente au build, ou clé tronquée " +
          '(elle doit commencer par « sb_publishable_ », ou par « eyJhbGciOi » tant que le format hérité sert)',
```

- [ ] **Step 5 : Lancer les tests**

```bash
npm run test:scripts
```

Attendu : **PASS** sur les six fichiers.

- [ ] **Step 6 : Commit**

```bash
git add scripts/verifier-en-ligne.mjs scripts/verifier-en-ligne.test.mjs
git commit -m "$(cat <<'FIN'
fix(scripts): le contrôle d'après-déploiement lit aussi une clé publiable

Sans ça, la bascule de la tâche suivante ferait rendre « aucune clé
anonyme reconnaissable » sur un déploiement parfaitement sain. Un
garde-fou qui crie à tort finit par être ignoré, et c'est celui-là qui a
attrapé la clé amputée du 2026-08-23.

Une sb_secret_ ne correspond pas : la confondre avec la clé publique
ferait passer une fuite pour un déploiement normal.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
FIN
)"
```

---

## Task 5 : Les trois sites servent la clé publiable — ✅ TERMINÉE le 2026-08-28

**Fichiers :** aucun dans le dépôt. Variables d'environnement Netlify.

Les trois `.env.production` du dépôt ne portent que des noms, pas de valeurs —
les valeurs vivent dans Netlify. `scripts/garde-env.mjs:108` accepte déjà
`sb_publishable_` : le garde-fou du build ne s'y opposera pas.

- [ ] **Step 1 : Relever la clé publiable**

Supabase → **Settings → API Keys** → clé `publishable`. Elle commence par
`sb_publishable_`. Elle est **publique par conception** — elle vit dans le
paquet JavaScript servi à tout visiteur, exactement comme la clé `anon`
aujourd'hui.

- [ ] **Step 2 : La poser sur les trois sites**

Netlify → chaque site → **Site configuration → Environment variables** →
`VITE_SUPABASE_ANON_KEY`.

| Site | Identifiant |
|---|---|
| `kolek-site` | `eae737cb-2247-49d6-a190-2a662f9af5e2` |
| `kolek-collecteur` | `56d28aa0-de05-4a92-b384-4a576685fe47` |
| `kolek-admin` | `401e55b2-0aaa-4f02-a21a-18e777bf9369` |

Le **nom de la variable ne change pas**. C'est sa valeur qui change. Renommer
obligerait à toucher `supabase.ts` dans les trois applications, pour aucun gain.

- [ ] **Step 3 : Reconstruire les trois**

Un déclenchement manuel depuis Netlify suffit — aucun commit n'est nécessaire,
c'est la variable qui a changé. **Le paquet servi porte la clé** : sans
reconstruction, les sites continuent d'envoyer l'ancienne.

- [ ] **Step 4 : Vérifier**

```bash
npm run build && npm run verifier:en-ligne
```

Attendu : les trois cibles conformes. Le contrôle relit la clé dans le paquet
servi — grâce à la tâche 4 il la reconnaît — puis **éprouve sa validité** contre
`/auth/v1/settings`. C'est ce contrôle-là qui a attrapé la clé amputée du
2026-08-23 ; il attrapera une clé publiable mal recopiée.

- [ ] **Step 5 : Essayer les trois surfaces à la main**

Se connecter au collecteur, ouvrir l'administration, déposer une demande depuis
la vitrine. Les clés héritées fonctionnent encore : si quelque chose casse ici,
c'est la clé publiable qui est en cause, et on peut remettre l'ancienne valeur
en une minute.

---

## Task 6 : Le secret du Vault — ✅ TERMINÉE le 2026-08-28

Celui qu'on oublie, et dont l'oubli ne casse **rien de visible**.
`avis_declencher_drainage` lit `kolek_cle_service` pour réveiller `envoyer-avis`.
Non mis à jour, la fonction se fait refuser et **la file d'avis cesse
silencieusement de se vider** — on le découvre à la première contestation d'un
client.

**Fichiers :** aucun. SQL exécuté sur le projet distant.

- [ ] **Step 1 : Relever la clé secrète**

Supabase → **Settings → API Keys** → clé `secret`, commençant par `sb_secret_`.

**Elle ne doit apparaître nulle part ailleurs.** Ni dans le dépôt, ni dans une
conversation, ni dans un historique de terminal. La saisir directement dans
l'éditeur SQL du tableau de bord, pas dans un terminal local.

- [ ] **Step 2 : Remplacer le secret**

Supabase → **SQL Editor** :

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'kolek_cle_service'),
  '<coller la clé sb_secret_ ici>'
);
```

- [ ] **Step 3 : Vérifier sans divulguer**

```sql
select name,
       length(decrypted_secret) as longueur,
       left(decrypted_secret, 10) as prefixe
from vault.decrypted_secrets
where name in ('kolek_url', 'kolek_cle_service');
```

Attendu : `kolek_cle_service` avec le préfixe `sb_secret_`. S'il commence encore
par `eyJhbGciOi`, la mise à jour n'a pas pris.

- [ ] **Step 4 : Éprouver le drainage**

```sql
select public.avis_declencher_drainage();
```

Attendu : aucune erreur. Puis vérifier dans **Logs → Edge Functions** que
`envoyer-avis` a bien été appelée et n'a pas répondu `401`.

C'est le seul moyen de savoir : cette chaîne n'a pas de symptôme visible côté
application.

---

## Task 7 : Fermer les clés héritées — ✅ TERMINÉE le 2026-08-28

Le geste qui referme le 24 août. Toutes les surfaces portent désormais les clés
neuves, et les tâches 3 à 6 l'ont prouvé une par une.

**Fichiers :** aucun.

- [ ] **Step 1 : Désactiver**

Supabase → **Settings → API Keys** → désactiver les clés `anon` et
`service_role` héritées.

**Toutes les sessions ouvertes tombent.** Les collecteurs devront se reconnecter.
À faire à une heure creuse — le produit sert des marchés, donc plutôt tard le
soir.

- [ ] **Step 2 : La mesure qui fait foi**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" \
  -H "apikey: <la clé anon d'avant l'incident>" \
  https://yfnwmokxkznejotgpfgf.supabase.co/auth/v1/settings
```

Attendu : **`401`**.

C'est le seul critère de réussite de ce plan. Un `200` signifie que le jeton
`service_role` du 24 août ouvre toujours la base, et que rien de ce qui précède
n'a servi.

- [ ] **Step 3 : Vérifier que tout le reste tient**

```bash
npm run build && npm run verifier:en-ligne
```

Attendu : les trois cibles conformes.

Puis, à la main : connexion collecteur, écran d'administration, dépôt d'une
demande, accord d'une demande avec réception du courriel.

- [ ] **Step 4 : Si quelque chose casse**

Réactiver les clés héritées, qui restent réactivables. Diagnostiquer, corriger,
refermer. Ne pas laisser la porte ouverte « le temps de comprendre » : c'est
ainsi qu'on est resté quatre jours avec une clé publiée.

---

## Task 8 : Consigner — ✅ TERMINÉE le 2026-08-28

**Fichiers :**
- Modifier : `Docs/deploiement.md`
- Créer : `Docs/audits/2026-08-28-fermeture-cle-service.md`

- [ ] **Step 1 : L'audit de fermeture**

Écrire le compte rendu : la date de publication, la durée d'exposition, les deux
mesures qui prouvaient qu'elle vivait encore, la séquence suivie, et la mesure
finale à `401`.

Y consigner surtout **ce qui a rendu la fermeture longue** : le projet avait
migré vers les JWT Signing Keys, le bouton *Generate new secret* n'existait plus,
et la seule voie passait par une migration de format que rien n'avait préparée.

- [ ] **Step 2 : Mettre à jour `Docs/deploiement.md`**

Remplacer les mentions de `SUPABASE_SERVICE_ROLE_KEY` par le nouveau contrat, et
ajouter le résolveur `_shared/cles.ts` à la description des fonctions.

- [ ] **Step 3 : Commit et push**

```bash
git add Docs
git commit -m "$(cat <<'FIN'
docs(audit): la clé service_role du 2026-08-24 est fermée

Quatre jours d'exposition. Ce qui a coûté le plus n'est pas la
fermeture mais le chemin : le projet avait migré vers les JWT Signing
Keys, « Generate new secret » n'existait plus, et la seule voie passait
par un changement de format de clés que rien n'avait préparé.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
FIN
)"
git push
```

---

## Vérification finale

```bash
npm run verifier          # thème, marque, paliers, tests, build, bundles
npm run verifier:dns      # les quatre enregistrements
npm run verifier:en-ligne # en-têtes, CSP, fraîcheur, SEO, redirections
```

Et les trois contrôles qu'aucune commande ne couvre :

| À vérifier | Comment | Attendu |
|---|---|---|
| La clé volée est morte | `curl` avec l'ancienne clé anon | `401` |
| La file d'avis se vide | `select public.avis_declencher_drainage();` puis les journaux | `envoyer-avis` appelée, pas de `401` |
| Le chemin nominal | Demande déposée, accordée, courriel reçu, mot de passe choisi | Le collecteur entre dans `app.kolek.cash` |

## Ce qui reste ouvert après ce lot

- **Aucun CAPTCHA sur les fonctions publiques.** La borne par IP ferme le script
  sur une machine, pas un réseau d'adresses. Turnstile reste la réponse
  recommandée par l'audit du 2026-08-25.
- **DMARC en `p=none`.** À passer en `p=quarantine` après quelques semaines
  d'envois propres, pour empêcher qu'on usurpe `@kolek.cash` auprès des
  collecteurs.
- **La rotation périodique.** Rien n'impose aujourd'hui de renouveler la clé
  secrète. Ce plan ferme un incident ; il n'installe pas d'habitude.
