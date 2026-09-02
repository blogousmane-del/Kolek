# Collaborateurs — conception

**Date :** 2026-09-02 · **Branche :** `collaborateurs-equipe`

**But.** Le forfait Illimité (10 000 FCFA/mois) inclut l'activation de trois
collaborateurs. Chacun est un collecteur à part entière, avec ses clients, ses
cartes et sa caisse ; le titulaire les suit et peut encaisser à leur place.

---

## 0. Les sept décisions, et ce qu'elles écartent

| Question | Décision | Ce qu'elle écarte |
|---|---|---|
| Un collaborateur, c'est quoi ? | **Un collecteur à part entière, rattaché.** Ses clients, ses cartes, sa caisse. | Le compte partagé — `caisses_jour` porte `unique (collecteur_id, date)`, donc quatre personnes sur un compte auraient **une** caisse, et un écart du soir ne désignerait plus personne. |
| Le titulaire regarde ou agit ? | **Il agit** : il encaisse, ouvre et clôture sur les clients de ses collaborateurs. | La vue en lecture seule, et le rattachement purement comptable. |
| Qui doit l'argent qu'il encaisse ? | **Lui** — la caisse suit la main qui a pris l'argent. | Faire porter à Awa un billet qui est dans la poche du titulaire. |
| La commission de la première mise ? | **Au titulaire, toujours**, quel que soit qui encaisse. Les collaborateurs sont salariés, pas commissionnés. | Le partage au propriétaire du client. **Conséquence assumée : quatre écrans qui disent « ta commission » deviennent faux pour un collaborateur** — traité au § 6. |
| Qui crée le compte ? | **Le titulaire, en autonomie**, depuis l'application. | L'extension d'`admin-creer-collecteur`, qui n'aurait demandé aucune surface neuve. |
| Que deviennent-ils au déclassement ? | **Ils se suspendent avec lui.** | Le statu quo déclaratif. **C'est la première application réelle d'un état d'abonnement dans le produit** — voir § 8. |
| La policy d'isolation ? | **Intacte.** `collecteur_id = auth.uid()` reste vrai partout, mot pour mot. Tout ce qui traverse l'équipe passe par une porte dédiée. | L'élargissement à `equipe()`, qui aurait changé le sens de **35 sites de lecture** dans l'application collecteur, en silence. |

---

## 1. Le modèle : une colonne

```sql
alter table public.collecteurs
  add column titulaire_id uuid references public.collecteurs(id) on delete restrict;

create index collecteurs_titulaire_idx
  on public.collecteurs (titulaire_id) where titulaire_id is not null;
```

`null` = titulaire, ou collecteur seul — les deux sont le même état, et c'est
voulu : un collecteur ordinaire est un titulaire sans collaborateur.

`on delete restrict` et non `cascade` : supprimer un titulaire qui a des
collaborateurs doit **échouer bruyamment**. Un `cascade` effacerait trois
comptes et leurs clients sur un clic dans l'administration.
`admin-supprimer-collecteur` devra détacher avant de supprimer, ou refuser.

`titulaire_id` **n'est pas** ajouté au `grant update (nom, telephone, zone)` :
un collecteur ne peut donc pas se rattacher lui-même par PostgREST. Le
rattachement n'existe que par la clé de service, dans l'Edge Function du § 7.

### Les bornes, par déclencheur

Une sous-requête ne passe pas dans un `check` ; c'est donc un déclencheur
`before insert or update of titulaire_id`, qui refuse cinq cas :

1. **L'auto-rattachement** — `new.titulaire_id = new.id`.
2. **La chaîne** — le titulaire visé a lui-même un `titulaire_id`. Un
   collaborateur ne recrute pas.
3. **Le titulaire d'un titulaire** — `new.id` a déjà des collaborateurs. On ne
   rattache pas quelqu'un qui en a rattaché.
4. **Le palier** — le titulaire visé n'est pas `palier = 'illimite'` avec
   `abonnement_statut = 'actif'`.
5. **Le quatrième** — le titulaire visé a déjà trois collaborateurs.

Le nombre 3 vit dans `packages/core` sous le nom `COLLABORATEURS_MAX`, et le
déclencheur porte la même valeur en dur avec un commentaire qui nomme la
constante — la base ne lit pas le TypeScript, et les deux se déplacent
ensemble ou pas du tout. `paliers.ts` gagne un champ `collaborateursInclus`
(`0` partout, `3` sur `illimite`) pour que la grille tarifaire dise la vérité
depuis la même source que le prix.

---

## 2. L'isolation ne bouge pas

**Aucune policy n'est réécrite.** `collecteur_id = (select auth.uid())` reste
la règle sur `clients`, `cartes`, `mises`, `retraits`, `caisses_jour`,
`synchro_rejets`, `avis_clients` et `avis_reglages`.

C'est la décision structurante de cette conception. Les six chemins croisés
d'`isolation.test.ts` — A ne lit pas les clients de B, n'insère pas une mise
sur une carte de B, ne modifie pas un client de B — gardent leur sens exact et
restent rouges. Les 35 sites de lecture de l'application collecteur gardent le
leur : quand `lectures-ecrans.ts:349` somme les mises du jour, il somme
toujours **les miennes**.

Deux policies sont **resserrées**, aucune n'est élargie : `clients_insert` et
`cartes_insert` gagnent la condition d'abonnement du § 8. Resserrer ne change
le sens d'aucune lecture.

Le prix de ce choix est nommé : **dépanner un coéquipier exige le réseau.**
Ma propre tournée reste hors ligne ; celle d'Awa non.

---

## 3. La vue d'équipe

```sql
create function public.equipe_vue()
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
```

**Sans paramètre**, et c'est la propriété de sûreté : la fonction lit
`auth.uid()` elle-même. Il n'existe aucune manière de demander l'équipe de
quelqu'un d'autre. Sur le modèle d'`admin_vue_globale`, qui fait déjà
exactement cela pour l'administration.

Elle rend, pour l'appelant s'il est titulaire, un objet par collaborateur :
nom, nombre de clients, nombre de cartes actives, encours, cash attendu du
jour, cash déclaré, écart, et la date de dernière déclaration. Si l'appelant
n'est pas titulaire, elle rend un tableau vide — pas une erreur : ne pas avoir
d'équipe est un état normal, pas une panne.

```sql
revoke all on function public.equipe_vue() from public, anon;
grant execute on function public.equipe_vue() to authenticated;
```

Suivi du garde-fou en `do $garde$` que portent déjà `20260823090000` et
`20260827090000` : un `revoke` oublié sur une `security definer` est
exactement le défaut qui ne se voit pas.

### La liste des clients d'un collaborateur

`equipe_vue()` rend des totaux, pas des lignes. Ouvrir la tournée d'Awa
demande une seconde fonction :

```sql
create function public.equipe_clients(p_collaborateur uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
```

Elle prend un paramètre, donc elle doit le vérifier : elle ne rend quelque
chose que si `p_collaborateur` a `titulaire_id = auth.uid()`, ou **est**
`auth.uid()`. Sinon, tableau vide — jamais une erreur qui dirait si
l'identifiant existe. Mêmes `revoke` et même garde-fou.

Elle rend, par client du collaborateur : nom, téléphone, et pour chaque carte
active son identifiant, sa mise, ses mises encaissées et son solde
restituable — de quoi peupler l'écran d'encaissement du § 10, et rien de plus.

---

## 4. Le chemin de l'argent

Deux colonnes, pour que la caisse suive la main :

```sql
alter table public.mises    add column encaisse_par uuid references public.collecteurs(id);
alter table public.retraits add column restitue_par uuid references public.collecteurs(id);

update public.mises    set encaisse_par = collecteur_id where encaisse_par is null;
update public.retraits set restitue_par = collecteur_id where restitue_par is null;

alter table public.mises    alter column encaisse_par set not null;
alter table public.retraits alter column restitue_par set not null;

create index mises_encaisse_par_idx    on public.mises    (encaisse_par, encaisse_le);
create index retraits_restitue_par_idx on public.retraits (restitue_par, effectue_le);
```

La reprise est exacte et non approximative : jusqu'à aujourd'hui, l'encaisseur
**est** le propriétaire, par construction — `mises_avant_insert` refuse la
carte d'autrui.

### Qui pose `encaisse_par`

`mises_avant_insert` décide déjà `est_commission` et `collecteur_id`, que le
client ne peut donc pas forger. `encaisse_par` s'y ajoute, avec une bascule
qui couvre les deux chemins :

```sql
new.encaisse_par := coalesce(auth.uid(), new.encaisse_par, c.collecteur_id);
```

- **Chemin ordinaire** — le collecteur encaisse sa propre carte par PostgREST.
  `auth.uid()` est son identifiant, il gagne, et rien de ce que le client
  envoie n'est lu.
- **Chemin d'équipe** — l'Edge Function du § 5 écrit sous clé de service,
  `auth.uid()` est nul, et la valeur qu'elle a posée est retenue.
- **Repli** — un chemin de service qui ne pose rien retombe sur le
  propriétaire de la carte, c'est-à-dire sur le comportement d'aujourd'hui.

`encaisse_par` **n'entre pas** dans
`grant insert (id, collecteur_id, carte_id, montant, encaisse_le) on public.mises`.
Le privilège de colonne et le `coalesce` ferment la porte deux fois.

### La caisse

```sql
create or replace function public.cash_attendu_du_jour(p_collecteur uuid, p_date date)
-- somme des mises  où encaisse_par = p_collecteur
-- moins la somme des retraits où restitue_par = p_collecteur
```

et les deux déclencheurs `caisses_rafraichir_apres_mise` /
`caisses_rafraichir_apres_retrait` rafraîchissent la ligne de `new.encaisse_par`
et `new.restitue_par`, non plus celle de `new.collecteur_id`.

**Piège de migration.** Ces trois fonctions sont `security definer` et leur
`search_path` a été durci par la migration balai
`20260830131000_search_path_pg_temp_en_dernier.sql`, qui n'en nomme aucune. Un
`create or replace` écrit sans y penser **annule ce durcissement en silence**.
Chaque redéfinition de cette migration porte donc
`set search_path = public, pg_temp` explicitement, et `search-path.test.ts` est
le filet.

`caisses_jour` reste en `auth.uid()` : **chacun déclare sa propre caisse.** Le
titulaire ne déclare pas le cash d'Awa, puisqu'il ne l'a pas en main.

---

## 5. Encaisser et clôturer pour un coéquipier

Deux Edge Functions, sur le patron exact des sept fonctions `admin-*` : jeton
de l'appelant pour l'identité, vérification, **puis seulement** la clé de
service.

### `collecteur-encaisser-pour`

1. `Authorization` absent → `401 JETON_ABSENT`.
2. `getUser()` avec le jeton de l'appelant → l'identité, jamais le corps de la
   requête.
3. Sous clé de service : lire la carte, lire son propriétaire, vérifier que le
   propriétaire est un collaborateur de l'appelant **ou l'appelant lui-même**.
   Sinon `404 CARTE_INTROUVABLE` — la même réponse que pour une carte absente,
   parce que distinguer les deux dirait si la carte existe.
4. Insérer la mise sous clé de service, avec `collecteur_id` = le propriétaire
   et `encaisse_par` = l'appelant.

**La vérification de propriété appartient entièrement à cette fonction.** Sous
clé de service `auth.uid()` est nul, donc la garde
`if auth.uid() is not null and c.collecteur_id <> auth.uid()` de
`mises_avant_insert` ne s'exécute pas. C'est déjà vrai aujourd'hui pour tout
chemin de service ; cette fonction est la première à en dépendre pour de bon.

Toutes les autres bornes de `mises_avant_insert` s'appliquent inchangées :
doublon, fenêtre de 90 jours, carte close, cycle complet, montant exact.

### `collecteur-cloturer-carte`, modifiée

Elle lit aujourd'hui la carte avec `clientAppelant`, donc sous RLS. Les
policies ne bougeant pas, le titulaire **ne verrait pas** la carte d'Awa et ne
pourrait pas la clôturer. La lecture passe donc sous clé de service, précédée
de la même vérification d'appartenance que ci-dessus, et l'insertion devient :

```ts
collecteur_id: carte.collecteur_id,   // le propriétaire — aujourd'hui : l'appelant
restitue_par: collecteurId,           // celui qui sort l'argent
```

C'est une correction en soi : la ligne actuelle écrit `collecteur_id:
collecteurId`, c'est-à-dire l'appelant. Les deux coïncident aujourd'hui ; avec
une équipe, ils divergent, et `retraits.collecteur_id` doit désigner le
propriétaire pour rester cohérent avec `mises.collecteur_id`.

---

## 6. La commission

Le bénéficiaire est `coalesce(titulaire_id, id)` du **propriétaire de la
carte**. Il se déduit, il ne se stocke pas : une colonne figée mentirait le
jour où quelqu'un est détaché de son titulaire.

`mises.est_commission` ne change pas de sens — il marque toujours la première
mise du cycle. Ce qui change, c'est à qui elle revient.

Quatre écrans annoncent aujourd'hui au collecteur que la commission est la
sienne, et deviennent faux pour un collaborateur :

| Écran | Texte actuel | Pour un collaborateur |
|---|---|---|
| `Bilan.tsx:136` | « Ta commission » + montant | **La ligne disparaît.** Un « +0 FCFA » tous les soirs pendant qu'il encaisse est pire qu'une absence. |
| `ChoixMise.tsx:183` | « La première mise est ta commission. » | « La première mise revient à ton titulaire. » |
| `Recus.tsx:106` | badge « commission » | badge « commission titulaire » |
| `Retrait.tsx:251` | « moins la première qui est ta commission » | « moins la première, qui revient à ton titulaire » |

Le Bilan du titulaire garde sa ligne, et l'écran « Mon équipe » y ajoute le
total des commissions de l'équipe — lu par `equipe_vue()`, pas par une lecture
RLS élargie.

---

## 7. La création d'un collaborateur

`collecteur-creer-collaborateur`, calquée sur `admin-creer-collecteur` dont
elle reprend le contrôle HIBP du mot de passe :

1. Jeton de l'appelant → identité.
2. Sous clé de service : l'appelant est-il `palier = 'illimite'`,
   `abonnement_statut = 'actif'`, avec moins de trois collaborateurs et sans
   `titulaire_id` ? Sinon `403 ACCES_RESERVE`.
3. Validation du nom, du téléphone et de l'adresse par
   `_shared/valider-collecteur.ts` et `valider-email.ts`, déjà écrits et testés.
4. Contrôle HIBP du mot de passe proposé.
5. Création de `auth.users`. Le déclencheur `creer_collecteur_apres_signup`
   crée la ligne `collecteurs` au passage — c'est déjà ce qui se produit à
   chaque inscription, et `admin-creer-collecteur` s'appuie dessus.
6. `update public.collecteurs set titulaire_id = <appelant> where id = <neuf>`,
   sous clé de service. Le déclencheur du § 1 est la dernière barrière : si la
   fonction s'est trompée sur le palier ou sur le compte, la base refuse ici,
   et le compte reste un collecteur seul plutôt qu'un rattachement invalide.
7. Borne d'abus : `consommer_debit` sur l'empreinte de l'appelant, comme les
   deux fonctions publiques. Trois créations par heure suffisent largement
   pour un plafond de trois.

**L'ordre a une conséquence à assumer.** Si l'étape 6 échoue, le compte existe
déjà, non rattaché. La fonction rend alors `409 RATTACHEMENT_REFUSE` en
nommant le compte créé, plutôt qu'une panne muette : un `auth.users` orphelin
qu'on ne sait pas nommer est pire qu'un compte à rattacher à la main.

---

## 8. La suspension, et ce qu'elle interdit

### Elle descend

Déclencheur `after update on public.collecteurs` : quand un titulaire quitte
`abonnement_statut = 'actif'`, ou quitte `palier = 'illimite'`, ses
collaborateurs passent à `suspendu`. Le rattachement, lui, **reste** — pour
qu'un retour à Illimité les réactive sans les recréer, et pour que
l'administration voie ce qui s'est passé.

### Ce qu'elle interdit — la décision de conception

`suspendu` et `expire` interdisent **d'ouvrir une carte** et **d'ajouter un
client**. Ils n'interdisent **jamais** d'encaisser sur une carte déjà ouverte,
ni de clôturer.

Une carte ouverte est une promesse à une cliente qui paie tous les jours. La
couper au milieu du cycle punit la cliente, pas le collecteur — c'est le
raisonnement de `MISE_MAX_RESTITUABLE` dans `calcul.ts`, où le refus se pose à
l'ouverture précisément parce qu'après il est trop tard.

Deux policies sont resserrées :

```sql
-- clients_insert et cartes_insert gagnent :
and public.abonnement_ouvre_droit((select auth.uid()))
```

avec `abonnement_ouvre_droit(uuid)` en `security definer`, vraie quand
`abonnement_statut = 'actif'`.

**Portée assumée : cette borne vaut pour tous les collecteurs, pas seulement
pour les collaborateurs.** C'est la première fois que le produit applique un
état d'abonnement — `abonnement_statut` et `limiteClients` sont purement
déclaratifs aujourd'hui, et un collecteur `expire` encaisse toujours. Une règle
qui ne vaudrait que pour les collaborateurs serait plus petite à écrire et
impossible à expliquer.

`limiteClients` (20 / 50 / 150) reste hors périmètre : l'appliquer est un autre
chantier, avec sa propre question sur le sort du 51ᵉ client déjà inscrit.

---

## 9. Le chiffre d'affaires

`20260830110000_mrr_net_des_remises.sql` somme `prix` sur les collecteurs
`abonnement_statut = 'actif'`. Sans correction, un titulaire et ses trois
collaborateurs comptent quatre abonnements Illimité, et le MRR annoncé est
multiplié par quatre.

La condition gagne `and titulaire_id is null` partout où le chiffre d'affaires
se calcule. Les compteurs de population — `collecteurs_actifs`, `suspendus`,
`expires` — comptent au contraire **tout le monde** : ce sont des comptes qui
existent, et les confondre avec des abonnements est justement l'erreur qu'on
corrige.

Cette migration est `security definer` et concernée par le piège de la
migration balai. Même précaution qu'au § 4.

---

## 10. Les écrans

**Collecteur, titulaire — « Mon équipe ».** Un écran nouveau, atteignable
seulement si `titulaire_id is null` et `palier = 'illimite'`. Pour chacun des
collaborateurs : nom, clients, cartes actives, encours, caisse du soir et
écart. Une carte par collaborateur, sur le patron de `CarteCollecte` mais avec
ses propres données. Un bouton « Ajouter un collaborateur » tant qu'il en
reste moins de trois, et le compte restant écrit en clair.

**Collecteur, encaissement pour autrui.** Depuis « Mon équipe », toucher un
collaborateur ouvre sa liste de clients, lue par `equipe_clients()`. Le bouton
« Encaisser » y appelle `collecteur-encaisser-pour`. Un bandeau permanent dit
de qui sont ces clients, et l'absence de réseau désactive le bouton avec la
raison écrite — pas un échec silencieux.

**Collecteur, collaborateur.** Rien de neuf, sauf les quatre textes du § 6 et
la mention de son titulaire sur l'écran de profil.

**Administration.** La vue globale montre le rattachement — un collaborateur
apparaît sous son titulaire, et le MRR ne le compte pas.

---

## 11. Les tests

**Base (`supabase/tests/`)**

Un fichier neuf, `collaborateurs.test.ts` :

- le rattachement pose `titulaire_id` ;
- le quatrième collaborateur est refusé ;
- la chaîne est refusée — un collaborateur ne peut pas en rattacher ;
- un titulaire au palier `pro` ne peut rien rattacher ;
- l'auto-rattachement est refusé ;
- supprimer un titulaire qui a des collaborateurs échoue ;
- `equipe_vue()` appelée par un collaborateur rend un tableau vide ;
- `equipe_vue()` appelée par un titulaire ne rend que **son** équipe ;
- `equipe_vue()` est refusée à `anon` ;
- `equipe_clients()` rend vide quand l'identifiant demandé n'est pas de
  l'équipe de l'appelant — y compris pour un identifiant qui existe bel et
  bien ailleurs, ce qui est le cas qui compte ;
- `equipe_clients()` est refusée à `anon` ;
- la suspension descend sur les trois ;
- un collecteur suspendu n'ouvre pas de carte et n'ajoute pas de client ;
- un collecteur suspendu **encaisse** toujours sur une carte ouverte ;
- le MRR compte un abonnement pour quatre comptes actifs.

`isolation.test.ts` gagne trois cas et n'en perd aucun :

- un titulaire ne lit **pas** les clients de son collaborateur par PostgREST —
  la policy n'a pas bougé, et c'est ce qu'on vérifie ;
- un collaborateur ne lit pas les données d'un autre collaborateur ;
- `encaisse_par` ne peut pas être posé par le client : une insertion qui le
  passe le voit écrasé par `auth.uid()`.

`cash-equipe.test.ts` : le titulaire encaisse sur une carte d'Awa ; le cash
attendu du titulaire monte du montant, celui d'Awa ne bouge pas ; à la
clôture, `retraits.collecteur_id` est Awa et `restitue_par` est le titulaire.

**Edge Functions** — les trois suivent le patron de `super-admin-*` :
sans jeton `401`, avec un jeton non titulaire `403`, carte hors équipe `404`,
et le cas nominal.

**Applications** — `equipe_vue()` mockée : l'écran « Mon équipe » n'apparaît
pas pour un non-titulaire ; le bouton « Ajouter » disparaît à trois ; les
quatre textes de commission changent selon `titulaire_id`.

---

## 12. Ce qu'on ne fait pas

- **Aucune table `organisations`.** L'arbitrage du 2026-08-20 inscrit dans
  `paliers.ts` tient : le client payant reste un collecteur, et le prix reste
  par collecteur.
- **Aucun transfert de client** entre collaborateurs. Le jour où quelqu'un
  part, c'est une question d'administration, pas un bouton dans l'application.
- **Aucune trace des remises d'argent** entre le titulaire et ses
  collaborateurs. La caisse suit la main ; ce qui se passe entre deux poches
  se règle hors du système, comme aujourd'hui entre un collecteur et sa banque.
- **Aucune application de `limiteClients`.** Hors périmètre, § 8.
- **Aucun rôle intermédiaire.** Un compte est titulaire ou collaborateur. Pas
  de « collaborateur qui peut voir l'équipe », pas de permission par écran.
