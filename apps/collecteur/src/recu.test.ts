import { describe, expect, it } from 'vitest';

import { numeroDeRecu } from './recu';

describe('le numéro de reçu', () => {
  it('prend les huit premiers signes de l’identifiant, en capitales', () => {
    expect(numeroDeRecu('abcdef1234')).toBe('ABCDEF12');
  });
});
