import { useEffect, useRef, useState } from 'react';

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

/**
 * Les entrées de la console de plateforme.
 *
 * Les libellés valent aussi pour `SuperAdmin.tsx`, qui n'a plus de barre
 * d'onglets à lui : depuis le 2026-08-30, sa navigation *est* cette barre
 * latérale, et lui reçoit l'onglet à afficher.
 *
 * `'abonnements'` existe des deux côtés — le Dashboard vend des paliers aux
 * collecteurs, la plateforme vend des abonnements aux organisations. Les deux
 * clés ne se croisent jamais : `espace` décide laquelle des deux listes est
 * rendue, et la coquille garde une page courante par espace.
 */
export type CleNavSuper =
  | 'abonnements'
  | 'administrateurs'
  | 'promos'
  | 'securite'
  | 'paiement'
  | 'plateforme';

type CleNav = CleNavAdmin | CleNavSuper;

/** Les deux consoles du produit. Voir `SelecteurEspace` ci-dessous. */
export type Espace = 'admin' | 'super';

interface Entree {
  cle: CleNav;
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

/**
 * La console de plateforme, réservée au niveau `super`.
 *
 * Elle n'est plus une entrée de la section « Système » depuis le 2026-08-30.
 * Ce n'était pas un écran de plus du Dashboard : le Dashboard gère la collecte
 * d'une organisation, cette console gère les organisations. Rangée sous
 * « Système », elle se lisait comme un réglage parmi d'autres. Elle est
 * maintenant un *espace* — on en change par le sélecteur en haut de la barre,
 * et le menu entier change avec.
 */
const SUPER_PILOTAGE: Entree[] = [
  { cle: 'abonnements', icone: 'credit-card', libelle: 'Abonnements', disponible: true },
  { cle: 'administrateurs', icone: 'users', libelle: 'Administrateurs', disponible: true },
  { cle: 'promos', icone: 'coins', libelle: 'Promotions', disponible: true },
];

const SUPER_SYSTEME: Entree[] = [
  { cle: 'securite', icone: 'shield-check', libelle: 'Sécurité', disponible: true },
  // La configuration de l'encaissement d'abonnement. Sous « Système » et non
  // sous « Pilotage » : ce n'est pas une recette qu'on regarde, c'est un
  // branchement qu'on vérifie. Aucune clé ne s'y saisit — l'écran répond « est-ce
  // configuré, et est-ce que ça marche », pas « voici la clé ».
  { cle: 'paiement', icone: 'credit-card', libelle: 'Paiement', disponible: true },
  { cle: 'plateforme', icone: 'bar-chart-2', libelle: 'Plateforme', disponible: true },
];

interface ConfigEspace {
  cle: Espace;
  icone: NomIcone;
  libelle: string;
  detail: string;
}

const ESPACES: ConfigEspace[] = [
  {
    cle: 'admin',
    icone: 'layout-dashboard',
    libelle: 'Kolek · Admin',
    detail: 'Pilotage de la collecte',
  },
  {
    cle: 'super',
    icone: 'shield-check',
    libelle: 'Kolek · Super Admin',
    detail: 'Administration de la plateforme',
  },
];

interface Props {
  /** L'espace courant. Le menu rendu en dépend entièrement. */
  espace?: Espace;
  actif: CleNav;
  onNaviguer: (cle: CleNav) => void;
  onDeconnexion: () => void;
  /** Fourni uniquement quand la barre est ouverte en tiroir, sous `lg`. Sa
      présence est ce qui fait apparaître la croix de fermeture : sur un écran
      large, la barre est toujours là et n'a rien à fermer. */
  onFermer?: () => void;
  /**
   * Ouvre le sélecteur d'espace. Absent par défaut : un menu ne montre pas ce
   * qu'il ne sait pas encore autorisé.
   *
   * **Masquer et non griser**, et ce fichier porte déjà deux fois la raison :
   * les entrées mortes ont été retirées le 2026-08-21, les deux raccourcis
   * grisés le 2026-08-22, avec l'argument « un menu qui promet ce qu'il ne
   * tiendra jamais est pire qu'un menu court ». Un sélecteur grisé pour cause de
   * privilège fait pire encore : il apprend à l'administrateur métier qu'il
   * existe un niveau au-dessus du sien, et lui donne quelque chose à réclamer.
   *
   * Ce masquage ne protège rien, et il ne prétend rien protéger. Le portillon
   * est `est_super_admin()`, vérifié par la base sous l'identité de l'appelant,
   * et les Edge Functions le redemandent à chaque appel.
   */
  estSuper?: boolean;
  onChangerEspace?: (espace: Espace) => void;
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
  actif: CleNav;
  onNaviguer: (cle: CleNav) => void;
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

/**
 * Le sélecteur d'espace — l'encart « Kolek · Admin » en haut de la barre.
 *
 * Il portait depuis les maquettes un chevron double qui ne s'ouvrait sur rien.
 * C'était une commande inerte de plus, du même genre que celles retirées les
 * 2026-08-21 et 2026-08-22 ; la différence est qu'ici la destination existait
 * déjà. Elle était simplement rangée au mauvais endroit, dans « Système ».
 *
 * Pour un administrateur métier, le chevron disparaît avec le menu qu'il
 * n'ouvrira jamais : un encart de contexte, pas un bouton.
 */
function SelecteurEspace({
  espace,
  onChanger,
}: {
  espace: Espace;
  onChanger?: (espace: Espace) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  const courant = ESPACES.find((e) => e.cle === espace)!;

  // Échap et clic à côté referment. Un menu qui ne se referme qu'en
  // choisissant oblige à choisir — ce qui n'est pas un choix.
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    const surClic = (e: MouseEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    window.addEventListener('keydown', surTouche);
    document.addEventListener('mousedown', surClic);
    return () => {
      window.removeEventListener('keydown', surTouche);
      document.removeEventListener('mousedown', surClic);
    };
  }, [ouvert]);

  if (!onChanger) {
    return (
      <div className="px-4 mb-4">
        <div className="bg-white/10 rounded-md px-3 py-2">
          <span className="text-white/80 text-sm font-body font-medium">{courant.libelle}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 mb-4 relative" ref={boite}>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={`Espace : ${courant.libelle}. Changer d’espace`}
        className="w-full flex items-center justify-between gap-2 bg-white/10 rounded-md px-3 py-2 cursor-pointer"
      >
        <span className="text-white/80 text-sm font-body font-medium truncate">
          {courant.libelle}
        </span>
        <Icone nom="chevrons-up-down" taille={14} className="text-white/50 flex-shrink-0" />
      </button>

      {ouvert && (
        // Sur fond clair : le menu est une surface du produit, pas une
        // continuation de la barre — le distinguer évite qu'on le lise comme
        // deux entrées de menu de plus.
        <div
          role="menu"
          className="absolute left-4 right-4 mt-1 z-20 rounded-md bg-surface border border-hairline shadow-lg overflow-hidden py-1"
        >
          {ESPACES.map((e) => {
            const estCourant = e.cle === espace;
            return (
              <button
                key={e.cle}
                type="button"
                role="menuitemradio"
                aria-checked={estCourant}
                onClick={() => {
                  setOuvert(false);
                  if (!estCourant) onChanger(e.cle);
                }}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 cursor-pointer ${
                  estCourant ? 'bg-secondary' : ''
                }`}
              >
                <Icone nom={e.icone} taille={16} className="text-primary flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-body font-semibold text-ink truncate">
                    {e.libelle}
                  </span>
                  <span className="block text-xs font-body text-muted-foreground truncate">
                    {e.detail}
                  </span>
                </span>
                {estCourant && (
                  <Icone nom="check" taille={14} className="ml-auto text-primary flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BarreLaterale({
  espace = 'admin',
  actif,
  onNaviguer,
  onDeconnexion,
  onFermer,
  estSuper,
  onChangerEspace,
}: Props) {
  const surPlateforme = espace === 'super';

  return (
    // `overflow-y-auto` : la barre porte huit entrées, deux raccourcis et un
    // encart de promotion. Sur un portable en 768 px de haut, le bas était
    // coupé sans possibilité d'y accéder.
    //
    // Le fond plus sombre de la console de plateforme n'est pas une décoration :
    // c'est le seul repère permanent qui dit dans quel espace on se trouve, et
    // il tient même quand la barre est défilée sous le sélecteur.
    <div
      className={`flex flex-col w-sidebar flex-shrink-0 h-full overflow-y-auto ${
        surPlateforme ? 'bg-dark-canvas' : 'bg-sidebar'
      }`}
    >
      {/* Logo. `text-surface` peint le mot : la pièce, elle, garde ses deux
          couleurs de marque. Cette barre était la seule à poser un carré vert
          là où les quatre autres emplacements posaient un carré or — deux
          barres latérales côte à côte dans le produit, deux marques. */}
      <div className="px-6 pt-6 pb-3 flex items-center gap-3">
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

      {surPlateforme && (
        <div className="px-6 pb-3">
          <span className="px-2.5 py-0.5 rounded-pill text-xs font-body font-semibold bg-chart-mint text-sidebar">
            Super Admin
          </span>
        </div>
      )}

      <SelecteurEspace
        espace={espace}
        onChanger={estSuper ? onChangerEspace : undefined}
      />

      {surPlateforme ? (
        <>
          <Section
            titre="Pilotage plateforme"
            entrees={SUPER_PILOTAGE}
            actif={actif}
            onNaviguer={onNaviguer}
          />
          <Section
            titre="Système"
            entrees={SUPER_SYSTEME}
            actif={actif}
            onNaviguer={onNaviguer}
            className="px-4 mt-4 mb-1"
          />
        </>
      ) : (
        <>
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
        </>
      )}

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

      {/* Promotion d'offre. Absente de la console de plateforme : elle propose à
          une organisation de passer à Pro, et la plateforme n'est l'abonnée de
          personne. */}
      {!surPlateforme && (
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
      )}
    </div>
  );
}
