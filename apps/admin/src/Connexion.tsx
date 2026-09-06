import { EcranConnexion } from '@kolek/ui';

import { supabase } from './supabase';

interface Props {
  /** Absent = pas d'entrée de démonstration. L'écran ne la fabrique jamais
      lui-même : c'est `App` qui décide, et il ne la propose qu'en l'absence de
      session. */
  onActiverDemo?: () => void;
  demoEnCoursDeChargement?: boolean;
}

export function Connexion({ onActiverDemo, demoEnCoursDeChargement = false }: Props) {
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
      {/* Centré plutôt qu'en pastille flottante à droite : sur un écran de
          360 px, la pastille recouvrait le bouton « Se connecter ». Et sobre
          plutôt qu'or plein — ce n'est pas l'action principale de cet écran,
          c'est la porte de service pour qui n'a pas encore de compte. */}
      {onActiverDemo && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <button
            type="button"
            onClick={onActiverDemo}
            disabled={demoEnCoursDeChargement}
            className="rounded-pill border border-or/40 bg-dark-canvas/80 px-4 py-2.5 font-body text-sm font-semibold text-or backdrop-blur-sm transition-colors hover:bg-or/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-or disabled:opacity-60 cursor-pointer"
          >
            {demoEnCoursDeChargement
              ? 'Chargement de la démonstration…'
              : 'Découvrir le tableau de bord (démonstration)'}
          </button>
        </div>
      )}
    </div>
  );
}
