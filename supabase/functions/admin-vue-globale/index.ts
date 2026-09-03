import { createClient } from 'npm:@supabase/supabase-js@2';

import { entetesCors, listerOrigines } from '../_shared/cors.ts';
import { TARIFS, tarifParCle } from '../_shared/paliers.ts';

/**
 * Vue globale du Dashboard GTCS.
 *
 * Cette fonction existe pour une seule raison : donner à l'administration les
 * chiffres de toute la plateforme **sans jamais mettre la clé de service dans un
 * navigateur**. C'est la première des quatre failles listées dans la grille
 * d'audit du dépôt, et le mur qu'on rencontre en câblant cet écran est
 * exactement celui qui pousse à la commettre — aucune politique RLS n'accorde à
 * un administrateur la lecture des données d'un autre collecteur, et c'est
 * voulu.
 *
 * ## Le contrôle d'accès, dans l'ordre
 *
 * 1. Un jeton doit être présent. Sans lui, 401.
 * 2. `est_admin()` est appelée **avec le jeton de l'appelant**, jamais avec la
 *    clé de service. C'est le point central : la question posée est « *cet
 *    utilisateur-ci* est-il administrateur ? », et seule une requête portant son
 *    identité peut y répondre. Interroger `admins` avec la clé de service
 *    répondrait à une autre question, et un jeton expiré ou révoqué passerait.
 * 3. Seulement ensuite, et seulement si la réponse est vrai, la clé de service
 *    sort pour appeler `admin_vue_globale()` — qui est elle-même inexécutable
 *    par `anon` et `authenticated`, garde-fou vérifié dans la migration.
 *
 * Toute réponse autre qu'un `true` franc referme la porte : erreur réseau,
 * `data` nulle, jeton illisible. Un portillon qui s'ouvre quand il ne sait pas
 * n'est pas un portillon — même règle que côté interface, et pour la même
 * raison.
 */

const ORIGINES_AUTORISEES = listerOrigines(Deno.env.get('ORIGINES_ADMIN'));

/** Les en-têtes à rendre pour cette requête. `requete` sert à relire l'en-tête
    `Access-Control-Request-Headers` du préalable — voir `_shared/cors.ts`. */
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

interface Comptage {
  palier: string;
  total: number;
  actifs: number;
  /**
   * La somme des remises en cours sur ce palier, exprimée en fraction
   * d'abonnement : deux collecteurs à −20 % valent 0,4 offert.
   *
   * C'est la forme qui permet à la base de dire ce qu'on a consenti sans jamais
   * connaître un prix. Un montant ici obligerait à recopier la grille en SQL, et
   * deux copies d'un prix finissent par diverger — ce que tout ce fichier existe
   * pour empêcher.
   */
  offerts: number;
}

/**
 * Le chiffre d'affaires récurrent. La base compte les collecteurs par palier,
 * la grille tarifaire donne les prix : c'est ici, et nulle part ailleurs, que
 * les deux se rencontrent.
 *
 * Seuls les abonnements `actif` comptent. Un abonnement suspendu ou expiré
 * n'encaisse rien, et le faire figurer au MRR reviendrait à annoncer un revenu
 * qui n'arrive pas.
 *
 * Les remises se déduisent ici, pour la même raison : `offerts` est un nombre
 * d'abonnements, la grille en fait des francs. Le MRR annoncé est donc celui
 * qu'on encaissera, et `mrrCatalogue` reste à côté — sans lui, une remise mal
 * saisie ressemblerait à une perte de clients.
 */
function calculerMrr(comptages: Comptage[]) {
  const parPalier = TARIFS.map((tarif) => {
    const trouve = comptages.find((c) => c.palier === tarif.cle);
    const actifs = trouve?.actifs ?? 0;
    // Borné à `actifs` : la base garantit déjà qu'une remise vaut au plus un
    // abonnement, mais un MRR négatif serait plus difficile à voir qu'à causer.
    const offerts = Math.min(Math.max(Number(trouve?.offerts ?? 0), 0), actifs);
    return {
      palier: tarif.cle,
      nom: tarif.nom,
      prix: tarif.prix,
      limiteClients: tarif.limiteClients,
      total: trouve?.total ?? 0,
      actifs,
      offerts,
      mrrCatalogue: actifs * tarif.prix,
      remise: offerts * tarif.prix,
      mrr: (actifs - offerts) * tarif.prix,
    };
  });

  // Un palier présent en base mais absent de la grille est une incohérence de
  // données : la contrainte `collecteurs_palier_check` devrait l'empêcher. On
  // lève plutôt que de l'omettre — un MRR silencieusement amputé est pire qu'une
  // erreur visible.
  for (const c of comptages) tarifParCle(c.palier);

  return {
    mrr: parPalier.reduce((somme, p) => somme + p.mrr, 0),
    mrrCatalogue: parPalier.reduce((somme, p) => somme + p.mrrCatalogue, 0),
    remise: parPalier.reduce((somme, p) => somme + p.remise, 0),
    parPalier,
  };
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesPour(requete) });
  }

  const autorisation = requete.headers.get('Authorization');
  if (!autorisation?.startsWith('Bearer ')) {
    return reponse({ erreur: 'JETON_ABSENT' }, 401, requete);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const cleAnon = Deno.env.get('SUPABASE_ANON_KEY');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !cleAnon || !cleService) {
    // Ne jamais dire laquelle manque : la réponse part vers le réseau.
    console.error('Configuration incomplète : URL, clé anon ou clé de service absente.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  // --- Portillon, sous l'identité de l'appelant ---

  const clientAppelant = createClient(url, cleAnon, {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let estAdmin = false;
  try {
    const { data, error } = await clientAppelant.rpc('est_admin');
    if (error) {
      console.error('est_admin a échoué :', error.message);
      return reponse({ erreur: 'VERIFICATION_IMPOSSIBLE' }, 403, requete);
    }
    estAdmin = data === true;
  } catch (cause) {
    // `rpc` rend un « thenable » : une coupure se présente comme un jet, pas
    // comme un `error` peuplé. Sans ce `catch`, la fonction rendrait 500 — et
    // un 500 sur un contrôle d'accès est une porte qu'on n'a pas su fermer.
    console.error('est_admin a levé :', cause instanceof Error ? cause.message : cause);
    return reponse({ erreur: 'VERIFICATION_IMPOSSIBLE' }, 403, requete);
  }

  if (!estAdmin) {
    return reponse({ erreur: 'ACCES_RESERVE' }, 403, requete);
  }

  // --- Passé ce point seulement, la clé de service sort ---

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await clientService.rpc('admin_vue_globale');
  if (error) {
    console.error('admin_vue_globale a échoué :', error.message);
    return reponse({ erreur: 'AGREGATION_IMPOSSIBLE' }, 500, requete);
  }

  const brut = data as Record<string, unknown>;
  const comptages = (brut.par_palier ?? []) as Comptage[];

  let abonnements;
  try {
    const { mrr, mrrCatalogue, remise, parPalier } = calculerMrr(comptages);
    abonnements = {
      ...(brut.abonnements as Record<string, unknown>),
      mrr,
      mrrCatalogue,
      remise,
      parPalier,
    };
  } catch (cause) {
    console.error('Palier inconnu en base :', cause instanceof Error ? cause.message : cause);
    return reponse({ erreur: 'PALIER_INCONNU' }, 500, requete);
  }

  // Tout ce que la vue SQL produit est transmis, et seul `abonnements` est
  // remplacé — c'est la seule clé que cette fonction enrichit, en y ajoutant le
  // chiffre d'affaires calculé depuis la grille tarifaire.
  //
  // La première version énumérait les clés une à une. La migration qui a ajouté
  // `cartes` n'a pas été reportée ici, et les deux écrans qui la lisent —
  // « Encours & Soldes » et la fiche d'un collecteur — tombaient sur
  // `undefined`. Transmettre l'ensemble supprime la classe de défaut : la vue
  // SQL décide de ce qu'elle rend, et rien ne se perd en chemin.
  // Second appel, plutôt qu'un bloc de plus dans `admin_vue_globale()`. Un
  // échec ici ne doit pas priver l'administration de tout le tableau de bord :
  // les paiements sont une colonne en plus, pas le cœur de l'écran. `null`
  // voyage donc jusqu'à l'écran, qui affiche « indisponible » plutôt qu'un
  // tiret — un tiret se lirait « jamais payé », et une panne passerait pour un
  // impayé.
  let paiements: unknown = null;
  const { data: lus, error: erreurPaiements } = await clientService.rpc('admin_paiements_recents');
  if (erreurPaiements) {
    console.error('admin_paiements_recents a échoué :', erreurPaiements.message);
  } else {
    paiements = lus;
  }

  return reponse({ ...brut, genereLe: brut.genere_le, abonnements, paiements }, 200, requete);
});
