import { type EchecEcriture, codeDErreur } from './ecritures';
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
