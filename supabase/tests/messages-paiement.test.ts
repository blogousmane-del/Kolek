import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * Les phrases du paiement ne doivent pas prendre de retard sur les refus.
 *
 * Ni l'application ni la vitrine ne peuvent afficher le message du serveur tel
 * quel : `supabase-js` le remplace par « Edge Function returned a non-2xx status
 * code », et la vitrine n'appelle pas `supabase-js` du tout. Chacune lit donc le
 * corps et traduit le code court qu'il porte, par une table à elle.
 *
 * Un code sans phrase ne casse rien : il s'affiche « Envoi impossible » ou
 * « Paiement impossible ». C'est précisément le danger. Ces phrases ne disent ni
 * ce qui s'est passé ni quoi faire, elles ont l'air d'une panne alors que la
 * correction est souvent dans la saisie, et le retard ne se voit qu'au moment où
 * quelqu'un le rencontre — c'est-à-dire au marché.
 *
 * ## Pourquoi ici, et pas dans les suites d'application
 *
 * Le contrôle traverse deux mondes : le serveur qui refuse, le client qui
 * explique. Écrit dans `apps/collecteur`, il obligeait ce paquet à embarquer les
 * types Node pour lire un fichier — une dépendance de construction ajoutée à une
 * application livrée, pour un test. Cette suite-ci lit déjà des sources
 * (`avis-drainage.test.ts`), et le fait sans rien changer à ce qui est livré.
 */

interface Catalogue {
  quoi: string;
  /** Le fichier qui porte la table `MESSAGES`. */
  table: string;
  /** Les fichiers qui peuvent rendre un code à cette table-là. */
  sources: string[];
}

const CHECKOUT = 'supabase/functions/_shared/depot-chariow.ts';

const CATALOGUES: Catalogue[] = [
  {
    quoi: 'le carnet du collecteur',
    table: 'apps/collecteur/src/abonnement.ts',
    // Les deux routes, et le module partagé dont `abonnement-payer` relaie
    // l'issue telle quelle — `return reponse({ erreur: issue.erreur }, …)`.
    sources: [
      'supabase/functions/abonnement-payer/index.ts',
      'supabase/functions/abonnement-verifier/index.ts',
      CHECKOUT,
    ],
  },
  {
    quoi: 'le formulaire de la vitrine',
    table: 'apps/site/src/vitrine/demande.ts',
    // La route, la validation dont elle relaie le verdict, et le même module de
    // checkout : depuis l'amendement « payer vaut accord », une demande à palier
    // payant ouvre une vente.
    sources: [
      'supabase/functions/demander-ouverture/index.ts',
      'supabase/functions/_shared/valider-demande.ts',
      CHECKOUT,
    ],
  },
];

function codesDuServeur(sources: string[]): Set<string> {
  const codes = new Set<string>();
  for (const chemin of sources) {
    for (const trouve of readFileSync(chemin, 'utf8').matchAll(/erreur: '([A-Z_]+)'/g)) {
      codes.add(trouve[1] as string);
    }
  }
  return codes;
}

function codesDeLaTable(table: string): Set<string> {
  const source = readFileSync(table, 'utf8');
  const debut = source.indexOf('const MESSAGES: Record<string, string> = {');
  const fin = source.indexOf('\n};', debut);
  expect(debut, `la table MESSAGES de ${table} a changé de forme`).toBeGreaterThan(-1);
  expect(fin, `la fin de la table MESSAGES de ${table} est introuvable`).toBeGreaterThan(debut);

  const bloc = source.slice(debut, fin);
  return new Set([...bloc.matchAll(/^\s{2}([A-Z_]+):/gm)].map((t) => t[1] as string));
}

describe.each(CATALOGUES)('les phrases de $quoi', ({ table, sources }) => {
  it('lit bien quelque chose des deux côtés', () => {
    // La sonde d'abord. Un motif qui ne trouverait rien ferait passer le test
    // suivant sans rien mesurer, et c'est la façon la plus courante dont un
    // contrôle par lecture de source cesse silencieusement de contrôler.
    expect(codesDuServeur(sources).size).toBeGreaterThan(10);
    expect(codesDeLaTable(table).size).toBeGreaterThan(10);
  });

  it('couvrent tout code que le serveur peut rendre', () => {
    const dites = codesDeLaTable(table);
    const manquants = [...codesDuServeur(sources)].filter((code) => !dites.has(code)).sort();

    expect(manquants).toEqual([]);
  });

  it('comprennent les trois issues du module de checkout', () => {
    // Celles-ci ne s'écrivent dans aucune route : elles remontent de
    // `creerVenteChariow`, relayées telles quelles. Le jour où quelqu'un
    // restreindrait la lecture aux routes, elles disparaîtraient du décompte
    // sans que rien ne tombe — et ce sont les seules que le payeur rencontre
    // quand la boutique refuse.
    const codes = codesDuServeur(sources);

    for (const attendu of ['SAISIE_REFUSEE', 'CHECKOUT_IMPOSSIBLE', 'CHECKOUT_INCOMPLET']) {
      expect(codes, `${attendu} doit être lu depuis les sources`).toContain(attendu);
    }
  });
});

describe('la longueur minimale du mot de passe', () => {
  /**
   * Un seuil, quatre endroits : la règle serveur, et trois textes qui
   * l'annoncent à quelqu'un qui tape. Le jour où le seuil monte, un texte oublié
   * promet moins que ce que le serveur exige — et la personne se voit refuser un
   * mot de passe qu'on venait de lui dire acceptable, au moment précis où elle
   * s'apprête à payer.
   */

  const SEUIL = 'supabase/functions/_shared/valider-collecteur.ts';
  const ANNONCES = [
    'apps/site/src/vitrine/demande.ts',
    'apps/site/src/vitrine/Inscription.tsx',
    'apps/collecteur/src/motDePasse.ts',
  ];

  function seuil(): number {
    const trouve = /export const LONGUEUR_MOT_DE_PASSE = (\d+);/.exec(readFileSync(SEUIL, 'utf8'));
    expect(trouve, 'LONGUEUR_MOT_DE_PASSE a changé de forme').not.toBeNull();
    return Number((trouve as RegExpExecArray)[1]);
  }

  it('se lit dans la source, et vaut un nombre plausible', () => {
    expect(seuil()).toBeGreaterThanOrEqual(8);
  });

  it('est le nombre annoncé partout où on l’annonce', () => {
    const attendu = String(seuil());

    for (const chemin of ANNONCES) {
      const source = readFileSync(chemin, 'utf8');
      const nombres = [...source.matchAll(/(?:au moins |minLength=\{)(\d+)/g)].map((t) => t[1]);

      expect(nombres.length, `${chemin} n'annonce aucune longueur`).toBeGreaterThan(0);
      for (const nombre of nombres) {
        expect(nombre, `${chemin} annonce ${nombre} là où le serveur exige ${attendu}`).toBe(
          attendu,
        );
      }
    }
  });
});
