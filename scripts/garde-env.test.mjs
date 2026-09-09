import { describe, expect, it } from 'vitest';

import { chargeUtile, verifierEnv } from './garde-env.mjs';

/**
 * Le garde-fou de configuration.
 *
 * Chaque cas ci-dessous est un déploiement réel du 2026-08-23. Les trois se
 * sont produits d'affilée, sur le même site, en moins d'une heure — et les
 * trois ont réussi la construction. C'est ce que ces tests figent : la
 * construction doit désormais échouer.
 */

const ADRESSE = 'https://yfnwmokxkznejotgpfgf.supabase.co';

/** Fabrique un jeton d'apparence crédible portant le rôle demandé. */
function jeton(role) {
  const b64 = (objet) =>
    Buffer.from(JSON.stringify(objet))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ iss: 'supabase', ref: 'yfnwmokxkznejotgpfgf', role }),
    'signature-quelconque',
  ].join('.');
}

describe('la configuration acceptable', () => {
  it('laisse passer une adresse de projet et une clé anon', () => {
    expect(verifierEnv({ url: ADRESSE, cle: jeton('anon') })).toEqual([]);
  });

  it('laisse passer la pile locale de développement', () => {
    // Le poste du développeur ne pointe pas sur supabase.co. Un garde-fou qui
    // interdirait le local serait contourné, donc inutile.
    expect(verifierEnv({ url: 'http://127.0.0.1:54321', cle: jeton('anon') })).toEqual([]);
  });

  it('laisse passer le nouveau format publiable', () => {
    expect(verifierEnv({ url: ADRESSE, cle: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg' })).toEqual([]);
  });
});

describe('les trois fuites du 2026-08-23', () => {
  it('refuse le JWT de rôle service', () => {
    // La pire des trois : publiée, elle donne à tout visiteur la lecture et
    // l'écriture de la base entière, politiques RLS ignorées.
    const [reproche] = verifierEnv({ url: ADRESSE, cle: jeton('service_role') });
    expect(reproche).toContain('SERVICE');
  });

  it('refuse une clé sb_secret_', () => {
    // Valeur inventée, de la bonne forme mais qui n'est la clé de personne :
    // la protection de poussée de GitHub a refusé la première version de ce
    // test, qui portait une clé secrète réelle. Elle avait raison — un dépôt
    // public n'a pas à contenir une chaîne qu'un scanner reconnaît, même
    // quand elle vient d'une pile de développement locale.
    const [reproche] = verifierEnv({
      url: ADRESSE,
      cle: 'sb_secret_' + 'valeur-inventee-pour-le-test',
    });
    expect(reproche).toContain('SECRÈTE');
  });

  it('refuse un jeton amputé de son premier caractère', () => {
    // 207 caractères au lieu de 208 : la construction passait, le site se
    // chargeait, et chaque appel au projet répondait 401.
    const ampute = jeton('anon').slice(1);
    const [reproche] = verifierEnv({ url: ADRESSE, cle: ampute });
    expect(reproche).toContain('tronquée');
  });
});

describe('l’inversion des deux valeurs', () => {
  it('refuse une clé posée à la place de l’adresse', () => {
    // Le défaut de kolek-admin : `createClient(<clé>, <clé>)`.
    const [reproche] = verifierEnv({ url: jeton('anon'), cle: jeton('anon') });
    expect(reproche).toContain('pas une adresse');
  });

  it('refuse une adresse qui n’est pas celle d’un projet', () => {
    const [reproche] = verifierEnv({ url: 'https://exemple.test', cle: jeton('anon') });
    expect(reproche).toContain('ne ressemble pas');
  });
});

describe('les absences', () => {
  it('nomme chaque variable manquante', () => {
    const reproches = verifierEnv({ url: undefined, cle: undefined });
    expect(reproches).toHaveLength(2);
    expect(reproches[0]).toContain('VITE_SUPABASE_URL');
    expect(reproches[1]).toContain('VITE_SUPABASE_ANON_KEY');
  });
});

describe('chargeUtile', () => {
  it('lit le rôle annoncé', () => {
    expect(chargeUtile(jeton('anon')).role).toBe('anon');
  });

  it('rend null sur ce qui n’est pas un jeton', () => {
    for (const valeur of ['', 'abc', 'a.b', 'eyJ.eyJ']) {
      expect(chargeUtile(valeur)).toBeNull();
    }
  });
});

/**
 * Le greffon est-il branché ?
 *
 * Tout ce qui précède mesure la fonction de décision. Rien ne mesurait qu'elle
 * soit posée — et c'est exactement là qu'elle a manqué : `vite.config.ts` du
 * collecteur importait `gardeEnv` sans jamais l'ajouter à `plugins`. L'import
 * mort rendait la ligne crédible à la relecture. Découvert le 2026-09-09.
 *
 * L'application la moins gardée était donc la seule à porter une session en
 * itinérance, sur des téléphones où la mise à jour passe par un service worker.
 * Le second filet — `verifier:bundles` — attrape encore la clé de service, mais
 * pas le défaut qui avait motivé ce greffon : une clé anonyme tronquée, valide
 * d'apparence, qui fait rendre `401` à toute l'application sans que rien n'ait
 * échoué à la construction.
 *
 * Le contrôle porte sur la configuration réelle, importée, pas sur le texte du
 * fichier : un test qui cherche « gardeEnv » dans la source repasserait au vert
 * sur le défaut même qu'il doit voir.
 */
describe('le greffon est posé dans les trois applications', () => {
  for (const application of ['admin', 'collecteur', 'site']) {
    it(`${application} enregistre kolek-garde-env`, async () => {
      const module = await import(`../apps/${application}/vite.config.ts`);
      const configuration = module.default;
      const greffons = (configuration.plugins ?? []).flat(Infinity);

      expect(greffons.map((g) => g?.name)).toContain('kolek-garde-env');
    });
  }
});
