import { describe, expect, it, vi } from 'vitest';

/**
 * Ce que voit le collecteur quand le serveur refuse.
 *
 * Les déclencheurs de la base lèvent des messages courts et stables —
 * `CARTE_INTROUVABLE`, `CYCLE_COMPLET`, `MONTANT_INVALIDE`. Ils sont faits pour
 * être comparés par du code. Devant un étal, personne ne peut rien en faire :
 * la traduction est donc une fonction du produit, pas un détail d'affichage, et
 * elle mérite d'être tenue par des tests.
 *
 * `supabase` est simulé : ce fichier ne teste pas la base — `ecritures-collecteur.test.ts`
 * s'en charge, sur une vraie base, sous RLS — mais l'aiguillage qui décide de
 * la phrase.
 */

const insert = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { from: () => ({ insert: (l: unknown) => insert(l) }) },
}));

const { codeDErreur, creerClientAvecCarte, enregistrerMise } = await import('./ecritures');

const COLLECTEUR = '11111111-1111-4111-8111-111111111111';
const CARTE = '22222222-2222-4222-8222-222222222222';

describe('traduction des refus du serveur', () => {
  it('reconnaît les messages des déclencheurs, qui voyagent tous en P0001', () => {
    // Le point qui compte : ces cinq refus partagent le même SQLSTATE. Se fier
    // au code plutôt qu'au message les rendrait indiscernables, et le collecteur
    // lirait « réessaie » là où il faut clôturer la carte.
    for (const cle of [
      'DOUBLON',
      'CARTE_INTROUVABLE',
      'CARTE_CLOTUREE',
      'CYCLE_COMPLET',
      'MONTANT_INVALIDE',
    ]) {
      expect(codeDErreur({ code: 'P0001', message: `${cle}: quelque chose` })).toBe(cle);
    }
  });

  it('reconnaît une borne de longueur à son SQLSTATE', () => {
    expect(codeDErreur({ code: '23514', message: 'violates check constraint' })).toBe('BORNE');
  });

  it('reconnaît un refus de droit', () => {
    expect(codeDErreur({ code: '42501', message: 'permission denied' })).toBe('DROIT_REFUSE');
  });

  it('range ce qu’il ne connaît pas plutôt que de deviner', () => {
    expect(codeDErreur({ code: '08006', message: 'connection failure' })).toBe('INCONNU');
    expect(codeDErreur(null)).toBe('INCONNU');
  });

  it('préfère le message du déclencheur au SQLSTATE', () => {
    // Un doublon remonte parfois en 23505 depuis la clé primaire, parfois en
    // P0001 depuis le déclencheur qui l'intercepte en premier. Les deux doivent
    // donner la même phrase.
    expect(codeDErreur({ code: '23505', message: 'duplicate key' })).toBe('DOUBLON');
    expect(codeDErreur({ code: 'P0001', message: 'DOUBLON' })).toBe('DOUBLON');
  });
});

describe('refus décidés avant tout aller-retour', () => {
  it('refuse un nom vide sans écrire', async () => {
    insert.mockReset();
    const r = await creerClientAvecCarte(COLLECTEUR, { nom: '   ', mise: 1000 });

    expect(r.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuse une mise hors bornes sans écrire', async () => {
    insert.mockReset();
    const r = await enregistrerMise(COLLECTEUR, CARTE, 250);

    expect(r.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('ce que le téléphone envoie, et ce qu’il n’envoie pas', () => {
  it('engendre l’identifiant de la mise lui-même', async () => {
    // C'est tout le mécanisme anti-double-comptage : un rejeu de la file de
    // synchro porte le même identifiant, viole la clé primaire, et se voit
    // répondre DOUBLON. Laisser la base l'engendrer ferait de chaque rejeu une
    // seconde mise — de l'argent compté deux fois.
    insert.mockReset().mockResolvedValue({ error: null });
    const r = await enregistrerMise(COLLECTEUR, CARTE, 1000);

    expect(r.ok).toBe(true);
    const ligne = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(typeof ligne.id).toBe('string');
    expect((ligne.id as string).length).toBe(36);
  });

  it('n’envoie jamais est_commission — le serveur en décide', async () => {
    // Si le téléphone le décidait, un collecteur pourrait marquer chaque mise
    // du cycle comme sa commission.
    insert.mockReset().mockResolvedValue({ error: null });
    await enregistrerMise(COLLECTEUR, CARTE, 1000);

    const ligne = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(ligne).not.toHaveProperty('est_commission');
    expect(ligne).not.toHaveProperty('mises_encaissees');
  });

  it('dit que le client est enregistré quand seule la carte échoue', async () => {
    // Deux instructions sans transaction : PostgREST n'en propose pas. Un client
    // sans carte est un état que le produit connaît et affiche — le filtre
    // « Sans carte » existe. Le message doit le dire, sinon le collecteur
    // ressaisit le client et en crée un doublon.
    insert
      .mockReset()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { code: '23514', message: 'check' } });

    const r = await creerClientAvecCarte(COLLECTEUR, { nom: 'Awa', mise: 1000 });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.echec.message).toContain('Awa est enregistré');
      expect(r.echec.message).toContain('carte');
    }
  });

  it('vide les champs facultatifs en null plutôt qu’en chaîne vide', async () => {
    // Une chaîne vide passerait les bornes de longueur et s'afficherait comme
    // un téléphone renseigné mais illisible. `null` dit « pas de valeur ».
    insert.mockReset().mockResolvedValue({ error: null });
    await creerClientAvecCarte(COLLECTEUR, { nom: 'Awa', telephone: '  ', mise: 1000 });

    const ligne = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(ligne.telephone).toBeNull();
    expect(ligne.marche).toBeNull();
  });
});

describe('reprise après un nouveau déploiement', () => {
  it('recharge l’écran quand un autre service worker prend la main', async () => {
    // Le défaut vu en production le 2026-08-20 : le paquet servi était le bon,
    // mais la coquille précachée était vieille — le collecteur voyait encore le
    // bouton « Confirmer la mise » grisé. Sur une application posée sur l'écran
    // d'accueil d'un téléphone, personne ne recharge deux fois.
    const ecouteurs: Record<string, () => void> = {};
    const reload = vi.fn();

    vi.stubGlobal('navigator', {
      serviceWorker: {
        controller: {},
        addEventListener: (nom: string, f: () => void) => {
          ecouteurs[nom] = f;
        },
      },
    });
    vi.stubGlobal('window', { location: { reload } });

    const { surveillerMisesAJour } = await import('./maj-service-worker');
    surveillerMisesAJour();

    ecouteurs.controllerchange!();
    expect(reload).toHaveBeenCalledTimes(1);

    // Deuxième événement : pas de second rechargement. Sans ce garde-fou, un
    // service worker qui n'arrive pas à s'activer mettrait l'écran en boucle et
    // emporterait la saisie en cours.
    ecouteurs.controllerchange!();
    expect(reload).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it('ne recharge pas à la toute première installation', async () => {
    // Première visite : aucun contrôleur, puis un contrôleur. L'événement se
    // déclenche pour un remplacement qui n'en est pas un, et recharger ici
    // infligerait un clignotement à chaque nouveau collecteur.
    vi.resetModules();
    const ecouteurs: Record<string, () => void> = {};
    const reload = vi.fn();

    vi.stubGlobal('navigator', {
      serviceWorker: {
        controller: null,
        addEventListener: (nom: string, f: () => void) => {
          ecouteurs[nom] = f;
        },
      },
    });
    vi.stubGlobal('window', { location: { reload } });

    const { surveillerMisesAJour } = await import('./maj-service-worker');
    surveillerMisesAJour();

    ecouteurs.controllerchange!();
    expect(reload).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
