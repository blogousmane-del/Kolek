import { BandeauOffre, BarreLaterale, Icone, type CleNavAdmin } from '@kolek/ui';
import { useEffect, useState } from 'react';

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
  // La barre latérale fait 260 px de large et ne se replie pas : sous `lg`,
  // elle ne laissait pas de quoi lire une ligne de tableau. En dessous de ce
  // seuil elle devient un tiroir, fermé par défaut.
  const [menuOuvert, setMenuOuvert] = useState(false);

  // Échap ferme le tiroir. Sans ça, sur une tablette avec clavier, le seul
  // moyen de refermer est de viser la croix.
  useEffect(() => {
    if (!menuOuvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOuvert(false);
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [menuOuvert]);

  async function deconnecter() {
    setErreurSortie(null);
    const { error } = await supabase.auth.signOut();
    if (error) setErreurSortie('Déconnexion impossible. Vérifie le réseau et réessaie.');
  }

  /** Naviguer referme le tiroir : sur mobile il recouvre l'écran qu'on vient
      de demander, et le laisser ouvert donne l'impression que rien n'a bougé. */
  function naviguer(cle: CleNavAdmin) {
    setPage(cle);
    setMenuOuvert(false);
  }

  const actif = page === 'detail' ? 'collecteurs' : page;

  return (
    <div className="flex min-h-dvh bg-dark-canvas">
      {/* Le cadre flottant sur fond sombre est la signature de l'application
          d'administration — Design System §3.5, ombre `lg`. La marge se réduit
          sur téléphone : trois millimètres de fond sombre de chaque côté ne
          signent rien, ils prennent de la largeur au contenu. */}
      <div className="flex w-full m-1.5 sm:m-3 rounded-lg sm:rounded-xl overflow-hidden shadow-lg">
        <div className="hidden lg:flex">
          <BarreLaterale actif={actif} onNaviguer={naviguer} onDeconnexion={deconnecter} />
        </div>

        <div className="flex-1 min-w-0 bg-canvas flex flex-col">
          {/* En-tête de navigation, sous `lg` uniquement : c'est le seul accès
              au menu quand la barre latérale est repliée. */}
          <div className="lg:hidden flex items-center gap-2 px-2 py-2 bg-sidebar flex-shrink-0">
            <button
              type="button"
              onClick={() => setMenuOuvert(true)}
              aria-label="Ouvrir le menu"
              className="w-11 h-11 flex items-center justify-center rounded-md cursor-pointer"
            >
              <Icone nom="menu" className="text-white/70" />
            </button>
            <span className="font-headings font-bold text-surface text-lg tracking-tight">
              Kolek · Admin
            </span>
          </div>

          {/* La maquette omettait ce bandeau sur la fiche collecteur. L'état de
              l'abonnement ne dépend pas de la page où l'on se trouve. */}
          <BandeauOffre />

          {erreurSortie && (
            <p
              role="alert"
              className="bg-negative-tint text-negative text-sm font-body font-medium px-4 sm:px-8 py-2"
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

      {menuOuvert && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          {/* Un vrai bouton plutôt qu'un `div` cliquable : le voile est une
              commande de fermeture, et il doit se comporter comme telle au
              clavier comme pour un lecteur d'écran. */}
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setMenuOuvert(false)}
            className="absolute inset-0 bg-black/50 cursor-default"
          />
          <div className="relative z-50 h-dvh">
            <BarreLaterale
              actif={actif}
              onNaviguer={naviguer}
              onDeconnexion={deconnecter}
              onFermer={() => setMenuOuvert(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
