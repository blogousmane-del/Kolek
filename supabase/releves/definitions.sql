-- L'empreinte des quatre fonctions de lecture et de leurs droits.
--
-- `chr(13)` retiré : une migration du dépôt est en CRLF, et le corps stocké
-- porte ces retours chariot ; le fichier de retour, écrit par Node, est en LF.
-- Le même code rendrait deux empreintes différentes pour cette seule raison.
select jsonb_object_agg(
         p.oid::regprocedure::text,
         md5(replace(pg_get_functiondef(p.oid), chr(13), '')) || ' ' || coalesce(p.proacl::text, 'sans acl')
       ) as releve
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('cash_attendu_du_jour', 'admin_vue_globale', 'admin_tendances', 'equipe_vue');
