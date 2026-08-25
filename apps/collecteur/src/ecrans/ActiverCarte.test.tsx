import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  it('ouvre la carte au montant de celle qui vient d’être remplie', async () => {
    const onOuverte = vi.fn();
    render(
      <ActiverCarte clientId={CLIENT} misePreremplie={5000} identifiant="essai" onOuverte={onOuverte} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    // `findBy…` : la lecture de session est asynchrone, et le bouton reste
    // désactivé tant que `collecteurId` est nul.
    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir la carte/ }));

    await vi.waitFor(() => expect(onOuverte).toHaveBeenCalled());
    // Le cas courant est de reprendre au même rythme : le montant est proposé
    // d'entrée, et il suffit de confirmer.
    expect(ouvrirCarte).toHaveBeenCalledWith(COLLECTEUR, CLIENT, 5000);
  });

  it('ouvre la carte au montant choisi quand le collecteur en change', async () => {
    const onOuverte = vi.fn();
    render(
      <ActiverCarte clientId={CLIENT} misePreremplie={5000} identifiant="essai" onOuverte={onOuverte} />,
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
      echec: { code: 'MISE_HORS_BORNES', message: 'La mise doit être comprise entre 500 et 10000 FCFA.' },
    });
    const onOuverte = vi.fn();

    render(
      <ActiverCarte
        clientId={CLIENT}
        misePreremplie={5000}
        identifiant="essai"
        onOuverte={onOuverte}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir la carte/ }));

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
      <ActiverCarte clientId={CLIENT} misePreremplie={5000} identifiant="essai" onOuverte={onOuverte} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir la carte/ }));

    const annuler = screen.getByRole('button', { name: 'Annuler' });
    expect((annuler as HTMLButtonElement).disabled).toBe(true);

    resoudre!({ ok: true, carteId: 'c1' });
    await vi.waitFor(() => expect(onOuverte).toHaveBeenCalledTimes(1));
  });

  it('efface le refus précédent quand le montant change', async () => {
    // Un message de refus qui survit à un changement de montant se lit comme
    // un second refus — sur une saisie que le serveur n'a pourtant jamais vue.
    ouvrirCarte.mockResolvedValue({
      ok: false,
      echec: { code: 'MISE_HORS_BORNES', message: 'La mise doit être comprise entre 500 et 10000 FCFA.' },
    });
    const onOuverte = vi.fn();

    render(
      <ActiverCarte clientId={CLIENT} misePreremplie={5000} identifiant="essai" onOuverte={onOuverte} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir la carte/ }));

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
      <ActiverCarte clientId={CLIENT} misePreremplie={5000} identifiant="essai" onOuverte={onOuverte} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir la carte/ }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Annuler' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(onOuverte).not.toHaveBeenCalled();
  });
});
