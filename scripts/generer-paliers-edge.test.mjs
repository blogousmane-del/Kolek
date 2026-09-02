import { describe, expect, it } from 'vitest';

import { contenuAttendu, correspond, estAJour } from './generer-paliers-edge.mjs';

/**
 * La grille tarifaire des Edge Functions ne doit pas diverger de sa source.
 *
 * Ce contrôle existait en commande (`npm run verifier:paliers`), pas en test.
 * La différence s'est vue le 2026-09-02 : sur une copie fraîchement sortie de
 * git, `core.autocrlf` rend le fichier engendré en CRLF alors que le générateur
 * le compose en LF, et la commande annonçait une divergence de prix qui
 * n'existait pas. Une comparaison d'octets sur du texte engendré est une fausse
 * alerte qui attend son tour ; celle-ci tombait sur la seule chose que
 * `paliers.ts` interdit de laisser diverger.
 */

describe('génération de la grille tarifaire des Edge Functions', () => {
  it('le _shared/paliers.ts versionné correspond à packages/core', () => {
    expect(estAJour()).toBe(true);
  });

  it('ne se laisse pas troubler par des fins de ligne Windows', () => {
    // Le contenu attendu, rendu en CRLF comme git le pose sur cette machine.
    //
    // C'est `correspond` qu'on interroge, et non deux chaînes fabriquées sur
    // place : le premier jet de ce test comparait `texte.replace(...)` à
    // lui-même et passait aussi bien avec le défaut que sans lui. Un filet qui
    // ne se lève sur rien est pire que pas de filet — il rassure.
    expect(correspond(contenuAttendu().replace(/\n/g, '\r\n'))).toBe(true);
  });

  it('voit une vraie divergence de prix', () => {
    // L'autre moitié du filet : normaliser les fins de ligne ne doit pas
    // revenir à tout accepter.
    expect(correspond(contenuAttendu().replace('prix: ', 'prix: 1 + '))).toBe(false);
  });

  it('emporte les collaborateurs inclus, qui sont une règle et non un libellé', () => {
    // `collecteur-creer-collaborateur` lit ce nombre pour décider s'il reste une
    // place dans l'équipe. S'il ne traversait pas, la fonction bornerait sur une
    // valeur absente.
    expect(contenuAttendu()).toMatch(/cle: 'illimite'.*collaborateursInclus: 3/);
  });
});
