import type { CSSProperties } from 'react';

import { Icone, type NomIcone } from './Icone';

export interface ActionRapide {
  icone: NomIcone;
  libelle: string;
  onActiver?: () => void;
}

/**
 * `actions` est **obligatoire**, et c'est une correction du 2026-08-21.
 *
 * La propriété était facultative, avec pour repli une liste de huit actions
 * sans gestionnaire — celles de l'application collecteur. Le tableau de bord
 * d'administration appelait `<ActionsRapides compact />` sans rien passer, et
 * affichait donc huit pastilles mortes portant les libellés d'une autre
 * application.
 *
 * Le défaut était invisible depuis l'écran fautif : rien, dans son code, ne
 * laissait deviner d'où venaient ces huit boutons. C'est exactement ce qu'une
 * valeur par défaut silencieuse produit — un composant qui a l'air correct
 * partout, et faux à un endroit.
 *
 * Rendre la propriété obligatoire déplace le défaut à la compilation. Une liste
 * vide reste permise : elle affiche une grille vide, ce qui se voit.
 */
interface Props {
  actions: ActionRapide[];
  /** Le tableau de bord serre la grille : pastilles de 48 px au lieu de 56. */
  compact?: boolean;
  /**
   * Fait entrer les pastilles en escalier.
   *
   * Éteint par défaut, et pas seulement par prudence : l'appelant est le seul à
   * savoir s'il s'agit d'une première apparition. Rejouer la cascade à chaque
   * relecture ferait clignoter le menu au moment où le collecteur vérifie qu'un
   * encaissement est bien enregistré — voir `usePremierRendu`.
   */
  anime?: boolean;
}

export function ActionsRapides({ actions, compact = false, anime = false }: Props) {
  return (
    // Deux colonnes sur téléphone : à quatre, le libellé sous la pastille
    // passait sur trois lignes et coupait les mots.
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {actions.map((action, rang) => (
        <button
          key={action.libelle}
          type="button"
          disabled={!action.onActiver}
          title={action.onActiver ? undefined : 'À venir'}
          onClick={action.onActiver}
          style={anime ? ({ '--rang': rang } as CSSProperties) : undefined}
          className={`anim-pression flex flex-col items-center ${compact ? 'gap-1.5 p-2' : 'gap-2.5 p-3'} rounded-2xl bg-secondary/50 border border-hairline/80 hover:bg-secondary/90 transition-all ${
            anime ? 'anim-cascade' : ''
          } ${action.onActiver ? 'cursor-pointer' : 'opacity-60 cursor-default'}`}
        >
          {/* La bordure reste `border-primary` pleine, et non une teinte à 20 %.
              La tuile qui vient d'apparaître autour ne peut pas la remplacer
              comme limite : `secondary/50` sur le canevas rend 1,05:1 — un fond
              qu'on devine, pas un contour qu'on voit. La tuile groupe, la
              pastille désigne la commande.

              Pas d'inversion de couleur au survol non plus : le produit est
              tactile, et WebKit garde l'état `:hover` après le relâchement du
              doigt. Le collecteur verrait un bouton plein qu'il n'a pas laissé
              enfoncé. C'est `anim-pression`, sur le bouton entier, qui accuse
              réception du geste. */}
          <div
            className={`${
              compact ? 'w-10 h-10' : 'w-12 h-12'
            } rounded-pill bg-surface text-primary border border-primary flex items-center justify-center shadow-xs`}
          >
            <Icone nom={action.icone} taille={compact ? 18 : 20} />
          </div>
          <span className="text-xs font-body font-semibold text-ink text-center leading-tight">
            {action.libelle}
          </span>
        </button>
      ))}
    </div>
  );
}
