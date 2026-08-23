-- Les avis envoyés aux clients épargnants.
--
-- ## Pourquoi ce dispositif existe
--
-- Le cahier des charges §11 pose que l'argent est manipulé par le collecteur,
-- pas par la plateforme. Kolek ne peut donc pas garantir un versement : il ne
-- le voit pas passer. Ce qu'il peut faire, c'est **le dire au client**.
--
-- Un client qui reçoit « Versement recu : 500 FCFA. Total a vous rendre :
-- 8 000 FCFA » détient une trace que le collecteur n'a pas écrite. C'est le
-- seul mécanisme du produit qui rende un encaissement contestable par celui qui
-- l'a payé — et donc le seul qui protège vraiment l'épargne.
--
-- ## Pourquoi ce n'est PAS activé par défaut
--
-- Un SMS A2P coûte environ 20 FCFA en Côte d'Ivoire. Un collecteur au palier
-- Pro (150 clients) verse environ 3 900 mises par mois :
--
--     3 900 messages x 20 FCFA = 78 000 FCFA / mois
--     abonnement Pro          =  5 000 FCFA / mois
--
-- **Seize fois le prix de l'abonnement.** Envoyer un message à chaque mouvement,
-- inclus dans le forfait, mettrait GTCS en faillite au premier collecteur actif.
--
-- La conséquence est architecturale, pas commerciale : le déclenchement est
-- gouverné par une **politique par collecteur** et borné par un **quota
-- mensuel**. Le choix — qui paie, quels événements, quelle cadence — devient un
-- réglage, jamais une réécriture. Et un quota atteint arrête l'envoi au lieu de
-- creuser une dette.

/* --------------------------- Le consentement ----------------------------- */

-- Un client n'est pas notifié parce qu'il a laissé un numéro. Il l'est parce
-- qu'il l'a accepté. Le téléphone est souvent partagé en famille en Côte
-- d'Ivoire, et le solde d'épargne de quelqu'un n'a pas à arriver sur l'appareil
-- d'un tiers sans son accord.
alter table public.clients
  add column if not exists avis_actifs boolean not null default false;

comment on column public.clients.avis_actifs is
  'Le client a accepté de recevoir un avis à chaque mouvement. Faux par défaut : '
  'laisser un numéro n''est pas consentir à être notifié.';

-- Les droits de `clients` sont accordés colonne par colonne — une liste blanche,
-- pas un `grant` de table. Une colonne ajoutée n'hérite donc de rien, et il faut
-- l'ouvrir explicitement.
--
-- Le collecteur écrit ce consentement parce que c'est lui qui le recueille :
-- il est devant le client, il lui demande, il coche. Personne d'autre n'est en
-- position de le faire. Le défaut a été trouvé par les tests — l'insertion d'un
-- client avec `avis_actifs` échouait sans que rien dans la migration ne le
-- laisse deviner.
grant insert (avis_actifs), update (avis_actifs) on public.clients to authenticated;

/* ------------------------ La politique du collecteur --------------------- */

create table if not exists public.avis_reglages (
  collecteur_id uuid primary key references public.collecteurs (id) on delete cascade,

  -- Le canal. `aucun` est le défaut, et c'est délibéré : rien ne part tant que
  -- quelqu'un n'a pas décidé qui paie.
  canal text not null default 'aucun',

  -- Les événements notifiés. Séparés, parce qu'ils n'ont pas le même prix :
  -- une clôture par client et par cycle coûte trente fois moins qu'un avis par
  -- mise, et c'est le message qui compte le plus — c'est là que l'argent sort.
  sur_mise boolean not null default false,
  sur_retrait boolean not null default true,
  sur_ouverture boolean not null default true,

  -- Le garde-fou de facture. Compté en **segments**, pas en messages : c'est
  -- l'unité que l'opérateur facture.
  quota_mensuel integer not null default 0,
  segments_consommes integer not null default 0,
  periode_quota date not null default date_trunc('month', now())::date,

  modifie_le timestamptz not null default now(),

  constraint avis_canal_check check (canal in ('aucun', 'sms', 'whatsapp')),
  constraint avis_quota_positif check (quota_mensuel >= 0 and segments_consommes >= 0)
);

alter table public.avis_reglages enable row level security;

-- Le collecteur lit ses réglages ; il ne les écrit pas. Le canal engage une
-- dépense, et c'est GTCS qui la contracte auprès de l'opérateur.
revoke all on public.avis_reglages from public, anon, authenticated;
grant select on public.avis_reglages to authenticated;
grant all on public.avis_reglages to service_role;

drop policy if exists avis_reglages_select on public.avis_reglages;
create policy avis_reglages_select on public.avis_reglages
  for select to authenticated
  using (collecteur_id = (select auth.uid()));

/* ------------------------------- La file --------------------------------- */

create table if not exists public.avis_clients (
  id uuid primary key default gen_random_uuid(),
  collecteur_id uuid not null references public.collecteurs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,

  -- La provenance. Sert l'idempotence : une mise ne produit qu'un avis, quel
  -- que soit le nombre de fois où le drainage repasse dessus.
  source_table text not null,
  source_id uuid not null,

  destinataire text not null,
  canal text not null,
  corps text not null,
  -- Compté à la composition, pas à l'envoi : c'est ce qui permet de refuser un
  -- message avant de le payer.
  segments integer not null,

  statut text not null default 'a_envoyer',
  tentatives integer not null default 0,
  derniere_erreur text,
  cree_le timestamptz not null default now(),
  envoye_le timestamptz,

  constraint avis_source_check check (source_table in ('mises', 'retraits', 'cartes')),
  constraint avis_canal_file_check check (canal in ('sms', 'whatsapp')),
  constraint avis_statut_check check (
    statut in ('a_envoyer', 'envoye', 'echoue', 'abandonne', 'quota_atteint')
  ),
  constraint avis_corps_borne check (length(corps) between 1 and 480),
  constraint avis_segments_borne check (segments between 1 and 4)
);

-- L'idempotence, portée par la base et non par une condition dans du code.
-- Sans elle, un drainage rejoué envoie deux fois le même avis — et un client
-- qui reçoit deux fois « versement 500 FCFA » croit avoir versé mille.
create unique index if not exists avis_source_unique
  on public.avis_clients (source_table, source_id, canal);

create index if not exists avis_a_traiter
  on public.avis_clients (statut, cree_le)
  where statut in ('a_envoyer', 'echoue');

alter table public.avis_clients enable row level security;

-- Le collecteur voit ce qui est parti à ses clients : c'est sa preuve à lui
-- aussi, le jour où un client conteste. Il n'écrit rien — le corps du message
-- est composé par le serveur, et un collecteur qui pourrait le rédiger pourrait
-- annoncer un montant différent de celui qu'il a encaissé.
revoke all on public.avis_clients from public, anon, authenticated;
grant select on public.avis_clients to authenticated;
grant all on public.avis_clients to service_role;

drop policy if exists avis_clients_select on public.avis_clients;
create policy avis_clients_select on public.avis_clients
  for select to authenticated
  using (collecteur_id = (select auth.uid()));

/* ------------------------- La mise en file ------------------------------- */

/**
 * Compose et met en file l'avis d'une mise.
 *
 * Trois conditions doivent tenir, et l'ordre compte pour le coût : on sort le
 * plus tôt possible du chemin coûteux.
 *
 *   1. le collecteur a un canal et l'événement est activé ;
 *   2. le client a un numéro **et** a consenti ;
 *   3. le quota du mois n'est pas atteint.
 *
 * La composition du texte est faite ici, en SQL, et non dans l'Edge Function :
 * le texte doit être figé au moment du fait. Le recomposer à l'envoi ferait
 * dépendre le message d'un solde qui a pu bouger entre-temps — et un avis qui
 * annonce un solde postérieur au versement qu'il décrit est pire qu'un silence.
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
begin
  select * into reglages from public.avis_reglages where collecteur_id = new.collecteur_id;
  if not found or reglages.canal = 'aucun' then
    return null;
  end if;

  if tg_table_name = 'mises' and not reglages.sur_mise then return null; end if;
  if tg_table_name = 'retraits' and not reglages.sur_retrait then return null; end if;

  -- La commission du collecteur n'est pas un versement du client : elle est
  -- prélevée sur la première mise. L'annoncer comme un versement ferait croire
  -- au client qu'il a épargné une somme qui ne lui reviendra pas.
  if tg_table_name = 'mises' and new.est_commission then return null; end if;

  select * into carte from public.cartes where id = new.carte_id;
  if not found then return null; end if;

  select * into client from public.clients where id = carte.client_id;
  if not found or client.telephone is null or not client.avis_actifs then
    return null;
  end if;

  reference := upper(substring(replace(new.id::text, '-', '') from 1 for 8));

  if tg_table_name = 'mises' then
    texte := 'KOLEK. Versement recu : ' || public.grouper_milliers(new.montant)
          || ' FCFA. Jour ' || carte.mises_encaissees || '/31. Total a vous rendre : '
          || public.grouper_milliers(greatest(carte.mises_encaissees - 1, 0) * carte.mise)
          || ' FCFA. Ref ' || reference || '.';
  else
    texte := 'KOLEK. Carte cloturee. Montant rendu : '
          || public.grouper_milliers(new.montant_restitue)
          || ' FCFA. Ref ' || reference
          || '. Verifiez la somme avant de quitter votre collecteur.';
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

/** Groupe les milliers par une espace simple — l'insécable n'est pas en GSM-7. */
create or replace function public.grouper_milliers(valeur integer)
returns text
language sql
immutable
set search_path = pg_temp
as $fn$
  select regexp_replace(trunc(valeur)::text, '(\d)(?=(\d{3})+$)', '\1 ', 'g');
$fn$;

drop trigger if exists mises_avis on public.mises;
create trigger mises_avis
  after insert on public.mises
  for each row execute function public.mettre_en_file_avis();

drop trigger if exists retraits_avis on public.retraits;
create trigger retraits_avis
  after insert on public.retraits
  for each row execute function public.mettre_en_file_avis();

/* ------------------------------ Garde-fou -------------------------------- */

do $garde$
begin
  if has_table_privilege('anon', 'public.avis_clients', 'select')
     or has_table_privilege('authenticated', 'public.avis_clients', 'insert')
     or has_table_privilege('authenticated', 'public.avis_reglages', 'update') then
    raise exception 'GARDE_FOU : la file des avis est ouverte en écriture depuis un navigateur.';
  end if;

  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.mises'::regclass and tgname = 'mises_avis'
  ) or not exists (
    select 1 from pg_trigger where tgrelid = 'public.retraits'::regclass and tgname = 'retraits_avis'
  ) then
    raise exception 'GARDE_FOU : un déclencheur d''avis est absent.';
  end if;
end;
$garde$;
