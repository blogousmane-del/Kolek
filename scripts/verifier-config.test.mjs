import { describe, expect, it } from 'vitest';

import {
  argumentsDiff,
  chemin,
  TOLERES,
  POSTURE,
  rapportUtilisable,
  reproches,
} from './verifier-config.mjs';

/**
 * La configuration du projet distant cesse d'être supposée.
 *
 * Six audits d'affilée ont écrit « la limite Auth reste au défaut de la
 * plateforme » sans jamais l'ouvrir. Le 2026-09-10, `supabase config diff` a
 * rendu la lecture en une commande, et elle disait autre chose que ce qui était
 * classé : `minimum_password_length` valait **6** en production là où le dépôt
 * déclare **10** avec son motif écrit, et `secure_password_change` était à
 * `false` là où le dépôt le veut à `true`.
 *
 * ## Ce que ces épreuves fixent
 *
 * `config diff` ne rend que les **différences** entre le dépôt et le distant.
 * Un réglage identique des deux côtés n'apparaît nulle part. Le contrôle ne
 * peut donc pas affirmer « la production vaut X » dans l'absolu : il affirme
 * « la production suit ce que le dépôt déclare », sur une liste de chemins
 * choisis. Resserrer une valeur commence par la changer dans `config.toml` —
 * c'est ce geste qui rend l'écart mesurable.
 *
 * ## Le contrôle aveugle
 *
 * Un rapport tronqué se lit « aucun écart », c'est-à-dire « tout va bien ». Les
 * épreuves de `rapportUtilisable` existent pour ça, sur le modèle du « en
 * trouve, avant de juger » de `search-path.test.ts`.
 */

/** Un rapport minimal, de la forme que rend `supabase config diff`. */
function rapport(bouts = {}) {
  return {
    scope: { present: ['api', 'auth'], missing: [] },
    changes: [],
    masked: [],
    unmanaged: [],
    ...bouts,
  };
}

function ecart(cle, local, distant) {
  return { path: cle.split('.'), class: 'update', declared: true, local, remote: distant };
}

describe('chemin', () => {
  it('rend le chemin pointé que portent les tables', () => {
    expect(chemin(['auth', 'email', 'secure_password_change'])).toBe(
      'auth.email.secure_password_change',
    );
  });

  it('survit à un chemin d’un seul segment', () => {
    expect(chemin(['auth'])).toBe('auth');
  });
});

describe('les deux tables', () => {
  it('portent un motif pour chaque chemin, jamais une entrée nue', () => {
    for (const [cle, motif] of [...Object.entries(POSTURE), ...Object.entries(TOLERES)]) {
      expect(typeof motif, `${cle} n’a pas de motif`).toBe('string');
      expect(motif.length, `le motif de ${cle} est vide`).toBeGreaterThan(20);
    }
  });

  it('ne classent jamais le même chemin des deux côtés', () => {
    const doubles = Object.keys(POSTURE).filter((c) => c in TOLERES);
    expect(doubles, 'un chemin à la fois posture et tolere ne veut rien dire').toEqual([]);
  });

  it('retiennent les deux réglages trouvés le 2026-09-10', () => {
    // Le contrôle est né de ces deux-là. Les retirer de la table le viderait de
    // son motif sans qu'aucune autre épreuve ne s'en aperçoive.
    expect(POSTURE).toHaveProperty('auth.minimum_password_length');
    expect(POSTURE).toHaveProperty('auth.email.secure_password_change');
  });
});

describe('reproches', () => {
  it('se tait quand rien ne diffère', () => {
    expect(reproches(rapport())).toEqual([]);
  });

  it('nomme les deux valeurs et le motif quand la posture n’est pas tenue', () => {
    const trouves = reproches(
      rapport({ changes: [ecart('auth.minimum_password_length', 10, 6)] }),
    );

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('auth.minimum_password_length');
    expect(trouves[0]).toContain('10');
    expect(trouves[0]).toContain('6');
    // Celui qui lira l'échec dans six mois n'aura pas lu ce fichier.
    expect(trouves[0]).toContain(POSTURE['auth.minimum_password_length']);
  });

  it('laisse passer un écart classé et motivé', () => {
    const cle = Object.keys(TOLERES)[0];
    expect(reproches(rapport({ changes: [ecart(cle, 'ici', 'là-bas')] }))).toEqual([]);
  });

  it('refuse un écart qu’aucune table ne classe', () => {
    const trouves = reproches(rapport({ changes: [ecart('auth.invente_ce_matin', 1, 2)] }));

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('auth.invente_ce_matin');
    expect(trouves[0]).toMatch(/class/i);
  });

  it('refuse de conclure sur une posture que l’API ne compare pas', () => {
    // `unmanaged` est le piège discret : le chemin est déclaré, il n'apparaît
    // pas dans `changes`, et une lecture naïve en déduit « identique ».
    const cle = Object.keys(POSTURE)[0];
    const trouves = reproches(rapport({ unmanaged: [cle.split('.')] }));

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain(cle);
    expect(trouves[0]).toMatch(/pas compar|ne peut pas/i);
  });

  it('refuse de conclure sur une posture que l’API masque', () => {
    const cle = Object.keys(POSTURE)[0];
    const trouves = reproches(rapport({ masked: [cle.split('.')] }));

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain(cle);
  });

  it('rend un reproche par écart, sans en fondre deux en un', () => {
    const trouves = reproches(
      rapport({
        changes: [
          ecart('auth.minimum_password_length', 10, 6),
          ecart('auth.email.secure_password_change', true, false),
        ],
      }),
    );

    expect(trouves).toHaveLength(2);
  });

  it('sait dire un tableau, pas seulement un nombre', () => {
    const trouves = reproches(
      rapport({ changes: [ecart('api.schemas', ['public'], ['public', 'graphql_public'])] }),
    );

    expect(trouves[0]).toContain('graphql_public');
  });
});

describe('rapportUtilisable', () => {
  it('accepte un rapport complet', () => {
    expect(rapportUtilisable(rapport())).toEqual([]);
  });

  it('refuse un rapport dont une portée manque', () => {
    // Une portée absente, c'est une famille entière de réglages non lue — et le
    // rapport la rend quand même sous la forme rassurante d'une liste vide.
    const trouves = rapportUtilisable(rapport({ scope: { present: ['api'], missing: ['auth'] } }));

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('auth');
  });

  it('refuse un rapport sans liste d’écarts', () => {
    expect(rapportUtilisable(rapport({ changes: undefined }))).toHaveLength(1);
  });

  it('refuse un rapport qui ne compare aucune portée', () => {
    expect(rapportUtilisable(rapport({ scope: { present: [], missing: [] } }))).toHaveLength(1);
  });
});

describe('argumentsDiff', () => {
  it('vise le projet lié quand rien ne le nomme', () => {
    // Sur un poste de développement, `supabase link` a déjà été fait et la
    // référence vit dans `supabase/.temp`, hors du dépôt.
    expect(argumentsDiff({})).toEqual(['supabase', 'config', 'diff', '--output-format', 'json']);
  });

  it('nomme le projet quand l’environnement le donne', () => {
    // Le CI n'a pas de lien local : sans `--project-ref`, la commande échoue
    // sur « projet non lié » et le contrôle passe pour cassé alors qu'il est
    // seulement mal adressé.
    expect(argumentsDiff({ PROJET: 'abcdefghijklmnopqrst' })).toContain('--project-ref');
    expect(argumentsDiff({ PROJET: 'abcdefghijklmnopqrst' })).toContain('abcdefghijklmnopqrst');
  });

  it('ignore une référence vide plutôt que de passer un drapeau nu', () => {
    expect(argumentsDiff({ PROJET: '   ' })).not.toContain('--project-ref');
  });
});
