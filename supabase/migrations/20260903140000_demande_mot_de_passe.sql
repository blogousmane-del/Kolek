-- Kolek — le mot de passe d'un prospect vit en empreinte, jamais en clair
--
-- ## Le trou que l'amendement « payer vaut accord » laissait
--
-- L'amendement du 2026-09-02 dit deux choses qui ne tiennent pas ensemble sans
-- cette migration :
--
--   « Le prospect choisit son mot de passe dans le formulaire, **avant de
--     payer** » ; et le compte ne naît qu'au règlement confirmé.
--
-- Entre les deux, rien ne disait où ce mot de passe repose. `demandes_ouverture`
-- n'avait aucune colonne pour ça, et le plan n'en parlait nulle part. Trancher
-- au moment d'écrire la fonction aurait fait décider d'un stockage
-- d'identifiant par défaut d'attention. La question a été posée le 2026-09-03 ;
-- la réponse est ici.
--
-- ## Une empreinte, jamais le clair
--
-- La fonction reçoit le mot de passe en clair par HTTPS, le valide — forme, et
-- fuites connues chez HIBP — en calcule l'empreinte bcrypt, écrit l'empreinte
-- et jette le clair. Au règlement, `auth.admin.createUser` accepte
-- `password_hash` : le compte naît avec le mot de passe choisi au formulaire,
-- sans qu'il ait jamais reposé en clair nulle part.
--
-- Ce qui repose ici est donc de la même nature que `auth.users.encrypted_password`,
-- et se protège pareil.
--
-- ## Les trois fuites possibles, et où chacune est fermée
--
-- 1. **Par la table.** Fermée depuis l'origine : `demandes_ouverture` est
--    révoquée à `anon` et `authenticated`, lecture comprise. Le garde-fou de
--    `20260823090000` le vérifie, et celui d'en bas le revérifie.
-- 2. **Par la console.** `admin_demandes()` compose un objet nommant ses neuf
--    champs ; la colonne neuve n'y entre pas d'elle-même. Un `select *` l'aurait
--    emportée — c'est la raison d'être de cette forme, écrite avant ce besoin.
-- 3. **Par le journal.** C'est celle-ci qui était ouverte.
--    `journaliser_demande()` écrit `to_jsonb(new)` dans `audit_log`, c'est-à-dire
--    **toute la ligne**. L'empreinte y serait recopiée, et `super-admin-journal`
--    la rendrait à qui sait lire une page du journal. Elle en est retirée
--    ci-dessous.

/* ------------------------- 1. La colonne, et sa forme --------------------- */

alter table public.demandes_ouverture
  add column if not exists mot_de_passe_hash text;

-- La contrainte qui rend un clair **impossible** à écrire ici, et pas seulement
-- déconseillé. Une empreinte bcrypt fait exactement soixante caractères :
-- `$2a$`, `$2b$` ou `$2y$`, deux chiffres de coût, puis cinquante-trois
-- caractères de sel et de condensat. Aucun mot de passe humain n'a cette forme.
--
-- C'est le garde-fou qui vaut le plus cher pour ce qu'il coûte : le jour où
-- quelqu'un écrira ici la valeur reçue du formulaire au lieu de son empreinte,
-- la base refusera au lieu de conserver.
alter table public.demandes_ouverture drop constraint if exists demandes_mot_de_passe_empreinte;
alter table public.demandes_ouverture
  add constraint demandes_mot_de_passe_empreinte check (
    mot_de_passe_hash is null
    or mot_de_passe_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
  );

comment on column public.demandes_ouverture.mot_de_passe_hash is
  'Empreinte bcrypt du mot de passe choisi au formulaire, pour une demande payante. Jamais le clair. Reprise par auth.admin.createUser({ password_hash }) quand le règlement est confirmé. Ne sort ni par admin_demandes(), ni par le journal.';

/* --------------------- 2. Le journal cesse de la recopier ----------------- */

/**
 * Le journal d'audit d'une demande, moins l'empreinte.
 *
 * Corps repris de `20260823090000` à un opérateur près : `- 'mot_de_passe_hash'`
 * retire la clé de l'objet, qu'elle soit présente ou non. Le reste de la ligne
 * continue d'être conservé entier — c'est ce qui fait la valeur de cette trace,
 * et la retirer entière pour protéger un champ reviendrait à éteindre la lampe
 * pour cacher un objet.
 *
 * `collecteur_id` reste nul : une demande vient de quelqu'un qui n'est pas
 * encore collecteur. C'est tout l'objet de la table.
 */
create or replace function public.journaliser_demande()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.audit_log (collecteur_id, table_cible, ligne_id, action, donnees)
  values (null, tg_table_name, new.id, lower(tg_op), to_jsonb(new) - 'mot_de_passe_hash');
  return null;
end;
$fn$;

/* ------------------------------ Garde-fous -------------------------------- */

-- Mesurés, pas supposés — et sans rien laisser derrière. Les écritures d'essai
-- vivent dans une sous-transaction que le bloc annule volontairement : le
-- journal d'audit est immuable (`audit_log_immuable`), une ligne d'essai y
-- resterait pour toujours. Les variables plpgsql, elles, survivent au retour
-- arrière — c'est ce qui permet de juger après coup ce qui a été observé avant.
do $garde$
declare
  temoin uuid;
  trace jsonb;
  clair_accepte boolean := false;
  empreinte constant text :=
    '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0';
begin
  -- 1. Un clair est-il refusé ? C'est la raison d'être de la contrainte : le
  -- jour où quelqu'un écrira ici la valeur reçue du formulaire au lieu de son
  -- empreinte, la base doit refuser plutôt que conserver.
  begin
    insert into public.demandes_ouverture (nom, telephone, palier, mot_de_passe_hash)
    values ('Garde-fou', '+22500000000', 'standard', 'motdepasse-en-clair');
    clair_accepte := true;
  exception
    when check_violation then null;  -- attendu
  end;

  if clair_accepte then
    raise exception
      'GARDE_FOU : demandes_ouverture accepte un mot de passe en clair dans mot_de_passe_hash.';
  end if;

  -- 2. Une vraie empreinte passe-t-elle, et le journal l'oublie-t-il ? Une
  -- contrainte qui refuserait tout passerait le contrôle ci-dessus en bloquant
  -- aussi l'usage légitime.
  begin
    insert into public.demandes_ouverture (nom, telephone, palier, mot_de_passe_hash)
    values ('Garde-fou', '+22500000000', 'standard', empreinte)
    returning id into temoin;

    select donnees into trace from public.audit_log where ligne_id = temoin limit 1;

    raise exception 'ANNULER_GARDE_FOU';
  exception
    when others then
      if sqlerrm <> 'ANNULER_GARDE_FOU' then raise; end if;
  end;

  if trace is null then
    raise exception 'GARDE_FOU : l''insertion d''une demande n''est plus journalisée.';
  end if;
  if trace ? 'mot_de_passe_hash' then
    raise exception 'GARDE_FOU : le journal recopie l''empreinte du mot de passe.';
  end if;
  -- Le journal doit avoir oublié l'empreinte, pas la demande.
  if not (trace ? 'telephone') then
    raise exception 'GARDE_FOU : le journal ne conserve plus le contenu de la demande.';
  end if;

  -- 3. La table reste fermée aux rôles du navigateur, colonne neuve comprise.
  if has_table_privilege('anon', 'public.demandes_ouverture', 'select')
     or has_table_privilege('authenticated', 'public.demandes_ouverture', 'select') then
    raise exception 'GARDE_FOU : demandes_ouverture est lisible depuis un navigateur.';
  end if;
end;
$garde$;
