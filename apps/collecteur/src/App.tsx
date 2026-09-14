import { Bouton, EcranMessage } from '@kolek/ui';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';

import { viderCache } from './cache';
import { Connexion } from './Connexion';
import { Coquille } from './Coquille';
import { MotDePasseOublie } from './ecrans/MotDePasseOublie';
import { NouveauMotDePasse } from './ecrans/NouveauMotDePasse';
import { effacerTourneeDe } from './hors-ligne/moteur';
import { lireSessionGardee } from './session-gardee';
import { CLE_SESSION, supabase } from './supabase';

/**
 * L'état du compte une fois la session ouverte.
 *
 * `orphelin` est le cas ajouté le 2026-08-23 avec la connexion Google : une
 * session valide dont l'utilisateur n'a **aucune ligne dans `collecteurs`**.
 *
 * Ce cas ne devrait pas se produire — `disable_signup` est vrai sur le projet,
 * donc GoTrue refuse une adresse inconnue avant même d'ouvrir une session. Mais
 * ce réglage vit dans un tableau de bord, pas dans ce dépôt : il se décoche en
 * deux clics, sans que personne relise ce fichier. Et le jour où il se décoche,
 * la différence entre « l'application s'ouvre vide » et « l'application dit
 * pourquoi » est la différence entre un collecteur qui appelle GTCS et un
 * collecteur qui croit avoir perdu ses clients.
 */
type Compte = 'inconnu' | 'collecteur' | 'orphelin';

/** La session gardée, ou rien — y compris quand le navigateur refuse l'accès au stockage. */
function collecteurGarde(): string | null {
  try {
    return lireSessionGardee(localStorage, CLE_SESSION)?.userId ?? null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  /**
   * Le collecteur d'une session gardée sur le téléphone, quand le réseau manque
   * pour la renouveler. Voir `session-gardee.ts` : sans lui, un collecteur hors
   * ligne depuis plus d'une heure retombait sur l'écran de connexion.
   */
  const [collecteurHorsLigne, setCollecteurHorsLigne] = useState<string | null>(null);
  const [pret, setPret] = useState(false);
  const [compte, setCompte] = useState<Compte>('inconnu');

  const collecteurId = session?.user.id ?? collecteurHorsLigne;

  /** Le dernier collecteur ouvert : c'est sa tournée qu'une fin de session efface. */
  const dernier = useRef<string | null>(null);
  useEffect(() => {
    if (collecteurId) dernier.current = collecteurId;
  }, [collecteurId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      setSession(data.session);
      // Seul un échec **réseau** autorise la reprise. Une session que le
      // serveur a refusée est finie : le collecteur doit se reconnecter.
      if (!data.session && error && isAuthRetryableFetchError(error)) {
        setCollecteurHorsLigne(collecteurGarde());
      }
      setPret(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evenement, s) => {
      // Toute fin de session vide le cache de navigation, pas seulement le
      // bouton « Déconnexion ». Corrigé par l'audit du 2026-08-23 : la coquille
      // appelait bien `viderCache` sur une sortie explicite, mais un jeton
      // expiré — ou une session révoquée depuis un autre appareil — laissait en
      // mémoire les noms et les soldes des clients jusqu'au rechargement.
      // `SIGNED_OUT` couvre les trois cas d'un seul endroit.
      if (evenement === 'SIGNED_OUT') {
        viderCache();
        setCompte('inconnu');
        setCollecteurHorsLigne(null);
        // La tournée s'efface avec la session ; la file, jamais (spec J2b
        // §4.5) : elle attend que ce collecteur se reconnecte pour partir.
        if (dernier.current) void effacerTourneeDe(dernier.current);
      }
      // Une vraie session remplace toujours la session gardée.
      if (s) setCollecteurHorsLigne(null);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let vivant = true;

    // La politique RLS borne déjà cette lecture à sa propre ligne : le compte
    // demande « ma fiche », et reçoit soit sa fiche, soit rien.
    void supabase
      .from('collecteurs')
      .select('id')
      .maybeSingle()
      .then(({ data, error }) => {
        // Une lecture en échec ne dit rien du compte. La prendre pour une
        // absence affichait « Compte non rattaché » à un collecteur qui n'avait
        // perdu que le réseau (plan J2b, précision 2). Le compte reste
        // `inconnu`, et la coquille s'ouvre.
        if (!vivant || error) return;
        setCompte(data ? 'collecteur' : 'orphelin');
      });

    return () => {
      vivant = false;
    };
  }, [session]);

  if (!pret) return null;

  // Deux chemins traités **avant** la session, et l'ordre compte. Le lien
  // d'invitation ouvre une session en atterrissant : sans ce branchement,
  // l'application afficherait sa coquille et le prospect n'aurait jamais
  // l'écran où choisir son mot de passe.
  //
  // Le chemin est lu une fois, comme le fait `apps/site/src/App.tsx` : deux
  // destinations ne justifient pas une bibliothèque de routage, et on n'y passe
  // qu'une fois.
  const chemin = window.location.pathname.replace(/\/+$/, '');
  if (chemin === '/nouveau-mot-de-passe') return <NouveauMotDePasse />;
  if (chemin === '/mot-de-passe-oublie') return <MotDePasseOublie />;

  if (!collecteurId) return <Connexion />;

  if (compte === 'orphelin') {
    return (
      <EcranMessage
        titre="Compte non rattaché"
        message="Cette adresse n’est associée à aucun collecteur Kolek. C’est GTCS qui ouvre les comptes : contacte ton interlocuteur pour faire activer le tien."
      >
        <Bouton onClick={() => void supabase.auth.signOut()}>Se déconnecter</Bouton>
      </EcranMessage>
    );
  }

  // `inconnu` : la fiche est en cours de lecture, ou le réseau manque. On montre
  // la coquille plutôt qu'un écran d'attente — elle a ses propres états de
  // chargement, et hors ligne c'est la seule chose utile à montrer.
  //
  // `key` : deux collecteurs se relaient sur un même téléphone. Un changement
  // de compte remonte la coquille entière, sans rien garder du précédent.
  return (
    <Coquille
      key={collecteurId}
      collecteurId={collecteurId}
      onDeconnexion={() => {
        setSession(null);
        setCollecteurHorsLigne(null);
      }}
    />
  );
}
