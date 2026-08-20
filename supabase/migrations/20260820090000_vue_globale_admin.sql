-- Vue globale de l'administration GTCS.
--
-- Le portillon `est_admin()` ouvrait jusqu'ici sur une maquette : six écrans de
-- données en dur, un seul appel à la base. Cette migration fournit les chiffres
-- réels — et le fait de manière à ce que la seule façon de les obtenir passe par
-- le serveur.
--
-- Trois décisions, dans l'ordre où elles comptent :
--
-- 1. **La fonction n'est exécutable que par `service_role`.** `REVOKE ALL FROM
--    PUBLIC` puis un seul `GRANT`. Un collecteur authentifié qui l'appellerait
--    depuis son téléphone reçoit `permission denied for function`. Le contrôle
--    d'accès administrateur, lui, vit dans l'Edge Function qui l'appelle : elle
--    vérifie `est_admin()` **sous l'identité de l'appelant** avant de sortir la
--    clé de service. Deux verrous indépendants, aucun des deux dans le
--    navigateur.
--
-- 2. **Elle agrège en SQL, elle ne rend pas les lignes.** Rapatrier `mises` pour
--    la sommer en JavaScript marcherait aujourd'hui — la table est vide — et
--    s'effondrerait au premier collecteur réel : 31 mises par carte et par
--    cycle. La somme se fait là où sont les données.
--
-- 3. **Elle ne connaît aucun prix.** Elle compte les collecteurs par palier ;
--    c'est l'Edge Function qui applique la grille tarifaire, laquelle est
--    engendrée depuis `packages/core/src/paliers.ts`. Inscrire les montants ici
--    en ferait une troisième copie, et l'en-tête de `paliers.ts` dit pourquoi
--    c'est un litige commercial et pas un détail.

create or replace function public.admin_vue_globale()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with
  -- Encaissements par collecteur. `est_commission` distingue la première mise
  -- de chaque carte, qui revient au collecteur, des mises qui restent dues au
  -- client. Le registre porte déjà la distinction : on la lit, on ne la
  -- recalcule pas depuis le modèle.
  mises_par_collecteur as (
    select
      collecteur_id,
      coalesce(sum(montant), 0)                                   as encaisse,
      coalesce(sum(montant) filter (where est_commission), 0)     as commissions,
      coalesce(sum(montant) filter (where not est_commission), 0) as du_aux_clients,
      count(*)                                                    as nb_mises
    from public.mises
    group by collecteur_id
  ),
  retraits_par_collecteur as (
    select
      collecteur_id,
      coalesce(sum(montant_restitue), 0) as restitutions,
      count(*)                           as nb_retraits
    from public.retraits
    group by collecteur_id
  ),
  clients_par_collecteur as (
    select collecteur_id, count(*) as nb_clients
    from public.clients
    group by collecteur_id
  ),
  cartes_par_collecteur as (
    select
      collecteur_id,
      count(*) filter (where statut = 'active') as cartes_actives,
      count(*)                                  as cartes_total
    from public.cartes
    group by collecteur_id
  ),
  -- Une ligne par collecteur, tous compteurs à zéro plutôt qu'à NULL : un
  -- collecteur sans activité doit apparaître à l'écran, pas disparaître.
  par_collecteur as (
    select
      c.id,
      c.nom,
      c.telephone,
      c.zone,
      c.palier,
      c.abonnement_statut,
      c.abonnement_echeance,
      c.cree_le,
      coalesce(cl.nb_clients, 0)      as clients,
      coalesce(ca.cartes_actives, 0)  as cartes_actives,
      coalesce(ca.cartes_total, 0)    as cartes_total,
      coalesce(m.encaisse, 0)         as encaisse,
      coalesce(m.commissions, 0)      as commissions,
      coalesce(m.du_aux_clients, 0)   as du_aux_clients,
      coalesce(m.nb_mises, 0)         as nb_mises,
      coalesce(r.restitutions, 0)     as restitutions,
      coalesce(r.nb_retraits, 0)      as nb_retraits
    from public.collecteurs c
    left join clients_par_collecteur cl on cl.collecteur_id = c.id
    left join cartes_par_collecteur  ca on ca.collecteur_id = c.id
    left join mises_par_collecteur   m  on m.collecteur_id  = c.id
    left join retraits_par_collecteur r on r.collecteur_id  = c.id
  ),
  -- Les vingt derniers mouvements, mises et retraits confondus, pour le fil
  -- d'activité du tableau de bord.
  mouvements as (
    select
      case when m.est_commission then 'commission' else 'mise' end as type,
      cl.nom          as client,
      col.nom         as collecteur,
      m.montant       as montant,
      m.encaisse_le   as survenu_le
    from public.mises m
    join public.cartes      ca  on ca.id  = m.carte_id
    join public.clients     cl  on cl.id  = ca.client_id
    join public.collecteurs col on col.id = m.collecteur_id
    union all
    select
      'restitution',
      cl.nom,
      col.nom,
      -r.montant_restitue,
      r.effectue_le
    from public.retraits r
    join public.cartes      ca  on ca.id  = r.carte_id
    join public.clients     cl  on cl.id  = ca.client_id
    join public.collecteurs col on col.id = r.collecteur_id
    order by survenu_le desc
    limit 20
  )
  select jsonb_build_object(
    'genere_le', now(),

    -- Comptes par palier. Aucun montant : la grille tarifaire vit ailleurs.
    'par_palier', coalesce((
      select jsonb_agg(x order by x->>'palier')
      from (
        select jsonb_build_object(
                 'palier',  palier,
                 'total',   count(*),
                 'actifs',  count(*) filter (where abonnement_statut = 'actif')
               ) as x
        from public.collecteurs
        group by palier
      ) s
    ), '[]'::jsonb),

    'abonnements', (
      select jsonb_build_object(
        'collecteurs_total',   count(*),
        'collecteurs_actifs',  count(*) filter (where abonnement_statut = 'actif'),
        'suspendus',           count(*) filter (where abonnement_statut = 'suspendu'),
        'expires',             count(*) filter (where abonnement_statut = 'expire'),
        'expirations_ce_mois', count(*) filter (
                                 where abonnement_echeance >= date_trunc('month', current_date)::date
                                   and abonnement_echeance <  (date_trunc('month', current_date) + interval '1 month')::date
                               ),
        'expirations_a_venir_30j', count(*) filter (
                                 where abonnement_echeance >= current_date
                                   and abonnement_echeance <= current_date + 30
                               )
      )
      from public.collecteurs
    ),

    'totaux', (
      select jsonb_build_object(
        'clients',        coalesce(sum(clients), 0),
        'cartes_actives', coalesce(sum(cartes_actives), 0),
        'cartes_total',   coalesce(sum(cartes_total), 0),
        'mises',          coalesce(sum(nb_mises), 0),
        'total_encaisse', coalesce(sum(encaisse), 0),
        'commissions',    coalesce(sum(commissions), 0),
        'restitutions',   coalesce(sum(restitutions), 0),
        -- Ce que les collecteurs doivent encore à leurs clients : les mises non
        -- commissionnées, moins ce qui a déjà été restitué.
        'encours_clients', coalesce(sum(du_aux_clients), 0) - coalesce(sum(restitutions), 0)
      )
      from par_collecteur
    ),

    'zones', coalesce((
      select jsonb_agg(x order by x->>'zone')
      from (
        select jsonb_build_object(
                 'zone',        coalesce(zone, 'Sans zone'),
                 'collecteurs', count(*),
                 'clients',     coalesce(sum(clients), 0),
                 'encaisse',    coalesce(sum(encaisse), 0)
               ) as x
        from par_collecteur
        group by coalesce(zone, 'Sans zone')
      ) s
    ), '[]'::jsonb),

    'collecteurs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',                  id,
          'nom',                 nom,
          'telephone',           telephone,
          'zone',                zone,
          'palier',              palier,
          'abonnement_statut',   abonnement_statut,
          'abonnement_echeance', abonnement_echeance,
          'cree_le',             cree_le,
          'clients',             clients,
          'cartes_actives',      cartes_actives,
          'encaisse',            encaisse,
          'commissions',         commissions,
          'restitutions',        restitutions,
          'encours',             du_aux_clients - restitutions
        )
        order by encaisse desc, nom
      )
      from par_collecteur
    ), '[]'::jsonb),

    'mouvements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'type',       type,
          'client',     client,
          'collecteur', collecteur,
          'montant',    montant,
          'survenu_le', survenu_le
        )
        order by survenu_le desc
      )
      from mouvements
    ), '[]'::jsonb)
  );
$fn$;

alter function public.admin_vue_globale() owner to postgres;

comment on function public.admin_vue_globale() is
  'Agrégats de toute la plateforme, pour le Dashboard GTCS. Réservée à service_role : le contrôle est_admin() se fait dans l''Edge Function appelante, sous l''identité de l''appelant.';

-- Le point qui compte. Sans ce revoke, `authenticated` hériterait du droit
-- d'exécution par défaut de PUBLIC, et n'importe quel collecteur lirait la
-- plateforme entière depuis son téléphone — la fonction étant SECURITY DEFINER,
-- la RLS ne l'arrêterait pas.
revoke all on function public.admin_vue_globale() from public;
revoke all on function public.admin_vue_globale() from anon;
revoke all on function public.admin_vue_globale() from authenticated;
grant execute on function public.admin_vue_globale() to service_role;

-- Garde-fou. La ligne `revoke ... from public` ci-dessus est facile à perdre
-- lors d'un `create or replace` ultérieur : PostgreSQL réattribue alors les
-- droits par défaut sans rien dire. Ce bloc échoue la migration plutôt que de
-- laisser passer une fonction d'administration exécutable par un collecteur.
do $garde$
declare
  fautive text;
begin
  select string_agg(p.proname, ', ')
    into fautive
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_vue_globale'
    and (
      has_function_privilege('authenticated', p.oid, 'execute')
      or has_function_privilege('anon', p.oid, 'execute')
    );

  if fautive is not null then
    raise exception
      'GARDE_FOU: %(): exécutable par anon ou authenticated. Une fonction d''administration SECURITY DEFINER ne doit être appelable que par service_role.',
      fautive;
  end if;
end
$garde$;
