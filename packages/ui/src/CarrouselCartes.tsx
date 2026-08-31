import { useEffect, useRef, useState } from 'react';

import { CarteCollecte } from './CarteCollecte';
import { deplacer, ordreSuivant, rangCible } from './reordonner';

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
 * Les cartes actives d'un client, une par écran, qu'on parcourt du pouce — et
 * qu'on peut réordonner à la main comme une main de cartes à jouer.
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
 *
 * ## Le déplacement, ajouté le 2026-08-31
 *
 * ### L'appui long, et pourquoi il n'y avait pas le choix
 *
 * Cette piste est un défileur horizontal. Le glissement latéral est **déjà** le
 * geste de défilement : le brancher aussi sur le déplacement rendrait l'un des
 * deux impossible. L'appui long tranche — 350 ms sans bouger, et la carte se
 * lève. Un doigt qui part avant l'échéance défile, comme avant.
 *
 * Le seuil de 10 px est ce qui rend les deux gestes compatibles. Sans lui, un
 * défilement lent — celui d'un pouce qui cherche — lèverait une carte au lieu
 * de faire glisser la rangée.
 *
 * ### L'ordre ne se conserve pas
 *
 * Décision de GTCS : confort d'affichage. Le collecteur étale ses cartes pour
 * retrouver celle qu'il cherche, l'ordre meurt avec l'écran. Rien en base,
 * aucune colonne, aucune migration. L'ordre vit donc ici, et `ordreSuivant` le
 * recoud quand une carte est clôturée ou ouverte.
 *
 * ### Le clavier fait la même chose, autrement
 *
 * `Shift` + flèche déplace la carte courante ; la flèche seule continue de
 * naviguer. Sans cela, la fonction n'existerait que pour ceux qui peuvent tenir
 * un doigt immobile 350 ms sur une cible mouvante — et le collecteur travaille
 * debout, souvent d'une seule main.
 *
 * ### Sans dépendance
 *
 * Une ébauche à base de `@dnd-kit` traînait dans la copie de travail, non
 * versionnée et branchée nulle part. `packages/ui` ne porte aujourd'hui que
 * `react` et `lucide-react` ; quatre paquets de plus dans une application
 * hors-ligne installée sur un téléphone d'entrée de gamme se paient à chaque
 * ouverture, pour un calcul qui tient en trois fonctions pures.
 */
export function CarrouselCartes({ cartes, visibleId, onVisible }: Props) {
  const piste = useRef<HTMLUListElement>(null);

  /**
   * L'ordre choisi à la main, par identifiants.
   *
   * Par identifiants et non par rangs : un rang ne survit pas à une carte
   * clôturée, un identifiant si.
   */
  const [ordre, setOrdre] = useState<string[]>(() => cartes.map((c) => c.id));

  useEffect(() => {
    setOrdre((actuel) => {
      const suivant = ordreSuivant(
        actuel,
        cartes.map((c) => c.id),
      );
      // Comparer avant de poser : `ordreSuivant` rend toujours un tableau neuf,
      // et le reposer tel quel relancerait cet effet sans fin.
      const identique =
        suivant.length === actuel.length && suivant.every((id, i) => id === actuel[i]);
      return identique ? actuel : suivant;
    });
  }, [cartes]);

  const parId = new Map(cartes.map((c) => [c.id, c]));
  const rangees = ordre.map((id) => parId.get(id)).filter((c): c is CarteItem => c !== undefined);

  const index = Math.max(
    0,
    rangees.findIndex((c) => c.id === visibleId),
  );

  /** La carte levée, s'il y en a une. */
  const [saisi, setSaisi] = useState<string | null>(null);
  const geste = useRef<{ id: string; depart: number; x0: number; minuteur: number } | null>(null);
  const [annonce, setAnnonce] = useState('');

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
    const carte = rangees[rang];
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
   *
   * Muette pendant qu'une carte est levée : la rangée bouge alors sous le
   * doigt, et lire sa position ferait sauter la carte visible à chaque
   * réarrangement.
   */
  function auDefilement() {
    if (saisi) return;
    const element = piste.current;
    if (!element || element.clientWidth === 0) return;
    const rang = Math.round(element.scrollLeft / element.clientWidth);
    const carte = rangees[rang];
    if (carte && carte.id !== visibleId) onVisible(carte.id);
  }

  /** Déplace la carte courante d'un cran, et le dit à voix haute. */
  function deplacerDe(pas: number) {
    const vers = index + pas;
    if (vers < 0 || vers >= rangees.length) return;

    setOrdre((actuel) => deplacer(actuel, index, vers));
    setAnnonce(`Carte déplacée en position ${vers + 1} sur ${rangees.length}.`);
    amener(vers);
  }

  function auClavier(evenement: React.KeyboardEvent) {
    const droite = evenement.key === 'ArrowRight';
    const gauche = evenement.key === 'ArrowLeft';
    if (!droite && !gauche) return;

    evenement.preventDefault();

    // `Shift` déplace, la flèche seule navigue. Deux gestes voisins pour deux
    // intentions voisines, sur la même touche.
    if (evenement.shiftKey) {
      deplacerDe(droite ? 1 : -1);
      return;
    }

    if (droite && index < rangees.length - 1) choisir(index + 1);
    if (gauche && index > 0) choisir(index - 1);
  }

  /** Le pas d'une carte : sa largeur, plus l'écartement de la rangée. */
  function pasDeLaPiste(): number {
    const element = piste.current;
    if (!element) return 0;
    const premiere = element.firstElementChild;
    if (!premiere) return 0;
    const largeur = premiere.getBoundingClientRect().width;
    return largeur > 0 ? largeur + 12 : 0;
  }

  function relacher() {
    if (geste.current) window.clearTimeout(geste.current.minuteur);
    geste.current = null;
    setSaisi(null);
  }

  function auContact(evenement: React.PointerEvent, id: string, rang: number) {
    // Un seul doigt. Un second pendant un déplacement rendrait le calcul
    // d'écart insensé, et c'est un geste involontaire fréquent à une main.
    if (geste.current) return;

    const x0 = evenement.clientX;
    const cible = evenement.currentTarget;

    const minuteur = window.setTimeout(() => {
      setSaisi(id);
      setAnnonce(`Carte ${rang + 1} saisie. Faites-la glisser, ou relâchez pour la reposer.`);
      // La capture garde le geste même si le doigt sort de la carte — et il en
      // sort forcément, puisque la carte se déplace sous lui.
      if (typeof cible.setPointerCapture === 'function') {
        try {
          cible.setPointerCapture(evenement.pointerId);
        } catch {
          // Un pointeur déjà relâché n'est pas capturable. Sans effet.
        }
      }
    }, 350);

    geste.current = { id, depart: rang, x0, minuteur };
  }

  function auMouvement(evenement: React.PointerEvent) {
    const encours = geste.current;
    if (!encours) return;

    const ecart = evenement.clientX - encours.x0;

    // Avant la levée, un mouvement franc veut dire « je défile ». C'est ce
    // seuil qui rend les deux gestes compatibles sur la même piste.
    if (!saisi) {
      if (Math.abs(ecart) > 10) relacher();
      return;
    }

    const depuis = ordre.indexOf(encours.id);
    const vers = rangCible(encours.depart, ecart, pasDeLaPiste(), ordre.length);
    if (depuis === -1 || vers === depuis) return;

    setOrdre((actuel) => deplacer(actuel, depuis, vers));
  }

  const seule = rangees.length <= 1;

  return (
    <div>
      <ul
        ref={piste}
        onScroll={auDefilement}
        onKeyDown={auClavier}
        onPointerMove={auMouvement}
        onPointerUp={relacher}
        onPointerCancel={relacher}
        tabIndex={seule ? -1 : 0}
        role="group"
        aria-roledescription="carrousel"
        aria-label={`${rangees.length} carte${rangees.length > 1 ? 's' : ''} en cours`}
        className={`flex gap-3 m-0 p-0 list-none ${
          seule ? '' : 'overflow-x-auto scrollbar-none snap-x snap-mandatory'
        }`}
      >
        {rangees.map((carte, rang) => {
          const leve = saisi === carte.id;
          return (
            <li
              key={carte.id}
              aria-label={`Carte ${rang + 1} sur ${rangees.length}`}
              onPointerDown={(e) => !seule && auContact(e, carte.id, rang)}
              // `touch-none` seulement une fois la carte levée : posé d'office,
              // il rendrait la piste impossible à défiler au doigt.
              className={`snap-center shrink-0 w-full transition-transform ${
                leve ? 'touch-none scale-105 z-10 shadow-lg cursor-grabbing' : ''
              }`}
            >
              <CarteCollecte
                nomClient={carte.nomClient}
                misePar={carte.misePar}
                jourCourant={carte.jourCourant}
                solde={carte.solde}
                cycle={carte.cycle}
              />
            </li>
          );
        })}
      </ul>

      {/* Ce que le geste fait, pour qui ne le voit pas. Une carte qui change de
          place sans rien dire est un déplacement invisible. */}
      <p role="status" aria-live="polite" className="sr-only">
        {annonce}
      </p>

      {!seule && (
        <div className="flex items-center justify-center gap-2 mt-2">
          {rangees.map((carte, rang) => (
            <button
              key={carte.id}
              type="button"
              aria-label={`Carte ${rang + 1} sur ${rangees.length}`}
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
