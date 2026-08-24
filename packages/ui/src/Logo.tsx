/**
 * La marque Kolek — une pièce d'or frappée d'un « k », et le mot dessiné.
 *
 * Cahier de charges §306 : « monogramme "k" géométrique dont l'articulation est
 * une pièce d'or — l'argent au cœur de la collecte. »
 *
 * ## Pourquoi du SVG en ligne et non un fichier image
 *
 * Trois raisons, dans l'ordre d'importance. La CSP des trois sites interdit
 * `img-src` distant : un logo servi d'ailleurs ne s'afficherait pas. Un tracé
 * en ligne ne coûte aucune requête — le collecteur est en 3G sur un marché, et
 * la marque est la première chose que l'écran doit rendre. Enfin, et c'est le
 * point qui a décidé du reste : un `<img>` ne peut pas prendre ses couleurs au
 * thème, un `<svg>` si.
 *
 * ## Pourquoi le mot hérite de sa couleur
 *
 * Le 2026-08-24, une planche de sept fichiers a été fournie, un par
 * emplacement, chacun avec ses couleurs écrites en dur. Quatre peignaient le
 * mot en `#0E2A1E` — or les cinq emplacements du produit sont **tous** sur fond
 * sombre. `#0E2A1E` sur `#0E2E1F`, c'est un contraste de 1,02:1 : le mot aurait
 * disparu dans la barre latérale du collecteur, sur l'écran de connexion, dans
 * la barre de la vitrine et dans son pied de page.
 *
 * Le mot prend donc `currentColor`. L'emplacement porte déjà la couleur de son
 * texte ; le logo la suit. Cette classe de défaut devient impossible à écrire.
 *
 * ## Pourquoi la pièce, elle, ne change pas
 *
 * La pièce est le verrou de la marque : disque or, « k » sombre. Elle doit se
 * lire pareil partout, sinon ce n'est plus un logo mais une décoration. Ses
 * deux couleurs viennent de `tokens.ts` — `--color-or` et `--color-sidebar` —
 * et non des hexadécimaux de la planche, pour qu'il n'existe qu'un seul or dans
 * le dépôt. Changer l'or de la marque est un geste d'un mot, dans `tokens.ts`.
 */

/** La hampe du « k » et son articulation. Le tracé, pas un glyphe : le rendu ne
    dépend donc d'aucune police, et reste identique si Poppins ne charge pas. */
const K_HAMPE = 'M32 22 V78';
const K_ARTICULATION = 'M74 22 L44 50 L74 78';

interface Props {
  /** Taille par les utilitaires, comme `Avatar` : `h-8`, `w-32`… */
  className?: string;
  /**
   * Vrai quand un parent porte déjà le nom accessible — un lien
   * `aria-label="Kolek"`, par exemple. Le logo se tait alors, plutôt que de
   * faire annoncer « Kolek Kolek » par un lecteur d'écran.
   */
  decoratif?: boolean;
}

function etiquette(decoratif: boolean) {
  return decoratif
    ? ({ 'aria-hidden': true } as const)
    : ({ role: 'img', 'aria-label': 'Kolek' } as const);
}

/**
 * La pièce seule. Pour les surfaces étroites où le mot ne tiendrait pas : la
 * barre de la vitrine sous 380 px, une pastille, un en-tête serré.
 */
export function Marque({ className = 'h-8 w-8', decoratif = false }: Props) {
  return (
    <svg viewBox="0 0 100 100" className={className} {...etiquette(decoratif)}>
      <circle cx="50" cy="50" r="50" fill="var(--color-or)" />
      <g
        fill="none"
        stroke="var(--color-sidebar)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={K_HAMPE} />
        <path d={K_ARTICULATION} />
      </g>
    </svg>
  );
}

/**
 * Le mot « kolek », en tracés géométriques.
 *
 * Sept traits pour cinq lettres : hampe et articulation du premier k, le disque
 * du o, la hampe du l, l'anneau ouvert du e, puis hampe et articulation du
 * second k. Les proportions viennent de la planche du 2026-08-24 et n'ont pas
 * été retouchées — c'est le dessin qui fait la marque, pas ce composant.
 */
function MotSymbole() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="15" strokeLinecap="butt">
      <path d="M7.5 0 V100" />
      <path d="M57 0 L20 52 L60 100" strokeLinejoin="round" />
      <circle cx="117" cy="65" r="27.5" />
      <path d="M174.5 0 V100" />
      <path d="M 259.5 65 L 204.5 65 A 27.5 27.5 0 0 0 249.7 86.1 M 204.5 65 A 27.5 27.5 0 0 1 259.5 65" />
      <path d="M289.5 0 V100" />
      <path d="M330 30 L299 60 L332 100" strokeLinejoin="round" />
    </g>
  );
}

/**
 * La marque complète : pièce puis mot.
 *
 * Un seul `<svg>` et non deux éléments alignés en flex — la planche fixe le
 * rapport entre la pièce et le mot, ainsi que leur alignement optique. Le
 * confier à une grille CSS le ferait dériver au premier changement de gouttière.
 */
export function Logo({ className = 'h-8', decoratif = false }: Props) {
  return (
    <svg viewBox="0 0 316 120" className={className} {...etiquette(decoratif)}>
      <g transform="translate(4 12) scale(0.96)">
        <circle cx="50" cy="50" r="50" fill="var(--color-or)" />
        <g
          fill="none"
          stroke="var(--color-sidebar)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={K_HAMPE} />
          <path d={K_ARTICULATION} />
        </g>
      </g>
      <g transform="translate(128 34) scale(0.52)">
        <MotSymbole />
      </g>
    </svg>
  );
}
