import { afterAll, describe, expect, it } from 'vitest';

import { admin } from './harnais';

/**
 * La fonction publique de dépôt, appelée pour de vrai.
 *
 * `config.toml` porte `[edge_runtime] enabled = true` : la pile locale sert les
 * Edge Functions à `${SUPABASE_URL}/functions/v1/<nom>`. Les tests précédents du
 * dépôt ne couvraient que les modules purs — ce qui laissait hors mesure ce que
 * la fonction fait de leurs verdicts.
 */

const URL_FONCTION = `${process.env.SUPABASE_URL}/functions/v1/demander-ouverture`;
const CLE = process.env.SUPABASE_ANON_KEY!;
const MARQUE = crypto.randomUUID().slice(0, 8);

/**
 * La part numérique des numéros de sonde.
 *
 * `MARQUE` vient d'un UUID, donc porte des lettres — et `normaliserTelephone`
 * ne garde que les chiffres. Deux numéros bâtis sur elle se réduiraient au
 * même, et l'index unique des demandes en attente ferait échouer la deuxième
 * sonde en `23505`. Le piège a coûté quatre tests rouges avant d'être vu : ils
 * signalaient l'index, pas la fonction.
 */
const NUMERIQUE = String(Date.now()).slice(-7);
let sonde = 0;

/** Chaque appel prend sa propre IP : la borne est d'une demande par minute, et
    un test qui les partagerait toutes se bornerait lui-même. */
function ipAuHasard(prefixe = '10.0'): string {
  return `${prefixe}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
}

function deposer(corps: unknown, ip = ipAuHasard()) {
  return fetch(URL_FONCTION, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: CLE,
      Authorization: `Bearer ${CLE}`,
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(corps),
  });
}

function demande(suffixe: string) {
  sonde += 1;
  return {
    nom: `Sonde ${MARQUE} ${suffixe}`,
    telephone: `+2250${NUMERIQUE}${String(sonde).padStart(2, '0')}`,
    email: `sonde-${MARQUE}-${suffixe}@example.ci`,
    zone: 'Adjamé',
    palier: 'essai',
  };
}

afterAll(async () => {
  await admin.from('demandes_ouverture').delete().like('nom', `Sonde ${MARQUE}%`);
  await admin.from('debit_public').delete().like('empreinte', 'demander-ouverture:10.%');
});

describe('le dépôt', () => {
  it('accepte une demande complète et écrit l’adresse', async () => {
    const reponse = await deposer(demande('a'));
    expect(reponse.status).toBe(201);

    const { data } = await admin
      .from('demandes_ouverture')
      .select('email')
      .eq('nom', `Sonde ${MARQUE} a`)
      .single();
    expect(data?.email).toBe(`sonde-${MARQUE}-a@example.ci`);
  });

  it('ne rend rien de ce qu’il a écrit', async () => {
    // Un formulaire public qui renverrait la ligne écrite devient un moyen de
    // vérifier ce que la table contient déjà.
    const reponse = await deposer(demande('b'));
    const corps = await reponse.json();

    expect(corps).toEqual({ recue: true });
  });

  it('refuse une demande sans adresse', async () => {
    const { email: _, ...sansEmail } = demande('c');
    const reponse = await deposer(sansEmail);

    expect(reponse.status).toBe(400);
    expect(await reponse.json()).toEqual({ erreur: 'EMAIL_MANQUANT', champ: 'email' });
  });

  it('refuse une adresse mal formée', async () => {
    const reponse = await deposer({ ...demande('d'), email: 'mariam' });

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('EMAIL_INVALIDE');
  });
});

describe('la borne de débit', () => {
  it('refuse la seconde demande de la même IP dans la minute', async () => {
    // C'est le manque chiffré par l'audit du 2026-08-25 : sans borne, un script
    // qui fait varier le numéro noie l'écran d'administration.
    const ip = ipAuHasard('10.9');

    expect((await deposer(demande('e'), ip)).status).toBe(201);

    const seconde = await deposer(demande('f'), ip);
    expect(seconde.status).toBe(429);
    expect((await seconde.json()).erreur).toBe('TROP_DE_DEMANDES');
  });

  it('laisse passer une autre IP', async () => {
    await deposer(demande('g'), ipAuHasard('10.8'));

    expect((await deposer(demande('h'), ipAuHasard('10.7'))).status).toBe(201);
  });

  it('ne consomme pas de quota pour une saisie refusée', async () => {
    // La borne s'applique après la validation : un visiteur qui se trompe de
    // format ne doit pas se retrouver enfermé dehors pour une minute.
    const ip = ipAuHasard('10.6');
    await deposer({ ...demande('i'), email: 'pas-une-adresse' }, ip);

    expect((await deposer(demande('j'), ip)).status).toBe(201);
  });
});
