import { describe, expect, it } from 'vitest';

import {
  PLANCHER_DEFAUT_MS,
  PLANCHER_MAX_MS,
  plancherDepuis,
  resteAAttendre,
  tenirPlancher,
} from '../functions/_shared/plancher.ts';

/**
 * Le plancher de temps de réponse.
 *
 * ## Le défaut qu'il répare
 *
 * `mot-de-passe-oublie` est écrit tout entier autour d'une règle : « la réponse
 * ne dépend jamais de l'existence du compte ». Le statut est le même, le corps
 * est le même, la borne rend le nominal plutôt qu'un 429, un échec d'envoi rend
 * le nominal aussi. Tout cela est juste — et laisse passer la seule chose que
 * le fichier ne regardait pas : **la durée**.
 *
 * Adresse inconnue : `generateLink` échoue, on répond. Adresse connue :
 * `generateLink` réussit, **puis on appelle la passerelle de courriel** — un
 * aller-retour HTTPS vers un tiers. Plusieurs centaines de millisecondes
 * séparent les deux, et cet écart se chronomètre depuis n'importe quel
 * navigateur. L'annuaire des collecteurs que le corps de réponse refusait de
 * livrer, l'horloge le livrait.
 *
 * Troisième chemin, plus rapide encore : la borne mordue, qui rend le nominal
 * juste après le RPC. Atteindre le refus se lisait donc au chronomètre, ce que
 * le commentaire du fichier voulait précisément éviter.
 *
 * ## Pourquoi un module à part, et pur
 *
 * Même raison que `cors.ts` et `debit.ts`. Un plancher mal calculé ne casse
 * rien de visible : la fonction répond, la réinitialisation marche, les tests
 * de bout en bout passent. Seule la fuite revient, en silence. Ce qui n'est pas
 * testable finit par être faux.
 */

describe('resteAAttendre', () => {
  it('rend ce qui manque quand le travail a été plus rapide que le plancher', () => {
    expect(resteAAttendre(1000, 1200, 900)).toBe(700);
  });

  it('rend zéro quand le plancher est déjà dépassé', () => {
    // Le plancher retient, il ne ralentit pas au-delà. Un envoi de courriel
    // lent doit répondre dès qu'il a fini.
    expect(resteAAttendre(1000, 2500, 900)).toBe(0);
  });

  it('rend zéro pile sur le plancher', () => {
    expect(resteAAttendre(1000, 1900, 900)).toBe(0);
  });

  it('ne rend jamais plus que le plancher, même si l’horloge recule', () => {
    // `Date.now()` peut reculer — ajustement NTP, veille de la machine. Sans
    // borne haute, la fonction attendrait l'écart de l'horloge en plus du
    // plancher, et une requête resterait pendue plusieurs secondes.
    expect(resteAAttendre(5000, 1000, 900)).toBe(900);
  });

  it('traite un plancher nul ou négatif comme désactivé', () => {
    expect(resteAAttendre(1000, 1000, 0)).toBe(0);
    expect(resteAAttendre(1000, 1000, -50)).toBe(0);
  });
});

describe('plancherDepuis', () => {
  it('rend le défaut quand la variable est absente', () => {
    expect(plancherDepuis({})).toBe(PLANCHER_DEFAUT_MS);
  });

  it('lit une valeur entière', () => {
    expect(plancherDepuis({ PLANCHER_REPONSE_MS: '1500' })).toBe(1500);
  });

  it('rend le défaut sur une valeur illisible plutôt que zéro', () => {
    // Une faute de frappe dans le tableau de bord ne doit pas désactiver la
    // mitigation en silence. Retomber sur le défaut est le comportement sûr.
    expect(plancherDepuis({ PLANCHER_REPONSE_MS: 'mille' })).toBe(PLANCHER_DEFAUT_MS);
    expect(plancherDepuis({ PLANCHER_REPONSE_MS: '' })).toBe(PLANCHER_DEFAUT_MS);
  });

  it('accepte zéro, écrit explicitement, pour les tests', () => {
    // Distinct de l'illisible : « 0 » est une intention, « mille » est une
    // erreur. Sans cette porte, aucun test de bout en bout ne pourrait tourner
    // sans attendre le plancher à chaque appel.
    expect(plancherDepuis({ PLANCHER_REPONSE_MS: '0' })).toBe(0);
  });

  it('refuse une valeur négative', () => {
    expect(plancherDepuis({ PLANCHER_REPONSE_MS: '-1' })).toBe(PLANCHER_DEFAUT_MS);
  });

  it('plafonne une valeur absurde', () => {
    // Un zéro de trop tiendrait la requête ouverte jusqu'au délai de la
    // plateforme, et le formulaire paraîtrait cassé.
    expect(plancherDepuis({ PLANCHER_REPONSE_MS: '600000' })).toBe(PLANCHER_MAX_MS);
  });
});

describe('tenirPlancher', () => {
  it('demande exactement le repos qui manque', async () => {
    const demandes: number[] = [];
    await tenirPlancher(1000, 900, {
      maintenant: () => 1200,
      dormir: async (ms) => {
        demandes.push(ms);
      },
    });
    expect(demandes).toEqual([700]);
  });

  it('ne dort pas du tout quand le plancher est atteint', async () => {
    const demandes: number[] = [];
    await tenirPlancher(1000, 900, {
      maintenant: () => 3000,
      dormir: async (ms) => {
        demandes.push(ms);
      },
    });
    expect(demandes).toEqual([]);
  });

  it('fait converger deux chemins de coûts très différents', async () => {
    // Le test qui dit l'intention. Chemin rapide : 20 ms de travail. Chemin
    // lent : 800 ms, dont l'appel à la passerelle. Après le plancher, les deux
    // rendent la main au même instant — c'est toute la mitigation.
    const sortie = async (coutMs: number) => {
      let horloge = 1000;
      const debut = horloge;
      horloge += coutMs;
      await tenirPlancher(debut, 900, {
        maintenant: () => horloge,
        dormir: async (ms) => {
          horloge += ms;
        },
      });
      return horloge - debut;
    };

    expect(await sortie(20)).toBe(900);
    expect(await sortie(800)).toBe(900);
  });
});
