import { MISES_PAR_CYCLE } from '@kolek/core';

import type { Operation, Tournee } from './modele';

/**
 * Ce qu'une opération change à la tournée, sans réseau.
 *
 * ## Idempotent par identifiant, et c'est ce qui rend la file sûre
 *
 * Une opération peut être dans la file **et** dans l'instantané : la réponse du
 * serveur s'est perdue, puis la tournée a été relue. Appliquer ne compte donc
 * rien qui soit déjà là — une mise présente ne rajoute pas de jour à sa carte,
 * un client présent n'est pas dupliqué. Sans cette règle, l'écran compterait
 * deux fois ce que le serveur n'a compté qu'une.
 *
 * ## Ce qui n'est pas appliqué
 *
 * Une mise sur une carte absente, clôturée ou pleine n'est pas montrée. Le
 * serveur la refusera ; la montrer ferait croire à un encaissement réussi. Le
 * geste l'a déjà vérifié avant d'entrer dans la file (§7), donc ce cas ne
 * survient qu'après un rafraîchissement qui a vu la carte changer ailleurs.
 */
export function appliquer(tournee: Tournee, op: Operation): Tournee {
  const copie = structuredClone(tournee);
  appliquerSur(copie, op);
  return copie;
}

/**
 * La tournée que l'écran montre : l'instantané, et la file par-dessus.
 *
 * Seules les opérations en attente comptent. Une opération refusée n'est pas
 * faite — elle est montrée dans les alertes, pas dans les soldes.
 */
export function reappliquer(instantane: Tournee, operations: readonly Operation[]): Tournee {
  const copie = structuredClone(instantane);
  const enAttente = operations
    .filter((o) => o.etat === 'en_attente')
    .sort((a, b) => a.sequence - b.sequence);
  for (const op of enAttente) appliquerSur(copie, op);
  return copie;
}

/** Modifie `t` sur place. Privée : les deux fonctions exportées copient d'abord. */
function appliquerSur(t: Tournee, op: Operation): void {
  switch (op.type) {
    case 'mise': {
      const { id, carteId, montant, encaisseLe } = op.charge;
      if (t.mises.some((m) => m.id === id)) return;
      const carte = t.cartes.find((c) => c.id === carteId);
      if (!carte || carte.statut !== 'active' || carte.misesEncaissees >= MISES_PAR_CYCLE) return;
      t.mises.push({
        id,
        carteId,
        montant,
        encaisseLe,
        // `encaisse_par` vaut `auth.uid()` au serveur, et le synchroniseur
        // n'envoie une opération que sous la session de son collecteur.
        encaissePar: op.collecteurId,
        // La règle du serveur, `new.est_commission := (c.mises_encaissees = 0)`,
        // reprise pour l'affichage. Le serveur décide ; sa valeur remplace
        // celle-ci au rafraîchissement (§7).
        estCommission: carte.misesEncaissees === 0,
      });
      carte.misesEncaissees += 1;
      // Le déclencheur `caisses_rafraichir_apres_mise`, repris : la ligne de
      // caisse du jour UTC de la mise suit l'encaissement. Sans ce report, une
      // mise acceptée entre dans l'instantané pendant que la ligne garde
      // l'attendu d'avant, et l'écran de caisse dirait juste une caisse que le
      // serveur voit en écart. L'écart est oublié : ce n'est plus celui du
      // serveur. Une ligne jamais calculée (`cashAttendu` nul) reste nulle, et
      // la vue recompte les mises elles-mêmes. Le tout reste sous la garde
      // d'identifiant ci-dessus : une mise déjà dans l'instantané n'ajoute rien.
      const ligne = t.caisses.find((c) => c.date === jourUtc(encaisseLe));
      if (ligne && ligne.cashAttendu !== null) {
        ligne.cashAttendu += montant;
        ligne.ecart = null;
      }
      return;
    }
    case 'client_carte': {
      const { client, carte } = op.charge;
      if (!t.clients.some((c) => c.id === client.id)) t.clients.push({ ...client });
      if (!t.cartes.some((c) => c.id === carte.id)) {
        t.cartes.push({
          id: carte.id,
          clientId: client.id,
          mise: carte.mise,
          statut: 'active',
          misesEncaissees: 0,
          ouverteLe: op.faiteLe,
          clotureeLe: null,
        });
      }
      return;
    }
    case 'carte': {
      const { id, clientId, mise } = op.charge;
      if (t.cartes.some((c) => c.id === id)) return;
      if (!t.clients.some((c) => c.id === clientId)) return;
      t.cartes.push({
        id,
        clientId,
        mise,
        statut: 'active',
        misesEncaissees: 0,
        ouverteLe: op.faiteLe,
        clotureeLe: null,
      });
      return;
    }
    case 'caisse': {
      const { id, date, cashDeclare } = op.charge;
      const ligne = t.caisses.find((c) => c.date === date);
      if (ligne) {
        ligne.cashDeclare = cashDeclare;
        // L'écart du serveur portait sur l'ancienne déclaration. Le garder
        // montrerait un chiffre faux jusqu'au rafraîchissement.
        ligne.ecart = null;
        return;
      }
      t.caisses.push({ id, date, cashAttendu: null, cashDeclare, ecart: null });
      return;
    }
  }
}

/** Le jour UTC d'une heure ISO, découpé comme `cash_attendu_du_jour`. `null` pour une heure illisible. */
function jourUtc(iso: string): string | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10);
}
