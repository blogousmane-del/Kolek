import { PALIERS, formatMontant } from '@kolek/core';
import { Avatar, BadgeStatut, BarreHaute, Carte, Icone } from '@kolek/ui';

import type { LigneCollecteur, VueGlobale } from '../donnees';

/**
 * Gestion des abonnements.
 *
 * ---
 *
 * Cet écran listait des *organisations* — une entité employant plusieurs
 * collecteurs, avec un responsable et son propre MRR. Ce modèle venait des
 * maquettes ; la base n'a jamais rien porté de tel. L'arbitrage du 2026-08-20 a
 * tranché en faveur du cahier des charges §5 : **le client payant est un
 * collecteur**. L'écran liste donc des collecteurs, et les montants sont ceux
 * du cahier — 0 / 2 500 / 5 000 / 10 000 FCFA.
 *
 * Le MRR est calculé côté serveur, dans l'Edge Function, en croisant le nombre
 * de collecteurs actifs par palier avec la grille tarifaire. Il ne compte que
 * les abonnements `actif` : un abonnement suspendu ou expiré n'encaisse rien, et
 * l'inscrire au revenu récurrent reviendrait à annoncer de l'argent qui n'arrive
 * pas.
 *
 * Ce qui n'est pas affiché mérite d'être nommé. Le « taux de renouvellement »
 * de la maquette supposerait un historique des abonnements : qui a renouvelé, et
 * qui ne l'a pas fait. La base ne garde que l'état courant — `abonnement_statut`
 * et `abonnement_echeance` — sans aucune trace des états passés. Ce taux est
 * donc incalculable aujourd'hui, et il vaut mieux une case en moins qu'un
 * pourcentage inventé.
 *
 * Écart assumé avec la maquette : elle dessinait une barre latérale « Super
 * Admin » distincte, plus sombre, avec sa propre navigation. L'écran vit ici
 * dans la coquille d'administration existante — deux barres latérales pour un
 * même produit, c'est deux endroits où ajouter chaque future entrée.
 */

const COLONNES = '1fr 140px 110px 120px 130px 130px';
const LARGEUR_MINIMALE = 'min-w-[960px]';

/** Un MRR nul se lit « — » et non « 0 FCFA » : le collecteur est en essai, il ne
    paie pas encore ; zéro laisserait croire à un impayé. */
function mrrLisible(mrr: number): string {
  return mrr === 0 ? '—' : `${formatMontant(mrr)} FCFA`;
}

function dateLisible(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function PastillePalier({ palier }: { palier: string }) {
  const description = PALIERS.find((p) => p.cle === palier);
  if (!description) {
    // Un palier absent de la grille est une incohérence de données, pas un cas
    // d'affichage : le dire plutôt que de rendre une pastille vide.
    return (
      <span className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold bg-negative-tint text-negative whitespace-nowrap">
        {palier} ?
      </span>
    );
  }
  return (
    <span
      className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold w-fit whitespace-nowrap"
      style={{ background: description.fond, color: description.texte }}
    >
      {description.nom}
    </span>
  );
}

function PastilleStatut({ c }: { c: LigneCollecteur }) {
  if (c.abonnement_statut === 'actif') {
    const joursRestants = Math.ceil(
      (new Date(c.abonnement_echeance).getTime() - Date.now()) / 86_400_000,
    );
    if (joursRestants <= 7) {
      return (
        <span className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold bg-negative-tint text-negative whitespace-nowrap">
          Expire dans {Math.max(joursRestants, 0)} j
        </span>
      );
    }
    return <BadgeStatut statut="Actif" />;
  }
  return (
    <span className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold bg-negative-tint text-negative whitespace-nowrap">
      {c.abonnement_statut === 'suspendu' ? 'Suspendu' : 'Expiré'}
    </span>
  );
}

export function Abonnements({ vue }: { vue: VueGlobale }) {
  const { abonnements, collecteurs } = vue;
  const prixParPalier = new Map(abonnements.parPalier.map((p) => [p.palier, p.prix]));

  const indicateurs = [
    {
      libelle: 'MRR total',
      valeur: formatMontant(abonnements.mrr),
      unite: 'FCFA',
      precision: `${abonnements.collecteurs_actifs} abonnement${abonnements.collecteurs_actifs > 1 ? 's' : ''} actif${abonnements.collecteurs_actifs > 1 ? 's' : ''}`,
      alerte: false,
    },
    {
      libelle: 'Collecteurs actifs',
      valeur: String(abonnements.collecteurs_actifs),
      unite: '',
      precision: `sur ${abonnements.collecteurs_total} inscrits`,
      alerte: false,
    },
    {
      libelle: 'Expirations ce mois',
      valeur: String(abonnements.expirations_ce_mois),
      unite: '',
      precision: `${abonnements.expirations_a_venir_30j} dans les 30 jours`,
      alerte: abonnements.expirations_ce_mois > 0,
    },
    {
      libelle: 'En défaut',
      valeur: String(abonnements.suspendus + abonnements.expires),
      unite: '',
      precision: `${abonnements.suspendus} suspendus, ${abonnements.expires} expirés`,
      alerte: abonnements.suspendus + abonnements.expires > 0,
    },
  ];

  return (
    <>
      <BarreHaute
        filAriane={['Accueil', 'Abonnements']}
        titre="Gestion des abonnements"
        actions={[
          { icone: 'download', libelle: 'Exporter', disponible: false },
          { icone: 'plus', libelle: 'Nouvel abonnement', principale: true, disponible: false },
        ]}
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 overflow-y-auto">
        {/* Indicateurs — deux colonnes sur petit écran, quatre au-delà. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {indicateurs.map((indicateur) => (
            <Carte key={indicateur.libelle} className="p-5">
              <span className="text-sm font-body font-medium text-muted-foreground block mb-1">
                {indicateur.libelle}
              </span>
              <p
                className={`font-headings font-bold text-2xl sm:text-3xl tabular-nums ${
                  indicateur.alerte ? 'text-negative' : 'text-ink'
                }`}
              >
                {indicateur.valeur}
                {indicateur.unite && (
                  <span className="text-lg font-body font-medium text-muted-foreground ml-1">
                    {indicateur.unite}
                  </span>
                )}
              </p>
              <span className="text-sm font-body text-muted-foreground mt-2 block">
                {indicateur.precision}
              </span>
            </Carte>
          ))}
        </div>

        {/* Paliers */}
        <div>
          <h2 className="font-headings font-bold text-xl text-ink mb-3">Paliers d’abonnement</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {PALIERS.map((palier) => {
              const compte = abonnements.parPalier.find((p) => p.palier === palier.cle);
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

                    {/* Seules les fonctions incluses : sur l'écran d'administration
                        la liste sert à reconnaître un palier, pas à comparer une
                        offre. Les absences appartiennent à la page de vente. */}
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
                        {compte?.actifs ?? 0} actif{(compte?.actifs ?? 0) > 1 ? 's' : ''}
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

        {/* Abonnés */}
        <Carte className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-hairline">
            <h2 className="font-headings font-bold text-xl text-ink">Abonnés</h2>
            <span className="text-sm font-body text-muted-foreground tabular-nums">
              {collecteurs.length} collecteur{collecteurs.length > 1 ? 's' : ''}
            </span>
          </div>

          {collecteurs.length === 0 ? (
            <p className="px-4 sm:px-6 py-8 text-sm font-body text-muted-foreground">
              Aucun abonné. Les comptes sont créés par GTCS — l’inscription publique est fermée.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className={LARGEUR_MINIMALE}>
                <div
                  className="grid px-4 sm:px-6 py-3 bg-canvas border-b border-hairline text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground gap-4"
                  style={{ gridTemplateColumns: COLONNES }}
                >
                  <span>Collecteur</span>
                  <span>Zone</span>
                  <span>Palier</span>
                  <span className="text-right">MRR</span>
                  <span className="text-right">Échéance</span>
                  <span className="text-right">Statut</span>
                </div>

                {collecteurs.map((c, i) => (
                  <div
                    key={c.id}
                    className={`grid items-center px-4 sm:px-6 py-3.5 gap-4 ${
                      i < collecteurs.length - 1 ? 'border-b border-hairline' : ''
                    }`}
                    style={{ gridTemplateColumns: COLONNES }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar nom={c.nom} className="w-8 h-8 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-base font-body font-semibold text-ink truncate">
                          {c.nom}
                        </p>
                        <p className="text-xs font-body text-muted-foreground truncate">
                          {c.telephone}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-body text-muted-foreground truncate">
                      {c.zone ?? 'Sans zone'}
                    </span>
                    <PastillePalier palier={c.palier} />
                    <span className="text-right text-sm font-body font-semibold text-ink tabular-nums">
                      {mrrLisible(
                        c.abonnement_statut === 'actif' ? (prixParPalier.get(c.palier) ?? 0) : 0,
                      )}
                    </span>
                    <span className="text-right text-sm font-body text-muted-foreground tabular-nums">
                      {dateLisible(c.abonnement_echeance)}
                    </span>
                    <div className="flex justify-end">
                      <PastilleStatut c={c} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Carte>
      </div>
    </>
  );
}
