import { formatMontant } from '@kolek/core';
import {
  BarreHaute,
  Carte,
  CarteStat,
  CarteZone,
  EnteteSection,
  LigneCollecteur,
  type Statut,
} from '@kolek/ui';

import type { LigneCollecteur as Ligne, VueGlobale } from '../donnees';

/** Somme des colonnes fixes de `LigneCollecteur` plus la gouttière : en dessous,
    le nom du collecteur et le montant se chevauchent. Même idiome que
    `EncoursSoldes` et `Abonnements`. */
const LARGEUR_MINIMALE = 'min-w-[720px]';

/**
 * Le badge de la colonne « Statut » décrit **l'abonnement**, pas l'activité de
 * terrain.
 *
 * La maquette proposait aussi « En synchro », qui supposerait de connaître la
 * date de dernière synchronisation d'un téléphone. La base ne la stocke nulle
 * part : `synchro_rejets` ne garde que les échecs, et l'absence de rejet ne
 * distingue pas un collecteur à jour d'un collecteur qui n'a rien envoyé. Ce
 * statut ne peut donc pas être affiché honnêtement, et il ne l'est pas.
 */
function statutDe(c: Ligne): Statut {
  if (c.abonnement_statut === 'expire') return 'En retard';
  if (c.abonnement_statut === 'suspendu') return 'Inactif';
  return 'À jour';
}

export function Collecteurs({
  vue,
  onOuvrirCollecteur,
}: {
  vue: VueGlobale;
  onOuvrirCollecteur: (id: string) => void;
}) {
  const { collecteurs, zones, abonnements, totaux } = vue;

  const enRetard = collecteurs.filter((c) => c.abonnement_statut !== 'actif').length;
  const zonesTriees = [...zones].sort((a, b) => b.encaisse - a.encaisse);
  const zoneMax = zonesTriees[0]?.encaisse ?? 0;

  return (
    <>
      <BarreHaute
        filAriane={['Accueil', 'Collecteurs']}
        titre="Collecteurs & Zones"
        actions={[
          { icone: 'search', libelle: 'Rechercher', disponible: false },
          { icone: 'sliders-horizontal', libelle: 'Filtrer', disponible: false },
          { icone: 'download', libelle: 'Exporter', disponible: false },
          { icone: 'plus', libelle: 'Ajouter un collecteur', principale: true, disponible: false },
        ]}
      />

      <div className="px-4 sm:px-6 lg:px-8 pb-8 flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <CarteStat
            libelle="Collecteurs actifs"
            valeur={String(abonnements.collecteurs_actifs)}
            precision={`sur ${abonnements.collecteurs_total} inscrits`}
            icone="users"
          />
          <CarteStat
            libelle="Total encaissé"
            valeur={formatMontant(totaux.total_encaisse)}
            unite="FCFA"
            precision="Depuis l’ouverture"
            icone="trending-up"
          />
          <CarteStat
            libelle="Clients suivis"
            valeur={String(totaux.clients)}
            precision={`${totaux.cartes_actives} cartes actives`}
            icone="user-check"
          />
          <CarteStat
            libelle="Abonnements en défaut"
            valeur={String(enRetard)}
            precision="suspendus ou expirés"
            icone="alert-circle"
          />
        </div>

        {zonesTriees.length > 0 && (
          <div>
            <EnteteSection titre="Zones & Marchés" />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {zonesTriees.slice(0, 4).map((z, i) => (
                <CarteZone
                  key={z.zone}
                  zone={z.zone}
                  collecteurs={z.collecteurs}
                  clients={z.clients}
                  encaisse={formatMontant(z.encaisse)}
                  // La barre situe la zone par rapport à la plus forte, faute de
                  // pouvoir la situer par rapport à un objectif : aucun objectif
                  // n'est saisi nulle part.
                  progression={zoneMax > 0 ? Math.round((z.encaisse / zoneMax) * 100) : 0}
                  index={i}
                />
              ))}
            </div>
          </div>
        )}

        <Carte>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-hairline">
            <h2 className="font-headings font-bold text-xl text-ink">Tous les collecteurs</h2>
            <span className="text-sm font-body text-muted-foreground tabular-nums">
              {collecteurs.length} inscrit{collecteurs.length > 1 ? 's' : ''}
            </span>
          </div>

          {collecteurs.length === 0 ? (
            <p className="px-4 sm:px-6 py-8 text-sm font-body text-muted-foreground">
              Aucun collecteur inscrit. Les comptes sont créés par GTCS —
              l’inscription publique est fermée.
            </p>
          ) : (
            /* `overflow-x-auto` et largeur minimale, comme dans EncoursSoldes :
               cinq colonnes à largeur fixe ne rentrent pas sur un téléphone, et
               les comprimer rendait les montants illisibles. On fait défiler le
               tableau plutôt que d'écraser les chiffres. */
            <div className="overflow-x-auto">
              <div className={LARGEUR_MINIMALE}>
                {/* En-têtes de colonnes — mêmes largeurs que LigneCollecteur. */}
                <div className="flex items-center gap-4 px-4 sm:px-6 py-3 bg-canvas border-b border-hairline">
                  <div className="w-10 flex-shrink-0" />
                  <div className="flex-1 text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                    Collecteur
                  </div>
                  <div className="w-20 text-right text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                    Clients
                  </div>
                  <div className="w-36 text-right text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                    Encaissé
                  </div>
                  <div className="w-28 text-right text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground">
                    Statut
                  </div>
                  <div className="w-10" />
                </div>

                {collecteurs.map((c, i) => (
                  <LigneCollecteur
                    key={c.id}
                    nom={c.nom}
                    zone={c.zone ?? 'Sans zone'}
                    clients={c.clients}
                    encaisse={formatMontant(c.encaisse)}
                    statut={statutDe(c)}
                    derniere={i === collecteurs.length - 1}
                    onOuvrir={() => onOuvrirCollecteur(c.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </Carte>
      </div>
    </>
  );
}
