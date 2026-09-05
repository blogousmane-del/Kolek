import { describe, expect, it } from 'vitest';

import { sansCommentaires, sourcesRendues } from './sources.test-utils';

/**
 * Le tiret cadratin ne va pas dans la copie rendue.
 *
 * ## La règle
 *
 * `—` et `–` sont bannis de tout ce que le visiteur lit : titres, sur-titres,
 * pastilles, corps de texte, libellés de boutons, légendes, textes de
 * remplacement. Sans exception et sans dose tolérée. C'est la signature
 * stylistique la plus reconnaissable des textes engendrés, et la vitrine se
 * vend justement sur le fait de ne pas en être un.
 *
 * Le remède est toujours disponible : un point, une virgule, deux points, une
 * parenthèse. Aucune phrase française n'a besoin de ce caractère.
 *
 * ## Les commentaires en gardent le droit
 *
 * Et ils en sont pleins, délibérément : ce dépôt écrit ses raisons dans le
 * code, en prose, et cette prose n'est pas rendue. La lecture partagée retire
 * donc les commentaires avant de chercher — voir `sources.test-utils.ts`.
 *
 * ## Pourquoi un test plutôt qu'une relecture
 *
 * Trois occurrences ont été retirées le 2026-09-04, dans des fichiers déjà
 * relus deux fois par des audits précédents. Le caractère se glisse dans une
 * phrase réécrite à la volée, et rien ne le distingue à l'œil d'un tiret
 * ordinaire à la vitesse d'une relecture.
 */

const SOURCES = sourcesRendues(
  import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >,
);

/** Le cadratin et le demi-cadratin. Le trait d'union ordinaire reste permis. */
const TIRETS = /[—–]/;

describe('la copie rendue de la vitrine', () => {
  it('trouve bien des fichiers à lire', () => {
    // Sans cette garde, un renommage de dossier rendrait la suite verte en ne
    // lisant rien.
    expect(SOURCES.length).toBeGreaterThan(5);
  });

  it('garde ses commentaires hors du champ', () => {
    // La preuve que le nettoyage fait son travail : les fichiers en portent, et
    // il n'en reste rien. Sans ce contrôle, un nettoyage cassé rendrait le test
    // suivant faussement rouge — ou, plus grave, un nettoyage trop large le
    // rendrait faussement vert.
    const avant = SOURCES.filter(({ brut }) => brut.includes('/*'));
    expect(avant.length).toBeGreaterThan(3);
    expect(avant.filter(({ brut }) => sansCommentaires(brut).includes('/*'))).toEqual([]);
  });

  it('ne contient aucun tiret cadratin', () => {
    const fautifs = SOURCES.flatMap(({ fichier, texte }) =>
      texte
        .split('\n')
        .map((ligne, i) => ({ ligne: ligne.trim(), numero: i + 1 }))
        .filter(({ ligne }) => TIRETS.test(ligne))
        .map(({ ligne, numero }) => `${fichier}:${numero} · ${ligne}`),
    );

    expect(fautifs).toEqual([]);
  });
});
