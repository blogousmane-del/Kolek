-- Le drainage refuse un secret qui n'a pas la forme d'une clé.
--
-- ## Ce qui s'est passé le 2026-08-28
--
-- Pendant la fermeture de la clé `service_role` publiée le 24, le secret
-- `kolek_cle_service` a reçu deux mauvaises valeurs avant la bonne :
--
--   1. le texte d'exemple du plan lui-même, `<coller la clé sb_secret_ ici>` ;
--   2. la clé **publiable** — publique, sans aucun droit d'écriture — avec les
--      chevrons du gabarit conservés autour.
--
-- **Rien ne l'a signalé.** La version précédente de cette fonction ne testait
-- que la nullité : `if adresse is null or cle is null`. Une valeur fausse mais
-- présente passait le portillon, `net.http_post` partait avec un porteur
-- invalide, `envoyer-avis` répondait `401`, et la fonction rendait `DEMANDE`.
-- Toutes les minutes, sans une ligne dans les journaux de la base.
--
-- C'est la panne que le commentaire de `20260823170000_avis_drainage_planifie`
-- décrit comme la pire — une file qui ne se vide jamais pendant que tout paraît
-- fonctionner. Il l'attendait d'un ordonnanceur absent. Elle est venue d'un
-- copier-coller.
--
-- ## Le remède, et ses limites
--
-- Deux états nommés de plus, dans le style des deux qui existaient déjà. Ils ne
-- valident pas la clé — seule la plateforme peut le faire, et seulement en
-- s'en servant. Ils écartent ce qui ne peut pas en être une : un gabarit non
-- remplacé, une clé publiable, une adresse tronquée. C'est précisément la
-- classe d'erreur qui s'est produite, et elle est la plus probable, parce que
-- ces deux valeurs se posent à la main dans un éditeur SQL.
--
-- `eyJ` reste accepté : un projet qui n'a pas migré vers les clés
-- `sb_secret_` porte encore un JWT de rôle service, et cette fonction doit
-- pouvoir servir dans les deux régimes.
--
-- ## Pourquoi aucun test de `supabase/tests/`
--
-- Le harnais n'atteint la base que par PostgREST, sous les rôles `anon` et
-- `service_role`. Cette fonction leur est révoquée — c'est une `security
-- definer` qui détient une clé de service, et le commentaire d'origine dit
-- pourquoi ces révocations ne sont pas négociables. La rendre appelable pour la
-- tester reviendrait à ouvrir ce qu'elle protège.
--
-- Les cinq branches ont donc été exercées à la main, par `psql`, dans une
-- transaction annulée : une ligne mise en file, puis les secrets posés et
-- modifiés tour à tour. Résultat, avec les valeurs réelles de l'incident :
--
--     aucun secret                          → SECRETS_ABSENTS
--     '<sb_publishable_…>'  (l'incident)    → SECRET_INVALIDE
--     '<coller la clé sb_secret_ ici>'      → SECRET_INVALIDE
--     clé correcte, adresse 'https://'      → ADRESSE_INVALIDE
--     clé correcte, adresse correcte        → DEMANDE
--
-- Pour rejouer : `set local session_replication_role = replica` lève les
-- contraintes de clé étrangère le temps d'insérer une ligne d'avis sans
-- collecteur ni client réels — `alter table … disable trigger all` ne passe
-- pas, le rôle `postgres` de Supabase n'étant pas superutilisateur.

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

-- `create or replace function` réattribue l'exécution à `public` sans rien
-- dire. Les révocations sont donc à reposer à chaque remplacement — les
-- oublier rendrait cette fonction, et la clé de service qu'elle détient,
-- appelable par n'importe quel porteur de la clé publiable.
revoke all on function public.avis_declencher_drainage() from public;
revoke all on function public.avis_declencher_drainage() from anon;
revoke all on function public.avis_declencher_drainage() from authenticated;

comment on function public.avis_declencher_drainage() is
  'Réveille envoyer-avis quand la file n''est pas vide. Lit l''adresse et la clé de service dans Vault ; rend un état nommé si elles sont absentes, si l''adresse n''est pas une origine https, ou si la clé n''a pas la forme sb_secret_ ni eyJ.';
