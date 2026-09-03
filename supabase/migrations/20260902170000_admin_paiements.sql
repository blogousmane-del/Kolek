-- Kolek — J5 : ce que l'administration doit voir de l'argent encaissé
--
-- Fonction séparée plutôt qu'un bloc de plus dans `admin_vue_globale()` : cette
-- dernière fait déjà trois cents lignes, et l'Edge Function transmet tout ce
-- qu'elle reçoit sans énumérer les clés. Deux appels coûtent un aller-retour de
-- base ; réécrire une fonction de trois cents lignes pour y greffer un bloc
-- coûte une revue entière.
--
-- Deux écarts avec le plan du 2026-08-22, assumés :
--
--   1. `set search_path = public, pg_temp`, et non `public` seul. Sans
--      `pg_temp` en fin de chemin, un appelant qui crée une table temporaire du
--      même nom que la cible la fait lire à sa place — mesuré le 2026-08-30, et
--      tenu depuis par `search-path.test.ts`. Le plan est antérieur.
--
--   2. `collecteur_id is not null`. Depuis l'amendement « payer vaut accord »,
--      un règlement peut porter une demande d'ouverture et pas encore de
--      compte. Une entrée à `collecteur_id` nul ne correspondrait à aucune
--      ligne de l'écran ; elle ne s'y verrait pas, elle s'y perdrait.

create or replace function public.admin_paiements_recents()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with regles as (
    select collecteur_id, montant, devise, regle_le
      from public.paiements_abonnement
     where statut = 'regle'
       and collecteur_id is not null
  ),
  derniers as (
    select distinct on (collecteur_id)
           collecteur_id,
           regle_le as dernier_le,
           montant  as dernier_montant,
           devise   as derniere_devise
      from regles
     order by collecteur_id, regle_le desc
  )
  select jsonb_build_object(
    'total_30j', coalesce((
      select sum(montant) from regles where regle_le >= now() - interval '30 days'
    ), 0),
    'nombre_30j', (
      select count(*) from regles where regle_le >= now() - interval '30 days'
    ),
    'par_collecteur', coalesce((
      select jsonb_agg(jsonb_build_object(
        'collecteur_id',   collecteur_id,
        'dernier_le',      dernier_le,
        'dernier_montant', dernier_montant,
        'derniere_devise', derniere_devise
      )) from derniers
    ), '[]'::jsonb)
  );
$$;

comment on function public.admin_paiements_recents is
  'Derniers règlements d''abonnement, par collecteur. Réservée à la clé de service : elle traverse toutes les lignes, ce qu''aucune politique RLS n''accorde.';

revoke all on function public.admin_paiements_recents() from public, anon, authenticated;
grant execute on function public.admin_paiements_recents() to service_role;

-- Garde-fou — le même que pour `admin_vue_globale`, et pour la même raison :
-- `create or replace` réattribue EXECUTE à PUBLIC sans rien dire.
do $garde$
declare ouverte boolean;
begin
  select has_function_privilege('authenticated', 'public.admin_paiements_recents()', 'EXECUTE')
    into ouverte;
  if ouverte then
    raise exception 'GARDE_FOU : admin_paiements_recents est exécutable par authenticated';
  end if;
end $garde$;
