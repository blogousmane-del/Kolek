import { describe, expect, it } from 'vitest';

import { versCsv } from './exporter';

/**
 * L'export CSV.
 *
 * Ce que ces tests protègent n'est pas le format — un CSV est trivial — mais
 * l'ouverture du fichier **par un humain, dans Excel, à Abidjan**. Trois choses
 * cassent silencieusement : le mauvais séparateur met tout dans une colonne, les
 * accents deviennent illisibles, et une valeur contenant le séparateur décale
 * les colonnes d'une seule ligne — le pire des trois, parce qu'il ne se voit pas.
 */

describe('découpage', () => {
  it('sépare au point-virgule, pas à la virgule', () => {
    // Excel en configuration francophone découpe sur le point-virgule. Avec des
    // virgules, tout le fichier atterrit dans la première colonne et
    // l'exploitant conclut que l'export est cassé.
    expect(versCsv(['a', 'b'], [[1, 2]])).toBe('a;b\r\n1;2');
  });

  it('termine les lignes en CRLF', () => {
    // La norme du format, et ce qu'attendent les tableurs sous Windows.
    expect(versCsv(['a'], [['x'], ['y']])).toBe('a\r\nx\r\ny');
  });
});

describe('échappement', () => {
  it('encadre une valeur contenant le séparateur', () => {
    // Le cas réel : un nom de marché écrit « Adjamé; Forum ». Sans guillemets,
    // cette ligne — et elle seule — gagne une colonne. Un décalage sur une ligne
    // parmi cent ne se remarque pas avant qu'on additionne la mauvaise colonne.
    expect(versCsv(['zone'], [['Adjamé; Forum']])).toBe('zone\r\n"Adjamé; Forum"');
  });

  it('double les guillemets internes', () => {
    expect(versCsv(['nom'], [['Chez "Mimi"']])).toBe('nom\r\n"Chez ""Mimi"""');
  });

  it('encadre une valeur contenant un saut de ligne', () => {
    expect(versCsv(['note'], [['ligne1\nligne2']])).toBe('note\r\n"ligne1\nligne2"');
  });

  it('laisse intacte une valeur ordinaire', () => {
    // Ne pas encadrer ce qui n'en a pas besoin : un fichier lisible à l'œil nu
    // est un fichier qu'on peut vérifier sans tableur.
    expect(versCsv(['nom'], [['Kouamé Assi']])).toBe('nom\r\nKouamé Assi');
  });
});

describe('valeurs absentes', () => {
  it('rend une cellule vide pour null et undefined', () => {
    // `zone` est nullable en base. Écrire « null » dans la colonne ferait
    // apparaître le mot dans un tableau qu'un humain lit.
    expect(versCsv(['a', 'b'], [[null, undefined]])).toBe('a;b\r\n;');
  });

  it('conserve un zéro', () => {
    // Piège classique : un test de vérité laisserait tomber le zéro, et une
    // colonne « Clients » vide se lirait comme une donnée manquante plutôt que
    // comme un collecteur sans client.
    expect(versCsv(['clients'], [[0]])).toBe('clients\r\n0');
  });
});

describe('montants', () => {
  it('écrit les nombres bruts, sans séparateur de milliers ni devise', () => {
    // `2 000 FCFA` est du texte pour un tableur ; `2000` est un nombre. Le
    // destinataire de cet export veut faire des sommes.
    expect(versCsv(['encaisse'], [[2000]])).toBe('encaisse\r\n2000');
  });
});

describe('sans lignes', () => {
  it('rend les en-têtes seuls', () => {
    // Un fichier à en-têtes vaut mieux qu'un fichier vide : il dit ce qu'on
    // aurait obtenu, et confirme que l'export a bien fonctionné.
    expect(versCsv(['a', 'b'], [])).toBe('a;b');
  });
});
