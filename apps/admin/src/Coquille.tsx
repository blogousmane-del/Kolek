import {
  BandeauOffre,
  BarreLaterale,
  Bouton,
  Icone,
  type CleNavAdmin,
  type CleNavSuper,
  type Espace,
} from '@kolek/ui';
import { useEffect, useState } from 'react';

import { Abonnements } from './ecrans/Abonnements';
import { Avis } from './ecrans/Avis';
import { Collecteurs } from './ecrans/Collecteurs';
import { DetailCollecteur } from './ecrans/DetailCollecteur';
import { EncaisserMise } from './ecrans/EncaisserMise';
import { EncoursSoldes } from './ecrans/EncoursSoldes';
import { Demandes } from './ecrans/Demandes';
import { Reglages } from './ecrans/Reglages';
import { SuperAdmin } from './ecrans/SuperAdmin';
import { TableauDeBord } from './ecrans/TableauDeBord';
import { useVueGlobale } from './donnees';
import { supabase } from './supabase';

/** Le détail d'un collecteur n'est pas une entrée de menu : on y arrive depuis
    la liste, et la barre latérale reste sur « Collecteurs ». */
type Page = CleNavAdmin | 'detail';

/** Le libellé de l'espace courant, pour l'en-tête mobile — la barre latérale y
    est repliée, et son sélecteur avec elle. */
const TITRE_ESPACE: Record<Espace, string> = {
  admin: 'Kolek · Admin',
  super: 'Kolek · Super Admin',
};

/**
 * La coquille tient **deux** consoles.
 *
 * `espace` dit laquelle : `admin` pilote la collecte d'une organisation,
 * `super` administre la plateforme. On passe de l'une à l'autre par le
 * sélecteur en haut de la barre latérale — l'encart « Kolek · Admin », dont le
 * chevron double n'ouvrait rien jusqu'au 2026-08-30.
 *
 * Chaque espace garde sa propre page courante. Revenir au Dashboard après un
 * détour par la plateforme retrouve l'écran qu'on y avait laissé ; sans ça, le
 * détour coûterait la navigation en plus du trajet.
 *
 * `estSuper` vient du portillon, qui a demandé `est_super_admin()` au serveur.
 * Il ne protège rien : les deux Edge Functions du Super Admin reposent la même
 * question sous l'identité de l'appelant, et la base ne croit que celle-là. Ici,
 * il décide de ce que le menu montre — inutile d'apprendre à un administrateur
 * métier qu'il existe un niveau au-dessus du sien.
 */
export function Coquille({ estSuper = false }: { estSuper?: boolean } = {}) {
  const [espace, setEspace] = useState<Espace>('admin');
  const [page, setPage] = useState<Page>('tableau');
  const [pageSuper, setPageSuper] = useState<CleNavSuper>('abonnements');
  const [erreurSortie, setErreurSortie] = useState<string | null>(null);
  /** Quel collecteur la fiche détaillée affiche. `null` avant tout clic. */
  const [collecteurOuvert, setCollecteurOuvert] = useState<string | null>(null);
  // La barre latérale fait 260 px de large et ne se replie pas : sous `lg`,
  // elle ne laissait pas de quoi lire une ligne de tableau. En dessous de ce
  // seuil elle devient un tiroir, fermé par défaut.
  const [menuOuvert, setMenuOuvert] = useState(false);

  // Un seul chargement pour les six écrans. Les découper en six appels
  // afficherait les mêmes totaux au prix de six allers-retours, et laisserait
  // deux écrans ouverts sur des instantanés différents — ce qu'un
  // administrateur lirait comme une incohérence de la base, pas de l'interface.
  const donnees = useVueGlobale();

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
      de demander, et le laisser ouvert donne l'impression que rien n'a bougé.

      Une seule barre latérale pour deux menus, donc une seule commande de
      navigation : `espace` décide laquelle des deux pages courantes elle
      déplace. Les deux jeux de clés se recouvrent sur `abonnements` — les
      paliers vendus aux collecteurs d'un côté, les abonnements des
      organisations de l'autre — et c'est ce test, pas la clé, qui les
      sépare. */
  function naviguer(cle: CleNavAdmin | CleNavSuper) {
    if (espace === 'super') setPageSuper(cle as CleNavSuper);
    else setPage(cle as CleNavAdmin);
    setMenuOuvert(false);
  }

  /** Changer d'espace referme le tiroir pour la même raison, et ne touche
      à aucune des deux pages courantes : chacune attend son retour. */
  function changerEspace(cible: Espace) {
    setEspace(cible);
    setMenuOuvert(false);
  }

  const actif = espace === 'super' ? pageSuper : page === 'detail' ? 'collecteurs' : page;

  return (
    <div className="flex min-h-dvh bg-dark-canvas">
      {/* Le cadre flottant sur fond sombre est la signature de l'application
          d'administration — Design System §3.5, ombre `lg`. La marge se réduit
          sur téléphone : trois millimètres de fond sombre de chaque côté ne
          signent rien, ils prennent de la largeur au contenu. */}
      <div className="flex w-full m-1.5 sm:m-3 rounded-lg sm:rounded-xl overflow-hidden shadow-lg">
        <div className="hidden lg:flex">
          <BarreLaterale
            espace={espace}
            actif={actif}
            onNaviguer={naviguer}
            onDeconnexion={deconnecter}
            estSuper={estSuper}
            onChangerEspace={changerEspace}
          />
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
              {TITRE_ESPACE[espace]}
            </span>
          </div>

          {/* La maquette omettait ce bandeau sur la fiche collecteur. L'état de
              l'abonnement ne dépend pas de la page où l'on se trouve.

              Il ne dépend en revanche que de l'espace : la console de plateforme
              n'est l'abonnée de personne, et y afficher une échéance de palier
              parlerait de l'organisation qu'on vient de quitter. */}
          {espace === 'admin' && <BandeauOffre />}

          {erreurSortie && (
            <p
              role="alert"
              className="bg-negative-tint text-negative text-sm font-body font-medium px-4 sm:px-8 py-2"
            >
              {erreurSortie}
            </p>
          )}

          {donnees.statut === 'chargement' && <EcranChargement />}

          {donnees.statut === 'erreur' && (
            <EcranErreur message={donnees.message} onReessayer={donnees.recharger} />
          )}

          {/* La console de plateforme a sa propre source — `super-admin-etat` —
              mais elle attend quand même la vue globale : la liste des
              collecteurs est ce dans quoi on choisit à qui appliquer une
              remise. Elle passe donc par le même chargement que le Dashboard,
              et par les mêmes deux états que la maquette n'avait pas à
              représenter. */}
          {donnees.statut === 'ok' && espace === 'super' && (
            <SuperAdmin vue={donnees.vue} onglet={pageSuper} />
          )}

          {donnees.statut === 'ok' && espace === 'admin' && (
            <>
              {page === 'tableau' && <TableauDeBord vue={donnees.vue} onNaviguer={setPage} />}
              {page === 'collecteurs' && (
                <Collecteurs
                  vue={donnees.vue}
                  onCollecteurCree={donnees.recharger}
                  onOuvrirCollecteur={(id) => {
                    setCollecteurOuvert(id);
                    setPage('detail');
                  }}
                />
              )}
              {page === 'detail' && (
                <DetailCollecteur
                  vue={donnees.vue}
                  collecteurId={collecteurOuvert}
                  onRetour={() => setPage('collecteurs')}
                  onModifie={donnees.recharger}
                  onSupprime={() => {
                    // Retour à la liste **et** rechargement : la fiche vient de
                    // disparaître, et rester dessus afficherait « Collecteur
                    // introuvable » à quelqu'un qui vient de réussir son geste.
                    setPage('collecteurs');
                    donnees.recharger();
                  }}
                />
              )}
              {page === 'encours' && <EncoursSoldes vue={donnees.vue} />}
              {page === 'encaisser' && <EncaisserMise />}
              {page === 'abonnements' && <Abonnements vue={donnees.vue} />}
              {page === 'demandes' && <Demandes />}
              {page === 'avis' && <Avis />}
              {page === 'reglages' && <Reglages />}
            </>
          )}
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
              espace={espace}
              actif={actif}
              onNaviguer={naviguer}
              onDeconnexion={deconnecter}
              onFermer={() => setMenuOuvert(false)}
              estSuper={estSuper}
              onChangerEspace={changerEspace}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Les deux états que la maquette n'avait pas à représenter, puisqu'elle ne
 * chargeait rien. Ils comptent autant que l'écran garni : une page vide sans
 * explication se lit comme une panne, et une panne muette se lit comme une page
 * vide.
 */
function EcranChargement() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <p className="font-body text-muted-foreground text-sm" role="status">
        Chargement des chiffres…
      </p>
    </div>
  );
}

function EcranErreur({ message, onReessayer }: { message: string; onReessayer: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="font-headings font-bold text-xl text-ink mb-2">Chiffres indisponibles</h2>
        <p role="alert" className="font-body text-muted-foreground text-sm mb-5">
          {message}
        </p>
        <Bouton onClick={onReessayer} icone="history">
          Réessayer
        </Bouton>
      </div>
    </div>
  );
}
