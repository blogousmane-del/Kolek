-- La première application réelle d'un état d'abonnement.
--
-- `abonnement_statut` et `limiteClients` sont purement déclaratifs jusqu'ici :
-- un collecteur `expire` encaisse, inscrit et ouvre exactement comme un actif.
-- La suspension des collaborateurs exigeait de trancher, et une règle qui ne
-- vaudrait que pour les collaborateurs serait plus petite à écrire et impossible
-- à expliquer. Elle vaut donc pour tous.
--
-- `limiteClients` (20 / 50 / 150) reste hors périmètre : l'appliquer est un
-- autre chantier, avec sa propre question sur le sort du 51ᵉ client déjà
-- inscrit.

create or replace function public.abonnement_ouvre_droit(p_collecteur uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.collecteurs
     where id = p_collecteur
       and abonnement_statut = 'actif'
  );
$fn$;

comment on function public.abonnement_ouvre_droit(uuid) is
  'Vrai si cet abonnement autorise les gestes d''entrée : ajouter un client, ouvrir une carte. '
  'N''a jamais son mot à dire sur l''encaissement d''une carte déjà ouverte.';

-- `security definer` parce qu'elle est appelée depuis une policy sur `clients` et
-- `cartes`, où l'appelant lirait `collecteurs` à travers sa propre policy — un
-- chemin de plus, et une dépendance croisée entre deux policies. Elle ne rend
-- qu'un booléen sur l'identifiant qu'on lui donne : elle ne divulgue rien qu'un
-- appelant ne sache déjà de lui-même.
revoke all on function public.abonnement_ouvre_droit(uuid) from public, anon;
grant execute on function public.abonnement_ouvre_droit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Les deux policies resserrées
-- ---------------------------------------------------------------------------
-- Resserrer, jamais élargir. `collecteur_id = auth.uid()` reste mot pour mot ;
-- une condition s'y ajoute. Aucune lecture ne change de sens.
drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert with check (
    collecteur_id = (select auth.uid())
    and public.abonnement_ouvre_droit((select auth.uid()))
  );

drop policy if exists cartes_insert on public.cartes;
create policy cartes_insert on public.cartes
  for insert with check (
    collecteur_id = (select auth.uid())
    and public.abonnement_ouvre_droit((select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- La suspension descend
-- ---------------------------------------------------------------------------
-- Le rattachement, lui, reste : pour qu'un retour à Illimité réactive l'équipe
-- sans la recréer, et pour que l'administration voie ce qui s'est passé.
create or replace function public.collecteurs_repercuter_suspension()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.abonnement_statut = 'actif' and new.palier = 'illimite' then
    return null;
  end if;

  update public.collecteurs
     set abonnement_statut = 'suspendu'
   where titulaire_id = new.id
     and abonnement_statut = 'actif';

  return null;
end;
$fn$;

revoke all on function public.collecteurs_repercuter_suspension() from public, anon, authenticated;

-- La clause `when` n'est pas une optimisation : sans elle, le déclencheur
-- s'exécuterait à chaque changement de nom ou de zone. Elle borne aussi la
-- récursion — l'`update` ci-dessus réveille le déclencheur sur chaque
-- collaborateur, dont l'`update` à lui ne trouve personne (la chaîne est
-- interdite par `collecteurs_valider_rattachement`). Un étage, pas une boucle.
drop trigger if exists collecteurs_repercuter_suspension on public.collecteurs;
create trigger collecteurs_repercuter_suspension
  after update of abonnement_statut, palier on public.collecteurs
  for each row
  when (old.abonnement_statut is distinct from new.abonnement_statut
        or old.palier is distinct from new.palier)
  execute function public.collecteurs_repercuter_suspension();

-- ------------------------------- Garde-fou --------------------------------

do $garde$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'clients' and policyname = 'clients_insert'
       and with_check like '%abonnement_ouvre_droit%'
  ) then
    raise exception 'GARDE_FOU : clients_insert ne consulte pas l''abonnement.';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'cartes' and policyname = 'cartes_insert'
       and with_check like '%abonnement_ouvre_droit%'
  ) then
    raise exception 'GARDE_FOU : cartes_insert ne consulte pas l''abonnement.';
  end if;

  -- La borne ne doit PAS avoir gagné `mises_insert` : encaisser sur une carte
  -- ouverte reste permis à un abonnement suspendu. Une carte ouverte est une
  -- promesse à une cliente qui paie tous les jours, et la couper au milieu du
  -- cycle punit la cliente, pas le collecteur. C'est une décision, pas un oubli.
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'mises' and policyname = 'mises_insert'
       and with_check like '%abonnement_ouvre_droit%'
  ) then
    raise exception 'GARDE_FOU : la suspension coupe l''encaissement.';
  end if;
end;
$garde$;
