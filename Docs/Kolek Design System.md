# Kolek — Design System v1

> Système de design de référence pour **toutes** les interfaces Kolek : l'App Collecteur (PWA mobile, hors-ligne) et le Dashboard Admin (web). Dérivé de la **maquette de notre Dashboard Admin** (l'image fournie en est la représentation cible), adapté à notre contexte : collecte journalière, FCFA, français, terrain à faible connectivité.
>
> **Règle d'or :** aucune interface ne sort de ce système. Un même token, un même composant, partout.

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

---

## 3. Fondations (tokens)

### 3.1 Couleurs

**Marque & action**

| Token | Hex | Usage |
|---|---|---|
| `--green-900` | `#0E2E1F` | Textes verts profonds, fonds sombres. |
| `--green-700` (primaire) | `#14402C` | Couleur d'action : boutons pleins, état actif, icônes de valeur. |
| `--green-500` | `#1C5A3D` | Survol / secondaire, dégradés. |
| `--green-tint` | `#E8F0EA` | Fond d'état actif (nav), puces, surbrillances douces. |

**Neutres**

| Token | Hex | Usage |
|---|---|---|
| `--ink` | `#171A17` | Texte principal, titres. |
| `--muted` | `#6C716A` | Texte secondaire, étiquettes. |
| `--hairline` | `#E6E3DA` | Bordures, séparateurs (1 px). |
| `--canvas` | `#F4F5F2` | Fond de la zone de contenu. |
| `--surface` | `#FFFFFF` | Cartes, panneaux. |
| `--paper` | `#FBFAF6` | Fond alternatif chaud (documents, sheets). |
| `--dark-canvas` | `#06140E` | Cadre sombre, écran de connexion, mode marketing. |

**Sémantique**

| Token | Hex | Fond (tint) | Usage |
|---|---|---|---|
| `--positive` | `#1C7A4B` | `#E6F3EC` | Dépôt, à jour, montant reçu (+). |
| `--negative` | `#C1553E` | `#F6E4DF` | Retard, sortie, alerte, échéance (−). |
| `--info` | `#3D6E8E` | `#E6EEF4` | Neutre informatif, attention douce, accents graphiques. |

**Data-viz (dégradés pastel, comme le modèle)**

| Token | Hex | Usage |
|---|---|---|
| `--chart-blue` | `#9FC2DA` | 1re série. |
| `--chart-teal` | `#7FB6A6` | 2e série (souvent hachurée). |
| `--chart-mint` | `#B7D9BE` | 3e série. |
| `--chart-slate` | `#AEB7D6` | 4e série (ex. part « commission »). |

### 3.2 Typographie

- **Police UI :** `Plus Jakarta Sans` (repli `Inter`, puis `system-ui`). Géométrique, arrondie, lisible — proche du modèle.
- **Police display / marque :** `Sora` (logo, titres marketing, couvertures).
- **Chiffres :** toujours **tabulaires** (`font-variant-numeric: tabular-nums`) pour aligner les FCFA.

| Style | Taille | Graisse | Usage |
|---|---|---|---|
| Metric XL | 32–40 px | 700 | Grands montants (solde, encours). |
| H1 — titre de page | 28 px | 700 | « Tableau de bord », « Mes clients ». |
| H2 — section | 20 px | 600 | Titres de bloc. |
| H3 — carte | 16 px | 600 | Titres de widget. |
| Body | 15 px | 400/500 | Texte courant. |
| Small / label | 13 px | 500 | Étiquettes, méta. |
| Overline | 11 px | 600 · +8% letter-spacing · MAJUSCULES | Sur-titres de section, en gris. |

**Format FCFA :** séparateur d'espace, suffixe « FCFA », **sans centimes**. Ex. `817 432 FCFA`, `2 500 FCFA`. Les variations en pourcentage gardent une décimale si utile (`+14 %`).

### 3.3 Espacement — base 4 px

`2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`
Padding interne des cartes : **20–24 px** (admin), **16–18 px** (mobile). Gouttière entre widgets : **14–16 px**.

### 3.4 Rayons

| Token | Valeur | Usage |
|---|---|---|
| `--r-sm` | 8 px | Petits éléments, tuiles. |
| `--r-md` | 12 px | Boutons, champs, badges. |
| `--r-lg` | 16 px | Cartes, widgets. |
| `--r-xl` | 20–24 px | Cartes héros, sheets, carte de collecte. |
| `--r-pill` | 9999 px | Pilules, boutons ronds, avatars. |

### 3.5 Élévation

| Token | Valeur | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(20,30,25,.05)` | Cartes posées sur canevas. |
| `--shadow-md` | `0 4px 12px rgba(20,30,25,.08)` | Survol, menus. |
| `--shadow-lg` | `0 12px 32px rgba(6,20,14,.14)` | Sheets, modales, app flottante sur fond sombre. |

Bordure standard des cartes : `1px solid var(--hairline)` **+** `--shadow-sm`. Discret, jamais lourd.

### 3.6 Iconographie

- Style **outline**, trait **1.75 px**, extrémités arrondies. Un seul jeu (ex. Lucide / Phosphor).
- Icônes d'action dans un cercle : contour vert `--green-700` sur fond blanc (comme les actions rapides du modèle).
- Taille par défaut 20 px (24 px pour les cibles tactiles du terrain).

---

## 4. Composants

### 4.1 Navigation
- **Admin (web) — sidebar gauche.** En-tête de contexte déroulant (« Kolek · Admin »). Items icône + label, groupés par sections avec overline gris (« Pilotage », « Monétisation », « Support »). **État actif :** fond `--green-tint`, texte `--green-700`, indicateur à gauche. Carte promo en bas (upsell de palier).
- **Collecteur (mobile) — barre du bas.** 4–5 onglets à grandes cibles (Accueil, Clients, Encaisser, Bilans). Actif = icône pleine + label vert.

### 4.2 Barre supérieure & fil d'Ariane
Fil d'Ariane gris `Accueil → …` puis **titre de page H1**. À droite, **barre d'actions en pilules** (recherche, filtres, « Créer un rapport »). Sur mobile : titre + une action max.

### 4.3 Boutons

| Type | Style |
|---|---|
| **Primaire** | Pilule pleine `--green-700`, texte blanc, icône optionnelle. Survol `--green-500`. |
| **Secondaire** | Pilule contour `--green-700`, fond blanc, texte vert. |
| **Fantôme** | Texte vert sans fond (liens « Edit », « History »). |
| **Icône** | Rond, contour `--hairline`, icône `--ink`. |
| **Danger** | Contour ou plein `--negative` (annuler, supprimer). |

Hauteur : 44–48 px (tactile terrain) / 36–40 px (admin dense).

### 4.4 Pilules de filtre
Fond blanc, contour `--hairline`, texte `--ink`, chevron `--muted`. Actif = fond `--green-tint`. Ex. « Cette semaine ▾ », « Toutes zones ▾ ».

### 4.5 Cartes & surfaces
`--surface`, `--r-lg`, bordure hairline + `--shadow-sm`, padding 20–24. Titre H3 + action fantôme optionnelle en haut à droite.

### 4.6 Carte-statistique (grand nombre)
Étiquette `Small` grise (+ icône œil/expand) → **Metric XL** → **puce de tendance** : petit cercle `--green-tint` avec flèche + « +14 % vs période précédente ». Exemple Kolek : « Encaissé aujourd'hui », « Encours suivi », « Commissions du mois ».

### 4.7 Carte de collecte (héros, dégradé)
Reprend la carte bancaire du modèle : `--r-xl`, **dégradé pastel** (vert menthe → crème), motif discret. Affiche : nom du client, mise journalière, **progression 31 cases**, solde restituable. La progression (31 cases) et le solde restent les repères visuels principaux.

### 4.8 Grille d'actions rapides
Rangées d'icônes rondes (contour vert) + label court. Kolek : **Encaisser, Souscrire, Retrait, Bilan, Rapprochement, Reçus, Alertes, Plus**.

### 4.9 Ligne de liste (mises / transactions)
Avatar rond (initiales sur fond coloré) → nom (`Body 500`) + méta date/heure (`Small` gris) → **montant coloré** aligné à droite : `--positive` pour un dépôt, `--negative` pour une sortie, `--ink` (neutre) pour une commission. Séparateur hairline.

### 4.10 Badges & statuts
Pilule `--r-pill`, texte 11 px, fond tinté.

| Statut | Couleur |
|---|---|
| À jour | `--positive` sur `#E6F3EC` |
| Versé aujourd'hui | `--green-700` sur `--green-tint` |
| En retard | `--negative` sur `#F6E4DF` |
| Prête à clôturer | `--info` sur `#E6EEF4` |
| Hors-ligne / en attente de synchro | `--muted` sur `#EFEFEA` |

### 4.11 Data-viz
- **Barres empilées pastel** (répartition), palette `--chart-*`, coins arrondis, légende avec montants + %.
- **Puce de tendance** (voir 4.6).
- **Anneau/jauge** pour la progression d'un cycle (x/31).
- Toujours des **chiffres tabulaires** et le format FCFA.

### 4.12 Champs de formulaire
Fond blanc, contour `--hairline` 1.5 px, `--r-md`, focus = contour `--green-700`. Label `Small` gras au-dessus. Sélecteur de mise = pilules `500 / 1 000 / 2 000 / 5 000 / 10 000`.

### 4.13 États
- **Vide :** illustration légère + une phrase + une action primaire.
- **Chargement :** squelettes gris clair (pas de spinner plein écran).
- **Hors-ligne (spécifique Kolek) :** bandeau discret `--info` en haut : « Hors ligne · N mise(s) en attente de synchro ». Jamais bloquant.

---

## 5. Adaptation à notre contexte

Cette maquette **est** notre Dashboard Admin. Son contenu de démonstration se traduit en données réelles ainsi :

**Contenu placeholder de la maquette → données réelles Kolek**

| Bloc de la maquette | Équivalent Kolek |
|---|---|
| « Free Plan Mode » | Indicateur de **palier** (Essai / Standard / Pro / Illimité). |
| Carte bancaire VISA | **Carte de collecte** d'un client (progression 31 cases). |
| Available Balance / Withdraw | **Solde restituable** + action **Retrait / clôture**. |
| Total Earnings + tendance | **Commissions du mois** (admin) / **Encaissé du jour** (collecteur). |
| All Activity (actions rapides) | Encaisser · Souscrire · Retrait · Bilan · Rapprochement. |
| Stock Index International | **Top clients** ou **zones/marchés** (régularité, encours). |
| Recently Completed (barres) | **Répartition** encaissements / commissions / restitutions. |
| Transactions | **Mises & retraits récents** (dépôt vert, commission neutre, sortie corail). |
| Subscribe now | **Upsell de palier** (passer à Pro / Illimité). |

**Données & langue.** Tout en français, montants en FCFA sans centimes, dates au format local, noms de marchés/zones ivoiriens. Les libellés parlent le métier : mise, carte, cycle, collecteur, rapprochement.

---

## 6. Cohérence sur les deux surfaces

La maquette fournie cadre le **Dashboard Admin**. L'**App Collecteur** n'a pas de maquette dédiée mais réutilise exactement les mêmes tokens et composants — c'est ce qui garantit qu'on reconnaît Kolek d'une surface à l'autre.

| | App Collecteur (PWA mobile) | Dashboard Admin (web) |
|---|---|---|
| Navigation | Barre du bas, 4–5 onglets | Sidebar gauche à sections |
| Densité | Compacte, grandes cibles (44–48 px) | Aérée, plus d'infos par écran |
| Cartes | Pleine largeur, empilées | Grille modulaire de widgets |
| Priorité | Vitesse du geste, hors-ligne | Vue d'ensemble, pilotage |
| **Tokens & composants** | **Identiques** | **Identiques** |

Même palette, même typo, mêmes rayons, mêmes badges. On ne redessine jamais un composant pour une surface : on l'adapte en disposition uniquement.

---

## 7. Règles de cohérence (à respecter partout)

**À faire**
- Utiliser les **tokens**, jamais une valeur en dur.
- Vert `--green-700` pour l'action principale ; **une seule** action primaire par écran.
- **S'en tenir à la palette** (vert, neutres, vert/corail, pastels) : aucune couleur hors tokens.
- Chiffres tabulaires + format FCFA partout.
- Toujours afficher l'**état de synchro** sur le terrain.

**À éviter**
- Multiplier les couleurs vives ou les dégradés hors éléments héros.
- Mélanger plusieurs jeux d'icônes ou de rayons.
- Des montants non alignés / au format `$` / avec centimes.
- Un composant « maison » qui n'existe pas dans ce système.

---

*Kolek — Design System v1 · à faire vivre avec le produit. Toute nouvelle interface part de ce fichier.*
