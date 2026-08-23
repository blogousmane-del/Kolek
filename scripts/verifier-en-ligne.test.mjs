import { describe, expect, it } from 'vitest';
import { CIBLES, analyserCsp, assetsDe, comparerAssets, hstsSuffisant } from './verifier-en-ligne.mjs';

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

describe('les attentes déclarées par cible', () => {
  it('ne rend indexable que le site public', () => {
    const indexables = CIBLES.filter((c) => c.robots === null).map((c) => c.nom);
    expect(indexables).toEqual(['site']);
  });

  it('accorde en-tête et fichier : ce qui est noindex refuse aussi la lecture', () => {
    for (const cible of CIBLES) {
      const attendue = cible.robots === null ? 'Allow: /' : 'Disallow: /';
      expect(cible.robotsRegle, `${cible.nom} : règle robots.txt incohérente`).toBe(attendue);
    }
  });

  it('nomme les cibles qui parlent au projet Supabase', () => {
    // La vitrine a rejoint la liste le 2026-08-23 : elle porte le formulaire de
    // demande d'ouverture et l'accès au compte collecteur. Ce test garde sa
    // raison d'être — il fige la liste, de sorte qu'une quatrième cible ne
    // puisse pas s'y glisser sans qu'on le décide.
    expect(CIBLES.filter((c) => c.supabase).map((c) => c.nom)).toEqual([
      'collecteur',
      'admin',
      'site',
    ]);
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

describe('comparerAssets — le contrôle de fraîcheur', () => {
  // Ajouté le 2026-08-21. Ce script a répondu « conforme » trois fois pendant
  // que les trois sites servaient une construction vieille de deux jours : six
  // écrans livrés, aucun en ligne. Rien ne comparait le contenu servi à celui
  // du dépôt — la phrase finale du script était une affirmation, pas une mesure.

  it('accepte deux listes identiques', () => {
    const a = ['/assets/index-aaa.js', '/assets/index-bbb.css'];
    expect(comparerAssets(a, [...a]).identique).toBe(true);
  });

  it("ne se laisse pas berner par l'ordre", () => {
    // Vite n'ordonne pas ses balises comme on les lit. Un contrôle sensible à
    // l'ordre échouerait sur une version parfaitement à jour, et on finirait
    // par le désactiver.
    const servis = ['/assets/index-bbb.css', '/assets/index-aaa.js'];
    const locaux = ['/assets/index-aaa.js', '/assets/index-bbb.css'];
    expect(comparerAssets(servis, locaux).identique).toBe(true);
  });

  it('signale une version périmée en nommant les deux empreintes', () => {
    // Le cas réel du 2026-08-21. Nommer les deux côtés est ce qui permet de
    // conclure en une lecture : celle du dépôt n'est jamais arrivée.
    const r = comparerAssets(['/assets/index-VIEUX.js'], ['/assets/index-NEUF.js']);

    expect(r.identique).toBe(false);
    expect(r.manquants).toEqual(['/assets/index-NEUF.js']);
    expect(r.inattendus).toEqual(['/assets/index-VIEUX.js']);
  });

  it('signale un artefact servi que le dépôt ne produit plus', () => {
    const r = comparerAssets(['/assets/a.js', '/assets/orphelin.js'], ['/assets/a.js']);

    expect(r.identique).toBe(false);
    expect(r.inattendus).toEqual(['/assets/orphelin.js']);
    expect(r.manquants).toEqual([]);
  });

  it('refuse une page servie sans aucun asset', () => {
    // Une construction ratée qui publie un index vide : le site répond 200 et
    // n'affiche rien.
    expect(comparerAssets([], ['/assets/index-a.js']).identique).toBe(false);
  });
});

describe('CIBLES', () => {
  it('déclare un dist local pour chaque cible', () => {
    // Sans ce chemin, le contrôle de fraîcheur ne peut rien comparer — et un
    // contrôle qui ne compare rien est un contrôle qui dit toujours oui.
    for (const cible of CIBLES) {
      expect(cible.dist).toMatch(/^apps\/[a-z]+\/dist$/);
    }
  });
});
