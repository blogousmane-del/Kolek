# Kolek — Déploiement

> Procédure de mise en ligne : un projet Supabase distant, trois sites Netlify.
> À faire une fois, avant J2 — pas après. Les défauts de la plateforme distante
> ne sont pas ceux du local, et on l'a déjà constaté en J1 sur les privilèges.

---

## Pourquoi maintenant, sur des coquilles vides

Déployer une application vide prend une demi-journée. Découvrir les mêmes écarts
avec une application complète en coûte plusieurs.

L'audit du 2026-08-16 en a donné deux exemples concrets :

- Les nouvelles tables ne sont plus exposées automatiquement à l'API de données.
  Le comportement local et le comportement cloud ont divergé en cours de route,
  et les migrations ont dû acquérir des `GRANT` explicites.
- `anon` et `authenticated` conservaient `TRUNCATE`, `REFERENCES` et `TRIGGER` —
  un privilège dormant que seule une interrogation des catalogues révélait.

Rien ne garantit que le projet distant se comporte comme le conteneur local. La
seule façon de le savoir est d'y appliquer les migrations et de refaire l'audit.

---

## Ce qui demande ton compte

Deux commandes à lancer toi-même. Elles ouvrent ton navigateur et stockent tes
accès dans ton profil utilisateur ; aucun secret n'a besoin de transiter par une
conversation.

```bash
npx supabase login
npx netlify login
```

---

## 1. Projet Supabase

**Région.** Abidjan n'a pas de région Supabase. La plus proche en latence est
Paris (`eu-west-3`), puis Francfort (`eu-central-1`) et Londres (`eu-west-2`).
Paris par défaut.

**Création et liaison.**

```bash
npx supabase projects create kolek-prod --region eu-west-3
npx supabase link --project-ref <ref-du-projet>
```

**Application du schéma.**

```bash
npx supabase db push
```

Les sept migrations s'appliquent dans l'ordre. Les trois dernières portent
chacune un bloc de contrôle qui fait échouer la migration plutôt que de laisser
passer :

- `..._socle_revoquer_privileges_implicites` échoue si `TRUNCATE`, `REFERENCES`
  ou `TRIGGER` restent accordés à `anon` ou `authenticated` ;
- `..._durcissement_audit` échoue si une colonne rendue au serveur redevient
  écrivable par le collecteur ;
- `..._socle_privileges_liste_blanche` compare les privilèges réellement en
  vigueur à une liste blanche exacte, et échoue **dans les deux sens** — un
  privilège en trop comme un privilège attendu et absent. Elle vérifie aussi
  qu'aucun `ALTER DEFAULT PRIVILEGES` ne subsiste pour ces deux rôles, sans quoi
  la prochaine table créée rouvrirait silencieusement ce qu'on vient de fermer.

Si le cloud accorde ces privilèges autrement que le local, `db push` le dira au
lieu de le taire. C'est le seul contrôle de cette procédure qui s'exécute sans
qu'on ait à y penser.

---

## 2. Durcissement — à faire dans le tableau de bord Supabase

`supabase/config.toml` ne pilote que la pile locale. Ces réglages-là se font sur
le projet distant, et **le projet ne doit pas hériter des défauts de la CLI**.

Depuis l'audit du 2026-08-16, `config.toml` porte néanmoins la même posture que
la production, et la pile locale tourne avec. Ce n'est pas de la décoration :
c'est la seule façon de découvrir ici, plutôt qu'en distant, qu'un réglage casse
quelque chose. Elle en a déjà fait tomber un — voir la note sous le tableau.

| Réglage | Défaut CLI | À mettre | Pourquoi |
|---|---|---|---|
| `[auth] enable_signup` | activé | **désactivé** | Le trigger `on_auth_user_created` provisionne un locataire en essai 30 jours à chaque inscription. Ouvert, n'importe qui crée des comptes à volonté. En Phase 1, c'est GTCS qui crée les comptes collecteurs, par l'API d'administration — que ce réglage ne bride pas. |
| Confirmation d'email | désactivée | **activée** | Sans elle, un compte se crée sur une adresse qu'on ne possède pas. |
| Longueur de mot de passe | 6 | **10 minimum** | Le compte donne accès à l'épargne de dizaines de commerçants. |
| API GraphQL publique | exposée | **désactivée** | Seconde surface d'API sur les mêmes tables, inutilisée par le produit. RLS s'y applique, ce n'est donc pas une brèche — mais une surface qu'on n'utilise pas est une surface à fermer. |
| `max_rows` | 1000 | à conserver | Contrainte de conception, pas un réglage à contourner : les écrans d'historique de J2 doivent paginer. |

> **Le piège de `[auth.email] enable_signup`.** Malgré son nom, ce réglage-là
> n'est pas « inscription par email » mais « fournisseur email activé ». À
> `false`, GoTrue répond `Email logins are disabled` et **plus personne ne se
> connecte** — les cinquante tests de base tombent d'un coup. La fermeture des
> inscriptions passe uniquement par `[auth] enable_signup`. Sur le tableau de
> bord Supabase, vérifier qu'on ferme bien *Allow new users to sign up* et pas
> le fournisseur *Email* lui-même.

### Connexion Google — les deux endroits, et l'erreur classique

Google ne redirige **jamais** vers Netlify. Il redirige vers Supabase, et c'est
Supabase qui renvoie ensuite vers l'application. Mettre les adresses Netlify
côté Google fait refuser chaque tentative, avec un message qui n'explique rien.

**Google Cloud Console — identifiant OAuth 2.0, type « Application Web »**

| Champ | Valeur |
|---|---|
| Authorized redirect URIs | `https://yfnwmokxkznejotgpfgf.supabase.co/auth/v1/callback` |
| Authorized JavaScript origins | `https://yfnwmokxkznejotgpfgf.supabase.co` |

Une seule adresse de redirection. Rien d'autre.

**Supabase — Authentication → URL Configuration**

| Champ | Valeur |
|---|---|
| Site URL | `https://kolek-collecteur.netlify.app` |
| Redirect URLs | `https://kolek-collecteur.netlify.app`<br>`https://kolek-collecteur.netlify.app/**` |

**Supabase — Authentication → Providers → Google** : activer, coller le *Client
ID* et le *Client Secret*.

> **Pourquoi la liste des Redirect URLs compte.** Le code appelle
> `signInWithOAuth({ redirectTo: window.location.origin })` — l'adresse de
> retour est l'origine d'où part le clic, pas une constante. Une origine absente
> de la liste ne lève aucune erreur : GoTrue renvoie silencieusement sur la
> *Site URL*. Le symptôme est une connexion qui « marche » mais atterrit au
> mauvais endroit, ce qui envoie chercher partout sauf ici.

Une seule application est concernée : `apps/collecteur`. Un seul
`signInWithOAuth` existe dans le dépôt. L'administration et la vitrine n'ont pas
de connexion Google, et n'ont rien à déclarer.

`disable_signup` reste en vigueur : une adresse Google sans fiche collecteur est
refusée, et le code répond en français au lieu de laisser passer le message
anglais de GoTrue. C'est voulu — le compte se crée par GTCS, pas par Google.

**Sauvegardes.** Vérifier que les sauvegardes automatiques sont actives. C'est
l'épargne réelle de commerçants ; l'exigence de sauvegarde du cahier §7 ne se
satisfait pas d'un défaut supposé.

---

## 3. Sites Netlify

Trois sites distincts sur le même dépôt, conformément au dossier stratégique
§2.4. Chacun lit le `netlify.toml` de son répertoire de base.

| Site | Répertoire de base | Fichier lu | Public visé |
|---|---|---|---|
| `kolek-collecteur` | `apps/collecteur` | `apps/collecteur/netlify.toml` | Collecteurs, sur le terrain |
| `kolek-admin` | `apps/admin` | `apps/admin/netlify.toml` | GTCS et gérants |
| `kolek-site` | `apps/site` | `apps/site/netlify.toml` | Public — grille tarifaire |

En ligne depuis le 2026-08-18, équipe `blog-ousmane`, publiés à la main depuis
les artefacts locaux :

| Site | URL | Identifiant |
|---|---|---|
| `kolek-collecteur` | https://kolek-collecteur.netlify.app | `56d28aa0-de05-4a92-b384-4a576685fe47` |
| `kolek-admin` | https://kolek-admin.netlify.app | `401e55b2-0aaa-4f02-a21a-18e777bf9369` |
| `kolek-site` | https://kolek-site.netlify.app | `eae737cb-2247-49d6-a190-2a662f9af5e2` |

Le dossier stratégique n'en prévoyait que deux : les deux applications. Le site
public est venu après, avec les maquettes de tarifs. Il ne partage avec elles que
`@kolek/ui` et `@kolek/core` — aucun compte, aucune session, aucune donnée.

**Déploiement continu — en place depuis le 2026-08-18.** Les trois projets
Netlify sont branchés sur `blogousmane-del/Kolek`, branche `main` : un `git
push` reconstruit et republie. Le déploiement manuel décrit plus bas ne sert
plus qu'au dépannage. Le dépôt est **public** : rien de secret ne doit y entrer,
et `npm run verifier:bundles` ne contrôle que les artefacts, pas les sources.

Trois champs par projet, et c'est **Package directory** qui compte — pas
*Base directory*, qui reste à `/` :

| Projet | Package directory | Build command | Publish directory |
|---|---|---|---|
| `kolek-collecteur` | `apps/collecteur` | `npm ci && npm run build -w @kolek/collecteur` | `apps/collecteur/dist` |
| `kolek-admin` | `apps/admin` | `npm ci && npm run build -w @kolek/admin` | `apps/admin/dist` |
| `kolek-site` | `apps/site` | `npm ci && npm run build -w @kolek/site` | `apps/site/dist` |

**Vérifier le nom du projet avant de saisir.** Le 2026-08-18, `kolek-site` a reçu
`apps/admin` dans ces trois champs : le tableau de bord d'administration s'est
retrouvé publié sur l'URL commerciale, en `noindex`, avec la CSP de l'admin. Rien
n'était compromis — le portillon `est_admin()` tient — mais la page de tarifs
avait disparu de son propre domaine, et la seule chose qui l'a signalé est
`npm run verifier:en-ligne` :

```
site  3 manquement(s)
  x-robots-tag = noindex, nofollow (attendu : absent)
  /robots.txt ne contient pas « Allow: / »
  connect-src du site public devrait valoir 'self' seul
```

Ni Netlify ni la construction n'ont rien dit : de leur point de vue tout s'était
bien passé. C'est la raison d'être de ce script — un déploiement vert n'est pas
un déploiement correct.

> ### Panne du 2026-08-20 — sept constructions échouées, et personne pour le dire
>
> **Constaté le 2026-08-21**, sur signalement de l'exploitant : « les boutons ne
> marchent toujours pas ». Ils marchaient — dans le dépôt. Pas en ligne.
>
> Mesuré : le paquet servi par `kolek-collecteur` ne contenait **aucune** chaîne
> des six écrans livrés la veille. Les trois sites publiaient encore le commit
> `179f86b` du 2026-08-20 à 10 h 57.
>
> L'historique des déploiements est sans ambiguïté — et **identique sur les trois
> sites, commit par commit** :
>
> ```
> 08-21T09:49 error   7f9760a
> 08-20T22:09 error   0ce54c2
> 08-20T21:55 error   4dd2b64
> 08-20T21:37 error   584f979
> 08-20T21:05 error   5a4397c
> 08-20T20:52 error   67c1cb2
> 08-20T15:56 error   67a1b58   ← première de la série
> 08-20T10:57 ready   179f86b   ← ce que la production sert encore
> ```
>
> Trois sites distincts, trois configurations différentes, exactement les mêmes
> commits en succès et en échec. Ce n'est donc pas du code applicatif : `site`
> ne partage avec `collecteur` que `@kolek/ui` et `@kolek/core`.
>
> **La cause n'a pas pu être établie d'ici.** Le jeton `NETLIFY_AUTH_TOKEN`
> disponible est en lecture seule sur les sites : il liste les déploiements, mais
> `/builds/{id}` et `/accounts` répondent `401 Access Denied`. Or les objets de
> déploiement ne portent ni `error_message`, ni `log_access_attributes`, et leur
> `summary` vaut `{"status":"unavailable"}` — l'absence totale de journal, sur
> trois sites à la fois, oriente vers un blocage de compte (minutes de
> construction) plutôt que vers une erreur de compilation, qui produirait un
> journal.
>
> **Ce qu'il faut faire, et qui demande le tableau de bord :** ouvrir
> app.netlify.com → un des trois sites → **Deploys** → cliquer un déploiement en
> `Failed` → lire le journal. Il nomme la cause en une ligne.
>
> **Ce qui a été corrigé ici :** `verifier:en-ligne` ne comparait que la posture
> de sécurité — en-têtes, CSP, fuites de clés — jamais le contenu. Il concluait
> « les trois cibles servent ce que le dépôt déclare », phrase que **rien ne
> mesurait**. Il compare désormais les artefacts servis à ceux du `dist/` local,
> et l'absence de `dist/` est un échec, pas un saut silencieux.
>
> Le principe était pourtant déjà écrit, juste en dessous, depuis le 2026-08-18 :
> *« une divergence d'empreinte se lit comme une divergence de source »*. Il aura
> fallu deux jours de production figée pour qu'il devienne un contrôle.

Une observation utile au passage : la construction Netlify du site public a
produit `index-BEeLuKI6.js`, empreinte identique au bit près à celle du build
local. Deux machines, deux systèmes, même sortie. Une divergence d'empreinte,
désormais, se lit comme une divergence de source — pas comme du bruit.

**Déploiement à la main, depuis Windows.** Tant que les trois sites ne sont pas
branchés sur GitHub, la publication passe par la CLI — et quatre pièges s'y
succèdent, tous propres à Windows, tous silencieux ou trompeurs :

| Symptôme | Cause | Ce qu'il faut faire |
|---|---|---|
| `ERR_USE_AFTER_CLOSE: readline was closed` | La sous-commande ouvre une invite interactive, il n'y a pas de clavier | Passer par `netlify api <methode> --data '{...}'`, qui ne demande rien |
| `'C:\Program' n'est pas reconnu` | `npx.cmd` passe par `cmd.exe`, qui casse la citation dès qu'un argument contient une espace — ici `--message "..."` | Supprimer l'argument, ou l'écrire sans espace |
| `npm error code EPERM ... unlink` pendant un déploiement | `netlify deploy` exécute par défaut la commande de build du `netlify.toml`, donc `npm ci`, qui **efface `node_modules`** avant de réinstaller. Un binaire verrouillé par l'antivirus fait échouer l'effacement à mi-chemin | `--no-build` quand les artefacts sont déjà construits. Réparer ensuite par `npm install` |
| `The deploy directory "…\Kolek\dist" has not been found` | `--dir` est résolu depuis la racine du dépôt, pas depuis le répertoire courant | Donner un chemin absolu : `--dir C:/…/apps/<app>/dist` |

La commande qui fonctionne, depuis le répertoire de l'application :

```
npx.cmd --no-install netlify deploy --prod --no-build --dir C:/…/apps/<app>/dist
```

Le `netlify.toml` du répertoire courant est bien lu — c'est lui qui pose les
en-têtes et les réécritures, y compris avec `--no-build`. C'est précisément ce
que `npm run verifier:en-ligne` va constater sur les URL réelles.

Pour les appels `netlify api`, dont le corps est du JSON, aucun de ces contours
ne suffit : sous Git Bash la ligne casse, et PowerShell mange les guillemets.
La forme qui passe est PowerShell avec les guillemets échappés :

```powershell
npx.cmd --no-install netlify api updateSite --data '{\"site_id\":\"…\",\"body\":{…}}'
```

**Les sites naissent privés — 401 sur tout.** Une équipe Netlify créée
aujourd'hui porte `account_sso_login: true`, et chaque site hérite d'un
`sso_login: true` qui renvoie une page « Login Redirect » vers
`app.netlify.com/edge-access`. Ce n'est ni un défaut de déploiement ni une CSP :
le site est publié et correct, mais réservé aux membres de l'équipe. Rien dans
la sortie de `netlify deploy` ne le signale — elle annonce une URL de production
qui répond 401 au premier visiteur.

À lever site par site, une fois, après création :

```powershell
npx.cmd --no-install netlify api updateSite --data '{\"site_id\":\"…\",\"body\":{\"sso_login\":false}}'
```

Le Dashboard admin n'y gagne aucune exposition indue : sa protection est le
portillon applicatif et `X-Robots-Tag: noindex`, pas un mur d'équipe Netlify qui
aurait aussi bloqué les GTCS.

Un piège de monorepo à connaître avant de brancher : quand un répertoire de base
est réglé, Netlify décide de reconstruire ou non en regardant si ce répertoire a
changé. Or les trois sites dépendent de `packages/ui` et `packages/core`. Une
correction faite dans un paquet partagé ne touche aucun des trois répertoires de
base, et **aucun site ne se reconstruit** — les trois restent sur l'ancienne
version sans que rien ne signale l'écart. Le correctif est une commande `ignore`
par site, qui déclenche aussi sur les paquets :

```toml
[build]
  ignore = "git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- apps/site packages"
```

À poser dans les trois `netlify.toml`, chacun avec son propre chemin
d'application. Sans quoi le premier symptôme sera un écran corrigé en local qui
reste cassé en ligne.

**Le second piège, celui qui a fait échouer la première construction en
intégration continue.** Le répertoire de base fait lire le bon `netlify.toml`,
et rien de plus : Netlify le traite comme un *packagePath* et lance la
construction **depuis la racine du dépôt**. Le journal du 2026-08-18 :

```
Current directory  /opt/build/repo
Config file        /opt/build/repo/apps/site/netlify.toml
```

Les trois fichiers commençaient leur commande par `cd ../..`, en supposant
l'inverse. La construction sortait donc du dépôt, vers `/opt/build`, et échouait
sur un `package-lock.json` introuvable — alors qu'il est versionné, 310 Ko. Le
message d'erreur, lui, accusait le fichier de verrouillage :

```
npm error The `npm ci` command can only install with an existing package-lock.json
```

Même cause pour la publication : `publish = "dist"` désignait `/opt/build/repo/dist`,
qui n'existe pas.

**La règle, une fois pour toutes : tous les chemins d'un `netlify.toml` se
résolvent depuis la racine du dépôt.** Elle vaut aussi pour `netlify deploy
--dir` en local, où le même symptôme s'était produit sans qu'on en tire la
leçon. D'où, dans chacun des trois fichiers :

```toml
[build]
  command = "npm ci && npm run build -w @kolek/site"
  publish = "apps/site/dist"
```

**Variables d'environnement.** Uniquement sur les deux applications :

```
VITE_SUPABASE_URL      = https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY = <clé anonyme du projet>
```

`kolek-site` n'en prend aucune. Il ne parle à aucune API — sa page de tarifs est
statique et son formulaire de paiement est délibérément inerte, faute de
partenaire agréé (cahier §11). Lui donner une clé, même anonyme, serait exposer
un secret sans usage.

**Content-Security-Policy — resserrée le 2026-08-17.** Les `netlify.toml` des
deux applications nommaient `connect-src https://*.supabase.co`, faute de
connaître la référence du projet à leur écriture. Le joker laissait une
application compromise parler à n'importe quel projet Supabase du monde. Il est
remplacé par `https://yfnwmokxkznejotgpfgf.supabase.co`.

Si la référence change un jour — nouveau projet, migration de compte — c'est
dans ces deux fichiers qu'il faut la reporter. Une CSP périmée ne lève aucune
alerte : elle se manifeste par des requêtes bloquées et un écran de connexion
qui tourne dans le vide.

Celui de `apps/site` est déjà au plus strict : `connect-src 'self'`, sans
exception Supabase. Il ne bouge que le jour où le tunnel de commande s'adresse à
un partenaire de paiement — et ce jour-là, vers l'origine exacte de ce
partenaire, pas vers un joker.

L'absence de `X-Robots-Tag: noindex` sur `apps/site` est délibérée : c'est la
surface commerciale, elle a vocation à être indexée. Elle n'est en revanche pas
délibérée sur `apps/collecteur`, qui n'en porte pas non plus — voir le point 7
de la vérification.

> La clé de service ne va sur **aucun** des trois sites. Elle ne vit que dans les
> Edge Functions. `npm run verifier:bundles` échoue si elle atteint un artefact —
> il contrôle les trois `dist`, et refuse de passer si l'un d'eux manque, pour
> qu'un site oublié ne soit jamais confondu avec un site propre. Mais ce
> garde-fou ne protège que du code : il ne protège pas d'une variable
> d'environnement mal nommée saisie à la main dans une interface.

---

## 4. Vérification après déploiement

Le déploiement n'est pas terminé tant que ces points ne sont pas constatés sur
l'environnement distant, pas sur le local.

Une partie se contrôle sans les mains :

```
npm run verifier:en-ligne
```

Le script interroge les trois URL réelles et échoue au premier manquement. Il
couvre les en-têtes de sécurité, les directives de CSP qui portent le risque, la
présence de la clé anonyme dans les deux applications et son absence du site
public, la recherche de clé de service dans chaque artefact **servi**, la
réécriture des routes inconnues, et les en-têtes de cache du service worker et
du manifeste. Ce qu'il ne peut pas voir reste manuel : une violation de CSP ne
se constate qu'en ouvrant la console, et un portillon ne se teste qu'avec un
vrai compte.

1. **Le schéma est bien celui attendu.** Rejouer l'audit des privilèges sur le
   projet distant : RLS active sur les neuf tables, politiques identiques,
   aucun `TRUNCATE`/`REFERENCES`/`TRIGGER` pour `anon` ni `authenticated`, et
   aucun privilège d'écriture sur les colonnes que le serveur décide —
   `caisses_jour.cash_attendu`, `clients.id`, `clients.cree_le`,
   `synchro_rejets.cree_le`, `synchro_rejets.traite` à l'insertion. Les deux
   migrations de durcissement portent chacune un bloc de contrôle qui échoue
   plutôt que de laisser passer, donc `db push` le dira de lui-même.
2. **L'isolation tient en distant.** Créer deux collecteurs de test et rejouer
   les six tentatives d'intrusion contre le projet réel.
3. **Le portillon admin tient.** Se connecter au Dashboard avec un compte
   collecteur : il doit afficher « Accès réservé », pas le tableau de bord.
4. **Les applications se connectent** et n'embarquent que la clé anonyme —
   vérifiable dans les outils de développement du navigateur. Sur `kolek-site`,
   la vérification est inverse : aucune variable `VITE_SUPABASE_*` ne doit
   apparaître dans le paquet, puisque le site n'en reçoit aucune.
5. **La Content-Security-Policy ne casse rien.** `netlify.toml` n'est appliqué
   ni par `vite preview` ni par les tests : la politique n'a jamais tourné
   ailleurs qu'en production. Ouvrir la console sur les trois sites et vérifier
   l'absence de violation CSP — les points sensibles sont les fontes servies
   depuis l'origine (`@fontsource`, sous-ensemble latin), la largeur des jauges
   d'avancement posée en attribut `style`, l'enregistrement du service worker,
   et les appels vers Supabase. Le thème n'en est plus un : depuis le passage à
   Tailwind, c'est une feuille statique et non une injection JavaScript. Sur
   `kolek-site`, la politique est plus serrée que celle des applications, donc
   c'est celle qui a le plus de chances de casser quelque chose : y regarder les
   fontes, et le fait qu'aucune requête sortante ne parte de la page de tarifs.
6. **La PWA s'installe** depuis l'URL réelle, en HTTPS : manifeste détecté,
   service worker enregistré. Le service worker ne fonctionne qu'en contexte
   sécurisé, donc c'est le premier test qui a du sens hors du local. Ne concerne
   que les deux applications : `kolek-site` est une page, pas une application
   installable.
7. **L'indexation est celle qu'on veut** — tranché le 2026-08-18. Les deux
   outils internes portent `X-Robots-Tag: noindex, nofollow` et un `robots.txt`
   en `Disallow: /` ; `kolek-site`, seule surface commerciale, n'a pas d'en-tête
   et autorise explicitement.

   Le fichier compte autant que l'en-tête, et pour une raison qui ne se devine
   pas : la réécriture `/*` vers `/index.html` répond à `/robots.txt` par du
   HTML en 200. Un moteur reçoit une page là où il attend des règles, et conclut
   qu'il n'y en a aucune. Le fichier doit donc exister réellement dans
   `public/` — Netlify sert les fichiers présents avant d'appliquer la
   réécriture. Les deux mécanismes ne disent d'ailleurs pas la même chose :
   l'en-tête dit « n'indexe pas ce que tu as lu », le fichier dit « ne le lis
   pas ». `npm run verifier:en-ligne` contrôle les deux, dans les deux sens —
   il échoue aussi si le site public se retrouvait marqué `noindex`.
8. **Les comptes de test sont supprimés** du projet de production avant le pilote.

---

## Ce que le déploiement ne fait pas

Il ne rend pas le produit vendable. Un collecteur qui ouvre l'application y
trouve un écran de connexion et une liste vide — la collecte arrive en J2.

Le site public trompe davantage, et c'est le risque qu'il faut voir avant de
mettre son URL sur une carte de visite : il affiche des prix, des boutons de
souscription et un formulaire de paiement, et **aucun des trois ne fait quoi que
ce soit**. Il n'y a pas de tunnel de commande, et il ne peut pas y en avoir tant
que le paiement ne passe pas par un partenaire agréé (cahier §11). Deux
conséquences pratiques : les montants affichés engagent commercialement dès la
première visite alors que la grille n'est pas arbitrée (voir
`packages/core/src/paliers.ts`), et un visiteur qui tente de payer n'obtient
rien. Publier ce site à une adresse connue avant d'avoir tranché ces deux points
est une décision commerciale, pas une étape technique.

Ce déploiement sert à trois choses : constater les écarts de plateforme pendant
qu'ils coûtent une demi-journée, avoir une URL à montrer, et faire du déploiement
une opération routinière plutôt qu'un événement redouté en fin de projet.

---

*Kolek — procédure de déploiement · 2026-08-16, révisée le 2026-08-17
(troisième site, dépôt GitHub).*
