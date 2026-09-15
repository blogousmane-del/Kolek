import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BandeauHorsLigne, messageFile } from './Bandeaux';

// `globals` n'est pas activé dans ce paquet : sans cet appel, chaque rendu
// s'ajoute au précédent.
afterEach(cleanup);

const VIDE = { mises: 0, clients: 0, cartes: 0, caisses: 0 };

describe('ce que le bandeau dit de la file (spec J2b §8.1)', () => {
  it('se tait en ligne quand rien n’attend', () => {
    expect(messageFile(true, VIDE)).toBeNull();
    expect(messageFile(true, null)).toBeNull();
  });

  it('compte ce qui reste à envoyer, en ligne', () => {
    expect(messageFile(true, { ...VIDE, mises: 2 })).toBe('Envoi en cours · 2 restantes');
    expect(messageFile(true, { ...VIDE, caisses: 1 })).toBe('Envoi en cours · 1 restante');
  });

  it('énumère la file hors ligne, comme la spec l’écrit', () => {
    expect(messageFile(false, { ...VIDE, mises: 3, clients: 1 })).toBe(
      'Hors ligne · 3 mises et 1 client en attente d’envoi',
    );
    expect(messageFile(false, { mises: 1, clients: 2, cartes: 1, caisses: 1 })).toBe(
      'Hors ligne · 1 mise, 2 clients, 1 carte et 1 déclaration de caisse en attente d’envoi',
    );
  });

  it('ne dit « rien en attente » que s’il a pu compter', () => {
    expect(messageFile(false, VIDE)).toBe('Hors ligne · rien en attente d’envoi');
    expect(messageFile(false, null)).toBe('Hors ligne');
  });

  it('ne promet plus jamais une synchronisation (écart 3)', () => {
    for (const compte of [null, VIDE, { ...VIDE, mises: 1 }]) {
      for (const enLigne of [true, false]) {
        expect(messageFile(enLigne, compte) ?? '').not.toMatch(/synchronis/);
      }
    }
  });

  it('ne rend rien quand il n’a rien à dire', () => {
    const { container } = render(<BandeauHorsLigne enLigne compte={VIDE} />);
    expect(container.innerHTML).toBe('');
  });

  it('rend la phrase quand il a quelque chose à dire', () => {
    render(<BandeauHorsLigne enLigne={false} compte={{ ...VIDE, mises: 1 }} />);
    expect(screen.getByText('Hors ligne · 1 mise en attente d’envoi')).toBeTruthy();
  });
});
