import { describe, expect, it } from 'vitest';

import { corpsDe, injecter, motsIndexables } from './prerendre.mjs';

/**
 * Le prérendu écrit un fichier HTML par route. Ces épreuves portent sur la
 * seule partie qui décide quelque chose : l'injection dans le gabarit.
 *
 * Elles ne lancent ni Vite ni React — le rendu en chaîne est éprouvé par la
 * construction elle-même, qui refuse d'écrire une page trop courte. Ici on
 * vérifie qu'une balise remplacée l'est vraiment, et qu'une balise introuvable
 * **arrête tout** plutôt que de laisser passer un gabarit inchangé.
 *
 * Ce dernier point est le cœur. Une substitution par expression régulière qui
 * ne trouve pas sa cible ne renvoie pas d'erreur : elle renvoie le texte
 * d'origine. Le fichier s'écrit, la construction réussit, et les cinq routes
 * repartent avec la même balise canonique — exactement le défaut qu'on ferme.
 */

const GABARIT = [
  '<!doctype html>',
  '<html lang="fr">',
  '  <head>',
  '    <title>Titre du gabarit</title>',
  '    <meta name="description" content="Description du gabarit" />',
  '    <link rel="canonical" href="https://kolek.cash/" />',
  '    <meta property="og:url" content="https://kolek.cash/" />',
  '    <meta property="og:title" content="Titre du gabarit" />',
  '    <meta property="og:description" content="Description du gabarit" />',
  '  </head>',
  '  <body>',
  '    <div id="root">',
  '      <div class="attente">',
  '        <p class="attente-slogan">Kolek</p>',
  '      </div>',
  '    </div>',
  '    <script type="module" src="/assets/index.js"></script>',
  '  </body>',
  '</html>',
].join('\n');

const VITRINE = {
  chemin: '/',
  fichier: 'index.html',
  titre: 'Kolek · L’épargne du marché',
  description: 'La description de la vitrine, assez longue pour ressembler à une vraie.',
  indexable: true,
  prerendu: true,
};

const CONDITIONS = {
  chemin: '/conditions',
  fichier: 'conditions/index.html',
  titre: 'Conditions générales · Kolek',
  description: 'Les conditions générales, décrites assez longuement pour faire une phrase.',
  indexable: true,
  prerendu: true,
};

const FORMULAIRE = {
  chemin: '/inscription',
  fichier: 'inscription/index.html',
  titre: 'Ouvrir un compte collecteur · Kolek',
  description: 'Le formulaire, décrit assez longuement pour faire une phrase entière.',
  indexable: false,
  prerendu: false,
};

describe('l’injection dans le gabarit', () => {
  it('pose le titre de la route', () => {
    const html = injecter(GABARIT, CONDITIONS, '<h1>Conditions</h1>');

    expect(html).toContain('<title>Conditions générales · Kolek</title>');
    expect(html).not.toContain('Titre du gabarit');
  });

  it('pose la description de la route', () => {
    const html = injecter(GABARIT, CONDITIONS, '<h1>Conditions</h1>');

    expect(html).toContain(`content="${CONDITIONS.description}"`);
    expect(html).not.toContain('Description du gabarit');
  });

  it('pose une canonique propre à la route', () => {
    const html = injecter(GABARIT, CONDITIONS, '<h1>Conditions</h1>');

    expect(html).toContain('<link rel="canonical" href="https://kolek.cash/conditions" />');
  });

  it('garde la barre oblique de la racine dans sa canonique', () => {
    const html = injecter(GABARIT, VITRINE, '<h1>Vitrine</h1>');

    expect(html).toContain('<link rel="canonical" href="https://kolek.cash/" />');
  });

  it('fait suivre les trois balises Open Graph', () => {
    const html = injecter(GABARIT, CONDITIONS, '<h1>Conditions</h1>');

    expect(html).toContain('<meta property="og:url" content="https://kolek.cash/conditions" />');
    expect(html).toContain(`<meta property="og:title" content="${CONDITIONS.titre}" />`);
    expect(html).toContain(`<meta property="og:description" content="${CONDITIONS.description}" />`);
  });

  it('n’ajoute « noindex » qu’aux routes hors de l’index', () => {
    expect(injecter(GABARIT, CONDITIONS, '<h1>x</h1>')).not.toContain('noindex');
    expect(injecter(GABARIT, FORMULAIRE, '')).toContain(
      '<meta name="robots" content="noindex" />',
    );
  });

  it('remplace le contenu de #root, sans laisser l’écran d’attente', () => {
    const html = injecter(GABARIT, CONDITIONS, '<main><h1>Conditions</h1></main>');

    expect(html).toContain('<main><h1>Conditions</h1></main></div>');
    expect(html).not.toContain('attente-slogan');
    // Le `<script>` qui suit ne doit pas avoir été emporté par le remplacement.
    expect(html).toContain('<script type="module" src="/assets/index.js"></script>');
  });

  it('laisse l’écran d’attente aux routes non prérendues', () => {
    const html = injecter(GABARIT, FORMULAIRE, '');

    expect(html).toContain('attente-slogan');
  });

  /*
    Le marqueur que lit `main.tsx` pour choisir entre hydrater et construire.

    Sans lui, `hydrateRoot` s'appliquerait aussi à `/inscription`, dont le
    `#root` porte l'écran d'attente et non le formulaire : React trouverait un
    arbre qui ne ressemble en rien à ce qu'il vient de rendre, signalerait la
    divergence et reconstruirait tout — à chaque visite, sur la page qui
    demande un numéro et un mot de passe.

    Le marqueur est posé par celui qui sait, au moment où il sait.
  */
  it('marque les seules pages effectivement prérendues', () => {
    expect(injecter(GABARIT, CONDITIONS, '<main>x</main>')).toContain('<div id="root" data-prerendu>');
    expect(injecter(GABARIT, FORMULAIRE, '')).not.toContain('data-prerendu');
  });

  it('échappe les guillemets et les esperluettes d’un attribut', () => {
    const piegee = { ...CONDITIONS, description: 'Un « guillemet » droit " et une esperluette & seule, assez longuement.' };
    const html = injecter(GABARIT, piegee, '<h1>x</h1>');

    expect(html).toContain('&quot;');
    expect(html).toContain('&amp;');
    // L'attribut ne doit pas s'être refermé au milieu de la phrase.
    expect(html).toContain('esperluette &amp; seule');
  });

  it('s’arrête si une balise du gabarit est introuvable', () => {
    // Le cœur de ces épreuves. Sans cette levée, un gabarit remanié ferait
    // écrire cinq pages identiques, en silence, et la construction réussirait.
    const sansCanonique = GABARIT.replace(/ *<link rel="canonical"[^>]*>\n/, '');

    expect(() => injecter(sansCanonique, CONDITIONS, '<h1>x</h1>')).toThrow(/canonical/i);
  });

  it('s’arrête si #root est introuvable', () => {
    const sansRacine = GABARIT.replace('<div id="root">', '<div id="racine">');

    expect(() => injecter(sansRacine, CONDITIONS, '<h1>x</h1>')).toThrow(/root/i);
  });
});

describe('le corps extrait et les mots comptés', () => {
  it('ne compte que le texte du corps, jamais celui de l’en-tête', () => {
    // Témoin du défaut d'origine : le gabarit porte un titre et une
    // description dans son `<head>`. Les compter donnerait un total rassurant
    // sur une page dont le corps est vide.
    const html = injecter(GABARIT, FORMULAIRE, '');

    expect(corpsDe(html)).not.toContain('Ouvrir un compte collecteur');
  });

  it('compte les mots du balisage rendu', () => {
    const balisage = '<main><h1>Trois instruments, un métier</h1><p>Le chemin d’un franc</p></main>';
    const html = injecter(GABARIT, CONDITIONS, balisage);

    // « Trois instruments, un métier » = 4 mots ; « Le chemin d'un franc » = 4.
    expect(motsIndexables(corpsDe(html))).toBe(8);
  });

  it('ne prend pas les balises pour des mots', () => {
    expect(motsIndexables('<div><span></span></div>')).toBe(0);
  });
});
