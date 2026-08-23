# Kolek — J5 : l'abonnement encaissé en Mobile Money · Spécification de conception

> Le premier euro — le premier franc — que Kolek encaisse pour lui-même.
> Date : 2026-08-22 · Statut : validé, prêt pour plan d'implémentation
> Documents parents : `Kolek Cahier de charges consolide.md` §5, §M7 · `Docs/Chariow.md` · `2026-08-15-j1-socle-design.md`

---

## 1. Pourquoi ce jalon existe

Le cahier vend un logiciel par abonnement : 0 / 2 500 / 5 000 / 10 000 FCFA par mois
et par collecteur (§9). La base sait déjà porter cet abonnement — `palier`,
`abonnement_statut`, `abonnement_echeance` vivent sur la ligne du collecteur depuis
J1. Ce qu'elle ne sait pas faire, c'est l'**encaisser** : aucune table ne garde la
trace d'un paiement, et aucun chemin ne permet à un collecteur de régler.

Le cahier §M7 nomme le geste — « encaissement en Orange Money / Wave » — et §117
nomme le canal. Chariow est un checkout hébergé qui parle à ces opérateurs :
on crée une vente par API, on redirige l'acheteur vers une page hébergée, on lit le
résultat. Kolek ne touche jamais un opérateur Mobile Money.

### 1.1 La ligne rouge réglementaire

Ce jalon encaisse **l'abonnement du collecteur, et rien d'autre.** L'épargne des
clients reste du cash manié par le collecteur, hors de la plateforme. Le cahier §169
est explicite : dès que des dépôts transiteraient par Kolek, on entre dans la
collecte de dépôts remboursables, activité réservée aux acteurs agréés par la BCEAO.

Cette spécification ne fait entrer dans la plateforme que de l'argent qui appartient
à GTCS — le prix de sa propre licence. C'est la seule catégorie de flux qui ne pose
aucune question de statut.

### 1.2 Périmètre

**Inclus**

- Un collecteur choisit un palier payant et règle depuis son téléphone.
- Le règlement pose le palier, remet l'abonnement en `actif` et repousse l'échéance.
- Trois chemins de crédit, tous idempotents, tous convergeant vers la même fonction :
  le retour de paiement, le webhook Chariow, la réconciliation à l'ouverture de
  l'application.
- Un registre des paiements, immuable, consultable par le collecteur pour ses propres
  lignes et par l'administration pour toutes.
- La dernière date et le dernier montant encaissés, visibles dans l'administration.

**Exclu**

- **Le blocage automatique à l'expiration** (cahier §276). Couper un collecteur en
  plein marché est une décision commerciale ; elle ne se prend pas dans une migration
  de paiement. L'admin continue de suspendre à la main.
- **Le plafond de clients par palier.** `limiteClients` existe dans la grille et
  n'est appliqué nulle part, ni à l'écran ni au serveur. Ce jalon ne change rien.
- Le paiement d'un abonnement **par l'administrateur** au nom d'un collecteur.
  Un seul chemin de création de vente pour commencer.
- La carte bancaire, les remises (`discount_code`), les offres à durée limitée.
  Chariow les propose ; Kolek n'en a pas l'usage aujourd'hui.
- Le remboursement. Chariow le gère dans son tableau de bord ; nous n'en lisons
  que le statut, qui bascule en `abandonne`.

### 1.3 Critère de réussite

Un collecteur en essai ouvre « Plus », choisit Pro, saisit son numéro, paie sur la
page Chariow, revient dans l'application et voit son abonnement actif jusqu'au mois
suivant. Le même paiement, rejoué par le webhook et par deux ouvertures de
l'application, ne crédite qu'une fois. Un collecteur qui ferme l'onglet après avoir
payé est crédité à sa prochaine ouverture. Les vérifications de §9 passent sur une
base reconstruite.

---

## 2. Ce qui vit chez Chariow, hors de ce dépôt

### 2.1 Trois produits, un par palier payant

Chariow débite **le prix du produit configuré dans sa boutique**. Aucun montant
custom ne passe par l'API. Il faut donc trois produits dans la boutique GTCS :

| Palier | Prix attendu | Produit Chariow |
|---|---|---|
| `standard` | 2 500 FCFA | à créer |
| `pro` | 5 000 FCFA | à créer |
| `illimite` | 10 000 FCFA | à créer |

`essai` n'a pas de produit : il est gratuit, et le proposer au paiement serait
proposer d'acheter zéro franc.

Le prix de chaque produit doit correspondre à `PALIERS[…].prix` dans
`packages/core/src/paliers.ts`. Rien ne peut le garantir depuis le code — la boutique
est chez un tiers. Le produit s'en protège autrement, en §5.4 : le montant réellement
débité est **lu dans la réponse Chariow et stocké**, et un écart avec la grille est
signalé sans bloquer le collecteur, qui n'y est pour rien.

### 2.2 Les secrets

Quatre variables d'environnement d'Edge Function. Aucune ne doit jamais atteindre un
paquet navigateur — c'est la première des quatre failles de la grille d'audit du
dépôt, et `scripts/verifier-bundles.mjs` apprendra à chercher la forme de la clé
Chariow en plus de celle de la clé de service.

| Variable | Rôle |
|---|---|
| `CHARIOW_API_URL` | Base API. Défaut `https://api.chariow.com/v1` |
| `CHARIOW_CLE_API` | Jeton porteur des appels sortants |
| `CHARIOW_PRODUITS` | JSON `{"standard":"prod_…","pro":"prod_…","illimite":"prod_…"}` |
| `CHARIOW_SECRET_WEBHOOK` | Secret comparé au `?secret=` de l'URL du webhook |

Les trois identifiants de produit tiennent dans **une seule variable JSON**, et non
trois variables séparées, pour deux raisons : la correspondance palier → produit se
lit d'un coup, et un garde-fou peut vérifier au démarrage qu'elle nomme exactement
les trois paliers payants de la grille — ni plus, ni moins. Trois variables
indépendantes rendraient l'oubli de la troisième invisible jusqu'au premier
collecteur qui choisit Illimité.

---

## 3. Le schéma

### 3.1 La table

```sql
create table public.paiements_abonnement (
  id             uuid primary key default gen_random_uuid(),
  collecteur_id  uuid not null references public.collecteurs(id) on delete restrict,
  palier         text not null check (palier in ('standard','pro','illimite')),
  statut         text not null default 'en_attente'
                   check (statut in ('en_attente','regle','echoue','abandonne')),
  fournisseur    text not null default 'chariow' check (fournisseur = 'chariow'),
  vente_id       text not null check (length(vente_id) between 1 and 128),
  montant        numeric(12,2) not null check (montant >= 0),
  devise         text   not null check (devise ~ '^[A-Z]{3}$'),
  echeance_avant date   not null,
  echeance_apres date,
  regle_le       timestamptz,
  cree_le        timestamptz not null default now(),
  constraint paiements_vente_unique unique (fournisseur, vente_id),
  constraint paiements_regle_coherent
    check ((statut = 'regle') = (regle_le is not null and echeance_apres is not null))
);

create index paiements_collecteur_idx on public.paiements_abonnement(collecteur_id, cree_le desc);
create index paiements_en_attente_idx on public.paiements_abonnement(statut) where statut = 'en_attente';
```

Six décisions qui méritent d'être défendues.

**`on delete restrict`.** Même règle que `mises` : *on ne fait pas disparaître de
l'argent encaissé en supprimant un compte.* Conséquence directe et à ne pas manquer —
`admin-supprimer-collecteur` compte aujourd'hui `mises` et `retraits` avant de
supprimer, précisément pour nommer ce qui bloque au lieu de laisser remonter une
violation de clé étrangère illisible. Il doit compter cette table aussi. Sans cette
modification, le premier collecteur ayant payé devient indélétable avec un message
que personne ne sait lire.

**`fournisseur` avec une contrainte à une seule valeur.** Elle paraît absurde
aujourd'hui — il n'y a qu'un fournisseur. Elle porte la clé d'unicité : le jour où un
second encaisseur apparaît, deux ventes peuvent partager un identifiant sans
collision. La contrainte tombera alors d'une ligne, et rien d'autre ne bougera.

**`devise` stockée, jamais figée.** Piège n°2 de la doc Chariow, et un incident réel
chez eux : une boutique en dollars, une devise figée à `XOF` dans le code, et neuf
dollars affichés « 9 F CFA ». La devise vient de `purchase.amount.currency` et de nulle
part ailleurs.

**`montant` en `numeric(12,2)`, et non en `integer` comme partout ailleurs.** Le
franc CFA n'a pas de subdivision, et `mises`, `retraits` et `caisses_jour` sont tous
en entiers pour cette raison. Mais ce montant-ci ne vient pas de nous : il vient de
`purchase.amount.value`, dont la boutique décide, et une boutique en euros ou en
dollars rendrait `9.99`. Un entier le tronquerait silencieusement à `9` — un écart de
montant fabriqué par le stockage, que le contrôle anti-fraude de §5.4 signalerait
ensuite comme une anomalie. Deux décimales coûtent moins qu'une classe de faux
positifs.

**`unique (fournisseur, vente_id)`.** C'est **cette contrainte** qui porte
l'idempotence, pas une condition dans du code. Même mécanique que
`retraits.carte_id` pour la clôture de carte : deux chemins de crédit qui courent en
même temps — le webhook et l'ouverture de l'application — se départagent en base, une
fois, sans verrou applicatif.

**`echeance_avant` / `echeance_apres`.** Le registre de ce que le paiement a
réellement acheté. C'est aussi l'historique qui manque au produit : l'en-tête de
`apps/admin/src/ecrans/Abonnements.tsx` explique que le taux de renouvellement est
incalculable, la base ne gardant que l'état courant. Ces deux colonnes le rendent
calculable — sans que ce jalon ait à l'afficher.

**`paiements_regle_coherent`.** Un paiement réglé sans date de règlement, ou sans
échéance posée, est une ligne à moitié écrite. La contrainte refuse l'état
intermédiaire plutôt que de laisser un rapport le rencontrer six mois plus tard.

### 3.2 Row Level Security

```sql
alter table public.paiements_abonnement enable row level security;

create policy paiements_select on public.paiements_abonnement
  for select using (collecteur_id = (select auth.uid()));
```

Aucune politique d'insertion, de mise à jour ni de suppression. L'absence de politique
est un refus : l'écriture devient **inexprimable via l'API**, quel que soit
l'appelant authentifié. Seules les Edge Functions à clé de service écrivent, et elles
le font par la fonction de §4.

### 3.3 Privilèges

```sql
grant select on public.paiements_abonnement to authenticated;
```

Et rien d'autre. Pas une colonne en écriture. Le garde-fou de la migration
`20260817002000` compare l'état effectif des privilèges à une liste blanche complète ;
il s'exécute à son propre rang dans la séquence, donc avant l'existence de cette
table, et n'a pas à être modifié. La migration de ce jalon porte **son propre
garde-fou**, sur le même modèle : la table doit avoir exactement `SELECT` pour
`authenticated`, rien pour `anon`, et aucune colonne écrivable.

### 3.4 Immuabilité

Un registre d'argent ne se réécrit pas. La table est protégée par un déclencheur, et
non par des privilèges, pour une raison qui compte : **RLS et les `GRANT` ne filtrent
pas `service_role`**, qui est précisément le rôle qui écrit ici. Les déclencheurs, si.

```sql
create or replace function public.paiements_immuables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'PAIEMENT_IMMUABLE';
  end if;

  -- Deux états sont définitifs : un paiement réglé et un paiement abandonné ne
  -- rebougent plus jamais.
  --
  -- `echoue` ne l'est pas, et c'est délibéré. Chariow rend « failed » à un
  -- règlement qui aboutit ensuite — la doc §5 en cite un cas réel, réglé à
  -- 20 h 04 après avoir été refusé. La fenêtre de rattrapage de §5.2 exige donc
  -- que `echoue → regle` reste possible. La refuser ici rendrait ce filet
  -- inopérant sans qu'aucun test ne le dise, puisqu'il ne se déclenche que sur
  -- un incident.
  if old.statut in ('regle', 'abandonne') then
    raise exception 'PAIEMENT_TERMINAL';
  end if;

  -- Ce qui identifie la vente ne bouge jamais, même pendant la transition.
  if new.collecteur_id <> old.collecteur_id
     or new.vente_id   <> old.vente_id
     or new.fournisseur <> old.fournisseur
     or new.palier     <> old.palier
     or new.cree_le    <> old.cree_le
     or new.echeance_avant <> old.echeance_avant then
    raise exception 'PAIEMENT_IDENTITE_FIGEE';
  end if;

  return new;
end;
$$;

create trigger paiements_immuables
  before update or delete on public.paiements_abonnement
  for each row execute function public.paiements_immuables();
```

`montant` et `devise` restent modifiables pendant la transition : Chariow est la
source de vérité du montant réellement débité, et la réconciliation le relit. Les
figer obligerait à faire confiance au montant annoncé à la création de la vente.

### 3.5 Journal d'audit

```sql
create trigger paiements_journal
  after insert or update on public.paiements_abonnement
  for each row execute function public.journaliser();
```

`journaliser()` lit `new.collecteur_id`, que cette table porte : la fonction existante
convient, sans la variante `journaliser_collecteur()` introduite le 2026-08-21 pour
les tables dont la clé primaire *est* le collecteur.

Un garde-fou en fin de migration vérifie la présence des deux déclencheurs. Un
déclencheur absent ne se voit pas — tout continue de fonctionner, simplement sans
trace, et on ne s'en aperçoit que le jour où on cherche la trace.

---

## 4. La fonction de crédit

PostgREST ne rend pas deux écritures atomiques. C'est la leçon de
`collecteur-cloturer-carte`, qui a dû accepter un état partiel entre la ligne de
retrait et la clôture de la carte. Ici, deux écritures doivent tenir ensemble — le
paiement passe à `regle`, l'abonnement du collecteur est repoussé — et un état
intermédiaire signifierait un collecteur qui a payé sans être servi.

D'où une fonction SQL, appelée en RPC par la clé de service.

```sql
create or replace function public.crediter_abonnement(
  p_paiement uuid,
  p_regle_le timestamptz,
  p_montant  integer,
  p_devise   text
)
returns table (credite boolean, echeance date)
language plpgsql
security definer
set search_path = public
as $$
declare v_paiement public.paiements_abonnement%rowtype;
        v_echeance date;
begin
  -- Le verrou et le filtre en une instruction : deux appels concurrents — le
  -- webhook et l'ouverture de l'application — ne peuvent pas lire tous les deux
  -- un paiement en attente.
  --
  -- `echoue` fait partie des états rattrapables : c'est la fenêtre de quatorze
  -- jours de §5.2. `regle` et `abandonne` sont exclus, donc un second appel sur
  -- un paiement déjà crédité ne trouve rien — l'idempotence tient ici.
  select * into v_paiement
    from public.paiements_abonnement
   where id = p_paiement and statut in ('en_attente', 'echoue')
     for update;

  if not found then
    -- Déjà crédité, ou jamais en attente. Ce n'est pas une erreur : c'est
    -- exactement ce que l'idempotence doit produire.
    return query select false, null::date;
    return;
  end if;

  -- Payer en avance prolonge ; payer en retard repart d'aujourd'hui. Sans le
  -- `greatest`, un collecteur avec soixante jours de retard paierait et
  -- resterait expiré — il aurait acheté du passé.
  select greatest(c.abonnement_echeance, current_date) + 30
    into v_echeance
    from public.collecteurs c
   where c.id = v_paiement.collecteur_id
     for update;

  update public.collecteurs
     set palier             = v_paiement.palier,
         abonnement_statut  = 'actif',
         abonnement_echeance = v_echeance
   where id = v_paiement.collecteur_id;

  update public.paiements_abonnement
     set statut         = 'regle',
         regle_le       = p_regle_le,
         montant        = p_montant,
         devise         = p_devise,
         echeance_apres = v_echeance
   where id = p_paiement;

  return query select true, v_echeance;
end;
$$;

revoke all on function public.crediter_abonnement(uuid, timestamptz, integer, text)
  from public, anon, authenticated;
grant execute on function public.crediter_abonnement(uuid, timestamptz, integer, text)
  to service_role;
```

Le `revoke` avant le `grant` n'est pas décoratif : PostgreSQL accorde `EXECUTE` à
`PUBLIC` sur toute fonction créée, et `create or replace` réattribue ces droits par
défaut sans rien dire. La migration de la vue globale porte la même paire, pour la
même raison, avec son garde-fou. Celle-ci aussi.

**Ce que la fonction ne fait pas.** Elle ne consulte pas Chariow, ne juge pas un
montant, ne décide pas si la vente est réglée. Elle applique une décision déjà prise
en amont. C'est ce découpage qui la rend testable sans réseau.

---

## 5. Les Edge Functions

Trois fonctions, un seul cœur de fulfilment. Toutes reprennent la structure des cinq
fonctions existantes : `entetesCors` par origine, portillon avant toute écriture, clé
de service sortie le plus tard possible.

### 5.1 `abonnement-payer` — créer la vente

Jeton du collecteur exigé. Origines : `ORIGINES_COLLECTEUR`.

1. `POST` seulement ; `OPTIONS` rend les en-têtes du préalable.
2. `Authorization: Bearer …` exigé, sinon 401 `JETON_ABSENT`.
3. **L'identité vient de `auth.getUser()`**, jamais du corps. Un `collecteurId` reçu
   du téléphone serait un contrôle d'accès fait par le client.
4. Le corps porte `palier`, `telephone`, `paysTelephone`, `telephoneLocal`.
   `palier` doit être l'un des trois payants — `essai` est refusé par
   `PALIER_NON_PAYANT`, un palier inconnu par `PALIER_INCONNU`.
5. La fiche du collecteur est lue **sous l'identité de l'appelant**, donc sous RLS :
   nom, téléphone, échéance courante. C'est RLS qui prouve qu'il lit la sienne.
6. Le téléphone est résolu par `resoudreTelephone` (§6). Un échec rend
   `TELEPHONE_INVALIDE` **avant** tout appel sortant.
7. **Supersession.** Les paiements `en_attente` plus anciens du même collecteur sont
   d'abord réconciliés un par un, puis marqués `abandonne`. Réconcilier avant de
   clore est la seule façon de ne pas abandonner une vente qui vient d'être réglée.
8. `POST /checkout` chez Chariow, avec le produit du palier, l'adresse et le nom du
   collecteur, `redirect_url` (§7.3) et
   `custom_metadata: { collecteurId, palier, echeanceAvant }`.
9. La réponse doit porter `data.purchase.id` **et** `data.payment.checkout_url`.
   Incomplète, on refuse : jamais de redirection en dur sur une réponse partielle.
10. Passé ce point seulement, la clé de service sort, et la ligne est insérée en
    `en_attente` avec `montant` et `devise` **lus dans `purchase.amount`**.
11. Rend `{ checkoutUrl }`. La redirection est faite par le navigateur, pas par un
    301 du serveur — le front doit pouvoir afficher une erreur au lieu de partir.

### 5.2 `abonnement-verifier` — réconcilier

Jeton exigé, mêmes origines. Sans corps.

Réconcilie tous les paiements du collecteur appelant qui sont `en_attente`, plus ceux
en `echoue` de moins de quatorze jours. Cette seconde catégorie est le filet de la
doc §5 : un règlement tardif, ou refusé à tort, est rattrapé plutôt que perdu.

Deux appelants, un seul code : le sondage de l'écran de retour, et l'ouverture de
l'application.

Rend `{ credites: n, echeance: 'AAAA-MM-JJ' | null, enAttente: n }` — de quoi
permettre à l'écran de retour de distinguer « c'est fait » de « c'est encore en
cours ».

### 5.3 `chariow-webhook` — le premier point d'entrée public

Chariow ne signe pas ses webhooks. La doc §7 pose donc le secret **dans l'URL** :

```
https://<projet>.supabase.co/functions/v1/chariow-webhook?secret=<CHARIOW_SECRET_WEBHOOK>
```

Ce qui impose, et c'est le seul assouplissement de posture de ce jalon :

```toml
[functions.chariow-webhook]
verify_jwt = false
```

`supabase/config.toml` ne contient aujourd'hui aucune section `[functions]` : les
cinq fonctions existantes exigent toutes un jeton, et rien du projet n'est joignable
sans authentification. Celle-ci le sera. Quatre garde-fous en compensation :

1. **Le secret est comparé en temps constant.** Une comparaison de chaînes JavaScript
   s'arrête au premier caractère différent et fuit la longueur du préfixe correct.
   On compare les empreintes SHA-256 des deux valeurs, octet par octet, en accumulant
   les écarts par `XOR` sans sortir de la boucle.
2. **La fonction ne crédite rien par elle-même.** Le corps du webhook n'est pas une
   preuve de paiement : il sert seulement à savoir *quelle* vente relire. La décision
   vient toujours d'un `GET /sales/{id}` chez Chariow. C'est le piège n°4 de la doc,
   et c'est ce qui rend le secret non critique — le connaître permet de déclencher une
   relecture, pas d'obtenir un abonnement.
3. **Aucun en-tête CORS.** Aucun navigateur n'appelle cette adresse ; lui accorder une
   origine serait ouvrir une porte dont personne n'a l'usage.
4. **Réponse 200 même sur un événement inconnu**, pour ne pas provoquer de vagues de
   réessais chez Chariow ; 401 sur secret invalide, sans autre détail.

Le collecteur est identifié par `custom_metadata.collecteurId`, à défaut par une
recherche du `vente_id` dans la table.

### 5.4 `_shared/chariow.ts` et `_shared/reconciliation.ts`

Deux modules **sans aucune API Deno**, donc couverts par la suite de tests du dépôt.
C'est la règle posée par `cors.ts` après le défaut du 2026-08-20 : ce qui n'est pas
testable finit par être faux.

`chariow.ts` porte le contrat HTTP et trois fonctions pures :

- **`mapperStatut(brut)`** — l'ordre des tests est la règle : `unpaid` rend
  `en_attente` **en tout premier**, puis les échecs et abandons, puis seulement les
  succès, dont `settle`. « unpaid » contient « paid » : l'ordre inverse créditerait
  une vente non payée. Et `settled` — « réglé, fonds encaissés » — **est** un
  paiement ; l'oublier a déjà coûté une vente jamais créditée chez l'auteur de la doc.
- **`resoudreTelephone(saisie)`** — §6.
- **`montantCoherent(distant, stocke)`** — tolérance de 5 %.

`reconciliation.ts` porte le cœur, appelé par les trois chemins :

1. `GET /sales/{vente_id}`. Statut non `succeeded` → on met à jour le statut local
   (`echoue`, `abandonne`) et on passe au suivant.
2. **Contrôle de montant.** Le montant distant est comparé au montant stocké à la
   création de la vente, à 5 % près. Un écart n'est pas crédité et part au journal
   sous `ANOMALIE montant — NON crédité`.
   Un second contrôle, purement informatif, compare le montant à
   `PALIERS[palier].prix` **lorsque la devise est `XOF`** — c'est celui qui détecte
   une boutique Chariow dont le prix a divergé de la grille. Il avertit, il ne bloque
   pas : le collecteur n'y est pour rien, et refuser après un débit serait le punir
   d'une erreur de configuration de GTCS.
3. **La date de règlement** vient de `settled_at`, `paid_at` ou `completed_at` selon
   ce que Chariow renvoie ; à défaut, du `cree_le` du paiement. **Jamais `now()`** —
   sinon un rattrapage inscrit une recette au mauvais jour.
4. `crediter_abonnement()` (§4) tranche l'idempotence en base.

---

## 6. Le téléphone, seul vrai piège du checkout

La quasi-totalité des échecs de création de checkout Chariow sont des `400 Invalid
phone number`. Le service attend un numéro **national** et un pays **ISO2** :

```jsonc
"phone": { "number": "0700000000"→"700000000", "country_code": "CI" }
```

Un E.164 brut dans `number` est rejeté. Un pays absent sur un numéro non africain
aussi.

**Ce que le front collecte.** Kolek n'a aucun composant de saisie de téléphone à
sélecteur de pays — il faut l'écrire, dans `packages/ui`, avec `CI` par défaut
(Abidjan est le marché du pilote). Validation par `libphonenumber-js`, et envoi des
**trois** champs : `telephone` en E.164, `paysTelephone` en ISO2, `telephoneLocal`
en national. Le front ne pré-nettoie rien lui-même — pas de retrait manuel du zéro ni
de l'indicatif ; il envoie les trois valeurs et laisse le serveur trancher.

**Ce que le serveur fait.** `resoudreTelephone` tente quatre voies, dans l'ordre, la
première qui valide gagne :

| # | Entrée | Méthode |
|---|---|---|
| 1 | `paysTelephone` + `telephoneLocal` | `libphonenumber-js`, retire le zéro national |
| 2 | `telephone` en E.164 | `libphonenumber-js`, déduit pays et national |
| 3 | `paysTelephone` + chiffres bruts | repli sans validation stricte |
| 4 | indicatifs africains en dur | dernier recours |

Un numéro ivoirien passe même sans pays, par l'étape 4. Un numéro européen — un
collecteur de la diaspora qui règle pour un proche — a besoin de l'étape 1 ou 2.

---

## 7. Les écrans

### 7.1 Application collecteur

**`Plus.tsx`** gagne un bloc « Renouveler mon abonnement ». Son en-tête affirme
aujourd'hui que l'écran ne propose aucune modification, *« `palier` et `abonnement_*`
ne le sont pas — c'est GTCS qui les fixe »*. Ce n'est plus vrai après ce jalon : le
commentaire doit changer avec le code, et dire ce qui reste vrai — le collecteur ne
*choisit* pas son échéance, il l'achète.

**`Abonnement.tsx`**, nouveau. Les trois paliers payants avec leur prix et leur
limite, le palier courant marqué, le champ téléphone à sélecteur de pays. Le paiement
est le seul geste du produit qui **exige le réseau** : `useEnLigne` existe déjà et
doit désactiver le bouton avec une phrase qui le dit, plutôt que de laisser partir un
appel qui échouera.

Au clic : appel de `abonnement-payer`, puis `window.location.assign(checkoutUrl)`.
La CSP servie n'a pas à changer — `connect-src` couvre les Edge Functions, et une
navigation de premier niveau vers Chariow n'est pas une requête `fetch`.

**`RetourPaiement.tsx`**, nouveau. Sonde `abonnement-verifier` toutes les trois
secondes, arrêt dur à soixante. Trois états : crédité (nouvelle échéance affichée),
lent (« le règlement est en cours de confirmation, ton abonnement s'activera tout
seul »), échoué. **Jamais de conclusion tirée des paramètres d'URL** : ils sont un
indice, pas une preuve.

### 7.2 Réconciliation à l'ouverture

`Coquille.tsx` appelle `abonnement-verifier` une fois au montage, sans bloquer
l'affichage et sans montrer d'erreur en cas d'échec. C'est le filet qui remplace un
cron : le carnet est l'outil de travail du collecteur, il le rouvre le lendemain
matin.

### 7.3 Le retour, sans routeur

L'application collecteur n'a **pas de routeur** : la navigation est un état dans
`Coquille`, et `netlify.toml` réécrit toute route sur `index.html`. Un
`redirect_url` pointant vers `/paiement/retour` afficherait donc l'accueil.

Le retour passe par la racine, avec un paramètre :

```
https://kolek-collecteur.netlify.app/?paiement=retour
```

Au démarrage, l'application lit `window.location.search`. Si `paiement=retour`, elle
ouvre `RetourPaiement` et **efface le paramètre** par `history.replaceState` — sans
quoi un rechargement rejouerait l'écran de retour indéfiniment.

### 7.4 Administration

`admin_vue_globale()` gagne, par collecteur, la date et le montant du dernier
paiement réglé, plus un total encaissé sur trente jours pour l'en-tête. `Abonnements.tsx`
affiche la colonne « dernier paiement ». C'est le minimum pour que GTCS voie l'argent
arriver ; le reste — historique complet, taux de renouvellement, relances — attend
un jalon qui le demande.

La fonction transmet déjà tout ce que la vue SQL produit, sans énumérer les clés :
ajouter un bloc ne demande aucune modification de l'Edge Function.

---

## 8. Ce que ce jalon change à la posture de sécurité

Quatre points, à relire à l'audit suivant.

1. **Un point d'entrée public apparaît.** `chariow-webhook` est la première fonction
   du projet joignable sans jeton. Les quatre garde-fous de §5.3 sont sa contrepartie,
   et le plus important d'entre eux est qu'elle ne peut rien créditer par elle-même.
2. **Une clé d'API tierce entre dans le système.** `CHARIOW_CLE_API` a la même valeur
   qu'une clé de service pour la boutique GTCS : elle crée des ventes et lit des
   paiements. Elle vit dans l'environnement des Edge Functions, jamais ailleurs, et
   `verifier-bundles.mjs` doit apprendre à la chercher dans les artefacts.
3. **Un appel sortant apparaît.** Les Edge Functions n'appelaient jusqu'ici que Have I
   Been Pwned, sur une adresse fixe. Chariow s'y ajoute, également sur une adresse
   fixe issue d'une variable d'environnement — jamais d'une valeur reçue d'un client.
4. **Le collecteur agit sur sa propre ligne.** Le modèle `est_admin()` des quatre
   fonctions d'administration ne s'applique pas : ici, c'est RLS qui prouve la
   propriété, comme dans `collecteur-cloturer-carte`. La clé de service ne sort
   qu'après cette preuve.

---

## 9. Vérifications

**Sans réseau, dans la suite du dépôt** (`supabase/tests/chariow.test.ts`) :

- `mapperStatut` sur `unpaid`, `settled`, `paid`, `completed`, `failed`, `cancelled`,
  `refunded`, et une valeur inconnue. Le cas `unpaid` est le test qui compte : il doit
  rendre `en_attente`, pas `regle`.
- `resoudreTelephone` sur les quatre voies, dont un numéro ivoirien sans pays et un
  numéro français sans pays — le second doit échouer proprement, pas partir sans pays.
- `montantCoherent` aux bornes de la tolérance.
- La comparaison en temps constant du secret : deux secrets de même longueur
  différant au premier caractère, et deux de longueurs différentes.

**Contre la base locale** (`supabase/tests/abonnement.test.ts`) :

- Un collecteur ne voit que ses propres paiements ; ceux d'un autre sont invisibles,
  pas refusés.
- `authenticated` ne peut ni insérer, ni modifier, ni supprimer un paiement.
- Le déclencheur d'immuabilité refuse un `delete`, refuse la modification d'un
  paiement déjà `regle` ou `abandonne`, refuse le changement de `collecteur_id`
  pendant la transition — **y compris sous la clé de service**.
- Il **autorise** en revanche `echoue → regle` : c'est la fenêtre de rattrapage, et
  elle ne se déclenche que sur incident. Sans ce test, sa disparition serait
  silencieuse.
- `crediter_abonnement` appelée deux fois sur le même paiement ne crédite qu'une fois
  et ne repousse l'échéance qu'une fois.
- La règle du `greatest` : un collecteur dont l'échéance est passée de soixante jours
  obtient `current_date + 30`, pas une date encore passée. Un collecteur à jour
  obtient son échéance courante + 30.
- `admin-supprimer-collecteur` refuse un collecteur qui a un paiement réglé.
- Les garde-fous de privilèges et de déclencheurs échouent si on retire une ligne de
  la migration.

**En production, après déploiement** — et seulement après avoir refermé l'écart de
version relevé à l'audit du 2026-08-21 :

- `chariow-webhook` sans `?secret=` rend 401.
- `abonnement-payer` sans jeton rend 401.
- Une vente réelle de bout en bout, sur le palier Standard, avec vérification que la
  ligne porte la devise de la boutique et non `XOF` en dur.

---

## 10. Ce qui reste ouvert

- **Les trois produits Chariow n'existent pas.** Ils sont à créer avant tout
  déploiement, et leurs prix doivent correspondre à la grille. Le code ne peut que
  signaler l'écart, pas l'empêcher.
- **Aucun cron.** Un collecteur qui paie puis n'ouvre plus jamais l'application n'est
  crédité que par le webhook. Si le pilote montre des paiements orphelins, la réponse
  est `pg_cron` + `pg_net` appelant `abonnement-verifier`, sans rien changer au reste :
  les trois chemins convergent déjà vers une seule fonction.
- **La devise.** Tout le raisonnement de prix du cahier est en FCFA. Si la boutique
  Chariow était configurée dans une autre devise, les montants stockés seraient justes
  mais le MRR de l'administration, calculé depuis la grille, ne le serait plus.
  Le contrôle informatif de §5.4 est là pour le faire remarquer tôt.
- **Le blocage à l'expiration** reste à concevoir. Ce jalon lui prépare le terrain :
  après lui, un collecteur a un moyen de se remettre à jour, ce qui est la condition
  pour qu'un blocage soit défendable.
