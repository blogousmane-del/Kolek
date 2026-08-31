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
  // `trim()` sur les quatre, et ce n'est pas de la coquetterie.
  //
  // Ces valeurs arrivent d'un copier-coller dans un champ de tableau de bord.
  // Un espace ou un retour à la ligne attrapé en sélectionnant une clé à la
  // souris rend un identifiant faux que rien ne distingue à l'œil : le champ
  // paraît correct, la passerelle répond 401, et on régénère une clé qui
  // n'était pas en cause. C'est exactement l'impasse du 2026-08-30.
  //
  // Rogner ici plutôt qu'à l'usage : `passerelleDepuis` est le seul point
  // d'entrée de ces quatre valeurs dans le code.
  const fournisseur = env.SMS_FOURNISSEUR?.trim();
  const compte = env.SMS_COMPTE?.trim();
  const secret = env.SMS_SECRET?.trim();
  const expediteur = env.SMS_EXPEDITEUR?.trim();

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

  // Le refus explique pourquoi, et on jetait l'explication.
  //
  // Le 2026-08-30, le premier envoi réel a rendu `IDENTIFIANTS_REFUSES` — et
  // rien de plus. Compte inconnu ? clé d'un autre projet ? clé du bac à sable ?
  // Africa's Talking répond ces trois choses différemment, dans le corps, et
  // `derniere_erreur` n'en gardait aucune. On cherchait à l'aveugle.
  //
  // L'extrait est court et nettoyé : il finit dans une colonne de base lue par
  // un écran, pas dans un journal. Le corps d'un refus ne porte jamais la clé —
  // c'est la requête qui la porte, pas la réponse.
  if (!parStatut.ok) {
    const extrait = texte.replace(/\s+/g, ' ').trim().slice(0, 120);
    return extrait ? { ...parStatut, raison: `${parStatut.raison} — ${extrait}` } : parStatut;
  }

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

/**
 * Demande à la passerelle si elle reconnaît le compte, sans rien envoyer.
 *
 * ## Pourquoi cette sonde existe
 *
 * Le 2026-08-30, GTCS a régénéré sa clé d'API puis corrigé son nom
 * d'utilisateur. Africa's Talking a répondu « The supplied authentication is
 * invalid » aux deux essais suivants, exactement comme avant. Deux corrections
 * plausibles, aucun changement : à ce stade, on ne sait plus si le refus vient
 * des identifiants ou de **notre requête**.
 *
 * `/version1/user` répond au même couple `username` + `apiKey`, ne coûte rien
 * et n'envoie aucun message. Il tranche donc la question que l'envoi ne peut
 * pas trancher :
 *
 * | Réponse de la sonde | Ce qu'on cherche ensuite |
 * |---|---|
 * | compte joignable | les identifiants sont bons — le défaut est dans notre appel d'envoi |
 * | compte refusé | les identifiants sont mauvais — inutile de toucher au code |
 *
 * Sans elle, les deux hypothèses se ressemblent et on corrige au hasard. C'est
 * précisément ce qu'on vient de faire deux fois.
 *
 * La réponse porte le solde du compte, jamais la clé. L'extrait est donc
 * enregistrable dans `derniere_erreur`, que l'écran Avis affiche.
 */
/**
 * Les caractères qui n'ont rien à faire dans un identifiant, et ce qu'ils
 * trahissent : un copier-coller qui a emporté l'étiquette (« API Key: … »), une
 * adresse de courriel prise pour un nom d'application, un guillemet ramassé
 * dans un fichier de configuration.
 */
const MARQUES: ReadonlyArray<{ signe: string; nom: string }> = [
  { signe: ' ', nom: 'un espace' },
  { signe: ':', nom: 'un deux-points' },
  { signe: '@', nom: 'une arobase' },
  { signe: '"', nom: 'un guillemet' },
  { signe: "'", nom: 'une apostrophe' },
  { signe: '/', nom: 'une barre oblique' },
];

function marquesDe(valeur: string): string[] {
  return MARQUES.filter(({ signe }) => valeur.includes(signe)).map(({ nom }) => nom);
}

/**
 * La forme d'un identifiant, jamais sa valeur.
 *
 * Trois corrections de bonne foi ont laissé le même 401, et la longueur seule
 * ne dit pas ce qui cloche : elle ne distingue pas une clé fausse d'une clé
 * juste précédée de son étiquette. La composition, elle, le dit — une clé
 * Africa's Talking est faite de chiffres hexadécimaux, éventuellement précédés
 * de `atsk_`, et rien d'autre.
 *
 * Ce qui sort ici est un décompte. Aucun caractère de la valeur n'y figure.
 */
export function formeCle(valeur: string): string {
  // Le préfixe est retiré avant le décompte : ses propres lettres fausseraient
  // le compte hexadécimal et feraient signaler une clé parfaitement formée.
  const corps = valeur.startsWith('atsk_') ? valeur.slice(5) : valeur;
  const hex = (corps.match(/[0-9a-f]/gi) ?? []).length;
  const morceaux = [`${valeur.length} car.`];

  if (valeur.startsWith('atsk_')) morceaux.push('préfixe atsk_');
  if (hex !== corps.length) morceaux.push(`${hex} hex sur ${corps.length}`);

  const marques = marquesDe(valeur);
  if (marques.length > 0) morceaux.push(`contient ${marques.join(' et ')}`);

  return morceaux.join(', ');
}

/**
 * La forme d'un nom d'application.
 *
 * Un nom d'application Africa's Talking est un mot : quelques lettres, parfois
 * un chiffre ou un tiret. Une arobase ou un espace dit qu'on a rangé là une
 * adresse de courriel ou une phrase, ce qui est arrivé deux fois.
 */
export function formeCompte(valeur: string): string {
  const marques = marquesDe(valeur);
  const morceaux = [`${valeur.length} car.`];
  if (marques.length > 0) morceaux.push(`contient ${marques.join(' et ')}`);
  return morceaux.join(', ');
}

const AT_HOTES = {
  production: 'https://api.africastalking.com',
  bacASable: 'https://api.sandbox.africastalking.com',
} as const;

/** Un appel de sonde vers un hôte donné. Rend le verdict brut, sans le juger. */
async function sonderChez(
  hote: string,
  identifiants: Identifiants,
  recuperer: typeof fetch,
): Promise<{ ok: boolean; statut: number; extrait: string }> {
  const url = `${hote}/version1/user?username=${encodeURIComponent(identifiants.compte)}`;
  const reponse = await recuperer(url, {
    headers: { apiKey: identifiants.secret, Accept: 'application/json' },
  });
  const extrait = (await reponse.text()).replace(/\s+/g, ' ').trim().slice(0, 100);
  return { ok: reponse.ok, statut: reponse.status, extrait };
}

export async function verifierIdentifiants(
  identifiants: Identifiants,
  recuperer: typeof fetch = fetch,
): Promise<string> {
  if (identifiants.fournisseur !== 'africastalking') return 'SONDE_NON_APPLICABLE';

  // Les longueurs, et pas les valeurs. Une clé Africa's Talking a une taille
  // stable ; un caractère de trop trahit un copier-coller qui a mordu, et
  // c'est invisible dans un champ de tableau de bord. Sans ce chiffre on
  // régénère une clé parfaitement valide — ce qui a déjà été fait deux fois.
  const formes = `compte ${formeCompte(identifiants.compte)}, clé ${formeCle(identifiants.secret)}`;

  let production: { ok: boolean; statut: number; extrait: string };
  try {
    production = await sonderChez(AT_HOTES.production, identifiants, recuperer);
  } catch (cause) {
    return `SONDE_IMPOSSIBLE ${cause instanceof Error ? cause.name : ''}`.trim();
  }

  if (production.ok) {
    // Sans la réponse d'Africa's Talking : elle porte le solde du compte, et ce
    // verdict sort par HTTP. Un refus, lui, rend son motif — c'est tout ce
    // qu'on lui demande, et il ne dit rien de l'état du compte.
    return 'COMPTE_RECONNU';
  }

  // Le bac à sable, demandé seulement après un refus.
  //
  // Africa's Talking ouvre tout compte neuf sur une application de bac à sable,
  // et sa clé ne vaut que là : présentée à la production, elle rend le même 401
  // qu'une clé fausse. Deux corrections de bonne foi — régénérer la clé, puis
  // corriger le nom d'utilisateur — n'y changent rien, et rien dans la réponse
  // ne distingue les deux causes.
  //
  // Cet appel les sépare. Il ne répare rien : un message envoyé au bac à sable
  // ne sort pas de leur simulateur et n'atteint aucun téléphone. Il dit
  // seulement que ce qu'il faut corriger est le compte, pas le champ.
  let bac: { ok: boolean; statut: number; extrait: string } | null = null;
  try {
    bac = await sonderChez(AT_HOTES.bacASable, identifiants, recuperer);
  } catch {
    // Une sonde secondaire muette ne doit rien retirer à la première.
  }

  if (bac?.ok) {
    return `COMPTE_BAC_A_SABLE — ces identifiants sont ceux du bac à sable, refusés en production [${formes}]`;
  }

  return `COMPTE_REFUSE ${production.statut} — ${production.extrait} [${formes}]`;
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

/**
 * La requête demande-t-elle une sonde plutôt qu'un drainage ?
 *
 * Chercher pourquoi un SMS ne part pas supposait jusqu'ici d'en envoyer un :
 * remettre en file l'avis d'un vrai client, appeler le drainage, et lire la
 * raison du refus. Un avis daté de la veille arrive alors chez quelqu'un qui
 * n'a rien fait aujourd'hui, pour un diagnostic qui ne le concerne pas.
 *
 * Un corps `{"sonde": true}` demande la seule question qui vaille — « ces
 * identifiants sont-ils acceptés ? » — sans destinataire, sans message, et sans
 * toucher à la file.
 *
 * Un corps vide ou illisible n'est pas une erreur : c'est l'appel de la tâche
 * planifiée, qui n'en envoie aucun.
 */
export async function sondeDemandee(requete: Request): Promise<boolean> {
  try {
    const corps: unknown = await requete.json();
    if (typeof corps !== 'object' || corps === null) return false;
    return (corps as Record<string, unknown>).sonde === true;
  } catch {
    return false;
  }
}

