-- Les avis : l'ouverture de carte, et le pilotage par GTCS.
--
-- Deux manques laissés par `20260823140000`, et le second est le plus grave.
--
-- ## 1. `sur_ouverture` ne déclenchait rien
--
-- La colonne existait, la contrainte `avis_source_check` acceptait déjà
-- `'cartes'`, le module TypeScript savait composer le message — mais aucun
-- déclencheur ne posait de ligne à l'ouverture d'une carte. Un réglage qui
-- n'agit sur rien est pire qu'un réglage absent : GTCS l'aurait activé, aurait
-- constaté le silence, et aurait cherché la panne du côté de la passerelle.
--
-- ## 2. Personne ne pouvait allumer le dispositif
--
-- `avis_reglages` n'accorde que le `select` à `authenticated` — délibérément :
-- le canal engage une dépense que GTCS contracte auprès de l'opérateur, pas le
-- collecteur. Mais aucune fonction ne permettait à GTCS de l'écrire non plus.
-- Le dispositif était donc complet, testé, déployé, et **inatteignable**.
--
-- Le portillon suit celui des cinq autres fonctions d'administration :
-- `est_admin()` est vérifiée dans l'Edge Function, avec le jeton de l'appelant,
-- et ces fonctions-ci ne sont exécutables que par `service_role`.

/* --------------------- Le déclencheur, étendu aux cartes ------------------ */

/**
 * Compose et met en file l'avis d'un mouvement.
 *
 * Réécrite pour accepter une troisième provenance. La différence de forme
 * compte : une mise et un retrait portent `carte_id`, une carte porte
 * `client_id` directement. plpgsql résout les champs de `new` à l'exécution —
 * lire `new.carte_id` sur une ligne de `cartes` ne casse pas la migration, ça
 * casse l'insertion d'une carte, en production, chez un collecteur. D'où la
 * séparation franche des trois branches avant toute lecture de champ.
 */
create or replace function public.mettre_en_file_avis()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  reglages public.avis_reglages;
  client public.clients;
  carte public.cartes;
  texte text;
  reference text;
  identifiant_client uuid;
begin
  select * into reglages from public.avis_reglages where collecteur_id = new.collecteur_id;
  if not found or reglages.canal = 'aucun' then
    return null;
  end if;

  if tg_table_name = 'mises' and not reglages.sur_mise then return null; end if;
  if tg_table_name = 'retraits' and not reglages.sur_retrait then return null; end if;
  if tg_table_name = 'cartes' and not reglages.sur_ouverture then return null; end if;

  -- La commission du collecteur n'est pas un versement du client : elle est
  -- prélevée sur la première mise. L'annoncer comme un versement ferait croire
  -- au client qu'il a épargné une somme qui ne lui reviendra pas.
  --
  -- Le `if` est **imbriqué** et non joint par `and` : plpgsql prépare
  -- l'expression entière avant de l'évaluer, donc `new.est_commission` est
  -- résolu même quand la ligne vient de `cartes`, qui n'a pas cette colonne.
  -- La forme jointe passait la migration et faisait échouer l'ouverture d'une
  -- carte en production — « record "new" has no field "est_commission" ».
  -- Trouvé par les tests, pas par la relecture.
  if tg_table_name = 'mises' then
    if new.est_commission then return null; end if;
  end if;

  if tg_table_name = 'cartes' then
    -- Relue plutôt qu'affectée depuis `new` : les valeurs par défaut et ce
    -- qu'un déclencheur BEFORE a pu réécrire sont dans la table, pas
    -- nécessairement dans `new` tel qu'on le reçoit ici.
    select * into carte from public.cartes where id = new.id;
    if not found then return null; end if;
    identifiant_client := carte.client_id;
  else
    select * into carte from public.cartes where id = new.carte_id;
    if not found then return null; end if;
    identifiant_client := carte.client_id;
  end if;

  select * into client from public.clients where id = identifiant_client;
  if not found or client.telephone is null or not client.avis_actifs then
    return null;
  end if;

  reference := upper(substring(replace(new.id::text, '-', '') from 1 for 8));

  if tg_table_name = 'mises' then
    texte := 'KOLEK. Versement recu : ' || public.grouper_milliers(new.montant)
          || ' FCFA. Jour ' || carte.mises_encaissees || '/31. Total a vous rendre : '
          || public.grouper_milliers(greatest(carte.mises_encaissees - 1, 0) * carte.mise)
          || ' FCFA. Ref ' || reference || '.';
  elsif tg_table_name = 'retraits' then
    texte := 'KOLEK. Carte cloturee. Montant rendu : '
          || public.grouper_milliers(new.montant_restitue)
          || ' FCFA. Ref ' || reference
          || '. Verifiez la somme avant de quitter votre collecteur.';
  else
    -- La dernière phrase n'est écrite que si elle est vraie. Promettre un
    -- message par versement quand `sur_mise` est éteint installerait chez le
    -- client une attente que le dispositif ne tiendra pas — et le silence qui
    -- suit ressemblerait à une mise non enregistrée.
    texte := 'KOLEK. Nouvelle carte ouverte. Mise de '
          || public.grouper_milliers(carte.mise)
          || ' FCFA par jour, 31 jours. Ref ' || reference || '.'
          || case when reglages.sur_mise
                  then ' Vous recevrez un message a chaque versement.'
                  else '' end;
  end if;

  -- Le quota. `quota_atteint` plutôt qu'un silence : le collecteur doit pouvoir
  -- constater que ses clients cessent d'être prévenus, et pourquoi.
  if reglages.periode_quota < date_trunc('month', now())::date then
    update public.avis_reglages
       set segments_consommes = 0, periode_quota = date_trunc('month', now())::date
     where collecteur_id = new.collecteur_id;
    reglages.segments_consommes := 0;
  end if;

  insert into public.avis_clients (
    collecteur_id, client_id, source_table, source_id,
    destinataire, canal, corps, segments, statut
  )
  values (
    new.collecteur_id, client.id, tg_table_name, new.id,
    client.telephone, reglages.canal, texte, 1,
    case when reglages.segments_consommes >= reglages.quota_mensuel
         then 'quota_atteint' else 'a_envoyer' end
  )
  on conflict (source_table, source_id, canal) do nothing;

  return null;
end;
$fn$;

revoke all on function public.mettre_en_file_avis() from public, anon, authenticated;

drop trigger if exists cartes_avis on public.cartes;
create trigger cartes_avis
  after insert on public.cartes
  for each row execute function public.mettre_en_file_avis();

/* ------------------------ Le pilotage par GTCS --------------------------- */

/**
 * L'état des avis, collecteur par collecteur.
 *
 * `left join` sur `avis_reglages` : un collecteur sans réglage doit apparaître
 * dans la liste, avec `canal = 'aucun'`. C'est l'état par défaut du produit, et
 * un écran qui ne montrerait que les collecteurs déjà configurés cacherait
 * précisément ceux qu'il reste à configurer.
 */
create or replace function public.admin_avis()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select jsonb_build_object(
    'genere_le', now(),
    'collecteurs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',                 c.id,
          'nom',                c.nom,
          'palier',             c.palier,
          'canal',              coalesce(r.canal, 'aucun'),
          'sur_mise',           coalesce(r.sur_mise, false),
          'sur_retrait',        coalesce(r.sur_retrait, true),
          'sur_ouverture',      coalesce(r.sur_ouverture, true),
          'quota_mensuel',      coalesce(r.quota_mensuel, 0),
          'segments_consommes', coalesce(r.segments_consommes, 0),
          'periode_quota',      r.periode_quota,
          'regle',              (r.collecteur_id is not null),

          -- Le consentement, qui est l'autre moitié du verrou. Un canal ouvert
          -- sur un portefeuille où personne n'a consenti n'enverra rien, et
          -- GTCS doit le voir avant de conclure à une panne.
          'clients',            (select count(*) from public.clients cl
                                  where cl.collecteur_id = c.id),
          'clients_consentants',(select count(*) from public.clients cl
                                  where cl.collecteur_id = c.id
                                    and cl.avis_actifs
                                    and cl.telephone is not null),

          'en_attente',   (select count(*) from public.avis_clients a
                            where a.collecteur_id = c.id
                              and a.statut in ('a_envoyer', 'echoue')),
          'envoyes_mois', (select count(*) from public.avis_clients a
                            where a.collecteur_id = c.id
                              and a.statut = 'envoye'
                              and a.envoye_le >= date_trunc('month', now())),
          'bloques',      (select count(*) from public.avis_clients a
                            where a.collecteur_id = c.id
                              and a.statut = 'quota_atteint'),
          'abandonnes',   (select count(*) from public.avis_clients a
                            where a.collecteur_id = c.id
                              and a.statut = 'abandonne')
        )
        order by c.nom
      )
      from public.collecteurs c
      left join public.avis_reglages r on r.collecteur_id = c.id
    ), '[]'::jsonb),

    -- La dernière erreur rendue par la passerelle, tous collecteurs confondus.
    -- Sans elle, un compte non provisionné se traduit par une file qui grossit
    -- en silence.
    'derniere_erreur', (
      select jsonb_build_object('raison', derniere_erreur, 'quand', cree_le)
        from public.avis_clients
       where derniere_erreur is not null
       order by cree_le desc
       limit 1
    )
  );
$fn$;

alter function public.admin_avis() owner to postgres;

comment on function public.admin_avis() is
  'État des avis par collecteur : canal, quota, consentements, file. Réservée à service_role ; le contrôle est_admin() se fait dans l''Edge Function appelante.';

revoke all on function public.admin_avis() from public;
revoke all on function public.admin_avis() from anon;
revoke all on function public.admin_avis() from authenticated;
grant execute on function public.admin_avis() to service_role;

/**
 * Fixe la politique d'avis d'un collecteur.
 *
 * Le plafond sur `quota` n'est pas de la méfiance envers GTCS, c'est une
 * protection contre la frappe : un zéro de trop transforme 2 000 segments en
 * 20 000, soit 400 000 FCFA au tarif A2P ivoirien. La borne est haute — elle
 * n'entrave aucun usage réel — et refuse ce qui ne peut être qu'une erreur.
 *
 * Changer de canal **remet le compteur à zéro** ? Non. Le mois entamé a été
 * consommé, quel que soit le canal qui l'a consommé, et effacer le compteur à
 * chaque bascule ouvrirait un moyen simple de dépenser sans plafond.
 */
create or replace function public.admin_avis_definir(
  collecteur uuid,
  nouveau_canal text,
  mise boolean,
  retrait boolean,
  ouverture boolean,
  quota integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  ligne public.avis_reglages;
begin
  if nouveau_canal not in ('aucun', 'sms', 'whatsapp') then
    raise exception 'CANAL_INVALIDE';
  end if;
  if quota is null or quota < 0 or quota > 50000 then
    raise exception 'QUOTA_INVALIDE';
  end if;
  if not exists (select 1 from public.collecteurs where id = collecteur) then
    raise exception 'COLLECTEUR_INTROUVABLE';
  end if;

  insert into public.avis_reglages as r (
    collecteur_id, canal, sur_mise, sur_retrait, sur_ouverture, quota_mensuel
  )
  values (collecteur, nouveau_canal, mise, retrait, ouverture, quota)
  on conflict (collecteur_id) do update
    set canal         = excluded.canal,
        sur_mise      = excluded.sur_mise,
        sur_retrait   = excluded.sur_retrait,
        sur_ouverture = excluded.sur_ouverture,
        quota_mensuel = excluded.quota_mensuel,
        -- Le mois entamé reste consommé. Voir le commentaire d'en-tête.
        periode_quota = r.periode_quota,
        modifie_le    = now()
  returning * into ligne;

  return jsonb_build_object(
    'collecteur_id', ligne.collecteur_id,
    'canal', ligne.canal,
    'quota_mensuel', ligne.quota_mensuel,
    'segments_consommes', ligne.segments_consommes
  );
end;
$fn$;

revoke all on function public.admin_avis_definir(uuid, text, boolean, boolean, boolean, integer) from public;
revoke all on function public.admin_avis_definir(uuid, text, boolean, boolean, boolean, integer) from anon;
revoke all on function public.admin_avis_definir(uuid, text, boolean, boolean, boolean, integer) from authenticated;
grant execute on function public.admin_avis_definir(uuid, text, boolean, boolean, boolean, integer) to service_role;

/* ------------------------------ Garde-fou -------------------------------- */

do $garde$
begin
  if has_function_privilege('authenticated', 'public.admin_avis()', 'execute')
     or has_function_privilege('anon', 'public.admin_avis()', 'execute') then
    raise exception 'GARDE_FOU : admin_avis() est exécutable sans clé de service.';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.admin_avis_definir(uuid, text, boolean, boolean, boolean, integer)',
       'execute')
     or has_function_privilege(
       'anon',
       'public.admin_avis_definir(uuid, text, boolean, boolean, boolean, integer)',
       'execute') then
    raise exception 'GARDE_FOU : un collecteur peut fixer son propre quota.';
  end if;

  if has_table_privilege('authenticated', 'public.avis_reglages', 'update')
     or has_table_privilege('authenticated', 'public.avis_reglages', 'insert') then
    raise exception 'GARDE_FOU : avis_reglages est ouverte en écriture depuis un navigateur.';
  end if;

  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.cartes'::regclass and tgname = 'cartes_avis'
  ) then
    raise exception 'GARDE_FOU : le déclencheur d''ouverture de carte est absent.';
  end if;
end;
$garde$;
