-- L'administration et l'équipe lisent le registre.
--
-- Spec : Docs/specs/2026-09-15-mouvements-registre-design.md §3.1.
--
-- Les trois fonctions sont reprises de leur définition en vigueur avec une
-- seule substitution : là où elles lisaient `mises` et `retraits`, elles lisent
-- la vue. Mêmes signatures, mêmes clés de sortie, mêmes chiffres sur les mêmes
-- données. Ce qui change est qu'un rattrapage y entre — et il n'y en a aucun
-- en production le jour où cette migration part.

-- ---------------------------------------------------------------------------
-- 1. La vue globale de l'administration
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_vue_globale()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with
  entrees_par_collecteur as (
    select
      collecteur_id,
      coalesce(sum(montant), 0)                                   as encaisse,
      coalesce(sum(montant) filter (where est_commission), 0)     as commissions,
      coalesce(sum(montant) filter (where not est_commission), 0) as du_aux_clients,
      count(*)                                                    as nb_mises
    from public.mouvements
    where sens = 1
    group by collecteur_id
  ),
  -- `nature = 'retrait'` et non `sens = -1` : une restitution est la clôture
  -- d'une carte. Le règlement d'un rattrapage, au chantier suivant, sera une
  -- sortie de caisse sans être une restitution.
  sorties_par_collecteur as (
    select
      collecteur_id,
      coalesce(sum(montant), 0) as restitutions,
      count(*)                  as nb_retraits
    from public.mouvements
    where nature = 'retrait'
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
    left join entrees_par_collecteur m  on m.collecteur_id  = c.id
    left join sorties_par_collecteur r  on r.collecteur_id  = c.id
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
      coalesce(r.montant, 0)                         as restitue
    from public.cartes ca
    join public.clients     cl  on cl.id  = ca.client_id
    join public.collecteurs col on col.id = ca.collecteur_id
    left join public.mouvements r on r.carte_id = ca.id and r.nature = 'retrait'
  ),
  derniers as (
    select
      case
        when mv.nature = 'retrait' then 'restitution'
        when mv.est_commission     then 'commission'
        else mv.nature
      end                    as type,
      cl.nom                 as client,
      col.id                 as collecteur_id,
      col.nom                as collecteur,
      mv.sens * mv.montant   as montant,
      mv.survenu_le          as survenu_le
    from public.mouvements mv
    join public.clients     cl  on cl.id  = mv.client_id
    join public.collecteurs col on col.id = mv.collecteur_id
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
      from derniers
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

alter function public.admin_vue_globale() owner to postgres;

-- `create or replace` garde l'ACL : ces deux lignes ne changent donc rien à une
-- base déjà en règle. Elles sont écrites quand même, comme dans chacune des
-- quatre migrations qui ont repris cette fonction avant celle-ci : une ACL ne se
-- relit dans aucun corps de fonction, et une migration qui la tait laisserait
-- croire qu'elle n'a pas d'avis. Le garde-fou, plus bas, la vérifie.
revoke all on function public.admin_vue_globale() from public, anon, authenticated;
grant execute on function public.admin_vue_globale() to service_role;
-- ---------------------------------------------------------------------------
-- 2. Les tendances du tableau de bord
-- ---------------------------------------------------------------------------
create or replace function public.admin_tendances(p_jours integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_fin              date;
  v_debut            date;
  v_debut_precedent  date;
  v_depuis           date;
  v_debut_serie      date;
  v_resultat         jsonb;
begin
  if p_jours is null or p_jours < 1 or p_jours > 90 then
    raise exception 'PERIODE_INVALIDE : p_jours doit tenir entre 1 et 90, reçu %.', p_jours
      using errcode = '22023';
  end if;

  v_fin             := (now() at time zone 'Africa/Abidjan')::date;
  v_debut           := v_fin - (p_jours - 1);
  v_debut_precedent := v_debut - p_jours;

  select min((survenu_le at time zone 'Africa/Abidjan')::date) into v_depuis
    from public.mouvements where sens = 1;
  -- Quatre-vingt-dix jours de fond de courbe, jamais avant le premier versement.
  v_debut_serie := greatest(coalesce(v_depuis, v_fin), v_fin - 89);

  with
  entrees_jour as (
    select
      (mv.survenu_le at time zone 'Africa/Abidjan')::date             as jour,
      mv.collecteur_id,
      mv.montant,
      mv.est_commission
    from public.mouvements mv
    where mv.sens = 1
  ),
  sorties_jour as (
    select
      (mv.survenu_le at time zone 'Africa/Abidjan')::date             as jour,
      mv.collecteur_id,
      mv.montant
    from public.mouvements mv
    where mv.nature = 'retrait'
  ),
  flux as (
    select
      coalesce(sum(montant), 0)                                      as encaisse,
      coalesce(sum(montant) filter (where est_commission), 0)        as commissions,
      count(*)                                                       as mises
    from entrees_jour
    where jour between v_debut and v_fin
  ),
  flux_retraits as (
    select coalesce(sum(montant), 0) as restitutions, count(*) as retraits
    from sorties_jour
    where jour between v_debut and v_fin
  ),
  flux_p as (
    select
      coalesce(sum(montant), 0)                                      as encaisse,
      coalesce(sum(montant) filter (where est_commission), 0)        as commissions,
      count(*)                                                       as mises
    from entrees_jour
    where jour between v_debut_precedent and v_debut - 1
  ),
  flux_p_retraits as (
    select coalesce(sum(montant), 0) as restitutions, count(*) as retraits
    from sorties_jour
    where jour between v_debut_precedent and v_debut - 1
  ),
  -- Un point par jour, jours creux compris. `generate_series` veut des
  -- horodatages : une borne en `date` ne correspond à aucune de ses signatures.
  serie as (
    select
      j::date                                                        as jour,
      coalesce(sum(m.montant), 0)                                    as encaisse,
      coalesce(sum(m.montant) filter (where m.est_commission), 0)    as commissions,
      count(m.montant)                                               as mises,
      coalesce((
        select sum(r.montant) from sorties_jour r where r.jour = j::date
      ), 0)                                                          as restitutions
    from generate_series(v_debut_serie::timestamp, v_fin::timestamp, interval '1 day') as j
    left join entrees_jour m on m.jour = j::date
    group by j
  ),
  zones as (
    select
      coalesce(c.zone, 'Sans zone')                                  as zone,
      coalesce(sum(m.montant), 0)                                    as encaisse,
      count(m.montant)                                               as mises,
      count(distinct c.id)                                           as collecteurs
    from public.collecteurs c
    left join entrees_jour m
      on m.collecteur_id = c.id and m.jour between v_debut and v_fin
    group by coalesce(c.zone, 'Sans zone')
  ),
  derniers as (
    select
      case
        when mv.nature = 'retrait' then 'restitution'
        when mv.est_commission     then 'commission'
        else mv.nature
      end                                                            as type,
      cl.nom                                                         as client,
      col.id                                                         as collecteur_id,
      col.nom                                                        as collecteur,
      mv.sens * mv.montant                                           as montant,
      mv.survenu_le                                                  as survenu_le
    from public.mouvements mv
    join public.clients     cl  on cl.id  = mv.client_id
    join public.collecteurs col on col.id = mv.collecteur_id
    where (mv.survenu_le at time zone 'Africa/Abidjan')::date between v_debut and v_fin
  ),
  dernier_versement as (
    select collecteur_id, max((survenu_le at time zone 'Africa/Abidjan')::date) as jour
    from public.mouvements
    where sens = 1
    group by collecteur_id
  )
  select jsonb_build_object(
    'periode', jsonb_build_object('jours', p_jours, 'debut', v_debut, 'fin', v_fin),
    'depuis',  v_depuis,

    'flux', (
      select jsonb_build_object(
        'encaisse',     f.encaisse,
        'commissions',  f.commissions,
        'mises',        f.mises,
        'restitutions', fr.restitutions,
        'retraits',     fr.retraits
      )
      from flux f, flux_retraits fr
    ),

    'flux_precedent', (
      select jsonb_build_object(
        'encaisse',     f.encaisse,
        'commissions',  f.commissions,
        'mises',        f.mises,
        'restitutions', fr.restitutions,
        'retraits',     fr.retraits
      )
      from flux_p f, flux_p_retraits fr
    ),

    'serie', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'jour',         jour,
          'encaisse',     encaisse,
          'commissions',  commissions,
          'restitutions', restitutions,
          'mises',        mises
        )
        order by jour
      )
      from serie
    ), '[]'::jsonb),

    'zones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'zone',        zone,
          'encaisse',    encaisse,
          'mises',       mises,
          'collecteurs', collecteurs
        )
        order by encaisse desc, zone
      )
      from zones
    ), '[]'::jsonb),

    'mouvements_total', (select count(*) from derniers),

    'mouvements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'type',          type,
          'client',        client,
          'collecteur_id', collecteur_id,
          'collecteur',    collecteur,
          'montant',       montant,
          'survenu_le',    survenu_le
        )
        order by survenu_le desc
      )
      from (select * from derniers order by survenu_le desc limit 200) borne
    ), '[]'::jsonb),

    'collecteurs_sans_mise', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',            c.id,
          'nom',           c.nom,
          'zone',          c.zone,
          'derniere_mise', d.jour,
          'jours_sans',    coalesce(v_fin - d.jour, v_fin - c.cree_le::date)
        )
        order by d.jour nulls first, c.nom
      )
      from public.collecteurs c
      left join dernier_versement d on d.collecteur_id = c.id
      where c.abonnement_statut = 'actif'
        -- Un collecteur inscrit ce matin n'a pas décroché : il n'a pas encore
        -- commencé. Sans cette seconde borne, tout compte neuf entrait dans la
        -- liste avec « jamais » et zéro jour de silence — et l'écran aurait
        -- annoncé un abandon le jour d'une inscription.
        and (
          case when d.jour is null then c.cree_le::date else d.jour end < v_fin - 7
        )
    ), '[]'::jsonb)
  )
  into v_resultat;

  return v_resultat;
end;
$fn$;

alter function public.admin_tendances(integer) owner to postgres;

comment on function public.admin_tendances(integer) is
  'Flux datés du tableau de bord Admin : période glissante, période précédente, série quotidienne, zones, mouvements bornés à 200, collecteurs sans mise. Lus dans le registre des mouvements. Réservée à service_role ; est_admin() est contrôlé dans l''Edge Function appelante.';

revoke all on function public.admin_tendances(integer) from public;
revoke all on function public.admin_tendances(integer) from anon;
revoke all on function public.admin_tendances(integer) from authenticated;
grant execute on function public.admin_tendances(integer) to service_role;
-- ---------------------------------------------------------------------------
-- 3. L'équipe d'un titulaire
-- ---------------------------------------------------------------------------
create or replace function public.equipe_vue()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with membres as (
    select c.id, c.nom, c.telephone
      from public.collecteurs c
     where c.titulaire_id = (select auth.uid())
  ),
  entrees_par as (
    select mv.collecteur_id,
           coalesce(sum(mv.montant) filter (where not mv.est_commission), 0) as du_aux_clients,
           coalesce(sum(mv.montant) filter (where mv.est_commission), 0)     as commissions
      from public.mouvements mv
      join membres b on b.id = mv.collecteur_id
     where mv.sens = 1
     group by mv.collecteur_id
  ),
  sorties_par as (
    select mv.collecteur_id, coalesce(sum(mv.montant), 0) as restitutions
      from public.mouvements mv
      join membres b on b.id = mv.collecteur_id
     where mv.nature = 'retrait'
     group by mv.collecteur_id
  ),
  clients_par as (
    select cl.collecteur_id, count(*) as clients
      from public.clients cl
      join membres b on b.id = cl.collecteur_id
     group by cl.collecteur_id
  ),
  cartes_par as (
    select ca.collecteur_id, count(*) filter (where ca.statut = 'active') as cartes_actives
      from public.cartes ca
      join membres b on b.id = ca.collecteur_id
     group by ca.collecteur_id
  ),
  -- La caisse du jour se lit sur `caisses_jour`, et non par un appel à
  -- `cash_attendu_du_jour` : la ligne du jour n'existe qu'une fois la caisse
  -- déclarée, et son absence est une information — « il n'a pas encore compté ».
  -- La fabriquer ici afficherait un attendu sans déclaré, c'est-à-dire un écart
  -- qui n'existe pas.
  caisse_du_jour as (
    select cj.collecteur_id, cj.cash_attendu, cj.cash_declare, cj.ecart, cj.date
      from public.caisses_jour cj
      join membres b on b.id = cj.collecteur_id
     where cj.date = (now() at time zone 'UTC')::date
  )
  select coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'id',                   b.id,
         'nom',                  b.nom,
         'telephone',            b.telephone,
         'clients',              coalesce(cl.clients, 0),
         'cartes_actives',       coalesce(ca.cartes_actives, 0),
         'encours',              coalesce(m.du_aux_clients, 0) - coalesce(r.restitutions, 0),
         -- Les commissions du collaborateur reviennent au titulaire : c'est pour
         -- cela que la ligne figure ici, et qu'elle a disparu du Bilan du
         -- collaborateur.
         'commissions',          coalesce(m.commissions, 0),
         'cash_attendu',         k.cash_attendu,
         'cash_declare',         k.cash_declare,
         'ecart',                k.ecart,
         'derniere_declaration', k.date
       ) order by b.nom)
       from membres b
       left join clients_par  cl on cl.collecteur_id = b.id
       left join cartes_par   ca on ca.collecteur_id = b.id
       left join entrees_par  m  on m.collecteur_id  = b.id
       left join sorties_par  r  on r.collecteur_id  = b.id
       left join caisse_du_jour k on k.collecteur_id = b.id),
    '[]'::jsonb);
$fn$;

comment on function public.equipe_vue() is
  'Les collaborateurs de l''appelant, avec leurs totaux et leur caisse du jour. '
  'Sans paramètre : l''identité vient de auth.uid(), donc on ne peut pas demander l''équipe d''autrui. '
  'Tableau vide si l''appelant n''est pas titulaire — ne pas avoir d''équipe est un état normal.';

revoke all on function public.equipe_vue() from public, anon;
grant execute on function public.equipe_vue() to authenticated;

-- ---------------------------------------------------------------- Garde-fous
do $garde$
declare
  ouverte boolean;
begin
  -- Les garde-fous des migrations dont ces fonctions sont reprises, rejoués :
  -- une recopie qui perdrait l'un d'eux ne dirait rien d'elle-même.
  if position('titulaire_nom' in
       pg_get_functiondef('public.admin_vue_globale()'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : l''administration ne voit pas le rattachement.';
  end if;

  if position('titulaire_id is null' in
       pg_get_functiondef('public.admin_vue_globale()'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : la recopie a perdu le filtre du MRR.';
  end if;

  select has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute')
    into ouverte
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_tendances';

  if ouverte then
    raise exception
      'GARDE_FOU : admin_tendances() est exécutable par anon ou authenticated.';
  end if;

  if has_function_privilege('anon', 'public.equipe_vue()', 'execute') then
    raise exception 'GARDE_FOU : equipe_vue est exécutable par anon.';
  end if;
  if not has_function_privilege('authenticated', 'public.equipe_vue()', 'execute') then
    raise exception 'GARDE_FOU : equipe_vue n''est exécutable par personne.';
  end if;

  if has_function_privilege('anon', 'public.admin_vue_globale()', 'execute')
     or has_function_privilege('authenticated', 'public.admin_vue_globale()', 'execute') then
    raise exception
      'GARDE_FOU : admin_vue_globale() est exécutable par anon ou authenticated.';
  end if;
  if not has_function_privilege('service_role', 'public.admin_vue_globale()', 'execute') then
    raise exception 'GARDE_FOU : admin_vue_globale() n''est exécutable par personne.';
  end if;

  -- Et le contrôle propre à cette migration : les trois lisent le registre, et
  -- aucune ne lit plus les tables d'argent en direct.
  if (select count(*) from unnest(array[
        'public.admin_vue_globale()',
        'public.admin_tendances(integer)',
        'public.equipe_vue()'
      ]) as f
      where position('public.mouvements' in pg_get_functiondef(f::regprocedure)) = 0) > 0 then
    raise exception 'GARDE_FOU : un lecteur de l''administration ne lit pas le registre.';
  end if;
end
$garde$;
