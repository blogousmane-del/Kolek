import { NavMobile, type CleNavCollecteur } from '@kolek/ui';
import { useEffect, useState } from 'react';

import { Accueil } from './ecrans/Accueil';
import { Clients } from './ecrans/Clients';
import { Encaisser } from './ecrans/Encaisser';
import { supabase } from './supabase';

/** La carte choisie pour l'encaissement, portée par la coquille : l'écran
    « Encaisser » a besoin de savoir sur quelle carte il écrit, et c'est la
    liste des clients qui le décide. */
export interface CarteChoisie {
  carteId: string;
  clientNom: string;
  mise: number;
  misesEncaissees: number;
}

export function Coquille({ onDeconnexion }: { onDeconnexion: () => void }) {
  // Départ sur « Clients » : c'est l'écran branché sur la base, et celui d'où
  // partent les deux gestes du métier — inscrire un client, encaisser sa mise.
  const [page, setPage] = useState<CleNavCollecteur>('clients');
  const [erreurSortie, setErreurSortie] = useState<string | null>(null);
  const [collecteurId, setCollecteurId] = useState<string | null>(null);
  const [carteChoisie, setCarteChoisie] = useState<CarteChoisie | null>(null);
  /** Incrémenté après chaque écriture : la liste des clients s'y abonne pour
      se relire. Sans ça, un client tout juste inscrit n'apparaît qu'au
      rechargement de la page. */
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    // `collecteur_id` doit accompagner chaque écriture : la politique RLS
    // l'exige au `with check`. On le lit une fois, à l'ouverture.
    void supabase.auth.getUser().then(({ data }) => setCollecteurId(data.user?.id ?? null));
  }, []);

  async function deconnecter() {
    setErreurSortie(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setErreurSortie('Déconnexion impossible. Vérifie le réseau et réessaie.');
      return;
    }
    onDeconnexion();
  }

  function encaisserSur(carte: CarteChoisie) {
    setCarteChoisie(carte);
    setPage('encaisser');
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
      {page === 'clients' && (
        <Clients
          collecteurId={collecteurId}
          revision={revision}
          onDeconnexion={deconnecter}
          onEncaisser={encaisserSur}
          onEcriture={() => setRevision((r) => r + 1)}
        />
      )}
      {page === 'encaisser' && (
        <Encaisser
          collecteurId={collecteurId}
          carte={carteChoisie}
          onNaviguer={setPage}
          onEncaisse={() => {
            setRevision((r) => r + 1);
            setCarteChoisie(null);
          }}
        />
      )}

      <NavMobile actif={page} onNaviguer={setPage} />
    </div>
  );
}
