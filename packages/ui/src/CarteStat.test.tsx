import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CarteStat } from './CarteStat';

/**
 * L'onglet Facturation passait ses valeurs en rouge quand des abonnements
 * expirent ou tombent en défaut. La carte partagée ne savait pas le faire :
 * l'adopter telle quelle aurait supprimé le signal sans que rien ne le dise.
 *
 * `alerte` est distincte de `tendance` : celle-ci compare à une période
 * précédente, celle-là juge l'état présent. Aucune des deux ne s'invente.
 */

afterEach(cleanup);

describe('CarteStat', () => {
  it('écrit la valeur en encre par défaut', () => {
    render(<CarteStat libelle="Collecteurs actifs" valeur="9" precision="sur 12" icone="users" />);

    expect(screen.getByText('9').className).toContain('text-ink');
  });

  it('passe la valeur en négatif quand elle alerte', () => {
    render(
      <CarteStat
        libelle="En défaut"
        valeur="3"
        precision="3 suspendus"
        icone="alert-circle"
        alerte
      />,
    );

    expect(screen.getByText('3').className).toContain('text-negative');
  });

  it('n’affiche aucune tendance tant qu’on ne lui en donne pas', () => {
    render(<CarteStat libelle="MRR total" valeur="45 000" unite="FCFA" icone="wallet" />);

    expect(screen.queryByText('vs période précédente')).toBeNull();
  });

  it('annonce la tendance quand on la lui donne', () => {
    render(
      <CarteStat libelle="MRR total" valeur="45 000" unite="FCFA" icone="wallet" tendance="+14 %" />,
    );

    expect(screen.getByText('vs période précédente')).toBeDefined();
  });
});
