import { describe, expect, it } from 'vitest';

import { chercherDansLeDepot, chercherTirets, sources } from './verifier-tirets.mjs';

/**
 * Le garde-fou du tiret cadratin.
 *
 * Il ne combat pas une ponctuation : il combat une densité. Soixante-trois
 * lignes d'interface en portaient un au 2026-09-16, et c'est le compte qui
 * accuse, pas la ligne. La coupure est donc la longueur du texte qui porte le
 * tiret — sous 70 caractères on lit une étiquette, au-dessus une phrase.
 */
describe('tiret cadratin dans les libellés', () => {
  it('signale un cadratin dans un libellé de bouton', () => {
    const source = 'const libelle = `Confirmer la mise — ${montant} FCFA`;';

    expect(chercherTirets(source, 'a.ts')).toEqual([
      { chemin: 'a.ts', ligne: 1, texte: 'Confirmer la mise — ${montant} FCFA' },
    ]);
  });

  it('signale un cadratin dans un sous-titre', () => {
    const source = '<EnTete sousTitre="Sa tournée — tu encaisses à sa place" />';

    expect(chercherTirets(source, 'a.tsx')).toEqual([
      { chemin: 'a.tsx', ligne: 1, texte: 'Sa tournée — tu encaisses à sa place' },
    ]);
  });

  it('laisse la prose tranquille', () => {
    // L'écran de réglages explique en trois paragraphes ce que le serveur
    // répond. Le cadratin y est la ponctuation juste, et l'interdire
    // reviendrait à interdire d'écrire en français.
    const source =
      '<p>Le serveur applique ici sa politique complète — longueur minimale et refus des mots de passe connus — sans que le dépôt ait son mot à dire.</p>';

    expect(chercherTirets(source, 'a.tsx')).toEqual([]);
  });

  it('laisse le cadratin seul, qui marque une valeur absente', () => {
    // Convention de tableau, aussi ancienne que les tableaux. La remplacer par
    // « Non renseigné » rallongerait chaque ligne vide d'une fiche.
    const source = "<Ligne terme=\"Téléphone\" valeur={profil.telephone || '—'} />";

    expect(chercherTirets(source, 'a.tsx')).toEqual([]);
  });

  it('ne lit pas les commentaires', () => {
    const source = [
      '/* Le montant entre en se posant — voir mouvement.css. */',
      'const x = 1;',
    ].join('\n');

    expect(chercherTirets(source, 'a.ts')).toEqual([]);
  });

  it('ne se laisse pas couper une phrase par une balise en ligne', () => {
    // « Le consulter s'enregistre </strong> — c'est pourquoi… » est une seule
    // phrase pour le lecteur et deux passages pour l'analyseur. Sans le
    // nettoyage des balises en ligne, chaque moitié tombe sous le seuil de
    // libellé et le contrôle signale de la prose parfaitement écrite.
    const source =
      "<p><strong>Le consulter s'enregistre</strong> — c'est pourquoi ce journal ne s'affiche jamais de lui-même au chargement.</p>";

    expect(chercherTirets(source, 'a.tsx')).toEqual([]);
  });

  it('ne se laisse pas couper une phrase par une apostrophe française', () => {
    // Le piège documenté dans `verifier-champs.mjs`, sous un autre déguisement :
    // le `'` de « l'instant » ouvre une chaîne pour qui lit les guillemets
    // d'abord, et en découpe un morceau court au milieu d'un paragraphe.
    const source =
      "<p>Mesuré à l'instant, côté serveur — ce n'est pas ce que le dépôt déclare, c'est ce que la plateforme répond.</p>";

    expect(chercherTirets(source, 'a.tsx')).toEqual([]);
  });

  it('mesure ce que le lecteur voit, pas ce que la source pèse', () => {
    // Trois ternaires de pluriel autour de deux mots : quatre-vingt-huit
    // caractères écrits, une trentaine lus. Sans le retrait des interpolations,
    // ce libellé passait pour une phrase et échappait au contrôle.
    const source =
      "const m = `${n} opération${n > 1 ? 's' : ''} refusée${n > 1 ? 's' : ''} — à voir`;";

    expect(chercherTirets(source, 'a.ts')).toHaveLength(1);
  });

  it('ne prend pas une flèche de fonction pour du balisage', () => {
    // Dans un `.ts`, un `>` suivi d'un `<` n'est jamais du texte : c'est une
    // flèche suivie d'une comparaison. Le laisser courir fabriquerait de
    // longues unités imaginaires qui couvriraient de vrais libellés.
    const source = [
      'const f = (a) => a.filter((b) => b < 3);',
      "const titre = 'Bilan — aujourd’hui';",
    ].join('\n');

    expect(chercherTirets(source, 'a.ts')).toEqual([
      { chemin: 'a.ts', ligne: 2, texte: 'Bilan — aujourd’hui' },
    ]);
  });

  it('ne signale qu’une fois un libellé qui porte deux tirets', () => {
    const source = "const t = 'Hier — aujourd’hui — demain';";

    expect(chercherTirets(source, 'a.ts')).toHaveLength(1);
  });

  it('lit bien quelque chose — sinon il serait vert sur un dépôt vide', () => {
    expect(sources().length).toBeGreaterThan(50);
  });

  it('aucun libellé du dépôt ne porte de cadratin', () => {
    expect(chercherDansLeDepot()).toEqual([]);
  });
});
