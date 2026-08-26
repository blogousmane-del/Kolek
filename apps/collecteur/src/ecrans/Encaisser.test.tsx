import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Ce que l'écran montre une fois la mise écrite.
 *
 * Il ne montrait rien : la coquille remettait la carte à `null` au succès, et
 * tout le corps de cet écran vit sous `{!carte ? … : …}`. Corrigé le
 * 2026-08-26 — la carte reste, et gagne son jour.
 *
 * Reste ce que ce `null` protégeait, et qui est réel : le serveur **accepte**
 * deux mises le même jour sur la même carte. `mises_avant_insert` refuse un
 * doublon d'identifiant, une carte clôturée, un cycle complet et un montant
 * faux — pas une seconde mise. Le bouton doit donc se désarmer tout seul.
 */

const enregistrerMise = vi.fn();

vi.mock('../ecritures', () => ({
  enregistrerMise: (...args: unknown[]) => enregistrerMise(...args),
}));

const { Encaisser } = await import('./Encaisser');

const CARTE = { carteId: 'k7', clientNom: 'Hj', mise: 1000, misesEncaissees: 17 };

afterEach(() => {
  cleanup();
  enregistrerMise.mockReset();
});

function bouton() {
  return screen.getByRole('button', { name: /Confirmer la mise/ }) as HTMLButtonElement;
}

describe('après une mise réussie', () => {
  it('montre la confirmation, et la carte reste à l’écran', async () => {
    enregistrerMise.mockResolvedValue({ ok: true });
    render(
      <Encaisser
        collecteurId="col1"
        carte={CARTE}
        onNaviguer={vi.fn()}
        onEncaisse={vi.fn()}
      />,
    );

    fireEvent.click(bouton());

    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Mise de 1 000 FCFA enregistrée pour Hj.',
    );
    expect(screen.queryByText('Aucune carte choisie.')).toBeNull();
  });

  it('désarme le bouton : un second appui écrirait une seconde mise', async () => {
    enregistrerMise.mockResolvedValue({ ok: true });
    render(
      <Encaisser
        collecteurId="col1"
        carte={CARTE}
        onNaviguer={vi.fn()}
        onEncaisse={vi.fn()}
      />,
    );

    fireEvent.click(bouton());
    await waitFor(() => expect(bouton().disabled).toBe(true));

    // Et il ne se réarme pas si on insiste : le geste suivant est de revenir en
    // arrière et de choisir la carte, pas d'appuyer une fois de plus.
    fireEvent.click(bouton());
    expect(enregistrerMise).toHaveBeenCalledTimes(1);
  });

  it('laisse le bouton armé quand la mise a échoué', async () => {
    enregistrerMise.mockResolvedValue({
      ok: false,
      echec: { code: 'RESEAU', message: 'Le réseau a coupé.' },
    });
    render(
      <Encaisser
        collecteurId="col1"
        carte={CARTE}
        onNaviguer={vi.fn()}
        onEncaisse={vi.fn()}
      />,
    );

    fireEvent.click(bouton());

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Le réseau a coupé.');
    // Rien n'est écrit, donc rien à protéger : le collecteur doit pouvoir
    // réessayer sans quitter l'écran.
    expect(bouton().disabled).toBe(false);
  });
});
