import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CarteCollecte } from './CarteCollecte';

// `globals` n'est pas activé dans la configuration Vitest de ce paquet.

afterEach(cleanup);

function rendre(action?: React.ReactNode) {
  return render(
    <CarteCollecte
      nomClient="Aïcha"
      misePar="5 000"
      jourCourant={3}
      solde="10 000"
      cycle="1"
      action={action}
    />,
  );
}

describe('CarteCollecte — la fente du pied', () => {
  it('ne porte rien tant qu\'on ne lui donne rien', () => {
    // La fente n'appartient qu'à la carte choisie. Une carte qu'on regarde
    // sans l'avoir touchée ne doit rien proposer.
    rendre();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('pose ce qu\'on lui donne, sous le solde', () => {
    rendre(
      <button type="button">Encaisser 5 000 FCFA</button>,
    );

    const bouton = screen.getByRole('button', { name: 'Encaisser 5 000 FCFA' });
    expect(bouton).toBeTruthy();

    // Sous le solde, et non par-dessus : le solde est précisément ce qu'on
    // regarde avant d'encaisser. Un calque l'aurait masqué.
    const solde = screen.getByText('Solde restituable');
    expect(solde.compareDocumentPosition(bouton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('CarteCollecte — le billet', () => {
  function etats(conteneur: HTMLElement) {
    return [...conteneur.querySelectorAll('[data-etat]')].map((c) => c.getAttribute('data-etat'));
  }

  function carte(supplement: Partial<React.ComponentProps<typeof CarteCollecte>> = {}) {
    return render(
      <CarteCollecte
        nomClient="Mariam"
        misePar="2 000"
        jourCourant={29}
        solde="56 000"
        cycle="1"
        {...supplement}
      />,
    );
  }

  it('porte trente et une cases', () => {
    const { container } = carte();
    expect(etats(container)).toHaveLength(31);
  });

  it('peint les mises encaissées, cercle la prochaine, laisse les autres à venir', () => {
    const { container } = carte();
    const e = etats(container);
    expect(e.slice(0, 29).every((x) => x === 'payee')).toBe(true);
    expect(e[29]).toBe('prochaine');
    expect(e[30]).toBe('a-venir');
  });

  it('marque la case qu’on vient de payer', () => {
    const { container } = carte({ jourCourant: 30, neuve: 30 });
    const e = etats(container);
    expect(e[29]).toBe('neuve');
    expect(e[30]).toBe('prochaine');
    expect(e.filter((x) => x === 'neuve')).toHaveLength(1);
  });

  it('écrit le compteur d’un seul tenant', () => {
    carte();
    expect(screen.getByText('29/31')).toBeTruthy();
  });

  it('garde « Mise / jour » et son montant côte à côte, comme la fiche les lit', () => {
    carte();
    expect(screen.getByText('Mise / jour').nextElementSibling?.textContent).toMatch(/2\s000/);
  });

  it('pose le tampon et le surtitre qu’on lui donne', () => {
    carte({ tampon: <span>tampon posé</span>, surtitre: <span>À finir en premier</span> });
    expect(screen.getByText('tampon posé')).toBeTruthy();
    expect(screen.getByText('À finir en premier')).toBeTruthy();
  });

  it('change le libellé du solde une fois la carte close', () => {
    carte({ etiquetteSolde: 'Rendu au client' });
    expect(screen.getByText('Rendu au client')).toBeTruthy();
    expect(screen.queryByText('Solde restituable')).toBeNull();
  });

  it('ne cercle aucune case sur une carte close : plus rien n’y attend de mise', () => {
    const { container } = carte({ jourCourant: 4, close: true });
    const e = etats(container);
    // Les trente et une cases d'abord : sans elles, les deux lignes suivantes
    // passeraient sur une liste vide.
    expect(e).toHaveLength(31);
    expect(e.slice(0, 4).every((x) => x === 'payee')).toBe(true);
    expect(e).not.toContain('prochaine');
  });

  it('ne dit pas de cycle qu’on ne lui donne pas', () => {
    carte({ cycle: undefined });
    expect(screen.queryByText(/^Cycle/)).toBeNull();
  });

  it('ne porte plus ni verre ni dégradé', () => {
    const { container } = carte();
    expect(container.innerHTML).not.toMatch(/backdrop-blur|degrade-carte|radial-gradient/);
  });

  it('se laisse retrouver par son bloc, comme la fiche le fait', () => {
    carte();
    const bloc = screen.getByText('Cycle 1').closest('.rounded-xl');
    expect(bloc?.hasAttribute('data-carte-collecte')).toBe(true);
  });

  it('garde son format réduit sur huit colonnes', () => {
    const { container } = carte();
    expect(container.innerHTML).toContain('@max-[240px]:grid-cols-8');
  });
});
