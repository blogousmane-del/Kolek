import { describe, expect, it } from 'vitest';
import {
  CIBLES,
  analyserCsp,
  assetsDe,
  cleAnonyme,
  comparerAssets,
  hstsSuffisant,
  manqueRedirection,
  manquesSeo,
} from './verifier-en-ligne.mjs';

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

  it('déclare pour chaque cible l’adresse Netlify qu’elle remplace', () => {
    // Sans ce champ, le contrôle de redirection se sauterait en silence — et un
    // contrôle qui s'efface tout seul ne vaut rien.
    for (const cible of CIBLES) {
      expect(cible.ancienne, `${cible.nom} : ancienne adresse non déclarée`).toMatch(
        /^https:\/\/kolek-[a-z]+\.netlify\.app$/,
      );
    }
  });
});

describe('manquesSeo', () => {
  const ORIGINE = 'https://kolek.cash';
  const TITRE = 'Kolek — L’épargne du marché';
  const DESCRIPTION = 'Le carnet du banquier ambulant, sur un téléphone.';

  function page(remplacements = {}) {
    const champs = {
      canonical: `${ORIGINE}/`,
      ogUrl: `${ORIGINE}/`,
      ogImage: `${ORIGINE}/og.png`,
      ogTitre: TITRE,
      ogDescription: DESCRIPTION,
      ...remplacements,
    };
    return (
      `<title>${TITRE}</title>` +
      `<meta name="description" content="${DESCRIPTION}" />` +
      `<link rel="canonical" href="${champs.canonical}" />` +
      `<meta property="og:type" content="website" />` +
      `<meta property="og:url" content="${champs.ogUrl}" />` +
      `<meta property="og:title" content="${champs.ogTitre}" />` +
      `<meta property="og:description" content="${champs.ogDescription}" />` +
      `<meta property="og:image" content="${champs.ogImage}" />` +
      `<meta name="twitter:card" content="summary_large_image" />`
    );
  }

  it('ne trouve rien à redire à une page complète', () => {
    expect(manquesSeo(page(), ORIGINE)).toEqual([]);
  });

  it('signale une balise canonique absente', () => {
    const html = page().replace(/<link[^>]+canonical[^>]+>/, '');
    expect(manquesSeo(html, ORIGINE)).toContain('aucune balise canonique');
  });

  it('signale une canonique restée sur l’ancien domaine', () => {
    // Le cas qui est arrivé, le 2026-08-26 : `kolek.cash` remplace l'adresse
    // Netlify, et les balises restent en arrière. Rien ne casse — le site
    // s'affiche —, mais Google continue d'indexer l'adresse morte. L'origine
    // ci-dessous est fictive, et le reste : le test doit continuer de valoir
    // le jour où `kolek.cash` cédera à son tour.
    const manques = manquesSeo(page(), 'https://kolek.example');
    expect(manques.some((m) => m.startsWith('canonique ='))).toBe(true);
  });

  it('signale une image de partage qui ne mène nulle part', () => {
    const manques = manquesSeo(page({ ogImage: `${ORIGINE}/image-supprimee.png` }), ORIGINE);
    expect(manques.some((m) => m.startsWith('og:image ='))).toBe(true);
  });

  it('refuse un og:title qui a cessé de dire ce que dit le titre', () => {
    // Deux formulations divergentes ne cassent rien et ne se voient pas : le
    // visiteur lit l'une, celui à qui on partage le lien lit l'autre.
    const manques = manquesSeo(page({ ogTitre: 'Kolek' }), ORIGINE);
    expect(manques.some((m) => m.startsWith('og:title diverge'))).toBe(true);
  });

  it('refuse une description de partage divergente', () => {
    const manques = manquesSeo(page({ ogDescription: 'Autre chose.' }), ORIGINE);
    expect(manques).toContain('og:description diverge de la <meta description>');
  });

  it('lit un attribut content placé avant le nom de la balise', () => {
    // L'ordre des attributs n'est pas garanti : un formateur peut les
    // réarranger, et un contrôle qui n'en lit qu'un sens crierait au loup.
    const html = `<meta content="website" property="og:type" />`;
    expect(manquesSeo(html, ORIGINE).some((m) => m.startsWith('og:type ='))).toBe(false);
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

describe('cleAnonyme', () => {
  const ENTIERE =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIn0.signature-quelconque';

  it('extrait la clé d’un artefact minifié', () => {
    expect(cleAnonyme('var _l=`https://x.supabase.co`,vl=`' + ENTIERE + '`;')).toBe(ENTIERE);
  });

  it('ne rend rien quand la clé est absente', () => {
    expect(cleAnonyme('var _l=`https://x.supabase.co`,vl=``;')).toBeNull();
  });

  it('ne se raccroche pas au segment de charge utile', () => {
    // Le piège du 2026-08-23 : la charge utile commence elle aussi par `eyJ`.
    // Une expression qui accepte n'importe quel `eyJ` transforme un jeton
    // amputé en jeton plausible — et c'est exactement ce qu'on cherche à voir.
    const amputee = ENTIERE.slice(1);
    expect(cleAnonyme('vl=`' + amputee + '`')).toBeNull();
  });
});

describe('manqueRedirection', () => {
  const NOUVELLE = 'https://kolek.cash';

  it('ne trouve rien à redire à une 301 vers la bonne adresse', () => {
    expect(manqueRedirection(301, 'https://kolek.cash/', NOUVELLE)).toBeNull();
  });

  it('tolère la barre oblique finale, des deux côtés', () => {
    expect(manqueRedirection(301, 'https://kolek.cash', NOUVELLE)).toBeNull();
    expect(manqueRedirection(308, 'https://kolek.cash/', NOUVELLE)).toBeNull();
  });

  it('signale une ancienne adresse qui sert encore l’application', () => {
    // Le défaut qu'on cherche : le domaine principal n'a pas été posé sur
    // Netlify. Rien n'a l'air cassé — les deux adresses répondent — mais deux
    // origines servent la même application, et les listes CORS n'en nomment
    // qu'une. La moitié des visiteurs ne peut pas envoyer le formulaire.
    expect(manqueRedirection(200, null, NOUVELLE)).toContain('domaine principal');
  });

  it('signale une redirection qui mène ailleurs', () => {
    const manque = manqueRedirection(301, 'https://kolek-site.netlify.app/', NOUVELLE);
    expect(manque).toContain('attendu https://kolek.cash');
  });

  it('signale une ancienne adresse qui ne répond plus du tout', () => {
    // Un 404 n'est pas une réussite : le lien partagé hier mène au vide au lieu
    // de mener au nouveau domaine.
    expect(manqueRedirection(404, null, NOUVELLE)).toContain('404');
  });
});
