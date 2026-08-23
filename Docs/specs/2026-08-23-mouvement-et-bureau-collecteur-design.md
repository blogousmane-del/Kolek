# Kolek — Mouvement et bureau de l'application collecteur · Spécification de conception

> L'application apprend à bouger, et le bureau cesse d'être un grand téléphone.
> Date : 2026-08-23 · Statut : validé, prêt pour plan d'implémentation
> Documents parents : `Kolek Design System.md` · `2026-08-16-j2a-collecte-en-ligne-design.md`

---

## 1. Le constat

Trois faits, vérifiés sur le dépôt et sur ce que Netlify sert réellement :

1. La coquille bureau existe — `NavBureau`, bascule à `lg` (1024 px), colonne
   centrée — mais **seul l'écran d'accueil a été adapté**. Les dix autres écrans
   n'ont aucune règle responsive : sur un écran large, ils restent une colonne
   de téléphone.
2. Le mouvement est quasi absent : une rosace décorative sur la connexion, deux
   `transition` sur des boutons. Aucun retour visuel au changement d'écran, à
   l'entrée d'une liste, à l'appui d'un bouton, à l'encaissement d'une mise.
3. La contrainte terrain n'a pas changé : téléphone d'entrée de gamme, 3G,
   plein soleil. Toute solution qui coûte des kilo-octets ou des frames se paie
   là où le produit gagne sa vie.

### 1.1 Décisions déjà arbitrées

- **CSS pur, zéro dépendance.** Pas de framer-motion (~35 Ko gzip), pas de GSAP.
  Le paquet ne grossit que du CSS, plafond ~4 Ko.
- **Adaptation par densité** sur bureau : chaque écran exploite la largeur selon
  sa nature, sans refonte maître-détail.

### 1.2 Périmètre

**Inclus** : le système de mouvement dans `packages/core` et `packages/ui` ; son
application aux onze écrans du collecteur ; l'adaptation bureau des dix écrans
restants ; la propriété de largeur de `CorpsEcran`.

**Exclu** : l'application d'administration et le site public (le vocabulaire de
mouvement créé ici les servira plus tard, rien n'y est appliqué) ; toute logique
de données ; tout changement d'identité visuelle — couleurs, polices, tokens
restent ceux du Design System.

### 1.3 Critère de réussite

À 390 px, 768 px et 1440 px, chacun des onze écrans est lisible et exploite sa
largeur. Chaque navigation, chaque entrée de liste, chaque appui produit un
retour visuel. Un encaissement se voit récompensé. `prefers-reduced-motion`
éteint tout. La suite de tests passe inchangée, et le paquet JavaScript ne
grossit pas.

---

## 2. Le système de mouvement

### 2.1 Où il vit

Le vocabulaire est déclaré **une fois**, dans `packages/core/src/mouvement.css`,
importé par `base.css` — même logique que la rosace : une animation déclarée
dans la feuille d'une seule application laisserait les autres immobiles. Les
composants partagés (`packages/ui`) et les écrans du collecteur consomment les
classes ; personne ne redéclare de `@keyframes` localement.

### 2.2 Les tokens

```css
:root {
  --duree-toucher: 150ms;   /* retour d'appui, survols */
  --duree-entree: 250ms;    /* entrées d'écran et de liste */
  --duree-signature: 400ms; /* les moments de réussite */
  --courbe-sortie: cubic-bezier(0.16, 1, 0.3, 1);      /* décélération franche */
  --courbe-rebond: cubic-bezier(0.34, 1.56, 0.64, 1);  /* léger dépassement */
}
```

Trois durées, deux courbes, et rien d'autre. Une animation qui a besoin d'une
quatrième durée est une animation qui n'a pas trouvé sa catégorie.

### 2.3 Les cinq primitives

**`anim-entree`** — l'entrée d'un écran : opacité 0→1 et translation verticale
12 px→0, `--duree-entree`, `--courbe-sortie`. Posée sur le conteneur de chaque
écran. La navigation étant un état React (pas de routeur), l'animation se
déclenche naturellement au montage du composant — aucun JavaScript à écrire.

**`anim-cascade`** — l'entrée d'une liste en escalier. Chaque rangée porte
`anim-cascade` et une variable `--rang` posée en style inline par le `map()`
existant ; le délai est `calc(var(--rang) * 40ms)`, plafonné par
`min(calc(var(--rang) * 40ms), 400ms)` — au-delà de dix rangées, l'escalier
devient une attente. `animation-fill-mode: backwards` évite l'éclair de
contenu avant le délai.

**`anim-compteur`** — les grands montants montent de 0 à leur valeur :
`@property --valeur { syntax: '<integer>'; }` + `counter-reset` sur un
pseudo-élément, transition sur `--valeur`. **Repli obligatoire** : la valeur
réelle est toujours dans le document (`<span class="sr-only">`), le compteur
est le pseudo-élément ; un navigateur sans `@property` affiche la valeur
directement. Les lecteurs d'écran lisent le vrai chiffre, jamais le compteur.
Appliqué aux seuls chiffres d'en-tête (encaissé du jour, solde restituable,
total du bilan) — un compteur sur chaque cellule de tableau serait du bruit.

**`anim-pression`** — le retour d'appui : `transform: scale(0.97)` sur
`:active`, transition `--duree-toucher`. Posée sur `Bouton`, les pastilles
d'`ActionsRapides`, les onglets de `NavMobile`, les rangées cliquables. Un
seul endroit par composant partagé — les écrans n'ont rien à faire.

**`anim-reussite`** — les deux moments signature, et eux seuls :

- *Mise encaissée* : la nouvelle case de la carte de collecte se remplit en
  `scale(0)→scale(1)` avec `--courbe-rebond`, et une coche SVG se dessine par
  `stroke-dashoffset` sur `--duree-signature`.
- *Carte clôturée* : le montant restitué entre par `anim-compteur`, le panneau
  de confirmation par `anim-entree` avec `--courbe-rebond`.

C'est le seul endroit où l'on dépasse 250 ms. L'encaissement est le geste qui
fait vivre le produit ; il mérite sa récompense visuelle, et il est le seul.

### 2.4 Les deux règles absolues

1. **`transform` et `opacity` uniquement.** Jamais de `width`, `height`, `top`,
   `margin` animés — c'est la garantie 60 fps sur un téléphone à 60 €. Aucune
   exception, y compris pour les moments signature.
2. **`prefers-reduced-motion: reduce` éteint tout** d'un seul bloc en fin de
   `mouvement.css` :

```css
@media (prefers-reduced-motion: reduce) {
  .anim-entree, .anim-cascade, .anim-compteur::after, .anim-pression, .anim-reussite {
    animation: none;
    transition: none;
  }
}
```

Le contenu reste identique, seul le mouvement disparaît — la règle vaut pour
toute primitive future.

---

## 3. Le bureau — adaptation par densité

### 3.1 Le mécanisme : `CorpsEcran` décide des plafonds

`CorpsEcran` (dans `EnTeteEcran.tsx`) gagne une propriété :

```tsx
largeur?: 'saisie' | 'liste' | 'large';  // défaut : 'liste'
```

| Valeur | Plafond ≥ `lg` | Usage |
|---|---|---|
| `saisie` | 640 px (inchangé) | formulaires — un champ étiré sur 1 400 px est pire, pas mieux |
| `liste` | 860 px | rangées d'historique |
| `large` | 960 px | grilles de cartes |

Un seul endroit connaît les chiffres ; les écrans déclarent leur nature. Les
plafonds deviennent des tokens `--container-*` dans `theme.css`, à côté de
`--container-liste` existant. Le plafond de la coquille (`max-w-liste` sur le
conteneur central) remonte dans `CorpsEcran` — sinon les deux se contrediraient.

**Limite du mécanisme, à connaître :** `CorpsEcran` n'est employé que par les
sept écrans secondaires. `Accueil`, `Clients` et `Encaisser` portent leur propre
mise en page. Les deux premiers reçoivent leur plafond directement par les
mêmes tokens (`lg:max-w-…` sur leur conteneur racine) ; `Encaisser` garde le
comportement actuel de la coquille, qui vaut déjà `saisie`. Pas de refonte de
ces trois écrans pour les faire entrer dans `CorpsEcran` — ce serait du
remaniement sans bénéfice visible.

### 3.2 Écran par écran

| Écran | ≥ 1024 px | Largeur |
|---|---|---|
| Clients | grille de cartes 2 colonnes ; recherche + filtres sur une rangée | `large` (tokens directs — voir §3.1) |
| Retrait | grille 2 colonnes des cartes clôturables | `large` |
| Reçus | rangées pleine largeur, date et montant à droite | `liste` |
| Alertes | idem | `liste` |
| Avis | idem | `liste` |
| Bilan | les 3 tranches côte à côte (`lg:grid-cols-3`) ; indicateurs en rangée de 4 | `large` |
| Rapprochement | colonne inchangée | `saisie` |
| Encaisser | colonne inchangée | `saisie` |
| Plus | fiche 2 colonnes : identité / abonnement | `liste` |
| Accueil | déjà fait — aligné sur les nouveaux tokens sans changement visuel | — |
| En-têtes sombres | `lg:rounded-2xl lg:mx-4 lg:pt-6`, comme l'accueil le fait déjà — appliqué par `EnTeteEcran`, donc une fois | — |

Les grilles 2 colonnes se font en ajoutant `lg:grid lg:grid-cols-2 lg:gap-4`
sur les conteneurs de liste existants — les composants de rangée ne changent
pas. Là où une rangée suppose toute la largeur (date sous le nom), le
passage « à droite » se fait par `lg:flex-row lg:items-baseline` sur la rangée,
pas par un composant nouveau.

### 3.3 Ce que le bureau ne change pas

La barre du bas mobile, la navigation, l'ordre des écrans, les textes. Le
`pt-entete` (encoche) reste — sans effet sur bureau, `env()` y vaut zéro.

---

## 4. Risques nommés

- **La cascade sur une liste re-rendue.** `revision` re-monte les listes après
  chaque écriture ; la cascade rejouerait à chaque encaissement. Règle : la
  cascade ne s'applique qu'au **premier** montage de l'écran (une classe posée
  conditionnellement sur `premierRendu`, mémorisé par `useRef`). Une liste qui
  clignote à chaque écriture est pire que pas d'animation.
- **`@property` et Firefox Android ancien.** Le repli du compteur (§2.3) est
  non négociable : la valeur vraie est dans le document, le compteur est
  décoratif.
- **Le déficit de contraste au soleil.** Aucune animation ne doit passer par des
  états d'opacité longs : l'opacité transitoire ne dure jamais plus que
  `--duree-entree`.

---

## 5. Vérifications

- La suite existante passe inchangée : `npm run verifier` complet.
- Le paquet JavaScript du collecteur ne grossit pas de plus de 1 Ko (le CSS
  peut prendre jusqu'à ~4 Ko).
- Contrôle visuel aux trois largeurs — 390, 768, 1440 px — sur les onze écrans,
  consigné en tableau dans le plan d'implémentation.
- `prefers-reduced-motion` vérifié en émulation : aucun mouvement résiduel.
- Un test unitaire sur la seule logique JavaScript ajoutée : le mémo
  `premierRendu` de la cascade.
