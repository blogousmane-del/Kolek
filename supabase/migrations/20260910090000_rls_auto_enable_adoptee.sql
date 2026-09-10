-- Adoption de `rls_auto_enable()` et de son déclencheur `ensure_rls`.
--
-- ## Ce que ce fichier répare
--
-- Ces deux objets vivent en production depuis un geste fait à la main dans
-- l'éditeur SQL du tableau de bord — leur propriétaire est `postgres` et non
-- `supabase_admin`, ce qui le trahit. Aucune migration ne les créait.
--
-- Une base remontée depuis les seules migrations n'avait donc pas ce filet.
-- Et `scripts/verifier-derive.mjs` le disait à chaque passage :
--
--     48 fonctions security definer en production, 47 écrites dans les
--     migrations. Dérive : public.rls_auto_enable()
--
-- Le coût n'est pas théorique. La passe du 2026-09-09 qui a révoqué `EXECUTE`
-- pour `PUBLIC` sur les fonctions `security definer` a balayé celle-ci comme
-- les autres, sans que rien en local ne l'annonce.
--
-- ## Pourquoi l'adoption n'avait pas pu se faire le 2026-09-09
--
-- Le commentaire de `verifier-derive.mjs` le disait : « aucun dump produit par
-- le CLI ne rend les déclencheurs d'événement — c'est précisément pourquoi
-- `rls_auto_enable` n'a pas pu être adoptée. On ne recopie pas un câblage qu'on
-- ne peut pas lire. »
--
-- Ce qui a changé le 2026-09-10 n'est pas la base, c'est la lecture :
-- `supabase db query --linked` interroge `pg_event_trigger` directement, là où
-- `db dump` reste muet. Le câblage lu :
--
--     ensure_rls · ddl_command_end · CREATE TABLE, CREATE TABLE AS, SELECT INTO
--     actif · propriétaire postgres
--
-- Le propriétaire est ce qui rend l'adoption possible : un déclencheur
-- d'événement demande d'être superutilisateur ou propriétaire, et les
-- migrations tournent comme `postgres`.
--
-- ## Ce que cette migration fait en production
--
-- Rien. Les deux objets y sont déjà, le corps ci-dessous est recopié de
-- `pg_get_functiondef` sans une virgule de changement, et la création du
-- déclencheur est gardée par son existence. C'est une migration
-- **d'alignement** : elle sert aux bases qui n'ont pas ces objets — une machine
-- neuve, le CI, un `db reset` local.

-- Corps repris tel quel de la production. `pg_temp` en fin de `search_path`,
-- comme l'exige la règle du dépôt sur les fonctions `security definer` : sans
-- lui, un schéma temporaire posé par un appelant pourrait masquer une fonction
-- appelée ici.
--
-- `SECURITY DEFINER` est nécessaire : la fonction doit pouvoir activer RLS sur
-- une table dont elle n'est pas propriétaire.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog, pg_temp'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- `CREATE EVENT TRIGGER` n'accepte pas `IF NOT EXISTS`, d'où le bloc.
--
-- On ne détruit pas pour recréer : en production le déclencheur est en place et
-- actif, et le laisser tomber une fraction de seconde ouvrirait une fenêtre où
-- une table créée pendant ce temps naîtrait sans RLS. C'est peu probable et
-- c'est exactement le genre de fenêtre qu'on ne s'ouvre pas sur une base qui
-- porte l'épargne de gens.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    CREATE EVENT TRIGGER ensure_rls
      ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      EXECUTE FUNCTION public.rls_auto_enable();
  END IF;
END
$$;

-- Le filet ne remplace aucune déclaration explicite : chaque table de ce dépôt
-- porte son `alter table … enable row level security` dans la migration qui la
-- crée, et les quinze sont mesurées à chaque audit. Celui-ci attrape la table
-- qu'on ajouterait un jour en oubliant la ligne.
COMMENT ON FUNCTION public.rls_auto_enable() IS
  'Active RLS sur toute table créée dans public. Filet, pas substitut : chaque table déclare le sien dans sa propre migration. Adoptée depuis la production le 2026-09-10.';

-- Refermer le droit que PostgreSQL vient d'accorder tout seul.
--
-- Ce n'est pas une précaution : c'est une correction. La suite de base a fait
-- échouer cette migration le 2026-09-10 sur `supabase/tests/search-path.test.ts`,
-- à l'assertion « n'en laisse aucune atteignable sans session ». Sur une base
-- reconstruite, l'ACL lue était :
--
--     =X/postgres | postgres=X/postgres | service_role=X/postgres
--
-- Le premier terme est le droit `PUBLIC`. Il ne nomme personne — c'est
-- précisément ce qui le rend invisible à une vérification qui chercherait
-- « anon », et c'est le piège que ce test-là existe pour attraper.
--
-- La production, elle, n'est pas concernée dans les deux sens : son droit
-- `PUBLIC` a été révoqué par la passe du 2026-09-09, et `CREATE OR REPLACE` ne
-- réinitialise pas l'ACL d'une fonction existante. Mesuré le 2026-09-10 sur la
-- base locale — révoquer, rejouer le `CREATE OR REPLACE` ci-dessus, relire :
-- `=X/postgres` n'est pas revenu. Ce `revoke` y sera donc sans effet, et c'est
-- l'intention : la migration sert aux bases neuves.
--
-- Révoquer `EXECUTE` ne casse pas le déclencheur : PostgreSQL ne vérifie pas ce
-- privilège quand il déclenche lui-même une fonction. Le message d'échec du
-- test le dit déjà, et la suite le remesure à chaque passage.
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM public, anon;
