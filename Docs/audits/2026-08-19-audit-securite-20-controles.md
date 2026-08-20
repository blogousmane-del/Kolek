# Audit de sécurité — Kolek

**Date :** 2026-08-19 · **Périmètre :** dépôt `blogousmane-del/Kolek`, projet
Supabase `kolek-prod` (`yfnwmokxkznejotgpfgf`, eu-west-3), trois sites Netlify
en production · **Méthode :** grille des 20 contrôles, mode complet · **Suite
de :** [audit du 2026-08-18](2026-08-18-audit-securite-20-controles.md).

**Verdict : PRÊT — rien ne bloque.**

Le socle tient : les neuf tables restent hors de portée de la clé anonyme
publiée, vérifié en direct et non déduit des migrations. Ce que cet audit
ajoute tient en une phrase : les trois campagnes précédentes ont fermé **qui**
écrit, **quelles colonnes** et **combien** sur les montants. Personne n'avait
regardé **la taille** de ce qui entre.

| | Nombre | Depuis |
|---|---|---|
| 🔴 Bloquant | 0 | — |
| 🟠 Important | 1 | **corrigé le jour même**, migration `20260819010000` |
| 🟡 À faire | 2 | 1 corrigé, 1 reconduit et argumenté |
| ⚪️ Non vérifié | 2 | reconduits du 2026-08-18, réglages du tableau de bord |
| Non applicable | 3 | inchangés |

---

## 🟠 À corriger dans la semaine — **CORRIGÉ**

### 1. Aucune borne de longueur sur les dix colonnes texte que le client écrit — contrôle 14

**Où :** `public.clients` (`nom`, `telephone`, `photo_url`, `marche`,
`activite`), `public.collecteurs` (`nom`, `telephone`, `zone`),
`public.synchro_rejets` (`motif`, `charge_utile`).

**La preuve.** La liste blanche de la migration `20260817002000` énumère
exactement ces colonnes en `INSERT`/`UPDATE` pour `authenticated`. Aucune
contrainte de longueur n'existait sur le schéma : `pg_constraint` ne portait
que les cinq `check` d'énumération et les quatre bornes numériques. Le
« test du client déloyal » de la grille — appeler l'API hors de l'interface
avec une chaîne de dix mille caractères — n'avait jamais été joué. Il passait.

**Le problème.** Pas un vol de donnée : une facture et une base qu'on ne peut
plus purger. Un collecteur authentifié — donc un client payant muni d'un simple
`curl`, pas un inconnu — pouvait écrire une charge utile de plusieurs mégaoctets
dans `synchro_rejets.charge_utile`, ou dans le nom d'une fiche client, autant de
fois qu'il le voulait.

L'amplification est ce qui rend la chose sérieuse ici plutôt qu'ailleurs :
`journaliser()` recopie **la ligne entière** en jsonb dans `audit_log.donnees` à
chaque insertion sur `clients`, `cartes` et `mises`. Dix mégaoctets écrits en
coûtent vingt. Et `audit_log` est append-only par construction — le déclencheur
`audit_log_immuable` refuse `update` et `delete`, y compris à la clé de service.
Ce qui entre ne sort plus.

**La correction, appliquée.** Migration
`20260819010000_socle_bornes_texte.sql`. Bornes hautes seulement, larges à
dessein : elles doivent arrêter l'abus, jamais un nom ivoirien long ou un
libellé de marché à rallonge. Pas de borne basse — un champ vide est un défaut
de saisie, pas une faille, et une borne basse refuserait des lignes déjà en base.

```sql
alter table public.clients
  add constraint clients_nom_borne       check (length(nom) <= 120),
  add constraint clients_telephone_borne check (length(telephone) <= 32),
  add constraint clients_marche_borne    check (length(marche) <= 80),
  add constraint clients_activite_borne  check (length(activite) <= 80);

alter table public.synchro_rejets
  add constraint rejets_motif_borne        check (length(motif) <= 200),
  add constraint rejets_charge_utile_borne check (length(charge_utile::text) <= 8192);
```

`collecteurs.telephone` est borné à 64 et non à 32 comme celui du client :
`creer_collecteur_apres_signup` retombe sur `new.id::text` — un UUID de 36
caractères — quand l'inscription ne fournit pas de numéro. Une borne à 32 aurait
fait échouer la migration sur la première ligne créée par ce repli. Une
contrainte qui refuse une ligne que le produit écrit lui-même n'est pas une
contrainte, c'est une panne.

**Le garde-fou, et c'est lui qui compte.** Même principe que la liste blanche de
la migration 7 : on n'énumère pas les colonnes connues, on interroge l'état
réel. Toute colonne `text`, `varchar` ou `jsonb` que la liste blanche rend
écrivable à `authenticated` doit porter une contrainte qui borne sa longueur. Une
colonne ajoutée en J2a sans borne fera échouer la reconstruction, au lieu
d'attendre le prochain audit.

**Constaté après application**, en interrogeant les catalogues du distant et non
le fichier de migration. Douze contraintes en place — les onze de cette
migration plus `mises_montant_borne`, héritée de la veille :

```
clients_nom_borne            CHECK ((length(nom) <= 120))
clients_telephone_borne      CHECK ((length(telephone) <= 32))
clients_marche_borne         CHECK ((length(marche) <= 80))
clients_activite_borne       CHECK ((length(activite) <= 80))
clients_photo_url_borne      CHECK ((length(photo_url) <= 512))
clients_photo_url_https      CHECK (photo_url IS NULL OR photo_url ~~ 'https://%')
collecteurs_nom_borne        CHECK ((length(nom) <= 120))
collecteurs_telephone_borne  CHECK ((length(telephone) <= 64))
collecteurs_zone_borne       CHECK ((length(zone) <= 80))
rejets_motif_borne           CHECK ((length(motif) <= 200))
rejets_charge_utile_borne    CHECK ((length((charge_utile)::text) <= 8192))
```

Et la posture de sécurité inchangée, contrôlée dans la foulée : aucune politique
`UPDATE` ou `DELETE` sur `mises`, `retraits`, `audit_log` — l'append-only tient —
et `anon` sans un seul privilège de table.

**Une note de méthode, parce qu'elle a failli coûter cher.** Cette migration et
ce document sont restés plusieurs heures non commités et non appliqués, pendant
que le document affirmait « corrigé ». C'est l'audit suivant qui l'a vu, en
comparant `supabase_migrations.schema_migrations` au contenu du dossier — la
dernière version enregistrée était celle de la veille. Un écrit qui se déclare
appliqué sans que la base le confirme est pire qu'un écrit absent : il éteint la
question. La règle qui en sort tient en une ligne — **l'état appliqué se lit
dans le catalogue, jamais dans le dossier `migrations/`.**

---

## 🟡 Durcissement

### 1. Le déclencheur des mises renseignait sur les cartes d'autrui — **corrigé**

**Où :** `public.mises_avant_insert()`, `SECURITY DEFINER`.

L'audit du 2026-08-18 notait, au contrôle 7 : « une mise posée sur la carte
d'autrui se fait réécrire son `collecteur_id` par le trigger puis rejeter par le
`with check` ». C'est exact, et l'insertion était bien refusée. Mais le refus
n'arrivait qu'**après avoir répondu**.

`mises_avant_insert` est `SECURITY DEFINER` : son `select * from cartes` voit
toutes les cartes du produit, RLS comprise. Entre-temps, les messages levés
renseignaient donc sur une carte que l'appelant ne peut pas lire :

| Message obtenu | Ce qu'il apprend sur la carte d'autrui |
|---|---|
| `CARTE_INTROUVABLE` ou non | elle existe |
| `CARTE_CLOTUREE` | son statut |
| `CYCLE_COMPLET` | son avancement |
| `MONTANT_INVALIDE` | sa mise exacte, en quelques essais |

Un identifiant de carte est un UUID v4 : deviner n'est pas réaliste, et c'est la
seule raison pour laquelle ceci n'est pas classé plus haut. Un UUID qui fuit par
ailleurs — capture d'écran, export, journal applicatif — le redeviendrait.

**Corrigé.** Le refus remonte avant les tests d'état et se confond avec
l'absence : une carte qui ne vous appartient pas est une carte qui n'existe pas.

```sql
if auth.uid() is not null and c.collecteur_id <> auth.uid() then
  raise exception 'CARTE_INTROUVABLE';
end if;
```

`auth.uid() is not null` garde la porte ouverte aux Edge Functions à clé de
service, qui n'ont pas d'appelant et écriront la synchronisation en J2.

Deux durcissements de la même migration relèvent du même geste et n'ont pas de
section à eux :

- **`clients.photo_url` n'acceptait aucun schéma d'URL en particulier.** Aucun
  écran ne l'affiche encore — c'est le bon moment, exactement comme pour
  l'héritage de `storage` coupé la veille. Le jour où la valeur atterrit dans un
  `href`, un `javascript:` ou un `data:text/html` y serait déjà stocké, écrit par
  un collecteur, et le rendu le déclencherait chez l'administrateur qui consulte
  la fiche. Désormais : `photo_url is null or photo_url like 'https://%'`, plus
  une borne à 512 caractères.
- **`caisses_jour.date` n'avait aucune borne** — rien n'empêchait d'ouvrir une
  ligne de caisse par jour jusqu'en l'an 9999. La fenêtre reprend celle de
  `mises.encaisse_le` (un jour en avant, quatre-vingt-dix en arrière) et vit dans
  le déclencheur existant, `now()` étant interdit dans un `check`. Sur `INSERT`
  seulement : corriger le cash déclaré d'une journée ancienne reste légitime.

### 2. Le jeton de session vit dans `localStorage` — reconduit, inchangé

Contrôle 9, déjà argumenté le 2026-08-18 et revérifié aujourd'hui : comportement
par défaut de `supabase-js`, non modifié. Le risque reste bas — `script-src
'self'` sans inline ni joker, aucun script tiers, aucun `dangerouslySetInnerHTML`,
`innerHTML` ni `v-html` dans `apps/` ni `packages/`. À revoir le jour où du
contenu riche est affiché.

Le point 2 du 2026-08-18 — `search_path = public` sur les fonctions
`SECURITY DEFINER` — reste délibérément tel quel, pour les raisons qui y sont
écrites. Les deux fonctions réécrites aujourd'hui conservent ce réglage plutôt
que d'introduire une troisième convention dans le même schéma.

---

## ⚪️ Non vérifié

1. **La longueur minimale du mot de passe côté distant.** Reconduit du
   2026-08-18. `supabase/config.toml` porte `minimum_password_length = 10`, mais
   ce fichier gouverne le conteneur local. Tableau de bord → Authentication →
   Policies. Ne pas lancer `supabase config push` tel quel : il appliquerait le
   bloc `[auth]` entier, `site_url` compris, qui pointe encore sur le local.

2. **Les limites de débit sur la connexion** (contrôle 11). Reconduit. Ce qui a
   pu être lu sans le tableau de bord l'a été : `/auth/v1/settings` confirme
   aujourd'hui encore `disable_signup: true`, `anonymous_users: false`,
   `mailer_autoconfirm: false` et aucun fournisseur externe. La seule surface
   ouverte reste `/token`, dont les valeurs de débit ne sont pas lisibles depuis
   l'extérieur.

Le troisième ⚪️ de la première rédaction — « la suite de tests de la base n'a pas
pu être rejouée » — **est levé.** Voir la section « Ce qui restait en suspens »
en fin de document : les 63 tests sont verts, migration comprise.

---

## Non applicable

Inchangés depuis le 2026-08-18 : contrôle 16 (aucun bucket — `storage.buckets`
répond toujours `[]`), contrôle 12 (aucun formulaire public, inscription fermée),
contrôle 13 (aucun SQL concaténé, aucun `execute` dynamique).

---

## Les 20 contrôles

| # | Contrôle | Statut | Preuve |
|---|---|---|---|
| 1 | Clés API cachées | conforme | scan sans motif de clé ; seules `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` exposées |
| 2 | Secrets purgés de Git | conforme | `git log --all --name-only` : seuls `apps/*/.env.example` ; `.env` et `.env.*` ignorés ; `git ls-files` ne suit aucun `.env` |
| 3 | Bonne clé côté client | conforme | deux `createClient` applicatifs sur la clé anonyme ; la clé de service n'apparaît que dans `supabase/tests/harnais.ts` ; `verifier:bundles` vert sur les trois `dist` |
| 4 | Row Level Security | conforme | attaque en direct : les neuf tables répondent `401 / 42501` à la clé anonyme publiée |
| 5 | Chiffrement des données sensibles | conforme au besoin | téléphones et noms en clair, inévitable pour un carnet de collecte ; aucune donnée bancaire stockée |
| 6 | Autorisation côté serveur | conforme | portillon admin sur `est_admin()` ; `rpc est_admin` sans session : `401 permission denied for function` |
| 7 | Verrouillage par enregistrement | conforme, **durci** | policies sur `collecteur_id = auth.uid()` ; le déclencheur ne renseigne plus sur les cartes d'autrui |
| 8 | Champs non modifiables | conforme | liste blanche de colonnes, garde-fous des migrations 7 et 8 |
| 9 | Cookies de session | 🟡 | jeton en `localStorage`, mitigé par la CSP |
| 10 | Mots de passe hachés | conforme | délégué à Supabase Auth ; aucune colonne de mot de passe dans `public` |
| 11 | Rate limiting | ⚪️ | valeurs par défaut non lues ; inscription fermée, confirmée par `/auth/v1/settings` |
| 12 | Anti-bot | non applicable | aucun formulaire public |
| 13 | Requêtes paramétrées | non applicable | aucun SQL concaténé |
| 14 | Validation des entrées | 🟠 **corrigé** | dix colonnes texte sans borne de longueur ; bornées et garde-fou posé, migration `20260819010000` |
| 15 | Échappement du contenu | conforme | aucun `dangerouslySetInnerHTML`, `innerHTML` ni `v-html` ; `photo_url` bornée au schéma `https` par anticipation |
| 16 | Uploads restreints | non applicable | `storage.buckets` vide ; héritage coupé et garde-fou posé le 2026-08-18 |
| 17 | Réponses API épurées | conforme | aucun `select('*')` applicatif ; le seul est dans `isolation.test.ts`, où c'est le test |
| 18 | Headers de sécurité | conforme | `npm run verifier:en-ligne` : trois cibles conformes |
| 19 | HTTPS forcé | conforme | contrôlé par le même script ; HSTS un an, sous-domaines |
| 20 | Dépendances scannées | conforme | `npm audit` : 0 vulnérabilité, dépendances de développement comprises |

---

## Ce qui a été fait pour le prouver

1. **Scan et relecture.** Le script des 15 contrôles automatisables, puis
   ouverture de chaque fichier signalé. Deux faux positifs, écartés — les mêmes
   que la veille : `createClient` dans le harnais de test, où la clé de service
   est à sa place, et le `select('*')` d'`isolation.test.ts`, qui est
   précisément l'attaque que ce test rejoue.

2. **Attaque depuis l'extérieur, avec la clé du bundle.** Neuf tables, la liste
   des buckets, le schéma OpenAPI, la fonction `est_admin` et les réglages
   d'authentification.

```
collecteurs 401 42501    mises          401 42501    admins    401 42501
clients     401 42501    retraits       401 42501    buckets   200 []
cartes      401 42501    caisses_jour   401 42501    est_admin 401 permission denied
audit_log   401 42501    synchro_rejets 401 42501    settings  disable_signup: true
```

3. **Lecture du schéma des huit migrations, colonne par colonne, contre la liste
   blanche des privilèges.** C'est ce croisement — et lui seul — qui a produit le
   🟠 : la liste blanche dit exactement quelles colonnes le client écrit, et il
   suffisait de demander laquelle de ces dix colonnes texte portait une borne.
   Aucune.

4. **Chaîne de construction complète.** `npm test` (50 tests),
   `npm run test:scripts` (22), `npm run test:db` (63), `verifier:theme`,
   `npm run build` sur les trois applications, `verifier:bundles`,
   `verifier:en-ligne`. Tout vert.

---

## Ce qui a été écrit aujourd'hui

- `supabase/migrations/20260819010000_socle_bornes_texte.sql` — dix bornes de
  longueur, la borne de schéma sur `photo_url`, la fenêtre de date sur
  `caisses_jour`, le refus muet sur la carte d'autrui, et le garde-fou qui
  interroge l'état réel plutôt qu'une liste d'interdits.
- `supabase/tests/bornes.test.ts` — neuf tests, un par borne posée, plus ceux
  qui vérifie qu'un rejet de synchronisation de taille normale passe toujours et
  que la correction d'une caisse ouverte reste possible. La leçon de F1 n'a pas
  changé : **aucun test ne posait la question.**

---

## Ce qui restait en suspens, et qui est clos

Rédigé le 2026-08-20, après coup. La première version de ce document classait la
suite de tests en ⚪️ : Docker Desktop refusait de démarrer sur le poste, et la
migration n'avait été validée que par l'analyseur PostgreSQL 17 (`libpg-query`),
ce qui prouve la syntaxe et rien d'autre.

**La panne locale, puisqu'elle se reproduira.** `supabase start` attend la sonde
de santé de *tous* les services. Cinq ne l'atteignent jamais ici —
`analytics`, `realtime`, `storage`, `pg_meta`, `studio` — parce que `vector`
n'arrive pas à lire le socket Docker après un redémarrage du moteur WSL :

```
vector::sources::docker_logs: Listing currently running containers failed.
error=ConnectError("tcp connect error", ConnectionRefused)
```

Le CLI démonte alors la pile entière, `kong`, `auth` et `rest` compris, alors
qu'ils étaient sains — d'où des services qui répondent `200` puis disparaissent
au milieu d'une exécution de tests. Le symptôme trompe : il ressemble à une
migration qui échoue. Il n'y en avait aucune. La parade, sans toucher à
`config.toml` — aucun de ces cinq services n'est utilisé par la suite de tests :

```bash
npx supabase start -x logflare,vector,realtime,storage-api,postgres-meta,studio,imgproxy,edge-runtime,supavisor
```

**Ce que l'exécution a donné.** `db reset` applique les neuf migrations,
`20260819010000` comprise ; ses trois garde-fous passent, ce qui se déduit du
succès lui-même — un `raise exception` dans un bloc `do $$` aurait arrêté le
reset. Puis 63 tests sur 63, dont les neuf de `bornes.test.ts`.

**Un test a dû être corrigé, et c'est le plus instructif du lot.**
`isolation.test.ts` n°4 attendait `42501` sur une mise posée sur la carte
d'autrui — la violation du `with check` de `mises_insert`. Il reçoit désormais
`P0001 CARTE_INTROUVABLE`. L'insertion était refusée avant, elle l'est toujours :
ce qui a changé, c'est que le refus arrive plus tôt, au déclencheur, avant que
les messages d'état ne décrivent une carte que l'appelant ne peut pas lire.
C'est exactement le durcissement décrit plus haut, et le test asserte maintenant
le contrat fort, en vérifiant explicitement que `MONTANT_INVALIDE` ne fuit plus.

**Sur `kolek-prod`.** La migration y est appliquée, confirmé au catalogue. Un
premier compte d'administration existe désormais — créé au tableau de bord, puis
inscrit dans `public.admins`, `est_admin()` rendant `true`. Contrôlé dans la
foulée : cela n'ouvre rien au rôle anonyme. Les neuf tables répondent toujours
`401 / 42501` à la clé publiée, `rpc est_admin` aussi, et `storage.buckets` reste
vide.

**Ce qui reste ⚪️** est inchangé : les deux réglages du tableau de bord Supabase,
plus le test du non-admin — créer un second compte, ne pas l'inscrire dans
`admins`, et vérifier qu'il reste dehors. Un administrateur qui entre ne prouve
rien tant qu'un non-administrateur n'est pas resté à la porte.
