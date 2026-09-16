-- Qui lit l'argent en direct, AVANT que la migration ne pose la fonction qui
-- répond à cette question ?
--
-- La migration `20260915130000_lecteurs_directs_argent.sql` finit par un bloc
-- de garde qui échoue si une fonction du schéma cite encore `mises` ou
-- `retraits` hors des deux exemptions. En production, une fonction posée à la
-- main hors migrations ferait donc échouer cette migration-là, les trois
-- précédentes étant déjà appliquées — une poussée à moitié faite.
--
-- Ce relevé pose la même question avant de pousser, par la même expression
-- régulière, sans rien créer. Attendu : exactement les deux exemptions.
select coalesce(
         jsonb_agg(f.fonction order by f.fonction),
         '[]'::jsonb
       ) as releve
  from (
    select p.oid::regprocedure::text as fonction
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname <> 'lecteurs_directs_argent'
       and pg_catalog.pg_get_functiondef(p.oid) ~* '(public\.|from\s+|join\s+)(mises|retraits)\M'
  ) f;
