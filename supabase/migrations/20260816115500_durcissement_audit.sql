-- Kolek — durcissement issu de l'audit du 2026-08-16
--
-- Six coutures relevées après le passage sur les privilèges implicites. Le
-- motif commun des quatre premières : un GRANT au niveau table là où le reste
-- du socle découpe par colonne. La cinquième ferme l'antidatage, la sixième
-- donne à l'application admin de quoi vérifier qui elle laisse entrer.

-- ---------------------------------------------------------------------------
-- 1. caisses_jour — le contrôlé n'écrit plus le chiffre qui le contrôle
-- ---------------------------------------------------------------------------
-- `cash_attendu` était insérable et modifiable par le collecteur. Un manquant
-- de caisse se masquait en une requête : poser cash_attendu = cash_declare et
-- l'écart tombe à zéro. Or la spec §3.3 dit « calculé à la clôture de journée »
-- — personne ne l'avait traduit en privilège.
--
-- Le cadrage J2 (§ « l'attendu se recalcule ») va plus loin : le chiffre ne
-- doit pas être figé à la clôture. Un rattrapage daté du lundi, saisi mercredi,
-- doit refermer l'écart du lundi de lui-même. D'où un recalcul à chaque
-- écriture sur la caisse *et* à chaque mise encaissée sur la journée concernée,
-- plutôt qu'une valeur posée une fois.

-- Point d'entrée unique du calcul, et c'est le but : deux termes manquent
-- encore, et ils s'ajouteront ici, à un seul endroit.
--
--   J2 — les rattrapages. Le cadrage J2 est explicite : tout rapprochement doit
--   sommer mises + rattrapages, sinon il sous-compte exactement l'argent que le
--   mécanisme sert à ne pas perdre.
--
--   J3 — les retraits. Restituer une épargne, c'est sortir du cash de la
--   sacoche : `- sum(retraits.montant_restitue)` sur la journée. La formule
--   n'est volontairement pas anticipée ici — la table `retraits` n'est écrite
--   qu'à partir de J3, et poser aujourd'hui une soustraction qu'aucun test ne
--   peut exercer reviendrait à écrire du code mort qu'on croirait vérifié.
--   Tant que J3 n'est pas fait, l'attendu d'une journée avec clôture de carte
--   est trop haut, et l'écart apparaîtra négatif à tort.
create or replace function public.cash_attendu_du_jour(p_collecteur uuid, p_date date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(montant), 0)::integer
    from public.mises
   where collecteur_id = p_collecteur
     -- `at time zone 'UTC'` explicite, et non `encaisse_le::date` : ce dernier
     -- découpe la journée selon le fuseau de la session. Abidjan est à UTC+0
     -- toute l'année, donc les deux coïncident aujourd'hui — par géographie, pas
     -- par intention. Une Edge Function lancée avec un autre `TimeZone`
     -- déplacerait la frontière du jour, et donc l'écart de caisse.
     and (encaisse_le at time zone 'UTC')::date = p_date;
$$;

comment on function public.cash_attendu_du_jour is
  'Cash que le collecteur devrait détenir pour une journée. Seule source du champ caisses_jour.cash_attendu. J2 : y ajouter les rattrapages.';

create or replace function public.caisses_calculer_attendu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.cash_attendu := public.cash_attendu_du_jour(new.collecteur_id, new.date);
  return new;
end;
$$;

create trigger caisses_calculer_attendu
  before insert or update on public.caisses_jour
  for each row execute function public.caisses_calculer_attendu();

-- L'événement qui change l'attendu, c'est l'encaissement — pas la clôture.
-- Sans ce rafraîchissement, une mise synchronisée après la clôture laisserait
-- un écart faux pour toujours.
create or replace function public.caisses_rafraichir_apres_mise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.caisses_jour
     set cash_attendu = public.cash_attendu_du_jour(
           new.collecteur_id, (new.encaisse_le at time zone 'UTC')::date)
   where collecteur_id = new.collecteur_id
     and date = (new.encaisse_le at time zone 'UTC')::date;
  return null;
end;
$$;

create trigger mises_rafraichir_caisse
  after insert on public.mises
  for each row execute function public.caisses_rafraichir_apres_mise();

-- La caisse est un instrument de contrôle : elle se journalise comme les mises,
-- les cartes et les retraits. À la différence de ceux-là, elle reste modifiable
-- — corriger un cash déclaré est légitime — donc on journalise aussi l'update.
create trigger caisses_journal
  after insert or update on public.caisses_jour
  for each row execute function public.journaliser();

revoke insert, update on public.caisses_jour from authenticated;
grant insert (id, collecteur_id, date, cash_declare) on public.caisses_jour to authenticated;
grant update (cash_declare)                          on public.caisses_jour to authenticated;

-- ---------------------------------------------------------------------------
-- 2. clients — l'update ne touche plus l'identité ni l'horodatage
-- ---------------------------------------------------------------------------
-- `id` est généré par le téléphone et sert de clé à la souscription hors-ligne ;
-- `cree_le` est un horodatage serveur. Ni l'un ni l'autre n'est un champ de
-- profil. Un client sans carte voyait son id réécrit (avec carte, la clé
-- étrangère composite bloquait déjà, mais par accident, pas par intention).
revoke insert, update on public.clients from authenticated;
grant insert (id, collecteur_id, nom, telephone, photo_url, marche, activite)
  on public.clients to authenticated;
grant update (nom, telephone, photo_url, marche, activite)
  on public.clients to authenticated;

-- ---------------------------------------------------------------------------
-- 3. synchro_rejets — l'insert cesse de contourner le grant colonne
-- ---------------------------------------------------------------------------
-- L'update était bien restreint à `traite`. L'insert, lui, couvrait toutes les
-- colonnes : il suffisait d'insérer un rejet déjà marqué traité, ou de forger
-- `cree_le`, pour obtenir ce que l'update interdisait.
revoke insert on public.synchro_rejets from authenticated;
grant insert (id, collecteur_id, charge_utile, motif)
  on public.synchro_rejets to authenticated;

-- ---------------------------------------------------------------------------
-- 4. mises — l'heure du téléphone cesse d'être arbitraire
-- ---------------------------------------------------------------------------
-- `encaisse_le` vient du téléphone et n'avait aucune borne : une mise pouvait
-- être datée de 2001 ou de 2030. Combiné au point 1, l'antidatage était l'outil
-- de masquage d'un écart de caisse.
--
-- Pas de CHECK : la borne se compare à `now()`, qui n'est pas immuable et
-- qu'une contrainte de table refuse. Le contrôle vit donc dans le trigger.
--
-- Les bornes sont larges à dessein. En avant, un jour couvre la dérive
-- d'horloge d'un téléphone d'entrée de gamme. En arrière, quatre-vingt-dix
-- jours couvrent une file de synchronisation restée longtemps hors-ligne, ce
-- qui est le mode de fonctionnement normal du produit, pas l'exception.
create or replace function public.mises_avant_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare c public.cartes%rowtype;
begin
  -- Un rejeu de la file de synchro doit toujours se présenter comme un doublon,
  -- quel que soit l'état de la carte depuis. Ce test reste en tête : un rejeu
  -- qui sortirait en DATE_INVALIDE partirait en rejet de synchro, et sa
  -- ressaisie par un humain — avec un nouvel identifiant — serait un double
  -- comptage. C'est précisément ce que l'antériorité de ce test empêche.
  if exists (select 1 from public.mises where id = new.id) then
    raise exception 'DOUBLON' using errcode = '23505';
  end if;

  if new.encaisse_le > now() + interval '1 day'
     or new.encaisse_le < now() - interval '90 days' then
    raise exception 'DATE_INVALIDE';
  end if;

  -- Verrou de ligne : deux mises concurrentes sur la même carte ne peuvent
  -- pas lire toutes les deux mises_encaissees = 0 et créer deux commissions.
  select * into c from public.cartes where id = new.carte_id for update;

  if not found then
    raise exception 'CARTE_INTROUVABLE';
  end if;
  if c.statut <> 'active' then
    raise exception 'CARTE_CLOTUREE';
  end if;
  if c.mises_encaissees >= 31 then
    raise exception 'CYCLE_COMPLET';
  end if;
  if new.montant <> c.mise then
    raise exception 'MONTANT_INVALIDE';
  end if;

  -- Ces deux champs sont décidés par le serveur, jamais par le client.
  new.est_commission := (c.mises_encaissees = 0);
  new.collecteur_id  := c.collecteur_id;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. est_admin — le Dashboard authentifiait sans jamais autoriser
-- ---------------------------------------------------------------------------
-- `apps/admin` laissait entrer toute session valide : un collecteur s'y
-- connectait avec ses propres identifiants. Sans conséquence tant que la page
-- est une coquille, mais la porte devait être fermée avant les widgets de J4,
-- pas pendant.
--
-- Ce n'est pas un chemin de données : la fonction ne renvoie qu'un booléen sur
-- l'appelant, et n'ouvre aucune ligne d'`admins`. La vue globale de l'admin
-- passe toujours exclusivement par Edge Functions (spec §5.3).
create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins where user_id = (select auth.uid())
  );
$$;

comment on function public.est_admin is
  'Vrai si l''appelant est super-admin GTCS. Portillon du Dashboard, pas un accès aux données : la vue globale reste derrière les Edge Functions.';

-- ---------------------------------------------------------------------------
-- 6. Privilège d'exécution — même traitement que les privilèges de table
-- ---------------------------------------------------------------------------
-- PostgreSQL accorde EXECUTE à PUBLIC sur toute fonction créée. Les cinq
-- fonctions du socle renvoient `trigger` et ne sont donc pas appelables en RPC,
-- mais c'est du privilège dormant de la même famille que le TRUNCATE retiré à
-- la migration précédente : rien n'en a besoin, on ne le laisse pas attendre
-- qu'une fonction future le rende atteignable.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- Seule exception, et elle est explicite.
grant execute on function public.est_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Index manquants sur les chemins de lecture de J3 et J4
-- ---------------------------------------------------------------------------
create index retraits_collecteur_idx  on public.retraits(collecteur_id);
create index audit_log_collecteur_idx on public.audit_log(collecteur_id, survenu_le desc);

-- ---------------------------------------------------------------------------
-- Garde-fou — les colonnes rendues au serveur ne doivent pas revenir
-- ---------------------------------------------------------------------------
-- Même principe que le contrôle de la migration précédente : la reconstruction
-- échoue si une migration future ou un changement de plateforme réaccorde une
-- de ces écritures.
do $$
declare restants text;
begin
  select string_agg(distinct
           grantee || '.' || table_name || '.' || column_name || '.' || privilege_type,
           ', ' order by grantee || '.' || table_name || '.' || column_name || '.' || privilege_type)
    into restants
    from information_schema.column_privileges
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
     -- `clients.id` reste insertable : il est généré par le téléphone, c'est la
     -- clé de la souscription hors-ligne. C'est sa réécriture qui est interdite.
     and (table_name, column_name, privilege_type) in (
           ('caisses_jour',   'cash_attendu',  'INSERT'),
           ('caisses_jour',   'cash_attendu',  'UPDATE'),
           ('clients',        'id',            'UPDATE'),
           ('clients',        'cree_le',       'INSERT'),
           ('clients',        'cree_le',       'UPDATE'),
           ('synchro_rejets', 'cree_le',       'INSERT'),
           ('synchro_rejets', 'traite',        'INSERT')
         );

  if restants is not null then
    raise exception 'Colonnes réservées au serveur encore accordées : %', restants;
  end if;
end $$;
