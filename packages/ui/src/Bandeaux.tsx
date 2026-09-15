import { useEffect, useState } from 'react';

import { Icone } from './Icone';

/** Ce que la file du téléphone contient, par nature d'opération. */
export interface CompteFile {
  mises: number;
  clients: number;
  cartes: number;
  caisses: number;
}

const NOMS: ReadonlyArray<readonly [keyof CompteFile, string, string]> = [
  ['mises', 'mise', 'mises'],
  ['clients', 'client', 'clients'],
  ['cartes', 'carte', 'cartes'],
  ['caisses', 'déclaration de caisse', 'déclarations de caisse'],
];

/**
 * La phrase du bandeau, ou `null` quand il n'a rien à dire (spec J2b §8.1).
 *
 * Elle ne dit que ce qu'on sait. Jusqu'à J2b, ce composant affichait « Hors
 * ligne · les encaissements seront synchronisés dès connexion » alors
 * qu'aucune file n'existait : un mensonge d'interface, et un collecteur qui
 * apprend que l'écran ment cesse de le croire quand il dit vrai. D'où : sans
 * compte lisible, « Hors ligne » et rien de plus.
 */
export function messageFile(enLigne: boolean, compte: CompteFile | null): string | null {
  const total = compte ? compte.mises + compte.clients + compte.cartes + compte.caisses : 0;
  if (enLigne) return total === 0 ? null : `Envoi en cours · ${total} restante${total > 1 ? 's' : ''}`;
  if (!compte) return 'Hors ligne';
  if (total === 0) return 'Hors ligne · rien en attente d’envoi';

  const parts = NOMS.filter(([cle]) => compte[cle] > 0).map(
    ([cle, un, plusieurs]) => `${compte[cle]} ${compte[cle] > 1 ? plusieurs : un}`,
  );
  const liste =
    parts.length === 1
      ? parts[0]!
      : `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]!}`;
  return `Hors ligne · ${liste} en attente d’envoi`;
}

/**
 * Le bandeau de la file. Il se tait seul quand il n'a rien à dire : les écrans
 * le rendent toujours, sans condition.
 */
export function BandeauHorsLigne({
  enLigne,
  compte,
  className = '',
}: {
  enLigne: boolean;
  /** `null` tant que la file n'a pas pu être lue. */
  compte: CompteFile | null;
  className?: string;
}) {
  const message = messageFile(enLigne, compte);
  if (message === null) return null;

  return (
    <div className={`flex items-center gap-2 bg-info-tint rounded-md px-3 py-2 ${className}`}>
      <Icone nom={enLigne ? 'refresh-cw' : 'wifi-off'} taille={14} className="text-info" />
      <p className="text-xs font-body font-medium text-info">{message}</p>
    </div>
  );
}

/**
 * `navigator.onLine` ne prouve pas qu'Internet répond — il dit seulement que
 * l'interface réseau est levée. C'est suffisant pour ce bandeau : il informe,
 * il ne décide de rien. Ce qui décide d'envoyer, c'est le résultat d'un envoi
 * (`apps/collecteur/src/hors-ligne/planificateur.ts`).
 */
export function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const monter = () => setEnLigne(true);
    const couper = () => setEnLigne(false);
    window.addEventListener('online', monter);
    window.addEventListener('offline', couper);
    return () => {
      window.removeEventListener('online', monter);
      window.removeEventListener('offline', couper);
    };
  }, []);

  return enLigne;
}
