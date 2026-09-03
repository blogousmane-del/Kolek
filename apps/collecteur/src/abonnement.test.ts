import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

describe('la table des phrases', () => {
  /**
   * Le filet qui empêche la table de prendre du retard sur le serveur.
   *
   * Sans lui, chaque refus ajouté côté Edge Function s'afficherait « Paiement
   * impossible. Réessaie. » — une phrase qui ne dit ni ce qui s'est passé ni
   * quoi faire, et qui a l'air d'une panne alors que la correction est souvent
   * dans la saisie. Le retard ne se verrait qu'au moment où quelqu'un le
   * rencontre, c'est-à-dire au marché.
   *
   * Les trois fichiers lus sont ceux qui peuvent rendre un code à ce module :
   * les deux routes, et le module partagé dont `abonnement-payer` relaie
   * l'issue telle quelle (`return reponse({ erreur: issue.erreur }, …)`).
   */
  const SOURCES = [
    '../../../supabase/functions/abonnement-payer/index.ts',
    '../../../supabase/functions/abonnement-verifier/index.ts',
    '../../../supabase/functions/_shared/depot-chariow.ts',
  ];

  it('couvre tout code que les deux routes peuvent rendre', () => {
    const codes = new Set<string>();
    for (const chemin of SOURCES) {
      const source = readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');
      for (const trouve of source.matchAll(/erreur: '([A-Z_]+)'/g)) {
        codes.add(trouve[1] as string);
      }
    }

    // La sonde d'abord : un motif qui ne trouverait rien ferait passer ce test
    // sans rien mesurer, et c'est la façon la plus courante dont un contrôle par
    // lecture de source cesse silencieusement de contrôler.
    expect(codes.size).toBeGreaterThan(10);

    const generique = messagePour('CODE_QUI_N_EXISTE_PAS');
    const sansPhrase = [...codes].filter((code) => messagePour(code) === generique).sort();

    expect(sansPhrase).toEqual([]);
  });
});
