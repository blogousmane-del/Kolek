import { admin, type CollecteurTest } from './harnais';

/**
 * Le jeu d'essai piégé du registre des mouvements.
 *
 * C'est le scénario de la spec J1 §4.5, posé en base : une carte à 1 000 FCFA
 * la mise, **trente** mises arrivées au serveur, clôturée — 29 000 rendus,
 * 1 000 de commission — plus **un rattrapage de 1 000**, la trente-et-unième
 * mise, encaissée pour de vrai et refusée par le serveur.
 *
 * Tout lecteur d'argent doit donc annoncer **31 000 encaissés** et **1 000 dus
 * au client**. Un lecteur resté sur `mises` seule annonce 30 000 et 0 : son
 * épreuve devient rouge en développement, au lieu de mentir en production.
 *
 * Le montant rendu, lui, reste **29 000** : le solde d'une carte close se
 * calcule par compteur × mise, et le rattrapage ne le change pas.
 */
export const MISE_PIEGE = 1000;
export const MISES_AU_SERVEUR = 30;

/** Ce que tout lecteur doit rendre sur ce jeu. */
export const ATTENDU_PIEGE = {
  encaisse: 31_000,
  commissions: 1_000,
  restitue: 29_000,
  versements: 31,
  duAuClient: 1_000,
  /** Les entrées du jour moins les sorties du jour : 30 000 + 1 000 − 29 000. */
  caisseDuJour: 2_000,
} as const;

export interface CartePiegee {
  clientId: string;
  carteId: string;
  rejetId: string;
  /** Le jour UTC où tout s'est passé, `AAAA-MM-JJ`. */
  jour: string;
}

export interface JeuPiege extends CartePiegee {
  rattrapageId: string;
}

/** Le jour UTC d'il y a `recul` jours. */
export function jourUtc(recul: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - recul);
  return d.toISOString().slice(0, 10);
}

function exiger(etiquette: string, erreur: { message: string } | null): void {
  if (erreur) throw new Error(`Jeu piégé « ${etiquette} » : ${erreur.message}`);
}

/** Un refus de synchro consigné, celui dont naîtra le rattrapage. */
export async function poserRefus(
  c: CollecteurTest,
  cible: { carteId: string; jour: string },
): Promise<string> {
  const id = crypto.randomUUID();
  exiger(
    'refus',
    (
      await admin.from('synchro_rejets').insert({
        id,
        collecteur_id: c.id,
        motif: 'CARTE_CLOTUREE',
        charge_utile: {
          type: 'mise',
          carteId: cible.carteId,
          montant: MISE_PIEGE,
          encaisseLe: `${cible.jour}T19:00:00Z`,
        },
      })
    ).error,
  );
  return id;
}

/**
 * La carte du scénario : trente mises, la clôture, et le refus de la
 * trente-et-unième. Tout est daté du même jour UTC, `recul` jours en arrière.
 *
 * Les mises une par une, jamais en lot : les déclencheurs `AFTER` sont différés
 * en fin d'instruction, donc un lot verrait toutes les mises avec le même
 * compteur et les marquerait toutes commission.
 */
export async function poserCartePiegee(c: CollecteurTest, recul = 3): Promise<CartePiegee> {
  const jour = jourUtc(recul);
  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();

  exiger(
    'client',
    (await admin.from('clients').insert({ id: clientId, collecteur_id: c.id, nom: 'Cliente piégée' }))
      .error,
  );
  exiger(
    'carte',
    (
      await admin
        .from('cartes')
        .insert({ id: carteId, collecteur_id: c.id, client_id: clientId, mise: MISE_PIEGE })
    ).error,
  );

  for (let i = 0; i < MISES_AU_SERVEUR; i += 1) {
    exiger(
      `mise ${i}`,
      (
        await admin.from('mises').insert({
          id: crypto.randomUUID(),
          collecteur_id: c.id,
          carte_id: carteId,
          montant: MISE_PIEGE,
          encaisse_le: `${jour}T08:${String(i).padStart(2, '0')}:00Z`,
        })
      ).error,
    );
  }

  // Par `admin` : aucune politique n'autorise `authenticated` à écrire dans
  // `retraits`. (30 − 1) × 1 000 — la première mise est la commission.
  exiger(
    'retrait',
    (
      await admin.from('retraits').insert({
        collecteur_id: c.id,
        carte_id: carteId,
        montant_restitue: (MISES_AU_SERVEUR - 1) * MISE_PIEGE,
        commission: MISE_PIEGE,
        effectue_le: `${jour}T20:00:00Z`,
      })
    ).error,
  );
  exiger(
    'clôture',
    (
      await admin
        .from('cartes')
        .update({ statut: 'cloturee', cloturee_le: `${jour}T20:00:00Z` })
        .eq('id', carteId)
    ).error,
  );

  return { clientId, carteId, rejetId: await poserRefus(c, { carteId, jour }), jour };
}

/**
 * Le rattrapage : la mise refusée, enregistrée comme dette.
 *
 * `mainId` par défaut le propriétaire ; `encaisseLe` par défaut l'heure de la
 * mise refusée, jamais celle de la saisie — c'est le jour d'origine qu'il faut
 * réparer.
 */
export async function poserRattrapage(
  c: CollecteurTest,
  cible: CartePiegee,
  options: { mainId?: string; encaisseLe?: string } = {},
): Promise<string> {
  const id = crypto.randomUUID();
  exiger(
    'rattrapage',
    (
      await admin.from('rattrapages').insert({
        id,
        collecteur_id: c.id,
        main_id: options.mainId ?? c.id,
        carte_id: cible.carteId,
        rejet_id: cible.rejetId,
        montant: MISE_PIEGE,
        encaisse_le: options.encaisseLe ?? `${cible.jour}T19:00:00Z`,
      })
    ).error,
  );
  return id;
}

export async function poserJeuPiege(c: CollecteurTest, recul = 3): Promise<JeuPiege> {
  const carte = await poserCartePiegee(c, recul);
  return { ...carte, rattrapageId: await poserRattrapage(c, carte) };
}
