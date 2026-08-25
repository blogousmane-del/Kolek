import { soldeRestituable } from '@kolek/core';

import { supabase } from './supabase';

/**
 * Les chiffres du collecteur, pour l'écran d'accueil.
 *
 * Aucune Edge Function, aucune clé privilégiée : les politiques RLS bornent
 * chaque `select` aux lignes du collecteur connecté. Ce qui protège l'écran est
 * le même mécanisme qui protège l'écriture, et il n'y a rien à ajouter.
 *
 * L'écran affichait jusqu'ici les chiffres de la maquette — « 48 500 FCFA »,
 * « 24 clients », « +8 % vs hier ». Le commentaire qui les justifiait disait
 * qu'un écran de zéros serait « moins informatif qu'une maquette assumée ».
 * C'était défendable tant que rien ne s'écrivait en base. Ça ne l'est plus :
 * maintenant que le collecteur encaisse pour de vrai, un montant inventé sur
 * l'écran d'accueil est un montant qu'il peut prendre pour sa recette du jour.
 */

export interface Carte {
  id: string;
  client_id: string;
  mise: number;
  statut: 'active' | 'cloturee';
  mises_encaissees: number;
}

export interface MiseRecente {
  id: string;
  carte_id: string;
  montant: number;
  est_commission: boolean;
  encaisse_le: string;
}

export interface TableauCollecteur {
  clients: number;
  cartesActives: number;
  encaisseAujourdhui: number;
  /** Ce que le collecteur doit encore à ses clients, toutes cartes actives. */
  encoursTotal: number;
  /**
   * La carte active la plus avancée : celle qu'on finit avant les autres.
   *
   * `carteId` et `clientId` l'accompagnent depuis le 2026-08-25 : sans eux, les
   * commandes posées sous la carte de l'accueil ne pouvaient que renvoyer vers
   * un écran — « Encaisser » ouvrait la liste des clients, à charge pour le
   * collecteur d'y retrouver celui qu'il venait de voir. Un bouton posé sous
   * une carte doit agir sur cette carte.
   */
  carteDuJour: {
    carteId: string;
    clientId: string;
    nom: string;
    mise: number;
    misesEncaissees: number;
    solde: number;
  } | null;
  dernieres: Array<{ nom: string; montant: number; estCommission: boolean; quand: string }>;
}

/** Minuit local, pas UTC : « aujourd'hui » est la journée du collecteur, à Abidjan. */
function debutDeJournee(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function chargerTableauCollecteur(): Promise<TableauCollecteur> {
  const [reponseClients, reponseCartes, reponseMises] = await Promise.all([
    supabase.from('clients').select('id, nom'),
    supabase.from('cartes').select('id, client_id, mise, statut, mises_encaissees'),
    // Les vingt dernières suffisent à l'écran ; en tirer davantage ferait payer
    // au collecteur, en 3G, des lignes que personne ne regarde.
    supabase
      .from('mises')
      .select('id, carte_id, montant, est_commission, encaisse_le')
      .order('encaisse_le', { ascending: false })
      .limit(20),
  ]);

  if (reponseClients.error || reponseCartes.error || reponseMises.error) {
    throw new Error('Chiffres indisponibles.');
  }

  const clients = (reponseClients.data ?? []) as Array<{ id: string; nom: string }>;
  const cartes = (reponseCartes.data ?? []) as Carte[];
  const mises = (reponseMises.data ?? []) as MiseRecente[];

  const nomParClient = new Map(clients.map((c) => [c.id, c.nom]));
  const carteParId = new Map(cartes.map((c) => [c.id, c]));

  const debut = debutDeJournee();
  const encaisseAujourdhui = mises
    .filter((m) => m.encaisse_le >= debut)
    .reduce((somme, m) => somme + m.montant, 0);

  const actives = cartes.filter((c) => c.statut === 'active');

  const encoursTotal = actives.reduce(
    (somme, c) => somme + soldeRestituable(c.mises_encaissees, c.mise),
    0,
  );

  // La carte du jour : la plus avancée parmi les actives. C'est celle dont le
  // cycle se termine en premier, donc celle qu'il ne faut pas oublier.
  const plusAvancee = [...actives].sort((a, b) => b.mises_encaissees - a.mises_encaissees)[0];

  return {
    clients: clients.length,
    cartesActives: actives.length,
    encaisseAujourdhui,
    encoursTotal,
    carteDuJour: plusAvancee
      ? {
          carteId: plusAvancee.id,
          clientId: plusAvancee.client_id,
          nom: nomParClient.get(plusAvancee.client_id) ?? 'Client',
          mise: plusAvancee.mise,
          misesEncaissees: plusAvancee.mises_encaissees,
          solde: soldeRestituable(plusAvancee.mises_encaissees, plusAvancee.mise),
        }
      : null,
    dernieres: mises.slice(0, 5).map((m) => {
      const carte = carteParId.get(m.carte_id);
      return {
        nom: carte ? (nomParClient.get(carte.client_id) ?? 'Client') : 'Client',
        montant: m.montant,
        estCommission: m.est_commission,
        quand: m.encaisse_le,
      };
    }),
  };
}
