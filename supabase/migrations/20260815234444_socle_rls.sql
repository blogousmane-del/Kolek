-- Kolek — socle : Row Level Security
-- Réf. Docs/specs/2026-08-15-j1-socle-design.md §5.1
-- L'absence de politique est un refus. Pas de politique UPDATE ni DELETE
-- sur mises et retraits : l'opération devient inexprimable via l'API.

alter table public.collecteurs    enable row level security;
alter table public.clients        enable row level security;
alter table public.cartes         enable row level security;
alter table public.mises          enable row level security;
alter table public.retraits       enable row level security;
alter table public.caisses_jour   enable row level security;
alter table public.synchro_rejets enable row level security;
alter table public.audit_log      enable row level security;
alter table public.admins         enable row level security;

-- collecteurs : chacun voit et met à jour son seul profil.
create policy collecteurs_select on public.collecteurs
  for select using (id = (select auth.uid()));
create policy collecteurs_update on public.collecteurs
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- clients
create policy clients_select on public.clients
  for select using (collecteur_id = (select auth.uid()));
create policy clients_insert on public.clients
  for insert with check (collecteur_id = (select auth.uid()));
create policy clients_update on public.clients
  for update using (collecteur_id = (select auth.uid()))
          with check (collecteur_id = (select auth.uid()));

-- cartes : pas d'UPDATE. Le compteur est écrit par trigger SECURITY DEFINER,
-- la clôture par Edge Function (J3).
create policy cartes_select on public.cartes
  for select using (collecteur_id = (select auth.uid()));
create policy cartes_insert on public.cartes
  for insert with check (collecteur_id = (select auth.uid()));

-- mises : lecture et insertion seulement. Append-only.
create policy mises_select on public.mises
  for select using (collecteur_id = (select auth.uid()));
create policy mises_insert on public.mises
  for insert with check (collecteur_id = (select auth.uid()));

-- retraits : lecture seule. L'écriture passe par Edge Function (J3).
create policy retraits_select on public.retraits
  for select using (collecteur_id = (select auth.uid()));

-- caisses_jour
create policy caisses_select on public.caisses_jour
  for select using (collecteur_id = (select auth.uid()));
create policy caisses_insert on public.caisses_jour
  for insert with check (collecteur_id = (select auth.uid()));
create policy caisses_update on public.caisses_jour
  for update using (collecteur_id = (select auth.uid()))
          with check (collecteur_id = (select auth.uid()));

-- synchro_rejets : le collecteur consulte et marque « traité ».
create policy rejets_select on public.synchro_rejets
  for select using (collecteur_id = (select auth.uid()));
create policy rejets_insert on public.synchro_rejets
  for insert with check (collecteur_id = (select auth.uid()));
create policy rejets_update on public.synchro_rejets
  for update using (collecteur_id = (select auth.uid()))
          with check (collecteur_id = (select auth.uid()));

-- audit_log et admins : aucune politique. Inaccessibles via l'API, quel que soit
-- l'appelant authentifié. Seules les Edge Functions à clé de service les lisent.
