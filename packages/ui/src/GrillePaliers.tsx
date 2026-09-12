import { PALIERS, formatMontant, type LignePalier } from '@kolek/core';

import { Carte } from './Carte';
import { Icone } from './Icone';

/**
 * Les quatre paliers vendus, ce qu'ils contiennent, et ce qu'ils rapportent.
 *
 * Le bloc vivait en double : l'ecran Abonnements du Dashboard et l'onglet
 * Facturation du Super Admin le rendaient a l'identique, a un commentaire et
 * une apostrophe pres. Les deux ecrans parlent au meme public — la
 * monetisation est le metier de GTCS — et un prix corrige d'un seul cote
 * aurait fini par mentir de l'autre.
 *
 * La grille parcourt `PALIERS` et non les comptes recus : un palier vendu que
 * la reponse ne compte pas doit apparaitre a zero plutot que de disparaitre.
 *
 * Le titre appartient au composant : c'est lui qui met fin a la divergence des
 * deux libelles.
 */
export function GrillePaliers({ parPalier }: { parPalier: LignePalier[] }) {
  return (
    <div>
      <h2 className="font-headings font-bold text-xl text-ink mb-3">Paliers d’abonnement</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {PALIERS.map((palier) => {
          const compte = parPalier.find((p) => p.palier === palier.cle);
          const actifs = compte?.actifs ?? 0;
          return (
            <Carte key={palier.cle} className="overflow-hidden flex flex-col">
              <div className="h-1.5 w-full" style={{ background: palier.teinte }} />
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <span className="font-headings font-bold text-lg text-ink">{palier.nom}</span>
                  <span className="text-2xl font-headings font-bold text-ink tabular-nums text-right">
                    {palier.prix === 0 ? (
                      <span className="text-muted-foreground text-lg">Gratuit</span>
                    ) : (
                      <>
                        {formatMontant(palier.prix)}{' '}
                        <span className="text-xs font-body font-medium text-muted-foreground">
                          FCFA/mois
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <p className="text-sm font-body text-muted-foreground mb-3">{palier.limite}</p>

                {/* Seules les fonctions incluses : sur un ecran d'administration
                    la liste sert a reconnaitre un palier, pas a comparer une
                    offre. Les absences appartiennent a la page de vente. */}
                {palier.fonctions
                  .filter((f) => f.incluse)
                  .map((fonction) => (
                    <div key={fonction.libelle} className="flex items-center gap-2 mb-1.5">
                      <Icone nom="check" taille={13} className="text-positive flex-shrink-0" />
                      <span className="text-sm font-body text-ink">{fonction.libelle}</span>
                    </div>
                  ))}

                <div className="mt-auto pt-3 border-t border-hairline flex items-center justify-between">
                  <span className="text-sm font-body text-muted-foreground">
                    {actifs} actif{actifs > 1 ? 's' : ''}
                  </span>
                  <span className="text-sm font-body font-semibold text-ink tabular-nums">
                    {mrrLisible(compte?.mrr ?? 0)}
                  </span>
                </div>
              </div>
            </Carte>
          );
        })}
      </div>
    </div>
  );
}

/** Un MRR nul se lit « — » et non « 0 FCFA » : le collecteur est en essai, il ne
    paie pas encore ; zero laisserait croire a un impaye. */
export function mrrLisible(mrr: number): string {
  return mrr === 0 ? '—' : `${formatMontant(mrr)} FCFA`;
}
