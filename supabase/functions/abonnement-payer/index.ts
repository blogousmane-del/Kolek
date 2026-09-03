import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_COLLECTEUR, entetesCors, listerOrigines } from '../_shared/cors.ts';
import { couperNom, lireProduits, resoudreTelephone } from '../_shared/chariow.ts';
import {
  chargerPaiementsRattrapables,
  creerDepot,
  creerVenteChariow,
} from '../_shared/depot-chariow.ts';
import { reconcilier } from '../_shared/reconciliation.ts';

/**
 * Créer la vente qui renouvellera l'abonnement d'un collecteur.
 *
 * Cette route sert le **renouvellement** : un compte existe, il paie pour la
 * période suivante. La première souscription d'un prospect suit un autre chemin
 * — il n'a pas encore de compte, donc pas de jeton, et c'est
 * `demander-ouverture` qui porte son checkout (amendement « payer vaut accord »).
 *
 * ## Ce que le téléphone n'a pas le droit de décider
 *
 * Ni son identité — elle vient du jeton — ni le montant. Chariow débite le prix
 * du produit configuré dans sa boutique ; **aucun montant ne transite par cette
 * fonction**, et c'est une propriété, pas une limitation. Le corps ne porte que
 * le palier voulu et le téléphone à joindre.
 *
 * Le montant enregistré vient ensuite de la **réponse** de Chariow, jamais de la
 * grille : c'est la boutique qui décide de ce qui sera débité, et la
 * réconciliation comparera le débit réel à ce qui est enregistré ici.
 *
 * ## Pourquoi la configuration se lit après l'identité
 *
 * Un inconnu n'a pas à apprendre, par la seule différence entre un 403 et un
 * 500, si le paiement est configuré chez nous, ni quels paliers ont un produit.
 * C'est aussi ce qui rend le portillon observable là où `CHARIOW_CLE_API`
 * n'existe pas — toute base locale, et le CI.
 *
 * ## Pourquoi la clé de service sort si tard
 *
 * Tout ce qui peut refuser — palier inconnu, téléphone irrésoluble, fiche de
 * collaborateur — refuse avant. La clé ne sert qu'à écrire une ligne dont on
 * sait déjà qu'elle a un sens.
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

  if (!url || !cleAnon) {
    console.error('Configuration de plateforme incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  // --- Identité, sous le jeton de l'appelant ---

  const clientAppelant = createClient(url, cleAnon, {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: utilisateur, error: erreurUtilisateur } = await clientAppelant.auth.getUser();
  if (erreurUtilisateur || !utilisateur.user) {
    return reponse({ erreur: 'ACCES_RESERVE' }, 403, requete);
  }
  const collecteurId = utilisateur.user.id;
  const courriel = utilisateur.user.email;
  if (!courriel) return reponse({ erreur: 'COMPTE_SANS_ADRESSE' }, 400, requete);

  // --- La fiche, et le seul refus qui ne dépend pas du fournisseur ---
  //
  // Lue sous l'identité de l'appelant, donc sous RLS : c'est RLS qui prouve
  // qu'il lit la sienne, et non une ligne recopiée du corps.
  //
  // Placée avant la configuration Chariow, contrairement au plan : « tu es
  // collaborateur, tu n'as rien à payer » est vrai que la boutique soit
  // configurée ou non. L'y faire dépendre rendrait la règle inobservable partout
  // où `CHARIOW_CLE_API` n'existe pas — c'est-à-dire dans tout ce qui la teste.
  const { data: fiche, error: erreurFiche } = await clientAppelant
    .from('collecteurs')
    .select('nom, abonnement_echeance, titulaire_id, promo_code, remise_pct, remise_fin')
    .eq('id', collecteurId)
    .maybeSingle();

  if (erreurFiche || !fiche) {
    console.error('[Abonnement] lecture fiche :', erreurFiche?.message);
    return reponse({ erreur: 'FICHE_INTROUVABLE' }, 404, requete);
  }

  // Un collaborateur ne s'abonne pas. Son palier vient de son titulaire, qui
  // paie pour lui, et `admin_vue_globale` ne compte pas son abonnement depuis
  // `20260902140000`. Encaisser ici lui vendrait ce qu'il a déjà, et la somme
  // n'apparaîtrait même pas au chiffre d'affaires.
  //
  // Le refus est un 403 nommé, pas un 404 : le collaborateur existe, sa demande
  // est légitime, elle n'a simplement pas d'objet. L'écran ne lui est pas
  // proposé (tâche 11) — ceci est la barrière serveur.
  if (fiche.titulaire_id !== null) {
    return reponse({ erreur: 'ABONNEMENT_DU_TITULAIRE' }, 403, requete);
  }

  // --- Passé l'identité, la configuration du fournisseur ---

  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cleApi = Deno.env.get('CHARIOW_CLE_API');
  const racine = Deno.env.get('CHARIOW_API_URL') ?? 'https://api.chariow.com/v1';
  const retour = Deno.env.get('URL_RETOUR_COLLECTEUR') ?? 'https://app.kolek.cash';

  if (!cleService || !cleApi) {
    console.error('Configuration incomplète : CHARIOW_CLE_API est-elle posée ?');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  let produits: Record<string, string>;
  try {
    produits = lireProduits(Deno.env.get('CHARIOW_PRODUITS'));
  } catch (cause) {
    // `lireProduits` lève sur une table incomplète plutôt que de la rendre : un
    // palier manquant ne se verrait sinon qu'au premier collecteur qui le
    // choisit, c'est-à-dire au pire moment.
    console.error('[Abonnement]', cause instanceof Error ? cause.message : cause);
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  // --- Saisie ---

  let saisie: Record<string, unknown>;
  try {
    saisie = (await requete.json()) as Record<string, unknown>;
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  const palier = typeof saisie.palier === 'string' ? saisie.palier.trim() : '';
  if (!palier) return reponse({ erreur: 'PALIER_INCONNU' }, 400, requete);
  if (!(palier in produits)) {
    // `essai` tombe ici : il n'a pas de produit, parce qu'on ne vend pas zéro
    // franc. Le message le distingue d'un palier qui n'existe pas du tout.
    return reponse({ erreur: 'PALIER_NON_PAYANT' }, 400, requete);
  }

  const telephone = resoudreTelephone({
    telephone: saisie.telephone,
    paysTelephone: saisie.paysTelephone,
    telephoneLocal: saisie.telephoneLocal,
  });
  if (!telephone) return reponse({ erreur: 'TELEPHONE_INVALIDE' }, 400, requete);

  // La remise interne devient un `discount_code` chez Chariow : c'est le seul
  // moyen que l'API offre de réduire un prix (`Docs/Chariow.md` §3.1). Le code
  // n'est envoyé que s'il est encore valide — `remise_fin` est une date, et un
  // code périmé fait répondre 422 à Chariow, que le collecteur lirait comme
  // « saisie refusée » alors que sa saisie est irréprochable.
  //
  // Comparaison de dates en ISO, sur des chaînes : `remise_fin` arrive de
  // PostgREST en `YYYY-MM-DD`, et l'ordre lexicographique y est l'ordre
  // chronologique. Fabriquer deux `Date` introduirait un fuseau là où il n'y en
  // a pas.
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const remiseActive =
    typeof fiche.promo_code === 'string' &&
    fiche.promo_code.length > 0 &&
    typeof fiche.remise_fin === 'string' &&
    fiche.remise_fin >= aujourdHui;

  // Chariow exige un prénom **et** un nom. `couperNom` porte la règle et son
  // repli, partagés avec le chemin du prospect.
  const { prenom, nomFamille } = couperNom(String(fiche.nom));

  // --- Passé ce point seulement, la clé de service sort ---

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Supersession : les tentatives précédentes sont d'abord réconciliées, puis
  // abandonnées. Réconcilier **avant** de clore est la seule façon de ne pas
  // abandonner une vente qui vient d'être réglée.
  try {
    const anciens = await chargerPaiementsRattrapables(clientService, collecteurId);
    if (anciens.length > 0) {
      await reconcilier(anciens, creerDepot(clientService, { racine, cleApi }));
      await clientService
        .from('paiements_abonnement')
        .update({ statut: 'abandonne' })
        .eq('collecteur_id', collecteurId)
        .eq('statut', 'en_attente');
    }
  } catch (cause) {
    // Une supersession en échec ne doit pas empêcher de payer : au pire, une
    // ligne en attente de plus, que la réconciliation nettoiera.
    console.error('[Abonnement] supersession :', cause instanceof Error ? cause.message : cause);
  }

  // --- La vente ---

  const issue = await creerVenteChariow(
    {
      produitId: produits[palier] as string,
      email: courriel,
      prenom,
      nomFamille,
      telephone,
      codeRemise: remiseActive ? String(fiche.promo_code) : null,
      urlRetour: `${retour}/?paiement=retour`,
      metadonnees: {
        collecteurId,
        palier,
        echeanceAvant: fiche.abonnement_echeance,
        // Ce que Kolek croyait accorder, au moment de l'achat. La réconciliation
        // compare le montant réellement encaissé au prix du palier ; sans cette
        // trace, une divergence entre les deux catalogues de codes serait
        // indémêlable six mois plus tard.
        remisePct: remiseActive ? fiche.remise_pct : null,
        promoCode: remiseActive ? fiche.promo_code : null,
      },
    },
    { racine, cleApi },
  );

  if (!issue.ok) {
    return reponse({ erreur: issue.erreur }, issue.statut, requete);
  }

  const { data: pose, error: erreurPose } = await clientService
    .from('paiements_abonnement')
    .insert({
      collecteur_id: collecteurId,
      palier,
      vente_id: issue.venteId,
      montant: issue.montant,
      devise: issue.devise,
      // Ce qui a été demandé à Chariow, et non ce que la fiche portera demain.
      remise_pct: remiseActive ? Number(fiche.remise_pct) : 0,
      echeance_avant: fiche.abonnement_echeance,
    })
    .select('id')
    .single();

  if (erreurPose) {
    // La vente existe chez Chariow mais nous ne l'avons pas enregistrée. Le dire
    // plutôt que de rendre le lien : un paiement fait sur une vente que nous
    // ignorons ne serait crédité par aucun des trois chemins.
    console.error('[Abonnement] enregistrement :', erreurPose.message);
    return reponse({ erreur: 'ENREGISTREMENT_IMPOSSIBLE' }, 500, requete);
  }

  return reponse({ checkoutUrl: issue.checkoutUrl, paiementId: pose.id }, 201, requete);
});
