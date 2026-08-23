import type { CSSProperties, ReactNode } from 'react';

/**
 * Design System §3.5 : « Bordure standard des cartes : 1px solid hairline
 * + shadow-sm. Discret, jamais lourd. » La maquette recopiait cette
 * combinaison dans une quinzaine d'endroits, avec trois valeurs d'ombre
 * légèrement différentes. Une seule ici.
 *
 * `style` n'est ouvert que pour une chose, et c'est assumé : porter la variable
 * `--rang` de la cascade d'entrée, que seul le `map()` producteur connaît. Une
 * couleur ou une marge écrite ici contournerait le Design System — la revue
 * doit le refuser.
 */
export function Carte({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`bg-surface rounded-lg border border-hairline shadow-sm ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

/** En-tête à l'intérieur d'une carte : titre à gauche, action à droite. */
export function EnteteCarte({
  titre,
  action,
}: {
  titre: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-hairline">
      <h3 className="font-headings font-bold text-lg text-ink">{titre}</h3>
      {action}
    </div>
  );
}

/** En-tête au-dessus d'un bloc, sur le canevas. */
export function EnteteSection({
  titre,
  action,
  className = 'mb-3',
}: {
  titre: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <h2 className="font-headings font-bold text-xl text-ink">{titre}</h2>
      {action}
    </div>
  );
}

/**
 * Lien « Tout voir ». Il ne mène nulle part tant que l'écran cible n'existe
 * pas : c'est un `button` désactivé et non un `a` sans `href`, pour que le
 * clavier et les lecteurs d'écran sachent aussi qu'il n'y a rien derrière.
 */
export function LienBloc({ libelle, onActiver }: { libelle: string; onActiver?: () => void }) {
  return (
    <button
      type="button"
      disabled={!onActiver}
      onClick={onActiver}
      className={`text-base font-body font-medium ${
        onActiver ? 'text-primary cursor-pointer' : 'text-muted-foreground cursor-default'
      }`}
    >
      {libelle}
    </button>
  );
}
