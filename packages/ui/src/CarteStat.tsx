import { Icone, type NomIcone } from './Icone';

interface Props {
  libelle: string;
  valeur: string;
  unite?: string;
  /**
   * Variation par rapport à la période précédente. **Facultative, et il faut
   * qu'elle le reste.**
   *
   * Une tendance suppose un état passé auquel se comparer. La base ne garde
   * aucun instantané : ni le chiffre d'affaires d'hier, ni le nombre de
   * collecteurs de la semaine dernière. Tant qu'aucune table d'historique
   * n'existe, tout pourcentage affiché ici serait inventé — et un chiffre
   * inventé sur un tableau de bord de pilotage se croit longtemps.
   *
   * Omettre la tendance retire le bandeau. C'est le comportement voulu : mieux
   * vaut une carte qui ne dit rien de l'évolution qu'une carte qui ment.
   */
  tendance?: string;
  tendancePositive?: boolean;
  /** Précision factuelle sous la valeur, quand une tendance n'est pas calculable. */
  precision?: string;
  icone: NomIcone;
}

export function CarteStat({
  libelle,
  valeur,
  unite = '',
  tendance,
  tendancePositive = true,
  precision,
  icone,
}: Props) {
  return (
    <div className="bg-surface rounded-lg border border-hairline p-5 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        {/* `truncate` et `min-w-0` : « Abonnements à échoir » poussait la
            pastille d'icône hors de la carte, et une carte dont l'icône déborde
            se lit comme une carte cassée. */}
        <span className="text-sm font-body font-medium text-muted-foreground min-w-0 truncate">
          {libelle}
        </span>
        <div className="w-8 h-8 rounded-pill border border-hairline flex items-center justify-center flex-shrink-0">
          <Icone nom={icone} taille={15} className="text-ink" />
        </div>
      </div>
      {/* La valeur et son unité sur une ligne de base commune, et le nombre
          insécable.

          `text-4xl` ne tenait pas dans une carte de quatre colonnes : à partir
          de `xl`, la grille en pose quatre sur la largeur restante, soit environ
          185 px utiles — moins que « 345 000 » suivi de « FCFA ». Le nombre
          passait à la ligne au milieu de lui-même. Il reprend sa pleine taille à
          `2xl`, où la place existe.

          L'unité peut, elle, descendre d'une ligne : « FCFA » sous le montant se
          lit encore ; « 000 FCFA » sous « 345 », non. */}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-headings font-bold text-3xl 2xl:text-4xl text-ink tabular-nums whitespace-nowrap">
          {valeur}
        </span>
        {unite && (
          <span className="text-lg 2xl:text-xl font-body font-medium text-muted-foreground">
            {unite}
          </span>
        )}
      </div>
      {tendance ? (
        <div className="flex items-center gap-1.5">
          <span
            className={`flex items-center gap-1 px-2 py-0.5 rounded-pill text-xs font-body font-semibold ${
              tendancePositive ? 'bg-positive-tint text-positive' : 'bg-negative-tint text-negative'
            }`}
          >
            <Icone nom={tendancePositive ? 'arrow-up-right' : 'arrow-down-right'} taille={11} />
            {tendance}
          </span>
          <span className="text-sm text-muted-foreground font-body">vs période précédente</span>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground font-body">{precision ?? ' '}</span>
      )}
    </div>
  );
}
