import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef } from 'react';

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
 */

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

/**
 * Monte des animations sur un conteneur, avec le cycle de vie complet.
 *
 * `construire` reçoit le conteneur et ne s'exécute que si le visiteur accepte
 * le mouvement. Tout sélecteur y est scopé au conteneur par `gsap.context`.
 */
export function useAnimations<T extends HTMLElement>(
  construire: (conteneur: T) => void,
): React.RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!ref.current) return;
    const conteneur = ref.current;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const ctx = gsap.context(() => construire(conteneur), conteneur);
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
