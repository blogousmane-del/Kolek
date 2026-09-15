import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** La caisse du jour, lue sur le téléphone et déclarée par la file (J2b §6.4). */

const chargerRapprochement = vi.fn();
const declarerCaisse = vi.fn();

vi.mock('../lectures-ecrans', () => ({ chargerRapprochement: () => chargerRapprochement() }));
vi.mock('../ecritures-ecrans', () => ({
  declarerCaisse: (...args: unknown[]) => declarerCaisse(...args),
}));

const { Rapprochement } = await import('./Rapprochement');
const { viderCache } = await import('../cache');

const DU_JOUR = { date: '2026-09-13', cashAttendu: 5000, cashDeclare: null, ecart: null, provisoire: false };

afterEach(() => {
  cleanup();
  viderCache();
  chargerRapprochement.mockReset();
  declarerCaisse.mockReset();
});

describe('l’attendu du jour', () => {
  it('se dit calculé par le serveur quand le serveur a tout compté', async () => {
    chargerRapprochement.mockResolvedValue(DU_JOUR);

    render(<Rapprochement collecteurId="col-1" revision={0} onRetour={vi.fn()} />);

    expect(await screen.findByText('Cash attendu — calculé par le serveur')).toBeTruthy();
  });

  it('se dit provisoire quand le téléphone compte ce que le serveur n’a pas reçu', async () => {
    chargerRapprochement.mockResolvedValue({ ...DU_JOUR, provisoire: true });

    render(<Rapprochement collecteurId="col-1" revision={0} onRetour={vi.fn()} />);

    expect(await screen.findByText('Cash attendu — provisoire, le serveur recalculera')).toBeTruthy();
  });
});

describe('déclarer', () => {
  it('passe la date et le montant, sans identifiant de ligne (précision 9)', async () => {
    chargerRapprochement.mockResolvedValue(DU_JOUR);
    declarerCaisse.mockResolvedValue({ ok: true });

    render(<Rapprochement collecteurId="col-1" revision={0} onRetour={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Cash déclaré (FCFA)'), { target: { value: '4500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Déclarer' }));

    await waitFor(() => expect(declarerCaisse).toHaveBeenCalledWith('col-1', '2026-09-13', 4500));
  });
});
