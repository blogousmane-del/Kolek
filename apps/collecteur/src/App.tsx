import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Connexion } from './Connexion';
import { MesClients } from './MesClients';
import { supabase } from './supabase';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setPret(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!pret) return null;
  if (!session) return <Connexion />;
  return <MesClients onDeconnexion={() => setSession(null)} />;
}
