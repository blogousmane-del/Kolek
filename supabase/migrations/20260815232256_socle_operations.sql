-- Kolek — socle : rapprochement de caisse, rejets de synchro, journal d'audit
-- Réf. Docs/specs/2026-08-15-j1-socle-design.md §3.3 et §4.4

create table public.caisses_jour (
  id            uuid primary key default gen_random_uuid(),
  collecteur_id uuid not null references public.collecteurs(id) on delete cascade,
  date          date not null default current_date,
  cash_attendu  integer not null default 0,
  cash_declare  integer not null default 0,
  ecart         integer generated always as (cash_declare - cash_attendu) stored,
  unique (collecteur_id, date)
);

-- Mises refusées à la synchronisation. Jamais de perte silencieuse :
-- l'argent a changé de main dans le monde réel, un humain doit trancher.
create table public.synchro_rejets (
  id            uuid primary key default gen_random_uuid(),
  collecteur_id uuid not null references public.collecteurs(id) on delete cascade,
  charge_utile  jsonb not null,
  motif         text not null,
  traite        boolean not null default false,
  cree_le       timestamptz not null default now()
);

create index synchro_rejets_a_traiter_idx
  on public.synchro_rejets(collecteur_id) where not traite;

create table public.audit_log (
  id            bigint generated always as identity primary key,
  collecteur_id uuid,
  table_cible   text not null,
  ligne_id      uuid,
  action        text not null,
  donnees       jsonb,
  survenu_le    timestamptz not null default now()
);

create index audit_log_ligne_idx on public.audit_log(ligne_id);

-- Super-admin GTCS. Aucune politique RLS ne s'appuie sur cette table :
-- les accès admin passent exclusivement par Edge Functions (spec §5.3).
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cree_le timestamptz not null default now()
);

create or replace function public.journaliser()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (collecteur_id, table_cible, ligne_id, action, donnees)
  values (new.collecteur_id, tg_table_name, new.id, lower(tg_op), to_jsonb(new));
  return null;
end;
$$;

create trigger mises_journal    after insert on public.mises    for each row execute function public.journaliser();
create trigger retraits_journal after insert on public.retraits for each row execute function public.journaliser();
create trigger cartes_journal   after insert on public.cartes   for each row execute function public.journaliser();

-- Le journal est append-only au même titre que les mises : la fonction
-- interdire_modification couvre aussi les accès par clé de service, que ni RLS
-- ni les privilèges ne filtrent.
create trigger audit_log_immuable
  before update or delete on public.audit_log
  for each row execute function public.interdire_modification();

-- Privilèges Data API. audit_log et admins n'en reçoivent aucun pour
-- authenticated : ils restent réservés aux Edge Functions.
grant select, insert, update on public.caisses_jour   to authenticated;

-- Seule la colonne `traite` est modifiable : marquer un rejet comme traité ne
-- doit jamais pouvoir réécrire la charge utile qu'on a justement conservée.
grant select, insert   on public.synchro_rejets to authenticated;
grant update (traite)  on public.synchro_rejets to authenticated;

grant all on public.caisses_jour, public.synchro_rejets, public.audit_log, public.admins
  to service_role;
