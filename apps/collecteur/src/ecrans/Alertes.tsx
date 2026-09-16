import { Carte, Icone, Squelette } from '@kolek/ui';
import { useMemo } from 'react';

import { useDonnees } from '../cache';
import { useHorsLigne } from '../hors-ligne/useHorsLigne';
import { refusAffichables } from '../hors-ligne/vues';
import { chargerAlertes, type GraviteAlerte } from '../lectures-ecrans';
import { rangCascade, usePremierRendu } from '../premier-rendu';
import { CorpsEcran, EnTeteEcran, RienAMontrer } from './EnTeteEcran';

/**
 * Les alertes.
 *
 * Elles ne sont pas une table : elles sont **déduites de l'état** à chaque
 * ouverture de l'écran. Rien ne les stocke, donc rien ne peut les rendre
 * périmées, et il n'y a aucune liste à purger.
 *
 * Le revers, assumé : on ne peut pas les marquer « lues ». Une carte à clôturer
 * reste signalée tant qu'elle n'est pas clôturée. C'est exactement ce qu'on
 * attend d'un rappel qui porte sur de l'argent qu'un client attend.
 *
 * Aucune notification poussée : l'application n'en émet pas, et prétendre le
 * contraire ici ferait manquer une échéance à quelqu'un qui aurait cessé de
 * regarder.
 *
 * ## Les refus, depuis J2b
 *
 * Une opération partie du téléphone et refusée par le serveur, c'est de
 * l'argent qui a changé de main sans être compté. Elle passe en tête, avant
 * toute alerte, et se lit **sans réseau** : elle vient de la base du téléphone
 * — la copie des refus consignés, et les refus pas encore consignés (spec J2b
 * §8.4). Les autres alertes restent calculées par le serveur ; sans réseau,
 * l'écran dit qu'elles l'attendent au lieu d'annoncer « Rien à signaler ».
 *
 * Aucune action sur un refus dans J2b : rien ne s'efface, rien ne se rejoue
 * d'ici.
 */
const APPARENCE: Record<GraviteAlerte, { bordure: string; puce: string; icone: 'alert-circle' | 'info' }> = {
  action: { bordure: 'border-negative', puce: 'bg-negative-tint text-negative', icone: 'alert-circle' },
  attention: { bordure: 'border-hairline', puce: 'bg-info-tint text-info', icone: 'alert-circle' },
  information: { bordure: 'border-hairline', puce: 'bg-muted text-muted-foreground', icone: 'info' },
};

const LIBELLE: Record<GraviteAlerte, string> = {
  action: 'À faire',
  attention: 'À surveiller',
  information: 'Information',
};

/** « 12 septembre à 08:30 » : l'heure du geste, pas celle du refus. */
function heureDuGeste(iso: string): string {
  const quand = new Date(iso);
  const jour = quand.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const heure = quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour} à ${heure}`;
}

export function Alertes({ onRetour, revision }: { onRetour: () => void; revision: number }) {
  const { donnees: alertes, erreur } = useDonnees('alertes', chargerAlertes, {
    revision,
    messageErreur: 'Cet écran demande le réseau.',
    besoinReseau: true,
  });
  const { operations, refus, tournee } = useHorsLigne();
  const refusees = useMemo(
    () => refusAffichables(refus, operations, tournee),
    [refus, operations, tournee],
  );

  const aFaire = alertes?.filter((a) => a.gravite === 'action').length ?? 0;
  // Voir `Recus` : l'escalier ne rejoue pas quand la liste se relit.
  const premier = usePremierRendu();

  // Un refus n'est pas « une chose à faire » : J2b n'offre aucune action sur
  // lui. Les deux se comptent à part.
  const resume = [
    ...(refusees.length > 0 ? [`${refusees.length} refusée${refusees.length > 1 ? 's' : ''}`] : []),
    ...(aFaire > 0 ? [`${aFaire} chose${aFaire > 1 ? 's' : ''} à faire`] : []),
  ].join(' · ');
  const sousTitre =
    resume !== '' ? resume : alertes !== null ? 'Rien d’urgent' : erreur ? 'Réseau requis' : 'Lecture…';

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran titre="Alertes" sousTitre={sousTitre} onRetour={onRetour} largeur="liste" />

      <CorpsEcran
        largeur="liste"
        enfants={
          <>
            {refusees.length > 0 && (
              <section aria-label="Refusées par le serveur" className="space-y-3">
                <p className="font-headings font-bold text-base text-ink px-1">Refusées par le serveur</p>
                {refusees.map((r) => (
                  <Carte
                    key={r.id}
                    className="p-4 rounded-2xl border border-negative shadow-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-pill flex items-center justify-center shrink-0 bg-negative-tint text-negative">
                        <Icone nom="alert-circle" taille={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                          Refusée
                        </p>
                        <p className="font-headings font-bold text-base text-ink mb-1">{r.titre}</p>
                        <p className="font-body text-sm text-muted-foreground">{r.detail}</p>
                        {r.quand && (
                          <p className="font-body text-xs text-muted-foreground mt-1">
                            {`Geste du ${heureDuGeste(r.quand)}`}
                          </p>
                        )}
                      </div>
                    </div>
                  </Carte>
                ))}
                <p className="font-body text-xs text-muted-foreground px-1">
                  Rien n’est effacé : chaque opération refusée est gardée telle quelle, avec son motif.
                </p>
              </section>
            )}

            {erreur && (
              <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
                {/* Avec des refus à l'écran, « cet écran » dirait faux : une partie se lit. */}
                {refusees.length > 0 ? 'Les autres alertes demandent le réseau.' : erreur}
              </p>
            )}

            {!alertes && !erreur && (
              <div className="space-y-3">
                <Carte className="p-4 space-y-2.5">
                  <Squelette hauteur="h-4" largeur="w-20" />
                  <Squelette hauteur="h-5" largeur="w-48" />
                  <Squelette hauteur="h-4" largeur="w-3/4" />
                </Carte>
                <Carte className="p-4 space-y-2.5">
                  <Squelette hauteur="h-4" largeur="w-20" />
                  <Squelette hauteur="h-5" largeur="w-48" />
                  <Squelette hauteur="h-4" largeur="w-3/4" />
                </Carte>
              </div>
            )}

            {alertes?.length === 0 && refusees.length === 0 && (
              <RienAMontrer
                icone="bell"
                titre="Rien à signaler"
                detail="Aucune carte n'attend d'être clôturée, aucune ne dort, et ton abonnement est à jour."
              />
            )}

            {alertes?.map((alerte, rang) => {
              const style = APPARENCE[alerte.gravite];
              return (
                <Carte
                  key={alerte.cle}
                  className={`p-4 rounded-2xl border border-hairline/80 shadow-xs hover:shadow-sm transition-all ${style.bordure} ${premier ? 'anim-cascade' : ''}`}
                  style={rangCascade(rang, premier)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-pill flex items-center justify-center shrink-0 ${style.puce}`}
                    >
                      <Icone nom={style.icone} taille={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                        {LIBELLE[alerte.gravite]}
                      </p>
                      <p className="font-headings font-bold text-base text-ink mb-1">
                        {alerte.titre}
                      </p>
                      <p className="font-body text-sm text-muted-foreground">{alerte.detail}</p>
                    </div>
                  </div>
                </Carte>
              );
            })}

            {alertes && alertes.length > 0 && (
              <p className="font-body text-xs text-muted-foreground px-1">
                Ces alertes sont recalculées à chaque ouverture de l’écran. Elles disparaissent
                d’elles-mêmes quand la situation est réglée — il n’y a rien à cocher.
              </p>
            )}
          </>
        }
      />
    </div>
  );
}
