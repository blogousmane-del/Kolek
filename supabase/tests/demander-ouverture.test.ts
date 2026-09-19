import { afterAll, describe, expect, it } from 'vitest';

import { VERSION_CONDITIONS } from '../functions/_shared/version-conditions.ts';
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
    // Exigée depuis que `validerDemande` contrôle la version des conditions.
    // Lue depuis la constante engendrée, jamais écrite à la main : c'est la
    // même valeur que celle du serveur, par construction.
    //
    // Son absence a rendu **huit** épreuves de ce fichier rouges au CI, et
    // nulle part ailleurs : le fichier unitaire `valider-demande.test.ts` avait
    // été mis à jour, celui-ci non, et il ne tourne que sous `test:db` — refusé
    // au poste. Le contrôle est le dernier de `validerDemande`, d'où les trois
    // épreuves qui passaient quand même : elles se font refuser plus tôt, sur
    // l'adresse ou le mot de passe.
    version: VERSION_CONDITIONS,
  };
}

afterAll(async () => {
  // Les acceptations **avant** les demandes : `demande_id` est en
  // `on delete set null`, donc l'ordre inverse laisserait des lignes que plus
  // rien ne désigne et qu'on ne saurait plus retrouver.
  const { data: nees } = await admin
    .from('demandes_ouverture')
    .select('id')
    .like('nom', `Sonde ${MARQUE}%`);
  if (nees && nees.length > 0) {
    await admin
      .from('acceptations_conditions')
      .delete()
      .in(
        'demande_id',
        nees.map((d) => d.id),
      );
  }

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

  it('refuse une version des conditions que le serveur ne connaît pas', async () => {
    // Un onglet resté ouvert depuis une version précédente. Sans ce contrôle,
    // on enregistrerait une acceptation pour un texte qu'on ne peut pas
    // produire — exactement la situation qu'on cherche à quitter.
    //
    // Cette épreuve existe parce que sa garde n'était mesurée que par le
    // module pur : le contrôle a cassé huit épreuves de ce fichier sans que
    // rien, ici, ne le mesure dans l'autre sens. La route elle-même doit en
    // porter une.
    const reponse = await deposer({ ...demande('version'), version: 'deadbeefdeadbeef' });

    expect(reponse.status).toBe(400);
    expect(await reponse.json()).toEqual({
      erreur: 'VERSION_CONDITIONS_PERIMEE',
      champ: 'version',
    });
  });

  it('écrit l’acceptation avec la demande dont elle est née', async () => {
    // `collecteur_id` reste nul : le compte n'existe pas encore. Sur un palier
    // payant, le webhook le posera à sa naissance ; sur un essai, jamais.
    const reponse = await deposer(demande('acceptation'));
    expect(reponse.status).toBe(201);

    const { data: ligne } = await admin
      .from('demandes_ouverture')
      .select('id')
      .eq('nom', `Sonde ${MARQUE} acceptation`)
      .single();
    expect(ligne?.id, 'la demande doit être écrite, sinon la sonde ne mesure rien').toBeTruthy();

    const { data: acceptation } = await admin
      .from('acceptations_conditions')
      .select('version, collecteur_id')
      .eq('demande_id', ligne!.id)
      .single();

    expect(acceptation?.version).toBe(VERSION_CONDITIONS);
    expect(acceptation?.collecteur_id, 'aucun compte à ce stade').toBeNull();
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

describe('la demande payante', () => {
  /**
   * L'amendement « payer vaut accord » du 2026-09-02 : un palier payant part
   * payer au lieu d'attendre un rappel.
   *
   * Ce que la base locale peut mesurer s'arrête où `CHARIOW_CLE_API` manque —
   * elle n'existe ni ici ni au CI. La vente elle-même, l'empreinte écrite et le
   * lien rendu vivent derrière. Reste ce qui compte le plus, et qui est
   * justement observable **parce que** la clé manque : rien n'est écrit quand le
   * paiement ne peut pas partir.
   */

  it('refuse un palier payant sans mot de passe, en nommant le champ', async () => {
    const reponse = await deposer({ ...demande('mdp-absent'), palier: 'pro' });

    expect(reponse.status).toBe(400);
    expect(await reponse.json()).toMatchObject({
      erreur: 'MOT_DE_PASSE_REQUIS',
      champ: 'motDePasse',
    });
  });

  it('refuse un mot de passe trop court', async () => {
    const reponse = await deposer({
      ...demande('mdp-court'),
      palier: 'pro',
      motDePasse: 'court',
    });

    expect(reponse.status).toBe(400);
    expect(await reponse.json()).toMatchObject({ erreur: 'MOT_DE_PASSE_COURT' });
  });

  it('n’écrit rien quand le paiement n’est pas configuré', async () => {
    // La propriété qui compte ici. Écrire d'abord et découvrir ensuite que la
    // vente ne peut pas partir laisserait une demande orpheline portant une
    // empreinte, et son numéro verrouillé par l'index d'unicité jusqu'à ce
    // qu'un humain la traite. Le contrôle passe donc avant la première écriture.
    const saisie = { ...demande('sans-boutique'), palier: 'pro', motDePasse: 'kolek-2026-essai' };

    const reponse = await deposer(saisie);

    expect(reponse.status).toBe(503);
    expect(await reponse.json()).toMatchObject({ erreur: 'PAIEMENT_INDISPONIBLE' });

    const { data } = await admin
      .from('demandes_ouverture')
      .select('id')
      .eq('telephone', saisie.telephone);
    expect(data).toEqual([]);
  });

  it('laisse l’essai suivre le chemin d’avant, sans mot de passe ni empreinte', async () => {
    // L'essai vaut zéro franc : il n'y a rien à encaisser, et il attend l'accord
    // d'un humain. C'est aussi la porte d'entrée de qui n'a pas de moyen de
    // paiement en ligne.
    const saisie = demande('essai-intact');

    const reponse = await deposer(saisie);
    expect(reponse.status).toBe(201);
    expect(await reponse.json()).toEqual({ recue: true });

    const { data } = await admin
      .from('demandes_ouverture')
      .select('statut, mot_de_passe_hash')
      .eq('telephone', saisie.telephone)
      .single();
    expect(data).toEqual({ statut: 'nouvelle', mot_de_passe_hash: null });
  });

  it('ne retient pas d’empreinte pour un essai, même si le formulaire en envoie un', async () => {
    const saisie = { ...demande('essai-avec-mdp'), motDePasse: 'kolek-2026-inutile' };

    expect((await deposer(saisie)).status).toBe(201);

    const { data } = await admin
      .from('demandes_ouverture')
      .select('mot_de_passe_hash')
      .eq('telephone', saisie.telephone)
      .single();
    expect(data?.mot_de_passe_hash).toBeNull();
  });
});
