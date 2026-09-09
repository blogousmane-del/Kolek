import { describe, expect, it, vi } from 'vitest';

import { chargerTout, PAGES_MAX, TAILLE_PAGE } from './pagination';

/**
 * Pourquoi tout charger plutôt que paginer à l'écran.
 *
 * PostgREST applique `max_rows = 1000` — réglé dans `supabase/config.toml` —
 * **sans erreur et sans en-tête d'avertissement**. Une liste amputée a
 * exactement l'air d'une liste entière.
 *
 * Le collecteur travaille hors ligne, en tournée, et sa recherche filtre le
 * tableau déjà chargé. Une pagination à l'écran demanderait donc au serveur ce
 * que le collecteur n'a pas — c'est-à-dire rien, dans un marché sans réseau.
 * Charger l'intégralité de **sa** liste, une fois, est le seul dessin
 * compatible avec « hors-ligne d'abord ».
 *
 * Le coût est borné par la réalité du métier : un collecteur porte quelques
 * centaines de clients, pas des millions. `PAGES_MAX` tient l'autre bord.
 */
describe('chargerTout', () => {
  const lignes = (n: number, prefixe = 'l') =>
    Array.from({ length: n }, (_, i) => ({ id: `${prefixe}${i}` }));

  it('ne demande qu’une page quand le serveur en rend moins que la taille', async () => {
    const page = vi.fn().mockResolvedValue({ data: lignes(3), error: null });

    const resultat = await chargerTout(page);

    expect(page).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledWith(0, TAILLE_PAGE - 1);
    expect(resultat.data).toHaveLength(3);
    expect(resultat.error).toBeNull();
  });

  it('enchaîne les pages et les concatène dans l’ordre', async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: lignes(TAILLE_PAGE, 'a'), error: null })
      .mockResolvedValueOnce({ data: lignes(2, 'b'), error: null });

    const resultat = await chargerTout(page);

    expect(page).toHaveBeenCalledTimes(2);
    expect(page).toHaveBeenNthCalledWith(2, TAILLE_PAGE, TAILLE_PAGE * 2 - 1);
    expect(resultat.data).toHaveLength(TAILLE_PAGE + 2);
    // L'ordre importe : la liste est triée par nom, et concaténer à l'envers
    // rendrait un tri faux sans rien casser d'autre.
    expect(resultat.data[0]).toEqual({ id: 'a0' });
    expect(resultat.data[TAILLE_PAGE]).toEqual({ id: 'b0' });
  });

  it('s’arrête sur une page vide', async () => {
    // Le cas exact du multiple : mille lignes pile, puis rien.
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: lignes(TAILLE_PAGE), error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const resultat = await chargerTout(page);

    expect(page).toHaveBeenCalledTimes(2);
    expect(resultat.data).toHaveLength(TAILLE_PAGE);
  });

  it('remonte l’erreur et cesse de demander', async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: lignes(TAILLE_PAGE), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'coupure' } });

    const resultat = await chargerTout(page);

    expect(page).toHaveBeenCalledTimes(2);
    expect(resultat.error).toEqual({ message: 'coupure' });
    // Pas de données partielles : une liste incomplète présentée comme
    // complète est précisément le défaut qu'on ferme ici.
    expect(resultat.data).toEqual([]);
  });

  it('refuse de boucler sans fin', async () => {
    // Un serveur qui ignorerait `range` rendrait une page pleine à l'infini.
    // Sans borne, le téléphone du collecteur tourne jusqu'à la panne de
    // batterie, en tournée, sans rien afficher.
    const page = vi.fn().mockResolvedValue({ data: lignes(TAILLE_PAGE), error: null });

    const resultat = await chargerTout(page);

    expect(page).toHaveBeenCalledTimes(PAGES_MAX);
    expect(resultat.error).not.toBeNull();
    expect(String((resultat.error as { message: string }).message)).toContain('pages');
  });

  it('remonte le comptage du serveur, pris sur la première page', async () => {
    // `count: 'exact'` reste demandé comme recoupement : si la pagination
    // laissait un jour tomber une page, l'écart entre ce total et ce qui a été
    // reçu le dirait. Les pages suivantes le répètent — on garde la première,
    // parce qu'une insertion en cours de chargement ferait varier les autres.
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: lignes(TAILLE_PAGE), error: null, count: 1002 })
      .mockResolvedValueOnce({ data: lignes(2), error: null, count: 1002 });

    const resultat = await chargerTout(page);

    expect(resultat.total).toBe(1002);
    expect(resultat.data).toHaveLength(TAILLE_PAGE + 2);
  });

  it('rend un total nul quand le serveur n’a pas compté', async () => {
    // Déduire une troncature d'une absence de réponse ferait crier l'écran sur
    // toutes les listes, et le collecteur apprendrait à ignorer le bandeau.
    const page = vi.fn().mockResolvedValue({ data: lignes(3), error: null });

    expect((await chargerTout(page)).total).toBeNull();
  });

  it('traite une réponse sans données comme une page vide', async () => {
    const page = vi.fn().mockResolvedValue({ data: null, error: null });

    const resultat = await chargerTout(page);

    expect(resultat.data).toEqual([]);
    expect(resultat.error).toBeNull();
  });
});
