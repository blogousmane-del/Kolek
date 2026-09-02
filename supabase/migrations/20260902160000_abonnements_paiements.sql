-- Kolek — J5 : le registre des paiements d'abonnement
--
-- Réf. Docs/specs/2026-08-22-j5-abonnement-chariow-design.md §3 et §4.
--
-- La base sait porter un abonnement depuis J1 — `palier`, `abonnement_statut`,
-- `abonnement_echeance` vivent sur la ligne du collecteur. Ce qu'elle ne sait
-- pas faire, c'est garder la trace de ce qui l'a payé. Cette migration ajoute ce
-- registre, et la seule fonction autorisée à le transformer en abonnement.
--
-- Écart avec le plan, assumé : les deux fonctions `security definer` déclarent
-- `search_path = public, pg_temp` là où le plan écrivait `public` seul. Le plan
-- date du 2026-08-22 ; le durcissement `20260830131000` est postérieur, et
-- `search-path.test.ts` refuse désormais toute fonction `security definer` qui
-- ne nomme pas `pg_temp` en dernier. Omettre `pg_temp` ne le retire pas du
-- chemin : ça le place **en premier**, devant `pg_catalog`.

create table public.paiements_abonnement (
  id             uuid primary key default gen_random_uuid(),
  -- `restrict`, comme `mises` : on ne fait pas disparaître un encaissement en
  -- supprimant un compte. `admin-supprimer-collecteur` compte cette table avant
  -- de supprimer, pour nommer ce qui bloque plutôt que de laisser remonter une
  -- violation de clé étrangère que personne ne sait lire.
  collecteur_id  uuid not null references public.collecteurs(id) on delete restrict,
  palier         text not null check (palier in ('standard','pro','illimite')),
  statut         text not null default 'en_attente'
                   check (statut in ('en_attente','regle','echoue','abandonne')),
  -- Contrainte à une seule valeur aujourd'hui. Elle porte la clé d'unicité : le
  -- jour où un second encaisseur apparaît, deux ventes peuvent partager un
  -- identifiant sans collision, et cette ligne tombe seule.
  fournisseur    text not null default 'chariow' check (fournisseur = 'chariow'),
  vente_id       text not null check (length(vente_id) between 1 and 128),
  -- `numeric` et non `integer` comme partout ailleurs : ce montant vient de la
  -- boutique, pas de nous. Une boutique en euros rendrait `9.99`, qu'un entier
  -- tronquerait en `9` — un écart de montant fabriqué par le stockage, que le
  -- contrôle anti-fraude signalerait ensuite comme une anomalie.
  montant        numeric(12,2) not null check (montant >= 0),
  -- Jamais figée à 'XOF'. Piège n°2 de Docs/Chariow.md, et un incident réel.
  devise         text not null check (devise ~ '^[A-Z]{3}$'),
  -- La remise appliquée au moment de l'achat, en points de pourcentage. Elle
  -- est ici et non déduite de `collecteurs.remise_pct` parce qu'une remise
  -- expire : six mois plus tard, la fiche du collecteur ne dira plus ce qui a
  -- été accordé ce jour-là, et le contrôle de grille accuserait la boutique
  -- d'avoir débité un mauvais montant.
  remise_pct     smallint not null default 0 check (remise_pct between 0 and 100),
  echeance_avant date not null,
  echeance_apres date,
  regle_le       timestamptz,
  cree_le        timestamptz not null default now(),
  constraint paiements_vente_unique unique (fournisseur, vente_id),
  -- Un paiement réglé sans date ni échéance posée est une ligne à moitié
  -- écrite. On refuse l'état intermédiaire plutôt qu'un rapport le rencontre
  -- six mois plus tard.
  constraint paiements_regle_coherent
    check ((statut = 'regle') = (regle_le is not null and echeance_apres is not null))
);

comment on table public.paiements_abonnement is
  'Registre des règlements d''abonnement. Append-only : seul le passage d''un état non terminal à un état terminal est permis.';

create index paiements_collecteur_idx
  on public.paiements_abonnement(collecteur_id, cree_le desc);
create index paiements_en_attente_idx
  on public.paiements_abonnement(statut) where statut = 'en_attente';

-- ---------------------------------------------------------------------------
-- Row Level Security — lecture seule, sur ses propres lignes
-- ---------------------------------------------------------------------------
-- Aucune politique d'écriture : l'insertion devient inexprimable via l'API,
-- quel que soit l'appelant authentifié.
alter table public.paiements_abonnement enable row level security;

create policy paiements_select on public.paiements_abonnement
  for select using (collecteur_id = (select auth.uid()));

grant select on public.paiements_abonnement to authenticated;

-- ---------------------------------------------------------------------------
-- Immuabilité — le garde-fou qui vaut aussi pour la clé de service
-- ---------------------------------------------------------------------------
-- RLS et les GRANT ne filtrent pas `service_role`, qui est précisément le rôle
-- qui écrit ici. Les déclencheurs, si.
create or replace function public.paiements_immuables()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'PAIEMENT_IMMUABLE';
  end if;

  -- Deux états sont définitifs. `echoue` ne l'est pas, et c'est délibéré :
  -- Chariow rend « failed » à des règlements qui aboutissent ensuite, et la
  -- fenêtre de rattrapage de quatorze jours en dépend.
  if old.statut in ('regle', 'abandonne') then
    raise exception 'PAIEMENT_TERMINAL';
  end if;

  -- Ce qui identifie la vente ne bouge jamais. `montant` et `devise` restent
  -- modifiables : Chariow est la source de vérité du montant réellement débité,
  -- et la réconciliation le relit.
  if new.collecteur_id  <> old.collecteur_id
     or new.vente_id    <> old.vente_id
     or new.fournisseur <> old.fournisseur
     or new.palier      <> old.palier
     or new.cree_le     <> old.cree_le
     or new.echeance_avant <> old.echeance_avant then
    raise exception 'PAIEMENT_IDENTITE_FIGEE';
  end if;

  return new;
end;
$$;

create trigger paiements_immuables
  before update or delete on public.paiements_abonnement
  for each row execute function public.paiements_immuables();

-- `journaliser()` lit `new.collecteur_id`, que cette table porte : la fonction
-- existante convient, sans la variante `journaliser_collecteur()`. Elle lit `old`
-- sur un DELETE, donc la branche est juste même si elle est inatteignable.
--
-- Les trois événements, et non les deux qui peuvent survenir. `journal_couverture`
-- exige d'une table journalisée qu'elle couvre tout, ou qu'elle soit protégée en
-- modification par `interdire_modification`. Celle-ci ne relève d'aucun des deux
-- régimes : elle se modifie une fois, de `en_attente` vers un état terminal, et
-- ne se supprime jamais. Couvrir DELETE coûte une branche que
-- `paiements_immuables` rend inatteignable, et fait tenir l'invariant sans
-- l'affaiblir pour toutes les autres tables.
create trigger paiements_journal
  after insert or update or delete on public.paiements_abonnement
  for each row execute function public.journaliser();

-- ---------------------------------------------------------------------------
-- Le crédit — deux écritures qui doivent tenir ensemble
-- ---------------------------------------------------------------------------
-- PostgREST ne rend pas deux écritures atomiques ; c'est la leçon de
-- `collecteur-cloturer-carte`, qui a dû accepter un état partiel. Ici un état
-- partiel signifierait un collecteur qui a payé sans être servi.
create or replace function public.crediter_abonnement(
  p_paiement uuid,
  p_regle_le timestamptz,
  p_montant  numeric,
  p_devise   text
)
returns table (credite boolean, echeance date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_paiement public.paiements_abonnement%rowtype;
        v_echeance date;
begin
  -- Le verrou et le filtre en une instruction : le webhook et l'ouverture de
  -- l'application ne peuvent pas lire tous les deux un paiement en attente.
  -- `regle` et `abandonne` sont exclus, donc un second appel sur un paiement
  -- déjà crédité ne trouve rien — l'idempotence tient ici.
  select * into v_paiement
    from public.paiements_abonnement
   where id = p_paiement and statut in ('en_attente', 'echoue')
     for update;

  if not found then
    return query select false, null::date;
    return;
  end if;

  -- Payer en avance prolonge ; payer en retard repart d'aujourd'hui. Sans le
  -- `greatest`, un collecteur avec soixante jours de retard paierait et
  -- resterait expiré — il aurait acheté du passé.
  select greatest(c.abonnement_echeance, current_date) + 30
    into v_echeance
    from public.collecteurs c
   where c.id = v_paiement.collecteur_id
     for update;

  update public.collecteurs
     set palier              = v_paiement.palier,
         abonnement_statut   = 'actif',
         abonnement_echeance = v_echeance
   where id = v_paiement.collecteur_id;

  update public.paiements_abonnement
     set statut         = 'regle',
         regle_le       = p_regle_le,
         montant        = p_montant,
         devise         = p_devise,
         echeance_apres = v_echeance
   where id = p_paiement;

  return query select true, v_echeance;
end;
$$;

comment on function public.crediter_abonnement is
  'Transforme un paiement en abonnement, une seule fois. Réservée à la clé de service : la décision de créditer se prend dans l''Edge Function, après relecture du statut chez le fournisseur.';

-- `create or replace function` réattribue EXECUTE à PUBLIC sans rien dire.
-- Même paire que la migration de la vue globale, pour la même raison.
revoke all on function public.crediter_abonnement(uuid, timestamptz, numeric, text)
  from public, anon, authenticated;
grant execute on function public.crediter_abonnement(uuid, timestamptz, numeric, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Garde-fou 1 — les privilèges de la nouvelle table, au caractère près
-- ---------------------------------------------------------------------------
do $$
declare surplus text;
begin
  select string_agg(grantee || '.' || privilege_type, ', ' order by grantee || '.' || privilege_type)
    into surplus
    from information_schema.table_privileges
   where table_schema = 'public'
     and table_name = 'paiements_abonnement'
     and grantee in ('anon', 'authenticated')
     and not (grantee = 'authenticated' and privilege_type = 'SELECT');

  if surplus is not null then
    raise exception 'Privilèges non prévus sur paiements_abonnement : %', surplus;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Garde-fou 2 — aucune colonne écrivable
-- ---------------------------------------------------------------------------
do $$
declare surplus text;
begin
  select string_agg(distinct grantee || '.' || column_name || '.' || privilege_type, ', ')
    into surplus
    from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = 'paiements_abonnement'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

  if surplus is not null then
    raise exception 'Colonnes écrivables sur paiements_abonnement : %', surplus;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Garde-fou 3 — les déclencheurs et le privilège d'exécution
-- ---------------------------------------------------------------------------
-- Un déclencheur absent ne se voit pas : tout continue de fonctionner,
-- simplement sans trace ou sans verrou.
do $garde$
declare manquants text; ouverte boolean;
begin
  select string_agg(attendu, ', ')
    into manquants
    from (values ('paiements_immuables'), ('paiements_journal')) as t(attendu)
   where not exists (
     select 1 from pg_trigger where tgname = t.attendu and not tgisinternal
   );

  if manquants is not null then
    raise exception 'GARDE_FOU : déclencheurs absents : %', manquants;
  end if;

  select has_function_privilege('authenticated', 'public.crediter_abonnement(uuid, timestamptz, numeric, text)', 'EXECUTE')
    into ouverte;

  if ouverte then
    raise exception 'GARDE_FOU : crediter_abonnement est exécutable par authenticated';
  end if;
end
$garde$;
