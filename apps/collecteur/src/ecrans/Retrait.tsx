import { MISES_PAR_CYCLE, formatMontant } from '@kolek/core';
import {
  Bouton,
  Carte,
  Icone,
  Pagination,
  Segments,
  Squelette,
  useEnLigne,
  usePagination,
} from '@kolek/ui';
import { useState } from 'react';

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
 * **Le montant est affiché avant confirmation, et il vient du serveur.** Le
 * collecteur voit ce qu'il va rendre, en chiffres, avant de toucher au bouton.
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
  const [fait, setFait] = useState<{ nom: string; montant: number } | null>(null);
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
    « Oui, faire le retrait » sous le doigt — un geste qui ne se défait pas, à
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

    setFait({ nom: aConfirmer.clientNom, montant: resultat.montantRestitue });
    fermer();
    setTourLocal((t) => t + 1);
    onEcriture();
  }

  /** La règle de la commission, dite une fois, dans le dépli. */
  function phraseCommission(carte: CarteCloturable): string {
    const n = carte.misesEncaissees;
    if (n === 0) return 'Aucune mise encaissée : rien à rendre, rien à garder.';
    return `${n} mise${pluriel(n)} encaissée${pluriel(n)}, moins la première, ${
      estCollaborateur ? 'qui revient à ton titulaire' : 'qui est ta commission'
    } (${formatMontant(carte.mise)} FCFA).`;
  }

  function ligne(carte: CarteCloturable, rang: number) {
    const deplie = ouverte === carte.carteId;
    const retraitBloque = retraitBloquePour(carte.carteId);
    const enConfirmation = aConfirmer?.carteId === carte.carteId;
    /** Le lien du bouton éteint à sa raison. Dérivé de la carte et non de
        `useId` : cette fonction rend une ligne par carte, un crochet n'y a pas sa
        place. Une seule ligne est dépliée à la fois, donc l'`id` est unique. */
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

            {!enConfirmation ? (
              <div className="flex flex-wrap gap-2">
                {/* Deux portes, et elles se valent : rendre l'argent, ou le
                    laisser et repartir sur une carte de plus. Le collecteur est
                    devant le client quand celui-ci choisit — la seconde ne peut
                    pas être deux écrans plus loin.

                    La seconde n'apparaît que sur une carte terminée. Sur une
                    carte en cours, elle prélèverait une commission — la
                    première mise du nouveau cycle — que personne n'a demandée. */}
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
                  <p
                    id={idRaison}
                    className="m-0 basis-full font-body text-xs text-muted-foreground"
                  >
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
            ) : (
              <div className="space-y-2">
                {/* Les deux faits, et pas un seul : ce qu'on rend, et ce que la
                    carte devient. */}
                <p className="rounded-md bg-info-tint p-3 font-body text-sm text-ink">
                  Confirmer le retrait de <strong>{formatMontant(carte.restituable)} FCFA</strong>{' '}
                  pour {carte.clientNom} ? La carte se clôture, c’est définitif.
                </p>
                <div className="flex gap-2">
                  <Bouton
                    onClick={confirmer}
                    disabled={envoi || retraitBloque !== null}
                    decritPar={retraitBloque ? idRaison : undefined}
                  >
                    {envoi ? 'Retrait…' : 'Oui, faire le retrait'}
                  </Bouton>
                  <Bouton variante="contour" onClick={() => setAConfirmer(null)} disabled={envoi}>
                    Annuler
                  </Bouton>
                </div>
                {retraitBloque && (
                  <p id={idRaison} className="m-0 font-body text-xs text-muted-foreground">
                    {retraitBloque}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </li>
    );
  }

  if (fait) {
    return (
      <div className="flex-1 flex flex-col">
        <EnTeteEcran titre="Retrait" sousTitre="Carte clôturée" onRetour={onRetour} />
        <CorpsEcran
          enfants={
            <Carte className="p-5 border-positive">
              <div className="flex items-center gap-2 mb-3">
                <Icone nom="check-circle" taille={20} className="text-positive" />
                <p className="font-headings font-bold text-lg text-ink">Carte clôturée</p>
              </div>
              <p className="font-body text-sm text-muted-foreground mb-4">
                Remets <strong className="text-ink">{formatMontant(fait.montant)} FCFA</strong> à{' '}
                {fait.nom}, en main propre. Le retrait est déjà inscrit au journal : il ne peut
                plus être défait.
              </p>
              <Bouton onClick={() => setFait(null)}>Retour aux cartes</Bouton>
            </Carte>
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
    </div>
  );
}
