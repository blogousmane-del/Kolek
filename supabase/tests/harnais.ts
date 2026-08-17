import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error('Clés locales absentes. Lancer : npm run db:env');
}

const sansSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Client à clé de service : contourne RLS. Réservé aux tests et aux Edge Functions. */
export const admin: SupabaseClient = createClient(url, serviceKey, sansSession);

/**
 * Client non authentifié — le rôle `anon`. Celui que porte n'importe qui
 * connaissant l'URL du projet et la clé anonyme, laquelle voyage dans le bundle
 * de l'application. L'audit du distant du 2026-08-17 a montré que la plateforme
 * lui accorde d'office l'écriture sur toute table du schéma ; il faut donc le
 * tester, pas le supposer inoffensif.
 */
export const anonyme: SupabaseClient = createClient(url, anonKey, sansSession);

const MOT_DE_PASSE = 'kolek-test-2026';
const creesDansCeFichier: string[] = [];

export interface CollecteurTest {
  id: string;
  email: string;
  /** Client authentifié comme ce collecteur, avec la clé anonyme — RLS s'applique. */
  client: SupabaseClient;
}

/** Crée un utilisateur Auth ; le trigger on_auth_user_created crée la ligne collecteurs. */
export async function creerCollecteur(nom: string, telephone: string): Promise<CollecteurTest> {
  const email = `test-${crypto.randomUUID()}@kolek.test`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: MOT_DE_PASSE,
    email_confirm: true,
    user_metadata: { nom, telephone },
  });
  if (error) throw error;

  const id = data.user!.id;
  creesDansCeFichier.push(id);

  const client = createClient(url!, anonKey!, sansSession);
  const { error: erreurConnexion } = await client.auth.signInWithPassword({
    email,
    password: MOT_DE_PASSE,
  });
  if (erreurConnexion) throw erreurConnexion;

  return { id, email, client };
}

/**
 * Nettoyage au mieux : supprime les utilisateurs de test qui n'ont rien encaissé.
 *
 * Un collecteur ayant des mises ne peut pas être supprimé — les clés étrangères
 * de `mises` sont en `restrict` pour ne pas déclencher le trigger d'immuabilité.
 * C'est l'invariant du journal d'audit, pas un défaut. Le nettoyage complet se
 * fait par `npm run db:reset`, en tête de la commande de vérification J1.
 */
export async function nettoyer(): Promise<void> {
  for (const id of creesDansCeFichier.splice(0)) {
    await admin.auth.admin.deleteUser(id); // refus attendu si le collecteur a encaissé
  }
}
