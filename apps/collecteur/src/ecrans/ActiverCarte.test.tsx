import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Le bloc qui ouvre une carte de plus, sans clôturer celle qui est pleine.
 *
 * Il vit dans un fichier à lui parce que trois écrans le montrent — la liste des
 * clients, la fiche, et l'écran de retrait. Écrit trois fois, il divergerait à la
 * première correction ; et le montant prérempli, en particulier, est le genre de
 * détail qu'on oublie de reporter.
 *
 * ## Pourquoi ces tests ne lisent pas la case cochée
 *
 * `ChoixMise` rend des `<button type="button">`, pas des `<input type="radio">` :
 * il n'y a pas de rôle « radio » ni d'attribut `checked` à interroger. L'état
 * choisi n'est porté que par des classes CSS, ce qui n'est pas un contrat de
 * test fiable. On observe donc le résultat — le montant effectivement envoyé à
 * `ouvrirCarte` — plutôt que le marquage visuel du bouton pressé.
 */

const ouvrirCarte = vi.fn();
const getUser = vi.fn();

vi.mock('../ecritures', () => ({
  ouvrirCarte: (...args: unknown[]) => ouvrirCarte(...args),
}));

vi.mock('../supabase', () => ({
  supabase: { auth: { getUser: () => getUser() } },
}));

const { ActiverCarte } = await import('./ActiverCarte');

const CLIENT = '33333333-3333-4333-8333-333333333333';
const COLLECTEUR = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: COLLECTEUR } } });
  ouvrirCarte.mockResolvedValue({ ok: true, carteId: 'c1' });
});

afterEach(() => {
  cleanup();
  ouvrirCarte.mockReset();
  getUser.mockReset();
});

describe('activer une carte de plus', () => {
  it('ne lit pas la session : l’identifiant lui est donné', () => {
    render(
      <ActiverCarte
        collecteurId={COLLECTEUR}
        clientId={CLIENT}
        misePreremplie={5000}
        identifiant="essai"
        onOuverte={vi.fn()}
      />,
    );

    // Trois écrans montrent ce bloc, et la liste des clients en montre autant
    // d'exemplaires qu'elle a de cartes pleines. Une lecture de session par
    // exemplaire, c'est autant d'allers-retours réseau en 3G pour une valeur que
    // la coquille tient déjà.
    expect(getUser).not.toHaveBeenCalled();
    // Et le bouton est armé au premier rendu : plus rien à attendre.
    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    expect(screen.getByRole('button', { name: /Ouvrir la carte/ })).toBeTruthy();
  });

  it('ouvre la carte au montant de celle qui vient d’être remplie', async () => {
    const onOuverte = vi.fn();
    render(
      <ActiverCarte collecteurId={COLLECTEUR} clientId={CLIENT} misePreremplie={5000} identifiant="essai" onOuverte={onOuverte} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la carte/ }));

    await vi.waitFor(() => expect(onOuverte).toHaveBeenCalled());
    // Le cas courant est de reprendre au même rythme : le montant est proposé
    // d'entrée, et il suffit de confirmer.
    expect(ouvrirCarte).toHaveBeenCalledWith(COLLECTEUR, CLIENT, 5000);
  });

  it('ouvre la carte au montant choisi quand le collecteur en change', async () => {
    const onOuverte = vi.fn();
    render(
      <ActiverCarte collecteurId={COLLECTEUR} clientId={CLIENT} misePreremplie={5000} identifiant="essai" onOuverte={onOuverte} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    // « 500 FCFA en saison creuse, 2 000 quand le commerce marche » : le montant
    // est proposé, pas imposé.
    fireEvent.click(await screen.findByRole('button', { name: /1\s*000/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la carte/ }));

    await vi.waitFor(() => expect(onOuverte).toHaveBeenCalled());
    expect(ouvrirCarte).toHaveBeenCalledWith(COLLECTEUR, CLIENT, 1000);
  });

  it('affiche le refus du serveur sans fermer le bloc', async () => {
    ouvrirCarte.mockResolvedValue({
      ok: false,
      echec: { code: 'MISE_HORS_BORNES', message: 'La mise doit être d’au moins 500 FCFA.' },
    });
    const onOuverte = vi.fn();

    render(
      <ActiverCarte
        collecteurId={COLLECTEUR}
        clientId={CLIENT}
        misePreremplie={5000}
        identifiant="essai"
        onOuverte={onOuverte}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la carte/ }));

    expect((await screen.findByRole('alert')).textContent).toContain('500');
    // Refermer effacerait le montant choisi et obligerait à tout refaire.
    expect(onOuverte).not.toHaveBeenCalled();
  });

  it('ne laisse pas quitter le bloc pendant qu’une carte s’ouvre', async () => {
    // Un « Annuler » cliquable pendant l'envoi replie le bloc sans rien montrer
    // du résultat : croyant n'avoir rien déclenché, le collecteur retouche
    // « Ouvrir la carte » et une seconde commission part sur la même carte.
    let resoudre: (valeur: { ok: true; carteId: string }) => void;
    ouvrirCarte.mockReturnValue(
      new Promise((resolve) => {
        resoudre = resolve;
      }),
    );
    const onOuverte = vi.fn();

    render(
      <ActiverCarte collecteurId={COLLECTEUR} clientId={CLIENT} misePreremplie={5000} identifiant="essai" onOuverte={onOuverte} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la carte/ }));

    const annuler = screen.getByRole('button', { name: 'Annuler' });
    expect((annuler as HTMLButtonElement).disabled).toBe(true);
    // Le bouton du dépli reste à l'écran depuis qu'il dit son état : le toucher
    // pendant l'envoi replierait le bloc de la même façon.
    const depli = screen.getByRole('button', { name: 'Activer une carte' });
    expect((depli as HTMLButtonElement).disabled).toBe(true);

    resoudre!({ ok: true, carteId: 'c1' });
    await vi.waitFor(() => expect(onOuverte).toHaveBeenCalledTimes(1));
  });

  it('efface le refus précédent quand le montant change', async () => {
    // Un message de refus qui survit à un changement de montant se lit comme
    // un second refus — sur une saisie que le serveur n'a pourtant jamais vue.
    ouvrirCarte.mockResolvedValue({
      ok: false,
      echec: { code: 'MISE_HORS_BORNES', message: 'La mise doit être d’au moins 500 FCFA.' },
    });
    const onOuverte = vi.fn();

    render(
      <ActiverCarte collecteurId={COLLECTEUR} clientId={CLIENT} misePreremplie={5000} identifiant="essai" onOuverte={onOuverte} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la carte/ }));

    expect(await screen.findByRole('alert')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /1\s*000/ }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ne verrouille pas le bloc quand le réseau coupe en pleine écriture', async () => {
    // Un rejet — le réseau tombe en pleine écriture, ce qui arrive debout dans
    // un marché en 3G — laissait `envoi` à vrai pour toujours. Les deux boutons
    // du bloc en dépendent, donc les deux se verrouillaient, et il fallait
    // recharger l'application pour en sortir.
    ouvrirCarte.mockRejectedValue(new Error('Failed to fetch'));
    const onOuverte = vi.fn();

    render(
      <ActiverCarte collecteurId={COLLECTEUR} clientId={CLIENT} misePreremplie={5000} identifiant="essai" onOuverte={onOuverte} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    fireEvent.click(screen.getByRole('button', { name: /Ouvrir la carte/ }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Annuler' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(onOuverte).not.toHaveBeenCalled();
  });

  it('dit ce qui reste vrai après un retrait, quand l’écran le lui donne', () => {
    render(
      <ActiverCarte
        collecteurId={COLLECTEUR}
        clientId={CLIENT}
        misePreremplie={5000}
        identifiant="essai"
        explication="La carte précédente est close. La nouvelle repart de la case 1."
        onOuverte={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));

    expect(
      screen.getByText('La carte précédente est close. La nouvelle repart de la case 1.'),
    ).toBeTruthy();
    // « son solde reste dû au client » : faux une fois l'argent rendu.
    expect(screen.queryByText(/son solde reste dû/)).toBeNull();
  });

  it('garde sa phrase, vraie en milieu comme en fin de cycle, quand on ne lui en donne pas', () => {
    render(
      <ActiverCarte
        collecteurId={COLLECTEUR}
        clientId={CLIENT}
        misePreremplie={5000}
        identifiant="essai"
        onOuverte={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));

    expect(screen.getByText(/son solde reste dû au client/)).toBeTruthy();
  });

  it('se dit replié, puis déplié en désignant son panneau, puis replié de nouveau', () => {
    render(
      <ActiverCarte
        collecteurId={COLLECTEUR}
        clientId={CLIENT}
        misePreremplie={5000}
        identifiant="essai"
        onOuverte={vi.fn()}
      />,
    );

    // C'est un dépli : le bouton reste là, déplié ou non, et le dit. Replié, il
    // ne renvoie vers rien : son panneau n'est pas dans la page.
    const bouton = screen.getByRole('button', { name: 'Activer une carte' });
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
    expect(bouton.hasAttribute('aria-controls')).toBe(false);

    fireEvent.click(bouton);

    expect(bouton.getAttribute('aria-expanded')).toBe('true');
    const panneau = document.getElementById(bouton.getAttribute('aria-controls') ?? '');
    expect(panneau).not.toBeNull();
    expect(
      within(panneau as HTMLElement).getByRole('button', { name: /Ouvrir la carte/ }),
    ).toBeTruthy();

    // Un second toucher le replie.
    fireEvent.click(bouton);

    expect(bouton.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: /Ouvrir la carte/ })).toBeNull();
  });
});
