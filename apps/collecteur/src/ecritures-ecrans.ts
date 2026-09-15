import { ajouterAuTelephone, phraseEcriture, type EchecEcriture } from './ecritures';
import { construireCaisse } from './hors-ligne/gestes';
import { collecteurCourant, demanderRafraichissement } from './hors-ligne/moteur';
import { modifierInstantane, ouvrirBase } from './hors-ligne/stockage-local';
import { supabase } from './supabase';

/**
 * Les deux écritures des nouveaux écrans : déclarer sa caisse, clôturer une
 * carte.
 *
 * Elles n'empruntent pas le même chemin, et la différence n'est pas un hasard
 * d'implémentation — c'est le schéma qui l'impose :
 *
 * - **La caisse** entre dans la file du téléphone (J2b §6.4), et le
 *   synchroniseur l'écrit. `authenticated` a `insert (id, collecteur_id, date,
 *   cash_declare)` et `update (cash_declare)` sur `caisses_jour`, et rien de
 *   plus. `cash_attendu` est posé par un déclencheur depuis les mises, `ecart`
 *   est une colonne engendrée. Le collecteur déclare donc ce qu'il a en main
 *   sans jamais pouvoir toucher à ce qu'il devrait avoir — sinon masquer un
 *   manquant tiendrait en une requête.
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

export type ResultatCaisse = { ok: true } | { ok: false; echec: EchecEcriture };

/**
 * Déclare le cash réellement en main pour la journée — sur le téléphone d'abord.
 *
 * La déclaration entre dans la file ; le synchroniseur l'écrit « dernière
 * déclaration gagne » : insertion, puis mise à jour de `cash_declare` sur
 * conflit, sans jamais d'`upsert` — PostgREST y réaffecterait `id` et
 * `collecteur_id`, que `update` n'accorde pas (`hors-ligne/envoyer.ts`).
 *
 * L'identifiant de la ligne est tiré à la première déclaration du jour et repris
 * ensuite, depuis la tournée (plan J2b, précision 9). `cash_attendu` et `ecart`
 * restent posés par le serveur ; l'écran montre un attendu provisoire jusqu'au
 * rafraîchissement.
 */
export async function declarerCaisse(
  collecteurId: string,
  date: string,
  montant: number,
): Promise<ResultatCaisse> {
  const resultat = await ajouterAuTelephone(
    collecteurId,
    construireCaisse({ collecteurId, maintenant: Date.now() }, { date, montant }),
  );
  return resultat.ok ? { ok: true } : resultat;
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
    // Refusée — la carte a pu être fermée ailleurs — ou sans réponse alors que
    // la fermeture a pu se faire : la tournée relit la carte plutôt que de la
    // garder active, et la caisse du jour cesse de se dire juste.
    await perimerCaisseDuJour(jourUtc(new Date()));
    return { ok: false, echec: phrase(code) };
  }

  // `invoke` ne remplit `error` que pour un statut hors 2xx. Or la clôture
  // partielle rend **207**, qui est un succès pour le transport et un échec pour
  // le métier. Sans ce second examen, le message le plus important de l'écran —
  // « ne rends pas l'argent deux fois » — ne s'afficherait jamais, et le corps
  // serait lu comme une clôture réussie avec une commission indéfinie.
  const corps = data as { montantRestitue?: number; commission?: number; erreur?: string };
  if (corps.erreur) {
    // Une clôture partielle a déjà inscrit le retrait au serveur : la tournée
    // doit le relire, même si la carte n'est pas encore fermée, et la caisse du
    // jour a changé au serveur.
    await perimerCaisseDuJour(jourUtc(new Date()));
    return { ok: false, echec: phrase(corps.erreur) };
  }

  await noterCloture(carteId, corps.montantRestitue ?? 0);
  return {
    ok: true,
    montantRestitue: corps.montantRestitue ?? 0,
    commission: corps.commission ?? 0,
  };
}

/**
 * La clôture réussie, portée dans l'instantané du téléphone.
 *
 * La clôture reste en ligne (spec J2b §1.2). Sans ce report, la tournée
 * garderait la carte active jusqu'au prochain rafraîchissement, et l'écran
 * proposerait d'encaisser sur une carte que le serveur refusera. Le retrait
 * noté ici porte un identifiant provisoire : le rafraîchissement le remplace
 * par la ligne du serveur.
 *
 * La caisse du jour suit, comme `caisses_rafraichir_apres_retrait` au serveur :
 * l'argent rendu sort de l'attendu, une seule fois — seulement quand le retrait
 * est noté ici, donc absent de la tournée. Sur la carte d'un coéquipier, absente
 * de cette tournée, rien n'est recompté : l'écart est seulement oublié.
 */
async function noterCloture(carteId: string, montantRestitue: number): Promise<void> {
  const collecteurId = collecteurCourant();
  if (collecteurId) {
    try {
      const maintenant = new Date();
      const quand = maintenant.toISOString();
      await modifierInstantane(await ouvrirBase(collecteurId), (t) => {
        const ligne = t.caisses.find((c) => c.date === jourUtc(maintenant));
        if (ligne) ligne.ecart = null;
        const carte = t.cartes.find((k) => k.id === carteId);
        if (!carte) return;
        carte.statut = 'cloturee';
        carte.clotureeLe = quand;
        if (!t.retraits.some((r) => r.carteId === carteId)) {
          t.retraits.push({
            id: `retrait-${carteId}`,
            carteId,
            montantRestitue,
            effectueLe: quand,
            restituePar: collecteurId,
          });
          if (ligne && ligne.cashAttendu !== null) ligne.cashAttendu -= montantRestitue;
        }
      });
    } catch {
      // Disque illisible : le rafraîchissement demandé ci-dessous remettra la
      // tournée d'accord.
    }
  }
  demanderRafraichissement();
}

/**
 * Un geste en ligne a pu changer la caisse du jour au serveur sans que la
 * tournée le voie : un encaissement pour un coéquipier, une clôture refusée,
 * partielle ou sans réponse.
 *
 * L'écart gardé est oublié, l'écran se dit provisoire, et la tournée est relue.
 * L'attendu n'est pas recompté : un rechargement concurrent a pu déjà porter le
 * geste, et l'ajouter ici le compterait deux fois.
 */
async function perimerCaisseDuJour(jour: string): Promise<void> {
  const collecteurId = collecteurCourant();
  if (collecteurId) {
    try {
      await modifierInstantane(await ouvrirBase(collecteurId), (t) => {
        const ligne = t.caisses.find((c) => c.date === jour);
        if (ligne) ligne.ecart = null;
      });
    } catch {
      // Disque illisible : la relecture demandée ci-dessous remettra la caisse
      // d'accord.
    }
  }
  demanderRafraichissement();
}

/** Le jour UTC d'un instant, découpé comme `cash_attendu_du_jour`. */
function jourUtc(instant: Date): string {
  return instant.toISOString().slice(0, 10);
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
  ACCES_RESERVE: 'Réservé au forfait Illimité, et à trois collaborateurs au plus.',
  ABONNEMENT_INACTIF:
    'Ton abonnement n’est plus actif. Tu ne peux pas activer de collaborateur tant qu’il ne l’est pas. Contacte GTCS.',
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
    // Sans réponse, l'encaissement a pu se faire : la caisse du jour ne peut
    // plus se dire juste. Un refus franc ne coûte qu'une relecture.
    await perimerCaisseDuJour(jourUtc(encaisseLe));
    return { ok: false, echec: phraseEcriture(code) };
  }

  // L'argent est dans cette sacoche-ci, sur une carte absente de cette tournée :
  // seul le serveur peut le compter (`caisses_rafraichir_apres_mise`).
  await perimerCaisseDuJour(jourUtc(encaisseLe));
  return { ok: true, miseId };
}
