/**
 * La passerelle courriel.
 *
 * Calquée sur `passerelle-sms.ts` — même forme, même contrat, et surtout même
 * promesse : **elle n'invente aucun identifiant et ne prétend jamais avoir
 * envoyé**. Sans configuration, `passerelleDepuis` rend `null`, et l'appelant
 * laisse l'état intact. Rien n'est marqué « ouvert », rien n'est perdu, et tout
 * repart tel quel le jour où la clé arrive.
 *
 * ## Pourquoi ce module plutôt que le mailer de Supabase
 *
 * Supabase sait envoyer lui-même, par un SMTP réglé au tableau de bord. On ne
 * s'en sert pas : le service intégré plafonne à deux courriels par heure —
 * `email_sent = 2` dans `config.toml` — et le troisième prospect de la journée
 * ne recevrait rien **sans qu'aucune erreur ne le dise**. Une clé d'API chez un
 * fournisseur est nécessaire dans les deux cas ; ce chemin-ci nous donne en
 * plus la maîtrise du texte, et un seul mécanisme pour l'invitation comme pour
 * l'oubli.
 *
 * ## Un seul fournisseur, pour l'instant
 *
 * `passerelle-sms.ts` en porte deux parce que le coût au message décidait du
 * choix — 78 000 FCFA par mois et par collecteur séparaient les deux. Ici le
 * volume est de quelques courriels par semaine : un second fournisseur serait
 * du code que rien n'exerce. Le type `Fournisseur` existe quand même — c'est
 * lui qui fait qu'en ajouter un se lira comme une addition et non comme une
 * réécriture.
 */

export type Fournisseur = 'resend';

export interface Identifiants {
  fournisseur: Fournisseur;
  /** La clé d'API du fournisseur. */
  cle: string;
  /** L'expéditeur affiché, au format `Nom <adresse>`. Le domaine doit être
      vérifié chez le fournisseur, sinon l'envoi est refusé en 403 — que
      `lireIssue` traduit en `IDENTIFIANTS_REFUSES`. */
  expediteur: string;
}

export interface Requete {
  url: string;
  entetes: Record<string, string>;
  corps: string;
}

/** Lit les identifiants dans l'environnement, ou rend `null`. */
export function passerelleDepuis(
  env: Record<string, string | undefined>,
): Identifiants | null {
  const fournisseur = env.COURRIEL_FOURNISSEUR;
  const cle = env.COURRIEL_CLE;
  const expediteur = env.COURRIEL_EXPEDITEUR;

  if (fournisseur !== 'resend') return null;
  if (!cle || !expediteur) return null;

  return { fournisseur, cle, expediteur };
}

/**
 * Construit la requête d'envoi.
 *
 * Rien que du texte. Un corps HTML demanderait une seconde rédaction à tenir
 * synchronisée avec la première, pour un message qui ne porte qu'un lien.
 */
export function construireRequete(
  identifiants: Identifiants,
  destinataire: string,
  sujet: string,
  corps: string,
): Requete {
  return {
    url: 'https://api.resend.com/emails',
    entetes: {
      Authorization: `Bearer ${identifiants.cle}`,
      'Content-Type': 'application/json',
    },
    corps: JSON.stringify({
      from: identifiants.expediteur,
      to: [destinataire],
      subject: sujet,
      text: corps,
    }),
  };
}

export type Issue =
  | { ok: true }
  | { ok: false; reessayable: boolean; raison: string };

/**
 * Interprète la réponse du fournisseur.
 *
 * Même découpe que `passerelle-sms.ts`, et la distinction qui compte est la
 * même : **réessayable ou non**. Un 5xx ou une coupure réseau se rejoue ; une
 * clé refusée se rejouerait mille fois pour le même échec.
 */
export function lireIssue(statut: number): Issue {
  if (statut >= 200 && statut < 300) return { ok: true };

  // 429 : débit dépassé chez le fournisseur. C'est temporaire par définition.
  if (statut === 429) return { ok: false, reessayable: true, raison: 'DEBIT_DEPASSE' };
  if (statut >= 500) return { ok: false, reessayable: true, raison: `PASSERELLE_${statut}` };

  // 401 / 403 : clé refusée, ou domaine non vérifié. Réessayer n'y changera
  // rien, et il faut que quelqu'un le voie.
  if (statut === 401 || statut === 403) {
    return { ok: false, reessayable: false, raison: 'IDENTIFIANTS_REFUSES' };
  }
  return { ok: false, reessayable: false, raison: `REFUS_${statut}` };
}

/** Envoie un message. `recuperer` est injectable pour les tests. */
export async function envoyer(
  identifiants: Identifiants,
  destinataire: string,
  sujet: string,
  corps: string,
  recuperer: typeof fetch = fetch,
): Promise<Issue> {
  const adresse = destinataire.trim();
  if (!adresse) return { ok: false, reessayable: false, raison: 'ADRESSE_VIDE' };

  const requete = construireRequete(identifiants, adresse, sujet, corps);

  try {
    const reponse = await recuperer(requete.url, {
      method: 'POST',
      headers: requete.entetes,
      body: requete.corps,
    });
    return lireIssue(reponse.status);
  } catch (cause) {
    // Une coupure réseau est réessayable, et surtout : on ne marque rien.
    return {
      ok: false,
      reessayable: true,
      raison: cause instanceof Error ? `RESEAU_${cause.name}` : 'RESEAU',
    };
  }
}
