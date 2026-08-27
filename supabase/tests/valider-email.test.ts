import { describe, expect, it } from 'vitest';

import { EMAIL_MAX, validerEmail } from '../functions/_shared/valider-email.ts';

/**
 * La règle d'adresse, une seule pour tout le produit.
 *
 * Deux appelants s'en servent — le dépôt de demande et la réinitialisation de
 * mot de passe. Deux règles qui divergeraient laisseraient passer d'un côté ce
 * que l'autre refuse : un prospect déposerait une adresse que l'écran d'oubli
 * refuserait ensuite de reconnaître.
 */

describe('ce qui passe', () => {
  it('accepte une adresse ordinaire', () => {
    const r = validerEmail('mariam@example.ci');
    expect(r).toEqual({ ok: true, email: 'mariam@example.ci' });
  });

  it('rabat en minuscules et retire les espaces', () => {
    // Ce que rend cette fonction est ce qui sera écrit en base, et l'index
    // unique porte dessus. Sans cette normalisation, il suffirait d'une
    // majuscule pour redéposer une demande.
    const r = validerEmail('  Mariam@Example.CI  ');
    expect(r).toEqual({ ok: true, email: 'mariam@example.ci' });
  });

  it('accepte un sous-domaine et un signe plus', () => {
    // Le `+` est le seul moyen dont dispose quelqu'un pour se créer une adresse
    // dédiée sans ouvrir une boîte. Le refuser fermerait la porte à des gens de
    // bonne foi.
    expect(validerEmail('mariam+kolek@mail.example.ci').ok).toBe(true);
  });
});

describe('ce qui est refusé', () => {
  it('refuse l’absence', () => {
    expect(validerEmail(undefined)).toEqual({ ok: false, erreur: 'EMAIL_MANQUANT' });
    expect(validerEmail('')).toEqual({ ok: false, erreur: 'EMAIL_MANQUANT' });
    expect(validerEmail('   ')).toEqual({ ok: false, erreur: 'EMAIL_MANQUANT' });
  });

  it('refuse ce qui n’est pas une chaîne', () => {
    // La fonction lit un corps JSON venu d'Internet : un nombre, un tableau ou
    // un objet y arrivent aussi bien qu'une chaîne.
    expect(validerEmail(42)).toEqual({ ok: false, erreur: 'EMAIL_MANQUANT' });
    expect(validerEmail({ email: 'a@b.ci' })).toEqual({ ok: false, erreur: 'EMAIL_MANQUANT' });
  });

  it('refuse une adresse sans arobase, sans domaine ou sans point', () => {
    expect(validerEmail('mariam')).toEqual({ ok: false, erreur: 'EMAIL_INVALIDE' });
    expect(validerEmail('mariam@')).toEqual({ ok: false, erreur: 'EMAIL_INVALIDE' });
    expect(validerEmail('@example.ci')).toEqual({ ok: false, erreur: 'EMAIL_INVALIDE' });
    expect(validerEmail('mariam@example')).toEqual({ ok: false, erreur: 'EMAIL_INVALIDE' });
  });

  it('refuse une adresse qui contient un espace', () => {
    expect(validerEmail('mar iam@example.ci')).toEqual({ ok: false, erreur: 'EMAIL_INVALIDE' });
  });

  it('refuse deux adresses collées', () => {
    expect(validerEmail('a@b.ci,c@d.ci')).toEqual({ ok: false, erreur: 'EMAIL_INVALIDE' });
  });

  it('refuse plus long que la borne, avant de juger la forme', () => {
    // L'ordre est une décision : celui qui a collé un paragraphe apprend que
    // c'est trop long, pas que « ce n'est pas une adresse ».
    const trop = `${'x'.repeat(EMAIL_MAX)}@example.ci`;
    expect(validerEmail(trop)).toEqual({ ok: false, erreur: 'EMAIL_TROP_LONG' });
  });

  it('mesure la longueur après normalisation', () => {
    const juste = `${'x'.repeat(EMAIL_MAX - '@example.ci'.length)}@example.ci`;
    expect(validerEmail(`  ${juste}  `).ok).toBe(true);
  });
});
