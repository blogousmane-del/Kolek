import { delaiApres } from './modele';
import type { BilanPasse } from './synchroniseur';

/**
 * Quand passer, et une passe à la fois (§5.3).
 *
 * Une demande pendant une passe n'en lance pas une seconde : elle est retenue,
 * et rejouée à la fin. Une demande hors passe annule le délai en cours et part
 * tout de suite — le retour du réseau ne doit pas attendre la fin d'une attente
 * de dix minutes.
 *
 * `navigator.onLine` ne décide de rien : seul le bilan d'une passe fait foi.
 */

/** Au plus un rechargement de tournée toutes les cinq minutes après un envoi (précision 10). */
export const PERIODE_RAFRAICHISSEMENT_MS = 5 * 60_000;

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
  let arrete = false;

  function annulerMinuteur() {
    if (minuteur !== null) clearTimeout(minuteur);
    minuteur = null;
  }

  function programmer(ms: number) {
    annulerMinuteur();
    minuteur = setTimeout(() => {
      minuteur = null;
      void demander();
    }, Math.max(0, ms));
  }

  async function tour(avecRafraichissement: boolean): Promise<void> {
    let bilan: BilanPasse;
    try {
      bilan = await taches.passe();
    } catch {
      bilan = { etat: 'hors_ligne', reveil: null, traitees: 0 };
    }
    echecsPassagers = bilan.etat === 'hors_ligne' ? echecsPassagers + 1 : 0;

    // Recharger n'a de sens que si le serveur vient de répondre.
    const joignable = bilan.etat === 'vide' || bilan.etat === 'attente';
    const perime = Date.now() - dernierRafraichissement >= PERIODE_RAFRAICHISSEMENT_MS;
    const apresEnvoi = bilan.etat === 'vide' && bilan.traitees > 0 && perime;
    let rafraichie = false;
    if (joignable && (avecRafraichissement || apresEnvoi)) {
      rafraichie = (await taches.rafraichir().catch(() => 'impossible' as const)) === 'fait';
      if (rafraichie) dernierRafraichissement = Date.now();
    }

    if (arrete) return;
    surFin(bilan, rafraichie);
    if (bilan.etat === 'attente' && bilan.reveil !== null) programmer(bilan.reveil - Date.now());
    else if (bilan.etat === 'hors_ligne') programmer(delaiApres(echecsPassagers));
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
