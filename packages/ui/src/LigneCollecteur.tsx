import { Avatar } from './Avatar';
import { BadgeStatut, type Statut } from './BadgeStatut';
import { Icone } from './Icone';

interface Props {
  nom: string;
  zone: string;
  /** Le nom du titulaire, quand ce collecteur est un collaborateur. */
  titulaire?: string;
  clients: number;
  encaisse: string;
  statut: Statut;
  derniere?: boolean;
  onOuvrir?: () => void;
}

export function LigneCollecteur({
  nom,
  zone,
  titulaire,
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
        {/* Sur la ligne de la zone, et non sur une troisième : une ligne de
            plus ne pousserait que les collaborateurs, et la liste cesserait
            d'aligner ses colonnes avec ses en-têtes. */}
        <p className="text-sm font-body text-muted-foreground truncate">
          {titulaire ? `${zone} · Collaborateur de ${titulaire}` : zone}
        </p>
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
      {/* 44 px de côté, et non la taille de l'icône : ouvrir la fiche passe
          uniquement par ce chevron — la ligne n'est pas cliquable — et la
          console s'ouvre sur tablette, où la barre latérale devient un tiroir.
          L'écart avec la colonne précédente vient du `gap-4` du parent ; un
          `ml-2` en plus décalerait la colonne de l'en-tête. */}
      <button
        type="button"
        onClick={onOuvrir}
        aria-label={`Ouvrir la fiche de ${nom}`}
        className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-md cursor-pointer"
      >
        <Icone nom="chevron-right" className="text-muted-foreground" />
      </button>
    </div>
  );
}
