# Kolek — J1 Socle · Spécification de conception

> Jalon **J1** du cahier de charges Phase 1 : modèle de données Supabase, authentification, isolation par rôle.
> Date : 2026-08-15 · Statut : validé, prêt pour plan d'implémentation
> Documents parents : `Docs/Kolek Cahier de charges consolide.md` · `Docs/Kolek Design System.md`

---

## 1. Objectif et périmètre

### 1.1 Ce que J1 livre

Un socle backend sur lequel tous les jalons suivants se greffent sans reprise :

- Un schéma PostgreSQL versionné en migrations, portant les règles métier sous forme de contraintes.
- Une authentification Supabase fonctionnelle pour le rôle collecteur.
- Une isolation multi-tenant stricte par `collecteur_id`, vérifiée par des tests.
- Un moteur de calcul métier en TypeScript pur, développé en TDD.
- Un monorepo structuré, avec deux coquilles d'application prêtes à recevoir les écrans de J2.

### 1.2 Ce que J1 ne livre pas

Aucun écran métier. Ni souscription, ni encaissement, ni carte de collecte, ni bilan. Les deux applications se limitent à une connexion qui fonctionne et à une page prouvant l'isolation des données. Ces écrans relèvent de J2 et suivants.

Aucune Edge Function métier. Le répertoire `supabase/functions/` est créé et câblé, mais la première fonction réelle (`cloturer-carte`) appartient à J3.

Aucun envoi de reçu. WhatsApp et SMS relèvent de J3.

### 1.3 Critère de réussite

Les cinq vérifications de la section 9 passent sur une base locale reconstruite depuis zéro.

---

## 2. Décisions d'architecture retenues

Trois décisions ont été tranchées avant conception. Elles conditionnent tout le reste.

### 2.1 Chemins d'écriture — modèle hybride

| Opération | Chemin | Justification |
|---|---|---|
| Encaissement d'une mise | `INSERT` direct sur `mises` via RLS | Chemin chaud, haute fréquence, doit fonctionner hors-ligne et se rejouer sans appel réseau applicatif. L'idempotence est garantie par la clé primaire (§4.3). |
| Retrait / clôture de carte | Edge Function (J3) | Opération sensible et unique par carte. Le calcul de commission et le changement de statut sont arbitrés côté serveur. |
| Envoi de reçu | Edge Function (J3) | Nécessite des secrets de passerelle qui ne doivent jamais atteindre le navigateur. |
| Gestion des abonnements | Edge Function (J5) | Périmètre super-admin, clé de service requise. |

Le principe « l'app propose, le backend décide » du dossier stratégique est respecté : ce qui est arbitré côté serveur, ce sont les opérations à enjeu, pas chaque mise. Pour les mises, l'arbitrage est délégué aux contraintes et triggers PostgreSQL, qui s'exécutent côté serveur quel que soit l'appelant.

### 2.2 Organisation du code — monorepo à trois espaces

Un dépôt unique, npm workspaces, deux builds Netlify indépendants pointant chacun sur son sous-dossier. Les deux applications restent des codebases séparées au sens du dossier stratégique — déploiements distincts, bundles distincts — mais partagent un espace commun qui n'existe qu'en un seul exemplaire.

```
Kolek/
├─ Docs/                       # Cahier de charges, Design System, specs
│  └─ specs/                   # Ce document et ses successeurs
├─ supabase/
│  ├─ migrations/              # SQL versionné — source de vérité du schéma
│  ├─ functions/               # Edge Functions (squelette en J1)
│  ├─ seed.sql                 # Jeu de données de développement
│  └─ tests/                   # Tests RLS et idempotence
├─ packages/core/              # TypeScript pur, zéro dépendance
│  ├─ src/calcul.ts            # Moteur métier
│  ├─ src/format.ts            # Formatage FCFA, dates
│  ├─ src/tokens.ts            # Tokens du Design System
│  └─ src/types.ts             # Types partagés du domaine
├─ apps/collecteur/            # PWA React 19 + Vite + TS
└─ apps/admin/                 # Web React 19 + Vite + TS
```

### 2.3 Pile technique

React 19, Vite, TypeScript, `@supabase/supabase-js`, `lucide-react`. Même pile que MediClinicPro, déjà en production dans la maison — aucun coût d'apprentissage, conventions déjà établies. Gestionnaire de paquets : npm workspaces.

Outillage local vérifié disponible : Node 26.2, npm 11.13, git 2.55, Docker 29.5, Supabase CLI 2.114.

---

## 3. Modèle de données

### 3.1 Vue d'ensemble

Six tables métier issues du cahier §8, plus deux tables opérationnelles imposées par le hors-ligne et l'audit.

```
collecteurs ──┬── clients ──── cartes ──┬── mises
              │                          └── retraits
              ├── caisses_jour
              └── synchro_rejets

audit_log (transversal, append-only)
```

### 3.2 Écarts assumés par rapport au cahier §8

Le cahier donne l'esquisse du modèle. Les ajouts suivants sont requis par les décisions de la section 2 et par les exigences non-fonctionnelles de traçabilité et de hors-ligne.

| Ajout | Raison |
|---|---|
| `collecteurs.id` référence `auth.users.id` | Permet une policy RLS de la forme `collecteur_id = auth.uid()`, sans jointure ni sous-requête. Simplifie et accélère chaque écriture terrain. |
| `collecteur_id` dénormalisé sur `clients`, `cartes`, `mises`, `retraits` | Sans lui, chaque policy RLS remonte la chaîne `mises → cartes → clients → collecteurs`. Avec lui, la policy est une comparaison directe. |
| `mises.id` en UUID généré côté téléphone | Mécanisme d'idempotence de la synchro (§4.3). |
| `mises.encaisse_le` et `mises.recu_le` distincts | Heure du geste terrain contre heure d'arrivée serveur. Une mise encaissée hors-ligne le lundi et synchronisée le jeudi doit garder ses deux dates, sinon l'audit et les bilans journaliers sont faux. |
| Montants en `integer` | Le FCFA n'a pas de sous-unité. Aucun flottant sur de l'argent. |
| `collecteurs.palier` et champs d'abonnement | Le plafond de clients par palier doit être contrôlable en base, pas seulement dans l'interface. |
| Table `synchro_rejets` | Voir §4.4. |
| Table `audit_log` | Exigence de traçabilité du cahier §7. |

### 3.3 Tables

**`collecteurs`** — un enregistrement par compte payant, en correspondance 1-pour-1 avec un utilisateur Supabase Auth.

| Colonne | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Référence `auth.users(id)`, suppression en cascade. |
| `nom` | `text` | Obligatoire. |
| `telephone` | `text` | Obligatoire, unique. |
| `zone` | `text` | Zone ou marché principal. |
| `palier` | `text` | `essai` \| `standard` \| `pro` \| `illimite`. Défaut `essai`. |
| `abonnement_statut` | `text` | `actif` \| `suspendu` \| `expire`. Défaut `actif`. |
| `abonnement_echeance` | `date` | Défaut : date du jour + 30 jours (essai). |
| `cree_le` | `timestamptz` | Défaut `now()`. |

**`clients`** — les déposants d'un collecteur. Pas de compte, pas d'authentification en Phase 1.

| Colonne | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Généré côté téléphone (souscription hors-ligne possible). |
| `collecteur_id` | `uuid` FK | → `collecteurs(id)`. |
| `nom` | `text` | Obligatoire. |
| `telephone` | `text` | Destinataire des reçus. |
| `photo_url` | `text` | Supabase Storage, nullable. |
| `marche` | `text` | Zone ou marché. |
| `activite` | `text` | Commerce exercé. |
| `cree_le` | `timestamptz` | Défaut `now()`. |

**`cartes`** — un cycle de 31 mises pour un client.

| Colonne | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Généré côté téléphone. |
| `collecteur_id` | `uuid` FK | Dénormalisé pour RLS. |
| `client_id` | `uuid` FK | → `clients(id)`. |
| `mise` | `integer` | `CHECK mise BETWEEN 500 AND 10000`. |
| `statut` | `text` | `active` \| `cloturee`. Défaut `active`. |
| `mises_encaissees` | `integer` | Cache maintenu par trigger (§3.5). `CHECK BETWEEN 0 AND 31`. |
| `ouverte_le` | `timestamptz` | Défaut `now()`. |
| `cloturee_le` | `timestamptz` | Nullable. |

**`mises`** — journal append-only des encaissements. Table la plus critique du système.

| Colonne | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | **Généré par le téléphone.** Pas de `gen_random_uuid()` par défaut côté serveur. |
| `collecteur_id` | `uuid` FK | Dénormalisé pour RLS. |
| `carte_id` | `uuid` FK | → `cartes(id)`. |
| `montant` | `integer` | Doit égaler `cartes.mise` (trigger §3.5). |
| `est_commission` | `boolean` | Fixé par trigger, jamais par le client. |
| `encaisse_le` | `timestamptz` | Heure du téléphone, fournie par le client. |
| `recu_le` | `timestamptz` | Défaut `now()`, heure serveur. |

**`retraits`** — clôtures de carte. Écrites uniquement par Edge Function à partir de J3.

| Colonne | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `collecteur_id` | `uuid` FK | Dénormalisé pour RLS. |
| `carte_id` | `uuid` FK | → `cartes(id)`, unique — une carte ne se clôture qu'une fois. |
| `montant_restitue` | `integer` | Résultat de `soldeRestituable`. |
| `commission` | `integer` | Montant d'une mise, ou 0 si aucune mise encaissée. |
| `effectue_le` | `timestamptz` | Défaut `now()`. |

**`caisses_jour`** — rapprochement de fin de journée.

| Colonne | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `collecteur_id` | `uuid` FK | |
| `date` | `date` | `UNIQUE (collecteur_id, date)`. |
| `cash_attendu` | `integer` | Calculé depuis les mises, jamais écrit par le client. Le privilège d'insertion et de mise à jour lui est retiré, et un trigger le repose à chaque écriture sur la caisse **et** à chaque mise datée de ce jour — un attendu figé à la clôture laisserait faux à jamais l'écart d'une journée qu'une synchro tardive vient corriger (cadrage J2). Point de calcul unique : `cash_attendu_du_jour()`. |
| `cash_declare` | `integer` | Saisi par le collecteur. |
| `ecart` | `integer` | Colonne générée : `cash_declare - cash_attendu`. |

**`synchro_rejets`** — mises refusées à la synchronisation. Voir §4.4.

| Colonne | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `collecteur_id` | `uuid` FK | |
| `charge_utile` | `jsonb` | La mise refusée, intégrale. |
| `motif` | `text` | Code d'erreur du trigger déclencheur. |
| `traite` | `boolean` | Défaut `false`. |
| `cree_le` | `timestamptz` | Défaut `now()`. |

**`audit_log`** — journal transversal append-only.

| Colonne | Type | Notes |
|---|---|---|
| `id` | `bigint` PK | Séquence. |
| `collecteur_id` | `uuid` | Nullable (actions super-admin). |
| `table_cible` | `text` | |
| `ligne_id` | `uuid` | |
| `action` | `text` | `insert` \| `update` \| `delete` \| `rejet`. |
| `donnees` | `jsonb` | Instantané de la ligne. |
| `survenu_le` | `timestamptz` | Défaut `now()`. |

### 3.4 Contraintes portant des règles métier

Chaque règle du cahier §4 est exprimée en base, pas seulement dans l'interface.

| Règle métier | Expression en base |
|---|---|
| Un client possède une seule carte active à la fois (décision de cadrage Phase 1) | Index unique partiel : `UNIQUE (client_id) WHERE statut = 'active'`. |
| Une seule commission par carte | Index unique partiel : `UNIQUE (carte_id) WHERE est_commission`. |
| Cycle de 31 mises maximum | `CHECK (mises_encaissees BETWEEN 0 AND 31)` sur `cartes`. |
| Mise journalière entre 500 et 10 000 FCFA | `CHECK (mise BETWEEN 500 AND 10000)` sur `cartes`. |
| Une carte ne se clôture qu'une fois | `UNIQUE (carte_id)` sur `retraits`. |
| Le montant d'une mise égale la mise de sa carte | Trigger `BEFORE INSERT` sur `mises`. |
| Pas d'encaissement sur carte clôturée | Trigger `BEFORE INSERT` sur `mises`. |

### 3.5 Triggers

**`mises_avant_insert`** (`BEFORE INSERT ON mises`)
1. Charge la carte ciblée. Si absente, exception.
2. Si `cartes.statut <> 'active'`, exception `CARTE_CLOTUREE`.
3. Si `cartes.mises_encaissees >= 31`, exception `CYCLE_COMPLET`.
4. Si `NEW.montant <> cartes.mise`, exception `MONTANT_INVALIDE`.
5. Force `NEW.est_commission := (cartes.mises_encaissees = 0)`. La valeur envoyée par le client est ignorée.
6. Force `NEW.collecteur_id := cartes.collecteur_id`. Empêche l'écriture croisée entre collecteurs même en cas de payload forgé.

**`mises_apres_insert`** (`AFTER INSERT ON mises`)
Incrémente `cartes.mises_encaissees`. Ce compteur est un **cache** : la source de vérité reste `count(mises)`. Il existe pour éviter un agrégat à chaque affichage de carte sur un téléphone d'entrée de gamme.

Ce trigger est déclaré `SECURITY DEFINER`. C'est ce qui lui permet de mettre à jour `cartes` alors qu'aucune policy RLS n'autorise le collecteur à le faire directement (§5.1) : le compteur est écrit par le système, jamais par le client.

**`interdire_modification`** (`BEFORE UPDATE OR DELETE ON mises, retraits`)
Lève systématiquement une exception. Couvre les accès par clé de service, que RLS ne filtre pas.

**`journaliser`** (`AFTER INSERT ON mises, retraits, cartes`)
Écrit dans `audit_log`.

> **Note conforme au cahier §8.** Le solde restituable n'est jamais stocké. Il se calcule à la volée par `(mises_encaissees − 1) × mise`. Une seule source de vérité.

---

## 4. Synchronisation hors-ligne

### 4.1 Exigence

Le cahier classe la fiabilité de la synchro parmi les trois risques produit majeurs, avec une contrainte explicite : « ni perte ni doublon ». Un double comptage sur de l'argent liquide détruit la confiance que le produit est censé créer.

### 4.2 File locale

L'app collecteur écrit d'abord dans IndexedDB, puis dans une file de synchronisation. L'interface se met à jour immédiatement sur la base locale — le geste terrain ne dépend jamais du réseau. La file se vide en arrière-plan au retour de la connexion.

Le détail d'implémentation de la file relève de J2. J1 doit simplement garantir que le serveur accepte un rejeu sans dommage.

### 4.3 Idempotence par clé primaire

Le téléphone génère l'UUID de la mise au moment du geste, via `crypto.randomUUID()`. Cet identifiant est stable : la même mise rejouée porte le même UUID.

Un rejeu produit une violation de clé primaire — code `23505` — que le client traite comme un succès : la mise est déjà arrivée. Aucune table de déduplication, aucune fenêtre temporelle, aucun compteur.

Une précision est nécessaire, et elle a coûté un correctif. Les triggers `BEFORE ROW` s'exécutent **avant** l'insertion dans l'index, donc les contrôles métier lèvent leur propre erreur avant que la clé primaire ne soit consultée. Un rejeu sur une carte clôturée entre-temps — précisément le cas « l'insertion a réussi, la réponse s'est perdue, la file réessaie » — levait `CARTE_CLOTUREE`, que le client aurait pris pour un vrai refus. La mise serait partie en rejet de synchro, et sa ressaisie par un humain, avec un nouvel identifiant, aurait été un double comptage produit par la table même qui existe pour l'empêcher.

`mises_avant_insert` teste donc le doublon **en premier**, avant tout contrôle métier, et lève `23505` explicitement. Le contrat « un rejeu se présente toujours comme un doublon » vaut alors quel que soit l'état de la carte depuis.

C'est le mécanisme anti-double-comptage dans son intégralité. Il n'y en a pas d'autre, et il n'en faut pas d'autre.

### 4.4 Conflit : mise orpheline sur carte clôturée

**Scénario.** Le collecteur encaisse une mise hors-ligne. Avant que la file se vide, la carte est clôturée — depuis un autre appareil, ou après une reconnexion partielle. À la synchronisation, le trigger refuse la mise avec `CARTE_CLOTUREE`.

**Décision retenue.** Rejet côté serveur, et consignation dans `synchro_rejets` avec la charge utile intégrale. L'application affiche un compteur non bloquant : « 1 mise refusée, à traiter ».

**Justification.** Trois options existaient :
- Forcer l'écriture en rouvrant la carte — corrompt un cycle clôturé et un retrait déjà remis en espèces.
- Ignorer silencieusement — perte d'argent réellement encaissé, exactement le litige que Kolek existe pour supprimer.
- Rejeter et remonter — l'argent a changé de main dans le monde réel, seul un humain peut décider quoi en faire.

La troisième est la seule compatible avec un produit dont l'argument de vente est la fin des zones d'ombre.

J1 crée la table et la consignation. L'écran relève de J2, mais la résolution est tranchée ci-dessous : elle décide d'une notion du modèle, donc elle ne pouvait pas attendre l'implémentation.

### 4.5 Résolution d'un rejet — le rattrapage

*Décidé le 2026-08-16.*

Le collecteur dispose d'une seule action : le **rattrapage**. Une écriture rattachée à la carte clôturée qui enregistre ce qu'il doit au client. Dans le scénario de §4.4 : 31 mises reçues, 29 000 FCFA restitués, **1 000 FCFA dus à la cliente**.

Les deux autres pistes ont été écartées. *Afficher seulement* laisse le registre affirmer 30 mises quand il y en a eu 31 — c'est archiver le litige, pas le résoudre, et la vérité du registre est le produit. *Reporter sur la carte suivante* ne fonctionne que si le client reprend une carte ; sinon l'argent reste bloqué, et il faut en plus une mise explicitement non-commissionnable sous peine de faire encaisser deux commissions au collecteur pour un seul versement.

**Trois règles.**

1. **Le collecteur agit seul**, sans validation de GTCS. Un collecteur immobilisé en pleine tournée par une validation distante est exactement ce que le hors-ligne d'abord cherche à éviter. Le risque d'abus est faible par construction : un rattrapage ne peut naître que d'une mise que le serveur a réellement refusée, et il enregistre une dette, pas un gain.
2. **Le client est prévenu**, par reçu WhatsApp avec repli SMS, au même titre qu'une mise ou un retrait. Sans reçu, le client ignore qu'on lui doit quelque chose et ne peut pas le réclamer — la transparence reposerait sur la seule bonne foi du collecteur, ce que le produit existe pour ne plus demander.
3. **La carte reste clôturée** et la mise refusée n'est jamais insérée dans `mises`. Le cycle clôturé n'est pas rouvert.

**Conséquence à tenir en J2.** La somme encaissée sur une carte ne se lit plus dans la seule table `mises` : c'est `mises` **plus** les rattrapages qui s'y rattachent. Tout bilan, tout score de régularité et tout rapprochement de caisse doit sommer les deux, sinon ils sous-comptent précisément l'argent que ce mécanisme sert à ne pas perdre. Le solde restituable, lui, ne change pas — la carte est close.

Cette conséquence a été traitée à part, parce qu'elle dépasse le rattrapage : le Mobile Money de la Phase 2 et les bonus de fidélisation poseront le même problème. Les décisions retenues — une vue unique `mouvements` comme seule surface de lecture de l'argent, un jeu de test empoisonné qui fait échouer tout bilan écrit sur `mises` seule, un cash attendu calculé et non figé, et une file de reçus qui découple le rattrapage de la passerelle WhatsApp — sont consignées dans **`2026-08-16-j2-cadrage-mouvements.md`**.

---

## 5. Sécurité et isolation

### 5.1 Row Level Security

RLS activée sur toutes les tables. Aucune exception.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `collecteurs` | `id = auth.uid()` | — | `id = auth.uid()` (champs profil) | — |
| `clients` | `collecteur_id = auth.uid()` | `collecteur_id = auth.uid()` | `collecteur_id = auth.uid()` | — |
| `cartes` | `collecteur_id = auth.uid()` | `collecteur_id = auth.uid()` | — | — |
| `mises` | `collecteur_id = auth.uid()` | `collecteur_id = auth.uid()` | **aucune policy** | **aucune policy** |
| `retraits` | `collecteur_id = auth.uid()` | — (Edge Function) | **aucune policy** | **aucune policy** |
| `caisses_jour` | `collecteur_id = auth.uid()` | `collecteur_id = auth.uid()` | `collecteur_id = auth.uid()` | — |
| `synchro_rejets` | `collecteur_id = auth.uid()` | `collecteur_id = auth.uid()` | `collecteur_id = auth.uid()` (marquer traité) | — |
| `audit_log` | **aucune policy** | — | — | — |

L'absence de policy est un refus. Sans policy UPDATE sur `mises`, l'opération est inexprimable via l'API — l'immuabilité n'est pas une convention mais une propriété du système.

Les changements de statut de carte passent par Edge Function avec clé de service, d'où l'absence de policy UPDATE sur `cartes`.

### 5.2 Clé de service

La clé de service Supabase contourne RLS. Elle ne vit que dans les variables d'environnement des Edge Functions. Elle n'apparaît jamais dans un bundle navigateur, ni dans `apps/admin`. Le Dashboard Admin obtient sa vue globale en appelant des fonctions serveur qui, elles, détiennent le privilège.

Un contrôle automatisé est ajouté au processus de build : échec si `SERVICE_ROLE` apparaît dans un artefact d'application.

### 5.3 Super-admin

Hors périmètre J1 au niveau applicatif, mais le schéma le prévoit : une table `admins(user_id)` détermine le rôle. Aucune policy RLS ne l'utilise — les accès admin passent exclusivement par Edge Functions, conformément au dossier stratégique §3.

**Correctif de l'audit du 2026-08-16.** « Hors périmètre applicatif » avait été lu comme « pas de contrôle du tout » : `apps/admin` laissait entrer toute session valide, et un collecteur possède une session valide. Sans conséquence tant que la page est une coquille, mais la porte devait être fermée *avant* les widgets de J4, pas pendant.

La fonction `est_admin()` répond par oui ou non sur l'appelant, en `security definer`, et n'ouvre aucune ligne d'`admins` — `authenticated` n'a toujours aucun privilège sur cette table. C'est un portillon, pas un chemin de données : la vue globale du dashboard reste derrière les Edge Functions. Un échec réseau laisse le portillon fermé, jamais ouvert.

---

## 6. `packages/core` — moteur métier

### 6.1 Contraintes

TypeScript pur, zéro dépendance d'exécution. Ni React, ni Supabase, ni accès réseau. Testable en millisecondes, sans base ni navigateur. Importé identiquement par les deux applications et, à terme, par les Edge Functions.

### 6.2 Interface publique

```ts
// calcul.ts
soldeRestituable(misesEncaissees: number, mise: number): number
commission(misesEncaissees: number, mise: number): number
progression(misesEncaissees: number): { encaissees: number; total: 31; ratio: number }
cycleComplet(misesEncaissees: number): boolean
peutEncaisser(carte: Carte): boolean
validerMise(montant: number): boolean

// format.ts
formatFCFA(montant: number): string        // 817432 → "817 432 FCFA"
formatDateLocale(d: Date): string

// tokens.ts
couleurs, rayons, espacements, typographie   // Design System, source unique
```

### 6.3 Développement en TDD

Le tableau de vérification du cahier §4 devient la première suite de tests, écrite **avant** toute implémentation :

| Situation (M = 1 000) | `soldeRestituable` | `commission` |
|---|---|---|
| Carte complète, 31 mises | 30 000 | 1 000 |
| Retrait anticipé, 15 mises | 14 000 | 1 000 |
| Retrait après 1 mise | 0 | 1 000 |
| Aucune mise encaissée | 0 | 0 |

Cas limites à couvrir : `misesEncaissees = 0`, plafonnement à `30 × M`, mise hors bornes 500–10 000, montants non entiers rejetés.

### 6.4 Tokens du Design System

Les valeurs de `Docs/Kolek Design System.md` §3 sont transcrites une seule fois ici et exportées en variables CSS consommées par les deux applications. La règle d'or du Design System — « un même token, un même composant, partout » — n'est tenable que si les tokens n'existent qu'à un seul endroit.

Aucun or dans l'interface : la palette applicative est verte, neutre, sémantique et pastel. L'or reste réservé à l'identité de marque hors interface.

---

## 7. Coquilles applicatives

### 7.1 `apps/collecteur`

React 19 + Vite + TypeScript. Manifeste PWA et service worker configurés — l'installabilité et le cache d'app shell sont posés dès J1, car les rétrofitter est coûteux. Écran de connexion Supabase Auth fonctionnel. Une page authentifiée listant les clients du collecteur connecté, qui sert de preuve visuelle de l'isolation.

Pas de logique métier, pas de file de synchro, pas de carte de collecte. J2.

### 7.2 `apps/admin`

React 19 + Vite + TypeScript. Écran de connexion. Une page authentifiée vide portant la mise en page cible du Design System — sidebar gauche, canevas clair, cartes arrondies — sans widget réel.

---

## 8. Configuration et environnement

- `supabase/config.toml` versionné, base locale via Docker.
- Variables d'environnement par application : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Fichiers `.env.example` versionnés, `.env` ignorés.
- `.gitignore` couvrant `node_modules`, `dist`, `.env`, artefacts Supabase locaux.
- Les collecteurs de test sont créés par le harnais de tests via l'API d'administration Auth (`auth.admin.createUser`), pas par un `seed.sql`. Insérer des lignes dans `auth.users` en SQL brut exige de reproduire à la main le format des mots de passe et des identités, qui varie selon les versions de Supabase. Tester l'isolation exige deux tenants ; le harnais en crée autant que chaque fichier de test en demande, puis les supprime.

---

## 9. Vérification de fin de J1

J1 n'est pas terminé tant que ces cinq vérifications ne passent pas sur une base reconstruite depuis zéro. Sans elles, l'expression « socle sécurisé » est une affirmation invérifiable.

1. **Reconstruction complète.** `supabase db reset` applique toutes les migrations sur une base vierge, sans erreur. Aucun `seed.sql` : les collecteurs de test naissent du harnais, via l'API d'administration Auth (§8), et l'amorçage est désactivé dans `config.toml` pour que la sortie reste propre.
2. **Isolation.** Authentifié comme collecteur A, six tentatives sur les données du collecteur B — lecture d'un client, lecture d'une mise, insertion d'un client sur B, insertion d'une mise sur une carte de B, modification d'un client de B, lecture du journal d'audit — produisent six refus ou six résultats vides.
3. **Moteur métier.** La suite de `packages/core` passe intégralement, table de vérification du cahier §4 incluse.
4. **Idempotence.** La même mise, identifiant compris, insérée trois fois : une seule ligne en base, `mises_encaissees` incrémenté exactement une fois.
5. **Immuabilité.** `UPDATE` et `DELETE` sur une mise existante sont rejetés, y compris avec la clé de service.

Chaque vérification est un test automatisé, exécutable par une commande unique. Aucune n'est manuelle.

---

## 10. Points ouverts

Non bloquants pour J1, à trancher avant les jalons indiqués.

| Point | Échéance | Note |
|---|---|---|
| Client qui « saute » longtemps : carte en veille ? relance automatique ? | Avant J4 | Point ouvert du cahier §11. Concerne le score de régularité et les alertes retard. |
| ~~Traitement des rejets de synchro~~ | ~~Avant J2~~ | **Tranché le 2026-08-16** — le rattrapage, voir §4.5. Reste à concevoir : l'écran, et la table `rattrapages` au cadrage de J2. |
| Plafond de clients par palier : blocage dur ou avertissement ? | Avant J5 | Affecte le trigger de création de client. |
| Priorité Phase 2 : renouvellement multi-cartes ou Mobile Money ? | Après J5 | Décision à valider du dossier stratégique §8. |

---

## 11. Conformité

Aucun élément de J1 ne fait transiter de fonds par la plateforme. Le schéma enregistre des registres d'opérations en espèces réalisées hors système. Kolek reste un éditeur de logiciel, hors du champ des Systèmes Financiers Décentralisés au sens BCEAO. Toute évolution Mobile Money (Phase 2) devra passer par un partenaire agréé.

---

*Kolek — J1 Socle · spécification validée le 2026-08-15 · prochaine étape : plan d'implémentation.*
