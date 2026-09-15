import { describe, expect, it } from 'vitest';

/**
 * Les épreuves ne visent jamais la production.
 *
 * `.env` porte l’adresse et la clé du projet réel, et Vitest le charge : sans
 * la ligne `env` de `vitest.config.ts`, une épreuve qui oublie de simuler
 * Supabase lirait ou écrirait en production. Constaté le 2026-09-14.
 */
describe('la garde des épreuves', () => {
  it('remplace l’adresse et la clé de .env par une adresse injoignable', () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toBe('http://127.0.0.1:9');
    expect(import.meta.env.VITE_SUPABASE_ANON_KEY).toBe('cle-des-epreuves');
  });
});
