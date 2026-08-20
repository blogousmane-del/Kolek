import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le contrat sur lequel repose la clôture d'une carte.
 *
 * L'Edge Function `collecteur-cloturer-carte` ne fait rien d'exotique : elle
 * écrit une ligne de `retraits` et passe la carte en `cloturee`. Ce qu'elle
 * suppose de la base, en revanche, est précis, et c'est **cela** qui est vérifié
 * ici. Si l'une de ces suppositions tombe, la fonction devient fausse sans
 * qu'aucun test de la fonction elle-même ne bronche.
 *
 * Les suppositions :
 *
 * 1. Un collecteur authentifié **ne peut pas** écrire dans `retraits`. C'est la
 *    seule raison d'être de la fonction. Le jour où cette écriture s'ouvrirait,
 *    la fonction deviendrait un détour inutile — et pire, un détour qu'on croit
 *    encore nécessaire.
 * 2. `retraits.carte_id` est unique. C'est cette contrainte, et rien d'autre,
 *    qui porte l'idempotence de la clôture.
 * 3. La mise à jour conditionnée `where statut = 'active'` ne touche rien sur une
 *    carte déjà clôturée, et ne lève pas. C'est ce qui rend un second appel
 *    inoffensif.
 * 4. `cartes_cloture_coherente` interdit de fermer une carte sans dater sa
 *    clôture — la fonction pose donc `cloturee_le` dans le même geste.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
let collecteur: CollecteurTest;

/** Ouvre un client et sa carte, encaisse `mises` fois. Rend l'identifiant de carte. */
async function carteAvecMises(mise: number, mises: number): Promise<string> {
  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();

  const { error: erreurClient } = await collecteur.client
    .from('clients')
    .insert({ id: clientId, collecteur_id: collecteur.id, nom: `Client ${MARQUE}` });
  if (erreurClient) throw erreurClient;

  const { error: erreurCarte } = await collecteur.client
    .from('cartes')
    .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise });
  if (erreurCarte) throw erreurCarte;

  // Une par une, jamais en lot : les déclencheurs `AFTER` sont différés en fin
  // d'instruction, donc un lot verrait toutes les mises avec le même compteur et
  // les marquerait toutes commission. C'est le défaut trouvé le 2026-08-19.
  for (let i = 0; i < mises; i += 1) {
    const { error } = await collecteur.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      carte_id: carteId,
      montant: mise,
      encaisse_le: new Date().toISOString(),
    });
    if (error) throw error;
  }

  return carteId;
}

beforeAll(async () => {
  collecteur = await creerCollecteur(`Clôture ${MARQUE}`, `+225070${MARQUE}`);
});

afterAll(async () => {
  await nettoyer();
});

describe('ce que le collecteur ne peut pas faire lui-même', () => {
  it('refuse au collecteur d’écrire une ligne de retrait', async () => {
    const carteId = await carteAvecMises(1000, 2);

    const { error } = await collecteur.client.from('retraits').insert({
      collecteur_id: collecteur.id,
      carte_id: carteId,
      montant_restitue: 1000,
      commission: 1000,
    });

    // 42501 : privilège refusé. C'est la raison d'être de l'Edge Function ; si ce
    // test passe au vert un jour, c'est que quelqu'un a ouvert la table.
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('refuse au collecteur de clôturer une carte directement', async () => {
    const carteId = await carteAvecMises(1000, 1);

    const { error } = await collecteur.client
      .from('cartes')
      .update({ statut: 'cloturee', cloturee_le: new Date().toISOString() })
      .eq('id', carteId);

    // Aucun `grant update` sur `cartes` pour `authenticated`, et aucune politique
    // RLS d'update. Sans ça, un collecteur fermerait une carte sans rendre
    // l'argent, et l'encours disparaîtrait des écrans de GTCS.
    expect(error).not.toBeNull();
  });
});

describe('la clôture telle que la fonction l’exécute', () => {
  it('écrit le retrait puis ferme la carte', async () => {
    const carteId = await carteAvecMises(2000, 3);

    // (3 − 1) × 2000 : la première mise est la commission du collecteur.
    const { error: erreurRetrait } = await admin.from('retraits').insert({
      collecteur_id: collecteur.id,
      carte_id: carteId,
      montant_restitue: 4000,
      commission: 2000,
    });
    expect(erreurRetrait).toBeNull();

    const { error: erreurCloture } = await admin
      .from('cartes')
      .update({ statut: 'cloturee', cloturee_le: new Date().toISOString() })
      .eq('id', carteId)
      .eq('statut', 'active');
    expect(erreurCloture).toBeNull();

    const { data } = await admin
      .from('cartes')
      .select('statut, cloturee_le')
      .eq('id', carteId)
      .single();

    expect(data?.statut).toBe('cloturee');
    expect(data?.cloturee_le).not.toBeNull();
  });

  it('refuse un second retrait sur la même carte', async () => {
    const carteId = await carteAvecMises(1000, 2);

    const ligne = {
      collecteur_id: collecteur.id,
      carte_id: carteId,
      montant_restitue: 1000,
      commission: 1000,
    };

    expect((await admin.from('retraits').insert(ligne)).error).toBeNull();

    const { error } = await admin.from('retraits').insert(ligne);

    // 23505 : clé dupliquée. C'est exactement ce que la fonction intercepte pour
    // poursuivre vers la fermeture de la carte au lieu d'échouer — un appui
    // double, ou un réseau coupé après la première écriture, ne doit pas rendre
    // l'argent deux fois.
    expect(error?.code).toBe('23505');
  });

  it('ne touche rien quand la carte est déjà clôturée, et ne lève pas', async () => {
    const carteId = await carteAvecMises(1000, 1);

    await admin
      .from('cartes')
      .update({ statut: 'cloturee', cloturee_le: new Date().toISOString() })
      .eq('id', carteId);

    const avant = await admin.from('cartes').select('cloturee_le').eq('id', carteId).single();

    const { error } = await admin
      .from('cartes')
      .update({ statut: 'cloturee', cloturee_le: new Date().toISOString() })
      .eq('id', carteId)
      .eq('statut', 'active');

    const apres = await admin.from('cartes').select('cloturee_le').eq('id', carteId).single();

    expect(error).toBeNull();
    // La date de clôture d'origine est conservée : c'est elle qui fait foi dans
    // le bilan et dans le journal d'audit.
    expect(apres.data?.cloturee_le).toBe(avant.data?.cloturee_le);
  });

  it('interdit de fermer une carte sans dater la clôture', async () => {
    const carteId = await carteAvecMises(1000, 1);

    const { error } = await admin
      .from('cartes')
      .update({ statut: 'cloturee' })
      .eq('id', carteId);

    // `cartes_cloture_coherente` : `(statut = 'cloturee') = (cloturee_le is not
    // null)`. La fonction pose donc les deux dans le même `update`.
    expect(error?.code).toBe('23514');
  });
});

describe('une carte clôturée n’encaisse plus', () => {
  it('refuse une mise après la clôture', async () => {
    const carteId = await carteAvecMises(1000, 2);

    await admin
      .from('cartes')
      .update({ statut: 'cloturee', cloturee_le: new Date().toISOString() })
      .eq('id', carteId);

    const { error } = await collecteur.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
    });

    // Sans ce refus, une mise encaissée après restitution rendrait l'encours
    // négatif et le rapprochement de caisse insoluble.
    expect(error?.message).toContain('CARTE_CLOTUREE');
  });
});
