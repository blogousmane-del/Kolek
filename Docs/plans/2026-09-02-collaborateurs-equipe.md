# Collaborateurs — plan d'implémentation

> **Pour les agents exécutants :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les
> étapes portent des cases à cocher (`- [ ]`).

**But.** Le forfait Illimité inclut l'activation de trois collaborateurs : des
collecteurs à part entière, rattachés à un titulaire qui les suit et peut
encaisser à leur place.

**Architecture.** Une colonne `collecteurs.titulaire_id` porte tout le modèle.
Aucune policy RLS n'est élargie : l'isolation `collecteur_id = auth.uid()` reste
vraie mot pour mot, et tout ce qui traverse l'équipe passe par des portes
dédiées — deux fonctions `security definer` sans paramètre exploitable pour la
lecture, trois Edge Functions pour l'écriture. Deux colonnes neuves,
`mises.encaisse_par` et `retraits.restitue_par`, font suivre la caisse la main
qui a pris l'argent plutôt que le propriétaire du client.

**Pile.** PostgreSQL 15 (Supabase), PostgREST, Edge Functions Deno, React 19 +
Vite + Tailwind v4, Vitest 4, oxlint. Monorepo npm workspaces.

**Spécification source.** `Docs/specs/2026-09-02-collaborateurs-equipe-design.md`.
Chaque tâche nomme la section qu'elle réalise.

---

## Contraintes globales

Elles s'appliquent à **toutes** les tâches, sans être répétées dans chacune.

1. **Ce dépôt n'a aucune configuration Prettier.** Il n'utilise qu'`oxlint`.
   Lancer `npx prettier --write` reformate 14 fichiers avec les défauts de
   Prettier (guillemets doubles, `printWidth` 80) et détruit le style du dépôt.
   **Ne jamais lancer Prettier sur ce dépôt.**
2. **Les fichiers de la copie de travail sont en CRLF.** Un script d'édition qui
   cherche une chaîne multi-lignes doit normaliser LF ↔ CRLF, sinon l'ancre ne
   correspond jamais.
3. **Typographie française.** L'apostrophe est `’` (U+2019), jamais `'`. Le tiret
   d'incise est le cadratin `—`. Les commentaires, messages d'erreur et textes
   d'interface sont en français ; le code, les noms de colonnes et les codes
   d'erreur courts (`ACCES_RESERVE`) restent tels quels.
4. **Toute fonction `security definer` redéfinie porte
   `set search_path = public, pg_temp`.** La migration balai
   `20260830131000_search_path_pg_temp_en_dernier.sql` a durci les 19 fonctions
   existantes par des `alter function` **qui ne nomment aucune d'elles**. Un
   `create or replace` écrit sans y penser annule ce durcissement **en silence**.
   `supabase/tests/search-path.test.ts` est le filet — il doit rester vert.
5. **Aucune policy RLS n'est élargie.** Deux sont resserrées (tâche 2). Toute
   autre modification de policy est hors périmètre et doit être signalée, pas
   commise.
6. **Les colonnes neuves ne sont jamais ajoutées à un `grant insert`/`update`
   existant**, sauf mention explicite dans la tâche. Les GRANT de colonne sont la
   défense réelle du produit, pas les policies.
7. **`COLLABORATEURS_MAX = 3`** vit dans `packages/core/src/paliers.ts`. Le
   déclencheur SQL porte la même valeur en dur avec un commentaire qui nomme la
   constante ; les deux se déplacent ensemble ou pas du tout.
8. **Commandes exactes** (depuis la racine `c:\Users\M.BERTHE\Documents\Kolek`) :
   - types d'une application : `npx tsc -b apps/collecteur` — **il n'existe pas
     de tsconfig racine**, `npx tsc -b` seul échoue ;
   - lint : `npx oxlint apps/collecteur/src` ;
   - tests d'une application : `npm test --workspace @kolek/collecteur` ;
   - tests de base : `npm run test:db` (exige la pile Supabase locale démarrée) ;
   - un seul fichier de base :
     `npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/<fichier>.test.ts` ;
   - migrations rejouées à neuf : `npm run db:reset` ;
   - chaîne complète : `npm run verifier`.
9. **Le runtime Edge Functions local ne sert pas.** Toute requête vers
   `/functions/v1/` répond HTTP 500 sur cette machine, y compris pour une
   fonction triviale. Les six suites de tests qui appellent des Edge Functions
   par HTTP échouent donc pour raison d'environnement, pas de régression. Les
   tests d'Edge Function écrits par ce plan **doivent être écrits et commis**,
   mais leur exécution locale est attendue en échec : le rapporter comme **NON
   VÉRIFIÉ**, jamais comme un succès. Le SQL, lui, se vérifie directement :
   `docker exec supabase_db_Kolek psql -U postgres -d postgres -c "…"`.
10. **Vitest 4 sans `globals`.** `describe/it/expect/vi` s'importent depuis
    `'vitest'`. Dans les tests de composants, `afterEach(cleanup)` est
    manuel. **`@testing-library/jest-dom` n'est pas installé** : utiliser
    `.textContent` + `toContain`, `toBeTruthy()`, et `queryBy… → toBeNull()`.
    `getByText` normalise les espaces — pour une assertion sensible aux suites
    d'espaces, lire `document.body.textContent`.
11. **Un commit par tâche**, message en français, préfixe conventionnel
    (`feat:`, `fix:`, `test:`, `docs:`), corps expliquant le *pourquoi*. Chaque
    message se termine par :
    `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
12. **Branche de travail : `collaborateurs-equipe`**, déjà créée, tête
    `d75b047`. Ne pas travailler sur `main`.

---

## Carte des fichiers

**Migrations créées** (`supabase/migrations/`)

| Fichier | Responsabilité |
|---|---|
| `20260902100000_collaborateurs_rattachement.sql` | La colonne `titulaire_id`, son index, son GRANT de lecture, le déclencheur des cinq refus |
| `20260902110000_abonnement_ouvre_droit.sql` | `abonnement_ouvre_droit()`, la suspension descendante, les deux policies resserrées |
| `20260902120000_encaisse_par.sql` | `mises.encaisse_par`, `retraits.restitue_par`, `mises_avant_insert`, `cash_attendu_du_jour`, les deux déclencheurs de caisse |
| `20260902130000_equipe_vue.sql` | `equipe_vue()` et `equipe_clients(uuid)` |
| `20260902140000_mrr_hors_collaborateurs.sql` | `admin_vue_globale()` : le chiffre d'affaires ignore les collaborateurs, la population les compte |

**Edge Functions** (`supabase/functions/`)

| Fichier | Responsabilité |
|---|---|
| `collecteur-creer-collaborateur/index.ts` | Créer et rattacher un compte, sous le contrôle du palier |
| `collecteur-encaisser-pour/index.ts` | Encaisser sur la carte d'un coéquipier |
| `collecteur-cloturer-carte/index.ts` *(modifié)* | Lecture sous clé de service, `restitue_par` distinct de `collecteur_id` |

**Cœur partagé**

| Fichier | Responsabilité |
|---|---|
| `packages/core/src/paliers.ts` *(modifié)* | `COLLABORATEURS_MAX`, champ `collaborateursInclus` |
| `scripts/generer-paliers-edge.mjs` *(modifié)* | Fait traverser `collaborateursInclus` vers Deno |
| `supabase/functions/_shared/paliers.ts` *(engendré)* | Ne jamais éditer à la main |

**Application collecteur** (`apps/collecteur/src/`)

| Fichier | Responsabilité |
|---|---|
| `lectures-ecrans.ts` *(modifié)* | `chargerProfil` rend `titulaireId` ; `chargerEquipe`, `chargerClientsCollaborateur` |
| `ecritures-ecrans.ts` *(modifié)* | `creerCollaborateur`, `encaisserPour` |
| `ecrans/Equipe.tsx` *(créé)* | L'écran « Mon équipe » |
| `ecrans/EquipeClients.tsx` *(créé)* | La tournée d'un coéquipier, et son bouton d'encaissement |
| `Coquille.tsx` *(modifié)* | Deux pages secondaires de plus |
| `ecrans/Accueil.tsx` *(modifié)* | L'action « Équipe », visible pour les seuls titulaires |
| `ecrans/Bilan.tsx`, `ChoixMise.tsx`, `Recus.tsx`, `Retrait.tsx` *(modifiés)* | Les quatre textes de commission |
| `ecrans/Plus.tsx` *(modifié)* | La mention du titulaire sur le profil |

**Tests de base** (`supabase/tests/`)

| Fichier | Responsabilité |
|---|---|
| `collaborateurs.test.ts` *(créé)* | Rattachement, bornes, suspension, `equipe_vue`, `equipe_clients`, MRR |
| `cash-equipe.test.ts` *(créé)* | La caisse suit la main |
| `isolation.test.ts` *(modifié)* | Trois cas de plus, aucun retiré |
| `collecteur-creer-collaborateur.test.ts`, `collecteur-encaisser-pour.test.ts` *(créés)* | Patron `super-admin-*` : 401, 403, 404, nominal |

---

## Tâche 1 — Le rattachement

Réalise la **§1** de la spécification.

**Fichiers**
- Créer : `supabase/migrations/20260902100000_collaborateurs_rattachement.sql`
- Modifier : `packages/core/src/paliers.ts`
- Modifier : `scripts/generer-paliers-edge.mjs`
- Engendré : `supabase/functions/_shared/paliers.ts`
- Créer : `supabase/tests/collaborateurs.test.ts`
- Modifier : `packages/core/src/paliers.test.ts` (s'il existe ; sinon créer les
  assertions dans le fichier de test du paquet)

**Interfaces**
- Produit : `COLLABORATEURS_MAX: number` et
  `DescriptionPalier.collaborateursInclus: number` exportés par `@kolek/core` ;
  la colonne `public.collecteurs.titulaire_id uuid null`, lisible par
  `authenticated` sur sa propre ligne, jamais écrivable par PostgREST.
- Consomme : rien.

- [ ] **Étape 1 : le test de base qui échoue**

Créer `supabase/tests/collaborateurs.test.ts` :

```ts
import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

afterAll(nettoyer);

/** Passe un collecteur en titulaire Illimité actif, sous clé de service. */
async function rendreTitulaire(id: string): Promise<void> {
  const { error } = await admin
    .from('collecteurs')
    .update({ palier: 'illimite', abonnement_statut: 'actif' })
    .eq('id', id);
  expect(error).toBeNull();
}

/** Rattache `collaborateur` à `titulaire`, et rend l'erreur éventuelle. */
async function rattacher(collaborateur: string, titulaire: string | null) {
  return admin.from('collecteurs').update({ titulaire_id: titulaire }).eq('id', collaborateur);
}

describe('le rattachement', () => {
  it('pose titulaire_id quand le titulaire est Illimité actif', async () => {
    const patron = await creerCollecteur('Patron Un', `+2250700${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Un', `+2250701${Date.now() % 100000}`);
    await rendreTitulaire(patron.id);

    const { error } = await rattacher(awa.id, patron.id);
    expect(error).toBeNull();

    const { data } = await admin
      .from('collecteurs')
      .select('titulaire_id')
      .eq('id', awa.id)
      .single();
    expect(data?.titulaire_id).toBe(patron.id);
  });

  it('refuse un titulaire qui n’est pas Illimité actif', async () => {
    const patron = await creerCollecteur('Patron Deux', `+2250702${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Deux', `+2250703${Date.now() % 100000}`);
    await admin.from('collecteurs').update({ palier: 'pro' }).eq('id', patron.id);

    const { error } = await rattacher(awa.id, patron.id);
    expect(error?.message).toContain('TITULAIRE_SANS_DROIT');
  });

  it('refuse l’auto-rattachement', async () => {
    const seul = await creerCollecteur('Seul', `+2250704${Date.now() % 100000}`);
    await rendreTitulaire(seul.id);

    const { error } = await rattacher(seul.id, seul.id);
    expect(error?.message).toContain('RATTACHEMENT_A_SOI');
  });

  it('refuse la chaîne : un collaborateur ne recrute pas', async () => {
    const patron = await creerCollecteur('Patron Trois', `+2250705${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Trois', `+2250706${Date.now() % 100000}`);
    const kofi = await creerCollecteur('Kofi Trois', `+2250707${Date.now() % 100000}`);
    await rendreTitulaire(patron.id);
    await rendreTitulaire(awa.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();

    const { error } = await rattacher(kofi.id, awa.id);
    expect(error?.message).toContain('CHAINE_INTERDITE');
  });

  it('refuse de rattacher quelqu’un qui a déjà des collaborateurs', async () => {
    const grand = await creerCollecteur('Grand', `+2250708${Date.now() % 100000}`);
    const moyen = await creerCollecteur('Moyen', `+2250709${Date.now() % 100000}`);
    const petit = await creerCollecteur('Petit', `+2250710${Date.now() % 100000}`);
    await rendreTitulaire(grand.id);
    await rendreTitulaire(moyen.id);
    expect((await rattacher(petit.id, moyen.id)).error).toBeNull();

    const { error } = await rattacher(moyen.id, grand.id);
    expect(error?.message).toContain('DEJA_TITULAIRE');
  });

  it('refuse le quatrième collaborateur', async () => {
    const patron = await creerCollecteur('Patron Quatre', `+2250711${Date.now() % 100000}`);
    await rendreTitulaire(patron.id);

    const equipe: CollecteurTest[] = [];
    for (let i = 0; i < 3; i += 1) {
      const membre = await creerCollecteur(`Membre ${i}`, `+22507${20 + i}${Date.now() % 10000}`);
      equipe.push(membre);
      expect((await rattacher(membre.id, patron.id)).error).toBeNull();
    }

    const quatrieme = await creerCollecteur('Quatrième', `+2250799${Date.now() % 100000}`);
    const { error } = await rattacher(quatrieme.id, patron.id);
    expect(error?.message).toContain('EQUIPE_COMPLETE');
  });

  it('refuse de supprimer un titulaire qui a des collaborateurs', async () => {
    const patron = await creerCollecteur('Patron Cinq', `+2250712${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Cinq', `+2250713${Date.now() % 100000}`);
    await rendreTitulaire(patron.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();

    const { error } = await admin.auth.admin.deleteUser(patron.id);
    expect(error).not.toBeNull();
  });

  it('laisse un collaborateur lire son propre titulaire_id', async () => {
    const patron = await creerCollecteur('Patron Six', `+2250714${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Six', `+2250715${Date.now() % 100000}`);
    await rendreTitulaire(patron.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();

    const { data, error } = await awa.client
      .from('collecteurs')
      .select('titulaire_id')
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.titulaire_id).toBe(patron.id);
  });

  it('refuse qu’un collecteur se rattache lui-même par PostgREST', async () => {
    const patron = await creerCollecteur('Patron Sept', `+2250716${Date.now() % 100000}`);
    const malin = await creerCollecteur('Malin', `+2250717${Date.now() % 100000}`);
    await rendreTitulaire(patron.id);

    // Le GRANT de colonne est la défense : `titulaire_id` n’est pas dans
    // `grant update (nom, telephone, zone)`. PostgREST répond 42501.
    const { error } = await malin.client
      .from('collecteurs')
      .update({ titulaire_id: patron.id })
      .eq('id', malin.id);
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Étape 2 : le lancer pour le voir échouer**

```
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/collaborateurs.test.ts
```

Attendu : ÉCHEC — `column "titulaire_id" of relation "collecteurs" does not exist`.

- [ ] **Étape 3 : la migration**

Créer `supabase/migrations/20260902100000_collaborateurs_rattachement.sql` :

```sql
-- Le rattachement d'un collaborateur à son titulaire.
--
-- Une seule colonne porte tout le modèle d'équipe. `null` vaut « titulaire, ou
-- collecteur seul » — les deux sont le même état, et c'est voulu : un collecteur
-- ordinaire est un titulaire sans collaborateur, et aucun code n'a donc à
-- distinguer les deux cas.
--
-- `on delete restrict` et non `cascade` : supprimer un titulaire qui a des
-- collaborateurs doit échouer bruyamment. Un `cascade` effacerait trois comptes
-- et leurs clients sur un clic dans l'administration.

alter table public.collecteurs
  add column titulaire_id uuid references public.collecteurs(id) on delete restrict;

comment on column public.collecteurs.titulaire_id is
  'Le titulaire dont ce collecteur est collaborateur. NULL = titulaire ou collecteur seul. '
  'Écrit uniquement sous clé de service, par collecteur-creer-collaborateur.';

-- Partiel : la très grande majorité des lignes portent `null`, et les indexer
-- ne servirait qu'à grossir l'index.
create index collecteurs_titulaire_idx
  on public.collecteurs (titulaire_id) where titulaire_id is not null;

-- ---------------------------------------------------------------------------
-- Le droit de lecture, et l'absence de droit d'écriture
-- ---------------------------------------------------------------------------
-- `collecteurs` est en GRANT de colonne, pas en GRANT de table : une colonne
-- neuve n'est donc lisible par personne tant qu'on ne l'accorde pas. Le
-- collaborateur doit lire son propre `titulaire_id` — quatre écrans en
-- dépendent pour dire à qui revient la commission — et la policy
-- `collecteurs_select (id = auth.uid())` limite déjà cette lecture à sa ligne.
grant select (titulaire_id) on public.collecteurs to authenticated;

-- Et surtout : `titulaire_id` n'est PAS ajouté au
-- `grant update (nom, telephone, zone)`. Un collecteur ne peut donc pas se
-- rattacher lui-même par PostgREST, ni détacher un collaborateur. Le
-- rattachement n'existe que par la clé de service.

-- ---------------------------------------------------------------------------
-- Les cinq refus
-- ---------------------------------------------------------------------------
-- Une sous-requête ne passe pas dans un `check` : c'est donc un déclencheur.
-- Il s'exécute sous clé de service comme sous n'importe quelle identité — c'est
-- la dernière barrière, celle qui tient même quand l'Edge Function s'est trompée.
create or replace function public.collecteurs_valider_rattachement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare titulaire public.collecteurs%rowtype;
        deja      integer;
begin
  if new.titulaire_id is null then
    return new;
  end if;

  -- 1. L'auto-rattachement.
  if new.titulaire_id = new.id then
    raise exception 'RATTACHEMENT_A_SOI';
  end if;

  select * into titulaire from public.collecteurs where id = new.titulaire_id;
  if not found then
    raise exception 'TITULAIRE_INTROUVABLE';
  end if;

  -- 2. La chaîne. Un collaborateur ne recrute pas : sans cette borne, la
  -- profondeur de l'arbre serait libre, et `equipe_vue()` ne rendrait qu'un
  -- étage sur deux.
  if titulaire.titulaire_id is not null then
    raise exception 'CHAINE_INTERDITE';
  end if;

  -- 3. Le titulaire d'un titulaire. Symétrique du précédent, et nécessaire :
  -- sans lui, deux rattachements dans le bon ordre fabriquent la chaîne que le
  -- test 2 refuse dans l'autre ordre.
  if exists (select 1 from public.collecteurs where titulaire_id = new.id) then
    raise exception 'DEJA_TITULAIRE';
  end if;

  -- 4. Le palier. C'est ici que le forfait Illimité devient une règle et non
  -- une mention sur une grille tarifaire.
  if titulaire.palier <> 'illimite' or titulaire.abonnement_statut <> 'actif' then
    raise exception 'TITULAIRE_SANS_DROIT';
  end if;

  -- 5. Le quatrième. La valeur 3 est celle de `COLLABORATEURS_MAX` dans
  -- packages/core/src/paliers.ts. La base ne lit pas le TypeScript : les deux
  -- se déplacent ensemble ou pas du tout.
  select count(*) into deja
    from public.collecteurs
   where titulaire_id = new.titulaire_id
     and id <> new.id;
  if deja >= 3 then
    raise exception 'EQUIPE_COMPLETE';
  end if;

  return new;
end;
$fn$;

revoke all on function public.collecteurs_valider_rattachement() from public, anon, authenticated;

drop trigger if exists collecteurs_valider_rattachement on public.collecteurs;
create trigger collecteurs_valider_rattachement
  before insert or update of titulaire_id on public.collecteurs
  for each row execute function public.collecteurs_valider_rattachement();

-- ------------------------------- Garde-fou --------------------------------

do $garde$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.collecteurs'::regclass
       and tgname  = 'collecteurs_valider_rattachement'
  ) then
    raise exception 'GARDE_FOU : le rattachement n''est validé par rien.';
  end if;

  if has_column_privilege('authenticated', 'public.collecteurs', 'titulaire_id', 'update') then
    raise exception 'GARDE_FOU : un collecteur peut écrire son propre titulaire_id.';
  end if;

  if not has_column_privilege('authenticated', 'public.collecteurs', 'titulaire_id', 'select') then
    raise exception 'GARDE_FOU : un collaborateur ne peut pas lire son titulaire.';
  end if;
end;
$garde$;
```

- [ ] **Étape 4 : rejouer les migrations et relancer**

```
npm run db:reset
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/collaborateurs.test.ts
```

Attendu : 9 tests verts.

- [ ] **Étape 5 : la constante et le champ tarifaire**

Dans `packages/core/src/paliers.ts`, juste avant `export interface DescriptionPalier` :

```ts
/**
 * Le nombre de collaborateurs qu'un titulaire Illimité peut activer.
 *
 * Le déclencheur `collecteurs_valider_rattachement` porte la même valeur en dur
 * — la base ne lit pas le TypeScript. Les deux se déplacent ensemble ou pas du
 * tout, et le commentaire du déclencheur nomme cette constante pour que le
 * second point de modification se trouve.
 */
export const COLLABORATEURS_MAX = 3;
```

Ajouter le champ à l'interface, après `limiteClients` :

```ts
  /**
   * Le nombre de collaborateurs inclus. `0` partout sauf sur Illimité.
   *
   * Dans le même fichier que le prix, et pour la même raison : la grille
   * tarifaire de la vitrine et le contrôle d'accès de la création d'un
   * collaborateur doivent lire le même chiffre, sinon on vend trois places et
   * on en accorde deux.
   */
  collaborateursInclus: number;
```

Ajouter la valeur dans les quatre entrées de `PALIERS` — après `limiteClients` :
`collaborateursInclus: 0,` pour `essai`, `standard` et `pro` ;
`collaborateursInclus: COLLABORATEURS_MAX,` pour `illimite`.

Et, dans les `fonctions` d'`illimite`, remplacer
`{ libelle: 'Manager dédié', incluse: true },` par :

```ts
      { libelle: '3 collaborateurs', incluse: true },
      { libelle: 'Manager dédié', incluse: true },
```

- [ ] **Étape 6 : faire traverser le chiffre vers Deno**

`supabase/functions/_shared/paliers.ts` est **engendré**. Modifier le générateur,
`scripts/generer-paliers-edge.mjs`.

Dans `contenuAttendu()`, remplacer la construction de `lignes` :

```js
  const lignes = PALIERS.map(
    (p) =>
      `  { cle: '${p.cle}', nom: '${p.nom}', prix: ${p.prix}, limiteClients: ${p.limiteClients}, collaborateursInclus: ${p.collaborateursInclus} },`,
  ).join('\n');
```

et ajouter le champ à l'interface engendrée, juste après le bloc `limiteClients` :

```js
    `  /** Plafond de clients ; \`null\` vaut « aucun plafond ». */\n` +
    `  limiteClients: number | null;\n` +
    `  /** Collaborateurs inclus dans le forfait. */\n` +
    `  collaborateursInclus: number;\n` +
    `}\n\n` +
```

Corriger aussi le commentaire de `contenuAttendu()`, qui devient faux :

```js
/**
 * Seuls la clé, le nom, le prix et les deux plafonds traversent. Les couleurs,
 * accroches et listes de fonctions sont de l'affichage : les emporter côté
 * serveur inviterait à fabriquer des écrans depuis l'Edge Function, ce qui n'est
 * pas son travail. `collaborateursInclus` traverse parce que c'est une règle
 * appliquée côté serveur, pas un libellé.
 */
```

Puis engendrer et vérifier :

```
npm run generer:paliers
npm run verifier:paliers
```

Attendu : `_shared/paliers.ts est à jour.`

- [ ] **Étape 7 : types, lint, tests du cœur**

```
npx tsc -b packages/core
npx oxlint packages/core/src scripts
npm test --workspace @kolek/core
```

Attendu : aucune erreur ; les tests de `@kolek/core` passent. Si un test de
`paliers` énumère les champs attendus, y ajouter `collaborateursInclus`.

- [ ] **Étape 8 : commit**

```bash
git add supabase/migrations/20260902100000_collaborateurs_rattachement.sql \
        supabase/tests/collaborateurs.test.ts \
        packages/core/src/paliers.ts \
        scripts/generer-paliers-edge.mjs \
        supabase/functions/_shared/paliers.ts
git commit -m "feat(db): titulaire_id, et les cinq refus qui le bornent"
```

---

## Tâche 2 — L'abonnement ouvre droit

Réalise la **§8**.

**Fichiers**
- Créer : `supabase/migrations/20260902110000_abonnement_ouvre_droit.sql`
- Modifier : `supabase/tests/collaborateurs.test.ts`

**Interfaces**
- Consomme : `collecteurs.titulaire_id` (tâche 1).
- Produit : `public.abonnement_ouvre_droit(uuid) returns boolean`, appelable par
  `authenticated` ; les policies `clients_insert` et `cartes_insert` resserrées.

- [ ] **Étape 1 : les tests qui échouent**

Ajouter à `supabase/tests/collaborateurs.test.ts`, à la fin du fichier :

```ts
describe('la suspension', () => {
  it('descend du titulaire sur ses collaborateurs', async () => {
    const patron = await creerCollecteur('Patron Susp', `+2250730${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Susp', `+2250731${Date.now() % 100000}`);
    await rendreTitulaire(patron.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();

    await admin.from('collecteurs').update({ abonnement_statut: 'suspendu' }).eq('id', patron.id);

    const { data } = await admin
      .from('collecteurs')
      .select('abonnement_statut, titulaire_id')
      .eq('id', awa.id)
      .single();
    expect(data?.abonnement_statut).toBe('suspendu');
    // Le rattachement reste : un retour à Illimité doit réactiver sans recréer.
    expect(data?.titulaire_id).toBe(patron.id);
  });

  it('descend aussi quand le titulaire quitte Illimité', async () => {
    const patron = await creerCollecteur('Patron Decl', `+2250732${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Decl', `+2250733${Date.now() % 100000}`);
    await rendreTitulaire(patron.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();

    await admin.from('collecteurs').update({ palier: 'pro' }).eq('id', patron.id);

    const { data } = await admin
      .from('collecteurs')
      .select('abonnement_statut')
      .eq('id', awa.id)
      .single();
    expect(data?.abonnement_statut).toBe('suspendu');
  });

  it('interdit d’ajouter un client et d’ouvrir une carte, jamais d’encaisser', async () => {
    const actif = await creerCollecteur('Actif', `+2250734${Date.now() % 100000}`);

    // Un client et une carte, tant que l'abonnement est actif.
    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    expect(
      (
        await actif.client
          .from('clients')
          .insert({ id: clientId, collecteur_id: actif.id, nom: 'Cliente' })
      ).error,
    ).toBeNull();
    expect(
      (
        await actif.client
          .from('cartes')
          .insert({ id: carteId, collecteur_id: actif.id, client_id: clientId, mise: 1000 })
      ).error,
    ).toBeNull();

    await admin.from('collecteurs').update({ abonnement_statut: 'expire' }).eq('id', actif.id);

    // Interdit : un client de plus.
    expect(
      (
        await actif.client
          .from('clients')
          .insert({ id: crypto.randomUUID(), collecteur_id: actif.id, nom: 'Trop tard' })
      ).error,
    ).not.toBeNull();

    // Interdit : une carte de plus.
    expect(
      (
        await actif.client.from('cartes').insert({
          id: crypto.randomUUID(),
          collecteur_id: actif.id,
          client_id: clientId,
          mise: 1000,
        })
      ).error,
    ).not.toBeNull();

    // Autorisé : encaisser sur la carte déjà ouverte. Une carte ouverte est une
    // promesse à une cliente qui paie tous les jours ; la couper au milieu du
    // cycle punit la cliente, pas le collecteur.
    const { error } = await actif.client.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: actif.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
    });
    expect(error).toBeNull();
  });
});
```

- [ ] **Étape 2 : les lancer pour les voir échouer**

```
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/collaborateurs.test.ts -t "suspension"
```

Attendu : ÉCHEC — la suspension ne descend pas, et un collecteur `expire`
insère toujours clients et cartes.

- [ ] **Étape 3 : la migration**

Créer `supabase/migrations/20260902110000_abonnement_ouvre_droit.sql` :

```sql
-- La première application réelle d'un état d'abonnement.
--
-- `abonnement_statut` et `limiteClients` sont purement déclaratifs jusqu'ici :
-- un collecteur `expire` encaisse, inscrit et ouvre exactement comme un actif.
-- La suspension des collaborateurs (§8) exigeait de trancher, et une règle qui
-- ne vaudrait que pour les collaborateurs serait plus petite à écrire et
-- impossible à expliquer. Elle vaut donc pour tous.
--
-- `limiteClients` (20 / 50 / 150) reste hors périmètre : l'appliquer est un
-- autre chantier, avec sa propre question sur le sort du 51ᵉ client déjà
-- inscrit.

create or replace function public.abonnement_ouvre_droit(p_collecteur uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.collecteurs
     where id = p_collecteur
       and abonnement_statut = 'actif'
  );
$fn$;

comment on function public.abonnement_ouvre_droit(uuid) is
  'Vrai si cet abonnement autorise les gestes d''entrée : ajouter un client, ouvrir une carte. '
  'N''a jamais son mot à dire sur l''encaissement d''une carte déjà ouverte.';

-- `security definer` parce qu'elle est appelée depuis une policy sur `clients`
-- et `cartes`, où l'appelant ne peut pas lire `collecteurs` autrement que par sa
-- propre policy — laquelle passerait, mais au prix d'un chemin de plus. Elle ne
-- rend qu'un booléen sur l'identifiant qu'on lui donne : elle ne divulgue rien
-- qu'un appelant ne sache déjà de lui-même.
revoke all on function public.abonnement_ouvre_droit(uuid) from public, anon;
grant execute on function public.abonnement_ouvre_droit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Les deux policies resserrées
-- ---------------------------------------------------------------------------
-- Resserrer, jamais élargir. `collecteur_id = auth.uid()` reste mot pour mot ;
-- une condition s'y ajoute. Aucune lecture ne change de sens.
drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert with check (
    collecteur_id = (select auth.uid())
    and public.abonnement_ouvre_droit((select auth.uid()))
  );

drop policy if exists cartes_insert on public.cartes;
create policy cartes_insert on public.cartes
  for insert with check (
    collecteur_id = (select auth.uid())
    and public.abonnement_ouvre_droit((select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- La suspension descend
-- ---------------------------------------------------------------------------
-- Le rattachement, lui, reste : pour qu'un retour à Illimité réactive l'équipe
-- sans la recréer, et pour que l'administration voie ce qui s'est passé.
create or replace function public.collecteurs_repercuter_suspension()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.abonnement_statut = 'actif' and new.palier = 'illimite' then
    return null;
  end if;

  update public.collecteurs
     set abonnement_statut = 'suspendu'
   where titulaire_id = new.id
     and abonnement_statut = 'actif';

  return null;
end;
$fn$;

revoke all on function public.collecteurs_repercuter_suspension() from public, anon, authenticated;

-- `when` plutôt qu'un test en tête de corps : sans lui, le déclencheur
-- s'exécuterait à chaque changement de nom ou de zone, et le `update` qu'il
-- porte se déclencherait lui-même en cascade sur ses propres lignes.
drop trigger if exists collecteurs_repercuter_suspension on public.collecteurs;
create trigger collecteurs_repercuter_suspension
  after update of abonnement_statut, palier on public.collecteurs
  for each row
  when (old.abonnement_statut is distinct from new.abonnement_statut
        or old.palier is distinct from new.palier)
  execute function public.collecteurs_repercuter_suspension();

-- ------------------------------- Garde-fou --------------------------------

do $garde$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'clients' and policyname = 'clients_insert'
       and with_check like '%abonnement_ouvre_droit%'
  ) then
    raise exception 'GARDE_FOU : clients_insert ne consulte pas l''abonnement.';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'cartes' and policyname = 'cartes_insert'
       and with_check like '%abonnement_ouvre_droit%'
  ) then
    raise exception 'GARDE_FOU : cartes_insert ne consulte pas l''abonnement.';
  end if;

  -- La borne ne doit PAS avoir gagné `mises_insert` : encaisser sur une carte
  -- ouverte reste permis à un abonnement suspendu, et c'est une décision, pas un
  -- oubli.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'mises' and policyname = 'mises_insert'
       and with_check like '%abonnement_ouvre_droit%'
  ) then
    raise exception 'GARDE_FOU : la suspension coupe l''encaissement — voir §8 de la spec.';
  end if;
end;
$garde$;
```

- [ ] **Étape 4 : rejouer et relancer**

```
npm run db:reset
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/collaborateurs.test.ts
```

Attendu : les 12 tests verts.

- [ ] **Étape 5 : vérifier qu'aucune suite existante ne casse**

Cette tâche resserre deux policies sur lesquelles reposent des dizaines de
tests. Les suites qui créent un collecteur par `creerCollecteur` le laissent en
`abonnement_statut = 'actif'` par défaut, donc elles doivent passer inchangées.
Le vérifier plutôt que le supposer :

```
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/isolation.test.ts supabase/tests/rls.test.ts supabase/tests/search-path.test.ts
```

Attendu : tout vert. Si `rls.test.ts` n'existe pas sous ce nom, lancer
`npm run test:db` et ne retenir que les échecs qui ne sont **pas** dus au
runtime Edge Functions local (contrainte globale 9).

- [ ] **Étape 6 : commit**

```bash
git add supabase/migrations/20260902110000_abonnement_ouvre_droit.sql \
        supabase/tests/collaborateurs.test.ts
git commit -m "feat(db): un abonnement suspendu n'ouvre plus de carte, mais encaisse toujours"
```

---

## Tâche 3 — Le chemin de l'argent

Réalise la **§4**, et la moitié minimale de la **§5** qui empêche la clôture de
casser.

**Fichiers**
- Créer : `supabase/migrations/20260902120000_encaisse_par.sql`
- Modifier : `supabase/functions/collecteur-cloturer-carte/index.ts`
- Modifier : `supabase/tests/isolation.test.ts`

**Interfaces**
- Consomme : rien des tâches précédentes.
- Produit : `mises.encaisse_par uuid not null`,
  `retraits.restitue_par uuid not null`, tous deux référençant
  `collecteurs(id)` ; `cash_attendu_du_jour(uuid, date)` calcule désormais sur
  ces colonnes.

- [ ] **Étape 1 : le test d'isolation qui échoue**

Ajouter à `supabase/tests/isolation.test.ts`, dans le `describe` existant (ou
dans un `describe('les colonnes que le client ne décide pas')` neuf) :

```ts
  it('écrase encaisse_par par l’identité de la session', async () => {
    const a = await creerCollecteur('Encaisse A', `+2250740${Date.now() % 100000}`);
    const b = await creerCollecteur('Encaisse B', `+2250741${Date.now() % 100000}`);

    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    await a.client.from('clients').insert({ id: clientId, collecteur_id: a.id, nom: 'Cliente' });
    await a.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: a.id, client_id: clientId, mise: 1000 });

    const miseId = crypto.randomUUID();
    // A tente d'attribuer son encaissement à B. Deux barrières le refusent : le
    // GRANT de colonne, qui ne nomme pas `encaisse_par`, et le `coalesce` du
    // déclencheur, qui préfère `auth.uid()` à tout ce que le client envoie.
    await a.client.from('mises').insert({
      id: miseId,
      collecteur_id: a.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
      encaisse_par: b.id,
    });

    const { data } = await admin.from('mises').select('encaisse_par').eq('id', miseId).maybeSingle();
    // Soit l'insertion a été refusée (GRANT), soit elle a réussi avec la bonne
    // valeur. Ce qui est interdit, c'est qu'elle réussisse avec celle de B.
    if (data) expect(data.encaisse_par).toBe(a.id);
  });
```

Vérifier que `admin` est importé depuis `./harnais` en tête du fichier ; l'ajouter
sinon.

**Les deux autres cas de la §11** vont dans le même fichier, mais dépendent de
`titulaire_id` (tâche 1, déjà appliquée). Ils sont le cœur de la conception :
l'équipe ne perce **pas** l'isolation.

```ts
  it('ne laisse pas un titulaire lire les clients de son collaborateur', async () => {
    const patron = await creerCollecteur('Patron Iso', `+2250742${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Iso', `+2250743${Date.now() % 100000}`);
    await admin
      .from('collecteurs')
      .update({ palier: 'illimite', abonnement_statut: 'actif' })
      .eq('id', patron.id);
    await admin.from('collecteurs').update({ titulaire_id: patron.id }).eq('id', awa.id);
    await awa.client
      .from('clients')
      .insert({ id: crypto.randomUUID(), collecteur_id: awa.id, nom: 'Cliente d’Awa' });

    // La policy n'a pas bougé, et c'est exactement ce qu'on vérifie : le
    // titulaire passe par `equipe_clients()`, jamais par une lecture élargie.
    const { data } = await patron.client.from('clients').select('id, nom');
    expect(data).toEqual([]);
  });

  it('ne laisse pas un collaborateur lire les données d’un autre collaborateur', async () => {
    const patron = await creerCollecteur('Patron Iso2', `+2250744${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Iso2', `+2250745${Date.now() % 100000}`);
    const kofi = await creerCollecteur('Kofi Iso2', `+2250746${Date.now() % 100000}`);
    await admin
      .from('collecteurs')
      .update({ palier: 'illimite', abonnement_statut: 'actif' })
      .eq('id', patron.id);
    await admin.from('collecteurs').update({ titulaire_id: patron.id }).eq('id', awa.id);
    await admin.from('collecteurs').update({ titulaire_id: patron.id }).eq('id', kofi.id);
    await awa.client
      .from('clients')
      .insert({ id: crypto.randomUUID(), collecteur_id: awa.id, nom: 'Cliente d’Awa' });

    // Être frère et sœur d'équipe ne donne aucun droit : seul le titulaire a
    // une porte, et elle ne descend que d'un étage.
    const { data } = await kofi.client.from('clients').select('id');
    expect(data).toEqual([]);

  });
```

Ne pas y ajouter d'assertion sur `equipe_clients()` : la fonction n'existe qu'à
la tâche 4, et son refus d'un collaborateur frère y est déjà couvert par le test
« rend vide pour un identifiant qui existe mais n'est pas de l'équipe ».

- [ ] **Étape 2 : le lancer pour le voir échouer**

```
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/isolation.test.ts -t "encaisse_par"
```

Attendu : ÉCHEC — `column "encaisse_par" of relation "mises" does not exist`.

- [ ] **Étape 3 : la migration**

Créer `supabase/migrations/20260902120000_encaisse_par.sql` :

```sql
-- La caisse suit la main qui a pris l'argent.
--
-- Jusqu'ici l'encaisseur EST le propriétaire, par construction :
-- `mises_avant_insert` refuse la carte d'autrui. Avec une équipe, les deux
-- divergent — le titulaire dépanne Awa, le billet est dans SA poche, et c'est
-- SA caisse du soir qui doit le porter.
--
-- La reprise est donc exacte et non approximative : `encaisse_par` vaut
-- `collecteur_id` sur toute ligne existante, et c'est la vérité, pas une
-- approximation commode.

alter table public.mises    add column encaisse_par uuid references public.collecteurs(id);
alter table public.retraits add column restitue_par uuid references public.collecteurs(id);

comment on column public.mises.encaisse_par is
  'Qui a pris l''argent. Distinct de collecteur_id, qui dit à qui appartient la carte. '
  'Posé par mises_avant_insert, jamais par le client.';
comment on column public.retraits.restitue_par is
  'Qui a sorti l''argent. Distinct de collecteur_id, qui dit à qui appartient la carte.';

-- ---------------------------------------------------------------------------
-- La reprise, et pourquoi elle doit désarmer un déclencheur
-- ---------------------------------------------------------------------------
-- `mises` et `retraits` portent `mises_immuables` / `retraits_immuables`, des
-- déclencheurs BEFORE DELETE OR UPDATE qui lèvent `LIGNE_IMMUABLE` sans
-- exception possible. C'est l'invariant du journal d'audit et il est correct :
-- une table append-only n'a pas d'échappatoire, sinon ce n'en est pas une.
--
-- Une reprise de colonne est le seul cas où il faut le lever, et elle le fait à
-- découvert. La migration entière tourne dans une transaction : si quoi que ce
-- soit échoue ci-dessous, le `disable` est annulé avec le reste — le déclencheur
-- ne peut pas rester désarmé.
alter table public.mises    disable trigger mises_immuables;
alter table public.retraits disable trigger retraits_immuables;

update public.mises    set encaisse_par = collecteur_id where encaisse_par is null;
update public.retraits set restitue_par = collecteur_id where restitue_par is null;

alter table public.mises    enable trigger mises_immuables;
alter table public.retraits enable trigger retraits_immuables;

alter table public.mises    alter column encaisse_par set not null;
alter table public.retraits alter column restitue_par set not null;

-- `(qui, quand)` et non `(qui)` seul : toutes les lectures de caisse filtrent
-- sur une journée.
create index mises_encaisse_par_idx    on public.mises    (encaisse_par, encaisse_le);
create index retraits_restitue_par_idx on public.retraits (restitue_par, effectue_le);

-- Les deux colonnes sont lisibles — le collecteur doit pouvoir distinguer sa
-- propre mise de celle qu'on a encaissée pour lui — et n'entrent dans aucun
-- GRANT d'écriture. `mises` reste en
-- `grant insert (id, collecteur_id, carte_id, montant, encaisse_le)`.
grant select (encaisse_par) on public.mises    to authenticated;
grant select (restitue_par) on public.retraits to authenticated;

-- ---------------------------------------------------------------------------
-- Qui pose encaisse_par
-- ---------------------------------------------------------------------------
-- `set search_path = public, pg_temp` et non le `public` seul de la définition
-- source : `20260830131000_search_path_pg_temp_en_dernier.sql` a corrigé ce
-- search_path par un `alter function`, qui ne touche pas au corps. Réécrire la
-- fonction sans reporter le correctif la ramènerait à la forme faible.
-- `search-path.test.ts` le détecte.
create or replace function public.mises_avant_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare c public.cartes%rowtype;
begin
  -- Un rejeu de la file de synchro doit toujours se présenter comme un doublon,
  -- quel que soit l'état de la carte depuis. Ce test reste en tête : un rejeu
  -- qui sortirait en DATE_INVALIDE partirait en rejet de synchro, et sa
  -- ressaisie par un humain — avec un nouvel identifiant — serait un double
  -- comptage. C'est précisément ce que l'antériorité de ce test empêche.
  if exists (select 1 from public.mises where id = new.id) then
    raise exception 'DOUBLON' using errcode = '23505';
  end if;

  if new.encaisse_le > now() + interval '1 day'
     or new.encaisse_le < now() - interval '90 days' then
    raise exception 'DATE_INVALIDE';
  end if;

  -- Verrou de ligne : deux mises concurrentes sur la même carte ne peuvent
  -- pas lire toutes les deux mises_encaissees = 0 et créer deux commissions.
  select * into c from public.cartes where id = new.carte_id for update;

  if not found then
    raise exception 'CARTE_INTROUVABLE';
  end if;

  -- Même message que ci-dessus, et c'est voulu : ne rien dire d'une carte que
  -- l'appelant n'a pas le droit de lire.
  --
  -- Sous clé de service `auth.uid()` est nul et cette garde ne s'exécute pas.
  -- C'est déjà vrai aujourd'hui pour tout chemin de service ;
  -- `collecteur-encaisser-pour` est la première fonction à en dépendre pour de
  -- bon, et porte donc la vérification d'appartenance elle-même.
  if auth.uid() is not null and c.collecteur_id <> auth.uid() then
    raise exception 'CARTE_INTROUVABLE';
  end if;

  if c.statut <> 'active' then
    raise exception 'CARTE_CLOTUREE';
  end if;
  if c.mises_encaissees >= 31 then
    raise exception 'CYCLE_COMPLET';
  end if;
  if new.montant <> c.mise then
    raise exception 'MONTANT_INVALIDE';
  end if;

  -- Ces trois champs sont décidés par le serveur, jamais par le client.
  new.est_commission := (c.mises_encaissees = 0);
  new.collecteur_id  := c.collecteur_id;

  -- La bascule qui couvre les deux chemins :
  --   * ordinaire — `auth.uid()` est l'encaisseur, il gagne, et rien de ce que
  --     le client envoie n'est lu ;
  --   * équipe — l'Edge Function écrit sous clé de service, `auth.uid()` est
  --     nul, et la valeur qu'elle a posée est retenue ;
  --   * repli — un chemin de service qui ne pose rien retombe sur le
  --     propriétaire de la carte, c'est-à-dire sur le comportement d'hier.
  new.encaisse_par := coalesce(auth.uid(), new.encaisse_par, c.collecteur_id);

  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- La caisse compte la main, plus le propriétaire
-- ---------------------------------------------------------------------------
create or replace function public.cash_attendu_du_jour(p_collecteur uuid, p_date date)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select (
    coalesce((
      select sum(montant)
        from public.mises
       -- `encaisse_par` et non `collecteur_id` : c'est ce qui est passé par
       -- cette main-là qui doit se retrouver dans cette sacoche-là.
       where encaisse_par = p_collecteur
         -- `at time zone 'UTC'` explicite, et non `encaisse_le::date` : ce
         -- dernier découpe la journée selon le fuseau de la session. Abidjan
         -- est à UTC+0 toute l'année, donc les deux coïncident aujourd'hui —
         -- par géographie, pas par intention. Une Edge Function lancée avec un
         -- autre `TimeZone` déplacerait la frontière du jour, et donc l'écart
         -- de caisse.
         and (encaisse_le at time zone 'UTC')::date = p_date
    ), 0)
    -
    -- Ce qui est sorti de la sacoche. `montant_restitue` et non `commission` :
    -- la commission reste chez le collecteur, et elle est déjà comptée du côté
    -- des mises — c'est la première mise du cycle. La soustraire ici la
    -- retirerait deux fois.
    coalesce((
      select sum(montant_restitue)
        from public.retraits
       where restitue_par = p_collecteur
         and (effectue_le at time zone 'UTC')::date = p_date
    ), 0)
  )::integer;
$fn$;

revoke all on function public.cash_attendu_du_jour(uuid, date) from public, anon, authenticated;

create or replace function public.caisses_rafraichir_apres_mise()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  update public.caisses_jour
     set cash_attendu = public.cash_attendu_du_jour(
           new.encaisse_par, (new.encaisse_le at time zone 'UTC')::date)
   where collecteur_id = new.encaisse_par
     and date = (new.encaisse_le at time zone 'UTC')::date;
  return null;
end;
$fn$;

revoke all on function public.caisses_rafraichir_apres_mise() from public, anon, authenticated;

create or replace function public.caisses_rafraichir_apres_retrait()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  update public.caisses_jour
     set cash_attendu = public.cash_attendu_du_jour(
           new.restitue_par, (new.effectue_le at time zone 'UTC')::date)
   where collecteur_id = new.restitue_par
     and date = (new.effectue_le at time zone 'UTC')::date;
  return null;
end;
$fn$;

revoke all on function public.caisses_rafraichir_apres_retrait() from public, anon, authenticated;

-- `caisses_jour` reste en `auth.uid()` : chacun déclare sa propre caisse. Le
-- titulaire ne déclare pas le cash d'Awa, puisqu'il ne l'a pas en main.

-- ------------------------------- Garde-fou --------------------------------

do $garde$
begin
  if has_column_privilege('authenticated', 'public.mises', 'encaisse_par', 'insert') then
    raise exception 'GARDE_FOU : le client peut forger encaisse_par.';
  end if;

  if position('encaisse_par' in
       pg_get_functiondef('public.cash_attendu_du_jour(uuid, date)'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : la caisse compte encore le propriétaire, pas la main.';
  end if;

  if exists (
    select 1 from pg_trigger
     where tgrelid = 'public.mises'::regclass and tgname = 'mises_immuables' and tgenabled = 'D'
  ) then
    raise exception 'GARDE_FOU : mises_immuables est resté désarmé.';
  end if;

  if exists (
    select 1 from pg_trigger
     where tgrelid = 'public.retraits'::regclass and tgname = 'retraits_immuables' and tgenabled = 'D'
  ) then
    raise exception 'GARDE_FOU : retraits_immuables est resté désarmé.';
  end if;
end;
$garde$;
```

- [ ] **Étape 4 : la clôture doit poser `restitue_par`**

`retraits.restitue_par` est `not null` et aucun défaut ne le remplit :
`collecteur-cloturer-carte` échouerait à chaque appel. Dans
`supabase/functions/collecteur-cloturer-carte/index.ts`, remplacer :

```ts
  const { error: erreurRetrait } = await clientService.from('retraits').insert({
    collecteur_id: collecteurId,
    carte_id: carte.id,
```

par :

```ts
  const { error: erreurRetrait } = await clientService.from('retraits').insert({
    collecteur_id: collecteurId,
    // Qui sort l'argent. Identique à `collecteur_id` tant que la carte lue est
    // la sienne — ce que RLS garantit ici. La tâche « clôturer pour un
    // coéquipier » fera diverger les deux.
    restitue_par: collecteurId,
    carte_id: carte.id,
```

- [ ] **Étape 5 : rejouer et vérifier**

```
npm run db:reset
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/isolation.test.ts supabase/tests/search-path.test.ts supabase/tests/collaborateurs.test.ts
```

Attendu : tout vert. `search-path.test.ts` en particulier : c'est lui qui
attrape un `create or replace` qui aurait oublié `pg_temp`.

Vérifier aussi la reprise directement, puisqu'elle ne peut se voir qu'une fois :

```
docker exec supabase_db_Kolek psql -U postgres -d postgres -tAc "select count(*) filter (where encaisse_par <> collecteur_id) from public.mises;"
```

Attendu : `0`.

- [ ] **Étape 6 : commit**

```bash
git add supabase/migrations/20260902120000_encaisse_par.sql \
        supabase/functions/collecteur-cloturer-carte/index.ts \
        supabase/tests/isolation.test.ts
git commit -m "feat(db): la caisse suit la main qui a pris l'argent"
```

---

## Tâche 4 — La vue d'équipe

Réalise la **§3**.

**Fichiers**
- Créer : `supabase/migrations/20260902130000_equipe_vue.sql`
- Modifier : `supabase/tests/collaborateurs.test.ts`

**Interfaces**
- Consomme : `titulaire_id` (tâche 1), `encaisse_par` / `restitue_par` (tâche 3).
- Produit :
  - `public.equipe_vue() returns jsonb` — **sans paramètre**, exécutable par
    `authenticated`. Rend un tableau JSON d'objets
    `{ id, nom, telephone, clients, cartes_actives, encours, commissions,
    cash_attendu, cash_declare, ecart, derniere_declaration }`,
    ou `[]`.
  - `public.equipe_clients(p_collaborateur uuid) returns jsonb` — rend un
    tableau d'objets
    `{ id, nom, telephone, cartes: [{ id, mise, mises_encaissees, solde_restituable }] }`,
    ou `[]`.

- [ ] **Étape 1 : les tests qui échouent**

Ajouter à `supabase/tests/collaborateurs.test.ts` :

```ts
describe('la vue d’équipe', () => {
  it('rend un tableau vide à qui n’a pas d’équipe', async () => {
    const seul = await creerCollecteur('Sans équipe', `+2250750${Date.now() % 100000}`);
    const { data, error } = await seul.client.rpc('equipe_vue');
    expect(error).toBeNull();
    // Ne pas avoir d'équipe est un état normal, pas une panne.
    expect(data).toEqual([]);
  });

  it('ne rend que son équipe à un titulaire', async () => {
    const patron = await creerCollecteur('Patron Vue', `+2250751${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Vue', `+2250752${Date.now() % 100000}`);
    const voisin = await creerCollecteur('Voisin Vue', `+2250753${Date.now() % 100000}`);
    const sonAwa = await creerCollecteur('Awa Voisine', `+2250754${Date.now() % 100000}`);
    await rendreTitulaire(patron.id);
    await rendreTitulaire(voisin.id);
    await rattacher(awa.id, patron.id);
    await rattacher(sonAwa.id, voisin.id);

    const { data, error } = await patron.client.rpc('equipe_vue');
    expect(error).toBeNull();
    const equipe = data as Array<{ id: string; nom: string }>;
    expect(equipe.map((m) => m.id)).toEqual([awa.id]);
  });

  it('est refusée à anon', async () => {
    const { error } = await anonyme.rpc('equipe_vue');
    expect(error).not.toBeNull();
  });
});

describe('les clients d’un coéquipier', () => {
  it('rend vide pour un identifiant qui existe mais n’est pas de l’équipe', async () => {
    const patron = await creerCollecteur('Patron Cli', `+2250760${Date.now() % 100000}`);
    const etranger = await creerCollecteur('Étranger', `+2250761${Date.now() % 100000}`);
    await rendreTitulaire(patron.id);
    await etranger.client.from('clients').insert({
      id: crypto.randomUUID(),
      collecteur_id: etranger.id,
      nom: 'Cliente de l’étranger',
    });

    // Le cas qui compte : l'identifiant existe. Une erreur dirait qu'il existe ;
    // un tableau vide ne dit rien.
    const { data, error } = await patron.client.rpc('equipe_clients', {
      p_collaborateur: etranger.id,
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('rend les clients d’un vrai collaborateur, et ceux de l’appelant', async () => {
    const patron = await creerCollecteur('Patron Cli2', `+2250762${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Cli2', `+2250763${Date.now() % 100000}`);
    await rendreTitulaire(patron.id);
    await rattacher(awa.id, patron.id);

    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    await awa.client.from('clients').insert({ id: clientId, collecteur_id: awa.id, nom: 'Aya' });
    await awa.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: awa.id, client_id: clientId, mise: 2000 });

    const { data, error } = await patron.client.rpc('equipe_clients', { p_collaborateur: awa.id });
    expect(error).toBeNull();
    const clients = data as Array<{ id: string; nom: string; cartes: Array<{ mise: number }> }>;
    expect(clients).toHaveLength(1);
    expect(clients[0]?.nom).toBe('Aya');
    expect(clients[0]?.cartes[0]?.mise).toBe(2000);

    // L'appelant peut aussi se demander lui-même : l'écran d'encaissement du
    // titulaire s'en sert pour sa propre tournée sans second chemin de lecture.
    const { data: siens } = await patron.client.rpc('equipe_clients', {
      p_collaborateur: patron.id,
    });
    expect(siens).toEqual([]);
  });

  it('est refusée à anon', async () => {
    const { error } = await anonyme.rpc('equipe_clients', {
      p_collaborateur: '00000000-0000-4000-8000-000000000000',
    });
    expect(error).not.toBeNull();
  });
});
```

Ajouter `anonyme` à l'import du harnais en tête de fichier.

- [ ] **Étape 2 : les lancer pour les voir échouer**

```
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/collaborateurs.test.ts -t "équipe"
```

Attendu : ÉCHEC — `Could not find the function public.equipe_vue`.

- [ ] **Étape 3 : la migration**

Créer `supabase/migrations/20260902130000_equipe_vue.sql` :

```sql
-- Les deux portes par lesquelles un titulaire voit son équipe.
--
-- Aucune policy n'est élargie pour cela, et c'est la décision structurante de
-- cette conception : `collecteur_id = auth.uid()` reste vrai mot pour mot, donc
-- les 35 sites de lecture de l'application collecteur gardent leur sens — quand
-- l'écran somme les mises du jour, il somme toujours LES SIENNES.

-- ---------------------------------------------------------------------------
-- equipe_vue() — sans paramètre, et c'est la propriété de sûreté
-- ---------------------------------------------------------------------------
-- Elle lit `auth.uid()` elle-même : il n'existe aucune manière de demander
-- l'équipe de quelqu'un d'autre. Même forme qu'`admin_vue_globale`, qui fait
-- déjà exactement cela pour l'administration.
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
  mises_par as (
    select m.collecteur_id,
           coalesce(sum(m.montant) filter (where not m.est_commission), 0) as du_aux_clients,
           coalesce(sum(m.montant) filter (where m.est_commission), 0)     as commissions
      from public.mises m
      join membres b on b.id = m.collecteur_id
     group by m.collecteur_id
  ),
  retraits_par as (
    select r.collecteur_id, coalesce(sum(r.montant_restitue), 0) as restitutions
      from public.retraits r
      join membres b on b.id = r.collecteur_id
     group by r.collecteur_id
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
  -- La caisse du jour se lit sur `caisses_jour`, pas sur `cash_attendu_du_jour` :
  -- la ligne du jour n'existe qu'une fois la caisse déclarée, et son absence est
  -- une information — « il n'a pas encore compté ».
  caisse_du_jour as (
    select cj.collecteur_id, cj.cash_attendu, cj.cash_declare, cj.ecart, cj.date
      from public.caisses_jour cj
      join membres b on b.id = cj.collecteur_id
     where cj.date = (now() at time zone 'UTC')::date
  )
  select coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'id',                    b.id,
         'nom',                   b.nom,
         'telephone',             b.telephone,
         'clients',               coalesce(cl.clients, 0),
         'cartes_actives',        coalesce(ca.cartes_actives, 0),
         'encours',               coalesce(m.du_aux_clients, 0) - coalesce(r.restitutions, 0),
         -- Les commissions du collaborateur reviennent au titulaire : c'est
         -- pour cela que la ligne figure ici, et qu'elle a disparu du Bilan du
         -- collaborateur.
         'commissions',           coalesce(m.commissions, 0),
         'cash_attendu',          k.cash_attendu,
         'cash_declare',          k.cash_declare,
         'ecart',                 k.ecart,
         'derniere_declaration',  k.date
       ) order by b.nom)
       from membres b
       left join clients_par    cl on cl.collecteur_id = b.id
       left join cartes_par     ca on ca.collecteur_id = b.id
       left join mises_par      m  on m.collecteur_id  = b.id
       left join retraits_par   r  on r.collecteur_id  = b.id
       left join caisse_du_jour k  on k.collecteur_id  = b.id),
    '[]'::jsonb);
$fn$;

comment on function public.equipe_vue() is
  'Les collaborateurs de l''appelant, avec leurs totaux et leur caisse du jour. '
  'Sans paramètre : l''identité vient de auth.uid(), donc on ne peut pas demander l''équipe d''autrui. '
  'Tableau vide si l''appelant n''est pas titulaire — ne pas avoir d''équipe est un état normal.';

revoke all on function public.equipe_vue() from public, anon;
grant execute on function public.equipe_vue() to authenticated;

-- ---------------------------------------------------------------------------
-- equipe_clients(uuid) — elle prend un paramètre, donc elle le vérifie
-- ---------------------------------------------------------------------------
create or replace function public.equipe_clients(p_collaborateur uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'id',        cl.id,
         'nom',       cl.nom,
         'telephone', cl.telephone,
         'cartes',    coalesce((
           select jsonb_agg(
                    jsonb_build_object(
                      'id',                ca.id,
                      'mise',              ca.mise,
                      'mises_encaissees',  ca.mises_encaissees,
                      -- La première mise du cycle est la commission : elle ne
                      -- revient pas au client. Même règle que `soldeRestituable`
                      -- dans packages/core.
                      'solde_restituable', greatest(ca.mises_encaissees - 1, 0)::bigint * ca.mise
                    ) order by ca.ouverte_le)
             from public.cartes ca
            where ca.client_id = cl.id and ca.statut = 'active'), '[]'::jsonb)
       ) order by cl.nom)
       from public.clients cl
      where cl.collecteur_id = p_collaborateur
        -- La vérification du paramètre, et la seule. Un identifiant hors équipe
        -- rend un tableau vide, jamais une erreur : une erreur dirait si
        -- l'identifiant existe.
        and exists (
          select 1 from public.collecteurs c
           where c.id = p_collaborateur
             and (c.titulaire_id = (select auth.uid()) or c.id = (select auth.uid()))
        )),
    '[]'::jsonb);
$fn$;

comment on function public.equipe_clients(uuid) is
  'Les clients d''un collaborateur de l''appelant — ou de l''appelant lui-même — avec leurs cartes actives. '
  'Tableau vide pour tout autre identifiant, y compris un identifiant qui existe : ne rien dire de ce qu''on n''a pas le droit de voir.';

revoke all on function public.equipe_clients(uuid) from public, anon;
grant execute on function public.equipe_clients(uuid) to authenticated;

-- ------------------------------- Garde-fou --------------------------------
--
-- Un `revoke` oublié sur une `security definer` est exactement le défaut qui ne
-- se voit pas. Même forme que dans `20260823090000` et `20260827090000`.
do $garde$
begin
  if has_function_privilege('anon', 'public.equipe_vue()', 'execute') then
    raise exception 'GARDE_FOU : equipe_vue est exécutable par anon.';
  end if;
  if has_function_privilege('anon', 'public.equipe_clients(uuid)', 'execute') then
    raise exception 'GARDE_FOU : equipe_clients est exécutable par anon.';
  end if;
  if not has_function_privilege('authenticated', 'public.equipe_vue()', 'execute') then
    raise exception 'GARDE_FOU : equipe_vue n''est exécutable par personne.';
  end if;
  if not has_function_privilege('authenticated', 'public.equipe_clients(uuid)', 'execute') then
    raise exception 'GARDE_FOU : equipe_clients n''est exécutable par personne.';
  end if;
end;
$garde$;
```

- [ ] **Étape 4 : rejouer et relancer**

```
npm run db:reset
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/collaborateurs.test.ts supabase/tests/search-path.test.ts
```

Attendu : tout vert.

- [ ] **Étape 5 : commit**

```bash
git add supabase/migrations/20260902130000_equipe_vue.sql supabase/tests/collaborateurs.test.ts
git commit -m "feat(db): deux portes pour voir son equipe, aucune policy elargie"
```

---

## Tâche 5 — Le chiffre d'affaires

Réalise la **§9**.

**Fichiers**
- Créer : `supabase/migrations/20260902140000_mrr_hors_collaborateurs.sql`
- Modifier : `supabase/tests/collaborateurs.test.ts`

**Interfaces**
- Consomme : `titulaire_id` (tâche 1).
- Produit : `admin_vue_globale()` dont le bloc `par_palier` ne compte en `actifs`
  que les collecteurs sans titulaire ; `total` et le bloc `abonnements` comptent
  tout le monde.

- [ ] **Étape 1 : le test qui échoue**

Ajouter à `supabase/tests/collaborateurs.test.ts` :

```ts
describe('le chiffre d’affaires', () => {
  it('compte un abonnement pour quatre comptes actifs', async () => {
    const patron = await creerCollecteur('Patron MRR', `+2250770${Date.now() % 100000}`);
    await rendreTitulaire(patron.id);

    const avant = (await admin.rpc('admin_vue_globale')).data as {
      par_palier: Array<{ palier: string; total: number; actifs: number }>;
      abonnements: { collecteurs_total: number };
    };
    const illimiteAvant = avant.par_palier.find((p) => p.palier === 'illimite');
    const actifsAvant = illimiteAvant?.actifs ?? 0;
    const totalAvant = illimiteAvant?.total ?? 0;

    for (let i = 0; i < 3; i += 1) {
      const membre = await creerCollecteur(`MRR ${i}`, `+22507${80 + i}${Date.now() % 10000}`);
      await admin.from('collecteurs').update({ palier: 'illimite' }).eq('id', membre.id);
      expect((await rattacher(membre.id, patron.id)).error).toBeNull();
    }

    const apres = (await admin.rpc('admin_vue_globale')).data as {
      par_palier: Array<{ palier: string; total: number; actifs: number }>;
    };
    const illimite = apres.par_palier.find((p) => p.palier === 'illimite');

    // Un titulaire et ses trois collaborateurs : UN abonnement facturé…
    expect(illimite?.actifs).toBe(actifsAvant + 1);
    // …mais QUATRE comptes qui existent. Confondre les deux est justement
    // l'erreur qu'on corrige.
    expect(illimite?.total).toBe(totalAvant + 4);
  });
});
```

- [ ] **Étape 2 : le lancer pour le voir échouer**

```
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/collaborateurs.test.ts -t "chiffre"
```

Attendu : ÉCHEC — `expected 4 to be 1` sur `actifs`.

- [ ] **Étape 3 : la migration**

Créer `supabase/migrations/20260902140000_mrr_hors_collaborateurs.sql`. La
fonction est longue : la reprendre **intégralement** depuis sa dernière
définition, `20260901090000_mise_sans_plafond.sql`, en n'y changeant que le bloc
`par_palier` ci-dessous. Ne pas la réécrire de mémoire — la copier.

```sql
-- Le chiffre d'affaires ne compte pas les collaborateurs.
--
-- Sans cette correction, un titulaire et ses trois collaborateurs comptent
-- quatre abonnements Illimité, et le MRR annoncé est multiplié par quatre. Le
-- MRR se calcule dans l'Edge Function `admin-vue-globale`, qui multiplie
-- `actifs` par le prix de `@kolek/core` : c'est donc `actifs` qu'il faut
-- corriger, pas une somme de prix — il n'y en a aucune en base.
--
-- Les compteurs de population, eux, comptent tout le monde : `total` ici, et le
-- bloc `abonnements` plus bas. Ce sont des comptes qui existent, et les
-- confondre avec des abonnements est exactement l'erreur qu'on corrige.
--
-- `set search_path to 'public', 'pg_temp'` : reporté depuis la définition
-- source, faute de quoi `20260830131000` serait annulée en silence.

CREATE OR REPLACE FUNCTION public.admin_vue_globale()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- […] les six CTE reprises MOT POUR MOT depuis
  -- 20260901090000_mise_sans_plafond.sql : mises_par_collecteur,
  -- retraits_par_collecteur, clients_par_collecteur, cartes_par_collecteur,
  -- par_collecteur, par_carte, mouvements.
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
                 -- son titulaire paie pour lui, et son abonnement est déjà compté
                 -- sur la ligne du titulaire.
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

    -- […] le reste du jsonb_build_object repris MOT POUR MOT : 'abonnements',
    -- 'totaux', 'zones', 'collecteurs', 'cartes', 'mouvements'. Le bloc
    -- 'abonnements' ne gagne AUCUN filtre : `collecteurs_actifs`, `suspendus` et
    -- `expires` comptent des personnes, pas des abonnements.
  )
$function$;
```

**Une seule modification fonctionnelle** : `and titulaire_id is null` ajouté aux
deux `filter` du bloc `par_palier`. Tout le reste est une copie.

Ajouter en fin de fichier :

```sql
do $garde$
declare corps text := pg_get_functiondef('public.admin_vue_globale()'::regprocedure);
begin
  if position('titulaire_id is null' in corps) = 0 then
    raise exception 'GARDE_FOU : le MRR compte encore les collaborateurs.';
  end if;
  -- Deux occurrences attendues : `actifs` et `offerts`. Une seule voudrait dire
  -- qu'une remise de collaborateur est déduite d'un abonnement qui n'existe pas.
  if (length(corps) - length(replace(corps, 'titulaire_id is null', ''))) / 20 < 2 then
    raise exception 'GARDE_FOU : offerts ne suit pas le même filtre qu''actifs.';
  end if;
end;
$garde$;
```

- [ ] **Étape 4 : rejouer et relancer**

```
npm run db:reset
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/collaborateurs.test.ts supabase/tests/search-path.test.ts
```

Attendu : tout vert.

Vérifier aussi que la copie n'a rien perdu :

```
docker exec supabase_db_Kolek psql -U postgres -d postgres -tAc "select jsonb_object_keys(public.admin_vue_globale());"
```

Attendu : les mêmes clés qu'avant la migration — `genere_le`, `par_palier`,
`abonnements`, `totaux`, `zones`, `collecteurs`, `cartes`, `mouvements`. Une clé
manquante signale une CTE oubliée à la copie.

- [ ] **Étape 5 : commit**

```bash
git add supabase/migrations/20260902140000_mrr_hors_collaborateurs.sql \
        supabase/tests/collaborateurs.test.ts
git commit -m "fix(db): le MRR ne facture pas quatre fois une equipe de quatre"
```

---

## Tâche 6 — Créer un collaborateur

Réalise la **§7**.

**Fichiers**
- Créer : `supabase/functions/collecteur-creer-collaborateur/index.ts`
- Créer : `supabase/tests/collecteur-creer-collaborateur.test.ts`

**Interfaces**
- Consomme : `titulaire_id` et son déclencheur (tâche 1) ;
  `COLLABORATEURS_MAX` via `_shared/paliers.ts` (`tarifParCle('illimite').collaborateursInclus`).
- Produit : `POST /functions/v1/collecteur-creer-collaborateur`
  - corps : `{ email, motDePasse, nom, telephone, zone? }`
  - `201 { collaborateurId, email, nom, avertissement? }`
  - `401 { erreur: 'JETON_ABSENT' }`
  - `403 { erreur: 'ACCES_RESERVE' }`
  - `409 { erreur: 'EMAIL_DEJA_PRIS' }`
  - `409 { erreur: 'RATTACHEMENT_REFUSE', collaborateurId, cause }`
  - `429 { erreur: 'TROP_DE_TENTATIVES' }`

- [ ] **Étape 1 : le test qui échoue**

Créer `supabase/tests/collecteur-creer-collaborateur.test.ts`, sur le patron des
suites `super-admin-*` :

```ts
import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer } from './harnais';

afterAll(nettoyer);

const BASE = `${process.env.SUPABASE_URL}/functions/v1/collecteur-creer-collaborateur`;

async function appeler(jeton: string | null, corps: unknown): Promise<Response> {
  return fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    body: JSON.stringify(corps),
  });
}

function saisie(suffixe: string) {
  return {
    email: `collab-${suffixe}@kolek.test`,
    motDePasse: 'Kb7-quai-lune-2026',
    nom: 'Awa Konan',
    telephone: `+22507${suffixe.slice(0, 8)}`,
    zone: 'Adjamé',
  };
}

async function jetonDe(collecteur: { client: { auth: { getSession: () => Promise<unknown> } } }) {
  const { data } = (await collecteur.client.auth.getSession()) as {
    data: { session: { access_token: string } | null };
  };
  return data.session!.access_token;
}

describe('collecteur-creer-collaborateur', () => {
  it('refuse sans jeton', async () => {
    const reponse = await appeler(null, saisie(`${Date.now()}`));
    expect(reponse.status).toBe(401);
    expect((await reponse.json()).erreur).toBe('JETON_ABSENT');
  });

  it('refuse un collecteur qui n’est pas Illimité actif', async () => {
    const pro = await creerCollecteur('Pro', `+2250790${Date.now() % 100000}`);
    await admin.from('collecteurs').update({ palier: 'pro' }).eq('id', pro.id);

    const reponse = await appeler(await jetonDe(pro), saisie(`${Date.now()}`));
    expect(reponse.status).toBe(403);
    expect((await reponse.json()).erreur).toBe('ACCES_RESERVE');
  });

  it('crée et rattache un collaborateur', async () => {
    const patron = await creerCollecteur('Patron EF', `+2250791${Date.now() % 100000}`);
    await admin
      .from('collecteurs')
      .update({ palier: 'illimite', abonnement_statut: 'actif' })
      .eq('id', patron.id);

    const reponse = await appeler(await jetonDe(patron), saisie(`${Date.now()}`));
    expect(reponse.status).toBe(201);
    const corps = await reponse.json();
    expect(corps.collaborateurId).toBeTruthy();

    const { data } = await admin
      .from('collecteurs')
      .select('titulaire_id, nom, zone')
      .eq('id', corps.collaborateurId)
      .single();
    expect(data?.titulaire_id).toBe(patron.id);
    expect(data?.zone).toBe('Adjamé');

    await admin.auth.admin.deleteUser(corps.collaborateurId);
  });

  it('refuse le quatrième', async () => {
    const patron = await creerCollecteur('Patron Plein', `+2250792${Date.now() % 100000}`);
    await admin
      .from('collecteurs')
      .update({ palier: 'illimite', abonnement_statut: 'actif' })
      .eq('id', patron.id);
    const jeton = await jetonDe(patron);

    const crees: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await appeler(jeton, saisie(`${Date.now()}${i}`));
      expect(r.status).toBe(201);
      crees.push((await r.json()).collaborateurId);
    }

    const quatrieme = await appeler(jeton, saisie(`${Date.now()}x`));
    expect(quatrieme.status).toBe(403);
    expect((await quatrieme.json()).erreur).toBe('ACCES_RESERVE');

    for (const id of crees) await admin.auth.admin.deleteUser(id);
  });
});
```

- [ ] **Étape 2 : le lancer**

```
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/collecteur-creer-collaborateur.test.ts
```

Attendu : ÉCHEC. **Sur cette machine, l'échec sera HTTP 500 pour toutes les
requêtes** — le runtime Edge Functions local ne sert pas (contrainte globale 9).
C'est attendu : écrire la fonction, commettre le test, et **rapporter cette
suite comme NON VÉRIFIÉE**.

- [ ] **Étape 3 : la fonction**

Créer `supabase/functions/collecteur-creer-collaborateur/index.ts` :

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_COLLECTEUR, entetesCors, listerOrigines } from '../_shared/cors.ts';
import { empreinteRequete } from '../_shared/debit.ts';
import { verifierFuite } from '../_shared/hibp.ts';
import { tarifParCle } from '../_shared/paliers.ts';
import { validerCollecteur } from '../_shared/valider-collecteur.ts';

/**
 * Créer un collaborateur, depuis l'application du titulaire.
 *
 * ## Pourquoi pas `admin-creer-collecteur`
 *
 * Parce que le geste n'est pas le même. `admin-creer-collecteur` est une porte
 * de GTCS ; celle-ci est une fonction du produit, exercée en autonomie par un
 * client payant, et elle porte donc un contrôle que l'autre n'a pas : le palier
 * de l'appelant, et le compte de son équipe.
 *
 * ## L'ordre, et sa conséquence assumée
 *
 * Le compte naît (étape 5) avant d'être rattaché (étape 6). Si le rattachement
 * échoue, le compte existe, non rattaché. La fonction rend alors
 * `409 RATTACHEMENT_REFUSE` **en nommant le compte créé**, plutôt qu'une panne
 * muette : un `auth.users` orphelin qu'on ne sait pas nommer est pire qu'un
 * compte à rattacher à la main.
 *
 * Le déclencheur `collecteurs_valider_rattachement` est la dernière barrière. Si
 * cette fonction s'est trompée sur le palier ou sur le compte de l'équipe, la
 * base refuse ici, et le compte reste un collecteur seul plutôt qu'un
 * rattachement invalide.
 */

const ORIGINES_AUTORISEES = listerOrigines(
  Deno.env.get('ORIGINES_COLLECTEUR'),
  ORIGINES_COLLECTEUR,
);

/** Trois créations par heure. Le plafond de l'équipe étant de trois, c'est large
    pour un usage légitime et étroit pour un abus. */
const PLAFOND = 3;
const FENETRE_SECONDES = 3600;

function entetesPour(requete: Request): Record<string, string> {
  return entetesCors({
    origine: requete.headers.get('Origin'),
    entetesDemandes: requete.headers.get('Access-Control-Request-Headers'),
    origines: ORIGINES_AUTORISEES,
  });
}

function reponse(corps: unknown, statut: number, requete: Request): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: entetesPour(requete) });
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesPour(requete) });
  }
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }

  const autorisation = requete.headers.get('Authorization');
  if (!autorisation?.startsWith('Bearer ')) {
    return reponse({ erreur: 'JETON_ABSENT' }, 401, requete);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const cleAnon = Deno.env.get('SUPABASE_ANON_KEY');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cleAnon || !cleService) {
    console.error('Configuration incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  // --- 1. L'identité vient du jeton, jamais du corps ---

  const clientAppelant = createClient(url, cleAnon, {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: utilisateur, error: erreurUtilisateur } = await clientAppelant.auth.getUser();
  if (erreurUtilisateur || !utilisateur.user) {
    return reponse({ erreur: 'ACCES_RESERVE' }, 403, requete);
  }
  const titulaireId = utilisateur.user.id;

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- 2. Le portillon : palier, statut, absence de titulaire, place restante ---

  const { data: appelant, error: erreurAppelant } = await clientService
    .from('collecteurs')
    .select('palier, abonnement_statut, titulaire_id')
    .eq('id', titulaireId)
    .maybeSingle();

  if (erreurAppelant) {
    console.error('lecture appelant :', erreurAppelant.message);
    return reponse({ erreur: 'VERIFICATION_IMPOSSIBLE' }, 403, requete);
  }

  const { count: dejaRattaches, error: erreurCompte } = await clientService
    .from('collecteurs')
    .select('id', { count: 'exact', head: true })
    .eq('titulaire_id', titulaireId);

  if (erreurCompte) {
    console.error('compte équipe :', erreurCompte.message);
    return reponse({ erreur: 'VERIFICATION_IMPOSSIBLE' }, 403, requete);
  }

  const place = tarifParCle('illimite').collaborateursInclus;
  const autorise =
    appelant?.palier === 'illimite' &&
    appelant?.abonnement_statut === 'actif' &&
    appelant?.titulaire_id === null &&
    (dejaRattaches ?? 0) < place;

  // Une seule réponse pour les quatre refus. Distinguer « mauvais palier » de
  // « équipe complète » n'aiderait personne que l'écran ne renseigne déjà, et
  // multiplierait les chemins à tester.
  if (!autorise) return reponse({ erreur: 'ACCES_RESERVE' }, 403, requete);

  // --- 3. La borne d'abus ---

  const { data: dansLePlafond } = await clientService.rpc('consommer_debit', {
    cle: empreinteRequete('collecteur-creer-collaborateur', requete.headers),
    plafond: PLAFOND,
    fenetre_secondes: FENETRE_SECONDES,
  });
  if (dansLePlafond === false) {
    return reponse({ erreur: 'TROP_DE_TENTATIVES' }, 429, requete);
  }

  // --- 4. Validation avant toute écriture ---

  let saisie: unknown;
  try {
    saisie = await requete.json();
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  // Un collaborateur naît sur le palier de son titulaire : il n'y a pas de
  // second abonnement à vendre. Le champ `palier` du corps est ignoré, et c'est
  // `illimite` qui est imposé ici.
  const controle = validerCollecteur({
    ...(saisie as Record<string, unknown>),
    palier: 'illimite',
  });
  if (!controle.ok) return reponse({ erreur: controle.erreur }, 400, requete);
  const { email, motDePasse, nom, telephone, zone } = controle.valeurs;

  // --- 5. Mot de passe divulgué ---
  //
  // `auth.admin.createUser` ne consulte aucune règle de mot de passe
  // (supabase/auth#1959) : la case « Prevent use of leaked passwords » du projet
  // ne couvre pas ce chemin. Ce contrôle est la seule application effective du
  // seuil, comme dans `admin-creer-collecteur`.
  const fuite = await verifierFuite(motDePasse);
  if (fuite.etat === 'compromis') {
    return reponse(
      { erreur: 'MOT_DE_PASSE_COMPROMIS', occurrences: fuite.occurrences },
      400,
      requete,
    );
  }
  const avertissement = fuite.etat === 'indisponible' ? 'FUITES_NON_VERIFIEES' : undefined;
  if (avertissement) console.error('HIBP injoignable :', fuite.raison);

  // --- 6. Le compte ---

  const { data: cree, error: erreurAuth } = await clientService.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
    user_metadata: { nom, telephone },
  });

  if (erreurAuth || !cree.user) {
    const message = erreurAuth?.message ?? 'création impossible';
    console.error('createUser a échoué :', message);
    const deja = /already|exist|registered/i.test(message);
    return reponse(
      { erreur: deja ? 'EMAIL_DEJA_PRIS' : 'CREATION_IMPOSSIBLE' },
      deja ? 409 : 500,
      requete,
    );
  }

  // --- 7. Le rattachement, sous la dernière barrière ---

  const complement: Record<string, string> = { palier: 'illimite', titulaire_id: titulaireId };
  if (zone) complement.zone = zone;

  const { error: erreurRattachement } = await clientService
    .from('collecteurs')
    .update(complement)
    .eq('id', cree.user.id);

  if (erreurRattachement) {
    console.error('rattachement refusé :', erreurRattachement.message);
    return reponse(
      {
        erreur: 'RATTACHEMENT_REFUSE',
        collaborateurId: cree.user.id,
        cause: erreurRattachement.message,
      },
      409,
      requete,
    );
  }

  return reponse({ collaborateurId: cree.user.id, email, nom, avertissement }, 201, requete);
});
```

- [ ] **Étape 4 : vérifier ce qui est vérifiable sans le runtime**

```
npx deno check supabase/functions/collecteur-creer-collaborateur/index.ts
```

Si `deno` n'est pas installé, sauter l'étape et le dire. Vérifier au minimum que
`consommer_debit` existe avec cette signature :

```
docker exec supabase_db_Kolek psql -U postgres -d postgres -tAc "select pg_get_function_arguments(oid) from pg_proc where proname='consommer_debit';"
```

Attendu : `cle text, plafond integer, fenetre_secondes integer` (ou équivalent).
Ajuster les noms de paramètres de l'appel `rpc` si la signature diffère.

- [ ] **Étape 5 : commit**

```bash
git add supabase/functions/collecteur-creer-collaborateur/index.ts \
        supabase/tests/collecteur-creer-collaborateur.test.ts
git commit -m "feat(edge): un titulaire Illimite cree ses trois collaborateurs"
```

---

## Tâche 7 — Encaisser pour un coéquipier

Réalise la première moitié de la **§5**.

**Fichiers**
- Créer : `supabase/functions/collecteur-encaisser-pour/index.ts`
- Créer : `supabase/tests/collecteur-encaisser-pour.test.ts`

**Interfaces**
- Consomme : `titulaire_id` (tâche 1), `encaisse_par` (tâche 3).
- Produit : `POST /functions/v1/collecteur-encaisser-pour`
  - corps : `{ miseId, carteId, montant, encaisseLe }`
  - `201 { miseId }`
  - `401 JETON_ABSENT` · `403 ACCES_RESERVE` · `404 CARTE_INTROUVABLE`
  - `409 { erreur: <code du déclencheur> }` pour `DOUBLON`, `CARTE_CLOTUREE`,
    `CYCLE_COMPLET`, `MONTANT_INVALIDE`, `DATE_INVALIDE`

- [ ] **Étape 1 : le test qui échoue**

Créer `supabase/tests/collecteur-encaisser-pour.test.ts` :

```ts
import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer } from './harnais';

afterAll(nettoyer);

const BASE = `${process.env.SUPABASE_URL}/functions/v1/collecteur-encaisser-pour`;

async function appeler(jeton: string | null, corps: unknown): Promise<Response> {
  return fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
    },
    body: JSON.stringify(corps),
  });
}

async function jetonDe(c: { client: { auth: { getSession: () => Promise<unknown> } } }) {
  const { data } = (await c.client.auth.getSession()) as {
    data: { session: { access_token: string } | null };
  };
  return data.session!.access_token;
}

/** Un titulaire, un collaborateur, et une carte ouverte chez le collaborateur. */
async function equipe(suffixe: string) {
  const patron = await creerCollecteur(`Patron ${suffixe}`, `+225081${suffixe}`);
  const awa = await creerCollecteur(`Awa ${suffixe}`, `+225082${suffixe}`);
  await admin
    .from('collecteurs')
    .update({ palier: 'illimite', abonnement_statut: 'actif' })
    .eq('id', patron.id);
  await admin.from('collecteurs').update({ titulaire_id: patron.id }).eq('id', awa.id);

  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();
  await awa.client.from('clients').insert({ id: clientId, collecteur_id: awa.id, nom: 'Aya' });
  await awa.client
    .from('cartes')
    .insert({ id: carteId, collecteur_id: awa.id, client_id: clientId, mise: 1000 });

  return { patron, awa, carteId };
}

describe('collecteur-encaisser-pour', () => {
  it('refuse sans jeton', async () => {
    const reponse = await appeler(null, {});
    expect(reponse.status).toBe(401);
  });

  it('rend 404 sur une carte hors équipe, comme sur une carte absente', async () => {
    const { patron } = await equipe(`${Date.now() % 10000}a`);
    const etranger = await creerCollecteur('Étranger E', `+2250830${Date.now() % 100000}`);
    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    await etranger.client
      .from('clients')
      .insert({ id: clientId, collecteur_id: etranger.id, nom: 'Autre' });
    await etranger.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: etranger.id, client_id: clientId, mise: 1000 });

    const horsEquipe = await appeler(await jetonDe(patron), {
      miseId: crypto.randomUUID(),
      carteId,
      montant: 1000,
      encaisseLe: new Date().toISOString(),
    });
    const absente = await appeler(await jetonDe(patron), {
      miseId: crypto.randomUUID(),
      carteId: '00000000-0000-4000-8000-000000000000',
      montant: 1000,
      encaisseLe: new Date().toISOString(),
    });

    // Les deux réponses doivent être indiscernables : les distinguer dirait si
    // la carte existe.
    expect(horsEquipe.status).toBe(404);
    expect(absente.status).toBe(404);
    expect(await horsEquipe.json()).toEqual(await absente.json());
  });

  it('encaisse sur la carte du collaborateur, et attribue l’argent au titulaire', async () => {
    const { patron, awa, carteId } = await equipe(`${Date.now() % 10000}b`);
    const miseId = crypto.randomUUID();

    const reponse = await appeler(await jetonDe(patron), {
      miseId,
      carteId,
      montant: 1000,
      encaisseLe: new Date().toISOString(),
    });
    expect(reponse.status).toBe(201);

    const { data } = await admin
      .from('mises')
      .select('collecteur_id, encaisse_par')
      .eq('id', miseId)
      .single();
    // La carte reste à Awa…
    expect(data?.collecteur_id).toBe(awa.id);
    // …mais le billet est dans la poche du titulaire.
    expect(data?.encaisse_par).toBe(patron.id);
  });

  it('rejoue une mise déjà enregistrée en doublon', async () => {
    const { patron, carteId } = await equipe(`${Date.now() % 10000}c`);
    const miseId = crypto.randomUUID();
    const corps = { miseId, carteId, montant: 1000, encaisseLe: new Date().toISOString() };
    const jeton = await jetonDe(patron);

    expect((await appeler(jeton, corps)).status).toBe(201);
    const rejeu = await appeler(jeton, corps);
    expect(rejeu.status).toBe(409);
    expect((await rejeu.json()).erreur).toBe('DOUBLON');
  });
});
```

- [ ] **Étape 2 : le lancer**

```
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/collecteur-encaisser-pour.test.ts
```

Attendu : ÉCHEC. Sur cette machine, HTTP 500 partout — voir la contrainte
globale 9. **Rapporter comme NON VÉRIFIÉ.**

- [ ] **Étape 3 : la fonction**

Créer `supabase/functions/collecteur-encaisser-pour/index.ts` :

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_COLLECTEUR, entetesCors, listerOrigines } from '../_shared/cors.ts';

/**
 * Encaisser une mise sur la carte d'un coéquipier.
 *
 * ## Pourquoi une Edge Function et pas PostgREST
 *
 * Parce que la policy `mises_insert` exige `collecteur_id = auth.uid()` et
 * qu'elle **ne bouge pas**. C'est la décision structurante de cette
 * conception : élargir l'isolation aurait changé le sens de 35 sites de lecture
 * dans l'application, en silence. Le dépannage passe donc par une porte
 * dédiée, et son prix est nommé : dépanner un coéquipier exige le réseau.
 *
 * ## La vérification de propriété appartient entièrement à cette fonction
 *
 * Sous clé de service, `auth.uid()` est nul : la garde
 * `if auth.uid() is not null and c.collecteur_id <> auth.uid()` de
 * `mises_avant_insert` **ne s'exécute pas**. C'est déjà vrai aujourd'hui pour
 * tout chemin de service ; cette fonction est la première à en dépendre pour de
 * bon. Si l'étape 3 ci-dessous disparaît, n'importe quel collecteur connecté
 * encaisse sur n'importe quelle carte du produit.
 *
 * Toutes les AUTRES bornes de `mises_avant_insert` s'appliquent inchangées :
 * doublon, fenêtre de 90 jours, carte close, cycle complet, montant exact. On
 * ne les recopie pas ici — deux copies d'une règle divergent.
 */

const ORIGINES_AUTORISEES = listerOrigines(
  Deno.env.get('ORIGINES_COLLECTEUR'),
  ORIGINES_COLLECTEUR,
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Les refus du déclencheur, qui voyagent tous en P0001. Reconnus par le message
    pour être rendus tels quels — l'application les traduit déjà (`ecritures.ts`). */
const REFUS_METIER = [
  'DOUBLON',
  'CARTE_CLOTUREE',
  'CYCLE_COMPLET',
  'MONTANT_INVALIDE',
  'DATE_INVALIDE',
] as const;

function entetesPour(requete: Request): Record<string, string> {
  return entetesCors({
    origine: requete.headers.get('Origin'),
    entetesDemandes: requete.headers.get('Access-Control-Request-Headers'),
    origines: ORIGINES_AUTORISEES,
  });
}

function reponse(corps: unknown, statut: number, requete: Request): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: entetesPour(requete) });
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesPour(requete) });
  }
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }

  const autorisation = requete.headers.get('Authorization');
  if (!autorisation?.startsWith('Bearer ')) {
    return reponse({ erreur: 'JETON_ABSENT' }, 401, requete);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const cleAnon = Deno.env.get('SUPABASE_ANON_KEY');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !cleAnon || !cleService) {
    console.error('Configuration incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  let saisie: { miseId?: unknown; carteId?: unknown; montant?: unknown; encaisseLe?: unknown };
  try {
    saisie = await requete.json();
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  const miseId = typeof saisie.miseId === 'string' ? saisie.miseId : '';
  const carteId = typeof saisie.carteId === 'string' ? saisie.carteId : '';
  const montant = typeof saisie.montant === 'number' ? saisie.montant : Number.NaN;
  const encaisseLe = typeof saisie.encaisseLe === 'string' ? saisie.encaisseLe : '';

  // L'identifiant de la mise vient du téléphone : c'est le mécanisme
  // anti-double-comptage du produit. Le rejeu d'un envoi porte le même
  // identifiant, viole la clé primaire, et sort en DOUBLON.
  if (!UUID.test(miseId)) return reponse({ erreur: 'MISE_INVALIDE' }, 400, requete);
  if (!UUID.test(carteId)) return reponse({ erreur: 'CARTE_INTROUVABLE' }, 404, requete);
  if (!Number.isInteger(montant) || montant <= 0) {
    return reponse({ erreur: 'MONTANT_INVALIDE' }, 400, requete);
  }
  if (Number.isNaN(Date.parse(encaisseLe))) {
    return reponse({ erreur: 'DATE_INVALIDE' }, 400, requete);
  }

  // --- 1 et 2. L'identité vient du jeton ---

  const clientAppelant = createClient(url, cleAnon, {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: utilisateur, error: erreurUtilisateur } = await clientAppelant.auth.getUser();
  if (erreurUtilisateur || !utilisateur.user) {
    return reponse({ erreur: 'ACCES_RESERVE' }, 403, requete);
  }
  const appelantId = utilisateur.user.id;

  // --- Passé ce point seulement, la clé de service sort ---

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- 3. La carte, son propriétaire, et le lien d'équipe ---

  const { data: carte, error: erreurCarte } = await clientService
    .from('cartes')
    .select('id, collecteur_id')
    .eq('id', carteId)
    .maybeSingle();

  if (erreurCarte) {
    console.error('lecture carte :', erreurCarte.message);
    return reponse({ erreur: 'ENCAISSEMENT_IMPOSSIBLE' }, 500, requete);
  }
  if (!carte) return reponse({ erreur: 'CARTE_INTROUVABLE' }, 404, requete);

  const proprietaire = carte.collecteur_id as string;

  let autorise = proprietaire === appelantId;
  if (!autorise) {
    const { data: membre, error: erreurMembre } = await clientService
      .from('collecteurs')
      .select('titulaire_id')
      .eq('id', proprietaire)
      .maybeSingle();

    if (erreurMembre) {
      console.error('lecture propriétaire :', erreurMembre.message);
      return reponse({ erreur: 'ENCAISSEMENT_IMPOSSIBLE' }, 500, requete);
    }
    autorise = membre?.titulaire_id === appelantId;
  }

  // Même réponse que pour une carte absente. Distinguer les deux dirait à
  // l'appelant si la carte existe — c'est la règle de `collecteur-cloturer-carte`
  // et de `mises_avant_insert`, tenue ici aussi.
  if (!autorise) return reponse({ erreur: 'CARTE_INTROUVABLE' }, 404, requete);

  // --- 4. L'écriture ---
  //
  // `collecteur_id` est envoyé pour mémoire ; le déclencheur le réécrit depuis
  // la carte. `encaisse_par` est la valeur que le `coalesce` retiendra, puisque
  // `auth.uid()` est nul sous clé de service.
  const { error: erreurMise } = await clientService.from('mises').insert({
    id: miseId,
    collecteur_id: proprietaire,
    carte_id: carteId,
    montant,
    encaisse_le: encaisseLe,
    encaisse_par: appelantId,
  });

  if (erreurMise) {
    const message = erreurMise.message ?? '';
    const refus = REFUS_METIER.find((code) => message.includes(code));
    if (refus) return reponse({ erreur: refus }, 409, requete);
    if (message.includes('CARTE_INTROUVABLE')) {
      return reponse({ erreur: 'CARTE_INTROUVABLE' }, 404, requete);
    }
    console.error('insertion mise :', message);
    return reponse({ erreur: 'ENCAISSEMENT_IMPOSSIBLE' }, 500, requete);
  }

  return reponse({ miseId }, 201, requete);
});
```

- [ ] **Étape 4 : vérifier la règle centrale sans le runtime**

Le contrôle d'appartenance est la seule chose qui sépare cette fonction d'une
porte ouverte. Le vérifier directement en SQL, sous clé de service, en simulant
ce que fait la fonction :

```
docker exec supabase_db_Kolek psql -U postgres -d postgres -c "
  select c.id as carte, c.collecteur_id as proprietaire, col.titulaire_id
    from public.cartes c join public.collecteurs col on col.id = c.collecteur_id
   limit 5;"
```

Attendu : la requête tourne et rend les trois colonnes. C'est la lecture exacte
dont dépend l'étape 3 de la fonction.

- [ ] **Étape 5 : commit**

```bash
git add supabase/functions/collecteur-encaisser-pour/index.ts \
        supabase/tests/collecteur-encaisser-pour.test.ts
git commit -m "feat(edge): le titulaire encaisse sur la carte d'un coequipier"
```

---

## Tâche 8 — Clôturer pour un coéquipier

Réalise la seconde moitié de la **§5**, et le test de bout en bout de la **§11**.

**Fichiers**
- Modifier : `supabase/functions/collecteur-cloturer-carte/index.ts`
- Créer : `supabase/tests/cash-equipe.test.ts`

**Interfaces**
- Consomme : `titulaire_id`, `restitue_par`, `cash_attendu_du_jour` réécrite.
- Produit : `collecteur-cloturer-carte` accepte désormais la carte d'un
  collaborateur ; `retraits.collecteur_id` désigne le **propriétaire**,
  `restitue_par` **l'appelant**.

- [ ] **Étape 1 : le test qui échoue**

Créer `supabase/tests/cash-equipe.test.ts` :

```ts
import { afterAll, describe, expect, it } from 'vitest';

import { admin, creerCollecteur, nettoyer } from './harnais';

afterAll(nettoyer);

/** Le cash attendu d'un collecteur pour aujourd'hui, lu sous clé de service. */
async function cashAttendu(collecteurId: string): Promise<number> {
  const { data, error } = await admin.rpc('cash_attendu_du_jour', {
    p_collecteur: collecteurId,
    p_date: new Date().toISOString().slice(0, 10),
  });
  expect(error).toBeNull();
  return data as number;
}

describe('la caisse suit la main', () => {
  it('porte au titulaire ce qu’il a encaissé sur la carte d’Awa', async () => {
    const patron = await creerCollecteur('Patron Cash', `+2250840${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Cash', `+2250841${Date.now() % 100000}`);
    await admin
      .from('collecteurs')
      .update({ palier: 'illimite', abonnement_statut: 'actif' })
      .eq('id', patron.id);
    await admin.from('collecteurs').update({ titulaire_id: patron.id }).eq('id', awa.id);

    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    await awa.client.from('clients').insert({ id: clientId, collecteur_id: awa.id, nom: 'Aya' });
    await awa.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: awa.id, client_id: clientId, mise: 1000 });

    const patronAvant = await cashAttendu(patron.id);
    const awaAvant = await cashAttendu(awa.id);

    // Le chemin d'équipe, écrit comme l'Edge Function l'écrit : sous clé de
    // service, `encaisse_par` posé, `auth.uid()` nul.
    const { error } = await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: awa.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
      encaisse_par: patron.id,
    });
    expect(error).toBeNull();

    // Le billet est dans la poche du titulaire.
    expect(await cashAttendu(patron.id)).toBe(patronAvant + 1000);
    // Celle d'Awa ne bouge pas : lui faire porter un billet qu'elle n'a pas eu
    // en main lui fabriquerait un écart de caisse tous les soirs.
    expect(await cashAttendu(awa.id)).toBe(awaAvant);
  });

  it('attribue le retrait au propriétaire et la sortie de caisse à qui a payé', async () => {
    const patron = await creerCollecteur('Patron Ret', `+2250842${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Ret', `+2250843${Date.now() % 100000}`);
    await admin
      .from('collecteurs')
      .update({ palier: 'illimite', abonnement_statut: 'actif' })
      .eq('id', patron.id);
    await admin.from('collecteurs').update({ titulaire_id: patron.id }).eq('id', awa.id);

    const clientId = crypto.randomUUID();
    const carteId = crypto.randomUUID();
    await awa.client.from('clients').insert({ id: clientId, collecteur_id: awa.id, nom: 'Aya' });
    await awa.client
      .from('cartes')
      .insert({ id: carteId, collecteur_id: awa.id, client_id: clientId, mise: 1000 });
    await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: awa.id,
      carte_id: carteId,
      montant: 1000,
      encaisse_le: new Date().toISOString(),
      encaisse_par: awa.id,
    });

    // Ce que l'Edge Function écrit après vérification d'appartenance.
    const { error } = await admin.from('retraits').insert({
      collecteur_id: awa.id,
      restitue_par: patron.id,
      carte_id: carteId,
      montant_restitue: 0,
      commission: 1000,
    });
    expect(error).toBeNull();

    const { data } = await admin
      .from('retraits')
      .select('collecteur_id, restitue_par')
      .eq('carte_id', carteId)
      .single();
    // `retraits.collecteur_id` désigne le propriétaire, pour rester cohérent
    // avec `mises.collecteur_id`.
    expect(data?.collecteur_id).toBe(awa.id);
    expect(data?.restitue_par).toBe(patron.id);
  });
});
```

- [ ] **Étape 2 : le lancer pour le voir échouer**

```
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/cash-equipe.test.ts
```

Attendu : le premier test ÉCHOUE si la tâche 3 n'a pas été appliquée ; sinon
les deux passent déjà — ce sont les tests de la migration, pas de la fonction.
Si les deux passent, le noter : ils protègent l'étape 3 ci-dessous contre une
régression, ce qui est leur rôle.

- [ ] **Étape 3 : la lecture passe sous clé de service**

Dans `supabase/functions/collecteur-cloturer-carte/index.ts` :

**3a.** Corriger le bloc de commentaire « Contrôle d'accès » de l'en-tête, qui
devient faux :

```ts
 * ## Contrôle d'accès
 *
 * La carte est lue **sous clé de service**, et l'appartenance est vérifiée
 * ici : la carte est celle de l'appelant, ou celle d'un collaborateur dont il
 * est le titulaire. Une lecture sous RLS ne conviendrait plus — les policies ne
 * bougent pas (`cartes_select : collecteur_id = auth.uid()`), donc le titulaire
 * ne verrait tout simplement pas la carte d'Awa.
 *
 * Une carte hors périmètre est introuvable, et la réponse est la même que pour
 * une carte inexistante — le collecteur d'à côté n'apprend pas qui existe.
```

**3b.** Remplacer le bloc de lecture. L'ancien :

```ts
  const { data: carteBrute, error: erreurCarte } = await clientAppelant
    .from('cartes')
    .select('id, mise, statut, mises_encaissees')
    .eq('id', carteId)
    .maybeSingle();
```

devient — en déplaçant la création de `clientService` **avant** ce bloc :

```ts
  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: carteBrute, error: erreurCarte } = await clientService
    .from('cartes')
    .select('id, mise, statut, mises_encaissees, collecteur_id')
    .eq('id', carteId)
    .maybeSingle();
```

**3c.** Élargir le type de `carte` :

```ts
  const carte = carteBrute as {
    id: string;
    mise: number;
    statut: 'active' | 'cloturee';
    mises_encaissees: number;
    collecteur_id: string;
  } | null;
```

**3d.** Après `if (!carte) return reponse({ erreur: 'CARTE_INTROUVABLE' }, 404, requete);`
et **avant** le test de statut, insérer la vérification d'appartenance :

```ts
  // La propriété n'est plus prouvée par RLS : elle se vérifie ici. Sans ce
  // bloc, n'importe quel collecteur connecté clôture n'importe quelle carte du
  // produit et se fait verser son solde.
  let autorise = carte.collecteur_id === collecteurId;
  if (!autorise) {
    const { data: membre, error: erreurMembre } = await clientService
      .from('collecteurs')
      .select('titulaire_id')
      .eq('id', carte.collecteur_id)
      .maybeSingle();

    if (erreurMembre) {
      console.error('lecture propriétaire :', erreurMembre.message);
      return reponse({ erreur: 'CLOTURE_IMPOSSIBLE' }, 500, requete);
    }
    autorise = membre?.titulaire_id === collecteurId;
  }
  if (!autorise) return reponse({ erreur: 'CARTE_INTROUVABLE' }, 404, requete);
```

**3e.** Supprimer la seconde création de `clientService` (celle qui suivait le
commentaire « Passé ce point seulement, la clé de service sort »), et remplacer
ce commentaire par :

```ts
  // --- L'écriture ---
```

**3f.** Corriger l'insertion du retrait :

```ts
  const { error: erreurRetrait } = await clientService.from('retraits').insert({
    // Le propriétaire de la carte, et non l'appelant. Les deux coïncident quand
    // un collecteur clôture chez lui ; avec une équipe ils divergent, et
    // `retraits.collecteur_id` doit désigner le propriétaire pour rester
    // cohérent avec `mises.collecteur_id`.
    collecteur_id: carte.collecteur_id,
    // Celui qui sort l'argent de sa sacoche. C'est lui que la caisse du soir
    // attend.
    restitue_par: collecteurId,
    carte_id: carte.id,
    montant_restitue: partage.montantRestitue,
    commission: partage.commission,
  });
```

- [ ] **Étape 4 : relancer**

```
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/cash-equipe.test.ts
```

Attendu : deux tests verts. La suite HTTP `cloture.test.ts`, si elle existe,
échouera pour cause de runtime local (contrainte globale 9) — **NON VÉRIFIÉE**.

- [ ] **Étape 5 : commit**

```bash
git add supabase/functions/collecteur-cloturer-carte/index.ts \
        supabase/tests/cash-equipe.test.ts
git commit -m "feat(edge): cloturer la carte d'un coequipier, sans elargir aucune policy"
```

---

## Tâche 9 — Les quatre textes de commission

Réalise la **§6**.

**Fichiers**
- Modifier : `apps/collecteur/src/lectures-ecrans.ts`
- Modifier : `apps/collecteur/src/ecrans/Bilan.tsx`
- Modifier : `apps/collecteur/src/ecrans/ChoixMise.tsx`
- Modifier : `apps/collecteur/src/ecrans/Recus.tsx`
- Modifier : `apps/collecteur/src/ecrans/Retrait.tsx`
- Modifier : `apps/collecteur/src/ecrans/Plus.tsx`
- Créer : `apps/collecteur/src/ecrans/commission.test.tsx`

**Interfaces**
- Consomme : `collecteurs.titulaire_id` lisible (tâche 1).
- Produit : `Profil.titulaireId: string | null` dans `lectures-ecrans.ts` ; un
  hook `useEstCollaborateur(): boolean` exporté par
  `apps/collecteur/src/ecrans/commission.ts`.

- [ ] **Étape 1 : le test qui échoue**

Créer `apps/collecteur/src/ecrans/commission.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChoixMise } from './ChoixMise';

afterEach(cleanup);

vi.mock('../lectures-ecrans', async (original) => ({
  ...((await original()) as object),
  chargerProfil: vi.fn(),
}));

describe('les textes de commission', () => {
  it('dit « ta commission » à un collecteur sans titulaire', () => {
    render(<ChoixMise mise={2000} onChoisir={() => {}} identifiant="t" />);
    expect(document.body.textContent).toContain('La première mise est ta commission.');
  });

  it('dit « ton titulaire » à un collaborateur', () => {
    render(<ChoixMise mise={2000} onChoisir={() => {}} identifiant="t" estCollaborateur />);
    expect(document.body.textContent).toContain('La première mise revient à ton titulaire.');
    expect(document.body.textContent).not.toContain('ta commission');
  });
});
```

`ChoixMise` porte aujourd'hui `{ mise: number | null; onChoisir: (montant: number | null) => void; identifiant: string }`.
La seule prop neuve de cette tâche est `estCollaborateur?: boolean`, **optionnelle**
pour que les douze appels de `ChoixMise.test.tsx` restent valides sans être
touchés.

- [ ] **Étape 2 : le lancer**

```
npx vitest run apps/collecteur/src/ecrans/commission.test.tsx
```

Attendu : ÉCHEC sur le second cas.

- [ ] **Étape 3 : le profil rend `titulaireId`**

Dans `apps/collecteur/src/lectures-ecrans.ts`, ajouter à l'interface `Profil` :

```ts
  /** L'identifiant du titulaire, ou `null` pour un titulaire ou un collecteur
      seul. C'est ce qui décide à qui revient la commission de la première mise. */
  titulaireId: string | null;
```

et, dans `chargerProfil`, étendre le `select` et le retour :

```ts
      .select('nom, telephone, zone, palier, abonnement_statut, abonnement_echeance, titulaire_id')
```

```ts
    titulaireId: c.titulaire_id ?? null,
```

- [ ] **Étape 4 : le hook partagé**

Créer `apps/collecteur/src/ecrans/commission.ts` :

```ts
import { useDonnees } from '../cache';
import { chargerProfil } from '../lectures-ecrans';

/**
 * Vrai si l'utilisateur est un collaborateur.
 *
 * Quatre écrans annoncent au collecteur que la commission de la première mise
 * est la sienne. Pour un collaborateur, c'est faux : les collaborateurs sont
 * salariés, pas commissionnés, et la commission revient toujours au titulaire.
 * Laisser ces quatre phrases en l'état lui promettrait un revenu qu'il ne
 * touchera pas.
 *
 * Le profil est déjà lu et mis en cache par l'écran « Plus » ; ce hook réutilise
 * la même clé plutôt que d'ouvrir une seconde lecture.
 */
export function useEstCollaborateur(): boolean {
  const { donnees } = useDonnees('profil', chargerProfil, {
    messageErreur: 'Fiche indisponible. Vérifie le réseau.',
  });
  return donnees?.titulaireId != null;
}
```

`useDonnees<T>(cle, chargeur, { revision?, messageErreur })` — **il n'y a pas
d'option de durée de vie** ; la clé `'profil'` suffit à partager le cache avec
l'appel existant de `Plus.tsx`, dont le `messageErreur` est repris mot pour mot.

- [ ] **Étape 5 : les quatre textes**

**`ChoixMise.tsx`** — ajouter la prop `estCollaborateur?: boolean` à l'interface
du composant, et remplacer :

```tsx
          {formatMontant(montantAffiche * 30)} FCFA. La première mise est ta commission.
```

par :

```tsx
          {formatMontant(montantAffiche * 30)} FCFA.{' '}
          {estCollaborateur
            ? 'La première mise revient à ton titulaire.'
            : 'La première mise est ta commission.'}
```

**`Bilan.tsx`** — la ligne disparaît pour un collaborateur. Un « +0 FCFA » tous
les soirs pendant qu'il encaisse est pire qu'une absence. Envelopper le bloc
« Ta commission » :

```tsx
                  {/* La ligne qui compte : ce qui reste au collecteur. Elle
                      n'existe pas pour un collaborateur — la commission revient
                      à son titulaire, et lui afficher « +0 FCFA » tous les soirs
                      pendant qu'il encaisse serait pire qu'une absence. */}
                  {!estCollaborateur && (
                    <div className="flex items-baseline justify-between gap-2 mb-4 p-2.5 rounded-xl bg-positive-tint/80 border border-positive/20">
                      <span className="font-body text-xs text-positive font-bold shrink-0">
                        Ta commission
                      </span>
                      <span className="font-headings font-bold text-base xs:text-lg text-positive tabular-nums text-right min-w-0">
                        +{formatMontant(tranche.commissions)}{' '}
                        <span className="text-xs font-body font-semibold">FCFA</span>
                      </span>
                    </div>
                  )}
```

avec, en tête du composant : `const estCollaborateur = useEstCollaborateur();`

**`Recus.tsx`** — le badge :

```tsx
                      {recu.estCommission && (
                        <p className="text-xs font-body text-positive font-medium">
                          {estCollaborateur ? 'commission titulaire' : 'commission'}
                        </p>
                      )}
```

**`Retrait.tsx`** — la phrase :

```tsx
                      {carte.misesEncaissees > 0
                        ? `${carte.misesEncaissees} mises encaissées, moins la première, ${
                            estCollaborateur ? 'qui revient à ton titulaire' : 'qui est ta commission'
                          } (${formatMontant(carte.mise)} FCFA).`
                        : 'Aucune mise encaissée : rien à rendre, rien à garder.'}
```

Dans `Bilan`, `Recus` et `Retrait`, appeler `useEstCollaborateur()` en tête du
composant. Dans `ChoixMise`, la valeur passe par une prop parce que le composant
est un morceau de formulaire, pas un écran : ses **trois** appelants la
fournissent depuis `useEstCollaborateur()` —
[ActiverCarte.tsx:114](apps/collecteur/src/ecrans/ActiverCarte.tsx#L114),
[Clients.tsx:837](apps/collecteur/src/ecrans/Clients.tsx#L837) et
[FicheClient.tsx:784](apps/collecteur/src/ecrans/FicheClient.tsx#L784).
Les douze appels de `ChoixMise.test.tsx` restent inchangés : la prop est
optionnelle et vaut `false` par défaut.

- [ ] **Étape 6 : la mention du titulaire sur le profil**

Dans `Plus.tsx`, après la ligne `<Ligne terme="Formule" … />`, ajouter :

```tsx
                    {profil.titulaireId && (
                      <Ligne terme="Équipe" valeur="Collaborateur — la commission revient à ton titulaire" />
                    )}
```

- [ ] **Étape 7 : relancer, typer, linter**

```
npx vitest run apps/collecteur/src/ecrans/commission.test.tsx
npm test --workspace @kolek/collecteur
npx tsc -b apps/collecteur
npx oxlint apps/collecteur/src
```

Attendu : tout vert. Si un test existant assertait « ta commission » sans
condition, l'adapter en ajoutant le cas collaborateur plutôt qu'en supprimant
l'assertion.

- [ ] **Étape 8 : commit**

```bash
git add apps/collecteur/src
git commit -m "feat(collecteur): quatre ecrans cessent de promettre au collaborateur une commission qu'il ne touche pas"
```

---

## Tâche 10 — L'écran « Mon équipe »

Réalise la première partie de la **§10**.

**Fichiers**
- Modifier : `apps/collecteur/src/lectures-ecrans.ts`
- Modifier : `apps/collecteur/src/ecritures-ecrans.ts`
- Créer : `apps/collecteur/src/ecrans/Equipe.tsx`
- Créer : `apps/collecteur/src/ecrans/Equipe.test.tsx`
- Modifier : `apps/collecteur/src/Coquille.tsx`
- Modifier : `apps/collecteur/src/ecrans/Accueil.tsx`

**Interfaces**
- Consomme : `equipe_vue()` (tâche 4), `collecteur-creer-collaborateur` (tâche 6),
  `COLLABORATEURS_MAX` (tâche 1).
- Produit :
  - `chargerEquipe(): Promise<MembreEquipe[]>` dans `lectures-ecrans.ts`, avec
    `interface MembreEquipe { id, nom, telephone, clients, cartesActives,
    encours, commissions, cashAttendu, cashDeclare, ecart, derniereDeclaration }` ;
  - `creerCollaborateur(saisie): Promise<ResultatCreationCollaborateur>` dans
    `ecritures-ecrans.ts` ;
  - la page `'equipe'` dans `type EcranSecondaire`.

- [ ] **Étape 1 : le test qui échoue**

Créer `apps/collecteur/src/ecrans/Equipe.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Equipe } from './Equipe';

afterEach(cleanup);

const chargerEquipe = vi.fn();
vi.mock('../lectures-ecrans', async (original) => ({
  ...((await original()) as object),
  chargerEquipe: () => chargerEquipe(),
}));

function membre(nom: string, id: string) {
  return {
    id,
    nom,
    telephone: '+2250700000000',
    clients: 12,
    cartesActives: 9,
    encours: 240000,
    commissions: 18000,
    cashAttendu: 24000,
    cashDeclare: null,
    ecart: null,
    derniereDeclaration: null,
  };
}

describe('l’écran Mon équipe', () => {
  it('montre un collaborateur avec ses chiffres', async () => {
    chargerEquipe.mockResolvedValue([membre('Awa Konan', 'a1')]);
    render(<Equipe revision={0} onRetour={() => {}} onOuvrir={() => {}} />);

    expect(await screen.findByText('Awa Konan')).toBeTruthy();
    expect(document.body.textContent).toContain('12');
  });

  it('propose d’ajouter tant qu’il reste de la place, et le dit en clair', async () => {
    chargerEquipe.mockResolvedValue([membre('Awa', 'a1')]);
    render(<Equipe revision={0} onRetour={() => {}} onOuvrir={() => {}} />);

    expect(await screen.findByText('Ajouter un collaborateur')).toBeTruthy();
    expect(document.body.textContent).toContain('2 places');
  });

  it('retire le bouton d’ajout à trois', async () => {
    chargerEquipe.mockResolvedValue([membre('A', 'a'), membre('B', 'b'), membre('C', 'c')]);
    render(<Equipe revision={0} onRetour={() => {}} onOuvrir={() => {}} />);

    expect(await screen.findByText('A')).toBeTruthy();
    expect(screen.queryByText('Ajouter un collaborateur')).toBeNull();
    expect(document.body.textContent).toContain('Équipe complète');
  });

  it('dit l’absence d’équipe sans la présenter comme une panne', async () => {
    chargerEquipe.mockResolvedValue([]);
    render(<Equipe revision={0} onRetour={() => {}} onOuvrir={() => {}} />);

    expect(await screen.findByText('Ajouter un collaborateur')).toBeTruthy();
    expect(document.body.textContent).toContain('3 places');
  });
});
```

- [ ] **Étape 2 : le lancer**

```
npx vitest run apps/collecteur/src/ecrans/Equipe.test.tsx
```

Attendu : ÉCHEC — `Failed to resolve import "./Equipe"`.

- [ ] **Étape 3 : la lecture**

Ajouter à `apps/collecteur/src/lectures-ecrans.ts` :

```ts
/* ---------------------------- L'équipe (titulaire) ----------------------- */

export interface MembreEquipe {
  id: string;
  nom: string;
  telephone: string | null;
  clients: number;
  cartesActives: number;
  /** Ce que ses clients ont versé et qui leur est encore dû. */
  encours: number;
  /** Les commissions de ses cartes — elles reviennent au titulaire. */
  commissions: number;
  cashAttendu: number | null;
  cashDeclare: number | null;
  ecart: number | null;
  /** `null` tant qu'il n'a pas compté sa caisse aujourd'hui. */
  derniereDeclaration: string | null;
}

/**
 * L'équipe de l'utilisateur, ou un tableau vide.
 *
 * Passe par `equipe_vue()`, une fonction `security definer` **sans paramètre** :
 * l'identité vient de `auth.uid()` côté serveur, donc il n'existe aucune manière
 * de demander l'équipe de quelqu'un d'autre. Aucune policy RLS n'a été élargie
 * pour cet écran, et c'est délibéré — les 35 autres lectures de ce fichier
 * gardent leur sens exact.
 */
export async function chargerEquipe(): Promise<MembreEquipe[]> {
  const { data, error } = await supabase.rpc('equipe_vue');
  if (error) throw error;

  const lignes = (data ?? []) as Array<Record<string, unknown>>;
  return lignes.map((l) => ({
    id: String(l.id),
    nom: String(l.nom ?? 'Collaborateur'),
    telephone: (l.telephone as string | null) ?? null,
    clients: Number(l.clients ?? 0),
    cartesActives: Number(l.cartes_actives ?? 0),
    encours: Number(l.encours ?? 0),
    commissions: Number(l.commissions ?? 0),
    cashAttendu: l.cash_attendu == null ? null : Number(l.cash_attendu),
    cashDeclare: l.cash_declare == null ? null : Number(l.cash_declare),
    ecart: l.ecart == null ? null : Number(l.ecart),
    derniereDeclaration: (l.derniere_declaration as string | null) ?? null,
  }));
}
```

- [ ] **Étape 4 : l'écriture**

Ajouter à `apps/collecteur/src/ecritures-ecrans.ts`, sur le modèle de
`cloturerCarte` :

```ts
export interface SaisieCollaborateur {
  email: string;
  motDePasse: string;
  nom: string;
  telephone: string;
  zone?: string;
}

export type ResultatCreationCollaborateur =
  | { ok: true; collaborateurId: string }
  | { ok: false; code: string; message: string };

/** Les refus de `collecteur-creer-collaborateur`, en phrases. */
const PHRASES_COLLABORATEUR: Record<string, string> = {
  ACCES_RESERVE:
    'Réservé au forfait Illimité, et à trois collaborateurs au plus. Vérifie ton abonnement.',
  EMAIL_DEJA_PRIS: 'Cette adresse est déjà utilisée par un autre compte.',
  MOT_DE_PASSE_COMPROMIS: 'Ce mot de passe figure dans des fuites connues. Choisis-en un autre.',
  TROP_DE_TENTATIVES: 'Trop de créations en peu de temps. Réessaie dans une heure.',
  RATTACHEMENT_REFUSE:
    'Le compte est créé mais n’a pas pu être rattaché. Contacte le support en donnant son adresse.',
  JETON_ABSENT: 'Session expirée. Reconnecte-toi.',
  RESEAU: 'Pas de réseau. Cette action demande une connexion.',
  INCONNU: 'Création impossible. Réessaie.',
};

export async function creerCollaborateur(
  saisie: SaisieCollaborateur,
): Promise<ResultatCreationCollaborateur> {
  const { data, error } = await supabase.functions.invoke('collecteur-creer-collaborateur', {
    body: saisie,
  });

  if (error) {
    // `functions.invoke` range le corps de la réponse dans `context` quand le
    // statut n'est pas 2xx. Sans cette lecture, tout refus deviendrait
    // « Création impossible », y compris « adresse déjà prise » — le seul que
    // l'utilisateur peut corriger seul.
    let code = 'INCONNU';
    try {
      const corps = await (error as { context?: Response }).context?.json();
      if (typeof corps?.erreur === 'string') code = corps.erreur;
    } catch {
      code = 'RESEAU';
    }
    return { ok: false, code, message: PHRASES_COLLABORATEUR[code] ?? PHRASES_COLLABORATEUR.INCONNU! };
  }

  const collaborateurId = (data as { collaborateurId?: string } | null)?.collaborateurId;
  if (!collaborateurId) {
    return { ok: false, code: 'INCONNU', message: PHRASES_COLLABORATEUR.INCONNU! };
  }
  return { ok: true, collaborateurId };
}
```

Vérifier la façon dont `cloturerCarte` extrait déjà un code d'erreur d'un
`functions.invoke` en échec, et **reprendre exactement le même mécanisme** plutôt
que celui écrit ci-dessus s'il diffère : deux façons de lire la même réponse
divergent.

- [ ] **Étape 5 : l'écran**

Créer `apps/collecteur/src/ecrans/Equipe.tsx`. Reprendre la structure d'un écran
secondaire existant — `Rapprochement.tsx` est le plus proche : en-tête avec
flèche de retour, `useDonnees`, états de chargement et d'erreur.

Points imposés par cette tâche :

```tsx
import { COLLABORATEURS_MAX, formatMontant } from '@kolek/core';
```

- `useDonnees('equipe', chargerEquipe, { revision, messageErreur: 'Équipe indisponible. Vérifie le réseau.' })` ;
- une carte par collaborateur, portant : nom, `clients` clients,
  `cartesActives` cartes actives, `encours`, et la caisse du soir
  (`cashDeclare` et `ecart`, ou « Pas encore compté » quand
  `derniereDeclaration` est `null`) ;
- sous la liste, **le total des commissions de l'équipe** —
  `equipe.reduce((t, m) => t + m.commissions, 0)` — libellé « Commissions de
  l'équipe ». C'est la contrepartie de la ligne retirée du Bilan des
  collaborateurs (§6) : la commission ne disparaît pas, elle change de poche, et
  le titulaire doit la voir ;
- toucher une carte appelle `onOuvrir(membre.id, membre.nom)` ;
- sous la liste, quand `equipe.length < COLLABORATEURS_MAX`, un bouton
  **« Ajouter un collaborateur »** et, en clair, le compte restant :
  `` `${COLLABORATEURS_MAX - equipe.length} place${…}` `` ;
- quand `equipe.length >= COLLABORATEURS_MAX`, pas de bouton, et la mention
  **« Équipe complète »** ;
- le formulaire d'ajout appelle `creerCollaborateur` et affiche `message` en cas
  de refus. Il est désactivé hors ligne, **avec la raison écrite** — pas un échec
  silencieux.

Le composant prend `{ revision: number; onRetour: () => void; onOuvrir: (id: string, nom: string) => void }`.

- [ ] **Étape 6 : le brancher**

Dans `Coquille.tsx` :

```ts
type EcranSecondaire =
  | 'retrait'
  | 'rapprochement'
  | 'recus'
  | 'alertes'
  | 'avis'
  | 'plus'
  | 'equipe';
```

et, dans le bloc des écrans secondaires :

```tsx
      {page === 'equipe' && (
        <Equipe
          revision={revision}
          onRetour={() => naviguer('accueil')}
          onOuvrir={(id, nom) => {
            setCoequipier({ id, nom });
            naviguer('equipe-clients');
          }}
        />
      )}
```

`setCoequipier` et la page `'equipe-clients'` arrivent à la tâche 11 ; pour
l'instant, `onOuvrir` peut rester `() => {}` et le brancher là-bas.

Dans `Accueil.tsx`, ajouter l'action — visible pour les seuls titulaires :

```tsx
    ...(estTitulaire
      ? [{ icone: 'users' as const, libelle: 'Équipe', onActiver: () => onNaviguer('equipe') }]
      : []),
```

`estTitulaire` se calcule depuis le profil : `palier === 'illimite' && titulaireId === null`.
Réutiliser `useDonnees('profil', chargerProfil, …)` comme le fait
`useEstCollaborateur` (tâche 9) plutôt que d'ouvrir une lecture de plus.

- [ ] **Étape 7 : relancer**

```
npx vitest run apps/collecteur/src/ecrans/Equipe.test.tsx
npm test --workspace @kolek/collecteur
npx tsc -b apps/collecteur
npx oxlint apps/collecteur/src
```

Attendu : tout vert.

- [ ] **Étape 8 : commit**

```bash
git add apps/collecteur/src
git commit -m "feat(collecteur): l'ecran Mon equipe, et la creation d'un collaborateur"
```

---

## Tâche 11 — Encaisser depuis l'écran d'un coéquipier

Réalise la seconde partie de la **§10**.

**Fichiers**
- Modifier : `apps/collecteur/src/lectures-ecrans.ts`
- Modifier : `apps/collecteur/src/ecritures-ecrans.ts`
- Créer : `apps/collecteur/src/ecrans/EquipeClients.tsx`
- Créer : `apps/collecteur/src/ecrans/EquipeClients.test.tsx`
- Modifier : `apps/collecteur/src/Coquille.tsx`

**Interfaces**
- Consomme : `equipe_clients(uuid)` (tâche 4), `collecteur-encaisser-pour`
  (tâche 7).
- Produit :
  - `chargerClientsCollaborateur(id: string): Promise<ClientCoequipier[]>` ;
  - `encaisserPour(carteId: string, montant: number): Promise<ResultatEncaissementPour>`.

- [ ] **Étape 1 : le test qui échoue**

Créer `apps/collecteur/src/ecrans/EquipeClients.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EquipeClients } from './EquipeClients';

afterEach(cleanup);

const charger = vi.fn();
vi.mock('../lectures-ecrans', async (original) => ({
  ...((await original()) as object),
  chargerClientsCollaborateur: (id: string) => charger(id),
}));

const CLIENT = {
  id: 'c1',
  nom: 'Aya Koffi',
  telephone: '+2250700000000',
  cartes: [{ id: 'k1', mise: 2000, misesEncaissees: 12, soldeRestituable: 22000 }],
};

describe('la tournée d’un coéquipier', () => {
  it('dit de qui sont ces clients, en permanence', async () => {
    charger.mockResolvedValue([CLIENT]);
    render(
      <EquipeClients
        collaborateur={{ id: 'a1', nom: 'Awa Konan' }}
        enLigne
        revision={0}
        onRetour={() => {}}
        onEcriture={() => {}}
      />,
    );

    expect(await screen.findByText('Aya Koffi')).toBeTruthy();
    // Le bandeau : sans lui, on encaisse chez quelqu'un d'autre sans le savoir.
    expect(document.body.textContent).toContain('Awa Konan');
  });

  it('désactive l’encaissement hors ligne, et écrit la raison', async () => {
    charger.mockResolvedValue([CLIENT]);
    render(
      <EquipeClients
        collaborateur={{ id: 'a1', nom: 'Awa Konan' }}
        enLigne={false}
        revision={0}
        onRetour={() => {}}
        onEcriture={() => {}}
      />,
    );

    const bouton = (await screen.findAllByRole('button')).find((b) =>
      b.textContent?.includes('Encaisser'),
    );
    expect(bouton).toBeTruthy();
    expect((bouton as HTMLButtonElement).disabled).toBe(true);
    // Un bouton mort sans explication est pire qu'un bouton absent.
    expect(document.body.textContent).toContain('demande une connexion');
  });
});
```

- [ ] **Étape 2 : le lancer**

```
npx vitest run apps/collecteur/src/ecrans/EquipeClients.test.tsx
```

Attendu : ÉCHEC — module introuvable.

- [ ] **Étape 3 : la lecture**

Ajouter à `lectures-ecrans.ts` :

```ts
export interface CarteCoequipier {
  id: string;
  mise: number;
  misesEncaissees: number;
  soldeRestituable: number;
}

export interface ClientCoequipier {
  id: string;
  nom: string;
  telephone: string | null;
  cartes: CarteCoequipier[];
}

/**
 * Les clients d'un coéquipier, avec leurs cartes actives.
 *
 * `equipe_clients` vérifie son paramètre côté serveur et rend un tableau vide
 * pour tout identifiant hors équipe — y compris un identifiant qui existe. Cet
 * appel ne doit donc rien vérifier de son côté : refaire ici le contrôle
 * fabriquerait une seconde règle, qui divergerait.
 */
export async function chargerClientsCollaborateur(
  collaborateurId: string,
): Promise<ClientCoequipier[]> {
  const { data, error } = await supabase.rpc('equipe_clients', {
    p_collaborateur: collaborateurId,
  });
  if (error) throw error;

  const lignes = (data ?? []) as Array<Record<string, unknown>>;
  return lignes.map((l) => ({
    id: String(l.id),
    nom: String(l.nom ?? 'Client'),
    telephone: (l.telephone as string | null) ?? null,
    cartes: ((l.cartes ?? []) as Array<Record<string, unknown>>).map((c) => ({
      id: String(c.id),
      mise: Number(c.mise ?? 0),
      misesEncaissees: Number(c.mises_encaissees ?? 0),
      soldeRestituable: Number(c.solde_restituable ?? 0),
    })),
  }));
}
```

- [ ] **Étape 4 : l'écriture**

Ajouter à `ecritures-ecrans.ts` :

```ts
export type ResultatEncaissementPour =
  | { ok: true; miseId: string }
  | { ok: false; code: string; message: string };

/**
 * Encaisser sur la carte d'un coéquipier.
 *
 * Le passage par une Edge Function n'est pas un détail d'implémentation :
 * c'est ce qui fait que ce geste **exige le réseau**, là où la tournée du
 * collecteur reste hors ligne. L'appelant doit le dire à l'écran, pas laisser un
 * bouton échouer en silence.
 *
 * L'identifiant vient d'ici, comme pour `enregistrerMise` : c'est le mécanisme
 * anti-double-comptage du produit. Un rejeu porte le même identifiant et sort en
 * `DOUBLON` plutôt qu'en second encaissement.
 */
export async function encaisserPour(
  carteId: string,
  montant: number,
  encaisseLe: Date = new Date(),
): Promise<ResultatEncaissementPour> {
  const miseId = crypto.randomUUID();
  const { error } = await supabase.functions.invoke('collecteur-encaisser-pour', {
    body: { miseId, carteId, montant, encaisseLe: encaisseLe.toISOString() },
  });

  if (error) {
    let code = 'INCONNU';
    try {
      const corps = await (error as { context?: Response }).context?.json();
      if (typeof corps?.erreur === 'string') code = corps.erreur;
    } catch {
      code = 'RESEAU';
    }
    // Les refus métier partagent leurs phrases avec le chemin ordinaire : deux
    // libellés pour « le cycle est complet » seraient deux vérités concurrentes.
    return { ok: false, code, message: phraseEcriture(code) };
  }

  return { ok: true, miseId };
}
```

Exporter depuis `apps/collecteur/src/ecritures.ts` une fonction
`phraseEcriture(code: string): string` qui rend `PHRASES[code] ?? PHRASES.INCONNU`,
plutôt que de dupliquer la table. `PHRASES` reste privée.

- [ ] **Étape 5 : l'écran**

Créer `apps/collecteur/src/ecrans/EquipeClients.tsx`. Props :

```tsx
export function EquipeClients({
  collaborateur,
  enLigne,
  revision,
  onRetour,
  onEcriture,
}: {
  collaborateur: { id: string; nom: string };
  enLigne: boolean;
  revision: number;
  onRetour: () => void;
  onEcriture: () => void;
})
```

Points imposés :

- un **bandeau permanent** (pas un titre qui défile) portant le nom du
  collaborateur — sans lui, on encaisse chez quelqu'un d'autre sans le savoir ;
- une ligne par client, ses cartes actives dessous, chacune avec son bouton
  « Encaisser {mise} FCFA » ;
- `disabled={!enLigne}` sur ce bouton, et sous la liste, quand `!enLigne` :
  « Encaisser pour un coéquipier demande une connexion. Ta propre tournée,
  elle, fonctionne hors ligne. » ;
- au succès, `onEcriture()` pour rafraîchir ; à l'échec, `message` affiché en
  `role="alert"`.

`enLigne` arrive par prop plutôt que d'être lu dans le composant : c'est ce qui
rend le second test possible sans simuler `navigator`. La valeur vient du hook
existant `useEnLigne()` de `@kolek/ui` — le même qu'`Encaisser.tsx:51` — appelé
dans `Coquille.tsx`.

**Ne pas réutiliser `BandeauHorsLigne` sur cet écran**, bien que les quatre
autres écrans hors ligne le fassent. Son texte est
« Hors ligne · les encaissements seront synchronisés dès connexion »
([Bandeaux.tsx:52](packages/ui/src/Bandeaux.tsx#L52)), et c'est **faux ici** :
l'encaissement pour un coéquipier passe par une Edge Function, il n'entre pas
dans la file de synchro, et rien ne partira à la reconnexion. Promettre une
synchro qui n'aura pas lieu ferait croire au titulaire que la mise est prise —
le pire des trois états possibles. D'où la phrase dédiée, qui dit la vérité et
la limite : « Encaisser pour un coéquipier demande une connexion. Ta propre
tournée, elle, fonctionne hors ligne. »

- [ ] **Étape 6 : le brancher**

Dans `Coquille.tsx`, ajouter `'equipe-clients'` à `EcranSecondaire`, l'état :

```tsx
  /** Le coéquipier dont on regarde la tournée. Le nom voyage avec
      l'identifiant : le bandeau doit le porter même quand la liste est vide. */
  const [coequipier, setCoequipier] = useState<{ id: string; nom: string } | null>(null);
```

et le rendu :

```tsx
      {page === 'equipe-clients' && coequipier && (
        <EquipeClients
          collaborateur={coequipier}
          enLigne={enLigne}
          revision={revision}
          onRetour={() => naviguer('equipe')}
          onEcriture={() => setRevision((r) => r + 1)}
        />
      )}
```

Compléter le `onOuvrir` laissé vide à la tâche 10.

- [ ] **Étape 7 : relancer**

```
npx vitest run apps/collecteur/src/ecrans/EquipeClients.test.tsx
npm test --workspace @kolek/collecteur
npx tsc -b apps/collecteur
npx oxlint apps/collecteur/src
```

Attendu : tout vert.

- [ ] **Étape 8 : commit**

```bash
git add apps/collecteur/src
git commit -m "feat(collecteur): encaisser depuis la tournee d'un coequipier"
```

---

## Tâche 12 — L'administration voit le rattachement

Réalise la dernière ligne de la **§10**.

**Fichiers**
- Modifier : `supabase/migrations/` — un fichier neuf,
  `20260902150000_admin_voit_le_rattachement.sql`
- Modifier : l'écran de la liste des collecteurs dans `apps/admin/src`

**Interfaces**
- Consomme : `titulaire_id` (tâche 1), `admin_vue_globale()` (tâche 5).
- Produit : chaque objet du tableau `collecteurs` d'`admin_vue_globale()` porte
  `titulaire_id` et `titulaire_nom`.

- [ ] **Étape 1 : localiser l'écran**

```
grep -rn "admin_vue_globale\|collecteurs" apps/admin/src --include=*.tsx -l
```

Lire l'écran qui rend la liste des collecteurs avant d'écrire quoi que ce soit :
la forme de la ligne et les composants utilisés viennent de là, pas de ce plan.

- [ ] **Étape 2 : le test qui échoue**

Ajouter à `supabase/tests/collaborateurs.test.ts` :

```ts
describe('la vue d’administration', () => {
  it('montre à qui un collaborateur est rattaché', async () => {
    const patron = await creerCollecteur('Patron Admin', `+2250850${Date.now() % 100000}`);
    const awa = await creerCollecteur('Awa Admin', `+2250851${Date.now() % 100000}`);
    await rendreTitulaire(patron.id);
    expect((await rattacher(awa.id, patron.id)).error).toBeNull();

    const vue = (await admin.rpc('admin_vue_globale')).data as {
      collecteurs: Array<{ id: string; titulaire_id: string | null; titulaire_nom: string | null }>;
    };
    const ligne = vue.collecteurs.find((c) => c.id === awa.id);
    expect(ligne?.titulaire_id).toBe(patron.id);
    expect(ligne?.titulaire_nom).toBe('Patron Admin');

    const lignePatron = vue.collecteurs.find((c) => c.id === patron.id);
    expect(lignePatron?.titulaire_id).toBeNull();
  });
});
```

- [ ] **Étape 3 : le lancer**

```
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/collaborateurs.test.ts -t "administration"
```

Attendu : ÉCHEC — `expected undefined to be '…'`.

- [ ] **Étape 4 : la migration**

Créer `supabase/migrations/20260902150000_admin_voit_le_rattachement.sql`.
Reprendre `admin_vue_globale()` **intégralement** depuis
`20260902140000_mrr_hors_collaborateurs.sql` — même consigne qu'à la tâche 5 :
copier, ne pas réécrire — avec deux changements :

Dans la CTE `par_collecteur`, ajouter deux colonnes :

```sql
      c.titulaire_id,
      t.nom as titulaire_nom,
```

et la jointure correspondante, après les quatre `left join` existants :

```sql
    left join public.collecteurs t on t.id = c.titulaire_id
```

Dans le bloc `'collecteurs'` du `jsonb_build_object`, après `'zone', zone,` :

```sql
          -- Le rattachement, visible dans la liste : un collaborateur apparaît
          -- sous son titulaire, et le MRR ne le compte pas. Sans cette colonne,
          -- l'administration voit quatre comptes Illimité et un seul
          -- abonnement, sans le lien qui explique pourquoi.
          'titulaire_id',        titulaire_id,
          'titulaire_nom',       titulaire_nom,
```

Ajouter le garde-fou :

```sql
do $garde$
begin
  if position('titulaire_nom' in
       pg_get_functiondef('public.admin_vue_globale()'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : l''administration ne voit pas le rattachement.';
  end if;
  -- La correction du MRR ne doit pas avoir été perdue à la recopie.
  if position('titulaire_id is null' in
       pg_get_functiondef('public.admin_vue_globale()'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : la recopie a perdu le filtre du MRR.';
  end if;
end;
$garde$;
```

- [ ] **Étape 5 : l'écran**

Dans l'écran localisé à l'étape 1, ajouter au type de la ligne :

```ts
  titulaire_id: string | null;
  titulaire_nom: string | null;
```

et, sous le nom du collecteur, quand `titulaire_nom` n'est pas nul :

```tsx
                {ligne.titulaire_nom && (
                  <span className="text-xs text-muted-foreground">
                    Collaborateur de {ligne.titulaire_nom}
                  </span>
                )}
```

Adapter les classes à celles de l'écran ; ne pas y introduire de style nouveau.

- [ ] **Étape 6 : relancer**

```
npm run db:reset
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/collaborateurs.test.ts supabase/tests/search-path.test.ts
npm test --workspace @kolek/admin
npx tsc -b apps/admin
npx oxlint apps/admin/src
```

Attendu : tout vert.

- [ ] **Étape 7 : commit**

```bash
git add supabase/migrations/20260902150000_admin_voit_le_rattachement.sql \
        supabase/tests/collaborateurs.test.ts apps/admin/src
git commit -m "feat(admin): un collaborateur apparait sous son titulaire"
```

---

## Vérification finale

À faire une seule fois, après la tâche 12.

- [ ] **La chaîne complète**

```
npm run verifier
```

Attendu : tout passe, **sauf** les six suites qui appellent des Edge Functions
par HTTP, plus les deux suites créées par ce plan (tâches 6 et 7). Sur cette
machine, le runtime Edge Functions local répond 500 à toute requête. Rapporter
ces suites comme **NON VÉRIFIÉES**, avec la liste exacte des fichiers, et ne pas
les présenter comme des régressions.

- [ ] **Le filet du `search_path`**

```
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/search-path.test.ts
```

Ce plan redéfinit sept fonctions `security definer`. C'est le contrôle qui dit
si l'une d'elles a perdu `pg_temp`.

- [ ] **L'isolation n'a pas bougé**

```
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/isolation.test.ts
```

Les six chemins croisés doivent rester rouges au sens du test — A ne lit pas les
données de B — **y compris entre un titulaire et son collaborateur**. C'est la
promesse centrale de cette conception : si un cas d'isolation est devenu vert par
élargissement, la conception a été trahie, pas améliorée.

- [ ] **La grille tarifaire n'a pas divergé**

```
npm run verifier:paliers
```

- [ ] **Ce qui reste à faire à la main**

Le déploiement. Les migrations de ce plan ne sont pas appliquées au projet
distant par le fait de les écrire ; `npx supabase db push` et le déploiement des
trois Edge Functions sont à lancer par l'humain, qui décide du moment.
