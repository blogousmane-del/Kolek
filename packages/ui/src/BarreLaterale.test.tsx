import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BarreLaterale } from './BarreLaterale';

/**
 * Le sélecteur d'espace n'apparaît que pour qui le mérite.
 *
 * ## Pourquoi masquer plutôt que griser
 *
 * Le fichier voisin porte deux fois la leçon : les entrées mortes ont été
 * retirées le 2026-08-21, puis les deux « raccourcis » grisés le 2026-08-22,
 * avec l'argument « un menu qui promet ce qu'il ne tiendra jamais est pire
 * qu'un menu court ». Un sélecteur grisé pour cause de privilège est un cas de
 * plus de la même famille : il apprend à l'administrateur métier qu'il existe
 * un niveau au-dessus du sien et lui donne quelque chose à demander.
 *
 * Pour lui, l'encart « Kolek · Admin » reste ce qu'il était — un libellé de
 * contexte — et perd même le chevron double, qui n'ouvrait rien.
 *
 * ## Ce que ces tests ne prouvent pas
 *
 * Rien sur la sécurité. Cacher un menu ne protège aucune donnée — le portillon
 * est `est_super_admin()`, vérifié par la base sous l'identité de l'appelant, et
 * les deux Edge Functions le redemandent. Ces tests portent sur ce que l'écran
 * raconte, pas sur ce qu'il autorise.
 */

afterEach(cleanup);

const props = {
  actif: 'tableau' as const,
  onNaviguer: vi.fn(),
  onDeconnexion: vi.fn(),
};

/** Déplie le sélecteur d'espace. */
function ouvrirSelecteur() {
  fireEvent.click(screen.getByRole('button', { name: /changer d’espace/i }));
}

/** Choisit un espace dans le menu déplié.

    Par le rôle et non par le texte : le bouton du sélecteur affiche déjà le
    libellé de l'espace courant, donc `getByText` en trouverait deux dès qu'on
    rechoisit celui où l'on est. */
function choisirEspace(libelle: RegExp) {
  fireEvent.click(screen.getByRole('menuitemradio', { name: libelle }));
}

describe('la barre latérale d’administration', () => {
  it('n’offre aucun changement d’espace par défaut', () => {
    render(<BarreLaterale {...props} />);

    expect(screen.queryByRole('button', { name: /changer d’espace/i })).toBeNull();
    expect(screen.queryByText('Kolek · Super Admin')).toBeNull();
    // Le libellé de contexte reste, et le reste du menu est intact : c'est une
    // commande en moins, pas un menu à deux visages.
    expect(screen.getByText('Kolek · Admin')).toBeDefined();
    expect(screen.getByText('Tableau de bord')).toBeDefined();
    expect(screen.getByText('Réglages')).toBeDefined();
  });

  it('offre le sélecteur quand le compte est super admin', () => {
    render(<BarreLaterale {...props} estSuper onChangerEspace={vi.fn()} />);

    // Fermé au départ : ouvrir un menu que personne n'a demandé recouvre les
    // deux premières entrées du menu qui, lui, était demandé.
    expect(screen.queryByRole('menu')).toBeNull();

    ouvrirSelecteur();

    expect(screen.getByRole('menu')).toBeDefined();
    expect(screen.getByRole('menuitemradio', { name: /Kolek · Super Admin/ })).toBeDefined();
  });

  it('bascule vers la console de plateforme au choix', () => {
    const onChangerEspace = vi.fn();
    render(<BarreLaterale {...props} estSuper onChangerEspace={onChangerEspace} />);

    ouvrirSelecteur();
    choisirEspace(/Kolek · Super Admin/);

    expect(onChangerEspace).toHaveBeenCalledWith('super');
    // Le menu se referme sur le choix : le laisser ouvert recouvrirait le menu
    // qu'on vient de changer.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('ne rappelle rien quand on rechoisit l’espace courant', () => {
    const onChangerEspace = vi.fn();
    render(<BarreLaterale {...props} estSuper onChangerEspace={onChangerEspace} />);

    ouvrirSelecteur();
    choisirEspace(/Kolek · Admin/);

    expect(onChangerEspace).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('remplace le menu entier dans l’espace plateforme', () => {
    render(
      <BarreLaterale
        {...props}
        espace="super"
        actif="administrateurs"
        estSuper
        onChangerEspace={vi.fn()}
      />,
    );

    // Le menu du Dashboard a disparu — ce n'est pas un écran de plus, c'est une
    // autre console.
    expect(screen.queryByText('Tableau de bord')).toBeNull();
    expect(screen.queryByText('Collecteurs')).toBeNull();
    // Et la promotion d'offre avec lui : la plateforme n'est l'abonnée de
    // personne.
    expect(screen.queryByText('Passer à Pro')).toBeNull();

    expect(screen.getByText('Administrateurs')).toBeDefined();
    expect(screen.getByText('Promotions')).toBeDefined();
    expect(screen.getByText('Sécurité')).toBeDefined();
    expect(screen.getByText('Plateforme')).toBeDefined();
  });

  it('navigue dans le menu de la plateforme', () => {
    const onNaviguer = vi.fn();
    render(
      <BarreLaterale
        {...props}
        espace="super"
        actif="abonnements"
        onNaviguer={onNaviguer}
        estSuper
        onChangerEspace={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Sécurité'));

    expect(onNaviguer).toHaveBeenCalledWith('securite');
  });

  it('revient au Dashboard depuis la plateforme', () => {
    const onChangerEspace = vi.fn();
    render(
      <BarreLaterale
        {...props}
        espace="super"
        actif="abonnements"
        estSuper
        onChangerEspace={onChangerEspace}
      />,
    );

    ouvrirSelecteur();
    choisirEspace(/Kolek · Admin/);

    expect(onChangerEspace).toHaveBeenCalledWith('admin');
  });
});
