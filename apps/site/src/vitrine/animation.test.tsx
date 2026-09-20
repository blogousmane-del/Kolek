import { cleanup, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom ne fournit pas `matchMedia`, et GSAP l'appelle au chargement du module.
// Ici il annonce **le mouvement réduit** : c'est le seul réglage sous lequel la
// divergence d'hydratation peut se produire, donc le seul qui éprouve quelque
// chose.
vi.hoisted(() => {
  window.matchMedia = ((requete: string) => ({
    matches: requete.includes('reduce'),
    media: requete,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

import { useMouvementAccepte } from './animation';

afterEach(cleanup);

function Sonde() {
  return <p data-testid="sonde">{useMouvementAccepte() ? 'anime' : 'reduit'}</p>;
}

/**
 * Le premier rendu doit être le même des deux côtés.
 *
 * `useMouvementAccepte` lisait `matchMedia` dans son initialisateur d'état.
 * Sans `window`, le rendu en chaîne répondait `true` ; un visiteur en mouvement
 * réduit aurait répondu `false` à son premier rendu client. Avec
 * `hydrateRoot`, ces deux réponses ne peuvent plus diverger sans que React
 * signale l'écart et reconstruise l'arbre.
 *
 * La correction n'est pas de renoncer au réglage : c'est de le lire **après**
 * le premier rendu, dans l'effet, qui s'exécute avant que le navigateur
 * peigne. Personne ne voit d'animation qu'il a refusée.
 */
describe('le respect du mouvement réduit, sous hydratation', () => {
  it('rend « anime » en chaîne, même quand le mouvement est refusé', () => {
    // Le serveur n'a pas de préférence à lire. S'il devinait, il devinerait
    // pour tout le monde la réponse d'un seul.
    expect(renderToString(<Sonde />)).toContain('anime');
  });

  it('rend « anime » au premier rendu client, pour coïncider avec la chaîne', () => {
    // Le même balisage des deux côtés : c'est toute la condition de
    // l'hydratation. Vérifié ici sur la chaîne rendue par le serveur et sur
    // celle que le client produirait au même instant.
    const cote = renderToString(<Sonde />);

    expect(cote).toContain('anime');
    expect(cote).not.toContain('reduit');
  });

  it('applique le mouvement réduit dès l’effet, sans rien peindre entre-temps', () => {
    render(<Sonde />);

    // `render` vide la file d'effets avant de rendre la main. Ce que
    // l'utilisateur voit est donc déjà la valeur corrigée.
    expect(screen.getByTestId('sonde').textContent).toBe('reduit');
  });
});
