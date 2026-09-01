# Mise journalière sans plafond — dessin

**Date :** 2026-09-01
**État :** validé, prêt pour le plan

## Le problème

La mise journalière d'une carte est aujourd'hui bornée à `[500, 10 000]` FCFA.
La borne haute existe en quatre endroits — `packages/core`, deux contraintes
`CHECK`, et les messages de refus des écritures — et elle refuse un métier réel :
un commerçant qui met 50 000 FCFA par jour de côté n'a pas de carte chez Kolek.

Rien dans le produit ne justifie 10 000. C'était le palier haut du marché au
moment du socle, pas une règle. La borne basse, elle, a une raison : en dessous
de 500 FCFA la commission du collecteur ne paie pas son déplacement.

## La décision

**La borne haute disparaît. La borne basse reste.**

Le plafond servait aussi de garde-fou contre la faute de frappe — un zéro de
trop transforme 5 000 en 50 000, et **une mise ne se corrige pas** : elle est
figée à l'ouverture de la carte, et les 31 versements qui suivent en dépendent.
Ce garde-fou ne disparaît pas, il change de nature : au lieu de refuser, il
demande confirmation.

**Seuil de confirmation : 10 000 FCFA** — l'ancien plafond. Tout ce qui était
interdit hier demande aujourd'hui une confirmation ; tout ce qui passait hier
passe encore sans rien demander.

## 1. Le noyau — `packages/core/src/calcul.ts`

`MISE_MAX` disparaît en tant que refus commercial. Deux constantes le
remplacent, chacune avec un rôle distinct :

```ts
export const MISE_MIN = 500;

/** Au-delà, l'écran demande confirmation. Ce n'est plus un refus. */
export const MISE_INHABITUELLE = 10_000;

/**
 * Ce que la colonne `integer` de Postgres sait porter. Borne physique, pas
 * commerciale : sans elle, la base refuserait avec « value out of range for
 * type integer », que le collecteur ne peut pas comprendre.
 */
export const MISE_MAX_STOCKABLE = 2_147_483_647;

export function validerMise(montant: number): boolean {
  return Number.isInteger(montant) && montant >= MISE_MIN && montant <= MISE_MAX_STOCKABLE;
}

/** Vrai pour une mise valide mais au-dessus du seuil de confirmation. */
export function miseInhabituelle(montant: number): boolean {
  return validerMise(montant) && montant > MISE_INHABITUELLE;
}
```

`MISE_MAX` cesse d'être exporté. `packages/core/src/index.ts` fait
`export * from './calcul'`, donc le retirer de `calcul.ts` suffit — aucun
fichier de barrière à modifier. Ses consommateurs — `ChoixMise.tsx` (deux
usages) et les trois gardes d'`ecritures.ts` — sont repris ci-dessous. Un
`tsc -b` échouant sur un `MISE_MAX` oublié est la vérification.

`verifierEntrees`, `soldeRestituable`, `commission`, `progression`,
`cycleComplet` et `peutEncaisser` ne changent pas : ils appellent `validerMise`,
qui s'élargit sous eux.

## 2. La base — une migration

Deux contraintes portent la borne haute :

| Table | Contrainte | Dernière définition |
|---|---|---|
| `cartes.mise` | `cartes_mise_check` | `20260815135037_socle_collecteurs.sql:43` |
| `mises.montant` | `mises_montant_borne` | `20260818010000_socle_storage_et_bornes.sql:57` |

```sql
alter table public.cartes drop constraint cartes_mise_check;
alter table public.cartes add  constraint cartes_mise_check check (mise >= 500);

alter table public.mises drop constraint mises_montant_borne;
alter table public.mises add  constraint mises_montant_borne check (montant >= 500);
```

Les noms sont conservés — le garde-fou de `20260818010000` vérifie
`mises_montant_borne` par son nom.

Élargir un `CHECK` ne réécrit aucune ligne : toutes les mises existantes sont
dans le nouvel intervalle, et Postgres valide la nouvelle contrainte par un
simple parcours. La migration ne peut pas échouer sur des données réelles.

**Ce qui ne bouge pas :** `mises_avant_insert` (qui exige `new.montant = c.mise`
sans borne propre), l'immuabilité de `mises` (`mises_immuables`), les grants
`insert`-seul de la Data API, et `retraits.montant_restitue`, dont la contrainte
`>= 0` n'a jamais eu de borne haute — une grosse carte pourra se clôturer.

## 3. Le débordement — la vraie condition du chantier

Sans cette section, le plafond ne disparaît pas : il devient un plantage. Le
produit `(mises_encaissees − 1) × mise` est calculé en `integer × integer` dans
plusieurs objets SQL. Postgres déborde à 2 147 483 647, soit une mise d'environ
**71,5 millions** sur une carte complète — bien en deçà de ce que la colonne
`mise` accepte désormais. Le message serait « integer out of range », levé
pendant un encaissement.

Trois objets à reprendre :

| Objet | Dernière définition | Ce qui déborde |
|---|---|---|
| `public.admin_vue_globale()` | `20260830110000_mrr_net_des_remises.sql:118` | `greatest(ca.mises_encaissees - 1, 0) * ca.mise as solde_restituable` |
| `public.mettre_en_file_avis()` | `20260823160000_avis_ouverture_et_administration.sql:96` | même produit, dans le texte du SMS de versement |
| `public.grouper_milliers(integer)` | `20260823140000_notifications_clients.sql:248` | signature `integer` |

Le débordement se produit **à la multiplication**, avant tout appel de fonction.
Il faut donc deux choses ensemble :

1. Couler un opérande en `bigint` sur chaque produit :
   `greatest(ca.mises_encaissees - 1, 0)::bigint * ca.mise`
2. Élargir `grouper_milliers` à un paramètre `bigint`, sinon le résultat
   `bigint` redéborde en redescendant dans la fonction.

`grouper_milliers` a quatre appelants, tous à l'intérieur de
`mettre_en_file_avis` — qui est redéfini de toute façon. Le changement de
signature ne casse rien ailleurs.

Postgres traite `grouper_milliers(integer)` et `grouper_milliers(bigint)` comme
deux fonctions distinctes : un `create or replace` sur la seconde laisserait la
première en place, et un appel avec un argument `integer` continuerait de la
choisir par correspondance exacte. **L'ordre dans la migration est donc
imposé :**

1. `drop function if exists public.grouper_milliers(integer);`
2. `create function public.grouper_milliers(valeur bigint)` — corps inchangé
3. `create or replace function public.mettre_en_file_avis()` — produit coulé en `bigint`
4. `create or replace function public.admin_vue_globale()` — produit coulé en `bigint`

L'étape 1 est sans danger même si `mettre_en_file_avis` référence encore
l'ancienne signature à ce moment-là : plpgsql résout les appels à l'exécution,
et l'étape 3 arrive dans la même transaction de migration.

Les agrégats (`sum(solde_restituable)`) ne posent pas de problème : `sum` sur
`integer` renvoie déjà `bigint` en Postgres.

## 4. La confirmation, dans `ChoixMise`

`ChoixMise` affiche déjà le cycle complet — « ça fait combien au bout ? ». La
confirmation se pose là, sous le chiffre qui la motive.

```
Montant convenu avec le client  [ 50000 ] FCFA / jour

31 jours · le client verse 1 550 000 FCFA, tu lui rends 1 500 000 FCFA.
La première mise est ta commission.

⚠ Montant inhabituel. Une mise est figée à l'ouverture de la carte
  et ne se corrige pas.
  ☐ Je confirme ce montant
```

**Règle de rétention :** tant que la case n'est pas cochée, `onChoisir` ne
remonte rien. Le parent garde le dernier montant valide et confirmé ; son bouton
d'enregistrement ne peut donc jamais partir sur une valeur non reconnue.
Changer le montant décoche la case.

Ce choix place la confirmation en **un seul endroit** pour les trois appelants —
`ActiverCarte.tsx:98`, `Clients.tsx:833` (souscription) et `FicheClient.tsx:761`
(`NouvelleCarte`) — qui ne changent pas.

Autres retouches dans le même fichier :

- L'attribut `max={MISE_MAX}` disparaît du champ. `min={MISE_MIN}` et
  `step={50}` restent.
- Le message d'erreur devient : `Au moins {formatMontant(MISE_MIN)} FCFA, sans centimes.`
- Le commentaire d'en-tête, qui affirme « la base accepte tout entier entre 500
  et 10 000 », est réécrit.
- `MISES_USUELLES = [500, 1000, 2000, 5000, 10000]` ne bouge pas. Aucun palier
  n'est **au-dessus** du seuil, donc un appui sur un palier ne demande jamais
  rien — y compris 10 000, qui est égal au seuil et non supérieur.

**Un défaut corrigé au passage :** [FicheClient.tsx:773](../../apps/collecteur/src/ecrans/FicheClient.tsx#L773)
n'inclut pas `validerMise(mise)` dans son `disabled`, contrairement aux deux
autres appelants. Aujourd'hui c'est sans conséquence ; avec la rétention, ce
serait le seul écran où un état non confirmé pourrait s'enregistrer.

## 5. Les textes de refus

Trois gardes identiques dans `apps/collecteur/src/ecritures.ts` (lignes 129, 195,
302) portent le message `La mise doit être comprise entre ${MISE_MIN} et
${MISE_MAX} FCFA.` sous le code `MISE_HORS_BORNES`. Ils deviennent :

```ts
message: `La mise doit être d'au moins ${MISE_MIN} FCFA.`
```

Le code d'erreur `MISE_HORS_BORNES` ne change pas : la borne basse existe
toujours. Les deux assertions correspondantes dans `ActiverCarte.test.tsx`
(lignes 104 et 157) suivent le nouveau texte.

## 6. Un plafond qui subsiste, et qu'on assume

`operations.cash_attendu` est un `integer` qui cumule les encaissements d'une
journée, et `operations.ecart` est une colonne **générée stockée** qui en
dépend (`20260815232256_socle_operations.sql:8,10`). Au-delà d'environ
2,1 milliards de FCFA encaissés dans une seule journée par un seul collecteur,
l'écriture échouerait.

Élargir ces colonnes obligerait à démonter et reconstruire une colonne générée
sur une table de production. C'est hors du périmètre de ce chantier. Le plafond
réel du produit passe donc de **10 000 FCFA par mise** à **~2,1 milliards de
FCFA de recette journalière par collecteur** — une limite qu'aucun usage
plausible n'atteint, mais qui est documentée ici pour ne pas être redécouverte
en production.

## 7. Tests

**`packages/core`** (`calcul.test.ts`)
- `validerMise` accepte 500, 10 000, 50 000 et 50 000 000 ; refuse 499, 1000.5,
  `NaN`, et `MISE_MAX_STOCKABLE + 1`.
- `miseInhabituelle` : faux à 10 000, vrai à 10 001, faux à 499 (invalide).
- `soldeRestituable(31, 50_000)` vaut 1 500 000 ; ne lève plus pour 10 001.
- Le test existant « refuse une mise hors des bornes 500 – 10 000 » est réécrit
  autour de la seule borne basse.

**`apps/collecteur`** (nouveau `ChoixMise.test.tsx`)
- Un montant ≤ 10 000 remonte immédiatement par `onChoisir`, sans case à cocher
  affichée.
- Un montant > 10 000 n'appelle pas `onChoisir` tant que la case n'est pas
  cochée ; l'appelle une fois cochée.
- Changer le montant après confirmation décoche et retient de nouveau.
- Un appui sur le palier 10 000 ne demande rien.

**Base** (harnais de migration existant)
- `cartes.mise = 50 000` et `mises.montant = 50 000` sont acceptés ; 499 est
  toujours refusé.
- `admin_vue_globale()` rend un `solde_restituable` juste sur une carte à
  100 000 000 de mise, au lieu de lever « integer out of range ».
- L'insertion d'une mise sur une telle carte produit un avis dont le texte
  contient le total exact.

## Ce que ce chantier ne fait pas

- Ne touche pas à l'immuabilité de `mises`.
- Ne change pas la commission (une mise, dès le premier encaissement).
- Ne change pas les 31 mises par cycle.
- Ne touche pas à la grille d'abonnement (`paliers.ts`).
- Ne touche pas aux paliers proposés dans `MISES_USUELLES`.
- N'élargit pas `operations.cash_attendu` (voir §6).
