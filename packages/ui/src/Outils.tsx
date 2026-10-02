import type { CSSProperties } from 'react';

import { Icone, type NomIcone } from './Icone';

/** Une entrée de la grille d'outils. */
export interface Outil {
  icone: NomIcone;
  libelle: string;
  onActiver?: () => void;
}

/**
 * La grille des outils de l'accueil du collecteur.
 *
 * ## Ce qu'elle remplace
 *
 * Neuf tuiles pastel en quatre familles de couleur (`ActionsRapides`), héritées
 * du gabarit dont l'application est partie. Une tuile colorée se reconnaît
 * avant de se lire ; neuf, c'est un jouet. Ici chaque outil est un bouton
 * neutre, papier et filet, l'icône en vert coffre et le mot en entier : on lit
 * « Rapprochement », et plus « Rapproch. ».
 *
 * ## Ce qui n'y est plus
 *
 * « Encaisser » et « Bilan » : la barre du bas les porte déjà. Deux chemins
 * vers le même écran sur le même écran, c'est un choix de trop.
 *
 * ## Le dernier outil s'étire
 *
 * Sur deux colonnes, un nombre impair d'outils laisse le dernier seul sur sa
 * rangée. Il prend alors toute la rangée : une case vide à sa droite se lirait
 * comme une grille arrêtée en chemin. Sur quatre colonnes (barre latérale), les
 * sept outils d'un collaborateur se rangent quatre puis trois, et le dernier,
 * étiré sur deux, ferme encore la rangée.
 *
 * Le libellé enroule sur deux lignes et n'est jamais coupé. À 320 px (téléphones
 * d'entrée de gamme du marché cible), un outil sur deux colonnes laisse 86 px au
 * libellé ; « Rapprochement » (99,7 px) y est cassé par le navigateur grâce au
 * `hyphens-auto` et à la langue `<html lang="fr">` du collecteur.
 */

export function Outils({ outils, anime = false }: { outils: Outil[]; anime?: boolean }) {
  const impair = outils.length % 2 === 1;

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {outils.map((outil, rang) => {
        const etire = impair && rang === outils.length - 1 ? 'col-span-2' : '';
        return (
          <button
            key={outil.libelle}
            type="button"
            disabled={!outil.onActiver}
            title={outil.onActiver ? undefined : 'À venir'}
            onClick={outil.onActiver}
            style={anime ? ({ '--rang': rang } as CSSProperties) : undefined}
            className={`anim-pression flex min-h-13 items-center gap-2.5 rounded-lg border border-hairline bg-surface px-3 text-left font-body text-sm font-semibold text-ink ${etire} ${
              anime ? 'anim-cascade' : ''
            } ${outil.onActiver ? 'cursor-pointer' : 'cursor-default opacity-60'}`}
          >
            <Icone nom={outil.icone} taille={18} className="shrink-0 text-primary" />
            <span className="min-w-0 break-words hyphens-auto line-clamp-2">{outil.libelle}</span>
          </button>
        );
      })}
    </div>
  );
}
