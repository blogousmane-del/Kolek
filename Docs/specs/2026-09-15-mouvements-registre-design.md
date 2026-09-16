# Kolek — Le registre des mouvements · Spécification de conception

> 2026-09-15. Premier des trois chantiers issus de la suite de J2b (`2026-09-13-j2b-hors-ligne-design.md` §10).
> Réalise les décisions de `2026-08-16-j2-cadrage-mouvements.md` §2 à §4, et `2026-08-15-j1-socle-design.md` §4.5 (conséquence à tenir).
> Décisions prises avec l'exploitant le 2026-09-15, section par section.

---

## 1. Pourquoi ce chantier existe

La spec J1 (§4.5) a tranché la résolution d'un refus de synchro : le **rattrapage**, une écriture qui enregistre ce que le collecteur doit au client pour une mise encaissée que le serveur a refusée. Elle en a tiré une conséquence : la somme encaissée ne se lit plus dans la seule table `mises`. Le cadrage J2 a répondu par une surface unique de lecture de l'argent, la vue `mouvements`, et par un jeu d'essai qui fait échouer tout calcul qui l'ignore.

Rien de cela n'a été construit. Aujourd'hui, l'argent se lit en direct sur `mises` et `retraits` à une dizaine d'endroits : fonctions SQL de l'administration et de l'équipe, caisse du jour, lectures en ligne du collecteur, calculs de la tournée du téléphone. Le jour où un rattrapage existera, chacun de ces endroits sous-comptera exactement l'argent que le rattrapage sert à ne pas perdre, et le collecteur paraîtra garder un excédent qui ne lui appartient pas.

### 1.1 Découpage décidé le 2026-09-15

| Ordre | Chantier | Contenu |
|---|---|---|
| 1 | **B — ce document** | La vue `mouvements`, la table `rattrapages` vide, la reprise de chaque lecteur d'argent, le jeu d'essai piégé. |
| 2 | A — rattrapage | Le geste du collecteur depuis un refus, l'écran des refus, le sens de `traite`, l'avis au client, le règlement, les rattrapages dans la tournée du téléphone. |
| à part | C — mineurs J2b | Les treize défauts reportés du plan J2b (section « Reportés au chantier suivant »). |

B passe en premier parce qu'il ne change **aucun chiffre visible** : sa justesse se prouve par l'égalité avant et après. A n'aura plus qu'à écrire dans une table que tous les lecteurs lisent déjà.

### 1.2 La contrainte absolue — aucune perte de données

Posée par l'exploitant. Dans ce document, elle veut dire exactement :

- aucune ligne de `mises`, `retraits`, `caisses_jour` ou `synchro_rejets` n'est modifiée, déplacée ou recopiée ;
- la migration ne fait qu'**ajouter** des objets et **remplacer** des fonctions de lecture par des versions aux résultats identiques ;
- aucun chiffre montré à un collecteur, un collaborateur ou un administrateur ne change, et la preuve en est faite en production (§6.7) avant que les fronts partent ;
- la base IndexedDB des téléphones n'est pas touchée : aucun format, aucune version.

---

## 2. Ce que B ajoute au serveur

### 2.1 La vue `mouvements`

`security_invoker = true`. Une ligne par mouvement d'argent :

| Colonne | Mise | Retrait | Rattrapage |
|---|---|---|---|
| `id` | `mises.id` | `retraits.id` | `rattrapages.id` |
| `nature` | `'mise'` | `'retrait'` | `'rattrapage'` |
| `sens` | `1` | `-1` | `1` |
| `montant` | `montant` | `montant_restitue` | `montant` |
| `collecteur_id` — à qui est la carte | `collecteur_id` | `collecteur_id` | `collecteur_id` |
| `main_id` — qui a tenu l'argent | `encaisse_par` | `restitue_par` | `main_id` |
| `carte_id` | `carte_id` | `carte_id` | `carte_id` |
| `client_id` | par `cartes` | par `cartes` | par `cartes` |
| `survenu_le` | `encaisse_le` | `effectue_le` | `encaisse_le` |
| `est_commission` | `est_commission` | `false` | `false` |

Trois règles de lecture, écrites en commentaire de la vue :

1. **Le montant est positif ; le sens dit la direction.** Une somme d'argent détenu est `sum(sens * montant)`. Une somme d'encaissements est `sum(montant) filter (where sens = 1)`.
2. **La commission reste une mise** — la première du cycle, `est_commission = true` —, comme aujourd'hui. La sortie d'un retrait est `montant_restitue`, jamais `montant_restitue + commission` : la commission reste chez le collecteur et elle est déjà comptée côté mises. La soustraire la retirerait deux fois (même raisonnement que `cash_attendu_du_jour`, `20260902120000_encaisse_par.sql`).
3. **`client_id` se lit par la carte, pour les trois natures.** Une seule vérité : la table `rattrapages` ne porte pas de `client_id` qui pourrait contredire sa carte.

### 2.2 La table `rattrapages`, créée vide

```
rattrapages( id uuid primary key default gen_random_uuid(),
             collecteur_id uuid not null references collecteurs(id) on delete restrict,
             main_id       uuid not null references collecteurs(id),
             carte_id      uuid not null references cartes(id) on delete restrict,
             rejet_id      uuid not null unique references synchro_rejets(id) on delete restrict,
             montant       integer not null check (montant > 0),
             encaisse_le   timestamptz not null,   -- l'heure de la mise refusée, pas celle de la saisie
             cree_le       timestamptz not null default now() )
```

- **Immuable** : le déclencheur `interdire_modification` existant refuse toute modification et toute suppression, comme sur `mises`.
- **RLS** activée ; lecture par le propriétaire seulement, `collecteur_id = auth.uid()`, comme `mises_select`.
- **Aucun droit d'écriture** pour `authenticated` ni `anon` en B. Seule la clé de service écrit — c'est-à-dire les épreuves. Le geste qui écrit, ses droits et ses bornes appartiennent au chantier A.
- `rejet_id unique` : un refus ne produit jamais deux rattrapages.
- Le **règlement** au client (la sortie qui solde la dette) n'existe pas en B. A l'ajoutera, avec sa branche de sortie dans la vue.

### 2.3 La caisse suit un rattrapage

Un déclencheur `rattrapages_rafraichir_caisse`, calqué sur `caisses_rafraichir_apres_mise`, recalcule la caisse de `main_id` à la date UTC de `encaisse_le`. Comme pour les mises : s'il n'existe pas de caisse ce jour-là, il ne crée rien.

C'est ce qui réalise le cadrage J2 §4 : un rattrapage daté de lundi et posé mercredi referme l'écart de lundi.

### 2.4 Droits

- `grant select on mouvements to authenticated` ; rien pour `anon`.
- La vue héritant de la RLS de ses tables, chacun y voit exactement ce qu'il voit aujourd'hui dans `mises` et `retraits`, ni plus ni moins — collaborateurs compris.
- Les fonctions remplacées (§3.1) gardent leur signature, leur `security definer`, leur `search_path` et leurs `revoke`/`grant`, reportés depuis leur définition en vigueur. `create or replace function` conserve l'ACL, mais le plan les réécrit quand même explicitement : un droit oublié sur une `security definer` est le défaut que rien ne signale.

---

## 3. Qui lit la vue

**Le tri.** Toute **somme d'argent** et toute **liste de versements** passe par `mouvements`. Ce qui porte sur le **cycle d'une carte** reste lu comme aujourd'hui.

Le solde à rendre — « Total à vous rendre », montant du retrait, encours — se calcule par **compteur × mise** (`cartes.mises_encaissees`), pas par une somme de mises. La spec J1 §4.5 le confirme : le rattrapage ne change pas le solde d'une carte close. Ces calculs restent donc tels quels.

### 3.1 Repris

| Où | Lecteur | Ce qu'il calcule |
|---|---|---|
| Base | `cash_attendu_du_jour` | `sum(sens * montant)` par `main_id` et jour UTC |
| Base | `admin_vue_globale` | encaissé, commissions, dû aux clients, restitutions |
| Base | `admin_tendances` | séries journalières et derniers mouvements |
| Base | `equipe_vue` | dû aux clients, commissions, restitutions par membre |
| Collecteur en ligne | `chargerBilan` | encaissé, commissions, restitutions |
| Collecteur en ligne | `chargerRecus` | liste des derniers versements |
| Collecteur en ligne | `chargerHistoriqueCarte` | versements et retrait d'une carte |
| Collecteur en ligne | `chargerAlertes` | date du dernier versement d'une carte |
| Téléphone | `tableauDepuis` (accueil) | encaissé du jour |
| Téléphone | `rapprochementDepuis` | attendu provisoire du jour |
| Téléphone | `ficheDepuis` | dernières mises d'un client |

Le plan relit chacun avant de le reprendre, et note toute somme trouvée hors de cette table.

### 3.2 Le téléphone

La tournée locale garde ses mises et ses retraits **bruts**. Rien ne change dans IndexedDB.

Les calculs d'argent du téléphone passent par une fonction pure de `packages/core`, `mouvementsDepuis({ mises, retraits, rattrapages })`, qui rend les mêmes lignes que la vue, avec les mêmes règles (§2.1). En B, la tournée ne contient aucun rattrapage : la fonction reçoit une liste vide, et A la remplira.

Le rechargement (`rafraichir`) continue de lire `mises` et `retraits` : il remplit une copie brute, pas un calcul d'argent. Il figure donc dans les exemptions (§3.3).

### 3.3 Laissés tels quels — avec leur raison écrite dans le code

| Lecteur | Raison |
|---|---|
| `mises_apres_insert`, les 31 cases d'une carte | Cycle, pas argent. |
| `soldeRestituable`, `partager` (clôture), `mettre_en_file_avis` | Solde par compteur × mise. |
| `admin_reglages` (`count(*)` par table) | Taille des tables, pas argent. |
| `admin-supprimer-collecteur` | Contrôle d'existence avant suppression. |
| `mises_avant_insert` (doublon) | Écriture. |
| `envoyer`, `collecteur-encaisser-pour`, `collecteur-cloturer-carte` | Écritures. |
| `rafraichir` (`mises`, `retraits`) | Copie brute de la tournée ; les calculs passent par `mouvementsDepuis`. |

### 3.4 Le garde-fou

Une épreuve de source cherche `from('mises')` et `from('retraits')` dans `apps/` et `packages/`, et `public.mises` / `public.retraits` dans la **dernière définition** de chaque fonction SQL. Tout usage hors de la table des exemptions (§3.3), tenue dans l'épreuve elle-même avec sa raison, la fait échouer.

Le prochain lecteur écrit à la main tombe en développement, pas en production.

---

## 4. Épreuves

1. **Le jeu d'essai piégé** — le scénario de J1 §4.5. Une carte à 1 000 FCFA la mise, 30 mises au serveur, clôturée : 29 000 FCFA rendus, 1 000 FCFA de commission. Plus un rattrapage de 1 000 FCFA posé par la clé de service, avec son refus d'origine. Chaque lecteur repris (§3.1) a une épreuve sur ce jeu, qui attend **31 000 FCFA encaissés** et **1 000 FCFA dus au client**. Le montant rendu reste **29 000 FCFA** : c'est la preuve que le solde par compteur n'a pas été touché.
2. **Le jeu standard, sans rattrapage.** Les épreuves existantes des bilans, de la caisse, de l'administration et de l'équipe restent vertes **sans qu'un seul chiffre attendu change**. Une épreuve qui demanderait de changer un nombre pour passer est un défaut à présenter à l'exploitant, jamais une correction silencieuse.
3. **La caisse suit.** Un rattrapage daté de lundi, posé mercredi, recalcule la caisse de lundi de la bonne main ; sans caisse ce jour-là, rien n'est créé.
4. **La parité.** Sur le même jeu, la vue SQL et `mouvementsDepuis` rendent les mêmes lignes, même ordre après tri par `id`.
5. **L'isolation.** Le collecteur A ne voit dans `mouvements` que ses lignes, rattrapages compris ; un collaborateur voit ce qu'il voit aujourd'hui dans `mises` et `retraits` ; `anon` ne voit rien ; `authenticated` ne peut ni insérer, ni modifier, ni supprimer un rattrapage.
6. **L'immutabilité.** La clé de service elle-même ne peut ni modifier ni supprimer un rattrapage ; un second rattrapage sur le même refus est refusé.
7. **Le garde-fou de source** (§3.4), vu rouge sur un lecteur ajouté exprès, puis retiré.
8. **Le regard.** Sur la pile locale, même jeu : accueil, bilan, reçus, rapprochement et fiche affichent les mêmes chiffres avant (sur `main`) et après (sur la branche). Et l'administration : vue globale, tendances, équipe.

---

## 5. Hors périmètre

- **Chantier A** : le geste de rattrapage et ses droits, l'écran des refus, le sens de `traite`, l'avis au client (par la file `avis_clients` existante, qui remplace la table `recus_a_envoyer` du cadrage J2 §5), le règlement et sa branche de sortie, les rattrapages dans la tournée du téléphone et dans `rafraichir`.
- **Chantier C** : les treize défauts reportés de J2b.
- **Plus tard** : le score de régularité, qui n'existe pas encore ; le Mobile Money et les bonus, qui ajouteront chacun une branche à la vue.
- **Non rouvert** : la caisse reste stockée et recalculée par déclencheurs, comme aujourd'hui ; B y ajoute le déclencheur des rattrapages, rien d'autre.

---

## 6. Livraison

### 6.1 Avant la production

- `npm run verifier` complet, vert, sur la branche fusionnée.
- `git diff --stat main...HEAD -- supabase/functions` vide : aucune Edge Function modifiée. S'il en fallait une, le plan le dit et le geste a son accord séparé.

### 6.2 La migration de retour

Écrite et éprouvée en local **avant** la production, jamais appliquée sans décision : elle remet mot pour mot les définitions en vigueur des quatre fonctions remplacées, et supprime le déclencheur des rattrapages. La table et la vue, vides et non lues par l'ancien code, peuvent rester.

### 6.3 L'ordre des gestes — chacun sur accord explicite de l'exploitant

1. **Relevé avant** (§6.4).
2. **Migration** : `supabase db push`. Additive et compatible : les fronts en production continuent de fonctionner, les fonctions remplacées rendant les mêmes résultats.
3. **Relevé après migration**, comparé au relevé avant. Un écart : appliquer la migration de retour, ne rien pousser, présenter l'écart.
4. **Poussée de `main`** : Netlify déploie les fronts ; aucune Edge Function ne part.
5. **Relevé final**, puis empreintes des paquets servis comparées aux paquets construits (mémoire « déploiement des fronts »).

### 6.4 Les relevés en production

**SELECT seulement, comptes, sommes et empreintes md5 seulement — jamais un nom, jamais un numéro.** Pour chaque relevé :

- nombre et somme de `mises` et de `retraits` ; après migration, nombre et `sum(sens * montant)` de `mouvements`, égaux aux précédents ;
- nombre de caisses dont `cash_attendu` diffère du recalcul par `cash_attendu_du_jour` — sa valeur avant est la ligne de départ, elle ne doit pas bouger ;
- empreinte md5 du résultat de `admin_vue_globale`, `admin_tendances` et `equipe_vue` pour des arguments fixés par le plan (la façon de les appeler en lecture seule, sous une identité d'administrateur, est établie et éprouvée en local par le plan) ;
- `max(recu_le)` des mises et `max(effectue_le)` des retraits.

**Une fenêtre calme.** La production vit : une mise encaissée entre deux relevés change légitimement les sommes. Les deux relevés d'une comparaison ne valent que si `max(recu_le)` et `max(effectue_le)` sont identiques de l'un à l'autre ; sinon, la paire se refait. Et jamais à cheval sur minuit UTC, qui décale les séries journalières.

### 6.5 Retour arrière

- **Fonctions SQL** : la migration de retour (§6.2).
- **Fronts** : `git revert -m 1` de la fusion, puis poussée, sur accord.
- **Table et vue** : restent, vides et non lues.
- **Téléphones** : rien à défaire ; un téléphone resté sur l'ancienne version calcule les mêmes chiffres.

---

## 7. Décisions prises le 2026-09-15

| Question | Retenu | Écarté |
|---|---|---|
| Découpage | B (mouvements), puis A (rattrapage) ; C (mineurs J2b) à part | A et B ensemble ; C d'abord ; tout ensemble |
| Forme de la surface de lecture | Registre complet signé : mises, retraits, rattrapages | entrées seules (cadrage d'août) ; une fonction serveur par question |
| Table `rattrapages` | Créée vide en B, sans droit d'écriture, pour le jeu piégé | créée en A |
| Reçu du rattrapage | File `avis_clients` existante (en A) | table `recus_a_envoyer` du cadrage |
| Serveur, lecteurs, épreuves, livraison | Validés section par section | — |
