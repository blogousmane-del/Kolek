import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Champ } from './Champ';

/**
 * Ce que le champ fait de l'anneau de focus.
 *
 * Il posait `outline-none` puis rendait le focus par une bordure de 1,5 px qui
 * change de couleur. Pour qui navigue au clavier, c'est trop peu : rien ne dit
 * franchement où l'on est. Et supprimer l'anneau sans le remplacer est l'un des
 * deux contre-exemples nommés du référentiel d'accessibilité.
 *
 * L'anneau vit désormais dans `packages/core/src/base.css`, sur
 * `:focus-visible`, en deux couches — blanche à l'intérieur, vert coffre à
 * l'extérieur — pour rester visible sur fond clair comme sur la barre latérale
 * sombre. Un seul propriétaire : les composants n'ont plus à s'en occuper, et
 * surtout plus le droit de l'éteindre.
 */

afterEach(cleanup);

describe('Champ', () => {
  it('n’éteint pas l’anneau de focus', () => {
    render(<Champ libelle="Nom" valeur="" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Nom').className).not.toContain('outline-none');
  });

  it('n’éteint pas non plus l’anneau sur fond sombre', () => {
    // La variante sombre sert les deux écrans de connexion — les seuls endroits
    // où l'on saisit un mot de passe.
    render(<Champ libelle="Mot de passe" type="password" valeur="" onChange={vi.fn()} sombre />);

    expect(screen.getByLabelText('Mot de passe').className).not.toContain('outline-none');
  });

  it('ouvre le clavier demandé', () => {
    // Posé pour `ChampTelephone`, qui délègue ici sa partie numéro plutôt que
    // de recopier les classes du champ. Sans ce passage, le collecteur saisit
    // un numéro sur un clavier alphabétique.
    render(<Champ libelle="Numéro" valeur="" onChange={vi.fn()} inputMode="numeric" />);

    expect(screen.getByLabelText('Numéro')).toHaveProperty('inputMode', 'numeric');
  });

  it('garde la cible de saisie à 44 px', () => {
    render(<Champ libelle="Téléphone" valeur="" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Téléphone').className).toMatch(/\bmin-h-11\b/);
  });
});
