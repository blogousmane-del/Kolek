# Encaisser sans quitter la fiche

**Date** : 2026-08-31
**Branche** : `encaissement-inline`
**Demandeur** : GTCS

## Le constat

Sur la fiche d'un client, les cartes en cours s'étalent en rangée depuis le
2026-08-31 — on les réduit, on les agrandit, on les réordonne. Le bouton
d'encaissement, lui, est resté sous la rangée, et il ne fait qu'une chose :
quitter la fiche pour l'écran « Encaisser une mise », qui remontre la carte en
grand avec un bouton « Confirmer ».

Deux écrans pour un geste que le collecteur fait trente fois par matinée, debout,
avec le client en face. Et la carte qu'on vient de regarder disparaît au moment
précis où on décide d'encaisser dessus.

## Ce qu'on veut

Toucher une carte fait sortir son bouton d'encaissement, dans la carte. Toucher
le bouton encaisse. La fiche ne se ferme pas, les autres cartes restent à portée
de pouce.

## Décisions prises

| Question | Décision |
|---|---|
| Ordre des cartes | inchangé — tri par avancement décroissant |
| Rangée, tailles, appui long | inchangés |
| Place du bouton | **dans** la carte choisie, dans son pied |
| Écriture | différée de 6 s, annulable pendant le décompte |
| Écran « Encaisser une mise » | conservé pour l'onglet du bas et l'accueil |
| Mécanique | fente `action` dans `CarteCollecte` |

### Pourquoi l'écriture est différée

`mises` est append-only. Le trigger `mises_immuables`
(`20260815142646_socle_mises.sql`) refuse `update` et `delete`, et il est
`BEFORE`, donc il s'applique aussi aux accès par clé de service que RLS ne filtre
pas. Les privilèges Data API le redisent : `grant insert (…)`, jamais `update` ni
`delete`.

Une mise écrite ne peut donc pas être défaite. « Annuler » ne peut exister
qu'avant l'écriture — d'où les 6 s pendant lesquelles la case est remplie à
l'écran et rien n'est parti.

L'alternative — ouvrir `mises` à l'annulation par une colonne `annulee_le` —
touche le registre comptable, l'audit, les bilans et le rapprochement. Écartée.

### Pourquoi le bouton est dans la carte, et non sous la rangée

Sous la rangée, un seul bouton sert plusieurs cartes visibles ensemble, et rien
sur lui ne dit laquelle. Le liseré aidait, il ne suffisait pas : se tromper de
carte, ici, c'est encaisser sur le mauvais cycle.

Dans la carte, la question ne se pose plus. Le bouton défile avec elle, et le
bandeau d'annulation aussi — le collecteur peut aller regarder une autre carte
pendant le décompte sans perdre de vue ce qui est en train de partir.

## Architecture

Quatre pièces, une seule neuve.

| Fichier | Rôle | Nature |
|---|---|---|
| `packages/ui/src/CarteCollecte.tsx` | fente `action?: ReactNode` dans le pied | modifié |
| `packages/ui/src/CarrouselCartes.tsx` | `rendreAction?: (carte) => ReactNode`, appelée pour la seule carte choisie | modifié |
| `apps/collecteur/src/encaissement-differe.ts` | machine à états pure | **neuf** |
| `apps/collecteur/src/ecrans/FicheClient.tsx` | tient le minuteur, fournit le bouton, écrit la mise | modifié |

`packages/ui` ne connaît ni Supabase ni les montants : il reçoit un nœud React et
le pose. L'argent reste dans `apps/collecteur`, comme aujourd'hui.

### La fente

```ts
// packages/ui/src/CarteCollecte.tsx
interface Props {
  // … existant
  /** Ce que la carte porte en pied quand elle est la carte choisie. */
  action?: ReactNode;
}
```

Rendue après le bloc « Solde restituable / jours », dans le flux — la carte
grandit pour l'accueillir. Un calque posé par-dessus aurait masqué le solde, qui
est précisément ce qu'on regarde avant d'encaisser.

Elle suit les requêtes de conteneur déjà en place : sous 240 px de large, marges
et hauteur se resserrent, au même titre que le reste de la carte.

### Le passage par le carrousel

```ts
// packages/ui/src/CarrouselCartes.tsx
interface Props {
  // … existant
  /** Appelée pour la seule carte choisie. */
  rendreAction?: (carte: CarteItem) => ReactNode;
}
```

Le carrousel ne décide de rien : il sait quelle carte est choisie, il demande à
l'écran ce qu'elle doit porter.

### L'isolation des gestes

Le `li` du carrousel écoute déjà `pointerdown` — l'appui long de 350 ms qui lève
une carte — et `click`, qui la choisit. Un bouton posé à l'intérieur hérite des
deux : le toucher lèverait la carte au lieu d'encaisser.

La fente enveloppe donc son contenu dans un conteneur qui coupe `pointerdown` et
`click`. C'est le carrousel qui pose cette enveloppe, pas l'appelant : l'écran
n'a pas à connaître les gestes de la piste.

### La machine à états

`apps/collecteur/src/encaissement-differe.ts` — fonctions pures, aucun minuteur,
aucun réseau. Le minuteur et l'appel vivent dans `FicheClient` ; ce qui se décide
se teste sans horloge.

```ts
export interface EnAttente {
  carteId: string;
  mise: number;
  /** `misesEncaissees` au moment du tap. Sert à savoir quand purger. */
  base: number;
  /** Renseigné quand l'écriture a échoué. */
  echec?: string;
}

/** Ce que la carte doit montrer, une fois l'optimisme pris en compte. */
export function misesAffichees(reelles: number, attente: EnAttente | null): number;

/** L'attente a-t-elle été rattrapée par la relecture ? */
export function estRattrapee(reelles: number, attente: EnAttente): boolean;
```

## Le geste, pas à pas

```
1. tap sur une carte          -> elle se choisit (liseré, déjà en place)
                                 son pied porte « Encaisser 1 000 FCFA »
2. tap sur « Encaisser »      -> case du jour remplie à l'écran
                                 le bouton cède la place au bandeau
                                 « ✓ 1 000 FCFA — Annuler »  ▓▓▓▓░░ 6 s
                                 RIEN n'est parti en base
3a. tap « Annuler »           -> minuteur tué, case revidée, bouton revenu
3b. 6 s écoulées              -> INSERT mises, définitif
3c. fiche fermée avant 6 s    -> INSERT immédiat, puis fermeture
3d. app en arrière-plan       -> INSERT immédiat (visibilitychange)
```

Le défilement reste libre pendant le décompte.

### Le comptage optimiste

Affiché = `max(misesEncaissees, base + 1)` tant qu'une attente existe.
L'attente est purgée quand la relecture ramène `misesEncaissees > base`.

Purger dès la résolution de l'écriture ferait clignoter la case : elle se
reviderait le temps que la relecture arrive. Le compteur ne redescend jamais.

### Le second tap pendant un décompte

Il purge l'attente en cours — écriture immédiate — et en ouvre une neuve. Deux
mises le même jour sur la même carte sont acceptées par le serveur ; ce n'est pas
à cet écran de les interdire, seulement de ne pas les perdre.

## Les erreurs

**Échec d'écriture** (réseau, RLS). Le bandeau vert devient rouge, dans la carte,
avec « Réessayer ». `EnAttente.echec` est renseigné, l'attente est conservée : la
case reste remplie, parce qu'elle dit ce que le collecteur croit avoir encaissé,
et le message dit que la base ne le sait pas encore. Effacer la case ferait le
contraire des deux.

**Hors ligne.** `enregistrerMise` échoue au bout des 6 s, même traitement. Pas de
régression : l'écran actuel se comporte déjà ainsi.

**Cycle complet.** Si `misesAffichees` atteint `MISES_PAR_CYCLE`, la fente reste
vide et le bloc « Cycle terminé » existant prend le relais, inchangé.

**Fiche fermée avec une attente en échec.** L'écriture est retentée une fois à la
fermeture. Si elle échoue encore, la mise est perdue et le collecteur devra la
ressaisir — c'est le prix des 6 s, et il est borné à ces 6 s.

## Ce qui ne bouge pas

Tri par avancement, tailles Réduire/Moyen/Agrandir, appui long, points, ordre à
la main, `Encaisser.tsx` et son onglet, `Accueil.tsx`, l'écran de retrait,
l'historique, les derniers versements.

Seul le bouton pleine largeur sous le carrousel disparaît : il est remplacé par
celui de la carte.

## Tests

**`packages/ui`**

- `CarteCollecte` rend la fente quand `action` est fournie, rien sinon.
- `CarrouselCartes` n'appelle `rendreAction` que pour la carte choisie.
- Un `pointerdown` sur la fente ne lève pas la carte ; un `click` ne la choisit
  pas.

**`apps/collecteur`** — minuteurs simulés.

- `encaissement-differe.ts` : `misesAffichees` et `estRattrapee`, cas nominaux et
  bornes.
- `FicheClient` : toucher une carte fait sortir le bouton ; toucher le bouton
  n'écrit rien à 5 s et écrit à 6 s ; « Annuler » n'écrit jamais ; fermer la fiche
  à 2 s écrit tout de suite ; un échec laisse la case remplie et propose
  « Réessayer » ; le compteur ne redescend pas entre l'écriture et la relecture.
