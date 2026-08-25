# Cartes multiples — un client, plusieurs carnets, et le choix à la fin du cycle

*2026-08-25*

## Ce qu'on change, en une phrase

Un client peut détenir plusieurs cartes actives à la fois, le collecteur encaisse
sur celle qu'il désigne, et une carte arrivée au bout de son cycle ouvre un choix
— rendre l'argent, ou en ouvrir une de plus — au lieu de s'éteindre.

## Pourquoi maintenant

Le cadrage de Phase 1 posait qu'un client possède **une seule carte active**.
C'était un choix, pas un oubli, et il est écrit deux fois dans le dépôt : dans
l'index `cartes_une_active_par_client` et dans l'en-tête d'`ouvrirCarte`, qui le
défend ainsi :

> Ce n'est pas une gêne technique, c'est la règle du métier rendue inviolable :
> deux carnets ouverts en même temps sur le même client, c'est deux soldes à
> retenir, et la première dispute au moment de rendre l'argent.

L'objection est sérieuse et mérite une réponse, pas un contournement. La voici :
« deux soldes à retenir » est le problème du carnet papier. Une application n'a
pas à retenir, elle affiche. Chaque carte porte son solde, `retraits.carte_id`
est **unique** — on rend l'argent d'une carte, jamais d'un client — et l'écran
`Retrait` liste déjà des cartes, pas des personnes. Ce que le papier ne pouvait
pas tenir, la base le tient depuis le premier jour.

Le besoin, lui, est réel : un client épargne pour deux choses à deux rythmes, et
un client qui a rempli sa carte veut souvent continuer plutôt que reprendre son
argent.

---

## 1. Ce qui change en base

Une ligne :

```sql
drop index public.cartes_une_active_par_client;
```

C'est tout. Aucune colonne, aucun statut, aucune table. Les deux commentaires qui
justifiaient la contrainte — dans `socle_collecteurs.sql` et dans l'en-tête
d'`ouvrirCarte` — sont **réécrits, pas supprimés** : c'est un raisonnement qui
change de conclusion, et la nouvelle version doit porter le pourquoi, sans quoi
quelqu'un remettra l'index dans six mois.

La branche `CARTE_ACTIVE_EXISTANTE` d'`ouvrirCarte` traduisait la violation
`23505` de cet index. Elle devient inatteignable et **disparaît** : le dépôt ne
garde pas de code mort en état de veille.

### Ce qui ne change pas, et pourquoi c'est important

`mises_avant_insert` continue de refuser toute mise au-delà de 31
(`CYCLE_COMPLET`), d'imposer le montant de la carte (`MONTANT_INVALIDE`), et de
décider seul `est_commission` et `collecteur_id`. La contrainte
`cartes_client_du_meme_collecteur` reste : une carte appartient au collecteur de
son client. Les politiques RLS ne bougent pas — elles portent sur le collecteur,
jamais sur le nombre de cartes.

`est_commission := (mises_encaissees = 0)` fait de la **première mise de chaque
carte** la commission. Trois cartes ouvertes, trois commissions. C'est la règle
existante et elle reste : une carte, un cycle, une commission. C'est aussi ce qui
rend l'empilement intéressant pour le collecteur.

---

## 2. La liste des clients devient une liste de cartes

`Clients.tsx` écrase aujourd'hui les cartes dans une `Map` à une entrée par
client :

```ts
// Une seule carte active par client est garantie en base ; si une
// carte clôturée traîne à côté, l'active gagne l'affichage.
const existante = parClient.get(carte.client_id);
if (!existante || carte.statut === 'active') parClient.set(carte.client_id, carte);
```

C'est **le seul endroit du dépôt** qui replie plusieurs cartes sur un client. La
`Map` disparaît.

| | Avant | Après |
|---|---|---|
| Unité de ligne | un client | une carte, **plus** une ligne par client sans carte active |
| Sous-titre | `Mise 5 000 FCFA · 2/31` | idem, **plus la date d'ouverture** |
| Tri | nom du client | nom du client, puis ses cartes par avancement décroissant |
| Recherche | nom du client | inchangée — toutes ses cartes remontent ensemble |
| Compteur « Cartes actives » | ne peut pas dépasser le nombre de clients | le peut désormais |

**Quelles cartes obtiennent une ligne.** Sous `Tous`, seules les **cartes
actives** — pleines ou non — donnent une ligne, plus une ligne par client
n'ayant aucune carte active. Les cartes clôturées n'apparaissent que sous le
filtre `Clôturées`. Sans cette règle, un client fidèle depuis un an occuperait
douze lignes d'historique dans la liste de travail du jour.

Une ligne de client sans carte active porte son nom, son marché, et la seule
action qui a du sens : lui ouvrir une carte.

**La date d'ouverture n'est pas décorative.** Deux cartes actives d'un même client
peuvent porter le même montant — c'est autorisé, voir §6 — et deux lignes
« Mise 5 000 FCFA » identiques exposent à un encaissement sur la mauvaise carte.
Les mises sont immuables : ni `update`, ni `delete`. Une erreur de doigt n'est pas
rattrapable. La date d'ouverture est ce qui distingue les deux lignes, et l'écran
`Encaisser` — qui affiche le client, le montant, le jour X/31 et demande
« Confirmer la mise » — reste le dernier filet.

**Un filtre change de sens.** `Sans carte` valait « aucune carte, jamais ». Il
devient « **aucune carte active** » : un client dont la seule carte est clôturée y
réapparaît. C'est le filtre du geste à faire — lui ouvrir une carte — et sous
l'ancienne définition il ne servait à rien après le premier cycle.

Ouvrir une carte supplémentaire ne demande aucun écran neuf : `FicheClient`
appelle déjà `ouvrirCarte`, et n'échouait qu'à cause de l'index.

---

## 3. Le cycle complet devient un carrefour

Aujourd'hui, une carte à 31/31 est un cul-de-sac silencieux. Deux défauts, tous
deux dans la ligne client :

```ts
// La carte est pleine, et le badge annonce « À jour ». Le cycle est fini.
carte.statut === 'cloturee' ? 'Clôturée' : 'À jour'

// Au-delà de 31, le bouton s'éteint. Sans un mot.
const encaissable = carte.statut === 'active' && encaissees < MISES_PAR_CYCLE;
```

Un bouton qui meurt en silence au moment exact où le client a une décision à
prendre. On y met le choix :

| État | Badge | Actions |
|---|---|---|
| active, moins de 31 | À jour | **Encaisser** |
| active, **31/31** | **Cycle complet** | **Retirer** · **Nouvelle carte** |
| clôturée | Clôturée | — |

**Retirer** mène à `Retrait`, positionné sur cette carte. Aucun tri à écrire :
`chargerCartesCloturables` marque déjà `cycleComplet` et trie par avancement
décroissant — les cartes pleines sont en tête.

**Nouvelle carte** appelle `ouvrirCarte`, montant **prérempli à celui de la carte
pleine et modifiable**. La raison est déjà écrite dans le dépôt : « 500 FCFA en
saison creuse, 2 000 quand le commerce marche ». Le montant se reconduit par
défaut parce que c'est le cas courant, il se change parce que c'est le cas utile.

### Garder ses mises chez le collecteur — ce que la base fait déjà

La carte pleine **reste active, reste dans la liste, reste dans l'encours**
jusqu'au retrait. Ce n'est pas une nouveauté à construire : `mises_avant_insert`
refuse déjà les mises au-delà de 31 sans clôturer quoi que ce soit, et
`encoursTotal` somme `soldeRestituable` sur **toutes** les cartes actives. Rien
n'a jamais obligé un client à retirer.

Ce qui l'empêchait de continuer, c'était uniquement l'index unique — donc §1 — et
l'absence de porte de sortie à l'écran — donc §3. L'empilement à l'infini découle
des deux, sans mécanique propre.

Aucun plafond au nombre de cartes empilées.

---

## 4. La cadence : rien à faire

Le cycle est un **compte de 31 mises, pas 31 jours de calendrier**. Aucune
contrainte de date en base, aucune règle « une mise par jour », aucune pénalité
de saut. `mises.encaisse_le` accepte n'importe quel horodatage, et
`enregistrerMise` prend déjà la date en paramètre. Un client dépose quand il veut
et saute les jours qu'il veut : c'est le comportement actuel.

Une seule vérification : le seuil « dormante » de `lectures-ecrans.ts` marque les
cartes actives sans mise depuis un certain temps. C'est un signal, pas un retard.
Si son libellé accuse le client, il est renommé. Le seuil lui-même ne bouge pas.

Le sujet « antidater une mise » est **hors périmètre**, et pas par oubli : une
mise antidatée rendrait faux, rétroactivement, le rapprochement de caisse
(`caisses_jour`) d'une journée déjà clôturée. Cela demande son propre cadrage.

---

## 5. Ce qui ne bouge pas — vérifié fichier par fichier

C'est ce qui rend le chantier court. Le dépôt indexe déjà par `carte.id` presque
partout :

- `chargerFicheClient` rend **déjà** une liste de cartes triée par date d'ouverture
- `Retrait` liste **déjà** des cartes, via `chargerCartesCloturables`
- `chargerTableauCollecteur` prend **déjà** « la carte active la plus avancée »
  parmi plusieurs, et somme l'encours sur toutes
- `Bilan`, `Recus`, `Rapprochement` passent par `carte.id`
- `mises` ne porte pas de `client_id` — volontairement : la mise appartient à la
  carte, et la carte au client. Un second chemin vers le même fait serait un
  second endroit où se contredire
- Aucune politique RLS ne mentionne le nombre de cartes

---

## 6. Ce qu'on n'ajoute pas, et pourquoi

**Aucun plafond de cartes actives.** Une limite en base est une migration le jour
où un client en veut une de plus. Le collecteur décide ; l'application n'a pas
d'avis sur son métier.

**Aucune obligation de montants distincts.** Deux cartes à 5 000 FCFA pour deux
objectifs d'épargne est un cas réel. L'ambiguïté d'affichage se règle par la date
d'ouverture (§2), pas par une interdiction.

**Aucune alerte d'encours.** Un client à cinq cartes pleines à 5 000 FCFA, c'est
150 000 FCFA que le collecteur porte en espèces, et l'encours n'a pas de plafond.
Kolek ne change pas de nature pour autant — la plateforme tient un registre, pas
des fonds, et la ligne du cahier §169 reste tenue. Mais l'exposition du collecteur
grossit, et `caisses_jour` la suivra. L'écran `Alertes` existe le jour où un seuil
sera voulu ; il ne s'invente pas ici.

---

## 7. Tests

**Base** (`supabase/tests/`)

- deux cartes actives sur un même client s'insèrent sans erreur
- une carte reste refusée sur le client d'un autre collecteur —
  `cartes_client_du_meme_collecteur` tient toujours
- une mise sur la carte A ne touche pas le compteur de la carte B
- chaque carte produit sa propre commission à sa première mise
- une mise sur une carte à 31/31 lève `CYCLE_COMPLET`, la carte restant active
- ouvrir une carte pendant qu'une carte pleine reste active réussit
- l'encours somme bien les deux cartes

**Interface** (`apps/collecteur`)

- un client à deux cartes rend deux lignes, chacune avec son propre `carteId`
- un client sans carte active apparaît sous `Sans carte` même si une carte
  clôturée existe
- une carte à 31/31 affiche « Cycle complet » et deux actions, jamais un bouton
  éteint
- « Nouvelle carte » préremplit le montant de la carte pleine et le laisse
  modifiable

---

## 8. Ordre d'exécution

1. Migration : suppression de l'index, réécriture des deux commentaires
2. Tests de base — ils échouent avant la migration, ils passent après
3. `ecritures.ts` : retrait de la branche `CARTE_ACTIVE_EXISTANTE`
4. `Clients.tsx` : suppression de la `Map`, une ligne par carte, filtre `Sans
   carte` redéfini
5. `Clients.tsx` : le carrefour à 31/31
6. Vérification du libellé « dormante »
