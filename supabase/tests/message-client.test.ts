import { describe, expect, it } from 'vitest';

import {
  composer,
  estGsm7,
  facturer,
  versGsm7,
} from '../functions/_shared/message-client.ts';

/**
 * Les messages envoyés aux clients.
 *
 * Ces tests portent sur de l'argent, pas sur de la typographie. Un caractère
 * hors alphabet GSM 03.38 fait basculer le message entier en UCS-2, où un
 * segment vaut 70 caractères au lieu de 160 — la facture double. À 3 900
 * messages par mois pour un collecteur au palier Pro, l'écart est de
 * 78 000 FCFA mensuels, soit plus de quinze abonnements.
 *
 * D'où deux familles de tests : ce qui est transmissible, et ce que ça coûte.
 */

describe('l’alphabet GSM-7', () => {
  it('garde les accents que la norme accepte', () => {
    // « versé » ne doit pas devenir « verse » : l'accent est gratuit ici, et
    // dégrader le français sans nécessité serait une perte sèche.
    expect(versGsm7('Vous avez versé 500 FCFA')).toBe('Vous avez versé 500 FCFA');
    expect(estGsm7('è é ù ì ò à ä ö ü ñ Æ ß É')).toBe(true);
  });

  it('remplace le ç minuscule, absent de la norme', () => {
    // Le piège le plus coûteux : `Ç` majuscule est dans GSM-7, `ç` minuscule
    // ne l'est pas. « reçu » suffit à doubler le prix de chaque message.
    expect(estGsm7('reçu')).toBe(false);
    expect(versGsm7('reçu')).toBe('recu');
    expect(estGsm7(versGsm7('reçu'))).toBe(true);
  });

  it('remplace l’apostrophe typographique', () => {
    // Le produit écrit `’` partout, et c'est la bonne typographie française.
    // Elle n'est simplement pas transmissible à ce prix-là.
    expect(estGsm7('l’argent')).toBe(false);
    expect(versGsm7('l’argent')).toBe("l'argent");
  });

  it('remplace les circonflexes et trémas absents', () => {
    expect(versGsm7('vérifiez la même chose, s’il vous plaît')).toBe(
      "vérifiez la meme chose, s'il vous plait",
    );
    expect(versGsm7('êtes-vous sûr ? Août, Noël, cœur')).toBe(
      'etes-vous sur ? Aout, Noel, coeur',
    );
  });

  it('remplace tirets longs, points de suspension et guillemets', () => {
    // Les guillemets français encadrent leur contenu d'espaces : la conversion
    // les conserve plutôt que de réécrire la phrase.
    expect(versGsm7('un — deux… « trois »')).toBe('un - deux... " trois "');
  });

  it('ne laisse jamais passer un caractère intransmissible', () => {
    // Le filet final. Même un emoji ou un idéogramme ne doit pas survivre à la
    // conversion : un caractère perdu coûte moins qu'un doublement de facture
    // sur chaque message envoyé.
    const hostile = 'Solde 💰 8000 漢字 ₹ ✓';
    expect(estGsm7(versGsm7(hostile))).toBe(true);
  });

  it('convertit l’espace insécable en espace ordinaire', () => {
    expect(versGsm7('8 000 FCFA')).toBe('8 000 FCFA');
  });
});

describe('la facturation', () => {
  it('compte un segment pour un message court en GSM-7', () => {
    const f = facturer('KOLEK. Versement recu : 500 FCFA.');
    expect(f.encodage).toBe('GSM-7');
    expect(f.segments).toBe(1);
  });

  it('bascule en UCS-2 dès un seul caractère hors norme', () => {
    // Un ç dans un message de quarante caractères, et le seuil passe de 160
    // à 70. C'est tout l'enjeu du module.
    expect(facturer('KOLEK. Versement reçu : 500 FCFA.').encodage).toBe('UCS-2');
  });

  it('applique les seuils de la norme, y compris ceux de la concaténation', () => {
    expect(facturer('a'.repeat(160)).segments).toBe(1);
    // Au-delà de 160, l'en-tête de concaténation mange sept unités par segment.
    expect(facturer('a'.repeat(161)).segments).toBe(2);
    expect(facturer('a'.repeat(306)).segments).toBe(2);
    expect(facturer('a'.repeat(307)).segments).toBe(3);
  });

  it('applique les seuils UCS-2, quatre fois plus serrés', () => {
    const accent = 'ê';
    expect(facturer(accent.repeat(70)).segments).toBe(1);
    expect(facturer(accent.repeat(71)).segments).toBe(2);
  });

  it('compte double les caractères de la table d’extension', () => {
    // `€` occupe deux unités : un échappement plus le caractère.
    expect(facturer('€').unites).toBe(2);
    expect(facturer('a'.repeat(159) + '€').segments).toBe(2);
  });
});

describe('les messages du produit', () => {
  const MISE = {
    type: 'mise' as const,
    montant: 500,
    solde: 8000,
    jour: 5,
    total: 31,
    reference: '7F3A21C4',
  };

  it('tient en un seul segment — c’est la condition du dispositif', () => {
    // Un message à deux segments double le coût de chaque versement. Le
    // dispositif entier repose sur ce plafond ; ce test est ce qui le tient.
    const f = facturer(composer(MISE));
    expect(f.encodage).toBe('GSM-7');
    expect(f.segments).toBe(1);
  });

  it('reste à un segment pour les plus gros montants du produit', () => {
    // Palier Illimité, mise maximale, cycle complet : le pire cas réaliste.
    const f = facturer(
      composer({ ...MISE, montant: 25_000, solde: 750_000, jour: 31, total: 31 }),
    );
    expect(f.segments).toBe(1);
  });

  it('dit le montant, le solde et une référence', () => {
    const texte = composer(MISE);
    expect(texte).toContain('500 FCFA');
    expect(texte).toContain('8 000 FCFA');
    expect(texte).toContain('7F3A21C4');
    expect(texte).toContain('5/31');
  });

  it('ne nomme personne', () => {
    // Le téléphone est souvent partagé en famille, parfois prêté. Un montant
    // sans nom informe son destinataire sans renseigner qui lit par-dessus
    // l'épaule.
    const texte = composer(MISE).toLowerCase();
    for (const interdit of ['client', 'collecteur', 'mariam', 'nom ']) {
      expect(texte).not.toContain(interdit);
    }
  });

  it('ne contient aucun lien', () => {
    // Un SMS financier porteur de lien apprend à cliquer sur les liens des SMS
    // financiers — le réflexe exact qu'exploite l'hameçonnage.
    for (const evenement of [
      MISE,
      { type: 'retrait' as const, montant: 15_000, reference: 'B21C' },
      { type: 'ouverture' as const, mise: 500, total: 31 },
    ]) {
      const texte = composer(evenement);
      expect(texte).not.toMatch(/https?:|www\.|\.com|\.ci\b/i);
    }
  });

  it('rend le retrait vérifiable avant de quitter le collecteur', () => {
    const texte = composer({ type: 'retrait', montant: 15_000, reference: 'B21C' });
    expect(texte).toContain('15 000 FCFA');
    expect(texte).toMatch(/erifiez/);
    expect(facturer(texte).segments).toBe(1);
  });

  it('n’émet que du GSM-7, pour les trois événements', () => {
    for (const evenement of [
      MISE,
      { type: 'retrait' as const, montant: 15_000, reference: 'B21C' },
      { type: 'ouverture' as const, mise: 500, total: 31 },
    ]) {
      expect(estGsm7(composer(evenement))).toBe(true);
    }
  });
});
