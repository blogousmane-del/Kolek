# Le tableau de bord Admin et ses vraies tendances — plan d'implémentation

> **Pour un agent :** COMPÉTENCE REQUISE — `superpowers:executing-plans` (ou
> `superpowers:subagent-driven-development`) pour exécuter ce plan tâche par
> tâche. Les étapes portent des cases à cocher.

**But :** donner au tableau de bord de Kolek · Admin des périodes et des
variations réelles, calculées en base à partir des mises et des retraits, qui
sont datés depuis le premier jour.

**Architecture :** une fonction SQL neuve, `admin_tendances(p_jours)`, rend en
un seul `jsonb` les flux de la période, ceux de la période précédente, une série
quotidienne, les zones, les mouvements de la période et les collecteurs qui
décrochent. `admin-vue-globale` la lit et ajoute **une clé** à sa réponse.
`admin_vue_globale()` n'est pas touchée. Le jugement — la variation, son signe,
ses cas impossibles — vit dans un module pur de `packages/core`, éprouvé sans
base.

**Pile :** PostgreSQL (Supabase), Deno Edge Functions, React 19, Vite 8,
Tailwind v4, Vitest 4, TypeScript.

**Conception :**
[`Docs/specs/2026-09-11-tableau-de-bord-tendances-design.md`](../specs/2026-09-11-tableau-de-bord-tendances-design.md).

## Contraintes pour toutes les tâches

- **Ne jamais afficher un chiffre qu'on ne sait pas** (Design System §2,
  principe 7). Sans période précédente, pas de pastille de tendance : une phrase
  factuelle.
- **`admin_vue_globale()` ne change ni de signature ni de corps.** Trois
  migrations passées la résolvent par `'public.admin_vue_globale()'::regprocedure`
  et `releve_du_jour()` l'appelle sans argument chaque soir à 23 h 55, en
  production. Ne pas la surcharger non plus : l'appel sans argument deviendrait
  ambigu.
- **Toute fonction `security definer` porte `set search_path = public, pg_temp`**,
  est révoquée de `public`, `anon` et `authenticated`, et n'est exécutable que
  par `service_role`. `supabase/tests/search-path.test.ts` et
  `definers_exposes` le vérifient.
- **Un jour est un jour d'Abidjan** : `(… at time zone 'Africa/Abidjan')::date`.
  Abidjan est à UTC+0 sans heure d'été.
- **La date qui fait foi pour une mise est `encaisse_le`**, l'heure du geste.
- **Les commissions se comptent sur `mises.est_commission` seul.**
  `retraits.commission` en est une recopie — mesuré en production le
  2026-09-11 : les 16 retraits concernés portent exactement le montant de la
  mise de commission de leur carte.
- **Périodes glissantes, de longueurs égales** : `p_jours` jours contre les
  `p_jours` précédents. Valeurs acceptées : **1, 7, 30**.
- **TDD, sans exception** : l'épreuve d'abord, vue rouge, puis le code.
- **`npm run verifier` doit rester vert** : quinze commandes, dont `test:db`.
- **Rien ne part en production sans accord explicite**, et chaque geste
  séparément : `db push` d'abord, poussée de `main` ensuite.
- **Les épreuves de base tournent sur la pile locale seulement**
  (`http://127.0.0.1:54321`). Ne jamais copier un `.env`.
- Sous PowerShell, appeler `& "C:\Program Files\nodejs\npx.cmd"`. Sous Git Bash,
  `npx.cmd` casse dès qu'un argument entre guillemets porte des espaces.

## Les fichiers, et ce dont chacun répond

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260911210000_admin_tendances.sql` | la fonction `admin_tendances(p_jours)`, ses droits, son bloc de garde |
| `supabase/tests/tendances.test.ts` | verrou, justesse, bornes, et la route |
| `supabase/functions/admin-vue-globale/index.ts` | lit `jours` et `partie`, ajoute la clé `tendances`, tolère l'absence de la fonction |
| `packages/core/src/tendances.ts` | la variation : signe, arrondi, cas impossibles. Pur, sans base |
| `packages/core/src/tendances.test.ts` | ses épreuves |
| `packages/core/src/index.ts` | l'export du module |
| `packages/ui/src/BarreEmpilee.tsx` | la pastille perd son chevron : elle n'ouvre rien |
| `packages/ui/src/BarreEmpilee.test.tsx` | à créer — aucune épreuve n'existe |
| `apps/admin/src/donnees.ts` | les types `Tendances`, et `chargerTendances(jours)` |
| `apps/admin/src/demo.ts` | des tendances fictives, sous le bandeau qui le dit |
| `apps/admin/src/ecrans/TableauDeBord.tsx` | le sélecteur, les quatre cartes, la courbe, la répartition, les zones, les mouvements, le décrochage |
| `apps/admin/src/ecrans/TableauDeBord.test.tsx` | réécrit : la phrase « vs période précédente » doit désormais apparaître, et seulement sur les cartes de flux |

---

### Tâche 1 : la base — `admin_tendances(p_jours)`

**Fichiers :**
- Créer : `supabase/migrations/20260911210000_admin_tendances.sql`
- Créer : `supabase/tests/tendances.test.ts`

**Interfaces :**
- Consomme : les tables `mises`, `retraits`, `cartes`, `clients`, `collecteurs`.
- Produit : `public.admin_tendances(p_jours integer default 7) returns jsonb`,
  exécutable par `service_role` seul. Clés rendues : `periode`, `depuis`,
  `flux`, `flux_precedent`, `serie`, `zones`, `mouvements`,
  `mouvements_total`, `collecteurs_sans_mise`.

- [ ] **Étape 1 : écrire les épreuves, avant la migration**

Créer `supabase/tests/tendances.test.ts` :

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Les tendances du tableau de bord.
 *
 * Deux choses comptent. **Le verrou** : la fonction rend les chiffres de toute
 * la plateforme, elle ne doit s'ouvrir à aucun navigateur. **La justesse des
 * bornes** : une mise d'hier ne doit pas tomber dans la journée d'aujourd'hui,
 * et une commission ne doit être comptée qu'une fois.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);

let collecteur: CollecteurTest;
let carte: string;

/** Le jour d'Abidjan — UTC+0, sans heure d'été. */
function jour(decalage: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
}

function exigerSucces(etiquette: string, erreur: { message: string } | null) {
  if (erreur) throw new Error(`Préparation « ${etiquette} » : ${erreur.message}`);
}

/** La mise de la carte d'essai. Le déclencheur refuse tout autre montant. */
const MISE = 1000;

/**
 * Une mise posée à midi, au jour voulu — midi évite tout effet de bord d'heure.
 *
 * Trois champs ne se posent pas ici : `mises_avant_insert` impose
 * `montant = cartes.mise` (sinon `MONTANT_INVALIDE`), décide lui-même
 * `est_commission` — vrai pour la première mise de la carte, quelle que soit sa
 * date — et réécrit `collecteur_id` depuis la carte. C'est l'ordre des
 * insertions qui fait la commission, pas leur jour.
 */
async function poserMise(decalage: number) {
  exigerSucces(
    `mise ${decalage}`,
    (
      await admin.from('mises').insert({
        id: crypto.randomUUID(),
        collecteur_id: collecteur.id,
        carte_id: carte,
        montant: MISE,
        encaisse_le: `${jour(decalage)}T12:00:00Z`,
      })
    ).error,
  );
}

beforeAll(async () => {
  collecteur = await creerCollecteur(`Tendances ${MARQUE}`, `+225075${MARQUE}`);

  const client = crypto.randomUUID();
  carte = crypto.randomUUID();
  exigerSucces(
    'client',
    (
      await admin
        .from('clients')
        .insert({ id: client, collecteur_id: collecteur.id, nom: `Client ${MARQUE}` })
    ).error,
  );
  exigerSucces(
    'carte',
    (
      await admin.from('cartes').insert({
        id: carte,
        collecteur_id: collecteur.id,
        client_id: client,
        mise: 1000,
      })
    ).error,
  );

  // Aujourd'hui : la première mise — que le serveur marque commission — puis
  // une seconde. Hier : rien, pour que le jour creux se voie dans la série.
  // Avant-hier : une troisième.
  await poserMise(0);
  await poserMise(0);
  await poserMise(-2);
});

afterAll(async () => {
  await nettoyer();
});

describe('le verrou', () => {
  it('refuse admin_tendances sans session', async () => {
    const { error } = await anonyme.rpc('admin_tendances', { p_jours: 7 });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|not exist|not find/i);
  });

  it('refuse admin_tendances à un collecteur authentifié', async () => {
    const { error } = await collecteur.client.rpc('admin_tendances', { p_jours: 7 });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied|not exist|not find/i);
  });
});

describe('les bornes', () => {
  it('refuse une période de zéro jour', async () => {
    const { error } = await admin.rpc('admin_tendances', { p_jours: 0 });
    expect(error?.message).toMatch(/PERIODE_INVALIDE/);
  });

  it('refuse une période au-delà de quatre-vingt-dix jours', async () => {
    const { error } = await admin.rpc('admin_tendances', { p_jours: 91 });
    expect(error?.message).toMatch(/PERIODE_INVALIDE/);
  });
});

describe('ce qu’elle compte', () => {
  it('range la journée sur encaisse_le, et sépare hier d’aujourd’hui', async () => {
    const { data, error } = await admin.rpc('admin_tendances', { p_jours: 1 });
    expect(error).toBeNull();

    const t = data as {
      periode: { jours: number; debut: string; fin: string };
      flux: { encaisse: number; commissions: number; mises: number };
    };
    expect(t.periode.jours).toBe(1);
    expect(t.periode.debut).toBe(jour(0));
    expect(t.periode.fin).toBe(jour(0));
    // Deux mises de 1 000 aujourd'hui, dont la commission ; celle
    // d'avant-hier n'y est pas.
    expect(t.flux.encaisse).toBeGreaterThanOrEqual(2 * MISE);
    expect(t.flux.commissions).toBeGreaterThanOrEqual(MISE);
    expect(t.flux.mises).toBeGreaterThanOrEqual(2);
  });

  it('compte la commission une seule fois, sur les mises', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 30 });
    const t = data as { flux: { encaisse: number; commissions: number } };

    // La commission est une mise : elle entre dans l'encaissé, et n'est pas
    // ajoutée une seconde fois depuis retraits.commission.
    expect(t.flux.encaisse).toBeGreaterThanOrEqual(t.flux.commissions);
  });

  it('porte les jours creux à zéro plutôt que de les sauter', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 7 });
    const t = data as { serie: Array<{ jour: string; encaisse: number }> };

    const hier = t.serie.find((p) => p.jour === jour(-1));
    expect(hier).toBeDefined();
    expect(hier?.encaisse).toBe(0);
  });

  it('rend une série continue, du plus ancien au plus récent', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 7 });
    const t = data as { serie: Array<{ jour: string }> };

    const jours = t.serie.map((p) => p.jour);
    expect(jours.length).toBeGreaterThan(1);
    expect([...jours].sort()).toEqual(jours);
    expect(jours[jours.length - 1]).toBe(jour(0));
  });

  it('rend la période précédente, de même longueur', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 1 });
    const t = data as {
      flux_precedent: { encaisse: number };
      periode: { debut: string };
    };
    // Hier : aucune mise posée par ce jeu d'essai.
    expect(typeof t.flux_precedent.encaisse).toBe('number');
    expect(t.periode.debut).toBe(jour(0));
  });

  it('dit depuis quand la base a des mises', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 7 });
    const t = data as { depuis: string | null };
    expect(t.depuis).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('borne les mouvements et dit leur nombre total', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 30 });
    const t = data as { mouvements: unknown[]; mouvements_total: number };

    expect(t.mouvements.length).toBeLessThanOrEqual(200);
    expect(t.mouvements_total).toBeGreaterThanOrEqual(t.mouvements.length);
  });

  it('liste les collecteurs actifs sans mise depuis sept jours', async () => {
    const { data } = await admin.rpc('admin_tendances', { p_jours: 7 });
    const t = data as {
      collecteurs_sans_mise: Array<{ id: string; derniere_mise: string | null; jours_sans: number }>;
    };

    // Celui du jeu d'essai a encaissé aujourd'hui : il n'y est pas.
    expect(t.collecteurs_sans_mise.some((c) => c.id === collecteur.id)).toBe(false);
    for (const c of t.collecteurs_sans_mise) {
      expect(c.jours_sans).toBeGreaterThan(7);
    }
  });
});
```

- [ ] **Étape 2 : voir les épreuves rouges**

```bash
npm run db:reset && npm run test:db -- tendances
```

Attendu : les épreuves du verrou passent déjà — une fonction absente est refusée
elle aussi, et c'est à noter dans les écarts —, toutes les autres tombent sur
`function public.admin_tendances(p_jours => integer) does not exist`.

- [ ] **Étape 3 : écrire la migration**

Créer `supabase/migrations/20260911210000_admin_tendances.sql` :

```sql
-- Les tendances du tableau de bord Admin.
--
-- ## Pourquoi une fonction neuve, et pas un paramètre sur admin_vue_globale()
--
-- Trois migrations passées (20260901090000, 20260902140000, 20260902150000)
-- résolvent `'public.admin_vue_globale()'::regprocedure` dans leur bloc de
-- garde : une signature à un argument ne s'y résout plus, et `db reset`
-- tomberait — donc le job « Base » du CI. Surcharger le même nom rendrait
-- l'appel sans argument ambigu, et `releve_du_jour()` l'appelle ainsi chaque
-- soir à 23 h 55, en production.
--
-- ## Ce que cette fonction refuse de faire
--
-- Compter deux fois une commission. `retraits.commission` recopie le montant
-- de la mise de commission de la carte : mesuré en production le 2026-09-11,
-- les 16 retraits concernés portaient exactement ce montant. Les commissions
-- se comptent donc sur `mises.est_commission`, comme le fait déjà
-- `admin_vue_globale()`.
--
-- Sauter un jour sans mise. Une série qui saute les jours creux comprime le
-- temps et invente une régularité : `generate_series` les pose à zéro.
--
-- Deviner une période. En dehors de 1 à 90 jours, elle lève plutôt que de
-- replier sur une valeur par défaut.

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
begin
  if p_jours is null or p_jours < 1 or p_jours > 90 then
    raise exception 'PERIODE_INVALIDE : p_jours doit tenir entre 1 et 90, reçu %.', p_jours
      using errcode = '22023';
  end if;

  v_fin             := (now() at time zone 'Africa/Abidjan')::date;
  v_debut           := v_fin - (p_jours - 1);
  v_debut_precedent := v_debut - p_jours;

  select min((encaisse_le at time zone 'Africa/Abidjan')::date) into v_depuis from public.mises;
  -- Quatre-vingt-dix jours de fond de courbe, jamais avant la première mise.
  v_debut_serie := greatest(coalesce(v_depuis, v_fin), v_fin - 89);

  return (
    with mises_jour as (
      select
        (m.encaisse_le at time zone 'Africa/Abidjan')::date            as jour,
        m.collecteur_id,
        m.montant,
        m.est_commission
      from public.mises m
    ),
    retraits_jour as (
      select
        (r.effectue_le at time zone 'Africa/Abidjan')::date            as jour,
        r.collecteur_id,
        r.montant_restitue
      from public.retraits r
    ),
    flux as (
      select
        coalesce(sum(montant), 0)                                      as encaisse,
        coalesce(sum(montant) filter (where est_commission), 0)        as commissions,
        count(*)                                                       as mises
      from mises_jour
      where jour between v_debut and v_fin
    ),
    flux_retraits as (
      select coalesce(sum(montant_restitue), 0) as restitutions, count(*) as retraits
      from retraits_jour
      where jour between v_debut and v_fin
    ),
    flux_p as (
      select
        coalesce(sum(montant), 0)                                      as encaisse,
        coalesce(sum(montant) filter (where est_commission), 0)        as commissions,
        count(*)                                                       as mises
      from mises_jour
      where jour between v_debut_precedent and v_debut - 1
    ),
    flux_p_retraits as (
      select coalesce(sum(montant_restitue), 0) as restitutions, count(*) as retraits
      from retraits_jour
      where jour between v_debut_precedent and v_debut - 1
    ),
    -- Un point par jour, jours creux compris.
    serie as (
      select
        j::date                                                        as jour,
        coalesce(sum(m.montant), 0)                                    as encaisse,
        coalesce(sum(m.montant) filter (where m.est_commission), 0)    as commissions,
        coalesce(count(m.*), 0)                                        as mises,
        coalesce((
          select sum(r.montant_restitue) from retraits_jour r where r.jour = j::date
        ), 0)                                                          as restitutions
      from generate_series(v_debut_serie, v_fin, interval '1 day') as j
      left join mises_jour m on m.jour = j::date
      group by j
    ),
    zones as (
      select
        coalesce(c.zone, 'Sans zone')                                  as zone,
        coalesce(sum(m.montant), 0)                                    as encaisse,
        count(m.*)                                                     as mises,
        count(distinct c.id)                                           as collecteurs
      from public.collecteurs c
      left join mises_jour m
        on m.collecteur_id = c.id and m.jour between v_debut and v_fin
      group by coalesce(c.zone, 'Sans zone')
    ),
    mouvements as (
      select
        case when m.est_commission then 'commission' else 'mise' end   as type,
        cl.nom                                                         as client,
        col.id                                                         as collecteur_id,
        col.nom                                                        as collecteur,
        m.montant                                                      as montant,
        m.encaisse_le                                                  as survenu_le
      from public.mises m
      join public.cartes      ca  on ca.id  = m.carte_id
      join public.clients     cl  on cl.id  = ca.client_id
      join public.collecteurs col on col.id = m.collecteur_id
      where (m.encaisse_le at time zone 'Africa/Abidjan')::date between v_debut and v_fin
      union all
      select
        'restitution',
        cl.nom,
        col.id,
        col.nom,
        -r.montant_restitue,
        r.effectue_le
      from public.retraits r
      join public.cartes      ca  on ca.id  = r.carte_id
      join public.clients     cl  on cl.id  = ca.client_id
      join public.collecteurs col on col.id = r.collecteur_id
      where (r.effectue_le at time zone 'Africa/Abidjan')::date between v_debut and v_fin
    ),
    derniere_mise as (
      select collecteur_id, max((encaisse_le at time zone 'Africa/Abidjan')::date) as jour
      from public.mises
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

      'mouvements_total', (select count(*) from mouvements),

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
        from (select * from mouvements order by survenu_le desc limit 200) borne
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
        left join derniere_mise d on d.collecteur_id = c.id
        where c.abonnement_statut = 'actif'
          and (d.jour is null or d.jour < v_fin - 7)
      ), '[]'::jsonb)
    )
  );
end;
$fn$;

alter function public.admin_tendances(integer) owner to postgres;

comment on function public.admin_tendances(integer) is
  'Flux datés du tableau de bord Admin : période glissante, période précédente, série quotidienne, zones, mouvements bornés à 200, collecteurs sans mise. Réservée à service_role ; est_admin() est contrôlé dans l''Edge Function appelante.';

revoke all on function public.admin_tendances(integer) from public;
revoke all on function public.admin_tendances(integer) from anon;
revoke all on function public.admin_tendances(integer) from authenticated;
grant execute on function public.admin_tendances(integer) to service_role;

do $garde$
declare
  ouverte boolean;
begin
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

  -- La fonction partagée doit rester résoluble par sa signature sans argument :
  -- c'est ainsi que trois migrations passées la contrôlent, et que le relevé de
  -- 23 h 55 l'appelle.
  perform 'public.admin_vue_globale()'::regprocedure;
end
$garde$;
```

- [ ] **Étape 4 : voir les épreuves vertes**

```bash
npm run db:reset && npm run test:db -- tendances
```

Attendu : les treize épreuves du fichier passent.

- [ ] **Étape 5 : commit**

```bash
git add supabase/migrations/20260911210000_admin_tendances.sql supabase/tests/tendances.test.ts
git commit -m "feat(base): les tendances datees du tableau de bord, periode par periode"
```

---

### Tâche 2 : la route rend les tendances, et survit à leur absence

**Fichiers :**
- Modifier : `supabase/functions/admin-vue-globale/index.ts`
- Modifier : `supabase/tests/tendances.test.ts` (un `describe` de plus)

**Interfaces :**
- Consomme : `public.admin_tendances(p_jours integer)` de la tâche 1.
- Produit : la réponse de `admin-vue-globale` gagne la clé `tendances`
  (`null` en cas d'échec). Paramètres lus dans la chaîne de requête **et** dans
  le corps : `jours` (1, 7 ou 30 ; 7 par défaut) et `partie` (`tendances` pour
  ne rendre que cette clé). Une valeur hors liste rend `400 PERIODE_INVALIDE`.

- [ ] **Étape 1 : écrire les épreuves de la route**

Ajouter à la fin de `supabase/tests/tendances.test.ts` :

```ts
describe('la route', () => {
  const URL_FONCTION = `${process.env.SUPABASE_URL}/functions/v1/admin-vue-globale`;

  async function appeler(suffixe: string): Promise<{ statut: number; corps: any }> {
    const reponse = await fetch(`${URL_FONCTION}${suffixe}`, {
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${jetonAdmin}`,
      },
    });
    return { statut: reponse.status, corps: await reponse.json() };
  }

  it('ajoute la clé tendances sans toucher aux clés existantes', async () => {
    const { statut, corps } = await appeler('');
    expect(statut).toBe(200);
    for (const cle of ['totaux', 'zones', 'mouvements', 'collecteurs', 'tendances']) {
      expect(corps).toHaveProperty(cle);
    }
    expect(corps.tendances.periode.jours).toBe(7);
  });

  it('rend la période demandée', async () => {
    const { corps } = await appeler('?jours=1');
    expect(corps.tendances.periode.jours).toBe(1);
  });

  it('ne rend que les tendances quand on ne demande qu’elles', async () => {
    const { corps } = await appeler('?partie=tendances&jours=30');
    expect(corps.tendances.periode.jours).toBe(30);
    expect(corps.totaux).toBeUndefined();
  });

  it('refuse une période hors liste, sans repli silencieux', async () => {
    const { statut, corps } = await appeler('?jours=3');
    expect(statut).toBe(400);
    expect(corps.erreur).toBe('PERIODE_INVALIDE');
  });
});
```

Poser le jeton d'administration en tête du fichier, à côté des autres
déclarations :

```ts
let jetonAdmin: string;
```

et, dans le `beforeAll`, après la création du collecteur :

```ts
// Un compte administrateur, pour appeler la route sous une vraie identité :
// le portillon interroge `est_admin()` avec le jeton de l'appelant.
// `creerCollecteur` rend un client déjà connecté, d'où la session lisible
// juste après. Le niveau vaut « admin » ou « super », et rien d'autre :
// `admins_niveau_check` refuse toute autre valeur.
const patron = await creerCollecteur(`Patron ${MARQUE}`, `+225076${MARQUE}`);
exigerSucces(
  'droit admin',
  (await admin.from('admins').insert({ user_id: patron.id, niveau: 'admin' })).error,
);
const { data: session, error: erreurSession } = await patron.client.auth.getSession();
exigerSucces('session du patron', erreurSession);
jetonAdmin = session.session!.access_token;
```

- [ ] **Étape 2 : voir les épreuves rouges**

```bash
npm run test:db -- tendances
```

Attendu : les quatre épreuves de la route tombent — `tendances` est absent de la
réponse, et `?jours=3` rend 200 au lieu de 400.

- [ ] **Étape 3 : lire les paramètres et appeler la fonction**

Dans `supabase/functions/admin-vue-globale/index.ts`, après le contrôle de
méthode `GET` (qui devient `GET` ou `POST`, `functions.invoke` ne sachant pas
construire de chaîne de requête) :

```ts
  if (requete.method !== 'GET' && requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }
```

puis, juste avant la sortie de la clé de service :

```ts
  // Deux formes pour le même paramètre : `functions.invoke` pose un corps JSON
  // et ne sait pas construire de chaîne de requête ; la chaîne reste la forme
  // lisible dans un journal ou une commande `curl`. Même montage que
  // `super-admin-journal`.
  const parametres = new URL(requete.url).searchParams;
  let corpsRecu: Record<string, unknown> = {};
  if (requete.method === 'POST') {
    try {
      corpsRecu = ((await requete.json()) ?? {}) as Record<string, unknown>;
    } catch {
      // Un POST sans corps est une demande par défaut, pas une erreur.
    }
  }
  const lire = (cle: string): string | null => {
    const duCorps = corpsRecu[cle];
    if (duCorps !== undefined && duCorps !== null) return String(duCorps);
    return parametres.get(cle);
  };

  // Trois valeurs, et rien d'autre. Un repli silencieux sur sept jours ferait
  // afficher une période que personne n'a demandée.
  const PERIODES = [1, 7, 30];
  const demande = lire('jours');
  const jours = demande === null ? 7 : Number(demande);
  if (!PERIODES.includes(jours)) {
    return reponse({ erreur: 'PERIODE_INVALIDE' }, 400, requete);
  }
  const tendancesSeules = lire('partie') === 'tendances';
```

Toujours dans le même fichier, après l'appel à `admin_vue_globale` — ou avant
lui quand seules les tendances sont demandées :

```ts
  // Un échec ici ne prive pas l'administration de son tableau de bord : les
  // tendances sont une clé de plus, pas le cœur de l'écran. `null` voyage
  // jusqu'à l'écran, qui dit « tendances indisponibles » plutôt que d'afficher
  // des zéros qui se liraient « aucune activité ».
  let tendances: unknown = null;
  const lues = await clientService.rpc('admin_tendances', { p_jours: jours });
  if (lues.error) {
    console.error('admin_tendances a échoué :', lues.error.message);
  } else {
    tendances = lues.data;
  }

  if (tendancesSeules) {
    return reponse({ tendances }, 200, requete);
  }
```

La sortie finale devient :

```ts
  return reponse({ ...brut, genereLe: brut.genere_le, abonnements, paiements, tendances }, 200, requete);
```

Mettre à jour le commentaire d'en-tête du fichier : la fonction rend désormais
les agrégats **et** les flux datés de la période demandée.

- [ ] **Étape 4 : redémarrer le runtime, puis voir vert**

Le runtime local ne recharge pas les fonctions tout seul.

```bash
docker restart supabase_edge_runtime_Kolek && npm run test:db -- tendances
```

Attendu : les dix-sept épreuves du fichier passent.

- [ ] **Étape 5 : prouver la tolérance à la main**

```bash
npx supabase db query "revoke execute on function public.admin_tendances(integer) from service_role;"
npm run test:db -- tendances
npx supabase db query "grant execute on function public.admin_tendances(integer) to service_role;"
```

Attendu : seules les épreuves de la clé `tendances` tombent, jamais celles des
clés existantes — la route répond 200 avec `tendances: null`. À consigner dans
les écarts. Puis, droit rétabli, tout repasse au vert.

- [ ] **Étape 6 : commit**

```bash
git add supabase/functions/admin-vue-globale/index.ts supabase/tests/tendances.test.ts
git commit -m "feat(admin): la route rend les tendances de la periode, et survit a leur absence"
```

---

### Tâche 3 : juger la variation — un module pur dans `@kolek/core`

**Fichiers :**
- Créer : `packages/core/src/tendances.ts`
- Créer : `packages/core/src/tendances.test.ts`
- Modifier : `packages/core/src/index.ts`

**Interfaces :**
- Consomme : rien. Le module est pur, sans base et sans React.
- Produit : `FluxPeriode`, `Variation`, et
  `variation(actuel: number, precedent: number): Variation | null`.
  `null` signifie « pas de comparaison possible » — l'écran retire alors sa
  pastille.

- [ ] **Étape 1 : écrire les épreuves**

Créer `packages/core/src/tendances.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { variation } from './tendances';

const INSECABLE = String.fromCharCode(160);

describe('variation', () => {
  it('rend une hausse en pourcentage entier', () => {
    expect(variation(114, 100)).toEqual({
      pourcentage: 14,
      positive: true,
      libelle: `+14${INSECABLE}%`,
    });
  });

  it('rend une baisse, signe compris', () => {
    expect(variation(80, 100)).toEqual({
      pourcentage: -20,
      positive: false,
      libelle: `-20${INSECABLE}%`,
    });
  });

  it('arrondit à l’entier le plus proche', () => {
    expect(variation(1006, 1000)?.libelle).toBe(`+1${INSECABLE}%`);
    expect(variation(1004, 1000)?.libelle).toBe(`0${INSECABLE}%`);
  });

  it('traite l’égalité comme une variation nulle, pas comme une hausse', () => {
    const v = variation(500, 500);
    expect(v?.pourcentage).toBe(0);
    expect(v?.libelle).toBe(`0${INSECABLE}%`);
    expect(v?.positive).toBe(true);
  });

  it('ne compare rien à une période précédente vide', () => {
    // Passer de 0 à 5 000 n'est pas « +100 % » : c'est une première fois, et
    // aucun pourcentage ne la décrit. L'écran dira la phrase, pas la pastille.
    expect(variation(5000, 0)).toBeNull();
  });

  it('ne compare rien quand les deux périodes sont vides', () => {
    expect(variation(0, 0)).toBeNull();
  });

  it('refuse une période précédente négative, qui n’a pas de sens', () => {
    expect(variation(100, -50)).toBeNull();
  });

  it('rend une baisse totale quand la période courante est vide', () => {
    expect(variation(0, 400)).toEqual({
      pourcentage: -100,
      positive: false,
      libelle: `-100${INSECABLE}%`,
    });
  });

  it('borne l’affichage des hausses démesurées', () => {
    // Une hausse de 1 200 % sur une pastille de 60 px ne se lit pas, et le
    // chiffre exact n'apprend rien de plus que « beaucoup ».
    expect(variation(130_000, 1_000)?.libelle).toBe(`+999${INSECABLE}%`);
    expect(variation(130_000, 1_000)?.pourcentage).toBe(12_900);
  });
});
```

- [ ] **Étape 2 : voir rouge**

```bash
npm test -w @kolek/core -- tendances
```

Attendu : `Failed to resolve import "./tendances"`.

- [ ] **Étape 3 : écrire le module**

Créer `packages/core/src/tendances.ts` :

```ts
/**
 * La variation d'une période à la précédente.
 *
 * La base mesure, ce module juge, l'écran affiche — même partage qu'au chantier
 * de la santé du système. Le jugement vit ici parce qu'il n'autorise rien : une
 * fonction pure se prouve cas par cas, sans base et sans navigateur.
 *
 * ## Ce que ce module refuse de faire
 *
 * Comparer à rien. Une période précédente vide ne donne pas « +100 % » : elle
 * ne donne aucun pourcentage. `null` remonte alors jusqu'à l'écran, qui retire
 * sa pastille et écrit une phrase — Design System §2, principe 7.
 */

/**
 * L'insécable est construite par son code, jamais tapée.
 *
 * Écrite en séquence d'échappement, elle arrive dans le fichier comme le
 * caractère lui-même : invisible, et impossible à distinguer d'une espace
 * ordinaire à la relecture. Constaté le 2026-09-11 sur huit lignes du chantier
 * précédent.
 */
const INSECABLE = String.fromCharCode(160);

/** Ce que la base rend pour une période. */
export interface FluxPeriode {
  encaisse: number;
  commissions: number;
  restitutions: number;
  mises: number;
  retraits: number;
}

export interface Variation {
  /** La variation réelle, non bornée : c'est elle qu'on relit dans un journal. */
  pourcentage: number;
  positive: boolean;
  /** Ce que la pastille affiche, borné à trois chiffres. */
  libelle: string;
}

/**
 * `null` quand la comparaison n'a pas de sens : période précédente vide,
 * négative, ou absente.
 */
export function variation(actuel: number, precedent: number): Variation | null {
  if (!Number.isFinite(actuel) || !Number.isFinite(precedent)) return null;
  if (precedent <= 0) return null;

  const pourcentage = Math.round(((actuel - precedent) / precedent) * 100);
  const positive = pourcentage >= 0;
  // Au-delà de 999 %, le chiffre exact n'apprend rien de plus que « beaucoup »,
  // et il déborde de la pastille.
  const affiche = Math.min(Math.abs(pourcentage), 999);
  const signe = pourcentage > 0 ? '+' : pourcentage < 0 ? '-' : '';

  return { pourcentage, positive, libelle: `${signe}${affiche}${INSECABLE}%` };
}
```

Ajouter l'export dans `packages/core/src/index.ts`, après la ligne de `sante` :

```ts
export * from './tendances';
```

- [ ] **Étape 4 : voir vert, et vérifier qu'aucune insécable n'a été tapée**

```bash
npm test -w @kolek/core -- tendances && npm run typecheck -w @kolek/core
node -e "for (const f of ['packages/core/src/tendances.ts','packages/core/src/tendances.test.ts']) { const s=require('fs').readFileSync(f,'utf8'); console.log(f, 'insecables litterales', s.split(String.fromCharCode(160)).length-1) }"
```

Attendu : neuf épreuves vertes, `tsc` sans erreur, et **zéro** insécable
littérale dans les deux fichiers — elles ne doivent exister qu'à l'exécution,
par `String.fromCharCode(160)`.

- [ ] **Étape 5 : commit**

```bash
git add packages/core/src/tendances.ts packages/core/src/tendances.test.ts packages/core/src/index.ts
git commit -m "feat(core): la variation d'une periode a la precedente, et ses cas impossibles"
```

---

### Tâche 4 : la barre de répartition perd son chevron

**Fichiers :**
- Modifier : `packages/ui/src/BarreEmpilee.tsx`
- Créer : `packages/ui/src/BarreEmpilee.test.tsx`

**Interfaces :**
- Consomme : rien de neuf.
- Produit : `BarreEmpilee` garde ses propriétés (`titre`, `total`, `periode`,
  `parts`) et ne rend plus d'icône. Deux écrans l'utilisent : le tableau de bord
  et la fiche d'un collecteur.

- [ ] **Étape 1 : écrire les épreuves**

Créer `packages/ui/src/BarreEmpilee.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BarreEmpilee } from './BarreEmpilee';

/**
 * Une pastille à chevron promet un menu. Celle-ci n'en ouvrait aucun : elle
 * affiche une période, et le chevron faisait d'un libellé un faux bouton —
 * Design System §7, « un bouton qui n'écrit rien mais laisse croire le
 * contraire ».
 */

afterEach(cleanup);

const PARTS = [
  { libelle: 'Encaissements', pourcentage: 60, couleur: 'bg-chart-mint', valeur: '600' },
  { libelle: 'Commissions', pourcentage: 40, couleur: 'bg-chart-slate', valeur: '400' },
];

describe('BarreEmpilee', () => {
  it('affiche la période telle qu’on la lui donne', () => {
    render(<BarreEmpilee titre="Répartition" total="1 000" periode="7 derniers jours" parts={PARTS} />);

    expect(screen.getByText('7 derniers jours')).toBeDefined();
  });

  it('ne promet aucun menu : pas d’icône dans l’en-tête', () => {
    const { container } = render(
      <BarreEmpilee titre="Répartition" total="1 000" periode="7 derniers jours" parts={PARTS} />,
    );

    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('donne à chaque part sa valeur et son pourcentage', () => {
    render(<BarreEmpilee titre="Répartition" total="1 000" periode="Aujourd’hui" parts={PARTS} />);

    expect(screen.getByText('Encaissements')).toBeDefined();
    expect(screen.getByText('60 %')).toBeDefined();
  });
});
```

- [ ] **Étape 2 : voir rouge**

```bash
npm test -w @kolek/ui -- BarreEmpilee
```

Attendu : la deuxième épreuve tombe — `expected 1 to be 0`, le chevron est
encore là. Les deux autres passent déjà : elles gardent l'existant.

- [ ] **Étape 3 : retirer le chevron**

Dans `packages/ui/src/BarreEmpilee.tsx`, remplacer l'encart de période :

```tsx
        <div className="flex items-center gap-1 border border-hairline rounded-pill px-3 py-1.5 flex-shrink-0">
          <span className="text-sm font-body font-medium text-ink whitespace-nowrap">
            {periode}
          </span>
          <Icone nom="chevron-down" taille={13} className="text-muted-foreground" />
        </div>
```

par :

```tsx
        {/* Un libellé, pas un bouton. Le chevron d'origine promettait un menu
            que ce composant n'a jamais ouvert ; la période se choisit
            maintenant en tête d'écran, une seule fois. */}
        <div className="border border-hairline rounded-pill px-3 py-1.5 flex-shrink-0">
          <span className="text-sm font-body font-medium text-ink whitespace-nowrap">
            {periode}
          </span>
        </div>
```

Retirer l'import devenu inutile en tête du fichier :

```tsx
import { Icone } from './Icone';
```

- [ ] **Étape 4 : voir vert**

```bash
npm test -w @kolek/ui -- BarreEmpilee && npm run typecheck -w @kolek/ui
```

Attendu : trois épreuves vertes, `tsc` sans erreur — l'import retiré ne doit
plus être référencé.

- [ ] **Étape 5 : commit**

```bash
git add packages/ui/src/BarreEmpilee.tsx packages/ui/src/BarreEmpilee.test.tsx
git commit -m "fix(ui): la pastille de periode ne promet plus un menu qui n'existe pas"
```

---

### Tâche 5 : l'écran — le sélecteur et les quatre cartes

**Fichiers :**
- Modifier : `apps/admin/src/donnees.ts`
- Modifier : `apps/admin/src/demo.ts`
- Modifier : `apps/admin/src/ecrans/TableauDeBord.tsx`
- Modifier : `apps/admin/src/ecrans/TableauDeBord.test.tsx`

**Interfaces :**
- Consomme : `variation()` et `FluxPeriode` de `@kolek/core` (tâche 3) ; la clé
  `tendances` de la route (tâche 2).
- Produit : les types `Tendances`, `PointSerieJour`, `ZonePeriode`,
  `CollecteurSansMise` et `Periode = 1 | 7 | 30` dans `apps/admin/src/donnees.ts` ;
  `chargerTendances(jours: Periode): Promise<Tendances>` ; et la propriété
  `charger` de `TableauDeBord`, qui vaut `chargerTendances` par défaut et que
  les épreuves remplacent.

- [ ] **Étape 1 : poser les types et le chargement**

Dans `apps/admin/src/donnees.ts`, à côté des autres interfaces :

```ts
export type Periode = 1 | 7 | 30;

export interface PointSerieJour {
  jour: string;
  encaisse: number;
  commissions: number;
  restitutions: number;
  mises: number;
}

export interface ZonePeriode {
  zone: string;
  encaisse: number;
  mises: number;
  collecteurs: number;
}

export interface CollecteurSansMise {
  id: string;
  nom: string;
  zone: string | null;
  derniere_mise: string | null;
  jours_sans: number;
}

/** Ce que `admin_tendances(p_jours)` rend, tel quel. */
export interface Tendances {
  periode: { jours: Periode; debut: string; fin: string };
  /** Jour de la première mise en base. `null` si la base n'en a aucune. */
  depuis: string | null;
  flux: FluxPeriode;
  flux_precedent: FluxPeriode;
  serie: PointSerieJour[];
  zones: ZonePeriode[];
  mouvements: Mouvement[];
  mouvements_total: number;
  collecteurs_sans_mise: CollecteurSansMise[];
}
```

Importer le type partagé en tête du fichier :

```ts
import type { FluxPeriode } from '@kolek/core';
```

Ajouter la clé à `VueGlobale`, après `paiements` :

```ts
  /** `null` quand `admin_tendances` a échoué : l'écran le dit, et garde le
      reste. Absent d'une réponse ancienne, d'où le point d'interrogation. */
  tendances?: Tendances | null;
```

Et la fonction de chargement, à côté de `chargerVueGlobale` :

```ts
/**
 * Le code d'erreur que l'Edge Function a posé dans le corps de sa réponse.
 *
 * `chargerVueGlobale` le lisait en ligne. Deux fonctions appellent maintenant
 * la même route : recopier cette lecture en ferait deux versions à corriger le
 * jour où la forme change. Elle est donc extraite ici, et `chargerVueGlobale`
 * l'appelle à son tour — son bloc `try` en ligne disparaît.
 */
async function codeErreur(error: unknown): Promise<string | undefined> {
  try {
    const contexte = (error as { context?: Response }).context;
    if (contexte && typeof contexte.json === 'function') {
      return ((await contexte.json()) as { erreur?: string }).erreur;
    }
  } catch {
    // Corps illisible : l'appelant garde son message générique.
  }
  return undefined;
}

/**
 * Les seules tendances, pour un changement de période.
 *
 * `partie=tendances` évite de retélécharger cinq cents cartes et toute la liste
 * des collecteurs pour recalculer un total. Le corps plutôt que la chaîne de
 * requête : `functions.invoke` ne sait pas construire la seconde, et la route
 * lit les deux.
 */
export async function chargerTendances(jours: Periode): Promise<Tendances> {
  const { data, error } = await supabase.functions.invoke('admin-vue-globale', {
    body: { jours, partie: 'tendances' },
  });

  if (error) {
    const code = await codeErreur(error);
    throw new Error(code ? (MESSAGES[code] ?? code) : error.message);
  }

  const tendances = (data as { tendances: Tendances | null }).tendances;
  if (!tendances) throw new Error('La base n’a pas rendu les tendances.');
  return tendances;
}
```

Et, dans la table `MESSAGES` du même fichier — elle existe déjà, vers la ligne
131, et sert à `chargerVueGlobale` —, une entrée de plus pour le refus de la
route :

```ts
  PERIODE_INVALIDE: 'Cette période n’est pas proposée.',
```

> Remplacer aussi le bloc `try` en ligne de `chargerVueGlobale` par un appel à
> `codeErreur` : sa logique est exactement celle qui vient d'être extraite. Les
> épreuves existantes de l'admin doivent rester vertes après ce déplacement.

- [ ] **Étape 2 : écrire les épreuves de l'écran**

Dans `apps/admin/src/ecrans/TableauDeBord.test.tsx`, ajouter le jeu d'essai des
tendances sous la constante `VUE`, puis les épreuves. **Le commentaire d'en-tête
du fichier doit être réécrit** : la phrase « vs période précédente » n'est plus
interdite, elle est attendue sur les cartes de flux et interdite sur les cartes
de stock.

```tsx
import type { Tendances } from '../donnees';

const jourISO = (decalage: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
};

const TENDANCES: Tendances = {
  periode: { jours: 7, debut: jourISO(-6), fin: jourISO(0) },
  depuis: jourISO(-20),
  flux: { encaisse: 1_140_000, commissions: 114_000, restitutions: 90_000, mises: 228, retraits: 3 },
  flux_precedent: {
    encaisse: 1_000_000,
    commissions: 100_000,
    restitutions: 80_000,
    mises: 200,
    retraits: 2,
  },
  serie: [
    { jour: jourISO(-2), encaisse: 300_000, commissions: 30_000, restitutions: 0, mises: 60 },
    { jour: jourISO(-1), encaisse: 0, commissions: 0, restitutions: 0, mises: 0 },
    { jour: jourISO(0), encaisse: 400_000, commissions: 40_000, restitutions: 90_000, mises: 80 },
  ],
  zones: [{ zone: 'Cocody', encaisse: 700_000, mises: 140, collecteurs: 2 }],
  mouvements: [
    {
      type: 'mise',
      client: 'Koffi Amenan',
      collecteur_id: 'c-1',
      collecteur: 'Kouassi',
      montant: 5000,
      survenu_le: recent,
    },
  ],
  mouvements_total: 228,
  collecteurs_sans_mise: [
    { id: 'c-9', nom: 'Yao Adjoua', zone: 'Yopougon', derniere_mise: jourISO(-12), jours_sans: 12 },
  ],
};

const TENDANCES_30: Tendances = {
  ...TENDANCES,
  periode: { jours: 30, debut: jourISO(-29), fin: jourISO(0) },
  flux: { ...TENDANCES.flux, encaisse: 4_000_000 },
  flux_precedent: { ...TENDANCES.flux_precedent, encaisse: 5_000_000 },
};

function rendreAvecTendances(charger = async () => TENDANCES_30) {
  return render(
    <TableauDeBord
      vue={{ ...VUE, tendances: TENDANCES }}
      onNaviguer={() => {}}
      onRecharger={() => {}}
      charger={charger}
    />,
  );
}
```

Les épreuves :

```tsx
describe('TableauDeBord — les tendances', () => {
  it('affiche l’encaissé de la période et sa variation', () => {
    rendreAvecTendances();

    expect(screen.getByText(montantAffiche(1_140_000))).toBeTruthy();
    // +14 % : 1 140 000 contre 1 000 000. L'insécable du libellé est
    // normalisée par Testing Library, la chaîne cherchée porte une espace.
    expect(screen.getByText('+14 %')).toBeTruthy();
    expect(screen.getAllByText('vs période précédente').length).toBe(2);
  });

  it('ne met aucune tendance sur un stock', () => {
    rendreAvecTendances();

    // L'encours est un stock : il n'a pas de période précédente, et sa carte
    // porte une phrase, pas une pastille.
    expect(screen.getByText('Dû aux clients, à l’instant')).toBeTruthy();
  });

  it('retire la pastille quand la période précédente est vide', () => {
    const sansPasse: Tendances = {
      ...TENDANCES,
      flux_precedent: { encaisse: 0, commissions: 0, restitutions: 0, mises: 0, retraits: 0 },
    };
    render(
      <TableauDeBord
        vue={{ ...VUE, tendances: sansPasse }}
        onNaviguer={() => {}}
        onRecharger={() => {}}
        charger={async () => sansPasse}
      />,
    );

    expect(screen.queryByText('vs période précédente')).toBeNull();
    expect(screen.getByText(/pas de comparaison/i)).toBeTruthy();
  });

  it('change de période et recharge les seules tendances', async () => {
    const appels: number[] = [];
    rendreAvecTendances(async (jours: 1 | 7 | 30) => {
      appels.push(jours);
      return TENDANCES_30;
    });

    fireEvent.click(screen.getByRole('button', { name: '30 j' }));

    await screen.findByText(montantAffiche(4_000_000));
    expect(appels).toEqual([30]);
    // La baisse : 4 000 000 contre 5 000 000.
    expect(screen.getByText('-20 %')).toBeTruthy();
  });

  it('garde les stocks immobiles quand la période change', async () => {
    rendreAvecTendances();

    fireEvent.click(screen.getByRole('button', { name: '30 j' }));
    await screen.findByText(montantAffiche(4_000_000));

    // L'encours vient de `totaux`, pas de la période.
    expect(screen.getByText(montantAffiche(1_234_000))).toBeTruthy();
  });

  it('dit quand les tendances manquent, sans afficher de zéros', () => {
    render(
      <TableauDeBord
        vue={{ ...VUE, tendances: null }}
        onNaviguer={() => {}}
        onRecharger={() => {}}
        charger={async () => TENDANCES}
      />,
    );

    expect(screen.getByText(/tendances indisponibles/i)).toBeTruthy();
    // Le reste de l'écran vit : le cumul depuis l'ouverture est là.
    expect(screen.getByText(montantAffiche(7_654_000))).toBeTruthy();
  });
});
```

- [ ] **Étape 3 : voir rouge**

```bash
npm test -w @kolek/admin -- TableauDeBord
```

Attendu : les six épreuves neuves tombent — `charger` n'est pas une propriété
connue, et aucune pastille n'existe.

- [ ] **Étape 4 : écrire le sélecteur et les cartes**

Dans `apps/admin/src/ecrans/TableauDeBord.tsx` :

```tsx
import { formatMontant, variation } from '@kolek/core';
import type { Periode, Tendances } from '../donnees';
import { chargerTendances } from '../donnees';

const PERIODES: { cle: Periode; libelle: string; phrase: string }[] = [
  { cle: 1, libelle: "Aujourd'hui", phrase: "aujourd'hui" },
  { cle: 7, libelle: '7 j', phrase: '7 derniers jours' },
  { cle: 30, libelle: '30 j', phrase: '30 derniers jours' },
];
```

La signature gagne une propriété, injectable par les épreuves :

```tsx
export function TableauDeBord({
  vue,
  onNaviguer,
  onRecharger,
  /** Remplacée dans les épreuves. Par défaut, la vraie route. */
  charger = chargerTendances,
}: {
  vue: VueGlobale;
  onNaviguer: (cle: CleNavAdmin) => void;
  onRecharger?: () => void;
  charger?: (jours: Periode) => Promise<Tendances>;
}) {
  const [periode, setPeriode] = useState<Periode>(7);
  const [tendances, setTendances] = useState<Tendances | null | undefined>(vue.tendances);
  const [chargementPeriode, setChargementPeriode] = useState(false);

  // La première période vient avec la vue ; les suivantes se demandent seules.
  function choisirPeriode(jours: Periode) {
    if (jours === periode) return;
    setPeriode(jours);
    setChargementPeriode(true);
    charger(jours)
      .then((t) => setTendances(t))
      // Une période qu'on n'a pas pu lire ne doit pas laisser les chiffres de
      // la précédente sous un libellé neuf : c'est ainsi qu'un écran ment.
      .catch(() => setTendances(null))
      .finally(() => setChargementPeriode(false));
  }
```

Le sélecteur, dans la barre haute, à côté du bouton « Actualiser » :

```tsx
        <div role="group" aria-label="Période" className="flex flex-wrap gap-2">
          {PERIODES.map((p) => (
            <button
              key={p.cle}
              type="button"
              aria-pressed={periode === p.cle}
              onClick={() => choisirPeriode(p.cle)}
              className={`px-3 py-1.5 rounded-pill border font-body text-sm font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                periode === p.cle
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-hairline text-ink'
              }`}
            >
              {p.libelle}
            </button>
          ))}
        </div>
```

Les quatre cartes du haut. La phrase de période accompagne chaque montant, et la
pastille disparaît d'elle-même quand `variation` rend `null` :

```tsx
  const phrase = PERIODES.find((p) => p.cle === periode)!.phrase;
  const varEncaisse = tendances
    ? variation(tendances.flux.encaisse, tendances.flux_precedent.encaisse)
    : null;
  const varCommissions = tendances
    ? variation(tendances.flux.commissions, tendances.flux_precedent.commissions)
    : null;
  const sansMise = tendances?.collecteurs_sans_mise ?? [];
```

```tsx
        {!tendances && (
          <Carte className="p-5">
            <p className="font-body text-sm text-muted-foreground">
              Tendances indisponibles : la base n'a pas rendu les flux de la période. Les totaux
              ci-dessous restent à jour.
            </p>
          </Carte>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <CarteStat
            libelle="Encaissé"
            valeur={formatMontant(tendances?.flux.encaisse ?? 0)}
            unite="FCFA"
            tendance={varEncaisse?.libelle}
            tendancePositive={varEncaisse?.positive ?? true}
            precision={varEncaisse ? undefined : `${phrase} · pas de comparaison possible`}
            icone="coins"
          />
          <CarteStat
            libelle="Commissions GTCS"
            valeur={formatMontant(tendances?.flux.commissions ?? 0)}
            unite="FCFA"
            tendance={varCommissions?.libelle}
            tendancePositive={varCommissions?.positive ?? true}
            precision={varCommissions ? undefined : `${phrase} · pas de comparaison possible`}
            icone="trending-up"
          />
          <CarteStat
            libelle="Encours clients"
            valeur={formatMontant(totaux.encours_clients)}
            unite="FCFA"
            precision="Dû aux clients, à l’instant"
            icone="wallet"
          />
          <CarteStat
            libelle="Sans mise depuis 7 jours"
            valeur={String(sansMise.length)}
            precision={`sur ${abonnements.collecteurs_actifs} collecteurs actifs`}
            icone="alert-circle"
          />
        </div>
```

« Abonnements à échoir » descend dans la carte du revenu récurrent, en ligne :

```tsx
              <div className="flex items-center justify-between gap-3 text-xs font-body pt-2 mt-2 border-t border-hairline">
                <span className="text-muted-foreground">Abonnements à échoir sous 30 jours</span>
                <span className="font-semibold text-ink tabular-nums">
                  {abonnements.expirations_a_venir_30j}
                </span>
              </div>
```

Enfin, la carte du cumul dit désormais son temps sans ambiguïté : son intitulé
devient « Total encaissé depuis l'ouverture », et la pastille « Depuis
l'ouverture » disparaît, devenue redondante.

- [ ] **Étape 5 : voir vert**

```bash
npm test -w @kolek/admin -- TableauDeBord && npm run build -w @kolek/admin
```

Attendu : les épreuves neuves et les anciennes passent — sauf celle qui
interdisait « vs période précédente », réécrite à l'étape 2. `tsc -b` passe dans
le `build` : les apps ne sont typées qu'à la construction.

- [ ] **Étape 6 : la démonstration reçoit ses tendances**

Dans `apps/admin/src/demo.ts`, ajouter la clé après `paiements` — des chiffres
cohérents entre eux, sous le bandeau qui dit déjà que rien n'est réel :

```ts
  tendances: {
    periode: { jours: 7, debut: '2026-09-05', fin: '2026-09-11' },
    depuis: '2026-07-01',
    flux: {
      encaisse: 3_150_000,
      commissions: 315_000,
      restitutions: 480_000,
      mises: 630,
      retraits: 12,
    },
    flux_precedent: {
      encaisse: 2_800_000,
      commissions: 280_000,
      restitutions: 520_000,
      mises: 560,
      retraits: 14,
    },
    serie: [
      { jour: '2026-09-05', encaisse: 420_000, commissions: 42_000, restitutions: 60_000, mises: 84 },
      { jour: '2026-09-06', encaisse: 455_000, commissions: 45_500, restitutions: 0, mises: 91 },
      { jour: '2026-09-07', encaisse: 390_000, commissions: 39_000, restitutions: 120_000, mises: 78 },
      { jour: '2026-09-08', encaisse: 505_000, commissions: 50_500, restitutions: 0, mises: 101 },
      { jour: '2026-09-09', encaisse: 470_000, commissions: 47_000, restitutions: 90_000, mises: 94 },
      { jour: '2026-09-10', encaisse: 440_000, commissions: 44_000, restitutions: 60_000, mises: 88 },
      { jour: '2026-09-11', encaisse: 470_000, commissions: 47_000, restitutions: 150_000, mises: 94 },
    ],
    zones: [
      { zone: 'Adjamé', encaisse: 1_180_000, mises: 236, collecteurs: 5 },
      { zone: 'Yopougon', encaisse: 940_000, mises: 188, collecteurs: 4 },
      { zone: 'Cocody', encaisse: 620_000, mises: 124, collecteurs: 3 },
      { zone: 'Abobo', encaisse: 410_000, mises: 82, collecteurs: 2 },
    ],
    mouvements: VUE_DEMO_MOUVEMENTS,
    mouvements_total: 630,
    collecteurs_sans_mise: [
      {
        id: 'col-7',
        nom: 'Traoré Aminata',
        zone: 'Abobo',
        derniere_mise: '2026-08-28',
        jours_sans: 14,
      },
    ],
  },
```

Les mouvements de démonstration existent déjà dans l'objet : les extraire dans
une constante `VUE_DEMO_MOUVEMENTS` déclarée **avant** `VUE_DEMO`, et la
référencer aux deux endroits — recopier la liste en ferait deux versions.

- [ ] **Étape 7 : commit**

```bash
git add apps/admin/src/donnees.ts apps/admin/src/demo.ts apps/admin/src/ecrans/TableauDeBord.tsx apps/admin/src/ecrans/TableauDeBord.test.tsx
git commit -m "feat(admin): le selecteur de periode et quatre cartes qui disent leur temps"
```

---

### Tâche 6 : l'écran — la courbe, la répartition, les zones, les mouvements, le décrochage

**Fichiers :**
- Modifier : `apps/admin/src/ecrans/TableauDeBord.tsx`
- Modifier : `apps/admin/src/ecrans/TableauDeBord.test.tsx`

**Interfaces :**
- Consomme : `CourbeEvolution` et `PointCourbe` de `@kolek/ui` (écrits au
  chantier B), `BarreEmpilee` sans chevron (tâche 4), l'état `tendances` et
  `periode` de la tâche 5.
- Produit : rien que d'autres tâches consomment.

- [ ] **Étape 1 : écrire les épreuves**

À ajouter dans le même `describe` que la tâche 5 :

```tsx
  it('trace la courbe de la série, jour creux compris', () => {
    const { container } = rendreAvecTendances();

    // Trois points : deux jours actifs et le jour creux entre eux.
    expect(container.querySelectorAll('circle')).toHaveLength(3);
  });

  it('change de série sans changer de période', () => {
    rendreAvecTendances();

    fireEvent.click(screen.getByRole('button', { name: 'Commissions' }));

    expect(screen.getByRole('button', { name: 'Commissions' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: '7 j' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('répartit les flux de la période, pas ceux de l’ouverture', () => {
    rendreAvecTendances();

    // 1 140 000 encaissés moins 114 000 de commission, plus 90 000 restitués.
    expect(screen.getByText('7 derniers jours')).toBeTruthy();
    expect(screen.getByText(montantAffiche(1_026_000))).toBeTruthy();
  });

  it('classe les zones sur la période', () => {
    rendreAvecTendances();

    expect(screen.getByText('Cocody')).toBeTruthy();
    expect(screen.getByText(/140 mises/)).toBeTruthy();
  });

  it('dit combien de mouvements sont montrés sur combien', () => {
    rendreAvecTendances();

    expect(screen.getByText(/1 mouvement sur 228/)).toBeTruthy();
  });

  it('liste les collecteurs qui décrochent, et mène à leur écran', () => {
    const pages: string[] = [];
    render(
      <TableauDeBord
        vue={{ ...VUE, tendances: TENDANCES }}
        onNaviguer={(cle) => pages.push(cle)}
        onRecharger={() => {}}
        charger={async () => TENDANCES}
      />,
    );

    expect(screen.getByText('Yao Adjoua')).toBeTruthy();
    expect(screen.getByText(/12 jours/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Voir les collecteurs/ }));
    expect(pages).toEqual(['collecteurs']);
  });
```

- [ ] **Étape 2 : voir rouge**

```bash
npm test -w @kolek/admin -- TableauDeBord
```

Attendu : les six épreuves neuves tombent — aucune courbe, aucune liste de
décrochage, et la répartition affiche encore les montants depuis l'ouverture.

- [ ] **Étape 3 : brancher les blocs sur la période**

Les séries de la courbe, à côté des autres calculs :

```tsx
type SerieCourbe = 'encaisse' | 'commissions' | 'mises';

const SERIES: { cle: SerieCourbe; libelle: string }[] = [
  { cle: 'encaisse', libelle: 'Encaissé' },
  { cle: 'commissions', libelle: 'Commissions' },
  { cle: 'mises', libelle: 'Mises' },
];
```

```tsx
  const [serie, setSerie] = useState<SerieCourbe>('encaisse');
  const points: PointCourbe[] = (tendances?.serie ?? []).map((p) => ({
    jour: p.jour,
    valeur: p[serie],
  }));
```

La répartition prend les flux de la période, et sa pastille dit la période :

```tsx
  const sommeParts = (tendances?.flux.encaisse ?? 0) + (tendances?.flux.restitutions ?? 0);
  const encaisseNet = (tendances?.flux.encaisse ?? 0) - (tendances?.flux.commissions ?? 0);
```

```tsx
            <BarreEmpilee
              titre="Répartition des flux financiers"
              periode={phrase}
              total={formatMontant(sommeParts)}
              parts={repartition}
            />
```

Les zones viennent de `tendances.zones` et non plus de `vue.zones`, avec leur
nombre de mises :

```tsx
  const zonesTriees = (tendances?.zones ?? []).slice(0, COULEURS_ZONES.length);
```

```tsx
                        <div className="flex items-center justify-between gap-3 text-xs font-body text-muted-foreground">
                          <span>{z.collecteurs} collecteurs sur le terrain</span>
                          <span>{formatMontant(z.mises)} mises</span>
                        </div>
```

Les mouvements viennent de la période. Les boutons de fenêtre locale
disparaissent ; la recherche et le filtre par type restent :

```tsx
  const mouvementsPeriode = tendances?.mouvements ?? [];
  const mouvementsFiltres = useMemo(() => {
    const terme = rechercheMvt.trim().toLowerCase();
    return mouvementsPeriode.filter((m) => {
      if (filtreTypeMvt !== 'tous' && m.type !== filtreTypeMvt) return false;
      if (terme === '') return true;
      return (
        m.client.toLowerCase().includes(terme) || m.collecteur.toLowerCase().includes(terme)
      );
    });
  }, [mouvementsPeriode, rechercheMvt, filtreTypeMvt]);
```

```tsx
                  <span className="text-xs font-body text-muted-foreground tabular-nums shrink-0">
                    {mouvementsFiltres.length}
                    {mouvementsFiltres.length > 1 ? ' mouvements' : ' mouvement'} sur{' '}
                    {formatMontant(tendances?.mouvements_total ?? 0)}
                  </span>
```

Le décrochage, sous les raccourcis de la colonne gauche :

```tsx
          {sansMise.length > 0 && (
            <Carte className="p-5">
              <h3 className="font-headings font-bold text-base text-ink mb-1">
                Sans mise depuis 7 jours
              </h3>
              {/* Un abonnement actif qui n'encaisse plus est un client qui
                  part. C'est le seul signal de cet écran qui appelle un geste
                  hors de l'écran. */}
              <p className="font-body text-xs text-muted-foreground mb-3">
                {sansMise.length} collecteur{sansMise.length > 1 ? 's' : ''} actif
                {sansMise.length > 1 ? 's' : ''} sur {abonnements.collecteurs_actifs}
              </p>
              <ul className="flex flex-col gap-2">
                {sansMise.slice(0, 5).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 text-xs font-body">
                    <span className="min-w-0 truncate text-ink font-semibold">
                      {c.nom}
                      {c.zone && <span className="text-muted-foreground"> · {c.zone}</span>}
                    </span>
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {c.derniere_mise ? `${c.jours_sans} jours` : 'jamais'}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onNaviguer('collecteurs')}
                className="mt-3 font-body text-sm font-semibold text-primary cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Voir les collecteurs
              </button>
            </Carte>
          )}
```

- [ ] **Étape 4 : voir vert**

```bash
npm test -w @kolek/admin && npm run build -w @kolek/admin
```

Attendu : toutes les épreuves de l'admin passent, la construction aussi.

- [ ] **Étape 5 : commit**

```bash
git add apps/admin/src/ecrans/TableauDeBord.tsx apps/admin/src/ecrans/TableauDeBord.test.tsx
git commit -m "feat(admin): courbe, repartition, zones et mouvements suivent la periode"
```

---

### Tâche 7 : la chaîne complète, un regard en local, les écarts

**Fichiers :** ce plan (section « Écarts »).

- [ ] **Étape 1 : la chaîne**

```bash
npm run verifier > <répertoire temporaire>/verifier-tendances.log 2>&1; echo "verifier exit=$?"
```

Attendu : `verifier exit=0` **lu dans le journal** — le code de sortie d'un
`echo` ne prouve rien —, quinze commandes, et `test:db` avec les épreuves
neuves.

- [ ] **Étape 2 : poser des mises datées, en local seulement**

Sans mises d'hier et d'avant-hier, les trois périodes affichent le même chiffre
et le regard ne prouve rien. Le script s'écrit dans le répertoire temporaire,
lit les clés dans `supabase/tests/.env.test`, et refuse toute adresse qui n'est
pas `127.0.0.1` :

```js
// mises-datees-local.mjs — pile locale uniquement
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const DEPOT = 'C:/Users/M.BERTHE/Documents/Kolek';
const { createClient } = createRequire(`${DEPOT}/package.json`)('@supabase/supabase-js');

const env = Object.fromEntries(
  readFileSync(`${DEPOT}/supabase/tests/.env.test`, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
if (!env.SUPABASE_URL?.startsWith('http://127.0.0.1')) {
  throw new Error('Pas la pile locale : arret.');
}

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// `mises_avant_insert` impose montant = cartes.mise : le montant se lit sur la
// carte, il ne se choisit pas. Les cartes closes sont exclues, elles refusent
// toute mise.
const { data: cartes, error } = await admin
  .from('cartes')
  .select('id, collecteur_id, mise')
  .eq('statut', 'active')
  .limit(3);
if (error) throw error;
if (!cartes?.length) throw new Error('Aucune carte active en base locale : lancer db:reset.');

const jour = (d) => {
  const j = new Date();
  j.setUTCDate(j.getUTCDate() + d);
  return j.toISOString().slice(0, 10);
};

// Un nombre de mises différent d'un jour à l'autre : une courbe plate ne
// montrerait pas si la série est bien lue. Le -1 reste vide, pour le jour creux.
const poses = [
  [-9, 1],
  [-6, 2],
  [-3, 3],
  [0, 2],
];

let posees = 0;
for (const [decalage, combien] of poses) {
  for (let i = 0; i < combien; i += 1) {
    const carte = cartes[i % cartes.length];
    const { error: e } = await admin.from('mises').insert({
      id: crypto.randomUUID(),
      collecteur_id: carte.collecteur_id,
      carte_id: carte.id,
      montant: carte.mise,
      encaisse_le: `${jour(decalage)}T12:00:00Z`,
    });
    if (e) throw e;
    posees += 1;
  }
}
console.log(`${posees} mises posees, du ${jour(-9)} au ${jour(0)}, jour -1 laisse vide.`);
```

Run : `node <répertoire temporaire>/mises-datees-local.mjs`

- [ ] **Étape 3 : un regard, en local seulement**

L'admin local part en **5176**, variables en ligne — Vite ne remplace jamais une
variable déjà présente dans l'environnement :

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY="$(grep '^SUPABASE_ANON_KEY=' supabase/tests/.env.test | cut -d= -f2- | tr -d '\r')" \
npm run dev -w @kolek/admin -- --port 5176 --strictPort
```

Avant de regarder : `curl -s http://localhost:5176/src/supabase.ts` contient
`127.0.0.1:54321` et **pas** l'adresse de production. Puis, avec le compte
`sante@kolek.test` créé au chantier précédent (ou recréé par le même script) :
les trois périodes donnent trois chiffres différents, la pastille change de
signe, la courbe montre le jour creux, la répartition dit la période, et les
mouvements annoncent « N sur M ». Le serveur est arrêté ensuite.

- [ ] **Étape 4 : écarts et commit**

Section `## Écarts` en fin de ce plan : ce qui a divergé, ou « aucun ». Y
consigner au minimum le résultat de la chaîne, celui de l'épreuve de tolérance
(tâche 2, étape 5) et ce que le regard a montré.

```bash
git add Docs/plans/2026-09-11-tableau-de-bord-tendances.md Docs/specs/2026-09-11-tableau-de-bord-tendances-design.md
git commit -m "docs: le tableau de bord et ses tendances, ecarts et verification"
```

---

## Mise en production — chaque geste sur accord explicite

1. **Fusion** dans `main` en local, avance rapide si possible ; chaîne relancée
   sur le résultat.
2. **Avant la migration** : `npx supabase migration list --linked` (lecture
   seule). Attendu : seule `20260911210000` manque au distant.
3. **`npx supabase db push`** — **accord n° 1**. Puis, en lecture seule et en
   agrégats :

   ```sql
   select has_function_privilege('anon','public.admin_tendances(integer)','execute') as anon_ouvert,
          has_function_privilege('service_role','public.admin_tendances(integer)','execute') as service_ouvert,
          jsonb_array_length(public.admin_tendances(7) -> 'serie') as points_serie,
          (public.admin_tendances(7) -> 'flux' ->> 'mises')::int as mises_7j;
   ```

   Attendu : `anon_ouvert` faux, `service_ouvert` vrai, une série non vide, et
   un nombre de mises cohérent avec les 42 par jour mesurés le 2026-09-11.
4. **Poussée de `main`** par PowerShell — **accord n° 2**. Le job des fonctions
   redéploie toutes les Edge Functions, mais seule `admin-vue-globale` change de
   code, donc de version. Puis : empreintes servies par les trois fronts
   comparées aux builds locaux, et la version de `admin-vue-globale` relevée
   avant et après.
5. **Le lendemain** : l'écran affiche une variation entre deux journées réelles,
   ce qu'aucun jeu d'essai ne prouve.

## Retour arrière — sur décision seulement

Une migration neuve, jamais une réécriture de `20260911210000` :

```sql
drop function public.admin_tendances(integer);
```

La route tolère l'absence : `tendances` vaut `null`, l'écran affiche « tendances
indisponibles » et garde ses totaux. Côté écran, un `git revert` des tâches 4 à
6 suffit. Aucune donnée n'est écrite par ce chantier, à aucun moment.

## Écarts

Relevés à l'exécution, le 2026-09-11.

- **Le plan aurait échoué à la préparation de sa propre épreuve.**
  `mises_avant_insert` impose `montant = cartes.mise`, décide lui-même
  `est_commission` — vrai pour la première mise de la carte, quelle que soit sa
  date — et réécrit `collecteur_id`. Le jeu d'essai posait 1 000, 2 000 et
  3 000 sur une carte à 1 000, et le script local de la tâche 7 choisissait ses
  montants de même. Corrigé avant la première ligne de code (`b13e6df`) : le
  montant se lit sur la carte, et c'est le **nombre** de mises qui varie d'un
  jour à l'autre.
- **Douze épreuves de base, pas treize.** Le compte du plan était faux ; le
  contenu, non.
- **Le verrou passait déjà en rouge**, comme au chantier précédent : une
  fonction absente est refusée elle aussi. Ces deux épreuves ne prouvent quelque
  chose qu'après la migration.
- **Un défaut trouvé par l'épreuve de la route, dans ma propre migration.** Le
  compte administrateur créé pour l'épreuve est un collecteur actif, inscrit le
  jour même, qui n'a jamais encaissé : il entrait dans la liste des décrochages
  avec zéro jour de silence. Un collecteur inscrit ce matin n'a pas décroché, il
  n'a pas commencé. La condition exige désormais que le compte **lui-même** ait
  plus de sept jours.
- **`POST` accepté par la route**, ce que le plan n'avait pas dit :
  `functions.invoke` ne sait pas construire de chaîne de requête, donc sans lui
  l'écran ne pourrait jamais demander une autre période que celle par défaut.
- **La fenêtre locale des mouvements est retirée dès la tâche 5**, alors que le
  plan la gardait jusqu'à la tâche 6. Entre les deux, l'écran aurait porté deux
  boutons « 7 j » : les épreuves n'auraient plus su lequel viser, et deux
  commandes de temps auraient coexisté.
- **Deux épreuves anciennes réécrites, pas rapiécées.** Elles encodaient
  l'ancien contrat — « aucune comparaison à l'écran », « la fenêtre ne déplace
  aucun montant ». Le fichier a été repris en entier, et son commentaire d'en-tête
  dit maintenant ce qui est vérifié à la place, en connaissance de cause.
- **Deux pièges d'épreuve, tous deux dus à des noms ou des formes qui se
  ressemblent.** Des commissions proportionnelles à l'encaissé affichaient deux
  fois « +14 % » : l'épreuve trouvait deux éléments pour un, et ne prouvait plus
  que chaque carte lit son propre couple — le jeu d'essai porte désormais +14 %
  et +30 %. Et compter les `<circle>` de la page entière en trouvait **huit** au
  lieu de trois : les icônes lucide en portent aussi. L'épreuve vise la
  `<figure>` de la courbe.
- **Un avertissement de lint fondé**, apparu à la tâche 6 : `tendances?.mouvements
  ?? []` rend un tableau neuf à chaque rendu, et le `useMemo` qui en dépendait ne
  mémorisait rien. Mémorisé sur `tendances`.
- **Tolérance prouvée autrement qu'au chantier précédent.** Retirer le droit
  d'exécution à `service_role` aurait fait tomber dix épreuves de base, qui
  appellent la fonction directement : la fonction a été **renommée**, ce qui la
  rend introuvable comme si elle n'existait pas. Résultat : la route répond 200,
  toutes ses clés existantes intactes, `tendances` à `null`, et
  `partie=tendances` rend `{ tendances: null }` plutôt qu'une erreur.
- **La chaîne, tâche 7.** `verifier exit=0` lu dans le journal ; quinze
  commandes ; core 96, ui 154, admin 150, collecteur 266, site 41, scripts 198,
  `test:db` 819 épreuves en 69 fichiers ; bundles sans fuite.
- **Le regard, fait par la machine.** Chrome sans interface, profil jetable
  hors dépôt, sur l'admin local en 5176 dont le module servi porte
  `127.0.0.1:54321` une fois et l'hôte de production zéro fois. Vu : le
  sélecteur à trois périodes, les quatre cartes dont deux à pastille, la courbe
  à 81 points, la répartition qui affiche la période choisie, les zones avec
  leur nombre de mises, « 200 mouvements sur 249 » — le bornage se dit —, aucune
  exception JavaScript, aucun débordement horizontal à 390 px. En 30 jours, les
  deux cartes de flux passent à « pas de comparaison possible » : la période
  précédente est vide dans le jeu local, et l'écran le dit au lieu d'inventer.
- **Le décrochage a dû être provoqué pour être vu.** Tous les collecteurs du jeu
  local avaient encaissé récemment : la carte affichait zéro et la liste
  n'existait pas. Trois comptes actifs sans mise ont été vieillis en base
  **locale** pour que le bloc se montre — il affiche alors « 3 collecteurs
  actifs sur 65 », trois noms suivis de « jamais », et le bouton vers l'écran
  Collecteurs.
- **Un défaut antérieur trouvé par ce regard, corrigé (`f169dd5`).** Chaque
  ligne de mouvement affichait « +5 000 FCFA FCFA » : `LigneTransaction` écrit
  l'unité lui-même — les deux écrans du collecteur lui passent un montant nu —
  et le tableau de bord la joignait quand même. Aucune épreuve ne pouvait le
  voir : il n'en existait aucune sur le rendu d'une ligne. Épreuve rouge
  d'abord, puis correction, puis confirmation à l'écran.

## Relevés d'avant-production — 2026-09-12

Pris avant tout geste d'écriture, en lecture seule, pour que la comparaison
d'après poussée n'ait rien à reconstituer.

- **Migrations** : `migration list --linked` aligne 50 migrations sur 50 et
  ne laisse manquer que `20260911210000`. Aucune autre dérive.
- **La fonction est bien absente** :
  `to_regprocedure('public.admin_tendances(integer)')` rend `null` en
  production. Le verrou de la route sera donc éprouvé pour de vrai : avant la
  migration, l'écran doit afficher « tendances indisponibles » et garder ses
  totaux.
- **La fonction qui va changer** : `admin-vue-globale` est en **version 37**,
  `ezbr_sha256` `f183d42890c2…`, déployée depuis le CI. Après la poussée elle
  doit passer à 38 ; les 18 autres gardent la leur.
- **Les fronts, avant** : `admin.kolek.cash` sert `index-eLEeInjb.js` et
  `index-BYzEcFPa.css` ; `app.kolek.cash`, `index-DIDGJsab.js` et
  `index-Da6QQP7H.css` ; `kolek.cash`, `index-BFnMfbiZ.js` et
  `index-D_T0DKer.css`. Ce sont les empreintes du build de `7760bf3` : rien
  n'a bougé depuis le chantier B.
- **Les fronts, attendus après** : le build local de `6e40d23` ne change que
  l'admin — `index-Dq0yNqAj.js` et `index-D50uipf_.css`. Le collecteur et le
  site rendent exactement les empreintes déjà servies, ce que le chantier
  laissait attendre : aucun d'eux ne touche au tableau de bord.
- **La base, avant** : `releves_quotidiens` porte une seule ligne
  (2026-09-11) ; la courbe de la santé restera donc à un point tant que le
  relevé du 2026-09-12 ne sera pas écrit, à 23 h 55.
