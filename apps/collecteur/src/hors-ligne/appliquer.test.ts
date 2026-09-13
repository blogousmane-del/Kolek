import { describe, expect, it } from 'vitest';

import { appliquer, reappliquer } from './appliquer';
import {
  INSTANT,
  caisse,
  carte,
  client,
  operationCaisse,
  operationCarte,
  operationClientCarte,
  operationMise,
  tournee,
} from './fabriques';

describe('une mise', () => {
  it('s’ajoute, et la carte gagne son jour', () => {
    const t = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 4 })] });

    const apres = appliquer(t, operationMise(1, { carteId: 'k1' }));

    expect(apres.cartes[0]!.misesEncaissees).toBe(5);
    expect(apres.mises).toEqual([
      { id: 'mise-1', carteId: 'k1', montant: 1000, encaisseLe: INSTANT, estCommission: false },
    ]);
  });

  it('marque la première mise d’une carte comme commission, provisoirement', () => {
    const t = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')] });

    expect(appliquer(t, operationMise(1, { carteId: 'k1' })).mises[0]!.estCommission).toBe(true);
  });

  it('ne compte pas deux fois une mise que l’instantané porte déjà', () => {
    // La réponse s'est perdue, la tournée a été relue : le serveur a la mise et
    // la file aussi. Le compteur du serveur l'inclut déjà.
    const t = tournee({
      clients: [client('c1')],
      cartes: [carte('k1', 'c1', { misesEncaissees: 5 })],
      mises: [{ id: 'mise-1', carteId: 'k1', montant: 1000, encaisseLe: INSTANT, estCommission: false }],
    });

    const apres = appliquer(t, operationMise(1, { carteId: 'k1' }));

    expect(apres.cartes[0]!.misesEncaissees).toBe(5);
    expect(apres.mises).toHaveLength(1);
  });

  it('laisse la tournée telle quelle sur une carte absente, clôturée ou pleine', () => {
    const t = tournee({
      clients: [client('c1')],
      cartes: [
        carte('close', 'c1', { statut: 'cloturee', clotureeLe: INSTANT }),
        carte('pleine', 'c1', { misesEncaissees: 31 }),
      ],
    });

    for (const carteId of ['absente', 'close', 'pleine']) {
      expect(appliquer(t, operationMise(1, { carteId }))).toEqual(t);
    }
  });
});

describe('une inscription', () => {
  it('ajoute le client et sa carte, à zéro mise', () => {
    const apres = appliquer(tournee(), operationClientCarte(1, { clientId: 'c1', carteId: 'k1', mise: 2000 }));

    expect(apres.clients.map((c) => c.id)).toEqual(['c1']);
    expect(apres.cartes).toEqual([carte('k1', 'c1', { mise: 2000 })]);
  });

  it('n’ajoute rien deux fois', () => {
    const op = operationClientCarte(1, { clientId: 'c1', carteId: 'k1' });

    const deuxFois = appliquer(appliquer(tournee(), op), op);

    expect(deuxFois.clients).toHaveLength(1);
    expect(deuxFois.cartes).toHaveLength(1);
  });
});

describe('une carte de plus', () => {
  it('s’ajoute au client', () => {
    const apres = appliquer(tournee({ clients: [client('c1')] }), operationCarte(1, { carteId: 'k2', clientId: 'c1' }));

    expect(apres.cartes.map((c) => c.id)).toEqual(['k2']);
  });

  it('ne s’ajoute pas à un client que la tournée ne connaît pas', () => {
    expect(appliquer(tournee(), operationCarte(1, { carteId: 'k2', clientId: 'inconnu' })).cartes).toEqual([]);
  });
});

describe('une déclaration de caisse', () => {
  it('crée la ligne du jour quand il n’y en a pas', () => {
    const apres = appliquer(tournee(), operationCaisse(1, { id: 'd1', cashDeclare: 5000 }));

    expect(apres.caisses).toEqual([
      { id: 'd1', date: '2026-09-13', cashAttendu: null, cashDeclare: 5000, ecart: null },
    ]);
  });

  it('remplace la déclaration de la ligne existante, et oublie un écart devenu faux', () => {
    const t = tournee({ caisses: [caisse({ cashDeclare: 3000, cashAttendu: 3000, ecart: 0 })] });

    const apres = appliquer(t, operationCaisse(1, { cashDeclare: 5000 }));

    expect(apres.caisses).toEqual([
      { id: 'caisse-serveur', date: '2026-09-13', cashAttendu: 3000, cashDeclare: 5000, ecart: null },
    ]);
  });
});

describe('réappliquer la file sur un instantané (§9.1)', () => {
  it('suit la séquence, pas l’ordre du tableau', () => {
    const file = [
      operationMise(2, { carteId: 'k1' }),
      operationClientCarte(1, { clientId: 'c1', carteId: 'k1' }),
    ];

    const apres = reappliquer(tournee(), file);

    expect(apres.cartes[0]!.misesEncaissees).toBe(1);
  });

  it('ignore une opération refusée : elle n’est pas faite', () => {
    const t = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 3 })] });

    const apres = reappliquer(t, [
      operationMise(1, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' }),
    ]);

    expect(apres.cartes[0]!.misesEncaissees).toBe(3);
  });

  it('sur un instantané plus ancien, ne perd aucune mise et ne fait reculer aucun compteur', () => {
    const ancien = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 2 })] });
    const file = [1, 2, 3].map((n) => operationMise(n, { carteId: 'k1' }));

    const apres = reappliquer(ancien, file);

    expect(apres.cartes[0]!.misesEncaissees).toBe(5);
    expect(apres.mises.map((m) => m.id)).toEqual(['mise-1', 'mise-2', 'mise-3']);
  });

  it('sur un instantané plus récent qui porte déjà une opération, ne la compte pas deux fois', () => {
    const recent = tournee({
      clients: [client('c1')],
      cartes: [carte('k1', 'c1', { misesEncaissees: 3 })],
      mises: [{ id: 'mise-1', carteId: 'k1', montant: 1000, encaisseLe: INSTANT, estCommission: false }],
    });

    const apres = reappliquer(recent, [
      operationMise(1, { carteId: 'k1' }),
      operationMise(2, { carteId: 'k1' }),
    ]);

    expect(apres.cartes[0]!.misesEncaissees).toBe(4);
    expect(apres.mises).toHaveLength(2);
  });

  it('ne modifie pas l’instantané qu’on lui donne', () => {
    const t = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')] });
    const copie = structuredClone(t);

    reappliquer(t, [operationMise(1, { carteId: 'k1' })]);

    expect(t).toEqual(copie);
  });
});
