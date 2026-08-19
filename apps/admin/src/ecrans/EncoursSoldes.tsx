import { Avatar, BadgeStatut, BarreHaute, Carte, Icone, type Statut } from '@kolek/ui';

/**
 * Écran de démonstration — voir la note de TableauDeBord. Les chiffres sont en
 * dur : le rapprochement réel demande les vues d'agrégation de J4.
 */
const LIGNES: Array<{
  client: string;
  collecteur: string;
  cycle: string;
  encours: string;
  solde: string;
  statut: Statut;
}> = [
  {
    client: 'Mariam Koné',
    collecteur: 'Kouamé Assi',
    cycle: '3/31',
    encours: '18 000',
    solde: '18 000',
    statut: 'À jour',
  },
  {
    client: 'Jean-Luc Bamba',
    collecteur: 'Kouamé Assi',
    cycle: '31/31',
    encours: '0',
    solde: '15 500',
    statut: 'Clôturée',
  },
  {
    client: 'Adja Touré',
    collecteur: 'Kouamé Assi',
    cycle: '12/31',
    encours: '24 000',
    solde: '24 000',
    statut: 'En retard',
  },
  {
    client: 'Ibrahima Sylla',
    collecteur: 'Aminata C.',
    cycle: '24/31',
    encours: '12 000',
    solde: '12 000',
    statut: 'À jour',
  },
  {
    client: 'Rokia Doumbia',
    collecteur: 'Aminata C.',
    cycle: '8/31',
    encours: '14 000',
    solde: '14 000',
    statut: 'En retard',
  },
  {
    client: 'Fatima Diallo',
    collecteur: 'Sékou Traoré',
    cycle: '22/31',
    encours: '11 000',
    solde: '11 000',
    statut: 'À jour',
  },
];

const INDICATEURS = [
  { libelle: 'Solde total géré', valeur: '3 247 560', tendance: '+18 %' },
  { libelle: 'Encours suivi', valeur: '1 847 300', tendance: '+5 %' },
  { libelle: 'Restitutions du mois', valeur: '642 100', tendance: '+12 %' },
  { libelle: 'Commissions', valeur: '128 380', tendance: '+22 %' },
];

/**
 * Une seule déclaration de gabarit pour l'en-tête et les lignes. La maquette la
 * répétait à deux endroits : deux chaînes à tenir synchronisées pour que les
 * colonnes restent alignées, ce qui n'arrive jamais longtemps.
 */
const COLONNES = '200px 1fr 120px 140px 140px 100px 60px';

/**
 * Les six colonnes fixes et leurs gouttières valent 904 px. Sous ce plancher,
 * la colonne `1fr` du collecteur tomberait à quelques pixels et « Kouamé Assi »
 * se tronquerait à une lettre.
 */
const LARGEUR_MINIMALE = 'min-w-[1120px]';

function Filtre({ libelle }: { libelle: string }) {
  return (
    <div className="flex items-center gap-1 border border-hairline rounded-pill px-3 py-1.5 bg-surface">
      <span className="text-sm font-body font-medium text-ink">{libelle}</span>
      <Icone nom="chevron-down" taille={13} className="text-muted-foreground" />
    </div>
  );
}

export function EncoursSoldes() {
  return (
    <>
      <BarreHaute filAriane={['Accueil', 'Encours & Soldes']} titre="Encours & Soldes" actions={[]} />

      <div className="px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 overflow-y-auto">
        {/* Indicateurs. La maquette recopiait quatre fois le même bloc ; ici la
            forme est écrite une fois et nourrie par une liste. */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
          {INDICATEURS.map((indicateur) => (
            <Carte key={indicateur.libelle} className="p-5">
              <span className="text-sm font-body font-medium text-muted-foreground mb-1 block">
                {indicateur.libelle}
              </span>
              <p className="font-headings font-bold text-3xl text-ink mb-3 tabular-nums">
                {indicateur.valeur}{' '}
                <span className="text-lg font-body font-medium text-muted-foreground">FCFA</span>
              </p>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-positive-tint text-positive text-xs font-body font-semibold w-fit">
                <Icone nom="arrow-up-right" taille={11} />
                {indicateur.tendance}
              </span>
            </Carte>
          ))}
        </div>

        <Carte className="overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
            <h2 className="font-headings font-bold text-xl text-ink">Détail par client</h2>
            <div className="flex gap-2">
              <Filtre libelle="Ce mois" />
              <Filtre libelle="Toutes zones" />
              <button
                type="button"
                className="flex items-center gap-1 border border-hairline rounded-pill px-3 py-1.5 bg-surface"
              >
                <Icone nom="download" taille={14} className="text-muted-foreground" />
                <span className="text-sm font-body font-medium text-ink">Exporter</span>
              </button>
            </div>
          </div>

          {/* `overflow-x-auto` : sept colonnes à largeur fixe ne tiennent pas sur
              un poste étroit. Sans ça, c'est la page entière qui défile
              latéralement et la barre latérale part avec. */}
          <div className="overflow-x-auto">
            <div className={LARGEUR_MINIMALE}>
              <div
                className="grid px-6 py-3 bg-canvas border-b border-hairline text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground gap-4"
                style={{ gridTemplateColumns: COLONNES }}
              >
                <span>Client</span>
                <span>Collecteur</span>
                <span className="text-right">Cycle</span>
                <span className="text-right">Encours</span>
                <span className="text-right">Solde rest.</span>
                <span className="text-right">Statut</span>
                <span />
              </div>

              {LIGNES.map((ligne, i) => (
                <div
                  key={ligne.client}
                  className={`grid items-center px-6 py-3.5 gap-4 ${
                    i < LIGNES.length - 1 ? 'border-b border-hairline' : ''
                  }`}
                  style={{ gridTemplateColumns: COLONNES }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar nom={ligne.client} className="w-8 h-8 flex-shrink-0" />
                    <span className="text-base font-body font-semibold text-ink truncate">
                      {ligne.client}
                    </span>
                  </div>
                  <span className="text-sm font-body text-muted-foreground truncate">
                    {ligne.collecteur}
                  </span>
                  <span className="text-right text-base font-body font-medium text-ink tabular-nums">
                    {ligne.cycle}
                  </span>
                  <span className="text-right text-base font-body font-bold text-positive tabular-nums">
                    {ligne.encours}
                  </span>
                  <span className="text-right text-base font-body font-bold text-ink tabular-nums">
                    {ligne.solde}
                  </span>
                  <div className="flex justify-end">
                    <BadgeStatut statut={ligne.statut} />
                  </div>
                  <div className="flex justify-end">
                    <button type="button" aria-label={`Ouvrir la fiche de ${ligne.client}`}>
                      <Icone nom="chevron-right" taille={16} className="text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Carte>
      </div>
    </>
  );
}
