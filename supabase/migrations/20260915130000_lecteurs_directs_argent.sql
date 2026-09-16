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
