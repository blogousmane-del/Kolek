import { Carte, Icone } from '@kolek/ui';

import { useDonnees } from '../cache';
import { chargerAlertes, type GraviteAlerte } from '../lectures-ecrans';
import { rangCascade, usePremierRendu } from '../premier-rendu';
import { CorpsEcran, EnTeteEcran, RienAMontrer } from './EnTeteEcran';

/**
 * Les alertes.
 *
 * Elles ne sont pas une table : elles sont **déduites de l'état** à chaque
 * ouverture de l'écran. Rien ne les stocke, donc rien ne peut les rendre
 * périmées, et il n'y a aucune file à purger.
 *
 * Le revers, assumé : on ne peut pas les marquer « lues ». Une carte à clôturer
 * reste signalée tant qu'elle n'est pas clôturée. C'est exactement ce qu'on
 * attend d'un rappel qui porte sur de l'argent qu'un client attend.
 *
 * Aucune notification poussée : l'application n'en émet pas, et prétendre le
 * contraire ici ferait manquer une échéance à quelqu'un qui aurait cessé de
 * regarder.
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

export function Alertes({ onRetour, revision }: { onRetour: () => void; revision: number }) {
  const { donnees: alertes, erreur } = useDonnees('alertes', chargerAlertes, {
    revision,
    messageErreur: 'Alertes indisponibles. Vérifie le réseau.',
  });

  const aFaire = alertes?.filter((a) => a.gravite === 'action').length ?? 0;
  // Voir `Recus` : l'escalier ne rejoue pas quand la liste se relit.
  const premier = usePremierRendu();

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran
        titre="Alertes"
        sousTitre={
          alertes === null
            ? 'Lecture…'
            : aFaire > 0
              ? `${aFaire} chose${aFaire > 1 ? 's' : ''} à faire`
              : 'Rien d’urgent'
        }
        onRetour={onRetour}
        largeur="liste"
      />

      <CorpsEcran
        largeur="liste"
        enfants={
          <>
            {erreur && (
              <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
                {erreur}
              </p>
            )}

            {!alertes && !erreur && (
              <p className="font-body text-sm text-muted-foreground text-center py-8">Lecture…</p>
            )}

            {alertes?.length === 0 && (
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
                  className={`p-4 ${style.bordure} ${premier ? 'anim-cascade' : ''}`}
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
