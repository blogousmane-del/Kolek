# Historique du client — la carte comme unité

> **Décidé le 2026-09-10.** Deux dessins ont été écartés avant celui-ci, et les
> motifs de leur rejet valent plus que le dessin retenu — ils disent ce qui
> rouvrirait le sujet.

## Ce qui manque aujourd'hui

Un collecteur ne peut pas revoir le passé d'un client.

| Écran | Ce qu'il montre | Sa limite |
|---|---|---|
| `Recus` | les encaissements | **50 derniers**, tous clients confondus, rien au-delà |
| `FicheClient` → `Historique` | les cartes **clôturées** | affiché seulement si le client a plus d'une carte ; aucun mouvement d'argent |
| `Bilan`, `Rapprochement` | des agrégats du jour | pas une liste d'opérations |
| retraits | comptés dans les bilans | **aucune liste, nulle part** |

Un client conteste une mise ou un montant restitué. Le collecteur, debout au
marché, n'a rien à lui montrer passé le 50ᵉ encaissement.

## Les deux dessins écartés, et pourquoi

### Le journal continu paginé par numéros

Le premier réflexe : un flux antichronologique de tous les mouvements, avec la
bande numérotée `1 2 3 … 25001` des tableaux de bord de bureau.

**Rejeté par l'arithmétique.** Le système de design de ce dépôt impose 44 px de
cible tactile, et écrit pourquoi : « le collecteur tape debout, à une main, sur
un téléphone d'entrée de gamme, parfois sous le soleil d'un marché ». Dix
numéros coûtent alors :

```
10 numéros × 44 px  +  2 flèches × 44 px  +  11 écarts × 8 px  =  616 px
```

Un téléphone d'entrée de gamme fait 360 px — la valeur que le dépôt déclare
lui-même pour `--container-formulaire`. Le maximum qui tient est **cinq**
numéros, et il ne reste alors rien pour le total. Le motif est juste sur les
1 400 px d'où venait la maquette ; il ne se transpose pas.

### Le journal groupé par mois

Le second : un flux avec en-tête de mois collant et un sélecteur pour sauter à
un mois précis. Un historique a un axe naturel — le temps — là où un numéro de
page est arbitraire.

**Rejeté par une contradiction interne.** Le sélecteur ne peut lister que les
mois **déjà chargés**. Avec un chargement par tranches, sauter à mars 2024
obligerait à tout charger d'abord : le contrôle promettrait un pouvoir qu'il
n'a pas. Charger tout d'avance rouvrait l'autre bout du problème sur une
connexion mobile d'Abidjan.

## Le dessin retenu : la carte est l'unité

La mesure qui a tranché, prise en production le 2026-09-10 :

| | |
|---|---|
| Mises par carte | **31 au maximum** |
| Cartes par client | 7 au maximum |
| Production | 81 clients, 114 cartes, 700 mises, 17 retraits |

Le 31 n'est pas une statistique, c'est **la structure** : une carte de collecte
porte 31 cases, et le système de design en dessine la miniature. Une carte vaut
donc au plus **33 événements** — 31 mises, une ouverture, une clôture — et cette
borne ne bougera jamais.

L'historique d'un client n'est pas un flux à découper. C'est une **pile de
cartes**.

Ce que ça supprime, plutôt que contourne :

- pas de sélecteur de mois qui ne connaît que ce qu'il a chargé ;
- pas d'état « charger plus » à tenir ;
- toute requête bornée par construction, quel que soit l'âge du client ;
- l'objet de navigation est celui que le client tient dans la main.

## L'écran

`HistoriqueClient`, atteint depuis `FicheClient`.

**Niveau 1 — la pile.** Toutes les cartes du client, ouvertes et clôturées,
la plus récente en tête. Chaque ligne suit la section 4.10 du système : libellé
et méta `text-sm` grise à gauche, montant aligné à droite. Elle porte la période
(`ouverte le → clôturée le`), la mise, le compte `X/31`, le total collecté, et
son statut par **`BadgeStatut`**.

> La version actuelle dans `FicheClient` dessine sa pilule à la main, avec ses
> propres classes. La règle 4.11 dit « une seule table, dans `BadgeStatut` — la
> maquette en portait trois copies dans trois écrans ». Cet écran-ci ne
> reproduira pas la quatrième.

La pile est paginée par le composant partagé.

**Niveau 2 — la carte.** Ses 31 mises datées, plus l'ouverture, plus le retrait
qui la clôture s'il existe. Au plus 33 lignes : **aucune pagination**, et c'est
le point du dessin. Montants `positive` pour une mise, `negative` pour un
retrait, `ink` pour un événement de carte.

Tous les montants passent par `formatMontant()`. Aucune interpolation directe,
aucun rayon hors de l'échelle des jetons.

## Le composant `Pagination`, deux présentations

Un seul pouvoir — atteindre n'importe quel rang — deux rendus.

**Bureau** (`sm:` et au-delà) : la bande numérotée. Premier, dernier, courant
±2, `…` pour le reste. La fenêtre est calculée par une fonction pure et
exportée, parce que c'est là que vivent les erreurs de bornes.

**Mobile** : un `<select>` natif, « Page 3 sur 27 ». Le choix du natif est
délibéré et non un repli : le sélecteur d'Android s'ouvre en plein écran, fait
défiler mille pages sans effort, tient les 44 px sans qu'on ait à les dessiner,
reste accessible au clavier et au lecteur d'écran, et ne coûte pas un octet de
JavaScript. Son déclencheur est habillé aux jetons (`appearance-none`, bordure
`hairline`, fond `surface`, rayon de l'échelle) ; la liste reste celle du
système.

Les deux sont rendus, un seul visible — `hidden sm:flex` et `sm:hidden`. Pas de
`matchMedia`, donc pas de bogue au redimensionnement ni à l'hydratation.

**Le coût assumé, écrit pour qu'il ne surprenne personne :** jsdom n'applique
pas les requêtes média. Les deux présentations sont donc « visibles » dans les
épreuves, et chacune doit être ciblée par son `aria-label` plutôt que par un
rôle nu. C'est le prix du CSS seul, et il est plus bas que celui d'un point de
rupture en JavaScript.

## Ce que ça touche ailleurs

Six écrans utilisent déjà `Pagination` : `Clients` (collecteur), et côté admin
`EncoursSoldes`, `Collecteurs`, `Abonnements`, `Demandes`, `SuperAdmin`. Leur
contrat — `page`, `pages`, `total`, `onAller` — ne bouge pas. Ils gagnent les
numéros sans un changement chez eux.

Des épreuves de caractérisation figeront leur comportement actuel **avant** que
le composant ne change.

## Ce que ce dessin ne fait pas

Il ne donne pas un journal inter-clients. « Qu'est-ce que j'ai encaissé mardi,
tous clients confondus » reste la question de `Recus`, et son mur des 50
derniers reste entier. C'est un autre écran, un autre dessin, et le prétendre
couvert ici serait pire que se taire.

Il ne montre pas non plus les modifications de fiche — téléphone corrigé, mise
changée. Un client ne conteste jamais ça, et l'ajouter noierait ce qu'il
conteste.

## Détails levés, pour qu'ils ne s'inventent pas à l'implémentation

**Le total collecté d'une carte** vaut `mise × misesEncaissees`, rendu par
`formatMontant()`. Il n'est pas relu depuis la somme des mises : les deux
doivent concorder, et si un jour elles divergent, c'est un défaut de données que
cet écran n'a pas à masquer par un calcul complaisant.

**Le point d'entrée** remplace la section `Historique` actuelle de
`FicheClient` par une ligne qui mène au nouvel écran. La section actuelle reste
utile en résumé — elle montre les dernières cartes clôturées — mais elle cesse
d'être le seul chemin vers le passé.

**Les cas de bord de la pile :**

| Le client a | L'écran montre |
|---|---|
| 0 carte | `RienAMontrer`, comme les autres écrans vides du collecteur |
| 1 carte | la pile, avec une ligne — pas de cas particulier |
| plus de cartes qu'une page | la pagination, numéros ou sélecteur selon la largeur |

Le `cartes.length > 1` qui conditionne l'affichage actuel dans `FicheClient` ne
se transpose pas ici : un client à une seule carte a un historique, et le lui
cacher parce qu'il est court est exactement le genre de règle qui surprend le
jour où elle compte.

**Deux chantiers, un seul plan.** L'écran a besoin du composant, et le composant
n'a pas d'autre appelant nouveau. Les séparer ferait livrer l'un des deux sans
usage. Le plan les prendra dans cet ordre : le composant d'abord, sous ses
épreuves de caractérisation, puis l'écran.
