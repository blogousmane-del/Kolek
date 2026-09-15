import { MISE_MIN } from '@kolek/core';

/**
 * Les phrases que lit le collecteur, en une seule table.
 *
 * Elles vivaient dans `ecritures.ts`. La file du hors-ligne doit les lire sans
 * charger le client réseau — `ecritures.ts` importe `./supabase`, qui lève sans
 * configuration — d'où ce module sans dépendance. `ecritures.ts` les
 * réexporte : la table reste unique (spec §8).
 *
 * Deux tables, deux temps. `PHRASES` parle d'un geste qui vient d'échouer sous
 * les yeux du collecteur, au présent. `PHRASES_REFUS` raconte ce qui est arrivé
 * à une opération partie plus tard, sans lui : « La carte avait été clôturée ».
 */

export interface EchecEcriture {
  /** Le code court, pour les épreuves et les journaux. */
  code: string;
  /** La phrase montrée au collecteur. */
  message: string;
}

export const PHRASES: Readonly<Record<string, string>> = {
  DOUBLON: 'Cette mise a déjà été enregistrée.',
  CARTE_INTROUVABLE: 'Cette carte n’existe pas ou ne t’appartient pas.',
  CARTE_CLOTUREE: 'Cette carte est clôturée. Ouvre une nouvelle carte.',
  CYCLE_COMPLET: 'Le cycle de 31 mises est complet. Il faut clôturer la carte.',
  MONTANT_INVALIDE: 'Le montant doit être égal à la mise de la carte.',
  DATE_INVALIDE:
    'Le serveur n’accepte une opération que d’un jour en avant à 90 jours en arrière. Vérifie la date du téléphone.',
  BORNE: 'Une des informations saisies est trop longue.',
  BORNE_MONTANT: 'Le serveur refuse ce montant. Choisis un des montants proposés.',
  CONFLIT_UNIQUE: 'Le serveur a déjà une ligne à cette place. Contacte GTCS.',
  PARENT_ABSENT: 'Le client ou la carte de cette opération n’existe pas au serveur.',
  DROIT_REFUSE: 'Tu n’as pas le droit d’écrire cette ligne.',
  ABONNEMENT_INACTIF:
    'Ton abonnement n’est plus actif. Tu peux encaisser sur les cartes déjà ouvertes, mais pas ajouter de client ni ouvrir de carte. Contacte GTCS.',
  RIEN_ECRIT: 'Le serveur n’a rien changé. Reconnecte-toi et réessaie.',
  RESEAU: 'Pas de réseau. Réessaie une fois connecté.',
  NOM_VIDE: 'Le nom du client est obligatoire.',
  MISE_HORS_BORNES: `La mise doit être d’au moins ${MISE_MIN} FCFA.`,
  CAISSE_INVALIDE: 'Le montant déclaré doit être un nombre positif.',
  CARTE_ABSENTE:
    'Cette carte n’est pas sur ce téléphone. Connecte-toi une fois au réseau pour recharger ta tournée.',
  CLIENT_INTROUVABLE:
    'Ce client n’est pas sur ce téléphone. Connecte-toi une fois au réseau pour recharger ta tournée.',
  STOCKAGE:
    'Enregistrement impossible sur ce téléphone : rien n’a été compté. Libère de la place, puis réessaie.',
  INCONNU: 'Enregistrement impossible. Réessaie.',
};

export const PHRASES_REFUS: Readonly<Record<string, string>> = {
  CARTE_INTROUVABLE: 'Le serveur ne connaissait pas cette carte.',
  CARTE_CLOTUREE: 'La carte avait été clôturée.',
  CYCLE_COMPLET: 'Le cycle de 31 mises était déjà complet.',
  MONTANT_INVALIDE: 'Le montant ne correspondait pas à la mise de la carte.',
  DATE_INVALIDE:
    'La date sortait de la fenêtre du serveur : plus de 90 jours d’attente, ou l’horloge du téléphone en avance.',
  BORNE: 'Une des informations saisies était trop longue.',
  BORNE_MONTANT: 'Le serveur a refusé ce montant.',
  CONFLIT_UNIQUE: 'Le serveur avait déjà une ligne à cette place.',
  PARENT_ABSENT: 'Le client ou la carte n’existait pas au serveur.',
  PARENT_REFUSE: 'L’opération dont elle dépendait a été refusée.',
  ABONNEMENT_INACTIF: 'L’abonnement n’était plus actif.',
  DROIT_REFUSE: 'Le serveur a refusé d’écrire cette ligne.',
  DOUBLON_INVERIFIABLE: 'Le serveur signalait un doublon qui n’a pas pu être vérifié.',
  INCONNU: 'Le serveur a répondu cinq fois sans motif reconnu.',
};

/** La phrase d'un code court. Exportée pour les écrans et pour `encaisserPour`. */
export function phraseEcriture(code: string): EchecEcriture {
  return { code, message: PHRASES[code] ?? PHRASES.INCONNU! };
}

/** Un motif sans phrase (une version plus récente, un défaut) : on ne raconte rien qu'on ne sait pas. */
const REFUS_SANS_PHRASE = 'Le serveur a refusé cette opération.';

/** Le motif d'un refus, en clair. */
export function phraseRefus(motif: string): string {
  return PHRASES_REFUS[motif] ?? REFUS_SANS_PHRASE;
}
