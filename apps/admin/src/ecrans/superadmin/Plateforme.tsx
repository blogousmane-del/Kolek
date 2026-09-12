import { Carte, CarteStat, Repli } from '@kolek/ui';

import type { EtatSuperAdmin } from '../../superadmin';
import { Sante } from './Sante';

/**
 * Les libellés des tables, repris de l'écran Réglages d'où cette section vient.
 */
const LIBELLES_VOLUMES: Record<string, string> = {
  collecteurs: 'Collecteurs',
  clients: 'Clients',
  cartes: 'Cartes',
  cartes_actives: 'Cartes actives',
  mises: 'Mises',
  retraits: 'Retraits',
  caisses_jour: 'Journées de caisse',
  audit_log: 'Lignes de journal',
  rejets_non_traites: 'Rejets de synchro non traités',
};

export function Plateforme({ etat }: { etat: EtatSuperAdmin }) {
  const rejets = etat.volumes.rejets_non_traites ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Sante sante={etat.sante} />

    <section>
      <h2 className="font-headings font-bold text-xl text-ink mb-1">Volumes et journal</h2>
      <p className="font-body text-sm text-muted-foreground mb-3">
        Mesuré à l'instant, côté serveur — ce n'est pas ce que le dépôt déclare, c'est ce que la
        base répond. Comptes exacts et non estimations du planificateur : sur des tables de cette
        taille, l'estimation peut être fausse de moitié.
      </p>

      <div data-testid="plateforme">
      <Carte className="p-5">
        {/* Les deux comptages qui ne sont pas de l’introspection : ceux-la
            se pilotent. Ils sortent de la grille et prennent une carte. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <CarteStat
            libelle="Rejets de synchro non traités"
            valeur={String(rejets)}
            precision={
              rejets > 0
                ? 'L’argent a changé de main : ces lignes attendent un arbitrage humain.'
                : 'Aucune mise refusée en attente.'
            }
            icone="alert-circle"
            alerte={rejets > 0}
          />
          <CarteStat
            libelle="Journées de caisse"
            valeur={String(etat.volumes.caisses_jour ?? 0)}
            precision="journées ouvertes depuis l’origine"
            icone="wallet"
          />
        </div>

        {/* L'alerte remonte ici, au-dessus du repli. Elle se deplace, elle ne
            se duplique pas : une epreuve lit getByRole('alert') au singulier. */}
        {rejets > 0 && (
          <p role="alert" className="font-body text-sm text-negative mb-5">
            Des mises ont été refusées à la synchronisation et attendent un arbitrage humain.
            L'argent a changé de main dans le monde réel : ces lignes ne doivent pas rester en
            attente.
          </p>
        )}

        {/* Le reste est de l’introspection de base. Utile, mais ce n’est pas du
            pilotage : ca se replie. Les deux cles promues sortent de la liste,
            sinon leurs libelles paraitraient deux fois. */}
        <Repli titre="Détail technique">
          <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            {Object.entries(etat.volumes)
              .filter(([table]) => table !== 'rejets_non_traites' && table !== 'caisses_jour')
              .map(([table, lignes]) => (
                <div key={table}>
                  <dt className="font-body text-sm text-muted-foreground truncate">
                    {LIBELLES_VOLUMES[table] ?? table}
                  </dt>
                  <dd className="font-headings font-bold text-lg text-ink tabular-nums">
                    {lignes}
                  </dd>
                </div>
              ))}
          </dl>
        </Repli>

        <p className="font-body text-sm font-semibold text-ink mt-5 mb-2">Tables journalisées</p>
        <p className="font-body text-xs text-muted-foreground mb-2">
          Lu dans <code>pg_trigger</code> : c'est la configuration en vigueur, pas une liste écrite
          à la main qui deviendrait fausse à la première migration. Le journal est en écriture
          seule — un déclencheur refuse toute modification, y compris par la clé de service.
        </p>
        <div className="flex flex-wrap gap-2">
          {etat.journal.tables.map((t) => (
            <span
              key={t}
              className="px-2.5 py-1 rounded-pill text-xs font-body font-medium bg-positive-tint text-positive"
            >
              {t}
            </span>
          ))}
        </div>

        <p className="font-body text-sm text-muted-foreground mt-4">
          {etat.postgres}
          {' · dernière écriture au journal '}
          {etat.journal.derniere_ecriture
            ? new Date(etat.journal.derniere_ecriture).toLocaleString('fr-FR')
            : 'aucune'}
        </p>
      </Carte>
      </div>
    </section>
    </div>
  );
}
