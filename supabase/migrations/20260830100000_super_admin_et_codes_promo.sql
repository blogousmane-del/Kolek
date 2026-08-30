-- Kolek — un niveau au-dessus de l'administrateur, et les remises qu'il consent
--
-- ## Pourquoi un niveau
--
-- `admins` porte depuis le socle un droit binaire : y figurer, c'est tout
-- pouvoir. L'administrateur métier — celui qui suit les tournées, encaisse les
-- mises, relance les impayés — dispose donc aussi de quoi lire la liste de ses
-- pairs et toucher aux réglages de la plateforme. Personne ne le lui a accordé,
-- c'est le modèle qui n'a jamais eu de second cran.
--
-- Une colonne plutôt qu'une table `super_admins` : deux tables de privilèges,
-- c'est deux fermetures à tenir, deux journaux à poser, et un jour l'une qui
-- contredit l'autre. `est_admin()` ne change pas d'un caractère — un super
-- admin **est** un administrateur, et le Dashboard s'ouvre pour lui comme
-- avant.
--
-- ## Aucun amorçage automatique
--
-- Cette migration ne promeut personne. Un `update admins set niveau = 'super'
-- where cree_le = (select min(cree_le) ...)` accorderait le niveau le plus haut
-- du produit à un compte que personne n'a désigné, au seul motif qu'il est
-- arrivé le premier. Le premier super admin se pose à la main, par
-- `service_role`, une fois — et le journal l'enregistre, depuis la migration
-- du 2026-08-30 avec son auteur.
--
-- ## Ce que porte un code promo
--
-- Une remise en pourcentage sur le prix du palier, jamais un montant : la
-- grille tarifaire vit dans `@kolek/core` et n'entre pas en base — c'est
-- l'invariant que `admin-vue-globale` défend depuis le 2026-08-20. Un montant
-- ici obligerait à recopier les prix, et deux copies d'un prix finissent par
-- diverger.
--
-- Le taux est **figé à l'application** : `collecteurs.remise_pct` est une copie
-- datée, pas une jointure. Modifier la campagne plus tard, ou la supprimer, ne
-- reprend rien à celui à qui on a promis. C'est la seule façon de tenir une
-- promesse commerciale sans geler la grille.

-- ---------------------------------------------------------------------------
-- Le second cran
-- ---------------------------------------------------------------------------

alter table public.admins
  add column if not exists niveau text not null default 'admin';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admins_niveau_check'
  ) then
    alter table public.admins
      add constraint admins_niveau_check check (niveau in ('admin', 'super'));
  end if;
end;
$$;

comment on column public.admins.niveau is
  'admin : le Dashboard métier. super : plus les administrateurs, le journal et les remises. Un super admin est aussi un admin — est_admin() ne distingue pas.';

-- Aucune colonne « ajouté par » : depuis le 2026-08-30, `audit_log.acteur_id`
-- porte déjà qui a promu qui, et `interdire_modification` rend cette ligne
-- indestructible. Une seconde copie du même fait finirait par le contredire.

create or replace function public.est_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
     where user_id = (select auth.uid())
       and niveau = 'super'
  );
$$;

alter function public.est_super_admin() owner to postgres;

comment on function public.est_super_admin is
  'Vrai si l''appelant administre la plateforme elle-même. Portillon, pas un accès aux données : elle n''ouvre aucune ligne d''admins, et les écrans passent par Edge Functions.';

-- Même exception explicite qu'`est_admin` : le socle révoque EXECUTE à
-- `authenticated` sur tout le schéma, y compris par défaut sur les fonctions à
-- venir. Sans cette ligne, le portillon serait fermé à ceux qu'il doit filtrer.
revoke all on function public.est_super_admin() from public, anon;
grant execute on function public.est_super_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Les codes promo
-- ---------------------------------------------------------------------------
--
-- Clé technique `id` en plus du code, pour une raison unique : `journaliser()`
-- lit `ligne ->> 'id'` et l'écrit dans `audit_log.ligne_id`, qui est un `uuid`.
-- Sans elle il faudrait une cinquième fonction de journal, ou des traces sans
-- identifiant. Le code reste la clé métier, et il est unique.

create table if not exists public.codes_promo (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique
                 check (code ~ '^[A-Z0-9]{4,24}$'),
  remise_pct   smallint not null
                 check (remise_pct between 1 and 100),
  valide_du    date not null,
  valide_au    date not null,
  -- `null` = sans limite. Un quota à zéro n'aurait aucun sens : un code que
  -- personne ne peut utiliser se supprime, il ne se crée pas.
  quota        integer check (quota > 0),
  utilisations integer not null default 0 check (utilisations >= 0),
  cree_le      timestamptz not null default now(),
  constraint codes_promo_periode_check check (valide_au >= valide_du)
);

comment on table public.codes_promo is
  'Campagnes de remise sur le prix du palier. Jamais saisi par un collecteur : un super admin l''applique. Aucune surface publique, donc rien à borner en débit.';

alter table public.codes_promo enable row level security;

-- Aucune politique, comme `admins` et `audit_log` : la table ne s'atteint que
-- par Edge Function, sous `service_role`, après un contrôle `est_super_admin()`
-- fait sous l'identité de l'appelant.
revoke all on public.codes_promo from public, anon, authenticated;
grant all on public.codes_promo to service_role;

drop trigger if exists codes_promo_journal on public.codes_promo;
create trigger codes_promo_journal
  after insert or update or delete on public.codes_promo
  for each row execute function public.journaliser();

-- ---------------------------------------------------------------------------
-- La remise posée sur le collecteur
-- ---------------------------------------------------------------------------

alter table public.collecteurs
  add column if not exists promo_code text
    references public.codes_promo(code) on delete set null,
  add column if not exists remise_pct smallint,
  add column if not exists remise_fin date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'collecteurs_remise_check'
  ) then
    alter table public.collecteurs
      add constraint collecteurs_remise_check check (
        (remise_pct is null) = (remise_fin is null)
        and (remise_pct is null or remise_pct between 1 and 100)
      );
  end if;
end;
$$;

comment on column public.collecteurs.remise_pct is
  'Taux figé au jour de l''application. Copie datée et non jointure : supprimer la campagne ne reprend pas ce qui a été promis — d''où le on delete set null sur promo_code, qui laisse le taux en place.';

comment on column public.collecteurs.remise_fin is
  'Dernier jour où la remise court. Vaut la fin de campagne : une remise dure ce que dure l''offre, pas ce que dure l''abonnement.';

-- ---------------------------------------------------------------------------
-- Appliquer un code
-- ---------------------------------------------------------------------------
--
-- Le quota se consomme dans **un seul** `UPDATE` conditionnel. Lire
-- `utilisations` puis l'écrire laisserait deux applications simultanées
-- franchir la même limite — le défaut qu'`avis_quota_atomique` a corrigé le
-- 2026-08-23, et pour la même raison : un compteur qui borne une dépense et se
-- fait dépasser borne la mauvaise.
--
-- Le collecteur est vérifié **avant**, hors de la course : une remise déjà
-- active doit refuser sans rien consommer. L'inverse ferait payer un quota
-- pour une remise qu'on n'a pas posée.

create or replace function public.appliquer_code_promo(p_collecteur uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  fin_courante date;
  promo public.codes_promo;
begin
  select remise_fin into fin_courante
    from public.collecteurs
   where id = p_collecteur;

  if not found then
    return jsonb_build_object('applique', false, 'raison', 'collecteur_introuvable');
  end if;

  -- Deux campagnes superposées sur un même abonnement consommeraient deux
  -- quotas pour une seule remise visible, et personne ne saurait laquelle
  -- s'applique.
  if fin_courante is not null and fin_courante >= current_date then
    return jsonb_build_object('applique', false, 'raison', 'remise_deja_active');
  end if;

  update public.codes_promo
     set utilisations = utilisations + 1
   where code = p_code
     and current_date between valide_du and valide_au
     and (quota is null or utilisations < quota)
  returning * into promo;

  -- Un seul refus pour trois causes — code inconnu, hors période, quota
  -- atteint. Les distinguer dirait à qui appelle si un code existe, et cette
  -- fonction n'a aucune raison de le confirmer.
  if not found then
    return jsonb_build_object('applique', false, 'raison', 'code_indisponible');
  end if;

  update public.collecteurs
     set promo_code = promo.code,
         remise_pct = promo.remise_pct,
         remise_fin = promo.valide_au
   where id = p_collecteur;

  return jsonb_build_object(
    'applique',   true,
    'code',       promo.code,
    'remise_pct', promo.remise_pct,
    'remise_fin', promo.valide_au
  );
end;
$fn$;

alter function public.appliquer_code_promo(uuid, text) owner to postgres;

comment on function public.appliquer_code_promo is
  'Pose une remise sur un collecteur et consomme une unité de quota, atomiquement. Réservée à service_role : le contrôle est_super_admin() se fait dans l''Edge Function appelante, sous l''identité de l''appelant.';

revoke all on function public.appliquer_code_promo(uuid, text) from public, anon, authenticated;
grant execute on function public.appliquer_code_promo(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Garde-fou
-- ---------------------------------------------------------------------------
--
-- Deux façons silencieuses de rouvrir ce que cette migration ferme : rendre
-- `appliquer_code_promo` exécutable par un compte authentifié — elle est
-- SECURITY DEFINER, elle poserait alors des remises sans aucun contrôle — et
-- oublier le déclencheur de journal sur la table qui décide de qui paie moins.

do $garde$
declare
  ouverte text;
begin
  select string_agg(p.proname, ', ')
    into ouverte
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('appliquer_code_promo')
     and (
       has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute')
     );

  if ouverte is not null then
    raise exception
      'GARDE_FOU : %() est exécutable par anon ou authenticated. Une fonction d''administration SECURITY DEFINER ne doit être appelable que par service_role.',
      ouverte;
  end if;

  if not exists (
    select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal
       and c.relnamespace = 'public'::regnamespace
       and c.relname = 'codes_promo'
       and t.tgname = 'codes_promo_journal'
       -- 28 = INSERT | UPDATE | DELETE.
       and (t.tgtype & 28) = 28
  ) then
    raise exception 'GARDE_FOU : codes_promo n''est pas journalisée sur les trois événements.';
  end if;
end;
$garde$;
