-- Kolek — accorder et reprendre le droit d'administrer
--
-- ## Une seule règle, et la seconde en découle
--
-- La maquette du Super Admin en annonçait deux : « un super admin ne peut pas
-- se rétrograder lui-même » et « il ne peut pas révoquer le dernier super
-- admin ». En les écrivant, la seconde s'est révélée superflue.
--
-- La démonstration tient en une ligne. Seul un super admin appelle ces
-- fonctions, et il ne peut pas s'y désigner : toute révocation qui réussit
-- laisse donc au moins l'acteur. Zéro super admin est inatteignable.
--
-- Un compteur « reste-t-il un super admin ? » aurait été une lecture de plus,
-- une branche de plus, et surtout une deuxième vérité à tenir d'accord avec la
-- première. Les invariants qui se déduisent valent mieux que ceux qui se
-- vérifient.
--
-- ## La course, elle, est réelle
--
-- Deux supers, A et B, qui se révoquent l'un l'autre en même temps : chacun
-- vérifie qu'il est super — les deux le sont encore — puis chacun supprime
-- l'autre. Zéro super admin, et plus personne pour réparer autrement qu'en SQL
-- avec la clé de service.
--
-- D'où le verrou en tête de contrôle : les lignes `super` sont prises en
-- `for update` **avant** toute vérification. La seconde transaction attend, relit,
-- et découvre que son propre droit a disparu. Le raisonnement du paragraphe
-- précédent n'est vrai que sous ce verrou.
--
-- ## L'acteur doit être nommé
--
-- Sans en-tête `x-kolek-acteur`, ces fonctions refusent. Un changement de
-- privilège dont on ne sait pas qui l'a fait est exactement ce que
-- `audit_log.acteur_id` existe pour empêcher, et le laisser passer ici viderait
-- la colonne de son sens à l'endroit précis où elle compte le plus.
--
-- L'amorçage du premier super admin échappe à tout cela : il se fait à la main,
-- en SQL, une fois. C'est le seul geste du produit sans auteur enregistré, et
-- il vaut mieux qu'il soit visiblement hors du système que faussement dedans.

-- ---------------------------------------------------------------------------
-- Le contrôle, en un seul endroit
-- ---------------------------------------------------------------------------
--
-- Rend `{"acteur": "..."}` quand la voie est libre, `{"raison": "..."}` sinon.
-- Extraite plutôt que recopiée dans les deux fonctions : une règle de privilège
-- écrite deux fois finit corrigée une fois.

create or replace function public.super_admin_controle(p_cible uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  acteur uuid;
begin
  -- Avant toute lecture. Sans ce verrou, deux révocations croisées passeraient
  -- toutes les deux, chacune voyant l'autre encore en place.
  perform 1 from public.admins where niveau = 'super' for update;

  acteur := public.acteur_courant();

  if acteur is null then
    return jsonb_build_object('raison', 'acteur_inconnu');
  end if;

  -- La règle unique. Tout le reste en découle.
  if acteur = p_cible then
    return jsonb_build_object('raison', 'action_sur_soi');
  end if;

  -- Le portillon vit aussi ici, et pas seulement dans l'Edge Function : c'est
  -- ce qui rend l'invariant démontrable sans lire le TypeScript.
  if not exists (
    select 1 from public.admins where user_id = acteur and niveau = 'super'
  ) then
    return jsonb_build_object('raison', 'acteur_non_autorise');
  end if;

  return jsonb_build_object('acteur', acteur);
end;
$fn$;

alter function public.super_admin_controle(uuid) owner to postgres;

comment on function public.super_admin_controle is
  'Verrouille les lignes super, puis dit si l''acteur courant peut agir sur la cible. Appelée par les fonctions de privilège, jamais directement.';

revoke all on function public.super_admin_controle(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Accorder, promouvoir, rétrograder
-- ---------------------------------------------------------------------------
--
-- Une seule fonction pour les trois : « ajouter un administrateur » n'est que
-- poser le niveau `admin` sur un compte qui n'en avait aucun. Trois fonctions
-- auraient été trois copies du même contrôle.

create or replace function public.super_admin_definir_niveau(p_cible uuid, p_niveau text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  controle jsonb;
begin
  -- Avant le verrou : une valeur invalide ne mérite pas de faire attendre les
  -- autres transactions.
  if p_niveau is null or p_niveau not in ('admin', 'super') then
    return jsonb_build_object('fait', false, 'raison', 'niveau_inconnu');
  end if;

  controle := public.super_admin_controle(p_cible);
  if controle ? 'raison' then
    return jsonb_build_object('fait', false, 'raison', controle ->> 'raison');
  end if;

  insert into public.admins (user_id, niveau)
  values (p_cible, p_niveau)
  on conflict (user_id) do update set niveau = excluded.niveau;

  return jsonb_build_object('fait', true, 'niveau', p_niveau);
end;
$fn$;

alter function public.super_admin_definir_niveau(uuid, text) owner to postgres;

comment on function public.super_admin_definir_niveau is
  'Inscrit un compte comme administrateur, ou change son niveau. Réservée à service_role, qui doit déclarer l''acteur par x-kolek-acteur : le déclencheur de journal l''enregistrera.';

revoke all on function public.super_admin_definir_niveau(uuid, text) from public, anon, authenticated;
grant execute on function public.super_admin_definir_niveau(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Reprendre
-- ---------------------------------------------------------------------------

create or replace function public.super_admin_revoquer(p_cible uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  controle jsonb;
begin
  controle := public.super_admin_controle(p_cible);
  if controle ? 'raison' then
    return jsonb_build_object('fait', false, 'raison', controle ->> 'raison');
  end if;

  delete from public.admins where user_id = p_cible;

  if not found then
    return jsonb_build_object('fait', false, 'raison', 'cible_non_administrateur');
  end if;

  return jsonb_build_object('fait', true);
end;
$fn$;

alter function public.super_admin_revoquer(uuid) owner to postgres;

comment on function public.super_admin_revoquer is
  'Retire tout droit d''administration. Le retrait compte autant que l''octroi : c''est le dernier geste de qui veut ne pas figurer dans la liste, et admins_journal l''enregistre avec son auteur.';

revoke all on function public.super_admin_revoquer(uuid) from public, anon, authenticated;
grant execute on function public.super_admin_revoquer(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Garde-fou
-- ---------------------------------------------------------------------------
--
-- Ces trois fonctions sont SECURITY DEFINER sur la table qui décide de qui
-- administre le produit. L'une d'elles rendue exécutable par `authenticated` —
-- ce que fait un `create or replace` mal accompagné — donnerait à n'importe quel
-- collecteur de quoi se nommer super admin.

do $garde$
declare
  ouverte text;
begin
  select string_agg(p.proname, ', ' order by p.proname)
    into ouverte
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'super_admin_controle', 'super_admin_definir_niveau', 'super_admin_revoquer'
     )
     and (
       has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute')
     );

  if ouverte is not null then
    raise exception
      'GARDE_FOU : %() est exécutable par anon ou authenticated. La table des privilèges ne s''écrit que par service_role.',
      ouverte;
  end if;
end;
$garde$;
