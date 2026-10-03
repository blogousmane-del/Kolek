import { MISES_PAR_CYCLE } from '@kolek/core';
import type { ReactNode } from 'react';

import { Onde } from './Guilloche';

interface Props {
  nomClient: string;
  misePar: string;
  /**
   * Les mises encaissées. Les cases 1 à `jourCourant` sont payées, la
   * suivante est la prochaine. Le nom est d'avant le billet ; la vitrine, la
   * fiche et l'accueil le passent, il reste.
   */
  jourCourant: number;
  totalJours?: number;
  solde: string;
  /**
   * Le numéro de cycle, quand l'écran le connaît. Sans lui, pas de pastille :
   * l'accueil et l'encaissement écrivaient « Cycle 1 » en dur, et c'était faux
   * pour un client à sa deuxième carte.
   */
  cycle?: string;
  /**
   * Ce que la carte porte en pied quand elle est la carte choisie.
   *
   * Un nœud et non un libellé : la carte ne connaît ni les montants ni les
   * écritures. Elle réserve une place, l'écran décide ce qui s'y met.
   */
  action?: ReactNode;
  /**
   * La case qu'on vient de payer, en vert de réussite le temps du geste.
   *
   * Toujours une case déjà payée : `neuve <= jourCourant`. Au-delà, `etatDe`
   * lui donne le pas sur les autres états et elle cacherait le cercle de la
   * prochaine case.
   */
  neuve?: number;
  /**
   * Ce qui se pose sur la carte, en haut à droite : le tampon d'un geste.
   *
   * Le bloc du nom lui réserve sa largeur tant qu'il est là (`pr-30`) : le
   * tampon ne pousse rien, il se pose par-dessus.
   */
  tampon?: ReactNode;
  /** Ce qui coiffe la carte au-dessus du nom : son rôle à l'écran. */
  surtitre?: ReactNode;
  /** « Solde restituable » ; « Rendu au client » une fois la carte close. */
  etiquetteSolde?: string;
  /**
   * La carte est close : aucune case n'attend plus de mise. Un retrait
   * anticipé clôt une carte à 4/31, et cercler sa cinquième case dirait
   * qu'elle attend encore quelque chose.
   */
  close?: boolean;
}

type EtatCase = 'payee' | 'neuve' | 'prochaine' | 'a-venir';

function etatDe(numero: number, jourCourant: number, neuve: number | undefined, close: boolean): EtatCase {
  if (numero === neuve) return 'neuve';
  if (numero <= jourCourant) return 'payee';
  if (numero === jourCourant + 1 && !close) return 'prochaine';
  return 'a-venir';
}

/** Chaque état porte sa bordure entière : deux largeurs dans une même classe
    laisseraient l'ordre de la feuille de style trancher. */
const CASES: Record<EtatCase, string> = {
  payee: 'border border-primary bg-primary',
  neuve: 'border border-positive bg-positive ring-2 ring-positive/25',
  prochaine: 'border-2 border-primary bg-surface',
  'a-venir': 'border border-trait/40 bg-canvas',
};

/**
 * La carte de collecte : le carnet papier que Kolek remplace, dessiné en billet.
 *
 * ## Ce qui a changé le 2026-10-02
 *
 * Elle portait le dégradé vert-bleu-violet du gabarit d'origine, deux cercles
 * décoratifs et des pastilles de verre dépoli. Rien de tout cela ne disait
 * l'argent ; tout cela disait « maquette ». Elle devient un billet : du papier,
 * un filet, une bande guillochée sur le bord haut — la gravure de la vitrine,
 * en vert coffre — et des chiffres de caisse.
 *
 * Le nombre de cases n'est pas une valeur de maquette mais la règle du
 * produit, tenue par le moteur de calcul : d'où l'import de `MISES_PAR_CYCLE`.
 *
 * ## Pourquoi elle se mesure elle-même
 *
 * Le carrousel de la fiche la rend tantôt à 160 px, tantôt à toute la largeur.
 * La taille arrive par **requête de conteneur** : la seule chose qui compte est
 * la largeur que la carte reçoit. Les valeurs de base sont celles de la pleine
 * largeur, et c'est le format réduit qui s'écrit en `@max-[240px]:` : une
 * règle ignorée par un vieux WebView doit laisser la carte telle qu'en grand.
 *
 * ## Ce que la vitrine en montre
 *
 * `Telephone.tsx` la rend telle quelle dans le téléphone du hero. Le jour où
 * elle change, la vitrine change avec elle : c'est voulu.
 */
export function CarteCollecte({
  nomClient,
  misePar,
  jourCourant,
  totalJours = MISES_PAR_CYCLE,
  solde,
  cycle,
  action,
  neuve,
  tampon,
  surtitre,
  etiquetteSolde = 'Solde restituable',
  close = false,
}: Props) {
  const cases = Array.from({ length: totalJours }, (_, i) => i + 1);

  return (
    <div
      data-carte-collecte=""
      className="@container relative overflow-hidden rounded-xl border border-hairline bg-surface"
    >
      <Onde
        lignes={7}
        traitFixe
        className="pointer-events-none absolute inset-x-0 top-0 h-2.5 w-full text-primary/30"
      />
      {tampon && <div className="absolute right-3 top-3.5 z-10">{tampon}</div>}

      <div className="relative px-4 pb-4 pt-5 @max-[240px]:px-3 @max-[240px]:pb-3 @max-[240px]:pt-4">
        {surtitre && <div className="mb-2.5">{surtitre}</div>}

        {/* En-tête. Côte à côte tant qu'il y a la place ; l'un sous l'autre
            quand la carte est réduite, où deux colonnes ne laisseraient au nom
            que quelques caractères. */}
        <div className="flex items-start justify-between gap-3 @max-[240px]:flex-col @max-[240px]:gap-1.5">
          {/* Avec un tampon, le bloc du nom lui laisse sa place. Le tampon est
              posé en absolu : il ne pousse rien, et la fin d'un nom de plus
              d'une quinzaine de lettres passait dessous. Mesuré en navigateur,
              polices chargées : ENCAISSÉ 112 px, GARDÉE 110, CLÔTURÉE 113 de
              large, penchés de 6 degrés (boîte englobante de 116,3, 114,1 et
              117,6 px), posés à 12 px du bord (`right-3`) alors que le contenu
              commence à 16 (`px-4`) : jusqu'à 111,5 px du nom passent sous le
              plus large. `pr-30` (120 px) lui laisse 8,5 px d'air. Sans tampon
              rien ne change : la carte garde toute sa largeur. */}
          <div className={`min-w-0 ${tampon ? 'pr-30' : ''}`}>
            <p className="font-headings text-xl font-bold leading-tight text-ink @max-[240px]:text-base">
              {nomClient}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5 text-xs">
              <p className="font-body text-muted-foreground">Mise / jour</p>
              <p className="font-mono font-medium text-ink tabular-nums">
                {misePar} <span className="font-body font-normal text-muted-foreground">FCFA</span>
              </p>
            </div>
          </div>
          {cycle !== undefined && (
            <span className="shrink-0 rounded-pill border border-hairline px-2.5 py-0.5 font-body text-xs text-muted-foreground">
              Cycle {cycle}
            </span>
          )}
        </div>

        {/* Les cases du cycle. Huit colonnes en format réduit : seize cases
            sur 136 px donneraient des traits de 6 px, où l'on ne distingue plus
            la case payée de la case à payer. */}
        <div className="mt-4 grid grid-cols-16 gap-1 @max-[240px]:mt-3 @max-[240px]:grid-cols-8 @max-[240px]:gap-0.5">
          {cases.map((numero) => {
            const etat = etatDe(numero, jourCourant, neuve, close);
            return (
              <span
                key={numero}
                data-etat={etat}
                className={`h-4.5 rounded-xs @max-[240px]:h-3 ${CASES[etat]}`}
              />
            );
          })}
        </div>

        <div className="mt-4 flex items-end justify-between gap-3 @max-[240px]:mt-3 @max-[240px]:flex-col @max-[240px]:items-start @max-[240px]:gap-1">
          <div>
            <p className="font-body text-xs text-muted-foreground">{etiquetteSolde}</p>
            <p className="mt-1 font-mono text-2xl font-medium leading-none text-ink tabular-nums @max-[240px]:text-lg">
              {solde}{' '}
              <span className="font-body text-sm font-medium text-muted-foreground">FCFA</span>
            </p>
          </div>
          <p className="font-mono text-base font-medium text-ink tabular-nums @max-[240px]:text-sm">
            {jourCourant}/{totalJours}
          </p>
        </div>

        {/* La fente. Dans le flux, et non en calque : le solde est ce qu'on
            regarde avant d'agir, et un bouton posé par-dessus le masquerait au
            moment précis où il compte. La carte grandit. */}
        {action && <div className="mt-4 @max-[240px]:mt-2">{action}</div>}
      </div>
    </div>
  );
}
