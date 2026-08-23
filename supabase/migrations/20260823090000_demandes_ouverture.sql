-- Les demandes d'ouverture de compte.
--
-- ## Ce que cette table n'est pas
--
-- **Ce n'est pas une inscription.** Kolek n'a pas d'inscription libre, et n'en
-- aura pas : un compte collecteur est un abonnement facturé par GTCS, et les
-- trois verrous qui l'empêchent — `disable_signup`, l'absence de politique
-- `INSERT` sur `collecteurs`, les clés étrangères — restent en place, intacts.
--
-- Ce que cette table permet, c'est qu'un collecteur qui découvre le produit
-- **laisse ses informations** au lieu de repartir. GTCS le rappelle, ouvre le
-- compte, et le renseignement saisi ici sert à le pré-remplir. Le formulaire de
-- la vitrine remplace un `mailto:` qui ne produisait rien de visible sur une
-- machine sans client de messagerie.
--
-- ## Le point délicat : c'est la première écriture publique du produit
--
-- Jusqu'ici, aucun chemin n'écrivait en base sans session authentifiée. Celui-ci
-- le fait, et il est donc traité comme une surface exposée :
--
-- * `anon` et `authenticated` n'ont **aucun droit** sur cette table. Elle n'est
--   accessible qu'à la clé de service, donc qu'à travers l'Edge Function
--   `demander-ouverture`, qui valide et borne avant d'écrire.
-- * Toutes les colonnes de texte sont bornées par `CHECK`. La borne est la
--   dernière ligne de défense, celle qui tient même si la fonction change.
-- * Un index unique partiel empêche la même personne d'empiler des demandes en
--   attente : un formulaire public sans cette contrainte est un formulaire qu'on
--   soumet mille fois.
-- * Aucun secret, aucune adresse électronique obligatoire : le strict nécessaire
--   pour rappeler quelqu'un à Abidjan, c'est-à-dire un nom et un numéro.

create table if not exists public.demandes_ouverture (
  id uuid primary key default gen_random_uuid(),

  nom text not null,
  telephone text not null,
  zone text,
  -- Le palier que le visiteur a choisi sur la grille tarifaire. Même liste que
  -- `collecteurs.palier` : la demande se convertit en compte sans traduction.
  palier text not null default 'essai',
  message text,

  statut text not null default 'nouvelle',
  cree_le timestamptz not null default now(),
  traite_le timestamptz,
  traite_par uuid references auth.users (id) on delete set null,

  constraint demandes_nom_borne check (length(nom) between 2 and 120),
  constraint demandes_telephone_borne check (length(telephone) between 8 and 64),
  constraint demandes_zone_borne check (zone is null or length(zone) <= 80),
  constraint demandes_message_borne check (message is null or length(message) <= 500),
  constraint demandes_palier_check check (palier in ('essai', 'standard', 'pro', 'illimite')),
  constraint demandes_statut_check check (statut in ('nouvelle', 'contactee', 'ouverte', 'refusee')),
  -- Un traitement est daté et signé, ou ni l'un ni l'autre. Une demande marquée
  -- « ouverte » sans savoir par qui ni quand ne vaut pas mieux qu'une demande
  -- perdue.
  constraint demandes_traitement_coherent check (
    (statut = 'nouvelle' and traite_le is null and traite_par is null)
    or (statut <> 'nouvelle' and traite_le is not null)
  )
);

-- Le garde-spam. Partiel : une fois la demande traitée, la personne peut en
-- refaire une — un collecteur refusé en août peut revenir en décembre.
create unique index if not exists demandes_telephone_en_attente
  on public.demandes_ouverture (telephone)
  where statut = 'nouvelle';

-- L'écran d'administration les lit par date décroissante, les nouvelles d'abord.
create index if not exists demandes_tri on public.demandes_ouverture (statut, cree_le desc);

alter table public.demandes_ouverture enable row level security;

-- Aucun droit pour les rôles du navigateur. Ni lecture, ni écriture.
-- L'écriture passe par l'Edge Function sous clé de service ; la lecture par la
-- fonction `admin_demandes()` ci-dessous, elle aussi sous clé de service, après
-- que la fonction a vérifié `est_admin()` sous l'identité de l'appelant.
--
-- En particulier : **`anon` ne peut pas relire ce qu'il vient d'écrire.** Un
-- formulaire public qui rendrait la liste des demandes livrerait les noms et
-- les numéros de tous les collecteurs prospectés par GTCS.
revoke all on public.demandes_ouverture from public;
revoke all on public.demandes_ouverture from anon;
revoke all on public.demandes_ouverture from authenticated;
grant all on public.demandes_ouverture to service_role;

/**
 * Le journal d'audit, avec son propre déclencheur.
 *
 * `journaliser()` lit `new.collecteur_id` — toutes les tables qu'il couvre en
 * ont un. Celle-ci n'en a pas, et ne peut pas en avoir : une demande vient de
 * quelqu'un qui **n'est pas encore collecteur**. C'est tout l'objet de la table.
 *
 * Le défaut a été trouvé par les tests, pas par la relecture : l'insertion
 * levait `42703`, colonne inexistante. Réutiliser le déclencheur générique
 * paraissait pourtant évident — il l'était pour cinq tables, pas pour celle-ci.
 *
 * `collecteur_id` reste donc nul, ce que la colonne autorise. La trace garde ce
 * qui compte : la table, la ligne, l'action, et la donnée entière.
 */
create or replace function public.journaliser_demande()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.audit_log (collecteur_id, table_cible, ligne_id, action, donnees)
  values (null, tg_table_name, new.id, lower(tg_op), to_jsonb(new));
  return null;
end;
$fn$;

revoke all on function public.journaliser_demande() from public;
revoke all on function public.journaliser_demande() from anon;
revoke all on function public.journaliser_demande() from authenticated;

drop trigger if exists demandes_journal on public.demandes_ouverture;
create trigger demandes_journal
  after insert or update on public.demandes_ouverture
  for each row execute function public.journaliser_demande();

/**
 * La liste des demandes, pour l'écran d'administration.
 *
 * `security definer` avec `search_path` figé : la fonction lit une table à
 * laquelle son appelant n'a aucun droit, donc le chemin de recherche ne doit pas
 * pouvoir être détourné vers une table homonyme.
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

-- `create or replace function` rétablit silencieusement le droit d'exécution à
-- `public`. Il faut donc le retirer à chaque redéfinition, et non une fois.
revoke all on function public.admin_demandes() from public;
revoke all on function public.admin_demandes() from anon;
revoke all on function public.admin_demandes() from authenticated;
grant execute on function public.admin_demandes() to service_role;

/**
 * Marque une demande comme traitée.
 *
 * L'identité du traitant est passée en argument plutôt que lue dans
 * `auth.uid()` : la fonction s'exécute sous la clé de service, où `auth.uid()`
 * est nul. C'est l'Edge Function qui a vérifié l'identité, et qui la transmet.
 */
create or replace function public.admin_traiter_demande(
  demande_id uuid,
  nouveau_statut text,
  administrateur uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  ligne public.demandes_ouverture;
begin
  if nouveau_statut not in ('contactee', 'ouverte', 'refusee') then
    raise exception 'STATUT_INVALIDE';
  end if;

  update public.demandes_ouverture
     set statut = nouveau_statut,
         traite_le = now(),
         traite_par = administrateur
   where id = demande_id
  returning * into ligne;

  if not found then
    raise exception 'DEMANDE_INTROUVABLE';
  end if;

  return jsonb_build_object('id', ligne.id, 'statut', ligne.statut);
end;
$fn$;

revoke all on function public.admin_traiter_demande(uuid, text, uuid) from public;
revoke all on function public.admin_traiter_demande(uuid, text, uuid) from anon;
revoke all on function public.admin_traiter_demande(uuid, text, uuid) from authenticated;
grant execute on function public.admin_traiter_demande(uuid, text, uuid) to service_role;

-- Garde-fou : la migration échoue si l'un des verrous n'est pas en place. Le
-- même dispositif que `20260822090000` — un `revoke` oublié sur une fonction
-- `security definer` est exactement le genre de défaut qui ne se voit pas.
do $garde$
begin
  if has_table_privilege('anon', 'public.demandes_ouverture', 'select')
     or has_table_privilege('anon', 'public.demandes_ouverture', 'insert')
     or has_table_privilege('authenticated', 'public.demandes_ouverture', 'select') then
    raise exception 'GARDE_FOU : demandes_ouverture reste accessible depuis un navigateur.';
  end if;

  if has_function_privilege('anon', 'public.admin_demandes()', 'execute')
     or has_function_privilege('authenticated', 'public.admin_demandes()', 'execute') then
    raise exception 'GARDE_FOU : admin_demandes reste exécutable sans clé de service.';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.demandes_ouverture'::regclass
       and tgname = 'demandes_journal'
  ) then
    raise exception 'GARDE_FOU : demandes_ouverture n''est pas journalisée.';
  end if;
end;
$garde$;
