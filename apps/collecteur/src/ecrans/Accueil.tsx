import { formatMontant } from '@kolek/core';
import {
  ActionsCarte,
  ActionsRapides,
  Avatar,
  BandeauHorsLigne,
  Carte,
  CarteCollecte,
  EnteteSection,
  Icone,
  LienBloc,
  LigneTransaction,
  Rosace,
  Squelette,
  SqueletteKPI,
  SqueletteLigne,
  useEnLigne,
  type ActionRapide,
} from '@kolek/ui';

import { useDonnees } from '../cache';
import type { CarteChoisie, Page } from '../Coquille';
import { chargerTableauCollecteur } from '../lectures';
import { usePremierRendu } from '../premier-rendu';
import { useEstTitulaire } from './commission';

/**
 * Écran d'accueil du collecteur.
 *
 * Il a porté les chiffres de la maquette — « 48 500 FCFA encaissés
 * aujourd'hui », « +8 % vs hier », « Mariam Koné, jour 18/31 » — au motif qu'un
 * écran de zéros serait « moins informatif qu'une maquette assumée ». L'argument
 * tenait tant que rien ne s'écrivait en base. Depuis que le collecteur encaisse
 * pour de vrai, un montant inventé sur cet écran est un montant qu'il peut
 * prendre pour sa recette du jour, et confronter à sa caisse le soir.
 *
 * Tout vient donc de la base, et ce qui n'est pas calculable a disparu : la
 * comparaison « vs hier » demanderait de retenir le total d'hier, que rien
 * n'enregistre. Les colonnes « Visités » et « Retards » aussi — la première
 * suppose une tournée planifiée, la seconde un rythme attendu, et ni l'une ni
 * l'autre n'existe dans le schéma.
 */
export function Accueil({
  nomCollecteur,
  revision,
  onNaviguer,
  onSouscrire,
  onEncaisser,
  onOuvrirFiche,
  onDeconnexion,
}: {
  nomCollecteur: string | null;
  revision: number;
  onNaviguer: (cle: Page) => void;
  onSouscrire: () => void;
  /** Encaisser sur la carte affichée, sans passer par la liste. */
  onEncaisser: (carte: CarteChoisie) => void;
  /** Ouvrir la fiche du client de la carte affichée. */
  onOuvrirFiche: (clientId: string) => void;
  onDeconnexion: () => void;
}) {
  const enLigne = useEnLigne();
  const estTitulaire = useEstTitulaire();
  const { donnees: tableau, erreur } = useDonnees('accueil', chargerTableauCollecteur, {
    revision,
    messageErreur: 'Chiffres indisponibles. Vérifie le réseau.',
  });

  /** Extraite une fois : les commandes posées sous la carte s'y réfèrent
      quatre fois, et `tableau?.carteDuJour!` à chaque ligne se lirait comme
      une supposition, alors que c'est la condition d'affichage du bloc. */
  const carteDuJour = tableau?.carteDuJour ?? null;

  // Les huit mènent quelque part depuis le 2026-08-20. Six étaient grises,
  // faute d'écran derrière : `ActionsRapides` désactive toute action sans
  // `onActiver`, ce qui était honnête tant que rien n'existait, mais illisible
  // pour qui n'a pas lu le code — six pastilles éteintes se lisent comme une
  // application cassée, pas comme une application en cours de construction.
  const actions: ActionRapide[] = [
    { icone: 'circle-dollar-sign', libelle: 'Encaisser', onActiver: () => onNaviguer('clients') },
    { icone: 'user-plus', libelle: 'Souscrire', onActiver: onSouscrire },
    { icone: 'arrow-up-right', libelle: 'Retrait', onActiver: () => onNaviguer('retrait') },
    { icone: 'bar-chart-2', libelle: 'Bilan', onActiver: () => onNaviguer('bilans') },
    { icone: 'refresh-cw', libelle: 'Rapproch.', onActiver: () => onNaviguer('rapprochement') },
    { icone: 'receipt', libelle: 'Reçus', onActiver: () => onNaviguer('recus') },
    { icone: 'bell', libelle: 'Alertes', onActiver: () => onNaviguer('alertes') },
    { icone: 'message-square', libelle: 'Avis', onActiver: () => onNaviguer('avis') },
    // Seulement pour un titulaire. Montrer la porte à un collaborateur le
    // mènerait sur un écran définitivement vide — `equipe_vue()` ne lui rendra
    // jamais rien — et lui ferait croire à une panne.
    ...(estTitulaire
      ? [
          {
            icone: 'users' as const,
            libelle: 'Équipe',
            onActiver: () => onNaviguer('equipe'),
          },
        ]
      : []),
    { icone: 'more-horizontal', libelle: 'Plus', onActiver: () => onNaviguer('plus') },
  ];

  // Voir `Recus` : l'escalier ne rejoue pas quand l'écran se relit après une
  // écriture. Un menu qui clignote à chaque mise encaissée est une distraction
  // au pire moment.
  const premier = usePremierRendu();

  const nom = nomCollecteur ?? 'Collecteur';
  const chiffre = (valeur: number | undefined) =>
    tableau ? formatMontant(valeur ?? 0) : '—';

  return (
    <div className="anim-entree flex-1 flex flex-col lg:mx-auto lg:w-full lg:max-w-large">
      {/* En-tête sombre immersif */}
      <div className="relative overflow-hidden bg-[image:var(--degrade-hero)] px-marge pt-entete pb-7 shadow-lg lg:rounded-3xl lg:pt-6">
        {/* Rosace décorative en filigrane */}
        <Rosace
          petales={18}
          excentricite={0.35}
          animee
          className="pointer-events-none absolute -right-[15%] -top-[20%] w-[65vmin] text-or/10 lg:w-96"
        />

        <div className="relative z-10 flex items-center justify-between mb-5">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-white/10 text-white/70 text-xs font-body font-medium mb-1 backdrop-blur-xs">
              <span className="w-1.5 h-1.5 rounded-pill bg-chart-mint" />
              Collecteur actif
            </span>
            <p className="text-white font-headings font-bold text-2xl truncate tracking-tight">{nom}</p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onDeconnexion}
              aria-label="Se déconnecter"
              className="anim-pression w-10 h-10 rounded-pill bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-md flex items-center justify-center cursor-pointer transition-colors shadow-xs"
            >
              <Icone nom="log-out" className="text-white" taille={18} />
            </button>
            <Avatar nom={nom} className="w-10 h-10 ring-2 ring-white/25 shadow-xs" />
          </div>
        </div>

        <div className="relative z-10 mb-2">
          <p className="text-white/70 text-xs font-body font-medium uppercase tracking-wider mb-1">
            Encaissé aujourd’hui
          </p>
          <p className="anim-montant font-headings font-bold text-white text-3xl xs:text-4xl leading-[1.1] tabular-nums tracking-tight">
            {chiffre(tableau?.encaisseAujourdhui)}{' '}
            <span className="text-sm xs:text-base font-body font-semibold px-2 py-0.5 rounded-md bg-white/15 text-white/90 backdrop-blur-xs ml-1 border border-white/15 align-middle">
              FCFA
            </span>
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-white/60 text-xs font-body">
          <span className="inline-flex items-center gap-1">
            <Icone nom="check-circle" taille={14} className="text-chart-mint" />
            {tableau ? `${tableau.cartesActives} carte${tableau.cartesActives > 1 ? 's' : ''} active${tableau.cartesActives > 1 ? 's' : ''}` : 'Chargement…'}
          </span>
        </div>

        {!enLigne && <BandeauHorsLigne className="mt-4 relative z-10" />}
      </div>

      {/* Résumé du jour — trois indicateurs avec badges d'icônes */}
      <div className="mx-4 -mt-5 relative z-20 bg-surface rounded-2xl border border-hairline/80 p-3.5 xs:p-4 grid grid-cols-3 gap-2 xs:gap-3 shadow-md backdrop-blur-xs">
        <div className="text-center min-w-0">
          <div className="flex items-center justify-center gap-1 mb-1 text-muted-foreground">
            <Icone nom="users" taille={13} />
            <span className="text-[11px] font-body font-medium">Clients</span>
          </div>
          {tableau ? (
            <p className="font-headings font-bold text-xl text-ink tabular-nums tracking-tight">
              {tableau.clients}
            </p>
          ) : (
            <SqueletteKPI />
          )}
        </div>

        <div className="text-center border-x border-hairline min-w-0">
          <div className="flex items-center justify-center gap-1 mb-1 text-muted-foreground">
            <Icone nom="circle-dollar-sign" taille={13} className="text-accent" />
            <span className="text-[11px] font-body font-medium">Actives</span>
          </div>
          {tableau ? (
            <p className="font-headings font-bold text-xl text-ink tabular-nums tracking-tight">
              {tableau.cartesActives}
            </p>
          ) : (
            <SqueletteKPI />
          )}
        </div>

        <div className="text-center min-w-0">
          <div className="flex items-center justify-center gap-1 mb-1 text-muted-foreground">
            <Icone nom="bar-chart-2" taille={13} className="text-info" />
            <span className="text-[11px] font-body font-medium">Encours</span>
          </div>
          {tableau ? (
            <p className="font-headings font-bold text-base xs:text-lg text-ink tabular-nums tracking-tight truncate">
              {chiffre(tableau.encoursTotal)}
            </p>
          ) : (
            <SqueletteKPI />
          )}
        </div>
      </div>

      {erreur && (
        <p role="alert" className="mx-4 mt-3 text-sm font-body text-negative">
          {erreur}
        </p>
      )}

      {/* Sur écran large, la carte et l'historique se lisent côte à côte :
          c'est la comparaison que fait le collecteur en préparant sa tournée. */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
      <div className="mx-4 mt-5 lg:mx-0">
        {/*
          « Carte du jour », au singulier, se lisait comme *la* carte du compte.
          Un collecteur a signalé le 2026-08-23 croire que son compte
          appartenait au client affiché, les autres n'étant que des noms en bas
          d'écran.

          Le calcul était juste — c'est la carte active la plus avancée, celle
          dont le cycle de 31 mises se termine en premier. Le libellé, lui, ne
          le disait pas. Un titre qui laisse deviner ce qu'il montre finit
          toujours par être mal deviné.
        */}
        <EnteteSection
          titre="La carte à finir en premier"
          className="mb-1"
          action={<LienBloc libelle="Toutes les cartes" onActiver={() => onNaviguer('clients')} />}
        />
        {tableau && tableau.cartesActives > 0 && (
          <p className="text-xs font-body text-muted-foreground mb-2">
            La plus avancée de tes {tableau.cartesActives} carte
            {tableau.cartesActives > 1 ? 's' : ''} active
            {tableau.cartesActives > 1 ? 's' : ''}.
          </p>
        )}
        {carteDuJour ? (
          <>
            <CarteCollecte
              nomClient={carteDuJour.nom}
              misePar={formatMontant(carteDuJour.mise)}
              jourCourant={carteDuJour.misesEncaissees}
              solde={formatMontant(carteDuJour.solde)}
              cycle="1"
            />
            {/* Deux commandes, et elles portent sur la carte au-dessus.
                Renvoyer vers un écran — « Encaisser » vers la liste des clients
                — obligeait à y retrouver à la main le client qu'on venait de
                lire, dans une liste triée autrement. Un bouton posé sous une
                carte agit sur cette carte, ou n'a rien à y faire.

                Pas de « Retrait » ici, malgré la maquette : rendre son argent à
                un client est rare, définitif, et se décide devant sa fiche —
                ses cartes, ses versements, son cycle. L'accueil montre la carte
                la plus avancée, pas le dossier. */}
            <div className="mt-3">
              <ActionsCarte
                actions={[
                  {
                    icone: 'circle-dollar-sign',
                    libelle: 'Encaisser',
                    description: `Encaisser sur la carte de ${carteDuJour.nom}`,
                    onActiver: () =>
                      onEncaisser({
                        carteId: carteDuJour.carteId,
                        clientNom: carteDuJour.nom,
                        mise: carteDuJour.mise,
                        misesEncaissees: carteDuJour.misesEncaissees,
                      }),
                  },
                  {
                    icone: 'user',
                    libelle: 'Fiche',
                    description: `Ouvrir la fiche de ${carteDuJour.nom}`,
                    onActiver: () => onOuvrirFiche(carteDuJour.clientId),
                  },
                ]}
              />
            </div>
          </>
        ) : !tableau ? (
          <Carte className="p-5 space-y-3">
            <div className="flex justify-between">
              <Squelette hauteur="h-5" largeur="w-24" />
              <Squelette hauteur="h-5" largeur="w-20" />
            </div>
            <Squelette hauteur="h-10" largeur="w-full" />
            <div className="flex justify-between pt-2">
              <Squelette hauteur="h-6" largeur="w-32" />
              <Squelette hauteur="h-4" largeur="w-16" />
            </div>
          </Carte>
        ) : (
          <Carte className="p-4">
            <p className="text-base font-body text-ink m-0">
              Aucune carte active.
            </p>
            <p className="text-sm font-body text-muted-foreground mt-1">
              Inscris un client pour ouvrir sa première carte.
            </p>
          </Carte>
        )}
      </div>

      <div className="mx-4 mt-5 lg:mx-0">
        <EnteteSection
          titre="Dernières mises"
          className="mb-2"
          action={<LienBloc libelle="Tout voir" onActiver={() => onNaviguer('clients')} />}
        />
        <Carte className="overflow-hidden">
          {!tableau ? (
            <div className="divide-y divide-hairline">
              <SqueletteLigne />
              <SqueletteLigne />
              <SqueletteLigne />
            </div>
          ) : tableau.dernieres.length === 0 ? (
            <p className="px-4 py-5 text-base font-body text-muted-foreground m-0">
              Aucune mise encaissée pour l’instant.
            </p>
          ) : (
            tableau.dernieres.map((ligne, i) => (
              <LigneTransaction
                key={`${ligne.quand}-${i}`}
                nom={ligne.nom}
                meta={`${new Date(ligne.quand).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })} · ${ligne.estCommission ? 'Commission' : 'Mise'}`}
                montant={`+${formatMontant(ligne.montant)}`}
                type={ligne.estCommission ? 'neutre' : 'positive'}
                derniere={i === tableau.dernieres.length - 1}
              />
            ))
          )}
        </Carte>
      </div>

      </div>

      {/*
        Les actions passent sous la carte du jour le 2026-08-24, à la demande
        du collecteur qui utilise l'application.

        L'ordre d'un écran d'accueil dit ce qu'on vient y chercher. Neuf
        pastilles en tête repoussaient sous la ligne de flottaison la seule
        information qui change d'heure en heure : quelle carte finit en premier,
        et ce qui vient d'être encaissé. Le collecteur ouvrait donc son
        application sur un menu, pas sur son travail.

        En bas, les actions redeviennent ce qu'elles sont — un point de départ
        vers les autres écrans, consulté une fois qu'on a lu l'essentiel. Elles
        gagnent au passage un fond de carte : posées à même le canevas, neuf
        pastilles alignées se lisaient comme un débordement de l'écran
        précédent plutôt que comme un bloc.
      */}
      <div className="mx-4 mt-6 lg:mx-0">
        <Carte className="p-4 sm:p-5">
          <EnteteSection titre="Actions" className="mb-1" />
          <p className="text-xs font-body text-muted-foreground mb-4">
            Tout ce que tu peux faire depuis ici.
          </p>
          <ActionsRapides actions={actions} anime={premier} />
        </Carte>
      </div>

      <div className="flex-1 min-h-6" />
    </div>
  );
}
