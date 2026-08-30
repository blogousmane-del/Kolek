-- Kolek — l'état que lit l'écran Super Admin
--
-- ## « Ajouté par » ne se stocke pas
--
-- La maquette portait une colonne « Par » dans la liste des administrateurs, et
-- la première idée était une colonne `admins.ajoute_par`. Elle est abandonnée :
-- depuis `acteur_id`, `audit_log` porte déjà qui a inscrit qui, et
-- `interdire_modification` rend cette ligne indestructible. Une seconde copie du
-- même fait finit par le contredire, et c'est la copie mutable qui gagne.
--
-- L'état la relit donc dans le journal — la première trace `insert` sur
-- `admins` pour ce compte. Un administrateur inscrit avant le 2026-08-30, ou par
-- une écriture qui n'a rien déclaré, rend `null` : « non attribué » est une
-- réponse, et retomber sur le sujet reproduirait le défaut que `acteur_id`
-- vient de corriger.
--
-- ## Le statut d'un code se calcule ici
--
-- Programmé, en cours, expiré, quota épuisé. Quatre états, une définition. Les
-- recopier dans l'écran donnerait un jour un code affiché « en cours » que
-- `appliquer_code_promo()` refuse — et l'écran aurait l'air d'avoir raison.
--
-- L'ordre des branches suit celui du refus : le quota d'abord, parce qu'un code
-- épuisé pendant sa période est épuisé, pas en cours.
--
-- ## Ce que cette fonction ne rend pas
--
-- Le journal d'audit. Il se lit par `super_admin_journal()`, paginé et borné,
-- et sa consultation s'enregistre — deux raisons pour lesquelles il n'a rien à
-- faire dans un état qu'on rafraîchit à chaque ouverture d'écran.

create or replace function public.super_admin_etat()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object(
    'genere_le', now(),

    'administrateurs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id',   a.user_id,
          'niveau',    a.niveau,
          -- La jointure met un nom sur un identifiant. Un administrateur n'est
          -- pas forcément un collecteur : sans fiche, il n'a ni nom ni
          -- téléphone, et l'écran le dit plutôt que d'inventer un libellé.
          'nom',       coalesce(c.nom, 'Compte sans fiche'),
          'telephone', c.telephone,
          'ajoute_le', a.cree_le,
          -- La première trace d'inscription porte l'auteur. `min(survenu_le)`
          -- et non la dernière : une promotion ultérieure a son propre acteur,
          -- mais celui qui a ouvert la porte est le premier.
          'ajoute_par', (
            select j.acteur_id
              from public.audit_log j
             where j.table_cible = 'admins'
               and j.ligne_id = a.user_id
               and j.action = 'insert'
             order by j.survenu_le
             limit 1
          )
        )
        order by a.cree_le
      )
      from public.admins a
      left join public.collecteurs c on c.id = a.user_id
    ), '[]'::jsonb),

    'codes_promo', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code',         p.code,
          'remise_pct',   p.remise_pct,
          'valide_du',    p.valide_du,
          'valide_au',    p.valide_au,
          'quota',        p.quota,
          'utilisations', p.utilisations,
          'cree_le',      p.cree_le,
          'statut', case
            -- Le quota d'abord : un code épuisé pendant sa période est épuisé.
            when p.quota is not null and p.utilisations >= p.quota then 'quota_epuise'
            when current_date < p.valide_du                        then 'programme'
            when current_date > p.valide_au                        then 'expire'
            else                                                        'en_cours'
          end
        )
        order by p.cree_le desc
      )
      from public.codes_promo p
    ), '[]'::jsonb),

    -- Seules les remises qui courent encore. Une remise échue n'est plus une
    -- dépense : elle appartient au journal, pas à l'écran des remises.
    'remises', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'collecteur_id', c.id,
          'nom',           c.nom,
          'palier',        c.palier,
          'promo_code',    c.promo_code,
          'remise_pct',    c.remise_pct,
          'remise_fin',    c.remise_fin
        )
        order by c.remise_fin, c.nom
      )
      from public.collecteurs c
     where c.remise_pct is not null
       and c.remise_fin >= current_date
    ), '[]'::jsonb)
  );
$fn$;

alter function public.super_admin_etat() owner to postgres;

comment on function public.super_admin_etat is
  'Administrateurs, codes promo et remises en cours, pour l''écran Super Admin. « Ajouté par » est relu dans audit_log plutôt que stocké. Réservée à service_role : le contrôle est_super_admin() se fait dans l''Edge Function appelante, sous l''identité de l''appelant.';

revoke all on function public.super_admin_etat() from public, anon, authenticated;
grant execute on function public.super_admin_etat() to service_role;

-- Cette fonction lit `admins` et `codes_promo`, deux tables fermées à toute
-- politique RLS. Rendue exécutable par `authenticated`, elle publierait la
-- liste des administrateurs de la plateforme à n'importe quel collecteur.
do $garde$
begin
  if has_function_privilege('anon', 'public.super_admin_etat()', 'execute')
     or has_function_privilege('authenticated', 'public.super_admin_etat()', 'execute') then
    raise exception
      'GARDE_FOU : super_admin_etat() est exécutable par anon ou authenticated. Elle rend la liste des administrateurs et ne doit sortir que par une Edge Function.';
  end if;
end;
$garde$;
