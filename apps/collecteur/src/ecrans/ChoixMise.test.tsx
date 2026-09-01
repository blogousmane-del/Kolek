import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatMontant } from '@kolek/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChoixMise } from './ChoixMise';

/**
 * L'invariant que ce fichier garde : tant que le champ libre est ouvert, le
 * parent détient exactement ce que le champ montre — `null` si le champ est
 * vide, invalide, ou inhabituel-non-confirmé.
 *
 * Il compte parce qu'une mise est figée à l'ouverture de la carte et ne se
 * corrige pas. La rétention naïve — « garder le dernier montant valide » —
 * ouvrirait la carte au montant précédent, en silence, alors que le collecteur
 * regarde le sien à l'écran.
 *
 * Les montants attendus passent par `formatMontant` et jamais par une chaîne
 * écrite à la main : le séparateur de milliers est une espace insécable, et
 * `getByRole({ name })` ne la normalise pas.
 */

type Espion = ReturnType<typeof vi.fn>;

/** Le dernier argument reçu par `onChoisir`, ou `undefined` s'il n'a rien reçu. */
function dernier(onChoisir: Espion): unknown {
  return onChoisir.mock.calls.at(-1)?.[0];
}

function champ(): HTMLInputElement {
  return screen.getByLabelText('Montant convenu avec le client') as HTMLInputElement;
}

function caseAcocher(): HTMLInputElement {
  return screen.getByRole('checkbox') as HTMLInputElement;
}

/** Ouvre le champ libre et y tape `texte`. Rend l'utilisateur, pour la suite. */
async function saisir(texte: string) {
  const utilisateur = userEvent.setup();
  await utilisateur.click(screen.getByRole('button', { name: 'Autre' }));
  await utilisateur.type(champ(), texte);
  return utilisateur;
}

afterEach(cleanup);

describe('ChoixMise — les paliers', () => {
  it('remonte un palier sans rien demander', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    // 10 000 est l'ancien plafond, donc le cas limite : il est *égal* au seuil,
    // pas au-dessus. Rien ne doit être demandé.
    await userEvent.setup().click(screen.getByRole('button', { name: formatMontant(10000) }));

    expect(dernier(onChoisir)).toBe(10000);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('ChoixMise — le champ libre', () => {
  it('remonte un montant libre ordinaire tout de suite', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    await saisir('750');

    expect(dernier(onChoisir)).toBe(750);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('remonte null sur une saisie invalide, au lieu de garder l’ancienne', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    await saisir('5');

    expect(dernier(onChoisir)).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Au moins');
  });

  it('nomme autrement un montant que la colonne ne porterait pas', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    await saisir('99999999999');

    expect(dernier(onChoisir)).toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Montant trop grand.');
  });
});

describe('ChoixMise — la confirmation', () => {
  it('retient un montant inhabituel jusqu’à ce que la case soit cochée', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    const utilisateur = await saisir('50000');

    expect(dernier(onChoisir)).toBeNull();

    await utilisateur.click(caseAcocher());

    expect(dernier(onChoisir)).toBe(50000);
  });

  it('montre le cycle du montant en attente, pas de celui que le parent tient', async () => {
    const onChoisir = vi.fn();
    const { container } = render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    await saisir('50000');

    // 31 × 50 000 = 1 550 000. C'est ce chiffre qui motive la confirmation :
    // le faire disparaître pendant l'attente retirerait la raison de cocher.
    expect(container.textContent).toContain(formatMontant(1_550_000));
    expect(container.textContent).not.toContain(formatMontant(31_000));
  });

  it('décoche et reprend le montant quand la saisie change', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    const utilisateur = await saisir('50000');
    await utilisateur.click(caseAcocher());
    expect(dernier(onChoisir)).toBe(50000);

    // La confirmation portait sur l'ancien montant ; la laisser cochée
    // validerait un montant que personne n'a relu.
    await utilisateur.clear(champ());
    await utilisateur.type(champ(), '500000');

    expect(dernier(onChoisir)).toBeNull();
    expect(caseAcocher().checked).toBe(false);
  });

  it('reçoit un montant inhabituel déjà confirmé, et ne le retire pas au parent', () => {
    const onChoisir = vi.fn();
    // Le cas réel : la carte précédente du client était à 50 000, et
    // `misePreremplie` la repropose. Elle a été confirmée à son ouverture.
    render(<ChoixMise mise={50000} onChoisir={onChoisir} identifiant="t" />);

    expect(onChoisir).not.toHaveBeenCalled();
    expect(caseAcocher().checked).toBe(true);
  });

  it('vide le parent quand on quitte un palier pour le champ libre', async () => {
    const onChoisir = vi.fn();
    render(<ChoixMise mise={1000} onChoisir={onChoisir} identifiant="t" />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Autre' }));

    // Sans ça, « Autre » puis « Ouvrir la carte » enregistrerait le palier que
    // le collecteur venait justement de quitter.
    expect(dernier(onChoisir)).toBeNull();
  });
});
