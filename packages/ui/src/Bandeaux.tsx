import { useEffect, useState } from 'react';

import { Icone } from './Icone';

/**
 * Le message change selon ce qu'on sait réellement. Annoncer « 2 mises en
 * attente » quand aucune file n'existe encore serait un mensonge d'interface,
 * et un collecteur qui apprend que l'écran ment cesse de le croire quand il dit
 * vrai.
 */
export function BandeauHorsLigne({
  enAttente,
  className = '',
}: {
  enAttente?: number;
  className?: string;
}) {
  const message =
    enAttente === undefined
      ? 'Hors ligne · les encaissements seront synchronisés dès connexion'
      : `Hors ligne · ${enAttente} ${enAttente > 1 ? 'mises' : 'mise'} en attente de synchro`;

  return (
    <div className={`flex items-center gap-2 bg-info-tint rounded-md px-3 py-2 ${className}`}>
      <Icone nom="wifi-off" taille={14} className="text-info" />
      <p className="text-xs font-body font-medium text-info">{message}</p>
    </div>
  );
}

/**
 * `navigator.onLine` ne prouve pas qu'Internet répond — il dit seulement que
 * l'interface réseau est levée. C'est suffisant pour ce bandeau : il informe,
 * il ne décide de rien. La détection qui compte, celle qui bascule la collecte
 * en file locale, arrive en J2b et ne s'appuiera pas là-dessus.
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
