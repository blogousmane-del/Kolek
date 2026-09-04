import { createClient } from 'npm:@supabase/supabase-js@2';

import { signatureChariowValide } from '../_shared/chariow.ts';
import { chargerPaiementsRattrapables, creerDepot, type Cible } from '../_shared/depot-chariow.ts';
import { ouvrirCompteDepuisDemande } from '../_shared/ouvrir-compte.ts';
import { reconcilier } from '../_shared/reconciliation.ts';
import { secretValide } from '../_shared/secret.ts';

/**
 * Le webhook « Pulse » de Chariow.
 *
 * ## Le premier point d'entrée public du projet
 *
 * Les autres Edge Functions exigent toutes un jeton ; celle-ci ne peut pas.
 * Chariow ne signe pas ses appels — `Docs/Chariow.md` §7 — et le seul secret
 * partagé voyage dans l'URL. `supabase/config.toml` porte donc, pour cette
 * fonction et pour elle seule, `verify_jwt = false`.
 *
 * Quatre garde-fous en contrepartie :
 *
 * 1. **Le secret est comparé en temps constant.** Une comparaison de chaînes
 *    s'arrête au premier caractère différent et fuit la longueur du préfixe
 *    correct.
 * 2. **La fonction ne crédite rien par elle-même.** Le corps du webhook n'est
 *    pas une preuve de paiement : il dit seulement *quelles* lignes relire. La
 *    décision vient toujours d'un `GET /sales/{id}`. C'est ce qui rend le secret
 *    non critique — le connaître permet de déclencher une relecture, pas
 *    d'obtenir un abonnement. C'est aussi ce qui rend inoffensives des
 *    métadonnées forgées : elles désignent des lignes, et chaque ligne porte
 *    son propre rattachement, lu en base et jamais dans le corps reçu.
 * 3. **Aucun en-tête CORS.** Aucun navigateur n'appelle cette adresse.
 * 4. **200 même sur un événement inconnu**, pour ne pas provoquer de vagues de
 *    réessais ; 401 sur secret invalide, sans autre détail.
 *
 * ## Ce que l'amendement « payer vaut accord » ajoute ici
 *
 * C'est le seul chemin qui injecte une vraie stratégie d'ouverture de compte.
 * `abonnement-verifier` réconcilie les paiements du collecteur connecté — ils
 * portent tous un compte ; le webhook, lui, reçoit les règlements de prospects,
 * dont le paiement précède le compte. `ouvrirCompteDepuisDemande` fait naître
 * ce compte, et `reconcilier` garde l'ordre : vente reconnue réglée, puis
 * compte, puis crédit.
 *
 * Fail-closed : sans `CHARIOW_SECRET_WEBHOOK` dans l'environnement, `secretValide`
 * compare à la chaîne vide et refuse tout. Une fonction déployée avant que son
 * secret ne soit posé ne s'ouvre donc à personne.
 */

const JSON_ENTETES = { 'Content-Type': 'application/json' };

function reponse(corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: JSON_ENTETES });
}

/** Une chaîne non vide, ou rien. Les métadonnées viennent du corps reçu. */
function texte(valeur: unknown): string | null {
  return typeof valeur === 'string' && valeur ? valeur : null;
}

Deno.serve(async (requete) => {
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405);
  }

  const secretAttendu = Deno.env.get('CHARIOW_SECRET_WEBHOOK') ?? '';
  const secretRecu = new URL(requete.url).searchParams.get('secret');

  if (!(await secretValide(secretRecu, secretAttendu))) {
    return reponse({ erreur: 'SECRET_INVALIDE' }, 401);
  }

  // Le corps brut, lu **avant** tout parsing : la signature porte sur les
  // octets reçus, et `JSON.stringify` d'un objet analysé n'en rend pas les
  // mêmes. Une seule lecture est possible sur un Request — d'où le `text()`
  // ici et le `JSON.parse` plus bas, au lieu du `json()` d'avant.
  const corpsBrut = await requete.text();

  // La barrière que le fournisseur prescrit. Fail-closed comme le secret d'URL :
  // sans `CHARIOW_SECRET_SIGNATURE`, `signatureChariowValide` refuse tout. Une
  // fonction déployée avant son secret ne s'ouvre à personne.
  const signature = requete.headers.get('x-chariow-signature');
  const secretSignature = Deno.env.get('CHARIOW_SECRET_SIGNATURE') ?? '';

  if (!(await signatureChariowValide(signature, corpsBrut, secretSignature))) {
    return reponse({ erreur: 'SIGNATURE_INVALIDE' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cleApi = Deno.env.get('CHARIOW_CLE_API');
  const racine = Deno.env.get('CHARIOW_API_URL') ?? 'https://api.chariow.com/v1';

  if (!url || !cleService || !cleApi) {
    console.error('Configuration incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500);
  }

  let charge: Record<string, unknown>;
  try {
    charge = JSON.parse(corpsBrut) as Record<string, unknown>;
  } catch {
    // Corps illisible : on accuse réception sans rien faire. Réessayer
    // n'améliorerait pas un corps mal formé.
    return reponse({ recu: true }, 200);
  }

  const donnees = (charge.data ?? charge) as Record<string, unknown>;
  const metadonnees = (donnees.custom_metadata ?? {}) as Record<string, unknown>;
  const venteId = texte(donnees.id);

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Quelles lignes relire ---
  //
  // Les métadonnées de la vente d'abord, notre registre ensuite. Ni l'une ni
  // l'autre ne décide de qui sera crédité : elles ne font que désigner des
  // lignes, dont le rattachement est relu en base par
  // `chargerPaiementsRattrapables`.
  const collecteurMeta = texte(metadonnees.collecteurId);
  const demandeMeta = texte(metadonnees.demandeId);

  let cible: Cible | null = collecteurMeta
    ? { collecteur: collecteurMeta }
    : demandeMeta
      ? { demande: demandeMeta }
      : null;

  if (!cible && venteId) {
    const { data } = await clientService
      .from('paiements_abonnement')
      .select('collecteur_id, demande_id')
      .eq('vente_id', venteId)
      .maybeSingle();
    const ligne = data as { collecteur_id: string | null; demande_id: string | null } | null;
    if (ligne?.collecteur_id) cible = { collecteur: ligne.collecteur_id };
    else if (ligne?.demande_id) cible = { demande: ligne.demande_id };
  }

  if (!cible) {
    // Événement qui ne nous concerne pas, ou vente inconnue. On accuse
    // réception : provoquer des réessais sur un événement étranger n'aide
    // personne.
    console.error('[Abonnement] webhook sans rattachement identifiable');
    return reponse({ recu: true }, 200);
  }

  try {
    const paiements = await chargerPaiementsRattrapables(clientService, cible);
    const depot = creerDepot(
      clientService,
      { racine, cleApi },
      // La seule injection d'une vraie ouverture de compte du dépôt. Voir
      // l'en-tête d'`ouvrir-compte.ts` pour l'ordre et la reprise.
      ouvrirCompteDepuisDemande(clientService),
    );
    const resultat = await reconcilier(paiements, depot);
    return reponse({ recu: true, credites: resultat.credites }, 200);
  } catch (cause) {
    console.error('[Abonnement] webhook :', cause instanceof Error ? cause.message : cause);
    // 500 ici est utile : il fait réessayer Chariow, et une panne de notre côté
    // mérite un réessai.
    return reponse({ erreur: 'RECONCILIATION_IMPOSSIBLE' }, 500);
  }
});
