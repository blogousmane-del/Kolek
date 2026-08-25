# Audit de sécurité — Kolek

**Date :** 2026-08-25 · **Périmètre :** dépôt `blogousmane-del/Kolek` au commit
`6a97a26`, projet Supabase `yfnwmokxkznejotgpfgf` (`kolek-prod`), sites
`kolek-collecteur`, `kolek-admin` et `kolek-site`.

> Deuxième passage de la journée. Le premier
> (`2026-08-25-verification-audit.md`) remesurait les constats du 24 ; celui-ci
> reprend les vingt contrôles depuis le début, sur le schéma distant lu par la
> CLI liée et sur les paquets réellement servis.

**Verdict : À CORRIGER AVANT LANCEMENT.** Le bloquant du 24 est toujours
ouvert — mesuré aujourd'hui par deux voies indépendantes, et la mesure est
formelle : le secret JWT n'a pas tourné. Tout le reste de l'audit est bon, et
deux constats nouveaux s'ajoutent, tous deux nés d'une garde posée à la main sur
une famille d'objets, et oubliée sur un membre de la famille.

| | Nombre |
|---|---|
| 🔴 Bloquant | 1 |
| 🟠 Important | 3 |
| 🟡 À faire | 3 |
| ⚪️ Non applicable | 1 |
| Ouvert, hors de portée du dépôt | 1 |
| Non vérifié | 0 |

---

## 🔴 La clé `service_role` publiée le 24 ouvre toujours la base

**Où :** configuration du projet Supabase — rien à corriger dans le dépôt.

Le 2026-08-24, `kolek-site` a servi pendant quelques minutes un paquet contenant
le JWT de rôle service en clair. Le paquet a été remplacé le jour même. La
question qui compte n'est pas celle-là : une clé publiée une fois est copiée
pour toujours, et seule sa révocation la referme.

**Elle n'a pas été révoquée. Deux mesures du jour le prouvent, et elles ne
dépendent pas l'une de l'autre.**

*Première mesure — la charge utile de la clé publique servie.* Les trois paquets
en ligne portent le même jeton `anon` :

```
eyJ…  payload : {"iss":"supabase","ref":"yfnwmokxkznejotgpfgf","role":"anon",
                 "iat":1786918110,"exp":2102494110}
iat = 2026-08-16T22:08:30Z    exp = 2036-08-16T10:08:30Z
```

`iat` tombe à la seconde sur la date de création du projet — `created_at` vaut
`2026-08-16T22:08:30.807Z`. C'est donc le jeton d'origine, celui qu'on ne
remplace qu'en régénérant le secret. Les trois `.env.production` portent la même
signature (`DZOkT8cl…`).

*Seconde mesure — la clé répond.* Les deux jetons, `anon` et `service_role`,
sont signés par le **même** secret. Si celui-ci avait tourné, le jeton `anon`
d'avant l'incident serait mort avec l'autre :

```
clé anon d'avant l'incident → GET /auth/v1/settings : 200
```

Elle répond. Le secret n'a pas tourné. Le jeton `service_role` diffusé le 24
est donc toujours valide : lecture et écriture de la base entière, RLS ignorée,
déclencheurs d'immuabilité contournés — jusqu'au 16 août 2036.

Tant que ce point tient, aucun autre constat de cet audit ne compte. Les douze
politiques RLS, les privilèges accordés colonne par colonne, les trois
déclencheurs d'immuabilité : tout cela protège de l'appelant qui passe par
PostgREST. La clé de service ne passe pas par là.

**La correction, dans l'ordre.**

1. Supabase → Settings → API → JWT Secret → *Generate new secret*.
2. La nouvelle clé `anon` dans les trois sites Netlify, puis redéploiement des
   trois. Le paquet servi porte la clé : sans reconstruction, les sites
   continuent d'envoyer l'ancienne, qui sera refusée.
3. **Le secret du Vault, qu'on oublie.** `avis_declencher_drainage` lit
   `kolek_cle_service` dans `vault.decrypted_secrets` et s'en sert comme
   `Authorization` pour réveiller `envoyer-avis`. C'est une copie manuelle : la
   rotation ne la met pas à jour. Non mise à jour, elle ne casse rien de visible
   — la fonction rend `SECRETS_ABSENTS` ou se fait refuser, et la file d'avis
   cesse silencieusement de se vider. Exactement le genre de panne qu'on
   découvre à la première contestation d'un client.
4. Les variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` et
   `SUPABASE_SERVICE_ROLE_KEY` des dix Edge Functions sont injectées par la
   plateforme : elles suivent seules.
5. `supabase/tests/.env.test` pointe sur `127.0.0.1` — clés du conteneur local,
   sans rapport avec la production. Rien à y faire.

Toutes les sessions ouvertes tombent. C'est le prix, et il est sans commune
mesure avec celui d'une base ouverte.

*Ce qui empêche la récidive est déjà en place :* `scripts/garde-env.mjs` fait
échouer la construction — sortie 1, donc déploiement interrompu — quand la
configuration porte un `service_role`, un `sb_secret_`, un jeton tronqué, ou
l'adresse et la clé inversées.

---

## 🟠 À corriger dans la semaine

### 1. `envoyer-avis` s'ouvre à qui détient la clé publique — contrôle n°6

**Où :** `supabase/functions/envoyer-avis/index.ts`

**Le problème.** La fonction est décrite dans son propre en-tête comme
« appelée par une tâche planifiée — pas par un navigateur ». Elle n'émet aucun
en-tête CORS, ce qui écarte l'appel depuis une page. Elle n'écarte pas l'appel
depuis un terminal.

Mesuré en production, avec une requête `GET` — refusée par la fonction
elle-même, donc sans effet, mais après la barrière de la plateforme :

```
GET /functions/v1/envoyer-avis                    → 401   (sans jeton)
GET /functions/v1/envoyer-avis  + clé anon        → 405   (méthode refusée)
```

Le `405` est la preuve : la requête a franchi `verify_jwt` et atteint le code de
la fonction. `verify_jwt` vérifie qu'un jeton est signé par le projet — la clé
`anon` en est un. Et cette clé est publiée dans le paquet JavaScript du site
vitrine, par construction.

Le code de la fonction, lui, ne vérifie rien : aucune comparaison de l'appelant,
aucun `est_admin`. Après le contrôle de méthode, elle prend la clé de service et
draine la file.

**Ce que cela coûte, et quand.** Aujourd'hui, rien : aucune passerelle SMS n'est
configurée, la fonction rend `PASSERELLE_NON_CONFIGUREE` et la file reste
intacte. Le jour où les identifiants arrivent, deux choses deviennent vraies en
même temps :

- n'importe qui peut déclencher le drainage quand il veut ;
- et le drainage n'a **aucune réservation de lot**. La fonction lit cinquante
  lignes, envoie, puis marque `envoye`. Deux appels simultanés lisent les mêmes
  cinquante lignes et envoient deux fois — le client reçoit le message en
  double, et `avis_consommer_quota` décompte deux fois le quota du collecteur.
  Un appelant qui lance dix appels en parallèle multiplie la facture SMS par
  dix.

L'ordre « marquer après l'envoi » est délibéré et bien argumenté dans le
fichier : entre un message en trop et un message jamais parti mais compté comme
parti, on choisit celui qui se voit. Le raisonnement tient contre une **panne**.
Il ne tient pas contre un appelant qui provoque la concurrence exprès.

**La correction.** Deux pièces, et la première est presque gratuite parce que
l'appelant légitime envoie déjà ce qu'il faut — `avis_declencher_drainage` pose
`Authorization: Bearer <clé de service>` :

```ts
const attendu = `Bearer ${cleService}`;
if (requete.headers.get('Authorization') !== attendu) {
  return reponse({ erreur: 'ACCES_RESERVE' }, 403);
}
```

Puis réserver le lot avant d'envoyer : un `update … set statut = 'en_cours'
where id in (…) and statut in ('a_envoyer','echoue') returning …`, et n'envoyer
que ce que le `returning` rend. Deux appels concurrents ne peuvent alors pas se
partager la même ligne.

### 2. Le formulaire public d'ouverture n'a toujours aucune borne — contrôle n°12

**Où :** `supabase/functions/demander-ouverture/index.ts`

Inchangé depuis le 24, et remesuré :
`grep -cin "ratelimit\|captcha\|turnstile"` rend **0** sur la fonction comme sur
les modules partagés. Le seul garde-fou est un index unique sur le **même**
numéro en attente :

```sql
CREATE UNIQUE INDEX demandes_telephone_en_attente
  ON public.demandes_ouverture (telephone) WHERE (statut = 'nouvelle')
```

Un script qui fait varier le numéro le contourne entièrement. Rien ne fuit —
mais quelques milliers de fausses demandes noient les vraies dans l'écran
d'administration, et chaque ligne est un numéro à rappeler.

**La correction.** Cloudflare Turnstile sur le formulaire de la vitrine, vérifié
**dans l'Edge Function** et non dans le navigateur, plus une borne par IP dans
la fonction. Une demande par minute suffit à un formulaire qu'un humain remplit
une fois.

### 3. La limite sur les tentatives de connexion reste celle de la plateforme — contrôle n°11

**Où :** configuration Auth du projet Supabase.

Mesuré aujourd'hui contre un compte inexistant : le premier `429` arrive à la
**33ᵉ** tentative — 36ᵉ hier, l'écart tenant au compteur horaire déjà entamé.
C'est le seuil par défaut, jamais resserré. Le protocole vise environ cinq
tentatives par quart d'heure. Aucun verrouillage progressif par compte non plus :
la borne est par IP.

Ce qui atténue, et qu'il faut porter au crédit du projet : l'inscription publique
est fermée, il n'existe que trois comptes, la longueur minimale est de dix
caractères, et `_shared/hibp.ts` refuse les mots de passe divulgués. Le risque
est faible ; il n'est pas nul.

---

## 🟡 Durcissement

### 1. Deux fonctions gardent l'exécution ouverte à PUBLIC — contrôle n°6

La vérification du matin a fermé `journaliser_collecteur`, laissée ouverte
quand ses deux sœurs étaient révoquées. Elle a corrigé le cas, pas la classe.
Balayage complet des vingt-trois fonctions de `public` sur le schéma distant :
**deux n'ont pas de `REVOKE ALL … FROM PUBLIC`.**

`grouper_milliers(integer)` est celle qui se mesure :

```
POST /rest/v1/rpc/grouper_milliers   (clé anon publique)
  → 200   "1 234 567"
```

C'est le **seul** point de `/rest/v1` que la clé anonyme atteigne : partout
ailleurs elle prend `401`. La fonction ne lit aucune table, elle est `immutable`,
son `search_path` est `pg_temp` — elle ne peut rien exposer. Ce qu'elle coûte est
d'une autre nature : un point d'entrée non authentifié qui consomme une connexion
du rôle `anon`, et une exception silencieuse à une règle que le reste du projet
tient sans faute.

La cause est une ligne manquante, et elle est visible à l'œil :
`supabase/migrations/20260823140000_notifications_clients.sql:244` révoque
`mettre_en_file_avis` ; `grouper_milliers`, déclarée quatre lignes plus bas dans
le même fichier, n'a pas eu la sienne.

```sql
revoke all on function public.grouper_milliers(integer) from public, anon, authenticated;
```

`rls_auto_enable()` est la seconde. Celle-là **ne vient pas du dépôt** — Supabase
l'installe avec sa fonction d'activation automatique de RLS. Elle rend
`event_trigger`, un type que PostgREST n'expose pas ; elle n'est atteignable par
aucune requête HTTP. Rien à faire, mais elle est écrite ici pour que le prochain
balayage ne la redécouvre pas comme une nouveauté.

**Ce qui vaut mieux que les deux corrections.** Les migrations portent
**trente-neuf** `revoke all on function`, un par fonction, écrits à la main.
C'est une garde qui dépend de la mémoire de celui qui ajoute la quarantième. Un
test qui affirme *« aucune fonction de `public` ne garde l'exécution PUBLIC,
hors celles que la plateforme installe »* aurait attrapé `journaliser_collecteur`
hier et `grouper_milliers` aujourd'hui, et attrapera la prochaine.

### 2. Les numéros de téléphone sont en clair, et recopiés — contrôle n°5

Inchangé. `clients.telephone`, `collecteurs.telephone` et
`demandes_ouverture.telephone` sont en `text`. Les déclencheurs `journaliser` et
`journaliser_collecteur` écrivent `to_jsonb(new)` dans `audit_log` : chaque
numéro y est donc recopié. `pgcrypto` est bien installé, mais n'est utilisé
nulle part sur ces colonnes.

Le journal est fermé à tous les rôles applicatifs et immuable, ce qui borne
l'exposition à une fuite complète de la base. À trancher : chiffrer, ou retirer
les colonnes sensibles du `to_jsonb`.

### 3. La session vit dans `localStorage` — contrôle n°9

Inchangé. `createClient(url, cle)` sans options, dans les deux applications :
c'est le comportement par défaut de Supabase pour une application monopage. Ce
qui rend le risque théorique ici : la CSP est `script-src 'self'`, sans
`unsafe-inline` ni `unsafe-eval`, et le dépôt ne contient aucun
`dangerouslySetInnerHTML` ni `innerHTML`. Passer à un cookie `httpOnly`
exigerait un rendu serveur que le produit n'a pas.

---

## ⚪️ Non applicable

**Contrôle n°16 — uploads.** `supabase storage ls --linked` rend `{"paths":[]}` :
aucun bucket n'existe. La colonne `clients.photo_url` est prévue, bornée par deux
contraintes `check` dont une qui impose `https`, mais rien ne l'alimente. À
réauditer le jour où un bucket est créé.

---

## Ouvert, hors de portée du dépôt

**`pg_net` accorde l'appel HTTP à `anon` et `authenticated`.** Relevé le 25 au
matin, inchangé, et non corrigeable depuis une migration : les droits ont été
accordés par `supabase_admin`, dont `postgres` n'est pas le donneur — une
révocation dans une migration serait un no-op qui ressemble à une protection.

Les trois conditions qui contiennent le sujet ont été remesurées aujourd'hui :

```
config.toml  →  schemas = ["public"]
                extra_search_path = ["public", "extensions"]   (pas de "net")
POST /rest/v1/rpc/http_post  (clé anon)  →  404
```

Et le schéma distant ne contient qu'un seul appel à `net.` : dans
`avis_declencher_drainage`, qui est `SECURITY DEFINER`, révoquée de PUBLIC et
accordée au seul `service_role`. À surveiller — ne jamais ajouter `net` à
`[api] schemas` ni à `extra_search_path`, et n'écrire aucune fonction
`security invoker` de `public` qui appelle `net`. Le sujet est à remonter à
Supabase.

---

## Les 20 contrôles

| # | Contrôle | Statut | Preuve du 2026-08-25 |
|---|---|---|---|
| 1 | Clés API cachées | ✅ | 0 motif `sk-`, `sk_live_`, `AKIA…`, `ghp_`, clé privée PEM dans le dépôt |
| 2 | Secrets purgés de Git | ✅ | Historique complet : aucun `.env`, `.pem`, `.key` ni `serviceaccount` ; seuls deux `.env.example` suivis ; `.gitignore` couvre `.env` et `.env.*` |
| 3 | Bonne clé côté client | 🔴 | 0 `service_role` dans les trois paquets servis — mais la clé publiée le 24 n'est pas révoquée |
| 4 | Row Level Security | ✅ | **12 tables, 12 avec RLS**, 18 politiques, aucune de condition `true` |
| 5 | Chiffrement des données sensibles | 🟡 | 3 colonnes `telephone` en clair, recopiées dans `audit_log` par `to_jsonb(new)` |
| 6 | Autorisation côté serveur | 🟠 | 7/7 fonctions `admin-*` appellent `est_admin` ; `envoyer-avis` n'a aucun contrôle d'appelant ; 2 fonctions SQL gardent PUBLIC |
| 7 | Verrouillage par enregistrement | ✅ | Les 18 politiques filtrent sur `auth.uid()` ; `collecteur-cloturer-carte` lit sous l'identité de l'appelant avant de sortir la clé de service |
| 8 | Champs non modifiables | ✅ | `authenticated` : 25 colonnes en insertion, 11 en mise à jour, nommées une par une ; ni `statut`, ni `palier`, ni `mises_encaissees`, ni `commission` ; 3 déclencheurs d'immuabilité |
| 9 | Cookies de session | 🟡 | `localStorage` par défaut ; CSP stricte, aucun vecteur XSS |
| 10 | Mots de passe hachés | ✅ | Supabase Auth ; aucune table maison ; refus HIBP en plus |
| 11 | Rate limiting connexion | 🟠 | **429 à la 33ᵉ tentative** ; pas de verrouillage par compte |
| 12 | Anti-bot | 🟠 | Aucun CAPTCHA ni borne sur le formulaire public |
| 13 | Requêtes paramétrées | ✅ | Aucun SQL dynamique dans les 20 migrations ; le seul `execute format` du schéma distant est `rls_auto_enable`, installée par Supabase, sur des identifiants issus du catalogue |
| 14 | Validation des entrées | ✅ | `validerDemande` testé ; **36 contraintes `check`** en base (bornes de texte, statuts, montants positifs, cohérence de clôture) |
| 15 | Échappement du contenu | ✅ | 0 `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `document.write` |
| 16 | Uploads restreints | ⚪️ | Aucun bucket de stockage |
| 17 | Réponses API épurées | ✅ | Aucun `select('*')` dans le code applicatif ni les Edge Functions |
| 18 | Headers de sécurité | ✅ | CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer, Permissions — 6/6 mesurés sur les trois sites |
| 19 | HTTPS forcé | ✅ | 301 sur les trois ; HSTS `max-age=31536000; includeSubDomains; preload` |
| 20 | Dépendances scannées | ✅ | `npm audit --omit=dev` : 0 vulnérabilité |

---

## Ce que la mesure confirme, et qui mérite d'être dit

**Le rôle anonyme n'a qu'un privilège dans toute la base :**
`GRANT USAGE ON SCHEMA "public"`. Pas un `GRANT` de table, pas une colonne, pas
une fonction — à l'exception involontaire de `grouper_milliers` relevée plus
haut. Ce n'est pas « RLS le bloque » : il n'y a rien à bloquer.

**Les privilèges de `authenticated` sont accordés colonne par colonne.** Une
colonne ajoutée à une table n'hérite d'aucun droit ; il faut l'accorder
expressément. `cartes`, arrivée en version « plusieurs carnets par client » ce
matin, n'ouvre que `id`, `collecteur_id`, `client_id` et `mise`.

**L'immuabilité est portée par des déclencheurs, pas par RLS** — donc elle vaut
aussi contre la clé de service, que RLS ne contraint pas. `mises`, `retraits` et
`audit_log` refusent `UPDATE` et `DELETE`.

**Le dépôt et la production ne divergent nulle part.** Les vingt migrations
locales ont toutes leur jumelle distante, sans écart de version. Les trois
paquets servis portent exactement les artefacts du `dist/` local
(`verifier:en-ligne` : trois cibles conformes). Le correctif du cash attendu de
ce matin est bien en base : `cash_attendu_du_jour` soustrait
`montant_restitue`, et `caisses_rafraichir_apres_retrait` existe.

---

## La suite, dans l'ordre

1. **Régénérer le secret JWT** et redéployer les trois sites, sans oublier le
   secret `kolek_cle_service` du Vault. Rien d'autre ne compte avant.
2. Fermer `envoyer-avis` à son appelant légitime, et réserver le lot avant
   d'envoyer — **avant** que la passerelle SMS ne soit configurée, pas après.
3. `revoke all on function public.grouper_milliers(integer)`, et le test qui
   rend la règle vérifiable plutôt que mémorisée.
4. Turnstile sur le formulaire public ; resserrer les limites Auth.
