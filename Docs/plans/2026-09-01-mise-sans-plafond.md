# Mise journalière sans plafond — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec :** [Docs/specs/2026-09-01-mise-sans-plafond-design.md](../specs/2026-09-01-mise-sans-plafond-design.md)

**Goal :** supprimer le plafond de 10 000 FCFA sur la mise journalière, en le remplaçant par une confirmation à l'écran et en empêchant les produits SQL de déborder l'`integer`.

**Architecture :** trois couches, dans cet ordre. `packages/core` cesse de refuser au-dessus de 10 000 et expose à la place un seuil de confirmation. `ChoixMise` demande confirmation au-delà de ce seuil, et ne remonte `null` au parent tant que la confirmation manque — c'est le compilateur, via `number | null`, qui force les trois écrans appelants à garder leur bouton. Une seule migration élargit les deux contraintes `CHECK` **et** coule en `bigint` le produit `(mises_encaissees − 1) × mise` partout où il est calculé : les deux sont inséparables, puisqu'élargir sans couler ne fait que déplacer le refus vers un plantage.

**Tech Stack :** npm workspaces, TypeScript, React 19, Tailwind v4, Vitest 4 + @testing-library/react (jsdom), Supabase / PostgreSQL 15.

## Global Constraints

- `MISE_MIN = 500` — inchangé, c'est la seule borne qui reste un refus.
- `MISE_INHABITUELLE = 10_000` — seuil de **confirmation**, pas de refus. Un montant **égal** à 10 000 ne demande rien ; seul le strictement supérieur demande.
- `MISE_MAX_STOCKABLE = 2_147_483_647` — borne physique de la colonne `integer`.
- `MISE_MAX` cesse d'exister. Aucun fichier ne doit encore l'importer à la fin du chantier.
- `MISES_USUELLES = [500, 1000, 2000, 5000, 10000]` ne change pas.
- Le code d'erreur `MISE_HORS_BORNES` ne change pas ; seul son message change.
- Les noms de contraintes `cartes_mise_check` et `mises_montant_borne` sont **conservés** — un garde-fou de `20260818010000_socle_storage_et_bornes.sql:128` vérifie le second par son nom.
- Invariant de `ChoixMise` : tant que le champ libre est ouvert, le parent détient exactement ce que le champ montre — `null` si le champ est vide, invalide, ou inhabituel-non-confirmé.
- Vitest n'a **pas** `globals` : `describe`, `it`, `expect`, `vi` s'importent depuis `'vitest'`.
- **`@testing-library/jest-dom` n'est pas installé** : `apps/collecteur/vitest.config.ts` n'a pas de `setupFiles`. `toBeChecked`, `toHaveTextContent`, `toBeInTheDocument` n'existent pas. Le style du dépôt est `.textContent` + `toContain`, `toBeTruthy()`, `queryBy… → toBeNull()`, et `(el as HTMLInputElement).checked → toBe(true)`.
- `formatMontant` ne suffixe pas « FCFA » : `formatMontant(10000) === '10 000'` avec une **espace insécable**. Dans les tests, appeler `formatMontant` plutôt que d'écrire le nombre à la main — c'est la seule façon de ne pas se tromper d'espace.
- Le vrai contrôle de types est `npx tsc -b` à la racine. `tsc --noEmit -p apps/collecteur` ne vérifie rien (fichier solution à `"files": []`).
- Textes d'interface en français, apostrophe typographique `’` comme dans le code existant.

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `packages/core/src/calcul.ts` | Les trois constantes et les deux prédicats. Source unique de la règle. | 1 |
| `packages/core/src/calcul.test.ts` | Ce que les prédicats acceptent et refusent. | 1 |
| `apps/collecteur/src/ecritures.ts` | Trois messages de refus, sans borne haute. | 1 |
| `apps/collecteur/src/ecrans/ActiverCarte.test.tsx` | Suit le nouveau texte de refus. | 1 |
| `apps/collecteur/src/ecrans/ChoixMise.tsx` | La confirmation, et l'invariant qui la rend opposable. | 2 |
| `apps/collecteur/src/ecrans/ChoixMise.test.tsx` | **Créé.** L'invariant, cas par cas. | 2 |
| `apps/collecteur/src/ecrans/ActiverCarte.tsx` | Garde son bouton sur `mise === null`. | 2 |
| `apps/collecteur/src/ecrans/Clients.tsx` | Idem, dans `pret`. | 2 |
| `apps/collecteur/src/ecrans/FicheClient.tsx` | Idem, dans `NouvelleCarte`. | 2 |
| `supabase/migrations/20260901090000_mise_sans_plafond.sql` | **Créé.** `bigint` d'abord, bornes ensuite. | 3 |
| `supabase/tests/mise-sans-plafond.test.ts` | **Créé.** Ce que la base accepte et ce qu'elle rend. | 3 |
| `Docs/Kolek Cahier de charges consolide.md` | La règle métier écrite. | 3 |
| `Docs/Kolek Design System.md` | La description du sélecteur de mise. | 3 |

---

### Task 1 : Le noyau et les textes de refus

**Files:**
- Modify: `packages/core/src/calcul.ts:3-18`
- Test: `packages/core/src/calcul.test.ts:50-74`
- Modify: `apps/collecteur/src/ecritures.ts:1`, `:129`, `:195`, `:302`
- Modify: `apps/collecteur/src/ecrans/ChoixMise.tsx:1`, `:101`, `:122`
- Test: `apps/collecteur/src/ecrans/ActiverCarte.test.tsx:104`, `:157`

**Interfaces:**
- Consomme : rien.
- Produit :
  - `export const MISE_MIN = 500`
  - `export const MISE_INHABITUELLE = 10_000`
  - `export const MISE_MAX_STOCKABLE = 2_147_483_647`
  - `export function validerMise(montant: number): boolean`
  - `export function miseInhabituelle(montant: number): boolean`
  - `MISE_MAX` n'est plus exporté.

**Contexte.** `packages/core/src/index.ts` fait `export * from './calcul'` : retirer `MISE_MAX` de `calcul.ts` le retire du paquet, sans toucher au fichier de barrière. Cette tâche ne change **aucun comportement d'écran** : `ChoixMise` n'est repris ici que le strict nécessaire pour que l'arbre compile (l'attribut `max` et le texte d'erreur). Sa confirmation est l'objet de la tâche 2.

- [ ] **Étape 1 : écrire les tests qui échouent, dans `packages/core/src/calcul.test.ts`**

Remplacer le bloc existant qui va de `it('refuse un nombre de mises hors du cycle', () => {` jusqu’à la fin du `describe('validerMise', …)` — vérifié : lignes **50 à 74** — par ceci :

```ts
  it('refuse un nombre de mises hors du cycle', () => {
    expect(() => soldeRestituable(32, 1000)).toThrow(RangeError);
    expect(() => soldeRestituable(-1, 1000)).toThrow(RangeError);
  });

  it('refuse une mise sous le plancher', () => {
    expect(() => soldeRestituable(10, 499)).toThrow(RangeError);
  });

  it('calcule sans broncher au-dessus de l’ancien plafond', () => {
    // 1 500 000 000 : au-delà de ce que l'ancienne borne de 10 000 autorisait,
    // et bien au-delà de ce qu'un `integer` porterait sur 31 mises. Le calcul
    // se fait en JavaScript, où le nombre est exact jusqu'à 2^53.
    expect(soldeRestituable(31, 50_000_000)).toBe(1_500_000_000);
  });
});

describe('validerMise', () => {
  it('accepte le plancher, les paliers usuels et bien au-delà', () => {
    for (const m of [500, 1000, 2000, 5000, 10000, 50_000, 50_000_000, MISE_MAX_STOCKABLE]) {
      expect(validerMise(m), `${m} doit être acceptée`).toBe(true);
    }
  });

  it('refuse sous le plancher, au-delà du stockable, et les non-entiers', () => {
    expect(validerMise(499)).toBe(false);
    expect(validerMise(MISE_MAX_STOCKABLE + 1)).toBe(false);
    expect(validerMise(1000.5)).toBe(false);
    expect(validerMise(Number.NaN)).toBe(false);
  });
});

describe('miseInhabituelle', () => {
  it('laisse passer l’ancien plafond sans rien demander', () => {
    // 10 000 est le seuil, pas au-dessus. Tout ce qui passait hier sans
    // confirmation passe encore sans confirmation : c'est la promesse du
    // chantier, et c'est le cas limite qu'on casse le plus facilement.
    expect(miseInhabituelle(MISE_INHABITUELLE)).toBe(false);
    expect(miseInhabituelle(10_001)).toBe(true);
  });

  it('est faux pour une mise invalide, quelle que soit sa taille', () => {
    // Une valeur refusée n'est pas « inhabituelle » : elle n'existe pas. Sans
    // ce test, l'écran afficherait une case à cocher sous un message d'erreur.
    expect(miseInhabituelle(499)).toBe(false);
    expect(miseInhabituelle(MISE_MAX_STOCKABLE + 1)).toBe(false);
    expect(miseInhabituelle(20_000.5)).toBe(false);
  });
});
```

Puis compléter la ligne d'import en tête du fichier pour qu'elle apporte les nouveaux symboles. Elle devient :

```ts
import {
  MISES_PAR_CYCLE,
  MISE_INHABITUELLE,
  MISE_MAX_STOCKABLE,
  commission,
  cycleComplet,
  miseInhabituelle,
  peutEncaisser,
  progression,
  soldeRestituable,
  validerMise,
} from './calcul';
```

Vérifier avant de coller : ouvrir le fichier et ne garder que les symboles réellement utilisés, plus les cinq ajoutés ci-dessus (`MISE_INHABITUELLE`, `MISE_MAX_STOCKABLE`, `miseInhabituelle`). Ne pas importer `MISE_MAX`.

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run --dir packages/core`

Expected: FAIL — `"miseInhabituelle" is not exported by "src/calcul.ts"` (ou une erreur de transformation équivalente citant `MISE_INHABITUELLE`).

- [ ] **Étape 3 : écrire l'implémentation dans `packages/core/src/calcul.ts`**

Remplacer les lignes 3 à 18 — de `export const MISES_PAR_CYCLE = 31;` jusqu'à la fin de `validerMise` — par :

```ts
export const MISES_PAR_CYCLE = 31;
export const MISE_MIN = 500;

/**
 * Au-delà, l'écran demande confirmation. Ce n'est plus un refus.
 *
 * C'est l'ancien plafond. Le choix du chiffre est délibéré : tout ce qui était
 * interdit hier demande aujourd'hui une confirmation, et tout ce qui passait
 * hier passe encore sans rien demander.
 */
export const MISE_INHABITUELLE = 10_000;

/**
 * Ce que la colonne `integer` de Postgres sait porter.
 *
 * Borne physique, pas commerciale : sans elle, la base refuserait avec
 * « value out of range for type integer », que le collecteur ne peut pas
 * comprendre ni corriger.
 */
export const MISE_MAX_STOCKABLE = 2_147_483_647;

function verifierEntrees(misesEncaissees: number, mise: number): void {
  if (!Number.isInteger(misesEncaissees) || misesEncaissees < 0 || misesEncaissees > MISES_PAR_CYCLE) {
    throw new RangeError(`Nombre de mises hors cycle : ${misesEncaissees}`);
  }
  if (!validerMise(mise)) {
    throw new RangeError(`Mise journalière invalide : ${mise}`);
  }
}

export function validerMise(montant: number): boolean {
  return Number.isInteger(montant) && montant >= MISE_MIN && montant <= MISE_MAX_STOCKABLE;
}

/**
 * Vrai pour une mise valide mais au-dessus du seuil de confirmation.
 *
 * Faux pour une mise invalide : une valeur que la base refuserait n'est pas
 * « inhabituelle », elle n'existe pas. L'écran doit lui montrer une erreur, pas
 * une case à cocher.
 */
export function miseInhabituelle(montant: number): boolean {
  return validerMise(montant) && montant > MISE_INHABITUELLE;
}
```

Attention : `verifierEntrees` figure dans ce bloc parce qu'il est déclaré **entre** les constantes et `validerMise` dans le fichier d'origine. Son corps ne change pas — le recopier tel quel.

- [ ] **Étape 4 : lancer les tests du noyau**

Run: `npx vitest run --dir packages/core`

Expected: PASS, y compris les fichiers `format.test.ts`, `paliers.test.ts` et `tokens` déjà présents.

- [ ] **Étape 5 : reprendre les trois messages de refus dans `apps/collecteur/src/ecritures.ts`**

Ligne 1, l'import devient :

```ts
import { MISE_MIN, validerMise } from '@kolek/core';
```

Puis, aux trois emplacements — dans `creerClientAvecCarte` (vers la ligne 129), `encaisserMise` (vers 195) et `ouvrirCarte` (vers 302) — remplacer chaque occurrence de :

```ts
        message: `La mise doit être comprise entre ${MISE_MIN} et ${MISE_MAX} FCFA.`,
```

par :

```ts
        message: `La mise doit être d'au moins ${MISE_MIN} FCFA.`,
```

Le code `MISE_HORS_BORNES` ne change pas : la borne basse existe toujours.

- [ ] **Étape 6 : reprendre les deux usages de `MISE_MAX` dans `apps/collecteur/src/ecrans/ChoixMise.tsx`**

Ligne 1, l'import devient :

```ts
import { MISE_MAX_STOCKABLE, MISE_MIN, formatMontant, validerMise } from '@kolek/core';
```

Supprimer l'attribut `max={MISE_MAX}` de l'`<input>` (vers la ligne 101). `min={MISE_MIN}` et `step={50}` restent.

Remplacer le message d'erreur (vers la ligne 122) :

```tsx
            <p role="alert" className="text-sm font-body text-negative mt-1">
              {valeurSaisie > MISE_MAX_STOCKABLE
                ? 'Montant trop grand.'
                : `Au moins ${formatMontant(MISE_MIN)} FCFA, sans centimes.`}
            </p>
```

`valeurSaisie` vaut `NaN` sur un champ vide, et `NaN > x` est faux : le message du plancher reste celui par défaut.

Enfin, dans le commentaire de tête du fichier, remplacer la phrase :

```
 * la base accepte **tout entier entre 500 et 10 000** : la contrainte de
 * `cartes.mise` est un intervalle, pas une liste. Une cliente qui veut mettre
 * 750 FCFA par jour a le droit, et jusqu'ici l'application le lui refusait sans
 * qu'aucune règle du produit ne l'exige.
```

par :

```
 * la base accepte **tout entier à partir de 500** : la contrainte de
 * `cartes.mise` est un plancher, pas une liste. Une cliente qui veut mettre
 * 750 FCFA par jour a le droit, et une autre qui met 50 000 aussi.
```

- [ ] **Étape 7 : suivre le nouveau texte dans `apps/collecteur/src/ecrans/ActiverCarte.test.tsx`**

Aux lignes 104 et 157, remplacer les deux occurrences de :

```ts
      echec: { code: 'MISE_HORS_BORNES', message: 'La mise doit être comprise entre 500 et 10000 FCFA.' },
```

par :

```ts
      echec: { code: 'MISE_HORS_BORNES', message: "La mise doit être d'au moins 500 FCFA." },
```

- [ ] **Étape 8 : vérifier que plus rien n'importe `MISE_MAX`**

Run: `npx tsc -b`

Expected: exit 0, aucune sortie. Si une erreur `Module '"@kolek/core"' has no exported member 'MISE_MAX'` apparaît, le fichier cité a été oublié : le reprendre.

Run: `git grep -n "MISE_MAX\b" -- '*.ts' '*.tsx'`

Expected: aucune ligne. (`MISE_MAX_STOCKABLE` ne correspond pas : `\b` ferme le mot.)

- [ ] **Étape 9 : lancer la suite complète du collecteur et du noyau**

Run: `npm test --workspace @kolek/core && npm test --workspace @kolek/collecteur`

Expected: PASS des deux côtés. Le collecteur comptait 121 tests avant ce chantier ; ce compte ne doit pas baisser.

- [ ] **Étape 10 : commit**

```bash
git add packages/core/src/calcul.ts packages/core/src/calcul.test.ts \
        apps/collecteur/src/ecritures.ts apps/collecteur/src/ecrans/ChoixMise.tsx \
        apps/collecteur/src/ecrans/ActiverCarte.test.tsx
git commit -m "feat(core): la mise n'a plus de plafond commercial, seulement un seuil

MISE_MAX disparaît. À sa place, MISE_INHABITUELLE porte le seuil de
confirmation — l'ancien plafond, pour que rien de ce qui passait hier ne
demande quelque chose aujourd'hui — et MISE_MAX_STOCKABLE la borne physique
de la colonne integer, pour que l'absurde reçoive un refus lisible plutôt
qu'une erreur de type Postgres.

Les trois messages d'ecritures.ts et l'erreur de ChoixMise ne parlent plus
que du plancher."
```

---

### Task 2 : La confirmation dans `ChoixMise`, et les trois écrans qui la subissent

**Files:**
- Modify: `apps/collecteur/src/ecrans/ChoixMise.tsx` (entier)
- Create: `apps/collecteur/src/ecrans/ChoixMise.test.tsx`
- Modify: `apps/collecteur/src/ecrans/ActiverCarte.tsx:48`, `:57`, `:114`
- Modify: `apps/collecteur/src/ecrans/Clients.tsx:747`, `:752`, `:755`
- Modify: `apps/collecteur/src/ecrans/FicheClient.tsx:733`, `:738`, `:773`

**Interfaces:**
- Consomme de la tâche 1 : `MISE_MIN`, `MISE_MAX_STOCKABLE`, `validerMise(montant: number): boolean`, `miseInhabituelle(montant: number): boolean`, `formatMontant(n: number): string`.
- Produit :
  - `ChoixMise` prend désormais `mise: number | null` et `onChoisir: (montant: number | null) => void`. `identifiant: string` ne change pas.
  - `MISES_USUELLES` reste exporté à l'identique.

**Le défaut qu'on ferme.** Sans cette tâche, la rétention serait un piège : le collecteur tape 50 000, ne coche pas, appuie sur « Ouvrir la carte », et la carte s'ouvre silencieusement à 1 000 — le montant que le parent avait gardé. Une mise est figée à l'ouverture et ne se corrige jamais : un enregistrement muet au mauvais montant est pire qu'un refus. D'où `null`, qui n'est pas une commodité mais ce qui fait échouer `tsc -b` chez tout appelant n'ayant pas gardé son bouton.

**Vérifié dans l'arbre :** `Clients.tsx:752` teste bien `validerMise(mise)` dans `pret`, mais **ni `ActiverCarte` ni `FicheClient`** ne gardent leur bouton — leur `disabled` est `envoi || collecteurId === null`. Et le garde de `Clients` n'aurait rien changé de toute façon, `validerMise(1000)` étant vrai. Seul `null` ferme le trou.

- [ ] **Étape 1 : écrire les tests qui échouent, dans un fichier neuf `apps/collecteur/src/ecrans/ChoixMise.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatMontant } from '@kolek/core';
import { describe, expect, it, vi } from 'vitest';

import { ChoixMise } from './ChoixMise';

/**
 * L'invariant que ce fichier garde : tant que le champ libre est ouvert, le
 * parent détient exactement ce que le champ montre — `null` si le champ est
 * vide, invalide, ou inhabituel-non-confirmé.
 *
 * Il compte parce qu'une mise est figée à l'ouverture de la carte et ne se
 * corrige pas. La rétention naïve — « garder le dernier montant valide » —
 * ouvrirait la carte au montant précédent, en silence, alors que le collecteur
 * regarde le sien à l'écran.
 *
 * Les montants attendus passent par `formatMontant` et jamais par une chaîne
 * écrite à la main : le séparateur de milliers est une espace insécable, et
 * `getByRole({ name })` ne la normalise pas.
 */

type Espion = ReturnType<typeof vi.fn>;

/** Le dernier argument reçu par `onChoisir`, ou `undefined` s'il n'a rien reçu. */
function dernier(onChoisir: Espion): unknown {
  return onChoisir.mock.calls.at(-1)?.[0];
}

function champ(): HTMLInputElement {
  return screen.getByLabelText('Montant convenu avec le client') as HTMLInputElement;
}

function caseAcocher(): HTMLInputElement {
  return screen.getByRole('checkbox') as HTMLInputElement;
}

/** Ouvre le champ libre et y tape `texte`. Rend l'utilisateur, pour la suite. */
async function saisir(texte: string) {
  const utilisateur = userEvent.setup();
  await utilisateur.click(screen.getByRole('button', { name: 'Autre' }));
  await utilisateur.type(champ(), texte);
  return utilisateur;
}

describe('ChoixMise — les paliers', () => {
  it('remonte un palier sans rien demander', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    // 10 000 est l'ancien plafond, donc le cas limite : il est *égal* au seuil,
    // pas au-dessus. Rien ne doit être demandé.
    await userEvent.setup().click(screen.getByRole('button', { name: formatMontant(10000) }));

    expect(dernier(onChoisir)).toBe(10000);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('ChoixMise — le champ libre', () => {
  it('remonte un montant libre ordinaire tout de suite', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    await saisir('750');

    expect(dernier(onChoisir)).toBe(750);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('remonte null sur une saisie invalide, au lieu de garder l’ancienne', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    await saisir('5');

    expect(dernier(onChoisir)).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Au moins');
  });

  it('nomme autrement un montant que la colonne ne porterait pas', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    await saisir('99999999999');

    expect(dernier(onChoisir)).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Montant trop grand.');
  });
});

describe('ChoixMise — la confirmation', () => {
  it('retient un montant inhabituel jusqu’à ce que la case soit cochée', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    const utilisateur = await saisir('50000');

    expect(dernier(onChoisir)).toBeNull();

    await utilisateur.click(caseAcocher());

    expect(dernier(onChoisir)).toBe(50000);
  });

  it('montre le cycle du montant en attente, pas de celui que le parent tient', async () => {
    const onChoisir = vi.fn();
    const { container } = render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    await saisir('50000');

    // 31 × 50 000 = 1 550 000. C'est ce chiffre qui motive la confirmation :
    // le faire disparaître pendant l'attente retirerait la raison de cocher.
    expect(container.textContent).toContain(formatMontant(1_550_000));
    expect(container.textContent).not.toContain(formatMontant(31_000));
  });

  it('décoche et reprend le montant quand la saisie change', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    const utilisateur = await saisir('50000');
    await utilisateur.click(caseAcocher());
    expect(dernier(onChoisir)).toBe(50000);

    // La confirmation portait sur l'ancien montant ; la laisser cochée
    // validerait un montant que personne n'a relu.
    await utilisateur.clear(champ());
    await utilisateur.type(champ(), '500000');

    expect(dernier(onChoisir)).toBeNull();
    expect(caseAcocher().checked).toBe(false);
  });

  it('reçoit un montant inhabituel déjà confirmé, et ne le retire pas au parent', () => {
    const onChoisir = vi.fn();
    // Le cas réel : la carte précédente du client était à 50 000, et
    // `misePreremplie` la repropose. Elle a été confirmée à son ouverture.
    render(<ChoixMise mise={50000} onChoisir={onChoisir} identifiant="t" />);

    expect(onChoisir).not.toHaveBeenCalled();
    expect(caseAcocher().checked).toBe(true);
  });

  it('vide le parent quand on quitte un palier pour le champ libre', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Autre' }));

    // Sans ça, « Autre » puis « Ouvrir la carte » enregistrerait le palier que
    // le collecteur venait justement de quitter.
    expect(dernier(onChoisir)).toBeNull();
  });
});
```

Le test du cycle vérifie aussi une absence : `formatMontant(31_000)` est le
cycle de la mise de 1 000 que le parent détient encore. S'il apparaît, c'est que
la ligne se calcule sur `mise` au lieu du montant saisi — et le collecteur lirait
le total d'un montant qu'il vient de quitter.

- [ ] **Étape 2 : lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run --dir apps/collecteur src/ecrans/ChoixMise.test.tsx`

Expected: FAIL. Les cas « palier » et « montant libre ordinaire » passent déjà ; les six autres échouent — `Unable to find an accessible element with the role "checkbox"` pour la plupart, et `expected 1000 to be null` pour la saisie invalide.

- [ ] **Étape 3 : réécrire `apps/collecteur/src/ecrans/ChoixMise.tsx`**

Le fichier entier, commentaire de tête compris. Le commentaire de tête reprend celui de la tâche 1 et lui ajoute une troisième section.

```tsx
import {
  MISE_MAX_STOCKABLE,
  MISE_MIN,
  formatMontant,
  miseInhabituelle,
  validerMise,
} from '@kolek/core';
import { useState } from 'react';

/**
 * Le choix de la mise journalière.
 *
 * ## Pourquoi les paliers ne suffisent pas
 *
 * Les cinq montants proposés — 500, 1 000, 2 000, 5 000, 10 000 — sont ceux
 * qu'on entend le plus au marché, et ils couvrent la majorité des cartes. Mais
 * la base accepte **tout entier à partir de 500** : la contrainte de
 * `cartes.mise` est un plancher, pas une liste. Une cliente qui veut mettre
 * 750 FCFA par jour a le droit, et une autre qui met 50 000 aussi.
 *
 * ## Pourquoi le champ libre reste en second
 *
 * Neuf cartes sur dix se règlent d'un seul appui sur un palier. Mettre le
 * clavier numérique en premier ferait payer à tout le monde le cas rare —
 * saisir « 1000 » au doigt, debout, est plus long et plus faux qu'appuyer sur
 * un bouton.
 *
 * ## Pourquoi ce composant peut refuser de remonter un montant
 *
 * Une mise est figée à l'ouverture de la carte et ne se corrige pas : les 31
 * versements qui suivent en dépendent. L'ancien plafond de 10 000 servait
 * autant de règle commerciale que de garde-fou contre le zéro de trop. La règle
 * tombe, le garde-fou reste — sous la forme d'une confirmation.
 *
 * D'où l'invariant : **tant que le champ libre est ouvert, le parent détient
 * exactement ce que le champ montre.** `null` si le champ est vide, invalide,
 * ou inhabituel-non-confirmé. La rétention naïve — garder le dernier montant
 * valide — ouvrirait la carte au montant précédent, en silence, pendant que le
 * collecteur regarde le sien à l'écran. Pour une valeur qu'on ne peut plus
 * corriger, c'est pire qu'un refus.
 *
 * C'est aussi pourquoi `onChoisir` prend `number | null` : le type force les
 * trois écrans appelants à garder leur bouton, là où un commentaire aurait été
 * oublié.
 */

/** Paliers usuels du marché, tous à `MISE_INHABITUELLE` ou en dessous. */
export const MISES_USUELLES = [500, 1000, 2000, 5000, 10000] as const;

export function ChoixMise({
  mise,
  onChoisir,
  identifiant,
}: {
  mise: number | null;
  onChoisir: (montant: number | null) => void;
  /** Préfixe des `id` : deux `ChoixMise` peuvent coexister dans un même document. */
  identifiant: string;
}) {
  const surUnPalier = mise !== null && (MISES_USUELLES as readonly number[]).includes(mise);
  const [libre, setLibre] = useState(!surUnPalier);
  // La saisie est gardée en texte : un `number` transformerait « 7 » en une mise
  // de 7 FCFA le temps de taper « 750 », et ferait clignoter le message d'erreur
  // à chaque caractère.
  const [saisie, setSaisie] = useState(surUnPalier || mise === null ? '' : String(mise));
  // Un montant inhabituel reçu en propriété a déjà été confirmé — à l'ouverture
  // de la carte précédente, dont il est repris. Naître décoché violerait
  // l'invariant dès le montage : l'écran présenterait comme non confirmé un
  // montant que le parent détient bel et bien.
  const [confirme, setConfirme] = useState(mise !== null && miseInhabituelle(mise));

  const valeurSaisie = saisie.trim() === '' ? Number.NaN : Number(saisie);
  const saisieValide = validerMise(valeurSaisie);

  /** Ce que l'écran porte à cet instant, confirmé ou non. */
  const montantAffiche = libre && saisieValide ? valeurSaisie : mise;

  /** Une saisie valide, mais assez grosse pour mériter d'être relue. */
  const inhabituelSaisi = libre && saisieValide && miseInhabituelle(valeurSaisie);

  return (
    <div>
      <p className="text-sm font-body font-semibold text-ink mb-2">Mise journalière</p>

      <div className="flex gap-2 flex-wrap mb-2">
        {MISES_USUELLES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setLibre(false);
              setSaisie('');
              setConfirme(false);
              // Aucun palier n'est au-dessus du seuil : un palier ne demande
              // jamais rien, y compris 10 000, qui lui est égal.
              onChoisir(m);
            }}
            className={`anim-pression px-3 py-2 rounded-md text-base font-body font-semibold border tabular-nums cursor-pointer ${
              !libre && m === mise
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface text-ink border-hairline'
            }`}
          >
            {formatMontant(m)}
          </button>
        ))}

        <button
          type="button"
          onClick={() => {
            setLibre(true);
            setSaisie('');
            setConfirme(false);
            // Le champ s'ouvre vide, donc le parent ne détient plus rien. Sans
            // ça, « Autre » puis « Ouvrir la carte » enregistrerait le palier
            // que le collecteur venait justement de quitter.
            onChoisir(null);
          }}
          className={`anim-pression px-3 py-2 rounded-md text-base font-body font-semibold border cursor-pointer ${
            libre
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-surface text-ink border-hairline'
          }`}
        >
          Autre
        </button>
      </div>

      {libre && (
        <div className="mt-2">
          <label
            htmlFor={`${identifiant}-montant`}
            className="block text-sm font-body text-muted-foreground mb-1"
          >
            Montant convenu avec le client
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`${identifiant}-montant`}
              type="number"
              inputMode="numeric"
              min={MISE_MIN}
              step={50}
              value={saisie}
              autoFocus
              onChange={(e) => {
                const texte = e.target.value;
                setSaisie(texte);
                // Changer le montant retire la reconnaissance : la case portait
                // sur l'ancien, et le laisser coché validerait un montant que
                // personne n'a relu.
                setConfirme(false);
                const valeur = Number(texte);
                onChoisir(validerMise(valeur) && !miseInhabituelle(valeur) ? valeur : null);
              }}
              className="w-36 bg-surface border border-hairline rounded-md px-3 py-2.5 text-base font-body text-ink tabular-nums outline-none focus:border-primary"
            />
            <span className="text-base font-body text-muted-foreground">FCFA / jour</span>
          </div>

          {saisie.trim() !== '' && !saisieValide && (
            <p role="alert" className="text-sm font-body text-negative mt-1">
              {valeurSaisie > MISE_MAX_STOCKABLE
                ? 'Montant trop grand.'
                : `Au moins ${formatMontant(MISE_MIN)} FCFA, sans centimes.`}
            </p>
          )}
        </div>
      )}

      {/* Le cycle complet, calculé pour le client. C'est la question qu'il pose
          juste après le montant : « ça fait combien au bout ? » — et c'est le
          chiffre qui motive la confirmation ci-dessous, donc il se calcule sur
          ce que l'écran porte, pas sur ce que le parent détient. */}
      {montantAffiche !== null && validerMise(montantAffiche) && (
        <p className="text-xs font-body text-muted-foreground mt-2">
          31 jours · le client verse {formatMontant(montantAffiche * 31)} FCFA, tu lui rends{' '}
          {formatMontant(montantAffiche * 30)} FCFA. La première mise est ta commission.
        </p>
      )}

      {inhabituelSaisi && (
        <label className="flex items-start gap-3 rounded-md p-3 mt-2 border border-hairline cursor-pointer">
          <input
            type="checkbox"
            checked={confirme}
            onChange={(e) => {
              setConfirme(e.target.checked);
              onChoisir(e.target.checked ? valeurSaisie : null);
            }}
            className="mt-0.5 w-4 h-4 shrink-0"
          />
          <span className="min-w-0">
            <span className="block text-sm font-body font-semibold text-ink">
              Je confirme {formatMontant(valeurSaisie)} FCFA par jour
            </span>
            <span className="block text-xs font-body text-muted-foreground">
              Montant inhabituel. Une mise est figée à l’ouverture de la carte et ne se corrige
              pas.
            </span>
          </span>
        </label>
      )}
    </div>
  );
}
```

- [ ] **Étape 4 : lancer les tests de `ChoixMise`**

Run: `npx vitest run --dir apps/collecteur src/ecrans/ChoixMise.test.tsx`

Expected: PASS, 9 tests.

- [ ] **Étape 5 : adapter `apps/collecteur/src/ecrans/ActiverCarte.tsx`**

Ligne 48 :

```tsx
  const [mise, setMise] = useState<number | null>(misePreremplie);
```

Dans `ouvrir()`, la garde de tête (vers la ligne 57) devient :

```tsx
    if (!collecteurId || envoi || mise === null) return;
```

Le bouton « Ouvrir la carte » (vers la ligne 114) :

```tsx
        <Bouton onClick={ouvrir} disabled={envoi || collecteurId === null || mise === null}>
```

- [ ] **Étape 6 : adapter `apps/collecteur/src/ecrans/Clients.tsx`**

Ligne 747 :

```tsx
  const [mise, setMise] = useState<number | null>(1000);
```

Ligne 752 :

```tsx
  const pret = nom.trim().length > 0 && mise !== null && validerMise(mise) && collecteurId !== null;
```

Dans `enregistrer()`, la garde de tête (vers la ligne 755) devient :

```tsx
    if (!pret || !collecteurId || mise === null) return;
```

Le test `mise === null` est redondant avec `pret` pour un humain, mais pas pour TypeScript : `pret` est un booléen, il ne rétrécit pas le type de `mise` dans le corps de la fonction. Sans lui, l'appel à `creerClientAvecCarte` ne compile pas.

- [ ] **Étape 7 : adapter `apps/collecteur/src/ecrans/FicheClient.tsx`**

Ligne 733, dans `NouvelleCarte` :

```tsx
  const [mise, setMise] = useState<number | null>(1000);
```

Dans son `ouvrir()`, la garde de tête (vers la ligne 738) :

```tsx
    if (!collecteurId || mise === null) return;
```

Le bouton (vers la ligne 773) :

```tsx
      <Bouton
        pleineLargeur
        icone="plus"
        className="mt-3"
        disabled={envoi || collecteurId === null || mise === null}
        onClick={() => void ouvrir()}
      >
```

- [ ] **Étape 8 : vérifier les types et la suite entière du collecteur**

Run: `npx tsc -b`

Expected: exit 0. Toute erreur `Argument of type 'number | null' is not assignable to parameter of type 'number'` désigne un appelant dont la garde manque : la corriger, ne pas ajouter de `!` ni de `as number`.

Run: `npm test --workspace @kolek/collecteur`

Expected: PASS. Les tests de `ActiverCarte`, `Clients` et `FicheClient` ne devraient pas bouger — aucun n'exerce un montant inhabituel.

- [ ] **Étape 9 : commit**

```bash
git add apps/collecteur/src/ecrans/ChoixMise.tsx apps/collecteur/src/ecrans/ChoixMise.test.tsx \
        apps/collecteur/src/ecrans/ActiverCarte.tsx apps/collecteur/src/ecrans/Clients.tsx \
        apps/collecteur/src/ecrans/FicheClient.tsx
git commit -m "feat(collecteur): un montant inhabituel se relit avant de s'écrire

Au-delà de 10 000 FCFA, ChoixMise montre le cycle de 31 jours et demande une
confirmation. Tant qu'elle manque, il remonte null plutôt que le dernier
montant valide : le collecteur qui tape 50 000, ne coche pas et appuie sur
« Ouvrir » aurait ouvert la carte à 1 000, en silence, pour 31 versements
qu'aucune correction ne rattrape.

onChoisir prend number | null pour que ce soit tsc, et non un commentaire,
qui oblige les trois écrans à garder leur bouton. ActiverCarte et FicheClient
ne le gardaient pas du tout."
```

---

### Task 3 : La migration, ses tests, et la documentation

**Files:**
- Create: `supabase/migrations/20260901090000_mise_sans_plafond.sql`
- Create: `supabase/tests/mise-sans-plafond.test.ts`
- Modify: `Docs/Kolek Cahier de charges consolide.md:55`
- Modify: `Docs/Kolek Design System.md:288`

**Interfaces:**
- Consomme des tâches 1 et 2 : rien directement — cette tâche est indépendante du TypeScript. Elle doit néanmoins passer **après**, pour que l'arbre ne présente jamais une base permissive sous une application qui refuse encore.
- Produit : `public.grouper_milliers(valeur bigint)` remplace `public.grouper_milliers(valeur integer)`.

**Pourquoi une seule migration.** Élargir les contraintes sans couler les produits en `bigint` ne supprime pas le refus, il le déplace vers un « integer out of range » levé pendant un encaissement. Et couler les produits sans élargir les contraintes ne peut pas être testé — la contrainte empêcherait de créer la carte qui déborde. Les deux moitiés ne sont vérifiables qu'ensemble. À l'intérieur du fichier, le `bigint` vient quand même en premier : à aucun moment, même en cours de transaction, la base n'accepte une valeur qu'elle ne saurait pas restituer.

**Le produit qui déborde.** `(mises_encaissees − 1) × mise` est calculé en `integer × integer` à deux endroits vivants. Postgres déborde à 2 147 483 647. Le débordement se produit **à la multiplication**, avant tout appel de fonction — couler un opérande en `bigint` ne suffit donc pas si `grouper_milliers` reprend un `integer` derrière.

- [ ] **Étape 1 : composer la migration par extraction, pas par transcription**

Les deux fonctions à redéfinir font 251 et 104 lignes. Les recopier à la main introduirait des fautes qu'aucun test ne rattraperait. On les extrait de leur dernière définition, puis on modifie exactement une ligne dans chacune.

Les bornes ont été vérifiées : `admin_vue_globale` occupe les lignes 36 à 286 de `20260830110000_mrr_net_des_remises.sql` (la 286 est `$function$;`), et `mettre_en_file_avis` les lignes 36 à 139 de `20260823160000_avis_ouverture_et_administration.sql` (la 139 est `$fn$;`).

Lancer, depuis la racine du dépôt :

```bash
NOUVEAU=supabase/migrations/20260901090000_mise_sans_plafond.sql

cat > "$NOUVEAU" <<'ENTETE'
-- La mise journalière perd son plafond.
--
-- La borne de 10 000 FCFA était le palier haut du marché au moment du socle,
-- pas une règle du produit. Elle refusait un métier réel : un commerçant qui
-- met 50 000 FCFA de côté chaque jour n'avait pas de carte.
--
-- Le plancher de 500 reste : en dessous, la commission du collecteur — une
-- mise, la première du cycle — ne paie pas son déplacement.
--
-- ## L'ordre de ce fichier n'est pas indifférent
--
-- Le `bigint` vient d'abord, les bornes ensuite. Élargir une contrainte avant
-- d'avoir corrigé le calcul ne supprimerait pas le refus : il le déplacerait
-- vers un « integer out of range » levé pendant un encaissement, que personne
-- ne peut corriger sur le terrain.
--
-- ## Ce qui débordait
--
-- `(mises_encaissees - 1) * mise` est un produit `integer × integer`. Postgres
-- déborde à 2 147 483 647, soit une mise d'environ 71,5 millions sur une carte
-- complète — bien en deçà de ce que la colonne accepte désormais. Le
-- débordement se produit **à la multiplication**, avant tout appel de
-- fonction : couler un opérande ne sert à rien si la fonction appelée reprend
-- un `integer` derrière. D'où l'élargissement de `grouper_milliers`.
--
-- ## Le plafond qui subsiste, et qu'on assume
--
-- `caisses_jour.cash_attendu` est un `integer`, et `ecart` une colonne générée
-- stockée qui en dépend. Le point de rupture est le `::integer` final de
-- `public.cash_attendu_du_jour` : ses sous-requêtes sont des `sum()` sur
-- `integer`, donc déjà des `bigint`, mais la conversion du résultat échoue si
-- la valeur nette d'une journée — mises encaissées moins restitutions — sort de
-- [-2 147 483 648, 2 147 483 647]. Les deux sens comptent : clôturer deux
-- cartes à 50 000 FCFA de mise le même jour restitue 3 milliards.
--
-- Corriger cela demanderait de démonter et reconstruire une colonne générée sur
-- une table de production. Hors périmètre. Le plafond réel du produit passe
-- donc de 10 000 FCFA par mise à ~2,1 milliards de recette journalière par
-- collecteur.

/* --------------------- 1. Le groupeur de milliers ------------------------ */

-- `create or replace` ne suffirait pas : Postgres traite les deux signatures
-- comme deux fonctions distinctes, et un appel avec un argument `integer`
-- continuerait de choisir l'ancienne par correspondance exacte.
--
-- Le `drop` est sans danger bien que `mettre_en_file_avis` référence encore
-- cette fonction à cet instant : plpgsql résout ses appels à l'exécution, et la
-- section 2 arrive dans la même transaction.
drop function if exists public.grouper_milliers(integer);

/** Groupe les milliers par une espace simple — l'insécable n'est pas en GSM-7. */
create function public.grouper_milliers(valeur bigint)
returns text
language sql
immutable
set search_path = pg_temp
as $fn$
  -- `valeur::text` et non `trunc(valeur)::text` : sur un type entier, `trunc`
  -- est l'identité, et il n'a de définition ni pour `integer` ni pour `bigint`
  -- — l'argument passait par une conversion implicite vers `numeric` ou vers
  -- `double precision`, au choix du résolveur. Sur un `bigint` cette latitude
  -- n'est plus acceptable.
  select regexp_replace(valeur::text, '(\d)(?=(\d{3})+$)', '\1 ', 'g');
$fn$;

/* ------------------- 2. L'avis envoyé au client -------------------------- */

ENTETE

sed -n '36,139p' supabase/migrations/20260823160000_avis_ouverture_et_administration.sql >> "$NOUVEAU"

cat >> "$NOUVEAU" <<'MILIEU'

revoke all on function public.mettre_en_file_avis() from public, anon, authenticated;

/* --------------------- 3. La vue d'administration ------------------------ */

MILIEU

sed -n '36,286p' supabase/migrations/20260830110000_mrr_net_des_remises.sql >> "$NOUVEAU"

cat >> "$NOUVEAU" <<'FIN'

revoke all on function public.admin_vue_globale() from public, anon, authenticated;
grant execute on function public.admin_vue_globale() to service_role;

/* -------------------------- 4. Les bornes -------------------------------- */

-- Les noms sont conservés : le garde-fou de
-- 20260818010000_socle_storage_et_bornes.sql vérifie `mises_montant_borne` par
-- son nom.
--
-- Élargir un CHECK ne réécrit aucune ligne : toutes les mises existantes sont
-- dans le nouvel intervalle, et Postgres valide la contrainte par un simple
-- parcours.
alter table public.cartes drop constraint cartes_mise_check;
alter table public.cartes add  constraint cartes_mise_check check (mise >= 500);

alter table public.mises drop constraint mises_montant_borne;
alter table public.mises add  constraint mises_montant_borne check (montant >= 500);

/* -------------------------- Garde-fou ------------------------------------ */

do $garde$
begin
  -- Le défaut le plus probable de ce fichier : élargir les bornes et oublier
  -- un produit. Il ne se verrait qu'en production, sur la première grosse
  -- carte, et sous la forme d'un encaissement refusé.
  if position('::bigint' in pg_get_functiondef('public.admin_vue_globale()'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : admin_vue_globale() ne coule pas son produit en bigint.';
  end if;

  if position('::bigint' in pg_get_functiondef('public.mettre_en_file_avis()'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : mettre_en_file_avis() ne coule pas son produit en bigint.';
  end if;
end
$garde$;
FIN
```

- [ ] **Étape 2 : couler les deux produits en `bigint`**

Deux modifications d'une ligne chacune, dans le fichier qui vient d'être composé.

Dans la section 2 (`mettre_en_file_avis`), remplacer :

```sql
          || public.grouper_milliers(greatest(carte.mises_encaissees - 1, 0) * carte.mise)
```

par :

```sql
          || public.grouper_milliers(greatest(carte.mises_encaissees - 1, 0)::bigint * carte.mise)
```

Dans la section 3 (`admin_vue_globale`), remplacer :

```sql
      greatest(ca.mises_encaissees - 1, 0) * ca.mise as solde_restituable,
```

par :

```sql
      greatest(ca.mises_encaissees - 1, 0)::bigint * ca.mise as solde_restituable,
```

Vérifier qu'il n'en reste pas un troisième :

Run: `grep -n "mises_encaissees - 1, 0) \* " supabase/migrations/20260901090000_mise_sans_plafond.sql`

Expected: aucune ligne.

- [ ] **Étape 3 : appliquer la migration**

Run: `npm run db:reset`

Expected: la liste des migrations appliquées se termine par `20260901090000_mise_sans_plafond.sql`, sans `GARDE_FOU` ni `ERROR`.

Si `function trunc(bigint) is not unique` apparaît, c'est que l'étape 1 a été suivie de travers et que `trunc` a survécu dans `grouper_milliers` — le retirer.

- [ ] **Étape 4 : écrire les tests dans un fichier neuf `supabase/tests/mise-sans-plafond.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Ce que la base accepte une fois le plafond de 10 000 FCFA levé — et ce
 * qu'elle sait encore restituer au-delà de ce qu'un `integer` porte.
 *
 * Les deux moitiés du chantier se testent ensemble et pas séparément : la
 * contrainte élargie est ce qui permet de créer la carte qui ferait déborder le
 * produit, et le produit coulé en `bigint` est ce qui rend cette carte
 * utilisable.
 */

/** Code SQLSTATE d'une violation de contrainte CHECK. */
const CHECK_VIOLE = '23514';

/**
 * Assez grande pour faire déborder `(mises_encaissees - 1) * mise` dès la
 * troisième mise : 2 × 2 000 000 000 = 4 000 000 000, au-delà des
 * 2 147 483 647 d'un `integer`. Et elle tient elle-même dans la colonne.
 */
const MISE_ENORME = 2_000_000_000;

/** Le solde attendu après trois mises : la première est la commission. */
const SOLDE_ATTENDU = 2 * MISE_ENORME;

const MARQUE = crypto.randomUUID().slice(0, 8);
let collecteur: CollecteurTest;

beforeAll(async () => {
  collecteur = await creerCollecteur(`Plafond ${MARQUE}`, `+225073${Date.now() % 10000000}`);
});

afterAll(nettoyer);

async function creerClient(avecAvis = false): Promise<string> {
  const clientId = crypto.randomUUID();
  const { error } = await collecteur.client.from('clients').insert({
    id: clientId,
    collecteur_id: collecteur.id,
    nom: `Client ${MARQUE}`,
    telephone: avecAvis ? `+22507${Date.now() % 100000000}` : null,
    avis_actifs: avecAvis,
  });
  if (error) throw error;
  return clientId;
}

async function ouvrirCarte(clientId: string, mise: number) {
  const carteId = crypto.randomUUID();
  const { error } = await collecteur.client
    .from('cartes')
    .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise });
  return { carteId, error };
}

/**
 * Encaisse une mise, datée du jour indiqué de janvier 2026.
 *
 * Un jour distinct par mise, délibérément : `cash_attendu_du_jour` additionne
 * par journée et rend un `integer`. Trois mises énormes le même jour feraient
 * échouer sa conversion finale — c'est la limite résiduelle documentée dans la
 * migration, pas ce que ce fichier mesure.
 */
async function encaisser(carteId: string, montant: number, jour: number): Promise<string> {
  const miseId = crypto.randomUUID();
  const { error } = await collecteur.client.from('mises').insert({
    id: miseId,
    collecteur_id: collecteur.id,
    carte_id: carteId,
    montant,
    encaisse_le: new Date(Date.UTC(2026, 0, jour)).toISOString(),
  });
  if (error) throw error;
  return miseId;
}

describe('les bornes de la mise', () => {
  it('accepte une carte à 50 000 FCFA, que l’ancienne borne refusait', async () => {
    const { error } = await ouvrirCarte(await creerClient(), 50_000);
    expect(error).toBeNull();
  });

  it('refuse toujours une mise sous le plancher', async () => {
    // Le plancher n'est pas un reliquat : sous 500 FCFA, la commission du
    // collecteur ne paie pas son déplacement.
    const { error } = await ouvrirCarte(await creerClient(), 499);
    expect(error?.code).toBe(CHECK_VIOLE);
  });

  it('encaisse une mise de 50 000 FCFA', async () => {
    // `mises.montant` porte sa propre borne, distincte de celle de
    // `cartes.mise`. Élargir l'une sans l'autre laisserait ouvrir la carte puis
    // refuserait le premier versement.
    const { carteId, error } = await ouvrirCarte(await creerClient(), 50_000);
    expect(error).toBeNull();
    await expect(encaisser(carteId, 50_000, 5)).resolves.toBeUndefined();
  });
});

describe('ce que la base restitue au-delà de l’integer', () => {
  it('rend un solde juste sur une carte qui ferait déborder le produit', async () => {
    const { carteId, error } = await ouvrirCarte(await creerClient(), MISE_ENORME);
    expect(error).toBeNull();

    // Une par une, jamais en lot : les déclencheurs AFTER sont différés en fin
    // d'instruction, donc un lot verrait toutes les mises avec le même compteur
    // et les marquerait toutes commission.
    await encaisser(carteId, MISE_ENORME, 10);
    await encaisser(carteId, MISE_ENORME, 11);
    await encaisser(carteId, MISE_ENORME, 12);

    const { data, error: erreurVue } = await admin.rpc('admin_vue_globale');
    expect(erreurVue).toBeNull();

    const cartes = (data as { cartes: { id: string; solde_restituable: number }[] }).cartes;
    const trouvee = cartes.find((c) => c.id === carteId);
    expect(trouvee?.solde_restituable).toBe(SOLDE_ATTENDU);
  });

  it('écrit un avis dont le total dépasse ce qu’un integer porte', async () => {
    await admin
      .from('avis_reglages')
      .upsert(
        { collecteur_id: collecteur.id, canal: 'sms', sur_mise: true, quota_mensuel: 1000 },
        { onConflict: 'collecteur_id' },
      );

    const clientId = await creerClient(true);
    const { carteId, error } = await ouvrirCarte(clientId, MISE_ENORME);
    expect(error).toBeNull();

    await encaisser(carteId, MISE_ENORME, 20);
    await encaisser(carteId, MISE_ENORME, 21);
    // La troisième : c'est elle qui porte un total de 2 × 2 000 000 000, donc
    // celle dont le texte déborderait. La première est la commission et ne
    // produit aucun avis.
    const troisieme = await encaisser(carteId, MISE_ENORME, 22);

    // Retrouvé par `source_id` et non par date : `avis_clients` porte
    // l'idempotence sur (source_table, source_id), donc c'est la clé qui
    // désigne l'avis d'une mise précise sans dépendre d'un ordre.
    const { data } = await admin
      .from('avis_clients')
      .select('corps')
      .eq('source_table', 'mises')
      .eq('source_id', troisieme);

    // `grouper_milliers` sépare par une espace simple : l'insécable n'est pas
    // en GSM-7, et un SMS qui la porte coûte deux segments au lieu d'un.
    expect(data?.[0]?.corps).toContain('4 000 000 000');
  });
});
```

- [ ] **Étape 5 : lancer les tests de base**

Run: `npm run test:db -- supabase/tests/mise-sans-plafond.test.ts`

Expected: PASS, 5 tests.

Si le dernier échoue avec `data` vide, c'est que l'avis n'a pas été composé : vérifier que le `upsert` sur `avis_reglages` a bien pris (`canal: 'sms'` et `sur_mise: true`) et que le client porte `avis_actifs: true` **et** un téléphone — le déclencheur sort en silence si l'un des trois manque.

- [ ] **Étape 6 : lancer toute la suite de base, pour vérifier que la redéfinition n'a rien cassé**

Run: `npm run test:db`

Expected: PASS de l'ensemble, en particulier `vue-globale.test.ts`, `mrr-remises.test.ts` et `avis-clients.test.ts` — les trois fichiers qui exercent les fonctions redéfinies.

- [ ] **Étape 7 : mettre la documentation à jour**

Dans `Docs/Kolek Cahier de charges consolide.md`, ligne 55, remplacer :

```
| Mise journalière | Montant fixe `M` défini à la souscription, **de 500 à 10 000 FCFA** (ex. 500, 1 000, 2 000, 5 000, 10 000). |
```

par :

```
| Mise journalière | Montant fixe `M` défini à la souscription, **à partir de 500 FCFA**, sans plafond (ex. 500, 1 000, 2 000, 5 000, 10 000). Au-delà de 10 000, l'application demande une confirmation : la mise est figée à l'ouverture de la carte et ne se corrige pas. |
```

Dans `Docs/Kolek Design System.md`, ligne 288, remplacer :

```
Sélecteur de mise = pilules `500 / 1 000 / 2 000 / 5 000 / 10 000`, bornées par `MISE_MIN` et `MISE_MAX` de `@kolek/core`.
```

par :

```
Sélecteur de mise = pilules `500 / 1 000 / 2 000 / 5 000 / 10 000`, plus un champ libre à partir de `MISE_MIN`. Au-delà de `MISE_INHABITUELLE`, une case à cocher s'ouvre sous le champ et retient le montant tant qu'elle n'est pas cochée. Les trois constantes viennent de `@kolek/core`.
```

- [ ] **Étape 8 : vérification complète**

Run: `npm test && npm run build`

Expected: PASS de tous les espaces de travail, build à exit 0.

- [ ] **Étape 9 : commit**

```bash
git add supabase/migrations/20260901090000_mise_sans_plafond.sql \
        supabase/tests/mise-sans-plafond.test.ts \
        "Docs/Kolek Cahier de charges consolide.md" "Docs/Kolek Design System.md"
git commit -m "feat(db): la base accepte une mise sans plafond, et sait encore la restituer

Les deux CHECK deviennent des planchers. Mais l'élargissement seul aurait
déplacé le refus vers un « integer out of range » levé pendant un
encaissement : (mises_encaissees - 1) * mise déborde à partir d'environ
71,5 millions de mise. Le produit est coulé en bigint dans admin_vue_globale
et dans l'avis client, et grouper_milliers reprend un bigint — sans quoi le
résultat redéborderait en redescendant.

Le bigint vient avant les bornes dans le fichier : à aucun moment la base
n'accepte une valeur qu'elle ne saurait pas rendre.

Reste documentée la limite qu'on n'a pas levée — le ::integer final de
cash_attendu_du_jour, soit ~2,1 milliards de recette par collecteur et par
jour."
```

---

## Vérification finale de la branche

- [ ] Run: `npm run verifier`

Expected: exit 0. Cette commande enchaîne `db:reset`, les vérificateurs de thème, de marque et de paliers, les tests de tous les espaces de travail, les tests de scripts, les tests de base, le build et le vérificateur de bundles.

- [ ] Run: `git grep -n "MISE_MAX\b" -- '*.ts' '*.tsx' '*.sql' '*.md'`

Expected: aucune ligne hors de `Docs/specs/` et `Docs/plans/`, où les documents de conception décrivent ce qui a disparu.
