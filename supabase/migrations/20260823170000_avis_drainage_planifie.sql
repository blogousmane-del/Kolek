-- Le drainage automatique de la file des avis.
--
-- `envoyer-avis` existait, était déployée, était testée — et **rien ne
-- l'appelait**. Une file qui ne se vide jamais est la pire forme de panne d'un
-- dispositif d'avis : tout paraît fonctionner, les lignes s'accumulent avec le
-- statut « à envoyer », et personne ne découvre le silence avant qu'un client
-- ne conteste un versement.
--
-- ## Pourquoi pg_cron plutôt qu'un ordonnanceur externe
--
-- La file est en base. Le déclencheur qui la remplit est en base. Mettre
-- l'horloge ailleurs ajouterait un service à surveiller, une facture, et un
-- point de panne qui ne partage pas le sort de la donnée qu'il sert.
--
-- ## Où est la clé, et pourquoi elle n'est pas ici
--
-- Ce dépôt est public. La clé de service n'y entre pas, et ne peut pas y
-- entrer. Elle est lue dans **Vault**, où GTCS la pose une fois, à la main,
-- depuis l'éditeur SQL du tableau de bord :
--
--     select vault.create_secret('https://<ref>.supabase.co', 'kolek_url');
--     select vault.create_secret('<clé de service>', 'kolek_cle_service');
--
-- Tant que ces deux secrets n'existent pas, la fonction ci-dessous ne fait
-- rien et le dit. Elle ne lève pas d'exception : un travail planifié qui échoue
-- toutes les minutes remplit les journaux d'un bruit qui masque les vraies
-- pannes.

create extension if not exists pg_cron;
create extension if not exists pg_net;

/**
 * Réveille `envoyer-avis`, si et seulement s'il y a quelque chose à envoyer.
 *
 * Le `exists` en tête n'est pas une optimisation de confort : sans lui, la
 * plateforme reçoit 1 440 invocations par jour pour ne rien faire, et le
 * journal de la fonction devient illisible — on ne distingue plus un drainage
 * réel d'un réveil à vide.
 *
 * La réponse HTTP n'est pas attendue. `net.http_post` met la requête en file et
 * rend un identifiant ; c'est `envoyer-avis` qui porte la logique de reprise,
 * de quota et d'abandon. Attendre ici bloquerait le travail planifié sur la
 * latence d'un opérateur télécom.
 */
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
     where statut in ('a_envoyer', 'echoue')
       and tentatives < 3
  ) then
    return 'FILE_VIDE';
  end if;

  select decrypted_secret into adresse from vault.decrypted_secrets where name = 'kolek_url';
  select decrypted_secret into cle from vault.decrypted_secrets where name = 'kolek_cle_service';

  -- Ni erreur ni silence : un état, nommé. Le même choix que dans
  -- `envoyer-avis` face à une passerelle non configurée — la file reste
  -- intacte et repartira telle quelle le jour où les secrets arriveront.
  if adresse is null or cle is null then
    return 'SECRETS_ABSENTS';
  end if;

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

-- `security definer` sur une fonction qui détient une clé de service : les
-- révocations ne sont pas optionnelles. `create or replace function` réattribue
-- l'exécution à `public` sans rien dire.
revoke all on function public.avis_declencher_drainage() from public;
revoke all on function public.avis_declencher_drainage() from anon;
revoke all on function public.avis_declencher_drainage() from authenticated;

comment on function public.avis_declencher_drainage() is
  'Réveille envoyer-avis quand la file n''est pas vide. Lit l''adresse et la clé de service dans Vault ; ne fait rien si elles sont absentes.';

/* ------------------------------ L'horloge -------------------------------- */

do $planifier$
begin
  -- Replanifier sans désinscrire créerait un second travail portant le même
  -- nom à chaque `db reset`, et deux drainages simultanés se disputeraient les
  -- mêmes lignes.
  perform cron.unschedule('kolek-avis-drainage')
   where exists (select 1 from cron.job where jobname = 'kolek-avis-drainage');

  -- Toutes les minutes. C'est la granularité la plus fine de pg_cron, et c'est
  -- la bonne ici : la valeur d'un avis de versement tient à ce qu'il arrive
  -- pendant que le client est encore devant son collecteur.
  perform cron.schedule(
    'kolek-avis-drainage',
    '* * * * *',
    $travail$select public.avis_declencher_drainage();$travail$
  );
end;
$planifier$;

/* ------------------------------ Garde-fou -------------------------------- */

do $garde$
begin
  if has_function_privilege('authenticated', 'public.avis_declencher_drainage()', 'execute')
     or has_function_privilege('anon', 'public.avis_declencher_drainage()', 'execute') then
    raise exception 'GARDE_FOU : la fonction qui lit la clé de service est appelable depuis un navigateur.';
  end if;

  if not exists (select 1 from cron.job where jobname = 'kolek-avis-drainage') then
    raise exception 'GARDE_FOU : le drainage des avis n''est pas planifié.';
  end if;
end;
$garde$;
