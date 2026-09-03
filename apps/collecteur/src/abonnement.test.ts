import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const { supabase } = await import('./supabase');
const { demarrerPaiement, messagePour, verifierPaiements } = await import('./abonnement');

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

/**
 * Ce module traduit une fois, à un seul endroit, les codes courts du serveur en
 * phrases lisibles au marché. Les tests portent surtout sur la lecture du corps
 * d'une réponse non-2xx : sans elle, un refus légitime s'affiche comme « Edge
 * Function returned a non-2xx status code », et personne ne sait quoi en faire.
 */

const SAISIE = {
  palier: 'pro',
  telephone: '+225700000000',
  paysTelephone: 'CI',
  telephoneLocal: '0700000000',
};

describe('demarrerPaiement', () => {
  it('rend l’URL de paiement', async () => {
    invoke.mockResolvedValueOnce({ data: { checkoutUrl: 'https://pay.test/x' }, error: null });

    expect(await demarrerPaiement(SAISIE)).toEqual({ ok: true, checkoutUrl: 'https://pay.test/x' });
  });

  it('n’envoie aucun montant — le prix vit dans la boutique', async () => {
    // La propriété centrale du dispositif, mesurée à l'endroit le moins sûr :
    // le téléphone. Un montant parti d'ici serait un prix décidé par le client.
    invoke.mockResolvedValueOnce({ data: { checkoutUrl: 'https://pay.test/x' }, error: null });

    await demarrerPaiement(SAISIE);

    const [route, options] = invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(route).toBe('abonnement-payer');
    expect(Object.keys(options.body).sort()).toEqual([
      'palier',
      'paysTelephone',
      'telephone',
      'telephoneLocal',
    ]);
  });

  it('traduit le code d’erreur lu dans le corps de la réponse', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'non-2xx',
        context: { json: async () => ({ erreur: 'TELEPHONE_INVALIDE' }) },
      },
    });

    const resultat = await demarrerPaiement({ ...SAISIE, telephone: '', telephoneLocal: '' });

    expect(resultat).toEqual({ ok: false, message: messagePour('TELEPHONE_INVALIDE') });
    expect(resultat).not.toEqual(expect.objectContaining({ message: 'non-2xx' }));
  });

  it('retombe sur la phrase générique quand le corps est illisible', async () => {
    // Une panne de réseau n'a pas de corps. Sans ce repli, la lecture jetterait
    // et le bouton resterait figé sur un écran sans explication.
    invoke.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'non-2xx',
        context: {
          json: async () => {
            throw new Error('corps vide');
          },
        },
      },
    });

    const resultat = await demarrerPaiement(SAISIE);

    expect(resultat).toEqual({ ok: false, message: messagePour('') });
  });

  it('refuse une réponse sans URL plutôt que de partir nulle part', async () => {
    invoke.mockResolvedValueOnce({ data: {}, error: null });

    expect(await demarrerPaiement(SAISIE).then((r) => r.ok)).toBe(false);
  });
});

describe('verifierPaiements', () => {
  it('rend le décompte du serveur', async () => {
    invoke.mockResolvedValueOnce({
      data: { credites: 1, enAttente: 0, echeance: '2026-09-21' },
      error: null,
    });

    expect(await verifierPaiements()).toEqual({ credites: 1, enAttente: 0, echeance: '2026-09-21' });
  });

  it('rend un décompte nul plutôt que de jeter quand le réseau manque', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'réseau' } });

    expect(await verifierPaiements()).toEqual({ credites: 0, enAttente: 0, echeance: null });
  });
});
