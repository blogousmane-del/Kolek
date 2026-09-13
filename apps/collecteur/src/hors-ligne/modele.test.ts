import { describe, expect, it } from 'vitest';

import { operationClientCarte, operationMise } from './fabriques';
import { chargeUtileDe, delaiApres, tourneeVide } from './modele';

describe('les délais entre deux essais (§5.3)', () => {
  it('suivent 30 s, 1 min, 2 min, 5 min, puis 10 min', () => {
    expect([1, 2, 3, 4, 5, 6, 40].map(delaiApres)).toEqual([
      30_000, 60_000, 120_000, 300_000, 600_000, 600_000, 600_000,
    ]);
  });

  it('séparent la première tentative de la cinquième de 8 min 30 s au plus (§6.6)', () => {
    expect(delaiApres(1) + delaiApres(2) + delaiApres(3) + delaiApres(4)).toBe(510_000);
  });

  it('traitent zéro échec comme un premier échec', () => {
    expect(delaiApres(0)).toBe(30_000);
  });
});

describe('la tournée vide', () => {
  it('n’a jamais été lue', () => {
    expect(tourneeVide()).toEqual({
      clients: [],
      cartes: [],
      mises: [],
      retraits: [],
      caisses: [],
      lueLe: null,
    });
  });

  it('est un objet neuf à chaque appel', () => {
    const a = tourneeVide();
    a.clients.push({
      id: 'x',
      nom: 'x',
      telephone: null,
      marche: null,
      activite: null,
      avisActifs: false,
    });
    expect(tourneeVide().clients).toEqual([]);
  });
});

describe('la charge consignée (§6.5)', () => {
  it('garde la charge intacte, et ce qui permet de la rejouer', () => {
    const op = operationMise(4, { carteId: 'k1' }, { dependDe: ['op-2'] });

    expect(chargeUtileDe(op)).toEqual({
      version: 1,
      type: 'mise',
      charge: op.charge,
      faiteLe: op.faiteLe,
      sequence: 4,
      dependDe: ['op-2'],
    });
  });

  it('garde l’avancement d’une inscription : le client a pu arriver sans sa carte', () => {
    const op = operationClientCarte(
      1,
      { clientId: 'c1', carteId: 'k1' },
      { etapes: { client: true, carte: false } },
    );

    expect(chargeUtileDe(op).etapes).toEqual({ client: true, carte: false });
  });

  it('tient loin sous la borne du serveur, pour la plus longue saisie permise', () => {
    // `length(charge_utile::text) <= 8192`. Le texte d'un jsonb ajoute une
    // espace après chaque `:` et chaque `,` : on garde une marge d'un facteur
    // quatre plutôt que de recopier ce format.
    const op = operationClientCarte(1, {
      clientId: '11111111-1111-4111-8111-111111111111',
      carteId: '22222222-2222-4222-8222-222222222222',
      nom: 'é'.repeat(120),
    });
    op.charge.client.telephone = '9'.repeat(32);
    op.charge.client.marche = 'm'.repeat(80);
    op.charge.client.activite = 'a'.repeat(80);

    expect(JSON.stringify(chargeUtileDe(op)).length).toBeLessThan(8192 / 4);
  });
});
