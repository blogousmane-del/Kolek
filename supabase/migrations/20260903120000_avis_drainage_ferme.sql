-- Kolek — le drainage des avis se ferme à son appelant, et réserve son lot
--
-- Ouvert par l'audit du 2026-08-25 (contrôle n°6), redit mot pour mot le 28, le
-- 2 septembre et le 3. Quatrième passage, échéance dépassée : « avant que les
-- identifiants de la passerelle n'arrivent, pas après ». Ils sont arrivés — le
-- `401` du 30 août l'a prouvé.
--
-- ## Les deux défauts ne font qu'un
--
-- `envoyer-avis` ne contrôlait que la méthode HTTP. Seule restait la barrière de
-- plateforme `verify_jwt`, que la **clé publiable** franchit : elle est servie
-- dans le paquet JavaScript des trois sites, par construction. N'importe qui
-- pouvait donc déclencher un drainage.
--
-- Pris seul, ce serait un appel de trop. Ce qui le rend coûteux est le second
-- défaut : le drainage ne réservait pas son lot. Il lisait cinquante lignes,
-- envoyait, puis marquait `envoye`. Dix appels simultanés lisaient les mêmes
-- cinquante lignes, envoyaient dix fois le même SMS à de vrais clients, et
-- décomptaient dix fois le quota du collecteur — qui paie ce qu'il n'a pas
-- demandé, environ 20 FCFA le segment.
--
-- Fermer la porte sans réserver le lot laisserait le second défaut vivant : deux
-- exécutions planifiées se chevauchent dès qu'un drainage dépasse la minute, et
-- une file de cinquante SMS la dépasse. Réserver sans fermer la porte laisserait
-- n'importe qui vider la file quand bon lui semble. Les deux ensemble, donc.
--
-- ## Le prix de la réservation, et pourquoi il se paie
--
-- Un état de plus (`en_cours`) veut dire un état où l'on peut rester coincé. Une
-- fonction qui meurt entre la réservation et l'envoi laisse ses lignes réservées
-- pour toujours : la file ne se vide plus, et **rien ne le dit** — exactement la
-- panne que l'en-tête de `20260823170000` décrit comme la pire.
--
-- La réservation libère donc, avant de réserver, ce qui traîne depuis plus de
-- cinq minutes. Un lot de cinquante envois prend une cinquantaine de secondes ;
-- cinq minutes laissent six fois la marge, et restent loin sous l'heure au bout
-- de laquelle un client ne reconnaîtrait plus son versement.
--
-- Une reprise recompte la tentative. C'est délibéré, et c'est le sens de
-- `tentatives` : au troisième abandon, l'avis passe `abandonne` plutôt que de
-- faire tomber le drainage indéfiniment sur la même ligne. Un message qui tue la
-- fonction qui le traite est plus probablement en cause que l'inverse.

/* ------------------------- 1. L'état « en_cours » ------------------------- */

-- Nul partout ailleurs : seule une ligne réservée porte une date, et c'est ce
-- qui rend la libération lisible sans jointure ni journal.
alter table public.avis_clients
  add column if not exists reserve_le timestamptz;

alter table public.avis_clients drop constraint if exists avis_statut_check;
alter table public.avis_clients
  add constraint avis_statut_check check (
    statut in ('a_envoyer', 'envoye', 'echoue', 'abandonne', 'quota_atteint', 'en_cours')
  );

-- La libération balaie les réservations anciennes à chaque drainage, soit une
-- fois par minute. Sans cet index elle parcourt toute la table pour n'y trouver,
-- presque toujours, rien.
create index if not exists avis_reserves
  on public.avis_clients (reserve_le)
  where statut = 'en_cours';

/* --------------------------- 2. La réservation ---------------------------- */

/**
 * Réserve un lot d'avis à envoyer, et ne le rend qu'à un seul appelant.
 *
 * `for update skip locked` est le cœur du dispositif : deux drainages simultanés
 * ne voient jamais la même ligne. Le second ne bloque pas et n'échoue pas — il
 * saute ce qui est pris et travaille sur la suite. C'est ce qui permet de fermer
 * la porte sans exiger que l'horloge soit unique.
 *
 * `tentatives` s'incrémente **ici**, pas à l'envoi. Une ligne sortie de cette
 * fonction a donc consommé son essai, que l'envoi aboutisse, échoue, ou que la
 * fonction meure avant d'écrire. C'est la seule façon qu'une ligne empoisonnée
 * ne soit pas rejouée sans fin.
 *
 * La borne haute sur `p_taille` n'est pas de la méfiance envers l'appelant :
 * c'est la même fonction qui envoie et qui réserve, et un lot de mille tiendrait
 * la réservation ouverte bien au-delà des cinq minutes au bout desquelles elle
 * se croit abandonnée. Deux cents est déjà quatre fois ce que le drainage prend.
 */
create or replace function public.avis_reserver_lot(p_taille integer default 50)
returns table (
  id uuid,
  collecteur_id uuid,
  destinataire text,
  corps text,
  segments integer,
  tentatives integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
begin
  -- Les réservations abandonnées. Voir l'en-tête : sans cette libération, une
  -- mort de la fonction entre la réservation et l'envoi enterre la ligne, et
  -- `avis_declencher_drainage` cesse de réveiller quoi que ce soit.
  update public.avis_clients a
     set statut = 'echoue',
         reserve_le = null,
         derniere_erreur = coalesce(a.derniere_erreur, 'DRAINAGE_INTERROMPU')
   where a.statut = 'en_cours'
     and a.reserve_le < now() - interval '5 minutes';

  -- Libérées à l'instant, elles sont visibles de la requête qui suit, dans la
  -- même transaction. Une reprise n'attend donc pas le tour suivant de
  -- l'horloge.
  return query
  update public.avis_clients a
     set statut = 'en_cours',
         reserve_le = now(),
         tentatives = a.tentatives + 1
   where a.id in (
     select c.id
       from public.avis_clients c
      where c.statut in ('a_envoyer', 'echoue')
        and c.tentatives < 3
      order by c.cree_le
      limit greatest(0, least(coalesce(p_taille, 50), 200))
      for update skip locked
   )
  returning a.id, a.collecteur_id, a.destinataire, a.corps, a.segments, a.tentatives;
end;
$fn$;

alter function public.avis_reserver_lot(integer) owner to postgres;

comment on function public.avis_reserver_lot(integer) is
  'Réserve un lot d''avis pour un seul appelant (for update skip locked), incrémente tentatives, et libère au passage les réservations de plus de cinq minutes. Réservée à service_role ; l''appelant est contrôlé dans envoyer-avis.';

-- `create or replace function` réattribue l'exécution à `public` sans rien dire.
-- Cette fonction sort des numéros de téléphone et le corps des messages : la
-- laisser ouverte à `authenticated` livrerait la file de tous les collecteurs à
-- n'importe quel compte connecté.
revoke all on function public.avis_reserver_lot(integer) from public;
revoke all on function public.avis_reserver_lot(integer) from anon;
revoke all on function public.avis_reserver_lot(integer) from authenticated;
grant execute on function public.avis_reserver_lot(integer) to service_role;

/**
 * `avis_reserver_lot` verrouille-t-elle encore son lot ?
 *
 * La propriété que cette migration installe est un entrelacement : deux
 * transactions dans la même fenêtre de quelques millisecondes. Le harnais de
 * `supabase/tests/` n'atteint la base que par PostgREST, en HTTP ; deux appels
 * lancés ensemble finissent l'un après l'autre. Mesuré le 2026-09-03 en
 * retirant la clause : un test de simultanéité passait au vert sans elle. Un
 * test qui ne peut pas échouer pour la bonne raison n'est pas un test.
 *
 * Reste ce qui se vérifie d'ici : la clause est là. C'est un garde-fou de forme
 * — il ne dit rien de la sémantique de PostgreSQL, qui n'est pas en cause — et
 * il tombe le jour où quelqu'un remplace la fonction sans elle. C'est exactement
 * le risque à couvrir : le `do $garde$` ci-dessous ne rejouera pas, une
 * migration appliquée ne se rejoue jamais, et c'est la leçon de
 * `20260830131000`.
 *
 * Elle rend un booléen et non la source : le corps d'une fonction privilégiée
 * est une carte, et elle n'a rien à faire dans un navigateur — quand bien même
 * seul `service_role` peut appeler celle-ci.
 */
create or replace function public.avis_reservation_verrouillee()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'avis_reserver_lot'
       and upper(p.prosrc) like '%FOR UPDATE SKIP LOCKED%'
  )
$$;

comment on function public.avis_reservation_verrouillee() is
  'Vrai si avis_reserver_lot porte encore « for update skip locked », la clause qui empêche deux drainages simultanés de réserver la même ligne. Garde-fou de forme, rejoué par supabase/tests/avis-drainage.test.ts.';

revoke all on function public.avis_reservation_verrouillee() from public;
revoke all on function public.avis_reservation_verrouillee() from anon;
revoke all on function public.avis_reservation_verrouillee() from authenticated;

/* --------------------- 3. L'horloge voit les abandons --------------------- */

-- Le `exists` de tête décide s'il y a lieu de réveiller la fonction. Tel quel,
-- il ne regardait que `a_envoyer` et `echoue` — donc une file entièrement
-- réservée par un drainage mort se lisait `FILE_VIDE`, pour toujours. Le
-- balayage de `avis_reserver_lot` ne serait jamais appelé pour la corriger : la
-- libération est dans la fonction que ce test empêche d'appeler.
--
-- Corps inchangé par ailleurs — les deux contrôles de plausibilité du 28 août
-- restent mot pour mot, et `pg_temp` reste nommé en dernier (2026-08-30).
create or replace function public.avis_declencher_drainage()
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  adresse text;
  cle text;
begin
  if not exists (
    select 1 from public.avis_clients
     where (statut in ('a_envoyer', 'echoue') and tentatives < 3)
        or (statut = 'en_cours' and reserve_le < now() - interval '5 minutes')
  ) then
    return 'FILE_VIDE';
  end if;

  select decrypted_secret into adresse from vault.decrypted_secrets where name = 'kolek_url';
  select decrypted_secret into cle from vault.decrypted_secrets where name = 'kolek_cle_service';

  -- Ni erreur ni silence : un état, nommé. La file reste intacte et repartira
  -- telle quelle le jour où les secrets arriveront.
  if adresse is null or cle is null then
    return 'SECRETS_ABSENTS';
  end if;

  -- Les deux ajouts du 2026-08-28. Voir l'en-tête : ils transforment une panne
  -- muette en réponse lisible, et c'est tout ce qu'on leur demande.
  if adresse !~ '^https://[a-z0-9.-]+$' then
    return 'ADRESSE_INVALIDE';
  end if;

  if cle !~ '^(sb_secret_|eyJ)' then
    return 'SECRET_INVALIDE';
  end if;

  -- La réponse HTTP n'est pas attendue : `envoyer-avis` porte la logique de
  -- reprise, de quota et d'abandon.
  perform net.http_post(
    url := adresse || '/functions/v1/envoyer-avis',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cle,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );

  return 'DEMANDE';
end;
$fn$;

-- Reposées, comme à chaque remplacement. Voir `20260828100000` : les oublier
-- rendrait cette fonction, et la clé de service qu'elle lit dans Vault,
-- appelable par n'importe quel porteur de la clé publiable.
revoke all on function public.avis_declencher_drainage() from public;
revoke all on function public.avis_declencher_drainage() from anon;
revoke all on function public.avis_declencher_drainage() from authenticated;
revoke all on function public.avis_declencher_drainage() from service_role;

comment on function public.avis_declencher_drainage() is
  'Réveille envoyer-avis quand la file n''est pas vide, réservations abandonnées comprises. Lit l''adresse et la clé de service dans Vault ; rend un état nommé si elles sont absentes, si l''adresse n''est pas une origine https, ou si la clé n''a pas la forme sb_secret_ ni eyJ.';

/* ------------------- 4. Le compteur de la console admin ------------------- */

-- « en attente » veut dire « pas encore reçu, et on va réessayer ». Une ligne
-- réservée l'est autant qu'une ligne en file : l'exclure ferait tomber le
-- compteur à zéro pendant qu'un lot est en vol, et GTCS lirait « la file est
-- vide » au moment précis où elle ne l'est pas.
--
-- Corps repris tel quel de `20260823160000`, à deux mots près. Le `search_path`
-- y était encore `to 'public'` : le remplacer sans le corriger défaisait la
-- passe du 2026-08-30 et ferait tomber `search-path.test.ts`.
create or replace function public.admin_avis()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'genere_le', now(),
    'collecteurs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',                 c.id,
          'nom',                c.nom,
          'palier',             c.palier,
          'canal',              coalesce(r.canal, 'aucun'),
          'sur_mise',           coalesce(r.sur_mise, false),
          'sur_retrait',        coalesce(r.sur_retrait, true),
          'sur_ouverture',      coalesce(r.sur_ouverture, true),
          'quota_mensuel',      coalesce(r.quota_mensuel, 0),
          'segments_consommes', coalesce(r.segments_consommes, 0),
          'periode_quota',      r.periode_quota,
          'regle',              (r.collecteur_id is not null),

          -- Le consentement, qui est l'autre moitié du verrou. Un canal ouvert
          -- sur un portefeuille où personne n'a consenti n'enverra rien, et
          -- GTCS doit le voir avant de conclure à une panne.
          'clients',            (select count(*) from public.clients cl
                                  where cl.collecteur_id = c.id),
          'clients_consentants',(select count(*) from public.clients cl
                                  where cl.collecteur_id = c.id
                                    and cl.avis_actifs
                                    and cl.telephone is not null),

          'en_attente',   (select count(*) from public.avis_clients a
                            where a.collecteur_id = c.id
                              and a.statut in ('a_envoyer', 'echoue', 'en_cours')),
          'envoyes_mois', (select count(*) from public.avis_clients a
                            where a.collecteur_id = c.id
                              and a.statut = 'envoye'
                              and a.envoye_le >= date_trunc('month', now())),
          'bloques',      (select count(*) from public.avis_clients a
                            where a.collecteur_id = c.id
                              and a.statut = 'quota_atteint'),
          'abandonnes',   (select count(*) from public.avis_clients a
                            where a.collecteur_id = c.id
                              and a.statut = 'abandonne')
        )
        order by c.nom
      )
      from public.collecteurs c
      left join public.avis_reglages r on r.collecteur_id = c.id
    ), '[]'::jsonb),

    -- La dernière erreur rendue par la passerelle, tous collecteurs confondus.
    -- Sans elle, un compte non provisionné se traduit par une file qui grossit
    -- en silence.
    'derniere_erreur', (
      select jsonb_build_object('raison', derniere_erreur, 'quand', cree_le)
        from public.avis_clients
       where derniere_erreur is not null
       order by cree_le desc
       limit 1
    )
  );
$fn$;

alter function public.admin_avis() owner to postgres;

revoke all on function public.admin_avis() from public;
revoke all on function public.admin_avis() from anon;
revoke all on function public.admin_avis() from authenticated;
grant execute on function public.admin_avis() to service_role;

/* ------------------------------ Garde-fous -------------------------------- */

-- Deux assertions, et la seconde compte autant que la première. Un garde-fou
-- qui ne vérifie que la fermeture laisserait passer une révocation de trop :
-- `avis_reserver_lot` fermée à `service_role`, c'est le drainage qui ne peut
-- plus réserver, donc la file qui ne se vide plus — en silence, encore.
do $garde$
declare
  role_ouvert text;
begin
  select r into role_ouvert
    from unnest(array['anon', 'authenticated']) as r
   where has_function_privilege(r, 'public.avis_reserver_lot(integer)', 'execute')
   limit 1;

  if role_ouvert is not null then
    raise exception
      'GARDE_FOU : avis_reserver_lot, qui sort les numéros et le corps des messages, est appelable par « % ».', role_ouvert;
  end if;

  if not has_function_privilege('service_role', 'public.avis_reserver_lot(integer)', 'execute') then
    raise exception
      'GARDE_FOU : avis_reserver_lot est fermée à service_role — le drainage ne peut plus réserver, et la file ne se videra plus.';
  end if;

  select r into role_ouvert
    from unnest(array['anon', 'authenticated', 'service_role']) as r
   where has_function_privilege(r, 'public.avis_declencher_drainage()', 'execute')
   limit 1;

  if role_ouvert is not null then
    raise exception
      'GARDE_FOU : la fonction qui lit la clé de service est appelable par « % ».', role_ouvert;
  end if;
end;
$garde$;

-- La clause de verrouillage, vérifiée à l'application. Le test la rejoue à
-- chaque exécution du CI, contre une base fraîchement migrée — parce que ce
-- bloc-ci, lui, ne rejouera jamais.
do $garde$
begin
  if not public.avis_reservation_verrouillee() then
    raise exception
      'GARDE_FOU : avis_reserver_lot ne porte plus « for update skip locked ». Deux drainages simultanés réserveraient la même ligne, et le même SMS partirait deux fois.';
  end if;
end;
$garde$;
