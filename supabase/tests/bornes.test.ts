import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

/**
 * Le « test du client déloyal » de l'audit, écrit une fois pour toutes : appeler
 * l'API hors de l'interface, avec des valeurs qu'aucun formulaire n'enverrait.
 * Les trois campagnes précédentes ont fermé qui écrit et quelles colonnes ;
 * celle-ci ferme la taille de ce qui entre.
 */
let a: CollecteurTest;
let b: CollecteurTest;

/** Une chaîne qu'aucun nom, marché ou motif réel n'atteindra jamais. */
const TROP_LONG = 'x'.repeat(10_000);

/** Code SQLSTATE d'une violation de contrainte CHECK. */
const CHECK_VIOLE = '23514';

beforeAll(async () => {
  a = await creerCollecteur('Awa Traoré', `+225071${Date.now() % 10000000}`);
  b = await creerCollecteur('Yao Kouassi', `+225072${Date.now() % 10000000}`);
});

describe('bornes de longueur sur ce que le client écrit', () => {
  it('refuse une fiche client aux champs démesurés', async () => {
    for (const champ of ['nom', 'telephone', 'marche', 'activite']) {
      const { error } = await a.client.from('clients').insert({
        id: crypto.randomUUID(),
        collecteur_id: a.id,
        nom: 'Client test',
        [champ]: TROP_LONG,
      });
      expect(error?.code, `clients.${champ} doit être borné`).toBe(CHECK_VIOLE);
    }
  });

  it('refuse un profil de collecteur aux champs démesurés', async () => {
    for (const champ of ['nom', 'telephone', 'zone']) {
      const { error } = await a.client
        .from('collecteurs')
        .update({ [champ]: TROP_LONG })
        .eq('id', a.id);
      expect(error?.code, `collecteurs.${champ} doit être borné`).toBe(CHECK_VIOLE);
    }
  });

  it('refuse un rejet de synchro au motif ou à la charge utile démesurés', async () => {
    const motif = await a.client.from('synchro_rejets').insert({
      id: crypto.randomUUID(),
      collecteur_id: a.id,
      charge_utile: { mise: 1000 },
      motif: TROP_LONG,
    });
    expect(motif.error?.code).toBe(CHECK_VIOLE);

    // La charge utile est la colonne la plus exposée du schéma : un jsonb écrit
    // tel quel par le téléphone, sans forme imposée.
    const charge = await a.client.from('synchro_rejets').insert({
      id: crypto.randomUUID(),
      collecteur_id: a.id,
      charge_utile: { rebut: TROP_LONG },
      motif: 'charge démesurée',
    });
    expect(charge.error?.code).toBe(CHECK_VIOLE);
  });

  it('laisse passer un rejet de taille normale', async () => {
    const { error } = await a.client.from('synchro_rejets').insert({
      id: crypto.randomUUID(),
      collecteur_id: a.id,
      charge_utile: { carte_id: crypto.randomUUID(), montant: 1000 },
      motif: 'CARTE_CLOTUREE',
    });
    expect(error).toBeNull();
  });
});

describe('photo_url', () => {
  // Aucun écran n'affiche encore cette photo. C'est le bon moment : le jour où
  // la valeur atterrit dans un `href`, ce qui y aura été stocké entre-temps
  // s'exécutera chez celui qui consulte la fiche.
  it('refuse un schéma autre que https', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'http://x.ci/p']) {
      const { error } = await a.client.from('clients').insert({
        id: crypto.randomUUID(),
        collecteur_id: a.id,
        nom: 'Client photo',
        photo_url: url,
      });
      expect(error?.code, `${url} ne doit pas entrer`).toBe(CHECK_VIOLE);
    }
  });

  it('accepte une URL https de taille raisonnable', async () => {
    const { error } = await a.client.from('clients').insert({
      id: crypto.randomUUID(),
      collecteur_id: a.id,
      nom: 'Client photo',
      photo_url: 'https://exemple.ci/photos/abc.jpg',
    });
    expect(error).toBeNull();
  });
});

describe('date de caisse', () => {
  it('refuse une caisse ouverte hors de la fenêtre de synchronisation', async () => {
    const dans30Jours = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const { error } = await a.client.from('caisses_jour').insert({
      collecteur_id: a.id,
      date: dans30Jours,
      cash_declare: 0,
    });
    expect(error!.message).toContain('DATE_INVALIDE');
  });

  it('laisse corriger le cash déclaré d’une caisse déjà ouverte', async () => {
    const jour = new Date().toISOString().slice(0, 10);
    const ouverture = await a.client
      .from('caisses_jour')
      .insert({ collecteur_id: a.id, date: jour, cash_declare: 4000 });
    expect(ouverture.error).toBeNull();

    // La borne ne vit que sur l'INSERT : c'est l'ouverture d'une caisse hors
    // fenêtre qu'on refuse, pas la correction d'une ligne déjà acceptée.
    const correction = await a.client
      .from('caisses_jour')
      .update({ cash_declare: 4500 })
      .eq('collecteur_id', a.id)
      .eq('date', jour);
    expect(correction.error).toBeNull();
  });
});

describe('carte d’un autre collecteur', () => {
  it('répond « introuvable » plutôt que de renseigner sur son état', async () => {
    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    await admin.from('clients').insert({ id: clientId, collecteur_id: b.id, nom: 'Client de B' });
    await admin
      .from('cartes')
      .insert({ id: carteId, collecteur_id: b.id, client_id: clientId, mise: 2000 });

    // A connaît l'identifiant de la carte de B — capture d'écran, export, fuite
    // de journal. L'insertion était déjà refusée ; c'est le message qui
    // renseignait. MONTANT_INVALIDE aurait livré la mise de B en quelques essais.
    const { error } = await a.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: a.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
    });

    expect(error!.message).toContain('CARTE_INTROUVABLE');
    expect(error!.message).not.toContain('MONTANT_INVALIDE');
  });
});
