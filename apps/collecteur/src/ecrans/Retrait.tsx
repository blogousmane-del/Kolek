import { MISES_PAR_CYCLE, formatMontant } from '@kolek/core';
import { Bouton, Carte, Icone } from '@kolek/ui';
import { useEffect, useState } from 'react';

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
export function Retrait({ onRetour, onCloture }: { onRetour: () => void; onCloture: () => void }) {
  const [cartes, setCartes] = useState<CarteCloturable[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aConfirmer, setAConfirmer] = useState<CarteCloturable | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState<{ nom: string; montant: number } | null>(null);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const c = await chargerCartesCloturables();
        if (vivant) setCartes(c);
      } catch {
        if (vivant) setErreur('Cartes indisponibles. Vérifie le réseau.');
      }
    })();
    return () => {
      vivant = false;
    };
  }, [fait]);

  async function confirmer() {
    if (!aConfirmer || envoi) return;
    setEnvoi(true);
    setErreur(null);

    const resultat = await cloturerCarte(aConfirmer.carteId);

    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.echec.message);
      setAConfirmer(null);
      return;
    }

    setFait({ nom: aConfirmer.clientNom, montant: resultat.montantRestitue });
    setAConfirmer(null);
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
