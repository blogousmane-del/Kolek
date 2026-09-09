import { describe, expect, it } from 'vitest';
import { couleursDuManifeste, reproches } from './verifier-manifeste.mjs';

/**
 * Le manifeste PWA a porté `background_color: '#FBFAF6'` jusqu'au 2026-09-09.
 * `#FBFAF6` était le jeton `paper`, supprimé de `tokens.ts` le 2026-09-04 :
 * l'écran de démarrage de l'application installée est donc resté cinq jours la
 * dernière surface du produit peinte dans une couleur que le Design System ne
 * connaissait plus.
 *
 * Ce qui l'a rendu invisible n'est pas sa taille, c'est son lieu. La couleur ne
 * vit dans aucune feuille de style : elle est recopiée dans `vite.config.ts` et
 * ne réapparaît que dans un artefact engendré, que personne ne relit. Les
 * autres couleurs en dur du dépôt se voient au moins dans le fichier qu'on
 * modifie.
 *
 * ## Extraire puis comparer, et non chercher une présence
 *
 * Le 🟠 n°1 du même audit a appris ceci : un contrôle qui **cherche** un motif
 * dans une source passe au vert sur le défaut même qu'il doit voir — l'import
 * de `gardeEnv` était bien là, c'est le greffon qui manquait. On ne cherche donc
 * pas ici si la bonne couleur est présente. On extrait la valeur écrite,
 * quelle qu'elle soit, et on la compare au jeton.
 */
describe('couleursDuManifeste', () => {
  it('extrait les deux couleurs, quelles qu’elles soient', () => {
    const source = `
      manifest: {
        display: 'standalone',
        background_color: '#FBFAF6',
        theme_color: '#14402C',
      },
    `;

    expect(couleursDuManifeste(source)).toEqual({
      background_color: '#FBFAF6',
      theme_color: '#14402C',
    });
  });

  it('accepte les guillemets doubles', () => {
    expect(couleursDuManifeste('background_color: "#ABCDEF",')).toEqual({
      background_color: '#ABCDEF',
      theme_color: null,
    });
  });

  it('rend null pour une couleur absente', () => {
    expect(couleursDuManifeste('rien ici')).toEqual({
      background_color: null,
      theme_color: null,
    });
  });
});

describe('reproches', () => {
  const jetons = { canvas: '#F4F5F2', primary: '#14402C' };

  it('ne dit rien quand les deux suivent leurs jetons', () => {
    const trouvees = { background_color: '#F4F5F2', theme_color: '#14402C' };

    expect(reproches(trouvees, jetons)).toEqual([]);
  });

  it('signale une couleur qui a dérivé, et nomme les deux valeurs', () => {
    const trouvees = { background_color: '#FBFAF6', theme_color: '#14402C' };
    const trouves = reproches(trouvees, jetons);

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('#FBFAF6');
    expect(trouves[0]).toContain('#F4F5F2');
  });

  it('compare sans tenir compte de la casse', () => {
    // `tokens.ts` écrit en majuscules ; rien n'oblige le manifeste à suivre.
    const trouvees = { background_color: '#f4f5f2', theme_color: '#14402c' };

    expect(reproches(trouvees, jetons)).toEqual([]);
  });

  it('signale une couleur absente du manifeste', () => {
    const trouves = reproches({ background_color: null, theme_color: '#14402C' }, jetons);

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('background_color');
  });
});
