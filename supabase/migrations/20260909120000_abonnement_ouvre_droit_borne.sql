-- `abonnement_ouvre_droit` ne répond que sur son appelant
--
-- ## Le défaut
--
-- Relevé par l'audit du 2026-09-03, resté ouvert depuis. La fonction est
-- `security definer`, fermée à `anon`, ouverte à `authenticated` — et son corps
-- était un `exists` sur l'identifiant reçu, sans aucune comparaison à
-- `auth.uid()` :
--
--     select exists (
--       select 1 from public.collecteurs
--        where id = p_collecteur
--          and abonnement_statut = 'actif'
--     );
--
-- Tout collecteur connecté pouvait donc demander si un identifiant arbitraire
-- portait un abonnement actif. C'est un oracle booléen : il faut déjà connaître
-- l'UUID, et la réponse dit peu. C'est pourquoi ça n'a jamais été plus qu'un
-- jaune, et c'est écrit ici pour que le prochain lecteur ne surestime pas ce
-- qu'il corrige.
--
-- Ce qui justifie quand même la correction : c'était le **seul écart de motif**
-- du schéma. `equipe_clients(uuid)`, écrite le même jour, borne le sien à la
-- ligne d'à côté et rend un tableau vide plutôt qu'une erreur — « ne rien dire
-- de ce qu'on n'a pas le droit de voir ». Une exception qui traîne devient le
-- précédent qu'on cite.
--
-- ## Pourquoi le resserrage ne casse rien
--
-- Vérifié sur `pg_policies`, sur la base migrée, et non lu dans un fichier de
-- migration qui pourrait avoir été remplacé depuis : les **deux seuls** sites
-- d'appel sont `clients_insert` et `cartes_insert`, qui passent l'une et
-- l'autre `(select auth.uid())`. Aucune Edge Function ne l'appelle — `grep` sur
-- `supabase/functions/` ne rend rien.
--
-- Le paramètre reste donc dans la signature, et les deux policies n'ont pas à
-- changer. Il devient simplement une assertion : « je te réponds si tu me
-- demandes pour toi ».
--
-- ## La conséquence pour `service_role`
--
-- Sous la clé de service il n'y a pas de JWT, donc `auth.uid()` est nul, donc
-- la fonction rend `false`. C'est voulu : elle répond sur l'appelant, et la clé
-- de service n'est l'appelant de personne. Un besoin serveur se sert de la
-- table, qui lui est ouverte. Le `coalesce` est là pour que ce cas rende
-- `false` et jamais `null` — un `null` remonterait tel quel par PostgREST et
-- ferait dire « indéterminé » à un booléen.

create or replace function public.abonnement_ouvre_droit(p_collecteur uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(p_collecteur = (select auth.uid()), false)
     and exists (
       select 1 from public.collecteurs
        where id = (select auth.uid())
          and abonnement_statut = 'actif'
     );
$fn$;

comment on function public.abonnement_ouvre_droit(uuid) is
  'Vrai si l''appelant est le collecteur nommé ET que son abonnement est actif. '
  'Le paramètre est une assertion, pas une question sur autrui : demander pour '
  'un autre identifiant rend false, sans distinguer « existe » de « n''existe '
  'pas ». N''a jamais son mot à dire sur l''encaissement d''une carte déjà '
  'ouverte — voir abonnement-ouvre-droit.test.ts.';

-- Les droits ne bougent pas ; ils sont réaffirmés parce que `create or replace`
-- ne les touche pas mais qu'un futur `drop`/`create` les remettrait à PUBLIC.
revoke all on function public.abonnement_ouvre_droit(uuid) from public, anon;
grant execute on function public.abonnement_ouvre_droit(uuid) to authenticated;

-- ------------------------------- Garde-fous --------------------------------
--
-- La passe et son contrôle dans le même fichier : appliquer l'un sans l'autre
-- laisserait une correction que rien ne maintient.
do $garde$
declare
  corps text;
  sites integer;
begin
  select pg_get_functiondef(oid) into corps
    from pg_proc
   where proname = 'abonnement_ouvre_droit'
     and pronamespace = 'public'::regnamespace;

  if corps is null or corps not like '%auth.uid()%' then
    raise exception
      'abonnement_ouvre_droit ne compare plus son paramètre à auth.uid() — l''oracle du 2026-09-03 est rouvert.';
  end if;

  -- Les deux policies doivent toujours l'appeler. Si elles cessaient, le
  -- resserrage ci-dessus n'aurait plus d'objet et la porte de l'abonnement
  -- serait grande ouverte sans que personne ne l'ait décidé.
  select count(*) into sites
    from pg_policies
   where schemaname = 'public'
     and coalesce(qual, '') || coalesce(with_check, '') like '%abonnement_ouvre_droit%';

  if sites <> 2 then
    raise exception
      'abonnement_ouvre_droit est appelée par % policies, deux attendues (clients_insert, cartes_insert).', sites;
  end if;
end
$garde$;
