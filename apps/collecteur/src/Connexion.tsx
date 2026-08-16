import { EcranConnexion } from '@kolek/ui';

import { supabase } from './supabase';

export function Connexion() {
  return (
    <EcranConnexion
      titre="Kolek"
      sousTitre="Chaque mise compte"
      onSoumettre={async (email, motDePasse) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: motDePasse,
        });
        if (!error) return null;
        return error.status === 400 || error.status === 401
          ? 'Identifiants incorrects.'
          : 'Connexion impossible. Vérifie le réseau et réessaie.';
      }}
    />
  );
}
