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
  //
  // Refroidi le 2026-09-04, de `#EFEFEA` à `#EEEFEC`. Le produit portait deux
  // familles de neutres : `canvas` tire au vert (R244 G245 B242), `muted` et
  // `paper` tiraient au jaune. Sept unités d'écart sur trois canaux : assez
  // proche pour passer pour un défaut de rendu, assez loin pour se voir dès que
  // deux surfaces se jouxtent. `muted` suit désormais la courbe de `canvas`
  // (R = G-1, B = G-3), à luminance égale : `mutedForeground` y garde 4,72:1.
  muted: '#EEEFEC',
  // Assombri le 2026-08-25 : `#6C716A` ne donnait que 4,33:1 sur `muted`, sous
  // le seuil AA. C'est la paire du badge « Inactif », écrit en 12 px.
  mutedForeground: '#666B64',
  hairline: '#E6E3DA',
  border: '#E6E3DA',
  canvas: '#F4F5F2',
  background: '#F4F5F2',
  surface: '#FFFFFF',
  input: '#FFFFFF',
  // `paper: '#FBFAF6'` a été supprimé le 2026-09-04. Il n'avait qu'un seul
  // usage — les trois cartes du produit sur la vitrine — et il servait de
  // troisième fond entre `canvas` et `surface`, dans l'autre famille de
  // neutres. `Tarification` avait déjà dû s'en écarter en août pour cette
  // raison exacte, et le contournement laissait la cause en place.
  //
  // Deux fonds suffisent, et la collision devient impossible plutôt
  // qu'évitable : `canvas` porte la page, `surface` porte ce qui se soulève.
  darkCanvas: '#06140E',
  // Sémantique
  positive: '#1C7A4B',
  positiveTint: '#E6F3EC',
  // Assombri le 2026-08-25. `#C1553E` sur `negativeTint` ne donnait que
  // 3,68:1 : le message d'erreur était le texte le moins lisible du produit,
  // dans les trois applications. Éclaircir la teinte ne suffisait pas — même
  // presque blanche, elle plafonnait à 4,24:1. C'est l'encre qui devait foncer.
  negative: '#A8452F',
  negativeTint: '#F6E4DF',
  info: '#3D6E8E',
  infoTint: '#E6EEF4',
  // Data-viz — une échelle de clarté, et non quatre teintes à la même
  // luminance. Refondue le 2026-09-04.
  //
  // Les quatre valeurs précédentes se distinguaient par la teinte seule :
  // `chartBlue` et `chartSlate` ne différaient que de 2,1 unités de L*, soit un
  // rapport de 1,06:1. Dans la barre empilée du tableau de bord et dans « Top
  // zones », la couleur est le seul encodage — deux des quatre parts étaient
  // donc le même gris pour un daltonien, et pour tout le monde en plein jour.
  //
  // Elles sont maintenant espacées d'environ 10 unités de L*, ce qui reste
  // perceptible en niveaux de gris. L'écart est borné : ces mêmes jetons
  // servent de fond aux pastilles d'`Avatar`, dont les initiales sont écrites
  // en `sidebar`. Aucune ne peut donc descendre sous 4,5:1 contre `#0E2E1F`, et
  // `chartSlate`, le plus sombre, y tient à 4,57:1.
  //
  // `chartMint` a un second métier — l'état actif de la barre latérale et le
  // vert de réussite sur fond sombre — d'où sa place à l'extrémité claire.
  chartMint: '#D1E8D4',
  chartTeal: '#9ACDBE',
  chartBlue: '#82ACCC',
  chartSlate: '#8D8AC0',
  // L'or champagne. Le site de vente est la surface du produit qui parle
  // d'argent au sens propre, et il porte la couleur des billets plutôt qu'un
  // vert de plus. Depuis le 2026-08-24, c'est aussi l'or de la pièce du logo :
  // les deux applications le portent donc elles aussi, mais nulle part ailleurs
  // que dans la marque — dans l'outil, l'argent est un nombre, pas un ornement.
  //
  // La valeur vient de la planche de logo et non plus du cahier de charges.
  // Trois or circulaient : `#C9A84C` ici, `#D9A84E` au cahier §313, `#D2B24C`
  // sur la planche. C'est la pièce qui tranche — elle est ce que le collecteur
  // voit sur son écran d'accueil, et une marque ne se décline pas en trois ors.
  or: '#D2B24C',
  orDoux: '#E5D5A3',
} as const;

/**
 * Design System §3.4, **révisé le 2026-08-31 : le produit passe au carré.**
 *
 * ## Ce qui change, et pourquoi c'est ici et pas dans un écran
 *
 * La v1 posait « coins largement arrondis, effet carte posée » (§1) et « coins
 * très arrondis → douceur » (§2.3). GTCS a tranché dans l'autre sens : angles
 * vifs, parti pris net, plus proche de ce qui se fait aujourd'hui.
 *
 * Le changement vit dans ce fichier et nulle part ailleurs. Les noms de classes
 * ne bougent pas — `rounded-lg` existe toujours, il vaut simplement autre
 * chose. Aucun composant, aucun écran n'a été touché pour ça, et c'est la
 * preuve que le jeu de tokens tenait sa promesse.
 *
 * ## Pourquoi partout, et pas seulement dans le collecteur
 *
 * La demande venait de l'application collecteur. Le §7 des interdits répond
 * lui-même : **« ne jamais mélanger plusieurs jeux de rayons »**. Un carré
 * réservé à une surface aurait donné deux langages visuels dans un même
 * produit, avec le même bouton de deux formes selon l'écran où on le rencontre.
 *
 * ## Le premier essai était trop dur — corrigé le même jour
 *
 * Premier jet à 2 px et 4 px, franchement carré. Vu à l'écran, GTCS a tranché :
 * « c'est trop carré, il faut rendre ça un peu rond ».
 *
 * Le défaut n'était pas le parti pris mais son degré. À 2 px, une carte de
 * collecte ne se lit plus comme un objet posé mais comme une découpe dans le
 * fond — et l'application entière est bâtie sur la métaphore du carnet qu'on
 * tient en main. Les valeurs ci-dessous gardent le geste moderne tout en
 * rendant l'objet à son épaisseur : nettement plus vives que les 8/12/16/24
 * d'origine, sans l'arête coupante du premier essai.
 *
 * Aucune ne descend à zéro : un `border-radius` nul laisse l'anticrénelage des
 * bordures produire des angles sales sur les écrans à faible densité, et le
 * collecteur travaille sur un téléphone d'entrée de gamme en plein soleil
 * d'Abidjan.
 *
 * ## `pill` ne change pas
 *
 * Il porte deux choses que rien ne distingue ici : les avatars et pastilles,
 * qui doivent rester ronds, et les badges de statut, qui sont des rectangles.
 * Les carrer ensemble transformerait les avatars en carrés, ce que personne n'a
 * demandé. Les séparer demande un token de plus — à faire quand on aura vu le
 * rendu, pas avant.
 */
/**
 * Les rayons, et le rôle de chacun.
 *
 * L'échelle existait ; la règle, non. Les applications l'appliquaient déjà de
 * façon cohérente — on la lit dans le code, pas dans le document — tandis que
 * la vitrine posait onze rayons arbitraires entre 16 et 44 px sans qu'aucun ne
 * corresponde à un jeton. Écrite le 2026-09-04, avec les deux crans qui
 * manquaient pour que la vitrine puisse s'y ranger.
 *
 * | Jeton  | Valeur | Rôle                                                   |
 * |--------|--------|--------------------------------------------------------|
 * | `sm`   | 4 px   | Segment de jauge, case de progression                    |
 * | `md`   | 6 px   | Champ, bouton rectangulaire, ligne de tableau            |
 * | `lg`   | 10 px  | Carte d'application (`Carte`, `CarteStat`, `CarteZone`)  |
 * | `xl`   | 12 px  | Carte mise en avant, élément d'un panneau                |
 * | `2xl`  | 20 px  | Artefact et carte interne de la vitrine                  |
 * | `3xl`  | 32 px  | Grande surface éditoriale de la vitrine                  |
 * | `pill` | plein  | Pastille, badge, bouton rond, cible tactile              |
 *
 * **Deux exceptions**, et elles sont les seules :
 *
 * - `Telephone.tsx` dessine un châssis d'appareil (44 px à l'extérieur, 36 px
 *   à l'intérieur). Ce n'est pas une surface d'interface, c'est un objet
 *   représenté ; le ranger dans l'échelle le ferait cesser de ressembler à un
 *   téléphone.
 * - Les 31 cases de la carte de collecte miniature font 8 px de haut. À 4 px,
 *   `sm` les arrondirait en stade ; elles gardent 2 px.
 *
 * `2xl` et `3xl` écrasent les valeurs par défaut de Tailwind (16 px et 24 px).
 * C'est voulu : les deux noms restent disponibles, avec les valeurs du produit.
 */
export const rayons = {
  sm: '4px',
  md: '6px',
  lg: '10px',
  xl: '12px',
  '2xl': '20px',
  '3xl': '32px',
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

  /**
   * La taille de tout ce dans quoi on tape. 16 px, et pas un de moins.
   *
   * Safari sur iPhone zoome la page dès qu'on touche un champ dont la police
   * calculée passe sous 16 px : le champ grossit, la page déborde, et il faut
   * pincer pour ressortir — au milieu d'un geste que le collecteur fait
   * cinquante fois par jour, debout, à une main. Il n'existe pas d'attribut
   * pour le désactiver. La seule autre porte de sortie, `maximum-scale=1` dans
   * le `viewport`, supprime le zoom manuel de l'écran entier : on échangerait
   * un agacement contre un défaut d'accessibilité.
   *
   * Pourquoi son propre nom plutôt que `lg`, qui vaut déjà 16 px : `lg`
   * désigne un titre de carte. Un champ qui emprunte le jeton d'un titre se
   * fera un jour retailler avec les titres, et le zoom reviendra sans que
   * personne ait touché à un champ.
   *
   * Le corps du produit reste à 15 px. C'est la densité choisie pour des
   * listes longues, et un pixel sur les seuls champs suffit.
   *
   * `scripts/verifier-champs.mjs` refuse toute balise `input`, `textarea` ou
   * `select` qui déclarerait une taille sous ce seuil.
   */
  champ: '16px',

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
  // Les deux plafonds bureau, ajoutés le 2026-08-23. `liste` (640 px) reste le
  // plafond des écrans de saisie : un champ étiré sur 1 400 px est plus dur à
  // remplir, pas plus facile — l'œil perd la ligne entre l'étiquette et le
  // champ. `page` porte les rangées d'historique, `large` les grilles de cartes
  // à deux colonnes.
  page: '860px',
  large: '960px',
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
  // Réalignés le 2026-09-04 sur la nouvelle échelle `chart*`. Ils en étaient
  // tirés à l'origine ; les laisser sur les anciennes valeurs aurait fait
  // diverger la carte de zone de la liste « Top zones » qui décrit les mêmes
  // zones, sans que rien ne le signale.
  degradeZone0: 'linear-gradient(135deg, #D1E8D4 0%, #82ACCC 100%)',
  degradeZone1: 'linear-gradient(135deg, #82ACCC 0%, #8D8AC0 100%)',
  degradeZone2: 'linear-gradient(135deg, #9ACDBE 0%, #D1E8D4 100%)',
  degradeZone3: 'linear-gradient(135deg, #8D8AC0 0%, #82ACCC 100%)',
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
