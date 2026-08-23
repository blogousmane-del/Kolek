# Mouvement et bureau de l'application collecteur — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à l'application collecteur un vocabulaire de mouvement cohérent et faire que ses onze écrans exploitent la largeur disponible, du téléphone au bureau — sans ajouter un octet de JavaScript.

**Architecture:** Un fichier CSS unique dans `packages/core` déclare cinq primitives d'animation et leurs tokens ; `base.css` l'importe, donc les trois applications en héritent. Les composants partagés de `packages/ui` portent le retour d'appui une fois pour toutes. Côté bureau, `CorpsEcran` gagne une propriété de largeur qui centralise les trois plafonds, et chaque écran déclare sa nature au lieu de recopier des points de rupture.

**Tech Stack:** CSS moderne (`@keyframes`, `@property`, variables personnalisées), Tailwind v4 (`@utility`, `@theme`), React 19, Vite, Vitest.

**Spécification de référence :** `Docs/specs/2026-08-23-mouvement-et-bureau-collecteur-design.md`

## Global Constraints

- **`transform` et `opacity` uniquement.** Jamais de `width`, `height`, `top`, `margin`, `left` animés. Aucune exception, y compris pour les moments signature. C'est la garantie 60 fps sur un téléphone d'entrée de gamme.
- **`prefers-reduced-motion: reduce` éteint tout mouvement**, en un seul bloc, en fin de `mouvement.css`. Le contenu reste identique.
- **Trois durées, deux courbes, rien d'autre.** `--duree-toucher: 150ms`, `--duree-entree: 250ms`, `--duree-signature: 400ms`, `--courbe-sortie: cubic-bezier(0.16, 1, 0.3, 1)`, `--courbe-rebond: cubic-bezier(0.34, 1.56, 0.64, 1)`.
- **Zéro dépendance nouvelle.** Pas de framer-motion, pas de GSAP. Le paquet JavaScript ne doit pas grossir de plus de 1 Ko ; le CSS peut prendre jusqu'à 4 Ko.
- **Aucune logique de données touchée.** Ni appel, ni lecture, ni écriture, ni test métier existant.
- **Aucun changement d'identité visuelle.** Couleurs, polices et tokens du Design System restent. On ajoute une couche, on ne redessine pas.
- **Trois plafonds de largeur**, et eux seuls : `saisie` 640 px, `liste` 860 px, `large` 960 px.
- **Langue :** interface et commentaires en français. Commits en français, préfixe conventionnel.
- **Périmètre :** application collecteur seulement. Le site public et l'administration ne sont pas touchés.

---

## Structure de fichiers

| Fichier | Responsabilité |
|---|---|
| `packages/core/src/mouvement.css` | **Créer.** Les tokens de durée et de courbe, les cinq primitives, le bloc `prefers-reduced-motion`. Seul endroit du dépôt où vivent des `@keyframes` d'interface. |
| `packages/core/src/base.css` | **Modifier.** Importer `mouvement.css`. Y déplacer la rosace serait du remaniement gratuit : elle reste où elle est. |
| `packages/core/src/theme.css:57` | **Modifier.** Deux tokens de conteneur : `--container-large: 960px`, `--container-page: 860px`. |
| `packages/ui/src/Bouton.tsx:49-53` | **Modifier.** Ajouter `anim-pression`. |
| `packages/ui/src/ActionsRapides.tsx:44` | **Modifier.** Ajouter `anim-pression` sur les pastilles. |
| `packages/ui/src/NavMobile.tsx` | **Modifier.** Ajouter `anim-pression` sur les cinq onglets. |
| `packages/ui/src/CarteCollecte.tsx:53-58` | **Modifier.** La case fraîchement remplie entre en `anim-case`. |
| `apps/collecteur/src/premier-rendu.ts` | **Créer.** Le seul JavaScript du lot : le mémo qui empêche la cascade de rejouer. |
| `apps/collecteur/src/ecrans/EnTeteEcran.tsx` | **Modifier.** `CorpsEcran` gagne `largeur` ; `EnTeteEcran` gagne l'arrondi bureau et `anim-entree`. |
| `apps/collecteur/src/Coquille.tsx:209` | **Modifier.** Le plafond descend dans `CorpsEcran` : le conteneur central le perd. |
| `apps/collecteur/src/ecrans/{Recus,Alertes,Avis,Bilan,Retrait,Plus,Rapprochement}.tsx` | **Modifier.** Déclarer `largeur`, poser la cascade, poser les grilles. |
| `apps/collecteur/src/ecrans/{Accueil,Clients,Encaisser}.tsx` | **Modifier.** Ces trois-là n'emploient pas `CorpsEcran` : plafond par token direct, cascade et entrée posées à la main. |

Tests : `apps/collecteur/src/premier-rendu.test.ts` (créer).

### Une convention de lecture

Plusieurs étapes portent la mention `${/* les classes existantes */ ''}` dans un
gabarit de classe. Ce n'est pas un trou à combler au jugé : cela veut dire
**relire la ligne dans le fichier et conserver ses classes telles quelles**, en
ajoutant seulement ce que l'étape demande. Ces classes portent des états
conditionnels — carte remplie ou vide, alerte selon sa gravité — qu'une
réécriture de mémoire casserait sans qu'aucun test ne le voie.

---

## Task 1: Le vocabulaire de mouvement

**Files:**
- Create: `packages/core/src/mouvement.css`
- Modify: `packages/core/src/base.css` (ligne 1, ajouter l'import)
- Modify: `packages/core/src/theme.css:57` (deux tokens de conteneur)

**Interfaces:**
- Consumes: rien.
- Produces: les classes `anim-entree`, `anim-cascade`, `anim-compteur`, `anim-pression`, `anim-case`, `anim-reussite` ; les variables `--duree-toucher`, `--duree-entree`, `--duree-signature`, `--courbe-sortie`, `--courbe-rebond` ; les utilitaires Tailwind `max-w-large` (960 px) et `max-w-page` (860 px) issus des tokens `--container-*`.

- [ ] **Step 1: Écrire la feuille de mouvement**

Créer `packages/core/src/mouvement.css` :

```css
/* Le vocabulaire de mouvement de Kolek.
 *
 * Déclaré ici, et nulle part ailleurs. Une animation écrite dans la feuille
 * d'une seule application laisserait les deux autres immobiles — c'est la
 * raison qui a fait remonter la rosace dans `base.css` le 2026-08-23, et elle
 * vaut pour tout le reste.
 *
 * ## Deux règles qui ne se négocient pas
 *
 * 1. **`transform` et `opacity` uniquement.** Animer `width`, `height`, `top`
 *    ou `margin` force le navigateur à recalculer la mise en page à chaque
 *    frame. Sur le téléphone d'entrée de gamme où ce produit passe sa vie,
 *    c'est la différence entre 60 images par seconde et une saccade visible.
 *    Ces deux propriétés-là sont les seules que le compositeur sait traiter
 *    sans repasser par la mise en page.
 *
 * 2. **`prefers-reduced-motion` éteint tout**, en bas de ce fichier. Le
 *    contenu ne change pas, seul le mouvement disparaît.
 *
 * ## Trois durées, deux courbes
 *
 * Une animation qui réclame une quatrième durée est une animation qui n'a pas
 * trouvé sa catégorie. Le vocabulaire est volontairement pauvre : c'est ce qui
 * fait qu'un produit paraît d'une seule main.
 */

:root {
  --duree-toucher: 150ms;
  --duree-entree: 250ms;
  --duree-signature: 400ms;

  /* Décélération franche : le mouvement part vite et se pose. C'est ce qui
     donne l'impression de réactivité même quand la durée est identique. */
  --courbe-sortie: cubic-bezier(0.16, 1, 0.3, 1);
  /* Léger dépassement, réservé aux moments de réussite. */
  --courbe-rebond: cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* ------------------------------ 1. Entrée -------------------------------- */

/* L'entrée d'un écran. La navigation du collecteur est un état React, pas un
   routeur : le composant se monte, l'animation part. Aucun JavaScript. */
@keyframes kolek-entree {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}

@utility anim-entree {
  animation: kolek-entree var(--duree-entree) var(--courbe-sortie) both;
}

/* ------------------------------ 2. Cascade ------------------------------- */

/* Les rangées d'une liste entrent en escalier. Chaque rangée porte son rang
   dans `--rang`, posé en style inline par le `map()` qui la produit.

   Le délai est plafonné à 400 ms : au-delà de dix rangées, l'escalier cesse
   d'être une élégance et devient une attente. Un collecteur qui ouvre sa liste
   de clients veut la voir, pas la regarder arriver.

   `both` couvre `backwards` : sans lui, chaque rangée s'affiche à sa position
   finale puis disparaît le temps de son délai — un clignotement pire que pas
   d'animation du tout. */
@keyframes kolek-cascade {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@utility anim-cascade {
  animation: kolek-cascade var(--duree-entree) var(--courbe-sortie) both;
  animation-delay: min(calc(var(--rang, 0) * 40ms), 400ms);
}

/* ------------------------------ 3. Compteur ------------------------------ */

/* Les grands montants montent de zéro à leur valeur.
 *
 * ## Le repli n'est pas optionnel
 *
 * `@property` n'est pas partout, et un montant est la donnée la plus
 * importante de cet écran. La valeur vraie est donc **toujours** dans le
 * document, dans un élément que les lecteurs d'écran lisent ; le compteur
 * animé est un pseudo-élément décoratif, masqué à l'accessibilité. Un
 * navigateur qui ignore `@property` affiche la valeur, sans animation, et
 * personne ne perd rien.
 *
 * Réservé aux chiffres d'en-tête — encaissé du jour, solde restituable, total
 * du bilan. Un compteur sur chaque cellule d'un tableau serait du bruit.
 */
@property --kolek-valeur {
  syntax: '<integer>';
  initial-value: 0;
  inherits: false;
}

@utility anim-compteur {
  counter-reset: kolek-compteur var(--kolek-valeur);
  transition: --kolek-valeur var(--duree-signature) var(--courbe-sortie);

  /* `@starting-style` est ce qui fait partir la montée au premier rendu. Sans
     lui, la valeur est déjà à sa cible quand l'élément apparaît : rien ne
     change, donc rien ne transitionne, et le compteur affiche le montant final
     sans jamais monter. L'alternative serait de poser 0 puis la valeur depuis
     un effet React — du JavaScript par frame pour un effet décoratif. */
  @starting-style {
    --kolek-valeur: 0;
  }
}

/* La valeur cible est posée en style inline sur l'élément. */
@utility anim-compteur-cible {
  &::after {
    content: counter(kolek-compteur);
  }
}

/* ------------------------------ 4. Pression ------------------------------ */

/* Le retour d'appui. Posé une fois sur chaque composant partagé cliquable,
   jamais sur un écran : c'est ce qui garantit que toutes les cibles tactiles
   du produit répondent de la même façon.

   `scale(0.97)` et non `0.9` : le doigt couvre déjà la cible, l'effet se
   perçoit à la périphérie. Trop de réduction donne l'impression que le bouton
   s'enfonce dans l'écran. */
@utility anim-pression {
  transition: transform var(--duree-toucher) var(--courbe-sortie);

  &:active {
    transform: scale(0.97);
  }
}

/* ------------------------------ 5. Réussite ------------------------------ */

/* Les deux moments signature, et eux seuls : la mise encaissée et la carte
   clôturée. C'est le seul endroit du produit qui dépasse 250 ms.
 *
 * L'encaissement est le geste qui fait vivre Kolek. Un collecteur le répète
 * trente fois par jour, debout, devant sa cliente. Qu'il ait une récompense
 * visuelle n'est pas de la décoration : c'est la confirmation que l'argent est
 * enregistré, lisible d'un coup d'œil et sans lire un mot. */
@keyframes kolek-case {
  from {
    transform: scale(0);
  }
}

@utility anim-case {
  animation: kolek-case var(--duree-signature) var(--courbe-rebond) both;
}

@keyframes kolek-reussite {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
}

@utility anim-reussite {
  animation: kolek-reussite var(--duree-signature) var(--courbe-rebond) both;
}

/* La coche qui se dessine. `stroke-dashoffset` est une propriété de tracé, pas
   de mise en page : elle n'entraîne aucun recalcul. */
@keyframes kolek-coche {
  from {
    stroke-dashoffset: 24;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@utility anim-coche {
  stroke-dasharray: 24;
  animation: kolek-coche var(--duree-signature) var(--courbe-sortie) both;
}

/* ------------------------- Le commutateur général ------------------------ */

/* Un seul bloc, en bas du fichier, qui couvre toute primitive présente et
   future. Une exception ajoutée ailleurs finirait par échapper à cette règle. */
@media (prefers-reduced-motion: reduce) {
  .anim-entree,
  .anim-cascade,
  .anim-compteur,
  .anim-pression,
  .anim-case,
  .anim-reussite,
  .anim-coche {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 2: Importer la feuille**

Dans `packages/core/src/base.css`, ajouter en toute première ligne du fichier :

```css
@import './mouvement.css';
```

- [ ] **Step 3: Ajouter les deux tokens de conteneur**

Dans `packages/core/src/theme.css`, après la ligne `--container-liste: 640px;` :

```css
  /* Les deux plafonds bureau, ajoutés le 2026-08-23. `liste` (640) reste le
     plafond des écrans de saisie : un champ étiré sur 1 400 px est plus dur à
     remplir, pas plus facile. `page` sert aux rangées d'historique, `large`
     aux grilles de cartes à deux colonnes. */
  --container-page: 860px;
  --container-large: 960px;
```

- [ ] **Step 4: Vérifier que la feuille compile**

Run: `npm run build --workspace @kolek/collecteur`
Expected: construction sans erreur. Tailwind v4 lit `@utility` et `@property` sans configuration supplémentaire.

- [ ] **Step 5: Vérifier que les classes sont bien produites**

Run: `grep -c "kolek-entree\|kolek-cascade\|anim-pression" apps/collecteur/dist/assets/*.css`
Expected: un nombre supérieur à zéro. Si zéro, les classes ne sont utilisées nulle part encore — c'est normal à ce stade pour les `@utility`, qui ne sortent qu'à l'usage. Passer à l'étape suivante et revérifier après la tâche 3.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/mouvement.css packages/core/src/base.css packages/core/src/theme.css
git commit -m "feat(mouvement): le vocabulaire d'animation, trois durées et deux courbes"
```

---

## Task 2: Le mémo qui empêche la cascade de rejouer

**Files:**
- Create: `apps/collecteur/src/premier-rendu.ts`
- Test: `apps/collecteur/src/premier-rendu.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `usePremierRendu(): boolean` — vrai au premier rendu du composant, faux à tous les suivants. `rangCascade(index: number, premier: boolean): CSSProperties | undefined`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `apps/collecteur/src/premier-rendu.test.ts` :

```ts
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { rangCascade, usePremierRendu } from './premier-rendu';

/**
 * Le défaut que ce module existe pour empêcher.
 *
 * Les listes du collecteur se relisent après chaque écriture : la coquille
 * incrémente `revision`, et l'écran se re-rend. Sans mémo, la cascade
 * rejouerait à chaque mise encaissée — la liste clignoterait sous les yeux du
 * collecteur, trente fois par jour, au moment précis où il vérifie que
 * l'argent est bien enregistré.
 *
 * Une animation qui se déclenche au mauvais moment est pire que pas
 * d'animation du tout.
 */

describe('usePremierRendu', () => {
  it('rend vrai au premier rendu', () => {
    const { result } = renderHook(() => usePremierRendu());
    expect(result.current).toBe(true);
  });

  it('rend faux dès le second rendu', () => {
    const { result, rerender } = renderHook(() => usePremierRendu());
    rerender();
    expect(result.current).toBe(false);
  });

  it('reste faux après plusieurs re-rendus', () => {
    const { result, rerender } = renderHook(() => usePremierRendu());
    rerender();
    rerender();
    rerender();
    expect(result.current).toBe(false);
  });
});

describe('rangCascade', () => {
  it('pose le rang quand c’est le premier rendu', () => {
    expect(rangCascade(3, true)).toEqual({ '--rang': 3 });
  });

  it('ne pose rien quand ce n’est pas le premier rendu', () => {
    expect(rangCascade(3, false)).toBeUndefined();
  });

  it('pose zéro pour la première rangée', () => {
    expect(rangCascade(0, true)).toEqual({ '--rang': 0 });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test --workspace @kolek/collecteur`
Expected: FAIL — `Cannot find module './premier-rendu'`.

Si `@testing-library/react` manque dans `apps/collecteur`, l'ajouter :
`npm install --save-dev --workspace @kolek/collecteur @testing-library/react`

- [ ] **Step 3: Écrire le module**

Créer `apps/collecteur/src/premier-rendu.ts` :

```ts
import { useRef, type CSSProperties } from 'react';

/**
 * Vrai au premier rendu d'un composant, faux ensuite.
 *
 * Sert à n'animer une liste qu'à son apparition. Les écrans du collecteur se
 * re-rendent à chaque écriture — la coquille incrémente `revision` après une
 * mise encaissée, et la liste se relit. Rejouer la cascade à ce moment-là
 * ferait clignoter la liste au moment exact où le collecteur vérifie que
 * l'argent est enregistré.
 *
 * `useRef` et non `useState` : la valeur ne doit pas provoquer de rendu, elle
 * doit seulement se souvenir.
 */
export function usePremierRendu(): boolean {
  const vierge = useRef(true);
  if (vierge.current) {
    vierge.current = false;
    return true;
  }
  return false;
}

/**
 * Le style qui porte le rang d'une rangée dans la cascade.
 *
 * Rend `undefined` hors du premier rendu : sans variable `--rang`, la classe
 * `anim-cascade` retombe sur son défaut `0` — et comme elle n'est de toute
 * façon posée qu'au premier rendu, rien ne s'anime.
 */
export function rangCascade(index: number, premier: boolean): CSSProperties | undefined {
  if (!premier) return undefined;
  return { '--rang': index } as CSSProperties;
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test --workspace @kolek/collecteur`
Expected: PASS — 6 nouveaux tests.

- [ ] **Step 5: Commit**

```bash
git add apps/collecteur/src/premier-rendu.ts apps/collecteur/src/premier-rendu.test.ts
git commit -m "feat(mouvement): la cascade ne rejoue pas quand la liste se relit"
```

---

## Task 3: Le retour d'appui, une fois pour toutes

**Files:**
- Modify: `packages/ui/src/Bouton.tsx:49-53`
- Modify: `packages/ui/src/ActionsRapides.tsx:44`
- Modify: `packages/ui/src/NavMobile.tsx`

**Interfaces:**
- Consumes: la classe `anim-pression` de la tâche 1.
- Produces: rien de nouveau. Tous les boutons du produit répondent au toucher.

- [ ] **Step 1: Poser la pression sur `Bouton`**

Dans `packages/ui/src/Bouton.tsx`, remplacer le gabarit de `className` (lignes 49 à 53) par :

```tsx
      className={`anim-pression min-h-11 px-5 rounded-pill font-body font-semibold text-base flex items-center justify-center gap-2 ${
        VARIANTES[variante]
      } ${pleineLargeur ? 'w-full' : ''} ${
        disabled ? 'opacity-50 cursor-default' : 'cursor-pointer'
      } ${className}`}
```

Et compléter le commentaire de tête du composant, après le paragraphe sur la hauteur minimale :

```tsx
 * Le retour d'appui vit ici et non dans chaque écran : c'est ce qui garantit
 * que les cent boutons du produit répondent tous de la même façon. Un bouton
 * qui ne bouge pas sous le doigt se lit comme un bouton cassé, surtout en 3G
 * où la réponse du serveur, elle, se fait attendre.
```

- [ ] **Step 2: Poser la pression sur les pastilles d'action**

Dans `packages/ui/src/ActionsRapides.tsx`, à la ligne 44, ajouter `anim-pression` en tête du gabarit de classe du bouton :

```tsx
          className={`anim-pression flex flex-col items-center ${compact ? 'gap-1.5' : 'gap-2'} ${
```

- [ ] **Step 3: Poser la pression sur les onglets de la barre du bas**

Dans `packages/ui/src/NavMobile.tsx`, ajouter `anim-pression` à la classe du bouton saillant :

```tsx
              className="anim-pression flex flex-col items-center gap-1 -mt-5 px-2 cursor-pointer"
```

Et faire de même sur le bouton des onglets ordinaires, qui suit dans le même `map()` : ajouter `anim-pression` en tête de son `className`.

- [ ] **Step 4: Vérifier que les composants partagés tiennent**

Run: `npm test --workspace @kolek/ui && npm run build --workspace @kolek/collecteur`
Expected: PASS, puis construction sans erreur.

- [ ] **Step 5: Vérifier que la classe est bien émise**

Run: `grep -c "anim-pression" apps/collecteur/dist/assets/*.css`
Expected: au moins 1. La classe est désormais employée, donc Tailwind la produit.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/Bouton.tsx packages/ui/src/ActionsRapides.tsx packages/ui/src/NavMobile.tsx
git commit -m "feat(mouvement): chaque cible tactile répond enfin au doigt"
```

---

## Task 4: `CorpsEcran` décide des largeurs

**Files:**
- Modify: `apps/collecteur/src/ecrans/EnTeteEcran.tsx`
- Modify: `apps/collecteur/src/Coquille.tsx:209`

**Interfaces:**
- Consumes: `max-w-liste`, `max-w-page`, `max-w-large` (tokens de la tâche 1) ; `anim-entree`.
- Produces: `CorpsEcran({ enfants, largeur })` où `largeur?: 'saisie' | 'liste' | 'large'`, défaut `'liste'`. `EnTeteEcran` porte désormais l'arrondi bureau et la même propriété `largeur`.

- [ ] **Step 1: Réécrire `EnTeteEcran` et `CorpsEcran`**

Dans `apps/collecteur/src/ecrans/EnTeteEcran.tsx`, remplacer les deux composants (lignes 4 à 48) par :

```tsx
/**
 * Les trois largeurs de contenu du produit, et rien d'autre.
 *
 * Un seul endroit connaît les chiffres ; les écrans déclarent leur nature.
 * C'est ce qui évite qu'un `lg:max-w-[840px]` apparaisse un jour dans un écran
 * et un `lg:max-w-4xl` dans le suivant.
 *
 * `saisie` reste à 640 px délibérément : un formulaire étiré sur 1 400 px est
 * plus difficile à remplir, pas plus facile — l'œil perd la ligne entre
 * l'étiquette et le champ.
 */
const LARGEURS = {
  saisie: 'lg:max-w-liste',
  liste: 'lg:max-w-page',
  large: 'lg:max-w-large',
} as const;

export type LargeurEcran = keyof typeof LARGEURS;

/**
 * L'en-tête des écrans secondaires du collecteur.
 *
 * Le retour est un vrai bouton, pas une flèche décorative : l'application est
 * une page unique, donc le geste « précédent » du téléphone sort de
 * l'application au lieu de revenir à l'accueil. Sans ce bouton, un collecteur
 * entré dans « Bilan » n'aurait aucun moyen d'en sortir sans passer par la barre
 * du bas — qui ne montre pas cet écran.
 *
 * À partir de `lg`, le bandeau sombre s'arrondit et se détache des bords :
 * collé aux angles d'un écran de 1 440 px, il se lit comme une barre de
 * navigateur plutôt que comme un en-tête. L'accueil le faisait déjà seul ; la
 * règle remonte ici pour valoir sur les dix écrans.
 */
export function EnTeteEcran({
  titre,
  sousTitre,
  onRetour,
  enfants,
  largeur = 'liste',
}: {
  titre: string;
  sousTitre?: string;
  onRetour: () => void;
  enfants?: ReactNode;
  largeur?: LargeurEcran;
}) {
  return (
    <div
      className={`anim-entree bg-sidebar px-marge pt-entete pb-6 lg:mx-auto lg:w-full lg:rounded-2xl lg:pt-6 ${LARGEURS[largeur]}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onRetour}
          aria-label="Revenir à l’accueil"
          className="anim-pression w-9 h-9 rounded-pill bg-white/10 flex items-center justify-center cursor-pointer shrink-0"
        >
          <Icone nom="arrow-left" className="text-white" />
        </button>
        <div className="min-w-0">
          <p className="text-white font-headings font-bold text-xl truncate">{titre}</p>
          {sousTitre && <p className="text-white/60 text-sm font-body truncate">{sousTitre}</p>}
        </div>
      </div>
      {enfants}
    </div>
  );
}

/**
 * Le corps défilant des écrans secondaires, avec la marge commune.
 *
 * `largeur` doit valoir la même chose que sur l'en-tête du même écran, sans
 * quoi le bandeau et le contenu ne s'alignent pas.
 */
export function CorpsEcran({
  enfants,
  largeur = 'liste',
}: {
  enfants: ReactNode;
  largeur?: LargeurEcran;
}) {
  return (
    <div className={`flex-1 px-4 py-5 space-y-4 lg:mx-auto lg:w-full ${LARGEURS[largeur]}`}>
      {enfants}
    </div>
  );
}
```

- [ ] **Step 2: Retirer le plafond de la coquille**

Dans `apps/collecteur/src/Coquille.tsx`, à la ligne 209, remplacer :

```tsx
      <div className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col overflow-x-clip lg:min-h-0 lg:max-w-liste lg:py-8">
```

par :

```tsx
      <div className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col overflow-x-clip lg:min-h-0 lg:max-w-none lg:py-8">
```

Et corriger le commentaire de tête du bloc, qui décrit l'ancienne règle. Remplacer le paragraphe commençant par « **À partir de `lg`** » par :

```
     * **À partir de `lg`** : une barre latérale fixe, et un contenu dont le
     * plafond n'est plus décidé ici. Chaque écran déclare sa nature — `saisie`,
     * `liste` ou `large` — et `CorpsEcran` en tire la largeur. Un plafond unique
     * imposé par la coquille obligeait une grille de cartes à deux colonnes à
     * tenir dans 640 px, c'est-à-dire à ne pas exister.
```

- [ ] **Step 3: Vérifier**

Run: `npm test --workspace @kolek/collecteur && npm run build --workspace @kolek/collecteur`
Expected: PASS, puis construction sans erreur TypeScript.

- [ ] **Step 4: Commit**

```bash
git add apps/collecteur/src/ecrans/EnTeteEcran.tsx apps/collecteur/src/Coquille.tsx
git commit -m "feat(bureau): trois largeurs déclarées, un seul endroit qui les connaît"
```

---

## Task 5: Les trois écrans d'historique

**Files:**
- Modify: `apps/collecteur/src/ecrans/Recus.tsx`
- Modify: `apps/collecteur/src/ecrans/Alertes.tsx`
- Modify: `apps/collecteur/src/ecrans/Avis.tsx`

**Interfaces:**
- Consumes: `CorpsEcran` avec `largeur` (tâche 4) ; `usePremierRendu`, `rangCascade` (tâche 2) ; `anim-cascade` (tâche 1).
- Produces: rien.

- [ ] **Step 1: Poser la cascade et la largeur sur `Recus`**

Dans `apps/collecteur/src/ecrans/Recus.tsx` :

Ajouter l'import :

```tsx
import { rangCascade, usePremierRendu } from '../premier-rendu';
```

Dans le corps du composant, avant le `return`, ajouter :

```tsx
  // La cascade ne joue qu'à l'ouverture de l'écran. `revision` relit la liste
  // après chaque écriture ; rejouer l'escalier à ce moment ferait clignoter
  // l'historique sous les yeux du collecteur.
  const premier = usePremierRendu();
```

Sur `EnTeteEcran` et `CorpsEcran`, ajouter `largeur="liste"` — c'est le défaut, mais l'écrire rend l'intention lisible et protège d'un changement de défaut :

```tsx
      <EnTeteEcran
        largeur="liste"
```

```tsx
      <CorpsEcran
        largeur="liste"
```

Puis, à la ligne du `map()` (ligne 62), passer l'index et poser la classe sur la `Carte` :

```tsx
            {recus?.map((recu, rang) => {
              const quand = new Date(recu.encaisseLe);
              const estOuvert = ouvert === recu.id;

              return (
                <Carte
                  key={recu.id}
                  className={`p-0 overflow-hidden ${premier ? 'anim-cascade' : ''}`}
                  style={rangCascade(rang, premier)}
                >
```

Si `Carte` n'accepte pas `style`, ajouter la propriété à son interface dans `packages/ui/src/Carte.tsx` :

```tsx
  style?: CSSProperties;
```

et la transmettre à l'élément racine du composant, avec l'import `import type { CSSProperties } from 'react';`.

- [ ] **Step 2: Faire de même sur `Alertes`**

Dans `apps/collecteur/src/ecrans/Alertes.tsx`, ajouter le même import et la même ligne `const premier = usePremierRendu();`, poser `largeur="liste"` sur l'en-tête et le corps, puis à la ligne 77 :

```tsx
            {alertes?.map((alerte, rang) => {
```

et sur la `Carte` de la ligne 80 :

```tsx
                <Carte
                  key={alerte.cle}
                  className={`p-4 ${style.bordure} ${premier ? 'anim-cascade' : ''}`}
                  style={rangCascade(rang, premier)}
                >
```

- [ ] **Step 3: Faire de même sur `Avis`**

Dans `apps/collecteur/src/ecrans/Avis.tsx`, appliquer exactement le même traitement : import de `rangCascade` et `usePremierRendu`, `const premier = usePremierRendu();`, `largeur="liste"` sur l'en-tête et le corps, index `rang` dans le `map()` de la liste, et sur chaque élément répété :

```tsx
                  className={`${/* les classes existantes */ ''} ${premier ? 'anim-cascade' : ''}`}
                  style={rangCascade(rang, premier)}
```

en conservant telles quelles les classes déjà présentes sur l'élément.

- [ ] **Step 4: Vérifier**

Run: `npm test --workspace @kolek/collecteur && npm run build --workspace @kolek/collecteur`
Expected: PASS, puis construction sans erreur.

- [ ] **Step 5: Contrôle visuel**

Run: `npm run dev --workspace @kolek/collecteur`
Ouvrir les trois écrans à 390 px puis à 1440 px. Attendu : les rangées entrent en escalier à l'ouverture, ne rejouent pas quand on revient, et occupent 860 px sur bureau au lieu de 640.

- [ ] **Step 6: Commit**

```bash
git add apps/collecteur/src/ecrans/Recus.tsx apps/collecteur/src/ecrans/Alertes.tsx apps/collecteur/src/ecrans/Avis.tsx packages/ui/src/Carte.tsx
git commit -m "feat(bureau): les trois historiques respirent, et entrent en escalier"
```

---

## Task 6: Le bilan et le retrait passent en grille

**Files:**
- Modify: `apps/collecteur/src/ecrans/Bilan.tsx`
- Modify: `apps/collecteur/src/ecrans/Retrait.tsx`

**Interfaces:**
- Consumes: `CorpsEcran` avec `largeur="large"` ; `usePremierRendu`, `rangCascade`.
- Produces: rien.

- [ ] **Step 1: Mettre les trois tranches du bilan côte à côte**

Dans `apps/collecteur/src/ecrans/Bilan.tsx` :

Ajouter l'import `import { rangCascade, usePremierRendu } from '../premier-rendu';` et `const premier = usePremierRendu();` dans le composant.

Poser `largeur="large"` sur `EnTeteEcran` et sur `CorpsEcran`.

Envelopper le `map()` des tranches (ligne 81) dans une grille. Remplacer :

```tsx
            {donnees?.tranches.map((tranche) => (
              <Carte key={tranche.libelle} className="p-4">
```

par :

```tsx
            {/* Les trois tranches côte à côte sur bureau. Empilées, elles
                obligeaient à faire défiler pour comparer aujourd'hui à trente
                jours — or la comparaison est tout l'intérêt de cet écran. */}
            <div className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0">
              {donnees?.tranches.map((tranche, rang) => (
                <Carte
                  key={tranche.libelle}
                  className={`p-4 ${premier ? 'anim-cascade' : ''}`}
                  style={rangCascade(rang, premier)}
                >
```

et fermer la grille après la fin du `map()` — la parenthèse fermante `))}` devient `))}</div>`. Vérifier l'indentation du bloc entier après modification.

- [ ] **Step 2: Mettre les cartes clôturables en deux colonnes**

Dans `apps/collecteur/src/ecrans/Retrait.tsx`, ajouter les mêmes imports et `const premier = usePremierRendu();`, poser `largeur="large"` sur l'en-tête et le corps, puis envelopper le `map()` des cartes clôturables dans :

```tsx
            {/* Deux colonnes sur bureau : la liste des cartes à clôturer est
                la plus longue du produit, et chaque carte tient dans la moitié
                de la largeur. */}
            <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
```

en passant l'index `rang` au `map()` et en posant sur chaque carte :

```tsx
                  className={`${/* les classes existantes */ ''} ${premier ? 'anim-cascade' : ''}`}
                  style={rangCascade(rang, premier)}
```

- [ ] **Step 3: Vérifier**

Run: `npm test --workspace @kolek/collecteur && npm run build --workspace @kolek/collecteur`
Expected: PASS, puis construction sans erreur.

- [ ] **Step 4: Contrôle visuel**

Ouvrir Bilan et Retrait à 390, 768 et 1440 px. Attendu : à 390 et 768 les cartes restent empilées ; à 1440 le bilan montre trois colonnes et le retrait deux.

- [ ] **Step 5: Commit**

```bash
git add apps/collecteur/src/ecrans/Bilan.tsx apps/collecteur/src/ecrans/Retrait.tsx
git commit -m "feat(bureau): comparer les trois tranches sans faire défiler"
```

---

## Task 7: Les deux écrans de saisie et la fiche

**Files:**
- Modify: `apps/collecteur/src/ecrans/Rapprochement.tsx`
- Modify: `apps/collecteur/src/ecrans/Plus.tsx`

**Interfaces:**
- Consumes: `CorpsEcran` avec `largeur`.
- Produces: rien.

- [ ] **Step 1: Fixer la largeur de saisie du rapprochement**

Dans `apps/collecteur/src/ecrans/Rapprochement.tsx`, poser `largeur="saisie"` sur `EnTeteEcran` et sur `CorpsEcran`.

Pas de cascade ici : l'écran ne porte pas de liste, il porte un champ et deux chiffres. Une animation en escalier sur trois éléments se lit comme une lenteur.

- [ ] **Step 2: Mettre la fiche en deux colonnes**

Dans `apps/collecteur/src/ecrans/Plus.tsx`, poser `largeur="liste"` sur `EnTeteEcran` et `CorpsEcran`, puis envelopper les deux blocs — identité et abonnement — dans une grille. Repérer les deux `<Carte>` de premier niveau dans `CorpsEcran` et les entourer de :

```tsx
            {/* Identité et abonnement côte à côte sur bureau : ce sont deux
                sujets distincts, et les empiler sur 1 440 px laisse la moitié
                droite vide. */}
            <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:items-start">
```

L'état du réseau et le bouton de déconnexion restent hors de la grille, en pleine largeur sous elle.

- [ ] **Step 3: Vérifier**

Run: `npm test --workspace @kolek/collecteur && npm run build --workspace @kolek/collecteur`
Expected: PASS, puis construction sans erreur.

- [ ] **Step 4: Commit**

```bash
git add apps/collecteur/src/ecrans/Rapprochement.tsx apps/collecteur/src/ecrans/Plus.tsx
git commit -m "feat(bureau): la saisie reste étroite, la fiche s'ouvre en deux"
```

---

## Task 8: Les trois écrans qui n'emploient pas `CorpsEcran`

**Files:**
- Modify: `apps/collecteur/src/ecrans/Clients.tsx`
- Modify: `apps/collecteur/src/ecrans/Accueil.tsx`
- Modify: `apps/collecteur/src/ecrans/Encaisser.tsx`

**Interfaces:**
- Consumes: `max-w-large`, `max-w-page`, `max-w-liste` ; `anim-entree`, `anim-cascade` ; `usePremierRendu`, `rangCascade`.
- Produces: rien.

- [ ] **Step 1: Poser la largeur et la cascade sur `Clients`**

`Clients.tsx` porte sa propre mise en page — pas de `CorpsEcran`. Ajouter les imports `rangCascade` et `usePremierRendu`, et `const premier = usePremierRendu();`.

Sur le conteneur racine de l'écran, ajouter `anim-entree`. Sur le conteneur qui porte la barre de recherche et les filtres, ajouter `lg:mx-auto lg:w-full lg:max-w-large`. Sur le conteneur de la liste de clients, remplacer sa classe d'espacement par :

```tsx
        <div className="space-y-3 lg:mx-auto lg:w-full lg:max-w-large lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
```

et poser sur chaque carte de client, dans le `map()` auquel on ajoute l'index `rang` :

```tsx
              className={`${/* les classes existantes */ ''} ${premier ? 'anim-cascade' : ''}`}
              style={rangCascade(rang, premier)}
```

- [ ] **Step 2: Aligner l'accueil sur les nouveaux plafonds**

`Accueil.tsx` porte déjà quatre règles `lg:`. Remplacer, sur ses conteneurs de premier niveau, les marges `lg:mx-4` par le plafond partagé, pour qu'il s'aligne sur les autres écrans :

- ligne 79, le bandeau sombre : `lg:mx-auto lg:w-full lg:max-w-large lg:rounded-2xl lg:pt-6` à la place de `lg:mx-4 lg:rounded-2xl lg:pt-6` ;
- ligne 158, la grille des deux colonnes : ajouter `lg:mx-auto lg:w-full lg:max-w-large` ;
- lignes 159 et 205 : remplacer `lg:mx-0` par `lg:mx-auto lg:w-full lg:max-w-large` si le conteneur est de premier niveau, le laisser tel quel s'il est déjà à l'intérieur de la grille de la ligne 158.

Ajouter `anim-entree` sur le conteneur racine de l'écran, et `anim-compteur-cible` n'est **pas** posé ici : le compteur animé fait l'objet de la tâche 9.

- [ ] **Step 3: Fixer la largeur de saisie de l'encaissement**

Dans `apps/collecteur/src/ecrans/Encaisser.tsx`, ajouter `anim-entree` sur le conteneur racine et `lg:mx-auto lg:w-full lg:max-w-liste` sur le conteneur de contenu. C'est la largeur `saisie` : le formulaire d'encaissement ne s'étire pas.

- [ ] **Step 4: Vérifier**

Run: `npm test --workspace @kolek/collecteur && npm run build --workspace @kolek/collecteur`
Expected: PASS, puis construction sans erreur.

- [ ] **Step 5: Contrôle visuel des onze écrans**

Ouvrir chacun des onze écrans aux trois largeurs et remplir ce tableau. Un écran qui déborde latéralement ou dont le contenu reste collé à gauche est un échec :

| Écran | 390 px | 768 px | 1440 px |
|---|---|---|---|
| Accueil | | | |
| Clients | | | |
| Encaisser | | | |
| Retrait | | | |
| Rapprochement | | | |
| Reçus | | | |
| Alertes | | | |
| Avis | | | |
| Bilan | | | |
| Plus | | | |
| Connexion | | | |

- [ ] **Step 6: Commit**

```bash
git add apps/collecteur/src/ecrans/Clients.tsx apps/collecteur/src/ecrans/Accueil.tsx apps/collecteur/src/ecrans/Encaisser.tsx
git commit -m "feat(bureau): les trois derniers écrans sortent de la colonne téléphone"
```

---

## Task 9: Le compteur des grands montants

**Files:**
- Modify: `apps/collecteur/src/ecrans/Accueil.tsx`
- Modify: `apps/collecteur/src/ecrans/Bilan.tsx`

**Interfaces:**
- Consumes: `anim-compteur`, `anim-compteur-cible` de la tâche 1.
- Produces: rien.

- [ ] **Step 1: Animer le montant encaissé du jour**

Dans `apps/collecteur/src/ecrans/Accueil.tsx`, repérer l'élément qui affiche « Encaissé aujourd'hui » et son montant. Remplacer le nœud du montant par :

```tsx
              {/* Le compteur monte de zéro à la valeur. Le chiffre vrai reste
                  dans le document, lu par les lecteurs d'écran ; l'animation
                  est un pseudo-élément décoratif. Un navigateur sans
                  `@property` affiche simplement la valeur, sans animation, et
                  personne ne perd rien — c'est la donnée la plus importante de
                  l'écran, elle ne dépend pas d'une nouveauté CSS. */}
              <span className="sr-only">{formatMontant(encaisseDuJour)} FCFA</span>
              <span
                aria-hidden="true"
                className="anim-compteur anim-compteur-cible font-headings font-bold text-5xl text-white tabular-nums"
                style={{ '--kolek-valeur': encaisseDuJour } as CSSProperties}
              />
```

en remplaçant `encaisseDuJour` par le nom réel de la variable qui porte ce montant dans le fichier, et en ajoutant `import type { CSSProperties } from 'react';` en tête.

Conserver le suffixe « FCFA » tel qu'il est aujourd'hui, hors du compteur.

- [ ] **Step 2: Animer le total encaissé du bilan**

Dans `apps/collecteur/src/ecrans/Bilan.tsx`, appliquer le même traitement au seul chiffre d'en-tête de l'écran — celui qui figure dans le bandeau sombre, pas les montants des trois tranches. Les cartes de tranche gardent leur affichage direct : trois compteurs qui montent en même temps se lisent comme un écran qui charge.

- [ ] **Step 3: Vérifier le repli**

Run: `npm run build --workspace @kolek/collecteur && npm run dev --workspace @kolek/collecteur`

Dans les outils du navigateur, désactiver `@property` n'est pas possible ; vérifier autrement : couper le JavaScript n'a pas d'effet ici, mais on peut confirmer que le chiffre vrai est présent en inspectant le DOM. Attendu : l'élément `sr-only` contient bien le montant formaté, indépendamment de l'animation.

Vérifier aussi en émulant `prefers-reduced-motion: reduce` (outils du navigateur → Rendu) : le compteur affiche la valeur finale, sans montée.

- [ ] **Step 4: Commit**

```bash
git add apps/collecteur/src/ecrans/Accueil.tsx apps/collecteur/src/ecrans/Bilan.tsx
git commit -m "feat(mouvement): les grands montants montent, avec le vrai chiffre dessous"
```

---

## Task 10: Le moment signature — l'encaissement

**Files:**
- Modify: `packages/ui/src/CarteCollecte.tsx:52-60`
- Modify: `apps/collecteur/src/ecrans/Encaisser.tsx`

**Interfaces:**
- Consumes: `anim-case`, `anim-reussite`, `anim-coche` de la tâche 1.
- Produces: `CarteCollecte` accepte `derniereCase?: number` — le numéro de la case fraîchement remplie, qui seule s'anime.

- [ ] **Step 1: Animer la case fraîchement remplie**

Dans `packages/ui/src/CarteCollecte.tsx`, ajouter `derniereCase` à l'interface des propriétés :

```tsx
  /** Le numéro de la case tout juste encaissée. Elle seule s'anime — faire
      rebondir les trente-et-une cases à chaque ouverture de l'écran serait une
      fête là où il faut une confirmation. */
  derniereCase?: number;
```

Puis, dans le `map()` des cases (ligne 54), poser la classe conditionnellement :

```tsx
          {cases.map((numero) => (
            <div
              key={numero}
              className={`h-5 rounded-sm flex items-center justify-center ${
                /* les classes existantes de l'état de la case */ ''
              } ${numero === derniereCase ? 'anim-case' : ''}`}
            >
```

en conservant intégralement la logique de classes déjà présente pour l'état rempli ou vide.

- [ ] **Step 2: Faire remonter la case fraîche depuis l'écran d'encaissement**

Dans `apps/collecteur/src/ecrans/Encaisser.tsx`, après un encaissement réussi, mémoriser le numéro de la case et le passer à `CarteCollecte` :

```tsx
  // Le numéro de la case tout juste remplie, pour qu'elle seule s'anime.
  // Remis à zéro dès qu'on change de carte : une case qui rebondit sur la
  // carte d'un autre client serait un contresens.
  const [derniereCase, setDerniereCase] = useState<number | undefined>(undefined);
```

Dans la fonction appelée après un encaissement réussi, avant l'appel à `onEncaisse()` :

```tsx
    setDerniereCase(carte.misesEncaissees + 1);
```

Et sur le rendu de `CarteCollecte`, transmettre :

```tsx
        derniereCase={derniereCase}
```

Ajouter enfin, sur le panneau de confirmation affiché après un encaissement réussi, la classe `anim-reussite` sur son conteneur.

- [ ] **Step 3: Vérifier**

Run: `npm test --workspace @kolek/ui && npm test --workspace @kolek/collecteur && npm run build --workspace @kolek/collecteur`
Expected: PASS partout, puis construction sans erreur.

- [ ] **Step 4: Contrôle visuel du geste**

Run: `npm run dev --workspace @kolek/collecteur`

Encaisser une mise sur une base locale. Attendu : la case correspondante apparaît avec un léger dépassement, le panneau de confirmation entre en même temps. Réouvrir l'écran : aucune case ne rebondit.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/CarteCollecte.tsx apps/collecteur/src/ecrans/Encaisser.tsx
git commit -m "feat(mouvement): l'encaissement se voit, et lui seul dépasse 250 ms"
```

---

## Task 11: Le budget et la vérification complète

**Files:**
- Aucun fichier modifié — cette tâche mesure.

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien.

- [ ] **Step 1: Mesurer le poids avant et après**

Run:

```bash
git stash list >/dev/null 2>&1
git show HEAD~10:package.json >/dev/null 2>&1 && echo "historique disponible"
npm run build --workspace @kolek/collecteur
ls -la apps/collecteur/dist/assets/*.js apps/collecteur/dist/assets/*.css
```

Expected: le fichier JavaScript ne doit pas dépasser de plus de 1 Ko sa taille avant ce chantier ; le CSS peut avoir grossi de 4 Ko au plus. Noter les deux tailles dans le message de commit final.

Pour retrouver la taille d'avant, construire depuis le commit qui précède la tâche 1 :

```bash
git stash -u
git checkout HEAD~10 -- packages apps 2>/dev/null || echo "ajuster le nombre de commits en arrière"
npm run build --workspace @kolek/collecteur
ls -la apps/collecteur/dist/assets/*.js apps/collecteur/dist/assets/*.css
git checkout HEAD -- packages apps
git stash pop
```

- [ ] **Step 2: Vérifier `prefers-reduced-motion`**

Run: `npm run dev --workspace @kolek/collecteur`

Dans les outils du navigateur, onglet Rendu, activer « Émuler prefers-reduced-motion: reduce ». Parcourir les onze écrans et encaisser une mise.

Expected: aucun mouvement résiduel — ni entrée d'écran, ni cascade, ni rebond de case, ni montée de compteur. Le contenu est identique, seule l'animation disparaît.

- [ ] **Step 3: Vérifier qu'aucune propriété de mise en page n'est animée**

Run: `grep -nE "animation|transition" packages/core/src/mouvement.css | grep -viE "transform|opacity|stroke-dashoffset|--kolek-valeur|none"`
Expected: aucune ligne. Toute sortie signale une propriété animée qui forcera un recalcul de mise en page à chaque frame.

- [ ] **Step 4: Lancer la vérification complète du dépôt**

Run: `npm run verifier`
Expected: PASS de bout en bout — reconstruction de base, thème, paliers, tests d'applications, tests de scripts, tests de base, construction, contrôle des paquets.

- [ ] **Step 5: Commit du relevé**

```bash
git commit --allow-empty -m "chore(mouvement): relevé de poids et vérification complète

JavaScript : <avant> → <après>
CSS        : <avant> → <après>
prefers-reduced-motion : aucun mouvement résiduel sur les onze écrans."
```

---

## Ce que ce plan ne fait pas

- **L'administration et le site public** ne reçoivent aucune animation. Le
  vocabulaire créé en tâche 1 vit dans `packages/core`, donc les deux
  applications l'ont à disposition — il n'y est simplement appliqué nulle part.
- **Aucune vue maître-détail sur bureau.** Le bureau reste la même application,
  mieux répartie. Une liste de clients à gauche et une fiche à droite serait un
  second produit à concevoir et à maintenir, pour un utilisateur qui travaille
  d'abord au téléphone.
- **Aucun geste tactile** — pas de glisser pour supprimer, pas de tirer pour
  rafraîchir. Ils réclament du JavaScript par frame, ce que la contrainte de
  cette conception exclut.
- **La production sert toujours une version antérieure** — constat de l'audit du
  2026-08-21, et la construction Netlify échoue depuis sur une variable
  d'environnement mal remplie. Ce chantier restera invisible tant que ce n'est
  pas réglé.
