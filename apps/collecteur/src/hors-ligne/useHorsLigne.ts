import { useEffect, useState } from 'react';

import type { Operation, RefusLocal, Tournee } from './modele';
import { collecteurCourant, ecouterChangements, etatDuStockage, lectureCourante } from './moteur';
import type { EtatStockage } from './stockage-local';
import { etatFileDepuis, type EtatFile } from './vues';

export interface EtatHorsLigne {
  operations: Operation[];
  refus: RefusLocal[];
  /** `null` tant que rien n'a été lu. */
  tournee: Tournee | null;
  /** `null` tant que la file n'a pas pu être lue : le bandeau dit alors « Hors ligne », sans compte. */
  file: EtatFile | null;
  stockage: EtatStockage;
}

/**
 * La file, les refus et la tournée du collecteur connecté, relus à chaque
 * changement signalé par le moteur — un geste, une passe qui a envoyé, une
 * tournée rechargée.
 *
 * Les lectures se croisent : un geste pendant une relecture en lance une
 * seconde. Seule la dernière partie a le droit d'écrire l'état, sans quoi une
 * lecture lente remontrerait une file d'avant le geste.
 */
export function useHorsLigne(): EtatHorsLigne {
  const [etat, setEtat] = useState<EtatHorsLigne>(() => ({
    operations: [],
    refus: [],
    tournee: null,
    file: null,
    stockage: etatDuStockage(),
  }));

  useEffect(() => {
    let vivant = true;
    let tour = 0;

    const relire = () => {
      if (!collecteurCourant()) return;
      const ce = ++tour;
      lectureCourante().then(
        ({ tournee, operations, refus }) => {
          if (!vivant || ce !== tour) return;
          setEtat({
            operations,
            refus,
            tournee,
            file: etatFileDepuis(operations, refus),
            stockage: etatDuStockage(),
          });
        },
        () => {
          if (!vivant || ce !== tour) return;
          setEtat((avant) => ({ ...avant, stockage: etatDuStockage() }));
        },
      );
    };

    relire();
    const arreter = ecouterChangements(relire);
    return () => {
      vivant = false;
      arreter();
    };
  }, []);

  return etat;
}
