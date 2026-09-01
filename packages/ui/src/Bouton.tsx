import type { ReactNode } from 'react';

import { Icone, type NomIcone } from './Icone';

type Variante = 'primaire' | 'contour' | 'fantome';

const VARIANTES: Record<Variante, string> = {
  primaire: 'bg-primary text-primary-foreground border border-primary',
  contour: 'bg-surface text-primary border border-primary',
  fantome: 'bg-transparent text-primary border border-transparent',
};

interface Props {
  children: ReactNode;
  variante?: Variante;
  icone?: NomIcone;
  type?: 'button' | 'submit';
  pleineLargeur?: boolean;
  disabled?: boolean;
  /** Infobulle. Sert surtout à dire pourquoi un bouton est désactivé — un
      bouton éteint sans explication se lit comme un bouton cassé. */
  title?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * Hauteur minimale de 44 px : le collecteur tape debout, à une main, sur un
 * téléphone d'entrée de gamme, parfois sous le soleil d'un marché. C'est la
 * cible tactile minimale du Design System, pas une préférence esthétique.
 *
 * Le retour d'appui — `anim-pression` — vit ici et non dans chaque écran :
 * c'est ce qui garantit que les cent boutons du produit répondent tous de la
 * même façon. Un bouton qui ne bouge pas sous le doigt se lit comme un bouton
 * cassé, surtout en 3G où la réponse du serveur, elle, se fait attendre.
 */
export function Bouton({
  children,
  variante = 'primaire',
  icone,
  type = 'button',
  pleineLargeur = false,
  disabled = false,
  title,
  onClick,
  className = '',
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`anim-pression min-h-11 px-5 rounded-none font-body font-semibold text-base flex items-center justify-center gap-2 ${
        VARIANTES[variante]
      } ${pleineLargeur ? 'w-full' : ''} ${
        disabled ? 'opacity-50 cursor-default' : 'cursor-pointer'
      } ${className}`}
    >
      {icone && <Icone nom={icone} taille={16} />}
      {children}
    </button>
  );
}
