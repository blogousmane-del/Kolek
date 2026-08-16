import { Icone, type NomIcone } from './Icone';

export type CleNavAdmin = 'tableau' | 'collecteurs' | 'encours' | 'transactions' | 'zones';

interface Entree {
  cle: CleNavAdmin;
  icone: NomIcone;
  libelle: string;
  /** Une entrée non disponible ne se clique pas : promettre un écran qui
      n'existe pas coûte plus cher que de le dire. */
  disponible: boolean;
}

const PILOTAGE: Entree[] = [
  { cle: 'tableau', icone: 'layout-dashboard', libelle: 'Tableau de bord', disponible: true },
  { cle: 'collecteurs', icone: 'users', libelle: 'Collecteurs', disponible: true },
  { cle: 'encours', icone: 'wallet', libelle: 'Encours & Soldes', disponible: false },
  { cle: 'transactions', icone: 'receipt', libelle: 'Transactions', disponible: false },
  { cle: 'zones', icone: 'map-pin', libelle: 'Zones & Marchés', disponible: false },
];

const RACCOURCIS: Array<{ icone: NomIcone; libelle: string }> = [
  { icone: 'bar-chart-2', libelle: 'Rapports' },
  { icone: 'bell', libelle: 'Alertes' },
];

interface Props {
  actif: CleNavAdmin;
  onNaviguer: (cle: CleNavAdmin) => void;
  onDeconnexion: () => void;
}

export function BarreLaterale({ actif, onNaviguer, onDeconnexion }: Props) {
  return (
    <div className="flex flex-col bg-sidebar w-sidebar flex-shrink-0 min-h-full">
      {/* Logo */}
      <div className="px-6 py-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
          <span className="text-primary-foreground font-headings font-bold text-base">K</span>
        </div>
        <span className="font-headings font-bold text-surface text-xl tracking-tight">Kolek</span>
      </div>

      {/* Contexte */}
      <div className="px-4 mb-4">
        <div className="flex items-center justify-between bg-white/10 rounded-md px-3 py-2">
          <span className="text-white/80 text-sm font-body font-medium">Kolek · Admin</span>
          <Icone nom="chevrons-up-down" taille={14} className="text-white/50" />
        </div>
      </div>

      <div className="px-4 mb-1">
        <p className="text-xs font-body font-semibold uppercase tracking-widest text-white/30 px-2 mb-2">
          Pilotage
        </p>
        {PILOTAGE.map((entree) => {
          const estActif = entree.cle === actif;
          return (
            <button
              key={entree.cle}
              type="button"
              disabled={!entree.disponible}
              // Pas d'étiquette « à venir » : elle volait la largeur du libellé
              // et faisait passer « Encours & Soldes » sur deux lignes. Le
              // contraste réduit et l'état `disabled` disent la même chose sans
              // déformer la barre.
              title={entree.disponible ? undefined : 'Écran à venir'}
              onClick={() => onNaviguer(entree.cle)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md mb-0.5 ${
                estActif ? 'bg-white/10 border-l-2 border-chart-mint' : ''
              } ${entree.disponible ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <Icone
                nom={entree.icone}
                className={
                  estActif ? 'text-chart-mint' : entree.disponible ? 'text-white/50' : 'text-white/25'
                }
              />
              <span
                className={`text-base font-body font-medium whitespace-nowrap ${
                  estActif ? 'text-white' : entree.disponible ? 'text-white/60' : 'text-white/30'
                }`}
              >
                {entree.libelle}
              </span>
            </button>
          );
        })}
      </div>

      <div className="px-4 mt-4 mb-1">
        <p className="text-xs font-body font-semibold uppercase tracking-widest text-white/30 px-2 mb-2">
          Raccourcis
        </p>
        {RACCOURCIS.map((entree) => (
          <div
            key={entree.libelle}
            title="Écran à venir"
            className="flex items-center gap-3 px-3 py-2.5 rounded-md mb-0.5"
          >
            <Icone nom={entree.icone} className="text-white/25" />
            <span className="text-base font-body font-medium text-white/30 whitespace-nowrap">
              {entree.libelle}
            </span>
          </div>
        ))}
      </div>

      <div className="flex-1 min-h-20" />

      {/* Sortie de session. Absente de la maquette, indispensable au produit :
          un poste d'administration partagé sans déconnexion est une session
          ouverte pour le suivant. */}
      <div className="px-4 mb-2">
        <button
          type="button"
          onClick={onDeconnexion}
          className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer"
        >
          <Icone nom="log-out" className="text-white/50" />
          <span className="text-base font-body font-medium text-white/60">Déconnexion</span>
        </button>
      </div>

      {/* Promotion d'offre */}
      <div className="mx-4 mb-6 rounded-xl p-4 border border-white/8 bg-[image:var(--degrade-promo)]">
        <p className="text-white font-body font-semibold text-base mb-1">Passer à Pro</p>
        <p className="text-white/60 text-sm font-body mb-3">
          Collecteurs illimités, rapports avancés.
        </p>
        <button
          type="button"
          className="w-full rounded-md bg-chart-mint text-sidebar text-sm font-body font-semibold py-2"
        >
          Voir les offres
        </button>
      </div>
    </div>
  );
}
