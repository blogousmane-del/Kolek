# Encaissement inline — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les étapes sont cochables (`- [ ]`).

**But :** toucher une carte du carrousel fait sortir son bouton d'encaissement dans la carte ; toucher le bouton écrit la mise sans quitter la fiche, après six secondes pendant lesquelles on peut annuler.

**Architecture :** une machine à états pure dans `apps/collecteur`, une fente `action` dans `CarteCollecte`, un passage `rendreAction` dans `CarrouselCartes`, et le minuteur dans `FicheClient`. `packages/ui` reste présentationnel — il reçoit un nœud React et le pose.

**Pile :** React 19, TypeScript, Tailwind v4 (requêtes de conteneur), Vitest + `@testing-library/react`, Supabase JS.

**Spec :** `Docs/specs/2026-08-31-encaissement-inline-design.md`

## Contraintes globales

- **Aucune nouvelle dépendance npm.** `packages/ui` ne porte que `react` et `lucide-react` en pairs, plus `@kolek/core`.
- **`packages/ui` ne connaît ni Supabase ni les montants.** Aucun import de `../ecritures`, `../supabase` ou `@kolek/core` autre que ceux déjà présents.
- **`mises` est append-only.** Trigger `mises_immuables`, `BEFORE UPDATE OR DELETE`, opposable aussi à la clé de service. Aucune écriture n'est réversible.
- **Cible tactile minimale : 44 px** (`min-h-11`). Elle vaut aussi pour les boutons logés dans une carte réduite.
- **Requêtes de conteneur** : les valeurs de base sont celles de la pleine largeur ; le format réduit s'écrit en `@max-[240px]:`. Jamais l'inverse — une règle ignorée par un vieux WebView doit laisser l'écran tel qu'il était.
- **Vitest sans `globals`** : `describe`, `it`, `expect`, `vi` s'importent depuis `'vitest'` dans chaque fichier de test.
- **Langue** : libellés, noms de symboles et commentaires en français. Les commentaires disent *pourquoi*, pas *quoi*.
- **Sursis** : 6 secondes, valeur unique exportée, jamais réécrite en dur.

## Structure des fichiers

| Fichier | Responsabilité | Nature |
|---|---|---|
| `apps/collecteur/src/encaissement-differe.ts` | ce qui s'affiche pendant le sursis, et quand l'attente n'a plus d'objet — fonctions pures, ni horloge ni réseau | créé |
| `apps/collecteur/src/encaissement-differe.test.ts` | ses tests | créé |
| `packages/ui/src/CarteCollecte.tsx` | fente `action` dans le pied de la carte | modifié |
| `packages/ui/src/CarteCollecte.test.tsx` | ses tests | créé |
| `packages/ui/src/CarrouselCartes.tsx` | `rendreAction`, appelée pour chaque carte, et isolation des gestes | modifié |
| `packages/ui/src/CarrouselCartes.test.tsx` | tests ajoutés | modifié |
| `apps/collecteur/src/ecrans/FicheClient.tsx` | minuteur, bouton, bandeau de sursis, écriture | modifié |
| `apps/collecteur/src/ecrans/FicheClient.test.tsx` | tests réécrits et ajoutés | modifié |
| `apps/collecteur/src/ecrans/Clients.tsx` | la propriété `onEncaisser` devenue morte disparaît | modifié |
| `apps/collecteur/src/ecrans/Clients.test.tsx` | la propriété disparaît des rendus | modifié |
| `apps/collecteur/src/Coquille.tsx` | ne passe plus `onEncaisser` à `Clients` | modifié |
| `apps/collecteur/src/Coquille.test.tsx` | le déclencheur d'encaissement passe du témoin `Clients` au témoin `Accueil` | modifié |

`apps/collecteur/src/ecrans/Encaisser.tsx`, `Accueil.tsx`, `Retrait.tsx` et l'onglet du bas ne sont pas touchés.

---

### Tâche 1 : la machine à états

**Fichiers :**
- Créer : `apps/collecteur/src/encaissement-differe.ts`
- Test : `apps/collecteur/src/encaissement-differe.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit : `SURSIS_MS: number`, `SURSIS_S: number`, `interface EnAttente { carteId: string; mise: number; base: number; envoyee: boolean; echec?: string }`, `misesAffichees(carteId: string, reelles: number, attente: EnAttente | null): number`, `estRattrapee(reelles: number, attente: EnAttente): boolean`.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `apps/collecteur/src/encaissement-differe.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import {
  estRattrapee,
  misesAffichees,
  SURSIS_MS,
  SURSIS_S,
  type EnAttente,
} from './encaissement-differe';

function attente(partiel: Partial<EnAttente> = {}): EnAttente {
  return { carteId: 'k1', mise: 1000, base: 5, envoyee: false, ...partiel };
}

describe('misesAffichees', () => {
  it('rend le compte réel quand rien n’attend', () => {
    expect(misesAffichees('k1', 5, null)).toBe(5);
  });

  it('ne touche pas aux cartes voisines', () => {
    // L'optimisme vaut pour la carte qu'on vient d'encaisser, et pour elle
    // seule. Une case remplie sur la carte d'à côté serait un mensonge.
    expect(misesAffichees('k2', 12, attente())).toBe(12);
  });

  it('compte le jour de plus sur la carte qui attend', () => {
    expect(misesAffichees('k1', 5, attente())).toBe(6);
  });

  it('ne fait jamais redescendre le compte', () => {
    // Entre l'écriture et la relecture, le compte réel rattrape l'optimisme.
    // S'il le dépassait — une seconde mise partie d'ailleurs — c'est lui qui
    // dit vrai ; la case ne doit pas se revider pour autant.
    expect(misesAffichees('k1', 6, attente())).toBe(6);
    expect(misesAffichees('k1', 7, attente())).toBe(7);
  });
});

describe('estRattrapee', () => {
  it('reste fausse tant que la relecture n’a rien ramené', () => {
    expect(estRattrapee(5, attente())).toBe(false);
  });

  it('devient vraie dès que la mise est revenue de la base', () => {
    expect(estRattrapee(6, attente())).toBe(true);
  });
});

describe('le sursis', () => {
  it('vaut six secondes, dites une seule fois', () => {
    // Les deux valeurs servent deux minuteurs — l'écriture et le décompte
    // affiché. Les laisser diverger ferait disparaître « Annuler » une seconde
    // avant, ou après, l'instant où il cesse d'être vrai.
    expect(SURSIS_S).toBe(6);
    expect(SURSIS_MS).toBe(SURSIS_S * 1000);
  });
});
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

```bash
npm test -w @kolek/collecteur -- src/encaissement-differe.test.ts
```

Attendu : ÉCHEC — `Failed to resolve import "./encaissement-differe"`.

- [ ] **Étape 3 : écrire l'implémentation**

Créer `apps/collecteur/src/encaissement-differe.ts` :

```ts
/**
 * Ce qui se décide pendant les six secondes de sursis, sans horloge ni réseau.
 *
 * ## Pourquoi un sursis, et pas une annulation
 *
 * `mises` est append-only : le trigger `mises_immuables` refuse `update` et
 * `delete`, et il est `BEFORE`, donc il s'applique aussi aux accès par clé de
 * service que RLS ne filtre pas. Une mise écrite ne se défait pas.
 *
 * « Annuler » ne peut donc exister qu'avant l'écriture. La case se remplit à
 * l'écran tout de suite — c'est ce que le collecteur vient de faire — et
 * l'insertion part six secondes plus tard.
 *
 * ## Pourquoi ces fonctions sont pures
 *
 * Le minuteur vit dans l'écran, où il a un cycle de vie. Ce qui se *décide* —
 * quel compte montrer, quand l'attente n'a plus d'objet — se teste sans
 * attendre six secondes, et se relit sans dérouler un rendu.
 */

/** Le sursis, en secondes. C'est aussi ce que le bouton « Annuler » décompte. */
export const SURSIS_S = 6;

/** Le même sursis, en millisecondes, pour le minuteur d'écriture. */
export const SURSIS_MS = SURSIS_S * 1000;

export interface EnAttente {
  carteId: string;
  mise: number;
  /** `misesEncaissees` au moment de l'appui. Sert à savoir quand purger. */
  base: number;
  /** L'insertion est partie ; on attend seulement que la relecture la ramène. */
  envoyee: boolean;
  /** Renseigné quand l'écriture a échoué. */
  echec?: string;
}

/**
 * Le compte à montrer sur une carte, une fois l'optimisme pris en compte.
 *
 * `Math.max` et non `base + 1` : entre l'écriture et la relecture, le compte
 * réel rattrape l'optimisme, et il peut même le dépasser. C'est lui qui dit
 * vrai — mais la case ne doit jamais se revider en chemin.
 */
export function misesAffichees(
  carteId: string,
  reelles: number,
  attente: EnAttente | null,
): number {
  if (!attente || attente.carteId !== carteId) return reelles;
  return Math.max(reelles, attente.base + 1);
}

/** La relecture a-t-elle ramené la mise qu'on tenait à bout de bras ? */
export function estRattrapee(reelles: number, attente: EnAttente): boolean {
  return reelles > attente.base;
}
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

```bash
npm test -w @kolek/collecteur -- src/encaissement-differe.test.ts
```

Attendu : 7 tests passés.

- [ ] **Étape 5 : committer**

```bash
git add apps/collecteur/src/encaissement-differe.ts apps/collecteur/src/encaissement-differe.test.ts
git commit -F - <<'EOF'
feat(encaissement): six secondes pendant lesquelles rien n'est encore écrit

`mises` est append-only — trigger BEFORE, opposable aussi a la cle de
service. Une mise ecrite ne se defait pas, donc « Annuler » ne peut
exister qu'avant l'ecriture.

Ce qui se decide pendant ces six secondes est isole ici, sans horloge ni
reseau : quel compte montrer, et quand l'attente n'a plus d'objet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Tâche 2 : la fente dans la carte

**Fichiers :**
- Modifier : `packages/ui/src/CarteCollecte.tsx`
- Test : `packages/ui/src/CarteCollecte.test.tsx` (créer)

**Interfaces :**
- Consomme : rien de la tâche 1.
- Produit : `CarteCollecte` accepte `action?: ReactNode`, rendue dans le pied de la carte, dans le flux.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `packages/ui/src/CarteCollecte.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CarteCollecte } from './CarteCollecte';

// `globals` n'est pas activé dans la configuration Vitest de ce paquet.

afterEach(cleanup);

function rendre(action?: React.ReactNode) {
  return render(
    <CarteCollecte
      nomClient="Aïcha"
      misePar="5 000"
      jourCourant={3}
      solde="10 000"
      cycle="1"
      action={action}
    />,
  );
}

describe('CarteCollecte — la fente du pied', () => {
  it('ne porte rien tant qu’on ne lui donne rien', () => {
    // La fente n'appartient qu'à la carte choisie. Une carte qu'on regarde
    // sans l'avoir touchée ne doit rien proposer.
    rendre();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('pose ce qu’on lui donne, sous le solde', () => {
    rendre(
      <button type="button">Encaisser 5 000 FCFA</button>,
    );

    const bouton = screen.getByRole('button', { name: 'Encaisser 5 000 FCFA' });
    expect(bouton).toBeTruthy();

    // Sous le solde, et non par-dessus : le solde est précisément ce qu'on
    // regarde avant d'encaisser. Un calque l'aurait masqué.
    const solde = screen.getByText('Solde restituable');
    expect(solde.compareDocumentPosition(bouton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

```bash
npm test -w @kolek/ui -- src/CarteCollecte.test.tsx
```

Attendu : ÉCHEC — TypeScript refuse `action` (`Property 'action' does not exist on type 'Props'`) et le second test ne trouve aucun bouton.

- [ ] **Étape 3 : écrire l'implémentation**

Dans `packages/ui/src/CarteCollecte.tsx`, ajouter l'import de type en tête de fichier :

```tsx
import { MISES_PAR_CYCLE } from '@kolek/core';
import type { ReactNode } from 'react';
```

Ajouter la propriété à l'interface `Props`, après `cycle` :

```tsx
  cycle: string;
  /**
   * Ce que la carte porte en pied quand elle est la carte choisie.
   *
   * Un nœud et non un libellé : la carte ne connaît ni les montants ni les
   * écritures. Elle réserve une place, l'écran décide ce qui s'y met.
   */
  action?: ReactNode;
```

Ajouter `action` à la déstructuration :

```tsx
export function CarteCollecte({
  nomClient,
  misePar,
  jourCourant,
  totalJours = MISES_PAR_CYCLE,
  solde,
  cycle,
  action,
}: Props) {
```

Et, juste après la fermeture du bloc `{/* Pied */}` — c'est-à-dire après le `</div>` qui ferme `flex items-end justify-between pt-1 …` et avant le `</div>` qui ferme `relative p-5 …` — insérer :

```tsx
        {/* La fente. Dans le flux, et non en calque : le solde est ce qu'on
            regarde avant d'encaisser, et un bouton posé par-dessus le
            masquerait au moment précis où il compte. La carte grandit. */}
        {action && <div className="mt-3 @max-[240px]:mt-2">{action}</div>}
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

```bash
npm test -w @kolek/ui -- src/CarteCollecte.test.tsx
```

Attendu : 2 tests passés.

- [ ] **Étape 5 : vérifier que rien d'autre n'a bougé**

```bash
npm test -w @kolek/ui
```

Attendu : toute la suite passe.

- [ ] **Étape 6 : committer**

```bash
git add packages/ui/src/CarteCollecte.tsx packages/ui/src/CarteCollecte.test.tsx
git commit -F - <<'EOF'
feat(ui): la carte de collecte reserve une place en pied

Le bouton d'encaissement vivait sous la rangee, ou un seul bouton servait
plusieurs cartes visibles ensemble et rien sur lui ne disait laquelle.

La carte reserve donc une fente, dans le flux et non en calque : le solde
est ce qu'on regarde avant d'encaisser. Elle recoit un noeud, pas un
libelle — elle ne connait ni les montants ni les ecritures.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Tâche 3 : le passage par le carrousel

**Fichiers :**
- Modifier : `packages/ui/src/CarrouselCartes.tsx`
- Test : `packages/ui/src/CarrouselCartes.test.tsx` (ajouter un `describe`)

**Interfaces :**
- Consomme : la fente `action` de la tâche 2.
- Produit : `CarrouselCartes` accepte `rendreAction?: (carte: CarteItem, choisie: boolean) => ReactNode`, appelée pour **chaque** carte, `choisie` valant `carte.id === visibleId`. Un résultat non nul est enveloppé dans un conteneur qui coupe `pointerdown` et `click` ; un résultat nul ne pose rien.

**Pourquoi chaque carte, et non la seule choisie.** Le bandeau de sursis doit rester sur sa carte pendant qu'on en regarde une autre — c'est la mise qui est en train de partir, et la cacher au moment où l'on fait défiler serait le contraire de ce qu'il sert. Que le *bouton*, lui, ne sorte que sur la carte choisie est une politique de l'écran, pas une règle du carrousel.

- [ ] **Étape 1 : écrire le test qui échoue**

Ajouter à la fin de `packages/ui/src/CarrouselCartes.test.tsx` :

```tsx
/**
 * La fente, et pourquoi elle doit couper les gestes de la piste.
 *
 * Le `li` écoute déjà `pointerdown` — l'appui long de 350 ms qui lève une
 * carte — et `click`, qui la choisit. Un bouton posé dedans hérite des deux :
 * le toucher lèverait la carte au lieu d'encaisser.
 */
describe('CarrouselCartes — la fente d’action', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Un écran qui ne veut de commande que sur la carte choisie. */
  function fente(carte: CarteItem, choisie: boolean) {
    if (!choisie) return null;
    return (
      <button type="button" aria-label={`agir sur ${carte.id}`}>
        agir
      </button>
    );
  }

  it('interroge chaque carte, et dit laquelle est choisie', () => {
    // Chaque carte, et non la seule choisie : le bandeau de sursis d'une carte
    // doit pouvoir rester visible pendant qu'on en regarde une autre. Ce qui
    // sort, et où, est la décision de l'écran.
    const rendreAction = vi.fn(fente);
    render(
      <CarrouselCartes
        cartes={TROIS}
        visibleId="b"
        onVisible={vi.fn()}
        rendreAction={rendreAction}
      />,
    );

    const interrogees = rendreAction.mock.calls.map(([carte]) => carte.id);
    expect(new Set(interrogees)).toEqual(new Set(['a', 'b', 'c']));
    expect(rendreAction).toHaveBeenCalledWith(TROIS[1], true);
    expect(rendreAction).toHaveBeenCalledWith(TROIS[0], false);
    expect(rendreAction).toHaveBeenCalledWith(TROIS[2], false);
  });

  it('ne pose que ce que l’écran lui rend', () => {
    render(<CarrouselCartes cartes={TROIS} visibleId="b" onVisible={vi.fn()} rendreAction={fente} />);

    expect(screen.getByRole('button', { name: 'agir sur b' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'agir sur a' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'agir sur c' })).toBeNull();
  });

  it('ne rend rien de plus quand aucune fente n’est fournie', () => {
    render(<CarrouselCartes cartes={TROIS} visibleId="b" onVisible={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /^agir/ })).toBeNull();
  });

  it('ne re-choisit pas la carte quand on touche la fente', () => {
    // Sans cette coupure, toucher le bouton rappellerait `onVisible` — anodin
    // ici, mais c'est le même chemin que l'appui long ci-dessous.
    const onVisible = vi.fn();
    render(
      <CarrouselCartes cartes={TROIS} visibleId="b" onVisible={onVisible} rendreAction={fente} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'agir sur b' }));
    expect(onVisible).not.toHaveBeenCalled();
  });

  it('ne lève pas la carte quand le doigt s’attarde sur la fente', () => {
    render(
      <CarrouselCartes cartes={TROIS} visibleId="b" onVisible={vi.fn()} rendreAction={fente} />,
    );

    const carteB = screen.getAllByRole('listitem')[1];
    fireEvent.pointerDown(screen.getByRole('button', { name: 'agir sur b' }));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // `scale-105` n'est posé que sur la carte levée. Le doigt est resté plus
    // longtemps que les 350 ms de l'appui long, et rien ne s'est levé.
    expect(carteB.className).not.toMatch(/scale-105/);
  });
});
```

Ajouter `beforeEach` à l'import de `vitest` en tête du fichier :

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

```bash
npm test -w @kolek/ui -- src/CarrouselCartes.test.tsx
```

Attendu : ÉCHEC — TypeScript refuse `rendreAction`, et `agir sur b` reste introuvable.

- [ ] **Étape 3 : écrire l'implémentation**

Dans `packages/ui/src/CarrouselCartes.tsx`, ajouter l'import de type :

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
```

Ajouter la propriété à l'interface `Props` :

```tsx
interface Props {
  cartes: CarteItem[];
  /** La carte que l'écran considère comme choisie. Pilotée par le parent. */
  visibleId: string;
  onVisible: (id: string) => void;
  /**
   * Ce que chaque carte porte en pied. `choisie` dit laquelle est en face.
   *
   * Le carrousel ne décide de rien : il dit ce qu'il sait, l'écran répond ce
   * que chacune doit porter — ou `null`.
   *
   * Appelée pour **chaque** carte, et non pour la seule choisie : une carte
   * peut avoir quelque chose à montrer alors qu'on en regarde une autre. Que
   * la commande d'argent, elle, ne sorte que sur la carte choisie est une
   * politique de l'écran ; l'imposer ici la rendrait impossible à contredire.
   */
  rendreAction?: (carte: CarteItem, choisie: boolean) => ReactNode;
}
```

Déstructurer :

```tsx
export function CarrouselCartes({ cartes, visibleId, onVisible, rendreAction }: Props) {
```

Dans le `map` sur `rangees`, la fonction fléchée déclare déjà `const leve` et `const choisie`. Ajouter une troisième déclaration juste après elles :

```tsx
          const contenu = rendreAction?.(carte, choisie);
```

Puis remplacer l'appel à `<CarteCollecte …/>` par :

```tsx
              <CarteCollecte
                nomClient={carte.nomClient}
                misePar={carte.misePar}
                jourCourant={carte.jourCourant}
                solde={carte.solde}
                cycle={carte.cycle}
                action={
                  contenu ? (
                    // La coupure est posée ici, et non chez l'appelant :
                    // l'écran n'a pas à connaître les gestes de la piste. Sans
                    // elle, toucher le bouton lèverait la carte — le `li`
                    // écoute `pointerdown` pour l'appui long et `click` pour
                    // le choix.
                    <div
                      onPointerDown={(evenement) => evenement.stopPropagation()}
                      onClick={(evenement) => evenement.stopPropagation()}
                    >
                      {contenu}
                    </div>
                  ) : undefined
                }
              />
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

```bash
npm test -w @kolek/ui -- src/CarrouselCartes.test.tsx
```

Attendu : tous les tests du fichier passent, dont les 5 nouveaux.

- [ ] **Étape 5 : lancer toute la suite du paquet**

```bash
npm test -w @kolek/ui
```

Attendu : tout passe.

- [ ] **Étape 6 : committer**

```bash
git add packages/ui/src/CarrouselCartes.tsx packages/ui/src/CarrouselCartes.test.tsx
git commit -F - <<'EOF'
feat(ui): chaque carte porte ce que l'ecran lui donne, et la piste lui fiche la paix

Le carrousel ne decide de rien : il dit ce qu'il sait — quelle carte est
choisie — et l'ecran repond ce que chacune doit porter, ou rien.

Interrogees toutes, et non la seule choisie : une carte peut avoir quelque
chose a montrer pendant qu'on en regarde une autre.

La coupure des gestes est posee ici et non chez l'appelant. Le `li` ecoute
`pointerdown` pour l'appui long de 350 ms et `click` pour le choix ; sans
elle, toucher le bouton leverait la carte au lieu d'agir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Tâche 4 : le bouton dans la carte, et l'écriture différée

**Fichiers :**
- Modifier : `apps/collecteur/src/ecrans/FicheClient.tsx`
- Modifier : `apps/collecteur/src/ecrans/Clients.tsx:89,103,469-473`
- Modifier : `apps/collecteur/src/Coquille.tsx:198-212`
- Test : `apps/collecteur/src/ecrans/FicheClient.test.tsx` (réécrire deux tests, en ajouter trois)
- Test : `apps/collecteur/src/ecrans/Clients.test.tsx` (retirer la propriété morte)
- Test : `apps/collecteur/src/Coquille.test.tsx` (déplacer le déclencheur)

**Interfaces :**
- Consomme : `SURSIS_MS`, `SURSIS_S`, `EnAttente`, `misesAffichees`, `estRattrapee` (tâche 1) ; `rendreAction` (tâche 3) ; `enregistrerMise(collecteurId: string, carteId: string, montant: number)` de `../ecritures`, qui rend `{ ok: true; miseId: string } | { ok: false; echec: { code: string; message: string } }`.
- Produit : `FicheClient` n'a plus de propriété `onEncaisser` ; `Clients` non plus.

**Note :** `enregistrerMise` doit s'ajouter au `vi.mock('../ecritures', …)` en tête de `FicheClient.test.tsx`, sans quoi l'appel réel partirait vers Supabase.

- [ ] **Étape 1 : écrire les tests qui échouent**

Dans `apps/collecteur/src/ecrans/FicheClient.test.tsx` :

**(a)** compléter la simulation des écritures, en tête de fichier :

```tsx
const enregistrerMise = vi.fn();

vi.mock('../ecritures', () => ({
  definirConsentementAvis: vi.fn(),
  ouvrirCarte: vi.fn(),
  enregistrerMise: (collecteurId: string, carteId: string, montant: number) =>
    enregistrerMise(collecteurId, carteId, montant),
}));
```

**(b)** compléter le `afterEach` existant :

```tsx
afterEach(() => {
  cleanup();
  chargerFicheClient.mockReset();
  enregistrerMise.mockReset();
  vi.useRealTimers();
});
```

**(c)** remplacer intégralement les deux tests `porte le montant de sa propre carte sur chaque bouton` et `envoie l'identifiant de la carte touchée, pas celui de sa voisine` par :

```tsx
  it('porte le montant de sa propre carte sur le bouton de la carte choisie', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);

    render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    // La mise est immuable : le bouton qui la déclenche doit dire ce qu'il
    // encaisse. Il est dans la carte, donc il n'y en a qu'un — celui de la
    // carte choisie.
    expect(await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Encaisser 2 000 FCFA' })).toBeNull();

    // Et il suit la carte : le point de la seconde l'amène en face.
    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));

    expect(await screen.findByRole('button', { name: 'Encaisser 2 000 FCFA' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Encaisser 6 000 FCFA' })).toBeNull();
  });

  it('n’écrit rien avant la fin du sursis, et écrit la bonne carte après', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

    render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    // Le tri met la plus avancée en premier : kB (20 mises) est en face, kA
    // (5 mises) est sa voisine. On amène la voisine, et c'est elle qu'on
    // touche — encaisser sur la mauvaise carte ne se rattrape pas.
    expect(await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));

    // Le `findBy` passe avant les minuteurs simulés : `waitFor` s'appuie sur
    // les mêmes minuteurs, et l'attendre après les avoir gelés le suspendrait
    // jusqu'au délai de garde.
    const bouton = await screen.findByRole('button', { name: 'Encaisser 2 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(bouton);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(enregistrerMise).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(enregistrerMise).toHaveBeenCalledTimes(1);
    expect(enregistrerMise).toHaveBeenCalledWith('col1', 'kA', 2000);
  });

  it('remplit la case tout de suite, avant même que rien ne soit parti', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

    render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    // kB est en face : 20 mises sur 31.
    expect(await screen.findByText('20/31 j · 65 %')).toBeTruthy();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));

    // Rien n'est parti, et pourtant le jour est compté. C'est ce que le
    // collecteur vient de faire ; l'écran le dit avant la base.
    expect(enregistrerMise).not.toHaveBeenCalled();
    expect(screen.getByText('21/31 j · 68 %')).toBeTruthy();
  });

  it('n’écrit jamais quand on annule pendant le sursis', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

    render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Une mise écrite ne se defait pas. Annuler ne peut donc rien effacer : il
    // empêche. Le bouton d'encaissement est revenu, la case s'est revidée.
    expect(enregistrerMise).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' })).toBeTruthy();
    expect(screen.getByText('20/31 j · 65 %')).toBeTruthy();
  });
```

**(d)** dans chacun des autres rendus de `<FicheClient …>` du fichier (lignes ~187, 217, 237, 327, 360, 381), retirer la ligne `onEncaisser={vi.fn()}`.

**(e)** ajouter `act` à l'import de `@testing-library/react` en tête du fichier :

```tsx
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
```

Dans `apps/collecteur/src/ecrans/Clients.test.tsx`, retirer la ligne `onEncaisser={vi.fn()}` (ligne ~91) du rendu de `<Clients …>`.

Dans `apps/collecteur/src/Coquille.test.tsx` :

**(f)** retirer `onEncaisser` du témoin `Clients` — sa propriété et le bouton `encaisser k7` :

```tsx
vi.mock('./ecrans/Clients', () => ({
  Clients: ({ onRetrait }: { onRetrait: (c: { id: string; nom: string }) => void }) => (
    <>
      <div>écran Clients</div>
      <button type="button" onClick={() => onRetrait({ id: 'cli9', nom: 'Sy' })}>
        retirer pour Sy
      </button>
    </>
  ),
}));
```

**(g)** le porter sur le témoin `Accueil`, seul écran à garder ce chemin :

```tsx
// `onEncaisser` a quitté la liste des clients le 2026-08-31 : la fiche encaisse
// désormais sur place. L'accueil reste le seul à renvoyer vers l'écran dédié,
// depuis sa tuile « carte du jour » — c'est donc lui qui porte le déclencheur.
vi.mock('./ecrans/Accueil', () => ({
  Accueil: ({
    onNaviguer,
    onEncaisser,
  }: {
    onNaviguer: (cle: string) => void;
    onEncaisser: (carte: {
      carteId: string;
      clientNom: string;
      mise: number;
      misesEncaissees: number;
    }) => void;
  }) => (
    <>
      <div>écran Accueil</div>
      <button type="button" onClick={() => onNaviguer('retrait')}>
        tuile Retrait
      </button>
      <button
        type="button"
        onClick={() =>
          onEncaisser({ carteId: 'k7', clientNom: 'Sy', mise: 5000, misesEncaissees: 17 })
        }
      >
        encaisser k7
      </button>
    </>
  ),
}));
```

**(h)** dans les deux tests du `describe('ce que la coquille fait de la carte encaissée')`, aller à l'accueil avant de cliquer, puisque la coquille démarre sur `clients` :

```tsx
    render(<Coquille onDeconnexion={vi.fn()} />);

    const barre = screen.getByRole('navigation', { name: 'Navigation principale' });
    fireEvent.click(within(barre).getByRole('button', { name: 'Accueil' }));

    fireEvent.click(await screen.findByRole('button', { name: 'encaisser k7' }));
```

Dans le second test (`oublie la carte en quittant l'écran…`), la barre est déjà récupérée plus bas ; réutiliser la même constante plutôt que d'en déclarer une seconde.

- [ ] **Étape 2 : lancer les tests, vérifier qu'ils échouent**

```bash
npm test -w @kolek/collecteur -- src/ecrans/FicheClient.test.tsx
```

Attendu : ÉCHEC — `Annuler` introuvable, `enregistrerMise` jamais appelée, et TypeScript signale la propriété `onEncaisser` manquante dans les rendus.

- [ ] **Étape 3 : écrire l'implémentation**

**(a)** Dans `apps/collecteur/src/ecrans/FicheClient.tsx`, remplacer les imports de tête :

```tsx
import { MISES_PAR_CYCLE, formatMontant, soldeRestituable } from '@kolek/core';
import { Bouton, CarrouselCartes, Feuille, Icone, LigneTransaction, type CarteItem } from '@kolek/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import { definirConsentementAvis, enregistrerMise, ouvrirCarte } from '../ecritures';
import {
  estRattrapee,
  misesAffichees,
  SURSIS_MS,
  SURSIS_S,
  type EnAttente,
} from '../encaissement-differe';
import { chargerFicheClient, type CarteFiche, type FicheClient as Fiche } from '../lectures-ecrans';
import { ActiverCarte } from './ActiverCarte';
import { ChoixMise } from './ChoixMise';
```

L'import `import type { CarteChoisie } from '../Coquille';` disparaît : plus rien ne le consomme.

**(b)** Retirer `onEncaisser` de la signature de `FicheClient` et de son passage à `CartesEnCours` :

```tsx
export function FicheClient({
  clientId,
  collecteurId,
  revision,
  onFermer,
  onEcriture,
  onRetrait,
}: {
  clientId: string | null;
  collecteurId: string | null;
  revision: number;
  onFermer: () => void;
  onEcriture: () => void;
  onRetrait: (clientNom: string) => void;
}) {
```

```tsx
            <CartesEnCours
              actives={actives}
              nomClient={fiche.nom}
              clientId={fiche.id}
              collecteurId={collecteurId}
              onRetrait={onRetrait}
              onEcriture={onEcriture}
            />
```

**(c)** Remplacer intégralement le corps de `CartesEnCours` (bloc de documentation compris) par :

```tsx
/**
 * Les cartes en cours d'un client, et ce qu'on peut faire de celle qu'on regarde.
 *
 * ## Le bouton est entré dans la carte, le 2026-08-31
 *
 * Il vivait sous la rangée, et il quittait la fiche pour un second écran qui
 * remontrait la carte en grand avec un bouton « Confirmer ». Deux écrans pour
 * un geste fait trente fois par matinée, debout, le client en face — et la
 * carte qu'on venait de regarder disparaissait au moment de décider.
 *
 * Deux raisons de le loger dans la carte plutôt que sous elle :
 *
 * - **il n'y a plus de doute sur la carte servie.** Depuis que la rangée sait
 *   montrer deux ou quatre cartes ensemble, un bouton unique posé dessous ne
 *   désigne plus personne. Le liseré aidait ; il ne suffisait pas, et se
 *   tromper de carte ici, c'est encaisser sur le mauvais cycle ;
 * - **il défile avec elle.** Le bandeau de sursis aussi : le collecteur peut
 *   aller regarder une autre carte pendant le décompte sans perdre de vue ce
 *   qui est en train de partir.
 *
 * ## Les six secondes
 *
 * `mises` est append-only — voir `encaissement-differe.ts`, qui porte la règle.
 * L'appui remplit la case à l'écran et n'écrit rien ; l'insertion part six
 * secondes plus tard. Fermer la fiche ou passer l'application en arrière-plan
 * ne perd pas la mise : elle part tout de suite.
 *
 * ## Pourquoi l'attente est aussi tenue en référence
 *
 * La purge est appelée depuis un démontage et depuis un écouteur du document.
 * Ni l'un ni l'autre ne voit autre chose que l'état du premier rendu ; une
 * référence, si.
 */
function CartesEnCours({
  actives,
  nomClient,
  clientId,
  collecteurId,
  onRetrait,
  onEcriture,
}: {
  actives: Array<{ carte: CarteFiche; cycle: number }>;
  nomClient: string;
  clientId: string;
  collecteurId: string | null;
  /** Le nom accompagne la demande : l'écran de retrait s'ouvre réduit à ce
      client et doit pouvoir le nommer même quand il ne lui reste aucune carte. */
  onRetrait: (clientNom: string) => void;
  onEcriture: () => void;
}) {
  const [visibleId, setVisibleId] = useState(actives[0].carte.id);
  const [attente, setAttente] = useState<EnAttente | null>(null);
  const [restant, setRestant] = useState(0);

  const enCours = useRef<EnAttente | null>(null);
  const sursis = useRef<number | null>(null);
  const decompte = useRef<number | null>(null);
  const monte = useRef(true);

  // Le contexte d'écriture suit chaque rendu, pour la même raison que
  // l'attente : la purge part d'endroits qui ne referment rien.
  const contexte = useRef({ collecteurId, onEcriture });
  contexte.current = { collecteurId, onEcriture };

  function poser(en: EnAttente | null) {
    enCours.current = en;
    // Après le démontage, la référence reste utile — l'écriture en cours la
    // lit — mais l'état ne peut plus rien afficher.
    if (monte.current) setAttente(en);
  }

  function arreter() {
    if (sursis.current !== null) window.clearTimeout(sursis.current);
    if (decompte.current !== null) window.clearInterval(decompte.current);
    sursis.current = null;
    decompte.current = null;
    if (monte.current) setRestant(0);
  }

  async function ecrire(en: EnAttente) {
    const { collecteurId: id, onEcriture: prevenir } = contexte.current;
    if (!id) return;
    const resultat = await enregistrerMise(id, en.carteId, en.mise);
    if (resultat.ok) {
      // L'attente n'est pas levée ici : la relecture s'en charge. La lever
      // maintenant reviderait la case le temps que la fiche revienne.
      prevenir();
      return;
    }
    poser({ ...en, envoyee: true, echec: resultat.echec.message });
  }

  /** Écrit tout de suite ce qui attendait, et rend les minuteurs au repos. */
  function purger() {
    arreter();
    const en = enCours.current;
    if (!en) return;
    // Déjà partie et sans échec : la relecture s'en occupe. La renvoyer
    // écrirait la mise une seconde fois, et rien ne la retirerait.
    if (en.envoyee && !en.echec) return;
    const repris: EnAttente = { ...en, envoyee: true, echec: undefined };
    poser(repris);
    void ecrire(repris);
  }

  function encaisser(carte: CarteFiche) {
    // Un second appui pendant un décompte fait partir le premier. Deux mises
    // le même jour sur la même carte sont acceptées par le serveur ; ce n'est
    // pas à cet écran de les interdire, seulement de ne pas les perdre.
    purger();

    const en: EnAttente = {
      carteId: carte.id,
      mise: carte.mise,
      base: carte.misesEncaissees,
      envoyee: false,
    };
    poser(en);
    setRestant(SURSIS_S);

    decompte.current = window.setInterval(
      () => setRestant((seconde) => Math.max(0, seconde - 1)),
      1000,
    );
    sursis.current = window.setTimeout(() => {
      arreter();
      // L'attente a pu être annulée ou remplacée entre-temps.
      if (enCours.current !== en) return;
      const partie: EnAttente = { ...en, envoyee: true };
      poser(partie);
      void ecrire(partie);
    }, SURSIS_MS);
  }

  function annuler() {
    arreter();
    poser(null);
  }

  function reessayer() {
    const en = enCours.current;
    if (!en) return;
    const repris: EnAttente = { ...en, envoyee: true, echec: undefined };
    poser(repris);
    void ecrire(repris);
  }

  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
      purger();
    };
    // `purger` ne touche que des références : la refermer à chaque rendu ne
    // changerait rien, et ce dénouement appartient au seul démontage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function surMasquage() {
      // L'application passe en arrière-plan : le sursis n'a plus de témoin, et
      // le système peut la tuer sans prévenir. Ce qui attendait part maintenant.
      if (document.visibilityState === 'hidden') purger();
    }
    document.addEventListener('visibilitychange', surMasquage);
    return () => document.removeEventListener('visibilitychange', surMasquage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Le compte réel de la carte qui attend, s'il y en a une et qu'elle est
  // toujours là. `null` quand la carte a disparu de la fiche — clôturée.
  const reelles = attente
    ? (actives.find(({ carte: c }) => c.id === attente.carteId)?.carte.misesEncaissees ?? null)
    : null;

  useEffect(() => {
    if (!attente) return;
    if (reelles === null || estRattrapee(reelles, attente)) poser(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attente, reelles]);

  const courant = actives.find(({ carte }) => carte.id === visibleId) ?? actives[0];
  const { carte } = courant;
  const misesCourantes = misesAffichees(carte.id, carte.misesEncaissees, attente);
  const complete = misesCourantes >= MISES_PAR_CYCLE;
  const solde = formatMontant(soldeRestituable(misesCourantes, carte.mise));

  function rendreAction(item: CarteItem, choisie: boolean) {
    const trouvee = actives.find(({ carte: c }) => c.id === item.id);
    if (!trouvee) return null;
    const { carte: c } = trouvee;

    // Le bandeau passe avant le choix : une mise qui part doit rester sous les
    // yeux même quand on est allé regarder la carte d'à côté. C'est la seule
    // chose qu'une carte non choisie ait le droit de montrer.
    if (attente && attente.carteId === c.id) {
      return (
        <BandeauSursis
          attente={attente}
          restant={restant}
          onAnnuler={annuler}
          onReessayer={reessayer}
        />
      );
    }

    // La commande d'argent, elle, ne sort que sur la carte choisie : deux
    // boutons visibles ensemble, et se tromper de cycle redevient possible.
    if (!choisie) return null;

    // Une carte au bout de son cycle ne s'encaisse plus : les deux portes de
    // fin de cycle vivent sous la rangée, où elles ont la place de s'expliquer.
    if (misesAffichees(c.id, c.misesEncaissees, attente) >= MISES_PAR_CYCLE) return null;

    return (
      <button
        type="button"
        // Le nom accessible porte le montant en toutes lettres, quelle que soit
        // la largeur : à 160 px le libellé se raccourcit, la mise annoncée non.
        aria-label={`Encaisser ${formatMontant(c.mise)} FCFA`}
        onClick={() => encaisser(c)}
        className="anim-pression w-full min-h-11 px-4 rounded-md bg-primary text-primary-foreground border border-primary font-body font-semibold text-base flex items-center justify-center gap-2 cursor-pointer @max-[240px]:min-h-11 @max-[240px]:px-2 @max-[240px]:text-xs @max-[240px]:gap-1"
      >
        <Icone nom="circle-dollar-sign" taille={16} />
        <span aria-hidden="true" className="@max-[240px]:hidden">
          Encaisser {formatMontant(c.mise)} FCFA
        </span>
        <span aria-hidden="true" className="hidden @max-[240px]:inline">
          Encaisser
        </span>
      </button>
    );
  }

  return (
    <section>
      <p className="font-headings font-bold text-base text-ink mb-2">
        {actives.length > 1 ? 'Cartes en cours' : 'Carte en cours'}
      </p>

      <CarrouselCartes
        cartes={actives.map(({ carte: c, cycle: rang }) => {
          const affichees = misesAffichees(c.id, c.misesEncaissees, attente);
          return {
            id: c.id,
            nomClient,
            misePar: formatMontant(c.mise),
            jourCourant: affichees,
            solde: formatMontant(soldeRestituable(affichees, c.mise)),
            cycle: String(rang),
          };
        })}
        visibleId={courant.carte.id}
        onVisible={setVisibleId}
        rendreAction={rendreAction}
      />

      {complete && (
        <div className="bg-positive-tint rounded-md p-3 mt-3 space-y-3">
          <div>
            <p className="font-body text-sm text-ink m-0">
              Cycle terminé — {MISES_PAR_CYCLE} mises sur {MISES_PAR_CYCLE}.
            </p>
            <p className="font-body text-xs text-muted-foreground mt-1">
              Tu peux lui rendre ses {solde} FCFA, ou lui activer une carte de plus. Tant qu'il n'y
              a pas de retrait, cette carte reste ouverte et son solde lui est dû.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Bouton variante="contour" icone="arrow-up-right" onClick={() => onRetrait(nomClient)}>
              Aller au retrait
            </Bouton>
            <ActiverCarte
              collecteurId={collecteurId}
              clientId={clientId}
              misePreremplie={carte.mise}
              identifiant={`fiche-${carte.id}`}
              onOuverte={onEcriture}
            />
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Ce que la carte porte pendant les six secondes — et après, si l'écriture a
 * échoué.
 *
 * Le décompte est marqué `aria-hidden` : un nom accessible qui change chaque
 * seconde rendrait le bouton introuvable pour qui le cherche par son nom, et
 * bavard pour qui l'écoute.
 */
function BandeauSursis({
  attente,
  restant,
  onAnnuler,
  onReessayer,
}: {
  attente: EnAttente;
  restant: number;
  onAnnuler: () => void;
  onReessayer: () => void;
}) {
  if (attente.echec) {
    return (
      <div className="rounded-md bg-negative-tint border border-negative/30 p-2 @max-[240px]:p-1.5">
        <p
          role="alert"
          className="font-body text-xs font-semibold text-negative m-0 @max-[240px]:text-[10px]"
        >
          {attente.echec}
        </p>
        <button
          type="button"
          onClick={onReessayer}
          className="anim-pression mt-1.5 w-full min-h-11 rounded-md border border-negative/40 text-negative font-body text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Icone nom="refresh-cw" taille={14} />
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-positive-tint border border-positive/30 p-2 flex items-center justify-between gap-2 @max-[240px]:p-1.5 @max-[240px]:gap-1">
      <span
        role="status"
        className="flex items-center gap-1.5 min-w-0 font-body text-xs font-semibold text-positive @max-[240px]:text-[10px]"
      >
        <Icone nom="check-circle" taille={14} className="shrink-0" />
        <span className="truncate">{formatMontant(attente.mise)} FCFA encaissé</span>
      </span>
      {!attente.envoyee && (
        <button
          type="button"
          onClick={onAnnuler}
          className="anim-pression shrink-0 min-h-11 px-3 rounded-pill border border-positive/40 text-positive font-body text-xs font-semibold cursor-pointer @max-[240px]:px-2"
        >
          Annuler{' '}
          <span aria-hidden="true" className="tabular-nums opacity-70">
            {restant} s
          </span>
        </button>
      )}
    </div>
  );
}
```

**(d)** Dans `apps/collecteur/src/ecrans/Clients.tsx`, retirer `onEncaisser` de la déstructuration (ligne ~89), de l'interface des propriétés (ligne ~103), et simplifier le rendu de la fiche (lignes ~469-473) :

```tsx
      <FicheClient
        clientId={fiche}
        collecteurId={collecteurId}
        revision={revision}
        onFermer={() => setFiche(null)}
        onEcriture={onEcriture}
        onRetrait={(nom) => {
```

**(e)** Dans `apps/collecteur/src/Coquille.tsx`, retirer la ligne `onEncaisser={encaisserSur}` du rendu de `<Clients …>` (ligne ~212). Celle du rendu de `<Accueil …>` (ligne ~198) reste : l'accueil garde ce chemin.

- [ ] **Étape 4 : lancer les tests, vérifier qu'ils passent**

```bash
npm test -w @kolek/collecteur
```

Attendu : toute la suite du collecteur passe, dont les 4 tests de la fiche réécrits ou ajoutés.

- [ ] **Étape 5 : vérifier que TypeScript est d'accord**

```bash
npm run build -w @kolek/collecteur
```

Attendu : compilation sans erreur. En particulier, aucun `onEncaisser` orphelin.

- [ ] **Étape 6 : committer**

```bash
git add apps/collecteur/src/ecrans/FicheClient.tsx apps/collecteur/src/ecrans/FicheClient.test.tsx apps/collecteur/src/ecrans/Clients.tsx apps/collecteur/src/ecrans/Clients.test.tsx apps/collecteur/src/Coquille.tsx apps/collecteur/src/Coquille.test.tsx
git commit -F - <<'EOF'
feat(encaissement): la fiche encaisse sur place, six secondes plus tard

Le bouton quittait la fiche pour un second ecran qui remontrait la carte
en grand. Il entre dans la carte choisie : plus de doute sur celle qui est
servie, et il defile avec elle.

L'appui remplit la case a l'ecran et n'ecrit rien ; l'insertion part six
secondes plus tard, annulable jusque-la. Une mise ecrite ne se defait pas.

`onEncaisser` disparait de la fiche et de la liste des clients : plus rien
ne l'appelle. L'accueil garde ce chemin, l'ecran dedie aussi.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Tâche 5 : la purge à la fermeture et à la mise en arrière-plan

Le code de la tâche 4 la porte déjà. Cette tâche la **verrouille** par des tests : sans eux, un futur nettoyage des effets ferait disparaître la garantie sans rien casser de visible.

**Fichiers :**
- Test : `apps/collecteur/src/ecrans/FicheClient.test.tsx` (ajouter un `describe`)

**Interfaces :**
- Consomme : tout ce que produit la tâche 4.
- Produit : rien de nouveau.

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à `apps/collecteur/src/ecrans/FicheClient.test.tsx`, après le `describe` existant sur la fiche à plusieurs cartes :

```tsx
/**
 * Les six secondes sont un sursis, pas une promesse d'oubli.
 *
 * Tout ce qui fait perdre le témoin du décompte — la fiche qu'on referme,
 * l'application qui passe en arrière-plan — doit faire partir l'écriture au
 * lieu de l'attendre. Le système peut tuer une application masquée sans
 * prévenir, et la mise ne se rattraperait pas.
 */
describe('ce qui attend part quand on cesse de regarder', () => {
  it('écrit tout de suite quand la fiche se referme pendant le sursis', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

    const { rerender } = render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(enregistrerMise).not.toHaveBeenCalled();

    // `clientId` à `null` referme la feuille, qui ne rend plus rien.
    rerender(
      <FicheClient
        clientId={null}
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    expect(enregistrerMise).toHaveBeenCalledTimes(1);
    expect(enregistrerMise).toHaveBeenCalledWith('col1', 'kB', 6000);
  });

  it('écrit tout de suite quand l’application passe en arrière-plan', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

    render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // `visibilityState` est un accesseur de `Document.prototype`, pas une
    // propriété propre du document : `vi.spyOn` n'a rien à remplacer dessus.
    // On pose l'accesseur sur l'instance, et on le retire ensuite.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    delete (document as Partial<Document>).visibilityState;

    expect(enregistrerMise).toHaveBeenCalledTimes(1);
    expect(enregistrerMise).toHaveBeenCalledWith('col1', 'kB', 6000);
  });

  it('n’écrit pas deux fois quand la fiche se referme après le sursis', async () => {
    // La relecture qui suit une écriture réussie démonte cette section — la
    // fiche repasse par « Lecture… ». Sans la garde `envoyee`, ce démontage
    // renverrait la mise, et rien en base ne la retirerait.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

    const { rerender } = render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(enregistrerMise).toHaveBeenCalledTimes(1);

    rerender(
      <FicheClient
        clientId={null}
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    expect(enregistrerMise).toHaveBeenCalledTimes(1);
  });

  it('fait partir la mise en attente quand on encaisse une autre carte', async () => {
    // Une seule attente à la fois. Celle qu'on abandonne ne doit pas se perdre
    // pour autant : deux mises le même jour sont acceptées par le serveur, ce
    // n'est pas à cet écran de les interdire.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

    render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(enregistrerMise).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 2 000 FCFA' }));

    // kB part maintenant, kA prend sa place dans le sursis.
    expect(enregistrerMise).toHaveBeenCalledTimes(1);
    expect(enregistrerMise).toHaveBeenCalledWith('col1', 'kB', 6000);

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(enregistrerMise).toHaveBeenCalledTimes(2);
    expect(enregistrerMise).toHaveBeenLastCalledWith('col1', 'kA', 2000);
  });
});

/**
 * Le bandeau appartient à sa carte, pas à l'écran.
 *
 * Pendant le décompte, le collecteur doit pouvoir aller regarder une autre
 * carte — c'est même le geste que la rangée existe pour rendre facile. La mise
 * qui est en train de partir ne peut pas disparaître de l'écran à ce moment-là.
 */
describe('le bandeau de sursis reste sur sa carte', () => {
  it('survit au choix d’une autre carte', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm1' });

    render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));

    // kA est désormais la carte choisie et porte son bouton — et le bandeau de
    // kB est toujours là, avec son « Annuler ».
    expect(screen.getByRole('button', { name: 'Encaisser 2 000 FCFA' })).toBeTruthy();
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
  });
});
```

- [ ] **Étape 2 : lancer les tests**

```bash
npm test -w @kolek/collecteur -- src/ecrans/FicheClient.test.tsx
```

Attendu : PASS, les cinq. Si l'un échoue, c'est l'implémentation de la tâche 4 qui est en cause — corriger `purger()` ou `rendreAction` plutôt que le test.

- [ ] **Étape 3 : committer**

```bash
git add apps/collecteur/src/ecrans/FicheClient.test.tsx
git commit -F - <<'EOF'
test(encaissement): le sursis n'est pas une promesse d'oubli

Tout ce qui fait perdre le temoin du decompte — la fiche refermee,
l'application masquee, une autre carte encaissee — doit faire partir
l'ecriture au lieu de l'attendre. Le systeme peut tuer une application en
arriere-plan sans prevenir.

Et la garde qui empeche le double envoi : la relecture qui suit une
ecriture reussie demonte la section, et ce demontage renverrait la mise.

Enfin, le bandeau appartient a sa carte : faire defiler pendant le
decompte ne doit pas effacer de l'ecran la mise qui est en train de
partir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Tâche 6 : l'échec d'écriture, et « Réessayer »

**Fichiers :**
- Test : `apps/collecteur/src/ecrans/FicheClient.test.tsx` (ajouter un `describe`)

**Interfaces :**
- Consomme : `BandeauSursis` et `reessayer` de la tâche 4.
- Produit : rien de nouveau.

- [ ] **Étape 1 : écrire les tests qui échouent**

Ajouter à `apps/collecteur/src/ecrans/FicheClient.test.tsx` :

```tsx
describe('quand l’écriture échoue', () => {
  it('laisse la case remplie, et dit que la base ne le sait pas', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({
      ok: false,
      echec: { code: 'RESEAU', message: 'Réseau indisponible. Réessaie.' },
    });

    render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    // Les minuteurs sont gelés **avant** l'appui : celui-ci pose le `setTimeout`
    // du sursis, et un minuteur né sous l'horloge réelle ne répond pas à
    // `advanceTimersByTime`.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    // Rendus à l'horloge réelle avant le `findBy` qui suit : il attend une
    // promesse d'écriture, et `waitFor` s'appuie sur les mêmes minuteurs.
    vi.useRealTimers();

    // La case reste remplie : elle dit ce que le collecteur croit avoir
    // encaissé. Le message dit que la base ne le sait pas encore. L'effacer
    // ferait le contraire des deux.
    expect(await screen.findByText('Réseau indisponible. Réessaie.')).toBeTruthy();
    expect(screen.getByText('21/31 j · 68 %')).toBeTruthy();

    // Plus d'« Annuler » : la mise est peut-être partie. Seul « Réessayer »
    // a encore un sens.
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });

  it('renvoie la même mise, sur la même carte, quand on réessaie', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue({
      ok: false,
      echec: { code: 'RESEAU', message: 'Réseau indisponible. Réessaie.' },
    });

    render(
      <FicheClient
        clientId="cli3"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByRole('button', { name: 'Encaisser 6 000 FCFA' });

    // Les minuteurs sont gelés **avant** l'appui : celui-ci pose le `setTimeout`
    // du sursis, et un minuteur né sous l'horloge réelle ne répond pas à
    // `advanceTimersByTime`.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Encaisser 6 000 FCFA' }));
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    // Rendus à l'horloge réelle avant le `findBy` qui suit : il attend une
    // promesse d'écriture, et `waitFor` s'appuie sur les mêmes minuteurs.
    vi.useRealTimers();

    const reessayer = await screen.findByRole('button', { name: 'Réessayer' });
    enregistrerMise.mockResolvedValue({ ok: true, miseId: 'm2' });
    fireEvent.click(reessayer);

    expect(enregistrerMise).toHaveBeenCalledTimes(2);
    expect(enregistrerMise).toHaveBeenLastCalledWith('col1', 'kB', 6000);
  });
});
```

- [ ] **Étape 2 : lancer les tests**

```bash
npm test -w @kolek/collecteur -- src/ecrans/FicheClient.test.tsx
```

Attendu : PASS, les deux. Si `Réessayer` reste introuvable, la branche `attente.echec` de `BandeauSursis` n'est pas atteinte — vérifier que `ecrire` repose bien l'attente avec `echec` sur un résultat `ok: false`.

- [ ] **Étape 3 : lancer toute la suite du dépôt**

```bash
npm test
```

Attendu : `@kolek/core`, `@kolek/ui`, `@kolek/collecteur` et `@kolek/admin` passent tous.

- [ ] **Étape 4 : compiler les deux paquets touchés**

```bash
npm run build -w @kolek/collecteur
```

Attendu : aucune erreur TypeScript.

- [ ] **Étape 5 : committer**

```bash
git add apps/collecteur/src/ecrans/FicheClient.test.tsx
git commit -F - <<'EOF'
test(encaissement): une ecriture refusee laisse la case remplie

La case dit ce que le collecteur croit avoir encaisse ; le message dit que
la base ne le sait pas encore. L'effacer ferait le contraire des deux.

« Annuler » disparait alors — la mise est peut-etre partie — et seul
« Reessayer » garde un sens.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Vérification finale

- [ ] `npm test` — toute la suite du dépôt.
- [ ] `npm run build -w @kolek/collecteur` — TypeScript.
- [ ] `npm run lint -w @kolek/collecteur` — oxlint.
- [ ] À la main, dans le navigateur : ouvrir la fiche d'un client à trois cartes actives, en taille `Réduire`. Toucher la deuxième carte : son bouton sort dedans, les deux autres n'en ont pas. Toucher le bouton : la case se remplit, « Annuler 6 s » décompte. Faire défiler jusqu'à la troisième carte pendant le décompte : le bandeau reste sur la deuxième. Laisser filer : la fiche se relit, la case est acquise.
- [ ] À la main : recommencer, et fermer la fiche à 2 s. Rouvrir : la mise est là.
- [ ] À la main : recommencer, couper le réseau, laisser filer les 6 s. Le message rouge et « Réessayer » apparaissent dans la carte ; la case reste remplie.
