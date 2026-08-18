import { describe, expect, it } from 'vitest';
import { analyserCsp, assetsDe, hstsSuffisant } from './verifier-en-ligne.mjs';

// Le script parle au réseau : ce qui est testable ici, ce sont les deux
// fonctions qui décident si la réponse est conforme. Une CSP mal découpée fait
// passer un joker pour une origine nommée — c'est le seul endroit où l'erreur
// serait silencieuse.

describe('analyserCsp', () => {
  it('découpe les directives en listes de sources', () => {
    const d = analyserCsp("default-src 'self'; script-src 'self'; object-src 'none'");
    expect(d['default-src']).toEqual(["'self'"]);
    expect(d['script-src']).toEqual(["'self'"]);
    expect(d['object-src']).toEqual(["'none'"]);
  });

  it('conserve les origines multiples dans leur ordre', () => {
    const d = analyserCsp("connect-src 'self' https://x.supabase.co wss://x.supabase.co");
    expect(d['connect-src']).toEqual(["'self'", 'https://x.supabase.co', 'wss://x.supabase.co']);
  });

  it('tolère les espaces et le point-virgule final', () => {
    const d = analyserCsp("  script-src   'self' ;  font-src 'self';  ");
    expect(d['script-src']).toEqual(["'self'"]);
    expect(d['font-src']).toEqual(["'self'"]);
  });

  it('laisse voir un joker plutôt que de le normaliser', () => {
    const d = analyserCsp("connect-src 'self' https://*.supabase.co");
    expect(d['connect-src'].some((source) => source.includes('*'))).toBe(true);
  });
});

describe('hstsSuffisant', () => {
  it('accepte la valeur déclarée par le netlify.toml', () => {
    expect(hstsSuffisant('max-age=31536000; includeSubDomains')).toBe(true);
  });

  it("accepte l'ajout de preload par Netlify — c'est plus strict, pas moins", () => {
    expect(hstsSuffisant('max-age=31536000; includeSubDomains; preload')).toBe(true);
  });

  it('refuse une durée plus courte', () => {
    expect(hstsSuffisant('max-age=86400; includeSubDomains')).toBe(false);
  });

  it('refuse une politique qui laisse les sous-domaines dehors', () => {
    expect(hstsSuffisant('max-age=31536000')).toBe(false);
  });

  it("refuse l'absence d'en-tête", () => {
    expect(hstsSuffisant(null)).toBe(false);
  });
});

describe('assetsDe', () => {
  it('relève scripts et feuilles de style', () => {
    const html =
      '<link rel="stylesheet" href="/assets/index-a1.css">' +
      '<script type="module" src="/assets/index-b2.js"></script>';
    expect(assetsDe(html)).toEqual(['/assets/index-a1.css', '/assets/index-b2.js']);
  });

  it('ignore ce qui ne vient pas de /assets', () => {
    const html = '<link rel="icon" href="/icone-192.png"><script src="https://ailleurs.example/x.js">';
    expect(assetsDe(html)).toEqual([]);
  });
});
