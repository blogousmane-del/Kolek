import { MISES_PAR_CYCLE, formatMontant } from '@kolek/core';
import { Avatar, BadgeStatut, BarreHaute, Carte, type Statut } from '@kolek/ui';

import type { LigneCarte, VueGlobale } from '../donnees';

/**
 * Une seule déclaration de gabarit pour l'en-tête et les lignes. La maquette la
 * répétait à deux endroits : deux chaînes à tenir synchronisées pour que les
 * colonnes restent alignées, ce qui n'arrive jamais longtemps.
 */
const COLONNES = '200px 1fr 120px 140px 140px 100px';

/**
 * Les colonnes fixes et leurs gouttières valent près de 900 px. Sous ce
 * plancher, la colonne `1fr` du collecteur tomberait à quelques pixels et un nom
 * se tronquerait à une lettre.
 */
const LARGEUR_MINIMALE = 'min-w-[1060px]';

/**
 * Le statut d'une carte, tel que la base permet de le dire.
 *
 * « En retard » n'y figure pas, faute de pouvoir le calculer : il faudrait
 * comparer le rythme réel des mises à un rythme attendu, et rien n'enregistre le
 * rythme attendu. Une carte à 8 mises sur 31 est en retard si elle a trois mois,
 * à l'heure si elle a huit jours — et `ouverte_le` seul ne tranche pas, une
 * tournée pouvant légitimement sauter des jours.
 */
function statutDe(c: LigneCarte): Statut {
  if (c.statut === 'cloturee') return 'Clôturée';
  if (c.mises_encaissees >= MISES_PAR_CYCLE) return 'Versé aujourd’hui';
  return 'À jour';
}

export function EncoursSoldes({ vue }: { vue: VueGlobale }) {
  const { totaux, cartes, cartes_total_lignes } = vue;

  const indicateurs = [
    {
      libelle: 'Total encaissé',
      valeur: totaux.total_encaisse,
      precision: `${totaux.mises} mises`,
    },
    {
      libelle: 'Encours clients',
      valeur: totaux.encours_clients,
      precision: 'restitutions déduites',
    },
    {
      libelle: 'Restitutions',
      valeur: totaux.restitutions,
      precision: 'depuis l’ouverture',
    },
    {
      libelle: 'Commissions',
      valeur: totaux.commissions,
      precision: 'une par carte ouverte',
    },
  ];

  return (
    <>
      <BarreHaute filAriane={['Accueil', 'Encours & Soldes']} titre="Encours & Soldes" actions={[]} />

      <div className="px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 overflow-y-auto">
        {/* Indicateurs. La maquette recopiait quatre fois le même bloc ; ici la
            forme est écrite une fois et nourrie par une liste. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
          {indicateurs.map((indicateur) => (
            <Carte key={indicateur.libelle} className="p-5">
              <span className="text-sm font-body font-medium text-muted-foreground mb-1 block">
                {indicateur.libelle}
              </span>
              <p className="font-headings font-bold text-2xl sm:text-3xl text-ink mb-3 tabular-nums">
                {formatMontant(indicateur.valeur)}{' '}
                <span className="text-base sm:text-lg font-body font-medium text-muted-foreground">
                  FCFA
                </span>
              </p>
              {/* Aucune tendance : la base ne garde aucun instantané du passé,
                  donc aucune variation n'est calculable. Une précision factuelle
                  vaut mieux qu'un pourcentage inventé. */}
              <span className="text-sm font-body text-muted-foreground">
                {indicateur.precision}
              </span>
            </Carte>
          ))}
        </div>

        <Carte className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-hairline">
            <h2 className="font-headings font-bold text-xl text-ink">Détail par carte</h2>
            <span className="text-sm font-body text-muted-foreground tabular-nums">
              {cartes.length < cartes_total_lignes
                ? `${cartes.length} des ${cartes_total_lignes} cartes`
                : `${cartes_total_lignes} carte${cartes_total_lignes > 1 ? 's' : ''}`}
            </span>
          </div>

          {cartes.length === 0 ? (
            <p className="px-4 sm:px-6 py-8 text-sm font-body text-muted-foreground">
              Aucune carte ouverte. Les collecteurs en créent depuis l’application mobile.
            </p>
          ) : (
            /* `overflow-x-auto` : six colonnes à largeur fixe ne tiennent pas sur
               un poste étroit. Sans ça, c'est la page entière qui défile
               latéralement et la barre latérale part avec. */
            <div className="overflow-x-auto">
              <div className={LARGEUR_MINIMALE}>
                <div
                  className="grid px-4 sm:px-6 py-3 bg-canvas border-b border-hairline text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground gap-4"
                  style={{ gridTemplateColumns: COLONNES }}
                >
                  <span>Client</span>
                  <span>Collecteur</span>
                  <span className="text-right">Cycle</span>
                  <span className="text-right">Encours</span>
                  <span className="text-right">Solde rest.</span>
                  <span className="text-right">Statut</span>
                </div>

                {cartes.map((c, i) => (
                  <div
                    key={c.id}
                    className={`grid items-center px-4 sm:px-6 py-3.5 gap-4 ${
                      i < cartes.length - 1 ? 'border-b border-hairline' : ''
                    }`}
                    style={{ gridTemplateColumns: COLONNES }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar nom={c.client} className="w-8 h-8 flex-shrink-0" />
                      <span className="text-base font-body font-semibold text-ink truncate">
                        {c.client}
                      </span>
                    </div>
                    <span className="text-sm font-body text-muted-foreground truncate">
                      {c.collecteur}
                    </span>
                    <span className="text-right text-base font-body font-medium text-ink tabular-nums">
                      {c.mises_encaissees}/{MISES_PAR_CYCLE}
                    </span>
                    <span className="text-right text-base font-body font-bold text-positive tabular-nums">
                      {formatMontant(c.encours)}
                    </span>
                    <span className="text-right text-base font-body font-bold text-ink tabular-nums">
                      {formatMontant(c.solde_restituable)}
                    </span>
                    <div className="flex justify-end">
                      <BadgeStatut statut={statutDe(c)} />
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
