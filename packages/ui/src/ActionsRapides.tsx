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

const COULEURS_ICONES: Record<string, { fond: string; icone: string; bordure: string }> = {
  'circle-dollar-sign': { fond: 'bg-positive-tint', icone: 'text-positive', bordure: 'border-positive/20' },
  'user-plus': { fond: 'bg-[#EBF5EE]', icone: 'text-accent', bordure: 'border-accent/20' },
  'arrow-up-right': { fond: 'bg-info-tint', icone: 'text-info', bordure: 'border-info/20' },
  'bar-chart-2': { fond: 'bg-[#EBF2F7]', icone: 'text-[#2B6082]', bordure: 'border-[#2B6082]/20' },
  'refresh-cw': { fond: 'bg-[#FBF6E9]', icone: 'text-[#96741F]', bordure: 'border-[#96741F]/20' },
  receipt: { fond: 'bg-[#F8F5EC]', icone: 'text-[#7D6B35]', bordure: 'border-[#7D6B35]/20' },
  bell: { fond: 'bg-negative-tint', icone: 'text-negative', bordure: 'border-negative/20' },
  'message-square': { fond: 'bg-[#EFF2F9]', icone: 'text-[#475569]', bordure: 'border-[#475569]/20' },
  'more-horizontal': { fond: 'bg-muted', icone: 'text-muted-foreground', bordure: 'border-hairline' },
};

export function ActionsRapides({ actions, compact = false, anime = false }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 xs:gap-3">
      {actions.map((action, rang) => {
        const styleIcone = COULEURS_ICONES[action.icone] ?? {
          fond: 'bg-surface',
          icone: 'text-primary',
          bordure: 'border-primary/20',
        };

        return (
          <button
            key={action.libelle}
            type="button"
            disabled={!action.onActiver}
            title={action.onActiver ? undefined : 'À venir'}
            onClick={action.onActiver}
            style={anime ? ({ '--rang': rang } as CSSProperties) : undefined}
            className={`anim-pression group flex flex-col items-center justify-center ${
              compact ? 'gap-1.5 p-2.5' : 'gap-2 p-3 sm:p-3.5'
            } rounded-2xl bg-surface border border-hairline/80 shadow-xs hover:shadow-sm hover:border-hairline transition-all cursor-pointer ${
              anime ? 'anim-cascade' : ''
            } ${action.onActiver ? 'cursor-pointer' : 'opacity-60 cursor-default'}`}
          >
            <div
              className={`${
                compact ? 'w-10 h-10' : 'w-12 h-12'
              } rounded-2xl ${styleIcone.fond} ${styleIcone.icone} border ${styleIcone.bordure} flex items-center justify-center transition-transform duration-200 group-hover:scale-105`}
            >
              <Icone nom={action.icone} taille={compact ? 18 : 22} />
            </div>
            <span className="text-xs font-body font-semibold text-ink text-center leading-tight">
              {action.libelle}
            </span>
          </button>
        );
      })}
    </div>
  );
}
