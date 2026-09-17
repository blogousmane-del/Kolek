import { MISES_PAR_CYCLE, formatMontant, soldeRestituable } from '@kolek/core';

import type { Carte } from './lectures';
import { chargerTout } from './pagination';
import { collecteurCourant, lectureCourante } from './hors-ligne/moteur';
import { TourneeAbsente, ficheDepuis, profilDepuis, rapprochementDepuis } from './hors-ligne/vues';
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

  // ## Pourquoi ces trois lectures épuisent leurs pages
  //
  // PostgREST applique `max_rows = 1000` sans erreur ni en-tête. Le bilan
  // **somme de l'argent** : une troncature ne casse rien visiblement, elle rend
  // un total plus petit que la réalité, et le collecteur n'a aucun moyen de
  // s'en apercevoir.
  //
  // Le cas n'est pas théorique. Trente jours à cinquante encaissements par jour
  // font mille cinq cents lignes de mouvements : au-delà du millier, « encaissé
  // sur 30 jours » se met à mentir vers le bas. `cartes` et `clients` sont,
  // elles, sans borne de date et grandissent avec l'ancienneté du collecteur.
  //
  // `order('id')` avant `range` : une pagination sur un ordre non total peut
  // rendre deux fois la même ligne et en sauter une autre.
  const [rMouvements, rCartes, rClients] = await Promise.all([
    chargerTout((debut, fin) =>
      supabase
        .from('mouvements')
        .select('nature, sens, montant, est_commission, survenu_le')
        .gte('survenu_le', depuis)
        .order('id')
        .range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase
        .from('cartes')
        .select('id, mise, statut, mises_encaissees, ouverte_le, cloturee_le')
        .order('id')
        .range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase.from('clients').select('id').order('id').range(debut, fin),
    ),
  ]);

  const mouvements = (rMouvements.data ?? []) as Array<{
    nature: string;
    sens: number;
    montant: number;
    est_commission: boolean;
    survenu_le: string;
  }>;
  const cartes = (rCartes.data ?? []) as Array<{
    id: string;
    mise: number;
    statut: 'active' | 'cloturee';
    mises_encaissees: number;
    ouverte_le: string;
    cloturee_le: string | null;
  }>;

  const bornes: Array<[string, number]> = [
    ['Aujourd’hui', 0],
    ['7 derniers jours', 6],
    ['30 derniers jours', 29],
  ];

  const tranches = bornes.map(([libelle, recul]) => {
    const seuil = ilYA(recul).getTime();
    const dedans = (quand: string) => new Date(quand).getTime() >= seuil;
    const retenus = mouvements.filter((m) => dedans(m.survenu_le));
    // Les entrées : mises et rattrapages. Un rattrapage est de l'argent
    // réellement encaissé — une mise que le serveur a refusée.
    const entrees = retenus.filter((m) => m.sens === 1);

    return {
      libelle,
      encaisse: entrees.reduce((t, m) => t + m.montant, 0),
      commissions: entrees.filter((m) => m.est_commission).reduce((t, m) => t + m.montant, 0),
      nombreMises: entrees.length,
      cartesOuvertes: cartes.filter((c) => dedans(c.ouverte_le)).length,
      cartesCloturees: cartes.filter((c) => c.cloturee_le !== null && dedans(c.cloturee_le)).length,
      // Les retraits seuls : une sortie de caisse n'est pas toujours une
      // restitution de carte.
      restitue: retenus
        .filter((m) => m.nature === 'retrait')
        .reduce((t, m) => t + m.montant, 0),
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

export type NatureEvenement = 'mise' | 'commission' | 'rattrapage' | 'cloture';

/**
 * Une ligne du journal : ce qui s'est passé, et qu'on doit pouvoir relire.
 *
 * ## Pourquoi une clôture de carte est un reçu
 *
 * Jusqu'au 2026-09-17, l'écran « Reçus » ne portait que des versements, et le
 * passé des cartes vivait sur la fiche du client — « Cartes précédentes », avec
 * son propre bouton vers un historique complet. Trois endroits pour une seule
 * question : « qu'est-ce qui s'est passé sur ce compte ? »
 *
 * Ils sont réunis ici. Une carte close est un événement de la même vie que les
 * mises qui l'ont remplie, et un collecteur qui répond à un client ne fait pas
 * la différence entre « le 12 tu as versé » et « le 12 ta carte s'est fermée ».
 * Ce qui les sépare est une nature, pas un écran.
 *
 * ## Le montant ne dit pas la même chose selon la nature
 *
 * Pour un versement, c'est ce qui a été encaissé. Pour une clôture, c'est le
 * **total** encaissé sur la carte — la seule somme qui a un sens à cet instant,
 * puisque la carte ne reçoit plus rien. Les deux sont des francs, et c'est bien
 * pour ça qu'il faut que la nature soit lisible à côté.
 */
export interface EvenementRecu {
  id: string;
  nature: NatureEvenement;
  clientId: string;
  clientNom: string;
  /** L'instant de l'événement, en ISO. */
  survenuLe: string;
  /** Versement : ce qui a été encaissé. Clôture : le total encaissé sur la carte. */
  montant: number;
  /** La mise du carnet : elle dit si on a encaissé le bon montant. */
  mise: number;
  /** Clôture seulement : l'identifiant de la carte, pour aller chercher son
      détail à la demande. Les mises d'une carte close sont souvent hors de
      la fenêtre du journal, et c'est précisément celles qu'on vient lire
      quand un client conteste un cycle ancien. */
  carteId?: string;
  /** Clôture seulement : où en était le cycle, et depuis quand la carte courait. */
  cycle?: { misesEncaissees: number; ouverteLe: string };
}

/**
 * Le journal complet, relisible à voix haute devant le client.
 *
 * Deux sources, un seul ordre. Les versements viennent de `mouvements`, les
 * clôtures de `cartes` : ni l'une ni l'autre ne connaît l'autre, et c'est ici
 * qu'on les met sur la même frise, la plus récente d'abord.
 *
 * ## La limite est une fenêtre, et l'écran le dit
 *
 * On ne charge pas tout. Un collecteur de deux ans a des dizaines de milliers
 * de mouvements, et les ramener pour en montrer vingt serait payer la 3G du
 * marché pour rien. La fenêtre est donc bornée, et l'écran écrit combien il
 * tient : une liste qui s'arrête sans le dire est un mensonge, une liste qui
 * annonce sa borne est un outil.
 *
 * Cartes et clients sont chargés entiers, eux, parce qu'ils **nomment** les
 * lignes : coupés, un reçu récent s'afficherait « Client inconnu » à une mise
 * de 0. C'est le même raisonnement que `chargerBilan`.
 */
export async function chargerJournal(limite = 200): Promise<EvenementRecu[]> {
  const [rVersements, rCartes, rClients] = await Promise.all([
    supabase
      .from('mouvements')
      .select('id, nature, carte_id, montant, est_commission, survenu_le')
      .eq('sens', 1)
      .order('survenu_le', { ascending: false })
      .limit(limite),
    chargerTout((debut, fin) =>
      supabase
        .from('cartes')
        .select('id, client_id, mise, statut, mises_encaissees, ouverte_le, cloturee_le')
        .order('id')
        .range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase.from('clients').select('id, nom').order('id').range(debut, fin),
    ),
  ]);

  type LigneCarte = {
    id: string;
    client_id: string;
    mise: number;
    statut: 'active' | 'cloturee';
    mises_encaissees: number;
    ouverte_le: string;
    cloturee_le: string | null;
  };

  const lignesCartes = (rCartes.data ?? []) as LigneCarte[];
  const cartes = new Map(lignesCartes.map((c) => [c.id, c]));
  const noms = new Map(
    ((rClients.data ?? []) as Array<{ id: string; nom: string }>).map((c) => [c.id, c.nom]),
  );
  const nommer = (clientId: string | undefined) =>
    (clientId ? noms.get(clientId) : undefined) ?? 'Client inconnu';

  const versements = (
    (rVersements.data ?? []) as Array<{
      id: string;
      nature: 'mise' | 'rattrapage';
      carte_id: string;
      montant: number;
      est_commission: boolean;
      survenu_le: string;
    }>
  ).map((m): EvenementRecu => {
    const carte = cartes.get(m.carte_id);
    return {
      id: m.id,
      // La commission passe avant le rattrapage : une première mise refusée
      // puis rattrapée reste une commission, et c'est ce que le client entend.
      nature: m.est_commission ? 'commission' : m.nature === 'rattrapage' ? 'rattrapage' : 'mise',
      clientId: carte?.client_id ?? '',
      clientNom: nommer(carte?.client_id),
      survenuLe: m.survenu_le,
      montant: m.montant,
      mise: carte?.mise ?? 0,
    };
  });

  const clotures = lignesCartes
    .filter((c): c is LigneCarte & { cloturee_le: string } =>
      Boolean(c.statut === 'cloturee' && c.cloturee_le),
    )
    .sort((a, b) => b.cloturee_le.localeCompare(a.cloturee_le))
    .slice(0, limite)
    .map(
      (c): EvenementRecu => ({
        id: `cloture-${c.id}`,
        nature: 'cloture',
        carteId: c.id,
        clientId: c.client_id,
        clientNom: nommer(c.client_id),
        survenuLe: c.cloturee_le,
        montant: c.mises_encaissees * c.mise,
        mise: c.mise,
        cycle: { misesEncaissees: c.mises_encaissees, ouverteLe: c.ouverte_le },
      }),
    );

  return [...versements, ...clotures].sort((a, b) => b.survenuLe.localeCompare(a.survenuLe));
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

  // Chaque liste épuise ses pages : `max_rows = 1000` tronque sans erreur (voir
  // `chargerBilan`). Ici la troncature ne se contente pas de manquer, elle
  // invente : une mise coupée fait retomber sa carte sur la date d'ouverture, et
  // l'écran annonce « 30 jours sans mise » d'un client passé hier. Mesuré le
  // 2026-09-11 : 579 mises en trente jours pour le plus actif des collecteurs.
  //
  // Les mises gardent leur tri décroissant — la boucle plus bas retient la
  // première vue par carte — et prennent `id` en second : deux mises peuvent
  // partager l'instant, et une pagination sur un ordre non total saute des lignes.
  const [rCartes, rClients, rMises, rCollecteur] = await Promise.all([
    chargerTout((debut, fin) =>
      supabase
        .from('cartes')
        .select('id, client_id, mise, statut, mises_encaissees, ouverte_le')
        .order('id')
        .range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase.from('clients').select('id, nom').order('id').range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase
        .from('mouvements')
        .select('carte_id, survenu_le')
        .eq('sens', 1)
        .gte('survenu_le', fenetre)
        .order('survenu_le', { ascending: false })
        .order('id')
        .range(debut, fin),
    ),
    supabase.from('collecteurs').select('abonnement_statut, abonnement_echeance').maybeSingle(),
  ]);

  const noms = new Map(
    ((rClients.data ?? []) as Array<{ id: string; nom: string }>).map((c) => [c.id, c.nom]),
  );

  /** Dernier versement connu par carte — mise ou rattrapage. La liste arrive
      déjà triée décroissante. */
  const derniereMise = new Map<string, string>();
  for (const m of (rMises.data ?? []) as Array<{ carte_id: string; survenu_le: string }>) {
    if (!derniereMise.has(m.carte_id)) derniereMise.set(m.carte_id, m.survenu_le);
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
        titre: `${nom} : cycle terminé`,
        // « La carte doit être clôturée » : c'était vrai tant qu'un client ne
        // pouvait tenir qu'une carte à la fois — il fallait fermer l'ancienne
        // pour en ouvrir une neuve, donc rendre l'argent. La contrainte est
        // tombée le 2026-08-25, et l'obligation avec elle. Une alerte qui
        // présente un choix comme un devoir pousse le collecteur à réclamer une
        // clôture que personne ne demande, et à rendre un argent que le client
        // voulait garder.
        detail: `Les ${MISES_PAR_CYCLE} mises sont encaissées. Tu peux lui restituer ${formatMontant(du)} FCFA, ou lui activer une carte de plus : son solde lui reste dû tant qu'il n'y a pas eu de retrait.`,
      });
      continue;
    }

    if (carte.mises_encaissees === MISES_PAR_CYCLE - 1) {
      alertes.push({
        cle: `derniere-${carte.id}`,
        gravite: 'attention',
        titre: `${nom} : dernière mise`,
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
        titre: `${nom} : ${jours} jours sans mise`,
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
  /** Posé par le serveur depuis les mises ; recalculé sur le téléphone tant que
      `provisoire`. Le collecteur ne l'écrit jamais. */
  cashAttendu: number;
  /** Ce que le collecteur déclare avoir en main. `null` s'il n'a rien déclaré. */
  cashDeclare: number | null;
  ecart: number | null;
  /** Le téléphone compte ce que le serveur n'a pas encore reçu — ou la tournée
      date d'avant aujourd'hui. Les chiffres du serveur reviennent au
      rafraîchissement. */
  provisoire: boolean;
}

/** La caisse du jour, lue sur la tournée du téléphone (spec J2b §5.4). */
export async function chargerRapprochement(): Promise<Rapprochement> {
  // Lu au même instant que `lectureCourante` le lit : la main qui compte est
  // celle de la tournée lue.
  const collecteurId = collecteurCourant();
  const { tournee, operations } = await lectureCourante();
  if (collecteurId === null || tournee.lueLe === null) throw new TourneeAbsente();
  return rapprochementDepuis(tournee, operations, Date.now(), collecteurId);
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
  /**
   * L’identifiant du titulaire, ou `null` pour un titulaire comme pour un
   * collecteur seul — les deux sont le même état.
   *
   * C’est ce qui décide à qui revient la commission de la première mise, et donc
   * ce que quatre écrans annoncent au collecteur. La colonne est lisible parce
   * que la migration `20260902100000` l’a explicitement accordée : `collecteurs`
   * est en GRANT de colonne, et une colonne neuve n’y est lisible par personne
   * tant qu’on ne l’ajoute pas.
   */
  titulaireId: string | null;
}

/**
 * Le profil gardé sur le téléphone, et les comptes de la tournée (spec J2b
 * §5.4). Lu hors ligne : l'abonnement décide au geste de ce qu'on peut
 * inscrire (§7), et la coquille doit dire qui est connecté.
 *
 * Lève `TourneeAbsente` quand le profil n'a jamais été lu. Les crochets de
 * `commission.ts` retombent alors sur leurs valeurs par défaut — abonnement
 * présumé actif, pas de collaborateur, pas de titulaire. Ces valeurs ne sont
 * pas la sécurité : le serveur refuse ensuite ce qui doit l'être.
 */
export async function chargerProfil(): Promise<Profil> {
  const { tournee, profil } = await lectureCourante();
  return profilDepuis(profil, tournee);
}

/* ------------------------ Cartes clôturables (Retrait) ------------------- */

export interface CarteCloturable {
  carteId: string;
  /** Nécessaire pour ouvrir une carte de plus depuis l'écran Retrait, quand le
      client préfère laisser son argent plutôt que le reprendre. Le `select`
      lisait déjà `client_id` pour résoudre le nom : c'est une propriété de plus
      dans l'objet, pas une requête de plus. */
  clientId: string;
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
 * plus.
 *
 * Les cartes complètes remontent en tête — non parce qu'elles devraient être
 * clôturées, ce qui n'est plus vrai depuis le 2026-08-25, mais parce que c'est
 * là qu'une décision se présente : rendre l'argent, ou ouvrir une carte de plus.
 * Le client garde son solde tant qu'il ne l'a pas repris.
 */
export async function chargerCartesCloturables(): Promise<CarteCloturable[]> {
  // Épuisées par pages : une carte coupée ici disparaît de l'écran Retrait, et
  // le collecteur ne peut plus rendre son argent à ce client. Voir `chargerBilan`.
  const [rCartes, rClients] = await Promise.all([
    chargerTout((debut, fin) =>
      supabase
        .from('cartes')
        .select('id, client_id, mise, statut, mises_encaissees')
        .order('id')
        .range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase.from('clients').select('id, nom').order('id').range(debut, fin),
    ),
  ]);

  // Une lecture en échec ne rend pas une liste vide : hors ligne, l'écran dirait
  // « Aucune carte active » d'un client qui en a une (spec J2b §8.9).
  if (rCartes.error) throw rCartes.error;
  if (rClients.error) throw rClients.error;

  const noms = new Map(
    ((rClients.data ?? []) as Array<{ id: string; nom: string }>).map((c) => [c.id, c.nom]),
  );

  return ((rCartes.data ?? []) as Carte[])
    .filter((c) => c.statut === 'active')
    .map((c) => ({
      carteId: c.id,
      clientId: c.client_id,
      clientNom: noms.get(c.client_id) ?? 'Client',
      mise: c.mise,
      misesEncaissees: c.mises_encaissees,
      restituable: soldeRestituable(c.mises_encaissees, c.mise),
      cycleComplet: c.mises_encaissees >= MISES_PAR_CYCLE,
    }))
    .sort((a, b) => b.misesEncaissees - a.misesEncaissees);
}

/* ------------------------------ Avis clients ----------------------------- */

export interface AvisEnvoye {
  id: string;
  clientNom: string;
  destinataire: string;
  corps: string;
  statut: 'a_envoyer' | 'envoye' | 'echoue' | 'abandonne' | 'quota_atteint';
  creeLe: string;
  envoyeLe: string | null;
}

export interface EtatAvis {
  /** `null` tant que GTCS n'a rien réglé : l'état par défaut du produit. */
  canal: 'aucun' | 'sms' | 'whatsapp' | null;
  surMise: boolean;
  surRetrait: boolean;
  surOuverture: boolean;
  quotaMensuel: number;
  segmentsConsommes: number;
  clientsConsentants: number;
  avis: AvisEnvoye[];
}

/**
 * Ce que le collecteur peut savoir des avis envoyés à ses clients.
 *
 * Lecture seule, et c'est structurel : `avis_reglages` et `avis_clients`
 * n'accordent que le `select` à `authenticated`. Le collecteur voit ce qui est
 * parti — c'est sa preuve à lui le jour où un client conteste — mais il ne peut
 * ni rédiger un message ni relever son propre quota.
 *
 * Le nom du client est joint ici plutôt que stocké dans l'avis : le corps du
 * message ne nomme personne, délibérément, et cet écran a besoin de savoir de
 * qui il parle.
 */
export async function chargerEtatAvis(limite = 30): Promise<EtatAvis> {
  const [rReglages, rAvis, rClients] = await Promise.all([
    supabase
      .from('avis_reglages')
      .select('canal, sur_mise, sur_retrait, sur_ouverture, quota_mensuel, segments_consommes')
      .maybeSingle(),
    supabase
      .from('avis_clients')
      .select('id, client_id, destinataire, corps, statut, cree_le, envoye_le')
      .order('cree_le', { ascending: false })
      .limit(limite),
    // Épuisés par pages : le compte des clients consentants plafonnerait à 1000.
    chargerTout((debut, fin) =>
      supabase
        .from('clients')
        .select('id, nom, avis_actifs, telephone')
        .order('id')
        .range(debut, fin),
    ),
  ]);

  const r = (rReglages.data ?? null) as Record<string, unknown> | null;
  const clients = (rClients.data ?? []) as Array<{
    id: string;
    nom: string;
    avis_actifs: boolean;
    telephone: string | null;
  }>;
  const noms = new Map(clients.map((c) => [c.id, c.nom]));

  return {
    canal: (r?.canal as EtatAvis['canal']) ?? null,
    surMise: Boolean(r?.sur_mise),
    surRetrait: Boolean(r?.sur_retrait),
    surOuverture: Boolean(r?.sur_ouverture),
    quotaMensuel: Number(r?.quota_mensuel ?? 0),
    segmentsConsommes: Number(r?.segments_consommes ?? 0),
    clientsConsentants: clients.filter((c) => c.avis_actifs && c.telephone).length,
    avis: (
      (rAvis.data ?? []) as Array<Record<string, string | null>>
    ).map((a) => ({
      id: String(a.id),
      clientNom: noms.get(String(a.client_id)) ?? 'Client retiré',
      destinataire: String(a.destinataire),
      corps: String(a.corps),
      statut: a.statut as AvisEnvoye['statut'],
      creeLe: String(a.cree_le),
      envoyeLe: a.envoye_le,
    })),
  };
}

/* ------------------------------ Fiche client ----------------------------- */

export interface CarteFiche {
  id: string;
  mise: number;
  statut: 'active' | 'cloturee';
  misesEncaissees: number;
  ouverteLe: string;
  clotureeLe: string | null;
}

export interface MiseFiche {
  id: string;
  montant: number;
  encaisseLe: string;
  estCommission: boolean;
}

export interface FicheClient {
  id: string;
  nom: string;
  telephone: string | null;
  marche: string | null;
  activite: string | null;
  avisActifs: boolean;
  /** Toutes ses cartes, la plus récente d'abord. */
  cartes: CarteFiche[];
  /** Ses derniers versements : ceux de ses cartes actives, et ceux du jour (spec J2b §5.1). */
  mises: MiseFiche[];
}

/**
 * Tout ce que le collecteur doit savoir d'un client, lu sur la tournée du
 * téléphone (spec J2b §5.4) : ses cartes, et les mises de ses cartes actives et
 * du jour. L'historique complet d'une carte clôturée reste en ligne
 * (`chargerHistoriqueCarte`).
 *
 * `null` : ce client n'est pas sur ce téléphone.
 */
export async function chargerFicheClient(clientId: string): Promise<FicheClient | null> {
  const { tournee } = await lectureCourante();
  return ficheDepuis(tournee, clientId);
}

/* ------------------------ Historique d'une carte ------------------------- */

/**
 * Un événement du passé d'une carte : une mise encaissée, ou sa clôture.
 *
 * `estCommission` ne figurait pas dans le plan du 2026-09-10, et son absence
 * était un défaut. La base porte `mises.est_commission`, posé par un
 * déclencheur `BEFORE` et garanti unique par carte par un index partiel. Sans
 * ce drapeau, le niveau 2 de l'écran listerait trente-et-une mises de 5 000
 * sous un solde restituable de 150 000, et le client compterait 155 000 — sur
 * l'écran même où il vient contester une somme.
 *
 * Le déduire de la position — « la première encaissée » — aurait marché
 * aujourd'hui et menti le jour où la base en décide autrement. Elle sait ; on
 * lit.
 */
export interface EvenementCarte {
  id: string;
  genre: 'mise' | 'retrait' | 'rattrapage';
  /** Pour une mise ou un rattrapage, le montant versé. Pour un retrait, ce qui
      a été rendu. */
  montant: number;
  /** ISO 8601, tel que la base l'a écrit. */
  date: string;
  /** La seule mise que la base a marquée commission. Toujours faux ailleurs. */
  estCommission: boolean;
}

/**
 * Le passé d'une carte, mises et clôture mêlées, du plus récent au plus ancien.
 *
 * ## Pourquoi il n'y a ni `limit` ni pagination
 *
 * Borné par construction : une carte porte `MISES_PAR_CYCLE` cases, donc au
 * plus 31 mises, et `retraits.carte_id` est unique — donc au plus un retrait.
 * Trente-et-une mises, un retrait, et un rattrapage par refus : quelques
 * dizaines de lignes, bornées par le cycle. C'est tout l'intérêt d'avoir pris la carte
 * pour unité plutôt que le mois : le mois n'a pas de borne, la carte en a une,
 * et elle est dans le schéma.
 *
 * `chargerFicheClient` ne pouvait pas servir ici : elle lit 40 mises toutes
 * cartes confondues et **sans `carte_id`**, donc impossibles à rattacher.
 *
 * ## Pourquoi cette lecture lève au lieu de rendre une liste vide
 *
 * Une erreur PostgREST rend `data: null`. Traitée par `?? []`, elle donne un
 * écran qui dit « ce client n'a rien versé » — le pire mensonge possible sur un
 * écran d'historique, et impossible à distinguer d'une carte neuve. Deux autres
 * lectures de ce fichier lèvent déjà pour la même raison.
 */
export async function chargerHistoriqueCarte(carteId: string): Promise<EvenementCarte[]> {
  const { data, error } = await supabase
    .from('mouvements')
    .select('id, nature, montant, survenu_le, est_commission')
    .eq('carte_id', carteId)
    .order('survenu_le', { ascending: false });

  if (error) throw error;

  const evenements: EvenementCarte[] = (
    (data ?? []) as Array<{
      id: string;
      nature: EvenementCarte['genre'];
      montant: number;
      survenu_le: string;
      est_commission: boolean;
    }>
  ).map((m) => ({
    id: String(m.id),
    genre: m.nature,
    montant: Number(m.montant),
    date: String(m.survenu_le),
    estCommission: Boolean(m.est_commission),
  }));

  // Les dates sont des ISO 8601 en UTC, donc l'ordre lexicographique est
  // l'ordre chronologique — c'est ce que garantit le format, pas une chance.
  //
  // Le comparateur rend bien `0` sur l'égalité. Un `a.date < b.date ? 1 : -1`
  // dirait « a avant b » **et** « b avant a » pour deux horodatages identiques,
  // et deux mises encaissées dans la même seconde est un cas ordinaire au
  // marché.
  return evenements.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/* ---------------------------- L'équipe (titulaire) ----------------------- */

export interface MembreEquipe {
  id: string;
  nom: string;
  telephone: string | null;
  clients: number;
  cartesActives: number;
  /** Ce que ses clients ont versé et qui leur est encore dû. */
  encours: number;
  /** Les commissions de ses cartes. Elles reviennent au titulaire : c'est pour
      cela qu'elles figurent ici, et qu'elles ont disparu du Bilan du
      collaborateur. */
  commissions: number;
  /** `null` tant qu'il n'a pas déclaré sa caisse aujourd'hui. Un zéro à la
      place serait un chiffre inventé, que le titulaire lirait comme « tout va
      bien ». */
  cashAttendu: number | null;
  cashDeclare: number | null;
  ecart: number | null;
  derniereDeclaration: string | null;
}

/**
 * L'équipe de l'utilisateur, ou un tableau vide.
 *
 * Passe par `equipe_vue()`, une fonction `security definer` **sans paramètre** :
 * l'identité vient de `auth.uid()` côté serveur, donc il n'existe aucune manière
 * de demander l'équipe de quelqu'un d'autre.
 *
 * Aucune policy RLS n'a été élargie pour cet écran, et c'est délibéré : les 35
 * autres lectures de ce fichier gardent leur sens exact. Quand l'une d'elles
 * somme les mises du jour, elle somme toujours **les miennes**.
 */
export async function chargerEquipe(): Promise<MembreEquipe[]> {
  const { data, error } = await supabase.rpc('equipe_vue');
  if (error) throw error;

  const lignes = (data ?? []) as Array<Record<string, unknown>>;
  return lignes.map((l) => ({
    id: String(l.id),
    nom: String(l.nom ?? 'Collaborateur'),
    telephone: (l.telephone as string | null) ?? null,
    clients: Number(l.clients ?? 0),
    cartesActives: Number(l.cartes_actives ?? 0),
    encours: Number(l.encours ?? 0),
    commissions: Number(l.commissions ?? 0),
    cashAttendu: l.cash_attendu == null ? null : Number(l.cash_attendu),
    cashDeclare: l.cash_declare == null ? null : Number(l.cash_declare),
    ecart: l.ecart == null ? null : Number(l.ecart),
    derniereDeclaration: (l.derniere_declaration as string | null) ?? null,
  }));
}

export interface CarteCoequipier {
  id: string;
  mise: number;
  misesEncaissees: number;
  soldeRestituable: number;
}

export interface ClientCoequipier {
  id: string;
  nom: string;
  telephone: string | null;
  cartes: CarteCoequipier[];
}

/**
 * Les clients d'un coéquipier, avec leurs cartes actives.
 *
 * `equipe_clients` vérifie son paramètre côté serveur et rend un tableau vide
 * pour tout identifiant hors équipe — y compris un identifiant qui existe bel et
 * bien ailleurs. Cet appel ne doit donc rien vérifier de son côté : refaire ici
 * le contrôle fabriquerait une seconde règle, et deux règles divergent.
 */
export async function chargerClientsCollaborateur(
  collaborateurId: string,
): Promise<ClientCoequipier[]> {
  const { data, error } = await supabase.rpc('equipe_clients', {
    p_collaborateur: collaborateurId,
  });
  if (error) throw error;

  const lignes = (data ?? []) as Array<Record<string, unknown>>;
  return lignes.map((l) => ({
    id: String(l.id),
    nom: String(l.nom ?? 'Client'),
    telephone: (l.telephone as string | null) ?? null,
    cartes: ((l.cartes ?? []) as Array<Record<string, unknown>>).map((c) => ({
      id: String(c.id),
      mise: Number(c.mise ?? 0),
      misesEncaissees: Number(c.mises_encaissees ?? 0),
      soldeRestituable: Number(c.solde_restituable ?? 0),
    })),
  }));
}
