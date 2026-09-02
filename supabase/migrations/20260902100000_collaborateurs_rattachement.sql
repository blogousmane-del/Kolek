-- Le rattachement d'un collaborateur à son titulaire.
--
-- Une seule colonne porte tout le modèle d'équipe. `null` vaut « titulaire, ou
-- collecteur seul » — les deux sont le même état, et c'est voulu : un collecteur
-- ordinaire est un titulaire sans collaborateur, et aucun code n'a donc à
-- distinguer les deux cas.
--
-- `on delete restrict` et non `cascade` : supprimer un titulaire qui a des
-- collaborateurs doit échouer bruyamment. Un `cascade` effacerait trois comptes
-- et leurs clients sur un clic dans l'administration.

alter table public.collecteurs
  add column titulaire_id uuid references public.collecteurs(id) on delete restrict;

comment on column public.collecteurs.titulaire_id is
  'Le titulaire dont ce collecteur est collaborateur. NULL = titulaire ou collecteur seul. '
  'Écrit uniquement sous clé de service, par collecteur-creer-collaborateur.';

-- Partiel : la très grande majorité des lignes portent `null`, et les indexer
-- ne servirait qu'à grossir l'index.
create index collecteurs_titulaire_idx
  on public.collecteurs (titulaire_id) where titulaire_id is not null;

-- ---------------------------------------------------------------------------
-- Le droit de lecture, et l'absence de droit d'écriture
-- ---------------------------------------------------------------------------
-- `collecteurs` est en GRANT de colonne, pas en GRANT de table : une colonne
-- neuve n'est donc lisible par personne tant qu'on ne l'accorde pas. Le
-- collaborateur doit lire son propre `titulaire_id` — quatre écrans en dépendent
-- pour dire à qui revient la commission — et la policy
-- `collecteurs_select (id = auth.uid())` limite déjà cette lecture à sa ligne.
grant select (titulaire_id) on public.collecteurs to authenticated;

-- Et surtout : `titulaire_id` n'est PAS ajouté au
-- `grant update (nom, telephone, zone)`. Un collecteur ne peut donc pas se
-- rattacher lui-même par PostgREST, ni détacher un collaborateur. Le
-- rattachement n'existe que par la clé de service.

-- ---------------------------------------------------------------------------
-- Les cinq refus
-- ---------------------------------------------------------------------------
-- Une sous-requête ne passe pas dans un `check` : c'est donc un déclencheur.
-- Il s'exécute sous clé de service comme sous n'importe quelle identité — c'est
-- la dernière barrière, celle qui tient même quand l'Edge Function s'est trompée.
create or replace function public.collecteurs_valider_rattachement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare titulaire public.collecteurs%rowtype;
        deja      integer;
begin
  if new.titulaire_id is null then
    return new;
  end if;

  -- 1. L'auto-rattachement.
  if new.titulaire_id = new.id then
    raise exception 'RATTACHEMENT_A_SOI';
  end if;

  select * into titulaire from public.collecteurs where id = new.titulaire_id;
  if not found then
    raise exception 'TITULAIRE_INTROUVABLE';
  end if;

  -- 2. La chaîne. Un collaborateur ne recrute pas : sans cette borne, la
  -- profondeur de l'arbre serait libre, et `equipe_vue()` ne rendrait qu'un
  -- étage sur deux.
  if titulaire.titulaire_id is not null then
    raise exception 'CHAINE_INTERDITE';
  end if;

  -- 3. Le titulaire d'un titulaire. Symétrique du précédent, et nécessaire :
  -- sans lui, deux rattachements dans le bon ordre fabriquent la chaîne que le
  -- test 2 refuse dans l'autre ordre.
  if exists (select 1 from public.collecteurs where titulaire_id = new.id) then
    raise exception 'DEJA_TITULAIRE';
  end if;

  -- 4. Le palier. C'est ici que le forfait Illimité devient une règle et non une
  -- mention sur une grille tarifaire.
  if titulaire.palier <> 'illimite' or titulaire.abonnement_statut <> 'actif' then
    raise exception 'TITULAIRE_SANS_DROIT';
  end if;

  -- 5. Le quatrième. La valeur 3 est celle de `COLLABORATEURS_MAX` dans
  -- packages/core/src/paliers.ts. La base ne lit pas le TypeScript : les deux se
  -- déplacent ensemble ou pas du tout.
  select count(*) into deja
    from public.collecteurs
   where titulaire_id = new.titulaire_id
     and id <> new.id;
  if deja >= 3 then
    raise exception 'EQUIPE_COMPLETE';
  end if;

  return new;
end;
$fn$;

revoke all on function public.collecteurs_valider_rattachement() from public, anon, authenticated;

drop trigger if exists collecteurs_valider_rattachement on public.collecteurs;
create trigger collecteurs_valider_rattachement
  before insert or update of titulaire_id on public.collecteurs
  for each row execute function public.collecteurs_valider_rattachement();

-- ------------------------------- Garde-fou --------------------------------

do $garde$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.collecteurs'::regclass
       and tgname  = 'collecteurs_valider_rattachement'
  ) then
    raise exception 'GARDE_FOU : le rattachement n''est validé par rien.';
  end if;

  if has_column_privilege('authenticated', 'public.collecteurs', 'titulaire_id', 'update') then
    raise exception 'GARDE_FOU : un collecteur peut écrire son propre titulaire_id.';
  end if;

  if not has_column_privilege('authenticated', 'public.collecteurs', 'titulaire_id', 'select') then
    raise exception 'GARDE_FOU : un collaborateur ne peut pas lire son titulaire.';
  end if;
end;
$garde$;
