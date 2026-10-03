import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Bouton } from './Bouton';

afterEach(cleanup);

describe('Bouton', () => {
  it('prend le nom accessible qu’on lui donne', () => {
    render(
      <Bouton nomAccessible="Encaisser 2 000 FCFA sur la carte de Mariam">Encaisser 2 000</Bouton>,
    );
    const bouton = screen.getByRole('button');
    expect(bouton.getAttribute('aria-label')).toBe('Encaisser 2 000 FCFA sur la carte de Mariam');
    expect(bouton.textContent).toBe('Encaisser 2 000');
    expect(
      screen.getByRole('button', { name: 'Encaisser 2 000 FCFA sur la carte de Mariam' }),
    ).toBeTruthy();
  });

  it('garde son libellé pour nom quand on ne lui en donne pas', () => {
    render(<Bouton>Fiche</Bouton>);
    expect(screen.getByRole('button', { name: 'Fiche' }).hasAttribute('aria-label')).toBe(false);
  });

  it('se laisse décrire par la phrase qui dit pourquoi il est éteint', () => {
    render(
      <>
        <p id="pourquoi">Gardée sur ce téléphone, elle partira avec le réseau.</p>
        <Bouton disabled decritPar="pourquoi">
          Reçu
        </Bouton>
      </>,
    );
    const bouton = screen.getByRole('button', { name: 'Reçu' }) as HTMLButtonElement;
    // Le nom reste le libellé : la description s'ajoute, elle ne le remplace pas.
    expect(bouton.disabled).toBe(true);
    const description = document.getElementById(bouton.getAttribute('aria-describedby') ?? '');
    expect(description?.textContent).toBe('Gardée sur ce téléphone, elle partira avec le réseau.');
  });

  it('ne pose pas de description quand on ne lui en donne pas', () => {
    render(<Bouton>Fiche</Bouton>);
    expect(screen.getByRole('button', { name: 'Fiche' }).hasAttribute('aria-describedby')).toBe(
      false,
    );
  });

  it('grandit sans que deux hauteurs se disputent la classe', () => {
    render(<Bouton grand>Encaisser</Bouton>);
    const classes = screen.getByRole('button', { name: 'Encaisser' }).className;
    expect(classes).toContain('min-h-14');
    expect(classes).toContain('text-lg');
    expect(classes).not.toContain('min-h-11');
    expect(classes).not.toContain('text-base');
  });

  it('garde sa taille par défaut sans la propriété grand', () => {
    render(<Bouton>Fiche</Bouton>);
    const classes = screen.getByRole('button', { name: 'Fiche' }).className;
    expect(classes).toContain('min-h-11');
    expect(classes).toContain('text-base');
    expect(classes).not.toContain('min-h-14');
    expect(classes).not.toContain('text-lg');
  });

  it('dit s’il commande un panneau replié ou déplié', () => {
    const { rerender } = render(<Bouton deplie={false}>Détail</Bouton>);
    const bouton = screen.getByRole('button', { name: 'Détail' });
    expect(bouton.getAttribute('aria-expanded')).toBe('false');

    rerender(<Bouton deplie>Détail</Bouton>);
    expect(bouton.getAttribute('aria-expanded')).toBe('true');
  });

  it('désigne le panneau qu’il commande', () => {
    render(
      <>
        <Bouton deplie panneau="detail">
          Détail
        </Bouton>
        <div id="detail">Le détail.</div>
      </>,
    );
    const bouton = screen.getByRole('button', { name: 'Détail' });
    const panneau = document.getElementById(bouton.getAttribute('aria-controls') ?? '');
    expect(panneau?.textContent).toBe('Le détail.');
  });

  it('n’annonce ni état ni panneau quand on ne lui en donne pas', () => {
    render(<Bouton>Fiche</Bouton>);
    const bouton = screen.getByRole('button', { name: 'Fiche' });
    // Un bouton ordinaire ne se dit pas « replié » : l'état n'a de sens que pour
    // celui qui ouvre quelque chose.
    expect(bouton.hasAttribute('aria-expanded')).toBe(false);
    expect(bouton.hasAttribute('aria-controls')).toBe(false);
  });
});
