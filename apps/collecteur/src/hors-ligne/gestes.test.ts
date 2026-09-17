import { CAISSE_MAX } from '@kolek/core';
import { describe, expect, it } from 'vitest';

import { carte, caisse, client, operationClientCarte, tournee } from './fabriques';
import {
  construireCaisse,
  construireCarte,
  construireClientCarte,
  construireMise,
  type SaisieClient,
} from './gestes';

const MAINTENANT = Date.parse('2026-09-13T10:00:00.000Z');
const CTX = { collecteurId: 'col-1', maintenant: MAINTENANT };
const INSCRIPTION = { ...CTX, abonnementStatut: 'actif' };

const UNE_CARTE = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 4 })] });

describe('encaisser une mise', () => {
  const mise = (t = UNE_CARTE, reste: Partial<{ carteId: string; montant: number }> = {}) =>
    construireMise(CTX, { carteId: 'k1', montant: 1000, encaisseLe: new Date(MAINTENANT), ...reste })(t, [], 7);

  it('construit l’opération, sa séquence et son heure', () => {
    const r = mise();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.operation).toMatchObject({
      version: 1,
      sequence: 7,
      collecteurId: 'col-1',
      type: 'mise',
      etat: 'en_attente',
      tentatives: 0,
      prochainEssai: null,
      dependDe: [],
      faiteLe: '2026-09-13T10:00:00.000Z',
      envoyableApres: '2026-09-13T10:00:00.000Z',
      charge: { carteId: 'k1', montant: 1000, encaisseLe: '2026-09-13T10:00:00.000Z' },
    });
    expect(r.operation.id).toHaveLength(36);
    expect(r.operation.charge.id).toHaveLength(36);
    expect(r.operation.charge.id).not.toBe(r.operation.id);
  });

  it('ne part qu’après le sursis quand il y en a un (§7)', () => {
    const r = construireMise({ ...CTX, sursisMs: 6000 }, { carteId: 'k1', montant: 1000, encaisseLe: new Date(MAINTENANT) })(UNE_CARTE, [], 1);
    expect(r.ok && r.operation.envoyableApres).toBe('2026-09-13T10:00:06.000Z');
  });

  it.each([
    ['une carte absente du téléphone', 'CARTE_ABSENTE', { carteId: 'k9' }],
    ['un montant différent de la mise', 'MONTANT_INVALIDE', { montant: 2000 }],
    ['un montant sous le minimum', 'MISE_HORS_BORNES', { montant: 100 }],
  ] as Array<[string, string, Partial<{ carteId: string; montant: number }>]>)('refuse %s', (_cas, code, reste) => {
    const r = mise(UNE_CARTE, reste);
    expect(r.ok ? null : r.echec.code).toBe(code);
  });

  it('refuse une carte clôturée et une carte pleine', () => {
    const close = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { statut: 'cloturee' })] });
    const pleine = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 31 })] });
    expect(mise(close)).toMatchObject({ ok: false, echec: { code: 'CARTE_CLOTUREE' } });
    expect(mise(pleine)).toMatchObject({ ok: false, echec: { code: 'CYCLE_COMPLET' } });
  });

  it('dépend de l’inscription encore en file qui a créé la carte (§6.6)', () => {
    const inscription = operationClientCarte(1, { clientId: 'c2', carteId: 'k2' });
    const t = tournee({ clients: [client('c2')], cartes: [carte('k2', 'c2')] });

    const r = construireMise(CTX, { carteId: 'k2', montant: 1000, encaisseLe: new Date(MAINTENANT) })(t, [inscription], 2);

    expect(r.ok && r.operation.dependDe).toEqual(['op-1']);
  });
});

describe('inscrire un client et sa carte', () => {
  const inscrire = (saisie: Partial<SaisieClient> = {}, ctx: { collecteurId: string; maintenant: number; abonnementStatut: string | null } = INSCRIPTION) =>
    construireClientCarte(ctx, { nom: '  Awa  ', telephone: ' 0700 ', marche: '', mise: 1000, avisActifs: true, ...saisie })(tournee(), [], 3);

  it('construit les deux étapes, les champs nettoyés, rien de fait encore', () => {
    const r = inscrire();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.operation.charge.client).toMatchObject({
      nom: 'Awa',
      telephone: '0700',
      marche: null,
      activite: null,
      avisActifs: true,
    });
    expect(r.operation.charge.carte.mise).toBe(1000);
    expect(r.operation.etapes).toEqual({ client: false, carte: false });
  });

  it('n’enregistre aucun consentement sans numéro', () => {
    const r = inscrire({ telephone: '   ' });
    expect(r.ok && r.operation.charge.client.avisActifs).toBe(false);
  });

  it('refuse un nom vide', () => {
    expect(inscrire({ nom: '   ' })).toMatchObject({ ok: false, echec: { code: 'NOM_VIDE' } });
  });

  it.each([
    ['nom', 121],
    ['telephone', 33],
    ['marche', 81],
    ['activite', 81],
  ] as Array<[string, number]>)('refuse un %s au-delà de la borne du serveur', (champ, longueur) => {
    const saisie = { [champ]: 'x'.repeat(longueur) } as Partial<SaisieClient>;
    expect(inscrire(saisie)).toMatchObject({ ok: false, echec: { code: 'BORNE' } });
  });

  it('accepte chaque champ exactement à sa borne', () => {
    expect(inscrire({ nom: 'x'.repeat(120), telephone: '9'.repeat(32), marche: 'm'.repeat(80), activite: 'a'.repeat(80) }).ok).toBe(true);
  });

  it('refuse quand le dernier statut connu n’est pas actif', () => {
    expect(inscrire({}, { ...CTX, abonnementStatut: 'suspendu' })).toMatchObject({
      ok: false,
      echec: { code: 'ABONNEMENT_INACTIF' },
    });
  });

  it('laisse le serveur trancher quand le statut n’a jamais été lu', () => {
    expect(inscrire({}, { ...CTX, abonnementStatut: null }).ok).toBe(true);
  });
});

describe('ouvrir une carte', () => {
  it('construit la carte du client', () => {
    const r = construireCarte(INSCRIPTION, { clientId: 'c1', mise: 2000 })(UNE_CARTE, [], 1);
    expect(r.ok && r.operation.charge).toMatchObject({ clientId: 'c1', mise: 2000 });
  });

  it('refuse un client absent du téléphone, et un abonnement suspendu', () => {
    expect(construireCarte(INSCRIPTION, { clientId: 'c9', mise: 1000 })(UNE_CARTE, [], 1)).toMatchObject({
      ok: false,
      echec: { code: 'CLIENT_INTROUVABLE' },
    });
    expect(construireCarte({ ...CTX, abonnementStatut: 'expire' }, { clientId: 'c1', mise: 1000 })(UNE_CARTE, [], 1)).toMatchObject({
      ok: false,
      echec: { code: 'ABONNEMENT_INACTIF' },
    });
  });

  it('dépend de l’inscription du client encore en file', () => {
    const inscription = operationClientCarte(1, { clientId: 'c2', carteId: 'k2' });
    const t = tournee({ clients: [client('c2')], cartes: [carte('k2', 'c2')] });
    const r = construireCarte(INSCRIPTION, { clientId: 'c2', mise: 500 })(t, [inscription], 2);
    expect(r.ok && r.operation.dependDe).toEqual(['op-1']);
  });
});

describe('déclarer la caisse (§6.4)', () => {
  it('refuse un montant négatif ou décimal', () => {
    expect(construireCaisse(CTX, { date: '2026-09-13', montant: -1 })(tournee(), [], 1)).toMatchObject({
      ok: false,
      echec: { code: 'CAISSE_INVALIDE' },
    });
    expect(construireCaisse(CTX, { date: '2026-09-13', montant: 10.5 })(tournee(), [], 1).ok).toBe(false);
  });

  it('refuse un montant plus grand que ce qu’une colonne integer porte', () => {
    const r = construireCaisse(CTX, { date: '2026-09-13', montant: CAISSE_MAX + 1 })(tournee(), [], 1);

    expect(r).toMatchObject({ ok: false, echec: { code: 'MONTANT_TROP_GRAND' } });
    // La phrase compte autant que le code : sans entrée dans PHRASES,
    // `phraseEcriture` retombe sur celle d'INCONNU, qui ne dit rien de juste.
    expect(r.ok === false && r.echec.message).toBe(
      'Ce montant est trop grand. Vérifie le nombre de chiffres.',
    );
  });

  it('accepte la borne exacte', () => {
    const r = construireCaisse(CTX, { date: '2026-09-13', montant: CAISSE_MAX })(tournee(), [], 1);

    expect(r.ok).toBe(true);
    expect(r.ok && r.operation.charge.cashDeclare).toBe(CAISSE_MAX);
  });

  it('reprend l’identifiant de la ligne du jour', () => {
    const t = tournee({ caisses: [caisse({ id: 'ligne-du-jour', cashDeclare: 3000 })] });
    const r = construireCaisse(CTX, { date: '2026-09-13', montant: 5000 })(t, [], 1);
    expect(r.ok && r.operation.charge).toEqual({ id: 'ligne-du-jour', date: '2026-09-13', cashDeclare: 5000 });
  });

  it('tire un identifiant à la première déclaration de la journée', () => {
    const r = construireCaisse(CTX, { date: '2026-09-13', montant: 0 })(tournee(), [], 1);
    expect(r.ok && r.operation.charge.id).toHaveLength(36);
  });
});
