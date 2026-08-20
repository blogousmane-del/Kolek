import { MISES_PAR_CYCLE, formatMontant, soldeRestituable } from '@kolek/core';

import type { Carte, MiseRecente } from './lectures';
import { supabase } from './supabase';

/**
 * Les lectures des six écrans qui restaient éteints.
 *
 * Module distinct de `lectures.ts`, qui sert l'accueil : celui-là est chargé à
 * chaque ouverture de l'application, ceux-ci seulement quand on entre dans
 * l'écran correspondant. Les garder ensemble ferait payer au collecteur, en 3G,
 * du code qu'il n'ouvrira peut-être pas de la journée.
 *
 * Tout se lit avec la session du collecteur et rien d'autre : les politiques RLS
 * bornent chaque `select` à ses propres lignes. Aucune Edge Function, aucune clé
 * privilégiée — sauf la clôture d'une carte, qui écrit dans `retraits`, table
 * volontairement fermée à `authenticated`.
 *
 * Règle tenue partout ici : **ne rendre que ce que la base sait dire.** Un écran
 * vide qui l'assume vaut mieux qu'un chiffre plausible. C'est le défaut qu'on a
 * corrigé sur l'accueil le 2026-08-20, et il ne doit pas revenir par la fenêtre.
 */

/**
 * Le jour au sens du serveur, en UTC.
 *
 * `cash_attendu_du_jour` découpe la journée sur `(encaisse_le at time zone
 * 'UTC')::date`, explicitement et non selon le fuseau de la session. Le
 * rapprochement doit donc demander la même date, sans quoi le collecteur
 * déclarerait son cash pour une journée que le serveur calcule autrement, et
 * l'écart apparaîtrait sans cause visible.
 *
 * Abidjan étant à UTC+0 toute l'année, cela ne change rien aujourd'hui — par
 * géographie, pas par intention. Un téléphone réglé sur un autre fuseau
 * déplacerait la frontière du jour.
 */
function dateUtcDuJour(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Minuit local, il y a `jours` jours. Sert aux tranches du bilan. */
function ilYA(jours: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - jours);
  return d;
}

/* ------------------------------- Bilan ----------------------------------- */

export interface TrancheBilan {
  libelle: string;
  /** Somme encaissée, commission comprise : ce qui est passé de main en main. */
  encaisse: number;
  /** Part revenue au collecteur — la première mise de chaque carte. */
  commissions: number;
  nombreMises: number;
  cartesOuvertes: number;
  cartesCloturees: number;
  restitue: number;
}

export interface Bilan {
  tranches: TrancheBilan[];
  /** Ce que le collecteur doit encore à ses clients, toutes cartes actives. */
  encoursTotal: number;
  clients: number;
  cartesActives: number;
}

/**
 * Trois tranches, une seule descente de réseau.
 *
 * Trente jours de mises tiennent dans quelques kilo-octets ; faire trois
 * requêtes agrégées coûterait trois allers-retours pour le même résultat. Le
 * découpage se fait donc ici, sur des lignes déjà là.
 */
export async function chargerBilan(): Promise<Bilan> {
  const depuis = ilYA(30).toISOString();

  const [rMises, rCartes, rClients, rRetraits] = await Promise.all([
    supabase.from('mises').select('montant, est_commission, encaisse_le').gte('encaisse_le', depuis),
    supabase.from('cartes').select('id, mise, statut, mises_encaissees, ouverte_le, cloturee_le'),
    supabase.from('clients').select('id'),
    supabase.from('retraits').select('montant_restitue, effectue_le').gte('effectue_le', depuis),
  ]);

  const mises = (rMises.data ?? []) as Array<{
    montant: number;
    est_commission: boolean;
    encaisse_le: string;
  }>;
  const cartes = (rCartes.data ?? []) as Array<{
    id: string;
    mise: number;
    statut: 'active' | 'cloturee';
    mises_encaissees: number;
    ouverte_le: string;
    cloturee_le: string | null;
  }>;
  const retraits = (rRetraits.data ?? []) as Array<{
    montant_restitue: number;
    effectue_le: string;
  }>;

  const bornes: Array<[string, number]> = [
    ['Aujourd’hui', 0],
    ['7 derniers jours', 6],
    ['30 derniers jours', 29],
  ];

  const tranches = bornes.map(([libelle, recul]) => {
    const seuil = ilYA(recul).getTime();
    const dedans = (quand: string) => new Date(quand).getTime() >= seuil;
    const retenues = mises.filter((m) => dedans(m.encaisse_le));

    return {
      libelle,
      encaisse: retenues.reduce((t, m) => t + m.montant, 0),
      commissions: retenues.filter((m) => m.est_commission).reduce((t, m) => t + m.montant, 0),
      nombreMises: retenues.length,
      cartesOuvertes: cartes.filter((c) => dedans(c.ouverte_le)).length,
      cartesCloturees: cartes.filter((c) => c.cloturee_le !== null && dedans(c.cloturee_le)).length,
      restitue: retraits
        .filter((r) => dedans(r.effectue_le))
        .reduce((t, r) => t + r.montant_restitue, 0),
    };
  });

  const actives = cartes.filter((c) => c.statut === 'active');

  return {
    tranches,
    encoursTotal: actives.reduce((t, c) => t + soldeRestituable(c.mises_encaissees, c.mise), 0),
    clients: (rClients.data ?? []).length,
    cartesActives: actives.length,
  };
}

/* -------------------------------- Reçus ---------------------------------- */

export interface Recu {
  id: string;
  clientNom: string;
  montant: number;
  estCommission: boolean;
  encaisseLe: string;
  /** Mise du carnet : permet de vérifier qu'on a encaissé le bon montant. */
  mise: number;
}

/**
 * Les derniers encaissements, relisibles à voix haute devant le client.
 *
 * L'identifiant montré est celui de la mise, engendré par le téléphone. Ce n'est
 * pas un numéro d'ordre, et ça ne peut pas l'être : deux téléphones encaissent
 * en même temps, et un compteur croissant côté client se contredirait à la
 * synchronisation. Ses huit premiers caractères suffisent à retrouver la ligne.
 */
export async function chargerRecus(limite = 50): Promise<Recu[]> {
  const [rMises, rCartes, rClients] = await Promise.all([
    supabase
      .from('mises')
      .select('id, carte_id, montant, est_commission, encaisse_le')
      .order('encaisse_le', { ascending: false })
      .limit(limite),
    supabase.from('cartes').select('id, client_id, mise'),
    supabase.from('clients').select('id, nom'),
  ]);

  const cartes = new Map(
    ((rCartes.data ?? []) as Array<{ id: string; client_id: string; mise: number }>).map((c) => [
      c.id,
      c,
    ]),
  );
  const noms = new Map(
    ((rClients.data ?? []) as Array<{ id: string; nom: string }>).map((c) => [c.id, c.nom]),
  );

  return ((rMises.data ?? []) as MiseRecente[]).map((m) => {
    const carte = cartes.get(m.carte_id);
    return {
      id: m.id,
      clientNom: (carte ? noms.get(carte.client_id) : undefined) ?? 'Client inconnu',
      montant: m.montant,
      estCommission: m.est_commission,
      encaisseLe: m.encaisse_le,
      mise: carte?.mise ?? 0,
    };
  });
}

/* ------------------------------- Alertes --------------------------------- */

export type GraviteAlerte = 'action' | 'attention' | 'information';

export interface Alerte {
  cle: string;
  gravite: GraviteAlerte;
  titre: string;
  detail: string;
}

/** Jours sans mise au-delà desquels une carte active est dite dormante. */
const JOURS_DORMANCE = 7;

/**
 * Les alertes ne sont pas une table : elles sont déduites de l'état.
 *
 * Rien ne les stocke, donc rien ne peut les rendre périmées, et il n'y a pas de
 * file à purger. Le revers assumé est qu'elles ne se marquent pas « lues » : une
 * carte à clôturer reste signalée tant qu'elle n'est pas clôturée. C'est
 * exactement ce qu'on veut d'un rappel qui porte sur de l'argent.
 */
export async function chargerAlertes(): Promise<Alerte[]> {
  // Fenêtre bornée, et non « toutes les mises » : au bout d'un an d'activité,
  // une requête sans borne descendrait des milliers de lignes en 3G pour n'en
  // garder qu'une par carte. Quatre-vingt-dix jours dépassent largement le seuil
  // de dormance, donc la fenêtre ne peut pas cacher une carte endormie — et la
  // date d'ouverture sert de repli pour celles qui n'ont aucune mise dedans.
  const fenetre = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const [rCartes, rClients, rMises, rCollecteur] = await Promise.all([
    supabase.from('cartes').select('id, client_id, mise, statut, mises_encaissees, ouverte_le'),
    supabase.from('clients').select('id, nom'),
    supabase
      .from('mises')
      .select('carte_id, encaisse_le')
      .gte('encaisse_le', fenetre)
      .order('encaisse_le', { ascending: false }),
    supabase.from('collecteurs').select('abonnement_statut, abonnement_echeance').maybeSingle(),
  ]);

  const noms = new Map(
    ((rClients.data ?? []) as Array<{ id: string; nom: string }>).map((c) => [c.id, c.nom]),
  );

  /** Dernière mise connue par carte. La liste arrive déjà triée décroissante. */
  const derniereMise = new Map<string, string>();
  for (const m of (rMises.data ?? []) as Array<{ carte_id: string; encaisse_le: string }>) {
    if (!derniereMise.has(m.carte_id)) derniereMise.set(m.carte_id, m.encaisse_le);
  }

  const alertes: Alerte[] = [];
  const actives = ((rCartes.data ?? []) as Array<Carte & { ouverte_le: string }>).filter(
    (c) => c.statut === 'active',
  );

  for (const carte of actives) {
    const nom = noms.get(carte.client_id) ?? 'Client';

    if (carte.mises_encaissees >= MISES_PAR_CYCLE) {
      const du = soldeRestituable(carte.mises_encaissees, carte.mise);
      alertes.push({
        cle: `complete-${carte.id}`,
        gravite: 'action',
        titre: `${nom} — cycle terminé`,
        detail: `Les ${MISES_PAR_CYCLE} mises sont encaissées. La carte doit être clôturée et ${formatMontant(du)} FCFA restitués.`,
      });
      continue;
    }

    if (carte.mises_encaissees === MISES_PAR_CYCLE - 1) {
      alertes.push({
        cle: `derniere-${carte.id}`,
        gravite: 'attention',
        titre: `${nom} — dernière mise`,
        detail: `Encore une mise de ${formatMontant(carte.mise)} FCFA et le cycle est complet.`,
      });
    }

    // Repli sur la date d'ouverture quand aucune mise n'est tombée dans la
    // fenêtre. Sans lui, les cartes les plus endormies — celles sans aucune mise
    // récente — seraient les seules à ne rien déclencher.
    const repere = derniereMise.get(carte.id) ?? carte.ouverte_le;
    const jours = Math.floor((Date.now() - new Date(repere).getTime()) / 86_400_000);

    if (jours >= JOURS_DORMANCE) {
      alertes.push({
        cle: `dormante-${carte.id}`,
        gravite: 'attention',
        titre: `${nom} — ${jours} jours sans mise`,
        detail: derniereMise.has(carte.id)
          ? `Carte à ${carte.mises_encaissees}/${MISES_PAR_CYCLE}. Dernière mise il y a ${jours} jours.`
          : `Carte à ${carte.mises_encaissees}/${MISES_PAR_CYCLE}, ouverte il y a ${jours} jours et sans mise récente.`,
      });
    }
  }

  const collecteur = rCollecteur.data as { abonnement_echeance?: string | null } | null;

  if (collecteur?.abonnement_echeance) {
    const restants = Math.ceil(
      (new Date(collecteur.abonnement_echeance).getTime() - Date.now()) / 86_400_000,
    );
    if (restants < 0) {
      const passes = Math.abs(restants);
      alertes.push({
        cle: 'abonnement-expire',
        gravite: 'action',
        titre: 'Abonnement expiré',
        detail: `Échéance dépassée depuis ${passes} jour${passes > 1 ? 's' : ''}. Contacte GTCS.`,
      });
    } else if (restants <= 7) {
      alertes.push({
        cle: 'abonnement-bientot',
        gravite: 'attention',
        titre: 'Abonnement bientôt échu',
        detail: `Il reste ${restants} jour${restants > 1 ? 's' : ''}.`,
      });
    }
  }

  // L'ordre compte : ce qui demande un geste passe devant ce qui informe.
  const rang: Record<GraviteAlerte, number> = { action: 0, attention: 1, information: 2 };
  return alertes.sort((a, b) => rang[a.gravite] - rang[b.gravite]);
}

/* ---------------------------- Rapprochement ------------------------------ */

export interface Rapprochement {
  date: string;
  /** Calculé par le serveur depuis les mises. Le collecteur ne l'écrit jamais. */
  cashAttendu: number;
  /** Ce que le collecteur déclare avoir en main. `null` s'il n'a rien déclaré. */
  cashDeclare: number | null;
  ecart: number | null;
  /** Identifiant de la ligne du jour, s'il en existe déjà une. */
  ligneId: string | null;
}

export async function chargerRapprochement(): Promise<Rapprochement> {
  const date = dateUtcDuJour();

  const [rCaisse, rMises] = await Promise.all([
    supabase
      .from('caisses_jour')
      .select('id, cash_attendu, cash_declare, ecart')
      .eq('date', date)
      .maybeSingle(),
    supabase.from('mises').select('montant, encaisse_le').gte('encaisse_le', `${date}T00:00:00Z`),
  ]);

  const ligne = rCaisse.data as {
    id: string;
    cash_attendu: number;
    cash_declare: number;
    ecart: number;
  } | null;

  if (ligne) {
    return {
      date,
      cashAttendu: ligne.cash_attendu,
      cashDeclare: ligne.cash_declare,
      ecart: ligne.ecart,
      ligneId: ligne.id,
    };
  }

  // Aucune déclaration encore : on montre l'attendu tel que le serveur le
  // calculerait, sans rien écrire. Même découpage de journée — UTC — que
  // `cash_attendu_du_jour`, sinon le chiffre affiché avant l'enregistrement et
  // celui posé par le déclencheur ne coïncideraient pas.
  const dujour = ((rMises.data ?? []) as Array<{ montant: number; encaisse_le: string }>).filter(
    (m) => m.encaisse_le.slice(0, 10) === date,
  );

  return {
    date,
    cashAttendu: dujour.reduce((t, m) => t + m.montant, 0),
    cashDeclare: null,
    ecart: null,
    ligneId: null,
  };
}

/* -------------------------------- Profil --------------------------------- */

export interface Profil {
  nom: string;
  telephone: string;
  zone: string | null;
  palier: string;
  abonnementStatut: string;
  abonnementEcheance: string | null;
  clients: number;
  cartesActives: number;
}

export async function chargerProfil(): Promise<Profil> {
  const [rCollecteur, rClients, rCartes] = await Promise.all([
    supabase
      .from('collecteurs')
      .select('nom, telephone, zone, palier, abonnement_statut, abonnement_echeance')
      .maybeSingle(),
    supabase.from('clients').select('id'),
    supabase.from('cartes').select('id, statut'),
  ]);

  const c = (rCollecteur.data ?? {}) as Record<string, string | null>;

  return {
    nom: c.nom ?? 'Collecteur',
    telephone: c.telephone ?? '',
    zone: c.zone ?? null,
    palier: c.palier ?? 'essai',
    abonnementStatut: c.abonnement_statut ?? 'actif',
    abonnementEcheance: c.abonnement_echeance ?? null,
    clients: (rClients.data ?? []).length,
    cartesActives: ((rCartes.data ?? []) as Array<{ statut: string }>).filter(
      (x) => x.statut === 'active',
    ).length,
  };
}

/* ------------------------ Cartes clôturables (Retrait) ------------------- */

export interface CarteCloturable {
  carteId: string;
  clientNom: string;
  mise: number;
  misesEncaissees: number;
  /** `(mises − 1) × mise` : la première mise est la commission du collecteur. */
  restituable: number;
  cycleComplet: boolean;
}

/**
 * Les cartes actives, avec ce qu'il faudrait rendre en les clôturant.
 *
 * Une carte incomplète est clôturable, et c'est voulu : un client peut vouloir
 * récupérer son épargne avant la fin du cycle. C'est justement le cas où le
 * montant à rendre n'est pas évident de tête, donc celui où l'écran sert le
 * plus. Les cartes complètes remontent en tête, parce qu'elles, elles **doivent**
 * être clôturées.
 */
export async function chargerCartesCloturables(): Promise<CarteCloturable[]> {
  const [rCartes, rClients] = await Promise.all([
    supabase.from('cartes').select('id, client_id, mise, statut, mises_encaissees'),
    supabase.from('clients').select('id, nom'),
  ]);

  const noms = new Map(
    ((rClients.data ?? []) as Array<{ id: string; nom: string }>).map((c) => [c.id, c.nom]),
  );

  return ((rCartes.data ?? []) as Carte[])
    .filter((c) => c.statut === 'active')
    .map((c) => ({
      carteId: c.id,
      clientNom: noms.get(c.client_id) ?? 'Client',
      mise: c.mise,
      misesEncaissees: c.mises_encaissees,
      restituable: soldeRestituable(c.mises_encaissees, c.mise),
      cycleComplet: c.mises_encaissees >= MISES_PAR_CYCLE,
    }))
    .sort((a, b) => b.misesEncaissees - a.misesEncaissees);
}
