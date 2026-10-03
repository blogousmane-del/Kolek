import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Icone } from './Icone';

afterEach(cleanup);

/**
 * Les trois icônes du billet.
 *
 * `banknote` remplace le « $ » d'Encaisser, `scale` dit le rapprochement de la
 * caisse, `receipt-text` remplace un ticket de Lucide qui porte lui aussi un
 * « $ ». Le registre est une table explicite : une icône absente n'y existe
 * pas, et le rendu tombe.
 */
describe('le registre d’icônes', () => {
  it.each(['banknote', 'scale', 'receipt-text'] as const)('dessine %s', (nom) => {
    const { container } = render(<Icone nom={nom} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('class')).toContain(`lucide-${nom}`);
  });
});
