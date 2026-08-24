import { formatMontant } from '@kolek/core';
import { Carte } from '@kolek/ui';

import { useDonnees } from '../cache';
import { chargerBilan } from '../lectures-ecrans';
import { rangCascade, usePremierRendu } from '../premier-rendu';
import { CorpsEcran, EnTeteEcran, RienAMontrer } from './EnTeteEcran';

/**
 * Le bilan du collecteur.
 *
 * Trois tranches — le jour, la semaine, le mois — et rien au-delà : les données
 * n'existent que depuis l'ouverture du compte, et une tranche « cette année »
 * afficherait le même chiffre que « 30 jours » en laissant croire à autre chose.
 *
 * **La commission est montrée à part, et c'est le point de l'écran.** « Encaissé »
 * est de l'argent qui transite ; seule la première mise de chaque carte revient
 * au collecteur. Les confondre est l'erreur qui fait qu'on dépense l'épargne de
 * ses clients sans s'en rendre compte.
 */
export function Bilan({ onRetour, revision }: { onRetour: () => void; revision: number }) {
  const { donnees, erreur } = useDonnees('bilan', chargerBilan, {
    revision,
    messageErreur: 'Chiffres indisponibles. Vérifie le réseau.',
  });
  // Voir `Recus` : l'escalier ne rejoue pas quand la liste se relit.
  const premier = usePremierRendu();

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran
        titre="Bilan"
        sousTitre="Ce qui est passé par tes mains"
        onRetour={onRetour}
        enfants={
          donnees && (
            <div className="grid grid-cols-2 gap-3">
              {/* `min-w-0` : une piste de grille ne descend pas sous la largeur
                  de son contenu tant qu'on ne l'y autorise pas. Un encours à
                  sept chiffres élargissait donc la tuile, puis l'en-tête, puis
                  le document. */}
              <div className="bg-white/10 rounded-lg p-3 min-w-0">
                <p className="text-white/60 text-xs font-body mb-0.5">Encours client</p>
                <p className="anim-montant text-white font-headings font-bold text-lg xs:text-xl tabular-nums">
                  {formatMontant(donnees.encoursTotal)}
                </p>
                <p className="text-white/50 text-xs font-body">FCFA à rendre</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3 min-w-0">
                <p className="text-white/60 text-xs font-body mb-0.5">Cartes actives</p>
                <p className="text-white font-headings font-bold text-xl tabular-nums">
                  {donnees.cartesActives}
                </p>
                <p className="text-white/50 text-xs font-body">
                  {donnees.clients} client{donnees.clients > 1 ? 's' : ''}
                </p>
              </div>
            </div>
          )
        }
      />

      <CorpsEcran
        largeur="large"
        enfants={
          <>
            {erreur && (
              <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
                {erreur}
              </p>
            )}

            {!donnees && !erreur && (
              <p className="font-body text-sm text-muted-foreground text-center py-8">Lecture…</p>
            )}

            {donnees?.tranches.every((t) => t.nombreMises === 0) && (
              <RienAMontrer
                icone="bar-chart-2"
                titre="Aucune mise sur 30 jours"
                detail="Le bilan se remplit tout seul dès le premier encaissement."
              />
            )}

            {/* Les trois tranches côte à côte sur bureau. Empilées, elles
                obligeaient à faire défiler pour comparer aujourd'hui à trente
                jours — or la comparaison est tout l’intérêt de cet écran. */}
            <div className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0 lg:items-start">
              {donnees?.tranches.map((tranche, rang) => (
                <Carte
                  key={tranche.libelle}
                  className={`p-4 ${premier ? 'anim-cascade' : ''}`}
                  style={rangCascade(rang, premier)}
                >
                <p className="font-headings font-bold text-base text-ink mb-3">{tranche.libelle}</p>

                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="font-body text-sm text-muted-foreground shrink-0">Encaissé</span>
                  <span className="font-headings font-bold text-xl text-ink tabular-nums text-right min-w-0">
                    {formatMontant(tranche.encaisse)}{' '}
                    <span className="text-xs font-body font-medium text-muted-foreground">FCFA</span>
                  </span>
                </div>

                {/* La ligne qui compte : ce qui reste au collecteur. */}
                <div className="flex items-baseline justify-between gap-2 mb-3 pb-3 border-b border-hairline">
                  <span className="font-body text-sm text-positive font-medium shrink-0">
                    Ta commission
                  </span>
                  <span className="font-headings font-bold text-lg text-positive tabular-nums text-right min-w-0">
                    {formatMontant(tranche.commissions)}{' '}
                    <span className="text-xs font-body font-medium">FCFA</span>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="min-w-0">
                    <p className="font-headings font-bold text-base text-ink tabular-nums">
                      {tranche.nombreMises}
                    </p>
                    <p className="text-xs font-body text-muted-foreground">mises</p>
                  </div>
                  <div>
                    <p className="font-headings font-bold text-base text-ink tabular-nums">
                      {tranche.cartesOuvertes}
                    </p>
                    <p className="text-xs font-body text-muted-foreground">cartes ouvertes</p>
                  </div>
                  <div>
                    <p className="font-headings font-bold text-base text-ink tabular-nums">
                      {tranche.cartesCloturees}
                    </p>
                    <p className="text-xs font-body text-muted-foreground">clôturées</p>
                  </div>
                </div>

                {tranche.restitue > 0 && (
                  <p className="font-body text-xs text-muted-foreground mt-3 pt-3 border-t border-hairline">
                    Restitué aux clients :{' '}
                    <strong className="text-ink">{formatMontant(tranche.restitue)} FCFA</strong>
                  </p>
                )}
                </Carte>
              ))}
            </div>
          </>
        }
      />
    </div>
  );
}
