import { MISES_PAR_CYCLE, formatMontant } from '@kolek/core';
import {
  Avatar,
  BadgeStatut,
  BarreEmpilee,
  Bouton,
  Carte,
  CarteStat,
  EnteteCarte,
  Icone,
  LigneTransaction,
  type Statut,
} from '@kolek/ui';

import type { LigneCarte, VueGlobale } from '../donnees';

const GRILLE_CLIENTS = 'grid-cols-[1fr_80px_80px_100px]';

function statutCarte(c: LigneCarte): Statut {
  if (c.statut === 'cloturee') return 'Clôturée';
  if (c.mises_encaissees >= MISES_PAR_CYCLE) return 'Versé aujourd’hui';
  return 'À jour';
}

export function DetailCollecteur({
  vue,
  collecteurId,
  onRetour,
}: {
  vue: VueGlobale;
  collecteurId: string | null;
  onRetour: () => void;
}) {
  const collecteur = vue.collecteurs.find((c) => c.id === collecteurId);

  // Le cas où la fiche est demandée pour un collecteur absent de la vue. Il
  // arrive pour de vrai : la liste peut avoir été chargée avant une suppression,
  // ou l'écran rouvert après un rechargement. Une fiche vide serait illisible.
  if (!collecteur) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h2 className="font-headings font-bold text-xl text-ink mb-2">Collecteur introuvable</h2>
          <p className="font-body text-muted-foreground text-sm mb-5">
            Cette fiche n’existe plus dans les chiffres chargés.
          </p>
          <Bouton onClick={onRetour} icone="arrow-left">
            Retour à la liste
          </Bouton>
        </div>
      </div>
    );
  }

  // Filtrage par identifiant, jamais par nom : rien n'impose l'unicité de
  // `collecteurs.nom` — seul le téléphone porte une contrainte unique — et deux
  // homonymes verraient leurs cartes mélangées sur cette fiche.
  const cartes = vue.cartes.filter((c) => c.collecteur_id === collecteur.id);
  const mouvements = vue.mouvements.filter((m) => m.collecteur_id === collecteur.id);

  const sommeParts = collecteur.encaisse + collecteur.restitutions;
  const part = (v: number) => (sommeParts > 0 ? Math.round((v / sommeParts) * 100) : 0);
  const repartition = [
    {
      libelle: 'Encaissements',
      pourcentage: part(collecteur.encaisse - collecteur.commissions),
      couleur: 'bg-chart-mint',
      valeur: formatMontant(collecteur.encaisse - collecteur.commissions),
    },
    {
      libelle: 'Commissions',
      pourcentage: part(collecteur.commissions),
      couleur: 'bg-chart-slate',
      valeur: formatMontant(collecteur.commissions),
    },
    {
      libelle: 'Restitutions',
      pourcentage: part(collecteur.restitutions),
      couleur: 'bg-chart-blue',
      valeur: formatMontant(collecteur.restitutions),
    },
  ];

  return (
    <>
      {/* Fil d'Ariane et identité. Ce n'est pas `BarreHaute` : la fiche montre
          un profil, pas un titre de page — avatar, coordonnées, statut. */}
      <div className="bg-canvas px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-4 flex-shrink-0">
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
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
          <span className="text-sm font-body text-ink font-medium">{collecteur.nom}</span>
        </div>

        <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-4">
            <Avatar nom={collecteur.nom} className="w-16 h-16 flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="font-headings font-bold text-2xl sm:text-3xl text-ink">
                {collecteur.nom}
              </h1>
              {/* Zone, téléphone et statut passent à la ligne plutôt que de
                  déborder : sur un téléphone, les trois tenaient sur 520 px. */}
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                <div className="flex items-center gap-1.5">
                  <Icone nom="map-pin" taille={13} className="text-muted-foreground" />
                  <span className="text-sm font-body text-muted-foreground">
                    {collecteur.zone ?? 'Sans zone'}
                  </span>
                </div>
                <span className="text-sm font-body text-muted-foreground">·</span>
                <div className="flex items-center gap-1.5">
                  <Icone nom="phone" taille={13} className="text-muted-foreground" />
                  <span className="text-sm font-body text-muted-foreground">
                    {collecteur.telephone}
                  </span>
                </div>
                <BadgeStatut
                  statut={collecteur.abonnement_statut === 'actif' ? 'Actif' : 'Inactif'}
                  className="px-2.5 py-0.5 ml-1"
                />
              </div>
            </div>
          </div>
          {/* Contacter et Modifier attendent l'écriture côté serveur :
              désactivés avec la raison, pas laissés cliquables dans le vide. */}
          <div className="flex flex-wrap gap-2 mt-1">
            <Bouton variante="contour" icone="message-square" disabled title="Messagerie à venir">
              Contacter
            </Bouton>
            <Bouton icone="edit" disabled title="Modification à venir">
              Modifier
            </Bouton>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 mb-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <CarteStat
          libelle="Total encaissé"
          valeur={formatMontant(collecteur.encaisse)}
          unite="FCFA"
          precision="depuis l’ouverture"
          icone="trending-up"
        />
        <CarteStat
          libelle="Clients"
          valeur={String(collecteur.clients)}
          precision={`${collecteur.cartes_actives} carte${collecteur.cartes_actives > 1 ? 's' : ''} active${collecteur.cartes_actives > 1 ? 's' : ''}`}
          icone="users"
        />
        <CarteStat
          libelle="Commissions"
          valeur={formatMontant(collecteur.commissions)}
          unite="FCFA"
          precision="une par carte ouverte"
          icone="coins"
        />
        <CarteStat
          libelle="Encours clients"
          valeur={formatMontant(collecteur.encours)}
          unite="FCFA"
          precision="restitutions déduites"
          icone="wallet"
        />
      </div>

      <div className="px-4 sm:px-6 lg:px-8 pb-8 grid gap-4 grid-cols-1 xl:grid-cols-[1fr_var(--container-volet)]">
        <div className="flex flex-col gap-4">
          <Carte className="p-5">
            <BarreEmpilee
              titre={`Répartition — ${collecteur.nom}`}
              periode="Depuis l’ouverture"
              total={formatMontant(sommeParts)}
              parts={repartition}
            />
          </Carte>

          <Carte className="overflow-hidden">
            <EnteteCarte titre="Cartes" />

            {cartes.length === 0 ? (
              <p className="px-5 py-6 text-sm font-body text-muted-foreground">
                Aucune carte ouverte pour ce collecteur.
              </p>
            ) : (
              /* Trois colonnes fixes plus le nom : 260 px incompressibles. En
                 dessous de la largeur minimale, le tableau défile latéralement
                 plutôt que d'écraser les montants. */
              <div className="overflow-x-auto">
                <div className="min-w-[520px]">
                  <div
                    className={`grid ${GRILLE_CLIENTS} px-5 py-2.5 bg-canvas border-b border-hairline text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground`}
                  >
                    <span>Client</span>
                    <span className="text-right">Mise</span>
                    <span className="text-right">Jour</span>
                    <span className="text-right">Statut</span>
                  </div>

                  {cartes.map((c, i) => (
                    <div
                      key={c.id}
                      className={`grid ${GRILLE_CLIENTS} items-center px-5 py-3.5 ${
                        i < cartes.length - 1 ? 'border-b border-hairline' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar nom={c.client} className="w-8 h-8 flex-shrink-0" />
                        <span className="text-base font-body font-semibold text-ink truncate">
                          {c.client}
                        </span>
                      </div>
                      <span className="text-right text-base font-body font-medium text-ink tabular-nums">
                        {formatMontant(c.mise)}
                      </span>
                      <span className="text-right text-base font-body font-medium text-ink tabular-nums">
                        {c.mises_encaissees}/{MISES_PAR_CYCLE}
                      </span>
                      <div className="flex justify-end">
                        <BadgeStatut statut={statutCarte(c)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Carte>
        </div>

        <div className="flex flex-col gap-4">
          <Carte className="overflow-hidden">
            <EnteteCarte titre="Mouvements récents" />
            {mouvements.length === 0 ? (
              <p className="px-5 py-6 text-sm font-body text-muted-foreground">
                Aucun mouvement récent.
              </p>
            ) : (
              mouvements.map((m, i) => (
                <LigneTransaction
                  key={`${m.survenu_le}-${m.client}-${i}`}
                  nom={m.client}
                  meta={`${new Date(m.survenu_le).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  })} · ${m.type === 'restitution' ? 'Restitution' : m.type === 'commission' ? 'Commission' : 'Mise'}`}
                  montant={`${m.montant >= 0 ? '+' : ''}${formatMontant(m.montant)}`}
                  type={
                    m.type === 'restitution'
                      ? 'negative'
                      : m.type === 'commission'
                        ? 'neutre'
                        : 'positive'
                  }
                  derniere={i === mouvements.length - 1}
                />
              ))
            )}
          </Carte>
        </div>
      </div>
    </>
  );
}
