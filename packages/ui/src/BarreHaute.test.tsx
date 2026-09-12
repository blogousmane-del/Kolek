import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BarreHaute } from './BarreHaute';

/**
 * Un bouton « Rafraîchir » coiffait les six onglets du Super Admin. C'est le
 * travail du navigateur, et il masquait ce qu'on venait chercher : de quand
 * datent ces chiffres. Une seule affordance, qui porte l'information.
 *
 * L'horodatage reste facultatif. Un onglet qui ne sait pas de quand datent ses
 * chiffres ne doit rien annoncer plutôt que de deviner — la première épreuve
 * tient cette porte.
 */

afterEach(cleanup);

describe('BarreHaute', () => {
  it('n’affiche aucun horodatage tant qu’on ne lui en donne pas', () => {
    render(<BarreHaute filAriane={['Super Admin']} titre="Facturation" actions={[]} />);

    expect(screen.queryByRole('button', { name: /Mesuré/ })).toBeNull();
  });

  it('dit l’âge de la mesure', () => {
    render(
      <BarreHaute
        filAriane={['Super Admin']}
        titre="Facturation"
        actions={[]}
        mesure={{ iso: new Date().toISOString(), onRecharger: () => {} }}
      />,
    );

    expect(screen.getByRole('button', { name: /Mesuré à l’instant/ })).toBeDefined();
  });

  it('recharge au clic', () => {
    const onRecharger = vi.fn();
    render(
      <BarreHaute
        filAriane={['Super Admin']}
        titre="Facturation"
        actions={[]}
        mesure={{ iso: new Date().toISOString(), onRecharger }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Mesuré/ }));

    expect(onRecharger).toHaveBeenCalledTimes(1);
  });
});
