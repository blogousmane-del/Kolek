import { BandeauOffre, BarreLaterale, type CleNavAdmin } from '@kolek/ui';
import { useState } from 'react';

import { Abonnements } from './ecrans/Abonnements';
import { Collecteurs } from './ecrans/Collecteurs';
import { DetailCollecteur } from './ecrans/DetailCollecteur';
import { EncaisserMise } from './ecrans/EncaisserMise';
import { EncoursSoldes } from './ecrans/EncoursSoldes';
import { TableauDeBord } from './ecrans/TableauDeBord';
import { supabase } from './supabase';

/** Le détail d'un collecteur n'est pas une entrée de menu : on y arrive depuis
    la liste, et la barre latérale reste sur « Collecteurs ». */
type Page = CleNavAdmin | 'detail';

export function Coquille() {
  const [page, setPage] = useState<Page>('tableau');
  const [erreurSortie, setErreurSortie] = useState<string | null>(null);

  async function deconnecter() {
    setErreurSortie(null);
    const { error } = await supabase.auth.signOut();
    if (error) setErreurSortie('Déconnexion impossible. Vérifie le réseau et réessaie.');
  }

  return (
    <div className="flex min-h-dvh bg-dark-canvas">
      {/* Le cadre flottant sur fond sombre est la signature de l'application
          d'administration — Design System §3.5, ombre `lg`. */}
      <div className="flex w-full m-3 rounded-xl overflow-hidden shadow-lg">
        <BarreLaterale
          actif={page === 'detail' ? 'collecteurs' : page}
          onNaviguer={setPage}
          onDeconnexion={deconnecter}
        />

        <div className="flex-1 min-w-0 bg-canvas flex flex-col">
          {/* La maquette omettait ce bandeau sur la fiche collecteur. L'état de
              l'abonnement ne dépend pas de la page où l'on se trouve. */}
          <BandeauOffre />

          {erreurSortie && (
            <p
              role="alert"
              className="bg-negative-tint text-negative text-sm font-body font-medium px-8 py-2"
            >
              {erreurSortie}
            </p>
          )}

          {page === 'tableau' && <TableauDeBord />}
          {page === 'collecteurs' && <Collecteurs onOuvrirCollecteur={() => setPage('detail')} />}
          {page === 'detail' && <DetailCollecteur onRetour={() => setPage('collecteurs')} />}
          {page === 'encours' && <EncoursSoldes />}
          {page === 'encaisser' && <EncaisserMise />}
          {page === 'abonnements' && <Abonnements />}
        </div>
      </div>
    </div>
  );
}
