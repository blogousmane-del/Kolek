/**
 * Source unique des valeurs visuelles — Design System §3.
 *
 * Ce fichier ne produit plus un bloc `:root` injecté à l'exécution : il produit
 * le bloc `@theme` de Tailwind v4, écrit sur disque par
 * `scripts/generer-theme.mjs`. Tailwind a besoin du thème au moment du build
 * pour fabriquer les classes utilitaires ; une injection en JavaScript arrive
 * trop tard.
 *
 * Les noms sont donc contraints : ils doivent tomber dans les espaces de noms
 * que Tailwind reconnaît (`--color-*`, `--radius-*`, `--text-*`, `--font-*`,
 * `--shadow-*`, `--container-*`), sans quoi aucune classe n'est engendrée.
 */

/**
 * Couleurs. Certaines valeurs portent deux noms — `canvas` et `background`,
 * `hairline` et `border`. Ce n'est pas une redite par négligence : le premier
 * est le nom métier du Design System, le second celui qu'attendent les classes
 * Tailwind conventionnelles (`bg-background`, `border-border`). Les deux
 * pointent la même valeur, et un test le vérifie.
 */
export const couleurs = {
  // Marque & action — Design System §3.1
  primary: '#14402C',
  primaryForeground: '#FFFFFF',
  sidebar: '#0E2E1F',
  accent: '#1C5A3D',
  secondary: '#E8F0EA',
  secondaryForeground: '#14402C',
  // Neutres
  ink: '#171A17',
  foreground: '#171A17',
  // `muted` est une surface (piste de jauge, en-tête de tableau) et
  // `mutedForeground` un texte. Les confondre donne du gris sur gris.
  muted: '#EFEFEA',
  mutedForeground: '#6C716A',
  hairline: '#E6E3DA',
  border: '#E6E3DA',
  canvas: '#F4F5F2',
  background: '#F4F5F2',
  surface: '#FFFFFF',
  input: '#FFFFFF',
  paper: '#FBFAF6',
  darkCanvas: '#06140E',
  // Sémantique
  positive: '#1C7A4B',
  positiveTint: '#E6F3EC',
  negative: '#C1553E',
  negativeTint: '#F6E4DF',
  info: '#3D6E8E',
  infoTint: '#E6EEF4',
  // Data-viz
  chartBlue: '#9FC2DA',
  chartTeal: '#7FB6A6',
  chartMint: '#B7D9BE',
  chartSlate: '#AEB7D6',
  // L'or champagne de la vitrine. Le site de vente est la seule surface du
  // produit qui parle d'argent au sens propre, et il porte la couleur des
  // billets plutôt qu'un vert de plus. Les deux applications ne l'utilisent
  // pas : dans l'outil, l'argent est un nombre, pas un ornement.
  or: '#C9A84C',
  orDoux: '#E5D5A3',
} as const;

/** Design System §3.4. `xl` est donné pour 20–24 px ; on prend le haut. */
export const rayons = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  pill: '9999px',
} as const;

/**
 * Design System §3.3 — base 4 px. Tailwind dérive toute son échelle de cette
 * seule valeur : `p-2` vaut 8 px, `gap-3` vaut 12 px, `py-2.5` vaut 10 px.
 * L'échelle du document (2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64)
 * en est exactement l'ensemble des multiples utiles ; il n'y a donc plus de
 * liste de jetons à tenir à jour en parallèle.
 */
export const grille = '4px';

/**
 * Design System §3.2. Les noms en t-shirt sont ceux qu'exigent les classes
 * Tailwind ; la colonne de droite donne le rôle décrit par le document.
 */
export const taillesTexte = {
  xs: '11px', // Overline
  sm: '13px', // Small / label
  base: '15px', // Body
  lg: '16px', // H3 — titre de carte
  xl: '20px', // H2 — section
  '2xl': '24px', // Montant de carte
  '3xl': '28px', // H1 — titre de page
  '4xl': '36px',

  /**
   * Les tailles d'affiche — la vitrine, et elle seule.
   *
   * Elles sont **fluides**, et c'est une correction du 2026-08-23. L'échelle
   * ci-dessus s'arrêtait à `4xl` ; les titres de la page de vente employaient
   * donc `text-5xl` et `text-7xl`, qui n'existaient pas ici et retombaient
   * silencieusement sur les défauts de Tailwind — 48 px et 72 px, fixes.
   *
   * Sur un téléphone de 320 px, « la précision. » en 72 px mesure environ
   * 340 px de large pour 270 px utiles : le mot débordait, et le garde-fou
   * `overflow-x: clip` le coupait proprement au lieu de le signaler. Un défaut
   * masqué par sa propre protection.
   *
   * `clamp(plancher, part de la largeur, plafond)` supprime la classe entière
   * du problème : il n'y a plus de palier où un titre passe brusquement de
   * « tient » à « déborde », et un futur `text-7xl` est sûr par construction.
   * Le plancher garde la hiérarchie lisible sur les plus petits écrans, le
   * plafond empêche le titre d'avaler un écran de bureau.
   */
  '5xl': 'clamp(32px, 8vw, 48px)',
  '6xl': 'clamp(36px, 10vw, 64px)',
  '7xl': 'clamp(40px, 12vw, 88px)',
  '8xl': 'clamp(48px, 15vw, 120px)', // Metric XL
} as const;

export const polices = {
  body: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
  headings: "'Sora', 'Plus Jakarta Sans', system-ui, sans-serif",
} as const;

/**
 * Largeurs de conteneur. Sans elles, chaque écran réinvente son `max-width` en
 * dur, ce que la règle « aucune valeur visuelle en dur » interdit précisément —
 * et trois écrans finissent avec trois largeurs de formulaire différentes.
 * Émises dans `--container-*`, elles donnent `max-w-formulaire`, `w-sidebar`…
 */
export const mesures = {
  formulaire: '360px',
  carte: '520px',
  liste: '640px',
  sidebar: '256px',
  // 420 px était la largeur de la maquette. Les téléphones l'ont dépassée :
  // un iPhone 16 Pro Max fait 440 px de large en pixels CSS, un Pixel 9 Pro XL
  // 448. Sur ces appareils, la coquille du collecteur laissait donc une bande
  // de fond de chaque côté — l'application ne remplissait pas l'écran du
  // téléphone, ce qui se lit exactement comme « pas responsive ».
  mobile: '520px',
  volet: '320px',
} as const;

/**
 * Design System §3.5. Trois niveaux d'élévation neutres, plus une ombre teintée
 * réservée au bouton d'encaissement : ce n'est pas un quatrième niveau mais une
 * couleur portée, la seule surface du produit qui projette du vert.
 */
export const elevations = {
  shadowSm: '0 1px 2px rgba(20,30,25,.05)',
  shadowMd: '0 4px 12px rgba(20,30,25,.08)',
  shadowLg: '0 12px 32px rgba(6,20,14,.14)',
  shadowAction: '0 4px 12px rgba(20,64,44,.25)',
} as const;

/**
 * Dégradés. Ils ne rentrent dans aucun espace de noms Tailwind, donc aucune
 * classe n'en sort : ils sont exposés en variables libres et consommés par
 * `bg-[image:var(--degrade-carte)]`. Les garder ici plutôt qu'en dur dans
 * trois composants est ce qui empêche la carte de collecte et la carte de zone
 * de diverger silencieusement.
 *
 * `degradeCarte` a été saturé le 2026-08-20 et ne partage donc plus ses teintes
 * avec les dégradés de zone. La divergence est voulue, et elle est écrite ici
 * pour qu'elle ne soit pas silencieuse : la carte de collecte se lit dehors, en
 * plein soleil, sur un téléphone d'entrée de gamme. Les cartes de zone se
 * lisent au bureau, sur un écran d'administration. Ce ne sont pas les mêmes
 * conditions, donc pas le même contraste. L'encre de la carte est passée de
 * `--color-sidebar` à `--color-ink` pour la même raison.
 */
export const degrades = {
  degradeCarte: 'linear-gradient(135deg, #8FC79E 0%, #6FA3C9 60%, #8A96C4 100%)',
  degradePromo: 'linear-gradient(135deg, #1C5A3D 0%, #0E2E1F 100%)',
  degradeZone0: 'linear-gradient(135deg, #B7D9BE 0%, #9FC2DA 100%)',
  degradeZone1: 'linear-gradient(135deg, #9FC2DA 0%, #AEB7D6 100%)',
  degradeZone2: 'linear-gradient(135deg, #7FB6A6 0%, #B7D9BE 100%)',
  degradeZone3: 'linear-gradient(135deg, #AEB7D6 0%, #9FC2DA 100%)',
  // Le fond du hero de la vitrine : la nuit d'un coffre plutôt qu'un aplat.
  degradeHero: 'linear-gradient(180deg, #06140E 0%, #0E2E1F 60%, #14402C 100%)',
} as const;

/**
 * Points de rupture.
 *
 * Tailwind en fournit déjà à partir de `sm` (640 px), tous conçus pour passer
 * d'un téléphone à une tablette. Le collecteur, lui, a besoin d'un point
 * *sous* le téléphone de référence : entre un Galaxy A03 en 360 px et un
 * iPhone 16 en 393 px, un montant à sept chiffres tient d'un côté et pas de
 * l'autre. `xs` est ce seuil — en dessous, les gros chiffres passent d'un cran
 * plus petits plutôt que de déborder de leur tuile.
 */
export const ruptures = {
  xs: '390px',
} as const;

function kebab(cle: string): string {
  return cle.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();
}

const GROUPES: Array<[Record<string, string>, string]> = [
  [couleurs, 'color-'],
  [rayons, 'radius-'],
  [taillesTexte, 'text-'],
  [polices, 'font-'],
  [mesures, 'container-'],
  [ruptures, 'breakpoint-'],
  [elevations, ''],
  [degrades, ''],
];

/** Produit le bloc `@theme` consommé par Tailwind dans les deux applications. */
export function genererCssTheme(): string {
  const lignes: string[] = [`  --spacing: ${grille};`];
  for (const [groupe, prefixe] of GROUPES) {
    for (const [cle, valeur] of Object.entries(groupe)) {
      lignes.push(`  --${prefixe}${kebab(cle)}: ${valeur};`);
    }
  }
  return `@theme {\n${lignes.join('\n')}\n}\n`;
}
