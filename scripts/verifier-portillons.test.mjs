import { describe, expect, it } from 'vitest';

import {
  fonctionsDuDisque,
  lireSources,
  PORTILLONS,
  portillonDe,
  refusHonore,
  reproches,
} from './verifier-portillons.mjs';

/**
 * Le contrôle n°6 des vingt — « autorisation côté serveur » — cesse d'être
 * recompté à la main.
 *
 * Les audits successifs ont écrit « 16 fonctions détiennent la clé de service,
 * 14 vérifient leur appelant » (2026-09-04), puis dix-neuf fonctions toutes
 * gardées (2026-09-10). Ces nombres étaient justes le jour de leur mesure. Le
 * dépôt est passé de treize à dix-neuf fonctions en trois semaines : la
 * question n'est pas de savoir si elles sont gardées aujourd'hui, c'est de
 * savoir si la vingtième le sera.
 *
 * ## Extraire puis comparer
 *
 * Le 🟠 n°1 du 2026-09-09 a appris qu'un contrôle qui **cherche** un motif passe
 * au vert sur le défaut même qu'il doit voir. Ces tests ne demandent donc jamais
 * « y a-t-il un contrôle » : ils extraient la nature du portillon et la
 * comparent à ce qui est déclaré.
 */
describe('portillonDe', () => {
  it('reconnaît le portillon super-admin', () => {
    expect(portillonDe("import { ouvrir } from '../_shared/portillon-super-admin.ts';")).toBe(
      'super-admin',
    );
    expect(portillonDe("await client.rpc('est_super_admin')")).toBe('super-admin');
  });

  it('reconnaît le portillon admin', () => {
    expect(portillonDe("await client.rpc('est_admin')")).toBe('admin');
  });

  it('reconnaît un secret partagé', () => {
    expect(portillonDe('if (!(await secretValide(porteur, attendu)))')).toBe('secret-partage');
  });

  it('reconnaît une simple session', () => {
    expect(portillonDe('const { data } = await client.auth.getUser()')).toBe('session');
  });

  it('reconnaît une fonction publique bornée', () => {
    expect(portillonDe("await service.rpc('consommer_debit', { p_ip: ip })")).toBe('debit-public');
  });

  it('classe par la vérification qui décide, et non par la plus faible', () => {
    // Une fonction admin lit aussi `getUser()` pour imputer son geste. C'est
    // `est_admin` qui décide, et c'est lui qu'il faut voir disparaître.
    const source = "await client.auth.getUser(); await client.rpc('est_admin')";

    expect(portillonDe(source)).toBe('admin');
  });

  it('dit « aucun » quand rien ne garde la porte', () => {
    expect(portillonDe("const service = createClient(url, cleService); service.from('clients')")).toBe(
      'aucun',
    );
  });
});

/**
 * Le contrôle de structure, et la raison qu'il existe.
 *
 * `ouvrir()` rend soit une ouverture, soit la `Response` qui referme. Une
 * fonction qui l'appellerait sans traiter le refus sortirait la clé de service
 * pour un appelant recalé — et son import serait pourtant bien présent. C'est
 * exactement la forme du défaut que le 🟠 n°1 décrit.
 */
describe('refusHonore', () => {
  it('accepte une fonction qui traite le refus', () => {
    const source = `
      const ouverture = await ouvrir(requete);
      if (ouverture instanceof Response) return ouverture;
    `;

    expect(refusHonore(source)).toBe(true);
  });

  it('refuse une fonction qui appelle le portillon sans en tenir compte', () => {
    // L'import est là, le greffon manque. Le défaut que seule une lecture de la
    // structure attrape.
    const source = `
      const ouverture = await ouvrir(requete);
      const { service } = ouverture;
    `;

    expect(refusHonore(source)).toBe(false);
  });

  it('ne dit rien des fonctions qui n’utilisent pas ce portillon', () => {
    expect(refusHonore("await client.rpc('est_admin')")).toBe(true);
  });
});

describe('reproches', () => {
  const declares = { alpha: 'admin', beta: 'session' };

  it('ne dit rien quand chaque fonction garde sa porte comme déclaré', () => {
    const sources = {
      alpha: "await client.rpc('est_admin')",
      beta: 'await client.auth.getUser()',
    };

    expect(reproches(sources, declares)).toEqual([]);
  });

  it('signale une fonction neuve que personne n’a classée', () => {
    const sources = {
      alpha: "await client.rpc('est_admin')",
      beta: 'await client.auth.getUser()',
      gamma: 'await client.auth.getUser()',
    };

    const trouves = reproches(sources, declares);

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('gamma');
  });

  it('signale une porte qui ne garde plus rien', () => {
    const sources = {
      alpha: "const service = createClient(url, cleService); service.from('clients')",
      beta: 'await client.auth.getUser()',
    };

    const trouves = reproches(sources, declares);

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('ne vérifie plus rien');
  });

  it('signale un portillon affaibli sans que la table suive', () => {
    // `alpha` était `admin` ; elle ne lit plus qu'une session. La fonction
    // marche toujours, ses tests passent, et n'importe quel utilisateur
    // connecté atteint désormais une console d'administration.
    const sources = {
      alpha: 'await client.auth.getUser()',
      beta: 'await client.auth.getUser()',
    };

    const trouves = reproches(sources, declares);

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('session');
    expect(trouves[0]).toContain('admin');
  });

  it('signale un refus de portillon non honoré', () => {
    const sources = {
      alpha: "await client.rpc('est_admin'); const o = await ouvrir(requete); const { service } = o;",
      beta: 'await client.auth.getUser()',
    };

    const trouves = reproches(sources, declares);

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('sans traiter son refus');
  });

  it('signale une fonction déclarée mais disparue du disque', () => {
    // Sans ça, une entrée périmée resterait dans la table et masquerait la
    // fonction suivante qui prendrait son nom.
    const trouves = reproches({ alpha: "await client.rpc('est_admin')" }, declares);

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('beta');
  });
});

/**
 * Le test qui porte sur le vrai dépôt.
 *
 * Les six précédents éprouvent la mécanique sur des sources fabriquées. Celui-ci
 * la lâche sur `supabase/functions/`, et c'est lui qui parlera le jour où
 * quelqu'un ajoutera une vingtième fonction.
 */
describe('le dépôt', () => {
  it('garde ses dix-neuf portes comme déclaré', () => {
    expect(reproches(lireSources())).toEqual([]);
  });

  it('n’a aucune fonction hors de la table, ni l’inverse', () => {
    // Redit autrement ce que `reproches` vérifie déjà, mais en donnant les deux
    // listes côte à côte : quand ça casse, l'écart se lit d'un coup d'œil.
    expect(fonctionsDuDisque()).toEqual(Object.keys(PORTILLONS).sort());
  });
});
