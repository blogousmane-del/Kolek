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

export async function poserMotDePasse(motDePasse: string): Promise<Issue> {
  const { error } = await supabase.auth.updateUser({ password: motDePasse });
  if (!error) return { ok: true };

  const message = error.message ?? '';

  // GoTrue répond en anglais. Les trois refus qu'un collecteur peut réellement
  // rencontrer sont nommés ; le reste passe par un message générique, parce
  // qu'un détail d'erreur GoTrue ne l'aiderait pas.
  //
  // La longueur est testée **avant** la faiblesse : le message d'un mot de
  // passe trop court porte lui aussi le mot « weak » selon les versions, et
  // l'ordre inverse annoncerait « il figure dans une fuite » à quelqu'un qui a
  // simplement tapé six caractères.
  if (/at least|too short|should be at least/i.test(message)) {
    return { ok: false, message: 'Choisis un mot de passe d’au moins 10 caractères.' };
  }
  if (/weak|pwned|leaked|breach/i.test(message)) {
    return {
      ok: false,
      message: 'Ce mot de passe figure dans une fuite connue. Choisis-en un autre.',
    };
  }
  if (/session|not authenticated|jwt|expired/i.test(message)) {
    return {
      ok: false,
      message: 'Ce lien a expiré. Redemande-en un depuis « Mot de passe oublié ».',
    };
  }
  return { ok: false, message: 'Impossible d’enregistrer ce mot de passe. Réessaie.' };
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
