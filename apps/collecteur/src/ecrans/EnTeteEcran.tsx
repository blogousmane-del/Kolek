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
 * ## Il est clair depuis le 2026-09-17, et c'était le défaut central
 *
 * Il portait le même bandeau vert dégradé que l'accueil, avec la même pastille
 * de verre et la même ombre. Comme il sert onze écrans, et que l'accueil, la
 * liste des clients et l'encaissement portaient le même bloc chacun de leur
 * côté, **quatorze écrans s'ouvraient exactement pareil**. Aucun n'avait
 * d'identité propre : « Reçus », « Bilan » et « Mot de passe oublié »
 * commençaient par la même image.
 *
 * Un gabarit estampillé quatorze fois se reconnaît avant qu'on ait lu un mot,
 * et c'est ce qui fait dire d'un produit qu'il a été engendré.
 *
 * Le dégradé reste donc à deux endroits, et deux seulement : l'accueil, qui
 * ouvre la journée, et l'encaissement, qui est le geste qui la paie. Partout
 * ailleurs l'en-tête est une bande claire, posée sur le même fond que la page
 * qu'elle titre.
 *
 * Ce qui disparaît avec le fond sombre, et qu'on ne remplace pas : l'ombre —
 * un filet suffit à séparer deux surfaces de même clarté — le flou
 * d'arrière-plan du bouton de retour, qui coûtait une repeinte à chaque
 * défilement sur le téléphone d'entrée de gamme, et l'arrondi de bureau, qui
 * n'a plus d'objet puisque la bande ne se détache plus du fond.
 */
export function EnTeteEcran({
  titre,
  sousTitre,
  onRetour,
  libelleRetour = 'Revenir à l’accueil',
  enfants,
  largeur = 'liste',
}: {
  titre: string;
  sousTitre?: string;
  onRetour: () => void;
  /**
   * Ce que la flèche annonce au lecteur d'écran.
   *
   * Le libellé était écrit en dur jusqu'au 2026-09-10, et il était juste tant
   * que tous les écrans secondaires remontaient à l'accueil. L'historique
   * client a deux niveaux : la flèche du second revient à la pile de cartes, et
   * annoncer « l'accueil » ferait dire à l'écran le contraire de ce qu'il fait
   * — un utilisateur au lecteur d'écran sortirait de l'écran en croyant y
   * rester, ou l'inverse.
   *
   * Le défaut par défaut : aucun des appelants existants ne change.
   */
  libelleRetour?: string;
  enfants?: ReactNode;
  largeur?: LargeurEcran;
}) {
  return (
    <div
      className={`anim-entree bg-canvas border-b border-hairline px-marge pt-entete pb-4 lg:mx-auto lg:w-full lg:pt-6 ${LARGEURS[largeur]}`}
    >
      <div className={`flex items-center gap-3 ${enfants ? 'mb-4' : ''}`}>
        <button
          type="button"
          onClick={onRetour}
          aria-label={libelleRetour}
          className="anim-pression w-10 h-10 rounded-pill bg-surface border border-hairline flex items-center justify-center cursor-pointer shrink-0"
        >
          <Icone nom="arrow-left" className="text-ink" taille={18} />
        </button>
        <div className="min-w-0">
          <p className="font-headings font-bold text-xl text-ink tracking-tight truncate">{titre}</p>
          {sousTitre && (
            <p className="text-xs font-body text-muted-foreground truncate mt-0.5">{sousTitre}</p>
          )}
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
  // Une liste courte et non `NomIcone` en entier : elle dit lesquelles des
  // vingt-cinq icônes du produit servent d'illustration d'écran vide. En
  // élargir un membre est un geste délibéré — `credit-card` est arrivé le
  // 2026-09-10 avec l'historique client, où le vide porte sur des cartes et où
  // `coins` aurait mis une icône d'argent devant une absence de carnet.
  icone: 'receipt' | 'bell' | 'coins' | 'bar-chart-2' | 'credit-card';
  titre: string;
  detail: string;
}) {
  return (
    <div className="text-center py-12 px-6 bg-surface rounded-lg border border-hairline/70 shadow-xs max-w-md mx-auto my-4">
      <div className="w-14 h-14 rounded-pill bg-secondary mx-auto mb-3.5 flex items-center justify-center text-primary shadow-xs">
        <Icone nom={icone} taille={24} />
      </div>
      <p className="font-headings font-bold text-lg text-ink mb-1">{titre}</p>
      <p className="font-body text-sm text-muted-foreground max-w-xs mx-auto">{detail}</p>
    </div>
  );
}
