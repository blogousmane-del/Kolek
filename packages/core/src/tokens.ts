export const couleurs = {
  // Marque & action — Design System §3.1
  green900: '#0E2E1F',
  green700: '#14402C',
  green500: '#1C5A3D',
  greenTint: '#E8F0EA',
  // Neutres
  ink: '#171A17',
  muted: '#6C716A',
  hairline: '#E6E3DA',
  canvas: '#F4F5F2',
  surface: '#FFFFFF',
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
} as const;

export const rayons = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '22px',
  pill: '9999px',
} as const;

// Clés numériques : le générateur CSS insère un tiret entre une lettre et un
// chiffre (green700 → green-700). Des clés comme « e2 » produiraient
// « --space-e-2 ». On les nomme donc par leur seule valeur.
export const espacements = {
  '2': '2px',
  '4': '4px',
  '8': '8px',
  '12': '12px',
  '16': '16px',
  '20': '20px',
  '24': '24px',
  '32': '32px',
  '40': '40px',
  '48': '48px',
  '64': '64px',
} as const;

// Même raison : pas de « h1 », qui deviendrait « --font-h-1 ».
export const typographie = {
  familleUi: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
  familleDisplay: "'Sora', 'Plus Jakarta Sans', system-ui, sans-serif",
  metricXl: '36px',
  titrePage: '28px',
  titreSection: '20px',
  titreCarte: '16px',
  body: '15px',
  small: '13px',
  overline: '11px',
} as const;

// Largeurs de conteneur. Sans elles, chaque écran réinvente son `maxWidth` en
// dur, ce que la règle « aucune valeur visuelle en dur » interdit précisément —
// et trois écrans finissent avec trois largeurs de formulaire différentes.
export const mesures = {
  formulaire: '360px',
  carte: '520px',
  liste: '640px',
  sidebar: '248px',
} as const;

export const elevations = {
  shadowSm: '0 1px 2px rgba(20,30,25,.05)',
  shadowMd: '0 4px 12px rgba(20,30,25,.08)',
  shadowLg: '0 12px 32px rgba(6,20,14,.14)',
} as const;

function kebab(cle: string): string {
  return cle.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();
}

const PREFIXES: Array<[Record<string, string>, string]> = [
  [couleurs, ''],
  [rayons, 'r-'],
  [espacements, 'space-'],
  [mesures, 'mesure-'],
  [typographie, 'font-'],
  [elevations, ''],
];

/** Produit le bloc `:root` consommé par les deux applications. */
export function genererCssTokens(): string {
  const lignes: string[] = [];
  for (const [groupe, prefixe] of PREFIXES) {
    for (const [cle, valeur] of Object.entries(groupe)) {
      lignes.push(`  --${prefixe}${kebab(cle)}: ${valeur};`);
    }
  }
  return `:root {\n${lignes.join('\n')}\n}\n`;
}
