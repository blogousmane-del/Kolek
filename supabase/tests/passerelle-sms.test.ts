import { describe, expect, it } from 'vitest';

import {
  construireRequete,
  envoyer,
  lireIssue,
  normaliserNumero,
  passerelleDepuis,
  type Identifiants,
} from '../functions/_shared/passerelle-sms.ts';

/**
 * Les passerelles SMS.
 *
 * Ce module dépense de l'argent. Les tests portent donc sur les trois façons
 * d'en perdre : envoyer à un numéro qui n'existe pas, réessayer un échec qui ne
 * passera jamais, et — la pire — croire avoir envoyé sans l'avoir fait.
 */

const TWILIO: Identifiants = {
  fournisseur: 'twilio',
  compte: 'ACxxxxxxxx',
  secret: 'jeton-secret',
  expediteur: '+15550001111',
};

const AT: Identifiants = {
  fournisseur: 'africastalking',
  compte: 'gtcs',
  secret: 'cle-api',
  expediteur: 'KOLEK',
};

describe('la normalisation du numéro', () => {
  it('met un numéro ivoirien au format international', () => {
    // Les deux passerelles acceptent un numéro mal formé en file, puis le
    // refusent — souvent après l'avoir facturé.
    expect(normaliserNumero('07 01 02 03 04')).toBe('+2250701020304');
    expect(normaliserNumero('0701020304')).toBe('+2250701020304');
  });

  it('respecte un indicatif déjà présent', () => {
    expect(normaliserNumero('+225 07 01 02 03 04')).toBe('+2250701020304');
    expect(normaliserNumero('2250701020304')).toBe('+2250701020304');
  });

  it('n’écrase pas un numéro étranger', () => {
    // GTCS opère en Côte d'Ivoire, mais un client peut porter un numéro de la
    // sous-région. Le préfixer de force le rendrait injoignable.
    expect(normaliserNumero('+22670000000')).toBe('+22670000000');
  });

  it('refuse ce qui n’est pas un numéro', () => {
    for (const brut of ['', '   ', 'abc', '12', '+']) {
      expect(normaliserNumero(brut)).toBeNull();
    }
  });
});

describe('la configuration', () => {
  it('rend null quand rien n’est configuré', () => {
    // C'est l'état par défaut du produit, et il doit être franc : pas de
    // passerelle, donc pas d'envoi, donc pas de message marqué « envoyé ».
    expect(passerelleDepuis({})).toBeNull();
  });

  it('rend null quand la configuration est incomplète', () => {
    expect(
      passerelleDepuis({ SMS_FOURNISSEUR: 'twilio', SMS_COMPTE: 'AC', SMS_SECRET: 'x' }),
    ).toBeNull();
    expect(
      passerelleDepuis({ SMS_COMPTE: 'AC', SMS_SECRET: 'x', SMS_EXPEDITEUR: 'KOLEK' }),
    ).toBeNull();
  });

  it('refuse un fournisseur inconnu', () => {
    expect(
      passerelleDepuis({
        SMS_FOURNISSEUR: 'maison',
        SMS_COMPTE: 'a',
        SMS_SECRET: 'b',
        SMS_EXPEDITEUR: 'KOLEK',
      }),
    ).toBeNull();
  });

  it('lit une configuration complète', () => {
    expect(
      passerelleDepuis({
        SMS_FOURNISSEUR: 'africastalking',
        SMS_COMPTE: 'gtcs',
        SMS_SECRET: 'cle',
        SMS_EXPEDITEUR: 'KOLEK',
      }),
    ).toEqual({
      fournisseur: 'africastalking',
      compte: 'gtcs',
      secret: 'cle',
      expediteur: 'KOLEK',
    });
  });
});

describe('la requête, par fournisseur', () => {
  it('construit celle de Twilio', () => {
    const r = construireRequete(TWILIO, '+2250701020304', 'KOLEK. Versement recu : 500 FCFA.');

    expect(r.url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACxxxxxxxx/Messages.json');
    expect(r.entetes.Authorization).toBe(`Basic ${btoa('ACxxxxxxxx:jeton-secret')}`);
    expect(r.corps).toContain('To=%2B2250701020304');
    expect(r.corps).toContain('From=%2B15550001111');
    expect(r.corps).toContain('Body=KOLEK.');
  });

  it('construit celle d’Africa’s Talking', () => {
    // Aucun des deux fournisseurs ne nomme les champs pareil, ni ne
    // s'authentifie pareil. C'est le genre de divergence qu'on veut voir ici
    // plutôt que dans un journal de production.
    const r = construireRequete(AT, '+2250701020304', 'KOLEK. Versement recu : 500 FCFA.');

    expect(r.url).toBe('https://api.africastalking.com/version1/messaging');
    expect(r.entetes.apiKey).toBe('cle-api');
    expect(r.entetes.Authorization).toBeUndefined();
    expect(r.corps).toContain('username=gtcs');
    expect(r.corps).toContain('to=%2B2250701020304');
    expect(r.corps).toContain('message=KOLEK.');
  });

  it('ne met le secret que dans l’en-tête, jamais dans le corps', () => {
    for (const identifiants of [TWILIO, AT]) {
      const r = construireRequete(identifiants, '+2250701020304', 'texte');
      expect(r.corps).not.toContain(identifiants.secret);
    }
  });
});

describe('la lecture de l’issue', () => {
  it('accepte les 2xx', () => {
    expect(lireIssue(200)).toEqual({ ok: true });
    expect(lireIssue(201)).toEqual({ ok: true });
  });

  it('marque réessayable ce qui peut passer plus tard', () => {
    expect(lireIssue(429)).toMatchObject({ ok: false, reessayable: true });
    expect(lireIssue(500)).toMatchObject({ ok: false, reessayable: true });
    expect(lireIssue(503)).toMatchObject({ ok: false, reessayable: true });
  });

  it('marque définitif ce qui ne passera jamais', () => {
    // Réessayer un refus d'identifiants mille fois consomme la fenêtre
    // d'exécution à chaque tour, pour le même échec — et masque la cause.
    expect(lireIssue(401)).toMatchObject({ reessayable: false, raison: 'IDENTIFIANTS_REFUSES' });
    expect(lireIssue(403)).toMatchObject({ reessayable: false, raison: 'IDENTIFIANTS_REFUSES' });
    expect(lireIssue(400)).toMatchObject({ reessayable: false });
  });
});

describe('l’envoi', () => {
  it('refuse un numéro invalide sans appeler la passerelle', async () => {
    let appele = false;
    const faux = (async () => {
      appele = true;
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    const issue = await envoyer(TWILIO, 'pas-un-numero', 'texte', faux);

    expect(issue).toMatchObject({ ok: false, reessayable: false, raison: 'NUMERO_INVALIDE' });
    expect(appele).toBe(false);
  });

  it('rend ok sur un 201', async () => {
    const faux = (async () => new Response('{}', { status: 201 })) as unknown as typeof fetch;
    expect(await envoyer(TWILIO, '0701020304', 'texte', faux)).toEqual({ ok: true });
  });

  it('traite une coupure réseau comme réessayable, sans rien marquer envoyé', async () => {
    // Le défaut à ne jamais commettre : compter comme envoyé un message dont on
    // ne sait rien. Le client croirait être protégé.
    const faux = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const issue = await envoyer(TWILIO, '0701020304', 'texte', faux);
    expect(issue).toMatchObject({ ok: false, reessayable: true });
  });

  it('envoie le numéro normalisé, pas la saisie brute', async () => {
    let corpsEnvoye = '';
    const faux = (async (_url: string, init: RequestInit) => {
      corpsEnvoye = String(init.body);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await envoyer(AT, '07 01 02 03 04', 'texte', faux);
    expect(corpsEnvoye).toContain('to=%2B2250701020304');
  });
});

/**
 * Le 201 qui ment.
 *
 * ## Ce que l'audit du 2026-08-30 a trouvé
 *
 * `lireIssue` ne regarde que le statut HTTP. C'est juste pour Twilio, qui refuse
 * une requête mal formée par un 4xx. Ce ne l'est pas pour Africa's Talking, qui
 * répond **201 même quand le destinataire est rejeté** : le verdict par
 * destinataire vit dans le corps, sous `SMSMessageData.Recipients[].statusCode`.
 *
 * Conséquence en production, sur les deux tables à la fois :
 *
 * | Ce qui se passe | Ce que Kolek en fait |
 * |---|---|
 * | numéro invalide, 201 | l'avis passe en `envoye` |
 * | solde épuisé, 201 | le quota du collecteur est consommé |
 *
 * Le client est réputé prévenu sans l'avoir été, et le collecteur paie un
 * message qui n'est jamais parti. C'est mot pour mot ce que l'en-tête du module
 * s'interdit — « un dispositif qui prétendrait avoir envoyé ce qu'il n'a pas
 * envoyé serait pire que pas de dispositif du tout ».
 *
 * ## Les codes d'Africa's Talking
 *
 * 100 traité, 101 envoyé, 102 en file : le message part. Tout le reste est un
 * refus, et seuls le solde épuisé et les erreurs de passerelle valent d'être
 * rejoués — un numéro invalide le restera au quatrième essai.
 */

const succes = (code: number) =>
  JSON.stringify({
    SMSMessageData: {
      Message: 'Sent to 1/1',
      Recipients: [{ statusCode: code, number: '+2250701020304', cost: 'XOF 25.0000' }],
    },
  });

describe("le verdict par destinataire d'Africa's Talking", () => {
  it('refuse de marquer envoyé un numéro que la passerelle a rejeté', async () => {
    // 403 InvalidPhoneNumber, servi dans un 201.
    const faux = (async () =>
      new Response(succes(403), { status: 201 })) as unknown as typeof fetch;

    const issue = await envoyer(AT, '0701020304', 'texte', faux);
    expect(issue.ok, "un 201 portant un refus ne doit pas compter comme envoyé").toBe(false);
    expect(issue).toMatchObject({ reessayable: false, raison: 'REFUS_403' });
  });

  it('rejoue un solde épuisé, qui se résout en créditant le compte', async () => {
    const faux = (async () =>
      new Response(succes(405), { status: 201 })) as unknown as typeof fetch;

    const issue = await envoyer(AT, '0701020304', 'texte', faux);
    expect(issue).toMatchObject({ ok: false, reessayable: true, raison: 'REFUS_405' });
  });

  it('accepte les trois codes qui veulent dire « parti »', async () => {
    for (const code of [100, 101, 102]) {
      const faux = (async () =>
        new Response(succes(code), { status: 201 })) as unknown as typeof fetch;
      expect(await envoyer(AT, '0701020304', 'texte', faux), `code ${code}`).toEqual({ ok: true });
    }
  });

  it('ne conclut rien d’un corps illisible, et ne le rejoue pas', async () => {
    // Ni « envoyé » — on n'en sait rien — ni un rejeu, qui enverrait deux fois
    // un message peut-être parti. L'avis tombe en `abandonne`, où il se voit.
    const faux = (async () =>
      new Response('<html>maintenance</html>', { status: 201 })) as unknown as typeof fetch;

    const issue = await envoyer(AT, '0701020304', 'texte', faux);
    expect(issue).toMatchObject({ ok: false, reessayable: false, raison: 'REPONSE_ILLISIBLE' });
  });

  it('laisse Twilio décider par son statut, sans lire le corps', async () => {
    // Le garde-fou de la correction : Twilio répond 201 avec un corps qui ne
    // porte aucun `Recipients`. L'y chercher le ferait échouer partout.
    const faux = (async () =>
      new Response(JSON.stringify({ sid: 'SM123', status: 'queued' }), {
        status: 201,
      })) as unknown as typeof fetch;

    expect(await envoyer(TWILIO, '0701020304', 'texte', faux)).toEqual({ ok: true });
  });
});
