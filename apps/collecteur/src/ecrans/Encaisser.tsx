import { formatMontant, MISES_PAR_CYCLE, soldeRestituable } from '@kolek/core';
import {
  Avatar,
  BandeauHorsLigne,
  Bouton,
  Carte,
  CarteCollecte,
  Icone,
  useEnLigne,
  type CleNavCollecteur,
} from '@kolek/ui';
import { useState } from 'react';

import type { CarteChoisie } from '../Coquille';
import { enregistrerMise } from '../ecritures';
import { useHorsLigne } from '../hors-ligne/useHorsLigne';

/**
 * Encaissement d'une mise.
 *
 * Cet écran a longtemps porté un bouton désactivé et un avertissement : « un
 * bouton *Confirmer* qui n'écrit rien en base est le pire mensonge que puisse
 * faire cette application — le collecteur repart en pensant la mise encaissée ».
 * Le bouton écrit maintenant.
 *
 * Deux choix qui en découlent.
 *
 * **Le montant n'est pas libre.** Il est celui de la carte, et rien d'autre :
 * le déclencheur `mises_avant_insert` refuse toute mise dont le montant diffère
 * de `cartes.mise`. Proposer un clavier libre laisserait saisir 2 000 sur une
 * carte à 1 000, pour se voir refuser après coup. Le montant s'affiche, il ne
 * se saisit pas.
 *
 * **Le champ « Note » a disparu.** `mises` n'a pas de colonne pour le recevoir.
 * Un champ qui accepte du texte et le jette est de la même famille que le
 * bouton qui n'écrivait rien.
 */
export function Encaisser({
  collecteurId,
  carte,
  onNaviguer,
  onEncaisse,
}: {
  collecteurId: string | null;
  carte: CarteChoisie | null;
  onNaviguer: (cle: CleNavCollecteur) => void;
  onEncaisse: () => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const enLigne = useEnLigne();
  const { file } = useHorsLigne();

  async function confirmer() {
    if (!carte || !collecteurId || envoi) return;
    setEnvoi(true);
    setErreur(null);
    setSucces(null);

    const resultat = await enregistrerMise(collecteurId, carte.carteId, carte.mise);

    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.echec.message);
      return;
    }
    setSucces(`Mise de ${formatMontant(carte.mise)} FCFA enregistrée pour ${carte.clientNom}.`);
    onEncaisse();
  }

  return (
    <div className="anim-entree flex-1 flex flex-col lg:mx-auto lg:w-full lg:max-w-liste">
      {/* En-tête avec dégradé subtil */}
      <div className="bg-[image:var(--degrade-hero)] px-marge pt-entete pb-5 lg:rounded-xl lg:pt-6 shadow-md">
        <div className="flex items-center justify-between mb-1">
          <button
            type="button"
            onClick={() => onNaviguer('clients')}
            aria-label="Revenir aux clients"
            className="anim-pression w-10 h-10 rounded-pill bg-white/10 border border-white/15 flex items-center justify-center cursor-pointer"
          >
            <Icone nom="arrow-left" className="text-white" taille={18} />
          </button>
          <p className="font-headings font-bold text-white text-lg tracking-tight">Encaisser une mise</p>
          <div className="w-10" />
        </div>
      </div>

      <BandeauHorsLigne enLigne={enLigne} compte={file} className="mx-4 mt-3" />

      {!carte ? (
        // On arrive ici par l'onglet du bas, sans être passé par la liste. Dire
        // quoi faire plutôt que d'afficher un formulaire sans destinataire.
        <Carte className="mx-4 mt-6 p-6 text-center shadow-md">
          <div className="w-14 h-14 rounded-pill bg-secondary mx-auto mb-3 flex items-center justify-center text-primary">
            <Icone nom="circle-dollar-sign" taille={26} />
          </div>
          <p className="font-headings font-bold text-lg text-ink m-0">Aucune carte choisie</p>
          <p className="text-sm font-body text-muted-foreground mt-1 mb-5 max-w-xs mx-auto">
            Ouvre la liste de tes clients et touche « Encaisser » sur la carte concernée.
          </p>
          <Bouton pleineLargeur onClick={() => onNaviguer('clients')}>
            Voir mes clients
          </Bouton>
        </Carte>
      ) : (
        <>
          {/* Client */}
          <div className="mx-4 mt-4 bg-surface rounded-lg border border-hairline/80 p-4 flex items-center gap-3.5 shadow-sm">
            <Avatar nom={carte.clientNom} className="w-12 h-12 ring-2 ring-hairline" />
            <div className="flex-1 min-w-0">
              <p className="font-headings font-bold text-lg text-ink truncate leading-tight">
                {carte.clientNom}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-body font-medium text-muted-foreground">
                  Jour {carte.misesEncaissees}/{MISES_PAR_CYCLE}
                </span>
                <span className="text-xs font-body font-semibold text-accent">
                  Cycle 1
                </span>
              </div>
            </div>
          </div>

          <div className="mx-4 mt-3.5">
            <CarteCollecte
              nomClient={carte.clientNom}
              misePar={formatMontant(carte.mise)}
              jourCourant={carte.misesEncaissees}
              solde={formatMontant(soldeRestituable(carte.misesEncaissees, carte.mise))}
              cycle="1"
            />
          </div>

          {/* Montant — imposé par la carte */}
          <div className="mx-4 mt-4">
            <p className="text-xs font-body font-semibold text-muted-foreground mb-1.5 px-0.5">
              Montant de la mise
            </p>
            <div className="flex items-baseline justify-between bg-surface border border-hairline/80 rounded-xl px-5 py-3.5 shadow-xs">
              <span className="font-headings font-bold text-3xl xs:text-4xl text-ink tabular-nums tracking-tight">
                {formatMontant(carte.mise)}
              </span>
              <span className="text-sm font-body font-bold text-accent px-2.5 py-1 rounded-md bg-secondary">
                FCFA
              </span>
            </div>
            <p className="text-xs font-body text-muted-foreground mt-1.5 px-0.5">
              Fixé à l’ouverture du carnet. Ne peut être altéré.
            </p>
          </div>

          <div className="flex-1 min-h-6" />

          {erreur && (
            <p role="alert" className="mx-4 mb-3 rounded-xl bg-negative-tint/80 border border-negative/20 p-3.5 text-sm font-body font-medium text-negative">
              {erreur}
            </p>
          )}

          {/* Le moment signature du produit */}
          {succes && (
            <div
              role="status"
              className="anim-reussite mx-4 mb-4 rounded-lg bg-positive-tint border border-positive/30 p-4 flex items-center gap-3 shadow-md"
            >
              <div className="w-10 h-10 rounded-pill bg-positive text-white flex items-center justify-center shrink-0 shadow-xs">
                <Icone nom="check-circle" taille={22} />
              </div>
              <p className="text-sm font-body font-semibold text-positive flex-1">
                {succes}
              </p>
            </div>
          )}

          {/* Bouton de confirmation signature */}
          <div className="mx-4 mb-5">
            <button
              type="button"
              onClick={confirmer}
              disabled={
                envoi ||
                succes !== null ||
                collecteurId === null ||
                carte.misesEncaissees >= MISES_PAR_CYCLE
              }
              /*
                Aplat, depuis le 2026-09-17.

                Il portait un dégradé horizontal qui permutait ses deux bornes
                au survol. Sur le téléphone où ce bouton est pressé trente fois
                par jour, le survol n'arrive jamais ; sur le bureau, il donnait
                un clignotement de couleur qui n'apprenait rien. C'est le geste
                qui fait vivre Kolek, et il portait le tic visuel le plus daté
                du produit.

                Ce qui le distingue de tous les autres boutons reste, et il est
                mieux choisi : `shadow-action`, la seule ombre teintée de vert
                du Design System §3.5, réservée à cette surface-là. La bordure
                blanche translucide part avec le dégradé — elle dessinait un
                liseré sur du vert, sans rien séparer.

                L'icône n'est plus en `chart-mint` : les jetons `chart-*`
                encodent des séries de données, et les emprunter pour un
                ornement brouille la lecture des graphiques qui s'en servent
                vraiment. Elle prend l'encre du bouton.
              */
              className="anim-pression w-full rounded-md bg-primary text-primary-foreground font-headings font-bold text-base xs:text-lg py-4 flex items-center justify-center gap-2.5 cursor-pointer shadow-action disabled:opacity-50 disabled:cursor-default"
            >
              <Icone nom="check-circle" taille={22} />
              <span>
                {envoi
                  ? 'Enregistrement…'
                  : `Confirmer la mise de ${formatMontant(carte.mise)} FCFA`}
              </span>
            </button>
            {carte.misesEncaissees >= MISES_PAR_CYCLE && (
              <p className="text-xs text-center text-muted-foreground font-body mt-2.5">
                Le cycle de {MISES_PAR_CYCLE} mises est complet. La carte doit être clôturée.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
