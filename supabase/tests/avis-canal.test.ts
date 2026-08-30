import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Un canal qu'aucune passerelle ne sert ne doit pas être proposable.
 *
 * ## Le piège, et pourquoi il était bien caché
 *
 * `whatsapp` était accepté par la contrainte, par `admin_avis_definir` et par
 * l'écran d'administration, qui l'affichait avec la note « Moins cher, mais
 * suppose que le client a WhatsApp ».
 *
 * Aucune passerelle WhatsApp n'existe : `_shared/passerelle-sms.ts` ne connaît
 * que Twilio et Africa's Talking, et `envoyer-avis` ne filtre pas par canal — il
 * tire toute la file et l'envoie par la passerelle SMS.
 *
 * Choisir WhatsApp faisait donc partir un **SMS facturé**, sous une étiquette
 * « WHATSAPP », avec une note promettant une économie et une estimation
 * mensuelle chiffrant le mauvais canal.
 *
 * Le cahier des charges désigne WhatsApp comme le canal prioritaire. Le piège
 * était donc celui que la documentation recommande, ce qui est le pire endroit
 * où en poser un.
 *
 * ## Deux refus, et pas un seul
 *
 * `CANAL_INVALIDE` dit « je ne reconnais pas ce mot » et envoie chercher une
 * faute de frappe. `CANAL_SANS_PASSERELLE` dit « je le reconnais, je ne sais pas
 * le servir » et envoie chercher une passerelle. Les confondre coûterait une
 * heure à celui qui lira le message.
 */

const MARQUE = crypto.randomUUID().slice(0, 6).toUpperCase();

let collecteur: CollecteurTest;

beforeAll(async () => {
  collecteur = await creerCollecteur(`Canal ${MARQUE}`, `+2250700${MARQUE.slice(0, 4)}`);
}, 20000);

afterAll(async () => {
  await nettoyer();
});

async function definir(canal: string) {
  return admin.rpc('admin_avis_definir', {
    collecteur: collecteur.id,
    nouveau_canal: canal,
    mise: false,
    retrait: true,
    ouverture: true,
    quota: 500,
  });
}

describe('le canal des avis', () => {
  it('accepte sms, qui a une passerelle', async () => {
    const { data, error } = await definir('sms');
    expect(error).toBeNull();
    expect((data as { canal: string }).canal).toBe('sms');
  });

  it('accepte aucun, qui n’en demande pas', async () => {
    const { error } = await definir('aucun');
    expect(error).toBeNull();
  });

  it('refuse whatsapp, et le dit par son nom', async () => {
    const { error } = await definir('whatsapp');
    expect(error, 'whatsapp ne doit pas passer tant qu’aucune passerelle ne le sert').not.toBeNull();
    expect(error?.message).toContain('CANAL_SANS_PASSERELLE');
  });

  it('distingue « pas servi » de « pas reconnu »', async () => {
    // Le test qui donne son sens au précédent. Si les deux rendaient le même
    // code, le refus de whatsapp serait indiscernable d'une faute de frappe.
    const { error } = await definir('pigeon-voyageur');
    expect(error?.message).toContain('CANAL_INVALIDE');
    expect(error?.message).not.toContain('CANAL_SANS_PASSERELLE');
  });

  it('rend l’état impossible, pas seulement refusé', async () => {
    // La fonction ferme la porte d'aujourd'hui ; la contrainte ferme celles de
    // demain — un script, une insertion à la main, une route qui oublierait la
    // règle. C'est le même argument que pour les règles de privilège : écrite en
    // TypeScript, elle serait contournable par la prochaine route.
    const { error } = await admin
      .from('avis_reglages')
      .update({ canal: 'whatsapp' })
      .eq('collecteur_id', collecteur.id);

    expect(error, 'la contrainte doit refuser whatsapp même en écriture directe').not.toBeNull();
    expect(error?.message).toMatch(/avis_canal_check|violates check constraint/);
  });
});
