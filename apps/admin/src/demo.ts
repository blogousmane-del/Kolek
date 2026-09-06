import type { VueGlobale } from './donnees';

/**
 * La vitrine du tableau de bord — des chiffres inventés, et qui doivent le
 * rester.
 *
 * ## Pourquoi ce module est seul
 *
 * Ce jeu de données n'est pas une donnée de repli : c'est une **démonstration
 * commerciale**, montrée à qui n'a pas de compte. Il vit donc dans son propre
 * module, chargé par `import()` au clic, pour deux raisons qui comptent autant
 * l'une que l'autre :
 *
 * 1. **Il ne pèse pas sur le paquet principal.** Vite le découpe ; un
 *    administrateur qui ouvre sa console ne télécharge jamais ces quatre-vingts
 *    lignes de faux collecteurs.
 * 2. **Il n'est atteignable que par une main.** `donnees.ts` ne l'importe pas et
 *    ne peut donc pas le servir par accident. La seule façon de voir ces
 *    chiffres est d'avoir cliqué le bouton de démonstration sur l'écran de
 *    connexion — pas d'avoir un drapeau posé quelque part dans le navigateur.
 *
 * Le deuxième point est le vrai. Une démonstration pilotée par `localStorage`
 * survit à la connexion : elle reste allumée quand une session s'ouvre, et
 * verse alors ses chiffres dans une console réelle. C'était le cas jusqu'au
 * 2026-09-06.
 *
 * Les noms et les zones sont ivoiriens et plausibles, les montants cohérents
 * entre eux — un encours qui vaut l'encaissé moins les restitutions et les
 * commissions. Une démonstration dont les totaux ne tombent pas juste se
 * remarque, et ce qu'elle démontre alors est l'inverse de ce qu'on voulait.
 */
export const VUE_DEMO: VueGlobale = {
  genereLe: new Date().toISOString(),
  abonnements: {
    collecteurs_total: 18,
    collecteurs_actifs: 16,
    suspendus: 1,
    expires: 1,
    expirations_ce_mois: 3,
    expirations_a_venir_30j: 4,
    mrr: 270000,
    parPalier: [
      {
        palier: 'standard',
        nom: 'Standard (15 000 FCFA/mois)',
        prix: 15000,
        limiteClients: 100,
        total: 10,
        actifs: 9,
        mrr: 135000,
      },
      {
        palier: 'pro',
        nom: 'Professionnel (25 000 FCFA/mois)',
        prix: 25000,
        limiteClients: 300,
        total: 5,
        actifs: 5,
        mrr: 125000,
      },
      {
        palier: 'illimite',
        nom: 'Équipe Illimitée (50 000 FCFA/mois)',
        prix: 50000,
        limiteClients: null,
        total: 3,
        actifs: 2,
        mrr: 100000,
      },
    ],
  },
  totaux: {
    clients: 1420,
    cartes_actives: 1280,
    cartes_total: 1650,
    mises: 8450,
    total_encaisse: 24650000,
    commissions: 1845000,
    restitutions: 16200000,
    encours_clients: 6605000,
  },
  zones: [
    { zone: 'Cocody & Riviera', collecteurs: 5, clients: 480, encaisse: 9850000 },
    { zone: 'Yopougon Selmer & Sicogi', collecteurs: 4, clients: 390, encaisse: 6420000 },
    { zone: 'Treichville & Marcory', collecteurs: 4, clients: 310, encaisse: 5180000 },
    { zone: 'Bouaké Commerce & Air France', collecteurs: 3, clients: 240, encaisse: 3200000 },
  ],
  collecteurs: [
    {
      id: 'col-1',
      nom: 'Kouassi Jean-Baptiste',
      telephone: '+225 07 08 12 34 56',
      zone: 'Cocody & Riviera',
      titulaire_id: null,
      titulaire_nom: null,
      palier: 'pro',
      abonnement_statut: 'actif',
      abonnement_echeance: '2026-09-30T00:00:00Z',
      cree_le: '2025-02-15T00:00:00Z',
      clients: 145,
      cartes_actives: 130,
      encaisse: 3850000,
      commissions: 285000,
      restitutions: 2400000,
      encours: 1165000,
    },
    {
      id: 'col-2',
      nom: 'Yao Adjoua Marie',
      telephone: '+225 05 04 56 78 90',
      zone: 'Yopougon Selmer & Sicogi',
      titulaire_id: null,
      titulaire_nom: null,
      palier: 'standard',
      abonnement_statut: 'actif',
      abonnement_echeance: '2026-09-25T00:00:00Z',
      cree_le: '2025-03-10T00:00:00Z',
      clients: 92,
      cartes_actives: 85,
      encaisse: 2100000,
      commissions: 160000,
      restitutions: 1350000,
      encours: 590000,
    },
    {
      id: 'col-3',
      nom: 'Diallo Souleymane',
      telephone: '+225 01 02 99 88 77',
      zone: 'Treichville & Marcory',
      titulaire_id: null,
      titulaire_nom: null,
      palier: 'pro',
      abonnement_statut: 'actif',
      abonnement_echeance: '2026-09-28T00:00:00Z',
      cree_le: '2025-01-20T00:00:00Z',
      clients: 128,
      cartes_actives: 115,
      encaisse: 2950000,
      commissions: 220000,
      restitutions: 1900000,
      encours: 830000,
    },
    {
      id: 'col-4',
      nom: 'Kone Awa',
      telephone: '+225 07 55 44 33 22',
      zone: 'Bouaké Commerce & Air France',
      titulaire_id: null,
      titulaire_nom: null,
      palier: 'standard',
      abonnement_statut: 'actif',
      abonnement_echeance: '2026-09-20T00:00:00Z',
      cree_le: '2025-04-05T00:00:00Z',
      clients: 88,
      cartes_actives: 80,
      encaisse: 1750000,
      commissions: 130000,
      restitutions: 1100000,
      encours: 520000,
    },
    {
      id: 'col-5',
      nom: 'Bamba Balla',
      telephone: '+225 05 99 11 22 33',
      zone: 'Cocody & Riviera',
      titulaire_id: null,
      titulaire_nom: null,
      palier: 'illimite',
      abonnement_statut: 'actif',
      abonnement_echeance: '2026-10-15T00:00:00Z',
      cree_le: '2024-11-12T00:00:00Z',
      clients: 210,
      cartes_actives: 195,
      encaisse: 6000000,
      commissions: 450000,
      restitutions: 4100000,
      encours: 1450000,
    },
  ],
  mouvements: [
    {
      type: 'mise',
      client: 'Koffi Amenan Chantal',
      collecteur_id: 'col-1',
      collecteur: 'Kouassi Jean-Baptiste',
      montant: 5000,
      survenu_le: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
    {
      type: 'mise',
      client: 'Touré Bakary',
      collecteur_id: 'col-2',
      collecteur: 'Yao Adjoua Marie',
      montant: 2000,
      survenu_le: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    },
    {
      type: 'commission',
      client: 'Ouattara Fatou',
      collecteur_id: 'col-3',
      collecteur: 'Diallo Souleymane',
      montant: 1000,
      survenu_le: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    },
    {
      type: 'restitution',
      client: 'N’Dri Yao Pascal',
      collecteur_id: 'col-5',
      collecteur: 'Bamba Balla',
      montant: -150000,
      survenu_le: new Date(Date.now() - 140 * 60 * 1000).toISOString(),
    },
    {
      type: 'mise',
      client: 'Soro Gnenema',
      collecteur_id: 'col-4',
      collecteur: 'Kone Awa',
      montant: 10000,
      survenu_le: new Date(Date.now() - 210 * 60 * 1000).toISOString(),
    },
    {
      type: 'mise',
      client: 'Diomandé Massandjé',
      collecteur_id: 'col-1',
      collecteur: 'Kouassi Jean-Baptiste',
      montant: 5000,
      survenu_le: new Date(Date.now() - 300 * 60 * 1000).toISOString(),
    },
    {
      type: 'restitution',
      client: 'Coulibaly Ibrahim',
      collecteur_id: 'col-3',
      collecteur: 'Diallo Souleymane',
      montant: -90000,
      survenu_le: new Date(Date.now() - 450 * 60 * 1000).toISOString(),
    },
  ],
  cartes: [],
  cartes_total_lignes: 1280,
  paiements: {
    total_30j: 270000,
    nombre_30j: 18,
    par_collecteur: [
      {
        collecteur_id: 'col-1',
        dernier_le: '2026-08-30T10:00:00Z',
        dernier_montant: 25000,
        derniere_devise: 'XOF',
      },
    ],
  },
};
