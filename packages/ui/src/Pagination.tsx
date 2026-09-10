import { formatMontant } from '@kolek/core';
import { useCallback, useMemo, useState } from 'react';

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

  /**
   * La taille effective, défendue contre une valeur inutilisable.
   *
   * `taille` est un paramètre public, et à zéro `Math.ceil(n / 0)` vaut
   * `Infinity`. Tant que les nombres s'écrivaient bruts, ça donnait « Page 1 sur
   * Infinity » — laid, mais l'écran vivait. Depuis qu'ils passent par
   * `formatMontant`, qui lève sur un nombre non fini, **c'est l'écran entier qui
   * tombe** : sur le téléphone d'un collecteur, au marché, la pire des pannes.
   *
   * Aucun des six appelants ne passe `taille` aujourd'hui. Le paramètre est
   * exporté quand même, et un défaut qui attend le premier qui s'en servira est
   * un défaut.
   *
   * Le repli est `TAILLE_PAGE` et non 1 : ramener à 1 donnerait mille deux cents
   * pages d'une ligne — vivant, mais inutilisable. La valeur par défaut rend un
   * écran dont on peut se servir pendant qu'on cherche l'erreur.
   */
  const parPage = Number.isFinite(taille) && taille >= 1 ? Math.trunc(taille) : TAILLE_PAGE;

  // `Math.max(1, …)` : une liste vide fait quand même une page. Sans ça,
  // « page 1 sur 0 » s'afficherait, et toute division par ce nombre exploserait.
  const pages = Math.max(1, Math.ceil(elements.length / parPage));
  const page = Math.min(Math.max(1, demandee), pages);

  const visibles = useMemo(
    () => elements.slice((page - 1) * parPage, page * parPage),
    [elements, page, parPage],
  );

  /**
   * N'accepte qu'un numéro de page.
   *
   * `setDemandee` était rendu tel quel jusqu'au 2026-09-10, c'est-à-dire un
   * `Dispatch<SetStateAction<number>>` : le type acceptait donc
   * `allerA(p => p + 1)`. Et cet appel-là lirait `demandee`, **la page stockée
   * non bornée**, et non `page`, celle qui est affichée. Après un
   * rétrécissement de liste les deux diffèrent — c'est tout le sujet de ce
   * crochet.
   *
   * La fermeture est **de typage seul** : à l'exécution, React traite toute
   * fonction reçue par un `setState` comme une mise à jour fonctionnelle,
   * enveloppe ou pas. Seul le compilateur ferme la porte, et c'est assez, mais
   * il faut le savoir.
   *
   * `useCallback` parce que `setDemandee` était stable et que cette stabilité
   * voyage jusqu'à la propriété `onAller` du composant : une enveloppe neuve à
   * chaque rendu la coûterait sans rien rendre.
   */
  const allerA = useCallback((numero: number) => setDemandee(numero), []);

  /**
   * Le compte total est rendu ici, et non redemandé à l'appelant.
   *
   * Il l'a été jusqu'au 2026-09-10, et l'auto-audit de la veille a dit pourquoi
   * c'était fragile : le crochet connaît déjà `elements.length`, et un appelant
   * qui paginerait `listeFiltree` en annonçant `collecteurs.length` compilerait,
   * passerait les tests, et afficherait un compte qui ment. Le rendre supprime
   * le deuxième nombre, donc le deuxième nombre à se tromper.
   */
  return { page, pages, total: elements.length, visibles, allerA };
}

/**
 * Les numéros à montrer autour de la page courante.
 *
 * Le premier et le dernier sont toujours là — ce sont les deux sauts les plus
 * fréquents, « revenir au début » et « aller à la fin ». Entre eux, `rayon`
 * pages de part et d’autre de la courante, et `…` pour ce qui est sauté.
 *
 * ## Le trou d’une seule page
 *
 * Une coupure n’est posée que si elle **économise** au moins une page. Sauter
 * un seul numéro afficherait `1 … 3` là où `1 2 3` est plus court **et** montre
 * une page atteignable au lieu de la cacher derrière un signe inerte.
 *
 * ## Pourquoi une fonction plutôt qu’un calcul dans le rendu
 *
 * C’est ici que vivent les décalages d’un rang. Éprouvée seule, une borne
 * fausse se lit en une ligne ; noyée dans le JSX, elle se cherche une heure
 * dans un DOM.
 */
export function fenetrePages(page: number, pages: number, rayon = 2): Array<number | '…'> {
  const numeros = new Set<number>([1, pages]);
  for (let n = page - rayon; n <= page + rayon; n += 1) {
    if (n >= 1 && n <= pages) numeros.add(n);
  }

  const tries = [...numeros].sort((a, b) => a - b);
  const sortie: Array<number | '…'> = [];

  for (let i = 0; i < tries.length; i += 1) {
    const n = tries[i] as number;
    const precedent = tries[i - 1];

    if (precedent !== undefined && n - precedent === 2) sortie.push(precedent + 1);
    else if (precedent !== undefined && n - precedent > 2) sortie.push('…');

    sortie.push(n);
  }

  return sortie;
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
 * Un numéro de page. Même gabarit que les flèches — 44 px, même rayon.
 *
 * ## Pourquoi la page courante change de fond, et non d'opacité
 *
 * Une opacité réduite se confondrait avec l'extinction des flèches, qui dit
 * l'inverse : « on ne peut pas aller là » contre « on y est déjà ». Dans une
 * bande de numéros identiques, c'est le seul repère, et il ne peut pas vouloir
 * dire deux choses.
 *
 * ## Pourquoi deux constantes et non une variante `aria-[current=page]:`
 *
 * Ce dépôt n'utilise aucune variante arbitraire aujourd'hui — la première
 * s'appuierait sur un balayage de classes que rien ici n'éprouve. `Bouton.tsx`
 * choisit déjà ses classes par une table ; le choix se voit alors dans le
 * rendu, et non dans une chaîne que seul Tailwind sait relire.
 */
const NUMERO_BASE =
  'min-w-11 min-h-11 inline-flex items-center justify-center rounded-xl border ' +
  'text-sm font-body tabular-nums transition-colors';

const NUMERO =
  NUMERO_BASE +
  ' border-hairline/80 bg-surface text-ink shadow-xs hover:border-primary cursor-pointer';

const NUMERO_COURANT =
  NUMERO_BASE + ' border-primary bg-primary text-primary-foreground cursor-default';

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
          le tableau a changé hors de son champ.

          Une région vive n'annonce que ce qui bouge **après** son apparition :
          insérée dans le document en même temps que son texte, elle reste
          muette. Ce qui la sauve ici n'est pas d'être montée en permanence —
          le `return null` cinq lignes plus haut l'en empêche — mais d'être
          montée **avant tout changement de page**. Les deux vont ensemble : la
          seule condition qui la retire, une liste d'une seule page, est aussi
          celle où aucun changement n'est possible.

          La phrase disait « montée en permanence » jusqu'au 2026-09-10 ; c'était
          faux, et le résultat juste pour une autre raison que celle écrite. */}
      {/* Les trois nombres passent par `formatMontant`, comme partout ailleurs
          dans le produit — le bandeau de recoupement de l'écran Clients écrit
          « 1 240 clients enregistrés » à quelques pixels d'ici. Sans ça, le même
          nombre s'écrivait de deux façons sur le même écran. Les trois et non le
          seul total : « Page 1240 sur 1 240 » se lirait comme deux nombres
          différents. */}
      {/* Deux présentations, un seul pouvoir. Le sélecteur natif est délibéré :
          la liste du système s'ouvre en plein écran, fait défiler mille pages
          sans effort, tient les 44 px sans qu'on les dessine, reste accessible
          au clavier et au lecteur d'écran, et ne coûte pas un octet de
          JavaScript. Sur un téléphone d'entrée de gamme au soleil d'un marché,
          c'est plus sûr qu'un menu maison.

          `appearance-none` habille le déclencheur aux jetons du produit ; la
          liste, elle, reste celle d'Android, et c'est ce qu'on veut.

          Le libellé de chaque option dit « Page 3 sur 27 » et non « 3 » : le
          déclencheur fermé est tout ce que le collecteur voit tant qu'il n'a
          pas tapé dessus, et « 3 » seul ne dit pas s'il en reste beaucoup. */}
      <select
        aria-label="Aller à la page"
        value={page}
        // `e.target.value` est une chaîne. Sans cette conversion, `'3'` remonte
        // aux six écrans appelants, qui comparent ce numéro à des nombres.
        onChange={(e) => onAller(Number(e.target.value))}
        className={
          'sm:hidden min-h-11 appearance-none rounded-xl border border-hairline/80 ' +
          'bg-surface px-3 text-sm font-body text-ink tabular-nums cursor-pointer'
        }
      >
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            Page {formatMontant(n)} sur {formatMontant(pages)}
          </option>
        ))}
      </select>

      {/* `hidden sm:block` et non un retrait : sous `sm`, le sélecteur ci-dessus
          porte déjà « Page 3 sur 27 », et deux fois la même phrase à trois
          pixels d'écart est du bruit. Mais la région vive reste **montée** —
          c'est elle, et elle seule, qui annonce le changement au lecteur
          d'écran. La retirer rendrait la pagination muette là où elle sert le
          plus. `hidden` masque à l'œil sans retirer du document. */}
      <p
        role="status"
        aria-live="polite"
        className="hidden sm:block text-xs font-body text-muted-foreground"
      >
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
        {/* `hidden sm:flex` : dix numéros à 44 px font 616 px, quand un
            téléphone d'entrée de gamme en offre 360. La bande n'est donc pas
            « masquée pour faire propre » — elle ne rentre pas. Le sélecteur qui
            la remplace en dessous de `sm` est monté juste après.

            Conséquence pour les épreuves : jsdom n'applique pas les requêtes
            média, donc les deux présentations coexistent dans le DOM de test.
            D'où le `aria-label` — c'est par lui, et jamais par un rôle nu,
            qu'une épreuve désigne l'une des deux. */}
        <nav aria-label="Pages" className="hidden sm:flex items-center gap-2">
          {fenetrePages(page, pages).map((n, i) =>
            n === '…' ? (
              // Pas un bouton : une coupure ne mène nulle part, et un bouton
              // inerte apprend au lecteur d'écran à se méfier des autres.
              // `aria-hidden` parce que « points de suspension » lu à voix haute
              // entre deux numéros n'apprend rien.
              <span
                key={`coupure-${i}`}
                aria-hidden="true"
                className="px-1 text-sm font-body text-muted-foreground"
              >
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                // Le libellé porte le numéro brut, le texte le numéro groupé :
                // « Page 1200 » se dicte, « Page 1 200 » se lit.
                aria-label={`Page ${n}`}
                aria-current={n === page ? 'page' : undefined}
                // Même refus que les flèches en bout de course : sans lui,
                // retaper le numéro courant redemanderait la même page — rien
                // ne bougerait, mais la région vive annoncerait un changement.
                onClick={() => {
                  if (n === page) return;
                  onAller(n);
                }}
                className={n === page ? NUMERO_COURANT : NUMERO}
              >
                {formatMontant(n)}
              </button>
            ),
          )}
        </nav>
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
