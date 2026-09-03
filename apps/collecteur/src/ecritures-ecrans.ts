import { type EchecEcriture, codeDErreur, phraseEcriture } from './ecritures';
import { supabase } from './supabase';

/**
 * Les deux écritures des nouveaux écrans : déclarer sa caisse, clôturer une
 * carte.
 *
 * Elles n'empruntent pas le même chemin, et la différence n'est pas un hasard
 * d'implémentation — c'est le schéma qui l'impose :
 *
 * - **La caisse** s'écrit directement. `authenticated` a `insert (id,
 *   collecteur_id, date, cash_declare)` et `update (cash_declare)` sur
 *   `caisses_jour`, et rien de plus. `cash_attendu` est posé par un déclencheur
 *   depuis les mises, `ecart` est une colonne engendrée. Le collecteur déclare
 *   donc ce qu'il a en main sans jamais pouvoir toucher à ce qu'il devrait
 *   avoir — sinon masquer un manquant tiendrait en une requête.
 *
 * - **La clôture** passe par une Edge Function. `retraits` n'accorde que
 *   `select` à `authenticated` : la table est un journal d'argent rendu, et son
 *   écriture engage aussi le passage de la carte en `cloturee`. Deux tables,
 *   une seule vérité, donc un seul geste — que PostgREST ne sait pas rendre
 *   atomique.
 */

const PHRASES: Record<string, string> = {
  MONTANT_INVALIDE: 'Le montant déclaré doit être un nombre positif.',
  DROIT_REFUSE: 'Tu n’as pas le droit d’écrire cette ligne.',
  RESEAU: 'Pas de réseau. Réessaie une fois connecté.',
  CARTE_INTROUVABLE: 'Cette carte n’existe pas ou ne t’appartient pas.',
  CARTE_DEJA_CLOTUREE: 'Cette carte est déjà clôturée.',
  ACCES_RESERVE: 'Session expirée. Reconnecte-toi.',
  JETON_ABSENT: 'Session expirée. Reconnecte-toi.',
  CLOTURE_IMPOSSIBLE: 'Clôture impossible. Réessaie.',
  // Le seul message de cette table qui porte une consigne plutôt qu'un constat.
  // Dans ce cas précis le retrait est déjà inscrit au journal, et le journal est
  // immuable : si le collecteur croit à un échec, il rend l'argent une seconde
  // fois et personne ne le rattrape. La phrase doit donc dire d'abord ce qu'il
  // ne faut pas faire.
  CLOTURE_PARTIELLE:
    'Le retrait est déjà inscrit — ne rends pas l’argent une seconde fois. Seule la fermeture de la carte a échoué : reprends la clôture, elle terminera le travail sans créer de doublon.',
  INCONNU: 'Enregistrement impossible. Réessaie.',
};

function phrase(code: string): EchecEcriture {
  return { code, message: PHRASES[code] ?? PHRASES.INCONNU! };
}

/* --------------------------- Rapprochement ------------------------------- */

export type ResultatCaisse =
  | { ok: true; cashAttendu: number; cashDeclare: number; ecart: number }
  | { ok: false; echec: EchecEcriture };

/**
 * Déclare le cash réellement en main pour la journée.
 *
 * Lecture puis écriture explicite, plutôt qu'un `upsert`. La raison est la liste
 * blanche de colonnes : PostgREST, sur conflit, réaffecte **toutes** les
 * colonnes envoyées, `id` et `collecteur_id` compris. Or `update` n'est accordé
 * que sur `cash_declare`. Un `upsert` marcherait à la première déclaration du
 * jour et échouerait en `42501` à la correction — le cas le plus utile.
 *
 * `ligneId` évite de relire : l'écran vient de charger le rapprochement, il sait
 * déjà s'il existe une ligne.
 */
export async function declarerCaisse(
  collecteurId: string,
  date: string,
  montant: number,
  ligneId: string | null,
): Promise<ResultatCaisse> {
  if (!Number.isInteger(montant) || montant < 0) {
    return { ok: false, echec: phrase('MONTANT_INVALIDE') };
  }

  const requete = ligneId
    ? supabase.from('caisses_jour').update({ cash_declare: montant }).eq('id', ligneId)
    : supabase
        .from('caisses_jour')
        .insert({ collecteur_id: collecteurId, date, cash_declare: montant });

  // `select()` après écriture : `cash_attendu` et `ecart` sont posés par le
  // serveur, donc les recevoir en retour est la seule façon de montrer l'écart
  // sans faire un second aller-retour.
  const { data, error } = await requete.select('cash_attendu, cash_declare, ecart').maybeSingle();

  if (error) return { ok: false, echec: phrase(codeDErreur(error)) };

  const ligne = data as { cash_attendu: number; cash_declare: number; ecart: number } | null;
  if (!ligne) return { ok: false, echec: phrase('INCONNU') };

  return {
    ok: true,
    cashAttendu: ligne.cash_attendu,
    cashDeclare: ligne.cash_declare,
    ecart: ligne.ecart,
  };
}

/* ------------------------------- Retrait --------------------------------- */

export type ResultatCloture =
  | { ok: true; montantRestitue: number; commission: number }
  | { ok: false; echec: EchecEcriture };

/**
 * Clôture une carte et restitue son solde.
 *
 * Le montant n'est pas envoyé : il est recalculé par le serveur depuis
 * `mises_encaissees` et `mise`. L'envoyer laisserait le client décider de ce
 * qu'il rend, et un écran périmé — la carte a reçu une mise entre-temps —
 * restituerait le mauvais chiffre sans que rien ne s'en aperçoive.
 */
export async function cloturerCarte(carteId: string): Promise<ResultatCloture> {
  const { data, error } = await supabase.functions.invoke('collecteur-cloturer-carte', {
    body: { carteId },
  });

  if (error) {
    let code = 'CLOTURE_IMPOSSIBLE';
    try {
      const contexte = (error as { context?: Response }).context;
      if (contexte && typeof contexte.json === 'function') {
        code = ((await contexte.json()) as { erreur?: string }).erreur ?? code;
      }
    } catch {
      // Corps illisible : le message générique reste juste.
    }
    return { ok: false, echec: phrase(code) };
  }

  // `invoke` ne remplit `error` que pour un statut hors 2xx. Or la clôture
  // partielle rend **207**, qui est un succès pour le transport et un échec pour
  // le métier. Sans ce second examen, le message le plus important de l'écran —
  // « ne rends pas l'argent deux fois » — ne s'afficherait jamais, et le corps
  // serait lu comme une clôture réussie avec une commission indéfinie.
  const corps = data as { montantRestitue?: number; commission?: number; erreur?: string };
  if (corps.erreur) return { ok: false, echec: phrase(corps.erreur) };

  return {
    ok: true,
    montantRestitue: corps.montantRestitue ?? 0,
    commission: corps.commission ?? 0,
  };
}

/* ------------------------------- L'équipe -------------------------------- */

export interface SaisieCollaborateur {
  email: string;
  motDePasse: string;
  nom: string;
  telephone: string;
  zone?: string;
}

export type ResultatCollaborateur =
  | { ok: true; collaborateurId: string }
  | { ok: false; echec: EchecEcriture };

/** Les refus de `collecteur-creer-collaborateur`, en phrases. */
const PHRASES_COLLABORATEUR: Record<string, string> = {
  ACCES_RESERVE:
    'Réservé au forfait Illimité, et à trois collaborateurs au plus. Vérifie ton abonnement.',
  EMAIL_DEJA_PRIS: 'Cette adresse est déjà utilisée par un autre compte.',
  TELEPHONE_DEJA_PRIS: 'Ce numéro est déjà utilisé par un autre compte.',
  MOT_DE_PASSE_COMPROMIS: 'Ce mot de passe figure dans des fuites connues. Choisis-en un autre.',
  TROP_DE_TENTATIVES: 'Trop de créations en peu de temps. Réessaie dans une heure.',
  EMAIL_INVALIDE: 'Cette adresse ne ressemble pas à une adresse.',
  MOT_DE_PASSE_TROP_COURT: 'Le mot de passe doit faire au moins 10 caractères.',
  NOM_VIDE: 'Le nom du collaborateur est obligatoire.',
  // Le compte existe : le dire, et le nommer. Un auth.users orphelin qu'on ne
  // sait pas nommer est pire qu'un compte à rattacher à la main.
  RATTACHEMENT_REFUSE:
    'Le compte est créé mais n’a pas pu être rattaché à ton équipe. Donne son adresse au support.',
};

/**
 * Crée un collaborateur et le rattache.
 *
 * Passe par une Edge Function parce que créer un compte exige la clé de service.
 * La conséquence est la même que pour l'encaissement d'équipe : **ce geste exige
 * le réseau**, et l'écran doit le dire plutôt que de laisser un bouton échouer.
 */
export async function creerCollaborateur(
  saisie: SaisieCollaborateur,
): Promise<ResultatCollaborateur> {
  const { data, error } = await supabase.functions.invoke('collecteur-creer-collaborateur', {
    body: saisie,
  });

  if (error) {
    // Même lecture que `cloturerCarte` : `invoke` range le corps de la réponse
    // dans `context` quand le statut n'est pas 2xx. Sans elle, tout refus
    // deviendrait « impossible, réessaie » — y compris « adresse déjà prise »,
    // le seul que le titulaire peut corriger seul.
    let code = 'CREATION_IMPOSSIBLE';
    try {
      const contexte = (error as { context?: Response }).context;
      if (contexte && typeof contexte.json === 'function') {
        code = ((await contexte.json()) as { erreur?: string }).erreur ?? code;
      }
    } catch {
      code = 'RESEAU';
    }
    return {
      ok: false,
      echec: {
        code,
        message: PHRASES_COLLABORATEUR[code] ?? PHRASES[code] ?? 'Création impossible. Réessaie.',
      },
    };
  }

  const collaborateurId = (data as { collaborateurId?: string } | null)?.collaborateurId;
  if (!collaborateurId) {
    return {
      ok: false,
      echec: { code: 'CREATION_IMPOSSIBLE', message: 'Création impossible. Réessaie.' },
    };
  }
  return { ok: true, collaborateurId };
}

export type ResultatEncaissementPour =
  | { ok: true; miseId: string }
  | { ok: false; echec: EchecEcriture };

/**
 * Encaisse une mise sur la carte d'un coéquipier.
 *
 * Le passage par une Edge Function n'est pas un détail d'implémentation : c'est
 * ce qui fait que ce geste **exige le réseau**, là où la tournée du collecteur
 * reste hors ligne. Rien n'entre dans la file de synchro, donc rien ne partira
 * à la reconnexion — l'écran doit le dire, pas laisser un bouton échouer.
 *
 * L'identifiant vient d'ici, comme pour `enregistrerMise` : c'est le mécanisme
 * anti-double-comptage du produit. Un rejeu porte le même identifiant et sort en
 * `DOUBLON` plutôt qu'en second encaissement.
 */
export async function encaisserPour(
  carteId: string,
  montant: number,
  encaisseLe: Date = new Date(),
): Promise<ResultatEncaissementPour> {
  const miseId = crypto.randomUUID();
  const { error } = await supabase.functions.invoke('collecteur-encaisser-pour', {
    body: { miseId, carteId, montant, encaisseLe: encaisseLe.toISOString() },
  });

  if (error) {
    let code = 'ENCAISSEMENT_IMPOSSIBLE';
    try {
      const contexte = (error as { context?: Response }).context;
      if (contexte && typeof contexte.json === 'function') {
        code = ((await contexte.json()) as { erreur?: string }).erreur ?? code;
      }
    } catch {
      code = 'RESEAU';
    }
    // Les refus métier reprennent les phrases du chemin ordinaire, par
    // `codeDErreur`/`PHRASES` d'`ecritures.ts` : deux libellés pour « le cycle
    // est complet » seraient deux vérités concurrentes.
    return { ok: false, echec: phraseEcriture(code) };
  }

  return { ok: true, miseId };
}
