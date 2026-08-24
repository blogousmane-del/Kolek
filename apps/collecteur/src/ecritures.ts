import { MISE_MAX, MISE_MIN, validerMise } from '@kolek/core';

import { supabase } from './supabase';

/**
 * Les deux écritures de l'application collecteur : créer un client avec sa
 * carte, et enregistrer une mise.
 *
 * Aucune Edge Function ici, et c'est voulu. La base autorise déjà exactement
 * ces deux gestes et rien d'autre : les `GRANT INSERT` nomment les colonnes
 * qu'un collecteur peut écrire, et les politiques RLS exigent
 * `collecteur_id = auth.uid()`. Passer par un serveur intermédiaire
 * n'ajouterait aucune garantie — il déplacerait seulement le contrôle hors de
 * l'endroit où il est déjà appliqué.
 *
 * ## Les identifiants viennent du téléphone
 *
 * `crypto.randomUUID()`, pas la base. C'est le mécanisme anti-double-comptage
 * du produit, documenté sur la colonne `mises.id` : si la file de synchro rejoue
 * un envoi, l'identifiant est le même, la clé primaire est violée, et le
 * déclencheur `mises_avant_insert` répond `DOUBLON`. Laisser la base engendrer
 * l'identifiant ferait de chaque rejeu une seconde mise — de l'argent compté
 * deux fois.
 *
 * ## Les erreurs sont traduites ici, une fois
 *
 * Les déclencheurs lèvent des messages courts et stables : `CARTE_INTROUVABLE`,
 * `CYCLE_COMPLET`, `MONTANT_INVALIDE`. Ils sont faits pour être comparés par du
 * code, pas lus par un collecteur au marché. La table ci-dessous est le seul
 * endroit où ils deviennent des phrases.
 */

export interface EchecEcriture {
  /** Le code court du serveur, pour les tests et les journaux. */
  code: string;
  /** La phrase montrée au collecteur. */
  message: string;
}

const PHRASES: Record<string, string> = {
  DOUBLON: 'Cette mise a déjà été enregistrée.',
  CARTE_INTROUVABLE: 'Cette carte n’existe pas ou ne t’appartient pas.',
  CARTE_CLOTUREE: 'Cette carte est clôturée. Ouvre une nouvelle carte.',
  CYCLE_COMPLET: 'Le cycle de 31 mises est complet. Il faut clôturer la carte.',
  MONTANT_INVALIDE: 'Le montant doit être égal à la mise de la carte.',
  BORNE: 'Une des informations saisies est trop longue.',
  DROIT_REFUSE: 'Tu n’as pas le droit d’écrire cette ligne.',
  RIEN_ECRIT: 'Le serveur n’a rien changé. Reconnecte-toi et réessaie.',
  RESEAU: 'Pas de réseau. Réessaie une fois connecté.',
  INCONNU: 'Enregistrement impossible. Réessaie.',
};

/**
 * Traduit une erreur PostgREST en code court.
 *
 * L'ordre compte : les messages des déclencheurs voyagent dans `message` avec
 * le code SQLSTATE générique `P0001`, donc on les cherche avant de se rabattre
 * sur le SQLSTATE.
 */
export function codeDErreur(erreur: { code?: string; message?: string } | null): string {
  if (!erreur) return 'INCONNU';
  const message = erreur.message ?? '';

  for (const cle of [
    'DOUBLON',
    'CARTE_INTROUVABLE',
    'CARTE_CLOTUREE',
    'CYCLE_COMPLET',
    'MONTANT_INVALIDE',
  ]) {
    if (message.includes(cle)) return cle;
  }

  // 23514 : une contrainte CHECK. Sur les tables que le collecteur écrit, ce
  // sont les bornes de longueur et les bornes de montant.
  if (erreur.code === '23514') return 'BORNE';
  // 23505 : clé primaire violée — un rejeu que le déclencheur n'a pas intercepté.
  if (erreur.code === '23505') return 'DOUBLON';
  // 42501 : RLS ou liste blanche de colonnes. Un collecteur ne devrait jamais
  // le voir ; s'il le voit, c'est un défaut de l'application, pas de sa saisie.
  if (erreur.code === '42501') return 'DROIT_REFUSE';

  return 'INCONNU';
}

function echec(erreur: { code?: string; message?: string } | null): EchecEcriture {
  const code = codeDErreur(erreur);
  return { code, message: PHRASES[code] ?? PHRASES.INCONNU! };
}

export interface NouveauClient {
  nom: string;
  telephone?: string;
  marche?: string;
  activite?: string;
  /** Mise journalière de la première carte. */
  mise: number;
  /** Le client accepte de recevoir un avis à chaque mouvement. Faux par
      défaut : laisser un numéro n'est pas consentir à être notifié. */
  avisActifs?: boolean;
}

export interface ResultatCreation {
  clientId: string;
  carteId: string;
}

/**
 * Crée le client puis lui ouvre une carte.
 *
 * Deux instructions, sans transaction : PostgREST n'en propose pas. L'échec de
 * la seconde laisse donc un client sans carte — un état que le produit connaît
 * et affiche (le filtre « Sans carte » existe), pas une donnée corrompue. Le
 * message le dit plutôt que de faire croire à un échec total.
 */
export async function creerClientAvecCarte(
  collecteurId: string,
  saisie: NouveauClient,
): Promise<{ ok: true; resultat: ResultatCreation } | { ok: false; echec: EchecEcriture }> {
  const nom = saisie.nom.trim();
  if (!nom) {
    return { ok: false, echec: { code: 'NOM_VIDE', message: 'Le nom du client est obligatoire.' } };
  }
  if (!validerMise(saisie.mise)) {
    return {
      ok: false,
      echec: {
        code: 'MISE_HORS_BORNES',
        message: `La mise doit être comprise entre ${MISE_MIN} et ${MISE_MAX} FCFA.`,
      },
    };
  }

  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();

  // `?? null` plutôt que `undefined` : PostgREST omet les clés absentes, ce qui
  // est équivalent ici, mais un `null` explicite rend la ligne écrite lisible
  // dans le journal d'audit — « le champ était vide » plutôt que « le champ
  // n'a pas été envoyé ».
  const { error: erreurClient } = await supabase.from('clients').insert({
    id: clientId,
    collecteur_id: collecteurId,
    nom,
    telephone: saisie.telephone?.trim() || null,
    marche: saisie.marche?.trim() || null,
    activite: saisie.activite?.trim() || null,
    // Sans numéro, le consentement n'a pas d'objet : on ne l'enregistre pas,
    // sinon un numéro ajouté plus tard déclencherait des avis que personne
    // n'a acceptés à ce moment-là.
    avis_actifs: Boolean(saisie.avisActifs) && Boolean(saisie.telephone?.trim()),
  });
  if (erreurClient) return { ok: false, echec: echec(erreurClient) };

  const { error: erreurCarte } = await supabase.from('cartes').insert({
    id: carteId,
    collecteur_id: collecteurId,
    client_id: clientId,
    mise: saisie.mise,
  });
  if (erreurCarte) {
    return {
      ok: false,
      echec: {
        code: `CARTE_${codeDErreur(erreurCarte)}`,
        message: `${nom} est enregistré, mais sa carte n’a pas pu être ouverte. Ouvre-la depuis sa fiche.`,
      },
    };
  }

  return { ok: true, resultat: { clientId, carteId } };
}

/**
 * Enregistre une mise sur une carte.
 *
 * `collecteur_id` est envoyé parce que la politique RLS l'exige au moment du
 * `with check`, mais le déclencheur le réécrit ensuite depuis la carte : c'est
 * la carte qui décide à qui la mise appartient, pas le client. `est_commission`
 * n'est pas envoyé du tout — le serveur le décide seul, en regardant si la
 * carte a déjà encaissé.
 */
export async function enregistrerMise(
  collecteurId: string,
  carteId: string,
  montant: number,
  /** Injectable pour les tests ; sinon l'heure du téléphone. */
  encaisseLe: Date = new Date(),
): Promise<{ ok: true; miseId: string } | { ok: false; echec: EchecEcriture }> {
  if (!validerMise(montant)) {
    return {
      ok: false,
      echec: {
        code: 'MISE_HORS_BORNES',
        message: `La mise doit être comprise entre ${MISE_MIN} et ${MISE_MAX} FCFA.`,
      },
    };
  }

  const miseId = crypto.randomUUID();
  const { error } = await supabase.from('mises').insert({
    id: miseId,
    collecteur_id: collecteurId,
    carte_id: carteId,
    montant,
    encaisse_le: encaisseLe.toISOString(),
  });

  if (error) return { ok: false, echec: echec(error) };
  return { ok: true, miseId };
}

/**
 * Enregistre — ou retire — le consentement d'un client aux avis.
 *
 * C'est la seule colonne de `clients` que cet écran écrit après coup, et la
 * seule écriture du produit qui engage la vie privée de quelqu'un qui n'est pas
 * l'utilisateur de l'application. Deux choses en découlent.
 *
 * **Le collecteur est le bon porteur du geste.** Il est devant le client, il
 * peut lui demander ; personne d'autre n'est en position de le faire. Le
 * `GRANT UPDATE (avis_actifs)` de la migration `20260823140000` existe pour
 * exactement ce geste, et pour aucun autre.
 *
 * **Le retrait doit être aussi facile que l'octroi.** La fonction prend un
 * booléen plutôt que de s'appeler `activerAvis` : un dispositif de
 * consentement qu'on ne peut qu'allumer n'est pas un consentement.
 */
export async function definirConsentementAvis(
  clientId: string,
  accepte: boolean,
): Promise<{ ok: true } | { ok: false; echec: EchecEcriture }> {
  const { data, error } = await supabase
    .from('clients')
    .update({ avis_actifs: accepte })
    .eq('id', clientId)
    .select('id');

  if (error) return { ok: false, echec: echec(error) };

  // Le `.select()` ci-dessus n'est pas là pour lire la ligne : il est là pour
  // la **compter**. Un `update().eq()` nu ne rend aucune erreur quand RLS ou un
  // privilège de colonne écarte la ligne — PostgREST répond 204, zéro ligne
  // touchée, `error` à null. L'appelant concluait au succès, l'écran se relisait
  // et retrouvait l'ancienne valeur : le bouton semblait mort, sans qu'aucune
  // trace n'existe nulle part. Constaté le 2026-08-24.
  //
  // Ce geste engage la vie privée d'un tiers. Un retrait de consentement qu'on
  // croit enregistré et qui ne l'est pas continue d'envoyer le solde d'épargne
  // de quelqu'un sur un téléphone qu'il partage.
  if (!data || data.length === 0) {
    return { ok: false, echec: { code: 'RIEN_ECRIT', message: PHRASES.RIEN_ECRIT! } };
  }

  return { ok: true };
}

/**
 * Ouvre une nouvelle carte pour un client qui en avait déjà une.
 *
 * ## Pourquoi c'est un geste séparé de l'inscription
 *
 * Un client ne s'inscrit qu'une fois ; il ouvre des cartes toute sa vie. Après
 * les 31 mises d'un cycle, après une restitution en cours de route, ou parce
 * qu'il veut changer de montant — 500 FCFA en saison creuse, 2 000 quand le
 * commerce marche. La carte est l'unité qui se répète, pas le client.
 *
 * ## La contrainte qui gouverne ce geste
 *
 * `cartes_une_active_par_client` : un index unique partiel autorise **une seule
 * carte active par client**. Ouvrir la nouvelle exige donc que l'ancienne soit
 * clôturée — c'est-à-dire que l'argent ait été rendu.
 *
 * Ce n'est pas une gêne technique, c'est la règle du métier rendue
 * inviolable : deux carnets ouverts en même temps sur le même client, c'est
 * deux soldes à retenir, et la première dispute au moment de rendre l'argent.
 *
 * Une violation remonte en `23505`, traduite ici en une phrase qui dit quoi
 * faire — et non « doublon », qui ferait croire à un double appui.
 */
export async function ouvrirCarte(
  collecteurId: string,
  clientId: string,
  mise: number,
): Promise<{ ok: true; carteId: string } | { ok: false; echec: EchecEcriture }> {
  if (!validerMise(mise)) {
    return {
      ok: false,
      echec: {
        code: 'MISE_HORS_BORNES',
        message: `La mise doit être comprise entre ${MISE_MIN} et ${MISE_MAX} FCFA.`,
      },
    };
  }

  const carteId = crypto.randomUUID();
  const { error } = await supabase.from('cartes').insert({
    id: carteId,
    collecteur_id: collecteurId,
    client_id: clientId,
    mise,
  });

  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        echec: {
          code: 'CARTE_ACTIVE_EXISTANTE',
          message:
            'Ce client a déjà une carte en cours. Clôture-la depuis « Retrait » — tu lui rends son argent — avant d’en ouvrir une nouvelle.',
        },
      };
    }
    return { ok: false, echec: echec(error) };
  }

  return { ok: true, carteId };
}
