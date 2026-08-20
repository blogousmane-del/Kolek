import { describe, expect, it, vi } from 'vitest';

import {
  compterOccurrences,
  empreinteSha1,
  PREFIXE_LONGUEUR,
  verifierFuite,
} from '../functions/_shared/hibp';

/**
 * Le refus des mots de passe divulgués.
 *
 * Ce module existe parce que `auth.admin.createUser` ne fait tourner aucune
 * règle de mot de passe (supabase/auth#1959) : le réglage `Prevent use of
 * leaked passwords`, pourtant actif sur le projet, ne couvre pas le seul chemin
 * par lequel un compte naît dans Kolek.
 *
 * `fetch` est injecté partout ici. Un test qui appellerait le vrai service
 * serait lent, dépendant du réseau, et surtout incapable de couvrir les cas qui
 * comptent — service en panne, réponse tronquée, rembourrage.
 */

/** Empreinte SHA-1 connue de `password123`, en majuscules. */
const EMPREINTE_PASSWORD123 = 'CBFDAC6008F9CAB4083784CBD1874F76618D2A97';

function reponse(corps: string, ok = true, statut = 200): Response {
  return { ok, status: statut, text: async () => corps } as Response;
}

describe('empreinte', () => {
  it('rend le SHA-1 en hexadécimal majuscule', async () => {
    // Valeur de référence : c'est celle que le service attend, et une casse
    // minuscule ferait échouer toutes les comparaisons en silence.
    expect(await empreinteSha1('password123')).toBe(EMPREINTE_PASSWORD123);
  });

  it('rend toujours 40 caractères', async () => {
    for (const entree of ['', 'a', 'Kouamé Assi ✓', 'x'.repeat(500)]) {
      expect(await empreinteSha1(entree)).toMatch(/^[0-9A-F]{40}$/);
    }
  });
});

describe('lecture de la réponse du service', () => {
  const suffixe = EMPREINTE_PASSWORD123.slice(PREFIXE_LONGUEUR);

  it('trouve le suffixe et rend son compte', () => {
    expect(compterOccurrences(`${suffixe}:2918953`, suffixe)).toBe(2918953);
  });

  it('rend 0 quand le suffixe est absent', () => {
    expect(compterOccurrences('0000000000000000000000000000000000A:5', suffixe)).toBe(0);
  });

  it('traite le rembourrage comme une absence', () => {
    // `Add-Padding: true` fait insérer des entrées de compte nul. Les prendre
    // pour une fuite refuserait des mots de passe parfaitement sains.
    expect(compterOccurrences(`${suffixe}:0`, suffixe)).toBe(0);
  });

  it('supporte les fins de ligne CRLF du service', () => {
    const corps = `AAAA:1\r\n${suffixe}:42\r\nBBBB:3`;
    expect(compterOccurrences(corps, suffixe)).toBe(42);
  });

  it('ignore la casse du suffixe', () => {
    expect(compterOccurrences(`${suffixe.toLowerCase()}:7`, suffixe)).toBe(7);
  });

  it('ignore les lignes malformées sans planter', () => {
    expect(compterOccurrences(`bruit\n\n${suffixe}:9`, suffixe)).toBe(9);
    expect(compterOccurrences(`${suffixe}:pas-un-nombre`, suffixe)).toBe(0);
  });
});

describe('verdict', () => {
  it('refuse un mot de passe présent dans une fuite', async () => {
    const recuperer = vi.fn(async () =>
      reponse(`${EMPREINTE_PASSWORD123.slice(PREFIXE_LONGUEUR)}:2918953`),
    );

    const verdict = await verifierFuite('password123', recuperer as unknown as typeof fetch);

    expect(verdict).toEqual({ etat: 'compromis', occurrences: 2918953 });
  });

  it('accepte un mot de passe absent des fuites', async () => {
    const recuperer = vi.fn(async () => reponse('0000000000000000000000000000000000A:5'));

    const verdict = await verifierFuite('Wq7!zPk2Rn4vTx9C', recuperer as unknown as typeof fetch);

    expect(verdict).toEqual({ etat: 'sain' });
  });

  it('n’envoie que les cinq premiers caractères de l’empreinte', async () => {
    // Le point entier du k-anonymat. Si cette assertion tombe, le mot de passe
    // devient identifiable par le service.
    const recuperer = vi.fn(async () => reponse(''));

    await verifierFuite('password123', recuperer as unknown as typeof fetch);

    const [url, options] = recuperer.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${EMPREINTE_PASSWORD123.slice(0, 5)}`);
    expect(url).not.toContain(EMPREINTE_PASSWORD123);
    expect(url).not.toContain(EMPREINTE_PASSWORD123.slice(5));
    expect(url).not.toContain('password123');
    expect((options.headers as Record<string, string>)['Add-Padding']).toBe('true');
  });

  it('rend « indisponible » sur une erreur HTTP, sans lever', async () => {
    const recuperer = vi.fn(async () => reponse('', false, 503));

    const verdict = await verifierFuite('peu importe', recuperer as unknown as typeof fetch);

    expect(verdict).toEqual({ etat: 'indisponible', raison: 'HTTP_503' });
  });

  it('rend « indisponible » quand le réseau échoue, sans lever', async () => {
    // La fonction appelante laisse passer la création dans ce cas ; elle ne
    // pourrait pas le faire si ce chemin levait.
    const recuperer = vi.fn(async () => {
      throw Object.assign(new Error('délai dépassé'), { name: 'TimeoutError' });
    });

    const verdict = await verifierFuite('peu importe', recuperer as unknown as typeof fetch);

    expect(verdict).toEqual({ etat: 'indisponible', raison: 'TimeoutError' });
  });

  it('ne consulte pas le service pour un mot de passe vide', async () => {
    const recuperer = vi.fn(async () => reponse(''));

    const verdict = await verifierFuite('', recuperer as unknown as typeof fetch);

    expect(verdict).toEqual({ etat: 'indisponible', raison: 'MOT_DE_PASSE_VIDE' });
    expect(recuperer).not.toHaveBeenCalled();
  });
});
