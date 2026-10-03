import { formatMontant, soldeRestituable } from '@kolek/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COLLECTEUR,
  INSTANT,
  carte as carteLocale,
  client,
  operationMise,
  tournee,
} from '../hors-ligne/fabriques';
import type { MiseLocale } from '../hors-ligne/modele';
import { TourneeAbsente } from '../hors-ligne/vues';

/**
 * L'encaissement, en trois temps : choisir la carte, confirmer, encaissé.
 *
 * Ce que ces épreuves gardent du fichier d'avant (2026-08-26) : le serveur
 * **accepte** deux mises le même jour sur la même carte. `mises_avant_insert`
 * refuse un doublon d'identifiant, une carte clôturée, un cycle complet et un
 * montant faux — pas une seconde mise. Après le succès, l'écran ne doit donc
 * plus offrir le geste : le bouton n'est plus rendu du tout.
 *
 * Ce qu'elles ajoutent : le tampon dit où en est la mise, et il ne ment pas.
 * GARDÉE tant qu'elle attend sur le téléphone, ENCAISSÉ une fois partie, rien
 * du tout si le serveur l'a refusée.
 */

const enregistrerMise = vi.fn();

vi.mock('../ecritures', () => ({
  enregistrerMise: (...args: unknown[]) => enregistrerMise(...args),
}));

// La file du téléphone, réglée par chaque épreuve : elle décide du tampon, et
// des cartes du premier temps.
let etatHorsLigne: Record<string, unknown> = {};
const horsLigne = (reste: Record<string, unknown> = {}) => ({
  operations: [],
  refus: [],
  tournee: null,
  file: null,
  stockage: 'persistant',
  ...reste,
});

vi.mock('../hors-ligne/useHorsLigne', () => ({ useHorsLigne: () => etatHorsLigne }));

const { Encaisser } = await import('./Encaisser');

const CARTE = { carteId: 'k7', clientNom: 'Hj', mise: 1000, misesEncaissees: 17 };
const ECRITE = { ok: true, miseId: 'abcdef1234', operationId: 'op-9' };

beforeEach(() => {
  etatHorsLigne = horsLigne();
});

afterEach(() => {
  cleanup();
  enregistrerMise.mockReset();
});

function ecran(supplement: Record<string, unknown> = {}) {
  return (
    <Encaisser
      collecteurId="col1"
      carte={CARTE}
      onChoisir={vi.fn()}
      onNaviguer={vi.fn()}
      onEncaisse={vi.fn()}
      onRecus={vi.fn()}
      {...supplement}
    />
  );
}

function rendre(supplement: Record<string, unknown> = {}) {
  return render(ecran(supplement));
}

/** Le bouton du geste. Son nom porte le client : la barre du bas a aussi son « Encaisser ». */
function bouton() {
  return screen.getByRole('button', { name: /sur la carte de Hj$/ }) as HTMLButtonElement;
}

/** La ligne d'état, phrase par phrase. */
async function lignesEtat() {
  const etat = await screen.findByRole('status');
  return [...etat.querySelectorAll('p')].map((p) => p.textContent);
}

function tampon() {
  return document.querySelector('[data-tampon]')?.getAttribute('data-tampon') ?? null;
}

describe('temps 1, choisir la carte', () => {
  const TOURNEE = tournee({
    clients: [
      { ...client('c1', 'Mariam Traoré'), marche: 'Adjamé' },
      { ...client('c2', 'Aya Koffi'), marche: 'Treichville', telephone: '07 08 09 10 11' },
      client('c3', 'Rokia Sangaré'),
    ],
    cartes: [
      carteLocale('k2', 'c2', { misesEncaissees: 27 }),
      carteLocale('k1', 'c1', { mise: 2000, misesEncaissees: 29 }),
      carteLocale('k3', 'c3', { misesEncaissees: 31 }),
    ],
  });

  function lignes() {
    return within(screen.getByRole('list', { name: 'Cartes à encaisser' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
  }

  function chercher(terme: string) {
    fireEvent.change(screen.getByRole('textbox', { name: 'Chercher une carte' }), {
      target: { value: terme },
    });
  }

  it('propose les cartes actives, les plus avancées d’abord, sans les pleines', () => {
    etatHorsLigne = horsLigne({ tournee: TOURNEE });
    rendre({ carte: null });

    expect(screen.getByText('Choisis la carte du client.')).toBeTruthy();
    const l = lignes();
    expect(l).toHaveLength(2);
    expect(l[0]).toMatch(/^Mariam Traoré/);
    expect(l[1]).toMatch(/^Aya Koffi/);
  });

  it('choisit une carte d’un seul geste', () => {
    etatHorsLigne = horsLigne({ tournee: TOURNEE });
    const onChoisir = vi.fn();
    rendre({ carte: null, onChoisir });

    fireEvent.click(screen.getByRole('button', { name: /^Mariam Traoré/ }));

    expect(onChoisir).toHaveBeenCalledWith({
      carteId: 'k1',
      clientNom: 'Mariam Traoré',
      mise: 2000,
      misesEncaissees: 29,
    });
  });

  it('cherche par marché comme par numéro', () => {
    etatHorsLigne = horsLigne({ tournee: TOURNEE });
    rendre({ carte: null });

    chercher('treich');
    expect(lignes()).toHaveLength(1);
    expect(lignes()[0]).toMatch(/^Aya Koffi/);

    chercher('0809');
    expect(lignes()).toHaveLength(1);
    expect(lignes()[0]).toMatch(/^Aya Koffi/);
  });

  it('dit quand la recherche ne trouve rien', () => {
    etatHorsLigne = horsLigne({ tournee: TOURNEE });
    rendre({ carte: null });

    chercher('zzz');

    expect(screen.getByText('Aucune carte ne correspond.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Cartes à encaisser' })).toBeNull();
  });

  it('mène aux clients quand aucune carte n’attend de mise', () => {
    etatHorsLigne = horsLigne({ tournee: tournee() });
    const onNaviguer = vi.fn();
    rendre({ carte: null, onNaviguer });

    expect(screen.getByText('Aucune carte à encaisser')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Voir mes clients' }));
    expect(onNaviguer).toHaveBeenCalledWith('clients');
  });

  it('dit que la tournée manque, plutôt qu’une liste vide', () => {
    etatHorsLigne = horsLigne({ tournee: tournee({ lueLe: null }) });
    rendre({ carte: null });

    expect(screen.getByRole('alert').textContent).toBe(new TourneeAbsente().message);
  });

  it('n’affirme rien tant que la tournée n’est pas lue', () => {
    rendre({ carte: null });

    expect(screen.queryByRole('list', { name: 'Cartes à encaisser' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Aucune carte à encaisser')).toBeNull();
  });
});

describe('temps 2, confirmer', () => {
  it('dit la case, le montant et le solde après, avant le geste', () => {
    rendre();

    expect(screen.getByText(/^Mise du jour, case/).textContent).toBe('Mise du jour, case 18');
    expect(screen.getByText(/^Solde après/).textContent).toBe(
      `Solde après ${formatMontant(soldeRestituable(18, 1000))} FCFA`,
    );
    expect(screen.getByText('Montant fixé à l’ouverture de la carte.')).toBeTruthy();
  });

  it('cercle la prochaine case de la carte', () => {
    rendre();

    expect(document.querySelectorAll('[data-etat]')[17]?.getAttribute('data-etat')).toBe(
      'prochaine',
    );
  });

  it('revient à la liste des cartes, et non aux clients', () => {
    const onChoisir = vi.fn();
    const onNaviguer = vi.fn();
    rendre({ onChoisir, onNaviguer });

    fireEvent.click(screen.getByRole('button', { name: 'Revenir à la liste des cartes' }));

    expect(onChoisir).toHaveBeenCalledWith(null);
    expect(onNaviguer).not.toHaveBeenCalled();
  });

  it('n’arme pas le bouton sur une carte pleine, et dit pourquoi', () => {
    rendre({ carte: { ...CARTE, misesEncaissees: 31 } });

    expect(bouton().disabled).toBe(true);
    expect(
      screen.getByText('Le cycle de 31 mises est complet. La carte doit être clôturée.'),
    ).toBeTruthy();
    // Une case 32 n'existe pas : le bloc de caisse ne l'annonce pas.
    expect(screen.queryByText(/^Mise du jour/)).toBeNull();
  });

  it('écrit la mise de la carte, à l’heure de l’appui', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());
    await screen.findByRole('status');

    expect(enregistrerMise).toHaveBeenCalledWith('col1', 'k7', 1000, expect.any(Date));
  });

  it('n’écrit qu’une fois sous deux appuis rapprochés', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    const b = bouton();
    fireEvent.click(b);
    fireEvent.click(b);
    await screen.findByRole('status');

    expect(enregistrerMise).toHaveBeenCalledTimes(1);
  });

  it('laisse le bouton armé quand la mise a échoué', async () => {
    enregistrerMise.mockResolvedValue({
      ok: false,
      echec: { code: 'RESEAU', message: 'Le réseau a coupé.' },
    });
    rendre();

    fireEvent.click(bouton());

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Le réseau a coupé.');
    // Rien n'est écrit, donc rien à protéger : le collecteur doit pouvoir
    // réessayer sans quitter l'écran.
    expect(bouton().disabled).toBe(false);
  });
});

describe('temps 3, encaissé', () => {
  it('pose le tampon GARDÉE tant que la mise attend sur le téléphone', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());

    expect(await lignesEtat()).toEqual([
      `${formatMontant(1000)} FCFA pour Hj, case 18.`,
      'Gardée sur ce téléphone, elle partira avec le réseau.',
      'Reçu n° ABCDEF12',
    ]);
    expect(tampon()).toBe('Gardée');
  });

  it('remplit la case écrite, et elle seule', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());
    await screen.findByRole('status');

    const etats = [...document.querySelectorAll('[data-etat]')].map((c) =>
      c.getAttribute('data-etat'),
    );
    expect(etats[17]).toBe('neuve');
    expect(etats.filter((e) => e === 'neuve')).toHaveLength(1);
  });

  it('passe à ENCAISSÉ quand la mise est partie', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    const { rerender } = rendre();

    fireEvent.click(bouton());
    await screen.findByRole('status');

    // L'opération a quitté la file ; la mise est dans la tournée relue.
    const partie: MiseLocale = {
      id: 'abcdef1234',
      carteId: 'k7',
      montant: 1000,
      encaisseLe: INSTANT,
      encaissePar: COLLECTEUR,
      estCommission: false,
    };
    etatHorsLigne = horsLigne({ tournee: tournee({ mises: [partie] }) });
    rerender(ecran());

    expect(tampon()).toBe('Encaissé');
    expect((await lignesEtat())[1]).toBe('Envoyée.');
  });

  it('ne tamponne pas une mise refusée, et ne lui donne pas de reçu', async () => {
    etatHorsLigne = horsLigne({
      operations: [operationMise(9, { carteId: 'k7' }, { etat: 'refusee_a_consigner' })],
    });
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());

    expect(await lignesEtat()).toEqual([
      `${formatMontant(1000)} FCFA pour Hj, case 18.`,
      'Le serveur a refusé cette mise. Le détail est dans les alertes.',
    ]);
    expect(tampon()).toBeNull();
    // La carte est là, mais sa case 18 ne se remplit pas.
    expect(document.querySelectorAll('[data-etat]')).toHaveLength(31);
    expect(document.querySelector('[data-etat="neuve"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reçu' })).toBeNull();
  });

  it('ne laisse plus de bouton Encaisser : un second appui écrirait une seconde mise', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());
    await screen.findByRole('status');

    expect(screen.queryByRole('button', { name: /sur la carte de Hj$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Encaisser/ })).toBeNull();
  });

  it('prévient la coquille, puis mène au client suivant ou à ses reçus', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    const onEncaisse = vi.fn();
    const onChoisir = vi.fn();
    const onRecus = vi.fn();
    rendre({ onEncaisse, onChoisir, onRecus });

    fireEvent.click(bouton());
    await screen.findByRole('status');

    expect(onEncaisse).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Client suivant' }));
    expect(onChoisir).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Reçu' }));
    expect(onRecus).toHaveBeenCalledWith('Hj');
  });
});
