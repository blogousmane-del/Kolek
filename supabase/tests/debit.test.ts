import { describe, expect, it } from 'vitest';

import { empreinteRequete } from '../functions/_shared/debit.ts';

/**
 * L'empreinte qui sert de clé au compteur.
 *
 * Elle est extraite dans un module pur pour la raison établie par le défaut
 * CORS du 2026-08-20 : ce qui n'est pas testable finit par être faux. Ici,
 * « faux » veut dire soit une borne qui ne borne personne — toutes les requêtes
 * partagent la même clé —, soit une borne qui range chaque requête sous une clé
 * distincte et ne refuse jamais rien. Dans les deux cas la fonction répond
 * normalement, et personne ne s'aperçoit de rien.
 */

function entetes(valeurs: Record<string, string>): Headers {
  return new Headers(valeurs);
}

describe('empreinteRequete', () => {
  it('range deux appels de la même IP sur la même route sous la même clé', () => {
    const a = empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.2' }));
    const b = empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.2' }));
    expect(a).toBe(b);
  });

  it('sépare deux routes de la même IP', () => {
    // Sans cela, trois demandes de réinitialisation épuiseraient le quota de
    // dépôt de demandes, et l'un des deux formulaires cesserait de répondre
    // sans qu'on comprenne pourquoi.
    const depot = empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.2' }));
    const oubli = empreinteRequete('mot-de-passe-oublie', entetes({ 'x-forwarded-for': '41.66.1.2' }));
    expect(depot).not.toBe(oubli);
  });

  it('sépare deux IP', () => {
    const a = empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.2' }));
    const b = empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.3' }));
    expect(a).not.toBe(b);
  });

  it('ne retient que le premier saut de x-forwarded-for', () => {
    // Les sauts suivants sont ajoutés par les relais traversés : les inclure
    // ferait varier la clé au gré du chemin réseau, et un même visiteur
    // repartirait à zéro à chaque changement de route.
    const cle = empreinteRequete(
      'demander-ouverture',
      entetes({ 'x-forwarded-for': '41.66.1.2, 10.0.0.1, 10.0.0.2' }),
    );
    expect(cle).toBe(
      empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.2' })),
    );
  });

  it('retombe sur cf-connecting-ip quand x-forwarded-for manque', () => {
    const cle = empreinteRequete('demander-ouverture', entetes({ 'cf-connecting-ip': '41.66.1.2' }));
    expect(cle).toBe(
      empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': '41.66.1.2' })),
    );
  });

  it('rend une clé stable et non vide quand aucun en-tête ne porte d’IP', () => {
    // Le cas où la borne se referme sur tout le monde à la fois. C'est le bon
    // sens du défaut : sans IP, on ne peut pas distinguer les appelants, et
    // laisser passer serait offrir un contournement en retirant un en-tête.
    const cle = empreinteRequete('demander-ouverture', entetes({}));
    expect(cle).toBe('demander-ouverture:inconnue');
  });

  it('borne la longueur de la clé', () => {
    // La colonne `empreinte` porte un `check` à 200 caractères. Un en-tête
    // forgé de dix kilo-octets ferait lever `23514` à chaque appel, et la
    // fonction publique répondrait 500 au lieu de borner.
    const long = 'x'.repeat(5000);
    const cle = empreinteRequete('demander-ouverture', entetes({ 'x-forwarded-for': long }));
    expect(cle.length).toBeLessThanOrEqual(200);
  });
});
