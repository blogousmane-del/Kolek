import { describe, expect, it } from 'vitest';

import { lireErreurOAuth } from './erreurOAuth';

/**
 * Ce que Supabase renvoie quand la connexion Google échoue, et ce qu'on en fait.
 *
 * Le 2026-08-24, une tentative réelle est revenue avec cette adresse :
 *
 *   /?error=server_error&error_code=unexpected_failure
 *    &error_description=Unable+to+exchange+external+code%3A+4%2F0A
 *
 * Rien ne la lisait. Le collecteur touchait « Continuer avec Google », partait
 * chez Google, revenait — et retrouvait le même écran de connexion, sans un mot.
 * Une panne muette se lit comme un bouton cassé, et un bouton cassé se retouche
 * dix fois avant qu'on appelle GTCS.
 *
 * La fonction est pure et prend l'adresse en argument plutôt que de lire
 * `window.location` : c'est ce qui permet de la vérifier sur les vraies adresses
 * rencontrées, sans truquer l'objet `location` de jsdom.
 */

const ORIGINE = 'https://kolek-collecteur.netlify.app';

describe('lecture d’une erreur OAuth au retour', () => {
  it('ne dit rien quand l’adresse ne porte aucune erreur', () => {
    expect(lireErreurOAuth(`${ORIGINE}/`)).toBeNull();
    expect(lireErreurOAuth(`${ORIGINE}/?code=4%2F0AVMBsJi`)).toBeNull();
  });

  it('désigne la configuration du projet quand l’échange du code échoue', () => {
    // L'adresse exacte du 2026-08-24.
    const message = lireErreurOAuth(
      `${ORIGINE}/?error=server_error&error_code=unexpected_failure` +
        `&error_description=Unable+to+exchange+external+code%3A+4%2F0A`,
    );

    // Le collecteur n'y peut rien, et c'est la première chose à lui dire :
    // sinon il recommence, change de compte Google, désinstalle l'application.
    expect(message).toContain('configuration');
    expect(message).toContain('GTCS');
  });

  it('nomme le refus quand le collecteur annule chez Google', () => {
    const message = lireErreurOAuth(`${ORIGINE}/?error=access_denied&error_code=access_denied`);

    expect(message).toContain('refus');
    // Pas d'appel à GTCS pour un refus volontaire : il n'y a rien à réparer.
    expect(message).not.toContain('GTCS');
  });

  it('reprend le message des comptes non rattachés quand l’inscription est fermée', () => {
    const message = lireErreurOAuth(
      `${ORIGINE}/?error=access_denied&error_code=signup_disabled` +
        `&error_description=Signups+not+allowed+for+this+instance`,
    );

    // Même formulation que le refus direct de `signInWithOAuth` dans
    // `Connexion.tsx` : deux chemins mènent ici, le collecteur doit lire la
    // même phrase dans les deux cas.
    expect(message).toContain("n'est rattachée à aucun compte Kolek");
  });

  it('lit aussi une erreur passée dans le fragment', () => {
    // GoTrue place l'erreur dans la requête en flux PKCE, dans le fragment en
    // flux implicite. Le dépôt utilise le premier, mais le second reste ce que
    // renvoient les liens de courriel — et un fragment ignoré serait de nouveau
    // une panne muette.
    const message = lireErreurOAuth(
      `${ORIGINE}/#error=server_error&error_description=Unable+to+exchange+external+code`,
    );

    expect(message).toContain('configuration');
  });

  it('porte le motif brut quand le cas n’est pas connu', () => {
    const message = lireErreurOAuth(
      `${ORIGINE}/?error=server_error&error_description=Something+entirely+new`,
    );

    // Un message générique fait recommencer la même chose. Le motif d'origine
    // reste lisible, c'est lui qui permet à GTCS de chercher.
    expect(message).toContain('Something entirely new');
  });
});
