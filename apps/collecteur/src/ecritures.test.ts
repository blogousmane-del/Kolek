import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const majChamps = vi.fn();
const majSelect = vi.fn();

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      insert: (l: unknown) => insert(l),
      // La chaîne complète est simulée — `update().eq().select()` — parce que
      // c'est justement le `.select()` final qui est en cause : sans lui,
      // PostgREST ne dit pas combien de lignes il a touchées.
      update: (l: unknown) => {
        majChamps(l);
        return { eq: () => ({ select: () => majSelect() }) };
      },
    }),
  },
}));

const {
  codeDErreur,
  creerClientAvecCarte,
  definirConsentementAvis,
  enregistrerMise,
  modifierClient,
} =
  await import('./ecritures');

const COLLECTEUR = '11111111-1111-4111-8111-111111111111';
const CARTE = '22222222-2222-4222-8222-222222222222';
const CLIENT = '33333333-3333-4333-8333-333333333333';

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
    expect(
      codeDErreur({
        code: '23514',
        message: 'new row for relation "clients" violates check constraint "clients_nom_borne"',
      }),
    ).toBe('BORNE');
    // Sans nom de contrainte, rien ne permet d'affirmer mieux que « une borne ».
    expect(codeDErreur({ code: '23514', message: 'violates check constraint' })).toBe('BORNE');
  });

  it('distingue une borne de montant d’une borne de longueur', () => {
    // Le 2026-09-02, ouvrir une carte à 15 000 FCFA sur un serveur dont la
    // contrainte plafonnait encore à 10 000 affichait « Une des informations
    // saisies est trop longue. » L'écran d'ouverture n'envoie aucun texte : sur
    // ce chemin, un 23514 ne peut désigner que le montant. Le collecteur
    // cherchait une faute de frappe dans le nom du client.
    for (const contrainte of ['cartes_mise_check', 'mises_montant_borne', 'mises_montant_check']) {
      expect(
        codeDErreur({
          code: '23514',
          message: `new row for relation "cartes" violates check constraint "${contrainte}"`,
        }),
      ).toBe('BORNE_MONTANT');
    }
  });

  it('reconnaît un refus de droit', () => {
    expect(codeDErreur({ code: '42501', message: 'permission denied' })).toBe('DROIT_REFUSE');
  });

  it('nomme l’abonnement quand c’est lui qui ferme la porte', () => {
    // Depuis `20260902110000`, `clients_insert` et `cartes_insert` exigent
    // `abonnement_ouvre_droit`. L'autre condition de ces deux policies,
    // `collecteur_id = auth.uid()`, est posée par l'application depuis la
    // session : elle ne peut pas être fausse ici. Un refus RLS sur ces deux
    // tables désigne donc l'abonnement, et le collecteur lisait « Tu n'as pas le
    // droit d'écrire cette ligne » — une phrase qui l'envoie chercher un défaut
    // là où il n'y a qu'une facture.
    for (const table of ['clients', 'cartes']) {
      expect(
        codeDErreur({
          code: '42501',
          message: `new row violates row-level security policy for table "${table}"`,
        }),
      ).toBe('ABONNEMENT_INACTIF');
    }
  });

  it('ne met pas l’encaissement sur le compte de l’abonnement', () => {
    // `mises_insert` n'a délibérément pas reçu la condition : un abonnement
    // suspendu n'empêche pas d'encaisser une carte déjà ouverte, et
    // `abonnement-ouvre-droit.test.ts` le vérifie côté base. Annoncer ici un
    // abonnement inactif sur un refus qui vient d'ailleurs enverrait le
    // collecteur payer une facture qui ne débloquerait rien.
    expect(
      codeDErreur({
        code: '42501',
        message: 'new row violates row-level security policy for table "mises"',
      }),
    ).toBe('DROIT_REFUSE');
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

describe('le consentement ne peut pas échouer en silence', () => {
  /**
   * Le défaut du 2026-08-24. `update().eq()` sans `.select()` : quand RLS ou un
   * privilège de colonne écarte la ligne, PostgREST ne touche rien, ne rend
   * **aucune erreur**, et l'appelant conclut au succès. L'écran se relit,
   * retrouve l'ancienne valeur, et n'a rien à montrer — le collecteur appuie,
   * il ne se passe rien, et rien nulle part ne dit pourquoi.
   *
   * Le geste engage la vie privée d'un tiers : un retrait de consentement qu'on
   * croit enregistré et qui ne l'est pas continue d'envoyer le solde d'épargne
   * de quelqu'un sur un téléphone qu'il partage. Le silence est ici le pire des
   * comportements possibles.
   */
  it('rend un échec quand le serveur n’a touché aucune ligne', async () => {
    majSelect.mockReset().mockResolvedValue({ data: [], error: null });

    const r = await definirConsentementAvis(CLIENT, false);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.echec.code).toBe('RIEN_ECRIT');
  });

  it('rend un succès quand la ligne a bien été écrite', async () => {
    majSelect.mockReset().mockResolvedValue({ data: [{ id: CLIENT }], error: null });

    const r = await definirConsentementAvis(CLIENT, false);

    expect(r.ok).toBe(true);
  });

  it('réclame au serveur la ligne écrite, seul moyen de la compter', async () => {
    majSelect.mockReset().mockResolvedValue({ data: [{ id: CLIENT }], error: null });

    await definirConsentementAvis(CLIENT, true);

    expect(majSelect).toHaveBeenCalled();
    expect(majChamps).toHaveBeenLastCalledWith({ avis_actifs: true });
  });

  it('traduit un refus de droit plutôt que de le taire', async () => {
    majSelect
      .mockReset()
      .mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });

    const r = await definirConsentementAvis(CLIENT, false);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.echec.code).toBe('DROIT_REFUSE');
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

/**
 * La correction d'une fiche client.
 *
 * ## Ce que ces épreuves gardent, et que rien d'autre ne garde
 *
 * Le déclencheur de notification lit `client.telephone` **au moment de la
 * mise**. Corriger le numéro d'un client aux avis actifs enverrait son solde
 * d'épargne à un numéro que personne n'a accepté — et une faute de frappe dans
 * la correction, à un inconnu. `avis_actifs` doit donc retomber, et retomber
 * **dans la même requête** : deux écritures successives laisseraient une
 * fenêtre où le nouveau numéro cohabite avec l'ancien consentement, et une mise
 * encaissée dedans partirait au mauvais endroit.
 *
 * Mesuré en production le 2026-09-11 : 68 clients sur 81 ont les avis actifs.
 * Ce n'est pas un cas limite, c'est le cas courant.
 */
describe('modifierClient', () => {
  const ORIGINE = { nom: 'GSM T', telephone: '0709201790', marche: 'BLE ZOKOU', activite: '' };

  beforeEach(() => {
    majChamps.mockReset();
    majSelect.mockReset().mockResolvedValue({ data: [{ id: CLIENT }], error: null });
  });

  it('n’envoie que le champ changé', async () => {
    await modifierClient(CLIENT, { ...ORIGINE, nom: 'GSM Traoré' }, ORIGINE);

    expect(majChamps).toHaveBeenCalledWith({ nom: 'GSM Traoré' });
  });

  it('n’écrit rien quand rien n’a changé', async () => {
    // Un formulaire ouvert puis refermé ne doit laisser aucune ligne au journal
    // d'audit, ni annoncer un succès qui mentirait.
    const r = await modifierClient(CLIENT, { ...ORIGINE }, ORIGINE);

    expect(majChamps).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, ecrit: false });
  });

  it('coupe les avis dès que le numéro change, dans la même requête', async () => {
    await modifierClient(CLIENT, { ...ORIGINE, telephone: '0709201799' }, ORIGINE);

    expect(majChamps).toHaveBeenCalledTimes(1);
    expect(majChamps).toHaveBeenCalledWith({ telephone: '0709201799', avis_actifs: false });
  });

  it('coupe les avis quand le numéro est retiré', async () => {
    await modifierClient(CLIENT, { ...ORIGINE, telephone: '' }, ORIGINE);

    expect(majChamps).toHaveBeenCalledWith({ telephone: null, avis_actifs: false });
  });

  it('ne touche pas aux avis quand seul le nom change', async () => {
    // Punir une correction sans rapport serait un défaut, pas une précaution.
    await modifierClient(CLIENT, { ...ORIGINE, nom: 'GSM Traoré' }, ORIGINE);

    expect(majChamps.mock.calls[0]?.[0]).not.toHaveProperty('avis_actifs');
  });

  it('écrit null et non une chaîne vide quand un champ est vidé', async () => {
    // Le journal d'audit doit lire « le champ était vide », pas « le champ
    // contenait rien ». C'est le geste que `inscrireClient` fait déjà, et la
    // production n'a aucune chaîne vide dans ces colonnes — mesuré le
    // 2026-09-11. Ce formulaire ne doit pas être le premier à en écrire.
    await modifierClient(CLIENT, { ...ORIGINE, marche: '' }, ORIGINE);

    expect(majChamps).toHaveBeenCalledWith({ marche: null });
  });

  it('ignore les espaces autour d’une valeur inchangée', async () => {
    await modifierClient(CLIENT, { ...ORIGINE, nom: '  GSM T  ' }, ORIGINE);

    expect(majChamps).not.toHaveBeenCalled();
  });

  it('écrit la valeur débarrassée de ses espaces', async () => {
    await modifierClient(CLIENT, { ...ORIGINE, nom: '  GSM Traoré  ' }, ORIGINE);

    expect(majChamps).toHaveBeenCalledWith({ nom: 'GSM Traoré' });
  });

  it('refuse un nom vide, avec la phrase de l’inscription', async () => {
    const r = await modifierClient(CLIENT, { ...ORIGINE, nom: '   ' }, ORIGINE);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.echec.code).toBe('NOM_VIDE');
      expect(r.echec.message).toBe('Le nom du client est obligatoire.');
    }
    expect(majChamps).not.toHaveBeenCalled();
  });

  it('rend un échec quand le serveur n’a touché aucune ligne', async () => {
    // Le défaut du 2026-08-24 : PostgREST rend 204 et `error: null` quand RLS
    // ou un privilège de colonne écarte la ligne. Sans ce contrôle, le
    // collecteur croit avoir corrigé un numéro qu'il n'a pas corrigé, et
    // continue d'appeler le mauvais.
    majSelect.mockReset().mockResolvedValue({ data: [], error: null });

    const r = await modifierClient(CLIENT, { ...ORIGINE, nom: 'GSM Traoré' }, ORIGINE);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.echec.code).toBe('RIEN_ECRIT');
  });

  it('traduit un refus de privilège en DROIT_REFUSE', async () => {
    // Un privilège de colonne refusé : `modifierClient` n'envoie que des colonnes
    // accordées, donc ce refus signalerait un défaut de l'application — jamais
    // un abonnement inactif, que `clients_update` ne vérifie pas.
    majSelect.mockReset().mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for table clients' },
    });

    const r = await modifierClient(CLIENT, { ...ORIGINE, nom: 'GSM Traoré' }, ORIGINE);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.echec.code).toBe('DROIT_REFUSE');
  });
});
