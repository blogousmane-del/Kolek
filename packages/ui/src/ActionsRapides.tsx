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
 * ## Les fonds viennent d'un jeu dédié, et c'est une correction
 *
 * La première version empruntait les **teintes d'alerte** — `positiveTint`,
 * `secondary`, `ardoiseTint`, `ocreTint`. Elles sont faites pour porter un
 * message par-dessus, pas pour être vues les unes à côté des autres : sur
 * l'épreuve d'écran, les quatre familles se lisaient comme trois, parce que
 * `positiveTint` et `secondary` ne diffèrent que de sept unités sur un canal.
 * *Encaisser* avait donc la couleur de *Souscrire*, et une famille qu'on ne
 * distingue pas ne classe rien.
 *
 * Les jetons `tuile*` de `packages/core/src/tokens.ts` sont franchement séparés
 * en teinte et voisins en luminance, et deux épreuves tiennent ces deux
 * conditions ensemble.
 */
const FAMILLES: Record<FamilleAction, string> = {
  argent: 'bg-tuile-argent text-tuile-argent-encre',
  client: 'bg-tuile-client text-tuile-client-encre',
  analyse: 'bg-tuile-analyse text-tuile-analyse-encre',
  gestion: 'bg-tuile-gestion text-tuile-gestion-encre',
};

/**
 * Ce que la dernière tuile occupe quand la rangée n'est pas pleine.
 *
 * Dix actions dans trois colonnes laissent *Plus* seule, avec deux cases vides
 * à sa droite : sur l'épreuve d'écran du 2026-09-17, ça se lit comme une grille
 * qui s'est arrêtée en chemin, pas comme une intention. La dernière tuile prend
 * donc la place qui reste sur sa rangée.
 *
 * Seulement sur téléphone : à cinq colonnes, dix actions font deux rangées
 * pleines, et l'étirement n'aurait plus rien à rattraper. Les classes sont
 * écrites en toutes lettres parce que Tailwind lit la source, et qu'une classe
 * assemblée à l'exécution n'existerait dans aucune feuille de style.
 */
const RESTE_DE_RANGEE: Record<number, string> = {
  1: 'col-span-3 sm:col-span-1',
  2: 'col-span-2 sm:col-span-1',
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
  const colonnes = compact ? 2 : 3;
  const reste = actions.length % colonnes;

  return (
    <div
      className={`grid gap-2 xs:gap-2.5 ${
        compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3 sm:grid-cols-5'
      }`}
    >
      {actions.map((action, rang) => {
        const teintes = FAMILLES[action.famille ?? 'gestion'];
        const derniere = rang === actions.length - 1;
        const etirement = derniere ? (RESTE_DE_RANGEE[reste] ?? '') : '';

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

              Hauteur fixe plutôt que proportion : une tuile étirée sur la fin
              d'une rangée garde alors exactement la hauteur de ses voisines,
              alors qu'un `aspect-ratio` la ferait grandir avec sa largeur. Les
              128 px de bureau viennent de l'épreuve du 2026-09-17, où les
              tuiles à 96 px se lisaient comme des bandeaux.
            */
            className={`anim-pression flex flex-col justify-between rounded-lg text-left ${teintes} ${etirement} ${
              compact ? 'h-20 p-2.5' : 'h-24 sm:h-32 p-3'
            } ${anime ? 'anim-cascade' : ''} ${
              action.onActiver ? 'cursor-pointer' : 'opacity-60 cursor-default'
            }`}
          >
            <Icone nom={action.icone} taille={compact ? 20 : 26} />
            <span className="font-body font-semibold text-xs leading-tight text-right self-end">
              {action.libelle}
            </span>
          </button>
        );
      })}
    </div>
  );
}
