import { couleurs } from '@kolek/core';
import { describe, expect, it } from 'vitest';

/**
 * Le plancher de contraste de la vitrine.
 *
 * ## Pourquoi un test qui lit la source plutôt qu'un rendu
 *
 * Les classes en cause — `text-white/30`, `border-white/15` — sont de la
 * couleur. jsdom n'en calcule aucune : il ne charge pas la feuille Tailwind, et
 * `getComputedStyle` lui rend une chaîne vide. Un test de rendu ne peut donc pas
 * voir ce défaut, et c'est exactement pour cela qu'il a vécu jusqu'au
 * 2026-09-04 sur les cinq champs du formulaire d'ouverture, sans qu'aucune suite
 * ne rougisse.
 *
 * Ce qui *est* observable, c'est la classe écrite dans le fichier. Le test la
 * lit — par `import.meta.glob` en `?raw`, donc par le même transformateur que le
 * build, et sans faire entrer les types Node dans un projet navigateur — puis
 * recalcule le contraste réel selon WCAG 2.1.
 *
 * ## Il encode la règle, pas un nombre magique
 *
 * On n'écrit nulle part « au moins 55 % ». On écrit « au moins 4,5:1 », et les
 * fonds viennent de `couleurs` — la même source que le thème. Si le vert coffre
 * change un jour, le seuil d'opacité suit tout seul, et ce test reste vrai.
 *
 * ## Ce qu'il ne couvre pas
 *
 * Les bordures décoratives. Un filet à `border-white/10` autour d'une carte
 * n'est pas la frontière d'une commande : il ne porte aucune information, et
 * WCAG ne lui demande rien. Les trois commandes qui *ont* une frontière à
 * porter sont donc nommées une par une, plus bas.
 */

/** Les sources rendues de la vitrine — les tests eux-mêmes n'en sont pas. */
const SOURCES = Object.entries(
  import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >,
)
  .filter(([chemin]) => !chemin.endsWith('.test.tsx'))
  .map(([chemin, texte]) => ({ fichier: chemin.replace('./', ''), texte }));

/* ------------------------- Le calcul WCAG 2.1 ---------------------------- */

type Canaux = [number, number, number];

function versCanaux(hex: string): Canaux {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Canaux;
}

function luminance([r, v, b]: Canaux): number {
  const composante = (c: number) => {
    const n = c / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * composante(r) + 0.7152 * composante(v) + 0.0722 * composante(b);
}

/** La couleur `avant` posée à `opacite` sur `fond`, aplatie. */
function aplatir(avant: Canaux, opacite: number, fond: Canaux): Canaux {
  return avant.map((c, i) => c * opacite + fond[i] * (1 - opacite)) as Canaux;
}

function contraste(a: Canaux, b: Canaux): number {
  const clair = Math.max(luminance(a), luminance(b));
  const sombre = Math.min(luminance(a), luminance(b));
  return (clair + 0.05) / (sombre + 0.05);
}

/** Le contraste d'un blanc à `opacite` posé sur `fond`, arrondi au centième. */
function blancSur(opacite: number, fond: string): number {
  const canaux = versCanaux(fond);
  return Math.round(contraste(aplatir([255, 255, 255], opacite, canaux), canaux) * 100) / 100;
}

/* --------------------------- Les deux fonds ------------------------------ */

/**
 * La vitrine n'a que deux fonds sombres, et le plus **clair** des deux est le
 * pire cas pour du texte blanc : c'est lui qui décide. Le dégradé du hero va de
 * l'un à l'autre, il n'ajoute pas de troisième cas.
 */
const PIRE_FOND = couleurs.sidebar;

/** Le fond des cartes en or — le seul endroit où du texte sombre est posé. */
const FOND_OR = couleurs.or;

const AA_TEXTE = 4.5;
const AA_COMMANDE = 3;

/* ------------------------------ Les scans -------------------------------- */

interface Trouvaille {
  fichier: string;
  classe: string;
  opacite: number;
}

function scanner(motif: RegExp): Trouvaille[] {
  return SOURCES.flatMap(({ fichier, texte }) =>
    [...texte.matchAll(motif)].map((m) => ({
      fichier,
      classe: m[0],
      opacite: Number(m[1]) / 100,
    })),
  );
}

describe('le plancher de contraste du texte', () => {
  it('trouve bien du texte à scanner', () => {
    // Sans cette garde, un renommage de dossier rendrait la suite verte en ne
    // mesurant rien — le défaut même que ce fichier existe pour empêcher.
    expect(SOURCES.length).toBeGreaterThan(5);
    expect(scanner(/text-white\/(\d{1,3})\b/g).length).toBeGreaterThan(5);
  });

  it('pose tout texte blanc au-dessus de 4,5:1 sur le fond le plus clair', () => {
    const fautifs = scanner(/(?:placeholder:)?text-white\/(\d{1,3})\b/g)
      .filter(({ opacite }) => blancSur(opacite, PIRE_FOND) < AA_TEXTE)
      .map(
        ({ fichier, classe, opacite }) =>
          `${fichier} · ${classe} → ${blancSur(opacite, PIRE_FOND)}:1`,
      );

    expect(fautifs).toEqual([]);
  });

  it('pose tout texte sombre sur or au-dessus de 4,5:1', () => {
    const or = versCanaux(FOND_OR);
    const encre = versCanaux(couleurs.darkCanvas);

    const fautifs = scanner(/text-dark-canvas\/(\d{1,3})\b/g)
      .filter(({ opacite }) => contraste(aplatir(encre, opacite, or), or) < AA_TEXTE)
      .map(({ fichier, classe }) => `${fichier} · ${classe}`);

    expect(fautifs).toEqual([]);
  });
});

/**
 * Les trois commandes dont la bordure est la seule frontière.
 *
 * Nommées, et non déduites : un filet décoratif autour d'une carte porte la
 * même classe qu'une frontière de commande, et rien dans le texte source ne les
 * sépare. Les déduire demanderait de deviner ; les nommer demande de les tenir à
 * jour, ce qui est le bon marché. Une quatrième commande à bordure faible
 * n'échouera pas ici — elle échouera à la relecture, comme les trois autres.
 */
const COMMANDES = [
  {
    quoi: 'les cinq champs du formulaire',
    fichier: 'Inscription.tsx',
    motif: /border-\[1\.5px\] border-white\/(\d{1,3})/,
  },
  {
    quoi: 'les quatre boutons de palier',
    fichier: 'Inscription.tsx',
    motif: /border-white\/(\d{1,3}) text-white\/\d{1,3} hover:/,
  },
  {
    quoi: 'le bouton secondaire du hero',
    fichier: 'Hero.tsx',
    motif: /rounded-pill border border-white\/(\d{1,3}) px-7/,
  },
] as const;

describe('le plancher de contraste des commandes', () => {
  it.each(COMMANDES)('garde $quoi au-dessus de 3:1', ({ fichier, motif }) => {
    const source = SOURCES.find((s) => s.fichier === fichier);
    expect(source, `${fichier} introuvable`).toBeDefined();

    const trouve = source?.texte.match(motif) ?? null;
    // Un motif qui ne trouve plus rien n'est pas un succès : la commande a été
    // réécrite, et personne ne mesure plus sa bordure.
    expect(trouve, `bordure introuvable dans ${fichier} — motif à remettre à jour`).not.toBeNull();

    expect(blancSur(Number(trouve?.[1]) / 100, PIRE_FOND)).toBeGreaterThanOrEqual(AA_COMMANDE);
  });
});
