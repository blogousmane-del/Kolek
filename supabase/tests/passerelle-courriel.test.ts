import { describe, expect, it, vi } from 'vitest';

import {
  construireRequete,
  envoyer,
  lireIssue,
  passerelleDepuis,
  type Identifiants,
} from '../functions/_shared/passerelle-courriel.ts';

/**
 * La passerelle courriel.
 *
 * Elle porte la même promesse que sa jumelle SMS, et c'est la seule qui
 * compte : **elle ne prétend jamais avoir envoyé**. Un dispositif qui
 * marquerait une demande « ouverte » sur un envoi imaginaire produirait un
 * prospect classé traité qui n'a jamais rien reçu — découvert des semaines plus
 * tard, par un appel.
 */

const IDENTIFIANTS: Identifiants = {
  fournisseur: 'resend',
  cle: 're_test_123',
  expediteur: 'Kolek <acces@kolek.cash>',
};

describe('passerelleDepuis', () => {
  it('lit une configuration complète', () => {
    const p = passerelleDepuis({
      COURRIEL_FOURNISSEUR: 'resend',
      COURRIEL_CLE: 're_test_123',
      COURRIEL_EXPEDITEUR: 'Kolek <acces@kolek.cash>',
    });
    expect(p).toEqual(IDENTIFIANTS);
  });

  it('rend null quand la clé manque', () => {
    // Rendre `null` est le comportement qui tient toute la chaîne : l'appelant
    // le voit, le dit, et ne marque rien.
    expect(
      passerelleDepuis({
        COURRIEL_FOURNISSEUR: 'resend',
        COURRIEL_EXPEDITEUR: 'Kolek <acces@kolek.cash>',
      }),
    ).toBeNull();
  });

  it('rend null quand l’expéditeur manque', () => {
    expect(
      passerelleDepuis({ COURRIEL_FOURNISSEUR: 'resend', COURRIEL_CLE: 're_test_123' }),
    ).toBeNull();
  });

  it('rend null pour un fournisseur inconnu', () => {
    // Un nom mal orthographié doit couper, pas retomber en silence sur Resend :
    // celui qui a écrit `resent` doit l'apprendre.
    expect(
      passerelleDepuis({
        COURRIEL_FOURNISSEUR: 'resent',
        COURRIEL_CLE: 're_test_123',
        COURRIEL_EXPEDITEUR: 'Kolek <acces@kolek.cash>',
      }),
    ).toBeNull();
  });

  it('rend null sur un environnement vide', () => {
    expect(passerelleDepuis({})).toBeNull();
  });
});

describe('construireRequete', () => {
  it('compose l’appel Resend', () => {
    const r = construireRequete(IDENTIFIANTS, 'mariam@example.ci', 'Ton compte Kolek', 'Bonjour.');

    expect(r.url).toBe('https://api.resend.com/emails');
    expect(r.entetes.Authorization).toBe('Bearer re_test_123');
    expect(r.entetes['Content-Type']).toBe('application/json');

    const corps = JSON.parse(r.corps);
    expect(corps.from).toBe('Kolek <acces@kolek.cash>');
    expect(corps.to).toEqual(['mariam@example.ci']);
    expect(corps.subject).toBe('Ton compte Kolek');
    expect(corps.text).toBe('Bonjour.');
  });

  it('n’envoie qu’en texte', () => {
    // Pas de `html` : un corps HTML demanderait une seconde rédaction à tenir à
    // jour, et le message ne porte qu'un lien. Le texte simple passe partout et
    // ne peut pas diverger de lui-même.
    const corps = JSON.parse(construireRequete(IDENTIFIANTS, 'a@b.ci', 'S', 'C').corps);
    expect(corps.html).toBeUndefined();
  });
});

describe('lireIssue', () => {
  it('accepte les 2xx', () => {
    expect(lireIssue(200)).toEqual({ ok: true });
    expect(lireIssue(202)).toEqual({ ok: true });
  });

  it('marque 429 réessayable', () => {
    expect(lireIssue(429)).toEqual({ ok: false, reessayable: true, raison: 'DEBIT_DEPASSE' });
  });

  it('marque les 5xx réessayables', () => {
    expect(lireIssue(503)).toEqual({ ok: false, reessayable: true, raison: 'PASSERELLE_503' });
  });

  it('marque 401 et 403 définitifs', () => {
    // Réessayer mille fois ne changera pas une clé refusée, et il faut que
    // quelqu'un le voie.
    expect(lireIssue(401)).toEqual({
      ok: false,
      reessayable: false,
      raison: 'IDENTIFIANTS_REFUSES',
    });
    expect(lireIssue(403)).toEqual({
      ok: false,
      reessayable: false,
      raison: 'IDENTIFIANTS_REFUSES',
    });
  });

  it('nomme les autres refus', () => {
    expect(lireIssue(422)).toEqual({ ok: false, reessayable: false, raison: 'REFUS_422' });
  });
});

describe('envoyer', () => {
  it('rend ok sur une réponse 200', async () => {
    const recuperer = vi.fn(async () => new Response('{}', { status: 200 }));
    const issue = await envoyer(
      IDENTIFIANTS,
      'a@b.ci',
      'S',
      'C',
      recuperer as unknown as typeof fetch,
    );

    expect(issue).toEqual({ ok: true });
    expect(recuperer).toHaveBeenCalledOnce();
  });

  it('rend un échec réessayable sur une coupure réseau', async () => {
    // Le cas qui doit surtout **ne rien marquer** : la demande reste en l'état,
    // et l'administrateur peut relancer.
    const recuperer = vi.fn(async () => {
      throw new TypeError('network');
    });
    const issue = await envoyer(
      IDENTIFIANTS,
      'a@b.ci',
      'S',
      'C',
      recuperer as unknown as typeof fetch,
    );

    expect(issue.ok).toBe(false);
    if (issue.ok) return;
    expect(issue.reessayable).toBe(true);
    expect(issue.raison).toBe('RESEAU_TypeError');
  });

  it('refuse une adresse vide sans appeler le fournisseur', async () => {
    const recuperer = vi.fn();
    const issue = await envoyer(
      IDENTIFIANTS,
      '   ',
      'S',
      'C',
      recuperer as unknown as typeof fetch,
    );

    expect(issue).toEqual({ ok: false, reessayable: false, raison: 'ADRESSE_VIDE' });
    expect(recuperer).not.toHaveBeenCalled();
  });
});
