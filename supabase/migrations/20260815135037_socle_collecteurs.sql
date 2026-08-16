-- Kolek — socle : collecteurs, clients, cartes
-- Réf. Docs/specs/2026-08-15-j1-socle-design.md §3

create table public.collecteurs (
  id                  uuid primary key references auth.users(id) on delete cascade,
  nom                 text not null,
  telephone           text not null unique,
  zone                text,
  palier              text not null default 'essai'
                        check (palier in ('essai','standard','pro','illimite')),
  abonnement_statut   text not null default 'actif'
                        check (abonnement_statut in ('actif','suspendu','expire')),
  abonnement_echeance date not null default (current_date + 30),
  cree_le             timestamptz not null default now()
);

comment on table public.collecteurs is
  'Un compte payant. En correspondance 1-pour-1 avec auth.users.';

create table public.clients (
  id            uuid primary key,          -- généré par le téléphone (souscription hors-ligne)
  collecteur_id uuid not null references public.collecteurs(id) on delete cascade,
  nom           text not null,
  telephone     text,
  photo_url     text,
  marche        text,
  activite      text,
  cree_le       timestamptz not null default now()
);

create index clients_collecteur_idx on public.clients(collecteur_id);

-- Cible de la clé étrangère composite de cartes (voir plus bas). Redondant avec
-- la clé primaire, mais PostgreSQL exige une contrainte d'unicité sur le couple
-- exact référencé.
alter table public.clients add constraint clients_id_collecteur_unique
  unique (id, collecteur_id);

create table public.cartes (
  id               uuid primary key,       -- généré par le téléphone
  collecteur_id    uuid not null references public.collecteurs(id) on delete cascade,
  client_id        uuid not null,
  mise             integer not null check (mise between 500 and 10000),
  statut           text not null default 'active' check (statut in ('active','cloturee')),
  mises_encaissees integer not null default 0 check (mises_encaissees between 0 and 31),
  ouverte_le       timestamptz not null default now(),
  cloturee_le      timestamptz,
  constraint cartes_cloture_coherente
    check ((statut = 'cloturee') = (cloturee_le is not null)),
  -- Le client d'une carte doit appartenir au même collecteur que la carte.
  -- Sans ce lien, un collecteur pourrait ouvrir une carte sur le client d'un
  -- autre : RLS le cacherait, mais l'index unique « une seule carte active par
  -- client » étant global, l'autre collecteur serait définitivement bloqué sur
  -- son propre client, avec une erreur portant sur une ligne qu'il ne peut pas voir.
  constraint cartes_client_du_meme_collecteur
    foreign key (client_id, collecteur_id)
    references public.clients(id, collecteur_id) on delete cascade
);

-- Décision de cadrage Phase 1 : un client possède une seule carte active à la fois.
create unique index cartes_une_active_par_client
  on public.cartes(client_id) where statut = 'active';

create index cartes_collecteur_idx on public.cartes(collecteur_id);

-- À l'inscription Auth, on matérialise le collecteur.
create or replace function public.creer_collecteur_apres_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.collecteurs (id, nom, telephone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nom', ''), 'Collecteur'),
    coalesce(nullif(new.raw_user_meta_data->>'telephone', ''), new.id::text)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.creer_collecteur_apres_signup();

-- Privilèges Data API. Les nouvelles tables ne sont plus exposées
-- automatiquement : on accorde explicitement, table par table, en miroir des
-- politiques RLS de la migration socle_rls. Sans cela, PostgREST répond
-- « 42501: permission denied », en local comme sur Supabase Cloud.
-- Sur collecteurs, l'update est restreint aux colonnes de profil. RLS ne sait
-- pas filtrer par colonne : sans ce découpage, un collecteur pourrait se
-- mettre `palier = 'illimite'` et `abonnement_statut = 'actif'` lui-même.
grant select                        on public.collecteurs to authenticated;
grant update (nom, telephone, zone) on public.collecteurs to authenticated;
grant select, insert, update on public.clients     to authenticated;

-- Sur cartes, mises_encaissees, statut, ouverte_le et cloturee_le sont
-- décidés par le serveur, jamais par le client : ce compteur est la source
-- dont dépend chaque solde et chaque futur versement.
grant select on public.cartes to authenticated;
grant insert (id, collecteur_id, client_id, mise) on public.cartes to authenticated;

grant all on public.collecteurs, public.clients, public.cartes to service_role;
