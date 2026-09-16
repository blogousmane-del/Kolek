# Ce que l'écran dit quand il attend — conception

**Chantier C, premier volet.** Les cinq mineurs de J2b que le collecteur voit
et subit. Les huit autres — robustesse et qualité interne — attendent un second
volet.

**Contrainte absolue :** aucune perte de données, aucun geste d'argent modifié.
Ce chantier ne touche ni une écriture, ni un calcul, ni une migration. Il change
ce que l'écran montre pendant qu'il attend, et ce qu'il dit quand il échoue.

---

## 1. Le problème

Un collecteur hors ligne ouvre l'écran Retrait. Rien ne s'affiche pendant sept
secondes. Aucun message, aucune roue, rien — puis une phrase d'erreur.

La cause est dans `apps/collecteur/src/cache.ts`, fonction `useDonnees`
(lignes 156-199). Sans valeur gardée, l'effet fait `setDonnees(null)` puis lance
la requête. `postgrest-js` la retente trois fois avant d'abandonner. Pendant
toute cette attente, l'écran a `donnees = null` **et** `erreur = null` : il n'a
rien à montrer, et rien à dire.

Ce n'est pas un défaut de l'écran Retrait. `useDonnees` sert **onze écrans** :
Accueil, Alertes, Avis, Bilan, Équipe, EquipeClients, HistoriqueClient, Plus,
Rapprochement, Reçus, Retrait. Tous ont le même trou.

Deux autres écrans mentent, par des messages placés au mauvais endroit. Et deux
notes de relecture de J2b sont trop vagues pour être corrigées de confiance.

---

## 2. Périmètre

**Dans le chantier :**

Les cinq mineurs de J2b retenus, et une extension que le premier appelle :

| # | Défaut | Où | Origine |
|---|---|---|---|
| 1 | Hors ligne sans cache, l'écran reste vide ~7 s | `cache.ts` | mineur J2b |
| 2 | « Fiche introuvable » là où il faut « pas encore sur ce téléphone » | `FicheClient.tsx:136` | mineur J2b |
| 3 | L'avis rouge de session perdue reste affiché | `FicheClient.tsx:753` | mineur J2b |
| 4 | Le bandeau « Envoi en cours » ne montre aucun progrès | `Bandeaux.tsx` | mineur J2b, **à reproduire** |
| 5 | L'alerte au premier lancement | `Accueil.tsx` | mineur J2b, **à reproduire** |
| 6 | L'attente légitime (réseau lent) ne se voit pas non plus | les 11 écrans | extension du n° 1 |

Le n° 6 n'est pas un mineur de J2b. Il entre ici parce que corriger le n° 1 sans
lui laisserait le même écran vide dès que le réseau est lent au lieu d'absent :
on aurait traité la cause fréquente en laissant le symptôme intact.

**Hors chantier**, renvoyés au second volet : « Prévenir » non gardé par la file,
écriture dans la file après effacement de tournée, enfant en sursis sous
`PARENT_REFUSE`, deux onglets sur le même compte, borne `integer` de
`cash_declare`, commentaire du 42501 sous `anon`, angles morts de l'épreuve de
durabilité, commentaire faux d'`Abonnement.tsx`.

---

## 3. Architecture

**Un seul endroit décide, les écrans ne font qu'afficher.**

`useDonnees` gagne la connaissance de l'état réseau et rend un état d'attente
lisible. Aucun écran n'interroge le réseau pour décider s'il doit lire : cette
règle vaut déjà et ne doit pas se défaire, sinon onze écrans porteront onze
variantes de la même logique.

### 3.1 Couper la requête qu'on sait vouée à l'échec

Sans valeur gardée utilisable et avec `navigator.onLine === false`, `useDonnees`
pose `erreur = messageErreur` immédiatement et **ne lance pas la requête**.

**Pourquoi c'est sûr.** `packages/ui/src/Bandeaux.tsx` (lignes 70-75) écrit que
`useEnLigne` informe et ne décide de rien, parce que `navigator.onLine` ne
prouve pas qu'Internet répond. C'est vrai dans un seul sens : il **ment quand il
dit « en ligne »** — un wifi sans Internet — et **jamais quand il dit « hors
ligne »**, où l'interface réseau est baissée. On ne coupe donc que sur
l'information fiable.

**Ce qui ne change pas.** En ligne, le chemin actuel est intact : la requête
part, et un wifi menteur retombe sur les trois relances et ses sept secondes.
Une valeur gardée reste affichée quoi qu'il arrive, en ligne comme hors ligne :
une revalidation qui échoue n'efface jamais des chiffres déjà à l'écran.

### 3.2 Rendre l'attente visible

`useDonnees` expose déjà `enCours`. Les onze écrans l'ignorent. Ils afficheront
un état d'attente tant que `enCours` est vrai **et** que `donnees` est `null` —
jamais pendant une revalidation de fond, où les chiffres sont déjà là et où une
roue les ferait clignoter sans raison.

L'état d'attente est un composant unique, dans `packages/ui`, pour que les onze
écrans disent la même chose de la même façon.

### 3.3 Les messages au bon endroit

**La fiche.** `chargerFicheClient` rend `null` pour deux raisons : le client a
été supprimé, ou cette tournée n'a jamais été chargée sur ce téléphone.
`FicheClient.tsx:136` n'en dit qu'une — la mauvaise pour un collecteur hors
ligne. Le bon message existe déjà six lignes plus bas, dans le `catch` :
« Fiche indisponible sur ce téléphone. Connecte-toi une fois au réseau pour la
charger. » On distingue sur l'état réseau, et le message du `catch` devient
celui des deux cas hors ligne.

**L'avis de session.** `FicheClient.tsx:753` pose « Session perdue. Reconnecte-toi
avant de réessayer. » sans que rien ne l'efface. À reproduire avant de corriger :
si l'avis survit au retour de la session, il s'efface au premier succès suivant.

### 3.4 Ce qui sera reproduit avant d'être corrigé

Deux notes de J2b tiennent en une ligne, et le code les contredit en partie :

- **« Le bandeau *Envoi en cours* ne montre aucun progrès. »** Or
  `Bandeaux.tsx:31` affiche « Envoi en cours · N restantes ». L'hypothèse est
  que ce compte reste figé pendant l'envoi, faute d'être relu. C'est une
  hypothèse, pas un constat.
- **« L'alerte au premier lancement (`Accueil.tsx`). »** Ni quelle alerte, ni si
  elle s'affiche à tort ou manque.

**Règle :** ce qui se reproduit entre dans le chantier ; ce qui ne se reproduit
pas retourne à la liste des mineurs avec la mention « pas reproduit le
2026-09-16 ». On ne modifie pas du code sur un souvenir.

---

## 4. Épreuves

**Rouge d'abord, pour chaque correctif.** L'épreuve qui ne tombe pas avant la
correction ne prouve rien.

- `cache.test.ts` : hors ligne sans cache, l'erreur est posée **sans qu'aucune
  requête ne parte** — le chargeur ne doit pas avoir été appelé. C'est le cœur
  du chantier : on n'affirme pas « c'est plus rapide », on affirme « la requête
  n'a pas lieu ».
- `cache.test.ts` : hors ligne **avec** cache, la valeur gardée s'affiche et
  aucune erreur n'est posée.
- `cache.test.ts` : en ligne, le comportement actuel est inchangé.
- `Retrait.test.tsx` : l'état d'attente est visible tant que rien n'est lu, et
  disparaît dès que les données arrivent. C'est l'écran d'où vient le défaut ;
  les dix autres reçoivent le même composant sans épreuve propre, la règle
  vivant dans `useDonnees` et non dans chacun d'eux.
- `FicheClient.test.tsx` : hors ligne, une fiche absente dit « pas encore sur ce
  téléphone » et **non** « peut-être supprimée ».

**Les 654 épreuves du collecteur passent par ces écrans.** Certaines simulent une
coupure et attendent le comportement actuel. Elles tomberont, et c'est le signe
que le changement mord. Chacune sera relue une par une : une épreuve qui tombe
parce que le défaut est corrigé se met à jour ; une épreuve qui tombe pour une
autre raison arrête le chantier.

---

## 5. Risques

**Le risque principal est l'excès de zèle.** Couper une requête est un geste qui
peut priver un écran de données s'il est mal posé. Deux garde-fous : on ne coupe
que sur `navigator.onLine === false`, et jamais quand une valeur gardée existe.

**Aucun geste d'argent n'est touché.** Ni `mises`, ni `retraits`, ni la file, ni
le synchroniseur. Aucune migration, aucune Edge Function. La livraison ne
déploiera que le front du collecteur.

**Retour arrière :** revenir au commit précédent et redéployer. Rien à défaire
côté base.

---

## 6. Ce que ce chantier ne fait pas

- Il ne touche pas au nombre de relances de `postgrest-js`. Trois relances sur un
  réseau capricieux sont utiles ; le défaut n'est pas qu'elles existent, c'est
  qu'on les lance quand on sait qu'elles échoueront.
- Il ne change aucun libellé au-delà des deux messages nommés.
- Il n'ajoute aucune donnée, aucun champ, aucune table.
