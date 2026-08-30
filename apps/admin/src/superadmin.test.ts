import { describe, expect, it, vi } from 'vitest';

/**
 * La couche de données du Super Admin.
 *
 * ## Ce qui se joue ici et nulle part ailleurs
 *
 * Les deux routes disent « non » de deux façons, et l'écran doit les distinguer :
 *
 * - un **code d'erreur** (`erreur`) — la porte est fermée, la requête est mal
 *   formée, le serveur est en panne ;
 * - une **raison métier** (`raison`, en 409) — la demande a été comprise et
 *   refusée : « pas sur toi-même », « ce code est épuisé ».
 *
 * Les deux voyagent dans le corps d'une réponse non-2xx, donc dans
 * `error.context` — jamais dans `error.message`, qui ne dit que « non-2xx status
 * code ». Sans cette lecture, un refus parfaitement explicable s'afficherait
 * comme une panne, et personne ne saurait quoi corriger.
 *
 * ## Le code inconnu ressort tel quel
 *
 * Un code absent du dictionnaire s'affiche brut plutôt qu'en `undefined`. Une
 * route qui gagne une raison sans que l'écran suive doit rester lisible : mieux
 * vaut `cible_non_administrateur` à l'écran qu'un message vide.
 */

const invoke = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

const { agirSuperAdmin, chargerEtatSuperAdmin } = await import('./superadmin');

/** Reproduit ce que `functions.invoke` rend pour un statut hors 2xx : un
    message générique, et le vrai corps dans `context`. */
function echec(statut: number, corps: unknown) {
  return {
    data: null,
    error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify(corps), { status: statut }),
    }),
  };
}

describe('l’état du Super Admin', () => {
  it('rend le corps de la route', async () => {
    invoke.mockResolvedValue({ data: { administrateurs: [], codes_promo: [] }, error: null });

    const etat = await chargerEtatSuperAdmin();

    expect(etat.administrateurs).toEqual([]);
    expect(invoke).toHaveBeenCalledWith('super-admin-etat', { method: 'GET' });
  });

  it('traduit un refus de la porte', async () => {
    invoke.mockResolvedValue(echec(403, { erreur: 'ACCES_RESERVE' }));

    await expect(chargerEtatSuperAdmin()).rejects.toThrow(/réservé/i);
  });

  it('garde le message générique quand le corps est illisible', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('coupure réseau'), { context: undefined }),
    });

    await expect(chargerEtatSuperAdmin()).rejects.toThrow('coupure réseau');
  });
});

describe('les actions du Super Admin', () => {
  it('poste l’action et rend le corps en cas de succès', async () => {
    invoke.mockResolvedValue({ data: { fait: true, code: 'RENTREE' }, error: null });

    const resultat = await agirSuperAdmin({
      action: 'creer_code',
      code: 'RENTREE',
      remise_pct: 20,
      valide_du: '2026-09-01',
      valide_au: '2026-09-30',
      quota: 50,
    });

    expect(resultat).toEqual({ ok: true, corps: { fait: true, code: 'RENTREE' } });
    expect(invoke).toHaveBeenCalledWith('super-admin-action', {
      body: {
        action: 'creer_code',
        code: 'RENTREE',
        remise_pct: 20,
        valide_du: '2026-09-01',
        valide_au: '2026-09-30',
        quota: 50,
      },
    });
  });

  it('traduit une raison métier servie en 409', async () => {
    invoke.mockResolvedValue(echec(409, { fait: false, raison: 'action_sur_soi' }));

    const resultat = await agirSuperAdmin({ action: 'revoquer', cible: 'x' });

    expect(resultat.ok).toBe(false);
    expect(resultat.ok === false && resultat.message).toMatch(/ton propre accès/i);
  });

  it('traduit un code d’erreur de transport', async () => {
    invoke.mockResolvedValue(echec(400, { erreur: 'CHAMPS_INVALIDES' }));

    const resultat = await agirSuperAdmin({ action: 'revoquer', cible: 'x' });

    expect(resultat.ok === false && resultat.message).toMatch(/formulaire|champ/i);
  });

  it('affiche une raison inconnue telle quelle plutôt qu’un vide', async () => {
    invoke.mockResolvedValue(echec(409, { fait: false, raison: 'raison_inventee' }));

    const resultat = await agirSuperAdmin({ action: 'revoquer', cible: 'x' });

    expect(resultat.ok === false && resultat.message).toBe('raison_inventee');
  });

  it('ne prend pas un 200 sans « fait » pour une réussite', async () => {
    // La route promet 409 sur un refus métier. Si elle changeait d'avis, ce
    // test est ce qui empêcherait l'écran d'annoncer un succès muet.
    invoke.mockResolvedValue({ data: { fait: false, raison: 'code_indisponible' }, error: null });

    const resultat = await agirSuperAdmin({ action: 'appliquer_code', collecteur: 'x', code: 'Y' });

    expect(resultat.ok).toBe(false);
  });
});
