import { describe, expect, it } from 'vitest';

import { createHmac } from 'node:crypto';

import {
  lireProduits,
  mapperStatut,
  montantCoherent,
  resoudreTelephone,
  signatureChariowValide,
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

/**
 * La signature des « Pulses », mesurée contre une implémentation indépendante.
 *
 * `signer` ci-dessous n'appelle pas le code testé : elle refait le calcul avec
 * `node:crypto`, là où la fonction passe par `crypto.subtle`. Un test qui
 * fabriquerait son attendu avec `signatureChariowValide` elle-même passerait
 * quelle que soit la formule — y compris fausse. C'est le défaut qui a coûté la
 * panne du drainage le 2026-09-04 : le test présentait à la fonction la valeur
 * que la fonction lisait elle-même.
 *
 * Le format est celui que Chariow documente : `sha256=` suivi de 64 caractères
 * hexadécimaux minuscules, HMAC-SHA256 du corps brut.
 */
describe('la signature des Pulses de Chariow', () => {
  const SECRET = 'whsec_pas_un_vrai_secret_de_production';
  const CORPS = '{"data":{"id":"sale_1","custom_metadata":{"collecteurId":"c-1"}}}';

  const signer = (corps: string, secret = SECRET) =>
    `sha256=${createHmac('sha256', secret).update(corps, 'utf8').digest('hex')}`;

  it('accepte la signature que Chariow poserait', async () => {
    expect(await signatureChariowValide(signer(CORPS), CORPS, SECRET)).toBe(true);
  });

  it('refuse un corps modifié d’un seul caractère', async () => {
    // Le cas qui justifie la signature. Un tiers qui a découvert l'URL — donc
    // le secret qu'elle porte — peut poster ce qu'il veut ; sans ceci, rien ne
    // distingue son corps de celui du fournisseur.
    const falsifie = CORPS.replace('"c-1"', '"c-2"');

    expect(falsifie).not.toBe(CORPS);
    expect(await signatureChariowValide(signer(CORPS), falsifie, SECRET)).toBe(false);
  });

  it('refuse une signature calculée avec un autre secret', async () => {
    expect(await signatureChariowValide(signer(CORPS, 'whsec_autre'), CORPS, SECRET)).toBe(false);
  });

  it('refuse tout quand le secret n’est pas posé', async () => {
    // Fail-closed : une fonction déployée avant son secret ne s'ouvre à
    // personne. Le contraire — s'ouvrir en l'absence de secret — est l'erreur
    // qui rend une porte invisible.
    expect(await signatureChariowValide(signer(CORPS), CORPS, '')).toBe(false);
    expect(await signatureChariowValide(null, CORPS, '')).toBe(false);
  });

  it('refuse un en-tête absent, vide, ou sans le préfixe', async () => {
    const nu = signer(CORPS).slice('sha256='.length);

    expect(await signatureChariowValide(null, CORPS, SECRET)).toBe(false);
    expect(await signatureChariowValide('', CORPS, SECRET)).toBe(false);
    // Le préfixe fait partie de ce qui est comparé : l'accepter sans lui
    // reviendrait à accepter deux formats, dont un que le fournisseur n'émet
    // pas — et un format toléré est un format que personne ne vérifie.
    expect(await signatureChariowValide(nu, CORPS, SECRET)).toBe(false);
  });

  it('signe les octets reçus, pas l’objet analysé', async () => {
    // Chariow sérialise en JSON compact, barres obliques échappées. Re-sérialiser
    // l'objet analysé donne d'autres octets — donc une autre empreinte, et une
    // porte fermée en permanence. Ce test dit laquelle des deux formes signe.
    const recu = '{"url":"https:\\/\\/exemple.test\\/a","nom":"caf\\u00e9"}';
    const reserialise = JSON.stringify(JSON.parse(recu));

    expect(reserialise).not.toBe(recu);
    expect(await signatureChariowValide(signer(recu), recu, SECRET)).toBe(true);
    expect(await signatureChariowValide(signer(recu), reserialise, SECRET)).toBe(false);
  });
});
