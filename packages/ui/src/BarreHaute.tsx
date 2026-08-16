import { Icone, type NomIcone } from './Icone';

export interface ActionBarre {
  icone: NomIcone;
  libelle: string;
  principale?: boolean;
}

interface Props {
  filAriane: string[];
  titre: string;
  actions: ActionBarre[];
}

export function BarreHaute({ filAriane, titre, actions }: Props) {
  return (
    <div className="bg-canvas px-8 pt-6 pb-4 flex-shrink-0">
      <div className="flex items-center gap-1.5 mb-2">
        {filAriane.map((miette, i) => (
          <span key={miette} className="flex items-center gap-1.5">
            {i > 0 && (
              <Icone nom="chevron-right" taille={13} className="text-muted-foreground" />
            )}
            <span
              className={`text-sm font-body ${
                i === filAriane.length - 1 ? 'text-ink font-medium' : 'text-muted-foreground'
              }`}
            >
              {miette}
            </span>
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h1 className="font-headings font-bold text-3xl text-ink">{titre}</h1>
        <div className="flex items-center gap-2">
          {actions.map((action) => (
            <button
              key={action.libelle}
              type="button"
              className={`flex items-center gap-2 px-4 py-2 rounded-pill text-base font-body font-medium border ${
                action.principale
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface text-ink border-hairline'
              }`}
            >
              <Icone nom={action.icone} taille={15} />
              {action.libelle}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
