# 2026-09-04 — Audit UI/UX : vitrine, inscription, tableaux de bord

Audit conduit avec la compétence `design-taste-frontend` (anti-slop, mode
« redesign — préserver »). Il couvre la vitrine publique, la page d'ouverture
de compte, le tableau de bord Admin et la console Super Admin.

Deux choses le distinguent des audits de sécurité du dépôt : il ne cherche pas
de faille, il cherche **ce qui trahit une page engendrée** et **ce qui coûte de
l'attention sans rien apprendre** ; et il chiffre ce qu'il peut chiffrer —
contrastes calculés, occurrences comptées, jetons recensés.

---

## Lecture du brief

> **Lecture :** produit SaaS terrain, francophone ivoirien, pour des
> collecteurs sur téléphone d'entrée de gamme et un exploitant GTCS au bureau.
> Langage « Vert Monétaire » déjà posé et cohérent. Direction : **redesign —
> préserver**, pas refonte.

Cadrans mesurés sur l'existant (et non prescrits) :

| Surface | Variance | Mouvement | Densité |
|---|---|---|---|
| Vitrine | 7 | 8 | 3 |
| Inscription | 5 | 4 | 4 |
| Admin / Super Admin | 3 | 2 | 6 |

Ces valeurs sont bonnes. Aucune recommandation ci-dessous ne les déplace : la
vitrine n'a pas besoin de plus de mouvement, l'administration n'a pas besoin de
moins de densité.

## Méthode, et ce qu'elle ne couvre pas

Tout ce qui est affirmé ici est **lu dans le code ou calculé**. Les ratios de
contraste sont calculés selon WCAG 2.1 (luminance relative), les occurrences
sont comptées par `grep`, les jetons sont recensés dans
`packages/core/src/tokens.ts`.

**Deux captures d'écran seulement** étaient disponibles (Tableau de bord Admin,
Super Admin → Sécurité). Les défauts de la vitrine sont donc établis par
lecture du code ; ceux qui demandent une vérification à l'œil sont marqués
**[à voir]**. Aucune capture n'a été inventée pour combler le trou.

---

## 1. Ce qui est déjà juste, et qu'il ne faut pas casser

Le travail des semaines précédentes a retiré la majorité des tics. Le plan
ci-dessous ne doit rien y reprendre.

- **Aucun faux écran.** Les trois artefacts de `Fonctionnalites.tsx` sont des
  micro-interfaces réelles, pas des `<div>` empilés qui imitent une capture.
  C'est le tell numéro un des pages engendrées, et il est absent.
- **Aucun chiffre inventé sur un écran de pilotage.** `CarteStat` rend la
  tendance facultative et documente pourquoi. Les « +8 % » ont été retirés.
- **Les prix viennent d'une source unique.** `PALIERS` sert la vitrine, les
  Réglages et le moteur d'abonnement. Le site ne peut pas afficher un prix qui
  n'est pas facturé.
- **Trois sur-titres pour sept sections.** La règle est « au plus un pour
  trois » : `LE PRODUIT`, `LE PROTOCOLE`, `ADHÉSION`. Exactement à la limite,
  donc conforme. Les sur-titres retirés du Hero et d'`Acces` l'ont été à raison.
- **`min-h-dvh` partout, jamais `h-screen`.** Pas de saut de mise en page sous
  Safari iOS.
- **Le mouvement est motivé et se coupe.** `prefers-reduced-motion` est honoré,
  et — la règle la plus rare — **on retire l'animation, jamais le contenu** :
  le journal s'affiche fini, le planificateur s'affiche choisi.
- **L'or n'est pas de l'or décoratif.** Le contraste `#D2B24C` sur `#0E2E1F`
  est de **7,15:1**, sur `#06140E` de **9,17:1**. La palette laiton + crème est
  normalement un réflexe d'IA ; ici elle est justifiée explicitement par la
  marque (le billet de banque) et exécutée avec un seul accent. **Ne pas la
  « corriger ».**

---

## 2. Vitrine — ce qui reste à retirer

### 2.1 · Le voyant vert qui ne mesure rien — grave

`PiedDePage.tsx:81-84` : un point `bg-positive` et la mention
`SYSTÈME OPÉRATIONNEL` en monospace majuscule espacé. Le commentaire du
fichier reconnaît que le point ne mesure rien — la CSP de la page interdit tout
appel sortant.

C'est le motif exact que la compétence interdit : une pastille d'état
décorative qui emprunte l'apparence d'une sonde. Le rendre fixe plutôt que
clignotant n'a pas réglé le problème : ce n'est pas le battement qui ment,
c'est le vert.

**Correctif.** Retirer le point et la mention. Ce qui reste — le copyright et
la phrase sur l'absence de flux d'épargne — dit déjà quelque chose de vrai.

### 2.2 · La pastille or de « FLUX EN DIRECT » — mineur

`Fonctionnalites.tsx:167-169` : même motif, dans la carte de télémétrie. Ici le
journal qui défile *fait* la démonstration ; le point n'ajoute qu'un signe
d'état sur une démonstration qui n'a pas d'état. Retirer le `<span>`, garder le
texte.

### 2.3 · Le tiret cadratin dans la copie visible — moyen

Le tiret `—` est le tell stylistique numéro un des textes engendrés, et il est
banni sans exception dans la copie visible. Occurrences dans des chaînes
rendues :

| Fichier | Ligne | Chaîne |
|---|---|---|
| `Protocole.tsx` | 36 | « Ta commission — la première mise — est déjà à part. » |
| `Inscription.tsx` | 202 | « …dès le paiement confirmé — sans attendre de rappel. » |
| `Inscription.tsx` | 372 | « …paiement confirmé — personne ne te rappellera… » |
| `Tarification.tsx` | 88 | `—` employé comme **glyphe d'interface** (fonction non incluse) |

Les commentaires de code peuvent garder leurs tirets : ils ne sont pas rendus.

**Correctif.** Deux phrases avec un point, ou une virgule, ou une parenthèse.
Pour `Tarification.tsx:88`, voir 2.4.

### 2.4 · `✓` et `—` employés comme icônes — moyen

`Tarification.tsx:88` rend `{fonction.incluse ? '✓' : '—'}` ; `Inscription.tsx:169`
rend un `✓` dans une pastille de 48 px. Ce sont des caractères typographiques
employés comme pictogrammes : leur dessin, leur chasse et leur position
verticale changent d'une police système à l'autre, et ils ne portent aucun rôle
d'accessibilité.

Le dépôt a déjà un composant `Icone` (`packages/ui/src/Icone.tsx`), employé par
la `Navbar`. La vitrine l'ignore.

**Correctif.** `<Icone nom="check" />` et un trait plein, ou rien du tout pour
l'absence.

### 2.5 · L'accroche du Hero dépasse le seuil — mineur [à voir]

`Hero.tsx:126-129` : 22 mots pour un plafond de 20, en deux phrases là où une
suffit. Le contenu est bon ; c'est la seconde phrase qui pousse.

Proposition : « Chaque mise comptée, chaque caisse rapprochée le soir, chaque
franc tracé. » (13 mots). « L'argent ne quitte jamais ta main » est déjà la
promesse de la carte 3 de `Fonctionnalites` et du manifeste — elle est dite
trois fois sur la même page.

### 2.6 · Deux gris de base qui se contredisent — moyen

`--color-canvas #F4F5F2` est un gris **froid**. `--color-paper #FBFAF6` est un
crème **chaud**. Les deux servent de fond, parfois adjacents :
`Fonctionnalites.tsx:337` pose des cartes `bg-paper` sur une section
`bg-canvas`.

Le commentaire de `Tarification.tsx:22-28` documente ce défaut exact, constaté
puis contourné à un endroit — la section a été repassée en `canvas`. Le
contournement n'a pas traité la cause : les deux jetons coexistent toujours, et
la même collision peut renaître partout ailleurs.

L'écart est de sept unités de luminance sur trois canaux : assez proche pour
passer pour un défaut de rendu, assez loin pour se voir. La règle est « une
seule palette de neutres par projet ».

**Correctif.** Décider lequel des deux est le neutre du produit, et retirer
l'autre de `tokens.ts`. Même arbitrage pour `--color-muted #EFEFEA` (chaud),
qui vit dans l'administration sur un canevas froid.

### 2.7 · Onze rayons pour cinq jetons — moyen

`tokens.ts` définit `radius-sm/md/lg/xl/pill`. La vitrine les ignore et emploie
des valeurs arbitraires :

```
19 × rounded-pill       7 × rounded-[2rem]      4 × rounded-md
 3 × rounded-[1.25rem]  2 × rounded-[1rem]      1 × rounded-[2px]
 1 × rounded-[2.75rem]  1 × rounded-[2.5rem]    1 × rounded-[2.25rem]
 1 × rounded-[1.75rem]  1 × rounded-[1.5rem]
```

Six rayons distincts entre 1 rem et 2,75 rem, sans règle qui dise lequel
s'applique à quoi. Un système de rayons existe et n'est pas employé : c'est
soit le système qui est faux, soit l'usage. Les deux ne peuvent pas être vrais.

**Correctif.** Une règle écrite — par exemple : pilule pour l'interactif,
`radius-xl` (12 px) pour les champs, une valeur « éditoriale » unique pour les
grandes surfaces de la vitrine — et un jeton par valeur retenue.

Côté administration la situation est saine (`rounded-md` et `rounded-pill` à 97
occurrences sur 111) ; il reste 14 égarés (`xl`, `lg`, `sm`, `[1.5rem]`).

---

## 3. Inscription — le formulaire échoue le contrôle de contraste

C'est le point le plus dur de l'audit, et le plus mécanique. Le contrôle
« contraste des formulaires » est obligatoire et bloquant : champs, substituts,
anneaux de focus et textes d'aide doivent tous passer WCAG AA.

Ratios calculés sur les fonds réels de la page (`#06140E` / `#0E2E1F`) :

| Élément | Classe | Ratio | Seuil | Verdict |
|---|---|---|---|---|
| Texte d'aide sous 3 champs | `text-white/30` | **2,66:1** | 4,5:1 | échec |
| Copyright du pied de page | `text-white/30` | **2,66:1** | 4,5:1 | échec |
| `SYSTÈME OPÉRATIONNEL` | `text-white/40` | **3,81:1** | 4,5:1 | échec |
| Prix des paliers | `text-white/40` | **3,81:1** | 4,5:1 | échec |
| Substitut des 5 champs | `placeholder:text-white/25` | **2,23:1** | 4,5:1 | échec |
| « Pas encore de compte » | `text-white/40` | **3,81:1** | 4,5:1 | échec |
| « J'ai déjà un compte » sur or | `text-dark-canvas/60` | **3,81:1** | 4,5:1 | échec |
| Sous-titre d'`Acces` | `text-white/50` | 4,77:1 | 4,5:1 | passe |
| Détail du `Protocole` | `text-white/60` | 6,20:1 | 4,5:1 | passe |
| Accroche du Hero | `text-white/70` | 9,45:1 | 4,5:1 | passe |

**La règle qui en sort :** sur ces deux fonds, **`white/50` est le plancher du
texte** et `white/40` celui des bordures d'éléments interactifs. Tout ce qui est
en dessous est décoratif, donc ne doit porter aucune information.

Les bordures sont traitées à part, en 3.1 : elles relèvent d'un autre seuil
(3:1) et d'un autre critère (WCAG 1.4.11).

### 3.1 · Trois bordures de commande sous le seuil — grave

WCAG 1.4.11 demande 3:1 pour la frontière d'un élément interactif. Trois
commandes de la vitrine sont en dessous, et dans les trois cas la bordure est
la **seule** frontière — il n'y a ni fond contrasté ni ombre pour la suppléer.

| Commande | Fichier | Classe | Ratio |
|---|---|---|---|
| Les cinq champs du formulaire | `Inscription.tsx:67` | `border-white/15` | **1,60:1** |
| Les quatre boutons de palier | `Inscription.tsx:330` | `border-white/10` | **1,35:1** |
| Le bouton secondaire du hero | `Hero.tsx:156` | `border-white/20` | **1,89:1** |

Le premier cas est le plus sérieux : sur un téléphone en plein soleil à
Abidjan — la condition d'usage réelle — les cinq champs du formulaire
d'ouverture n'ont pas de contour perceptible.

**Correctif.** `border-white/40` (3,58:1 sur le fond le plus clair) pour les
trois. Ne pas toucher aux filets décoratifs de cartes et de panneaux, qui
portent la même classe à une valeur plus basse : WCAG ne leur demande rien.

### 3.2 · L'anneau de focus, vérifié — conforme

Ce point a été contrôlé parce qu'une lecture intermédiaire du fichier laissait
croire à sa disparition. **Vérification faite contre `git diff` : le bloc est
bien présent**, en ajout non encore commité dans `apps/site/src/styles.css`.

Il retourne les deux couleurs de l'anneau pour le fond sombre — trait blanc
(18,85:1 sur `#06140E`) et halo `dark-canvas` — là où `base.css` pose un trait
`--color-primary #14402C` qui donnerait **1,62:1** sur le canevas sombre et
**1,26:1** sur le vert coffre, c'est-à-dire rien.

Rien à corriger. Le point reste noté : c'est la seule règle d'accessibilité de
la vitrine qui vit dans une feuille de style plutôt que dans une classe, donc
la seule qu'un scan de composants ne verrait pas passer.

---

## 4. Tableau de bord Admin — ce qui se répète, et ce qui manque

Constaté sur la capture fournie et dans `apps/admin/src/ecrans/TableauDeBord.tsx`.

### 4.1 · Deux totaux voisins qui ne s'accordent pas — grave

L'écran affiche côte à côte :

- **Total encaissé : 1 236 500 FCFA**
- **Répartition des flux : 1 278 500 FCFA**

Deux grands nombres, même graisse, même colonne visuelle, 42 000 FCFA d'écart.
Le lecteur suppose une erreur de calcul. Il n'y en a pas : la seconde somme est
`total_encaisse + restitutions` (`TableauDeBord.tsx:76`), c'est-à-dire une
addition d'entrées et de sorties.

Le défaut n'est pas arithmétique, il est conceptuel : **une barre à 100 % qui
mélange l'argent entré et l'argent sorti ne décrit aucune grandeur.** Les
pourcentages (63 % / 33 % / 3 %) sont des parts d'un total qui n'existe pas
dans le métier.

**Correctif.** Décomposer le seul total encaissé : commission du collecteur
contre épargne des clients, deux parts, somme égale au chiffre affiché
au-dessus. Les restitutions sont un flux sortant : elles vont dans leur propre
indicateur, à côté de l'encours.

### 4.2 · Les commissions comptées deux fois — moyen

`Commissions 425 500 FCFA` est une carte d'indicateur **et** un segment de la
barre de répartition, à trois centimètres de distance. Une des deux suffit.

### 4.3 · « Accès rapide » double la barre latérale — moyen

Quatre pastilles : Collecteurs, Encours, Abonnements, Ajouter. Les trois
premières sont mot pour mot des entrées de la barre latérale, visible en
permanence à gauche. La quatrième, « Ajouter », mène à `collecteurs` — **la
même destination que la première pastille**.

Une carte entière, dans la colonne de gauche du tableau de bord, pour
reproduire un menu déjà à l'écran et proposer deux fois la même porte.

**Correctif.** Retirer la carte. La place libérée sert au lot 5.

### 4.4 · Le paragraphe qui dit de regarder à droite — mineur

`TableauDeBord.tsx` : « Les mouvements récents figurent dans le volet de droite.
Les encaissements et les retraits se font sur le téléphone du collecteur. »

La première phrase décrit un panneau visible au même instant, à 40 cm. La
seconde est une règle métier permanente, à sa place dans l'écran `Encaisser`
(qui la détaille déjà) — pas sur le tableau de bord quotidien.

### 4.5 · « Abonnements à échoir : 7 dans les 30 jours » — moyen

Sur 8 collecteurs inscrits dont 7 actifs, l'indicateur affiche 7. Il affichera 7
tant que les abonnements seront mensuels : **il vaut structurellement le nombre
de collecteurs actifs.** Un indicateur qui ne varie pas n'informe pas.

Et il n'ouvre sur rien : pas de liste, pas de relance, pas de tri.

**Correctif.** Le remplacer par ce qui est réellement rare et coûteux :
« Échéances dépassées » et « Abonnements suspendus », avec le clic qui mène à
la liste filtrée d'`Abonnements`.

### 4.6 · Aucune dimension de temps — grave, et c'est le fond du sujet

Chaque chiffre de l'écran est cumulé « Depuis l'ouverture ». Il n'existe ni
sélecteur de période, ni courbe, ni comparaison. Un tableau de bord de pilotage
sans axe du temps ne peut pas répondre à la seule question qu'on lui pose :
*est-ce que ça monte ?*

Le dépôt justifie ce vide en plusieurs endroits — « la base ne garde aucun
instantané du passé, donc aucune variation n'est calculable »
(`TableauDeBord.tsx`, `CarteStat.tsx`).

**Cette justification est vraie pour la moitié des chiffres, et fausse pour
l'autre.** Il faut la scinder :

- **Les stocks** — encours clients, collecteurs actifs, cartes ouvertes — sont
  des états à l'instant. Sans table d'instantanés, leur variation n'est
  effectivement pas calculable. La retenue était juste.
- **Les flux** — mises, restitutions, commissions, paiements d'abonnement,
  journées de caisse — sont des **événements horodatés**. `mises`,
  `caisses_jour.date`, `paiements_abonnement` portent tous leur date. Les
  agréger par jour ne fabrique aucun chiffre : c'est une somme sur une colonne
  qui existe.

L'évolution est donc calculable dès aujourd'hui, sans nouvelle table et sans
rien inventer — pour les flux, qui sont précisément ce que mesure la
productivité d'une tournée.

### 4.7 · Ce que la base sait et que personne ne voit — grave

Trois gisements existent en base, servent le métier, et n'apparaissent sur
aucun écran d'administration.

**a) L'écart de caisse.** `caisses_jour` porte `cash_attendu`, `cash_declare`,
et une colonne générée `ecart`, une ligne par collecteur et par jour.

C'est **la promesse centrale du produit**. La vitrine la vend mot pour mot :
« l'écart est nommé avant qu'il grossisse », « le serveur calcule ce que tu dois
avoir en main ». Le protocole en fait son acte 02.

Dans l'administration, `caisses_jour` apparaît une seule fois : comme **libellé
de comptage de lignes** dans la grille de volumes du Super Admin
(`SuperAdmin.tsx:1568`, « Journées de caisse »). Le nombre de lignes de la table
est affiché ; les écarts qu'elles contiennent ne le sont nulle part.

L'exploitant GTCS ne peut pas répondre à « quel collecteur a un écart de caisse
récurrent ? » — la question la plus importante d'un métier de collecte.

**b) Les rejets de synchronisation.** `synchro_rejets` a un index dédié sur
`where not traite`, et le commentaire de la migration est sans ambiguïté :
« l'argent a changé de main dans le monde réel, un humain doit trancher ». Le
compteur `rejets_non_traites` est affiché — dans la console **Super Admin**,
onglet Plateforme, avec un message d'alerte.

C'est une file d'attente opérationnelle quotidienne rangée derrière un accès
super administrateur, dans l'écran des statistiques de base de données. Elle
appartient au tableau de bord Admin, et elle n'y est pas.

**c) Le silence d'un collecteur.** `mouvements` porte `collecteur_id` et
`survenu_le`. « Jours depuis la dernière mise, par collecteur » est une
soustraction. Un collecteur silencieux depuis six jours est le signal
opérationnel le plus fort du métier — abandon, maladie, ou détournement — et il
n'est calculé nulle part.

### 4.8 · Les quatre couleurs de graphique ne se distinguent pas — moyen

| Paire | Ratio |
|---|---|
| `chart-blue #9FC2DA` vs `chart-slate #AEB7D6` | **1,06:1** |
| `chart-mint #B7D9BE` vs `chart-teal #7FB6A6` | **1,50:1** |
| chacune contre `surface #FFFFFF` | ~1,5:1 |

Quatre pastels à la même luminance. Dans la barre empilée et la liste « Top
zones », **la couleur est le seul encodage** : rien d'autre ne dit quel segment
est quoi. À 1,06:1, deux des quatre sont le même gris pour un daltonien, et
pour tout le monde sur un écran en plein jour.

**Correctif.** Séparer les quatre par la luminance et non par la teinte
(échelle claire vers foncée), et doubler l'encodage : le libellé et le montant
sont déjà rendus dans la liste des parts — les rapprocher visuellement du
segment, ou ajouter un motif.

---

## 5. Super Admin

### 5.1 · L'écran Sécurité est en panne — bloquant

La capture montre : *« État indisponible — Ta session ne porte pas de compte
identifiable. Reconnecte-toi. »* C'est `APPELANT_INCONNU` (`superadmin.ts:96`).

L'état d'erreur est **bien fait** — titre, cause en clair, bouton de reprise.
Ce n'est pas un défaut d'interface. Mais la console de sécurité de la
plateforme est inaccessible, et cela prime sur tout le reste de ce document.

**À traiter d'abord**, et hors de ce plan : c'est un défaut de session ou de
déploiement d'Edge Function, pas de design.

### 5.2 · « Abonnements » existe deux fois — moyen

`BarreLaterale.tsx:66` (Admin) et `:107` (Super Admin) portent le même libellé
et la même icône `credit-card`, pour deux écrans différents. Rien dans le menu
ne dit lequel fait quoi ; le seul indice est le sélecteur d'espace en haut.

Pire : dans la seule navigation Super Admin, `Abonnements` (`:107`) et
`Paiement` (`:118`) partagent **la même icône**.

**Correctif.** Renommer l'entrée Super Admin en « Facturation » ou
« Abonnements · plateforme », et donner à `Paiement` une icône distincte
(passerelle, clé).

### 5.3 · « Rafraîchir » sur les six onglets — mineur

Un bouton de rechargement manuel dans la barre haute de chacun des six écrans.
C'est le travail du navigateur, et il masque la vraie information : **de quand
datent ces chiffres.** `etat.genere_le` existe et n'est pas affiché.

**Correctif.** Remplacer le bouton par l'horodatage (« Mesuré il y a 3 min »),
cliquable pour recharger. Une seule affordance, qui porte l'information.

### 5.4 · « Plateforme » affiche des comptages de tables — moyen

`SuperAdmin.tsx:1573` rend `Object.entries(etat.volumes)` : le nombre de lignes
de chaque table, en grille. C'est de l'introspection de base de données
présentée en indicateurs de pilotage.

Deux de ces lignes sont pourtant opérationnelles et méritent mieux qu'un
comptage : `rejets_non_traites` (voir 4.7b) et `caisses_jour` (voir 4.7a).

**Correctif.** Promouvoir ces deux-là au rang de signaux, sur le tableau de bord
Admin. Ce qui reste — nombre de lignes par table — est une donnée
d'exploitation : la garder, mais derrière un repli « Détail technique ».

---

## 6. Plan d'implémentation

Six lots, ordonnés par rapport valeur/risque. Chacun est livrable seul.

### Lot 0 — Débloquer (hors design)

| # | Action | Fichier |
|---|---|---|
| 0.1 | Diagnostiquer `APPELANT_INCONNU` sur `super-admin-etat` | `supabase/functions/super-admin-etat` |

Rien d'autre ne se déploie tant que la console de sécurité est aveugle.

### Lot 1 — Accessibilité (risque nul, valeur immédiate) — **fait le 2026-09-04**

Aucun changement de mise en page, aucun changement de contenu. Uniquement des
valeurs d'opacité, et un test qui les tient.

| # | Action | Fichier | État |
|---|---|---|---|
| 1.1 | `text-white/30` vers `/55` (8 occurrences) | `Inscription.tsx`, `PiedDePage.tsx`, `Acces.tsx`, `Tarification.tsx` | fait |
| 1.2 | `text-white/40` vers `/55` (6 occurrences) | `Inscription.tsx`, `PiedDePage.tsx`, `Acces.tsx` | fait |
| 1.3 | `text-white/25` vers `/55` (2 occurrences : le substitut des champs, la pastille de fonction absente) | `Inscription.tsx:67`, `Tarification.tsx:84` | fait |
| 1.4 | `text-dark-canvas/60` vers `/75` sur la carte or | `Acces.tsx:105` | fait |
| 1.5 | Bordure des cinq champs : `border-white/15` vers `/40` | `Inscription.tsx:67` | fait |
| 1.6 | Bordure des boutons de palier : `/10` vers `/40`, survol `/25` vers `/70` | `Inscription.tsx:330` | fait |
| 1.7 | Bordure du bouton secondaire du hero : `/20` vers `/40` | `Hero.tsx:156` | fait |
| 1.8 | Le garde-fou : test qui recalcule le contraste WCAG de chaque classe | `vitrine/contraste.test.ts` | fait |

Le texte des boutons de palier non sélectionnés est passé de `/50` à `/70` en
même temps : à `/50` il passait AA de justesse (4,77:1) mais se lisait plus
faible que la bordure qui venait d'être renforcée, ce qui inversait la
hiérarchie du bouton.

**Le point 1.8 est ce qui empêche le retour.** Il ne rend pas un composant : il
lit les sources de la vitrine par `import.meta.glob` en `?raw`, extrait chaque
opacité, et recalcule le contraste réel contre les fonds pris dans `couleurs`.
Il encode donc « au moins 4,5:1 », jamais « au moins 55 % » — si le vert coffre
change, le seuil d'opacité suit tout seul.

Un test de rendu n'aurait rien vu : jsdom ne charge pas la feuille Tailwind, et
`getComputedStyle` lui rend une chaîne vide sur une classe de couleur. C'est
précisément pourquoi le défaut a vécu sur les cinq champs du formulaire sans
qu'aucune suite ne rougisse.

Validé selon la convention du dépôt — défaut réintroduit délibérément, tests
nommés observés tomber :

```
× pose tout texte blanc au-dessus de 4,5:1 sur le fond le plus clair
  + "PiedDePage.tsx · text-white/30 → 2.62:1"
× garde le bouton secondaire du hero au-dessus de 3:1
  AssertionError: expected 1.89 to be greater than or equal to 3
```

Puis restauré : `tsc -b` propre, 37 tests verts sur les 5 fichiers du site.

### Lot 2 — Retirer les tics restants de la vitrine — **fait le 2026-09-04**

| # | Action | Fichier | État |
|---|---|---|---|
| 2.1 | Supprimer le point vert et `SYSTÈME OPÉRATIONNEL` | `PiedDePage.tsx` | fait |
| 2.2 | Supprimer la pastille or de `FLUX EN DIRECT` | `Fonctionnalites.tsx` | fait |
| 2.3 | Réécrire les 3 tirets cadratins de la copie visible | `Protocole.tsx`, `Inscription.tsx` ×2 | fait |
| 2.4 | `✓`, `—` et `←` vers le composant `Icone` | `Tarification.tsx`, `Inscription.tsx` ×2 | fait |
| 2.5 | Raccourcir l'accroche du Hero à 13 mots | `Hero.tsx` | fait |
| 2.6 | Le garde-fou : test qui bannit `—` et `–` de la copie rendue | `vitrine/copie.test.ts` | fait |

**Trois précisions sur ce qui a été fait.**

Le `←` du lien « Retour à l'accueil » ne figurait pas au constat 2.4 : il a été
trouvé en le corrigeant, et c'est le même défaut — un glyphe typographique qui
tient lieu de pictogramme. Il portait en plus l'espace avant le libellé, que le
`gap-2` du conteneur dessinait déjà.

L'absence d'une fonction, dans la grille tarifaire, est devenue **un trait
plein** et non une seconde icône. Une croix se lirait « erreur » ; la ligne dit
seulement que cette formule ne comprend pas cette fonction. Le `✓` qui reste
dans `JOURNAL` (`Fonctionnalites.tsx`) n'est pas concerné : c'est de la sortie
de terminal rendue en monospace, où le caractère est à sa place.

L'accroche du hero n'a pas été coupée pour tenir un seuil. Sa seconde phrase —
« L'argent, lui, ne quitte jamais ta main » — était **dite trois fois ailleurs
sur la même page** : titre de la troisième carte du produit, thèse du
manifeste, premier argument de la grille tarifaire. Le hero ne se lit qu'une
fois, à l'arrivée ; il porte ce que rien d'autre ne porte.

**Le point 2.6 n'était pas au plan.** Ajouté pour la même raison que 1.8 : la
pastille de `FLUX EN DIRECT` avait déjà été « corrigée » le 2026-09-02 en
cessant de battre, et elle était toujours là deux jours plus tard. Un tic qu'on
retire à la main revient ; un tic qu'un test refuse ne revient pas. Le test
retire les commentaires avant de chercher — ce dépôt écrit ses raisons en prose
dans le code, et cette prose n'est pas rendue — et il contrôle que ce nettoyage
fonctionne, faute de quoi il serait faussement vert.

Validé selon la convention du dépôt, défaut réintroduit :

```
× ne contient aucun tiret cadratin
  + "Protocole.tsx:26 · 'Cycle bouclé : … Ta commission — la première mise — est déjà à part.',"
```

Puis restauré : `tsc -b` propre, **40 tests verts** sur les 6 fichiers du site,
build réussi.

### Lot 3 — Unifier les jetons — **fait le 2026-09-05**

Arbitrage retenu : **fusionner**. `paper` disparaît plutôt que de s'aligner, et
la collision devient impossible au lieu d'être atténuée. Portée : les trois
applications, `packages/core` et `packages/ui` compris.

| # | Action | Fichier | État |
|---|---|---|---|
| 3.1 | `paper` supprimé ; `muted` refroidi de `#EFEFEA` à `#EEEFEC` | `core/src/tokens.ts` | fait |
| 3.2 | La règle des rayons écrite, un rôle par jeton | `Docs/Kolek Design System.md` §3.4 | fait |
| 3.3 | Les 11 rayons arbitraires de la vitrine ramenés sur des jetons | `apps/site/src/vitrine` | fait |
| 3.4 | Deux crans ajoutés — `radius-2xl` 20 px, `radius-3xl` 32 px | `core/src/tokens.ts` | fait |
| 3.5 | Les 4 couleurs de graphique refondues en échelle de clarté | `core/src/tokens.ts` | fait |
| 3.6 | Dégradés de zone réalignés sur la nouvelle palette | `core/src/tokens.ts` | fait |
| 3.7 | `text-muted-foreground/50` à 2,07:1 corrigé, et le garde-fou étendu | `Tarification.tsx`, `contraste.test.ts` | fait |
| 3.8 | Thème régénéré et vérifié | `npm run verifier:theme` | fait |

#### Un constat de l'audit était faux : les rayons de l'administration

Le point 3.4 initial demandait de « ramener les 14 rayons égarés de
l'administration ». **Il n'y en avait aucun.** Le comptage avait pris des
usages de jetons pour du bruit. En les ouvrant un par un, une échelle
parfaitement cohérente apparaît, appliquée partout, et simplement **écrite
nulle part** :

| Valeur | Où | Rôle |
|---|---|---|
| `rounded-lg` 10 px | `Carte`, `CarteStat`, `CarteZone`, `EcranMessage` | la carte d'application |
| `rounded-xl` 12 px | `CarteCollecte`, `ActionsCarte`, `CarrouselCartes` | la carte mise en avant |
| `rounded-md` 6 px | champs, boutons, lignes | la saisie |
| `rounded-sm` 4 px | `BarreEmpilee` | le segment de jauge |
| `rounded-pill` | badges, boutons ronds, avatars | le rond |

La tâche est donc devenue : **documenter cette échelle**, et y ajouter les deux
crans qui manquaient pour que la vitrine puisse s'y ranger. C'est le sens du
3.2 et du 3.4 tels qu'ils ont été exécutés.

#### Trois défauts trouvés en chemin

**Le Design System annonçait des rayons que le produit n'a jamais employés.**
Son §3.4 donnait 8 / 12 / 16 / 24 px ; `tokens.ts` émet 4 / 6 / 10 / 12 px
depuis l'origine. Le seul document où l'on aurait pu trancher décrivait autre
chose que le code. Corrigé, avec la mention de l'écart.

**`text-muted-foreground/50` donnait 2,07:1** sur la carte blanche de la grille
tarifaire. C'est le libellé d'une fonction **non incluse** : le visiteur qui
veut savoir ce qu'une formule ne comprend pas lisait la ligne la moins lisible
de la page. Le garde-fou du lot 1 ne l'avait pas vu — il ne regardait que le
blanc et l'encre sur or. Il regarde désormais aussi le gris sur surface claire.

Le cas voisin de `NavMobile.tsx` (`text-muted-foreground/40`) a été **laissé
tel quel** : c'est une commande désactivée, et WCAG 1.4.3 les dispense
explicitement de tout seuil de contraste. La distinction n'est pas cosmétique —
un onglet indisponible doit se lire comme indisponible.

**Les quatre dégradés de zone étaient bâtis sur l'ancienne palette**, en dur.
Réalignés : sans cela, la carte de zone et la liste « Top zones », qui décrivent
les mêmes zones, auraient divergé sans que rien ne le signale.

#### Le garde-fou a puni la documentation de sa propre correction

Le contrôle du gris est passé au rouge sur `Tarification.tsx` alors que la
faute venait d'y être corrigée. La classe qu'il citait n'existait plus dans le
rendu : elle vivait dans le **commentaire écrit pour expliquer le correctif**.

`copie.test.ts` retirait les commentaires avant de chercher ; `contraste.test.ts`
non. Deux suites qui lisent les mêmes fichiers avec deux règles différentes, et
c'est la plus stricte qui a mordu la main qui documentait.

Un test qui rougit parce qu'on a expliqué sa propre correction apprend à ne
plus rien expliquer — dans un dépôt qui écrit ses raisons en prose dans le
code, c'est un coût réel. La lecture est donc devenue commune
(`sources.test-utils.ts`) : une seule règle de nettoyage pour les deux suites.

Les motifs de bordure, eux, continuent de chercher dans le fichier **brut** :
ils portent sur du code, pas sur de la copie, et le nettoyage décalerait les
lignes.

#### La nouvelle échelle de graphiques, et sa borne

Les quatre valeurs se distinguaient par la teinte seule. `chartBlue` et
`chartSlate` ne différaient que de **2,1 unités de L\***, soit 1,06:1 : dans la
barre empilée et dans « Top zones », où la couleur est le seul encodage, deux
des quatre parts étaient le même gris.

| Jeton | Avant | Après | L\* avant | L\* après |
|---|---|---|---|---|
| `chartMint` | `#B7D9BE` | `#D1E8D4` | 83,6 | 89,9 |
| `chartTeal` | `#7FB6A6` | `#9ACDBE` | 69,9 | 78,6 |
| `chartBlue` | `#9FC2DA` | `#82ACCC` | 76,7 | 68,5 |
| `chartSlate` | `#AEB7D6` | `#8D8AC0` | 74,6 | 59,6 |

Environ **10 unités de L\*** entre voisines, contre 2,1 pour la pire paire
d'avant. C'est perceptible en niveaux de gris.

**L'écart ne pouvait pas être plus grand, et il faut dire pourquoi.** Ces mêmes
jetons servent de fond aux pastilles d'`Avatar`, dont les initiales sont écrites
en `sidebar` : aucune des quatre ne peut donc descendre sous 4,5:1 contre
`#0E2E1F`. `chartSlate` y tient à 4,57:1, c'est-à-dire à la limite. Et
`chartMint` a un second métier — l'état actif de la barre latérale, le vert de
réussite sur fond sombre — qui le fixe à l'extrémité claire.

C'est un défaut de fond que ce lot n'a pas traité : **un seul jeu de jetons fait
deux métiers incompatibles**, l'encodage de données et l'identité visuelle des
personnes. Les séparer libérerait toute l'échelle pour les graphiques. À
décider séparément.

#### Ce qui reste ouvert

`hairline` / `border` valent `#E6E3DA` — R230 G227 B218, un neutre franchement
chaud, quand `canvas` et `muted` tirent maintenant au vert. C'est la même
famille de défaut que 2.6, sur le jeton le plus employé du produit : toutes les
bordures des trois applications. Non traité ici parce que l'arbitrage portait
sur les fonds, et parce que repeindre chaque bordure du produit mérite d'être
décidé, pas glissé dans un lot de jetons.


### Lot 4 — Le tableau de bord Admin : retirer

Réduire avant d'ajouter. Chaque retrait libère la place du lot 5.

| # | Action | Fichier |
|---|---|---|
| 4.1 | Supprimer la carte « Accès rapide » (double la barre latérale) | `TableauDeBord.tsx` |
| 4.2 | Supprimer le paragraphe « …volet de droite… » | `TableauDeBord.tsx` |
| 4.3 | Supprimer la carte d'indicateur `Commissions` (déjà dans la répartition) | `TableauDeBord.tsx` |
| 4.4 | Remplacer « Abonnements à échoir » par « Échéances dépassées », cliquable | `TableauDeBord.tsx` |
| 4.5 | Refonder la barre empilée sur le seul total encaissé ; sortir les restitutions | `TableauDeBord.tsx`, `BarreEmpilee.tsx` |
| 4.6 | Super Admin : « Abonnements » vers « Facturation », icône distincte pour « Paiement » | `BarreLaterale.tsx:107,118` |
| 4.7 | Super Admin : remplacer les 6 boutons « Rafraîchir » par l'horodatage `genere_le` cliquable | `SuperAdmin.tsx:259-280` |
| 4.8 | Super Admin : replier les comptages de tables sous « Détail technique » | `SuperAdmin.tsx:1573` |

### Lot 5 — Le tableau de bord Admin : activer

C'est le lot qui répond à la demande de suivi de l'évolution et de la
productivité. Il ne s'appuie que sur des colonnes existantes.

| # | Fonction | Source de données | Écran |
|---|---|---|---|
| 5.1 | **Sélecteur de période** (7 j / 30 j / 90 j) qui pilote toute la page | paramètre `depuis` sur `admin-vue-globale` | Admin |
| 5.2 | **Courbe des encaissements par jour** | `mises` groupées par date | Admin |
| 5.3 | **Écarts de caisse** : journées avec `ecart` non nul, montant cumulé, collecteurs concernés | `caisses_jour` (colonne générée `ecart`) | Admin |
| 5.4 | **Rejets de synchronisation à traiter**, avec accès à la file | `synchro_rejets where not traite` | Admin |
| 5.5 | **Collecteurs silencieux** : jours depuis la dernière mise, tri décroissant | `mises` par `collecteur_id` | Admin |
| 5.6 | **Productivité par collecteur** : mises par jour actif, clients actifs, taux de complétion des cartes | `mises`, `cartes.mises_encaissees / 31` | Admin |
| 5.7 | **Évolution du MRR** par mois | `paiements_abonnement` (horodatés) | Super Admin |

**La règle qui tient tout le lot 5 :** aucune de ces sept fonctions ne calcule
une variation de **stock**. Toutes agrègent des **événements datés**. La
retenue documentée dans `CarteStat.tsx` — ne jamais afficher une tendance que la
base ne peut pas prouver — reste entièrement en vigueur, et doit le rester pour
l'encours clients et le nombre de collecteurs actifs.

Si un jour une tendance sur les stocks est voulue, elle demande une vraie table
d'instantanés quotidiens, alimentée par `pg_cron`. C'est un autre chantier, à
décider séparément.

### Ordre d'exécution

```
Lot 0    →  Lot 1   →  Lot 2   →  Lot 3    →  Lot 4     →  Lot 5
débloque    a11y       tics       jetons      retirer      activer
```

Les lots 1 et 2 sont indépendants et peuvent partir ensemble. Le lot 3 doit
précéder le lot 5 : les nouveaux composants du pilotage doivent naître dans un
système de couleurs et de rayons déjà arbitré, sinon ils ajouteront leurs
propres valeurs à la liste.

---

## Ce que cet audit n'a pas couvert

- **L'application collecteur** (`apps/collecteur`) : hors du périmètre demandé.
  Elle partage `@kolek/ui` et `@kolek/core`, donc les lots 1 et 3 la touchent —
  il faudra la revoir après.
- **Le rendu réel de la vitrine.** Aucune capture n'était disponible. Les points
  marqués **[à voir]** demandent une vérification à l'œil sur téléphone avant
  correction.
- **Les performances mesurées.** Aucun relevé Lighthouse n'a été pris. La page
  charge GSAP, ScrollTrigger et quatre familles de polices ; le poids du bundle
  est déjà un constat d'audit ouvert par ailleurs.
