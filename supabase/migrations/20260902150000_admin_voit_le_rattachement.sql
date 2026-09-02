-- L'administration voit à qui un collaborateur est rattaché.
--
-- Un titulaire et ses trois collaborateurs sont quatre comptes Illimité pour un
-- seul abonnement facturé, depuis 20260902140000. Sans le lien affiché, cet
-- écart ressemble à une erreur de facturation ; avec lui, il se lit.
--
-- La fonction est reprise MOT POUR MOT depuis 20260902140000, avec deux
-- colonnes, une jointure et deux clés en plus, et rien d'autre. `set
-- search_path to 'public', 'pg_temp'` est reporté depuis la source : l'omettre
-- annulerait en silence le durcissement de 20260830131000, que
-- `search-path.test.ts` surveille.

CREATE OR REPLACE FUNCTION public.admin_vue_globale()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
      c.titulaire_id,
      t.nom as titulaire_nom,
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
    -- Le titulaire, pour son nom. `left join` : la très grande majorité des
    -- collecteurs n'en ont pas, et un `join` les ferait tous disparaître de la
    -- liste d'administration.
    left join public.collecteurs t on t.id = c.titulaire_id
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
      greatest(ca.mises_encaissees - 1, 0)::bigint * ca.mise as solde_restituable,
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
                 -- Tout le monde : ce sont des comptes qui existent.
                 'total',   count(*),
                 -- Les abonnements facturés, eux. Un collaborateur ne paie pas :
                 -- son titulaire paie pour lui, et cet abonnement-là est déjà
                 -- compté sur la ligne du titulaire. Sans ce filtre, une équipe
                 -- de quatre est annoncée comme quatre abonnements Illimité.
                 'actifs',  count(*) filter (
                              where abonnement_statut = 'actif'
                                and titulaire_id is null
                            ),
                 -- La remise en fraction d'abonnement, jamais en francs : un
                 -- collecteur a -20 % vaut 0,2 offert, et l'Edge Function
                 -- multiplie. Meme filtre que `actifs` -- un abonnement
                 -- suspendu n'encaisse rien, donc la remise qu'il porte ne
                 -- coute rien, et l'inscrire au manque a gagner compterait
                 -- deux fois la meme absence de recette.
                 'offerts', coalesce(sum(remise_pct) filter (
                              where abonnement_statut = 'actif'
                                and titulaire_id is null
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
          -- Le rattachement, visible dans la liste : un collaborateur apparaît
          -- sous son titulaire, et le MRR ne le compte pas. Sans cette colonne,
          -- l'administration voit quatre comptes Illimité et un seul
          -- abonnement, sans le lien qui explique pourquoi.
          'titulaire_id',        titulaire_id,
          'titulaire_nom',       titulaire_nom,
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

-- ------------------------------- Garde-fou --------------------------------

do $garde$
begin
  if position('titulaire_nom' in
       pg_get_functiondef('public.admin_vue_globale()'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : l''administration ne voit pas le rattachement.';
  end if;

  -- La correction du MRR ne doit pas avoir été perdue à la recopie.
  if position('titulaire_id is null' in
       pg_get_functiondef('public.admin_vue_globale()'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : la recopie a perdu le filtre du MRR.';
  end if;
end;
$garde$;
