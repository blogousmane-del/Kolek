# Kolek — Design System v2

> Système de design de référence pour **toutes** les interfaces Kolek : l'App Collecteur (PWA mobile, hors-ligne) et le Dashboard Admin (web). Dérivé de la **maquette de notre Dashboard Admin** (l'image fournie en est la représentation cible), adapté à notre contexte : collecte journalière, FCFA, français, terrain à faible connectivité.
>
> **Règle d'or :** aucune interface ne sort de ce système. Un même token, un même composant, partout.
>
> **v2 — 2026-08-16.** Les six écrans dessinés dans Banani (flow *Kolek Design System*) sont implémentés. Les tokens ne sont plus injectés à l'exécution : ils engendrent le thème Tailwind au build. Les noms ont changé en conséquence — voir §3 et la table de correspondance §8.2.
>
> **Le billet — 2026-10-02.** Le collecteur prend le langage de la vitrine : vert coffre, gravure discrète, montants en chiffres de caisse. Accueil, Encaisser et Retrait d'abord ; les autres écrans suivent, puis l'administration. Conception : `Docs/specs/2026-10-02-refonte-le-billet-design.md`. Dans ce document, **chantier 1** désigne les fondations et ces trois écrans, **chantier 2** les seize autres écrans du collecteur (dont les trois écrans de connexion), **chantier 3** l'administration.

---

## 1. Analyse de la maquette de notre Dashboard Admin

L'image fournie est la **maquette de représentation de notre Dashboard Admin** : elle en fixe la mise en page et le langage visuel cibles. Son contenu (noms, marques, montants en `$`) est du **placeholder** — on le remplace par nos données réelles (§5). Ce qu'on en retient :

**Structure générale**
- Une application **claire qui flotte sur un fond très sombre** (vert-noir). Coins largement arrondis, effet « carte posée ».
- **Sidebar de navigation à gauche** + **zone de contenu à droite** sur un canevas gris très clair.
- Contenu organisé en **cartes modulaires** (widgets) de tailles variables, très aérées.

**Blocs identifiés**
- Bandeau haut : pilule « Free Plan Mode » à gauche, lien « Learn more » à droite.
- Fil d'Ariane « Home Page → Dashboard » + **grand titre de page** « Cruscotto Dashboard ».
- Barre d'actions en pilules : recherche, échange, « Set Calendar », « Add Widget », « Create Reports ».
- Sidebar : en-tête « Finance » (menu déroulant) ; items avec icônes (Dashboard **actif**, Balances, Transactions, Customer, Product Catalog) ; sections « Shortcuts » et « Favorite » ; **carte promo** en bas (« Subscribe now »).
- **Carte bancaire** en dégradé pastel (VISA, numéro masqué, titulaire, validité, CVV).
- **Carte solde** : « Available Balance », sélecteur de devise, **grand montant** `$817,432.09`, bouton **Withdraw** (vert foncé plein), bouton **History** (contour), « … ».
- **Carte gains** : `$42,291.53` + **puce de tendance** « +14% vs semaine dernière ».
- **All Activity** : grille d'**actions rapides** en icônes rondes (Scan, Transfer, Topup, Partner, Promo, Wallet, Invest…, More).
- **Stock Index** : tuiles de marques avec logo, prix et **% en rouge**.
- **Recently Completed** : grand montant + **filtres en pilules** + **barres empilées pastel** (60% / 18% / 22%).
- **Transactions** : lignes avatar + nom + date + **montant coloré** (vert positif, rouge négatif).

**L'ADN à hériter**
1. **Vert profond = couleur d'action** (boutons, état actif, icônes de valeur).
2. **Surfaces claires, beaucoup de blanc**, respiration généreuse.
3. **Coins très arrondis** (cartes et pilules) → douceur, accessibilité.
4. **Gros chiffres en gras** pour les montants, petites étiquettes grises pour le contexte.
5. **Couleurs sémantiques** discrètes : vert = positif, rouge/corail = négatif.
6. **Accents pastel** (dégradés) réservés aux éléments héros (carte, graphiques).
7. **Icônes fines et régulières**, un seul style de trait partout.

**Ce qu'on concrétise pour Kolek** (la maquette reste la cible ; on remplace seulement le placeholder)
- Le **`$` devient FCFA** (et on retire les centimes — le franc CFA n'a pas de sous-unité).
- Contenu réel : **nos données** (collecteurs, clients, cartes, mises) et **le français**, à la place des noms, marques et montants de démonstration.
- **Dans les applications, l'or est la pièce du logo et la gravure sur fond sombre, rien d'autre.** L'admin et le collecteur collent pour le reste strictement à la maquette (vert profond, neutres, vert/corail sémantiques, pastels de graphique). Jamais sur un montant, jamais sur un état. L'histoire de la règle reste lisible : « Aucun or dans l'interface » était une décision actée, reprise par la v2 (2026-08-16) ; elle a été précisée le 2026-09-02 en « aucun or dans les applications » (l'or est de la marque, pas de l'interface), puis amendée par *Le billet* le 2026-10-02, qui donne à l'or une place : la gravure (§4.18).
- **L'or est une couleur de marque, pas une couleur d'interface.** `--color-or` et `--color-or-doux` servent le logo, le favicon, l'image Open Graph et la vitrine — les surfaces qui *vendent* Kolek — et, depuis *Le billet*, la gravure des applications : sur fond sombre, entre 15 et 30 % d'opacité (§4.18). Ni un montant ni un état n'en portent la moindre trace. La distinction n'est pas cosmétique : posé sur un montant ou sur un état, l'or désignerait une valeur, et aucune valeur de ce produit n'est or. **Restes connus**, antérieurs à la règle et à retirer aux chantiers 2 et 3 : sur les écrans de connexion, le focus des champs sombres (`Champ.tsx`), les liens et les encadrés de message (`EcranConnexion.tsx`, `MotDePasseOublie.tsx`, `NouveauMotDePasse.tsx`) ; dans l'administration, le bouton de démonstration de la connexion (`Connexion.tsx`), le bandeau de démonstration (`Coquille.tsx`) et l'état « Attention » de la santé du système (`Sante.tsx`).
- **Les quatre aplats de tuile ne sont pas de l'or, et voici où passe la
  frontière.** `tuileGestion` (`#F1E4C9`) et son encre (`#6A5218`) sont des
  jaunes : la question se pose donc pour de bon. Ce qui les sépare de l'or n'est
  pas la teinte mais l'emploi — l'or *désigne une valeur*, l'aplat *dit à quelle
  famille une destination appartient*. La règle au-dessus tient toujours : l'or
  ne dit jamais un montant ni un état, et un test tient l'écart plutôt qu'un
  commentaire.

  Pourquoi une famille de destination existe à côté de la palette sémantique :
  celle-ci décrit des **états** — succès, erreur, information — et l'accueil du
  collecteur affichait **neuf destinations ensemble**, dix pour le titulaire.
  Tout y ramener rendait *Retrait* et *Bilan* identiques, deux boutons voisins
  dont l'un sort de l'argent. Un jeton par état, une famille par destination :
  ce sont deux axes, pas une seule échelle. Depuis *Le billet* (2026-10-02), le
  collecteur n'en emploie plus : `Outils` pose des boutons neutres, sans couleur
  par famille (§4.9). Les huit jetons `tuile*` restent pour `ActionsRapides`,
  que seul le tableau de bord de l'administration emploie encore (quatre
  raccourcis, en deux familles), jusqu'à la refonte de l'administration
  (chantier 3).

  Pourquoi quatre, et pourquoi dédiées. Quatre familles — ce qui touche à
  l'argent, ce qui touche au client, ce qui regarde en arrière, ce qui range —
  s'apprennent en une semaine, là où neuf couleurs accrochées aux icônes ne se
  mémorisaient jamais. Elles ont leurs propres jetons depuis le 2026-09-17,
  parce qu'emprunter les teintes d'alerte a échoué : `positiveTint` et
  `secondary` ne diffèrent que de sept unités sur un canal, et sur l'épreuve
  d'écran les quatre familles s'y lisaient comme **trois**. Les jetons `tuile*`
  tiennent deux conditions ensemble — au moins vingt-sept unités d'écart sur un
  canal entre deux fonds quelconques, et une luminance resserrée entre 0,735 et
  0,784 — pour qu'on les distingue en couleur sans qu'aucune saute au visage, ni
  ne disparaisse en niveaux de gris.

  Chaque encre tient **4,5:1 sur son propre fond**, et non 3:1 : depuis que
  l'aplat *est* la tuile, ces couleurs portent le libellé et plus seulement
  l'icône.

  Ce que ça n'autorise pas : ouvrir une famille par écran. Quatre existent, la
  famille est déclarée par l'écran et non déduite du dessin de l'icône, et une
  cinquième demanderait de montrer d'abord que ces quatre-là ne suffisent plus.
  « Alertes » n'en est pas une : sur l'ancien accueil du collecteur, elle était
  rangée dans `gestion`, car une tuile rouge en permanence est rouge le jour où
  il y a trois refus comme le jour où il n'y en a aucun.

---

## 2. Principes de design Kolek

1. **Clarté financière d'abord.** Un chiffre important se lit en une fraction de seconde : gros, gras, aligné (chiffres tabulaires).
2. **Confiance.** Vert profond + neutres : sérieux et sobre. Jamais criard.
3. **Hors-ligne d'abord.** Chaque écran doit rester lisible et utilisable sans réseau ; un état de synchro est toujours visible.
4. **Densité maîtrisée.** Aéré côté admin ; compact et à grandes cibles tactiles côté terrain.
5. **Cohérence absolue.** Les deux applications partagent tokens et composants. Ce qui change, c'est la disposition, pas le langage visuel.
6. **Palette resserrée.** Vert, neutres, vert/corail sémantiques, pastels de graphique — rien d'autre dans les applications. L'or est réservé à la marque, à la vitrine et à la gravure sur fond sombre, jamais sur un montant ni sur un état (§ 1, § 4.18). La discipline fait la cohérence.
7. **Ne jamais afficher un chiffre qu'on ne sait pas.** Un écran branché sur la base ne montre que ce que la base établit. Un compteur inventé pour remplir une case coûte la confiance de celui qui le lit.

---

## 3. Fondations (tokens)

### 3.0 D'où viennent ces valeurs et comment elles arrivent à l'écran

Une seule source : **`packages/core/src/tokens.ts`**. Le script `npm run generer:theme` en tire **`packages/core/src/theme.css`**, un bloc `@theme` que Tailwind lit au build pour fabriquer ses classes utilitaires. Le fichier engendré est versionné, et `npm run verifier:theme` échoue si les deux divergent.

```
tokens.ts  ──generer:theme──▶  theme.css (@theme)  ──Tailwind──▶  bg-surface, rounded-pill, text-4xl…
```

Deux conséquences pratiques.

**Les noms ne sont pas libres.** Tailwind n'engendre une classe que si la variable tombe dans l'espace de noms qu'il attend : `--color-*`, `--radius-*`, `--text-*`, `--font-*`, `--shadow-*`, `--container-*`, plus `--spacing`. Un joli nom hors de ces préfixes ne produit aucune classe et échoue silencieusement.

**Le thème n'est plus injecté en JavaScript.** En v1, les tokens étaient posés dans une balise `<style>` à l'exécution. Tailwind les veut au build ; la feuille est donc statique et servie depuis l'origine. Il reste exactement un usage de l'attribut `style` dans tout le produit — la largeur des jauges d'avancement, qui vaut un pourcentage venu de la donnée.

### 3.1 Couleurs

**Marque & action**

| Token | Hex | Usage |
|---|---|---|
| `--color-sidebar` | `#0E2E1F` | Fonds sombres : barre latérale, en-têtes mobiles. |
| `--color-primary` | `#14402C` | Couleur d'action : boutons pleins, état actif, icônes de valeur. |
| `--color-primary-foreground` | `#FFFFFF` | Texte posé sur `primary`. |
| `--color-accent` | `#1C5A3D` | Survol / secondaire, dégradés. |
| `--color-secondary` | `#E8F0EA` | Fond d'état actif, bandeau d'offre, puces. |
| `--color-secondary-foreground` | `#14402C` | Texte posé sur `secondary`. |

**Neutres**

| Token | Hex | Usage |
|---|---|---|
| `--color-ink` / `--color-foreground` | `#171A17` | Texte principal, titres. |
| `--color-muted-foreground` | `#666B64` | Texte secondaire, étiquettes. Assombri le 2026-08-25 : `#6C716A` ne tenait que 4,33:1 sur `--color-muted`. |
| `--color-muted` | `#EEEFEC` | **Surface** muette : piste de jauge, en-tête de tableau. Refroidi le 2026-09-04, de `#EFEFEA` : il tirait au jaune quand `canvas` tire au vert. |
| `--color-hairline` / `--color-border` | `#E6E3DA` | Bordures, séparateurs (1 px). |
| `--color-trait` | `#858B81` | Limite de ce qu'on touche : champ de recherche, segments, case à venir de la carte (40 %), points de conduite (50 %). 3,5:1 sur `surface`, 3,2:1 sur `canvas` : les 3:1 que WCAG 1.4.11 demande à la limite d'un contrôle. `hairline` sépare, `trait` délimite. |
| `--color-canvas` / `--color-background` | `#F4F5F2` | Fond de la zone de contenu. |
| `--color-surface` / `--color-input` | `#FFFFFF` | Cartes, panneaux, champs. |
| `--color-dark-canvas` | `#06140E` | Cadre sombre, écran de connexion. |

`--color-paper` (`#FBFAF6`) est parti le 2026-09-04 : il n'avait qu'un emploi, les trois cartes du produit sur la vitrine, et faisait un troisième fond entre `canvas` et `surface`. Deux fonds suffisent : `canvas` porte la page, `surface` porte ce qui se soulève.

> **`muted` et `muted-foreground` ne sont pas la même chose.** En v1 un seul token `--muted` portait le gris de texte. Tailwind attend `muted` comme surface et `muted-foreground` comme texte ; les confondre donne du gris sur gris sur chaque jauge et chaque en-tête de tableau. La valeur de texte de la v1 est devenue `muted-foreground`.
>
> Les doubles noms (`canvas`/`background`, `hairline`/`border`, `ink`/`foreground`, `surface`/`input`) sont des alias exacts, vérifiés par un test. Le premier est le nom métier, le second celui qu'attendent les classes conventionnelles.

**Sémantique**

| Token | Hex | Fond (tint) | Usage |
|---|---|---|---|
| `--color-positive` | `#1C7A4B` | `--color-positive-tint` `#E6F3EC` | Dépôt, à jour, montant reçu (+). |
| `--color-negative` | `#A8452F` | `--color-negative-tint` `#F6E4DF` | Retard, sortie, alerte, échéance (−). Assombri le 2026-08-25 : `#C1553E` ne tenait que 3,68:1 sur sa propre teinte. |
| `--color-info` | `#3D6E8E` | `--color-info-tint` `#E6EEF4` | Neutre informatif, bandeau hors-ligne. |

**Data-viz (dégradés pastel, comme le modèle)**

| Token | Hex | Usage |
|---|---|---|
| `--color-chart-blue` | `#82ACCC` | 1re série. |
| `--color-chart-teal` | `#9ACDBE` | 2e série. |
| `--color-chart-mint` | `#D1E8D4` | 3e série ; vert de réussite sur fond sombre. L'état actif des barres latérales est passé le 2026-09-17 à `--color-marqueur-actif` (`#8ED9B0`). |
| `--color-chart-slate` | `#8D8AC0` | 4e série (ex. part « commission »). |

Refondues le 2026-09-04 : espacées d'environ 10 unités de L*, lisibles en niveaux de gris ; elles servent aussi de fond aux pastilles d'`Avatar`, toutes à 4,5:1 au moins contre `sidebar`.

**Dégradés.** Ils ne tombent dans aucun espace de noms Tailwind : aucune classe n'en sort, et on les consomme par `bg-[image:var(--degrade-hero)]`. Les garder dans `tokens.ts` est ce qui empêche la vitrine et l'application de diverger.

| Token | Usage |
|---|---|
| `--degrade-hero` | La nuit d'un coffre : hero de la vitrine, en-tête de l'accueil du collecteur, bande de l'encaissement, écrans de connexion. |
| `--degrade-zone-0…3` | Bandeau de tête des cartes de zone, par index. |

`--degrade-carte` est parti le 2026-10-02 avec l'ancienne carte de collecte : le billet est une surface, pas un dégradé (§4.4).

### 3.2 Typographie

- **Police UI :** `Instrument Sans` (variable, repli `system-ui`) → `--font-body`, classe `font-body`. Texte, boutons, libellés, l'unité « FCFA ».
- **Police display / marque :** `Bricolage Grotesque` (variable) → `--font-headings`, classe `font-headings`. Titres, nom du client sur la carte, total du jour. Les deux ont remplacé `Plus Jakarta Sans` et `Sora` le 2026-09-17.
- **Chiffres de caisse :** `IBM Plex Mono` 500 → `--font-mono`, classe `font-mono`. Tout montant qu'on compte (soldes, mises, relevés, décompte, reçus), les compteurs (`29/31`), les heures, les numéros de reçu. **Un montant qu'on compte est en Plex Mono ; le total du jour est en Bricolage, c'est l'affiche.** Jamais une phrase en chasse fixe : dans « Encaissé aujourd'hui · 23 mises », seul `23` l'est. Le collecteur ne charge que la graisse 500, sous-ensemble latin.
  - **Le repli.** `--font-mono` met `IBM Plex Mono` en tête, puis la liste mono de Tailwind recopiée telle quelle (`polices.mono`, dans `tokens.ts`). Les écrans qui ne chargent pas Plex, l'administration, gardent le rendu qu'ils avaient.
  - **Pas de semi-gras.** Seule la 500 est chargée (`apps/collecteur/src/main.tsx`). Un montant posé dans un contexte en semi-gras, comme l'intérieur d'un bouton, prend `font-medium`, jamais `font-semibold` : le navigateur fabriquerait un faux gras.
- **Police dramatique — vitrine uniquement :** `Bodoni Moda` → `--font-drama`, classe `font-drama`, déclarée dans `apps/site/src/styles.css` et nulle part ailleurs. Un Didone gravé, c'est-à-dire la typographie des coupures de banque : la vitrine traite le produit comme un billet, et cette police est la seule chose de la page qui vienne littéralement du sujet. Elle a remplacé `Instrument Serif` le 2026-09-02 — celle-ci n'était choisie que pour « faire premium », ce qui n'est pas une raison.
  - **Jamais deux familles dans un même titre pour l'emphase.** Un mot mis en valeur l'est par l'italique ou la graisse de sa propre famille. Le seul titre qui mélange Bricolage et Bodoni est le `h1` du hero, où la coupure typographique *est* le sujet ; partout ailleurs c'est un défaut.
  - **Jambages.** Bodoni Moda italique descend bas. En display, `leading` ≥ 1,1 et une réserve (`pb-*`) sur le bloc porteur, sinon le `p` de « précision » et le `j` de « juste » sont rognés.
- **Distribution :** paquets `@fontsource`, **sous-ensemble latin uniquement**. Pas de Google Fonts : la CSP interdit `font-src` distant, et un collecteur en 3G ne doit pas attendre un serveur tiers pour lire un montant.
- **Chiffres :** toujours **tabulaires** (classe `tabular-nums`) pour aligner les FCFA.

| Style | Classe | Taille | Graisse | Usage |
|---|---|---|---|---|
| Total du jour | `text-total` | 44 px | 700 | Le seul total de l'accueil du collecteur, à partir de `xs` (390 px) ; dessous, `text-4xl`. |
| Metric XL | `text-4xl` | 36 px | 700 | Grands montants (solde, encours). |
| H1 — titre de page | `text-3xl` | 28 px | 700 | « Tableau de bord », « Mes clients ». |
| Montant de caisse | `text-3xl` | 28 px | 500 · `font-mono` | La mise du jour, au bloc de caisse de l'encaissement. |
| Montant de carte | `text-2xl` | 24 px | 500 · `font-mono` | Solde de la carte de collecte, total d'un décompte. |
| H2 — section | `text-xl` | 20 px | 600 | Titres de bloc. |
| H3 — carte | `text-lg` | 16 px | 600 | Titres de widget. |
| Body | `text-base` | 15 px | 400/500 | Texte courant. |
| Small / label | `text-sm` | 13 px | 500 | Étiquettes, méta. |
| Overline | `text-xs` | 11 px | 600 · `uppercase tracking-widest` | Sur-titres de section, en gris. |

Les noms en t-shirt sont imposés par Tailwind ; la colonne « Style » reste le vocabulaire du système.

**Format FCFA :** séparateur d'espace, suffixe « FCFA », **sans centimes**. Ex. `817 432 FCFA`, `2 500 FCFA`. Un montant s'écrit par `formatMontant()` ou `formatFCFA()` de `@kolek/core`, jamais par interpolation directe. Les variations en pourcentage gardent une décimale si utile (`+14 %`).

### 3.3 Espacement — base 4 px

`--spacing: 4px`. Tailwind en dérive toute son échelle : `p-2` vaut 8 px, `gap-3` vaut 12 px, `py-2.5` vaut 10 px. L'échelle de la v1 (`2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`) en est exactement l'ensemble des multiples utiles ; il n'y a plus de liste de jetons à tenir en parallèle.

Padding interne des cartes : `p-5` à `p-6` (admin), `p-4` (mobile). Gouttière entre widgets : `gap-4`.

**Largeurs de conteneur** — `--container-*`, classes `max-w-*` / `w-*` :

| Token | Valeur | Usage |
|---|---|---|
| `--container-formulaire` | 360 px | Connexion, écrans de blocage. |
| `--container-carte` | 520 px | Carte isolée. |
| `--container-liste` | 640 px | Liste sur toute une page. |
| `--container-sidebar` | 256 px | Barre latérale admin. |
| `--container-mobile` | 420 px | Colonne de l'App Collecteur ouverte sur un écran large. |
| `--container-volet` | 320 px | Colonne de droite du Dashboard. |

### 3.4 Rayons

**Corrigé le 2026-09-04.** Ce tableau annonçait 8 / 12 / 16 / 24 px ; `tokens.ts`
émettait 4 / 6 / 10 / 12 px depuis l'origine. Le document décrivait donc des
valeurs que le produit n'a jamais employées, et personne ne pouvait s'y fier
pour trancher. Les valeurs ci-dessous sont celles du code, vérifiées.

| Token | Classe | Valeur | Rôle |
|---|---|---|---|
| `--radius-sm` | `rounded-sm` | 4 px | Pastille de légende d'un graphique (`BarreEmpilee`). |
| `--radius-md` | `rounded-md` | 6 px | **Tous les boutons rectangulaires**, champs, lignes de tableau. |
| `--radius-lg` | `rounded-lg` | 10 px | Carte d'application : `Carte`, `CarteStat`, `CarteZone`, `EcranMessage`. |
| `--radius-xl` | `rounded-xl` | 12 px | Carte mise en avant, carte de collecte, élément d'un panneau. |
| `--radius-2xl` | `rounded-2xl` | 20 px | Artefact et carte interne de la vitrine, panneau de navigation. |
| `--radius-3xl` | `rounded-3xl` | 32 px | Grande surface éditoriale de la vitrine. |
| `--radius-pill` | `rounded-pill` | 9999 px | Badges et pastilles, boutons **ronds** à icône seule, avatars, points, barres de progression. Jamais un bouton qui porte du texte. |

`2xl` et `3xl` ont été ajoutés le 2026-09-04. La vitrine posait onze rayons
arbitraires entre 16 et 44 px — `rounded-[2rem]`, `rounded-[1.25rem]`,
`rounded-[2.5rem]`… — dont aucun ne correspondait à un jeton. L'échelle
s'arrêtait à 12 px, taillée pour l'application ; la page de vente n'y avait
simplement pas de place. Ces deux crans la lui donnent, et les valeurs
arbitraires ont disparu.

Ces deux noms écrasent les valeurs par défaut de Tailwind (16 px et 24 px).
C'est voulu : les noms restent disponibles, avec les valeurs du produit.

**Deux exceptions, et ce sont les seules.**

1. `Telephone.tsx` dessine un châssis d'appareil — 44 px à l'extérieur, 36 px à
   l'intérieur. Ce n'est pas une surface d'interface mais un objet représenté ;
   le ranger dans l'échelle le ferait cesser de ressembler à un téléphone.
2. Les 31 cases de la carte de collecte miniature de la vitrine
   (`Fonctionnalites.tsx`) font 8 px de haut. À 4 px, `sm` les arrondirait en
   stade ; elles gardent 2 px (`rounded-[2px]`).

Toute autre valeur arbitraire est un défaut. Si un rôle nouveau apparaît, il
prend un jeton, pas un `rounded-[…]`.

Les cases de `CarteCollecte` ne sont pas une exception : 18 px de haut, 12 px
dans le format réduit sous 240 px (`h-4.5` et `@max-[240px]:h-3`), elles
prennent `rounded-xs`, 2 px, le cran de Tailwind sous `sm`, que l'échelle du
produit ne redéfinit pas.

### 3.5 Élévation

| Token | Classe | Valeur | Usage |
|---|---|---|---|
| `--shadow-sm` | `shadow-sm` | `0 1px 2px rgba(20,30,25,.05)` | Cartes posées sur canevas. |
| `--shadow-md` | `shadow-md` | `0 4px 12px rgba(20,30,25,.08)` | Cartes flottantes, bandeaux de résumé. |
| `--shadow-lg` | `shadow-lg` | `0 12px 32px rgba(6,20,14,.14)` | Cadre de l'application admin sur fond sombre, écrans de blocage. |
| `--shadow-action` | `shadow-action` | `0 4px 12px rgba(20,64,44,.25)` | **Uniquement** les commandes d'encaissement du collecteur : la touche de la barre mobile (`NavMobile`), le bouton du bloc de caisse et le bouton « Encaisser » de `NavBureau`, la barre latérale du collecteur sur écran large (pas celle de l'administration). |

`shadow-action` n'est pas un quatrième niveau d'élévation : c'est une couleur portée. C'est la seule surface du produit qui projette du vert, et elle désigne le geste central du métier.

Bordure standard des cartes : `border border-hairline` **+** `shadow-sm`. Discret, jamais lourd.

### 3.6 Iconographie

- Jeu unique **Lucide**, style outline, trait **1.75 px**, extrémités arrondies. Le composant `Icone` fixe le trait ; aucun écran ne le règle.
- Le registre d'icônes est **explicite** : `packages/ui/src/Icone.tsx` déclare nommément celles que le produit dessine. Une icône non déclarée est une erreur de compilation. Un composant qui résoudrait le nom à l'exécution embarquerait le jeu Lucide entier dans un paquet destiné à un téléphone en 3G.
- Icônes d'action sur une tuile pastel de leur famille (`ActionsRapides`) : l'administration seulement, jusqu'à sa refonte. Le collecteur pose l'icône nue, en `primary`, à gauche du libellé (`Outils`, §4.9).
- **Une icône dit le geste, pas la monnaie.** `banknote` pour encaisser, `scale` pour le rapprochement, `receipt-text` pour les reçus : `circle-dollar-sign` et `receipt` portaient un « $ » dans un produit en FCFA. Ils restent au registre pour les écrans qui ne sont pas encore passés au billet.
- Taille par défaut 18 px ; 20–24 px pour les cibles tactiles du terrain ; 11–15 px pour les puces et méta.

---

## 4. Composants

Tous vivent dans **`packages/ui/src`** et sont partagés par les deux applications. Rien de visuel n'est écrit deux fois.

### 4.1 Inventaire

| Composant | Fichier | Rôle |
|---|---|---|
| `Icone` | `Icone.tsx` | Registre Lucide explicite, trait 1,75 px. |
| `Avatar` | `Avatar.tsx` | Initiales sur pastille data-viz, couleur déterministe par nom. |
| `BadgeStatut` | `BadgeStatut.tsx` | Table unique des statuts métier. |
| `Bouton` | `Bouton.tsx` | Primaire / contour / fantôme, hauteur minimale 44 px. |
| `Champ` | `Champ.tsx` | Champ étiqueté, `useId`, focus vert. |
| `Carte`, `EnteteCarte`, `EnteteSection`, `LienBloc` | `Carte.tsx` | Système de blocs : surface, en-têtes, lien « Tout voir ». |
| `CarteStat` | `CarteStat.tsx` | Metric XL + puce de tendance. |
| `CarteCollecte` | `CarteCollecte.tsx` | Le billet : 31 cases, solde en Plex Mono, place pour un tampon (§4.4). |
| `CarteZone` | `CarteZone.tsx` | Résumé d'un marché, bandeau dégradé indexé. |
| `LigneTransaction` | `LigneTransaction.tsx` | Mise / retrait / commission, montant coloré. |
| `LigneCollecteur` | `LigneCollecteur.tsx` | Ligne de tableau admin. |
| `BarreEmpilee` | `BarreEmpilee.tsx` | Répartition pastel + légende. |
| `BarreLaterale` | `BarreLaterale.tsx` | Navigation admin, entrées à venir grisées. |
| `BarreHaute` | `BarreHaute.tsx` | Fil d'Ariane + titre + actions en pilules. |
| `NavMobile` | `NavMobile.tsx` | Barre du bas ; « Encaisser » en touche dans la barre (§4.2). |
| `NavBureau` | `NavBureau.tsx` | Barre latérale du collecteur à partir de `lg`, à côté de `NavMobile` ; « Encaisser » y est un bouton plein, ombre `shadow-action` (§3.5). |
| `ActionsRapides` | `ActionsRapides.tsx` | Grille de tuiles pastel par famille, variante compacte. Administration seulement (§4.9). |
| `BandeauHorsLigne`, `useEnLigne` | `Bandeaux.tsx` | État réseau. |
| `EcranConnexion` | `EcranConnexion.tsx` | Formulaire de connexion partagé. |
| `EcranMessage` | `EcranMessage.tsx` | Écran de blocage : filet, portillon, indisponibilité. |
| `Filet` | `Filet.tsx` | Frontière d'erreur de rendu. |
| `Outils` | `Outils.tsx` | Les outils de l'accueil du collecteur, boutons neutres (§4.9). |
| `Segments` | `Segments.tsx` | Choix exclusifs, chacun avec son compte (§4.6). |
| `Decompte` | `Decompte.tsx` | Décompte de caisse, total sous un double filet (§4.17). |
| `Tampon` | `Tampon.tsx` | La marque d'un geste qui ne se défait pas (§4.16). |
| `Feuille` | `Feuille.tsx` | Panneau flottant : feuille sur téléphone, boîte sur écran large. Voile `dark-canvas` à 48 %. |
| `Onde`, `Rosace` | `Guilloche.tsx` | La gravure (§4.18). `Onde traitFixe` pour une bande basse. |

### 4.2 Navigation
- **Admin (web) — barre latérale gauche.** En-tête de contexte (« Kolek · Admin »). Items icône + label, groupés par overline gris (« Pilotage », « Monétisation », « Système »). **État actif :** fond `bg-white/10`, filet gauche `border-chart-mint`, icône menthe. **Entrée à venir :** contraste réduit, `disabled`, attribut `title`. Pas d'étiquette « à venir » visible — elle volait la largeur du libellé et le faisait passer sur deux lignes. Sortie de session seule en pied : la carte promo de la maquette a été retirée le 2026-09-11, GTCS vendant les paliers et n'en souscrivant aucun.
- **Collecteur (mobile) — barre du bas.** Cinq onglets à grandes cibles. L'onglet **Encaisser** est une touche dans la barre : rectangle `primary` de 64 × 48 px, rayon `lg`, icône `banknote`, ombre `shadow-action`. L'onglet ouvert prend l'encre `primary` et un filet de 2 px collé sous le bord haut de la barre, hors du flux, comme sur la maquette validée (`Docs/maquettes/le-billet/`), et porte `aria-current="page"`. La touche, ouverte, se cerne d'un anneau `primary` de 2 px. La barre est `fixed bottom-0` : une liste de clients dépasse la hauteur d'un téléphone, et une barre qui part au défilement oblige à remonter avant chaque encaissement.
  - **La réserve.** La barre mesure environ 77,7 px et sort du flux : le document ne lui garde plus de place. `--reserve-nav` (`packages/core/src/base.css`, 5,25 rem plus la zone de sécurité du bas) est la réserve sous le contenu, écrite une seule fois. `pb-nav` réserve cette hauteur en bas de la colonne ; `bottom-nav` laisse un bloc `sticky` se poser juste au-dessus de la barre.

### 4.3 Barre supérieure & fil d'Ariane
Fil d'Ariane gris `Accueil → …` puis **titre de page** `text-3xl`. À droite, **barre d'actions en pilules**. Sur mobile : en-tête sombre, titre centré, une action de chaque côté.

### 4.4 Carte de collecte (le billet)
Fond `surface`, filet `hairline`, `rounded-xl`, et une `Onde` fine en vert coffre à 30 % sur le bord haut : c'est elle qui fait de la carte un billet. Nom du client en Bricolage `text-xl` ; « Mise / jour » en Instrument Sans et son montant en Plex Mono ; pastille du cycle quand l'écran le connaît (`cycle` est facultatif : l'accueil et l'encaissement ne le savent pas, et « Cycle 1 » écrit en dur y était faux). Les **31 cases** sur seize colonnes, huit sous 240 px : payées en `primary`, la prochaine cerclée de 2 px, celle qu'on vient de payer en `positive`, les autres en `canvas` bordées de `trait` à 40 %. Une carte close (`close`) ne cercle plus rien. Solde en Plex Mono `text-2xl`, compteur `29/31` d'un seul tenant. Trois emplacements : un surtitre, un tampon, des commandes. Plus de dégradé, de cercles ni de verre. Le nombre de cases vient de `MISES_PAR_CYCLE` dans `@kolek/core` : c'est une règle du métier, pas une valeur de maquette.

### 4.5 Boutons

| Variante | Style |
|---|---|
| **Primaire** | Rectangle plein `primary`, `rounded-md`, texte blanc, icône optionnelle. |
| **Contour** | Rectangle `rounded-md`, contour `primary`, fond blanc, texte vert. |
| **Fantôme** | Texte vert sans fond. |
| **Icône** | Rond. Sur fond clair : fond `surface`, bord `trait`, icône `ink` (le retour d'`EnTeteEcran`). Sur la bande sombre : fond `bg-white/10`, bord `white/25`, icône blanche (le retour de la bande d'Encaisser). |

Hauteur minimale **44 px** partout, admin compris. Le collecteur tape debout, à une main, sur un téléphone d'entrée de gamme, parfois sous le soleil d'un marché ; c'est une cible tactile, pas une préférence esthétique.

**`grand`** : 56 px et `text-lg`, pour le geste d'un écran qui fait bouger l'argent (« Encaisser », « Oui, rendre 30 000 FCFA »). **`nomAccessible`** : le nom que lit un lecteur d'écran (`aria-label`) quand le libellé visible ne désigne pas l'objet (« Encaisser 2 000 FCFA sur la carte de Mariam Traoré » pour un bouton qui dit « Encaisser 2 000 »). Il contient toujours le libellé visible (WCAG 2.5.3) : qui commande à la voix doit retrouver le bouton qu'il voit.

**`decritPar`** : l'identifiant de la phrase qui dit pourquoi le bouton est éteint (`aria-describedby`), quand cette phrase est déjà à l'écran. Un bouton `disabled` ne prend pas le focus : sans ce lien, « Reçu » grisé se lit comme un bouton cassé. `title` reste le canal de l'infobulle. **`deplie`** et **`panneau`** : pour un bouton qui ouvre un panneau, `aria-expanded` (toujours dit, « replié » compris) et `aria-controls` (à donner tant que le panneau est dans la page). Sans `deplie`, le bouton n'annonce aucun état.

**Un libellé mêlé tient dans un seul `<span>`.** `Bouton` est un conteneur flex (`gap-2`) : dans « Encaisser 2 000 », où le montant est en Plex Mono, des morceaux frères deviendraient des éléments séparés : le montant, insécable, ne passerait plus à la ligne, le bouton ne se resserrerait plus et, à 320 px, « Fiche », son voisin sur la carte de l'accueil, sortirait de la carte.

### 4.6 Pilules de filtre et segments
Fond blanc, contour `hairline`, texte `ink`, chevron `muted-foreground`. Actif = fond `primary`, texte blanc.

**Segments** (`Segments`) : trois ou quatre choix exclusifs dans une piste `muted` au rayon `lg`, chacun avec son compte en Plex Mono. Le choisi prend `surface`, une bordure `trait` et `shadow-sm`. `aria-pressed` dit lequel est choisi ; le compte est `aria-hidden`, le nom d'un segment est son libellé seul. La piste est une grille à colonnes `auto-cols-[minmax(max-content,1fr)]`, avec `overflow-x-auto` : les colonnes restent égales tant qu'il y a de la place, ne sont jamais plus étroites que leur texte, et à 320 px la piste défile en elle-même au lieu de pousser la page. Le retrait s'en sert ; les pilules restent ailleurs jusqu'à la refonte de leurs écrans.

### 4.7 Cartes & surfaces
`bg-surface`, `rounded-lg`, `border border-hairline` + `shadow-sm`. Titre `text-lg` + lien fantôme optionnel en haut à droite. **Une seule définition**, dans `Carte` : la maquette recopiait cette combinaison dans une quinzaine d'endroits avec trois valeurs d'ombre légèrement différentes.

### 4.8 Carte-statistique
Étiquette `text-sm` grise + icône cerclée → **Metric XL** `tabular-nums` + unité → **puce de tendance** tintée avec flèche et « vs période précédente ».

### 4.9 Outils et actions rapides
**Collecteur, `Outils`.** Deux colonnes, quatre avec la barre latérale seulement (`lg`), de boutons neutres : fond `surface`, filet `hairline`, rayon `lg`, 52 px de haut, icône `primary` à gauche, libellé `text-sm` gras. Pas de couleur par famille : c'est la liste des autres écrans, pas un tableau de bord. « Encaisser » et « Bilan » n'y sont pas, la barre du bas les porte. Un nombre impair d'outils étire le dernier sur deux colonnes : une case vide à sa droite se lirait comme une grille arrêtée en chemin. Le libellé se coupe sur deux lignes au plus (`break-words hyphens-auto line-clamp-2`) au lieu de déborder ou d'être tronqué : à 320 px, « Rapprochement » ne tient pas sur une ligne et passe sur deux.

**Administration, `ActionsRapides`.** Tuiles en aplat de la couleur de leur famille (jetons `tuile*`), sans bordure ni ombre, icône en haut à gauche et libellé court en bas à droite ; 96 px de haut, 128 px dès `sm`, 80 px en variante `compact`. Jusqu'à la refonte de l'administration.

### 4.10 Ligne de liste (mises / transactions)
Avatar → nom (`font-semibold`) + méta (`text-sm` gris) → **montant coloré** aligné à droite : `positive` pour un dépôt, `negative` pour une sortie, `ink` pour une commission. Séparateur hairline sauf sur la dernière ligne.

### 4.11 Badges & statuts
Pilule `rounded-pill`, `text-xs`, fond tinté. **Une seule table**, dans `BadgeStatut` — la maquette en portait trois copies dans trois écrans, dont une en hexadécimaux bruts.

| Statut | Couleur |
|---|---|
| À jour · Actif | `positive` sur `positive-tint` |
| Versé aujourd'hui · Clôturée | `secondary-foreground` sur `secondary` |
| En retard | `negative` sur `negative-tint` |
| En synchro | `info` sur `info-tint` |
| Inactif | `muted-foreground` sur `muted` |

### 4.12 Avatars
Pas de portrait. Un produit qui manipule l'épargne de commerçants n'affiche pas des visages inventés à la place de ses clients : la maquette illustrait, l'application identifie. On dessine les **initiales** sur une pastille dont la couleur est tirée du nom — même nom, même couleur, sur tous les écrans et entre deux sessions. Le texte suit la taille du disque par unité `cqw`, donc une seule implémentation sert de `w-8` à `w-16`.

### 4.13 Data-viz
- **Barres empilées pastel**, palette `chart-*`, coins arrondis, légende avec montants et pourcentages. La pastille de légende porte la même classe que le segment : aucun hexadécimal en double.
- **Jauges d'avancement** : piste `bg-muted`, remplissage `bg-primary` ou `bg-chart-mint`. Seul endroit du produit où subsiste un attribut `style`.
- Toujours des **chiffres tabulaires** et le format FCFA.

### 4.14 Champs de formulaire
Fond `input`, contour `hairline` 1,5 px, `rounded-md`, focus = contour `primary`. Label `text-sm` gras au-dessus. Sélecteur de mise = pilules `500 / 1 000 / 2 000 / 5 000 / 10 000`, plus un champ libre à partir de `MISE_MIN`. Au-delà de `MISE_INHABITUELLE`, une case à cocher s'ouvre sous le champ et retient le montant tant qu'elle n'est pas cochée. Les trois constantes viennent de `@kolek/core`.

Un champ de montant est en `type="text"` avec `inputMode="numeric"`, jamais en `type="number"` : un champ numérique natif refuse l'espace des milliers, et le montant s'afficherait « 10000 » là où tout le reste du produit écrit « 10 000 ».

### 4.15 États
- **Vide :** une carte, une phrase, et ce qui viendra (« La souscription arrive au jalon J2 »).
- **Aucun résultat :** distinct du vide. « Aucun client ne correspond » n'est pas « Aucun client ».
- **Chargement :** texte discret, pas de spinner plein écran.
- **Erreur :** carte à bordure `negative` + bouton de reprise. Jamais un écran blanc muet.
- **Hors-ligne :** bandeau `info-tint`, non bloquant. Le message dit ce qu'on sait vraiment : sans file de synchronisation, il ne prétend pas compter des mises en attente.

### 4.16 Tampon
Le geste qui ne se défait pas laisse une marque, comme au guichet. Cadre double, mot en capitales espacées (Bricolage 800), date et heure en Plex Mono (`02.10 · 11:47`), incliné de six degrés, posé en haut à droite de la carte de collecte : il ne cache ni les cases ni le solde. Quand la carte porte un tampon, le bloc du nom lui réserve sa largeur (`pr-30`, 120 px) : le tampon est posé par-dessus, il ne pousse rien, et un nom long ne passe jamais dessous.

| Mot | Couleur | Quand |
|---|---|---|
| ENCAISSÉ | `positive` | La mise est partie au serveur. |
| GARDÉE | `info` | La mise attend dans la file du téléphone. |
| CLÔTURÉE | `positive` | Le retrait est inscrit. |

Une mise refusée ne reçoit **aucun** tampon : un ENCAISSÉ sur un refus mentirait. Dans le doute, GARDÉE, l'état qui ne promet rien. Le tampon est `aria-hidden` : la ligne d'état (`role="status"`) dit la même chose. Il se plaque en `--duree-toucher` (150 ms, échelle 1,15 vers 1) ; sous `prefers-reduced-motion`, il paraît sans mouvement.

**L'écran Encaisser.** Sur un téléphone court, le bloc « Caisse » et le bloc d'après le paiement sont collants au-dessus de la barre (`sticky bottom-nav`, `lg:static`) : le geste n'est jamais dessous. Après le paiement, le focus va à la ligne d'état : le bouton « Encaisser » qui le portait n'est plus rendu. « Reçu » est là dès que la mise est écrite. Éteint tant qu'elle n'est que gardée sur le téléphone, il est décrit par la phrase d'envoi (`decritPar`) : l'écran des reçus ne lit que le journal du serveur, qui ne la connaît pas encore. Il s'allume quand la mise est partie, et il n'est pas rendu si le serveur la refuse. Il ne surgit jamais sous le pouce : sa place est prise d'avance, car l'envoi arrive un aller-retour après l'appui, quand le pouce vise « Client suivant ».

### 4.17 Décompte
Des lignes « libellé, points de conduite, montant », puis le total sous un double filet `ink`. Les montants en Plex Mono ; une retenue s'écrit `−` (U+2212), espace fine insécable, valeur absolue. Le retrait s'en sert avant le geste : « 31 mises × 1 000 », « Ta commission, case 1 », « À rendre ». La retenue vient de `commission` et le total de `soldeRestituable`, deux fonctions de `@kolek/core` : les lignes tombent sur le total par construction.

### 4.18 Gravure
La signature, et elle se mérite : trois places, pas une de plus (les écrans de connexion mis à part, voir la fin de la section).

1. L'en-tête de l'accueil du collecteur : `Rosace` en filigrane (22 pétales, excentricité 0,38) et `Onde` en pied, or à 15 et 25 %. La rosace ne tourne plus.
2. La bande de l'encaissement : `Onde` seule, or à 30 %.
3. Le bord haut de chaque carte de collecte : `Onde` fine (10 px), vert coffre à 30 %.

Les trois ondes passent `traitFixe` : le trait garde un demi-pixel à l'écran. Sans lui, une bande de 10 à 24 px écrase le trait du `viewBox` entre 0,06 et 0,14 px, et la gravure s'efface.

L'or ne dit jamais un montant ni un état. Les écrans secondaires ne portent pas de gravure. Seuls font exception les trois écrans de connexion (`EcranConnexion`, `MotDePasseOublie`, `NouveauMotDePasse`) : ils portent déjà celle de la vitrine, `Rosace` tournante en or à 15 % et `Onde` en or à 10 %, et la gardent jusqu'à leur refonte (chantier 2).

---

## 5. Adaptation à notre contexte

Cette maquette **est** notre Dashboard Admin. Son contenu de démonstration se traduit en données réelles ainsi :

| Bloc de la maquette | Équivalent Kolek |
|---|---|
| « Free Plan Mode » | **Sans équivalent.** La console est celle de GTCS, qui vend les paliers et n'en souscrit aucun : un indicateur de palier y serait faux pour tout le monde. Retiré le 2026-09-11. |
| Carte bancaire VISA | **Carte de collecte** d'un client (progression 31 cases). |
| Available Balance / Withdraw | **Solde restituable** + action **Retrait / clôture**. |
| Total Earnings + tendance | **Commissions du mois** (admin) / **Encaissé du jour** (collecteur). |
| All Activity (actions rapides) | Les **outils** de l'accueil du collecteur (§4.9) : Souscrire · Retrait · Rapprochement · Reçus · Alertes · Avis · Équipe (titulaire seulement) · Plus. « Encaisser » et « Bilan » n'y sont pas : la barre du bas les porte. |
| Stock Index International | **Top zones / marchés** (encaissé du jour, objectif). |
| Recently Completed (barres) | **Répartition** encaissements / commissions / restitutions. |
| Transactions | **Mises & retraits récents** (dépôt vert, commission neutre, sortie corail). |
| Subscribe now | **Sans équivalent**, pour la même raison. La carte « Passer à Pro » a été retirée le 2026-09-11. |

**Données & langue.** Tout en français, montants en FCFA sans centimes, dates au format local, noms de marchés/zones ivoiriens. Les libellés parlent le métier : mise, carte, cycle, collecteur, rapprochement.

---

## 6. Cohérence sur les deux surfaces

| | App Collecteur (PWA mobile) | Dashboard Admin (web) |
|---|---|---|
| Navigation | Barre du bas, 5 onglets | Barre latérale à sections |
| Densité | Compacte, grandes cibles (44–56 px) | Aérée, plus d'infos par écran |
| Cartes | Pleine largeur, empilées | Grille modulaire de widgets |
| Priorité | Vitesse du geste, hors-ligne | Vue d'ensemble, pilotage |
| **Tokens & composants** | **Identiques** | **Identiques** |

Même palette, même typo, mêmes rayons, mêmes badges. On ne redessine jamais un composant pour une surface : on l'adapte en disposition uniquement.

---

## 7. Règles de cohérence (à respecter partout)

**À faire**
- Utiliser les **classes issues des tokens**, jamais une valeur en dur. `bg-surface`, pas `bg-[#FFFFFF]`.
- Ajouter une valeur visuelle **dans `tokens.ts`**, puis `npm run generer:theme`. Jamais directement dans `theme.css`, qui est engendré.
- Écrire les classes **en toutes lettres**. Tailwind lit le source, il ne l'exécute pas : `` `bg-chart-${i}` `` n'existe dans aucune feuille de style. Un tableau de classes complètes, oui.
- Vert `primary` pour l'action principale ; **une seule** action primaire par écran.
- Chiffres tabulaires et `formatMontant()` partout.
- Un montant qu'on compte en `font-mono`, le nombre seul : jamais la phrase qui l'entoure.
- Toujours afficher l'**état de synchro** sur le terrain.
- Un composant nouveau va dans `packages/ui`, pas dans une application.

**À éviter**
- Un attribut `style` pour autre chose qu'une valeur venue de la donnée.
- Multiplier les couleurs vives ou les dégradés hors éléments héros.
- Mélanger plusieurs jeux d'icônes ou de rayons.
- Un bouton rectangulaire en `rounded-pill`. La pilule est pour les badges et
  les boutons ronds à icône ; un bouton qui porte du texte prend `rounded-md`,
  comme `Bouton`. Quatorze boutons avaient dérivé avant le 2026-09-01 — la
  règle existait déjà, elle n'était juste écrite nulle part sur cette ligne.
- Des montants non alignés, au format `$`, ou avec centimes.
- Un composant « maison » qui n'existe pas dans ce système.
- Un bouton qui n'écrit rien mais laisse croire le contraire. S'il n'est pas branché, il est désactivé et il le dit.

---

## 8. Annexes

### 8.1 Écrans implémentés (flow Banani *Kolek Design System*)

| Écran | Fichier | Données |
|---|---|---|
| Collecteur — Accueil | `apps/collecteur/src/ecrans/Accueil.tsx` | **Supabase** (refondu « Le billet », chantier 1) |
| Collecteur — Liste clients | `apps/collecteur/src/ecrans/Clients.tsx` | **Supabase** |
| Collecteur — Encaisser | `apps/collecteur/src/ecrans/Encaisser.tsx` | **Supabase** (refondu « Le billet », chantier 1) |
| Admin — Tableau de bord | `apps/admin/src/ecrans/TableauDeBord.tsx` | Démonstration (J4) |
| Admin — Collecteurs & Zones | `apps/admin/src/ecrans/Collecteurs.tsx` | Démonstration (J4) |
| Admin — Détail collecteur | `apps/admin/src/ecrans/DetailCollecteur.tsx` | Démonstration (J4) |

### 8.2 Correspondance v1 → v2

| v1 | v2 | Note |
|---|---|---|
| `--green-700` | `--color-primary` | |
| `--green-900` | `--color-sidebar` | |
| `--green-500` | `--color-accent` | |
| `--green-tint` | `--color-secondary` | |
| `--muted` | `--color-muted-foreground` | **Attention** : `--color-muted` existe et désigne une surface. |
| `--r-lg` | `--radius-lg` | `--radius-xl` fixé à 24 px (v1 : « 20–24 px »). |
| `--font-titre-page` | `--text-3xl` | Échelle en t-shirt imposée par Tailwind. |
| `--space-16` | `p-4`, `gap-4`… | Dérivé de `--spacing: 4px`. |
| `--mesure-formulaire` | `--container-formulaire` | Donne `max-w-formulaire`. |
| `genererCssTokens()` | `genererCssTheme()` | Produit `@theme` et non `:root`. |

### 8.3 Écarts assumés avec la maquette Banani

| Écart | Raison |
|---|---|
| Portraits engendrés → initiales | Ne pas inventer le visage d'un client réel ; la CSP interdit les images distantes. |
| Ombres uniformisées sur trois niveaux | La maquette en portait sept variantes proches. §3.5 en définit trois. |
| Hauteurs de canevas (900/960 px) → `min-h-dvh` | Artefacts de l'outil de dessin. |
| Bandeau d'offre hoissé dans la coquille admin | La maquette l'omettait sur la fiche collecteur ; l'état de l'abonnement ne dépend pas de la page. |
| Filtres « En retard / Non visités » remplacés | Ils supposent la date de la dernière mise, que J2a introduit. |
| Chevron au lieu de « … » en fin de ligne collecteur | La ligne ouvre une fiche ; « … » promet un menu qui n'existe pas. |
| Déconnexion ajoutée | Absente de la maquette, indispensable au produit. |

---

*Kolek — Design System v2 · 2026-08-16. Toute nouvelle interface part de ce fichier.*
