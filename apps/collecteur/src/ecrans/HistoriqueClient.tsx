import { formatMontant, MISES_PAR_CYCLE, soldeRestituable } from '@kolek/core';
import { BadgeStatut, Carte, Pagination, usePagination, type Statut } from '@kolek/ui';

import type { CarteFiche } from '../lectures-ecrans';
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
 * ## Le montant affiché
 *
 * `soldeRestituable`, jamais `mise × misesEncaissees`. La première mise de
 * chaque carte est la commission du collecteur — cahier des charges, lignes 57
 * et 137 : « le solde restituable n'est pas stocké mais calculé à la volée :
 * `(mises_encaissees − 1) × mise` — une seule source de vérité. » La
 * multiplication naïve annoncerait une mise de trop à quelqu'un qui vient
 * contester un montant.
 *
 * L'étiquette dit « à restituer » et non « collecté » : ce sont deux nombres
 * différents, et les confondre est précisément le défaut.
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
  const { page, pages, total, visibles, allerA } = usePagination(cartes);

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
                    <div className="p-4 flex items-center gap-3">
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
                    </div>
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
