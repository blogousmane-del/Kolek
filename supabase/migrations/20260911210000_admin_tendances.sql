-- Les tendances du tableau de bord Admin.
--
-- ## Pourquoi une fonction neuve, et pas un paramètre sur admin_vue_globale()
--
-- Trois migrations passées (20260901090000, 20260902140000, 20260902150000)
-- résolvent `'public.admin_vue_globale()'::regprocedure` dans leur bloc de
-- garde : une signature à un argument ne s'y résout plus, et `db reset`
-- tomberait — donc le job « Base » du CI. Surcharger le même nom rendrait
-- l'appel sans argument ambigu, et `releve_du_jour()` l'appelle ainsi chaque
-- soir à 23 h 55, en production.
--
-- ## Ce que cette fonction refuse de faire
--
-- Compter deux fois une commission. `retraits.commission` recopie le montant
-- de la mise de commission de la carte : mesuré en production le 2026-09-11,
-- les 16 retraits concernés portaient exactement ce montant. Les commissions
-- se comptent donc sur `mises.est_commission`, comme le fait déjà
-- `admin_vue_globale()`.
--
-- Sauter un jour sans mise. Une série qui saute les jours creux comprime le
-- temps et invente une régularité : `generate_series` les pose à zéro.
--
-- Deviner une période. En dehors de 1 à 90 jours, elle lève plutôt que de
-- replier sur une valeur par défaut.

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

  select min((encaisse_le at time zone 'Africa/Abidjan')::date) into v_depuis from public.mises;
  -- Quatre-vingt-dix jours de fond de courbe, jamais avant la première mise.
  v_debut_serie := greatest(coalesce(v_depuis, v_fin), v_fin - 89);

  with
  mises_jour as (
    select
      (m.encaisse_le at time zone 'Africa/Abidjan')::date            as jour,
      m.collecteur_id,
      m.montant,
      m.est_commission
    from public.mises m
  ),
  retraits_jour as (
    select
      (r.effectue_le at time zone 'Africa/Abidjan')::date            as jour,
      r.collecteur_id,
      r.montant_restitue
    from public.retraits r
  ),
  flux as (
    select
      coalesce(sum(montant), 0)                                      as encaisse,
      coalesce(sum(montant) filter (where est_commission), 0)        as commissions,
      count(*)                                                       as mises
    from mises_jour
    where jour between v_debut and v_fin
  ),
  flux_retraits as (
    select coalesce(sum(montant_restitue), 0) as restitutions, count(*) as retraits
    from retraits_jour
    where jour between v_debut and v_fin
  ),
  flux_p as (
    select
      coalesce(sum(montant), 0)                                      as encaisse,
      coalesce(sum(montant) filter (where est_commission), 0)        as commissions,
      count(*)                                                       as mises
    from mises_jour
    where jour between v_debut_precedent and v_debut - 1
  ),
  flux_p_retraits as (
    select coalesce(sum(montant_restitue), 0) as restitutions, count(*) as retraits
    from retraits_jour
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
        select sum(r.montant_restitue) from retraits_jour r where r.jour = j::date
      ), 0)                                                          as restitutions
    from generate_series(v_debut_serie::timestamp, v_fin::timestamp, interval '1 day') as j
    left join mises_jour m on m.jour = j::date
    group by j
  ),
  zones as (
    select
      coalesce(c.zone, 'Sans zone')                                  as zone,
      coalesce(sum(m.montant), 0)                                    as encaisse,
      count(m.montant)                                               as mises,
      count(distinct c.id)                                           as collecteurs
    from public.collecteurs c
    left join mises_jour m
      on m.collecteur_id = c.id and m.jour between v_debut and v_fin
    group by coalesce(c.zone, 'Sans zone')
  ),
  mouvements as (
    select
      case when m.est_commission then 'commission' else 'mise' end   as type,
      cl.nom                                                         as client,
      col.id                                                         as collecteur_id,
      col.nom                                                        as collecteur,
      m.montant                                                      as montant,
      m.encaisse_le                                                  as survenu_le
    from public.mises m
    join public.cartes      ca  on ca.id  = m.carte_id
    join public.clients     cl  on cl.id  = ca.client_id
    join public.collecteurs col on col.id = m.collecteur_id
    where (m.encaisse_le at time zone 'Africa/Abidjan')::date between v_debut and v_fin
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
    where (r.effectue_le at time zone 'Africa/Abidjan')::date between v_debut and v_fin
  ),
  derniere_mise as (
    select collecteur_id, max((encaisse_le at time zone 'Africa/Abidjan')::date) as jour
    from public.mises
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

    'mouvements_total', (select count(*) from mouvements),

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
      from (select * from mouvements order by survenu_le desc limit 200) borne
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
      left join derniere_mise d on d.collecteur_id = c.id
      where c.abonnement_statut = 'actif'
        and (d.jour is null or d.jour < v_fin - 7)
    ), '[]'::jsonb)
  )
  into v_resultat;

  return v_resultat;
end;
$fn$;

alter function public.admin_tendances(integer) owner to postgres;

comment on function public.admin_tendances(integer) is
  'Flux datés du tableau de bord Admin : période glissante, période précédente, série quotidienne, zones, mouvements bornés à 200, collecteurs sans mise. Réservée à service_role ; est_admin() est contrôlé dans l''Edge Function appelante.';

revoke all on function public.admin_tendances(integer) from public;
revoke all on function public.admin_tendances(integer) from anon;
revoke all on function public.admin_tendances(integer) from authenticated;
grant execute on function public.admin_tendances(integer) to service_role;

do $garde$
declare
  ouverte boolean;
begin
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

  -- La fonction partagée doit rester résoluble par sa signature sans argument :
  -- c'est ainsi que trois migrations passées la contrôlent, et que le relevé de
  -- 23 h 55 l'appelle.
  perform 'public.admin_vue_globale()'::regprocedure;
end
$garde$;
