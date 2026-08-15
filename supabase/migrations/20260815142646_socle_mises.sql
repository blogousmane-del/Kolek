-- Kolek — socle : mises, retraits, triggers métier
-- Réf. Docs/specs/2026-08-15-j1-socle-design.md §3.5

-- `restrict` et non `cascade` : une cascade PostgreSQL exécute un vrai DELETE
-- sur les lignes filles et déclenche donc le trigger d'immuabilité, qui refuse.
-- Les deux règles se contredisaient ; l'immuabilité l'emporte. Un collecteur
-- qui a encaissé ne peut plus être supprimé — c'est l'invariant honnête d'un
-- journal d'audit : on ne fait pas disparaître de l'argent encaissé en
-- supprimant un compte.
create table public.mises (
  id            uuid primary key,     -- généré par le téléphone : clé de l'idempotence
  collecteur_id uuid not null references public.collecteurs(id) on delete restrict,
  carte_id      uuid not null references public.cartes(id) on delete restrict,
  montant       integer not null check (montant > 0),
  est_commission boolean not null default false,
  encaisse_le   timestamptz not null, -- heure du téléphone, heure du geste
  recu_le       timestamptz not null default now() -- heure serveur, heure d'arrivée
);

comment on column public.mises.id is
  'UUID généré par le téléphone. Un rejeu de la file de synchro viole la clé primaire et est ignoré. C''est tout le mécanisme anti-double-comptage.';

create unique index mises_une_commission_par_carte
  on public.mises(carte_id) where est_commission;

create index mises_carte_idx on public.mises(carte_id);
create index mises_collecteur_date_idx on public.mises(collecteur_id, encaisse_le desc);

create table public.retraits (
  id               uuid primary key default gen_random_uuid(),
  collecteur_id    uuid not null references public.collecteurs(id) on delete restrict,
  carte_id         uuid not null unique references public.cartes(id) on delete restrict,
  montant_restitue integer not null check (montant_restitue >= 0),
  commission       integer not null check (commission >= 0),
  effectue_le      timestamptz not null default now()
);

-- Validation métier avant chaque encaissement.
create or replace function public.mises_avant_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare c public.cartes%rowtype;
begin
  -- Verrou de ligne : deux mises concurrentes sur la même carte ne peuvent
  -- pas lire toutes les deux mises_encaissees = 0 et créer deux commissions.
  select * into c from public.cartes where id = new.carte_id for update;

  if not found then
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

  -- Ces deux champs sont décidés par le serveur, jamais par le client.
  new.est_commission := (c.mises_encaissees = 0);
  new.collecteur_id  := c.collecteur_id;

  return new;
end;
$$;

create trigger mises_avant_insert
  before insert on public.mises
  for each row execute function public.mises_avant_insert();

-- Compteur de cache. La source de vérité reste count(mises) ;
-- SECURITY DEFINER car aucune policy RLS n'autorise le collecteur à écrire dans cartes.
create or replace function public.mises_apres_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cartes
     set mises_encaissees = mises_encaissees + 1
   where id = new.carte_id;
  return null;
end;
$$;

create trigger mises_apres_insert
  after insert on public.mises
  for each row execute function public.mises_apres_insert();

-- Append-only. Couvre aussi les accès par clé de service, que RLS ne filtre pas.
create or replace function public.interdire_modification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'LIGNE_IMMUABLE: la table % est append-only', tg_table_name;
end;
$$;

create trigger mises_immuables
  before update or delete on public.mises
  for each row execute function public.interdire_modification();

create trigger retraits_immuables
  before update or delete on public.retraits
  for each row execute function public.interdire_modification();

-- Privilèges Data API, en miroir des politiques RLS à venir.
-- Ni update ni delete : l'immuabilité se refuse aussi au niveau des privilèges.
-- retraits n'a pas non plus insert : une clôture passe par une Edge Function
-- (J3), jamais par le téléphone — même raison que l'absence d'update sur cartes.
grant select, insert on public.mises    to authenticated;
grant select         on public.retraits to authenticated;

grant all on public.mises, public.retraits to service_role;
