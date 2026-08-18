-- ===========================================================================
-- Le même piège, un schéma plus loin : `storage`. Et deux bornes manquantes.
-- ===========================================================================
-- Écrite après l'audit des vingt contrôles du 2026-08-18.
--
-- LA CAUSE, déjà rencontrée. La migration 20260817002000 a coupé l'héritage des
-- privilèges par défaut sur le schéma `public`. Elle n'a pas regardé ailleurs.
-- L'audit a trouvé la même chose dans `storage` :
--
--   pg_default_acl → postgres / storage / r
--     {…, anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, …}
--
-- Toute table créée dans `storage` par `postgres` naît donc ouverte en lecture
-- et en écriture aux deux rôles clients.
--
-- POURQUOI MAINTENANT, alors qu'il n'y a aucun bucket. Parce que `storage.buckets`
-- est vide *aujourd'hui* et que `clients.photo_url` existe *déjà* : la photo du
-- client est au cahier des charges. Le jour où le bucket arrive, la table naît
-- ouverte et personne ne le voit — c'est mot pour mot l'enchaînement qui a
-- produit F1. Couper l'héritage avant qu'il y ait quelque chose à hériter coûte
-- trois lignes ; le découvrir après coûte un audit.
--
-- CE QUE CETTE MIGRATION NE FAIT PAS. Elle ne crée aucun bucket et n'accorde
-- rien dans `storage`. Le jour venu, les droits s'y poseront en liste blanche,
-- sur le modèle de la migration précédente : bucket privé, écriture restreinte
-- au propriétaire du client, taille bornée, et type réel vérifié sur les octets
-- — jamais sur le `Content-Type` annoncé par le client.

-- ---------------------------------------------------------------------------
-- 1. Fin de l'héritage dans `storage`
-- ---------------------------------------------------------------------------
-- Seules les entrées appartenant au rôle courant peuvent être retirées ici.
-- Celles de `supabase_admin` restent — c'est un rôle de la plateforme, hors de
-- portée d'une migration. Elles ne s'appliquent qu'aux objets créés par lui.
alter default privileges in schema storage revoke all on tables    from anon, authenticated;
alter default privileges in schema storage revoke all on sequences from anon, authenticated;
alter default privileges in schema storage revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Deux bornes que la base ne posait pas
-- ---------------------------------------------------------------------------
-- `cash_declare` est la seule colonne monétaire que le collecteur écrit
-- lui-même, à l'insertion comme à la mise à jour. `ecart` s'en déduit par
-- déclencheur. Rien n'interdisait un montant négatif : le rapprochement de fin
-- de journée affichait alors un écart fabriqué. Ça ne détourne pas d'argent —
-- le cash physique tranche — mais une caisse ne se déclare pas en négatif.
alter table public.caisses_jour
  add constraint caisses_cash_declare_positif check (cash_declare >= 0);

-- `mises.montant` n'était borné que par `> 0`. Le déclencheur `mises_avant_insert`
-- refuse déjà tout montant différent de `cartes.mise`, elle-même bornée à
-- 500–10 000 : la contrainte est donc redondante aujourd'hui. Elle est là pour
-- le jour où le déclencheur sera allégé — la borne survivra à sa réécriture.
-- Si les paliers de mise changent, cette borne et `cartes_mise_check` bougent
-- ensemble.
alter table public.mises
  add constraint mises_montant_borne check (montant between 500 and 10000);

-- ---------------------------------------------------------------------------
-- Garde-fou 1 — l'héritage de `storage` est bien coupé
-- ---------------------------------------------------------------------------
do $$
declare restants text;
begin
  select string_agg(pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text || ':' || d.defaclacl::text,
                    ' | ')
    into restants
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'storage'
     and pg_get_userbyid(d.defaclrole) = current_user
     and d.defaclacl::text ~ '(anon|authenticated)=';

  if restants is not null then
    raise exception 'Des privilèges par défaut subsistent dans storage : %', restants;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Garde-fou 2 — aucun bucket n'a été créé à notre insu
-- ---------------------------------------------------------------------------
-- Un bucket qui apparaîtrait sans passer par une migration serait un bucket
-- sans politique écrite. Le jour où le stockage sera introduit, cette liste
-- attendue deviendra la liste des buckets prévus, et ce contrôle continuera de
-- refuser tout ce qui n'y figure pas.
do $$
declare inattendus text;
begin
  select string_agg(id || case when public then ' (PUBLIC)' else '' end, ', ' order by id)
    into inattendus
    from storage.buckets;

  if inattendus is not null then
    raise exception 'Des buckets existent sans politique déclarée : %', inattendus;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Garde-fou 3 — les rôles clients ne peuvent créer d'objet nulle part
-- ---------------------------------------------------------------------------
-- Ce contrôle vaut plus qu'il n'en a l'air. Le `search_path = public` figé sur
-- les huit fonctions SECURITY DEFINER n'est sûr que parce que personne ne peut
-- déposer un objet dans `public` pour en masquer un autre. C'est ici que cette
-- hypothèse est vérifiée, plutôt que supposée.
do $$
declare fautifs text;
begin
  select string_agg(r.rolname || ' sur ' || n.nspname, ', ')
    into fautifs
    from pg_namespace n
    cross join (values ('anon'), ('authenticated')) as r(rolname)
   where n.nspname in ('public', 'storage', 'extensions', 'auth')
     and has_schema_privilege(r.rolname, n.nspname, 'CREATE');

  if fautifs is not null then
    raise exception 'Droit de création accordé à un rôle client : %', fautifs;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Garde-fou 4 — les deux bornes sont bien en place
-- ---------------------------------------------------------------------------
do $$
declare manquantes text;
begin
  select string_agg(attendue, ', ')
    into manquantes
    from (values ('caisses_cash_declare_positif'), ('mises_montant_borne')) as v(attendue)
   where not exists (
     select 1 from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
     where n.nspname = 'public' and c.conname = v.attendue and c.contype = 'c'
   );

  if manquantes is not null then
    raise exception 'Contraintes de borne absentes : %', manquantes;
  end if;
end $$;
