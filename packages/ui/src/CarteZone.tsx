import { Icone } from './Icone';

/**
 * Classes écrites en toutes lettres : Tailwind lit le source, il ne l'exécute
 * pas. Une classe fabriquée par concaténation (`bg-[...var(--degrade-zone-${i})]`)
 * n'existerait dans aucune feuille de style.
 */
const DEGRADES = [
  'bg-[image:var(--degrade-zone-0)]',
  'bg-[image:var(--degrade-zone-1)]',
  'bg-[image:var(--degrade-zone-2)]',
  'bg-[image:var(--degrade-zone-3)]',
] as const;

interface Props {
  zone: string;
  collecteurs: number;
  clients: number;
  encaisse: string;
  progression: number;
  index?: number;
}

export function CarteZone({
  zone,
  collecteurs,
  clients,
  encaisse,
  progression,
  index = 0,
}: Props) {
  const degrade = DEGRADES[index % DEGRADES.length]!;

  return (
    <div className="bg-surface rounded-lg border border-hairline overflow-hidden shadow-sm">
      <div className={`h-2 w-full ${degrade}`} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="font-headings font-bold text-lg text-ink">{zone}</p>
            <p className="text-sm text-muted-foreground font-body">
              {collecteurs} collecteurs · {clients} clients
            </p>
          </div>
          <Icone nom="map-pin" className="text-muted-foreground mt-1" />
        </div>
        <p className="font-headings font-bold text-2xl text-ink mb-1 tabular-nums">
          {encaisse}{' '}
          <span className="text-base font-body font-medium text-muted-foreground">FCFA</span>
        </p>
        <p className="text-xs text-muted-foreground font-body mb-3">encaissé aujourd’hui</p>
        <div className="w-full h-1.5 bg-muted rounded-pill overflow-hidden">
          <div className="h-full bg-primary rounded-pill" style={{ width: `${progression}%` }} />
        </div>
        <p className="text-xs text-muted-foreground font-body mt-1">
          {progression} % de l’objectif journalier
        </p>
      </div>
    </div>
  );
}
