/**
 * Le drainage cesse de dépendre de la clé de service.
 *
 * ## Le défaut, mesuré en production le 2026-09-04
 *
 * `envoyer-avis` comparait le porteur reçu à `SUPABASE_SERVICE_ROLE_KEY`, la
 * variable que la plateforme injecte dans le runtime Edge. `avis_declencher_drainage()`
 * présentait, elle, la valeur de Vault `kolek_cle_service`. Les deux ont été
 * tenues pour la même chose ; elles ne le sont pas.
 *
 * L'inspection du runtime le dit sans ambiguïté — Supabase expose les deux
 * formes de clé sous deux noms, et `SUPABASE_SERVICE_ROLE_KEY` porte l'ancienne :
 *
 *     SUPABASE_SERVICE_ROLE_KEY      = eyJhbGciOiJI...   (JWT hérité)
 *     SUPABASE_INTERNAL_SECRET_KEY   = sb_secret_...     (forme du 2026-08-28)
 *
 * Depuis la migration des clés du 2026-08-28, Vault porte `sb_secret_`, 41
 * caractères. La comparaison ne pouvait donc plus réussir. Elle a échoué à
 * chaque réveil de l'horloge à partir du déploiement de la version 30, le
 * 2026-09-04 à 07:50 UTC, en rendant `403 ACCES_RESERVE` — visible seulement
 * dans `net._http_response`, que personne ne regarde.
 *
 * ## Pourquoi un troisième secret, et pas la bonne variable
 *
 * Faire pointer la comparaison sur `SUPABASE_INTERNAL_SECRET_KEY` réparerait le
 * symptôme et rien d'autre. Ce nom porte `INTERNAL` : il appartient à la
 * plateforme, n'est pas contractuel, et rien ne garantit qu'il désigne demain ce
 * qu'il désigne aujourd'hui. Surtout, le défaut de fond n'est pas le choix du
 * nom — c'est que la porte du drainage dépend d'une clé dont la rotation ne nous
 * appartient pas. Le secret `kolek_cle_service` a déjà reçu deux mauvaises
 * valeurs le 2026-08-28 ; c'est le troisième incident sur le même couplage.
 *
 * L'appelant n'a pas besoin de prouver qu'il détient la clé de service. Il a
 * besoin de prouver qu'il est l'horloge. C'est un secret partagé, et il en
 * existe déjà un dans ce dépôt qui fait exactement ce travail : celui de
 * `chariow-webhook`.
 *
 * ## Pourquoi l'en-tête, et pas le porteur
 *
 * `envoyer-avis` garde `verify_jwt` — seul `chariow-webhook` en est dispensé
 * dans `config.toml`. La plateforme refuse donc en `401` tout `Authorization`
 * qui n'est pas un jeton qu'elle reconnaît, avant que notre code ne voie quoi
 * que ce soit. Un secret aléatoire posé en porteur n'atteindrait jamais la
 * fonction.
 *
 * `Authorization` continue donc de porter `kolek_cle_service`, dont le seul rôle
 * est désormais de traverser `verify_jwt`. Le contrôle réel se fait sur
 * `x-kolek-drainage`. L'avantage secondaire compte autant : rien ne change au
 * déploiement, et il n'y a pas de `--no-verify-jwt` à ne pas oublier — l'oublier
 * arrêterait le drainage exactement comme aujourd'hui.
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
  secret text;
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
  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'kolek_secret_drainage';

  -- Ni erreur ni silence : un état, nommé. La file reste intacte et repartira
  -- telle quelle le jour où les secrets arriveront.
  if adresse is null or cle is null then
    return 'SECRETS_ABSENTS';
  end if;

  -- Distinct de `SECRETS_ABSENTS`, parce qu'il nomme le seul geste à faire : ce
  -- secret est neuf, et une base qui a reçu la migration sans lui doit le dire
  -- plutôt que de laisser chercher parmi trois.
  if secret is null then
    return 'SECRET_DRAINAGE_ABSENT';
  end if;

  -- Les deux ajouts du 2026-08-28. Voir l'en-tête : ils transforment une panne
  -- muette en réponse lisible, et c'est tout ce qu'on leur demande.
  if adresse !~ '^https://[a-z0-9.-]+$' then
    return 'ADRESSE_INVALIDE';
  end if;

  if cle !~ '^(sb_secret_|eyJ)' then
    return 'SECRET_INVALIDE';
  end if;

  -- Même intention que les deux précédents. Un gabarit non remplacé ou une
  -- valeur tronquée au collage passerait sinon jusqu'à la fonction, qui
  -- répondrait `403` sans que rien ne dise pourquoi — c'est très exactement ce
  -- qui s'est passé ce matin.
  if length(secret) < 32 then
    return 'SECRET_DRAINAGE_COURT';
  end if;

  -- La réponse HTTP n'est pas attendue : `envoyer-avis` porte la logique de
  -- reprise, de quota et d'abandon.
  perform net.http_post(
    url := adresse || '/functions/v1/envoyer-avis',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || cle,
      'x-kolek-drainage', secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );

  return 'DEMANDE';
end;
$fn$;

-- Reposées, comme à chaque remplacement. Voir `20260828100000` : les oublier
-- rendrait cette fonction, et les secrets qu'elle lit dans Vault, appelable par
-- n'importe quel porteur de la clé publiable.
revoke all on function public.avis_declencher_drainage() from public;
revoke all on function public.avis_declencher_drainage() from anon;
revoke all on function public.avis_declencher_drainage() from authenticated;
revoke all on function public.avis_declencher_drainage() from service_role;

comment on function public.avis_declencher_drainage() is
  'Réveille envoyer-avis quand la file n''est pas vide, réservations abandonnées comprises. Présente kolek_secret_drainage dans l''en-tête x-kolek-drainage — c''est lui qui ouvre la fonction ; l''Authorization ne sert plus qu''à traverser verify_jwt. Rend un état nommé si un secret manque, si l''adresse n''est pas une origine https, si la clé de service n''a pas la forme sb_secret_ ni eyJ, ou si le secret de drainage fait moins de 32 caractères.';
