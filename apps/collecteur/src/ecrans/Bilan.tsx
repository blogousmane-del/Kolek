import { formatMontant } from '@kolek/core';
import { Carte, Icone, Squelette } from '@kolek/ui';

import { useDonnees } from '../cache';
import { chargerBilan } from '../lectures-ecrans';
import { rangCascade, usePremierRendu } from '../premier-rendu';
import { CorpsEcran, EnTeteEcran, RienAMontrer } from './EnTeteEcran';
import { useEstCollaborateur } from './commission';

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
  const estCollaborateur = useEstCollaborateur();
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
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 p-3.5 min-w-0 shadow-xs">
                <div className="flex items-center gap-1 text-white/70 mb-0.5">
                  <Icone nom="bar-chart-2" taille={13} />
                  <p className="text-xs font-body">Encours client</p>
                </div>
                <p className="anim-montant text-white font-headings font-bold text-lg xs:text-xl tabular-nums tracking-tight">
                  {formatMontant(donnees.encoursTotal)}
                </p>
                <p className="text-white/50 text-[11px] font-body mt-0.5">FCFA à rendre</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 p-3.5 min-w-0 shadow-xs">
                <div className="flex items-center gap-1 text-white/70 mb-0.5">
                  <Icone nom="users" taille={13} />
                  <p className="text-xs font-body">Cartes actives</p>
                </div>
                <p className="text-white font-headings font-bold text-xl tabular-nums tracking-tight">
                  {donnees.cartesActives}
                </p>
                <p className="text-white/50 text-[11px] font-body mt-0.5">
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
              <div className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0">
                <Carte className="p-5 space-y-3">
                  <Squelette hauteur="h-5" largeur="w-24" />
                  <Squelette hauteur="h-8" largeur="w-3/4" />
                  <Squelette hauteur="h-4" largeur="w-1/2" />
                  <Squelette hauteur="h-12" largeur="w-full" />
                </Carte>
                <Carte className="p-5 space-y-3">
                  <Squelette hauteur="h-5" largeur="w-24" />
                  <Squelette hauteur="h-8" largeur="w-3/4" />
                  <Squelette hauteur="h-4" largeur="w-1/2" />
                  <Squelette hauteur="h-12" largeur="w-full" />
                </Carte>
                <Carte className="p-5 space-y-3">
                  <Squelette hauteur="h-5" largeur="w-24" />
                  <Squelette hauteur="h-8" largeur="w-3/4" />
                  <Squelette hauteur="h-4" largeur="w-1/2" />
                  <Squelette hauteur="h-12" largeur="w-full" />
                </Carte>
              </div>
            )}

            {donnees?.tranches.every((t) => t.nombreMises === 0) && (
              <RienAMontrer
                icone="bar-chart-2"
                titre="Aucune mise sur 30 jours"
                detail="Le bilan se remplit tout seul dès le premier encaissement."
              />
            )}

            {/* Les trois tranches côte à côte sur bureau */}
            <div className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0 lg:items-start">
              {donnees?.tranches.map((tranche, rang) => (
                <Carte
                  key={tranche.libelle}
                  className={`p-5 rounded-2xl border border-hairline/80 shadow-xs hover:shadow-sm transition-all ${
                    premier ? 'anim-cascade' : ''
                  }`}
                  style={rangCascade(rang, premier)}
                >
                  <div className="flex items-center justify-between mb-3.5">
                    <p className="font-headings font-bold text-base text-ink">{tranche.libelle}</p>
                    <span className="text-[11px] font-body font-semibold px-2 py-0.5 rounded-pill bg-muted text-muted-foreground">
                      {tranche.nombreMises} mise{tranche.nombreMises > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="font-body text-xs text-muted-foreground shrink-0 uppercase tracking-wider">
                      Encaissé
                    </span>
                    <span className="font-headings font-bold text-xl text-ink tabular-nums text-right min-w-0">
                      {formatMontant(tranche.encaisse)}{' '}
                      <span className="text-xs font-body font-medium text-muted-foreground">FCFA</span>
                    </span>
                  </div>

                  {/* La ligne qui compte : ce qui reste au collecteur.

                      Elle n'existe pas pour un collaborateur. Sa commission
                      revient à son titulaire, donc ce montant vaudrait zéro tous
                      les soirs — et un « +0 FCFA » quotidien pendant qu'il
                      encaisse est pire qu'une absence : il ressemble à une
                      erreur de calcul, pas à une règle. */}
                  {!estCollaborateur && (
                    <div className="flex items-baseline justify-between gap-2 mb-4 p-2.5 rounded-xl bg-positive-tint/80 border border-positive/20">
                      <span className="font-body text-xs text-positive font-bold shrink-0">
                        Ta commission
                      </span>
                      <span className="font-headings font-bold text-base xs:text-lg text-positive tabular-nums text-right min-w-0">
                        +{formatMontant(tranche.commissions)}{' '}
                        <span className="text-xs font-body font-semibold">FCFA</span>
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-center p-2 rounded-xl bg-muted/40 border border-hairline/60">
                    <div>
                      <p className="font-headings font-bold text-base text-ink tabular-nums">
                        {tranche.cartesOuvertes}
                      </p>
                      <p className="text-[11px] font-body text-muted-foreground">cartes ouvertes</p>
                    </div>
                    <div>
                      <p className="font-headings font-bold text-base text-ink tabular-nums">
                        {tranche.cartesCloturees}
                      </p>
                      <p className="text-[11px] font-body text-muted-foreground">clôturées</p>
                    </div>
                  </div>

                  {tranche.restitue > 0 && (
                    <p className="font-body text-xs text-muted-foreground mt-3 pt-3 border-t border-hairline/70 flex justify-between">
                      <span>Restitué :</span>
                      <strong className="text-ink font-semibold">{formatMontant(tranche.restitue)} FCFA</strong>
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
