import { useEffect, useState } from 'react';

import { Icone } from './Icone';

/** Bandeau d'offre, en tête du Dashboard. */
export function BandeauOffre({
  etiquette = 'Essai gratuit',
  detail = '30 jours restants',
}: {
  etiquette?: string;
  detail?: string;
}) {
  return (
    <div className="bg-secondary flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-2 flex-shrink-0">
      <div className="flex items-center gap-2">
        <span className="px-3 py-0.5 rounded-pill bg-primary text-primary-foreground text-xs font-body font-semibold">
          {etiquette}
        </span>
        <span className="text-sm font-body text-secondary-foreground">{detail}</span>
      </div>
      {/* Aucune page d'offres n'existe encore dans l'application. Désactivé avec
          sa raison plutôt que laissé cliquable : un bouton qui ne répond pas
          apprend à l'utilisateur que l'interface ne réagit pas, et il cesse
          d'essayer ailleurs. */}
      <button
        type="button"
        disabled
        title="Page des offres à venir"
        className="text-sm font-body font-medium text-primary opacity-50 cursor-default"
      >
        Voir les offres →
      </button>
    </div>
  );
}

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
