import { describe, expect, it } from 'vitest';

import { ouvrirCompteDepuisDemande } from '../functions/_shared/ouvrir-compte';

/**
 * La naissance d'un compte au règlement.
 *
 * C'est le geste irréversible du dispositif. Tout le reste se rattrape : un
 * paiement en attente se relit au passage suivant, une échéance se recalcule,
 * une zone se repose. Un compte créé ne se décrée pas, et un compte crédité au
 * profit de la mauvaise personne encore moins.
 *
 * D'où ce que ces tests mesurent, dans l'ordre de gravité :
 *
 * 1. **Ce qui part chez GoTrue** — l'empreinte, jamais un mot de passe en
 *    clair, qui n'existe nulle part à ce stade.
 * 2. **La reprise** — sans elle, un compte créé dont le crédit a échoué ne
 *    serait plus jamais crédité : quelqu'un aurait payé, aurait un compte, et
 *    pas l'abonnement.
 * 3. **Les refus de la reprise** — elle retrouve un compte par le numéro, et
 *    c'est exactement là qu'une erreur créditerait un tiers. Deux conditions,
 *    et les deux sont mesurées séparément.
 *
 * Tout est bouchonné : ni réseau, ni base. Ce qui est en jeu ici est une suite
 * de décisions, et une décision se mesure sans infrastructure.
 */

interface Reglages {
  demande?: { data: unknown; error: { message: string } | null };
  creation?: { data: { user: { id: string } | null }; error: { message: string } | null };
  parTelephone?: { data: unknown; error: { message: string } | null };
  parId?: { data: { user: { email: string } | null } };
  erreurZone?: { message: string };
}

interface Journal {
  creations: Record<string, unknown>[];
  zones: Record<string, unknown>[];
  telephonesCherches: string[];
  comptesLus: string[];
}

const DEMANDE = {
  nom: 'Mariam Koné',
  telephone: '+2250701020304',
  zone: 'Adjamé',
  email: 'mariam@example.ci',
  mot_de_passe_hash: '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012',
};

const PAIEMENT = {
  id: 'p1',
  palier: 'pro',
  vente_id: 'v1',
  montant: 15000,
  devise: 'XOF',
  remise_pct: 0,
  collecteur_id: null,
  demande_id: 'd1',
  cree_le: '2026-09-03T10:00:00Z',
};

function clientFactice(reglages: Reglages = {}): { client: never; journal: Journal } {
  const journal: Journal = { creations: [], zones: [], telephonesCherches: [], comptesLus: [] };

  const client = {
    from(table: string) {
      return {
        select: () => ({
          eq: (_colonne: string, valeur: string) => ({
            maybeSingle: async () => {
              if (table === 'demandes_ouverture') {
                return reglages.demande ?? { data: DEMANDE, error: null };
              }
              journal.telephonesCherches.push(valeur);
              return reglages.parTelephone ?? { data: null, error: null };
            },
          }),
        }),
        update: (correctif: Record<string, unknown>) => ({
          eq: async (_colonne: string, id: string) => {
            journal.zones.push({ id, ...correctif });
            return { error: reglages.erreurZone ?? null };
          },
        }),
      };
    },
    auth: {
      admin: {
        createUser: async (attributs: Record<string, unknown>) => {
          journal.creations.push(attributs);
          return reglages.creation ?? { data: { user: { id: 'compte-neuf' } }, error: null };
        },
        getUserById: async (id: string) => {
          journal.comptesLus.push(id);
          return reglages.parId ?? { data: { user: null } };
        },
      },
    },
  };

  return { client: client as never, journal };
}

describe('ce qui part chez GoTrue', () => {
  it('reprend l’empreinte, et n’emporte aucun mot de passe en clair', async () => {
    // L'empreinte a été calculée au formulaire ; le clair a disparu avec la
    // portée de `demander-ouverture`. Une clé `password` ici signifierait qu'il
    // a survécu quelque part, et la seule valeur qu'elle pourrait porter serait
    // l'empreinte elle-même — c'est-à-dire un mot de passe de 60 caractères que
    // le prospect n'a jamais choisi, et un compte inatteignable.
    const { client, journal } = clientFactice();

    await ouvrirCompteDepuisDemande(client)(PAIEMENT as never);

    const attributs = journal.creations[0] as Record<string, unknown>;
    expect(attributs.password_hash).toBe(DEMANDE.mot_de_passe_hash);
    expect(attributs).not.toHaveProperty('password');
    expect(attributs.email).toBe('mariam@example.ci');
  });

  it('confirme l’adresse, sinon le payeur reste dehors juste après avoir payé', async () => {
    const { client, journal } = clientFactice();

    await ouvrirCompteDepuisDemande(client)(PAIEMENT as never);

    expect((journal.creations[0] as Record<string, unknown>).email_confirm).toBe(true);
  });

  it('passe nom et téléphone par les métadonnées, d’où le déclencheur les lit', async () => {
    // `creer_collecteur_apres_signup` compose la ligne `collecteurs` à partir de
    // là. Sans ces deux clés, le compte naîtrait « Collecteur » avec son propre
    // identifiant pour numéro — et la reprise, qui cherche par le numéro, ne le
    // retrouverait jamais.
    const { client, journal } = clientFactice();

    await ouvrirCompteDepuisDemande(client)(PAIEMENT as never);

    expect((journal.creations[0] as Record<string, unknown>).user_metadata).toEqual({
      nom: 'Mariam Koné',
      telephone: '+2250701020304',
    });
  });

  it('rend l’identifiant du compte créé', async () => {
    const { client } = clientFactice();

    await expect(ouvrirCompteDepuisDemande(client)(PAIEMENT as never)).resolves.toBe('compte-neuf');
  });
});

describe('la zone', () => {
  it('est posée après coup, le déclencheur ne la connaissant pas', async () => {
    const { client, journal } = clientFactice();

    await ouvrirCompteDepuisDemande(client)(PAIEMENT as never);

    expect(journal.zones).toEqual([{ id: 'compte-neuf', zone: 'Adjamé' }]);
  });

  it('n’empêche pas l’ouverture quand elle échoue', async () => {
    // Le compte existe déjà à ce point. Refuser maintenant empêcherait le crédit
    // pour une colonne d'agrément, et le paiement resterait en attente d'un
    // passage qui échouerait pareil.
    const { client } = clientFactice({ erreurZone: { message: 'permission denied' } });

    await expect(ouvrirCompteDepuisDemande(client)(PAIEMENT as never)).resolves.toBe('compte-neuf');
  });
});

describe('ce qui est refusé avant toute création', () => {
  it('refuse un paiement sans demande', async () => {
    const { client, journal } = clientFactice();

    await expect(
      ouvrirCompteDepuisDemande(client)({ ...PAIEMENT, demande_id: null } as never),
    ).rejects.toThrow('OUVERTURE_SANS_DEMANDE');
    expect(journal.creations).toHaveLength(0);
  });

  it('refuse une demande introuvable', async () => {
    const { client, journal } = clientFactice({ demande: { data: null, error: null } });

    await expect(ouvrirCompteDepuisDemande(client)(PAIEMENT as never)).rejects.toThrow(
      'DEMANDE_INTROUVABLE',
    );
    expect(journal.creations).toHaveLength(0);
  });

  it('refuse une demande sans empreinte, plutôt que d’ouvrir un compte sans accès', async () => {
    // Les demandes déposées avant l'amendement n'en portent pas. Un compte créé
    // là-dessus recevrait un mot de passe que personne ne connaît.
    const { client, journal } = clientFactice({
      demande: { data: { ...DEMANDE, mot_de_passe_hash: null }, error: null },
    });

    await expect(ouvrirCompteDepuisDemande(client)(PAIEMENT as never)).rejects.toThrow(
      'DEMANDE_SANS_IDENTIFIANTS',
    );
    expect(journal.creations).toHaveLength(0);
  });

  it('refuse une demande sans adresse', async () => {
    const { client, journal } = clientFactice({
      demande: { data: { ...DEMANDE, email: null }, error: null },
    });

    await expect(ouvrirCompteDepuisDemande(client)(PAIEMENT as never)).rejects.toThrow(
      'DEMANDE_SANS_IDENTIFIANTS',
    );
    expect(journal.creations).toHaveLength(0);
  });
});

describe('la reprise, quand l’adresse est déjà prise', () => {
  const DOUBLON = {
    creation: {
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' },
    },
  };

  it('retrouve le compte par le numéro et le rend', async () => {
    // Le cas réel : `createUser` a réussi au passage précédent, et
    // `crediter_abonnement` n'a pas tourné. Sans cette reprise, le paiement ne
    // serait plus jamais crédité — quelqu'un aurait payé, aurait un compte, et
    // pas l'abonnement.
    const { client } = clientFactice({
      ...DOUBLON,
      parTelephone: { data: { id: 'compte-existant' }, error: null },
      parId: { data: { user: { email: 'mariam@example.ci' } } },
    });

    await expect(ouvrirCompteDepuisDemande(client)(PAIEMENT as never)).resolves.toBe(
      'compte-existant',
    );
  });

  it('cherche le compte par le numéro de la demande, pas par autre chose', async () => {
    const { client, journal } = clientFactice({
      ...DOUBLON,
      parTelephone: { data: { id: 'compte-existant' }, error: null },
      parId: { data: { user: { email: 'mariam@example.ci' } } },
    });

    await ouvrirCompteDepuisDemande(client)(PAIEMENT as never);

    expect(journal.telephonesCherches).toEqual(['+2250701020304']);
  });

  it('refuse quand le numéro ne désigne aucun compte', async () => {
    // L'adresse appartient à quelqu'un, le numéro à personne : les deux ne se
    // rapportent pas au même compte, et deviner lequel servir reviendrait à
    // créditer au hasard.
    const { client } = clientFactice({ ...DOUBLON, parTelephone: { data: null, error: null } });

    await expect(ouvrirCompteDepuisDemande(client)(PAIEMENT as never)).rejects.toThrow(
      'COMPTE_DEJA_PRIS',
    );
  });

  it('refuse quand le compte trouvé ne porte pas l’adresse de la demande', async () => {
    // Cas rare et constructible : l'adresse est celle d'un compte, le numéro
    // celui d'un autre. Le numéro seul suffirait à créditer le mauvais, et
    // personne ne s'en apercevrait — c'est la raison d'être du second contrôle.
    const { client } = clientFactice({
      ...DOUBLON,
      parTelephone: { data: { id: 'compte-d-un-tiers' }, error: null },
      parId: { data: { user: { email: 'quelquun-dautre@example.ci' } } },
    });

    await expect(ouvrirCompteDepuisDemande(client)(PAIEMENT as never)).rejects.toThrow(
      'REPRISE_INCERTAINE',
    );
  });

  it('compare les adresses sans tenir compte de la casse', async () => {
    // GoTrue normalise l'adresse à l'enregistrement. Une comparaison sensible à
    // la casse referait échouer une reprise parfaitement légitime.
    const { client } = clientFactice({
      ...DOUBLON,
      parTelephone: { data: { id: 'compte-existant' }, error: null },
      parId: { data: { user: { email: 'Mariam@Example.CI' } } },
    });

    await expect(ouvrirCompteDepuisDemande(client)(PAIEMENT as never)).resolves.toBe(
      'compte-existant',
    );
  });
});

describe('les autres échecs de création', () => {
  it('ne cherchent aucun compte : deviner créditerait un tiers', async () => {
    // « Database error creating new user » signifie le plus souvent un numéro
    // déjà porté — le déclencheur a refusé. Retrouver un compte par ce numéro
    // reviendrait précisément à servir la personne qui le détient déjà.
    const { client, journal } = clientFactice({
      creation: { data: { user: null }, error: { message: 'Database error creating new user' } },
    });

    await expect(ouvrirCompteDepuisDemande(client)(PAIEMENT as never)).rejects.toThrow(
      'COMPTE_IMPOSSIBLE',
    );
    expect(journal.telephonesCherches).toHaveLength(0);
  });

  it('remonte la lecture de demande en échec plutôt que de la traiter en absence', async () => {
    // Une demande illisible et une demande absente se corrigent à des endroits
    // opposés. `reconcilier` n'aura que cette ligne de journal.
    const { client } = clientFactice({
      demande: { data: null, error: { message: 'connection reset' } },
    });

    await expect(ouvrirCompteDepuisDemande(client)(PAIEMENT as never)).rejects.toThrow(
      'DEMANDE_ILLISIBLE',
    );
  });
});
