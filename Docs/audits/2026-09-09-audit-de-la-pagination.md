# Audit de la pagination d'affichage

**2026-09-09** — porte sur `93974d8` (la brique) et `e0c4d39` (le branchement sur
six listes). Auto-audit : c'est mon propre travail de la journée que je relis.

Un auto-audit a un biais connu — on ne trouve pas les défauts qu'on n'a pas su
voir en écrivant. Ce qui suit ne remplace donc pas une relecture par un tiers.
Chaque affirmation ci-dessous a été **vérifiée sur le dépôt**, et quand la
vérification n'a pas été possible, c'est dit.

---

## Ce qui tient

Vérifié, et pas seulement cru :

- **L'ordre filtrer-puis-découper** est respecté sur les six écrans, et gardé par
  un test sur chacune des trois listes qui ont une recherche. Une ligne de la
  troisième page remonte bien à la recherche.
- **Le `total` annoncé correspond à la liste réellement paginée** sur les six.
  Vérifié ligne à ligne : chaque `usePagination(X)` a son `total={X.length}`.
- **Les trois exports CSV** écrivent la liste filtrée entière, jamais la page.
  Celui de `Collecteurs` porte un test qui l'exige explicitement.
- **540 tests au vert** sur les cinq espaces, `tsc -b` propre, lint à 0, build à
  0, `verifier:bundles` sans fuite.

---

## 🟠 → ✅ A — Le focus est perdu quand la flèche se désactive

`Pagination.tsx` désactive « Suivante » à la dernière page et « Précédente » à la
première. Un utilisateur au clavier tabule jusqu'à « Suivante », appuie sur
Entrée plusieurs fois de suite ; au dernier appui, le bouton devient `disabled`.

**Dans un vrai navigateur, un élément qui reçoit `disabled` alors qu'il a le
focus perd le focus, et celui-ci retombe sur `<body>`.** L'utilisateur au clavier
se retrouve au début du document ; celui au lecteur d'écran perd sa place dans
un tableau qu'il était en train de parcourir.

**Ce que la mesure dit, et ce qu'elle ne peut pas dire.** Une sonde écrite pour
cet audit montre qu'en `jsdom`, le focus **reste** sur le bouton désactivé :

```
APRES CLIC — actif = BUTTON | aria-label = Page suivante | desactive = true
```

`jsdom` ne modélise pas ce comportement des navigateurs. **La suite de tests ne
peut donc pas voir ce défaut, ni garder sa correction.** C'est la raison pour
laquelle il faut l'écrire ici plutôt que de compter sur un test.

Touche les six listes.

### Réparé — et par un troisième chemin

L'audit proposait deux corrections ; aucune n'a été retenue. Garder les boutons
actifs laisse une flèche qui ne mène nulle part cliquable, sans rien dire au
lecteur d'écran. Déplacer le focus sur l'autre flèche est pire : l'utilisateur
qui appuie encore une fois sur Entrée, par réflexe, **repart en arrière**.

Retenu : `aria-disabled` à la place de `disabled`. L'indisponibilité est dite au
lecteur d'écran, l'élément reste dans l'ordre de tabulation, et le focus ne
bouge donc jamais. En contrepartie le navigateur ne bloque plus le clic, et le
refus passe dans le gestionnaire — un `if` par flèche, avec son test.

Les variantes Tailwind suivent : `aria-disabled:opacity-40`,
`aria-disabled:cursor-default`, `aria-disabled:hover:border-hairline/80`.
Vérifié dans le CSS bâti, pas seulement dans la source :

```
aria-disabled\:opacity-40[aria-disabled=true]
aria-disabled\:cursor-default[aria-disabled=true]
aria-disabled\:hover\:border-hairline\/80[aria-disabled=true]:hover
```

Le sélecteur vise la chaîne `"true"` ; React écrit bien `aria-disabled="false"`
sur une flèche active, donc rien ne déteint. À l'œil, rien ne change.

**Ce que les tests gardent, et ce qu'ils ne gardent pas.** Trois tests exigent
`aria-disabled` et l'absence de `disabled`, un quatrième exige que le
gestionnaire refuse le geste en bout de course. Mais `jsdom` restant aveugle à
la perte de focus, aucun d'eux ne verrait le retour du défaut si quelqu'un
remettait `disabled` **et** ajustait les tests. Ils gardent le moyen, faute de
pouvoir garder la fin — c'est écrit dans le fichier, au-dessus des tests
concernés.

## 🟠 → ✅ B — Les nombres de la pagination ne suivent pas la convention du produit

`Pagination.tsx` écrit `{total}` brut. Sur l'écran Clients, ça donne :

> Ta liste est incomplète : **1 240** clients enregistrés…  *(bandeau, ligne 545)*
>
> Page 1 sur 25 — **1240** au total  *(pagination, même écran)*

Le bandeau passe par `formatMontant`, y compris pour un simple compte de
clients — `formatMontant(totalServeur)` et `formatMontant(lignes?.length ?? 0)`.
La pagination, non. **Deux écritures du même nombre sur le même écran.**

Le voisinage n'est pas uniforme dans le dépôt : l'en-tête d'`EncoursSoldes`
écrit déjà « 500 des 1240 cartes » sans séparateur, et sur cet écran-là ma ligne
s'accordait avec sa voisine. Mais sur Clients, elle jurait.

### Réparé

Les **trois** nombres passent par `formatMontant`, pas le seul total : « Page
1240 sur 1 240 » se lirait comme deux nombres différents.

`packages/ui` dépendait déjà de `@kolek/core` — `CarteCollecte.tsx` en importe
`MISES_PAR_CYCLE` — donc l'import n'ajoute aucune dépendance.

**Le test a demandé une précaution.** Le séparateur est une espace *insécable*
(U+00A0), choisie le 2026-09-04 pour qu'un montant ne se coupe pas en deux en
bout de ligne. Or le normalisateur de Testing Library écrase l'insécable en
espace ordinaire avant de comparer : un `getByText` serait passé au vert même si
le composant écrivait une espace ordinaire — c'est-à-dire sur le défaut qu'il
doit voir. L'assertion porte donc sur `textContent`, qui est brut.

`EncoursSoldes` n'a pas été touché : son en-tête relève d'un autre sujet, et le
corriger en passant aurait mélangé deux gestes dans un commit.

## 🟡 C — Un commentaire décrit ce que le code ne fait pas

`Pagination.tsx`, cinq lignes sous `if (pages <= 1) return null;` :

> La région est montée **en permanence**, sinon le premier changement passe
> inaperçu.

Elle n'est pas montée en permanence : sur une liste d'une seule page, le
composant entier rend `null`, région comprise.

Le résultat pour l'utilisateur reste juste — dès qu'un changement de page est
possible, la région existe avant lui —, mais la phrase affirme un mécanisme que
le code n'a pas. C'est exactement la classe de défaut que les audits de ce dépôt
poursuivent ailleurs ; elle mérite le même traitement ici.

## 🟡 D — `allerA` expose plus que ce qu'il promet

```ts
return { page, pages, visibles, allerA: setDemandee };
```

`setDemandee` est un `Dispatch<SetStateAction<number>>` : le type rendu accepte
donc `allerA(p => p + 1)`. Et cet appel-là lirait `demandee`, **la page stockée
non bornée**, et non `page`, la page effectivement affichée. Après un
rétrécissement de liste, les deux diffèrent — c'est tout le sujet du crochet.

Aucun des six appelants ne s'en sert ainsi aujourd'hui, et le type de la
propriété `onAller` du composant, `(page: number) => void`, ferme la porte de ce
côté-là. Mais le crochet est exporté seul, et rien n'empêche le prochain écran
d'y passer une fonction. Un enrobage d'une ligne — `allerA: (p: number) =>
setDemandee(p)` — supprimerait le piège.

## 🟡 E — `total` est une deuxième source de vérité

Le crochet connaît déjà `elements.length` ; le composant redemande le nombre.
Les six branchements sont justes — vérifié un par un — mais rien ne l'impose :
paginer `listeFiltree` et annoncer `collecteurs.length` compilerait, passerait
les tests, et afficherait un compte qui ment.

Faire rendre `total` par le crochet fermerait la question.

## 🟢 F — Le `useMemo` du crochet ne sert à rien sur deux écrans

`Collecteurs.tsx` et `SuperAdmin.tsx` recalculent leur liste filtrée à chaque
rendu (`collecteurs.filter(…)`, sans mémoïsation). Le tableau rendu est donc
neuf à chaque fois, la dépendance `[elements, …]` change, et le `useMemo` du
crochet ne peut jamais servir son cache.

Sans conséquence sur le résultat — la tranche est recalculée, ce qui serait
arrivé de toute façon. Mais c'est un `useMemo` qui coûte sa comparaison sans
rien rendre, et qui laisse croire à une optimisation qui n'a pas lieu.

## 🟢 G — Deux régions vives sur l'écran Clients

Au-delà de cinquante clients, l'écran porte deux `role="status"` : l'annonce de
recherche et celle de la pagination. Les lecteurs d'écran les mettent en file,
donc rien ne casse. Mais taper une recherche fait changer les deux, et
l'utilisateur entend deux comptes de suite qui disent presque la même chose.

À surveiller : les tests existants qui font `getByRole('status')` sur cet écran
passent parce que leurs jeux d'essai tiennent trois clients. Un futur test à
cent clients échouerait sur « Found multiple elements ».

## 🟢 H — Traiter une demande réordonne la liste sous la page courante

`Demandes.tsx` relit tout après chaque `marquer()`, et l'ordre vient de la base :
les demandes non traitées d'abord. Marquer une demande « contactée » depuis la
page 3 la sort du bloc des non-traitées, décale toute la liste, et la page 3
montre alors d'autres demandes que celles qu'on était en train de traiter.

Le décalage existait avant la pagination — la liste se réordonnait déjà sous les
yeux. Mais une page numérotée promet une stabilité qu'un défilement ne promettait
pas, et la promesse n'est pas tenue.

## 🟢 I — Aucune épreuve sur écran étroit

`Pagination` pose un `flex justify-between` entre un texte et deux cibles de
44 px. Sur un téléphone de 320 px, « Page 12 sur 240 — 12000 au total » et les
deux flèches dépassent la largeur ; le texte passera à la ligne, ce qui est
acceptable, mais rien ne le vérifie. `jsdom` ne calcule aucune mise en page, donc
aucun test de ce dépôt ne peut le mesurer — c'est un contrôle à l'œil, sur
l'écran du collecteur, comme les autres questions de largeur.

---

## Où ça en est

**A et B sont réparés** — voir les sections « Réparé » ci-dessus. Quatre tests
ajoutés à `Pagination.test.tsx` (13 → 17), et la variante Tailwind vérifiée dans
le CSS bâti et non seulement dans la source.

**C, D, E restent ouverts.** Le commentaire de la région vive, l'enrobage
d'`allerA`, et `total` rendu par le crochet : trois petites choses dans le même
fichier, à faire ensemble.

**F à I sont des observations, pas des dettes** : elles méritent d'être écrites
pour que le prochain qui touche à ce composant les connaisse, pas d'être
corrigées.
