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
      {/* En-tête */}
      <div className="bg-sidebar px-marge pt-entete pb-5 lg:rounded-2xl lg:pt-6">
        <div className="flex items-center justify-between mb-1">
          <button
            type="button"
            onClick={() => onNaviguer('clients')}
            aria-label="Revenir aux clients"
            className="w-9 h-9 rounded-pill bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <Icone nom="arrow-left" className="text-white" />
          </button>
          <p className="font-headings font-bold text-white text-lg">Encaisser une mise</p>
          <div className="w-9" />
        </div>
      </div>

      {!enLigne && <BandeauHorsLigne className="mx-4 mt-3" />}

      {!carte ? (
        // On arrive ici par l'onglet du bas, sans être passé par la liste. Dire
        // quoi faire plutôt que d'afficher un formulaire sans destinataire.
        <Carte className="mx-4 mt-4 p-4">
          <p className="text-base font-body text-ink m-0">Aucune carte choisie.</p>
          <p className="text-sm font-body text-muted-foreground mt-1 mb-3">
            Ouvre la liste de tes clients et touche « Encaisser » sur la carte concernée.
          </p>
          <Bouton pleineLargeur onClick={() => onNaviguer('clients')}>
            Voir mes clients
          </Bouton>
        </Carte>
      ) : (
        <>
          {/* Client */}
          <div className="mx-4 mt-3 bg-surface rounded-xl border border-hairline p-4 flex items-center gap-3 shadow-md">
            <Avatar nom={carte.clientNom} className="w-12 h-12" />
            <div className="flex-1 min-w-0">
              <p className="font-headings font-bold text-lg text-ink truncate">
                {carte.clientNom}
              </p>
              <span className="text-sm font-body text-muted-foreground">
                Jour {carte.misesEncaissees}/{MISES_PAR_CYCLE}
              </span>
            </div>
          </div>

          <div className="mx-4 mt-3">
            <CarteCollecte
              nomClient={carte.clientNom}
              misePar={formatMontant(carte.mise)}
              jourCourant={carte.misesEncaissees}
              solde={formatMontant(soldeRestituable(carte.misesEncaissees, carte.mise))}
              cycle="1"
            />
          </div>

          {/* Montant — imposé par la carte */}
          <div className="mx-4 mt-5">
            <p className="text-sm font-body font-semibold text-ink mb-2">Montant de la mise</p>
            <div className="flex items-baseline gap-2 bg-surface border border-hairline rounded-md px-4 py-3">
              <span className="font-headings font-bold text-3xl text-ink tabular-nums">
                {formatMontant(carte.mise)}
              </span>
              <span className="text-base font-body font-medium text-muted-foreground">FCFA</span>
            </div>
            <p className="text-xs font-body text-muted-foreground mt-1.5">
              Fixé à l’ouverture de la carte. Une mise d’un autre montant est refusée par le
              serveur.
            </p>
          </div>

          <div className="flex-1 min-h-4" />

          {erreur && (
            <p role="alert" className="mx-4 mb-2 text-sm font-body text-negative">
              {erreur}
            </p>
          )}
          {/* Le moment signature du produit.

              La conception prévoyait d'animer la case fraîchement remplie de la
              carte de collecte. Impossible ici, et il vaut mieux le dire que le
              contourner : la coquille remet `carteChoisie` à `null` après un
              encaissement réussi, donc `CarteCollecte` est démontée au moment
              précis où l'animation devrait jouer. Ce que le collecteur voit,
              c'est ce message — c'est donc lui qui porte la récompense.

              Le geste est répété trente fois par jour, debout, devant une
              cliente. La confirmation doit se lire d'un coup d'œil, sans lire
              un mot. */}
          {succes && (
            <p
              role="status"
              className="anim-reussite mx-4 mb-2 rounded-md bg-positive-tint px-3 py-2 text-sm font-body font-medium text-positive"
            >
              {succes}
            </p>
          )}

          {/* Confirmation */}
          <div className="mx-4 mb-4">
            <button
              type="button"
              onClick={confirmer}
              disabled={envoi || collecteurId === null || carte.misesEncaissees >= MISES_PAR_CYCLE}
              className="w-full rounded-pill bg-primary text-primary-foreground font-body font-bold text-lg py-4 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-default"
            >
              <Icone nom="check-circle" taille={20} />
              {envoi
                ? 'Enregistrement…'
                : `Confirmer la mise — ${formatMontant(carte.mise)} FCFA`}
            </button>
            {carte.misesEncaissees >= MISES_PAR_CYCLE && (
              <p className="text-xs text-center text-muted-foreground font-body mt-2">
                Le cycle de {MISES_PAR_CYCLE} mises est complet. La carte doit être clôturée.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
