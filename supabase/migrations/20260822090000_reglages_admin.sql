-- Kolek — l'écran Réglages du super-administrateur
--
-- Ce que cette fonction rend n'est pas une seconde vue d'affaires : c'est
-- l'**état de la plateforme** — qui détient les droits, ce que pèse la base, et
-- quelles tables laissent une trace.
--
-- ## Pourquoi une fonction à part plutôt qu'une extension de `admin_vue_globale`
--
-- Étendre l'existante imposerait de recopier ses deux cent cinquante lignes dans
-- une nouvelle migration — `create or replace` ne connaît pas le fragment. Deux
-- copies d'une agrégation d'argent, c'est deux endroits où corriger une règle de
-- commission. Les deux fonctions n'ont d'ailleurs pas le même rythme : l'une est
-- lue à chaque ouverture du tableau de bord, l'autre seulement quand on entre
-- dans les réglages.
--
-- ## Ce qu'elle ne rend pas, et ne rendra pas
--
-- Aucune clé, aucun secret, aucune adresse électronique. La clé de service ne
-- traverse jamais le réseau vers un navigateur — c'est l'invariant qui tient
-- toute l'architecture d'administration, et un écran de réglages est justement
-- l'endroit où la tentation de l'afficher est la plus forte.
--
-- Les administrateurs sont donc identifiés par leur nom et leur téléphone, qui
-- suffisent à savoir qui est qui, et non par l'adresse qui sert à se connecter.

create or replace function public.admin_reglages()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select jsonb_build_object(
    'genere_le', now(),

    -- Qui détient les clés. La table `admins` est la seule source de ce droit ;
    -- la jointure sur `collecteurs` sert à mettre un nom sur un identifiant.
    'administrateurs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id',   a.user_id,
          'nom',       coalesce(c.nom, 'Compte sans fiche'),
          'telephone', c.telephone,
          'ajoute_le', a.cree_le
        )
        order by a.cree_le
      )
      from public.admins a
      left join public.collecteurs c on c.id = a.user_id
    ), '[]'::jsonb),

    -- Ce que pèse la base. Des comptes exacts, pas les estimations de
    -- `pg_class.reltuples` : sur des tables de cette taille l'estimation peut
    -- être fausse de moitié, et un écran de réglages qui annonce un nombre de
    -- mises approximatif ne sert à rien.
    'volumes', jsonb_build_object(
      'collecteurs',  (select count(*) from public.collecteurs),
      'clients',      (select count(*) from public.clients),
      'cartes',       (select count(*) from public.cartes),
      'cartes_actives', (select count(*) from public.cartes where statut = 'active'),
      'mises',        (select count(*) from public.mises),
      'retraits',     (select count(*) from public.retraits),
      'caisses_jour', (select count(*) from public.caisses_jour),
      'audit_log',    (select count(*) from public.audit_log),
      'rejets_non_traites', (select count(*) from public.synchro_rejets where not traite)
    ),

    -- L'état réel du journal d'audit : quelles tables portent un déclencheur, et
    -- quand la dernière ligne est tombée. Lu dans `pg_trigger`, donc c'est la
    -- configuration en vigueur — pas une liste écrite à la main qui deviendrait
    -- fausse à la première migration.
    'journal', jsonb_build_object(
      'derniere_ecriture', (select max(survenu_le) from public.audit_log),
      'tables', coalesce((
        select jsonb_agg(distinct cl.relname order by cl.relname)
        from pg_trigger t
        join pg_class cl on cl.oid = t.tgrelid
        join pg_namespace n on n.oid = cl.relnamespace
        where not t.tgisinternal
          and n.nspname = 'public'
          and t.tgname like '%\_journal'
      ), '[]'::jsonb)
    ),

    -- La version du moteur, pour situer ce qui est disponible. `version()`
    -- rendrait aussi le système et le compilateur ; on n'en garde que le numéro.
    'postgres', split_part(current_setting('server_version'), ' ', 1)
  );
$fn$;

alter function public.admin_reglages() owner to postgres;

comment on function public.admin_reglages() is
  'État de la plateforme pour l''écran Réglages : administrateurs, volumes, journal. Réservée à service_role ; le contrôle est_admin() se fait dans l''Edge Function appelante.';

-- Même verrou que `admin_vue_globale`, et pour la même raison : `create or
-- replace function` réattribue les droits par défaut sans rien dire. Sans ces
-- trois révocations, la fonction redeviendrait exécutable par tout compte
-- authentifié — donc par n'importe quel collecteur, qui lirait la liste des
-- administrateurs de la plateforme.
revoke all on function public.admin_reglages() from public;
revoke all on function public.admin_reglages() from anon;
revoke all on function public.admin_reglages() from authenticated;
grant execute on function public.admin_reglages() to service_role;

do $garde$
begin
  if has_function_privilege('authenticated', 'public.admin_reglages()', 'execute')
     or has_function_privilege('anon', 'public.admin_reglages()', 'execute') then
    raise exception 'GARDE_FOU : admin_reglages() est exécutable sans clé de service.';
  end if;
end
$garde$;
