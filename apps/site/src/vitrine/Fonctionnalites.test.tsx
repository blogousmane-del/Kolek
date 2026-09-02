import { cleanup, render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Fonctionnalites } from './Fonctionnalites';

// GSAP enregistre ScrollTrigger au chargement du module, et ScrollTrigger appelle
// `matchMedia`, que jsdom ne fournit pas. Même remède que dans
// `Inscription.test.tsx` : on remplace le module d'animation. Ici il ne sert
// qu'à répondre à `prefers-reduced-motion`, et c'est justement le réglage qu'on
// veut piloter.
const reglage = vi.hoisted(() => ({ mouvementAccepte: true }));
vi.mock('./animation', () => ({
  useMouvementAccepte: () => reglage.mouvementAccepte,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Le conteneur que l'effet remplit — jamais React. Voir `MachineTelemetrie`. */
function zoneDuJournal(): HTMLElement {
  return document.querySelector('.overflow-hidden.font-mono > div') as HTMLElement;
}

/**
 * La machine à écrire tapait dans l'état React : `setCourante` toutes les 34 ms,
 * soit une trentaine de rendus complets par seconde en continu, sur le téléphone
 * d'entrée de gamme qui est la cible déclarée du produit. Depuis le 2026-09-02
 * elle écrit dans le DOM. Ces tests tiennent les deux bouts : le rendu visible
 * n'a pas changé, et le contenu reste entier quand le mouvement est refusé.
 */
describe('la machine à écrire', () => {
  it('montre le journal fini quand le mouvement est refusé', () => {
    // La règle de toute la vitrine : on retire l'animation, jamais le contenu.
    reglage.mouvementAccepte = false;
    render(<Fonctionnalites />);

    // `getByText` normalise les espaces ; ces lignes sont alignées par des
    // suites d'espaces, qui sont précisément ce qu'on veut voir intact.
    const rendu = document.body.textContent ?? '';
    expect(rendu).toContain('18:32  écart  0 F  ✓ juste');
    expect(rendu).toContain('18:32  déclaré  12 500 F');
  });

  it('tape la première ligne caractère par caractère', () => {
    reglage.mouvementAccepte = true;
    vi.useFakeTimers();
    render(<Fonctionnalites />);

    // 34 ms par caractère : à dix caractères, le début est là et la fin non.
    act(() => void vi.advanceTimersByTime(34 * 10));
    const partiel = document.body.textContent ?? '';
    expect(partiel).toContain('18:02');
    expect(partiel).not.toContain('#7F3A');

    // La ligne entière fait 29 caractères ; au trente-cinquième pas, elle est
    // passée au journal.
    act(() => void vi.advanceTimersByTime(34 * 25));
    expect(zoneDuJournal().textContent).toContain('18:02  mise      500 F  #7F3A');
  });

  it('ne garde que les cinq dernières lignes à l’écran', () => {
    // La fenêtre du journal : au-delà, les lignes sortent par le haut. Le journal
    // compte six lignes, donc les taper toutes déborde d'une.
    reglage.mouvementAccepte = true;
    vi.useFakeTimers();
    render(<Fonctionnalites />);

    act(() => void vi.advanceTimersByTime(34 * 200));

    expect(zoneDuJournal().childElementCount).toBeLessThanOrEqual(5);
    expect(zoneDuJournal().childElementCount).toBeGreaterThan(0);
  });
});
