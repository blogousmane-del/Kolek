-- Kolek — le journal voit enfin les suppressions, et la table des privilèges
--
-- Deux trous trouvés le 2026-08-29, en confrontant le socle aux invariants
-- d'audit d'un starter éprouvé (`Docs/izikit-main`). Ils ont la même racine :
-- le journal regardait ce qui apparaît et ce qui change, jamais ce qui
-- disparaît, et jamais qui a le droit.
--
-- ## 1. La suppression ne laissait aucune trace
--
-- `journaliser()` lisait `new.collecteur_id`, `new.id`, `to_jsonb(new)`. Sur un
-- `DELETE`, `new` est nul. Le trigger ne pouvait donc pas couvrir la
-- suppression, et il ne la couvrait pas : les cinq triggers étaient déclarés
-- `after insert or update`.
--
-- La migration du 2026-08-21 pose pourtant l'argument : « le remède n'est pas
-- l'interdiction, c'est la trace ». L'opération qui détruit ce qu'on voulait
-- pouvoir relire était précisément la seule sans trace. Corriger le nom d'un
-- client se voyait ; supprimer le client, non — et le second efface le premier.
--
-- `mises`, `retraits` et `audit_log` ne sont pas concernés : `interdire_modification`
-- y bloque déjà `UPDATE` et `DELETE`. L'argent est immuable, le journal aussi.
-- Leur trigger `INSERT` seul est donc juste, et le reste.
--
-- ## 2. `admins` n'avait aucun journal du tout
--
-- Elle décide qui administre le produit. RLS active, zéro politique : seul
-- `service_role` peut y écrire. La fermeture est bonne — et c'est exactement la
-- clé publiée le 2026-08-24, restée valide quatre jours.
--
-- Pendant cette fenêtre, une ligne insérée ici accordait l'administration
-- entière, et **rien ne l'aurait enregistré**. `cree_le` date une création ;
-- elle ne dit rien d'un retrait, et elle ne survit pas à la ligne. Une table de
-- privilèges sans journal est le seul endroit où une intrusion devient
-- permanente sans laisser de quoi la constater.
--
-- ## Ce que cette migration ne fait pas
--
-- Elle ne bloque rien. Supprimer un client reste possible — un collecteur doit
-- pouvoir défaire une saisie erronée, et interdire pousserait à contourner.
-- Elle rend la suppression **visible**, ce qui est le contrat du journal depuis
-- l'origine.

-- ---------------------------------------------------------------------------
-- Les trois fonctions lisent maintenant la bonne ligne
-- ---------------------------------------------------------------------------
--
-- `old` sur une suppression, `new` sinon. Passer par `jsonb` plutôt que par
-- deux branches dupliquées : la ligne est de toute façon convertie pour la
-- colonne `donnees`, et en tirer aussi les identifiants garde une seule source.
-- Les colonnes absentes rendent `null` au lieu de lever, ce qui évite d'écrire
-- une fonction par forme de table.

create or replace function public.journaliser()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ligne jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log (collecteur_id, table_cible, ligne_id, action, donnees)
  values (
    (ligne ->> 'collecteur_id')::uuid,
    tg_table_name,
    (ligne ->> 'id')::uuid,
    lower(tg_op),
    ligne
  );
  return null;
end;
$$;

comment on function public.journaliser is
  'Trace insert, update et delete sur les tables porteuses de collecteur_id. Lit `old` sur une suppression : sans cela, la ligne effacée ne laisserait rien.';

-- `public.collecteurs` n'a pas de colonne `collecteur_id` : son identifiant
-- **est** le collecteur. C'est la raison d'être de cette seconde fonction,
-- posée le 2026-08-21.
create or replace function public.journaliser_collecteur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ligne jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log (collecteur_id, table_cible, ligne_id, action, donnees)
  values (
    (ligne ->> 'id')::uuid,
    tg_table_name,
    (ligne ->> 'id')::uuid,
    lower(tg_op),
    ligne
  );
  return null;
end;
$$;

comment on function public.journaliser_collecteur is
  'Trace insert, update et delete sur public.collecteurs, dont l''identifiant est le collecteur lui-même.';

-- Une demande d'ouverture est déposée par un inconnu : aucun collecteur ne lui
-- correspond, d'où le `null`.
create or replace function public.journaliser_demande()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ligne jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log (collecteur_id, table_cible, ligne_id, action, donnees)
  values (null, tg_table_name, (ligne ->> 'id')::uuid, lower(tg_op), ligne);
  return null;
end;
$$;

comment on function public.journaliser_demande is
  'Trace insert, update et delete sur les demandes d''ouverture. Aucun collecteur associé : le déposant n''en est pas encore un.';

-- ---------------------------------------------------------------------------
-- La table des privilèges
-- ---------------------------------------------------------------------------
--
-- `admins` n'a ni `id` ni `collecteur_id` : sa clé primaire est `user_id`, et
-- c'est à la fois le sujet de la ligne et le compte concerné. D'où une
-- quatrième fonction, pour la même raison qui en imposait une seconde à
-- `collecteurs` — réutiliser les autres écrirait `null` dans `ligne_id` et le
-- journal ne saurait plus de qui il parle.

create or replace function public.journaliser_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ligne jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
begin
  insert into public.audit_log (collecteur_id, table_cible, ligne_id, action, donnees)
  values (
    (ligne ->> 'user_id')::uuid,
    tg_table_name,
    (ligne ->> 'user_id')::uuid,
    lower(tg_op),
    ligne
  );
  return null;
end;
$$;

comment on function public.journaliser_admin is
  'Trace l''octroi et le retrait des droits d''administrateur. Le retrait compte autant que l''octroi : c''est le dernier geste de qui veut ne pas figurer dans la liste.';

-- ---------------------------------------------------------------------------
-- Les triggers
-- ---------------------------------------------------------------------------
--
-- `drop` puis `create` : `create or replace trigger` existe depuis PG 14, mais
-- il ne change pas la liste des événements couverts. Sans le `drop`, ces
-- triggers resteraient en `insert or update` et la migration paraîtrait passée.

drop trigger if exists clients_journal on public.clients;
create trigger clients_journal
  after insert or update or delete on public.clients
  for each row execute function public.journaliser();

drop trigger if exists cartes_journal on public.cartes;
create trigger cartes_journal
  after insert or update or delete on public.cartes
  for each row execute function public.journaliser();

drop trigger if exists caisses_journal on public.caisses_jour;
create trigger caisses_journal
  after insert or update or delete on public.caisses_jour
  for each row execute function public.journaliser();

drop trigger if exists collecteurs_journal on public.collecteurs;
create trigger collecteurs_journal
  after insert or update or delete on public.collecteurs
  for each row execute function public.journaliser_collecteur();

drop trigger if exists demandes_journal on public.demandes_ouverture;
create trigger demandes_journal
  after insert or update or delete on public.demandes_ouverture
  for each row execute function public.journaliser_demande();

drop trigger if exists admins_journal on public.admins;
create trigger admins_journal
  after insert or update or delete on public.admins
  for each row execute function public.journaliser_admin();

-- ---------------------------------------------------------------------------
-- Garde-fou
-- ---------------------------------------------------------------------------
--
-- Le journal est de ceux qui échouent en silence : rien ne casse quand il ne
-- voit plus, et personne ne le remarque avant d'avoir besoin de lire. Un
-- `create or replace trigger` posé plus tard sans les trois événements
-- rouvrirait le trou sans un mot. Ce bloc le fait échouer à la migration.

do $garde$
declare
  manquant text;
begin
  select string_agg(attendu.table_cible || '.' || attendu.trigger, ', ')
    into manquant
    from (values
      ('clients', 'clients_journal'),
      ('cartes', 'cartes_journal'),
      ('caisses_jour', 'caisses_journal'),
      ('collecteurs', 'collecteurs_journal'),
      ('demandes_ouverture', 'demandes_journal'),
      ('admins', 'admins_journal')
    ) as attendu(table_cible, trigger)
   where not exists (
     select 1
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal
        and c.relnamespace = 'public'::regnamespace
        and c.relname = attendu.table_cible
        and t.tgname = attendu.trigger
        -- 28 = INSERT | UPDATE | DELETE. Le compte doit être exact : couvrir
        -- deux événements sur trois est le défaut qu'on répare ici.
        and (t.tgtype & 28) = 28
   );

  if manquant is not null then
    raise exception 'GARDE_FOU : journal incomplet sur %', manquant;
  end if;
end;
$garde$;
