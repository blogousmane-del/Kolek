import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  envoyer,
  passerelleDepuis,
  sondeDemandee,
  verifierIdentifiants,
} from '../_shared/passerelle-sms.ts';
import { secretValide } from '../_shared/secret.ts';

/**
 * Le drainage de la file des avis.
 *
 * Appelée par une tâche planifiée — pas par un navigateur. Elle n'a donc
 * **aucun en-tête CORS** : aucune page n'a de raison légitime de l'appeler, et
 * ne pas en émettre est la façon la plus simple de le dire.
 *
 * ## Qui a le droit d'entrer
 *
 * Ne pas émettre de CORS dit une intention ; ça n'arrête personne. `curl` s'en
 * moque, et la barrière de plateforme `verify_jwt` accepte la **clé publiable**,
 * qui voyage dans le paquet JavaScript des trois sites — par construction, pas
 * par accident. Jusqu'au 2026-09-03, cette fonction ne contrôlait donc que la
 * méthode HTTP : n'importe qui pouvait déclencher un drainage.
 *
 * L'appelant légitime est `avis_declencher_drainage()`, qui lit la clé de
 * service dans Vault et la présente en porteur. C'est cette clé, et elle seule,
 * qui ouvre ici — comparée à temps constant, parce qu'une comparaison qui
 * s'arrête au premier caractère différent dit combien de caractères étaient
 * bons.
 *
 * Le contrôle passe **avant** l'examen de la passerelle : sinon un appelant sans
 * droit apprendrait, par la seule différence entre deux réponses, si les
 * identifiants SMS sont posés.
 *
 * ## Ce qu'elle fait quand rien n'est configuré
 *
 * Elle ne fait rien, et elle le dit. Pas d'envoi simulé, pas de ligne marquée
 * « envoyé ». La file reste intacte et repartira telle quelle le jour où les
 * identifiants arriveront.
 *
 * C'est le point le plus important du dispositif. Un système d'avis qui
 * prétendrait avoir prévenu sans avoir prévenu serait **pire que son absence** :
 * le client croirait détenir une trace, le collecteur croirait être surveillé,
 * et personne ne le découvrirait avant une contestation — c'est-à-dire au pire
 * moment.
 *
 * ## Pourquoi le lot se réserve avant de partir
 *
 * Cette fonction lisait sa file par un `select`, envoyait, puis marquait
 * `envoye`. Rien n'empêchait deux exécutions de lire les mêmes lignes — et il
 * n'en faut pas dix : un lot de cinquante SMS dépasse la minute qui sépare deux
 * réveils de l'horloge. Le client recevait deux fois « versement 500 FCFA » et
 * croyait avoir versé mille ; le collecteur payait deux fois le segment.
 *
 * `avis_reserver_lot` remplace le `select`. Elle marque `en_cours` et ne rend
 * que ce qu'elle a marqué, sous `for update skip locked` : deux drainages
 * simultanés ne voient jamais la même ligne. Ce que la base rend est donc à nous
 * seuls.
 *
 * `tentatives` s'incrémente à la réservation, plus ici. Une ligne sortie de la
 * réservation a consommé son essai même si cette fonction meurt avant d'écrire —
 * ce qui est voulu : c'est ce qui empêche une ligne empoisonnée de tourner sans
 * fin. Les réservations qu'une mort laisse derrière elle sont libérées par la
 * réservation suivante, au bout de cinq minutes.
 *
 * ## L'ordre des opérations, et pourquoi il ne peut pas être inversé
 *
 * On marque `envoye` **après** le retour de la passerelle, jamais avant. Le
 * risque assumé est donc un double envoi si la fonction meurt entre l'appel et
 * l'écriture — un message en trop, gênant. Le risque inverse serait un message
 * jamais parti mais compté comme parti : un client non prévenu qui se croit
 * prévenu. Entre les deux, on choisit celui qui se voit.
 */

const LOT = 50;
const TENTATIVES_MAX = 3;

interface Avis {
  id: string;
  collecteur_id: string;
  destinataire: string;
  corps: string;
  segments: number;
  /** Déjà incrémenté par `avis_reserver_lot` : c'est le numéro de cet essai-ci. */
  tentatives: number;
}

function reponse(corps: unknown, statut = 200): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (requete) => {
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cleService) {
    console.error('Configuration Supabase incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500);
  }

  // Voir l'en-tête. Le porteur attendu est la clé de service, celle que
  // `avis_declencher_drainage()` sort de Vault — pas la clé publiable, que
  // `verify_jwt` a déjà laissé passer.
  const porteur = requete.headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;
  if (!(await secretValide(porteur, cleService))) {
    console.error('Appel refusé : porteur absent ou différent de la clé de service.');
    return reponse({ erreur: 'ACCES_RESERVE' }, 403);
  }

  const passerelle = passerelleDepuis(Deno.env.toObject());
  if (!passerelle) {
    // Ni erreur ni succès : un état, nommé. La file est intacte.
    console.log('Aucune passerelle configurée — la file reste en attente.');
    return reponse({ etat: 'PASSERELLE_NON_CONFIGUREE', envoyes: 0, echecs: 0 });
  }

  // La sonde passe avant la file : elle ne lit rien, n'envoie rien, et répond
  // à la seule question qui bloquait — « ces identifiants sont-ils acceptés ? »
  // Chercher la réponse dans un vrai envoi obligeait à déranger un client pour
  // un diagnostic qui ne le concerne pas.
  if (await sondeDemandee(requete)) {
    const verdict = await verifierIdentifiants(passerelle);
    console.log('Sonde des identifiants :', verdict);
    return reponse({ etat: 'SONDE', verdict });
  }

  const client = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.rpc('avis_reserver_lot', { p_taille: LOT });

  if (error) {
    console.error('Réservation du lot impossible :', error.message);
    return reponse({ erreur: 'LECTURE_IMPOSSIBLE' }, 500);
  }

  const file = (data ?? []) as Avis[];
  let envoyes = 0;
  let echecs = 0;

  // La sonde d'identifiants, au plus une fois par drainage.
  //
  // Elle ne part que si la passerelle a refusé l'authentification, et son
  // résultat est collé à la raison du premier avis concerné. Une fois suffit :
  // cinquante avis refusés pour la même clé donneraient cinquante fois la même
  // réponse, et cinquante appels à une passerelle qui vient de dire non.
  let diagnostic: string | null = null;

  for (const avis of file) {
    const issue = await envoyer(passerelle, avis.destinataire, avis.corps);

    if (issue.ok) {
      await client
        .from('avis_clients')
        .update({
          statut: 'envoye',
          envoye_le: new Date().toISOString(),
          reserve_le: null,
          derniere_erreur: null,
        })
        .eq('id', avis.id);

      // Le compteur de quota n'avance qu'après un envoi réussi : on ne fait pas
      // payer au collecteur les messages que la passerelle a refusés.
      await client.rpc('avis_consommer_quota', {
        collecteur: avis.collecteur_id,
        segments: avis.segments,
      });

      envoyes += 1;
      continue;
    }

    // « Pourquoi » plutôt que « encore ». Voir `verifierIdentifiants` : un refus
    // d'authentification ne dit pas si la faute est dans les identifiants ou
    // dans notre requête, et les deux se corrigent à des endroits opposés.
    if (issue.raison.startsWith('IDENTIFIANTS_REFUSES') && diagnostic === null) {
      diagnostic = await verifierIdentifiants(passerelle);
      console.error('Sonde des identifiants :', diagnostic);
    }

    // `abandonne` est définitif : ni un refus d'identifiants ni un numéro
    // invalide ne passeront au quatrième essai, et les rejouer indéfiniment
    // masquerait la cause sous le bruit. `avis.tentatives` compte déjà cet
    // essai-ci — la réservation l'a incrémenté avant de rendre la ligne.
    const statut =
      !issue.reessayable || avis.tentatives >= TENTATIVES_MAX ? 'abandonne' : 'echoue';

    await client
      .from('avis_clients')
      .update({
        statut,
        reserve_le: null,
        derniere_erreur: diagnostic
          ? `${issue.raison} | SONDE: ${diagnostic}`.slice(0, 400)
          : issue.raison,
      })
      .eq('id', avis.id);

    echecs += 1;
  }

  return reponse({ etat: 'DRAINE', envoyes, echecs, examines: file.length });
});
