import { formatMontant, soldeRestituable } from '@kolek/core';
import { horodatageTampon } from '@kolek/ui';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COLLECTEUR,
  INSTANT,
  carte as carteLocale,
  client,
  operationMise,
  tournee,
} from '../hors-ligne/fabriques';
import type { MiseLocale } from '../hors-ligne/modele';
import { TourneeAbsente } from '../hors-ligne/vues';
import { LIGNES_AFFICHEES_PAR_PAGE } from '../pagination';

/**
 * L'encaissement, en trois temps : choisir la carte, confirmer, encaissé.
 *
 * Ce que ces épreuves gardent du fichier d'avant (2026-08-26) : le serveur
 * **accepte** deux mises le même jour sur la même carte. `mises_avant_insert`
 * refuse un doublon d'identifiant, une carte clôturée, un cycle complet et un
 * montant faux — pas une seconde mise. Après le succès, l'écran ne doit donc
 * plus offrir le geste : le bouton n'est plus rendu du tout.
 *
 * Ce qu'elles ajoutent : le tampon dit où en est la mise, et il ne ment pas.
 * GARDÉE tant qu'elle attend sur le téléphone, ENCAISSÉ une fois partie, rien
 * du tout si le serveur l'a refusée.
 *
 * Et ce que la revue du 2026-10-03 a fait dire à l'écran : « Reçu » ne
 * s'allume qu'une fois la mise partie (l'écran des reçus ne lit que le journal
 * du serveur, il ne connaît pas encore une mise gardée), mais il tient sa place
 * dès la mise gardée, pour que « Client suivant » ne bouge pas sous le pouce au
 * moment de l'envoi ; la ligne d'état prend le focus que le bouton emporte avec
 * lui ; les blocs du geste sont collants, pour rester au-dessus de la barre du
 * bas sur un petit téléphone.
 */

const enregistrerMise = vi.fn();

vi.mock('../ecritures', () => ({
  enregistrerMise: (...args: unknown[]) => enregistrerMise(...args),
}));

// La file du téléphone, réglée par chaque épreuve : elle décide du tampon, et
// des cartes du premier temps.
let etatHorsLigne: Record<string, unknown> = {};
const horsLigne = (reste: Record<string, unknown> = {}) => ({
  operations: [],
  refus: [],
  tournee: null,
  file: null,
  stockage: 'persistant',
  ...reste,
});

vi.mock('../hors-ligne/useHorsLigne', () => ({ useHorsLigne: () => etatHorsLigne }));

const { Encaisser } = await import('./Encaisser');

const CARTE = { carteId: 'k7', clientNom: 'Hj', mise: 1000, misesEncaissees: 17 };
const ECRITE = { ok: true, miseId: 'abcdef1234', operationId: 'op-9' };

beforeEach(() => {
  etatHorsLigne = horsLigne();
});

afterEach(() => {
  cleanup();
  enregistrerMise.mockReset();
  vi.useRealTimers();
});

function ecran(supplement: Record<string, unknown> = {}) {
  return (
    <Encaisser
      collecteurId="col1"
      carte={CARTE}
      onChoisir={vi.fn()}
      onNaviguer={vi.fn()}
      onEncaisse={vi.fn()}
      onRecus={vi.fn()}
      {...supplement}
    />
  );
}

function rendre(supplement: Record<string, unknown> = {}) {
  return render(ecran(supplement));
}

/** Le bouton du geste. Son nom porte le client : la barre du bas a aussi son « Encaisser ». */
function bouton() {
  return screen.getByRole('button', { name: /sur la carte de Hj$/ }) as HTMLButtonElement;
}

/** La ligne d'état, phrase par phrase. */
async function lignesEtat() {
  const etat = await screen.findByRole('status');
  return [...etat.querySelectorAll('p')].map((p) => p.textContent);
}

function tampon() {
  return document.querySelector('[data-tampon]')?.getAttribute('data-tampon') ?? null;
}

/** La mise de `ECRITE`, telle que la tournée la porte une fois partie. */
const PARTIE: MiseLocale = {
  id: 'abcdef1234',
  carteId: 'k7',
  montant: 1000,
  encaisseLe: INSTANT,
  encaissePar: COLLECTEUR,
  estCommission: false,
};

/** L'opération a quitté la file : la mise est dans la tournée relue. */
function mettreEnvoyee() {
  etatHorsLigne = horsLigne({ tournee: tournee({ mises: [PARTIE] }) });
}

/** Les classes d'un bloc collant au-dessus de la barre du bas, chacune une à une. */
const BLOC_COLLANT = ['sticky', 'bottom-nav', 'z-10', 'bg-canvas', 'lg:static'];

describe('temps 1, choisir la carte', () => {
  const TOURNEE = tournee({
    clients: [
      { ...client('c1', 'Mariam Traoré'), marche: 'Adjamé' },
      { ...client('c2', 'Aya Koffi'), marche: 'Treichville', telephone: '07 08 09 10 11' },
      client('c3', 'Rokia Sangaré'),
    ],
    cartes: [
      carteLocale('k2', 'c2', { misesEncaissees: 27 }),
      carteLocale('k1', 'c1', { mise: 2000, misesEncaissees: 29 }),
      carteLocale('k3', 'c3', { misesEncaissees: 31 }),
    ],
  });

  function lignes() {
    return within(screen.getByRole('list', { name: 'Cartes à encaisser' }))
      .getAllByRole('button')
      .map((b) => b.textContent);
  }

  function chercher(terme: string) {
    fireEvent.change(screen.getByRole('textbox', { name: 'Chercher une carte' }), {
      target: { value: terme },
    });
  }

  it('propose les cartes actives, les plus avancées d’abord, sans les pleines', () => {
    etatHorsLigne = horsLigne({ tournee: TOURNEE });
    rendre({ carte: null });

    expect(screen.getByText('Choisis la carte du client.')).toBeTruthy();
    // « En cours », le mot de l'accueil et du segment du retrait : les pleines n'y
    // sont pas, « actives » en dirait trop.
    expect(screen.getByRole('heading', { name: 'Cartes en cours' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Cartes actives' })).toBeNull();
    const l = lignes();
    expect(l).toHaveLength(2);
    expect(l[0]).toMatch(/^Mariam Traoré/);
    expect(l[1]).toMatch(/^Aya Koffi/);
  });

  it('choisit une carte d’un seul geste', () => {
    etatHorsLigne = horsLigne({ tournee: TOURNEE });
    const onChoisir = vi.fn();
    rendre({ carte: null, onChoisir });

    fireEvent.click(screen.getByRole('button', { name: /^Mariam Traoré/ }));

    expect(onChoisir).toHaveBeenCalledWith({
      carteId: 'k1',
      clientNom: 'Mariam Traoré',
      mise: 2000,
      misesEncaissees: 29,
    });
  });

  it('cherche par marché comme par numéro', () => {
    etatHorsLigne = horsLigne({ tournee: TOURNEE });
    rendre({ carte: null });

    chercher('treich');
    expect(lignes()).toHaveLength(1);
    expect(lignes()[0]).toMatch(/^Aya Koffi/);

    chercher('0809');
    expect(lignes()).toHaveLength(1);
    expect(lignes()[0]).toMatch(/^Aya Koffi/);
  });

  it('dit quand la recherche ne trouve rien', () => {
    etatHorsLigne = horsLigne({ tournee: TOURNEE });
    rendre({ carte: null });

    chercher('zzz');

    expect(screen.getByText('Aucune carte ne correspond.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Cartes à encaisser' })).toBeNull();
  });

  it('mène aux clients quand aucune carte n’attend de mise', () => {
    etatHorsLigne = horsLigne({ tournee: tournee() });
    const onNaviguer = vi.fn();
    rendre({ carte: null, onNaviguer });

    expect(screen.getByText('Aucune carte à encaisser')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Voir mes clients' }));
    expect(onNaviguer).toHaveBeenCalledWith('clients');
  });

  it('dit que la tournée manque, plutôt qu’une liste vide', () => {
    etatHorsLigne = horsLigne({ tournee: tournee({ lueLe: null }) });
    rendre({ carte: null });

    expect(screen.getByRole('alert').textContent).toBe(new TourneeAbsente().message);
  });

  it('n’affirme rien tant que la tournée n’est pas lue', () => {
    rendre({ carte: null });

    expect(screen.queryByRole('list', { name: 'Cartes à encaisser' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Aucune carte à encaisser')).toBeNull();
  });

  // Vingt-cinq cartes de 1 à 25 mises : le nombre de mises décide de l'ordre, la
  // plus avancée d'abord, donc « Client 25 » ouvre la liste.
  function vingtCinqCartes() {
    const clients = Array.from({ length: 25 }, (_, i) =>
      client(`c${i + 1}`, `Client ${String(i + 1).padStart(2, '0')}`),
    );
    const cartes = clients.map((c, i) => carteLocale(`k${i + 1}`, c.id, { misesEncaissees: i + 1 }));
    return tournee({ clients, cartes });
  }

  it('découpe la liste comme celle des clients : une page pleine, puis le reste', () => {
    etatHorsLigne = horsLigne({ tournee: vingtCinqCartes() });
    rendre({ carte: null });

    expect(lignes()).toHaveLength(LIGNES_AFFICHEES_PAR_PAGE);
    expect(lignes()[0]).toMatch(/^Client 25/);

    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));

    expect(lignes()).toHaveLength(25 - LIGNES_AFFICHEES_PAR_PAGE);
    expect(lignes()[0]).toMatch(/^Client 05/);
  });

  it('repart de la première page à chaque recherche nouvelle', () => {
    etatHorsLigne = horsLigne({ tournee: vingtCinqCartes() });
    rendre({ carte: null });
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(lignes()).toHaveLength(25 - LIGNES_AFFICHEES_PAR_PAGE);

    // « client » les retient toutes : vingt-cinq résultats, donc encore deux
    // pages. Sans retour à la première, la seconde resterait affichée, avec ses
    // cinq lignes, et le collecteur croirait n'avoir trouvé que cinq clients.
    chercher('client');

    expect(lignes()).toHaveLength(LIGNES_AFFICHEES_PAR_PAGE);
    expect(lignes()[0]).toMatch(/^Client 25/);
  });

  it('garde la mise lisible sous un marché très long : seul le marché se tronque', () => {
    const MARCHE = 'Grand marché de gros de la zone industrielle de Yopougon Sud';
    expect(MARCHE).toHaveLength(60);
    etatHorsLigne = horsLigne({
      tournee: tournee({
        clients: [{ ...client('c1', 'Mariam Traoré'), marche: MARCHE }],
        cartes: [carteLocale('k1', 'c1', { mise: 2000, misesEncaissees: 12 })],
      }),
    });
    rendre({ carte: null });

    const ligne = within(screen.getByRole('list', { name: 'Cartes à encaisser' })).getByRole(
      'button',
    );
    const elements = [...ligne.querySelectorAll('span')];
    const mise = elements.find((e) => e.textContent === formatMontant(2000)) as HTMLElement;
    const marche = elements.find((e) => e.textContent === MARCHE) as HTMLElement;

    // Chacun son élément : la mise ne partage plus la ligne coupée du marché.
    expect(mise, 'la mise a son propre élément').toBeTruthy();
    expect(marche, 'le marché a son propre élément').toBeTruthy();
    expect(mise.classList.contains('font-mono')).toBe(true);
    expect(mise.closest('.shrink-0'), 'la mise ne rétrécit pas').toBeTruthy();
    expect(mise.closest('.truncate'), 'la mise n’est pas dans une ligne tronquée').toBeNull();
    expect(marche.classList.contains('truncate')).toBe(true);
  });
});

describe('temps 2, confirmer', () => {
  it('dit la case, le montant et le solde après, avant le geste', () => {
    rendre();

    expect(screen.getByText(/^Mise du jour, case/).textContent).toBe('Mise du jour, case 18');
    expect(screen.getByText(/^Solde après/).textContent).toBe(
      `Solde après ${formatMontant(soldeRestituable(18, 1000))} FCFA`,
    );
    expect(screen.getByText('Montant fixé à l’ouverture de la carte.')).toBeTruthy();
  });

  it('cercle la prochaine case de la carte', () => {
    rendre();

    expect(document.querySelectorAll('[data-etat]')[17]?.getAttribute('data-etat')).toBe(
      'prochaine',
    );
  });

  it('revient à la liste des cartes, et non aux clients', () => {
    const onChoisir = vi.fn();
    const onNaviguer = vi.fn();
    rendre({ onChoisir, onNaviguer });

    fireEvent.click(screen.getByRole('button', { name: 'Revenir à la liste des cartes' }));

    expect(onChoisir).toHaveBeenCalledWith(null);
    expect(onNaviguer).not.toHaveBeenCalled();
  });

  it('n’arme pas le bouton sur une carte pleine, et dit pourquoi', () => {
    rendre({ carte: { ...CARTE, misesEncaissees: 31 } });

    expect(bouton().disabled).toBe(true);
    const raison = screen.getByText(
      'Le cycle de 31 mises est complet. La carte doit être clôturée.',
    );
    expect(raison).toBeTruthy();
    // Une case 32 n'existe pas : le bloc de caisse ne l'annonce pas.
    expect(screen.queryByText(/^Mise du jour/)).toBeNull();

    // Un bouton éteint ne prend pas le focus et ne dit pas pourquoi : la phrase
    // qui l'explique est déjà là, et le bouton la désigne pour qu'elle soit lue avec lui.
    const id = bouton().getAttribute('aria-describedby');
    expect(id, 'le bouton éteint désigne sa raison').toBeTruthy();
    expect(document.getElementById(id ?? '')).toBe(raison);
  });

  it('ne décrit pas le bouton d’une carte ordinaire : rien ne l’éteint', () => {
    rendre();

    expect(bouton().disabled).toBe(false);
    expect(bouton().hasAttribute('aria-describedby')).toBe(false);
  });

  it('écrit la mise de la carte, à l’heure de l’appui', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());
    await screen.findByRole('status');

    expect(enregistrerMise).toHaveBeenCalledWith('col1', 'k7', 1000, expect.any(Date));
  });

  it('n’écrit qu’une fois sous deux appuis rapprochés', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    const b = bouton();
    fireEvent.click(b);
    fireEvent.click(b);
    await screen.findByRole('status');

    expect(enregistrerMise).toHaveBeenCalledTimes(1);
  });

  it('laisse le bouton armé quand la mise a échoué', async () => {
    enregistrerMise.mockResolvedValue({
      ok: false,
      echec: { code: 'RESEAU', message: 'Le réseau a coupé.' },
    });
    rendre();

    fireEvent.click(bouton());

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Le réseau a coupé.');
    // Rien n'est écrit, donc rien à protéger : le collecteur doit pouvoir
    // réessayer sans quitter l'écran.
    expect(bouton().disabled).toBe(false);
  });

  it('pose le bloc de caisse au-dessus de la barre du bas, collant, sur un petit téléphone', () => {
    // Sur 568 px de haut, le bouton du geste passait à moitié sous la barre. Le
    // bloc rend sa place dans le flux sur bureau (`lg:static`), où il n'y a pas
    // de barre, et reste opaque : le billet défile dessous.
    rendre();

    const bloc = screen.getByRole('region', { name: 'Caisse' });
    for (const classe of BLOC_COLLANT) {
      expect(bloc.classList.contains(classe), classe).toBe(true);
    }
    expect(within(bloc).getByRole('button', { name: /sur la carte de Hj$/ })).toBeTruthy();
  });
});

describe('temps 3, encaissé', () => {
  it('pose le tampon GARDÉE tant que la mise attend sur le téléphone', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());

    expect(await lignesEtat()).toEqual([
      `${formatMontant(1000)} FCFA pour Hj, case 18.`,
      'Gardée sur ce téléphone, elle partira avec le réseau.',
      'Reçu n° ABCDEF12',
    ]);
    expect(tampon()).toBe('Gardée');
  });

  it('pose les chiffres de la première phrase en Plex Mono 500 : la phrase est en semi-gras', async () => {
    // La phrase est en `font-semibold` et seul le 500 de Plex Mono est livré : un
    // span mono sans `font-medium` y demande un 600, que le navigateur fabrique
    // en épaississant le 500 — le faux gras que le Design System proscrit.
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());
    const phrase = (await screen.findByRole('status')).querySelector('p') as HTMLElement;
    const chiffres = [...phrase.querySelectorAll('span.font-mono')];

    expect(phrase.classList.contains('font-semibold'), 'la phrase est en semi-gras').toBe(true);
    expect(chiffres.map((c) => c.textContent)).toEqual([formatMontant(1000), '18']);
    for (const chiffre of chiffres) {
      expect(chiffre.classList.contains('font-medium'), chiffre.textContent ?? '').toBe(true);
    }
  });

  it('remplit la case écrite, et elle seule', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());
    await screen.findByRole('status');

    const etats = [...document.querySelectorAll('[data-etat]')].map((c) =>
      c.getAttribute('data-etat'),
    );
    expect(etats[17]).toBe('neuve');
    expect(etats.filter((e) => e === 'neuve')).toHaveLength(1);
  });

  it('passe à ENCAISSÉ quand la mise est partie', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    const { rerender } = rendre();

    fireEvent.click(bouton());
    await screen.findByRole('status');

    // L'opération a quitté la file ; la mise est dans la tournée relue.
    mettreEnvoyee();
    rerender(ecran());

    expect(tampon()).toBe('Encaissé');
    expect((await lignesEtat())[1]).toBe('Envoyée.');
  });

  it('ne tamponne pas une mise refusée, et ne lui donne pas de reçu', async () => {
    etatHorsLigne = horsLigne({
      operations: [operationMise(9, { carteId: 'k7' }, { etat: 'refusee_a_consigner' })],
    });
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());

    expect(await lignesEtat()).toEqual([
      `${formatMontant(1000)} FCFA pour Hj, case 18.`,
      'Le serveur a refusé cette mise. Le détail est dans les alertes.',
    ]);
    expect(tampon()).toBeNull();
    // La carte est là, mais sa case 18 ne se remplit pas.
    expect(document.querySelectorAll('[data-etat]')).toHaveLength(31);
    expect(document.querySelector('[data-etat="neuve"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reçu' })).toBeNull();
    // Il reste une sortie : sans elle, l'écran se refermerait sur un refus.
    expect(screen.getByRole('button', { name: 'Client suivant' })).toBeTruthy();
  });

  it('ne laisse plus de bouton Encaisser : un second appui écrirait une seconde mise', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());
    await screen.findByRole('status');

    expect(screen.queryByRole('button', { name: /sur la carte de Hj$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Encaisser/ })).toBeNull();
  });

  it('prévient la coquille, puis mène au client suivant ou à ses reçus', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    const onEncaisse = vi.fn();
    const onChoisir = vi.fn();
    const onRecus = vi.fn();
    const { rerender } = rendre({ onEncaisse, onChoisir, onRecus });

    fireEvent.click(bouton());
    await screen.findByRole('status');

    expect(onEncaisse).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Client suivant' }));
    expect(onChoisir).toHaveBeenCalledWith(null);

    // Les reçus ne s'ouvrent qu'une fois la mise partie : voir plus bas.
    mettreEnvoyee();
    rerender(ecran({ onEncaisse, onChoisir, onRecus }));
    fireEvent.click(screen.getByRole('button', { name: 'Reçu' }));
    expect(onRecus).toHaveBeenCalledWith('Hj');
  });

  it('garde la place de « Reçu » tant que la mise attend, éteint : l’écran des reçus ne la connaît pas encore', async () => {
    // `Recus` ne lit que le journal du serveur. Sur une mise gardée il dirait
    // « Cet écran demande le réseau. », ou montrerait une liste sans ce reçu.
    // Le bouton est donc là, mais éteint, et dit pourquoi.
    enregistrerMise.mockResolvedValue(ECRITE);
    const onRecus = vi.fn();
    rendre({ onRecus });

    fireEvent.click(bouton());

    // Le numéro, lui, existe déjà : c'est celui de la mise.
    expect((await lignesEtat())[2]).toBe('Reçu n° ABCDEF12');
    expect(tampon()).toBe('Gardée');
    const recu = screen.getByRole('button', { name: 'Reçu' }) as HTMLButtonElement;
    expect(recu.disabled).toBe(true);
    // Éteint, mais pas muet : la phrase qui dit pourquoi le décrit.
    const phrase = document.getElementById(recu.getAttribute('aria-describedby') ?? '');
    expect(phrase?.textContent).toBe('Gardée sur ce téléphone, elle partira avec le réseau.');
    expect(phrase?.closest('[role="status"]'), 'la phrase est dans la ligne d’état').toBeTruthy();
    // Et il ne mène nulle part.
    fireEvent.click(recu);
    expect(onRecus).not.toHaveBeenCalled();
  });

  it('rallume « Reçu » dès que la mise est partie, à la même place', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    const onRecus = vi.fn();
    const { rerender } = rendre({ onRecus });

    fireEvent.click(bouton());
    await screen.findByRole('status');
    const recuGarde = screen.getByRole('button', { name: 'Reçu' }) as HTMLButtonElement;
    const rangee = recuGarde.parentElement as HTMLElement;
    const rang = [...rangee.children].indexOf(recuGarde);
    expect(recuGarde.disabled).toBe(true);

    mettreEnvoyee();
    rerender(ecran({ onRecus }));

    // Le même bouton, rallumé, au même rang de la même rangée.
    const recu = screen.getByRole('button', { name: 'Reçu' }) as HTMLButtonElement;
    expect(recu).toBe(recuGarde);
    expect(recu.disabled).toBe(false);
    expect([...rangee.children].indexOf(recu)).toBe(rang);
    expect((await lignesEtat())[2]).toBe('Reçu n° ABCDEF12');
    fireEvent.click(recu);
    expect(onRecus).toHaveBeenCalledWith('Hj');
  });

  it('ne déplace rien sous le pouce quand la mise passe de gardée à envoyée', async () => {
    // L'envoi arrive un aller-retour après l'appui, c'est-à-dire quand le pouce
    // vise « Client suivant ». Si « Reçu » n'apparaissait qu'alors, « Client
    // suivant » se rétrécirait d'un tiers, et un appui dans la zone qui bouge
    // ouvrirait les reçus, dont le retour mène à l'accueil et non à la liste.
    enregistrerMise.mockResolvedValue(ECRITE);
    const { rerender } = rendre();

    fireEvent.click(bouton());
    const suivant = await screen.findByRole('button', { name: 'Client suivant' });
    const rangee = suivant.parentElement as HTMLElement;
    const enfants = [...rangee.children];
    const classeAvant = suivant.className;

    mettreEnvoyee();
    rerender(ecran());

    expect(screen.getByRole('button', { name: 'Client suivant' })).toBe(suivant);
    expect(suivant.className, 'les classes de « Client suivant » ne changent pas').toBe(classeAvant);
    const apres = [...rangee.children];
    expect(apres).toHaveLength(enfants.length);
    apres.forEach((enfant, i) => expect(enfant, `l’enfant ${i} est le même nœud`).toBe(enfants[i]));
    // Deux commandes dans la rangée dès la mise gardée : « Client suivant », puis « Reçu ».
    expect(enfants.map((e) => e.textContent)).toEqual(['Client suivant', 'Reçu']);
  });

  it('donne le focus à la ligne d’état : le bouton qui l’avait vient de disparaître', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();
    const b = bouton();
    b.focus();
    expect(document.activeElement).toBe(b);

    fireEvent.click(b);
    const etat = await screen.findByRole('status');

    // Sans ce geste le focus tombe sur <body> : celui qui commande au clavier ou
    // au lecteur d'écran perd sa place, et la ligne d'état, insérée déjà
    // remplie, n'est pas annoncée. `waitFor` : l'effet suit l'insertion.
    await waitFor(() => expect(document.activeElement).toBe(etat));
  });

  it('pose « Client suivant » au-dessus de la barre du bas, avec la ligne d’état qu’il accompagne', async () => {
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());
    const bloc = (await screen.findByRole('status')).parentElement as HTMLElement;

    for (const classe of BLOC_COLLANT) {
      expect(bloc.classList.contains(classe), classe).toBe(true);
    }
    // Son air est dedans (`pt-4`), dans la boîte opaque, et non dehors (`mt-4`) :
    // collé, le bloc coupe le billet net, et la ligne d'état ne doit pas
    // toucher la coupe.
    expect(bloc.classList.contains('pt-4'), 'l’air est dans la boîte').toBe(true);
    expect(bloc.classList.contains('mt-4'), 'et non en marge').toBe(false);
    // Le bloc porte la ligne d'état ET les commandes : elles restent ensemble.
    expect(within(bloc).getByRole('button', { name: 'Client suivant' })).toBeTruthy();
  });

  it('date la mise et le tampon de l’instant de l’appui', async () => {
    // `Date` seul est figé : les minuteurs de Testing Library restent vrais.
    vi.useFakeTimers({ toFake: ['Date'] });
    const instant = new Date(2026, 4, 17, 8, 5, 31);
    vi.setSystemTime(instant);
    enregistrerMise.mockResolvedValue(ECRITE);
    rendre();

    fireEvent.click(bouton());
    await screen.findByRole('status');

    expect(enregistrerMise.mock.calls[0]?.[3]).toEqual(instant);
    expect(document.querySelector('[data-tampon]')?.textContent).toContain(
      horodatageTampon(instant),
    );
  });
});
