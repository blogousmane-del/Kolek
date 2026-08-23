import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Le cache de navigation du collecteur.
 *
 * ## Le défaut qu'il corrige
 *
 * Chaque écran secondaire montait avec `useState(null)` et lançait sa requête
 * dans un `useEffect`. Aller de l'accueil au bilan, puis revenir, c'était donc
 * deux allers-retours réseau et deux passages par « Lecture… » — pour des
 * chiffres qui n'avaient pas bougé entre-temps. Sur le réseau d'un marché
 * d'Abidjan, chacun coûte une à trois secondes pendant lesquelles l'écran est
 * vide. Naviguer dans l'application donnait l'impression de la recharger.
 *
 * ## Ce qu'il fait
 *
 * Il garde la dernière réponse de chaque lecture, en mémoire seulement, et la
 * rend **immédiatement** au remontage. La requête part quand même, en fond ; si
 * elle rapporte autre chose, l'écran se met à jour sans être passé par le vide.
 * L'écran est donc peuplé au premier rendu, et juste au second.
 *
 * ## Ce qu'il ne fait pas, et pourquoi
 *
 * **Il ne survit pas au rechargement.** Une `Map` en mémoire, pas
 * `localStorage`. Ces lectures portent les noms et les soldes des clients :
 * les écrire sur le disque du téléphone les laisserait lisibles après la
 * déconnexion, à qui a l'appareil en main. Le gain — un affichage instantané au
 * démarrage à froid — ne vaut pas ce prix.
 *
 * **Il ne sert jamais une valeur d'avant une écriture.** Chaque lecture est
 * rangée avec la révision courante ; un encaissement incrémente la révision et
 * périme d'un coup tout ce qui a été rangé avant. Un solde d'avant l'opération
 * affiché même une demi-seconde après, c'est un collecteur qui encaisse deux
 * fois. Le vide est préférable au faux.
 *
 * **Il est vidé à la déconnexion.** Deux collecteurs se relaient sur le même
 * téléphone ; le second ne doit pas voir les clients du premier.
 */

/** Au-delà, la valeur gardée est encore affichée mais n'est plus considérée
    comme sûre : la requête de fond part systématiquement. En deçà, un
    aller-retour entre deux écrans ne déclenche aucun réseau. */
export const PEREMPTION_MS = 45_000;

interface Entree {
  valeur: unknown;
  ecritLe: number;
  revision: number;
}

const memoire = new Map<string, Entree>();

export interface Trouvaille<T> {
  valeur: T;
  /** `false` quand la valeur a dépassé `PEREMPTION_MS` : on l'affiche, mais on
      relit derrière. */
  frais: boolean;
}

export function ecrireCache(
  cle: string,
  valeur: unknown,
  revision = 0,
  maintenant: number = Date.now(),
): void {
  memoire.set(cle, { valeur, ecritLe: maintenant, revision });
}

/**
 * Rend la valeur gardée, ou `null`.
 *
 * `null` dans deux cas qu'il ne faut pas confondre : rien n'a jamais été rangé
 * sous cette clé, ou ce qui y a été rangé date d'avant une écriture. Le second
 * est le cas important — voir l'en-tête du module.
 *
 * **Cette fonction ne modifie rien**, et c'est une correction de l'audit du
 * 2026-08-23. Elle supprimait l'entrée périmée au passage ; comme les écrans
 * l'appellent depuis l'initialiseur de `useState`, cette suppression avait lieu
 * *pendant le rendu*. React n'en donne aucune garantie — il peut abandonner un
 * rendu, ou le rejouer, et sous StrictMode il le rejoue systématiquement.
 *
 * La suppression n'était de toute façon pas nécessaire : une entrée périmée est
 * écrasée par la lecture qui suit, et les révisions ne font que croître, donc
 * la « résurrection » contre laquelle elle protégeait ne peut pas se produire.
 * `oublier()` reste là pour les cas où l'on veut vraiment jeter.
 */
export function lireCache<T>(
  cle: string,
  revision = 0,
  maintenant: number = Date.now(),
): Trouvaille<T> | null {
  const entree = memoire.get(cle);
  if (!entree) return null;
  if (entree.revision !== revision) return null;
  return { valeur: entree.valeur as T, frais: maintenant - entree.ecritLe < PEREMPTION_MS };
}

/** Jette une entrée. Le seul appelant est `rafraichir`, hors rendu. */
export function oublier(cle: string): void {
  memoire.delete(cle);
}

/** Vide tout. Appelé à la déconnexion. */
export function viderCache(): void {
  memoire.clear();
}

/** Nombre d'entrées gardées — pour les tests, et pour rien d'autre. */
export function tailleCache(): number {
  return memoire.size;
}

export interface Lecture<T> {
  /** `null` tant qu'aucune valeur n'est disponible — ni gardée, ni reçue. */
  donnees: T | null;
  erreur: string | null;
  /** Une requête est en vol. Vrai aussi pendant une revalidation de fond, où
      `donnees` est déjà peuplé : l'écran peut en tirer un discret indicateur
      sans remplacer son contenu. */
  enCours: boolean;
  /** Force une relecture réseau, en ignorant ce qui est gardé. */
  rafraichir: () => void;
}

/**
 * Lit une donnée d'écran, avec cache.
 *
 * `chargeur` est délibérément **hors** des dépendances de l'effet : les écrans
 * le déclarent en ligne, donc son identité change à chaque rendu et l'inclure
 * relancerait la requête en boucle. Il est gardé dans une référence, ce qui
 * garantit que l'appel utilise toujours la dernière version sans la surveiller.
 */
export function useDonnees<T>(
  cle: string,
  chargeur: () => Promise<T>,
  options: { revision?: number; messageErreur: string },
): Lecture<T> {
  const { revision = 0, messageErreur } = options;

  const chargeurRef = useRef(chargeur);
  chargeurRef.current = chargeur;

  const [donnees, setDonnees] = useState<T | null>(() => lireCache<T>(cle, revision)?.valeur ?? null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [tour, setTour] = useState(0);

  useEffect(() => {
    let vivant = true;
    const garde = lireCache<T>(cle, revision);

    // Peupler avant toute attente : c'est le geste qui supprime le passage par
    // l'écran vide.
    if (garde) {
      setDonnees(garde.valeur);
      setErreur(null);
      // `rafraichir` a déjà retiré l'entrée avant d'incrémenter `tour` : si
      // une valeur est là et qu'elle est fraîche, c'est bien qu'aucune
      // relecture n'a été demandée.
      if (garde.frais) return;
    } else {
      setDonnees(null);
    }

    setEnCours(true);
    void (async () => {
      try {
        // Le constructeur de requête de supabase-js est un « thenable », pas une
        // Promise : sans ce `try`, une coupure laisse l'écran figé.
        const valeur = await chargeurRef.current();
        if (!vivant) return;
        ecrireCache(cle, valeur, revision);
        setDonnees(valeur);
        setErreur(null);
      } catch {
        if (!vivant) return;
        // Une revalidation de fond qui échoue ne doit pas effacer ce qui est
        // déjà à l'écran : le collecteur a perdu le réseau, pas ses chiffres.
        if (!garde) setErreur(messageErreur);
      } finally {
        if (vivant) setEnCours(false);
      }
    })();

    return () => {
      vivant = false;
    };
    // `chargeur` et `messageErreur` sont volontairement absents — voir la
    // docstring. `tour` est ce qui rend `rafraichir` effectif.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, revision, tour]);

  const rafraichir = useCallback(() => {
    oublier(cle);
    setTour((t) => t + 1);
  }, [cle]);

  return { donnees, erreur, enCours, rafraichir };
}
