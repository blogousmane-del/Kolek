-- La caisse suit la main qui a pris l'argent.
--
-- Jusqu'ici l'encaisseur EST le propriétaire, par construction :
-- `mises_avant_insert` refuse la carte d'autrui. Avec une équipe, les deux
-- divergent — le titulaire dépanne Awa, le billet est dans SA poche, et c'est SA
-- caisse du soir qui doit le porter.
--
-- La reprise est donc exacte et non approximative : `encaisse_par` vaut
-- `collecteur_id` sur toute ligne existante, et c'est la vérité, pas une
-- approximation commode.

alter table public.mises    add column encaisse_par uuid references public.collecteurs(id);
alter table public.retraits add column restitue_par uuid references public.collecteurs(id);

comment on column public.mises.encaisse_par is
  'Qui a pris l''argent. Distinct de collecteur_id, qui dit à qui appartient la carte. '
  'Posé par mises_avant_insert, jamais par le client.';
comment on column public.retraits.restitue_par is
  'Qui a sorti l''argent. Distinct de collecteur_id, qui dit à qui appartient la carte.';

-- ---------------------------------------------------------------------------
-- La reprise, et pourquoi elle doit désarmer un déclencheur
-- ---------------------------------------------------------------------------
-- `mises` et `retraits` portent `mises_immuables` / `retraits_immuables`, des
-- déclencheurs BEFORE DELETE OR UPDATE qui lèvent `LIGNE_IMMUABLE` sans
-- exception possible. C'est l'invariant du journal d'audit et il est correct :
-- une table append-only n'a pas d'échappatoire, sinon ce n'en est pas une.
--
-- Une reprise de colonne est le seul cas où il faut le lever, et elle le fait à
-- découvert. La migration entière tourne dans une transaction : si quoi que ce
-- soit échoue ci-dessous, le `disable` est annulé avec le reste — le déclencheur
-- ne peut pas rester désarmé.
alter table public.mises    disable trigger mises_immuables;
alter table public.retraits disable trigger retraits_immuables;

update public.mises    set encaisse_par = collecteur_id where encaisse_par is null;
update public.retraits set restitue_par = collecteur_id where restitue_par is null;

alter table public.mises    enable trigger mises_immuables;
alter table public.retraits enable trigger retraits_immuables;

alter table public.mises    alter column encaisse_par set not null;
alter table public.retraits alter column restitue_par set not null;

-- `(qui, quand)` et non `(qui)` seul : toutes les lectures de caisse filtrent sur
-- une journée.
create index mises_encaisse_par_idx    on public.mises    (encaisse_par, encaisse_le);
create index retraits_restitue_par_idx on public.retraits (restitue_par, effectue_le);

-- Les deux colonnes sont lisibles — le collecteur doit pouvoir distinguer sa
-- propre mise de celle qu'on a encaissée pour lui — et n'entrent dans aucun
-- GRANT d'écriture. `mises` reste en
-- `grant insert (id, collecteur_id, carte_id, montant, encaisse_le)`, donc une
-- requête qui NOMME `encaisse_par` est refusée en 42501 : écartée, pas ignorée.
grant select (encaisse_par) on public.mises    to authenticated;
grant select (restitue_par) on public.retraits to authenticated;

-- ---------------------------------------------------------------------------
-- Qui pose encaisse_par
-- ---------------------------------------------------------------------------
-- `set search_path = public, pg_temp` et non le `public` seul de la définition
-- source : `20260830131000_search_path_pg_temp_en_dernier.sql` a corrigé ce
-- search_path par un `alter function`, qui ne touche pas au corps. Réécrire la
-- fonction sans reporter le correctif la ramènerait à la forme faible.
-- `search-path.test.ts` le détecte.
create or replace function public.mises_avant_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare c public.cartes%rowtype;
begin
  -- Un rejeu de la file de synchro doit toujours se présenter comme un doublon,
  -- quel que soit l'état de la carte depuis. Ce test reste en tête : un rejeu
  -- qui sortirait en DATE_INVALIDE partirait en rejet de synchro, et sa
  -- ressaisie par un humain — avec un nouvel identifiant — serait un double
  -- comptage. C'est précisément ce que l'antériorité de ce test empêche.
  if exists (select 1 from public.mises where id = new.id) then
    raise exception 'DOUBLON' using errcode = '23505';
  end if;

  if new.encaisse_le > now() + interval '1 day'
     or new.encaisse_le < now() - interval '90 days' then
    raise exception 'DATE_INVALIDE';
  end if;

  -- Verrou de ligne : deux mises concurrentes sur la même carte ne peuvent pas
  -- lire toutes les deux mises_encaissees = 0 et créer deux commissions.
  select * into c from public.cartes where id = new.carte_id for update;

  if not found then
    raise exception 'CARTE_INTROUVABLE';
  end if;

  -- Même message que ci-dessus, et c'est voulu : ne rien dire d'une carte que
  -- l'appelant n'a pas le droit de lire.
  --
  -- Sous clé de service `auth.uid()` est nul et cette garde ne s'exécute pas.
  -- C'est déjà vrai aujourd'hui pour tout chemin de service ;
  -- `collecteur-encaisser-pour` est la première fonction à en dépendre pour de
  -- bon, et porte donc la vérification d'appartenance elle-même.
  if auth.uid() is not null and c.collecteur_id <> auth.uid() then
    raise exception 'CARTE_INTROUVABLE';
  end if;

  if c.statut <> 'active' then
    raise exception 'CARTE_CLOTUREE';
  end if;
  if c.mises_encaissees >= 31 then
    raise exception 'CYCLE_COMPLET';
  end if;
  if new.montant <> c.mise then
    raise exception 'MONTANT_INVALIDE';
  end if;

  -- Ces trois champs sont décidés par le serveur, jamais par le client.
  new.est_commission := (c.mises_encaissees = 0);
  new.collecteur_id  := c.collecteur_id;

  -- La bascule qui couvre les trois chemins :
  --   * ordinaire — `auth.uid()` est l'encaisseur, il gagne, et rien de ce que
  --     le client envoie n'est lu ;
  --   * équipe — l'Edge Function écrit sous clé de service, `auth.uid()` est
  --     nul, et la valeur qu'elle a posée est retenue ;
  --   * repli — un chemin de service qui ne pose rien retombe sur le
  --     propriétaire de la carte, c'est-à-dire sur le comportement d'hier.
  new.encaisse_par := coalesce(auth.uid(), new.encaisse_par, c.collecteur_id);

  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Qui pose restitue_par
-- ---------------------------------------------------------------------------
-- Symétrique du précédent, et nécessaire pour la même raison : sans lui, toute
-- écriture de `retraits` qui ne nomme pas la colonne échoue en `23502`. La
-- laisser à la charge de l'appelant aurait fait de chaque chemin d'écriture un
-- endroit où l'oublier — et `retraits` en a plusieurs : l'Edge Function de
-- clôture, les corrections d'administration, les jeux d'essai.
--
-- La bascule est plus courte que celle des mises, et c'est délibéré :
-- `auth.uid()` n'y figure pas. `retraits` n'accorde aucun `insert` à
-- `authenticated` — la table ne s'écrit que sous clé de service, où `auth.uid()`
-- est nul. L'y mettre serait une branche morte qui ressemblerait à une garde.
create or replace function public.retraits_avant_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.restitue_par := coalesce(new.restitue_par, new.collecteur_id);
  return new;
end;
$fn$;

revoke all on function public.retraits_avant_insert() from public, anon, authenticated;

drop trigger if exists retraits_avant_insert on public.retraits;
create trigger retraits_avant_insert
  before insert on public.retraits
  for each row execute function public.retraits_avant_insert();

-- ---------------------------------------------------------------------------
-- La caisse compte la main, plus le propriétaire
-- ---------------------------------------------------------------------------
create or replace function public.cash_attendu_du_jour(p_collecteur uuid, p_date date)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select (
    coalesce((
      select sum(montant)
        from public.mises
       -- `encaisse_par` et non `collecteur_id` : c'est ce qui est passé par
       -- cette main-là qui doit se retrouver dans cette sacoche-là.
       where encaisse_par = p_collecteur
         -- `at time zone 'UTC'` explicite, et non `encaisse_le::date` : ce
         -- dernier découpe la journée selon le fuseau de la session. Abidjan
         -- est à UTC+0 toute l'année, donc les deux coïncident aujourd'hui —
         -- par géographie, pas par intention. Une Edge Function lancée avec un
         -- autre `TimeZone` déplacerait la frontière du jour, et donc l'écart
         -- de caisse.
         and (encaisse_le at time zone 'UTC')::date = p_date
    ), 0)
    -
    -- Ce qui est sorti de la sacoche. `montant_restitue` et non `commission` :
    -- la commission reste chez le collecteur, et elle est déjà comptée du côté
    -- des mises — c'est la première mise du cycle. La soustraire ici la
    -- retirerait deux fois.
    coalesce((
      select sum(montant_restitue)
        from public.retraits
       where restitue_par = p_collecteur
         and (effectue_le at time zone 'UTC')::date = p_date
    ), 0)
  )::integer;
$fn$;

revoke all on function public.cash_attendu_du_jour(uuid, date) from public, anon, authenticated;

create or replace function public.caisses_rafraichir_apres_mise()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  update public.caisses_jour
     set cash_attendu = public.cash_attendu_du_jour(
           new.encaisse_par, (new.encaisse_le at time zone 'UTC')::date)
   where collecteur_id = new.encaisse_par
     and date = (new.encaisse_le at time zone 'UTC')::date;
  return null;
end;
$fn$;

revoke all on function public.caisses_rafraichir_apres_mise() from public, anon, authenticated;

create or replace function public.caisses_rafraichir_apres_retrait()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  update public.caisses_jour
     set cash_attendu = public.cash_attendu_du_jour(
           new.restitue_par, (new.effectue_le at time zone 'UTC')::date)
   where collecteur_id = new.restitue_par
     and date = (new.effectue_le at time zone 'UTC')::date;
  return null;
end;
$fn$;

revoke all on function public.caisses_rafraichir_apres_retrait() from public, anon, authenticated;

-- `caisses_jour` reste en `auth.uid()` : chacun déclare sa propre caisse. Le
-- titulaire ne déclare pas le cash d'Awa, puisqu'il ne l'a pas en main.

-- ------------------------------- Garde-fou --------------------------------

do $garde$
begin
  if has_column_privilege('authenticated', 'public.mises', 'encaisse_par', 'insert') then
    raise exception 'GARDE_FOU : le client peut forger encaisse_par.';
  end if;

  if position('encaisse_par' in
       pg_get_functiondef('public.cash_attendu_du_jour(uuid, date)'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : la caisse compte encore le propriétaire, pas la main.';
  end if;

  if exists (
    select 1 from pg_trigger
     where tgrelid = 'public.mises'::regclass and tgname = 'mises_immuables' and tgenabled = 'D'
  ) then
    raise exception 'GARDE_FOU : mises_immuables est resté désarmé.';
  end if;

  if exists (
    select 1 from pg_trigger
     where tgrelid = 'public.retraits'::regclass and tgname = 'retraits_immuables' and tgenabled = 'D'
  ) then
    raise exception 'GARDE_FOU : retraits_immuables est resté désarmé.';
  end if;

  if exists (select 1 from public.mises where encaisse_par <> collecteur_id) then
    raise exception 'GARDE_FOU : la reprise a inventé un encaisseur.';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.retraits'::regclass and tgname = 'retraits_avant_insert'
  ) then
    raise exception 'GARDE_FOU : restitue_par n''est posé par personne, et la clôture échouera en 23502.';
  end if;
end;
$garde$;
