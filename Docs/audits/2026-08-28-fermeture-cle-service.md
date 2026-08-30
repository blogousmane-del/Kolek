# Fermeture de la clé `service_role` publiée le 2026-08-24

**Date :** 2026-08-28 · **Objet :** clore l'incident ouvert par
`2026-08-25-verification-audit.md`, seul constat bloquant du dépôt.

> **Correction du 2026-08-30 — ce document a conclu trop tôt.** Le verdict
> ci-dessous porte sur la désactivation des clés d'API, faite le 2026-08-28.
> Elle était nécessaire et elle n'était pas suffisante : le secret partagé qui
> avait signé la clé fuitée **continuait de vérifier les jetons**, et cette
> seconde barrière n'a été fermée que le 2026-08-30. Voir
> « La fermeture n'était pas complète » plus bas. Exposition réelle : **six
> jours**, non quatre.

**Verdict : fermée.** Six jours d'exposition, du 2026-08-24 au 2026-08-30.
La clé n'ouvre plus rien — mesuré, pas supposé.

| | |
|---|---|
| Exposition | 6 jours (4 annoncés le 2026-08-28, corrigé le 2026-08-30) |
| Cause de la fuite | Clé de service collée dans `VITE_SUPABASE_ANON_KEY`, servie dans un paquet public |
| Cause du délai | Le projet avait migré vers les JWT Signing Keys : le bouton qui aurait clos l'incident en une minute n'existait plus |
| Geste qui a clos | Désactivation des clés d'API héritées, après bascule complète vers le format `sb_publishable_` / `sb_secret_` |

---

## Ce qui prouvait qu'elle vivait

Deux mesures, prises avec du matériel public uniquement. Aucune n'a jamais
manipulé la clé fuitée.

**La première, indirecte, et c'est elle qui a tenu lieu de boussole pendant
quatre jours.** La clé `anon` d'avant l'incident et la clé `service_role` sont
signées par le même secret. Si ce secret avait tourné, les deux seraient mortes
ensemble. Or :

```
clé anon d'avant l'incident → GET /auth/v1/settings : 200
```

Elle répondait. Donc le secret n'avait pas tourné. Donc la clé de service était
vivante — lecture et écriture sur toute la base, politiques RLS ignorées,
jusqu'en 2036.

C'est un raisonnement par la signature, pas une observation directe : à aucun
moment la clé fuitée n'a été employée pour le vérifier. La consigne tenue tout
du long est qu'on ne se sert pas d'un secret pour prouver qu'il est dangereux.

**La seconde, directe, prise après coup.** Une fois les clés héritées
désactivées, la clé `service_role` a pu être interrogée sans risque — elle
n'ouvrait déjà plus rien. Elle rend `401` sur l'authentification comme sur la
lecture de table. Cette mesure ne prouve pas l'état d'avant ; elle prouve
l'état d'après, et c'est le seul qui compte désormais.

---

## Pourquoi ça a pris quatre jours

L'audit du 2026-08-25 prescrivait le geste évident : *Settings → API → JWT
Secret → Generate new secret*. Une minute, toutes les sessions tombent, l'affaire
est close.

**Ce bouton n'existait plus.** Le projet avait migré vers les JWT Signing Keys,
où le secret partagé cède la place à une paire de clés et à un format d'API
nouveau — `sb_publishable_` pour le navigateur, `sb_secret_` pour le serveur.
Dans ce régime, la clé héritée n'est plus émise : elle est seulement *vérifiée*.
On ne la fait pas tourner. On la **désactive** — et une clé héritée désactivée
casse tout ce qui s'en sert encore.

La fermeture est donc devenue une migration de format qu'aucun travail
préalable n'avait préparée : trois applications navigateur, onze Edge Functions,
un secret de Vault, et un contrôle d'après-déploiement qui ne connaissait qu'un
seul format de clé.

**La leçon tient en une phrase :** une migration de plateforme acceptée sans
lire ce qu'elle retire du tableau de bord se paie le jour de l'incident, pas le
jour de la migration.

---

## La séquence suivie

Toutes les mesures datent du 2026-08-28.

| # | Ce qui a été fait | Par |
|---|---|---|
| 1 | Sonde temporaire : lire ce que la plateforme injecte réellement dans les Edge Functions | dépôt |
| 4 | `cleAnonyme` apprend à lire les deux formats | dépôt |
| 5 | Les trois sites Netlify servent la clé publiable | tableau de bord |
| 6 | Le secret de Vault `kolek_cle_service` reçoit la clé secrète | éditeur SQL |
| 7 | Désactivation des clés d'API héritées | tableau de bord |

**La tâche 1 a supprimé les tâches 2 et 3.** Le plan prévoyait d'écrire un
résolveur `_shared/cles.ts` et de réécrire onze fonctions pour accepter les deux
noms de variable. La sonde a montré que la plateforme injectait **déjà**
`sb_publishable_` dans `SUPABASE_ANON_KEY` et `sb_secret_` dans
`SUPABASE_SERVICE_ROLE_KEY`. Les noms n'avaient pas changé, seul le contenu.
Une demi-journée de travail évitée — et surtout un travail qui aurait paru
réussir au moment de la bascule, pour la mauvaise raison.

C'est le meilleur argument de tout ce chantier en faveur de la mesure avant
l'écriture.

---

## La mesure finale

```
clé anon héritée         → /auth/v1/settings   : 401
clé anon héritée         → /rest/v1/ (lecture) : 401
clé service_role héritée → /auth/v1/settings   : 401
clé service_role héritée → /rest/v1/ (lecture) : 401

clé publiable            → /auth/v1/settings   : 200
clé publiable            → token?grant_type=password : 400 invalid_credentials
préalable CORS depuis kolek.cash → 204, origine accordée
```

Le `400` de la dernière ligne est le contrôle qui compte pour les utilisateurs :
un `401` aurait signifié « clé refusée », un `400 invalid_credentials` signifie
« clé acceptée, identifiants faux ». Le chemin de connexion complet fonctionne.

Le `401` sur la racine de l'API de données avec la clé publiable n'est pas une
régression : cette route répond `Only secret API keys can be used for this
endpoint`, et l'a toujours fait.

---

## La fermeture n'était pas complète — 2026-08-30

Le 2026-08-28, la mesure disait `401` sur les deux clés héritées et ce document
concluait. **Le `401` venait du portillon des clés d'API, pas de la signature.**
Deux barrières distinctes ; une seule était tombée.

L'écran *JWT Keys → Legacy JWT Secret* le disait pourtant en clair :

> *Legacy JWT secret … is used to **only verify** JSON Web Tokens by Supabase
> products.*

« Ne signe plus, vérifie encore ». Un secret qui vérifie est un secret qui
authentifie : quiconque le détenait pouvait **fabriquer** un jeton portant
`role: service_role` et le faire accepter, sans jamais toucher à la clé fuitée.
Et cette valeur avait séjourné trois jours dans `JWT_KEY`, sur les trois sites
Netlify.

### Le test qui a tranché, et les deux qui n'y sont pas parvenus

**Première tentative, non concluante.** Présenter le jeton hérité comme jeton
d'utilisateur rendait `403 invalid claim: missing sub claim`, tandis qu'un jeton
à signature inventée rendait `403 signature is invalid`. Tentant d'en conclure
que la signature du premier avait été vérifiée — mais les deux résultats sont
tout aussi compatibles avec « les revendications sont contrôlées avant la
signature ». Le jeton hérité n'a pas de `sub` ; mon témoin en avait un. Ils
échouaient à des endroits différents pour la mauvaise raison.

**Le test décisif** interroge un consommateur qui se moque du `sub` : PostgREST,
qui ne regarde que `role`. Deux requêtes rigoureusement identiques, jusqu'aux
revendications, ne différant que par la signature :

```
A. vrai jeton hérité, signé par le secret partagé
   → 404 PGRST205 « Could not find the table 'public.profils' »

B. mêmes revendications, signature inventée
   → 401 PGRST301 « None of the keys was able to decode the JWT »
```

En A, PostgREST **avait authentifié le jeton** et appliqué son rôle : il ne se
plaignait plus que d'un nom de table inventé pour l'occasion. La signature était
donc acceptée.

Après révocation, les deux réponses sont devenues identiques :

```
A → 401 PGRST301 « No suitable key was found to decode the JWT »
B → 401 PGRST301 « No suitable key was found to decode the JWT »
```

C'est la fermeture, et elle se lit en une ligne.

### Ce que ça coûte de savoir mesurer la bonne chose

Trois mesures ont été prises avant celle-ci, et toutes disaient `401` sans rien
prouver de la signature. La leçon n'est pas « il fallait mieux chercher » : c'est
qu'**une barrière ne se vérifie qu'en interrogeant le composant qui l'applique.**
Le portillon des clés d'API répond avant GoTrue, GoTrue contrôle les
revendications avant la signature, et seul PostgREST rend la signature
observable.

### Impact utilisateur : nul, et établi avant le geste

| Ce qui aurait pu casser | Pourquoi ça n'a pas cassé |
|---|---|
| Sessions ouvertes | Jetons d'accès valides 1 h ; la clé ne signait plus depuis 13 jours |
| Reconnexion automatique | Les jetons de rafraîchissement sont opaques, pas des JWT : ils ne dépendent d'aucune clé de signature |
| Connexion par mot de passe | Vérifié après coup : `400 invalid_credentials`, donc la clé passe |

L'interface a été le vrai obstacle — la colonne `ACTIONS` du tableau
*Previously used keys* tombait hors de l'écran, et la révocation demande de
recopier l'identifiant de 36 caractères pour confirmer.

## Ce qui a mal tourné pendant la fermeture

Quatre incidents, tous rattrapés, tous instructifs.

### Le secret de Vault a reçu deux mauvaises valeurs avant la bonne

D'abord le texte d'exemple lui-même — `<coller la clé sb_secret_ ici>`, 30
caractères. Puis la clé **publiable** avec les chevrons conservés, 48
caractères. La bonne valeur, 41 caractères préfixées `sb_secret_`, n'est arrivée
qu'au troisième essai.

**Et rien ne l'a signalé.** `avis_declencher_drainage` teste `if adresse is null
or cle is null` : une valeur fausse mais non nulle passe le test, la fonction
rend `DEMANDE`, poste un porteur invalide, et `envoyer-avis` répond `401`. Toutes
les minutes, sans une ligne dans les journaux de la base. C'est exactement la
panne que le commentaire en tête de cette migration décrit comme la pire — sauf
qu'il l'attendait d'une file qui ne se draine pas, pas d'un secret mal collé.

Le durcissement qui manque, à poser en migration :

```sql
if cle !~ '^(sb_secret_|eyJ)' then
  return 'SECRET_INVALIDE';
end if;
```

Un état nommé de plus, dans le style des deux autres. Il transforme une panne
muette en réponse lisible.

### Les modifications faites au tableau de bord n'atteignaient pas Netlify

Deux tentatives annoncées comme faites n'avaient rien écrit. Le champ
`updated_at` des variables l'a prouvé sans discussion : `2026-08-25`, trois jours
avant. La cause côté terminal était que `netlify-cli` n'est installé nulle part —
ni dans le dépôt, ni en global — et que `npx` demandait confirmation avant de le
télécharger.

**Une modification de tableau de bord n'est pas un fait tant qu'on ne l'a pas
relue par ailleurs.** `updated_at` est ici le témoin le moins cher et le plus
sûr.

### L'API Netlify refuse `PATCH` pour une valeur tous contextes

```
PATCH /accounts/{compte}/env/{cle}?site_id=… → 422 context can't be set to all
```

Cette route ne pose qu'un contexte à la fois. Pour une valeur unique, c'est
`PUT` — et il faut lui repasser `scopes` et `is_secret`, faute de quoi il les
remplace par ses défauts et la variable cesse d'être visible au moment de la
construction.

### La première construction locale ne correspondait pas au paquet servi

`verifier:en-ligne` a crié à juste titre, sur une fausse piste. Comparaison
faite : 813 chaînes de texte identiques des deux côtés, seuls les noms courts du
minificateur différaient — 2,4 ko d'écart, aucune différence de code.
Reconstruire a donné exactement l'empreinte servie.

La chaîne de construction est donc bien reproductible entre Windows et Linux.
C'est le premier passage qui avait bâti les applications contre des paquets
partagés pas encore refaits. Fragilité d'ordre de construction, sans rapport avec
les clés — mais elle a coûté une heure d'enquête au mauvais endroit.

---

## Fausse alerte, consignée pour la prochaine fois

La chaîne `sb_secret_` **est présente** dans les paquets servis par
`app.kolek.cash` et `admin.kolek.cash`. Ce n'est pas une fuite : c'est un
littéral de `supabase-js`, qui reconnaît le format des clés —

```js
e.startsWith(`sb_publishable_`) || e.startsWith(`sb_secret_`)
```

Zéro caractère suit le préfixe. Le garde-fou `scripts/verifier-bundles.mjs` ne
s'y trompe pas : son motif exige `sb_secret_[A-Za-z0-9_-]{8,}`. Une sonde écrite
à la hâte, elle, s'y trompe — celle de ce chantier l'a fait.

---

## Ce qui reste ouvert

- ~~**`JWT_KEY`, 88 caractères, posée sur les trois sites Netlify.**~~
  **Retirée des trois le 2026-08-28**, vérifié par l'API : il ne reste que
  `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.

  Elle était référencée nulle part dans le dépôt, et son horodatage la datait —
  posée le 2026-08-25 vers 14h48, une demi-heure après la modification des clés
  anon des trois sites le même jour, c'est-à-dire pendant la tentative de suivre
  l'audit du 25 qui prescrivait *Generate new secret*. Du matériel de clé rangé
  au mauvais endroit, que personne ne lisait, donc que personne ne surveillait.

  ~~**Le second geste reste à faire :** vérifier si la clé héritée est encore
  acceptée en vérification.~~ **Fait le 2026-08-30, et elle l'était.** Le
  `Legacy HS256 (Shared Secret)` a été révoqué. Voir « La fermeture n'était pas
  complète » plus haut.

- ~~**A-t-on pu s'ajouter comme administrateur pendant la fenêtre ?**~~
  **Vérifié le 2026-08-30 : non.** `public.admins` ne contient qu'une ligne,
  celle du compte de GTCS, créée le 2026-08-19 — cinq jours avant l'incident.

  Réserve à consigner : cela prouve l'absence de porte dérobée **persistante**,
  pas l'absence de passage. Une ligne ajoutée puis retirée pendant la fenêtre
  n'aurait rien laissé, le journal sur cette table n'existant pas encore. Ce cas
  supposerait toutefois un intrus renonçant à son propre accès en partant.
  Depuis le 2026-08-29, l'octroi **et** le retrait laissent tous deux une trace.
- ~~**`avis_declencher_drainage` accepte n'importe quelle valeur non nulle.**~~
  **Corrigé** par `20260828100000_avis_drainage_secret_plausible.sql` : deux
  états nommés de plus, `SECRET_INVALIDE` et `ADRESSE_INVALIDE`. Les cinq
  branches sont vérifiées à la main dans une transaction annulée, avec les
  valeurs réelles de l'incident. **Reste à appliquer en production** — la
  migration vit dans le dépôt, la base de production ne l'a pas encore reçue.
- **Aucun CAPTCHA sur les fonctions publiques.** La borne par IP ferme le script
  sur une machine, pas un réseau d'adresses. Turnstile reste la réponse
  recommandée par l'audit du 2026-08-25.
- **DMARC en `p=none`.** À passer en `p=quarantine` après quelques semaines
  d'envois propres.
- **Aucune rotation périodique.** Ce chantier ferme un incident ; il n'installe
  pas d'habitude. La clé secrète d'aujourd'hui vivra jusqu'au prochain incident
  si rien ne la fait tourner.

---

## Ce que le dépôt savait faire, et ce qu'il ne savait pas

`scripts/garde-env.mjs`, ajouté le 2026-08-24 en réaction immédiate, fait échouer
la construction quand la configuration porte un `service_role`, un `sb_secret_`,
un jeton tronqué, ou l'adresse et la clé inversées. Il aurait empêché la fuite
d'origine. Il n'a rien pu contre la suite, parce que **la suite ne passait pas
par le dépôt** : une clé qui vit encore, un secret de Vault mal collé, une
variable de tableau de bord jamais enregistrée.

Le dépôt garde ce qu'il produit. Il ne garde pas ce que les tableaux de bord
détiennent. Les deux mesures qui ont réellement piloté ce chantier —
`/auth/v1/settings` sur l'ancienne clé, `updated_at` sur les variables Netlify —
sont des sondes extérieures. C'est là qu'il faut investir la prochaine fois.

---

## La fermeture portait sur trois sites. Il y en a six — 2026-08-30

Découvert par accident, en cherchant pourquoi la PR #2 affichait des contrôles
rouges. La liste des vérifications GitHub nomme **cinq projets Netlify** branchés
sur ce dépôt, plus un sixième en état neutre :

| Projet | Connu de l'audit ? | Contrôles sur la PR |
|---|---|---|
| `kolek-site` | oui | neutres |
| `kolek-collecteur` | oui | neutres |
| `kolek-admin` | oui | verts |
| `calm-begonia-7139bf` | **non** | **en échec** |
| `mellifluous-cuchufli-182dc7` | **non** | **en échec** |
| `helpful-kleicha-e77441` | **non** | neutres |

Les trois derniers portent des noms auto-générés par Netlify, ce qui est la
signature d'un « Import from Git » lancé plusieurs fois.

### Ce que cela change dans ce document

Tout ce qui est écrit plus haut sous la forme « les trois sites » doit se lire
« les trois sites **connus** ». Concrètement :

- la clé publiable a été vérifiée sur trois sites sur six ;
- le retrait de `JWT_KEY` a été constaté sur trois sites sur six ;
- la conclusion « trois sites conformes » était exacte, et incomplète.

### Ce qui a été mesuré le 2026-08-30

Les trois projets inconnus ne servent rien publiquement — `HTTP 404` sur leur
adresse `*.netlify.app`, ce qui est cohérent avec des constructions qui
échouent. **Aucun artefact n'est donc exposé aujourd'hui.**

C'est la seule chose que cette mesure établit. Un projet Netlify conserve ses
variables d'environnement sans avoir jamais publié, et ses journaux de
construction avec. Si `JWT_KEY`, une clé `service_role` ou un `sb_secret_` y ont
été posés pendant la période du 2026-08-24, ils y sont encore.

### À faire, et ce n'est pas à la main du dépôt

Ouvrir chacun des trois projets inconnus dans Netlify, relever ses variables
d'environnement, puis le supprimer s'il ne sert à rien — ce que son absence de
déploiement réussi laisse penser. Un projet supprimé emporte ses variables ;
un projet oublié les garde.

### La leçon, qui est la même que celle du bas de page

La section précédente dit : « le dépôt garde ce qu'il produit, il ne garde pas
ce que les tableaux de bord détiennent ». Ce constat va un cran plus loin.

L'audit ne s'est pas trompé sur les sites qu'il a examinés. Il s'est trompé sur
**le nombre de sites qu'il y avait à examiner**, et il ne pouvait pas s'en
apercevoir : rien dans le dépôt ne dit combien de tableaux de bord consomment le
dépôt. La question « ai-je tout vu ? » n'a pas de réponse à l'intérieur du
périmètre qu'on s'est donné. Il faut la poser depuis l'extérieur — et cette
fois, c'est la liste des contrôles d'une pull request qui a répondu.
