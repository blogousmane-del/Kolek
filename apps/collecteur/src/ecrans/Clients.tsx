import { formatMontant, MISE_MAX, MISE_MIN, MISES_PAR_CYCLE, validerMise } from '@kolek/core';
import {
  Avatar,
  BadgeStatut,
  BandeauHorsLigne,
  Bouton,
  Carte,
  Icone,
  useEnLigne,
  type Statut,
} from '@kolek/ui';
import { useEffect, useMemo, useState } from 'react';

import type { CarteChoisie } from '../Coquille';
import { creerClientAvecCarte, definirConsentementAvis } from '../ecritures';
import { rangCascade, usePremierRendu } from '../premier-rendu';
import { supabase } from '../supabase';

interface Client {
  id: string;
  nom: string;
  marche: string | null;
  telephone: string | null;
  avis_actifs: boolean;
}

interface CarteClient {
  id: string;
  client_id: string;
  mise: number;
  statut: 'active' | 'cloturee';
  mises_encaissees: number;
}

interface Ligne {
  id: string;
  nom: string;
  marche: string | null;
  telephone: string | null;
  avisActifs: boolean;
  carte: CarteClient | null;
}

const FILTRES = ['Tous', 'Avec carte', 'Clôturées', 'Sans carte'] as const;
type Filtre = (typeof FILTRES)[number];

/**
 * La maquette proposait « À jour / En retard / Non visités ». Ces trois
 * réponses supposent la date de la dernière mise, que J2a introduit. Les
 * filtres ci-dessus disent ce que la base sait aujourd'hui : proposer un
 * bouton « En retard » qui ne filtre rien serait pire que ne pas le proposer.
 */
export function Clients({
  collecteurId,
  revision,
  ouvrirFormulaire,
  onFormulaireVu,
  onDeconnexion,
  onEncaisser,
  onEcriture,
}: {
  collecteurId: string | null;
  revision: number;
  /** Posé par le bouton « Souscrire » de l'accueil. */
  ouvrirFormulaire: boolean;
  onFormulaireVu: () => void;
  onDeconnexion: () => void;
  onEncaisser: (carte: CarteChoisie) => void;
  onEcriture: () => void;
}) {
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);

  useEffect(() => {
    if (!ouvrirFormulaire) return;
    setFormulaireOuvert(true);
    // La demande est consommée tout de suite : sans ça, refermer le formulaire
    // puis revenir sur cet écran le rouvrirait tout seul.
    onFormulaireVu();
  }, [ouvrirFormulaire, onFormulaireVu]);
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('Tous');
  const enLigne = useEnLigne();

  useEffect(() => {
    let vivant = true;

    // Deux requêtes plutôt qu'une imbrication : la clé étrangère de `cartes`
    // vers `clients` est composite `(client_id, collecteur_id)`, et faire
    // deviner ce chemin à PostgREST est une dépendance fragile pour un gain
    // d'un aller-retour sur une vingtaine de lignes.
    //
    // Le `try` n'est pas décoratif : le constructeur de requête de supabase-js
    // est un « thenable », pas une Promise — il n'a pas de `.catch()`. Sans
    // cette enveloppe, un rejet laisse l'écran figé sur « Chargement… ».
    void (async () => {
      try {
        const [reponseClients, reponseCartes] = await Promise.all([
          supabase
            .from('clients')
            .select('id, nom, marche, telephone, avis_actifs')
            .order('nom'),
          supabase.from('cartes').select('id, client_id, mise, statut, mises_encaissees'),
        ]);

        if (!vivant) return;

        if (reponseClients.error || reponseCartes.error) {
          setErreur('Impossible de charger tes clients.');
          setLignes([]);
          return;
        }

        const parClient = new Map<string, CarteClient>();
        for (const carte of (reponseCartes.data ?? []) as CarteClient[]) {
          // Une seule carte active par client est garantie en base ; si une
          // carte clôturée traîne à côté, l'active gagne l'affichage.
          const existante = parClient.get(carte.client_id);
          if (!existante || carte.statut === 'active') parClient.set(carte.client_id, carte);
        }

        setLignes(
          ((reponseClients.data ?? []) as Client[]).map((c) => ({
            id: c.id,
            nom: c.nom,
            marche: c.marche,
            telephone: c.telephone,
            avisActifs: c.avis_actifs,
            carte: parClient.get(c.id) ?? null,
          })),
        );
      } catch {
        if (!vivant) return;
        setErreur('Impossible de charger tes clients.');
        setLignes([]);
      }
    })();

    return () => {
      vivant = false;
    };
    // `revision` change après chaque écriture : la liste se relit d'elle-même
    // plutôt que d'attendre un rechargement de page.
  }, [revision]);

  const visibles = useMemo(() => {
    if (!lignes) return [];
    const terme = recherche.trim().toLowerCase();
    return lignes.filter((l) => {
      if (terme && !l.nom.toLowerCase().includes(terme)) return false;
      if (filtre === 'Avec carte') return l.carte?.statut === 'active';
      if (filtre === 'Clôturées') return l.carte?.statut === 'cloturee';
      if (filtre === 'Sans carte') return l.carte === null;
      return true;
    });
  }, [lignes, recherche, filtre]);

  const cartesActives = lignes?.filter((l) => l.carte?.statut === 'active').length ?? 0;
  const cyclesComplets =
    lignes?.filter((l) => (l.carte?.mises_encaissees ?? 0) >= MISES_PAR_CYCLE).length ?? 0;
  // Voir `Recus` : l'escalier ne rejoue pas quand la liste se relit — et
  // cette liste-ci se relit après chaque inscription et chaque encaissement.
  const premier = usePremierRendu();

  return (
    <div className="anim-entree flex-1 flex flex-col lg:mx-auto lg:w-full lg:max-w-large">
      {/* En-tête sombre */}
      <div className="bg-sidebar px-marge pt-entete pb-5 lg:rounded-2xl lg:pt-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-white/60 text-sm font-body">Bonjour,</p>
            <p className="text-white font-headings font-bold text-2xl">Mes clients</p>
          </div>
          <button
            type="button"
            onClick={onDeconnexion}
            aria-label="Se déconnecter"
            className="w-9 h-9 rounded-pill bg-white/10 flex items-center justify-center cursor-pointer"
          >
            <Icone nom="log-out" className="text-white" />
          </button>
        </div>
        {!enLigne && <BandeauHorsLigne className="mb-1" />}
      </div>

      {/* Résumé — trois nombres que la base sait vraiment donner. */}
      <div className="mx-4 -mt-4 bg-surface rounded-xl border border-hairline p-4 flex items-center justify-between shadow-md">
        <div className="text-center flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-body">Clients</p>
          <p className="font-headings font-bold text-xl text-ink tabular-nums">
            {lignes?.length ?? '—'}
          </p>
        </div>
        <div className="w-px h-8 bg-hairline" />
        <div className="text-center flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-body">Cartes actives</p>
          <p className="font-headings font-bold text-xl text-ink tabular-nums">
            {lignes ? cartesActives : '—'}
          </p>
        </div>
        <div className="w-px h-8 bg-hairline" />
        <div className="text-center flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-body">Cycles complets</p>
          <p className="font-headings font-bold text-xl text-ink tabular-nums">
            {lignes ? cyclesComplets : '—'}
          </p>
        </div>
      </div>

      {/* Recherche */}
      {/* Le bouton « Filtrer » de la maquette a été retiré : il n'ouvrait rien, et
          les pastilles juste en dessous font déjà ce filtrage. Deux commandes pour
          un même geste, dont une inerte, valent moins qu'une seule qui marche. */}
      <div className="px-4 mt-5 flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-surface border border-hairline rounded-md px-3 py-2.5 focus-within:border-primary">
          <Icone nom="search" taille={15} className="text-muted-foreground" />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un client…"
            aria-label="Rechercher un client"
            className="flex-1 min-w-0 bg-transparent text-base font-body text-ink outline-none placeholder:text-muted-foreground"
          />
        </div>

      </div>

      {/* Inscrire un client */}
      <div className="px-4 mt-3">
        {formulaireOuvert ? (
          <FormulaireClient
            collecteurId={collecteurId}
            onAnnuler={() => setFormulaireOuvert(false)}
            onCree={() => {
              setFormulaireOuvert(false);
              onEcriture();
            }}
          />
        ) : (
          <Bouton
            icone="plus"
            pleineLargeur
            disabled={collecteurId === null}
            title={collecteurId === null ? 'Session en cours de lecture…' : undefined}
            onClick={() => setFormulaireOuvert(true)}
          >
            Inscrire un client
          </Bouton>
        )}
      </div>

      {/* Filtres */}
      <div className="px-4 mt-3 flex gap-2 overflow-x-auto">
        {FILTRES.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltre(f)}
            className={`px-3 py-1.5 rounded-pill text-sm font-body font-medium border whitespace-nowrap cursor-pointer ${
              f === filtre
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface text-ink border-hairline'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Liste */}
      {/* Deux colonnes sur bureau : c’est la liste la plus longue du produit,
          et une fiche de client tient dans la moitié de la largeur. */}
      <div className="px-4 mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
        {erreur && (
          <Carte className="p-4 border-negative">
            <p className="text-base font-body text-negative m-0">{erreur}</p>
            <Bouton
              variante="contour"
              className="mt-3"
              onClick={() => window.location.reload()}
            >
              Réessayer
            </Bouton>
          </Carte>
        )}

        {lignes === null && !erreur && (
          <p className="text-base font-body text-muted-foreground">Chargement…</p>
        )}

        {!erreur && lignes?.length === 0 && (
          <Carte className="p-4">
            <p className="text-base font-body text-ink m-0">Aucun client pour l’instant.</p>
            <p className="text-sm font-body text-muted-foreground mt-1">
              La souscription arrive au jalon J2.
            </p>
          </Carte>
        )}

        {!erreur && lignes !== null && lignes.length > 0 && visibles.length === 0 && (
          <Carte className="p-4">
            <p className="text-base font-body text-ink m-0">Aucun client ne correspond.</p>
            <p className="text-sm font-body text-muted-foreground mt-1">
              Change le filtre ou efface la recherche.
            </p>
          </Carte>
        )}

        {visibles.map((ligne, rang) => (
          <div
            key={ligne.id}
            className={premier ? 'anim-cascade' : undefined}
            style={rangCascade(rang, premier)}
          >
          <LigneClient
            ligne={ligne}
            onEncaisser={onEncaisser}
            onConsentementChange={onEcriture}
          />
          </div>
        ))}
      </div>

      <div className="flex-1 min-h-4" />
    </div>
  );
}

function LigneClient({
  ligne,
  onEncaisser,
  onConsentementChange,
}: {
  ligne: Ligne;
  onEncaisser: (carte: CarteChoisie) => void;
  onConsentementChange: () => void;
}) {
  const [demandeEnCours, setDemandeEnCours] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreurAvis, setErreurAvis] = useState<string | null>(null);
  const carte = ligne.carte;
  const encaissees = carte?.mises_encaissees ?? 0;
  const avancement = Math.round((encaissees / MISES_PAR_CYCLE) * 100);

  // « En retard » exige la date de la dernière mise, que J2a apportera. Tant
  // qu'on ne l'a pas, le badge dit ce qui est établi : la carte existe et
  // tourne, ou elle est close, ou il n'y en a pas.
  const statut: Statut | null =
    carte === null ? null : carte.statut === 'cloturee' ? 'Clôturée' : 'À jour';

  // Une carte active est encaissable tant que le cycle n'est pas complet ;
  // au-delà, le déclencheur répondrait CYCLE_COMPLET. Autant ne pas proposer
  // un geste dont on sait qu'il sera refusé.
  const encaissable = carte !== null && carte.statut === 'active' && encaissees < MISES_PAR_CYCLE;

  async function poser(accepte: boolean) {
    setEnvoi(true);
    setErreurAvis(null);
    const resultat = await definirConsentementAvis(ligne.id, accepte);
    setEnvoi(false);
    setDemandeEnCours(false);
    if (!resultat.ok) {
      setErreurAvis(resultat.echec.message);
      return;
    }
    onConsentementChange();
  }

  return (
    <div className="bg-surface rounded-lg border border-hairline p-4 shadow-sm">
      <div className="flex items-center gap-3">
      <Avatar nom={ligne.nom} className="w-11 h-11 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-body font-semibold text-base text-ink truncate">{ligne.nom}</p>
        <p className="text-sm text-muted-foreground font-body truncate">
          {carte
            ? `Mise ${formatMontant(carte.mise)} FCFA · ${encaissees}/${MISES_PAR_CYCLE}`
            : (ligne.marche ?? 'Pas encore de carte')}
        </p>
        {carte && (
          <div className="w-full h-1 bg-muted rounded-pill mt-1.5 overflow-hidden">
            <div
              className="h-full bg-chart-mint rounded-pill"
              style={{ width: `${avancement}%` }}
            />
          </div>
        )}
      </div>
      {encaissable ? (
        <button
          type="button"
          onClick={() =>
            onEncaisser({
              carteId: carte.id,
              clientNom: ligne.nom,
              mise: carte.mise,
              misesEncaissees: encaissees,
            })
          }
          className="px-3 py-2 rounded-pill bg-primary text-primary-foreground text-sm font-body font-bold flex-shrink-0 cursor-pointer"
        >
          Encaisser
        </button>
      ) : statut ? (
        <BadgeStatut statut={statut} className="px-2.5 py-1 flex-shrink-0" />
      ) : (
        <span className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold bg-muted text-muted-foreground flex-shrink-0">
          Sans carte
        </span>
      )}
      </div>

      <BasculeAvis
        ligne={ligne}
        demandeEnCours={demandeEnCours}
        envoi={envoi}
        erreur={erreurAvis}
        onDemander={() => setDemandeEnCours(true)}
        onAnnuler={() => setDemandeEnCours(false)}
        onPoser={poser}
      />
    </div>
  );
}

/**
 * Le consentement du client aux avis, sur sa ligne.
 *
 * Trois principes, et chacun a coûté une décision.
 *
 * **Rien ne s'active d'un seul geste.** Le collecteur doit d'abord confirmer
 * que le client a accepté. Un interrupteur qui s'allume au premier appui
 * enverrait le solde d'épargne de quelqu'un sur un téléphone souvent partagé en
 * famille, sur la foi d'un doigt qui a glissé.
 *
 * **Le retrait, lui, est immédiat.** Un seul appui suffit à éteindre. Un
 * consentement qu'on ne peut retirer aussi vite qu'on l'a donné n'en est pas un.
 *
 * **Sans numéro, la commande est là mais inerte**, avec sa raison. La masquer
 * laisserait le collecteur chercher pourquoi ce client-là n'a pas l'option.
 */
function BasculeAvis({
  ligne,
  demandeEnCours,
  envoi,
  erreur,
  onDemander,
  onAnnuler,
  onPoser,
}: {
  ligne: Ligne;
  demandeEnCours: boolean;
  envoi: boolean;
  erreur: string | null;
  onDemander: () => void;
  onAnnuler: () => void;
  onPoser: (accepte: boolean) => void;
}) {
  const sansNumero = !ligne.telephone;

  if (demandeEnCours) {
    return (
      <div className="mt-3 pt-3 border-t border-hairline">
        <p className="text-sm font-body text-ink m-0">
          {ligne.nom} accepte-t-il de recevoir un message à chaque mouvement sur son{' '}
          {ligne.telephone} ?
        </p>
        <p className="text-xs font-body text-muted-foreground mt-1">
          Demande-lui avant de confirmer. Le message dira le montant versé et la somme à lui rendre.
        </p>
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            disabled={envoi}
            onClick={() => onPoser(true)}
            className="px-3 py-2 rounded-pill bg-primary text-primary-foreground text-sm font-body font-bold cursor-pointer disabled:opacity-50"
          >
            {envoi ? 'Enregistrement…' : 'Il a accepté'}
          </button>
          <button
            type="button"
            disabled={envoi}
            onClick={onAnnuler}
            className="px-3 py-2 rounded-pill border border-hairline text-ink text-sm font-body font-semibold cursor-pointer disabled:opacity-50"
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  // Deux rangées et non une. Le message d'erreur était le troisième enfant
  // d'un `flex justify-between` déjà rempli par le libellé et le bouton : sur
  // un téléphone, il n'avait nulle part où aller et se réduisait à rien. Une
  // erreur qu'on ne peut pas lire ne vaut pas mieux que pas d'erreur du tout —
  // c'est ce qui faisait passer un refus du serveur pour un bouton mort.
  return (
    <div className="mt-3 pt-3 border-t border-hairline">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 min-w-0">
          <Icone
            nom={ligne.avisActifs ? 'bell' : 'bell-off'}
            taille={15}
            className={ligne.avisActifs ? 'text-positive' : 'text-muted-foreground'}
          />
          <span className="text-xs font-body text-muted-foreground truncate">
            {sansNumero
              ? 'Pas de numéro : aucun avis possible'
              : ligne.avisActifs
                ? 'Prévenu à chaque mouvement'
                : 'Non prévenu'}
          </span>
        </span>
        <button
          type="button"
          disabled={sansNumero || envoi}
          aria-pressed={ligne.avisActifs}
          title={sansNumero ? 'Ce client n’a pas de numéro enregistré.' : undefined}
          onClick={() => (ligne.avisActifs ? onPoser(false) : onDemander())}
          // `anim-pression` et le libellé d'attente disent tous deux la même
          // chose : l'appui a été pris. Sans eux, entre le doigt et la réponse
          // du serveur, rien ne bougeait — et en 3G cette attente se compte en
          // secondes, pendant lesquelles le collecteur appuie à nouveau.
          className="anim-pression px-3 py-1.5 rounded-pill border border-hairline text-ink text-xs font-body font-semibold whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {envoi ? 'Enregistrement…' : ligne.avisActifs ? 'Ne plus prévenir' : 'Prévenir'}
        </button>
      </div>
      {erreur && (
        <p role="alert" className="text-xs font-body text-negative m-0 mt-2">
          {erreur}
        </p>
      )}
    </div>
  );
}

/** Paliers usuels du marché, tous compris dans [MISE_MIN, MISE_MAX]. */
const MISES_USUELLES = [500, 1000, 2000, 5000, 10000] as const;

/**
 * Inscrire un client, c'est aussi lui ouvrir sa première carte : un client sans
 * carte n'encaisse rien, et le collecteur au marché fait les deux gestes d'un
 * coup. Le formulaire demande donc la mise journalière avec le nom.
 *
 * Seul le nom est obligatoire. Le téléphone, le marché et l'activité sont
 * facultatifs en base, et les exiger ici ferait perdre du temps devant un
 * étal — la fiche se complète plus tard.
 */
function FormulaireClient({
  collecteurId,
  onAnnuler,
  onCree,
}: {
  collecteurId: string | null;
  onAnnuler: () => void;
  onCree: () => void;
}) {
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [marche, setMarche] = useState('');
  const [mise, setMise] = useState(1000);
  const [avisActifs, setAvisActifs] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const pret = nom.trim().length > 0 && validerMise(mise) && collecteurId !== null;

  async function enregistrer() {
    if (!pret || !collecteurId) return;
    setEnvoi(true);
    setErreur(null);

    const resultat = await creerClientAvecCarte(collecteurId, {
      nom,
      telephone,
      marche,
      mise,
      avisActifs,
    });

    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.echec.message);
      return;
    }
    onCree();
  }

  return (
    <Carte className="p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-headings font-bold text-lg text-ink m-0">Nouveau client</p>
        <button
          type="button"
          onClick={onAnnuler}
          aria-label="Fermer le formulaire"
          className="w-9 h-9 rounded-pill flex items-center justify-center cursor-pointer"
        >
          <Icone nom="x" taille={18} className="text-muted-foreground" />
        </button>
      </div>

      <label htmlFor="nouveau-nom" className="block text-sm font-body font-semibold text-ink mb-1">
        Nom
      </label>
      <input
        id="nouveau-nom"
        type="text"
        value={nom}
        maxLength={120}
        onChange={(e) => setNom(e.target.value)}
        placeholder="Nom du client"
        className="w-full bg-surface border border-hairline rounded-md px-3 py-2.5 text-base font-body text-ink outline-none focus:border-primary placeholder:text-muted-foreground mb-3"
      />

      <label htmlFor="nouveau-tel" className="block text-sm font-body font-semibold text-ink mb-1">
        Téléphone <span className="font-normal text-muted-foreground">(optionnel)</span>
      </label>
      <input
        id="nouveau-tel"
        type="tel"
        inputMode="tel"
        value={telephone}
        maxLength={32}
        onChange={(e) => setTelephone(e.target.value)}
        placeholder="+225…07 00 00 00"
        className="w-full bg-surface border border-hairline rounded-md px-3 py-2.5 text-base font-body text-ink outline-none focus:border-primary placeholder:text-muted-foreground mb-3"
      />

      <label
        htmlFor="nouveau-marche"
        className="block text-sm font-body font-semibold text-ink mb-1"
      >
        Marché <span className="font-normal text-muted-foreground">(optionnel)</span>
      </label>
      <input
        id="nouveau-marche"
        type="text"
        value={marche}
        maxLength={80}
        onChange={(e) => setMarche(e.target.value)}
        placeholder="Adjamé, Plateau…"
        className="w-full bg-surface border border-hairline rounded-md px-3 py-2.5 text-base font-body text-ink outline-none focus:border-primary placeholder:text-muted-foreground mb-3"
      />

      <p className="text-sm font-body font-semibold text-ink mb-2">Mise journalière</p>
      <div className="flex gap-2 flex-wrap mb-2">
        {MISES_USUELLES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMise(m)}
            className={`px-3 py-2 rounded-pill text-base font-body font-semibold border tabular-nums cursor-pointer ${
              m === mise
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface text-ink border-hairline'
            }`}
          >
            {formatMontant(m)}
          </button>
        ))}
      </div>
      {!validerMise(mise) && (
        <p className="text-sm font-body text-negative mb-2">
          La mise doit être comprise entre {formatMontant(MISE_MIN)} et {formatMontant(MISE_MAX)}{' '}
          FCFA.
        </p>
      )}

      {/* Le consentement se demande au moment où l'on prend le numéro, pas
          après : c'est le seul instant où le client est en face et où la
          question est naturelle. Sans numéro la case est inerte — cocher un
          accord pour un canal inexistant enverrait des avis dès qu'un numéro
          serait ajouté plus tard, sans que personne les ait acceptés. */}
      <label
        className={`flex items-start gap-3 rounded-md p-3 mb-3 border border-hairline ${
          telephone.trim() ? 'cursor-pointer' : 'opacity-50'
        }`}
      >
        <input
          type="checkbox"
          checked={avisActifs && telephone.trim().length > 0}
          disabled={!telephone.trim()}
          onChange={(e) => setAvisActifs(e.target.checked)}
          className="mt-0.5 w-4 h-4 shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-sm font-body font-semibold text-ink">
            Le prévenir par message à chaque mouvement
          </span>
          <span className="block text-xs font-body text-muted-foreground">
            {telephone.trim()
              ? 'À ne cocher que s’il a accepté. Le message dira le montant versé et la somme à lui rendre.'
              : 'Saisis un numéro pour pouvoir proposer cet avis.'}
          </span>
        </span>
      </label>

      {erreur && (
        <p role="alert" className="text-sm font-body text-negative mb-2">
          {erreur}
        </p>
      )}

      <Bouton pleineLargeur disabled={!pret || envoi} onClick={enregistrer}>
        {envoi ? 'Enregistrement…' : 'Inscrire et ouvrir la carte'}
      </Bouton>
    </Carte>
  );
}
