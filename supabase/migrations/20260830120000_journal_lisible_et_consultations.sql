-- Kolek — le journal devient lisible, et lire laisse une trace
--
-- ## Un relâchement, assumé et borné
--
-- `audit_log` n'a jamais été lisible par l'API depuis le socle du 2026-08-15 :
-- RLS active, aucune politique, aucun privilège pour `authenticated`. C'est une
-- bonne fermeture, et cette migration l'entrouvre — parce qu'un journal que
-- personne ne peut lire ne protège de rien, et que le contrôle qu'il permet
-- valait qu'on ouvre une porte étroite plutôt que d'en laisser aucune.
--
-- Étroite veut dire trois choses, et elles sont dans le code :
--
-- 1. **Aucune politique RLS n'est ajoutée sur la table.** La lecture passe par
--    une fonction, réservée à `service_role`, appelée par une Edge Function qui
--    aura vérifié `est_super_admin()` sous l'identité de l'appelant.
-- 2. **La page est bornée à 200 lignes**, quoi qu'on demande. Sans plafond, un
--    seul appel exporterait le journal entier — soit exactement ce que la
--    fermeture empêchait.
-- 3. **Aucun total n'est calculé.** Compter les lignes à chaque page coûterait
--    un parcours complet d'une table qui grandit sans fin, pour un chiffre que
--    personne ne lit. La fonction lit une ligne de plus que demandé et dit s'il
--    y en avait une : `a_suivre`.
--
-- ## Lire le journal est journalisé
--
-- Aucun déclencheur ne peut voir une lecture — un `SELECT` n'en déclenche
-- aucun. La consultation s'écrit donc à la main, depuis la fonction qui la
-- sert, avec le même `acteur_courant()` que le reste du journal.
--
-- Sans cela, la seule action qui révèle tout le reste serait la seule à ne rien
-- laisser.
--
-- ## Et les consultations sont masquées par défaut
--
-- C'est le piège de l'idée précédente : chaque lecture ajoute une ligne que la
-- lecture suivante affiche. En une semaine, le journal ne parlerait plus que de
-- lui-même, et ce qu'il protège serait enterré sous la preuve qu'on l'a
-- regardé. `p_inclure_consultations` les fait apparaître à la demande — on
-- garde la trace sans noyer son objet.

-- ---------------------------------------------------------------------------
-- L'index qui rend la page tenable
-- ---------------------------------------------------------------------------
--
-- La lecture est toujours « les plus récentes d'abord ». Sans cet index, chaque
-- page trierait la table entière — et cette table ne rétrécit jamais.

create index if not exists audit_log_survenu_idx
  on public.audit_log (survenu_le desc, id desc);

-- ---------------------------------------------------------------------------
-- Écrire la consultation
-- ---------------------------------------------------------------------------

create or replace function public.journaliser_consultation(p_contexte jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  insert into public.audit_log (collecteur_id, acteur_id, table_cible, ligne_id, action, donnees)
  values (
    null,
    public.acteur_courant(),
    'audit_log',
    null,
    'select',
    coalesce(p_contexte, '{}'::jsonb)
  );
$fn$;

alter function public.journaliser_consultation(jsonb) owner to postgres;

comment on function public.journaliser_consultation is
  'Trace une lecture du journal. Écriture explicite : un SELECT ne déclenche aucun trigger, et l''action qui révèle tout le reste ne peut pas être la seule sans trace.';

revoke all on function public.journaliser_consultation(jsonb) from public, anon, authenticated;
grant execute on function public.journaliser_consultation(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Lire le journal
-- ---------------------------------------------------------------------------

create or replace function public.super_admin_journal(
  p_page integer default 1,
  p_taille integer default 50,
  p_inclure_consultations boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with parametres as (
    -- Bornes appliquées ici et non à l'appel : une fonction qui fait confiance
    -- à son appelant pour se limiter ne limite rien.
    select least(greatest(coalesce(p_taille, 50), 1), 200) as taille,
           greatest(coalesce(p_page, 1), 1)                as page
  ),
  fenetre as (
    -- Une ligne de plus que demandé : c'est tout ce qu'il faut pour savoir
    -- s'il en reste, et cela évite de compter la table.
    select a.id, a.survenu_le, a.table_cible, a.action, a.ligne_id,
           a.acteur_id, a.collecteur_id, a.donnees
      from public.audit_log a
     where p_inclure_consultations
        or a.table_cible <> 'audit_log'
     order by a.survenu_le desc, a.id desc
     limit  (select taille from parametres) + 1
    offset  ((select page from parametres) - 1) * (select taille from parametres)
  ),
  -- Le rang se calcule **après** la fenêtre : une fonction de fenêtrage
  -- s'évalue avant LIMIT et OFFSET, et numéroterait donc la table entière —
  -- la page 2 rendrait alors des rangs 51 à 101, et le filtre ci-dessous
  -- viderait la réponse sans rien signaler.
  numerotee as (
    select f.*, row_number() over (order by f.survenu_le desc, f.id desc) as rang
      from fenetre f
  )
  select jsonb_build_object(
    'lignes', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id',            n.id,
                 'survenu_le',    n.survenu_le,
                 'table_cible',   n.table_cible,
                 'action',        n.action,
                 'ligne_id',      n.ligne_id,
                 'acteur_id',     n.acteur_id,
                 'collecteur_id', n.collecteur_id,
                 'donnees',       n.donnees
               ) order by n.rang
             )
        from numerotee n
       where n.rang <= (select taille from parametres)
    ), '[]'::jsonb),
    'a_suivre', (select count(*) from numerotee) > (select taille from parametres)
  );
$fn$;

alter function public.super_admin_journal(integer, integer, boolean) owner to postgres;

comment on function public.super_admin_journal is
  'Le journal d''audit, par pages bornées à 200 lignes, consultations masquées sauf demande. Réservée à service_role : le contrôle est_super_admin() se fait dans l''Edge Function appelante, sous l''identité de l''appelant. Aucune politique RLS n''est ouverte sur audit_log.';

revoke all on function public.super_admin_journal(integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.super_admin_journal(integer, integer, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Garde-fou
-- ---------------------------------------------------------------------------
--
-- Ces deux fonctions sont SECURITY DEFINER sur la table la plus fermée du
-- schéma. Rendre l'une d'elles exécutable par `authenticated` — ce que fait un
-- `create or replace` mal accompagné — donnerait le journal de toute la
-- plateforme à n'importe quel collecteur, sans un mot d'avertissement.

do $garde$
declare
  ouverte text;
begin
  select string_agg(p.proname, ', ' order by p.proname)
    into ouverte
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('journaliser_consultation', 'super_admin_journal')
     and (
       has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute')
     );

  if ouverte is not null then
    raise exception
      'GARDE_FOU : %() est exécutable par anon ou authenticated. Le journal d''audit ne s''ouvre qu''à service_role.',
      ouverte;
  end if;

  -- La table elle-même reste sans politique : si l'une apparaît un jour, elle
  -- rendra `audit_log` lisible en direct par l'API, et cette fonction bornée
  -- n'aura plus aucun sens.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'audit_log'
  ) then
    raise exception
      'GARDE_FOU : une politique RLS est apparue sur audit_log. La lecture doit passer par super_admin_journal(), bornée et journalisée.';
  end if;
end;
$garde$;
