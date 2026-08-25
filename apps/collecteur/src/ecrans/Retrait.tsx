import { MISES_PAR_CYCLE, formatMontant } from '@kolek/core';
import { Bouton, Carte, Icone } from '@kolek/ui';
import { useState } from 'react';

import { useDonnees } from '../cache';
import { cloturerCarte } from '../ecritures-ecrans';
import { chargerCartesCloturables, type CarteCloturable } from '../lectures-ecrans';
import { rangCascade, usePremierRendu } from '../premier-rendu';
import { ActiverCarte } from './ActiverCarte';
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
  clientId = null,
  onToutesLesCartes,
}: {
  onRetour: () => void;
  onCloture: () => void;
  revision: number;
  /**
   * Le client sur lequel la liste est réduite, quand on arrive ici depuis sa
   * ligne ou sa fiche.
   *
   * Sans ce filtre, toucher « Retirer » sur une carte précise renvoyait sur la
   * liste de **toutes** les cartes de **tous** les clients, sans préselection.
   * Le collecteur venait de désigner une carte, et devait la retrouver à la
   * main — par nom, montant et nombre de jours — avant un geste qui ne se
   * défait pas. Debout dans un marché, c'est fabriquer l'erreur qu'on veut
   * éviter, d'autant qu'un même client peut avoir deux cartes dans cette liste.
   */
  clientId?: string | null;
  /** Retire le filtre. Absent quand aucun filtre n'est posé. */
  onToutesLesCartes?: () => void;
}) {
  const [aConfirmer, setAConfirmer] = useState<CarteCloturable | null>(null);
  // Voir `Recus` : l'escalier ne rejoue pas quand la liste se relit.
  const premier = usePremierRendu();
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

  // `cartes` reste la liste entière : le filtre ne change que ce qu'on montre,
  // jamais ce qu'on a lu. Une seule lecture sert les deux vues, et revenir à
  // toutes les cartes ne coûte pas un aller-retour réseau.
  const visibles = clientId ? (cartes ?? []).filter((c) => c.clientId === clientId) : cartes;
  const nomFiltre = clientId
    ? ((cartes ?? []).find((c) => c.clientId === clientId)?.clientNom ?? null)
    : null;

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
        largeur="large"
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

            {/* Une liste réduite sans explication se lit comme des cartes
                disparues. Le bandeau dit sur qui on est, et rend la sortie
                visible — sinon le seul moyen de revoir les autres est de
                repartir de l'accueil. */}
            {nomFiltre && (
              <div className="flex items-center justify-between gap-3 bg-info-tint rounded-md px-3 py-2">
                <p className="font-body text-sm text-ink m-0">Cartes de {nomFiltre}</p>
                {onToutesLesCartes && (
                  <Bouton variante="contour" onClick={onToutesLesCartes}>
                    Voir toutes les cartes
                  </Bouton>
                )}
              </div>
            )}

            {!cartes && !erreur && (
              <p className="font-body text-sm text-muted-foreground text-center py-8">Lecture…</p>
            )}

            {visibles?.length === 0 && (
              <RienAMontrer
                icone="coins"
                titre={clientId ? 'Aucune carte active pour ce client' : 'Aucune carte active'}
                detail={
                  clientId
                    ? 'Ses cartes ont toutes été clôturées. Ouvre-lui-en une depuis sa fiche.'
                    : "Une carte apparaît ici dès qu'un client en ouvre une."
                }
              />
            )}

            {/* Deux colonnes sur bureau : la liste des cartes à clôturer est
                la plus longue du produit, et chaque carte tient dans la moitié
                de la largeur. */}
            <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:items-start">
              {visibles?.map((carte, rang) => {
              const enConfirmation = aConfirmer?.carteId === carte.carteId;

              return (
                <Carte
                  key={carte.carteId}
                  className={`p-4 ${carte.cycleComplet ? 'border-positive' : ''} ${
                    premier ? 'anim-cascade' : ''
                  }`}
                  style={rangCascade(rang, premier)}
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
                    // Deux portes, et elles se valent : rendre l'argent, ou le
                    // laisser et repartir sur une carte de plus. Le collecteur
                    // est devant le client quand celui-ci choisit — la seconde
                    // ne peut pas être deux écrans plus loin.
                    //
                    // La seconde n'apparaît que sur une carte terminée. Sur une
                    // carte en cours, elle prélèverait une commission — la
                    // première mise du nouveau cycle — que personne n'a demandée.
                    <div className="flex flex-wrap gap-2">
                      <Bouton variante="contour" onClick={() => setAConfirmer(carte)}>
                        Faire le retrait
                      </Bouton>
                      {carte.cycleComplet && (
                        <ActiverCarte
                          clientId={carte.clientId}
                          misePreremplie={carte.mise}
                          identifiant={`retrait-${carte.carteId}`}
                          onOuverte={onCloture}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Les deux faits, et pas un seul : ce qu'on rend, et ce
                          que la carte devient. Un collecteur qui croit pouvoir
                          rouvrir la carte après coup n'a pas eu la bonne
                          information au bon moment. */}
                      <p className="font-body text-sm text-ink bg-info-tint rounded-md p-3">
                        Confirmer le retrait de{' '}
                        <strong>{formatMontant(carte.restituable)} FCFA</strong> pour{' '}
                        {carte.clientNom} ? La carte se clôture, c’est définitif.
                      </p>
                      <div className="flex gap-2">
                        <Bouton onClick={confirmer} disabled={envoi}>
                          {envoi ? 'Retrait…' : 'Oui, faire le retrait'}
                        </Bouton>
                        <Bouton variante="contour" onClick={() => setAConfirmer(null)} disabled={envoi}>
                          Annuler
                        </Bouton>
                      </div>
                    </div>
                  )}
                </Carte>
              );
              })}
            </div>
          </>
        }
      />
    </div>
  );
}
