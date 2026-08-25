-- Le cash attendu soustrait enfin les restitutions — et un verrou d'hygiène.
--
-- **Horodatage à 11 h et non 9 h.** `20260825090000_cartes_multiples.sql`
-- existait déjà sous ce préfixe. Supabase enregistre la version par le nombre
-- qui ouvre le nom de fichier : deux fichiers partageant ce nombre ne laissent
-- qu'une ligne dans la table des migrations, et l'un des deux ne part jamais en
-- distant. C'est le défaut du 2026-08-23, retrouvé à l'identique.
--
-- ## 1. Le défaut qui accuse le collecteur à tort
--
-- `cash_attendu_du_jour` additionnait les mises du jour et rien d'autre. Le
-- report était **délibéré et documenté** en J1 : `retraits` n'était pas encore
-- écrite, et ajouter une soustraction qu'aucun test ne pouvait exercer revenait
-- à écrire du code mort qu'on croirait vérifié. Le raisonnement était bon.
--
-- Il a expiré. `retraits` porte des lignes en production et son déclencheur
-- d'immuabilité. La condition du report n'est plus remplie.
--
-- Ce que le défaut produit, concrètement : un collecteur clôture une carte le
-- matin — il sort 22 500 FCFA de sa sacoche et les rend à sa cliente — puis
-- compte son argent le soir. L'application lui annonce un attendu qui contient
-- toujours ces 22 500 FCFA. Il constate un manquant qui n'existe pas.
--
-- Sur un produit dont le sujet est la confiance entre un collecteur et son
-- argent, c'est le pire endroit où se tromper : le dispositif censé le
-- rassurer devient celui qui l'accuse.
--
-- ## Le piège de la colonne
--
-- L'audit du 2026-08-24 proposait `cloture_le`. Cette colonne **n'existe pas** :
-- `retraits` porte `effectue_le`. La correction telle qu'écrite aurait échoué
-- en `42703`. C'est pourquoi elle est vérifiée ici par un test qui exerce une
-- journée entière, et non recopiée.

create or replace function public.cash_attendu_du_jour(p_collecteur uuid, p_date date)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select (
    coalesce((
      select sum(montant)
        from public.mises
       where collecteur_id = p_collecteur
         -- `at time zone 'UTC'` explicite, et non `encaisse_le::date` : ce
         -- dernier découpe la journée selon le fuseau de la session. Abidjan
         -- est à UTC+0 toute l'année, donc les deux coïncident aujourd'hui —
         -- par géographie, pas par intention. Une Edge Function lancée avec un
         -- autre `TimeZone` déplacerait la frontière du jour, et donc l'écart
         -- de caisse.
         and (encaisse_le at time zone 'UTC')::date = p_date
    ), 0)
    -
    -- Ce qui est sorti de la sacoche. `montant_restitue` et non `commission` :
    -- la commission reste chez le collecteur, et elle est déjà comptée du côté
    -- des mises — c'est la première mise du cycle. La soustraire ici la
    -- retirerait deux fois.
    coalesce((
      select sum(montant_restitue)
        from public.retraits
       where collecteur_id = p_collecteur
         and (effectue_le at time zone 'UTC')::date = p_date
    ), 0)
  )::integer;
$fn$;

comment on function public.cash_attendu_du_jour is
  'Ce que le collecteur doit avoir en main ce jour-là : mises encaissées moins '
  'restitutions versées. Découpage de journée en UTC, explicite.';

-- `create or replace` conserve l'ACL existante, mais on ne parie pas là-dessus :
-- cette fonction lit l'argent de tous les collecteurs sous `security definer`.
revoke all on function public.cash_attendu_du_jour(uuid, date) from public;
revoke all on function public.cash_attendu_du_jour(uuid, date) from anon;
revoke all on function public.cash_attendu_du_jour(uuid, date) from authenticated;

/**
 * Le rafraîchissement après une restitution.
 *
 * Son jumeau existait déjà pour les mises. Sans celui-ci, une carte clôturée
 * après une déclaration de caisse laisserait `cash_attendu` figé sur sa valeur
 * d'avant — exactement le défaut de lecture périmée trouvé le 2026-08-23 sur
 * l'écran de rapprochement, mais côté serveur, donc invisible à toute
 * invalidation de cache côté téléphone.
 */
create or replace function public.caisses_rafraichir_apres_retrait()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.caisses_jour
     set cash_attendu = public.cash_attendu_du_jour(
           new.collecteur_id, (new.effectue_le at time zone 'UTC')::date)
   where collecteur_id = new.collecteur_id
     and date = (new.effectue_le at time zone 'UTC')::date;
  return null;
end;
$fn$;

revoke all on function public.caisses_rafraichir_apres_retrait() from public, anon, authenticated;

drop trigger if exists retraits_rafraichir_caisse on public.retraits;
create trigger retraits_rafraichir_caisse
  after insert on public.retraits
  for each row execute function public.caisses_rafraichir_apres_retrait();

/* --------- Ce qui ne peut PAS être corrigé ici : pg_net ------------------ */

-- `pg_net`, arrivé le 2026-08-23 avec le drainage planifié des avis, accorde
-- `net.http_get` et `net.http_post` à **anon et authenticated**, et ouvre
-- l'usage du schéma `net` aux deux. C'est le pouvoir de faire émettre à la base
-- une requête HTTP arbitraire.
--
-- **Ces droits ne peuvent pas être révoqués d'ici.** Ils ont été accordés par
-- `supabase_admin` ; `postgres`, sous lequel tournent les migrations, n'est pas
-- leur donneur. PostgreSQL n'échoue pas — il émet `WARNING: no privileges could
-- be revoked for "net"` et ne change rien. Mesuré, plutôt que supposé. Une
-- révocation laissée ici serait un no-op qui ressemble à une protection : pire
-- qu'une absence, parce qu'on croirait le sujet traité.
--
-- Ce qui tient le risque aujourd'hui, et qu'il faut donc surveiller :
--   * `[api] schemas = ["public"]` — PostgREST n'expose pas `net`. Sonde en
--     production sur `/rest/v1/rpc/http_post` : 404.
--   * `extra_search_path` ne contient pas `net`.
--   * aucune fonction de `public` en `security invoker` n'appelle `net`.
--
-- Ajouter `net` à l'un de ces deux réglages transformerait le droit en
-- requête sortante arbitraire depuis l'intérieur du réseau Supabase.

/* ------------------- 3. Le journaliser oublié ---------------------------- */

-- `journaliser` et `journaliser_demande` sont révoquées ; `journaliser_collecteur`
-- ne l'était pas et gardait le droit d'exécution par défaut, c'est-à-dire PUBLIC.
--
-- L'impact est faible — une fonction qui rend `trigger` n'est pas exposée par
-- PostgREST, et appelée hors déclencheur elle échoue. Mais l'asymétrie est le
-- signe qui compte : trois fonctions sœurs, deux fermées, une ouverte, sans
-- raison écrite nulle part. C'est ainsi qu'une quatrième naîtra ouverte.
revoke all on function public.journaliser_collecteur() from public;
revoke all on function public.journaliser_collecteur() from anon;
revoke all on function public.journaliser_collecteur() from authenticated;

/* ------------------------------ Garde-fou -------------------------------- */

do $garde$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.retraits'::regclass and tgname = 'retraits_rafraichir_caisse'
  ) then
    raise exception 'GARDE_FOU : la caisse ne se rafraîchit pas après une restitution.';
  end if;

  if position('retraits' in pg_get_functiondef('public.cash_attendu_du_jour(uuid, date)'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : cash_attendu_du_jour ne soustrait pas les restitutions.';
  end if;

  if has_function_privilege('authenticated', 'public.journaliser_collecteur()', 'execute') then
    raise exception 'GARDE_FOU : journaliser_collecteur reste exécutable par un compte applicatif.';
  end if;
end;
$garde$;
