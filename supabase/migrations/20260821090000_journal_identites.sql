-- Kolek — journaliser les identités, pas seulement l'argent
--
-- Constat des audits du 2026-08-20, reconduit deux fois : `mises`, `cartes`,
-- `retraits` et `caisses_jour` laissent une trace, `clients` et `collecteurs`
-- n'en laissent aucune.
--
-- Ce qui manque n'est pas décoratif. Le nom d'un client est ce qui rattache une
-- carte à une personne réelle ; le téléphone d'un collecteur est ce qui
-- l'identifie dans toute l'administration. Les deux se modifient légitimement —
-- une faute de frappe se corrige — et se modifient aussi illégitimement. Sans
-- journal, on ne peut pas distinguer les deux après coup, et le rapprochement
-- d'une carte avec son propriétaire devient une question d'affirmation.
--
-- Ce que cette migration **ne fait pas** : verrouiller ces tables. Un collecteur
-- doit pouvoir corriger le nom d'un client. Le remède n'est pas l'interdiction,
-- c'est la trace.

-- ---------------------------------------------------------------------------
-- Une seconde fonction, parce que la clé n'est pas au même endroit
-- ---------------------------------------------------------------------------
--
-- `journaliser()` lit `new.collecteur_id`. `public.collecteurs` n'a pas cette
-- colonne : son propre identifiant **est** le collecteur. Réutiliser la fonction
-- lèverait une erreur de champ inexistant à chaque écriture sur la table — donc
-- rendrait impossible la création d'un compte.

create or replace function public.journaliser_collecteur()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (collecteur_id, table_cible, ligne_id, action, donnees)
  values (new.id, tg_table_name, new.id, lower(tg_op), to_jsonb(new));
  return null;
end;
$$;

comment on function public.journaliser_collecteur is
  'Variante de journaliser() pour les tables dont la clé primaire est elle-même le collecteur. Introduite le 2026-08-21.';

-- ---------------------------------------------------------------------------
-- Les déclencheurs
-- ---------------------------------------------------------------------------
--
-- `insert or update`, et non `insert` seul comme sur `mises`. La nuance tient à
-- la nature des tables : une mise est immuable, donc son insertion dit tout.
-- Une identité se corrige, et c'est justement la correction qu'on veut voir.
--
-- Pas de `delete` : ni `clients` ni `collecteurs` ne portent de politique de
-- suppression pour `authenticated`, et les suppressions par la clé de service
-- passent par `admin-supprimer-collecteur`, qui refuse tout compte ayant manié
-- de l'argent. Un `after delete` journaliserait des lignes que la cascade
-- emporte de toute façon — et il échouerait sur la suppression d'un collecteur,
-- puisque le journal référence `collecteur_id`.

drop trigger if exists clients_journal on public.clients;
create trigger clients_journal
  after insert or update on public.clients
  for each row execute function public.journaliser();

drop trigger if exists collecteurs_journal on public.collecteurs;
create trigger collecteurs_journal
  after insert or update on public.collecteurs
  for each row execute function public.journaliser_collecteur();

-- `cartes` ne journalisait que l'ouverture. La clôture — le moment où l'argent
-- sort — n'y figurait pas, alors que c'est l'événement le plus sensible du
-- cycle de vie d'une carte. Le retrait est bien journalisé de son côté, mais
-- rien ne disait que la carte avait changé d'état.
drop trigger if exists cartes_journal on public.cartes;
create trigger cartes_journal
  after insert or update on public.cartes
  for each row execute function public.journaliser();

-- ---------------------------------------------------------------------------
-- Garde-fou
-- ---------------------------------------------------------------------------
--
-- Même motif que la migration de la vue globale : une vérification qui casse le
-- déploiement plutôt que de laisser passer une migration à moitié appliquée. Un
-- déclencheur absent ne se voit pas — tout continue de fonctionner, simplement
-- sans trace, et on ne s'en aperçoit que le jour où on cherche la trace.

do $garde$
declare manquants text;
begin
  select string_agg(attendu, ', ')
    into manquants
    from (values ('clients_journal'), ('collecteurs_journal'), ('cartes_journal')) as t(attendu)
   where not exists (
     select 1 from pg_trigger where tgname = t.attendu and not tgisinternal
   );

  if manquants is not null then
    raise exception 'GARDE_FOU : déclencheurs de journal absents : %', manquants;
  end if;
end
$garde$;
