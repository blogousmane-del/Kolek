import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TAILLE_PAGE } from '@kolek/ui';
import { afterEach, describe, expect, it } from 'vitest';

import type { LigneCarte, VueGlobale } from '../donnees';
import { EncoursSoldes } from './EncoursSoldes';

/**
 * Le détail par carte, et sa pagination d'affichage.
 *
 * ## Pourquoi cet écran-là en avait besoin, et pas seulement pour la forme
 *
 * C'est la plus longue liste de l'admin. `admin-vue-globale` en rend jusqu'à
 * cinq cents lignes — la borne est posée côté serveur, et l'écran la dit déjà en
 * tête de tableau (« 500 des 1 240 cartes »). Cinq cents lignes de six colonnes
 * font trois mille cellules dans le document, sur un tableau que
 * l'administrateur ouvre pour en lire vingt.
 *
 * La pagination ne va rien chercher de plus au serveur : la borne des cinq cents
 * reste, et le compte en tête continue de la dire. Ce qui change est le nombre
 * de lignes rendues d'un coup.
 */

afterEach(cleanup);

/** `n` cartes numérotées, pour que l'ordre de lecture se lise à l'œil nu. */
function cartes(n: number): LigneCarte[] {
  return Array.from({ length: n }, (_, i) => {
    const rang = String(i + 1).padStart(3, '0');
    return {
      id: `k${rang}`,
      client: `Client ${rang}`,
      collecteur_id: 'col1',
      collecteur: 'Adjoa',
      mise: 1000,
      mises_encaissees: 5,
      statut: 'active',
      ouverte_le: '2026-08-01T08:00:00.000Z',
      solde_restituable: 4000,
      restitue: 0,
      encours: 4000,
    } satisfies LigneCarte;
  });
}

function rendre(lignes: LigneCarte[], total = lignes.length) {
  return render(
    <EncoursSoldes
      vue={
        {
          totaux: {
            total_encaisse: 0,
            mises: 0,
            encours_clients: 0,
            restitutions: 0,
            commissions: 0,
          },
          cartes: lignes,
          cartes_total_lignes: total,
        } as unknown as VueGlobale
      }
    />,
  );
}

/** Une cellule par carte rendue, et une seule : de quoi les compter. */
const lignesRendues = () => screen.queryAllByText(/^Client \d{3}$/);

describe('pagination du détail par carte', () => {
  it('ne rend qu’une page de lignes, quelle que soit la longueur du tableau', () => {
    rendre(cartes(120));

    expect(lignesRendues()).toHaveLength(TAILLE_PAGE);
  });

  it('mène à la page suivante', () => {
    rendre(cartes(120));

    fireEvent.click(screen.getByRole('button', { name: /page suivante/i }));

    expect(screen.getByText('Client 051')).toBeDefined();
    expect(screen.queryByText('Client 001')).toBeNull();
  });

  it('n’affiche aucune commande de page quand tout tient sur une', () => {
    // Deux flèches inertes sous dix lignes sont du bruit, et l'administrateur
    // apprendrait à ne plus les regarder.
    rendre(cartes(10));

    expect(screen.queryByRole('button', { name: /page suivante/i })).toBeNull();
  });

  it('continue de dire combien de cartes le serveur possède', () => {
    // Le compte en tête parle de la **borne serveur**, pas de la page. Le faire
    // parler de la page effacerait le seul endroit où l'administrateur apprend
    // que le tableau est tronqué à cinq cents lignes — et il conclurait que
    // l'entreprise tient 500 cartes quand elle en tient 1 240.
    rendre(cartes(500), 1240);

    // Sans séparateur de milliers : le compte est écrit brut ici, là où le
    // reste de l'écran passe par `formatMontant`. C'est ce que l'écran fait
    // aujourd'hui, et ce test le constate plutôt que de le corriger en passant.
    expect(screen.getByText(/500 des 1240 cartes/)).toBeDefined();
  });
});
