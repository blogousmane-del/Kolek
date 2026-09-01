-- La mise journalière perd son plafond.
--
-- La borne de 10 000 FCFA était le palier haut du marché au moment du socle,
-- pas une règle du produit. Elle refusait un métier réel : un commerçant qui
-- met 50 000 FCFA de côté chaque jour n'avait pas de carte.
--
-- Le plancher de 500 reste : en dessous, la commission du collecteur — une
-- mise, la première du cycle — ne paie pas son déplacement.
--
-- ## L'ordre de ce fichier n'est pas indifférent
--
-- Le `bigint` vient d'abord, les bornes ensuite. Élargir une contrainte avant
-- d'avoir corrigé le calcul ne supprimerait pas le refus : il le déplacerait
-- vers un « integer out of range » levé pendant un encaissement, que personne
-- ne peut corriger sur le terrain.
--
-- ## Ce qui débordait
--
-- `(mises_encaissees - 1) * mise` est un produit `integer × integer`. Postgres
-- déborde à 2 147 483 647, soit une mise d'environ 71,5 millions sur une carte
-- complète — bien en deçà de ce que la colonne accepte désormais. Le
-- débordement se produit **à la multiplication**, avant tout appel de
-- fonction : couler un opérande ne sert à rien si la fonction appelée reprend
-- un `integer` derrière. D'où l'élargissement de `grouper_milliers`.
--
-- ## Le plafond qui subsiste, et qu'on assume
--
-- Deux colonnes le portent, pas une.
--
-- `retraits.montant_restitue` est un `integer` : la clôture y écrit
-- (mises_encaissees - 1) * mise, soit 30 * mise sur une carte pleine. Au-delà
-- de 2 147 483 647 / 30, soit 71 582 788 par mise, l'insertion lève 22003 et la
-- clôture échoue définitivement — cartes.mise est figée à l'ouverture et mises
-- est append-only. C'est ce plafond, et non celui de cartes.mise, que
-- MISE_MAX_RESTITUABLE (packages/core) refuse dès l'ouverture de la carte.
--
-- `caisses_jour.cash_attendu` est un `integer`, et `ecart` une colonne générée
-- stockée qui en dépend. Le point de rupture est le `::integer` final de
-- `public.cash_attendu_du_jour` : ses sous-requêtes sont des `sum()` sur
-- `integer`, donc déjà des `bigint`, mais la conversion du résultat échoue si
-- la valeur nette d'une journée — mises encaissées moins restitutions — sort de
-- [-2 147 483 648, 2 147 483 647]. Les deux sens comptent : clôturer deux
-- cartes à 50 000 FCFA de mise le même jour restitue 3 milliards.
--
-- Corriger cela demanderait de démonter et reconstruire une colonne générée sur
-- une table de production. Hors périmètre. Le plafond réel du produit passe
-- donc de 10 000 FCFA par mise à 71 582 788 FCFA par mise (clôture), avec un
-- second plafond bien plus haut à ~2,1 milliards de recette journalière par
-- collecteur (caisse).

/* --------------------- 1. Le groupeur de milliers ------------------------ */

-- `create or replace` ne suffirait pas : Postgres traite les deux signatures
-- comme deux fonctions distinctes, et un appel avec un argument `integer`
-- continuerait de choisir l'ancienne par correspondance exacte.
--
-- Le `drop` est sans danger bien que `mettre_en_file_avis` référence encore
-- cette fonction à cet instant : plpgsql résout ses appels à l'exécution, et la
-- section 2 arrive dans la même transaction.
drop function if exists public.grouper_milliers(integer);

/** Groupe les milliers par une espace simple — l'insécable n'est pas en GSM-7. */
create function public.grouper_milliers(valeur bigint)
returns text
language sql
immutable
set search_path = pg_temp
as $fn$
  -- `valeur::text` et non `trunc(valeur)::text` : sur un type entier, `trunc`
  -- est l'identité, et il n'a de définition ni pour `integer` ni pour `bigint`
  -- — l'argument passait par une conversion implicite vers `numeric` ou vers
  -- `double precision`, au choix du résolveur. Sur un `bigint` cette latitude
  -- n'est plus acceptable.
  select regexp_replace(valeur::text, '(\d)(?=(\d{3})+$)', '\1 ', 'g');
$fn$;

/* ------------------- 2. L'avis envoyé au client -------------------------- */

create or replace function public.mettre_en_file_avis()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  reglages public.avis_reglages;
  client public.clients;
  carte public.cartes;
  texte text;
  reference text;
  identifiant_client uuid;
begin
  select * into reglages from public.avis_reglages where collecteur_id = new.collecteur_id;
  if not found or reglages.canal = 'aucun' then
    return null;
  end if;

  if tg_table_name = 'mises' and not reglages.sur_mise then return null; end if;
  if tg_table_name = 'retraits' and not reglages.sur_retrait then return null; end if;
  if tg_table_name = 'cartes' and not reglages.sur_ouverture then return null; end if;

  -- La commission du collecteur n'est pas un versement du client : elle est
  -- prélevée sur la première mise. L'annoncer comme un versement ferait croire
  -- au client qu'il a épargné une somme qui ne lui reviendra pas.
  --
  -- Le `if` est **imbriqué** et non joint par `and` : plpgsql prépare
  -- l'expression entière avant de l'évaluer, donc `new.est_commission` est
  -- résolu même quand la ligne vient de `cartes`, qui n'a pas cette colonne.
  -- La forme jointe passait la migration et faisait échouer l'ouverture d'une
  -- carte en production — « record "new" has no field "est_commission" ».
  -- Trouvé par les tests, pas par la relecture.
  if tg_table_name = 'mises' then
    if new.est_commission then return null; end if;
  end if;

  if tg_table_name = 'cartes' then
    -- Relue plutôt qu'affectée depuis `new` : les valeurs par défaut et ce
    -- qu'un déclencheur BEFORE a pu réécrire sont dans la table, pas
    -- nécessairement dans `new` tel qu'on le reçoit ici.
    select * into carte from public.cartes where id = new.id;
    if not found then return null; end if;
    identifiant_client := carte.client_id;
  else
    select * into carte from public.cartes where id = new.carte_id;
    if not found then return null; end if;
    identifiant_client := carte.client_id;
  end if;

  select * into client from public.clients where id = identifiant_client;
  if not found or client.telephone is null or not client.avis_actifs then
    return null;
  end if;

  reference := upper(substring(replace(new.id::text, '-', '') from 1 for 8));

  if tg_table_name = 'mises' then
    texte := 'KOLEK. Versement recu : ' || public.grouper_milliers(new.montant)
          || ' FCFA. Jour ' || carte.mises_encaissees || '/31. Total a vous rendre : '
          || public.grouper_milliers(greatest(carte.mises_encaissees - 1, 0)::bigint * carte.mise)
          || ' FCFA. Ref ' || reference || '.';
  elsif tg_table_name = 'retraits' then
    texte := 'KOLEK. Carte cloturee. Montant rendu : '
          || public.grouper_milliers(new.montant_restitue)
          || ' FCFA. Ref ' || reference
          || '. Verifiez la somme avant de quitter votre collecteur.';
  else
    -- La dernière phrase n'est écrite que si elle est vraie. Promettre un
    -- message par versement quand `sur_mise` est éteint installerait chez le
    -- client une attente que le dispositif ne tiendra pas — et le silence qui
    -- suit ressemblerait à une mise non enregistrée.
    texte := 'KOLEK. Nouvelle carte ouverte. Mise de '
          || public.grouper_milliers(carte.mise)
          || ' FCFA par jour, 31 jours. Ref ' || reference || '.'
          || case when reglages.sur_mise
                  then ' Vous recevrez un message a chaque versement.'
                  else '' end;
  end if;

  -- Le quota. `quota_atteint` plutôt qu'un silence : le collecteur doit pouvoir
  -- constater que ses clients cessent d'être prévenus, et pourquoi.
  if reglages.periode_quota < date_trunc('month', now())::date then
    update public.avis_reglages
       set segments_consommes = 0, periode_quota = date_trunc('month', now())::date
     where collecteur_id = new.collecteur_id;
    reglages.segments_consommes := 0;
  end if;

  insert into public.avis_clients (
    collecteur_id, client_id, source_table, source_id,
    destinataire, canal, corps, segments, statut
  )
  values (
    new.collecteur_id, client.id, tg_table_name, new.id,
    client.telephone, reglages.canal, texte, 1,
    case when reglages.segments_consommes >= reglages.quota_mensuel
         then 'quota_atteint' else 'a_envoyer' end
  )
  on conflict (source_table, source_id, canal) do nothing;

  return null;
end;
$fn$;

revoke all on function public.mettre_en_file_avis() from public, anon, authenticated;

/* --------------------- 3. La vue d'administration ------------------------ */

-- `'public', 'pg_temp'` et non le seul `'public'` de la définition source :
-- `20260830131000_search_path_pg_temp_en_dernier.sql` avait corrigé ce
-- search_path par un `alter function` qui ne touche pas au corps. Réécrire la
-- fonction ici sans reporter ce correctif la ramènerait à la forme faible que
-- cette migration-là avait fermée — `search-path.test.ts` le détecte.
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

revoke all on function public.admin_vue_globale() from public, anon, authenticated;
grant execute on function public.admin_vue_globale() to service_role;

/* -------------------------- 4. Les bornes -------------------------------- */

-- Les noms sont conservés : le garde-fou de
-- 20260818010000_socle_storage_et_bornes.sql vérifie `mises_montant_borne` par
-- son nom.
--
-- Élargir un CHECK ne réécrit aucune ligne : toutes les mises existantes sont
-- dans le nouvel intervalle, et Postgres valide la contrainte par un simple
-- parcours.
alter table public.cartes drop constraint cartes_mise_check;
alter table public.cartes add  constraint cartes_mise_check check (mise >= 500);

alter table public.mises drop constraint mises_montant_borne;
alter table public.mises add  constraint mises_montant_borne check (montant >= 500);

/* -------------------------- Garde-fou ------------------------------------ */

do $garde$
begin
  -- Le défaut le plus probable de ce fichier : élargir les bornes et oublier
  -- un produit. Il ne se verrait qu'en production, sur la première grosse
  -- carte, et sous la forme d'un encaissement refusé.
  if position('::bigint' in pg_get_functiondef('public.admin_vue_globale()'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : admin_vue_globale() ne coule pas son produit en bigint.';
  end if;

  if position('::bigint' in pg_get_functiondef('public.mettre_en_file_avis()'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : mettre_en_file_avis() ne coule pas son produit en bigint.';
  end if;
end
$garde$;
