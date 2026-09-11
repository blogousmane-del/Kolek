import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le parcours d'écriture du collecteur, joué exactement comme le téléphone le
 * joue : **clé anonyme, session du collecteur, RLS active**. Jamais la clé de
 * service.
 *
 * C'est ce qui distingue ce fichier de `vue-globale.test.ts`. Là-bas on vérifie
 * qu'une fonction d'administration reste hors de portée ; ici on vérifie que ce
 * qui doit être à portée l'est vraiment. Les deux erreurs coûtent : une base
 * trop ouverte perd les données de tout le monde, une base trop fermée
 * n'encaisse rien et personne ne comprend pourquoi.
 *
 * Aucune Edge Function n'intervient. Si ces tests passent, l'application
 * collecteur peut écrire sans serveur intermédiaire — et le fait qu'ils passent
 * est la justification de ce choix d'architecture.
 */

afterAll(nettoyer);

let c: CollecteurTest;
let clientId: string;
let carteId: string;

beforeAll(async () => {
  c = await creerCollecteur('Scribe', `+225075${Date.now() % 10000000}`);
});

describe('le collecteur écrit ses propres lignes, sous RLS', () => {
  it('1. crée un client', async () => {
    clientId = crypto.randomUUID();
    const { error } = await c.client.from('clients').insert({
      id: clientId,
      collecteur_id: c.id,
      nom: 'Cliente du scribe',
      telephone: '+2250700000001',
      marche: 'Adjamé',
      activite: 'Vivres',
    });

    expect(error).toBeNull();
  });

  it('2. ouvre une carte à ce client', async () => {
    carteId = crypto.randomUUID();
    const { error } = await c.client.from('cartes').insert({
      id: carteId,
      collecteur_id: c.id,
      client_id: clientId,
      mise: 1000,
    });

    expect(error).toBeNull();
  });

  it('3. encaisse une mise, que le serveur marque comme commission', async () => {
    // Le téléphone n'envoie pas `est_commission` : il n'a pas à le savoir, et
    // le lui laisser décider permettrait à un collecteur de s'attribuer une
    // commission sur chaque mise du cycle.
    const { error } = await c.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: c.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
    });
    expect(error).toBeNull();

    const { data } = await c.client
      .from('mises')
      .select('est_commission')
      .eq('carte_id', carteId);

    expect(data).toHaveLength(1);
    expect(data![0]!.est_commission).toBe(true);
  });

  it('4. encaisse une deuxième mise, qui n’est plus une commission', async () => {
    const { error } = await c.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: c.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
    });
    expect(error).toBeNull();

    const { data } = await c.client
      .from('cartes')
      .select('mises_encaissees')
      .eq('id', carteId)
      .single();

    expect(data!.mises_encaissees).toBe(2);
  });
});

describe('ce que le serveur refuse au collecteur', () => {
  it('5. rejoue une mise déjà envoyée sans la compter deux fois', async () => {
    // Le cas qui justifie que le téléphone engendre l'identifiant. Une file de
    // synchro qui renvoie un envoi déjà reçu doit se voir répondre « doublon »,
    // pas créer une seconde mise. C'est de l'argent compté deux fois.
    const id = crypto.randomUUID();
    const mise = {
      id,
      collecteur_id: c.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
    };

    const premier = await c.client.from('mises').insert(mise);
    expect(premier.error).toBeNull();

    const rejeu = await c.client.from('mises').insert(mise);
    expect(rejeu.error).not.toBeNull();
    expect(rejeu.error!.message).toContain('DOUBLON');

    const { count } = await c.client
      .from('mises')
      .select('id', { count: 'exact', head: true })
      .eq('id', id);
    expect(count).toBe(1);
  });

  it('6. refuse une mise d’un montant différent de celui de la carte', async () => {
    const { error } = await c.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: c.id,
      carte_id: carteId,
      montant: 2000,
      encaisse_le: new Date().toISOString(),
    });

    expect(error).not.toBeNull();
    expect(error!.message).toContain('MONTANT_INVALIDE');
  });

  it('7. refuse un nom de client démesuré', async () => {
    // La borne posée le 2026-08-19. Sans elle, `journaliser()` recopierait ce
    // texte dans une table en ajout seul, à chaque écriture.
    const { error } = await c.client.from('clients').insert({
      id: crypto.randomUUID(),
      collecteur_id: c.id,
      nom: 'x'.repeat(10_000),
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe('23514');
  });

  it('8. refuse de créer un client pour un autre collecteur', async () => {
    const autre = await creerCollecteur('Autre scribe', `+225076${Date.now() % 10000000}`);

    const { error } = await c.client.from('clients').insert({
      id: crypto.randomUUID(),
      collecteur_id: autre.id,
      nom: 'Client volé',
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('9. refuse d’écrire une colonne hors de la liste blanche', async () => {
    // `mises_encaissees` est tenu par le déclencheur. Si le collecteur pouvait
    // l'écrire, il pourrait déclarer une carte complète sans avoir encaissé —
    // et la clôturer pour toucher la commission.
    const { error } = await c.client
      .from('cartes')
      .insert({
        id: crypto.randomUUID(),
        collecteur_id: c.id,
        client_id: clientId,
        mise: 1000,
        mises_encaissees: 30,
      });

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });

  it('10. refuse de modifier une mise déjà enregistrée', async () => {
    const { error } = await c.client.from('mises').update({ montant: 9999 }).eq('carte_id', carteId);

    expect(error).not.toBeNull();
  });
});

/**
 * La correction d'une fiche client — ce que la base accorde, et à qui.
 *
 * Les épreuves 7 à 9 gardent l'**insertion**. Aucune ne gardait la
 * **modification** avant le 2026-09-11, parce qu'aucun écran n'en faisait. La
 * question qui décide de l'écran de correction n'est pas « l'objet est-il bien
 * formé » — `ecritures.test.ts` s'en charge sur bouchon — mais « le serveur
 * accepte-t-il ces colonnes-là, sur cette ligne-là, et refuse-t-il tout le
 * reste ». Un bouchon répond oui par construction.
 */
describe('la correction d’une fiche client', () => {
  let autre: CollecteurTest;

  beforeAll(async () => {
    autre = await creerCollecteur('Voisin', `+225077${Date.now() % 10000000}`);
  });

  it('11. accepte les quatre champs que le collecteur doit pouvoir corriger', async () => {
    const { data, error } = await c.client
      .from('clients')
      .update({ nom: 'Nom corrigé', telephone: '0700000001', marche: 'Adjamé', activite: 'Tissu' })
      .eq('id', clientId)
      .select('id');

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('12. accepte le numéro et la coupure des avis dans la même requête', async () => {
    // Le contrat de `modifierClient` : une seule écriture, jamais deux. Si la
    // base refusait `avis_actifs` à côté de `telephone`, le client devrait
    // écrire en deux fois — et la fenêtre entre les deux enverrait une mise au
    // nouveau numéro sous l'ancien consentement.
    await admin.from('clients').update({ avis_actifs: true }).eq('id', clientId);

    const { data, error } = await c.client
      .from('clients')
      .update({ telephone: '0700000002', avis_actifs: false })
      .eq('id', clientId)
      .select('telephone, avis_actifs');

    expect(error).toBeNull();
    expect(data).toEqual([{ telephone: '0700000002', avis_actifs: false }]);
  });

  it('13. refuse de déplacer un client vers un autre collecteur', async () => {
    // `collecteur_id` n'est pas dans la liste blanche : la base lève, comme à
    // l'épreuve 9. Ce qui compte n'est pas la forme du refus mais son effet —
    // relu avec la clé de service, le client n'a pas changé de propriétaire.
    const { error } = await c.client
      .from('clients')
      .update({ collecteur_id: autre.id })
      .eq('id', clientId);

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');

    const { data } = await admin.from('clients').select('collecteur_id').eq('id', clientId).single();
    expect(data!.collecteur_id).toBe(c.id);
  });

  it('14. ne touche aucune ligne pour le client d’un autre collecteur', async () => {
    // Zéro ligne, et `error` à null : c'est exactement le silence contre lequel
    // `modifierClient` compte ses lignes. Si ce silence devenait une erreur un
    // jour, l'écran le traduirait encore ; s'il devenait un succès, cette
    // épreuve tomberait.
    const { data, error } = await autre.client
      .from('clients')
      .update({ nom: 'Vol' })
      .eq('id', clientId)
      .select('id');

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);

    const { data: relu } = await admin.from('clients').select('nom').eq('id', clientId).single();
    expect(relu!.nom).not.toBe('Vol');
  });

  it('15. refuse un nom au-delà de la borne, en modification comme en insertion', async () => {
    const { error } = await c.client
      .from('clients')
      .update({ nom: 'x'.repeat(121) })
      .eq('id', clientId)
      .select('id');

    expect(error).not.toBeNull();
    expect(error!.code).toBe('23514');
  });

  it('16. laisse une trace au journal, qui porte l’état nouveau', async () => {
    // Le dessin affirmait le 2026-09-10 que le journal garde l'ancienne et la
    // nouvelle valeur. Faux : `journaliser()` écrit `to_jsonb(new)`. Cette
    // épreuve fixe ce qui est vrai — la correction est tracée, par son auteur,
    // avec l'état d'après — pour que personne ne recompte sur l'état d'avant.
    await c.client.from('clients').update({ marche: 'Treichville' }).eq('id', clientId);

    // Filtrer sur le contenu plutôt que trier par `id` : rien ne garantit
    // qu'un identifiant de journal soit chronologique, et une épreuve qui lirait
    // « la dernière ligne » passerait ou non selon le type de la clé.
    const { data } = await admin
      .from('audit_log')
      .select('acteur_id, donnees')
      .eq('table_cible', 'clients')
      .eq('ligne_id', clientId)
      .eq('action', 'update')
      .eq('donnees->>marche', 'Treichville');

    expect(data).toHaveLength(1);
    expect(data![0]!.acteur_id).toBe(c.id);
  });
});
