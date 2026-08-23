import { Carte, Icone } from '@kolek/ui';

import { useDonnees } from '../cache';
import { chargerEtatAvis, type AvisEnvoye } from '../lectures-ecrans';
import { rangCascade, usePremierRendu } from '../premier-rendu';
import { CorpsEcran, EnTeteEcran, RienAMontrer } from './EnTeteEcran';

/**
 * Les avis envoyés aux clients.
 *
 * ## Pourquoi cet écran existe côté collecteur
 *
 * Parce que le message part en son nom. Un client qui reçoit « Versement recu :
 * 500 FCFA » et qui revient le lendemain en disant qu'il n'a rien reçu met le
 * collecteur en cause, pas la plateforme. Il lui faut donc pouvoir montrer ce
 * qui est parti, à quel numéro, et quand.
 *
 * C'est aussi la raison pour laquelle l'écran affiche le texte **exact** du
 * message. Un résumé reformulé ne prouverait rien.
 *
 * ## Ce qu'il ne permet pas, et pourquoi
 *
 * Ni écrire un avis, ni renvoyer, ni relever le quota. `avis_clients` et
 * `avis_reglages` n'accordent que le `select`. Un collecteur qui pourrait
 * rédiger le corps pourrait annoncer un montant différent de celui qu'il a
 * encaissé — le dispositif se retournerait contre son objet même.
 *
 * Le canal et le quota sont fixés par GTCS : chaque message se paie auprès d'un
 * opérateur, et c'est GTCS qui a le contrat.
 */

const LIBELLE: Record<AvisEnvoye['statut'], string> = {
  a_envoyer: 'En attente',
  envoye: 'Parti',
  echoue: 'Nouvel essai',
  abandonne: 'Non parti',
  quota_atteint: 'Hors quota',
};

const TEINTE: Record<AvisEnvoye['statut'], string> = {
  a_envoyer: 'bg-muted text-muted-foreground',
  envoye: 'bg-positive-tint text-positive',
  echoue: 'bg-muted text-muted-foreground',
  abandonne: 'bg-negative-tint text-negative',
  quota_atteint: 'bg-negative-tint text-negative',
};

function quand(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Avis({ onRetour, revision }: { onRetour: () => void; revision: number }) {
  const { donnees: etat, erreur } = useDonnees('avis', () => chargerEtatAvis(), {
    revision,
    messageErreur: 'Avis indisponibles. Vérifie le réseau.',
  });

  const eteint = !etat?.canal || etat.canal === 'aucun';
  // Voir `Recus` : l'escalier ne rejoue pas quand la liste se relit.
  const premier = usePremierRendu();

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran
        titre="Avis clients"
        sousTitre={etat ? (eteint ? 'Éteint' : etat.canal!.toUpperCase()) : 'Messages envoyés'}
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

            {!etat && !erreur && (
              <p className="font-body text-sm text-muted-foreground text-center py-8">Lecture…</p>
            )}

            {etat && (
              <>
                <Carte className="p-4">
                  <div className="flex items-start gap-3">
                    <Icone
                      nom={eteint ? 'bell-off' : 'bell'}
                      taille={18}
                      className={eteint ? 'text-muted-foreground shrink-0 mt-0.5' : 'text-positive shrink-0 mt-0.5'}
                    />
                    <div className="min-w-0">
                      <p className="font-headings font-bold text-base text-ink m-0">
                        {eteint ? 'Tes clients ne sont pas prévenus' : 'Tes clients sont prévenus'}
                      </p>
                      <p className="font-body text-sm text-muted-foreground mt-1">
                        {eteint
                          ? 'Chaque message se paie auprès d’un opérateur. C’est GTCS qui ouvre ce service, pas l’application. Demande-le si tes clients le réclament.'
                          : declencheurs(etat.surOuverture, etat.surRetrait, etat.surMise)}
                      </p>
                    </div>
                  </div>

                  {!eteint && (
                    <dl className="text-sm font-body space-y-2 mt-3 pt-3 border-t border-hairline">
                      <Ligne
                        terme="Quota du mois"
                        valeur={`${etat.segmentsConsommes} / ${etat.quotaMensuel}`}
                      />
                      <Ligne
                        terme="Clients qui ont accepté"
                        valeur={String(etat.clientsConsentants)}
                      />
                    </dl>
                  )}

                  {!eteint && etat.segmentsConsommes >= etat.quotaMensuel && (
                    <p className="font-body text-sm text-negative mt-3">
                      Le quota du mois est atteint : les nouveaux avis sont préparés mais ne
                      partent pas. Ils reprendront le mois prochain.
                    </p>
                  )}

                  <p className="font-body text-xs text-muted-foreground mt-3 pt-3 border-t border-hairline">
                    Un client n’est prévenu que s’il a accepté. Tu recueilles cet accord depuis sa
                    ligne, dans « Mes clients ».
                  </p>
                </Carte>

                {etat.avis.length === 0 && (
                  <RienAMontrer
                    icone="bell"
                    titre="Aucun avis"
                    detail="Les messages envoyés à tes clients apparaissent ici, avec leur texte exact."
                  />
                )}

                {etat.avis.map((avis, rang) => (
                  <Carte
                    key={avis.id}
                    className={`p-4 ${premier ? 'anim-cascade' : ''}`}
                    style={rangCascade(rang, premier)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-body font-semibold text-base text-ink truncate m-0">
                          {avis.clientNom}
                        </p>
                        <p className="font-body text-xs text-muted-foreground tabular-nums">
                          {avis.destinataire} · {quand(avis.envoyeLe ?? avis.creeLe)}
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-pill text-xs font-body font-semibold whitespace-nowrap shrink-0 ${TEINTE[avis.statut]}`}
                      >
                        {LIBELLE[avis.statut]}
                      </span>
                    </div>
                    {/* Le texte exact, pas un résumé : c'est ce qui en fait une
                        preuve opposable au client qui conteste. */}
                    <p className="font-body text-sm text-ink bg-canvas rounded-md p-3 mt-3 m-0 break-words">
                      {avis.corps}
                    </p>
                  </Carte>
                ))}
              </>
            )}
          </>
        }
      />
    </div>
  );
}

/** Dit ce qui déclenche un message, sans énumérer ce qui n'en déclenche pas. */
function declencheurs(ouverture: boolean, retrait: boolean, mise: boolean): string {
  const evenements = [
    ouverture ? 'à l’ouverture d’une carte' : null,
    mise ? 'à chaque versement' : null,
    retrait ? 'à la clôture' : null,
  ].filter((x): x is string => x !== null);

  if (evenements.length === 0) {
    return 'Le canal est ouvert, mais aucun événement n’est activé : rien ne part.';
  }
  return `Un message part ${evenements.join(', ')}.`;
}

function Ligne({ terme, valeur }: { terme: string; valeur: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{terme}</dt>
      <dd className="text-ink font-medium text-right tabular-nums">{valeur}</dd>
    </div>
  );
}
