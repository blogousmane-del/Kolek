import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { viderCache } from './cache';
import { Connexion } from './Connexion';
import { Coquille } from './Coquille';
import { supabase } from './supabase';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [pret, setPret] = useState(false);

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
      if (evenement === 'SIGNED_OUT') viderCache();
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!pret) return null;
  if (!session) return <Connexion />;
  return <Coquille onDeconnexion={() => setSession(null)} />;
}
