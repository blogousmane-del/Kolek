import { describe, expect, it } from 'vitest';

import {
  BORNES,
  LONGUEUR_MOT_DE_PASSE,
  validerCollecteur,
} from '../functions/_shared/valider-collecteur';

/**
 * La validation de création d'un collecteur.
 *
 * Ce qu'elle protège n'est pas évident au premier regard : la base sait déjà
 * refuser un nom de 200 caractères. Ce qu'elle empêche, c'est de refuser **trop
 * tard**.
 *
 * L'ordre est imposé par le schéma. `auth.admin.createUser` crée le compte,
 * puis le déclencheur `creer_collecteur_apres_signup` compose la ligne
 * `collecteurs` à partir des métadonnées. Une saisie invalide fait donc échouer
 * le déclencheur *après* la création du compte, laissant une adresse consommée
 * pour rien — et la reprise buterait sur « adresse déjà prise ».
 */

const VALIDE = {
  email: 'kouame@exemple.ci',
  motDePasse: 'MotDePasseAssezLong',
  nom: 'Kouamé Assi',
  telephone: '+2250708091011',
  zone: 'Adjamé',
  palier: 'pro',
};

describe('saisie acceptée', () => {
  it('rend les valeurs nettoyées', () => {
    const r = validerCollecteur({ ...VALIDE, email: '  KOUAME@Exemple.CI ', nom: ' Kouamé  ' });

    expect(r.ok).toBe(true);
    if (r.ok) {
      // L'adresse est mise en minuscules : deux comptes ne doivent pas pouvoir
      // exister pour la même personne selon la casse tapée.
      expect(r.valeurs.email).toBe('kouame@exemple.ci');
      expect(r.valeurs.nom).toBe('Kouamé');
    }
  });

  it('ne touche jamais aux espaces du mot de passe', () => {
    // Les retirer changerait silencieusement le mot de passe remis au
    // collecteur, qui ne pourrait plus se connecter avec ce qu'on lui a dicté.
    const avecEspaces = '  MotDePasseLong  ';
    const r = validerCollecteur({ ...VALIDE, motDePasse: avecEspaces });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valeurs.motDePasse).toBe(avecEspaces);
  });

  it('retombe sur l’essai quand aucun palier n’est donné', () => {
    const r = validerCollecteur({ ...VALIDE, palier: undefined });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valeurs.palier).toBe('essai');
  });

  it('accepte une zone absente — elle est facultative en base', () => {
    const r = validerCollecteur({ ...VALIDE, zone: undefined });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valeurs.zone).toBe('');
  });
});

describe('saisie refusée', () => {
  const cas: Array<[string, Record<string, unknown>, string]> = [
    ['adresse sans arobase', { email: 'kouame.exemple.ci' }, 'EMAIL_INVALIDE'],
    ['adresse vide', { email: '' }, 'EMAIL_INVALIDE'],
    ['mot de passe court', { motDePasse: 'court' }, 'MOT_DE_PASSE_COURT'],
    ['nom vide', { nom: '   ' }, 'NOM_REQUIS'],
    ['téléphone vide', { telephone: '' }, 'TELEPHONE_REQUIS'],
    ['nom démesuré', { nom: 'x'.repeat(BORNES.nom + 1) }, 'NOM_TROP_LONG'],
    ['téléphone démesuré', { telephone: '0'.repeat(BORNES.telephone + 1) }, 'TELEPHONE_TROP_LONG'],
    ['zone démesurée', { zone: 'z'.repeat(BORNES.zone + 1) }, 'ZONE_TROP_LONGUE'],
    ['palier inventé', { palier: 'platine' }, 'PALIER_INCONNU'],
  ];

  for (const [nom, remplacement, attendu] of cas) {
    it(`refuse : ${nom}`, () => {
      const r = validerCollecteur({ ...VALIDE, ...remplacement });

      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erreur).toBe(attendu);
    });
  }

  it('refuse un champ qui n’est pas une chaîne', () => {
    // Le corps vient du réseau : rien ne garantit son type. Sans le filtre,
    // un objet passé en `nom` finirait dans les métadonnées du compte.
    for (const valeur of [42, null, {}, [], true]) {
      const r = validerCollecteur({ ...VALIDE, nom: valeur });
      expect(r.ok).toBe(false);
    }
  });

  it('refuse un corps entièrement vide', () => {
    expect(validerCollecteur({}).ok).toBe(false);
  });
});

describe('le seuil de mot de passe', () => {
  it('est plus exigeant que le distant, et c’est voulu', () => {
    // Le projet en ligne applique 8, l'intention écrite dans `config.toml` dit
    // 10. Durcir ici ne peut pas être refusé par le serveur — un mot de passe
    // plus long passe toujours.
    expect(LONGUEUR_MOT_DE_PASSE).toBe(10);

    const juste = validerCollecteur({ ...VALIDE, motDePasse: 'a'.repeat(10) });
    const court = validerCollecteur({ ...VALIDE, motDePasse: 'a'.repeat(9) });

    expect(juste.ok).toBe(true);
    expect(court.ok).toBe(false);
  });
});
