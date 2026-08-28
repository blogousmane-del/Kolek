# Fermeture de la clé `service_role` publiée le 2026-08-24

**Date :** 2026-08-28 · **Objet :** clore l'incident ouvert par
`2026-08-25-verification-audit.md`, seul constat bloquant du dépôt.

**Verdict : fermée.** Quatre jours d'exposition, du 2026-08-24 au 2026-08-28.
La clé n'ouvre plus rien — mesuré, pas supposé.

| | |
|---|---|
| Exposition | 4 jours |
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

- **`JWT_KEY`, 88 caractères, posée sur les trois sites Netlify et référencée
  nulle part dans le dépôt.** Du matériel de clé sans usage. Elle n'atteint pas
  le navigateur — seules les variables préfixées `VITE_` y vont — mais une
  valeur secrète que personne ne lit est une valeur que personne ne surveille.

  Son horodatage la date : posée le **2026-08-25 vers 14h48**, une demi-heure
  après la modification des clés anon des trois sites le même jour. C'est-à-dire
  pendant la tentative de suivre l'audit du 25, qui prescrivait *Generate new
  secret*. L'hypothèse la plus simple est qu'il s'agit du secret JWT du projet,
  collé dans trois environnements de construction au lieu du tableau de bord
  Supabase.

  Deux gestes, dans cet ordre : **la retirer des trois sites Netlify**, puis
  **vérifier dans Supabase → JWT Keys si la clé héritée est encore acceptée en
  vérification**. Si elle l'est, un porteur de cette valeur peut forger un jeton
  de session pour n'importe quel collecteur — ce que la désactivation des clés
  d'API du 2026-08-28 ne ferme pas, les deux mécanismes étant distincts.
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
