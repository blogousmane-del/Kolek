/**
 * Ce que veut dire une réponse du serveur, pour une opération de la file.
 *
 * Spec §6.2. La table est exhaustive, chaque ligne a son épreuve, et **aucune
 * branche ne rend un succès sur une erreur** : un `23505` ne devient « déjà là »
 * que sur la clé de l'opération, et « déjà là » n'est encore qu'une hypothèse
 * que l'envoi vérifie en relisant (§6.3).
 *
 * Fonction pure : ni réseau, ni horloge, ni stockage.
 */

/**
 * Les contraintes CHECK qui portent sur un montant, et non sur une longueur.
 * Même liste, et même raison, que dans `ecritures.ts` : `mises_montant_borne`
 * et `clients_nom_borne` finissent tous deux par `_borne`.
 */
export const CONTRAINTES_DE_MONTANT: readonly string[] = [
  'cartes_mise_check',
  'mises_montant_borne',
  'mises_montant_check',
];

/** Les deux portes d'entrée que `abonnement_ouvre_droit` referme. */
export const RLS_PORTES_D_ENTREE = /row-level security policy for table "(clients|cartes)"/;

/** La forme commune à toute réponse de supabase-js. Une `PostgrestResponse` s'y range telle quelle. */
export interface ReponseServeur {
  error: { code?: string | null; message?: string | null } | null;
  status?: number;
}

/** Ce que l'envoi tentait d'écrire. Une inscription a deux portées, une par étape. */
export type Portee = 'mise' | 'client' | 'carte' | 'caisse' | 'consignation';

export type Classement =
  | { cas: 'accepte' }
  | { cas: 'deja_la' }
  | { cas: 'mettre_a_jour' }
  | { cas: 'refus'; motif: string }
  | { cas: 'session' }
  | { cas: 'passager' }
  | { cas: 'inconnu' };

/** Les contraintes qui sont la clé de chaque portée (§6.3). */
const CLES: Record<Exclude<Portee, 'caisse'>, readonly string[]> = {
  mise: ['mises_pkey'],
  client: ['clients_pkey', 'clients_id_collecteur_unique'],
  carte: ['cartes_pkey'],
  consignation: ['synchro_rejets_pkey'],
};

const MESSAGES_METIER = [
  'CARTE_INTROUVABLE',
  'CARTE_CLOTUREE',
  'CYCLE_COMPLET',
  'MONTANT_INVALIDE',
  'DATE_INVALIDE',
] as const;

export function classer(reponse: ReponseServeur, portee: Portee): Classement {
  const { error, status = 0 } = reponse;
  // PostgREST pose `error` sur toute réponse hors 2xx, et supabase-js le pose
  // aussi sur un échec de `fetch`. Sans erreur, l'écriture a eu lieu.
  if (!error) return { cas: 'accepte' };

  const code = error.code ?? '';
  const message = error.message ?? '';

  // La session d'abord : un jeton expiré se présente parfois sans statut.
  if (status === 401 || /^PGRST30[1-3]$/.test(code)) return { cas: 'session' };

  if (code === '23505') {
    // La caisse du jour s'écrit « dernière déclaration gagne » : ses deux
    // unicités mènent au même état voulu (§6.4), le nom n'a pas à être lu.
    if (portee === 'caisse') return { cas: 'mettre_a_jour' };
    // `mises_avant_insert` teste le doublon en tête et lève `DOUBLON` sous
    // `23505` : un rejeu de mise se présente toujours ainsi (J1 §4.3).
    if (portee === 'mise' && message.includes('DOUBLON')) return { cas: 'deja_la' };
    const cles = CLES[portee];
    return cles.some((nom) => message.includes(`"${nom}"`))
      ? { cas: 'deja_la' }
      : { cas: 'refus', motif: 'CONFLIT_UNIQUE' };
  }

  // Les messages des déclencheurs voyagent en `P0001` : on les cherche avant
  // de se rabattre sur le SQLSTATE.
  for (const cle of MESSAGES_METIER) {
    if (message.includes(cle)) return { cas: 'refus', motif: cle };
  }

  if (code === '23514') {
    return {
      cas: 'refus',
      motif: CONTRAINTES_DE_MONTANT.some((nom) => message.includes(nom)) ? 'BORNE_MONTANT' : 'BORNE',
    };
  }
  if (code === '23503') return { cas: 'refus', motif: 'PARENT_ABSENT' };
  if (code === '42501') {
    return {
      cas: 'refus',
      motif: RLS_PORTES_D_ENTREE.test(message) ? 'ABONNEMENT_INACTIF' : 'DROIT_REFUSE',
    };
  }

  // Statut 0 : `fetch` a échoué ou a été interrompu — supabase-js rattrape
  // l'exception et la rend ainsi. Rien n'est su de l'écriture : on réessaie,
  // et le rejeu tombera sur la clé si elle avait eu lieu.
  if (status === 0 || status === 408 || status === 429 || status >= 500) return { cas: 'passager' };

  return { cas: 'inconnu' };
}
