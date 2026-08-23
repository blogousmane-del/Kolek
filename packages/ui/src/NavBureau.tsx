import { Icone, type NomIcone } from './Icone';

/**
 * La navigation du collecteur sur écran large.
 *
 * ## Pourquoi une barre latérale plutôt que la barre du bas agrandie
 *
 * L'application est née sur téléphone, et sa barre du bas ne montre que cinq
 * onglets — au-delà, les libellés se coupent sous le pouce. Les cinq autres
 * écrans (retrait, rapprochement, reçus, alertes, profil) s'atteignent donc par
 * la grille d'actions de l'accueil, et **on ne peut pas y aller directement**.
 *
 * C'est une contrainte de largeur, pas une décision de produit. Un écran de
 * bureau n'a pas cette contrainte : les dix destinations tiennent, et les
 * montrer supprime le détour par l'accueil qui coûte un clic à chaque fois.
 *
 * ## Ce que cette barre ne fait pas
 *
 * Elle ne remplace pas `NavMobile`, elle s'y ajoute. Les deux coexistent dans la
 * coquille, chacune visible à sa taille. Fusionner les deux en un composant qui
 * change de forme aurait produit un fichier où l'on ne voit plus quel écran
 * obtient quoi — et c'est justement ce qui rend une mise en page adaptative
 * illisible six mois plus tard.
 */

export type CleNavBureau =
  | 'accueil'
  | 'clients'
  | 'encaisser'
  | 'bilans'
  | 'retrait'
  | 'rapprochement'
  | 'recus'
  | 'alertes'
  | 'profil';

interface Entree {
  cle: CleNavBureau;
  icone: NomIcone;
  libelle: string;
}

/** Le geste du métier, isolé : c'est celui qu'on fait quarante fois par jour. */
const ENCAISSEMENT: Entree = {
  cle: 'encaisser',
  icone: 'circle-dollar-sign',
  libelle: 'Encaisser',
};

const TOURNEE: Entree[] = [
  { cle: 'accueil', icone: 'home', libelle: 'Accueil' },
  { cle: 'clients', icone: 'users', libelle: 'Clients' },
  { cle: 'retrait', icone: 'arrow-up-right', libelle: 'Retrait' },
];

const SOIR: Entree[] = [
  { cle: 'rapprochement', icone: 'refresh-cw', libelle: 'Rapprochement' },
  { cle: 'bilans', icone: 'bar-chart-2', libelle: 'Bilan' },
  { cle: 'recus', icone: 'receipt', libelle: 'Reçus' },
  { cle: 'alertes', icone: 'bell', libelle: 'Alertes' },
];

const COMPTE: Entree[] = [{ cle: 'profil', icone: 'user', libelle: 'Mon compte' }];

interface Props {
  actif: string;
  onNaviguer: (cle: CleNavBureau) => void;
  onDeconnexion: () => void;
  nom: string | null;
}

function Groupe({
  titre,
  entrees,
  actif,
  onNaviguer,
}: {
  titre: string;
  entrees: Entree[];
  actif: string;
  onNaviguer: (cle: CleNavBureau) => void;
}) {
  return (
    <div className="mb-5 px-3">
      <p className="mb-2 px-2 font-body text-xs font-semibold uppercase tracking-widest text-white/30">
        {titre}
      </p>
      {entrees.map((entree) => {
        const estActif = entree.cle === actif;
        return (
          <button
            key={entree.cle}
            type="button"
            onClick={() => onNaviguer(entree.cle)}
            className={`mb-0.5 flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left ${
              estActif ? 'border-l-2 border-chart-mint bg-white/10' : ''
            }`}
          >
            <Icone
              nom={entree.icone}
              className={estActif ? 'text-chart-mint' : 'text-white/50'}
            />
            <span
              className={`whitespace-nowrap font-body text-base font-medium ${
                estActif ? 'text-white' : 'text-white/60'
              }`}
            >
              {entree.libelle}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function NavBureau({ actif, onNaviguer, onDeconnexion, nom }: Props) {
  return (
    <aside className="flex h-dvh w-sidebar flex-shrink-0 flex-col overflow-y-auto bg-sidebar">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-or">
          <span className="font-headings text-base font-bold text-dark-canvas">K</span>
        </div>
        <span className="font-headings text-xl font-bold tracking-tight text-surface">Kolek</span>
      </div>

      {/* L'encaissement, détaché et en couleur : sur la barre du bas il sort du
          rang par un bouton saillant, et il doit garder ce statut ici. */}
      <div className="mb-6 px-3">
        <button
          type="button"
          onClick={() => onNaviguer(ENCAISSEMENT.cle)}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-pill bg-primary py-3 shadow-action"
        >
          <Icone nom={ENCAISSEMENT.icone} taille={20} className="text-primary-foreground" />
          <span className="font-body text-base font-semibold text-primary-foreground">
            {ENCAISSEMENT.libelle}
          </span>
        </button>
      </div>

      <Groupe titre="Ma tournée" entrees={TOURNEE} actif={actif} onNaviguer={onNaviguer} />
      <Groupe titre="Le soir" entrees={SOIR} actif={actif} onNaviguer={onNaviguer} />
      <Groupe titre="Compte" entrees={COMPTE} actif={actif} onNaviguer={onNaviguer} />

      <div className="min-h-6 flex-1" />

      <div className="border-t border-white/8 px-3 py-4">
        {nom && (
          <p className="mb-2 truncate px-3 font-body text-sm text-white/40" title={nom}>
            {nom}
          </p>
        )}
        <button
          type="button"
          onClick={onDeconnexion}
          className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left"
        >
          <Icone nom="log-out" className="text-white/50" />
          <span className="font-body text-base font-medium text-white/60">Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}
