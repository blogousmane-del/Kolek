# La santé du système dans Kolek · Super Admin — conception

**Date :** 2026-09-11.
**Statut :** approuvée par l'exploitant le 2026-09-11, section par section —
périmètre, contenu du relevé, approche, données et purge, voyants, écran,
mise en production.
**Place dans la suite :** chantier **B** sur quatre — A nettoyage du menu admin
(en production depuis le 2026-09-11), B santé du système, C tableau de bord
façon maquette, D refonte visuelle du Super Admin.

---

## Le problème

L'onglet **Plateforme** du Super Admin compte des lignes à l'instant : volumes
par table, tables journalisées, version de Postgres. Il ne dit ni si ce qui
doit tourner tourne, ni comment la base évolue. Il n'a pas de passé : aucune
table ne garde d'état d'un jour sur l'autre, et le Design System interdit
d'afficher un chiffre qu'on ne sait pas (§2, principe 7).

Mesuré en production le 2026-09-11, en lecture seule et en agrégats :

| Mesure | Valeur |
|---|---|
| Taille de la base | 19 Mo |
| Connexions | 18 sur 60 |
| Taux de cache | 99,99 % |
| Travaux planifiés | 1 — `kolek-avis-drainage`, chaque minute |
| Exécutions sur 24 h | 1 440, aucun échec |
| `cron.job_run_details` | **27 497 lignes, 4,6 Mo, depuis le 2026-08-23, jamais purgé** |
| Plus grosse table métier | `audit_log`, 1,5 Mo |
| Première mise | 2026-08-20 |
| Avis en attente, abandonnés ; rejets non traités | 0, 0 ; 0 |

Le journal du planificateur pèse déjà plus que toutes les tables métier
réunies, et prend 1 440 lignes par jour — environ 90 Mo par an. Aucun écran ne
le montre. C'est exactement ce qu'un écran de santé doit rendre visible.

## Les décisions

| Question | Décision |
|---|---|
| Périmètre | La base **et** les tâches automatiques : drainage des avis, file d'avis, rejets de synchro. Chariow et la passerelle SMS restent à l'écran Paiement. |
| Contenu du relevé | L'état du système **et** les stocks métier globaux (encours, clients, cartes actives), pour que le chantier C dispose de semaines d'historique le jour où il se construit. Les flux (mises, commissions) sont déjà datés et n'en ont pas besoin. |
| Approche | **Tout en base, lu par `super-admin-etat`.** Écartées : une route dédiée `super-admin-sante` (une Edge Function de plus pour quelques millisecondes) et un relevé écrit par une Edge Function réveillée par pg_cron (Vault, clé de service et réseau pour un calcul qui ne quitte pas la base). |
| Journal pg_cron | Purgé chaque nuit au-delà de **30 jours**. |
| Passé | **Aucune reconstitution.** La taille de la base d'hier n'est écrite nulle part ; la courbe commence au premier relevé et le dit. |
| Plafond du forfait Supabase | Inconnu : aucun voyant sur la taille, aucun pourcentage d'un plafond qu'on ne connaît pas. |

---

## 1. Les données

### La table

```sql
create table public.releves_quotidiens (
  jour             date primary key,           -- date UTC, qui est celle d'Abidjan
  releve_le        timestamptz not null default now(),
  taille_base      bigint not null,            -- octets, pg_database_size
  taille_journal_cron bigint not null,         -- octets, cron.job_run_details
  volumes          jsonb not null,             -- admin_reglages() -> 'volumes'
  encours_clients  bigint not null             -- admin_vue_globale() -> 'totaux' -> 'encours_clients'
);
```

RLS activée, **aucune politique** : aucun navigateur ne la lit ; seules les
fonctions `security definer` et la clé de service y accèdent.

`volumes` et `encours_clients` ne sont pas recalculés : ils sont repris des
fonctions qui les servent déjà aux écrans. Deux calculs du même chiffre
finiraient par donner deux vérités. Clients, cartes actives, collecteurs,
mises, retraits et lignes de journal sont dans `volumes`.

### Les fonctions

- **`releve_du_jour()`** — `security definer`, propriétaire `postgres`,
  exécution révoquée à `public`, `anon`, `authenticated`. Écrit la ligne du
  jour par `insert … on conflict (jour) do update` : la relancer le même jour
  remplace, jamais de doublon. Rend le jour écrit.
- **`purger_journal_cron(p_jours integer default 30)`** — mêmes droits. Supprime
  de `cron.job_run_details` les lignes dont `end_time` a plus de `p_jours`
  jours. Rend le nombre de lignes supprimées. Refuse `p_jours < 1`.

Vérifié en production le 2026-09-11 : le rôle `postgres` a `SELECT` et `DELETE`
sur `cron.job_run_details`. Aucune ligne n'y a plus de 30 jours : la première
purge effective tombera autour du 2026-09-22.

### L'horloge

Deux travaux pg_cron, désinscrits puis réinscrits comme `kolek-avis-drainage`
pour qu'un `db reset` n'en crée pas de doublon :

| Travail | Planning | Commande |
|---|---|---|
| `kolek-releve-quotidien` | `55 23 * * *` — 23 h 55 UTC, fin de journée à Abidjan | `select public.releve_du_jour();` |
| `kolek-purge-journal-cron` | `10 0 * * *` — 0 h 10 UTC | `select public.purger_journal_cron(30);` |

La migration écrit elle-même un **premier relevé** : la courbe a un point dès
le déploiement.

### Les garde-fous de la migration

Comme `20260823170000_avis_drainage_planifie.sql`, la migration lève une
exception si l'une des trois fonctions est exécutable par `anon` ou
`authenticated`, ou si l'un des deux travaux n'est pas planifié.

## 2. La lecture

### `sante_systeme()`

`security definer`, réservée à la clé de service. Rend un `jsonb` :

```json
{
  "mesure_le": "…",
  "base": { "taille": 0, "connexions": 0, "max_connexions": 0, "cache_pct": 0 },
  "drainage": {
    "derniere_execution": "… | null",
    "dernier_succes": "… | null",
    "executions_24h": 0,
    "echecs_24h": 0
  },
  "releve": { "dernier_jour": "… | null" },
  "journal_cron": { "lignes": 0, "taille": 0 },
  "files": {
    "avis_en_attente": 0,
    "avis_plus_ancien": "… | null",
    "avis_abandonnes": 0,
    "rejets_non_traites": 0
  },
  "releves": [ { "jour": "…", "taille_base": 0, "volumes": {}, "encours_clients": 0 } ]
}
```

- **Connexions** : `pg_stat_activity` où `backend_type = 'client backend'`,
  rapportées à `max_connections`.
- **Cache** : `blks_hit / (blks_hit + blks_read)` de `pg_stat_database` pour la
  base courante ; nul si aucun bloc n'a encore été lu.
- **Drainage** : `cron.job_run_details` du travail `kolek-avis-drainage`. Un
  échec est `status = 'failed'` ; une exécution en cours n'en est pas un.
- **Avis** : en attente = `statut in ('a_envoyer', 'echoue') and tentatives < 3`,
  comme `avis_declencher_drainage()` ; abandonnés = `statut = 'echoue' and
  tentatives >= 3`.
- **Relevés** : les 90 derniers, du plus ancien au plus récent.

### `super-admin-etat`

Un troisième appel, `service.rpc('sante_systeme')`, en parallèle des deux
existants. **Son échec ne fait pas échouer la route** : la réponse porte
`sante: null` et la cause part au journal de la fonction. C'est le précédent
de `paiement` : une fonction déployée avant sa migration ne doit pas mettre en
panne tout le Super Admin.

`EtatSuperAdmin` (`apps/admin/src/superadmin.ts`) gagne
`sante?: SanteSysteme | null`.

### Les voyants

Une fonction pure, **`evaluerSante(mesures, maintenant)`**, dans
`packages/core`. Elle rend, pour chaque point, un niveau — `normal`,
`attention`, `alerte` — et sa raison en une phrase. Le niveau général est le
pire des cinq.

| Point | Normal | Attention | Alerte |
|---|---|---|---|
| Drainage des avis | un succès il y a moins de 5 min | au moins un échec sur 24 h, ou aucun succès depuis 5 min | aucune exécution depuis 10 min |
| Relevé quotidien | relevé d'aujourd'hui ou d'hier | — | plus ancien, ou aucun |
| Avis clients | aucun en attente depuis plus de 15 min | un avis en attente depuis plus de 15 min, ou au moins un abandonné | — |
| Rejets de synchro | aucun | — | un ou plus : de l'argent a changé de main |
| Connexions | moins de 80 % du maximum | 80 % ou plus | — |

La taille de la base et le taux de cache s'affichent **sans voyant** : aucun
seuil honnête sans le plafond du forfait.

## 3. L'écran

- **Menu** : l'entrée « Plateforme » devient **« Santé du système »**, icône
  `activity` (ajoutée à `Icone`, depuis `lucide-react`). La clé `plateforme`
  ne change pas.
- **En tête** : une phrase de synthèse — « Tout fonctionne », « 1 point demande
  attention », « 2 points en alerte » — et l'heure de la mesure. Puis cinq
  pastilles, chacune avec couleur, icône **et** texte : la couleur ne porte
  jamais seule l'information. Chaque pastille donne sa raison.
- **Quatre cartes** (`CarteStat`) : taille de la base, connexions (« 18 / 60 »),
  cache, journal du planificateur (taille et lignes). « vs mois dernier »
  seulement si un relevé d'au moins 30 jours existe — le plus récent d'entre
  eux sert de référence ; sinon la précision dit « premier relevé le … ».
  La comparaison s'écrit **dans la précision**, en texte neutre
  (« +3 Mo vs mois dernier ») et non dans le badge de tendance de `CarteStat` :
  ce badge colore une hausse en vert et une baisse en rouge, et une base qui
  grossit n'est ni une bonne ni une mauvaise nouvelle. `CarteStat` ne change
  donc pas. *(Corrigé au plan, le 2026-09-11 : la version approuvée lui
  ajoutait une propriété `comparaison`.)*
- **La courbe d'évolution** : un composant SVG, **`CourbeEvolution`**, dans
  `packages/ui`, sans bibliothèque. Une série à la fois, choisie parmi taille
  de la base, mises, clients, cartes actives, lignes de journal. Au survol ou
  au focus clavier, une bulle donne le jour et la valeur. Un tableau des
  valeurs est proposé pour les lecteurs d'écran. Sous deux relevés, pas de
  tracé : « La courbe se dessine à partir du deuxième relevé. » Sous la
  courbe : « Relevés depuis le … ».
- **L'encours** est relevé pour le chantier C mais **n'est pas affiché** ici :
  c'est un chiffre métier, pas un signe de santé.
- **Ce qui reste**, en bas : volumes exacts, tables journalisées, version de
  Postgres et dernière écriture au journal, avec l'alerte existante sur les
  rejets.
- **`sante` nul** : la section de santé dit « Santé indisponible : la base n'a
  pas rendu ses mesures », et le reste de l'onglet s'affiche.

## Fichiers

| Fichier | Changement |
|---|---|
| `supabase/migrations/20260911120000_sante_systeme.sql` | Neuf : table, trois fonctions, deux travaux, premier relevé, garde-fous. |
| `supabase/functions/super-admin-etat/index.ts` | Troisième appel, toléré absent. **Déployé automatiquement à la poussée.** |
| `packages/core/src/sante.ts` (+ épreuve) | `evaluerSante`, types `MesuresSante`, `Voyant`, `NiveauSante`. Exporté par l'index de `core`. |
| `packages/ui/src/CourbeEvolution.tsx` (+ épreuve) | Neuf. Exporté par l'index de `ui`. |
| `packages/ui/src/Icone.tsx` | `activity`. |
| `packages/ui/src/BarreLaterale.tsx` (+ épreuve) | Libellé et icône de l'entrée `plateforme`. |
| `apps/admin/src/superadmin.ts` | Type `SanteSysteme`, champ `sante`. |
| `apps/admin/src/ecrans/superadmin/Sante.tsx` | Neuf : synthèse, pastilles, cartes, courbe. |
| `apps/admin/src/ecrans/superadmin/Plateforme.tsx` | Compose `Sante` au-dessus de la carte des volumes. |
| `apps/admin/src/ecrans/superadmin/lisible.ts` | `tailleLisible` (octets en o, Ko, Mo, Go). |
| `apps/admin/src/ecrans/SuperAdmin.tsx` | Titre et fil d'Ariane de l'onglet. |
| `apps/admin/src/ecrans/SuperAdmin.test.tsx`, `apps/admin/src/Coquille.test.tsx` | Épreuves neuves ; le libellé « Plateforme » cliqué devient « Santé du système ». |
| `supabase/tests/sante-systeme.test.ts` | Neuf. |
| `supabase/tests/super-admin-etat.test.ts` | La route rend `sante`. |

## Ce qui ne change pas

- Les écrans de Kolek · Admin et l'application collecteur.
- Le drainage des avis : on le lit, on n'y touche pas.
- Aucune donnée métier n'est écrite, modifiée ou supprimée. La seule
  suppression est celle des traces d'exécution du planificateur de plus de
  30 jours.

## Mise en production — deux accords séparés

1. Branche `sante-systeme`, épreuves vues rouges puis vertes, chaîne complète
   verte, en local.
2. Fusion dans `main`, en local.
3. **`supabase db push`** vers la production — accord explicite. Le
   2026-09-11, les 49 migrations locales et distantes sont alignées : seule
   celle-ci part. Juste avant, `supabase migration list --linked` le
   revérifie.
4. **Poussée de `main`** — accord explicite. Netlify redéploie les trois
   fronts ; le CI redéploie `super-admin-etat`.
5. Vérifications : relevé du jour présent en production (compte agrégé), deux
   travaux planifiés, route qui rend `sante`, empreintes servies égales aux
   builds locaux.

La migration passe **avant** la poussée. Dans l'ordre inverse, l'écran dirait
« santé indisponible » jusqu'à la migration, sans rien casser d'autre.

## Risques, et comment on les tient

- **La purge est irréversible.** Elle ne touche que des traces d'exécution, et
  rien n'a plus de 30 jours avant le 2026-09-22.
- **Retour arrière.** Une migration inverse est écrite dans le plan — elle
  désinscrit les deux travaux, retire les fonctions et la table — et n'est
  appliquée que sur décision.
- **Relevé nocturne en échec.** Le voyant « Relevé quotidien » passe en alerte
  le lendemain : la panne ne peut pas rester muette.
- **Coût du relevé.** Il appelle `admin_vue_globale()`, lourde, une fois par
  jour. Sa durée est mesurée en local et consignée dans le plan.
- **Droits sous `security definer`.** `pg_stat_activity`, `pg_database_size` et
  `cron.*` sont lus sous `postgres`, dont les droits sont vérifiés en
  production.

## Épreuves — chacune vue rouge avant d'être verte

- **`core`** : `evaluerSante`, chaque voyant de part et d'autre de chacun de ses
  seuils ; le niveau général est le pire.
- **`ui`** : `CourbeEvolution` à 0, 1 et plusieurs points ; tableau des valeurs
  présent ; bulle au focus clavier.
- **admin** : synthèse et pastilles rendues avec leur texte ; « Santé
  indisponible » quand `sante` est nul, le reste de l'onglet affiché ; aucun
  « vs mois dernier » sans relevé de 30 jours ; les trois épreuves existantes
  de l'onglet vertes ; nouveau libellé du menu.
- **base** : deux relevés le même jour donnent une ligne ; `sante_systeme` rend
  toutes ses clés ; les trois fonctions refusées à `anon` et `authenticated` ;
  la purge s'exécute sous la clé de service ; la route rend `sante`.

## Deux limites assumées

- Les épreuves ne peuvent pas insérer de fausses traces anciennes dans
  `cron.job_run_details` : la purge est éprouvée sur ses droits et son
  exécution, pas sur son effet. Son effet se vérifie en production après le
  2026-09-22, par un compte agrégé.
- La tolérance de la route à l'absence de `sante_systeme` est éprouvée à la
  main, en local : exécution retirée à `service_role`, appel de la route,
  `sante: null` sous un 200, puis `db reset`.

## Hors périmètre

- L'affichage de l'encours et de ses tendances : chantier C.
- Un plafond de taille tiré du forfait Supabase.
- Toute alerte poussée (SMS, courriel) : l'écran constate, il ne prévient pas.
