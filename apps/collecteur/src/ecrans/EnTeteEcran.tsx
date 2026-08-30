import { Icone } from '@kolek/ui';
import type { ReactNode } from 'react';

/**
 * Les trois largeurs de contenu du produit, et rien d'autre.
 *
 * Un seul endroit connaît les chiffres ; les écrans déclarent leur nature.
 * C'est ce qui évite qu'un `lg:max-w-[840px]` apparaisse un jour dans un écran
 * et un `lg:max-w-4xl` dans le suivant.
 *
 * `saisie` reste à 640 px délibérément : un formulaire étiré sur 1 400 px est
 * plus difficile à remplir, pas plus facile — l'œil perd la ligne entre
 * l'étiquette et le champ.
 */
const LARGEURS = {
  saisie: 'lg:max-w-liste',
  liste: 'lg:max-w-page',
  large: 'lg:max-w-large',
} as const;

export type LargeurEcran = keyof typeof LARGEURS;

/**
 * L'en-tête des écrans secondaires du collecteur.
 *
 * Le retour est un vrai bouton, pas une flèche décorative : l'application est
 * une page unique, donc le geste « précédent » du téléphone sort de
 * l'application au lieu de revenir à l'accueil. Sans ce bouton, un collecteur
 * entré dans « Bilan » n'aurait aucun moyen d'en sortir sans passer par la barre
 * du bas — qui ne montre pas cet écran.
 *
 * À partir de `lg`, le bandeau sombre s'arrondit et se détache des bords :
 * collé aux angles d'un écran de 1 440 px, il se lit comme une barre de
 * navigateur plutôt que comme un en-tête. L'accueil le faisait déjà seul ; la
 * règle remonte ici pour valoir sur les dix écrans.
 */
export function EnTeteEcran({
  titre,
  sousTitre,
  onRetour,
  enfants,
  largeur = 'liste',
}: {
  titre: string;
  sousTitre?: string;
  onRetour: () => void;
  enfants?: ReactNode;
  largeur?: LargeurEcran;
}) {
  return (
    <div
      className={`anim-entree bg-[image:var(--degrade-hero)] px-marge pt-entete pb-6 shadow-md lg:mx-auto lg:w-full lg:rounded-3xl lg:pt-6 ${LARGEURS[largeur]}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onRetour}
          aria-label="Revenir à l’accueil"
          className="anim-pression w-10 h-10 rounded-pill bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-md flex items-center justify-center cursor-pointer shrink-0 transition-colors shadow-xs"
        >
          <Icone nom="arrow-left" className="text-white" taille={18} />
        </button>
        <div className="min-w-0">
          <p className="text-white font-headings font-bold text-xl tracking-tight truncate">{titre}</p>
          {sousTitre && <p className="text-white/70 text-xs font-body truncate mt-0.5">{sousTitre}</p>}
        </div>
      </div>
      {enfants}
    </div>
  );
}

/**
 * Le corps défilant des écrans secondaires, avec la marge commune.
 *
 * `largeur` doit valoir la même chose que sur l'en-tête du même écran, sans
 * quoi le bandeau et le contenu ne s'alignent pas.
 */
export function CorpsEcran({
  enfants,
  largeur = 'liste',
}: {
  enfants: ReactNode;
  largeur?: LargeurEcran;
}) {
  return (
    <div className={`flex-1 px-4 py-5 space-y-4 lg:mx-auto lg:w-full ${LARGEURS[largeur]}`}>
      {enfants}
    </div>
  );
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
    <div className="text-center py-12 px-6 bg-surface rounded-2xl border border-hairline/70 shadow-xs max-w-md mx-auto my-4">
      <div className="w-14 h-14 rounded-2xl bg-secondary mx-auto mb-3.5 flex items-center justify-center text-primary shadow-xs">
        <Icone nom={icone} taille={24} />
      </div>
      <p className="font-headings font-bold text-lg text-ink mb-1">{titre}</p>
      <p className="font-body text-sm text-muted-foreground max-w-xs mx-auto">{detail}</p>
    </div>
  );
}
