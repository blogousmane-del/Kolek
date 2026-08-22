import { PALIERS, formatMontant } from '@kolek/core';
import { BarreHaute, Bouton, Carte, Champ, Icone } from '@kolek/ui';
import { useEffect, useState } from 'react';

import {
  changerMotDePasse,
  chargerEtatPlateforme,
  lireEnvironnement,
  masquer,
  mesurerAuth,
  type EtatAuth,
  type EtatPlateforme,
} from '../reglages';

/**
 * Réglages — l'état de la plateforme, pour GTCS.
 *
 * ## La règle qui tient tout l'écran
 *
 * **Ce qui est affiché est mesuré, ou dit comme non mesurable.** Un écran de
 * réglages est le pire endroit où recopier une valeur du dépôt : elle a l'air
 * officielle, et le distant peut dire autre chose. L'écart entre
 * `config.toml` et le projet en ligne a coûté quatre constats d'audit en trois
 * jours, toujours de la même famille — *ce que le dépôt déclare n'est pas ce que
 * la plateforme applique*.
 *
 * Donc : les fournisseurs d'authentification et la fermeture des inscriptions
 * viennent de `/auth/v1/settings`, interrogé à l'ouverture de l'écran. La
 * longueur minimale et le filtre des fuites ne sont **pas** affichés, parce que
 * GoTrue ne les publie pas — et l'écran écrit pourquoi plutôt que de laisser un
 * vide.
 *
 * ## La clé de service n'est pas ici
 *
 * C'est la section que tout le monde cherche dans un écran « API ». Elle
 * n'existe pas, et l'écran le dit en face avec la raison : cette clé contourne
 * RLS sur toutes les tables, et un navigateur qui la reçoit l'expose à toute
 * extension installée. La clé anonyme, elle, est publique par construction —
 * elle voyage déjà dans ce fichier JavaScript.
 */
export function Reglages() {
  const [etat, setEtat] = useState<EtatPlateforme | null>(null);
  const [auth, setAuth] = useState<EtatAuth | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreurAuth, setErreurAuth] = useState<string | null>(null);
  const environnement = lireEnvironnement();

  useEffect(() => {
    let vivant = true;

    void (async () => {
      try {
        const e = await chargerEtatPlateforme();
        if (vivant) setEtat(e);
      } catch (cause) {
        if (vivant) setErreur(cause instanceof Error ? cause.message : 'Erreur inconnue.');
      }
    })();

    // Deux chargements indépendants : GoTrue peut répondre quand l'Edge
    // Function est en panne, et l'inverse. Les lier ferait disparaître une
    // section parce que l'autre a échoué.
    void (async () => {
      try {
        const a = await mesurerAuth();
        if (vivant) setAuth(a);
      } catch (cause) {
        if (vivant) setErreurAuth(cause instanceof Error ? cause.message : 'Mesure impossible.');
      }
    })();

    return () => {
      vivant = false;
    };
  }, []);

  return (
    <>
      <BarreHaute filAriane={['Accueil', 'Réglages']} titre="Réglages" actions={[]} />

      <div className="px-4 sm:px-6 lg:px-8 pb-8 flex flex-col gap-5 max-w-4xl">
        {erreur && (
          <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
            {erreur}
          </p>
        )}

        <MonMotDePasse />
        <SectionApi environnement={environnement} />
        <SectionAuth auth={auth} erreur={erreurAuth} />
        <SectionAdministrateurs etat={etat} />
        <SectionJournal etat={etat} />
        <SectionVolumes etat={etat} />
        <SectionTarifs />
        <SectionApplication etat={etat} projet={environnement.projet} />
      </div>
    </>
  );
}

/* ---------------------------- Mon mot de passe --------------------------- */

function MonMotDePasse() {
  const [ouvert, setOuvert] = useState(false);
  const [valeur, setValeur] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const identiques = valeur.length > 0 && valeur === confirmation;

  async function enregistrer() {
    if (envoi || !identiques) return;
    setEnvoi(true);
    setMessage(null);

    const resultat = await changerMotDePasse(valeur);

    setEnvoi(false);
    if (!resultat.ok) {
      setMessage({ ok: false, texte: resultat.message });
      return;
    }
    setValeur('');
    setConfirmation('');
    setOuvert(false);
    setMessage({ ok: true, texte: 'Mot de passe changé. Il prend effet immédiatement.' });
  }

  return (
    <Section titre="Mon mot de passe" icone="shield-check">
      <p className="font-body text-sm text-muted-foreground mb-4">
        Le serveur applique ici sa politique complète — longueur minimale et refus des mots de
        passe figurant dans des fuites publiques. C’est le seul endroit du produit où GoTrue
        vérifie lui-même : la création d’un compte collecteur, elle, ne consulte aucune règle
        (défaut ouvert chez l’éditeur), et Kolek s’en charge à sa place.
      </p>

      {message && (
        <p
          role="alert"
          className={`text-sm font-body p-3 rounded-md mb-4 ${
            message.ok ? 'bg-positive-tint text-positive' : 'bg-negative-tint text-negative'
          }`}
        >
          {message.texte}
        </p>
      )}

      {!ouvert ? (
        <Bouton variante="contour" onClick={() => setOuvert(true)}>
          Changer mon mot de passe
        </Bouton>
      ) : (
        <div className="space-y-4 max-w-md">
          <Champ libelle="Nouveau mot de passe" type="password" valeur={valeur} onChange={setValeur} />
          <Champ
            libelle="Répéter le mot de passe"
            type="password"
            valeur={confirmation}
            onChange={setConfirmation}
          />
          {confirmation.length > 0 && !identiques && (
            <p className="font-body text-xs text-negative">Les deux saisies diffèrent.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Bouton onClick={enregistrer} disabled={envoi || !identiques}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </Bouton>
            <Bouton
              variante="contour"
              onClick={() => {
                setOuvert(false);
                setValeur('');
                setConfirmation('');
              }}
            >
              Annuler
            </Bouton>
          </div>
        </div>
      )}
    </Section>
  );
}

/* ------------------------------- API ------------------------------------- */

function SectionApi({ environnement }: { environnement: ReturnType<typeof lireEnvironnement> }) {
  const [cleVisible, setCleVisible] = useState(false);

  return (
    <Section titre="API & intégration" icone="settings">
      <dl className="text-sm font-body space-y-2 mb-4">
        <LigneReglage terme="URL du projet" valeur={environnement.url} mono />
        <LigneReglage terme="Référence" valeur={environnement.projet} mono />
        <LigneReglage terme="API de données" valeur={`${environnement.url}/rest/v1`} mono />
        <LigneReglage terme="Authentification" valeur={`${environnement.url}/auth/v1`} mono />
        <LigneReglage terme="Fonctions" valeur={`${environnement.url}/functions/v1`} mono />
      </dl>

      <div className="border-t border-hairline pt-4 mb-4">
        <p className="font-body text-sm font-semibold text-ink mb-1">Clé anonyme</p>
        <p className="font-body text-xs text-muted-foreground mb-2">
          Publique par construction : elle voyage déjà dans le JavaScript de chaque application.
          Elle n’ouvre rien par elle-même — mesuré, les neuf tables lui répondent
          <em> permission denied</em>. C’est la RLS qui protège, pas le secret de cette clé.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-xs bg-canvas border border-hairline rounded-md px-3 py-2 break-all flex-1 min-w-0">
            {cleVisible ? environnement.cleAnon : masquer(environnement.cleAnon)}
          </code>
          <Bouton variante="contour" onClick={() => setCleVisible((v) => !v)}>
            {cleVisible ? 'Masquer' : 'Afficher'}
          </Bouton>
          <Bouton
            variante="contour"
            onClick={() => void navigator.clipboard?.writeText(environnement.cleAnon)}
          >
            Copier
          </Bouton>
        </div>
      </div>

      {/* La section que tout le monde cherche, et qui n'existera pas. */}
      <div className="border border-negative rounded-md p-4 mb-4">
        <div className="flex items-start gap-2 mb-2">
          <Icone nom="alert-circle" taille={18} className="text-negative mt-0.5 shrink-0" />
          <p className="font-body text-sm font-semibold text-ink">
            La clé de service n’est pas affichable ici, et ne le sera pas
          </p>
        </div>
        <p className="font-body text-xs text-muted-foreground">
          Elle contourne la sécurité au niveau des lignes sur <strong>toutes</strong> les tables :
          celui qui la détient lit et écrit l’épargne de tous les clients de la plateforme. Un
          navigateur qui la reçoit la garde en mémoire, l’expose à chaque extension installée et
          la laisse dans les journaux de tout mandataire traversé. Elle ne vit que dans les
          variables d’environnement des Edge Functions, côté serveur. Pour la lire ou la
          renouveler : tableau de bord Supabase, Project Settings → API.
        </p>
      </div>

      <p className="font-body text-sm font-semibold text-ink mb-2">Fonctions serveur</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-body min-w-[520px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
              <th className="pb-2 font-semibold">Point d’entrée</th>
              <th className="pb-2 font-semibold w-16">Méthode</th>
              <th className="pb-2 font-semibold">Rôle</th>
            </tr>
          </thead>
          <tbody>
            {environnement.fonctions.map((f) => (
              <tr key={f.nom} className="border-t border-hairline">
                <td className="py-2 font-mono text-xs text-ink">{f.nom}</td>
                <td className="py-2 text-xs text-muted-foreground">{f.methode}</td>
                <td className="py-2 text-xs text-muted-foreground">{f.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-body text-xs text-muted-foreground mt-3">
        Les cinq fonctions d’administration vérifient <code>est_admin()</code> sous l’identité de
        l’appelant avant toute écriture. Un jeton anonyme reçoit <code>403</code>, un appel sans
        jeton <code>401</code>, et une origine étrangère n’obtient aucun en-tête CORS.
      </p>
    </Section>
  );
}

/* --------------------------- Authentification ---------------------------- */

function SectionAuth({ auth, erreur }: { auth: EtatAuth | null; erreur: string | null }) {
  return (
    <Section titre="Authentification" icone="shield-check">
      <p className="font-body text-xs text-muted-foreground mb-3">
        Mesuré à l’instant sur <code>/auth/v1/settings</code> — ce que le serveur répond, pas ce
        que le dépôt espère.
      </p>

      {erreur && <p className="font-body text-sm text-negative mb-3">{erreur}</p>}
      {!auth && !erreur && <p className="font-body text-sm text-muted-foreground">Mesure…</p>}

      {auth && (
        <>
          <dl className="text-sm font-body space-y-2">
            <LigneEtat
              terme="Inscription publique"
              actif={!auth.inscriptionOuverte}
              vrai="Fermée"
              faux="OUVERTE"
              note="Les comptes sont créés par GTCS. Une inscription ouverte laisserait n’importe qui entrer."
            />
            <LigneEtat
              terme="Comptes anonymes"
              actif={!auth.comptesAnonymes}
              vrai="Désactivés"
              faux="ACTIFS"
            />
            <LigneEtat terme="Passkeys" actif={!auth.passkeys} vrai="Désactivés" faux="Actifs" />
            <LigneEtat terme="SAML" actif={!auth.saml} vrai="Désactivé" faux="Actif" />
            <LigneReglage
              terme="Fournisseurs actifs"
              valeur={auth.fournisseurs.length > 0 ? auth.fournisseurs.join(', ') : 'aucun'}
            />
            <LigneReglage
              terme="Confirmation par courriel"
              valeur={auth.confirmationAutomatique ? 'automatique' : 'exigée'}
            />
          </dl>

          <p className="font-body text-xs text-muted-foreground mt-4 pt-4 border-t border-hairline">
            <strong className="text-ink">Ce qui ne peut pas être affiché ici :</strong> la longueur
            minimale de mot de passe et le filtre des fuites connues. GoTrue ne les publie pas, et
            c’est le bon comportement — un serveur qui annoncerait son seuil renseignerait un
            attaquant. Les lire ou les changer : tableau de bord Supabase, Authentication →
            Policies.
          </p>
        </>
      )}
    </Section>
  );
}

/* --------------------------- Administrateurs ----------------------------- */

function SectionAdministrateurs({ etat }: { etat: EtatPlateforme | null }) {
  return (
    <Section titre="Administrateurs" icone="user-check">
      <p className="font-body text-xs text-muted-foreground mb-3">
        La table <code>admins</code> est la seule source de ce droit. Un compte qui y figure lit
        toute la plateforme.
      </p>

      {!etat ? (
        <p className="font-body text-sm text-muted-foreground">Lecture…</p>
      ) : (
        <>
          <ul className="space-y-2">
            {etat.administrateurs.map((a) => (
              <li
                key={a.user_id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-2 last:border-0"
              >
                <span className="font-body text-sm font-medium text-ink">
                  {a.nom}
                  {a.user_id === etat.appelant && (
                    <span className="ml-2 px-2 py-0.5 rounded-pill text-xs bg-positive-tint text-positive">
                      c’est toi
                    </span>
                  )}
                </span>
                <span className="font-body text-xs text-muted-foreground">
                  {a.telephone ?? '—'} · depuis le{' '}
                  {new Date(a.ajoute_le).toLocaleDateString('fr-FR')}
                </span>
              </li>
            ))}
          </ul>

          <p className="font-body text-xs text-muted-foreground mt-4">
            L’ajout et le retrait d’un administrateur ne se font pas depuis cet écran : ce droit
            n’a pas à tenir en un clic, et la table n’est ouverte qu’à la clé de service. Passer
            par le tableau de bord Supabase, table <code>admins</code>.
          </p>
        </>
      )}
    </Section>
  );
}

/* ------------------------------ Journal ---------------------------------- */

function SectionJournal({ etat }: { etat: EtatPlateforme | null }) {
  if (!etat) return null;

  return (
    <Section titre="Journal d’audit" icone="history">
      <p className="font-body text-xs text-muted-foreground mb-3">
        Lu dans <code>pg_trigger</code> : c’est la configuration en vigueur, pas une liste écrite
        à la main qui deviendrait fausse à la première migration. Le journal est en écriture
        seule — un déclencheur refuse toute modification, y compris par la clé de service.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {etat.journal.tables.map((t) => (
          <span
            key={t}
            className="px-2.5 py-1 rounded-pill text-xs font-body font-medium bg-positive-tint text-positive"
          >
            {t}
          </span>
        ))}
      </div>

      <dl className="text-sm font-body space-y-2">
        <LigneReglage terme="Lignes de journal" valeur={String(etat.volumes.audit_log ?? 0)} />
        <LigneReglage
          terme="Dernière écriture"
          valeur={
            etat.journal.derniere_ecriture
              ? new Date(etat.journal.derniere_ecriture).toLocaleString('fr-FR')
              : 'aucune'
          }
        />
      </dl>
    </Section>
  );
}

/* ------------------------------ Volumes ---------------------------------- */

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

function SectionVolumes({ etat }: { etat: EtatPlateforme | null }) {
  if (!etat) return null;

  return (
    <Section titre="Volumes de la base" icone="bar-chart-2">
      <p className="font-body text-xs text-muted-foreground mb-3">
        Comptes exacts, pas les estimations du planificateur : sur des tables de cette taille,
        l’estimation peut être fausse de moitié.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Object.entries(etat.volumes).map(([cle, valeur]) => (
          <div key={cle} className="bg-canvas rounded-md p-3">
            <p className="font-headings font-bold text-xl text-ink tabular-nums">{valeur}</p>
            <p className="font-body text-xs text-muted-foreground">{LIBELLES_VOLUMES[cle] ?? cle}</p>
          </div>
        ))}
      </div>
      {(etat.volumes.rejets_non_traites ?? 0) > 0 && (
        <p className="font-body text-sm text-negative mt-3">
          Des mises ont été refusées à la synchronisation et attendent un arbitrage humain.
          L’argent a changé de main dans le monde réel : ces lignes ne doivent pas rester en
          attente.
        </p>
      )}
    </Section>
  );
}

/* ------------------------------ Tarifs ----------------------------------- */

function SectionTarifs() {
  return (
    <Section titre="Grille tarifaire" icone="credit-card">
      <p className="font-body text-xs text-muted-foreground mb-3">
        Lecture seule. La grille vit dans <code>packages/core</code> et alimente à la fois les
        écrans, le calcul du revenu récurrent et la validation côté serveur — une seule source,
        pour que changer un prix ne demande pas de le changer trois fois.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-body min-w-[380px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
              <th className="pb-2 font-semibold">Palier</th>
              <th className="pb-2 font-semibold text-right">Prix / mois</th>
              <th className="pb-2 font-semibold text-right">Limite clients</th>
            </tr>
          </thead>
          <tbody>
            {PALIERS.map((p) => (
              <tr key={p.cle} className="border-t border-hairline">
                <td className="py-2 text-ink font-medium">{p.nom}</td>
                <td className="py-2 text-right tabular-nums text-ink">
                  {p.prix === 0 ? 'Gratuit' : `${formatMontant(p.prix)} FCFA`}
                </td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {p.limiteClients === null ? 'illimité' : p.limiteClients}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* --------------------------- Application --------------------------------- */

function SectionApplication({ etat, projet }: { etat: EtatPlateforme | null; projet: string }) {
  return (
    <Section titre="Application" icone="info">
      <dl className="text-sm font-body space-y-2">
        <LigneReglage terme="Projet Supabase" valeur={projet} mono />
        <LigneReglage terme="PostgreSQL" valeur={etat?.postgres ?? '—'} />
        <LigneReglage
          terme="État lu le"
          valeur={etat ? new Date(etat.genereLe).toLocaleString('fr-FR') : '—'}
        />
        <LigneReglage terme="Réseau" valeur={navigator.onLine ? 'connecté' : 'hors ligne'} />
      </dl>
    </Section>
  );
}

/* ------------------------------ Briques ---------------------------------- */

function Section({
  titre,
  icone,
  children,
}: {
  titre: string;
  icone: 'shield-check' | 'settings' | 'user-check' | 'history' | 'bar-chart-2' | 'credit-card' | 'info';
  children: React.ReactNode;
}) {
  return (
    <Carte className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icone nom={icone} taille={20} className="text-primary" />
        <h2 className="font-headings font-bold text-xl text-ink">{titre}</h2>
      </div>
      {children}
    </Carte>
  );
}

function LigneReglage({ terme, valeur, mono }: { terme: string; valeur: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground shrink-0">{terme}</dt>
      <dd className={`text-ink text-right break-all ${mono ? 'font-mono text-xs' : 'font-medium'}`}>
        {valeur}
      </dd>
    </div>
  );
}

/**
 * Une ligne d'état binaire, colorée selon ce qui est **souhaitable** et non
 * selon ce qui est vrai. Un réglage ouvert qu'on voudrait fermé doit sauter aux
 * yeux ; l'afficher en vert parce qu'il est « actif » inverserait le sens.
 */
function LigneEtat({
  terme,
  actif,
  vrai,
  faux,
  note,
}: {
  terme: string;
  actif: boolean;
  vrai: string;
  faux: string;
  note?: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap justify-between gap-2">
        <dt className="text-muted-foreground">{terme}</dt>
        <dd
          className={`font-medium ${actif ? 'text-positive' : 'text-negative'}`}
        >
          {actif ? vrai : faux}
        </dd>
      </div>
      {!actif && note && <p className="font-body text-xs text-negative mt-0.5">{note}</p>}
    </div>
  );
}
