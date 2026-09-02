import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

/**
 * `collecteur-encaisser-pour` — dépanner un coéquipier sur sa propre carte.
 *
 * La vérification de propriété appartient **entièrement** à cette fonction.
 * Sous clé de service `auth.uid()` est nul, donc la garde
 * `if auth.uid() is not null and c.collecteur_id <> auth.uid()` de
 * `mises_avant_insert` ne s'exécute pas. Si le contrôle d'appartenance
 * disparaît, n'importe quel collecteur connecté encaisse sur n'importe quelle
 * carte du produit — et le test « carte hors équipe » est le seul endroit du
 * dépôt qui le dirait.
 */

const BASE = `${process.env.SUPABASE_URL}/functions/v1/collecteur-encaisser-pour`;

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

async function appeler(jeton: string | null, corps: unknown): Promise<Response> {
  return fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    body: JSON.stringify(corps),
  });
}

async function jetonDe(collecteur: CollecteurTest): Promise<string> {
  const { data } = await collecteur.client.auth.getSession();
  return data.session!.access_token;
}

/** Ouvre une carte chez `proprietaire`, et rend son identifiant. */
async function carteDe(proprietaire: CollecteurTest, mise = 1000): Promise<string> {
  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();
  await proprietaire.client
    .from('clients')
    .insert({ id: clientId, collecteur_id: proprietaire.id, nom: 'Aya' });
  await proprietaire.client
    .from('cartes')
    .insert({ id: carteId, collecteur_id: proprietaire.id, client_id: clientId, mise });
  return carteId;
}

/** Un titulaire, un collaborateur rattaché, et une carte ouverte chez ce dernier. */
async function equipe() {
  const patron = await creerCollecteur('Patron Enc', telephone());
  const awa = await creerCollecteur('Awa Enc', telephone());
  await admin
    .from('collecteurs')
    .update({ palier: 'illimite', abonnement_statut: 'actif' })
    .eq('id', patron.id);
  const { error } = await admin
    .from('collecteurs')
    .update({ titulaire_id: patron.id })
    .eq('id', awa.id);
  expect(error).toBeNull();

  return { patron, awa, carteId: await carteDe(awa) };
}

function corpsPour(carteId: string, montant = 1000) {
  return {
    miseId: crypto.randomUUID(),
    carteId,
    montant,
    encaisseLe: new Date().toISOString(),
  };
}

describe('collecteur-encaisser-pour', () => {
  it('refuse sans jeton', async () => {
    const reponse = await appeler(null, corpsPour(crypto.randomUUID()));
    // Le statut seul, comme dans `super-admin-fonctions` et
    // `super-admin-journal-route` : `verify_jwt` est actif sur cette route, donc
    // c'est la passerelle qui répond, et son corps n'est pas le nôtre. La
    // branche `JETON_ABSENT` de la fonction reste une seconde barrière, jamais
    // atteinte tant que la passerelle est devant.
    expect(reponse.status).toBe(401);
  });

  it('rend 404 sur une carte hors équipe, exactement comme sur une carte absente', async () => {
    const { patron } = await equipe();
    const etranger = await creerCollecteur('Étranger Enc', telephone());
    const carteEtrangere = await carteDe(etranger);

    const jeton = await jetonDe(patron);
    const horsEquipe = await appeler(jeton, corpsPour(carteEtrangere));
    const absente = await appeler(jeton, corpsPour('00000000-0000-4000-8000-000000000000'));

    // Les deux réponses doivent être indiscernables : les distinguer dirait à
    // l'appelant si la carte existe.
    expect(horsEquipe.status).toBe(404);
    expect(absente.status).toBe(404);
    expect(await horsEquipe.json()).toEqual(await absente.json());

    // Et rien n'a été écrit sur la carte de l'étranger.
    const { count } = await admin
      .from('mises')
      .select('id', { count: 'exact', head: true })
      .eq('carte_id', carteEtrangere);
    expect(count).toBe(0);
  });

  it('encaisse sur la carte du collaborateur, et attribue l’argent au titulaire', async () => {
    const { patron, awa, carteId } = await equipe();
    const corps = corpsPour(carteId);

    const reponse = await appeler(await jetonDe(patron), corps);
    expect(reponse.status).toBe(201);

    const { data } = await admin
      .from('mises')
      .select('collecteur_id, encaisse_par, est_commission')
      .eq('id', corps.miseId)
      .single();
    // La carte reste à Awa…
    expect(data?.collecteur_id).toBe(awa.id);
    // …mais le billet est dans la poche du titulaire.
    expect(data?.encaisse_par).toBe(patron.id);
    // La première mise du cycle reste la commission, quel que soit qui encaisse.
    expect(data?.est_commission).toBe(true);
  });

  it('laisse un collecteur encaisser sur sa propre carte', async () => {
    const seul = await creerCollecteur('Seul Enc', telephone());
    const carteId = await carteDe(seul);
    const corps = corpsPour(carteId);

    const reponse = await appeler(await jetonDe(seul), corps);
    expect(reponse.status).toBe(201);

    const { data } = await admin
      .from('mises')
      .select('encaisse_par')
      .eq('id', corps.miseId)
      .single();
    expect(data?.encaisse_par).toBe(seul.id);
  });

  it('rejoue une mise déjà enregistrée en doublon, sans la compter deux fois', async () => {
    const { patron, carteId } = await equipe();
    const corps = corpsPour(carteId);
    const jeton = await jetonDe(patron);

    expect((await appeler(jeton, corps)).status).toBe(201);
    const rejeu = await appeler(jeton, corps);
    expect(rejeu.status).toBe(409);
    expect((await rejeu.json()).erreur).toBe('DOUBLON');

    const { count } = await admin
      .from('mises')
      .select('id', { count: 'exact', head: true })
      .eq('carte_id', carteId);
    expect(count).toBe(1);
  });

  it('laisse les bornes du déclencheur s’appliquer, sans les recopier', async () => {
    const { patron, carteId } = await equipe();
    const jeton = await jetonDe(patron);

    // La carte porte une mise de 1 000. Un montant différent est refusé par
    // `mises_avant_insert`, pas par cette fonction.
    const mauvais = await appeler(jeton, corpsPour(carteId, 500));
    expect(mauvais.status).toBe(409);
    expect((await mauvais.json()).erreur).toBe('MONTANT_INVALIDE');
  });
});
