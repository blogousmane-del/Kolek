-- Le compteur d'appels des fonctions publiques.
--
-- ## Pourquoi une table et non Redis
--
-- La question s'est posée le 2026-08-26. Netlify sert des fichiers statiques et
-- les Edge Functions sont des processus Deno sans état : un Redis serait un
-- fournisseur externe de plus, avec son adresse, son jeton et sa panne
-- possible entre le collecteur et son argent. Or la base est déjà là, déjà sous
-- RLS, déjà auditée — et le volume attendu tient dans quelques centaines de
-- lignes. Le jour où un verrou distribué ou une file de travaux apparaîtra, la
-- porte reste ouverte ; ce besoin-ci ne la justifie pas.
--
-- ## Ce que cette table borne, et ce qu'elle ne borne pas
--
-- Elle borne le nombre d'appels **acceptés** par IP et par route. Elle
-- n'empêche pas un réseau d'adresses de contourner la borne — c'est le travail
-- d'un CAPTCHA, resté ouvert dans l'audit du 2026-08-25. Elle empêche le cas
-- réel et bon marché : un script sur une machine qui noie l'écran
-- d'administration en faisant varier le numéro.

create table if not exists public.debit_public (
  empreinte text primary key,
  fenetre timestamptz not null default now(),
  compte integer not null default 0,

  -- La borne tient même si `debit.ts` change ou si quelqu'un écrit par un autre
  -- chemin. `EMPREINTE_MAX` tronque à la même valeur.
  constraint debit_empreinte_borne check (length(empreinte) between 1 and 200)
);

-- Pour la purge ci-dessous, qui balaie par date.
create index if not exists debit_public_fenetre on public.debit_public (fenetre);

alter table public.debit_public enable row level security;

-- Aucun droit pour les rôles du navigateur. La table n'est touchée que par
-- `consommer_debit`, elle-même réservée à la clé de service : un compteur que
-- l'appelant peut remettre à zéro ne compte rien.
revoke all on public.debit_public from public;
revoke all on public.debit_public from anon;
revoke all on public.debit_public from authenticated;
grant all on public.debit_public to service_role;

/**
 * Consomme un appel, et dit s'il est dans le plafond.
 *
 * Tout tient dans **une seule instruction** — `insert ... on conflict do
 * update ... returning`. Lire puis écrire en deux temps laisserait deux appels
 * simultanés lire la même valeur et l'incrémenter chacun de leur côté : la
 * borne laisserait passer le double sous la charge, c'est-à-dire exactement
 * quand elle sert.
 *
 * La fenêtre est glissante par bloc : le premier appel la pose, les suivants
 * s'y ajoutent, et le premier appel arrivé après son expiration la repose à
 * neuf.
 */
create or replace function public.consommer_debit(
  cle text,
  plafond integer,
  fenetre_secondes integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  n integer;
begin
  -- La purge vit ici plutôt que dans une tâche planifiée : la table n'a pas
  -- d'autre écrivain, et une tâche de plus à surveiller pour quelques centaines
  -- de lignes coûterait plus qu'elle ne rapporte. L'index sur `fenetre` la rend
  -- négligeable.
  delete from public.debit_public
   where fenetre < now() - interval '1 day';

  insert into public.debit_public (empreinte, fenetre, compte)
  values (cle, now(), 1)
  on conflict (empreinte) do update
     set compte = case
           when debit_public.fenetre < now() - make_interval(secs => fenetre_secondes) then 1
           else debit_public.compte + 1
         end,
         fenetre = case
           when debit_public.fenetre < now() - make_interval(secs => fenetre_secondes) then now()
           else debit_public.fenetre
         end
  returning compte into n;

  return n <= plafond;
end;
$fn$;

revoke all on function public.consommer_debit(text, integer, integer) from public;
revoke all on function public.consommer_debit(text, integer, integer) from anon;
revoke all on function public.consommer_debit(text, integer, integer) from authenticated;
grant execute on function public.consommer_debit(text, integer, integer) to service_role;

comment on function public.consommer_debit is
  'Compte les appels d''une empreinte dans une fenêtre glissante. Rend faux au-delà du plafond. Réservée à service_role : le compteur est tenu par les Edge Functions publiques.';

-- Garde-fou, même dispositif que `20260823090000` : un `revoke` oublié sur une
-- fonction `security definer` est exactement le genre de défaut qui ne se voit
-- pas.
do $garde$
begin
  if has_table_privilege('anon', 'public.debit_public', 'select')
     or has_table_privilege('anon', 'public.debit_public', 'update')
     or has_table_privilege('authenticated', 'public.debit_public', 'select') then
    raise exception 'GARDE_FOU : debit_public reste accessible depuis un navigateur.';
  end if;

  if has_function_privilege('anon', 'public.consommer_debit(text, integer, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.consommer_debit(text, integer, integer)', 'execute') then
    raise exception 'GARDE_FOU : consommer_debit reste exécutable sans clé de service.';
  end if;
end;
$garde$;
