# Cartes multiples — plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes
> utilisent la syntaxe à cases (`- [ ]`) pour le suivi.

**But :** un client peut détenir plusieurs cartes actives, le collecteur encaisse
sur celle qu'il désigne, et une carte à 31/31 ouvre un choix — rendre l'argent,
ou en activer une de plus — au lieu de s'éteindre.

**Architecture :** un seul changement en base, la suppression de l'index partiel
`cartes_une_active_par_client`. Tout le reste est de l'interface : deux écrans
replient aujourd'hui les cartes sur un client et cessent de le faire, et un bloc
d'activation partagé apporte la seconde porte aux trois endroits où le cycle
complet se présente.

**Pile :** PostgreSQL / Supabase (migrations SQL, RLS), React 19 + TypeScript,
Tailwind 4, Vitest + jsdom + `@testing-library/react`.

**Spec :** `Docs/specs/2026-08-25-cartes-multiples-design.md`

## Contraintes globales

- **Langue :** tout le code, les commentaires, les identifiants et les textes
  d'interface sont en **français**. C'est la convention du dépôt sans exception.
- **Commentaires :** ils disent *pourquoi*, jamais *quoi*. Un commentaire qui
  paraphrase la ligne suivante est retiré à la relecture.
- **Aucun contrôle inerte.** Un bouton qui ne fait rien n'est pas livré. S'il ne
  peut pas agir, il n'existe pas.
- **`MISES_PAR_CYCLE` vaut 31**, importé de `@kolek/core`. Ne jamais écrire 31 en
  dur dans une interface.
- **Les mises sont immuables** — ni `update` ni `delete`. Aucune tâche n'y touche.
- **Vocabulaire :** dans le **code et la base**, `cloturerCarte`,
  `statut = 'cloturee'`, `cloturee_le`. Dans le **texte visible de `Retrait.tsx`**,
  « retrait ». Ne jamais renommer à moitié.
- **Libellé du bouton d'activation :** exactement `Activer une carte`, partout.
- **Commandes :**
  - tests d'interface : `cd apps/collecteur && npx vitest run <chemin>`
  - tests de base : `npm run db:reset` puis `npm run test:db`
  - vérification complète : `npm test --workspaces`

---

## Structure des fichiers

| Fichier | Responsabilité | Tâche |
|---|---|---|
| `supabase/migrations/20260825090000_cartes_multiples.sql` | **créer** — supprime l'index, réécrit le commentaire | 1 |
| `supabase/migrations/20260815135037_socle_collecteurs.sql` | **modifier** — le commentaire de l'index devient faux | 1 |
| `supabase/tests/cartes-multiples.test.ts` | **créer** — le contrat de base des cartes multiples | 1 |
| `apps/collecteur/src/ecritures.ts` | **modifier** — `ouvrirCarte` perd sa branche morte | 2 |
| `apps/collecteur/src/lectures-ecrans.ts` | **modifier** — `CarteCloturable` gagne `clientId` | 3 |
| `apps/collecteur/src/ecrans/ActiverCarte.tsx` | **créer** — le bloc d'activation, partagé par trois écrans | 4 |
| `apps/collecteur/src/ecrans/ActiverCarte.test.tsx` | **créer** | 4 |
| `apps/collecteur/src/ecrans/Clients.tsx` | **modifier** — une ligne par carte | 5 |
| `apps/collecteur/src/ecrans/Clients.test.tsx` | **créer** | 5 |
| `apps/collecteur/src/ecrans/FicheClient.tsx` | **modifier** — plusieurs cartes en cours | 6 |
| `apps/collecteur/src/ecrans/FicheClient.test.tsx` | **créer** | 6 |
| `apps/collecteur/src/ecrans/Retrait.tsx` | **modifier** — vocabulaire et seconde porte | 7 |
| `apps/collecteur/src/ecrans/Retrait.test.tsx` | **créer** | 7 |

`ActiverCarte.tsx` est le seul fichier neuf de production, et il existe pour une
raison précise : sans lui, le même bloc — choix du montant, appel d'`ouvrirCarte`,
gestion du refus — serait écrit trois fois, et divergerait à la première
correction.

---

## Tâche 1 — La base autorise plusieurs cartes actives

**Fichiers**
- Créer : `supabase/migrations/20260825090000_cartes_multiples.sql`
- Modifier : `supabase/migrations/20260815135037_socle_collecteurs.sql:60-62`
- Créer : `supabase/tests/cartes-multiples.test.ts`

**Interfaces**
- Consomme : rien
- Produit : la possibilité d'insérer plusieurs `cartes` en `statut = 'active'`
  pour un même `client_id`. Toutes les tâches suivantes en dépendent.

- [ ] **Étape 1 : écrire le test de base qui échoue**

Créer `supabase/tests/cartes-multiples.test.ts` :

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Ce que la base garantit une fois l'index `cartes_une_active_par_client` levé.
 *
 * Le cadrage de Phase 1 interdisait deux carnets ouverts sur un même client. La
 * règle tombe le 2026-08-25 : un client épargne pour deux choses à deux rythmes,
 * et un client qui a rempli sa carte veut souvent continuer plutôt que reprendre
 * son argent.
 *
 * Ce qui tombe est **une seule contrainte**. Tout ce qui la voisinait doit tenir
 * — c'est l'objet de ce fichier, et la raison pour laquelle il vérifie autant de
 * choses qui n'ont pas changé que de choses qui changent.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
let collecteur: CollecteurTest;

async function creerClient(): Promise<string> {
  const clientId = crypto.randomUUID();
  const { error } = await collecteur.client
    .from('clients')
    .insert({ id: clientId, collecteur_id: collecteur.id, nom: `Client ${MARQUE}` });
  if (error) throw error;
  return clientId;
}

async function ouvrirCarte(clientId: string, mise: number): Promise<string> {
  const carteId = crypto.randomUUID();
  const { error } = await collecteur.client
    .from('cartes')
    .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise });
  if (error) throw error;
  return carteId;
}

/** Encaisse `combien` mises, une par une. */
async function encaisser(carteId: string, mise: number, combien: number): Promise<void> {
  // Une par une, jamais en lot : les déclencheurs `AFTER` sont différés en fin
  // d'instruction, donc un lot verrait toutes les mises avec le même compteur et
  // les marquerait toutes commission. C'est le défaut trouvé le 2026-08-19.
  for (let i = 0; i < combien; i += 1) {
    const { error } = await collecteur.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      carte_id: carteId,
      montant: mise,
      encaisse_le: new Date().toISOString(),
    });
    if (error) throw error;
  }
}

beforeAll(async () => {
  collecteur = await creerCollecteur(`Cartes ${MARQUE}`, `+225071${MARQUE}`);
});

afterAll(async () => {
  await nettoyer();
});

describe('plusieurs cartes actives sur un même client', () => {
  it('accepte deux cartes actives, de montants différents', async () => {
    const clientId = await creerClient();
    await ouvrirCarte(clientId, 1000);

    const carteId = crypto.randomUUID();
    const { error } = await collecteur.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise: 5000 });

    expect(error).toBeNull();
  });

  it('accepte deux cartes actives du même montant', async () => {
    // Deux objectifs d'épargne au même rythme est un cas réel. Aucune règle ne
    // l'interdit — l'ambiguïté d'affichage se règle par la date d'ouverture,
    // pas par un refus de la base.
    const clientId = await creerClient();
    await ouvrirCarte(clientId, 2000);

    const carteId = crypto.randomUUID();
    const { error } = await collecteur.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise: 2000 });

    expect(error).toBeNull();
  });

  it('compte les mises carte par carte, sans mélange', async () => {
    const clientId = await creerClient();
    const carteA = await ouvrirCarte(clientId, 1000);
    const carteB = await ouvrirCarte(clientId, 5000);

    await encaisser(carteA, 1000, 3);
    await encaisser(carteB, 5000, 1);

    const { data } = await collecteur.client
      .from('cartes')
      .select('id, mises_encaissees')
      .in('id', [carteA, carteB]);

    const parId = new Map(
      ((data ?? []) as Array<{ id: string; mises_encaissees: number }>).map((c) => [
        c.id,
        c.mises_encaissees,
      ]),
    );
    expect(parId.get(carteA)).toBe(3);
    expect(parId.get(carteB)).toBe(1);
  });

  it('donne à chaque carte sa propre commission, à sa première mise', async () => {
    // Une carte, un cycle, une commission. Trois cartes ouvertes, trois
    // commissions : c'est ce qui rend l'empilement intéressant pour le collecteur.
    const clientId = await creerClient();
    const carteA = await ouvrirCarte(clientId, 1000);
    const carteB = await ouvrirCarte(clientId, 1000);

    await encaisser(carteA, 1000, 2);
    await encaisser(carteB, 1000, 2);

    const { data } = await collecteur.client
      .from('mises')
      .select('carte_id, est_commission')
      .in('carte_id', [carteA, carteB]);

    const commissions = ((data ?? []) as Array<{ carte_id: string; est_commission: boolean }>)
      .filter((m) => m.est_commission)
      .map((m) => m.carte_id)
      .sort();

    expect(commissions).toEqual([carteA, carteB].sort());
  });
});

describe('ce qui ne change pas', () => {
  it('refuse toujours une mise sur une carte au bout de son cycle', async () => {
    // Garder ses mises chez le collecteur, c'est exactement ceci : la carte
    // reste active, elle refuse simplement d'en prendre davantage.
    const clientId = await creerClient();
    const carteId = await ouvrirCarte(clientId, 500);
    await encaisser(carteId, 500, 31);

    const { error } = await collecteur.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      carte_id: carteId,
      montant: 500,
      encaisse_le: new Date().toISOString(),
    });

    expect(error?.message).toContain('CYCLE_COMPLET');

    const { data } = await collecteur.client
      .from('cartes')
      .select('statut')
      .eq('id', carteId)
      .single();
    expect((data as { statut: string }).statut).toBe('active');
  });

  it('accepte d’ouvrir une carte pendant qu’une carte pleine reste active', async () => {
    const clientId = await creerClient();
    const pleine = await ouvrirCarte(clientId, 500);
    await encaisser(pleine, 500, 31);

    const carteId = crypto.randomUUID();
    const { error } = await collecteur.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: collecteur.id, client_id: clientId, mise: 500 });

    expect(error).toBeNull();
  });

  it('refuse toujours une carte sur le client d’un autre collecteur', async () => {
    // `cartes_client_du_meme_collecteur` n'est pas l'index qu'on lève. Il tient.
    const autre = await creerCollecteur(`Autre ${MARQUE}`, `+225072${MARQUE}`);
    const clientId = await creerClient();

    const { error } = await autre.client.from('cartes').insert({
      id: crypto.randomUUID(),
      collecteur_id: autre.id,
      client_id: clientId,
      mise: 1000,
    });

    expect(error).not.toBeNull();
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```bash
npm run db:reset && npm run test:db -- cartes-multiples
```

Attendu : **ÉCHEC**. Les trois premiers tests de la première `describe` échouent
sur une violation de contrainte unique — message contenant
`cartes_une_active_par_client`. Les tests de la seconde `describe` passent déjà,
sauf `accepte d'ouvrir une carte pendant qu'une carte pleine reste active`, qui
échoue pour la même raison.

- [ ] **Étape 3 : écrire la migration**

Créer `supabase/migrations/20260825090000_cartes_multiples.sql` :

```sql
-- Kolek — un client peut détenir plusieurs cartes actives
--
-- Le cadrage de Phase 1 posait l'inverse, et le défendait ainsi : « deux carnets
-- ouverts en même temps sur le même client, c'est deux soldes à retenir, et la
-- première dispute au moment de rendre l'argent ».
--
-- L'objection valait pour le carnet papier. Une application ne retient pas, elle
-- affiche. Chaque carte porte son solde ; `retraits.carte_id` est unique, donc on
-- rend l'argent d'une carte et jamais d'un client ; et l'écran de retrait liste
-- des cartes, pas des personnes. Ce que le papier ne pouvait pas tenir, la base
-- le tient depuis le premier jour.
--
-- Le besoin est double, et les deux sont réels : un client épargne pour deux
-- choses à deux rythmes, et un client qui a rempli sa carte veut souvent
-- continuer plutôt que reprendre son argent. Ce second cas ne demandait rien de
-- plus que cette suppression : une carte à 31/31 reste `active` et refuse les
-- mises suivantes sans se clôturer, donc son solde reste dû. Seul l'index
-- empêchait d'en ouvrir une à côté.
--
-- Rien d'autre ne bouge. `mises_avant_insert` refuse toujours au-delà de 31,
-- impose toujours le montant de la carte, et décide toujours seul
-- `est_commission` — donc chaque carte porte sa propre commission à sa première
-- mise. `cartes_client_du_meme_collecteur` tient. Les politiques RLS portent sur
-- le collecteur, jamais sur le nombre de cartes.
drop index if exists public.cartes_une_active_par_client;
```

- [ ] **Étape 4 : corriger le commentaire devenu faux dans la migration d'origine**

Dans `supabase/migrations/20260815135037_socle_collecteurs.sql`, remplacer les
lignes 60 à 62 :

```sql
-- Décision de cadrage Phase 1 : un client possède une seule carte active à la fois.
create unique index cartes_une_active_par_client
  on public.cartes(client_id) where statut = 'active';
```

par :

```sql
-- Décision de cadrage Phase 1 : un client possède une seule carte active à la fois.
--
-- Levée le 2026-08-25 par `20260825090000_cartes_multiples.sql`, qui porte le
-- raisonnement. L'index reste créé ici : une migration ne se réécrit pas après
-- coup, sinon les bases déjà migrées et les bases neuves cessent d'avoir la même
-- histoire. Ce renvoi existe pour qu'on ne cherche pas longtemps pourquoi il a
-- disparu.
create unique index cartes_une_active_par_client
  on public.cartes(client_id) where statut = 'active';
```

- [ ] **Étape 5 : relancer le test et vérifier qu'il passe**

```bash
npm run db:reset && npm run test:db -- cartes-multiples
```

Attendu : **7 tests au vert.**

- [ ] **Étape 6 : vérifier qu'aucun test de base existant ne casse**

```bash
npm run test:db
```

Attendu : tous verts. Si `ecritures-collecteur.test.ts` ou
`cloture-carte.test.ts` échoue, c'est qu'un test s'appuyait sur l'unicité levée —
le corriger en nommant explicitement la carte visée, jamais en remettant l'index.

- [ ] **Étape 7 : commit**

```bash
git add supabase/migrations/20260825090000_cartes_multiples.sql \
        supabase/migrations/20260815135037_socle_collecteurs.sql \
        supabase/tests/cartes-multiples.test.ts
git commit -m "feat(cartes): un client peut tenir plusieurs carnets à la fois"
```

---

## Tâche 2 — `ouvrirCarte` perd la branche que l'index nourrissait

**Fichiers**
- Modifier : `apps/collecteur/src/ecritures.ts:262-320`

**Interfaces**
- Consomme : la tâche 1 — sans elle, la branche supprimée est encore atteignable
- Produit : `ouvrirCarte(collecteurId, clientId, mise)` inchangée en signature,
  qui ne rend plus jamais le code d'échec `CARTE_ACTIVE_EXISTANTE`

- [ ] **Étape 1 : vérifier qu'aucun test ne dépend du code supprimé**

```bash
cd apps/collecteur && grep -rn "CARTE_ACTIVE_EXISTANTE" src/
```

Attendu : uniquement `src/ecritures.ts`. S'il apparaît dans un `.test.ts`,
supprimer ce test dans la même étape — il vérifie une règle qui n'existe plus.

- [ ] **Étape 2 : réécrire l'en-tête d'`ouvrirCarte`**

Dans `apps/collecteur/src/ecritures.ts`, remplacer le bloc de commentaire qui va
de « ## La contrainte qui gouverne ce geste » jusqu'à la fin du commentaire par :

```ts
 * ## Plusieurs carnets à la fois
 *
 * Jusqu'au 2026-08-25, `cartes_une_active_par_client` imposait de clôturer
 * l'ancienne carte avant d'en ouvrir une nouvelle — c'est-à-dire de rendre
 * l'argent. C'était présenté ici comme « la règle du métier rendue inviolable :
 * deux carnets ouverts, c'est deux soldes à retenir, et la première dispute au
 * moment de rendre l'argent ».
 *
 * L'objection valait pour le carnet papier. Une application ne retient pas, elle
 * affiche : chaque carte porte son solde, et `retraits.carte_id` est unique, donc
 * on rend l'argent d'une carte et jamais d'un client. La contrainte est levée par
 * `20260825090000_cartes_multiples.sql`, qui porte le raisonnement complet.
 *
 * Conséquence sur ce geste : il ne peut plus échouer pour cause de carte déjà
 * ouverte. Le refus `23505` qui était traduit ici est devenu inatteignable, et la
 * branche a été retirée plutôt que laissée en veille.
 */
```

- [ ] **Étape 3 : supprimer la branche morte**

Toujours dans `ouvrirCarte`, remplacer :

```ts
  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        echec: {
          code: 'CARTE_ACTIVE_EXISTANTE',
          message:
```

...ainsi que le reste de ce `if` imbriqué, par un traitement d'erreur simple :

```ts
  if (error) return { ok: false, echec: echec(error) };
```

- [ ] **Étape 4 : vérifier la compilation et les tests**

```bash
cd apps/collecteur && npx tsc -b && npx vitest run
```

Attendu : compilation sans erreur, tous les tests verts.

- [ ] **Étape 5 : commit**

```bash
git add apps/collecteur/src/ecritures.ts
git commit -m "refactor(cartes): un refus que la base ne prononce plus"
```

---

## Tâche 3 — `CarteCloturable` porte l'identifiant du client

**Fichiers**
- Modifier : `apps/collecteur/src/lectures-ecrans.ts:420-460`

**Interfaces**
- Consomme : rien
- Produit :

```ts
export interface CarteCloturable {
  carteId: string;
  clientId: string;      // ← ajouté
  clientNom: string;
  mise: number;
  misesEncaissees: number;
  restituable: number;
  cycleComplet: boolean;
}
```

  La tâche 7 en dépend : le bouton « Activer une carte » de l'écran Retrait a
  besoin du `clientId` pour appeler `ouvrirCarte`.

- [ ] **Étape 1 : ajouter le champ à l'interface**

```ts
export interface CarteCloturable {
  carteId: string;
  /** Nécessaire pour ouvrir une carte de plus depuis l'écran Retrait, quand le
      client préfère laisser son argent plutôt que le reprendre. Le `select`
      lisait déjà `client_id` pour résoudre le nom : c'est une propriété de plus
      dans l'objet, pas une requête de plus. */
  clientId: string;
  clientNom: string;
  mise: number;
  misesEncaissees: number;
  /** `(mises − 1) × mise` : la première mise est la commission du collecteur. */
  restituable: number;
  cycleComplet: boolean;
}
```

- [ ] **Étape 2 : le remplir dans `chargerCartesCloturables`**

Dans le `.map()` de `chargerCartesCloturables`, ajouter la ligne :

```ts
    .map((c) => ({
      carteId: c.id,
      clientId: c.client_id,
      clientNom: noms.get(c.client_id) ?? 'Client',
      mise: c.mise,
      misesEncaissees: c.mises_encaissees,
      restituable: soldeRestituable(c.mises_encaissees, c.mise),
      cycleComplet: c.mises_encaissees >= MISES_PAR_CYCLE,
    }))
```

Le `select` n'est pas touché : il lit déjà `client_id`.

- [ ] **Étape 3 : vérifier la compilation**

```bash
cd apps/collecteur && npx tsc -b
```

Attendu : aucune erreur.

- [ ] **Étape 4 : commit**

```bash
git add apps/collecteur/src/lectures-ecrans.ts
git commit -m "feat(retrait): la carte à clôturer sait de quel client elle est"
```

---

## Tâche 4 — `ActiverCarte`, le bloc partagé par les trois écrans

**Fichiers**
- Créer : `apps/collecteur/src/ecrans/ActiverCarte.tsx`
- Créer : `apps/collecteur/src/ecrans/ActiverCarte.test.tsx`

**Interfaces**
- Consomme : `ouvrirCarte` (tâche 2), `ChoixMise` de `./ChoixMise`
- Produit :

```ts
export function ActiverCarte(props: {
  clientId: string;
  /** Montant proposé d'entrée. Celui de la carte qui vient d'être remplie. */
  misePreremplie: number;
  /** Distingue deux instances dans un même document (voir `ChoixMise`). */
  identifiant: string;
  onOuverte: () => void;
}): JSX.Element;
```

  Les tâches 5, 6 et 7 l'utilisent telle quelle.

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `apps/collecteur/src/ecrans/ActiverCarte.test.tsx` :

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Le bloc qui ouvre une carte de plus, sans clôturer celle qui est pleine.
 *
 * Il vit dans un fichier à lui parce que trois écrans le montrent — la liste des
 * clients, la fiche, et l'écran de retrait. Écrit trois fois, il divergerait à la
 * première correction ; et le montant prérempli, en particulier, est le genre de
 * détail qu'on oublie de reporter.
 */

const ouvrirCarte = vi.fn();
const getUser = vi.fn();

vi.mock('../ecritures', () => ({
  ouvrirCarte: (...args: unknown[]) => ouvrirCarte(...args),
}));

vi.mock('../supabase', () => ({
  supabase: { auth: { getUser: () => getUser() } },
}));

const { ActiverCarte } = await import('./ActiverCarte');

const CLIENT = '33333333-3333-4333-8333-333333333333';
const COLLECTEUR = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  getUser.mockResolvedValue({ data: { user: { id: COLLECTEUR } } });
  ouvrirCarte.mockResolvedValue({ ok: true, carteId: 'c1' });
});

afterEach(() => {
  cleanup();
  ouvrirCarte.mockReset();
  getUser.mockReset();
});

describe('activer une carte de plus', () => {
  it('propose le montant de la carte qui vient d’être remplie', async () => {
    render(
      <ActiverCarte
        clientId={CLIENT}
        misePreremplie={5000}
        identifiant="essai"
        onOuverte={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));

    // Le cas courant est de reprendre au même rythme. Le cas utile est d'en
    // changer — « 500 FCFA en saison creuse, 2 000 quand le commerce marche » —
    // donc le montant est proposé, pas imposé.
    //
    // `.checked` et non `toBeChecked()` : le dépôt n'installe pas
    // `@testing-library/jest-dom`, et ses matchers ne sont donc pas disponibles.
    const choisi = (await screen.findByRole('radio', { name: /5\s?000/ })) as HTMLInputElement;
    expect(choisi.checked).toBe(true);
  });

  it('ouvre la carte au montant retenu', async () => {
    const onOuverte = vi.fn();
    render(
      <ActiverCarte
        clientId={CLIENT}
        misePreremplie={5000}
        identifiant="essai"
        onOuverte={onOuverte}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    // `findBy…` et non `getBy…` : la lecture de session est asynchrone, et le
    // bouton reste désactivé tant que `collecteurId` est nul.
    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir la carte/ }));

    await vi.waitFor(() => expect(onOuverte).toHaveBeenCalled());
    expect(ouvrirCarte).toHaveBeenCalledWith(COLLECTEUR, CLIENT, 5000);
  });

  it('affiche le refus du serveur sans fermer le bloc', async () => {
    ouvrirCarte.mockResolvedValue({
      ok: false,
      echec: { code: 'MISE_HORS_BORNES', message: 'La mise doit être comprise entre 500 et 10000 FCFA.' },
    });
    const onOuverte = vi.fn();

    render(
      <ActiverCarte
        clientId={CLIENT}
        misePreremplie={5000}
        identifiant="essai"
        onOuverte={onOuverte}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activer une carte' }));
    fireEvent.click(await screen.findByRole('button', { name: /Ouvrir la carte/ }));

    expect((await screen.findByRole('alert')).textContent).toContain('500');
    // Refermer effacerait le montant choisi et obligerait à tout refaire.
    expect(onOuverte).not.toHaveBeenCalled();
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```bash
cd apps/collecteur && npx vitest run src/ecrans/ActiverCarte.test.tsx
```

Attendu : **ÉCHEC** — `Failed to resolve import "./ActiverCarte"`.

- [ ] **Étape 3 : écrire le composant**

Créer `apps/collecteur/src/ecrans/ActiverCarte.tsx` :

```tsx
import { Bouton } from '@kolek/ui';
import { useEffect, useState } from 'react';

import { ouvrirCarte } from '../ecritures';
import { supabase } from '../supabase';
import { ChoixMise } from './ChoixMise';

/**
 * Ouvrir une carte de plus, sans toucher à celle qui est pleine.
 *
 * C'est la seconde porte du carrefour de fin de cycle. La première rend l'argent
 * et clôture ; celle-ci laisse le solde chez le collecteur et rouvre un cycle.
 * Rien à inventer en base pour cela : une carte à 31/31 reste `active` et refuse
 * simplement d'en prendre davantage, donc son solde reste dû tant qu'aucun
 * retrait n'a eu lieu.
 *
 * Le bloc est replié par défaut. Déplié, il montre le montant et demande une
 * confirmation : ouvrir une carte engage une commission — la première mise du
 * nouveau cycle — et cela ne se déclenche pas d'un doigt qui glisse.
 *
 * Un fichier à part pour trois appelants : la liste des clients, la fiche, et
 * l'écran de retrait. Écrit trois fois, il divergerait à la première correction.
 */
export function ActiverCarte({
  clientId,
  misePreremplie,
  identifiant,
  onOuverte,
}: {
  clientId: string;
  /** Le montant de la carte qui vient d'être remplie. Proposé, pas imposé. */
  misePreremplie: number;
  /** Préfixe des `id` du choix de mise : deux blocs peuvent coexister. */
  identifiant: string;
  onOuverte: () => void;
}) {
  const [deplie, setDeplie] = useState(false);
  const [mise, setMise] = useState(misePreremplie);
  const [collecteurId, setCollecteurId] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    // `collecteur_id` accompagne l'écriture : la politique RLS l'exige au
    // `with check`. Même lecture que dans `FicheClient` — la faire passer à
    // travers cinq composants pour un usage unique coûte plus qu'une lecture
    // de session.
    void supabase.auth.getUser().then(({ data }) => setCollecteurId(data.user?.id ?? null));
  }, []);

  async function ouvrir() {
    if (!collecteurId) return;
    setEnvoi(true);
    setErreur(null);
    const resultat = await ouvrirCarte(collecteurId, clientId, mise);
    setEnvoi(false);
    if (!resultat.ok) {
      // Le bloc reste ouvert : le refermer effacerait le montant choisi et
      // obligerait à tout refaire pour lire la raison du refus.
      setErreur(resultat.echec.message);
      return;
    }
    setDeplie(false);
    onOuverte();
  }

  if (!deplie) {
    return (
      <Bouton variante="contour" icone="plus" onClick={() => setDeplie(true)}>
        Activer une carte
      </Bouton>
    );
  }

  return (
    <div className="border border-hairline rounded-md p-3 space-y-3">
      <p className="font-body text-sm text-ink m-0">
        La carte pleine reste ouverte, et son solde reste dû au client.
      </p>

      <ChoixMise mise={mise} onChoisir={setMise} identifiant={identifiant} />

      {erreur && (
        <p role="alert" className="font-body text-sm text-negative m-0">
          {erreur}
        </p>
      )}

      <div className="flex gap-2">
        <Bouton onClick={ouvrir} disabled={envoi || collecteurId === null}>
          {envoi ? 'Ouverture…' : 'Ouvrir la carte'}
        </Bouton>
        <Bouton variante="contour" onClick={() => setDeplie(false)}>
          Annuler
        </Bouton>
      </div>
    </div>
  );
}
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

```bash
cd apps/collecteur && npx vitest run src/ecrans/ActiverCarte.test.tsx
```

Attendu : **3 tests au vert.** Si la recherche du `radio` échoue, ouvrir
`ChoixMise.tsx` et voir ce qu'il rend réellement : s'il n'emploie pas
`input type="radio"` avec une étiquette, ajuster le sélecteur du test à ce qui
existe — jamais le composant à ce que le test espérait.

- [ ] **Étape 5 : commit**

```bash
git add apps/collecteur/src/ecrans/ActiverCarte.tsx apps/collecteur/src/ecrans/ActiverCarte.test.tsx
git commit -m "feat(cartes): la seconde porte de fin de cycle, écrite une seule fois"
```

---

## Tâche 5 — La liste des clients devient une liste de cartes

**Fichiers**
- Modifier : `apps/collecteur/src/ecrans/Clients.tsx`
- Créer : `apps/collecteur/src/ecrans/Clients.test.tsx`

**Interfaces**
- Consomme : `ActiverCarte` (tâche 4), la base des cartes multiples (tâche 1)
- Produit : rien que d'autres tâches consomment

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `apps/collecteur/src/ecrans/Clients.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
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
  { id: 'cli2', nom: 'Ka', marche: null, telephone: null, avis_actifs: false },
];

/** Deux cartes actives pour Hj, aucune active pour Ka. */
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
];

function brancherSupabase() {
  from.mockImplementation((table: string) => {
    if (table === 'clients') {
      return { select: () => ({ order: () => Promise.resolve({ data: CLIENTS, error: null }) }) };
    }
    return { select: () => Promise.resolve({ data: CARTES, error: null }) };
  });
}

function rendre() {
  return render(
    <Clients
      collecteurId="col1"
      revision={0}
      ouvrirFormulaire={false}
      onFormulaireVu={vi.fn()}
      onDeconnexion={vi.fn()}
      onEncaisser={vi.fn()}
      onEcriture={vi.fn()}
      onNaviguer={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
  from.mockReset();
});

describe('liste des clients devenue liste de cartes', () => {
  it('rend une ligne par carte active', async () => {
    brancherSupabase();
    rendre();

    // Hj tient deux carnets : deux lignes, pas une.
    expect(await screen.findAllByText('Hj')).toHaveLength(2);
  });

  it('donne à chaque ligne son propre bouton d’encaissement', async () => {
    brancherSupabase();
    rendre();

    const boutons = await screen.findAllByRole('button', { name: 'Encaisser' });
    expect(boutons).toHaveLength(2);
  });

  it('distingue deux cartes par leur date d’ouverture', async () => {
    brancherSupabase();
    rendre();

    // Les mises sont immuables : encaisser sur la mauvaise carte n'est pas
    // rattrapable. La date d'ouverture est ce qui sépare deux lignes de même
    // montant.
    expect(await screen.findByText(/1 août/)).toBeTruthy();
    expect(await screen.findByText(/2 juil/)).toBeTruthy();
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
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```bash
cd apps/collecteur && npx vitest run src/ecrans/Clients.test.tsx
```

Attendu : **ÉCHEC** — `findAllByText('Hj')` rend une seule ligne, et les dates
d'ouverture sont absentes.

- [ ] **Étape 3 : lire `ouverte_le` et remplacer la `Map` par un dépliage**

Dans `apps/collecteur/src/ecrans/Clients.tsx`, ajouter le champ au type :

```ts
interface CarteClient {
  id: string;
  client_id: string;
  mise: number;
  statut: 'active' | 'cloturee';
  mises_encaissees: number;
  /** Ce qui distingue deux cartes actives de même montant. */
  ouverte_le: string;
}
```

Élargir le `select` des cartes :

```ts
          supabase
            .from('cartes')
            .select('id, client_id, mise, statut, mises_encaissees, ouverte_le'),
```

Remplacer le type `Ligne` par une union :

```ts
/**
 * Une ligne de la liste.
 *
 * Le type est une union parce que la liste porte deux choses différentes, et
 * qu'un champ `carte: CarteClient | null` obligeait chaque lecteur à retester la
 * nullité — ce qui est exactement l'erreur que l'ancienne `Map` fabriquait.
 */
type Ligne =
  | { genre: 'carte'; cle: string; client: Client; carte: CarteClient }
  | { genre: 'client'; cle: string; client: Client };
```

Remplacer le bloc qui construisait `parClient` et `setLignes` par :

```ts
        const clients = (reponseClients.data ?? []) as Client[];
        const cartes = (reponseCartes.data ?? []) as CarteClient[];

        const parClient = new Map<string, CarteClient[]>();
        for (const carte of cartes) {
          const liste = parClient.get(carte.client_id);
          if (liste) liste.push(carte);
          else parClient.set(carte.client_id, [carte]);
        }

        // Les clients arrivent déjà triés par nom. Les cartes d'un même client
        // sont rangées par avancement décroissant : celle qui se termine en
        // premier est celle qu'il ne faut pas oublier.
        const construites: Ligne[] = [];
        for (const client of clients) {
          const siennes = (parClient.get(client.id) ?? [])
            .filter((k) => k.statut === 'active')
            .sort((a, b) => b.mises_encaissees - a.mises_encaissees);

          if (siennes.length === 0) {
            construites.push({ genre: 'client', cle: client.id, client });
            continue;
          }
          for (const carte of siennes) {
            construites.push({ genre: 'carte', cle: carte.id, client, carte });
          }
        }

        setLignes(construites);
```

**Attention :** ce dépliage ne garde que les cartes actives. Le filtre
`Clôturées` a donc besoin des cartes brutes. Conserver la liste complète dans un
état voisin :

```ts
  const [toutesCartes, setToutesCartes] = useState<CarteClient[]>([]);
```

et l'alimenter avec `setToutesCartes(cartes)` juste avant `setLignes`.

- [ ] **Étape 4 : redéfinir les filtres**

Remplacer le corps du `useMemo` `visibles` :

```ts
  const visibles = useMemo(() => {
    if (!lignes) return [];
    const terme = recherche.trim().toLowerCase();

    // `Clôturées` ne lit pas `lignes` : le dépliage n'y met que les cartes
    // actives. Il repart des cartes brutes, et se construit ses propres lignes.
    if (filtre === 'Clôturées') {
      const nomParClient = new Map(lignes.map((l) => [l.client.id, l.client]));
      return toutesCartes
        .filter((k) => k.statut === 'cloturee')
        .flatMap<Ligne>((carte) => {
          const client = nomParClient.get(carte.client_id);
          if (!client) return [];
          if (terme && !client.nom.toLowerCase().includes(terme)) return [];
          return [{ genre: 'carte', cle: carte.id, client, carte }];
        });
    }

    return lignes.filter((l) => {
      if (terme && !l.client.nom.toLowerCase().includes(terme)) return false;
      if (filtre === 'Avec carte') return l.genre === 'carte';
      // `Sans carte` valait « aucune carte, jamais ». Il vaut désormais « aucune
      // carte active » : c'est le filtre du geste à faire, ouvrir une carte.
      if (filtre === 'Sans carte') return l.genre === 'client';
      return true;
    });
  }, [lignes, toutesCartes, recherche, filtre]);
```

- [ ] **Étape 5 : adapter `LigneClient` aux deux genres**

Changer la signature et le corps de `LigneClient` pour qu'il reçoive une `Ligne` :

```tsx
function LigneClient({
  ligne,
  onEncaisser,
  onConsentementChange,
  onOuvrirFiche,
}: {
  ligne: Ligne;
  onEncaisser: (carte: CarteChoisie) => void;
  onConsentementChange: () => void;
  onOuvrirFiche: () => void;
}) {
```

À l'intérieur, remplacer `const carte = ligne.carte;` par :

```tsx
  const carte = ligne.genre === 'carte' ? ligne.carte : null;
  const client = ligne.client;
  const encaissees = carte?.mises_encaissees ?? 0;
```

Remplacer chaque `ligne.nom` par `client.nom`, chaque `ligne.marche` par
`client.marche`, chaque `ligne.id` par `client.id`, et `ligne.avisActifs` par
`client.avis_actifs`.

Le badge distingue désormais trois états :

```tsx
  const statut: Statut | null =
    carte === null
      ? null
      : carte.statut === 'cloturee'
        ? 'Clôturée'
        : encaissees >= MISES_PAR_CYCLE
          ? 'Cycle complet'
          : 'À jour';
```

Le sous-titre porte la date d'ouverture :

```tsx
  const sousTitre =
    carte === null
      ? (client.marche ?? 'Pas encore de carte')
      : `Mise ${formatMontant(carte.mise)} FCFA · ${encaissees}/${MISES_PAR_CYCLE} · ouverte le ${dateCourte(carte.ouverte_le)}`;
```

Ajouter le formateur en haut du fichier :

```ts
/** « 1 août » : assez pour distinguer deux cartes, assez court pour une ligne. */
function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
```

- [ ] **Étape 6 : mettre le carrefour dans la ligne**

Remplacer le bouton d'encaissement unique par le carrefour :

```tsx
  const complete = carte !== null && carte.statut === 'active' && encaissees >= MISES_PAR_CYCLE;
  const encaissable = carte !== null && carte.statut === 'active' && !complete;
```

et, à l'endroit du bouton :

```tsx
      {complete ? (
        // Le cycle est fini : la décision appartient au client. Un bouton
        // d'encaissement éteint ne la lui poserait pas.
        <div className="flex flex-wrap gap-2 mt-3">
          <Bouton variante="contour" icone="arrow-up-right" onClick={onOuvrirFiche}>
            Retirer
          </Bouton>
          <ActiverCarte
            clientId={client.id}
            misePreremplie={carte.mise}
            identifiant={`ligne-${carte.id}`}
            onOuverte={onConsentementChange}
          />
        </div>
      ) : encaissable ? (
        <Bouton
          className="mt-3"
          icone="circle-dollar-sign"
          onClick={() =>
            onEncaisser({
              carteId: carte.id,
              clientNom: client.nom,
              mise: carte.mise,
              misesEncaissees: encaissees,
            })
          }
        >
          Encaisser
        </Bouton>
      ) : null}
```

**Le libellé est exactement `Encaisser`**, sans complément : le test de l'étape 1
le cherche par ce nom, et deux lignes du même client donneraient sinon deux
boutons impossibles à distinguer pour un lecteur d'écran.

**La ligne d'un client sans carte active ne reçoit aucun bouton.** Elle garde le
comportement existant — toucher la ligne ouvre la fiche, et c'est là que
`OuvrirCarte` vit déjà. Y dupliquer un bloc d'ouverture ferait deux chemins vers
le même geste, et `ActiverCarte` dirait une phrase fausse : il annonce que la
carte pleine reste ouverte, or il n'y en a pas.

Importer `ActiverCarte` en tête de fichier :

```ts
import { ActiverCarte } from './ActiverCarte';
```

- [ ] **Étape 7 : lancer le test et vérifier qu'il passe**

```bash
cd apps/collecteur && npx vitest run src/ecrans/Clients.test.tsx
```

Attendu : **5 tests au vert.**

- [ ] **Étape 8 : vérifier que rien d'autre ne casse**

```bash
cd apps/collecteur && npx tsc -b && npx vitest run && npx oxlint
```

Attendu : compilation propre, tous les tests verts, aucune erreur de lint.

- [ ] **Étape 9 : commit**

```bash
git add apps/collecteur/src/ecrans/Clients.tsx apps/collecteur/src/ecrans/Clients.test.tsx
git commit -m "feat(clients): la liste montre des cartes, parce que le geste porte sur une carte"
```

---

## Tâche 6 — La fiche montre toutes les cartes en cours

**Fichiers**
- Modifier : `apps/collecteur/src/ecrans/FicheClient.tsx:84-135`
- Créer : `apps/collecteur/src/ecrans/FicheClient.test.tsx`

**Interfaces**
- Consomme : `ActiverCarte` (tâche 4), `chargerFicheClient` (inchangée)
- Produit : rien que d'autres tâches consomment

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `apps/collecteur/src/ecrans/FicheClient.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * La fiche client, qui n'affichait qu'une carte sur plusieurs.
 *
 * `chargerFicheClient` rendait déjà la liste complète, triée par date
 * d'ouverture ; c'est l'écran qui n'en gardait qu'une, par un `.find()`. D'où son
 * titre « Carte en cours », au singulier — le défaut se lisait dans le libellé.
 */

const chargerFicheClient = vi.fn();

vi.mock('../lectures-ecrans', () => ({
  chargerFicheClient: (id: string) => chargerFicheClient(id),
}));

vi.mock('../ecritures', () => ({
  definirConsentementAvis: vi.fn(),
  ouvrirCarte: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: { auth: { getUser: () => Promise.resolve({ data: { user: { id: 'col1' } } }) } },
}));

const { FicheClient } = await import('./FicheClient');

const FICHE_DEUX_CARTES = {
  id: 'cli1',
  nom: 'Hj',
  telephone: null,
  marche: 'Sokourani',
  activite: null,
  avisActifs: false,
  cartes: [
    {
      id: 'k1',
      mise: 5000,
      statut: 'active' as const,
      misesEncaissees: 31,
      ouverteLe: '2026-08-01T08:00:00.000Z',
      clotureeLe: null,
    },
    {
      id: 'k2',
      mise: 1000,
      statut: 'active' as const,
      misesEncaissees: 17,
      ouverteLe: '2026-07-02T08:00:00.000Z',
      clotureeLe: null,
    },
  ],
  mises: [],
};

afterEach(() => {
  cleanup();
  chargerFicheClient.mockReset();
});

describe('fiche d’un client à plusieurs cartes', () => {
  it('montre les deux cartes en cours, pas une', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES);

    render(
      <FicheClient
        clientId="cli1"
        revision={0}
        onFermer={vi.fn()}
        onEncaisser={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    expect(await screen.findByText(/Cartes en cours/)).toBeTruthy();
    expect(await screen.findAllByText(/FCFA/)).not.toHaveLength(0);
  });

  it('offre les deux portes sur la carte au bout de son cycle', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES);

    render(
      <FicheClient
        clientId="cli1"
        revision={0}
        onFermer={vi.fn()}
        onEncaisser={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    // Un choix offert à un endroit et pas aux autres se lit comme un défaut.
    expect(await screen.findByRole('button', { name: 'Aller au retrait' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Activer une carte' })).toBeTruthy();
  });

  it('ne promet plus que la nouvelle carte attend le retrait', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES);

    render(
      <FicheClient
        clientId="cli1"
        revision={0}
        onFermer={vi.fn()}
        onEncaisser={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );

    await screen.findByText(/Cartes en cours/);
    // « La nouvelle carte s'ouvre ensuite » était la règle d'une seule carte
    // active. Elle est tombée avec l'index.
    expect(screen.queryByText(/s’ouvre ensuite/)).toBeNull();
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```bash
cd apps/collecteur && npx vitest run src/ecrans/FicheClient.test.tsx
```

Attendu : **ÉCHEC** — le texte « Cartes en cours » n'existe pas, et le bouton
« Activer une carte » non plus.

- [ ] **Étape 3 : passer de `active` à `actives`**

Dans `apps/collecteur/src/ecrans/FicheClient.tsx`, remplacer la ligne 84 :

```ts
  const active = fiche?.cartes.find((k) => k.statut === 'active') ?? null;
  const complete = active !== null && active.misesEncaissees >= MISES_PAR_CYCLE;
```

par :

```ts
  // La plus avancée d'abord : c'est celle dont le cycle se termine en premier,
  // donc celle sur laquelle une décision se présente le plus tôt.
  const actives = (fiche?.cartes ?? [])
    .filter((k) => k.statut === 'active')
    .sort((a, b) => b.misesEncaissees - a.misesEncaissees);
```

- [ ] **Étape 4 : rendre une carte par bloc**

Remplacer le bloc `{active ? (…) : (…)}` par une boucle :

```tsx
          {actives.length > 0 ? (
            <section>
              <p className="font-headings font-bold text-base text-ink mb-2">
                {actives.length > 1 ? 'Cartes en cours' : 'Carte en cours'}
              </p>
              {actives.map((carte, rang) => (
                <CarteEnCours
                  key={carte.id}
                  carte={carte}
                  nomClient={fiche.nom}
                  cycle={fiche.cartes.length - rang}
                  clientId={fiche.id}
                  onEncaisser={onEncaisser}
                  onRetrait={onRetrait}
                  onEcriture={onEcriture}
                />
              ))}
            </section>
          ) : (
            <OuvrirCarte
              clientId={fiche.id}
              premiere={fiche.cartes.length === 0}
              onOuverte={onEcriture}
            />
          )}
```

- [ ] **Étape 5 : écrire le composant `CarteEnCours`**

Ajouter en bas de `FicheClient.tsx` :

```tsx
/**
 * Une carte en cours, et ce qu'on peut en faire.
 *
 * Sous 31 mises, un seul geste : encaisser. À 31, le cycle est fini et la
 * décision appartient au client — reprendre son argent, ou le laisser et repartir
 * sur une carte de plus. Les deux portes se valent, donc les deux boutons se
 * valent.
 */
function CarteEnCours({
  carte,
  nomClient,
  cycle,
  clientId,
  onEncaisser,
  onRetrait,
  onEcriture,
}: {
  carte: CarteFiche;
  nomClient: string;
  cycle: number;
  clientId: string;
  onEncaisser: (carte: CarteChoisie) => void;
  onRetrait: () => void;
  onEcriture: () => void;
}) {
  const complete = carte.misesEncaissees >= MISES_PAR_CYCLE;

  return (
    <div className="mb-4">
      <CarteCollecte
        nomClient={nomClient}
        misePar={formatMontant(carte.mise)}
        jourCourant={carte.misesEncaissees}
        solde={formatMontant(soldeRestituable(carte.misesEncaissees, carte.mise))}
        cycle={String(cycle)}
      />

      {complete ? (
        <div className="bg-positive-tint rounded-md p-3 mt-3 space-y-3">
          <div>
            <p className="font-body text-sm text-ink m-0">
              Cycle terminé — {MISES_PAR_CYCLE} mises sur {MISES_PAR_CYCLE}.
            </p>
            <p className="font-body text-xs text-muted-foreground mt-1">
              Tu peux lui rendre ses{' '}
              {formatMontant(soldeRestituable(carte.misesEncaissees, carte.mise))} FCFA, ou lui
              activer une carte de plus. Tant qu'il n'y a pas de retrait, cette carte reste
              ouverte et son solde lui est dû.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Bouton variante="contour" icone="arrow-up-right" onClick={onRetrait}>
              Aller au retrait
            </Bouton>
            <ActiverCarte
              clientId={clientId}
              misePreremplie={carte.mise}
              identifiant={`fiche-${carte.id}`}
              onOuverte={onEcriture}
            />
          </div>
        </div>
      ) : (
        <Bouton
          pleineLargeur
          className="mt-3"
          icone="circle-dollar-sign"
          onClick={() =>
            onEncaisser({
              carteId: carte.id,
              clientNom: nomClient,
              mise: carte.mise,
              misesEncaissees: carte.misesEncaissees,
            })
          }
        >
          Encaisser une mise
        </Bouton>
      )}
    </div>
  );
}
```

Importer `ActiverCarte` en tête de fichier, et vérifier que `CarteFiche` est bien
importé — il vient de `../lectures-ecrans` et n'était peut-être pas nommé
jusqu'ici, l'ancien code passant par l'inférence sur `fiche.cartes` :

```ts
import { ActiverCarte } from './ActiverCarte';
import { chargerFicheClient, type CarteFiche, type FicheClient as Fiche } from '../lectures-ecrans';
```

Si `CarteFiche` n'est pas exporté depuis `lectures-ecrans.ts`, l'exporter — le
type existe déjà dans ce fichier, il lui manque le mot-clé.

- [ ] **Étape 6 : lancer le test et vérifier qu'il passe**

```bash
cd apps/collecteur && npx vitest run src/ecrans/FicheClient.test.tsx
```

Attendu : **3 tests au vert.**

- [ ] **Étape 7 : vérifier l'ensemble**

```bash
cd apps/collecteur && npx tsc -b && npx vitest run && npx oxlint
```

- [ ] **Étape 8 : commit**

```bash
git add apps/collecteur/src/ecrans/FicheClient.tsx apps/collecteur/src/ecrans/FicheClient.test.tsx
git commit -m "feat(fiche): toutes les cartes en cours, et le choix au bout du cycle"
```

---

## Tâche 7 — L'écran Retrait dit « retrait », et ouvre la seconde porte

**Fichiers**
- Modifier : `apps/collecteur/src/ecrans/Retrait.tsx:180-200`
- Créer : `apps/collecteur/src/ecrans/Retrait.test.tsx`

**Interfaces**
- Consomme : `CarteCloturable.clientId` (tâche 3), `ActiverCarte` (tâche 4)
- Produit : rien que d'autres tâches consomment

- [ ] **Étape 1 : écrire le test qui échoue**

Créer `apps/collecteur/src/ecrans/Retrait.test.tsx` :

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * L'écran de retrait, et son vocabulaire.
 *
 * Il s'appelle Retrait, écrit dans `retraits`, et proposait « Clôturer cette
 * carte » : deux mots pour un geste, dans le même écran. Le mot qui reste est
 * retrait — c'est l'acte, et c'est le fait du point de vue du client. La clôture
 * en est la conséquence, et la confirmation porte les deux.
 *
 * Le code et la base gardent `cloturerCarte` et `statut = 'cloturee'` : renommer
 * à moitié coûterait plus cher que les deux vocabulaires actuels.
 */

const chargerCartesCloturables = vi.fn();

vi.mock('../lectures-ecrans', () => ({
  chargerCartesCloturables: () => chargerCartesCloturables(),
}));

vi.mock('../ecritures', () => ({ ouvrirCarte: vi.fn() }));
vi.mock('../edge', () => ({ cloturerCarte: vi.fn() }));
vi.mock('../supabase', () => ({
  supabase: { auth: { getUser: () => Promise.resolve({ data: { user: { id: 'col1' } } }) } },
}));

const { Retrait } = await import('./Retrait');

const CARTE_PLEINE = {
  carteId: 'k1',
  clientId: 'cli1',
  clientNom: 'Hj',
  mise: 1000,
  misesEncaissees: 31,
  restituable: 30000,
  cycleComplet: true,
};

afterEach(() => {
  cleanup();
  chargerCartesCloturables.mockReset();
});

describe('vocabulaire et portes de l’écran de retrait', () => {
  it('ne dit plus « clôturer » sur le bouton principal', async () => {
    chargerCartesCloturables.mockResolvedValue([CARTE_PLEINE]);

    render(<Retrait revision={0} onRetour={vi.fn()} onCloture={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Faire le retrait' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clôturer cette carte' })).toBeNull();
  });

  it('propose d’activer une carte juste à côté', async () => {
    chargerCartesCloturables.mockResolvedValue([CARTE_PLEINE]);

    render(<Retrait revision={0} onRetour={vi.fn()} onCloture={vi.fn()} />);

    // Le collecteur est déjà devant le client, l'argent à la main, quand celui-ci
    // dit « garde-le ». La porte doit être là, pas deux écrans plus loin.
    expect(await screen.findByRole('button', { name: 'Activer une carte' })).toBeTruthy();
  });

  it('nomme les deux faits dans la confirmation', async () => {
    chargerCartesCloturables.mockResolvedValue([CARTE_PLEINE]);

    render(<Retrait revision={0} onRetour={vi.fn()} onCloture={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Faire le retrait' }));

    const texte = (await screen.findByText(/Confirmer le retrait/)).textContent ?? '';
    expect(texte).toContain('30 000');
    // La carte se clôture : c'est définitif, et le taire serait pire que le dire.
    expect(texte).toContain('clôture');
  });
});
```

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

```bash
cd apps/collecteur && npx vitest run src/ecrans/Retrait.test.tsx
```

Attendu : **ÉCHEC** — le bouton s'appelle encore « Clôturer cette carte ».

Si l'import `../edge` n'existe pas sous ce nom, ouvrir `Retrait.tsx`, relever
d'où vient `cloturerCarte`, et corriger le `vi.mock` du test en conséquence.

- [ ] **Étape 3 : changer le vocabulaire visible et ajouter la seconde porte**

Dans `apps/collecteur/src/ecrans/Retrait.tsx`, remplacer le bloc d'actions :

```tsx
                  {!enConfirmation ? (
                    <Bouton variante="contour" onClick={() => setAConfirmer(carte)}>
                      Clôturer cette carte
                    </Bouton>
                  ) : (
```

par :

```tsx
                  {!enConfirmation ? (
                    // Deux portes, et elles se valent : rendre l'argent, ou le
                    // laisser et repartir sur une carte de plus. Le collecteur est
                    // devant le client quand celui-ci choisit — la seconde porte
                    // doit être ici, pas deux écrans plus loin.
                    <div className="flex flex-wrap gap-2">
                      <Bouton variante="contour" onClick={() => setAConfirmer(carte)}>
                        Faire le retrait
                      </Bouton>
                      {carte.cycleComplet && (
                        <ActiverCarte
                          clientId={carte.clientId}
                          misePreremplie={carte.mise}
                          identifiant={`retrait-${carte.carteId}`}
                          onOuverte={onCloture}
                        />
                      )}
                    </div>
                  ) : (
```

Dans le bloc de confirmation, remplacer le texte :

```tsx
                      <p className="font-body text-sm text-ink bg-info-tint rounded-md p-3">
                        Confirmer le retrait de{' '}
                        <strong>{formatMontant(carte.restituable)} FCFA</strong> pour{' '}
                        {carte.clientNom} ? La carte se clôture, c’est définitif.
                      </p>
```

et le bouton de confirmation :

```tsx
                        <Bouton onClick={confirmer} disabled={envoi}>
                          {envoi ? 'Retrait…' : 'Oui, faire le retrait'}
                        </Bouton>
```

Importer `ActiverCarte` en tête de fichier :

```ts
import { ActiverCarte } from './ActiverCarte';
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

```bash
cd apps/collecteur && npx vitest run src/ecrans/Retrait.test.tsx
```

Attendu : **3 tests au vert.**

- [ ] **Étape 5 : vérifier l'ensemble**

```bash
cd apps/collecteur && npx tsc -b && npx vitest run && npx oxlint
```

- [ ] **Étape 6 : commit**

```bash
git add apps/collecteur/src/ecrans/Retrait.tsx apps/collecteur/src/ecrans/Retrait.test.tsx
git commit -m "feat(retrait): un seul mot par geste, et la porte qui manquait à côté"
```

---

## Tâche 8 — Le libellé « dormante » ne doit pas accuser

**Fichiers**
- Modifier : `apps/collecteur/src/lectures-ecrans.ts:205` et l'écran qui l'affiche

**Interfaces**
- Consomme : rien
- Produit : rien

- [ ] **Étape 1 : relever le seuil et son libellé**

```bash
cd apps/collecteur && grep -rn "dormante\|dormant" src/
```

- [ ] **Étape 2 : décider, sur pièce**

Le cycle est un **compte de 31 mises, pas 31 jours de calendrier**. Aucune
contrainte de date en base, aucune obligation quotidienne : un client dépose quand
il veut et saute les jours qu'il veut.

Le seuil garde donc sa valeur — c'est un signal utile au collecteur, qui lui dit
où repasser. Seul le **libellé** est en cause :

- s'il dit « en retard », « impayé », « manquant » ou tout mot qui désigne une
  faute du client → le remplacer par « sans mise depuis N jours », qui est un
  fait et non un jugement
- s'il dit déjà « dormante » ou « sans mise depuis… » → **ne rien changer**, et
  passer à l'étape 4

- [ ] **Étape 3 : corriger le libellé si nécessaire**

Ne toucher qu'au texte visible. Le seuil, le calcul et le nom de la variable ne
bougent pas : c'est le mot montré au collecteur qui est en cause, pas la mesure.

- [ ] **Étape 4 : vérification complète du dépôt**

```bash
npm run db:reset && npm test --workspaces && npm run test:db
```

Attendu : tous verts.

- [ ] **Étape 5 : commit (seulement si l'étape 3 a modifié quelque chose)**

```bash
git add apps/collecteur/src/
git commit -m "fix(cartes): un signal de passage, pas un reproche au client"
```

---

## Vérification finale

- [ ] `npm run db:reset && npm run test:db` — tous verts
- [ ] `npm test --workspaces` — tous verts
- [ ] `cd apps/collecteur && npm run build` — sortie 0
- [ ] `cd apps/collecteur && npx oxlint` — aucune erreur (l'avertissement
      `gardeEnv is imported but never used` dans `vite.config.ts` préexiste et
      n'appartient pas à ce chantier)
- [ ] Sur un téléphone : un client à deux cartes montre deux lignes, chacune avec
      son bouton ; une carte à 31/31 montre **Retirer** et **Activer une carte**
      dans les trois écrans ; après activation, la carte pleine est toujours là
