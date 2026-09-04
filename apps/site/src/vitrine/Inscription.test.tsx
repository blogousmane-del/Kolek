import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Inscription } from './Inscription';
import { envoyerDemande } from './demande';

// `globals` n'est pas activé : sans cet appel, chaque rendu s'ajoute au
// précédent et les requêtes trouvent deux champs du même nom.
afterEach(cleanup);

// La vitrine anime son entrée avec GSAP, qui mesure des éléments que jsdom ne
// dispose pas. L'animation n'est pas ce qu'on teste ici.
vi.mock('./animation', () => ({
  entree: vi.fn(),
  useAnimations: () => ({ current: null }),
}));

// Seul l'envoi est simulé : `palierDepuisAdresse` reste le vrai, sans quoi le
// palier de départ du formulaire ne serait plus celui que le module décide.
vi.mock('./demande', async (original) => ({
  ...((await original()) as object),
  envoyerDemande: vi.fn(),
}));

const envoi = envoyerDemande as ReturnType<typeof vi.fn>;

beforeEach(() => {
  envoi.mockResolvedValue({ ok: true });
  // `window.location` est remplacée en entier : jsdom ne laisse pas espionner
  // `assign` sur la vraie, et le formulaire s'en sert pour partir chez le
  // fournisseur de paiement. `search` doit y figurer — le palier de départ s'y
  // lit au premier rendu.
  vi.stubGlobal('location', { ...window.location, search: '', assign: vi.fn() });
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  envoi.mockReset();
  vi.unstubAllGlobals();
});

/** Choisit un palier par le nom affiché sur sa vignette. */
function choisirPalier(nom: string) {
  fireEvent.click(screen.getByRole('button', { pressed: false, name: new RegExp(nom, 'i') }));
}

describe('le formulaire d’ouverture', () => {
  it('demande une adresse électronique', () => {
    // Le manque du 2026-08-27 : la demande arrivait sur le serveur sans aucun
    // moyen d'ouvrir le compte autrement qu'en rappelant.
    render(<Inscription />);

    const champ = screen.getByLabelText(/adresse e-mail/i) as HTMLInputElement;
    expect(champ.type).toBe('email');
    expect(champ.required).toBe(true);
  });

  it('garde le nom et le numéro obligatoires', () => {
    render(<Inscription />);

    expect((screen.getByLabelText(/nom complet/i) as HTMLInputElement).required).toBe(true);
    expect((screen.getByLabelText(/ton numéro/i) as HTMLInputElement).required).toBe(true);
  });

  it('laisse la zone et le message facultatifs', () => {
    render(<Inscription />);

    expect((screen.getByLabelText(/zone de collecte/i) as HTMLInputElement).required).toBe(false);
    expect(
      (screen.getByLabelText(/un mot sur ton activité/i) as HTMLTextAreaElement).required,
    ).toBe(false);
  });

  it('ne promet plus que seuls le nom, le numéro et la zone partent', () => {
    // La phrase sous le bouton disait « Nom, numéro et zone uniquement ». Elle
    // est devenue fausse le jour où le champ e-mail est apparu, et une promesse
    // fausse sur une page qui collecte des données personnelles est pire qu'une
    // promesse absente.
    render(<Inscription />);

    expect(screen.queryByText(/nom, numéro et zone uniquement/i)).toBeNull();
    expect(screen.getByText(/aucun mot de passe/i)).toBeTruthy();
  });

  it('n’éteint l’anneau de focus sur aucun de ses champs', () => {
    // La règle du 2026-08-23 : l'anneau vit dans `packages/core/src/base.css`,
    // sur `:focus-visible`, et aucun composant n'a le droit de l'éteindre.
    // `Champ.test.tsx` et `ChampTelephone.test.tsx` la font respecter côté
    // application. Personne ne la surveillait sur la vitrine — et les cinq
    // champs de cette page l'éteignaient depuis leur écriture, sur un
    // formulaire qui demande un numéro, une adresse et un mot de passe.
    const { container } = render(<Inscription />);
    // Le palier payant, pour que le champ mot de passe existe lui aussi.
    choisirPalier('Pro');

    const controles = container.querySelectorAll('input, select, textarea');
    // Garde-fou du garde-fou : une requête qui ne trouverait plus rien
    // passerait cette boucle sans rien vérifier.
    expect(controles.length).toBeGreaterThanOrEqual(5);
    for (const controle of controles) {
      expect(controle.className).not.toContain('outline-none');
    }
  });
});

describe('la ligne du numéro : deux contrôles, deux pistes', () => {
  /**
   * Le défaut du 2026-09-04, visible à l'œil sur la page en ligne : le pays
   * occupait toute la ligne et le numéro se repliait sur un carré de 44 px.
   *
   * jsdom ne calcule aucune mise en page — aucun test ici ne peut mesurer une
   * largeur en pixels. Ce qui est mesurable, c'est la **cause** : deux
   * utilitaires de largeur posés sur le même élément, dont l'un annule l'autre
   * selon un ordre que la chaîne de classes ne décide pas.
   */

  it('ne pose jamais deux largeurs sur le même contrôle', () => {
    render(<Inscription />);

    for (const controle of [
      screen.getByLabelText('Pays'),
      screen.getByLabelText(/ton numéro/i),
    ]) {
      const largeurs = controle.className.split(/\s+/).filter((classe) => /^w-/.test(classe));
      // Celle de `CHAMP_SOMBRE`, et elle seule. `w-32` ajoutée à côté rendait
      // ['w-full', 'w-32'] — et c'est la feuille Tailwind qui tranchait.
      expect(largeurs).toEqual(['w-full']);
    }
  });

  it('donne au pays une piste fixe et au numéro tout le reste', () => {
    render(<Inscription />);

    const pistePays = screen.getByLabelText('Pays').parentElement;
    const pisteNumero = screen.getByLabelText(/ton numéro/i).parentElement;

    expect(pistePays?.className).toMatch(/\bw-32\b/);
    expect(pistePays?.className).toMatch(/\bshrink-0\b/);
    expect(pisteNumero?.className).toMatch(/\bflex-1\b/);
    // Sans `min-w-0`, la largeur minimale d'un élément flex est son contenu.
    expect(pisteNumero?.className).toMatch(/\bmin-w-0\b/);
  });
});

describe('le palier payant : payer vaut accord', () => {
  /**
   * Depuis l'amendement du 2026-09-03, un palier payant ne mène plus à un
   * rappel : il mène au paiement, et le règlement confirmé ouvre le compte.
   * Le mot de passe se choisit donc **avant** de payer — le refuser après
   * l'encaissement serait le pire moment possible.
   */

  it('ne demande pas de mot de passe pour un essai', () => {
    // Aucun compte ne naîtra de cette demande seule : garder une empreinte dont
    // personne ne se servira serait un secret gardé pour rien.
    render(<Inscription />);

    expect(screen.queryByLabelText(/mot de passe/i)).toBeNull();
  });

  it('en demande un dès qu’un palier payant est choisi', () => {
    render(<Inscription />);

    choisirPalier('Pro');

    const champ = screen.getByLabelText(/mot de passe/i) as HTMLInputElement;
    expect(champ.type).toBe('password');
    expect(champ.required).toBe(true);
    expect(champ.autocomplete).toBe('new-password');
  });

  it('cesse de promettre « aucun mot de passe, aucun paiement »', () => {
    // La promesse est vraie pour un essai et fausse pour un palier payant. Une
    // promesse devenue fausse est pire qu'une promesse absente, sur une page qui
    // collecte des données personnelles.
    render(<Inscription />);
    expect(screen.getByText(/aucun mot de passe/i)).toBeTruthy();

    choisirPalier('Pro');

    expect(screen.queryByText(/aucun mot de passe/i)).toBeNull();
  });

  it('annonce le paiement sur le bouton, plutôt qu’un envoi', () => {
    render(<Inscription />);

    choisirPalier('Pro');

    expect(screen.getByRole('button', { name: /payer et ouvrir mon compte/i })).toBeTruthy();
  });
});

describe('ce que le formulaire envoie', () => {
  it('sépare le pays du numéro national, et compose l’E.164', async () => {
    // Le fournisseur de paiement veut les deux morceaux séparés : un E.164 brut
    // lui revient en « 400 Invalid phone number ». Le serveur reçoit les trois
    // formes et tranche lui-même.
    render(<Inscription />);

    fireEvent.change(screen.getByLabelText(/nom complet/i), { target: { value: 'Mariam Koné' } });
    fireEvent.change(screen.getByLabelText(/ton numéro/i), { target: { value: '07 01 02 03 04' } });
    fireEvent.change(screen.getByLabelText(/adresse e-mail/i), {
      target: { value: 'mariam@example.ci' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /envoyer ma demande/i }));

    await waitFor(() => expect(envoi).toHaveBeenCalled());
    // Le zéro reste : il fait partie du numéro ivoirien depuis le 31 janvier
    // 2021. Ce test attendait `+225701020304`, neuf chiffres — la forme même que
    // Chariow refusait en « 400 Invalid phone number », et que le commentaire
    // ci-dessus donne pourtant comme le symptôme à éviter.
    expect(envoi.mock.calls[0][0]).toMatchObject({
      telephone: '+2250701020304',
      paysTelephone: 'CI',
      telephoneLocal: '07 01 02 03 04',
    });
  });

  it('n’emporte aucun mot de passe pour un essai', async () => {
    render(<Inscription />);

    fireEvent.change(screen.getByLabelText(/nom complet/i), { target: { value: 'Adama' } });
    fireEvent.change(screen.getByLabelText(/ton numéro/i), { target: { value: '0701020304' } });
    fireEvent.change(screen.getByLabelText(/adresse e-mail/i), {
      target: { value: 'adama@example.ci' },
    });
    fireEvent.submit(screen.getByRole('button', { name: /envoyer ma demande/i }));

    await waitFor(() => expect(envoi).toHaveBeenCalled());
    expect(envoi.mock.calls[0][0].motDePasse).toBe('');
  });
});

describe('ce que le formulaire fait de la réponse', () => {
  it('part chez le fournisseur quand un lien de paiement revient', async () => {
    envoi.mockResolvedValue({ ok: true, checkoutUrl: 'https://pay.test/v_42' });
    render(<Inscription />);

    choisirPalier('Pro');
    fireEvent.submit(screen.getByRole('button', { name: /payer et ouvrir mon compte/i }));

    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith('https://pay.test/v_42'));
    // Et surtout pas l'écran « GTCS te rappelle » : personne ne rappellera, le
    // compte naîtra du règlement.
    expect(screen.queryByText(/demande enregistrée/i)).toBeNull();
  });

  it('affiche la confirmation quand il n’y a rien à payer', async () => {
    envoi.mockResolvedValue({ ok: true });
    render(<Inscription />);

    fireEvent.submit(screen.getByRole('button', { name: /envoyer ma demande/i }));

    expect(await screen.findByText(/demande enregistrée/i)).toBeTruthy();
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('ne redirige pas sur un refus, et montre la phrase du serveur', async () => {
    envoi.mockResolvedValue({ ok: false, message: 'Ce mot de passe figure dans une fuite connue.' });
    render(<Inscription />);

    choisirPalier('Pro');
    fireEvent.submit(screen.getByRole('button', { name: /payer et ouvrir mon compte/i }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/fuite connue/i);
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});
