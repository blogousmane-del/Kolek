import { describe, expect, it } from 'vitest';

import {
  BORNES,
  normaliserTelephone,
  validerDemande,
} from '../functions/_shared/valider-demande.ts';

/**
 * La validation de la demande d'ouverture.
 *
 * Ce module garde la **seule écriture publique du produit**. Tout le reste de
 * Kolek exige une session ; ici, n'importe qui sur Internet peut faire grossir
 * une table. Ces tests portent donc moins sur le confort de saisie que sur ce
 * qui empêche un formulaire de prospection de devenir un dépotoir.
 */

const VALIDE = {
  nom: 'Mariam Koné',
  telephone: '+225 07 01 02 03 04',
  // Obligatoire depuis le 2026-08-27 : sans elle, l'accord d'une demande ne
  // peut plus ouvrir le compte.
  email: 'mariam@example.ci',
  zone: 'Adjamé',
  palier: 'pro',
  message: 'Je collecte au marché depuis six ans.',
};

describe('la normalisation du téléphone', () => {
  it('ramène les écritures d’un même numéro à une seule forme', () => {
    // L'enjeu n'est pas cosmétique : l'index unique qui empêche les demandes en
    // double porte sur cette colonne. Sans normalisation, il suffirait d'ajouter
    // un espace pour resoumettre autant de fois qu'on veut.
    const formes = ['+225 07 01 02 03 04', '+2250701020304', '+225-07-01-02-03-04'];
    const normalisees = new Set(formes.map(normaliserTelephone));

    expect(normalisees.size).toBe(1);
    expect([...normalisees][0]).toBe('+2250701020304');
  });

  it('garde le + de tête et jette les autres', () => {
    expect(normaliserTelephone('+225070+1020304')).toBe('+2250701020304');
    expect(normaliserTelephone('0701020304')).toBe('0701020304');
  });

  it('n’invente pas d’indicatif pays', () => {
    // GTCS reçoit aussi des numéros de la sous-région. Préfixer « +225 » d'office
    // rendrait ces personnes injoignables — un correctif silencieux qui casse
    // exactement ce qu'il prétend réparer.
    expect(normaliserTelephone('0701020304')).not.toContain('+');
  });
});

describe('ce qui passe', () => {
  it('accepte une demande complète', () => {
    const r = validerDemande(VALIDE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.demande.nom).toBe('Mariam Koné');
    expect(r.demande.telephone).toBe('+2250701020304');
    expect(r.demande.palier).toBe('pro');
  });

  it('accepte le strict nécessaire : un nom, un numéro, une adresse', () => {
    // Le strict nécessaire a changé le 2026-08-27. Il valait « un nom et un
    // numéro » tant que la seule suite d'une demande était un appel ; l'accord
    // ouvre maintenant le compte et envoie une invitation, ce qu'aucun numéro
    // ne permet.
    const r = validerDemande({
      nom: 'Adama',
      telephone: '0701020304',
      email: 'adama@example.ci',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Zone et message vides deviennent `null`, pas des chaînes vides : la base
    // distingue « pas renseigné » de « renseigné à vide ».
    expect(r.demande.zone).toBeNull();
    expect(r.demande.message).toBeNull();
    expect(r.demande.palier).toBe('essai');
  });

  it('coupe les espaces de bord', () => {
    const r = validerDemande({
      nom: '  Fatou  ',
      telephone: ' 0701020304 ',
      email: ' fatou@example.ci ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.demande.nom).toBe('Fatou');
    expect(r.demande.email).toBe('fatou@example.ci');
  });
});

describe('ce qui est refusé', () => {
  it('refuse un nom vide ou d’une seule lettre', () => {
    for (const nom of ['', '   ', 'A']) {
      const r = validerDemande({ ...VALIDE, nom });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erreur).toBe('NOM_TROP_COURT');
      expect(r.champ).toBe('nom');
    }
  });

  it('refuse un nom au-delà de la borne de la base', () => {
    const r = validerDemande({ ...VALIDE, nom: 'x'.repeat(BORNES.nom.max + 1) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreur).toBe('NOM_TROP_LONG');
  });

  it('compte les chiffres, pas les caractères, pour la longueur du numéro', () => {
    // « +225 » occupe quatre caractères qui ne sont pas un numéro. Un contrôle
    // sur la longueur brute laisserait passer « +225 12 » comme un numéro de
    // huit signes.
    const r = validerDemande({ ...VALIDE, telephone: '+225 12' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreur).toBe('TELEPHONE_TROP_COURT');
  });

  it('refuse un message au-delà de la borne', () => {
    const r = validerDemande({ ...VALIDE, message: 'x'.repeat(BORNES.message.max + 1) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreur).toBe('MESSAGE_TROP_LONG');
  });

  it('refuse un palier inconnu au lieu de le ramener au défaut', () => {
    // Une requête forgée qui demande un palier inexistant ne doit pas être
    // silencieusement corrigée : un correctif muet cache l'appel anormal.
    const r = validerDemande({ ...VALIDE, palier: 'gratuit-a-vie' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreur).toBe('PALIER_INCONNU');
  });

  it('ne se laisse pas nourrir autre chose que du texte', () => {
    for (const nom of [null, 42, {}, [], undefined]) {
      const r = validerDemande({ ...VALIDE, nom });
      expect(r.ok).toBe(false);
    }
  });

  it('refuse un corps entièrement vide', () => {
    expect(validerDemande({}).ok).toBe(false);
  });
});

describe('l’adresse électronique', () => {
  // Ajoutée le 2026-08-27. Le formulaire n'en demandait pas, et rien ne
  // permettait donc de joindre un prospect autrement qu'en composant son
  // numéro — ni, surtout, de lui ouvrir son compte.
  it('refuse une demande sans adresse', () => {
    const { email: _, ...sansEmail } = VALIDE;
    const r = validerDemande(sansEmail);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreur).toBe('EMAIL_MANQUANT');
    expect(r.champ).toBe('email');
  });

  it('accepte une demande complète et rend l’adresse normalisée', () => {
    const r = validerDemande({ ...VALIDE, email: '  Mariam@Example.CI ' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.demande.email).toBe('mariam@example.ci');
  });

  it('nomme le champ sur un refus de forme', () => {
    // Le formulaire de la vitrine surligne le champ nommé ici. Un `champ`
    // absent ou faux laisse le visiteur chercher.
    const r = validerDemande({ ...VALIDE, email: 'mariam' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreur).toBe('EMAIL_INVALIDE');
    expect(r.champ).toBe('email');
  });

  it('refuse une adresse trop longue', () => {
    const r = validerDemande({ ...VALIDE, email: `${'x'.repeat(200)}@example.ci` });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreur).toBe('EMAIL_TROP_LONG');
  });

  it('juge le nom avant l’adresse', () => {
    // L'ordre des contrôles suit l'ordre du formulaire : le premier champ
    // fautif est le premier refusé. Sans cela, un formulaire vide surlignerait
    // le troisième champ.
    const r = validerDemande({ nom: 'M' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.champ).toBe('nom');
  });
});
