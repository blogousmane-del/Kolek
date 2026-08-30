# Audit de sécurité — Kolek

**Date :** 2026-08-28 · **Périmètre :** dépôt au commit `65f631c`, projet
Supabase `yfnwmokxkznejotgpfgf` (`kolek-prod`), sites `kolek.cash`,
`app.kolek.cash` et `admin.kolek.cash`.

> Second document de la journée. Le premier
> (`2026-08-28-fermeture-cle-service.md`) close l'incident de la clé de service
> publiée le 24. Celui-ci reprend les vingt contrôles depuis le début, sur le
> dépôt et sur ce que la production répond réellement à la clé publiable.

> **Correction du 2026-08-30 — le verdict ci-dessous ne tient plus tel quel.**
> Deux raisons, dans l'ordre de gravité :
>
> 1. **« La fermeture est mesurée » était faux.** Le `401` mesuré le 28 venait
>    du portillon des clés d'API ; le secret partagé qui avait signé la clé
>    fuitée **vérifiait encore les jetons**. On pouvait forger un
>    `role: service_role` valide sans jamais toucher à la clé publiée. Fermé le
>    2026-08-30. Détail et test décisif dans
>    `2026-08-28-fermeture-cle-service.md`.
> 2. **Trois constats manquaient à ces vingt contrôles**, trouvés le 29 en
>    confrontant Kolek aux invariants d'un starter éprouvé : un oracle temporel
>    sur `mot-de-passe-oublie` (le corps de réponse ne distinguait pas les
>    comptes, l'horloge si), aucun journal sur les suppressions, et aucun
>    journal du tout sur `public.admins` — la table qui accorde
>    l'administration, écrivable par la clé qui venait de fuiter. Les trois sont
>    corrigés et déployés.
>
> Ce que cela dit de la méthode : vingt contrôles qui regardent l'état courant
> ne voient ni ce qui n'a pas de trace, ni ce qui se lit au chronomètre. Le
> compte « 0 bloquant » mesurait la couverture de la grille, pas celle du
> produit.

**Verdict : PRÊT À LANCER, deux corrections à programmer.** Le bloquant qui
tenait l'audit en échec depuis le 24 est fermé, et la fermeture est mesurée. Il
ne reste aucun constat rouge. Les deux points importants sont connus, datés du
25, et aucun des deux n'est exploitable sans une condition qui n'existe pas
encore — une passerelle SMS configurée pour l'un, un mot de passe faible pour
l'autre.

| | Nombre |
|---|---|
| 🔴 Bloquant | 0 |
| 🟠 Important | 2 |
| 🟡 À faire | 6 |
| ⚪️ Non applicable | 1 |
| Ouvert, hors de portée du dépôt | 1 |
| Non vérifié | 0 |

---

## Ce qui a changé depuis le 2026-08-25

| Constat du 25 | État aujourd'hui |
|---|---|
| 🔴 Clé `service_role` publiée, jamais révoquée | **Fermé.** Clés héritées désactivées, bascule complète en `sb_publishable_` / `sb_secret_` |
| 🟠 `envoyer-avis` ouverte à qui détient la clé publique | **Inchangé**, remesuré aujourd'hui |
| 🟠 Formulaire public sans aucune borne | **Corrigé pour l'essentiel** : `consommer_debit` borne par IP les deux fonctions publiques. Reste le cas distribué, redescendu en 🟡 |
| 🟠 Limite Auth restée au défaut de la plateforme | **Inchangé**, remesuré aujourd'hui |
| 🟡 `grouper_milliers` garde l'exécution PUBLIC | **Inchangé**, remesuré aujourd'hui |
| 🟡 Téléphones en clair | **Inchangé**, et une colonne de plus depuis le 27 |
| 🟡 Session dans `localStorage` | Inchangé, toujours sans vecteur |

---

## 🟠 À corriger dans la semaine

### 1. `envoyer-avis` ne vérifie toujours aucun appelant — contrôle n°6

**Où :** `supabase/functions/envoyer-avis/index.ts`

Le constat du 25 est repris mot pour mot, parce que le fichier n'a pas bougé.
Remesuré aujourd'hui en production, avec un `GET` — refusé par la fonction
elle-même, donc sans effet, mais après la barrière de la plateforme :

```
GET /functions/v1/envoyer-avis                        → 401  (sans jeton)
GET /functions/v1/envoyer-avis  + clé publiable       → 405  {"erreur":"METHODE_NON_AUTORISEE"}
```

Le `405` reste la preuve : la requête a franchi `verify_jwt` et atteint le code
de la fonction. La clé publiable qui l'a franchie est servie dans le paquet
JavaScript des trois sites, par construction.

Après le contrôle de méthode, la fonction prend `SUPABASE_SERVICE_ROLE_KEY` et
draine la file. Elle ne compare aucun appelant, n'appelle pas `est_admin`, et
n'émet aucun en-tête CORS — ce qui écarte l'appel depuis une page, pas depuis un
terminal.

**Ce que cela coûte, et quand.** Aujourd'hui, rien : `passerelleDepuis` ne
trouve aucun identifiant, la fonction rend `PASSERELLE_NON_CONFIGUREE` et la
file reste intacte. Le jour où la passerelle SMS est branchée, deux choses
deviennent vraies ensemble — n'importe qui déclenche le drainage quand il veut,
et le drainage n'a **aucune réservation de lot** : la fonction lit cinquante
lignes, envoie, puis marque `envoye`. Dix appels en parallèle envoient dix fois
et décomptent dix fois le quota du collecteur.

**La correction, inchangée.** L'appelant légitime envoie déjà ce qu'il faut —
`avis_declencher_drainage` pose `Authorization: Bearer <clé de service>` :

```ts
const attendu = `Bearer ${cleService}`;
if (requete.headers.get('Authorization') !== attendu) {
  return reponse({ erreur: 'ACCES_RESERVE' }, 403);
}
```

Puis réserver le lot avant d'envoyer : `update … set statut = 'en_cours' where
id in (…) and statut in ('a_envoyer','echoue') returning …`, et n'envoyer que ce
que le `returning` rend.

**Le calendrier est le point important :** avant que les identifiants de la
passerelle n'arrivent, pas après. Passé ce jour, la correction se fait sur un
système qui envoie déjà des messages payants à de vrais clients.

### 2. La limite sur les tentatives de connexion reste celle de la plateforme — contrôle n°11

**Où :** configuration Auth du projet Supabase — `supabase/config.toml:256` en
porte la trace côté dépôt.

Mesuré aujourd'hui contre une adresse inexistante, sonde volontairement courte :

```
8 tentatives consécutives  →  400 400 400 400 400 400 400 400
```

Aucun `429` en huit essais. Le seuil du 25 (premier `429` à la 33ᵉ tentative)
n'a donc pas été resserré, et `config.toml` le confirme côté dépôt :

```toml
sign_in_sign_ups = 30    # par tranche de 5 minutes et par IP
```

Le protocole vise environ cinq tentatives par quart d'heure, avec verrouillage
progressif par compte. Ici la borne est par IP seulement.

**Ce qui atténue, et qui reste vrai :** l'inscription publique est fermée
(`enable_signup = false`), il n'existe qu'une poignée de comptes, le minimum est
de dix caractères, et le refus des mots de passe divulgués est actif. Et
l'énumération de comptes reste impossible — remesurée aujourd'hui, une adresse
inconnue rend exactement ce que rend un mot de passe faux :

```json
{"code":400,"error_code":"invalid_credentials","msg":"Invalid login credentials"}
```

Le risque est faible ; il n'est pas nul, et la correction est un réglage dans le
tableau de bord.

---

## 🟡 Durcissement

### 1. `grouper_milliers` garde l'exécution ouverte à PUBLIC — contrôle n°6

Inchangé depuis le 25, et remesuré aujourd'hui avec la clé publiable :

```
POST /rest/v1/rpc/grouper_milliers   → 200   "1 234 567"
```

C'est toujours le **seul** point de `/rest/v1` que la clé publiable atteigne.
Balayage du même jour, même clé, pour situer :

```
13 tables (collecteurs … debit_public)          → 401  42501
rpc est_admin / admin_vue_globale               → 401  42501
rpc avis_declencher_drainage                    → 401  42501
rpc consommer_debit / http_post / http_get      → 404  PGRST202 (non exposées)
```

La fonction ne lit aucune table, elle est `immutable`, son `search_path` est
`pg_temp` : elle ne peut rien exposer. Ce qu'elle coûte est une exception
silencieuse à une règle que le reste du projet tient sans faute, et un point
d'entrée non authentifié qui consomme une connexion du rôle `anon`.

La cause est une ligne manquante :
`supabase/migrations/20260823140000_notifications_clients.sql:245` révoque
`mettre_en_file_avis` ; `grouper_milliers`, déclarée trois lignes plus bas dans
le même fichier, n'a jamais eu la sienne.

```sql
revoke all on function public.grouper_milliers(integer) from public, anon, authenticated;
```

**Et ce qui vaut mieux que la correction.** Les migrations portent maintenant
cinquante-deux `revoke all on function`, écrits un par un. Le 2026-08-28 en a
d'ailleurs ajouté un de plus — `avis_declencher_drainage` gardait
`service_role=X/postgres`, trouvé à la main. `supabase/tests/` ne
contient aujourd'hui **aucun** test interrogeant `has_function_privilege` ou
`proacl`. Un test qui affirme *« aucune fonction de `public` ne garde
l'exécution PUBLIC, hors celles que la plateforme installe »* aurait attrapé
`journaliser_collecteur` le 24, `grouper_milliers` le 25, et attrapera la
prochaine.

### 2. Le garde-fou de la liste blanche des colonnes n'a pas suivi les tables récentes — contrôle n°8

Le dispositif de `20260817002000` est le meilleur du dépôt : il compare l'état
effectif des privilèges à une liste blanche **entière**, au lieu d'énumérer des
interdits connus. Il a été rejoué une dernière fois dans
`20260819010000_socle_bornes_texte.sql:193`.

Depuis, un privilège de colonne a été accordé sans repasser par lui :

```
20260823140000_notifications_clients.sql:53
  grant insert (avis_actifs), update (avis_actifs) on public.clients to authenticated;
```

Ce grant est légitime — le collecteur possède ses clients et l'opt-in des avis
lui revient. Ce qui manque est la vérification : aucune migration postérieure au
19 ne recompare la liste complète, et les tables nées depuis
(`avis_reglages`, `avis_clients`, `demandes_ouverture`, `debit_public`) portent
chacune leur garde-fou local, écrit à la main, avec la même faiblesse que les
`revoke` ci-dessus.

L'héritage par défaut est bien coupé — c'est ce qui rend le sujet 🟡 et non 🟠 :
une table neuve ne naît plus ouverte. Mais la liste blanche a cessé d'être un
inventaire et redevient une mémoire.

**À faire :** rejouer le garde-fou colonnes dans une migration à jour, ou mieux,
le porter dans `supabase/tests/` où il s'exécute à chaque `db:reset`.

### 3. Les numéros de téléphone sont en clair, et il y a maintenant une adresse — contrôle n°5

Inchangé, avec une colonne de plus depuis le 2026-08-27 :

| Colonne | Recopiée dans `audit_log` |
|---|---|
| `collecteurs.telephone` | oui — `journaliser_collecteur`, `to_jsonb(new)` |
| `clients.telephone` | oui — `journaliser`, `to_jsonb(new)` |
| `demandes_ouverture.telephone` | oui — `journaliser_demande`, `to_jsonb(new)` |
| `demandes_ouverture.email` | oui — même déclencheur |

`pgcrypto` est installé et n'est utilisé sur aucune de ces colonnes. Le journal
est fermé à tous les rôles applicatifs et immuable, ce qui borne l'exposition à
une fuite complète de la base — mais il double alors la fuite au lieu de la
contenir.

À trancher, et c'est un choix de produit : chiffrer, ou retirer les colonnes
sensibles du `to_jsonb`.

### 4. Le formulaire public résiste au script, pas à la flotte — contrôle n°12

Redescendu de 🟠 à 🟡 : la borne demandée le 25 existe.

```
demander-ouverture    1 demande / 60 s / IP      (PLAFOND = 1)
mot-de-passe-oublie   3 demandes / 900 s / IP    (PLAFOND = 3)
```

Le compteur est atomique — `insert … on conflict do update … returning` en une
instruction — et la table `debit_public` est fermée à `anon` comme à
`authenticated`, garde-fou compris. `demander-ouverture` **refuse** quand le
compteur est en panne plutôt que d'ouvrir, ce qui est le bon sens de la panne
pour la seule écriture publique du produit.

Ce qui reste : l'empreinte est l'adresse IP. Une flotte d'adresses passe encore,
et rien ne prouve qu'un humain est au clavier. Cloudflare Turnstile sur le
formulaire de la vitrine, vérifié **dans l'Edge Function**, ferme le sujet.

### 5. HSTS a perdu `preload` au passage à `kolek.cash` — contrôle n°18

Les six en-têtes sont là, sur les trois sites — mesuré aujourd'hui. Mais :

```
2026-08-25 (*.netlify.app) : max-age=31536000; includeSubDomains; preload
2026-08-28 (kolek.cash)    : max-age=31536000; includeSubDomains
```

Le `preload` du 25 venait de Netlify, sur son propre domaine. Sur `kolek.cash`,
c'est `apps/*/netlify.toml` qui écrit l'en-tête, et il ne porte pas la
directive. Sans elle, la toute première visite d'un navigateur qui n'a jamais vu
le domaine peut partir en clair — le `301` la rattrape, un interception sur un
wifi partagé, non.

Ajouter `; preload` aux trois `netlify.toml`, puis soumettre le domaine sur
`hstspreload.org`. La directive seule ne préinscrit rien ; elle est la condition
d'acceptation.

### 6. La session vit dans `localStorage` — contrôle n°9

Inchangé, et toujours sans vecteur. `createClient(url, cle)` sans options, dans
les deux applications : c'est le comportement par défaut de Supabase pour une
application monopage.

Ce qui rend le risque théorique, et qui a été revérifié aujourd'hui :

- CSP `script-src 'self'`, sans `unsafe-inline` ni `unsafe-eval`, sur les trois
  sites ;
- zéro `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`,
  `document.write` ou `eval(` dans tout le dépôt ;
- le cache de navigation du collecteur reste **en mémoire** — la `Map` de
  `apps/collecteur/src/cache.ts`, vidée à la déconnexion, jamais écrite sur le
  disque du téléphone ;
- le service worker ne déclare aucun `runtimeCaching` : il ne met en cache que
  les fichiers statiques, aucune réponse d'API.

Passer à un cookie `httpOnly` exigerait un rendu serveur que le produit n'a pas.

---

## ⚪️ Non applicable

**Contrôle n°16 — uploads.** Aucun bucket n'est déclaré dans le dépôt, et
`20260818010000_socle_storage_et_bornes.sql` porte deux garde-fous : l'héritage
par défaut du schéma `storage` est coupé, et un bucket créé hors migration fait
échouer le déploiement. `clients.photo_url` est prévue, bornée par deux `check`
dont une qui impose `https`, et rien ne l'alimente. À réauditer le jour où un
bucket est créé.

---

## Ouvert, hors de portée du dépôt

**`pg_net` accorde l'appel HTTP à `anon` et `authenticated`.** Relevé le 25,
inchangé, et non corrigeable depuis une migration : les droits ont été accordés
par `supabase_admin`, dont `postgres` n'est pas le donneur — une révocation dans
une migration serait un no-op qui ressemble à une protection.

Les trois conditions qui contiennent le sujet ont été remesurées aujourd'hui :

```
config.toml  →  schemas = ["public"]
                extra_search_path = ["public", "extensions"]   (pas de "net")
POST /rest/v1/rpc/http_post  (clé publiable)  →  404 PGRST202
POST /rest/v1/rpc/http_get   (clé publiable)  →  404 PGRST202
```

Le seul appel à `net.` du schéma est dans `avis_declencher_drainage`, qui est
`security definer`, révoquée de `public`, `anon`, `authenticated` **et**
`service_role` depuis ce matin, et dont le garde-fou interroge désormais les
trois rôles de l'API de données.

À surveiller — ne jamais ajouter `net` à `[api] schemas` ni à
`extra_search_path`, et n'écrire aucune fonction `security invoker` de `public`
qui appelle `net`.

---

## Les 20 contrôles

| # | Contrôle | Statut | Preuve du 2026-08-28 |
|---|---|---|---|
| 1 | Clés API cachées | ✅ | 0 motif `sk-`, `sk_live_`, `AKIA…`, `ghp_`, clé privée PEM. Les 3 paquets servis ne portent que `sb_publishable_GNPigR…` ; l'unique occurrence de `sb_secret_` dans deux d'entre eux est un littéral du SDK `supabase-js` qui teste le format d'une clé, pas une clé |
| 2 | Secrets purgés de Git | ✅ | Historique complet : aucun `.env`, `.pem`, `.key` ni `serviceaccount` ; seuls deux `.env.example` suivis ; 0 fichier `.netlify/` suivi ; `.gitignore` couvre `.env`, `.env.*`, `.netlify/`, `supabase/.env` |
| 3 | Bonne clé côté client | ✅ | Clés héritées désactivées le 28 ; les 3 `.env.production` et les 3 paquets servis portent la même clé publiable ; `garde-env.mjs` fait échouer la construction sur `sb_secret_`, sur un JWT `service_role`, sur un jeton tronqué et sur l'adresse et la clé inversées |
| 4 | Row Level Security | ✅ | **13 tables, 13 avec RLS**, 18 politiques, toutes sur `auth.uid()`, aucune de condition `true`. Mesuré : les 13 tables rendent `401 / 42501` à la clé publiable |
| 5 | Chiffrement des données sensibles | 🟡 | 3 colonnes `telephone` + 1 colonne `email` en clair, les quatre recopiées dans `audit_log` par `to_jsonb(new)` |
| 6 | Autorisation côté serveur | 🟠 | 7/7 fonctions `admin-*` appellent `est_admin` sous l'identité de l'appelant **avant** de sortir la clé de service ; `collecteur-cloturer-carte` lit sous RLS avant de l'employer ; `envoyer-avis` ne vérifie aucun appelant (405 mesuré) ; `grouper_milliers` garde PUBLIC (200 mesuré) |
| 7 | Verrouillage par enregistrement | ✅ | Les 18 politiques filtrent sur `auth.uid()` ; carte absente et carte d'autrui rendent le même `CARTE_INTROUVABLE` |
| 8 | Champs non modifiables | 🟡 | Liste blanche colonne par colonne ; ni `statut`, ni `palier`, ni `mises_encaissees`, ni `commission` ; 3 déclencheurs d'immuabilité qui valent aussi contre la clé de service. Réserve : le garde-fou de liste blanche n'a pas été rejoué depuis le 19 |
| 9 | Cookies de session | 🟡 | `localStorage` par défaut ; CSP stricte, aucun vecteur XSS, cache de navigation en mémoire seule, service worker sans `runtimeCaching` |
| 10 | Mots de passe hachés | ✅ | Supabase Auth ; aucune table maison ; minimum 10 caractères ; refus HIBP ; aucun mot de passe n'est jamais écrit dans un courriel — lien à usage unique, une heure |
| 11 | Rate limiting connexion | 🟠 | **8 tentatives sur 8 acceptées**, aucun `429` ; `sign_in_sign_ups = 30` inchangé ; pas de verrouillage par compte. Énumération impossible : `invalid_credentials` dans les deux cas |
| 12 | Anti-bot | 🟡 | Borne par IP en place et atomique (1/min et 3/15 min), fail-closed sur panne du compteur ; pas de CAPTCHA — le cas distribué reste ouvert |
| 13 | Requêtes paramétrées | ✅ | Aucun SQL dynamique dans les 23 migrations ; les 30 fonctions `security definer` du dépôt ont toutes un `search_path` figé |
| 14 | Validation des entrées | ✅ | `validerDemande`, `validerEmail`, `validerCollecteur` testés ; bornes de texte, statuts, montants et cohérence de clôture tenus par des `check` en base |
| 15 | Échappement du contenu | ✅ | 0 `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `document.write`, `eval(` ; les courriels sont en texte brut, sans HTML |
| 16 | Uploads restreints | ⚪️ | Aucun bucket ; héritage du schéma `storage` coupé ; garde-fou qui refuse un bucket non déclaré |
| 17 | Réponses API épurées | ✅ | Aucun `select('*')` dans le code applicatif ni les Edge Functions |
| 18 | Headers de sécurité | 🟡 | CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer, Permissions — 6/6 mesurés sur les trois sites ; HSTS sans `preload` |
| 19 | HTTPS forcé | ✅ | `301` vers `https://` sur les trois domaines ; HSTS `max-age=31536000; includeSubDomains` |
| 20 | Dépendances scannées | ✅ | `npm audit` et `npm audit --omit=dev` : 0 vulnérabilité |

---

## Ce que la mesure confirme, et qui mérite d'être dit

**La clé publiable n'ouvre rien.** Treize tables interrogées sans session : les
treize rendent `42501`. Ce n'est pas « RLS les protège » — le rôle `anon` n'a
aucun privilège de table à protéger, RLS n'a rien à filtrer.

**Le portillon précède la clé de service, presque partout.** Les onze Edge
Functions détiennent `SUPABASE_SERVICE_ROLE_KEY`. Les huit qui exigent un
appelant authentifié — sept `admin-*` et `collecteur-cloturer-carte` — ne
construisent le client de service qu'après le contrôle, jamais avant, et le
commentaire `--- Passé ce point seulement, la clé de service sort ---` marque la
frontière dans chaque fichier. Les deux publiques l'emploient sous validation
d'entrée et borne par IP. `envoyer-avis` est la onzième, et la seule qui n'a pas
de frontière parce qu'elle n'a rien à séparer.

**L'immuabilité est portée par des déclencheurs, pas par RLS** — donc elle vaut
aussi contre la clé de service, que RLS ne contraint pas. `mises`, `retraits` et
`audit_log` refusent `UPDATE` et `DELETE`.

**Le dépôt et la production ne divergent pas.** `verifier:en-ligne` rend
« trois cibles conformes — artefacts comparés ». Les 210 tests des cinq espaces
de travail passent (core 58, ui 30, admin 19, collecteur 99, site 4).
`test:db` n'a pas été rejoué : il demande la pile Supabase locale, que cet audit
n'a pas démarrée — les contrôles de base ci-dessus sont donc mesurés sur le
schéma distant, pas sur le conteneur.

**Le nouveau dispositif de mot de passe ne dit rien sur les comptes.** Même
statut, même corps, que l'adresse soit connue, inconnue, ou que la borne ait
mordu — y compris quand la passerelle échoue. La propriété tient au code, pas à
une discipline de relecture : `generateLink` refuse de lui-même une adresse
inconnue, et rien dans le fichier ne peut répondre différemment selon ce qu'il a
trouvé.

---

## La suite, dans l'ordre

1. **Fermer `envoyer-avis` à son appelant légitime, et réserver le lot avant
   d'envoyer** — avant que la passerelle SMS ne soit configurée. C'est le seul
   point dont la fenêtre de correction se referme toute seule.
2. **Resserrer la limite Auth** dans le tableau de bord : environ cinq
   tentatives par quart d'heure, avec verrouillage progressif par compte.
3. `revoke all on function public.grouper_milliers(integer)`, **et** le test qui
   rend la règle vérifiable plutôt que mémorisée : aucune fonction de `public`
   ne garde l'exécution PUBLIC.
4. Rejouer le garde-fou de liste blanche des colonnes, de préférence dans
   `supabase/tests/`.
5. `; preload` dans les trois `netlify.toml`, puis soumission sur
   `hstspreload.org`.
6. Turnstile sur le formulaire de la vitrine.
7. Trancher le sujet des colonnes en clair recopiées dans `audit_log`.
