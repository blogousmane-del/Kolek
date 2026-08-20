import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_COLLECTEUR, entetesCors, listerOrigines } from '../_shared/cors.ts';
import { partager } from '../_shared/restitution.ts';

/**
 * Clôturer une carte et restituer son solde au client.
 *
 * ## Pourquoi ce geste ne peut pas se faire depuis le téléphone
 *
 * `retraits` n'accorde que `select` à `authenticated`. Ce n'est pas un oubli :
 * la table est le journal de l'argent rendu, et une clôture engage **deux**
 * écritures qui doivent tenir ensemble — la ligne de retrait, et le passage de
 * la carte en `cloturee`. PostgREST ne sait pas les rendre atomiques ; un
 * téléphone qui perd le réseau entre les deux laisserait soit de l'argent rendu
 * sur une carte encore ouverte, soit une carte fermée sans trace du versement.
 *
 * ## Ce que le client n'a pas le droit de décider
 *
 * Le corps ne porte que `carteId`. Le montant est recalculé ici depuis
 * `mises_encaissees` et `mise` lus en base. Accepter un montant du téléphone
 * laisserait un écran périmé — la carte a reçu une mise entre-temps — restituer
 * le mauvais chiffre, et personne ne s'en apercevrait.
 *
 * ## Contrôle d'accès
 *
 * La carte est lue **avec le jeton de l'appelant**, donc sous RLS
 * (`cartes_select : collecteur_id = auth.uid()`). Une carte qui n'appartient pas
 * au demandeur est introuvable, et la réponse est la même que pour une carte
 * inexistante — le collecteur d'à côté n'apprend pas qui existe.
 *
 * La clé de service ne sort qu'après, et seulement pour écrire ce que la lecture
 * a déjà autorisé.
 *
 * ## Idempotence
 *
 * `retraits.carte_id` est unique. C'est cette contrainte qui porte l'idempotence :
 * une seconde tentative — réseau coupé, bouton pressé deux fois — bute sur
 * `23505`, et la fonction reprend alors la ligne existante au lieu d'échouer.
 * Elle en profite pour s'assurer que la carte est bien passée en `cloturee`,
 * ce qui répare le cas où la première tentative s'était interrompue entre les
 * deux écritures.
 */

const ORIGINES_AUTORISEES = listerOrigines(
  Deno.env.get('ORIGINES_COLLECTEUR'),
  ORIGINES_COLLECTEUR,
);

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  let saisie: { carteId?: unknown };
  try {
    saisie = await requete.json();
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  const carteId = typeof saisie.carteId === 'string' ? saisie.carteId : '';
  if (!UUID.test(carteId)) {
    return reponse({ erreur: 'CARTE_INTROUVABLE' }, 404, requete);
  }

  // --- Lecture sous l'identité de l'appelant : c'est RLS qui prouve la propriété ---

  const clientAppelant = createClient(url, cleAnon, {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: utilisateur, error: erreurUtilisateur } = await clientAppelant.auth.getUser();
  if (erreurUtilisateur || !utilisateur.user) {
    return reponse({ erreur: 'ACCES_RESERVE' }, 403, requete);
  }
  const collecteurId = utilisateur.user.id;

  const { data: carteBrute, error: erreurCarte } = await clientAppelant
    .from('cartes')
    .select('id, mise, statut, mises_encaissees')
    .eq('id', carteId)
    .maybeSingle();

  if (erreurCarte) {
    console.error('lecture carte :', erreurCarte.message);
    return reponse({ erreur: 'CLOTURE_IMPOSSIBLE' }, 500, requete);
  }

  const carte = carteBrute as {
    id: string;
    mise: number;
    statut: 'active' | 'cloturee';
    mises_encaissees: number;
  } | null;

  // Carte absente, ou carte d'un autre collecteur que RLS a masquée : même
  // réponse. Distinguer les deux dirait à qui demande si la carte existe.
  if (!carte) return reponse({ erreur: 'CARTE_INTROUVABLE' }, 404, requete);
  if (carte.statut === 'cloturee') {
    return reponse({ erreur: 'CARTE_DEJA_CLOTUREE' }, 409, requete);
  }

  let partage: { montantRestitue: number; commission: number };
  try {
    partage = partager(carte.mises_encaissees, carte.mise);
  } catch (cause) {
    console.error('partage impossible :', cause instanceof Error ? cause.message : cause);
    return reponse({ erreur: 'CLOTURE_IMPOSSIBLE' }, 500, requete);
  }

  // --- Passé ce point seulement, la clé de service sort ---

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: erreurRetrait } = await clientService.from('retraits').insert({
    collecteur_id: collecteurId,
    carte_id: carte.id,
    montant_restitue: partage.montantRestitue,
    commission: partage.commission,
  });

  if (erreurRetrait && erreurRetrait.code !== '23505') {
    console.error('insertion retrait :', erreurRetrait.message);
    return reponse({ erreur: 'CLOTURE_IMPOSSIBLE' }, 500, requete);
  }

  // `23505` : un retrait existe déjà pour cette carte. On ne repart pas en
  // erreur — on poursuit vers la mise à jour de la carte, qui est peut-être
  // justement ce qui avait manqué à la tentative précédente.

  const { error: erreurCloture } = await clientService
    .from('cartes')
    .update({ statut: 'cloturee', cloturee_le: new Date().toISOString() })
    .eq('id', carte.id)
    .eq('statut', 'active');

  if (erreurCloture) {
    // Le retrait est écrit, la carte est restée ouverte. Le dire tel quel : le
    // collecteur doit savoir que l'argent est journalisé avant de le rendre une
    // seconde fois. Un nouvel appel réparera la carte sans créer de doublon.
    console.error('clôture carte :', erreurCloture.message);
    return reponse(
      { erreur: 'CLOTURE_PARTIELLE', montantRestitue: partage.montantRestitue },
      207,
      requete,
    );
  }

  return reponse(
    { montantRestitue: partage.montantRestitue, commission: partage.commission },
    200,
    requete,
  );
});
