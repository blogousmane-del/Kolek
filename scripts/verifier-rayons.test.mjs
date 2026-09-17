import { describe, expect, it } from 'vitest';

import { chercherDansLeDepot, chercherRayonsVitrine, sources } from './verifier-rayons.mjs';

/**
 * Le garde-fou du jeu de rayons.
 *
 * Il existe parce que le défaut ne vit dans aucun fichier : un `rounded-2xl`
 * isolé est parfaitement raisonnable à la relecture. Il n'apparaît qu'à
 * l'écran, entre deux blocs voisins qui ne s'arrondissent pas pareil — et
 * jsdom, qui n'a pas de disposition, ne calcule aucun `border-radius`.
 */
describe('un seul jeu de rayons dans les applications', () => {
  it('signale un rayon de vitrine', () => {
    const source = '<div className="bg-surface rounded-2xl p-4" />';

    expect(chercherRayonsVitrine(source, 'exemple.tsx')).toEqual([
      { chemin: 'exemple.tsx', ligne: 1, classe: 'rounded-2xl', cran: '2xl' },
    ]);
  });

  it('accepte les rayons d’application', () => {
    const source = '<div className="rounded-lg" /><div className="rounded-xl" />';

    expect(chercherRayonsVitrine(source, 'exemple.tsx')).toEqual([]);
  });

  it('voit le rayon caché derrière un point de rupture', () => {
    // `lg:rounded-3xl` est la forme que portent les six en-têtes du collecteur.
    // Un contrôle qui ne cherche que la forme nue les manquerait tous.
    const source = '<div className="px-marge lg:rounded-3xl pt-entete" />';

    expect(chercherRayonsVitrine(source, 'a.tsx')).toEqual([
      { chemin: 'a.tsx', ligne: 1, classe: 'lg:rounded-3xl', cran: '3xl' },
    ]);
  });

  it('voit le rayon borné à un côté', () => {
    // La feuille du bas : `rounded-t-2xl` sur téléphone, `sm:rounded-2xl` au
    // centre. Deux formes sur la même ligne, deux signalements.
    const source = '<div className="rounded-t-2xl sm:rounded-2xl" />';

    expect(chercherRayonsVitrine(source, 'a.tsx')).toEqual([
      { chemin: 'a.tsx', ligne: 1, classe: 'rounded-t-2xl', cran: '2xl' },
      { chemin: 'a.tsx', ligne: 1, classe: 'sm:rounded-2xl', cran: '2xl' },
    ]);
  });

  it('ne se signale pas lui-même quand un commentaire cite le cran', () => {
    // Les écrans expliquent parfois leur choix de rayon en marge. Un garde-fou
    // qui crie sur sa propre documentation finit désarmé dans la semaine.
    const source = [
      '/* On passe de rounded-2xl à rounded-lg : voir tokens.ts. */',
      '<div className="rounded-lg" />',
    ].join('\n');

    expect(chercherRayonsVitrine(source, 'a.tsx')).toEqual([]);
  });

  it('donne la ligne, pour qu’on n’ait pas à chercher', () => {
    const source = ['<div>', '  <p className="rounded-2xl" />', '</div>'].join('\n');

    expect(chercherRayonsVitrine(source, 'a.tsx')).toEqual([
      { chemin: 'a.tsx', ligne: 2, classe: 'rounded-2xl', cran: '2xl' },
    ]);
  });

  it('ne confond pas un autre cran avec les deux réservés', () => {
    // `rounded-sm`, `rounded-md`, `rounded-pill` : l'échelle entière passe ici
    // sans rien déclencher, sinon le contrôle interdirait les rayons tout court.
    const source = '<div className="rounded-sm rounded-md rounded-pill rounded-none" />';

    expect(chercherRayonsVitrine(source, 'a.tsx')).toEqual([]);
  });

  it('lit bien quelque chose — sinon il serait vert sur un dépôt vide', () => {
    // Le contrôle du contrôle. Sans lui, une expression rationnelle cassée
    // rendrait le test suivant vert en ne lisant aucun fichier du tout.
    expect(sources().length).toBeGreaterThan(30);
  });

  it('n’exclut pas la vitrine par accident', () => {
    // `apps/site` a le droit aux deux crans, et c'est tout l'objet de la liste
    // d'arbres. Si un chemin de vitrine se retrouvait lu, le dépôt deviendrait
    // rouge pour des rayons parfaitement légitimes.
    expect(sources().some((chemin) => chemin.includes('site'))).toBe(false);
  });

  it('aucun composant d’application ne porte de rayon de vitrine', () => {
    expect(chercherDansLeDepot()).toEqual([]);
  });
});
