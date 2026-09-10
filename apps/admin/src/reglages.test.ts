import { describe, expect, it } from 'vitest';

import { masquer, messageDeRefus } from './reglages';

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

/**
 * La traduction des refus de GoTrue, côté administration.
 *
 * La retombée du module renvoyait le message anglais **tel quel** — un choix
 * assumé et écrit : « un refus qu’on ne comprend pas conduit à réessayer la
 * même chose ». Il tenait tant que les refus non traduits étaient rares et
 * sans remède.
 *
 * Ce n’est plus vrai. Mesuré le 2026-09-10 sur la pile locale, qui porte déjà
 * `secure_password_change = true` : passé **24 heures** de session, GoTrue rend
 * `400 — Password update requires reauthentication`. 23 h passe, 25 h non.
 *
 * Un administrateur connecté depuis la veille lisait donc une phrase anglaise
 * sans savoir qu’il lui suffit de se reconnecter — remède mesuré, une session
 * fraîche passe.
 */
describe('messageDeRefus', () => {
  it('dit quoi faire devant un refus de réauthentification', () => {
    const message = messageDeRefus('Password update requires reauthentication');

    expect(message).toMatch(/reconnect/i);
    expect(message).not.toContain('reauthentication');
  });

  it('nomme la fuite connue', () => {
    expect(messageDeRefus('This password has been pwned')).toMatch(/fuites de données/i);
  });

  it('nomme la longueur', () => {
    expect(messageDeRefus('Password should be at least 10 characters')).toMatch(/trop court/i);
  });

  it('nomme le mot de passe inchangé', () => {
    expect(messageDeRefus('New password should be different from the old password')).toMatch(
      /déjà ton mot de passe/i,
    );
  });

  it('laisse passer un refus inconnu plutôt que de le noyer', () => {
    // Le choix d'origine, garde tel quel : un message générique ferait
    // réessayer la même chose sans rien apprendre à personne.
    expect(messageDeRefus('some unmapped gotrue failure')).toBe('some unmapped gotrue failure');
  });
});
