import { describe, expect, it } from 'vitest';

import { composer } from '../functions/_shared/message-acces.ts';

/**
 * Les deux courriels d'accès.
 *
 * Un seul invariant vaut d'être tenu par un test plutôt que par la relecture :
 * **le lien est le seul secret qui voyage**. Un mot de passe écrit dans un
 * courriel dort dans une boîte de réception pour toujours, et rien n'oblige à
 * le changer.
 */

const LIEN = 'https://yfnwmokxkznejotgpfgf.supabase.co/auth/v1/verify?token=abc&type=invite';

describe('l’invitation', () => {
  it('porte le lien et le nom', () => {
    const { sujet, corps } = composer({ type: 'invitation', nom: 'Mariam Koné', lien: LIEN });

    expect(sujet.length).toBeGreaterThan(0);
    expect(corps).toContain(LIEN);
    expect(corps).toContain('Mariam Koné');
  });

  it('ne porte le lien qu’une fois', () => {
    // Deux occurrences dans un message texte se lisent comme deux liens
    // différents, et le second clic tombe sur un jeton déjà consommé.
    const { corps } = composer({ type: 'invitation', nom: 'Mariam', lien: LIEN });
    expect(corps.split(LIEN).length - 1).toBe(1);
  });

  it('dit que le lien expire', () => {
    // Sans cette phrase, le prospect qui ouvre son courriel deux jours plus
    // tard croit son compte cassé et appelle GTCS.
    const { corps } = composer({ type: 'invitation', nom: 'Mariam', lien: LIEN });
    expect(corps).toMatch(/heure/i);
  });

  it('ne laisse pas de trou quand le nom est vide', () => {
    // `admin_demande` rend ce que le prospect a saisi ; la validation borne à
    // deux caractères, mais une ligne déposée avant ce lot peut surprendre.
    const { corps } = composer({ type: 'invitation', nom: '', lien: LIEN });
    expect(corps).not.toContain('undefined');
    expect(corps).not.toContain(', ,');
  });
});

describe('la réinitialisation', () => {
  it('porte le lien', () => {
    const { sujet, corps } = composer({ type: 'reinitialisation', lien: LIEN });
    expect(sujet.length).toBeGreaterThan(0);
    expect(corps).toContain(LIEN);
  });

  it('ne nomme personne', () => {
    // Ce message part sur une adresse saisie par quelqu'un qui n'a pas encore
    // prouvé qu'il la possède. Y écrire le nom du titulaire livrerait une
    // information sur le compte à qui a tapé l'adresse au hasard.
    const { corps } = composer({ type: 'reinitialisation', lien: LIEN });
    expect(corps).not.toMatch(/Bonjour\s+\S/);
  });

  it('dit quoi faire si le message n’a pas été demandé', () => {
    const { corps } = composer({ type: 'reinitialisation', lien: LIEN });
    expect(corps).toMatch(/ignore/i);
  });
});

describe('les deux', () => {
  it('n’écrivent jamais le mot « mot de passe » suivi d’une valeur', () => {
    // L'invariant du lot : aucun secret ne voyage par courriel, sauf le lien.
    for (const courriel of [
      composer({ type: 'invitation', nom: 'Mariam', lien: LIEN }),
      composer({ type: 'reinitialisation', lien: LIEN }),
    ]) {
      expect(courriel.corps).not.toMatch(/mot de passe\s*[:=]\s*\S/i);
    }
  });
});
