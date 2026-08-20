/**
 * Refuser les mots de passe qui figurent dans une fuite publique connue.
 *
 * ## Pourquoi ce module existe alors que Supabase sait le faire
 *
 * Supabase propose `Prevent use of leaked passwords`, activé sur le projet le
 * 2026-08-20. Ce réglage ne couvre pas le seul chemin par lequel un compte naît
 * dans Kolek : `auth.admin.createUser`, qui **ne fait tourner aucune règle de
 * mot de passe**. Défaut ouvert chez l'éditeur, supabase/auth#1959 — la même
 * bibliothèque applique pourtant ces règles dans `admin.updateUser`.
 *
 * Conséquence mesurée le 2026-08-20 : un compte a été créé avec `password123`
 * alors que le réglage distant était actif. Tant que ce défaut vit, la case
 * cochée au tableau de bord ne protège que des chemins que Kolek n'emprunte
 * pas — l'inscription publique est fermée, et le changement de mot de passe
 * n'est pas encore proposé. Le contrôle doit donc vivre ici.
 *
 * ## Le mot de passe ne sort pas
 *
 * Protocole de k-anonymat de Have I Been Pwned. On calcule l'empreinte SHA-1,
 * on n'envoie que ses **cinq premiers caractères**, et le service renvoie tous
 * les suffixes qu'il connaît sous ce préfixe — plusieurs centaines. La
 * comparaison se fait ici. Ni le mot de passe ni son empreinte entière ne
 * quittent la fonction, et le service ne peut pas savoir lequel des suffixes
 * nous intéressait.
 *
 * `Add-Padding: true` demande en plus des entrées factices de compte nul, pour
 * que la taille de la réponse ne trahisse pas le préfixe demandé.
 *
 * SHA-1 est imposé par le protocole. Ce n'est pas un choix de hachage de mot de
 * passe — rien n'est stocké ici ; c'est un index de recherche.
 */

const RACINE = 'https://api.pwnedpasswords.com/range/';
const DELAI_MS = 4000;

/** Longueur du préfixe envoyé au service. Fixée par le protocole. */
export const PREFIXE_LONGUEUR = 5;

export type Verdict =
  | { etat: 'compromis'; occurrences: number }
  | { etat: 'sain' }
  | { etat: 'indisponible'; raison: string };

/** Empreinte SHA-1 en hexadécimal majuscule, comme l'attend le service. */
export async function empreinteSha1(motDePasse: string): Promise<string> {
  const condensat = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(motDePasse),
  );
  return Array.from(new Uint8Array(condensat))
    .map((octet) => octet.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Cherche un suffixe dans la réponse du service, au format `SUFFIXE:COMPTE`.
 *
 * Rendre `0` pour un suffixe absent est correct **et** nécessaire : le
 * rembourrage demandé par `Add-Padding` insère justement des entrées de compte
 * nul, qu'il faut traiter comme une absence.
 */
export function compterOccurrences(corps: string, suffixe: string): number {
  const cible = suffixe.trim().toUpperCase();
  for (const ligne of corps.split('\n')) {
    const separateur = ligne.indexOf(':');
    if (separateur === -1) continue;
    if (ligne.slice(0, separateur).trim().toUpperCase() !== cible) continue;
    const compte = Number.parseInt(ligne.slice(separateur + 1).trim(), 10);
    return Number.isFinite(compte) && compte > 0 ? compte : 0;
  }
  return 0;
}

/**
 * `recuperer` est injectable pour que la suite de tests couvre ce chemin sans
 * réseau. C'est la leçon du défaut CORS du 2026-08-20 : ce qui n'est pas
 * testable finit par être faux, et une sonde qui ne peut pas échouer ne prouve
 * rien.
 */
export async function verifierFuite(
  motDePasse: string,
  recuperer: typeof fetch = fetch,
): Promise<Verdict> {
  if (!motDePasse) return { etat: 'indisponible', raison: 'MOT_DE_PASSE_VIDE' };

  let empreinte: string;
  try {
    empreinte = await empreinteSha1(motDePasse);
  } catch (cause) {
    return { etat: 'indisponible', raison: message(cause) };
  }

  const prefixe = empreinte.slice(0, PREFIXE_LONGUEUR);
  const suffixe = empreinte.slice(PREFIXE_LONGUEUR);

  let corps: string;
  try {
    const reponse = await recuperer(`${RACINE}${prefixe}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(DELAI_MS),
    });
    if (!reponse.ok) {
      return { etat: 'indisponible', raison: `HTTP_${reponse.status}` };
    }
    corps = await reponse.text();
  } catch (cause) {
    return { etat: 'indisponible', raison: message(cause) };
  }

  const occurrences = compterOccurrences(corps, suffixe);
  return occurrences > 0 ? { etat: 'compromis', occurrences } : { etat: 'sain' };
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.name : 'INCONNU';
}
