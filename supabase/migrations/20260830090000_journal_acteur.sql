-- Kolek — le journal dit enfin par qui, et plus seulement sur qui
--
-- Constaté le 2026-08-30, en dessinant l'écran « Journal de sécurité » du
-- Super Admin : la colonne « Auteur » de la maquette n'était pas alimentable.
--
-- ## Le défaut
--
-- `audit_log.collecteur_id` est le **sujet** de la ligne, jamais son auteur.
-- `journaliser()` y écrit `ligne ->> 'collecteur_id'` : le collecteur qui
-- possède le client, la carte ou la caisse touchée. `journaliser_admin()` y
-- écrit `user_id` — la trace d'une promotion nomme donc le promu, et rien du
-- promoteur.
--
-- Ce n'est pas une information manquante, c'est une information qui **se lit
-- pour ce qu'elle n'est pas**. Quand un administrateur supprime le client d'un
-- collecteur par la clé de service, la ligne du journal porte l'identifiant du
-- collecteur. Qui relit accuse celui qui n'a rien fait — et exactement dans le
-- cas où le journal est censé servir.
--
-- La migration du 2026-08-29 a rendu la suppression visible. Elle l'a rendue
-- visible sans coupable.
--
-- ## La règle
--
-- L'identité vient du jeton de l'appelant. `service_role` fait exception :
-- c'est le seul rôle qui agisse pour le compte de quelqu'un d'autre — une Edge
-- Function porte la clé de service et exécute la volonté d'un administrateur
-- authentifié plus haut. Lui seul peut donc déclarer un acteur, par l'en-tête
-- `x-kolek-acteur`.
--
-- L'en-tête envoyé par un collecteur authentifié est ignoré. Sans cette
-- restriction, la colonne d'imputation serait une case que remplit celui
-- qu'elle désigne, ce qui vaut moins qu'une colonne vide.
--
-- ## Ce que cette migration ne fait pas
--
-- Elle ne devine rien. Une écriture `service_role` sans en-tête laisse
-- `acteur_id` à `null`, et les écrans doivent afficher « non attribué ».
-- Retomber sur `collecteur_id` faute de mieux reproduirait le défaut qu'on
-- répare ici, en le rendant plus difficile à voir.

-- ---------------------------------------------------------------------------
-- La colonne
-- ---------------------------------------------------------------------------
--
-- Aucune clé étrangère vers `auth.users`, et c'est délibéré. En `cascade`, la
-- suppression d'un compte effacerait les traces de ce qu'il a fait — soit le
-- dernier geste de qui veut disparaître. En `set null`, elle les anonymiserait,
-- ce qui revient au même en plus discret. Une trace survit à son auteur.

alter table public.audit_log add column if not exists acteur_id uuid;

comment on column public.audit_log.acteur_id is
  'Qui a agi, par opposition à collecteur_id qui dit sur qui. Null quand la clé de service n''a rien déclaré : « non attribué » est une réponse, pas un défaut à combler par le sujet.';

-- L'écran de sécurité interroge « qu''a fait tel compte », jamais « qui a
-- touché telle ligne » en premier. L'index suit l'usage.
create index if not exists audit_log_acteur_idx
  on public.audit_log (acteur_id, survenu_le desc);

-- ---------------------------------------------------------------------------
-- Qui agit
-- ---------------------------------------------------------------------------
--
-- En plpgsql et non en SQL pur, pour une raison précise : `current_setting`
-- rend une chaîne, et deux conversions peuvent lever. Un en-tête qui n'est pas
-- un UUID, ou un appel hors PostgREST où `request.headers` n'existe pas,
-- feraient alors échouer l'écriture métier elle-même. Un journal qui casse ce
-- qu'il observe est pire qu'un journal muet : les deux cas rendent `null`.

create or replace function public.acteur_courant()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  entete text;
begin
  -- Hors `service_role`, l'identité vient du jeton et de rien d'autre. Le
  -- `role` reste celui posé par PostgREST : entrer dans une fonction SECURITY
  -- DEFINER change `current_user`, pas ce paramètre.
  if coalesce(current_setting('role', true), '') <> 'service_role' then
    return auth.uid();
  end if;

  begin
    entete := nullif(
      current_setting('request.headers', true)::json ->> 'x-kolek-acteur',
      ''
    );
  exception
    when others then
      -- Ni PostgREST ni en-têtes : psql, une migration, une tâche planifiée.
      return null;
  end;

  -- Validé avant conversion plutôt qu'en rattrapant l'exception : une valeur
  -- malformée ne doit pas pouvoir interrompre la transaction qui écrit.
  if entete ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    return entete::uuid;
  end if;

  return null;
end;
$$;

alter function public.acteur_courant() owner to postgres;

comment on function public.acteur_courant is
  'L''auteur de l''écriture en cours. auth.uid() pour un appelant authentifié ; l''en-tête x-kolek-acteur pour service_role, seul rôle agissant pour autrui ; null sinon.';

-- Elle n'est appelée que par les déclencheurs, qui s'exécutent sous le
-- propriétaire. Personne d'autre n'a de raison de la joindre.
revoke all on function public.acteur_courant() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Les quatre fonctions de journal imputent
-- ---------------------------------------------------------------------------
--
-- Redéclarées entières plutôt que corrigées par morceaux : leur corps est court
-- et la version du 2026-08-29 reste lisible dans son fichier. Seule la colonne
-- `acteur_id` change.

create or replace function public.journaliser()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ligne jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log (collecteur_id, acteur_id, table_cible, ligne_id, action, donnees)
  values (
    (ligne ->> 'collecteur_id')::uuid,
    public.acteur_courant(),
    tg_table_name,
    (ligne ->> 'id')::uuid,
    lower(tg_op),
    ligne
  );
  return null;
end;
$$;

comment on function public.journaliser is
  'Trace insert, update et delete sur les tables porteuses de collecteur_id. collecteur_id dit sur qui, acteur_id dit par qui.';

create or replace function public.journaliser_collecteur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ligne jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log (collecteur_id, acteur_id, table_cible, ligne_id, action, donnees)
  values (
    (ligne ->> 'id')::uuid,
    public.acteur_courant(),
    tg_table_name,
    (ligne ->> 'id')::uuid,
    lower(tg_op),
    ligne
  );
  return null;
end;
$$;

comment on function public.journaliser_collecteur is
  'Trace insert, update et delete sur public.collecteurs, dont l''identifiant est le collecteur lui-même. acteur_id distingue une modification faite par l''intéressé d''une modification faite sur lui.';

create or replace function public.journaliser_demande()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ligne jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log (collecteur_id, acteur_id, table_cible, ligne_id, action, donnees)
  values (
    null,
    public.acteur_courant(),
    tg_table_name,
    (ligne ->> 'id')::uuid,
    lower(tg_op),
    ligne
  );
  return null;
end;
$$;

comment on function public.journaliser_demande is
  'Trace insert, update et delete sur les demandes d''ouverture. Aucun collecteur associé — le déposant n''en est pas encore un — mais l''administrateur qui accorde ou refuse, lui, est nommé.';

create or replace function public.journaliser_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ligne jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log (collecteur_id, acteur_id, table_cible, ligne_id, action, donnees)
  values (
    (ligne ->> 'user_id')::uuid,
    public.acteur_courant(),
    tg_table_name,
    (ligne ->> 'user_id')::uuid,
    lower(tg_op),
    ligne
  );
  return null;
end;
$$;

comment on function public.journaliser_admin is
  'Trace l''octroi et le retrait des droits d''administrateur. ligne_id nomme le promu, acteur_id le promoteur : sans les deux, la trace ne dit pas qui a ouvert la porte.';

-- ---------------------------------------------------------------------------
-- Garde-fou
-- ---------------------------------------------------------------------------
--
-- `create or replace function` sur l'une de ces quatre, plus tard, à partir
-- d'une version copiée d'un ancien fichier, retirerait l'imputation sans qu'une
-- seule ligne d'erreur n'apparaisse — le journal continuerait d'écrire, avec
-- une colonne vide que personne ne regarde. Ce bloc fait échouer la migration
-- qui le ferait.

do $garde$
declare
  manquant text;
begin
  select string_agg(p.proname, ', ' order by p.proname)
    into manquant
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'journaliser', 'journaliser_collecteur', 'journaliser_demande', 'journaliser_admin'
     )
     and pg_get_functiondef(p.oid) not like '%acteur_courant%';

  if manquant is not null then
    raise exception 'GARDE_FOU : ces fonctions de journal n''imputent rien : %', manquant;
  end if;
end;
$garde$;
