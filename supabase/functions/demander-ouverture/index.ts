import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_SITE, entetesCors, listerOrigines } from '../_shared/cors.ts';
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
