# Refonte visuelle du Super Admin — plan d'implémentation

> **Pour un exécutant :** les étapes sont cochables (`- [ ]`) et se suivent dans
> l'ordre. Chaque tâche finit par un commit et laisse le dépôt vert.

**But :** amener les six onglets du Super Admin au niveau visuel posé par
`Sante.tsx`, lever les quatre points de l'audit du 2026-09-04 §5, et supprimer
la duplication de la grille des paliers.

**Architecture :** trois composants partagés naissent ou grandissent dans
`packages/ui` (`GrillePaliers`, `Repli`, `BarreHaute.mesure`), deux formes
montent dans `@kolek/core` (`LignePalier`, `ilYaLisible`), et une migration
additive nomme les acteurs du journal. Aucune Edge Function n'est modifiée.

**Outillage :** React 19, Vite 8, Tailwind v4, Vitest 4, TypeScript, oxlint,
Supabase Postgres.

**Conception :** `Docs/specs/2026-09-12-super-admin-refonte-visuelle-design.md`.

## Contraintes pour toutes les tâches

- **Données réelles, clients réels.** Aucune carte n'affiche un chiffre que
  l'état ne porte pas déjà. `CarteStat.tendance` reste facultative et n'est
  jamais remplie ici : aucune période précédente n'existe pour ces chiffres.
- **Jetons, jamais de valeur en dur** (Design System §7) : `bg-surface`, pas
  `bg-[#FFFFFF]`. Classes écrites en toutes lettres.
- **Un composant nouveau va dans `packages/ui`**, pas dans une application.
- **Le jeu d'icônes est une union close** (`packages/ui/src/Icone.tsx`). Seuls
  les 46 noms déclarés existent ; une icône absente est une erreur de
  compilation.
- **Fins de ligne : le dépôt est en CRLF, à sept exceptions près.** Recensé
  le 2026-09-12 sur les 33 fichiers de ce chantier : 26 en CRLF pur, 7 en LF
  — `packages/core/src/paliers.test.ts`, `packages/core/src/format.ts`,
  `packages/core/src/format.test.ts`, `packages/ui/src/CarteStat.tsx`,
  `packages/ui/src/BarreHaute.tsx`, `packages/ui/src/Pagination.tsx` et
  `supabase/migrations/20260830120000_journal_lisible_et_consultations.sql`.
  **Vérifier chaque fichier avec Node avant de l'éditer** : `cat` et `grep`
  masquent les `\r` sous Git Bash, seul Node dit la vérité. Un ajout
  multi-lignes par l'outil d'édition pose des LF — sans danger dans un
  fichier LF, il mêle les fins de ligne dans un fichier CRLF, où il faut
  passer par Node. **Tout fichier créé par ce chantier est en CRLF.**
- **Les épreuves d'abord.** Chaque étape de code est précédée d'une épreuve
  rouge, et la rougeur est constatée avant d'écrire l'implémentation.
- **La chaîne complète** est `npm run verifier`. Une tâche ne se commite pas
  sans elle au vert, sauf mention explicite d'une commande plus étroite.
- **Jamais de serveur de développement sur 5173 ni 5174** : ils pointent la
  production. Le regard local se fait sur un port dédié, contre
  `http://127.0.0.1:54321`.

---

## Les fichiers, et ce dont chacun répond

| Fichier | Responsabilité |
|---|---|
| `packages/core/src/paliers.ts` | Accueille `LignePalier`, la forme des comptes par palier, à côté de `DescriptionPalier` |
| `packages/core/src/format.ts` | Accueille `ilYaLisible`, le temps relatif, à côté de `formatHeureLocale` |
| `packages/ui/src/GrillePaliers.tsx` | La grille des quatre paliers, jusqu'ici écrite deux fois |
| `packages/ui/src/Repli.tsx` | Un `<details>` habillé aux jetons, qui rend toujours ses enfants |
| `packages/ui/src/CarteStat.tsx` | Gagne `alerte`, pour ne pas perdre le signal rouge de Facturation |
| `packages/ui/src/BarreHaute.tsx` | Gagne `mesure`, l'horodatage cliquable qui remplace « Rafraîchir » |
| `packages/ui/src/BarreLaterale.tsx` | « Facturation » et l'icône `receipt` |
| `apps/admin/src/donnees.ts` | Perd la déclaration de `LignePalier`, l'importe de `@kolek/core` |
| `apps/admin/src/ecrans/Abonnements.tsx` | Appelle `GrillePaliers`, perd sa `mrrLisible` locale |
| `apps/admin/src/ecrans/superadmin/Abonnements.tsx` | Appelle `GrillePaliers`, ses indicateurs deviennent des `CarteStat` |
| `apps/admin/src/ecrans/superadmin/lisible.ts` | Perd `mrrLisible`, qui descend dans `packages/ui` |
| `apps/admin/src/ecrans/superadmin/Plateforme.tsx` | Les deux signaux sortent, les sept comptages se replient |
| `apps/admin/src/ecrans/SuperAdmin.tsx` | Perd ses deux « Rafraîchir », passe `mesure` |
| `supabase/migrations/20260912090000_journal_nomme.sql` | `super_admin_journal` nomme acteur et cible |
| `supabase/tests/journal-nomme.test.ts` | Le verrou et les noms rendus |

---

## Tâche 1 : `LignePalier` monte dans `@kolek/core`

Le composant partagé de la tâche 3 en a besoin, et `packages/ui` ne peut pas
importer d'une application.

**Fichiers :**
- Modifier : `packages/core/src/paliers.ts` (fin du fichier)
- Modifier : `apps/admin/src/donnees.ts:1` et `:59-67`

**Interfaces :**
- Produit : `export interface LignePalier { palier: string; nom: string; prix: number; limiteClients: number | null; total: number; actifs: number; mrr: number }`, exportée par `@kolek/core` via le `export * from './paliers'` déjà en place.

- [ ] **Étape 1 : écrire l'épreuve rouge**

Créer `packages/core/src/paliers.test.ts` s'il n'existe pas, sinon y ajouter :

```ts
import { describe, expect, it } from 'vitest';

import { PALIERS, type LignePalier } from './paliers';

describe('LignePalier', () => {
  it('décrit un palier vendu, et se compose avec la grille tarifaire', () => {
    const ligne: LignePalier = {
      palier: 'pro',
      nom: 'Pro',
      prix: 5000,
      limiteClients: null,
      total: 12,
      actifs: 9,
      mrr: 45000,
    };

    expect(PALIERS.some((p) => p.cle === ligne.palier)).toBe(true);
    expect(ligne.actifs).toBeLessThanOrEqual(ligne.total);
  });
});
```

- [ ] **Étape 2 : constater la rougeur**

Commande : `npm run typecheck -w @kolek/core`
Attendu : échec —
`error TS2305: Module '"./paliers"' has no exported member 'LignePalier'`.

**Pas `npm run test`.** Vitest ne type-vérifie pas : l'import de type et
l'annotation s'effacent à l'exécution, et l'épreuve passe au vert alors même
que l'export n'existe pas — constaté le 2026-09-12, 97 succès. La porte rouge
d'une tâche qui ne livre qu'un type est `tsc`, jamais Vitest.

- [ ] **Étape 3 : poser le type**

À la fin de `packages/core/src/paliers.ts` :

```ts
/**
 * Ce que la base sait d'un palier **vendu** : combien de comptes le portent,
 * combien paient, ce qu'il rapporte. `DescriptionPalier` dit l'offre ;
 * celle-ci dit le réel. Les deux voyagent ensemble jusqu'à l'écran.
 *
 * `palier` reste une chaîne et non `Palier` : la valeur vient du serveur, et un
 * palier retiré de la grille ne doit pas casser le typage d'une réponse déjà
 * en vol.
 */
export interface LignePalier {
  palier: string;
  nom: string;
  prix: number;
  limiteClients: number | null;
  total: number;
  actifs: number;
  mrr: number;
}
```

- [ ] **Étape 4 : constater la verdeur**

Commande : `npm run typecheck -w @kolek/core && npm run test -w @kolek/core`
Attendu : les deux au vert.

- [ ] **Étape 5 : déplacer l'usage de l'application**

Dans `apps/admin/src/donnees.ts`, ligne 1, ajouter le type à l'import existant :

```ts
import type { FluxPeriode, LignePalier } from '@kolek/core';
```

Puis **supprimer** les lignes 59 à 67, la déclaration locale :

```ts
export interface LignePalier {
  palier: string;
  nom: string;
  prix: number;
  limiteClients: number | null;
  total: number;
  actifs: number;
  mrr: number;
}
```

`donnees.ts:136` (`parPalier: LignePalier[]`) n'est pas touché : le nom résout
désormais vers l'import.

- [ ] **Étape 6 : la chaîne**

Commande : `npm run verifier`
Attendu : tout au vert.

- [ ] **Étape 7 : commit**

```bash
git add packages/core/src/paliers.ts packages/core/src/paliers.test.ts apps/admin/src/donnees.ts
git commit -m "refactor(core): la forme des paliers vendus monte pres de la grille tarifaire"
```

---

## Tâche 2 : `CarteStat` gagne un état d'alerte

Sans lui, la montée au standard **ferait perdre** un signal : les indicateurs
de Facturation passent aujourd'hui la valeur en rouge quand des expirations ou
des défauts existent.

**Fichiers :**
- Modifier : `packages/ui/src/CarteStat.tsx`
- Épreuve : `packages/ui/src/CarteStat.test.tsx` (créer)

**Interfaces :**
- Produit : `CarteStat` accepte `alerte?: boolean` (défaut `false`). Toutes ses propriétés actuelles sont inchangées.

- [ ] **Étape 1 : écrire l'épreuve rouge**

Créer `packages/ui/src/CarteStat.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CarteStat } from './CarteStat';

/**
 * L'onglet Facturation passait ses valeurs en rouge quand des abonnements
 * expirent ou tombent en défaut. La carte partagée ne savait pas le faire :
 * l'adopter telle quelle aurait supprimé le signal sans que rien ne le dise.
 */

afterEach(cleanup);

describe('CarteStat', () => {
  it('écrit la valeur en encre par défaut', () => {
    render(<CarteStat libelle="Collecteurs actifs" valeur="9" precision="sur 12" icone="users" />);

    expect(screen.getByText('9').className).toContain('text-ink');
  });

  it('passe la valeur en négatif quand elle alerte', () => {
    render(
      <CarteStat libelle="En défaut" valeur="3" precision="3 suspendus" icone="alert-circle" alerte />,
    );

    expect(screen.getByText('3').className).toContain('text-negative');
  });

  it('n’affiche aucune tendance tant qu’on ne lui en donne pas', () => {
    render(<CarteStat libelle="MRR total" valeur="45 000" unite="FCFA" icone="wallet" />);

    expect(screen.queryByText('vs période précédente')).toBeNull();
  });
});
```

- [ ] **Étape 2 : constater la rougeur**

Commande : `npm run test -w @kolek/ui -- CarteStat`
Attendu : la deuxième épreuve échoue — la classe reste `text-ink`.

- [ ] **Étape 3 : poser la propriété**

Dans `packages/ui/src/CarteStat.tsx`, ajouter à `interface Props`, après
`precision` :

```ts
  /**
   * La valeur porte-t-elle une mauvaise nouvelle. Elle passe alors en négatif.
   * Distinct de `tendance`, qui compare à une période précédente : ici rien
   * n'est comparé, c'est l'état présent qui alerte.
   */
  alerte?: boolean;
```

Ajouter `alerte = false` à la déstructuration, puis remplacer la classe de la
valeur :

```tsx
        <span
          className={`font-headings font-bold text-3xl 2xl:text-4xl tabular-nums whitespace-nowrap ${
            alerte ? 'text-negative' : 'text-ink'
          }`}
        >
          {valeur}
        </span>
```

- [ ] **Étape 4 : constater la verdeur**

Commande : `npm run test -w @kolek/ui -- CarteStat`
Attendu : les trois épreuves passent.

- [ ] **Étape 5 : commit**

```bash
git add packages/ui/src/CarteStat.tsx packages/ui/src/CarteStat.test.tsx
git commit -m "feat(ui): la carte-statistique sait dire une mauvaise nouvelle"
```

---

## Tâche 3 : `GrillePaliers`, et la fin de la duplication

Le même bloc est écrit dans deux écrans, à deux détails près. `mrrLisible`
l'est aussi.

**Fichiers :**
- Créer : `packages/ui/src/GrillePaliers.tsx`
- Créer : `packages/ui/src/GrillePaliers.test.tsx`
- Modifier : `packages/ui/src/index.ts` (après la ligne `Filet`)
- Modifier : `apps/admin/src/ecrans/Abonnements.tsx` (bloc `:246-298`, et la `mrrLisible` locale `:49-53`)
- Modifier : `apps/admin/src/ecrans/superadmin/Abonnements.tsx` (bloc `:367-416`)
- Modifier : `apps/admin/src/ecrans/superadmin/lisible.ts` (retirer `mrrLisible`)

**Interfaces :**
- Consomme : `LignePalier` de `@kolek/core` (tâche 1).
- Produit : `export function GrillePaliers({ parPalier }: { parPalier: LignePalier[] })`, et `export function mrrLisible(mrr: number): string`, tous deux exportés par `@kolek/ui`.

- [ ] **Étape 1 : écrire l'épreuve rouge**

Créer `packages/ui/src/GrillePaliers.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GrillePaliers, mrrLisible } from './GrillePaliers';

/**
 * Ce bloc était écrit deux fois — écran Abonnements du Dashboard et onglet
 * Facturation du Super Admin — à un commentaire et une apostrophe près. Deux
 * copies, c'est deux endroits où corriger un prix.
 */

afterEach(cleanup);

const PAR_PALIER = [
  { palier: 'essai', nom: 'Essai', prix: 0, limiteClients: 20, total: 4, actifs: 0, mrr: 0 },
  { palier: 'pro', nom: 'Pro', prix: 5000, limiteClients: null, total: 12, actifs: 9, mrr: 45000 },
];

describe('mrrLisible', () => {
  it('écrit un tiret plutôt que zéro : le collecteur est en essai, pas en impayé', () => {
    expect(mrrLisible(0)).toBe('—');
  });

  it('écrit le montant suivi de son unité', () => {
    // Le separateur de milliers de `formatMontant` est une insecable
    // U+00A0. Une espace ordinaire ici ferait echouer l’epreuve, et une
    // sequence d’echappement tapee a la main deviendrait le caractere.
    const INSECABLE = String.fromCharCode(160);
    expect(mrrLisible(45000)).toBe(`45${INSECABLE}000 FCFA`);
  });
});

describe('GrillePaliers', () => {
  it('rend une carte par palier de la grille tarifaire', () => {
    render(<GrillePaliers parPalier={PAR_PALIER} />);

    expect(screen.getByText('Essai')).toBeDefined();
    expect(screen.getByText('Pro')).toBeDefined();
  });

  it('écrit « Gratuit » plutôt qu’un prix nul', () => {
    render(<GrillePaliers parPalier={PAR_PALIER} />);

    expect(screen.getByText('Gratuit')).toBeDefined();
  });

  it('accorde le pluriel du nombre d’actifs', () => {
    render(<GrillePaliers parPalier={PAR_PALIER} />);

    expect(screen.getByText('9 actifs')).toBeDefined();
  });

  it('rend un palier que la réponse ne compte pas, à zéro', () => {
    render(<GrillePaliers parPalier={[]} />);

    expect(screen.getAllByText('0 actif').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Étape 2 : constater la rougeur**

Commande : `npm run test -w @kolek/ui -- GrillePaliers`
Attendu : échec, le module `./GrillePaliers` n'existe pas.

- [ ] **Étape 3 : écrire le composant**

Créer `packages/ui/src/GrillePaliers.tsx` :

```tsx
import { PALIERS, formatMontant, type LignePalier } from '@kolek/core';

import { Carte } from './Carte';
import { Icone } from './Icone';

/**
 * Les quatre paliers vendus, ce qu'ils contiennent, et ce qu'ils rapportent.
 *
 * Le bloc vivait en double : `Abonnements.tsx` du Dashboard et l'onglet
 * Facturation du Super Admin le rendaient à l'identique, aux apostrophes près.
 * Les deux écrans s'adressent au même public — la monétisation est le métier
 * de GTCS — et un prix corrigé d'un seul côté aurait fini par mentir de
 * l'autre.
 *
 * Le titre appartient au composant : c'est lui qui met fin à la divergence des
 * deux libellés.
 */
export function GrillePaliers({ parPalier }: { parPalier: LignePalier[] }) {
  return (
    <div>
      <h2 className="font-headings font-bold text-xl text-ink mb-3">Paliers d’abonnement</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {PALIERS.map((palier) => {
          const compte = parPalier.find((p) => p.palier === palier.cle);
          const actifs = compte?.actifs ?? 0;
          return (
            <Carte key={palier.cle} className="overflow-hidden flex flex-col">
              <div className="h-1.5 w-full" style={{ background: palier.teinte }} />
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <span className="font-headings font-bold text-lg text-ink">{palier.nom}</span>
                  <span className="text-2xl font-headings font-bold text-ink tabular-nums text-right">
                    {palier.prix === 0 ? (
                      <span className="text-muted-foreground text-lg">Gratuit</span>
                    ) : (
                      <>
                        {formatMontant(palier.prix)}{' '}
                        <span className="text-xs font-body font-medium text-muted-foreground">
                          FCFA/mois
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <p className="text-sm font-body text-muted-foreground mb-3">{palier.limite}</p>

                {/* Seules les fonctions incluses : sur un écran d'administration
                    la liste sert à reconnaître un palier, pas à comparer une
                    offre. Les absences appartiennent à la page de vente. */}
                {palier.fonctions
                  .filter((f) => f.incluse)
                  .map((fonction) => (
                    <div key={fonction.libelle} className="flex items-center gap-2 mb-1.5">
                      <Icone nom="check" taille={13} className="text-positive flex-shrink-0" />
                      <span className="text-sm font-body text-ink">{fonction.libelle}</span>
                    </div>
                  ))}

                <div className="mt-auto pt-3 border-t border-hairline flex items-center justify-between">
                  <span className="text-sm font-body text-muted-foreground">
                    {actifs} actif{actifs > 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-body font-semibold text-ink tabular-nums">
                    {mrrLisible(compte?.mrr ?? 0)}
                  </span>
                </div>
              </div>
            </Carte>
          );
        })}
      </div>
    </div>
  );
}

/** Un MRR nul se lit « — » et non « 0 FCFA » : le collecteur est en essai, il ne
    paie pas encore ; zéro laisserait croire à un impayé. */
export function mrrLisible(mrr: number): string {
  return mrr === 0 ? '—' : `${formatMontant(mrr)} FCFA`;
}
```

- [ ] **Étape 4 : exporter**

Dans `packages/ui/src/index.ts`, après la ligne `export { Filet } from './Filet';` :

```ts
export { GrillePaliers, mrrLisible } from './GrillePaliers';
```

- [ ] **Étape 5 : constater la verdeur**

Commande : `npm run test -w @kolek/ui -- GrillePaliers`
Attendu : les six épreuves passent.

- [ ] **Étape 6 : brancher les deux écrans**

Dans `apps/admin/src/ecrans/superadmin/Abonnements.tsx`, remplacer le bloc des
lignes 367 à 416 — du commentaire `{/* Paliers d'abonnement */}` à la fermeture
`</div>` du bloc — par :

```tsx
      <GrillePaliers parPalier={abonnements.parPalier} />
```

Ajouter `GrillePaliers` à l'import de `@kolek/ui` en tête du fichier, et
remplacer l'import de `mrrLisible` : il vient désormais de `@kolek/ui` et non de
`./lisible`.

Dans `apps/admin/src/ecrans/Abonnements.tsx`, remplacer le bloc des lignes 246 à
298 — du commentaire `{/* Paliers */}` à la fermeture du `</div>` — par la même
ligne, ajouter `GrillePaliers` à l'import `@kolek/ui`, et **supprimer** la
fonction locale `mrrLisible` des lignes 49 à 53, en important celle de
`@kolek/ui` à la place.

Dans `apps/admin/src/ecrans/superadmin/lisible.ts`, **supprimer** `mrrLisible`
(lignes 21 à 25). Retirer l'import `formatMontant` s'il n'y sert plus.

- [ ] **Étape 7 : la chaîne**

Commande : `npm run verifier`
Attendu : tout au vert. Si une épreuve d'écran échoue sur un titre, vérifier
qu'elle cherchait l'apostrophe droite de l'ancienne version Super : le
composant partagé écrit `Paliers d’abonnement` avec l'apostrophe typographique.

- [ ] **Étape 8 : commit**

```bash
git add packages/ui/src/GrillePaliers.tsx packages/ui/src/GrillePaliers.test.tsx packages/ui/src/index.ts apps/admin/src/ecrans/Abonnements.tsx apps/admin/src/ecrans/superadmin/Abonnements.tsx apps/admin/src/ecrans/superadmin/lisible.ts
git commit -m "refactor(ui): la grille des paliers n'est plus ecrite deux fois"
```

---

## Tâche 4 : `ilYaLisible`, le temps relatif

Le point 5.3 de l'audit demande de remplacer « Rafraîchir » par l'âge du
chiffre. Rien de tel n'existe dans `@kolek/core`.

**Fichiers :**
- Modifier : `packages/core/src/format.ts` (fin du fichier)
- Modifier : `packages/core/src/format.test.ts` (existe : 45 lignes, LF, sept insécables)

**Interfaces :**
- Produit : `export function ilYaLisible(iso: string, maintenant?: Date): string`.

- [ ] **Étape 1 : écrire l'épreuve rouge**

Étendre l'import de `./format` en tête du fichier, puis ajouter le bloc à la
fin. Le fichier est en **LF** — sept fichiers du dépôt le sont, tous les
autres en CRLF — donc l'outil d'édition y est sûr.

```ts
// `describe`, `expect` et `it` sont deja importes par le fichier : ne pas
// ajouter un second import. Seul l'import de `./format` s'etend.
import {
  formatDateLocale,
  formatFCFA,
  formatHeureLocale,
  formatMontant,
  ilYaLisible,
} from './format';

/**
 * L'âge d'un chiffre, pas l'heure qu'il était. Au-delà d'une heure le relatif
 * cesse d'informer — « il y a 97 min » se recompte de tête — et l'absolu
 * reprend la main.
 */

const MAINTENANT = new Date('2026-09-12T10:00:00Z');

describe('ilYaLisible', () => {
  it('dit « à l’instant » sous la minute', () => {
    expect(ilYaLisible('2026-09-12T09:59:30Z', MAINTENANT)).toBe('à l’instant');
  });

  it('compte les minutes', () => {
    expect(ilYaLisible('2026-09-12T09:57:00Z', MAINTENANT)).toBe('il y a 3 min');
  });

  it('bascule sur l’heure absolue au-delà d’une heure', () => {
    expect(ilYaLisible('2026-09-12T08:00:00Z', MAINTENANT)).toMatch(/à \d{2}:\d{2}$/);
  });

  it('ne compte pas à rebours : une date à venir se lit « à l’instant »', () => {
    expect(ilYaLisible('2026-09-12T10:05:00Z', MAINTENANT)).toBe('à l’instant');
  });
});
```

- [ ] **Étape 2 : constater la rougeur**

Commande : `npm run test -w @kolek/core -- format`
Attendu : échec, `ilYaLisible` n'est pas exporté.

- [ ] **Étape 3 : écrire la fonction**

À la fin de `packages/core/src/format.ts` :

```ts
/**
 * L'âge d'une mesure : « il y a 3 min ».
 *
 * Au-delà d'une heure, le relatif cesse d'informer — « il y a 97 min » se
 * recompte de tête — et l'heure absolue reprend la main. Une date à venir
 * (horloge du poste en avance sur le serveur) se lit « à l'instant » plutôt que
 * de compter à rebours.
 */
export function ilYaLisible(iso: string, maintenant: Date = new Date()): string {
  const minutes = Math.floor((maintenant.getTime() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  return formatHeureLocale(new Date(iso));
}
```

- [ ] **Étape 4 : constater la verdeur**

Commande : `npm run test -w @kolek/core -- format`
Attendu : les quatre épreuves passent.

- [ ] **Étape 5 : commit**

```bash
git add packages/core/src/format.ts packages/core/src/format.test.ts
git commit -m "feat(core): l'age d'une mesure, et le moment ou le relatif cesse d'informer"
```

---

## Tâche 5 : `BarreHaute.mesure`, et le retrait de « Rafraîchir »

Un bouton de rechargement manuel sur chacun des six onglets. C'est le travail
du navigateur, et il masque la vraie information : de quand datent ces
chiffres.

**Fichiers :**
- Modifier : `packages/ui/src/BarreHaute.tsx`
- Créer : `packages/ui/src/BarreHaute.test.tsx`
- Modifier : `apps/admin/src/ecrans/SuperAdmin.tsx:160-183` (le bloc `const actions`)

**Interfaces :**
- Consomme : `ilYaLisible` de `@kolek/core` (tâche 4).
- Produit : `BarreHaute` accepte `mesure?: { iso: string; onRecharger: () => void }`.

- [ ] **Étape 1 : écrire l'épreuve rouge**

Créer `packages/ui/src/BarreHaute.test.tsx` :

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BarreHaute } from './BarreHaute';

/**
 * Un bouton « Rafraîchir » coiffait les six onglets du Super Admin. C'est le
 * travail du navigateur, et il masquait ce qu'on venait chercher : de quand
 * datent ces chiffres. Une seule affordance, qui porte l'information.
 */

afterEach(cleanup);

describe('BarreHaute', () => {
  it('n’affiche aucun horodatage tant qu’on ne lui en donne pas', () => {
    render(<BarreHaute filAriane={['Super Admin']} titre="Facturation" actions={[]} />);

    expect(screen.queryByRole('button', { name: /Mesuré/ })).toBeNull();
  });

  it('dit l’âge de la mesure', () => {
    render(
      <BarreHaute
        filAriane={['Super Admin']}
        titre="Facturation"
        actions={[]}
        mesure={{ iso: new Date().toISOString(), onRecharger: () => {} }}
      />,
    );

    expect(screen.getByRole('button', { name: /Mesuré à l’instant/ })).toBeDefined();
  });

  it('recharge au clic', () => {
    const onRecharger = vi.fn();
    render(
      <BarreHaute
        filAriane={['Super Admin']}
        titre="Facturation"
        actions={[]}
        mesure={{ iso: new Date().toISOString(), onRecharger }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Mesuré/ }));

    expect(onRecharger).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Étape 2 : constater la rougeur**

Commande : `npm run test -w @kolek/ui -- BarreHaute`
Attendu : les deux dernières épreuves échouent — aucun bouton d'horodatage.

- [ ] **Étape 3 : poser la propriété**

Dans `packages/ui/src/BarreHaute.tsx`, ajouter l'import et la propriété :

```ts
import { ilYaLisible } from '@kolek/core';
```

```ts
interface Props {
  filAriane: string[];
  titre: string;
  actions: ActionBarre[];
  /**
   * L'âge des chiffres affichés, et de quoi les redemander. Remplace le bouton
   * « Rafraîchir » : une seule affordance, qui porte l'information que le
   * bouton masquait.
   */
  mesure?: { iso: string; onRecharger: () => void };
}
```

Puis, dans le conteneur des actions, avant `{actions.map(...)}` :

```tsx
          {mesure && (
            <button
              type="button"
              onClick={mesure.onRecharger}
              className="min-h-11 px-3 rounded-md font-body text-sm text-muted-foreground border border-hairline bg-surface cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Mesuré {ilYaLisible(mesure.iso)}
            </button>
          )}
```

- [ ] **Étape 4 : constater la verdeur**

Commande : `npm run test -w @kolek/ui -- BarreHaute`
Attendu : les trois épreuves passent.

- [ ] **Étape 5 : retirer les deux « Rafraîchir »**

Dans `apps/admin/src/ecrans/SuperAdmin.tsx`, remplacer tout le bloc `const
actions = …` (lignes 160 à 183) par :

```tsx
  const actions =
    onglet === 'abonnements'
      ? [
          {
            icone: 'download' as NomIcone,
            libelle: 'Exporter',
            onActiver: exporter,
            disponible: vue.collecteurs.length > 0,
          },
        ]
      : [];
```

Puis passer la mesure à la barre :

```tsx
      <BarreHaute
        filAriane={configOnglet.filAriane}
        titre={configOnglet.titre}
        actions={actions}
        mesure={
          etat.statut === 'ok'
            ? { iso: etat.etat.genere_le, onRecharger: etat.recharger }
            : undefined
        }
      />
```

- [ ] **Étape 6 : la chaîne**

Commande : `npm run verifier`
Attendu : tout au vert. Aucune épreuve n'assertait « Rafraîchir » — la
recherche `grep -rn Rafraîchir apps packages` ne trouvait que les deux
occurrences supprimées.

- [ ] **Étape 7 : commit**

```bash
git add packages/ui/src/BarreHaute.tsx packages/ui/src/BarreHaute.test.tsx apps/admin/src/ecrans/SuperAdmin.tsx
git commit -m "feat(ui): l'age des chiffres remplace le bouton qui le masquait"
```

---

## Tâche 6 : `Repli`, le détail technique

Aucun `<details>` n'existe dans le produit. Il en faut un, et il doit **toujours
rendre ses enfants** : deux épreuves lisent les libellés de volumes à travers
`getByTestId`, et un lecteur d'écran doit pouvoir les atteindre.

**Fichiers :**
- Créer : `packages/ui/src/Repli.tsx`
- Créer : `packages/ui/src/Repli.test.tsx`
- Modifier : `packages/ui/src/index.ts` (entre `NavMobile` et `Squelette`)

**Interfaces :**
- Produit : `export function Repli({ titre, children, ouvertParDefaut }: { titre: string; children: ReactNode; ouvertParDefaut?: boolean })`.

- [ ] **Étape 1 : écrire l'épreuve rouge**

Créer `packages/ui/src/Repli.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Repli } from './Repli';

/**
 * Un repli qui démonte son contenu le retire aussi des lecteurs d'écran et de
 * la recherche du navigateur. `<details>` le garde dans le document et confie
 * la visibilité au navigateur : c'est ce qu'il faut ici.
 */

afterEach(cleanup);

describe('Repli', () => {
  it('garde son contenu dans le document même fermé', () => {
    render(
      <Repli titre="Détail technique">
        <p>Collecteurs : 65</p>
      </Repli>,
    );

    expect(screen.getByText('Collecteurs : 65')).toBeDefined();
  });

  it('est fermé par défaut', () => {
    const { container } = render(
      <Repli titre="Détail technique">
        <p>Collecteurs : 65</p>
      </Repli>,
    );

    expect(container.querySelector('details')?.open).toBe(false);
  });

  it('s’ouvre quand on le lui demande', () => {
    const { container } = render(
      <Repli titre="Détail technique" ouvertParDefaut>
        <p>Collecteurs : 65</p>
      </Repli>,
    );

    expect(container.querySelector('details')?.open).toBe(true);
  });

  it('porte son titre dans le résumé', () => {
    render(
      <Repli titre="Détail technique">
        <p>Collecteurs : 65</p>
      </Repli>,
    );

    expect(screen.getByText('Détail technique')).toBeDefined();
  });
});
```

- [ ] **Étape 2 : constater la rougeur**

Commande : `npm run test -w @kolek/ui -- Repli`
Attendu : échec, le module `./Repli` n'existe pas.

- [ ] **Étape 3 : écrire le composant**

Créer `packages/ui/src/Repli.tsx` :

```tsx
import type { ReactNode } from 'react';

import { Icone } from './Icone';

/**
 * Un repli natif, habillé aux jetons.
 *
 * `<details>` plutôt qu'un état React : le contenu reste dans le document, donc
 * atteignable par un lecteur d'écran et par la recherche du navigateur, et la
 * visibilité revient au navigateur. Un repli qui démonte ses enfants les fait
 * disparaître pour tout le monde, pas seulement pour l'œil.
 */
export function Repli({
  titre,
  children,
  ouvertParDefaut = false,
}: {
  titre: string;
  children: ReactNode;
  ouvertParDefaut?: boolean;
}) {
  return (
    <details open={ouvertParDefaut} className="group">
      <summary className="flex items-center gap-2 min-h-11 cursor-pointer font-body text-sm font-medium text-muted-foreground list-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <Icone
          nom="chevron-right"
          taille={14}
          className="transition-transform group-open:rotate-90"
        />
        {titre}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}
```

- [ ] **Étape 4 : exporter**

Dans `packages/ui/src/index.ts`, entre la ligne `NavMobile` et la ligne
`Squelette`. **Pas après `Pagination`** : cette ligne-là est justement la
ligne mal classée du fichier — elle s'est glissée entre `Champ` et
`ChampTelephone`. À partir de `EcranConnexion` le fichier est alphabétique,
et `Repli` y a sa place.

```ts
export { Repli } from './Repli';
```

- [ ] **Étape 5 : constater la verdeur**

Commande : `npm run test -w @kolek/ui -- Repli`
Attendu : les quatre épreuves passent.

- [ ] **Étape 6 : commit**

```bash
git add packages/ui/src/Repli.tsx packages/ui/src/Repli.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): un repli qui ne retire rien du document"
```

---

## Tâche 7 : les volumes se replient, les deux signaux sortent

`Plateforme` rend le nombre de lignes de chaque table en grille : de
l'introspection de base présentée comme du pilotage. Deux de ces lignes sont
pourtant opérationnelles.

**Attention au piège :** l'épreuve `alerte quand des rejets de synchronisation
attendent un arbitrage` utilise `screen.getByRole('alert')` **au singulier**. Le
signal promu ne doit pas lever une **seconde** alerte : l'alerte se déplace,
elle ne se duplique pas.

**Fichiers :**
- Modifier : `apps/admin/src/ecrans/superadmin/Plateforme.tsx`
- Modifier : `apps/admin/src/ecrans/SuperAdmin.test.tsx` (describe `la plateforme`)

**Interfaces :**
- Consomme : `Repli` (tâche 6), `CarteStat` avec `alerte` (tâche 2).

- [ ] **Étape 1 : écrire l'épreuve rouge**

Ajouter au describe `la plateforme` de `apps/admin/src/ecrans/SuperAdmin.test.tsx` :

```tsx
  it('sort les deux signaux opérationnels de la grille des comptages', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('plateforme');

    expect(screen.getByText('Rejets de synchro non traités')).toBeDefined();
    expect(screen.getByText('Journées de caisse')).toBeDefined();
    expect(screen.getByText('Détail technique')).toBeDefined();
  });

  it('ne lève qu’une seule alerte quand des rejets attendent', () => {
    poser({
      statut: 'ok',
      etat: { ...ETAT, volumes: { ...ETAT.volumes, rejets_non_traites: 3 } },
    });

    rendre('plateforme');

    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
```

- [ ] **Étape 2 : constater la rougeur**

Commande : `npm run test -w @kolek/admin -- SuperAdmin`
Attendu : la première épreuve échoue — « Détail technique » n'existe pas.

- [ ] **Étape 3 : scinder l'écran**

Dans `apps/admin/src/ecrans/superadmin/Plateforme.tsx`, ajouter `CarteStat` et
`Repli` à l'import `@kolek/ui`, puis remplacer le corps de la `Carte` des
volumes par deux blocs. Les deux signaux d'abord, hors du repli :

```tsx
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <CarteStat
            libelle="Rejets de synchro non traités"
            valeur={String(rejets)}
            precision={
              rejets > 0
                ? 'L’argent a changé de main : ces lignes attendent un arbitrage humain.'
                : 'Aucune mise refusée en attente.'
            }
            icone="alert-circle"
            alerte={rejets > 0}
          />
          <CarteStat
            libelle="Journées de caisse"
            valeur={String(etat.volumes.caisses_jour ?? 0)}
            precision="journées ouvertes depuis l’origine"
            icone="wallet"
          />
        </div>

        {rejets > 0 && (
          <p role="alert" className="font-body text-sm text-negative mb-5">
            Des mises ont été refusées à la synchronisation et attendent un arbitrage humain.
            L'argent a changé de main dans le monde réel : ces lignes ne doivent pas rester en
            attente.
          </p>
        )}
```

Puis les sept comptages restants, dans le repli — en **retirant** de la liste
les deux clés promues :

```tsx
        <Repli titre="Détail technique">
          <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {Object.entries(etat.volumes)
              .filter(([table]) => table !== 'rejets_non_traites' && table !== 'caisses_jour')
              .map(([table, lignes]) => (
                <div key={table}>
                  <dt className="font-body text-sm text-muted-foreground truncate">
                    {LIBELLES_VOLUMES[table] ?? table}
                  </dt>
                  <dd className="font-headings font-bold text-lg text-ink tabular-nums">{lignes}</dd>
                </div>
              ))}
          </dl>
        </Repli>
```

L'ancienne alerte de la grille est **supprimée** : elle est remontée au-dessus
du repli, une seule fois.

- [ ] **Étape 4 : constater la verdeur**

Commande : `npm run test -w @kolek/admin -- SuperAdmin`
Attendu : toutes les épreuves du describe passent, y compris `traduit les noms
de tables en libellés lisibles` — `<details>` garde ses enfants dans le
document.

- [ ] **Étape 5 : commit**

```bash
git add apps/admin/src/ecrans/superadmin/Plateforme.tsx apps/admin/src/ecrans/SuperAdmin.test.tsx
git commit -m "feat(super-admin): deux signaux sortent, l'introspection se replie"
```

---

## Tâche 8 : les têtes d'onglet

Cinq onglets s'ouvrent sans rien annoncer. Chaque chiffre posé ici existe déjà
dans l'état : aucun n'est calculé pour l'occasion, aucune tendance n'est
affichée — il n'existe pas de période précédente pour ces valeurs.

**Fichiers :**
- Modifier : `apps/admin/src/ecrans/superadmin/Abonnements.tsx` — le bloc
  `const indicateurs = [` et son rendu `{indicateurs.map((ind) => (`.
  **Chercher ces deux ancres, ne pas se fier à un numéro de ligne :** la
  tâche 3 a élargi l'import de ce fichier de dix lignes, et les bornes que ce
  plan portait (`:228-257` et `:337-365`) étaient déjà fausses avant que la
  tâche 8 ne commence.
- Modifier : `apps/admin/src/ecrans/superadmin/Administrateurs.tsx`
- Modifier : `apps/admin/src/ecrans/superadmin/Promos.tsx`
- Modifier : `apps/admin/src/ecrans/superadmin/Journal.tsx`
- Modifier : `apps/admin/src/ecrans/superadmin/Paiement.tsx`
- Modifier : `apps/admin/src/ecrans/SuperAdmin.test.tsx`

**Interfaces :**
- Consomme : `CarteStat` avec `alerte` (tâche 2).
- `Journal` et `Paiement` reçoivent de nouvelles propriétés : `Journal({ volumes, journal })` et `Paiement({ paiement })` inchangé. `SuperAdmin.tsx` passe `volumes={etat.etat.volumes}` et `journal={etat.etat.journal}` à `<Journal />`.

- [ ] **Étape 1 : écrire l'épreuve rouge**

Ajouter à `apps/admin/src/ecrans/SuperAdmin.test.tsx` :

```tsx
describe('les têtes d’onglet', () => {
  it('Facturation annonce le MRR et garde son alerte en rouge', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('abonnements');

    expect(screen.getByText('MRR total')).toBeDefined();
    expect(screen.getByText('En défaut')).toBeDefined();
  });

  it('Administrateurs compte les comptes et les super administrateurs', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('administrateurs');

    expect(screen.getByText('Comptes d’administration')).toBeDefined();
  });

  it('Promotions compte les codes en cours', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('promos');

    expect(screen.getByText('Codes en cours')).toBeDefined();
  });

  it('Sécurité annonce la taille du journal sans le lire', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('securite');

    expect(screen.getByText('Lignes de journal')).toBeDefined();
    expect(screen.getByText('Afficher le journal')).toBeDefined();
  });

  /**
   * **`ETAT` ne porte aucune clé `paiement`.** Avec lui seul, l’écran rend
   * sa branche de repli — « la fonction en ligne ne rend pas encore l’état
   * du paiement » — et « Produits déclarés » n’existe pas : l’épreuve serait
   * rouge pour toujours, y compris après une implémentation correcte.
   *
   * Le jeu `COMPLET` existe déjà, mais il est déclaré **dans** le `describe`
   * du paiement. Le remonter à la portée du module plutôt que le dupliquer.
   */
  it('Paiement annonce les produits déclarés', () => {
    poser({ statut: 'ok', etat: { ...ETAT, paiement: COMPLET } });

    rendre('paiement');

    expect(screen.getByText('Produits déclarés')).toBeDefined();
  });
});
```

- [ ] **Étape 2 : constater la rougeur**

Commande : `npm run test -w @kolek/admin -- SuperAdmin`
Attendu : **quatre** épreuves échouent, pas cinq. Celle de Facturation passe
déjà : `superadmin/Abonnements.tsx` rend déjà `ind.libelle`, donc « MRR total »
et « En défaut » sont à l’écran avant tout changement, et troquer `Carte`
contre `CarteStat` ne modifie pas une recherche par texte. Elle vaut comme
garde de non-régression, pas comme moteur — ce que `CarteStat` ajoute ici, la
pastille d’icône, n’est asserté par aucune épreuve.

- [ ] **Étape 3 : Facturation**

Dans `apps/admin/src/ecrans/superadmin/Abonnements.tsx`, remplacer le rendu des
indicateurs (lignes 337 à 365) par :

```tsx
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {indicateurs.map((ind) => (
          <CarteStat
            key={ind.libelle}
            libelle={ind.libelle}
            valeur={ind.valeur}
            unite={ind.unite}
            precision={ind.precision}
            icone={ind.icone}
            alerte={ind.alerte}
          />
        ))}
      </div>
```

Le tableau `indicateurs` (lignes 228 à 257) reçoit une icône par entrée :
`icone: 'wallet'` pour « MRR total », `'users'` pour « Collecteurs actifs »,
`'calendar'` pour « Expirations ce mois », `'alert-circle'` pour « En défaut ».
Ajouter `CarteStat` à l'import `@kolek/ui`. **Garder `Carte`** : mesuré le
2026-09-12, il sert encore deux fois ailleurs dans ce fichier.

- [ ] **Étape 4 : Administrateurs**

Dans `apps/admin/src/ecrans/superadmin/Administrateurs.tsx`, après le
paragraphe d'explication et avant la `Carte` :

```tsx
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <CarteStat
          libelle="Comptes d’administration"
          valeur={String(etat.administrateurs.length)}
          precision="voient le Dashboard"
          icone="users"
        />
        <CarteStat
          libelle="Super administrateurs"
          valeur={String(etat.administrateurs.filter((a) => a.niveau === 'super').length)}
          precision="voient cette console"
          icone="shield-check"
        />
      </div>
```

Ajouter `CarteStat` à l'import `@kolek/ui`.

- [ ] **Étape 5 : Promotions**

Dans `apps/admin/src/ecrans/superadmin/Promos.tsx`, dans `CodesPromo`, après le
titre et avant la première `Carte` :

```tsx
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <CarteStat
          libelle="Codes en cours"
          valeur={String(etat.codes_promo.filter((c) => c.statut === 'en_cours').length)}
          precision={`sur ${etat.codes_promo.length} créés`}
          icone="coins"
        />
        <CarteStat
          libelle="Remises qui courent"
          valeur={String(etat.remises.length)}
          precision="collecteurs à tarif réduit"
          icone="circle-dollar-sign"
        />
      </div>
```

Ajouter `CarteStat` à l'import `@kolek/ui`.

- [ ] **Étape 6 : Sécurité**

`Journal` ne reçoit aujourd'hui aucune propriété. Lui passer ce qu'il faut pour
annoncer la taille du journal **sans le lire** — lire le journal s'y
enregistre, et c'est tout le sujet de cet écran.

Signature : `export function Journal({ volumes, journal }: { volumes: Record<string, number>; journal: { derniere_ecriture: string | null; tables: string[] } })`.

Après le paragraphe d'explication, avant la `Carte` :

```tsx
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <CarteStat
          libelle="Lignes de journal"
          valeur={formatMontant(volumes.audit_log ?? 0)}
          precision="depuis l’origine"
          icone="history"
        />
        <CarteStat
          libelle="Tables tracées"
          valeur={String(journal.tables.length)}
          precision="lu dans pg_trigger"
          icone="shield-check"
        />
        <CarteStat
          libelle="Dernière écriture"
          valeur={journal.derniere_ecriture ? ilYaLisible(journal.derniere_ecriture) : '—'}
          precision={journal.derniere_ecriture ? '' : 'aucune écriture'}
          icone="check-circle"
        />
      </div>
```

Importer `formatMontant` et `ilYaLisible` de `@kolek/core`, `CarteStat` de
`@kolek/ui`. Dans `apps/admin/src/ecrans/SuperAdmin.tsx`, l'appel devient :

```tsx
            {onglet === 'securite' && (
              <Journal volumes={etat.etat.volumes} journal={etat.etat.journal} />
            )}
```

- [ ] **Étape 7 : Paiement**

Dans `apps/admin/src/ecrans/superadmin/Paiement.tsx`, dans la branche garnie,
après le paragraphe d'explication :

```tsx
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <CarteStat
          libelle="Produits déclarés"
          valeur={`${paiement.produits.filter((p) => p.configure).length} / ${paiement.produits.length}`}
          precision={precisionManquants(manquants.length)}
          icone="receipt"
          alerte={manquants.length > 0}
        />
        <CarteStat
          libelle="Boutique"
          valeur={LIBELLE_BOUTIQUE[paiement.boutique]}
          precision={boutique.texte}
          icone="landmark"
          alerte={boutique.ton === 'ko'}
        />
      </div>
```

`manquants` et `boutique` sont **déjà** calculés avant le `return` — rien à
déplacer. Ajouter `CarteStat` à l'import `@kolek/ui`.

**Deux libellés que ce plan avait faux.** Les deux lignes ci-dessus sont de
ce plan, aucune épreuve ne les assertait, et toutes deux disaient faux à
l’écran — trouvées au regard à l’écran, le 2026-09-12 :

- `? 'Joignable' : 'Injoignable'` faisait dire « Injoignable » à l’état
  `non_configuree`, qui veut dire exactement l’inverse : aucune clé posée,
  donc rien n’a été demandé à la boutique, donc rien n’a échoué. Annoncer un
  échec qui n’a pas eu lieu vaut moins que ne rien dire.
- `'un palier ne peut pas être payé'` restait au singulier sous un « 0 / 3 »,
  pendant que l’alerte trois centimètres plus bas comptait « 3 paliers n’ont
  pas de produit déclaré ». Deux chiffres pour un seul fait.

Poser les deux au niveau du module, après la table `BOUTIQUE` :

```tsx
const LIBELLE_BOUTIQUE: Record<EtatPaiement['boutique'], string> = {
  joignable: 'Joignable',
  refusee: 'Clé refusée',
  injoignable: 'Injoignable',
  non_configuree: 'Non configurée',
};

function precisionManquants(combien: number): string {
  if (combien === 0) return 'tous les paliers';
  if (combien === 1) return 'un palier ne peut pas être payé';
  return `${combien} paliers ne peuvent pas être payés`;
}
```

L’épreuve qui tient le second, à ajouter au `describe` des têtes d’onglet :
`accorde la précision au nombre de paliers sans produit`. Elle rend deux fois
— trois produits manquants, puis un seul — et lit le libellé de la carte.

- [ ] **Étape 8 : constater la verdeur**

Commande : `npm run verifier`
Attendu : tout au vert.

- [ ] **Étape 9 : commit**

```bash
git add apps/admin/src/ecrans/superadmin apps/admin/src/ecrans/SuperAdmin.tsx apps/admin/src/ecrans/SuperAdmin.test.tsx
git commit -m "feat(super-admin): chaque onglet dit ce qu'il pilote, sans inventer un chiffre"
```

---

## Tâche 9 : le menu — « Facturation » et une icône distincte

Deux entrées portaient le même libellé et la même icône, pour deux écrans
différents ; et deux entrées du seul menu Super partageaient `credit-card`.

**Fichiers :**
- Modifier : `packages/ui/src/BarreLaterale.tsx:105` et `:116`
- Modifier : `packages/ui/src/BarreLaterale.test.tsx`
- Modifier : `apps/admin/src/ecrans/SuperAdmin.tsx:71-74` (fil d'Ariane et titre)

- [ ] **Étape 1 : écrire l'épreuve rouge**

Ajouter au describe `la barre latérale d’administration` de
`packages/ui/src/BarreLaterale.test.tsx` :

```tsx
  it('ne porte pas deux fois « Abonnements » dans la plateforme', () => {
    render(
      <BarreLaterale
        espace="super"
        actif="abonnements"
        onNaviguer={() => {}}
        onDeconnexion={() => {}}
        estSuper
        onChangerEspace={() => {}}
      />,
    );

    expect(screen.getByText('Facturation')).toBeDefined();
    expect(screen.queryByText('Abonnements')).toBeNull();
  });
```

- [ ] **Étape 2 : constater la rougeur**

Commande : `npm run test -w @kolek/ui -- BarreLaterale`
Attendu : échec, « Facturation » n'existe pas.

- [ ] **Étape 3 : renommer**

Dans `packages/ui/src/BarreLaterale.tsx`, ligne 105 :

```ts
  { cle: 'abonnements', icone: 'credit-card', libelle: 'Facturation', disponible: true },
```

Ligne 116, changer l'icône — `credit-card` servait déjà deux fois dans ce seul
menu :

```ts
  { cle: 'paiement', icone: 'receipt', libelle: 'Paiement', disponible: true },
```

La clé `abonnements` ne change pas : la renommer toucherait la navigation pour
un libellé.

- [ ] **Étape 4 : accorder l'écran**

Dans `apps/admin/src/ecrans/SuperAdmin.tsx`, la première entrée de `ONGLETS` :

```tsx
  {
    cle: 'abonnements',
    filAriane: ['Super Admin', 'Facturation'],
    titre: 'Facturation des collecteurs',
  },
```

- [ ] **Étape 5 : la chaîne**

Commande : `npm run verifier`
Attendu : tout au vert. Si une épreuve de `SuperAdmin.test.tsx` cherchait
« Gestion des abonnements », l'ajuster : le titre a changé, et c'est le but.

- [ ] **Étape 6 : commit**

```bash
git add packages/ui/src/BarreLaterale.tsx packages/ui/src/BarreLaterale.test.tsx apps/admin/src/ecrans/SuperAdmin.tsx
git commit -m "fix(ui): deux entrees de menu ne portent plus le meme nom ni la meme icone"
```

---

## Tâche 10 : le journal nomme ses acteurs

Une console de sécurité qui affiche `acteur 3f2a… · ligne 9c1b…` ne dit pas qui
a agi. Le patron de jointure existe déjà deux fois dans les migrations.

**Fichiers :**
- Créer : `supabase/migrations/20260912090000_journal_nomme.sql`
- Créer : `supabase/tests/journal-nomme.test.ts`
- Modifier : `apps/admin/src/superadmin.ts` (`LigneJournal`)
- Modifier : `apps/admin/src/ecrans/superadmin/Journal.tsx` (affichage)

**Interfaces :**
- Produit : `super_admin_journal` rend deux clés de plus par ligne — `acteur_nom: string | null` et `cible_nom: string | null`.
- `LigneJournal` gagne `acteur_nom: string | null; cible_nom: string | null`.

- [ ] **Étape 1 : écrire l'épreuve de base rouge**

Créer `supabase/tests/journal-nomme.test.ts` :

```ts
import { afterAll, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le journal de sécurité nomme qui a agi.
 *
 * Deux choses comptent. **Le verrou** : la fonction rend le journal de toute la
 * plateforme, elle ne s'ouvre à aucun navigateur. **L'honnêteté du nom** : un
 * acteur sans fiche se dit « Compte sans fiche », une ligne antérieure au
 * 2026-08-30 n'a pas d'acteur du tout, et aucun des deux ne s'invente.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);

let collecteur: CollecteurTest;

afterAll(async () => {
  await nettoyer();
});

describe('le verrou', () => {
  it('refuse super_admin_journal sans session', async () => {
    const { error } = await anonyme.rpc('super_admin_journal', { p_page: 1, p_taille: 5 });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|not exist|not find/i);
  });

  it('refuse super_admin_journal à un collecteur authentifié', async () => {
    collecteur = await creerCollecteur(`Journal ${MARQUE}`, `+2250700${MARQUE.slice(0, 4)}`);
    const { error } = await collecteur.client.rpc('super_admin_journal', {
      p_page: 1,
      p_taille: 5,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|not exist|not find/i);
  });
});

describe('les noms', () => {
  it('rend une clé de nom pour l’acteur et pour la cible', async () => {
    const { data, error } = await admin.rpc('super_admin_journal', { p_page: 1, p_taille: 5 });

    expect(error).toBeNull();
    const lignes = (data as { lignes: Record<string, unknown>[] }).lignes;
    expect(lignes.length).toBeGreaterThan(0);
    expect(lignes[0]).toHaveProperty('acteur_nom');
    expect(lignes[0]).toHaveProperty('cible_nom');
  });

  it('n’invente aucun nom : la clé vaut null quand l’acteur n’en a pas', async () => {
    const { data } = await admin.rpc('super_admin_journal', { p_page: 1, p_taille: 50 });

    const lignes = (data as { lignes: { acteur_id: string | null; acteur_nom: string | null }[] })
      .lignes;
    for (const l of lignes) {
      if (l.acteur_id === null) expect(l.acteur_nom).toBeNull();
    }
  });
});
```

- [ ] **Étape 2 : constater la rougeur**

Commande : `npm run test:db`
Attendu : le describe `les noms` échoue — `acteur_nom` n'existe pas.

- [ ] **Étape 3 : écrire la migration**

Créer `supabase/migrations/20260912090000_journal_nomme.sql`. Reprendre
**intégralement** la fonction de `20260830120000`, en ajoutant deux jointures et
deux clés — et en reposant toute l'enveloppe, propriétaire, commentaire, droits
et garde-fou :

```sql
-- Le journal de sécurité nommait ses acteurs par leur UUID. Une console qui
-- affiche « acteur 3f2a… » ne dit pas qui a agi, et c'est sa seule raison
-- d'être. La jointure est celle que `20260822090000` et `20260830150000` font
-- déjà pour les administrateurs : `coalesce(c.nom, 'Compte sans fiche')`.
--
-- Une migration neuve, jamais une réécriture de `20260830120000`.

create or replace function public.super_admin_journal(
  p_page integer default 1,
  p_taille integer default 50,
  p_inclure_consultations boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with parametres as (
    select least(greatest(coalesce(p_taille, 50), 1), 200) as taille,
           greatest(coalesce(p_page, 1), 1)                as page
  ),
  fenetre as (
    select a.id, a.survenu_le, a.table_cible, a.action, a.ligne_id,
           a.acteur_id, a.collecteur_id, a.donnees
      from public.audit_log a
     where p_inclure_consultations
        or a.table_cible <> 'audit_log'
     order by a.survenu_le desc, a.id desc
     limit  (select taille from parametres) + 1
    offset  ((select page from parametres) - 1) * (select taille from parametres)
  ),
  numerotee as (
    select f.*, row_number() over (order by f.survenu_le desc, f.id desc) as rang
      from fenetre f
  )
  select jsonb_build_object(
    'lignes', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id',            n.id,
                 'survenu_le',    n.survenu_le,
                 'table_cible',   n.table_cible,
                 'action',        n.action,
                 'ligne_id',      n.ligne_id,
                 'acteur_id',     n.acteur_id,
                 -- Nul quand l'acteur est nul — les lignes antérieures au
                 -- 2026-08-30 —, « Compte sans fiche » quand l'acteur existe
                 -- sans être collecteur. L'écran distingue les deux.
                 'acteur_nom',    case
                                    when n.acteur_id is null then null
                                    else coalesce(ac.nom, 'Compte sans fiche')
                                  end,
                 'collecteur_id', n.collecteur_id,
                 'cible_nom',     case
                                    when n.collecteur_id is null then null
                                    else coalesce(ci.nom, 'Compte sans fiche')
                                  end,
                 'donnees',       n.donnees
               ) order by n.rang
             )
        from numerotee n
        left join public.collecteurs ac on ac.id = n.acteur_id
        left join public.collecteurs ci on ci.id = n.collecteur_id
       where n.rang <= (select taille from parametres)
    ), '[]'::jsonb),
    'a_suivre', (select count(*) from numerotee) > (select taille from parametres)
  );
$fn$;

alter function public.super_admin_journal(integer, integer, boolean) owner to postgres;

comment on function public.super_admin_journal is
  'Le journal d''audit, par pages bornées à 200 lignes, consultations masquées sauf demande, acteur et cible nommés. Réservée à service_role : le contrôle est_super_admin() se fait dans l''Edge Function appelante, sous l''identité de l''appelant. Aucune politique RLS n''est ouverte sur audit_log.';

revoke all on function public.super_admin_journal(integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.super_admin_journal(integer, integer, boolean) to service_role;

do $garde$
begin
  if has_function_privilege('anon', 'public.super_admin_journal(integer, integer, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.super_admin_journal(integer, integer, boolean)', 'execute') then
    raise exception
      'GARDE_FOU : super_admin_journal() est exécutable par anon ou authenticated. Le journal d''audit ne s''ouvre qu''à service_role.';
  end if;
end;
$garde$;
```

- [ ] **Étape 4 : appliquer en local et constater la verdeur**

Commandes :

```bash
npm run db:reset
npm run test:db
```

Attendu : les quatre épreuves passent. `db:reset` sans `--linked` est **local**.

- [ ] **Étape 5 : afficher les noms**

Dans `apps/admin/src/superadmin.ts`, ajouter à `LigneJournal` :

```ts
  /** Nommé par la migration `20260912090000`. Nul quand `acteur_id` l'est. */
  acteur_nom: string | null;
  /** Sur qui portait le geste. Nul quand `collecteur_id` l'est. */
  cible_nom: string | null;
```

Dans `apps/admin/src/ecrans/superadmin/Journal.tsx`, remplacer la seconde ligne
de chaque entrée :

```tsx
                  <p className="font-body text-xs text-muted-foreground">
                    par {l.acteur_nom ?? 'non attribué'}
                    {l.cible_nom && ` · sur ${l.cible_nom}`}
                  </p>
```

« non attribué » et non « inconnu » : c'est le libellé que
`20260830090000_journal_acteur.sql:38` prescrit pour les lignes antérieures à
l'ajout de la colonne.

- [ ] **Étape 6 : accorder les épreuves d'écran**

Dans `apps/admin/src/ecrans/SuperAdmin.test.tsx`, le jeu d'essai du journal
reçoit les deux clés. Ajouter au describe `le journal de sécurité` :

```tsx
  it('nomme l’acteur plutôt que d’afficher son identifiant', async () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('securite');
    fireEvent.click(screen.getByText('Afficher le journal'));

    expect(await screen.findByText(/par Aya Konan/)).toBeDefined();
  });
```

Le jeu d'essai `LIGNE` reçoit `acteur_nom: 'Aya Konan'` — le nom de `MOI`,
qui est déjà son `acteur_id` — et `cible_nom: 'Bakary Touré'`, celui de
`AUTRE`, qui est déjà son `collecteur_id`.

**Pas `cible_nom: null`.** Un `collecteur_id` non nul produit toujours un nom,
au pire « Compte sans fiche » : un jeu d'essai qui poserait `null` à côté d'un
`collecteur_id` renseigné décrirait un état que le serveur ne peut pas
produire, et mentirait sur le contrat qu'il est censé vérifier.

- [ ] **Étape 7 : la chaîne**

Commande : `npm run verifier`
Attendu : tout au vert.

- [ ] **Étape 8 : commit**

```bash
git add supabase/migrations/20260912090000_journal_nomme.sql supabase/tests/journal-nomme.test.ts apps/admin/src/superadmin.ts apps/admin/src/ecrans/superadmin/Journal.tsx apps/admin/src/ecrans/SuperAdmin.test.tsx
git commit -m "feat(base): le journal de securite nomme qui a agi, et sur qui"
```

---

## Le regard à l'écran

Après la tâche 10, et **avant** toute mise en production. Les quatre chantiers
précédents ont chacun trouvé par là un défaut qu'aucune épreuve ne voyait — la
double unité « FCFA FCFA » du chantier C n'était visible que comme ça.

- [ ] Démarrer l'admin sur un port dédié, contre la pile locale, **jamais sur
  5173 ni 5174** : ils pointent la production.
- [ ] Parcourir les six onglets. Vérifier : l'horodatage en haut de chacun,
  aucune trace de « Rafraîchir », le repli « Détail technique » fermé, une seule
  alerte quand des rejets attendent, les noms dans le journal, et « Facturation »
  dans le menu.
- [ ] Reprendre à 390 px de large : aucun débordement horizontal.
- [ ] Relever les exceptions de console. Il ne doit y en avoir aucune.

## Mise en production — chaque geste sur accord explicite

1. **Fusion** dans `main` en local, avance rapide si possible ; chaîne relancée
   sur le résultat.
2. **Avant la migration** : `npx supabase migration list --linked` (lecture
   seule). Attendu : seule `20260912090000` manque au distant.
3. **`npx supabase db push`** — **accord n° 1**. Puis, en lecture seule et en
   agrégats :

   ```sql
   select has_function_privilege('anon','public.super_admin_journal(integer,integer,boolean)','execute') as anon_ouvert,
          has_function_privilege('service_role','public.super_admin_journal(integer,integer,boolean)','execute') as service_ouvert;
   ```

   Attendu : `anon_ouvert` faux, `service_ouvert` vrai.
4. **Poussée de `main`** par PowerShell — **accord n° 2**. Aucune Edge Function
   n'ayant changé, **aucune ne doit prendre de version neuve** : c'est le
   contrôle qui distingue ce chantier des précédents. Puis les empreintes des
   trois fronts, seul l'admin devant changer.

## Retour arrière — sur décision seulement

Une migration neuve qui rétablit la version précédente de
`super_admin_journal`, jamais une réécriture. Côté écran, un `git revert` des
tâches concernées. **Aucune donnée n'est écrite par ce chantier, à aucun
moment.**

## Écarts relevés en écrivant ce plan

- **La spec annonçait que le retrait de « Rafraîchir » toucherait des épreuves
  nommées.** C'est faux : `grep -rn Rafraîchir apps packages` ne trouve que deux
  occurrences, toutes deux dans `SuperAdmin.tsx`, et aucune épreuve ne
  l'assertait. Il faut donc en **ajouter** une, ce que fait la tâche 5.
- **Le repli ne doit rien retirer du document.** Deux épreuves lisent les
  libellés de volumes à travers `getByTestId('plateforme')`. `<details>` garde
  ses enfants dans le DOM même fermé : elles passent. Un repli à état React les
  aurait cassées — et aurait retiré le contenu aux lecteurs d'écran.
- **`getByRole('alert')` est au singulier** dans l'épreuve des rejets. Le signal
  promu ne doit pas lever une seconde alerte : la tâche 7 la déplace au lieu de
  la dupliquer.
