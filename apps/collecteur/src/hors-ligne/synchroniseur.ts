import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';

import { consigner, envoyer } from './envoyer';
import { mettreAJour, retirerAcceptee, retirerEnRefus } from './file';
import { MARGE_SURSIS_MS, TENTATIVES_MAX, delaiApres, type Operation } from './modele';
import { lireOperations, lireRefus, type BaseLocale } from './stockage-local';

/**
 * Une passe : vider la file, dans l'ordre, jusqu'à ce qu'on ne puisse plus.
 *
 * Spec §6. Ce que la passe garantit :
 *
 * 1. **Rien ne part sans session, ni sous une autre identité** (§4.5). Sans
 *    session, supabase-js envoie la clé anonyme, RLS refuse en `42501`, et une
 *    opération valide serait consignée à tort.
 * 2. **L'ordre est strict entre opérations en attente.** Un échec passager
 *    arrête la passe ; une réponse inconnue aussi, jusqu'à la 5ᵉ tentative.
 * 3. **Un parent refusé emporte ses enfants**, qui ne partent jamais seuls.
 * 4. **Un refus connu ne bloque pas la file** (précision 5 du plan) : sa
 *    consignation est réessayée à part, sans fin, et rien n'est retiré tant
 *    qu'elle n'a pas réussi.
 *
 * La passe ne programme rien : elle dit quand revenir (`reveil`) et le
 * planificateur s'en charge.
 */

export interface Dependances {
  client: SupabaseClient;
  base: BaseLocale;
  collecteurId: string;
  maintenant?: () => number;
  /** Injectables pour les épreuves ; sinon les vrais. */
  envoyer?: typeof envoyer;
  consigner?: typeof consigner;
}

export interface BilanPasse {
  etat: 'vide' | 'attente' | 'hors_ligne' | 'session_finie' | 'autre_compte';
  /** Pour `attente` : l'heure à laquelle la file aura de nouveau du travail. */
  reveil: number | null;
  /** Opérations sorties de la file, ou passées en refus, pendant la passe. */
  traitees: number;
}

export type EtatSession = 'ok' | 'passager' | 'finie' | 'autre_compte';

const DE_SESSION: Record<Exclude<EtatSession, 'ok'>, BilanPasse['etat']> = {
  passager: 'hors_ligne',
  finie: 'session_finie',
  autre_compte: 'autre_compte',
};

/**
 * La session, sans conclure trop vite.
 *
 * Hors ligne, un jeton expiré rend `session: null` **avec** une erreur
 * `AuthRetryableFetchError` : la session existe encore, c'est le réseau qui
 * manque. Seul un renouvellement refusé pour une autre raison la déclare finie.
 */
export async function verifierSession(
  client: SupabaseClient,
  collecteurId: string,
): Promise<EtatSession> {
  const { data, error } = await client.auth.getSession();
  if (data.session) return data.session.user.id === collecteurId ? 'ok' : 'autre_compte';
  if (error && isAuthRetryableFetchError(error)) return 'passager';
  return renouvelerSession(client, collecteurId);
}

export async function renouvelerSession(
  client: SupabaseClient,
  collecteurId: string,
): Promise<EtatSession> {
  const { data, error } = await client.auth.refreshSession();
  if (error) return isAuthRetryableFetchError(error) ? 'passager' : 'finie';
  if (!data.session) return 'finie';
  return data.session.user.id === collecteurId ? 'ok' : 'autre_compte';
}

function estDue(op: Operation, t: number): boolean {
  return op.prochainEssai === null || Date.parse(op.prochainEssai) <= t;
}

/** L'heure où l'opération peut partir. Un sursis gagne sa marge ; un envoi immédiat, non. */
function envoyableA(op: Operation): number {
  const apres = Date.parse(op.envoyableApres);
  return apres > Date.parse(op.faiteLe) ? apres + MARGE_SURSIS_MS : apres;
}

export async function passe(deps: Dependances): Promise<BilanPasse> {
  const maintenant = deps.maintenant ?? Date.now;
  const envoyerOp = deps.envoyer ?? envoyer;
  const consignerOp = deps.consigner ?? consigner;
  let traitees = 0;
  const bilan = (etat: BilanPasse['etat'], reveil: number | null = null): BilanPasse => ({
    etat,
    reveil,
    traitees,
  });

  if ((await lireOperations(deps.base)).length === 0) return bilan('vide');

  const session = await verifierSession(deps.client, deps.collecteurId);
  if (session !== 'ok') return bilan(DE_SESSION[session]);

  /** Un renouvellement par opération et par passe ; au-delà, on revient plus tard. */
  const renouvelees = new Set<string>();
  async function apresSession(op: Operation): Promise<BilanPasse | null> {
    if (renouvelees.has(op.id)) return bilan('attente', maintenant() + delaiApres(1));
    renouvelees.add(op.id);
    const etat = await renouvelerSession(deps.client, deps.collecteurId);
    return etat === 'ok' ? null : bilan(DE_SESSION[etat]);
  }

  for (;;) {
    const operations = await lireOperations(deps.base);
    if (operations.length === 0) return bilan('vide');
    const t = maintenant();

    // 1. Les refus déjà connus partent au serveur.
    const aConsigner = operations.find((o) => o.etat === 'refusee_a_consigner' && estDue(o, t));
    if (aConsigner) {
      const issue = await consignerOp(deps.client, aConsigner);
      if (issue.issue === 'acceptee') {
        await retirerEnRefus(deps.base, aConsigner, maintenant());
        traitees += 1;
        continue;
      }
      if (issue.issue === 'passager') return bilan('hors_ligne');
      if (issue.issue === 'session') {
        const arret = await apresSession(aConsigner);
        if (arret) return arret;
        continue;
      }
      // La consignation elle-même est refusée : on ne retire rien, la charge
      // reste sur le téléphone, et on réessaie plus tard sans bloquer la file.
      const tentatives = aConsigner.tentatives + 1;
      await mettreAJour(deps.base, {
        ...aConsigner,
        tentatives,
        prochainEssai: new Date(maintenant() + delaiApres(tentatives)).toISOString(),
      });
      continue;
    }

    // 2. La première opération en attente.
    const courante = operations.find((o) => o.etat === 'en_attente');
    if (!courante) {
      const prochains = operations
        .map((o) => (o.prochainEssai ? Date.parse(o.prochainEssai) : Number.POSITIVE_INFINITY))
        .filter(Number.isFinite);
      return bilan('attente', prochains.length > 0 ? Math.min(...prochains) : null);
    }
    if (t < envoyableA(courante)) return bilan('attente', envoyableA(courante));
    if (!estDue(courante, t)) return bilan('attente', Date.parse(courante.prochainEssai!));

    // 3. Un parent refusé : l'enfant est consigné avec lui, jamais envoyé.
    const refuses = new Set([
      ...(await lireRefus(deps.base)).map((r) => r.id),
      ...operations.filter((o) => o.etat === 'refusee_a_consigner').map((o) => o.id),
    ]);
    if (courante.dependDe.some((id) => refuses.has(id))) {
      await mettreAJour(deps.base, {
        ...courante,
        etat: 'refusee_a_consigner',
        motif: 'PARENT_REFUSE',
        tentatives: 0,
        prochainEssai: null,
      });
      traitees += 1;
      continue;
    }

    // 4. L'envoi.
    let op: Operation = courante;
    const issue = await envoyerOp(deps.client, op, async (etapes) => {
      if (op.type !== 'client_carte') return;
      op = { ...op, etapes };
      await mettreAJour(deps.base, op);
    });

    switch (issue.issue) {
      case 'acceptee':
        await retirerAcceptee(deps.base, op);
        traitees += 1;
        continue;
      case 'refusee':
        await mettreAJour(deps.base, {
          ...op,
          etat: 'refusee_a_consigner',
          motif: issue.motif,
          tentatives: 0,
          prochainEssai: null,
        });
        traitees += 1;
        continue;
      case 'passager':
        return bilan('hors_ligne');
      case 'session': {
        const arret = await apresSession(op);
        if (arret) return arret;
        continue;
      }
      case 'inconnue': {
        const tentatives = op.tentatives + 1;
        if (tentatives >= TENTATIVES_MAX) {
          await mettreAJour(deps.base, {
            ...op,
            tentatives,
            etat: 'refusee_a_consigner',
            motif: 'INCONNU',
            prochainEssai: null,
          });
          traitees += 1;
          continue;
        }
        const prochain = maintenant() + delaiApres(tentatives);
        await mettreAJour(deps.base, { ...op, tentatives, prochainEssai: new Date(prochain).toISOString() });
        return bilan('attente', prochain);
      }
    }
  }
}
