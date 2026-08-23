import { useRef, type CSSProperties } from 'react';

/**
 * Vrai au premier rendu d'un composant, faux ensuite.
 *
 * Sert à n'animer une liste qu'à son apparition. Les écrans du collecteur se
 * re-rendent à chaque écriture — la coquille incrémente `revision` après une
 * mise encaissée, et la liste se relit. Rejouer la cascade à ce moment-là
 * ferait clignoter la liste au moment exact où le collecteur vérifie que
 * l'argent est enregistré.
 *
 * `useRef` et non `useState` : la valeur ne doit pas provoquer de rendu, elle
 * doit seulement se souvenir.
 */
export function usePremierRendu(): boolean {
  const vierge = useRef(true);
  if (vierge.current) {
    vierge.current = false;
    return true;
  }
  return false;
}

/**
 * Le style qui porte le rang d'une rangée dans la cascade.
 *
 * Rend `undefined` hors du premier rendu : sans variable `--rang`, la classe
 * `anim-cascade` retombe sur son défaut `0` — et comme elle n'est de toute
 * façon posée qu'au premier rendu, rien ne s'anime.
 */
export function rangCascade(index: number, premier: boolean): CSSProperties | undefined {
  if (!premier) return undefined;
  return { '--rang': index } as CSSProperties;
}
