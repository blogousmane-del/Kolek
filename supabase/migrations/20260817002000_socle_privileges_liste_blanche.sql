-- ===========================================================================
-- Privilèges : liste blanche complète, et fin de l'héritage par défaut
-- ===========================================================================
-- Écrite après l'audit du projet distant du 2026-08-17, qui a trouvé une faille
-- exploitable que trois relectures et cinquante tests locaux avaient manquée.
--
-- LA CAUSE. Supabase pose sur le schéma `public` des privilèges par défaut qui
-- accordent INSERT, SELECT, UPDATE, DELETE et MAINTAIN à `anon` et
-- `authenticated` sur *toute* table qui y sera créée :
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public → anon = arwdm, authenticated = arwdm
--
-- Le conteneur local ne les pose pas. D'où cinquante tests verts sur une base
-- qui n'avait pas la même forme que la vraie.
--
-- CE QUE ÇA CASSE. En PostgreSQL, `GRANT INSERT (a, b, c)` n'a jamais restreint
-- quoi que ce soit : il *ajoute* à ce qui existe. Restreindre exige de révoquer
-- d'abord. Les migrations 1 à 3 n'ont jamais révoqué. Chacun de leurs `grant`
-- colonne était donc un ajout à un privilège déjà total, et n'a rien borné.
--
-- LA CONSÉQUENCE, trouvée en distant. `cartes.mises_encaissees` devait être
-- inécrivable — le `grant insert (id, collecteur_id, client_id, mise)` de la
-- migration 1 était là pour ça. Il ne l'a jamais été. La politique RLS ne
-- vérifie que le propriétaire de la ligne, et la contrainte accepte 0 à 31. Un
-- collecteur authentifié pouvait donc ouvrir une carte à 30 mises encaissées :
-- une seule vraie mise la portait à 31, et le solde restituable affichait
-- trente fois la mise — de l'argent jamais déposé, inscrit au passif de GTCS.
--
-- LE PRINCIPE RETENU. On cesse de rapiécer table par table. On révoque tout,
-- on tue le défaut pour que les tables de J2a ne rouvrent pas le trou, on
-- réaccorde exactement ce dont le produit a besoin, et le garde-fou final
-- compare l'état effectif à la liste blanche entière — au lieu d'énumérer des
-- interdits connus, ce que faisaient les deux précédents, et qui est
-- précisément pourquoi ils n'ont pas vu `mises_encaissees`.

-- ---------------------------------------------------------------------------
-- 1. Table rase sur les deux rôles clients
-- ---------------------------------------------------------------------------
-- `service_role` n'est pas touché : il est censé tout pouvoir, et son garde-fou
-- à lui ce sont les déclencheurs d'immuabilité — RLS ne le filtre pas.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fin de l'héritage — sans quoi `annulations` naîtra ouverte en J2a
-- ---------------------------------------------------------------------------
-- Les privilèges par défaut ne sont pas rétroactifs : ils s'appliquent à la
-- création. Les révoquer maintenant ne change rien aux neuf tables existantes,
-- déjà traitées à la section 1 — mais c'est la seule ligne qui empêche chaque
-- table future de repartir avec les cinq privilèges.
--
-- `alter default privileges` ne porte que sur le rôle qui l'exécute. Les
-- migrations tournent en `postgres`, et c'est bien l'entrée `postgres` que
-- l'audit a relevée. L'entrée `supabase_admin` subsiste, sans effet ici : elle
-- ne s'applique qu'aux objets créés par ce rôle, ce que ce dépôt ne fait jamais.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Liste blanche — tout ce que le produit a le droit de faire, et rien d'autre
-- ---------------------------------------------------------------------------
-- `anon` n'apparaît nulle part ci-dessous, et c'est intentionnel : on se
-- connecte avant de toucher la moindre donnée. Le rôle anonyme ne sert qu'à
-- porter la requête de connexion, qui ne passe pas par ces tables.

-- Le collecteur lit sa fiche et corrige son profil. Ni son palier, ni son
-- identifiant : la ligne est créée par le trigger d'inscription.
grant select                        on public.collecteurs to authenticated;
grant update (nom, telephone, zone) on public.collecteurs to authenticated;

-- `id` est insérable — il vient du téléphone, c'est la clé de la souscription
-- hors-ligne. Sa réécriture, elle, reste fermée. `cree_le` est un horodatage
-- serveur et n'est ni l'un ni l'autre.
grant select on public.clients to authenticated;
grant insert (id, collecteur_id, nom, telephone, photo_url, marche, activite)
  on public.clients to authenticated;
grant update (nom, telephone, photo_url, marche, activite)
  on public.clients to authenticated;

-- Le cœur du correctif. `mises_encaissees`, `statut`, `ouverte_le` et
-- `cloturee_le` sont désormais hors de portée : la première est tenue par le
-- déclencheur qui compte les mises, les autres par la clôture de cycle.
grant select on public.cartes to authenticated;
grant insert (id, collecteur_id, client_id, mise) on public.cartes to authenticated;

-- Registre en ajout seul : aucun update, aucun delete, pas même en colonne.
-- `est_commission` reste au serveur — J2a la supprimera de toute façon.
grant select on public.mises to authenticated;
grant insert (id, collecteur_id, carte_id, montant, encaisse_le)
  on public.mises to authenticated;

-- Le retrait s'écrit en J3, et par une Edge Function : le collecteur le lit
-- seulement.
grant select on public.retraits to authenticated;

-- `cash_attendu` est recalculé par le serveur à chaque mise, `ecart` est une
-- colonne engendrée. Le collecteur ne déclare que son cash.
grant select on public.caisses_jour to authenticated;
grant insert (id, collecteur_id, date, cash_declare) on public.caisses_jour to authenticated;
grant update (cash_declare)                          on public.caisses_jour to authenticated;

-- `traite` est la décision de l'administrateur : insérable non, modifiable oui.
grant select on public.synchro_rejets to authenticated;
grant insert (id, collecteur_id, charge_utile, motif) on public.synchro_rejets to authenticated;
grant update (traite)                                 on public.synchro_rejets to authenticated;

-- `audit_log` et `admins` n'apparaissent pas : RLS y est active sans aucune
-- politique, donc verrou total. La section 1 leur a retiré les privilèges que
-- la plateforme avait accordés, et rien ne les rend.

-- Seule fonction appelable, et le portillon du Dashboard en dépend.
grant execute on function public.est_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Garde-fou 1 — privilèges de table : ni surplus, ni manque
-- ---------------------------------------------------------------------------
do $$
declare surplus text; manquants text;
begin
  with attendu(qui, quoi, priv) as (
    values ('authenticated','collecteurs','SELECT'),
           ('authenticated','clients','SELECT'),
           ('authenticated','cartes','SELECT'),
           ('authenticated','mises','SELECT'),
           ('authenticated','retraits','SELECT'),
           ('authenticated','caisses_jour','SELECT'),
           ('authenticated','synchro_rejets','SELECT')
  ),
  reel(qui, quoi, priv) as (
    select grantee::text, table_name::text, privilege_type::text
      from information_schema.table_privileges
     where table_schema = 'public'
       and grantee in ('anon', 'authenticated')
  )
  select (select string_agg(qui||'.'||quoi||'.'||priv, ', ' order by qui||'.'||quoi||'.'||priv)
            from (select * from reel except select * from attendu) s),
         (select string_agg(qui||'.'||quoi||'.'||priv, ', ' order by qui||'.'||quoi||'.'||priv)
            from (select * from attendu except select * from reel) m)
    into surplus, manquants;

  if surplus is not null then
    raise exception 'Privilèges de table non prévus : %', surplus;
  end if;
  if manquants is not null then
    raise exception 'Privilèges de table attendus et absents : %', manquants;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Garde-fou 2 — colonnes écrivables : la liste exacte, au caractère près
-- ---------------------------------------------------------------------------
-- C'est ce contrôle-ci qui aurait attrapé `cartes.mises_encaissees`. Les deux
-- garde-fous des migrations précédentes énuméraient ce qui est interdit ; on ne
-- peut pas interdire ce à quoi on n'a pas pensé. Celui-ci énumère ce qui est
-- permis, et refuse tout le reste.
do $$
declare surplus text; manquants text;
begin
  with attendu(qui, quoi, col, priv) as (
    values ('authenticated','clients','id','INSERT'),
           ('authenticated','clients','collecteur_id','INSERT'),
           ('authenticated','clients','nom','INSERT'),
           ('authenticated','clients','telephone','INSERT'),
           ('authenticated','clients','photo_url','INSERT'),
           ('authenticated','clients','marche','INSERT'),
           ('authenticated','clients','activite','INSERT'),
           ('authenticated','clients','nom','UPDATE'),
           ('authenticated','clients','telephone','UPDATE'),
           ('authenticated','clients','photo_url','UPDATE'),
           ('authenticated','clients','marche','UPDATE'),
           ('authenticated','clients','activite','UPDATE'),
           ('authenticated','collecteurs','nom','UPDATE'),
           ('authenticated','collecteurs','telephone','UPDATE'),
           ('authenticated','collecteurs','zone','UPDATE'),
           ('authenticated','cartes','id','INSERT'),
           ('authenticated','cartes','collecteur_id','INSERT'),
           ('authenticated','cartes','client_id','INSERT'),
           ('authenticated','cartes','mise','INSERT'),
           ('authenticated','mises','id','INSERT'),
           ('authenticated','mises','collecteur_id','INSERT'),
           ('authenticated','mises','carte_id','INSERT'),
           ('authenticated','mises','montant','INSERT'),
           ('authenticated','mises','encaisse_le','INSERT'),
           ('authenticated','caisses_jour','id','INSERT'),
           ('authenticated','caisses_jour','collecteur_id','INSERT'),
           ('authenticated','caisses_jour','date','INSERT'),
           ('authenticated','caisses_jour','cash_declare','INSERT'),
           ('authenticated','caisses_jour','cash_declare','UPDATE'),
           ('authenticated','synchro_rejets','id','INSERT'),
           ('authenticated','synchro_rejets','collecteur_id','INSERT'),
           ('authenticated','synchro_rejets','charge_utile','INSERT'),
           ('authenticated','synchro_rejets','motif','INSERT'),
           ('authenticated','synchro_rejets','traite','UPDATE')
  ),
  reel(qui, quoi, col, priv) as (
    select grantee::text, table_name::text, column_name::text, privilege_type::text
      from information_schema.column_privileges
     where table_schema = 'public'
       and grantee in ('anon', 'authenticated')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  )
  select (select string_agg(qui||'.'||quoi||'.'||col||'.'||priv, ', '
                            order by qui||'.'||quoi||'.'||col||'.'||priv)
            from (select * from reel except select * from attendu) s),
         (select string_agg(qui||'.'||quoi||'.'||col||'.'||priv, ', '
                            order by qui||'.'||quoi||'.'||col||'.'||priv)
            from (select * from attendu except select * from reel) m)
    into surplus, manquants;

  if surplus is not null then
    raise exception 'Colonnes écrivables non prévues : %', surplus;
  end if;
  if manquants is not null then
    raise exception 'Colonnes écrivables attendues et absentes : %', manquants;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Garde-fou 3 — l'héritage est bien coupé
-- ---------------------------------------------------------------------------
-- Sans ce contrôle, une future migration Supabase pourrait reposer le défaut
-- sans que personne ne s'en aperçoive avant le prochain audit.
do $$
declare restants text;
begin
  -- `defaclobjtype` est de type `"char"` et non `text` : sans conversion
  -- explicite, PostgreSQL ne sait pas quel opérateur `||` choisir.
  select string_agg(pg_get_userbyid(d.defaclrole) || ':' || d.defaclobjtype::text || ':' || d.defaclacl::text,
                    ' | ')
    into restants
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public'
     and pg_get_userbyid(d.defaclrole) = current_user
     and d.defaclacl::text ~ '(anon|authenticated)=';

  if restants is not null then
    raise exception 'Des privilèges par défaut subsistent pour anon ou authenticated : %', restants;
  end if;
end $$;
