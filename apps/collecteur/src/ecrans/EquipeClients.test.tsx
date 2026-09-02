import { formatMontant } from '@kolek/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { viderCache } from '../cache';

/**
 * La tournée d'un coéquipier.
 *
 * Deux propriétés que cet écran est seul à porter :
 *
 * **Le bandeau permanent.** Sans lui, on encaisse chez quelqu'un d'autre sans
 * le savoir — l'écran ressemble trait pour trait à sa propre liste de clients.
 *
 * **Le refus hors ligne, écrit.** Encaisser pour un coéquipier passe par une
 * Edge Function : rien n'entre dans la file de synchro, et rien ne partira à la
 * reconnexion. Un bouton mort sans explication laisserait croire à une panne
 * passagère ; le bandeau générique `BandeauHorsLigne`, lui, promettrait une
 * synchro qui n'aura pas lieu.
 */

afterEach(() => {
  cleanup();
  viderCache();
});

vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'col1' } } }) },
  },
}));

const chargerClientsCollaborateur = vi.fn();
const encaisserPour = vi.fn();

vi.mock('../lectures-ecrans', async (original) => ({
  ...((await original()) as object),
  chargerClientsCollaborateur: (id: string) => chargerClientsCollaborateur(id),
}));

vi.mock('../ecritures-ecrans', async (original) => ({
  ...((await original()) as object),
  encaisserPour: (carteId: string, montant: number) => encaisserPour(carteId, montant),
}));

const { EquipeClients } = await import('./EquipeClients');

const CLIENT = {
  id: 'c1',
  nom: 'Aya Koffi',
  telephone: '+2250700000000',
  cartes: [{ id: 'k1', mise: 2000, misesEncaissees: 12, soldeRestituable: 22000 }],
};

function afficher(enLigne: boolean) {
  render(
    <EquipeClients
      collaborateur={{ id: 'a1', nom: 'Awa Konan' }}
      enLigne={enLigne}
      revision={0}
      onRetour={() => {}}
      onEcriture={() => {}}
    />,
  );
}

describe('la tournée d’un coéquipier', () => {
  it('dit de qui sont ces clients, en permanence', async () => {
    chargerClientsCollaborateur.mockResolvedValue([CLIENT]);
    afficher(true);

    expect(await screen.findByText('Aya Koffi')).toBeTruthy();
    // Sans ce bandeau, l'écran est indiscernable de sa propre liste de clients.
    expect(document.body.textContent).toContain('Awa Konan');
  });

  it('demande l’identifiant du collaborateur, et pas un autre', async () => {
    chargerClientsCollaborateur.mockResolvedValue([CLIENT]);
    afficher(true);

    expect(await screen.findByText('Aya Koffi')).toBeTruthy();
    expect(chargerClientsCollaborateur).toHaveBeenCalledWith('a1');
  });

  it('montre la mise de chaque carte active', async () => {
    chargerClientsCollaborateur.mockResolvedValue([CLIENT]);
    afficher(true);

    expect(await screen.findByText('Aya Koffi')).toBeTruthy();
    expect(document.body.textContent).toContain(formatMontant(2000));
    expect(document.body.textContent).toContain('12');
  });

  it('désactive l’encaissement hors ligne, et écrit la raison', async () => {
    chargerClientsCollaborateur.mockResolvedValue([CLIENT]);
    afficher(false);

    expect(await screen.findByText('Aya Koffi')).toBeTruthy();
    const bouton = screen.getAllByRole('button').find((b) => b.textContent?.includes('Encaisser'));
    expect(bouton).toBeTruthy();
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    // Un bouton mort sans explication est pire qu'un bouton absent.
    expect(document.body.textContent).toContain('demande une connexion');
  });

  it('ne promet pas une synchro qui n’aura pas lieu', async () => {
    chargerClientsCollaborateur.mockResolvedValue([CLIENT]);
    afficher(false);

    expect(await screen.findByText('Aya Koffi')).toBeTruthy();
    // `BandeauHorsLigne` dit « les encaissements seront synchronisés dès
    // connexion ». C'est vrai de la tournée du collecteur, et faux ici : cet
    // encaissement passe par une Edge Function et n'entre dans aucune file.
    expect(document.body.textContent).not.toContain('synchronisés dès connexion');
  });

  it('dit l’absence de client sans la présenter comme une panne', async () => {
    chargerClientsCollaborateur.mockResolvedValue([]);
    afficher(true);

    // Ancré sur le message lui-même : le nom du coéquipier apparaît deux fois,
    // dans l'en-tête qui défile et dans le bandeau qui reste.
    expect(await screen.findByText(/Aucun client pour l/)).toBeTruthy();
  });
});
