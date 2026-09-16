-- Le registre des mouvements : une seule surface de lecture de l'argent.
--
-- Spec : Docs/specs/2026-09-15-mouvements-registre-design.md §2.
-- Décision d'architecture d'origine : 2026-08-16-j2-cadrage-mouvements.md §2.
--
-- ## Le défaut que cette vue empêche
--
-- Une mise encaissée que le serveur refuse ne disparaît pas du monde réel :
-- l'argent a changé de main. Le chantier suivant l'enregistrera comme une dette
-- — un « rattrapage ». À partir de là, la somme encaissée ne se lit plus dans
-- la seule table `mises`, et tout écran qui l'y lit sous-compte exactement
-- l'argent que ce mécanisme sert à ne pas perdre : le client passe pour avoir
-- versé une fois de moins, et le collecteur pour garder un excédent.
--
-- Le Mobile Money et les bonus de fidélisation poseront la même question. Ils
-- ajouteront une branche ici, et aucun lecteur ne bougera.
--
-- ## Ce que cette migration fait, et ne fait pas
--
-- Elle **ajoute** : une table vide, une vue, leurs droits. Elle ne touche
-- aucune ligne, ne change aucune fonction, et ne modifie rien de ce que les
-- écrans affichent aujourd'hui. Les lecteurs passent à la vue dans les
-- migrations suivantes.

-- ---------------------------------------------------------------------------
-- 1. La table des rattrapages, créée vide
-- ---------------------------------------------------------------------------
-- Aucun droit d'écriture pour `authenticated` : le geste du collecteur, ses
-- bornes et son avis au client appartiennent au chantier suivant. Ici, seule la
-- clé de service écrit — c'est-à-dire les épreuves, dont le jeu piégé qui rend
-- rouge tout calcul resté sur `mises` seule.
create table public.rattrapages (
  id            uuid primary key default gen_random_uuid(),
  -- Le propriétaire de la carte, comme `mises.collecteur_id`.
  collecteur_id uuid not null references public.collecteurs(id) on delete restrict,
  -- La main qui a pris l'argent, comme `mises.encaisse_par` : c'est elle qui
  -- range la mise dans une sacoche, donc dans une caisse du jour.
  main_id       uuid not null references public.collecteurs(id) on delete restrict,
  carte_id      uuid not null references public.cartes(id) on delete restrict,
  -- Un rattrapage ne peut naître que d'un refus réellement consigné, et un
  -- refus n'en produit jamais deux : c'est toute la protection contre le double
  -- comptage, et elle est dans le schéma.
  rejet_id      uuid not null unique references public.synchro_rejets(id) on delete restrict,
  montant       integer not null check (montant > 0),
  -- L'heure de la mise refusée, jamais celle de la saisie : la mise a eu lieu
  -- lundi, le rattrapage est saisi mercredi, et c'est le lundi qu'il répare.
  encaisse_le   timestamptz not null,
  cree_le       timestamptz not null default now()
);

comment on table public.rattrapages is
  'Une mise encaissée que le serveur a refusée, enregistrée comme dette envers le client (spec J1 §4.5). Append-only. Aucune écriture par authenticated avant le chantier du rattrapage.';

create index rattrapages_collecteur_date_idx
  on public.rattrapages (collecteur_id, encaisse_le desc);

-- Append-only, clé de service comprise — RLS ne filtre pas la clé de service,
-- le déclencheur si.
create trigger rattrapages_immuables
  before update or delete on public.rattrapages
  for each row execute function public.interdire_modification();

-- L'argent se journalise. `journal_couverture()` accepte un journal à
-- l'insertion seule pour une table protégée en modification : c'est le régime
-- de `mises` et de `retraits`.
create trigger rattrapages_journal
  after insert on public.rattrapages
  for each row execute function public.journaliser();

alter table public.rattrapages enable row level security;

revoke all on public.rattrapages from public, anon, authenticated;
grant select on public.rattrapages to authenticated;
grant all    on public.rattrapages to service_role;

create policy rattrapages_select on public.rattrapages
  for select using (collecteur_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. La vue
-- ---------------------------------------------------------------------------
-- `security_invoker = true` n'est pas décoratif : sans lui, la vue s'exécute
-- avec les droits de son propriétaire et contourne les politiques RLS des
-- tables sous-jacentes — elle exposerait à chaque collecteur l'argent de tous
-- les autres, et annulerait à elle seule l'isolation du socle.
--
-- Trois règles de lecture :
--   1. le montant est toujours positif, `sens` dit la direction ; l'argent tenu
--      est `sum(sens * montant)`, les encaissements `sens = 1` ;
--   2. la commission reste une mise, et une sortie vaut le montant restitué,
--      jamais restitué + commission — la commission reste chez le collecteur et
--      elle est déjà comptée du côté des entrées ;
--   3. le client se lit par la carte, pour les trois natures : une seule
--      vérité, que la table des rattrapages ne peut pas contredire.
create view public.mouvements with (security_invoker = true) as
select m.id,
       'mise'::text     as nature,
       1                as sens,
       m.montant,
       m.collecteur_id,
       m.encaisse_par   as main_id,
       m.carte_id,
       ca.client_id,
       m.encaisse_le    as survenu_le,
       m.est_commission
  from public.mises m
  join public.cartes ca on ca.id = m.carte_id
union all
select r.id,
       'retrait',
       -1,
       r.montant_restitue,
       r.collecteur_id,
       r.restitue_par,
       r.carte_id,
       ca.client_id,
       r.effectue_le,
       false
  from public.retraits r
  join public.cartes ca on ca.id = r.carte_id
union all
select t.id,
       'rattrapage',
       1,
       t.montant,
       t.collecteur_id,
       t.main_id,
       t.carte_id,
       ca.client_id,
       t.encaisse_le,
       false
  from public.rattrapages t
  join public.cartes ca on ca.id = t.carte_id;

comment on view public.mouvements is
  'La seule surface de lecture de l''argent : mises et rattrapages en entrée, retraits en sortie. Montant positif, sens signé, main qui a tenu l''argent. security_invoker : chacun n''y voit que ce que les politiques RLS lui rendent.';

revoke all  on public.mouvements from public, anon, authenticated;
grant select on public.mouvements to authenticated;
grant select on public.mouvements to service_role;

-- ---------------------------------------------------------------- Garde-fou
do $garde$
begin
  if not exists (
    select 1 from pg_class c
     where c.oid = 'public.mouvements'::regclass
       and 'security_invoker=true' = any (coalesce(c.reloptions, '{}'))
  ) then
    raise exception 'GARDE_FOU : la vue mouvements contourne la RLS (security_invoker absent).';
  end if;

  if has_table_privilege('anon', 'public.mouvements', 'select')
     or has_table_privilege('anon', 'public.rattrapages', 'select') then
    raise exception 'GARDE_FOU : anon lit le registre.';
  end if;

  if has_table_privilege('authenticated', 'public.rattrapages', 'insert')
     or has_table_privilege('authenticated', 'public.rattrapages', 'update')
     or has_table_privilege('authenticated', 'public.rattrapages', 'delete') then
    raise exception 'GARDE_FOU : un collecteur peut écrire un rattrapage.';
  end if;
end
$garde$;
