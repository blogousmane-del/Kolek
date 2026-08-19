import { Icone, type NomIcone } from './Icone';

export interface ActionRapide {
  icone: NomIcone;
  libelle: string;
  onActiver?: () => void;
}

export const ACTIONS_PAR_DEFAUT: ActionRapide[] = [
  { icone: 'circle-dollar-sign', libelle: 'Encaisser' },
  { icone: 'user-plus', libelle: 'Souscrire' },
  { icone: 'arrow-up-right', libelle: 'Retrait' },
  { icone: 'bar-chart-2', libelle: 'Bilan' },
  { icone: 'refresh-cw', libelle: 'Rapproch.' },
  { icone: 'receipt', libelle: 'Reçus' },
  { icone: 'bell', libelle: 'Alertes' },
  { icone: 'more-horizontal', libelle: 'Plus' },
];

interface Props {
  actions?: ActionRapide[];
  /** Le tableau de bord serre la grille : pastilles de 48 px au lieu de 56. */
  compact?: boolean;
}

export function ActionsRapides({ actions = ACTIONS_PAR_DEFAUT, compact = false }: Props) {
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
