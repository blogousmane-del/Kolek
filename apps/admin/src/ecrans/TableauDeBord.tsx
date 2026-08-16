import {
  ActionsRapides,
  BarreEmpilee,
  BarreHaute,
  Bouton,
  Carte,
  CarteCollecte,
  CarteStat,
  EnteteCarte,
  EnteteSection,
  Icone,
  LienBloc,
  LigneTransaction,
} from '@kolek/ui';

/**
 * Écran de démonstration. Les agrégats du pilotage — solde géré, commissions,
 * répartition — traversent tous les locataires et passeront par des Edge
 * Functions au jalon J4 ; aucune de ces requêtes n'existe encore, et RLS
 * interdit à juste titre de les faire depuis le navigateur.
 */
const TRANSACTIONS = [
  { nom: 'Mariam Koné', meta: '14 jan · Mise', montant: '+1 000', type: 'positive' as const },
  { nom: 'Jean-Luc Bamba', meta: '14 jan · Mise', montant: '+500', type: 'positive' as const },
  {
    nom: 'Adja Touré',
    meta: '14 jan · Restitution',
    montant: '-31 000',
    type: 'negative' as const,
  },
  {
    nom: 'Commission Kouamé',
    meta: '14 jan · Commission',
    montant: '+4 800',
    type: 'neutre' as const,
  },
];

const ZONES = [
  { zone: 'Adjamé', encaisse: '284 000', pourcentage: 72, couleur: 'bg-chart-mint' },
  { zone: 'Plateau', encaisse: '196 000', pourcentage: 85, couleur: 'bg-chart-blue' },
  { zone: 'Yopougon', encaisse: '187 000', pourcentage: 54, couleur: 'bg-chart-teal' },
  { zone: 'Abobo', encaisse: '88 000', pourcentage: 38, couleur: 'bg-chart-slate' },
];

const REPARTITION = [
  {
    libelle: 'Encaissements',
    pourcentage: 60,
    couleur: 'bg-chart-mint',
    valeur: '329 340',
  },
  { libelle: 'Commissions', pourcentage: 22, couleur: 'bg-chart-slate', valeur: '120 758' },
  { libelle: 'Restitutions', pourcentage: 18, couleur: 'bg-chart-blue', valeur: '98 802' },
];

export function TableauDeBord() {
  return (
    <>
      <BarreHaute
        filAriane={['Accueil', 'Tableau de bord']}
        titre="Tableau de bord"
        actions={[
          { icone: 'search', libelle: 'Rechercher' },
          { icone: 'calendar', libelle: 'Calendrier' },
          { icone: 'plus', libelle: 'Créer un rapport', principale: true },
        ]}
      />

      <div className="px-8 pb-8 flex-1">
        <div className="grid grid-cols-4 gap-4 mb-5">
          <CarteStat
            libelle="Solde total géré"
            valeur="817 432"
            unite="FCFA"
            tendance="+8 %"
            icone="wallet"
          />
          <CarteStat
            libelle="Commissions du mois"
            valeur="42 290"
            unite="FCFA"
            tendance="+14 %"
            icone="trending-up"
          />
          <CarteStat libelle="Collecteurs actifs" valeur="18" tendance="+3" icone="users" />
          <CarteStat
            libelle="En retard / alertes"
            valeur="4"
            tendance="+1"
            tendancePositive={false}
            icone="alert-circle"
          />
        </div>

        <div className="grid gap-4 grid-cols-[1fr_1fr_var(--container-volet)]">
          {/* Colonne gauche */}
          <div className="flex flex-col gap-4">
            <Carte className="p-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-body font-medium text-muted-foreground">
                  Solde disponible
                </span>
                <div className="flex items-center gap-1 border border-hairline rounded-pill px-2.5 py-1">
                  <span className="text-xs font-body font-medium text-ink">FCFA</span>
                  <Icone nom="chevron-down" taille={11} className="text-muted-foreground" />
                </div>
              </div>
              <p className="font-headings font-bold text-4xl text-ink mb-4 tabular-nums">
                817 432{' '}
                <span className="text-xl font-body font-medium text-muted-foreground">FCFA</span>
              </p>
              <div className="flex gap-2">
                <Bouton icone="arrow-up-right" className="flex-1">
                  Retirer
                </Bouton>
                <Bouton variante="contour" icone="history" className="flex-1">
                  Historique
                </Bouton>
                <button
                  type="button"
                  aria-label="Autres actions"
                  className="w-11 h-11 rounded-pill border border-hairline flex items-center justify-center cursor-pointer"
                >
                  <Icone nom="more-horizontal" taille={16} className="text-muted-foreground" />
                </button>
              </div>
            </Carte>

            <Carte className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-headings font-bold text-lg text-ink">Accès rapide</h3>
              </div>
              <ActionsRapides compact />
            </Carte>
          </div>

          {/* Colonne centrale */}
          <div className="flex flex-col gap-4">
            <Carte className="p-5">
              <BarreEmpilee total="548 900" parts={REPARTITION} />
            </Carte>

            <Carte className="overflow-hidden">
              <EnteteCarte titre="Top Zones" action={<LienBloc libelle="Tout voir" />} />
              {ZONES.map((z, i) => (
                <div
                  key={z.zone}
                  className={`flex items-center gap-3 px-5 py-3.5 ${
                    i < ZONES.length - 1 ? 'border-b border-hairline' : ''
                  }`}
                >
                  <div className={`w-2 h-2 rounded-pill flex-shrink-0 ${z.couleur}`} />
                  <span className="flex-1 text-base font-body font-medium text-ink">{z.zone}</span>
                  <div className="w-24">
                    <div className="w-full h-1.5 bg-muted rounded-pill overflow-hidden">
                      <div
                        className={`h-full ${z.couleur} rounded-pill`}
                        style={{ width: `${z.pourcentage}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-body font-semibold text-ink w-28 text-right tabular-nums">
                    {z.encaisse} FCFA
                  </span>
                </div>
              ))}
            </Carte>
          </div>

          {/* Colonne droite */}
          <div className="flex flex-col gap-4">
            <div>
              <EnteteSection
                titre="Carte du jour"
                className="mb-2"
                action={<LienBloc libelle="Voir toutes" />}
              />
              <CarteCollecte
                nomClient="Mariam Koné"
                misePar="1 000"
                jourCourant={18}
                solde="18 000"
                cycle="3"
              />
            </div>

            <Carte className="overflow-hidden">
              <EnteteCarte titre="Dernières mises" action={<LienBloc libelle="Tout voir" />} />
              {TRANSACTIONS.map((t, i) => (
                <LigneTransaction key={t.nom} {...t} derniere={i === TRANSACTIONS.length - 1} />
              ))}
            </Carte>
          </div>
        </div>
      </div>
    </>
  );
}
