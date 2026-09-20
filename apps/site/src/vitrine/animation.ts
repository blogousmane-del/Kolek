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
