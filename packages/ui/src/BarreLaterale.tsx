import { Icone, type NomIcone } from './Icone';
import { Logo } from './Logo';

export type CleNavAdmin =
  | 'tableau'
  | 'collecteurs'
  | 'encours'
  | 'encaisser'
  | 'abonnements'
  | 'demandes'
  | 'avis'
  | 'reglages';

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
  { cle: 'encours', icone: 'wallet', libelle: 'Encours & Soldes', disponible: true },
  { cle: 'encaisser', icone: 'circle-dollar-sign', libelle: 'Encaisser', disponible: true },
  // « Transactions » et « Zones & Marchés » ont été retirées le 2026-08-21.
  // Elles n'étaient pas en attente d'être construites : leur contenu existe
  // déjà ailleurs — les mouvements sur le tableau de bord, les zones dans
  // l'écran Collecteurs. Deux entrées grises promettaient donc des destinations
  // qui n'ont pas lieu d'exister, et un menu qui promet ce qu'il ne tiendra
  // jamais est pire qu'un menu court.
];

/** La monétisation est le métier de GTCS, pas celui d'un collecteur : elle a sa
    propre section plutôt que de se glisser dans le pilotage terrain. */
const MONETISATION: Entree[] = [
  { cle: 'abonnements', icone: 'credit-card', libelle: 'Abonnements', disponible: true },
  // Les demandes déposées depuis la vitrine. Sous « Monétisation » et non sous
  // « Pilotage » : ce sont des prospects, pas des collecteurs — le travail
  // qu'elles appellent est commercial.
  { cle: 'demandes', icone: 'user-plus', libelle: 'Demandes', disponible: true },
];

/**
 * La section « Système ».
 *
 * Elle remplace, le 2026-08-22, deux « raccourcis » — Rapports et Alertes —
 * rendus en `<div>` grisés avec l'infobulle « Écran à venir ». Ils étaient là
 * depuis les maquettes, ne menaient nulle part, et n'avaient échappé au balayage
 * des commandes inertes du 2026-08-21 que parce qu'ils n'étaient pas des
 * `<button>` : une entrée de menu morte n'a pas besoin d'être un bouton pour
 * faire perdre du temps à celui qui la voit.
 *
 * Aucun des deux n'était en attente d'être construit. Les rapports sont devenus
 * l'export CSV, dans les écrans qui ont des lignes à exporter ; les alertes de
 * la plateforme sont les échéances d'abonnement, déjà visibles sur le tableau de
 * bord et dans Abonnements.
 */
const SYSTEME: Entree[] = [
  // Les avis aux clients. Sous « Système » et non sous « Monétisation » : ce
  // n'est pas une recette, c'est une dépense — et la seule commande du produit
  // dont un réglage se traduit en facture opérateur.
  { cle: 'avis', icone: 'bell', libelle: 'Avis clients', disponible: true },
  { cle: 'reglages', icone: 'settings', libelle: 'Réglages', disponible: true },
];

interface Props {
  actif: CleNavAdmin;
  onNaviguer: (cle: CleNavAdmin) => void;
  onDeconnexion: () => void;
  /** Fourni uniquement quand la barre est ouverte en tiroir, sous `lg`. Sa
      présence est ce qui fait apparaître la croix de fermeture : sur un écran
      large, la barre est toujours là et n'a rien à fermer. */
  onFermer?: () => void;
}

function Section({
  titre,
  entrees,
  actif,
  onNaviguer,
  className = 'px-4 mb-1',
}: {
  titre: string;
  entrees: Entree[];
  actif: CleNavAdmin;
  onNaviguer: (cle: CleNavAdmin) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-body font-semibold uppercase tracking-widest text-white/30 px-2 mb-2">
        {titre}
      </p>
      {entrees.map((entree) => {
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
  );
}

export function BarreLaterale({ actif, onNaviguer, onDeconnexion, onFermer }: Props) {
  return (
    // `overflow-y-auto` : la barre porte huit entrées, deux raccourcis et un
    // encart de promotion. Sur un portable en 768 px de haut, le bas était
    // coupé sans possibilité d'y accéder.
    <div className="flex flex-col bg-sidebar w-sidebar flex-shrink-0 h-full overflow-y-auto">
      {/* Logo. `text-surface` peint le mot : la pièce, elle, garde ses deux
          couleurs de marque. Cette barre était la seule à poser un carré vert
          là où les quatre autres emplacements posaient un carré or — deux
          barres latérales côte à côte dans le produit, deux marques. */}
      <div className="px-6 py-6 flex items-center gap-3">
        <Logo className="h-9 text-surface" />
        {onFermer && (
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer le menu"
            className="ml-auto w-11 h-11 -mr-2 flex items-center justify-center rounded-md cursor-pointer"
          >
            <Icone nom="x" className="text-white/60" />
          </button>
        )}
      </div>

      {/* Contexte */}
      <div className="px-4 mb-4">
        <div className="flex items-center justify-between bg-white/10 rounded-md px-3 py-2">
          <span className="text-white/80 text-sm font-body font-medium">Kolek · Admin</span>
          <Icone nom="chevrons-up-down" taille={14} className="text-white/50" />
        </div>
      </div>

      <Section titre="Pilotage" entrees={PILOTAGE} actif={actif} onNaviguer={onNaviguer} />
      <Section
        titre="Monétisation"
        entrees={MONETISATION}
        actif={actif}
        onNaviguer={onNaviguer}
        className="px-4 mt-4 mb-1"
      />

      <Section
        titre="Système"
        entrees={SYSTEME}
        actif={actif}
        onNaviguer={onNaviguer}
        className="px-4 mt-4 mb-1"
      />

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
        {/* Sans gestionnaire tant que la page d'offres n'existe pas. Désactivé
            plutôt qu'inerte : la même convention que les entrées « à venir »
            au-dessus, sinon il se lit comme un bouton cassé. */}
        <button
          type="button"
          disabled
          title="Page des offres à venir"
          className="w-full rounded-md bg-chart-mint text-sidebar text-sm font-body font-semibold py-2 opacity-60 cursor-default"
        >
          Voir les offres
        </button>
      </div>
    </div>
  );
}
