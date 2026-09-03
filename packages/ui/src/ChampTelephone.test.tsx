import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChampTelephone, composerE164, PAYS_TELEPHONE } from './ChampTelephone';

/**
 * Le formulaire de paiement envoie trois champs au serveur — E.164, pays ISO2,
 * numéro national. `Docs/Chariow.md` §3bis : la quasi-totalité des échecs de
 * création de checkout viennent d'un téléphone mal transmis, et le repli
 * serveur ne sait déduire le pays que des indicatifs africains.
 */

afterEach(cleanup);

describe('composerE164', () => {
  it('retire le zéro national et pose l’indicatif', () => {
    expect(composerE164('CI', '0700000000')).toBe('+225700000000');
  });

  it('ignore les espaces et les tirets de saisie', () => {
    expect(composerE164('CI', '07 00 00 00 00')).toBe('+225700000000');
  });

  it('rend une chaîne vide sur un pays inconnu', () => {
    expect(composerE164('ZZ', '0700000000')).toBe('');
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

    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '0700000000' } });

    expect(onChange).toHaveBeenCalledWith({
      pays: 'CI',
      local: '0700000000',
      e164: '+225700000000',
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
        valeur={{ pays: 'CI', local: '0700000000' }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Pays'), { target: { value: 'SN' } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pays: 'SN', e164: '+221700000000' }),
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
