import { BarreHaute, Bouton, Carte } from '@kolek/ui';
import { useState } from 'react';

import type { VueGlobale } from '../donnees';
import {
  agirSuperAdmin,
  useEtatSuperAdmin,
  type ActionSuperAdmin,
  type AdministrateurSuper,
  type CodePromo,
  type EtatSuperAdmin,
} from '../superadmin';

/**
 * L'écran système : qui administre, quelles remises courent, ce que pèse la base.
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
 *
 * Ce que l'écran fait quand même : ne pas proposer un geste dont la seule issue
 * connue est un refus. Sa propre ligne ne porte aucun bouton — pas pour protéger
 * quoi que ce soit, mais parce qu'un clic qui ne peut qu'échouer est une
 * promesse fausse.
 *
 * ## Le journal n'est pas ici, et c'est dit
 *
 * `super_admin_journal()` existe en base — paginée, bornée, sa consultation
 * s'enregistre — mais aucune Edge Function ne la sert encore. Une section vide
 * ou un onglet mort apprendraient à l'administrateur que l'interface promet ce
 * qu'elle ne tient pas ; `BarreLaterale.tsx` porte deux fois cette leçon. La
 * section arrivera avec sa route.
 */

function dateLisible(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

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

export function SuperAdmin({ vue }: { vue: VueGlobale }) {
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
    // Rechargé plutôt que rafistolé sur place : la base recalcule les statuts
    // des codes et « ajouté par » se relit dans le journal. Réécrire ces
    // dérivés dans l'écran donnerait un affichage juste jusqu'à la première
    // divergence.
    etat.recharger();
  }

  return (
    <>
      <BarreHaute
        filAriane={['Accueil', 'Super Admin']}
        titre="Administration système"
        actions={[
          {
            icone: 'history',
            libelle: 'Rafraîchir',
            onActiver: etat.recharger,
            disponible: etat.statut !== 'chargement',
          },
        ]}
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 overflow-y-auto">
        {etat.statut === 'chargement' && (
          <p role="status" className="font-body text-sm text-muted-foreground">
            Chargement de l’état de la plateforme…
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
                  verdict.ok
                    ? 'bg-positive-tint text-positive'
                    : 'bg-negative-tint text-negative'
                }`}
              >
                {verdict.message}
              </p>
            )}

            <Indicateurs etat={etat.etat} />
            <Administrateurs
              etat={etat.etat}
              occupe={occupe}
              onDefinir={(cible, niveau) =>
                void agir(
                  { action: 'definir_niveau', cible, niveau },
                  niveau === 'super' ? 'Compte promu super administrateur.' : 'Niveau ramené à administrateur.',
                )
              }
              onRevoquer={(cible) =>
                void agir({ action: 'revoquer', cible }, 'Accès d’administration retiré.')
              }
            />
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
            <Plateforme etat={etat.etat} />
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------ Indicateurs ------------------------------ */

function Indicateurs({ etat }: { etat: EtatSuperAdmin }) {
  const supers = etat.administrateurs.filter((a) => a.niveau === 'super').length;
  const enCours = etat.codes_promo.filter((c) => c.statut === 'en_cours').length;

  const cases = [
    { libelle: 'Administrateurs', valeur: String(etat.administrateurs.length), precision: `dont ${supers} super` },
    { libelle: 'Codes actifs', valeur: String(enCours), precision: `${etat.codes_promo.length} au total` },
    {
      libelle: 'Remises en cours',
      valeur: String(etat.remises.length),
      precision: 'abonnements réduits',
    },
    {
      libelle: 'Lignes de journal',
      valeur: String(etat.volumes.audit_log ?? 0),
      precision: etat.journal.derniere_ecriture
        ? `dernière écriture ${dateLisible(etat.journal.derniere_ecriture)}`
        : 'aucune écriture',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cases.map((c) => (
        <Carte key={c.libelle} className="p-5">
          <span className="text-sm font-body font-medium text-muted-foreground block mb-1">
            {c.libelle}
          </span>
          <p className="font-headings font-bold text-2xl sm:text-3xl text-ink tabular-nums">
            {c.valeur}
          </p>
          <span className="text-sm font-body text-muted-foreground mt-2 block">{c.precision}</span>
        </Carte>
      ))}
    </div>
  );
}

/* ---------------------------- Administrateurs ---------------------------- */

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
                      C’est toi
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

/* ------------------------------ Codes promo ------------------------------ */

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
        Un code réduit le prix du palier d’un collecteur jusqu’à sa date de fin. Seul le Super
        Admin l’applique : le collecteur ne saisit rien.
      </p>

      <Carte className="divide-y divide-hairline mb-4">
        {etat.codes_promo.length === 0 && (
          <p className="p-4 font-body text-sm text-muted-foreground">Aucun code pour l’instant.</p>
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
                {/* Un quota absent se lit « illimité » et non « 0 » : les deux
                    sont des nombres à l'écran et des choses opposées en base. */}
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
                  // Mis en majuscules ici plutôt que refusé à la frappe : la
                  // contrainte de table n'admet que `[A-Z0-9]`, et rejeter une
                  // saisie pour une casse ferait deviner une règle de stockage.
                  code: code.trim().toUpperCase(),
                  remise_pct: Number(remise),
                  valide_du: du,
                  valide_au: au,
                  // Une case vide vaut `null`, jamais `0` : `0` serait un code
                  // épuisé d'avance, `null` veut dire sans limite.
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
                {/* Seuls les codes en cours : un code programmé ou épuisé serait
                    refusé par la base, et l'offrir au clic promettrait un geste
                    qui ne peut qu'échouer. */}
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

/* -------------------------------- Remises -------------------------------- */

function Remises({ etat }: { etat: EtatSuperAdmin }) {
  return (
    <section>
      <h2 className="font-headings font-bold text-xl text-ink mb-1">Remises en cours</h2>
      <p className="font-body text-sm text-muted-foreground mb-3">
        Ce que la plateforme offre aujourd’hui. Une remise échue disparaît d’ici : elle n’est plus
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
              jusqu’au {dateLisible(r.remise_fin)}
            </p>
          </div>
        ))}
      </Carte>
    </section>
  );
}

/* ------------------------------- Plateforme ------------------------------ */

function Plateforme({ etat }: { etat: EtatSuperAdmin }) {
  return (
    <section>
      <h2 className="font-headings font-bold text-xl text-ink mb-1">Plateforme</h2>
      <p className="font-body text-sm text-muted-foreground mb-3">
        Mesuré à l’instant, côté serveur — ce n’est pas ce que le dépôt espère, c’est ce que la
        base répond.
      </p>

      <Carte className="p-5">
        <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
          {Object.entries(etat.volumes).map(([table, lignes]) => (
            <div key={table}>
              <dt className="font-body text-sm text-muted-foreground truncate">{table}</dt>
              <dd className="font-headings font-bold text-lg text-ink tabular-nums">{lignes}</dd>
            </div>
          ))}
        </dl>
        <p className="font-body text-sm text-muted-foreground mt-4">
          {etat.postgres}
          {' · '}
          {etat.journal.tables.length} table
          {etat.journal.tables.length > 1 ? 's' : ''} journalisée
          {etat.journal.tables.length > 1 ? 's' : ''}
        </p>
      </Carte>
    </section>
  );
}
