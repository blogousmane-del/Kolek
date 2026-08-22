import { describe, expect, it } from 'vitest';

import { masquer } from './reglages';

/**
 * Le masquage des clés à l'écran.
 *
 * Une seule fonction pure dans ce module ; le reste parle au réseau. Mais c'est
 * celle qui décide de ce qu'un écran d'administration laisse voir, et un
 * masquage qui n'en est pas un est pire que pas de masquage du tout — il rassure
 * sans protéger.
 *
 * La clé anonyme est publique par construction, donc l'enjeu n'est pas le
 * secret : c'est qu'un administrateur qui partage son écran ou fait une capture
 * ne diffuse pas machinalement une valeur d'identification de projet.
 */

describe('masquer', () => {
  it('garde de quoi reconnaître la clé sans la donner', () => {
    const cle = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.charge.signature';
    const masquee = masquer(cle);

    expect(masquee.startsWith('eyJhbGci')).toBe(true);
    expect(masquee.endsWith('nature')).toBe(true);
    expect(masquee).not.toContain('charge');
  });

  it('ne laisse jamais passer la valeur entière', () => {
    const cle = 'a'.repeat(200);
    expect(masquer(cle)).not.toBe(cle);
    expect(masquer(cle).length).toBeLessThan(cle.length);
  });

  it('masque intégralement une chaîne courte', () => {
    // En dessous de dix-sept caractères, montrer huit caractères de tête et six
    // de queue reviendrait à tout montrer. On masque tout.
    expect(masquer('court')).toBe('•••••');
    expect(masquer('a'.repeat(16))).toBe('•'.repeat(16));
  });

  it('supporte une clé absente sans lever', () => {
    // Variable d'environnement non injectée au build : l'écran doit afficher un
    // vide, pas planter la section entière.
    expect(masquer('')).toBe('');
  });
});
