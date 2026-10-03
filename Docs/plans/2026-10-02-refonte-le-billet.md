# Le billet, chantier 1 : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** donner au collecteur les fondations « Le billet » (couleur `trait`,
chiffres de caisse en IBM Plex Mono, gravure, tampon), les composants partagés
qu'elles demandent, et refaire trois écrans pilotes : Accueil (structure B),
Encaisser (trois temps), Retrait (liste compacte, décompte, clôture).

**Architecture :** les jetons naissent dans `packages/core/src/tokens.ts` et
descendent dans `theme.css` par `npm run generer:theme`. Les composants neufs
(`Tampon`, `Segments`, `Decompte`, `Outils`) vivent dans `packages/ui`, les vues
pures dans `apps/collecteur/src/hors-ligne/vues.ts`, et les écrans les
assemblent. Aucune lecture réseau, aucune migration, aucune fonction serveur.

**Tech Stack :** React 19, Tailwind v4 (`@theme`), Vitest 4 + Testing Library
(jsdom), `lucide-react` 1.31, `@fontsource/ibm-plex-mono` 5.3.

**Spec :** `Docs/specs/2026-10-02-refonte-le-billet-design.md`.
**Maquettes validées :** `Docs/maquettes/le-billet/*.html` (s'ouvrent seules
dans un navigateur).

## Global Constraints

- Travailler dans le worktree `C:/Users/M.BERTHE/Documents/Kolek/.claude/worktrees/refonte-billet`, branche `refonte-billet`. Jamais dans le dépôt principal.
- **Jamais de serveur sur les ports 5173 ou 5174** : ils parlent à la production.
- **Ne jamais lire `.env`.** Les constructions passent des variables factices en ligne : `VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=sb_publishable_factice`.
- Aucun `git merge`, aucun `git push`, aucun geste de production sans accord explicite de l'exploitant pour ce geste précis. Jamais `git stash` nu.
- `npm run db:reset` et `npm run test:db` sont refusés sur ce poste (ressource partagée) : ne pas les lancer, ne pas les contourner.
- Aucun export lu par `supabase/tests` n'est renommé (ils importent `lectures-ecrans`, `hors-ligne/{gestes,stockage-local,rafraichir,file,envoyer,synchroniseur,modele}`).
- Une épreuve vue rouge avant chaque comportement neuf. Un fichier d'épreuves : `npm test -w @kolek/<espace> -- <chemin relatif à l'espace>`, jamais `--config` depuis la racine.
- Les applications ne sont typées qu'au build (`tsc -b && vite build`) ; `packages/ui` se type par `npm run typecheck -w @kolek/ui`.
- Aucune valeur de jeton existante ne change : la vitrine les emploie. La vitrine ne change que par la carte de collecte de son téléphone.
- L'administration ne change pas, hormis trois icônes ajoutées au registre.
- Pas de tiret cadratin dans un libellé de moins de 70 caractères (`verifier:tirets`). Pas de `rounded-2xl` ni `rounded-3xl` dans les applications (`verifier:rayons`). Champ de saisie en `text-champ` (`verifier:champs`). Texte blanc translucide : `text-white/60` au minimum (`verifier:contraste`).
- Tout montant passe par `formatMontant` de `@kolek/core`, qui sépare les milliers par une espace insécable (U+00A0). Une épreuve qui compare un `textContent` passe donc par `formatMontant` ou par `\s` dans une expression, jamais par une espace tapée (`getByText` normalise les espaces, `toBe` non). L'unité « FCFA » est en Instrument Sans (`font-body`), plus petite que le montant.
- Un caractère invisible (U+202F, U+00A0) s'écrit par son code, `String.fromCharCode(0x202f)` : une séquence `\u…` tapée dans un outil d'écriture arrive dans le fichier sous forme de caractère, et plus personne ne la voit.
- **Plex Mono (`font-mono`) pour tout montant qu'on compte, les compteurs (`29/31`), les heures, les numéros de reçu. Jamais une phrase entière.** Le total du jour reste en Bricolage (`font-headings`).
- Aucune taille de texte en dur : l'échelle `taillesTexte` (`text-xs` 11 px, `text-sm` 13, `text-base` 15, `text-champ` 16, `text-lg` 16, `text-xl` 20, `text-2xl` 24, `text-3xl` 28, `text-4xl` 36, `text-total` 44).
- L'or (`text-or/NN`) ne sert qu'à la gravure sur fond sombre et à la pièce du logo. Jamais sur un montant ni sur un état.
- Messages de commit en français sans accents (usage du dépôt), terminés par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fins de ligne : le dépôt est en CRLF dans l'arbre de travail (`core.autocrlf=true`). Éditer par l'outil Edit, qui les garde ; un fichier neuf écrit en LF est normalisé par Git.

---

## Carte des fichiers

| Fichier | Rôle | Tâche |
|---|---|---|
| `packages/core/src/tokens.ts` | `trait`, `total`, `mono` ; départ de `degradeCarte` | 1, 7 |
| `packages/core/src/theme.css` | Engendré, jamais à la main | 1, 7 |
| `packages/core/src/tokens.test.ts` | Gardes des jetons | 1 |
| `packages/core/src/mouvement.css` | `anim-tampon` | 3 |
| `apps/collecteur/package.json`, `apps/collecteur/src/main.tsx` | Plex Mono 500 | 1 |
| `apps/site/src/styles.css` | `--font-mono` vient désormais du thème | 1 |
| `packages/ui/src/Icone.tsx` (+ `Icone.test.tsx`) | `banknote`, `scale`, `receipt-text` | 2 |
| `packages/ui/src/NavMobile.tsx` (+ `NavMobile.test.tsx`) | La touche « Encaisser » dans la barre | 2 |
| `packages/ui/src/NavBureau.tsx` | Icône `banknote` | 2 |
| `packages/ui/src/Tampon.tsx` (+ test) | Le tampon | 3 |
| `packages/ui/src/Segments.tsx` (+ test) | Choix exclusifs comptés | 4 |
| `packages/ui/src/Decompte.tsx` (+ test) | Décompte de caisse | 5 |
| `packages/ui/src/Outils.tsx` (+ test) | Grille d'outils neutres | 6 |
| `packages/ui/src/Bouton.tsx` (+ `Bouton.test.tsx`) | `nomAccessible`, `grand` | 6 |
| `packages/ui/src/CarteCollecte.tsx` (+ test) | La carte en billet | 7 |
| `packages/ui/src/index.ts` | Exports | 3 à 6 |
| `apps/collecteur/src/ecrans/FicheClient.test.tsx` | Compteur `20/31` | 7 |
| `apps/collecteur/src/hors-ligne/vues.ts` (+ test) | `misesAujourdhui`, `cartesAEncaisser`, `etatEnvoiMise` | 8 |
| `apps/collecteur/src/lectures.ts` | `TableauCollecteur.misesAujourdhui` | 8 |
| `apps/collecteur/src/recherche.ts` (+ test) | `correspondClient`, déplacé de `Clients.tsx` | 8 |
| `apps/collecteur/src/recu.ts` (+ test) | `numeroDeRecu`, extrait de `Recus.tsx` | 8 |
| `apps/collecteur/src/ecrans/Accueil.tsx` (+ test) | Structure B | 9 |
| `apps/collecteur/src/ecrans/Encaisser.tsx` (+ test) | Trois temps | 10 |
| `apps/collecteur/src/Coquille.tsx` (+ test) | Câblage d'Accueil et d'Encaisser | 9, 10 |
| `apps/collecteur/src/ecrans/EnTeteEcran.tsx` | Bord `trait`, sous-titre `text-sm` | 11 |
| `apps/collecteur/src/ecrans/Retrait.tsx` (+ test) | Liste, dépli, décompte, clôture | 11, 12 |
| `packages/ui/src/Feuille.tsx` (+ `Feuille.test.tsx`) | Voile `dark-canvas`, poignée `trait` | 12 |
| `apps/collecteur/src/ecrans/ActiverCarte.tsx` (+ test) | `explication` | 12 |
| `Docs/Kolek Design System.md` | La référence à jour | 13 |

---

### Task 0 : Préparer le worktree et relever le point de départ

**Files :** aucun fichier suivi.

- [ ] **Step 1 : Installer les dépendances dans le worktree**

Le worktree n'a pas de `node_modules`. Un lien vers celui du dépôt principal
ferait tester les paquets du dépôt principal : il faut une installation propre.

```bash
cd "C:/Users/M.BERTHE/Documents/Kolek/.claude/worktrees/refonte-billet"
npm ci
```

Attendu : `added N packages`, code de sortie 0.

- [ ] **Step 2 : Relever l'état des épreuves avant tout changement**

```bash
npm test --workspaces 2>&1 | tail -25
npm run test:scripts 2>&1 | tail -5
```

Attendu : tout vert. Noter le nombre d'épreuves de chaque espace. Si une épreuve
est rouge avant le premier changement, l'écrire dans le compte rendu et ne pas
la corriger dans ce chantier.

- [ ] **Step 3 : Construire la vitrine de référence**

C'est le point de comparaison de la tâche 14 : seule la carte du téléphone
doit différer.

```bash
VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=sb_publishable_factice npm run build -w @kolek/site
REF="C:/Users/ME687~1.BER/AppData/Local/Temp/claude/c--Users-M-BERTHE-Documents-Kolek/45f53cb2-c981-4f87-97b9-13e1c9e92d3c/scratchpad/vitrine-avant"
rm -rf "$REF" && cp -r apps/site/dist "$REF" && ls "$REF" | head
```

Attendu : `index.html`, `assets/`, et un dossier par route prérendue.

---

### Task 1 : Les jetons du billet et la police des chiffres

**Files :**
- Modify : `packages/core/src/tokens.ts` (`couleurs`, `taillesTexte`, `polices`)
- Modify : `packages/core/src/tokens.test.ts`
- Regenerate : `packages/core/src/theme.css`
- Modify : `apps/collecteur/package.json`, `apps/collecteur/src/main.tsx`
- Modify : `apps/site/src/styles.css:10-16`

**Interfaces :**
- Produces : classes `border-trait`, `bg-trait/40`, `text-total`, `font-mono` (IBM Plex Mono), jetons `couleurs.trait = '#858B81'`, `taillesTexte.total = '44px'`, `polices.mono = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"`.

- [ ] **Step 1 : Écrire les épreuves des trois jetons**

Dans `packages/core/src/tokens.test.ts`, remplacer la ligne d'import :

```ts
import { couleurs, genererCssTheme, grille, mesures, rayons, taillesTexte } from './tokens';
```

par :

```ts
import { couleurs, genererCssTheme, grille, mesures, polices, rayons, taillesTexte } from './tokens';
```

Puis ajouter à la fin du fichier :

```ts
/**
 * Les jetons du billet, posés le 2026-10-02.
 *
 * `trait` délimite ce qu'on touche, et c'est un seuil d'objet graphique qui
 * s'applique : 3:1, WCAG 1.4.11. Il doit le tenir sur les deux fonds où vit
 * un contrôle, et rester plus clair que le texte muet — il délimite, il ne se
 * lit pas.
 */
describe('le billet, jetons du 2026-10-02', () => {
  it('porte la police des chiffres de caisse', () => {
    expect(polices.mono).toBe(
      "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    );
    expect(genererCssTheme()).toContain(
      "--font-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;",
    );
  });

  it('porte le cran du total du jour, au-dessus de 4xl', () => {
    expect(taillesTexte.total).toBe('44px');
    expect(Number.parseFloat(taillesTexte.total)).toBeGreaterThan(
      Number.parseFloat(taillesTexte['4xl']),
    );
    expect(genererCssTheme()).toContain('--text-total: 44px;');
  });

  it('tient 3:1 pour la limite d’un contrôle, sur la surface', () => {
    expect(contraste(couleurs.trait, couleurs.surface)).toBeGreaterThanOrEqual(3);
  });

  it('tient 3:1 pour la limite d’un contrôle, sur le canevas', () => {
    expect(contraste(couleurs.trait, couleurs.canvas)).toBeGreaterThanOrEqual(3);
  });

  it('reste plus clair que le texte muet', () => {
    expect(contraste(couleurs.trait, couleurs.surface)).toBeLessThan(
      contraste(couleurs.mutedForeground, couleurs.surface),
    );
  });

  it('arrive jusqu’à Tailwind sous le nom `border-trait`', () => {
    expect(genererCssTheme()).toContain('--color-trait: #858B81;');
  });
});
```

`contraste` est la fonction déjà déclarée plus haut dans le même fichier (les
déclarations de fonction sont remontées).

- [ ] **Step 2 : Les voir échouer**

```bash
npm test -w @kolek/core -- src/tokens.test.ts
```

Attendu : 6 épreuves rouges dans « le billet, jetons du 2026-10-02 »
(`polices.mono` indéfini, `taillesTexte.total` indéfini, `couleurs.trait`
indéfini). Les autres restent vertes.

- [ ] **Step 3 : Poser les trois jetons**

Dans `packages/core/src/tokens.ts`, juste après la ligne `border: '#E6E3DA',`
du bloc `couleurs`, ajouter :

```ts
  // La limite de ce qu'on touche, posée le 2026-10-02 avec le billet.
  //
  // `hairline` sépare deux surfaces ; il ne délimite pas un contrôle. Un champ
  // de recherche bordé de `hairline` ne tient que 1,28:1 contre le papier,
  // quand WCAG 1.4.11 en demande 3 pour la limite d'un composant. `trait`
  // tient 3,5:1 sur `surface` et 3,2:1 sur `canvas` : assez sombre pour
  // délimiter, et pas davantage. Les maquettes le montraient plus clair
  // (`#D5D8D1`, 1,4:1) ; c'est l'écart que la spec assume.
  trait: '#858B81',
```

Dans `taillesTexte`, juste après la ligne `'4xl': '36px',`, ajouter :

```ts
  /**
   * Le total du jour, sur l'en-tête de l'accueil, et lui seul.
   *
   * C'est l'affiche de l'écran, en Bricolage, au-dessus de `4xl`. Il ne
   * s'applique qu'à partir de `xs` (390 px) : dessous, l'écran repasse en
   * `text-4xl`, selon la règle que `ruptures.xs` documente pour les montants
   * à sept chiffres.
   */
  total: '44px',
```

Remplacer le bloc `polices` :

```ts
export const polices = {
  body: "'Instrument Sans Variable', system-ui, sans-serif",
  headings: "'Bricolage Grotesque Variable', 'Instrument Sans Variable', system-ui, sans-serif",
} as const;
```

par :

```ts
export const polices = {
  body: "'Instrument Sans Variable', system-ui, sans-serif",
  headings: "'Bricolage Grotesque Variable', 'Instrument Sans Variable', system-ui, sans-serif",
  /**
   * Les chiffres de caisse, entrés dans les applications le 2026-10-02.
   *
   * Tout montant qu'on compte s'écrit en chasse fixe : soldes, mises, relevés,
   * décomptes, reçus, compteurs et heures. Jamais une phrase. Le total du jour
   * reste en Bricolage : c'est l'affiche, pas une ligne de caisse.
   *
   * La vitrine déclarait déjà cette famille dans sa propre feuille ; elle la
   * reçoit désormais d'ici. Le collecteur n'en charge que la graisse 500 :
   * 14 888 octets en latin, que garde le cache HTTP (`immutable`). Le service
   * worker ne précharge aucune police : si le navigateur a vidé ce cache, un
   * lancement hors ligne retombe sur le repli. L'administration ne charge pas
   * Plex : la liste de repli est celle de Tailwind, recopiée telle quelle,
   * pour que ses écrans ne changent pas.
   */
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
} as const;
```

- [ ] **Step 4 : Engendrer le thème et revoir les épreuves**

```bash
npm run generer:theme
npm test -w @kolek/core -- src/tokens.test.ts
npm run verifier:theme
```

Attendu : `theme.css engendré depuis tokens.ts.`, toutes les épreuves vertes,
`theme.css est à jour.` Contrôle : `grep -n "trait\|text-total\|font-mono" packages/core/src/theme.css`
montre les trois lignes.

- [ ] **Step 5 : Charger Plex Mono 500 dans le collecteur**

```bash
npm install @fontsource/ibm-plex-mono@^5.3.0 -w @kolek/collecteur
```

Attendu : `apps/collecteur/package.json` porte `"@fontsource/ibm-plex-mono": "^5.3.0"`,
et `package-lock.json` change de quelques lignes seulement (le paquet est déjà
installé pour la vitrine).

Dans `apps/collecteur/src/main.tsx`, remplacer :

```ts
import '@fontsource-variable/bricolage-grotesque/wght.css';
import '@fontsource-variable/instrument-sans/wght.css';
```

par :

```ts
import '@fontsource-variable/bricolage-grotesque/wght.css';
import '@fontsource-variable/instrument-sans/wght.css';
// Les chiffres de caisse : une graisse, la 500. Le pourquoi est dans
// `polices.mono`, packages/core/src/tokens.ts.
import '@fontsource/ibm-plex-mono/500.css';
```

- [ ] **Step 6 : Retirer la déclaration devenue double de la vitrine**

Dans `apps/site/src/styles.css`, remplacer :

```css
/* Les deux voix propres à la vitrine. Elles ne rentrent pas dans `tokens.ts` :
   les applications n'ont ni emphase dramatique ni flux monospace, et les y
   mettre inviterait à s'en servir. */
@theme {
  --font-drama: 'Bodoni Moda', 'Times New Roman', Georgia, serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;
}
```

par :

```css
/* La voix propre à la vitrine. Elle ne rentre pas dans `tokens.ts` : les
   applications n'ont pas d'emphase dramatique, et l'y mettre inviterait à s'en
   servir. La chasse fixe, elle, y est entrée le 2026-10-02 : les applications
   comptent en IBM Plex Mono, et `--font-mono` vient désormais de `theme.css`.
   Même famille en tête ; seul le repli s'allonge (la liste mono de Tailwind),
   et la vitrine, qui charge Plex, ne le voit que le temps que Plex arrive
   (`font-display: swap`), ou si la police échoue. */
@theme {
  --font-drama: 'Bodoni Moda', 'Times New Roman', Georgia, serif;
}
```

Vérifier qu'aucune épreuve de la vitrine ne lisait cette ligne :

```bash
grep -rn "font-mono: " apps/site/src --include=*.test.* ; echo "code $?"
```

Attendu : aucune ligne, `code 1`.

- [ ] **Step 7 : Construire le collecteur et la vitrine**

```bash
VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=sb_publishable_factice npm run build -w @kolek/collecteur
ls apps/collecteur/dist/assets | grep -i plex
grep -o "IBM Plex Mono[^;]*" apps/collecteur/dist/assets/*.css | head -2
VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=sb_publishable_factice npm run build -w @kolek/site
npm test -w @kolek/site
```

Attendu : au moins un `ibm-plex-mono-latin-500-normal-*.woff2` dans `dist/assets`,
la famille déclarée dans le CSS, la vitrine construite et ses épreuves vertes.

- [ ] **Step 8 : Commit**

```bash
git add packages/core/src/tokens.ts packages/core/src/tokens.test.ts packages/core/src/theme.css apps/collecteur/package.json apps/collecteur/src/main.tsx apps/site/src/styles.css package-lock.json
git commit -m "feat(fondations): trait, total du jour et chiffres de caisse en Plex Mono

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2 : Trois icônes et la touche « Encaisser » dans la barre

**Files :**
- Modify : `packages/ui/src/Icone.tsx`
- Create : `packages/ui/src/Icone.test.tsx`
- Modify : `packages/ui/src/NavMobile.tsx`
- Create : `packages/ui/src/NavMobile.test.tsx`
- Modify : `packages/ui/src/NavBureau.tsx:48`

**Interfaces :**
- Produces : `NomIcone` gagne `'banknote' | 'receipt-text' | 'scale'`. `NavMobile` pose `aria-current="page"` sur l'entrée active.

- [ ] **Step 1 : Écrire les épreuves des icônes**

Créer `packages/ui/src/Icone.test.tsx` :

```tsx
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Icone } from './Icone';

afterEach(cleanup);

/**
 * Les trois icônes du billet.
 *
 * `banknote` remplace le « $ » d'Encaisser, `scale` dit le rapprochement de la
 * caisse, `receipt-text` remplace un ticket de Lucide qui porte lui aussi un
 * « $ ». Le registre est une table explicite : une icône absente n'y existe
 * pas, et le rendu tombe.
 */
describe('le registre d’icônes', () => {
  it.each(['banknote', 'scale', 'receipt-text'] as const)('dessine %s', (nom) => {
    const { container } = render(<Icone nom={nom} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('class')).toContain(`lucide-${nom}`);
  });
});
```

- [ ] **Step 2 : Écrire les épreuves de la barre du bas**

Créer `packages/ui/src/NavMobile.test.tsx` :

```tsx
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NavMobile } from './NavMobile';

afterEach(cleanup);

function barre() {
  return screen.getByRole('navigation', { name: 'Navigation principale' });
}

/**
 * La barre du bas du collecteur.
 *
 * Le bouton rond qui flottait au-dessus de la barre (`-mt-5`, 56 px de
 * diamètre) était la signature la plus reconnaissable des gabarits de 2023.
 * « Encaisser » reste le geste du métier, et il reste distinct ; il le fait
 * dans la barre, en touche pleine, comme sur un tiroir-caisse.
 */
describe('la barre du bas', () => {
  it('porte cinq entrées, dans l’ordre du métier', () => {
    render(<NavMobile actif="accueil" onNaviguer={vi.fn()} />);
    expect(within(barre()).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Accueil',
      'Clients',
      'Encaisser',
      'Bilans',
      'Profil',
    ]);
  });

  it('pose la touche « Encaisser » dans la barre, et non au-dessus', () => {
    render(<NavMobile actif="accueil" onNaviguer={vi.fn()} />);
    const touche = within(barre()).getByRole('button', { name: 'Encaisser' });
    expect(touche.className).not.toMatch(/-mt-/);
    expect(touche.className).toContain('rounded-lg');
    expect(touche.className).toContain('bg-primary');
  });

  it('dessine un billet sur la touche, plus un « $ »', () => {
    render(<NavMobile actif="accueil" onNaviguer={vi.fn()} />);
    const svg = within(barre()).getByRole('button', { name: 'Encaisser' }).querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('lucide-banknote');
    expect(svg?.getAttribute('class')).not.toContain('circle-dollar-sign');
  });

  it('dit quelle entrée est la page ouverte', () => {
    render(<NavMobile actif="clients" onNaviguer={vi.fn()} />);
    expect(within(barre()).getByRole('button', { name: 'Clients' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(barre()).getByRole('button', { name: 'Accueil' }).hasAttribute('aria-current')).toBe(
      false,
    );
  });

  it('le dit aussi de la touche, quand on encaisse', () => {
    render(<NavMobile actif="encaisser" onNaviguer={vi.fn()} />);
    expect(
      within(barre()).getByRole('button', { name: 'Encaisser' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('mène où l’on touche', () => {
    const onNaviguer = vi.fn();
    render(<NavMobile actif="accueil" onNaviguer={onNaviguer} />);
    fireEvent.click(within(barre()).getByRole('button', { name: 'Encaisser' }));
    fireEvent.click(within(barre()).getByRole('button', { name: 'Bilans' }));
    expect(onNaviguer.mock.calls).toEqual([['encaisser'], ['bilans']]);
  });
});
```

- [ ] **Step 3 : Les voir échouer**

```bash
npm test -w @kolek/ui -- src/Icone.test.tsx src/NavMobile.test.tsx
```

Attendu : les trois cas d'`Icone` rouges (« Element type is invalid » : le
nom n'est pas dans la table) ; dans `NavMobile`, rouges : la touche (`-mt-5`
présent), le billet (`lucide-circle-dollar-sign`), et les deux `aria-current`.
Verts : l'ordre des cinq entrées et la navigation.

- [ ] **Step 4 : Ajouter les trois icônes au registre**

Dans `packages/ui/src/Icone.tsx`, dans l'import de `lucide-react`, ajouter
`Banknote,` après `ArrowUpRight,`, `ReceiptText,` après `Receipt,`, et
`Scale,` après `RefreshCw,`. Dans la table `ICONES`, ajouter
`banknote: Banknote,` après `'arrow-up-right': ArrowUpRight,`,
`'receipt-text': ReceiptText,` après `receipt: Receipt,`, et `scale: Scale,`
après `'refresh-cw': RefreshCw,`.

- [ ] **Step 5 : Réécrire la barre du bas**

Dans `packages/ui/src/NavMobile.tsx`, remplacer l'interface `Onglet` et la
table `ONGLETS` :

```tsx
interface Onglet {
  cle: CleNavCollecteur;
  icone: NomIcone;
  libelle: string;
  disponible: boolean;
  /** L'encaissement est le geste du métier : il sort de la barre. */
  saillant?: boolean;
}

const ONGLETS: Onglet[] = [
  { cle: 'accueil', icone: 'home', libelle: 'Accueil', disponible: true },
  { cle: 'clients', icone: 'users', libelle: 'Clients', disponible: true },
  {
    cle: 'encaisser',
    icone: 'circle-dollar-sign',
    libelle: 'Encaisser',
    disponible: true,
    saillant: true,
  },
```

par :

```tsx
interface Onglet {
  cle: CleNavCollecteur;
  icone: NomIcone;
  libelle: string;
  disponible: boolean;
  /**
   * L'encaissement est le geste du métier : il reste distinct, dans la barre.
   *
   * Jusqu'au 2026-10-02 il en sortait, rond de 56 px posé à cheval sur le
   * bord (`-mt-5`). C'était la signature la plus reconnaissable des gabarits
   * dont l'application est partie. Il devient une touche pleine, rectangle
   * vert coffre, dans l'alignement des autres : une touche de caisse, pas un
   * bouton flottant.
   */
  touche?: boolean;
}

const ONGLETS: Onglet[] = [
  { cle: 'accueil', icone: 'home', libelle: 'Accueil', disponible: true },
  { cle: 'clients', icone: 'users', libelle: 'Clients', disponible: true },
  {
    cle: 'encaisser',
    // Un billet, plus un « $ » : on compte en FCFA.
    icone: 'banknote',
    libelle: 'Encaisser',
    disponible: true,
    touche: true,
  },
```

Puis remplacer le corps du `map`, depuis `const estActif = onglet.cle === actif;`
jusqu'à la fin du `return` de l'onglet ordinaire, par :

```tsx
        const estActif = onglet.cle === actif;

        if (onglet.touche) {
          return (
            <button
              key={onglet.cle}
              type="button"
              onClick={() => onNaviguer(onglet.cle)}
              aria-current={estActif ? 'page' : undefined}
              className={`anim-pression flex h-12 w-16 flex-col items-center justify-center gap-0.5 rounded-lg bg-primary text-primary-foreground shadow-action cursor-pointer ${
                estActif ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''
              }`}
            >
              <Icone nom={onglet.icone} taille={20} />
              <span className="text-xs font-body font-semibold leading-none">{onglet.libelle}</span>
            </button>
          );
        }

        const teinte = !onglet.disponible
          ? 'text-muted-foreground/40'
          : estActif
            ? 'text-primary'
            : 'text-muted-foreground';

        return (
          <button
            key={onglet.cle}
            type="button"
            disabled={!onglet.disponible}
            onClick={() => onNaviguer(onglet.cle)}
            aria-current={estActif ? 'page' : undefined}
            // `min-w-14 py-1.5` : icône 22 px plus libellé 11 px donnaient une
            // cible de 37 px de haut, sous le minimum tactile de 44 px. Sur un
            // téléphone tenu d'une main, dans un marché, on rate l'onglet.
            className={`anim-pression flex flex-col items-center gap-1 px-2 py-1.5 min-w-14 ${
              onglet.disponible ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            {/* Le filet de l'onglet ouvert. Toujours rendu, transparent quand
                l'onglet ne l'est pas : les cinq entrées gardent ainsi la même
                hauteur, et rien ne saute d'un écran à l'autre. */}
            <span
              aria-hidden="true"
              className={`h-0.5 w-5 rounded-pill ${estActif ? 'bg-primary' : 'bg-transparent'}`}
            />
            <Icone nom={onglet.icone} taille={22} className={teinte} />
            <span className={`text-xs font-body font-medium ${teinte}`}>{onglet.libelle}</span>
          </button>
        );
```

- [ ] **Step 6 : L'icône de la barre de bureau**

Dans `packages/ui/src/NavBureau.tsx`, dans la constante `ENCAISSEMENT`,
remplacer `icone: 'circle-dollar-sign',` par `icone: 'banknote',`.

- [ ] **Step 7 : Voir les épreuves passer, et rien d'autre casser**

```bash
npm test -w @kolek/ui -- src/Icone.test.tsx src/NavMobile.test.tsx
npm test -w @kolek/ui
npm test -w @kolek/collecteur -- src/Coquille.test.tsx
npm run typecheck -w @kolek/ui
```

Attendu : tout vert. `Coquille.test.tsx` cherche les onglets par leur nom
(« Accueil », « Encaisser ») : le nom accessible de la touche est toujours son
libellé.

- [ ] **Step 8 : Commit**

```bash
git add packages/ui/src/Icone.tsx packages/ui/src/Icone.test.tsx packages/ui/src/NavMobile.tsx packages/ui/src/NavMobile.test.tsx packages/ui/src/NavBureau.tsx
git commit -m "feat(ui): la touche Encaisser dans la barre, un billet au lieu du dollar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3 : Le tampon

**Files :**
- Create : `packages/ui/src/Tampon.tsx`, `packages/ui/src/Tampon.test.tsx`
- Modify : `packages/core/src/mouvement.css` (primitive `anim-tampon`)
- Modify : `packages/ui/src/index.ts`

**Interfaces :**
- Produces : `Tampon({ mot, quand, className? })`, `type MotTampon = 'Encaissé' | 'Gardée' | 'Clôturée'`, `horodatageTampon(quand: Date): string` (`'02.10 · 11:47'`). Le tampon porte `data-tampon={mot}` et `aria-hidden="true"`.

- [ ] **Step 1 : Écrire les épreuves**

Créer `packages/ui/src/Tampon.test.tsx` :

```tsx
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Tampon, horodatageTampon } from './Tampon';

afterEach(cleanup);

const ONZE_H_47 = new Date(2026, 9, 2, 11, 47);

describe('le tampon', () => {
  it('écrit le mot, puis la date et l’heure du geste', () => {
    const { container } = render(<Tampon mot="Encaissé" quand={ONZE_H_47} />);
    expect(container.textContent).toBe('Encaissé02.10 · 11:47');
  });

  it('se tait pour les lecteurs d’écran : la ligne d’état dit la même chose', () => {
    const { container } = render(<Tampon mot="Gardée" quand={ONZE_H_47} />);
    const tampon = container.querySelector('[data-tampon]');
    expect(tampon?.getAttribute('aria-hidden')).toBe('true');
    expect(tampon?.getAttribute('data-tampon')).toBe('Gardée');
  });

  it('prend la couleur de l’information quand la mise attend sur le téléphone', () => {
    const { container } = render(<Tampon mot="Gardée" quand={ONZE_H_47} />);
    expect(container.innerHTML).toContain('text-info');
    expect(container.innerHTML).not.toContain('text-positive');
  });

  it.each(['Encaissé', 'Clôturée'] as const)('prend la couleur du succès pour « %s »', (mot) => {
    const { container } = render(<Tampon mot={mot} quand={ONZE_H_47} />);
    expect(container.innerHTML).toContain('text-positive');
  });

  it('se pose de biais, et arrive par la primitive du tampon', () => {
    const { container } = render(<Tampon mot="Encaissé" quand={ONZE_H_47} />);
    expect(container.innerHTML).toContain('-rotate-6');
    expect(container.innerHTML).toContain('anim-tampon');
  });
});

describe('horodatageTampon', () => {
  it('écrit jour.mois · heure:minute, à deux chiffres', () => {
    expect(horodatageTampon(new Date(2026, 0, 5, 7, 3))).toBe('05.01 · 07:03');
  });
});
```

- [ ] **Step 2 : Les voir échouer**

```bash
npm test -w @kolek/ui -- src/Tampon.test.tsx
```

Attendu : échec à l'import (`Failed to resolve import "./Tampon"`).

- [ ] **Step 3 : Écrire le composant**

Créer `packages/ui/src/Tampon.tsx` :

```tsx
/**
 * Le tampon : la marque d'un geste qui ne se défait pas.
 *
 * Au guichet, une somme encaissée reçoit un coup de tampon. Ici aussi, et
 * c'est ce qui remplace le bandeau vert à coche qu'avait l'encaissement : le
 * succès se lit **sur la carte**, à l'endroit du geste, et non dans un
 * message qui pourrait parler de n'importe quoi.
 *
 * Trois mots, trois moments. ENCAISSÉ : la mise est partie au serveur.
 * GARDÉE : elle attend dans la file du téléphone, en bleu « information »,
 * parce que rien n'a échoué. CLÔTURÉE : le retrait est inscrit. Une mise
 * refusée ne reçoit **aucun** tampon : c'est l'écran qui décide de ne pas en
 * poser, et ce composant ne connaît pas l'échec.
 *
 * `aria-hidden` : le tampon répète ce que la ligne d'état dit déjà en
 * `role="status"`. L'annoncer deux fois, c'est faire attendre deux fois.
 *
 * La rotation vit sur l'enveloppe, l'animation sur le corps : une animation
 * de `transform` sur le même élément écraserait la rotation.
 */
export type MotTampon = 'Encaissé' | 'Gardée' | 'Clôturée';

const TONS: Record<MotTampon, string> = {
  Encaissé: 'text-positive border-positive',
  Gardée: 'text-info border-info',
  Clôturée: 'text-positive border-positive',
};

/** `02.10 · 11:47`, à l'heure du téléphone : c'est celle du geste. */
export function horodatageTampon(quand: Date): string {
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${deux(quand.getDate())}.${deux(quand.getMonth() + 1)} · ${deux(quand.getHours())}:${deux(quand.getMinutes())}`;
}

export function Tampon({
  mot,
  quand,
  className = '',
}: {
  mot: MotTampon;
  quand: Date;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-tampon={mot}
      className={`pointer-events-none inline-block -rotate-6 ${className}`}
    >
      {/* Le cadre double : une bordure de 2 px, un blanc de 2 px, un filet de
          1 px. C'est ce qui fait lire un tampon et non un badge. */}
      <span
        className={`anim-tampon flex flex-col items-center rounded-md border-2 bg-surface/90 px-2.5 pb-1 pt-1.5 shadow-[inset_0_0_0_2px_var(--color-surface),inset_0_0_0_3px_currentColor] ${TONS[mot]}`}
      >
        <span className="font-headings text-base font-extrabold uppercase leading-tight tracking-widest">
          {mot}
        </span>
        <span className="font-mono text-xs leading-tight">{horodatageTampon(quand)}</span>
      </span>
    </span>
  );
}
```

- [ ] **Step 4 : Déclarer la primitive d'animation**

Dans `packages/core/src/mouvement.css`, juste avant le commentaire
`/* ------------------------- Le commutateur général ------------------------ */`,
ajouter :

```css
/* -------------------------------- 7. Tampon ------------------------------- */

/* Le tampon se plaque : il arrive un peu plus grand, et frappe. Pas de rebond,
 * un tampon ne rebondit pas. La durée est celle du toucher : c'est la réponse
 * à un appui. La rotation de six degrés vit sur l'enveloppe du composant, pas
 * ici, sans quoi cette animation l'écraserait. */
@keyframes kolek-tampon {
  from {
    opacity: 0;
    transform: scale(1.15);
  }
}

@utility anim-tampon {
  animation: kolek-tampon var(--duree-toucher) var(--courbe-sortie) both;
}
```

Et dans le bloc `@media (prefers-reduced-motion: reduce)` du bas, ajouter
`.anim-tampon,` après `.anim-feuille` en ajoutant la virgule, de sorte que la
liste se termine par :

```css
  .anim-voile,
  .anim-feuille,
  .anim-tampon {
```

- [ ] **Step 5 : Exporter**

Dans `packages/ui/src/index.ts`, après la ligne `export { Squelette, SqueletteKPI, SqueletteLigne } from './Squelette';`,
ajouter :

```ts
export { Tampon, horodatageTampon, type MotTampon } from './Tampon';
```

- [ ] **Step 6 : Voir passer**

```bash
npm test -w @kolek/ui -- src/Tampon.test.tsx
npm run typecheck -w @kolek/ui
```

Attendu : 7 épreuves vertes, typage propre.

- [ ] **Step 7 : Commit**

```bash
git add packages/ui/src/Tampon.tsx packages/ui/src/Tampon.test.tsx packages/ui/src/index.ts packages/core/src/mouvement.css
git commit -m "feat(ui): le tampon, marque d'un geste qui ne se defait pas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4 : Les segments

**Files :**
- Create : `packages/ui/src/Segments.tsx`, `packages/ui/src/Segments.test.tsx`
- Modify : `packages/ui/src/index.ts`

**Interfaces :**
- Produces : `Segments<C extends string>({ nom, segments, choisi, onChoisir })`, `interface Segment<C> { cle: C; libelle: string; compte?: number }`. Le nom accessible d'un segment est son libellé seul ; le compte est `aria-hidden`.

- [ ] **Step 1 : Écrire les épreuves**

Créer `packages/ui/src/Segments.test.tsx` :

```tsx
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Segments, type Segment } from './Segments';

afterEach(cleanup);

type Cle = 'Toutes' | 'Cycle terminé' | 'En cours';
const SEGMENTS: Segment<Cle>[] = [
  { cle: 'Toutes', libelle: 'Toutes', compte: 38 },
  { cle: 'Cycle terminé', libelle: 'Cycle terminé', compte: 3 },
  { cle: 'En cours', libelle: 'En cours', compte: 35 },
];

function rendre(onChoisir = vi.fn(), choisi: Cle = 'Toutes') {
  return render(
    <Segments nom="Filtrer les cartes" segments={SEGMENTS} choisi={choisi} onChoisir={onChoisir} />,
  );
}

describe('les segments', () => {
  it('se rangent dans un groupe nommé', () => {
    rendre();
    expect(screen.getByRole('group', { name: 'Filtrer les cartes' })).toBeTruthy();
  });

  it('nomment chaque choix par son libellé seul, le compte à part', () => {
    rendre();
    expect(screen.getByRole('button', { name: 'Cycle terminé' })).toBeTruthy();
    const groupe = screen.getByRole('group', { name: 'Filtrer les cartes' });
    expect(within(groupe).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Toutes38',
      'Cycle terminé3',
      'En cours35',
    ]);
    expect(screen.getByText('3').getAttribute('aria-hidden')).toBe('true');
  });

  it('disent lequel est choisi', () => {
    rendre(vi.fn(), 'En cours');
    expect(screen.getByRole('button', { name: 'En cours' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Toutes' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('rendent le choix touché', () => {
    const onChoisir = vi.fn();
    rendre(onChoisir);
    fireEvent.click(screen.getByRole('button', { name: 'Cycle terminé' }));
    expect(onChoisir).toHaveBeenCalledWith('Cycle terminé');
  });

  it('se passent de compte quand on n’en donne pas', () => {
    render(
      <Segments
        nom="Période"
        segments={[
          { cle: 'jour', libelle: 'Jour' },
          { cle: 'mois', libelle: 'Mois' },
        ]}
        choisi="jour"
        onChoisir={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Jour' }).textContent).toBe('Jour');
  });
});
```

- [ ] **Step 2 : Les voir échouer**

```bash
npm test -w @kolek/ui -- src/Segments.test.tsx
```

Attendu : échec à l'import de `./Segments`.

- [ ] **Step 3 : Écrire le composant**

Créer `packages/ui/src/Segments.tsx` :

```tsx
/**
 * Des choix exclusifs, rangés dans une piste : les filtres d'une liste.
 *
 * Ils remplacent le rang de puces qu'avait le retrait. Une puce à fond vert
 * plein se lit comme un bouton d'action ; trois segments dans une piste se
 * lisent comme une seule commande à trois positions, ce qu'ils sont.
 *
 * **Le compte est `aria-hidden`.** Le nom d'un segment reste son libellé seul,
 * que les phrases d'annonce de l'écran reprennent (« masquée par le filtre
 * « En cours » ») : un nom qui changerait avec le compte ferait mentir ces
 * phrases, et les épreuves qui cherchent le segment par son nom.
 *
 * Le segment choisi porte un filet `trait` en plus du fond blanc : un fond
 * blanc sur la piste ne tient qu'environ 1,1:1, et l'état choisi doit se
 * voir à 3:1 (WCAG 1.4.11).
 */
export interface Segment<C extends string> {
  cle: C;
  libelle: string;
  compte?: number;
}

export function Segments<C extends string>({
  nom,
  segments,
  choisi,
  onChoisir,
}: {
  nom: string;
  segments: Segment<C>[];
  choisi: C;
  onChoisir: (cle: C) => void;
}) {
  return (
    <div
      role="group"
      aria-label={nom}
      className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-muted p-1"
    >
      {segments.map((segment) => {
        const actif = segment.cle === choisi;
        return (
          <button
            key={segment.cle}
            type="button"
            aria-pressed={actif}
            onClick={() => onChoisir(segment.cle)}
            className={`anim-pression flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2 font-body text-sm font-semibold cursor-pointer ${
              actif
                ? 'border-trait bg-surface text-ink shadow-sm'
                : 'border-transparent text-muted-foreground'
            }`}
          >
            {segment.libelle}
            {segment.compte !== undefined && (
              <span aria-hidden="true" className="font-mono text-xs font-medium">
                {segment.compte}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4 : Exporter**

Dans `packages/ui/src/index.ts`, après la ligne `export { Repli } from './Repli';`,
ajouter :

```ts
export { Segments, type Segment } from './Segments';
```

- [ ] **Step 5 : Voir passer**

```bash
npm test -w @kolek/ui -- src/Segments.test.tsx
npm run typecheck -w @kolek/ui
```

Attendu : 5 épreuves vertes.

- [ ] **Step 6 : Commit**

```bash
git add packages/ui/src/Segments.tsx packages/ui/src/Segments.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): les segments, filtres d'une liste comptes et nommes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5 : Le décompte

**Files :**
- Create : `packages/ui/src/Decompte.tsx`, `packages/ui/src/Decompte.test.tsx`
- Modify : `packages/ui/src/index.ts`

**Interfaces :**
- Produces : `Decompte({ lignes, total })`, `interface LigneDecompte { libelle: ReactNode; montant: number }`. Un montant négatif s'écrit `−` (U+2212), espace fine insécable, puis la valeur absolue. Rendu en `<dl>` : `dt` (rôle `term`), `dd` (rôle `definition`).

- [ ] **Step 1 : Écrire les épreuves**

Créer `packages/ui/src/Decompte.test.tsx` :

```tsx
import { formatMontant } from '@kolek/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Decompte } from './Decompte';

afterEach(cleanup);

const FINE = String.fromCharCode(0x202f);

function rendre() {
  return render(
    <Decompte
      lignes={[
        { libelle: '31 mises × 1 000', montant: 31000 },
        { libelle: 'Ta commission, case 1', montant: -1000 },
      ]}
      total={{ libelle: 'À rendre', montant: 30000 }}
    />,
  );
}

describe('le décompte', () => {
  it('nomme chaque ligne, puis le total', () => {
    rendre();
    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual([
      '31 mises × 1 000',
      'Ta commission, case 1',
      'À rendre',
    ]);
  });

  it('écrit les montants du produit, le retrait signé', () => {
    rendre();
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual([
      formatMontant(31000),
      `−${FINE}${formatMontant(1000)}`,
      `${formatMontant(30000)} FCFA`,
    ]);
  });

  it('pose le total sous un double filet', () => {
    const { container } = rendre();
    const total = screen.getByText('À rendre').closest('div');
    expect(total?.className).toContain('border-double');
    expect(container.querySelectorAll('.border-double')).toHaveLength(1);
  });

  it('se lit en chiffres de caisse', () => {
    rendre();
    for (const valeur of screen.getAllByRole('definition')) {
      expect(valeur.className).toContain('font-mono');
    }
  });
});
```

- [ ] **Step 2 : Les voir échouer**

```bash
npm test -w @kolek/ui -- src/Decompte.test.tsx
```

Attendu : échec à l'import de `./Decompte`.

- [ ] **Step 3 : Écrire le composant**

Créer `packages/ui/src/Decompte.tsx` :

```tsx
import { formatMontant } from '@kolek/core';
import type { ReactNode } from 'react';

/**
 * Un décompte de caisse : des lignes, et le total sous un double filet.
 *
 * Il est né pour le retrait, où le collecteur rend de l'argent et ne peut pas
 * se tromper : « 31 mises × 1 000, moins la commission, à rendre 30 000 ».
 * C'est la forme qu'a tout ticket de caisse, et le collecteur peut le lire au
 * client avant de payer.
 *
 * Les points de conduite vivent dans le `dt`, et non entre le `dt` et le
 * `dd` : un `dl` n'admet entre eux ni `span` ni `div`. Ils sont décoratifs,
 * donc `aria-hidden`.
 */
export interface LigneDecompte {
  libelle: ReactNode;
  montant: number;
}

/** L'espace fine insécable (U+202F), écrite par son code : une séquence
    d'échappement tapée devient en route un caractère invisible. */
const FINE = String.fromCharCode(0x202f);

function signe(montant: number): string {
  return montant < 0 ? `−${FINE}${formatMontant(-montant)}` : formatMontant(montant);
}

export function Decompte({
  lignes,
  total,
}: {
  lignes: LigneDecompte[];
  total: { libelle: string; montant: number };
}) {
  return (
    <dl className="font-body">
      {lignes.map((ligne, rang) => (
        <div key={rang} className="flex items-baseline gap-2 py-1.5">
          <dt className="flex min-w-0 flex-1 items-baseline gap-2 text-sm text-muted-foreground">
            <span>{ligne.libelle}</span>
            <span
              aria-hidden="true"
              className="min-w-4 flex-1 -translate-y-1 border-b-2 border-dotted border-trait/50"
            />
          </dt>
          <dd className="font-mono text-base font-medium text-ink tabular-nums">
            {signe(ligne.montant)}
          </dd>
        </div>
      ))}
      <div className="mt-2 flex items-baseline justify-between gap-2 border-t-4 border-double border-ink pt-2.5">
        <dt className="text-base font-semibold text-ink">{total.libelle}</dt>
        <dd className="font-mono text-2xl font-medium text-ink tabular-nums">
          {signe(total.montant)}{' '}
          <span className="font-body text-sm font-medium text-muted-foreground">FCFA</span>
        </dd>
      </div>
    </dl>
  );
}
```

- [ ] **Step 4 : Exporter**

Dans `packages/ui/src/index.ts`, après la ligne `export { CourbeEvolution, type PointCourbe } from './CourbeEvolution';`,
ajouter :

```ts
export { Decompte, type LigneDecompte } from './Decompte';
```

- [ ] **Step 5 : Voir passer**

```bash
npm test -w @kolek/ui -- src/Decompte.test.tsx
npm run typecheck -w @kolek/ui
```

Attendu : 4 épreuves vertes.

- [ ] **Step 6 : Commit**

```bash
git add packages/ui/src/Decompte.tsx packages/ui/src/Decompte.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): le decompte de caisse, total sous un double filet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6 : Les outils, et deux propriétés de `Bouton`

**Files :**
- Create : `packages/ui/src/Outils.tsx`, `packages/ui/src/Outils.test.tsx`
- Modify : `packages/ui/src/Bouton.tsx`
- Create : `packages/ui/src/Bouton.test.tsx`
- Modify : `packages/ui/src/index.ts`

**Interfaces :**
- Produces : `Outils({ outils, anime? })`, `interface Outil { icone: NomIcone; libelle: string; onActiver?: () => void }`. `Bouton` gagne `nomAccessible?: string` (posé en `aria-label`) et `grand?: boolean` (`min-h-14 text-lg` au lieu de `min-h-11 text-base`).
- Consumes : `NomIcone` avec `scale` et `receipt-text` (tâche 2).

- [ ] **Step 1 : Écrire les épreuves des outils**

Créer `packages/ui/src/Outils.test.tsx` :

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Outils, type Outil } from './Outils';

afterEach(cleanup);

/**
 * La grille des outils de l'accueil du collecteur.
 *
 * Elle remplace, sur l'accueil seulement, les tuiles pastel d'`ActionsRapides`
 * et leurs quatre familles de couleur. `ActionsRapides` reste : le tableau de
 * bord de l'administration s'en sert, et l'administration a son propre
 * chantier.
 */
const OUTILS: Outil[] = [
  { icone: 'user-plus', libelle: 'Souscrire', onActiver: vi.fn() },
  { icone: 'scale', libelle: 'Rapprochement', onActiver: vi.fn() },
  { icone: 'receipt-text', libelle: 'Reçus', onActiver: vi.fn() },
];

describe('les outils', () => {
  it('rendent un bouton par outil, nommé par son libellé', () => {
    render(<Outils outils={OUTILS} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Souscrire',
      'Rapprochement',
      'Reçus',
    ]);
  });

  it('ouvrent l’outil touché', () => {
    const onActiver = vi.fn();
    render(<Outils outils={[{ icone: 'bell', libelle: 'Alertes', onActiver }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alertes' }));
    expect(onActiver).toHaveBeenCalledOnce();
  });

  it('ne portent aucune couleur de famille', () => {
    const { container } = render(<Outils outils={OUTILS} />);
    expect(container.innerHTML).not.toMatch(/tuile/);
  });

  it('étirent le dernier outil quand la rangée de deux est incomplète', () => {
    render(<Outils outils={OUTILS} />);
    expect(screen.getByRole('button', { name: 'Reçus' }).className).toContain('col-span-2');
    expect(screen.getByRole('button', { name: 'Souscrire' }).className).not.toContain('col-span-2');
  });

  it('éteignent un outil sans destination, et le disent', () => {
    render(<Outils outils={[{ icone: 'bell', libelle: 'Alertes' }]} />);
    const bouton = screen.getByRole('button', { name: 'Alertes' }) as HTMLButtonElement;
    expect(bouton.disabled).toBe(true);
    expect(bouton.title).toBe('À venir');
  });
});
```

- [ ] **Step 2 : Écrire les épreuves de `Bouton`**

Créer `packages/ui/src/Bouton.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Bouton } from './Bouton';

afterEach(cleanup);

describe('Bouton', () => {
  it('prend le nom accessible qu’on lui donne', () => {
    render(
      <Bouton nomAccessible="Encaisser 2 000 FCFA sur la carte de Mariam">Encaisser 2 000</Bouton>,
    );
    expect(
      screen.getByRole('button', { name: 'Encaisser 2 000 FCFA sur la carte de Mariam' }),
    ).toBeTruthy();
  });

  it('garde son libellé pour nom quand on ne lui en donne pas', () => {
    render(<Bouton>Fiche</Bouton>);
    expect(screen.getByRole('button', { name: 'Fiche' }).hasAttribute('aria-label')).toBe(false);
  });

  it('grandit sans que deux hauteurs se disputent la classe', () => {
    render(<Bouton grand>Encaisser</Bouton>);
    const classes = screen.getByRole('button', { name: 'Encaisser' }).className;
    expect(classes).toContain('min-h-14');
    expect(classes).toContain('text-lg');
    expect(classes).not.toContain('min-h-11');
    expect(classes).not.toContain('text-base');
  });
});
```

- [ ] **Step 3 : Les voir échouer**

```bash
npm test -w @kolek/ui -- src/Outils.test.tsx src/Bouton.test.tsx
```

Attendu : `Outils` échoue à l'import ; dans `Bouton`, rouges : le nom
accessible (le bouton s'appelle « Encaisser 2 000 ») et la taille (`min-h-11`
présent). Vert : le bouton sans nom accessible.

- [ ] **Step 4 : Écrire les outils**

Créer `packages/ui/src/Outils.tsx` :

```tsx
import type { CSSProperties } from 'react';

import { Icone, type NomIcone } from './Icone';

/**
 * La grille des outils de l'accueil du collecteur.
 *
 * ## Ce qu'elle remplace
 *
 * Neuf tuiles pastel en quatre familles de couleur (`ActionsRapides`), héritées
 * du gabarit dont l'application est partie. Une tuile colorée se reconnaît
 * avant de se lire ; neuf, c'est un jouet. Ici chaque outil est un bouton
 * neutre, papier et filet, l'icône en vert coffre et le mot en entier : on lit
 * « Rapprochement », et plus « Rapproch. ».
 *
 * ## Ce qui n'y est plus
 *
 * « Encaisser » et « Bilan » : la barre du bas les porte déjà. Deux chemins
 * vers le même écran sur le même écran, c'est un choix de trop.
 *
 * ## Le dernier outil s'étire
 *
 * Sur deux colonnes, un nombre impair d'outils laisse le dernier seul sur sa
 * rangée. Il prend alors toute la rangée : une case vide à sa droite se lirait
 * comme une grille arrêtée en chemin. Sur écran large, quatre colonnes, plus
 * rien à rattraper.
 */
export interface Outil {
  icone: NomIcone;
  libelle: string;
  onActiver?: () => void;
}

export function Outils({ outils, anime = false }: { outils: Outil[]; anime?: boolean }) {
  const impair = outils.length % 2 === 1;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {outils.map((outil, rang) => {
        const etire = impair && rang === outils.length - 1 ? 'col-span-2 sm:col-span-1' : '';
        return (
          <button
            key={outil.libelle}
            type="button"
            disabled={!outil.onActiver}
            title={outil.onActiver ? undefined : 'À venir'}
            onClick={outil.onActiver}
            style={anime ? ({ '--rang': rang } as CSSProperties) : undefined}
            className={`anim-pression flex min-h-13 items-center gap-2.5 rounded-lg border border-hairline bg-surface px-3 text-left font-body text-sm font-semibold text-ink ${etire} ${
              anime ? 'anim-cascade' : ''
            } ${outil.onActiver ? 'cursor-pointer' : 'cursor-default opacity-60'}`}
          >
            <Icone nom={outil.icone} taille={18} className="shrink-0 text-primary" />
            <span className="min-w-0 truncate">{outil.libelle}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5 : Les deux propriétés de `Bouton`**

Dans `packages/ui/src/Bouton.tsx`, dans l'interface `Props`, après la ligne
`className?: string;`, ajouter :

```tsx
  /**
   * Le nom que lit un lecteur d'écran, quand le libellé ne suffit pas.
   *
   * « Encaisser 2 000 » sous une carte dit le geste, pas la carte. Le nom
   * accessible le dit : « Encaisser 2 000 FCFA sur la carte de Mariam ». Il
   * doit **contenir** le libellé visible (WCAG 2.5.3), sans quoi un utilisateur
   * qui commande à la voix ne retrouve pas le bouton qu'il voit.
   */
  nomAccessible?: string;
  /** Le bouton du geste principal d'un écran : 56 px au lieu de 44. */
  grand?: boolean;
```

Dans la déstructuration des propriétés, après `className = '',`, ajouter
`nomAccessible,` et `grand = false,`. Puis remplacer le `<button …>` d'ouverture :

```tsx
    <button
      type={type}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`anim-pression min-h-11 px-5 rounded-md font-body font-semibold text-base flex items-center justify-center gap-2 ${
```

par :

```tsx
    <button
      type={type}
      disabled={disabled}
      title={title}
      onClick={onClick}
      aria-label={nomAccessible}
      // Deux tailles écrites en entier, et jamais l'une ajoutée par-dessus
      // l'autre : deux `min-h-*` dans une même classe, c'est l'ordre de la
      // feuille de style qui tranche, pas l'intention.
      className={`anim-pression ${grand ? 'min-h-14 text-lg' : 'min-h-11 text-base'} px-5 rounded-md font-body font-semibold flex items-center justify-center gap-2 ${
```

- [ ] **Step 6 : Exporter**

Dans `packages/ui/src/index.ts`, après la ligne `export { NavMobile, type CleNavCollecteur } from './NavMobile';`,
ajouter :

```ts
export { Outils, type Outil } from './Outils';
```

- [ ] **Step 7 : Voir passer**

```bash
npm test -w @kolek/ui -- src/Outils.test.tsx src/Bouton.test.tsx
npm test -w @kolek/ui
npm run typecheck -w @kolek/ui
```

Attendu : 8 épreuves vertes dans les deux fichiers, le paquet entier vert.

- [ ] **Step 8 : Commit**

```bash
git add packages/ui/src/Outils.tsx packages/ui/src/Outils.test.tsx packages/ui/src/Bouton.tsx packages/ui/src/Bouton.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): les outils neutres de l'accueil, nom accessible et grand bouton

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7 : La carte de collecte en billet

**Files :**
- Modify (réécriture) : `packages/ui/src/CarteCollecte.tsx`
- Modify : `packages/ui/src/CarteCollecte.test.tsx`
- Modify : `packages/core/src/tokens.ts` (départ de `degradeCarte`), regenerate `theme.css`
- Modify : `apps/collecteur/src/ecrans/FicheClient.test.tsx` (compteur)

**Interfaces :**
- Produces : `CarteCollecte({ nomClient, misePar, jourCourant, totalJours?, solde, cycle?, action?, neuve?, tampon?, surtitre?, etiquetteSolde?, close? })`. `jourCourant` garde son sens : les mises encaissées. `close` retire la case « prochaine » (carte clôturée). **`cycle` devient facultatif** : sans lui, pas de pastille. Chaque case porte `data-etat` ∈ `payee | neuve | prochaine | a-venir`. La racine porte `data-carte-collecte` et `rounded-xl` (la fiche la retrouve par `.closest('.rounded-xl')`). Le libellé « Mise / jour » et l'élément qui le suit (le montant) restent frères. Le compteur s'écrit d'un seul tenant : `29/31`.
- Consumes : `Onde` (`./Guilloche`), jeton `trait` (tâche 1).

- [ ] **Step 1 : Écrire les épreuves du billet**

Dans `packages/ui/src/CarteCollecte.test.tsx`, ajouter à la fin du fichier :

```tsx
describe('CarteCollecte — le billet', () => {
  function etats(conteneur: HTMLElement) {
    return [...conteneur.querySelectorAll('[data-etat]')].map((c) => c.getAttribute('data-etat'));
  }

  function carte(supplement: Partial<React.ComponentProps<typeof CarteCollecte>> = {}) {
    return render(
      <CarteCollecte
        nomClient="Mariam"
        misePar="2 000"
        jourCourant={29}
        solde="56 000"
        cycle="1"
        {...supplement}
      />,
    );
  }

  it('porte trente et une cases', () => {
    const { container } = carte();
    expect(etats(container)).toHaveLength(31);
  });

  it('peint les mises encaissées, cercle la prochaine, laisse les autres à venir', () => {
    const { container } = carte();
    const e = etats(container);
    expect(e.slice(0, 29).every((x) => x === 'payee')).toBe(true);
    expect(e[29]).toBe('prochaine');
    expect(e[30]).toBe('a-venir');
  });

  it('marque la case qu’on vient de payer', () => {
    const { container } = carte({ jourCourant: 30, neuve: 30 });
    const e = etats(container);
    expect(e[29]).toBe('neuve');
    expect(e[30]).toBe('prochaine');
    expect(e.filter((x) => x === 'neuve')).toHaveLength(1);
  });

  it('écrit le compteur d’un seul tenant', () => {
    carte();
    expect(screen.getByText('29/31')).toBeTruthy();
  });

  it('garde « Mise / jour » et son montant côte à côte, comme la fiche les lit', () => {
    carte();
    expect(screen.getByText('Mise / jour').nextElementSibling?.textContent).toMatch(/2\s000/);
  });

  it('pose le tampon et le surtitre qu’on lui donne', () => {
    carte({ tampon: <span>tampon posé</span>, surtitre: <span>À finir en premier</span> });
    expect(screen.getByText('tampon posé')).toBeTruthy();
    expect(screen.getByText('À finir en premier')).toBeTruthy();
  });

  it('change le libellé du solde une fois la carte close', () => {
    carte({ etiquetteSolde: 'Rendu au client' });
    expect(screen.getByText('Rendu au client')).toBeTruthy();
    expect(screen.queryByText('Solde restituable')).toBeNull();
  });

  it('ne cercle aucune case sur une carte close : plus rien n’y attend de mise', () => {
    const { container } = carte({ jourCourant: 4, close: true });
    const e = etats(container);
    // Les trente et une cases d'abord : sans elles, les deux lignes suivantes
    // passeraient sur une liste vide.
    expect(e).toHaveLength(31);
    expect(e.slice(0, 4).every((x) => x === 'payee')).toBe(true);
    expect(e).not.toContain('prochaine');
  });

  it('ne dit pas de cycle qu’on ne lui donne pas', () => {
    carte({ cycle: undefined });
    expect(screen.queryByText(/^Cycle/)).toBeNull();
  });

  it('ne porte plus ni verre ni dégradé', () => {
    const { container } = carte();
    expect(container.innerHTML).not.toMatch(/backdrop-blur|degrade-carte|radial-gradient/);
  });

  it('se laisse retrouver par son bloc, comme la fiche le fait', () => {
    carte();
    const bloc = screen.getByText('Cycle 1').closest('.rounded-xl');
    expect(bloc?.hasAttribute('data-carte-collecte')).toBe(true);
  });

  it('garde son format réduit sur huit colonnes', () => {
    const { container } = carte();
    expect(container.innerHTML).toContain('@max-[240px]:grid-cols-8');
  });
});
```

- [ ] **Step 2 : Les voir échouer**

```bash
npm test -w @kolek/ui -- src/CarteCollecte.test.tsx
```

Attendu : rouges toutes les épreuves du billet sauf « garde « Mise / jour » »
et « garde son format réduit » (l'ancienne carte les tient déjà). Les deux
épreuves de « la fente du pied » restent vertes.

- [ ] **Step 3 : Réécrire la carte**

Remplacer tout le contenu de `packages/ui/src/CarteCollecte.tsx` par :

```tsx
import { MISES_PAR_CYCLE } from '@kolek/core';
import type { ReactNode } from 'react';

import { Onde } from './Guilloche';

interface Props {
  nomClient: string;
  misePar: string;
  /**
   * Les mises encaissées. Les cases 1 à `jourCourant` sont payées, la
   * suivante est la prochaine. Le nom est d'avant le billet ; la vitrine, la
   * fiche et l'accueil le passent, il reste.
   */
  jourCourant: number;
  totalJours?: number;
  solde: string;
  /**
   * Le numéro de cycle, quand l'écran le connaît. Sans lui, pas de pastille :
   * l'accueil et l'encaissement écrivaient « Cycle 1 » en dur, et c'était faux
   * pour un client à sa deuxième carte.
   */
  cycle?: string;
  /**
   * Ce que la carte porte en pied quand elle est la carte choisie.
   *
   * Un nœud et non un libellé : la carte ne connaît ni les montants ni les
   * écritures. Elle réserve une place, l'écran décide ce qui s'y met.
   */
  action?: ReactNode;
  /** La case qu'on vient de payer, en vert de réussite le temps du geste. */
  neuve?: number;
  /** Ce qui se pose sur la carte, en haut à droite : le tampon d'un geste. */
  tampon?: ReactNode;
  /** Ce qui coiffe la carte au-dessus du nom : son rôle à l'écran. */
  surtitre?: ReactNode;
  /** « Solde restituable » ; « Rendu au client » une fois la carte close. */
  etiquetteSolde?: string;
  /**
   * La carte est close : aucune case n'attend plus de mise. Un retrait
   * anticipé clôt une carte à 4/31, et cercler sa cinquième case dirait
   * qu'elle attend encore quelque chose.
   */
  close?: boolean;
}

type EtatCase = 'payee' | 'neuve' | 'prochaine' | 'a-venir';

function etatDe(numero: number, jourCourant: number, neuve: number | undefined, close: boolean): EtatCase {
  if (numero === neuve) return 'neuve';
  if (numero <= jourCourant) return 'payee';
  if (numero === jourCourant + 1 && !close) return 'prochaine';
  return 'a-venir';
}

/** Chaque état porte sa bordure entière : deux largeurs dans une même classe
    laisseraient l'ordre de la feuille de style trancher. */
const CASES: Record<EtatCase, string> = {
  payee: 'border border-primary bg-primary',
  neuve: 'border border-positive bg-positive ring-2 ring-positive/25',
  prochaine: 'border-2 border-primary bg-surface',
  'a-venir': 'border border-trait/40 bg-canvas',
};

/**
 * La carte de collecte : le carnet papier que Kolek remplace, dessiné en billet.
 *
 * ## Ce qui a changé le 2026-10-02
 *
 * Elle portait le dégradé vert-bleu-violet du gabarit d'origine, deux cercles
 * décoratifs et des pastilles de verre dépoli. Rien de tout cela ne disait
 * l'argent ; tout cela disait « maquette ». Elle devient un billet : du papier,
 * un filet, une bande guillochée sur le bord haut — la gravure de la vitrine,
 * en vert coffre — et des chiffres de caisse.
 *
 * Le nombre de cases n'est pas une valeur de maquette mais la règle du
 * produit, tenue par le moteur de calcul : d'où l'import de `MISES_PAR_CYCLE`.
 *
 * ## Pourquoi elle se mesure elle-même
 *
 * Le carrousel de la fiche la rend tantôt à 160 px, tantôt à toute la largeur.
 * La taille arrive par **requête de conteneur** : la seule chose qui compte est
 * la largeur que la carte reçoit. Les valeurs de base sont celles de la pleine
 * largeur, et c'est le format réduit qui s'écrit en `@max-[240px]:` : une
 * règle ignorée par un vieux WebView doit laisser la carte telle qu'en grand.
 *
 * ## Ce que la vitrine en montre
 *
 * `Telephone.tsx` la rend telle quelle dans le téléphone du hero. Le jour où
 * elle change, la vitrine change avec elle : c'est voulu.
 */
export function CarteCollecte({
  nomClient,
  misePar,
  jourCourant,
  totalJours = MISES_PAR_CYCLE,
  solde,
  cycle,
  action,
  neuve,
  tampon,
  surtitre,
  etiquetteSolde = 'Solde restituable',
  close = false,
}: Props) {
  const cases = Array.from({ length: totalJours }, (_, i) => i + 1);

  return (
    <div
      data-carte-collecte=""
      className="@container relative overflow-hidden rounded-xl border border-hairline bg-surface"
    >
      <Onde
        lignes={7}
        className="pointer-events-none absolute inset-x-0 top-0 h-2.5 w-full text-primary/30"
      />
      {tampon && <div className="absolute right-3 top-3.5 z-10">{tampon}</div>}

      <div className="relative px-4 pb-4 pt-5 @max-[240px]:px-3 @max-[240px]:pb-3 @max-[240px]:pt-4">
        {surtitre && <div className="mb-2.5">{surtitre}</div>}

        {/* En-tête. Côte à côte tant qu'il y a la place ; l'un sous l'autre
            quand la carte est réduite, où deux colonnes ne laisseraient au nom
            que quelques caractères. */}
        <div className="flex items-start justify-between gap-3 @max-[240px]:flex-col @max-[240px]:gap-1.5">
          <div className="min-w-0">
            <p className="font-headings text-xl font-bold leading-tight text-ink @max-[240px]:text-base">
              {nomClient}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5 text-xs">
              <p className="font-body text-muted-foreground">Mise / jour</p>
              <p className="font-mono font-medium text-ink tabular-nums">
                {misePar} <span className="font-body font-normal text-muted-foreground">FCFA</span>
              </p>
            </div>
          </div>
          {cycle !== undefined && (
            <span className="shrink-0 rounded-pill border border-hairline px-2.5 py-0.5 font-body text-xs text-muted-foreground">
              Cycle {cycle}
            </span>
          )}
        </div>

        {/* Les cases du cycle. Huit colonnes en format réduit : seize cases
            sur 136 px donneraient des traits de 6 px, où l'on ne distingue plus
            la case payée de la case à payer. */}
        <div className="mt-4 grid grid-cols-16 gap-1 @max-[240px]:mt-3 @max-[240px]:grid-cols-8 @max-[240px]:gap-0.5">
          {cases.map((numero) => {
            const etat = etatDe(numero, jourCourant, neuve, close);
            return (
              <span
                key={numero}
                data-etat={etat}
                className={`h-4.5 rounded-xs @max-[240px]:h-3 ${CASES[etat]}`}
              />
            );
          })}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3 @max-[240px]:mt-3 @max-[240px]:flex-col @max-[240px]:items-start @max-[240px]:gap-1">
          <div>
            <p className="font-body text-xs text-muted-foreground">{etiquetteSolde}</p>
            <p className="mt-1 font-mono text-2xl font-medium leading-none text-ink tabular-nums @max-[240px]:text-lg">
              {solde}{' '}
              <span className="font-body text-sm font-medium text-muted-foreground">FCFA</span>
            </p>
          </div>
          <p className="font-mono text-base font-medium text-ink tabular-nums @max-[240px]:text-sm">
            {jourCourant}/{totalJours}
          </p>
        </div>

        {/* La fente. Dans le flux, et non en calque : le solde est ce qu'on
            regarde avant d'agir, et un bouton posé par-dessus le masquerait au
            moment précis où il compte. La carte grandit. */}
        {action && <div className="mt-4 @max-[240px]:mt-2">{action}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4 : Voir passer**

```bash
npm test -w @kolek/ui -- src/CarteCollecte.test.tsx
npm test -w @kolek/ui
npm run typecheck -w @kolek/ui
```

Attendu : les 13 épreuves de la carte vertes, le paquet entier vert
(`CarrouselCartes.test.tsx` compris).

- [ ] **Step 5 : Faire passer la fiche au nouveau compteur**

```bash
npm test -w @kolek/collecteur -- src/ecrans/FicheClient.test.tsx
```

Attendu : rouges les épreuves qui lisent `20/31 j · 65 %`, `21/31 j · 68 %`
et `/22\/31 j/` (le compteur ne porte plus de pourcentage). C'est le seul
changement attendu : « Mise / jour » et `.closest('.rounded-xl')` tiennent.

Dans `apps/collecteur/src/ecrans/FicheClient.test.tsx`, remplacer chaque
`'20/31 j · 65 %'` par `'20/31'`, chaque `'21/31 j · 68 %'` par `'21/31'`, et
`screen.queryByText(/22\/31 j/)` par `screen.queryByText('22/31')` (Edit avec
`replace_all` pour les deux premiers). Puis :

```bash
npm test -w @kolek/collecteur -- src/ecrans/FicheClient.test.tsx
```

Attendu : vert.

- [ ] **Step 6 : Retirer le dégradé de la carte des jetons**

Dans `packages/core/src/tokens.ts`, dans `degrades`, supprimer la ligne :

```ts
  degradeCarte: 'linear-gradient(135deg, #8FC79E 0%, #6FA3C9 60%, #8A96C4 100%)',
```

et remplacer tout le commentaire au-dessus de `export const degrades` (de
`/**` à `*/`, qui commence par « Dégradés. Ils ne rentrent dans aucun espace
de noms Tailwind ») par :

```ts
/**
 * Dégradés. Ils ne rentrent dans aucun espace de noms Tailwind, donc aucune
 * classe n'en sort : ils sont exposés en variables libres et consommés par
 * `bg-[image:var(--degrade-zone-0)]` ou `bg-[image:var(--degrade-hero)]`.
 *
 * `degradeCarte`, le vert-bleu-violet de la carte de collecte, est parti le
 * 2026-10-02 avec le billet : la carte est désormais papier, filet et
 * gravure, et ne porte plus aucun dégradé. Les dégradés de zone servent
 * l'administration ; `degradeHero` sert la vitrine, l'en-tête de l'accueil du
 * collecteur et la bande de l'encaissement.
 */
```

Puis :

```bash
grep -rn "degrade-carte\|degradeCarte" packages apps --include=*.ts --include=*.tsx --include=*.css | grep -v node_modules
npm run generer:theme
npm run verifier:theme
npm test -w @kolek/core
```

Attendu : le `grep` ne rend que la phrase du commentaire de `tokens.ts` ;
`theme.css` régénéré sans `--degrade-carte` ; épreuves vertes.

- [ ] **Step 7 : La vitrine construit toujours, et sa carte a changé**

```bash
VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=sb_publishable_factice npm run build -w @kolek/site
npm test -w @kolek/site
grep -c "data-carte-collecte" apps/site/dist/index.html
```

Attendu : construction et épreuves vertes ; `1` (le téléphone du hero, rendu
dans la page prérendue).

- [ ] **Step 8 : Commit**

```bash
git add packages/ui/src/CarteCollecte.tsx packages/ui/src/CarteCollecte.test.tsx packages/core/src/tokens.ts packages/core/src/theme.css apps/collecteur/src/ecrans/FicheClient.test.tsx
git commit -m "feat(ui): la carte de collecte en billet, papier, gravure et chiffres de caisse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8 : Les vues pures du collecteur

**Files :**
- Modify : `apps/collecteur/src/hors-ligne/vues.ts`, `apps/collecteur/src/hors-ligne/vues.test.ts`
- Modify : `apps/collecteur/src/lectures.ts` (`TableauCollecteur`)
- Modify : `apps/collecteur/src/recherche.ts`, `apps/collecteur/src/recherche.test.ts`
- Modify : `apps/collecteur/src/ecrans/Clients.tsx` (emploie `correspondClient`)
- Create : `apps/collecteur/src/recu.ts`, `apps/collecteur/src/recu.test.ts`
- Modify : `apps/collecteur/src/ecrans/Recus.tsx:507`

**Interfaces :**
- Produces :
  - `TableauCollecteur.misesAujourdhui: number`
  - `cartesAEncaisser(t: Tournee): CarteAEncaisser[]` et `interface CarteAEncaisser { carteId; clientId; clientNom; marche: string | null; telephone: string | null; mise; misesEncaissees }`
  - `etatEnvoiMise(mise: { miseId: string; operationId: string }, etat: { operations: readonly Operation[]; refus: readonly RefusLocal[]; tournee: Tournee | null }): 'gardee' | 'envoyee' | 'refusee'`
  - `correspondClient(client: { nom: string; marche: string | null; telephone: string | null }, terme: string): boolean`
  - `numeroDeRecu(id: string): string`

- [ ] **Step 1 : Écrire les épreuves des vues**

Dans `apps/collecteur/src/hors-ligne/vues.test.ts`, ajouter `cartesAEncaisser,`
et `etatEnvoiMise,` à l'import depuis `./vues` (ordre alphabétique : après
`TourneeAbsente,` pour le premier, après `enAttenteSurCarte,` pour le second).

Dans le bloc `describe('l’accueil, calculé sur la tournée', …)`, après
l'épreuve « compte les clients, les cartes actives, l’encours et l’encaissé
depuis minuit », ajouter :

```ts
  it('compte les mises encaissées depuis minuit, commission comprise, comme le montant', () => {
    expect(tableauDepuis(T, MAINTENANT).misesAujourdhui).toBe(2);
  });
```

Puis, à la fin du fichier :

```ts
describe('les cartes de l’onglet « Encaisser »', () => {
  it('ne garde que les cartes actives qui ont encore une case à payer', () => {
    const t = tournee({
      clients: [client('c1', 'Awa'), client('c2', 'Bintou')],
      cartes: [
        carte('k1', 'c1', { misesEncaissees: 12 }),
        carte('k2', 'c2', { misesEncaissees: 31 }),
        carte('k3', 'c2', { misesEncaissees: 5, statut: 'cloturee' }),
      ],
    });
    expect(cartesAEncaisser(t).map((c) => c.carteId)).toEqual(['k1']);
  });

  it('joint le nom, le marché et le numéro du client', () => {
    const t = tournee({
      clients: [{ ...client('c1', 'Awa'), marche: 'Adjamé', telephone: '0700' }],
      cartes: [carte('k1', 'c1', { mise: 2000, misesEncaissees: 29 })],
    });
    expect(cartesAEncaisser(t)).toEqual([
      {
        carteId: 'k1',
        clientId: 'c1',
        clientNom: 'Awa',
        marche: 'Adjamé',
        telephone: '0700',
        mise: 2000,
        misesEncaissees: 29,
      },
    ]);
  });

  it('range les plus avancées d’abord, puis par nom à la française', () => {
    const t = tournee({
      clients: [client('c1', 'Zoé'), client('c2', 'Awa'), client('c3', 'Émile')],
      cartes: [
        carte('k1', 'c1', { misesEncaissees: 20 }),
        carte('k2', 'c2', { misesEncaissees: 20 }),
        carte('k3', 'c3', { misesEncaissees: 25 }),
      ],
    });
    expect(cartesAEncaisser(t).map((c) => c.clientNom)).toEqual(['Émile', 'Awa', 'Zoé']);
  });
});

/**
 * Où en est une mise qu'on vient d'écrire : ce que dit le tampon.
 *
 * Un tampon ENCAISSÉ sur une mise refusée mentirait, et un tampon ENCAISSÉ
 * sur une mise encore sur le téléphone aussi. Le doute penche vers GARDÉE :
 * c'est l'état qui ne promet rien.
 */
describe('l’état d’envoi d’une mise qu’on vient d’écrire', () => {
  const ECRITE = { miseId: 'mise-1', operationId: 'op-1' };

  it('est gardée tant que l’opération attend dans la file', () => {
    const operations = [operationMise(1, { carteId: 'k1' })];
    expect(etatEnvoiMise(ECRITE, { operations, refus: [], tournee: tournee() })).toBe('gardee');
  });

  it('est refusée quand le serveur l’a refusée, à consigner ou consignée', () => {
    const aConsigner = [operationMise(1, { carteId: 'k1' }, { etat: 'refusee_a_consigner' })];
    expect(etatEnvoiMise(ECRITE, { operations: aConsigner, refus: [], tournee: tournee() })).toBe(
      'refusee',
    );

    const refus: RefusLocal[] = [
      {
        id: 'op-1',
        motif: 'DOUBLON',
        chargeUtile: chargeUtileDe(operationMise(1, { carteId: 'k1' })),
        creeLe: INSTANT,
      },
    ];
    expect(etatEnvoiMise(ECRITE, { operations: [], refus, tournee: tournee() })).toBe('refusee');
  });

  it('est envoyée quand l’opération a quitté la file et que la mise est dans la tournée', () => {
    const t = tournee({ mises: [mise('mise-1', 'k1', INSTANT)] });
    expect(etatEnvoiMise(ECRITE, { operations: [], refus: [], tournee: t })).toBe('envoyee');
  });

  it('reste gardée tant que l’écran n’a pas relu la file après l’écriture', () => {
    expect(etatEnvoiMise(ECRITE, { operations: [], refus: [], tournee: tournee() })).toBe('gardee');
    expect(etatEnvoiMise(ECRITE, { operations: [], refus: [], tournee: null })).toBe('gardee');
  });
});
```

`operationMise(1, …)` porte l'identifiant d'opération `op-1` et la mise
`mise-1` (`hors-ligne/fabriques.ts`). `chargeUtileDe`, `RefusLocal`,
`INSTANT`, `mise`, `tournee`, `client`, `carte` sont déjà importés ou déclarés
en tête du fichier.

- [ ] **Step 2 : Écrire les épreuves de la recherche et du reçu**

Dans `apps/collecteur/src/recherche.test.ts`, remplacer l'import
`import { nu } from './recherche';` par
`import { correspondClient, nu } from './recherche';`, puis ajouter à la fin :

```ts
/**
 * La règle de l'écran Clients, déplacée ici le 2026-10-02 : l'onglet
 * « Encaisser » cherche une carte par les mêmes trois clefs. Deux règles
 * voisines finiraient par diverger, et le collecteur ne retrouverait pas au
 * même endroit le même client.
 */
describe('correspondClient', () => {
  const AWA = { nom: 'Awa Traoré', marche: 'Adjamé', telephone: '+225 07 08 09 10 11' };

  it('trouve par le nom, sans accent ni majuscule', () => {
    expect(correspondClient(AWA, 'traore')).toBe(true);
  });

  it('trouve par le marché', () => {
    expect(correspondClient(AWA, 'adjame')).toBe(true);
  });

  it('trouve par les chiffres du numéro, quelle que soit leur mise en forme', () => {
    expect(correspondClient(AWA, '0708')).toBe(true);
  });

  it('laisse passer tout le monde sur un terme vide', () => {
    expect(correspondClient(AWA, '')).toBe(true);
  });

  it('écarte ce qui ne correspond à rien', () => {
    expect(correspondClient(AWA, 'bintou')).toBe(false);
  });

  it('tient un client sans marché ni numéro', () => {
    expect(correspondClient({ nom: 'Ka', marche: null, telephone: null }, '07')).toBe(false);
  });
});
```

Créer `apps/collecteur/src/recu.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { numeroDeRecu } from './recu';

describe('le numéro de reçu', () => {
  it('prend les huit premiers signes de l’identifiant, en capitales', () => {
    expect(numeroDeRecu('abcdef1234')).toBe('ABCDEF12');
  });
});
```

- [ ] **Step 3 : Les voir échouer**

```bash
npm test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts src/recherche.test.ts src/recu.test.ts
```

Attendu : `vues.test.ts` rouge (`cartesAEncaisser is not a function`, et
`misesAujourdhui` indéfini) ; `recherche.test.ts` rouge
(`correspondClient is not a function`) ; `recu.test.ts` échoue à l'import.

- [ ] **Step 4 : `misesAujourdhui`**

Dans `apps/collecteur/src/lectures.ts`, dans `interface TableauCollecteur`,
après la ligne `encaisseAujourdhui: number;`, ajouter :

```ts
  /** Les mises qui font ce montant : le « 23 mises » de l'en-tête. */
  misesAujourdhui: number;
```

Dans `apps/collecteur/src/hors-ligne/vues.ts`, dans `tableauDepuis`,
remplacer :

```ts
  const versements = versementsDe(registreDe(t));
  const encaisseAujourdhui = versements
    .filter((m) => Date.parse(m.survenuLe) >= minuit.getTime())
    .reduce((somme, m) => somme + m.montant, 0);
```

par :

```ts
  const versements = versementsDe(registreDe(t));
  const duJour = versements.filter((m) => Date.parse(m.survenuLe) >= minuit.getTime());
  const encaisseAujourdhui = duJour.reduce((somme, m) => somme + m.montant, 0);
```

et, dans l'objet rendu, après `encaisseAujourdhui,`, ajouter
`misesAujourdhui: duJour.length,`.

- [ ] **Step 5 : `cartesAEncaisser` et `etatEnvoiMise`**

Dans `apps/collecteur/src/hors-ligne/vues.ts`, remplacer la première ligne :

```ts
import { argentTenu, formatMontant, mouvementsDepuis, soldeRestituable, versementsDe } from '@kolek/core';
```

par :

```ts
import {
  MISES_PAR_CYCLE,
  argentTenu,
  formatMontant,
  mouvementsDepuis,
  soldeRestituable,
  versementsDe,
} from '@kolek/core';
```

Puis, juste après la fonction `listeDepuis`, ajouter :

```ts
/** Une carte que l'onglet « Encaisser » propose, avec ce qu'il faut pour la reconnaître. */
export interface CarteAEncaisser {
  carteId: string;
  clientId: string;
  clientNom: string;
  marche: string | null;
  telephone: string | null;
  mise: number;
  misesEncaissees: number;
}

/**
 * Les cartes de l'onglet « Encaisser », la plus avancée d'abord.
 *
 * Jusqu'au 2026-10-02, l'onglet ouvert sans carte disait « Aucune carte
 * choisie » et renvoyait vers Clients : une impasse sur le geste que le
 * collecteur fait trente fois par jour. Il propose maintenant les cartes
 * elles-mêmes, tirées de la tournée du téléphone : la liste marche hors ligne,
 * sans lecture nouvelle.
 *
 * Une carte pleine n'y figure pas : elle n'a plus de case à payer, elle
 * relève du retrait. À égalité d'avancement, l'ordre est celui des noms, à la
 * française, puis des identifiants : il ne change pas d'un rendu à l'autre.
 */
export function cartesAEncaisser(t: Tournee): CarteAEncaisser[] {
  const clients = new Map(t.clients.map((c) => [c.id, c]));
  return t.cartes
    .filter((k) => k.statut === 'active' && k.misesEncaissees < MISES_PAR_CYCLE)
    .map((k) => {
      const client = clients.get(k.clientId);
      return {
        carteId: k.id,
        clientId: k.clientId,
        clientNom: client?.nom ?? 'Client',
        marche: client?.marche ?? null,
        telephone: client?.telephone ?? null,
        mise: k.mise,
        misesEncaissees: k.misesEncaissees,
      };
    })
    .sort(
      (a, b) =>
        b.misesEncaissees - a.misesEncaissees ||
        a.clientNom.localeCompare(b.clientNom, 'fr') ||
        parId({ id: a.carteId }, { id: b.carteId }),
    );
}
```

Puis, juste après la fonction `phraseAttenteCarte`, ajouter :

```ts
export type EtatEnvoiMise = 'gardee' | 'envoyee' | 'refusee';

/**
 * Où en est une mise qu'on vient d'écrire : c'est ce que dit le tampon.
 *
 * Une mise en attente est **déjà** dans la tournée du téléphone (`appliquer`
 * l'y ajoute) : la tournée seule ne distingue donc pas l'envoyée de la
 * gardée. C'est la file qui tranche. L'opération y est : elle attend, ou elle
 * a été refusée. Elle n'y est plus et la mise est dans la tournée : elle est
 * partie, et l'instantané l'a reçue. Elle n'y est plus et la mise n'est pas
 * dans la tournée : l'écran n'a pas encore relu le téléphone depuis
 * l'écriture, et le doute penche vers GARDÉE, l'état qui ne promet rien.
 */
export function etatEnvoiMise(
  mise: { miseId: string; operationId: string },
  {
    operations,
    refus,
    tournee,
  }: { operations: readonly Operation[]; refus: readonly RefusLocal[]; tournee: Tournee | null },
): EtatEnvoiMise {
  const operation = operations.find((o) => o.id === mise.operationId);
  if (operation) return operation.etat === 'en_attente' ? 'gardee' : 'refusee';
  if (refus.some((r) => r.id === mise.operationId)) return 'refusee';
  if (tournee?.mises.some((m) => m.id === mise.miseId)) return 'envoyee';
  return 'gardee';
}
```

- [ ] **Step 6 : `correspondClient`, déplacé de l'écran Clients**

Dans `apps/collecteur/src/recherche.ts`, ajouter à la fin :

```ts
/** Les chiffres seuls, séparateurs et indicatifs de mise en forme retirés. */
function chiffres(texte: string): string {
  return texte.replace(/\D/g, '');
}

/**
 * Les trois clefs d'un client, dans l'ordre où le collecteur s'en sert : le
 * nom, le marché, le numéro.
 *
 * Le nom seul ne suffisait pas : il s'écrit de plusieurs façons, il se
 * prononce autrement qu'il ne s'écrit, et deux clients d'un même marché le
 * partagent. Le numéro, lui, est exact ; il s'écrit « 07 08 09 10 11 » dans la
 * fiche et se tape « 0708 » dans la recherche, d'où la comparaison des
 * chiffres aux chiffres. Le marché est ce qui organise la tournée.
 *
 * Écrite dans `Clients.tsx` ; déplacée ici le 2026-10-02 pour servir aussi à
 * l'onglet « Encaisser ».
 */
export function correspondClient(
  client: { nom: string; marche: string | null; telephone: string | null },
  terme: string,
): boolean {
  if (!terme) return true;
  const cherche = nu(terme);

  if (nu(client.nom).includes(cherche)) return true;
  if (client.marche !== null && nu(client.marche).includes(cherche)) return true;

  if (client.telephone !== null) {
    if (nu(client.telephone).includes(cherche)) return true;
    const chiffresCherches = chiffres(terme);
    if (chiffresCherches && chiffres(client.telephone).includes(chiffresCherches)) return true;
  }

  return false;
}
```

Dans `apps/collecteur/src/ecrans/Clients.tsx` :
1. supprimer le bloc de commentaire `/** Les trois clefs d'un client… */`, la
   fonction `correspond`, le commentaire `/* \`nu\` vit dans \`../recherche\`… */`
   et la fonction `chiffres` (lignes 81 à 117 environ, de la ligne
   `* Les trois clefs d'un client, dans l'ordre où le collecteur s'en sert.`
   jusqu'à la fermeture de `function chiffres`) ;
2. remplacer chaque appel `correspond(l.client, terme)` par
   `correspondClient(l.client, terme)` ;
3. remplacer `import { nu } from '../recherche';` par
   `import { correspondClient } from '../recherche';`.

Contrôle :

```bash
grep -n "correspond\|chiffres(\| nu(" apps/collecteur/src/ecrans/Clients.tsx
```

Attendu : seulement les deux appels `correspondClient(` et l'import ; plus
aucun `nu(` ni `chiffres(`. S'il restait un `nu(` ailleurs dans le fichier,
garder `nu` dans l'import.

- [ ] **Step 7 : `numeroDeRecu`, extrait des reçus**

Créer `apps/collecteur/src/recu.ts` :

```ts
/**
 * Le numéro d'un reçu : les huit premiers signes de l'identifiant de la mise,
 * en capitales.
 *
 * L'identifiant est fabriqué sur le téléphone au moment de l'encaissement,
 * et devient celui de la ligne au serveur : le numéro existe donc dès le
 * geste, hors ligne compris. Écrit dans `Recus.tsx` ; extrait le 2026-10-02
 * pour que l'encaissement montre le même numéro que la liste des reçus.
 */
export function numeroDeRecu(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
```

Dans `apps/collecteur/src/ecrans/Recus.tsx`, remplacer
`{evenement.id.slice(0, 8).toUpperCase()}` par `{numeroDeRecu(evenement.id)}`
et ajouter en tête, avec les autres imports relatifs :
`import { numeroDeRecu } from '../recu';`.

- [ ] **Step 8 : Voir passer, et rien d'autre casser**

```bash
npm test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts src/recherche.test.ts src/recu.test.ts src/ecrans/Clients.test.tsx src/ecrans/Recus.test.tsx
```

Attendu : tout vert, dont les épreuves de recherche de `Clients.test.tsx` et
« montre le numéro de reçu d’un versement » de `Recus.test.tsx`.

- [ ] **Step 9 : Commit**

```bash
git add apps/collecteur/src/hors-ligne/vues.ts apps/collecteur/src/hors-ligne/vues.test.ts apps/collecteur/src/lectures.ts apps/collecteur/src/recherche.ts apps/collecteur/src/recherche.test.ts apps/collecteur/src/recu.ts apps/collecteur/src/recu.test.ts apps/collecteur/src/ecrans/Clients.tsx apps/collecteur/src/ecrans/Recus.tsx
git commit -m "feat(collecteur): les vues du billet, cartes a encaisser et etat d'envoi d'une mise

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9 : L'accueil, structure B

**Files :**
- Modify (réécriture) : `apps/collecteur/src/ecrans/Accueil.tsx`
- Modify : `apps/collecteur/src/ecrans/Accueil.test.tsx`
- Modify : `apps/collecteur/src/Coquille.tsx:341` (plus de `onDeconnexion` pour l'accueil)

**Interfaces :**
- Consumes : `CarteCollecte` (`surtitre`, `action`, sans `cycle`), `Outils`, `Bouton` (`nomAccessible`, `icone="banknote"`), `Onde`, `Rosace`, `TableauCollecteur.misesAujourdhui` (tâche 8).
- Produces : `Accueil({ nomCollecteur, revision, onNaviguer, onSouscrire, onEncaisser, onOuvrirFiche })` — **`onDeconnexion` disparaît**. Le bouton d'encaissement de la carte s'appelle `Encaisser <mise> FCFA sur la carte de <nom>`.

- [ ] **Step 1 : Adapter le banc d'essai et écrire les épreuves**

Dans `apps/collecteur/src/ecrans/Accueil.test.tsx` :

1. Remplacer la première ligne, `import { cleanup, fireEvent, render, screen } from '@testing-library/react';`, par :

```ts
import { formatMontant } from '@kolek/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
```

2. Après la ligne `vi.mock('../hors-ligne/useHorsLigne', () => ({ useHorsLigne: () => etatHorsLigne }));`, ajouter :

```ts
// Le profil décide d'un outil (« Équipe ») : il se règle ici plutôt que par
// une lecture du téléphone que ce banc ne simule pas.
let estTitulaire = false;
vi.mock('./commission', () => ({ useEstTitulaire: () => estTitulaire }));
```

3. Dans `TABLEAU`, après `encaisseAujourdhui: 5000,`, ajouter `misesAujourdhui: 1,`.

4. Dans le `beforeEach`, ajouter `estTitulaire = false;`.

5. Dans `rendre`, supprimer la ligne `onDeconnexion={vi.fn()}`.

6. Dans l'épreuve « encaisse sur la carte affichée, et non sur une liste à
   parcourir », remplacer le commentaire et le clic :

```ts
    // Le nom complet, et non « Encaisser » : la grille de raccourcis porte une
    // pastille du même libellé, qui ouvre la liste des clients. Deux commandes
    // homonymes sur un écran, c'est un piège pour le test comme pour l'oreille.
    fireEvent.click(
      await screen.findByRole('button', { name: 'Encaisser sur la carte de Mariam' }),
    );
```

par :

```ts
    // Le nom complet, montant compris : la barre du bas porte une touche
    // « Encaisser » qui ouvre la liste des cartes. Deux commandes homonymes sur
    // un écran, c'est un piège pour le test comme pour l'oreille.
    fireEvent.click(
      await screen.findByRole('button', {
        name: /^Encaisser 5\s000 FCFA sur la carte de Mariam$/,
      }),
    );
```

7. Dans l'épreuve « ne propose aucune commande quand il n’y a pas de carte »,
   remplacer `{ name: /^Encaisser sur la carte/ }` par `{ name: /sur la carte de/ }`.
   L'ancienne expression ne peut plus rien trouver, même à tort : l'épreuve
   passerait sans rien vérifier.

8. Dans l'épreuve « dit une fois par lancement que le stockage n’est pas
   garanti », remplacer :

```ts
    expect(await screen.findByRole('button', { name: 'Encaisser sur la carte de Mariam' })).toBeTruthy();
```

par :

```ts
    expect(await screen.findByRole('button', { name: /sur la carte de Mariam$/ })).toBeTruthy();
```

9. Ajouter à la fin du fichier :

```ts
/** Attendre que le tableau soit lu : la carte et ses commandes en dépendent. */
async function tableauLu() {
  await screen.findByRole('button', { name: /sur la carte de Mariam$/ });
}

describe('l’en-tête du billet', () => {
  it('dit le total du jour et le nombre de mises qui le font', async () => {
    chargerTableauCollecteur.mockResolvedValue({ ...TABLEAU, misesAujourdhui: 3 });
    rendre();
    await tableauLu();
    expect(screen.getByText(/^Encaissé aujourd’hui/).textContent).toBe(
      'Encaissé aujourd’hui · 3 mises',
    );
  });

  it('accorde « mise » au singulier', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(screen.getByText(/^Encaissé aujourd’hui/).textContent).toBe(
      'Encaissé aujourd’hui · 1 mise',
    );
  });

  it('pose les trois chiffres en relevé, nommés', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(screen.getAllByRole('term').map((t) => t.textContent)).toEqual([
      'Clients',
      'Cartes actives',
      'Encours, FCFA',
    ]);
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual([
      '3',
      '2',
      formatMontant(120000),
    ]);
  });

  it('ne porte plus de bouton de déconnexion : il vit dans le profil', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(screen.queryByRole('button', { name: 'Se déconnecter' })).toBeNull();
  });

  it('mène au profil par l’avatar', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    const onNaviguer = vi.fn();
    rendre({ onNaviguer });
    await tableauLu();
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir mon profil' }));
    expect(onNaviguer).toHaveBeenCalledWith('profil');
  });
});

describe('la carte à finir en premier', () => {
  /**
   * Le titre existe depuis le 2026-08-23 : un collecteur a cru que son compte
   * appartenait au client affiché. La maquette B l'avait perdu ; il vit
   * désormais dans la carte, au-dessus du nom.
   */
  it('dit ce qu’elle est, pour qu’on ne la prenne pas pour le compte', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(screen.getByText(/^À finir en premier/).textContent).toBe(
      'À finir en premier · la plus avancée de tes 2 cartes actives',
    );
  });

  it('mène à toutes les cartes', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    const onNaviguer = vi.fn();
    rendre({ onNaviguer });
    await tableauLu();
    fireEvent.click(screen.getByRole('button', { name: 'Toutes les cartes' }));
    expect(onNaviguer).toHaveBeenCalledWith('clients');
  });

  it('ne dit pas de cycle qu’elle ne connaît pas', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(screen.queryByText(/^Cycle/)).toBeNull();
  });
});

describe('les outils', () => {
  function outils() {
    return within(screen.getByRole('region', { name: 'Outils' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
  }

  it('rangent les écrans, sans Encaisser ni Bilan que la barre porte déjà', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(outils()).toEqual(['Souscrire', 'Retrait', 'Rapprochement', 'Reçus', 'Alertes', 'Avis', 'Plus']);
  });

  it('ajoutent l’équipe pour le titulaire', async () => {
    estTitulaire = true;
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    rendre();
    await tableauLu();
    expect(outils()).toEqual([
      'Souscrire',
      'Retrait',
      'Rapprochement',
      'Reçus',
      'Alertes',
      'Avis',
      'Équipe',
      'Plus',
    ]);
  });

  it('mènent où on les touche', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    const onNaviguer = vi.fn();
    const onSouscrire = vi.fn();
    rendre({ onNaviguer, onSouscrire });
    await tableauLu();
    fireEvent.click(screen.getByRole('button', { name: 'Rapprochement' }));
    fireEvent.click(screen.getByRole('button', { name: 'Souscrire' }));
    expect(onNaviguer).toHaveBeenCalledWith('rapprochement');
    expect(onSouscrire).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2 : Les voir échouer**

```bash
npm test -w @kolek/collecteur -- src/ecrans/Accueil.test.tsx
```

Attendu : rouges toutes les épreuves de « l’en-tête du billet », des
« outils », « encaisse sur la carte affichée » (le bouton s'appelle encore
« Encaisser sur la carte de Mariam »), et deux de « la carte à finir en
premier » : le surtitre, et le cycle (l'ancien écran passe `cycle="1"`).
« mène à toutes les cartes » passe déjà : l'ancien lien `LienBloc` portait
le même nom, l'épreuve garde le chemin. Les épreuves de la file (§8.2, §8.4,
§8.7, §8.8) et « ne propose aucune commande » restent vertes.

- [ ] **Step 3 : Réécrire l'accueil**

Remplacer tout le contenu de `apps/collecteur/src/ecrans/Accueil.tsx` par :

```tsx
import { formatMontant } from '@kolek/core';
import {
  Avatar,
  BandeauHorsLigne,
  Bouton,
  Carte,
  CarteCollecte,
  Onde,
  Outils,
  Rosace,
  Squelette,
  useEnLigne,
  type Outil,
} from '@kolek/ui';
import { useEffect, useState } from 'react';

import { useDonnees } from '../cache';
import type { CarteChoisie, Page } from '../Coquille';
import { useHorsLigne } from '../hors-ligne/useHorsLigne';
import { phraseAttenteLongue } from '../hors-ligne/vues';
import { chargerTableauCollecteur } from '../lectures';
import { usePremierRendu } from '../premier-rendu';
import { useEstTitulaire } from './commission';

/**
 * L'avertissement du stockage non garanti se dit une fois par lancement (spec
 * J2b §8.7). Répété à chaque retour sur l'accueil, il deviendrait un décor
 * qu'on ne lit plus ; `Plus` le garde en permanence pour qui le cherche.
 */
let stockageDejaSignale = false;

/**
 * Écran d'accueil du collecteur, dans le dessin du billet (2026-10-02).
 *
 * ## Ce qu'il montre, dans l'ordre
 *
 * L'en-tête sombre de la vitrine — la nuit d'un coffre, la rosace en
 * filigrane, l'onde en pied — porte la journée : le total encaissé, le nombre
 * de mises qui le font, et trois chiffres de référence en relevé. La carte à
 * finir en premier vient se poser dessus, avec ses deux commandes. Puis les
 * messages de la file, puis les outils.
 *
 * Ce qu'on fait avant ce qu'on a fait : l'historique est dans « Reçus ».
 *
 * ## Ce qui en est parti
 *
 * Les neuf tuiles pastel (`ActionsRapides`), les trois chiffres en trois cases
 * égales, la rosace qui tournait sans rien dire, et le bouton de déconnexion :
 * il vit dans le profil, où l'avatar mène.
 *
 * ## Ce qui ne change pas
 *
 * Tout vient de la tournée du téléphone, et ce qui n'est pas calculable n'est
 * pas affiché. L'écran a porté les chiffres de la maquette ; depuis que le
 * collecteur encaisse pour de vrai, un montant inventé ici est un montant
 * qu'il peut prendre pour sa recette du jour.
 */
export function Accueil({
  nomCollecteur,
  revision,
  onNaviguer,
  onSouscrire,
  onEncaisser,
  onOuvrirFiche,
}: {
  nomCollecteur: string | null;
  revision: number;
  onNaviguer: (cle: Page) => void;
  onSouscrire: () => void;
  /** Encaisser sur la carte affichée, sans passer par la liste. */
  onEncaisser: (carte: CarteChoisie) => void;
  /** Ouvrir la fiche du client de la carte affichée. */
  onOuvrirFiche: (clientId: string) => void;
}) {
  const enLigne = useEnLigne();
  const estTitulaire = useEstTitulaire();
  const { file, stockage } = useHorsLigne();
  const attenteLongue = phraseAttenteLongue(file, Date.now());
  const refusees = file?.refusees ?? 0;
  const [avisStockage, setAvisStockage] = useState(false);

  useEffect(() => {
    if (stockage !== 'non_garanti' || stockageDejaSignale) return;
    stockageDejaSignale = true;
    setAvisStockage(true);
  }, [stockage]);

  const { donnees: tableau, erreur } = useDonnees('accueil', chargerTableauCollecteur, {
    revision,
    messageErreur:
      'Chiffres indisponibles sur ce téléphone. Connecte-toi une fois au réseau pour charger ta tournée.',
  });

  const carteDuJour = tableau?.carteDuJour ?? null;
  const premier = usePremierRendu();
  const nom = nomCollecteur ?? 'Collecteur';
  const chiffre = (valeur: number | undefined) => (tableau ? formatMontant(valeur ?? 0) : '—');
  const actives = tableau?.cartesActives ?? 0;
  const s = (n: number) => (n > 1 ? 's' : '');

  const outils: Outil[] = [
    { icone: 'user-plus', libelle: 'Souscrire', onActiver: onSouscrire },
    { icone: 'arrow-up-right', libelle: 'Retrait', onActiver: () => onNaviguer('retrait') },
    { icone: 'scale', libelle: 'Rapprochement', onActiver: () => onNaviguer('rapprochement') },
    { icone: 'receipt-text', libelle: 'Reçus', onActiver: () => onNaviguer('recus') },
    { icone: 'bell', libelle: 'Alertes', onActiver: () => onNaviguer('alertes') },
    { icone: 'message-square', libelle: 'Avis', onActiver: () => onNaviguer('avis') },
    // Seul le titulaire d'un palier illimité a une équipe : pour les autres,
    // l'outil mènerait à un écran vide.
    ...(estTitulaire
      ? [{ icone: 'users' as const, libelle: 'Équipe', onActiver: () => onNaviguer('equipe') }]
      : []),
    { icone: 'more-horizontal', libelle: 'Plus', onActiver: () => onNaviguer('plus') },
  ];

  const releve: Array<[string, string]> = [
    ['Clients', tableau ? String(tableau.clients) : '—'],
    ['Cartes actives', tableau ? String(tableau.cartesActives) : '—'],
    ['Encours, FCFA', chiffre(tableau?.encoursTotal)],
  ];

  return (
    <div className="anim-entree flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-large">
      <header className="relative overflow-hidden bg-[image:var(--degrade-hero)] px-marge pb-16 pt-entete lg:rounded-xl lg:pt-6">
        {/* La gravure, en or : la seule place de l'or dans cet écran. La rosace
            ne tourne plus — un filigrane qui bouge n'en est plus un. */}
        <Rosace
          petales={22}
          excentricite={0.38}
          className="pointer-events-none absolute -right-24 -top-10 w-72 text-or/15"
        />
        <Onde
          lignes={10}
          traitFixe
          className="pointer-events-none absolute inset-x-0 bottom-10 h-6 w-full text-or/25"
        />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate font-headings text-2xl font-bold tracking-tight text-white">
            {nom}
          </p>
          <button
            type="button"
            onClick={() => onNaviguer('profil')}
            aria-label="Ouvrir mon profil"
            className="anim-pression shrink-0 cursor-pointer rounded-pill"
          >
            <Avatar nom={nom} className="h-10 w-10 ring-2 ring-white/25" />
          </button>
        </div>

        <p className="relative z-10 mt-6 font-body text-sm text-white/70">
          Encaissé aujourd’hui
          {tableau && (
            <>
              {' · '}
              <span className="font-mono">{tableau.misesAujourdhui}</span> mise
              {s(tableau.misesAujourdhui)}
            </>
          )}
        </p>
        <p className="anim-montant relative z-10 mt-2 font-headings text-4xl font-bold leading-none tracking-tight text-white tabular-nums xs:text-total">
          {chiffre(tableau?.encaisseAujourdhui)}{' '}
          <span className="font-body text-base font-medium tracking-normal text-white/70">FCFA</span>
        </p>

        {/* Le relevé : trois chiffres de référence, alignés à gauche, séparés
            par des filets. Plus trois cases égales : elles faisaient lire trois
            fois la même importance à trois chiffres qui n'en ont pas. */}
        <dl className="relative z-10 mt-5 flex border-t border-white/15 pt-3">
          {releve.map(([terme, valeur], rang) => (
            <div
              key={terme}
              className={`flex min-w-0 flex-col-reverse ${rang > 0 ? 'ml-3.5 border-l border-white/15 pl-3.5' : ''}`}
            >
              <dt className="mt-0.5 font-body text-xs text-white/60">{terme}</dt>
              <dd className="truncate font-mono text-base font-medium text-white tabular-nums">
                {valeur}
              </dd>
            </div>
          ))}
        </dl>

        {/* Toujours rendu : il se tait seul quand la file est vide et le réseau
            là (§8.2). */}
        <BandeauHorsLigne enLigne={enLigne} compte={file} className="relative z-10 mt-4" />
      </header>

      <div className="relative z-20 mx-4 -mt-12 lg:mx-0">
        {carteDuJour ? (
          <CarteCollecte
            nomClient={carteDuJour.nom}
            misePar={formatMontant(carteDuJour.mise)}
            jourCourant={carteDuJour.misesEncaissees}
            solde={formatMontant(carteDuJour.solde)}
            surtitre={
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 font-body text-xs font-semibold text-muted-foreground">
                  À finir en premier · la plus avancée de tes {actives} carte{s(actives)} active
                  {s(actives)}
                </p>
                <button
                  type="button"
                  onClick={() => onNaviguer('clients')}
                  className="shrink-0 cursor-pointer font-body text-xs font-semibold text-primary underline underline-offset-2"
                >
                  Toutes les cartes
                </button>
              </div>
            }
            action={
              <div className="flex gap-2">
                <Bouton
                  icone="banknote"
                  className="flex-1"
                  nomAccessible={`Encaisser ${formatMontant(carteDuJour.mise)} FCFA sur la carte de ${carteDuJour.nom}`}
                  onClick={() =>
                    onEncaisser({
                      carteId: carteDuJour.carteId,
                      clientNom: carteDuJour.nom,
                      mise: carteDuJour.mise,
                      misesEncaissees: carteDuJour.misesEncaissees,
                    })
                  }
                >
                  Encaisser {formatMontant(carteDuJour.mise)}
                </Bouton>
                <Bouton
                  variante="contour"
                  nomAccessible={`Ouvrir la fiche de ${carteDuJour.nom}`}
                  onClick={() => onOuvrirFiche(carteDuJour.clientId)}
                >
                  Fiche
                </Bouton>
              </div>
            }
          />
        ) : !tableau ? (
          <Carte className="space-y-3 p-5">
            <div className="flex justify-between">
              <Squelette hauteur="h-5" largeur="w-24" />
              <Squelette hauteur="h-5" largeur="w-20" />
            </div>
            <Squelette hauteur="h-10" largeur="w-full" />
            <div className="flex justify-between pt-2">
              <Squelette hauteur="h-6" largeur="w-32" />
              <Squelette hauteur="h-4" largeur="w-16" />
            </div>
          </Carte>
        ) : (
          <Carte className="p-4">
            <p className="m-0 font-body text-base text-ink">Aucune carte active.</p>
            <p className="mt-1 font-body text-sm text-muted-foreground">
              Inscris un client pour ouvrir sa première carte.
            </p>
          </Carte>
        )}
      </div>

      {erreur && (
        <p role="alert" className="mx-4 mt-3 font-body text-sm text-negative">
          {erreur}
        </p>
      )}

      {/* Ce que la file demande au collecteur. Rien ici ne bloque un geste : un
          refus se lit dans les alertes, l'attente longue et le stockage se
          règlent en retrouvant du réseau (spec J2b §8.4, §8.7, §8.8). */}
      {(attenteLongue || refusees > 0 || avisStockage) && (
        <div className="mx-4 mt-3 space-y-2">
          {attenteLongue && (
            <p role="alert" className="rounded-md bg-negative-tint p-3 font-body text-sm text-negative">
              {attenteLongue}
            </p>
          )}
          {refusees > 0 && (
            <button
              type="button"
              onClick={() => onNaviguer('alertes')}
              className="anim-pression w-full cursor-pointer rounded-md border border-negative bg-surface p-3 text-left font-body text-sm font-medium text-negative"
            >
              {`${refusees} opération${s(refusees)} refusée${s(refusees)}, à voir`}
            </button>
          )}
          {avisStockage && (
            <p className="rounded-md bg-info-tint p-3 font-body text-sm text-info">
              Ce téléphone peut effacer les données de Kolek s’il manque de place. Garde
              l’application installée et envoie dès que possible.
            </p>
          )}
        </div>
      )}

      <section aria-labelledby="titre-outils" className="mx-4 mt-6 lg:mx-0">
        <h2 id="titre-outils" className="mb-3 font-headings text-xl font-bold text-ink">
          Outils
        </h2>
        <Outils outils={outils} anime={premier} />
      </section>

      <div className="min-h-6 flex-1" />
    </div>
  );
}
```

Avant d'enregistrer, comparer avec l'ancien fichier (`git show HEAD:apps/collecteur/src/ecrans/Accueil.tsx`)
les trois textes de la file (attente longue, refus, stockage) : ils doivent
être identiques, au caractère près, à ceux qu'il rendait. Les épreuves §8.4,
§8.7 et §8.8 les lisent.

- [ ] **Step 4 : Retirer la déconnexion de l'accueil dans la coquille**

Dans `apps/collecteur/src/Coquille.tsx`, dans le rendu `{page === 'accueil' && (<Accueil … />)}`,
supprimer la ligne `onDeconnexion={deconnecter}` (la seule de ce bloc ; les
autres écrans gardent la leur).

- [ ] **Step 5 : Voir passer**

```bash
npm test -w @kolek/collecteur -- src/ecrans/Accueil.test.tsx src/Coquille.test.tsx
VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=sb_publishable_factice npm run build -w @kolek/collecteur
npm run verifier:contraste
npm run verifier:tirets
```

Attendu : vert ; la construction type le collecteur (une propriété
`onDeconnexion` oubliée serait une erreur de compilation) ; les deux gardes
passent (`text-white/60` est le plancher que `verifier:contraste` accepte).

- [ ] **Step 6 : Commit**

```bash
git add apps/collecteur/src/ecrans/Accueil.tsx apps/collecteur/src/ecrans/Accueil.test.tsx apps/collecteur/src/Coquille.tsx
git commit -m "feat(collecteur): l'accueil en billet, en-tete de coffre, carte posee, outils neutres

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10 : Encaisser, en trois temps

**Files :**
- Modify (réécriture) : `apps/collecteur/src/ecrans/Encaisser.tsx`
- Modify (réécriture) : `apps/collecteur/src/ecrans/Encaisser.test.tsx`
- Modify : `apps/collecteur/src/Coquille.tsx` (deux propriétés passées à `Encaisser`, un commentaire)
- Modify : `apps/collecteur/src/Coquille.test.tsx` (témoin d'`Encaisser`, deux épreuves)

**Interfaces :**
- Consumes : `cartesAEncaisser`, `etatEnvoiMise`, `EtatEnvoiMise`, `TourneeAbsente` (`hors-ligne/vues`, tâche 8) ; `correspondClient` (`recherche`, tâche 8) ; `numeroDeRecu` (`recu`, tâche 8) ; `Tampon` (tâche 3) ; `CarteCollecte` avec `neuve`, `tampon`, sans `cycle` (tâche 7) ; `Bouton` avec `grand`, `nomAccessible` (tâche 6) ; `EtatHorsLigne` (`hors-ligne/useHorsLigne`, existant) ; fabriques `carte`, `client`, `operationMise`, `tournee`, `COLLECTEUR`, `INSTANT` (`hors-ligne/fabriques`, existant).
- Produces : `Encaisser({ collecteurId, carte, onChoisir, onNaviguer, onEncaisse, onRecus })` avec `onChoisir: (carte: CarteChoisie | null) => void` et `onRecus: (clientNom: string) => void`. Le bouton du geste s'appelle `Encaisser <mise> FCFA sur la carte de <nom>` ; la liste du premier temps s'appelle « Cartes à encaisser » ; le retour s'appelle « Revenir à la liste des cartes ».

Rappel : `apps/collecteur/tsconfig.app.json` inclut `src`, épreuves comprises,
avec `noUnusedLocals`. Un import inutilisé dans un fichier d'épreuve casse la
construction de l'application.

- [ ] **Step 1 : Écrire les épreuves de l'écran**

Remplacer tout le contenu de `apps/collecteur/src/ecrans/Encaisser.test.tsx` par :

```tsx
import { formatMontant, soldeRestituable } from '@kolek/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COLLECTEUR,
  INSTANT,
  carte as carteLocale,
  client,
  operationMise,
  tournee,
} from '../hors-ligne/fabriques';
import type { MiseLocale } from '../hors-ligne/modele';
import { TourneeAbsente } from '../hors-ligne/vues';

/**
 * L'encaissement, en trois temps : choisir la carte, confirmer, encaissé.
 *
 * Ce que ces épreuves gardent du fichier d'avant (2026-08-26) : le serveur
 * **accepte** deux mises le même jour sur la même carte. `mises_avant_insert`
 * refuse un doublon d'identifiant, une carte clôturée, un cycle complet et un
 * montant faux — pas une seconde mise. Après le succès, l'écran ne doit donc
 * plus offrir le geste : le bouton n'est plus rendu du tout.
 *
 * Ce qu'elles ajoutent : le tampon dit où en est la mise, et il ne ment pas.
 * GARDÉE tant qu'elle attend sur le téléphone, ENCAISSÉ une fois partie, rien
 * du tout si le serveur l'a refusée.
 */

const enregistrerMise = vi.fn();

vi.mock('../ecritures', () => ({
  enregistrerMise: (...args: unknown[]) => enregistrerMise(...args),
}));

// La file du téléphone, réglée par chaque épreuve : elle décide du tampon, et
// des cartes du premier temps.
let etatHorsLigne: Record<string, unknown> = {};
const horsLigne = (reste: Record<string, unknown> = {}) => ({
  operations: [],
  refus: [],
  tournee: null,
  file: null,
  stockage: 'persistant',
  ...reste,
});

vi.mock('../hors-ligne/useHorsLigne', () => ({ useHorsLigne: () => etatHorsLigne }));

const { Encaisser } = await import('./Encaisser');

const CARTE = { carteId: 'k7', clientNom: 'Hj', mise: 1000, misesEncaissees: 17 };
const ECRITE = { ok: true, miseId: 'abcdef1234', operationId: 'op-9' };

beforeEach(() => {
  etatHorsLigne = horsLigne();
});

afterEach(() => {
  cleanup();
  enregistrerMise.mockReset();
});

function ecran(supplement: Record<string, unknown> = {}) {
  return (
    <Encaisser
      collecteurId="col1"
      carte={CARTE}
      onChoisir={vi.fn()}
      onNaviguer={vi.fn()}
      onEncaisse={vi.fn()}
      onRecus={vi.fn()}
      {...supplement}
    />
  );
}

function rendre(supplement: Record<string, unknown> = {}) {
  return render(ecran(supplement));
}

/** Le bouton du geste. Son nom porte le client : la barre du bas a aussi son « Encaisser ». */
function bouton() {
  return screen.getByRole('button', { name: /sur la carte de Hj$/ }) as HTMLButtonElement;
}

/** La ligne d'état, phrase par phrase. */
async function lignesEtat() {
  const etat = await screen.findByRole('status');
  return [...etat.querySelectorAll('p')].map((p) => p.textContent);
}

function tampon() {
  return document.querySelector('[data-tampon]')?.getAttribute('data-tampon') ?? null;
}

describe('temps 1, choisir la carte', () => {
  const TOURNEE = tournee({
    clients: [
      { ...client('c1', 'Mariam Traoré'), marche: 'Adjamé' },
      { ...client('c2', 'Aya Koffi'), marche: 'Treichville', telephone: '07 08 09 10 11' },
      client('c3', 'Rokia Sangaré'),
    ],
    cartes: [
      carteLocale('k2', 'c2', { misesEncaissees: 27 }),
      carteLocale('k1', 'c1', { mise: 2000, misesEncaissees: 29 }),
      carteLocale('k3', 'c3', { misesEncaissees: 31 }),
    ],
  });

  function lignes() {
    return within(screen.getByRole('list', { name: 'Cartes à encaisser' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
  }

  function chercher(terme: string) {
    fireEvent.change(screen.getByRole('textbox', { name: 'Chercher une carte' }), {
      target: { value: terme },
    });
  }

  it('propose les cartes actives, les plus avancées d’abord, sans les pleines', () => {
    etatHorsLigne = horsLigne({ tournee: TOURNEE });
    rendre({ carte: null });

    expect(screen.getByText('Choisis la carte du client.')).toBeTruthy();
    const l = lignes();
    expect(l).toHaveLength(2);
    expect(l[0]).toMatch(/^Mariam Traoré/);
    expect(l[1]).toMatch(/^Aya Koffi/);
  });

  it('choisit une carte d’un seul geste', () => {
    etatHorsLigne = horsLigne({ tournee: TOURNEE });
    const onChoisir = vi.fn();
    rendre({ carte: null, onChoisir });

    fireEvent.click(screen.getByRole('button', { name: /^Mariam Traoré/ }));

    expect(onChoisir).toHaveBeenCalledWith({
      carteId: 'k1',
      clientNom: 'Mariam Traoré',
      mise: 2000,
      misesEncaissees: 29,
    });
  });

  it('cherche par marché comme par numéro', () => {
    etatHorsLigne = horsLigne({ tournee: TOURNEE });
    rendre({ carte: null });

    chercher('treich');
    expect(lignes()).toHaveLength(1);
    expect(lignes()[0]).toMatch(/^Aya Koffi/);

    chercher('0809');
    expect(lignes()).toHaveLength(1);
    expect(lignes()[0]).toMatch(/^Aya Koffi/);
  });

  it('dit quand la recherche ne trouve rien', () => {
    etatHorsLigne = horsLigne({ tournee: TOURNEE });
    rendre({ carte: null });

    chercher('zzz');

    expect(screen.getByText('Aucune carte ne correspond.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Cartes à encaisser' })).toBeNull();
  });

  it('mène aux clients quand aucune carte n’attend de mise', () => {
    etatHorsLigne = horsLigne({ tournee: tournee() });
    const onNaviguer = vi.fn();
    rendre({ carte: null, onNaviguer });

    expect(screen.getByText('Aucune carte à encaisser')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Voir mes clients' }));
    expect(onNaviguer).toHaveBeenCalledWith('clients');
  });

  it('dit que la tournée manque, plutôt qu’une liste vide', () => {
    etatHorsLigne = horsLigne({ tournee: tournee({ lueLe: null }) });
    rendre({ carte: null });

    expect(screen.getByRole('alert').textContent).toBe(new TourneeAbsente().message);
  });

  it('n’affirme rien tant que la tournée n’est pas lue', () => {
    rendre({ carte: null });

    expect(screen.queryByRole('list', { name: 'Cartes à encaisser' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Aucune carte à encaisser')).toBeNull();
  });
});

describe('temps 2, confirmer', () => {
  it('dit la case, le montant et le solde après, avant le geste', () => {
    rendre();

    expect(screen.getByText(/^Mise du jour, case/).textContent).toBe('Mise du jour, case 18');
    expect(screen.getByText(/^Solde après/).textContent).toBe(
      `Solde après ${formatMontant(soldeRestituable(18, 1000))} FCFA`,
    );
    expect(screen.getByText('Montant fixé à l’ouverture de la carte.')).toBeTruthy();
  });

  it('cercle la prochaine case de la carte', () => {
    rendre();

    expect(document.querySelectorAll('[data-etat]')[17]?.getAttribute('data-etat')).toBe(
      'prochaine',
    );
  });

  it('revient à la liste des cartes, et non aux clients', () => {
    const onChoisir = vi.fn();
    const onNaviguer = vi.fn();
    rendre({ onChoisir, onNaviguer });

    fireEvent.click(screen.getByRole('button', { name: 'Revenir à la liste des cartes' }));

    expect(onChoisir).toHaveBeenCalledWith(null);
    expect(onNaviguer).not.toHaveBeenCalled();
  });

  it('n’arme pas le bouton sur une carte pleine, et dit pourquoi', () => {
    rendre({ carte: { ...CARTE, misesEncaissees: 31 } });

    expect(bouton().disabled).toBe(true);
    expect(
      screen.getByText('Le cycle de 31 mises est complet. La carte doit être clôturée.'),
    ).toBeTruthy();
    // Une case 32 n'existe pas : le bloc de caisse ne l'annonce pas.
    expect(screen.queryByText(/^Mise du jour/)).toBeNull();
  });

  it('écrit la mise de la carte, à l’heure de l’appui', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());
    await screen.findByRole('status');

    expect(enregistrerMise).toHaveBeenCalledWith('col1', 'k7', 1000, expect.any(Date));
  });

  it('n’écrit qu’une fois sous deux appuis rapprochés', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    const b = bouton();
    fireEvent.click(b);
    fireEvent.click(b);
    await screen.findByRole('status');

    expect(enregistrerMise).toHaveBeenCalledTimes(1);
  });

  it('laisse le bouton armé quand la mise a échoué', async () => {
    enregistrerMise.mockResolvedValue({
      ok: false,
      echec: { code: 'RESEAU', message: 'Le réseau a coupé.' },
    });
    rendre();

    fireEvent.click(bouton());

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Le réseau a coupé.');
    // Rien n'est écrit, donc rien à protéger : le collecteur doit pouvoir
    // réessayer sans quitter l'écran.
    expect(bouton().disabled).toBe(false);
  });
});

describe('temps 3, encaissé', () => {
  it('pose le tampon GARDÉE tant que la mise attend sur le téléphone', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());

    expect(await lignesEtat()).toEqual([
      `${formatMontant(1000)} FCFA pour Hj, case 18.`,
      'Gardée sur ce téléphone, elle partira avec le réseau.',
      'Reçu n° ABCDEF12',
    ]);
    expect(tampon()).toBe('Gardée');
  });

  it('remplit la case écrite, et elle seule', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());
    await screen.findByRole('status');

    const etats = [...document.querySelectorAll('[data-etat]')].map((c) =>
      c.getAttribute('data-etat'),
    );
    expect(etats[17]).toBe('neuve');
    expect(etats.filter((e) => e === 'neuve')).toHaveLength(1);
  });

  it('passe à ENCAISSÉ quand la mise est partie', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    const { rerender } = rendre();

    fireEvent.click(bouton());
    await screen.findByRole('status');

    // L'opération a quitté la file ; la mise est dans la tournée relue.
    const partie: MiseLocale = {
      id: 'abcdef1234',
      carteId: 'k7',
      montant: 1000,
      encaisseLe: INSTANT,
      encaissePar: COLLECTEUR,
      estCommission: false,
    };
    etatHorsLigne = horsLigne({ tournee: tournee({ mises: [partie] }) });
    rerender(ecran());

    expect(tampon()).toBe('Encaissé');
    expect((await lignesEtat())[1]).toBe('Envoyée.');
  });

  it('ne tamponne pas une mise refusée, et ne lui donne pas de reçu', async () => {
    etatHorsLigne = horsLigne({
      operations: [operationMise(9, { carteId: 'k7' }, { etat: 'refusee_a_consigner' })],
    });
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());

    expect(await lignesEtat()).toEqual([
      `${formatMontant(1000)} FCFA pour Hj, case 18.`,
      'Le serveur a refusé cette mise. Le détail est dans les alertes.',
    ]);
    expect(tampon()).toBeNull();
    // La carte est là, mais sa case 18 ne se remplit pas.
    expect(document.querySelectorAll('[data-etat]')).toHaveLength(31);
    expect(document.querySelector('[data-etat="neuve"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reçu' })).toBeNull();
  });

  it('ne laisse plus de bouton Encaisser : un second appui écrirait une seconde mise', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());
    await screen.findByRole('status');

    expect(screen.queryByRole('button', { name: /sur la carte de Hj$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Encaisser/ })).toBeNull();
  });

  it('prévient la coquille, puis mène au client suivant ou à ses reçus', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    const onEncaisse = vi.fn();
    const onChoisir = vi.fn();
    const onRecus = vi.fn();
    rendre({ onEncaisse, onChoisir, onRecus });

    fireEvent.click(bouton());
    await screen.findByRole('status');

    expect(onEncaisse).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Client suivant' }));
    expect(onChoisir).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Reçu' }));
    expect(onRecus).toHaveBeenCalledWith('Hj');
  });
});
```

`operationMise(9, …)` porte l'opération `op-9` : c'est celle qu'`ECRITE`
annonce, donc celle qu'`etatEnvoiMise` retrouve dans la file.

- [ ] **Step 2 : Les voir échouer**

```bash
npm test -w @kolek/collecteur -- src/ecrans/Encaisser.test.tsx
```

Attendu : rouges toutes, sauf « n’affirme rien tant que la tournée n’est pas
lue » : l'ancien écran sans carte ne montrait ni liste ni alerte, il passe
déjà.

- [ ] **Step 3 : Réécrire l'écran**

Remplacer tout le contenu de `apps/collecteur/src/ecrans/Encaisser.tsx` par :

```tsx
import { formatMontant, MISES_PAR_CYCLE, soldeRestituable } from '@kolek/core';
import {
  BandeauHorsLigne,
  Bouton,
  CarteCollecte,
  Icone,
  Onde,
  Pagination,
  Squelette,
  Tampon,
  useEnLigne,
  usePagination,
  type CleNavCollecteur,
} from '@kolek/ui';
import { useState, type ReactNode } from 'react';

import type { CarteChoisie } from '../Coquille';
import { enregistrerMise } from '../ecritures';
import type { Tournee } from '../hors-ligne/modele';
import { useHorsLigne, type EtatHorsLigne } from '../hors-ligne/useHorsLigne';
import {
  TourneeAbsente,
  cartesAEncaisser,
  etatEnvoiMise,
  type EtatEnvoiMise,
} from '../hors-ligne/vues';
import { LIGNES_AFFICHEES_PAR_PAGE } from '../pagination';
import { correspondClient } from '../recherche';
import { numeroDeRecu } from '../recu';

/**
 * Encaissement d'une mise, en trois temps depuis le 2026-10-02 : choisir la
 * carte, confirmer, encaissé.
 *
 * L'onglet ouvert sans carte disait « Aucune carte choisie » et renvoyait vers
 * Clients : une impasse sur le geste que le collecteur fait trente fois par
 * jour. Il propose maintenant les cartes elles-mêmes, tirées de la tournée du
 * téléphone, donc hors ligne aussi.
 *
 * Deux choix d'avant, qui tiennent toujours.
 *
 * **Le montant n'est pas libre.** Il est celui de la carte, et rien d'autre :
 * le déclencheur `mises_avant_insert` refuse toute mise dont le montant diffère
 * de `cartes.mise`. Proposer un clavier libre laisserait saisir 2 000 sur une
 * carte à 1 000, pour se voir refuser après coup. Le montant s'affiche, il ne
 * se saisit pas.
 *
 * **Pas de champ « Note ».** `mises` n'a pas de colonne pour le recevoir. Un
 * champ qui accepte du texte et le jette ment comme un bouton qui n'écrit rien.
 */
export function Encaisser({
  collecteurId,
  carte,
  onChoisir,
  onNaviguer,
  onEncaisse,
  onRecus,
}: {
  collecteurId: string | null;
  carte: CarteChoisie | null;
  /** Choisir une carte dans la liste, ou y revenir (`null`). */
  onChoisir: (carte: CarteChoisie | null) => void;
  onNaviguer: (cle: CleNavCollecteur) => void;
  onEncaisse: () => void;
  /** Les reçus du client qu'on vient d'encaisser. */
  onRecus: (clientNom: string) => void;
}) {
  const enLigne = useEnLigne();
  const horsLigne = useHorsLigne();
  // Dans la bande sombre, comme sur l'accueil. Il se tait seul quand la file
  // est vide et le réseau là (§8.2).
  const bandeau = (
    <BandeauHorsLigne enLigne={enLigne} compte={horsLigne.file} className="relative z-10 mt-4" />
  );

  return (
    <div className="anim-entree flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-liste">
      {carte ? (
        // La clé remet l'écran à zéro d'une carte à l'autre : l'état
        // « encaissé » d'une cliente ne doit pas survivre sur la suivante.
        <Confirmation
          key={carte.carteId}
          collecteurId={collecteurId}
          carte={carte}
          horsLigne={horsLigne}
          bandeau={bandeau}
          onRetour={() => onChoisir(null)}
          onEncaisse={onEncaisse}
          onRecus={onRecus}
        />
      ) : (
        <Selecteur
          tournee={horsLigne.tournee}
          bandeau={bandeau}
          onChoisir={onChoisir}
          onNaviguer={onNaviguer}
        />
      )}
    </div>
  );
}

/**
 * La bande sombre. Avec l'en-tête de l'accueil, la seule du produit : la
 * journée qui s'ouvre, et le geste qui la paie.
 */
function Bande({
  titre,
  sousTitre,
  onRetour,
  children,
}: {
  titre: string;
  sousTitre?: string;
  onRetour?: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden bg-[image:var(--degrade-hero)] px-marge pb-5 pt-entete lg:rounded-xl lg:pt-6">
      <Onde
        lignes={8}
        traitFixe
        className="pointer-events-none absolute inset-x-0 bottom-0 h-5 w-full text-or/30"
      />
      <div className="relative z-10 flex items-center gap-3">
        {onRetour && (
          <button
            type="button"
            onClick={onRetour}
            aria-label="Revenir à la liste des cartes"
            className="anim-pression flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-pill border border-white/25 bg-white/10"
          >
            <Icone nom="arrow-left" taille={18} className="text-white" />
          </button>
        )}
        <div className="min-w-0">
          <p className="truncate font-headings text-xl font-bold tracking-tight text-white">
            {titre}
          </p>
          {sousTitre && <p className="truncate font-body text-sm text-white/70">{sousTitre}</p>}
        </div>
      </div>
      {children}
    </header>
  );
}

/** Trente et un traits : l'avancement se lit d'un regard, avant le chiffre. */
function Jauge({ faites }: { faites: number }) {
  return (
    <span aria-hidden className="mt-2 flex gap-px">
      {Array.from({ length: MISES_PAR_CYCLE }, (_, i) => (
        <span key={i} className={`h-2.5 w-0.5 ${i < faites ? 'bg-primary' : 'bg-trait/40'}`} />
      ))}
    </span>
  );
}

/**
 * Temps 1 : la carte du client.
 *
 * Les plus avancées d'abord : ce sont celles qu'il faut finir, et c'est l'ordre
 * de l'accueil, qui montre la première. Une carte pleine n'y est pas : elle
 * n'a plus de case à payer, elle relève du retrait.
 */
function Selecteur({
  tournee,
  bandeau,
  onChoisir,
  onNaviguer,
}: {
  tournee: Tournee | null;
  bandeau: ReactNode;
  onChoisir: (carte: CarteChoisie) => void;
  onNaviguer: (cle: CleNavCollecteur) => void;
}) {
  const [recherche, setRecherche] = useState('');
  const toutes = tournee && tournee.lueLe !== null ? cartesAEncaisser(tournee) : [];
  const terme = recherche.trim();
  const trouvees = toutes.filter((c) =>
    correspondClient({ nom: c.clientNom, marche: c.marche, telephone: c.telephone }, terme),
  );
  const { page, pages, total, visibles, allerA } = usePagination(
    trouvees,
    LIGNES_AFFICHEES_PAR_PAGE,
  );

  // Une recherche nouvelle repart de la page 1 : voir `Clients`.
  const changerRecherche = (valeur: string) => {
    setRecherche(valeur);
    allerA(1);
  };

  return (
    <>
      <Bande titre="Encaisser" sousTitre="Choisis la carte du client.">
        {bandeau}
      </Bande>

      {tournee === null ? (
        <div aria-hidden className="mx-4 mt-4 space-y-2">
          <Squelette hauteur="h-12" largeur="w-full" />
          <Squelette hauteur="h-16" largeur="w-full" />
          <Squelette hauteur="h-16" largeur="w-full" />
        </div>
      ) : tournee.lueLe === null ? (
        <p role="alert" className="mx-4 mt-4 font-body text-sm text-negative">
          {new TourneeAbsente().message}
        </p>
      ) : toutes.length === 0 ? (
        <div className="mx-4 mt-6 rounded-xl border border-hairline bg-surface p-5">
          <p className="font-headings text-lg font-bold text-ink">Aucune carte à encaisser</p>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            Les cartes actives de ta tournée viennent ici. Une carte pleine se rend par le retrait.
          </p>
          <Bouton pleineLargeur className="mt-4" onClick={() => onNaviguer('clients')}>
            Voir mes clients
          </Bouton>
        </div>
      ) : (
        <>
          <div className="relative mx-4 mt-4">
            <Icone
              nom="search"
              taille={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            {/* Les mêmes réglages que la recherche de `Clients`, et pour les
                mêmes raisons : `text` et non `search`, ni correcteur ni
                majuscule automatique. */}
            <input
              type="text"
              value={recherche}
              onChange={(e) => changerRecherche(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') changerRecherche('');
              }}
              placeholder="Nom, numéro ou marché…"
              aria-label="Chercher une carte"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              className="min-h-12 w-full rounded-md border border-trait bg-surface pl-10 pr-12 font-body text-champ text-ink placeholder:text-muted-foreground focus:border-primary"
            />
            {recherche && (
              <button
                type="button"
                onClick={() => changerRecherche('')}
                aria-label="Effacer la recherche"
                className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-pill text-muted-foreground hover:text-ink"
              >
                <Icone nom="x" taille={16} />
              </button>
            )}
          </div>

          <div className="mx-4 mt-5 flex items-baseline justify-between gap-3">
            <h2 className="font-headings text-lg font-bold text-ink">Cartes actives</h2>
            <p className="font-body text-xs text-muted-foreground">
              <span className="font-mono">{toutes.length}</span>, les plus avancées d’abord
            </p>
          </div>

          {trouvees.length === 0 ? (
            <div className="mx-4 mt-2 rounded-xl border border-hairline bg-surface p-4">
              <p className="font-body text-base text-ink">Aucune carte ne correspond.</p>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                Vérifie l’orthographe, ou efface la recherche.
              </p>
            </div>
          ) : (
            <ul
              aria-label="Cartes à encaisser"
              className="mx-4 mt-2 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface"
            >
              {visibles.map((c) => (
                <li key={c.carteId}>
                  <button
                    type="button"
                    onClick={() =>
                      onChoisir({
                        carteId: c.carteId,
                        clientNom: c.clientNom,
                        mise: c.mise,
                        misesEncaissees: c.misesEncaissees,
                      })
                    }
                    className="anim-pression flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-body text-base font-semibold text-ink">
                        {c.clientNom}
                      </span>
                      <span className="mt-0.5 block truncate font-body text-xs text-muted-foreground">
                        {c.marche && `${c.marche} · `}
                        <span className="font-mono">{formatMontant(c.mise)}</span>/j
                      </span>
                      <Jauge faites={c.misesEncaissees} />
                    </span>
                    <span className="shrink-0 font-mono text-sm text-ink tabular-nums">
                      {c.misesEncaissees}/{MISES_PAR_CYCLE}
                    </span>
                    <Icone
                      nom="chevron-right"
                      taille={16}
                      className="shrink-0 text-muted-foreground"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Pagination page={page} pages={pages} total={total} onAller={allerA} />
        </>
      )}

      <div className="min-h-6 flex-1" />
    </>
  );
}

/** Ce qu'il faut garder d'une mise écrite pour dire où elle en est. */
interface MiseEcrite {
  miseId: string;
  operationId: string;
  /** L'heure de l'encaissement : celle que porte le tampon. */
  quand: Date;
  numeroCase: number;
}

const PHRASE_ENVOI: Record<EtatEnvoiMise, string> = {
  envoyee: 'Envoyée.',
  gardee: 'Gardée sur ce téléphone, elle partira avec le réseau.',
  refusee: 'Le serveur a refusé cette mise. Le détail est dans les alertes.',
};

const TEINTE_ENVOI: Record<EtatEnvoiMise, string> = {
  envoyee: 'text-positive',
  gardee: 'text-info',
  refusee: 'text-negative',
};

/**
 * Temps 2 et 3 : confirmer, puis encaissé.
 *
 * Après le succès, le bouton « Encaisser » n'est plus rendu du tout : le
 * serveur accepte deux mises le même jour sur une carte, et l'écran ne doit
 * pas en offrir une seconde. Le geste suivant est « Client suivant ».
 */
function Confirmation({
  collecteurId,
  carte,
  horsLigne,
  bandeau,
  onRetour,
  onEncaisse,
  onRecus,
}: {
  collecteurId: string | null;
  carte: CarteChoisie;
  horsLigne: EtatHorsLigne;
  bandeau: ReactNode;
  onRetour: () => void;
  onEncaisse: () => void;
  onRecus: (clientNom: string) => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ecrite, setEcrite] = useState<MiseEcrite | null>(null);

  const complet = carte.misesEncaissees >= MISES_PAR_CYCLE;
  const numeroCase = carte.misesEncaissees + 1;
  const etat = ecrite ? etatEnvoiMise(ecrite, horsLigne) : null;
  // Une mise refusée ne remplit pas sa case : la carte la montrerait payée.
  const remplie = ecrite !== null && etat !== 'refusee';
  // Après le succès, la coquille avance la carte d'une case. L'écran lit donc
  // la case écrite, et non celle de la carte, pour ne pas compter deux fois.
  const jour = ecrite
    ? remplie
      ? ecrite.numeroCase
      : ecrite.numeroCase - 1
    : carte.misesEncaissees;

  async function confirmer() {
    if (!collecteurId || envoi || ecrite || complet) return;
    setEnvoi(true);
    setErreur(null);

    const quand = new Date();
    const resultat = await enregistrerMise(collecteurId, carte.carteId, carte.mise, quand);

    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.echec.message);
      return;
    }
    setEcrite({ miseId: resultat.miseId, operationId: resultat.operationId, quand, numeroCase });
    onEncaisse();
  }

  return (
    <>
      <Bande titre="Encaisser une mise" onRetour={onRetour}>
        {bandeau}
      </Bande>

      <div className="mx-4 mt-4">
        <CarteCollecte
          nomClient={carte.clientNom}
          misePar={formatMontant(carte.mise)}
          jourCourant={jour}
          solde={formatMontant(soldeRestituable(jour, carte.mise))}
          neuve={ecrite && remplie ? ecrite.numeroCase : undefined}
          tampon={
            ecrite && remplie ? (
              <Tampon mot={etat === 'envoyee' ? 'Encaissé' : 'Gardée'} quand={ecrite.quand} />
            ) : undefined
          }
        />
      </div>

      {ecrite === null ? (
        // Sous le pouce : le bloc de caisse descend en bas de l'écran.
        <section aria-label="Caisse" className="mx-4 mt-auto pb-5 pt-6">
          <div className="rounded-xl border border-hairline bg-surface p-4">
            {!complet && (
              <div className="mb-4">
                <p className="font-body text-sm text-muted-foreground">
                  Mise du jour, case <span className="font-mono">{numeroCase}</span>
                </p>
                <p className="mt-1 font-mono text-3xl font-medium tracking-tight text-ink tabular-nums">
                  {formatMontant(carte.mise)}{' '}
                  <span className="font-body text-base font-medium tracking-normal text-muted-foreground">
                    FCFA
                  </span>
                </p>
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  Solde après{' '}
                  <span className="font-mono">
                    {formatMontant(soldeRestituable(numeroCase, carte.mise))}
                  </span>{' '}
                  FCFA
                </p>
              </div>
            )}

            {erreur && (
              <p
                role="alert"
                className="mb-3 rounded-md bg-negative-tint p-3 font-body text-sm font-medium text-negative"
              >
                {erreur}
              </p>
            )}

            {/* `shadow-action` : la seule ombre teintée du Design System
                (§3.5), réservée au geste qui fait vivre Kolek. */}
            <Bouton
              pleineLargeur
              grand
              icone="banknote"
              className="shadow-action"
              nomAccessible={
                envoi
                  ? undefined
                  : `Encaisser ${formatMontant(carte.mise)} FCFA sur la carte de ${carte.clientNom}`
              }
              disabled={envoi || collecteurId === null || complet}
              onClick={confirmer}
            >
              {envoi ? 'Enregistrement…' : 'Encaisser'}
            </Bouton>
            <p className="mt-2 text-center font-body text-xs text-muted-foreground">
              {complet
                ? `Le cycle de ${MISES_PAR_CYCLE} mises est complet. La carte doit être clôturée.`
                : 'Montant fixé à l’ouverture de la carte.'}
            </p>
          </div>
        </section>
      ) : (
        <div className="mx-4 mt-4 flex flex-1 flex-col">
          {/* Le tampon est `aria-hidden` : cette ligne dit la même chose aux
              lecteurs d'écran. Une mise refusée n'a ni tampon ni reçu. */}
          <div role="status" className="space-y-1">
            <p className="font-body text-base font-semibold text-ink">
              <span className="font-mono">{formatMontant(carte.mise)}</span> FCFA pour{' '}
              {carte.clientNom}, case <span className="font-mono">{ecrite.numeroCase}</span>.
            </p>
            {etat && (
              <p className={`font-body text-sm font-medium ${TEINTE_ENVOI[etat]}`}>
                {PHRASE_ENVOI[etat]}
              </p>
            )}
            {remplie && (
              <p className="font-body text-sm text-muted-foreground">
                Reçu n° <span className="font-mono">{numeroDeRecu(ecrite.miseId)}</span>
              </p>
            )}
          </div>

          <div className="mt-auto flex gap-2 pb-5 pt-6">
            <Bouton className="flex-1" onClick={onRetour}>
              Client suivant
            </Bouton>
            {remplie && (
              <Bouton
                variante="contour"
                icone="receipt-text"
                onClick={() => onRecus(carte.clientNom)}
              >
                Reçu
              </Bouton>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4 : Voir passer l'écran**

```bash
npm test -w @kolek/collecteur -- src/ecrans/Encaisser.test.tsx
```

Attendu : vert, 20 épreuves.

- [ ] **Step 5 : Écrire les épreuves de la coquille**

Dans `apps/collecteur/src/Coquille.test.tsx`, remplacer le témoin
`vi.mock('./ecrans/Encaisser', …)` entier (de `vi.mock('./ecrans/Encaisser', () => ({`
jusqu'au `}));` qui le ferme) par :

```tsx
vi.mock('./ecrans/Encaisser', () => ({
  Encaisser: ({
    carte,
    onChoisir,
    onEncaisse,
    onNaviguer,
    onRecus,
  }: {
    carte: { carteId: string; misesEncaissees: number } | null;
    onChoisir: (
      carte: { carteId: string; clientNom: string; mise: number; misesEncaissees: number } | null,
    ) => void;
    onEncaisse: () => void;
    onNaviguer: (cle: string) => void;
    onRecus: (clientNom: string) => void;
  }) => (
    <>
      <div>écran Encaisser</div>
      {carte ? (
        <div>carte {carte.carteId} · jour {carte.misesEncaissees}</div>
      ) : (
        <div>Aucune carte choisie.</div>
      )}
      <button
        type="button"
        onClick={() => onChoisir({ carteId: 'k9', clientNom: 'Ka', mise: 500, misesEncaissees: 4 })}
      >
        choisir k9
      </button>
      <button type="button" onClick={onEncaisse}>
        confirmer
      </button>
      <button type="button" onClick={() => onNaviguer('clients')}>
        revenir aux clients
      </button>
      <button type="button" onClick={() => onRecus('Ka')}>
        reçus de Ka
      </button>
    </>
  ),
}));
```

Puis, juste après l'épreuve « oublie la carte en quittant l’écran, pour ne pas
la rouvrir par l’onglet » (dans le même `describe`), ajouter :

```tsx
  it('pose la carte choisie dans la liste de l’onglet, sans passer par Clients', async () => {
    render(<Coquille collecteurId="collecteur-1" onDeconnexion={vi.fn()} />);

    const barre = screen.getByRole('navigation', { name: 'Navigation principale' });
    fireEvent.click(within(barre).getByRole('button', { name: 'Encaisser' }));
    fireEvent.click(await screen.findByRole('button', { name: 'choisir k9' }));

    expect(await screen.findByText('carte k9 · jour 4')).toBeTruthy();
  });

  it('mène aux reçus du client qu’on vient d’encaisser', async () => {
    render(<Coquille collecteurId="collecteur-1" onDeconnexion={vi.fn()} />);

    const barre = screen.getByRole('navigation', { name: 'Navigation principale' });
    fireEvent.click(within(barre).getByRole('button', { name: 'Encaisser' }));
    fireEvent.click(await screen.findByRole('button', { name: 'reçus de Ka' }));

    expect(await screen.findByText('écran Recus')).toBeTruthy();
  });
```

- [ ] **Step 6 : Les voir échouer**

```bash
npm test -w @kolek/collecteur -- src/Coquille.test.tsx
```

Attendu : rouges les deux nouvelles (la coquille ne passe ni `onChoisir` ni
`onRecus` : le clic lève « onChoisir is not a function »). Les autres restent
vertes.

- [ ] **Step 7 : Brancher la coquille**

Dans `apps/collecteur/src/Coquille.tsx` :

1. Remplacer le commentaire de `CarteChoisie` :

```ts
/** La carte choisie pour l'encaissement, portée par la coquille : l'écran
    « Encaisser » a besoin de savoir sur quelle carte il écrit, et c'est la
    liste des clients qui le décide. */
```

par :

```ts
/** La carte choisie pour l'encaissement, portée par la coquille : l'écran
    « Encaisser » a besoin de savoir sur quelle carte il écrit. Elle se choisit
    sur l'accueil (la carte à finir en premier) ou dans la liste de l'onglet. */
```

2. Dans le rendu `{page === 'encaisser' && (<Encaisser … />)}`, après la ligne
   `carte={carteChoisie}`, ajouter :

```tsx
          onChoisir={setCarteChoisie}
          onRecus={allerAuxRecus}
```

- [ ] **Step 8 : Voir passer, construire, garder**

```bash
npm test -w @kolek/collecteur -- src/ecrans/Encaisser.test.tsx src/Coquille.test.tsx
VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=sb_publishable_factice npm run build -w @kolek/collecteur
npm run verifier:contraste
npm run verifier:tirets
npm run verifier:champs
npm run verifier:rayons
```

Attendu : tout vert. `verifier:champs` contrôle le `text-champ` du nouveau
champ de recherche ; `verifier:rayons` refuse un `rounded-2xl` qui se serait
glissé.

- [ ] **Step 9 : Commit**

```bash
git add apps/collecteur/src/ecrans/Encaisser.tsx apps/collecteur/src/ecrans/Encaisser.test.tsx apps/collecteur/src/Coquille.tsx apps/collecteur/src/Coquille.test.tsx
git commit -m "feat(collecteur): encaisser en trois temps, la liste des cartes et le tampon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11 : Retrait, la liste en lignes

**Files :**
- Modify (réécriture) : `apps/collecteur/src/ecrans/Retrait.tsx`
- Modify : `apps/collecteur/src/ecrans/Retrait.test.tsx`
- Modify : `apps/collecteur/src/ecrans/EnTeteEcran.tsx` (bouton de retour bordé de `trait`, sous-titre en `text-sm`)

**Interfaces :**
- Consumes : `Segments` (tâche 4), jeton `trait` (tâche 1).
- Produces : chaque carte est un `<li>` dont le premier enfant interactif est un bouton portant `aria-expanded` (et `aria-controls="depli-<carteId>"` quand il est déplié) ; le dépli porte l'`id` `depli-<carteId>` et contient « Faire le retrait », le message de blocage, et `ActiverCarte` pour un cycle terminé. Sous « Toutes », deux `<h2>` : `Cycle terminé <n>` et `En cours <n>` (le compte `aria-hidden`). Les noms des segments sont « Toutes », « Cycle terminé », « En cours ». La confirmation reste, pour cette tâche, celle d'aujourd'hui (« Oui, faire le retrait »), posée dans le dépli : la tâche 12 la remplace par la feuille du décompte.

- [ ] **Step 1 : Adapter les épreuves existantes**

Dans `apps/collecteur/src/ecrans/Retrait.test.tsx` :

1. Juste après la fonction `rendre`, ajouter :

```tsx
/** Les lignes de la liste : une par carte, chacune un bouton qui se déplie. */
function lignes() {
  return screen.queryAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'));
}

/** Déplie la ligne d'un client. `rang` choisit parmi ses cartes, dans l'ordre de l'écran. */
function ouvrir(nom: string, rang = 0) {
  const ligne = lignes().filter((b) => b.textContent?.startsWith(nom))[rang];
  if (!ligne) throw new Error(`Pas de ligne pour ${nom} (rang ${rang})`);
  fireEvent.click(ligne);
}

/** Déplie la ligne, puis demande le retrait. */
function faireLeRetrait(nom: string, rang = 0) {
  ouvrir(nom, rang);
  fireEvent.click(screen.getByRole('button', { name: 'Faire le retrait' }));
}
```

2. Remplacer l'épreuve « ne dit plus « clôturer » sur le bouton principal »
   entière (de `it(` à son `});`) par :

```tsx
  it('ne dit plus « clôturer » sur le bouton principal', () => {
    rendre();
    ouvrir('Hj');

    expect(screen.getByRole('button', { name: 'Faire le retrait' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clôturer cette carte' })).toBeNull();
  });
```

3. Dans l'épreuve « nomme les deux faits dans la confirmation », remplacer
   `fireEvent.click(screen.getAllByRole('button', { name: 'Faire le retrait' })[0]!);`
   par `faireLeRetrait('Hj');`.

4. Remplacer l'épreuve « propose d’activer une carte à côté de celle qui est
   pleine » entière par :

```tsx
  it('propose d’activer une carte à côté de celle qui est pleine', () => {
    rendre();
    ouvrir('Hj');

    const depli = document.getElementById('depli-k1') as HTMLElement;
    // Le collecteur est devant le client, l'argent à la main, quand celui-ci dit
    // « garde-le ». La porte doit être là.
    expect(within(depli).getByRole('button', { name: 'Activer une carte' })).toBeTruthy();
  });
```

5. Remplacer l'épreuve « ne la propose pas sur une carte encore en cours »
   entière par :

```tsx
  it('ne la propose pas sur une carte encore en cours', () => {
    donnees = [CARTE_EN_COURS_HJ];
    rendre();
    ouvrir('Hj');

    // Rien n'est terminé : proposer d'en ouvrir une seconde ici prélèverait une
    // commission que le client n'a pas demandée.
    expect(screen.getByRole('button', { name: 'Faire le retrait' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Activer une carte' })).toBeNull();
  });
```

6. Dans « ne montre que les cartes du client demandé », remplacer
   `expect(screen.getAllByRole('button', { name: 'Faire le retrait' })).toHaveLength(2);`
   par `expect(lignes()).toHaveLength(2);`.

7. Dans « ne filtre rien quand aucun client n’est demandé », remplacer
   `expect(screen.getAllByRole('button', { name: 'Faire le retrait' })).toHaveLength(3);`
   par `expect(lignes()).toHaveLength(3);`.

8. Remplacer les épreuves « refuse le retrait d’une carte dont une mise attend
   l’envoi, et le dit », « demande le réseau pour rendre l’argent » et
   « attend que le téléphone ait lu sa file : une file pas lue ne vaut pas une
   file vide », chacune entière, par :

```tsx
  it('refuse le retrait d’une carte dont une mise attend l’envoi, et le dit', () => {
    // Le montant rendu est recalculé au serveur depuis les mises qu'il a
    // reçues. Tant qu'une mise de la carte est sur le téléphone, le client
    // repartirait avec moins que son dû.
    operationsEnFile = [operationMise(1, { carteId: 'k1' })];
    rendre();

    ouvrir('Hj');
    expect(
      (screen.getByRole('button', { name: 'Faire le retrait' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText('1 mise de cette carte pas encore envoyée.')).toBeTruthy();

    // Les autres cartes n'attendent rien : leur retrait reste possible.
    ouvrir('Ka');
    expect(
      (screen.getByRole('button', { name: 'Faire le retrait' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('demande le réseau pour rendre l’argent', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    rendre();

    for (let i = 0; i < 3; i++) {
      fireEvent.click(lignes()[i]!);
      expect(
        (screen.getByRole('button', { name: 'Faire le retrait' }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(screen.getByText('Le retrait demande le réseau.')).toBeTruthy();
    }
  });
```

et, pour la troisième :

```tsx
  it('attend que le téléphone ait lu sa file : une file pas lue ne vaut pas une file vide', () => {
    fileLue = null;
    rendre();

    for (let i = 0; i < 3; i++) {
      fireEvent.click(lignes()[i]!);
      expect(
        (screen.getByRole('button', { name: 'Faire le retrait' }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(screen.getByText('Opérations du téléphone pas encore vérifiées.')).toBeTruthy();
    }
  });
```

9. Dans « ne laisse pas valider une confirmation ouverte quand une mise de la
   carte entre en file » et « ne laisse pas valider une confirmation ouverte
   quand le réseau tombe », remplacer
   `fireEvent.click(screen.getAllByRole('button', { name: 'Faire le retrait' })[0]!);`
   par `faireLeRetrait('Hj');`.

10. Supprimer les deux fonctions locales `retraits()` (l'une dans
    `describe('les filtres', …)`, l'autre dans `describe('la pagination', …)`),
    puis, dans ces deux blocs, remplacer chaque appel `retraits()` par
    `lignes()`.

11. Dans « referme une confirmation ouverte quand la liste change », remplacer
    `fireEvent.click(lignes()[0]);` (l'ancien `retraits()[0]`) par
    `faireLeRetrait('Hj');`. Dans « referme une confirmation ouverte quand on
    change de page », le remplacer par `faireLeRetrait('Client 01');`.

- [ ] **Step 2 : Écrire les épreuves de la liste en lignes**

À la fin de `apps/collecteur/src/ecrans/Retrait.test.tsx`, ajouter :

```tsx
/**
 * Une ligne par carte, le détail quand on le demande (2026-10-02).
 *
 * L'écran montrait des cartes de 240 px, la même phrase de commission répétée
 * sur chacune, et une carte à 0 FCFA aussi grosse qu'une carte à rendre. Neuf
 * lignes tiennent là où tenaient trois cartes.
 */
describe('la liste en lignes', () => {
  function titres() {
    return screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent);
  }

  function nomsDesLignes() {
    return lignes().map((l) => l.textContent?.match(/^\D+/)?.[0]);
  }

  function depliees() {
    return lignes().filter((l) => l.getAttribute('aria-expanded') === 'true');
  }

  it('range les cycles terminés devant, sous deux titres comptés', () => {
    rendre();

    expect(titres()).toEqual(['Cycle terminé 2', 'En cours 1']);
    expect(nomsDesLignes()).toEqual(['Hj', 'Ka', 'Hj']);
  });

  it('montre le montant à rendre sur la ligne, et la commission seulement dépliée', () => {
    rendre();

    expect(lignes()[0]?.textContent).toMatch(/30\s000\s?FCFA\s?à rendre/);
    expect(screen.queryByText(/qui est ta commission/)).toBeNull();

    ouvrir('Hj');

    expect(screen.getAllByText(/qui est ta commission/)).toHaveLength(1);
  });

  it('ne déplie qu’une ligne à la fois, et la replie au second toucher', () => {
    rendre();

    ouvrir('Hj');
    ouvrir('Ka');

    expect(depliees()).toHaveLength(1);
    expect(depliees()[0]?.textContent).toMatch(/^Ka/);

    ouvrir('Ka');
    expect(depliees()).toHaveLength(0);
  });

  it('relie la ligne à son dépli', () => {
    rendre();
    ouvrir('Hj');

    expect(lignes()[0]?.getAttribute('aria-controls')).toBe('depli-k1');
    expect(document.getElementById('depli-k1')).not.toBeNull();
  });

  it('compte chaque segment sur ce que la recherche a trouvé', () => {
    rendre();
    const comptes = () =>
      ['Toutes', 'Cycle terminé', 'En cours'].map(
        (nom) => screen.getByRole('button', { name: nom }).textContent,
      );

    expect(comptes()).toEqual(['Toutes3', 'Cycle terminé2', 'En cours1']);

    fireEvent.change(screen.getByRole('textbox', { name: 'Rechercher un client' }), {
      target: { value: 'hj' },
    });

    expect(comptes()).toEqual(['Toutes2', 'Cycle terminé1', 'En cours1']);
  });

  it('ne titre pas les groupes sous un filtre : le segment le dit déjà', () => {
    rendre();

    fireEvent.click(screen.getByRole('button', { name: 'Cycle terminé' }));

    expect(titres()).toEqual([]);
    expect(lignes()).toHaveLength(2);
  });

  it('replie la ligne quand la liste change', () => {
    rendre();
    ouvrir('Hj');

    fireEvent.click(screen.getByRole('button', { name: 'En cours' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toutes' }));

    expect(depliees()).toHaveLength(0);
  });
});
```

- [ ] **Step 3 : Les voir échouer**

```bash
npm test -w @kolek/collecteur -- src/ecrans/Retrait.test.tsx
```

Attendu : rouges toutes les épreuves qui passent par `lignes()`, `ouvrir` ou
`faireLeRetrait` (aucune ligne ne porte encore `aria-expanded`), et toutes
celles de « la liste en lignes ». Restent vertes celles qui ne lisent que la
recherche, les vides et le bandeau du client.

- [ ] **Step 4 : Réécrire l'écran**

Remplacer tout le contenu de `apps/collecteur/src/ecrans/Retrait.tsx` par :

```tsx
import { MISES_PAR_CYCLE, formatMontant } from '@kolek/core';
import {
  Bouton,
  Carte,
  Icone,
  Pagination,
  Segments,
  Squelette,
  useEnLigne,
  usePagination,
} from '@kolek/ui';
import { useState } from 'react';

import type { ClientCible } from '../Coquille';
import { useDonnees } from '../cache';
import { cloturerCarte } from '../ecritures-ecrans';
import { useHorsLigne } from '../hors-ligne/useHorsLigne';
import { enAttenteSurCarte, phraseAttenteCarte } from '../hors-ligne/vues';
import { chargerCartesCloturables, type CarteCloturable } from '../lectures-ecrans';
import { LIGNES_AFFICHEES_PAR_PAGE } from '../pagination';
import { rangCascade, usePremierRendu } from '../premier-rendu';
import { nu } from '../recherche';
import { useEstCollaborateur } from './commission';
import { ActiverCarte } from './ActiverCarte';
import { CorpsEcran, EnTeteEcran, RienAMontrer } from './EnTeteEcran';

/**
 * Les filtres de la liste.
 *
 * Trois et pas davantage, parce que les données n'en portent pas plus : une
 * carte est au bout de son cycle, ou elle ne l'est pas. Les deux cas appellent
 * deux gestes différents. Au bout, rendre l'argent ou repartir sur une carte de
 * plus ; en cours, un retrait anticipé, dont le montant ne se fait pas de tête.
 */
const FILTRES = ['Toutes', 'Cycle terminé', 'En cours'] as const;
type Filtre = (typeof FILTRES)[number];

const pluriel = (n: number) => (n > 1 ? 's' : '');

/**
 * Retrait : clôturer une carte et rendre son solde au client.
 *
 * C'est le seul écran de l'application qui fait **sortir** de l'argent. Il est
 * construit en conséquence.
 *
 * **Une ligne par carte, le détail quand on le demande** (2026-10-02). Les
 * cartes faisaient 240 px de haut, la même phrase de commission répétée sur
 * chacune, et une carte à 0 FCFA aussi grosse qu'une carte à rendre. La ligne
 * dit le nom, l'avancement et le montant à rendre ; la toucher la déplie, une
 * seule à la fois, sur la règle de la commission et les deux gestes.
 *
 * **Le montant est affiché avant confirmation, et il vient du serveur.** Le
 * collecteur voit ce qu'il va rendre, en chiffres, avant de toucher au bouton.
 * La règle — la première mise est sa commission — est rappelée dans le dépli,
 * parce que c'est là qu'un client peut la contester.
 *
 * **La confirmation est en deux temps.** Un retrait ne se défait pas : `retraits`
 * porte un déclencheur d'immuabilité, et la carte clôturée ne se rouvre pas. Un
 * appui unique sur une liste défilante, dans un marché, se produirait par accident.
 */
export function Retrait({
  onRetour,
  onEcriture,
  revision,
  collecteurId,
  client = null,
  onToutesLesCartes,
}: {
  onRetour: () => void;
  /** Un retrait vient d'être inscrit, ou une carte de plus vient d'être
      ouverte : la liste doit se relire. La propriété s'appelait `onCloture`
      quand la clôture était la seule écriture de cet écran. */
  onEcriture: () => void;
  revision: number;
  /** Donné par la coquille : le bloc « Activer une carte » écrit, et
      `collecteur_id` accompagne l'écriture. Le lire ici par carte pleine
      affichée coûterait un aller-retour réseau par carte. */
  collecteurId: string | null;
  /**
   * Le client sur lequel la liste est réduite, quand on arrive ici depuis sa
   * ligne ou sa fiche.
   *
   * Sans ce filtre, toucher « Retirer » sur une carte précise renvoyait sur la
   * liste de **toutes** les cartes de **tous** les clients, sans préselection.
   * Le collecteur venait de désigner une carte, et devait la retrouver à la
   * main — par nom, montant et nombre de jours — avant un geste qui ne se
   * défait pas. Debout dans un marché, c'est fabriquer l'erreur qu'on veut
   * éviter, d'autant qu'un même client peut avoir deux cartes dans cette liste.
   *
   * Le nom arrive avec l'identifiant, et n'est plus déduit des cartes lues :
   * quand la liste réduite est vide — juste après le dernier retrait de ce
   * client — il n'y avait plus de nom, donc plus de bandeau, donc plus aucune
   * sortie du filtre.
   */
  client?: ClientCible | null;
  /** Retire le filtre. Absent quand aucun filtre n'est posé. */
  onToutesLesCartes?: () => void;
}) {
  const estCollaborateur = useEstCollaborateur();
  const enLigne = useEnLigne();
  const { operations, file } = useHorsLigne();
  const [aConfirmer, setAConfirmer] = useState<CarteCloturable | null>(null);
  /** La ligne dépliée. Une seule à la fois : deux lignes dépliées, ce sont
      deux boutons « Faire le retrait » sous le même pouce. */
  const [ouverte, setOuverte] = useState<string | null>(null);
  // Voir `Recus` : l'escalier ne rejoue pas quand la liste se relit.
  const premier = usePremierRendu();
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState<{ nom: string; montant: number } | null>(null);
  /** Chaque clôture fait avancer la révision, ce qui périme la liste gardée.
      Après un retrait, la carte clôturée doit disparaître : un affichage
      instantané de l'ancienne liste inviterait à la clôturer deux fois. C'est
      le seul écran où le cache doit être franchement invalidé. */
  const [tourLocal, setTourLocal] = useState(0);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('Toutes');

  const {
    donnees: cartes,
    erreur: erreurLecture,
    rafraichir,
  } = useDonnees('cartes-cloturables', chargerCartesCloturables, {
    revision: revision + tourLocal,
    messageErreur: 'Cet écran demande le réseau.',
    besoinReseau: true,
  });
  const [erreurEcriture, setErreurEcriture] = useState<string | null>(null);
  const erreur = erreurEcriture ?? erreurLecture;

  // `cartes` reste la liste entière : le filtre ne change que ce qu'on montre,
  // jamais ce qu'on a lu. Une seule lecture sert les deux vues, et revenir à
  // toutes les cartes ne coûte pas un aller-retour réseau. Rien lu (lecture en
  // cours, ou en échec hors ligne) reste `null` : une liste vide dirait d'un
  // client qui a des cartes que toutes sont clôturées.
  const duClient = client && cartes ? cartes.filter((c) => c.clientId === client.id) : cartes;

  /**
   * Quand le champ de recherche et les filtres existent.
   *
   * Pas sous un filtre client : la liste ne porte déjà qu'une personne, et un
   * second filtre par-dessus ne retrancherait rien qu'on cherche. Pas non plus
   * sur zéro ou une carte, où il n'y a rien à trouver — un champ posé au-dessus
   * d'une liste d'un élément est du décor.
   *
   * Et le terme comme le filtre ne sont lus que si leurs commandes sont là.
   * Sans cette garde, arriver ici depuis la fiche d'un client, la recherche
   * restée pleine ou « En cours » resté choisi d'un passage précédent,
   * masquerait ses cartes par un filtre devenu invisible — le pire défaut
   * possible sur l'écran qui fait sortir l'argent.
   */
  const avecOutils = !client && (cartes?.length ?? 0) > 1;
  const cherche = avecOutils ? nu(recherche.trim()) : '';
  const filtreActif: Filtre = avecOutils ? filtre : 'Toutes';

  // On cherche, on filtre, **puis** on découpe — l'ordre de l'écran Clients,
  // et pour sa raison : découper d'abord ferait chercher dans la seule page
  // affichée, et la recherche ne trouverait jamais une carte de la page deux.
  const trouvees =
    cherche && duClient ? duClient.filter((c) => nu(c.clientNom).includes(cherche)) : duClient;

  const visibles =
    trouvees && filtreActif !== 'Toutes'
      ? trouvees.filter((c) => (filtreActif === 'Cycle terminé' ? c.cycleComplet : !c.cycleComplet))
      : trouvees;

  /**
   * Les cycles terminés devant : ce sont les cartes qu'on vient rendre. Le tri
   * est stable, donc l'ordre du serveur tient à l'intérieur de chaque groupe ;
   * et il précède le découpage, sans quoi chaque page aurait son propre
   * « devant ».
   */
  const rangees = visibles
    ? [...visibles].sort((a, b) => Number(b.cycleComplet) - Number(a.cycleComplet))
    : null;

  /**
   * Vingt cartes par page, le seuil de l'écran Clients.
   *
   * `LIGNES_AFFICHEES_PAR_PAGE`, et non une valeur à part : deux écrans voisins
   * qui découpent leur liste à deux tailles différentes, c'est une règle que le
   * collecteur doit réapprendre en changeant d'onglet. `Pagination` se retire
   * d'elle-même sous vingt et une cartes, et le crochet ramène la page dans ses
   * bornes quand un retrait raccourcit la liste.
   *
   * Appelé avant le retour anticipé de la carte clôturée : un crochet ne se
   * saute pas.
   */
  const {
    page,
    pages,
    total: totalFiltre,
    visibles: affichees,
    allerA,
  } = usePagination(rangees ?? [], LIGNES_AFFICHEES_PAR_PAGE);

  /*
    Toute nouvelle question se pose depuis le début de la liste, et referme le
    dépli comme la confirmation.

    Le retour en page 1 est celui de Clients : sans lui, on cherche depuis la
    page trois et l'écran répond par le quarante et unième résultat, les
    quarante premiers invisibles.

    La fermeture est propre à cet écran. Une confirmation ouverte survit au
    changement de liste, puisqu'elle vit dans l'état et non dans la carte : la
    carte masquée par un filtre reparaissait, au retour sur « Toutes », avec
    « Oui, faire le retrait » sous le doigt — un geste qui ne se défait pas, à
    un appui de distance, sur une carte qu'on n'avait pas redemandée. Le dépli
    suit la même règle, pour la même raison.

    Ce sont des gestes, donc ça se fait dans les gestionnaires et non dans un
    `useEffect` : rien à synchroniser après coup.
  */
  const fermer = () => {
    setOuverte(null);
    setAConfirmer(null);
  };

  const changerRecherche = (terme: string) => {
    setRecherche(terme);
    fermer();
    allerA(1);
  };

  const changerFiltre = (f: Filtre) => {
    setFiltre(f);
    fermer();
    allerA(1);
  };

  const changerPage = (numero: number) => {
    fermer();
    allerA(numero);
  };

  /** Déplier une ligne replie l'autre, et referme sa confirmation : elle se
      rouvre au doigt, jamais d'elle-même. */
  const basculer = (carteId: string) => {
    setOuverte((o) => (o === carteId ? null : carteId));
    setAConfirmer(null);
  };

  /**
   * Ce que la recherche a trouvé, et ce que le filtre en cache.
   *
   * Le compte et le total : une liste qui rétrécit sans dire de combien laisse
   * croire qu'on a perdu des cartes. Et la part du filtre, comptée à part de
   * celle de la recherche — sur l'écran Clients, compter sur la liste déjà
   * filtrée faisait dire « aucun client trouvé » d'un client que le filtre
   * cachait. Ici ce serait « aucune carte à ce nom » d'une carte bien là, et le
   * collecteur conclurait qu'elle a déjà été rendue.
   */
  const nbTrouvees = trouvees?.length ?? 0;
  const nbVisibles = visibles?.length ?? 0;
  const masquees = nbTrouvees - nbVisibles;
  const annonce =
    !cherche || !duClient
      ? ''
      : nbTrouvees === 0
        ? 'Aucune carte trouvée'
        : masquees === 0
          ? `${nbTrouvees} sur ${duClient.length} cartes`
          : nbVisibles === 0
            ? `${nbTrouvees} carte${pluriel(nbTrouvees)} trouvée${pluriel(nbTrouvees)}, masquée${pluriel(nbTrouvees)} par le filtre « ${filtreActif} »`
            : `${nbVisibles} sur ${nbTrouvees}, dont ${masquees} masquée${pluriel(masquees)} par le filtre « ${filtreActif} »`;

  /** Les comptes des segments, faits sur ce que la recherche a trouvé : chaque
      segment dit ce qu'il montrerait si on le choisissait. */
  const comptes: Record<Filtre, number> = {
    Toutes: nbTrouvees,
    'Cycle terminé': trouvees?.filter((c) => c.cycleComplet).length ?? 0,
    'En cours': trouvees?.filter((c) => !c.cycleComplet).length ?? 0,
  };

  /**
   * Quel vide montrer, s'il y en a un.
   *
   * Trois vides qui ne se disent pas pareil. « Aucune carte active » sous une
   * recherche qui ne trouve rien ferait croire que tout est clôturé, alors
   * qu'on a mal tapé un nom ; sous un filtre, alors qu'on a seulement choisi
   * « En cours » sur une liste de cycles terminés.
   */
  const vide: 'nom' | 'filtre' | 'liste' | null =
    visibles?.length !== 0
      ? null
      : cherche && nbTrouvees === 0
        ? 'nom'
        : filtreActif !== 'Toutes'
          ? 'filtre'
          : 'liste';

  /**
   * Sous « Toutes », deux groupes titrés : les cycles terminés, puis les
   * cartes en cours. Sous un filtre, une seule liste sans titre : le segment
   * choisi le dit déjà.
   */
  const groupes: { titre: Filtre | null; membres: CarteCloturable[] }[] =
    filtreActif === 'Toutes'
      ? [
          { titre: 'Cycle terminé', membres: affichees.filter((c) => c.cycleComplet) },
          { titre: 'En cours', membres: affichees.filter((c) => !c.cycleComplet) },
        ]
      : [{ titre: null, membres: affichees }];

  /**
   * Pourquoi le retrait d'une carte attend, ou `null` (spec J2b §7).
   *
   * Lu au rendu pour les deux boutons — celui qui ouvre la confirmation et
   * celui qui la valide — et relu au moment de confirmer : entre l'ouverture et
   * le geste, une mise de la carte a pu entrer dans la file, ou le réseau
   * tomber. La clôture recalcule au serveur depuis les mises qu'il a reçues ;
   * sans cette garde, le client repartirait avec moins que son dû.
   *
   * Une file pas encore lue ne vaut pas une file vide.
   */
  function retraitBloquePour(carteId: string): string | null {
    if (file === null) return 'Opérations du téléphone pas encore vérifiées.';
    return (
      phraseAttenteCarte(enAttenteSurCarte(operations, carteId)) ??
      (enLigne ? null : 'Le retrait demande le réseau.')
    );
  }

  async function confirmer() {
    if (!aConfirmer || envoi) return;
    if (retraitBloquePour(aConfirmer.carteId) !== null) return;
    setEnvoi(true);
    setErreurEcriture(null);

    const resultat = await cloturerCarte(aConfirmer.carteId);

    setEnvoi(false);
    if (!resultat.ok) {
      setErreurEcriture(resultat.echec.message);
      setAConfirmer(null);
      // Un refus peut venir d'une carte clôturée ailleurs entre-temps : on
      // relit, sinon l'écran continue de proposer une carte qui n'existe plus.
      rafraichir();
      return;
    }

    setFait({ nom: aConfirmer.clientNom, montant: resultat.montantRestitue });
    fermer();
    setTourLocal((t) => t + 1);
    onEcriture();
  }

  /** La règle de la commission, dite une fois, dans le dépli. */
  function phraseCommission(carte: CarteCloturable): string {
    const n = carte.misesEncaissees;
    if (n === 0) return 'Aucune mise encaissée : rien à rendre, rien à garder.';
    return `${n} mise${pluriel(n)} encaissée${pluriel(n)}, moins la première, ${
      estCollaborateur ? 'qui revient à ton titulaire' : 'qui est ta commission'
    } (${formatMontant(carte.mise)} FCFA).`;
  }

  function ligne(carte: CarteCloturable, rang: number) {
    const deplie = ouverte === carte.carteId;
    const retraitBloque = retraitBloquePour(carte.carteId);
    const enConfirmation = aConfirmer?.carteId === carte.carteId;

    return (
      <li
        key={carte.carteId}
        className={`relative ${premier ? 'anim-cascade' : ''}`}
        style={rangCascade(rang, premier)}
      >
        {/* Le trait d'un cycle terminé : la carte qu'on vient rendre se voit
            avant qu'on lise son compteur. */}
        {carte.cycleComplet && (
          <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-positive" />
        )}
        <button
          type="button"
          aria-expanded={deplie}
          aria-controls={deplie ? `depli-${carte.carteId}` : undefined}
          onClick={() => basculer(carte.carteId)}
          className="anim-pression flex w-full cursor-pointer items-center gap-3 py-3 pl-4 pr-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-body text-base font-semibold text-ink">
              {carte.clientNom}
            </span>
            <span className="mt-0.5 block font-body text-xs text-muted-foreground">
              <span className="font-mono">
                {carte.misesEncaissees}/{MISES_PAR_CYCLE}
              </span>{' '}
              · <span className="font-mono">{formatMontant(carte.mise)}</span>/j
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-mono text-base font-medium text-ink tabular-nums">
              {formatMontant(carte.restituable)}{' '}
              <span className="font-body text-xs font-medium text-muted-foreground">FCFA</span>
            </span>
            <span className="block font-body text-xs text-muted-foreground">à rendre</span>
          </span>
          <Icone
            nom="chevron-down"
            taille={16}
            className={`shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${deplie ? 'rotate-180' : ''}`}
          />
        </button>

        {deplie && (
          <div id={`depli-${carte.carteId}`} className="space-y-3 px-4 pb-4">
            <p className="font-body text-sm text-muted-foreground">{phraseCommission(carte)}</p>

            {!enConfirmation ? (
              <>
                {/* Deux portes, et elles se valent : rendre l'argent, ou le
                    laisser et repartir sur une carte de plus. Le collecteur est
                    devant le client quand celui-ci choisit — la seconde ne peut
                    pas être deux écrans plus loin.

                    La seconde n'apparaît que sur une carte terminée. Sur une
                    carte en cours, elle prélèverait une commission — la
                    première mise du nouveau cycle — que personne n'a demandée. */}
                <div className="flex flex-wrap gap-2">
                  <Bouton disabled={retraitBloque !== null} onClick={() => setAConfirmer(carte)}>
                    Faire le retrait
                  </Bouton>
                  {carte.cycleComplet && (
                    <ActiverCarte
                      collecteurId={collecteurId}
                      clientId={carte.clientId}
                      misePreremplie={carte.mise}
                      identifiant={`retrait-${carte.carteId}`}
                      onOuverte={onEcriture}
                    />
                  )}
                </div>
                {retraitBloque && (
                  <p className="m-0 font-body text-xs text-muted-foreground">{retraitBloque}</p>
                )}
              </>
            ) : (
              <div className="space-y-2">
                {/* Les deux faits, et pas un seul : ce qu'on rend, et ce que la
                    carte devient. */}
                <p className="rounded-md bg-info-tint p-3 font-body text-sm text-ink">
                  Confirmer le retrait de <strong>{formatMontant(carte.restituable)} FCFA</strong>{' '}
                  pour {carte.clientNom} ? La carte se clôture, c’est définitif.
                </p>
                <div className="flex gap-2">
                  <Bouton onClick={confirmer} disabled={envoi || retraitBloque !== null}>
                    {envoi ? 'Retrait…' : 'Oui, faire le retrait'}
                  </Bouton>
                  <Bouton variante="contour" onClick={() => setAConfirmer(null)} disabled={envoi}>
                    Annuler
                  </Bouton>
                </div>
                {retraitBloque && (
                  <p className="m-0 font-body text-xs text-muted-foreground">{retraitBloque}</p>
                )}
              </div>
            )}
          </div>
        )}
      </li>
    );
  }

  if (fait) {
    return (
      <div className="flex-1 flex flex-col">
        <EnTeteEcran titre="Retrait" sousTitre="Carte clôturée" onRetour={onRetour} />
        <CorpsEcran
          enfants={
            <Carte className="p-5 border-positive">
              <div className="flex items-center gap-2 mb-3">
                <Icone nom="check-circle" taille={20} className="text-positive" />
                <p className="font-headings font-bold text-lg text-ink">Carte clôturée</p>
              </div>
              <p className="font-body text-sm text-muted-foreground mb-4">
                Remets <strong className="text-ink">{formatMontant(fait.montant)} FCFA</strong> à{' '}
                {fait.nom}, en main propre. Le retrait est déjà inscrit au journal : il ne peut
                plus être défait.
              </p>
              <Bouton onClick={() => setFait(null)}>Retour aux cartes</Bouton>
            </Carte>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Le champ a quitté l'en-tête le 2026-10-02, pour le corps de l'écran,
          comme sur l'écran Clients — demande de l'exploitant, sur capture. Le
          compte de la recherche a suivi : il vit sous le champ, dans sa région
          d'annonce, et le sous-titre redevient celui de l'écran. */}
      <EnTeteEcran
        titre="Retrait"
        sousTitre="Clôturer une carte et rendre le solde"
        onRetour={onRetour}
      />

      <CorpsEcran
        enfants={
          <>
            {erreur && (
              <p role="alert" className="rounded-md bg-negative-tint p-3 font-body text-sm text-negative">
                {erreur}
              </p>
            )}

            {/* Une liste réduite sans explication se lit comme des cartes
                disparues. Le bandeau dit sur qui on est, et rend la sortie
                visible — sinon le seul moyen de revoir les autres est de
                repartir de l'accueil. */}
            {client && (
              <div className="flex items-center justify-between gap-3 rounded-md bg-info-tint px-3 py-2">
                <p className="m-0 font-body text-sm text-ink">Cartes de {client.nom}</p>
                {onToutesLesCartes && (
                  <Bouton variante="contour" onClick={onToutesLesCartes}>
                    Voir toutes les cartes
                  </Bouton>
                )}
              </div>
            )}

            {/* Recherche — le dessin de l'écran Clients, et chacun de ses choix.

                L'`input` est la surface : il porte le fond, la bordure et le
                rayon, donc l'anneau de focus du système suit sa forme et il n'y
                en a qu'un. L'icône et la croix flottent au-dessus. La bordure
                est en `trait` : `hairline` ne tenait que 1,28:1 à la limite du
                champ. */}
            {avecOutils && (
              <div>
                <div className="relative">
                  <Icone
                    nom="search"
                    taille={16}
                    // Sans `pointer-events-none`, l'icône avale le toucher qui
                    // visait le début du champ.
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    // `text` et non `search` : WebKit dessine sur `search` sa
                    // propre croix, et l'iPhone en montrait deux, dont une de
                    // 20 px qu'aucune épreuve ne touche.
                    type="text"
                    value={recherche}
                    onChange={(e) => changerRecherche(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') changerRecherche('');
                    }}
                    // « Nom du client » et non « Nom, numéro ou marché » : une
                    // carte à clôturer ne porte ni le numéro ni le marché de
                    // son client. Promettre une recherche qu'on ne fait pas,
                    // c'est lui faire taper un numéro qui ne trouvera rien.
                    placeholder="Nom du client…"
                    aria-label="Rechercher un client"
                    // Le correcteur d'iOS réécrit un nom ivoirien en mot
                    // français au deuxième caractère.
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    className="min-h-11 w-full rounded-md border border-trait bg-surface pl-10 pr-12 font-body text-champ text-ink placeholder:text-muted-foreground transition-colors focus:border-primary"
                  />
                  {recherche && (
                    <button
                      type="button"
                      onClick={() => changerRecherche('')}
                      aria-label="Effacer la recherche"
                      // 44 px : au marché, à une main, manquer une croix de
                      // 20 px efface un caractère au lieu du terme.
                      className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-pill text-muted-foreground hover:text-ink"
                    >
                      <Icone nom="x" taille={16} />
                    </button>
                  )}
                </div>
                {/* Montée avec le champ, vide tant qu'on n'a pas cherché : un
                    lecteur d'écran n'annonce que les changements d'une région
                    qu'il observe déjà. Insérée avec son texte, elle resterait
                    muette. */}
                <p
                  role="status"
                  aria-live="polite"
                  className={`px-1 font-body text-xs text-muted-foreground ${annonce ? 'mt-2' : ''}`}
                >
                  {annonce}
                </p>
              </div>
            )}

            {/* Les filtres, en segments qui disent leur compte. Le compte est
                `aria-hidden` : le nom de chaque segment reste son libellé seul,
                celui que les phrases d'annonce reprennent (« masquée par le
                filtre « Cycle terminé » »). */}
            {avecOutils && (
              <Segments
                nom="Filtrer les cartes"
                segments={FILTRES.map((f) => ({ cle: f, libelle: f, compte: comptes[f] }))}
                choisi={filtre}
                onChoisir={changerFiltre}
              />
            )}

            {!cartes && !erreur && (
              <div
                aria-hidden
                className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface"
              >
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="flex-1 space-y-2">
                      <Squelette hauteur="h-4" largeur="w-1/2" />
                      <Squelette hauteur="h-3" largeur="w-1/3" />
                    </div>
                    <Squelette hauteur="h-5" largeur="w-20" />
                  </div>
                ))}
              </div>
            )}

            {/* « Aucune carte active » sous une recherche qui ne trouve rien
                ferait croire au collecteur que toutes les cartes sont
                clôturées, alors qu'il a mal tapé un nom. */}
            {vide === 'nom' && (
              <RienAMontrer
                // `credit-card` et non `coins` : le vide porte sur des cartes,
                // pas sur de l'argent — c'est le critère que `RienAMontrer`
                // énonce pour sa liste courte, et il évite de l'élargir.
                icone="credit-card"
                titre="Aucune carte à ce nom"
                detail="Vérifie l’orthographe, ou vide le champ pour revoir toutes les cartes."
              />
            )}

            {/* Le même tort sous un filtre : la liste n'est pas vide, c'est le
                choix du segment qui ne retient rien. Le dire, et dire comment
                revenir. */}
            {vide === 'filtre' && (
              <RienAMontrer
                icone="credit-card"
                titre={filtreActif === 'En cours' ? 'Aucune carte en cours' : 'Aucun cycle terminé'}
                detail="Choisis « Toutes » pour revoir les autres cartes."
              />
            )}

            {vide === 'liste' && (
              <RienAMontrer
                icone="coins"
                titre={client ? 'Aucune carte active pour ce client' : 'Aucune carte active'}
                detail={
                  client
                    ? 'Ses cartes ont toutes été clôturées. Ouvre-lui-en une depuis sa fiche.'
                    : "Une carte apparaît ici dès qu'un client en ouvre une."
                }
              />
            )}

            {groupes.map(({ titre, membres }) =>
              membres.length === 0 ? null : (
                <section key={titre ?? 'filtre'}>
                  {titre && (
                    <h2 className="mb-2 flex items-baseline justify-between px-1 font-body text-sm font-semibold text-ink">
                      {titre}{' '}
                      <span aria-hidden className="font-mono text-xs font-medium text-muted-foreground">
                        {comptes[titre]}
                      </span>
                    </h2>
                  )}
                  <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
                    {membres.map((carte) => ligne(carte, affichees.indexOf(carte)))}
                  </ul>
                </section>
              ),
            )}

            {/* `-mx-4` : `Pagination` porte son propre retrait latéral, pensé
                pour un écran sans marge comme Clients. Posée dans `CorpsEcran`,
                qui a déjà le sien, elle se serait décalée de seize pixels de
                plus que sur l’écran voisin. Montée seulement au-delà d’une
                page : vide, son enveloppe ajouterait la marge de `space-y-4`
                sous la dernière ligne. */}
            {pages > 1 && (
              <div className="-mx-4">
                <Pagination page={page} pages={pages} total={totalFiltre} onAller={changerPage} />
              </div>
            )}
          </>
        }
      />
    </div>
  );
}
```

Avant d'enregistrer, comparer avec `git show HEAD:apps/collecteur/src/ecrans/Retrait.tsx`
les textes que les épreuves lisent : messages de blocage, annonces, vides,
bandeau du client, phrase de confirmation. Ils doivent être identiques au
caractère près. Deux écarts voulus seulement : la phrase de commission
s'accorde au singulier (« 1 mise encaissée »), et l'écran passe de la largeur
`large` à la largeur par défaut, une liste de lignes ne gagnant rien aux deux
colonnes du bureau.

- [ ] **Step 5 : Le bouton de retour des écrans secondaires**

Dans `apps/collecteur/src/ecrans/EnTeteEcran.tsx` :

1. Dans la classe du bouton de retour, remplacer `border border-hairline` par
   `border border-trait`. Le rond de 40 px sur fond `canvas` n'avait qu'une
   limite à 1,3:1 ; `trait` lui donne les 3:1 d'un composant d'interface.
2. Dans la classe du sous-titre, remplacer `text-xs` par `text-sm`.

- [ ] **Step 6 : Voir passer, construire, garder**

```bash
npm test -w @kolek/collecteur -- src/ecrans/Retrait.test.tsx src/Coquille.test.tsx
VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=sb_publishable_factice npm run build -w @kolek/collecteur
npm run verifier:champs
npm run verifier:rayons
npm run verifier:tirets
```

Attendu : tout vert. `Coquille.test.tsx` remplace `Retrait` par un témoin :
il ne doit pas bouger.

- [ ] **Step 7 : Commit**

```bash
git add apps/collecteur/src/ecrans/Retrait.tsx apps/collecteur/src/ecrans/Retrait.test.tsx apps/collecteur/src/ecrans/EnTeteEcran.tsx
git commit -m "feat(collecteur): le retrait en lignes, un depli a la fois, les segments comptes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12 : Retrait, le décompte et la carte clôturée

**Files :**
- Modify : `apps/collecteur/src/ecrans/ActiverCarte.tsx`, `apps/collecteur/src/ecrans/ActiverCarte.test.tsx`
- Modify : `packages/ui/src/Feuille.tsx` ; Create : `packages/ui/src/Feuille.test.tsx`
- Modify : `apps/collecteur/src/ecrans/Retrait.tsx`, `apps/collecteur/src/ecrans/Retrait.test.tsx`

**Interfaces :**
- Consumes : `Decompte` (tâche 5), `Tampon` (tâche 3), `CarteCollecte` avec `etiquetteSolde`, `tampon`, `close` (tâche 7), `Bouton` avec `grand` (tâche 6), les fonctions d'épreuve `lignes`, `ouvrir`, `faireLeRetrait` (tâche 11).
- Produces : `ActiverCarte` gagne `explication?: string`. « Faire le retrait » ouvre une `Feuille` nommée `Rendre <montant> FCFA ?` (espace fine insécable avant le point d'interrogation), sous-titrée `à <client>`, qui porte le décompte, l'avertissement, « Oui, rendre <montant> FCFA » et « Annuler ». L'état clôturé porte le tampon `data-tampon="Clôturée"`.

- [ ] **Step 1 : Écrire les épreuves de la phrase d'`ActiverCarte`**

Dans `apps/collecteur/src/ecrans/ActiverCarte.test.tsx`, à la fin du bloc
`describe('activer une carte de plus', …)` (avant son `});` final), ajouter :

```tsx
  it('dit ce qui reste vrai après un retrait, quand l’écran le lui donne', () => {
    render(
      <ActiverCarte
        collecteurId={COLLECTEUR}
        clientId={CLIENT}
        misePreremplie={5000}
        identifiant="essai"
        explication="La carte précédente est close. La nouvelle repart de la case 1."
        onOuverte={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));

    expect(
      screen.getByText('La carte précédente est close. La nouvelle repart de la case 1.'),
    ).toBeTruthy();
    // « son solde reste dû au client » : faux une fois l'argent rendu.
    expect(screen.queryByText(/son solde reste dû/)).toBeNull();
  });

  it('garde sa phrase, vraie en milieu comme en fin de cycle, quand on ne lui en donne pas', () => {
    render(
      <ActiverCarte
        collecteurId={COLLECTEUR}
        clientId={CLIENT}
        misePreremplie={5000}
        identifiant="essai"
        onOuverte={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));

    expect(screen.getByText(/son solde reste dû au client/)).toBeTruthy();
  });
```

- [ ] **Step 2 : Voir échouer, puis donner la phrase**

```bash
npm test -w @kolek/collecteur -- src/ecrans/ActiverCarte.test.tsx
```

Attendu : rouge « dit ce qui reste vrai après un retrait » seule.

Dans `apps/collecteur/src/ecrans/ActiverCarte.tsx` :

1. Dans la liste des propriétés déstructurées, entre `identifiant,` et
   `onOuverte,`, ajouter :

```tsx
  explication = "Celle-ci s'ajoute. Ce qui est déjà ouvert ne bouge pas, et son solde reste dû au client.",
```

2. Dans le type des propriétés, entre la ligne `identifiant: string;` (et son
   commentaire) et `onOuverte: () => void;`, ajouter :

```tsx
  /**
   * La phrase du bloc déplié. Par défaut, celle qui reste vraie à 12/31 comme
   * à 31/31 : rien de ce qui est ouvert ne bouge. L'écran de retrait, une fois
   * la carte rendue, passe la sienne : il n'y a plus de solde dû.
   */
  explication?: string;
```

3. Remplacer le paragraphe :

```tsx
      <p className="font-body text-sm text-ink m-0">
        Celle-ci s'ajoute. Ce qui est déjà ouvert ne bouge pas, et son solde reste dû au client.
      </p>
```

par :

```tsx
      <p className="font-body text-sm text-ink m-0">{explication}</p>
```

Puis :

```bash
npm test -w @kolek/collecteur -- src/ecrans/ActiverCarte.test.tsx
```

Attendu : vert.

- [ ] **Step 3 : Le voile de la feuille**

Créer `packages/ui/src/Feuille.test.tsx` :

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Feuille } from './Feuille';

afterEach(cleanup);

function rendre(onFermer = vi.fn()) {
  render(
    <Feuille titre="Rendre 30 000 FCFA ?" sousTitre="à Rokia" ouverte onFermer={onFermer}>
      <p>contenu</p>
    </Feuille>,
  );
  return onFermer;
}

describe('la feuille', () => {
  it('se nomme par son titre', () => {
    rendre();
    expect(screen.getByRole('dialog', { name: 'Rendre 30 000 FCFA ?' })).toBeTruthy();
  });

  it('voile la page de la nuit du coffre, et non de noir', () => {
    rendre();
    // Le voile est le premier des deux boutons « Fermer » : il couvre la page.
    const voile = screen.getAllByRole('button', { name: 'Fermer' })[0];
    expect(voile?.className).toContain('bg-dark-canvas/48');
    expect(voile?.className).not.toContain('bg-black');
  });

  it('se ferme à Échap', () => {
    const onFermer = rendre();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onFermer).toHaveBeenCalledOnce();
  });
});
```

```bash
npm test -w @kolek/ui -- src/Feuille.test.tsx
```

Attendu : rouge « voile la page de la nuit du coffre » seule ; les deux autres
gardent des comportements qui n'avaient pas d'épreuve.

Dans `packages/ui/src/Feuille.tsx` :

1. Dans la classe du voile, remplacer `bg-black/50` par `bg-dark-canvas/48`.
   Le noir pur écrasait un écran vert ; la nuit du coffre le prolonge.
2. Dans la classe de la poignée, remplacer `bg-hairline` par `bg-trait/50`.

```bash
npm test -w @kolek/ui -- src/Feuille.test.tsx
npm run typecheck -w @kolek/ui
```

Attendu : vert.

- [ ] **Step 4 : Adapter les épreuves du retrait à la feuille**

Dans `apps/collecteur/src/ecrans/Retrait.test.tsx` :

0. Ajouter en tête du fichier, avant l'import de `@testing-library/react` :

```tsx
import { formatMontant } from '@kolek/core';
```

   `formatMontant` sépare les milliers par une espace insécable (U+00A0) :
   une épreuve qui compare un `textContent` passe par lui, ou par `\s` dans
   une expression, jamais par une espace tapée.

1. Remplacer l'épreuve « nomme les deux faits dans la confirmation » entière par :

```tsx
  it('nomme les deux faits dans la confirmation', () => {
    rendre();

    faireLeRetrait('Hj');

    // Ce qu'on rend, dans le titre ; ce que la carte devient, juste dessous. Le
    // taire serait pire que le dire.
    const feuille = screen.getByRole('dialog', { name: /^Rendre 30\s000 FCFA\s\?$/ });
    expect(
      within(feuille).getByText(
        'La carte se clôture. C’est définitif : le retrait ne pourra pas être défait.',
      ),
    ).toBeTruthy();
  });
```

2. Dans tout le fichier, remplacer `{ name: 'Oui, faire le retrait' }` par
   `{ name: /^Oui, rendre/ }` (cinq occurrences : deux dans « le retrait
   attend la file et le réseau », deux dans « les filtres », une dans « la
   pagination »).

3. Dans « ne laisse pas valider une confirmation ouverte quand une mise de la
   carte entre en file », remplacer
   `expect(screen.getByText('1 mise de cette carte pas encore envoyée.')).toBeTruthy();`
   par :

```tsx
    // Dite deux fois, dans le dépli derrière et dans la feuille : c'est la
    // feuille qui compte, elle porte le bouton.
    expect(
      within(screen.getByRole('dialog')).getByText('1 mise de cette carte pas encore envoyée.'),
    ).toBeTruthy();
```

4. À la fin du fichier, ajouter :

```tsx
/**
 * Le décompte, avant le geste qui ne se défait pas (2026-10-02).
 *
 * La confirmation était une phrase : « Confirmer le retrait de 30 000 FCFA
 * pour Hj ? ». Elle devient un décompte de caisse, que le collecteur peut lire
 * au client avant de payer : les mises, la commission, le total sous un double
 * filet.
 */
describe('le décompte', () => {
  /** « − » puis l'espace fine insécable : la retenue telle que `Decompte` l'écrit. */
  const MOINS = String.fromCharCode(0x2212, 0x202f);

  function feuille() {
    return screen.getByRole('dialog', { name: /^Rendre 30\s000 FCFA\s\?$/ });
  }

  it('compte les mises, retire la commission, et tombe sur le montant du serveur', () => {
    rendre();
    faireLeRetrait('Hj');

    expect(within(feuille()).getByText('à Hj')).toBeTruthy();
    expect(within(feuille()).getAllByRole('term').map((t) => t.textContent)).toEqual([
      `31 mises × ${formatMontant(1000)}`,
      'Ta commission, case 1',
      'À rendre',
    ]);
    expect(within(feuille()).getAllByRole('definition').map((d) => d.textContent)).toEqual([
      formatMontant(31000),
      `${MOINS}${formatMontant(1000)}`,
      `${formatMontant(30000)} FCFA`,
    ]);
  });

  it('ne montre que le total quand les lignes ne tombent pas juste', () => {
    // Le serveur a le dernier mot sur le montant. Un décompte qui ne retombe
    // pas sur lui, lu devant le client, serait pire que pas de décompte.
    donnees = [{ ...CARTE_PLEINE_HJ, restituable: 29000 }];
    rendre();
    faireLeRetrait('Hj');

    const d = screen.getByRole('dialog', { name: /^Rendre 29\s000 FCFA\s\?$/ });
    expect(within(d).getAllByRole('term').map((t) => t.textContent)).toEqual(['À rendre']);
  });

  it('répète le montant sur le bouton : on sait ce qu’on confirme', () => {
    rendre();
    faireLeRetrait('Hj');

    expect(
      within(feuille()).getByRole('button', { name: /^Oui, rendre 30\s000 FCFA$/ }),
    ).toBeTruthy();
  });

  it('se referme par « Annuler » sans rien écrire', () => {
    rendre();
    faireLeRetrait('Hj');

    fireEvent.click(within(feuille()).getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cloturerCarte).not.toHaveBeenCalled();
  });

  it('ne se referme pas pendant que le retrait part', async () => {
    let repondre: (valeur: unknown) => void = () => {};
    cloturerCarte.mockReturnValue(new Promise((r) => (repondre = r)));
    rendre();
    faireLeRetrait('Hj');

    fireEvent.click(within(feuille()).getByRole('button', { name: /^Oui, rendre/ }));
    fireEvent.keyDown(window, { key: 'Escape' });

    // Fermer ici cacherait la réponse du serveur : le collecteur ne saurait pas
    // s'il doit rendre l'argent.
    expect(screen.getByRole('dialog')).toBeTruthy();
    await act(async () => repondre({ ok: true, montantRestitue: 30000 }));
  });
});

/** Clôturée : le tampon, et ce qu'il reste à faire de la main. */
describe('la carte clôturée', () => {
  async function retirer(nom: string, rang = 0) {
    faireLeRetrait(nom, rang);
    fireEvent.click(screen.getByRole('button', { name: /^Oui, rendre/ }));
    return screen.findByText(/^Remets/);
  }

  it('dit ce qu’il reste à faire : remettre l’argent, en main propre', async () => {
    const onEcriture = vi.fn();
    rendre({ onEcriture });

    expect((await retirer('Hj')).textContent).toMatch(/^Remets 30\s000 FCFA à Hj, en main propre\.$/);
    expect(
      screen.getByText('Le retrait est inscrit au journal. Il ne peut plus être défait.'),
    ).toBeTruthy();
    expect(screen.getByText('Carte clôturée')).toBeTruthy();
    expect(cloturerCarte).toHaveBeenCalledWith('k1');
    expect(onEcriture).toHaveBeenCalledOnce();
  });

  it('pose le tampon CLÔTURÉE sur la carte rendue', async () => {
    rendre();
    await retirer('Hj');

    expect(document.querySelector('[data-tampon]')?.getAttribute('data-tampon')).toBe('Clôturée');
    expect(screen.getByText('Rendu au client')).toBeTruthy();
  });

  it('propose une carte de plus après un cycle complet, avec la phrase d’après le retrait', async () => {
    rendre();
    await retirer('Hj');

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));

    expect(
      screen.getByText('La carte précédente est close. La nouvelle repart de la case 1.'),
    ).toBeTruthy();
    expect(screen.queryByText(/son solde reste dû/)).toBeNull();
  });

  it('ne propose pas de carte de plus après un retrait anticipé, ni de case à venir', async () => {
    cloturerCarte.mockResolvedValue({ ok: true, montantRestitue: 15000 });
    rendre();
    await retirer('Hj', 1);

    expect(screen.queryByRole('button', { name: 'Activer une carte' })).toBeNull();
    // Close à 4/31 : sa cinquième case n'attend plus rien.
    expect(document.querySelectorAll('[data-etat]')).toHaveLength(31);
    expect(document.querySelectorAll('[data-etat="prochaine"]')).toHaveLength(0);
  });

  it('revient aux cartes', async () => {
    rendre();
    await retirer('Hj');

    fireEvent.click(screen.getByRole('button', { name: 'Retour aux cartes' }));

    expect(lignes()).toHaveLength(3);
  });
});
```

- [ ] **Step 5 : Les voir échouer**

```bash
npm test -w @kolek/collecteur -- src/ecrans/Retrait.test.tsx
```

Attendu : rouges celles qui cherchent la feuille, « Oui, rendre » ou l'état
clôturé (« nomme les deux faits », les deux confirmations du §7, les deux
fermetures de « les filtres » et « la pagination », tout « le décompte » et
toute « la carte clôturée »). Les autres restent vertes.

- [ ] **Step 6 : La feuille du décompte et la carte clôturée**

Dans `apps/collecteur/src/ecrans/Retrait.tsx` :

1. Remplacer le bloc d'imports de `@kolek/ui` et celui de `react` :

```tsx
import {
  Bouton,
  Carte,
  Icone,
  Pagination,
  Segments,
  Squelette,
  useEnLigne,
  usePagination,
} from '@kolek/ui';
import { useState } from 'react';
```

par :

```tsx
import {
  Bouton,
  CarteCollecte,
  Decompte,
  Feuille,
  Icone,
  Pagination,
  Segments,
  Squelette,
  Tampon,
  useEnLigne,
  usePagination,
} from '@kolek/ui';
import { useCallback, useState } from 'react';
```

2. Juste après la ligne `const pluriel = (n: number) => (n > 1 ? 's' : '');`,
   ajouter :

```tsx
/** L'espace fine insécable (U+202F) d'avant le point d'interrogation, écrite
    par son code : une séquence d'échappement tapée se perd en route. */
const FINE = String.fromCharCode(0x202f);

/**
 * Le décompte d'un retrait, ligne à ligne, quand il se vérifie.
 *
 * Le montant à rendre vient du serveur (`restituable`). Les lignes, elles, se
 * calculent ici, et ne s'affichent que si elles retombent exactement sur ce
 * montant : un décompte qui ne tombe pas juste, lu devant le client, serait
 * pire que pas de décompte. Le total reste alors seul.
 */
function DecompteRetrait({
  carte,
  estCollaborateur,
}: {
  carte: CarteCloturable;
  estCollaborateur: boolean;
}) {
  const n = carte.misesEncaissees;
  if (n === 0) {
    return (
      <p className="font-body text-sm text-muted-foreground">
        Aucune mise encaissée : rien à rendre, rien à garder.
      </p>
    );
  }

  const brut = n * carte.mise;
  const lignes =
    brut - carte.mise === carte.restituable
      ? [
          {
            libelle: (
              <>
                <span className="font-mono">{n}</span> mise{pluriel(n)} ×{' '}
                <span className="font-mono">{formatMontant(carte.mise)}</span>
              </>
            ),
            montant: brut,
          },
          {
            libelle: estCollaborateur ? 'Part de ton titulaire, case 1' : 'Ta commission, case 1',
            montant: -carte.mise,
          },
        ]
      : [];

  return <Decompte lignes={lignes} total={{ libelle: 'À rendre', montant: carte.restituable }} />;
}
```

3. Remplacer la ligne
   `const [fait, setFait] = useState<{ nom: string; montant: number } | null>(null);`
   par :

```tsx
  /** Le retrait inscrit : la carte telle qu'elle était, le montant que le
      serveur a rendu, et l'heure, celle du tampon. */
  const [fait, setFait] = useState<{
    carte: CarteCloturable;
    montant: number;
    quand: Date;
  } | null>(null);
```

4. Juste après la fonction `basculer` (avant le commentaire « Ce que la
   recherche a trouvé »), ajouter :

```tsx
  /**
   * La feuille ne se ferme pas pendant que le retrait part : la fermer
   * cacherait la réponse du serveur. Stable d'un rendu à l'autre, parce que
   * `Feuille` reprend le focus chaque fois que cette fonction change.
   */
  const fermerDecompte = useCallback(() => {
    if (!envoi) setAConfirmer(null);
  }, [envoi]);
```

5. Dans `confirmer`, remplacer
   `setFait({ nom: aConfirmer.clientNom, montant: resultat.montantRestitue });`
   par
   `setFait({ carte: aConfirmer, montant: resultat.montantRestitue, quand: new Date() });`.

6. Remplacer la fonction `ligne` entière par :

```tsx
  function ligne(carte: CarteCloturable, rang: number) {
    const deplie = ouverte === carte.carteId;
    const retraitBloque = retraitBloquePour(carte.carteId);

    return (
      <li
        key={carte.carteId}
        className={`relative ${premier ? 'anim-cascade' : ''}`}
        style={rangCascade(rang, premier)}
      >
        {/* Le trait d'un cycle terminé : la carte qu'on vient rendre se voit
            avant qu'on lise son compteur. */}
        {carte.cycleComplet && (
          <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-positive" />
        )}
        <button
          type="button"
          aria-expanded={deplie}
          aria-controls={deplie ? `depli-${carte.carteId}` : undefined}
          onClick={() => basculer(carte.carteId)}
          className="anim-pression flex w-full cursor-pointer items-center gap-3 py-3 pl-4 pr-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-body text-base font-semibold text-ink">
              {carte.clientNom}
            </span>
            <span className="mt-0.5 block font-body text-xs text-muted-foreground">
              <span className="font-mono">
                {carte.misesEncaissees}/{MISES_PAR_CYCLE}
              </span>{' '}
              · <span className="font-mono">{formatMontant(carte.mise)}</span>/j
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-mono text-base font-medium text-ink tabular-nums">
              {formatMontant(carte.restituable)}{' '}
              <span className="font-body text-xs font-medium text-muted-foreground">FCFA</span>
            </span>
            <span className="block font-body text-xs text-muted-foreground">à rendre</span>
          </span>
          <Icone
            nom="chevron-down"
            taille={16}
            className={`shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${deplie ? 'rotate-180' : ''}`}
          />
        </button>

        {deplie && (
          <div id={`depli-${carte.carteId}`} className="space-y-3 px-4 pb-4">
            <p className="font-body text-sm text-muted-foreground">{phraseCommission(carte)}</p>

            {/* Deux portes, et elles se valent : rendre l'argent, ou le laisser
                et repartir sur une carte de plus. Le collecteur est devant le
                client quand celui-ci choisit — la seconde ne peut pas être deux
                écrans plus loin.

                La seconde n'apparaît que sur une carte terminée. Sur une carte
                en cours, elle prélèverait une commission — la première mise du
                nouveau cycle — que personne n'a demandée. */}
            <div className="flex flex-wrap gap-2">
              <Bouton disabled={retraitBloque !== null} onClick={() => setAConfirmer(carte)}>
                Faire le retrait
              </Bouton>
              {carte.cycleComplet && (
                <ActiverCarte
                  collecteurId={collecteurId}
                  clientId={carte.clientId}
                  misePreremplie={carte.mise}
                  identifiant={`retrait-${carte.carteId}`}
                  onOuverte={onEcriture}
                />
              )}
            </div>
            {retraitBloque && (
              <p className="m-0 font-body text-xs text-muted-foreground">{retraitBloque}</p>
            )}
          </div>
        )}
      </li>
    );
  }

  /** Relu à chaque rendu : entre l'ouverture de la feuille et le geste, une
      mise a pu entrer dans la file, ou le réseau tomber. */
  const bloqueConfirmation = aConfirmer ? retraitBloquePour(aConfirmer.carteId) : null;
```

7. Remplacer le bloc `if (fait) { … }` entier par :

```tsx
  if (fait) {
    return (
      <div className="flex flex-1 flex-col">
        <EnTeteEcran titre="Retrait" sousTitre="Carte clôturée" onRetour={onRetour} />
        <CorpsEcran
          enfants={
            <>
              {/* La carte rendue, et le tampon du geste : le même que celui de
                  l'encaissement, parce que c'est la même chose, un geste qui ne
                  se défait pas. */}
              <CarteCollecte
                nomClient={fait.carte.clientNom}
                misePar={formatMontant(fait.carte.mise)}
                jourCourant={fait.carte.misesEncaissees}
                solde={formatMontant(fait.montant)}
                etiquetteSolde="Rendu au client"
                close
                tampon={<Tampon mot="Clôturée" quand={fait.quand} />}
              />

              {/* Ce qu'il reste à faire de la main : remettre l'argent. */}
              <div role="status" className="space-y-1">
                <p className="font-headings text-xl font-bold text-ink">
                  Remets <span className="font-mono font-medium">{formatMontant(fait.montant)}</span>{' '}
                  FCFA à {fait.carte.clientNom}, en main propre.
                </p>
                <p className="font-body text-sm text-muted-foreground">
                  Le retrait est inscrit au journal. Il ne peut plus être défait.
                </p>
              </div>

              <div className="space-y-3">
                <Bouton pleineLargeur onClick={() => setFait(null)}>
                  Retour aux cartes
                </Bouton>
                {/* Le cycle était complet : le client peut repartir sur une
                    carte de plus, tout de suite. La phrase par défaut du bloc
                    (« son solde reste dû au client ») serait fausse ici : il
                    vient d'être rendu. */}
                {fait.carte.cycleComplet && (
                  <ActiverCarte
                    collecteurId={collecteurId}
                    clientId={fait.carte.clientId}
                    misePreremplie={fait.carte.mise}
                    identifiant={`cloturee-${fait.carte.carteId}`}
                    explication="La carte précédente est close. La nouvelle repart de la case 1."
                    onOuverte={onEcriture}
                  />
                )}
              </div>
            </>
          }
        />
      </div>
    );
  }
```

8. Remplacer la fin du fichier :

```tsx
          </>
        }
      />
    </div>
  );
}
```

par :

```tsx
          </>
        }
      />

      {/* Le décompte, avant le geste qui ne se défait pas. Le titre porte le
          montant, qui tient sur la ligne tronquée d'une feuille ; le nom du
          client, qui peut être long, passe dessous. */}
      {aConfirmer && (
        <Feuille
          ouverte
          titre={`Rendre ${formatMontant(aConfirmer.restituable)} FCFA${FINE}?`}
          sousTitre={`à ${aConfirmer.clientNom}`}
          onFermer={fermerDecompte}
        >
          <DecompteRetrait carte={aConfirmer} estCollaborateur={estCollaborateur} />
          <p className="rounded-md bg-info-tint p-3 font-body text-sm text-ink">
            La carte se clôture. C’est définitif : le retrait ne pourra pas être défait.
          </p>
          {bloqueConfirmation && (
            <p className="m-0 font-body text-xs text-muted-foreground">{bloqueConfirmation}</p>
          )}
          <div className="space-y-2">
            <Bouton
              pleineLargeur
              grand
              onClick={confirmer}
              disabled={envoi || bloqueConfirmation !== null}
            >
              {envoi ? (
                'Retrait…'
              ) : (
                <>
                  Oui, rendre{' '}
                  <span className="font-mono font-medium">
                    {formatMontant(aConfirmer.restituable)}
                  </span>{' '}
                  FCFA
                </>
              )}
            </Bouton>
            <Bouton pleineLargeur variante="contour" onClick={fermerDecompte} disabled={envoi}>
              Annuler
            </Bouton>
          </div>
        </Feuille>
      )}
    </div>
  );
}
```

9. Dans le commentaire qui précède `const fermer = () => {`, remplacer
   `« Oui, faire le retrait » sous le doigt` par
   `« Oui, rendre » sous le doigt`.

- [ ] **Step 7 : Voir passer, construire, garder**

```bash
npm test -w @kolek/collecteur -- src/ecrans/Retrait.test.tsx src/ecrans/ActiverCarte.test.tsx src/Coquille.test.tsx
npm test -w @kolek/ui
npm run typecheck -w @kolek/ui
VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=sb_publishable_factice npm run build -w @kolek/collecteur
npm run verifier:tirets
npm run verifier:contraste
```

Attendu : tout vert. Seul le collecteur emploie `Feuille` ; l'administration
et la vitrine se construisent à la tâche 14.

- [ ] **Step 8 : Commit**

```bash
git add apps/collecteur/src/ecrans/ActiverCarte.tsx apps/collecteur/src/ecrans/ActiverCarte.test.tsx packages/ui/src/Feuille.tsx packages/ui/src/Feuille.test.tsx apps/collecteur/src/ecrans/Retrait.tsx apps/collecteur/src/ecrans/Retrait.test.tsx
git commit -m "feat(collecteur): le retrait par decompte, et la carte cloturee sous son tampon

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13 : Le document de référence

**Files :**
- Modify : `Docs/Kolek Design System.md`

Aucune épreuve : c'est un texte. Chaque remplacement ci-dessous part d'un
passage exact du fichier ; s'il ne se trouve pas tel quel, s'arrêter et le
signaler plutôt que d'écrire à côté.

- [ ] **Step 1 : L'en-tête**

Après la ligne qui commence par `> **v2 — 2026-08-16.**`, ajouter :

```markdown
>
> **Le billet — 2026-10-02.** Le collecteur prend le langage de la vitrine : vert coffre, gravure discrète, montants en chiffres de caisse. Accueil, Encaisser et Retrait d'abord ; les autres écrans suivent, puis l'administration. Conception : `Docs/specs/2026-10-02-refonte-le-billet-design.md`.
```

- [ ] **Step 2 : §3.1, le jeton `trait` et les dégradés**

1. Après la ligne du tableau des neutres
   `` | `--color-hairline` / `--color-border` | `#E6E3DA` | Bordures, séparateurs (1 px). | ``,
   ajouter :

```markdown
| `--color-trait` | `#858B81` | Limite de ce qu'on touche : champ de recherche, segments, case à venir de la carte (40 %), points de conduite (50 %). 3,5:1 sur `surface`, 3,2:1 sur `canvas` : les 3:1 que WCAG 1.4.11 demande à la limite d'un contrôle. `hairline` sépare, `trait` délimite. |
```

2. Remplacer :

```markdown
**Dégradés.** Ils ne tombent dans aucun espace de noms Tailwind : aucune classe n'en sort, et on les consomme par `bg-[image:var(--degrade-carte)]`. Les garder dans `tokens.ts` est ce qui empêche la carte de collecte et la carte de zone de diverger.

| Token | Usage |
|---|---|
| `--degrade-carte` | Carte de collecte (héros). |
| `--degrade-zone-0…3` | Bandeau de tête des cartes de zone, par index. |
```

par :

```markdown
**Dégradés.** Ils ne tombent dans aucun espace de noms Tailwind : aucune classe n'en sort, et on les consomme par `bg-[image:var(--degrade-hero)]`. Les garder dans `tokens.ts` est ce qui empêche la vitrine et l'application de diverger.

| Token | Usage |
|---|---|
| `--degrade-hero` | La nuit d'un coffre : hero de la vitrine, en-tête de l'accueil du collecteur, bande de l'encaissement, écrans de connexion. |
| `--degrade-zone-0…3` | Bandeau de tête des cartes de zone, par index. |

`--degrade-carte` est parti le 2026-10-02 avec l'ancienne carte de collecte : le billet est une surface, pas un dégradé (§4.4).
```

- [ ] **Step 3 : §3.2, les trois familles et la règle des montants**

1. Remplacer :

```markdown
- **Police UI :** `Plus Jakarta Sans` (repli `Inter`, puis `system-ui`) → `--font-body`, classe `font-body`.
- **Police display / marque :** `Sora` → `--font-headings`, classe `font-headings`.
```

par :

```markdown
- **Police UI :** `Instrument Sans` (variable, repli `system-ui`) → `--font-body`, classe `font-body`. Texte, boutons, libellés, l'unité « FCFA ».
- **Police display / marque :** `Bricolage Grotesque` (variable) → `--font-headings`, classe `font-headings`. Titres, nom du client sur la carte, total du jour. Les deux ont remplacé `Plus Jakarta Sans` et `Sora` le 2026-09-17.
- **Chiffres de caisse :** `IBM Plex Mono` 500 → `--font-mono`, classe `font-mono`. Tout montant qu'on compte (soldes, mises, relevés, décompte, reçus), les compteurs (`29/31`), les heures, les numéros de reçu. **Un montant qu'on compte est en Plex Mono ; le total du jour est en Bricolage, c'est l'affiche.** Jamais une phrase en chasse fixe : dans « 23 mises · dernière à 11:42 », seuls `23` et `11:42` le sont. Le collecteur ne charge que la graisse 500, sous-ensemble latin.
```

2. Dans la puce « Jamais deux familles dans un même titre », remplacer
   `Le seul titre qui mélange Sora et Bodoni` par
   `Le seul titre qui mélange Bricolage et Bodoni`.

3. Dans le tableau des styles, avant la ligne `| Metric XL |`, ajouter :

```markdown
| Total du jour | `text-total` | 44 px | 700 | Le seul total de l'accueil du collecteur, à partir de `xs` (390 px) ; dessous, `text-4xl`. |
```

   et remplacer la ligne
   `` | Montant de carte | `text-2xl` | 24 px | 700 | Solde restituable, saisie de mise. | ``
   par :

```markdown
| Montant de caisse | `text-3xl` | 28 px | 500 · `font-mono` | La mise du jour, au bloc de caisse de l'encaissement. |
| Montant de carte | `text-2xl` | 24 px | 500 · `font-mono` | Solde de la carte de collecte, total d'un décompte. |
```

- [ ] **Step 4 : §3.5 et §3.6**

1. Dans la ligne de `--shadow-action`, remplacer
   `**Uniquement** le bouton d'encaissement de la barre mobile.` par
   `**Uniquement** les deux commandes d'encaissement : la touche de la barre mobile et le bouton du bloc de caisse.`

2. Remplacer la puce
   `- Icônes d'action dans un cercle : contour `primary` sur fond blanc.`
   par :

```markdown
- Icônes d'action dans un cercle, contour `primary` sur fond blanc : l'administration seulement, jusqu'à sa refonte. Le collecteur pose l'icône nue, en `primary`, à gauche du libellé (`Outils`, §4.9).
- **Une icône dit le geste, pas la monnaie.** `banknote` pour encaisser, `scale` pour le rapprochement, `receipt-text` pour les reçus : `circle-dollar-sign` et `receipt` portaient un « $ » dans un produit en FCFA. Ils restent au registre pour les écrans qui ne sont pas encore passés au billet.
```

- [ ] **Step 5 : §4.1 à §4.9**

1. Dans l'inventaire, remplacer chacune des lignes de `CarteCollecte`,
   `NavMobile` et `ActionsRapides`, à sa place, par la ligne correspondante :

```markdown
| `CarteCollecte` | `CarteCollecte.tsx` | Le billet : 31 cases, solde en Plex Mono, place pour un tampon (§4.4). |
| `NavMobile` | `NavMobile.tsx` | Barre du bas ; « Encaisser » en touche dans la barre (§4.2). |
| `ActionsRapides` | `ActionsRapides.tsx` | Grille d'icônes rondes, variante compacte. Administration seulement (§4.9). |
```

   et, après la ligne de `Filet`, ajouter :

```markdown
| `Outils` | `Outils.tsx` | Les outils de l'accueil du collecteur, boutons neutres (§4.9). |
| `Segments` | `Segments.tsx` | Choix exclusifs, chacun avec son compte (§4.6). |
| `Decompte` | `Decompte.tsx` | Décompte de caisse, total sous un double filet (§4.17). |
| `Tampon` | `Tampon.tsx` | La marque d'un geste qui ne se défait pas (§4.16). |
| `Feuille` | `Feuille.tsx` | Panneau flottant : feuille sur téléphone, boîte sur écran large. Voile `dark-canvas` à 48 %. |
| `Onde`, `Rosace` | `Guilloche.tsx` | La gravure (§4.18). `Onde traitFixe` pour une bande basse. |
```

2. Dans §4.2, remplacer
   `L'onglet **Encaisser** sort de la barre : pastille pleine de 56 px, ombre `shadow-action`.`
   par
   `L'onglet **Encaisser** est une touche dans la barre : rectangle `primary` de 64 × 48 px, rayon `lg`, icône `banknote`, ombre `shadow-action`. L'onglet ouvert prend l'encre `primary` et un filet de 2 px au-dessus de son icône, et porte `aria-current="page"`.`

3. Remplacer le titre et le paragraphe de §4.4 :

```markdown
### 4.4 Carte de collecte (héros, dégradé)
`rounded-xl`, `--degrade-carte`, deux cercles décoratifs en dégradé radial. Affiche : cycle, nom du client, mise journalière, **progression sur 31 cases** en grille de 16 colonnes, solde restituable, avancement en pourcentage. Le nombre de cases vient de `MISES_PAR_CYCLE` dans `@kolek/core` : c'est une règle du métier, pas une valeur de maquette.
```

par :

```markdown
### 4.4 Carte de collecte (le billet)
Fond `surface`, filet `hairline`, `rounded-xl`, et une `Onde` fine en vert coffre à 30 % sur le bord haut : c'est elle qui fait de la carte un billet. Nom du client en Bricolage `text-xl` ; « Mise / jour » et son montant en Plex Mono ; pastille du cycle quand l'écran le connaît (`cycle` est facultatif : l'accueil et l'encaissement ne le savent pas, et « Cycle 1 » écrit en dur y était faux). Les **31 cases** sur seize colonnes, huit sous 240 px : payées en `primary`, la prochaine cerclée de 2 px, celle qu'on vient de payer en `positive`, les autres en `canvas` bordées de `trait` à 40 %. Une carte close (`close`) ne cercle plus rien. Solde en Plex Mono `text-2xl`, compteur `29/31` d'un seul tenant. Trois emplacements : un surtitre, un tampon, des commandes. Plus de dégradé, de cercles ni de verre. Le nombre de cases vient de `MISES_PAR_CYCLE` dans `@kolek/core` : c'est une règle du métier, pas une valeur de maquette.
```

4. Dans §4.5, remplacer les deux premières lignes du tableau :

```markdown
| **Primaire** | Pilule pleine `primary`, texte blanc, icône optionnelle. |
| **Contour** | Pilule contour `primary`, fond blanc, texte vert. |
```

par :

```markdown
| **Primaire** | Rectangle plein `primary`, `rounded-md`, texte blanc, icône optionnelle. |
| **Contour** | Rectangle `rounded-md`, contour `primary`, fond blanc, texte vert. |
```

   et, après le paragraphe « Hauteur minimale **44 px** partout… », ajouter :

```markdown
**`grand`** : 56 px et `text-lg`, pour le geste d'un écran qui fait bouger l'argent (« Encaisser », « Oui, rendre 30 000 FCFA »). **`nomAccessible`** : le nom que lit un lecteur d'écran quand le libellé visible ne désigne pas l'objet (« Encaisser 2 000 FCFA sur la carte de Mariam Traoré » pour un bouton qui dit « Encaisser 2 000 »). Il commence toujours par le libellé visible.
```

5. Remplacer le titre `### 4.6 Pilules de filtre` par
   `### 4.6 Pilules de filtre et segments`, et ajouter à la fin de la section :

```markdown
**Segments** (`Segments`) : trois ou quatre choix exclusifs dans une piste `muted` au rayon `lg`, chacun avec son compte en Plex Mono. Le choisi prend `surface`, une bordure `trait` et `shadow-sm`. `aria-pressed` dit lequel est choisi ; le compte est `aria-hidden`, le nom d'un segment est son libellé seul. Le retrait s'en sert ; les pilules restent ailleurs jusqu'à la refonte de leurs écrans.
```

6. Remplacer §4.9 entière :

```markdown
### 4.9 Grille d'actions rapides
Icônes rondes à contour vert + label court : **Encaisser, Souscrire, Retrait, Bilan, Rapproch., Reçus, Alertes, Plus**. Variante `compact` (48 px) pour le Dashboard.
```

par :

```markdown
### 4.9 Outils et actions rapides
**Collecteur, `Outils`.** Deux colonnes, quatre sur écran large, de boutons neutres : fond `surface`, filet `hairline`, rayon `lg`, 52 px de haut, icône `primary` à gauche, libellé `text-sm` gras. Pas de couleur par famille : c'est la liste des autres écrans, pas un tableau de bord. « Encaisser » et « Bilan » n'y sont pas, la barre du bas les porte.

**Administration, `ActionsRapides`.** Icônes rondes à contour vert et label court, variante `compact` (48 px), jusqu'à la refonte de l'administration.
```

- [ ] **Step 6 : Trois sections neuves**

Après la section `### 4.15 États` (avant la ligne `---` qui la suit), ajouter :

```markdown
### 4.16 Tampon
Le geste qui ne se défait pas laisse une marque, comme au guichet. Cadre double, mot en capitales espacées (Bricolage 800), date et heure en Plex Mono (`02.10 · 11:47`), incliné de six degrés, posé en haut à droite de la carte de collecte : il ne cache ni les cases ni le solde.

| Mot | Couleur | Quand |
|---|---|---|
| ENCAISSÉ | `positive` | La mise est partie au serveur. |
| GARDÉE | `info` | La mise attend dans la file du téléphone. |
| CLÔTURÉE | `positive` | Le retrait est inscrit. |

Une mise refusée ne reçoit **aucun** tampon : un ENCAISSÉ sur un refus mentirait. Dans le doute, GARDÉE, l'état qui ne promet rien. Le tampon est `aria-hidden` : la ligne d'état (`role="status"`) dit la même chose. Il se plaque en `--duree-toucher` (150 ms, échelle 1,15 vers 1) ; sous `prefers-reduced-motion`, il paraît sans mouvement.

### 4.17 Décompte
Des lignes « libellé, points de conduite, montant », puis le total sous un double filet `ink`. Les montants en Plex Mono ; une retenue s'écrit `−` (U+2212), espace fine insécable, valeur absolue. Le retrait s'en sert avant le geste : « 31 mises × 1 000 », « Ta commission, case 1 », « À rendre ». Les lignes ne s'affichent que si elles retombent sur le montant du serveur ; sinon le total reste seul.

### 4.18 Gravure
La signature, et elle se mérite : trois places, pas une de plus.

1. L'en-tête de l'accueil du collecteur : `Rosace` en filigrane (22 pétales, excentricité 0,38) et `Onde` en pied, or à 15 et 25 %. La rosace ne tourne plus.
2. La bande de l'encaissement : `Onde` seule, or à 30 %.
3. Le bord haut de chaque carte de collecte : `Onde` fine (10 px), vert coffre à 30 %.

Les trois ondes passent `traitFixe` : le trait garde un demi-pixel à l'écran. Sans lui, une bande de 10 à 24 px écrase le trait du `viewBox` entre 0,06 et 0,14 px, et la gravure s'efface.

L'or ne dit jamais un montant ni un état. Les écrans secondaires ne portent pas de gravure.
```

- [ ] **Step 7 : §7, la règle des montants**

Dans « **À faire** », après la puce
`- Chiffres tabulaires et `formatMontant()` partout.`, ajouter :

```markdown
- Un montant qu'on compte en `font-mono`, le nombre seul : jamais la phrase qui l'entoure.
```

- [ ] **Step 8 : Relire, puis commit**

```bash
git diff --stat -- "Docs/Kolek Design System.md"
git add "Docs/Kolek Design System.md"
git commit -m "docs(design-system): le billet, trait, Plex Mono, tampon, decompte et gravure

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14 : Vérification d'ensemble

**Files :** aucun fichier suivi. Les scripts de contrôle vivent dans le
répertoire temporaire de la session (`$SCRATCH` ci-dessous, celui où la tâche 0
a copié `vitrine-avant`), jamais dans le dépôt.

```bash
SCRATCH="C:/Users/ME687~1.BER/AppData/Local/Temp/claude/c--Users-M-BERTHE-Documents-Kolek/45f53cb2-c981-4f87-97b9-13e1c9e92d3c/scratchpad"
```

- [ ] **Step 1 : Les gardes, sans `db:reset` ni `test:db`**

`npm run verifier` commence par `db:reset`, refusé sur ce poste. La même
chaîne, sans lui ni `test:db` :

```bash
cd "C:/Users/M.BERTHE/Documents/Kolek/.claude/worktrees/refonte-billet"
npm run verifier:theme && npm run verifier:marque && npm run verifier:paliers && npm run verifier:cgu \
  && npm run verifier:champs && npm run verifier:rayons && npm run verifier:contraste && npm run verifier:tirets \
  && npm run verifier:exemples-env && npm run verifier:manifeste && npm run verifier:portillons \
  && npm run verifier:mentions && npm run verifier:routes && npm run verifier:sitemap && npm run verifier:ignore \
  && npm run verifier:lint && npm run typecheck --workspaces --if-present && npm test && npm run test:scripts
```

Attendu : code de sortie 0, et le nombre d'épreuves de chaque espace
supérieur ou égal à celui relevé à la tâche 0.

- [ ] **Step 2 : Les trois fronts, construits**

```bash
VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=sb_publishable_factice npm run build
npm run verifier:bundles
grep -c "data-carte-collecte" apps/site/dist/index.html
```

Attendu : construction verte de chaque espace qui en a une (collecteur,
administration, vitrine), aucun motif de fuite, et `1` (la carte du téléphone
de la vitrine, prérendue).

- [ ] **Step 3 : Ce que `test:db` aurait vu**

`supabase/tests` importe des modules du collecteur et de `@kolek/core` ; la
suite ne tourne pas ici. Aucun de ces fichiers ne doit avoir bougé :

```bash
BASE=$(git merge-base HEAD origin/main)
git diff --name-only "$BASE" -- apps/collecteur/src/lectures-ecrans.ts apps/collecteur/src/supabase.ts \
  apps/collecteur/src/hors-ligne/gestes.ts apps/collecteur/src/hors-ligne/stockage-local.ts \
  apps/collecteur/src/hors-ligne/rafraichir.ts apps/collecteur/src/hors-ligne/file.ts \
  apps/collecteur/src/hors-ligne/envoyer.ts apps/collecteur/src/hors-ligne/synchroniseur.ts \
  apps/collecteur/src/hors-ligne/modele.ts packages/core/src/mouvements.ts packages/core/src/calcul.ts
grep -rn "degrade\|tuile\|ActionsRapides\|CarteCollecte" supabase/tests | head
```

Attendu : deux sorties vides.

- [ ] **Step 4 : La vitrine, avant et après**

Créer `$SCRATCH/comparer-vitrine.mjs` :

```js
// Compare la vitrine construite avant et après le chantier, page par page et
// largeur par largeur, hors du téléphone du hero. Ports 4331 et 4332 : jamais
// 5173/5174, qui parlent à la production.
//
// Usage : node comparer-vitrine.mjs <dist-avant> <dist-apres> <sortie>
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';

const [AVANT, APRES, SORTIE] = process.argv.slice(2);
if (!AVANT || !APRES || !SORTIE) throw new Error('Usage : node comparer-vitrine.mjs <dist-avant> <dist-apres> <sortie>');
mkdirSync(SORTIE, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.xml': 'application/xml', '.txt': 'text/plain',
};
function servir(dossier, port) {
  const serveur = createServer((req, res) => {
    const chemin = decodeURIComponent(req.url.split('?')[0]);
    const f = join(dossier, chemin === '/' ? 'index.html' : chemin.slice(1));
    if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  return new Promise((ok) => serveur.listen(port, '127.0.0.1', () => ok(serveur)));
}
const serveurs = [await servir(AVANT, 4331), await servir(APRES, 4332)];

const profil = mkdtempSync(join(tmpdir(), 'kv-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--remote-debugging-port=9337', `--user-data-dir=${profil}`, '--no-first-run', '--disable-gpu', 'about:blank',
]);
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i += 1) {
  try { wsUrl = (await (await fetch('http://127.0.0.1:9337/json/version')).json()).webSocketDebuggerUrl; }
  catch { await new Promise((ok) => setTimeout(ok, 250)); }
}
const ws = new WebSocket(wsUrl);
await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
let id = 0;
const attente = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && attente.has(m.id)) { attente.get(m.id)(m); attente.delete(m.id); } };
const envoyer = (method, params = {}, sessionId) => new Promise((ok) => { id += 1; attente.set(id, ok); ws.send(JSON.stringify({ id, method, params, sessionId })); });
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

const cible = await envoyer('Target.createTarget', { url: 'about:blank' });
const s = (await envoyer('Target.attachToTarget', { targetId: cible.result.targetId, flatten: true })).result.sessionId;
await envoyer('Page.enable', {}, s);
await envoyer('Runtime.enable', {}, s);
// Mouvement réduit : une entrée animée figée à mi-course ferait une différence qui n'en est pas une.
await envoyer('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, s);

const TELEPHONE = '[role="img"][aria-label^="L’écran d’encaissement"]';
async function capturer(url, largeur) {
  await envoyer('Emulation.setDeviceMetricsOverride', { width: largeur, height: 900, deviceScaleFactor: 1, mobile: largeur < 600 }, s);
  await envoyer('Page.navigate', { url }, s);
  await pause(3000);
  const mesure = (await envoyer('Runtime.evaluate', {
    expression: `(() => {
      const t = document.querySelector(${JSON.stringify(TELEPHONE)});
      const r = t && t.getBoundingClientRect();
      return { hauteur: document.documentElement.scrollHeight,
        telephone: r ? { haut: Math.floor(r.top + scrollY), bas: Math.ceil(r.bottom + scrollY), gauche: Math.floor(r.left), droite: Math.ceil(r.right) } : null };
    })()`,
    returnByValue: true,
  }, s)).result.result.value;
  const image = (await envoyer('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: largeur, height: mesure.hauteur, scale: 1 },
  }, s)).result.data;
  return { ...mesure, image };
}

// Chrome décode les deux images et compare les pixels : aucune dépendance côté Node.
// Au-dessus du bas du téléphone, ligne pour ligne ; dessous, décalé de la
// différence de hauteur du téléphone. Le téléphone lui-même est exclu.
async function comparer(a, b) {
  const expression = `(async () => {
    const charger = (d) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + d; });
    const [ia, ib] = await Promise.all([charger(${JSON.stringify(a.image)}), charger(${JSON.stringify(b.image)})]);
    const lire = (i) => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
      const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data; };
    const pa = lire(ia), pb = lire(ib);
    const t = ${JSON.stringify(a.telephone)}, tb = ${JSON.stringify(b.telephone)};
    const delta = t && tb ? tb.bas - t.bas : 0;
    let n = 0, zone = null;
    for (let y = 0; y < ia.height; y += 1) {
      const yb = t && y >= t.bas ? y + delta : y;
      if (yb < 0 || yb >= ib.height) continue;
      for (let x = 0; x < ia.width; x += 1) {
        if (t && y >= t.haut && y < t.bas && x >= t.gauche && x < t.droite) continue;
        const i = (y * ia.width + x) * 4, j = (yb * ib.width + x) * 4;
        if (pa[i] !== pb[j] || pa[i + 1] !== pb[j + 1] || pa[i + 2] !== pb[j + 2]) {
          n += 1;
          zone = zone ? { x0: Math.min(zone.x0, x), y0: Math.min(zone.y0, y), x1: Math.max(zone.x1, x), y1: Math.max(zone.y1, y) }
                      : { x0: x, y0: y, x1: x, y1: y };
        }
      }
    }
    return { n, zone, delta, hauteurs: [ia.height, ib.height] };
  })()`;
  return (await envoyer('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, s)).result.result.value;
}

let ecarts = 0;
for (const chemin of ['/', '/404.html']) {
  for (const largeur of [360, 390, 1280]) {
    const a = await capturer(`http://127.0.0.1:4331${chemin}`, largeur);
    const b = await capturer(`http://127.0.0.1:4332${chemin}`, largeur);
    const nom = `${chemin === '/' ? 'accueil' : '404'}-${largeur}`;
    writeFileSync(join(SORTIE, `${nom}-avant.png`), Buffer.from(a.image, 'base64'));
    writeFileSync(join(SORTIE, `${nom}-apres.png`), Buffer.from(b.image, 'base64'));
    const r = await comparer(a, b);
    if (r.n > 0) ecarts += 1;
    console.log(`${nom.padEnd(14)} téléphone ${a.telephone ? `${a.telephone.bas - a.telephone.haut} → ${b.telephone.bas - b.telephone.haut} px` : 'absent'}`
      + `  pixels différents hors téléphone : ${r.n}${r.zone ? `  zone ${JSON.stringify(r.zone)}` : ''}`);
  }
}
console.log(ecarts ? `${ecarts} capture(s) à regarder` : 'aucune différence hors du téléphone');
ws.close();
chrome.kill();
for (const sv of serveurs) sv.close();
process.exit(0);
```

Puis :

```bash
node "$SCRATCH/comparer-vitrine.mjs" "$SCRATCH/vitrine-avant" apps/site/dist "$SCRATCH/vitrine-comparaison"
```

Attendu : `aucune différence hors du téléphone`. Si une capture diffère,
ouvrir la paire de PNG de `$SCRATCH/vitrine-comparaison` à la zone donnée.
Un écart à côté du téléphone, de la moitié de la différence de hauteur, vient
d'un centrage vertical du hero : il se constate sur les deux images, et se
signale dans le compte rendu. Tout autre écart est un défaut du chantier.

- [ ] **Step 5 : Regard sur les trois écrans (contrôleur)**

Ce pas revient au contrôleur, pas à un sous-agent : il ouvre une session sur
la pile locale partagée. Lancer la copie de `audit-captures.mjs` du répertoire
temporaire, avec `DEPOT` pointé sur ce worktree, un port libre hors 5173/5174
(4380), le compte collecteur de démonstration de la pile locale déjà employé
pour l'audit du 2026-10-02, aux largeurs 360 × 800, 390 × 844 et 1280 × 900,
avec ce parcours (`$SCRATCH/parcours-billet.json`) :

```json
[
  { "nom": "01-accueil", "retour": true, "clics": ["Accueil$"] },
  { "nom": "02-encaisser-liste", "retour": true, "clics": ["Encaisser$"] },
  { "nom": "03-encaisser-carte", "retour": true, "clics": ["Encaisser$", "\\d+/31$"] },
  { "nom": "04-retrait-liste", "retour": true, "clics": ["Accueil$", "^ ?Retrait$"] },
  { "nom": "05-retrait-depli", "retour": true, "clics": ["Accueil$", "^ ?Retrait$", "à rendre$"] },
  { "nom": "06-retrait-decompte", "retour": true, "clics": ["Accueil$", "^ ?Retrait$", "à rendre$", "Faire le retrait$"] }
]
```

Aucun clic n'écrit : le parcours s'arrête avant « Encaisser » et avant « Oui,
rendre ». Les temps qui écrivent (encaissé, clôturée) ne se capturent pas sur
une pile partagée : leurs épreuves les tiennent, et les maquettes validées
(`Docs/maquettes/le-billet/`) en sont la référence.

Regarder chaque capture contre sa maquette : la carte sous l'en-tête de
l'accueil, la touche de la barre, le tampon absent avant le geste, la jauge
des lignes d'encaissement, le trait vert des cycles terminés, le décompte
sous son double filet. Relever tout écart dans le compte rendu.

- [ ] **Step 6 : Compte rendu**

Rien à commiter. Rendre : les sorties des pas 1 à 4, la liste des captures
regardées et les écarts relevés, et l'état de la branche
(`git log --oneline origin/main..HEAD`). La fusion reste le geste de
l'exploitant.
