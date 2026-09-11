import { describe, expect, it } from 'vitest';

import { MAX_ROWS, tableFactice } from './postgrest-factice';

/**
 * Le faux sur lequel reposent les épreuves des lectures. S'il ne coupait pas,
 * elles passeraient sur un code sans pagination — il est donc éprouvé à part.
 */

const lignes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `l${String(i).padStart(4, '0')}`, n: i }));

describe('le PostgREST factice des épreuves', () => {
  it('coupe à MAX_ROWS sans range, et sans erreur — comme le vrai', async () => {
    const { data, error } = await tableFactice(lignes(MAX_ROWS + 1)).select('id');

    expect(data).toHaveLength(MAX_ROWS);
    expect(error).toBeNull();
  });

  it('rend la tranche que demande range', async () => {
    const { data } = await tableFactice(lignes(MAX_ROWS + 1))
      .select('id')
      .order('id')
      .range(MAX_ROWS, 2 * MAX_ROWS - 1);

    expect(data).toEqual([{ id: 'l1000', n: 1000 }]);
  });

  it('trie sur plusieurs clés, dans l’ordre des appels', async () => {
    const t = [
      { id: 'b', q: '1' },
      { id: 'a', q: '1' },
      { id: 'c', q: '2' },
    ];

    const { data } = await tableFactice(t).select('*').order('q', { ascending: false }).order('id');

    expect(data.map((l) => l.id)).toEqual(['c', 'a', 'b']);
  });

  it('filtre par gte et par eq', async () => {
    const t = [
      { id: 'a', d: '2026-09-10' },
      { id: 'b', d: '2026-09-11' },
    ];

    expect((await tableFactice(t).select('*').gte('d', '2026-09-11')).data).toEqual([t[1]]);
    expect((await tableFactice(t).select('*').eq('id', 'a').maybeSingle()).data).toEqual(t[0]);
  });
});
