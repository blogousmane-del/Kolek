import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NavBureau } from './NavBureau';

afterEach(cleanup);

function rendre() {
  return render(<NavBureau actif="accueil" onNaviguer={vi.fn()} onDeconnexion={vi.fn()} nom="Awa" />);
}

/** Le dessin d'une entrée de la barre latérale, par son libellé. */
function dessin(libelle: string): SVGElement {
  const svg = screen.getByRole('button', { name: libelle }).querySelector('svg');
  if (!svg) throw new Error(`Pas d’icône pour « ${libelle} »`);
  return svg;
}

/**
 * Les icônes de la barre latérale, dans le dessin du billet.
 *
 * Elles disent la même chose que la barre du bas et que les outils de l'accueil :
 * un billet pour encaisser, une balance pour le rapprochement de caisse, un
 * ticket à lignes pour les reçus. Avant, « Rapprochement » portait une flèche
 * de synchronisation et « Reçus » un ticket nu : pas les pictogrammes que
 * l'accueil donne aux mêmes écrans.
 */
describe('la barre latérale du collecteur', () => {
  it('dessine « Encaisser » en billet, « Rapprochement » en balance, « Reçus » en ticket', () => {
    rendre();

    expect(dessin('Encaisser').classList.contains('lucide-banknote')).toBe(true);
    expect(dessin('Rapprochement').classList.contains('lucide-scale')).toBe(true);
    expect(dessin('Reçus').classList.contains('lucide-receipt-text')).toBe(true);
  });

  it('ne dessine ni le ticket nu, ni le « $ » rond', () => {
    rendre();

    const dessins = [...document.querySelectorAll('aside svg')];
    // Un témoin : la sonde voit les icônes de la barre.
    expect(dessins.length).toBeGreaterThan(8);
    for (const svg of dessins) {
      // La classe exacte : `lucide-receipt-text` ne doit pas faire passer pour
      // `lucide-receipt`, et `contains` sur la liste le sait là où `includes` sur
      // le texte de l'attribut ne le saurait pas.
      expect(svg.classList.contains('lucide-receipt'), svg.getAttribute('class') ?? '').toBe(false);
      expect(
        svg.classList.contains('lucide-circle-dollar-sign'),
        svg.getAttribute('class') ?? '',
      ).toBe(false);
    }
  });
});
