-- Retour arrière du registre des mouvements.
--
-- Les quatre fonctions de lecture, telles qu'elles étaient avant le chantier du
-- 2026-09-15, recopiées mot pour mot depuis les migrations qui les portent —
-- 20260902120000, 20260902150000, 20260911210000, 20260902130000 — par
-- `construire-retour.mjs`.
--
-- Ce fichier n'est PAS une migration : il n'est pas dans supabase/migrations et
-- ne part donc jamais tout seul. En cas de retour, le copier sous
-- supabase/migrations/<horodatage>_mouvements_registre_retour.sql et le pousser
-- sur accord explicite de l'exploitant, pour que l'historique des migrations
-- reste vrai.
--
-- La table et la vue restent : vides et lues par personne, elles ne coûtent
-- rien. Le déclencheur de caisse des rattrapages, lui, part avec les fonctions.

create or replace function public.cash_attendu_du_jour(p_collecteur uuid, p_date date)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select (
    coalesce((
      select sum(montant)
        from public.mises
       -- `encaisse_par` et non `collecteur_id` : c'est ce qui est passé par
       -- cette main-là qui doit se retrouver dans cette sacoche-là.
       where encaisse_par = p_collecteur
         -- `at time zone 'UTC'` explicite, et non `encaisse_le::date` : ce
         -- dernier découpe la journée selon le fuseau de la session. Abidjan
         -- est à UTC+0 toute l'année, donc les deux coïncident aujourd'hui —
         -- par géographie, pas par intention. Une Edge Function lancée avec un
         -- autre `TimeZone` déplacerait la frontière du jour, et donc l'écart
         -- de caisse.
         and (encaisse_le at time zone 'UTC')::date = p_date
    ), 0)
    -
    -- Ce qui est sorti de la sacoche. `montant_restitue` et non `commission` :
    -- la commission reste chez le collecteur, et elle est déjà comptée du côté
    -- des mises — c'est la première mise du cycle. La soustraire ici la
    -- retirerait deux fois.
    coalesce((
      select sum(montant_restitue)
        from public.retraits
       where restitue_par = p_collecteur
         and (effectue_le at time zone 'UTC')::date = p_date
    ), 0)
  )::integer;
$fn$;

revoke all on function public.cash_attendu_du_jour(uuid, date) from public, anon, authenticated;

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
  'Flux datés du tableau de bord Admin : période glissante, période précédente, série quotidienne, zones, mouvements bornés à 200, collecteurs sans mise. Réservée à service_role ; est_admin() est contrôlé dans l''Edge Function appelante.';

revoke all on function public.admin_tendances(integer) from public;
revoke all on function public.admin_tendances(integer) from anon;
revoke all on function public.admin_tendances(integer) from authenticated;
grant execute on function public.admin_tendances(integer) to service_role;

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
  mises_par as (
    select m.collecteur_id,
           coalesce(sum(m.montant) filter (where not m.est_commission), 0) as du_aux_clients,
           coalesce(sum(m.montant) filter (where m.est_commission), 0)     as commissions
      from public.mises m
      join membres b on b.id = m.collecteur_id
     group by m.collecteur_id
  ),
  retraits_par as (
    select r.collecteur_id, coalesce(sum(r.montant_restitue), 0) as restitutions
      from public.retraits r
      join membres b on b.id = r.collecteur_id
     group by r.collecteur_id
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
       left join mises_par    m  on m.collecteur_id  = b.id
       left join retraits_par r  on r.collecteur_id  = b.id
       left join caisse_du_jour k on k.collecteur_id = b.id),
    '[]'::jsonb);
$fn$;

comment on function public.equipe_vue() is
  'Les collaborateurs de l''appelant, avec leurs totaux et leur caisse du jour. '
  'Sans paramètre : l''identité vient de auth.uid(), donc on ne peut pas demander l''équipe d''autrui. '
  'Tableau vide si l''appelant n''est pas titulaire — ne pas avoir d''équipe est un état normal.';

revoke all on function public.equipe_vue() from public, anon;
grant execute on function public.equipe_vue() to authenticated;

drop trigger if exists rattrapages_rafraichir_caisse on public.rattrapages;
drop function if exists public.caisses_rafraichir_apres_rattrapage();
