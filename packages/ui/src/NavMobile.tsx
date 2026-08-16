import { Icone, type NomIcone } from './Icone';

export type CleNavCollecteur = 'accueil' | 'clients' | 'encaisser' | 'bilans' | 'profil';

interface Onglet {
  cle: CleNavCollecteur;
  icone: NomIcone;
  libelle: string;
  disponible: boolean;
  /** L'encaissement est le geste du métier : il sort de la barre. */
  saillant?: boolean;
}

const ONGLETS: Onglet[] = [
  { cle: 'accueil', icone: 'home', libelle: 'Accueil', disponible: true },
  { cle: 'clients', icone: 'users', libelle: 'Clients', disponible: true },
  {
    cle: 'encaisser',
    icone: 'circle-dollar-sign',
    libelle: 'Encaisser',
    disponible: true,
    saillant: true,
  },
  { cle: 'bilans', icone: 'bar-chart-2', libelle: 'Bilans', disponible: false },
  { cle: 'profil', icone: 'user', libelle: 'Profil', disponible: false },
];

interface Props {
  actif: CleNavCollecteur;
  onNaviguer: (cle: CleNavCollecteur) => void;
}

export function NavMobile({ actif, onNaviguer }: Props) {
  return (
    // `sticky` : la maquette posait la barre en fin de colonne. Sur un écran
    // réel la liste des clients dépasse la hauteur du téléphone, et une barre
    // qui part au défilement oblige à remonter avant chaque encaissement.
    <div className="sticky bottom-0 z-10 bg-surface border-t border-hairline flex items-center justify-around px-2 py-3">
      {ONGLETS.map((onglet) => {
        const estActif = onglet.cle === actif;

        if (onglet.saillant) {
          return (
            <button
              key={onglet.cle}
              type="button"
              onClick={() => onNaviguer(onglet.cle)}
              className="flex flex-col items-center gap-1 -mt-5 cursor-pointer"
            >
              <div className="w-14 h-14 rounded-pill bg-primary flex items-center justify-center shadow-action">
                <Icone nom={onglet.icone} taille={24} className="text-primary-foreground" />
              </div>
              <span className="text-xs font-body font-semibold text-primary">{onglet.libelle}</span>
            </button>
          );
        }

        const teinte = !onglet.disponible
          ? 'text-muted-foreground/40'
          : estActif
            ? 'text-primary'
            : 'text-muted-foreground';

        return (
          <button
            key={onglet.cle}
            type="button"
            disabled={!onglet.disponible}
            onClick={() => onNaviguer(onglet.cle)}
            className={`flex flex-col items-center gap-1 px-2 ${
              onglet.disponible ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            <Icone nom={onglet.icone} taille={22} className={teinte} />
            <span className={`text-xs font-body font-medium ${teinte}`}>{onglet.libelle}</span>
          </button>
        );
      })}
    </div>
  );
}
