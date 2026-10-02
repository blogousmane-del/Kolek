import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef, useState } from 'react';

/**
 * Le socle d'animation de la vitrine.
 *
 * Une seule règle gouverne tout ce fichier : **chaque animation vit dans un
 * `gsap.context()` et meurt dans `ctx.revert()`**. React 19 monte deux fois en
 * StrictMode ; sans le revert, chaque tween existerait en double et les
 * ScrollTriggers s'empileraient à chaque navigation.
 *
 * `prefers-reduced-motion` est respecté via `gsap.matchMedia()` : les visiteurs
 * qui l'ont demandé voient la page finie, sans les entrées. Ce n'est pas une
 * politesse décorative — les animations de défilement sont précisément la
 * catégorie qui déclenche les cinétoses.
 *
 * Et depuis le prérendu, une règle d'écran : **ce que le visiteur a déjà sous
 * les yeux ne s'efface pas pour entrer en scène.** Voir `Etat`.
 */

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

/** L'écran au moment où React reprend la page, tel que `construire` le reçoit. */
export type Etat = {
  /**
   * Le conteneur était déjà à l'écran avant que le JavaScript n'arrive.
   *
   * C'est le cas sur une page prérendue, dont le `#root` porte le
   * `data-prerendu` de `scripts/prerendre.mjs`, pour un conteneur dont le haut
   * est au-dessus du bas de l'écran : le hero toujours, une section quand le
   * visiteur arrive par une ancre (`kolek.cash/#tarifs`) ou a défilé avant le
   * JavaScript.
   *
   * Le visiteur l'a alors sous les yeux, et une entrée qui part d'une opacité
   * nulle la lui retire pour la refaire apparaître. Mesuré le 2026-10-02 sur
   * l'aperçu de la PR #19, sur un réseau 4G médiocre : le titre du hero peint
   * à 4,7 s, React reprend la page à 5,8 s, le titre retombe à 10 % d'opacité
   * et ne revient qu'à 6,7 s.
   *
   * Une entrée se garde donc de ce cas. Un mouvement qui ne cache rien, un
   * reflet, une parallaxe, une boucle, n'a pas à s'en soucier.
   */
  dejaPeint: boolean;
};

/**
 * Le haut du conteneur est au-dessus du bas de l'écran : le visiteur le voit,
 * ou l'a déjà dépassé. Sans prérendu, rien n'était peint : l'écran d'attente
 * occupait la page jusqu'à React.
 */
function estDejaPeint(conteneur: HTMLElement): boolean {
  if (!conteneur.closest('[data-prerendu]')) return false;
  return conteneur.getBoundingClientRect().top < window.innerHeight;
}

/**
 * Monte des animations sur un conteneur, avec le cycle de vie complet.
 *
 * `construire` reçoit le conteneur et ne s'exécute que si le visiteur accepte
 * le mouvement. Tout sélecteur y est scopé au conteneur par `gsap.context`. Il
 * reçoit aussi l'`Etat` de l'écran au moment où React a repris la page.
 */
export function useAnimations<T extends HTMLElement>(
  construire: (conteneur: T, etat: Etat) => void,
): React.RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!ref.current) return;
    const conteneur = ref.current;
    // Mesuré une fois, au montage : c'est l'écran que le visiteur avait sous les
    // yeux quand React est arrivé qui compte, pas celui d'après.
    const etat: Etat = { dejaPeint: estDejaPeint(conteneur) };

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const ctx = gsap.context(() => construire(conteneur, etat), conteneur);
      return () => ctx.revert();
    });

    return () => mm.revert();
    // `construire` est déclaré en ligne par chaque section : le surveiller
    // remonterait les animations à chaque rendu. Le montage est le seul moment
    // qui compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}

/**
 * Le visiteur accepte-t-il le mouvement ?
 *
 * `useAnimations` pose déjà la question à GSAP, mais les artefacts animés de la
 * section Produit tournent sur `setInterval`, hors de GSAP. Ils l'ignoraient
 * donc — dont un à 34 ms, en continu, y compris hors écran. Sur un téléphone
 * d'entrée de gamme c'est de la batterie brûlée pour une animation que le
 * visiteur a explicitement demandé de ne pas voir.
 *
 * La préférence est **suivie**, pas lue une fois : elle se change sans
 * recharger la page, et un composant qui ne l'écoute qu'au montage rate le
 * changement.
 */
export function useMouvementAccepte(): boolean {
  /*
    Toujours `true` au premier rendu, et la préférence lue seulement ensuite.

    Ce n'est pas un renoncement au réglage, c'est ce que l'hydratation exige.
    Depuis que `scripts/prerendre.mjs` écrit ces pages dans le HTML servi,
    `main.tsx` les hydrate au lieu de les reconstruire — et hydrater veut dire
    que le premier rendu client doit produire exactement ce que le serveur a
    produit. Le serveur, lui, n'a aucune préférence à lire : il rend une page
    pour tout le monde. Lire `matchMedia` avant le premier rendu ferait donc
    diverger tout visiteur en mouvement réduit, et React reconstruirait
    l'arbre entier au lieu de l'hydrater.

    L'effet ci-dessous s'exécute avant que le navigateur peigne. Personne ne
    voit d'animation qu'il a refusée ; c'est éprouvé dans `animation.test.tsx`.
  */
  const [accepte, setAccepte] = useState(true);

  useEffect(() => {
    if (!window.matchMedia) return;
    const requete = window.matchMedia('(prefers-reduced-motion: reduce)');
    const suivre = () => setAccepte(!requete.matches);
    // Au montage aussi, et pas seulement au changement : l'état part d'un
    // `true` qui est une convention d'hydratation, pas une mesure.
    suivre();
    requete.addEventListener('change', suivre);
    return () => requete.removeEventListener('change', suivre);
  }, []);

  return accepte;
}

/** L'entrée standard de la vitrine : fade-up pondéré, décalé. */
export function entree(cibles: gsap.TweenTarget, options: gsap.TweenVars = {}) {
  return gsap.from(cibles, {
    y: 40,
    opacity: 0,
    duration: 1,
    ease: 'power3.out',
    stagger: 0.08,
    ...options,
  });
}
