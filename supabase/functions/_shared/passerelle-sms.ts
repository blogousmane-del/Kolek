/**
 * Les passerelles SMS.
 *
 * Module sans aucune API Deno : la construction de la requête est pure, donc
 * testable, et c'est elle qui contient les erreurs qui coûtent — un numéro mal
 * formé part quand même et se facture, un champ mal nommé fait échouer mille
 * envois d'affilée.
 *
 * ## Deux fournisseurs, un contrat
 *
 * `twilio` est le plus universellement disponible ; `africastalking` est
 * nettement moins cher sur l'Afrique de l'Ouest, ce qui n'est pas un détail
 * quand le coût des messages dépasse le prix de l'abonnement. Le choix est une
 * variable d'environnement, pas une réécriture.
 *
 * Le contrat est commun à l'entrée — mêmes identifiants, même `envoyer` — mais
 * **pas à la sortie**, et le croire a coûté un défaut : Twilio dit son verdict
 * par le statut HTTP, Africa's Talking le met dans le corps d'un `201`. Voir
 * `lireIssueAfricastalking`.
 *
 * ## Ce que ce module ne fait pas
 *
 * **Il n'invente aucun identifiant.** Sans configuration, `passerelleDepuis`
 * rend `null` et la fonction appelante laisse la file intacte. Rien n'est
 * marqué « envoyé », rien n'est perdu, et la file repart telle quelle le jour
 * où les identifiants arrivent. Un dispositif qui prétendrait avoir envoyé ce
 * qu'il n'a pas envoyé serait pire que pas de dispositif du tout : le client
 * croirait être protégé.
 */

export type Fournisseur = 'twilio' | 'africastalking';

export interface Identifiants {
  fournisseur: Fournisseur;
  /** Twilio : l'Account SID. Africa's Talking : le nom d'utilisateur. */
  compte: string;
  /** Twilio : l'Auth Token. Africa's Talking : la clé d'API. */
  secret: string;
  /**
   * L'expéditeur affiché.
   *
   * En Côte d'Ivoire, un identifiant alphanumérique — `KOLEK` — doit être
   * homologué auprès des opérateurs avant de fonctionner, ce qui prend des
   * jours et ne dépend pas de nous.
   *
   * Vide est donc une valeur légitime **pour Africa's Talking**, qui envoie
   * alors depuis un code court partagé. Le jour de l'homologation, poser la
   * variable suffit : aucun redéploiement. Twilio, lui, exige `From`.
   */
  expediteur: string;
}

export interface Requete {
  url: string;
  entetes: Record<string, string>;
  corps: string;
}

/**
 * Met le numéro au format international sans espaces.
 *
 * Les deux passerelles refusent un numéro mal formé, mais **après** l'avoir
 * accepté en file — c'est-à-dire souvent en le facturant. Normaliser ici coûte
 * une ligne et évite de payer pour des messages qui ne partiront pas.
 *
 * `defaut` est l'indicatif appliqué à un numéro national. Il est passé en
 * paramètre plutôt que codé en dur : GTCS opère en Côte d'Ivoire aujourd'hui,
 * et rien dans ce module ne doit s'y river.
 */
export function normaliserNumero(brut: string, defaut = '225'): string | null {
  const chiffres = brut.replace(/[^\d+]/g, '');
  if (!chiffres) return null;

  if (chiffres.startsWith('+')) {
    const corps = chiffres.slice(1).replace(/\D/g, '');
    return corps.length >= 8 ? `+${corps}` : null;
  }

  const nu = chiffres.replace(/\D/g, '');
  if (nu.length < 8) return null;
  // Déjà préfixé par l'indicatif, sans le `+`.
  if (nu.startsWith(defaut) && nu.length > defaut.length + 7) return `+${nu}`;
  return `+${defaut}${nu}`;
}

/** Lit les identifiants dans l'environnement, ou rend `null`. */
export function passerelleDepuis(
  env: Record<string, string | undefined>,
): Identifiants | null {
  const fournisseur = env.SMS_FOURNISSEUR;
  const compte = env.SMS_COMPTE;
  const secret = env.SMS_SECRET;
  const expediteur = env.SMS_EXPEDITEUR;

  if (fournisseur !== 'twilio' && fournisseur !== 'africastalking') return null;
  if (!compte || !secret) return null;

  // Twilio rejette une requête sans `From`. L'accepter ici ne ferait que
  // déplacer l'échec dans un journal de passerelle, où il est moins lisible.
  if (fournisseur === 'twilio' && !expediteur) return null;

  return { fournisseur, compte, secret, expediteur: expediteur ?? '' };
}

/**
 * Construit la requête d'envoi.
 *
 * Les deux fournisseurs attendent du `application/x-www-form-urlencoded`, mais
 * ne nomment rien pareil et ne s'authentifient pas pareil. C'est exactement le
 * genre de divergence qu'on veut voir dans un test plutôt que dans un journal
 * de production.
 */
export function construireRequete(
  identifiants: Identifiants,
  destinataire: string,
  corps: string,
): Requete {
  if (identifiants.fournisseur === 'twilio') {
    const parametres = new URLSearchParams({
      To: destinataire,
      From: identifiants.expediteur,
      Body: corps,
    });
    return {
      url: `https://api.twilio.com/2010-04-01/Accounts/${identifiants.compte}/Messages.json`,
      entetes: {
        // Twilio s'authentifie en Basic : le SID en identifiant, le jeton en
        // mot de passe.
        Authorization: `Basic ${btoa(`${identifiants.compte}:${identifiants.secret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      corps: parametres.toString(),
    };
  }

  const parametres = new URLSearchParams({
    username: identifiants.compte,
    to: destinataire,
    message: corps,
  });

  // Omis, et non envoyé vide : `from=` sans valeur se lit comme un expéditeur
  // nul et fait rejeter le message, au lieu de laisser la passerelle choisir
  // son code court partagé.
  if (identifiants.expediteur) parametres.set('from', identifiants.expediteur);

  return {
    url: 'https://api.africastalking.com/version1/messaging',
    entetes: {
      // Africa's Talking s'authentifie par un en-tête propre, pas par Basic.
      apiKey: identifiants.secret,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    corps: parametres.toString(),
  };
}

export type Issue =
  | { ok: true }
  | { ok: false; reessayable: boolean; raison: string };

/**
 * Interprète le **statut HTTP** de la passerelle.
 *
 * La distinction qui compte est **réessayable ou non**. Un 5xx ou une coupure
 * réseau se rejoue ; un numéro invalide ou un compte non provisionné se
 * rejouerait mille fois pour le même échec, en consommant à chaque tour la
 * fenêtre d'exécution de la fonction.
 *
 * Suffisant pour Twilio, qui refuse une requête mal formée par un 4xx. Pas pour
 * Africa's Talking — voir `lireIssueAfricastalking` juste en dessous.
 */
export function lireIssue(statut: number): Issue {
  if (statut >= 200 && statut < 300) return { ok: true };

  // 429 : débit dépassé. C'est temporaire par définition.
  if (statut === 429) return { ok: false, reessayable: true, raison: 'DEBIT_DEPASSE' };
  if (statut >= 500) return { ok: false, reessayable: true, raison: `PASSERELLE_${statut}` };

  // 401 / 403 : identifiants refusés. Réessayer n'y changera rien, et il faut
  // que quelqu'un le voie.
  if (statut === 401 || statut === 403) {
    return { ok: false, reessayable: false, raison: 'IDENTIFIANTS_REFUSES' };
  }
  return { ok: false, reessayable: false, raison: `REFUS_${statut}` };
}

/**
 * Les codes de `Recipients[].statusCode` qui veulent dire « le message part » :
 * 100 traité, 101 envoyé, 102 en file. Tout le reste est un refus.
 */
const AT_ACCEPTES = new Set([100, 101, 102]);

/**
 * Les refus qui valent d'être rejoués : 405 solde épuisé — il se résout en
 * créditant le compte — et les erreurs de passerelle. Un numéro invalide (403)
 * ou un expéditeur non déclaré (402) le resteront au quatrième essai.
 */
const AT_REESSAYABLES = new Set([405, 500, 501, 502]);

/**
 * Interprète la réponse d'Africa's Talking, **corps compris**.
 *
 * Trouvé à l'audit du 2026-08-30, avant le premier envoi réel. Africa's Talking
 * répond `201` même lorsqu'il rejette le destinataire : le verdict vit dans le
 * corps, sous `SMSMessageData.Recipients[].statusCode`. S'arrêter au statut HTTP
 * marquait donc `envoye` un message refusé, **et consommait le quota du
 * collecteur** — `envoyer-avis` n'avance ce compteur que sur un `ok`.
 *
 * Le client était réputé prévenu sans l'avoir été, et le collecteur payait un
 * message qui n'est jamais parti. C'est précisément ce que l'en-tête de ce
 * module s'interdit.
 *
 * Un corps qu'on ne sait pas lire ne conclut rien : ni « envoyé », puisqu'on
 * n'en sait rien, ni un rejeu, qui enverrait deux fois un message peut-être
 * parti. L'avis tombe en `abandonne`, où quelqu'un le voit.
 */
export function lireIssueAfricastalking(statut: number, texte: string): Issue {
  const parStatut = lireIssue(statut);
  if (!parStatut.ok) return parStatut;

  let destinataires: unknown;
  try {
    const corps = JSON.parse(texte) as { SMSMessageData?: { Recipients?: unknown } };
    destinataires = corps?.SMSMessageData?.Recipients;
  } catch {
    return { ok: false, reessayable: false, raison: 'REPONSE_ILLISIBLE' };
  }

  if (!Array.isArray(destinataires) || destinataires.length === 0) {
    // Un 201 sans destinataire : la passerelle n'a rien accepté, et le dire
    // autrement qu'en refus serait mentir.
    return { ok: false, reessayable: false, raison: 'AUCUN_DESTINATAIRE' };
  }

  const code = (destinataires[0] as { statusCode?: unknown }).statusCode;
  if (typeof code !== 'number') {
    return { ok: false, reessayable: false, raison: 'REPONSE_ILLISIBLE' };
  }

  if (AT_ACCEPTES.has(code)) return { ok: true };
  return { ok: false, reessayable: AT_REESSAYABLES.has(code), raison: `REFUS_${code}` };
}

/** Envoie un message. `recuperer` est injectable pour les tests. */
export async function envoyer(
  identifiants: Identifiants,
  destinataire: string,
  corps: string,
  recuperer: typeof fetch = fetch,
): Promise<Issue> {
  const numero = normaliserNumero(destinataire);
  if (!numero) return { ok: false, reessayable: false, raison: 'NUMERO_INVALIDE' };

  const requete = construireRequete(identifiants, numero, corps);

  let reponse: Response;
  try {
    reponse = await recuperer(requete.url, {
      method: 'POST',
      headers: requete.entetes,
      body: requete.corps,
    });
  } catch (cause) {
    // Une coupure réseau est réessayable. On ne marque rien comme envoyé.
    return {
      ok: false,
      reessayable: true,
      raison: cause instanceof Error ? `RESEAU_${cause.name}` : 'RESEAU',
    };
  }

  if (identifiants.fournisseur !== 'africastalking') return lireIssue(reponse.status);

  let texte: string;
  try {
    texte = await reponse.text();
  } catch {
    // Distinct de la coupure ci-dessus, et **non réessayable** : la requête est
    // partie. La rejouer enverrait un second message au même client.
    return { ok: false, reessayable: false, raison: 'REPONSE_ILLISIBLE' };
  }

  return lireIssueAfricastalking(reponse.status, texte);
}
