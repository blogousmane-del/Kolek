-- Le journal de securite nommait ses acteurs par leur UUID. Une console qui
-- affiche « acteur 3f2a… » ne dit pas qui a agi, et c'est sa seule raison
-- d'etre. La jointure est celle que `20260822090000` et `20260830150000` font
-- deja pour les administrateurs : `coalesce(c.nom, 'Compte sans fiche')`.
--
-- Une migration neuve, jamais une reecriture de `20260830120000`.
--
-- L'enveloppe est reposee en entier. `create or replace` conserve l'ACL, donc
-- l'omettre ne casserait rien aujourd'hui — et c'est precisement ce qui rend
-- l'oubli dangereux : il ne se verrait qu'apres coup. Le garde-fou final
-- refuse que la fonction soit executable par anon ou authenticated.

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
    select least(greatest(coalesce(p_taille, 50), 1), 200) as taille,
           greatest(coalesce(p_page, 1), 1)                as page
  ),
  fenetre as (
    select a.id, a.survenu_le, a.table_cible, a.action, a.ligne_id,
           a.acteur_id, a.collecteur_id, a.donnees
      from public.audit_log a
     where p_inclure_consultations
        or a.table_cible <> 'audit_log'
     order by a.survenu_le desc, a.id desc
     limit  (select taille from parametres) + 1
    offset  ((select page from parametres) - 1) * (select taille from parametres)
  ),
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
                 -- Nul quand l'acteur est nul — les lignes anterieures au
                 -- 2026-08-30 —, « Compte sans fiche » quand il existe sans
                 -- etre collecteur. L'ecran distingue les deux.
                 'acteur_nom',    case
                                    when n.acteur_id is null then null
                                    else coalesce(ac.nom, 'Compte sans fiche')
                                  end,
                 'collecteur_id', n.collecteur_id,
                 'cible_nom',     case
                                    when n.collecteur_id is null then null
                                    else coalesce(ci.nom, 'Compte sans fiche')
                                  end,
                 'donnees',       n.donnees
               ) order by n.rang
             )
        from numerotee n
        left join public.collecteurs ac on ac.id = n.acteur_id
        left join public.collecteurs ci on ci.id = n.collecteur_id
       where n.rang <= (select taille from parametres)
    ), '[]'::jsonb),
    'a_suivre', (select count(*) from numerotee) > (select taille from parametres)
  );
$fn$;

alter function public.super_admin_journal(integer, integer, boolean) owner to postgres;

comment on function public.super_admin_journal is
  'Le journal d''audit, par pages bornees a 200 lignes, consultations masquees sauf demande, acteur et cible nommes. Reservee a service_role : le controle est_super_admin() se fait dans l''Edge Function appelante, sous l''identite de l''appelant. Aucune politique RLS n''est ouverte sur audit_log.';

revoke all on function public.super_admin_journal(integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.super_admin_journal(integer, integer, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Garde-fou
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER sur la table la plus fermee du schema. Rendre la fonction
-- executable par `authenticated` — ce que fait un `create or replace` mal
-- accompagne — donnerait le journal de toute la plateforme a n’importe quel
-- collecteur, sans un mot d’avertissement.

do $garde$
begin
  if has_function_privilege('anon', 'public.super_admin_journal(integer, integer, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.super_admin_journal(integer, integer, boolean)', 'execute') then
    raise exception
      'GARDE_FOU : super_admin_journal() est executable par anon ou authenticated. Le journal d''audit ne s''ouvre qu''a service_role.';
  end if;
end;
$garde$;
