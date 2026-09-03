import { createClient } from 'npm:@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs@2.4.3';

import {
  couperNom,
  lireProduits,
  resoudreTelephone,
  type TelephoneChariow,
} from '../_shared/chariow.ts';
import { ORIGINES_SITE, entetesCors, listerOrigines } from '../_shared/cors.ts';
import { empreinteRequete } from '../_shared/debit.ts';
import { creerVenteChariow, type OptionsChariow } from '../_shared/depot-chariow.ts';
import { verifierFuite } from '../_shared/hibp.ts';
import { validerDemande } from '../_shared/valider-demande.ts';

/**
 * La demande d'ouverture de compte, déposée depuis la vitrine.
 *
 * ## C'est la seule fonction publique du produit
 *
 * Les six autres exigent un jeton et referment la porte sans lui. Celle-ci
 * accepte une requête anonyme, parce qu'un visiteur qui découvre Kolek n'a par
 * définition pas de compte. Elle est donc écrite comme une surface exposée :
 *
 * * **Elle n'ouvre aucun compte.** Elle range une demande dans une table que
 *   personne ne peut lire depuis un navigateur. Les trois verrous qui
 *   interdisent l'inscription libre — `disable_signup`, l'absence de politique
 *   `INSERT` sur `collecteurs`, les clés étrangères — sont intacts. Ce que cette
 *   fonction produit, c'est une ligne à rappeler, pas un accès.
 * * **Elle ne rend rien de ce qu'elle a écrit.** Pas l'identifiant, pas la
 *   ligne. Un formulaire public qui renverrait ce qu'il vient d'enregistrer
 *   devient un moyen de vérifier ce que la table contient déjà.
 * * **Elle borne avant d'écrire**, par `validerDemande`, qui est testé.
 * * **Elle compte les appels par IP** depuis le 2026-08-27, par
 *   `consommer_debit`. Une demande par minute. Ce n'est pas un CAPTCHA — un
 *   réseau d'adresses passe encore — mais c'est ce qui ferme le cas réel : un
 *   script sur une machine qui fait varier le numéro. L'audit du 2026-08-25
 *   chiffrait ce manque : `grep -cin "ratelimit\|captcha\|turnstile"` rendait 0
 *   sur ce fichier.
 * * **Elle refuse le doublon** — l'index unique partiel sur le téléphone en
 *   attente lève `23505`, traduit ici en 409. Sans lui, un formulaire public se
 *   soumet mille fois.
 *
 * ## Ce que l'amendement « payer vaut accord » ajoute ici
 *
 * Depuis le 2026-09-03, une demande à **palier payant** ne se contente plus
 * d'attendre un rappel : elle part payer. Le prospect a choisi son mot de passe
 * dans le formulaire, la fonction en range l'**empreinte** — jamais le clair,
 * voir `20260903140000_demande_mot_de_passe` — ouvre une vente chez Chariow et
 * rend le lien de paiement. Le compte naîtra du règlement confirmé, par le
 * webhook, sans qu'un humain ait à l'ouvrir.
 *
 * **L'essai n'a pas changé.** Il vaut zéro franc : il n'y a rien à encaisser, et
 * il attend l'accord d'un humain comme avant. C'est aussi ce qui garde une porte
 * d'entrée pour qui n'a pas de moyen de paiement en ligne.
 *
 * Ce qui reste vrai des deux côtés : la fonction n'ouvre toujours **aucun
 * compte**, et ne rend toujours rien de ce qu'elle a écrit — pas l'identifiant
 * de la demande, pas la ligne. Le lien de paiement n'en dit rien : il désigne
 * une vente chez le fournisseur, pas une ligne chez nous.
 *
 * ## Pourquoi l'origine reste filtrée
 *
 * Le filtre CORS n'est pas une protection — n'importe quel client hors
 * navigateur l'ignore, et c'est vrai de toutes nos fonctions. Il évite
 * simplement qu'une page tierce fasse déposer des demandes au nom d'un visiteur
 * qui ne l'a pas voulu. La vraie borne est la validation, puis la contrainte.
 */

const ORIGINES_AUTORISEES = listerOrigines(Deno.env.get('ORIGINES_SITE'), ORIGINES_SITE);

/**
 * Une demande par minute et par adresse IP.
 *
 * Le chiffre est volontairement bas : personne n'ouvre deux comptes dans la
 * même minute, et un visiteur qui a cliqué deux fois lit le refus comme une
 * confirmation que sa demande est bien passée. Ce que la borne ferme, c'est le
 * script qui fait varier le numéro.
 */
const PLAFOND = 1;
const FENETRE_SECONDES = 60;

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

/** Ce qui est réuni **avant** la première écriture, pour n'écrire que lorsqu'on
    sait déjà que la vente peut partir. */
interface PreparationVente {
  produitId: string;
  options: OptionsChariow;
  urlRetour: string;
  telephone: TelephoneChariow;
  prenom: string;
  nomFamille: string;
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesPour(requete) });
  }
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }

  let brut: unknown;
  try {
    brut = await requete.json();
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  const verdict = validerDemande((brut ?? {}) as Record<string, unknown>);
  if (!verdict.ok) {
    return reponse({ erreur: verdict.erreur, champ: verdict.champ }, 400, requete);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cleService) {
    console.error('Configuration incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  const client = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // La borne vient **après** la validation : une saisie malformée n'atteint pas
  // la base et ne coûte que du calcul, et un visiteur qui se trompe de format ne
  // doit pas se retrouver enfermé dehors pour une minute.
  const { data: dansLePlafond, error: erreurDebit } = await client.rpc('consommer_debit', {
    cle: empreinteRequete('demander-ouverture', requete.headers),
    plafond: PLAFOND,
    fenetre_secondes: FENETRE_SECONDES,
  });

  if (erreurDebit) {
    // Le compteur est en panne. On refuse plutôt que d'ouvrir : c'est la seule
    // écriture publique du produit, et une borne qui se désactive toute seule
    // sous la panne ne borne rien le jour où on en a besoin.
    console.error('consommer_debit a échoué :', erreurDebit.message);
    return reponse({ erreur: 'ENREGISTREMENT_IMPOSSIBLE' }, 500, requete);
  }

  if (dansLePlafond !== true) {
    return reponse({ erreur: 'TROP_DE_DEMANDES' }, 429, requete);
  }

  // --- Le chemin payant, s'il y a lieu ---
  //
  // Tout ce qui suit ne concerne qu'un palier payant. Une demande d'essai passe
  // à côté sans rien en savoir, et le `null` de `motDePasse` est ce qui le dit.
  const payant = verdict.motDePasse !== null;
  let empreinte: string | null = null;
  let preparation: PreparationVente | null = null;

  if (payant) {
    // La configuration se lit **avant** la première écriture. Une boutique mal
    // configurée laisserait sinon une demande orpheline en base, avec son
    // empreinte, pour un paiement qui ne partira jamais — et le numéro resterait
    // verrouillé par l'index d'unicité jusqu'à ce qu'un humain la traite.
    const cleApi = Deno.env.get('CHARIOW_CLE_API');
    let produits: Record<string, string>;
    try {
      produits = lireProduits(Deno.env.get('CHARIOW_PRODUITS'));
    } catch (cause) {
      console.error('[Demande]', cause instanceof Error ? cause.message : cause);
      return reponse({ erreur: 'PAIEMENT_INDISPONIBLE' }, 503, requete);
    }
    if (!cleApi || !produits[verdict.demande.palier]) {
      console.error('[Demande] paiement non configuré pour', verdict.demande.palier);
      return reponse({ erreur: 'PAIEMENT_INDISPONIBLE' }, 503, requete);
    }

    // Le téléphone doit être résoluble pour Chariow, qui veut un numéro local et
    // un code pays **séparés** — jamais un E.164. Le refuser ici évite un appel
    // sortant dont on connaît déjà l'issue.
    //
    // `paysTelephone` et `telephoneLocal` sont ce que le champ à sélecteur de
    // pays envoie (`packages/ui/src/ChampTelephone.tsx`, tâche 9). Sans eux,
    // `resoudreTelephone` retombe sur l'E.164 et ne reconnaît que les indicatifs
    // qu'elle connaît : un « 0701020304 » nu est refusé, et il doit l'être —
    // `validerDemande` n'invente volontairement aucun indicatif, parce que GTCS
    // reçoit aussi des numéros de la sous-région. **Le formulaire de la vitrine
    // doit donc passer au champ à sélecteur** pour qu'un palier payant aboutisse
    // (tâche 11) ; jusque-là, seul un numéro international complet passe.
    const telephone = resoudreTelephone({
      telephone: verdict.demande.telephone,
      paysTelephone: (brut as Record<string, unknown>).paysTelephone,
      telephoneLocal: (brut as Record<string, unknown>).telephoneLocal,
    });
    if (!telephone) {
      return reponse({ erreur: 'TELEPHONE_INVALIDE', champ: 'telephone' }, 400, requete);
    }

    // Les fuites connues, avant l'encaissement. Refuser un mot de passe après
    // avoir prélevé serait le pire moment possible — c'est la raison d'être de
    // tout ce chemin.
    //
    // `indisponible` laisse passer : le service de HIBP n'est pas une dépendance
    // dont l'indisponibilité doit empêcher quelqu'un de s'abonner. Même arbitrage
    // que dans `collecteur-creer-collaborateur`.
    const fuite = await verifierFuite(verdict.motDePasse as string);
    if (fuite.etat === 'compromis') {
      return reponse(
        { erreur: 'MOT_DE_PASSE_COMPROMIS', champ: 'motDePasse', occurrences: fuite.occurrences },
        400,
        requete,
      );
    }

    // L'empreinte, et le clair disparaît avec la portée de cette fonction. Coût
    // 10 : environ 180 ms mesurées dans ce runtime, ce qui est le bon ordre de
    // grandeur — assez lent pour une attaque hors ligne, assez rapide pour un
    // formulaire.
    empreinte = await bcrypt.hash(verdict.motDePasse as string, 10);

    preparation = {
      produitId: produits[verdict.demande.palier] as string,
      options: {
        racine: Deno.env.get('CHARIOW_API_URL') ?? 'https://api.chariow.com/v1',
        cleApi,
      },
      urlRetour: `${Deno.env.get('URL_RETOUR_COLLECTEUR') ?? 'https://app.kolek.cash'}/?paiement=retour`,
      telephone,
      ...couperNom(verdict.demande.nom),
    };
  }

  const { data: rangee, error } = await client
    .from('demandes_ouverture')
    .insert({ ...verdict.demande, mot_de_passe_hash: empreinte })
    .select('id')
    .single();

  if (error) {
    // 23505 : une demande de ce numéro est déjà en attente. Ce n'est pas une
    // panne, et le visiteur doit l'apprendre comme une bonne nouvelle — sa
    // demande est bien arrivée la première fois.
    if (error.code === '23505') {
      return reponse({ erreur: 'DEMANDE_DEJA_EN_ATTENTE' }, 409, requete);
    }
    // 23514 : une borne de la base a refusé ce que la validation avait laissé
    // passer. Cela signalerait un écart entre les deux, à corriger.
    if (error.code === '23514') {
      console.error('Borne base franchie malgré la validation :', error.message);
      return reponse({ erreur: 'SAISIE_REFUSEE' }, 400, requete);
    }
    console.error('Insertion impossible :', error.message);
    return reponse({ erreur: 'ENREGISTREMENT_IMPOSSIBLE' }, 500, requete);
  }

  // Une demande d'essai s'arrête là. Rien de la ligne écrite : juste l'accusé.
  if (!payant || !preparation) {
    return reponse({ recue: true }, 201, requete);
  }

  const demandeId = (rangee as { id: string }).id;

  const issue = await creerVenteChariow(
    {
      produitId: preparation.produitId,
      email: verdict.demande.email,
      prenom: preparation.prenom,
      nomFamille: preparation.nomFamille,
      telephone: preparation.telephone,
      urlRetour: preparation.urlRetour,
      // Pas de `discount_code` ici : un prospect n'a pas de fiche, donc pas de
      // remise interne. Les codes promotionnels sont accordés à un collecteur
      // existant, et son renouvellement passe par `abonnement-payer`.
      metadonnees: { demandeId, palier: verdict.demande.palier },
    },
    preparation.options,
  );

  if (!issue.ok) {
    // La demande est écrite, la vente n'est pas partie. On le dit plutôt que de
    // rendre un accusé muet : sans lien, le visiteur croirait avoir payé. La
    // ligne reste `nouvelle` et apparaît dans la console — GTCS peut la traiter
    // à la main, ce qui est exactement le chemin d'avant l'amendement.
    console.error('[Demande] vente impossible pour', demandeId, issue.erreur);
    return reponse({ erreur: issue.erreur, recue: true }, issue.statut, requete);
  }

  const { error: erreurPaiement } = await client.from('paiements_abonnement').insert({
    demande_id: demandeId,
    palier: verdict.demande.palier,
    vente_id: issue.venteId,
    montant: issue.montant,
    devise: issue.devise,
    // Il n'y avait pas d'abonnement avant : la période commence aujourd'hui.
    // La colonne n'entre dans aucun calcul — `crediter_abonnement` lit
    // l'échéance de la fiche — elle date le point de départ, et c'est tout.
    echeance_avant: new Date().toISOString().slice(0, 10),
  });

  if (erreurPaiement) {
    // La vente existe chez Chariow et nous ne l'avons pas enregistrée : aucun
    // des trois chemins de réconciliation ne saurait la créditer. Ne pas rendre
    // le lien est la seule réponse honnête — mieux vaut un visiteur qui
    // recommence qu'un visiteur qui paie dans le vide.
    console.error('[Demande] enregistrement du paiement :', erreurPaiement.message);
    return reponse({ erreur: 'ENREGISTREMENT_IMPOSSIBLE', recue: true }, 500, requete);
  }

  // Le lien, et rien d'autre. Il désigne une vente chez le fournisseur, pas une
  // ligne chez nous : la règle « ne rien rendre de ce qui a été écrit » tient.
  return reponse({ recue: true, checkoutUrl: issue.checkoutUrl }, 201, requete);
});
