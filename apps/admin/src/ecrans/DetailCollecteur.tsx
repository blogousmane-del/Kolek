import { MISES_PAR_CYCLE } from '@kolek/core';
import {
  Avatar,
  BadgeStatut,
  BarreEmpilee,
  Bouton,
  Carte,
  CarteCollecte,
  CarteStat,
  EnteteCarte,
  Icone,
  LienBloc,
  LigneTransaction,
  type Statut,
} from '@kolek/ui';

/** Écran de démonstration — voir la note de TableauDeBord. */
const TRANSACTIONS = [
  { nom: 'Mariam Koné', meta: '14 jan · Mise', montant: '+1 000', type: 'positive' as const },
  { nom: 'Jean-Luc Bamba', meta: '14 jan · Mise', montant: '+500', type: 'positive' as const },
  {
    nom: 'Adja Touré',
    meta: '13 jan · Restitution',
    montant: '-31 000',
    type: 'negative' as const,
  },
  { nom: 'Ibrahima Sylla', meta: '13 jan · Mise', montant: '+1 000', type: 'positive' as const },
  { nom: 'Rokia Doumbia', meta: '12 jan · Mise', montant: '+500', type: 'positive' as const },
];

const CLIENTS: Array<{ nom: string; mise: string; jour: number; statut: Statut }> = [
  { nom: 'Mariam Koné', mise: '1 000', jour: 18, statut: 'À jour' },
  { nom: 'Jean-Luc Bamba', mise: '500', jour: 31, statut: 'Clôturée' },
  { nom: 'Adja Touré', mise: '2 000', jour: 12, statut: 'En retard' },
  { nom: 'Ibrahima Sylla', mise: '1 000', jour: 24, statut: 'À jour' },
  { nom: 'Rokia Doumbia', mise: '500', jour: 8, statut: 'En retard' },
];

const REPARTITION = [
  { libelle: 'Encaissements', pourcentage: 65, couleur: 'bg-chart-mint', valeur: '31 525' },
  { libelle: 'Commissions', pourcentage: 20, couleur: 'bg-chart-slate', valeur: '9 700' },
  { libelle: 'Restitutions', pourcentage: 15, couleur: 'bg-chart-blue', valeur: '7 275' },
];

const GRILLE_CLIENTS = 'grid-cols-[1fr_80px_80px_100px_80px]';

export function DetailCollecteur({ onRetour }: { onRetour: () => void }) {
  return (
    <>
      {/* Fil d'Ariane et identité. Ce n'est pas `BarreHaute` : la fiche montre
          un profil, pas un titre de page — avatar, coordonnées, statut. */}
      <div className="bg-canvas px-8 pt-6 pb-4 flex-shrink-0">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-sm font-body text-muted-foreground">Accueil</span>
          <Icone nom="chevron-right" taille={13} className="text-muted-foreground" />
          <button
            type="button"
            onClick={onRetour}
            className="text-sm font-body text-muted-foreground cursor-pointer"
          >
            Collecteurs
          </button>
          <Icone nom="chevron-right" taille={13} className="text-muted-foreground" />
          <span className="text-sm font-body text-ink font-medium">Kouamé Assi</span>
        </div>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar nom="Kouamé Assi" className="w-16 h-16" />
            <div>
              <h1 className="font-headings font-bold text-3xl text-ink">Kouamé Assi</h1>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1.5">
                  <Icone nom="map-pin" taille={13} className="text-muted-foreground" />
                  <span className="text-sm font-body text-muted-foreground">Marché Adjamé</span>
                </div>
                <span className="text-sm font-body text-muted-foreground">·</span>
                <div className="flex items-center gap-1.5">
                  <Icone nom="phone" taille={13} className="text-muted-foreground" />
                  <span className="text-sm font-body text-muted-foreground">+225 07 08 09 10</span>
                </div>
                <BadgeStatut statut="Actif" className="px-2.5 py-0.5 ml-1" />
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-1">
            <Bouton variante="contour" icone="message-square">
              Contacter
            </Bouton>
            <Bouton icone="edit">Modifier</Bouton>
          </div>
        </div>
      </div>

      <div className="px-8 mb-4 grid grid-cols-4 gap-4">
        <CarteStat
          libelle="Encaissé aujourd’hui"
          valeur="48 500"
          unite="FCFA"
          tendance="+12 %"
          icone="trending-up"
        />
        <CarteStat libelle="Clients actifs" valeur="24" tendance="+2" icone="users" />
        <CarteStat
          libelle="Commissions du mois"
          valeur="9 700"
          unite="FCFA"
          tendance="+8 %"
          icone="coins"
        />
        <CarteStat
          libelle="En retard"
          valeur="2"
          tendance="+1"
          tendancePositive={false}
          icone="alert-circle"
        />
      </div>

      <div className="px-8 pb-8 grid gap-4 grid-cols-[1fr_var(--container-volet)]">
        <div className="flex flex-col gap-4">
          <Carte className="p-5">
            <BarreEmpilee
              titre="Répartition — Kouamé Assi"
              total="48 500"
              parts={REPARTITION}
            />
          </Carte>

          <Carte className="overflow-hidden">
            <EnteteCarte
              titre="Clients"
              action={
                <div className="flex items-center gap-1 border border-hairline rounded-pill px-3 py-1.5">
                  <span className="text-sm font-body font-medium text-ink">Tous</span>
                  <Icone nom="chevron-down" taille={13} className="text-muted-foreground" />
                </div>
              }
            />

            <div
              className={`grid ${GRILLE_CLIENTS} px-5 py-2.5 bg-canvas border-b border-hairline text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground`}
            >
              <span>Client</span>
              <span className="text-right">Mise</span>
              <span className="text-right">Jour</span>
              <span className="text-right">Statut</span>
              <span />
            </div>

            {CLIENTS.map((c, i) => (
              <div
                key={c.nom}
                className={`grid ${GRILLE_CLIENTS} items-center px-5 py-3.5 ${
                  i < CLIENTS.length - 1 ? 'border-b border-hairline' : ''
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar nom={c.nom} className="w-8 h-8 flex-shrink-0" />
                  <span className="text-base font-body font-semibold text-ink truncate">
                    {c.nom}
                  </span>
                </div>
                <span className="text-right text-base font-body font-medium text-ink tabular-nums">
                  {c.mise}
                </span>
                <span className="text-right text-base font-body font-medium text-ink tabular-nums">
                  {c.jour}/{MISES_PAR_CYCLE}
                </span>
                <div className="flex justify-end">
                  <BadgeStatut statut={c.statut} />
                </div>
                <div className="flex justify-end">
                  <button type="button" aria-label={`Ouvrir la carte de ${c.nom}`}>
                    <Icone nom="chevron-right" taille={16} className="text-muted-foreground" />
                  </button>
                </div>
              </div>
            ))}
          </Carte>
        </div>

        <div className="flex flex-col gap-4">
          <CarteCollecte
            nomClient="Mariam Koné"
            misePar="1 000"
            jourCourant={18}
            solde="18 000"
            cycle="3"
          />

          <Carte className="overflow-hidden">
            <EnteteCarte titre="Transactions récentes" action={<LienBloc libelle="Voir tout" />} />
            {TRANSACTIONS.map((t, i) => (
              <LigneTransaction key={t.nom} {...t} derniere={i === TRANSACTIONS.length - 1} />
            ))}
          </Carte>
        </div>
      </div>
    </>
  );
}
