import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * Les phrases du paiement ne doivent pas prendre de retard sur les refus.
 *
 * `supabase-js` ne rend pas le corps d'une réponse non-2xx dans `error.message`
 * — il y met « Edge Function returned a non-2xx status code ». L'application
 * lit donc le corps à part et traduit le code court qu'il porte, par une table
 * qui vit dans `apps/collecteur/src/abonnement.ts`.
 *
 * Un code sans phrase ne casse rien : il s'affiche « Paiement impossible.
 * Réessaie. » C'est précisément le danger. Cette phrase ne dit ni ce qui s'est
 * passé ni quoi faire, elle a l'air d'une panne alors que la correction est
 * souvent dans la saisie, et le retard ne se voit qu'au moment où quelqu'un le
 * rencontre — c'est-à-dire au marché.
 *
 * ## Pourquoi ici, et pas dans la suite de l'application
 *
 * Le contrôle traverse deux mondes : le serveur qui refuse, le téléphone qui
 * explique. Écrit dans `apps/collecteur`, il obligeait ce paquet à embarquer
 * les types Node pour lire un fichier — une dépendance de construction ajoutée
 * à une application, pour un test. Cette suite-ci lit déjà des sources
 * (`avis-drainage.test.ts`), et le fait sans rien changer à ce qui est livré.
 */

/** Les trois fichiers qui peuvent rendre un code à l'application : les deux
    routes, et le module partagé dont `abonnement-payer` relaie l'issue telle
    quelle — `return reponse({ erreur: issue.erreur }, …)`. */
const SOURCES = [
  'supabase/functions/abonnement-payer/index.ts',
  'supabase/functions/abonnement-verifier/index.ts',
  'supabase/functions/_shared/depot-chariow.ts',
];

const TABLE = 'apps/collecteur/src/abonnement.ts';

function codesDuServeur(): Set<string> {
  const codes = new Set<string>();
  for (const chemin of SOURCES) {
    for (const trouve of readFileSync(chemin, 'utf8').matchAll(/erreur: '([A-Z_]+)'/g)) {
      codes.add(trouve[1] as string);
    }
  }
  return codes;
}

function codesDeLaTable(): Set<string> {
  const source = readFileSync(TABLE, 'utf8');
  const debut = source.indexOf('const MESSAGES: Record<string, string> = {');
  const fin = source.indexOf('\n};', debut);
  expect(debut, 'la table MESSAGES a changé de forme').toBeGreaterThan(-1);
  expect(fin, 'la fin de la table MESSAGES est introuvable').toBeGreaterThan(debut);

  const bloc = source.slice(debut, fin);
  return new Set([...bloc.matchAll(/^\s{2}([A-Z_]+):/gm)].map((t) => t[1] as string));
}

describe('la table des phrases du paiement', () => {
  it('lit bien quelque chose des deux côtés', () => {
    // La sonde d'abord. Un motif qui ne trouverait rien ferait passer le test
    // suivant sans rien mesurer, et c'est la façon la plus courante dont un
    // contrôle par lecture de source cesse silencieusement de contrôler.
    expect(codesDuServeur().size).toBeGreaterThan(10);
    expect(codesDeLaTable().size).toBeGreaterThan(10);
  });

  it('couvre tout code que les deux routes peuvent rendre', () => {
    const manquants = [...codesDuServeur()].filter((code) => !codesDeLaTable().has(code)).sort();

    expect(manquants).toEqual([]);
  });

  it('reconnaît nommément les trois issues du module de checkout', () => {
    // Celles-ci ne s'écrivent pas dans les routes : elles remontent de
    // `creerVenteChariow`, relayées telles quelles. Un jour où quelqu'un
    // restreindrait la lecture aux deux routes, elles disparaîtraient du
    // décompte sans que rien ne tombe — et ce sont les seules que le payeur
    // rencontre quand la boutique refuse.
    const codes = codesDuServeur();

    for (const attendu of ['SAISIE_REFUSEE', 'CHECKOUT_IMPOSSIBLE', 'CHECKOUT_INCOMPLET']) {
      expect(codes, `${attendu} doit être lu depuis les sources`).toContain(attendu);
    }
  });
});
