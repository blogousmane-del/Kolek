import { supabase } from './supabase';

/**
 * Les deux gestes du mot de passe : en redemander un, en poser un.
 *
 * ## Deux chemins, deux natures
 *
 * `demanderReinitialisation` passe par **notre** Edge Function, pas par
 * `supabase.auth.resetPasswordForEmail`. Deux raisons, et la seconde suffirait :
 * le service de courriel intégré plafonne à deux messages par heure
 * (`email_sent = 2` dans `config.toml`), et sa réponse distingue une adresse
 * connue d'une adresse inconnue. La nôtre ne le fait pas — voir l'en-tête de
 * `supabase/functions/mot-de-passe-oublie/index.ts`.
 *
 * `poserMotDePasse` passe en revanche par `supabase.auth.updateUser`, donc
 * directement par GoTrue. C'est délibéré : contrairement à
 * `admin.createUser`, `updateUser` **applique les règles de mot de passe** —
 * longueur minimale et réglage « Prevent use of leaked passwords ». C'est écrit
 * dans l'en-tête de `supabase/functions/_shared/hibp.ts`. Passer par une
 * fonction à nous pour refaire ce contrôle ajouterait un chemin sans rien
 * ajouter, et la CSP de cette application (`connect-src 'self'` plus Supabase)
 * interdit de toute façon d'appeler Have I Been Pwned depuis le navigateur.
 */

export type Issue = { ok: true } | { ok: false; message: string };

const REFUS_ENVOI: Record<string, string> = {
  EMAIL_MANQUANT: 'Saisis ton adresse.',
  EMAIL_INVALIDE: 'Cette adresse n’a pas la bonne forme.',
  EMAIL_TROP_LONG: 'Cette adresse est trop longue.',
  CORPS_ILLISIBLE: 'La demande n’a pas pu être lue. Réessaie.',
  CONFIGURATION: 'Le service de courriel n’est pas disponible. Contacte GTCS.',
};

/** Extrait le code d'erreur du corps, quand `functions.invoke` a signalé un
    non-2xx. Même dispositif que `apps/admin/src/demandes.ts` — le corps n'est
    pas toujours du JSON, d'où le `try`. */
async function codeDe(erreur: unknown): Promise<string | undefined> {
  try {
    const contexte = (erreur as { context?: Response }).context;
    if (contexte && typeof contexte.json === 'function') {
      return ((await contexte.json()) as { erreur?: string }).erreur;
    }
  } catch {
    // Corps illisible : l'appelant retombe sur son message générique.
  }
  return undefined;
}

export async function demanderReinitialisation(email: string): Promise<Issue> {
  const { error } = await supabase.functions.invoke('mot-de-passe-oublie', {
    method: 'POST',
    body: { email },
  });

  if (!error) return { ok: true };

  const code = await codeDe(error);
  return {
    ok: false,
    message: (code && REFUS_ENVOI[code]) ?? 'Envoi impossible. Vérifie ton réseau et réessaie.',
  };
}

/**
 * Ce qu’un collecteur lit quand GoTrue refuse.
 *
 * Pure, donc éprouvable — `poserMotDePasse` parle au réseau, pas elle.
 *
 * ## L’ordre des branches, et pourquoi il ne se change pas à la légère
 *
 * La réauthentification vient en premier parce qu’elle demande un geste que
 * les autres messages ne demandent pas : se reconnecter. La longueur passe
 * avant la faiblesse — un mot de passe trop court porte lui aussi le mot
 * « weak » selon les versions, et l’ordre inverse annoncerait « il figure dans
 * une fuite » à quelqu’un qui a simplement tapé six caractères.
 *
 * ## Le refus de réauthentification, mesuré
 *
 * Avec `secure_password_change` activé, GoTrue refuse tout changement de mot
 * de passe passé **24 heures** de session — mesuré le 2026-09-10 sur la pile
 * locale : 23 h passe, 25 h rend `400 Password update requires
 * reauthentication`.
 *
 * Ce chemin-ci arrive par un lien de réinitialisation, donc sur une session
 * neuve, et ne devrait pas le rencontrer. « Ne devrait pas » n’est pas « ne
 * peut pas », et le message générique disait « Réessaie » — exactement le
 * mauvais conseil pour ce refus-là, puisque réessayer échouera pareil.
 */
export function refusDePose(message: string): string {
  if (/reauthentication|reauthenticate/i.test(message)) {
    return 'Reconnecte-toi, puis recommence : cette session est trop ancienne pour changer le mot de passe.';
  }
  if (/at least|too short|should be at least/i.test(message)) {
    return 'Choisis un mot de passe d’au moins 10 caractères.';
  }
  if (/weak|pwned|leaked|breach/i.test(message)) {
    return 'Ce mot de passe figure dans une fuite connue. Choisis-en un autre.';
  }
  if (/session|not authenticated|jwt|expired/i.test(message)) {
    return 'Ce lien a expiré. Redemande-en un depuis « Mot de passe oublié ».';
  }
  return 'Impossible d’enregistrer ce mot de passe. Réessaie.';
}

export async function poserMotDePasse(motDePasse: string): Promise<Issue> {
  const { error } = await supabase.auth.updateUser({ password: motDePasse });
  if (!error) return { ok: true };

  return { ok: false, message: refusDePose(error.message ?? '') };
}

/**
 * Y a-t-il une session ouverte ?
 *
 * `getSession` attend l'initialisation du client, et c'est cette initialisation
 * qui lit le jeton accroché à l'adresse après un clic sur un lien d'invitation
 * ou de réinitialisation. Un `getSession` appelé une fois, après le montage,
 * suffit donc — inutile de guetter `onAuthStateChange`.
 */
export async function sessionOuverte(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return data.session !== null;
}
