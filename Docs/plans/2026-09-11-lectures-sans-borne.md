# Borner les lectures de l'application collecteur — plan d'implémentation

> **Pour un exécutant :** les étapes sont cochables (`- [ ]`). Elles se suivent
> dans l'ordre. Chaque tâche finit par un commit et laisse le dépôt vert.
> **Rien ne se pousse sans l'accord explicite de l'exploitant** : pousser `main`
> redéploie `app.kolek.cash` par Netlify, là où des collecteurs réels comptent
> de l'argent réel.

**But :** qu'aucune lecture de liste de l'application collecteur ne soit plus
tronquée en silence par `max_rows = 1000` — en commençant par celle qui
cassera la première en production.

**Outillage :** React 19, Vitest 4, TypeScript (`tsc -b` par application),
oxlint, pile Supabase locale pour l'épreuve en base. `chargerTout`
(`apps/collecteur/src/pagination.ts`) existe déjà et sert `chargerBilan` et
`Clients.tsx` depuis le 2026-09-09.

**Suite de :** `Docs/plans/2026-09-09-finition-classee-par-risque.md`, point
🟡 F, « Ce qui reste, et ce qu'il ne faut pas croire ».

---

## Ce que la relève du 2026-09-11 a trouvé

PostgREST applique `max_rows = 1000` **sans erreur et sans en-tête**. Une liste
coupée a exactement l'air d'une liste entière. Le point F nommait trois
fonctions ; la relève complète en trouve **sept**, et la plus exposée n'était
pas dans la liste.

| Fonction | Lectures sans borne | Ce que la troncature fait à l'écran | Plus gros collecteur, mesuré |
|---|---|---|---|
| `chargerAlertes` | `cartes`, `clients`, **`mises` sur 90 jours** | une mise coupée fait retomber sa carte sur la date d'ouverture : « 30 jours sans mise » pour un client passé hier | **579 mises en 30 jours** — plus de mille sur 90 jours d'ici deux à trois semaines |
| `chargerRapprochement` | `mises` et `retraits` du jour | le cash attendu, avant déclaration, ment vers le bas | 250 mises en une journée |
| `chargerCartesCloturables` | `cartes`, `clients` | des cartes absentes de l'écran Retrait : le collecteur ne peut plus rendre son argent à ces clients | 72 cartes |
| `chargerTableauCollecteur` (accueil, `lectures.ts`) | `clients`, `cartes` | l'encours — ce que le collecteur doit à ses clients — ment vers le bas | 64 clients |
| `chargerProfil` | `clients`, `cartes` | les deux compteurs plafonnent à 1000 | 64 clients |
| `chargerRecus` | `cartes`, `clients` | un reçu récent affiché « Client inconnu », mise 0 | — |
| `chargerEtatAvis` | `clients` | le compte des clients consentants plafonne à 1000 | — |

L'ordre des tâches suit la date probable de la première panne réelle, puis
l'argent, puis le reste.

## Ce qui reste sans `range`, et pourquoi c'est juste

| Lecture | Borne | Mesuré le 2026-09-11 |
|---|---|---|
| `chargerFicheClient` : `cartes` par `client_id` | un client | au plus 7 cartes par client |
| `chargerFicheClient` : `mises` `.in('carte_id', …)` | les cartes d'un client | au plus 7 × 31 = 217 lignes |
| `chargerHistoriqueCarte` : `mises` et `retraits` par `carte_id` | une carte | au plus 31 mises par carte |
| `chargerRecus` et accueil : `mises` | `.limit(50)` et `.limit(20)` | — |
| `equipe_vue`, `equipe_clients` (RPC) | rendent **un seul `jsonb`**, pas des lignes | `max_rows` ne s'applique pas |
| Application d'administration | RPC agrégées côté SQL, 7 collecteurs | hors périmètre |

## Avant-vol — fait le 2026-09-11, en lecture seule

- **La production coupe bien à 1000.** `supabase config diff` compare le
  chemin `api` ; `max_rows` n'est dans aucun des 13 écarts. Un réglage
  identique des deux côtés n'apparaît pas dans le rapport
  (`scripts/verifier-config.mjs`, en-tête) : la production vaut donc ce que
  `supabase/config.toml` déclare, `max_rows = 1000`. C'est la prémisse du
  plan : **si la production coupait plus bas que `TAILLE_PAGE`, `chargerTout`
  s'arrêterait après une page courte et croirait avoir tout lu.**
- **Les volumes** ci-dessus : une requête d'agrégats, comptes seulement, aucun
  nom ni numéro.
- **Une mise n'est lisible que par son collecteur** (`mises_select`,
  `20260815234444_socle_rls.sql`, jamais redéfinie) : les volumes par
  `collecteur_id` sont bien ceux que voit chaque téléphone.
- **Aucun plafond de clients par palier en base**
  (`20260902110000_abonnement_ouvre_droit.sql` : « `limiteClients` reste hors
  périmètre ») : l'épreuve de la tâche 5 peut créer 1 001 clients.

---

## Contraintes pour toutes les tâches

- **Branche** `lectures-sans-borne`, partie de `main`. Tout en local.
- **Les `.env` des applications pointent sur la PRODUCTION.** Aucun serveur de
  développement n'est nécessaire à ce plan ; n'en lancer aucun.
- **Fins de ligne.** `apps/collecteur/src/lectures-ecrans.ts` est **mixte** :
  CRLF partout sauf les lignes 730-822, en LF (93 lignes). Toutes les lignes
  touchées ici sont en CRLF. Les poser par Node, jamais par un outil qui
  réécrit le fichier entier — convertir le fichier en CRLF d'un bloc ajouterait
  93 lignes de pur changement de fin de ligne au diff. Script à poser une fois
  dans le répertoire temporaire de la session, **hors du dépôt** :

  ```js
  // poser-crlf.mjs — remplace des blocs exacts dans les zones CRLF d'un fichier.
  import { readFileSync, writeFileSync } from 'node:fs';

  export function poserCrlf(chemin, remplacements) {
    let brut = readFileSync(chemin, 'utf8');
    for (const [ancien, nouveau] of remplacements) {
      const a = ancien.replace(/\n/g, '\r\n');
      const n = nouveau.replace(/\n/g, '\r\n');
      const fois = brut.split(a).length - 1;
      if (fois !== 1) throw new Error(`ancre trouvée ${fois} fois : ${ancien.slice(0, 70)}`);
      brut = brut.replace(a, () => n);
    }
    writeFileSync(chemin, brut);
  }
  ```

  Contrôle après **chaque** pose dans ce fichier — il doit toujours dire
  `LF seules 93` :

  ```bash
  node -e "const s=require('fs').readFileSync('apps/collecteur/src/lectures-ecrans.ts','utf8');const t=s.split('\n').length-1;const c=(s.match(/\r\n/g)||[]).length;console.log('CRLF',c,'/',t,'— LF seules',t-c)"
  ```

  `scripts/verifier-bundles.mjs` et
  `Docs/plans/2026-09-09-finition-classee-par-risque.md` sont CRLF de bout en
  bout : même script. `lectures.ts` et `lectures-ecrans.test.ts` sont LF ; les
  fichiers neufs aussi.
- **La barrière de l'application**, à la fin de chaque tâche qui touche
  `apps/collecteur` — `tsc -b` et non `tsc -p`, qui ne vérifie rien sur ces
  `tsconfig.json` de façade :

  ```bash
  cd apps/collecteur && npx vitest run && npx tsc -b && npx oxlint
  ```

- **Le motif**, partout le même, celui de `chargerBilan` : `chargerTout`
  autour d'une requête terminée par `.order('id').range(debut, fin)`. `id` est
  la clé primaire : un ordre total, que l'index sert sans coût.
- **Le comportement en erreur ne change pas.** Avant : `data: null`, lu comme
  `[]`. Après : `chargerTout` rend `data: []` et l'erreur. `chargerTableauCollecteur`
  lève toujours sur `error`.
- Commits : sujet sans accents, comme l'historique ; corps terminé par
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Tâche 0 : la branche et ce plan

- [ ] **Étape 1 : partir de `main`, propre**

```bash
git status --short          # attendu : rien
git switch -c lectures-sans-borne
```

- [ ] **Étape 2 : committer le plan**

```bash
git add Docs/plans/2026-09-11-lectures-sans-borne.md
git commit -m "docs(plans): borner les lectures du collecteur, et ce que la releve a trouve" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 1 : un PostgREST factice qui coupe à mille, et les alertes

**Fichiers :**
- Créer : `apps/collecteur/src/postgrest-factice.ts`
- Créer : `apps/collecteur/src/postgrest-factice.test.ts`
- Réécrire : `apps/collecteur/src/lectures-ecrans.test.ts` (LF)
- Modifier : `apps/collecteur/src/lectures-ecrans.ts`, `chargerAlertes` (CRLF)

**Interfaces :**
- Produit : `tableFactice(lignes: Ligne[]): Requete`, `MAX_ROWS = 1000`,
  `type Ligne = Record<string, unknown>`. Dans `lectures-ecrans.test.ts` :
  `MAINTENANT`, `tables`, `rang(i)`, `parc(n)` — les tâches 2 et 4 y ajoutent
  leurs épreuves.

**Pourquoi un faux qui coupe.** Les faux actuels rendent tout d'un coup : sur
eux, un code qui oublie `range` passe au vert. Celui-ci imite le trait qui
compte — **sans `range`, mille lignes et rien pour le dire** — si bien qu'une
épreuve de 1 001 lignes échoue sur le code d'aujourd'hui **pour la vraie
raison**, celle de la production.

- [ ] **Étape 1 : écrire l'épreuve du faux**

`apps/collecteur/src/postgrest-factice.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { MAX_ROWS, tableFactice } from './postgrest-factice';

/**
 * Le faux sur lequel reposent les épreuves des lectures. S'il ne coupait pas,
 * elles passeraient sur un code sans pagination — il est donc éprouvé à part.
 */

const lignes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `l${String(i).padStart(4, '0')}`, n: i }));

describe('le PostgREST factice des épreuves', () => {
  it('coupe à MAX_ROWS sans range, et sans erreur — comme le vrai', async () => {
    const { data, error } = await tableFactice(lignes(MAX_ROWS + 1)).select('id');

    expect(data).toHaveLength(MAX_ROWS);
    expect(error).toBeNull();
  });

  it('rend la tranche que demande range', async () => {
    const { data } = await tableFactice(lignes(MAX_ROWS + 1))
      .select('id')
      .order('id')
      .range(MAX_ROWS, 2 * MAX_ROWS - 1);

    expect(data).toEqual([{ id: 'l1000', n: 1000 }]);
  });

  it('trie sur plusieurs clés, dans l’ordre des appels', async () => {
    const t = [
      { id: 'b', q: '1' },
      { id: 'a', q: '1' },
      { id: 'c', q: '2' },
    ];

    const { data } = await tableFactice(t).select('*').order('q', { ascending: false }).order('id');

    expect(data.map((l) => l.id)).toEqual(['c', 'a', 'b']);
  });

  it('filtre par gte et par eq', async () => {
    const t = [
      { id: 'a', d: '2026-09-10' },
      { id: 'b', d: '2026-09-11' },
    ];

    expect((await tableFactice(t).select('*').gte('d', '2026-09-11')).data).toEqual([t[1]]);
    expect((await tableFactice(t).select('*').eq('id', 'a').maybeSingle()).data).toEqual(t[0]);
  });
});
```

- [ ] **Étape 2 : la voir échouer**

```bash
cd apps/collecteur && npx vitest run src/postgrest-factice.test.ts
```

Attendu : FAIL, le module `./postgrest-factice` est introuvable.

- [ ] **Étape 3 : écrire le faux**

`apps/collecteur/src/postgrest-factice.ts` :

```ts
/**
 * Un PostgREST de poche, pour les épreuves des lectures. Aucun module de
 * l'application ne l'importe.
 *
 * Il imite les deux traits du vrai qui décident de ces épreuves :
 *
 * - **toute requête s'attend** : `await` sur la chaîne l'exécute, comme sur
 *   celles de `supabase-js` ;
 * - **sans `range`, il coupe à `MAX_ROWS` lignes, sans erreur** — ce que fait
 *   `max_rows = 1000` (`supabase/config.toml`, suivi par la production). Une
 *   épreuve de 1 001 lignes voit donc, sur un code qui oublie de paginer,
 *   exactement ce que voit un collecteur : mille lignes, et rien pour le dire.
 *
 * `range(debut, fin)` rend la tranche demandée, et jamais plus de `MAX_ROWS` :
 * le vrai plafonne aussi une plage trop large.
 *
 * `MAX_ROWS` est écrit ici en dur, et non repris de `TAILLE_PAGE` : si la page
 * de `pagination.ts` changeait un jour, le faux ne doit pas la suivre — c'est
 * le serveur qu'il imite, pas le code qu'il éprouve.
 */

export const MAX_ROWS = 1000;

export type Ligne = Record<string, unknown>;

interface Tri {
  colonne: string;
  croissant: boolean;
}

interface Etat {
  lignes: Ligne[];
  tris: Tri[];
  debut: number;
  fin: number;
}

export type Requete = Promise<{ data: Ligne[]; error: null }> & {
  select: (colonnes?: string) => Requete;
  eq: (colonne: string, valeur: unknown) => Requete;
  gte: (colonne: string, valeur: string) => Requete;
  order: (colonne: string, options?: { ascending?: boolean }) => Requete;
  range: (debut: number, fin: number) => Requete;
  limit: (nombre: number) => Requete;
  maybeSingle: () => Promise<{ data: Ligne | null; error: null }>;
};

function comparer(a: Ligne, b: Ligne, tris: Tri[]): number {
  for (const { colonne, croissant } of tris) {
    const x = String(a[colonne]);
    const y = String(b[colonne]);
    if (x !== y) return (x < y ? -1 : 1) * (croissant ? 1 : -1);
  }
  return 0;
}

function requete(etat: Etat): Requete {
  const { lignes, tris, debut, fin } = etat;
  // `sort` est stable : sans tri demandé, l'ordre d'insertion reste.
  const triees = [...lignes].sort((a, b) => comparer(a, b, tris));
  const rendues = triees.slice(debut, Math.min(fin + 1, debut + MAX_ROWS));
  const suite = (change: Partial<Etat>) => requete({ ...etat, ...change });

  return Object.assign(Promise.resolve({ data: rendues, error: null as null }), {
    select: () => suite({}),
    eq: (colonne: string, valeur: unknown) =>
      suite({ lignes: lignes.filter((l) => l[colonne] === valeur) }),
    gte: (colonne: string, valeur: string) =>
      suite({ lignes: lignes.filter((l) => String(l[colonne]) >= valeur) }),
    order: (colonne: string, options?: { ascending?: boolean }) =>
      suite({ tris: [...tris, { colonne, croissant: options?.ascending !== false }] }),
    range: (d: number, f: number) => suite({ debut: d, fin: f }),
    limit: (nombre: number) => suite({ fin: debut + nombre - 1 }),
    maybeSingle: () => Promise.resolve({ data: triees[0] ?? null, error: null as null }),
  });
}

/** Une table factice. `tableFactice(lignes).select(…)` commence une requête. */
export function tableFactice(lignes: Ligne[]): Requete {
  return requete({ lignes, tris: [], debut: 0, fin: Number.MAX_SAFE_INTEGER });
}
```

- [ ] **Étape 4 : la voir passer**

```bash
cd apps/collecteur && npx vitest run src/postgrest-factice.test.ts
```

Attendu : 4 passed.

- [ ] **Étape 5 : réécrire `lectures-ecrans.test.ts` sur le faux, avec deux épreuves neuves**

Contenu complet de `apps/collecteur/src/lectures-ecrans.test.ts` — les trois
épreuves existantes sont gardées mot pour mot, seul leur jeu d'essai passe
par `tables` :

```ts
import { MISES_PAR_CYCLE } from '@kolek/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tableFactice, type Ligne } from './postgrest-factice';

/**
 * Ce que les alertes disent d'une carte arrivée au bout de son cycle.
 *
 * Elles annonçaient : « La carte **doit** être clôturée et 30 000 FCFA
 * restitués. » C'était vrai tant qu'un client ne pouvait tenir qu'une carte à la
 * fois — il fallait fermer l'ancienne pour en ouvrir une neuve, donc rendre
 * l'argent. La contrainte est tombée le 2026-08-25, et cette phrase avec elle :
 * le client peut désormais laisser son épargne chez le collecteur et repartir
 * sur une carte de plus.
 *
 * Une alerte qui présente un choix comme une obligation ne se contente pas
 * d'être imprécise. Elle pousse le collecteur à réclamer une clôture que
 * personne ne demande, et à rendre un argent que le client voulait garder.
 *
 * Le seuil, lui, ne bouge pas — ni celui-ci ni celui de la dormance. Le cycle
 * est un compte de 31 mises, pas 31 jours de calendrier ; les alertes de jours
 * sans mise restent des repères de tournée, pas des reproches, et leurs textes
 * disent déjà des faits.
 *
 * ## Et ce que les lectures font au-delà de mille lignes
 *
 * Le client Supabase est remplacé par `tableFactice`, qui coupe à mille lignes
 * sans `range` — comme le vrai. Les épreuves « au-delà de mille » échouent donc
 * sur un code qui oublie de paginer, pour la raison exacte de la production.
 */

const from = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { from: (table: string) => from(table) },
}));

const { chargerAlertes } = await import('./lectures-ecrans');

/** L'instant des épreuves. Seul `Date` est figé : les promesses tournent. */
const MAINTENANT = '2026-09-11T10:00:00.000Z';

let tables: Record<string, Ligne[]> = {};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(MAINTENANT));
  tables = {};
  from.mockImplementation((table: string) => tableFactice(tables[table] ?? []));
});

afterEach(() => {
  vi.useRealTimers();
  from.mockReset();
});

const rang = (i: number) => String(i).padStart(4, '0');

/**
 * `n` clients, une carte active chacun, rangés par identifiant.
 *
 * Le dernier — le 1 001e quand `n` vaut 1 001 — est celui que PostgREST coupe
 * sans `range`. Son client s'appelle « Dernière » et sa carte est pleine : une
 * épreuve peut demander « l'a-t-on vu ? » en une ligne.
 */
function parc(n: number) {
  const clients = Array.from({ length: n }, (_, i) => ({
    id: `c${rang(i)}`,
    nom: i === n - 1 ? 'Dernière' : `Client ${rang(i)}`,
    avis_actifs: true,
    telephone: '+2250700000000',
  }));
  const cartes = Array.from({ length: n }, (_, i) => ({
    id: `k${rang(i)}`,
    client_id: `c${rang(i)}`,
    mise: 100,
    statut: 'active',
    mises_encaissees: i === n - 1 ? MISES_PAR_CYCLE : 1,
    ouverte_le: MAINTENANT,
  }));
  return { clients, cartes };
}

describe('alerte d’une carte au bout de son cycle', () => {
  beforeEach(() => {
    tables = {
      clients: [{ id: 'cli1', nom: 'Hj' }],
      // Une seule carte, pleine, et toujours active : la base ne clôture qu'au retrait.
      cartes: [
        {
          id: 'k1',
          client_id: 'cli1',
          mise: 1000,
          statut: 'active',
          mises_encaissees: MISES_PAR_CYCLE,
          ouverte_le: '2026-07-01T08:00:00.000Z',
        },
      ],
      mises: [{ id: 'm1', carte_id: 'k1', encaisse_le: MAINTENANT }],
    };
  });

  it('ne présente plus le retrait comme une obligation', async () => {
    const alertes = await chargerAlertes();
    const complete = alertes.find((a) => a.cle === 'complete-k1');

    expect(complete).toBeTruthy();
    // « doit être clôturée » était la règle d'une seule carte active. Elle est
    // tombée avec l'index unique.
    expect(complete?.detail).not.toContain('doit');
  });

  it('nomme les deux issues, et dit que le solde reste dû', async () => {
    const alertes = await chargerAlertes();
    const complete = alertes.find((a) => a.cle === 'complete-k1');

    // Les deux portes se valent : une alerte qui n'en montre qu'une choisit à la
    // place du client.
    expect(complete?.detail).toContain('restituer');
    expect(complete?.detail).toContain('carte de plus');
    // Sans ce rappel, laisser l'argent ressemble à le perdre.
    expect(complete?.detail).toContain('dû');
  });

  it('rappelle toujours le montant en jeu', async () => {
    const alertes = await chargerAlertes();
    const complete = alertes.find((a) => a.cle === 'complete-k1');

    // 31 mises de 1 000, moins la première qui est la commission du collecteur.
    expect(complete?.detail).toContain('30 000');
  });
});

describe('les alertes d’un collecteur au-delà de mille lignes', () => {
  it('ne déclare pas endormie une carte dont la mise tombe après la millième', async () => {
    // Mille mises d'aujourd'hui sur une carte, une seule d'hier sur une autre,
    // ouverte il y a trente jours. Du plus récent au plus ancien, celle d'hier
    // est la 1 001e : c'est elle que `max_rows` coupe.
    tables = {
      clients: [
        { id: 'cli1', nom: 'Awa' },
        { id: 'cli2', nom: 'Hier' },
      ],
      cartes: [
        {
          id: 'k1',
          client_id: 'cli1',
          mise: 100,
          statut: 'active',
          mises_encaissees: 5,
          ouverte_le: '2026-09-01T08:00:00.000Z',
        },
        {
          id: 'k2',
          client_id: 'cli2',
          mise: 100,
          statut: 'active',
          mises_encaissees: 3,
          ouverte_le: '2026-08-12T08:00:00.000Z',
        },
      ],
      mises: [
        ...Array.from({ length: 1000 }, (_, i) => ({
          id: `m${rang(i)}`,
          carte_id: 'k1',
          encaisse_le: '2026-09-11T09:00:00.000Z',
        })),
        { id: 'm1000', carte_id: 'k2', encaisse_le: '2026-09-10T09:00:00.000Z' },
      ],
    };

    const alertes = await chargerAlertes();

    // Coupée, la mise d'hier disparaît : la carte retombe sur sa date
    // d'ouverture, et l'écran dit « Hier — 30 jours sans mise ».
    expect(alertes.find((a) => a.cle === 'dormante-k2')).toBeUndefined();
  });

  it('signale la carte pleine d’un client au-delà du millième, et le nomme', async () => {
    const { clients, cartes } = parc(1001);
    tables = { clients, cartes, mises: [] };

    const alertes = await chargerAlertes();

    expect(alertes.find((a) => a.cle === 'complete-k1000')?.titre).toBe(
      'Dernière — cycle terminé',
    );
  });
});
```

- [ ] **Étape 6 : voir les deux neuves échouer, et les trois anciennes passer**

```bash
cd apps/collecteur && npx vitest run src/lectures-ecrans.test.ts
```

Attendu : 3 passed, 2 failed —
`dormante-k2` : `expected { cle: 'dormante-k2', … } to be undefined` ;
`complete-k1000` : `expected undefined to be 'Dernière — cycle terminé'`.
Un autre motif d'échec veut dire que l'épreuve mesure autre chose : s'arrêter.

- [ ] **Étape 7 : paginer `chargerAlertes`**

Par `poserCrlf`, sur `apps/collecteur/src/lectures-ecrans.ts`. Ancien :

```ts
  const [rCartes, rClients, rMises, rCollecteur] = await Promise.all([
    supabase.from('cartes').select('id, client_id, mise, statut, mises_encaissees, ouverte_le'),
    supabase.from('clients').select('id, nom'),
    supabase
      .from('mises')
      .select('carte_id, encaisse_le')
      .gte('encaisse_le', fenetre)
      .order('encaisse_le', { ascending: false }),
    supabase.from('collecteurs').select('abonnement_statut, abonnement_echeance').maybeSingle(),
  ]);
```

Nouveau :

```ts
  // Chaque liste épuise ses pages : `max_rows = 1000` tronque sans erreur (voir
  // `chargerBilan`). Ici la troncature ne se contente pas de manquer, elle
  // invente : une mise coupée fait retomber sa carte sur la date d'ouverture, et
  // l'écran annonce « 30 jours sans mise » d'un client passé hier. Mesuré le
  // 2026-09-11 : 579 mises en trente jours pour le plus actif des collecteurs.
  //
  // Les mises gardent leur tri décroissant — la boucle plus bas retient la
  // première vue par carte — et prennent `id` en second : deux mises peuvent
  // partager l'instant, et une pagination sur un ordre non total saute des lignes.
  const [rCartes, rClients, rMises, rCollecteur] = await Promise.all([
    chargerTout((debut, fin) =>
      supabase
        .from('cartes')
        .select('id, client_id, mise, statut, mises_encaissees, ouverte_le')
        .order('id')
        .range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase.from('clients').select('id, nom').order('id').range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase
        .from('mises')
        .select('carte_id, encaisse_le')
        .gte('encaisse_le', fenetre)
        .order('encaisse_le', { ascending: false })
        .order('id')
        .range(debut, fin),
    ),
    supabase.from('collecteurs').select('abonnement_statut, abonnement_echeance').maybeSingle(),
  ]);
```

`chargerTout` est déjà importé en tête du fichier (ligne 4).

- [ ] **Étape 8 : contrôler les fins de ligne** — la commande des contraintes
  doit dire `LF seules 93`.

- [ ] **Étape 9 : voir les cinq passer**

```bash
cd apps/collecteur && npx vitest run src/lectures-ecrans.test.ts
```

Attendu : 5 passed.

- [ ] **Étape 10 : la barrière de l'application**

```bash
cd apps/collecteur && npx vitest run && npx tsc -b && npx oxlint
```

Attendu : tout vert, 0 avertissement.

- [ ] **Étape 11 : commit**

```bash
git add apps/collecteur/src/postgrest-factice.ts apps/collecteur/src/postgrest-factice.test.ts apps/collecteur/src/lectures-ecrans.test.ts apps/collecteur/src/lectures-ecrans.ts
git commit -m "fix(collecteur): les alertes lisent au-dela de mille lignes" -m "Un PostgREST factice qui coupe a mille, comme le vrai, et chargerAlertes qui epuise ses pages. La mise coupee faisait annoncer trente jours sans mise d'un client passe la veille." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 2 : le rapprochement et l'écran Retrait

**Fichiers :**
- Modifier : `apps/collecteur/src/lectures-ecrans.ts`, `chargerRapprochement`
  et `chargerCartesCloturables` (CRLF)
- Modifier : `apps/collecteur/src/lectures-ecrans.test.ts` (LF)

**Interfaces :**
- Consomme : `tableFactice`, `MAINTENANT`, `tables`, `rang`, `parc` (tâche 1).

- [ ] **Étape 1 : écrire les deux épreuves**

Dans `lectures-ecrans.test.ts`, remplacer la ligne d'import de la fonction :

```ts
const { chargerAlertes } = await import('./lectures-ecrans');
```

par :

```ts
const { chargerAlertes, chargerCartesCloturables, chargerRapprochement } = await import(
  './lectures-ecrans'
);
```

puis ajouter en fin de fichier :

```ts
describe('le rapprochement d’une journée au-delà de mille lignes', () => {
  it('compte toutes les mises et tous les retraits du jour', async () => {
    // Aucune déclaration encore : l'attendu est calculé ici. Coupées à mille,
    // les deux listes rendraient 100 000 − 10 000 = 90 000 au lieu de 90 090.
    tables = {
      caisses_jour: [],
      mises: Array.from({ length: 1001 }, (_, i) => ({
        id: `m${rang(i)}`,
        montant: 100,
        encaisse_le: MAINTENANT,
      })),
      retraits: Array.from({ length: 1001 }, (_, i) => ({
        id: `r${rang(i)}`,
        montant_restitue: 10,
        effectue_le: MAINTENANT,
      })),
    };

    const rapprochement = await chargerRapprochement();

    expect(rapprochement.cashAttendu).toBe(100_100 - 10_010);
  });
});

describe('l’écran Retrait au-delà de mille cartes', () => {
  it('propose toutes les cartes, la 1 001e comprise, avec le nom de son client', async () => {
    const { clients, cartes } = parc(1001);
    tables = { clients, cartes };

    const cloturables = await chargerCartesCloturables();

    expect(cloturables).toHaveLength(1001);
    expect(cloturables.find((c) => c.carteId === 'k1000')?.clientNom).toBe('Dernière');
  });
});
```

- [ ] **Étape 2 : les voir échouer**

```bash
cd apps/collecteur && npx vitest run src/lectures-ecrans.test.ts
```

Attendu : 5 passed, 2 failed — `expected 90000 to be 90090` et
`expected [ …(1000) ] to have a length of 1001 but got 1000`.

- [ ] **Étape 3 : paginer `chargerRapprochement`**

Par `poserCrlf`. Ancien :

```ts
  const [rCaisse, rMises, rRetraits] = await Promise.all([
    supabase
      .from('caisses_jour')
      .select('id, cash_attendu, cash_declare, ecart')
      .eq('date', date)
      .maybeSingle(),
    supabase.from('mises').select('montant, encaisse_le').gte('encaisse_le', `${date}T00:00:00Z`),
    supabase
      .from('retraits')
      .select('montant_restitue, effectue_le')
      .gte('effectue_le', `${date}T00:00:00Z`),
  ]);
```

Nouveau :

```ts
  // Les mises et les retraits du jour épuisent leurs pages : ils font une somme,
  // et une somme tronquée ment vers le bas sans rien casser (voir `chargerBilan`).
  // Mesuré le 2026-09-11 : 250 mises en une journée pour le plus actif des
  // collecteurs, le quart de `max_rows`.
  const [rCaisse, rMises, rRetraits] = await Promise.all([
    supabase
      .from('caisses_jour')
      .select('id, cash_attendu, cash_declare, ecart')
      .eq('date', date)
      .maybeSingle(),
    chargerTout((debut, fin) =>
      supabase
        .from('mises')
        .select('montant, encaisse_le')
        .gte('encaisse_le', `${date}T00:00:00Z`)
        .order('id')
        .range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase
        .from('retraits')
        .select('montant_restitue, effectue_le')
        .gte('effectue_le', `${date}T00:00:00Z`)
        .order('id')
        .range(debut, fin),
    ),
  ]);
```

- [ ] **Étape 4 : paginer `chargerCartesCloturables`**

Par `poserCrlf`. Ancien :

```ts
  const [rCartes, rClients] = await Promise.all([
    supabase.from('cartes').select('id, client_id, mise, statut, mises_encaissees'),
    supabase.from('clients').select('id, nom'),
  ]);
```

Nouveau :

```ts
  // Épuisées par pages : une carte coupée ici disparaît de l'écran Retrait, et
  // le collecteur ne peut plus rendre son argent à ce client. Voir `chargerBilan`.
  const [rCartes, rClients] = await Promise.all([
    chargerTout((debut, fin) =>
      supabase
        .from('cartes')
        .select('id, client_id, mise, statut, mises_encaissees')
        .order('id')
        .range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase.from('clients').select('id, nom').order('id').range(debut, fin),
    ),
  ]);
```

- [ ] **Étape 5 : contrôler les fins de ligne** — `LF seules 93`.

- [ ] **Étape 6 : voir les sept passer**

```bash
cd apps/collecteur && npx vitest run src/lectures-ecrans.test.ts
```

Attendu : 7 passed.

- [ ] **Étape 7 : la barrière de l'application**

```bash
cd apps/collecteur && npx vitest run && npx tsc -b && npx oxlint
```

- [ ] **Étape 8 : commit**

```bash
git add apps/collecteur/src/lectures-ecrans.ts apps/collecteur/src/lectures-ecrans.test.ts
git commit -m "fix(collecteur): le rapprochement et l'ecran Retrait lisent au-dela de mille lignes" -m "Le cash attendu sommait des listes coupees a mille ; l'ecran Retrait perdait les cartes au-dela de la millieme." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 3 : l'accueil

**Fichiers :**
- Modifier : `apps/collecteur/src/lectures.ts` (LF — l'outil d'édition
  ordinaire convient)
- Créer : `apps/collecteur/src/lectures.test.ts`

**Interfaces :**
- Consomme : `tableFactice`, `Ligne` (tâche 1) ; `chargerTout` de
  `./pagination`.

- [ ] **Étape 1 : écrire l'épreuve**

`apps/collecteur/src/lectures.test.ts` :

```ts
import { soldeRestituable } from '@kolek/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { tableFactice, type Ligne } from './postgrest-factice';

/**
 * L'accueil d'un collecteur au-delà de mille lignes.
 *
 * C'est l'écran qui s'ouvre à chaque lancement, et il porte l'encours : ce
 * que le collecteur doit à ses clients. Coupé à mille cartes, ce chiffre ment
 * vers le bas, et rien à l'écran ne le laisse deviner.
 */

const from = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { from: (table: string) => from(table) },
}));

const { chargerTableauCollecteur } = await import('./lectures');

const N = 1001;
const rang = (i: number) => String(i).padStart(4, '0');

beforeEach(() => {
  const tables: Record<string, Ligne[]> = {
    clients: Array.from({ length: N }, (_, i) => ({ id: `c${rang(i)}`, nom: `Client ${rang(i)}` })),
    cartes: Array.from({ length: N }, (_, i) => ({
      id: `k${rang(i)}`,
      client_id: `c${rang(i)}`,
      mise: 100,
      statut: 'active',
      mises_encaissees: 2,
    })),
    mises: [],
  };
  from.mockImplementation((table: string) => tableFactice(tables[table] ?? []));
});

describe('l’accueil d’un collecteur au-delà de mille lignes', () => {
  it('compte tous ses clients, toutes ses cartes, et tout ce qu’il doit', async () => {
    const tableau = await chargerTableauCollecteur();

    expect(tableau.clients).toBe(N);
    expect(tableau.cartesActives).toBe(N);
    expect(tableau.encoursTotal).toBe(N * soldeRestituable(2, 100));
  });
});
```

- [ ] **Étape 2 : la voir échouer**

```bash
cd apps/collecteur && npx vitest run src/lectures.test.ts
```

Attendu : FAIL, `expected 1000 to be 1001`.

- [ ] **Étape 3 : paginer `chargerTableauCollecteur`**

Dans `apps/collecteur/src/lectures.ts`, l'import — ancien :

```ts
import { supabase } from './supabase';
```

nouveau :

```ts
import { chargerTout } from './pagination';
import { supabase } from './supabase';
```

Et la lecture — ancien :

```ts
  const [reponseClients, reponseCartes, reponseMises] = await Promise.all([
    supabase.from('clients').select('id, nom'),
    supabase.from('cartes').select('id, client_id, mise, statut, mises_encaissees'),
```

nouveau :

```ts
  const [reponseClients, reponseCartes, reponseMises] = await Promise.all([
    // Clients et cartes épuisent leurs pages : `max_rows = 1000` tronque sans
    // erreur, et l'encours affiché plus bas — ce que le collecteur doit à ses
    // clients — se mettrait à mentir vers le bas. Voir `pagination.ts`.
    chargerTout((debut, fin) =>
      supabase.from('clients').select('id, nom').order('id').range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase
        .from('cartes')
        .select('id, client_id, mise, statut, mises_encaissees')
        .order('id')
        .range(debut, fin),
    ),
```

La lecture des mises (`.limit(20)`) et le contrôle
`reponseClients.error || reponseCartes.error || reponseMises.error` ne
changent pas : `chargerTout` rend `error` comme une requête simple.

- [ ] **Étape 4 : la voir passer**

```bash
cd apps/collecteur && npx vitest run src/lectures.test.ts
```

Attendu : 1 passed. Contrôler que `lectures.ts` est toujours LF (0 CR).

- [ ] **Étape 5 : la barrière de l'application**

```bash
cd apps/collecteur && npx vitest run && npx tsc -b && npx oxlint
```

- [ ] **Étape 6 : commit**

```bash
git add apps/collecteur/src/lectures.ts apps/collecteur/src/lectures.test.ts
git commit -m "fix(collecteur): l'accueil lit au-dela de mille lignes" -m "L'encours de l'accueil sommait des cartes coupees a mille." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 4 : le profil, les reçus et l'état des avis

**Fichiers :**
- Modifier : `apps/collecteur/src/lectures-ecrans.ts`, `chargerProfil`,
  `chargerRecus`, `chargerEtatAvis` (CRLF)
- Modifier : `apps/collecteur/src/lectures-ecrans.test.ts` (LF)

**Interfaces :**
- Consomme : `tableFactice`, `MAINTENANT`, `tables`, `parc` (tâche 1).

- [ ] **Étape 1 : écrire les trois épreuves**

Dans `lectures-ecrans.test.ts`, remplacer l'import posé à la tâche 2 :

```ts
const { chargerAlertes, chargerCartesCloturables, chargerRapprochement } = await import(
  './lectures-ecrans'
);
```

par :

```ts
const {
  chargerAlertes,
  chargerCartesCloturables,
  chargerEtatAvis,
  chargerProfil,
  chargerRapprochement,
  chargerRecus,
} = await import('./lectures-ecrans');
```

puis ajouter en fin de fichier :

```ts
describe('les comptes et les noms au-delà de mille lignes', () => {
  it('chargerProfil compte tous les clients et toutes les cartes actives', async () => {
    const { clients, cartes } = parc(1001);
    tables = { clients, cartes };

    const profil = await chargerProfil();

    expect(profil.clients).toBe(1001);
    expect(profil.cartesActives).toBe(1001);
  });

  it('chargerRecus nomme le client d’une carte au-delà de la millième', async () => {
    const { clients, cartes } = parc(1001);
    tables = {
      clients,
      cartes,
      mises: [
        { id: 'm1', carte_id: 'k1000', montant: 100, est_commission: false, encaisse_le: MAINTENANT },
      ],
    };

    const [recu] = await chargerRecus();

    // Coupé à mille, ce reçu disait « Client inconnu », pour une mise de 0.
    expect(recu?.clientNom).toBe('Dernière');
    expect(recu?.mise).toBe(100);
  });

  it('chargerEtatAvis compte tous les clients qui acceptent les avis', async () => {
    tables = { clients: parc(1001).clients };

    const etat = await chargerEtatAvis();

    expect(etat.clientsConsentants).toBe(1001);
  });
});
```

- [ ] **Étape 2 : les voir échouer**

```bash
cd apps/collecteur && npx vitest run src/lectures-ecrans.test.ts
```

Attendu : 7 passed, 3 failed — `expected 1000 to be 1001` (profil),
`expected 'Client inconnu' to be 'Dernière'` (reçus), `expected 1000 to be
1001` (avis).

- [ ] **Étape 3 : paginer `chargerRecus`**

Par `poserCrlf`. Ancien :

```ts
    supabase.from('cartes').select('id, client_id, mise'),
    supabase.from('clients').select('id, nom'),
  ]);
```

Nouveau :

```ts
    // Cartes et clients servent à nommer les reçus : coupés, un reçu récent
    // s'afficherait « Client inconnu », à une mise de 0. Voir `chargerBilan`.
    chargerTout((debut, fin) =>
      supabase.from('cartes').select('id, client_id, mise').order('id').range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase.from('clients').select('id, nom').order('id').range(debut, fin),
    ),
  ]);
```

- [ ] **Étape 4 : paginer `chargerProfil`**

Par `poserCrlf`. Ancien :

```ts
    supabase.from('clients').select('id'),
    supabase.from('cartes').select('id, statut'),
  ]);
```

Nouveau :

```ts
    // Deux comptes, épuisés par pages : ils plafonneraient à 1000 sinon.
    chargerTout((debut, fin) =>
      supabase.from('clients').select('id').order('id').range(debut, fin),
    ),
    chargerTout((debut, fin) =>
      supabase.from('cartes').select('id, statut').order('id').range(debut, fin),
    ),
  ]);
```

- [ ] **Étape 5 : paginer `chargerEtatAvis`**

Par `poserCrlf`. Ancien :

```ts
    supabase.from('clients').select('id, nom, avis_actifs, telephone'),
  ]);
```

Nouveau :

```ts
    // Épuisés par pages : le compte des clients consentants plafonnerait à 1000.
    chargerTout((debut, fin) =>
      supabase
        .from('clients')
        .select('id, nom, avis_actifs, telephone')
        .order('id')
        .range(debut, fin),
    ),
  ]);
```

- [ ] **Étape 6 : contrôler les fins de ligne** — `LF seules 93`.

- [ ] **Étape 7 : plus aucune liste sans borne dans les deux fichiers**

```bash
grep -nE "supabase\.from\('(clients|cartes|mises|retraits)'\)\.select\([^)]*\),?$" apps/collecteur/src/lectures.ts apps/collecteur/src/lectures-ecrans.ts
```

Attendu : aucune ligne. (Les lectures bornées par `.eq`, `.in` ou `.limit`
s'écrivent sur plusieurs lignes et ne sortent pas — voir « Ce qui reste sans
`range` ».)

- [ ] **Étape 8 : voir les dix passer**

```bash
cd apps/collecteur && npx vitest run src/lectures-ecrans.test.ts
```

Attendu : 10 passed.

- [ ] **Étape 9 : la barrière de l'application**

```bash
cd apps/collecteur && npx vitest run && npx tsc -b && npx oxlint
```

- [ ] **Étape 10 : commit**

```bash
git add apps/collecteur/src/lectures-ecrans.ts apps/collecteur/src/lectures-ecrans.test.ts
git commit -m "fix(collecteur): profil, recus et avis lisent au-dela de mille lignes" -m "Les trois dernieres listes lues sans range dans l'application collecteur." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 5 : l'épreuve contre le vrai PostgREST

**Fichiers :**
- Créer : `supabase/tests/lectures-paginees.test.ts`

**Pourquoi.** Les tâches 1 à 4 reposent sur un faux. Celle-ci éprouve la
prémisse sur le vrai PostgREST local — coupure à mille, sans erreur — et fait
tourner les **vraies** fonctions de l'application, avec la session d'un vrai
collecteur : RLS, noms de colonnes et pagination ensemble. Même montage que
`historique-carte.test.ts`.

**Pile locale uniquement.** `npm run db:env` n'écrit que l'environnement local.
Si la pile est arrêtée :
`npx supabase start -x studio,storage-api,imgproxy,realtime,vector,logflare,supavisor,mailpit`.

- [ ] **Étape 1 : écrire l'épreuve**

`supabase/tests/lectures-paginees.test.ts` :

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Les lectures de l'application collecteur contre le vrai PostgREST, au-delà de
 * mille lignes.
 *
 * Les épreuves de `apps/collecteur` tournent sur un PostgREST factice qui coupe
 * à mille. Celle-ci vérifie la prémisse sur le vrai — `max_rows = 1000`
 * (`supabase/config.toml` ; la production le suit, `config diff` du
 * 2026-09-11) tronque **sans erreur** — et fait tourner les vraies fonctions,
 * avec la session d'un vrai collecteur. Une faute dans un nom de colonne, un
 * `range` oublié ou une politique RLS trop étroite tombent ici.
 *
 * Le module client est remplacé comme dans `historique-carte.test.ts` : par
 * un accesseur qui rend le client authentifié du harnais.
 */

const etat = vi.hoisted(() => ({ client: null as { from: unknown } | null }));

vi.mock('../../apps/collecteur/src/supabase', () => ({
  // Un accesseur et non une valeur : le client n'existe qu'après la connexion,
  // dans `beforeAll`, alors que la fabrique est évaluée au premier import.
  get supabase() {
    if (!etat.client) throw new Error('Client de test non posé — voir beforeAll.');
    return etat.client;
  },
}));

const { chargerCartesCloturables, chargerProfil } = await import(
  '../../apps/collecteur/src/lectures-ecrans'
);

const N = 1001;
const MARQUE = crypto.randomUUID().slice(0, 8);
const MISE = 2000;

let collecteur: CollecteurTest;

beforeAll(async () => {
  collecteur = await creerCollecteur(`Pagination ${MARQUE}`, `+225075${MARQUE}`);
  etat.client = collecteur.client as unknown as { from: unknown };

  // En deux lots, et non ligne à ligne : ni `clients` ni `cartes` ne portent
  // les déclencheurs de compteur qui imposent l'unité aux insertions de `mises`.
  const clients = Array.from({ length: N }, (_, i) => ({
    id: crypto.randomUUID(),
    collecteur_id: collecteur.id,
    nom: `Client ${MARQUE} ${i}`,
  }));
  const { error: erreurClients } = await collecteur.client.from('clients').insert(clients);
  if (erreurClients) throw erreurClients;

  const { error: erreurCartes } = await collecteur.client.from('cartes').insert(
    clients.map((c) => ({
      id: crypto.randomUUID(),
      collecteur_id: collecteur.id,
      client_id: c.id,
      mise: MISE,
    })),
  );
  if (erreurCartes) throw erreurCartes;
});

afterAll(async () => {
  // Deux mille lignes laissées là fausseraient toute épreuve de la suite qui
  // compte le parc entier. Aucune mise n'a été encaissée : rien ne s'oppose à la
  // suppression, et une erreur ici ne ferait que laisser le ménage à `db:reset`.
  await admin.from('cartes').delete().eq('collecteur_id', collecteur.id);
  await admin.from('clients').delete().eq('collecteur_id', collecteur.id);
  await nettoyer();
});

describe('les lectures du collecteur contre le vrai PostgREST', () => {
  it('prémisse : sans range, PostgREST coupe à mille et ne dit rien', async () => {
    // Si cette épreuve tombe, `max_rows` a changé : tout ce plan repose sur
    // sa valeur, et `TAILLE_PAGE` doit la suivre.
    const { data, error } = await collecteur.client.from('clients').select('id');

    expect(error).toBeNull();
    expect(data).toHaveLength(1000);
  });

  it('chargerProfil compte les 1 001 clients et les 1 001 cartes actives', async () => {
    const profil = await chargerProfil();

    expect(profil.clients).toBe(N);
    expect(profil.cartesActives).toBe(N);
  });

  it('chargerCartesCloturables rend les 1 001 cartes, chacune nommée', async () => {
    const cartes = await chargerCartesCloturables();

    expect(cartes).toHaveLength(N);
    expect(cartes.every((c) => c.clientNom.startsWith(`Client ${MARQUE}`))).toBe(true);
  });
});
```

- [ ] **Étape 2 : la voir passer**

```bash
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/lectures-paginees.test.ts
```

Attendu : 3 passed.

- [ ] **Étape 3 : la désarmer, et la voir échouer pour la bonne raison**

Remettre `lectures-ecrans.ts` tel qu'il était avant ce plan, relancer, puis le
reposer :

```bash
git checkout "$(git merge-base HEAD main)" -- apps/collecteur/src/lectures-ecrans.ts
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/lectures-paginees.test.ts
git checkout HEAD -- apps/collecteur/src/lectures-ecrans.ts
git status --short
```

Attendu pendant le désarmement : la prémisse passe, les deux autres
échouent — `expected 1000 to be 1001` et `to have a length of 1001 but got
1000`. Après : `git status --short` ne montre que
`?? supabase/tests/lectures-paginees.test.ts`, et le contrôle des fins de
ligne dit toujours `LF seules 93` — `git checkout` rend les octets commités,
mais un réglage `core.autocrlf` les réécrirait sans rien dire.

- [ ] **Étape 4 : la revoir passer** — même commande qu'à l'étape 2, 3 passed.

- [ ] **Étape 5 : commit**

```bash
git add supabase/tests/lectures-paginees.test.ts
git commit -m "test(base): les lectures du collecteur contre le vrai PostgREST, au-dela de mille" -m "La premisse du plan eprouvee sur le vrai serveur, et les vraies fonctions sous la session d'un vrai collecteur. Vue rouge en desarmant la pagination." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tâche 6 : un commentaire périmé, la trace, la chaîne complète

**Fichiers :**
- Modifier : `scripts/verifier-bundles.mjs`, lignes 131-133 (CRLF)
- Modifier : `Docs/plans/2026-09-09-finition-classee-par-risque.md`, §F (CRLF)
- Modifier : ce plan, section « Écarts »

- [ ] **Étape 1 : le commentaire de `verifier-bundles.mjs`**

Par `poserCrlf`. Ancien :

```js
  // Toute application publiée entre ici. Le site public n'appelle aucune API
  // aujourd'hui, mais un artefact non contrôlé est un artefact où une clé peut
  // arriver sans que personne ne le voie.
```

Nouveau :

```js
  // Toute application publiée entre ici. Le site public poste vers
  // `demander-ouverture` depuis le 2026-08-23 : ses artefacts portent l'adresse
  // du projet et la clé publique, comme les deux autres — et une clé privée
  // pourrait y arriver par le même chemin sans que personne ne le voie.
```

- [ ] **Étape 2 : fermer le point F**

Par `poserCrlf`, dans `Docs/plans/2026-09-09-finition-classee-par-risque.md`.
Ancien :

```md
avec le défaut, et un lot qu'on ne peut plus relire.
```

Nouveau :

```md
avec le défaut, et un lot qu'on ne peut plus relire.

### Fermé le 2026-09-11

Les sept fonctions de l'application collecteur qui lisaient une liste sans
`range` épuisent leurs pages (`Docs/plans/2026-09-11-lectures-sans-borne.md`) :
l'accueil, les alertes, le rapprochement, l'écran Retrait, le profil, les
reçus et l'état des avis. Celles qui restent sans `range` sont bornées par le
métier — une carte, un client — et ce plan le dit chiffres de production à
l'appui. La relève du 2026-09-11 a trouvé la plus exposée hors de la liste
ci-dessus : `chargerAlertes`, dont la fenêtre de 90 jours dépassait mille
mises en quelques semaines.
```

- [ ] **Étape 3 : remplir « Écarts »** en fin de ce plan — ce qui s'est passé
  autrement qu'écrit, ou « aucun ».

- [ ] **Étape 4 : la chaîne complète**

```bash
SP="C:/Users/ME687~1.BER/AppData/Local/Temp/claude/c--Users-M-BERTHE-Documents-Kolek/42db2cca-3944-4844-b61a-644cbfa34609/scratchpad"
{ npm run verifier; echo "SORTIE_NPM=$?"; } > "$SP/verifier-lectures.log" 2>&1
```

Lire les **quatorze** étapes du journal, pas seulement la dernière ligne.
Attendu : `SORTIE_NPM=0`, `test:db` avec `lectures-paginees.test.ts` compris,
et `verifier:bundles` « Aucune fuite ».

- [ ] **Étape 5 : commit**

```bash
git add scripts/verifier-bundles.mjs Docs/plans/2026-09-09-finition-classee-par-risque.md Docs/plans/2026-09-11-lectures-sans-borne.md
git commit -m "docs: les lectures sans borne fermees, et un commentaire perime corrige" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Après le plan — ce qui demande l'exploitant

1. Fin de branche : fusion dans `main` en local, ou autre choix.
2. **Pousser `main` : accord explicite, séparé.** La poussée redéploie
   `app.kolek.cash` par Netlify. Aucune Edge Function ne change : le job de
   déploiement des fonctions dira « Aucune Edge Function touchée ».
3. Après la poussée : relever l'index servi par `app.kolek.cash` **avant**, puis
   vérifier qu'il devient celui du build local, et que `admin.kolek.cash` et
   `kolek.cash` n'ont pas bougé.

## Écarts

Exécuté le 2026-09-11. Cinq écarts, tous dans le jeu d'essai ou dans la
méthode ; le code de production est celui écrit ci-dessus, mot pour mot.

**1. Une espace insécable perdue à la réécriture.** L'épreuve ancienne
« rappelle toujours le montant en jeu » attend `30 000` avec une espace
insécable U+00A0 (ce que rend `formatMontant`). Le code de la tâche 1, étape 5,
a été recopié d'un affichage qui la montre comme une espace ordinaire : la
réécriture a cassé une épreuve qu'elle ne devait pas toucher. Rétablie par
Node, octet par octet ; inventaire des espaces spéciales identique à
l'original (une U+00A0). **Le bloc de code de l'étape 5 porte encore l'espace
ordinaire — ne pas le recopier tel quel.**

**2. Une mise de 100 n'existe pas.** `validerMise` exige un entier d'au moins
`MISE_MIN = 500`, et `soldeRestituable` lève `RangeError` sur 100. Le rouge de
la tâche 1 était authentique (la carte k1000 coupée n'était jamais évaluée) ;
le vert, lui, butait sur le jeu d'essai une fois la carte lue. Les mises des
cartes passent à 500 dans `parc`, dans l'épreuve de dormance et dans
`lectures.test.ts` (`soldeRestituable(2, 500)`) ; le reçu de la tâche 4 attend
`mise` 500. Les montants du rapprochement (100 et 10) restent : ce chemin ne
valide rien. Le rouge a été reprouvé sur le code d'origine avec le jeu
d'essai corrigé.

**3. `core.autocrlf=true`, et ce que ça change aux contrôles de fins de
ligne.** Les objets Git sont en LF ; « LF seules 93 » ne décrit que la copie
de travail. Un `git stash` passé pour comparer oxlint à `main` a réécrit quatre
fichiers en CRLF d'un bloc — contenu intact, historique intact. Remis depuis
une copie exacte (`cp`, puis `cmp`). En conséquence, le désarmement de la
tâche 5 s'est fait par copie et non par `git checkout`, qui aurait eu le même
effet.

**4. La sonde de la tâche 4, étape 7, par Node et non par `grep`.** Sous Git
Bash, `grep` retire les `\r` : sur un fichier CRLF, le motif pouvait ne rien
trouver sans rien prouver. La sonde Node tolère le `\r` et a été vue trouver
avant de conclure : 2 + 9 lectures sans borne sur le code d'origine, 0 + 0
après.

**5. oxlint sort à 0 avec un avertissement**, `react(only-export-components)`
dans `src/ecrans/ChoixMise.tsx:48`. Il existe tel quel sur `main` : ce plan ne
touche pas ce fichier.

**Épreuve en base (tâche 5)** : 3/3 armée ; désarmée, la prémisse passe et les
deux autres tombent sur 1000 au lieu de 1001.
