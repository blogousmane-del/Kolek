import { formatMontant } from '@kolek/core';
import { useMemo, useState } from 'react';

import { Icone } from './Icone';

/**
 * La pagination d'affichage, partagée par le collecteur et l'admin.
 *
 * ## Ce qu'elle est, et ce qu'elle n'est pas
 *
 * Elle découpe une liste **déjà chargée**. Elle ne va rien chercher au serveur.
 *
 * C'est le choix retenu le 2026-09-09, et il découle du produit : le collecteur
 * travaille hors ligne, et sa recherche filtre le tableau qu'il a en main. Une
 * pagination qui demanderait une page au serveur irait chercher ce que le
 * collecteur n'a pas — c'est-à-dire rien, dans un marché sans réseau. Les
 * lignes sont donc toutes chargées (voir `apps/collecteur/src/pagination.ts`),
 * et seule leur **restitution** est découpée.
 *
 * Ce que ça gagne : mille deux cents clients ne font plus mille deux cents
 * lignes dans le DOM sur un téléphone d'entrée de gamme.
 *
 * Ce que ça ne gagne pas, et qu'il ne faut pas croire : aucun octet de réseau.
 * Le coût du chargement est le même. C'est le rendu qui s'allège.
 */

/**
 * Cinquante lignes par page.
 *
 * Même valeur que le journal du Super Admin, qui paginait déjà seul depuis le
 * 2026-08-30. Deux tailles différentes dans le même produit se justifieraient
 * mal, et celle-là a déjà été éprouvée à l'usage.
 */
export const TAILLE_PAGE = 50;

/**
 * Découpe `elements` en pages.
 *
 * ## Pourquoi la page n'est jamais stockée hors bornes
 *
 * Le piège qui a dicté le dessin : on est page 5, on tape une recherche, il ne
 * reste que trois résultats. Garder la page courante afficherait un écran
 * **vide** — et le collecteur en conclurait qu'il n'a rien trouvé, alors que les
 * trois résultats sont là, une page plus loin en arrière.
 *
 * La page demandée est donc conservée telle quelle, mais **ramenée dans la
 * plage** à chaque rendu, à partir du nombre d'éléments effectivement reçus.
 * Rien à synchroniser, aucun `useEffect` : le nombre de pages est dérivé, donc
 * il ne peut pas être en retard d'un rendu sur la liste.
 */
export function usePagination<T>(elements: T[], taille: number = TAILLE_PAGE) {
  const [demandee, setDemandee] = useState(1);

  // `Math.max(1, …)` : une liste vide fait quand même une page. Sans ça,
  // « page 1 sur 0 » s'afficherait, et toute division par ce nombre exploserait.
  const pages = Math.max(1, Math.ceil(elements.length / taille));
  const page = Math.min(Math.max(1, demandee), pages);

  const visibles = useMemo(
    () => elements.slice((page - 1) * taille, page * taille),
    [elements, page, taille],
  );

  return { page, pages, visibles, allerA: setDemandee };
}

/**
 * Le style d'une flèche, éteinte comprise.
 *
 * Les variantes portent sur `aria-disabled` et non sur `:disabled` — voir la
 * note du composant sur pourquoi ces boutons ne sont jamais vraiment
 * désactivés. À l'œil, rien ne change : même opacité, même curseur, même
 * neutralisation du survol.
 */
const FLECHE =
  'min-w-11 min-h-11 inline-flex items-center justify-center rounded-xl border border-hairline/80 ' +
  'bg-surface text-ink shadow-xs transition-colors hover:border-primary cursor-pointer ' +
  'aria-disabled:opacity-40 aria-disabled:cursor-default aria-disabled:hover:border-hairline/80';

/**
 * Les commandes de page.
 *
 * Rend `null` quand tout tient sur une page : deux flèches inertes sous une
 * liste de six lignes sont du bruit, et le collecteur apprendrait à ne plus les
 * regarder.
 *
 * ## Pourquoi les flèches ne sont jamais vraiment `disabled`
 *
 * Elles l'ont été, le 2026-09-09, et l'auto-audit du même jour a relevé ce que
 * ça coûte : **dans un vrai navigateur, un élément qui reçoit `disabled` alors
 * qu'il a le focus perd le focus**, et celui-ci retombe sur `<body>`.
 *
 * Le geste est banal — on tabule jusqu'à « Suivante », on appuie sur Entrée
 * plusieurs fois de suite pour descendre la liste. Au dernier appui, le bouton
 * s'éteint sous le doigt : l'utilisateur au clavier se retrouve au début du
 * document, et celui au lecteur d'écran perd sa place dans le tableau qu'il
 * était en train de parcourir.
 *
 * `aria-disabled` dit l'indisponibilité au lecteur d'écran sans retirer
 * l'élément de l'ordre de tabulation. Le focus ne bouge donc pas. En
 * contrepartie le navigateur ne bloque plus le clic, et c'est au gestionnaire
 * de refuser — d'où le `if` dans chaque `onClick`.
 *
 * **Ce défaut est invisible à la suite de tests** : `jsdom` ne modélise pas la
 * perte de focus sur `disabled`. Les tests gardent donc le moyen —
 * `aria-disabled` plutôt que `disabled` — faute de pouvoir garder la fin.
 */
export function Pagination({
  page,
  pages,
  total,
  onAller,
}: {
  page: number;
  pages: number;
  /** Le nombre total de lignes, pages confondues. Dit à l'écran. */
  total: number;
  onAller: (page: number) => void;
}) {
  if (pages <= 1) return null;

  const auDebut = page <= 1;
  const aLaFin = page >= pages;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      {/* `role="status"` et non un simple texte : sans région vive, un
          utilisateur au lecteur d'écran clique « Suivante » et n'entend rien —
          le tableau a changé hors de son champ. La région est montée en
          permanence, sinon le premier changement passe inaperçu : une région
          vive n'annonce que ce qui bouge **après** son apparition. */}
      {/* Les trois nombres passent par `formatMontant`, comme partout ailleurs
          dans le produit — le bandeau de recoupement de l'écran Clients écrit
          « 1 240 clients enregistrés » à quelques pixels d'ici. Sans ça, le même
          nombre s'écrivait de deux façons sur le même écran. Les trois et non le
          seul total : « Page 1240 sur 1 240 » se lirait comme deux nombres
          différents. */}
      <p role="status" aria-live="polite" className="text-xs font-body text-muted-foreground">
        Page {formatMontant(page)} sur {formatMontant(pages)} — {formatMontant(total)} au total
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Page précédente"
          aria-disabled={auDebut}
          // Le navigateur ne bloque plus le clic : c'est ici que le geste se
          // refuse. Sans ce `return`, cliquer à la page 1 demanderait la page 0
          // — que le crochet ramènerait à 1, donc rien de visible à l'écran,
          // mais la région vive annoncerait un changement qui n'a pas eu lieu.
          onClick={() => {
            if (auDebut) return;
            onAller(page - 1);
          }}
          className={FLECHE}
        >
          <Icone nom="chevron-left" taille={18} />
        </button>
        <button
          type="button"
          aria-label="Page suivante"
          aria-disabled={aLaFin}
          onClick={() => {
            if (aLaFin) return;
            onAller(page + 1);
          }}
          className={FLECHE}
        >
          <Icone nom="chevron-right" taille={18} />
        </button>
      </div>
    </div>
  );
}
