import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LigneCollecteur } from './LigneCollecteur';

/**
 * La cible du seul geste que porte cette ligne.
 *
 * Ouvrir la fiche d'un collecteur passe uniquement par le chevron de droite :
 * la ligne elle-même n'est pas cliquable. Ce chevron n'avait ni largeur ni
 * hauteur — sa cible était celle de l'icône, 18 px de côté, contre les 44 du
 * Design System. C'est l'action principale de l'écran « Collecteurs », et la
 * console d'administration s'ouvre bien sur tablette : la coquille replie sa
 * barre latérale en tiroir sous `lg`, ce qui n'a de sens que pour un doigt.
 */

afterEach(cleanup);

function rendre(titulaire?: string) {
  return render(
    <LigneCollecteur
      nom="Awa Koné"
      zone="Sokourani"
      clients={12}
      encaisse="450 000"
      statut="À jour"
      titulaire={titulaire}
      onOuvrir={vi.fn()}
    />,
  );
}

describe('LigneCollecteur', () => {
  it('donne au chevron la cible tactile du Design System', () => {
    rendre();

    const bouton = screen.getByRole('button', { name: 'Ouvrir la fiche de Awa Koné' });

    // `--spacing: 4px`, donc `w-11` et `h-11` valent 44 px — la même paire que
    // le bouton de menu de la coquille d'administration.
    expect(bouton.className).toMatch(/\bw-11\b/);
    expect(bouton.className).toMatch(/\bh-11\b/);
  });

  it('nomme le collecteur dans l’intitulé du bouton', () => {
    rendre();

    // L'icône est `aria-hidden` : sans cet intitulé, une liste de vingt
    // collecteurs offre vingt boutons identiques et sans nom.
    expect(screen.getByRole('button', { name: /Awa Koné/ })).toBeTruthy();
  });

  it('dit le rattachement, sur la ligne de la zone', () => {
    rendre('Kouassi Yao');

    // Les deux, et sur la même ligne : la zone reste l'information de terrain,
    // et une seconde ligne ne pousserait que les collaborateurs — la liste
    // cesserait d'aligner ses colonnes avec ses en-têtes.
    expect(screen.getByText(/Sokourani · Collaborateur de Kouassi Yao/)).toBeTruthy();
  });

  it('ne dit rien du rattachement quand il n’y en a pas', () => {
    rendre();

    // Le cas de presque tous les collecteurs. Une mention vide, ou un « — »,
    // ferait croire à une donnée manquante plutôt qu'à une donnée sans objet.
    expect(screen.queryByText(/Collaborateur/)).toBeNull();
    expect(screen.getByText('Sokourani')).toBeTruthy();
  });
});
