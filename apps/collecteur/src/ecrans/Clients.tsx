import { formatMontant, MISES_PAR_CYCLE } from '@kolek/core';
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

import { supabase } from '../supabase';

interface Client {
  id: string;
  nom: string;
  marche: string | null;
}

interface CarteClient {
  client_id: string;
  mise: number;
  statut: 'active' | 'cloturee';
  mises_encaissees: number;
}

interface Ligne {
  id: string;
  nom: string;
  marche: string | null;
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
export function Clients({ onDeconnexion }: { onDeconnexion: () => void }) {
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
          supabase.from('clients').select('id, nom, marche').order('nom'),
          supabase.from('cartes').select('client_id, mise, statut, mises_encaissees'),
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
            ...c,
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
  }, []);

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

  return (
    <div className="flex-1 flex flex-col">
      {/* En-tête sombre */}
      <div className="bg-sidebar px-5 pt-12 pb-5">
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
        <div className="text-center flex-1">
          <p className="text-xs text-muted-foreground font-body">Clients</p>
          <p className="font-headings font-bold text-xl text-ink tabular-nums">
            {lignes?.length ?? '—'}
          </p>
        </div>
        <div className="w-px h-8 bg-hairline" />
        <div className="text-center flex-1">
          <p className="text-xs text-muted-foreground font-body">Cartes actives</p>
          <p className="font-headings font-bold text-xl text-ink tabular-nums">
            {lignes ? cartesActives : '—'}
          </p>
        </div>
        <div className="w-px h-8 bg-hairline" />
        <div className="text-center flex-1">
          <p className="text-xs text-muted-foreground font-body">Cycles complets</p>
          <p className="font-headings font-bold text-xl text-ink tabular-nums">
            {lignes ? cyclesComplets : '—'}
          </p>
        </div>
      </div>

      {/* Recherche */}
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
        <button
          type="button"
          aria-label="Filtrer"
          className="w-10 h-10 bg-surface border border-hairline rounded-md flex items-center justify-center cursor-pointer"
        >
          <Icone nom="sliders-horizontal" taille={16} className="text-ink" />
        </button>
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
      <div className="px-4 mt-4 flex flex-col gap-3">
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

        {visibles.map((ligne) => (
          <LigneClient key={ligne.id} ligne={ligne} />
        ))}
      </div>

      <div className="flex-1 min-h-4" />
    </div>
  );
}

function LigneClient({ ligne }: { ligne: Ligne }) {
  const carte = ligne.carte;
  const encaissees = carte?.mises_encaissees ?? 0;
  const avancement = Math.round((encaissees / MISES_PAR_CYCLE) * 100);

  // « En retard » exige la date de la dernière mise, que J2a apportera. Tant
  // qu'on ne l'a pas, le badge dit ce qui est établi : la carte existe et
  // tourne, ou elle est close, ou il n'y en a pas.
  const statut: Statut | null =
    carte === null ? null : carte.statut === 'cloturee' ? 'Clôturée' : 'À jour';

  return (
    <div className="bg-surface rounded-lg border border-hairline p-4 flex items-center gap-3 shadow-sm">
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
      {statut ? (
        <BadgeStatut statut={statut} className="px-2.5 py-1 flex-shrink-0" />
      ) : (
        <span className="px-2.5 py-1 rounded-pill text-xs font-body font-semibold bg-muted text-muted-foreground flex-shrink-0">
          Sans carte
        </span>
      )}
    </div>
  );
}
