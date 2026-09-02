import { describe, expect, it } from 'vitest';

import {
  lireProduits,
  mapperStatut,
  montantCoherent,
  resoudreTelephone,
  secretValide,
} from '../functions/_shared/chariow';

/**
 * Ce fichier existe pour un piège précis, documenté dans `Docs/Chariow.md` §3.3 :
 * **« unpaid » contient « paid »**. Une correspondance de statuts qui teste les
 * succès avant les attentes crédite une vente non payée. Le premier test
 * ci-dessous est le seul qui compte vraiment.
 */

describe('mapperStatut', () => {
  it('rend « en attente » pour unpaid — avant tout test de succès', () => {
    expect(mapperStatut('unpaid')).toBe('en_attente');
    expect(mapperStatut('UNPAID')).toBe('en_attente');
  });

  it('reconnaît settled comme un paiement', () => {
    expect(mapperStatut('settled')).toBe('regle');
    expect(mapperStatut('settle')).toBe('regle');
    expect(mapperStatut('completed')).toBe('regle');
    expect(mapperStatut('paid')).toBe('regle');
    expect(mapperStatut('success')).toBe('regle');
  });

  it('sépare les échecs des abandons', () => {
    expect(mapperStatut('failed')).toBe('echoue');
    expect(mapperStatut('error')).toBe('echoue');
    expect(mapperStatut('cancelled')).toBe('abandonne');
    expect(mapperStatut('refunded')).toBe('abandonne');
    expect(mapperStatut('expired')).toBe('abandonne');
  });

  it('range l’inconnu en attente plutôt qu’en succès', () => {
    expect(mapperStatut('quelque_chose')).toBe('en_attente');
    expect(mapperStatut(null)).toBe('en_attente');
    expect(mapperStatut(42)).toBe('en_attente');
  });
});

describe('montantCoherent', () => {
  it('accepte l’écart nul et les écarts sous 5 %', () => {
    expect(montantCoherent(5000, 5000)).toBe(true);
    expect(montantCoherent(5200, 5000)).toBe(true);
  });

  it('refuse au-delà de la tolérance', () => {
    expect(montantCoherent(5300, 5000)).toBe(false);
    expect(montantCoherent(0, 5000)).toBe(false);
  });

  it('refuse ce qui n’est pas un nombre utilisable', () => {
    expect(montantCoherent(Number.NaN, 5000)).toBe(false);
    expect(montantCoherent(-1, 5000)).toBe(false);
  });
});

describe('resoudreTelephone', () => {
  it('retire le zéro national quand le pays est donné', () => {
    expect(resoudreTelephone({ paysTelephone: 'CI', telephoneLocal: '0700000000' })).toEqual({
      number: '700000000',
      country_code: 'CI',
    });
  });

  it('déduit le pays d’un E.164 ivoirien sans pays fourni', () => {
    expect(resoudreTelephone({ telephone: '+225700000000' })).toEqual({
      number: '700000000',
      country_code: 'CI',
    });
  });

  it('accepte la forme 00 en tête', () => {
    expect(resoudreTelephone({ telephone: '00221771234567' })).toEqual({
      number: '771234567',
      country_code: 'SN',
    });
  });

  it('refuse un numéro français sans pays plutôt que de partir sans', () => {
    expect(resoudreTelephone({ telephone: '+33763627155' })).toBeNull();
  });

  it('accepte ce même numéro dès que le pays accompagne le local', () => {
    expect(resoudreTelephone({ paysTelephone: 'FR', telephoneLocal: '0763627155' })).toEqual({
      number: '763627155',
      country_code: 'FR',
    });
  });

  it('refuse une saisie vide', () => {
    expect(resoudreTelephone({})).toBeNull();
    expect(resoudreTelephone({ paysTelephone: 'CI', telephoneLocal: '12' })).toBeNull();
  });
});

describe('lireProduits', () => {
  it('accepte les trois paliers payants', () => {
    const brut = '{"standard":"prod_a","pro":"prod_b","illimite":"prod_c"}';
    expect(lireProduits(brut)).toEqual({
      standard: 'prod_a',
      pro: 'prod_b',
      illimite: 'prod_c',
    });
  });

  it('lève si un palier payant manque', () => {
    expect(() => lireProduits('{"standard":"prod_a","pro":"prod_b"}')).toThrow(/illimite/);
  });

  it('lève si un palier gratuit y figure — on ne vend pas zéro franc', () => {
    const brut = '{"essai":"prod_z","standard":"a","pro":"b","illimite":"c"}';
    expect(() => lireProduits(brut)).toThrow(/essai/);
  });

  it('lève sur du JSON illisible ou absent', () => {
    expect(() => lireProduits('pas du json')).toThrow();
    expect(() => lireProduits(undefined)).toThrow();
  });
});

describe('secretValide', () => {
  it('accepte le secret exact', async () => {
    expect(await secretValide('s3cr3t', 's3cr3t')).toBe(true);
  });

  it('refuse un préfixe correct de même longueur', async () => {
    expect(await secretValide('s3cr3T', 's3cr3t')).toBe(false);
  });

  it('refuse une longueur différente, un secret vide, un secret absent', async () => {
    expect(await secretValide('s3cr3', 's3cr3t')).toBe(false);
    expect(await secretValide(null, 's3cr3t')).toBe(false);
    expect(await secretValide('s3cr3t', '')).toBe(false);
  });
});
