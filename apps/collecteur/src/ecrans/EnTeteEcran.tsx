import { Icone } from '@kolek/ui';
import type { ReactNode } from 'react';

/**
 * L'en-tête des écrans secondaires du collecteur.
 *
 * Le retour est un vrai bouton, pas une flèche décorative : l'application est
 * une page unique, donc le geste « précédent » du téléphone sort de
 * l'application au lieu de revenir à l'accueil. Sans ce bouton, un collecteur
 * entré dans « Bilan » n'aurait aucun moyen d'en sortir sans passer par la barre
 * du bas — qui ne montre pas cet écran.
 */
export function EnTeteEcran({
  titre,
  sousTitre,
  onRetour,
  enfants,
}: {
  titre: string;
  sousTitre?: string;
  onRetour: () => void;
  enfants?: ReactNode;
}) {
  return (
    <div className="bg-sidebar px-marge pt-entete pb-6">
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onRetour}
          aria-label="Revenir à l’accueil"
          className="w-9 h-9 rounded-pill bg-white/10 flex items-center justify-center cursor-pointer shrink-0"
        >
          <Icone nom="arrow-left" className="text-white" />
        </button>
        <div className="min-w-0">
          <p className="text-white font-headings font-bold text-xl truncate">{titre}</p>
          {sousTitre && <p className="text-white/60 text-sm font-body truncate">{sousTitre}</p>}
        </div>
      </div>
      {enfants}
    </div>
  );
}

/** Le corps défilant des écrans secondaires, avec la marge commune. */
export function CorpsEcran({ enfants }: { enfants: ReactNode }) {
  return <div className="flex-1 px-4 py-5 space-y-4">{enfants}</div>;
}

/**
 * Ce qu'on affiche quand la base ne rend rien.
 *
 * Un écran vide qui dit pourquoi il est vide vaut mieux qu'un écran vide tout
 * court, et infiniment mieux qu'un chiffre inventé pour meubler.
 */
export function RienAMontrer({ icone, titre, detail }: {
  icone: 'receipt' | 'bell' | 'coins' | 'bar-chart-2';
  titre: string;
  detail: string;
}) {
  return (
    <div className="text-center py-12 px-6">
      <div className="w-14 h-14 rounded-pill bg-muted mx-auto mb-3 flex items-center justify-center">
        <Icone nom={icone} taille={24} className="text-muted-foreground" />
      </div>
      <p className="font-headings font-bold text-lg text-ink mb-1">{titre}</p>
      <p className="font-body text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
