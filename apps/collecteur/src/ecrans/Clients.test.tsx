import { formatMontant, MISES_PAR_CYCLE } from '@kolek/core';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * La liste de travail du collecteur, une fois qu'un client peut tenir plusieurs
 * carnets.
 *
 * Elle cesse d'être une liste de personnes pour devenir une liste de cartes. Le
 * geste du métier porte sur une carte — encaisser 5 000 sur celle-ci, pas 1 000
 * sur celle-là — et un écran qui montre les personnes oblige à choisir après
 * avoir touché le bouton, c'est-à-dire l'argent déjà en main.
 */

const from = vi.fn();

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => from(table),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'col1' } } }) },
  },
}));

vi.mock('./FicheClient', () => ({ FicheClient: () => null }));

const { Clients } = await import('./Clients');

const CLIENTS = [
  { id: 'cli1', nom: 'Hj', marche: 'Sokourani', telephone: null, avis_actifs: false },
  // Le numéro de Ka sert la recherche : c'est la seule des trois clefs que le
  // collecteur possède quand il ne se rappelle plus l'orthographe d'un nom.
  // Espacé comme on l'écrit ici, et non collé — c'est la forme réelle.
  { id: 'cli2', nom: 'Ka', marche: null, telephone: '07 08 09 10 11', avis_actifs: false },
  // Accentué, comme la fiche le saisit et comme le clavier du marché ne le
  // tapera pas.
  { id: 'cli3', nom: 'Sy', marche: 'Adjamé', telephone: null, avis_actifs: false },
];

/** Deux cartes actives pour Hj, aucune active pour Ka, une carte pleine pour Sy. */
const CARTES = [
  {
    id: 'k1',
    client_id: 'cli1',
    mise: 5000,
    statut: 'active',
    mises_encaissees: 2,
    ouverte_le: '2026-08-01T08:00:00.000Z',
  },
  {
    id: 'k2',
    client_id: 'cli1',
    mise: 1000,
    statut: 'active',
    mises_encaissees: 17,
    ouverte_le: '2026-07-02T08:00:00.000Z',
  },
  {
    id: 'k3',
    client_id: 'cli2',
    mise: 2000,
    statut: 'cloturee',
    mises_encaissees: 31,
    ouverte_le: '2026-06-03T08:00:00.000Z',
  },
  // Reste `active` à 31/31 : la base ne clôture qu'au retrait. C'est la seule
  // des trois branches du badge de statut qu'aucune carte ci-dessus n'atteint.
  {
    id: 'k4',
    client_id: 'cli3',
    mise: 3000,
    statut: 'active',
    mises_encaissees: MISES_PAR_CYCLE,
    ouverte_le: '2026-05-01T08:00:00.000Z',
  },
];

/**
 * @param total Ce que le serveur dit posséder, toutes lignes confondues. Quand
 *   il dépasse le nombre de lignes rendues, PostgREST a tronqué : c'est le cas
 *   que le dernier bloc de tests mesure. `null` = pas de comptage demandé.
 */
function brancherSupabase(total: number | null = CLIENTS.length) {
  // La chaîne imite celle de l'écran, `range` compris : les deux requêtes sont
  // paginées depuis le 2026-09-09, et un faux qui rendrait tout d'un coup
  // laisserait la pagination sans aucune épreuve ici.
  //
  // `range` découpe vraiment le tableau. Les jeux d'essai tiennent en quelques
  // lignes, donc la première page les rend toutes et le chargement s'arrête —
  // c'est le chemin nominal. Le comportement sur plusieurs pages est éprouvé
  // séparément dans `src/pagination.test.ts`, sans passer par le rendu.
  const page = <T,>(lignes: T[], count: number | null) => ({
    range: (debut: number, fin: number) =>
      Promise.resolve({ data: lignes.slice(debut, fin + 1), error: null, count }),
  });

  from.mockImplementation((table: string) => {
    if (table === 'clients') {
      return {
        select: () => ({ order: () => ({ order: () => page(CLIENTS, total) }) }),
      };
    }
    return { select: () => ({ order: () => page(CARTES, null) }) };
  });
}

function rendre(supplement: Record<string, unknown> = {}) {
  return render(
    <Clients
      collecteurId="col1"
      revision={0}
      ouvrirFormulaire={false}
      onFormulaireVu={vi.fn()}
      ficheAOuvrir={null}
      onFicheVue={vi.fn()}
      onDeconnexion={vi.fn()}
      onEcriture={vi.fn()}
      onRetrait={vi.fn()}
      {...supplement}
    />,
  );
}

afterEach(() => {
  cleanup();
  from.mockReset();
});

describe('liste des clients redevenue liste de personnes', () => {
  it('rend une ligne par client, quel que soit le nombre de carnets', async () => {
    brancherSupabase();
    rendre();

    // Hj tient deux carnets, et n'existe qu'une fois. Signalé le 2026-08-26,
    // capture à l'appui : quatre lignes au même nom, quatre boutons
    // « Encaisser », un seul client. La liste des cartes avait été écrite le 25
    // à 06 h 34, avant que la fiche sache montrer tous les carnets ; le
    // carrousel du 25 au soir a rendu ce choix caduc.
    expect(await screen.findAllByText('Hj')).toHaveLength(1);
  });

  it('dit combien de carnets le client tient, et où en est le plus avancé', async () => {
    brancherSupabase();
    rendre();

    const ligne = (await screen.findByText('Hj')).closest('.bg-surface') as HTMLElement;
    // Le nombre est l'information qui manquait : sans lui, une ligne unique
    // cacherait les carnets au lieu de les résumer.
    expect(ligne.textContent).toMatch(/2 carnets/);
    // Et c'est l'avancement du plus avancé qui compte — k2, 17 mises : celui
    // dont le cycle se termine en premier, donc celui qu'on n'oublie pas.
    expect(ligne.textContent).toMatch(new RegExp(`17/${MISES_PAR_CYCLE}`));
  });

  it('ne propose plus d’encaisser depuis la liste', async () => {
    brancherSupabase();
    rendre();

    await screen.findByText('Hj');
    // Une mise est immuable. Depuis une ligne qui résume plusieurs carnets,
    // aucun bouton ne peut désigner le bon sans que le collecteur l'ait choisi :
    // le choix se fait dans la fiche, devant le carrousel.
    expect(screen.queryByRole('button', { name: 'Encaisser' })).toBeNull();
  });

  it('mène à la fiche, où les carnets se voient', async () => {
    brancherSupabase();
    rendre();

    expect(
      await screen.findByRole('button', { name: 'Ouvrir la fiche de Hj' }),
    ).toBeTruthy();
  });

  it('garde une ligne pour le client sans carte active', async () => {
    brancherSupabase();
    rendre();

    // Ka n'a qu'une carte clôturée. Sans sa ligne, on ne peut plus lui en ouvrir.
    expect(await screen.findByText('Ka')).toBeTruthy();
  });

  it('n’affiche pas les cartes clôturées dans la liste de travail', async () => {
    brancherSupabase();
    rendre();

    // Un client fidèle depuis un an occuperait douze lignes d'historique.
    expect(screen.queryByText(/2 000 FCFA/)).toBeNull();
  });

  it('signale le cycle terminé sans proposer d’encaisser', async () => {
    brancherSupabase();
    rendre();

    await screen.findByText('Sy');
    const ligne = screen.getByText('Sy').closest('.bg-surface') as HTMLElement;

    expect(within(ligne).getByText('Cycle terminé')).toBeTruthy();
    // « Retirer » reste : il porte sur le client, pas sur une carte, et
    // l'écran de retrait montre lui-même les carnets concernés.
    expect(within(ligne).getByRole('button', { name: 'Retirer' })).toBeTruthy();
    expect(within(ligne).queryByRole('button', { name: 'Encaisser' })).toBeNull();
    // « Activer une carte » demande un montant à préremplir, donc une carte
    // précise. Il vit dans la fiche, avec les autres gestes de carnet.
    expect(within(ligne).queryByRole('button', { name: 'Activer une carte' })).toBeNull();
  });

  it('mène au retrait du bon client depuis la carte terminée', async () => {
    const onRetrait = vi.fn();
    brancherSupabase();
    rendre({ onRetrait });

    await screen.findByText('Sy');
    const ligne = screen.getByText('Sy').closest('.bg-surface') as HTMLElement;
    fireEvent.click(within(ligne).getByRole('button', { name: 'Retirer' }));

    // Sans cet identifiant, le collecteur atterrissait sur toutes les cartes de
    // tous ses clients et devait retrouver la ligne à la main — avant un geste
    // qui ne se défait pas, et alors qu'un même client peut en avoir deux.
    expect(onRetrait).toHaveBeenCalledWith({ id: 'cli3', nom: 'Sy' });
  });
});

/**
 * La recherche de client.
 *
 * Elle est le premier geste de la journée : le collecteur arrive devant une
 * personne, pas devant une liste. Tout ce qui suit part de là — ce qu'on tape,
 * ce qu'on touche, et ce que l'écran répond.
 */
describe('recherche de client', () => {
  const chercher = (terme: string) =>
    fireEvent.change(screen.getByLabelText('Rechercher un client'), {
      target: { value: terme },
    });

  it('trouve un client par son numéro de téléphone', async () => {
    brancherSupabase();
    rendre();
    await screen.findByText('Hj');

    chercher('0708');

    // Le nom est ce dont on se souvient le moins bien : il s'écrit de trois
    // façons, il se prononce autrement qu'il ne s'écrit, et deux clients d'un
    // même marché le partagent. Le numéro, lui, est exact — et il est déjà
    // chargé par la requête, ligne 155.
    expect(screen.getByText('Ka')).toBeTruthy();
    expect(screen.queryByText('Hj')).toBeNull();
  });

  it('trouve un client par son marché', async () => {
    brancherSupabase();
    rendre();
    await screen.findByText('Hj');

    chercher('sokou');

    // La tournée s'organise par marché, et le marché est déjà affiché sous le
    // nom. Une clef visible à l'écran qui ne répond pas à la recherche est une
    // clef que le collecteur essaie une fois, puis plus jamais.
    expect(screen.getByText('Hj')).toBeTruthy();
    expect(screen.queryByText('Ka')).toBeNull();
  });

  it('garde l’anneau de focus du système sur le champ', async () => {
    brancherSupabase();
    rendre();
    await screen.findByText('Hj');

    // `base.css` pose `:focus-visible` avec un décalage de 2 px et un halo
    // blanc, et il est importé après Tailwind : à spécificité égale, c'est lui
    // qui gagne. Un `outline-none` sur le champ ne l'éteignait donc pas — il le
    // laissait cerner l'`input` nu, à angles droits, à l'intérieur du cadre
    // arrondi qui portait déjà son propre anneau. C'est le double anneau de la
    // capture du 2026-09-09.
    //
    // La sortie n'est pas d'éteindre l'anneau — `Champ` et `ChampTelephone`
    // tiennent la règle inverse — mais de n'avoir qu'un seul élément à cerner.
    expect(screen.getByLabelText('Rechercher un client').className).not.toContain(
      'outline-none',
    );
  });

  it('donne à la croix d’effacement une cible de 44 px', async () => {
    brancherSupabase();
    rendre();
    await screen.findByText('Hj');
    chercher('ka');

    // 20 px auparavant — moins que le `w-6 h-6` que les référentiels citent
    // déjà comme contre-exemple. Sur un téléphone tenu d'une main, au marché,
    // la croix ratée efface un caractère au lieu du terme.
    const croix = screen.getByRole('button', { name: 'Effacer la recherche' });
    expect(croix.className).toMatch(/\bmin-h-11\b/);
    expect(croix.className).toMatch(/\bmin-w-11\b/);
  });

  it('annonce le nombre de clients trouvés', async () => {
    brancherSupabase();
    rendre();
    await screen.findByText('Hj');

    chercher('ka');

    // Trois lignes qui deviennent une, sans un mot : le collecteur ne sait pas
    // s'il a mal tapé ou si le client n'existe pas. Le compte tranche, et
    // `role="status"` le fait lire à voix haute par le lecteur d'écran.
    expect(screen.getByRole('status').textContent).toMatch(/1 client trouvé/);
  });

  it('n’écrit rien tant qu’on n’a pas cherché, mais la région existe déjà', async () => {
    brancherSupabase();
    rendre();
    await screen.findByText('Hj');

    // Deux exigences qui tirent en sens inverse, et il faut les deux.
    //
    // À l'œil : rien. Un compteur permanent est un compteur qu'on cesse de
    // lire, et les trois KPI du haut disent déjà combien de clients il y a.
    //
    // Pour le lecteur d'écran : la région doit **déjà être là**. Une région
    // live insérée dans le document en même temps que son texte n'est
    // généralement pas annoncée — les lecteurs annoncent les *changements* à
    // l'intérieur d'une région qu'ils observent déjà. Monter le `<p>` au
    // moment où il a quelque chose à dire, c'est donc écrire un `role="status"`
    // qui ne dit jamais rien. C'était le cas jusqu'au 2026-09-09.
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');
  });

  it('ne dit pas « aucun » quand c’est le filtre qui cache le client', async () => {
    brancherSupabase();
    rendre();
    await screen.findByText('Hj');

    // Ka n'a aucune carte active : le filtre « Avec carte » l'écarte. Mais la
    // recherche, elle, l'a bien trouvé.
    fireEvent.click(screen.getByRole('button', { name: 'Avec carte' }));
    chercher('ka');

    // « Aucun client trouvé » serait un mensonge aux conséquences chères : le
    // collecteur conclut que le client n'existe pas et le réinscrit. Deux
    // clients, deux carnets, et un solde restituable qui se calcule sur le
    // mauvais.
    const annonce = screen.getByRole('status').textContent ?? '';
    expect(annonce).not.toMatch(/^Aucun client trouvé$/);
    expect(annonce).toMatch(/filtre/i);
  });

  it('trouve « Adjamé » quand on tape « adjame »', async () => {
    brancherSupabase();
    rendre();
    await screen.findByText('Hj');

    chercher('adjame');

    // Personne ne compose un accent sur un clavier de téléphone au marché, et
    // le nom du marché est saisi avec dans la fiche. Sans repli sur les
    // caractères nus, la clef que l'invite du champ propose ne répond pas.
    expect(screen.getByText('Sy')).toBeTruthy();
    expect(screen.queryByText('Hj')).toBeNull();
  });

  it('trouve un numéro écrit avec des espaces', async () => {
    brancherSupabase();
    rendre();
    await screen.findByText('Hj');

    chercher('0708');

    // Le numéro est stocké « 07 08 09 10 11 » — c'est ainsi qu'on l'écrit ici.
    // Le collecteur, lui, tape des chiffres à la suite. Comparer les deux
    // chaînes telles quelles ne rapproche jamais rien.
    expect(screen.getByText('Ka')).toBeTruthy();
    expect(screen.queryByText('Hj')).toBeNull();
  });

  it('efface la recherche à la touche Échap', async () => {
    brancherSupabase();
    rendre();
    await screen.findByText('Hj');
    chercher('ka');
    expect(screen.queryByText('Hj')).toBeNull();

    fireEvent.keyDown(screen.getByLabelText('Rechercher un client'), { key: 'Escape' });

    // Le geste attendu partout, et le seul qui n'oblige pas à viser la croix.
    expect(screen.getByText('Hj')).toBeTruthy();
  });

  it('n’ouvre pas la croix native du navigateur en plus de la sienne', async () => {
    brancherSupabase();
    rendre();
    await screen.findByText('Hj');

    // `type="search"` fait dessiner à WebKit son propre bouton d'effacement.
    // Sur iPhone — la cible de cette application installée — le collecteur en
    // voyait deux, dont un qu'aucun de nos tests ne touche.
    expect(screen.getByLabelText('Rechercher un client').getAttribute('type')).toBe('text');
  });

  it('n’ouvre ni majuscule ni correcteur sur le clavier', async () => {
    brancherSupabase();
    rendre();
    await screen.findByText('Hj');

    // Le correcteur d'iOS transforme un nom ivoirien en mot français au
    // deuxième caractère, et la majuscule automatique casse la recherche par
    // numéro. Les deux se désarment par attribut, pas par habitude.
    const champ = screen.getByLabelText('Rechercher un client');
    expect(champ.getAttribute('autoCapitalize') ?? champ.getAttribute('autocapitalize')).toBe(
      'none',
    );
    expect(champ.getAttribute('autoCorrect') ?? champ.getAttribute('autocorrect')).toBe('off');
  });
});

/**
 * La liste tronquee, et pourquoi elle doit le dire.
 *
 * `supabase/config.toml` pose `max_rows = 1000` : PostgREST rend au plus mille
 * lignes, sans erreur et sans en-tete d'avertissement. Au-dela, l'ecran affiche
 * une liste incomplete qui a exactement l'air d'une liste complete.
 *
 * Le cout n'est pas theorique, et il se cumule avec le defaut que la revue du
 * 2026-09-09 a deja releve sur le compteur : le collecteur cherche un client,
 * ne le trouve pas, en conclut qu'il n'est pas inscrit, et le reinscrit. Deux
 * clients pour une personne, deux carnets, et un solde restituable calcule sur
 * le mauvais. La recherche est locale — elle ne va pas chercher les lignes que
 * le serveur n'a pas envoyees, donc elle ne peut pas rattraper la troncature.
 *
 * Ce que ces tests exigent n'est pas la pagination : c'est que l'ecran cesse de
 * mentir par omission. Un defaut visible se corrige ; un defaut silencieux se
 * paie.
 */
describe('liste tronquee par le serveur', () => {
  it('previent quand le serveur en a plus qu’il n’en a rendu', async () => {
    brancherSupabase(1200);
    rendre();
    await screen.findByText('Hj');

    const alerte = screen.getByRole('alert');
    expect(alerte.textContent).toContain(formatMontant(1200));
    expect(alerte.textContent).toMatch(/recherche/i);
  });

  it('ne previent pas quand la liste est entiere', async () => {
    brancherSupabase(CLIENTS.length);
    rendre();
    await screen.findByText('Hj');

    // Un avertissement permanent est un avertissement qu'on cesse de lire.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ne previent pas quand le serveur ne compte pas', async () => {
    // `count` vaut `null` si le comptage n'a pas ete demande ou a echoue.
    // Deduire une troncature d'une absence de reponse ferait crier l'ecran sur
    // toutes les listes, et le collecteur apprendrait a ignorer le bandeau.
    brancherSupabase(null);
    rendre();
    await screen.findByText('Hj');

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
