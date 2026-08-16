import { Avatar } from './Avatar';
import { BadgeStatut, type Statut } from './BadgeStatut';
import { Icone } from './Icone';

interface Props {
  nom: string;
  zone: string;
  clients: number;
  encaisse: string;
  statut: Statut;
  derniere?: boolean;
  onOuvrir?: () => void;
}

export function LigneCollecteur({
  nom,
  zone,
  clients,
  encaisse,
  statut,
  derniere = false,
  onOuvrir,
}: Props) {
  return (
    <div
      className={`flex items-center gap-4 px-6 py-4 ${derniere ? '' : 'border-b border-hairline'}`}
    >
      <Avatar nom={nom} className="w-10 h-10 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-base font-body font-semibold text-ink truncate">{nom}</p>
        <p className="text-sm font-body text-muted-foreground truncate">{zone}</p>
      </div>
      <div className="w-20 text-right">
        <p className="text-base font-body font-medium text-ink tabular-nums">{clients}</p>
        <p className="text-xs font-body text-muted-foreground">clients</p>
      </div>
      <div className="w-36 text-right">
        <p className="text-base font-body font-semibold text-positive tabular-nums">
          {encaisse} FCFA
        </p>
        <p className="text-xs font-body text-muted-foreground">du jour</p>
      </div>
      <div className="w-28 flex justify-end">
        <BadgeStatut statut={statut} className="px-3 py-1" />
      </div>
      <button
        type="button"
        onClick={onOuvrir}
        aria-label={`Ouvrir la fiche de ${nom}`}
        className="ml-2 cursor-pointer"
      >
        <Icone nom="chevron-right" className="text-muted-foreground" />
      </button>
    </div>
  );
}
