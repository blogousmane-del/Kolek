import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TAILLE_PAGE } from '@kolek/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LigneCollecteur, VueGlobale } from '../donnees';
import { Collecteurs } from './Collecteurs';

/**
 * La liste des collecteurs, et sa pagination d'affichage.
 *
 * ## Pourquoi paginer une liste que le modèle d'affaires borne déjà
 *
 * L'écran le dit lui-même : ce sont des comptes payants créés à la main par
 * GTCS, donc quelques dizaines aujourd'hui. La pagination ne se voit pas — le
 * composant ne rend rien sous cinquante lignes.
 *
 * Elle est là pour deux raisons. La première est que « borné par le modèle
 * d'affaires » est une hypothèse commerciale, pas une contrainte technique :
 * elle tombe le jour où l'entreprise réussit. La seconde est la cohérence — un
 * administrateur qui apprend les commandes de page sur le tableau des cartes
 * s'attend à les retrouver ici, et une console où la même liste se comporte de
 * deux façons se réapprend à chaque écran.
 */

afterEach(cleanup);

/** `n` collecteurs numérotés, pour que l'ordre de lecture se lise à l'œil nu. */
function collecteurs(n: number): LigneCollecteur[] {
  return Array.from({ length: n }, (_, i) => {
    const rang = String(i + 1).padStart(3, '0');
    return {
      id: `id-${rang}`,
      nom: `Collecteur ${rang}`,
      telephone: '+2250700000009',
      zone: 'Cocody',
      titulaire_nom: null,
      palier: 'pro',
      abonnement_statut: 'actif',
      abonnement_echeance: '2026-12-31',
      cree_le: '2026-06-12T09:00:00Z',
      clients: 1,
      cartes_actives: 1,
      encaisse: 0,
      commissions: 0,
      restitutions: 0,
      encours: 0,
    } as unknown as LigneCollecteur;
  });
}

function rendre(liste: LigneCollecteur[]) {
  return render(
    <Collecteurs
      vue={
        {
          collecteurs: liste,
          zones: [],
          abonnements: { collecteurs_actifs: liste.length, collecteurs_total: liste.length },
          totaux: { total_encaisse: 0, clients: 0, cartes_actives: 0 },
        } as unknown as VueGlobale
      }
      onOuvrirCollecteur={vi.fn()}
      onCollecteurCree={vi.fn()}
    />,
  );
}

/** Une commande par ligne rendue, et une seule : de quoi les compter. */
const lignesRendues = () => screen.queryAllByRole('button', { name: /^Ouvrir la fiche de/ });

/** La recherche et les filtres vivent derrière la loupe de la barre haute. */
const ouvrirLesOutils = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));

const chercher = (terme: string) =>
  fireEvent.change(screen.getByLabelText('Rechercher un collecteur'), {
    target: { value: terme },
  });

describe('pagination des collecteurs', () => {
  it('ne rend qu’une page de lignes, quelle que soit la longueur de la liste', () => {
    rendre(collecteurs(120));

    expect(lignesRendues()).toHaveLength(TAILLE_PAGE);
  });

  it('mène à la page suivante', () => {
    rendre(collecteurs(120));

    fireEvent.click(screen.getByRole('button', { name: /page suivante/i }));

    expect(screen.getByText('Collecteur 051')).toBeDefined();
    expect(screen.queryByText('Collecteur 001')).toBeNull();
  });

  it('cherche dans tous les collecteurs, et non dans la page affichée', () => {
    // Le test qui compte. `Collecteur 099` est en troisième page ; s'il ne
    // remontait pas, l'administrateur conclurait qu'il n'est pas inscrit — et
    // en créerait un second, avec son propre abonnement à facturer.
    rendre(collecteurs(120));
    ouvrirLesOutils();

    chercher('Collecteur 099');

    expect(screen.getByText('Collecteur 099')).toBeDefined();
  });

  it('revient à la première page quand la recherche change', () => {
    rendre(collecteurs(120));
    ouvrirLesOutils();

    fireEvent.click(screen.getByRole('button', { name: /page suivante/i }));
    chercher('Collecteur');

    expect(screen.getByText('Collecteur 001')).toBeDefined();
  });

  it('revient à la première page quand le filtre change', () => {
    rendre(collecteurs(120));
    ouvrirLesOutils();

    fireEvent.click(screen.getByRole('button', { name: /page suivante/i }));
    fireEvent.click(screen.getByRole('button', { name: 'À jour' }));

    expect(screen.getByText('Collecteur 001')).toBeDefined();
  });

  it('n’affiche aucune commande de page quand tout tient sur une', () => {
    rendre(collecteurs(10));

    expect(screen.queryByRole('button', { name: /page suivante/i })).toBeNull();
  });

  it('compte tous les collecteurs trouvés en tête, et non ceux de la page', () => {
    // Le compte en tête répond à « combien correspondent », pas à « combien
    // sont dessinés ». Le faire parler de la page ferait croire que la
    // recherche s'arrête à cinquante.
    rendre(collecteurs(120));

    expect(screen.getByText('120 inscrits')).toBeDefined();
  });
});

/**
 * L'export suit le filtre, et non la page.
 *
 * Le commentaire de `exporter()` le promet depuis l'origine : « On exporte ce
 * qui est affiché, pas la table entière ». La pagination introduit une
 * troisième quantité — ce qui est *dessiné* — et c'est celle qu'il ne faut pas
 * exporter. Un fichier de cinquante lignes que l'administrateur croirait
 * complet est exactement le défaut que ce commentaire cherchait à éviter.
 */
describe('export', () => {
  it('exporte toute la liste filtrée, pas la page affichée', () => {
    const liens: HTMLAnchorElement[] = [];
    const vraiCreer = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((balise: string) => {
      const noeud = vraiCreer(balise);
      if (balise === 'a') liens.push(noeud as HTMLAnchorElement);
      return noeud;
    });
    // `jsdom` n'implémente ni l'un ni l'autre, et `telechargerCsv` les appelle.
    const url = URL as unknown as Record<string, unknown>;
    url.createObjectURL = vi.fn(() => 'blob:faux');
    url.revokeObjectURL = vi.fn();

    const contenus: string[] = [];
    const vraiBlob = globalThis.Blob;
    globalThis.Blob = class extends vraiBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        contenus.push(parts.map(String).join(''));
      }
    } as unknown as typeof Blob;

    try {
      rendre(collecteurs(120));
      fireEvent.click(screen.getByRole('button', { name: 'Exporter' }));

      const csv = contenus.join('');
      expect(csv).toContain('Collecteur 001');
      // La ligne 120 est en troisième page. Si l'export suivait la page, elle
      // manquerait — et le fichier aurait l'air complet.
      expect(csv).toContain('Collecteur 120');
    } finally {
      globalThis.Blob = vraiBlob;
      vi.restoreAllMocks();
      liens.length = 0;
    }
  });
});
