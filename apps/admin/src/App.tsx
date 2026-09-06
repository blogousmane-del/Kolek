import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { Connexion } from './Connexion';
import { Coquille } from './Coquille';
import type { VueGlobale } from './donnees';
import { Portillon } from './Portillon';
import { supabase } from './supabase';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [pret, setPret] = useState(false);
  /** Les chiffres de démonstration, une fois le module chargé. `null` tant que
      personne n'a cliqué — c'est-à-dire presque toujours. */
  const [vueDemo, setVueDemo] = useState<VueGlobale | null>(null);
  const [chargementDemo, setChargementDemo] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setPret(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  /** La démonstration ne laisse aucune trace : ni `localStorage`, ni
      `sessionStorage`, ni paramètre d'adresse. Elle vit dans cet état React et
      meurt avec l'onglet. C'est ce qui garantit qu'elle ne peut pas se rallumer
      derrière une session — voir la note de `useVueGlobale`. */
  async function activerDemo() {
    setChargementDemo(true);
    try {
      const { VUE_DEMO } = await import('./demo');
      setVueDemo(VUE_DEMO);
    } finally {
      setChargementDemo(false);
    }
  }

  if (!pret) return null;

  // L'ordre n'est pas négociable : **la session d'abord**. Une démonstration qui
  // passe devant une session authentifiée n'est plus une démonstration, c'est un
  // contournement — elle rendrait la console à qui n'a pas franchi le portillon,
  // et verserait des chiffres fictifs à qui l'a franchi.
  if (session) {
    // Une session valide ouvre le portillon, pas le dashboard : la clé est
    // remontée pour que le contrôle soit refait si l'utilisateur change.
    return <Portillon key={session.user.id} />;
  }

  // Sans session, et seulement là, la vitrine. `estSuper` reste faux : la console
  // de plateforme n'a rien à montrer à un visiteur, et `Coquille` documente
  // pourquoi on n'apprend pas à quelqu'un qu'il existe un niveau au-dessus.
  if (vueDemo) {
    return <Coquille estSuper={false} vueDemo={vueDemo} onQuitterDemo={() => setVueDemo(null)} />;
  }

  return <Connexion onActiverDemo={activerDemo} demoEnCoursDeChargement={chargementDemo} />;
}
