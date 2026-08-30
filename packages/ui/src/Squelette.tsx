interface Props {
  className?: string;
  largeur?: string;
  hauteur?: string;
  rond?: boolean;
}

/**
 * Bloc de chargement pulsant.
 * Remplace les "Chargement…" et "Lecture…" austères par des formes douces.
 */
export function Squelette({
  className = '',
  largeur,
  hauteur = 'h-4',
  rond = false,
}: Props) {
  return (
    <div
      className={`animate-pulse bg-muted/80 ${rond ? 'rounded-pill' : 'rounded-md'} ${hauteur} ${
        largeur ?? 'w-full'
      } ${className}`}
      aria-hidden="true"
    />
  );
}

export function SqueletteLigne() {
  return (
    <div className="flex items-center gap-3 p-3.5 border-b border-hairline/60 last:border-0">
      <Squelette rond hauteur="h-10" largeur="w-10" className="shrink-0" />
      <div className="flex-1 space-y-2 min-w-0">
        <Squelette hauteur="h-4" largeur="w-1/2" />
        <Squelette hauteur="h-3" largeur="w-1/3" />
      </div>
      <Squelette hauteur="h-5" largeur="w-16" className="shrink-0" />
    </div>
  );
}

export function SqueletteKPI() {
  return (
    <div className="flex flex-col items-center gap-1.5 p-2 min-w-0">
      <Squelette hauteur="h-3" largeur="w-12" />
      <Squelette hauteur="h-6" largeur="w-16" />
    </div>
  );
}
