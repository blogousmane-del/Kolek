-- ===========================================================================
-- Ce que le client écrit en toutes lettres n'avait aucune borne
-- ===========================================================================
-- Écrite après l'audit des vingt contrôles du 2026-08-19.
--
-- Les trois audits précédents ont fermé le *qui* (RLS), le *quoi* (liste
-- blanche de colonnes) et le *combien* sur les colonnes monétaires. Personne
-- n'avait regardé la taille de ce qui entre. Le test « du client déloyal » —
-- appeler l'API hors de l'interface avec une chaîne de dix mille caractères —
-- passait sur les dix colonnes texte que `authenticated` peut écrire.
--
-- POURQUOI ÇA COMPTE ICI PLUS QU'AILLEURS. Chaque insertion dans `clients`,
-- `cartes` et `mises` est recopiée intégralement par `journaliser()` dans
-- `audit_log.donnees`, en jsonb. Une charge utile de 10 Mo coûte donc 20 Mo, et
-- le journal est append-only : rien ne l'efface, par construction. Un
-- collecteur authentifié — donc un client payant, pas un inconnu — pouvait
-- gonfler la base en boucle depuis un simple `curl`. Ce n'est pas un vol de
-- donnée, c'est une facture Supabase et une base qu'on ne peut plus purger.
--
-- CE QUE CETTE MIGRATION FAIT. Elle borne la longueur, pas le contenu. Les
-- bornes sont larges : elles doivent arrêter l'abus, jamais un nom ivoirien
-- long ou un libellé de marché à rallonge. Aucune borne minimale non plus — un
-- champ vide est un défaut de saisie, pas une faille, et une borne basse
-- refuserait des lignes déjà en base.

-- ---------------------------------------------------------------------------
-- 1. Les colonnes de profil et de fiche client
-- ---------------------------------------------------------------------------
-- `collecteurs.telephone` est borné à 64 et non à 32 comme celui du client :
-- `creer_collecteur_apres_signup` retombe sur `new.id::text` quand
-- l'inscription n'a pas fourni de numéro, soit un UUID de 36 caractères. Une
-- borne à 32 aurait fait échouer cette migration sur la première ligne créée
-- par ce repli — et une contrainte qui refuse une ligne que le produit écrit
-- lui-même n'est pas une contrainte, c'est une panne.
alter table public.collecteurs
  add constraint collecteurs_nom_borne       check (length(nom) <= 120),
  add constraint collecteurs_telephone_borne check (length(telephone) <= 64),
  add constraint collecteurs_zone_borne      check (length(zone) <= 80);

alter table public.clients
  add constraint clients_nom_borne       check (length(nom) <= 120),
  add constraint clients_telephone_borne check (length(telephone) <= 32),
  add constraint clients_marche_borne    check (length(marche) <= 80),
  add constraint clients_activite_borne  check (length(activite) <= 80);

-- `photo_url` reçoit deux bornes plutôt qu'une. La longueur arrête l'abus de
-- volume ; le schéma arrête ce qui viendra après. Aucun écran n'affiche encore
-- cette photo — c'est précisément le bon moment, comme pour l'héritage de
-- `storage` fermé la veille : le jour où la valeur atterrit dans un `href`, un
-- `javascript:` ou un `data:text/html` y serait déjà stocké, écrit par un
-- collecteur, et le rendu le déclencherait chez l'administrateur qui consulte
-- la fiche. Le bucket à venir servira en `https://` ; rien d'autre n'a de
-- raison d'entrer.
alter table public.clients
  add constraint clients_photo_url_borne check (length(photo_url) <= 512),
  add constraint clients_photo_url_https check (photo_url is null or photo_url like 'https://%');

-- ---------------------------------------------------------------------------
-- 2. Le rejet de synchronisation, qui est le pire des trois
-- ---------------------------------------------------------------------------
-- `charge_utile` est un jsonb écrit tel quel par le téléphone : c'est la
-- colonne la plus exposée du schéma, et la seule sans forme imposée. Elle
-- conserve une mise refusée — quelques champs — pas un fichier. 8 Ko laissent
-- une marge d'un ordre de grandeur sur ce qu'une mise pèse réellement.
alter table public.synchro_rejets
  add constraint rejets_motif_borne        check (length(motif) <= 200),
  add constraint rejets_charge_utile_borne check (length(charge_utile::text) <= 8192);

-- ---------------------------------------------------------------------------
-- 3. La date de caisse, bornée comme l'est l'heure d'encaissement
-- ---------------------------------------------------------------------------
-- `caisses_jour.date` est insérable par le collecteur et n'avait aucune borne :
-- rien n'empêchait d'ouvrir une ligne de caisse par jour jusqu'en l'an 9999.
-- La fenêtre reprend celle de `mises.encaisse_le`, et pour les mêmes raisons :
-- un jour en avant pour la dérive d'horloge, quatre-vingt-dix jours en arrière
-- pour une file de synchronisation restée longtemps hors-ligne.
--
-- Pas de CHECK : la borne se compare à `now()`, qu'une contrainte de table
-- refuse. Le contrôle vit donc dans le déclencheur qui existe déjà.
--
-- Sur INSERT seulement. Corriger le cash déclaré d'une journée ancienne reste
-- légitime — c'est l'ouverture d'une caisse hors fenêtre qu'on refuse, pas la
-- correction d'une ligne que le serveur a lui-même acceptée en son temps.
create or replace function public.caisses_calculer_attendu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     and (new.date > (now() at time zone 'UTC')::date + 1
          or new.date < (now() at time zone 'UTC')::date - 90) then
    raise exception 'DATE_INVALIDE';
  end if;

  new.cash_attendu := public.cash_attendu_du_jour(new.collecteur_id, new.date);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Le déclencheur des mises cesse de renseigner l'inconnu
-- ---------------------------------------------------------------------------
-- `mises_avant_insert` est SECURITY DEFINER : son `select * from cartes` voit
-- toutes les cartes du produit, RLS comprise. L'insertion d'une mise sur la
-- carte d'un autre collecteur était bien refusée — le déclencheur repose
-- `new.collecteur_id` depuis la carte, et le `with check` de la politique
-- `mises_insert`, évalué après les déclencheurs BEFORE, ne reconnaît plus
-- l'appelant. Mais le refus n'arrivait qu'après avoir répondu.
--
-- Entre-temps, les messages levés renseignaient sur une carte que l'appelant ne
-- peut pas lire : CARTE_INTROUVABLE ou non (elle existe), CARTE_CLOTUREE (son
-- statut), CYCLE_COMPLET (son avancement), MONTANT_INVALIDE (son montant de
-- mise, trouvable en quelques essais). Un identifiant de carte est un UUID
-- v4 : deviner n'est pas réaliste, et c'est la seule raison pour laquelle ceci
-- n'est pas grave. Un UUID qui fuit par ailleurs — une capture d'écran, un
-- export, un journal — le redeviendrait.
--
-- Le refus remonte donc avant les tests d'état, et se confond avec l'absence :
-- une carte qui ne vous appartient pas est une carte qui n'existe pas.
--
-- `auth.uid() is not null` garde la porte ouverte aux Edge Functions à clé de
-- service, qui n'ont pas d'appelant et écriront la synchronisation en J2.
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

  -- Même message que ci-dessus, et c'est voulu : ne rien dire d'une carte que
  -- l'appelant n'a pas le droit de lire.
  if auth.uid() is not null and c.collecteur_id <> auth.uid() then
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
-- Garde-fou — aucune colonne texte écrivable ne repart sans borne
-- ---------------------------------------------------------------------------
-- Même principe que le garde-fou des privilèges de la migration du 2026-08-17 :
-- on n'énumère pas les colonnes connues, on interroge l'état réel. Toute
-- colonne `text` ou `jsonb` que la liste blanche rend écrivable à
-- `authenticated` doit porter une contrainte qui borne sa longueur. Une colonne
-- ajoutée en J2a sans borne fera échouer la reconstruction, ici, au lieu
-- d'attendre le prochain audit.
do $$
declare nues text;
begin
  select string_agg(distinct c.table_name || '.' || c.column_name, ', ')
    into nues
    from information_schema.column_privileges p
    join information_schema.columns c
      on c.table_schema = p.table_schema
     and c.table_name   = p.table_name
     and c.column_name  = p.column_name
   where p.table_schema = 'public'
     and p.grantee      = 'authenticated'
     and p.privilege_type in ('INSERT', 'UPDATE')
     and c.data_type in ('text', 'jsonb', 'character varying')
     and not exists (
           select 1
             from pg_constraint k
             join pg_class     t on t.oid = k.conrelid
             join pg_namespace n on n.oid = t.relnamespace
            where n.nspname = 'public'
              and t.relname = c.table_name
              and k.contype = 'c'
              -- `length(nom)` pour le texte, `length((charge_utile)::text)`
              -- pour le jsonb : la parenthèse optionnelle couvre les deux.
              and pg_get_constraintdef(k.oid) ~ ('length\(\(?' || c.column_name || '\)')
         );

  if nues is not null then
    raise exception 'Colonnes texte écrivables sans borne de longueur : %', nues;
  end if;
end $$;
