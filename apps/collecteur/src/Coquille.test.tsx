import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La barre du bas, et l'endroit où elle est accrochée.
 *
 * ## Deux pannes, deux jours de suite
 *
 * **Le 24.** La barre démarrait en flux à `y = hauteur du viewport`, son
 * rectangle identique à celui de son parent — un `<div className="lg:hidden">`
 * glissé autour d'elle. Un élément `sticky` est confiné à sa boîte englobante ;
 * quand cette boîte l'épouse au pixel, la course de collage est nulle et
 * `position: sticky` ne fait plus rien.
 *
 * **Le 25.** Le collage retrouvé ne suffisait toujours pas. `sticky bottom-0`
 * ne colle que tant que la boîte englobante déborde du champ de vision : sur un
 * accueil court, la barre se posait au milieu de l'écran, là où le contenu
 * s'arrête, et remontait avec le document au premier défilement. Une barre de
 * navigation mobile ne bouge jamais — c'est ce qui la rend atteignable au pouce
 * sans regarder.
 *
 * D'où `position: fixed`, qui ne dépend plus d'aucune boîte. Ce que ce test
 * garde a donc changé de nature : ce n'est plus la course du collage, c'est
 * **ce que `fixed` fait payer**. Un élément fixe sort du flux, donc le document
 * ne réserve plus sa place, donc la dernière ligne d'une liste passe dessous —
 * et cette dernière ligne porte le bouton « Encaisser » du dernier client de la
 * tournée. La marge compensatoire n'est pas un détail de style.
 *
 * jsdom ne calcule aucune mise en page. Mais les deux causes sont
 * structurelles, et celles-là il les voit.
 */

const getUser = vi.fn();
const maybeSingle = vi.fn();
const signOut = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: () => getUser(),
      signOut: () => signOut(),
    },
    from: () => ({ select: () => ({ maybeSingle: () => maybeSingle() }) }),
  },
}));

vi.mock('./cache', () => ({ viderCache: vi.fn() }));

// Les dix écrans sont remplacés par des témoins : ce test porte sur la
// coquille, pas sur ce qu'elle affiche.
const temoin = (nom: string) => ({ [nom]: () => <div>écran {nom}</div> });
vi.mock('./ecrans/Accueil', () => temoin('Accueil'));
vi.mock('./ecrans/Alertes', () => temoin('Alertes'));
vi.mock('./ecrans/Avis', () => temoin('Avis'));
vi.mock('./ecrans/Bilan', () => temoin('Bilan'));
vi.mock('./ecrans/Clients', () => temoin('Clients'));
vi.mock('./ecrans/Encaisser', () => temoin('Encaisser'));
vi.mock('./ecrans/Plus', () => temoin('Plus'));
vi.mock('./ecrans/Rapprochement', () => temoin('Rapprochement'));
vi.mock('./ecrans/Recus', () => temoin('Recus'));
vi.mock('./ecrans/Retrait', () => temoin('Retrait'));

const { Coquille } = await import('./Coquille');

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: 'collecteur-1' } } });
  maybeSingle.mockResolvedValue({ data: { nom: 'Awa' } });
  // `window.scrollTo` n'existe pas dans jsdom : sans ce témoin, chaque rendu
  // écrit une erreur « Not implemented » dans la sortie du test.
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  // `@testing-library/react` ne branche son nettoyage qu'avec les globales de
  // vitest, que ce dépôt n'active pas. Même raison que `Portillon.test.tsx`.
  cleanup();
  vi.unstubAllGlobals();
  getUser.mockReset();
  maybeSingle.mockReset();
  signOut.mockReset();
});

describe('coquille du collecteur', () => {
  it('fixe la barre du bas au champ de vision, pas au document', () => {
    render(<Coquille onDeconnexion={vi.fn()} />);

    const barre = screen.getByRole('navigation', { name: 'Navigation principale' });

    expect(barre.className).toContain('fixed');
    expect(barre.className).toContain('bottom-0');
    // `sticky` a été essayé deux jours et n'a jamais tenu la promesse : sur un
    // écran court il n'a pas de course, et la barre repart avec le document.
    expect(barre.className).not.toContain('sticky');
    // Le masquage sur bureau vit sur le même nœud que le positionnement.
    // Séparer les deux, c'est réintroduire la boîte intermédiaire du 24.
    expect(barre.className).toContain('lg:hidden');
  });

  it('reproduit le plafond de la colonne, la barre n’héritant plus de rien', () => {
    render(<Coquille onDeconnexion={vi.fn()} />);

    const barre = screen.getByRole('navigation', { name: 'Navigation principale' });

    // Entre 640 et 1023 px, la colonne est plafonnée à 520 px et centrée. Une
    // barre fixe pleine fenêtre sous un contenu de 520 px se lit comme deux
    // mises en page superposées.
    expect(barre.className).toContain('max-w-mobile');
    expect(barre.className).toContain('left-1/2');
    expect(barre.className).toContain('-translate-x-1/2');
  });

  it('réserve dans la colonne la hauteur que la barre n’occupe plus', () => {
    render(<Coquille onDeconnexion={vi.fn()} />);

    const colonne = screen.getByText('écran Clients').parentElement;

    // Sans `pb-nav`, la dernière ligne d'une liste passe sous la barre. C'est
    // là que se trouve le bouton d'encaissement du dernier client de la
    // tournée : la seule commande qu'on ne peut pas se permettre de cacher.
    expect(colonne?.className).toContain('pb-nav');
    // Sur bureau la barre n'existe pas : la marge non plus, sinon l'écran
    // porte 84 px de vide en bas sans raison.
    expect(colonne?.className).toContain('lg:pb-0');
  });
});
