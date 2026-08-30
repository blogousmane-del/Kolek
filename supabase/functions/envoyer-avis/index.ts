import { createClient } from 'npm:@supabase/supabase-js@2';

import { envoyer, passerelleDepuis, verifierIdentifiants } from '../_shared/passerelle-sms.ts';

/**
 * Le drainage de la file des avis.
 *
 * Appelée par une tâche planifiée — pas par un navigateur. Elle n'a donc
 * **aucun en-tête CORS** : aucune page n'a de raison légitime de l'appeler, et
 * ne pas en émettre est la façon la plus simple de le dire.
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

  const passerelle = passerelleDepuis(Deno.env.toObject());
  if (!passerelle) {
    // Ni erreur ni succès : un état, nommé. La file est intacte.
    console.log('Aucune passerelle configurée — la file reste en attente.');
    return reponse({ etat: 'PASSERELLE_NON_CONFIGUREE', envoyes: 0, echecs: 0 });
  }

  const client = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client
    .from('avis_clients')
    .select('id, collecteur_id, destinataire, corps, segments, tentatives')
    .in('statut', ['a_envoyer', 'echoue'])
    .lt('tentatives', TENTATIVES_MAX)
    .order('cree_le', { ascending: true })
    .limit(LOT);

  if (error) {
    console.error('Lecture de la file impossible :', error.message);
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
          tentatives: avis.tentatives + 1,
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

    const tentatives = avis.tentatives + 1;
    // `abandonne` est définitif : ni un refus d'identifiants ni un numéro
    // invalide ne passeront au quatrième essai, et les rejouer indéfiniment
    // masquerait la cause sous le bruit.
    const statut =
      !issue.reessayable || tentatives >= TENTATIVES_MAX ? 'abandonne' : 'echoue';

    await client
      .from('avis_clients')
      .update({
        statut,
        tentatives,
        derniere_erreur: diagnostic
          ? `${issue.raison} | SONDE: ${diagnostic}`.slice(0, 400)
          : issue.raison,
      })
      .eq('id', avis.id);

    echecs += 1;
  }

  return reponse({ etat: 'DRAINE', envoyes, echecs, examines: file.length });
});
