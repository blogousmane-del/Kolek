import { Icone, type NomIcone } from './Icone';

export interface ActionBarre {
  icone: NomIcone;
  libelle: string;
  principale?: boolean;
  /**
   * Même convention que la barre latérale : une action qui ne mène à rien se
   * désactive au lieu de se cliquer dans le vide.
   *
   * Par défaut, une action est disponible si et seulement si elle porte un
   * `onActiver`. Le déduire plutôt que de le déclarer supprime la possibilité
   * d'un bouton actif qui n'appelle rien — et c'est exactement ce que ce
   * composant produisait : il n'avait aucun `onClick`, donc *toutes* ses
   * actions étaient mortes, y compris celles annoncées comme disponibles.
   */
  disponible?: boolean;
  onActiver?: () => void;
}

interface Props {
  filAriane: string[];
  titre: string;
  actions: ActionBarre[];
}

export function BarreHaute({ filAriane, titre, actions }: Props) {
  return (
    <div className="bg-canvas px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-4 flex-shrink-0">
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

      {/* En dessous de `sm`, le titre et les actions s'empilent : sur un écran
          de 360 px, quatre boutons et un titre de 30 px sur la même ligne
          débordaient l'un dans l'autre. */}
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-headings font-bold text-2xl sm:text-3xl text-ink">{titre}</h1>
        <div className="flex items-center flex-wrap gap-2">
          {actions.map((action) => {
            const disponible = action.disponible ?? Boolean(action.onActiver);
            return (
              <button
                key={action.libelle}
                type="button"
                disabled={!disponible}
                onClick={action.onActiver}
                // Le libellé disparaît sous `sm` — l'icône suffit à un pouce, et
                // `aria-label` garde l'intitulé pour les lecteurs d'écran.
                aria-label={action.libelle}
                title={disponible ? action.libelle : `${action.libelle} — à venir`}
                className={`flex items-center gap-2 min-h-11 px-3 sm:px-4 rounded-pill text-base font-body font-medium border ${
                  action.principale
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-surface text-ink border-hairline'
                } ${disponible ? 'cursor-pointer' : 'opacity-50 cursor-default'}`}
              >
                <Icone nom={action.icone} taille={15} />
                <span className="hidden sm:inline">{action.libelle}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
