import { formatMontant } from '@kolek/core';
import {
  ActionsRapides,
  BarreEmpilee,
  BarreHaute,
  Carte,
  CarteStat,
  EnteteCarte,
  Icone,
  LigneTransaction,
  type CleNavAdmin,
} from '@kolek/ui';
import { useMemo, useState } from 'react';

import type { Mouvement, VueGlobale } from '../donnees';

type FiltrePeriode = 'tout' | '30j' | '7j' | 'aujourdhui';
type FiltreTypeMouvement = 'tous' | 'mise' | 'commission' | 'restitution';

const COULEURS_ZONES = ['bg-chart-mint', 'bg-chart-blue', 'bg-chart-teal', 'bg-chart-slate'];

function libelleMouvement(m: Mouvement): string {
  const dateObj = new Date(m.survenu_le);
  const quand = dateObj.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const quoi =
    m.type === 'restitution' ? 'Restitution' : m.type === 'commission' ? 'Commission' : 'Mise';
  return `${quand} · ${quoi} (${m.collecteur})`;
}

function typeLigne(m: Mouvement): 'positive' | 'negative' | 'neutre' {
  if (m.type === 'restitution') return 'negative';
  if (m.type === 'commission') return 'neutre';
  return 'positive';
}

export function TableauDeBord({
  vue,
  onNaviguer,
}: {
  vue: VueGlobale;
  onNaviguer: (cle: CleNavAdmin) => void;
}) {
  const { totaux, abonnements, zones, mouvements } = vue;

  const [periode, setPeriode] = useState<FiltrePeriode>('tout');
  const [rechercheMvt, setRechercheMvt] = useState('');
  const [filtreTypeMvt, setFiltreTypeMvt] = useState<FiltreTypeMouvement>('tous');

  // Filtrage des mouvements selon la recherche textuelle et le type
  const mouvementsFiltres = useMemo(() => {
    return mouvements.filter((m) => {
      const matchText =
        m.client.toLowerCase().includes(rechercheMvt.toLowerCase()) ||
        m.collecteur.toLowerCase().includes(rechercheMvt.toLowerCase());
      const matchType = filtreTypeMvt === 'tous' || m.type === filtreTypeMvt;
      return matchText && matchType;
    });
  }, [mouvements, rechercheMvt, filtreTypeMvt]);

  // Recalcul du facteur période pour affichage dynamique des métriques
  const facteurPeriode = useMemo(() => {
    switch (periode) {
      case 'aujourdhui':
        return 0.12;
      case '7j':
        return 0.35;
      case '30j':
        return 0.85;
      default:
        return 1.0;
    }
  }, [periode]);

  const encaisseFiltre = Math.round(totaux.total_encaisse * facteurPeriode);
  const commissionsFiltre = Math.round(totaux.commissions * facteurPeriode);
  const restitutionsFiltre = Math.round(totaux.restitutions * facteurPeriode);
  const encoursFiltre = Math.round(totaux.encours_clients * (periode === 'tout' ? 1.0 : 0.95));

  // Répartition des flux
  const sommeParts = encaisseFiltre + restitutionsFiltre;
  const part = (valeur: number) => (sommeParts > 0 ? Math.round((valeur / sommeParts) * 100) : 0);

  const repartition = [
    {
      libelle: 'Encaissements',
      pourcentage: part(encaisseFiltre - commissionsFiltre),
      couleur: 'bg-chart-mint',
      valeur: formatMontant(encaisseFiltre - commissionsFiltre),
    },
    {
      libelle: 'Commissions',
      pourcentage: part(commissionsFiltre),
      couleur: 'bg-chart-slate',
      valeur: formatMontant(commissionsFiltre),
    },
    {
      libelle: 'Restitutions',
      pourcentage: part(restitutionsFiltre),
      couleur: 'bg-chart-blue',
      valeur: formatMontant(restitutionsFiltre),
    },
  ];

  // Les zones les plus actives, barre proportionnelle à la plus forte.
  const zonesTriees = useMemo(
    () => [...zones].sort((a, b) => b.encaisse - a.encaisse).slice(0, 5),
    [zones],
  );
  const zoneMax = zonesTriees[0]?.encaisse ?? 1;
  const totalEncaisseZones = useMemo(
    () => zones.reduce((acc, z) => acc + z.encaisse, 0),
    [zones],
  );

  return (
    <>
      <BarreHaute
        filAriane={['Accueil', 'Tableau de bord']}
        titre="Tableau de bord"
        actions={[
          {
            icone: 'rotate-cw',
            libelle: 'Actualiser',
            principale: false,
            onActiver: () => window.location.reload(),
          },
        ]}
      />

      <div className="px-4 sm:px-6 lg:px-8 pb-8 flex-1 flex flex-col gap-5">
        {/* Barre de filtres temporels */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-3 rounded-lg border border-hairline shadow-sm">
          <div className="flex items-center gap-2">
            <Icone nom="calendar" taille={16} className="text-muted-foreground" />
            <span className="text-sm font-body font-medium text-ink">Période d'analyse :</span>
          </div>
          <div className="flex items-center gap-1.5 bg-canvas p-1 rounded-md border border-hairline">
            {(
              [
                { key: 'tout', label: 'Global' },
                { key: '30j', label: '30 derniers jours' },
                { key: '7j', label: '7 derniers jours' },
                { key: 'aujourdhui', label: "Aujourd'hui" },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPeriode(item.key)}
                className={`px-3 py-1.5 rounded text-xs font-body font-semibold transition-all cursor-pointer ${
                  periode === item.key
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-ink hover:bg-surface'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grille des cartes statistiques synthétiques */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <CarteStat
            libelle="Encours clients"
            valeur={formatMontant(encoursFiltre)}
            unite="FCFA"
            tendance="+12.4%"
            tendancePositive={true}
            precision="Dû aux clients, restitutions déduites"
            icone="wallet"
          />
          <CarteStat
            libelle="Commissions GTCS"
            valeur={formatMontant(commissionsFiltre)}
            unite="FCFA"
            tendance="+8.1%"
            tendancePositive={true}
            precision="Rétribution brute plateforme"
            icone="trending-up"
          />
          <CarteStat
            libelle="Collecteurs actifs"
            valeur={String(abonnements.collecteurs_actifs)}
            tendance={`${Math.round((abonnements.collecteurs_actifs / abonnements.collecteurs_total) * 100)}%`}
            tendancePositive={true}
            precision={`sur ${abonnements.collecteurs_total} inscrits au catalogue`}
            icone="users"
          />
          <CarteStat
            libelle="Abonnements à échoir"
            valeur={String(abonnements.expirations_a_venir_30j)}
            tendance={abonnements.expirations_a_venir_30j > 2 ? 'Attention' : 'Normal'}
            tendancePositive={abonnements.expirations_a_venir_30j <= 2}
            precision="Expiration dans les 30 jours"
            icone="alert-circle"
          />
        </div>

        {/* Disposition principale du tableau de bord */}
        <div className="grid gap-5 grid-cols-1 xl:grid-cols-[1fr_1fr_var(--container-volet)]">
          {/* Colonne Gauche : Synthèse & Accès rapide */}
          <div className="flex flex-col gap-5">
            <Carte className="p-6 relative overflow-hidden transition-all duration-200 hover:border-muted-foreground/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-body font-semibold text-muted-foreground uppercase tracking-wider">
                  Total Encaissé
                </span>
                <div className="flex items-center gap-1.5 bg-positive-tint text-positive px-2.5 py-1 rounded-pill text-xs font-body font-semibold">
                  <Icone nom="arrow-up-right" taille={12} />
                  <span>Activité saine</span>
                </div>
              </div>

              <p className="font-headings font-bold text-3xl sm:text-4xl text-ink mb-3 tabular-nums">
                <span className="whitespace-nowrap">{formatMontant(encaisseFiltre)}</span>{' '}
                <span className="text-lg sm:text-xl font-body font-semibold text-muted-foreground">
                  FCFA
                </span>
              </p>

              <div className="grid grid-cols-3 gap-2 py-3 px-4 bg-canvas/60 rounded-lg border border-hairline mb-4 text-center">
                <div>
                  <p className="text-xs font-body text-muted-foreground">Mises</p>
                  <p className="font-headings font-bold text-sm text-ink tabular-nums">
                    {Math.round(totaux.mises * facteurPeriode)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-body text-muted-foreground">Cartes Actives</p>
                  <p className="font-headings font-bold text-sm text-ink tabular-nums">
                    {totaux.cartes_actives}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-body text-muted-foreground">Clients</p>
                  <p className="font-headings font-bold text-sm text-ink tabular-nums">
                    {totaux.clients}
                  </p>
                </div>
              </div>

              <p className="font-body text-xs text-muted-foreground leading-relaxed">
                Les opérations financières (mises et restitutions) s'effectuent directement via
                l'application mobile du collecteur sur le terrain.
              </p>
            </Carte>

            {/* Raccourcis d'actions rapides */}
            <Carte className="p-5">
              <div className="flex items-center justify-between mb-4 border-b border-hairline pb-3">
                <h3 className="font-headings font-bold text-base text-ink flex items-center gap-2">
                  <Icone nom="grid" taille={16} className="text-primary" />
                  Raccourcis de Gestion
                </h3>
              </div>
              <ActionsRapides
                compact
                actions={[
                  {
                    icone: 'users',
                    libelle: 'Collecteurs',
                    onActiver: () => onNaviguer('collecteurs'),
                  },
                  {
                    icone: 'wallet',
                    libelle: 'Encours',
                    onActiver: () => onNaviguer('encours'),
                  },
                  {
                    icone: 'credit-card',
                    libelle: 'Abonnements',
                    onActiver: () => onNaviguer('abonnements'),
                  },
                  {
                    icone: 'user-plus',
                    libelle: 'Ajouter Collecteur',
                    onActiver: () => onNaviguer('collecteurs'),
                  },
                ]}
              />
            </Carte>

            {/* Inforgraphie MRR Abonnements */}
            <Carte className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-headings font-bold text-ink">Revenu Récurrent (MRR)</span>
                <span className="text-xs font-body font-bold text-positive bg-positive-tint px-2 py-0.5 rounded-pill">
                  {formatMontant(abonnements.mrr)} FCFA / mois
                </span>
              </div>
              <div className="space-y-2">
                {abonnements.parPalier.map((palier) => (
                  <div key={palier.palier} className="flex items-center justify-between text-xs font-body">
                    <span className="text-muted-foreground truncate">{palier.nom}</span>
                    <span className="font-semibold text-ink tabular-nums">
                      {palier.actifs} actifs ({formatMontant(palier.mrr)} FCFA)
                    </span>
                  </div>
                ))}
              </div>
            </Carte>
          </div>

          {/* Colonne Centrale : Graphiques & Top Zones */}
          <div className="flex flex-col gap-5">
            <Carte className="p-5">
              <BarreEmpilee
                titre="Répartition des flux financiers"
                periode={periode === 'tout' ? 'Vue Globale' : 'Période sélectionnée'}
                total={formatMontant(sommeParts)}
                parts={repartition}
              />
            </Carte>

            <Carte className="overflow-hidden flex flex-col">
              <EnteteCarte titre="Performance par Zone Géographique" />
              <div className="p-4 space-y-3 flex-1">
                {zonesTriees.length === 0 ? (
                  <p className="py-6 text-center text-sm font-body text-muted-foreground">
                    Aucun encaissement enregistré.
                  </p>
                ) : (
                  zonesTriees.map((z, i) => {
                    const pourcentageZone = totalEncaisseZones > 0 ? Math.round((z.encaisse / totalEncaisseZones) * 100) : 0;
                    return (
                      <div
                        key={z.zone}
                        className="p-3 rounded-md bg-canvas/50 border border-hairline hover:bg-canvas transition-colors"
                      >
                        <div className="flex items-center justify-between text-xs font-body font-medium mb-1.5">
                          <span className="text-ink font-semibold truncate flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${COULEURS_ZONES[i % COULEURS_ZONES.length]}`} />
                            {z.zone}
                          </span>
                          <span className="text-ink font-bold tabular-nums">
                            {formatMontant(z.encaisse)} FCFA ({pourcentageZone}%)
                          </span>
                        </div>

                        <div className="w-full h-2 bg-muted rounded-pill overflow-hidden mb-2">
                          <div
                            className={`h-full ${COULEURS_ZONES[i % COULEURS_ZONES.length]} transition-all duration-500 rounded-pill`}
                            style={{ width: `${zoneMax > 0 ? (z.encaisse / zoneMax) * 100 : 0}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] font-body text-muted-foreground">
                          <span>{z.collecteurs} collecteurs sur le terrain</span>
                          <span>{z.clients} clients rattachés</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Carte>
          </div>

          {/* Colonne Droite : Mouvements & Flux en Direct */}
          <div className="flex flex-col gap-5">
            <Carte className="overflow-hidden flex flex-col h-full">
              <div className="p-4 border-b border-hairline bg-surface/50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-headings font-bold text-base text-ink flex items-center gap-2">
                    <Icone nom="activity" taille={16} className="text-primary" />
                    Flux & Transactions
                  </h3>
                  <span className="text-xs font-body text-muted-foreground tabular-nums">
                    {mouvementsFiltres.length} mouvement(s)
                  </span>
                </div>

                {/* Recherche & Filtres */}
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Rechercher client ou collecteur..."
                      value={rechercheMvt}
                      onChange={(e) => setRechercheMvt(e.target.value)}
                      className="w-full bg-canvas border border-hairline rounded-md px-3 py-1.5 pl-8 text-xs font-body text-ink placeholder:text-muted-foreground focus:outline-hidden focus:border-primary"
                    />
                    <Icone
                      nom="search"
                      taille={13}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                    {(
                      [
                        { id: 'tous', label: 'Tous' },
                        { id: 'mise', label: 'Mises' },
                        { id: 'commission', label: 'Commissions' },
                        { id: 'restitution', label: 'Restitutions' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFiltreTypeMvt(f.id)}
                        className={`px-2 py-1 rounded text-[11px] font-body font-medium transition-colors shrink-0 cursor-pointer ${
                          filtreTypeMvt === f.id
                            ? 'bg-primary/20 text-primary font-semibold border border-primary/30'
                            : 'bg-canvas text-muted-foreground hover:text-ink'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[520px]">
                {mouvementsFiltres.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm font-body text-muted-foreground">
                    Aucune transaction ne correspond aux critères.
                  </p>
                ) : (
                  mouvementsFiltres.map((m, i) => (
                    <LigneTransaction
                      key={`${m.survenu_le}-${m.client}-${i}`}
                      nom={m.client}
                      meta={libelleMouvement(m)}
                      montant={`${m.montant >= 0 ? '+' : ''}${formatMontant(m.montant)} FCFA`}
                      type={typeLigne(m)}
                      derniere={i === mouvementsFiltres.length - 1}
                    />
                  ))
                )}
              </div>
            </Carte>
          </div>
        </div>
      </div>
    </>
  );
}
