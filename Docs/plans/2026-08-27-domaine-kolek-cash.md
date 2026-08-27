# Bascule vers `kolek.cash` — plan d'implémentation

> **Pour un agent d'exécution :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:executing-plans` (exécution en session) ou
> `superpowers:subagent-driven-development` (un agent frais par tâche) pour
> dérouler ce plan tâche par tâche. Les étapes portent des cases à cocher
> (`- [ ]`) pour le suivi.

**But :** faire servir les trois applications Kolek sur le domaine `kolek.cash`
acheté chez Hostinger, sans perte de service, et rétablir au passage la connexion
Google tombée le 2026-08-24.

**Architecture :** le DNS reste chez Hostinger ; les trois sites restent hébergés
chez Netlify, qui reçoit le domaine par un `A` sur l'apex et trois `CNAME`. Rien
n'est déplacé. Ce qui change, ce sont quatre enregistrements DNS, quatre réglages
de tableau de bord, et onze fichiers du dépôt qui portaient l'ancienne adresse en
dur. Chaque étape manuelle est suivie d'un contrôle automatisé qui refuse de
passer si l'étape n'a pas pris.

**Pile :** Node 26, vitest 4, `node:dns/promises`, Netlify, Supabase (GoTrue +
Edge Functions), Hostinger (DNS seul).

## Contraintes globales

- **Tout est en français** : code, commentaires, messages d'erreur, tests,
  messages de commit. C'est la langue du dépôt, sans exception.
- **Le dépôt est public.** Aucun secret n'y entre — ni le *Client Secret* Google,
  ni la clé de service Supabase. Ils vivent dans les tableaux de bord.
- **Domaine :** `kolek.cash` (vitrine, apex), `app.kolek.cash` (collecteur),
  `admin.kolek.cash` (administration), `www.kolek.cash` (redirection 301 vers
  l'apex).
- **Anciennes adresses**, qui restent le nom Netlify permanent de chaque site et
  servent de cible aux `CNAME` : `kolek-site.netlify.app`,
  `kolek-collecteur.netlify.app`, `kolek-admin.netlify.app`.
- **Projet Supabase :** `yfnwmokxkznejotgpfgf`.
- **Client OAuth Google :**
  `628756097498-qce9okb14trgqrl9cb70hfo3efeshrgj.apps.googleusercontent.com`,
  posé dans Supabase le 2026-08-27. Il **remplace**
  `441950688442-j01ivp28fqn1l5fcte54lcbht123cc64…`, dont le secret ne
  correspondait plus. Le projet Google Cloud a changé avec lui — numéro
  `628756097498` et non `441950688442`.
- **L'unique URI de redirection à déclarer côté Google**, quel que soit le
  client : `https://yfnwmokxkznejotgpfgf.supabase.co/auth/v1/callback`. Elle ne
  dépend ni du domaine, ni de Netlify.
- **Style de commit :** `type(portée): phrase en français, en minuscule`, à
  l'image de `feat(vitrine): de quoi être trouvé sur Google, et vérifié comme le
  reste`.
- **L'ordre des tâches 3 à 7 n'est pas négociable.** Le dépôt se pousse en
  dernier : il porte les liens vers `app.kolek.cash` et les listes d'origines
  CORS, qui seraient faux tant que le DNS ne répond pas.

## État de départ

Les modifications du dépôt sont **déjà faites et non commitées** — douze fichiers
dans l'arbre de travail, `npm test` et `npm run test:scripts` au vert. Elles
attendent la tâche 7. Ne pas les refaire ; ne pas les pousser avant.

### Ce qui est déjà acquis, mesuré le 2026-08-27

**La tâche 3 est faite.** Les quatre enregistrements résolvent, un seul par nom —
aucun reliquat de parking :

```
kolek.cash        A      75.2.60.5
www.kolek.cash    CNAME  kolek-site.netlify.app
app.kolek.cash    CNAME  kolek-collecteur.netlify.app
admin.kolek.cash  CNAME  kolek-admin.netlify.app
```

**La tâche 4 ne l'est pas.** Le point d'entrée Netlify répond bien sur
`kolek.cash`, mais il sert le certificat générique `CN=*.netlify.app` et renvoie
`404` :

```
$ curl -k -o /dev/null -w '%{http_code}' https://kolek.cash
404
$ openssl s_client -connect kolek.cash:443 -servername kolek.cash | openssl x509 -noout -subject
subject=... O=Netlify, Inc, CN=*.netlify.app
```

Ce couple — certificat générique **et** 404 — dit une chose précise : le DNS
mène à Netlify, mais **aucun site Netlify ne revendique ce nom d'hôte**. Ce n'est
pas un certificat en cours d'émission ; c'est un domaine qui n'a pas été ajouté.

Les trois adresses `.netlify.app` répondent encore `200` sans redirection, ce qui
est cohérent : le domaine principal ne peut pas être posé sur un domaine absent.

**Reprendre à la tâche 4.** Les tâches 1, 2, 5 à 9 restent entières.

---

## Task 1 : Rétablir la connexion Google — ✅ TERMINÉE le 2026-08-27

Panne en production du 2026-08-24 au 2026-08-27. Aucun code n'était en cause.

**Ce qui l'a réglée, dans l'ordre :** un client OAuth neuf posé dans Supabase
(`628756097498-qce9okb…`), puis l'URI de redirection
`https://yfnwmokxkznejotgpfgf.supabase.co/auth/v1/callback` déclarée sur ce
client — elle manquait, et bloquait au premier pas —, puis le rattachement de
l'adresse Google au compte Kolek, `disable_signup` refusant par construction
toute adresse sans compte ouvert par GTCS.

Le détail des sondes est conservé ci-dessous : il a coûté trois jours, et la même
panne reviendra le jour où un secret sera de nouveau régénéré.

**Fichiers :** aucun. Deux tableaux de bord.

**Ce que les sondes ont établi** (à ne pas refaire, c'est acquis) :

- `GET /auth/v1/authorize?provider=google` renvoie un 302 vers Google portant le
  bon `client_id` et `redirect_uri=https://yfnwmokxkznejotgpfgf.supabase.co/auth/v1/callback` ;
- Google accepte cette requête et sert son écran de connexion — donc le
  `client_id` est connu de lui et la `redirect_uri` est déclarée ;
- le journal du 2026-08-27 12:38 montre `authorize` (12:38:28) puis `callback`
  (12:38:32) avec un `code=4/0ATs…` frais, puis **plus rien** : ni
  `POST /token?grant_type=pkce`, ni `GET /user` ;
- quatre secondes et un seul `callback` éliminent `invalid_grant` — code ni
  expiré, ni rejoué ;
- une sonde sur le point de jeton de Google avec un secret volontairement faux
  répond `invalid_client — The provided client secret is invalid`, et le fait
  **avant même de regarder le code**.

Il ne reste qu'une variable : le *Client Secret* enregistré dans Supabase.

### Reprise du 2026-08-27 — un client neuf, et une URI oubliée

Plutôt qu'un secret ajouté au client existant, **un client OAuth entièrement neuf
a été créé**, dans un autre projet Google Cloud, et posé dans Supabase :

```
avant : 441950688442-j01ivp28fqn1l5fcte54lcbht123cc64.apps.googleusercontent.com
après  : 628756097498-qce9okb14trgqrl9cb70hfo3efeshrgj.apps.googleusercontent.com
```

C'est une voie légitime, mais elle déplace le problème : **un client neuf ne
connaît aucune URI de redirection.** Mesuré aussitôt, en suivant l'adresse
d'autorisation servie par le projet :

```
HTTP 302 → accounts.google.com/signin/oauth/error?authError=…
```

Le contenu de `authError`, décodé, est le message de Google lui-même :

> `redirect_uri_mismatch`
> Vous ne pouvez pas vous connecter à cette appli, car elle ne respecte pas le
> règlement OAuth 2.0 de Google. Si vous êtes le développeur de l'appli,
> enregistrez l'URI de redirection dans la console Google Cloud.
> `redirect_uri: https://yfnwmokxkznejotgpfgf.supabase.co/auth/v1/callback`

La panne a donc changé de place : elle n'est plus à l'échange du code, elle est
**au tout premier pas**. Le collecteur ne voit même plus l'écran Google, mais un
« Accès bloqué — Erreur 400 ». Les étapes ci-dessous sont réécrites en
conséquence : c'est l'URI qu'il faut déclarer, avant de rien toucher au secret.

- [x] **Step 0 : Déclarer l'URI de redirection sur le client neuf** — *fait, et
  vérifié le 2026-08-27 : l'adresse d'autorisation mène désormais à
  `Sign in - Google Accounts`, sans `redirect_uri_mismatch`.*

Google Cloud Console → sélectionner le projet **`628756097498`** → **APIs &
Services → Credentials** → client `628756097498-qce9okb14trgqrl9cb70hfo3efeshrgj`.

| Champ | Valeur, exactement |
|---|---|
| Authorized redirect URIs | `https://yfnwmokxkznejotgpfgf.supabase.co/auth/v1/callback` |
| Authorized JavaScript origins | `https://yfnwmokxkznejotgpfgf.supabase.co` |

Une seule adresse de redirection, et ce n'est **pas** celle de l'application :
Google ne redirige jamais vers Netlify.

Puis vérifier que le *Client Secret* posé dans Supabase est bien celui **de ce
client-ci**. Un identifiant d'un client et un secret d'un autre donnent
`invalid_client`, c'est-à-dire la panne d'origine.

> **Vérifié le 2026-08-27 : le secret est bon, et l'écran de consentement ne
> bloque pas.** Un essai réel a rendu, non plus « la configuration du projet »,
> mais *« Cette adresse Google n'est rattachée à aucun compte Kolek »*. Ce
> message-là vient de `MESSAGE_COMPTE_NON_RATTACHE`, branche `signup_disabled` de
> `erreurOAuth.ts` — et GoTrue ne connaît l'adresse de l'utilisateur **qu'après
> avoir échangé le code et lu le profil**. Le refus est donc postérieur à
> l'échange : le secret a fonctionné.
>
> Les étapes 0 bis et 1 ci-dessous n'ont plus lieu d'être. Ce qui reste n'est pas
> un défaut de configuration mais le portillon qui fait son travail — voir
> l'étape 4.

- [ ] ~~**Step 0 bis : L'écran de consentement du projet neuf**~~ — *sans objet :
  un consentement bloqué n'aurait jamais laissé GoTrue lire l'adresse.*

Même projet → **Google Auth Platform / OAuth consent screen**.

Un projet fraîchement créé s'y trouve en mode **Testing**, et en mode Testing
**seules les adresses inscrites en *Test users* peuvent se connecter** — les
autres reçoivent un « Accès bloqué » qui ressemble trait pour trait à l'erreur
qu'on vient de corriger.

Deux issues, au choix : inscrire les adresses des collecteurs en *Test users*, ou
publier l'application (*Publish app*). Pour un usage interne avec quelques
comptes, la première suffit et ne demande aucune vérification Google.

C'est le prochain mur, et il est invisible tant que le premier n'est pas tombé.

- [ ] **Step 1 : Créer un secret neuf côté Google**

*(À sauter si le secret du client `628756097498-…` a déjà été posé dans Supabase
à l'étape 0.)*

Google Cloud Console → **APIs & Services → Credentials** → le client
`441950688442-j01ivp28fqn1l5fcte54lcbht123cc64` → **Add secret**.

Google accepte plusieurs secrets en parallèle : créer le nouveau ne coupe pas
l'ancien. L'opération est donc sans risque, même en pleine journée.

Le secret ne s'affiche **qu'une fois**. Le copier immédiatement.

- [ ] **Step 2 : Le poser dans Supabase**

Supabase → **Authentication → Providers → Google** → coller le nouveau secret →
*Save*.

Vérifier qu'il n'y a **ni espace ni retour à la ligne** avant ou après. C'est la
cause la plus fréquente de cette panne exacte, et elle ne se voit pas dans le
champ.

Ne pas toucher au *Client ID* : il est prouvé bon.

- [ ] **Step 3 : Vérifier par le journal, pas par l'écran**

Se déconnecter de l'application collecteur, cliquer « Continuer avec Google »,
aller au bout. Puis Supabase → **Logs → Auth Logs**, dans la minute.

Attendu, dans cet ordre :

```
GET  /auth/v1/authorize  302
GET  /auth/v1/callback   302
POST /auth/v1/token      200   ← grant_type=pkce
GET  /auth/v1/user       200
```

Les deux dernières lignes sont celles qui manquaient. Leur présence est la
preuve ; l'écran qui s'ouvre n'en est qu'une conséquence.

Si `POST /token` répond encore autre chose que 200, **s'arrêter** et rouvrir le
détail de la ligne `/callback` : l'erreur remontée par Google y est écrite en
clair. Ne pas enchaîner sur la tâche 2 avec une hypothèse de plus.

- [ ] **Step 4 : Rattacher l'adresse Google à un compte Kolek**

Le refus constaté le 2026-08-27 — *« Cette adresse Google n'est rattachée à aucun
compte Kolek »* — n'est pas un défaut. C'est `disable_signup` qui fait son
travail : Kolek n'a pas d'inscription libre, les comptes sont ouverts par GTCS.

GoTrue rapproche une identité Google d'un compte existant **par l'adresse
courriel**, et seulement si celle du compte est confirmée.
`admin-creer-collecteur` pose `email_confirm: true`
([index.ts:152](../../supabase/functions/admin-creer-collecteur/index.ts#L152)),
donc un compte ouvert par la voie normale se rattache tout seul.

Deux causes possibles, à départager dans **Authentication → Users** :

| Constat | Cause | Remède |
|---|---|---|
| Aucun utilisateur ne porte l'adresse Google choisie au sélecteur de comptes | Ce n'est pas le bon compte Google — le sélecteur en propose souvent trois | Recommencer en choisissant l'adresse du collecteur |
| L'utilisateur existe, mais son adresse n'est pas confirmée | Compte créé hors de `admin-creer-collecteur` | Confirmer l'adresse depuis la fiche utilisateur |
| L'adresse Google visée n'a aucun compte, et doit en avoir un | Compte jamais ouvert | Le créer par l'écran d'administration |

**Le piège du sélecteur.** Le journal du 2026-08-27 portait `authuser=2` : le
navigateur avait trois sessions Google ouvertes, et c'est la troisième qui est
partie. L'adresse rattachée au compte Kolek n'est pas forcément celle que Chrome
propose en premier.

---

## Task 2 : `scripts/verifier-dns.mjs` — savoir si le DNS répond

Le contrôle qui manque aujourd'hui. « Est-ce que le DNS répond ? » se pose
plusieurs fois par heure pendant une propagation, et se répond mal à l'œil : le
résolveur du poste garde en cache la réponse négative d'avant la création des
enregistrements, et fait croire à un échec pendant des heures.

**Fichiers :**
- Créer : `scripts/verifier-dns.mjs`
- Créer : `scripts/verifier-dns.test.mjs`
- Modifier : `package.json` (bloc `scripts`)

**Interfaces :**
- Produit : `ATTENDUS` (tableau de `{ hote, type, valeur }`), `normaliser(valeur)`,
  `manquesDns(observe, attendus?)` → `string[]`. `observe` est un objet
  `{ [hote]: { A?: string[], CNAME?: string[] } }`.
- Consomme : rien.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `scripts/verifier-dns.test.mjs` :

```js
import { describe, expect, it } from 'vitest';

import { ATTENDUS, manquesDns, normaliser } from './verifier-dns.mjs';

// Le script interroge le réseau : ce qui se teste ici, c'est la fonction qui
// décide si ce qu'on a observé est conforme. Elle reçoit des relevés en clair,
// jamais une résolution réelle — sinon le test dépendrait du DNS du poste, et
// tomberait dans un train ou un avion.

/** Un relevé complet et conforme, dont chaque test dégrade une seule ligne. */
function releve(remplacements = {}) {
  return {
    'kolek.cash': { A: ['75.2.60.5'] },
    'www.kolek.cash': { CNAME: ['kolek-site.netlify.app'] },
    'app.kolek.cash': { CNAME: ['kolek-collecteur.netlify.app'] },
    'admin.kolek.cash': { CNAME: ['kolek-admin.netlify.app'] },
    ...remplacements,
  };
}

describe('normaliser', () => {
  it('retire le point final et la casse', () => {
    // Un résolveur rend le nom pleinement qualifié, avec le point de la racine.
    // Comparer sans normaliser ferait échouer un DNS parfaitement juste.
    expect(normaliser('Kolek-Site.Netlify.App.')).toBe('kolek-site.netlify.app');
  });
});

describe('manquesDns', () => {
  it('ne trouve rien à redire à un relevé conforme', () => {
    expect(manquesDns(releve())).toEqual([]);
  });

  it('déclare les quatre enregistrements attendus', () => {
    // Le tableau est la seule source : un enregistrement oublié ici ne serait
    // jamais contrôlé, et l'absence ne se verrait qu'en production.
    expect(ATTENDUS.map((a) => a.hote)).toEqual([
      'kolek.cash',
      'www.kolek.cash',
      'app.kolek.cash',
      'admin.kolek.cash',
    ]);
  });

  it('signale un enregistrement qui ne résout pas encore', () => {
    const observe = releve();
    delete observe['app.kolek.cash'];
    expect(manquesDns(observe)).toContain('app.kolek.cash — CNAME introuvable');
  });

  it('traite une réponse vide comme une absence', () => {
    // `resolveCname` peut rendre un tableau vide plutôt que lever. Les deux
    // disent la même chose et doivent produire le même message.
    const manques = manquesDns(releve({ 'admin.kolek.cash': { CNAME: [] } }));
    expect(manques).toContain('admin.kolek.cash — CNAME introuvable');
  });

  it('signale une valeur qui ne correspond pas', () => {
    const manques = manquesDns(releve({ 'app.kolek.cash': { CNAME: ['kolek-admin.netlify.app'] } }));
    expect(manques.some((m) => m.startsWith('app.kolek.cash — CNAME vaut'))).toBe(true);
  });

  it('signale plusieurs enregistrements sur l’apex — le parking Hostinger', () => {
    // Le piège réel : Hostinger pose un `A` vers sa page d'attente, et le
    // laisser en place donne deux `A` sur l'apex. Le visiteur tombe une fois
    // sur deux sur « domaine réservé », sans qu'aucun message n'explique rien.
    const manques = manquesDns(releve({ 'kolek.cash': { A: ['75.2.60.5', '84.32.84.32'] } }));
    expect(manques.some((m) => m.includes('2 enregistrements A'))).toBe(true);
  });

  it('tolère le point final et la casse rendus par un résolveur', () => {
    const manques = manquesDns(releve({ 'www.kolek.cash': { CNAME: ['Kolek-Site.Netlify.App.'] } }));
    expect(manques).toEqual([]);
  });
});
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

```bash
npx vitest run scripts/verifier-dns.test.mjs
```

Attendu : **FAIL**, avec `Failed to resolve import "./verifier-dns.mjs"`.

- [ ] **Step 3 : Écrire le script**

Créer `scripts/verifier-dns.mjs` :

```js
// Le DNS, avant tout le reste.
//
// Pendant une propagation, « est-ce que ça répond ? » se pose toutes les dix
// minutes — et se répond mal à l'œil. Deux raisons, et aucune n'est évidente :
//
// 1. **Le cache négatif.** Une adresse interrogée *avant* la création de son
//    enregistrement fait mémoriser au résolveur qu'elle n'existe pas, pour la
//    durée déclarée par le SOA de la zone. On regarde ensuite un DNS déjà juste
//    en croyant qu'il ne l'est pas.
// 2. **Le doublon.** Hostinger pose de son propre chef un `A` vers sa page
//    d'attente. Le laisser en place donne deux `A` sur l'apex, et le visiteur
//    tombe une fois sur deux sur « domaine réservé ». Une résolution unique
//    répond « oui » et ne dit rien du second.
//
// Ce script interroge un résolveur public par défaut — pas celui du poste, qui
// est justement celui qui ment — et compare l'ensemble des réponses, pas la
// première.
//
//   node scripts/verifier-dns.mjs             # via 1.1.1.1
//   node scripts/verifier-dns.mjs --systeme   # via le résolveur du poste
//
// Sortie non nulle tant qu'un enregistrement manque ou diverge.

import { Resolver } from 'node:dns/promises';
import { pathToFileURL } from 'node:url';

/** Le résolveur interrogé par défaut. Public, et hors du cache du poste. */
export const RESOLVEUR_PUBLIC = '1.1.1.1';

/**
 * Ce que la zone doit contenir.
 *
 * L'apex prend un `A` et non un `CNAME` : la spécification interdit un `CNAME`
 * à la racine d'une zone, et Hostinger le refuserait. C'est la raison pour
 * laquelle Netlify publie une IP de répartiteur — à relire dans son tableau de
 * bord si ce contrôle échoue sur l'apex seul, une IP recopiée vieillit.
 */
export const ATTENDUS = [
  { hote: 'kolek.cash', type: 'A', valeur: '75.2.60.5' },
  { hote: 'www.kolek.cash', type: 'CNAME', valeur: 'kolek-site.netlify.app' },
  { hote: 'app.kolek.cash', type: 'CNAME', valeur: 'kolek-collecteur.netlify.app' },
  { hote: 'admin.kolek.cash', type: 'CNAME', valeur: 'kolek-admin.netlify.app' },
];

/**
 * Met un nom d'hôte sous une forme comparable.
 *
 * Un résolveur rend le nom pleinement qualifié — point de la racine compris — et
 * ne garantit pas la casse. Comparer les chaînes brutes ferait échouer un DNS
 * parfaitement juste, ce qui est la pire façon de perdre une heure.
 */
export function normaliser(valeur) {
  return String(valeur).trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Ce qui manque, ou ce qui diverge, dans un relevé de zone.
 *
 * Fonction pure : elle reçoit des réponses déjà obtenues plutôt que d'interroger
 * elle-même. C'est ce qui permet de la vérifier sur les trois cas qui comptent —
 * absence, valeur fausse, doublon — sans dépendre du réseau du poste.
 */
export function manquesDns(observe, attendus = ATTENDUS) {
  const manques = [];

  for (const { hote, type, valeur } of attendus) {
    const trouves = observe[hote]?.[type];

    if (!trouves || trouves.length === 0) {
      manques.push(`${hote} — ${type} introuvable`);
      continue;
    }

    if (trouves.length > 1) {
      // Le cas Hostinger. On le nomme, parce qu'un « valeur inattendue » ferait
      // corriger la bonne ligne au lieu de supprimer la mauvaise.
      manques.push(
        `${hote} — ${trouves.length} enregistrements ${type} : ${trouves.join(', ')}. ` +
          "Un seul est attendu — supprimer l'enregistrement de parking.",
      );
      continue;
    }

    if (normaliser(trouves[0]) !== normaliser(valeur)) {
      manques.push(`${hote} — ${type} vaut ${trouves[0]}, attendu ${valeur}`);
    }
  }

  return manques;
}

/** Interroge un résolveur pour chaque enregistrement attendu. */
async function relever(attendus, serveur) {
  const resolveur = new Resolver();
  if (serveur) resolveur.setServers([serveur]);

  const observe = {};
  for (const { hote, type } of attendus) {
    observe[hote] ??= {};
    try {
      observe[hote][type] =
        type === 'A' ? await resolveur.resolve4(hote) : await resolveur.resolveCname(hote);
    } catch {
      // `ENOTFOUND` comme `ENODATA` disent la même chose ici : l'enregistrement
      // n'est pas publié. On laisse la clé absente, et `manquesDns` le formule.
      // Distinguer les deux codes n'apporterait rien à qui attend une
      // propagation.
    }
  }
  return observe;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const serveur = process.argv.includes('--systeme') ? null : RESOLVEUR_PUBLIC;
  const source = serveur ?? 'le résolveur du système';

  const manques = manquesDns(await relever(ATTENDUS, serveur));

  if (manques.length === 0) {
    console.log(`Le DNS répond, d'après ${source}. Les quatre enregistrements sont en place.`);
    process.exit(0);
  }

  console.error(`Le DNS n'est pas prêt, d'après ${source} :`);
  for (const manque of manques) console.error(`  x ${manque}`);
  console.error(
    "\nSi ces enregistrements viennent d'être créés, attendre et relancer : un " +
      'résolveur garde en mémoire une réponse négative aussi longtemps qu’une positive.',
  );
  process.exit(1);
}
```

- [ ] **Step 4 : Lancer le test pour le voir passer**

```bash
npx vitest run scripts/verifier-dns.test.mjs
```

Attendu : **PASS**, 8 tests.

- [ ] **Step 5 : Câbler la commande npm**

Dans `package.json`, ajouter la ligne `verifier:dns` juste avant
`verifier:en-ligne` :

```json
    "verifier:bundles": "node scripts/verifier-bundles.mjs",
    "verifier:dns": "node scripts/verifier-dns.mjs",
    "verifier:en-ligne": "node scripts/verifier-en-ligne.mjs",
```

Ne **pas** l'ajouter à la commande `verifier` agrégée : elle tourne avant chaque
livraison, et un contrôle qui dépend du réseau extérieur y ferait échouer des
constructions qui n'ont rien à voir avec le DNS.

- [ ] **Step 6 : L'essayer pour de vrai**

```bash
npm run verifier:dns
```

Attendu **à ce stade** : échec, avec quatre lignes `introuvable`. C'est le
résultat juste — les enregistrements n'existent pas encore. Un succès ici
signifierait que le script ne contrôle rien.

- [ ] **Step 7 : Commit**

```bash
git add scripts/verifier-dns.mjs scripts/verifier-dns.test.mjs package.json
git commit -m "$(cat <<'FIN'
feat(scripts): savoir si le DNS répond, sans croire le résolveur du poste

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
FIN
)"
```

---

## Task 3 : Les quatre enregistrements chez Hostinger

**Fichiers :** aucun. hPanel.

- [ ] **Step 1 : Supprimer le parking**

hPanel → **Domaines** → `kolek.cash` → **DNS / Serveurs de noms** → *Gérer les
enregistrements DNS*.

Supprimer :
- l'enregistrement `A` sur `@` qui pointe vers l'IP de la page d'attente
  Hostinger ;
- l'enregistrement `CNAME` sur `www` qui la suit.

Les laisser donnerait deux `A` sur l'apex. Le contrôle de la tâche 2 le dira,
mais autant ne pas les créer.

- [ ] **Step 2 : Relever l'IP de l'apex dans Netlify**

Netlify → site `kolek-site` → **Domain management** → *Add a domain* →
`kolek.cash`. Netlify affiche l'enregistrement `A` exact à créer.

Si l'IP diffère de `75.2.60.5`, **c'est Netlify qui a raison** : corriger
`ATTENDUS` dans `scripts/verifier-dns.mjs`, relancer `npm run test:scripts --
verifier-dns`, et commiter la correction avant de continuer.

- [ ] **Step 3 : Créer les quatre enregistrements**

| Type | Nom | Valeur | TTL |
|---|---|---|---|
| `A` | `@` | `75.2.60.5` | 3600 |
| `CNAME` | `www` | `kolek-site.netlify.app` | 3600 |
| `CNAME` | `app` | `kolek-collecteur.netlify.app` | 3600 |
| `CNAME` | `admin` | `kolek-admin.netlify.app` | 3600 |

Les valeurs de `CNAME` sont des **noms d'hôtes**, pas des adresses : ni `https://`,
ni barre oblique finale. Hostinger accepte les deux formes à la saisie et n'en
publie qu'une correctement.

Ne pas toucher aux serveurs de noms. Les déplacer chez Netlify emporterait les
`MX` avec eux, et couperait toute adresse `@kolek.cash` ouverte plus tard.

- [ ] **Step 4 : Attendre, en mesurant**

```bash
npm run verifier:dns
```

À relancer jusqu'au vert. Attendu à terme :

```
Le DNS répond, d'après 1.1.1.1. Les quatre enregistrements sont en place.
```

Compter de quelques minutes à quelques heures. Tant que ça n'est pas vert, **ne
pas passer à la tâche 4** : Netlify ne peut pas émettre de certificat pour un nom
qui ne résout pas, et l'échec ressemble à une panne de Netlify.

Une fois le résolveur public au vert, comparer avec celui du poste :

```bash
npm run verifier:dns -- --systeme
```

S'il reste rouge alors que le public est vert, c'est un cache local, pas un
problème de zone. Il se videra seul.

---

## Task 4 : Les trois domaines chez Netlify

**Fichiers :** aucun. Tableau de bord Netlify.

- [ ] **Step 1 : Ajouter les domaines**

Pour chaque site, **Site configuration → Domain management → Add a domain** :

| Site Netlify | Domaines à ajouter |
|---|---|
| `kolek-site` | `kolek.cash`, puis `www.kolek.cash` |
| `kolek-collecteur` | `app.kolek.cash` |
| `kolek-admin` | `admin.kolek.cash` |

- [ ] **Step 2 : Poser le domaine principal**

Sur chaque site, marquer le nouveau domaine comme *primary domain* :
`kolek.cash`, `app.kolek.cash`, `admin.kolek.cash`.

Ce champ n'est pas cosmétique. C'est lui qui fait rediriger l'adresse
`.netlify.app` en 301 vers le nouveau domaine. Sans lui, **les deux adresses
servent la même application** — deux origines, alors que les listes CORS de la
tâche 6 n'en nomment qu'une. Le formulaire d'ouverture de compte marcherait
depuis l'une et pas depuis l'autre, selon le lien par lequel le visiteur est
arrivé. La tâche 5 construit le contrôle qui attrape exactement ça.

- [ ] **Step 3 : Attendre les certificats**

Sur chaque site, attendre *Your site has HTTPS enabled*. Netlify émet un
certificat Let's Encrypt dès que le DNS résout — ce qui est acquis depuis la
tâche 3.

Un certificat en cours d'émission donne un avertissement de navigateur qui
ressemble à une panne. Ne pas conclure avant.

- [ ] **Step 4 : Constater à la main**

```bash
curl -sI https://kolek.cash | head -3
curl -sI https://app.kolek.cash | head -3
curl -sI https://admin.kolek.cash | head -3
```

Attendu : `HTTP/2 200` sur les trois.

```bash
curl -sI https://kolek-site.netlify.app | head -5
```

Attendu : `HTTP/2 301` et `location: https://kolek.cash/`.

Si c'est un `200`, le domaine principal de l'étape 2 n'a pas pris. Y retourner.

> **Note sur HSTS.** L'en-tête des trois `netlify.toml` porte
> `max-age=31536000; includeSubDomains`. Sur `kolek.cash`, il couvre désormais
> **tout `*.kolek.cash`**, pendant un an, pour tout navigateur ayant visité la
> vitrine une fois. Les trois sites sont en HTTPS : rien ne casse. Mais tout
> sous-domaine ajouté plus tard et consulté dans un navigateur devra être en
> HTTPS, sans exception possible.

---

## Task 5 : Le contrôle qui refuse les deux origines

L'anomalie de la tâche 4 étape 2 — domaine principal non posé — est silencieuse :
les deux adresses répondent 200, tout a l'air de marcher, et seule la moitié des
visiteurs peut envoyer le formulaire. Elle mérite un contrôle, parce qu'elle ne
se voit pas.

**Fichiers :**
- Modifier : `scripts/verifier-en-ligne.mjs` (ajout de `manqueRedirection`, du
  champ `ancienne` sur les trois cibles, et de l'appel dans `verifier`)
- Modifier : `scripts/verifier-en-ligne.test.mjs`

**Interfaces :**
- Consomme : `CIBLES`, le motif `constat(condition, message)` interne à
  `verifier()`.
- Produit : `manqueRedirection(statut, destination, attendue)` → `string | null`.
  `null` veut dire « rien à redire ». Chaque cible gagne un champ
  `ancienne: string`.

- [ ] **Step 1 : Écrire le test qui échoue**

Dans `scripts/verifier-en-ligne.test.mjs`, ajouter `manqueRedirection` à
l'importation en tête de fichier :

```js
import {
  CIBLES,
  analyserCsp,
  assetsDe,
  cleAnonyme,
  comparerAssets,
  hstsSuffisant,
  manqueRedirection,
  manquesSeo,
} from './verifier-en-ligne.mjs';
```

Puis ajouter ce bloc à la fin du fichier :

```js
describe('manqueRedirection', () => {
  const NOUVELLE = 'https://kolek.cash';

  it('ne trouve rien à redire à une 301 vers la bonne adresse', () => {
    expect(manqueRedirection(301, 'https://kolek.cash/', NOUVELLE)).toBeNull();
  });

  it('tolère la barre oblique finale, des deux côtés', () => {
    expect(manqueRedirection(301, 'https://kolek.cash', NOUVELLE)).toBeNull();
    expect(manqueRedirection(308, 'https://kolek.cash/', NOUVELLE)).toBeNull();
  });

  it('signale une ancienne adresse qui sert encore l’application', () => {
    // Le défaut qu'on cherche : le domaine principal n'a pas été posé sur
    // Netlify. Rien n'a l'air cassé — les deux adresses répondent — mais deux
    // origines servent la même application, et les listes CORS n'en nomment
    // qu'une. La moitié des visiteurs ne peut pas envoyer le formulaire.
    const manque = manqueRedirection(200, null, NOUVELLE);
    expect(manque).toContain('domaine principal');
  });

  it('signale une redirection qui mène ailleurs', () => {
    const manque = manqueRedirection(301, 'https://kolek-site.netlify.app/', NOUVELLE);
    expect(manque).toContain('attendu https://kolek.cash');
  });

  it('signale une ancienne adresse qui ne répond plus du tout', () => {
    // Un 404 n'est pas une réussite : le lien partagé hier mène au vide au lieu
    // de mener au nouveau domaine.
    expect(manqueRedirection(404, null, NOUVELLE)).toContain('404');
  });
});
```

Et compléter le bloc existant `describe('les attentes déclarées par cible')` avec
ce test :

```js
  it('déclare pour chaque cible l’adresse Netlify qu’elle remplace', () => {
    // Sans ce champ, le contrôle de redirection se sauterait en silence — et un
    // contrôle qui s'efface tout seul ne vaut rien.
    for (const cible of CIBLES) {
      expect(cible.ancienne).toMatch(/^https:\/\/kolek-[a-z]+\.netlify\.app$/);
    }
  });
```

- [ ] **Step 2 : Lancer le test pour le voir échouer**

```bash
npx vitest run scripts/verifier-en-ligne.test.mjs
```

Attendu : **FAIL** — `manqueRedirection is not a function`, et
`expected undefined to match /^https:\/\/kolek-[a-z]+\.netlify\.app$/`.

- [ ] **Step 3 : Écrire la fonction**

Dans `scripts/verifier-en-ligne.mjs`, juste après `manquesSeo` et avant
`export const CIBLES` :

```js
/**
 * Ce qui cloche dans la redirection de l'adresse qu'on a quittée.
 *
 * Le défaut visé est muet : si le *primary domain* n'est pas posé sur Netlify,
 * l'ancienne adresse continue de servir l'application au lieu de rediriger.
 * Rien n'a l'air cassé — les deux adresses répondent 200 — mais **deux origines
 * servent la même page**, et les listes CORS des Edge Functions n'en nomment
 * qu'une. Le formulaire marche depuis l'une, échoue depuis l'autre, selon le
 * lien par lequel le visiteur est arrivé.
 *
 * Un 404 n'est pas davantage une réussite : le lien partagé la semaine dernière
 * mène alors au vide plutôt qu'au nouveau domaine.
 */
export function manqueRedirection(statut, destination, attendue) {
  if (statut === 200) {
    return (
      "sert encore l'application (200) — le domaine principal n'est pas posé sur " +
      'Netlify, et deux origines servent la même page'
    );
  }
  if (statut < 300 || statut >= 400) {
    return `répond ${statut}, attendu une redirection vers ${attendue}`;
  }

  const sansBarre = (adresse) => String(adresse ?? '').replace(/\/+$/, '');
  if (sansBarre(destination) !== sansBarre(attendue)) {
    return `redirige vers ${destination ?? 'nulle part'}, attendu ${attendue}`;
  }

  return null;
}
```

- [ ] **Step 4 : Déclarer l'ancienne adresse sur les trois cibles**

Dans le même fichier, ajouter un champ `ancienne` à chaque entrée de `CIBLES`,
juste sous `url` :

```js
    nom: 'collecteur',
    url: 'https://app.kolek.cash',
    // L'adresse d'avant le 2026-08-26. Elle reste le nom permanent du site chez
    // Netlify — c'est elle que visent les `CNAME` — et doit désormais rediriger
    // plutôt que servir.
    ancienne: 'https://kolek-collecteur.netlify.app',
```

```js
    nom: 'admin',
    url: 'https://admin.kolek.cash',
    ancienne: 'https://kolek-admin.netlify.app',
```

```js
    nom: 'site',
    url: 'https://kolek.cash',
    ancienne: 'https://kolek-site.netlify.app',
```

- [ ] **Step 5 : Appeler le contrôle dans `verifier`**

Dans `scripts/verifier-en-ligne.mjs`, à l'intérieur de `async function verifier`,
juste avant le bloc `// La PWA.` :

```js
  // L'adresse qu'on a quittée. Elle doit avoir cessé de servir — voir la note
  // sur `manqueRedirection`. `redirect: 'manual'` est indispensable : sans lui,
  // `fetch` suivrait la 301 et rendrait le 200 de la destination, ce qui ferait
  // passer le contrôle quoi qu'il arrive.
  if (cible.ancienne) {
    const ancienne = await fetch(cible.ancienne, { redirect: 'manual' });
    const manque = manqueRedirection(
      ancienne.status,
      ancienne.headers.get('location'),
      cible.url,
    );
    constat(manque === null, `${cible.ancienne} — ${manque}`);
  }
```

- [ ] **Step 6 : Lancer le test pour le voir passer**

```bash
npm run test:scripts
```

Attendu : **PASS** sur les six fichiers, `verifier-dns` compris.

- [ ] **Step 7 : Commit**

```bash
git add scripts/verifier-en-ligne.mjs scripts/verifier-en-ligne.test.mjs
git commit -m "$(cat <<'FIN'
feat(scripts): refuser que l'ancienne adresse serve encore l'application

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
FIN
)"
```

---

## Task 6 : Supabase — les origines et le retour d'authentification

Deux réglages, dans deux écrans différents, et une commande. Aucun n'est
détectable par un test : ils vivent hors du dépôt.

**Fichiers :** aucun dans le dépôt. Tableau de bord Supabase et CLI.

- [ ] **Step 1 : L'adresse de retour d'authentification**

Supabase → **Authentication → URL Configuration** :

| Champ | Valeur |
|---|---|
| Site URL | `https://app.kolek.cash` |
| Redirect URLs | `https://app.kolek.cash` et `https://app.kolek.cash/**` |

**Garder aussi les anciennes entrées** `https://kolek-collecteur.netlify.app` et
`https://kolek-collecteur.netlify.app/**` jusqu'à la fin de la tâche 7. Entre
maintenant et le déploiement, un collecteur peut encore partir d'un onglet ouvert
sur l'ancienne adresse : `signInWithOAuth` envoie `redirectTo =
window.location.origin`, et une origine absente de cette liste **ne lève aucune
erreur** — GoTrue renvoie silencieusement sur la *Site URL*. La connexion « marche »
et atterrit au mauvais endroit, ce qui fait chercher partout sauf ici.

Rien à changer côté Google Cloud Console : Google redirige vers Supabase, jamais
vers Netlify.

- [ ] **Step 2 : Les origines autorisées à appeler les Edge Functions**

```bash
npx supabase secrets set \
  ORIGINES_SITE='https://kolek.cash,http://localhost:5173' \
  ORIGINES_COLLECTEUR='https://app.kolek.cash,http://localhost:5173' \
  ORIGINES_ADMIN='https://admin.kolek.cash,http://localhost:5173'
```

- [ ] **Step 3 : Redéployer les fonctions**

```bash
npx supabase functions deploy
```

Non facultatif. `Deno.env.get` est lu à l'initialisation du module, donc une fois
par démarrage d'isolat : un isolat encore chaud continuerait de servir l'ancienne
liste, et l'erreur serait intermittente — la pire à diagnostiquer.

- [ ] **Step 4 : Constater**

```bash
curl -si -X OPTIONS \
  https://yfnwmokxkznejotgpfgf.supabase.co/functions/v1/demander-ouverture \
  -H 'Origin: https://kolek.cash' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: authorization,apikey,content-type' \
  | grep -i 'access-control-allow-origin'
```

Attendu : `access-control-allow-origin: https://kolek.cash`.

Puis la contre-épreuve, qui compte autant :

```bash
curl -si -X OPTIONS \
  https://yfnwmokxkznejotgpfgf.supabase.co/functions/v1/demander-ouverture \
  -H 'Origin: https://exemple.test' \
  -H 'Access-Control-Request-Method: POST' \
  | grep -ci 'access-control-allow-origin'
```

Attendu : `0`. Une origine inconnue ne doit rien recevoir — c'est le contrôle qui
tient toute la posture CORS, et il se vérifie en une ligne.

---

## Task 7 : Pousser le dépôt

Les modifications sont déjà dans l'arbre de travail depuis le 2026-08-26. C'est
ici, et pas avant, qu'elles partent.

**Fichiers :** les douze déjà modifiés, plus la documentation.

- [ ] **Step 1 : Relire ce qui va partir**

```bash
git status
git --no-pager diff --stat
```

Attendu : douze fichiers modifiés — `Docs/deploiement.md`, `apps/collecteur/src/Connexion.tsx`,
`apps/collecteur/src/erreurOAuth.test.ts`, `apps/site/index.html`,
`apps/site/public/robots.txt`, `apps/site/public/sitemap.xml`,
`apps/site/src/vitrine/liens.ts`, `scripts/verifier-en-ligne.mjs`,
`scripts/verifier-en-ligne.test.mjs`, `supabase/config.toml`,
`supabase/functions/_shared/cors.ts`, `supabase/tests/cors.test.ts`.

- [ ] **Step 2 : Vérifier qu'aucune ancienne adresse ne subsiste**

```bash
grep -rn "kolek-\(site\|collecteur\|admin\)\.netlify\.app" \
  apps scripts supabase packages \
  --include="*.ts" --include="*.tsx" --include="*.mjs" \
  --include="*.toml" --include="*.html" --include="*.txt" --include="*.xml" \
  | grep -v "/dist/"
```

Attendu : **uniquement** les lignes `ancienne:` de `scripts/verifier-en-ligne.mjs`
ajoutées en tâche 5. Toute autre occurrence est un oubli — la corriger avant de
continuer.

- [ ] **Step 3 : Passer la suite complète**

```bash
npm test && npm run test:scripts
```

Attendu : tout au vert. Ne pas commiter sur un échec, quel qu'il soit.

- [ ] **Step 4 : Commit et push**

```bash
git add -A
git commit -m "$(cat <<'FIN'
feat(domaine): kolek.cash remplace les trois adresses netlify.app

Le domaine propre était acheté depuis le 2026-08-26 ; onze fichiers
portaient encore l'ancienne adresse en dur, et aucun n'aurait échoué au
build en la gardant. Les plus silencieux sont les balises de la vitrine :
une canonique restée sur kolek-site.netlify.app ne casse rien, ne se voit
nulle part, et fait indexer par Google une adresse qui redirige.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
FIN
)"
git push
```

Le déploiement continu reconstruit les trois sites. Attendre que les trois
constructions soient publiées avant l'étape suivante.

- [ ] **Step 5 : Vérifier ce qui est réellement servi**

```bash
npm run build && npm run verifier:en-ligne
```

Attendu :

```
collecteur  conforme — https://app.kolek.cash
admin       conforme — https://admin.kolek.cash
site        conforme — https://kolek.cash
Les trois cibles servent ce que le dépôt déclare — artefacts comparés.
```

Le `npm run build` n'est pas décoratif : le contrôle de fraîcheur compare les
artefacts servis à ceux du `dist/` local, et un `dist/` absent est traité comme un
échec — pas comme un saut silencieux.

- [ ] **Step 6 : Refermer la liste des Redirect URLs**

Une fois `verifier:en-ligne` au vert, retirer de Supabase → **Authentication →
URL Configuration** les deux entrées `https://kolek-collecteur.netlify.app` et
`https://kolek-collecteur.netlify.app/**`.

Elles étaient un filet pour la durée de la bascule. Les laisser reviendrait à
maintenir ouverte une adresse de retour dont plus rien ne part.

---

## Task 8 : Google Search Console

**Fichiers :** aucun.

- [ ] **Step 1 : Nouvelle propriété**

Ajouter la propriété `kolek.cash`. La valider par l'enregistrement `TXT` que
Google propose, à créer chez Hostinger comme les quatre autres.

- [ ] **Step 2 : Soumettre le sitemap**

Soumettre `https://kolek.cash/sitemap.xml`.

- [ ] **Step 3 : Ne pas supprimer l'ancienne propriété**

La redirection 301 posée par Netlify transfère le signal d'indexation, et c'est
dans l'ancienne propriété que ce transfert se lit. Elle s'éteindra d'elle-même.

Supprimer la propriété ne supprime pas la redirection, mais fait perdre le seul
endroit où l'on peut constater que Google a compris.

---

## Task 9 : Verser les deux diagnostics au dépôt

Deux enquêtes ont eu lieu, et leurs conclusions ne vivent aujourd'hui que dans
une conversation. Elles ont coûté assez cher pour ne pas être refaites.

**Fichiers :**
- Modifier : `Docs/deploiement.md` (section 2, sous *Connexion Google*)

- [ ] **Step 1 : Écrire l'incident du secret Google**

Ajouter, à la fin de la sous-section `### Connexion Google — les deux endroits, et
l'erreur classique` de `Docs/deploiement.md` :

```markdown
> **L'incident du 2026-08-24 au 2026-08-27 — le secret, et comment on l'a su.**
>
> Pendant trois jours, « Continuer avec Google » a échoué en affichant *« La
> connexion Google a échoué à cause de la configuration du projet »*. Ce message
> vient de `apps/collecteur/src/erreurOAuth.ts`, branche `unable to exchange
> external code` : Google avait rendu son code, l'échange contre un jeton était
> refusé.
>
> Ce qui a permis de trancher sans accès au secret, dans cet ordre :
>
> 1. `GET /auth/v1/authorize?provider=google` renvoyait un 302 vers Google avec
>    le bon `client_id` et la bonne `redirect_uri`. Suivre cette adresse menait à
>    l'écran de connexion Google, sans erreur — donc le client était connu de
>    Google et l'adresse de retour déclarée. Deux causes éliminées.
> 2. Le journal d'authentification montrait `authorize` à 12:38:28 et `callback`
>    à 12:38:32, avec un code neuf, une seule fois. Quatre secondes et un seul
>    passage éliminent le code expiré et le code rejoué.
> 3. Une requête sur le point de jeton de Google, avec ce `client_id` et un
>    secret volontairement faux, répond `invalid_client — The provided client
>    secret is invalid`, **et le fait avant de regarder le code**. Un secret
>    valide aurait donné `invalid_grant` sur un code bidon.
>
> Il ne restait qu'une variable. Le remède : créer un secret neuf côté Google
> Cloud — il en accepte plusieurs en parallèle, l'ancien n'est donc pas coupé —
> et le recoller dans Supabase, **sans espace ni retour à la ligne**.
>
> La preuve du rétablissement n'est pas l'écran qui s'ouvre, c'est l'apparition
> de `POST /auth/v1/token` (`grant_type=pkce`) et `GET /auth/v1/user` dans le
> journal, juste après le `callback`. Ces deux lignes manquaient.
>
> **Ce qu'on n'automatise pas.** `verifier:en-ligne` pourrait contrôler que le
> fournisseur est allumé et que l'`authorize` pointe au bon endroit — c'est-à-dire
> les deux choses qui allaient bien. Le secret ne s'éprouve qu'avec un vrai code
> d'autorisation, donc avec un humain devant l'écran. Un contrôle qui passerait
> au vert pendant que la connexion est cassée vaut moins que rien.
```

- [ ] **Step 2 : Renvoyer vers le contrôle DNS depuis la section 4**

Dans `Docs/deploiement.md` §4.2, remplacer le bloc de commandes `nslookup` par :

````markdown
**Propagation.** De quelques minutes à quelques heures.

```bash
npm run verifier:dns             # via un résolveur public
npm run verifier:dns -- --systeme  # via celui du poste
```

Le résolveur public d'abord, et ce n'est pas un détail : celui du poste garde en
mémoire la réponse négative obtenue *avant* la création des enregistrements, aussi
longtemps qu'une réponse positive. Il fait croire à un échec sur une zone déjà
juste. Si le public est vert et le poste rouge, il n'y a rien à corriger — il
faut attendre.

Le script contrôle aussi qu'il n'y a **qu'un seul** enregistrement par nom : c'est
ce qui attrape l'enregistrement de parking d'Hostinger laissé en place, lequel
ferait tomber un visiteur sur deux sur la page « domaine réservé ».
````

- [ ] **Step 3 : Commit**

```bash
git add Docs/deploiement.md
git commit -m "$(cat <<'FIN'
docs(deploiement): ce que le secret Google a coûté, et comment on l'a trouvé

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
FIN
)"
git push
```

---

## Contrôle final

Les six commandes qui disent que tout est en place :

```bash
npm run verifier:dns          # les quatre enregistrements, sans doublon
npm run build
npm run verifier:en-ligne     # en-têtes, CSP, fraîcheur, SEO, redirections 301
npm test
npm run test:scripts
curl -sI https://kolek-site.netlify.app | head -3   # 301 vers kolek.cash
```

Et le seul contrôle qui demande un humain : se déconnecter du collecteur, se
reconnecter par Google, et lire dans les Auth Logs le `POST /token` à 200 qui
manquait depuis le 2026-08-24.
