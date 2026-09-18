import { describe, expect, it } from 'vitest';

import { contenuConstante, empreinteDe, enTexte } from './generer-cgu.mjs';

describe('enTexte', () => {
  it('coupe aux fermantes de bloc et retire les balises', () => {
    expect(enTexte('<p>Un</p><p>Deux</p>')).toBe('Un\nDeux');
  });

  it('décode &amp; en dernier, pour ne pas fabriquer une entité qui n’existait pas', () => {
    // `&amp;lt;` est le texte littéral « &lt; ». Décoder `&amp;` en premier le
    // transformerait en `&lt;`, que la passe suivante rendrait « < » — un
    // caractère que personne n’a écrit. L’ordre n’est pas un détail de style.
    expect(enTexte('<p>&amp;lt;</p>')).toBe('&lt;');
  });

  it('garde les espaces insécables, et réduit les autres', () => {
    // U+00A0 n’est pas de la mise en forme : les pages légales le posent devant
    // les deux-points et dans les montants. La règle qui réduit les suites
    // d’espaces ne doit pas le voir.
    // Écrit en échappement et non au caractère : une insécable tapée dans un
    // fichier est indiscernable d’une espace ordinaire à la relecture, et cette
    // épreuve passerait en mesurant exactement le contraire de ce qu’elle annonce.
    expect(enTexte('<p>2\u00a0500   FCFA</p>')).toBe('2\u00a0500 FCFA');
  });

  it('supprime les lignes vides', () => {
    expect(enTexte('<div></div><p>Seule</p><div>  </div>')).toBe('Seule');
  });
});

describe('empreinteDe', () => {
  it('rend seize caractères hexadécimaux', () => {
    expect(empreinteDe('quoi que ce soit')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('change quand le texte change', () => {
    expect(empreinteDe('a')).not.toBe(empreinteDe('b'));
  });
});

describe('contenuConstante', () => {
  it('porte la version, et un en-tête qui interdit la retouche à la main', () => {
    const texte = contenuConstante('0123456789abcdef', false);
    expect(texte).toMatch(/VERSION_CONDITIONS = '0123456789abcdef'/);
    expect(texte).toMatch(/ne pas modifier à la main/);
    expect(texte).not.toMatch(/URL_CONDITIONS/);
  });

  it('ajoute les deux adresses absolues pour le collecteur seulement', () => {
    const texte = contenuConstante('0123456789abcdef', true);
    // L’application du collecteur vit sur app.kolek.cash : un chemin relatif
    // comme `/conditions` y mènerait à une page qui n’existe pas.
    expect(texte).toMatch(/URL_CONDITIONS = 'https:\/\/kolek\.cash\/conditions'/);
    expect(texte).toMatch(/URL_CONFIDENTIALITE = 'https:\/\/kolek\.cash\/confidentialite'/);
  });
});
