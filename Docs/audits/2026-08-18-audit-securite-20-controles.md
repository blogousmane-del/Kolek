# Audit de sécurité — Kolek

**Date :** 2026-08-18 · **Périmètre :** dépôt `blogousmane-del/Kolek` (public),
projet Supabase `kolek-prod` (`yfnwmokxkznejotgpfgf`, eu-west-3), trois sites
Netlify en production · **Méthode :** grille des 20 contrôles, mode complet
(code accessible, base distante interrogeable).

**Verdict : PRÊT — rien ne bloque.**

Aucune faille exploitable aujourd'hui. Le schéma distant a été interrogé, pas
déduit des fichiers de migration ; les tables ont été attaquées depuis
l'extérieur avec la clé anonyme réellement publiée dans le bundle. Ce qui
reste est du durcissement et deux angles morts honnêtement non vérifiés.

| | Nombre | Depuis |
|---|---|---|
| 🔴 Bloquant | 0 | — |
| 🟠 Important | 1 | **corrigé le jour même**, migration `20260818010000` |
| 🟡 À faire | 5 | 2 corrigés, 3 restants et argumentés |
| ⚪️ Non vérifié | 3 | tableau de bord Supabase, à ta main |
| Non applicable | 3 | — |

---

## 🟠 À corriger dans la semaine — **CORRIGÉ**

### 1. Le schéma `storage` porte encore le défaut ouvert de la plateforme — contrôle 4/16

**Où :** `pg_default_acl`, schéma `storage`, propriétaire `postgres`.

```
proprietaire | schema  | type | acl
postgres     | storage | r    | {…,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,…}
```

**Le problème.** C'est exactement le piège qui a produit F1 dans le schéma
`public` : Supabase pose des privilèges par défaut qui donnent tous les droits
à `anon` et `authenticated` sur **toute table future**. La migration
`20260817002000` a nettoyé `public`. Elle n'a pas touché `storage`, où le même
défaut subsiste.

Aujourd'hui il n'y a aucun bucket — vérifié, `storage.buckets` est vide et
l'API renvoie `[]`. Le risque est donc entièrement dans l'avenir, et l'avenir
est déjà écrit : `clients.photo_url` existe, la photo du client est au cahier
des charges. Le jour où un bucket arrive, une table de `storage` créée par
`postgres` naîtra ouverte à tous, en silence.

**La correction, appliquée.** Migration `20260818010000_socle_storage_et_bornes.sql`,
poussée sur `kolek-prod` le 2026-08-18. Couper l'héritage avant qu'il y ait
quelque chose à hériter coûte trois lignes ; le découvrir après coûte un audit.

```sql
alter default privileges in schema storage revoke all on tables    from anon, authenticated;
alter default privileges in schema storage revoke all on sequences from anon, authenticated;
alter default privileges in schema storage revoke all on functions from anon, authenticated;
```

Constaté après coup sur le distant : plus une seule entrée de `pg_default_acl`
mentionnant `anon` ou `authenticated` dans `storage`. Contrairement à `public`,
il n'en restait aucune appartenant à `supabase_admin` — le nettoyage est total.

La migration ne crée aucun bucket et n'accorde rien. Le jour venu, les droits
s'y poseront en liste blanche, sur le modèle de la migration 7 : bucket privé,
écriture restreinte au propriétaire du client, taille bornée, type réel vérifié
sur les octets — jamais sur le `Content-Type` annoncé par le client. Un
quatrième garde-fou refuse d'ores et déjà tout bucket qui apparaîtrait sans
politique déclarée.

---

## 🟡 Durcissement

1. **Le jeton de session vit dans `localStorage`** (contrôle 9). C'est le
   comportement par défaut de `supabase-js`, non modifié. Une XSS volerait la
   session. Le risque est réellement bas ici : `script-src 'self'` sans inline
   ni joker, React échappe, aucun `dangerouslySetInnerHTML`, aucun script
   tiers, aucun rendu de HTML fourni par un utilisateur — vérifié par grep sur
   `apps/` et `packages/`. À revoir si un jour du contenu riche est affiché.

2. **`search_path = public` sur les huit fonctions `SECURITY DEFINER`** plutôt
   que `search_path = ''` avec des noms pleinement qualifiés. **Laissé tel quel,
   délibérément.** L'attaque que le `''` prévient suppose de pouvoir déposer un
   objet dans un schéma consulté avant le bon. Vérifié sur le distant : ni
   `anon` ni `authenticated` n'a le droit `CREATE` sur `public`, `storage`,
   `extensions` ou `auth` — et `pg_catalog` est consulté d'office, donc
   inmasquable. Passer à `''` obligerait à qualifier `gen_random_uuid()` et
   `uuid_generate_v4()`, qui vivent dans `extensions` : réécrire huit fonctions
   qui marchent pour un gain nul. L'hypothèse n'est plus supposée, elle est
   contrôlée — le garde-fou 3 de la migration `20260818010000` échoue si un rôle
   client obtient un jour le droit de créer.

3. **`caisses_jour.cash_declare` n'a aucune contrainte de signe** — **corrigé**,
   `check (cash_declare >= 0)`. Le collecteur écrit cette colonne et `ecart`
   s'en déduit ; un négatif fabriquait un écart de rapprochement à partir de
   rien. Ça ne détourne pas d'argent — le cash physique tranche — mais une
   caisse ne se déclare pas en négatif. Un test le vérifie désormais, à
   l'insertion comme à la correction.

4. **Aucune borne haute sur `mises.montant`** — **corrigé**,
   `check (montant between 500 and 10000)`. Redondant aujourd'hui : le trigger
   `mises_avant_insert` refuse déjà tout montant différent de `cartes.mise`,
   elle-même bornée. La borne est là pour le jour où le trigger sera allégé.
   Si les paliers de mise changent, elle bouge avec `cartes_mise_check`.

5. **Les privilèges par défaut de `supabase_admin` sur `public` subsistent** et
   ne peuvent pas être révoqués depuis une migration — c'est un rôle de la
   plateforme. Sans effet tant que les tables sont créées par `postgres`, ce qui
   est le cas de toutes les migrations. Le garde-fou 2 de la migration 7
   attraperait une table qui naîtrait autrement.

---

## ⚪️ Non vérifié

1. **La longueur minimale du mot de passe côté distant.** `supabase/config.toml`
   porte `minimum_password_length = 10`, mais ce fichier gouverne le conteneur
   local, pas le projet en ligne. Pour trancher : tableau de bord Supabase →
   Authentication → Policies. Un `supabase config push` appliquerait le bloc
   `[auth]` entier, y compris `site_url`, qui pointe encore sur le local — donc
   à ne pas lancer tel quel.

2. **Les limites de débit sur la connexion** (contrôle 11). Supabase en applique
   par défaut ; leur valeur n'a pas été lue. L'inscription est fermée et le
   serveur le confirme (`422 signup_disabled`), donc la seule surface est
   `/token`. À constater dans Authentication → Rate limits.

3. **Le test des deux comptes en production** (contrôle 7). La suite locale le
   couvre — 53 tests, dont six tentatives d'intrusion croisée — mais aucun compte
   n'existe encore sur `kolek-prod`. À rejouer avec deux vrais collecteurs, plus
   le portillon admin face à un compte collecteur.

---

## Non applicable

- **Contrôle 16, uploads** : aucun bucket, aucune route d'upload. Voir le 🟠, qui
  prépare le jour où il y en aura un.
- **Contrôle 12, anti-bot** : aucun formulaire public. L'inscription est fermée,
  le formulaire de paiement du site vitrine est délibérément inerte.
- **Contrôle 13, SQL concaténé** : aucun SQL écrit à la main côté application.
  Les fonctions Postgres n'utilisent pas de `execute` dynamique.

---

## Les 20 contrôles

| # | Contrôle | Statut | Preuve |
|---|---|---|---|
| 1 | Clés API cachées | conforme | aucun motif de clé dans le code ; seules `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont exposées |
| 2 | Secrets purgés de Git | conforme | l'historique complet ne contient que `apps/*/.env.example` ; `.env` et `.env.*` ignorés ; aucun secret trouvé par `git log -S` |
| 3 | Bonne clé côté client | conforme | deux `createClient` applicatifs, tous deux sur la clé anonyme ; la clé de service n'apparaît que dans `supabase/tests/harnais.ts` ; `verifier-bundles` et `verifier-en-ligne` échouent si elle atteint un artefact |
| 4 | Row Level Security | conforme | RLS active sur les neuf tables, aucune sans policy hors `audit_log` et `admins` qui sont volontairement fermées à tous ; aucune condition `true` |
| 5 | Chiffrement des données sensibles | conforme au besoin | téléphones et noms en clair — inévitable pour un carnet de collecte ; aucune donnée bancaire stockée, conformément au cahier §11 |
| 6 | Autorisation côté serveur | conforme | le portillon admin appelle `est_admin()`, fonction serveur ; aucune décision d'accès ne repose sur le navigateur ; l'identité vient toujours de `auth.uid()` |
| 7 | Verrouillage par enregistrement | conforme | chaque policy filtre sur `collecteur_id = auth.uid()` ; une mise posée sur la carte d'autrui se fait réécrire son `collecteur_id` par le trigger puis rejeter par le `with check` |
| 8 | Champs non modifiables | conforme | privilèges de colonne en liste blanche ; `statut`, `mises_encaissees`, `cash_attendu`, `ecart`, `est_commission` ne sont écrivables par personne d'autre que le serveur |
| 9 | Cookies de session | 🟡 | jeton en `localStorage`, défaut de `supabase-js`, mitigé par la CSP |
| 10 | Mots de passe hachés | conforme | délégué à Supabase Auth ; aucune colonne de mot de passe dans `public` |
| 11 | Rate limiting | ⚪️ | valeurs par défaut non lues |
| 12 | Anti-bot | non applicable | aucun formulaire public |
| 13 | Requêtes paramétrées | non applicable | aucun SQL concaténé |
| 14 | Validation des entrées | conforme | validation en base : contraintes `CHECK`, triggers, et `montant <> cartes.mise` refusé — la validation ne dépend pas du formulaire ; deux bornes ajoutées le 2026-08-18 |
| 15 | Échappement du contenu | conforme | aucun `dangerouslySetInnerHTML`, `innerHTML` ni `v-html` |
| 16 | Uploads restreints | non applicable | aucun bucket — voir le 🟠 |
| 17 | Réponses API épurées | conforme | aucun `select('*')` ; les colonnes sont nommées |
| 18 | Headers de sécurité | conforme | constaté sur les trois URL en production par `npm run verifier:en-ligne` |
| 19 | HTTPS forcé | conforme | `http://` renvoie 301 vers `https://` sur les trois sites ; HSTS un an, sous-domaines et `preload` |
| 20 | Dépendances scannées | conforme | `npm audit --omit=dev` : 0 vulnérabilité |

---

## Ce qui a été fait pour le prouver

Trois angles, parce qu'aucun ne suffit seul — et c'est le troisième qui avait
trouvé F1 la veille :

1. **Lecture du code.** Scan automatique des contrôles 1, 2, 3, 6, 8, 13, 15, 17,
   puis relecture des fichiers signalés. Le scan a produit deux faux positifs,
   écartés après ouverture : la mention de `est_admin` dans `Portillon.tsx`, qui
   est précisément la vérification serveur qu'on cherche, et `createClient` dans
   le harnais de test, dont la clé de service est à sa place.

2. **Catalogues de la base distante.** `pg_policies`, `pg_tables`,
   `information_schema.table_privileges` et `column_privileges`, `pg_proc`,
   `pg_default_acl`, `pg_constraint`, `storage.buckets`. Une requête a produit un
   faux positif à son tour : les policies d'`INSERT` ont un `qual` nul, ce qui les
   faisait passer pour permissives — leur `with_check` est correct.

3. **Attaque depuis l'extérieur.** Avec la clé anonyme telle qu'elle est publiée
   dans le bundle, sans session : lecture des neuf tables, écriture sur trois,
   inscription, API GraphQL, liste des buckets.

```
collecteurs      401  {"code":"42501" …}     insert clients      401  {"code":"42501" …}
clients          401  {"code":"42501" …}     insert mises        401  {"code":"42501" …}
cartes           401  {"code":"42501" …}     insert collecteurs  401  {"code":"42501" …}
mises            401  {"code":"42501" …}
retraits         401  {"code":"42501" …}     signup  422  {"error_code":"signup_disabled"}
caisses_jour     401  {"code":"42501" …}     graphql 200  {"pg_graphql extension is not enabled."}
synchro_rejets   401  {"code":"42501" …}     buckets 200  []
audit_log        401  {"code":"42501" …}
```

Pas un tableau vide : un refus de privilège. La table n'est pas seulement
protégée par RLS, elle est hors de portée du rôle anonyme.

---

## Ce qui a été corrigé le jour même

Migration `20260818010000_socle_storage_et_bornes.sql`, appliquée sur
`kolek-prod` et vérifiée après coup en interrogeant les catalogues :

- l'héritage des privilèges par défaut du schéma `storage` est coupé — plus une
  seule entrée de `pg_default_acl` n'y mentionne `anon` ni `authenticated` ;
- `caisses_jour.cash_declare` et `mises.montant` sont bornés ;
- quatre garde-fous, qui font échouer la migration plutôt que de laisser
  passer : l'héritage de `storage`, l'apparition d'un bucket sans politique
  déclarée, l'octroi d'un droit `CREATE` à un rôle client, et la présence des
  deux bornes.

Et un test dans `supabase/tests/isolation.test.ts`, parce que la leçon de F1
tient en une phrase : **aucun test ne posait la question.** Celui-ci refuse une
caisse déclarée en négatif, à l'insertion comme à la correction.

Ce qui reste ouvert est à ton tableau de bord Supabase — les trois ⚪️ plus haut.

---

## Audit de contrôle, même jour — un constat de plus

Le second passage a sondé trois choses que le premier n'avait pas faites, et
c'est là que se trouve l'intérêt d'un audit de contrôle : refaire les mêmes
requêtes n'apprend rien.

```
OpenAPI /rest/v1/            401   schéma non énumérable
rpc est_admin sans session   401   permission denied for function
source maps                  aucune, ni construite ni servie
```

La première mérite qu'on s'y arrête. Sur la plupart des projets Supabase,
`/rest/v1/` rend la liste complète des tables et de leurs colonnes à qui détient
la clé anonyme — une carte du schéma, offerte. Ici, refus. Ce n'est pas un
réglage : c'est la conséquence directe du `revoke` de la migration 7.

### 🟡 L'application du collecteur était indexable — corrigé

```
collecteur  x-robots-tag : absent
admin       x-robots-tag : noindex, nofollow
site        x-robots-tag : absent   (voulu)
```

Et `/robots.txt` répondait `200` en `text/html` sur les trois : la réécriture
`/*` vers `/index.html` l'avalait. Aucun des trois sites n'avait donc de vrai
`robots.txt` — un moteur recevait une page là où il attend des règles, et en
concluait qu'il n'y en avait aucune.

Pas une faille : la page d'accueil du collecteur est un écran de connexion. Mais
une incohérence que ce dépôt avait lui-même signalée, au point 7 de la
vérification de déploiement, et laissée en suspens.

Corrigé le 2026-08-18. `X-Robots-Tag: noindex, nofollow` sur le collecteur, et
un `robots.txt` réel dans le `public/` des trois — `Disallow: /` pour les deux
outils internes, `Allow: /` pour la surface commerciale. Les deux mécanismes ne
disent pas la même chose : l'en-tête dit « n'indexe pas ce que tu as lu », le
fichier dit « ne le lis pas ». `verifier:en-ligne` contrôle désormais les deux,
et dans les deux sens — il échoue aussi si le site public se retrouvait marqué
`noindex`.
