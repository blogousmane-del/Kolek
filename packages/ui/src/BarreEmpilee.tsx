import { Icone } from './Icone';

export interface PartRepartition {
  libelle: string;
  pourcentage: number;
  /** Classe de la série — Design System §3.1, palette data-viz. */
  couleur: string;
  valeur: string;
}

interface Props {
  titre?: string;
  total: string;
  periode?: string;
  parts: PartRepartition[];
}

export function BarreEmpilee({
  titre = 'Répartition du mois',
  total,
  periode = 'Ce mois',
  parts,
}: Props) {
  return (
    <div>
      {/* L'en-tête s'enroule au lieu de comprimer la pastille de période :
          « Depuis l'ouverture » se coupait en deux lignes à l'intérieur de sa
          bordure arrondie, et la pastille devenait deux fois plus haute que le
          titre qu'elle accompagne. */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div className="min-w-0">
          <p className="text-sm font-body font-medium text-muted-foreground mb-1">{titre}</p>
          <p className="font-headings font-bold text-3xl 2xl:text-4xl text-ink tabular-nums">
            <span className="whitespace-nowrap">{total}</span>{' '}
            <span className="text-lg font-body font-medium text-muted-foreground">FCFA</span>
          </p>
        </div>
        <div className="flex items-center gap-1 border border-hairline rounded-pill px-3 py-1.5 flex-shrink-0">
          <span className="text-sm font-body font-medium text-ink whitespace-nowrap">
            {periode}
          </span>
          <Icone nom="chevron-down" taille={13} className="text-muted-foreground" />
        </div>
      </div>

      {/* La largeur vient de la donnée : c'est le seul style en ligne qui reste
          dans ce composant, et il n'a pas d'équivalent en classe. */}
      <div className="flex w-full h-3 rounded-pill overflow-hidden gap-0.5 mb-4">
        {parts.map((part) => (
          <div
            key={part.libelle}
            className={`${part.couleur} rounded-pill`}
            style={{ width: `${part.pourcentage}%` }}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {parts.map((part) => (
          <div key={part.libelle} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${part.couleur}`} />
              <span className="text-sm font-body text-muted-foreground truncate">
                {part.libelle}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-sm font-body font-semibold text-ink tabular-nums whitespace-nowrap">
                {part.valeur} FCFA
              </span>
              <span className="text-xs font-body text-muted-foreground w-8 text-right">
                {part.pourcentage} %
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
