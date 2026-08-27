import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * L'accord d'une demande d'ouverture.
 *
 * ## Ce que ces tests gardent
 *
 * **L'ordre.** La demande ne passe à « ouverte » qu'après un envoi réussi. Une
 * demande marquée traitée dont le prospect n'a rien reçu est le pire des états
 * possibles : elle disparaît de l'écran d'administration, et personne ne saura
 * jamais qu'il faut la reprendre.
 *
 * ## Ce que ces tests ne peuvent pas garder
 *
 * Le chemin nominal — courriel réellement parti — demande une clé de
 * fournisseur et un envoi réel. La pile locale n'en a pas, et **on ne feint
 * rien** : c'est la règle portée par l'en-tête de `passerelle-sms.ts`. Ce que
 * ces tests mesurent, c'est que sans passerelle configurée, **rien n'est créé
 * et rien n'est marqué**. Le reste figure dans la vérification manuelle du plan
 * de ce lot, avec la procédure exacte.
 */

const URL_FONCTION = `${process.env.SUPABASE_URL}/functions/v1/admin-demandes`;
const MARQUE = crypto.randomUUID().slice(0, 8);

/** La part numérique des numéros de sonde. `MARQUE` porte des lettres, et la
    normalisation ne garde que les chiffres : deux numéros bâtis sur elle se
    réduiraient au même, et l'index unique des demandes en attente ferait
    échouer la deuxième sonde en `23505`. */
const NUMERIQUE = String(Date.now()).slice(-7);
let sonde = 0;

let patron: CollecteurTest;
let jeton: string;

beforeAll(async () => {
  patron = await creerCollecteur(`Patron ${MARQUE}`, `+2250${NUMERIQUE}90`);
  await admin.from('admins').insert({ user_id: patron.id });

  const { data } = await patron.client.auth.getSession();
  jeton = data.session!.access_token;
});

afterAll(async () => {
  await admin.from('demandes_ouverture').delete().like('nom', `Sonde ${MARQUE}%`);
  await admin.from('admins').delete().eq('user_id', patron.id);
  await nettoyer();
});

function traiter(id: string, statut: string, autorisation = jeton) {
  return fetch(URL_FONCTION, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${autorisation}`,
    },
    body: JSON.stringify({ id, statut }),
  });
}

async function deposer(suffixe: string, email: string | null): Promise<string> {
  sonde += 1;
  const { data, error } = await admin
    .from('demandes_ouverture')
    .insert({
      nom: `Sonde ${MARQUE} ${suffixe}`,
      telephone: `+2250${NUMERIQUE}${String(sonde).padStart(2, '0')}`,
      email,
      palier: 'pro',
      zone: 'Adjamé',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function statutDe(id: string): Promise<string> {
  const { data } = await admin.from('demandes_ouverture').select('statut').eq('id', id).single();
  return data!.statut;
}

describe('sans passerelle configurée', () => {
  it('refuse d’accorder, et ne marque rien', async () => {
    // L'invariant du lot. Si ce test tombe, une panne de courriel produit des
    // prospects perdus en silence.
    const id = await deposer('a', `sonde-${MARQUE}-a@example.ci`);

    const reponse = await traiter(id, 'ouverte');

    expect(reponse.status).toBe(500);
    expect((await reponse.json()).erreur).toBe('COURRIEL_NON_CONFIGURE');
    expect(await statutDe(id)).toBe('nouvelle');
  });

  it('ne crée aucun compte', async () => {
    // La passerelle est vérifiée **avant** `generateLink`. Sans cela, une
    // configuration absente laisserait derrière elle un compte orphelin par
    // tentative — et la ligne `collecteurs` que le déclencheur compose avec.
    const email = `sonde-${MARQUE}-b@example.ci`;
    const id = await deposer('b', email);

    await traiter(id, 'ouverte');

    const { data } = await admin.auth.admin.listUsers();
    expect(data.users.some((u) => u.email === email)).toBe(false);
  });

  it('laisse passer « contactée » et « refusée »', async () => {
    // Ces deux statuts n'envoient rien et ne doivent pas dépendre du courriel :
    // sinon l'écran d'administration cesserait de fonctionner entièrement le
    // jour où la clé du fournisseur expire.
    const id = await deposer('c', `sonde-${MARQUE}-c@example.ci`);

    expect((await traiter(id, 'contactee')).status).toBe(200);
    expect(await statutDe(id)).toBe('contactee');

    expect((await traiter(id, 'refusee')).status).toBe(200);
    expect(await statutDe(id)).toBe('refusee');
  });
});

describe('les refus nommés', () => {
  it('refuse d’accorder une demande sans adresse', async () => {
    // Les demandes déposées avant le 2026-08-27 n'en portent pas. Elles doivent
    // le dire, et rester en l'état pour qu'on puisse rappeler.
    const id = await deposer('d', null);

    const reponse = await traiter(id, 'ouverte');

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('EMAIL_ABSENT');
    expect(await statutDe(id)).toBe('nouvelle');
  });

  it('rend 404 pour une demande inexistante', async () => {
    const reponse = await traiter(crypto.randomUUID(), 'ouverte');

    expect(reponse.status).toBe(404);
    expect((await reponse.json()).erreur).toBe('DEMANDE_INTROUVABLE');
  });

  it('refuse un statut inconnu', async () => {
    const id = await deposer('e', `sonde-${MARQUE}-e@example.ci`);
    const reponse = await traiter(id, 'archivee');

    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('STATUT_INVALIDE');
  });
});

describe('le portillon', () => {
  it('refuse un collecteur ordinaire', async () => {
    // Le portillon existant ne doit pas s'être relâché en gagnant ce chemin :
    // ce que garde cette fonction, c'est une liste de prospects de GTCS.
    const ordinaire = await creerCollecteur(`Ordinaire ${MARQUE}`, `+2250${NUMERIQUE}91`);
    const { data } = await ordinaire.client.auth.getSession();

    const reponse = await traiter(
      crypto.randomUUID(),
      'ouverte',
      data.session!.access_token,
    );

    expect(reponse.status).toBe(403);
  });

  it('refuse une requête sans jeton', async () => {
    const reponse = await fetch(URL_FONCTION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_ANON_KEY! },
      body: JSON.stringify({ id: crypto.randomUUID(), statut: 'ouverte' }),
    });

    expect(reponse.status).toBe(401);
  });
});
