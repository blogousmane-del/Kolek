import { supabase } from './supabase';

/**
 * Les données de l'écran Réglages.
 *
 * Trois sources, et il faut savoir laquelle dit quoi :
 *
 * 1. **L'Edge Function `admin-reglages`** — l'état de la base : qui est
 *    administrateur, ce que pèsent les tables, quelles tables sont journalisées.
 *    Passe par le portillon `est_admin()`.
 * 2. **`/auth/v1/settings`** — le seul point d'entrée public de GoTrue. Il
 *    publie les fournisseurs d'authentification et la fermeture des inscriptions.
 *    C'est une **mesure**, pas une déclaration : l'écran montre ce que le serveur
 *    répond, pas ce que le dépôt espère.
 * 3. **Les variables de construction** — l'URL du projet et la clé anonyme,
 *    déjà présentes dans le paquet JavaScript servi.
 *
 * ## Ce qui n'est pas ici, et pourquoi
 *
 * La longueur minimale de mot de passe et le filtre des fuites connues ne sont
 * **pas publiés** par `/auth/v1/settings`, et c'est le bon comportement : un
 * serveur qui annoncerait son seuil renseignerait un attaquant. L'écran le dit
 * plutôt que d'afficher une valeur lue dans le dépôt, qui ne gouverne pas le
 * distant — l'écart entre les deux a déjà coûté un constat d'audit le
 * 2026-08-20.
 */

export interface Administrateur {
  user_id: string;
  nom: string;
  telephone: string | null;
  ajoute_le: string;
}

export interface EtatPlateforme {
  genereLe: string;
  appelant: string | null;
  administrateurs: Administrateur[];
  volumes: Record<string, number>;
  journal: { derniere_ecriture: string | null; tables: string[] };
  postgres: string;
}

const MESSAGES: Record<string, string> = {
  ACCES_RESERVE: "Ce compte n'est pas un compte d'administration GTCS.",
  VERIFICATION_IMPOSSIBLE: "Impossible de vérifier les droits d'accès.",
  AGREGATION_IMPOSSIBLE: 'La base n’a pas pu produire l’état de la plateforme.',
  CONFIGURATION: 'Le serveur est mal configuré.',
  JETON_ABSENT: 'Session expirée. Reconnecte-toi.',
};

export async function chargerEtatPlateforme(): Promise<EtatPlateforme> {
  const { data, error } = await supabase.functions.invoke('admin-reglages', { method: 'GET' });

  if (error) {
    let code: string | undefined;
    try {
      const contexte = (error as { context?: Response }).context;
      if (contexte && typeof contexte.json === 'function') {
        code = ((await contexte.json()) as { erreur?: string }).erreur;
      }
    } catch {
      // Corps illisible : le message générique reste juste.
    }
    throw new Error(code ? (MESSAGES[code] ?? code) : error.message);
  }

  return data as EtatPlateforme;
}

/* ------------------------ Authentification, mesurée ---------------------- */

export interface EtatAuth {
  inscriptionOuverte: boolean;
  confirmationAutomatique: boolean;
  comptesAnonymes: boolean;
  /** Les fournisseurs réellement actifs, par leur nom GoTrue. */
  fournisseurs: string[];
  passkeys: boolean;
  saml: boolean;
}

/**
 * Interroge le point d'entrée public de GoTrue.
 *
 * Sans jeton, et c'est normal : ces réglages sont publics par nature — un client
 * doit savoir quels boutons de connexion afficher avant que quiconque soit
 * connecté. Les afficher ici ne divulgue donc rien ; cela évite surtout de
 * recopier dans l'écran une valeur que seul le distant décide.
 */
export async function mesurerAuth(): Promise<EtatAuth> {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const cle = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const reponse = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: cle } });
  if (!reponse.ok) throw new Error(`GoTrue répond ${reponse.status}`);

  const corps = (await reponse.json()) as {
    external?: Record<string, boolean>;
    disable_signup?: boolean;
    mailer_autoconfirm?: boolean;
    saml_enabled?: boolean;
    passkeys_enabled?: boolean;
  };

  const externes = corps.external ?? {};

  return {
    // `disable_signup` dit l'inverse de ce que l'écran montre : on retourne la
    // valeur ici plutôt que dans le JSX, pour que la négation ne se promène pas.
    inscriptionOuverte: corps.disable_signup !== true,
    confirmationAutomatique: corps.mailer_autoconfirm === true,
    comptesAnonymes: externes.anonymous_users === true,
    fournisseurs: Object.entries(externes)
      .filter(([nom, actif]) => actif === true && nom !== 'anonymous_users')
      .map(([nom]) => nom)
      .sort(),
    passkeys: corps.passkeys_enabled === true,
    saml: corps.saml_enabled === true,
  };
}

/* --------------------------- Mon mot de passe ---------------------------- */

/**
 * Change le mot de passe du compte connecté.
 *
 * Contrairement à `auth.admin.createUser`, **`updateUser` applique bien la
 * politique de mot de passe** — longueur minimale et filtre des fuites connues
 * (supabase/auth#1959 ne porte que sur la création). C'est donc le seul endroit
 * du produit où le réglage activé le 2026-08-20 est appliqué par GoTrue lui-même,
 * sans que Kolek ait à le refaire.
 */
export async function changerMotDePasse(
  nouveau: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.auth.updateUser({ password: nouveau });

  if (!error) return { ok: true };

  const message = error.message ?? '';

  // GoTrue rend ses refus en anglais. Les deux qui comptent sont nommés ; le
  // reste passe tel quel plutôt que d'être noyé dans un message générique, parce
  // qu'un refus de changement de mot de passe qu'on ne comprend pas conduit à
  // réessayer la même chose.
  if (/pwned|leaked|compromised|data breach/i.test(message)) {
    return {
      ok: false,
      message:
        'Ce mot de passe figure dans des fuites de données publiques. Le serveur le refuse — choisis-en un autre.',
    };
  }
  if (/at least|too short|length/i.test(message)) {
    return { ok: false, message: 'Ce mot de passe est trop court pour la politique du serveur.' };
  }
  if (/same.*password|different from the old/i.test(message)) {
    return { ok: false, message: 'C’est déjà ton mot de passe actuel.' };
  }

  return { ok: false, message };
}

/* ------------------------- Environnement du client ----------------------- */

export interface Environnement {
  url: string;
  cleAnon: string;
  /** Référence du projet, extraite de l'URL — `https://<ref>.supabase.co`. */
  projet: string;
  /** Les Edge Functions du produit, avec ce que chacune garde. */
  fonctions: Array<{ nom: string; methode: string; role: string }>;
}

export function lireEnvironnement(): Environnement {
  const url = (import.meta.env.VITE_SUPABASE_URL as string) ?? '';
  const cleAnon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ?? '';

  return {
    url,
    cleAnon,
    projet: /https:\/\/([^.]+)\./.exec(url)?.[1] ?? 'inconnu',
    fonctions: [
      { nom: 'admin-vue-globale', methode: 'GET', role: 'Chiffres de toute la plateforme' },
      { nom: 'admin-creer-collecteur', methode: 'POST', role: 'Créer un compte collecteur' },
      { nom: 'admin-modifier-collecteur', methode: 'POST', role: 'Corriger une fiche, suspendre un abonnement' },
      { nom: 'admin-supprimer-collecteur', methode: 'POST', role: 'Retirer un compte sans historique d’argent' },
      { nom: 'admin-reglages', methode: 'GET', role: 'État de la plateforme — cet écran' },
      { nom: 'collecteur-cloturer-carte', methode: 'POST', role: 'Clôturer une carte et restituer le solde' },
    ],
  };
}

/** Masque une clé pour l'affichage : début, fin, et rien entre les deux. */
export function masquer(cle: string): string {
  if (cle.length <= 16) return '•'.repeat(cle.length);
  return `${cle.slice(0, 8)}${'•'.repeat(12)}${cle.slice(-6)}`;
}
