import { describe, expect, it } from 'vitest';
import {
  reproches,
  variablesDeclarees,
  variablesUtilisees,
} from './verifier-exemples-env.mjs';

/**
 * `apps/site/.env.example` a manqué du 2026-08-23 au 2026-09-09, réclamé par
 * trois audits. Le README envoyait pendant ce temps tout clone neuf dans le mur :
 * il annonçait « aucun .env : le site ne parle à aucune API », alors que
 * `gardeEnv()` est posé sur la vitrine et lève dans le hook `config`, qui
 * s'exécute en `dev` comme en `build`.
 *
 * Le contrôle ne vise donc pas ce fichier-là mais l'**écart** : les variables
 * que le code lit doivent être exactement celles que l'exemple déclare. Un
 * exemple qui existe mais qui a vieilli coûte le même après-midi qu'un exemple
 * absent — la seule différence est qu'on le soupçonne moins vite.
 */
describe('variablesUtilisees', () => {
  it('trouve les variables lues par le code', () => {
    const source = `
      const url = import.meta.env.VITE_SUPABASE_URL;
      const cle = import.meta.env.VITE_SUPABASE_ANON_KEY;
    `;

    expect(variablesUtilisees(source)).toEqual([
      'VITE_SUPABASE_ANON_KEY',
      'VITE_SUPABASE_URL',
    ]);
  });

  it('ne rend qu’une fois une variable lue deux fois', () => {
    expect(variablesUtilisees('VITE_A + VITE_A')).toEqual(['VITE_A']);
  });

  it('ignore ce qui n’est pas préfixé VITE_', () => {
    // Seul ce préfixe est compilé dans le paquet public ; le reste ne concerne
    // pas un fichier d'exemple destiné au poste de développement.
    expect(variablesUtilisees('process.env.SUPABASE_SERVICE_ROLE_KEY')).toEqual([]);
  });
});

describe('variablesDeclarees', () => {
  it('lit les clés d’un fichier d’exemple', () => {
    const contenu = 'VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_ANON_KEY=remplacer\n';

    expect(variablesDeclarees(contenu)).toEqual([
      'VITE_SUPABASE_ANON_KEY',
      'VITE_SUPABASE_URL',
    ]);
  });

  it('ignore les commentaires et les lignes vides', () => {
    expect(variablesDeclarees('# un commentaire\n\nVITE_A=1\n')).toEqual(['VITE_A']);
  });
});

describe('reproches', () => {
  it('ne dit rien quand l’exemple couvre exactement le code', () => {
    expect(reproches('site', ['VITE_A'], ['VITE_A'])).toEqual([]);
  });

  it('signale une variable lue par le code et absente de l’exemple', () => {
    const trouves = reproches('site', ['VITE_A', 'VITE_B'], ['VITE_A']);

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('VITE_B');
    expect(trouves[0]).toContain('site');
  });

  it('signale une variable déclarée que plus personne ne lit', () => {
    // Un exemple qui a vieilli fait perdre le même après-midi qu'un exemple
    // absent, et se soupçonne moins vite.
    const trouves = reproches('site', [], ['VITE_MORTE']);

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('VITE_MORTE');
  });

  it('signale l’exemple absent quand le code lit quelque chose', () => {
    // `declarees === null` distingue « fichier absent » de « fichier vide » :
    // le premier est le défaut de 2026-08-23, et son message doit le nommer.
    const trouves = reproches('site', ['VITE_A'], null);

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('.env.example');
  });
});
