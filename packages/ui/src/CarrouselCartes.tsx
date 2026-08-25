import { useRef } from 'react';

import { CarteCollecte } from './CarteCollecte';

export interface CarteItem {
  id: string;
  nomClient: string;
  misePar: string;
  jourCourant: number;
  solde: string;
  cycle: string;
}

interface Props {
  cartes: CarteItem[];
  /** La carte que l'écran considère comme visible. Pilotée par le parent. */
  visibleId: string;
  onVisible: (id: string) => void;
}

/**
 * Les cartes actives d'un client, une par écran, qu'on parcourt du pouce.
 *
 * ## Pourquoi horizontal
 *
 * Empilées, deux cartes actives poussaient hors de l'écran tout ce qui suit —
 * les derniers versements, l'historique, le consentement aux avis. Le client
 * qui tient trois carnets rendait sa propre fiche illisible. En rangée, la
 * fiche garde sa hauteur quel que soit le nombre de cartes.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne porte aucune commande. La rangée d'actions vit **sous** lui, dans
 * l'écran, et reste immobile pendant le défilement — voir `ActionsCarte`. Une
 * barre attachée à chaque carte sortirait du champ avec elle, au moment précis
 * où le doigt la cherche.
 *
 * ## Le défilement et les points
 *
 * Les points ne sont pas décoratifs : ce sont les seules commandes qui disent
 * combien de cartes existent. Sur un carnet unique, ils disparaissent avec le
 * défilement — un carrousel qui ne défile pas ne doit pas prétendre le
 * contraire.
 *
 * Le parent tient la carte visible. Le geste de défilement la **rapporte**
 * (`onVisible`), les points et les flèches la **fixent**. Deux sens, une seule
 * source de vérité, qui est l'écran.
 */
export function CarrouselCartes({ cartes, visibleId, onVisible }: Props) {
  const piste = useRef<HTMLUListElement>(null);
  const index = Math.max(
    0,
    cartes.findIndex((c) => c.id === visibleId),
  );

  /**
   * Amener une carte sous les yeux.
   *
   * `scrollTo` n'est pas implémenté par jsdom — l'appeler sans garde ferait
   * échouer les tests des écrans appelants sur une fonction manquante, pas sur
   * leur propre comportement.
   */
  function amener(rang: number) {
    const element = piste.current;
    if (!element || typeof element.scrollTo !== 'function') return;
    element.scrollTo({ left: element.clientWidth * rang, behavior: 'smooth' });
  }

  function choisir(rang: number) {
    const carte = cartes[rang];
    if (!carte) return;
    onVisible(carte.id);
    amener(rang);
  }

  /**
   * Ce que le doigt vient de mettre en face.
   *
   * `clientWidth` vaut zéro tant que rien n'est mis en page — jsdom ne calcule
   * aucune géométrie. La garde évite une division par zéro qui rendrait `NaN`
   * et ferait remonter une carte inexistante.
   */
  function auDefilement() {
    const element = piste.current;
    if (!element || element.clientWidth === 0) return;
    const rang = Math.round(element.scrollLeft / element.clientWidth);
    const carte = cartes[rang];
    if (carte && carte.id !== visibleId) onVisible(carte.id);
  }

  function auClavier(evenement: React.KeyboardEvent) {
    if (evenement.key === 'ArrowRight' && index < cartes.length - 1) {
      evenement.preventDefault();
      choisir(index + 1);
    }
    if (evenement.key === 'ArrowLeft' && index > 0) {
      evenement.preventDefault();
      choisir(index - 1);
    }
  }

  const seule = cartes.length <= 1;

  return (
    <div>
      <ul
        ref={piste}
        onScroll={auDefilement}
        onKeyDown={auClavier}
        tabIndex={seule ? -1 : 0}
        role="group"
        aria-roledescription="carrousel"
        aria-label={`${cartes.length} carte${cartes.length > 1 ? 's' : ''} en cours`}
        className={`flex gap-3 m-0 p-0 list-none ${
          seule ? '' : 'overflow-x-auto scrollbar-none snap-x snap-mandatory'
        }`}
      >
        {cartes.map((carte, rang) => (
          <li
            key={carte.id}
            aria-label={`Carte ${rang + 1} sur ${cartes.length}`}
            className="snap-center shrink-0 w-full"
          >
            <CarteCollecte
              nomClient={carte.nomClient}
              misePar={carte.misePar}
              jourCourant={carte.jourCourant}
              solde={carte.solde}
              cycle={carte.cycle}
            />
          </li>
        ))}
      </ul>

      {!seule && (
        <div className="flex items-center justify-center gap-2 mt-2">
          {cartes.map((carte, rang) => (
            <button
              key={carte.id}
              type="button"
              aria-label={`Carte ${rang + 1} sur ${cartes.length}`}
              aria-current={rang === index}
              onClick={() => choisir(rang)}
              // La cible tactile fait 44 px ; le point, lui, en fait 8. Le
              // rembourrage transparent porte le doigt, le point porte l'œil.
              className="anim-pression p-4.5 -m-3.5 cursor-pointer"
            >
              <span
                className={`block w-2 h-2 rounded-pill ${
                  rang === index ? 'bg-primary' : 'bg-hairline'
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
