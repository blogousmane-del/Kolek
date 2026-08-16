import { Icone, type NomIcone } from './Icone';

interface Props {
  libelle: string;
  valeur: string;
  unite?: string;
  tendance: string;
  tendancePositive?: boolean;
  icone: NomIcone;
}

export function CarteStat({
  libelle,
  valeur,
  unite = '',
  tendance,
  tendancePositive = true,
  icone,
}: Props) {
  return (
    <div className="bg-surface rounded-lg border border-hairline p-5 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-body font-medium text-muted-foreground">{libelle}</span>
        <div className="w-8 h-8 rounded-pill border border-hairline flex items-center justify-center">
          <Icone nom={icone} taille={15} className="text-ink" />
        </div>
      </div>
      <div>
        <span className="font-headings font-bold text-4xl text-ink tabular-nums">{valeur}</span>
        {unite && (
          <span className="text-xl font-body font-medium text-muted-foreground ml-2">{unite}</span>
        )}
      </div>
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
    </div>
  );
}
