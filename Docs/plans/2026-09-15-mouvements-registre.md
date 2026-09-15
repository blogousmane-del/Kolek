# Le registre des mouvements — plan d'exécution

> **Pour les exécutants :** SOUS-COMPÉTENCE REQUISE : utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans, tâche par tâche. Les étapes sont des cases à cocher (`- [ ]`).

**But :** faire de la vue `mouvements` la seule surface de lecture de l'argent, sans changer un seul chiffre visible.

**Architecture :** une vue SQL signée (mise `+`, retrait `−`, rattrapage `+`), une table `rattrapages` créée vide pour le jeu d'essai piégé, et la reprise de chaque lecteur d'argent — quatre fonctions de base, quatre lectures en ligne du collecteur, trois calculs du téléphone. Le téléphone garde ses lignes brutes et applique la même règle par une fonction partagée de `packages/core`, dont une épreuve de parité compare la sortie à celle de la vue.

**Pile :** PostgreSQL 17 (Supabase), PostgREST (`max_rows = 1000`), TypeScript, React 19, Vitest 4, npm workspaces.

**Spec :** `Docs/specs/2026-09-15-mouvements-registre-design.md`. Branche : `mouvements-registre`.

## Contraintes globales

- **Aucun chiffre visible ne change.** Les épreuves existantes restent vertes **sans qu'un seul chiffre attendu change**. Une épreuve qui demanderait de changer un nombre pour passer est un défaut à présenter à l'exploitant, jamais une correction silencieuse.
- **Aucune ligne de `mises`, `retraits`, `caisses_jour` ou `synchro_rejets` n'est modifiée, déplacée ou recopiée.** Les migrations n'ajoutent que des objets et ne remplacent que des fonctions de lecture, aux résultats identiques.
- **La base IndexedDB des téléphones n'est pas touchée** : aucun format, aucune version.
- **Aucune Edge Function modifiée.** `git diff --stat main...HEAD -- supabase/functions` doit rester vide.
- **Les gestes de production sont hors de ce plan** sauf la tâche 10, et chacun demande un accord explicite de l'exploitant : `supabase db push`, `git push`. Jamais `supabase db reset --linked`. Les lectures en production sont des `SELECT` seuls, qui ne rendent que des comptes, des sommes et des empreintes md5 — jamais un nom, jamais un numéro de téléphone.
- **`supabase db reset` et `migration up` portent toujours `--local` écrit en toutes lettres** dans ce plan : la même commande avec `--linked` vise la production.
- **Montants :** un montant est toujours positif dans la vue ; `sens` vaut `1` (entrée) ou `-1` (sortie). Une somme d'argent tenu est `sum(sens * montant)`. Une somme d'encaissements est `sum(montant) filter (where sens = 1)`.
- **La commission reste une mise** (`est_commission`), et une sortie de caisse vaut `montant_restitue`, jamais `montant_restitue + commission`.
- **Les restitutions se comptent sur `nature = 'retrait'`**, pas sur `sens = -1` : le règlement d'un rattrapage, au chantier suivant, sera une sortie qui n'est pas une restitution de carte.
- **Un rattrapage compte comme un versement** partout où l'on compte des versements (`nombreMises`, `mises`, la date du dernier versement).
- **Le client se lit par la carte**, pour les trois natures.
- **Fins de ligne :** `core.autocrlf=true` normalise à l'ajout ; `git diff` fait foi. `apps/collecteur/src/lectures-ecrans.test.ts` porte **une** espace insécable : la recompter par Node après modification (`split(String.fromCharCode(160)).length - 1`).
- **Commits :** sujet sans accents, corps accentué, et la ligne d'attribution `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Épreuves :** `npm run test -w @kolek/core`, `npm run test -w @kolek/collecteur`, `npm run test:db` (pile locale), `npm run verifier:lint`, `npx tsc -b apps/collecteur`.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `packages/core/src/mouvements.ts` (créer) | La règle du registre, en TypeScript pur : `mouvementsDepuis`, `versementsDe`, `argentTenu`. |
| `packages/core/src/mouvements.test.ts` (créer) | Ses épreuves. |
| `supabase/migrations/20260915100000_mouvements_registre.sql` (créer) | Table `rattrapages`, vue `mouvements`, droits, garde-fous. |
| `supabase/migrations/20260915110000_caisse_suit_les_rattrapages.sql` (créer) | `cash_attendu_du_jour` sur la vue, déclencheur de caisse des rattrapages. |
| `supabase/migrations/20260915120000_lecteurs_admin_mouvements.sql` (créer) | `admin_vue_globale`, `admin_tendances`, `equipe_vue` sur la vue. |
| `supabase/migrations/20260915130000_lecteurs_directs_argent.sql` (créer) | `lecteurs_directs_argent()`, l'inspection du catalogue. |
| `supabase/tests/jeu-piege.ts` (créer) | Le jeu d'essai piégé de la spec J1 §4.5, partagé par les épreuves. |
| `supabase/tests/mouvements.test.ts` (créer) | Vue : contenu, isolation, immutabilité, parité avec `packages/core`. |
| `supabase/tests/caisse-rattrapage.test.ts` (créer) | La caisse suit un rattrapage, à la bonne main et au bon jour. |
| `supabase/tests/lecteurs-admin-piege.test.ts` (créer) | Vue globale, tendances, équipe sur le jeu piégé. |
| `supabase/tests/lectures-collecteur-piege.test.ts` (créer) | Bilan, reçus, historique, alertes sur le jeu piégé, contre la vraie base. |
| `supabase/tests/lecteurs-argent.test.ts` (créer) | Le garde-fou : catalogue SQL et sources. |
| `apps/collecteur/src/lectures-ecrans.ts` (modifier) | Les quatre lectures en ligne passent par la vue. |
| `apps/collecteur/src/hors-ligne/vues.ts` (modifier) | Les trois calculs du téléphone passent par `mouvementsDepuis`. |
| `apps/admin/src/donnees.ts` (modifier) | Le type d'un mouvement accepte `rattrapage`. |
| `supabase/releves/mouvements-avant-apres.sql` (créer) | Le relevé comparable avant et après. |
| `supabase/releves/mouvements-apres.sql` (créer) | La vue rend-elle, ligne à ligne, ce que portent les tables. |
| `supabase/retour/mouvements-registre.sql` (créer) | Les définitions d'avant, mot pour mot, pour le retour arrière. |

---

## Tâche 1 : la règle du registre, en TypeScript

**Fichiers :**
- Créer : `packages/core/src/mouvements.ts`
- Créer : `packages/core/src/mouvements.test.ts`
- Modifier : `packages/core/src/index.ts`

**Interfaces :**
- Consomme : rien.
- Produit : `type NatureMouvement = 'mise' | 'retrait' | 'rattrapage'` ; `interface LigneMouvement { id: string; nature: NatureMouvement; sens: 1 | -1; montant: number; mainId: string; carteId: string; survenuLe: string; estCommission: boolean }` ; `interface SourcesMouvements` ; `mouvementsDepuis(sources: SourcesMouvements): LigneMouvement[]` ; `versementsDe(mouvements: readonly LigneMouvement[]): LigneMouvement[]` ; `argentTenu(mouvements: readonly LigneMouvement[]): number`.

- [ ] **Étape 1 : écrire l'épreuve**

Créer `packages/core/src/mouvements.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { argentTenu, mouvementsDepuis, versementsDe } from './mouvements';

const MISE = {
  id: 'm1',
  carteId: 'k1',
  montant: 1000,
  encaissePar: 'col',
  encaisseLe: '2026-09-12T08:00:00.000Z',
  estCommission: true,
};
const RETRAIT = {
  id: 'r1',
  carteId: 'k1',
  montantRestitue: 29_000,
  restituePar: 'patron',
  effectueLe: '2026-09-12T20:00:00.000Z',
};
const RATTRAPAGE = {
  id: 't1',
  carteId: 'k1',
  montant: 1000,
  mainId: 'col',
  encaisseLe: '2026-09-12T19:00:00.000Z',
};

const vide = { mises: [], retraits: [], rattrapages: [] };

describe('mouvementsDepuis', () => {
  it('rend une mise en entrée, tenue par la main qui a encaissé', () => {
    expect(mouvementsDepuis({ ...vide, mises: [MISE] })).toEqual([
      {
        id: 'm1',
        nature: 'mise',
        sens: 1,
        montant: 1000,
        mainId: 'col',
        carteId: 'k1',
        survenuLe: '2026-09-12T08:00:00.000Z',
        estCommission: true,
      },
    ]);
  });

  it('rend un retrait en sortie du montant rendu, jamais de la commission', () => {
    expect(mouvementsDepuis({ ...vide, retraits: [RETRAIT] })).toEqual([
      {
        id: 'r1',
        nature: 'retrait',
        sens: -1,
        montant: 29_000,
        mainId: 'patron',
        carteId: 'k1',
        survenuLe: '2026-09-12T20:00:00.000Z',
        estCommission: false,
      },
    ]);
  });

  it('rend un rattrapage en entrée, qui n’est jamais une commission', () => {
    expect(mouvementsDepuis({ ...vide, rattrapages: [RATTRAPAGE] })).toEqual([
      {
        id: 't1',
        nature: 'rattrapage',
        sens: 1,
        montant: 1000,
        mainId: 'col',
        carteId: 'k1',
        survenuLe: '2026-09-12T19:00:00.000Z',
        estCommission: false,
      },
    ]);
  });

  it('ne recopie que les huit champs du registre', () => {
    // Les sources en portent d'autres — le compteur d'une carte, un nom. Les
    // laisser passer ferait diverger la forme du téléphone de celle de la vue,
    // et l'épreuve de parité de `supabase/tests/mouvements.test.ts` avec elle.
    const [ligne] = mouvementsDepuis({ ...vide, mises: [{ ...MISE, nom: 'Aya' }] });

    expect(Object.keys(ligne!).sort()).toEqual([
      'carteId',
      'estCommission',
      'id',
      'mainId',
      'montant',
      'nature',
      'sens',
      'survenuLe',
    ]);
  });
});

describe('versementsDe', () => {
  it('garde les mises et les rattrapages, écarte les retraits', () => {
    const tout = mouvementsDepuis({ mises: [MISE], retraits: [RETRAIT], rattrapages: [RATTRAPAGE] });

    expect(versementsDe(tout).map((m) => m.id)).toEqual(['m1', 't1']);
  });
});

describe('argentTenu', () => {
  it('ajoute les entrées et retire les sorties', () => {
    // Le jeu piégé de la spec J1 §4.5 : 30 mises de 1 000 au serveur, un
    // rattrapage de 1 000, 29 000 rendus. Il reste 2 000 dans la sacoche.
    const mises = Array.from({ length: 30 }, (_, i) => ({ ...MISE, id: `m${i}`, estCommission: i === 0 }));

    expect(argentTenu(mouvementsDepuis({ mises, retraits: [RETRAIT], rattrapages: [RATTRAPAGE] }))).toBe(2000);
  });

  it('rend zéro sur un registre vide', () => {
    expect(argentTenu([])).toBe(0);
  });
});
```

- [ ] **Étape 2 : lancer l'épreuve et la voir rouge**

Run : `npm run test -w @kolek/core -- src/mouvements.test.ts`
Attendu : ÉCHEC — `Failed to resolve import "./mouvements"`.

- [ ] **Étape 3 : écrire le module**

Créer `packages/core/src/mouvements.ts` :

```ts
/**
 * Le registre des mouvements d'argent, calculé sur des lignes brutes.
 *
 * ## Pourquoi ce module existe
 *
 * Depuis le chantier du 2026-09-15, l'argent ne se lit plus dans `mises` ni
 * dans `retraits` : il se lit dans la vue `public.mouvements`, qui réunit les
 * mises, les retraits et les rattrapages — ces mises qu'un collecteur a
 * encaissées et que le serveur a refusées. Un bilan écrit sur `mises` seule
 * perdrait exactement l'argent que le rattrapage sert à ne pas perdre.
 *
 * Le téléphone, lui, garde ses lignes brutes : sa tournée est une copie de
 * tables, pas de vue. Cette fonction lui donne la **même règle**, et
 * `supabase/tests/mouvements.test.ts` compare les deux sorties sur la vraie
 * base : si l'une bouge sans l'autre, l'épreuve tombe.
 *
 * ## Les trois règles, les mêmes que celles de la vue
 *
 * 1. Le montant est toujours **positif** ; `sens` dit la direction. L'argent
 *    tenu est `sum(sens * montant)`, les encaissements `sens = 1`.
 * 2. La commission reste une mise. Une sortie vaut le montant **restitué**,
 *    jamais restitué + commission : la commission reste chez le collecteur, et
 *    elle est déjà comptée du côté des mises.
 * 3. `mainId` est la main qui a tenu l'argent — `encaisse_par`, `restitue_par`
 *    ou `main_id` — et non le propriétaire de la carte. C'est elle qui range
 *    l'argent dans une sacoche, donc dans une caisse du jour.
 */

export type NatureMouvement = 'mise' | 'retrait' | 'rattrapage';

export interface LigneMouvement {
  id: string;
  nature: NatureMouvement;
  /** `1` : l'argent entre dans la main. `-1` : il en sort. */
  sens: 1 | -1;
  /** Toujours positif. */
  montant: number;
  /** Qui a tenu l'argent, jamais le propriétaire de la carte. */
  mainId: string;
  carteId: string;
  /** ISO 8601, tel que la source l'a écrit. */
  survenuLe: string;
  estCommission: boolean;
}

export interface SourcesMouvements {
  mises: ReadonlyArray<{
    id: string;
    carteId: string;
    montant: number;
    encaissePar: string;
    encaisseLe: string;
    estCommission: boolean;
  }>;
  retraits: ReadonlyArray<{
    id: string;
    carteId: string;
    montantRestitue: number;
    restituePar: string;
    effectueLe: string;
  }>;
  rattrapages: ReadonlyArray<{
    id: string;
    carteId: string;
    montant: number;
    mainId: string;
    encaisseLe: string;
  }>;
}

export function mouvementsDepuis(sources: SourcesMouvements): LigneMouvement[] {
  return [
    ...sources.mises.map((m) => ({
      id: m.id,
      nature: 'mise' as const,
      sens: 1 as const,
      montant: m.montant,
      mainId: m.encaissePar,
      carteId: m.carteId,
      survenuLe: m.encaisseLe,
      estCommission: m.estCommission,
    })),
    ...sources.retraits.map((r) => ({
      id: r.id,
      nature: 'retrait' as const,
      sens: -1 as const,
      montant: r.montantRestitue,
      mainId: r.restituePar,
      carteId: r.carteId,
      survenuLe: r.effectueLe,
      estCommission: false,
    })),
    ...sources.rattrapages.map((t) => ({
      id: t.id,
      nature: 'rattrapage' as const,
      sens: 1 as const,
      montant: t.montant,
      mainId: t.mainId,
      carteId: t.carteId,
      survenuLe: t.encaisseLe,
      estCommission: false,
    })),
  ];
}

/** Ce qui est entré : les mises et les rattrapages. */
export function versementsDe(mouvements: readonly LigneMouvement[]): LigneMouvement[] {
  return mouvements.filter((m) => m.sens === 1);
}

/** L'argent tenu : les entrées moins les sorties. */
export function argentTenu(mouvements: readonly LigneMouvement[]): number {
  return mouvements.reduce((somme, m) => somme + m.sens * m.montant, 0);
}
```

- [ ] **Étape 4 : exporter le module**

Dans `packages/core/src/index.ts`, ajouter la ligne `export * from './mouvements';` **après** `export * from './format';` :

```ts
export * from './types';
export * from './calcul';
export * from './format';
export * from './mouvements';
export * from './paliers';
export * from './tokens';
export * from './sante';
export * from './tendances';
```

- [ ] **Étape 5 : lancer l'épreuve et la voir verte**

Run : `npm run test -w @kolek/core`
Attendu : tous verts, dont les 7 nouveaux.

- [ ] **Étape 6 : typer et commiter**

```bash
npm run typecheck -w @kolek/core
npm run verifier:lint
git add packages/core/src/mouvements.ts packages/core/src/mouvements.test.ts packages/core/src/index.ts
git commit -m "feat(core): la regle du registre des mouvements, partagee par le telephone" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 2 : la table des rattrapages et la vue `mouvements`

**Fichiers :**
- Créer : `supabase/migrations/20260915100000_mouvements_registre.sql`
- Créer : `supabase/tests/jeu-piege.ts`
- Créer : `supabase/tests/mouvements.test.ts`

**Interfaces :**
- Consomme : `mouvementsDepuis` de `packages/core/src/mouvements.ts` (tâche 1).
- Produit : la vue `public.mouvements (id, nature, sens, montant, collecteur_id, main_id, carte_id, client_id, survenu_le, est_commission)` ; la table `public.rattrapages (id, collecteur_id, main_id, carte_id, rejet_id, montant, encaisse_le, cree_le)` ; et le module de jeu d'essai `supabase/tests/jeu-piege.ts`, qui exporte `MISE_PIEGE = 1000`, `MISES_AU_SERVEUR = 30`, `ATTENDU_PIEGE`, `jourUtc(recul)`, `poserCartePiegee(c, recul?)`, `poserRefus(c, cible)`, `poserRattrapage(c, cible, options?)`, `poserJeuPiege(c, recul?)`, le type `JeuPiege`.

- [ ] **Étape 1 : écrire le jeu d'essai piégé**

Créer `supabase/tests/jeu-piege.ts` :

```ts
import { admin, type CollecteurTest } from './harnais';

/**
 * Le jeu d'essai piégé du registre des mouvements.
 *
 * C'est le scénario de la spec J1 §4.5, posé en base : une carte à 1 000 FCFA
 * la mise, **trente** mises arrivées au serveur, clôturée — 29 000 rendus,
 * 1 000 de commission — plus **un rattrapage de 1 000**, la trente-et-unième
 * mise, encaissée pour de vrai et refusée par le serveur.
 *
 * Tout lecteur d'argent doit donc annoncer **31 000 encaissés** et **1 000 dus
 * au client**. Un lecteur resté sur `mises` seule annonce 30 000 et 0 : son
 * épreuve devient rouge en développement, au lieu de mentir en production.
 *
 * Le montant rendu, lui, reste **29 000** : le solde d'une carte close se
 * calcule par compteur × mise, et le rattrapage ne le change pas.
 */
export const MISE_PIEGE = 1000;
export const MISES_AU_SERVEUR = 30;

/** Ce que tout lecteur doit rendre sur ce jeu. */
export const ATTENDU_PIEGE = {
  encaisse: 31_000,
  commissions: 1_000,
  restitue: 29_000,
  versements: 31,
  duAuClient: 1_000,
  /** Les entrées du jour moins les sorties du jour : 30 000 + 1 000 − 29 000. */
  caisseDuJour: 2_000,
} as const;

export interface CartePiegee {
  clientId: string;
  carteId: string;
  rejetId: string;
  /** Le jour UTC où tout s'est passé, `AAAA-MM-JJ`. */
  jour: string;
}

export interface JeuPiege extends CartePiegee {
  rattrapageId: string;
}

/** Le jour UTC d'il y a `recul` jours. */
export function jourUtc(recul: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - recul);
  return d.toISOString().slice(0, 10);
}

function exiger(etiquette: string, erreur: { message: string } | null): void {
  if (erreur) throw new Error(`Jeu piégé « ${etiquette} » : ${erreur.message}`);
}

/** Un refus de synchro consigné, celui dont naîtra le rattrapage. */
export async function poserRefus(
  c: CollecteurTest,
  cible: { carteId: string; jour: string },
): Promise<string> {
  const id = crypto.randomUUID();
  exiger(
    'refus',
    (
      await admin.from('synchro_rejets').insert({
        id,
        collecteur_id: c.id,
        motif: 'CARTE_CLOTUREE',
        charge_utile: {
          type: 'mise',
          carteId: cible.carteId,
          montant: MISE_PIEGE,
          encaisseLe: `${cible.jour}T19:00:00Z`,
        },
      })
    ).error,
  );
  return id;
}

/**
 * La carte du scénario : trente mises, la clôture, et le refus de la
 * trente-et-unième. Tout est daté du même jour UTC, `recul` jours en arrière.
 *
 * Les mises une par une, jamais en lot : les déclencheurs `AFTER` sont différés
 * en fin d'instruction, donc un lot verrait toutes les mises avec le même
 * compteur et les marquerait toutes commission.
 */
export async function poserCartePiegee(c: CollecteurTest, recul = 3): Promise<CartePiegee> {
  const jour = jourUtc(recul);
  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();

  exiger(
    'client',
    (await admin.from('clients').insert({ id: clientId, collecteur_id: c.id, nom: 'Cliente piégée' }))
      .error,
  );
  exiger(
    'carte',
    (
      await admin
        .from('cartes')
        .insert({ id: carteId, collecteur_id: c.id, client_id: clientId, mise: MISE_PIEGE })
    ).error,
  );

  for (let i = 0; i < MISES_AU_SERVEUR; i += 1) {
    exiger(
      `mise ${i}`,
      (
        await admin.from('mises').insert({
          id: crypto.randomUUID(),
          collecteur_id: c.id,
          carte_id: carteId,
          montant: MISE_PIEGE,
          encaisse_le: `${jour}T08:${String(i).padStart(2, '0')}:00Z`,
        })
      ).error,
    );
  }

  // Par `admin` : aucune politique n'autorise `authenticated` à écrire dans
  // `retraits`. (30 − 1) × 1 000 — la première mise est la commission.
  exiger(
    'retrait',
    (
      await admin.from('retraits').insert({
        collecteur_id: c.id,
        carte_id: carteId,
        montant_restitue: (MISES_AU_SERVEUR - 1) * MISE_PIEGE,
        commission: MISE_PIEGE,
        effectue_le: `${jour}T20:00:00Z`,
      })
    ).error,
  );
  exiger(
    'clôture',
    (
      await admin
        .from('cartes')
        .update({ statut: 'cloturee', cloturee_le: `${jour}T20:00:00Z` })
        .eq('id', carteId)
    ).error,
  );

  return { clientId, carteId, rejetId: await poserRefus(c, { carteId, jour }), jour };
}

/**
 * Le rattrapage : la mise refusée, enregistrée comme dette.
 *
 * `mainId` par défaut le propriétaire ; `encaisseLe` par défaut l'heure de la
 * mise refusée, jamais celle de la saisie — c'est le jour d'origine qu'il faut
 * réparer.
 */
export async function poserRattrapage(
  c: CollecteurTest,
  cible: CartePiegee,
  options: { mainId?: string; encaisseLe?: string } = {},
): Promise<string> {
  const id = crypto.randomUUID();
  exiger(
    'rattrapage',
    (
      await admin.from('rattrapages').insert({
        id,
        collecteur_id: c.id,
        main_id: options.mainId ?? c.id,
        carte_id: cible.carteId,
        rejet_id: cible.rejetId,
        montant: MISE_PIEGE,
        encaisse_le: options.encaisseLe ?? `${cible.jour}T19:00:00Z`,
      })
    ).error,
  );
  return id;
}

export async function poserJeuPiege(c: CollecteurTest, recul = 3): Promise<JeuPiege> {
  const carte = await poserCartePiegee(c, recul);
  return { ...carte, rattrapageId: await poserRattrapage(c, carte) };
}
```

- [ ] **Étape 2 : écrire l'épreuve de la vue**

Créer `supabase/tests/mouvements.test.ts` :

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { mouvementsDepuis } from '../../packages/core/src/mouvements';
import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';
import { MISE_PIEGE, poserCartePiegee, poserJeuPiege, poserRattrapage, type JeuPiege } from './jeu-piege';

/**
 * La vue `mouvements` : ce qu'elle rend, à qui, et ce qu'elle refuse.
 *
 * Le point qui décide de tout est `security_invoker = true`. Sans lui, une vue
 * PostgreSQL s'exécute avec les droits de son propriétaire et **contourne les
 * politiques RLS des tables sous-jacentes** : elle exposerait à chaque
 * collecteur l'argent de tous les autres. L'épreuve d'isolation plus bas est le
 * contrôle de cette ligne, et elle n'est pas optionnelle.
 */

afterAll(nettoyer);

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

const COLONNES = 'id, nature, sens, montant, main_id, carte_id, survenu_le, est_commission';

interface LigneVue {
  id: string;
  nature: string;
  sens: number;
  montant: number;
  main_id: string;
  carte_id: string;
  survenu_le: string;
  est_commission: boolean;
}

const parId = <T extends { id: string }>(lignes: readonly T[]): T[] =>
  [...lignes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

let a: CollecteurTest;
let b: CollecteurTest;
let jeuA: JeuPiege;
let jeuB: JeuPiege;

beforeAll(async () => {
  a = await creerCollecteur('Registre A', telephone());
  b = await creerCollecteur('Registre B', telephone());
  jeuA = await poserJeuPiege(a);
  jeuB = await poserJeuPiege(b);
});

describe('ce que la vue rend', () => {
  it('réunit les trois natures du jeu piégé', async () => {
    const { data, error } = await a.client.from('mouvements').select(COLONNES);
    expect(error).toBeNull();
    const lignes = (data ?? []) as LigneVue[];

    expect(lignes.filter((l) => l.nature === 'mise')).toHaveLength(30);
    expect(lignes.filter((l) => l.nature === 'retrait')).toEqual([
      expect.objectContaining({ sens: -1, montant: 29_000, est_commission: false }),
    ]);
    expect(lignes.filter((l) => l.nature === 'rattrapage')).toEqual([
      expect.objectContaining({
        id: jeuA.rattrapageId,
        sens: 1,
        montant: MISE_PIEGE,
        main_id: a.id,
        est_commission: false,
      }),
    ]);
  });

  it('compte 31 000 encaissés, et 2 000 encore en main', async () => {
    const { data } = await a.client.from('mouvements').select('sens, montant');
    const lignes = (data ?? []) as Array<{ sens: number; montant: number }>;

    expect(lignes.filter((l) => l.sens === 1).reduce((s, l) => s + l.montant, 0)).toBe(31_000);
    expect(lignes.reduce((s, l) => s + l.sens * l.montant, 0)).toBe(2_000);
  });

  it('porte le client de la carte, pour les trois natures', async () => {
    const { data } = await a.client.from('mouvements').select('nature, client_id, collecteur_id');

    for (const ligne of (data ?? []) as Array<{ client_id: string; collecteur_id: string }>) {
      expect(ligne.client_id).toBe(jeuA.clientId);
      expect(ligne.collecteur_id).toBe(a.id);
    }
  });

  it('rend exactement les lignes que le téléphone calcule', async () => {
    const [vue, mises, retraits, rattrapages] = await Promise.all([
      a.client.from('mouvements').select(COLONNES),
      admin
        .from('mises')
        .select('id, carte_id, montant, encaisse_par, encaisse_le, est_commission')
        .eq('collecteur_id', a.id),
      admin
        .from('retraits')
        .select('id, carte_id, montant_restitue, restitue_par, effectue_le')
        .eq('collecteur_id', a.id),
      admin.from('rattrapages').select('id, carte_id, montant, main_id, encaisse_le').eq('collecteur_id', a.id),
    ]);
    for (const r of [vue, mises, retraits, rattrapages]) expect(r.error).toBeNull();

    const calcule = mouvementsDepuis({
      mises: ((mises.data ?? []) as Array<Record<string, never>>).map((m: Record<string, unknown>) => ({
        id: String(m.id),
        carteId: String(m.carte_id),
        montant: Number(m.montant),
        encaissePar: String(m.encaisse_par),
        encaisseLe: String(m.encaisse_le),
        estCommission: Boolean(m.est_commission),
      })),
      retraits: ((retraits.data ?? []) as Array<Record<string, never>>).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        carteId: String(r.carte_id),
        montantRestitue: Number(r.montant_restitue),
        restituePar: String(r.restitue_par),
        effectueLe: String(r.effectue_le),
      })),
      rattrapages: ((rattrapages.data ?? []) as Array<Record<string, never>>).map(
        (t: Record<string, unknown>) => ({
          id: String(t.id),
          carteId: String(t.carte_id),
          montant: Number(t.montant),
          mainId: String(t.main_id),
          encaisseLe: String(t.encaisse_le),
        }),
      ),
    });

    const depuisLaVue = parId((vue.data ?? []) as LigneVue[]).map((l) => ({
      id: l.id,
      nature: l.nature,
      sens: l.sens,
      montant: l.montant,
      mainId: l.main_id,
      carteId: l.carte_id,
      survenuLe: l.survenu_le,
      estCommission: l.est_commission,
    }));

    expect(depuisLaVue).toEqual(parId(calcule));
  });
});

describe('à qui la vue rend', () => {
  it('ne rend à un collecteur que ses lignes, rattrapage compris', async () => {
    const { data } = await a.client.from('mouvements').select('id, collecteur_id');
    const lignes = (data ?? []) as Array<{ id: string; collecteur_id: string }>;

    expect(lignes.every((l) => l.collecteur_id === a.id)).toBe(true);
    expect(lignes.map((l) => l.id)).not.toContain(jeuB.rattrapageId);
  });

  it('ne rend rien à anon', async () => {
    const { data, error } = await anonyme.from('mouvements').select('id');

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('rend au collaborateur et au titulaire ce que leurs tables leur rendent', async () => {
    const patron = await creerCollecteur('Registre Patron', telephone());
    const awa = await creerCollecteur('Registre Awa', telephone());
    expect(
      (
        await admin
          .from('collecteurs')
          .update({ palier: 'illimite', abonnement_statut: 'actif' })
          .eq('id', patron.id)
      ).error,
    ).toBeNull();
    expect((await admin.from('collecteurs').update({ titulaire_id: patron.id }).eq('id', awa.id)).error).toBeNull();

    // La carte est à Awa ; le titulaire encaisse et rend pour elle. La main
    // n'est donc pas le propriétaire, et c'est le cas que la vue doit tenir.
    const carte = await poserCartePiegee(awa);
    await poserRattrapage(awa, carte, { mainId: patron.id });
    const client2 = crypto.randomUUID();
    const carte2 = crypto.randomUUID();
    await admin.from('clients').insert({ id: client2, collecteur_id: awa.id, nom: 'Cliente du patron' });
    await admin.from('cartes').insert({ id: carte2, collecteur_id: awa.id, client_id: client2, mise: MISE_PIEGE });
    await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: awa.id,
      carte_id: carte2,
      montant: MISE_PIEGE,
      encaisse_le: new Date().toISOString(),
      encaisse_par: patron.id,
    });
    await admin.from('retraits').insert({
      collecteur_id: awa.id,
      carte_id: carte2,
      montant_restitue: 0,
      commission: MISE_PIEGE,
      restitue_par: patron.id,
    });

    for (const qui of [patron, awa]) {
      const [vue, mises, retraits, rattrapages] = await Promise.all([
        qui.client.from('mouvements').select('id'),
        qui.client.from('mises').select('id'),
        qui.client.from('retraits').select('id'),
        qui.client.from('rattrapages').select('id'),
      ]);
      const depuisLesTables = [
        ...((mises.data ?? []) as Array<{ id: string }>),
        ...((retraits.data ?? []) as Array<{ id: string }>),
        ...((rattrapages.data ?? []) as Array<{ id: string }>),
      ]
        .map((l) => l.id)
        .sort();

      expect(((vue.data ?? []) as Array<{ id: string }>).map((l) => l.id).sort()).toEqual(depuisLesTables);
    }
  });
});

describe('ce que la table des rattrapages refuse', () => {
  it('refuse à un collecteur d’en écrire un', async () => {
    const insertion = await a.client.from('rattrapages').insert({
      collecteur_id: a.id,
      main_id: a.id,
      carte_id: jeuA.carteId,
      rejet_id: crypto.randomUUID(),
      montant: MISE_PIEGE,
      encaisse_le: new Date().toISOString(),
    });
    const modification = await a.client.from('rattrapages').update({ montant: 5000 }).eq('id', jeuA.rattrapageId);
    const suppression = await a.client.from('rattrapages').delete().eq('id', jeuA.rattrapageId);

    expect(insertion.error).not.toBeNull();
    expect(modification.error).not.toBeNull();
    expect(suppression.error).not.toBeNull();

    const { data } = await admin.from('rattrapages').select('montant').eq('id', jeuA.rattrapageId).single();
    expect(data?.montant).toBe(MISE_PIEGE);
  });

  it('refuse même à la clé de service de modifier ou d’effacer', async () => {
    const modification = await admin.from('rattrapages').update({ montant: 5000 }).eq('id', jeuA.rattrapageId);
    const suppression = await admin.from('rattrapages').delete().eq('id', jeuA.rattrapageId);

    expect(modification.error?.message).toContain('LIGNE_IMMUABLE');
    expect(suppression.error?.message).toContain('LIGNE_IMMUABLE');
  });

  it('refuse un second rattrapage pour le même refus', async () => {
    const { error } = await admin.from('rattrapages').insert({
      collecteur_id: a.id,
      main_id: a.id,
      carte_id: jeuA.carteId,
      rejet_id: jeuA.rejetId,
      montant: MISE_PIEGE,
      encaisse_le: new Date().toISOString(),
    });

    expect(error?.code).toBe('23505');
  });
});
```

- [ ] **Étape 3 : lancer l'épreuve et la voir rouge**

Run : `npm run test:db -- mouvements`
Attendu : ÉCHEC — `relation "public.rattrapages" does not exist` dans la préparation.

- [ ] **Étape 4 : écrire la migration**

Créer `supabase/migrations/20260915100000_mouvements_registre.sql` :

```sql
-- Le registre des mouvements : une seule surface de lecture de l'argent.
--
-- Spec : Docs/specs/2026-09-15-mouvements-registre-design.md §2.
-- Décision d'architecture d'origine : 2026-08-16-j2-cadrage-mouvements.md §2.
--
-- ## Le défaut que cette vue empêche
--
-- Une mise encaissée que le serveur refuse ne disparaît pas du monde réel :
-- l'argent a changé de main. Le chantier suivant l'enregistrera comme une dette
-- — un « rattrapage ». À partir de là, la somme encaissée ne se lit plus dans
-- la seule table `mises`, et tout écran qui l'y lit sous-compte exactement
-- l'argent que ce mécanisme sert à ne pas perdre : le client passe pour avoir
-- versé une fois de moins, et le collecteur pour garder un excédent.
--
-- Le Mobile Money et les bonus de fidélisation poseront la même question. Ils
-- ajouteront une branche ici, et aucun lecteur ne bougera.
--
-- ## Ce que cette migration fait, et ne fait pas
--
-- Elle **ajoute** : une table vide, une vue, leurs droits. Elle ne touche
-- aucune ligne, ne change aucune fonction, et ne modifie rien de ce que les
-- écrans affichent aujourd'hui. Les lecteurs passent à la vue dans les
-- migrations suivantes.

-- ---------------------------------------------------------------------------
-- 1. La table des rattrapages, créée vide
-- ---------------------------------------------------------------------------
-- Aucun droit d'écriture pour `authenticated` : le geste du collecteur, ses
-- bornes et son avis au client appartiennent au chantier suivant. Ici, seule la
-- clé de service écrit — c'est-à-dire les épreuves, dont le jeu piégé qui rend
-- rouge tout calcul resté sur `mises` seule.
create table public.rattrapages (
  id            uuid primary key default gen_random_uuid(),
  -- Le propriétaire de la carte, comme `mises.collecteur_id`.
  collecteur_id uuid not null references public.collecteurs(id) on delete restrict,
  -- La main qui a pris l'argent, comme `mises.encaisse_par` : c'est elle qui
  -- range la mise dans une sacoche, donc dans une caisse du jour.
  main_id       uuid not null references public.collecteurs(id) on delete restrict,
  carte_id      uuid not null references public.cartes(id) on delete restrict,
  -- Un rattrapage ne peut naître que d'un refus réellement consigné, et un
  -- refus n'en produit jamais deux : c'est toute la protection contre le double
  -- comptage, et elle est dans le schéma.
  rejet_id      uuid not null unique references public.synchro_rejets(id) on delete restrict,
  montant       integer not null check (montant > 0),
  -- L'heure de la mise refusée, jamais celle de la saisie : la mise a eu lieu
  -- lundi, le rattrapage est saisi mercredi, et c'est le lundi qu'il répare.
  encaisse_le   timestamptz not null,
  cree_le       timestamptz not null default now()
);

comment on table public.rattrapages is
  'Une mise encaissée que le serveur a refusée, enregistrée comme dette envers le client (spec J1 §4.5). Append-only. Aucune écriture par authenticated avant le chantier du rattrapage.';

create index rattrapages_collecteur_date_idx
  on public.rattrapages (collecteur_id, encaisse_le desc);

-- Append-only, clé de service comprise — RLS ne filtre pas la clé de service,
-- le déclencheur si.
create trigger rattrapages_immuables
  before update or delete on public.rattrapages
  for each row execute function public.interdire_modification();

-- L'argent se journalise. `journal_couverture()` accepte un journal à
-- l'insertion seule pour une table protégée en modification : c'est le régime
-- de `mises` et de `retraits`.
create trigger rattrapages_journal
  after insert on public.rattrapages
  for each row execute function public.journaliser();

alter table public.rattrapages enable row level security;

revoke all on public.rattrapages from public, anon, authenticated;
grant select on public.rattrapages to authenticated;
grant all    on public.rattrapages to service_role;

create policy rattrapages_select on public.rattrapages
  for select using (collecteur_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. La vue
-- ---------------------------------------------------------------------------
-- `security_invoker = true` n'est pas décoratif : sans lui, la vue s'exécute
-- avec les droits de son propriétaire et contourne les politiques RLS des
-- tables sous-jacentes — elle exposerait à chaque collecteur l'argent de tous
-- les autres, et annulerait à elle seule l'isolation du socle.
--
-- Trois règles de lecture :
--   1. le montant est toujours positif, `sens` dit la direction ; l'argent tenu
--      est `sum(sens * montant)`, les encaissements `sens = 1` ;
--   2. la commission reste une mise, et une sortie vaut le montant restitué,
--      jamais restitué + commission — la commission reste chez le collecteur et
--      elle est déjà comptée du côté des entrées ;
--   3. le client se lit par la carte, pour les trois natures : une seule
--      vérité, que la table des rattrapages ne peut pas contredire.
create view public.mouvements with (security_invoker = true) as
select m.id,
       'mise'::text     as nature,
       1                as sens,
       m.montant,
       m.collecteur_id,
       m.encaisse_par   as main_id,
       m.carte_id,
       ca.client_id,
       m.encaisse_le    as survenu_le,
       m.est_commission
  from public.mises m
  join public.cartes ca on ca.id = m.carte_id
union all
select r.id,
       'retrait',
       -1,
       r.montant_restitue,
       r.collecteur_id,
       r.restitue_par,
       r.carte_id,
       ca.client_id,
       r.effectue_le,
       false
  from public.retraits r
  join public.cartes ca on ca.id = r.carte_id
union all
select t.id,
       'rattrapage',
       1,
       t.montant,
       t.collecteur_id,
       t.main_id,
       t.carte_id,
       ca.client_id,
       t.encaisse_le,
       false
  from public.rattrapages t
  join public.cartes ca on ca.id = t.carte_id;

comment on view public.mouvements is
  'La seule surface de lecture de l''argent : mises et rattrapages en entrée, retraits en sortie. Montant positif, sens signé, main qui a tenu l''argent. security_invoker : chacun n''y voit que ce que les politiques RLS lui rendent.';

revoke all  on public.mouvements from public, anon, authenticated;
grant select on public.mouvements to authenticated;
grant select on public.mouvements to service_role;

-- ---------------------------------------------------------------- Garde-fou
do $garde$
begin
  if not exists (
    select 1 from pg_class c
     where c.oid = 'public.mouvements'::regclass
       and 'security_invoker=true' = any (coalesce(c.reloptions, '{}'))
  ) then
    raise exception 'GARDE_FOU : la vue mouvements contourne la RLS (security_invoker absent).';
  end if;

  if has_table_privilege('anon', 'public.mouvements', 'select')
     or has_table_privilege('anon', 'public.rattrapages', 'select') then
    raise exception 'GARDE_FOU : anon lit le registre.';
  end if;

  if has_table_privilege('authenticated', 'public.rattrapages', 'insert')
     or has_table_privilege('authenticated', 'public.rattrapages', 'update')
     or has_table_privilege('authenticated', 'public.rattrapages', 'delete') then
    raise exception 'GARDE_FOU : un collecteur peut écrire un rattrapage.';
  end if;
end
$garde$;
```

- [ ] **Étape 5 : appliquer la migration en local et voir l'épreuve verte**

```bash
npx supabase migration up --local
npm run test:db -- mouvements
```
Attendu : la migration s'applique, puis 10 épreuves vertes.

- [ ] **Étape 6 : vérifier que rien d'autre n'a bougé**

Run : `npm run test:db`
Attendu : toutes vertes, y compris `journal-couverture`, `search-path`, `reglages-admin` et `isolation`.

- [ ] **Étape 7 : commiter**

```bash
git add supabase/migrations/20260915100000_mouvements_registre.sql supabase/tests/jeu-piege.ts supabase/tests/mouvements.test.ts
git commit -m "feat(base): la table des rattrapages et la vue mouvements" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 3 : la caisse du jour lit le registre, et suit un rattrapage

**Fichiers :**
- Créer : `supabase/migrations/20260915110000_caisse_suit_les_rattrapages.sql`
- Créer : `supabase/tests/caisse-rattrapage.test.ts`

**Interfaces :**
- Consomme : la vue `public.mouvements` et `supabase/tests/jeu-piege.ts` (tâche 2).
- Produit : `public.cash_attendu_du_jour(uuid, date)` calculée sur la vue (signature inchangée) ; `public.caisses_rafraichir_apres_rattrapage()` et son déclencheur `rattrapages_rafraichir_caisse`.

- [ ] **Étape 1 : écrire l'épreuve**

Créer `supabase/tests/caisse-rattrapage.test.ts` :

```ts
import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';
import {
  ATTENDU_PIEGE,
  MISE_PIEGE,
  jourUtc,
  poserCartePiegee,
  poserJeuPiege,
  poserRattrapage,
  poserRefus,
} from './jeu-piege';

/**
 * Le cash attendu compte les rattrapages, et à leur date d'origine.
 *
 * Le déroulé que cette épreuve garde : lundi, le collecteur a 1 000 FCFA de
 * plus que ce que le serveur attendait — une mise refusée qu'il a bien
 * encaissée. Mercredi, le rattrapage arrive, daté du lundi ; l'attendu du lundi
 * se recalcule et l'écart se referme de lui-même. Si l'attendu était figé, cet
 * écart resterait faux pour toujours, et personne ne saurait jamais pourquoi.
 */

afterAll(nettoyer);

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

async function cashAttendu(collecteurId: string, jour: string): Promise<number> {
  const { data, error } = await admin.rpc('cash_attendu_du_jour', {
    p_collecteur: collecteurId,
    p_date: jour,
  });
  expect(error).toBeNull();
  return data as number;
}

async function caisse(collecteurId: string, jour: string) {
  const { data, error } = await admin
    .from('caisses_jour')
    .select('cash_attendu, cash_declare, ecart')
    .eq('collecteur_id', collecteurId)
    .eq('date', jour)
    .maybeSingle();
  expect(error).toBeNull();
  return data as { cash_attendu: number; cash_declare: number; ecart: number } | null;
}

/** Un client, une carte active, et `combien` mises à `jour`, une par une. */
async function carteAvecMises(c: CollecteurTest, jour: string, combien: number): Promise<string> {
  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();
  await admin.from('clients').insert({ id: clientId, collecteur_id: c.id, nom: 'Cliente caisse' });
  await admin.from('cartes').insert({ id: carteId, collecteur_id: c.id, client_id: clientId, mise: MISE_PIEGE });
  for (let i = 0; i < combien; i += 1) {
    const { error } = await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: c.id,
      carte_id: carteId,
      montant: MISE_PIEGE,
      encaisse_le: `${jour}T09:0${i}:00Z`,
    });
    expect(error).toBeNull();
  }
  return carteId;
}

describe('le cash attendu', () => {
  it('compte le rattrapage du jeu piégé dans la caisse de son jour', async () => {
    const c = await creerCollecteur('Caisse piégée', telephone());
    const jeu = await poserJeuPiege(c);

    // 30 000 encaissés, 1 000 rattrapés, 29 000 rendus : il reste 2 000.
    expect(await cashAttendu(c.id, jeu.jour)).toBe(ATTENDU_PIEGE.caisseDuJour);
  });

  it('referme l’écart du lundi quand le rattrapage arrive le mercredi', async () => {
    const c = await creerCollecteur('Caisse lundi', telephone());
    const lundi = jourUtc(2);
    const carteId = await carteAvecMises(c, lundi, 2);

    // Le collecteur déclare les trois mises qu'il a réellement prises ; le
    // serveur n'en connaît que deux.
    const { error } = await c.client
      .from('caisses_jour')
      .insert({ collecteur_id: c.id, date: lundi, cash_declare: 3000 });
    expect(error).toBeNull();
    expect(await caisse(c.id, lundi)).toMatchObject({ cash_attendu: 2000, ecart: 1000 });

    const rejetId = await poserRefus(c, { carteId, jour: lundi });
    await poserRattrapage(c, { clientId: '', carteId, rejetId, jour: lundi });

    expect(await caisse(c.id, lundi)).toMatchObject({ cash_attendu: 3000, ecart: 0 });
  });

  it('ne crée aucune caisse un jour où il n’y en avait pas', async () => {
    const c = await creerCollecteur('Caisse absente', telephone());
    const carte = await poserCartePiegee(c, 4);

    await poserRattrapage(c, carte);

    const { count, error } = await admin
      .from('caisses_jour')
      .select('id', { count: 'exact', head: true })
      .eq('collecteur_id', c.id);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it('range le rattrapage dans la caisse de la main, pas du propriétaire', async () => {
    const patron = await creerCollecteur('Caisse patron', telephone());
    const awa = await creerCollecteur('Caisse awa', telephone());
    await admin
      .from('collecteurs')
      .update({ palier: 'illimite', abonnement_statut: 'actif' })
      .eq('id', patron.id);
    await admin.from('collecteurs').update({ titulaire_id: patron.id }).eq('id', awa.id);

    const jour = jourUtc(1);
    const carteId = await carteAvecMises(awa, jour, 1);
    const rejetId = await poserRefus(awa, { carteId, jour });

    const patronAvant = await cashAttendu(patron.id, jour);
    const awaAvant = await cashAttendu(awa.id, jour);

    await poserRattrapage(awa, { clientId: '', carteId, rejetId, jour }, { mainId: patron.id });

    // La carte est à Awa ; l'argent est dans la sacoche du titulaire.
    expect(await cashAttendu(patron.id, jour)).toBe(patronAvant + MISE_PIEGE);
    expect(await cashAttendu(awa.id, jour)).toBe(awaAvant);
  });
});
```

- [ ] **Étape 2 : lancer l'épreuve et la voir rouge**

Run : `npm run test:db -- caisse-rattrapage`
Attendu : ÉCHEC sur les quatre — `expected 1000 to be 2000` sur la première, l'attendu ignorant encore les rattrapages.

- [ ] **Étape 3 : écrire la migration**

Créer `supabase/migrations/20260915110000_caisse_suit_les_rattrapages.sql` :

```sql
-- La caisse du jour se calcule sur le registre, et un rattrapage la rattrape.
--
-- Spec : Docs/specs/2026-09-15-mouvements-registre-design.md §2.3 et §3.1.
--
-- Même résultat qu'avant sur les mêmes données : entrées moins sorties, par la
-- main qui a tenu l'argent, sur la journée UTC. Ce qui change est qu'un
-- rattrapage y entre — et qu'il y entre au jour de la mise refusée, pas au jour
-- de sa saisie.

create or replace function public.cash_attendu_du_jour(p_collecteur uuid, p_date date)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  -- `main_id` et non le propriétaire de la carte : c'est ce qui est passé par
  -- cette main-là qui doit se retrouver dans cette sacoche-là.
  --
  -- `at time zone 'UTC'` explicite, et non `survenu_le::date` : ce dernier
  -- découpe la journée selon le fuseau de la session. Abidjan est à UTC+0 toute
  -- l'année, donc les deux coïncident aujourd'hui — par géographie, pas par
  -- intention. Une Edge Function lancée avec un autre `TimeZone` déplacerait la
  -- frontière du jour, et donc l'écart de caisse.
  --
  -- `sens * montant` : les entrées s'ajoutent, les sorties se retirent. La
  -- sortie d'un retrait vaut le montant restitué, jamais restitué + commission
  -- — la commission reste chez le collecteur, et elle est déjà comptée du côté
  -- des entrées. La soustraire ici la retirerait deux fois.
  select coalesce(sum(sens * montant), 0)::integer
    from public.mouvements
   where main_id = p_collecteur
     and (survenu_le at time zone 'UTC')::date = p_date;
$fn$;

revoke all on function public.cash_attendu_du_jour(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Le rattrapage rafraîchit la caisse de son jour, comme le fait une mise
-- ---------------------------------------------------------------------------
-- Calqué sur `caisses_rafraichir_apres_mise`. S'il n'existe pas de caisse ce
-- jour-là, rien n'est créé : l'absence de ligne est une information — « il n'a
-- pas encore compté » — et la fabriquer afficherait un écart qui n'existe pas.
create or replace function public.caisses_rafraichir_apres_rattrapage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  update public.caisses_jour
     set cash_attendu = public.cash_attendu_du_jour(
           new.main_id, (new.encaisse_le at time zone 'UTC')::date)
   where collecteur_id = new.main_id
     and date = (new.encaisse_le at time zone 'UTC')::date;
  return null;
end;
$fn$;

revoke all on function public.caisses_rafraichir_apres_rattrapage() from public, anon, authenticated;

create trigger rattrapages_rafraichir_caisse
  after insert on public.rattrapages
  for each row execute function public.caisses_rafraichir_apres_rattrapage();

-- ---------------------------------------------------------------- Garde-fou
do $garde$
begin
  if position('mouvements' in
       pg_get_functiondef('public.cash_attendu_du_jour(uuid, date)'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : le cash attendu ne lit pas le registre.';
  end if;

  if has_function_privilege('anon', 'public.cash_attendu_du_jour(uuid, date)', 'execute')
     or has_function_privilege('authenticated', 'public.cash_attendu_du_jour(uuid, date)', 'execute') then
    raise exception 'GARDE_FOU : le cash attendu est exécutable depuis un navigateur.';
  end if;
end
$garde$;
```

- [ ] **Étape 4 : appliquer et voir vert**

```bash
npx supabase migration up --local
npm run test:db -- caisse-rattrapage
```
Attendu : 4 vertes.

- [ ] **Étape 5 : vérifier que les caisses d'avant n'ont pas bougé**

Run : `npm run test:db -- "rapprochement-collecteur|cash-equipe|bornes"`
Attendu : toutes vertes, **sans qu'un chiffre attendu ait été modifié**.

- [ ] **Étape 6 : commiter**

```bash
git add supabase/migrations/20260915110000_caisse_suit_les_rattrapages.sql supabase/tests/caisse-rattrapage.test.ts
git commit -m "feat(base): la caisse du jour lit le registre et suit un rattrapage" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 4 : les lecteurs de l'administration et de l'équipe

**Fichiers :**
- Créer : `supabase/migrations/20260915120000_lecteurs_admin_mouvements.sql`
- Créer : `supabase/tests/lecteurs-admin-piege.test.ts`
- Modifier : `apps/admin/src/donnees.ts` (le type d'un mouvement)

**Interfaces :**
- Consomme : la vue `public.mouvements`, `supabase/tests/jeu-piege.ts`.
- Produit : `admin_vue_globale()`, `admin_tendances(integer)` et `equipe_vue()` calculées sur la vue, **signatures, droits et clés de sortie inchangés**. Une nouvelle valeur possible pour la clé `type` d'un mouvement : `'rattrapage'`.

**Ce qui change dans chaque fonction, et rien d'autre :**

| Avant | Après |
|---|---|
| `from public.mises` groupé par collecteur | `from public.mouvements where sens = 1` |
| `from public.retraits`, `sum(montant_restitue)` | `from public.mouvements where nature = 'retrait'`, `sum(montant)` |
| liste des derniers mouvements : union de `mises` et `retraits` | `from public.mouvements`, `sens * montant`, type `'rattrapage'` en plus |
| `left join public.retraits r on r.carte_id = ca.id` | `left join public.mouvements r on r.carte_id = ca.id and r.nature = 'retrait'` |
| `min(encaisse_le)`, `max(encaisse_le)` des mises | idem sur `mouvements where sens = 1` |

**Les restitutions se comptent sur `nature = 'retrait'`, jamais sur `sens = -1`** : au chantier suivant, le règlement d'un rattrapage sera une sortie qui n'est pas une restitution de carte.

- [ ] **Étape 1 : écrire l'épreuve**

Créer `supabase/tests/lecteurs-admin-piege.test.ts` :

```ts
import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';
import { ATTENDU_PIEGE, MISE_PIEGE, poserCartePiegee, poserJeuPiege, poserRattrapage } from './jeu-piege';

/**
 * Les trois lecteurs de l'administration et de l'équipe, sur le jeu piégé.
 *
 * Ces fonctions agrègent *toute* la plateforme, et `npm run test:db` ne
 * réinitialise pas la base : un total absolu serait faux au deuxième
 * lancement. Les totaux sont donc mesurés **en écart** — avant et après la pose
 * d'un rattrapage — et les valeurs absolues seulement sur la ligne du
 * collecteur de l'épreuve, qui lui est propre.
 */

afterAll(nettoyer);

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

type Objet = Record<string, number>;

async function vueGlobale(): Promise<Record<string, unknown>> {
  const { data, error } = await admin.rpc('admin_vue_globale');
  expect(error).toBeNull();
  return data as Record<string, unknown>;
}

async function tendances(jours: number): Promise<Record<string, unknown>> {
  const { data, error } = await admin.rpc('admin_tendances', { p_jours: jours });
  expect(error).toBeNull();
  return data as Record<string, unknown>;
}

describe('admin_vue_globale', () => {
  it('compte le rattrapage sur la ligne du collecteur', async () => {
    const c = await creerCollecteur('Globale piégée', telephone());
    await poserJeuPiege(c);

    const ligne = ((await vueGlobale()).collecteurs as Array<Record<string, unknown>>).find(
      (l) => l.id === c.id,
    );

    expect(ligne).toMatchObject({
      encaisse: ATTENDU_PIEGE.encaisse,
      commissions: ATTENDU_PIEGE.commissions,
      restitutions: ATTENDU_PIEGE.restitue,
      encours: ATTENDU_PIEGE.duAuClient,
    });
  });

  it('ajoute un versement aux totaux, et rien d’autre', async () => {
    const c = await creerCollecteur('Globale totaux', telephone());
    const carte = await poserCartePiegee(c);

    const avant = (await vueGlobale()).totaux as Objet;
    await poserRattrapage(c, carte);
    const apres = (await vueGlobale()).totaux as Objet;

    expect({
      mises: apres.mises! - avant.mises!,
      total_encaisse: apres.total_encaisse! - avant.total_encaisse!,
      commissions: apres.commissions! - avant.commissions!,
      restitutions: apres.restitutions! - avant.restitutions!,
      encours_clients: apres.encours_clients! - avant.encours_clients!,
    }).toEqual({
      mises: 1,
      total_encaisse: MISE_PIEGE,
      commissions: 0,
      restitutions: 0,
      encours_clients: MISE_PIEGE,
    });
  });

  it('nomme un rattrapage dans les derniers mouvements', async () => {
    const c = await creerCollecteur('Globale liste', telephone());
    const carte = await poserCartePiegee(c);
    // Daté de cinq jours en avant : `mises.encaisse_le` est bornée à un jour
    // devant, donc aucune mise de la base ne peut l'être — ce rattrapage est le
    // plus récent, et il entre à coup sûr dans les vingt derniers. La table des
    // rattrapages n'a pas de borne de date ; le geste du chantier suivant lui en
    // posera une.
    await poserRattrapage(c, carte, { encaisseLe: new Date(Date.now() + 5 * 86_400_000).toISOString() });

    const derniers = (await vueGlobale()).mouvements as Array<Record<string, unknown>>;

    expect(derniers[0]).toMatchObject({ type: 'rattrapage', collecteur_id: c.id, montant: MISE_PIEGE });
  });
});

describe('admin_tendances', () => {
  it('ajoute le rattrapage aux flux, à la série de son jour et au compte', async () => {
    const c = await creerCollecteur('Tendances piégée', telephone());
    const carte = await poserCartePiegee(c);

    const avant = await tendances(7);
    await poserRattrapage(c, carte);
    const apres = await tendances(7);

    const duJour = (t: Record<string, unknown>) =>
      (t.serie as Array<Record<string, unknown>>).find((p) => p.jour === carte.jour) as Objet;
    const flux = (t: Record<string, unknown>) => t.flux as Objet;

    expect(flux(apres).encaisse! - flux(avant).encaisse!).toBe(MISE_PIEGE);
    expect(flux(apres).mises! - flux(avant).mises!).toBe(1);
    expect(flux(apres).commissions! - flux(avant).commissions!).toBe(0);
    expect(flux(apres).restitutions! - flux(avant).restitutions!).toBe(0);
    expect((apres.mouvements_total as number) - (avant.mouvements_total as number)).toBe(1);
    expect(duJour(apres).encaisse! - duJour(avant).encaisse!).toBe(MISE_PIEGE);
  });
});

describe('equipe_vue', () => {
  it('rend au titulaire l’encours qu’un rattrapage a créé chez son collaborateur', async () => {
    const patron = await creerCollecteur('Équipe patron', telephone());
    const awa = await creerCollecteur('Équipe awa', telephone());
    expect(
      (
        await admin
          .from('collecteurs')
          .update({ palier: 'illimite', abonnement_statut: 'actif' })
          .eq('id', patron.id)
      ).error,
    ).toBeNull();
    expect((await admin.from('collecteurs').update({ titulaire_id: patron.id }).eq('id', awa.id)).error).toBeNull();

    await poserJeuPiege(awa);

    const { data, error } = await patron.client.rpc('equipe_vue');
    expect(error).toBeNull();

    expect((data as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: awa.id,
      encours: ATTENDU_PIEGE.duAuClient,
      commissions: ATTENDU_PIEGE.commissions,
    });
  });
});
```

- [ ] **Étape 2 : lancer l'épreuve et la voir rouge**

Run : `npm run test:db -- lecteurs-admin-piege`
Attendu : ÉCHEC — `encaisse: 30000` au lieu de 31 000, `encours: 0` au lieu de 1 000.

- [ ] **Étape 3 : écrire la migration**

Créer `supabase/migrations/20260915120000_lecteurs_admin_mouvements.sql`. Les trois fonctions sont **recopiées mot pour mot** depuis leur définition en vigueur — `20260902150000`, `20260911210000`, `20260902130000` — avec les seules substitutions de la table ci-dessus. Leurs `set search_path`, leurs droits et leurs commentaires sont reportés : les omettre annulerait en silence des durcissements que des épreuves surveillent.

```sql
-- L'administration et l'équipe lisent le registre.
--
-- Spec : Docs/specs/2026-09-15-mouvements-registre-design.md §3.1.
--
-- Les trois fonctions sont reprises de leur définition en vigueur avec une
-- seule substitution : là où elles lisaient `mises` et `retraits`, elles lisent
-- la vue. Mêmes signatures, mêmes clés de sortie, mêmes chiffres sur les mêmes
-- données. Ce qui change est qu'un rattrapage y entre — et il n'y en a aucun
-- en production le jour où cette migration part.

-- ---------------------------------------------------------------------------
-- 1. La vue globale de l'administration
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_vue_globale()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with
  entrees_par_collecteur as (
    select
      collecteur_id,
      coalesce(sum(montant), 0)                                   as encaisse,
      coalesce(sum(montant) filter (where est_commission), 0)     as commissions,
      coalesce(sum(montant) filter (where not est_commission), 0) as du_aux_clients,
      count(*)                                                    as nb_mises
    from public.mouvements
    where sens = 1
    group by collecteur_id
  ),
  -- `nature = 'retrait'` et non `sens = -1` : une restitution est la clôture
  -- d'une carte. Le règlement d'un rattrapage, au chantier suivant, sera une
  -- sortie de caisse sans être une restitution.
  sorties_par_collecteur as (
    select
      collecteur_id,
      coalesce(sum(montant), 0) as restitutions,
      count(*)                  as nb_retraits
    from public.mouvements
    where nature = 'retrait'
    group by collecteur_id
  ),
  clients_par_collecteur as (
    select collecteur_id, count(*) as nb_clients
    from public.clients
    group by collecteur_id
  ),
  cartes_par_collecteur as (
    select
      collecteur_id,
      count(*) filter (where statut = 'active') as cartes_actives,
      count(*)                                  as cartes_total
    from public.cartes
    group by collecteur_id
  ),
  par_collecteur as (
    select
      c.id,
      c.nom,
      c.telephone,
      c.zone,
      c.palier,
      c.abonnement_statut,
      c.abonnement_echeance,
      c.cree_le,
      c.titulaire_id,
      t.nom as titulaire_nom,
      coalesce(cl.nb_clients, 0)      as clients,
      coalesce(ca.cartes_actives, 0)  as cartes_actives,
      coalesce(ca.cartes_total, 0)    as cartes_total,
      coalesce(m.encaisse, 0)         as encaisse,
      coalesce(m.commissions, 0)      as commissions,
      coalesce(m.du_aux_clients, 0)   as du_aux_clients,
      coalesce(m.nb_mises, 0)         as nb_mises,
      coalesce(r.restitutions, 0)     as restitutions,
      coalesce(r.nb_retraits, 0)      as nb_retraits
    from public.collecteurs c
    left join clients_par_collecteur cl on cl.collecteur_id = c.id
    left join cartes_par_collecteur  ca on ca.collecteur_id = c.id
    left join entrees_par_collecteur m  on m.collecteur_id  = c.id
    left join sorties_par_collecteur r  on r.collecteur_id  = c.id
    -- Le titulaire, pour son nom. `left join` : la très grande majorité des
    -- collecteurs n'en ont pas, et un `join` les ferait tous disparaître de la
    -- liste d'administration.
    left join public.collecteurs t on t.id = c.titulaire_id
  ),
  -- Une ligne par carte. `retraits` porte une contrainte d'unicité sur
  -- `carte_id`, donc la jointure ne peut pas dupliquer la ligne.
  --
  -- `collecteur_id` accompagne `collecteur` : la fiche détaillée filtre les
  -- cartes d'un collecteur, et le faire sur le nom mélangerait les cartes de
  -- deux homonymes. Rien n'impose l'unicité de `collecteurs.nom` — seul le
  -- téléphone est unique.
  par_carte as (
    select
      ca.id,
      cl.nom                                       as client,
      col.id                                       as collecteur_id,
      col.nom                                      as collecteur,
      ca.mise,
      ca.mises_encaissees,
      ca.statut,
      ca.ouverte_le,
      -- La première mise est la commission du collecteur : elle ne revient pas
      -- au client. Même règle que `soldeRestituable` dans packages/core.
      greatest(ca.mises_encaissees - 1, 0)::bigint * ca.mise as solde_restituable,
      coalesce(r.montant, 0)                         as restitue
    from public.cartes ca
    join public.clients     cl  on cl.id  = ca.client_id
    join public.collecteurs col on col.id = ca.collecteur_id
    left join public.mouvements r on r.carte_id = ca.id and r.nature = 'retrait'
  ),
  derniers as (
    select
      case
        when mv.nature = 'retrait' then 'restitution'
        when mv.est_commission     then 'commission'
        else mv.nature
      end                    as type,
      cl.nom                 as client,
      col.id                 as collecteur_id,
      col.nom                as collecteur,
      mv.sens * mv.montant   as montant,
      mv.survenu_le          as survenu_le
    from public.mouvements mv
    join public.clients     cl  on cl.id  = mv.client_id
    join public.collecteurs col on col.id = mv.collecteur_id
    order by survenu_le desc
    limit 20
  )
  select jsonb_build_object(
    'genere_le', now(),

    'par_palier', coalesce((
      select jsonb_agg(x order by x->>'palier')
      from (
        select jsonb_build_object(
                 'palier',  palier,
                 -- Tout le monde : ce sont des comptes qui existent.
                 'total',   count(*),
                 -- Les abonnements facturés, eux. Un collaborateur ne paie pas :
                 -- son titulaire paie pour lui, et cet abonnement-là est déjà
                 -- compté sur la ligne du titulaire. Sans ce filtre, une équipe
                 -- de quatre est annoncée comme quatre abonnements Illimité.
                 'actifs',  count(*) filter (
                              where abonnement_statut = 'actif'
                                and titulaire_id is null
                            ),
                 -- La remise en fraction d'abonnement, jamais en francs : un
                 -- collecteur a -20 % vaut 0,2 offert, et l'Edge Function
                 -- multiplie. Meme filtre que `actifs` -- un abonnement
                 -- suspendu n'encaisse rien, donc la remise qu'il porte ne
                 -- coute rien, et l'inscrire au manque a gagner compterait
                 -- deux fois la meme absence de recette.
                 'offerts', coalesce(sum(remise_pct) filter (
                              where abonnement_statut = 'actif'
                                and titulaire_id is null
                                and remise_fin >= current_date
                            ), 0) / 100.0
               ) as x
        from public.collecteurs
        group by palier
      ) s
    ), '[]'::jsonb),

    'abonnements', (
      select jsonb_build_object(
        'collecteurs_total',   count(*),
        'collecteurs_actifs',  count(*) filter (where abonnement_statut = 'actif'),
        'suspendus',           count(*) filter (where abonnement_statut = 'suspendu'),
        'expires',             count(*) filter (where abonnement_statut = 'expire'),
        'expirations_ce_mois', count(*) filter (
                                 where abonnement_echeance >= date_trunc('month', current_date)::date
                                   and abonnement_echeance <  (date_trunc('month', current_date) + interval '1 month')::date
                               ),
        'expirations_a_venir_30j', count(*) filter (
                                 where abonnement_echeance >= current_date
                                   and abonnement_echeance <= current_date + 30
                               )
      )
      from public.collecteurs
    ),

    'totaux', (
      select jsonb_build_object(
        'clients',        coalesce(sum(clients), 0),
        'cartes_actives', coalesce(sum(cartes_actives), 0),
        'cartes_total',   coalesce(sum(cartes_total), 0),
        'mises',          coalesce(sum(nb_mises), 0),
        'total_encaisse', coalesce(sum(encaisse), 0),
        'commissions',    coalesce(sum(commissions), 0),
        'restitutions',   coalesce(sum(restitutions), 0),
        'encours_clients', coalesce(sum(du_aux_clients), 0) - coalesce(sum(restitutions), 0)
      )
      from par_collecteur
    ),

    'zones', coalesce((
      select jsonb_agg(x order by x->>'zone')
      from (
        select jsonb_build_object(
                 'zone',        coalesce(zone, 'Sans zone'),
                 'collecteurs', count(*),
                 'clients',     coalesce(sum(clients), 0),
                 'encaisse',    coalesce(sum(encaisse), 0)
               ) as x
        from par_collecteur
        group by coalesce(zone, 'Sans zone')
      ) s
    ), '[]'::jsonb),

    'collecteurs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',                  id,
          'nom',                 nom,
          'telephone',           telephone,
          'zone',                zone,
          -- Le rattachement, visible dans la liste : un collaborateur apparaît
          -- sous son titulaire, et le MRR ne le compte pas. Sans cette colonne,
          -- l'administration voit quatre comptes Illimité et un seul
          -- abonnement, sans le lien qui explique pourquoi.
          'titulaire_id',        titulaire_id,
          'titulaire_nom',       titulaire_nom,
          'palier',              palier,
          'abonnement_statut',   abonnement_statut,
          'abonnement_echeance', abonnement_echeance,
          'cree_le',             cree_le,
          'clients',             clients,
          'cartes_actives',      cartes_actives,
          'encaisse',            encaisse,
          'commissions',         commissions,
          'restitutions',        restitutions,
          'encours',             du_aux_clients - restitutions
        )
        order by encaisse desc, nom
      )
      from par_collecteur
    ), '[]'::jsonb),

    'mouvements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'type',          type,
          'client',        client,
          'collecteur_id', collecteur_id,
          'collecteur',    collecteur,
          'montant',    montant,
          'survenu_le', survenu_le
        )
        order by survenu_le desc
      )
      from derniers
    ), '[]'::jsonb),

    'cartes_total_lignes', (select count(*) from par_carte),

    'cartes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',                id,
          'client',            client,
          'collecteur_id',     collecteur_id,
          'collecteur',        collecteur,
          'mise',              mise,
          'mises_encaissees',  mises_encaissees,
          'statut',            statut,
          'ouverte_le',        ouverte_le,
          'solde_restituable', solde_restituable,
          'restitue',          restitue,
          -- Ce qui reste dû sur cette carte : nul dès que la restitution a eu
          -- lieu, puisque `retraits` solde la carte en une fois.
          'encours',           case when restitue > 0 then 0 else solde_restituable end
        )
        order by ouverte_le desc
      )
      from (select * from par_carte order by ouverte_le desc limit 500) borne
    ), '[]'::jsonb)
  );
$function$;
```

Puis, dans le même fichier, `admin_tendances` :

```sql
-- ---------------------------------------------------------------------------
-- 2. Les tendances du tableau de bord
-- ---------------------------------------------------------------------------
create or replace function public.admin_tendances(p_jours integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_fin              date;
  v_debut            date;
  v_debut_precedent  date;
  v_depuis           date;
  v_debut_serie      date;
  v_resultat         jsonb;
begin
  if p_jours is null or p_jours < 1 or p_jours > 90 then
    raise exception 'PERIODE_INVALIDE : p_jours doit tenir entre 1 et 90, reçu %.', p_jours
      using errcode = '22023';
  end if;

  v_fin             := (now() at time zone 'Africa/Abidjan')::date;
  v_debut           := v_fin - (p_jours - 1);
  v_debut_precedent := v_debut - p_jours;

  select min((survenu_le at time zone 'Africa/Abidjan')::date) into v_depuis
    from public.mouvements where sens = 1;
  -- Quatre-vingt-dix jours de fond de courbe, jamais avant le premier versement.
  v_debut_serie := greatest(coalesce(v_depuis, v_fin), v_fin - 89);

  with
  entrees_jour as (
    select
      (mv.survenu_le at time zone 'Africa/Abidjan')::date             as jour,
      mv.collecteur_id,
      mv.montant,
      mv.est_commission
    from public.mouvements mv
    where mv.sens = 1
  ),
  sorties_jour as (
    select
      (mv.survenu_le at time zone 'Africa/Abidjan')::date             as jour,
      mv.collecteur_id,
      mv.montant
    from public.mouvements mv
    where mv.nature = 'retrait'
  ),
  flux as (
    select
      coalesce(sum(montant), 0)                                      as encaisse,
      coalesce(sum(montant) filter (where est_commission), 0)        as commissions,
      count(*)                                                       as mises
    from entrees_jour
    where jour between v_debut and v_fin
  ),
  flux_retraits as (
    select coalesce(sum(montant), 0) as restitutions, count(*) as retraits
    from sorties_jour
    where jour between v_debut and v_fin
  ),
  flux_p as (
    select
      coalesce(sum(montant), 0)                                      as encaisse,
      coalesce(sum(montant) filter (where est_commission), 0)        as commissions,
      count(*)                                                       as mises
    from entrees_jour
    where jour between v_debut_precedent and v_debut - 1
  ),
  flux_p_retraits as (
    select coalesce(sum(montant), 0) as restitutions, count(*) as retraits
    from sorties_jour
    where jour between v_debut_precedent and v_debut - 1
  ),
  -- Un point par jour, jours creux compris. `generate_series` veut des
  -- horodatages : une borne en `date` ne correspond à aucune de ses signatures.
  serie as (
    select
      j::date                                                        as jour,
      coalesce(sum(m.montant), 0)                                    as encaisse,
      coalesce(sum(m.montant) filter (where m.est_commission), 0)    as commissions,
      count(m.montant)                                               as mises,
      coalesce((
        select sum(r.montant) from sorties_jour r where r.jour = j::date
      ), 0)                                                          as restitutions
    from generate_series(v_debut_serie::timestamp, v_fin::timestamp, interval '1 day') as j
    left join entrees_jour m on m.jour = j::date
    group by j
  ),
  zones as (
    select
      coalesce(c.zone, 'Sans zone')                                  as zone,
      coalesce(sum(m.montant), 0)                                    as encaisse,
      count(m.montant)                                               as mises,
      count(distinct c.id)                                           as collecteurs
    from public.collecteurs c
    left join entrees_jour m
      on m.collecteur_id = c.id and m.jour between v_debut and v_fin
    group by coalesce(c.zone, 'Sans zone')
  ),
  derniers as (
    select
      case
        when mv.nature = 'retrait' then 'restitution'
        when mv.est_commission     then 'commission'
        else mv.nature
      end                                                            as type,
      cl.nom                                                         as client,
      col.id                                                         as collecteur_id,
      col.nom                                                        as collecteur,
      mv.sens * mv.montant                                           as montant,
      mv.survenu_le                                                  as survenu_le
    from public.mouvements mv
    join public.clients     cl  on cl.id  = mv.client_id
    join public.collecteurs col on col.id = mv.collecteur_id
    where (mv.survenu_le at time zone 'Africa/Abidjan')::date between v_debut and v_fin
  ),
  dernier_versement as (
    select collecteur_id, max((survenu_le at time zone 'Africa/Abidjan')::date) as jour
    from public.mouvements
    where sens = 1
    group by collecteur_id
  )
  select jsonb_build_object(
    'periode', jsonb_build_object('jours', p_jours, 'debut', v_debut, 'fin', v_fin),
    'depuis',  v_depuis,

    'flux', (
      select jsonb_build_object(
        'encaisse',     f.encaisse,
        'commissions',  f.commissions,
        'mises',        f.mises,
        'restitutions', fr.restitutions,
        'retraits',     fr.retraits
      )
      from flux f, flux_retraits fr
    ),

    'flux_precedent', (
      select jsonb_build_object(
        'encaisse',     f.encaisse,
        'commissions',  f.commissions,
        'mises',        f.mises,
        'restitutions', fr.restitutions,
        'retraits',     fr.retraits
      )
      from flux_p f, flux_p_retraits fr
    ),

    'serie', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'jour',         jour,
          'encaisse',     encaisse,
          'commissions',  commissions,
          'restitutions', restitutions,
          'mises',        mises
        )
        order by jour
      )
      from serie
    ), '[]'::jsonb),

    'zones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'zone',        zone,
          'encaisse',    encaisse,
          'mises',       mises,
          'collecteurs', collecteurs
        )
        order by encaisse desc, zone
      )
      from zones
    ), '[]'::jsonb),

    'mouvements_total', (select count(*) from derniers),

    'mouvements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'type',          type,
          'client',        client,
          'collecteur_id', collecteur_id,
          'collecteur',    collecteur,
          'montant',       montant,
          'survenu_le',    survenu_le
        )
        order by survenu_le desc
      )
      from (select * from derniers order by survenu_le desc limit 200) borne
    ), '[]'::jsonb),

    'collecteurs_sans_mise', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',            c.id,
          'nom',           c.nom,
          'zone',          c.zone,
          'derniere_mise', d.jour,
          'jours_sans',    coalesce(v_fin - d.jour, v_fin - c.cree_le::date)
        )
        order by d.jour nulls first, c.nom
      )
      from public.collecteurs c
      left join dernier_versement d on d.collecteur_id = c.id
      where c.abonnement_statut = 'actif'
        -- Un collecteur inscrit ce matin n'a pas décroché : il n'a pas encore
        -- commencé. Sans cette seconde borne, tout compte neuf entrait dans la
        -- liste avec « jamais » et zéro jour de silence — et l'écran aurait
        -- annoncé un abandon le jour d'une inscription.
        and (
          case when d.jour is null then c.cree_le::date else d.jour end < v_fin - 7
        )
    ), '[]'::jsonb)
  )
  into v_resultat;

  return v_resultat;
end;
$fn$;

alter function public.admin_tendances(integer) owner to postgres;

comment on function public.admin_tendances(integer) is
  'Flux datés du tableau de bord Admin : période glissante, période précédente, série quotidienne, zones, mouvements bornés à 200, collecteurs sans mise. Lus dans le registre des mouvements. Réservée à service_role ; est_admin() est contrôlé dans l''Edge Function appelante.';

revoke all on function public.admin_tendances(integer) from public;
revoke all on function public.admin_tendances(integer) from anon;
revoke all on function public.admin_tendances(integer) from authenticated;
grant execute on function public.admin_tendances(integer) to service_role;
```

Puis `equipe_vue` :

```sql
-- ---------------------------------------------------------------------------
-- 3. L'équipe d'un titulaire
-- ---------------------------------------------------------------------------
create or replace function public.equipe_vue()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with membres as (
    select c.id, c.nom, c.telephone
      from public.collecteurs c
     where c.titulaire_id = (select auth.uid())
  ),
  entrees_par as (
    select mv.collecteur_id,
           coalesce(sum(mv.montant) filter (where not mv.est_commission), 0) as du_aux_clients,
           coalesce(sum(mv.montant) filter (where mv.est_commission), 0)     as commissions
      from public.mouvements mv
      join membres b on b.id = mv.collecteur_id
     where mv.sens = 1
     group by mv.collecteur_id
  ),
  sorties_par as (
    select mv.collecteur_id, coalesce(sum(mv.montant), 0) as restitutions
      from public.mouvements mv
      join membres b on b.id = mv.collecteur_id
     where mv.nature = 'retrait'
     group by mv.collecteur_id
  ),
  clients_par as (
    select cl.collecteur_id, count(*) as clients
      from public.clients cl
      join membres b on b.id = cl.collecteur_id
     group by cl.collecteur_id
  ),
  cartes_par as (
    select ca.collecteur_id, count(*) filter (where ca.statut = 'active') as cartes_actives
      from public.cartes ca
      join membres b on b.id = ca.collecteur_id
     group by ca.collecteur_id
  ),
  -- La caisse du jour se lit sur `caisses_jour`, et non par un appel à
  -- `cash_attendu_du_jour` : la ligne du jour n'existe qu'une fois la caisse
  -- déclarée, et son absence est une information — « il n'a pas encore compté ».
  -- La fabriquer ici afficherait un attendu sans déclaré, c'est-à-dire un écart
  -- qui n'existe pas.
  caisse_du_jour as (
    select cj.collecteur_id, cj.cash_attendu, cj.cash_declare, cj.ecart, cj.date
      from public.caisses_jour cj
      join membres b on b.id = cj.collecteur_id
     where cj.date = (now() at time zone 'UTC')::date
  )
  select coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'id',                   b.id,
         'nom',                  b.nom,
         'telephone',            b.telephone,
         'clients',              coalesce(cl.clients, 0),
         'cartes_actives',       coalesce(ca.cartes_actives, 0),
         'encours',              coalesce(m.du_aux_clients, 0) - coalesce(r.restitutions, 0),
         -- Les commissions du collaborateur reviennent au titulaire : c'est pour
         -- cela que la ligne figure ici, et qu'elle a disparu du Bilan du
         -- collaborateur.
         'commissions',          coalesce(m.commissions, 0),
         'cash_attendu',         k.cash_attendu,
         'cash_declare',         k.cash_declare,
         'ecart',                k.ecart,
         'derniere_declaration', k.date
       ) order by b.nom)
       from membres b
       left join clients_par  cl on cl.collecteur_id = b.id
       left join cartes_par   ca on ca.collecteur_id = b.id
       left join entrees_par  m  on m.collecteur_id  = b.id
       left join sorties_par  r  on r.collecteur_id  = b.id
       left join caisse_du_jour k on k.collecteur_id = b.id),
    '[]'::jsonb);
$fn$;

comment on function public.equipe_vue() is
  'Les collaborateurs de l''appelant, avec leurs totaux et leur caisse du jour. '
  'Sans paramètre : l''identité vient de auth.uid(), donc on ne peut pas demander l''équipe d''autrui. '
  'Tableau vide si l''appelant n''est pas titulaire — ne pas avoir d''équipe est un état normal.';

revoke all on function public.equipe_vue() from public, anon;
grant execute on function public.equipe_vue() to authenticated;

-- ---------------------------------------------------------------- Garde-fous
do $garde$
declare
  ouverte boolean;
begin
  -- Les garde-fous des migrations dont ces fonctions sont reprises, rejoués :
  -- une recopie qui perdrait l'un d'eux ne dirait rien d'elle-même.
  if position('titulaire_nom' in
       pg_get_functiondef('public.admin_vue_globale()'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : l''administration ne voit pas le rattachement.';
  end if;

  if position('titulaire_id is null' in
       pg_get_functiondef('public.admin_vue_globale()'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : la recopie a perdu le filtre du MRR.';
  end if;

  select has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute')
    into ouverte
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_tendances';

  if ouverte then
    raise exception
      'GARDE_FOU : admin_tendances() est exécutable par anon ou authenticated.';
  end if;

  if has_function_privilege('anon', 'public.equipe_vue()', 'execute') then
    raise exception 'GARDE_FOU : equipe_vue est exécutable par anon.';
  end if;
  if not has_function_privilege('authenticated', 'public.equipe_vue()', 'execute') then
    raise exception 'GARDE_FOU : equipe_vue n''est exécutable par personne.';
  end if;

  -- Et le contrôle propre à cette migration : les trois lisent le registre, et
  -- aucune ne lit plus les tables d'argent en direct.
  if (select count(*) from unnest(array[
        'public.admin_vue_globale()',
        'public.admin_tendances(integer)',
        'public.equipe_vue()'
      ]) as f
      where position('public.mouvements' in pg_get_functiondef(f::regprocedure)) = 0) > 0 then
    raise exception 'GARDE_FOU : un lecteur de l''administration ne lit pas le registre.';
  end if;
end
$garde$;
```

- [ ] **Étape 4 : appliquer et voir vert**

```bash
npx supabase migration up --local
npm run test:db -- lecteurs-admin-piege
```
Attendu : 4 vertes.

- [ ] **Étape 5 : vérifier que les chiffres d'avant n'ont pas bougé**

Run : `npm run test:db -- "vue-globale|tendances|collaborateurs|cash-equipe|mrr-remises|reglages-admin|sante-systeme"`
Attendu : toutes vertes, **sans qu'un chiffre attendu ait été modifié**.

- [ ] **Étape 6 : le type d'un mouvement, côté administration**

Dans `apps/admin/src/donnees.ts`, remplacer :

```ts
export interface Mouvement {
  type: 'mise' | 'commission' | 'restitution';
```

par :

```ts
export interface Mouvement {
  /** `rattrapage` : une mise refusée par le serveur, enregistrée comme dette.
      Le libellé et le filtre de l'écran arrivent avec le chantier du
      rattrapage ; jusque-là, l'administration l'affiche comme une mise. */
  type: 'mise' | 'commission' | 'restitution' | 'rattrapage';
```

- [ ] **Étape 7 : typer, lancer la suite de l'administration, commiter**

```bash
npx tsc -b apps/admin
npm run test -w @kolek/admin
npm run verifier:lint
git add supabase/migrations/20260915120000_lecteurs_admin_mouvements.sql supabase/tests/lecteurs-admin-piege.test.ts apps/admin/src/donnees.ts
git commit -m "feat(base): l'administration et l'equipe lisent le registre" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 5 : les quatre lectures en ligne du collecteur

**Fichiers :**
- Modifier : `apps/collecteur/src/lectures-ecrans.ts` (`chargerBilan`, `chargerRecus`, `chargerAlertes`, `chargerHistoriqueCarte`)
- Modifier : `apps/collecteur/src/lectures-ecrans.test.ts` (les jeux d'essai passent de `mises` à `mouvements`)
- Créer : `supabase/tests/lectures-collecteur-piege.test.ts`

**Interfaces :**
- Consomme : la vue `public.mouvements`, `supabase/tests/jeu-piege.ts`.
- Produit : `Recu` gagne `nature: 'mise' | 'rattrapage'` ; `EvenementCarte.genre` accepte `'rattrapage'`. Les autres champs, et tous les libellés d'écran, sont inchangés.

- [ ] **Étape 1 : écrire l'épreuve contre la vraie base**

Créer `supabase/tests/lectures-collecteur-piege.test.ts` :

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';
import { ATTENDU_PIEGE, MISE_PIEGE, jourUtc, poserJeuPiege, poserRattrapage, poserRefus, type JeuPiege } from './jeu-piege';

/**
 * Les lectures en ligne du collecteur, sur le jeu piégé, avec la session d'un
 * vrai collecteur et les vraies politiques RLS.
 *
 * Le module client est remplacé par un accesseur qui rend le client authentifié
 * du harnais : recopier les requêtes dans l'épreuve aurait été plus simple et
 * n'aurait rien prouvé.
 */

const etat = vi.hoisted(() => ({ client: null as { from: unknown } | null }));

vi.mock('../../apps/collecteur/src/supabase', () => ({
  get supabase() {
    if (!etat.client) throw new Error('Client de test non posé — voir beforeAll.');
    return etat.client;
  },
}));

const { chargerAlertes, chargerBilan, chargerHistoriqueCarte, chargerRecus } = await import(
  '../../apps/collecteur/src/lectures-ecrans'
);

afterAll(nettoyer);

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
function telephone(): string {
  compteur += 1;
  return `+225${SERIE}${String(compteur).padStart(2, '0')}`;
}

let c: CollecteurTest;
let jeu: JeuPiege;

beforeAll(async () => {
  c = await creerCollecteur('Lectures piégées', telephone());
  etat.client = c.client as unknown as { from: unknown };
  jeu = await poserJeuPiege(c);
});

describe('le bilan', () => {
  it('compte le rattrapage dans les trente derniers jours', async () => {
    const bilan = await chargerBilan();
    const trente = bilan.tranches.find((t) => t.libelle === '30 derniers jours');

    expect(trente).toMatchObject({
      encaisse: ATTENDU_PIEGE.encaisse,
      commissions: ATTENDU_PIEGE.commissions,
      nombreMises: ATTENDU_PIEGE.versements,
      restitue: ATTENDU_PIEGE.restitue,
    });
  });
});

describe('les reçus', () => {
  it('rend les trente-et-un versements, dont le rattrapage', async () => {
    const recus = await chargerRecus();

    expect(recus).toHaveLength(ATTENDU_PIEGE.versements);
    expect(recus.reduce((somme, r) => somme + r.montant, 0)).toBe(ATTENDU_PIEGE.encaisse);
    expect(recus.filter((r) => r.nature === 'rattrapage')).toEqual([
      expect.objectContaining({ id: jeu.rattrapageId, montant: MISE_PIEGE, estCommission: false }),
    ]);
  });
});

describe('l’historique d’une carte', () => {
  it('mêle les mises, le retrait et le rattrapage, du plus récent au plus ancien', async () => {
    const evenements = await chargerHistoriqueCarte(jeu.carteId);

    expect(evenements).toHaveLength(32);
    expect(evenements.filter((e) => e.genre === 'rattrapage')).toEqual([
      expect.objectContaining({ id: jeu.rattrapageId, montant: MISE_PIEGE }),
    ]);
    expect(evenements.find((e) => e.genre === 'retrait')?.montant).toBe(ATTENDU_PIEGE.restitue);

    const dates = evenements.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe('les alertes', () => {
  it('ne dit pas endormie une carte dont le dernier versement est un rattrapage', async () => {
    const dormeur = await creerCollecteur('Alertes piégées', telephone());
    etat.client = dormeur.client as unknown as { from: unknown };

    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    await admin.from('clients').insert({ id: clientId, collecteur_id: dormeur.id, nom: 'Cliente alerte' });
    await admin
      .from('cartes')
      .insert({ id: carteId, collecteur_id: dormeur.id, client_id: clientId, mise: MISE_PIEGE });
    await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: dormeur.id,
      carte_id: carteId,
      montant: MISE_PIEGE,
      encaisse_le: `${jourUtc(10)}T09:00:00Z`,
    });

    const hier = jourUtc(1);
    const rejetId = await poserRefus(dormeur, { carteId, jour: hier });
    await poserRattrapage(dormeur, { clientId, carteId, rejetId, jour: hier });

    const alertes = await chargerAlertes();

    // Le client a versé hier : la carte n'est pas endormie, même si le serveur
    // a refusé ce versement-là.
    expect(alertes.find((a) => a.cle === `dormante-${carteId}`)).toBeUndefined();

    etat.client = c.client as unknown as { from: unknown };
  });
});
```

- [ ] **Étape 2 : lancer l'épreuve et la voir rouge**

Run : `npm run test:db -- lectures-collecteur-piege`
Attendu : ÉCHEC — `encaisse: 30000`, 30 reçus, 31 événements, et une alerte `dormante-…` présente.

- [ ] **Étape 3 : `chargerBilan` lit le registre**

Dans `apps/collecteur/src/lectures-ecrans.ts`, remplacer l'import de tête :

```ts
import type { Carte, MiseRecente } from './lectures';
```

par :

```ts
import type { Carte } from './lectures';
```

Puis remplacer le corps de `chargerBilan`, depuis `const depuis = ilYA(30).toISOString();` jusqu'à la fin de la fonction, par :

```ts
  const depuis = ilYA(30).toISOString();

  // ## Pourquoi ces trois lectures épuisent leurs pages
  //
  // PostgREST applique `max_rows = 1000` sans erreur ni en-tête. Le bilan
  // **somme de l'argent** : une troncature ne casse rien visiblement, elle rend
  // un total plus petit que la réalité, et le collecteur n'a aucun moyen de
  // s'en apercevoir.
  //
  // Le cas n'est pas théorique. Trente jours à cinquante encaissements par jour
  // font mille cinq cents lignes de mouvements : au-delà du millier, « encaissé
  // sur 30 jours » se met à mentir vers le bas. `cartes` et `clients` sont,
  // elles, sans borne de date et grandissent avec l'ancienneté du collecteur.
  //
  // `order('id')` avant `range` : une pagination sur un ordre non total peut
  // rendre deux fois la même ligne et en sauter une autre.
  const [rMouvements, rCartes, rClients] = await Promise.all([
    chargerTout((debut, fin) =>
      supabase
        .from('mouvements')
        .select('nature, sens, montant, est_commission, survenu_le')
        .gte('survenu_le', depuis)
        .order('id')
        .range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase
        .from('cartes')
        .select('id, mise, statut, mises_encaissees, ouverte_le, cloturee_le')
        .order('id')
        .range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase.from('clients').select('id').order('id').range(debut, fin),
    ),
  ]);

  const mouvements = (rMouvements.data ?? []) as Array<{
    nature: string;
    sens: number;
    montant: number;
    est_commission: boolean;
    survenu_le: string;
  }>;
  const cartes = (rCartes.data ?? []) as Array<{
    id: string;
    mise: number;
    statut: 'active' | 'cloturee';
    mises_encaissees: number;
    ouverte_le: string;
    cloturee_le: string | null;
  }>;

  const bornes: Array<[string, number]> = [
    ['Aujourd’hui', 0],
    ['7 derniers jours', 6],
    ['30 derniers jours', 29],
  ];

  const tranches = bornes.map(([libelle, recul]) => {
    const seuil = ilYA(recul).getTime();
    const dedans = (quand: string) => new Date(quand).getTime() >= seuil;
    const retenus = mouvements.filter((m) => dedans(m.survenu_le));
    // Les entrées : mises et rattrapages. Un rattrapage est de l'argent
    // réellement encaissé — une mise que le serveur a refusée.
    const entrees = retenus.filter((m) => m.sens === 1);

    return {
      libelle,
      encaisse: entrees.reduce((t, m) => t + m.montant, 0),
      commissions: entrees.filter((m) => m.est_commission).reduce((t, m) => t + m.montant, 0),
      nombreMises: entrees.length,
      cartesOuvertes: cartes.filter((c) => dedans(c.ouverte_le)).length,
      cartesCloturees: cartes.filter((c) => c.cloturee_le !== null && dedans(c.cloturee_le)).length,
      // Les retraits seuls : une sortie de caisse n'est pas toujours une
      // restitution de carte.
      restitue: retenus
        .filter((m) => m.nature === 'retrait')
        .reduce((t, m) => t + m.montant, 0),
    };
  });

  const actives = cartes.filter((c) => c.statut === 'active');

  return {
    tranches,
    encoursTotal: actives.reduce((t, c) => t + soldeRestituable(c.mises_encaissees, c.mise), 0),
    clients: (rClients.data ?? []).length,
    cartesActives: actives.length,
  };
}
```

- [ ] **Étape 4 : `chargerRecus` lit le registre**

Dans la même fiche, ajouter le champ à l'interface `Recu` :

```ts
export interface Recu {
  id: string;
  clientNom: string;
  montant: number;
  estCommission: boolean;
  encaisseLe: string;
  /** Mise du carnet : permet de vérifier qu'on a encaissé le bon montant. */
  mise: number;
  /** `rattrapage` : une mise que le serveur a refusée, enregistrée comme dette. */
  nature: 'mise' | 'rattrapage';
}
```

Puis remplacer le corps de `chargerRecus`, de `const [rMises, rCartes, rClients] = await Promise.all([` à la fin de la fonction, par :

```ts
  const [rVersements, rCartes, rClients] = await Promise.all([
    supabase
      .from('mouvements')
      .select('id, nature, carte_id, montant, est_commission, survenu_le')
      .eq('sens', 1)
      .order('survenu_le', { ascending: false })
      .limit(limite),
    // Cartes et clients servent à nommer les reçus : coupés, un reçu récent
    // s'afficherait « Client inconnu », à une mise de 0. Voir `chargerBilan`.
    chargerTout((debut, fin) =>
      supabase.from('cartes').select('id, client_id, mise').order('id').range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase.from('clients').select('id, nom').order('id').range(debut, fin),
    ),
  ]);

  const cartes = new Map(
    ((rCartes.data ?? []) as Array<{ id: string; client_id: string; mise: number }>).map((c) => [
      c.id,
      c,
    ]),
  );
  const noms = new Map(
    ((rClients.data ?? []) as Array<{ id: string; nom: string }>).map((c) => [c.id, c.nom]),
  );

  return (
    (rVersements.data ?? []) as Array<{
      id: string;
      nature: 'mise' | 'rattrapage';
      carte_id: string;
      montant: number;
      est_commission: boolean;
      survenu_le: string;
    }>
  ).map((m) => {
    const carte = cartes.get(m.carte_id);
    return {
      id: m.id,
      clientNom: (carte ? noms.get(carte.client_id) : undefined) ?? 'Client inconnu',
      montant: m.montant,
      estCommission: m.est_commission,
      encaisseLe: m.survenu_le,
      mise: carte?.mise ?? 0,
      nature: m.nature,
    };
  });
}
```

- [ ] **Étape 5 : `chargerAlertes` lit le registre**

Toujours dans `lectures-ecrans.ts`, dans `chargerAlertes`, remplacer la troisième lecture du `Promise.all` :

```ts
    chargerTout((debut, fin) =>
      supabase
        .from('mises')
        .select('carte_id, encaisse_le')
        .gte('encaisse_le', fenetre)
        .order('encaisse_le', { ascending: false })
        .order('id')
        .range(debut, fin),
    ),
```

par :

```ts
    chargerTout((debut, fin) =>
      supabase
        .from('mouvements')
        .select('carte_id, survenu_le')
        .eq('sens', 1)
        .gte('survenu_le', fenetre)
        .order('survenu_le', { ascending: false })
        .order('id')
        .range(debut, fin),
    ),
```

et, quelques lignes plus bas, la construction de la carte des derniers versements :

```ts
  /** Dernière mise connue par carte. La liste arrive déjà triée décroissante. */
  const derniereMise = new Map<string, string>();
  for (const m of (rMises.data ?? []) as Array<{ carte_id: string; encaisse_le: string }>) {
    if (!derniereMise.has(m.carte_id)) derniereMise.set(m.carte_id, m.encaisse_le);
  }
```

par :

```ts
  /** Dernier versement connu par carte — mise ou rattrapage. La liste arrive
      déjà triée décroissante. */
  const derniereMise = new Map<string, string>();
  for (const m of (rMises.data ?? []) as Array<{ carte_id: string; survenu_le: string }>) {
    if (!derniereMise.has(m.carte_id)) derniereMise.set(m.carte_id, m.survenu_le);
  }
```

Le nom de la variable `rMises` du `Promise.all` reste : c'est la troisième du tableau déstructuré, et le renommer n'apporterait rien aux libellés.

- [ ] **Étape 6 : `chargerHistoriqueCarte` lit le registre**

Remplacer le type et la fonction :

```ts
export interface EvenementCarte {
  id: string;
  genre: 'mise' | 'retrait' | 'rattrapage';
  /** Pour une mise ou un rattrapage, le montant versé. Pour un retrait, ce qui
      a été rendu. */
  montant: number;
  /** ISO 8601, tel que la base l'a écrit. */
  date: string;
  /** La seule mise que la base a marquée commission. Toujours faux ailleurs. */
  estCommission: boolean;
}
```

et :

```ts
export async function chargerHistoriqueCarte(carteId: string): Promise<EvenementCarte[]> {
  const { data, error } = await supabase
    .from('mouvements')
    .select('id, nature, montant, survenu_le, est_commission')
    .eq('carte_id', carteId)
    .order('survenu_le', { ascending: false });

  if (error) throw error;

  const evenements: EvenementCarte[] = (
    (data ?? []) as Array<{
      id: string;
      nature: EvenementCarte['genre'];
      montant: number;
      survenu_le: string;
      est_commission: boolean;
    }>
  ).map((m) => ({
    id: String(m.id),
    genre: m.nature,
    montant: Number(m.montant),
    date: String(m.survenu_le),
    estCommission: Boolean(m.est_commission),
  }));

  // Les dates sont des ISO 8601 en UTC, donc l'ordre lexicographique est
  // l'ordre chronologique — c'est ce que garantit le format, pas une chance.
  //
  // Le comparateur rend bien `0` sur l'égalité. Un `a.date < b.date ? 1 : -1`
  // dirait « a avant b » **et** « b avant a » pour deux horodatages identiques,
  // et deux mises encaissées dans la même seconde est un cas ordinaire au
  // marché.
  return evenements.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
```

Dans le commentaire de tête de la fonction, remplacer la phrase de bornage — « Trente-deux lignes, pour toujours. » — par : « Trente-et-une mises, un retrait, et un rattrapage par refus : quelques dizaines de lignes, bornées par le cycle. »

- [ ] **Étape 7 : mettre les jeux d'essai de l'épreuve de source à la table `mouvements`**

Dans `apps/collecteur/src/lectures-ecrans.test.ts`, trois jeux d'essai nomment la table `mises`. Ils passent à `mouvements` **sans changer un seul chiffre attendu** :

```ts
      mises: [{ id: 'm1', carte_id: 'k1', encaisse_le: MAINTENANT }],
```
devient
```ts
      mouvements: [{ id: 'm1', sens: 1, carte_id: 'k1', survenu_le: MAINTENANT }],
```

```ts
      mises: [
        ...Array.from({ length: 1000 }, (_, i) => ({
          id: `m${rang(i)}`,
          carte_id: 'k1',
          encaisse_le: '2026-09-11T09:00:00.000Z',
        })),
        { id: 'm1000', carte_id: 'k2', encaisse_le: '2026-09-10T09:00:00.000Z' },
      ],
```
devient
```ts
      mouvements: [
        ...Array.from({ length: 1000 }, (_, i) => ({
          id: `m${rang(i)}`,
          sens: 1,
          carte_id: 'k1',
          survenu_le: '2026-09-11T09:00:00.000Z',
        })),
        { id: 'm1000', sens: 1, carte_id: 'k2', survenu_le: '2026-09-10T09:00:00.000Z' },
      ],
```

```ts
    tables = { clients, cartes, mises: [] };
```
devient
```ts
    tables = { clients, cartes, mouvements: [] };
```

```ts
      mises: [
        { id: 'm1', carte_id: 'k1000', montant: 500, est_commission: false, encaisse_le: MAINTENANT },
      ],
```
devient
```ts
      mouvements: [
        {
          id: 'm1',
          nature: 'mise',
          sens: 1,
          carte_id: 'k1000',
          montant: 500,
          est_commission: false,
          survenu_le: MAINTENANT,
        },
      ],
```

- [ ] **Étape 8 : lancer les deux suites et les voir vertes**

```bash
npm run test -w @kolek/collecteur -- src/lectures-ecrans.test.ts
npm run test:db -- lectures-collecteur-piege
node -e "const s=require('fs').readFileSync('apps/collecteur/src/lectures-ecrans.test.ts','utf8');console.log('insecables', s.split(String.fromCharCode(160)).length-1)"
```
Attendu : vertes des deux côtés, et `insecables 1`.

- [ ] **Étape 9 : la suite complète du collecteur, et l'historique contre la vraie base**

```bash
npm run test -w @kolek/collecteur
npm run test:db -- "historique-carte|lectures-paginees"
npx tsc -b apps/collecteur
```
Attendu : toutes vertes, **sans qu'un chiffre attendu ait été modifié**.

- [ ] **Étape 10 : commiter**

```bash
npm run verifier:lint
git add apps/collecteur/src/lectures-ecrans.ts apps/collecteur/src/lectures-ecrans.test.ts supabase/tests/lectures-collecteur-piege.test.ts
git commit -m "feat(collecteur): les lectures en ligne passent par le registre" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 6 : les calculs du téléphone

**Fichiers :**
- Modifier : `apps/collecteur/src/hors-ligne/vues.ts` (`tableauDepuis`, `ficheDepuis`, `recompterAttendu`)

**Interfaces :**
- Consomme : `mouvementsDepuis`, `versementsDe`, `argentTenu` de `@kolek/core` (tâche 1).
- Produit : rien de nouveau. Les trois vues rendent exactement la même forme qu'avant.

C'est un remaniement : aucune épreuve nouvelle, et **aucune épreuve existante ne change**. Elles sont vertes avant, elles sont vertes après — c'est tout ce que cette tâche doit prouver.

- [ ] **Étape 1 : relever le point de départ**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts`
Attendu : vertes. Noter le nombre.

- [ ] **Étape 2 : importer la règle partagée**

Dans `apps/collecteur/src/hors-ligne/vues.ts`, remplacer la première ligne :

```ts
import { formatMontant, soldeRestituable } from '@kolek/core';
```

par :

```ts
import { argentTenu, formatMontant, mouvementsDepuis, soldeRestituable, versementsDe } from '@kolek/core';
```

- [ ] **Étape 3 : poser le registre local**

Juste après la fonction `plusRecentDabord`, ajouter :

```ts
/**
 * Le registre de la tournée : la règle de la vue `mouvements`, appliquée aux
 * lignes brutes du téléphone.
 *
 * La tournée ne porte aucun rattrapage aujourd'hui — le geste qui en crée
 * appartient au chantier suivant, et le rechargement ne les copie pas encore.
 * La liste vide est donc exacte, et c'est le seul endroit à changer le jour où
 * elle ne le sera plus.
 */
function registreDe(t: Tournee) {
  return mouvementsDepuis({ mises: t.mises, retraits: t.retraits, rattrapages: [] });
}
```

- [ ] **Étape 4 : l'accueil**

Dans `tableauDepuis`, remplacer le calcul de `encaisseAujourdhui` :

```ts
  const encaisseAujourdhui = t.mises
    .filter((m) => Date.parse(m.encaisseLe) >= minuit.getTime())
    .reduce((somme, m) => somme + m.montant, 0);
```

par :

```ts
  const versements = versementsDe(registreDe(t));
  const encaisseAujourdhui = versements
    .filter((m) => Date.parse(m.survenuLe) >= minuit.getTime())
    .reduce((somme, m) => somme + m.montant, 0);
```

et, plus bas dans la même fonction, la liste `dernieres` :

```ts
    dernieres: [...t.mises]
      .sort((a, b) => plusRecentDabord(a.encaisseLe, b.encaisseLe) || parId(a, b))
      .slice(0, 5)
      .map((m) => {
        const carte = cartes.get(m.carteId);
        return {
          nom: (carte && noms.get(carte.clientId)) ?? 'Client',
          montant: m.montant,
          estCommission: m.estCommission,
          quand: m.encaisseLe,
        };
      }),
```

par :

```ts
    dernieres: [...versements]
      .sort((a, b) => plusRecentDabord(a.survenuLe, b.survenuLe) || parId(a, b))
      .slice(0, 5)
      .map((m) => {
        const carte = cartes.get(m.carteId);
        return {
          nom: (carte && noms.get(carte.clientId)) ?? 'Client',
          montant: m.montant,
          estCommission: m.estCommission,
          quand: m.survenuLe,
        };
      }),
```

- [ ] **Étape 5 : la fiche**

Dans `ficheDepuis`, remplacer la liste `mises` :

```ts
    mises: t.mises
      .filter((m) => siennes.has(m.carteId))
      .sort((a, b) => plusRecentDabord(a.encaisseLe, b.encaisseLe) || parId(a, b))
      .slice(0, MISES_SUR_FICHE)
      .map((m) => ({
        id: m.id,
        montant: m.montant,
        encaisseLe: m.encaisseLe,
        estCommission: m.estCommission,
      })),
```

par :

```ts
    mises: versementsDe(registreDe(t))
      .filter((m) => siennes.has(m.carteId))
      .sort((a, b) => plusRecentDabord(a.survenuLe, b.survenuLe) || parId(a, b))
      .slice(0, MISES_SUR_FICHE)
      .map((m) => ({
        id: m.id,
        montant: m.montant,
        encaisseLe: m.survenuLe,
        estCommission: m.estCommission,
      })),
```

- [ ] **Étape 6 : le recompte de la caisse**

Remplacer `recompterAttendu` en entier :

```ts
/** Ce qui est passé par cette main aujourd'hui : entrées moins sorties. */
function recompterAttendu(t: Tournee, collecteurId: string, duJour: (iso: string) => boolean): number {
  return argentTenu(
    registreDe(t).filter((m) => m.mainId === collecteurId && duJour(m.survenuLe)),
  );
}
```

- [ ] **Étape 7 : lancer les épreuves du téléphone**

```bash
npm run test -w @kolek/collecteur
npx tsc -b apps/collecteur
npm run verifier:lint
```
Attendu : le même nombre d'épreuves vertes qu'à l'étape 1, aucun chiffre attendu modifié.

- [ ] **Étape 8 : commiter**

```bash
git add apps/collecteur/src/hors-ligne/vues.ts
git commit -m "feat(collecteur): les calculs du telephone passent par la regle partagee" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 7 : le garde-fou — plus personne ne lit l'argent en direct

**Fichiers :**
- Créer : `supabase/migrations/20260915130000_lecteurs_directs_argent.sql`
- Créer : `supabase/tests/lecteurs-argent.test.ts`

**Interfaces :**
- Consomme : rien des tâches précédentes, hormis le fait que les quatre fonctions et les quatre lectures ont changé de source.
- Produit : `public.lecteurs_directs_argent()` — rend une ligne `fonction text` par fonction SQL de `public` dont la définition cite encore `mises` ou `retraits`.

- [ ] **Étape 1 : écrire l'épreuve**

Créer `supabase/tests/lecteurs-argent.test.ts` :

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { admin, anonyme } from './harnais';

/**
 * Le garde-fou du registre : plus personne ne lit l'argent en direct.
 *
 * Une vue ne protège que si on l'utilise, et rien n'oblige un développeur pressé
 * à le faire. La documentation ne suffira pas : elle ne casse rien quand on
 * l'ignore. Ce fichier casse.
 *
 * Deux listes d'exemptions, chacune avec sa raison écrite. Toute lecture
 * nouvelle hors de ces listes fait tomber l'épreuve, quel que soit son auteur.
 */

const RACINE = fileURLToPath(new URL('../..', import.meta.url));

/** Les fonctions SQL qui citent `mises` ou `retraits` pour autre chose que de l'argent. */
const EXEMPTES_SQL: Record<string, string> = {
  'public.admin_reglages()':
    'Compte les lignes de chaque table : la taille de la base, pas une somme d’argent.',
  'public.mises_avant_insert()':
    'Cherche un doublon avant d’écrire, et pose les colonnes du serveur : une écriture.',
};

/** Les sources qui nomment encore `mises` ou `retraits`, et pourquoi. */
const EXEMPTES_SOURCE: Record<string, { lectures: number; raison: string }> = {
  'apps/collecteur/src/hors-ligne/envoyer.ts': {
    lectures: 1,
    raison: 'Insère la mise d’une opération de la file.',
  },
  'apps/collecteur/src/hors-ligne/rafraichir.ts': {
    lectures: 3,
    raison: 'Copie brute de la tournée ; les calculs d’argent passent par mouvementsDepuis.',
  },
  'supabase/functions/admin-supprimer-collecteur/index.ts': {
    lectures: 2,
    raison: 'Contrôle d’existence avant suppression, pour un message lisible.',
  },
  'supabase/functions/collecteur-cloturer-carte/index.ts': {
    lectures: 1,
    raison: 'Écrit le retrait de la clôture.',
  },
  'supabase/functions/collecteur-encaisser-pour/index.ts': {
    lectures: 1,
    raison: 'Écrit la mise encaissée pour un coéquipier.',
  },
};

const MOTIF = /\.from\(\s*['"`](mises|retraits)['"`]\s*\)/g;
const DOSSIERS = ['apps', 'packages', 'supabase/functions'];
const IGNORES = new Set(['node_modules', 'dist', '.vite']);

function lecturesDansLesSources(): Record<string, number> {
  const trouvees: Record<string, number> = {};

  const parcourir = (dossier: string): void => {
    for (const e of readdirSync(join(RACINE, dossier), { withFileTypes: true })) {
      const chemin = `${dossier}/${e.name}`;
      if (e.isDirectory()) {
        if (!IGNORES.has(e.name)) parcourir(chemin);
        continue;
      }
      if (!/\.(ts|tsx|mjs|js)$/.test(e.name) || /\.test\./.test(e.name)) continue;
      const trouvailles = readFileSync(join(RACINE, chemin), 'utf8').match(MOTIF);
      if (trouvailles) trouvees[chemin] = trouvailles.length;
    }
  };

  for (const d of DOSSIERS) parcourir(d);
  return trouvees;
}

async function fonctionsSql(): Promise<string[]> {
  const { data, error } = await admin.rpc('lecteurs_directs_argent');
  expect(error).toBeNull();
  return ((data ?? []) as Array<{ fonction: string }>).map((l) => l.fonction);
}

describe('les fonctions SQL', () => {
  it('trouve les exemptées, avant de juger', async () => {
    // Le contrôle qui protège le suivant : une liste vide se lit « aucune
    // faute » alors qu'elle peut vouloir dire « je ne vois plus rien » —
    // motif cassé, fonction renommée, schéma déplacé.
    const fonctions = await fonctionsSql();

    for (const exemptee of Object.keys(EXEMPTES_SQL)) expect(fonctions).toContain(exemptee);
  });

  it('n’en laisse aucune autre lire mises ou retraits', async () => {
    const fonctions = await fonctionsSql();

    expect(fonctions.filter((f) => !(f in EXEMPTES_SQL))).toEqual([]);
  });

  it('n’est pas exécutable depuis un navigateur', async () => {
    const { error } = await anonyme.rpc('lecteurs_directs_argent');

    expect(error).not.toBeNull();
  });
});

describe('les sources', () => {
  it('trouve les lectures exemptées, avant de juger', () => {
    expect(Object.keys(lecturesDansLesSources()).sort()).toEqual(Object.keys(EXEMPTES_SOURCE).sort());
  });

  it('n’en laisse aucune autre nommer mises ou retraits', () => {
    const attendu = Object.fromEntries(
      Object.entries(EXEMPTES_SOURCE).map(([fichier, e]) => [fichier, e.lectures]),
    );

    expect(lecturesDansLesSources()).toEqual(attendu);
  });
});
```

- [ ] **Étape 2 : lancer l'épreuve et la voir rouge**

Run : `npm run test:db -- lecteurs-argent`
Attendu : ÉCHEC — `Could not find the function public.lecteurs_directs_argent`.

- [ ] **Étape 3 : écrire la migration**

Créer `supabase/migrations/20260915130000_lecteurs_directs_argent.sql` :

```sql
-- Qui lit encore l'argent en direct ?
--
-- Spec : Docs/specs/2026-09-15-mouvements-registre-design.md §3.4.
--
-- Une vue ne protège que si on l'utilise. Cette fonction rend la liste des
-- fonctions de `public` dont la définition cite encore les tables d'argent, et
-- `supabase/tests/lecteurs-argent.test.ts` la compare à une liste d'exemptions
-- tenue à la main, chacune avec sa raison.
--
-- Rejouable, contrairement à un bloc `do` de migration : une migration
-- appliquée ne rejoue pas, et ne dira jamais rien de la fonction suivante.
--
-- Le motif cherche une référence de relation — `public.mises`, `from mises`,
-- `join retraits` — et non le mot seul, qui vit dans les commentaires et dans
-- des noms comme `mises_encaissees`. `\M` marque la fin d'un mot : `mises_jour`
-- n'est donc pas une référence à `mises`.
create or replace function public.lecteurs_directs_argent()
returns table (fonction text)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select p.oid::regprocedure::text
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     -- Elle-même porte le motif dans son corps : s'exclure est plus honnête que
     -- de le découper en morceaux pour tromper sa propre recherche.
     and p.proname <> 'lecteurs_directs_argent'
     and pg_catalog.pg_get_functiondef(p.oid) ~* '(public\.|from\s+|join\s+)(mises|retraits)\M'
   order by 1
$$;

comment on function public.lecteurs_directs_argent is
  'Les fonctions de public dont la définition cite encore les tables mises ou retraits. Doit se réduire aux exemptions de supabase/tests/lecteurs-argent.test.ts : compter des lignes, ou écrire. Toute lecture d''argent passe par la vue mouvements.';

-- `service_role` conserve l'exécution — c'est sous cette identité que
-- l'épreuve l'appelle. Les trois autres partent : la carte de ce qui lit
-- l'argent n'a rien à faire dans un navigateur.
revoke all on function public.lecteurs_directs_argent() from public;
revoke all on function public.lecteurs_directs_argent() from anon;
revoke all on function public.lecteurs_directs_argent() from authenticated;

-- ---------------------------------------------------------------- Garde-fou
do $garde$
declare
  restantes text;
begin
  select string_agg(fonction, ', ') into restantes
    from public.lecteurs_directs_argent()
   where fonction not in ('public.admin_reglages()', 'public.mises_avant_insert()');

  if restantes is not null then
    raise exception 'GARDE_FOU : ces fonctions lisent encore l''argent en direct : %', restantes;
  end if;
end
$garde$;
```

- [ ] **Étape 4 : appliquer et voir vert**

```bash
npx supabase migration up --local
npm run test:db -- lecteurs-argent
```
Attendu : 5 vertes.

- [ ] **Étape 5 : voir le garde-fou rouge, des deux côtés**

Côté SQL, poser puis retirer une fonction fautive sur la base locale :

```bash
docker exec supabase_db_Kolek psql -U postgres -c "create function public.essai_rouge() returns bigint language sql stable as \$\$ select count(*) from public.mises \$\$;"
npm run test:db -- lecteurs-argent
docker exec supabase_db_Kolek psql -U postgres -c "drop function public.essai_rouge();"
```
Attendu : l'épreuve échoue en nommant `public.essai_rouge()`, puis redevient verte après le `drop`.

Côté sources, ajouter puis retirer une lecture dans `apps/collecteur/src/lectures-ecrans.ts` — par exemple `void supabase.from('mises');` en tête de `chargerBilan` :

```bash
npm run test:db -- lecteurs-argent
```
Attendu : l'épreuve échoue en montrant `apps/collecteur/src/lectures-ecrans.ts: 1`. Retirer la ligne, relancer, la voir verte.

- [ ] **Étape 6 : commiter**

```bash
git status --short   # l'arbre doit être propre hors des deux fichiers de la tâche
git add supabase/migrations/20260915130000_lecteurs_directs_argent.sql supabase/tests/lecteurs-argent.test.ts
git commit -m "test(base): le garde-fou des lecteurs directs de l'argent" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 8 : les relevés, le retour arrière, et la répétition en local

**Fichiers :**
- Créer : `supabase/releves/mouvements-avant-apres.sql`
- Créer : `supabase/releves/mouvements-apres.sql`
- Créer : `supabase/retour/mouvements-registre.sql`
- Hors dépôt, dans `$TMP/mouvements/` : `releve.mjs`, `comparer.mjs`, `construire-retour.mjs`, `peupler.mjs`, `definitions.sql`

**Interfaces :**
- Consomme : les quatre migrations des tâches 2, 3, 4 et 7.
- Produit : les deux relevés, la migration de retour, et la preuve — faite en local, sur des données réalistes — que la séquence de livraison ne change aucun chiffre et se défait.

`$TMP` désigne le répertoire temporaire de la session. Les cinq scripts vivent **hors du dépôt** : ce sont des outils de contrôle, pas du produit.

- [ ] **Étape 1 : écrire le relevé comparable**

Créer `supabase/releves/mouvements-avant-apres.sql` :

```sql
-- Relevé du registre — le même avant la migration et après.
--
-- Spec : Docs/specs/2026-09-15-mouvements-registre-design.md §6.4.
--
-- Une seule instruction, qui ne fait que lire, et qui ne rend que des comptes,
-- des sommes et des empreintes md5 : jamais un nom, jamais un numéro.
--
-- Deux relevés ne se comparent que si leur bloc `calme` est identique : une
-- mise ou un retrait arrivé entre les deux change légitimement les sommes. Et
-- jamais à cheval sur minuit UTC, qui décale les séries par jour, ni vers
-- 23 h 55, quand le relevé du jour appelle la vue globale.
select jsonb_build_object(
  'calme', jsonb_build_object(
    'derniere_mise_recue', (select max(recu_le) from public.mises),
    'dernier_retrait',     (select max(effectue_le) from public.retraits),
    'jour_utc',            (now() at time zone 'UTC')::date
  ),

  'tables', jsonb_build_object(
    'mises',          (select count(*) from public.mises),
    'somme_mises',    (select coalesce(sum(montant), 0) from public.mises),
    'retraits',       (select count(*) from public.retraits),
    'somme_retraits', (select coalesce(sum(montant_restitue), 0) from public.retraits)
  ),

  'caisses', (
    select jsonb_build_object(
      'lignes',      count(*),
      -- Leur nombre avant la migration est la ligne de départ : il ne doit pas
      -- bouger. Une caisse peut diverger de son recalcul pour des raisons
      -- anciennes ; ce relevé ne juge pas cela, il juge le changement.
      'divergentes', count(*) filter (
                       where cash_attendu <> public.cash_attendu_du_jour(collecteur_id, date)
                     ),
      'recalcul',    md5(coalesce(string_agg(
                       id::text || '=' || public.cash_attendu_du_jour(collecteur_id, date)::text,
                       ',' order by id), ''))
    )
    from public.caisses_jour
  ),

  -- Une empreinte par clé, et non une pour tout : un écart dit alors lequel des
  -- chiffres a bougé. Les tableaux sont triés sur le texte de leurs éléments,
  -- pour qu'un ordre d'égalité ne compte pas comme une différence.
  'admin_vue_globale', (
    select jsonb_object_agg(cle, md5(
             case when jsonb_typeof(valeur) = 'array'
                  then coalesce((select string_agg(e::text, ',' order by e::text)
                                   from jsonb_array_elements(valeur) e), '')
                  else valeur::text end))
      from jsonb_each(public.admin_vue_globale()) as x(cle, valeur)
     where cle <> 'genere_le'
  ),
  'admin_tendances_7', (
    select jsonb_object_agg(cle, md5(
             case when jsonb_typeof(valeur) = 'array'
                  then coalesce((select string_agg(e::text, ',' order by e::text)
                                   from jsonb_array_elements(valeur) e), '')
                  else valeur::text end))
      from jsonb_each(public.admin_tendances(7)) as x(cle, valeur)
  ),
  'admin_tendances_30', (
    select jsonb_object_agg(cle, md5(
             case when jsonb_typeof(valeur) = 'array'
                  then coalesce((select string_agg(e::text, ',' order by e::text)
                                   from jsonb_array_elements(valeur) e), '')
                  else valeur::text end))
      from jsonb_each(public.admin_tendances(30)) as x(cle, valeur)
  ),
  'admin_tendances_90', (
    select jsonb_object_agg(cle, md5(
             case when jsonb_typeof(valeur) = 'array'
                  then coalesce((select string_agg(e::text, ',' order by e::text)
                                   from jsonb_array_elements(valeur) e), '')
                  else valeur::text end))
      from jsonb_each(public.admin_tendances(90)) as x(cle, valeur)
  )
) as releve;
```

- [ ] **Étape 2 : écrire le relevé d'après**

Créer `supabase/releves/mouvements-apres.sql` :

```sql
-- La vue rend-elle, ligne à ligne, ce que portent les tables ?
--
-- Se lit **après** la migration, en une seule instruction : les deux côtés sont
-- alors mesurés au même instant, et aucune fenêtre calme n'est nécessaire.
--
-- C'est la preuve la plus forte du chantier : si la vue reproduit exactement les
-- tables, alors tout lecteur qui passe de l'une à l'autre rend les mêmes
-- chiffres, sans qu'on ait à les comparer un par un.
select jsonb_build_object(
  'lignes_tables', (select count(*) from public.mises)
                   + (select count(*) from public.retraits)
                   + (select count(*) from public.rattrapages),
  'lignes_vue',    (select count(*) from public.mouvements),
  'rattrapages',   (select count(*) from public.rattrapages),

  'somme_vue',    (select coalesce(sum(sens * montant), 0) from public.mouvements),
  'somme_tables', (select coalesce(sum(montant), 0) from public.mises)
                  - (select coalesce(sum(montant_restitue), 0) from public.retraits)
                  + (select coalesce(sum(montant), 0) from public.rattrapages),

  'vue_egale_tables', (
    select md5(coalesce(string_agg(l, ',' order by l), '')) from (
      select concat_ws('|', m.id, 'mise', 1, m.montant, m.collecteur_id, m.encaisse_par,
                       m.carte_id, ca.client_id, m.encaisse_le, m.est_commission) as l
        from public.mises m join public.cartes ca on ca.id = m.carte_id
      union all
      select concat_ws('|', r.id, 'retrait', -1, r.montant_restitue, r.collecteur_id, r.restitue_par,
                       r.carte_id, ca.client_id, r.effectue_le, false)
        from public.retraits r join public.cartes ca on ca.id = r.carte_id
      union all
      select concat_ws('|', t.id, 'rattrapage', 1, t.montant, t.collecteur_id, t.main_id,
                       t.carte_id, ca.client_id, t.encaisse_le, false)
        from public.rattrapages t join public.cartes ca on ca.id = t.carte_id
    ) depuis_les_tables
  ) = (
    select md5(coalesce(string_agg(l, ',' order by l), '')) from (
      select concat_ws('|', id, nature, sens, montant, collecteur_id, main_id,
                       carte_id, client_id, survenu_le, est_commission) as l
        from public.mouvements
    ) depuis_la_vue
  )
) as releve;
```

- [ ] **Étape 3 : écrire les outils de relevé, hors dépôt**

Créer `$TMP/mouvements/releve.mjs` :

```js
// Exécute un relevé en lecture seule et garde son résultat.
// Usage, depuis la racine : node "$TMP/mouvements/releve.mjs" <local|linked> <fichier.sql> <sortie.json>
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [cible, fichier, sortie] = process.argv.slice(2);
if (!['local', 'linked'].includes(cible) || !fichier || !sortie) {
  throw new Error('Usage : <local|linked> <fichier.sql> <sortie.json>');
}

// La garde, et elle compte : `--linked` vise la production. Commentaires
// retirés, le texte doit être une seule instruction qui lit.
const sql = readFileSync(fichier, 'utf8').replace(/--[^\n]*/g, '').trim();
if (!/^(select|with)\b/i.test(sql)) throw new Error('Refusé : un relevé commence par select ou with.');
if (/;[\s\S]*\S/.test(sql)) throw new Error('Refusé : plus d’une instruction.');
if (/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call)\b/i.test(sql)) {
  throw new Error('Refusé : le relevé contient un mot qui écrit.');
}

const brut = execSync(`npx supabase db query --${cible} --output-format json -f "${fichier}"`, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});
const { rows } = JSON.parse(brut.slice(brut.indexOf('{')));
if (!Array.isArray(rows) || rows.length !== 1 || !rows[0].releve) {
  throw new Error('Relevé inattendu : une ligne « releve » était attendue.');
}

writeFileSync(sortie, JSON.stringify(rows[0].releve, null, 2));
console.log(`relevé ${cible} écrit : ${sortie}`);
```

Créer `$TMP/mouvements/comparer.mjs` :

```js
// Compare deux relevés. Sortie non nulle au premier écart.
// Usage : node "$TMP/mouvements/comparer.mjs" <avant.json> <apres.json>
import { readFileSync } from 'node:fs';

const [avant, apres] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));

if (JSON.stringify(avant.calme) !== JSON.stringify(apres.calme)) {
  console.log('Fenêtre non calme : une écriture est arrivée entre les deux relevés. Refaire la paire.');
  console.log('avant :', JSON.stringify(avant.calme));
  console.log('après :', JSON.stringify(apres.calme));
  process.exit(2);
}

const ecarts = [];
const parcourir = (a, b, chemin) => {
  const cles = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const cle of cles) {
    const [x, y] = [a?.[cle], b?.[cle]];
    if (x && y && typeof x === 'object' && typeof y === 'object') parcourir(x, y, `${chemin}.${cle}`);
    else if (JSON.stringify(x) !== JSON.stringify(y)) ecarts.push(`${chemin}.${cle} : ${x} → ${y}`);
  }
};

for (const cle of Object.keys({ ...avant, ...apres })) {
  if (cle === 'calme') continue;
  parcourir(avant[cle], apres[cle], cle);
}

if (ecarts.length > 0) {
  console.log('ÉCARTS :');
  for (const e of ecarts) console.log(` - ${e}`);
  process.exit(1);
}
console.log('Relevés identiques.');
```

Créer `$TMP/mouvements/definitions.sql` — l'empreinte des quatre fonctions et de leurs droits, pour contrôler le retour arrière :

```sql
select jsonb_object_agg(
         p.oid::regprocedure::text,
         md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, 'sans acl')
       ) as releve
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('cash_attendu_du_jour', 'admin_vue_globale', 'admin_tendances', 'equipe_vue');
```

- [ ] **Étape 4 : écrire la migration de retour**

Créer `$TMP/mouvements/construire-retour.mjs` :

```js
// Écrit supabase/retour/mouvements-registre.sql : les définitions d'avant,
// recopiées mot pour mot depuis les migrations qui les portent.
// Usage, depuis la racine : node "$TMP/mouvements/construire-retour.mjs"
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const MIGRATIONS = 'supabase/migrations/';

function extraire(fichier, debut, fin) {
  const lignes = readFileSync(MIGRATIONS + fichier, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const debuts = lignes.filter((l) => l.startsWith(debut)).length;
  if (debuts !== 1) throw new Error(`${fichier} : ${debuts} début(s) « ${debut} », 1 attendu.`);
  const i = lignes.findIndex((l) => l.startsWith(debut));
  const j = lignes.findIndex((l, k) => k >= i && l.startsWith(fin));
  if (j < 0) throw new Error(`${fichier} : fin « ${fin} » introuvable.`);
  return lignes.slice(i, j + 1).join('\n');
}

const morceaux = [
  ['20260902120000_encaisse_par.sql',
   'create or replace function public.cash_attendu_du_jour',
   'revoke all on function public.cash_attendu_du_jour'],
  ['20260902150000_admin_voit_le_rattachement.sql',
   'CREATE OR REPLACE FUNCTION public.admin_vue_globale',
   '$function$;'],
  ['20260911210000_admin_tendances.sql',
   'create or replace function public.admin_tendances',
   'grant execute on function public.admin_tendances'],
  ['20260902130000_equipe_vue.sql',
   'create or replace function public.equipe_vue',
   'grant execute on function public.equipe_vue'],
].map(([fichier, debut, fin]) => extraire(fichier, debut, fin));

const entete = `-- Retour arrière du registre des mouvements.
--
-- Les quatre fonctions de lecture, telles qu'elles étaient avant le chantier du
-- 2026-09-15, recopiées mot pour mot depuis les migrations qui les portent —
-- 20260902120000, 20260902150000, 20260911210000, 20260902130000 — par
-- \`construire-retour.mjs\`.
--
-- Ce fichier n'est PAS une migration : il n'est pas dans supabase/migrations et
-- ne part donc jamais tout seul. En cas de retour, le copier sous
-- supabase/migrations/<horodatage>_mouvements_registre_retour.sql et le pousser
-- sur accord explicite de l'exploitant, pour que l'historique des migrations
-- reste vrai.
--
-- La table et la vue restent : vides et lues par personne, elles ne coûtent
-- rien. Le déclencheur de caisse des rattrapages, lui, part avec les fonctions.

`;

const pied = `

drop trigger if exists rattrapages_rafraichir_caisse on public.rattrapages;
drop function if exists public.caisses_rafraichir_apres_rattrapage();
`;

mkdirSync('supabase/retour', { recursive: true });
writeFileSync('supabase/retour/mouvements-registre.sql', entete + morceaux.join('\n\n') + pied);
console.log('supabase/retour/mouvements-registre.sql écrit.');
```

Puis :

```bash
node "$TMP/mouvements/construire-retour.mjs"
```

- [ ] **Étape 5 : écrire le peuplement de la répétition**

Créer `$TMP/mouvements/peupler.mjs` — un titulaire, un collaborateur, de l'argent encaissé pour autrui, une carte close et des caisses déclarées. Il n'utilise que des tables qui existaient avant ce chantier, pour pouvoir tourner sur la base d'avant :

```js
// Peuple la pile locale d'un jeu réaliste : titulaire, collaborateur, argent
// encaissé pour autrui, carte close, caisses déclarées.
// Usage, depuis la racine : node "$TMP/mouvements/peupler.mjs"
import { execSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { createClient } = createRequire(join(process.cwd(), 'package.json'))('@supabase/supabase-js');
const statut = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
if (statut.API_URL !== 'http://127.0.0.1:54321') throw new Error(`Pile inattendue : ${statut.API_URL}`);

const sansSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(statut.API_URL, statut.SERVICE_ROLE_KEY, sansSession);
const MISE = 1000;
const jour = (recul) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - recul);
  return d.toISOString().slice(0, 10);
};

async function creer(nom) {
  const email = `${nom}-${randomUUID().slice(0, 8)}@kolek.test`;
  const motDePasse = randomBytes(12).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { nom, telephone: `+22507${String(Date.now()).slice(-8)}` },
  });
  if (error) throw error;
  const client = createClient(statut.API_URL, statut.ANON_KEY, sansSession);
  const { error: erreur } = await client.auth.signInWithPassword({ email, password: motDePasse });
  if (erreur) throw erreur;
  return { id: data.user.id, email, motDePasse, client };
}

const exiger = (quoi, { error }) => {
  if (error) throw new Error(`${quoi} : ${error.message}`);
};

const patron = await creer('patron');
const awa = await creer('awa');
exiger('palier du patron', await admin.from('collecteurs')
  .update({ palier: 'illimite', abonnement_statut: 'actif' }).eq('id', patron.id));
exiger('rattachement', await admin.from('collecteurs')
  .update({ titulaire_id: patron.id }).eq('id', awa.id));

/** Un client, une carte, et `mises` mises réparties sur les jours donnés. */
async function carte(proprietaire, nomClient, jours, options = {}) {
  const clientId = randomUUID();
  const carteId = randomUUID();
  exiger('client', await proprietaire.client.from('clients')
    .insert({ id: clientId, collecteur_id: proprietaire.id, nom: nomClient }));
  exiger('carte', await proprietaire.client.from('cartes')
    .insert({ id: carteId, collecteur_id: proprietaire.id, client_id: clientId, mise: MISE }));
  let rang = 0;
  for (const j of jours) {
    rang += 1;
    const ligne = {
      id: randomUUID(),
      collecteur_id: proprietaire.id,
      carte_id: carteId,
      montant: MISE,
      encaisse_le: `${j}T09:${String(rang).padStart(2, '0')}:00Z`,
    };
    // Une mise encaissée par le titulaire pour sa collaboratrice : la main
    // n'est pas le propriétaire, et c'est ce que la caisse doit suivre.
    if (options.mainDuTitulaire && rang === 1) {
      exiger('mise pour autrui', await admin.from('mises').insert({ ...ligne, encaisse_par: patron.id }));
    } else {
      exiger('mise', await proprietaire.client.from('mises').insert(ligne));
    }
  }
  return { clientId, carteId, mises: jours.length };
}

const k1 = await carte(patron, 'Cliente A', [jour(2), jour(1), jour(0), jour(0)]);
const k2 = await carte(patron, 'Cliente B', [jour(1), jour(0)]);
const k3 = await carte(awa, 'Cliente C', [jour(2), jour(1), jour(0)], { mainDuTitulaire: true });

// Une carte close, dont le titulaire a sorti l'argent de sa propre sacoche.
const k4 = await carte(awa, 'Cliente D', [jour(2), jour(2), jour(2)]);
exiger('retrait', await admin.from('retraits').insert({
  collecteur_id: awa.id,
  carte_id: k4.carteId,
  montant_restitue: (k4.mises - 1) * MISE,
  commission: MISE,
  restitue_par: patron.id,
  effectue_le: `${jour(1)}T18:00:00Z`,
}));
exiger('clôture', await admin.from('cartes')
  .update({ statut: 'cloturee', cloturee_le: `${jour(1)}T18:00:00Z` }).eq('id', k4.carteId));

// Des caisses déclarées, dont une d'hier : c'est celle qu'un rattrapage
// rouvrirait.
exiger('caisse patron hier', await patron.client.from('caisses_jour')
  .insert({ collecteur_id: patron.id, date: jour(1), cash_declare: 3000 }));
exiger('caisse patron aujourd’hui', await patron.client.from('caisses_jour')
  .insert({ collecteur_id: patron.id, date: jour(0), cash_declare: 4000 }));
exiger('caisse awa', await awa.client.from('caisses_jour')
  .insert({ collecteur_id: awa.id, date: jour(0), cash_declare: 1000 }));

for (const [nom, compte] of [['titulaire', patron], ['collaborateur', awa]]) {
  writeFileSync(
    join(import.meta.dirname, `compte-${nom}.json`),
    JSON.stringify({ email: compte.email, motDePasse: compte.motDePasse, id: compte.id }),
  );
}
console.log(`peuplé : 4 cartes (${k1.mises + k2.mises + k3.mises + k4.mises} mises), 1 clôture, 3 caisses`);
```

- [ ] **Étape 6 : répéter la livraison, en local, de bout en bout**

**Toutes les commandes portent `--local` : la même avec `--linked` viserait la production.**

```bash
npx supabase db reset --local --version 20260912090000
node "$TMP/mouvements/peupler.mjs"
node "$TMP/mouvements/releve.mjs" local supabase/releves/mouvements-avant-apres.sql "$TMP/mouvements/avant.json"
node "$TMP/mouvements/releve.mjs" local "$TMP/mouvements/definitions.sql" "$TMP/mouvements/definitions-avant.json"
```
Attendu : la base revient à l'état de `main`, le peuplement annonce ses cartes, et les deux relevés s'écrivent.

```bash
npx supabase migration up --local
node "$TMP/mouvements/releve.mjs" local supabase/releves/mouvements-avant-apres.sql "$TMP/mouvements/apres.json"
node "$TMP/mouvements/comparer.mjs" "$TMP/mouvements/avant.json" "$TMP/mouvements/apres.json"
node "$TMP/mouvements/releve.mjs" local supabase/releves/mouvements-apres.sql "$TMP/mouvements/vue.json"
```
Attendu : `Relevés identiques.`, puis dans `vue.json` : `lignes_tables` égal à `lignes_vue`, `somme_vue` égale à `somme_tables`, `rattrapages: 0`, `vue_egale_tables: true`.

- [ ] **Étape 7 : répéter le retour arrière**

```bash
npx supabase db query --local -f supabase/retour/mouvements-registre.sql
node "$TMP/mouvements/releve.mjs" local "$TMP/mouvements/definitions.sql" "$TMP/mouvements/definitions-retour.json"
node "$TMP/mouvements/comparer.mjs" "$TMP/mouvements/definitions-avant.json" "$TMP/mouvements/definitions-retour.json"
node "$TMP/mouvements/releve.mjs" local supabase/releves/mouvements-avant-apres.sql "$TMP/mouvements/apres-retour.json"
node "$TMP/mouvements/comparer.mjs" "$TMP/mouvements/avant.json" "$TMP/mouvements/apres-retour.json"
```
Attendu : `Relevés identiques.` deux fois — les quatre fonctions sont revenues à la définition et aux droits d'avant, et les chiffres avec elles.

- [ ] **Étape 8 : remettre la base locale d'aplomb**

```bash
npm run db:reset
npm run test:db
```
Attendu : la base repart avec toutes les migrations, et toute la suite est verte.

- [ ] **Étape 9 : commiter**

```bash
git add supabase/releves supabase/retour
git commit -m "test(base): les releves du registre et le retour arriere, repetes en local" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 9 : vérifier, et regarder les écrans

**Fichiers :** aucun du dépôt. Les outils du regard vivent dans `$TMP/mouvements/`.

**Interfaces :** consomme tout ce qui précède. Produit le compte rendu que l'exploitant lit avant de décider la livraison.

- [ ] **Étape 1 : la chaîne complète**

```bash
npm run verifier
```
Attendu : vert de bout en bout — thème, marque, paliers, champs, manifeste, portillons, lint, types, `npm test`, `test:scripts`, `test:db`, construction, empreintes de paquets. Consigner les comptes de chaque suite.

- [ ] **Étape 2 : aucune fonction serveur touchée**

```bash
git diff --stat main...HEAD -- supabase/functions
git diff --stat main...HEAD -- supabase/migrations
```
Attendu : le premier **vide** ; le second exactement quatre fichiers, ceux des tâches 2, 3, 4 et 7.

- [ ] **Étape 3 : sortir les outils du regard du plan J2b**

Ils y sont écrits en entier et ont déjà servi. Les extraire plutôt que les réécrire :

```bash
mkdir -p "$TMP/mouvements/regard"
node -e "
const fs = require('node:fs');
const plan = fs.readFileSync('Docs/plans/2026-09-13-j2b-hors-ligne.md', 'utf8').replace(/\r\n/g, '\n');
for (const nom of ['construire', 'servir', 'cdp']) {
  const ancre = 'Créer \`\$TMP/regard-j2b/' + nom + '.mjs\` :';
  const debut = plan.indexOf(ancre);
  if (debut < 0) throw new Error('Ancre introuvable : ' + nom);
  const ouvrant = plan.indexOf('\n', plan.indexOf('\`\`\`', debut));
  const fermant = plan.indexOf('\n\`\`\`', ouvrant);
  fs.writeFileSync(process.env.TMP_MOUVEMENTS + '/' + nom + '.mjs', plan.slice(ouvrant + 1, fermant + 1));
  console.log(nom + '.mjs extrait');
}
"
```
(`TMP_MOUVEMENTS` vaut `$TMP/mouvements/regard`.) Contrôler chaque fichier par `node --check`.

- [ ] **Étape 4 : préparer la base et les deux paquets**

```bash
npm run db:reset
node "$TMP/mouvements/peupler.mjs"
git checkout main
node "$TMP/mouvements/regard/construire.mjs" "$TMP/mouvements/dist-main"
git checkout mouvements-registre
node "$TMP/mouvements/regard/construire.mjs" "$TMP/mouvements/dist-branche"
```
Attendu : chaque construction annonce `hôte local : 1` ou plus et `hôte en .supabase.co : 0`. **Tout autre compte : arrêt, rien n'est servi.**

Note : la base porte toutes les migrations de la branche ; le paquet de `main` lit les mêmes tables et fonctionne donc contre elle — c'est précisément la compatibilité que la livraison exige.

- [ ] **Étape 5 : le regard, deux fois**

Pour chaque paquet, avec un **profil Chrome neuf** — sans quoi le service worker et IndexedDB du premier passage serviraient la coquille de l'autre :

```bash
node "$TMP/mouvements/regard/servir.mjs" "$TMP/mouvements/dist-main"     # en arrière-plan
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=9333 --window-size=390,844 --user-data-dir="C:/Users/M.BERTHE/AppData/Local/Temp/kmr-main" --no-first-run about:blank
```

Puis, `C` désignant `node "$TMP/mouvements/regard/cdp.mjs"` :

1. `C ouvrir`, `C attendre "Se connecter"`, `C connecter "$TMP/mouvements/compte-titulaire.json"`.
2. L'application s'ouvre sur « Clients ». Aller à l'accueil : en sans-interface deux barres de navigation coexistent, donc cliquer la dernière par `C eval "(() => { const b = [...document.querySelectorAll('button, a')].filter((e) => e.innerText.trim() === 'Accueil'); b.at(-1).click(); return b.length; })()"`.
3. `C base` jusqu'à `lueLe` non nul, puis relever le texte de chaque écran dans un fichier : accueil, la fiche d'un client, « Plus », Bilan, Reçus, Rapprochement, Historique d'une carte, Alertes, Équipe. Les libellés des boutons se lisent par `C texte` avant de cliquer — `innerText` rend les capitales de la feuille de style (« ENCAISSÉ AUJOURD’HUI »).
4. Arrêter Chrome et le serveur, recommencer avec `dist-branche`, le profil `kmr-branche`, et les mêmes écrans.

- [ ] **Étape 6 : comparer**

```bash
for e in accueil fiche plus bilan recus rapprochement historique alertes equipe; do
  echo "== $e"; diff "$TMP/mouvements/main-$e.txt" "$TMP/mouvements/branche-$e.txt"
done
```
Attendu : **aucune différence**. Une seule exception admissible : une phrase de durée relative (« il y a N minutes ») décalée par le temps écoulé entre les deux passages. Toute autre ligne différente arrête la livraison et se présente à l'exploitant.

- [ ] **Étape 7 : fermer le regard**

```bash
docker ps --filter name=supabase_kong_Kolek
```
Arrêter Chrome et le serveur de prévisualisation. La pile locale reste debout.

- [ ] **Étape 8 : le compte rendu**

Écrire à l'exploitant : les comptes de chaque suite, le résultat de la répétition de la tâche 8 (relevés identiques, retour arrière identique), le résultat du regard, et la liste des gestes de production qui attendent son accord.

---

## Tâche 10 : livrer — sur accord explicite de l'exploitant, geste par geste

**Aucune étape de cette tâche ne se fait sans un accord explicite, demandé pour ce geste-là.** Les tâches 1 à 9 ne touchent que la machine locale ; celle-ci touche l'argent réel.

- [ ] **Étape 1 : choisir le moment**

Ni entre 23 h 40 et 00 h 10 UTC — le relevé du jour appelle la vue globale à 23 h 55, et minuit décale les séries — ni pendant les tournées. Le soir d'Abidjan, après 19 h, convient.

- [ ] **Étape 2 : fusionner sur `main`, en local** *(accord)*

```bash
git checkout main
git merge --no-ff mouvements-registre -m "Merge branch 'mouvements-registre'"
npm run verifier
```
Attendu : vert. Rien n'est poussé.

- [ ] **Étape 3 : le relevé d'avant**

```bash
node "$TMP/mouvements/releve.mjs" linked supabase/releves/mouvements-avant-apres.sql "$TMP/mouvements/prod-avant.json"
```

- [ ] **Étape 4 : montrer ce que la migration va faire**

```powershell
& "C:\Program Files\nodejs\npx.cmd" supabase migration list --linked
& "C:\Program Files\nodejs\npx.cmd" supabase db push --dry-run
```
Attendu : exactement les quatre migrations de la branche en attente, et aucune autre.

- [ ] **Étape 5 : appliquer la migration en production** *(accord)*

```powershell
& "C:\Program Files\nodejs\npx.cmd" supabase db push --yes
```

- [ ] **Étape 6 : les deux relevés d'après, tout de suite**

```bash
node "$TMP/mouvements/releve.mjs" linked supabase/releves/mouvements-avant-apres.sql "$TMP/mouvements/prod-apres.json"
node "$TMP/mouvements/comparer.mjs" "$TMP/mouvements/prod-avant.json" "$TMP/mouvements/prod-apres.json"
node "$TMP/mouvements/releve.mjs" linked supabase/releves/mouvements-apres.sql "$TMP/mouvements/prod-vue.json"
```
Attendu : `Relevés identiques.` ; et dans `prod-vue.json` : `rattrapages: 0`, `lignes_tables` égal à `lignes_vue`, `somme_vue` égale à `somme_tables`, `vue_egale_tables: true`.

**Si la fenêtre n'était pas calme** (sortie 2) : refaire la paire de relevés, sans rien conclure entre-temps.
**Si un écart apparaît** : ne rien pousser. Copier `supabase/retour/mouvements-registre.sql` sous `supabase/migrations/<horodatage>_mouvements_registre_retour.sql`, le présenter à l'exploitant, et ne l'appliquer que sur son accord.

- [ ] **Étape 7 : pousser les fronts** *(accord)*

```powershell
git push origin main
```
Netlify déploie les trois fronts. Aucune Edge Function ne part : le travail « Déploiement — Edge Functions » du CI doit journaliser « Aucune Edge Function touchée ».

- [ ] **Étape 8 : contrôler ce qui est servi**

```bash
npm run verifier:migrations
curl -s https://app.kolek.cash/ | grep -oE '/assets/index-[^"]*\.js'
npm run build -w @kolek/collecteur && ls apps/collecteur/dist/assets | grep -E '^index-.*\.js$'
```
Attendu : le schéma distant porte les quatre migrations ; le paquet servi porte le même nom que celui construit en local — même empreinte, donc mêmes octets. Suivre la mémoire « déploiement des fronts » pour expliquer tout écart.

- [ ] **Étape 9 : le relevé final**

```bash
node "$TMP/mouvements/releve.mjs" linked supabase/releves/mouvements-avant-apres.sql "$TMP/mouvements/prod-final.json"
node "$TMP/mouvements/comparer.mjs" "$TMP/mouvements/prod-apres.json" "$TMP/mouvements/prod-final.json"
```
Attendu : identiques, ou une fenêtre non calme — auquel cas un collecteur a encaissé pendant la livraison, ce qui est la vie normale : refaire la paire.

- [ ] **Étape 10 : consigner**

Au registre du chantier : les commits, l'heure de chaque geste, les trois relevés, et le fait qu'aucun rattrapage n'existe encore. Le chantier suivant — le rattrapage — commence là.

---

## Écarts relevés en écrivant ce plan

Ce que ce plan fait autrement que la spec, ou qu'elle ne disait pas. **À soumettre à l'exploitant avec le plan.**

1. **Un rattrapage compte comme un versement** partout où l'on compte des versements : `nombreMises` du bilan, `mises` de la vue globale et des tendances, date du dernier versement des alertes et des tendances. La spec parlait de sommes ; les comptes suivent la même logique — le client a bien versé 31 fois.
2. **Les restitutions se comptent sur `nature = 'retrait'`**, et la caisse sur `sens * montant`. Les deux diffèreront au chantier suivant, quand le règlement d'un rattrapage sera une sortie de caisse qui n'est pas une restitution de carte.
3. **Pas d'empreinte d'`equipe_vue` en production.** Elle lit `auth.uid()`, qu'un relevé en lecture seule ne peut pas poser proprement. Elle est couverte autrement, et plus fortement : l'égalité ligne à ligne entre la vue et les tables (`mouvements-apres.sql`), la répétition locale, et son épreuve sur le jeu piégé.
4. **Les libellés « Rattrapage » restent au chantier suivant.** En B, les types acceptent la valeur — `EvenementCarte.genre`, `Recu.nature`, `Mouvement.type` de l'administration — mais les écrans l'affichent comme une mise. Aucun rattrapage n'existe en production avant le chantier A.
5. **La table `rattrapages` est journalisée.** La liste des tables journalisées, affichée dans l'écran Réglages de l'administration, gagne donc « rattrapages » : un nom de table, pas un chiffre.
6. **L'épreuve du libellé dans la vue globale pose un rattrapage daté de cinq jours en avant**, pour être à coup sûr le plus récent de la base. La table n'a pas de borne de date en B ; le geste du chantier A lui en posera une.
7. **Deux migrations préliminaires n'existent pas.** Le relevé d'avant n'appelle que des fonctions déjà en place ; rien n'est déployé en production avant la migration du chantier.
8. **Supprimer un collecteur qui porte un rattrapage** échouerait sur une clé étrangère `restrict`, avec le message illisible que `admin-supprimer-collecteur` évite pour les mises et les retraits. Aucune ligne n'est possible en B ; à traiter au chantier A.
9. **La répétition de la livraison se fait en local**, migrations comprises, par `db reset --local --version`, `migration up --local` et l'application du retour arrière. C'est ce qui rend la séquence de production sûre avant de la jouer.







