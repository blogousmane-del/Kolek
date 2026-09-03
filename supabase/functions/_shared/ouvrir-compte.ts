import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import type { OuvrirCompte } from './depot-chariow.ts';

/**
 * Faire naître le compte d'un prospect dont le règlement vient d'être confirmé.
 *
 * C'est la seule implantation réelle d'`OuvrirCompte`, et le webhook est le seul
 * chemin qui l'injecte. Partout ailleurs, `creerDepot` garde son refus par
 * défaut : ouvrir un compte est irréversible, et un chemin qui n'a pas été écrit
 * pour ça ne doit pas pouvoir le faire par accident.
 *
 * ## L'ordre, et pourquoi il ne se réarrange pas
 *
 * `reconcilier` n'appelle ceci qu'**après** avoir reconnu la vente réglée et le
 * montant cohérent. Le compte est ensuite créé, puis `crediter_abonnement`
 * crédite. Un compte sans abonnement se répare — le collecteur peut se
 * connecter, son palier suivra au passage suivant ; un abonnement crédité sans
 * compte ne se rattache à rien, et la somme encaissée n'appartient plus à
 * personne.
 *
 * ## La reprise, qui est la vraie difficulté
 *
 * Entre `createUser` qui réussit et `crediter_abonnement` qui n'a pas encore
 * tourné, il y a une fenêtre — un appel réseau. Si elle se referme mal, le
 * passage suivant retrouve un paiement toujours en attente et une adresse déjà
 * prise. Sans reprise, ce paiement ne serait **jamais** crédité : quelqu'un
 * aurait payé, aurait un compte, et pas l'abonnement.
 *
 * La reprise retrouve donc le compte par le numéro — `collecteurs.telephone` est
 * unique, et c'est le déclencheur `creer_collecteur_apres_signup` qui l'y a
 * écrit depuis les mêmes métadonnées. Elle vérifie ensuite que l'adresse de ce
 * compte est bien celle de la demande. Sans ce second contrôle, une demande dont
 * l'adresse appartient à quelqu'un et le numéro à quelqu'un d'autre ferait
 * créditer le mauvais compte — cas rare, mais constructible, et personne ne s'en
 * apercevrait.
 *
 * Toute autre cause d'échec est refusée sans chercher : un « Database error
 * creating new user » signifie généralement un numéro déjà porté, et retrouver
 * un compte par ce numéro reviendrait précisément à créditer un tiers.
 */

interface DemandeReglee {
  nom: string;
  telephone: string;
  zone: string | null;
  email: string | null;
  mot_de_passe_hash: string | null;
}

/** Ce que GoTrue répond quand l'adresse est déjà portée. Il la nomme lui-même ;
    les autres causes, non — d'où le refus de deviner au-delà de ce motif. */
const DEJA_PRIS = /already|exist|registered/i;

export function ouvrirCompteDepuisDemande(clientService: SupabaseClient): OuvrirCompte {
  return async (paiement) => {
    const demandeId = paiement.demande_id;
    if (!demandeId) {
      // `reconcilier` ne devrait pas nous appeler là-dessus — il journalise
      // l'orphelin et passe. Le redire ici plutôt que de lire `null` en base.
      throw new Error(`OUVERTURE_SANS_DEMANDE — paiement ${paiement.id}`);
    }

    const { data, error } = await clientService
      .from('demandes_ouverture')
      .select('nom, telephone, zone, email, mot_de_passe_hash')
      .eq('id', demandeId)
      .maybeSingle();

    if (error) throw new Error(`DEMANDE_ILLISIBLE — ${error.message}`);

    const demande = data as DemandeReglee | null;
    if (!demande) throw new Error(`DEMANDE_INTROUVABLE — ${demandeId}`);

    // Les deux seuls champs sans lesquels le compte serait inatteignable. Une
    // demande déposée avant l'amendement n'en porte pas : elle suit le chemin
    // d'avant, l'accord d'un humain, et son paiement — s'il en existe un — reste
    // en attente, lisible.
    if (!demande.email || !demande.mot_de_passe_hash) {
      throw new Error(`DEMANDE_SANS_IDENTIFIANTS — ${demandeId}`);
    }

    // `password_hash` : l'empreinte calculée au formulaire est reprise telle
    // quelle. Le clair n'a jamais reposé nulle part, et il n'est pas ici non
    // plus.
    //
    // `email_confirm: true` parce que le prospect se connecte avec l'adresse et
    // le mot de passe qu'il vient de choisir. Attendre une confirmation le
    // laisserait dehors juste après avoir payé.
    //
    // `nom` et `telephone` par les métadonnées : le déclencheur
    // `creer_collecteur_apres_signup` les y lit pour composer la ligne
    // `collecteurs`. C'est le chemin déjà en place — en ouvrir un second
    // créerait deux façons de naître pour un collecteur.
    const { data: cree, error: erreurAuth } = await clientService.auth.admin.createUser({
      email: demande.email,
      password_hash: demande.mot_de_passe_hash,
      email_confirm: true,
      user_metadata: { nom: demande.nom, telephone: demande.telephone },
    });

    let compte = cree?.user?.id ?? null;

    if (!compte) {
      const message = erreurAuth?.message ?? 'création impossible';
      if (!DEJA_PRIS.test(message)) {
        throw new Error(`COMPTE_IMPOSSIBLE — ${message}`);
      }

      compte = await retrouverCompte(clientService, demande, demandeId);
    }

    // La zone ne fait pas partie des métadonnées d'inscription ; le palier, lui,
    // sera posé par `crediter_abonnement`. Un échec ici ne fait pas échouer
    // l'ouverture : le compte existe, et refuser maintenant empêcherait le
    // crédit pour une colonne d'agrément.
    if (demande.zone) {
      const { error: erreurZone } = await clientService
        .from('collecteurs')
        .update({ zone: demande.zone })
        .eq('id', compte);
      if (erreurZone) {
        console.error('[Abonnement] zone non posée sur', compte, ':', erreurZone.message);
      }
    }

    return compte;
  };
}

/**
 * Le compte que `createUser` dit déjà exister — s'il est bien celui-là.
 *
 * Deux conditions, et les deux comptent : le numéro de la demande désigne un
 * collecteur, et ce collecteur porte l'adresse de la demande. La première seule
 * ferait créditer un homonyme de numéro ; aucune ne ferait jamais créditer.
 */
async function retrouverCompte(
  clientService: SupabaseClient,
  demande: DemandeReglee,
  demandeId: string,
): Promise<string> {
  const { data: porte, error } = await clientService
    .from('collecteurs')
    .select('id')
    .eq('telephone', demande.telephone)
    .maybeSingle();

  if (error) throw new Error(`REPRISE_ILLISIBLE — ${error.message}`);

  const compte = (porte as { id: string } | null)?.id ?? null;
  if (!compte) {
    throw new Error(
      `COMPTE_DEJA_PRIS — l'adresse de la demande ${demandeId} appartient à un compte ` +
        `que son numéro ne désigne pas`,
    );
  }

  const { data: utilisateur } = await clientService.auth.admin.getUserById(compte);
  const adresse = utilisateur?.user?.email ?? null;

  if (adresse?.toLowerCase() !== demande.email?.toLowerCase()) {
    throw new Error(
      `REPRISE_INCERTAINE — le compte ${compte} porte le numéro de la demande ` +
        `${demandeId} mais pas son adresse`,
    );
  }

  console.error(`[Abonnement] reprise : le compte de la demande ${demandeId} existait déjà`);
  return compte;
}
