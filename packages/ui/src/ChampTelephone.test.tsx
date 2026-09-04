import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChampTelephone, composerE164, PAYS_TELEPHONE, separerE164 } from './ChampTelephone';

/**
 * Le formulaire de paiement envoie trois champs au serveur — E.164, pays ISO2,
 * numéro national. `Docs/Chariow.md` §3bis : la quasi-totalité des échecs de
 * création de checkout viennent d'un téléphone mal transmis, et le repli
 * serveur ne sait déduire le pays que des indicatifs africains.
 */

afterEach(cleanup);

describe('composerE164', () => {
  it('garde le zéro ivoirien, qui fait partie du numéro', () => {
    // Corrigé le 2026-09-04. Ce test attendait `+225700000000` et encodait une
    // règle qu'on croyait universelle : « le zéro de tête tombe à
    // l'international ». C'est celle de la France, pas de la Côte d'Ivoire, où
    // le numéro fait dix chiffres et garde son zéro depuis le 31 janvier 2021.
    //
    // Le coût de l'erreur : Chariow refusait `400 Invalid phone number` sur tout
    // numéro ivoirien, et aucun abonnement n'a jamais pu être réglé. La suite
    // était verte — elle vérifiait que le code faisait ce qu'il faisait.
    expect(composerE164('CI', '0711282992')).toBe('+2250711282992');
  });

  it('retire le zéro là où le plan de numérotation en porte un', () => {
    expect(composerE164('FR', '0612345678')).toBe('+33612345678');
  });

  it('ignore les espaces et les tirets de saisie', () => {
    expect(composerE164('CI', '07 11 28 29 92')).toBe('+2250711282992');
  });

  it('rend une chaîne vide sur un pays inconnu', () => {
    expect(composerE164('ZZ', '0711282992')).toBe('');
  });

  it('rend une chaîne vide sur un numéro vide', () => {
    // Sans ce retour, un champ vide produirait « +225 », que le fournisseur
    // refuse en « Invalid phone number » sans dire lequel des deux manque.
    expect(composerE164('CI', '')).toBe('');
    expect(composerE164('CI', '000')).toBe('');
  });
});

describe('PAYS_TELEPHONE', () => {
  it('ouvre sur le pays du pilote', () => {
    expect(PAYS_TELEPHONE.at(0)?.code).toBe('CI');
  });

  it('ne porte que des codes ISO2 et des indicatifs numériques', () => {
    // Le fournisseur attend `country_code` en ISO2. Un code à trois lettres
    // passerait la compilation et serait refusé au moment du paiement.
    for (const pays of PAYS_TELEPHONE) {
      expect(pays.code).toMatch(/^[A-Z]{2}$/);
      expect(pays.indicatif).toMatch(/^\d+$/);
    }
  });
});

describe('ChampTelephone', () => {
  it('remonte les trois formes à chaque frappe', () => {
    const onChange = vi.fn();
    render(
      <ChampTelephone libelle="Téléphone" valeur={{ pays: 'CI', local: '' }} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '0711282992' } });

    expect(onChange).toHaveBeenCalledWith({
      pays: 'CI',
      local: '0711282992',
      e164: '+2250711282992',
      valide: true,
    });
  });

  it('marque invalide un numéro trop court', () => {
    const onChange = vi.fn();
    render(
      <ChampTelephone libelle="Téléphone" valeur={{ pays: 'CI', local: '' }} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '070' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ valide: false }));
  });

  it('recompose l’E.164 quand le pays change', () => {
    const onChange = vi.fn();
    render(
      <ChampTelephone
        libelle="Téléphone"
        valeur={{ pays: 'CI', local: '0711282992' }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Pays'), { target: { value: 'SN' } });

    // Le numéro national ne bouge pas, seul l'indicatif change — et le Sénégal
    // ne porte pas de préfixe national, donc le zéro saisi reste. C'est voulu :
    // le champ recompose, il ne réinterprète pas ce que la personne a tapé.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pays: 'SN', e164: '+2210711282992' }),
    );
  });

  it('n’éteint l’anneau de focus sur aucun des deux contrôles', () => {
    // La règle du 2026-08-23, portée par `Champ.test.tsx` : l'anneau vit dans
    // `packages/core/src/base.css`, sur `:focus-visible`, et aucun composant
    // n'a le droit de l'éteindre. Ce champ en porte deux, dont un `select` que
    // `Champ` ne couvre pas — la règle doit donc être redite ici.
    render(
      <ChampTelephone libelle="Téléphone" valeur={{ pays: 'CI', local: '' }} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText('Téléphone').className).not.toContain('outline-none');
    expect(screen.getByLabelText('Pays').className).not.toContain('outline-none');
  });

  it('garde les deux cibles de saisie à 44 px', () => {
    render(
      <ChampTelephone libelle="Téléphone" valeur={{ pays: 'CI', local: '' }} onChange={vi.fn()} />,
    );

    expect(screen.getByLabelText('Téléphone').className).toMatch(/\bmin-h-11\b/);
    expect(screen.getByLabelText('Pays').className).toMatch(/\bmin-h-11\b/);
  });
});

describe('separerE164', () => {
  /**
   * L'inverse de `composerE164`, employé pour pré-remplir le champ depuis une
   * fiche. Le danger n'est pas qu'il échoue : c'est qu'il devine.
   */

  it('fait l’aller-retour sur chaque pays de la liste', () => {
    // La propriété qui compte : ce que le champ compose, il doit savoir le
    // relire. Sans elle, un numéro enregistré ici reviendrait ailleurs.
    // Le local attendu dépend maintenant du pays : celui qui porte un préfixe
    // national le perd, les autres gardent leur numéro entier. L'aller-retour,
    // lui, doit tenir dans les deux cas — c'est ce que ce test mesure, et non
    // une forme particulière.
    for (const pays of PAYS_TELEPHONE) {
      const e164 = composerE164(pays.code, '0711282992');
      const separe = separerE164(e164);

      expect(separe).not.toBeNull();
      expect(separe!.pays).toBe(pays.code);
      expect(composerE164(separe!.pays, separe!.local)).toBe(e164);
    }
  });

  it('refuse ce qui ne porte pas d’indicatif international', () => {
    // Un « 0701020304 » national et un « 2250102030 » sans indicatif ne se
    // distinguent pas de façon sûre. Un champ pré-rempli faux est pire qu'un
    // champ vide : personne ne relit ce qui est déjà écrit.
    expect(separerE164('0701020304')).toBeNull();
    expect(separerE164('2250701020304')).toBeNull();
    expect(separerE164('')).toBeNull();
  });

  it('refuse un pays absent de la liste, que le champ ne saurait afficher', () => {
    expect(separerE164('+19995550100')).toBeNull();
  });

  it('refuse un indicatif sans numéro derrière', () => {
    expect(separerE164('+225')).toBeNull();
  });

  it('ne recompose jamais un numéro qui porterait deux fois son indicatif', () => {
    // Le défaut que cette fonction existe pour empêcher : poser l'E.164 tel quel
    // dans `local` donnait « +225 » devant un numéro qui portait déjà « 225 »,
    // et le champ le déclarait valide.
    const stocke = '+2250711282992';
    const separe = separerE164(stocke);

    expect(separe).not.toBeNull();
    expect(composerE164(separe!.pays, separe!.local)).toBe(stocke);
    expect(composerE164('CI', stocke)).not.toBe(stocke);
  });
});
