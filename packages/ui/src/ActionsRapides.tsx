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
}

export function ActionsRapides({ actions, compact = false }: Props) {
  return (
    // Deux colonnes sur téléphone : à quatre, le libellé sous la pastille
    // passait sur trois lignes et coupait les mots.
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {actions.map((action) => (
        <button
          key={action.libelle}
          type="button"
          disabled={!action.onActiver}
          title={action.onActiver ? undefined : 'À venir'}
          onClick={action.onActiver}
          className={`flex flex-col items-center ${compact ? 'gap-1.5' : 'gap-2'} ${
            action.onActiver ? 'cursor-pointer' : 'opacity-60 cursor-default'
          }`}
        >
          <div
            className={`${
              compact ? 'w-12 h-12' : 'w-14 h-14 shadow-sm'
            } rounded-pill bg-surface border border-primary flex items-center justify-center`}
          >
            <Icone nom={action.icone} taille={compact ? 20 : 22} className="text-primary" />
          </div>
          <span className="text-xs font-body font-medium text-ink text-center leading-tight">
            {action.libelle}
          </span>
        </button>
      ))}
    </div>
  );
}
