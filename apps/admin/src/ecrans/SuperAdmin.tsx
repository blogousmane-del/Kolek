import { PALIERS, formatMontant } from '@kolek/core';
import {
  Avatar,
  BadgeStatut,
  BarreHaute,
  Bouton,
  Carte,
  Icone,
  type CleNavSuper,
  type NomIcone,
} from '@kolek/ui';
import { useState } from 'react';

import type { LigneCollecteur, VueGlobale } from '../donnees';
import { dateDuJour, telechargerCsv, versCsv } from '../exporter';
import {
  agirSuperAdmin,
  chargerJournal,
  useEtatSuperAdmin,
  type ActionSuperAdmin,
  type AdministrateurSuper,
  type CodePromo,
  type EtatSuperAdmin,
  type PageJournal,
} from '../superadmin';

/**
 * La console de plateforme, découpée en cinq écrans le 2026-08-30.
 *
 * Elle n'a pas de navigation à elle : la barre latérale de la coquille la
 * porte, et cet écran reçoit l'entrée courante en `onglet`. Une console qui
 * s'atteint par un sélecteur d'espace, et qui remettrait ses propres onglets
 * sous le titre, poserait deux niveaux de menu pour une seule destination.
 *
 * L'entrée par défaut — « Abonnements » — fusionne les KPI financiers, les
 * paliers et le tableau des collecteurs abonnés. Les quatre autres reprennent
 * le contenu qui existait déjà : administrateurs, codes promo et remises,
 * journal de sécurité, et volumes de la plateforme.
 *
 * ## Ce n'est pas le Dashboard
 *
 * Le Dashboard gère la collecte — collecteurs, encaissements, abonnements. Cet
 * écran gère la plateforme. La séparation n'est pas cosmétique : un
 * administrateur métier, qui encaisse et suit les tournées tous les jours, n'a
 * rien à faire ici, et `est_super_admin()` le lui refuse côté serveur.
 *
 * ## Cet écran ne décide de rien
 *
 * « Pas d'action sur soi-même », le quota d'un code, la période de validité,
 * l'unicité du dernier super admin : tout cela vit en SQL, sous verrou, et les
 * deux Edge Functions redemandent `est_super_admin()` avec le jeton de
 * l'appelant. Recopier ces règles ici donnerait deux vérités, et la seconde
 * finirait par diverger de celle qui décide.
 */

/* ================================ Types ================================= */

/**
 * La navigation de cette console vit dans la barre latérale depuis le
 * 2026-08-30 : les onglets qui coiffaient l'écran ont été promus entrées de
 * menu, et la clé vient donc de `@kolek/ui`. Une seule liste, un seul jeu de
 * libellés — deux barres de navigation pour le même écran donnaient deux
 * réponses possibles à « où suis-je ».
 */
type OngletSuperAdmin = CleNavSuper;

type FiltreStatut = 'tous' | 'actif' | 'expirant' | 'suspendu';

/* ============================== Constantes ============================== */

/**
 * Ce que la barre haute affiche pour chaque entrée du menu. Pas d'icône ni de
 * libellé de navigation ici : la barre latérale les porte déjà, et les
 * dupliquer ferait deux listes à tenir à jour pour un seul menu.
 */
interface ConfigOnglet {
  cle: OngletSuperAdmin;
  filAriane: string[];
  titre: string;
}

const ONGLETS: ConfigOnglet[] = [
  {
    cle: 'abonnements',
    filAriane: ['Super Admin', 'Abonnements'],
    titre: 'Gestion des abonnements',
  },
  {
    cle: 'administrateurs',
    filAriane: ['Super Admin', 'Administrateurs'],
    titre: 'Administrateurs',
  },
  {
    cle: 'promos',
    filAriane: ['Super Admin', 'Promotions'],
    titre: 'Codes promo & Remises',
  },
  {
    cle: 'securite',
    filAriane: ['Super Admin', 'Sécurité'],
    titre: 'Journal de sécurité',
  },
  {
    cle: 'plateforme',
    filAriane: ['Super Admin', 'Plateforme'],
    titre: 'Plateforme',
  },
];

const FILTRES: { cle: FiltreStatut; libelle: string }[] = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'actif', libelle: 'Actif' },
  { cle: 'expirant', libelle: 'Expirant' },
  { cle: 'suspendu', libelle: 'Suspendu' },
];

const LIBELLE_STATUT: Record<CodePromo['statut'], string> = {
  en_cours: 'En cours',
  programme: 'Programmé',
  expire: 'Expiré',
  quota_epuise: 'Quota épuisé',
};

const TEINTE_STATUT: Record<CodePromo['statut'], string> = {
  en_cours: 'bg-positive-tint text-positive',
  programme: 'bg-secondary text-secondary-foreground',
  expire: 'bg-canvas text-muted-foreground',
  quota_epuise: 'bg-negative-tint text-negative',
};

const CHAMP =
  'w-full min-h-11 px-3 bg-surface border border-hairline rounded-md font-body text-base text-ink outline-none focus:border-primary';
const ETIQUETTE = 'block font-body text-sm font-semibold text-ink mb-1';

const COLONNES_ABONNES = '1fr 100px 110px 120px 120px 110px 60px';
const LARGEUR_MINIMALE_ABONNES = 'min-w-[860px]';

/* ========================== Fonctions utilitaires ======================== */

function dateLisible(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Un MRR nul se lit « — » et non « 0 FCFA » : le collecteur est en essai, il ne
    paie pas encore ; zéro laisserait croire à un impayé. */
function mrrLisible(mrr: number): string {
  return mrr === 0 ? '—' : `${formatMontant(mrr)} FCFA`;
}

function PastillePalier({ palier }: { palier: string }) {
  const description = PALIERS.find((p) => p.cle === palier);
  if (!description) {
    return (
      <span className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold bg-negative-tint text-negative whitespace-nowrap">
        {palier} ?
      </span>
    );
  }
  return (
    <span
      className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold w-fit whitespace-nowrap"
      style={{ background: description.fond, color: description.texte }}
    >
      {description.nom}
    </span>
  );
}

function PastilleStatut({ c }: { c: LigneCollecteur }) {
  if (c.abonnement_statut === 'actif') {
    const joursRestants = Math.ceil(
      (new Date(c.abonnement_echeance).getTime() - Date.now()) / 86_400_000,
    );
    if (joursRestants <= 7) {
      return (
        <span className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold bg-negative-tint text-negative whitespace-nowrap">
          Expire dans {Math.max(joursRestants, 0)} j
        </span>
      );
    }
    return <BadgeStatut statut="Actif" />;
  }
  return (
    <span className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold bg-negative-tint text-negative whitespace-nowrap">
      {c.abonnement_statut === 'suspendu' ? 'Suspendu' : 'Expiré'}
    </span>
  );
}

/* ========================= Composant principal ========================== */

export function SuperAdmin({ vue, onglet }: { vue: VueGlobale; onglet: OngletSuperAdmin }) {
  const etat = useEtatSuperAdmin();
  /** Le dernier verdict du serveur, succès comme refus. Un seul emplacement :
      deux messages simultanés sur un même écran laissent croire à deux
      opérations, alors qu'une seule part à la fois. */
  const [verdict, setVerdict] = useState<{ ok: boolean; message: string } | null>(null);
  const [occupe, setOccupe] = useState(false);

  async function agir(demande: ActionSuperAdmin, succes: string) {
    if (occupe) return;
    setOccupe(true);
    setVerdict(null);
    const resultat = await agirSuperAdmin(demande);
    setOccupe(false);

    if (!resultat.ok) {
      setVerdict({ ok: false, message: resultat.message });
      return;
    }
    setVerdict({ ok: true, message: succes });
    etat.recharger();
  }

  const configOnglet = ONGLETS.find((o) => o.cle === onglet)!;

  function exporter() {
    telechargerCsv(
      `kolek-abonnements-${dateDuJour()}.csv`,
      versCsv(
        ['Collecteur', 'Téléphone', 'Zone', 'Palier', 'Prix mensuel', 'Statut', 'Échéance', 'Clients'],
        vue.collecteurs.map((c: LigneCollecteur) => [
          c.nom,
          c.telephone,
          c.zone ?? '',
          c.palier,
          PALIERS.find((p) => p.cle === c.palier)?.prix ?? '',
          c.abonnement_statut,
          c.abonnement_echeance,
          c.clients,
        ]),
      ),
    );
  }

  const actions =
    onglet === 'abonnements'
      ? [
          {
            icone: 'download' as NomIcone,
            libelle: 'Exporter',
            onActiver: exporter,
            disponible: vue.collecteurs.length > 0,
          },
          {
            icone: 'history' as NomIcone,
            libelle: 'Rafraîchir',
            onActiver: etat.recharger,
            disponible: etat.statut !== 'chargement',
          },
        ]
      : [
          {
            icone: 'history' as NomIcone,
            libelle: 'Rafraîchir',
            onActiver: etat.recharger,
            disponible: etat.statut !== 'chargement',
          },
        ];

  return (
    <>
      <BarreHaute filAriane={configOnglet.filAriane} titre={configOnglet.titre} actions={actions} />

      <div className="px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 overflow-y-auto">
        {etat.statut === 'chargement' && (
          <p role="status" className="font-body text-sm text-muted-foreground">
            Chargement de l'état de la plateforme…
          </p>
        )}

        {etat.statut === 'erreur' && (
          <Carte className="p-6">
            <h2 className="font-headings font-bold text-lg text-ink mb-2">État indisponible</h2>
            <p role="alert" className="font-body text-sm text-muted-foreground mb-4">
              {etat.message}
            </p>
            <Bouton icone="history" onClick={etat.recharger}>
              Réessayer
            </Bouton>
          </Carte>
        )}

        {etat.statut === 'ok' && (
          <>
            {verdict && (
              <p
                role={verdict.ok ? 'status' : 'alert'}
                className={`font-body text-sm font-medium px-4 py-2.5 rounded-md ${
                  verdict.ok ? 'bg-positive-tint text-positive' : 'bg-negative-tint text-negative'
                }`}
              >
                {verdict.message}
              </p>
            )}

            {onglet === 'abonnements' && <OngletAbonnements vue={vue} />}

            {onglet === 'administrateurs' && (
              <Administrateurs
                etat={etat.etat}
                occupe={occupe}
                onDefinir={(cible, niveau) =>
                  void agir(
                    { action: 'definir_niveau', cible, niveau },
                    niveau === 'super'
                      ? 'Compte promu super administrateur.'
                      : 'Niveau ramené à administrateur.',
                  )
                }
                onRevoquer={(cible) =>
                  void agir({ action: 'revoquer', cible }, 'Accès d\u2019administration retiré.')
                }
              />
            )}

            {onglet === 'promos' && (
              <>
                <CodesPromo
                  etat={etat.etat}
                  vue={vue}
                  occupe={occupe}
                  onCreer={(demande) => void agir(demande, `Code ${demande.code} créé.`)}
                  onAppliquer={(demande) =>
                    void agir(demande, `Code ${demande.code} appliqué au collecteur.`)
                  }
                />
                <Remises etat={etat.etat} />
              </>
            )}

            {onglet === 'securite' && <Journal />}

            {onglet === 'plateforme' && <Plateforme etat={etat.etat} />}
          </>
        )}
      </div>
    </>
  );
}

/* ========================= Onglet Abonnements =========================== */

function OngletAbonnements({ vue }: { vue: VueGlobale }) {
  const { abonnements, collecteurs } = vue;
  const prixParPalier = new Map(abonnements.parPalier.map((p) => [p.palier, p.prix]));
  const [filtre, setFiltre] = useState<FiltreStatut>('tous');
  const [recherche, setRecherche] = useState('');

  const collecteursFiltres = collecteurs.filter((c) => {
    // Recherche textuelle — déclenchée à partir de 3 caractères.
    if (recherche.length >= 3) {
      const q = recherche.toLowerCase();
      if (!c.nom.toLowerCase().includes(q) && !c.telephone.toLowerCase().includes(q)) {
        return false;
      }
    }

    switch (filtre) {
      case 'actif': {
        if (c.abonnement_statut !== 'actif') return false;
        const jours = Math.ceil(
          (new Date(c.abonnement_echeance).getTime() - Date.now()) / 86_400_000,
        );
        return jours > 7;
      }
      case 'expirant': {
        if (c.abonnement_statut !== 'actif') return false;
        const jours = Math.ceil(
          (new Date(c.abonnement_echeance).getTime() - Date.now()) / 86_400_000,
        );
        return jours <= 7;
      }
      case 'suspendu':
        return c.abonnement_statut === 'suspendu' || c.abonnement_statut === 'expire';
      default:
        return true;
    }
  });

  const indicateurs = [
    {
      libelle: 'MRR total',
      valeur: formatMontant(abonnements.mrr),
      unite: 'FCFA',
      precision: `${abonnements.collecteurs_actifs} abonnement${abonnements.collecteurs_actifs > 1 ? 's' : ''} actif${abonnements.collecteurs_actifs > 1 ? 's' : ''}`,
      alerte: false,
    },
    {
      libelle: 'Collecteurs actifs',
      valeur: String(abonnements.collecteurs_actifs),
      unite: '',
      precision: `sur ${abonnements.collecteurs_total} inscrits`,
      alerte: false,
    },
    {
      libelle: 'Expirations ce mois',
      valeur: String(abonnements.expirations_ce_mois),
      unite: '',
      precision: abonnements.expirations_ce_mois > 0 ? 'À traiter' : 'Aucune expiration',
      alerte: abonnements.expirations_ce_mois > 0,
    },
    {
      libelle: 'En défaut',
      valeur: String(abonnements.suspendus + abonnements.expires),
      unite: '',
      precision: `${abonnements.suspendus} suspendu${abonnements.suspendus > 1 ? 's' : ''}, ${abonnements.expires} expiré${abonnements.expires > 1 ? 's' : ''}`,
      alerte: abonnements.suspendus + abonnements.expires > 0,
    },
  ];

  return (
    <>
      {/* Indicateurs clés */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {indicateurs.map((ind) => (
          <Carte key={ind.libelle} className="p-5">
            <span className="text-sm font-body font-medium text-muted-foreground block mb-1">
              {ind.libelle}
            </span>
            <p
              className={`font-headings font-bold text-2xl sm:text-3xl tabular-nums ${
                ind.alerte ? 'text-negative' : 'text-ink'
              }`}
            >
              {ind.valeur}
              {ind.unite && (
                <span className="text-lg font-body font-medium text-muted-foreground ml-1">
                  {ind.unite}
                </span>
              )}
            </p>
            <span
              className={`text-sm font-body mt-2 block ${
                ind.alerte ? 'text-negative font-medium' : 'text-muted-foreground'
              }`}
            >
              {ind.precision}
            </span>
          </Carte>
        ))}
      </div>

      {/* Paliers d'abonnement */}
      <div>
        <h2 className="font-headings font-bold text-xl text-ink mb-3">Paliers d'abonnement</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {PALIERS.map((palier) => {
            const compte = abonnements.parPalier.find((p) => p.palier === palier.cle);
            return (
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
                      {compte?.actifs ?? 0} actif{(compte?.actifs ?? 0) > 1 ? 's' : ''}
                    </span>
                    <span className="text-sm font-body font-semibold text-ink tabular-nums">
                      {mrrLisible(compte?.mrr ?? 0)}
                    </span>
                  </div>
                </div>
              </Carte>
            );
          })}
        </div>
      </div>

      {/* Tableau des collecteurs abonnés */}
      <Carte className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-hairline">
          <h2 className="font-headings font-bold text-xl text-ink">Collecteurs abonnés</h2>
          <div className="flex flex-wrap items-center gap-3">
            {/* Filtres */}
            <div className="flex items-center gap-1">
              {FILTRES.map((f) => (
                <button
                  key={f.cle}
                  type="button"
                  onClick={() => setFiltre(f.cle)}
                  className={`px-3 py-1.5 rounded-pill text-sm font-body font-medium cursor-pointer transition-colors ${
                    filtre === f.cle
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {f.libelle}
                </button>
              ))}
            </div>
            {/* Recherche */}
            <div className="relative">
              <Icone
                nom="search"
                taille={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                placeholder="Rechercher…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                className="pl-9 pr-3 h-9 bg-surface border border-hairline rounded-md font-body text-sm text-ink outline-none focus:border-primary w-44"
              />
            </div>
          </div>
        </div>

        {collecteursFiltres.length === 0 ? (
          <p className="px-4 sm:px-6 py-8 text-sm font-body text-muted-foreground">
            {recherche.length >= 3
              ? 'Aucun collecteur ne correspond à cette recherche.'
              : 'Aucun collecteur dans ce filtre.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className={LARGEUR_MINIMALE_ABONNES}>
              <div
                className="grid px-4 sm:px-6 py-3 bg-canvas border-b border-hairline text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground gap-4"
                style={{ gridTemplateColumns: COLONNES_ABONNES }}
              >
                <span>Collecteur</span>
                <span>Palier</span>
                <span>Depuis</span>
                <span className="text-right">Expiration</span>
                <span className="text-right">MRR</span>
                <span className="text-right">Statut</span>
                <span />
              </div>

              {collecteursFiltres.map((c, i) => (
                <div
                  key={c.id}
                  className={`grid items-center px-4 sm:px-6 py-3.5 gap-4 ${
                    i < collecteursFiltres.length - 1 ? 'border-b border-hairline' : ''
                  }`}
                  style={{ gridTemplateColumns: COLONNES_ABONNES }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar nom={c.nom} className="w-8 h-8 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-base font-body font-semibold text-ink truncate">
                        {c.nom}
                      </p>
                      <p className="text-xs font-body text-muted-foreground truncate">
                        {c.telephone}
                      </p>
                    </div>
                  </div>
                  <PastillePalier palier={c.palier} />
                  <span className="text-sm font-body text-muted-foreground tabular-nums">
                    {dateLisible(c.cree_le)}
                  </span>
                  <span className="text-right text-sm font-body text-muted-foreground tabular-nums">
                    {dateLisible(c.abonnement_echeance)}
                  </span>
                  <span className="text-right text-sm font-body font-semibold text-ink tabular-nums">
                    {mrrLisible(
                      c.abonnement_statut === 'actif' ? (prixParPalier.get(c.palier) ?? 0) : 0,
                    )}
                  </span>
                  <div className="flex justify-end">
                    <PastilleStatut c={c} />
                  </div>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      disabled
                      title="Modifier"
                      className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground opacity-50 cursor-default"
                    >
                      <Icone nom="edit" taille={14} />
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Plus d'options"
                      className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground opacity-50 cursor-default"
                    >
                      <Icone nom="more-horizontal" taille={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Carte>
    </>
  );
}

/* ============================ Administrateurs ============================ */

function Administrateurs({
  etat,
  occupe,
  onDefinir,
  onRevoquer,
}: {
  etat: EtatSuperAdmin;
  occupe: boolean;
  onDefinir: (cible: string, niveau: AdministrateurSuper['niveau']) => void;
  onRevoquer: (cible: string) => void;
}) {
  /** Un identifiant n'est un nom pour personne : « ajouté par » se relit dans
      la liste elle-même quand l'auteur y figure encore. */
  const nomDe = new Map(etat.administrateurs.map((a) => [a.user_id, a.nom]));

  return (
    <section>
      <h2 className="font-headings font-bold text-xl text-ink mb-1">Administrateurs</h2>
      <p className="font-body text-sm text-muted-foreground mb-3">
        Un super administrateur voit et modifie cet écran. Un administrateur ordinaire ne le voit
        pas.
      </p>

      <Carte className="divide-y divide-hairline">
        {etat.administrateurs.map((a) => {
          const cestMoi = a.user_id === etat.appelant;
          return (
            <div
              key={a.user_id}
              data-testid={`admin-${a.user_id}`}
              className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-body font-semibold text-ink truncate">
                  {a.nom}
                  {cestMoi && (
                    <span className="ml-2 px-2 py-0.5 rounded-pill bg-secondary text-secondary-foreground text-xs font-semibold">
                      C'est toi
                    </span>
                  )}
                </p>
                <p className="font-body text-sm text-muted-foreground">
                  {a.niveau === 'super' ? 'Super administrateur' : 'Administrateur'}
                  {' · '}
                  {a.telephone ?? 'sans téléphone'}
                  {' · '}
                  depuis le {dateLisible(a.ajoute_le)}
                  {a.ajoute_par && `, ajouté par ${nomDe.get(a.ajoute_par) ?? 'un compte retiré'}`}
                </p>
              </div>

              {/* Aucun bouton sur sa propre ligne : le serveur refuse toute
                  action d'un compte sur lui-même — c'est ce qui garantit qu'il
                  reste toujours un super administrateur — et proposer le clic
                  reviendrait à promettre un geste impossible. */}
              {!cestMoi && (
                <div className="flex gap-2 flex-shrink-0">
                  {a.niveau === 'admin' ? (
                    <Bouton
                      variante="contour"
                      disabled={occupe}
                      onClick={() => onDefinir(a.user_id, 'super')}
                    >
                      Promouvoir
                    </Bouton>
                  ) : (
                    <Bouton
                      variante="contour"
                      disabled={occupe}
                      onClick={() => onDefinir(a.user_id, 'admin')}
                    >
                      Rétrograder
                    </Bouton>
                  )}
                  <Bouton
                    variante="fantome"
                    disabled={occupe}
                    onClick={() => onRevoquer(a.user_id)}
                  >
                    Révoquer
                  </Bouton>
                </div>
              )}
            </div>
          );
        })}
      </Carte>
    </section>
  );
}

/* =============================== Codes promo ============================= */

function CodesPromo({
  etat,
  vue,
  occupe,
  onCreer,
  onAppliquer,
}: {
  etat: EtatSuperAdmin;
  vue: VueGlobale;
  occupe: boolean;
  onCreer: (demande: Extract<ActionSuperAdmin, { action: 'creer_code' }>) => void;
  onAppliquer: (demande: Extract<ActionSuperAdmin, { action: 'appliquer_code' }>) => void;
}) {
  const [code, setCode] = useState('');
  const [remise, setRemise] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [quota, setQuota] = useState('');

  const [collecteur, setCollecteur] = useState('');
  const [codeApplique, setCodeApplique] = useState('');

  const codesApplicables = etat.codes_promo.filter((c) => c.statut === 'en_cours');

  return (
    <section>
      <h2 className="font-headings font-bold text-xl text-ink mb-1">Codes promo</h2>
      <p className="font-body text-sm text-muted-foreground mb-3">
        Un code réduit le prix du palier d'un collecteur jusqu'à sa date de fin. Seul le Super
        Admin l'applique : le collecteur ne saisit rien.
      </p>

      <Carte className="divide-y divide-hairline mb-4">
        {etat.codes_promo.length === 0 && (
          <p className="p-4 font-body text-sm text-muted-foreground">Aucun code pour l'instant.</p>
        )}
        {etat.codes_promo.map((c) => (
          <div
            key={c.code}
            data-testid={`code-${c.code}`}
            className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-body font-semibold text-ink">
                {c.code}
                <span className="ml-2 font-normal text-muted-foreground">−{c.remise_pct} %</span>
              </p>
              <p className="font-body text-sm text-muted-foreground">
                du {dateLisible(c.valide_du)} au {dateLisible(c.valide_au)}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="font-body text-sm text-ink tabular-nums">
                {c.utilisations} / {c.quota ?? 'illimité'}
              </span>
              <span
                className={`px-2.5 py-1 rounded-pill text-xs font-body font-semibold whitespace-nowrap ${TEINTE_STATUT[c.statut]}`}
              >
                {LIBELLE_STATUT[c.statut]}
              </span>
            </div>
          </div>
        ))}
      </Carte>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Carte className="p-5">
          <h3 className="font-headings font-bold text-base text-ink mb-3">Créer un code</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="promo-code" className={ETIQUETTE}>
                Code
              </label>
              <input
                id="promo-code"
                className={CHAMP}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="promo-remise" className={ETIQUETTE}>
                Remise (%)
              </label>
              <input
                id="promo-remise"
                type="number"
                min={1}
                max={100}
                className={CHAMP}
                value={remise}
                onChange={(e) => setRemise(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="promo-du" className={ETIQUETTE}>
                Valide du
              </label>
              <input
                id="promo-du"
                type="date"
                className={CHAMP}
                value={du}
                onChange={(e) => setDu(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="promo-au" className={ETIQUETTE}>
                Au
              </label>
              <input
                id="promo-au"
                type="date"
                className={CHAMP}
                value={au}
                onChange={(e) => setAu(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="promo-quota" className={ETIQUETTE}>
                Quota (vide = illimité)
              </label>
              <input
                id="promo-quota"
                type="number"
                min={1}
                className={CHAMP}
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4">
            <Bouton
              icone="plus"
              disabled={occupe || !code || !remise || !du || !au}
              onClick={() => {
                onCreer({
                  action: 'creer_code',
                  code: code.trim().toUpperCase(),
                  remise_pct: Number(remise),
                  valide_du: du,
                  valide_au: au,
                  quota: quota === '' ? null : Number(quota),
                });
                setCode('');
                setRemise('');
                setDu('');
                setAu('');
                setQuota('');
              }}
            >
              Créer le code
            </Bouton>
          </div>
        </Carte>

        <Carte className="p-5">
          <h3 className="font-headings font-bold text-base text-ink mb-3">
            Appliquer un code à un collecteur
          </h3>
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="promo-collecteur" className={ETIQUETTE}>
                Collecteur
              </label>
              <select
                id="promo-collecteur"
                className={`${CHAMP} cursor-pointer`}
                value={collecteur}
                onChange={(e) => setCollecteur(e.target.value)}
              >
                <option value="">Choisir…</option>
                {vue.collecteurs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="promo-applique" className={ETIQUETTE}>
                Code à appliquer
              </label>
              <select
                id="promo-applique"
                className={`${CHAMP} cursor-pointer`}
                value={codeApplique}
                onChange={(e) => setCodeApplique(e.target.value)}
              >
                <option value="">Choisir…</option>
                {codesApplicables.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} (−{c.remise_pct} %)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Bouton
                disabled={occupe || !collecteur || !codeApplique}
                onClick={() => {
                  onAppliquer({
                    action: 'appliquer_code',
                    collecteur,
                    code: codeApplique,
                  });
                  setCollecteur('');
                  setCodeApplique('');
                }}
              >
                Appliquer
              </Bouton>
            </div>
          </div>
        </Carte>
      </div>
    </section>
  );
}

/* ================================ Remises ================================ */

function Remises({ etat }: { etat: EtatSuperAdmin }) {
  return (
    <section>
      <h2 className="font-headings font-bold text-xl text-ink mb-1">Remises en cours</h2>
      <p className="font-body text-sm text-muted-foreground mb-3">
        Ce que la plateforme offre aujourd'hui. Une remise échue disparaît d'ici : elle n'est plus
        une dépense, elle appartient au journal.
      </p>

      <Carte className="divide-y divide-hairline">
        {etat.remises.length === 0 && (
          <p className="p-4 font-body text-sm text-muted-foreground">Aucune remise en cours.</p>
        )}
        {etat.remises.map((r) => (
          <div
            key={r.collecteur_id}
            data-testid={`remise-${r.collecteur_id}`}
            className="p-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="font-body font-semibold text-ink truncate">{r.nom}</p>
            <p className="font-body text-sm text-muted-foreground">
              <span className="font-semibold text-ink">{r.promo_code}</span>
              {' · '}
              <span className="text-ink">−{r.remise_pct} %</span>
              {' · '}
              jusqu'au {dateLisible(r.remise_fin)}
            </p>
          </div>
        ))}
      </Carte>
    </section>
  );
}

/* ================================ Journal ================================ */

const TAILLE_PAGE = 50;

function horodatage(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR');
}

/**
 * Le journal ne se charge pas tout seul, et c'est le point.
 *
 * Chaque lecture s'enregistre dans le journal — c'est l'action qui révèle tout
 * le reste, et sans cette trace ce serait la seule à ne rien laisser. La
 * déclencher à l'ouverture de l'écran remplirait la table de la preuve qu'on la
 * regarde : en une semaine, elle ne parlerait plus que d'elle-même, et ce
 * qu'elle protège serait enterré dessous.
 *
 * Il faut donc le demander. C'est un clic de plus, assumé.
 */
function Journal() {
  const [page, setPage] = useState<PageJournal | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [consultations, setConsultations] = useState(false);

  async function lire(numero: number, avecConsultations: boolean) {
    setEnCours(true);
    setErreur(null);
    try {
      setPage(
        await chargerJournal({
          page: numero,
          taille: TAILLE_PAGE,
          consultations: avecConsultations,
        }),
      );
      setConsultations(avecConsultations);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : 'Lecture impossible.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section>
      <h2 className="font-headings font-bold text-xl text-ink mb-1">Journal de sécurité</h2>
      <p className="font-body text-sm text-muted-foreground mb-3">
        Qui a fait quoi, sur quelle ligne, et quand. Le journal est en écriture seule : un
        déclencheur refuse toute modification, y compris par la clé de service.{' '}
        <strong className="font-semibold text-ink">Le consulter s'enregistre</strong> — c'est
        pourquoi il ne s'affiche pas de lui-même.
      </p>

      <Carte className="p-5">
        {!page && !erreur && (
          <Bouton icone="history" disabled={enCours} onClick={() => void lire(1, false)}>
            Afficher le journal
          </Bouton>
        )}

        {erreur && (
          <>
            <p role="alert" className="font-body text-sm text-negative mb-3">
              {erreur}
            </p>
            <Bouton
              variante="contour"
              icone="history"
              disabled={enCours}
              onClick={() => void lire(page?.page ?? 1, consultations)}
            >
              Réessayer
            </Bouton>
          </>
        )}

        {page && (
          <>
            <label className="flex items-center gap-2 mb-4 font-body text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={consultations}
                disabled={enCours}
                onChange={(e) => void lire(1, e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              Afficher aussi les consultations du journal
            </label>

            <div className="divide-y divide-hairline">
              {page.lignes.length === 0 && (
                <p className="font-body text-sm text-muted-foreground py-2">
                  Aucune ligne sur cette page.
                </p>
              )}
              {page.lignes.map((l) => (
                <div key={l.id} data-testid={`journal-${l.id}`} className="py-3">
                  <p className="font-body text-sm text-ink">
                    <span className="font-semibold">{l.table_cible}</span>
                    {' · '}
                    {l.action}
                    {' · '}
                    <span className="text-muted-foreground">{horodatage(l.survenu_le)}</span>
                  </p>
                  <p className="font-body text-xs text-muted-foreground break-all">
                    acteur {l.acteur_id ?? 'inconnu'} · ligne {l.ligne_id ?? '—'}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-4">
              <Bouton
                variante="contour"
                disabled={enCours || page.page <= 1}
                onClick={() => void lire(page.page - 1, consultations)}
              >
                Page précédente
              </Bouton>
              <Bouton
                variante="contour"
                disabled={enCours || !page.a_suivre}
                onClick={() => void lire(page.page + 1, consultations)}
              >
                Page suivante
              </Bouton>
              <span className="font-body text-sm text-muted-foreground">Page {page.page}</span>
            </div>
          </>
        )}
      </Carte>
    </section>
  );
}

/* =============================== Plateforme ============================== */

/**
 * Les libellés des tables, repris de l'écran Réglages d'où cette section vient.
 */
const LIBELLES_VOLUMES: Record<string, string> = {
  collecteurs: 'Collecteurs',
  clients: 'Clients',
  cartes: 'Cartes',
  cartes_actives: 'Cartes actives',
  mises: 'Mises',
  retraits: 'Retraits',
  caisses_jour: 'Journées de caisse',
  audit_log: 'Lignes de journal',
  rejets_non_traites: 'Rejets de synchro non traités',
};

function Plateforme({ etat }: { etat: EtatSuperAdmin }) {
  const rejets = etat.volumes.rejets_non_traites ?? 0;

  return (
    <section>
      <h2 className="font-headings font-bold text-xl text-ink mb-1">Plateforme</h2>
      <p className="font-body text-sm text-muted-foreground mb-3">
        Mesuré à l'instant, côté serveur — ce n'est pas ce que le dépôt déclare, c'est ce que la
        base répond. Comptes exacts et non estimations du planificateur : sur des tables de cette
        taille, l'estimation peut être fausse de moitié.
      </p>

      <div data-testid="plateforme">
      <Carte className="p-5">
        <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
          {Object.entries(etat.volumes).map(([table, lignes]) => (
            <div key={table}>
              <dt className="font-body text-sm text-muted-foreground truncate">
                {LIBELLES_VOLUMES[table] ?? table}
              </dt>
              <dd className="font-headings font-bold text-lg text-ink tabular-nums">{lignes}</dd>
            </div>
          ))}
        </dl>

        {rejets > 0 && (
          <p role="alert" className="font-body text-sm text-negative mt-4">
            Des mises ont été refusées à la synchronisation et attendent un arbitrage humain.
            L'argent a changé de main dans le monde réel : ces lignes ne doivent pas rester en
            attente.
          </p>
        )}

        <p className="font-body text-sm font-semibold text-ink mt-5 mb-2">Tables journalisées</p>
        <p className="font-body text-xs text-muted-foreground mb-2">
          Lu dans <code>pg_trigger</code> : c'est la configuration en vigueur, pas une liste écrite
          à la main qui deviendrait fausse à la première migration. Le journal est en écriture
          seule — un déclencheur refuse toute modification, y compris par la clé de service.
        </p>
        <div className="flex flex-wrap gap-2">
          {etat.journal.tables.map((t) => (
            <span
              key={t}
              className="px-2.5 py-1 rounded-pill text-xs font-body font-medium bg-positive-tint text-positive"
            >
              {t}
            </span>
          ))}
        </div>

        <p className="font-body text-sm text-muted-foreground mt-4">
          {etat.postgres}
          {' · dernière écriture au journal '}
          {etat.journal.derniere_ecriture
            ? new Date(etat.journal.derniere_ecriture).toLocaleString('fr-FR')
            : 'aucune'}
        </p>
      </Carte>
      </div>
    </section>
  );
}
