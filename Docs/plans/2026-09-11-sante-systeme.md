# La santé du système dans Kolek · Super Admin — plan d'implémentation

> **Pour un exécutant :** les étapes sont cochables (`- [ ]`). Elles se suivent
> dans l'ordre. Chaque tâche voit ses épreuves rouges avant le code, finit par
> un commit et laisse le dépôt vert.
> **Deux gestes touchent la production, chacun sur accord explicite et
> séparé de l'exploitant** : `supabase db push` (la migration), puis la
> poussée de `main` (Netlify redéploie les trois fronts, le CI redéploie
> `super-admin-etat`). Rien d'autre ne sort de la machine.

**But :** un onglet « Santé du système » dans le Super Admin — cinq voyants,
quatre cartes, une courbe d'évolution — nourri par un relevé quotidien que
pg_cron écrit en base, et un journal pg_cron qui cesse de grossir sans fin.

**Conception :** `Docs/specs/2026-09-11-sante-systeme-design.md`, approuvée le
2026-09-11. Chantier **B** sur quatre.

**Architecture :** une migration crée `releves_quotidiens`, trois fonctions
`security definer` (`releve_du_jour`, `purger_journal_cron`, `sante_systeme`)
et deux travaux pg_cron. `super-admin-etat` appelle `sante_systeme` en
troisième, sans que son échec fasse échouer la route. Les voyants sont jugés
par une fonction pure de `@kolek/core` ; la courbe est un composant SVG de
`@kolek/ui` ; l'écran les assemble.

**Outillage :** PostgreSQL + pg_cron (Supabase), Deno (Edge Functions),
React 19, Vitest 4, TypeScript (`tsc -b`), oxlint.

## Contraintes pour toutes les tâches

- **Aucun essai contre la production.** `apps/*/.env` pointent sur la
  production ; les serveurs de dev en 5173/5174 aussi. Toute épreuve tourne
  contre la pile locale (`127.0.0.1:54321`). Aucun `.env` copié.
- **`supabase db reset` sans `--linked` uniquement.** `db push`,
  `functions deploy` et `db reset --linked` visent la production.
- **Toute fonction `security definer`** porte
  `set search_path = public, pg_temp` (épreuve `search-path.test.ts`) et se
  termine par `revoke all … from public, anon, authenticated` puis
  `grant execute … to service_role` (épreuve `definers_exposes`).
- **Types des apps** : l'étape `typecheck` ne type que `core` et `ui`. Après
  toute modification d'une app : `npx tsc -b apps/<app>`.
- **Edge Functions locales** : elles ne se rechargent pas à chaud. Après
  modification : `docker restart supabase_edge_runtime_Kolek`. Des `503` sur
  tous les appels de fonction = runtime éteint, pas une régression.
- **Espaces insécables** : écrites `\u00a0` dans le code et les épreuves,
  jamais tapées — l'outil Read les montre comme des espaces ordinaires.
- **Fins de ligne** : après chaque tâche, la sonde, et tout fichier `MELE`
  remis dans sa convention d'origine avant le commit :

  ```bash
  node -e 'const fs=require("fs");for(const f of process.argv.slice(1)){const s=fs.readFileSync(f,"utf8");const n=s.split("\n").length-1,c=(s.match(/\r\n/g)||[]).length;console.log(f,c===n?"CRLF":c===0?"LF":"MELE "+c+"/"+n)}' <fichiers touchés>
  ```

- **Commits** : français sans accents, terminés par
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Épreuves de base** : `npm run db:env` une fois, puis
  `npx vitest run --config supabase/tests/vitest.config.ts <fichier>`.

---

### Tâche 1 : la migration — table, relevé, purge, lecture, horloge

**Fichiers :**
- Épreuve : `supabase/tests/sante-systeme.test.ts` (neuf)
- Créer : `supabase/migrations/20260911120000_sante_systeme.sql`

**Interfaces :**
- Produit : `public.releve_du_jour() returns date`,
  `public.purger_journal_cron(p_jours integer default 30) returns bigint`,
  `public.sante_systeme() returns jsonb` de forme
  `{ mesure_le, base: { taille, connexions, max_connexions, cache_pct },
  drainage: { derniere_execution, dernier_succes, executions_24h, echecs_24h },
  releve: { dernier_jour }, journal_cron: { lignes, taille },
  files: { avis_en_attente, avis_plus_ancien, avis_abandonnes, rejets_non_traites },
  releves: [{ jour, taille_base, volumes, encours_clients }] }` ;
  travaux `kolek-releve-quotidien` et `kolek-purge-journal-cron`.

- [ ] **Étape 1 : écrire l'épreuve**

`supabase/tests/sante-systeme.test.ts` :

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * La santé du système : le relevé quotidien, la purge du journal pg_cron, et
 * ce que l'écran Super Admin lit.
 *
 * Deux choses comptent ici. **Le verrou** : trois fonctions `security definer`,
 * dont l'une supprime des lignes — aucune ne doit s'ouvrir à un navigateur.
 * **L'idempotence** : un relevé relancé le même jour remplace le premier, il
 * n'en ajoute pas un second qui fausserait la courbe.
 *
 * ## Ce que ce fichier ne prouve pas
 *
 * L'effet de la purge. PostgREST ne sert pas le schéma `cron`, et la clé de
 * service ne peut pas y poser de fausses traces anciennes : la purge est
 * éprouvée sur ses droits, sa borne et son exécution. Son effet se vérifie en
 * production après le 2026-09-22, par un compte agrégé.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
const FONCTIONS = ['releve_du_jour', 'sante_systeme', 'purger_journal_cron'] as const;

let collecteur: CollecteurTest;

/** Le jour d'Abidjan — UTC+0, sans heure d'été — au format de la base. */
const aujourdhui = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  collecteur = await creerCollecteur(`Santé ${MARQUE}`, `+225077${MARQUE}`);
});

afterAll(async () => {
  await nettoyer();
});

describe('le verrou', () => {
  for (const fonction of FONCTIONS) {
    it(`refuse ${fonction} sans session`, async () => {
      const { error } = await anonyme.rpc(fonction);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied|not exist|not find/i);
    });

    it(`refuse ${fonction} à un collecteur authentifié`, async () => {
      const { error } = await collecteur.client.rpc(fonction);
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission denied|not exist|not find/i);
    });
  }

  it('ferme la table des relevés aux navigateurs', async () => {
    const { data, error } = await collecteur.client.from('releves_quotidiens').select('jour');
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });
});

describe('le relevé', () => {
  it('écrit la ligne du jour, et une seule même relancé', async () => {
    const premier = await admin.rpc('releve_du_jour');
    const second = await admin.rpc('releve_du_jour');

    expect(premier.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data).toBe(aujourdhui());

    const { data, error } = await admin
      .from('releves_quotidiens')
      .select('jour')
      .eq('jour', aujourdhui());
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('reprend les volumes et l’encours des fonctions qui les servent déjà', async () => {
    await admin.rpc('releve_du_jour');
    const [{ data: releve }, { data: reglages }] = await Promise.all([
      admin.from('releves_quotidiens').select('*').eq('jour', aujourdhui()).single(),
      admin.rpc('admin_reglages'),
    ]);

    // La même source que l'écran : deux calculs du même chiffre finiraient
    // par donner deux vérités.
    expect(releve.volumes).toEqual(reglages.volumes);
    expect(typeof releve.encours_clients).toBe('number');
    expect(releve.taille_base).toBeGreaterThan(0);
    expect(releve.taille_journal_cron).toBeGreaterThanOrEqual(0);
  });
});

describe('la lecture', () => {
  it('rend toutes les clés que l’écran lit', async () => {
    await admin.rpc('releve_du_jour');
    const { data, error } = await admin.rpc('sante_systeme');
    expect(error).toBeNull();

    expect(Object.keys(data).sort()).toEqual([
      'base',
      'drainage',
      'files',
      'journal_cron',
      'mesure_le',
      'releve',
      'releves',
    ]);
    expect(data.base.taille).toBeGreaterThan(0);
    expect(data.base.max_connexions).toBeGreaterThan(0);
    // L'appel lui-même occupe une connexion cliente.
    expect(data.base.connexions).toBeGreaterThanOrEqual(1);
    expect(typeof data.drainage.executions_24h).toBe('number');
    expect(typeof data.drainage.echecs_24h).toBe('number');
    expect(typeof data.files.rejets_non_traites).toBe('number');
    expect(data.releve.dernier_jour).toBe(aujourdhui());
  });

  it('rend les relevés du plus ancien au plus récent, quatre-vingt-dix au plus', async () => {
    const { data } = await admin.rpc('sante_systeme');
    const jours = (data.releves as Array<{ jour: string }>).map((r) => r.jour);

    expect(jours.length).toBeGreaterThanOrEqual(1);
    expect(jours.length).toBeLessThanOrEqual(90);
    expect([...jours].sort()).toEqual(jours);
  });
});

describe('la purge', () => {
  it('s’exécute sous la clé de service et dit combien elle a supprimé', async () => {
    const { data, error } = await admin.rpc('purger_journal_cron', { p_jours: 30 });
    expect(error).toBeNull();
    expect(typeof data).toBe('number');
  });

  it('refuse une borne sous un jour', async () => {
    const { error } = await admin.rpc('purger_journal_cron', { p_jours: 0 });
    expect(error?.message).toMatch(/PURGE_BORNE/);
  });
});
```

- [ ] **Étape 2 : la voir rouge**

Run : `npm run db:env` puis
`npx vitest run --config supabase/tests/vitest.config.ts sante-systeme`
Attendu : échecs sur « le relevé », « la lecture », « la purge » et « ferme la
table » — `Could not find the function public.releve_du_jour` / relation
absente. Les six épreuves du verrou passent déjà : une fonction absente est
aussi refusée. Elles protègent l'après, pas l'avant.

- [ ] **Étape 3 : écrire la migration**

`supabase/migrations/20260911120000_sante_systeme.sql` :

```sql
-- La santé du système : un relevé par jour, la purge du journal pg_cron, et
-- ce que l'écran Super Admin lit.
--
-- Conception : Docs/specs/2026-09-11-sante-systeme-design.md.
--
-- ## Pourquoi un relevé
--
-- Rien dans la base ne garde d'état d'un jour sur l'autre. La taille de la
-- base d'hier, l'encours d'il y a un mois : écrits nulle part, donc
-- inaffichables sans les inventer. Cette table commence l'historique le jour
-- de son déploiement ; elle ne reconstitue rien.
--
-- ## Pourquoi reprendre `admin_reglages()` et `admin_vue_globale()`
--
-- Les volumes et l'encours ont déjà une fonction qui les calcule pour un
-- écran. Les recalculer ici donnerait deux vérités, et la seconde finirait
-- par diverger de celle que l'administrateur lit.
--
-- ## Pourquoi purger `cron.job_run_details`
--
-- Mesuré en production le 2026-09-11 : 27 497 lignes, 4,6 Mo, plus que toutes
-- les tables métier réunies, et 1 440 de plus chaque jour. pg_cron ne purge
-- rien de lui-même. Trente jours de traces suffisent à enquêter ; les voyants
-- n'en lisent que vingt-quatre heures.

create table public.releves_quotidiens (
  jour                date primary key,
  releve_le           timestamptz not null default now(),
  taille_base         bigint not null,
  taille_journal_cron bigint not null,
  volumes             jsonb not null,
  encours_clients     bigint not null
);

comment on table public.releves_quotidiens is
  'Un relevé par jour (date d''Abidjan) : taille de la base et du journal pg_cron, volumes, encours. Écrit par releve_du_jour(), lu par sante_systeme().';

-- Aucune politique : aucun navigateur ne lit cette table. Les révocations
-- doublent RLS, parce que la plateforme accorde d'office les droits de table
-- à `anon` et `authenticated` (audit du 2026-08-17).
alter table public.releves_quotidiens enable row level security;
revoke all on table public.releves_quotidiens from anon, authenticated;

/* ------------------------------- Le relevé ------------------------------- */

create or replace function public.releve_du_jour()
returns date
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  -- Abidjan est à UTC+0, sans heure d'été. Le nommer plutôt que se fier au
  -- fuseau du serveur garde la ligne juste si ce réglage change un jour.
  v_jour date := (now() at time zone 'Africa/Abidjan')::date;
begin
  insert into public.releves_quotidiens
    (jour, releve_le, taille_base, taille_journal_cron, volumes, encours_clients)
  values (
    v_jour,
    now(),
    pg_database_size(current_database()),
    pg_total_relation_size('cron.job_run_details'),
    public.admin_reglages() -> 'volumes',
    (public.admin_vue_globale() -> 'totaux' ->> 'encours_clients')::bigint
  )
  -- Relancé le même jour — pg_cron qui rejoue, un essai à la main —, le
  -- relevé remplace le précédent : deux points le même jour fausseraient la
  -- courbe.
  on conflict (jour) do update set
    releve_le           = excluded.releve_le,
    taille_base         = excluded.taille_base,
    taille_journal_cron = excluded.taille_journal_cron,
    volumes             = excluded.volumes,
    encours_clients     = excluded.encours_clients;

  return v_jour;
end;
$fn$;

/* ------------------------------- La purge -------------------------------- */

create or replace function public.purger_journal_cron(p_jours integer default 30)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_supprimees bigint;
begin
  -- Une borne à zéro viderait le journal de l'exécution en cours : les
  -- voyants liraient « aucune exécution » et passeraient en alerte.
  if p_jours is null or p_jours < 1 then
    raise exception 'PURGE_BORNE : p_jours doit valoir au moins 1, reçu %', p_jours
      using errcode = '22023';
  end if;

  delete from cron.job_run_details
   where end_time < now() - make_interval(days => p_jours);

  get diagnostics v_supprimees = row_count;
  return v_supprimees;
end;
$fn$;

/* ------------------------------- La lecture ------------------------------ */

create or replace function public.sante_systeme()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with drainage as (
    select
      max(d.start_time)                                   as derniere_execution,
      max(d.end_time) filter (where d.status = 'succeeded') as dernier_succes,
      count(*) filter (where d.start_time > now() - interval '1 day') as executions_24h,
      -- Un échec est `failed`. Une exécution en cours (`running`) n'en est pas un.
      count(*) filter (where d.start_time > now() - interval '1 day'
                         and d.status = 'failed')           as echecs_24h
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
    where j.jobname = 'kolek-avis-drainage'
  ),
  en_attente as (
    -- La même définition que `avis_declencher_drainage()` : ce qu'elle
    -- repartira, et rien d'autre.
    select count(*) as nombre, min(cree_le) as plus_ancien
    from public.avis_clients
    where statut in ('a_envoyer', 'echoue') and tentatives < 3
  )
  select jsonb_build_object(
    'mesure_le', now(),
    'base', jsonb_build_object(
      'taille',         pg_database_size(current_database()),
      'connexions',     (select count(*) from pg_stat_activity
                          where backend_type = 'client backend'),
      'max_connexions', current_setting('max_connections')::integer,
      'cache_pct',      (select round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2)
                           from pg_stat_database
                          where datname = current_database())
    ),
    'drainage', (select to_jsonb(drainage) from drainage),
    'releve', jsonb_build_object(
      'dernier_jour', (select max(jour) from public.releves_quotidiens)
    ),
    'journal_cron', jsonb_build_object(
      'lignes', (select count(*) from cron.job_run_details),
      'taille', pg_total_relation_size('cron.job_run_details')
    ),
    'files', jsonb_build_object(
      'avis_en_attente',    (select nombre from en_attente),
      'avis_plus_ancien',   (select plus_ancien from en_attente),
      'avis_abandonnes',    (select count(*) from public.avis_clients
                              where statut = 'echoue' and tentatives >= 3),
      'rejets_non_traites', (select count(*) from public.synchro_rejets where not traite)
    ),
    'releves', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'jour',            r.jour,
          'taille_base',     r.taille_base,
          'volumes',         r.volumes,
          'encours_clients', r.encours_clients
        )
        order by r.jour
      )
      from (
        select * from public.releves_quotidiens order by jour desc limit 90
      ) r
    ), '[]'::jsonb)
  );
$fn$;

/* -------------------------------- Droits --------------------------------- */

-- `create or replace function` rend l'exécution à `public` sans rien dire.
-- Trois fonctions qui lisent le catalogue, dont une qui supprime : aucune ne
-- s'ouvre à un navigateur.
alter function public.releve_du_jour() owner to postgres;
alter function public.purger_journal_cron(integer) owner to postgres;
alter function public.sante_systeme() owner to postgres;

revoke all on function public.releve_du_jour() from public, anon, authenticated;
revoke all on function public.purger_journal_cron(integer) from public, anon, authenticated;
revoke all on function public.sante_systeme() from public, anon, authenticated;

grant execute on function public.releve_du_jour() to service_role;
grant execute on function public.purger_journal_cron(integer) to service_role;
grant execute on function public.sante_systeme() to service_role;

comment on function public.releve_du_jour() is
  'Écrit (ou remplace) le relevé du jour d''Abidjan. Appelée par pg_cron à 23 h 55 UTC.';
comment on function public.purger_journal_cron(integer) is
  'Supprime les traces pg_cron plus vieilles que p_jours (≥ 1). Appelée par pg_cron à 0 h 10 UTC avec 30.';
comment on function public.sante_systeme() is
  'Mesures de la base et des tâches automatiques, et les 90 derniers relevés. Réservée à service_role ; le contrôle super admin se fait dans super-admin-etat.';

/* ------------------------------- L'horloge ------------------------------- */

do $planifier$
begin
  -- Désinscrire avant d'inscrire : sans ça, chaque `db reset` créerait un
  -- second travail du même nom.
  perform cron.unschedule('kolek-releve-quotidien')
   where exists (select 1 from cron.job where jobname = 'kolek-releve-quotidien');
  perform cron.unschedule('kolek-purge-journal-cron')
   where exists (select 1 from cron.job where jobname = 'kolek-purge-journal-cron');

  -- 23 h 55 UTC : la fin de la journée à Abidjan, après la dernière tournée.
  perform cron.schedule(
    'kolek-releve-quotidien',
    '55 23 * * *',
    $travail$select public.releve_du_jour();$travail$
  );

  -- 0 h 10 UTC : après le relevé, qui mesure le journal avant qu'il maigrisse.
  perform cron.schedule(
    'kolek-purge-journal-cron',
    '10 0 * * *',
    $travail$select public.purger_journal_cron(30);$travail$
  );
end;
$planifier$;

-- Le premier point de la courbe : sans lui, l'écran attendrait 23 h 55 pour
-- avoir quelque chose à dire.
select public.releve_du_jour();

/* ------------------------------ Garde-fous ------------------------------- */

do $garde$
declare
  f text;
begin
  foreach f in array array[
    'public.releve_du_jour()',
    'public.purger_journal_cron(integer)',
    'public.sante_systeme()'
  ] loop
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute') then
      raise exception 'GARDE_FOU : % est appelable depuis un navigateur.', f;
    end if;
  end loop;

  if (select count(*) from cron.job
       where jobname in ('kolek-releve-quotidien', 'kolek-purge-journal-cron')) <> 2 then
    raise exception 'GARDE_FOU : les deux travaux de la santé du système ne sont pas planifiés.';
  end if;

  if not exists (select 1 from public.releves_quotidiens) then
    raise exception 'GARDE_FOU : le premier relevé n''a pas été écrit.';
  end if;
end;
$garde$;
```

- [ ] **Étape 4 : appliquer en local et la voir verte**

Run : `npm run db:reset` (local — **jamais** `--linked`).
Attendu : la migration passe, garde-fous compris.
Run : `npm run db:env` puis
`npx vitest run --config supabase/tests/vitest.config.ts sante-systeme search-path reglages-admin`
Attendu : tout passe — dont « nomme pg_temp partout » et « n'en laisse aucune
atteignable sans session ».

- [ ] **Étape 5 : l'horloge et le coût, mesurés**

Run :
`docker exec supabase_db_Kolek psql -U postgres -d postgres -At -c "select jobname, schedule from cron.job order by jobname"`
Attendu : trois lignes — `kolek-avis-drainage * * * * *`,
`kolek-purge-journal-cron 10 0 * * *`, `kolek-releve-quotidien 55 23 * * *`.

Run :
`docker exec supabase_db_Kolek psql -U postgres -d postgres -c "\timing on" -c "select public.releve_du_jour();"`
Attendu : une durée affichée ; la noter dans les écarts. Au-delà d'une
seconde sur la base locale, s'arrêter et en parler avant de continuer.

- [ ] **Étape 6 : sonde des fins de ligne et commit**

```bash
git add supabase/migrations/20260911120000_sante_systeme.sql supabase/tests/sante-systeme.test.ts
git commit -m "feat(base): un releve par jour, la purge du journal pg_cron, et la sante du systeme"
```

---

### Tâche 2 : `super-admin-etat` rend la santé, et survit à son absence

**Fichiers :**
- Épreuve : `supabase/tests/super-admin-fonctions.test.ts` (dans `describe('l’état')`)
- Modifier : `supabase/functions/super-admin-etat/index.ts`

**Interfaces :**
- Consomme : `public.sante_systeme()` (tâche 1).
- Produit : la réponse de la route porte `sante: <jsonb de sante_systeme> | null`.

- [ ] **Étape 1 : écrire l'épreuve**

Dans `supabase/tests/super-admin-fonctions.test.ts`, en dernière épreuve de
`describe('l’état')` :

```ts
  it('rend la santé du système, avec au moins le relevé de la migration', async () => {
    const corps = await (await etat(jetonPatron)).json();

    expect(corps.sante).toBeTruthy();
    expect(typeof corps.sante.base?.taille).toBe('number');
    expect(typeof corps.sante.drainage?.executions_24h).toBe('number');
    expect(Array.isArray(corps.sante.releves)).toBe(true);
    expect(corps.sante.releves.length).toBeGreaterThanOrEqual(1);
  });
```

- [ ] **Étape 2 : la voir rouge**

Run : `npx vitest run --config supabase/tests/vitest.config.ts super-admin-fonctions`
Attendu : 1 échec, `rend la santé du système`, sur `corps.sante` indéfini.

- [ ] **Étape 3 : modifier la route**

Dans `supabase/functions/super-admin-etat/index.ts`, le commentaire d'en-tête
de la route — remplacer :

```ts
 * Les deux partent en parallèle : elles ne dépendent pas l'une de l'autre, et
 * l'écran attend la plus lente de toute façon.
```

par :

```ts
 * Les deux partent en parallèle : elles ne dépendent pas l'une de l'autre, et
 * l'écran attend la plus lente de toute façon.
 *
 * Un troisième appel, `sante_systeme()`, rend l'état de la base et des tâches
 * automatiques pour l'onglet « Santé du système ». C'est le seul dont l'échec
 * est toléré — voir plus bas.
```

Remplacer :

```ts
  const [etat, reglages] = await Promise.all([
    service.rpc('super_admin_etat'),
    service.rpc('admin_reglages'),
  ]);
```

par :

```ts
  // `sante_systeme` part avec les deux autres, mais son échec ne fait pas
  // échouer la route. La poussée de `main` redéploie cette fonction ; la
  // migration, elle, part à la main. Dans le mauvais ordre, une erreur ici
  // mettrait tout le Super Admin en panne pour un seul onglet : l'écran dira
  // « santé indisponible », et le reste s'affichera.
  const [etat, reglages, sante] = await Promise.all([
    service.rpc('super_admin_etat'),
    service.rpc('admin_reglages'),
    service.rpc('sante_systeme'),
  ]);
```

Après le bloc `if (reglages.error || !reglages.data) { … }`, ajouter :

```ts
  if (sante.error) {
    console.error('sante_systeme a échoué :', sante.error.message);
  }
```

Dans l'objet rendu, après la ligne `paiement: { ...paiement, boutique },` :

```ts
      sante: sante.error ? null : (sante.data ?? null),
```

- [ ] **Étape 4 : recharger la fonction et la voir verte**

Run : `docker restart supabase_edge_runtime_Kolek`
Run : `npx vitest run --config supabase/tests/vitest.config.ts super-admin-fonctions`
Attendu : tout passe. Des `503` = le runtime démarre encore ; relancer une fois.

- [ ] **Étape 5 : éprouver la tolérance, à la main**

Retirer l'exécution à `service_role`, en local :

Run : `docker exec supabase_db_Kolek psql -U postgres -d postgres -c "revoke execute on function public.sante_systeme() from service_role;"`
Run : `npx vitest run --config supabase/tests/vitest.config.ts super-admin-fonctions`
Attendu : **seul** `rend la santé du système` échoue (`corps.sante` nul) ;
`rend les trois listes et les volumes de la base` passe — la route répond
toujours 200.

Rendre le droit :

Run : `docker exec supabase_db_Kolek psql -U postgres -d postgres -c "grant execute on function public.sante_systeme() to service_role;"`
Run : la même épreuve — attendu : tout passe.

- [ ] **Étape 6 : sonde des fins de ligne et commit**

```bash
git add supabase/functions/super-admin-etat/index.ts supabase/tests/super-admin-fonctions.test.ts
git commit -m "feat(super-admin): la route rend la sante du systeme, et survit a son absence"
```

> **Ce commit touche `supabase/functions/`** : à la poussée de `main`, le CI
> redéploiera `super-admin-etat` en production. La migration doit être
> appliquée avant — voir « Mise en production ».

---

### Tâche 3 : juger la santé — `evaluerSante` dans `@kolek/core`

**Fichiers :**
- Épreuve : `packages/core/src/sante.test.ts` (neuf)
- Créer : `packages/core/src/sante.ts`
- Modifier : `packages/core/src/index.ts`

**Interfaces :**
- Produit :

```ts
export type NiveauSante = 'normal' | 'attention' | 'alerte';
export type PointSante = 'drainage' | 'releve' | 'avis' | 'rejets' | 'connexions';
export interface MesuresSante {
  base: { taille: number; connexions: number; max_connexions: number; cache_pct: number | null };
  drainage: { derniere_execution: string | null; dernier_succes: string | null; executions_24h: number; echecs_24h: number };
  releve: { dernier_jour: string | null };
  journal_cron: { lignes: number; taille: number };
  files: { avis_en_attente: number; avis_plus_ancien: string | null; avis_abandonnes: number; rejets_non_traites: number };
}
export interface Voyant { point: PointSante; libelle: string; niveau: NiveauSante; raison: string }
export interface EvaluationSante { niveau: NiveauSante; voyants: Voyant[] }
export function evaluerSante(mesures: MesuresSante, maintenant: Date): EvaluationSante;
```

- [ ] **Étape 1 : écrire l'épreuve**

`packages/core/src/sante.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { evaluerSante, type MesuresSante, type PointSante } from './sante';

/**
 * Les seuils des voyants, de part et d'autre de chacun.
 *
 * Un seuil non éprouvé des deux côtés est un seuil qu'on ne connaît pas : à
 * 5 min pile, le drainage est-il sain ? L'épreuve le dit, et le code suit.
 */

const MAINTENANT = new Date('2026-09-11T12:00:00Z');
const ilYA = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();

const SAIN: MesuresSante = {
  base: { taille: 19 * 1024 * 1024, connexions: 18, max_connexions: 60, cache_pct: 99.99 },
  drainage: { derniere_execution: ilYA(1), dernier_succes: ilYA(1), executions_24h: 1440, echecs_24h: 0 },
  releve: { dernier_jour: '2026-09-11' },
  journal_cron: { lignes: 27497, taille: 4_767_744 },
  files: { avis_en_attente: 0, avis_plus_ancien: null, avis_abandonnes: 0, rejets_non_traites: 0 },
};

function avec(change: Partial<{ [K in keyof MesuresSante]: Partial<MesuresSante[K]> }>): MesuresSante {
  return {
    base: { ...SAIN.base, ...change.base },
    drainage: { ...SAIN.drainage, ...change.drainage },
    releve: { ...SAIN.releve, ...change.releve },
    journal_cron: { ...SAIN.journal_cron, ...change.journal_cron },
    files: { ...SAIN.files, ...change.files },
  };
}

function niveauDe(mesures: MesuresSante, point: PointSante) {
  return evaluerSante(mesures, MAINTENANT).voyants.find((v) => v.point === point)?.niveau;
}

describe('evaluerSante', () => {
  it('rend cinq voyants normaux, dans l’ordre de l’écran, sur un système sain', () => {
    const { niveau, voyants } = evaluerSante(SAIN, MAINTENANT);

    expect(niveau).toBe('normal');
    expect(voyants.map((v) => v.point)).toEqual(['drainage', 'releve', 'avis', 'rejets', 'connexions']);
    expect(voyants.every((v) => v.niveau === 'normal' && v.raison.length > 0)).toBe(true);
  });

  describe('le drainage des avis', () => {
    it('reste normal avec un succès il y a 4 min', () => {
      expect(niveauDe(avec({ drainage: { derniere_execution: ilYA(1), dernier_succes: ilYA(4) } }), 'drainage')).toBe('normal');
    });

    it('demande attention sans succès depuis 6 min', () => {
      expect(niveauDe(avec({ drainage: { derniere_execution: ilYA(1), dernier_succes: ilYA(6) } }), 'drainage')).toBe('attention');
    });

    it('demande attention au premier échec sur 24 h', () => {
      expect(niveauDe(avec({ drainage: { echecs_24h: 1 } }), 'drainage')).toBe('attention');
    });

    it('reste en attention, pas en alerte, à 9 min sans exécution', () => {
      expect(niveauDe(avec({ drainage: { derniere_execution: ilYA(9), dernier_succes: ilYA(9) } }), 'drainage')).toBe('attention');
    });

    it('passe en alerte sans exécution depuis 11 min', () => {
      expect(niveauDe(avec({ drainage: { derniere_execution: ilYA(11), dernier_succes: ilYA(11) } }), 'drainage')).toBe('alerte');
    });

    it('passe en alerte quand rien n’a jamais tourné', () => {
      expect(niveauDe(avec({ drainage: { derniere_execution: null, dernier_succes: null } }), 'drainage')).toBe('alerte');
    });
  });

  describe('le relevé quotidien', () => {
    it('est normal avec le relevé d’hier', () => {
      expect(niveauDe(avec({ releve: { dernier_jour: '2026-09-10' } }), 'releve')).toBe('normal');
    });

    it('passe en alerte avec celui d’avant-hier', () => {
      expect(niveauDe(avec({ releve: { dernier_jour: '2026-09-09' } }), 'releve')).toBe('alerte');
    });

    it('passe en alerte sans aucun relevé', () => {
      expect(niveauDe(avec({ releve: { dernier_jour: null } }), 'releve')).toBe('alerte');
    });
  });

  describe('les avis clients', () => {
    it('restent normaux avec un avis en attente depuis 14 min', () => {
      expect(niveauDe(avec({ files: { avis_en_attente: 1, avis_plus_ancien: ilYA(14) } }), 'avis')).toBe('normal');
    });

    it('demandent attention au-delà de 15 min', () => {
      expect(niveauDe(avec({ files: { avis_en_attente: 1, avis_plus_ancien: ilYA(16) } }), 'avis')).toBe('attention');
    });

    it('demandent attention dès un avis abandonné', () => {
      expect(niveauDe(avec({ files: { avis_abandonnes: 1 } }), 'avis')).toBe('attention');
    });
  });

  describe('les rejets de synchro', () => {
    it('passent en alerte dès le premier, et le disent', () => {
      const voyant = evaluerSante(avec({ files: { rejets_non_traites: 2 } }), MAINTENANT).voyants.find(
        (v) => v.point === 'rejets',
      );
      expect(voyant?.niveau).toBe('alerte');
      expect(voyant?.raison).toMatch(/2 rejets/);
    });
  });

  describe('les connexions', () => {
    it('restent normales à 47 sur 60', () => {
      expect(niveauDe(avec({ base: { connexions: 47 } }), 'connexions')).toBe('normal');
    });

    it('demandent attention à 48 sur 60, soit 80 %', () => {
      expect(niveauDe(avec({ base: { connexions: 48 } }), 'connexions')).toBe('attention');
    });
  });

  it('prend le pire des cinq pour niveau général', () => {
    const mesures = avec({ drainage: { echecs_24h: 1 }, files: { rejets_non_traites: 1 } });
    expect(evaluerSante(mesures, MAINTENANT).niveau).toBe('alerte');
  });
});
```

- [ ] **Étape 2 : la voir rouge**

Run : `npm run test -w @kolek/core -- sante`
Attendu : échec du fichier — `Failed to resolve import "./sante"`.

- [ ] **Étape 3 : écrire `sante.ts`**

`packages/core/src/sante.ts` :

```ts
/**
 * La santé du système, jugée.
 *
 * La base mesure (`sante_systeme()`), cette fonction juge, l'écran affiche. Le
 * jugement vit ici plutôt qu'en SQL parce qu'il n'autorise rien : ce sont des
 * seuils de lecture, et une fonction pure se prouve seuil par seuil, de part
 * et d'autre, sans base.
 *
 * Aucun seuil sur la taille de la base ni sur le cache : le plafond du forfait
 * Supabase n'est pas connu, et un voyant réglé sur un plafond inventé serait
 * un chiffre qu'on ne sait pas (Design System, §2, principe 7).
 */

export type NiveauSante = 'normal' | 'attention' | 'alerte';
export type PointSante = 'drainage' | 'releve' | 'avis' | 'rejets' | 'connexions';

/** Ce que `sante_systeme()` mesure, sans les relevés. */
export interface MesuresSante {
  base: { taille: number; connexions: number; max_connexions: number; cache_pct: number | null };
  drainage: {
    derniere_execution: string | null;
    dernier_succes: string | null;
    executions_24h: number;
    echecs_24h: number;
  };
  releve: { dernier_jour: string | null };
  journal_cron: { lignes: number; taille: number };
  files: {
    avis_en_attente: number;
    avis_plus_ancien: string | null;
    avis_abandonnes: number;
    rejets_non_traites: number;
  };
}

export interface Voyant {
  point: PointSante;
  libelle: string;
  niveau: NiveauSante;
  /** Une phrase : ce qui a été constaté, pas ce qu'il faut en penser. */
  raison: string;
}

export interface EvaluationSante {
  /** Le pire des cinq. */
  niveau: NiveauSante;
  voyants: Voyant[];
}

const RANG: Record<NiveauSante, number> = { normal: 0, attention: 1, alerte: 2 };

function minutesDepuis(iso: string, maintenant: Date): number {
  return (maintenant.getTime() - new Date(iso).getTime()) / 60_000;
}

function nombre(n: number, un: string, plusieurs: string): string {
  return `${n} ${n > 1 ? plusieurs : un}`;
}

/** « 2026-09-10 » → « 10/09/2026 ». */
function jourCourt(jour: string): string {
  const [annee, mois, j] = jour.split('-');
  return `${j}/${mois}/${annee}`;
}

function drainage(m: MesuresSante['drainage'], maintenant: Date): Voyant {
  const point = { point: 'drainage' as const, libelle: 'Drainage des avis' };

  if (!m.derniere_execution) {
    return { ...point, niveau: 'alerte', raison: 'Aucune exécution enregistrée.' };
  }
  if (minutesDepuis(m.derniere_execution, maintenant) > 10) {
    return { ...point, niveau: 'alerte', raison: 'Aucune exécution depuis plus de 10 min.' };
  }
  if (m.echecs_24h > 0) {
    return { ...point, niveau: 'attention', raison: `${nombre(m.echecs_24h, 'échec', 'échecs')} sur 24 h.` };
  }
  if (!m.dernier_succes || minutesDepuis(m.dernier_succes, maintenant) > 5) {
    return { ...point, niveau: 'attention', raison: 'Aucun succès depuis plus de 5 min.' };
  }
  return { ...point, niveau: 'normal', raison: 'Exécuté avec succès il y a moins de 5 min.' };
}

function releve(m: MesuresSante['releve'], maintenant: Date): Voyant {
  const point = { point: 'releve' as const, libelle: 'Relevé quotidien' };
  // Abidjan est à UTC+0 : le jour UTC est le sien.
  const hier = new Date(maintenant.getTime() - 86_400_000).toISOString().slice(0, 10);

  if (!m.dernier_jour) {
    return { ...point, niveau: 'alerte', raison: 'Aucun relevé enregistré.' };
  }
  return {
    ...point,
    niveau: m.dernier_jour < hier ? 'alerte' : 'normal',
    raison: `Dernier relevé le ${jourCourt(m.dernier_jour)}.`,
  };
}

function avis(m: MesuresSante['files'], maintenant: Date): Voyant {
  const point = { point: 'avis' as const, libelle: 'Avis clients' };

  if (m.avis_abandonnes > 0) {
    return {
      ...point,
      niveau: 'attention',
      raison: `${nombre(m.avis_abandonnes, 'avis abandonné', 'avis abandonnés')} après 3 tentatives.`,
    };
  }
  if (m.avis_en_attente > 0 && m.avis_plus_ancien && minutesDepuis(m.avis_plus_ancien, maintenant) > 15) {
    return { ...point, niveau: 'attention', raison: 'Un avis attend depuis plus de 15 min.' };
  }
  return {
    ...point,
    niveau: 'normal',
    raison: m.avis_en_attente > 0 ? `${nombre(m.avis_en_attente, 'avis', 'avis')} en cours d’envoi.` : 'Aucun avis en attente.',
  };
}

function rejets(m: MesuresSante['files']): Voyant {
  const point = { point: 'rejets' as const, libelle: 'Rejets de synchro' };

  if (m.rejets_non_traites > 0) {
    return {
      ...point,
      niveau: 'alerte',
      raison: `${nombre(m.rejets_non_traites, 'rejet', 'rejets')} à arbitrer : de l’argent a changé de main.`,
    };
  }
  return { ...point, niveau: 'normal', raison: 'Aucun rejet en attente.' };
}

function connexions(m: MesuresSante['base']): Voyant {
  const point = { point: 'connexions' as const, libelle: 'Connexions' };
  const constat = `${m.connexions} sur ${m.max_connexions}.`;

  if (m.max_connexions > 0 && m.connexions >= 0.8 * m.max_connexions) {
    return { ...point, niveau: 'attention', raison: constat };
  }
  return { ...point, niveau: 'normal', raison: constat };
}

export function evaluerSante(mesures: MesuresSante, maintenant: Date): EvaluationSante {
  const voyants = [
    drainage(mesures.drainage, maintenant),
    releve(mesures.releve, maintenant),
    avis(mesures.files, maintenant),
    rejets(mesures.files),
    connexions(mesures.base),
  ];

  const niveau = voyants.reduce<NiveauSante>(
    (pire, v) => (RANG[v.niveau] > RANG[pire] ? v.niveau : pire),
    'normal',
  );

  return { niveau, voyants };
}
```

`packages/core/src/index.ts` — ajouter en dernière ligne :

```ts
export * from './sante';
```

- [ ] **Étape 4 : la voir verte**

Run : `npm run test -w @kolek/core` — attendu : tout passe, dont les 17 de `sante`.
Run : `npx tsc -b packages/core` — attendu : muet.

- [ ] **Étape 5 : sonde des fins de ligne et commit**

```bash
git add packages/core/src/sante.ts packages/core/src/sante.test.ts packages/core/src/index.ts
git commit -m "feat(core): juger la sante du systeme, seuil par seuil"
```

---

### Tâche 4 : la courbe — `CourbeEvolution` dans `@kolek/ui`

**Fichiers :**
- Épreuve : `packages/ui/src/CourbeEvolution.test.tsx` (neuf)
- Créer : `packages/ui/src/CourbeEvolution.tsx`
- Modifier : `packages/ui/src/index.ts`

**Interfaces :**
- Produit :
  `export interface PointCourbe { jour: string; valeur: number }` et
  `export function CourbeEvolution(props: { libelle: string; points: PointCourbe[]; formater: (valeur: number) => string })`.

- [ ] **Étape 1 : écrire l'épreuve**

`packages/ui/src/CourbeEvolution.test.tsx` :

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CourbeEvolution } from './CourbeEvolution';

/**
 * Une courbe qui ne ment pas sur ce qu'elle sait.
 *
 * Sous deux relevés, elle ne trace rien : un point seul n'a pas d'évolution,
 * et une ligne tirée jusqu'à lui en inventerait une.
 */

afterEach(cleanup);

const formater = (v: number) => `${v} u`;
const TROIS = [
  { jour: '2026-09-11', valeur: 10 },
  { jour: '2026-09-12', valeur: 30 },
  { jour: '2026-09-13', valeur: 20 },
];

describe('CourbeEvolution', () => {
  it('ne trace rien sans relevé, et le dit', () => {
    const { container } = render(<CourbeEvolution libelle="Taille" points={[]} formater={formater} />);

    expect(screen.getByText(/à partir du deuxième relevé/)).toBeDefined();
    expect(container.querySelector('path')).toBeNull();
  });

  it('donne la valeur d’un relevé unique sans tracer de ligne', () => {
    const { container } = render(
      <CourbeEvolution libelle="Taille" points={[TROIS[0]]} formater={formater} />,
    );

    expect(screen.getByText(/Premier relevé : 10 u/)).toBeDefined();
    expect(container.querySelector('path')).toBeNull();
  });

  it('pose un point par relevé, reliés par une seule ligne', () => {
    const { container } = render(<CourbeEvolution libelle="Taille" points={TROIS} formater={formater} />);

    expect(container.querySelectorAll('circle')).toHaveLength(3);
    const trace = container.querySelector('path')?.getAttribute('d') ?? '';
    expect(trace.startsWith('M')).toBe(true);
    expect(trace.match(/L/g)).toHaveLength(2);
  });

  it('donne le jour et la valeur au focus clavier', () => {
    const { container } = render(<CourbeEvolution libelle="Taille" points={TROIS} formater={formater} />);

    fireEvent.focus(container.querySelectorAll('circle')[1]);

    expect(screen.getByRole('status').textContent).toMatch(/12\ssept.*30 u/);
  });

  it('propose le tableau des valeurs aux lecteurs d’écran', () => {
    render(<CourbeEvolution libelle="Taille" points={TROIS} formater={formater} />);

    const tableau = screen.getByRole('table', { name: 'Taille' });
    // Une ligne d'en-tête et une par relevé.
    expect(tableau.querySelectorAll('tr')).toHaveLength(4);
  });

  it('dessine une série plate au milieu, sans l’étirer', () => {
    const plats = TROIS.map((p) => ({ ...p, valeur: 5 }));
    const { container } = render(<CourbeEvolution libelle="Taille" points={plats} formater={formater} />);

    const hauteurs = [...container.querySelectorAll('circle')].map((c) => c.getAttribute('cy'));
    expect(new Set(hauteurs).size).toBe(1);
    expect(hauteurs[0]).toBe('90');
  });
});
```

- [ ] **Étape 2 : la voir rouge**

Run : `npm run test -w @kolek/ui -- CourbeEvolution`
Attendu : échec du fichier — `Failed to resolve import "./CourbeEvolution"`.

- [ ] **Étape 3 : écrire le composant**

`packages/ui/src/CourbeEvolution.tsx` :

```tsx
import { useState } from 'react';

/**
 * Une série datée, en ligne.
 *
 * Sans bibliothèque : une polyligne et des points tiennent en quelques
 * dizaines de lignes, et une bibliothèque de graphiques pèserait plus que
 * l'écran qui l'afficherait.
 *
 * ## Ce qu'elle refuse de faire
 *
 * Tracer sous deux points. Étirer une série plate sur toute la hauteur — une
 * variation nulle deviendrait un mouvement. Porter seule l'information : le
 * tableau des valeurs est dans le document, pour qui ne voit pas la courbe.
 */

export interface PointCourbe {
  /** `AAAA-MM-JJ`, un jour d'Abidjan. */
  jour: string;
  valeur: number;
}

interface Props {
  /** Ce que la courbe mesure : légende du tableau et nom du graphique. */
  libelle: string;
  /** Du plus ancien au plus récent. */
  points: PointCourbe[];
  formater: (valeur: number) => string;
}

const LARGEUR = 600;
const HAUTEUR = 180;
const MARGE = 12;

/** Lu en UTC, qui est l'heure d'Abidjan : un jour ne glisse pas d'un fuseau à l'autre. */
function jourCourt(jour: string): string {
  return new Date(`${jour}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function CourbeEvolution({ libelle, points, formater }: Props) {
  const [actif, setActif] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <p className="font-body text-sm text-muted-foreground">
        La courbe se dessine à partir du deuxième relevé.
        {points.length === 1 &&
          ` Premier relevé : ${formater(points[0].valeur)}, le ${jourCourt(points[0].jour)}.`}
      </p>
    );
  }

  const valeurs = points.map((p) => p.valeur);
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  const etendue = max - min;

  const x = (i: number) => MARGE + (i * (LARGEUR - 2 * MARGE)) / (points.length - 1);
  const y = (v: number) =>
    etendue === 0 ? HAUTEUR / 2 : MARGE + ((max - v) * (HAUTEUR - 2 * MARGE)) / etendue;

  const trace = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.valeur).toFixed(1)}`)
    .join(' ');
  const pointActif = actif === null ? null : points[actif];
  const premier = points[0];
  const dernier = points[points.length - 1];

  return (
    <figure className="m-0">
      <div className="flex items-baseline justify-between gap-2 mb-2 min-h-5">
        <span className="font-body text-xs text-muted-foreground tabular-nums">{formater(max)}</span>
        <p role="status" className="font-body text-sm font-medium text-ink tabular-nums">
          {pointActif ? `${jourCourt(pointActif.jour)} · ${formater(pointActif.valeur)}` : ''}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        className="w-full h-auto"
        role="group"
        aria-label={`${libelle}, du ${jourCourt(premier.jour)} au ${jourCourt(dernier.jour)}`}
      >
        <path
          d={trace}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle
            key={p.jour}
            cx={x(i)}
            cy={y(p.valeur)}
            r={actif === i ? 5 : 3.5}
            className={actif === i ? 'fill-primary' : 'fill-surface stroke-primary'}
            strokeWidth={1.5}
            tabIndex={0}
            role="img"
            aria-label={`${jourCourt(p.jour)} : ${formater(p.valeur)}`}
            onMouseEnter={() => setActif(i)}
            onMouseLeave={() => setActif(null)}
            onFocus={() => setActif(i)}
            onBlur={() => setActif(null)}
          />
        ))}
      </svg>

      <div className="flex justify-between gap-2 font-body text-xs text-muted-foreground mt-1">
        <span>{jourCourt(premier.jour)}</span>
        <span className="tabular-nums">min. {formater(min)}</span>
        <span>{jourCourt(dernier.jour)}</span>
      </div>

      <table className="sr-only">
        <caption>{libelle}</caption>
        <thead>
          <tr>
            <th scope="col">Jour</th>
            <th scope="col">Valeur</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.jour}>
              <td>{jourCourt(p.jour)}</td>
              <td>{formater(p.valeur)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
```

`packages/ui/src/index.ts` — après la ligne `export { CarteZone } from './CarteZone';` :

```ts
export { CourbeEvolution, type PointCourbe } from './CourbeEvolution';
```

- [ ] **Étape 4 : la voir verte**

Run : `npm run test -w @kolek/ui -- CourbeEvolution` — attendu : 6 passent.
Run : `npx tsc -b packages/ui` — attendu : muet.

- [ ] **Étape 5 : sonde des fins de ligne et commit**

```bash
git add packages/ui/src/CourbeEvolution.tsx packages/ui/src/CourbeEvolution.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): une courbe d'evolution en SVG, qui ne trace pas sous deux releves"
```

---

### Tâche 5 : l'entrée « Santé du système »

**Fichiers :**
- Épreuves : `packages/ui/src/BarreLaterale.test.tsx:123`,
  `apps/admin/src/Coquille.test.tsx:91`,
  `apps/admin/src/ecrans/SuperAdmin.test.tsx` (`describe('la plateforme')`)
- Modifier : `packages/ui/src/Icone.tsx`, `packages/ui/src/BarreLaterale.tsx`
  (`SUPER_SYSTEME`), `apps/admin/src/ecrans/SuperAdmin.tsx` (`ONGLETS`)

**Interfaces :** la clé `'plateforme'` de `CleNavSuper` ne change pas ;
`NomIcone` gagne `'activity'`.

- [ ] **Étape 1 : changer les épreuves**

`packages/ui/src/BarreLaterale.test.tsx`, dans
`remplace le menu entier dans l’espace plateforme` :

```tsx
    expect(screen.getByText('Plateforme')).toBeDefined();
```

devient :

```tsx
    expect(screen.getByText('Santé du système')).toBeDefined();
```

`apps/admin/src/Coquille.test.tsx`, dans `retrouve chaque espace là où on
l’avait laissé` :

```tsx
    fireEvent.click(screen.getByText('Plateforme'));
```

devient :

```tsx
    fireEvent.click(screen.getByText('Santé du système'));
```

`apps/admin/src/ecrans/SuperAdmin.test.tsx`, dans `describe('la plateforme')`,
en première épreuve :

```tsx
  it('porte le titre « Santé du système »', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('plateforme');

    expect(screen.getAllByText('Santé du système').length).toBeGreaterThan(0);
  });
```

- [ ] **Étape 2 : les voir rouges**

Run : `npm run test -w @kolek/ui -- BarreLaterale` — attendu : 1 échec.
Run : `npm run test -w @kolek/admin -- Coquille SuperAdmin` — attendu : 2 échecs.

- [ ] **Étape 3 : l'icône, le libellé, le titre**

`packages/ui/src/Icone.tsx` — dans l'import de `lucide-react`, en première
ligne de la liste :

```ts
  Activity,
```

et en première entrée de `ICONES` :

```ts
  activity: Activity,
```

`packages/ui/src/BarreLaterale.tsx`, dans `SUPER_SYSTEME` :

```ts
  { cle: 'plateforme', icone: 'bar-chart-2', libelle: 'Plateforme', disponible: true },
```

devient :

```ts
  // « Santé du système » depuis le 2026-09-11 : l'onglet ne se contente plus de
  // compter des lignes, il dit si ce qui doit tourner tourne. La clé reste
  // `plateforme` — la renommer toucherait la navigation pour un libellé.
  { cle: 'plateforme', icone: 'activity', libelle: 'Santé du système', disponible: true },
```

`apps/admin/src/ecrans/SuperAdmin.tsx`, dans `ONGLETS` :

```ts
  {
    cle: 'plateforme',
    filAriane: ['Super Admin', 'Plateforme'],
    titre: 'Plateforme',
  },
```

devient :

```ts
  {
    cle: 'plateforme',
    filAriane: ['Super Admin', 'Santé du système'],
    titre: 'Santé du système',
  },
```

- [ ] **Étape 4 : les voir vertes**

Run : `npm run test -w @kolek/ui` et `npm run test -w @kolek/admin` — attendu : tout passe.
Run : `npx tsc -b packages/ui` et `npx tsc -b apps/admin` — attendu : muets.

- [ ] **Étape 5 : sonde des fins de ligne et commit**

```bash
git add packages/ui/src/Icone.tsx packages/ui/src/BarreLaterale.tsx packages/ui/src/BarreLaterale.test.tsx apps/admin/src/Coquille.test.tsx apps/admin/src/ecrans/SuperAdmin.tsx apps/admin/src/ecrans/SuperAdmin.test.tsx
git commit -m "feat(super-admin): l'onglet Plateforme devient Sante du systeme"
```

---

### Tâche 6 : l'écran — synthèse, voyants, cartes, courbe

**Fichiers :**
- Épreuves : `apps/admin/src/ecrans/superadmin/lisible.test.ts` (neuf),
  `apps/admin/src/ecrans/superadmin/Sante.test.tsx` (neuf),
  `apps/admin/src/ecrans/SuperAdmin.test.tsx` (`describe('la plateforme')`)
- Créer : `apps/admin/src/ecrans/superadmin/Sante.tsx`
- Modifier : `apps/admin/src/superadmin.ts`,
  `apps/admin/src/ecrans/superadmin/lisible.ts`,
  `apps/admin/src/ecrans/superadmin/Plateforme.tsx`

**Interfaces :**
- Consomme : `evaluerSante`, `MesuresSante`, `NiveauSante`, `Voyant`,
  `formatMontant` (`@kolek/core`) ; `CourbeEvolution`, `PointCourbe`,
  `CarteStat`, `Carte`, `Icone`, `NomIcone` (`@kolek/ui`).
- Produit : `SanteSysteme`, `ReleveQuotidien`, `EtatSuperAdmin.sante` ;
  `tailleLisible(octets: number): string`, `jourLisible(jour: string): string` ;
  `Sante({ sante, maintenant? })`.

- [ ] **Étape 1 : écrire les épreuves**

`apps/admin/src/ecrans/superadmin/lisible.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { jourLisible, tailleLisible } from './lisible';

describe('tailleLisible', () => {
  it('écrit les octets en unités françaises, avec une insécable avant l’unité', () => {
    expect(tailleLisible(0)).toBe('0\u00a0o');
    expect(tailleLisible(512)).toBe('512\u00a0o');
    expect(tailleLisible(2048)).toBe('2\u00a0Ko');
    // 4 656 Ko, la taille du journal pg_cron mesurée en production.
    expect(tailleLisible(4_767_744)).toBe('4,5\u00a0Mo');
    expect(tailleLisible(19 * 1024 * 1024)).toBe('19\u00a0Mo');
    expect(tailleLisible(3 * 1024 ** 3)).toBe('3\u00a0Go');
  });
});

describe('jourLisible', () => {
  it('lit le jour en UTC, qui est l’heure d’Abidjan', () => {
    expect(jourLisible('2026-09-12')).toMatch(/^12\ssept\.?\s2026$/);
  });
});
```

`apps/admin/src/ecrans/superadmin/Sante.test.tsx` :

```tsx
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SanteSysteme } from '../../superadmin';
import { Sante } from './Sante';

/**
 * L'écran de santé : ce qu'il dit, et ce qu'il refuse de dire.
 *
 * Il ne compare à « mois dernier » que s'il a le relevé d'il y a un mois. Il ne
 * juge pas la taille de la base. Et quand la base n'a rien rendu, il le dit au
 * lieu d'afficher des zéros.
 */

afterEach(cleanup);

const MAINTENANT = new Date('2026-09-11T12:00:00Z');
const ilYA = (minutes: number) => new Date(MAINTENANT.getTime() - minutes * 60_000).toISOString();
const MO = 1024 * 1024;

const SAINE: SanteSysteme = {
  mesure_le: MAINTENANT.toISOString(),
  base: { taille: 19 * MO, connexions: 18, max_connexions: 60, cache_pct: 99.99 },
  drainage: { derniere_execution: ilYA(1), dernier_succes: ilYA(1), executions_24h: 1440, echecs_24h: 0 },
  releve: { dernier_jour: '2026-09-11' },
  journal_cron: { lignes: 27497, taille: 4_767_744 },
  files: { avis_en_attente: 0, avis_plus_ancien: null, avis_abandonnes: 0, rejets_non_traites: 0 },
  releves: [
    { jour: '2026-09-10', taille_base: 18 * MO, volumes: { mises: 800, clients: 60 }, encours_clients: 1 },
    { jour: '2026-09-11', taille_base: 19 * MO, volumes: { mises: 850, clients: 64 }, encours_clients: 1 },
  ],
};

function rendre(sante: SanteSysteme | null | undefined) {
  return render(<Sante sante={sante} maintenant={MAINTENANT} />);
}

describe('la santé du système', () => {
  it('dit que tout fonctionne, et montre les cinq voyants avec leur raison', () => {
    rendre(SAINE);

    expect(screen.getByText('Tout fonctionne')).toBeDefined();
    const voyants = within(screen.getByRole('list', { name: 'Voyants' })).getAllByRole('listitem');
    expect(voyants).toHaveLength(5);
    expect(screen.getByText('Aucun rejet en attente.')).toBeDefined();
  });

  it('nomme le point en alerte, et pourquoi', () => {
    rendre({ ...SAINE, files: { ...SAINE.files, rejets_non_traites: 2 } });

    expect(screen.getByText('1 point en alerte')).toBeDefined();
    expect(screen.getByText(/2 rejets à arbitrer/)).toBeDefined();
  });

  it('dit la santé indisponible, sans rien inventer, quand la base n’a rien rendu', () => {
    for (const absente of [null, undefined]) {
      const { unmount } = rendre(absente);

      expect(screen.getByText(/Santé indisponible/)).toBeDefined();
      expect(screen.queryByText('Tout fonctionne')).toBeNull();
      unmount();
    }
  });

  it('n’écrit pas « vs mois dernier » sans relevé d’au moins trente jours', () => {
    rendre(SAINE);

    expect(screen.queryByText(/vs mois dernier/)).toBeNull();
    expect(screen.getByText(/premier relevé le 10\ssept/)).toBeDefined();
  });

  it('compare au relevé d’il y a trente jours quand il existe', () => {
    rendre({
      ...SAINE,
      releves: [
        { jour: '2026-08-10', taille_base: 10 * MO, volumes: {}, encours_clients: 1 },
        ...SAINE.releves,
      ],
    });

    expect(screen.getByText('+9 Mo vs mois dernier')).toBeDefined();
  });

  it('change de série au clic, et le dit', () => {
    rendre(SAINE);

    const mises = screen.getByRole('button', { name: 'Mises' });
    fireEvent.click(mises);

    expect(mises.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('table', { name: 'Mises' })).toBeDefined();
  });
});
```

Dans `apps/admin/src/ecrans/SuperAdmin.test.tsx`, `describe('la plateforme')`,
après l'épreuve du titre :

```tsx
  it('dit la santé indisponible quand la route ne la rend pas, et garde les volumes', () => {
    poser({ statut: 'ok', etat: ETAT });

    rendre('plateforme');

    expect(screen.getByText(/Santé indisponible/)).toBeDefined();
    expect(screen.getByTestId('plateforme')).toBeDefined();
  });
```

- [ ] **Étape 2 : les voir rouges**

Run : `npm run test -w @kolek/admin -- lisible Sante SuperAdmin`
Attendu : `lisible` échoue (`tailleLisible` n'est pas exporté), `Sante`
échoue (`Failed to resolve import "./Sante"`), et `SuperAdmin` échoue sur
`Santé indisponible`.

- [ ] **Étape 3 : les types**

`apps/admin/src/superadmin.ts` — ajouter après `import { supabase } from './supabase';` :

```ts
import type { MesuresSante } from '@kolek/core';
```

avant `export interface EtatSuperAdmin` :

```ts
/** Un relevé quotidien, tel que `sante_systeme()` le rend. */
export interface ReleveQuotidien {
  jour: string;
  taille_base: number;
  volumes: Record<string, number>;
  encours_clients: number;
}

/**
 * La santé du système, telle que la base la mesure.
 *
 * Les seuils ne sont pas ici : `evaluerSante` (`@kolek/core`) juge ces
 * mesures, et l'écran affiche son jugement.
 */
export interface SanteSysteme extends MesuresSante {
  mesure_le: string;
  /** Du plus ancien au plus récent, quatre-vingt-dix au plus. */
  releves: ReleveQuotidien[];
}
```

et dans `EtatSuperAdmin`, après `paiement?: EtatPaiement | null;` :

```ts
  /** Nulle quand `sante_systeme()` a échoué ; absente quand la route déployée
      est antérieure à cet écran. L'écran traite les deux de la même façon. */
  sante?: SanteSysteme | null;
```

- [ ] **Étape 4 : les mises en forme**

`apps/admin/src/ecrans/superadmin/lisible.ts` — ajouter en fin de fichier :

```ts
const UNITES = ['o', 'Ko', 'Mo', 'Go', 'To'] as const;

/**
 * 19 922 944 → « 19 Mo ». Une décimale sous dix, aucune au-delà, et une
 * insécable avant l'unité : « 19 » et « Mo » ne se séparent pas en fin de
 * ligne.
 */
export function tailleLisible(octets: number): string {
  let valeur = octets;
  let rang = 0;
  while (valeur >= 1024 && rang < UNITES.length - 1) {
    valeur /= 1024;
    rang += 1;
  }
  const nombre =
    rang === 0 || valeur >= 10
      ? Math.round(valeur).toString()
      : Number(valeur.toFixed(1)).toString().replace('.', ',');
  return `${nombre}\u00a0${UNITES[rang]}`;
}

/**
 * « 2026-09-12 » → « 12 sept. 2026 ». Lu en UTC, qui est l'heure d'Abidjan :
 * `dateLisible` lirait minuit dans le fuseau du navigateur, et un poste réglé
 * à l'ouest afficherait la veille.
 */
export function jourLisible(jour: string): string {
  return new Date(`${jour}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
```

- [ ] **Étape 5 : l'écran**

`apps/admin/src/ecrans/superadmin/Sante.tsx` :

```tsx
import { evaluerSante, formatMontant, type NiveauSante, type Voyant } from '@kolek/core';
import {
  Carte,
  CarteStat,
  CourbeEvolution,
  Icone,
  type NomIcone,
  type PointCourbe,
} from '@kolek/ui';
import { useState } from 'react';

import type { ReleveQuotidien, SanteSysteme } from '../../superadmin';
import { jourLisible, tailleLisible } from './lisible';

/**
 * La santé du système : ce qui doit tourner tourne-t-il, et comment la base
 * évolue-t-elle.
 *
 * ## Ce que l'écran s'interdit
 *
 * Comparer à « mois dernier » sans le relevé d'il y a un mois. Juger la taille
 * de la base sans connaître le plafond du forfait. Afficher des zéros quand la
 * base n'a rien rendu. Et laisser la couleur porter seule un niveau : chaque
 * pastille dit sa raison en toutes lettres.
 */

type Serie = 'taille' | 'mises' | 'clients' | 'cartes_actives' | 'audit_log';

const SERIES: Array<{ cle: Serie; libelle: string }> = [
  { cle: 'taille', libelle: 'Base' },
  { cle: 'mises', libelle: 'Mises' },
  { cle: 'clients', libelle: 'Clients' },
  { cle: 'cartes_actives', libelle: 'Cartes actives' },
  { cle: 'audit_log', libelle: 'Journal' },
];

const ASPECT: Record<NiveauSante, { classes: string; icone: NomIcone; mot: string }> = {
  normal: { classes: 'bg-positive-tint text-positive', icone: 'check-circle', mot: 'Normal' },
  // Pas de jeton « avertissement » dans le Design System : l'or en fond, l'encre
  // en texte. L'or en texte sur fond clair ne tiendrait pas le contraste.
  attention: { classes: 'bg-or/20 text-ink', icone: 'info', mot: 'Attention' },
  alerte: { classes: 'bg-negative-tint text-negative', icone: 'alert-circle', mot: 'Alerte' },
};

function synthese(voyants: Voyant[]): string {
  const alertes = voyants.filter((v) => v.niveau === 'alerte').length;
  const attentions = voyants.filter((v) => v.niveau === 'attention').length;
  if (alertes === 0 && attentions === 0) return 'Tout fonctionne';

  const parts: string[] = [];
  if (alertes > 0) parts.push(`${alertes} ${alertes > 1 ? 'points en alerte' : 'point en alerte'}`);
  if (attentions > 0) {
    parts.push(
      `${attentions} ${attentions > 1 ? 'points demandent attention' : 'point demande attention'}`,
    );
  }
  return parts.join(' · ');
}

/** Une clé absente d'un relevé ancien n'est pas un zéro : le point est omis. */
function pointsDe(releves: ReleveQuotidien[], serie: Serie): PointCourbe[] {
  return releves.flatMap((r) => {
    const valeur = serie === 'taille' ? r.taille_base : r.volumes[serie];
    return typeof valeur === 'number' ? [{ jour: r.jour, valeur }] : [];
  });
}

/** Le plus récent des relevés d'au moins trente jours, ou rien. */
function referenceDuMois(releves: ReleveQuotidien[], maintenant: Date): ReleveQuotidien | null {
  const limite = new Date(maintenant.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const anciens = releves.filter((r) => r.jour <= limite);
  return anciens.length > 0 ? anciens[anciens.length - 1] : null;
}

export function Sante({
  sante,
  maintenant,
}: {
  sante: SanteSysteme | null | undefined;
  /** L'instant du jugement. Fourni par les épreuves ; l'heure courante sinon. */
  maintenant?: Date;
}) {
  const [serie, setSerie] = useState<Serie>('taille');

  if (!sante) {
    return (
      <Carte className="p-5">
        <p className="font-body text-sm text-muted-foreground">
          Santé indisponible : la base n'a pas rendu ses mesures. Les volumes ci-dessous restent à
          jour.
        </p>
      </Carte>
    );
  }

  const instant = maintenant ?? new Date();
  const { niveau, voyants } = evaluerSante(sante, instant);
  const aspectGeneral = ASPECT[niveau];

  const reference = referenceDuMois(sante.releves, instant);
  const ecart = reference ? sante.base.taille - reference.taille_base : 0;
  const precisionBase = reference
    ? `${ecart >= 0 ? '+' : '-'}${tailleLisible(Math.abs(ecart))} vs mois dernier`
    : sante.releves.length > 0
      ? `premier relevé le ${jourLisible(sante.releves[0].jour)}`
      : 'aucun relevé encore';

  const libelleSerie = SERIES.find((s) => s.cle === serie)!.libelle;
  const heure = new Date(sante.mesure_le).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="sante-titre">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`flex items-center gap-2 px-3 py-1.5 rounded-pill font-body text-sm font-semibold ${aspectGeneral.classes}`}
        >
          <Icone nom={aspectGeneral.icone} taille={16} />
          <span id="sante-titre">{synthese(voyants)}</span>
        </span>
        <span className="font-body text-sm text-muted-foreground">mesuré à {heure}</span>
      </div>

      <ul aria-label="Voyants" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {voyants.map((v) => {
          const aspect = ASPECT[v.niveau];
          return (
            <li key={v.point} className={`rounded-lg px-4 py-3 ${aspect.classes}`}>
              <p className="flex items-center gap-2 font-body text-sm font-semibold">
                <Icone nom={aspect.icone} taille={15} />
                <span className="sr-only">{aspect.mot} : </span>
                {v.libelle}
              </p>
              <p className="font-body text-xs mt-1">{v.raison}</p>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <CarteStat
          libelle="Taille de la base"
          valeur={tailleLisible(sante.base.taille)}
          precision={precisionBase}
          icone="bar-chart-2"
        />
        <CarteStat
          libelle="Connexions"
          valeur={`${sante.base.connexions} / ${sante.base.max_connexions}`}
          precision="connexions clientes ouvertes"
          icone="users"
        />
        <CarteStat
          libelle="Cache"
          valeur={
            sante.base.cache_pct === null
              ? '—'
              : `${String(sante.base.cache_pct).replace('.', ',')}\u00a0%`
          }
          precision="lectures servies par la mémoire"
          icone="refresh-cw"
        />
        <CarteStat
          libelle="Journal du planificateur"
          valeur={tailleLisible(sante.journal_cron.taille)}
          precision={`${formatMontant(sante.journal_cron.lignes)} lignes · purgé au-delà de 30 jours`}
          icone="history"
        />
      </div>

      <Carte className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-headings font-bold text-lg text-ink">Évolution</h3>
          <div role="group" aria-label="Série affichée" className="flex flex-wrap gap-2">
            {SERIES.map((s) => (
              <button
                key={s.cle}
                type="button"
                aria-pressed={serie === s.cle}
                onClick={() => setSerie(s.cle)}
                className={`px-3 py-1.5 rounded-pill border font-body text-sm font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  serie === s.cle
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-hairline text-ink'
                }`}
              >
                {s.libelle}
              </button>
            ))}
          </div>
        </div>

        <CourbeEvolution
          libelle={libelleSerie}
          points={pointsDe(sante.releves, serie)}
          formater={serie === 'taille' ? tailleLisible : formatMontant}
        />

        {sante.releves.length > 0 && (
          <p className="font-body text-xs text-muted-foreground mt-3">
            Relevés depuis le {jourLisible(sante.releves[0].jour)}, chaque soir à 23 h 55.
          </p>
        )}
      </Carte>
    </section>
  );
}
```

`apps/admin/src/ecrans/superadmin/Plateforme.tsx` — ajouter après
`import type { EtatSuperAdmin } from '../../superadmin';` :

```tsx
import { Sante } from './Sante';
```

Remplacer l'ouverture du rendu :

```tsx
  return (
    <section>
      <h2 className="font-headings font-bold text-xl text-ink mb-1">Plateforme</h2>
```

par :

```tsx
  return (
    <div className="flex flex-col gap-6">
      <Sante sante={etat.sante} />

    <section>
      <h2 className="font-headings font-bold text-xl text-ink mb-1">Volumes et journal</h2>
```

et la fermeture :

```tsx
      </div>
    </section>
  );
}
```

par :

```tsx
      </div>
    </section>
    </div>
  );
}
```

(L'indentation du `<section>` existant est gardée telle quelle : le fichier
porte déjà un `<div data-testid>` désindenté, et réindenter tout le bloc
noierait la modification dans le diff.)

- [ ] **Étape 6 : les voir vertes**

Run : `npm run test -w @kolek/admin` — attendu : tout passe.
Run : `npx tsc -b apps/admin` — attendu : muet.
Run : `npx oxlint apps/admin/src` — attendu : aucune erreur nouvelle.

- [ ] **Étape 7 : sonde des fins de ligne et commit**

```bash
git add apps/admin/src/superadmin.ts apps/admin/src/ecrans/superadmin/lisible.ts apps/admin/src/ecrans/superadmin/lisible.test.ts apps/admin/src/ecrans/superadmin/Sante.tsx apps/admin/src/ecrans/superadmin/Sante.test.tsx apps/admin/src/ecrans/superadmin/Plateforme.tsx apps/admin/src/ecrans/SuperAdmin.test.tsx
git commit -m "feat(super-admin): l'ecran de sante, voyants, cartes et courbe"
```

---

### Tâche 7 : la chaîne complète, un regard en local, les écarts

**Fichiers :** ce plan (section « Écarts »).

- [ ] **Étape 1 : la chaîne**

Vérifier la pile (`npx supabase status` : `FUNCTIONS_URL` présent, runtime non
listé parmi les services arrêtés), puis `npm run verifier`, journal dans le
répertoire temporaire. Attendu : `verifier exit=0` **lu dans le journal** — le
code de sortie d'un `echo` final ne prouve rien —, quinze commandes, dont
`test:db` avec les épreuves neuves.

- [ ] **Étape 2 : un regard, en local seulement**

Un compte super admin **local** d'abord. Le script lit les clés dans
`supabase/tests/.env.test` (écrit par `db:env`), refuse toute adresse qui
n'est pas `127.0.0.1`, et n'affiche aucune clé. Il s'écrit dans le répertoire
temporaire de la session, jamais dans le dépôt :

```js
// super-admin-local.mjs — pile locale uniquement
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
const { data, error } = await admin.auth.admin.createUser({
  email: 'sante@kolek.test',
  password: 'kolek-local-2026',
  email_confirm: true,
  user_metadata: { nom: 'Essai sante', telephone: '+2250700009999' },
});
if (error) throw error;
const { error: erreurAdmin } = await admin
  .from('admins')
  .insert({ user_id: data.user.id, niveau: 'super' });
if (erreurAdmin) throw erreurAdmin;
console.log('Compte local pret : sante@kolek.test');
```

Run : `node <répertoire temporaire>/super-admin-local.mjs`

Le port 5175 porte déjà un serveur collecteur d'une session précédente :
l'admin local part en **5176**, variables en ligne — Vite ne remplace jamais
une variable déjà présente dans l'environnement par celle du `.env` —, en
arrière-plan :

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY="$(grep '^SUPABASE_ANON_KEY=' supabase/tests/.env.test | cut -d= -f2-)" \
npm run dev -w @kolek/admin -- --port 5176 --strictPort
```

Avant de passer la main : `curl -s http://localhost:5176/` rend la page, et le
bundle servi contient `127.0.0.1:54321` — pas l'adresse de production.
L'exploitant ouvre `http://localhost:5176`, se connecte avec
`sante@kolek.test`, bascule en Super Admin, ouvre « Santé du système » et
relève : synthèse, cinq pastilles, quatre cartes, « à partir du deuxième
relevé » (un seul relevé en local). Le serveur est ensuite arrêté ; le compte
disparaît au prochain `db reset`.

- [ ] **Étape 3 : écarts et commit**

Section `## Écarts` en fin de ce plan : durée du relevé mesurée (tâche 1),
tout ce qui a divergé, ou « aucun ».

```bash
git add Docs/plans/2026-09-11-sante-systeme.md Docs/specs/2026-09-11-sante-systeme-design.md
git commit -m "docs: la sante du systeme, ecarts et verification"
```

---

## Mise en production — chaque geste sur accord explicite

1. **Fusion** dans `main` en local, avance rapide si possible ; chaîne relancée
   sur le résultat.
2. **Avant la migration** : `npx supabase migration list --linked` (lecture
   seule). Attendu : seule `20260911120000` manque au distant.
3. **`npx supabase db push`** — **accord n° 1**. Puis, en lecture seule et en
   agrégats :

   ```sql
   select (select count(*) from public.releves_quotidiens) as releves,
          (select string_agg(jobname, ' | ' order by jobname) from cron.job) as travaux;
   ```

   Attendu : `releves = 1`, trois travaux.
4. **Poussée de `main`** par PowerShell — **accord n° 2**. Puis : le job des
   fonctions déploie `super-admin-etat` (et elle seule) ; `admin.kolek.cash`
   sert l'empreinte du build local ; les deux autres fronts, relevés et
   expliqués.
5. **Le lendemain** : `releves = 2` en production — le travail de 23 h 55 a
   tourné. **Après le 2026-09-22** : plus aucune trace de plus de 30 jours dans
   `cron.job_run_details`.

## Retour arrière — sur décision seulement

Une migration neuve, jamais une réécriture de `20260911120000` :

```sql
select cron.unschedule('kolek-releve-quotidien');
select cron.unschedule('kolek-purge-journal-cron');
drop function public.sante_systeme();
drop function public.purger_journal_cron(integer);
drop function public.releve_du_jour();
drop table public.releves_quotidiens;
```

La route tolère l'absence de `sante_systeme` : l'écran dira « santé
indisponible », rien d'autre ne casse. Aucune donnée métier n'est perdue ; les
traces pg_cron déjà purgées, elles, ne reviennent pas.
