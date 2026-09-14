import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { creerPlanificateur } from './planificateur';
import type { BilanPasse } from './synchroniseur';

const bilan = (etat: BilanPasse['etat'], reste: Partial<BilanPasse> = {}): BilanPasse => ({ etat, reveil: null, traitees: 0, ...reste });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-13T09:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('une passe à la fois', () => {
  it('ne lance pas une seconde passe pendant la première, mais la rejoue après', async () => {
    let finir: () => void = () => {};
    const passe = vi
      .fn<() => Promise<BilanPasse>>()
      .mockImplementationOnce(() => new Promise((r) => { finir = () => r(bilan('vide')); }))
      .mockResolvedValue(bilan('vide'));
    const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) });

    void p.demander();
    void p.demander();
    expect(passe).toHaveBeenCalledTimes(1);

    finir();
    await vi.runAllTimersAsync();
    expect(passe).toHaveBeenCalledTimes(2);
  });
});

describe('quand revenir (§5.3)', () => {
  it('revient à l’heure du réveil', async () => {
    const passe = vi.fn<() => Promise<BilanPasse>>().mockResolvedValueOnce(bilan('attente', { reveil: Date.now() + 7000 })).mockResolvedValue(bilan('vide'));
    const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) });

    await p.demander();
    await vi.advanceTimersByTimeAsync(6999);
    expect(passe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(passe).toHaveBeenCalledTimes(2);
  });

  it('hors ligne : 30 s, puis 1 min, puis 2 min', async () => {
    const passe = vi.fn(async () => bilan('hors_ligne'));
    const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) });

    await p.demander();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(passe).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(passe).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(passe).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(passe).toHaveBeenCalledTimes(4);
  });

  it('ne revient pas seul sur une file vide ou une session finie', async () => {
    for (const etat of ['vide', 'session_finie', 'autre_compte'] as const) {
      const passe = vi.fn(async () => bilan(etat));
      const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) });
      await p.demander();
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(passe, etat).toHaveBeenCalledTimes(1);
    }
  });

  it('une demande relance tout de suite, sans attendre le délai en cours', async () => {
    const passe = vi.fn(async () => bilan('hors_ligne'));
    const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) });

    await p.demander();
    await p.demander();
    expect(passe).toHaveBeenCalledTimes(2);
  });
});

describe('quand recharger la tournée (précision 10)', () => {
  it('à la demande, quand le serveur répond', async () => {
    const rafraichir = vi.fn(async () => 'fait' as const);
    const surFin = vi.fn();
    const p = creerPlanificateur({ passe: vi.fn(async () => bilan('vide')), rafraichir }, surFin);

    await p.demander({ rafraichir: true });

    expect(rafraichir).toHaveBeenCalledTimes(1);
    expect(surFin).toHaveBeenCalledWith(bilan('vide'), true);
  });

  it('jamais hors ligne : ce serait sept requêtes pour rien', async () => {
    const rafraichir = vi.fn(async () => 'fait' as const);
    const p = creerPlanificateur({ passe: vi.fn(async () => bilan('hors_ligne')), rafraichir });

    await p.demander({ rafraichir: true });

    expect(rafraichir).not.toHaveBeenCalled();
  });

  it('après un envoi qui vide la file, au plus toutes les 5 minutes', async () => {
    const rafraichir = vi.fn(async () => 'fait' as const);
    const p = creerPlanificateur({ passe: vi.fn(async () => bilan('vide', { traitees: 1 })), rafraichir });

    await p.demander();
    await p.demander();
    expect(rafraichir).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300_000);
    await p.demander();
    expect(rafraichir).toHaveBeenCalledTimes(2);
  });

  it('garde une demande de rechargement qui a échoué, et la retente au prochain tour où le serveur répond', async () => {
    const rafraichir = vi.fn<() => Promise<'fait' | 'impossible'>>().mockResolvedValueOnce('impossible').mockResolvedValue('fait');
    const passe = vi
      .fn<() => Promise<BilanPasse>>()
      .mockResolvedValueOnce(bilan('attente', { reveil: Date.now() + 30_000 }))
      .mockResolvedValue(bilan('vide'));
    const p = creerPlanificateur({ passe, rafraichir });

    await p.demander({ rafraichir: true });
    expect(rafraichir).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(passe).toHaveBeenCalledTimes(2);
    expect(rafraichir).toHaveBeenCalledTimes(2);

    // Abouti : un tour sans demande ne recharge plus.
    await p.demander();
    expect(rafraichir).toHaveBeenCalledTimes(2);
  });

  it('garde la demande faite hors ligne, et recharge au retour du serveur', async () => {
    const rafraichir = vi.fn(async () => 'fait' as const);
    const passe = vi.fn<() => Promise<BilanPasse>>().mockResolvedValueOnce(bilan('hors_ligne')).mockResolvedValue(bilan('vide'));
    const p = creerPlanificateur({ passe, rafraichir });

    await p.demander({ rafraichir: true });
    expect(rafraichir).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(rafraichir).toHaveBeenCalledTimes(1);
  });
});

describe('arrêter', () => {
  it('ne lance plus rien, même au réveil prévu', async () => {
    const passe = vi.fn(async () => bilan('hors_ligne'));
    const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) });

    await p.demander();
    p.arreter();
    await vi.advanceTimersByTimeAsync(600_000);
    await p.demander();

    expect(passe).toHaveBeenCalledTimes(1);
  });

  it('ne lance pas de rechargement après l’arrêt, même au bout d’une passe en vol', async () => {
    let finir: () => void = () => {};
    const passe = vi
      .fn<() => Promise<BilanPasse>>()
      .mockImplementationOnce(() => new Promise((r) => { finir = () => r(bilan('vide')); }));
    const rafraichir = vi.fn(async () => 'fait' as const);
    const p = creerPlanificateur({ passe, rafraichir });

    const enVol = p.demander({ rafraichir: true });
    p.arreter();
    finir();
    await enVol;

    expect(rafraichir).not.toHaveBeenCalled();
  });
});

describe('un réveil impossible', () => {
  it('ne programme jamais plus loin que dix minutes', async () => {
    const passe = vi
      .fn()
      .mockResolvedValueOnce(bilan('attente', { reveil: Date.now() + 40 * 24 * 3_600_000 }))
      .mockResolvedValue(bilan('vide'));
    const p = creerPlanificateur({ passe, rafraichir: vi.fn().mockResolvedValue('fait') });

    await p.demander();
    await vi.advanceTimersByTimeAsync(599_999);
    expect(passe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(passe).toHaveBeenCalledTimes(2);
    p.arreter();
  });

  it('attend trente secondes sur un réveil illisible, sans tourner en boucle', async () => {
    const passe = vi
      .fn()
      .mockResolvedValueOnce(bilan('attente', { reveil: Number.NaN }))
      .mockResolvedValue(bilan('vide'));
    const p = creerPlanificateur({ passe, rafraichir: vi.fn().mockResolvedValue('fait') });

    await p.demander();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(passe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(passe).toHaveBeenCalledTimes(2);
    p.arreter();
  });
});

describe('une panne ne passe jamais en silence', () => {
  it('écrit la cause d’une passe qui lève, et reprend comme hors ligne', async () => {
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const panne = new Error('disque plein');
      const passe = vi.fn<() => Promise<BilanPasse>>().mockRejectedValueOnce(panne).mockResolvedValue(bilan('vide'));
      const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) });

      await p.demander();
      expect(espion).toHaveBeenCalledWith(panne);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(passe).toHaveBeenCalledTimes(2);
    } finally {
      espion.mockRestore();
    }
  });

  it('écrit la cause d’un rechargement qui lève', async () => {
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const panne = new Error('instantané illisible');
      const rafraichir = vi.fn<() => Promise<'fait' | 'impossible'>>().mockRejectedValue(panne);
      const p = creerPlanificateur({ passe: vi.fn(async () => bilan('vide')), rafraichir });

      await p.demander({ rafraichir: true });
      expect(espion).toHaveBeenCalledWith(panne);
    } finally {
      espion.mockRestore();
    }
  });

  it('programme le réveil même quand un écran lève en étant prévenu', async () => {
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const passe = vi
        .fn<() => Promise<BilanPasse>>()
        .mockResolvedValueOnce(bilan('attente', { reveil: Date.now() + 7000 }))
        .mockResolvedValue(bilan('vide'));
      const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) }, () => {
        throw new Error('écran');
      });

      await p.demander();
      await vi.advanceTimersByTimeAsync(7000);
      expect(passe).toHaveBeenCalledTimes(2);
      p.arreter();
    } finally {
      espion.mockRestore();
    }
  });
});
