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
import { useId, useMemo, useState } from 'react';

import type { Mouvement, VueGlobale } from '../donnees';

/**
 * Fenêtre de lecture du flux des mouvements.
 *
 * **Elle ne s'applique qu'aux mouvements, et c'est tout ce qu'elle peut faire.**
 * `VueGlobale.totaux` est un agrégat sans dimension temporelle : la base ne rend
 * ni l'encaissé des sept derniers jours, ni celui d'hier. Seuls les mouvements
 * portent une date, `survenu_le`, donc seuls les mouvements se filtrent.
 *
 * La version du 2026-09-05 faisait autrement : elle multipliait les totaux réels
 * par 0,12 / 0,35 / 0,85 selon la période choisie, et affichait le produit comme
 * un montant. « 7 derniers jours » rendait 35 % de l'encaissé depuis l'ouverture
 * — un nombre qui ne mesurait rien. Sur une plateforme qui manipule l'argent
 * d'autrui, un chiffre inventé qui a l'air d'un chiffre lu est le pire des deux
 * mondes : il se croit, et il se cite.
 */
type FenetreMouvements = 'tout' | '30j' | '7j' | 'aujourdhui';
type FiltreTypeMouvement = 'tous' | 'mise' | 'commission' | 'restitution';

const FENETRES: { cle: FenetreMouvements; libelle: string; jours: number | null }[] = [
  { cle: 'tout', libelle: 'Tout', jours: null },
  { cle: '30j', libelle: '30 j', jours: 30 },
  { cle: '7j', libelle: '7 j', jours: 7 },
  { cle: 'aujourdhui', libelle: "Aujourd'hui", jours: 1 },
];

const TYPES: { id: FiltreTypeMouvement; libelle: string }[] = [
  { id: 'tous', libelle: 'Tous' },
  { id: 'mise', libelle: 'Mises' },
  { id: 'commission', libelle: 'Commissions' },
  { id: 'restitution', libelle: 'Restitutions' },
];

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

/** Le début de la fenêtre. `aujourdhui` compte depuis minuit local, pas depuis
    « il y a vingt-quatre heures » : c'est ce que l'administrateur entend par
    aujourd'hui, et c'est aussi la journée que le collecteur déclare en caisse. */
function debutFenetre(jours: number | null): number | null {
  if (jours === null) return null;
  const debut = new Date();
  debut.setHours(0, 0, 0, 0);
  if (jours > 1) debut.setDate(debut.getDate() - (jours - 1));
  return debut.getTime();
}

export function TableauDeBord({
  vue,
  onNaviguer,
  onRecharger,
}: {
  vue: VueGlobale;
  onNaviguer: (cle: CleNavAdmin) => void;
  onRecharger?: () => void;
}) {
  const { totaux, abonnements, zones, mouvements } = vue;

  const [fenetre, setFenetre] = useState<FenetreMouvements>('tout');
  const [rechercheMvt, setRechercheMvt] = useState('');
  const [filtreTypeMvt, setFiltreTypeMvt] = useState<FiltreTypeMouvement>('tous');
  const idRecherche = useId();

  const mouvementsFiltres = useMemo(() => {
    const jours = FENETRES.find((f) => f.cle === fenetre)?.jours ?? null;
    const seuil = debutFenetre(jours);
    const terme = rechercheMvt.trim().toLowerCase();

    return mouvements.filter((m) => {
      if (seuil !== null && new Date(m.survenu_le).getTime() < seuil) return false;
      if (filtreTypeMvt !== 'tous' && m.type !== filtreTypeMvt) return false;
      if (terme === '') return true;
      return (
        m.client.toLowerCase().includes(terme) || m.collecteur.toLowerCase().includes(terme)
      );
    });
  }, [mouvements, rechercheMvt, filtreTypeMvt, fenetre]);

  // Répartition des flux, sur les totaux tels qu'ils sortent de la base. La
  // somme des trois parts vaut l'encaissé plus les restitutions : la commission
  // est prélevée *dans* l'encaissé, elle ne s'y ajoute pas.
  const sommeParts = totaux.total_encaisse + totaux.restitutions;
  const part = (valeur: number) => (sommeParts > 0 ? Math.round((valeur / sommeParts) * 100) : 0);
  const encaisseNet = totaux.total_encaisse - totaux.commissions;

  const repartition = [
    {
      libelle: 'Encaissements',
      pourcentage: part(encaisseNet),
      couleur: 'bg-chart-mint',
      valeur: formatMontant(encaisseNet),
    },
    {
      libelle: 'Commissions',
      pourcentage: part(totaux.commissions),
      couleur: 'bg-chart-slate',
      valeur: formatMontant(totaux.commissions),
    },
    {
      libelle: 'Restitutions',
      pourcentage: part(totaux.restitutions),
      couleur: 'bg-chart-blue',
      valeur: formatMontant(totaux.restitutions),
    },
  ];

  // Les zones les plus actives, barre proportionnelle à la plus forte. On n'en
  // montre que ce que la palette sait distinguer : une cinquième zone reprendrait
  // la couleur de la première, et deux pastilles identiques dans une même liste
  // se lisent comme une même chose.
  const zonesTriees = useMemo(
    () => [...zones].sort((a, b) => b.encaisse - a.encaisse).slice(0, COULEURS_ZONES.length),
    [zones],
  );
  const zoneMax = zonesTriees[0]?.encaisse ?? 1;
  const totalEncaisseZones = useMemo(() => zones.reduce((acc, z) => acc + z.encaisse, 0), [zones]);

  const tauxActifs =
    abonnements.collecteurs_total > 0
      ? Math.round((abonnements.collecteurs_actifs / abonnements.collecteurs_total) * 100)
      : 0;

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
        {/* Grille des cartes statistiques synthétiques.

            **Aucune `tendance` n'est passée, sur aucune des quatre cartes.**
            `CarteStat` documente la règle en toutes lettres — la base ne garde
            aucun instantané d'hier, donc aucun pourcentage de variation n'est
            calculable — et le composant fait plus que porter le chiffre : il
            écrit « vs période précédente » sous le badge. Y glisser un taux
            d'activité, qui est un rapport et non une variation, produirait donc
            une phrase fausse à partir d'un nombre juste. Le rapport se dit dans
            `precision`, où rien ne prétend le comparer à hier. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <CarteStat
            libelle="Encours clients"
            valeur={formatMontant(totaux.encours_clients)}
            unite="FCFA"
            precision="Dû aux clients, restitutions déduites"
            icone="wallet"
          />
          <CarteStat
            libelle="Commissions GTCS"
            valeur={formatMontant(totaux.commissions)}
            unite="FCFA"
            precision="Rétribution brute de la plateforme"
            icone="trending-up"
          />
          <CarteStat
            libelle="Collecteurs actifs"
            valeur={String(abonnements.collecteurs_actifs)}
            precision={`${tauxActifs} % des ${abonnements.collecteurs_total} inscrits au catalogue`}
            icone="users"
          />
          <CarteStat
            libelle="Abonnements à échoir"
            valeur={String(abonnements.expirations_a_venir_30j)}
            precision="Expiration dans les 30 jours"
            icone="alert-circle"
          />
        </div>

        {/* Disposition principale du tableau de bord */}
        <div className="grid gap-5 grid-cols-1 xl:grid-cols-[1fr_1fr_var(--container-volet)]">
          {/* Colonne gauche : synthèse et accès rapide */}
          <div className="flex flex-col gap-5">
            <Carte className="p-6">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-sm font-body font-semibold text-muted-foreground uppercase tracking-wider">
                  Total encaissé
                </span>
                {/* Une date, pas un jugement. « Activité saine » était un avis
                    en dur, affiché quels que soient les chiffres — un badge qui
                    dit toujours la même chose ne dit rien. */}
                <span className="text-xs font-body text-muted-foreground shrink-0">
                  Depuis l'ouverture
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
            </Carte>
          </div>

          {/* Colonne centrale : répartition et zones */}
          <div className="flex flex-col gap-5">
            <Carte className="p-5">
              <BarreEmpilee
                titre="Répartition des flux financiers"
                periode="Depuis l'ouverture"
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
                          <span>{z.clients} clients rattachés</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Carte>
          </div>

          {/* Colonne droite : le flux des mouvements — le seul endroit de l'écran
              où une fenêtre temporelle a un sens, puisque c'est le seul jeu de
              données qui porte une date. Les trois commandes sont donc ici, et
              nulle part ailleurs. */}
          <div className="flex flex-col gap-5">
            <Carte className="overflow-hidden flex flex-col h-full">
              <div className="p-4 border-b border-hairline">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="font-headings font-bold text-base text-ink flex items-center gap-2">
                    <Icone nom="history" taille={16} className="text-primary" />
                    Flux et transactions
                  </h3>
                  <span className="text-xs font-body text-muted-foreground tabular-nums shrink-0">
                    {mouvementsFiltres.length}
                    {mouvementsFiltres.length > 1 ? ' mouvements' : ' mouvement'}
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
                      className="w-full bg-canvas border border-hairline rounded-md px-3 py-1.5 pl-8 text-xs font-body text-ink placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                    />
                    <Icone
                      nom="search"
                      taille={13}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                  </div>

                  {/* `aria-pressed` plutôt qu'une simple classe active : la
                      couleur dit l'état à l'œil, elle ne le dit à personne
                      d'autre. Deux groupes, deux `aria-label` — sans quoi huit
                      boutons se suivent sans qu'on sache lesquels vont ensemble. */}
                  <div
                    role="group"
                    aria-label="Fenêtre de temps"
                    className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none"
                  >
                    {FENETRES.map((f) => (
                      <button
                        key={f.cle}
                        type="button"
                        aria-pressed={fenetre === f.cle}
                        onClick={() => setFenetre(f.cle)}
                        className={`px-2 py-1 rounded text-xs font-body transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                          fenetre === f.cle
                            ? 'bg-primary text-primary-foreground font-semibold'
                            : 'bg-canvas text-muted-foreground font-medium hover:text-ink'
                        }`}
                      >
                        {f.libelle}
                      </button>
                    ))}
                  </div>

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
                    {mouvements.length === 0
                      ? 'Aucun mouvement enregistré.'
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
