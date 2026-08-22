/**
 * Les textures de la vitrine — le grain et la gravure.
 *
 * Tout est dessiné, rien n'est téléchargé. La CSP de ce site dit
 * `img-src 'self' data:` et c'est une décision, pas une contrainte subie :
 * une page de vente qui appelle Unsplash avant son premier octet utile
 * ralentit exactement le téléphone qu'elle prétend servir. L'ambiance
 * « monétaire » vient donc de là d'où elle vient sur un vrai billet — la
 * gravure guillochée, ces entrelacs de courbes fines que les imprimeurs
 * fiduciaires utilisent depuis deux siècles parce qu'ils sont difficiles à
 * contrefaire et immédiatement reconnaissables.
 */

/** Grain global. `feTurbulence` en SVG inline, posé une fois sur toute la
    page : il casse les aplats numériques des dégradés sans coûter une image. */
export function Bruit() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 h-full w-full opacity-[0.05]"
    >
      <filter id="bruit-vitrine">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#bruit-vitrine)" />
    </svg>
  );
}

/**
 * Rosace guillochée — le motif central d'un billet.
 *
 * Une famille d'ellipses tournées autour d'un centre commun : c'est la
 * construction classique d'une rosace de gravure. Le nombre de pétales et
 * l'excentricité sont des paramètres pour que le hero et le protocole ne
 * montrent pas deux fois le même billet.
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
  animee?: boolean;
}) {
  const ellipses = Array.from({ length: petales }, (_, i) => (i * 180) / petales);
  return (
    <svg
      aria-hidden
      viewBox="-100 -100 200 200"
      className={className}
      style={animee ? { animation: 'rosace-rotation 90s linear infinite' } : undefined}
    >
      {ellipses.map((angle) => (
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
 * Bande guillochée horizontale — l'onde qui court le long d'un billet.
 *
 * Des sinusoïdes déphasées, tracées en chemins fins. Sert de texture de fond
 * aux sections sombres, là où un billet mettrait son fond de sécurité.
 */
export function Onde({ lignes = 12, className = '' }: { lignes?: number; className?: string }) {
  const chemins = Array.from({ length: lignes }, (_, i) => {
    const phase = (i / lignes) * Math.PI;
    const amplitude = 12 + 10 * Math.sin(phase);
    const points = Array.from({ length: 41 }, (_, x) => {
      const px = x * 25;
      const py = 50 + amplitude * Math.sin(x / 2.4 + phase * 2);
      return `${x === 0 ? 'M' : 'L'}${px},${py.toFixed(1)}`;
    }).join(' ');
    return points;
  });
  return (
    <svg aria-hidden viewBox="0 0 1000 100" preserveAspectRatio="none" className={className}>
      {chemins.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={0.6} />
      ))}
    </svg>
  );
}
