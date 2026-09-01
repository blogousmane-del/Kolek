# Kolek — Design System v2

> Système de design de référence pour **toutes** les interfaces Kolek : l'App Collecteur (PWA mobile, hors-ligne) et le Dashboard Admin (web). Dérivé de la **maquette de notre Dashboard Admin** (l'image fournie en est la représentation cible), adapté à notre contexte : collecte journalière, FCFA, français, terrain à faible connectivité.
>
> **Règle d'or :** aucune interface ne sort de ce système. Un même token, un même composant, partout.
>
> **v2 — 2026-08-16.** Les six écrans dessinés dans Banani (flow *Kolek Design System*) sont implémentés. Les tokens ne sont plus injectés à l'exécution : ils engendrent le thème Tailwind au build. Les noms ont changé en conséquence — voir §3 et la table de correspondance §8.2.

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
- **Aucun or dans l'interface** : on colle strictement à la maquette (vert profond, neutres, vert/corail sémantiques, pastels de graphique). Décision actée.

---

## 2. Principes de design Kolek

1. **Clarté financière d'abord.** Un chiffre important se lit en une fraction de seconde : gros, gras, aligné (chiffres tabulaires).
2. **Confiance.** Vert profond + neutres : sérieux et sobre. Jamais criard.
3. **Hors-ligne d'abord.** Chaque écran doit rester lisible et utilisable sans réseau ; un état de synchro est toujours visible.
4. **Densité maîtrisée.** Aéré côté admin ; compact et à grandes cibles tactiles côté terrain.
5. **Cohérence absolue.** Les deux applications partagent tokens et composants. Ce qui change, c'est la disposition, pas le langage visuel.
6. **Palette resserrée.** Vert, neutres, vert/corail sémantiques, pastels de graphique — rien d'autre. La discipline fait la cohérence.
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
| `--color-muted` | `#EFEFEA` | **Surface** muette : piste de jauge, en-tête de tableau. |
| `--color-hairline` / `--color-border` | `#E6E3DA` | Bordures, séparateurs (1 px). |
| `--color-canvas` / `--color-background` | `#F4F5F2` | Fond de la zone de contenu. |
| `--color-surface` / `--color-input` | `#FFFFFF` | Cartes, panneaux, champs. |
| `--color-paper` | `#FBFAF6` | Fond alternatif chaud (documents, sheets). |
| `--color-dark-canvas` | `#06140E` | Cadre sombre, écran de connexion. |

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
| `--color-chart-blue` | `#9FC2DA` | 1re série. |
| `--color-chart-teal` | `#7FB6A6` | 2e série. |
| `--color-chart-mint` | `#B7D9BE` | 3e série ; indicateur actif sur fond sombre. |
| `--color-chart-slate` | `#AEB7D6` | 4e série (ex. part « commission »). |

**Dégradés.** Ils ne tombent dans aucun espace de noms Tailwind : aucune classe n'en sort, et on les consomme par `bg-[image:var(--degrade-carte)]`. Les garder dans `tokens.ts` est ce qui empêche la carte de collecte et la carte de zone de diverger.

| Token | Usage |
|---|---|
| `--degrade-carte` | Carte de collecte (héros). |
| `--degrade-promo` | Carte d'upsell en pied de barre latérale. |
| `--degrade-zone-0…3` | Bandeau de tête des cartes de zone, par index. |

### 3.2 Typographie

- **Police UI :** `Plus Jakarta Sans` (repli `Inter`, puis `system-ui`) → `--font-body`, classe `font-body`.
- **Police display / marque :** `Sora` → `--font-headings`, classe `font-headings`.
- **Distribution :** paquets `@fontsource`, **sous-ensemble latin uniquement**. Pas de Google Fonts : la CSP interdit `font-src` distant, et un collecteur en 3G ne doit pas attendre un serveur tiers pour lire un montant.
- **Chiffres :** toujours **tabulaires** (classe `tabular-nums`) pour aligner les FCFA.

| Style | Classe | Taille | Graisse | Usage |
|---|---|---|---|---|
| Metric XL | `text-4xl` | 36 px | 700 | Grands montants (solde, encours). |
| H1 — titre de page | `text-3xl` | 28 px | 700 | « Tableau de bord », « Mes clients ». |
| Montant de carte | `text-2xl` | 24 px | 700 | Solde restituable, saisie de mise. |
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

| Token | Classe | Valeur | Usage |
|---|---|---|---|
| `--radius-sm` | `rounded-sm` | 8 px | Petits éléments, cases de cycle, pastilles de légende. |
| `--radius-md` | `rounded-md` | 12 px | **Tous les boutons rectangulaires**, champs, blocs. |
| `--radius-lg` | `rounded-lg` | 16 px | Cartes, widgets. |
| `--radius-xl` | `rounded-xl` | 24 px | Cartes héros, cadre de l'application admin, carte de collecte. |
| `--radius-pill` | `rounded-pill` | 9999 px | Badges et pastilles, boutons **ronds** à icône seule, avatars, points, barres de progression. Jamais un bouton qui porte du texte. |

### 3.5 Élévation

| Token | Classe | Valeur | Usage |
|---|---|---|---|
| `--shadow-sm` | `shadow-sm` | `0 1px 2px rgba(20,30,25,.05)` | Cartes posées sur canevas. |
| `--shadow-md` | `shadow-md` | `0 4px 12px rgba(20,30,25,.08)` | Cartes flottantes, bandeaux de résumé. |
| `--shadow-lg` | `shadow-lg` | `0 12px 32px rgba(6,20,14,.14)` | Cadre de l'application admin sur fond sombre, écrans de blocage. |
| `--shadow-action` | `shadow-action` | `0 4px 12px rgba(20,64,44,.25)` | **Uniquement** le bouton d'encaissement de la barre mobile. |

`shadow-action` n'est pas un quatrième niveau d'élévation : c'est une couleur portée. C'est la seule surface du produit qui projette du vert, et elle désigne le geste central du métier.

Bordure standard des cartes : `border border-hairline` **+** `shadow-sm`. Discret, jamais lourd.

### 3.6 Iconographie

- Jeu unique **Lucide**, style outline, trait **1.75 px**, extrémités arrondies. Le composant `Icone` fixe le trait ; aucun écran ne le règle.
- Le registre d'icônes est **explicite** : `packages/ui/src/Icone.tsx` déclare nommément celles que le produit dessine. Une icône non déclarée est une erreur de compilation. Un composant qui résoudrait le nom à l'exécution embarquerait le jeu Lucide entier dans un paquet destiné à un téléphone en 3G.
- Icônes d'action dans un cercle : contour `primary` sur fond blanc.
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
| `CarteCollecte` | `CarteCollecte.tsx` | Carte héros à 31 cases (§4.4). |
| `CarteZone` | `CarteZone.tsx` | Résumé d'un marché, bandeau dégradé indexé. |
| `LigneTransaction` | `LigneTransaction.tsx` | Mise / retrait / commission, montant coloré. |
| `LigneCollecteur` | `LigneCollecteur.tsx` | Ligne de tableau admin. |
| `BarreEmpilee` | `BarreEmpilee.tsx` | Répartition pastel + légende. |
| `BarreLaterale` | `BarreLaterale.tsx` | Navigation admin, entrées à venir grisées. |
| `BarreHaute` | `BarreHaute.tsx` | Fil d'Ariane + titre + actions en pilules. |
| `NavMobile` | `NavMobile.tsx` | Barre du bas, onglet d'encaissement saillant. |
| `ActionsRapides` | `ActionsRapides.tsx` | Grille d'icônes rondes, variante compacte. |
| `BandeauOffre`, `BandeauHorsLigne`, `useEnLigne` | `Bandeaux.tsx` | Palier d'abonnement, état réseau. |
| `EcranConnexion` | `EcranConnexion.tsx` | Formulaire de connexion partagé. |
| `EcranMessage` | `EcranMessage.tsx` | Écran de blocage : filet, portillon, indisponibilité. |
| `Filet` | `Filet.tsx` | Frontière d'erreur de rendu. |

### 4.2 Navigation
- **Admin (web) — barre latérale gauche.** En-tête de contexte (« Kolek · Admin »). Items icône + label, groupés par overline gris (« Pilotage », « Raccourcis »). **État actif :** fond `bg-white/10`, filet gauche `border-chart-mint`, icône menthe. **Entrée à venir :** contraste réduit, `disabled`, attribut `title`. Pas d'étiquette « à venir » visible — elle volait la largeur du libellé et le faisait passer sur deux lignes. Carte promo en bas, sortie de session juste au-dessus.
- **Collecteur (mobile) — barre du bas.** Cinq onglets à grandes cibles. L'onglet **Encaisser** sort de la barre : pastille pleine de 56 px, ombre `shadow-action`. La barre est `sticky bottom-0` : une liste de clients dépasse la hauteur d'un téléphone, et une barre qui part au défilement oblige à remonter avant chaque encaissement.

### 4.3 Barre supérieure & fil d'Ariane
Fil d'Ariane gris `Accueil → …` puis **titre de page** `text-3xl`. À droite, **barre d'actions en pilules**. Sur mobile : en-tête sombre, titre centré, une action de chaque côté.

### 4.4 Carte de collecte (héros, dégradé)
`rounded-xl`, `--degrade-carte`, deux cercles décoratifs en dégradé radial. Affiche : cycle, nom du client, mise journalière, **progression sur 31 cases** en grille de 16 colonnes, solde restituable, avancement en pourcentage. Le nombre de cases vient de `MISES_PAR_CYCLE` dans `@kolek/core` : c'est une règle du métier, pas une valeur de maquette.

### 4.5 Boutons

| Variante | Style |
|---|---|
| **Primaire** | Pilule pleine `primary`, texte blanc, icône optionnelle. |
| **Contour** | Pilule contour `primary`, fond blanc, texte vert. |
| **Fantôme** | Texte vert sans fond. |
| **Icône** | Rond, contour `hairline`, icône `muted-foreground`. |

Hauteur minimale **44 px** partout, admin compris. Le collecteur tape debout, à une main, sur un téléphone d'entrée de gamme, parfois sous le soleil d'un marché ; c'est une cible tactile, pas une préférence esthétique.

### 4.6 Pilules de filtre
Fond blanc, contour `hairline`, texte `ink`, chevron `muted-foreground`. Actif = fond `primary`, texte blanc.

### 4.7 Cartes & surfaces
`bg-surface`, `rounded-lg`, `border border-hairline` + `shadow-sm`. Titre `text-lg` + lien fantôme optionnel en haut à droite. **Une seule définition**, dans `Carte` : la maquette recopiait cette combinaison dans une quinzaine d'endroits avec trois valeurs d'ombre légèrement différentes.

### 4.8 Carte-statistique
Étiquette `text-sm` grise + icône cerclée → **Metric XL** `tabular-nums` + unité → **puce de tendance** tintée avec flèche et « vs période précédente ».

### 4.9 Grille d'actions rapides
Icônes rondes à contour vert + label court : **Encaisser, Souscrire, Retrait, Bilan, Rapproch., Reçus, Alertes, Plus**. Variante `compact` (48 px) pour le Dashboard.

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

---

## 5. Adaptation à notre contexte

Cette maquette **est** notre Dashboard Admin. Son contenu de démonstration se traduit en données réelles ainsi :

| Bloc de la maquette | Équivalent Kolek |
|---|---|
| « Free Plan Mode » | Indicateur de **palier** (Essai / Standard / Pro / Illimité). |
| Carte bancaire VISA | **Carte de collecte** d'un client (progression 31 cases). |
| Available Balance / Withdraw | **Solde restituable** + action **Retrait / clôture**. |
| Total Earnings + tendance | **Commissions du mois** (admin) / **Encaissé du jour** (collecteur). |
| All Activity (actions rapides) | Encaisser · Souscrire · Retrait · Bilan · Rapprochement. |
| Stock Index International | **Top zones / marchés** (encaissé du jour, objectif). |
| Recently Completed (barres) | **Répartition** encaissements / commissions / restitutions. |
| Transactions | **Mises & retraits récents** (dépôt vert, commission neutre, sortie corail). |
| Subscribe now | **Upsell de palier** (passer à Pro / Illimité). |

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
| Collecteur — Accueil | `apps/collecteur/src/ecrans/Accueil.tsx` | Démonstration (J2a) |
| Collecteur — Liste clients | `apps/collecteur/src/ecrans/Clients.tsx` | **Supabase** |
| Collecteur — Encaisser | `apps/collecteur/src/ecrans/Encaisser.tsx` | Démonstration (J2a) |
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
