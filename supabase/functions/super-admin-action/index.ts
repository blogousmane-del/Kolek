import {
  entetesPour,
  estDateIso,
  estUuid,
  ouvrir,
  reponse,
} from '../_shared/portillon-super-admin.ts';

/**
 * Les écritures du Super Admin : privilèges et remises.
 *
 * ## Séparée de la lecture, volontairement
 *
 * `super-admin-etat` est appelée à chaque ouverture d'écran ; celle-ci ne l'est
 * jamais sans un clic. Les fondre en une seule route mettrait la révocation
 * d'un administrateur sur le même chemin qu'un rafraîchissement, et le premier
 * rejeu de requête malheureux ferait le reste.
 *
 * ## Un refus métier rend 409, jamais 200
 *
 * « Tu ne peux pas te rétrograder toi-même », « ce code est épuisé » : ce sont
 * des refus, pas des réussites. Servis en 200 avec un `fait: false` dans le
 * corps, ils finissent lus comme des succès par le premier appelant qui ne
 * regarde que le statut — et celui-là existe toujours.
 *
 * La distinction tenue ici : 400 pour une requête mal formée, 403 pour une
 * porte fermée, 409 pour une demande comprise et refusée.
 *
 * ## Aucune règle de privilège ici
 *
 * « Pas d'action sur soi-même », le verrou sur les lignes `super`, le quota
 * atomique : tout cela vit en SQL. Cette route valide des formes et traduit des
 * verdicts. Une règle d'autorisation écrite en TypeScript serait contournable
 * par la prochaine route qui l'oublie.
 */

interface Verdict {
  fait?: boolean;
  applique?: boolean;
  raison?: string;
}

/** `appliquer_code_promo` dit `applique`, les fonctions de privilège disent
    `fait`. L'écran n'a pas à connaître les deux mots. */
function traduire(verdict: Verdict, requete: Request): Response {
  const aboutit = verdict.fait ?? verdict.applique;
  if (aboutit !== true) {
    return reponse({ fait: false, raison: verdict.raison ?? 'refus' }, 409, requete);
  }
  return reponse({ ...verdict, fait: true }, 200, requete);
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesPour(requete) });
  }
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }

  const ouverture = await ouvrir(requete);
  if (ouverture instanceof Response) return ouverture;
  const { service } = ouverture;

  let corps: Record<string, unknown>;
  try {
    corps = (await requete.json()) as Record<string, unknown>;
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  switch (corps.action) {
    case 'definir_niveau': {
      if (!estUuid(corps.cible) || typeof corps.niveau !== 'string') {
        return reponse({ erreur: 'CHAMPS_INVALIDES' }, 400, requete);
      }
      const { data, error } = await service.rpc('super_admin_definir_niveau', {
        p_cible: corps.cible,
        p_niveau: corps.niveau,
      });
      if (error) {
        console.error('super_admin_definir_niveau a échoué :', error.message);
        return reponse({ erreur: 'ECRITURE_IMPOSSIBLE' }, 500, requete);
      }
      return traduire(data as Verdict, requete);
    }

    case 'revoquer': {
      if (!estUuid(corps.cible)) {
        return reponse({ erreur: 'CHAMPS_INVALIDES' }, 400, requete);
      }
      const { data, error } = await service.rpc('super_admin_revoquer', { p_cible: corps.cible });
      if (error) {
        console.error('super_admin_revoquer a échoué :', error.message);
        return reponse({ erreur: 'ECRITURE_IMPOSSIBLE' }, 500, requete);
      }
      return traduire(data as Verdict, requete);
    }

    case 'creer_code': {
      const { code, remise_pct, valide_du, valide_au, quota } = corps;
      if (
        typeof code !== 'string' ||
        typeof remise_pct !== 'number' ||
        // Les dates sont vérifiées ici et pas seulement par la base : une date
        // invalide lève un 22007, qu'aucune branche métier n'attrape, et
        // ressortait en 500. Une faute de frappe n'est pas une panne.
        !estDateIso(valide_du) ||
        !estDateIso(valide_au) ||
        (quota !== undefined && quota !== null && typeof quota !== 'number')
      ) {
        return reponse({ erreur: 'CHAMPS_INVALIDES' }, 400, requete);
      }

      // Les bornes réelles — format du code, remise entre 1 et 100, période
      // cohérente — sont des contraintes de table. Les redire ici en ferait
      // une seconde copie, qui finirait par diverger de celle qui décide.
      const { error } = await service.from('codes_promo').insert({
        code,
        remise_pct,
        valide_du,
        valide_au,
        quota: quota ?? null,
        utilisations: 0,
      });

      if (error) {
        if (error.code === '23505') {
          return reponse({ fait: false, raison: 'code_existant' }, 409, requete);
        }
        if (error.code === '23514') {
          return reponse({ fait: false, raison: 'code_hors_bornes' }, 409, requete);
        }
        console.error('création du code a échoué :', error.message);
        return reponse({ erreur: 'ECRITURE_IMPOSSIBLE' }, 500, requete);
      }
      return reponse({ fait: true, code }, 200, requete);
    }

    case 'appliquer_code': {
      if (!estUuid(corps.collecteur) || typeof corps.code !== 'string') {
        return reponse({ erreur: 'CHAMPS_INVALIDES' }, 400, requete);
      }
      const { data, error } = await service.rpc('appliquer_code_promo', {
        p_collecteur: corps.collecteur,
        p_code: corps.code,
      });
      if (error) {
        console.error('appliquer_code_promo a échoué :', error.message);
        return reponse({ erreur: 'ECRITURE_IMPOSSIBLE' }, 500, requete);
      }
      return traduire(data as Verdict, requete);
    }

    default:
      return reponse({ erreur: 'ACTION_INCONNUE' }, 400, requete);
  }
});
