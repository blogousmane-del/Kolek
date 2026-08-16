-- Kolek — retirer les privilèges implicites laissés par Supabase
--
-- Constat d'audit du 2026-08-16. Supabase accorde ALL sur les tables du schéma
-- public à anon et authenticated, puis en révoque le DML — mais laisse TRUNCATE,
-- REFERENCES et TRIGGER derrière lui. Nos GRANT explicites ont correctement
-- redonné le DML voulu ; personne n'avait regardé ce qui restait.
--
-- TRUNCATE est le dangereux : il viderait le registre de tous les collecteurs en
-- une instruction, sans déclencher interdire_modification — qui est un FOR EACH
-- ROW sur update et delete — et sans que RLS s'applique. L'immuabilité et
-- l'isolation tomberaient ensemble.
--
-- Inatteignable en l'état : PostgREST n'émet jamais de TRUNCATE, et authenticated
-- n'est pas un rôle de connexion. C'est du privilège dormant, retiré par principe :
-- rien dans le produit n'en a besoin, et il n'a pas à attendre le jour où une
-- fonction RPC ou un accès direct le rende atteignable.

revoke truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

-- Les tables créées par les migrations suivantes ne doivent pas les récupérer.
alter default privileges in schema public
  revoke truncate, references, trigger on tables
  from anon, authenticated;

-- Garde-fou : la reconstruction échoue si l'un de ces privilèges réapparaît,
-- par une migration future ou par un changement de comportement de la plateforme.
do $$
declare restants text;
begin
  select string_agg(distinct grantee || '.' || table_name || '.' || privilege_type, ', ')
    into restants
    from information_schema.table_privileges
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER');

  if restants is not null then
    raise exception 'Privilèges implicites encore présents : %', restants;
  end if;
end $$;
