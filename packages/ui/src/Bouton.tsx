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
  /**
   * Le nom que lit un lecteur d'écran, quand le libellé ne suffit pas.
   *
   * « Encaisser 2 000 » sous une carte dit le geste, pas la carte. Le nom
   * accessible le dit : « Encaisser 2 000 FCFA sur la carte de Mariam ». Il
   * doit **contenir** le libellé visible (WCAG 2.5.3), sans quoi un utilisateur
   * qui commande à la voix ne retrouve pas le bouton qu'il voit.
   */
  nomAccessible?: string;
  /**
   * L'identifiant de la phrase qui décrit le bouton (`aria-describedby`).
   *
   * Un bouton éteint ne dit pas pourquoi, et un bouton `disabled` ne prend pas
   * le focus : « Reçu » grisé se lit comme un bouton cassé. La phrase qui
   * l'explique est déjà à l'écran ; ce lien la fait lire avec lui.
   */
  decritPar?: string;
  /** Le bouton du geste principal d'un écran : 56 px au lieu de 44. */
  grand?: boolean;
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
  nomAccessible,
  decritPar,
  grand = false,
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled}
      title={title}
      onClick={onClick}
      aria-label={nomAccessible}
      aria-describedby={decritPar}
      // Deux tailles écrites en entier, et jamais l'une ajoutée par-dessus
      // l'autre : deux `min-h-*` dans une même classe, c'est l'ordre de la
      // feuille de style qui tranche, pas l'intention.
      className={`anim-pression ${grand ? 'min-h-14 text-lg' : 'min-h-11 text-base'} px-5 rounded-md font-body font-semibold flex items-center justify-center gap-2 ${
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
