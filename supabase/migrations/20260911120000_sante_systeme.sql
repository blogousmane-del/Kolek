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
