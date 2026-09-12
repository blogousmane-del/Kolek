import { PALIERS } from '@kolek/core';
import { BarreHaute, Bouton, Carte, type CleNavSuper, type NomIcone } from '@kolek/ui';
import { useState } from 'react';

import type { LigneCollecteur, VueGlobale } from '../donnees';
import { dateDuJour, telechargerCsv, versCsv } from '../exporter';
import { OngletAbonnements } from './superadmin/Abonnements';
import { Administrateurs } from './superadmin/Administrateurs';
import { Journal } from './superadmin/Journal';
import { Paiement } from './superadmin/Paiement';
import { Plateforme } from './superadmin/Plateforme';
import { CodesPromo, Remises } from './superadmin/Promos';
import { agirSuperAdmin, useEtatSuperAdmin, type ActionSuperAdmin } from '../superadmin';

/**
 * La console de plateforme, découpée en cinq écrans le 2026-08-30, six depuis
 * que « Paiement » y est entrée le 2026-09-03.
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
    cle: 'paiement',
    filAriane: ['Super Admin', 'Paiement'],
    titre: 'Paiement des abonnements',
  },
  {
    cle: 'plateforme',
    filAriane: ['Super Admin', 'Santé du système'],
    titre: 'Santé du système',
  },
];

/* ========================= Composant principal ========================== */

export function SuperAdmin({
  vue,
  onglet,
  onRecharger,
}: {
  vue: VueGlobale;
  onglet: OngletSuperAdmin;
  /** Recharge la vue globale — la liste des collecteurs, donc les lignes du
      tableau des abonnés. Distinct de `etat.recharger`, qui ne rapporte que
      l'état de la plateforme : modifier le palier d'un collecteur change la
      première et pas la seconde. */
  onRecharger: () => void;
}) {
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

  // Plus de « Rafraichir » : recharger est le travail du navigateur, et le
  // bouton masquait de quand datent ces chiffres. L'age passe a la barre
  // haute, qui le rend cliquable.
  const actions =
    onglet === 'abonnements'
      ? [
          {
            icone: 'download' as NomIcone,
            libelle: 'Exporter',
            onActiver: exporter,
            disponible: vue.collecteurs.length > 0,
          },
        ]
      : [];

  return (
    <>
      <BarreHaute
        filAriane={configOnglet.filAriane}
        titre={configOnglet.titre}
        actions={actions}
        mesure={
          etat.statut === 'ok'
            ? { iso: etat.etat.genere_le, onRecharger: etat.recharger }
            : undefined
        }
      />

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

            {onglet === 'abonnements' && (
              <OngletAbonnements
                vue={vue}
                etat={etat.etat}
                occupe={occupe}
                onRecharger={onRecharger}
                onVerdict={(ok, message) => setVerdict({ ok, message })}
                onAppliquer={(demande) =>
                  void agir(demande, `Code ${demande.code} appliqué au collecteur.`)
                }
              />
            )}

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

            {onglet === 'securite' && (
              <Journal volumes={etat.etat.volumes} journal={etat.etat.journal} />
            )}

            {onglet === 'paiement' && <Paiement paiement={etat.etat.paiement ?? null} />}

            {onglet === 'plateforme' && <Plateforme etat={etat.etat} />}
          </>
        )}
      </div>
    </>
  );
}
