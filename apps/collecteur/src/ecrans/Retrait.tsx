import { MISES_PAR_CYCLE, formatMontant } from '@kolek/core';
import { Bouton, Carte, Icone } from '@kolek/ui';
import { useState } from 'react';

import { useDonnees } from '../cache';
import { cloturerCarte } from '../ecritures-ecrans';
import { chargerCartesCloturables, type CarteCloturable } from '../lectures-ecrans';
import { CorpsEcran, EnTeteEcran, RienAMontrer } from './EnTeteEcran';

/**
 * Retrait : clôturer une carte et rendre son solde au client.
 *
 * C'est le seul écran de l'application qui fait **sortir** de l'argent. Il est
 * construit en conséquence.
 *
 * **Le montant est affiché avant confirmation, et il vient du serveur.** Le
 * collecteur voit ce qu'il va rendre, en toutes lettres, avant de toucher au
 * bouton. La règle — la première mise est sa commission — est rappelée sur la
 * même carte, parce que c'est là qu'un client peut la contester.
 *
 * **La confirmation est en deux temps.** Un retrait ne se défait pas : `retraits`
 * porte un déclencheur d'immuabilité, et la carte clôturée ne se rouvre pas. Un
 * appui unique sur une liste défilante, dans un marché, se produirait par accident.
 */
export function Retrait({
  onRetour,
  onCloture,
  revision,
}: {
  onRetour: () => void;
  onCloture: () => void;
  revision: number;
}) {
  const [aConfirmer, setAConfirmer] = useState<CarteCloturable | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState<{ nom: string; montant: number } | null>(null);
  /** Chaque clôture fait avancer la révision, ce qui périme la liste gardée.
      Après un retrait, la carte clôturée doit disparaître : un affichage
      instantané de l'ancienne liste inviterait à la clôturer deux fois. C'est
      le seul écran où le cache doit être franchement invalidé. */
  const [tourLocal, setTourLocal] = useState(0);

  const {
    donnees: cartes,
    erreur: erreurLecture,
    rafraichir,
  } = useDonnees('cartes-cloturables', chargerCartesCloturables, {
    revision: revision + tourLocal,
    messageErreur: 'Cartes indisponibles. Vérifie le réseau.',
  });
  const [erreurEcriture, setErreurEcriture] = useState<string | null>(null);
  const erreur = erreurEcriture ?? erreurLecture;

  async function confirmer() {
    if (!aConfirmer || envoi) return;
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
    setAConfirmer(null);
    setTourLocal((t) => t + 1);
    onCloture();
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
    <div className="flex-1 flex flex-col">
      <EnTeteEcran
        titre="Retrait"
        sousTitre="Clôturer une carte et rendre le solde"
        onRetour={onRetour}
      />

      <CorpsEcran
        enfants={
          <>
            {erreur && (
              <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
                {erreur}
              </p>
            )}

            {!cartes && !erreur && (
              <p className="font-body text-sm text-muted-foreground text-center py-8">Lecture…</p>
            )}

            {cartes?.length === 0 && (
              <RienAMontrer
                icone="coins"
                titre="Aucune carte active"
                detail="Une carte apparaît ici dès qu'un client en ouvre une."
              />
            )}

            {cartes?.map((carte) => {
              const enConfirmation = aConfirmer?.carteId === carte.carteId;

              return (
                <Carte
                  key={carte.carteId}
                  className={`p-4 ${carte.cycleComplet ? 'border-positive' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <p className="font-headings font-bold text-base text-ink truncate">
                        {carte.clientNom}
                      </p>
                      <p className="font-body text-xs text-muted-foreground">
                        {carte.misesEncaissees}/{MISES_PAR_CYCLE} mises · {formatMontant(carte.mise)}{' '}
                        FCFA par jour
                      </p>
                    </div>
                    {carte.cycleComplet && (
                      <span className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold bg-positive-tint text-positive whitespace-nowrap shrink-0">
                        Cycle terminé
                      </span>
                    )}
                  </div>

                  <div className="bg-canvas rounded-md p-3 mb-3">
                    <p className="text-xs font-body text-muted-foreground mb-0.5">
                      À rendre au client
                    </p>
                    <p className="font-headings font-bold text-2xl text-ink tabular-nums">
                      {formatMontant(carte.restituable)}{' '}
                      <span className="text-sm font-body font-medium text-muted-foreground">
                        FCFA
                      </span>
                    </p>
                    <p className="text-xs font-body text-muted-foreground mt-1">
                      {carte.misesEncaissees > 0
                        ? `${carte.misesEncaissees} mises encaissées, moins la première qui est ta commission (${formatMontant(carte.mise)} FCFA).`
                        : 'Aucune mise encaissée : rien à rendre, rien à garder.'}
                    </p>
                  </div>

                  {!enConfirmation ? (
                    <Bouton variante="contour" onClick={() => setAConfirmer(carte)}>
                      Clôturer cette carte
                    </Bouton>
                  ) : (
                    <div className="space-y-2">
                      <p className="font-body text-sm text-ink bg-info-tint rounded-md p-3">
                        Confirmer la clôture de la carte de {carte.clientNom} et la remise de{' '}
                        <strong>{formatMontant(carte.restituable)} FCFA</strong> ? C’est définitif.
                      </p>
                      <div className="flex gap-2">
                        <Bouton onClick={confirmer} disabled={envoi}>
                          {envoi ? 'Clôture…' : 'Oui, clôturer'}
                        </Bouton>
                        <Bouton variante="contour" onClick={() => setAConfirmer(null)}>
                          Annuler
                        </Bouton>
                      </div>
                    </div>
                  )}
                </Carte>
              );
            })}
          </>
        }
      />
    </div>
  );
}
