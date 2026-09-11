import { describe, expect, it } from 'vitest';

import {
  EMPREINTE_MAX,
  PULSE_FENETRE_SECONDES,
  PULSE_PLAFOND,
  empreinteRequete,
  empreintePulse,
} from '../functions/_shared/debit.ts';

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

/**
 * L'empreinte sous laquelle `chariow-webhook` compte les Pulses.
 *
 * ## Pourquoi par vente
 *
 * La signature de Chariow ne porte ni horodatage ni nonce : un Pulse capturé
 * se rejoue tel quel, et chaque rejeu fait lire une vente chez Chariow sur
 * notre quota. Un rejeu vise **toujours la même vente** — l'attaquant ne peut
 * signer que ce qu'il a capturé. Une vague de paiements légitimes, elle, touche
 * **beaucoup de ventes**. Compter par vente borne le premier sans jamais
 * toucher la seconde ; une borne globale aurait fait l'inverse.
 *
 * Voir `Docs/plans/2026-09-11-webhook-chariow-borne.md`.
 */

const RIEN = { vente: null, collecteur: null, demande: null };

describe('l’empreinte d’un Pulse', () => {
  it('compte par vente quand la vente est nommée', () => {
    expect(empreintePulse({ ...RIEN, vente: 'v_123' })).toBe('chariow-webhook:vente:v_123');
  });

  it('préfère la vente aux métadonnées : c’est elle que le rejeu ne peut pas changer', () => {
    expect(
      empreintePulse({ vente: 'v_123', collecteur: 'c_1', demande: 'd_1' }),
    ).toBe('chariow-webhook:vente:v_123');
  });

  it('retombe sur le collecteur, puis sur la demande', () => {
    expect(empreintePulse({ ...RIEN, collecteur: 'c_1', demande: 'd_1' })).toBe(
      'chariow-webhook:collecteur:c_1',
    );
    expect(empreintePulse({ ...RIEN, demande: 'd_1' })).toBe('chariow-webhook:demande:d_1');
  });

  it('range sous une seule empreinte les Pulses qui ne nomment rien', () => {
    // Un événement étranger n'a pas de vente à protéger. Les ranger ensemble
    // borne aussi le rejeu d'un Pulse sans identifiant.
    expect(empreintePulse(RIEN)).toBe('chariow-webhook:sans-cible');
  });

  it('distingue deux ventes : c’est tout l’objet de la borne', () => {
    expect(empreintePulse({ ...RIEN, vente: 'v_1' })).not.toBe(
      empreintePulse({ ...RIEN, vente: 'v_2' }),
    );
  });

  it('ne laisse pas une vente se faire passer pour un collecteur', () => {
    // Le genre vient toujours en premier, et vient de nous : un identifiant qui
    // contiendrait « collecteur: » reste rangé sous « vente: ».
    expect(empreintePulse({ ...RIEN, vente: 'collecteur:c_1' })).not.toBe(
      empreintePulse({ ...RIEN, collecteur: 'c_1' }),
    );
  });

  it('tient dans la colonne, même devant un identifiant démesuré', () => {
    // Le `check` de `debit_public.empreinte` refuserait plus long : l'appel au
    // compteur échouerait, et le webhook laisserait passer — c'est son choix
    // en panne. Mieux vaut ne jamais y arriver.
    const empreinte = empreintePulse({ ...RIEN, vente: 'x'.repeat(500) });
    expect(empreinte.length).toBe(EMPREINTE_MAX);
    expect(empreinte.startsWith('chariow-webhook:vente:')).toBe(true);
  });

  it('borne à vingt par heure : six fois ce que Chariow émet pour une vente', () => {
    // Trois événements de succès au plus (`successful`, `settled`,
    // `completed`), plus ses réessais sur nos 500. Changer ces valeurs se fait
    // ici, en connaissance de cause, et nulle part ailleurs.
    expect(PULSE_PLAFOND).toBe(20);
    expect(PULSE_FENETRE_SECONDES).toBe(3600);
  });
});
