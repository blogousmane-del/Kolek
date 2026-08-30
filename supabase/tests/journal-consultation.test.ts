import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Lire le journal laisse une trace, et cette trace ne noie pas le journal.
 *
 * ## Pourquoi une écriture explicite
 *
 * Aucun déclencheur ne peut voir une lecture : un `SELECT` n'en déclenche
 * aucun. La consultation du journal se journalise donc à la main, depuis la
 * fonction qui la sert.
 *
 * Elle le mérite. `audit_log` n'a jamais été lisible par l'API depuis le socle
 * du 2026-08-15 ; l'ouvrir au super admin est un relâchement assumé, et la
 * seule action qui révèle tout le reste serait autrement la seule à ne rien
 * laisser.
 *
 * ## Pourquoi les consultations sont masquées par défaut
 *
 * Chaque lecture ajoute une ligne que la lecture suivante affiche. En une
 * semaine, le journal ne parlerait plus que de lui-même — et ce qu'il protège
 * serait enterré sous la preuve qu'on l'a regardé. La liste les exclut donc
 * sauf demande explicite : on garde la trace sans noyer son objet.
 *
 * ## Pourquoi aucun total
 *
 * Compter les lignes du journal à chaque page coûterait un parcours complet
 * d'une table qui grandit sans fin, pour un chiffre que personne ne lit. La
 * fonction rend `a_suivre` — elle lit une ligne de plus que demandé et dit s'il
 * y en avait une.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
let liseur: CollecteurTest;

function exigerSucces(etiquette: string, erreur: { message: string } | null): void {
  if (erreur) throw new Error(`Préparation « ${etiquette} » : ${erreur.message}`);
}

beforeAll(async () => {
  liseur = await creerCollecteur(`Liseur ${MARQUE}`, `+225093${Date.now() % 1000000}`);
});

afterAll(nettoyer);

interface LigneJournal {
  table_cible: string;
  action: string;
  acteur_id: string | null;
  donnees: Record<string, unknown> | null;
}

interface Page {
  lignes: LigneJournal[];
  a_suivre: boolean;
}

/** Client à clé de service déclarant agir pour le compte de `liseur` — le même
    en-tête que pose l'Edge Function du super admin. */
function adminPourLiseur(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-kolek-acteur': liseur.id } },
  });
}

async function consulter(inclureConsultations = false, taille = 50): Promise<Page> {
  const { data, error } = await admin.rpc('super_admin_journal', {
    p_page: 1,
    p_taille: taille,
    p_inclure_consultations: inclureConsultations,
  });
  if (error) throw new Error(error.message);
  return data as Page;
}

describe('la consultation du journal', () => {
  it('écrit sa propre ligne, avec l’acteur déclaré', async () => {
    exigerSucces(
      'consultation',
      (
        await adminPourLiseur().rpc('journaliser_consultation', {
          p_contexte: { marque: MARQUE, page: 1 },
        })
      ).error,
    );

    const { data } = await admin
      .from('audit_log')
      .select('table_cible, action, acteur_id, donnees')
      .eq('table_cible', 'audit_log')
      .eq('action', 'select')
      .order('survenu_le', { ascending: false })
      .limit(5);

    const lignes = (data ?? []) as LigneJournal[];
    const notre = lignes.find((l) => (l.donnees as { marque?: string })?.marque === MARQUE);
    expect(notre).toBeDefined();
    expect(notre!.acteur_id).toBe(liseur.id);
  });

  it('n’apparaît pas dans la liste par défaut', async () => {
    // La règle qui empêche le journal de se remplir de lui-même.
    const page = await consulter();
    expect(page.lignes.every((l) => l.table_cible !== 'audit_log')).toBe(true);
  });

  it('apparaît quand on la demande explicitement', async () => {
    const page = await consulter(true);
    expect(page.lignes.some((l) => l.table_cible === 'audit_log')).toBe(true);
  });

  it('borne la taille de page, quoi qu’on demande', async () => {
    // Une lecture ouverte sur `audit_log` sans plafond serait un export
    // complet du journal en un appel — exactement ce que la fermeture de la
    // table empêchait jusqu'ici.
    const page = await consulter(true, 100000);
    expect(page.lignes.length).toBeLessThanOrEqual(200);
  });

  it('dit s’il reste des lignes derrière la page', async () => {
    const page = await consulter(true, 1);
    expect(page.lignes.length).toBe(1);
    expect(page.a_suivre).toBe(true);
  });
});

describe('la fermeture', () => {
  it('refuse la lecture du journal à un compte authentifié', async () => {
    const { error } = await liseur.client.rpc('super_admin_journal', {
      p_page: 1,
      p_taille: 10,
      p_inclure_consultations: false,
    });
    expect(error).not.toBeNull();
  });

  it('refuse l’écriture d’une consultation à un compte authentifié', async () => {
    const { error } = await liseur.client.rpc('journaliser_consultation', {
      p_contexte: { marque: MARQUE },
    });
    expect(error).not.toBeNull();
  });
});
