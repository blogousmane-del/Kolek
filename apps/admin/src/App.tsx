import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Connexion } from './Connexion';
import { Coquille } from './Coquille';
import { Portillon } from './Portillon';
import { supabase } from './supabase';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [pret, setPret] = useState(false);
  const [modeDemo, setModeDemo] = useState<boolean>(() => {
    return typeof localStorage !== 'undefined' && localStorage.getItem('kolek_admin_demo') === 'true';
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setPret(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const activerDemo = () => {
    localStorage.setItem('kolek_admin_demo', 'true');
    setModeDemo(true);
  };

  const quitterDemo = () => {
    localStorage.removeItem('kolek_admin_demo');
    setModeDemo(false);
  };

  if (modeDemo) {
    return <Coquille estSuper={true} modeDemoActive={true} onQuitterDemo={quitterDemo} />;
  }

  if (!pret) return null;
  if (!session) return <Connexion onActiverDemo={activerDemo} />;

  // Une session valide ouvre le portillon, pas le dashboard : la clé est
  // remontée pour que le contrôle soit refait si l'utilisateur change.
  return <Portillon key={session.user.id} onActiverDemo={activerDemo} />;
}
