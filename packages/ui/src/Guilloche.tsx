/**
 * Les guilloches — la texture fiduciaire de Kolek.
 *
 * Ces motifs ont été dessinés pour la vitrine le 2026-08-22, puis remontés ici
 * le 2026-08-23 : la porte d'entrée des applications doit ressembler à la page
 * qui y mène, sinon le visiteur qui clique « Se connecter » a l'impression de
 * changer de produit. Un composant partagé est la seule façon de garantir ça —
 * deux copies divergent, c'est réglé depuis le premier jour de ce dépôt.
 *
 * Tout est tracé, rien n'est téléchargé. La CSP des trois cibles dit
 * `img-src 'self'`, et c'est une décision autant qu'une contrainte : une
 * texture en SVG pèse deux cents octets et se recolore par `currentColor`.
 *
 * Le vocabulaire vient de la gravure fiduciaire, celle des billets de banque :
 * la **rosace** est le motif central obtenu en faisant tourner une ellipse
 * autour d'un point, l'**onde** est la bande de sécurité qui court sur les
 * bords. Deux siècles d'imprimeurs les utilisent parce qu'ils sont difficiles
 * à contrefaire et immédiatement reconnaissables.
 */

/**
 * Grain global : un `feTurbulence` posé sur toute la page.
 *
 * Il casse les aplats numériques des dégradés. Sans lui, un fond dégradé sur
 * un écran de téléphone montre des bandes — l'œil voit les paliers de
 * quantification là où il attend un continuum.
 */
export function Bruit({ opacite = 0.05 }: { opacite?: number }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
      style={{ opacity: opacite }}
    >
      <filter id="grain-kolek">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain-kolek)" />
    </svg>
  );
}

/**
 * Rosace guillochée.
 *
 * Une famille d'ellipses tournées autour d'un centre commun. `petales` en règle
 * la densité, `excentricite` l'aplatissement — deux surfaces du produit ne
 * doivent pas montrer exactement le même billet.
 */
export function Rosace({
  petales = 18,
  excentricite = 0.42,
  className = '',
  animee = false,
}: {
  petales?: number;
  excentricite?: number;
  className?: string;
  /** Rotation lente. 90 s par tour : un filigrane qui gigote n'en est plus un. */
  animee?: boolean;
}) {
  const angles = Array.from({ length: petales }, (_, i) => (i * 180) / petales);
  return (
    <svg
      aria-hidden
      viewBox="-100 -100 200 200"
      className={`${animee ? 'rosace-tourne' : ''} ${className}`}
    >
      {angles.map((angle) => (
        <ellipse
          key={angle}
          rx={92}
          ry={92 * excentricite}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.45}
          transform={`rotate(${angle})`}
        />
      ))}
      <circle r={92} fill="none" stroke="currentColor" strokeWidth={0.45} />
    </svg>
  );
}

/**
 * Bande guillochée : des sinusoïdes déphasées.
 *
 * `preserveAspectRatio="none"` est délibéré — la bande s'étire à la largeur
 * qu'on lui donne, comme sur un billet dont le format varie.
 */
export function Onde({ lignes = 12, className = '' }: { lignes?: number; className?: string }) {
  const chemins = Array.from({ length: lignes }, (_, i) => {
    const phase = (i / lignes) * Math.PI;
    const amplitude = 12 + 10 * Math.sin(phase);
    return Array.from({ length: 41 }, (_, x) => {
      const py = 50 + amplitude * Math.sin(x / 2.4 + phase * 2);
      return `${x === 0 ? 'M' : 'L'}${x * 25},${py.toFixed(1)}`;
    }).join(' ');
  });

  return (
    <svg aria-hidden viewBox="0 0 1000 100" preserveAspectRatio="none" className={className}>
      {chemins.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={0.6} />
      ))}
    </svg>
  );
}
