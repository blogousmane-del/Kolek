-- Aucune fonction `security definer` de `public` atteignable sans session
--
-- ## Ce que l'audit demandait
--
-- Le 2026-09-02 puis le 2026-09-03 ont relevé trois fonctions `security
-- definer` exécutables par `anon` : `journaliser_admin`, `paiements_immuables`
-- et `paiements_naissance`. Toutes trois rendent `trigger`, donc PostgREST
-- refuse de les exposer (`PGRST202`) et PostgreSQL refuse l'appel direct — elles
-- étaient inertes, et c'est pourquoi elles sont restées jaunes.
--
-- Le 2026-09-03 concluait : « à révoquer par hygiène, pas par urgence — mais le
-- motif se répète à chaque migration, et mériterait un garde-fou ». Les trois
-- ont été refermées depuis. Ce fichier ne les referme donc pas : **il empêche la
-- quatrième**.
--
-- ## Pourquoi un contrôle et pas seulement une révocation
--
-- Une révocation corrige les fonctions du jour. Elle ne dit rien de celle que la
-- prochaine migration écrira, et le défaut naît d'un défaut de fabrique :
-- PostgreSQL accorde `EXECUTE` à `PUBLIC` sur toute fonction neuve. Il ne
-- s'agit donc pas d'un oubli occasionnel mais du comportement par défaut — celui
-- qu'on ne remarque que si quelque chose le regarde.
--
-- Même raisonnement que `20260830131000` pour `search_path` : la migration
-- corrige, le test maintient. Un garde-fou qui ne rejoue pas ne garde rien.
--
-- ## Ce que ce contrôle ne prétend pas
--
-- « Inerte » n'est pas « fermé ». Une fonction `trigger` exposée à `anon` n'est
-- pas appelable aujourd'hui — c'est une propriété de PostgREST et du typage de
-- PostgreSQL, pas une décision de ce dépôt. Le jour où l'une d'elles cesse de
-- rendre `trigger`, elle devient appelable sans session, et rien n'aura changé
-- dans son fichier. C'est cette bascule silencieuse que le contrôle attrape.

create or replace function public.definers_exposes()
returns table (fonction text, droits text)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select
    p.oid::regprocedure::text as fonction,
    coalesce(
      pg_catalog.array_to_string(p.proacl, ' | '),
      'AUCUN ACL — EXECUTE revient donc à PUBLIC'
    ) as droits
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (
      -- Aucun ACL explicite : PostgreSQL accorde EXECUTE à PUBLIC. C'est le
      -- cas par défaut, donc le plus fréquent, donc celui qu'on ne voit pas.
      p.proacl is null
      or exists (
        select 1
          from pg_catalog.aclexplode(p.proacl) a
         where a.privilege_type = 'EXECUTE'
           and (
             -- `grantee = 0` est PUBLIC dans le catalogue.
             a.grantee = 0
             or (select r.rolname from pg_catalog.pg_roles r where r.oid = a.grantee) = 'anon'
           )
      )
    )
  order by 1
$$;

comment on function public.definers_exposes is
  'Rend les fonctions security definer de public dont EXECUTE est atteignable par anon ou par PUBLIC. '
  'Doit toujours rendre zéro ligne : une fonction qui s''exécute avec les droits de son propriétaire '
  'n''a aucune raison d''être appelable sans session. Contrôlée par search-path.test.ts.';

-- Écrite dans la forme qu'elle exige, comme `search_path_definer` : `pg_catalog,
-- pg_temp` et chaque relation du corps qualifiée. Un contrôle que son propre
-- contrôle recalerait ne serait pas un contrôle.
--
-- `service_role` garde l'exécution — c'est sous cette identité que le test
-- l'appelle. Les trois autres partent : la liste des fonctions privilégiées et
-- de leurs droits est une carte, et elle n'a rien à faire dans un navigateur.
revoke all on function public.definers_exposes() from public;
revoke all on function public.definers_exposes() from anon;
revoke all on function public.definers_exposes() from authenticated;

-- --------------------------------- La passe --------------------------------
--
-- Trois fonctions étaient encore ouvertes au 2026-09-09 : `journaliser_admin`,
-- `paiements_immuables` et `paiements_naissance`. Leur ACL portait `=X/postgres`
-- — la forme du catalogue pour « PUBLIC a EXECUTE ». C'est ce qui les avait fait
-- passer pour refermées lors d'une vérification qui cherchait `anon=` : le droit
-- PUBLIC ne nomme personne, et une recherche sur le nom du rôle ne le voit pas.
--
-- La passe est dynamique plutôt que nominative. Trois noms écrits en dur
-- corrigeraient trois fonctions et vieilliraient mal ; la boucle referme ce qui
-- est ouvert le jour où elle s'applique, et le garde-fou en dessous prouve
-- qu'elle a fait son travail.
--
-- Révoquer `EXECUTE` ne casse aucun déclencheur : PostgreSQL ne vérifie pas ce
-- privilège quand il déclenche une fonction `trigger`. C'est la suite de tests
-- qui le confirme, pas ce commentaire — `journal.test.ts` et
-- `paiements.test.ts` écrivent sur les tables concernées.
do $passe$
declare
  f record;
begin
  for f in select fonction from public.definers_exposes() loop
    execute format('revoke all on function %s from public, anon', f.fonction);
    raise notice 'EXECUTE retiré à PUBLIC et anon sur %', f.fonction;
  end loop;
end
$passe$;

-- ------------------------------- Garde-fou ---------------------------------
do $garde$
declare
  restantes text;
begin
  select string_agg(fonction || '  [' || droits || ']', E'\n  ')
    into restantes
    from public.definers_exposes();

  if restantes is not null then
    raise exception
      E'Fonctions security definer atteignables par anon ou PUBLIC :\n  %\n'
      'Une fonction qui s''exécute avec les droits de son propriétaire ne doit pas '
      'être appelable sans session. Ajouter, à la fin de sa migration : '
      '« revoke all on function public.<nom>(<args>) from public, anon; ».', restantes;
  end if;
end
$garde$;
