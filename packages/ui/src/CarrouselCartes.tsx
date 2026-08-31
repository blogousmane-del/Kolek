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
  /** La carte que l'écran considère comme choisie. Pilotée par le parent. */
  visibleId: string;
  onVisible: (id: string) => void;
}

type Taille = 'reduite' | 'moyenne' | 'grande';

/**
 * Les trois tailles, de la plus petite à la plus grande.
 *
 * Des largeurs fixes, et non des fractions de la piste : sur un téléphone, 160
 * px en montrent deux ; sur la tablette du superviseur, la même valeur en
 * montre quatre. Une fraction donnerait toujours le même nombre de cartes,
 * quel que soit l'écran — l'inverse de ce qu'on cherche.
 */
const TAILLES: ReadonlyArray<{ cle: Taille; libelle: string; largeur: string }> = [
  { cle: 'reduite', libelle: 'Réduire', largeur: 'w-40' },
  { cle: 'moyenne', libelle: 'Moyen', largeur: 'w-64' },
  { cle: 'grande', libelle: 'Agrandir', largeur: 'w-full' },
];

/**
 * Les cartes actives d'un client, étalées comme une main de cartes à jouer :
 * on les parcourt du pouce, on en change la taille, et on les réordonne.
 *
 * ## Pourquoi une rangée
 *
 * Empilées, deux cartes actives poussaient hors de l'écran tout ce qui suit —
 * les derniers versements, l'historique, le consentement aux avis. Le client
 * qui tient trois carnets rendait sa propre fiche illisible. En rangée, la
 * fiche garde sa hauteur quel que soit le nombre de cartes.
 *
 * C'est aussi ce qui a écarté la grille qui se replie, essayée en maquette :
 * belle sur un écran large, elle rend à la fiche la hauteur variable que la
 * rangée lui avait retirée. La rangée reste ; c'est la **taille des cartes**
 * qui décide combien on en voit ensemble.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne porte aucune commande d'argent. La rangée d'actions vit **sous** lui,
 * dans l'écran, et reste immobile pendant le défilement — voir `ActionsCarte`.
 * Une barre attachée à chaque carte sortirait du champ avec elle, au moment
 * précis où le doigt la cherche.
 *
 * ## Trois tailles, ajoutées le 2026-08-31
 *
 * Demande de GTCS : voir deux, trois ou quatre cartes ensemble, et pouvoir
 * réduire ou agrandir. `Réduire` en montre deux sur un téléphone, `Agrandir`
 * en montre une par écran — c'est-à-dire exactement ce que faisait ce
 * carrousel avant. La taille ne se conserve pas d'un écran à l'autre, comme
 * l'ordre : c'est un confort d'affichage, pas une préférence.
 *
 * La carte, elle, se mesure toute seule et se réorganise sous 240 px — voir
 * `CarteCollecte`. Aucune taille ne lui est dictée d'ici.
 *
 * ### Ce que le choix d'une carte veut dire, et pourquoi il a changé
 *
 * Le bouton d'encaissement, sous la rangée, agit sur la carte choisie. Tant
 * qu'il n'y en avait qu'une par écran, la position du défilement suffisait à
 * la désigner. Dès que deux cartes partagent l'écran, « celle qui est en face »
 * ne veut plus rien dire — et se tromper de carte, ici, c'est encaisser sur le
 * mauvais cycle.
 *
 * Donc : à `Agrandir`, le défilement continue de désigner, comme avant. Aux
 * deux autres tailles, il ne désigne plus rien — **on touche la carte** qu'on
 * vise, et elle porte un liseré qui ne laisse aucun doute sur celle que le
 * bouton va encaisser.
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

  const [taille, setTaille] = useState<Taille>('reduite');

  const seule = rangees.length <= 1;
  // Une carte seule prend toute la place : lui appliquer une largeur réduite
  // laisserait un vide à côté de rien.
  const largeur = seule ? 'w-full' : (TAILLES.find((t) => t.cle === taille)?.largeur ?? 'w-full');
  const pleineLargeur = seule || taille === 'grande';

  /**
   * Amener une carte sous les yeux.
   *
   * La position se lit sur l'enfant plutôt que sur la largeur de la piste : les
   * cartes n'occupent plus forcément un écran chacune, et multiplier un rang
   * par la largeur visible viserait à côté dès la deuxième carte.
   *
   * `scrollTo` n'est pas implémenté par jsdom — l'appeler sans garde ferait
   * échouer les tests des écrans appelants sur une fonction manquante, pas sur
   * leur propre comportement.
   */
  function amener(rang: number) {
    const element = piste.current;
    if (!element || typeof element.scrollTo !== 'function') return;
    const enfant = element.children[rang] as HTMLElement | undefined;
    if (!enfant) return;
    const centre = enfant.offsetLeft - (element.clientWidth - enfant.clientWidth) / 2;
    element.scrollTo({ left: Math.max(0, centre), behavior: 'smooth' });
  }

  function choisir(rang: number) {
    const carte = rangees[rang];
    if (!carte) return;
    onVisible(carte.id);
    amener(rang);
  }

  // Changer de taille rebat toute la rangée. Sans ce rappel, la carte choisie
  // peut se retrouver hors champ après un agrandissement, et le bouton
  // d'encaissement porterait alors un montant qu'on ne voit plus.
  //
  // `index` est volontairement hors des dépendances : ce rappel répond au
  // changement de taille, pas à chaque changement de carte choisie — celui-là
  // est déjà servi par `choisir`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => amener(index), [taille]);

  /**
   * Ce que le doigt vient de mettre en face.
   *
   * Muette dès que plusieurs cartes tiennent ensemble : la position du
   * défilement ne désigne plus personne, c'est la carte touchée qui désigne.
   *
   * Muette aussi pendant qu'une carte est levée : la rangée bouge alors sous le
   * doigt, et lire sa position ferait sauter la carte choisie à chaque
   * réarrangement.
   *
   * `clientWidth` vaut zéro tant que rien n'est mis en page — jsdom ne calcule
   * aucune géométrie. La garde évite une division par zéro qui rendrait `NaN`
   * et ferait remonter une carte inexistante.
   */
  function auDefilement() {
    if (saisi || !pleineLargeur) return;
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
    const largeurCarte = premiere.getBoundingClientRect().width;
    return largeurCarte > 0 ? largeurCarte + 12 : 0;
  }

  /**
   * Une carte a-t-elle été levée pendant le geste en cours ?
   *
   * Un appui long suivi d'un relâchement produit aussi un clic. Sans ce témoin,
   * ranger une carte la choisirait au passage — et le bouton d'encaissement
   * changerait de montant à la fin de chaque rangement.
   */
  const aLeve = useRef(false);

  function relacher() {
    if (geste.current) window.clearTimeout(geste.current.minuteur);
    geste.current = null;
    setSaisi(null);
  }

  function auContact(evenement: React.PointerEvent, id: string, rang: number) {
    // Un seul doigt. Un second pendant un déplacement rendrait le calcul
    // d'écart insensé, et c'est un geste involontaire fréquent à une main.
    if (geste.current) return;

    // Un témoin resté levé — geste annulé, clic jamais venu — mangerait le
    // prochain choix. Chaque nouvel appui repart de zéro.
    aLeve.current = false;

    const x0 = evenement.clientX;
    const cible = evenement.currentTarget;

    const minuteur = window.setTimeout(() => {
      setSaisi(id);
      aLeve.current = true;
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

  /** Toucher une carte la choisit — sauf si le geste était un rangement. */
  function auClicCarte(rang: number) {
    if (aLeve.current) {
      aLeve.current = false;
      return;
    }
    choisir(rang);
  }

  return (
    <div>
      {!seule && (
        // Les trois tailles dans l'ordre, de la plus petite à la plus grande :
        // la commande dit elle-même dans quel sens elle va.
        <div className="flex items-center justify-end gap-1 mb-2">
          {TAILLES.map(({ cle, libelle }) => (
            <button
              key={cle}
              type="button"
              aria-pressed={cle === taille}
              onClick={() => setTaille(cle)}
              className={`anim-pression px-2.5 py-1.5 rounded-md font-body text-xs font-semibold cursor-pointer border ${
                cle === taille
                  ? 'bg-secondary border-primary text-primary'
                  : 'bg-surface border-hairline text-muted-foreground'
              }`}
            >
              {libelle}
            </button>
          ))}
        </div>
      )}

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
        // `relative` fait de la piste le parent de référence des cartes : c'est
        // ce qui rend `offsetLeft` lisible dans `amener`.
        className={`relative flex gap-3 m-0 p-0 list-none ${
          seule
            ? ''
            : `overflow-x-auto scrollbar-none snap-x ${
                pleineLargeur ? 'snap-mandatory' : 'snap-proximity'
              }`
        }`}
      >
        {rangees.map((carte, rang) => {
          const leve = saisi === carte.id;
          const choisie = carte.id === visibleId;
          return (
            <li
              key={carte.id}
              aria-label={`Carte ${rang + 1} sur ${rangees.length}`}
              aria-current={!seule && choisie}
              onPointerDown={(e) => !seule && auContact(e, carte.id, rang)}
              onClick={() => !seule && auClicCarte(rang)}
              // `touch-none` seulement une fois la carte levée : posé d'office,
              // il rendrait la piste impossible à défiler au doigt.
              className={`snap-start shrink-0 ${largeur} rounded-xl transition-transform ${
                leve ? 'touch-none scale-105 z-10 shadow-lg cursor-grabbing' : ''
              } ${
                // Le liseré désigne la carte que le bouton d'encaissement va
                // servir. Sans lui, deux cartes côte à côte et un seul montant
                // sous elles laissent deviner laquelle est concernée.
                !seule && choisie ? 'ring-2 ring-primary' : ''
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
