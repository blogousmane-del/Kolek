import { formatMontant, variation } from '@kolek/core';
import {
  ActionsRapides,
  BarreEmpilee,
  BarreHaute,
  Carte,
  CarteStat,
  CourbeEvolution,
  EnteteCarte,
  Icone,
  LigneTransaction,
  type CleNavAdmin,
  type PointCourbe,
} from '@kolek/ui';
import { useId, useMemo, useState } from 'react';

import { chargerTendances, type Periode, type Tendances, type VueGlobale } from '../donnees';

/**
 * Le tableau de bord, et les deux temps qu'il fait cohabiter.
 *
 * **Les flux se lisent sur une période, les stocks à l'instant.** Les mises et
 * les retraits portent une date : encaissé, commissions, restitutions et
 * mouvements se calculent donc sur la fenêtre choisie, et se comparent à la
 * fenêtre précédente de même longueur. L'encours, les collecteurs actifs et les
 * abonnements à échoir n'en ont pas : ce sont des états, pas des flux, et
 * chaque carte dit lequel des deux elle porte.
 *
 * **Un seul sélecteur de temps sur l'écran.** La version du 2026-09-05 en avait
 * un qui multipliait les totaux par des coefficients écrits à la main — 0,35
 * pour « 7 derniers jours » —, et l'audit du 2026-09-06 l'a remplacé par une
 * fenêtre locale sur la seule liste datée. Depuis que la base sait rendre une
 * période, la fenêtre locale disparaît : deux commandes de temps sur un même
 * écran, c'est une de trop, et c'est ce qui avait rendu la multiplication
 * crédible.
 *
 * **Aucun montant n'est calculé ici.** Le serveur tranche, l'écran affiche —
 * `variation()` ne fait que juger deux nombres qu'il a reçus.
 */

type FiltreTypeMouvement = 'tous' | 'mise' | 'commission' | 'restitution';

const PERIODES: { cle: Periode; libelle: string; phrase: string }[] = [
  { cle: 1, libelle: "Aujourd'hui", phrase: "aujourd'hui" },
  { cle: 7, libelle: '7 j', phrase: '7 derniers jours' },
  { cle: 30, libelle: '30 j', phrase: '30 derniers jours' },
];

const TYPES: { id: FiltreTypeMouvement; libelle: string }[] = [
  { id: 'tous', libelle: 'Tous' },
  { id: 'mise', libelle: 'Mises' },
  { id: 'commission', libelle: 'Commissions' },
  { id: 'restitution', libelle: 'Restitutions' },
];

type SerieCourbe = 'encaisse' | 'commissions' | 'mises';

const SERIES: { cle: SerieCourbe; libelle: string }[] = [
  { cle: 'encaisse', libelle: 'Encaissé' },
  { cle: 'commissions', libelle: 'Commissions' },
  { cle: 'mises', libelle: 'Mises' },
];

const COULEURS_ZONES = ['bg-chart-mint', 'bg-chart-blue', 'bg-chart-teal', 'bg-chart-slate'];

function libelleMouvement(m: { survenu_le: string; type: string; collecteur: string }): string {
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

function typeLigne(m: { type: string }): 'positive' | 'negative' | 'neutre' {
  if (m.type === 'restitution') return 'negative';
  if (m.type === 'commission') return 'neutre';
  return 'positive';
}

export function TableauDeBord({
  vue,
  onNaviguer,
  onRecharger,
  /** Remplacée dans les épreuves. Par défaut, la vraie route. */
  charger = chargerTendances,
}: {
  vue: VueGlobale;
  onNaviguer: (cle: CleNavAdmin) => void;
  onRecharger?: () => void;
  charger?: (jours: Periode) => Promise<Tendances>;
}) {
  // `vue.zones` et `vue.mouvements` ne sont plus lus ici : tout ce qui est daté
  // vient désormais de la période. Ils restent dans la vue globale pour la
  // fiche d'un collecteur, qui n'a pas de période.
  const { totaux, abonnements } = vue;

  const [periode, setPeriode] = useState<Periode>(7);
  const [tendances, setTendances] = useState<Tendances | null | undefined>(vue.tendances);
  const [serie, setSerie] = useState<SerieCourbe>('encaisse');
  const [rechercheMvt, setRechercheMvt] = useState('');
  const [filtreTypeMvt, setFiltreTypeMvt] = useState<FiltreTypeMouvement>('tous');
  const idRecherche = useId();

  // La première période arrive avec la vue ; les suivantes se demandent seules,
  // et seules — `partie=tendances` évite de retélécharger cinq cents cartes
  // pour recalculer un total.
  function choisirPeriode(jours: Periode) {
    if (jours === periode) return;
    setPeriode(jours);
    charger(jours)
      .then((t) => setTendances(t))
      // Une période qu'on n'a pas pu lire ne doit pas laisser les chiffres de
      // la précédente sous un libellé neuf : c'est ainsi qu'un écran ment.
      .catch(() => setTendances(null));
  }

  const phrase = PERIODES.find((p) => p.cle === periode)!.phrase;
  const varEncaisse = tendances
    ? variation(tendances.flux.encaisse, tendances.flux_precedent.encaisse)
    : null;
  const varCommissions = tendances
    ? variation(tendances.flux.commissions, tendances.flux_precedent.commissions)
    : null;
  const sansMise = tendances?.collecteurs_sans_mise ?? [];

  // Mémorisé : `tendances?.mouvements ?? []` rend un tableau neuf à chaque
  // rendu, et le `useMemo` qui en dépend ne mémoriserait alors rien.
  const mouvementsPeriode = useMemo(() => tendances?.mouvements ?? [], [tendances]);
  const mouvementsFiltres = useMemo(() => {
    const terme = rechercheMvt.trim().toLowerCase();

    return mouvementsPeriode.filter((m) => {
      if (filtreTypeMvt !== 'tous' && m.type !== filtreTypeMvt) return false;
      if (terme === '') return true;
      return m.client.toLowerCase().includes(terme) || m.collecteur.toLowerCase().includes(terme);
    });
  }, [mouvementsPeriode, rechercheMvt, filtreTypeMvt]);

  /** Un point par jour de la série, jours creux compris. */
  const points: PointCourbe[] = (tendances?.serie ?? []).map((p) => ({
    jour: p.jour,
    valeur: p[serie],
  }));
  const libelleSerie = SERIES.find((s) => s.cle === serie)!.libelle;

  // Répartition des flux **de la période**. La somme des trois parts vaut
  // l'encaissé plus les restitutions : la commission est prélevée *dans*
  // l'encaissé, elle ne s'y ajoute pas.
  const sommeParts = (tendances?.flux.encaisse ?? 0) + (tendances?.flux.restitutions ?? 0);
  const part = (valeur: number) => (sommeParts > 0 ? Math.round((valeur / sommeParts) * 100) : 0);
  const encaisseNet = (tendances?.flux.encaisse ?? 0) - (tendances?.flux.commissions ?? 0);

  const repartition = [
    {
      libelle: 'Encaissements',
      pourcentage: part(encaisseNet),
      couleur: 'bg-chart-mint',
      valeur: formatMontant(encaisseNet),
    },
    {
      libelle: 'Commissions',
      pourcentage: part(tendances?.flux.commissions ?? 0),
      couleur: 'bg-chart-slate',
      valeur: formatMontant(tendances?.flux.commissions ?? 0),
    },
    {
      libelle: 'Restitutions',
      pourcentage: part(tendances?.flux.restitutions ?? 0),
      couleur: 'bg-chart-blue',
      valeur: formatMontant(tendances?.flux.restitutions ?? 0),
    },
  ];

  // Les zones les plus actives **de la période**, déjà classées par la base.
  // On n'en montre que ce que la palette sait distinguer : une cinquième zone
  // reprendrait la couleur de la première, et deux pastilles identiques dans
  // une même liste se lisent comme une même chose.
  const zonesPeriode = tendances?.zones ?? [];
  const zonesTriees = zonesPeriode.slice(0, COULEURS_ZONES.length);
  const zoneMax = zonesTriees[0]?.encaisse ?? 1;
  const totalEncaisseZones = zonesPeriode.reduce((acc, z) => acc + z.encaisse, 0);

  return (
    <>
      <BarreHaute
        filAriane={['Accueil', 'Tableau de bord']}
        titre="Tableau de bord"
        actions={[
          {
            icone: 'refresh-cw',
            libelle: 'Actualiser',
            principale: false,
            // `recharger` plutôt que `window.location.reload()` : recharger la
            // page repose les polices, rejoue le portillon et perd la page
            // ouverte, pour rafraîchir un seul appel.
            onActiver: onRecharger,
          },
        ]}
      />

      <div className="px-4 sm:px-6 lg:px-8 pb-8 flex-1 flex flex-col gap-5">
        {/* Le seul sélecteur de temps de l'écran. Il commande les flux — cartes
            de période, mouvements — et rien d'autre : les stocks n'ont pas de
            période, et le dire est plus honnête que de les faire varier. */}
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Période" className="flex flex-wrap gap-2">
            {PERIODES.map((p) => (
              <button
                key={p.cle}
                type="button"
                aria-pressed={periode === p.cle}
                onClick={() => choisirPeriode(p.cle)}
                className={`px-3 py-1.5 rounded-pill border font-body text-sm font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  periode === p.cle
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-hairline text-ink'
                }`}
              >
                {p.libelle}
              </button>
            ))}
          </div>
          <span className="font-body text-sm text-muted-foreground">
            Les flux suivent cette période ; les stocks sont à l'instant.
          </span>
        </div>

        {!tendances && (
          <Carte className="p-5">
            <p className="font-body text-sm text-muted-foreground">
              Tendances indisponibles : la base n'a pas rendu les flux de la période. Les totaux
              ci-dessous restent à jour.
            </p>
          </Carte>
        )}

        {/* Deux cartes de flux, deux cartes d'état.

            Les deux premières portent une variation parce qu'une période
            précédente existe pour s'y comparer. Les deux dernières n'en portent
            aucune : `CarteStat` écrit « vs période précédente » sous chaque
            pastille, et y glisser un rapport — ou un stock — produirait une
            phrase fausse à partir d'un nombre juste. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <CarteStat
            libelle="Encaissé"
            valeur={formatMontant(tendances?.flux.encaisse ?? 0)}
            unite="FCFA"
            tendance={varEncaisse?.libelle}
            tendancePositive={varEncaisse?.positive ?? true}
            precision={varEncaisse ? undefined : `${phrase} · pas de comparaison possible`}
            icone="coins"
          />
          <CarteStat
            libelle="Commissions GTCS"
            valeur={formatMontant(tendances?.flux.commissions ?? 0)}
            unite="FCFA"
            tendance={varCommissions?.libelle}
            tendancePositive={varCommissions?.positive ?? true}
            precision={varCommissions ? undefined : `${phrase} · pas de comparaison possible`}
            icone="trending-up"
          />
          <CarteStat
            libelle="Encours clients"
            valeur={formatMontant(totaux.encours_clients)}
            unite="FCFA"
            precision="Dû aux clients, à l’instant"
            icone="wallet"
          />
          <CarteStat
            libelle="Sans mise depuis 7 jours"
            valeur={String(sansMise.length)}
            precision={`sur ${abonnements.collecteurs_actifs} collecteurs actifs`}
            icone="alert-circle"
          />
        </div>

        {/* Disposition principale du tableau de bord */}
        <div className="grid gap-5 grid-cols-1 xl:grid-cols-[1fr_1fr_var(--container-volet)]">
          {/* Colonne gauche : synthèse et accès rapide */}
          <div className="flex flex-col gap-5">
            <Carte className="p-6">
              <div className="flex items-center justify-between gap-3 mb-2">
                {/* Le cumul de toute la vie de la plateforme, et il le dit dans
                    son intitulé : sans cela, deux chiffres nommés « encaissé »
                    cohabiteraient sur un même écran sans qu'on sache lequel
                    parle de quoi. Aucune tendance ici — un cumul depuis
                    l'ouverture n'a rien à quoi se comparer. */}
                <span className="text-sm font-body font-semibold text-muted-foreground uppercase tracking-wider">
                  Total encaissé depuis l'ouverture
                </span>
              </div>

              <p className="font-headings font-bold text-3xl sm:text-4xl text-ink mb-3 tabular-nums">
                <span className="whitespace-nowrap">{formatMontant(totaux.total_encaisse)}</span>{' '}
                <span className="text-lg sm:text-xl font-body font-semibold text-muted-foreground">
                  FCFA
                </span>
              </p>

              <div className="grid grid-cols-3 gap-2 py-3 px-4 bg-canvas rounded-lg border border-hairline mb-4 text-center">
                <div>
                  <p className="text-xs font-body text-muted-foreground">Mises</p>
                  <p className="font-headings font-bold text-sm text-ink tabular-nums">
                    {totaux.mises}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-body text-muted-foreground">Cartes actives</p>
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
                Les opérations financières — mises et restitutions — se font depuis l'application
                du collecteur, sur le terrain.
              </p>
            </Carte>

            {/* Raccourcis d'actions rapides */}
            <Carte className="p-5">
              <div className="flex items-center justify-between mb-4 border-b border-hairline pb-3">
                <h3 className="font-headings font-bold text-base text-ink flex items-center gap-2">
                  <Icone nom="layout-dashboard" taille={16} className="text-primary" />
                  Raccourcis de gestion
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
                    libelle: 'Ajouter un collecteur',
                    onActiver: () => onNaviguer('collecteurs'),
                  },
                ]}
              />
            </Carte>

            {sansMise.length > 0 && (
              <Carte className="p-5">
                <h3 className="font-headings font-bold text-base text-ink mb-1">
                  Sans mise depuis 7 jours
                </h3>
                {/* Un abonnement actif qui n'encaisse plus est un client qui
                    part. C'est le seul signal de cet écran qui appelle un geste
                    hors de l'écran. */}
                <p className="font-body text-xs text-muted-foreground mb-3">
                  {sansMise.length} collecteur{sansMise.length > 1 ? 's' : ''} actif
                  {sansMise.length > 1 ? 's' : ''} sur {abonnements.collecteurs_actifs}
                </p>
                <ul className="flex flex-col gap-2">
                  {sansMise.slice(0, 5).map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between gap-3 text-xs font-body"
                    >
                      <span className="min-w-0 truncate text-ink font-semibold">
                        {c.nom}
                        {c.zone && <span className="text-muted-foreground"> · {c.zone}</span>}
                      </span>
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {c.derniere_mise ? `${c.jours_sans} jours` : 'jamais'}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => onNaviguer('collecteurs')}
                  className="mt-3 font-body text-sm font-semibold text-primary cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Voir les collecteurs
                </button>
              </Carte>
            )}

            {/* Revenu récurrent par palier */}
            <Carte className="p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-sm font-headings font-bold text-ink">
                  Revenu récurrent (MRR)
                </span>
                <span className="text-xs font-body font-bold text-positive bg-positive-tint px-2 py-0.5 rounded-pill shrink-0 tabular-nums">
                  {formatMontant(abonnements.mrr)} FCFA / mois
                </span>
              </div>
              <div className="space-y-2">
                {abonnements.parPalier.map((palier) => (
                  <div
                    key={palier.palier}
                    className="flex items-center justify-between gap-3 text-xs font-body"
                  >
                    <span className="text-muted-foreground truncate">{palier.nom}</span>
                    <span className="font-semibold text-ink tabular-nums shrink-0">
                      {palier.actifs} actifs ({formatMontant(palier.mrr)} FCFA)
                    </span>
                  </div>
                ))}
              </div>
              {/* Les échéances parlent d'abonnements : elles vivent ici, avec le
                  revenu récurrent, plutôt qu'en carte de tête où elles
                  voisinaient des flux du terrain. */}
              <div className="flex items-center justify-between gap-3 text-xs font-body pt-2 mt-2 border-t border-hairline">
                <span className="text-muted-foreground">Abonnements à échoir sous 30 jours</span>
                <span className="font-semibold text-ink tabular-nums">
                  {abonnements.expirations_a_venir_30j}
                </span>
              </div>
            </Carte>
          </div>

          {/* Colonne centrale : répartition et zones */}
          <div className="flex flex-col gap-5">
            <Carte className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="font-headings font-bold text-lg text-ink">Évolution</h3>
                {/* Les séries portent les mêmes mots que les filtres de
                    mouvement — « Commissions », « Mises ». Le groupe les
                    sépare, pour l'assistance comme pour les épreuves. */}
                <div role="group" aria-label="Série affichée" className="flex flex-wrap gap-2">
                  {SERIES.map((s) => (
                    <button
                      key={s.cle}
                      type="button"
                      aria-pressed={serie === s.cle}
                      onClick={() => setSerie(s.cle)}
                      className={`px-3 py-1.5 rounded-pill border font-body text-sm font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        serie === s.cle
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-hairline text-ink'
                      }`}
                    >
                      {s.libelle}
                    </button>
                  ))}
                </div>
              </div>

              <CourbeEvolution libelle={libelleSerie} points={points} formater={formatMontant} />
            </Carte>

            <Carte className="p-5">
              <BarreEmpilee
                titre="Répartition des flux financiers"
                periode={phrase}
                total={formatMontant(sommeParts)}
                parts={repartition}
              />
            </Carte>

            <Carte className="overflow-hidden flex flex-col">
              <EnteteCarte titre="Performance par zone" />
              <div className="p-4 space-y-3 flex-1">
                {zonesTriees.length === 0 ? (
                  <p className="py-6 text-center text-sm font-body text-muted-foreground">
                    Aucun encaissement enregistré.
                  </p>
                ) : (
                  zonesTriees.map((z, i) => {
                    const pourcentageZone =
                      totalEncaisseZones > 0 ? Math.round((z.encaisse / totalEncaisseZones) * 100) : 0;
                    return (
                      <div key={z.zone} className="p-3 rounded-md bg-canvas border border-hairline">
                        <div className="flex items-center justify-between gap-3 text-xs font-body font-medium mb-1.5">
                          <span className="text-ink font-semibold truncate flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-pill shrink-0 ${COULEURS_ZONES[i]}`}
                            />
                            {z.zone}
                          </span>
                          <span className="text-ink font-bold tabular-nums shrink-0">
                            {formatMontant(z.encaisse)} FCFA ({pourcentageZone} %)
                          </span>
                        </div>

                        <div className="w-full h-2 bg-muted rounded-pill overflow-hidden mb-2">
                          <div
                            className={`h-full ${COULEURS_ZONES[i]} rounded-pill`}
                            style={{ width: `${zoneMax > 0 ? (z.encaisse / zoneMax) * 100 : 0}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-3 text-xs font-body text-muted-foreground">
                          <span>{z.collecteurs} collecteurs sur le terrain</span>
                          <span>{formatMontant(z.mises)} mises</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Carte>
          </div>

          {/* Colonne droite : le flux des mouvements. La fenêtre de temps qui
              vivait ici est remontée en tête d'écran : elle commande désormais
              tout ce qui est daté, et plus seulement cette liste. */}
          <div className="flex flex-col gap-5">
            <Carte className="overflow-hidden flex flex-col h-full">
              <div className="p-4 border-b border-hairline">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="font-headings font-bold text-base text-ink flex items-center gap-2">
                    <Icone nom="history" taille={16} className="text-primary" />
                    Flux et transactions
                  </h3>
                  {/* « N sur M » : la base borne la liste à deux cents lignes,
                      et un écran qui montre une partie sans le dire laisse
                      croire qu'il montre tout. */}
                  <span className="text-xs font-body text-muted-foreground tabular-nums shrink-0">
                    {mouvementsFiltres.length}
                    {mouvementsFiltres.length > 1 ? ' mouvements' : ' mouvement'} sur{' '}
                    {formatMontant(tendances?.mouvements_total ?? 0)}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    {/* Une étiquette existe, elle est seulement masquée à l'œil :
                        un champ dont le seul intitulé est son texte d'invite
                        disparaît pour un lecteur d'écran dès qu'on y tape. */}
                    <label htmlFor={idRecherche} className="sr-only">
                      Rechercher un client ou un collecteur
                    </label>
                    <input
                      id={idRecherche}
                      type="search"
                      placeholder="Rechercher un client ou un collecteur…"
                      value={rechercheMvt}
                      onChange={(e) => setRechercheMvt(e.target.value)}
                      className="w-full bg-canvas border border-hairline rounded-md px-3 py-1.5 pl-8 text-champ font-body text-ink placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                    />
                    <Icone
                      nom="search"
                      taille={13}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>

                  {/* `aria-pressed` plutôt qu'une simple classe active : la
                      couleur dit l'état à l'œil, elle ne le dit à personne
                      d'autre. */}
                  <div
                    role="group"
                    aria-label="Type de mouvement"
                    className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none"
                  >
                    {TYPES.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={filtreTypeMvt === f.id}
                        onClick={() => setFiltreTypeMvt(f.id)}
                        className={`px-2 py-1 rounded text-xs font-body transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                          filtreTypeMvt === f.id
                            ? 'bg-primary/20 text-primary font-semibold border border-primary/30'
                            : 'bg-canvas text-muted-foreground font-medium hover:text-ink'
                        }`}
                      >
                        {f.libelle}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* `min-h-0` avec `flex-1` plutôt qu'une hauteur en dur : la carte
                  occupe la colonne, la liste occupe ce qui reste. Un plafond de
                  520 px laissait un vide sous la liste sur un grand écran et la
                  coupait au milieu sur un petit. */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {mouvementsFiltres.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm font-body text-muted-foreground">
                    {mouvementsPeriode.length === 0
                      ? 'Aucun mouvement sur cette période.'
                      : 'Aucun mouvement ne correspond à ces critères.'}
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
