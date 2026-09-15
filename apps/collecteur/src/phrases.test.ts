import { describe, expect, it } from 'vitest';

import { PHRASES, PHRASES_REFUS, phraseEcriture, phraseRefus } from './phrases';

describe('la table unique des phrases', () => {
  it('traduit un code connu', () => {
    expect(phraseEcriture('CARTE_CLOTUREE')).toEqual({
      code: 'CARTE_CLOTUREE',
      message: 'Cette carte est clôturée. Ouvre une nouvelle carte.',
    });
  });

  it('garde le code inconnu, avec la phrase générique', () => {
    expect(phraseEcriture('RIEN_DE_TEL')).toEqual({ code: 'RIEN_DE_TEL', message: PHRASES.INCONNU });
  });

  it('dit enfin DATE_INVALIDE, qui tombait sur « Réessaie » (écart 2)', () => {
    expect(phraseEcriture('DATE_INVALIDE').message).not.toMatch(/Réessaie/);
  });
});

describe('les phrases des refus, au passé (§8.4)', () => {
  it.each([
    'CARTE_INTROUVABLE',
    'CARTE_CLOTUREE',
    'CYCLE_COMPLET',
    'MONTANT_INVALIDE',
    'DATE_INVALIDE',
    'BORNE',
    'BORNE_MONTANT',
    'CONFLIT_UNIQUE',
    'PARENT_ABSENT',
    'PARENT_REFUSE',
    'ABONNEMENT_INACTIF',
    'DROIT_REFUSE',
    'DOUBLON_INVERIFIABLE',
    'INCONNU',
  ])('ont une phrase pour %s', (motif) => {
    expect(PHRASES_REFUS[motif]).toBeTruthy();
  });

  it('dit la carte clôturée comme la spec l’écrit', () => {
    expect(phraseRefus('CARTE_CLOTUREE')).toBe('La carte avait été clôturée.');
  });

  it('ne laisse jamais un motif sans phrase', () => {
    expect(phraseRefus('MOTIF_FUTUR')).toBe('Le serveur a refusé cette opération.');
    expect(phraseRefus('INCONNU')).toBe(PHRASES_REFUS.INCONNU);
  });
});
