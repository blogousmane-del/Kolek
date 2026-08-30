import { describe, expect, it } from 'vitest';

import { admin } from './harnais';

/**
 * `pg_temp` doit être nommé, et nommé en dernier.
 *
 * ## Le contre-intuitif, mesuré
 *
 * Le schéma temporaire de la session est **toujours** cherché. S'il n'est pas
 * nommé dans le `search_path`, il est cherché **en premier — avant même
 * `pg_catalog`**. L'omettre ne le retire donc pas : ça le met devant.
 *
 * Mesuré le 2026-08-30 sur la base locale, deux fonctions `security definer`
 * identiques au `search_path` près, l'appelant ayant créé une table temporaire
 * du même nom que la cible :
 *
 * | `search_path` | Ce que la fonction lit |
 * |---|---|
 * | `essai` | la table **temporaire de l'appelant** |
 * | `essai, pg_temp` | la vraie table |
 *
 * Et sur le catalogue : `select count(*) from pg_class` rend 795, puis **0**
 * une fois qu'une table temporaire nommée `pg_class` existe.
 *
 * ## Pourquoi un test et pas seulement une migration
 *
 * La migration `20260830131000` a corrigé les 19 fonctions qui portaient la
 * forme faible. Elle ne dira rien de la vingtième. C'est exactement le défaut
 * que la session voisine a relevé dans le garde-fou du 29 août — une migration
 * appliquée ne rejoue pas — et il n'y a pas de raison de le refaire.
 *
 * Ce test tourne à chaque exécution du CI contre une base fraîchement migrée.
 * Il attrape donc la prochaine fonction `security definer`, quel que soit son
 * nom, sa date, et la session qui l'a écrite.
 *
 * ## Ce qu'il ne prétend pas
 *
 * Nommer `pg_temp` en dernier ferme le masquage ; ça ne dispense pas de
 * qualifier les références d'un corps `security definer`. Les deux se cumulent,
 * et le second n'est pas mécaniquement vérifiable ici.
 */

interface Definer {
  fonction: string;
  reglage: string;
  nomme_pg_temp: boolean;
}

async function definers(): Promise<Definer[]> {
  const { data, error } = await admin.rpc('search_path_definer');
  expect(error).toBeNull();
  return (data ?? []) as Definer[];
}

describe('search_path des fonctions security definer', () => {
  it('en trouve, avant de juger', async () => {
    // Le test qui protège le suivant. Une liste vide se lit « aucune faute »
    // alors qu'elle peut vouloir dire « je ne vois plus rien » — schéma renommé,
    // clause cassée, fonction remplacée. Le socle en porte une trentaine ; en
    // exiger vingt laisse la place aux suppressions légitimes sans laisser
    // passer un contrôle devenu aveugle.
    const toutes = await definers();
    expect(toutes.length).toBeGreaterThanOrEqual(20);
  });

  it('nomme pg_temp partout', async () => {
    const fautives = (await definers()).filter((f) => !f.nomme_pg_temp);

    // Le message porte la leçon : celui qui lira cet échec dans six mois n'aura
    // pas lu ce fichier, et le réflexe naturel — « retirer pg_temp » — est
    // précisément l'inverse du remède.
    expect(
      fautives,
      `Fonctions security definer dont le search_path ne nomme pas pg_temp :\n` +
        fautives.map((f) => `  ${f.fonction}  [${f.reglage}]`).join('\n') +
        `\nNon nommé, le schéma temporaire est cherché EN PREMIER, avant pg_catalog, ` +
        `et l'appelant peut y masquer une relation du corps. ` +
        `Le remède est de l'ajouter en dernier : « set search_path = public, pg_temp ».`,
    ).toEqual([]);
  });

  it('garde la forme sur les fonctions de contrôle elles-mêmes', async () => {
    // `journal_couverture` et `search_path_definer` lisent le catalogue avec des
    // références que `pg_temp` peut masquer — c'est le cas mesuré à 795 puis 0.
    // Un contrôle masqué rend une liste vide, c'est-à-dire « tout va bien ».
    const toutes = await definers();

    for (const nom of ['public.journal_couverture()', 'public.search_path_definer()']) {
      const ligne = toutes.find((f) => f.fonction === nom);
      expect(ligne, `${nom} a disparu de public`).toBeDefined();
      expect(ligne?.nomme_pg_temp, `${nom} ne nomme pas pg_temp`).toBe(true);
    }
  });
});
