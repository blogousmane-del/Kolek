import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Abonnement } from './Abonnement';
import { demarrerPaiement } from '../abonnement';
import { URL_CONDITIONS, URL_CONFIDENTIALITE, VERSION_CONDITIONS } from '../version-conditions';

vi.mock('../abonnement', () => ({
  demarrerPaiement: vi.fn().mockResolvedValue({ ok: false, message: 'arrêt' }),
}));

// Sans ce nettoyage, un rendu laissé par l'épreuve précédente reste dans le
// document : `getByLabelText('Numéro Mobile Money')` trouve alors deux
// entrées et échoue par un « Found multiple elements » qui n'a rien à voir
// avec ce que l'épreuve mesure. Même garde que `Clients.test.tsx` et
// `ChampTelephone.test.tsx`.
afterEach(cleanup);

// Pas de `@testing-library/jest-dom` dans ce dépôt : ni ce module ni son
// enregistrement de matchers ne figurent dans `apps/collecteur` (vérifié —
// absent de `node_modules/@testing-library`, et aucun test voisin ne s'en
// sert). Les épreuves du dossier lisent `.disabled` et `.getAttribute('href')`
// directement — voir `ActiverCarte.test.tsx`, `Retrait.test.tsx`,
// `FicheClient.test.tsx` — et ce fichier suit la même convention plutôt que
// `toBeDisabled` / `toHaveAttribute`.

/** Un numéro que `ChampTelephone` déclare valide, saisi comme les épreuves
    voisines le font (`ChampTelephone.test.tsx`) : par `fireEvent.change` sur
    le libellé du champ, jamais en supposant le champ déjà rempli.
    Volontairement différent du « 0700000000 » que `departDuChamp` préremplit
    depuis `telephoneCollecteur` : un `fireEvent.change` qui repose la même
    valeur que celle déjà présente dans le DOM ne déclenche pas `onChange`
    (mesuré — voir le rapport), et l'épreuve resterait fausse-verte. */
function saisirTelephoneValide() {
  fireEvent.change(screen.getByLabelText('Numéro Mobile Money'), {
    target: { value: '0711223344' },
  });
}

describe('Abonnement', () => {
  it('ne laisse pas payer sans avoir accepté les conditions', async () => {
    render(<Abonnement palierCourant="essai" telephoneCollecteur="+2250700000000" onRetour={() => {}} />);
    // Un numéro valide à lui seul rendrait le bouton actif avant ce chantier :
    // sans cette saisie, l'épreuve resterait verte même sans la case, parce que
    // le téléphone de départ n'est jamais tenu pour valide tant que le champ n'a
    // pas remonté sa propre lecture (`departDuChamp`, `Abonnement.tsx`).
    saisirTelephoneValide();

    const payer = screen.getByRole('button', { name: /payer/i }) as HTMLButtonElement;
    // C'est le moment où le contrat se forme pour un collecteur déjà en place :
    // le rattrapage se fait ici, au renouvellement, et non par un écran
    // bloquant au démarrage.
    expect(payer.disabled).toBe(true);
  });

  it('renvoie vers les deux textes par une adresse absolue', () => {
    render(<Abonnement palierCourant="essai" telephoneCollecteur="+2250700000000" onRetour={() => {}} />);

    // L'application vit sur app.kolek.cash : un chemin relatif comme
    // `/conditions` mènerait ici à une page qui n'existe pas.
    expect(screen.getByRole('link', { name: /conditions générales/i }).getAttribute('href')).toBe(
      URL_CONDITIONS,
    );
    expect(
      screen.getByRole('link', { name: /politique de confidentialité/i }).getAttribute('href'),
    ).toBe(URL_CONFIDENTIALITE);
  });

  it('envoie la version acceptée avec le paiement', async () => {
    render(<Abonnement palierCourant="essai" telephoneCollecteur="+2250700000000" onRetour={() => {}} />);
    saisirTelephoneValide();

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /payer/i }));

    expect(vi.mocked(demarrerPaiement)).toHaveBeenCalledWith(
      expect.objectContaining({ version: VERSION_CONDITIONS }),
    );
  });
});
