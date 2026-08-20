import { describe, expect, it } from 'vitest';

import { PALIERS, PALIER_RECOMMANDE, palierParCle } from './paliers';
import type { Palier } from './types';

describe('grille tarifaire', () => {
  it('couvre exactement les quatre paliers du type Palier', () => {
    const attendus: Palier[] = ['essai', 'standard', 'pro', 'illimite'];
    expect(PALIERS.map((p) => p.cle)).toEqual(attendus);
  });

  it('donne l’essai gratuit et les autres payants', () => {
    expect(palierParCle('essai').prix).toBe(0);
    for (const cle of ['standard', 'pro', 'illimite'] as const) {
      expect(palierParCle(cle).prix).toBeGreaterThan(0);
    }
  });

  it('classe les prix par ordre croissant', () => {
    const prix = PALIERS.map((p) => p.prix);
    expect([...prix].sort((a, b) => a - b)).toEqual(prix);
  });

  it('exprime les montants en entiers FCFA — jamais de centimes', () => {
    for (const p of PALIERS) expect(Number.isInteger(p.prix)).toBe(true);
  });

  it('décrit les mêmes fonctions dans le même ordre pour tous les paliers', () => {
    // Sans cette règle, la comparaison visuelle entre colonnes ment : deux
    // paliers alignent des lignes qui ne parlent pas de la même chose.
    const reference = PALIERS[0]!.fonctions.map((f) => f.libelle.length > 0);
    for (const p of PALIERS) {
      expect(p.fonctions.map((f) => f.libelle.length > 0)).toEqual(reference);
    }
  });

  it('rend le palier recommandé résoluble', () => {
    expect(palierParCle(PALIER_RECOMMANDE).nom).toBe('Pro');
  });

  it('refuse une clé inconnue plutôt que de renvoyer undefined', () => {
    expect(() => palierParCle('gratuit' as Palier)).toThrow(RangeError);
  });

  // --- Arbitrage du 2026-08-20 : le modèle du cahier §5 fait foi ---

  it('applique les montants du cahier §5, pas ceux des maquettes', () => {
    // Ces quatre nombres sont le résultat d'un arbitrage commercial, pas un
    // détail d'affichage. Les maquettes portaient 0 / 9 900 / 24 900 / 49 900,
    // qui décrivaient un prix par *organisation*. Les réécrire ici sans
    // reprendre le calcul du MRR multiplierait le chiffre d'affaires annoncé
    // par quatre à cinq. D'où ce test, qui les fige.
    expect(PALIERS.map((p) => p.prix)).toEqual([0, 2500, 5000, 10000]);
  });

  it('exprime les limites en clients, et jamais en collecteurs', () => {
    // Le client payant *est* un collecteur : une limite exprimée en collecteurs
    // n'aurait pas de sens dans ce modèle. C'est la trace la plus visible de
    // l'ancien modèle, donc celle qui reviendrait en premier par copie.
    for (const p of PALIERS) {
      expect(p.limite.toLowerCase()).not.toContain('collecteur');
      for (const f of p.fonctions) {
        expect(f.libelle.toLowerCase()).not.toContain('collecteur');
      }
    }
  });

  it('accorde le plafond lisible et le plafond calculable', () => {
    // `limite` s'affiche, `limiteClients` décide. Les deux doivent dire la même
    // chose, sinon l'écran promet un plafond que le code n'applique pas.
    for (const p of PALIERS) {
      if (p.limiteClients === null) {
        expect(p.limite.toLowerCase()).toContain('illimit');
      } else {
        expect(p.limite).toContain(String(p.limiteClients));
      }
    }
  });

  it('classe les plafonds de clients par ordre croissant, l’illimité en dernier', () => {
    const plafonds = PALIERS.map((p) => p.limiteClients);
    expect(plafonds.indexOf(null)).toBe(plafonds.length - 1);
    const finis = plafonds.filter((n): n is number => n !== null);
    expect([...finis].sort((a, b) => a - b)).toEqual(finis);
  });

  it('fait payer plus cher chaque palier supérieur, à plafond supérieur', () => {
    // Un palier plus cher qui ne donne pas plus est une erreur de saisie, pas
    // une stratégie tarifaire.
    for (let i = 1; i < PALIERS.length; i += 1) {
      const bas = PALIERS[i - 1]!;
      const haut = PALIERS[i]!;
      expect(haut.prix).toBeGreaterThan(bas.prix);
      expect(haut.limiteClients === null || haut.limiteClients > bas.limiteClients!).toBe(true);
    }
  });
});
