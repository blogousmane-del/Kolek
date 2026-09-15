import { CONTRAINTES_DE_MONTANT, RLS_PORTES_D_ENTREE } from './hors-ligne/classer';
import { ajouter, annuler, avancer, type Construction, type ResultatAjout } from './hors-ligne/file';
import { construireCarte, construireClientCarte, construireMise } from './hors-ligne/gestes';
import type { Operation, Tournee } from './hors-ligne/modele';
import { apresGeste, collecteurCourant, demanderRafraichissement } from './hors-ligne/moteur';
import { lireProfil, modifierInstantane, ouvrirBase, type BaseLocale } from './hors-ligne/stockage-local';
import { PHRASES, phraseEcriture, type EchecEcriture } from './phrases';
import { supabase } from './supabase';

/**
 * Les écritures de l'application collecteur.
 *
 * ## Deux chemins, depuis J2b
 *
 * **Les gestes de la collecte** — encaisser, inscrire un client avec sa carte,
 * ouvrir une carte — entrent dans la file du téléphone (`hors-ligne/file.ts`),
 * en ligne comme hors ligne. Le geste est vérifié contre la tournée et écrit sur
 * le disque dans une même transaction ; le synchroniseur l'envoie ensuite, dans
 * l'ordre, et consigne tout refus. Rien n'est montré comme fait avant d'être sur
 * le disque (spec §4.1).
 *
 * **Les corrections** — consentement aux avis, fiche du client — restent en
 * ligne (spec §1.2) : ce sont des modifications, donc des conflits possibles
 * entre deux appareils. Après succès, la tournée du téléphone est retouchée pour
 * que l'écran ne montre pas l'ancienne valeur jusqu'au prochain rafraîchissement.
 *
 * Aucune Edge Function ici, et c'est voulu : les `GRANT INSERT` nomment les
 * colonnes qu'un collecteur peut écrire, et les politiques RLS exigent
 * `collecteur_id = auth.uid()`. Un serveur intermédiaire déplacerait le contrôle
 * hors de l'endroit où il est déjà appliqué.
 *
 * ## Les identifiants viennent du téléphone
 *
 * `crypto.randomUUID()`, pas la base (`hors-ligne/gestes.ts`). C'est le
 * mécanisme anti-double-comptage du produit : un rejeu porte le même
 * identifiant, la clé primaire est violée, et `mises_avant_insert` répond
 * `DOUBLON`. Laisser la base engendrer l'identifiant ferait de chaque rejeu une
 * seconde mise — de l'argent compté deux fois.
 */

export type { EchecEcriture };

/**
 * La phrase d'un code court — la table vit dans `phrases.ts`. Réexportée ici
 * parce que `encaisserPour` et les écrans l'importent d'ici.
 */
export { phraseEcriture };

/**
 * Traduit une erreur PostgREST en code court, pour les écritures restées en
 * ligne. Les opérations de la file, elles, passent par `hors-ligne/classer.ts`.
 *
 * L'ordre compte : les messages des déclencheurs voyagent dans `message` avec
 * le code SQLSTATE générique `P0001`, donc on les cherche avant de se rabattre
 * sur le SQLSTATE.
 */
export function codeDErreur(erreur: { code?: string; message?: string } | null): string {
  if (!erreur) return 'INCONNU';
  const message = erreur.message ?? '';

  for (const cle of [
    'DOUBLON',
    'CARTE_INTROUVABLE',
    'CARTE_CLOTUREE',
    'CYCLE_COMPLET',
    'MONTANT_INVALIDE',
    // Écart 2 : la fenêtre de date tombait sur « Réessaie », une consigne qui
    // ne peut pas réussir.
    'DATE_INVALIDE',
  ]) {
    if (message.includes(cle)) return cle;
  }

  // 23514 : une contrainte CHECK. Deux familles se cachent derrière ce seul
  // code — les bornes de longueur du texte et les bornes de montant — et
  // Postgres ne les distingue que par le nom de la contrainte, qu'il place dans
  // le message. L'écran d'ouverture de carte n'envoie que `mise` : y lire
  // « Une des informations saisies est trop longue » envoyait le collecteur
  // relire un nom de client qui n'était pas en cause.
  if (erreur.code === '23514') {
    return CONTRAINTES_DE_MONTANT.some((nom) => message.includes(nom)) ? 'BORNE_MONTANT' : 'BORNE';
  }
  // 23505 : une unicité violée. Doublon seulement sur une clé primaire — un
  // rejeu. Écart 1 : `caisses_jour (collecteur_id, date)` ou la commission
  // unique d'une carte sortaient aussi en « déjà enregistrée ».
  if (erreur.code === '23505') {
    return /_pkey"/.test(message) ? 'DOUBLON' : 'CONFLIT_UNIQUE';
  }
  // 42501 : RLS ou liste blanche de colonnes. Un refus de policy sur `clients`
  // ou `cartes` désigne l'abonnement — l'autre condition, `collecteur_id =
  // auth.uid()`, est posée depuis la session. Tout le reste est un défaut de
  // l'application, pas de la saisie.
  if (erreur.code === '42501') {
    return RLS_PORTES_D_ENTREE.test(message) ? 'ABONNEMENT_INACTIF' : 'DROIT_REFUSE';
  }

  return 'INCONNU';
}

function echec(erreur: { code?: string; message?: string } | null): EchecEcriture {
  return phraseEcriture(codeDErreur(erreur));
}

/**
 * Vérifie un geste contre la tournée et l'écrit dans la file, puis réveille le
 * moteur. Partagée avec `ecritures-ecrans.ts` pour la caisse du jour.
 *
 * Une base qui ne s'ouvre pas — stockage bloqué, navigation privée stricte —
 * refuse le geste avec `STOCKAGE` : rien n'est montré comme fait (§4.1).
 */
export async function ajouterAuTelephone<O extends Operation>(
  collecteurId: string,
  construire: Construction<O>,
): Promise<ResultatAjout<O>> {
  let base: BaseLocale;
  try {
    base = await ouvrirBase(collecteurId);
  } catch {
    return { ok: false, echec: phraseEcriture('STOCKAGE') };
  }
  const resultat = await ajouter(base, construire);
  if (resultat.ok) apresGeste();
  return resultat;
}

/** Le dernier `abonnement_statut` lu sur ce téléphone. `null` : jamais lu, le serveur tranchera. */
async function dernierStatutConnu(collecteurId: string): Promise<string | null> {
  try {
    return (await lireProfil(await ouvrirBase(collecteurId)))?.abonnementStatut ?? null;
  } catch {
    return null;
  }
}

/**
 * Après une écriture restée en ligne : la tournée du téléphone prend la valeur
 * écrite, puis le moteur la relit du serveur. Le report évite que l'écran
 * remontre l'ancienne valeur le temps d'un aller-retour ; le rafraîchissement
 * remet la vérité du serveur par-dessus.
 */
async function retoucherTournee(modifier: (t: Tournee) => void): Promise<void> {
  const collecteurId = collecteurCourant();
  if (!collecteurId) return;
  try {
    await modifierInstantane(await ouvrirBase(collecteurId), modifier);
  } catch {
    // Disque illisible : le rafraîchissement demandé ci-dessous remettra la
    // tournée d'accord.
  }
  demanderRafraichissement();
}

export interface NouveauClient {
  nom: string;
  telephone?: string;
  marche?: string;
  activite?: string;
  /** Mise journalière de la première carte. */
  mise: number;
  /** Le client accepte de recevoir un avis à chaque mouvement. Faux par
      défaut : laisser un numéro n'est pas consentir à être notifié. */
  avisActifs?: boolean;
}

export interface ResultatCreation {
  clientId: string;
  carteId: string;
}

/**
 * Inscrit un client et lui ouvre sa première carte — une seule opération.
 *
 * Le synchroniseur l'envoie en deux étapes, client puis carte, et garde
 * l'avancement de chacune : un rejeu reprend là où il s'était arrêté, et un
 * client arrivé sans sa carte ne se perd plus dans un message d'erreur.
 */
export async function creerClientAvecCarte(
  collecteurId: string,
  saisie: NouveauClient,
): Promise<{ ok: true; resultat: ResultatCreation } | { ok: false; echec: EchecEcriture }> {
  const abonnementStatut = await dernierStatutConnu(collecteurId);
  const resultat = await ajouterAuTelephone(
    collecteurId,
    construireClientCarte({ collecteurId, maintenant: Date.now(), abonnementStatut }, saisie),
  );
  if (!resultat.ok) return resultat;
  return {
    ok: true,
    resultat: {
      clientId: resultat.operation.charge.client.id,
      carteId: resultat.operation.charge.carte.id,
    },
  };
}

/**
 * Enregistre une mise sur une carte.
 *
 * `options.sursisMs` : le sursis de la fiche client (§7). L'opération est sur
 * le disque dès l'appui, et ne part qu'après ; « Annuler » la retire d'ici là
 * (`annulerMise`). Sans sursis, elle part au plus tôt.
 *
 * `est_commission` n'est jamais envoyé : le serveur le décide seul, en
 * regardant si la carte a déjà encaissé.
 */
export async function enregistrerMise(
  collecteurId: string,
  carteId: string,
  montant: number,
  /** Injectable pour les épreuves ; sinon l'heure du téléphone. */
  encaisseLe: Date = new Date(),
  options: { sursisMs?: number } = {},
): Promise<
  { ok: true; miseId: string; operationId: string } | { ok: false; echec: EchecEcriture }
> {
  const resultat = await ajouterAuTelephone(
    collecteurId,
    construireMise(
      { collecteurId, maintenant: Date.now(), sursisMs: options.sursisMs },
      { carteId, montant, encaisseLe },
    ),
  );
  if (!resultat.ok) return resultat;
  return { ok: true, miseId: resultat.operation.charge.id, operationId: resultat.operation.id };
}

/**
 * « Annuler » pendant le sursis. `'partie'` : l'heure est passée, l'opération
 * part ou est partie — l'écran le dit au lieu de promettre une annulation.
 */
export async function annulerMise(
  collecteurId: string,
  operationId: string,
): Promise<'annulee' | 'partie' | 'absente'> {
  const issue = await annuler(await ouvrirBase(collecteurId), operationId);
  if (issue === 'annulee') apresGeste();
  return issue;
}

/** Fait partir tout de suite une mise encore en sursis : la fiche se ferme, ou l'application passe en arrière-plan. */
export async function avancerEnvoi(collecteurId: string, operationId: string): Promise<void> {
  await avancer(await ouvrirBase(collecteurId), operationId);
  apresGeste();
}

/**
 * Enregistre — ou retire — le consentement d'un client aux avis. Reste en ligne.
 *
 * C'est la seule colonne de `clients` que cet écran écrit après coup, et la
 * seule écriture du produit qui engage la vie privée de quelqu'un qui n'est pas
 * l'utilisateur de l'application. Le collecteur est le bon porteur du geste :
 * il est devant le client. Et le retrait doit être aussi facile que l'octroi —
 * d'où un booléen plutôt qu'un `activerAvis`.
 */
export async function definirConsentementAvis(
  clientId: string,
  accepte: boolean,
): Promise<{ ok: true } | { ok: false; echec: EchecEcriture }> {
  const { data, error } = await supabase
    .from('clients')
    .update({ avis_actifs: accepte })
    .eq('id', clientId)
    .select('id');

  if (error) return { ok: false, echec: echec(error) };

  // Le `.select()` n'est pas là pour lire la ligne : il est là pour la
  // **compter**. Un `update().eq()` nu ne rend aucune erreur quand RLS ou un
  // privilège de colonne écarte la ligne — PostgREST répond 204, zéro ligne
  // touchée, `error` à null. Constaté le 2026-08-24. Un retrait de consentement
  // qu'on croit enregistré et qui ne l'est pas continue d'envoyer le solde
  // d'épargne de quelqu'un sur un téléphone qu'il partage.
  if (!data || data.length === 0) {
    return { ok: false, echec: { code: 'RIEN_ECRIT', message: PHRASES.RIEN_ECRIT! } };
  }

  await retoucherTournee((t) => {
    const client = t.clients.find((c) => c.id === clientId);
    if (client) client.avisActifs = accepte;
  });
  return { ok: true };
}

/** Les quatre champs qu'un collecteur peut corriger sur la fiche d'un client. */
export interface CorrectionClient {
  nom: string;
  telephone: string;
  marche: string;
  activite: string;
}

/**
 * Corrige la fiche d'un client. Reste en ligne.
 *
 * ## Pourquoi seuls les champs changés partent
 *
 * Envoyer tout le formulaire écraserait le marché d'un client avec une chaîne
 * vide si le champ n'avait pas été rechargé. Quand rien n'a changé, **rien ne
 * part** : pas de requête, pas de ligne au journal d'audit, et `ecrit: false`.
 *
 * ## Pourquoi le numéro emporte le consentement
 *
 * Le déclencheur de notification lit `client.telephone` **au moment de la
 * mise**. Corriger le numéro d'un client aux avis actifs enverrait son solde à
 * un numéro que personne n'a accepté. `avis_actifs: false` part **dans la même
 * requête** que le numéro : deux écritures laisseraient une fenêtre où le
 * nouveau numéro cohabite avec l'ancien consentement. Mesuré en production le
 * 2026-09-11 : 68 clients sur 81 ont les avis actifs.
 *
 * ## Pourquoi `.select('id')`
 *
 * Même raison que `definirConsentementAvis` : sans lui, un refus de RLS passe
 * pour un succès.
 */
export async function modifierClient(
  clientId: string,
  correction: CorrectionClient,
  origine: CorrectionClient,
): Promise<{ ok: true; ecrit: boolean } | { ok: false; echec: EchecEcriture }> {
  const nom = correction.nom.trim();
  if (!nom) return { ok: false, echec: phraseEcriture('NOM_VIDE') };

  const champs: Record<string, string | boolean | null> = {};

  if (nom !== origine.nom.trim()) champs.nom = nom;

  // `|| null` et non la chaîne vide : le journal d'audit doit lire « le champ
  // était vide ». La production n'a aucune chaîne vide dans ces colonnes
  // (mesuré le 2026-09-11) ; ce formulaire ne sera pas le premier à en écrire.
  for (const cle of ['telephone', 'marche', 'activite'] as const) {
    const valeur = correction[cle].trim();
    if (valeur !== origine[cle].trim()) champs[cle] = valeur || null;
  }

  // Dans la même requête, jamais dans une seconde — voir la note ci-dessus.
  if ('telephone' in champs) champs.avis_actifs = false;

  if (Object.keys(champs).length === 0) return { ok: true, ecrit: false };

  const { data, error } = await supabase
    .from('clients')
    .update(champs)
    .eq('id', clientId)
    .select('id');

  if (error) return { ok: false, echec: echec(error) };
  if (!data || data.length === 0) {
    return { ok: false, echec: { code: 'RIEN_ECRIT', message: PHRASES.RIEN_ECRIT! } };
  }

  await retoucherTournee((t) => {
    const client = t.clients.find((c) => c.id === clientId);
    if (!client) return;
    if (typeof champs.nom === 'string') client.nom = champs.nom;
    for (const cle of ['telephone', 'marche', 'activite'] as const) {
      if (cle in champs) client[cle] = champs[cle] as string | null;
    }
    if ('telephone' in champs) client.avisActifs = false;
  });
  return { ok: true, ecrit: true };
}

/**
 * Ouvre une nouvelle carte pour un client qui en avait déjà une.
 *
 * Un client ne s'inscrit qu'une fois ; il ouvre des cartes toute sa vie — après
 * les 31 mises d'un cycle, après une restitution, ou pour changer de montant.
 * Plusieurs carnets à la fois sont permis depuis
 * `20260825090000_cartes_multiples.sql` : chaque carte porte son solde, et
 * `retraits.carte_id` est unique, donc on rend l'argent d'une carte et jamais
 * d'un client.
 */
export async function ouvrirCarte(
  collecteurId: string,
  clientId: string,
  mise: number,
): Promise<{ ok: true; carteId: string } | { ok: false; echec: EchecEcriture }> {
  const abonnementStatut = await dernierStatutConnu(collecteurId);
  const resultat = await ajouterAuTelephone(
    collecteurId,
    construireCarte({ collecteurId, maintenant: Date.now(), abonnementStatut }, { clientId, mise }),
  );
  if (!resultat.ok) return resultat;
  return { ok: true, carteId: resultat.operation.charge.id };
}
