-- Kolek — le contrôle du journal devient rejouable
--
-- ## Ce qui ne va pas dans le garde-fou du 2026-08-29
--
-- `20260829100000_journal_suppressions_et_admins.sql` finit par un bloc `do`
-- qui échoue si l'un des six triggers de journal ne couvre pas `INSERT`,
-- `UPDATE` et `DELETE`. Il a fait son travail ce jour-là. Il ne le fera plus
-- jamais : **une migration appliquée ne rejoue pas.** La liste des six tables y
-- est figée, et toute table journalisée ajoutée après lui échappe au contrôle.
--
-- Défaut signalé par la session qui travaillait en parallèle, qui ajoutait
-- justement une septième table. Un garde-fou qui ne garde qu'une fois est un
-- commentaire.
--
-- ## Pourquoi une fonction, et pas une liste plus longue
--
-- Allonger la liste rejouerait le même défaut au prochain ajout. La règle est
-- donc énoncée en compréhension, sans nommer aucune table :
--
--   **Toute table portant un trigger de journal doit soit le couvrir sur les
--   trois événements, soit être protégée en modification.**
--
-- Les deux branches correspondent aux deux régimes du socle. `clients`,
-- `cartes`, `collecteurs`, `caisses_jour`, `demandes_ouverture` se modifient
-- légitimement : elles doivent tout tracer, suppression comprise. `mises`,
-- `retraits` et `audit_log` sont immuables — `interdire_modification` y refuse
-- `UPDATE` et `DELETE` — donc n'avoir qu'un trigger `INSERT` y est juste, et non
-- un oubli.
--
-- Une table journalisée qui ne relèverait d'aucun des deux régimes est un
-- oubli, quel que soit son nom et quelle que soit la date de son ajout.
--
-- ## Elle ne bloque rien par elle-même
--
-- Elle ne fait que rendre l'état lisible. C'est
-- `supabase/tests/journal-couverture.test.ts` qui en fait un échec, et le test
-- tourne à chaque exécution du CI contre une base fraîchement migrée. Le
-- contrôle suit donc le schéma au lieu de dater d'un jour.

create or replace function public.journal_couverture()
returns table (
  table_cible text,
  journal_trois_evenements boolean,
  protege_en_modification boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.relname::text as table_cible,

    -- 28 = INSERT | UPDATE | DELETE dans `tgtype`. Le compte doit être exact :
    -- couvrir deux événements sur trois est le défaut d'origine.
    exists (
      select 1
        from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
       where t.tgrelid = c.oid
         and not t.tgisinternal
         and p.proname like 'journalis%'
         and (t.tgtype & 28) = 28
    ) as journal_trois_evenements,

    -- 24 = UPDATE | DELETE. Une table dont la modification est refusée n'a rien
    -- à tracer au-delà de l'insertion.
    exists (
      select 1
        from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
       where t.tgrelid = c.oid
         and not t.tgisinternal
         and p.proname = 'interdire_modification'
         and (t.tgtype & 24) = 24
    ) as protege_en_modification

  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relkind = 'r'
    and exists (
      select 1
        from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
       where t.tgrelid = c.oid
         and not t.tgisinternal
         and p.proname like 'journalis%'
    )
  order by 1
$$;

comment on function public.journal_couverture is
  'Rend, pour chaque table journalisée, si son trigger couvre les trois événements et si sa modification est refusée. Une table qui ne satisfait ni l''un ni l''autre est un oubli. Rejouable, contrairement au bloc do de la migration du 2026-08-29.';

-- `security definer` pour lire `pg_trigger` sans dépendre des droits de
-- l'appelant, donc les révocations ne sont pas optionnelles. Elle ne rend que
-- des métadonnées de schéma, mais la liste des tables tracées renseigne sur ce
-- qui l'est **et sur ce qui ne l'est pas** — c'est une carte, et elle n'a rien
-- à faire dans un navigateur.
--
-- `service_role` conserve l'exécution : c'est sous cette identité que le test
-- l'appelle. La leçon de la migration précédente est retenue — Supabase accorde
-- d'office aux trois rôles de l'API de données, en révoquer deux sur trois
-- laisse la porte entrouverte.
revoke all on function public.journal_couverture() from public;
revoke all on function public.journal_couverture() from anon;
revoke all on function public.journal_couverture() from authenticated;
