/**
 * La santé du système, jugée.
 *
 * La base mesure (`sante_systeme()`), cette fonction juge, l'écran affiche. Le
 * jugement vit ici plutôt qu'en SQL parce qu'il n'autorise rien : ce sont des
 * seuils de lecture, et une fonction pure se prouve seuil par seuil, de part
 * et d'autre, sans base.
 *
 * Aucun seuil sur la taille de la base ni sur le cache : le plafond du forfait
 * Supabase n'est pas connu, et un voyant réglé sur un plafond inventé serait
 * un chiffre qu'on ne sait pas (Design System, §2, principe 7).
 */

export type NiveauSante = 'normal' | 'attention' | 'alerte';
export type PointSante = 'drainage' | 'releve' | 'avis' | 'rejets' | 'connexions';

/** Ce que `sante_systeme()` mesure, sans les relevés. */
export interface MesuresSante {
  base: { taille: number; connexions: number; max_connexions: number; cache_pct: number | null };
  drainage: {
    derniere_execution: string | null;
    dernier_succes: string | null;
    executions_24h: number;
    echecs_24h: number;
  };
  releve: { dernier_jour: string | null };
  journal_cron: { lignes: number; taille: number };
  files: {
    avis_en_attente: number;
    avis_plus_ancien: string | null;
    avis_abandonnes: number;
    rejets_non_traites: number;
  };
}

export interface Voyant {
  point: PointSante;
  libelle: string;
  niveau: NiveauSante;
  /** Une phrase : ce qui a été constaté, pas ce qu'il faut en penser. */
  raison: string;
}

export interface EvaluationSante {
  /** Le pire des cinq. */
  niveau: NiveauSante;
  voyants: Voyant[];
}

const RANG: Record<NiveauSante, number> = { normal: 0, attention: 1, alerte: 2 };

function minutesDepuis(iso: string, maintenant: Date): number {
  return (maintenant.getTime() - new Date(iso).getTime()) / 60_000;
}

function nombre(n: number, un: string, plusieurs: string): string {
  return `${n} ${n > 1 ? plusieurs : un}`;
}

/** « 2026-09-10 » → « 10/09/2026 ». */
function jourCourt(jour: string): string {
  const [annee, mois, j] = jour.split('-');
  return `${j}/${mois}/${annee}`;
}

function drainage(m: MesuresSante['drainage'], maintenant: Date): Voyant {
  const point = { point: 'drainage' as const, libelle: 'Drainage des avis' };

  if (!m.derniere_execution) {
    return { ...point, niveau: 'alerte', raison: 'Aucune exécution enregistrée.' };
  }
  if (minutesDepuis(m.derniere_execution, maintenant) > 10) {
    return { ...point, niveau: 'alerte', raison: 'Aucune exécution depuis plus de 10 min.' };
  }
  if (m.echecs_24h > 0) {
    return { ...point, niveau: 'attention', raison: `${nombre(m.echecs_24h, 'échec', 'échecs')} sur 24 h.` };
  }
  if (!m.dernier_succes || minutesDepuis(m.dernier_succes, maintenant) > 5) {
    return { ...point, niveau: 'attention', raison: 'Aucun succès depuis plus de 5 min.' };
  }
  return { ...point, niveau: 'normal', raison: 'Exécuté avec succès il y a moins de 5 min.' };
}

function releve(m: MesuresSante['releve'], maintenant: Date): Voyant {
  const point = { point: 'releve' as const, libelle: 'Relevé quotidien' };
  // Abidjan est à UTC+0 : le jour UTC est le sien.
  const hier = new Date(maintenant.getTime() - 86_400_000).toISOString().slice(0, 10);

  if (!m.dernier_jour) {
    return { ...point, niveau: 'alerte', raison: 'Aucun relevé enregistré.' };
  }
  return {
    ...point,
    niveau: m.dernier_jour < hier ? 'alerte' : 'normal',
    raison: `Dernier relevé le ${jourCourt(m.dernier_jour)}.`,
  };
}

function avis(m: MesuresSante['files'], maintenant: Date): Voyant {
  const point = { point: 'avis' as const, libelle: 'Avis clients' };

  if (m.avis_abandonnes > 0) {
    return {
      ...point,
      niveau: 'attention',
      raison: `${nombre(m.avis_abandonnes, 'avis abandonné', 'avis abandonnés')} après 3 tentatives.`,
    };
  }
  if (m.avis_en_attente > 0 && m.avis_plus_ancien && minutesDepuis(m.avis_plus_ancien, maintenant) > 15) {
    return { ...point, niveau: 'attention', raison: 'Un avis attend depuis plus de 15 min.' };
  }
  return {
    ...point,
    niveau: 'normal',
    raison: m.avis_en_attente > 0 ? `${nombre(m.avis_en_attente, 'avis', 'avis')} en cours d’envoi.` : 'Aucun avis en attente.',
  };
}

function rejets(m: MesuresSante['files']): Voyant {
  const point = { point: 'rejets' as const, libelle: 'Rejets de synchro' };

  if (m.rejets_non_traites > 0) {
    return {
      ...point,
      niveau: 'alerte',
      raison: `${nombre(m.rejets_non_traites, 'rejet', 'rejets')} à arbitrer : de l’argent a changé de main.`,
    };
  }
  return { ...point, niveau: 'normal', raison: 'Aucun rejet en attente.' };
}

function connexions(m: MesuresSante['base']): Voyant {
  const point = { point: 'connexions' as const, libelle: 'Connexions' };
  const constat = `${m.connexions} sur ${m.max_connexions}.`;

  if (m.max_connexions > 0 && m.connexions >= 0.8 * m.max_connexions) {
    return { ...point, niveau: 'attention', raison: constat };
  }
  return { ...point, niveau: 'normal', raison: constat };
}

export function evaluerSante(mesures: MesuresSante, maintenant: Date): EvaluationSante {
  const voyants = [
    drainage(mesures.drainage, maintenant),
    releve(mesures.releve, maintenant),
    avis(mesures.files, maintenant),
    rejets(mesures.files),
    connexions(mesures.base),
  ];

  const niveau = voyants.reduce<NiveauSante>(
    (pire, v) => (RANG[v.niveau] > RANG[pire] ? v.niveau : pire),
    'normal',
  );

  return { niveau, voyants };
}
