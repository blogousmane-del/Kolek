-- L'adresse électronique des demandes d'ouverture.
--
-- ## Le revirement, et pourquoi il est légitime
--
-- `20260823090000` écrivait, en toutes lettres : « Aucun secret, aucune adresse
-- électronique obligatoire : le strict nécessaire pour rappeler quelqu'un à
-- Abidjan, c'est-à-dire un nom et un numéro. » C'était juste tant que la seule
-- suite d'une demande était un appel téléphonique.
--
-- Depuis le 2026-08-27, l'accord d'une demande **ouvre le compte** et envoie une
-- invitation. Sans adresse, ce chemin n'existe pas : il faudrait rappeler,
-- demander l'adresse au téléphone, la ressaisir. Le formulaire la demande donc,
-- et `valider-email.ts` la refuse absente.
--
-- ## La colonne reste nullable
--
-- Les demandes déposées avant ce jour n'en portent pas. Un `not null`
-- rétroactif obligerait à leur inventer une adresse — c'est-à-dire à écrire en
-- base quelque chose que personne n'a saisi. L'obligation vit à l'entrée ; la
-- colonne enregistre ce qui est arrivé.

alter table public.demandes_ouverture
  add column if not exists email text;

alter table public.demandes_ouverture
  drop constraint if exists demandes_email_borne;

-- Jumelle de `demandes_nom_borne` et consorts : la borne est la dernière ligne
-- de défense, celle qui tient même si l'Edge Function change.
alter table public.demandes_ouverture
  add constraint demandes_email_borne
  check (email is null or (length(email) between 6 and 160 and position('@' in email) > 1));

-- Le garde-spam de l'adresse, jumeau de `demandes_telephone_en_attente`.
--
-- Sur `lower(email)` et non sur `email` : `valider-email.ts` normalise déjà en
-- minuscules, mais l'index doit tenir même pour une écriture faite par un autre
-- chemin sous clé de service. Deux protections qui se recouvrent valent mieux
-- qu'une seule qui dépend de l'autre.
--
-- Partiel, comme son jumeau : une fois la demande traitée, la personne peut en
-- refaire une — un collecteur refusé en août peut revenir en décembre.
create unique index if not exists demandes_email_en_attente
  on public.demandes_ouverture (lower(email))
  where statut = 'nouvelle' and email is not null;

/**
 * La liste des demandes — redéfinie pour rendre l'adresse.
 *
 * L'écran d'administration l'affiche : c'est elle qui recevra l'invitation, et
 * l'administrateur doit pouvoir la relire avant d'accorder.
 */
create or replace function public.admin_demandes()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'nom', d.nom,
        'telephone', d.telephone,
        'email', d.email,
        'zone', d.zone,
        'palier', d.palier,
        'message', d.message,
        'statut', d.statut,
        'cree_le', d.cree_le,
        'traite_le', d.traite_le
      )
      -- Les nouvelles d'abord, puis les plus récentes : c'est l'ordre de
      -- travail de celui qui rappelle.
      order by (d.statut = 'nouvelle') desc, d.cree_le desc
    ),
    '[]'::jsonb
  )
  from public.demandes_ouverture d;
$fn$;

-- `create or replace function` rétablit silencieusement `EXECUTE` à `public`.
-- Il faut donc le retirer à chaque redéfinition, et non une fois. L'audit du
-- 2026-08-25 a retrouvé ce défaut ailleurs dans le schéma : il ne se voit pas.
revoke all on function public.admin_demandes() from public;
revoke all on function public.admin_demandes() from anon;
revoke all on function public.admin_demandes() from authenticated;
grant execute on function public.admin_demandes() to service_role;

/**
 * Une demande, lue sans être touchée.
 *
 * Elle existe pour l'ordre d'envoi décidé le 2026-08-27 : l'accord lit la
 * demande, crée le compte, envoie l'invitation, et **ne marque la demande
 * qu'ensuite**. Il lui faut donc nom, téléphone, adresse, zone et palier
 * *avant* d'appeler `admin_traiter_demande`, pas dans sa réponse.
 *
 * Rend `null` — et non une exception — quand la demande n'existe pas :
 * l'appelant traduit ce cas en 404, et une exception l'obligerait à lire un
 * message d'erreur pour distinguer l'absence d'une panne.
 */
create or replace function public.admin_demande(demande_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'id', d.id,
    'nom', d.nom,
    'telephone', d.telephone,
    'email', d.email,
    'zone', d.zone,
    'palier', d.palier,
    'statut', d.statut
  )
  from public.demandes_ouverture d
  where d.id = demande_id;
$fn$;

revoke all on function public.admin_demande(uuid) from public;
revoke all on function public.admin_demande(uuid) from anon;
revoke all on function public.admin_demande(uuid) from authenticated;
grant execute on function public.admin_demande(uuid) to service_role;

comment on function public.admin_demande is
  'Une demande d''ouverture, lue sans modification. Réservée à service_role : le contrôle est_admin() se fait dans l''Edge Function appelante.';

-- Garde-fou, même dispositif que `20260823090000`.
do $garde$
begin
  if has_function_privilege('anon', 'public.admin_demandes()', 'execute')
     or has_function_privilege('authenticated', 'public.admin_demandes()', 'execute') then
    raise exception 'GARDE_FOU : admin_demandes est redevenue exécutable sans clé de service.';
  end if;

  if has_function_privilege('anon', 'public.admin_demande(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.admin_demande(uuid)', 'execute') then
    raise exception 'GARDE_FOU : admin_demande reste exécutable sans clé de service.';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'demandes_email_en_attente'
  ) then
    raise exception 'GARDE_FOU : rien n''empêche une adresse de déposer mille demandes.';
  end if;
end;
$garde$;
