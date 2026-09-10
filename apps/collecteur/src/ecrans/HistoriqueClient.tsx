import { formatMontant, MISES_PAR_CYCLE, soldeRestituable } from '@kolek/core';
import { BadgeStatut, Carte, Icone, Pagination, SqueletteLigne, usePagination, type Statut } from '@kolek/ui';
import { useState } from 'react';

import { useDonnees } from '../cache';
import { chargerHistoriqueCarte, type CarteFiche } from '../lectures-ecrans';
import { CorpsEcran, EnTeteEcran, RienAMontrer } from './EnTeteEcran';

/**
 * Toutes les cartes d'un client, et le passé de chacune.
 *
 * ## Pourquoi la carte est l'unité, et pas le mois
 *
 * Deux dessins ont été écartés le 2026-09-10, chacun pour une raison mesurée.
 *
 * Une pagination numérotée sur la liste des mises : dix numéros à 44 px font
 * 616 px, quand un téléphone d'entrée de gamme en offre 360. Arithmétiquement
 * impossible, pas « à ajuster ».
 *
 * Un regroupement par mois : le sélecteur ne connaîtrait que les mois déjà
 * chargés, donc il mentirait par omission à chaque « charger plus ».
 *
 * La carte, elle, est **bornée par le schéma** : `MISES_PAR_CYCLE` cases donc
 * au plus 31 mises, et `retraits.carte_id` est unique donc au plus un retrait.
 * Trente-deux lignes, pour toujours. Un niveau 2 qui ne peut pas déborder n'a
 * besoin ni de pagination, ni de « charger plus », ni de l'état qui va avec.
 *
 * ## Les deux montants, et pourquoi les deux
 *
 * Le niveau 1 affiche `soldeRestituable`, calculé. Le niveau 2 affiche le
 * `montant_restitue` **enregistré** le jour du retrait. Ils doivent concorder ;
 * s'ils divergent un jour, c'est un défaut de données, et le montrer aux deux
 * endroits le rend visible au lieu de l'arbitrer en silence. N'en garder qu'un
 * reviendrait à décider d'avance lequel a raison — sur de l'argent déjà versé,
 * ce n'est pas une décision d'écran.
 *
 * `soldeRestituable` et jamais `mise × misesEncaissees` : la première mise de
 * chaque carte est la commission du collecteur — cahier des charges, lignes 57
 * et 137. La multiplication naïve annoncerait une mise de trop à quelqu'un qui
 * vient contester un montant.
 */

/** Le statut d'une carte, dit par la seule table de statuts du produit. */
function statutDe(carte: CarteFiche): Statut {
  if (carte.statut === 'active') return 'Actif';
  // « Cycle terminé » est déjà le mot de `Retrait.tsx` et de `FicheClient.tsx`
  // pour une carte pleine. Un second mot pour le même état serait un défaut.
  return carte.misesEncaissees >= MISES_PAR_CYCLE ? 'Cycle terminé' : 'Clôturée';
}

/** « 01/02/2026 au 28/02/2026 », ou la seule date d'ouverture si elle court encore. */
function periode(carte: CarteFiche): string {
  const debut = new Date(carte.ouverteLe).toLocaleDateString('fr-FR');
  if (!carte.clotureeLe) return `Ouverte le ${debut}`;
  return `${debut} au ${new Date(carte.clotureeLe).toLocaleDateString('fr-FR')}`;
}

export function HistoriqueClient({
  nomClient,
  cartes,
  onFermer,
}: {
  nomClient: string;
  cartes: CarteFiche[];
  onFermer: () => void;
}) {
  const [carteOuverte, setCarteOuverte] = useState<string | null>(null);
  const { page, pages, total, visibles, allerA } = usePagination(cartes);

  // `find` et non l'objet gardé dans l'état : `cartes` peut être rechargée sous
  // l'écran, et un objet figé afficherait un compteur de mises périmé à côté
  // d'un historique frais.
  const ouverte = cartes.find((k) => k.id === carteOuverte) ?? null;

  if (ouverte) {
    return (
      <DetailCarte carte={ouverte} nomClient={nomClient} onRetour={() => setCarteOuverte(null)} />
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran
        titre="Toutes les cartes"
        sousTitre={nomClient}
        onRetour={onFermer}
        largeur="liste"
      />

      <CorpsEcran
        largeur="liste"
        enfants={
          cartes.length === 0 ? (
            <RienAMontrer
              icone="credit-card"
              titre="Aucune carte pour l’instant"
              detail="Dès qu’une carte sera ouverte pour ce client, elle apparaîtra ici avec tout son historique."
            />
          ) : (
            <Carte className="p-0 overflow-hidden">
              {/* Une pile de cartes **est** une liste, et le dire au lecteur
                  d'écran ne coûte rien : il annonce alors « liste de 3 éléments »
                  avant de lire la première, ce qu'une suite de `div` ne dit pas. */}
              <ul className="flex flex-col">
                {visibles.map((carte, rang) => (
                  <li
                    key={carte.id}
                    className={rang === visibles.length - 1 ? '' : 'border-b border-hairline'}
                  >
                    <button
                      type="button"
                      onClick={() => setCarteOuverte(carte.id)}
                      className="w-full p-4 flex items-center gap-3 text-left cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-body font-semibold text-sm text-ink">
                            Carte de {formatMontant(carte.mise)}
                          </p>
                          <BadgeStatut statut={statutDe(carte)} className="px-2 py-0.5" />
                        </div>
                        <p className="font-body text-xs text-muted-foreground mt-0.5">
                          {periode(carte)} · {carte.misesEncaissees}/{MISES_PAR_CYCLE}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-headings font-bold text-base text-ink tabular-nums">
                          {formatMontant(soldeRestituable(carte.misesEncaissees, carte.mise))}
                        </p>
                        <p className="text-xs font-body text-muted-foreground">à restituer</p>
                      </div>

                      <Icone
                        nom="chevron-right"
                        taille={18}
                        className="text-muted-foreground shrink-0"
                      />
                    </button>
                  </li>
                ))}
              </ul>

              <Pagination page={page} pages={pages} total={total} onAller={allerA} />
            </Carte>
          )
        }
      />
    </div>
  );
}

/**
 * Le passé d'une carte : ses mises, et sa clôture s'il y en a une.
 *
 * **Aucune pagination ici, et ce n'est pas un oubli.** Trente-deux lignes au
 * maximum, garanties par le schéma. Une pagination sous trente-deux lignes
 * apprendrait au collecteur à chercher une page suivante qui n'existe pas.
 *
 * Composant séparé, et pas un bloc conditionnel : `useDonnees` est un crochet,
 * il ne peut pas être appelé sous un `if`. Le séparer rend aussi le
 * démontage franc — sortir du détail annule le chargement en cours au lieu de
 * le laisser écrire dans un écran qu'on a quitté.
 */
function DetailCarte({
  carte,
  nomClient,
  onRetour,
}: {
  carte: CarteFiche;
  nomClient: string;
  onRetour: () => void;
}) {
  const { donnees: evenements, erreur } = useDonnees(
    `historique-carte-${carte.id}`,
    () => chargerHistoriqueCarte(carte.id),
    { messageErreur: 'Historique de cette carte indisponible. Vérifie le réseau.' },
  );

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran
        titre={`Carte de ${formatMontant(carte.mise)}`}
        sousTitre={`${nomClient} · ${periode(carte)}`}
        onRetour={onRetour}
        // La flèche remonte à la pile, pas à l'accueil. Le dire, sans quoi le
        // lecteur d'écran annonce la mauvaise destination.
        libelleRetour="Revenir aux cartes"
        largeur="liste"
      />

      <CorpsEcran
        largeur="liste"
        enfants={
          <>
            {erreur && (
              <p
                role="alert"
                className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md"
              >
                {erreur}
              </p>
            )}

            {!evenements && !erreur && (
              <Carte className="p-0 overflow-hidden divide-y divide-hairline">
                <SqueletteLigne />
                <SqueletteLigne />
                <SqueletteLigne />
              </Carte>
            )}

            {evenements?.length === 0 && (
              <RienAMontrer
                icone="receipt"
                titre="Aucune mise sur cette carte"
                detail="La carte est ouverte, mais rien n’y a encore été encaissé."
              />
            )}

            {evenements && evenements.length > 0 && (
              <Carte className="p-0 overflow-hidden">
                <ul className="flex flex-col">
                  {evenements.map((evenement, rang) => {
                    const quand = new Date(evenement.date);
                    const estRetrait = evenement.genre === 'retrait';

                    return (
                      <li
                        key={evenement.id}
                        className={`p-4 flex items-center gap-3 ${
                          rang === evenements.length - 1 ? '' : 'border-b border-hairline'
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-pill flex items-center justify-center shrink-0 ${
                            estRetrait ? 'bg-negative-tint' : 'bg-positive-tint'
                          }`}
                        >
                          <Icone
                            nom={estRetrait ? 'arrow-up-right' : 'arrow-down-right'}
                            taille={18}
                            className={estRetrait ? 'text-negative' : 'text-positive'}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="font-body font-semibold text-sm text-ink">
                            {estRetrait ? 'Retrait' : 'Mise'}
                          </p>
                          <p className="font-body text-xs text-muted-foreground">
                            {quand.toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <p
                            className={`font-headings font-bold text-base tabular-nums ${
                              estRetrait ? 'text-negative' : 'text-positive'
                            }`}
                          >
                            {formatMontant(evenement.montant)}
                          </p>
                          {/* Le drapeau vient de la base — `est_commission`,
                              posé par un déclencheur et unique par carte. Sans
                              lui, le client additionnerait trente-et-une mises
                              là où le solde restituable en compte trente. */}
                          {evenement.estCommission && (
                            <p className="text-xs font-body text-positive font-medium">
                              commission
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Carte>
            )}
          </>
        }
      />
    </div>
  );
}
