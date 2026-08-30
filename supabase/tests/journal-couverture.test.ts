import { describe, expect, it } from 'vitest';

import { admin } from './harnais';

/**
 * Le contrôle du journal, rejoué à chaque exécution.
 *
 * ## Ce qu'il remplace
 *
 * La migration du 2026-08-29 finissait par un bloc `do` qui échouait si l'un
 * des six triggers de journal ne couvrait pas les trois événements. Il a servi
 * ce jour-là et ne servira plus jamais : **une migration appliquée ne rejoue
 * pas**, et sa liste de six tables était figée.
 *
 * Le défaut a été signalé par la session qui travaillait en parallèle — elle
 * ajoutait justement une septième table journalisée, qui serait passée sous le
 * contrôle sans que rien ne le dise.
 *
 * ## La règle, énoncée sans nommer de table
 *
 * Nommer les tables rejouerait le défaut au prochain ajout. La règle est donc
 * en compréhension :
 *
 *   **Toute table portant un trigger de journal doit soit le couvrir sur les
 *   trois événements, soit être protégée en modification.**
 *
 * Les deux branches sont les deux régimes du socle. `clients`, `cartes`,
 * `collecteurs`, `caisses_jour`, `demandes_ouverture` se corrigent
 * légitimement : elles doivent tout tracer, suppression comprise. `mises`,
 * `retraits` et `audit_log` sont immuables — `interdire_modification` y refuse
 * `UPDATE` et `DELETE` — donc un trigger `INSERT` seul y est juste.
 *
 * Une table journalisée qui ne relève d'aucun des deux régimes est un oubli,
 * quel que soit son nom, quelle que soit la date de son ajout, et quelle que
 * soit la session qui l'a écrite.
 */

interface Couverture {
  table_cible: string;
  journal_trois_evenements: boolean;
  protege_en_modification: boolean;
}

async function couverture(): Promise<Couverture[]> {
  const { data, error } = await admin.rpc('journal_couverture');
  expect(error).toBeNull();
  return (data ?? []) as Couverture[];
}

describe('couverture du journal', () => {
  it('trace quelque chose', async () => {
    // Le test qui protège les autres. Si la fonction rendait une liste vide —
    // triggers effacés par une migration, ou fonction renommée — les deux
    // assertions suivantes passeraient sur zéro ligne, et un journal disparu
    // se lirait comme un journal parfait.
    const lignes = await couverture();
    expect(lignes.length).toBeGreaterThanOrEqual(8);
  });

  it('couvre les trois événements, ou refuse la modification', async () => {
    const lignes = await couverture();

    const oublis = lignes.filter(
      (l) => !l.journal_trois_evenements && !l.protege_en_modification,
    );

    // Le message importe : un jour quelqu'un lira cet échec sans avoir lu ce
    // fichier, et doit comprendre d'un coup ce qu'on lui reproche.
    expect(
      oublis,
      `Tables journalisées sans couverture complète ni protection : ` +
        `${oublis.map((l) => l.table_cible).join(', ')}. ` +
        `Soit le trigger couvre INSERT, UPDATE et DELETE, soit interdire_modification refuse UPDATE et DELETE.`,
    ).toEqual([]);
  });

  it('garde sous surveillance les tables du socle qui se modifient', async () => {
    // La règle en compréhension attrape les ajouts futurs ; elle n'attraperait
    // pas la disparition pure et simple d'un trigger. Ces cinq-là portent des
    // personnes — clients, collecteurs, demandes — et leur trace est ce qui
    // rattache une carte à quelqu'un de réel.
    const attendues = ['caisses_jour', 'cartes', 'clients', 'collecteurs', 'demandes_ouverture'];
    const lignes = await couverture();

    for (const nom of attendues) {
      const ligne = lignes.find((l) => l.table_cible === nom);
      expect(ligne, `${nom} n'est plus journalisée du tout`).toBeDefined();
      expect(ligne?.journal_trois_evenements, `${nom} ne couvre pas les trois événements`).toBe(
        true,
      );
    }
  });

  it('accepte qu’une table immuable ne journalise que l’insertion', async () => {
    // `mises` est le cas qui explique la seconde branche : son trigger de
    // journal est en INSERT seul, et c'est juste. Sans cette branche, la règle
    // exigerait de tracer un UPDATE que la base refuse.
    const lignes = await couverture();
    const mises = lignes.find((l) => l.table_cible === 'mises');

    expect(mises).toBeDefined();
    expect(mises?.protege_en_modification).toBe(true);
  });
});
