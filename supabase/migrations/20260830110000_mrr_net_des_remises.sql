-- Kolek — le MRR annoncé devient celui qu'on encaissera
--
-- ## Le problème que la remise pose
--
-- `admin_vue_globale()` rend des **comptages** par palier ; l'Edge Function les
-- multiplie par la grille tarifaire. C'est l'invariant du 2026-08-20, écrit en
-- toutes lettres dans `admin-vue-globale/index.ts` : « c'est ici, et nulle part
-- ailleurs, que les deux se rencontrent ». Il tient parce qu'un prix qui
-- descend en base finit recopié, et deux copies d'un prix divergent.
--
-- Les codes promo du 2026-08-30 le cassent : trente-huit abonnés Standard dont
-- un à −20 % ne se décrivent plus par un entier.
--
-- ## La sortie
--
-- Le SQL rend, à côté de `actifs`, la somme des remises exprimée en **fraction
-- d'abonnement** : `offerts`. Un collecteur à −20 % vaut 0,2 offert. L'Edge
-- Function calcule `(actifs − offerts) × prix`. Aucun montant n'a traversé la
-- base, et le MRR affiché devient celui que GTCS encaissera vraiment plutôt que
-- le prix catalogue.
--
-- ## Le même filtre que `actifs`
--
-- Une remise ne compte que sur un abonnement `actif` et non échue. Un
-- abonnement suspendu n'encaisse rien : la remise qu'il porte ne coûte rien non
-- plus, et l'inscrire au manque à gagner compterait deux fois la même absence
-- de recette.
--
-- ## Pourquoi la fonction entière est redéclarée
--
-- `create or replace function` n'accepte pas moins. C'est la même méthode que
-- `20260820120000_vue_globale_cartes.sql`, qui l'avait redéclarée pour y
-- ajouter les cartes : le corps ci-dessous est celui en vigueur, relu depuis
-- `pg_get_functiondef`, avec le seul bloc `par_palier` modifié.

CREATE OR REPLACE FUNCTION public.admin_vue_globale()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with
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
  -- Une ligne par carte. `retraits` porte une contrainte d'unicité sur
  -- `carte_id`, donc la jointure ne peut pas dupliquer la ligne.
  --
  -- `collecteur_id` accompagne `collecteur` : la fiche détaillée filtre les
  -- cartes d'un collecteur, et le faire sur le nom mélangerait les cartes de
  -- deux homonymes. Rien n'impose l'unicité de `collecteurs.nom` — seul le
  -- téléphone est unique.
  par_carte as (
    select
      ca.id,
      cl.nom                                       as client,
      col.id                                       as collecteur_id,
      col.nom                                      as collecteur,
      ca.mise,
      ca.mises_encaissees,
      ca.statut,
      ca.ouverte_le,
      -- La première mise est la commission du collecteur : elle ne revient pas
      -- au client. Même règle que `soldeRestituable` dans packages/core.
      greatest(ca.mises_encaissees - 1, 0) * ca.mise as solde_restituable,
      coalesce(r.montant_restitue, 0)                as restitue
    from public.cartes ca
    join public.clients     cl  on cl.id  = ca.client_id
    join public.collecteurs col on col.id = ca.collecteur_id
    left join public.retraits r on r.carte_id = ca.id
  ),
  mouvements as (
    select
      case when m.est_commission then 'commission' else 'mise' end as type,
      cl.nom          as client,
      col.id          as collecteur_id,
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
      col.id,
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

    'par_palier', coalesce((
      select jsonb_agg(x order by x->>'palier')
      from (
        select jsonb_build_object(
                 'palier',  palier,
                 'total',   count(*),
                 'actifs',  count(*) filter (where abonnement_statut = 'actif'),
                 -- La remise en fraction d'abonnement, jamais en francs : un
                 -- collecteur a -20 % vaut 0,2 offert, et l'Edge Function
                 -- multiplie. Meme filtre que `actifs` -- un abonnement
                 -- suspendu n'encaisse rien, donc la remise qu'il porte ne
                 -- coute rien, et l'inscrire au manque a gagner compterait
                 -- deux fois la meme absence de recette.
                 'offerts', coalesce(sum(remise_pct) filter (
                              where abonnement_statut = 'actif'
                                and remise_fin >= current_date
                            ), 0) / 100.0
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
          'type',          type,
          'client',        client,
          'collecteur_id', collecteur_id,
          'collecteur',    collecteur,
          'montant',    montant,
          'survenu_le', survenu_le
        )
        order by survenu_le desc
      )
      from mouvements
    ), '[]'::jsonb),

    'cartes_total_lignes', (select count(*) from par_carte),

    'cartes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',                id,
          'client',            client,
          'collecteur_id',     collecteur_id,
          'collecteur',        collecteur,
          'mise',              mise,
          'mises_encaissees',  mises_encaissees,
          'statut',            statut,
          'ouverte_le',        ouverte_le,
          'solde_restituable', solde_restituable,
          'restitue',          restitue,
          -- Ce qui reste dû sur cette carte : nul dès que la restitution a eu
          -- lieu, puisque `retraits` solde la carte en une fois.
          'encours',           case when restitue > 0 then 0 else solde_restituable end
        )
        order by ouverte_le desc
      )
      from (select * from par_carte order by ouverte_le desc limit 500) borne
    ), '[]'::jsonb)
  );
$function$;


comment on function public.admin_vue_globale is
  'Agrégats de toute la plateforme, pour le Dashboard GTCS. par_palier porte `offerts`, la somme des remises en fraction d''abonnement : les prix restent dans @kolek/core. Réservée à service_role : le contrôle est_admin() se fait dans l''Edge Function appelante, sous l''identité de l''appelant.';

-- Même verrou qu'à chaque redéclaration : `create or replace function`
-- réattribue les droits par défaut sans rien dire. Sans ces lignes, la fonction
-- redeviendrait exécutable par tout compte authentifié — donc par n'importe
-- quel collecteur, qui lirait les chiffres de toute la plateforme.
revoke all on function public.admin_vue_globale() from public, anon, authenticated;
grant execute on function public.admin_vue_globale() to service_role;

do $garde$
begin
  if has_function_privilege('anon', 'public.admin_vue_globale()', 'execute')
     or has_function_privilege('authenticated', 'public.admin_vue_globale()', 'execute') then
    raise exception
      'GARDE_FOU : admin_vue_globale() est exécutable par anon ou authenticated. Une fonction d''administration SECURITY DEFINER ne doit être appelable que par service_role.';
  end if;
end;
$garde$;
