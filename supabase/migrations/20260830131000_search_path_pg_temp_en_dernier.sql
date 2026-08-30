-- Kolek — `pg_temp` revient dans le search_path, et en dernier
--
-- ## Ce que je croyais, et ce que la mesure dit
--
-- La migration du 2026-08-28 (`avis_drainage_secret_plausible`) retire `pg_temp`
-- du `search_path` de `avis_declencher_drainage()`, avec ce commentaire :
--
--   « `pg_temp` quitte le `search_path` [...] il laisse un rôle capable de créer
--     des objets temporaires masquer une référence non qualifiée du corps.
--     Rien n'est exploitable aujourd'hui — tout est qualifié, et `pg_catalog`
--     passe d'office avant »
--
-- Le diagnostic était juste, le remède exactement à l'envers, et la dernière
-- proposition fausse. Mesuré le 2026-08-30 sur la base locale :
--
-- | Forme du `search_path` d'une fonction `security definer` | Ce qu'elle lit |
-- |---|---|
-- | `set search_path = essai` | la table **temporaire** de l'appelant |
-- | `set search_path = essai, pg_temp` | la vraie table |
--
-- Et sur le catalogue, qui est le cas de `journal_couverture()` :
-- `select count(*) from pg_class` rend 795 ; après que l'appelant ait créé une
-- table temporaire nommée `pg_class`, la même fonction rend **0**.
--
-- La raison est dans la documentation de PostgreSQL, et elle est contre-
-- intuitive : le schéma temporaire est **toujours** cherché. S'il n'est pas
-- nommé dans le `search_path`, il est cherché **en premier — avant même
-- `pg_catalog`**. Le nommer explicitement, c'est le déplacer là où on l'a mis :
-- en dernier. L'omettre ne le retire pas, ça le met devant.
--
-- (La recherche du schéma temporaire ne vaut que pour les relations et les types
-- — jamais pour les fonctions ni les opérateurs. C'est ce qui rend le défaut
-- discret : un `security definer` qui n'appelle que des fonctions ne voit rien.)
--
-- ## Pourquoi une passe générale et non deux corrections
--
-- 19 des 33 fonctions `security definer` de `public` portent la forme faible.
-- Elles viennent du socle du 15 août comme des ajouts d'hier, écrites par les
-- deux sessions qui travaillent sur ce dépôt. Ce n'est donc pas une étourderie
-- à corriger deux fois, c'est une habitude à retourner d'un coup.
--
-- La passe est écrite en compréhension, sans liste de noms — même raison que
-- pour `journal_couverture()` la veille : une liste ne couvre que ce qui existe
-- le jour où on l'écrit. `alter function ... set search_path` ne touche pas au
-- corps : aucune redéfinition, aucun risque de perdre une correction au passage.
--
-- Ajouter `pg_temp` en fin de liste est sûr dans tous les cas. Il ne peut rien
-- masquer depuis la dernière place, et une fonction qui a réellement besoin
-- d'une table temporaire la trouve toujours.
--
-- ## Ce qui n'était pas exploitable, et pourquoi on corrige quand même
--
-- Aucun chemin d'attaque connu aujourd'hui : les corps concernés qualifient
-- leurs références, et les rôles de l'API de données ne peuvent pas créer de
-- table temporaire dans la session qui appelle une fonction par PostgREST.
-- La correction porte sur la forme, avant la ligne non qualifiée que quelqu'un
-- écrira sans y penser dans un corps existant.

do $passe$
declare
  f record;
  chemin text;
begin
  for f in
    select p.oid,
           p.oid::regprocedure::text as signature,
           (select c from unnest(coalesce(p.proconfig, '{}')) c
             where c like 'search_path=%' limit 1) as reglage
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}')) c
          where c like 'search_path=%' and c like '%pg_temp%'
       )
  loop
    -- Une fonction sans `search_path` du tout hérite de celui de l'appelant :
    -- le défaut est alors bien pire, et `public` est le seul choix raisonnable
    -- ici puisque tout le schéma applicatif y vit.
    chemin := coalesce(
      nullif(replace(f.reglage, 'search_path=', ''), ''),
      'public'
    ) || ', pg_temp';

    -- `%L` : la valeur part en littéral, jamais en identifiant recollé.
    -- PostgreSQL découpe la liste lui-même.
    execute format('alter function %s set search_path to %L', f.signature, chemin);
    raise notice 'search_path corrigé : % -> %', f.signature, chemin;
  end loop;
end
$passe$;

-- ## Le contrôle rejouable
--
-- La passe ci-dessus ne vaut que pour les fonctions présentes aujourd'hui.
-- C'est le défaut que la session voisine a relevé dans mon garde-fou du 29 août
-- et il n'y a aucune raison de le refaire : la règle est donc rendue lisible à
-- tout moment, et c'est le test qui en fait un échec.
--
-- Elle rend **toutes** les fonctions `security definer`, pas seulement les
-- fautives. Une fonction qui ne rendrait que les fautives donnerait la même
-- réponse — une liste vide — dans le cas où tout va bien et dans le cas où elle
-- ne trouve plus rien du tout. Le second cas doit rester détectable.
create or replace function public.search_path_definer()
returns table (fonction text, reglage text, nomme_pg_temp boolean)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select
    p.oid::regprocedure::text as fonction,
    coalesce(
      (select c from pg_catalog.unnest(coalesce(p.proconfig, '{}')) c
        where c like 'search_path=%' limit 1),
      'AUCUN search_path'
    ) as reglage,
    exists (
      select 1 from pg_catalog.unnest(coalesce(p.proconfig, '{}')) c
       where c like 'search_path=%' and c like '%pg_temp%'
    ) as nomme_pg_temp
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
  order by 1
$$;

comment on function public.search_path_definer is
  'Rend toutes les fonctions security definer de public et si leur search_path nomme pg_temp. Non nommé, le schéma temporaire est cherché en premier — avant pg_catalog — et un appelant peut y masquer une relation. Toutes doivent le nommer.';

-- Elle-même écrite dans la forme qu'elle exige : `pg_catalog, pg_temp`, et
-- chaque relation du corps qualifiée. Un contrôle qui échouerait à son propre
-- test ne serait pas un contrôle.
--
-- `service_role` conserve l'exécution — c'est sous cette identité que le test
-- l'appelle. Les trois autres partent : la liste des fonctions privilégiées et
-- de leurs réglages est une carte, et elle n'a rien à faire dans un navigateur.
revoke all on function public.search_path_definer() from public;
revoke all on function public.search_path_definer() from anon;
revoke all on function public.search_path_definer() from authenticated;

-- La passe et le contrôle sont dans le même fichier : appliquer l'un sans
-- l'autre laisserait soit un contrôle qui échoue d'emblée, soit une correction
-- que rien ne maintient.
do $garde$
declare
  restant text;
begin
  select string_agg(fonction, ', ') into restant
    from public.search_path_definer() where not nomme_pg_temp;
  if restant is not null then
    raise exception 'GARDE_FOU : la passe a laissé des search_path sans pg_temp : %', restant;
  end if;
end
$garde$;
