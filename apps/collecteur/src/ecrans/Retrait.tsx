import { MISES_PAR_CYCLE, commission, formatMontant } from '@kolek/core';
import {
  Bouton,
  CarteCollecte,
  Decompte,
  Feuille,
  Icone,
  Pagination,
  Segments,
  Squelette,
  Tampon,
  useEnLigne,
  usePagination,
} from '@kolek/ui';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import type { ClientCible } from '../Coquille';
import { useDonnees } from '../cache';
import { cloturerCarte } from '../ecritures-ecrans';
import { useHorsLigne } from '../hors-ligne/useHorsLigne';
import { enAttenteSurCarte, phraseAttenteCarte } from '../hors-ligne/vues';
import { chargerCartesCloturables, type CarteCloturable } from '../lectures-ecrans';
import { LIGNES_AFFICHEES_PAR_PAGE } from '../pagination';
import { rangCascade, usePremierRendu } from '../premier-rendu';
import { nu } from '../recherche';
import { useEstCollaborateur } from './commission';
import { ActiverCarte } from './ActiverCarte';
import { CorpsEcran, EnTeteEcran, RienAMontrer } from './EnTeteEcran';

/**
 * Les filtres de la liste.
 *
 * Trois et pas davantage, parce que les données n'en portent pas plus : une
 * carte est au bout de son cycle, ou elle ne l'est pas. Les deux cas appellent
 * deux gestes différents. Au bout, rendre l'argent ou repartir sur une carte de
 * plus ; en cours, un retrait anticipé, dont le montant ne se fait pas de tête.
 */
const FILTRES = ['Toutes', 'Cycle terminé', 'En cours'] as const;
type Filtre = (typeof FILTRES)[number];

const pluriel = (n: number) => (n > 1 ? 's' : '');

/** L'espace fine insécable (U+202F) d'avant le point d'interrogation, écrite
    par son code : une séquence d'échappement tapée se perd en route. */
const FINE = String.fromCharCode(0x202f);

/** Ce que dit une carte sans mise, à la place d'un décompte et d'une phrase de
    commission : il n'y a rien à compter. */
const RIEN_A_RENDRE = 'Aucune mise encaissée : rien à rendre, rien à garder.';

/**
 * Le décompte d'un retrait, ligne à ligne.
 *
 * Les lignes viennent du moteur : les mises encaissées (`n × mise`), puis la
 * retenue de `commission`, la première mise de la carte. Le total est
 * `carte.restituable`, que `chargerCartesCloturables` calcule sur le téléphone,
 * à la lecture des cartes, par `soldeRestituable`. Les deux sortent de la même
 * règle de `@kolek/core`, et concordent par construction : `n × mise` moins une
 * mise, c'est `(n − 1) × mise`. Il n'y a donc pas de garde qui ne montrerait les
 * lignes que si elles retombent sur le total : aucune donnée ne la déclenchait.
 *
 * Le chiffre du serveur est celui de la vue clôturée, une fois le retrait
 * inscrit : c'est lui que le collecteur remet en main propre.
 */
function DecompteRetrait({
  carte,
  estCollaborateur,
}: {
  carte: CarteCloturable;
  estCollaborateur: boolean;
}) {
  const n = carte.misesEncaissees;
  if (n === 0) {
    return <p className="font-body text-sm text-muted-foreground">{RIEN_A_RENDRE}</p>;
  }

  return (
    <Decompte
      lignes={[
        {
          libelle: (
            <>
              <span className="font-mono">{n}</span> mise{pluriel(n)} ×{' '}
              <span className="font-mono">{formatMontant(carte.mise)}</span>
            </>
          ),
          montant: n * carte.mise,
        },
        {
          libelle: estCollaborateur ? 'Part de ton titulaire, case 1' : 'Ta commission, case 1',
          montant: -commission(n, carte.mise),
        },
      ]}
      total={{ libelle: 'À rendre', montant: carte.restituable }}
    />
  );
}

/**
 * Retrait : clôturer une carte et rendre son solde au client.
 *
 * C'est le seul écran de l'application qui fait **sortir** de l'argent. Il est
 * construit en conséquence.
 *
 * **Une ligne par carte, le détail quand on le demande** (2026-10-02). Les
 * cartes faisaient 240 px de haut, la même phrase de commission répétée sur
 * chacune, et une carte à 0 FCFA aussi grosse qu'une carte à rendre. La ligne
 * dit le nom, l'avancement et le montant à rendre ; la toucher la déplie, une
 * seule à la fois, sur la règle de la commission et les deux gestes.
 *
 * **Le montant est affiché avant confirmation, calculé par le moteur sur la
 * carte lue au serveur.** Le collecteur voit ce qu'il va rendre, en chiffres,
 * avant de toucher au bouton.
 * La règle — la première mise est sa commission — est rappelée dans le dépli,
 * parce que c'est là qu'un client peut la contester.
 *
 * **La confirmation est en deux temps.** Un retrait ne se défait pas : `retraits`
 * porte un déclencheur d'immuabilité, et la carte clôturée ne se rouvre pas. Un
 * appui unique sur une liste défilante, dans un marché, se produirait par accident.
 */
export function Retrait({
  onRetour,
  onEcriture,
  revision,
  collecteurId,
  client = null,
  onToutesLesCartes,
}: {
  onRetour: () => void;
  /** Un retrait vient d'être inscrit, ou une carte de plus vient d'être
      ouverte : la liste doit se relire. La propriété s'appelait `onCloture`
      quand la clôture était la seule écriture de cet écran. */
  onEcriture: () => void;
  revision: number;
  /** Donné par la coquille : le bloc « Activer une carte » écrit, et
      `collecteur_id` accompagne l'écriture. Le lire ici par carte pleine
      affichée coûterait un aller-retour réseau par carte. */
  collecteurId: string | null;
  /**
   * Le client sur lequel la liste est réduite, quand on arrive ici depuis sa
   * ligne ou sa fiche.
   *
   * Sans ce filtre, toucher « Retirer » sur une carte précise renvoyait sur la
   * liste de **toutes** les cartes de **tous** les clients, sans préselection.
   * Le collecteur venait de désigner une carte, et devait la retrouver à la
   * main — par nom, montant et nombre de jours — avant un geste qui ne se
   * défait pas. Debout dans un marché, c'est fabriquer l'erreur qu'on veut
   * éviter, d'autant qu'un même client peut avoir deux cartes dans cette liste.
   *
   * Le nom arrive avec l'identifiant, et n'est plus déduit des cartes lues :
   * quand la liste réduite est vide — juste après le dernier retrait de ce
   * client — il n'y avait plus de nom, donc plus de bandeau, donc plus aucune
   * sortie du filtre.
   */
  client?: ClientCible | null;
  /** Retire le filtre. Absent quand aucun filtre n'est posé. */
  onToutesLesCartes?: () => void;
}) {
  const estCollaborateur = useEstCollaborateur();
  const enLigne = useEnLigne();
  const { operations, file } = useHorsLigne();
  const [aConfirmer, setAConfirmer] = useState<CarteCloturable | null>(null);
  /** La ligne dépliée. Une seule à la fois : deux lignes dépliées, ce sont
      deux boutons « Faire le retrait » sous le même pouce. */
  const [ouverte, setOuverte] = useState<string | null>(null);
  // Voir `Recus` : l'escalier ne rejoue pas quand la liste se relit.
  const premier = usePremierRendu();
  const [envoi, setEnvoi] = useState(false);
  /** Le retrait inscrit : la carte telle qu'elle était, le montant que le
      serveur a rendu, et l'heure, celle du tampon. */
  const [fait, setFait] = useState<{
    carte: CarteCloturable;
    montant: number;
    quand: Date;
  } | null>(null);
  /** La région d'état de la vue clôturée : elle prend le focus à l'arrivée de la
      vue (voir l'effet plus bas). */
  const etatClotureRef = useRef<HTMLDivElement>(null);
  /**
   * Une carte de plus vient d'être ouverte depuis la vue clôturée.
   *
   * Hors de `fait`, exprès : l'effet de la vue dépend de `fait`, et en changer
   * pour dire « ouverte » le rejouerait — remontée en haut, focus repris — à
   * l'instant où le collecteur lit la confirmation.
   */
  const [carteOuverteApres, setCarteOuverteApres] = useState(false);
  const nouvelleCarteRef = useRef<HTMLParagraphElement>(null);
  /** Chaque clôture fait avancer la révision, ce qui périme la liste gardée.
      Après un retrait, la carte clôturée doit disparaître : un affichage
      instantané de l'ancienne liste inviterait à la clôturer deux fois. C'est
      le seul écran où le cache doit être franchement invalidé. */
  const [tourLocal, setTourLocal] = useState(0);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('Toutes');

  const {
    donnees: cartes,
    erreur: erreurLecture,
    rafraichir,
  } = useDonnees('cartes-cloturables', chargerCartesCloturables, {
    revision: revision + tourLocal,
    messageErreur: 'Cet écran demande le réseau.',
    besoinReseau: true,
  });
  const [erreurEcriture, setErreurEcriture] = useState<string | null>(null);
  const erreur = erreurEcriture ?? erreurLecture;

  // `cartes` reste la liste entière : le filtre ne change que ce qu'on montre,
  // jamais ce qu'on a lu. Une seule lecture sert les deux vues, et revenir à
  // toutes les cartes ne coûte pas un aller-retour réseau. Rien lu (lecture en
  // cours, ou en échec hors ligne) reste `null` : une liste vide dirait d'un
  // client qui a des cartes que toutes sont clôturées.
  const duClient = client && cartes ? cartes.filter((c) => c.clientId === client.id) : cartes;

  /**
   * Quand le champ de recherche et les filtres existent.
   *
   * Pas sous un filtre client : la liste ne porte déjà qu'une personne, et un
   * second filtre par-dessus ne retrancherait rien qu'on cherche. Pas non plus
   * sur zéro ou une carte, où il n'y a rien à trouver — un champ posé au-dessus
   * d'une liste d'un élément est du décor.
   *
   * Et le terme comme le filtre ne sont lus que si leurs commandes sont là.
   * Sans cette garde, arriver ici depuis la fiche d'un client, la recherche
   * restée pleine ou « En cours » resté choisi d'un passage précédent,
   * masquerait ses cartes par un filtre devenu invisible — le pire défaut
   * possible sur l'écran qui fait sortir l'argent.
   */
  const avecOutils = !client && (cartes?.length ?? 0) > 1;
  const cherche = avecOutils ? nu(recherche.trim()) : '';
  const filtreActif: Filtre = avecOutils ? filtre : 'Toutes';

  // On cherche, on filtre, **puis** on découpe — l'ordre de l'écran Clients,
  // et pour sa raison : découper d'abord ferait chercher dans la seule page
  // affichée, et la recherche ne trouverait jamais une carte de la page deux.
  const trouvees =
    cherche && duClient ? duClient.filter((c) => nu(c.clientNom).includes(cherche)) : duClient;

  const visibles =
    trouvees && filtreActif !== 'Toutes'
      ? trouvees.filter((c) => (filtreActif === 'Cycle terminé' ? c.cycleComplet : !c.cycleComplet))
      : trouvees;

  /**
   * Les cycles terminés devant : ce sont les cartes qu'on vient rendre. Le tri
   * est stable, donc l'ordre du serveur tient à l'intérieur de chaque groupe ;
   * et il précède le découpage, sans quoi chaque page aurait son propre
   * « devant ».
   */
  const rangees = visibles
    ? [...visibles].sort((a, b) => Number(b.cycleComplet) - Number(a.cycleComplet))
    : null;

  /**
   * Vingt cartes par page, le seuil de l'écran Clients.
   *
   * `LIGNES_AFFICHEES_PAR_PAGE`, et non une valeur à part : deux écrans voisins
   * qui découpent leur liste à deux tailles différentes, c'est une règle que le
   * collecteur doit réapprendre en changeant d'onglet. `Pagination` se retire
   * d'elle-même sous vingt et une cartes, et le crochet ramène la page dans ses
   * bornes quand un retrait raccourcit la liste.
   *
   * Appelé avant le retour anticipé de la carte clôturée : un crochet ne se
   * saute pas.
   */
  const {
    page,
    pages,
    total: totalFiltre,
    visibles: affichees,
    allerA,
  } = usePagination(rangees ?? [], LIGNES_AFFICHEES_PAR_PAGE);

  /*
    Toute nouvelle question se pose depuis le début de la liste, et referme le
    dépli comme la confirmation.

    Le retour en page 1 est celui de Clients : sans lui, on cherche depuis la
    page trois et l'écran répond par le quarante et unième résultat, les
    quarante premiers invisibles.

    La fermeture est propre à cet écran. Une confirmation ouverte survit au
    changement de liste, puisqu'elle vit dans l'état et non dans la carte : la
    carte masquée par un filtre reparaissait, au retour sur « Toutes », avec
    « Oui, rendre » sous le doigt — un geste qui ne se défait pas, à
    un appui de distance, sur une carte qu'on n'avait pas redemandée. Le dépli
    suit la même règle, pour la même raison.

    Ce sont des gestes, donc ça se fait dans les gestionnaires et non dans un
    `useEffect` : rien à synchroniser après coup.
  */
  const fermer = () => {
    setOuverte(null);
    setAConfirmer(null);
  };

  const changerRecherche = (terme: string) => {
    setRecherche(terme);
    fermer();
    allerA(1);
  };

  const changerFiltre = (f: Filtre) => {
    setFiltre(f);
    fermer();
    allerA(1);
  };

  const changerPage = (numero: number) => {
    fermer();
    allerA(numero);
  };

  /** Déplier une ligne replie l'autre, et referme sa confirmation : elle se
      rouvre au doigt, jamais d'elle-même. */
  const basculer = (carteId: string) => {
    setOuverte((o) => (o === carteId ? null : carteId));
    setAConfirmer(null);
  };

  /**
   * La feuille ne se ferme pas pendant que le retrait part : la fermer
   * cacherait la réponse du serveur. Stable d'un rendu à l'autre, parce que
   * `Feuille` reprend le focus chaque fois que cette fonction change.
   */
  const fermerDecompte = useCallback(() => {
    if (!envoi) setAConfirmer(null);
  }, [envoi]);

  /**
   * Ce que la recherche a trouvé, et ce que le filtre en cache.
   *
   * Le compte et le total : une liste qui rétrécit sans dire de combien laisse
   * croire qu'on a perdu des cartes. Et la part du filtre, comptée à part de
   * celle de la recherche — sur l'écran Clients, compter sur la liste déjà
   * filtrée faisait dire « aucun client trouvé » d'un client que le filtre
   * cachait. Ici ce serait « aucune carte à ce nom » d'une carte bien là, et le
   * collecteur conclurait qu'elle a déjà été rendue.
   */
  const nbTrouvees = trouvees?.length ?? 0;
  const nbVisibles = visibles?.length ?? 0;
  const masquees = nbTrouvees - nbVisibles;
  const annonce =
    !cherche || !duClient
      ? ''
      : nbTrouvees === 0
        ? 'Aucune carte trouvée'
        : masquees === 0
          ? `${nbTrouvees} sur ${duClient.length} cartes`
          : nbVisibles === 0
            ? `${nbTrouvees} carte${pluriel(nbTrouvees)} trouvée${pluriel(nbTrouvees)}, masquée${pluriel(nbTrouvees)} par le filtre « ${filtreActif} »`
            : `${nbVisibles} sur ${nbTrouvees}, dont ${masquees} masquée${pluriel(masquees)} par le filtre « ${filtreActif} »`;

  /** Les comptes des segments, faits sur ce que la recherche a trouvé : chaque
      segment dit ce qu'il montrerait si on le choisissait. */
  const comptes: Record<Filtre, number> = {
    Toutes: nbTrouvees,
    'Cycle terminé': trouvees?.filter((c) => c.cycleComplet).length ?? 0,
    'En cours': trouvees?.filter((c) => !c.cycleComplet).length ?? 0,
  };

  /**
   * Quel vide montrer, s'il y en a un.
   *
   * Trois vides qui ne se disent pas pareil. « Aucune carte active » sous une
   * recherche qui ne trouve rien ferait croire que tout est clôturé, alors
   * qu'on a mal tapé un nom ; sous un filtre, alors qu'on a seulement choisi
   * « En cours » sur une liste de cycles terminés.
   */
  const vide: 'nom' | 'filtre' | 'liste' | null =
    visibles?.length !== 0
      ? null
      : cherche && nbTrouvees === 0
        ? 'nom'
        : filtreActif !== 'Toutes'
          ? 'filtre'
          : 'liste';

  /**
   * Sous « Toutes », deux groupes titrés : les cycles terminés, puis les
   * cartes en cours. Sous un filtre, une seule liste sans titre : le segment
   * choisi le dit déjà.
   */
  const groupes: { titre: Filtre | null; membres: CarteCloturable[] }[] =
    filtreActif === 'Toutes'
      ? [
          { titre: 'Cycle terminé', membres: affichees.filter((c) => c.cycleComplet) },
          { titre: 'En cours', membres: affichees.filter((c) => !c.cycleComplet) },
        ]
      : [{ titre: null, membres: affichees }];

  /**
   * Pourquoi le retrait d'une carte attend, ou `null` (spec J2b §7).
   *
   * Lu au rendu pour les deux boutons — celui qui ouvre la confirmation et
   * celui qui la valide — et relu au moment de confirmer : entre l'ouverture et
   * le geste, une mise de la carte a pu entrer dans la file, ou le réseau
   * tomber. La clôture recalcule au serveur depuis les mises qu'il a reçues ;
   * sans cette garde, le client repartirait avec moins que son dû.
   *
   * Une file pas encore lue ne vaut pas une file vide.
   */
  function retraitBloquePour(carteId: string): string | null {
    if (file === null) return 'Opérations du téléphone pas encore vérifiées.';
    return (
      phraseAttenteCarte(enAttenteSurCarte(operations, carteId)) ??
      (enLigne ? null : 'Le retrait demande le réseau.')
    );
  }

  async function confirmer() {
    if (!aConfirmer || envoi) return;
    if (retraitBloquePour(aConfirmer.carteId) !== null) return;
    setEnvoi(true);
    setErreurEcriture(null);

    const resultat = await cloturerCarte(aConfirmer.carteId);

    setEnvoi(false);
    if (!resultat.ok) {
      setErreurEcriture(resultat.echec.message);
      setAConfirmer(null);
      // Un refus peut venir d'une carte clôturée ailleurs entre-temps : on
      // relit, sinon l'écran continue de proposer une carte qui n'existe plus.
      rafraichir();
      return;
    }

    // La carte ouverte après le retrait précédent ne parle pas de celui-ci.
    setCarteOuverteApres(false);
    setFait({ carte: aConfirmer, montant: resultat.montantRestitue, quand: new Date() });
    fermer();
    setTourLocal((t) => t + 1);
    onEcriture();
  }

  /** La règle de la commission, dite une fois, dans le dépli. Les nombres qu'on
      compte, le compte de mises et la mise, sont en Plex Mono ; la phrase reste
      dans la police du texte, et l'unité aussi. */
  function phraseCommission(carte: CarteCloturable): ReactNode {
    const n = carte.misesEncaissees;
    if (n === 0) return RIEN_A_RENDRE;
    return (
      <>
        <span className="font-mono">{n}</span> mise{pluriel(n)} encaissée{pluriel(n)}, moins la{' '}
        première, {estCollaborateur ? 'qui revient à ton titulaire' : 'qui est ta commission'}{' '}
        (<span className="font-mono">{formatMontant(carte.mise)}</span> FCFA).
      </>
    );
  }

  function ligne(carte: CarteCloturable, rang: number) {
    const deplie = ouverte === carte.carteId;
    const retraitBloque = retraitBloquePour(carte.carteId);
    /** Le lien du bouton éteint à sa raison. Dérivé de la carte et non de
        `useId` : cette fonction rend une ligne par carte, un crochet n'y a pas sa
        place. L'`id` porte la carte : deux lignes ne peuvent pas le partager. */
    const idRaison = `raison-${carte.carteId}`;

    return (
      <li
        key={carte.carteId}
        className={`relative ${premier ? 'anim-cascade' : ''}`}
        style={rangCascade(rang, premier)}
      >
        {/* Le trait d'un cycle terminé : la carte qu'on vient rendre se voit
            avant qu'on lise son compteur. `pointer-events-none` : posé au-dessus
            du bouton de la ligne, il avalerait le toucher qui visait ses quatre
            premiers pixels. */}
        {carte.cycleComplet && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-positive"
          />
        )}
        <button
          type="button"
          aria-expanded={deplie}
          aria-controls={deplie ? `depli-${carte.carteId}` : undefined}
          onClick={() => basculer(carte.carteId)}
          className="anim-pression flex w-full cursor-pointer items-center gap-3 py-3 pl-4 pr-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-body text-base font-semibold text-ink">
              {carte.clientNom}
            </span>
            <span className="mt-0.5 block font-body text-xs text-muted-foreground">
              <span className="font-mono">
                {carte.misesEncaissees}/{MISES_PAR_CYCLE}
              </span>{' '}
              · <span className="font-mono">{formatMontant(carte.mise)}</span>/j
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-mono text-base font-medium text-ink tabular-nums">
              {formatMontant(carte.restituable)}{' '}
              <span className="font-body text-xs font-medium text-muted-foreground">FCFA</span>
            </span>
            <span className="block font-body text-xs text-muted-foreground">à rendre</span>
          </span>
          <Icone
            nom="chevron-down"
            taille={16}
            className={`shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${deplie ? 'rotate-180' : ''}`}
          />
        </button>

        {deplie && (
          <div id={`depli-${carte.carteId}`} className="space-y-3 px-4 pb-4">
            <p className="font-body text-sm text-muted-foreground">{phraseCommission(carte)}</p>

            {/* Deux portes, et elles se valent : rendre l'argent, ou le laisser
                et repartir sur une carte de plus. Le collecteur est devant le
                client quand celui-ci choisit — la seconde ne peut pas être deux
                écrans plus loin.

                La seconde n'apparaît que sur une carte terminée. Sur une carte
                en cours, elle prélèverait une commission — la première mise du
                nouveau cycle — que personne n'a demandée. */}
            <div className="flex flex-wrap gap-2">
              <Bouton
                disabled={retraitBloque !== null}
                decritPar={retraitBloque ? idRaison : undefined}
                onClick={() => setAConfirmer(carte)}
              >
                Faire le retrait
              </Bouton>
              {/* La raison suit son bouton, avant la seconde porte : sur un
                  téléphone étroit les deux portes passent à la ligne, et une
                  raison lue sous « Activer une carte » serait prise pour la
                  sienne. `decritPar` la relie au bouton éteint, qui ne prend
                  pas le focus. */}
              {retraitBloque && (
                <p id={idRaison} className="m-0 basis-full font-body text-xs text-muted-foreground">
                  {retraitBloque}
                </p>
              )}
              {carte.cycleComplet && (
                <ActiverCarte
                  collecteurId={collecteurId}
                  clientId={carte.clientId}
                  misePreremplie={carte.mise}
                  identifiant={`retrait-${carte.carteId}`}
                  onOuverte={onEcriture}
                />
              )}
            </div>
          </div>
        )}
      </li>
    );
  }

  /** Relu à chaque rendu : entre l'ouverture de la feuille et le geste, une
      mise a pu entrer dans la file, ou le réseau tomber. */
  const bloqueConfirmation = aConfirmer ? retraitBloquePour(aConfirmer.carteId) : null;

  // À l'arrivée de la vue clôturée, remonter en haut et donner le focus à ce qu'il
  // reste à faire de la main. La vue remplace la liste sans changer de page : la
  // coquille ne remonte pas, et un retrait confirmé au bas d'une longue liste se
  // lisait de son milieu. Le bouton « Oui, rendre » avait le focus, et il vient de
  // disparaître avec la feuille : il tomberait sur <body>, et la région d'état,
  // montée déjà remplie, resterait muette pour un lecteur d'écran. `preventScroll` :
  // on vient de remonter, le focus ne doit pas redescendre la page.
  useEffect(() => {
    if (!fait) return;
    window.scrollTo(0, 0);
    etatClotureRef.current?.focus({ preventScroll: true });
  }, [fait]);

  // La phrase qui confirme la carte ouverte prend la place du bloc qui portait le
  // focus. Sans ce geste il tomberait sur <body>, et la confirmation resterait muette.
  useEffect(() => {
    if (carteOuverteApres) nouvelleCarteRef.current?.focus();
  }, [carteOuverteApres]);

  if (fait) {
    return (
      <div className="flex flex-1 flex-col">
        <EnTeteEcran titre="Retrait" sousTitre="Carte clôturée" onRetour={onRetour} />
        <CorpsEcran
          enfants={
            <>
              {/* La carte rendue, et le tampon du geste : le même que celui de
                  l'encaissement, parce que c'est la même chose, un geste qui ne
                  se défait pas. */}
              <CarteCollecte
                nomClient={fait.carte.clientNom}
                misePar={formatMontant(fait.carte.mise)}
                jourCourant={fait.carte.misesEncaissees}
                solde={formatMontant(fait.montant)}
                etiquetteSolde="Rendu au client"
                close
                tampon={<Tampon mot="Clôturée" quand={fait.quand} />}
              />

              {/* Ce qu'il reste à faire de la main : remettre l'argent.

                  `tabIndex={-1}` : le bloc prend le focus par programme (voir
                  l'effet plus haut), sans entrer dans l'ordre de tabulation.
                  `outline-none` n'éteint pas son anneau : la règle `:focus-visible`
                  de `base.css` est hors de toute couche, donc plus forte que lui.
                  Même dispositif, même raison que la ligne d'état d'`Encaisser` :
                  l'anneau se dessine quand « Oui, rendre » avait été activé au
                  clavier, et pas d'un clic ou d'un toucher — c'est voulu. */}
              <div
                ref={etatClotureRef}
                role="status"
                tabIndex={-1}
                className="space-y-1 outline-none"
              >
                <p className="font-headings text-xl font-bold text-ink">
                  Remets <span className="font-mono font-medium">{formatMontant(fait.montant)}</span>{' '}
                  FCFA à {fait.carte.clientNom}, en main propre.
                </p>
                <p className="font-body text-sm text-muted-foreground">
                  Le retrait est inscrit au journal. Il ne peut plus être défait.
                </p>
              </div>

              <div className="space-y-3">
                <Bouton
                  pleineLargeur
                  onClick={() => {
                    setFait(null);
                    setCarteOuverteApres(false);
                  }}
                >
                  Retour aux cartes
                </Bouton>
                {/* Le cycle était complet : le client peut repartir sur une
                    carte de plus, tout de suite. La phrase par défaut du bloc
                    (« son solde reste dû au client ») serait fausse ici : il
                    vient d'être rendu.

                    Une fois la carte ouverte, le bloc cède la place à une phrase
                    qui le dit. Replié sans un mot, il laissait « Activer une
                    carte » à sa place : un second appui ouvrait une seconde carte,
                    donc une seconde commission. La phrase prend le focus, comme
                    la région d'état plus haut (`tabIndex={-1}`, `outline-none`). */}
                {fait.carte.cycleComplet &&
                  (carteOuverteApres ? (
                    <p
                      ref={nouvelleCarteRef}
                      role="status"
                      tabIndex={-1}
                      className="m-0 font-body text-sm font-medium text-positive outline-none"
                    >
                      Nouvelle carte ouverte. Elle repart de la case 1.
                    </p>
                  ) : (
                    <ActiverCarte
                      collecteurId={collecteurId}
                      clientId={fait.carte.clientId}
                      misePreremplie={fait.carte.mise}
                      identifiant={`cloturee-${fait.carte.carteId}`}
                      explication="La carte précédente est close. La nouvelle repart de la case 1."
                      onOuverte={() => {
                        setCarteOuverteApres(true);
                        onEcriture();
                      }}
                    />
                  ))}
              </div>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Le champ a quitté l'en-tête le 2026-10-02, pour le corps de l'écran,
          comme sur l'écran Clients — demande de l'exploitant, sur capture. Le
          compte de la recherche a suivi : il vit sous le champ, dans sa région
          d'annonce, et le sous-titre redevient celui de l'écran. */}
      <EnTeteEcran
        titre="Retrait"
        sousTitre="Clôturer une carte et rendre le solde"
        onRetour={onRetour}
      />

      <CorpsEcran
        enfants={
          <>
            {erreur && (
              <p role="alert" className="rounded-md bg-negative-tint p-3 font-body text-sm text-negative">
                {erreur}
              </p>
            )}

            {/* Une liste réduite sans explication se lit comme des cartes
                disparues. Le bandeau dit sur qui on est, et rend la sortie
                visible — sinon le seul moyen de revoir les autres est de
                repartir de l'accueil. */}
            {client && (
              <div className="flex items-center justify-between gap-3 rounded-md bg-info-tint px-3 py-2">
                <p className="m-0 font-body text-sm text-ink">Cartes de {client.nom}</p>
                {onToutesLesCartes && (
                  <Bouton variante="contour" onClick={onToutesLesCartes}>
                    Voir toutes les cartes
                  </Bouton>
                )}
              </div>
            )}

            {/* Recherche — le dessin de l'écran Clients, et chacun de ses choix.

                L'`input` est la surface : il porte le fond, la bordure et le
                rayon, donc l'anneau de focus du système suit sa forme et il n'y
                en a qu'un. L'icône et la croix flottent au-dessus. La bordure
                est en `trait` : `hairline` ne tenait que 1,28:1 à la limite du
                champ. */}
            {avecOutils && (
              <div>
                <div className="relative">
                  <Icone
                    nom="search"
                    taille={16}
                    // Sans `pointer-events-none`, l'icône avale le toucher qui
                    // visait le début du champ.
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    // `text` et non `search` : WebKit dessine sur `search` sa
                    // propre croix, et l'iPhone en montrait deux, dont une de
                    // 20 px qu'aucune épreuve ne touche.
                    type="text"
                    value={recherche}
                    onChange={(e) => changerRecherche(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') changerRecherche('');
                    }}
                    // « Nom du client » et non « Nom, numéro ou marché » : une
                    // carte à clôturer ne porte ni le numéro ni le marché de
                    // son client. Promettre une recherche qu'on ne fait pas,
                    // c'est lui faire taper un numéro qui ne trouvera rien.
                    placeholder="Nom du client…"
                    aria-label="Rechercher un client"
                    // Le correcteur d'iOS réécrit un nom ivoirien en mot
                    // français au deuxième caractère.
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="search"
                    className="min-h-11 w-full rounded-md border border-trait bg-surface pl-10 pr-12 font-body text-champ text-ink placeholder:text-muted-foreground transition-colors focus:border-primary"
                  />
                  {recherche && (
                    <button
                      type="button"
                      onClick={() => changerRecherche('')}
                      aria-label="Effacer la recherche"
                      // 44 px : au marché, à une main, manquer une croix de
                      // 20 px efface un caractère au lieu du terme.
                      className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-pill text-muted-foreground hover:text-ink"
                    >
                      <Icone nom="x" taille={16} />
                    </button>
                  )}
                </div>
                {/* Montée avec le champ, vide tant qu'on n'a pas cherché : un
                    lecteur d'écran n'annonce que les changements d'une région
                    qu'il observe déjà. Insérée avec son texte, elle resterait
                    muette. */}
                <p
                  role="status"
                  aria-live="polite"
                  className={`px-1 font-body text-xs text-muted-foreground ${annonce ? 'mt-2' : ''}`}
                >
                  {annonce}
                </p>
              </div>
            )}

            {/* Les filtres, en segments qui disent leur compte. Le compte est
                `aria-hidden` : le nom de chaque segment reste son libellé seul,
                celui que les phrases d'annonce reprennent (« masquée par le
                filtre « Cycle terminé » »). */}
            {avecOutils && (
              <Segments
                nom="Filtrer les cartes"
                segments={FILTRES.map((f) => ({ cle: f, libelle: f, compte: comptes[f] }))}
                choisi={filtre}
                onChoisir={changerFiltre}
              />
            )}

            {!cartes && !erreur && (
              <div
                aria-hidden
                className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface"
              >
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="flex-1 space-y-2">
                      <Squelette hauteur="h-4" largeur="w-1/2" />
                      <Squelette hauteur="h-3" largeur="w-1/3" />
                    </div>
                    <Squelette hauteur="h-5" largeur="w-20" />
                  </div>
                ))}
              </div>
            )}

            {/* « Aucune carte active » sous une recherche qui ne trouve rien
                ferait croire au collecteur que toutes les cartes sont
                clôturées, alors qu'il a mal tapé un nom. */}
            {vide === 'nom' && (
              <RienAMontrer
                // `credit-card` et non `coins` : le vide porte sur des cartes,
                // pas sur de l'argent — c'est le critère que `RienAMontrer`
                // énonce pour sa liste courte, et il évite de l'élargir.
                icone="credit-card"
                titre="Aucune carte à ce nom"
                detail="Vérifie l’orthographe, ou vide le champ pour revoir toutes les cartes."
              />
            )}

            {/* Le même tort sous un filtre : la liste n'est pas vide, c'est le
                choix du segment qui ne retient rien. Le dire, et dire comment
                revenir. */}
            {vide === 'filtre' && (
              <RienAMontrer
                icone="credit-card"
                titre={filtreActif === 'En cours' ? 'Aucune carte en cours' : 'Aucun cycle terminé'}
                detail="Choisis « Toutes » pour revoir les autres cartes."
              />
            )}

            {vide === 'liste' && (
              <RienAMontrer
                icone="coins"
                titre={client ? 'Aucune carte active pour ce client' : 'Aucune carte active'}
                detail={
                  client
                    ? 'Ses cartes ont toutes été clôturées. Ouvre-lui-en une depuis sa fiche.'
                    : "Une carte apparaît ici dès qu'un client en ouvre une."
                }
              />
            )}

            {groupes.map(({ titre, membres }) =>
              membres.length === 0 ? null : (
                <section key={titre ?? 'filtre'}>
                  {titre && (
                    <h2 className="mb-2 flex items-baseline justify-between px-1 font-body text-sm font-semibold text-ink">
                      {titre}{' '}
                      <span aria-hidden className="font-mono text-xs font-medium text-muted-foreground">
                        {comptes[titre]}
                      </span>
                    </h2>
                  )}
                  <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
                    {membres.map((carte) => ligne(carte, affichees.indexOf(carte)))}
                  </ul>
                </section>
              ),
            )}

            {/* `-mx-4` : `Pagination` porte son propre retrait latéral, pensé
                pour un écran sans marge comme Clients. Posée dans `CorpsEcran`,
                qui a déjà le sien, elle se serait décalée de seize pixels de
                plus que sur l’écran voisin. Montée seulement au-delà d’une
                page : vide, son enveloppe ajouterait la marge de `space-y-4`
                sous la dernière ligne. */}
            {pages > 1 && (
              <div className="-mx-4">
                <Pagination page={page} pages={pages} total={totalFiltre} onAller={changerPage} />
              </div>
            )}
          </>
        }
      />

      {/* Le décompte, avant le geste qui ne se défait pas. Le titre porte le
          montant, qui tient sur la ligne tronquée d'une feuille ; le nom du
          client, qui peut être long, passe dessous. */}
      {aConfirmer && (
        <Feuille
          ouverte
          titre={`Rendre ${formatMontant(aConfirmer.restituable)} FCFA${FINE}?`}
          sousTitre={`à ${aConfirmer.clientNom}`}
          onFermer={fermerDecompte}
        >
          <DecompteRetrait carte={aConfirmer} estCollaborateur={estCollaborateur} />
          <p className="rounded-md bg-info-tint p-3 font-body text-sm text-ink">
            La carte se clôture. C’est définitif : le retrait ne pourra pas être défait.
          </p>
          {bloqueConfirmation && (
            <p
              id={`raison-feuille-${aConfirmer.carteId}`}
              className="m-0 font-body text-xs text-muted-foreground"
            >
              {bloqueConfirmation}
            </p>
          )}
          <div className="space-y-2">
            <Bouton
              pleineLargeur
              grand
              onClick={confirmer}
              disabled={envoi || bloqueConfirmation !== null}
              decritPar={bloqueConfirmation ? `raison-feuille-${aConfirmer.carteId}` : undefined}
            >
              {/* Un seul span : `Bouton` est un conteneur flex, et des morceaux
                  frères y deviendraient des éléments séparés, insécables. */}
              {envoi ? (
                'Retrait…'
              ) : (
                <span>
                  Oui, rendre{' '}
                  <span className="font-mono font-medium">
                    {formatMontant(aConfirmer.restituable)}
                  </span>{' '}
                  FCFA
                </span>
              )}
            </Bouton>
            <Bouton pleineLargeur variante="contour" onClick={fermerDecompte} disabled={envoi}>
              Annuler
            </Bouton>
          </div>
        </Feuille>
      )}
    </div>
  );
}
