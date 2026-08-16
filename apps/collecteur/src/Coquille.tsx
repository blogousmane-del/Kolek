import { NavMobile, type CleNavCollecteur } from '@kolek/ui';
import { useState } from 'react';

import { Accueil } from './ecrans/Accueil';
import { Clients } from './ecrans/Clients';
import { Encaisser } from './ecrans/Encaisser';
import { supabase } from './supabase';

export function Coquille({ onDeconnexion }: { onDeconnexion: () => void }) {
  // Départ sur « Clients » et non sur « Accueil » : c'est le seul écran branché
  // sur la base. Un collecteur qui ouvre l'application voit ses vrais clients,
  // pas les chiffres de la maquette.
  const [page, setPage] = useState<CleNavCollecteur>('clients');
  const [erreurSortie, setErreurSortie] = useState<string | null>(null);

  async function deconnecter() {
    setErreurSortie(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setErreurSortie('Déconnexion impossible. Vérifie le réseau et réessaie.');
      return;
    }
    onDeconnexion();
  }

  return (
    // `max-w-mobile` ne change rien sur un téléphone — l'écran est plus étroit.
    // Il empêche seulement la maquette mobile de s'étirer sur toute la largeur
    // d'un écran de bureau, où l'application est ouverte pour la démonstration.
    <div className="min-h-dvh w-full max-w-mobile mx-auto bg-canvas flex flex-col">
      {erreurSortie && (
        <p
          role="alert"
          className="bg-negative-tint text-negative text-sm font-body font-medium px-4 py-2"
        >
          {erreurSortie}
        </p>
      )}

      {page === 'accueil' && <Accueil onNaviguer={setPage} onDeconnexion={deconnecter} />}
      {page === 'clients' && <Clients onDeconnexion={deconnecter} />}
      {page === 'encaisser' && <Encaisser onNaviguer={setPage} />}

      <NavMobile actif={page} onNaviguer={setPage} />
    </div>
  );
}
