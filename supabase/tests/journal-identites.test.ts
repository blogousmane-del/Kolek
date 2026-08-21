import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le journal des identités.
 *
 * Constat reconduit par deux audits : l'argent laissait une trace, les personnes
 * n'en laissaient aucune. Le nom d'un client est ce qui rattache une carte à
 * quelqu'un de réel ; le téléphone d'un collecteur est ce qui l'identifie dans
 * toute l'administration. Les deux se corrigent légitimement — une faute de
 * frappe — et se modifient aussi illégitimement. Sans journal, rien ne distingue
 * les deux après coup.
 *
 * Le remède retenu n'est pas d'interdire la modification, mais de la tracer.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
let collecteur: CollecteurTest;

beforeAll(async () => {
  collecteur = await creerCollecteur(`Journal ${MARQUE}`, `+225073${MARQUE}`);
});

afterAll(async () => {
  await nettoyer();
});

async function actionsSur(ligneId: string): Promise<string[]> {
  const { data } = await admin
    .from('audit_log')
    .select('action, table_cible')
    .eq('ligne_id', ligneId)
    .order('survenu_le');
  return ((data ?? []) as Array<{ action: string }>).map((l) => l.action);
}

describe('clients', () => {
  it('journalise l’inscription puis la correction d’un nom', async () => {
    const clientId = crypto.randomUUID();

    await collecteur.client
      .from('clients')
      .insert({ id: clientId, collecteur_id: collecteur.id, nom: 'Kouamé Asi' });

    // La faute de frappe qu'on corrige : le geste légitime que le journal doit
    // enregistrer sans l'empêcher.
    await collecteur.client.from('clients').update({ nom: 'Kouamé Assi' }).eq('id', clientId);

    expect(await actionsSur(clientId)).toEqual(['insert', 'update']);
  });

  it('conserve la valeur d’après dans la trace', async () => {
    const clientId = crypto.randomUUID();

    await collecteur.client
      .from('clients')
      .insert({ id: clientId, collecteur_id: collecteur.id, nom: 'Avant' });
    await collecteur.client.from('clients').update({ nom: 'Après' }).eq('id', clientId);

    const { data } = await admin
      .from('audit_log')
      .select('donnees')
      .eq('ligne_id', clientId)
      .eq('action', 'update')
      .single();

    // `to_jsonb(new)` : le journal garde l'état résultant, pas le précédent.
    // Reconstituer l'historique se fait en remontant la suite des lignes.
    expect((data!.donnees as { nom: string }).nom).toBe('Après');
  });

  it('rattache la trace au bon collecteur', async () => {
    const clientId = crypto.randomUUID();
    await collecteur.client
      .from('clients')
      .insert({ id: clientId, collecteur_id: collecteur.id, nom: `Rattachement ${MARQUE}` });

    const { data } = await admin
      .from('audit_log')
      .select('collecteur_id, table_cible')
      .eq('ligne_id', clientId)
      .single();

    expect(data!.collecteur_id).toBe(collecteur.id);
    expect(data!.table_cible).toBe('clients');
  });
});

describe('collecteurs', () => {
  it('journalise la création du compte', async () => {
    // La ligne est créée par le déclencheur d'inscription, donc cette trace
    // existe avant que quiconque touche à quoi que ce soit.
    const actions = await actionsSur(collecteur.id);
    expect(actions).toContain('insert');
  });

  it('journalise un changement de téléphone', async () => {
    // Le champ le plus sensible de la table : il identifie le collecteur dans
    // toute l'administration, et il porte la seule contrainte d'unicité.
    await admin
      .from('collecteurs')
      .update({ telephone: `+225074${MARQUE}` })
      .eq('id', collecteur.id);

    expect(await actionsSur(collecteur.id)).toContain('update');
  });

  it('n’a pas eu besoin de `collecteur_id` pour se journaliser', async () => {
    // Le point de la seconde fonction. `journaliser()` lit `new.collecteur_id`,
    // colonne que `collecteurs` n'a pas : la réutiliser aurait levé une erreur à
    // chaque écriture, et rendu impossible la création d'un compte.
    const { data } = await admin
      .from('audit_log')
      .select('collecteur_id, ligne_id')
      .eq('table_cible', 'collecteurs')
      .eq('ligne_id', collecteur.id)
      .limit(1)
      .single();

    expect(data!.collecteur_id).toBe(collecteur.id);
    expect(data!.ligne_id).toBe(collecteur.id);
  });
});

describe('cartes', () => {
  it('journalise désormais la clôture, pas seulement l’ouverture', async () => {
    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();

    await collecteur.client
      .from('clients')
      .insert({ id: clientId, collecteur_id: collecteur.id, nom: `Carte ${MARQUE}` });
    await collecteur.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise: 1000 });

    await admin
      .from('cartes')
      .update({ statut: 'cloturee', cloturee_le: new Date().toISOString() })
      .eq('id', carteId);

    // Avant le 2026-08-21, seul `insert` était tracé. Le moment où l'argent sort
    // — le passage en `cloturee` — ne laissait rien, alors que c'est l'événement
    // le plus sensible du cycle de vie d'une carte.
    expect(await actionsSur(carteId)).toEqual(['insert', 'update']);
  });
});

describe('immuabilité', () => {
  it('refuse de modifier une trace d’identité', async () => {
    const { data: ligne } = await admin
      .from('audit_log')
      .select('id')
      .eq('table_cible', 'clients')
      .limit(1)
      .single();

    const { error } = await admin
      .from('audit_log')
      .update({ action: 'insert' })
      .eq('id', ligne!.id);

    // Le journal reste append-only, y compris pour la clé de service : sans
    // cela, tracer les identités ne servirait à rien.
    expect(error).not.toBeNull();
  });
});
