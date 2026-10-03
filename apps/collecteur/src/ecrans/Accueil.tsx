import { formatMontant } from '@kolek/core';
import {
  Avatar,
  BandeauHorsLigne,
  Bouton,
  Carte,
  CarteCollecte,
  Onde,
  Outils,
  Rosace,
  Squelette,
  useEnLigne,
  type Outil,
} from '@kolek/ui';
import { useEffect, useState } from 'react';

import { useDonnees } from '../cache';
import type { CarteChoisie, Page } from '../Coquille';
import { useHorsLigne } from '../hors-ligne/useHorsLigne';
import { phraseAttenteLongue } from '../hors-ligne/vues';
import { chargerTableauCollecteur } from '../lectures';
import { usePremierRendu } from '../premier-rendu';
import { useEstTitulaire } from './commission';

/**
 * L'avertissement du stockage non garanti se dit une fois par lancement (spec
 * J2b §8.7). Répété à chaque retour sur l'accueil, il deviendrait un décor
 * qu'on ne lit plus ; `Plus` le garde en permanence pour qui le cherche.
 */
let stockageDejaSignale = false;

/**
 * Écran d'accueil du collecteur, dans le dessin du billet (2026-10-02).
 *
 * ## Ce qu'il montre, dans l'ordre
 *
 * L'en-tête sombre de la vitrine — la nuit d'un coffre, la rosace en
 * filigrane, l'onde en pied — porte la journée : le total encaissé, le nombre
 * de mises qui le font, et trois chiffres de référence en relevé. La carte à
 * finir en premier vient se poser dessus, avec ses deux commandes. Puis les
 * messages de la file, puis les outils.
 *
 * Ce qu'on fait avant ce qu'on a fait : l'historique est dans « Reçus ».
 *
 * ## Ce qui en est parti
 *
 * Les neuf tuiles pastel (`ActionsRapides`), les trois chiffres en trois cases
 * égales, la rosace qui tournait sans rien dire, et le bouton de déconnexion :
 * il vit dans le profil, où l'avatar mène.
 *
 * ## Ce qui ne change pas
 *
 * Tout vient de la tournée du téléphone, et ce qui n'est pas calculable n'est
 * pas affiché. L'écran a porté les chiffres de la maquette ; depuis que le
 * collecteur encaisse pour de vrai, un montant inventé ici est un montant
 * qu'il peut prendre pour sa recette du jour.
 */
export function Accueil({
  nomCollecteur,
  revision,
  onNaviguer,
  onSouscrire,
  onEncaisser,
  onOuvrirFiche,
}: {
  nomCollecteur: string | null;
  revision: number;
  onNaviguer: (cle: Page) => void;
  onSouscrire: () => void;
  /** Encaisser sur la carte affichée, sans passer par la liste. */
  onEncaisser: (carte: CarteChoisie) => void;
  /** Ouvrir la fiche du client de la carte affichée. */
  onOuvrirFiche: (clientId: string) => void;
}) {
  const enLigne = useEnLigne();
  const estTitulaire = useEstTitulaire();
  const { file, stockage } = useHorsLigne();
  const attenteLongue = phraseAttenteLongue(file, Date.now());
  const refusees = file?.refusees ?? 0;
  const [avisStockage, setAvisStockage] = useState(false);

  useEffect(() => {
    if (stockage !== 'non_garanti' || stockageDejaSignale) return;
    stockageDejaSignale = true;
    setAvisStockage(true);
  }, [stockage]);

  const { donnees: tableau, erreur } = useDonnees('accueil', chargerTableauCollecteur, {
    revision,
    messageErreur:
      'Chiffres indisponibles sur ce téléphone. Connecte-toi une fois au réseau pour charger ta tournée.',
  });

  const carteDuJour = tableau?.carteDuJour ?? null;
  const premier = usePremierRendu();
  const nom = nomCollecteur ?? 'Collecteur';
  const chiffre = (valeur: number | undefined) => (tableau ? formatMontant(valeur ?? 0) : '—');
  // Les cartes qui ont encore une case à payer : le « en cours » du retrait.
  // Les pleines n'y sont pas, comme elles ne sont pas dans la carte à finir.
  const enCours = tableau?.cartesEnCours ?? 0;
  const s = (n: number) => (n > 1 ? 's' : '');

  const outils: Outil[] = [
    { icone: 'user-plus', libelle: 'Souscrire', onActiver: onSouscrire },
    { icone: 'arrow-up-right', libelle: 'Retrait', onActiver: () => onNaviguer('retrait') },
    { icone: 'scale', libelle: 'Rapprochement', onActiver: () => onNaviguer('rapprochement') },
    { icone: 'receipt-text', libelle: 'Reçus', onActiver: () => onNaviguer('recus') },
    { icone: 'bell', libelle: 'Alertes', onActiver: () => onNaviguer('alertes') },
    { icone: 'message-square', libelle: 'Avis', onActiver: () => onNaviguer('avis') },
    // Seul le titulaire d'un palier illimité a une équipe : pour les autres,
    // l'outil mènerait à un écran vide.
    ...(estTitulaire
      ? [{ icone: 'users' as const, libelle: 'Équipe', onActiver: () => onNaviguer('equipe') }]
      : []),
    { icone: 'more-horizontal', libelle: 'Plus', onActiver: () => onNaviguer('plus') },
  ];

  const releve: Array<[string, string]> = [
    ['Clients', tableau ? String(tableau.clients) : '—'],
    ['Cartes actives', tableau ? String(tableau.cartesActives) : '—'],
    ['Encours, FCFA', chiffre(tableau?.encoursTotal)],
  ];

  return (
    <div className="anim-entree flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-large">
      <header className="relative overflow-hidden bg-[image:var(--degrade-hero)] px-marge pb-16 pt-entete lg:rounded-xl lg:pt-6">
        {/* La gravure, en or : la seule place de l'or dans cet écran. La rosace
            ne tourne plus — un filigrane qui bouge n'en est plus un. */}
        <Rosace
          petales={22}
          excentricite={0.38}
          className="pointer-events-none absolute -right-24 -top-10 w-72 text-or/15"
        />
        <Onde
          lignes={10}
          traitFixe
          className="pointer-events-none absolute inset-x-0 bottom-10 h-6 w-full text-or/25"
        />

        <div className="relative z-10 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate font-headings text-2xl font-bold tracking-tight text-white">
            {nom}
          </p>
          {/* 44 px, la cible tactile minimale du Design System : le bouton prend la
              taille de l'avatar qu'il enveloppe. */}
          <button
            type="button"
            onClick={() => onNaviguer('profil')}
            aria-label="Ouvrir mon profil"
            className="anim-pression shrink-0 cursor-pointer rounded-pill"
          >
            <Avatar nom={nom} className="h-11 w-11 ring-2 ring-white/25" />
          </button>
        </div>

        <p className="relative z-10 mt-6 font-body text-sm text-white/70">
          Encaissé aujourd’hui
          {tableau && (
            <>
              {' · '}
              <span className="font-mono">{tableau.misesAujourdhui}</span> mise
              {s(tableau.misesAujourdhui)}
            </>
          )}
        </p>
        <p className="anim-montant relative z-10 mt-2 font-headings text-4xl font-bold leading-none tracking-tight text-white tabular-nums xs:text-total">
          {chiffre(tableau?.encaisseAujourdhui)}{' '}
          <span className="font-body text-base font-medium tracking-normal text-white/70">FCFA</span>
        </p>

        {/* Le relevé : trois chiffres de référence, alignés à gauche, séparés
            par des filets. Plus trois cases égales : elles faisaient lire trois
            fois la même importance à trois chiffres qui n'en ont pas. */}
        <dl className="relative z-10 mt-5 flex border-t border-white/15 pt-3">
          {releve.map(([terme, valeur], rang) => (
            <div
              key={terme}
              className={`flex min-w-0 flex-col-reverse ${rang > 0 ? 'ml-3.5 border-l border-white/15 pl-3.5' : ''}`}
            >
              <dt className="mt-0.5 font-body text-xs text-white/60">{terme}</dt>
              <dd className="truncate font-mono text-base font-medium text-white tabular-nums">
                {valeur}
              </dd>
            </div>
          ))}
        </dl>

        {/* Toujours rendu : il se tait seul quand la file est vide et le réseau
            là (§8.2). */}
        <BandeauHorsLigne enLigne={enLigne} compte={file} className="relative z-10 mt-4" />
      </header>

      <div className="relative z-20 mx-4 -mt-12 lg:mx-0">
        {carteDuJour ? (
          <CarteCollecte
            nomClient={carteDuJour.nom}
            misePar={formatMontant(carteDuJour.mise)}
            jourCourant={carteDuJour.misesEncaissees}
            solde={formatMontant(carteDuJour.solde)}
            surtitre={
              <div className="flex items-baseline justify-between gap-3">
                {/* Le compte est en Plex Mono comme tout nombre qu'on compte ;
                    `font-medium` parce que la phrase est en semi-gras et que seul
                    le 500 de Plex Mono est livré. */}
                <p className="min-w-0 font-body text-xs font-semibold text-muted-foreground">
                  À finir en premier · la plus avancée de tes{' '}
                  <span className="font-mono font-medium">{enCours}</span> carte{s(enCours)} en
                  cours
                </p>
                <button
                  type="button"
                  onClick={() => onNaviguer('clients')}
                  className="shrink-0 cursor-pointer font-body text-xs font-semibold text-primary underline underline-offset-2"
                >
                  Toutes les cartes
                </button>
              </div>
            }
            action={
              <div className="flex gap-2">
                {/* Le montant seul est en Plex Mono, comme tout nombre qu'on compte ;
                    le mot reste en Instrument Sans. `font-medium` : seul le 500 de
                    Plex Mono est livré, et le bouton est en semi-gras. */}
                <Bouton
                  icone="banknote"
                  className="flex-1"
                  nomAccessible={`Encaisser ${formatMontant(carteDuJour.mise)} FCFA sur la carte de ${carteDuJour.nom}`}
                  onClick={() =>
                    onEncaisser({
                      carteId: carteDuJour.carteId,
                      clientNom: carteDuJour.nom,
                      mise: carteDuJour.mise,
                      misesEncaissees: carteDuJour.misesEncaissees,
                    })
                  }
                >
                  {/* Un seul span : `Bouton` est un conteneur flex, et des morceaux
                      frères y deviendraient des éléments séparés, insécables. */}
                  <span>
                    Encaisser{' '}
                    <span className="font-mono font-medium">{formatMontant(carteDuJour.mise)}</span>
                  </span>
                </Bouton>
                <Bouton
                  variante="contour"
                  nomAccessible={`Ouvrir la fiche de ${carteDuJour.nom}`}
                  onClick={() => onOuvrirFiche(carteDuJour.clientId)}
                >
                  Fiche
                </Bouton>
              </div>
            }
          />
        ) : !tableau ? (
          <Carte className="space-y-3 p-5">
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
        ) : tableau.cartesActives > 0 ? (
          // Des cartes actives, mais aucune avec une case à payer : toutes sont
          // pleines. « Aucune carte active » serait faux, il reste de l'argent à
          // rendre ; la place dit où aller.
          <Carte className="p-4">
            <p className="m-0 font-body text-base text-ink">
              Toutes tes cartes actives sont pleines.
            </p>
            <p className="mt-1 font-body text-sm text-muted-foreground">
              Rends leur solde par le retrait, ou ouvre une carte de plus.
            </p>
            <Bouton
              variante="contour"
              icone="arrow-up-right"
              className="mt-3"
              onClick={() => onNaviguer('retrait')}
            >
              Aller au retrait
            </Bouton>
          </Carte>
        ) : (
          <Carte className="p-4">
            <p className="m-0 font-body text-base text-ink">Aucune carte active.</p>
            <p className="mt-1 font-body text-sm text-muted-foreground">
              Inscris un client pour ouvrir sa première carte.
            </p>
          </Carte>
        )}
      </div>

      {erreur && (
        <p role="alert" className="mx-4 mt-3 font-body text-sm text-negative">
          {erreur}
        </p>
      )}

      {/* Ce que la file demande au collecteur. Rien ici ne bloque un geste : un
          refus se lit dans les alertes, l'attente longue et le stockage se
          règlent en retrouvant du réseau (spec J2b §8.4, §8.7, §8.8). */}
      {(attenteLongue || refusees > 0 || avisStockage) && (
        <div className="mx-4 mt-3 space-y-2">
          {attenteLongue && (
            <p role="alert" className="rounded-md bg-negative-tint p-3 font-body text-sm text-negative">
              {attenteLongue}
            </p>
          )}
          {refusees > 0 && (
            <button
              type="button"
              onClick={() => onNaviguer('alertes')}
              className="anim-pression w-full cursor-pointer rounded-md border border-negative bg-surface p-3 text-left font-body text-sm font-medium text-negative"
            >
              {`${refusees} opération${s(refusees)} refusée${s(refusees)}, à voir`}
            </button>
          )}
          {avisStockage && (
            <p className="rounded-md bg-info-tint p-3 font-body text-sm text-info">
              Ce téléphone peut effacer les données de Kolek s’il manque de place. Garde
              l’application installée et envoie dès que possible.
            </p>
          )}
        </div>
      )}

      <section aria-labelledby="titre-outils" className="mx-4 mt-6 lg:mx-0">
        <h2 id="titre-outils" className="mb-3 font-headings text-xl font-bold text-ink">
          Outils
        </h2>
        <Outils outils={outils} anime={premier} />
      </section>

      <div className="min-h-6 flex-1" />
    </div>
  );
}
