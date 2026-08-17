import { PALIERS, formatMontant, type Palier } from '@kolek/core';
import { Avatar, BadgeStatut, BarreHaute, Carte, Icone } from '@kolek/ui';

/**
 * Écran de démonstration — voir la note de TableauDeBord.
 *
 * ---
 *
 * AVERTISSEMENT — cet écran pilote un modèle que le schéma ne porte pas.
 *
 * Il liste des *organisations* : une entité qui emploie plusieurs collecteurs,
 * avec un responsable, un MRR et une échéance. La base n'a que `collecteurs`,
 * en correspondance 1 pour 1 avec `auth.users`, et `admins`. Il n'existe ni
 * table `organisations`, ni multi-locataire. Les lignes ci-dessous sont donc
 * fixes, et le resteront tant que ce modèle n'aura pas été conçu.
 *
 * La grille tarifaire, elle, vient de `@kolek/core` : c'est la même source que
 * la page de tarifs publique. Un prix ne doit pas pouvoir diverger entre
 * l'écran qui facture et la page qui vend.
 *
 * Écart assumé avec la maquette : elle dessinait une barre latérale « Super
 * Admin » distincte, plus sombre, avec sa propre navigation. L'écran vit ici
 * dans la coquille d'administration existante — deux barres latérales pour un
 * même produit, c'est deux endroits où ajouter chaque future entrée.
 */
const INDICATEURS = [
  { libelle: 'MRR total', valeur: '219 400', unite: 'FCFA', tendance: '+28 %', alerte: false },
  { libelle: 'Organisations actives', valeur: '83', unite: '', tendance: '+6', alerte: false },
  { libelle: 'Expirations ce mois', valeur: '5', unite: '', tendance: 'À traiter', alerte: true },
  { libelle: 'Taux de renouvellement', valeur: '94', unite: '%', tendance: '+2 %', alerte: false },
];

/** Nombre d'organisations par palier. Clé typée : un palier retiré de
    `@kolek/core` casse la compilation ici plutôt qu'à l'affichage. */
const ORGS_PAR_PALIER: Record<Palier, number> = {
  essai: 12,
  standard: 38,
  pro: 24,
  illimite: 9,
};

interface Organisation {
  nom: string;
  responsable: string;
  palier: Palier;
  depuis: string;
  expire: string;
  mrr: number;
  statut: 'Actif' | 'Expiration imminente' | 'Suspendu';
}

const ORGANISATIONS: Organisation[] = [
  {
    nom: 'Kolek Abidjan Centre',
    responsable: 'Moussa Koné',
    palier: 'pro',
    depuis: '12 août 2024',
    expire: '12 août 2025',
    mrr: 24900,
    statut: 'Actif',
  },
  {
    nom: 'Micro-Épargne Yopougon',
    responsable: 'Aminata Diallo',
    palier: 'standard',
    depuis: '3 sept. 2024',
    expire: '3 sept. 2025',
    mrr: 9900,
    statut: 'Actif',
  },
  {
    nom: 'Épargne Adjamé Plus',
    responsable: 'Ibrahima Touré',
    palier: 'illimite',
    depuis: '21 juil. 2024',
    expire: '21 juil. 2025',
    mrr: 49900,
    statut: 'Actif',
  },
  {
    nom: 'Tontine Plateau',
    responsable: 'Rakia Sylla',
    palier: 'essai',
    depuis: '10 janv. 2025',
    expire: '10 fév. 2025',
    mrr: 0,
    statut: 'Expiration imminente',
  },
  {
    nom: 'Kolek Bouaké',
    responsable: 'Jean-Luc Bamba',
    palier: 'standard',
    depuis: '5 nov. 2024',
    expire: '5 nov. 2025',
    mrr: 9900,
    statut: 'Actif',
  },
  {
    nom: 'Micro-Finance Abobo',
    responsable: 'Fatima Doumbia',
    palier: 'pro',
    depuis: '18 oct. 2024',
    expire: '18 oct. 2025',
    mrr: 24900,
    statut: 'Suspendu',
  },
];

/**
 * Un seul gabarit pour l'en-tête et les lignes — la maquette le répétait, et
 * deux chaînes à tenir synchronisées finissent toujours par diverger.
 *
 * La largeur minimale n'est pas décorative : les sept colonnes fixes et leurs
 * gouttières valent 942 px. Sous ce seuil, la colonne `1fr` du nom
 * d'organisation tombe à quelques pixels et « Kolek Abidjan Centre » se tronque
 * à « K ». Le plancher lui garantit sa part.
 */
const COLONNES = '1fr 140px 95px 105px 105px 100px 125px 68px';
const LARGEUR_MINIMALE = 'min-w-[1040px]';

/** Un MRR nul se lit « — » et non « 0 FCFA » : l'organisation est en essai,
    elle ne paie pas encore ; zéro laisserait croire à un impayé. */
function mrrLisible(mrr: number): string {
  return mrr === 0 ? '—' : `${formatMontant(mrr)} FCFA`;
}

function PastillePalier({ palier }: { palier: Palier }) {
  const description = PALIERS.find((p) => p.cle === palier)!;
  return (
    <span
      className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold w-fit whitespace-nowrap"
      style={{ background: description.fond, color: description.texte }}
    >
      {description.nom}
    </span>
  );
}

function PastilleStatut({ statut }: { statut: Organisation['statut'] }) {
  if (statut === 'Actif') return <BadgeStatut statut="Actif" />;
  return (
    <span className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold bg-negative-tint text-negative whitespace-nowrap">
      {statut}
    </span>
  );
}

function Sigle({ nom }: { nom: string }) {
  return (
    <span className="w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center font-body font-bold text-xs text-primary-foreground bg-primary">
      {nom.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function Abonnements() {
  return (
    <>
      <BarreHaute
        filAriane={['Accueil', 'Abonnements']}
        titre="Gestion des abonnements"
        actions={[
          { icone: 'download', libelle: 'Exporter' },
          { icone: 'plus', libelle: 'Nouvel abonnement', principale: true },
        ]}
      />

      <div className="px-4 sm:px-8 py-6 flex flex-col gap-6 overflow-y-auto">
        {/* Indicateurs — deux colonnes sur petit écran, quatre au-delà. */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {INDICATEURS.map((indicateur) => (
            <Carte key={indicateur.libelle} className="p-5">
              <span className="text-sm font-body font-medium text-muted-foreground block mb-1">
                {indicateur.libelle}
              </span>
              <p
                className={`font-headings font-bold text-3xl tabular-nums ${
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
              <span
                className={`flex items-center gap-1 mt-2 px-2.5 py-1 rounded-pill text-xs font-body font-semibold w-fit ${
                  indicateur.alerte
                    ? 'bg-negative-tint text-negative'
                    : 'bg-positive-tint text-positive'
                }`}
              >
                <Icone nom={indicateur.alerte ? 'alert-circle' : 'arrow-up-right'} taille={11} />
                {indicateur.tendance}
              </span>
            </Carte>
          ))}
        </div>

        {/* Paliers */}
        <div>
          <h2 className="font-headings font-bold text-xl text-ink mb-3">Paliers d'abonnement</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {PALIERS.map((palier) => (
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
                      {ORGS_PAR_PALIER[palier.cle]} orgs.
                    </span>
                    <button
                      type="button"
                      disabled
                      className="text-sm font-body font-medium text-muted-foreground cursor-default"
                      title="Écran à venir"
                    >
                      Modifier
                    </button>
                  </div>
                </div>
              </Carte>
            ))}
          </div>
        </div>

        {/* Organisations */}
        <Carte className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-hairline flex-wrap">
            <h2 className="font-headings font-bold text-xl text-ink">Organisations abonnées</h2>
            <div className="flex gap-2 flex-wrap items-center">
              {['Tous', 'Actif', 'Expirant', 'Suspendu'].map((filtre, i) => (
                <button
                  key={filtre}
                  type="button"
                  aria-pressed={i === 0}
                  className={`px-3 py-1.5 rounded-pill text-sm font-body font-medium border ${
                    i === 0
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-surface text-ink border-hairline'
                  }`}
                >
                  {filtre}
                </button>
              ))}
              <div className="flex items-center gap-1.5 bg-canvas border border-hairline rounded-md px-3 py-1.5">
                <Icone nom="search" taille={14} className="text-muted-foreground" />
                <input
                  type="search"
                  placeholder="Rechercher…"
                  className="w-28 bg-transparent text-sm font-body text-ink placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>
          </div>

          {/* Tableau — postes de bureau. */}
          <div className="hidden lg:block overflow-x-auto">
            <div className={LARGEUR_MINIMALE}>
              <div
                className="grid px-5 py-3 bg-canvas border-b border-hairline text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground gap-3"
                style={{ gridTemplateColumns: COLONNES }}
              >
                <span>Organisation</span>
                <span>Responsable</span>
                <span>Palier</span>
                <span>Depuis</span>
                <span>Expiration</span>
                <span className="text-right">MRR</span>
                <span>Statut</span>
                <span />
              </div>

              {ORGANISATIONS.map((org, i) => (
                <div
                  key={org.nom}
                  className={`grid items-center px-5 py-3.5 gap-3 ${
                    i < ORGANISATIONS.length - 1 ? 'border-b border-hairline' : ''
                  }`}
                  style={{ gridTemplateColumns: COLONNES }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Sigle nom={org.nom} />
                    <span className="text-base font-body font-semibold text-ink truncate">
                      {org.nom}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar nom={org.responsable} className="w-7 h-7 flex-shrink-0" />
                    <span className="text-sm font-body text-muted-foreground truncate">
                      {org.responsable}
                    </span>
                  </div>
                  <PastillePalier palier={org.palier} />
                  <span className="text-sm font-body text-muted-foreground">{org.depuis}</span>
                  <span className="text-sm font-body text-ink">{org.expire}</span>
                  <span className="text-right text-base font-body font-bold text-positive tabular-nums">
                    {mrrLisible(org.mrr)}
                  </span>
                  <PastilleStatut statut={org.statut} />
                  <div className="flex gap-1 justify-end">
                    <button
                      type="button"
                      aria-label={`Modifier ${org.nom}`}
                      className="w-8 h-8 rounded-md border border-hairline flex items-center justify-center"
                    >
                      <Icone nom="edit" taille={14} className="text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Autres actions sur ${org.nom}`}
                      className="w-8 h-8 rounded-md border border-hairline flex items-center justify-center"
                    >
                      <Icone nom="more-horizontal" taille={14} className="text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cartes — la même donnée, empilée, pour les écrans étroits. Sept
              colonnes ne se lisent pas sur un téléphone, et un tableau qui
              défile latéralement cache toujours la colonne qui compte. */}
          <div className="lg:hidden flex flex-col gap-2 p-4">
            {ORGANISATIONS.map((org) => (
              <div key={org.nom} className="bg-surface rounded-lg border border-hairline p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Sigle nom={org.nom} />
                    <div className="flex-1 min-w-0">
                      <p className="font-body font-semibold text-sm text-ink truncate">{org.nom}</p>
                      <p className="text-xs font-body text-muted-foreground truncate">
                        {org.responsable}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Autres actions sur ${org.nom}`}
                    className="flex-shrink-0"
                  >
                    <Icone nom="more-horizontal" taille={14} className="text-muted-foreground" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 mb-2">
                  <PastillePalier palier={org.palier} />
                  <PastilleStatut statut={org.statut} />
                </div>

                <div className="flex items-center justify-between text-xs font-body text-muted-foreground">
                  <span>{org.expire}</span>
                  <span className="text-ink font-semibold tabular-nums">{mrrLisible(org.mrr)}</span>
                </div>
              </div>
            ))}
          </div>
        </Carte>
      </div>
    </>
  );
}
