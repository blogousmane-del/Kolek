import { describe, expect, it } from 'vitest';

import {
  alphaMinimum,
  chercherBlancsFaibles,
  chercherDansLeDepot,
  contrasteBlanc,
  fondLePlusClair,
  sources,
} from './verifier-contraste.mjs';

/**
 * Le garde-fou du blanc translucide.
 *
 * Il existe parce que `text-white/30` se lit très bien sur l'écran de bureau où
 * on l'écrit, et pas du tout sur le téléphone d'un collecteur en plein soleil.
 * 2,63:1 échoue au seuil du texte courant (4,5:1) comme à celui du grand texte
 * (3:1), et rien dans la relecture ne le dit.
 */
describe('blanc atténué sur fond sombre', () => {
  it('compose le blanc sur son fond avant de mesurer', () => {
    // La faute qu'on ne veut pas commettre : comparer le blanc **pur** au fond
    // donne 12:1 pour un texte qui, à 30 %, n'en vaut que 2,4. Le navigateur
    // compose ; la mesure doit composer aussi.
    expect(contrasteBlanc(100, '#14402C')).toBeGreaterThan(9);
    expect(contrasteBlanc(30, '#14402C')).toBeLessThan(3);
  });

  it('prend le plus clair des fonds sombres comme référence', () => {
    // C'est le fond le plus clair qui est le plus exigeant : un blanc qui y
    // tient tient partout ailleurs. Prendre le plus sombre rendrait le contrôle
    // flatteur et faux.
    expect(fondLePlusClair().nom).toBe('primary');
  });

  it('place le plancher à 55 %', () => {
    // Calculé, pas choisi : 50 % vaut 4,20:1 sur `primary`, sous le seuil.
    expect(alphaMinimum()).toBe(55);
    expect(contrasteBlanc(55, '#14402C')).toBeGreaterThanOrEqual(4.5);
    expect(contrasteBlanc(50, '#14402C')).toBeLessThan(4.5);
  });

  it('signale un blanc trop faible', () => {
    const source = '<p className="text-xs uppercase text-white/30">Ma tournée</p>';

    expect(chercherBlancsFaibles(source, 'a.tsx')).toEqual([
      { chemin: 'a.tsx', ligne: 1, classe: 'text-white/30', fond: 'primary', rapport: 2.44 },
    ]);
  });

  it('accepte un blanc au plancher', () => {
    const source = '<p className="text-white/55">Ma tournée</p>';

    expect(chercherBlancsFaibles(source, 'a.tsx')).toEqual([]);
  });

  it('exempte un composant désactivé', () => {
    // WCAG 1.4.3 exclut le texte d'un composant inactif, et pour une bonne
    // raison : remonter un libellé désactivé au seuil du libellé actif le fait
    // cesser de se lire comme désactivé. On échangerait un défaut de contraste
    // contre un défaut de sens.
    const source =
      "className={entree.disponible ? 'text-white/60' : 'text-white/30'}";

    expect(chercherBlancsFaibles(source, 'a.tsx')).toEqual([]);
  });

  it('ne lit pas les commentaires', () => {
    const source = [
      '/* Avant le 2026-09-16, cet intitulé portait text-white/30. */',
      '<p className="text-white/70">Ma tournée</p>',
    ].join('\n');

    expect(chercherBlancsFaibles(source, 'a.tsx')).toEqual([]);
  });

  it('lit bien quelque chose — sinon il serait vert sur un dépôt vide', () => {
    expect(sources().length).toBeGreaterThan(30);
  });

  it('aucun blanc atténué du dépôt ne passe sous le seuil', () => {
    expect(chercherDansLeDepot()).toEqual([]);
  });
});
