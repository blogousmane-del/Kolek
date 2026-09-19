import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  composer,
  contenuConstante,
  empreinteDe,
  enTexte,
  instantaneValide,
} from './generer-cgu.mjs';

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

  it('coupe une fin de ligne à chaque <br>', () => {
    // Trou de couverture prouvé par mutation : sans cette règle, `<br>` est
    // simplement retiré par la passe générale et deux lignes se collent.
    expect(enTexte('<p>Un<br>Deux</p>')).toBe('Un\nDeux');
  });

  it('décode les quatre entités, pas seulement leur ordre', () => {
    // L’épreuve d’ordre (ci-dessus) pince l’ordre des remplacements, pas
    // leur existence : un dépouillement qui laisserait les entités
    // littérales passerait quand même cette épreuve-là.
    expect(enTexte('<p>&lt;&gt;&quot;&#x27;</p>')).toBe('<>"\'');
  });

  it('coupe aussi avant une ouvrante de bloc, pas seulement après une fermante', () => {
    // La pièce produite au tribunal a porté « Gratuit pendant 30 jours.20 clients » :
    // une `<ul>` ouvrante qui suit du texte en ligne ne produisait aucun saut, et la
    // passe qui retire les balises l’effaçait en silence. Quatre phrases que personne
    // n’avait écrites, dans le document même qu’on produirait à l’audience.
    //
    // Le cas est une liste imbriquée, et il le faut : du texte suivi d’une `</p>`
    // serait coupé de toute façon par cette fermante, et l’épreuve passerait au vert
    // sur une règle qui ne connaît que les fermantes. Mesuré — la première version de
    // cette épreuve ne gardait rien.
    expect(enTexte('<li>Prix.<ul><li>20 clients</li></ul></li>')).toBe('Prix.\n20 clients');
  });

  it('ne coupe pas sur `a`, qui est une balise en ligne', () => {
    // `a` a figuré dans la liste des balises de bloc : la pièce portait alors trois
    // lignes commençant par un point, dont une réduite au seul caractère « . », et la
    // phrase de résiliation perdait sa ponctuation finale.
    expect(enTexte('<p>Écrire à <a href="#">contact</a>. Suite.</p>')).toBe(
      'Écrire à contact. Suite.',
    );
  });

  it('garde une insécable en bord de ligne, que `trim()` mangerait', () => {
    // `String.prototype.trim()` compte U+00A0 comme un blanc. Écrit en échappement et
    // non au caractère : une insécable tapée dans un fichier est indiscernable d’une
    // espace ordinaire à la relecture, et cette épreuve mesurerait alors exactement le
    // contraire de ce qu’elle annonce.
    expect(enTexte('<p>\u00a0X\u00a0</p>')).toBe('\u00a0X\u00a0');
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

describe('instantaneValide', () => {
  // Sur un répertoire temporaire créé et détruit ici, jamais sur
  // Docs/legal/ : la garde qu’on éprouve ne doit pas dépendre de ce que
  // contient le dépôt au moment où l’épreuve tourne.
  function dossierTemporaire() {
    return mkdtempSync(join(tmpdir(), 'kolek-instantane-'));
  }

  it('refuse un instantané dont le contenu ne correspond pas à son nom', () => {
    const dossier = dossierTemporaire();
    try {
      const empreinte = empreinteDe('le vrai texte des conditions');
      writeFileSync(
        join(dossier, `conditions-2026-01-01-${empreinte}.txt`),
        'un texte quelconque, sans rapport avec le nom du fichier',
        'utf8',
      );
      // Trou de couverture prouvé par mutation : un contrôle qui ne
      // regarde que le suffixe du nom laisserait passer ce fichier.
      expect(instantaneValide(empreinte, dossier)).toBe(false);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('accepte un instantané dont le contenu retombe sur son nom', () => {
    const dossier = dossierTemporaire();
    try {
      const texte = 'le vrai texte des conditions';
      const empreinte = empreinteDe(texte);
      writeFileSync(join(dossier, `conditions-2026-01-01-${empreinte}.txt`), texte, 'utf8');
      expect(instantaneValide(empreinte, dossier)).toBe(true);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('refuse quand le répertoire n’existe pas', () => {
    expect(instantaneValide('0123456789abcdef', join(tmpdir(), 'kolek-inexistant-xyz'))).toBe(
      false,
    );
  });
});

describe('composer', () => {
  it('joint les deux pages, Conditions en premier, séparées par une ligne vide', () => {
    // Trou de couverture prouvé par mutation : le générateur peut cesser
    // de joindre la politique de confidentialité sans qu’aucune épreuve ne
    // rougisse tant que cette fonction n’est pas éprouvée séparément.
    expect(composer('<p>Un</p>', '<p>Deux</p>')).toBe('Un\n\nDeux');
  });

  it('dépouille chaque page avant de les joindre', () => {
    expect(composer('<p>Un<br>Bis</p>', '<div>Deux</div>')).toBe('Un\nBis\n\nDeux');
  });
});
