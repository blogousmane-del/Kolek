import { Bouton, EcranConnexion } from '@kolek/ui';

import { supabase } from './supabase';

interface Props {
  onActiverDemo?: () => void;
}

export function Connexion({ onActiverDemo }: Props) {
  return (
    <div className="relative">
      <EcranConnexion
        titre="Kolek · Admin"
        sousTitre="Pilotage GTCS"
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
      {onActiverDemo && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            type="button"
            onClick={onActiverDemo}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-or text-dark-canvas font-body font-semibold text-sm shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer border border-or/30"
          >
            <span>✨ Voir l’Admin Dashboard (Mode Démo)</span>
          </button>
        </div>
      )}
    </div>
  );
}
