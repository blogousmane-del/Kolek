import { Bouton, EcranMessage } from '@kolek/ui';
import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { viderCache } from './cache';
import { Connexion } from './Connexion';
import { Coquille } from './Coquille';
import { MotDePasseOublie } from './ecrans/MotDePasseOublie';
import { NouveauMotDePasse } from './ecrans/NouveauMotDePasse';
import { supabase } from './supabase';

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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [pret, setPret] = useState(false);
  const [compte, setCompte] = useState<Compte>('inconnu');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
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
      }
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let vivant = true;

    // La politique RLS borne déjà cette lecture à sa propre ligne : le compte
    // demande « ma fiche », et reçoit soit sa fiche, soit rien. Une absence est
    // donc une absence, pas un refus.
    void supabase
      .from('collecteurs')
      .select('id')
      .maybeSingle()
      .then(({ data }) => {
        if (vivant) setCompte(data ? 'collecteur' : 'orphelin');
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

  if (!session) return <Connexion />;

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

  // `inconnu` : la fiche est en cours de lecture. On montre la coquille plutôt
  // qu'un écran d'attente — elle a ses propres états de chargement, et un
  // clignotement supplémentaire à chaque ouverture coûterait plus que la
  // fraction de seconde qu'il couvre.
  return <Coquille onDeconnexion={() => setSession(null)} />;
}
