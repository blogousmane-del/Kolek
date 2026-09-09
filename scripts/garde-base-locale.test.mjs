import { describe, expect, it } from 'vitest';
import { verifierCible } from './garde-base-locale.mjs';

/**
 * Le garde-fou de cible de la suite de base.
 *
 * Il existe à cause d'un chemin mesuré le 2026-09-09 :
 * `process.loadEnvFile()` n'écrase pas une variable déjà posée dans
 * l'environnement, donc `supabase/tests/.env.test` — pourtant réécrit en local
 * par `npm run db:env` — perd contre un `SUPABASE_URL` exporté dans le shell.
 *
 * Et `avis-drainage.test.ts` porte, dans un `beforeEach`, un
 * `delete().not('id','is',null)` sur `avis_clients` avec la clé de service.
 * RLS contournée, toutes les lignes désignées. Contre la production, la table
 * est vidée pour tous les collecteurs.
 */
describe('verifierCible', () => {
  it('accepte la pile locale telle que `supabase status` la rend', () => {
    expect(verifierCible('http://127.0.0.1:54321')).toEqual([]);
  });

  it('accepte le nom d’hôte de bouclage', () => {
    expect(verifierCible('http://localhost:54321')).toEqual([]);
  });

  it('accepte le bouclage IPv6', () => {
    // Un poste configuré IPv6 d'abord peut recevoir cette forme.
    expect(verifierCible('http://[::1]:54321')).toEqual([]);
  });

  it('refuse un projet Supabase distant et nomme l’adresse trouvée', () => {
    const reproches = verifierCible('https://yfnwmokxkznejotgpfgf.supabase.co');

    expect(reproches).toHaveLength(1);
    // Le message doit porter l'adresse : sans elle, la personne qui le lit ne
    // sait pas quelle variable de son shell est en cause.
    expect(reproches[0]).toContain('yfnwmokxkznejotgpfgf.supabase.co');
  });

  it('refuse une adresse absente', () => {
    expect(verifierCible(undefined)).toHaveLength(1);
    expect(verifierCible('')).toHaveLength(1);
  });

  it('refuse un hôte qui contient une adresse de bouclage sans en être une', () => {
    // Le piège d'une comparaison par `includes` : ces deux-là passeraient.
    expect(verifierCible('https://127.0.0.1.attaquant.com')).toHaveLength(1);
    expect(verifierCible('https://localhost.attaquant.com')).toHaveLength(1);
  });

  it('refuse ce qui n’est pas une adresse', () => {
    expect(verifierCible('pas une adresse')).toHaveLength(1);
  });
});
