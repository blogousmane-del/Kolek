import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';

import { DELAI_REQUETE_MS } from '../delai-requete';
import { consigner, envoyer } from './envoyer';
import { mettreAJour, retirerAcceptee, retirerEnRefus } from './file';
import { DELAIS_MS, MARGE_SURSIS_MS, TENTATIVES_MAX, delaiApres, type Operation } from './modele';
import { lireOperations, lireRefus, type BaseLocale } from './stockage-local';

/**
 * Une passe : vider la file, dans l'ordre, jusqu'à ce qu'on ne puisse plus.
 *
 * Spec §6. Ce que la passe garantit :
 *
 * 1. **Rien ne part sans session, ni sous une autre identité** (§4.5), et aucun
 *    refus n'est écrit sans relire la session : un refus reçu sous une autre
 *    identité est le sien, pas celui de l'opération. Sans session, supabase-js
 *    envoie la clé anonyme et PostgREST répond 401 : c'est `session`, jamais un
 *    refus.
 * 2. **L'ordre est strict entre opérations en attente.** Un échec passager
 *    arrête la passe ; une réponse inconnue aussi, jusqu'à la 5ᵉ tentative.
 * 3. **Un parent refusé emporte ses enfants**, qui ne partent jamais seuls — même
 *    quand la copie des refus s'efface avec la session : ils sont marqués dans la
 *    transaction qui retire le parent. Un enfant en sursis reste annulable.
 * 4. **Un refus connu ne bloque pas la file** (précision 5 du plan) : sa
 *    consignation est réessayée à part, sans fin, et rien n'est retiré tant
 *    qu'elle n'a pas réussi.
 * 5. **Une horloge corrigée en arrière ne bloque rien** : une échéance plus
 *    lointaine que toute attente légitime est ramenée à maintenant.
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
  /**
   * Appelé à chaque opération sortie de la file, pendant la passe et non à sa
   * fin : c’est ce qui fait décroître « Envoi en cours · N restantes ». Une
   * passe de vingt mises tient plusieurs minutes sur un réseau de marché, et
   * un compte figé ne distingue pas « ça avance » de « ça a calé ».
   */
  surProgres?: () => void;
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
 * La plus longue attente qu'une opération puisse légitimement demander : le
 * dernier écart entre deux essais (10 min) et la marge du sursis. Le sursis
 * lui-même (6 s) est bien en deçà. Au-delà, l'échéance a été écrite par une
 * horloge en avance, corrigée depuis : l'attendre bloquerait toute la file
 * aussi longtemps que l'erreur, sans alerte.
 */
const ATTENTE_PLAUSIBLE_MS = DELAIS_MS[DELAIS_MS.length - 1]! + MARGE_SURSIS_MS;

/**
 * Sous ce reste de validité, la passe renouvelle la session avant d'envoyer.
 * Sinon supabase-js la renouvellerait lui-même au milieu d'un envoi, en lisant
 * le jeton avant `fetch`, sans aucun délai : un réseau muet à ce moment-là
 * tiendrait la passe et le verrou. Cinq minutes couvrent une passe ordinaire.
 */
export const MARGE_SESSION_MS = 5 * 60_000;

/**
 * La réponse de l'authentification, ou `null` passé le délai des requêtes. La
 * requête n'est pas coupée — couper un renouvellement déjà tourné côté serveur
 * fermerait toutes les sessions du collecteur — on cesse seulement de
 * l'attendre. Décision de l'exploitant, 2026-09-14.
 */
async function sansAttendrePlusQueLeDelai<T>(reponse: Promise<T>): Promise<T | null> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const echeance = new Promise<null>((resoudre) => {
    minuteur = setTimeout(() => resoudre(null), DELAI_REQUETE_MS);
  });
  try {
    return await Promise.race([reponse, echeance]);
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * La session, sans conclure trop vite, et sans l'attendre sans fin.
 *
 * Hors ligne, un jeton expiré rend `session: null` **avec** une erreur
 * `AuthRetryableFetchError` : la session existe encore, c'est le réseau qui
 * manque. Seul un renouvellement refusé pour une autre raison la déclare finie.
 * Une session qui ne répond pas dans le délai vaut un échec passager : rien ne
 * part.
 */
export async function verifierSession(
  client: SupabaseClient,
  collecteurId: string,
): Promise<EtatSession> {
  const lue = await sansAttendrePlusQueLeDelai(client.auth.getSession());
  if (!lue) return 'passager';
  const { data, error } = lue;
  if (data.session) {
    if (data.session.user.id !== collecteurId) return 'autre_compte';
    const expiration = data.session.expires_at;
    // Sans échéance lisible, supabase-js reste seul juge du renouvellement.
    if (typeof expiration === 'number' && expiration * 1000 - Date.now() < MARGE_SESSION_MS) {
      const renouvelee = await renouvelerSession(client, collecteurId);
      // Un renouvellement anticipé refusé — trop de demandes, jeton déjà tourné
      // par un autre onglet — ne finit pas une session encore valide : on
      // revient plus tard. Une session vraiment révoquée est retirée par
      // supabase-js, et la passe suivante la trouve finie.
      return renouvelee === 'finie' && expiration * 1000 > Date.now() ? 'passager' : renouvelee;
    }
    return 'ok';
  }
  if (error && isAuthRetryableFetchError(error)) return 'passager';
  return renouvelerSession(client, collecteurId);
}

export async function renouvelerSession(
  client: SupabaseClient,
  collecteurId: string,
): Promise<EtatSession> {
  const lu = await sansAttendrePlusQueLeDelai(client.auth.refreshSession());
  if (!lu) return 'passager';
  const { data, error } = lu;
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
  /**
   * Une opération a quitté la file, ou changé d’état : le compte bouge, et les
   * écrans doivent le relire. Un seul endroit pour les deux gestes — sinon un
   * sixième incrément arriverait un jour sans son annonce.
   */
  function avancer(de = 1): void {
    traitees += de;
    deps.surProgres?.();
  }
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

    // 0. Une échéance impossible — plus loin que toute attente légitime — est
    //    ramenée à maintenant sur le disque, avant tout envoi : `annuler` compare
    //    la même échéance, et doit voir l'opération comme partie.
    const limite = t + ATTENTE_PLAUSIBLE_MS;
    const tropLoin = (iso: string | null) => iso !== null && Date.parse(iso) > limite;
    const impossible = operations.find((o) => tropLoin(o.envoyableApres) || tropLoin(o.prochainEssai));
    if (impossible) {
      const maintenantIso = new Date(t).toISOString();
      await mettreAJour(deps.base, {
        ...impossible,
        envoyableApres: tropLoin(impossible.envoyableApres) ? maintenantIso : impossible.envoyableApres,
        prochainEssai: tropLoin(impossible.prochainEssai) ? maintenantIso : impossible.prochainEssai,
      });
      continue;
    }

    // 1. Les refus déjà connus partent au serveur — jamais pendant un sursis :
    //    un enfant marqué « parent refusé » peut encore être annulé.
    const aConsigner = operations.find(
      (o) => o.etat === 'refusee_a_consigner' && estDue(o, t) && t >= envoyableA(o),
    );
    if (aConsigner) {
      const issue = await consignerOp(deps.client, aConsigner);
      if (issue.issue === 'acceptee') {
        // Le parent, et ses enfants marqués « parent refusé » avec lui.
        avancer(1 + (await retirerEnRefus(deps.base, aConsigner, maintenant())));
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
      // La session d'abord : un refus reçu sous une autre identité est le sien,
      // pas celui de l'opération (§4.5). On s'arrête sans rien écrire.
      const encore = await verifierSession(deps.client, deps.collecteurId);
      if (encore !== 'ok') return bilan(DE_SESSION[encore]);
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
      // Il ne reste que des refus à consigner plus tard : chacun attend son
      // prochain essai, ou la fin de son sursis.
      const prochains = operations.map((o) =>
        Math.max(o.prochainEssai ? Date.parse(o.prochainEssai) : Number.NEGATIVE_INFINITY, envoyableA(o)),
      );
      return bilan('attente', Math.min(...prochains));
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
      avancer();
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
        avancer();
        continue;
      case 'refusee': {
        // Même garde qu'à la consignation (§4.5).
        const encore = await verifierSession(deps.client, deps.collecteurId);
        if (encore !== 'ok') return bilan(DE_SESSION[encore]);
        await mettreAJour(deps.base, {
          ...op,
          etat: 'refusee_a_consigner',
          motif: issue.motif,
          tentatives: 0,
          prochainEssai: null,
        });
        avancer();
        continue;
      }
      case 'passager':
        return bilan('hors_ligne');
      case 'session': {
        const arret = await apresSession(op);
        if (arret) return arret;
        continue;
      }
      case 'inconnue': {
        // Même garde qu'à la consignation (§4.5).
        const encore = await verifierSession(deps.client, deps.collecteurId);
        if (encore !== 'ok') return bilan(DE_SESSION[encore]);
        const tentatives = op.tentatives + 1;
        if (tentatives >= TENTATIVES_MAX) {
          await mettreAJour(deps.base, {
            ...op,
            tentatives,
            etat: 'refusee_a_consigner',
            motif: 'INCONNU',
            prochainEssai: null,
          });
          avancer();
          continue;
        }
        const prochain = maintenant() + delaiApres(tentatives);
        await mettreAJour(deps.base, { ...op, tentatives, prochainEssai: new Date(prochain).toISOString() });
        return bilan('attente', prochain);
      }
    }
  }
}
