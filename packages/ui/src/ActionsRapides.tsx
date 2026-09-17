import type { CSSProperties } from 'react';

import { Icone, type NomIcone } from './Icone';

/**
 * Les quatre familles de destination.
 *
 * ## Pourquoi quatre, et plus neuf
 *
 * Jusqu'au 2026-09-17, la couleur d'une tuile était déduite de son **icône** :
 * neuf icônes, neuf couleurs, une table qui grandissait d'une ligne à chaque
 * écran ajouté. Deux défauts, et le second est le plus coûteux.
 *
 * Le premier : neuf couleurs ne se mémorisent pas. Un collecteur qui ouvre son
 * application trente fois par jour n'apprend jamais que l'ocre veut dire reçus
 * et le bleu-gris bilan ; il lit les mots, et la couleur n'est plus qu'un
 * bruit. Quatre familles, elles, s'apprennent en une semaine : ce qui touche à
 * l'argent, ce qui touche au client, ce qui regarde en arrière, ce qui range.
 *
 * Le second : la couleur était **accrochée au dessin**. Deux destinations qui
 * partagent une icône partageaient forcément une couleur, et une destination
 * qui changeait d'icône changeait de couleur sans que personne l'ait décidé.
 * La famille est donc déclarée par l'écran, qui seul sait ce que la destination
 * fait.
 *
 * ## Le rouge n'est pas une famille
 *
 * « Alertes » vit dans `gestion`, et non dans une cinquième famille d'alarme.
 * Une tuile rouge en permanence ne dit rien : elle est rouge le jour où il y a
 * trois refus comme le jour où il n'y en a aucun. L'urgence se dit là où elle
 * existe vraiment — le bandeau « N opérations refusées, à voir » de l'accueil,
 * qui n'apparaît que quand le nombre est non nul.
 */
export type FamilleAction = 'argent' | 'client' | 'analyse' | 'gestion';

/**
 * Chaque famille est un aplat, et l'aplat **est** la tuile.
 *
 * C'est le changement de forme, et il vient de la capture d'écran que GTCS a
 * apportée : la tuile portait une carte blanche avec une pastille colorée
 * dedans, donc une carte dans une carte, et la couleur n'était qu'un badge posé
 * sur du blanc. Ici la couleur porte toute la surface, l'icône est un trait
 * posé dessus, et il ne reste qu'un objet là où il y en avait deux.
 *
 * Les quatre paires tiennent le seuil AA sur leur propre fond : 4,68:1 pour
 * argent, 7,01:1 pour client, 6,76:1 pour analyse, 4,78:1 pour gestion. Elles
 * sont mesurées sur les jetons de `packages/core/src/tokens.ts`, pas choisies à
 * l'œil.
 */
const FAMILLES: Record<FamilleAction, string> = {
  argent: 'bg-positive-tint text-positive',
  client: 'bg-secondary text-accent',
  analyse: 'bg-ardoise-tint text-ardoise',
  gestion: 'bg-ocre-tint text-ocre',
};

export interface ActionRapide {
  icone: NomIcone;
  libelle: string;
  /** Défaut `gestion` : une destination qui ne dit rien range plutôt qu'elle
      ne touche à l'argent, et c'est le défaut le moins trompeur. */
  famille?: FamilleAction;
  onActiver?: () => void;
}

interface Props {
  actions: ActionRapide[];
  compact?: boolean;
  anime?: boolean;
}

export function ActionsRapides({ actions, compact = false, anime = false }: Props) {
  return (
    <div
      className={`grid gap-2 xs:gap-2.5 ${
        compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-5'
      }`}
    >
      {actions.map((action, rang) => {
        const teintes = FAMILLES[action.famille ?? 'gestion'];

        return (
          <button
            key={action.libelle}
            type="button"
            disabled={!action.onActiver}
            title={action.onActiver ? undefined : 'À venir'}
            onClick={action.onActiver}
            style={anime ? ({ '--rang': rang } as CSSProperties) : undefined}
            /*
              Ni bordure ni ombre. L'aplat suffit à détacher la tuile du canevas,
              et cinquante-huit ombres réparties sur le produit ne soulevaient
              plus rien : quand chaque bloc décolle, il ne reste qu'un bruit gris.

              `justify-between` tient la diagonale de la capture : l'icône en
              haut à gauche, le libellé en bas à droite. C'est ce qui fait qu'une
              tuile se lit d'un coup d'œil sans encadrer son texte.
            */
            className={`anim-pression flex flex-col justify-between rounded-lg text-left ${teintes} ${
              compact ? 'min-h-20 p-2.5' : 'min-h-24 p-3'
            } ${anime ? 'anim-cascade' : ''} ${
              action.onActiver ? 'cursor-pointer' : 'opacity-60 cursor-default'
            }`}
          >
            <Icone nom={action.icone} taille={compact ? 20 : 24} />
            <span className="font-body font-semibold text-xs leading-tight text-right self-end">
              {action.libelle}
            </span>
          </button>
        );
      })}
    </div>
  );
}
