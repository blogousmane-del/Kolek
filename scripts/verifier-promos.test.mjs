import { describe, expect, it } from 'vitest';

import { comparer } from './verifier-promos.mjs';

/**
 * Deux catalogues de codes, un seul pourcentage vrai.
 *
 * `comparer` est pure : elle ne parle ni à la base ni à Chariow. C'est ce qui
 * permet de la tester sans clé d'API — et un contrôle qui exige la production
 * pour être vérifié n'est vérifié par personne.
 */

describe('comparaison des catalogues de remises', () => {
  it('se tait quand les deux côtés disent la même chose', () => {
    expect(
      comparer([{ code: 'LANCEMENT20', remise_pct: 20 }], [{ code: 'LANCEMENT20', percent: 20 }]),
    ).toEqual([]);
  });

  it('signale un code que Kolek promet et que Chariow ignore', () => {
    // Le cas qui coûte le plus cher : le collecteur voit -20 % dans
    // l'application, et Chariow lui débite le prix plein.
    expect(comparer([{ code: 'PILOTE50', remise_pct: 50 }], [])).toEqual([
      { code: 'PILOTE50', genre: 'absent', interne: 50 },
    ]);
  });

  it('signale un pourcentage qui ne correspond pas', () => {
    expect(
      comparer([{ code: 'PILOTE50', remise_pct: 50 }], [{ code: 'PILOTE50', percent: 40 }]),
    ).toEqual([{ code: 'PILOTE50', genre: 'divergent', interne: 50, distant: 40 }]);
  });

  it('signale un code qui n’existe que chez Chariow', () => {
    // Kolek ne l'enverra jamais, mais la page de paiement est hébergée : un code
    // qui traîne chez eux réduit un prix que personne ici n'a consenti.
    expect(comparer([], [{ code: 'VIEUXCODE', percent: 90 }])).toEqual([
      { code: 'VIEUXCODE', genre: 'inconnu', distant: 90 },
    ]);
  });

  it('ne se laisse pas troubler par la casse ni par l’ordre', () => {
    // `codes_promo_code_check` impose des majuscules côté Kolek ; rien ne
    // l'impose chez Chariow. Une divergence de casse serait une fausse alerte,
    // et un contrôle qui crie pour rien finit par n'être plus lu.
    expect(
      comparer(
        [
          { code: 'B', remise_pct: 10 },
          { code: 'A', remise_pct: 20 },
        ],
        [
          { code: 'a', percent: 20 },
          { code: 'b', percent: 10 },
        ],
      ),
    ).toEqual([]);
  });

  it('compare des nombres, jamais des chaînes', () => {
    // PostgREST rend `smallint` en nombre, mais Chariow rend son pourcentage en
    // chaîne selon les versions. Sans la conversion, « 20 » et 20 seraient
    // différents et chaque code se signalerait comme divergent — le contrôle
    // crierait tout le temps, donc plus personne ne l'écouterait.
    expect(
      comparer([{ code: 'LANCEMENT20', remise_pct: 20 }], [{ code: 'LANCEMENT20', percent: '20' }]),
    ).toEqual([]);
  });

  it('rend les trois genres ensemble quand les trois arrivent', () => {
    // Une exécution réelle ne trouve pas un seul défaut à la fois. Sans cette
    // mesure, une boucle qui s'arrêterait au premier écart passerait les six
    // tests précédents et cacherait tout le reste au moment où ça compte.
    const divergences = comparer(
      [
        { code: 'ABSENT', remise_pct: 30 },
        { code: 'DIVERGENT', remise_pct: 30 },
        { code: 'JUSTE', remise_pct: 10 },
      ],
      [
        { code: 'DIVERGENT', percent: 25 },
        { code: 'JUSTE', percent: 10 },
        { code: 'INCONNU', percent: 90 },
      ],
    );

    expect(divergences.map((d) => `${d.code}:${d.genre}`).sort()).toEqual([
      'ABSENT:absent',
      'DIVERGENT:divergent',
      'INCONNU:inconnu',
    ]);
  });
});
