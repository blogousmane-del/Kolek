import { describe, expect, it } from 'vitest';

import { refusDePose } from './motDePasse';

/**
 * La traduction des refus de GoTrue.
 *
 * `poserMotDePasse` parle au réseau ; la traduction, elle, est pure et c'est
 * elle qui décide de ce qu'un collecteur lit quand ça échoue. Un message qu'on
 * ne comprend pas conduit à réessayer la même chose.
 *
 * ## Le refus que personne n'avait vu venir
 *
 * Mesuré le 2026-09-10 sur la pile locale, qui porte déjà
 * `secure_password_change = true` : au-delà de **24 heures** de session, GoTrue
 * refuse tout changement de mot de passe par
 * `400 — Password update requires reauthentication`. Une session de 23 h passe,
 * une de 25 h non.
 *
 * Le chemin du collecteur arrive par un lien de réinitialisation, donc sur une
 * session neuve, et ne devrait pas le rencontrer. « Ne devrait pas » n'est pas
 * « ne peut pas » : le message générique disait « Réessaie », ce qui est
 * exactement le mauvais conseil pour ce refus-là.
 */
describe('refusDePose', () => {
  it('nomme le refus de réauthentification, et ne dit pas « réessaie »', () => {
    const message = refusDePose('Password update requires reauthentication');

    expect(message).toMatch(/reconnect/i);
    expect(message).not.toMatch(/réessaie/i);
  });

  it('demande un mot de passe plus long avant de parler de fuite', () => {
    // L'ordre est celui du module d'origine : un mot de passe trop court porte
    // lui aussi le mot « weak » selon les versions, et l'ordre inverse
    // annoncerait une fuite à quelqu'un qui a tapé six caractères.
    expect(refusDePose('Password should be at least 10 characters')).toMatch(/10 caractères/);
  });

  it('nomme la fuite connue', () => {
    expect(refusDePose('This password has been pwned')).toMatch(/fuite/i);
  });

  it('renvoie vers « Mot de passe oublié » quand le lien a expiré', () => {
    expect(refusDePose('JWT expired')).toMatch(/oublié/i);
  });

  it('retombe sur un message français, jamais sur celui de GoTrue', () => {
    const message = refusDePose('some unmapped gotrue failure');

    expect(message).not.toContain('gotrue');
    expect(message).toMatch(/[éèàç]/);
  });
});
