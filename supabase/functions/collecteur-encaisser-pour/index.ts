import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_COLLECTEUR, entetesCors, listerOrigines } from '../_shared/cors.ts';

/**
 * Encaisser une mise sur la carte d'un coéquipier.
 *
 * ## Pourquoi une Edge Function et pas PostgREST
 *
 * Parce que la policy `mises_insert` exige `collecteur_id = auth.uid()` et
 * qu'elle **ne bouge pas**. C'est la décision structurante de la conception des
 * collaborateurs : élargir l'isolation aurait changé le sens de 35 sites de
 * lecture dans l'application, en silence. Le dépannage passe donc par une porte
 * dédiée, et son prix est nommé : dépanner un coéquipier exige le réseau, là où
 * sa propre tournée fonctionne hors ligne.
 *
 * ## La vérification de propriété appartient entièrement à cette fonction
 *
 * Sous clé de service, `auth.uid()` est nul : la garde
 * `if auth.uid() is not null and c.collecteur_id <> auth.uid()` de
 * `mises_avant_insert` **ne s'exécute pas**. C'est déjà vrai aujourd'hui pour
 * tout chemin de service ; cette fonction est la première à en dépendre pour de
 * bon. Si le bloc « appartenance » disparaît, n'importe quel collecteur connecté
 * encaisse sur n'importe quelle carte du produit.
 *
 * Toutes les AUTRES bornes de `mises_avant_insert` s'appliquent inchangées :
 * doublon, fenêtre de 90 jours, carte close, cycle complet, montant exact. On ne
 * les recopie pas ici — deux copies d'une règle divergent.
 */

const ORIGINES_AUTORISEES = listerOrigines(
  Deno.env.get('ORIGINES_COLLECTEUR'),
  ORIGINES_COLLECTEUR,
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Les refus du déclencheur, qui voyagent tous en `P0001` sauf le doublon.
    Rendus tels quels : l'application les traduit déjà, dans `ecritures.ts`, et
    une seconde table de phrases divergerait de la première. */
const REFUS_METIER = [
  'DOUBLON',
  'CARTE_CLOTUREE',
  'CYCLE_COMPLET',
  'MONTANT_INVALIDE',
  'DATE_INVALIDE',
] as const;

function entetesPour(requete: Request): Record<string, string> {
  return entetesCors({
    origine: requete.headers.get('Origin'),
    entetesDemandes: requete.headers.get('Access-Control-Request-Headers'),
    origines: ORIGINES_AUTORISEES,
  });
}

function reponse(corps: unknown, statut: number, requete: Request): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: entetesPour(requete) });
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesPour(requete) });
  }
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }

  const autorisation = requete.headers.get('Authorization');
  if (!autorisation?.startsWith('Bearer ')) {
    return reponse({ erreur: 'JETON_ABSENT' }, 401, requete);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const cleAnon = Deno.env.get('SUPABASE_ANON_KEY');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cleAnon || !cleService) {
    console.error('Configuration incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  let saisie: { miseId?: unknown; carteId?: unknown; montant?: unknown; encaisseLe?: unknown };
  try {
    saisie = await requete.json();
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  const miseId = typeof saisie.miseId === 'string' ? saisie.miseId : '';
  const carteId = typeof saisie.carteId === 'string' ? saisie.carteId : '';
  const montant = typeof saisie.montant === 'number' ? saisie.montant : Number.NaN;
  const encaisseLe = typeof saisie.encaisseLe === 'string' ? saisie.encaisseLe : '';

  // L'identifiant de la mise vient du téléphone : c'est le mécanisme
  // anti-double-comptage du produit. Un rejeu porte le même identifiant, viole
  // la clé primaire, et sort en `DOUBLON` — jamais en second encaissement.
  if (!UUID.test(miseId)) return reponse({ erreur: 'MISE_INVALIDE' }, 400, requete);
  if (!UUID.test(carteId)) return reponse({ erreur: 'CARTE_INTROUVABLE' }, 404, requete);
  if (!Number.isInteger(montant) || montant <= 0) {
    return reponse({ erreur: 'MONTANT_INVALIDE' }, 400, requete);
  }
  if (Number.isNaN(Date.parse(encaisseLe))) {
    return reponse({ erreur: 'DATE_INVALIDE' }, 400, requete);
  }

  // --- L'identité vient du jeton ---

  const clientAppelant = createClient(url, cleAnon, {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: utilisateur, error: erreurUtilisateur } = await clientAppelant.auth.getUser();
  if (erreurUtilisateur || !utilisateur.user) {
    return reponse({ erreur: 'ACCES_RESERVE' }, 403, requete);
  }
  const appelantId = utilisateur.user.id;

  // --- Passé ce point seulement, la clé de service sort ---

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- L'appartenance : la carte, son propriétaire, et le lien d'équipe ---

  const { data: carte, error: erreurCarte } = await clientService
    .from('cartes')
    .select('id, collecteur_id')
    .eq('id', carteId)
    .maybeSingle();

  if (erreurCarte) {
    console.error('lecture carte :', erreurCarte.message);
    return reponse({ erreur: 'ENCAISSEMENT_IMPOSSIBLE' }, 500, requete);
  }
  if (!carte) return reponse({ erreur: 'CARTE_INTROUVABLE' }, 404, requete);

  const proprietaire = carte.collecteur_id as string;

  let autorise = proprietaire === appelantId;
  if (!autorise) {
    const { data: membre, error: erreurMembre } = await clientService
      .from('collecteurs')
      .select('titulaire_id')
      .eq('id', proprietaire)
      .maybeSingle();

    if (erreurMembre) {
      console.error('lecture propriétaire :', erreurMembre.message);
      return reponse({ erreur: 'ENCAISSEMENT_IMPOSSIBLE' }, 500, requete);
    }
    autorise = membre?.titulaire_id === appelantId;
  }

  // Même réponse que pour une carte absente. Distinguer les deux dirait à
  // l'appelant si la carte existe — c'est la règle de `collecteur-cloturer-carte`
  // et de `mises_avant_insert`, tenue ici aussi.
  if (!autorise) return reponse({ erreur: 'CARTE_INTROUVABLE' }, 404, requete);

  // --- L'écriture ---
  //
  // `collecteur_id` est envoyé pour mémoire ; le déclencheur le réécrit depuis
  // la carte. `encaisse_par` est la valeur que le `coalesce` retiendra, puisque
  // `auth.uid()` est nul sous clé de service.
  const { error: erreurMise } = await clientService.from('mises').insert({
    id: miseId,
    collecteur_id: proprietaire,
    carte_id: carteId,
    montant,
    encaisse_le: encaisseLe,
    encaisse_par: appelantId,
  });

  if (erreurMise) {
    const message = erreurMise.message ?? '';
    const refus = REFUS_METIER.find((code) => message.includes(code));
    if (refus) return reponse({ erreur: refus }, 409, requete);
    // `CARTE_INTROUVABLE` levé par le déclencheur : la carte a été clôturée ou
    // supprimée entre la lecture et l'écriture. Même réponse qu'au-dessus.
    if (message.includes('CARTE_INTROUVABLE')) {
      return reponse({ erreur: 'CARTE_INTROUVABLE' }, 404, requete);
    }
    console.error('insertion mise :', message);
    return reponse({ erreur: 'ENCAISSEMENT_IMPOSSIBLE' }, 500, requete);
  }

  return reponse({ miseId }, 201, requete);
});
