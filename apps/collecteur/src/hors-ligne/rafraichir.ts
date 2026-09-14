import type { SupabaseClient } from '@supabase/supabase-js';

import { chargerTout } from '../pagination';
import type { CarteLocale, ChargeUtileRefus, MiseLocale, ProfilLocal, Tournee } from './modele';
import { CLE_INSTANTANE, CLE_PROFIL, dans, type BaseLocale } from './stockage-local';

/**
 * Recharger l'instantané, le profil et les refus depuis le serveur (§5.2).
 *
 * **Tout ou rien.** Une lecture en panne, une liste que le serveur dit plus
 * longue que ce qu'il a rendu, une fiche absente : rien n'est écrit, et
 * l'instantané d'hier reste. Une tournée d'hier est vraie à hier ; une tournée
 * amputée ment aujourd'hui.
 *
 * **La file n'est jamais touchée.** L'écran lit l'instantané avec la file
 * réappliquée : une opération pas encore arrivée ne disparaît donc pas quand un
 * instantané plus récent arrive.
 *
 * Toutes les listes épuisent leurs pages (`pagination.ts`) : `max_rows = 1000`
 * tronque sans rien dire.
 */

/**
 * Taille des lots de `carte_id` dans un filtre `in`. Cinquante identifiants font
 * moins de 2 Ko d'adresse ; bien en deçà des limites d'un proxy.
 */
export const TAILLE_LOT_IN = 50;

const COLONNES_MISES = 'id, carte_id, montant, encaisse_le, est_commission';

interface LigneClient {
  id: string;
  nom: string;
  telephone: string | null;
  marche: string | null;
  activite: string | null;
  avis_actifs: boolean;
}
interface LigneCarte {
  id: string;
  client_id: string;
  mise: number;
  statut: 'active' | 'cloturee';
  mises_encaissees: number;
  ouverte_le: string;
  cloturee_le: string | null;
}
interface LigneMise {
  id: string;
  carte_id: string;
  montant: number;
  encaisse_le: string;
  est_commission: boolean;
}
interface LigneRetrait {
  id: string;
  carte_id: string;
  montant_restitue: number;
  effectue_le: string;
}
interface LigneCaisse {
  id: string;
  date: string;
  cash_attendu: number;
  cash_declare: number;
  ecart: number;
}
interface LigneProfil {
  nom: string;
  telephone: string;
  zone: string | null;
  palier: string;
  abonnement_statut: string;
  abonnement_echeance: string | null;
  titulaire_id: string | null;
}
interface LigneRefus {
  id: string;
  motif: string;
  charge_utile: unknown;
  cree_le: string;
}

export async function rafraichir(
  client: SupabaseClient,
  base: BaseLocale,
  collecteurId: string,
  maintenant: number = Date.now(),
): Promise<'fait' | 'impossible'> {
  const instant = new Date(maintenant).toISOString();
  // Le jour du serveur est découpé en UTC (`cash_attendu_du_jour`) ; l'accueil
  // compte depuis minuit local. On prend le plus tôt des deux.
  const date = instant.slice(0, 10);
  const minuitLocal = new Date(maintenant);
  minuitLocal.setHours(0, 0, 0, 0);
  const depuis = new Date(Math.min(Date.parse(`${date}T00:00:00.000Z`), minuitLocal.getTime())).toISOString();

  try {
    const [rClients, rCartes, rMisesDuJour, rRetraits, rCaisses, rProfil, rRefus] = await Promise.all([
      chargerTout<LigneClient>((d, f) =>
        client
          .from('clients')
          .select('id, nom, telephone, marche, activite, avis_actifs', { count: 'exact' })
          .order('id')
          .range(d, f),
      ),
      chargerTout<LigneCarte>((d, f) =>
        client
          .from('cartes')
          .select('id, client_id, mise, statut, mises_encaissees, ouverte_le, cloturee_le')
          .order('id')
          .range(d, f),
      ),
      chargerTout<LigneMise>((d, f) =>
        client.from('mises').select(COLONNES_MISES).gte('encaisse_le', depuis).order('id').range(d, f),
      ),
      chargerTout<LigneRetrait>((d, f) =>
        client
          .from('retraits')
          .select('id, carte_id, montant_restitue, effectue_le')
          .gte('effectue_le', depuis)
          .order('id')
          .range(d, f),
      ),
      client.from('caisses_jour').select('id, date, cash_attendu, cash_declare, ecart').eq('date', date),
      client
        .from('collecteurs')
        .select('nom, telephone, zone, palier, abonnement_statut, abonnement_echeance, titulaire_id')
        .eq('id', collecteurId)
        .maybeSingle(),
      chargerTout<LigneRefus>((d, f) =>
        client
          .from('synchro_rejets')
          .select('id, motif, charge_utile, cree_le')
          .eq('traite', false)
          .order('id')
          .range(d, f),
      ),
    ]);

    if ([rClients, rCartes, rMisesDuJour, rRetraits, rCaisses, rProfil, rRefus].some((r) => r.error)) {
      return 'impossible';
    }
    if (typeof rClients.total === 'number' && rClients.total > rClients.data.length) return 'impossible';
    const fiche = rProfil.data as LigneProfil | null;
    if (!fiche) return 'impossible';

    const cartes: CarteLocale[] = rCartes.data.map((k) => ({
      id: k.id,
      clientId: k.client_id,
      mise: k.mise,
      statut: k.statut,
      misesEncaissees: k.mises_encaissees,
      ouverteLe: k.ouverte_le,
      clotureeLe: k.cloturee_le,
    }));

    const actives = cartes.filter((k) => k.statut === 'active').map((k) => k.id);
    const lots: string[][] = [];
    for (let i = 0; i < actives.length; i += TAILLE_LOT_IN) lots.push(actives.slice(i, i + TAILLE_LOT_IN));
    const rLots = await Promise.all(
      lots.map((lot) =>
        chargerTout<LigneMise>((d, f) =>
          client.from('mises').select(COLONNES_MISES).in('carte_id', lot).order('id').range(d, f),
        ),
      ),
    );
    if (rLots.some((r) => r.error)) return 'impossible';

    const mises = new Map<string, MiseLocale>();
    for (const m of [...rMisesDuJour.data, ...rLots.flatMap((r) => r.data)]) {
      mises.set(m.id, {
        id: m.id,
        carteId: m.carte_id,
        montant: m.montant,
        encaisseLe: m.encaisse_le,
        estCommission: m.est_commission,
      });
    }

    const tournee: Tournee = {
      clients: rClients.data.map((c) => ({
        id: c.id,
        nom: c.nom,
        telephone: c.telephone,
        marche: c.marche,
        activite: c.activite,
        avisActifs: c.avis_actifs,
      })),
      cartes,
      mises: [...mises.values()],
      retraits: rRetraits.data.map((r) => ({
        id: r.id,
        carteId: r.carte_id,
        montantRestitue: r.montant_restitue,
        effectueLe: r.effectue_le,
      })),
      caisses: ((rCaisses.data ?? []) as LigneCaisse[]).map((c) => ({
        id: c.id,
        date: c.date,
        cashAttendu: c.cash_attendu,
        cashDeclare: c.cash_declare,
        ecart: c.ecart,
      })),
      lueLe: instant,
    };

    const profil: ProfilLocal = {
      nom: fiche.nom,
      telephone: fiche.telephone,
      zone: fiche.zone,
      palier: fiche.palier,
      abonnementStatut: fiche.abonnement_statut,
      abonnementEcheance: fiche.abonnement_echeance,
      titulaireId: fiche.titulaire_id,
      lueLe: instant,
    };

    const tx = base.transaction(['tournee', 'profil', 'refus'], 'readwrite');
    await dans(tx, async () => {
      await tx.objectStore('tournee').put(tournee, CLE_INSTANTANE);
      await tx.objectStore('profil').put(profil, CLE_PROFIL);
      const refus = tx.objectStore('refus');
      await refus.clear();
      for (const r of rRefus.data) {
        await refus.put({
          id: r.id,
          motif: r.motif,
          chargeUtile: r.charge_utile as ChargeUtileRefus,
          creeLe: r.cree_le,
        });
      }
    });
    return 'fait';
  } catch {
    // Le constructeur de requête de supabase-js est un « thenable » : une
    // coupure franche le fait rejeter. Rien n'a été écrit.
    return 'impossible';
  }
}
