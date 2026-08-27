import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_SITE, entetesCors, listerOrigines } from '../_shared/cors.ts';
import { empreinteRequete } from '../_shared/debit.ts';
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

  const { error } = await client.from('demandes_ouverture').insert(verdict.demande);

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

  // Rien de la ligne écrite. Juste l'accusé.
  return reponse({ recue: true }, 201, requete);
});
