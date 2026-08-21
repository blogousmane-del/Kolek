import { formatMontant } from '@kolek/core';
import {
  ActionsRapides,
  BarreEmpilee,
  BarreHaute,
  Carte,
  CarteStat,
  EnteteCarte,
  LigneTransaction,
  type CleNavAdmin,
} from '@kolek/ui';

import type { Mouvement, VueGlobale } from '../donnees';

/**
 * Tableau de bord de pilotage. Tous les chiffres viennent de l'Edge Function
 * `admin-vue-globale` — plus aucun n'est écrit dans ce fichier.
 *
 * Ce qui ne s'affiche pas mérite d'être expliqué autant que ce qui s'affiche.
 * Les tendances (« +8 % vs période précédente ») ont disparu : la base ne garde
 * aucun instantané du passé, donc aucune variation n'est calculable. Les
 * recomposer à partir d'une moyenne ou d'un ratio serait de l'invention, et un
 * chiffre inventé sur un écran de pilotage se croit longtemps.
 */

const COULEURS_ZONES = ['bg-chart-mint', 'bg-chart-blue', 'bg-chart-teal', 'bg-chart-slate'];

function libelleMouvement(m: Mouvement): string {
  const quand = new Date(m.survenu_le).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
  const quoi =
    m.type === 'restitution' ? 'Restitution' : m.type === 'commission' ? 'Commission' : 'Mise';
  return `${quand} · ${quoi}`;
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

  // Les trois parts de la répartition. Les pourcentages se déduisent du total
  // des trois, et non du solde géré : une part vaut ce qu'elle pèse dans ce
  // qu'on affiche, sinon les segments ne remplissent pas la barre.
  const sommeParts = totaux.total_encaisse + totaux.restitutions;
  const part = (valeur: number) => (sommeParts > 0 ? Math.round((valeur / sommeParts) * 100) : 0);

  const repartition = [
    {
      libelle: 'Encaissements',
      pourcentage: part(totaux.total_encaisse - totaux.commissions),
      couleur: 'bg-chart-mint',
      valeur: formatMontant(totaux.total_encaisse - totaux.commissions),
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

  // Les zones les plus actives, barre proportionnelle à la plus forte.
  const zonesTriees = [...zones].sort((a, b) => b.encaisse - a.encaisse).slice(0, 4);
  const zoneMax = zonesTriees[0]?.encaisse ?? 0;

  return (
    <>
      <BarreHaute
        filAriane={['Accueil', 'Tableau de bord']}
        titre="Tableau de bord"
        // Trois actions grises ont été retirées le 2026-08-21 : Rechercher —
        // cet écran n'affiche aucune liste à chercher, la recherche vit dans
        // « Collecteurs » ; Calendrier — rien dans la base ne porte de rendez-vous ;
        // Créer un rapport — l'export existe, dans les écrans qui ont des lignes
        // à exporter. Aucune n'était en attente de construction : elles
        // promettaient des choses qui n'ont pas lieu d'exister ici.
        actions={[]}
      />

      <div className="px-4 sm:px-6 lg:px-8 pb-8 flex-1">
        {/* Une colonne sur téléphone, deux sur tablette, quatre au-delà. Les
            quatre fixes écrasaient chaque carte à moins de 90 px de large. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          <CarteStat
            libelle="Encours clients"
            valeur={formatMontant(totaux.encours_clients)}
            unite="FCFA"
            precision="Dû aux clients, restitutions déduites"
            icone="wallet"
          />
          <CarteStat
            libelle="Commissions"
            valeur={formatMontant(totaux.commissions)}
            unite="FCFA"
            precision="Depuis l’ouverture"
            icone="trending-up"
          />
          <CarteStat
            libelle="Collecteurs actifs"
            valeur={String(abonnements.collecteurs_actifs)}
            precision={`sur ${abonnements.collecteurs_total} inscrits`}
            icone="users"
          />
          <CarteStat
            libelle="Abonnements à échoir"
            valeur={String(abonnements.expirations_a_venir_30j)}
            precision="dans les 30 jours"
            icone="alert-circle"
          />
        </div>

        {/* Les trois colonnes du pilotage s'empilent en dessous de `xl` : la
            colonne de droite est un volet à largeur fixe, et sur un écran
            étroit elle poussait les deux autres sous les 200 px. */}
        <div className="grid gap-4 grid-cols-1 xl:grid-cols-[1fr_1fr_var(--container-volet)]">
          {/* Colonne gauche */}
          <div className="flex flex-col gap-4">
            <Carte className="p-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-body font-medium text-muted-foreground">
                  Total encaissé
                </span>
                <div className="flex items-center gap-1 border border-hairline rounded-pill px-2.5 py-1">
                  <span className="text-xs font-body font-medium text-ink">FCFA</span>
                </div>
              </div>
              <p className="font-headings font-bold text-3xl sm:text-4xl text-ink mb-2 tabular-nums">
                {formatMontant(totaux.total_encaisse)}{' '}
                <span className="text-lg sm:text-xl font-body font-medium text-muted-foreground">
                  FCFA
                </span>
              </p>
              <p className="text-sm font-body text-muted-foreground mb-4 tabular-nums">
                {totaux.mises} mises · {totaux.cartes_actives} cartes actives · {totaux.clients}{' '}
                clients
              </p>
              {/* « Retirer », « Historique » et la pastille « Autres actions »
                  ont été retirés le 2026-08-21.

                  Le retrait existe désormais — mais côté collecteur, et c'est
                  définitif : le cahier §11 pose que l'argent est manié par le
                  collecteur, et la politique RLS de `retraits` le suit. Un
                  retrait déclenché depuis un bureau GTCS n'aurait pas d'espèces
                  en face, et fausserait le rapprochement de caisse du collecteur
                  sans que personne comprenne pourquoi. Le bouton ne dormait donc
                  pas en attendant son tour ; il ne devait pas exister ici.

                  L'historique, lui, est déjà là : c'est la liste des mouvements,
                  colonne de droite. */}
              <p className="font-body text-sm text-muted-foreground">
                Les mouvements récents figurent dans le volet de droite. Les
                encaissements et les retraits se font sur le téléphone du
                collecteur.
              </p>
            </Carte>

            <Carte className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-headings font-bold text-lg text-ink">Accès rapide</h3>
              </div>
              {/* `ActionsRapides` sans propriété `actions` retombait sur ses huit
                  actions par défaut — celles de l'application collecteur, aucune
                  ne portant de gestionnaire. Huit pastilles mortes sur le
                  tableau de bord, et le défaut était invisible depuis ce fichier
                  puisque la liste vit dans le paquet d'interface.

                  Quatre destinations réelles valent mieux que huit promesses. */}
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
                    libelle: 'Ajouter',
                    onActiver: () => onNaviguer('collecteurs'),
                  },
                ]}
              />
            </Carte>
          </div>

          {/* Colonne centrale */}
          <div className="flex flex-col gap-4">
            <Carte className="p-5">
              <BarreEmpilee
                titre="Répartition des flux"
                periode="Depuis l’ouverture"
                total={formatMontant(sommeParts)}
                parts={repartition}
              />
            </Carte>

            <Carte className="overflow-hidden">
              <EnteteCarte titre="Top zones" />
              {zonesTriees.length === 0 ? (
                <p className="px-5 py-6 text-sm font-body text-muted-foreground">
                  Aucun collecteur n’a encore encaissé.
                </p>
              ) : (
                zonesTriees.map((z, i) => (
                  <div
                    key={z.zone}
                    className={`flex items-center gap-3 px-5 py-3.5 ${
                      i < zonesTriees.length - 1 ? 'border-b border-hairline' : ''
                    }`}
                  >
                    <div
                      className={`w-2 h-2 rounded-pill flex-shrink-0 ${COULEURS_ZONES[i % COULEURS_ZONES.length]}`}
                    />
                    <span className="flex-1 text-base font-body font-medium text-ink truncate">
                      {z.zone}
                    </span>
                    <div className="w-24 hidden sm:block">
                      <div className="w-full h-1.5 bg-muted rounded-pill overflow-hidden">
                        <div
                          className={`h-full ${COULEURS_ZONES[i % COULEURS_ZONES.length]} rounded-pill`}
                          style={{ width: `${zoneMax > 0 ? (z.encaisse / zoneMax) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-body font-semibold text-ink w-28 text-right tabular-nums">
                      {formatMontant(z.encaisse)} FCFA
                    </span>
                  </div>
                ))
              )}
            </Carte>
          </div>

          {/* Colonne droite */}
          <div className="flex flex-col gap-4">
            <Carte className="overflow-hidden">
              <EnteteCarte titre="Derniers mouvements" />
              {mouvements.length === 0 ? (
                <p className="px-5 py-6 text-sm font-body text-muted-foreground">
                  Aucun mouvement enregistré.
                </p>
              ) : (
                mouvements.map((m, i) => (
                  <LigneTransaction
                    key={`${m.survenu_le}-${m.client}-${i}`}
                    nom={m.client}
                    meta={libelleMouvement(m)}
                    montant={`${m.montant >= 0 ? '+' : ''}${formatMontant(m.montant)}`}
                    type={typeLigne(m)}
                    derniere={i === mouvements.length - 1}
                  />
                ))
              )}
            </Carte>
          </div>
        </div>
      </div>
    </>
  );
}
