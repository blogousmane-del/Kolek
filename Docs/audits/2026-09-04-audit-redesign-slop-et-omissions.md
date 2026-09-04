# 2026-09-04 — Audit « redesign » : slop, couleurs, et les oublis stratégiques

Second audit de design du jour, conduit avec la compétence
`redesign-existing-projects`. Il ne refait pas le premier
([2026-09-04-audit-ui-ux-vitrine-et-tableaux-de-bord.md](2026-09-04-audit-ui-ux-vitrine-et-tableaux-de-bord.md)),
qui a mesuré les contrastes, retiré les tics et disséqué l'information des
tableaux de bord — ses lots 1 et 2 sont faits.

Celui-ci attaque un terrain que le premier n'a pas couvert : **typographie
fine, surfaces, états, contenu, sémantique, et surtout les oublis
stratégiques** — ce qu'une interface engendrée par une IA omet
systématiquement parce que personne ne les demande jamais explicitement.

Périmètre : vitrine publique, pages descriptives, formulaire d'ouverture de
compte, tableau de bord Admin, console Super Admin.

---

## Ce qu'il faut dire d'abord : ce code n'est pas du slop

La grille de cette compétence liste une soixantaine de marqueurs d'interface
engendrée. **La majorité ne s'applique pas ici**, et le dire honnêtement est
la condition pour que le reste de l'audit soit crédible.

| Marqueur cherché | Constat mesuré |
|---|---|
| Inter partout | `Plus Jakarta Sans` + `Sora` + `Bodoni Moda` + `IBM Plex Mono`. Inter n'est qu'un repli. |
| Quatre graisses absentes | 400 / 500 / 600 / 700 chargées et employées. |
| `height: 100vh` | `min-h-dvh` aux deux endroits concernés. |
| Ombres noires génériques | `rgba(20,30,25,.05)` — déjà teintées vert. |
| Div soup | `<nav>`, `<main>`, `<section>` ×5, `<article>` ×2, `<header>`, `<footer>`. |
| `z-index: 9999` | Échelle propre : 10 / 20 / 30 / 40. |
| Points d'exclamation, « Oops ! » | Zéro occurrence. |
| Clichés IA (*révolutionnaire, sans effort, nouvelle génération*) | Zéro occurrence. |
| Lorem ipsum, « John Doe », « Acme Corp » | Zéro occurrence. Les exemples sont ivoiriens et plausibles. |
| Accordéon FAQ, carrousel de témoignages à trois points | Absents tous les deux. |
| Modales pour tout | `Feuille.tsx` — un panneau latéral, ce que la grille recommande. |
| Chiffres ronds inventés | Les montants viennent de `PALIERS`, pas d'une maquette. |
| États de chargement / vide / erreur absents | `Squelette` sur 9 écrans, `EcranChargement`, `EcranErreur`, et des états vides rédigés. |
| Cartes de hauteur égale forcées | `items-start` sur la grille des fonctionnalités ; `mt-auto` sur les boutons tarifaires. |
| Trois tours tarifaires | Quatre paliers, le recommandé distingué par `ring-2 ring-or`, pas par la hauteur. |

Ce qui suit sont les vrais manques.

---

## 1. Les oublis stratégiques — la catégorie la plus grave

C'est là que le score est le plus mauvais, et ce n'est pas un hasard : ce sont
les choses que personne ne demande, donc que rien ne produit.

### 1.1 · Aucune mention légale, sur une plateforme qui encaisse — **grave**

Recherche sur `PiedDePage.tsx` de *confidentialité*, *mentions légales*,
*conditions générales*, *politique*, *privacy*, *terms*, *CGU*, *CGV* :
**zéro occurrence**.

Le pied de page n'en porte aucune. Le formulaire d'ouverture collecte un nom,
un numéro de téléphone, une adresse électronique et un mot de passe, puis
redirige vers un encaissement réel. Il n'existe nulle part :

- de politique de confidentialité,
- de conditions générales de vente,
- de mention de l'identité de l'exploitant (GTCS) au sens légal,
- de case ou de phrase d'acceptation avant paiement.

La phrase « Nom, numéro, adresse e-mail et zone » sous le bouton dit ce qui
part, et c'est bien — mais elle ne dit ni qui traite, ni pour combien de temps,
ni comment on demande l'effacement.

**Ce n'est pas un point de design.** C'est le seul constat de cet audit qui
expose l'exploitant, et il est le moins cher à corriger.

### 1.2 · Aucune page 404 — et pire, un soft-404 à 200 — **grave**

`App.tsx` lit le chemin et retombe sur la vitrine pour **tout** ce qui n'est
pas `/inscription` :

```ts
if (chemin === '/inscription') return <Inscription />;
return <Vitrine />;
```

Combiné à la redirection attrape-tout du `netlify.toml` (`/* → /index.html`,
status **200**), une adresse inexistante répond « tout va bien ». Mesuré en
production :

```
$ curl -o /dev/null -w "%{http_code}" https://kolek.cash/page-qui-nexiste-pas
200
<title>Kolek — L’épargne du marché, enfin sécurisée</title>
```

Deux conséquences distinctes :

- **Pour un visiteur** : un lien mal tapé ou périmé le dépose sur l'accueil
  sans lui dire qu'il s'est trompé. Il croit être où il voulait aller.
- **Pour l'indexation** : chaque URL erronée est une page indexable qui duplique
  l'accueil. Les moteurs traitent le soft-404 comme du contenu dupliqué.

### 1.3 · Aucun lien « aller au contenu » — **moyen**

Recherche de *skip*, *aller au contenu*, *contenu principal* : zéro. Un
utilisateur au clavier doit traverser toute la barre de navigation flottante à
chaque page.

### 1.4 · Aucun bandeau de consentement — **à décider, pas à corriger d'office**

À vérifier au regard du droit ivoirien et de l'ARTCI. La vitrine ne pose
aujourd'hui aucun cookie tiers — sa CSP interdit tout appel sortant hors
Supabase — donc l'obligation n'est peut-être pas déclenchée. **À confirmer
avant d'ajouter quoi que ce soit** : un bandeau posé sans nécessité est du
bruit, pas de la conformité.

---

## 2. Le formulaire d'ouverture — la fonction la plus importante

Le premier audit l'a traité sur le contraste. Voici ce qui reste, et le premier
point est le plus grave de tout le document.

### 2.1 · Aucune confirmation du mot de passe, juste avant de payer — **grave**

`Inscription.tsx:362-372` pose un seul champ mot de passe. Il n'y a pas de
« Répète-le ».

Or l'écran de réinitialisation du collecteur, lui, en a un
(`NouveauMotDePasse.test.tsx:29` : `getByLabelText('Répète-le')`). La règle
existe dans le produit ; elle n'est pas appliquée là où elle compte le plus.

**Le scénario, en entier :**

1. La personne choisit un palier payant. Le mot de passe est demandé **avant**
   le paiement — c'est le bon choix, et le code dit pourquoi : refuser un mot
   de passe après l'encaissement serait le pire moment possible.
2. Elle fait une faute de frappe. Rien ne la signale : le champ est masqué,
   il n'y a rien à comparer.
3. Elle paie. Le webhook crédite. Le compte est créé avec l'empreinte du mot
   de passe fautif.
4. Elle ne peut pas entrer. Elle a payé.
5. Le rattrapage est la réinitialisation par courriel — **et la passerelle SMS
   est hors service depuis le 31 août**, donc il n'existe aucun second canal.

Le coût d'un champ supplémentaire est de quinze lignes. Le coût de son absence
est un client qui a payé et ne peut pas entrer.

### 2.2 · Les textes d'aide ne sont liés à aucun champ — **moyen**

Aucun `aria-describedby` dans le fichier. Les cinq phrases d'aide
(« C'est le numéro sur lequel GTCS te rappelle », « C'est là que tu recevras
ton accès… ») sont des `<p>` posés après le champ. Un lecteur d'écran ne les
lit pas au moment où il annonce le champ — c'est-à-dire au seul moment où
elles servent.

Même remarque pour `aria-invalid` : quand le serveur refuse, le message
apparaît en haut du bloc, mais aucun champ n'est marqué comme fautif.

### 2.3 · Le message d'erreur ne dit pas quel champ corriger — **moyen**

Un seul `role="alert"` global (`Inscription.tsx:395`). Depuis le correctif de
ce matin, le serveur distingue pourtant `SAISIE_REFUSEE` (numéro) de
`CLE_CHARIOW_REFUSEE` (configuration) — l'information existe, elle n'est pas
routée vers le champ concerné.

### 2.4 · Aucun retour possible depuis l'écran de confirmation — **mineur**

L'écran « Demande enregistrée » propose « Connecte-toi » mais aucun retour vers
la vitrine. La grille appelle ça un cul-de-sac.

---

## 3. Contenu — une promesse devenue fausse, en deux endroits

C'est le défaut que ce dépôt a déjà nommé deux fois et corrigé deux fois :
*une promesse devenue fausse est pire qu'une promesse absente.* Elle est encore
là, sur les deux écrans qui vendent.

Depuis l'amendement « payer vaut accord » du 2026-09-03, un palier payant
**n'attend plus aucun rappel** : le règlement confirmé ouvre le compte.
`Inscription.tsx` le dit correctement, conditionné sur `payant`. Les deux
autres ne le disent pas.

| Fichier | Ligne | Texte affiché | Pourquoi c'est faux |
|---|---|---|---|
| `Tarification.tsx` | 145 | « Les comptes sont ouverts par l'équipe GTCS après un premier échange » | Posé sous une grille de **quatre** paliers dont **trois** sont payants et s'ouvrent seuls. |
| `Acces.tsx` | 141 | « Laisse ton nom et ton numéro. GTCS te rappelle, ouvre ton compte » | La carte mène à `/inscription`, où un palier payant part directement au paiement. |

Le visiteur qui lit la grille tarifaire, choisit « Pro » et se retrouve sur une
page de paiement a été détrompé par le produit lui-même.

Le docblock de `Inscription.tsx:16` porte la même phrase périmée — sans effet
pour le visiteur, mais il désinformera le prochain lecteur du fichier.

---

## 4. Typographie

### 4.1 · Aucun `text-wrap` nulle part — **moyen**

Recherche de `text-wrap`, `text-balance`, `text-pretty` dans
`apps/site/src` et `packages/core/src` : **zéro occurrence**.

Conséquence : les titres se coupent où le navigateur veut, et les mots
orphelins — un seul mot seul sur la dernière ligne d'un grand titre — sont
laissés au hasard de la largeur d'écran. C'est le marqueur typographique le
plus visible de la grille, et le moins cher à corriger : `text-wrap: balance`
sur les titres, `text-wrap: pretty` sur les paragraphes.

C'est aussi une correction qui ne peut rien casser : sur un navigateur qui ne
la connaît pas, elle est ignorée.

### 4.2 · Largeur de lecture non bornée — **mineur, à vérifier à l'œil**

Les jetons `mesures` définissent `formulaire: 360px` et des conteneurs, mais
aucune borne de **mesure de ligne** (le fameux ~65 caractères). Les paragraphes
de la vitrine s'appuient sur la largeur de leur section. À vérifier sur écran
large avant de corriger — la vitrine est déjà en colonnes étroites par endroits.

---

## 5. Couleurs et surfaces

### 5.1 · Six dégradés sur sept au même angle — **moyen**

```
degradeCarte  linear-gradient(135deg, …)
degradePromo  linear-gradient(135deg, …)
degradeZone0  linear-gradient(135deg, …)
degradeZone1  linear-gradient(135deg, …)
degradeZone2  linear-gradient(135deg, …)
degradeZone3  linear-gradient(135deg, …)
degradeHero   linear-gradient(180deg, …)   ← le seul qui échappe
```

Le dégradé linéaire diagonal identique répété six fois est exactement ce que la
grille désigne comme uniformité fabriquée. Seul le hero a reçu un angle pensé
(vertical, « la nuit d'un coffre »), et le commentaire du code le justifie —
preuve que la décision a été prise une fois, puis dupliquée cinq fois sans être
reprise.

### 5.2 · Le dégradé de carte glisse vers le bleu-violet — **moyen**

```
degradeCarte: linear-gradient(135deg, #8FC79E 0%, #6FA3C9 60%, #8A96C4 100%)
                                      vert        bleu        bleu-violet
```

`#8A96C4` et `#AEB7D6` (dans `degradeZone1` et `degradeZone3`) sont des
pervenches. C'est la teinte que la grille nomme comme **l'empreinte digitale la
plus courante des interfaces engendrées**. Elle n'est pas criarde ici, et elle
ne domine pas la page — mais elle est là, et elle n'appartient pas à la marque
« Vert Monétaire ».

À rapprocher du constat 4.8 du premier audit : les quatre couleurs de graphique
ne se distinguent pas les unes des autres (`chart-blue` contre `chart-slate` :
**1,06:1**). Les deux constats désignent la même zone du système de couleurs, et
se corrigent d'un seul geste — reconstruire cette famille sur une échelle de
luminance ancrée dans le vert de la marque.

### 5.3 · Aucune texture — **mineur, et discutable**

Recherche de *noise*, *grain*, *bruit* : zéro. La vitrine compense par du
`backdrop-blur` et des bordures translucides, ce qui est un parti pris cohérent
(verre plutôt que papier). Je le note pour être complet, pas parce qu'il faut
le corriger.

### 5.4 · Douze rayons pour cinq jetons — **moyen, déjà au plan**

```
17 rounded-pill      1 rounded-[2px]
 7 rounded-[2rem]    1 rounded-[2.75rem]
 4 rounded-md        1 rounded-[2.5rem]
 3 rounded-[1.25rem] 1 rounded-[2.25rem]
 2 rounded-t         1 rounded-[1.75rem]
 2 rounded-[1rem]    1 rounded-[1.5rem]
```

Neuf valeurs arbitraires entre crochets. Le premier audit l'a constaté (2.7) et
l'a mis au lot 3 ; le compte est passé de 11 à 12 depuis. **Chaque jour sans
règle en ajoute une.**

---

## 6. Interactivité et navigation

### 6.1 · Un lien mort dans la barre de navigation — **mineur**

`Navbar.tsx:76` : `href="#"` sur le logo. La grille désigne précisément ce
motif. L'intention est « haut de page » (l'`aria-label` le dit), mais `#` écrit
un fragment vide dans l'adresse et casse le bouton « retour » du navigateur.
`href="/"` fait le travail et rend le lien honnête.

### 6.2 · Aucun défilement doux sur les ancres — **mineur**

La barre de navigation pointe vers `#tarifs` et consorts. Recherche de
`scroll-behavior` / `scroll-smooth` : rien (seul `overscroll-behavior-y` existe,
qui est autre chose). Les ancres sautent sèchement.

À poser sous `@media (prefers-reduced-motion: no-preference)` — un défilement
animé imposé à qui a demandé moins de mouvement est une régression, pas une
finition.

### 6.3 · La page courante n'est pas annoncée — **mineur**

`BarreLaterale.tsx` calcule bien `estActif` et le rend visuellement, mais
n'émet aucun `aria-current`. Un lecteur d'écran ne sait pas où il est. La
correction est un attribut.

---

## 7. Iconographie

### 7.1 · Lucide — **mineur, mais c'est le marqueur nommé par la grille**

`lucide-react` dans `packages/ui`, `apps/admin` et `apps/collecteur`. La grille
la désigne comme « le choix d'icônes par défaut de l'IA ».

**La bonne nouvelle est architecturale** : tout passe par `packages/ui/src/Icone.tsx`,
qui expose des noms métier (`check`, `coins`, `landmark`…) et masque la
bibliothèque. Changer de fonderie est un changement d'**un seul fichier**, pas
d'une centaine d'appels.

Je ne le mets pas en haut du plan. Le jeu Lucide est cohérent, d'une seule
graisse, et le remplacer est un changement visuel large pour un gain d'identité
— à faire quand la marque le décidera, pas parce qu'une grille le dit.

---

## 8. Tableaux de bord — ce que cette grille ajoute au premier audit

Le premier audit a traité l'information (ce qui manque, ce qui se répète, ce qui
ne s'accorde pas). Cette grille n'ajoute que des points de forme, tous mineurs :

| Point | Constat | Verdict |
|---|---|---|
| « Le tableau de bord a toujours une barre latérale à gauche » | Vrai : `BarreLaterale` | **Défendable.** Six espaces, navigation permanente, exploitant au bureau. Une palette de commandes serait une régression ici. |
| « Avatars ronds exclusivement » | `Avatar.tsx:39` — `rounded-pill` | Goût. À traiter avec la règle des rayons (lot 3). |
| « Badges en pilule » | `BadgeStatut.tsx:32` — `rounded-pill` | Idem. |
| « Modales pour tout » | `Feuille.tsx`, un panneau latéral | **Déjà conforme.** |

---

## 9. Plan d'implémentation

Il prolonge celui du premier audit, dont les lots 1 et 2 sont faits et dont les
lots 0, 3, 4, 5 restent valides. Ces lots-ci sont numérotés en lettres pour
qu'aucun numéro ne se télescope.

**Ordre général :**

```
Lot A  →  Lot B  →  Lot 0/3/4/5  →  Lot C  →  Lot D
légal     paiement   (1er audit)    forme    identité
```

---

### Lot A — Légal et navigation cassée (risque nul, exposition maximale)

Rien ici ne touche au design. Tout est bloquant à des titres différents.

| # | Action | Fichier | Gravité |
|---|---|---|---|
| A.1 | Écrire la politique de confidentialité et les CGV/CGU, les servir sur `/confidentialite` et `/conditions` | nouvelles pages + `App.tsx` | grave |
| A.2 | Lier les deux depuis le pied de page, et depuis le formulaire au-dessus du bouton de paiement | `PiedDePage.tsx`, `Inscription.tsx` | grave |
| A.3 | Page 404 dédiée, et **status 404** — la redirection Netlify doit cesser de renvoyer 200 sur l'inconnu | `App.tsx`, `apps/site/netlify.toml` | grave |
| A.4 | Lien « Aller au contenu » masqué, révélé au focus | `Vitrine.tsx`, `Inscription.tsx` | moyen |
| A.5 | `href="#"` vers `href="/"` sur le logo | `Navbar.tsx:76` | mineur |
| A.6 | Décider du bandeau de consentement au regard du droit ivoirien — **décision, pas tâche** | — | à trancher |

**Le garde-fou du lot A** : un test qui exige que le pied de page porte un lien
vers chacune des deux pages légales, et qu'elles répondent. Sans lui, la page
sera écrite une fois puis déliée au prochain remaniement du pied de page.

Sur A.3, la difficulté est réelle : la redirection `/* → /index.html` en 200 est
ce qui rend `/inscription` servable. Il faut lister les chemins connus et ne
renvoyer 200 que sur eux, le reste tombant sur un `/404.html` servi en 404.

---

### Lot B — Le formulaire d'ouverture (la fonction qui encaisse)

| # | Action | Fichier | Gravité |
|---|---|---|---|
| B.1 | **Champ « Répète ton mot de passe »**, comparaison avant envoi, message inline | `Inscription.tsx` | grave |
| B.2 | Corriger les deux promesses périmées de `Tarification.tsx:145` et `Acces.tsx:141` | + docblock `Inscription.tsx:16` | grave |
| B.3 | `aria-describedby` sur les cinq champs, vers leur texte d'aide | `Inscription.tsx` | moyen |
| B.4 | `aria-invalid` sur le champ refusé, et router `SAISIE_REFUSEE` vers le champ téléphone | `Inscription.tsx`, `demande.ts` | moyen |
| B.5 | Lien de retour vers la vitrine sur l'écran de confirmation | `Inscription.tsx` | mineur |

**Le garde-fou du lot B** : un test qui refuse l'envoi quand les deux mots de
passe diffèrent, et un test de copie qui interdit la phrase « GTCS te rappelle,
ouvre ton compte » hors du chemin `essai` — écrit comme `copie.test.ts`, qui
existe déjà et sait retirer les commentaires avant de chercher.

**B.1 avant tout le reste du lot.** Chaque jour qui passe est un client qui peut
payer pour un compte qu'il ne pourra pas ouvrir.

---

### Lot C — Forme (après les lots 3 et 4 du premier audit)

| # | Action | Fichier |
|---|---|---|
| C.1 | `text-wrap: balance` sur les titres, `pretty` sur les paragraphes | `packages/core/src/base.css` |
| C.2 | Défilement doux des ancres, sous `prefers-reduced-motion: no-preference` | `packages/core/src/base.css` |
| C.3 | `aria-current="page"` sur l'entrée active de la barre latérale | `BarreLaterale.tsx` |
| C.4 | Varier les angles de dégradé, ou les réduire à un jeu justifié | `tokens.ts` |
| C.5 | Sortir la pervenche `#8A96C4` / `#AEB7D6` du système — à faire **avec** la reconstruction des couleurs de graphique (3.5 du premier audit) | `tokens.ts` |
| C.6 | Vérifier la mesure de ligne des paragraphes sur écran large **à l'œil** avant de borner | `apps/site/src/vitrine/*` |

C.1 est le meilleur rapport valeur/risque du document entier : deux lignes de
CSS, aucun risque de régression, effet visible sur chaque titre du site.

C.5 et 3.5 doivent partir ensemble : ce sont deux symptômes d'une seule famille
de couleurs qui n'a jamais été arbitrée.

---

### Lot D — Identité (à décider, pas à exécuter)

| # | Question | Portée |
|---|---|---|
| D.1 | Quitter Lucide pour une fonderie qui appartient à la marque ? | un fichier : `Icone.tsx` |
| D.2 | Avatars et badges : garder la pilule, ou passer au carré adouci ? | avec la règle des rayons (3.2) |
| D.3 | Texture (grain léger) sur les fonds sombres, ou assumer le parti « verre » ? | `base.css` |

Aucun de ces trois n'est un défaut. Ce sont des choix de marque, et ils
appartiennent à GTCS, pas à une grille d'audit.

---

## Ce que cet audit n'a pas couvert

- **L'application collecteur** (`apps/collecteur`), sauf par ricochet via
  `@kolek/ui`. C'est l'écran que les clients utilisent tous les jours et il n'a
  encore reçu aucun des deux audits de design.
- **Le rendu réel.** Aucune capture d'écran, aucun relevé Lighthouse. Les points
  marqués « à vérifier à l'œil » le sont pour cette raison.
- **Le poids du bundle.** Quatre familles de polices, GSAP et ScrollTrigger sur
  une vitrine. Constat déjà ouvert ailleurs, non mesuré ici.
