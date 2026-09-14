import { DELAIS_MS, delaiApres } from './modele';
import type { BilanPasse } from './synchroniseur';

/**
 * Quand passer, et une passe à la fois (§5.3).
 *
 * Une demande pendant une passe n'en lance pas une seconde : elle est retenue,
 * et rejouée à la fin. Une demande hors passe annule le délai en cours et part
 * tout de suite — le retour du réseau ne doit pas attendre la fin d'une attente
 * de dix minutes.
 *
 * Une demande de rechargement qui n'aboutit pas reste due : elle est retentée
 * au prochain tour où le serveur répond. Une panne n'est jamais tue : la cause
 * part dans la console, et la reprise continue.
 *
 * `navigator.onLine` ne décide de rien : seul le bilan d'une passe fait foi.
 */

/** Au plus un rechargement de tournée toutes les cinq minutes après un envoi (précision 10). */
export const PERIODE_RAFRAICHISSEMENT_MS = 5 * 60_000;

/**
 * Le plus long réveil qu'une passe puisse légitimement demander : le dernier
 * écart entre deux essais. Au-delà, l'horloge du téléphone est en cause — et
 * `setTimeout` part tout de suite passé 2³¹−1 ms.
 */
const REVEIL_MAX_MS = DELAIS_MS[DELAIS_MS.length - 1]!;

export interface Taches {
  passe: () => Promise<BilanPasse>;
  rafraichir: () => Promise<'fait' | 'impossible'>;
}

export interface Planificateur {
  demander(options?: { rafraichir?: boolean }): Promise<void>;
  arreter(): void;
}

export function creerPlanificateur(
  taches: Taches,
  surFin: (bilan: BilanPasse, rafraichie: boolean) => void = () => {},
): Planificateur {
  let enCours: Promise<void> | null = null;
  let redemande: { rafraichir: boolean } | null = null;
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  let echecsPassagers = 0;
  let dernierRafraichissement = Number.NEGATIVE_INFINITY;
  /** Un rechargement demandé qui n'a pas encore abouti : retenté au prochain tour où le serveur répond. */
  let rechargementDu = false;
  let arrete = false;

  function annulerMinuteur() {
    if (minuteur !== null) clearTimeout(minuteur);
    minuteur = null;
  }

  /** Un réveil illisible attend comme un premier échec, jamais zéro milliseconde. */
  function delaiBorne(ms: number): number {
    return Number.isFinite(ms) ? Math.min(Math.max(0, ms), REVEIL_MAX_MS) : delaiApres(1);
  }

  function programmer(ms: number) {
    annulerMinuteur();
    minuteur = setTimeout(() => {
      minuteur = null;
      void demander();
    }, delaiBorne(ms));
  }

  async function tour(avecRafraichissement: boolean): Promise<void> {
    if (avecRafraichissement) rechargementDu = true;
    let bilan: BilanPasse;
    try {
      bilan = await taches.passe();
    } catch (e) {
      // Reprise comme hors ligne, mais jamais en silence : une panne locale —
      // disque plein, défaut — échouerait sinon sans fin et sans trace.
      console.error(e);
      bilan = { etat: 'hors_ligne', reveil: null, traitees: 0 };
    }
    echecsPassagers = bilan.etat === 'hors_ligne' ? echecsPassagers + 1 : 0;

    // Recharger n'a de sens que si le serveur vient de répondre, et jamais
    // pour un planificateur arrêté pendant la passe.
    const joignable = bilan.etat === 'vide' || bilan.etat === 'attente';
    const perime = Date.now() - dernierRafraichissement >= PERIODE_RAFRAICHISSEMENT_MS;
    const apresEnvoi = bilan.etat === 'vide' && bilan.traitees > 0 && perime;
    let rafraichie = false;
    if (!arrete && joignable && (rechargementDu || apresEnvoi)) {
      rafraichie =
        (await taches.rafraichir().catch((e: unknown) => {
          console.error(e);
          return 'impossible' as const;
        })) === 'fait';
      if (rafraichie) {
        dernierRafraichissement = Date.now();
        rechargementDu = false;
      }
    }

    if (arrete) return;
    // Le réveil d'abord : un écran qui lève en étant prévenu ne doit pas l'annuler.
    if (bilan.etat === 'attente' && bilan.reveil !== null) programmer(bilan.reveil - Date.now());
    else if (bilan.etat === 'hors_ligne') programmer(delaiApres(echecsPassagers));
    try {
      surFin(bilan, rafraichie);
    } catch (e) {
      console.error(e);
    }
  }

  function demander(options: { rafraichir?: boolean } = {}): Promise<void> {
    if (arrete) return Promise.resolve();
    const avec = Boolean(options.rafraichir);
    if (enCours) {
      redemande = { rafraichir: (redemande?.rafraichir ?? false) || avec };
      return enCours;
    }
    annulerMinuteur();
    enCours = tour(avec).finally(() => {
      enCours = null;
      const suite = redemande;
      redemande = null;
      if (suite && !arrete) void demander(suite);
    });
    return enCours;
  }

  return {
    demander,
    arreter() {
      arrete = true;
      annulerMinuteur();
    },
  };
}
