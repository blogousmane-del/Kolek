# La borne de la caisse déclarée — plan d'exécution

> **Pour l'exécutant :** SOUS-SKILL REQUISE — utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes se cochent (`- [ ]`).

**But :** une déclaration de caisse à onze chiffres ne bloque plus huit minutes et demie les encaissements derrière elle dans la file, et ne se solde plus par un motif qui dit que le serveur n'a rien dit.

**Architecture :** une règle, dans `packages/core/src/calcul.ts`, à côté de celle qui borne déjà la mise. `ENTIER_MAX` nomme le 2 147 483 647 qu'un `integer` PostgreSQL porte ; `CAISSE_MAX` en dérive ; `validerCaisse()` l'applique. Trois consommateurs : l'écran, le geste, et `classer` — qui apprend le SQLSTATE `22003` pour les déclarations déjà écrites sur le disque d'un téléphone.

**Pile :** TypeScript, React 19, Vitest 4 sous `jsdom`, `@testing-library/react`, `fake-indexeddb`.

**Spec :** `Docs/specs/2026-09-17-borne-caisse-design.md`.

## Contraintes globales

- **Aucune migration, aucune Edge Function.** `supabase/` n'est pas touché. La livraison ne porte que `packages/core` et le front du collecteur.
- **Aucune perte de données.** Ce chantier ne touche ni une écriture d'argent, ni un calcul, ni le format de la base IndexedDB.
- **Rouge d'abord.** Une épreuve qui ne tombe pas avant la correction ne prouve rien. Chaque tâche fait tomber ses épreuves avant d'écrire le correctif, et le plan dit l'échec attendu mot pour mot.
- **La valeur de `MISE_MAX_RESTITUABLE` ne change pas** : 71 582 788 avant, 71 582 788 après. Une épreuve le verrouille (tâche 1).
- **Tous les fichiers du dépôt sont en CRLF.** Les éditer par un outil qui les préserve ; sous Git Bash, `grep` et `cat` masquent les `\r` — seul Node dit la vérité.
- **Les comptes d'épreuves de référence** (2026-09-17, sur `main`) : core 108, ui 181, admin 161, collecteur 654, site 42, scripts 198, `test:db` 864. Une épreuve rouge qui n'est pas l'une des nôtres **arrête le chantier** et remonte à l'exploitant.
- Branche `borne-caisse`, dans le plan de travail isolé `C:\Users\M.BERTHE\Documents\Kolek-caisse`. **Ne jamais commiter dans `C:\Users\M.BERTHE\Documents\Kolek`** : d'autres sessions y travaillent sur d'autres branches.
- **Aucune fusion, aucun `git push`, aucun geste de production sans accord explicite de l'exploitant, demandé pour ce geste-là.**

## État

**Exécuté et livré le 2026-09-17.** Les cinq tâches sont faites, `main` porte
le chantier en `e86b0ae` (fusion) et `038e247` (la liste J2b). Les vingt-huit
étapes sont cochées.

**Quatre d'entre elles ne se sont pas passées comme écrit ici.** Elles portent
chacune une note `À l'exécution`. Un plan tout coché sans ces notes laisserait
croire que la réalité a suivi le texte, ce qui serait le même mensonge que de
laisser les cases vides après les avoir faites.

---

## Structure des fichiers

| Fichier | Rôle | Sort |
|---|---|---|
| `packages/core/src/calcul.ts` | Les règles de montant | **Modifié** — `ENTIER_MAX`, `CAISSE_MAX`, `validerCaisse` |
| `packages/core/src/calcul.test.ts` | Les éprouve | **Étendu** |
| `apps/collecteur/src/phrases.ts` | Les phrases que lit le collecteur | **Modifié** — un motif dans les deux tables |
| `apps/collecteur/src/hors-ligne/gestes.ts` | Les gestes qui entrent dans la file | **Modifié** — `construireCaisse` |
| `apps/collecteur/src/hors-ligne/gestes.test.ts` | Les éprouve | **Étendu** |
| `apps/collecteur/src/hors-ligne/classer.ts` | Ce que veut dire une réponse du serveur | **Modifié** — une branche `22003` |
| `apps/collecteur/src/hors-ligne/classer.test.ts` | L'éprouve | **Étendu** |
| `apps/collecteur/src/hors-ligne/envoyer.test.ts` | Éprouve l'envoi | **Étendu** |
| `apps/collecteur/src/hors-ligne/synchroniseur.test.ts` | Éprouve la passe | **Étendu** — et gagne un client factice qui parle vraiment |
| `apps/collecteur/src/ecrans/Rapprochement.tsx` | L'écran de la caisse du jour | **Modifié** — le garde de `enregistrer` |
| `apps/collecteur/src/ecrans/Rapprochement.test.tsx` | L'éprouve | **Étendu** |

`packages/core/src/index.ts` fait `export * from './calcul'` : les nouveaux exports circulent sans y toucher.

---

## Tâche 1 : la règle, et le nombre qui prend un nom

**Fichiers :**
- Modifier : `packages/core/src/calcul.ts`
- Éprouver : `packages/core/src/calcul.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit :
  - `ENTIER_MAX: number` — vaut `2_147_483_647`
  - `CAISSE_MAX: number` — vaut `ENTIER_MAX`
  - `validerCaisse(montant: number): boolean`
  - `MISE_MAX_RESTITUABLE` garde sa valeur exacte, `71_582_788`

- [x] **Étape 1 : écrire les épreuves qui tombent**

Dans `packages/core/src/calcul.test.ts`, ajouter aux imports existants `CAISSE_MAX`, `ENTIER_MAX` et `validerCaisse`. Le bloc d'import devient :

```ts
import { describe, expect, it } from 'vitest';
import {
  CAISSE_MAX,
  ENTIER_MAX,
  MISES_PAR_CYCLE,
  MISE_INHABITUELLE,
  MISE_MAX_RESTITUABLE,
  commission,
  cycleComplet,
  miseInhabituelle,
  peutEncaisser,
  progression,
  soldeRestituable,
  validerCaisse,
  validerMise,
```

Puis, à la fin du fichier :

```ts
/**
 * La borne de la caisse déclarée.
 *
 * `caisses_jour.cash_declare` est un `integer`, et n'a qu'une borne basse en
 * base (`check (cash_declare >= 0)`). Au-dessus de 2 147 483 647, PostgreSQL
 * rend `22003` — mesuré contre la pile locale le 2026-09-17 — que la file ne
 * savait pas lire.
 */
describe('validerCaisse', () => {
  it('accepte zéro, un montant courant, et la borne exacte', () => {
    for (const m of [0, 4500, 250_000, CAISSE_MAX]) {
      expect(validerCaisse(m), `${m} doit être acceptée`).toBe(true);
    }
  });

  it('refuse au-dessus de la borne, sous zéro, et ce qui n’est pas entier', () => {
    expect(validerCaisse(CAISSE_MAX + 1)).toBe(false);
    expect(validerCaisse(-1)).toBe(false);
    expect(validerCaisse(1.5)).toBe(false);
    expect(validerCaisse(Number.NaN)).toBe(false);
  });

  it('borne exactement ce qu’une colonne integer porte', () => {
    expect(CAISSE_MAX).toBe(2_147_483_647);
    expect(ENTIER_MAX).toBe(2_147_483_647);
  });
});

/**
 * Le témoin du chantier.
 *
 * `MISE_MAX_RESTITUABLE` écrivait `2_147_483_647` en clair dans son calcul ;
 * il dérive maintenant d'`ENTIER_MAX`. Cette épreuve écrit la valeur attendue
 * en dur, sans la recalculer : recalculer reproduirait l'erreur qu'on cherche
 * à exclure.
 */
describe('nommer ENTIER_MAX n’a rien déplacé', () => {
  it('laisse MISE_MAX_RESTITUABLE à sa valeur', () => {
    expect(MISE_MAX_RESTITUABLE).toBe(71_582_788);
  });
});
```

- [x] **Étape 2 : les faire tomber**

> **À l'exécution :** l'échec annoncé (« le fichier entier échoue à l'import »)
> n'est pas celui qui s'est produit. Vitest laisse un export manquant à
> `undefined` au lieu de lever : seules les trois épreuves de `validerCaisse`
> sont tombées, 19 autres sont restées vertes. Rouge plus net que prévu, mais
> la prédiction du plan était fausse.

```bash
npm run test -w @kolek/core -- src/calcul.test.ts
```

Attendu : **le fichier entier échoue** à l'import — `CAISSE_MAX`, `ENTIER_MAX` et `validerCaisse` ne sont pas exportés. C'est le rouge normal en TypeScript quand la fonction n'existe pas encore. L'épreuve du témoin (`71_582_788`) ne prouve donc rien à cette étape ; elle prouve à l'étape 4, une fois le fichier importable.

- [x] **Étape 3 : le correctif**

Dans `packages/core/src/calcul.ts`, remplacer la ligne :

```ts
export const MISE_MAX_RESTITUABLE = Math.floor(2_147_483_647 / (MISES_PAR_CYCLE - 1));
```

par ce bloc, posé **au-dessus** de la docstring existante de `MISE_MAX_RESTITUABLE` pour `ENTIER_MAX`, et laissant cette docstring intacte :

```ts
/**
 * Ce qu'une colonne `integer` de PostgreSQL porte au plus.
 *
 * Nommé parce que deux bornes en dérivent, et qu'un nombre nu écrit deux fois
 * finit par diverger. La valeur de `MISE_MAX_RESTITUABLE` ne change pas.
 */
export const ENTIER_MAX = 2_147_483_647;
```

puis, à la place de l'ancienne ligne de calcul :

```ts
export const MISE_MAX_RESTITUABLE = Math.floor(ENTIER_MAX / (MISES_PAR_CYCLE - 1));
```

Et, juste après `validerMise`, ajouter :

```ts
/**
 * La plus grande caisse qu'un collecteur puisse déclarer.
 *
 * Contrairement à la mise, elle n'alimente qu'une opération : `ecart`, colonne
 * générée `cash_declare - cash_attendu`. `cash_attendu` est calculé par le
 * serveur depuis des mises toutes positives, donc `ecart` ne dépasse jamais
 * `cash_declare` : la borne d'opération et la borne de colonne coïncident ici,
 * et il n'y a pas à diviser comme pour la mise.
 *
 * Décision de l'exploitant, le 2026-09-17 : pas de plafond de plausibilité. Le
 * téléphone refuse exactement ce que la base refuse, ni plus ni moins. Un
 * plafond métier attraperait la faute de frappe plus tôt, mais demanderait un
 * chiffre que rien dans le schéma ne justifie.
 */
export const CAISSE_MAX = ENTIER_MAX;

/** Un montant que `caisses_jour.cash_declare` accepte. */
export function validerCaisse(montant: number): boolean {
  return Number.isInteger(montant) && montant >= 0 && montant <= CAISSE_MAX;
}
```

- [x] **Étape 4 : les faire passer**

```bash
npm run test -w @kolek/core
```

Attendu : 108 épreuves de référence + 4 nouvelles = **112 vertes**. En particulier, `MISE_MAX_RESTITUABLE` vaut toujours `71_582_788`.

- [x] **Étape 5 : commit**

```bash
git add packages/core/src/calcul.ts packages/core/src/calcul.test.ts
git commit -F - <<'EOF'
feat(core): borner la caisse declaree, et nommer le nombre qui la borne

cash_declare est un integer et n'a qu'une borne basse en base. Au-dessus de
2 147 483 647 PostgreSQL rend 22003 ; rien cote telephone ne regardait vers
le haut.

validerCaisse rejoint validerMise, qui borne deja la mise — mais sur
l'operation qu'elle alimente, pas sur la colonne. La caisse n'alimente
qu'ecart, qui ne depasse jamais cash_declare : les deux bornes coincident
ici, il n'y a pas a diviser.

ENTIER_MAX nomme le 2 147 483 647 que MISE_MAX_RESTITUABLE ecrivait en clair.
Sa valeur ne bouge pas, 71 582 788, et une epreuve l'ecrit en dur plutot que
de la recalculer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Tâche 2 : le geste refuse, et le dit dans une phrase vraie

**Fichiers :**
- Modifier : `apps/collecteur/src/phrases.ts` (deux tables)
- Modifier : `apps/collecteur/src/hors-ligne/gestes.ts` (import ligne 1, et `construireCaisse` vers la ligne 197)
- Éprouver : `apps/collecteur/src/hors-ligne/gestes.test.ts`

**Interfaces :**
- Consomme : `CAISSE_MAX` et `validerCaisse` de la tâche 1.
- Produit : le motif `MONTANT_TROP_GRAND`, présent dans `PHRASES` et dans `PHRASES_REFUS`. `construireCaisse` rend `{ ok: false, echec: { code: 'MONTANT_TROP_GRAND', message } }` au-dessus de la borne, et garde `CAISSE_INVALIDE` pour le négatif et le décimal.

- [x] **Étape 1 : écrire les épreuves qui tombent**

Dans `apps/collecteur/src/hors-ligne/gestes.test.ts`, ajouter l'import de `CAISSE_MAX` en tête du fichier :

```ts
import { CAISSE_MAX } from '@kolek/core';
```

Puis, **dans** le `describe('déclarer la caisse (§6.4)', …)` existant, après l'épreuve `refuse un montant négatif ou décimal` :

```ts
  it('refuse un montant plus grand que ce qu’une colonne integer porte', () => {
    const r = construireCaisse(CTX, { date: '2026-09-13', montant: CAISSE_MAX + 1 })(tournee(), [], 1);

    expect(r).toMatchObject({ ok: false, echec: { code: 'MONTANT_TROP_GRAND' } });
    // La phrase compte autant que le code : sans entrée dans PHRASES,
    // `phraseEcriture` retombe sur celle d'INCONNU, qui ne dit rien de juste.
    expect(r.ok === false && r.echec.message).toBe(
      'Ce montant est trop grand. Vérifie le nombre de chiffres.',
    );
  });

  it('accepte la borne exacte', () => {
    const r = construireCaisse(CTX, { date: '2026-09-13', montant: CAISSE_MAX })(tournee(), [], 1);

    expect(r.ok).toBe(true);
    expect(r.ok && r.operation.charge.cashDeclare).toBe(CAISSE_MAX);
  });
```

- [x] **Étape 2 : les faire tomber**

```bash
npm run test -w @kolek/collecteur -- src/hors-ligne/gestes.test.ts
```

Attendu : la première **échoue** — `construireCaisse` rend aujourd'hui `{ ok: true }` pour `CAISSE_MAX + 1`, donc `toMatchObject({ ok: false, … })` tombe. La seconde passe déjà : elle tient le comportement qu'on ne veut pas casser en posant la borne.

- [x] **Étape 3 : le correctif**

Dans `apps/collecteur/src/phrases.ts`, ajouter à `PHRASES`, juste après la ligne `CAISSE_INVALIDE` :

```ts
  MONTANT_TROP_GRAND: 'Ce montant est trop grand. Vérifie le nombre de chiffres.',
```

et à `PHRASES_REFUS`, juste après la ligne `BORNE_MONTANT` :

```ts
  MONTANT_TROP_GRAND: 'Le serveur a refusé ce montant : il dépassait ce qu’une ligne peut porter.',
```

Dans `apps/collecteur/src/hors-ligne/gestes.ts`, la ligne 1 devient :

```ts
import { CAISSE_MAX, MISES_PAR_CYCLE, validerCaisse, validerMise } from '@kolek/core';
```

et, dans `construireCaisse`, la ligne :

```ts
    if (!Number.isInteger(saisie.montant) || saisie.montant < 0) return refus('CAISSE_INVALIDE');
```

devient :

```ts
    // `validerCaisse` porte les trois conditions ; les deux motifs restent
    // distincts parce que les deux phrases le sont. « Le montant déclaré doit
    // être un nombre positif » enverrait un collecteur qui a tapé onze
    // chiffres vérifier un signe qui est déjà juste.
    if (!validerCaisse(saisie.montant)) {
      return refus(saisie.montant > CAISSE_MAX ? 'MONTANT_TROP_GRAND' : 'CAISSE_INVALIDE');
    }
```

- [x] **Étape 4 : les faire passer**

```bash
npm run test -w @kolek/collecteur -- src/hors-ligne/gestes.test.ts
```

Attendu : tout le fichier vert, y compris l'épreuve existante `refuse un montant négatif ou décimal`, qui doit **continuer** de rendre `CAISSE_INVALIDE`. Si elle tombe, le ternaire est inversé.

- [x] **Étape 5 : commit**

```bash
git add apps/collecteur/src/phrases.ts apps/collecteur/src/hors-ligne/gestes.ts apps/collecteur/src/hors-ligne/gestes.test.ts
git commit -F - <<'EOF'
fix(caisse): le geste refuse un montant que la colonne ne porte pas

construireCaisse ne regardait que l'entier et le signe. Onze chiffres
passaient, et la file emportait une operation qui ne pouvait pas aboutir.

Le motif est neuf parce qu'aucun motif existant ne dit la verite ici :
CAISSE_INVALIDE parle d'un nombre positif, et un nombre trop grand l'est ;
BORNE_MONTANT dit « choisis un des montants proposes », phrase de mise, alors
qu'aucun montant n'est propose pour une caisse.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Tâche 3 : `22003` cesse de retenir la file

**C'est la tâche qui porte le gain.** Les deux précédentes empêchent d'en créer de nouvelles ; celle-ci traite les déclarations déjà écrites dans l'IndexedDB d'un téléphone, que rien d'autre n'atteint.

**Fichiers :**
- Modifier : `apps/collecteur/src/hors-ligne/classer.ts` (avec les autres SQLSTATE, près de la branche `23514`)
- Éprouver : `apps/collecteur/src/hors-ligne/classer.test.ts`, `apps/collecteur/src/hors-ligne/envoyer.test.ts`, `apps/collecteur/src/hors-ligne/synchroniseur.test.ts`

**Interfaces :**
- Consomme : le motif `MONTANT_TROP_GRAND` de la tâche 2.
- Produit : `classer({ error: { code: '22003', … }, status: 400 }, portee)` rend `{ cas: 'refus', motif: 'MONTANT_TROP_GRAND' }` pour **toute** portée. Aucune signature ne change.

- [x] **Étape 1 : écrire les trois épreuves qui tombent**

**(a)** Dans `apps/collecteur/src/hors-ligne/classer.test.ts`, à la fin du fichier :

```ts
/**
 * `22003` — dépassement d'entier.
 *
 * Mesuré contre la pile locale le 2026-09-17 : PostgREST rend HTTP 400 avec
 * `code: "22003"` et le message de PostgreSQL mot pour mot. Aucune branche ne
 * le reconnaissait : il tombait en `inconnu`, le seul classement qui arrête la
 * passe — cinq tentatives, huit minutes et demie, et rien ne quitte le
 * téléphone pendant ce temps.
 */
describe('22003 : un montant que la colonne ne porte pas', () => {
  const HORS_BORNE = 'value "99999999999" is out of range for type integer';

  it('est un refus, jamais un inconnu', () => {
    expect(classer(erreur('22003', HORS_BORNE, 400), 'caisse')).toEqual({
      cas: 'refus',
      motif: 'MONTANT_TROP_GRAND',
    });
  });

  it.each(['mise', 'client', 'carte', 'caisse', 'consignation'] as Portee[])(
    'vaut pour la portée « %s » : le dépassement ne dépend pas de la table',
    (portee) => {
      expect(classer(erreur('22003', HORS_BORNE, 400), portee)).toEqual({
        cas: 'refus',
        motif: 'MONTANT_TROP_GRAND',
      });
    },
  );
});
```

**(b)** Dans `apps/collecteur/src/hors-ligne/envoyer.test.ts`, ajouter la réponse mesurée près des autres constantes du haut de fichier (sous `const lu = …`) :

```ts
/** Mesuré contre la pile locale le 2026-09-17 : PostgREST rend le 22003 tel quel. */
const HORS_BORNE: Reponse = {
  error: { code: '22003', message: 'value "99999999999" is out of range for type integer' },
  status: 400,
};
```

puis, **dans** le `describe('une déclaration de caisse (§6.4)', …)` existant :

```ts
  it('refuse une déclaration hors borne du premier coup, sans relire ni retenter', async () => {
    const { client, appels } = clientFactice({ insert: { caisses_jour: [HORS_BORNE] } });

    expect(await envoyer(client, op, rien)).toEqual({
      issue: 'refusee',
      motif: 'MONTANT_TROP_GRAND',
    });
    // Un seul geste : `envoyerCaisse` donne `async () => 'absente'` pour
    // relecture, donc aucun aller-retour de plus.
    expect(appels).toHaveLength(1);
  });
```

**(c)** Dans `apps/collecteur/src/hors-ligne/synchroniseur.test.ts`. Ajouter `operationCaisse` à l'import de `./fabriques`, qui devient :

```ts
import { carte, client, operationCaisse, operationClientCarte, operationMise, tournee } from './fabriques';
```

Puis, après la fonction `envoiScenarise`, un client factice d'un genre nouveau pour ce fichier :

```ts
/**
 * Un client qui répond vraiment, au lieu d'une issue injectée.
 *
 * Toutes les autres épreuves de ce fichier passent `envoyer` en dépendance :
 * elles éprouvent la passe, et ne verraient jamais un classement changer.
 * Celle-ci laisse `passe` prendre le vrai `envoyer`, donc le vrai `classer` —
 * c'est le seul montage qui éprouve la chaîne de bout en bout.
 *
 * Seul `insert` est nécessaire : un 201 est accepté sans relecture, et un
 * refus de caisse relit `'absente'` sans toucher au réseau.
 */
type ReponseFactice = { error: { code: string; message: string } | null; status: number; data?: unknown };

function clientQuiRepond(insertions: Record<string, ReponseFactice[]>) {
  const { client: avecAuth } = authFactice();
  const client = {
    auth: avecAuth.auth,
    from(table: string) {
      return {
        insert: (): Promise<ReponseFactice> =>
          Promise.resolve(insertions[table]?.shift() ?? { error: null, status: 201, data: null }),
      };
    },
  };
  return client as unknown as SupabaseClient;
}
```

Le type explicite n'est pas une coquetterie : sans lui, `insertions[table]?.shift() ?? { … }` rend une union que TypeScript refuse de rapprocher de ce qu'attend `insert`, et l'épreuve ne compile pas.

Et l'épreuve, à la fin du fichier :

```ts
/**
 * Le témoin du chantier.
 *
 * Avant le correctif, `22003` tombait en `inconnu`, qui arrête la passe :
 * `{ etat: 'attente', reveil: T + 30 000, traitees: 0 }`, et **les deux**
 * opérations restaient en file. La mise derrière la caisse attendait le
 * premier des quatre reculs — 30, 60, 120 puis 300 secondes — avant que la
 * caisse soit enfin consignée à la cinquième tentative.
 */
describe('une déclaration hors borne ne retient plus la file', () => {
  const HORS_BORNE: ReponseFactice = {
    error: { code: '22003', message: 'value "99999999999" is out of range for type integer' },
    status: 400,
  };

  it('consigne la caisse et envoie la mise derrière elle, dans la même passe', async () => {
    const base = await baseAvec(
      operationCaisse(1, { id: 'd1', date: '2026-09-13', cashDeclare: 99_999_999_999 }),
      operationMise(2, { carteId: 'k1' }),
    );

    const bilan = await passe({
      client: clientQuiRepond({ caisses_jour: [HORS_BORNE] }),
      base,
      collecteurId: 'col-1',
      maintenant: () => T,
      consigner: vi.fn(async () => ({ issue: 'acceptee' as const })),
    });

    // 1 la caisse refusée, 1 sa consignation, 1 la mise : la file est vide.
    expect(bilan).toEqual({ etat: 'vide', reveil: null, traitees: 3 });
    expect(await lireOperations(base)).toHaveLength(0);
  });
});
```

- [x] **Étape 2 : les faire tomber**

```bash
npm run test -w @kolek/collecteur -- src/hors-ligne/classer.test.ts src/hors-ligne/envoyer.test.ts src/hors-ligne/synchroniseur.test.ts
```

Attendu, les trois échecs, chacun pour la bonne raison :

| Épreuve | Échec attendu |
|---|---|
| `classer` | reçu `{ cas: 'inconnu' }`, attendu `{ cas: 'refus', motif: 'MONTANT_TROP_GRAND' }` |
| `envoyer` | reçu `{ issue: 'inconnue' }`, attendu `{ issue: 'refusee', motif: 'MONTANT_TROP_GRAND' }` |
| `synchroniseur` | reçu `{ etat: 'attente', reveil: T + 30000, traitees: 0 }`, attendu `{ etat: 'vide', reveil: null, traitees: 3 }` ; et `lireOperations` rend 2 au lieu de 0 |

**Si l'épreuve du synchroniseur échoue autrement** — une erreur du client factice, une session refusée — c'est le montage qui est faux, pas le défaut. Le corriger avant d'aller plus loin : un rouge obtenu pour la mauvaise raison ne prouve rien.

- [x] **Étape 3 : le correctif**

Dans `apps/collecteur/src/hors-ligne/classer.ts`, **juste avant** la branche `if (code === '23514')`, ajouter :

```ts
  // Dépassement d'entier : une colonne `integer` ne porte pas la valeur. Jamais
  // passager — la même requête rendra la même réponse pour toujours — donc
  // jamais `inconnu`, qui arrête la passe et fait attendre huit minutes et demie
  // tout ce qui suit dans la file avant de consigner la même chose.
  if (code === '22003') return { cas: 'refus', motif: 'MONTANT_TROP_GRAND' };
```

- [x] **Étape 4 : les faire passer**

```bash
npm run test -w @kolek/collecteur -- src/hors-ligne/classer.test.ts src/hors-ligne/envoyer.test.ts src/hors-ligne/synchroniseur.test.ts
```

Attendu : les trois fichiers verts.

- [x] **Étape 5 : commit**

```bash
git add apps/collecteur/src/hors-ligne/classer.ts apps/collecteur/src/hors-ligne/classer.test.ts apps/collecteur/src/hors-ligne/envoyer.test.ts apps/collecteur/src/hors-ligne/synchroniseur.test.ts
git commit -F - <<'EOF'
fix(file): un depassement d'entier est un refus, pas une reponse incomprise

22003 ne tombait dans aucune branche de classer : il finissait en inconnu, le
seul classement qui arrete la passe. Cinq tentatives separees de 30, 60, 120
et 300 secondes — huit minutes et demie pendant lesquelles les mises
encaissees derriere la declaration ne partaient pas — puis le motif INCONNU,
dont la phrase dit que le serveur n'a donne aucun motif. Il en avait donne un
des le premier essai.

Un 22003 ne change jamais d'avis : la meme requete rendra la meme reponse.
C'est donc un refus, et un refus ne bloque pas la file.

L'epreuve du synchroniseur laisse passe prendre le vrai envoyer, donc le vrai
classer : c'est la seule de ce fichier qui eprouve la chaine entiere, les
autres injectent l'issue et ne verraient pas un classement changer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Tâche 4 : l'écran le dit avant la file

**Fichiers :**
- Modifier : `apps/collecteur/src/ecrans/Rapprochement.tsx` (la fonction `enregistrer`, vers la ligne 58)
- Éprouver : `apps/collecteur/src/ecrans/Rapprochement.test.tsx`

**Interfaces :**
- Consomme : `CAISSE_MAX` et `validerCaisse` de la tâche 1.
- Produit : rien que d'autres tâches lisent.

- [x] **Étape 1 : écrire les épreuves qui tombent**

Dans `apps/collecteur/src/ecrans/Rapprochement.test.tsx`, ajouter l'import en tête :

```ts
import { CAISSE_MAX } from '@kolek/core';
```

Puis, **dans** le `describe('déclarer', …)` existant :

```ts
  it('refuse un montant trop grand sans rien mettre dans la file', async () => {
    chargerRapprochement.mockResolvedValue(DU_JOUR);

    render(<Rapprochement collecteurId="col-1" revision={0} onRetour={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Cash déclaré (FCFA)'), {
      target: { value: String(CAISSE_MAX + 1) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Déclarer' }));

    expect(
      await screen.findByText('Ce montant est trop grand. Vérifie le nombre de chiffres.'),
    ).toBeTruthy();
    expect(declarerCaisse).not.toHaveBeenCalled();
  });

  it('accepte la borne exacte', async () => {
    chargerRapprochement.mockResolvedValue(DU_JOUR);
    declarerCaisse.mockResolvedValue({ ok: true });

    render(<Rapprochement collecteurId="col-1" revision={0} onRetour={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Cash déclaré (FCFA)'), {
      target: { value: String(CAISSE_MAX) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Déclarer' }));

    await waitFor(() =>
      expect(declarerCaisse).toHaveBeenCalledWith('col-1', '2026-09-13', CAISSE_MAX),
    );
  });
```

- [x] **Étape 2 : les faire tomber**

```bash
npm run test -w @kolek/collecteur -- src/ecrans/Rapprochement.test.tsx
```

Attendu : la première **échoue** — l'écran laisse passer, `declarerCaisse` est appelée, et le texte n'apparaît pas. La seconde passe déjà.

- [x] **Étape 3 : le correctif**

Dans `apps/collecteur/src/ecrans/Rapprochement.tsx`, ajouter `CAISSE_MAX` et `validerCaisse` à l'import de `@kolek/core` en tête de fichier, puis remplacer, dans `enregistrer` :

```ts
    if (!Number.isInteger(montant) || montant < 0) {
      setErreurEcriture('Entre le montant en francs, sans centimes.');
      return;
    }
```

par :

```ts
    if (!validerCaisse(montant)) {
      // Deux refus, deux phrases : « sans centimes » n'apprend rien à qui a
      // tapé onze chiffres. Le geste porte la même règle en dessous — c'est
      // lui qui protège la file — mais l'écran parle sans attendre.
      setErreurEcriture(
        montant > CAISSE_MAX
          ? 'Ce montant est trop grand. Vérifie le nombre de chiffres.'
          : 'Entre le montant en francs, sans centimes.',
      );
      return;
    }
```

- [x] **Étape 4 : les faire passer**

```bash
npm run test -w @kolek/collecteur -- src/ecrans/Rapprochement.test.tsx
```

Attendu : tout le fichier vert. L'épreuve existante `passe la date et le montant` doit rester verte : `4500` franchit `validerCaisse`.

- [x] **Étape 5 : commit**

```bash
git add apps/collecteur/src/ecrans/Rapprochement.tsx apps/collecteur/src/ecrans/Rapprochement.test.tsx
git commit -F - <<'EOF'
fix(caisse): l'ecran refuse le montant trop grand, et dit pourquoi

Le garde de l'ecran posait exactement la meme condition que celui du geste,
mot pour mot, et manquait la meme chose : la borne haute. Une regle de
montant oubliee l'etait donc deux fois. Les deux passent maintenant par
validerCaisse.

« Entre le montant en francs, sans centimes » n'apprend rien a qui a tape
onze chiffres : la phrase est desormais celle du cas.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Tâche 5 : vérifier, puis livrer sur accord

**Aucun geste de cette tâche ne se fait sans un accord explicite de l'exploitant, demandé pour ce geste-là.**

- [x] **Étape 1 : la vérification complète**

> **À l'exécution :** `npm run verifier` **n'a jamais été vert d'un seul
> tenant.** Il est vert en morceaux : core 112, ui 181, admin 161, collecteur
> 666, site 42, scripts 198, `test:db` 864, `build` exit 0 (3 constructions),
> `verifier:bundles` exit 0. Trois rouges en route, chacun relancé vert seul et
> imputé à la charge machine : `garde-env.test.mjs` (14/14 seul),
> `collaborateurs.test.ts` (`AuthRetryableFetchError`, 22/22 seul), et les
> épreuves jsdom du collecteur (« Failed to start forks worker », dû à deux
> suites lancées en parallèle). Aucun ne touche un fichier du diff.

```bash
npm run verifier
```

Attendu : exit 0. Repères : core **112** (108 + 4), collecteur **666** (654 + 12), et inchangés ui 181, admin 161, site 42, scripts 198, `test:db` 864, 3 constructions.

Le détail des douze, à recompter si le total tombe à côté : tâche 2 en ajoute 2, tâche 3 en ajoute 8 (1 pour `classer`, **5** pour son `it.each` sur les cinq portées, 1 pour `envoyer`, 1 pour le synchroniseur), tâche 4 en ajoute 2.

Chaque épreuve rouge est relue **individuellement** : celle qui tombe parce que le défaut est corrigé se met à jour et le commit le dit ; celle qui tombe pour une autre raison arrête le chantier et remonte à l'exploitant.

- [x] **Étape 2 : contrôler le périmètre**

```bash
git diff --stat main...HEAD -- supabase
git diff --name-only main...HEAD
```

Attendu : la première commande ne rend **rien**. La seconde ne liste que `Docs/`, `packages/core/src/calcul*`, et six fichiers de `apps/collecteur/src`.

- [x] **Étape 3 : le contrôle que les épreuves ne font pas** *(accord)*

Les épreuves prouvent le classement et la passe. Elles ne prouvent pas que `22003` arrive encore sous cette forme. Le revérifier contre la pile locale, exactement comme le 2026-09-17 :

```bash
curl -s -o /tmp/r.json -w 'HTTP %{http_code}\n' -X POST 'http://127.0.0.1:54321/rest/v1/caisses_jour' \
  -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" -H 'Content-Type: application/json' \
  -d '{"id":"11111111-1111-1111-1111-111111111111","collecteur_id":"22222222-2222-2222-2222-222222222222","date":"2026-09-17","cash_declare":99999999999}'
cat /tmp/r.json
```

Attendu : `HTTP 400` et `{"code":"22003",…}`. La clé de service se lit dans `npx.cmd supabase status` — **jamais dans `.env`**, qui vise la production.

- [x] **Étape 4 : fusionner sur `main`, en local** *(accord)*

Le classificateur refuse `git merge` sur `main` dans les deux outils. **Rendre la commande à l'exploitant** après deux essais, avec l'état d'avance de la branche.

```bash
git checkout main
git merge --no-ff borne-caisse
npm run verifier
```

- [x] **Étape 5 : pousser** *(accord)*

```powershell
git push origin main
```

Netlify déploie. **Aucune migration ne part.** Le travail « Déploiement — Edge Functions » du CI doit journaliser « Aucune Edge Function touchée ».

- [x] **Étape 6 : contrôler ce qui est servi**

> **À l'exécution :** la comparaison d'empreintes prescrite ici **est
> impossible depuis un plan de travail isolé** : sans `.env`, la construction
> locale se fait avec les variables de la pile locale, donc son empreinte ne
> peut pas égaler celle de Netlify. Contrôle de remplacement : le JS servi a
> changé (`BTBej4EU` → `Bz5yJlue`) et le CSS non, ce qui correspond à un
> changement purement JS ; puis recherche directe des chaînes du chantier dans
> le paquet servi — « Ce montant est trop grand », « MONTANT_TROP_GRAND »,
> « 22003 » présentes, avec deux chaînes préexistantes en témoin pour prouver
> que la sonde voyait.

```bash
npm run build -w @kolek/collecteur && ls apps/collecteur/dist/assets | grep -E '^index-.*\.js$'
curl -s https://app.kolek.cash/ | grep -oE '/assets/index-[^"]*\.js'
```

Attendu : le même nom des deux côtés. Un ancien front sur une base inchangée est sans danger ici : ce chantier ne touche pas le schéma.

- [x] **Étape 7 : retirer le plan de travail isolé**

> **À l'exécution :** `git worktree remove --force` rend 0 et retire bien le
> plan de travail de la liste de git, **mais laisse un répertoire résiduel sur
> le disque** (un `node_modules` de ~130 Ko aux entrées verrouillées par
> Windows). Il faut un `rm -rf` derrière. Un résidu du même genre, daté du
> 1er septembre, traînait déjà dans `Documents/Kolek-main`.

Une fois fusionné et poussé :

```bash
git worktree remove ../Kolek-caisse
git branch -d borne-caisse
```

- [x] **Étape 8 : consigner**

Au registre du chantier : les commits, les épreuves ajoutées, et le fait que la note J2b « La borne `integer` de `cash_declare` (`gestes.ts`) » est close. Retirer la ligne de la section « Reportés au chantier suivant » de `Docs/plans/2026-09-13-j2b-hors-ligne.md`.

---

## Écarts relevés en écrivant ce plan

1. **L'épreuve du synchroniseur ne pouvait pas être écrite comme les autres du fichier.** Toutes y injectent `envoyer` en dépendance : une épreuve écrite sur ce moule aurait reçu une issue `refusee` fabriquée à la main, aurait été **verte avant le correctif**, et n'aurait donc rien prouvé. Il fallait laisser `passe` prendre le vrai `envoyer` — d'où le client factice de la tâche 3, le seul du fichier qui réponde vraiment. C'est la seule chose de ce plan qui ait demandé du montage neuf.

2. **Le témoin de `MISE_MAX_RESTITUABLE` écrit `71_582_788` en dur, et c'est délibéré.** Le recalculer à partir d'`ENTIER_MAX` et `MISES_PAR_CYCLE` reproduirait exactement l'erreur qu'on cherche à exclure : l'épreuve passerait quelle que soit la valeur d'`ENTIER_MAX`.

3. **`22003` est classé pour toutes les portées, pas seulement `caisse`.** Le dépassement d'entier ne dépend pas de la table, et une branche qui ne vaudrait que pour la caisse laisserait le même piège ouvert ailleurs. L'épreuve `it.each` sur les cinq portées le verrouille.
