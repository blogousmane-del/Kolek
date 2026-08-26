import { NavBureau, NavMobile, type CleNavCollecteur } from '@kolek/ui';
import { useEffect, useState } from 'react';

import { viderCache } from './cache';
import { Accueil } from './ecrans/Accueil';
import { Alertes } from './ecrans/Alertes';
import { Avis } from './ecrans/Avis';
import { Bilan } from './ecrans/Bilan';
import { Clients } from './ecrans/Clients';
import { Encaisser } from './ecrans/Encaisser';
import { Plus } from './ecrans/Plus';
import { Rapprochement } from './ecrans/Rapprochement';
import { Recus } from './ecrans/Recus';
import { Retrait } from './ecrans/Retrait';
import { supabase } from './supabase';

/**
 * Les écrans qui ne figurent pas dans la barre du bas.
 *
 * Type distinct de `CleNavCollecteur` : la barre ne montre que cinq onglets, et
 * y ajouter six clés de plus la rendrait illisible sur un téléphone. Ces écrans
 * s'atteignent par la grille d'actions de l'accueil, et en sortent par la flèche
 * de leur en-tête.
 */
type EcranSecondaire = 'retrait' | 'rapprochement' | 'recus' | 'alertes' | 'avis' | 'plus';

export type Page = CleNavCollecteur | EcranSecondaire;

/**
 * Le client sur lequel l'écran de retrait est réduit.
 *
 * Le nom voyage avec l'identifiant plutôt que d'être redéduit à l'arrivée :
 * l'écran le tirait des cartes qu'il venait de lire, donc un client qui n'en a
 * plus — juste après son dernier retrait — perdait son nom, et avec lui le
 * bandeau qui porte la sortie du filtre.
 */
export interface ClientCible {
  id: string;
  nom: string;
}

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
  const [page, setPage] = useState<Page>('clients');
  const [erreurSortie, setErreurSortie] = useState<string | null>(null);
  const [collecteurId, setCollecteurId] = useState<string | null>(null);
  const [nomCollecteur, setNomCollecteur] = useState<string | null>(null);
  /** Demande faite à l'écran des clients d'ouvrir le formulaire d'inscription.
      C'est le bouton « Souscrire » de l'accueil qui la pose. */
  const [souscrire, setSouscrire] = useState(false);
  const [carteChoisie, setCarteChoisie] = useState<CarteChoisie | null>(null);
  /** Le client sur lequel l'écran de retrait s'ouvre réduit. `null` = toutes les
      cartes. Porté ici et non dans l'écran : c'est la navigation qui le décide,
      et un état local se perdrait au premier aller-retour. */
  const [clientPourRetrait, setClientPourRetrait] = useState<ClientCible | null>(null);
  /** Le client dont la fiche s'ouvre à l'arrivée sur la liste. Posé par la
      commande « Fiche » de l'accueil, consommé par l'écran `Clients`. */
  const [clientPourFiche, setClientPourFiche] = useState<string | null>(null);
  /** Incrémenté après chaque écriture : la liste des clients s'y abonne pour
      se relire. Sans ça, un client tout juste inscrit n'apparaît qu'au
      rechargement de la page. */
  const [revision, setRevision] = useState(0);

  /**
   * Remonter en haut à chaque changement d'écran.
   *
   * L'application est une page unique et c'est le document entier qui défile.
   * Sans ce geste, quitter le bas d'une liste de quarante clients pour ouvrir
   * le bilan ouvrait le bilan à la même hauteur — c'est-à-dire, le plus
   * souvent, sur du vide. Un navigateur le ferait tout seul entre deux URL ;
   * ici, personne ne le fait.
   */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    // `collecteur_id` doit accompagner chaque écriture : la politique RLS
    // l'exige au `with check`. On le lit une fois, à l'ouverture.
    void supabase.auth.getUser().then(({ data }) => setCollecteurId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    // Le nom vient de `collecteurs`, pas des métadonnées du jeton : c'est la
    // ligne que le collecteur peut lui-même corriger, et l'écran doit montrer
    // ce qu'il a corrigé. La politique RLS la borne à sa propre ligne.
    void supabase
      .from('collecteurs')
      .select('nom')
      .maybeSingle()
      .then(({ data }) => setNomCollecteur((data as { nom?: string } | null)?.nom ?? null));
  }, [collecteurId]);

  async function deconnecter() {
    setErreurSortie(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setErreurSortie('Déconnexion impossible. Vérifie le réseau et réessaie.');
      return;
    }
    // Avant de rendre la main : les lectures gardées en mémoire portent les
    // noms et les soldes des clients. Deux collecteurs se relaient sur le même
    // téléphone, et le second ne doit rien voir du premier.
    viderCache();
    onDeconnexion();
  }

  /**
   * Changer d'écran, et rendre au retrait sa liste entière.
   *
   * Le filtre appartient au geste qui l'a posé — « Retirer » sur une carte
   * précise. Toute autre navigation demande la liste complète, à commencer par
   * la tuile « Retrait » de l'accueil : sans cette remise à zéro, elle rouvrait
   * l'écran encore réduit au client de la visite précédente, qui n'a parfois
   * plus aucune carte. Le collecteur venait chercher ses cartes et trouvait un
   * écran vide.
   *
   * Tous les changements d'écran passent par ici. Un seul `setPage` laissé de
   * côté suffirait à rouvrir la porte.
   */
  function naviguer(cle: Page) {
    setClientPourRetrait(null);
    // La carte choisie s'oublie ici, et non après l'encaissement.
    //
    // Elle s'oubliait au succès, ce qui interdisait à l'écran de montrer sa
    // propre confirmation : tout son corps vit sous `{!carte ? … : …}`, donc
    // la carte, le message et le bouton disparaissaient dans le rendu même où
    // la mise partait. Le collecteur encaissait devant sa cliente et lisait
    // « Aucune carte choisie ».
    //
    // Le `null` protégeait tout de même quelque chose de réel — le serveur
    // accepte deux mises le même jour sur la même carte, `mises_avant_insert`
    // ne s'y oppose pas. Cette garde-là est reprise par l'écran, qui désarme
    // son bouton une fois la mise écrite. Ici, on se contente de ne pas
    // rouvrir une carte oubliée : sans cette ligne, l'onglet « Encaisser » de
    // la barre du bas rouvrirait celle du client précédent.
    setCarteChoisie(null);
    setPage(cle);
  }

  function allerAuRetrait(client: ClientCible) {
    setClientPourRetrait(client);
    setPage('retrait');
  }

  function encaisserSur(carte: CarteChoisie) {
    // Naviguer d'abord, choisir ensuite : `naviguer` remet la carte à `null`,
    // et l'ordre inverse effacerait celle qu'on vient de désigner. Deux
    // écritures du même état dans le même gestionnaire, la dernière l'emporte.
    naviguer('encaisser');
    setCarteChoisie(carte);
  }

  /**
   * Ouvrir la fiche d'un client depuis un autre écran.
   *
   * La fiche est un panneau flottant de la liste des clients, pas un écran :
   * on ne peut donc pas y « naviguer ». On va sur la liste en portant
   * l'identifiant, qu'elle consomme à l'arrivée — le même mécanisme que le
   * formulaire de souscription, et pour la même raison.
   */
  function ouvrirFiche(clientId: string) {
    setClientPourFiche(clientId);
    naviguer('clients');
  }

  const contenu = (
    <>
      {erreurSortie && (
        <p
          role="alert"
          className="bg-negative-tint text-negative text-sm font-body font-medium px-4 py-2"
        >
          {erreurSortie}
        </p>
      )}

      {page === 'accueil' && (
        <Accueil
          nomCollecteur={nomCollecteur}
          revision={revision}
          onNaviguer={naviguer}
          onSouscrire={() => {
            setSouscrire(true);
            naviguer('clients');
          }}
          onEncaisser={encaisserSur}
          onOuvrirFiche={ouvrirFiche}
          onDeconnexion={deconnecter}
        />
      )}
      {page === 'clients' && (
        <Clients
          collecteurId={collecteurId}
          revision={revision}
          ouvrirFormulaire={souscrire}
          onFormulaireVu={() => setSouscrire(false)}
          ficheAOuvrir={clientPourFiche}
          onFicheVue={() => setClientPourFiche(null)}
          onDeconnexion={deconnecter}
          onEncaisser={encaisserSur}
          onEcriture={() => setRevision((r) => r + 1)}
          onRetrait={allerAuRetrait}
        />
      )}
      {page === 'encaisser' && (
        <Encaisser
          collecteurId={collecteurId}
          carte={carteChoisie}
          onNaviguer={naviguer}
          onEncaisse={() => {
            setRevision((r) => r + 1);
            // La carte reste, et gagne son jour. C'est la case fraîchement
            // remplie que la conception voulait animer et qu'on démontait
            // avant qu'elle ait pu se montrer.
            setCarteChoisie((c) =>
              c ? { ...c, misesEncaissees: c.misesEncaissees + 1 } : c,
            );
          }}
        />
      )}

      {/* Les six écrans qui étaient éteints. Chacun revient à l'accueil : ils
          ne figurent pas dans la barre du bas, donc sans cette flèche on y
          serait enfermé. */}
      {page === 'retrait' && (
        <Retrait
          revision={revision}
          collecteurId={collecteurId}
          client={clientPourRetrait}
          onToutesLesCartes={() => setClientPourRetrait(null)}
          onRetour={() => naviguer('accueil')}
          onEcriture={() => setRevision((r) => r + 1)}
        />
      )}
      {page === 'bilans' && <Bilan revision={revision} onRetour={() => naviguer('accueil')} />}
      {page === 'rapprochement' && (
        <Rapprochement
          collecteurId={collecteurId}
          revision={revision}
          onRetour={() => naviguer('accueil')}
        />
      )}
      {page === 'recus' && <Recus revision={revision} onRetour={() => naviguer('accueil')} />}
      {page === 'alertes' && <Alertes revision={revision} onRetour={() => naviguer('accueil')} />}
      {page === 'avis' && <Avis revision={revision} onRetour={() => naviguer('accueil')} />}
      {(page === 'plus' || page === 'profil') && (
        <Plus onRetour={() => naviguer('accueil')} onDeconnexion={deconnecter} />
      )}

    </>
  );

  return (
    /**
     * Deux mises en page, une seule application.
     *
     * **Sous `lg`** : la colonne téléphone, plafonnée à `max-w-mobile` (520 px),
     * avec la barre du bas. C'est la forme d'origine, et celle qui compte — le
     * collecteur travaille debout, dans un marché.
     *
     * **À partir de `lg`** : une barre latérale fixe, et un contenu dont le
     * plafond n'est plus décidé ici. Chaque écran déclare sa nature — `saisie`,
     * `liste` ou `large` — et `CorpsEcran` en tire la largeur. Un plafond unique
     * imposé par la coquille obligeait une grille de cartes à deux colonnes à
     * tenir dans 640 px, c'est-à-dire à ne pas exister.
     *
     * `overflow-x-clip` reste sur les deux : c'est le garde-fou posé le
     * 2026-08-22 contre un débordement latéral, et il ne dépend pas de la
     * largeur.
     */
    <div className="min-h-dvh bg-canvas lg:flex">
      {/* `sticky` et non `fixed` : la barre suit le défilement sans sortir du
          flux, donc le contenu n'a pas besoin d'une marge compensatoire qu'il
          faudrait tenir à jour à chaque changement de largeur. */}
      <div className="hidden lg:block lg:sticky lg:top-0 lg:h-dvh">
        <NavBureau
          actif={page}
          nom={nomCollecteur}
          onNaviguer={naviguer}
          onDeconnexion={deconnecter}
        />
      </div>

      {/* `pb-nav` réserve la hauteur de la barre, qui ne défile plus et ne
          pousse donc plus rien. Sans cette marge, la dernière ligne d'une liste
          — le dernier client de la tournée, son bouton « Encaisser » — passe
          sous la barre et devient injoignable. */}
      <div className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col overflow-x-clip pb-nav lg:min-h-0 lg:max-w-none lg:pb-0 lg:py-8">
        {contenu}
      </div>

      {/* La barre du bas ne connaît que ses cinq clés. Sur un écran secondaire,
          aucun onglet n'est actif — d'où le repli sur 'accueil', qui est bien
          l'endroit d'où l'on vient et où la flèche ramène.

          Elle est sortie de la colonne le 2026-08-25, en même temps qu'elle est
          passée de `sticky` à `fixed`. Le 24, elle y était entrée pour une
          raison qui ne vaut que pour `sticky` : un élément collant est confiné à
          sa boîte englobante, et il lui fallait une boîte plus haute que lui
          pour avoir de la course. Un élément fixe, lui, se positionne sur le
          champ de vision — il n'a besoin d'aucune course, et il gagne à ne pas
          descendre d'une boîte en `overflow-x: clip`, qui peut rogner un
          descendant fixe.

          Ce qui reste vrai de la leçon du 24 : **aucune enveloppe**. Le
          masquage bureau est porté par la barre elle-même, via `className`.
          Remettre un `<div className="lg:hidden">` ici, c'est rouvrir la porte
          par laquelle la panne est entrée. */}
      <NavMobile
        className="lg:hidden"
        actif={estOnglet(page) ? page : 'accueil'}
        onNaviguer={naviguer}
      />
    </div>
  );
}

const ONGLETS: readonly CleNavCollecteur[] = ['accueil', 'clients', 'encaisser', 'bilans', 'profil'];

function estOnglet(page: Page): page is CleNavCollecteur {
  return (ONGLETS as readonly string[]).includes(page);
}
