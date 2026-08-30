-- Kolek — un canal qu'aucune passerelle ne sert cesse d'être proposable
--
-- ## Le piège, trouvé le 2026-08-30 en configurant les avis
--
-- Trois endroits acceptent `whatsapp` : la contrainte `avis_canal_check`, la
-- validation d'`admin_avis_definir`, et l'écran d'administration, qui
-- l'affiche avec la note « Moins cher, mais suppose que le client a WhatsApp ».
--
-- Aucune passerelle WhatsApp n'existe dans ce dépôt. `_shared/passerelle-sms.ts`
-- ne connaît que Twilio et Africa's Talking, et `envoyer-avis` **ne filtre pas
-- par canal** : il tire toute la file et l'envoie par la passerelle SMS.
--
-- Choisir WhatsApp fait donc partir un SMS, facturé au tarif A2P, pendant que
-- le tableau de bord affiche « WHATSAPP » et que la note promet une économie.
-- L'estimation mensuelle de l'écran — 20 FCFA le segment — chiffre alors un
-- canal qui n'est pas celui qu'on croit utiliser.
--
-- Et le cahier des charges désigne WhatsApp comme le canal **prioritaire** :
--
--   « Reçus | WhatsApp prioritaire (gratuit, quasi universel à Abidjan)
--     + repli SMS automatique »
--
-- L'administrateur qui suit la spécification tombe donc exactement dessus.
-- C'est le pire genre de piège : celui que la documentation recommande.
--
-- ## Rendre l'état impossible plutôt que le surveiller
--
-- Un garde dans `admin-avis` aurait suffi à fermer la porte d'aujourd'hui. La
-- contrainte ferme aussi celles de demain — un script, une insertion à la main,
-- une route future qui oublierait la règle. C'est l'argument déjà écrit dans
-- `super-admin-action/index.ts` : « une règle d'autorisation écrite en
-- TypeScript serait contournable par la prochaine route qui l'oublie ».
--
-- Les deux tables sont **vides** au moment où cette migration passe — aucun
-- réglage, aucun avis en file — donc rien à convertir.
--
-- ## Ce que cette migration ne dit pas
--
-- Elle ne dit pas que WhatsApp est une mauvaise idée. Le cahier des charges a
-- probablement raison : gratuit et universel à Abidjan, c'est le bon canal. Elle
-- dit qu'il n'est pas **servi**, et qu'un choix qu'on ne peut pas honorer ne
-- doit pas être offert. Le jour où une passerelle WhatsApp existe, on rouvre les
-- deux contraintes et on retire le refus — trois lignes, dans l'autre sens.

-- ---------------------------------------------------------------------------
-- Remettre l'étiquette sur ce qui se passait
-- ---------------------------------------------------------------------------
--
-- La production ne porte aucune ligne — `avis_reglages` et `avis_clients` sont
-- vides, mesuré le 2026-08-30. Mais une base de développement en porte, et une
-- migration qui n'aurait jamais tourné qu'une fois sur une table vide serait
-- une migration jamais éprouvée.
--
-- `whatsapp` devient `sms`, et ce n'est pas un pis-aller : ces lignes étaient
-- **déjà servies en SMS**, puisque `envoyer-avis` ne regarde pas le canal.
-- L'étiquette disait autre chose que le fait. On corrige l'étiquette, pas le
-- fait — et surtout on ne supprime rien : effacer une ligne d'avis effacerait
-- la trace d'un message réellement parti et réellement facturé.

update public.avis_reglages set canal = 'sms' where canal = 'whatsapp';
update public.avis_clients   set canal = 'sms' where canal = 'whatsapp';

-- ---------------------------------------------------------------------------
-- Les contraintes
-- ---------------------------------------------------------------------------

alter table public.avis_reglages drop constraint if exists avis_canal_check;
alter table public.avis_reglages
  add constraint avis_canal_check check (canal in ('aucun', 'sms'));

alter table public.avis_clients drop constraint if exists avis_canal_file_check;
alter table public.avis_clients
  add constraint avis_canal_file_check check (canal = 'sms');

comment on constraint avis_canal_check on public.avis_reglages is
  'aucun ou sms. whatsapp a été retiré le 2026-08-30 : aucune passerelle ne le sert, et le choisir faisait partir un SMS facturé sous une étiquette WhatsApp.';

-- ---------------------------------------------------------------------------
-- Le refus nommé
-- ---------------------------------------------------------------------------
--
-- `CANAL_INVALIDE` aurait suffi à bloquer, et aurait menti : WhatsApp est un
-- canal parfaitement valide, simplement pas encore desservi. Un message juste
-- évite qu'on cherche la faute de frappe pendant une heure.

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

  -- Distinct du refus ci-dessus, et c'est tout l'intérêt : « pas reconnu » et
  -- « reconnu mais sans passerelle » envoient chercher à deux endroits opposés.
  if nouveau_canal = 'whatsapp' then
    raise exception 'CANAL_SANS_PASSERELLE';
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
        -- Le mois entamé reste consommé. Voir le commentaire d'origine.
        periode_quota = r.periode_quota,
        modifie_le    = now()
  returning * into ligne;

  return jsonb_build_object(
    'collecteur_id', ligne.collecteur_id,
    'canal', ligne.canal,
    'sur_mise', ligne.sur_mise,
    'sur_retrait', ligne.sur_retrait,
    'sur_ouverture', ligne.sur_ouverture,
    'quota_mensuel', ligne.quota_mensuel,
    'segments_consommes', ligne.segments_consommes,
    'periode_quota', ligne.periode_quota
  );
end;
$fn$;

comment on function public.admin_avis_definir is
  'Pose la politique d''avis d''un collecteur. Refuse whatsapp par CANAL_SANS_PASSERELLE tant qu''aucune passerelle ne le sert — distinct de CANAL_INVALIDE, qui dit « pas reconnu ».';

-- ---------------------------------------------------------------------------
-- Garde-fou
-- ---------------------------------------------------------------------------
--
-- Une redéclaration de la fonction qui oublierait le refus le rouvrirait en
-- silence, et la contrainte le rattraperait par un message de base de données
-- illisible depuis un écran. On vérifie donc les deux.

do $garde$
declare
  manquant text := '';
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.avis_reglages'::regclass
       and conname = 'avis_canal_check'
       and pg_get_constraintdef(oid) like '%whatsapp%'
  ) then
    manquant := manquant || 'avis_reglages accepte encore whatsapp; ';
  end if;

  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.avis_clients'::regclass
       and conname = 'avis_canal_file_check'
       and pg_get_constraintdef(oid) like '%whatsapp%'
  ) then
    manquant := manquant || 'avis_clients accepte encore whatsapp; ';
  end if;

  if manquant <> '' then
    raise exception 'GARDE_FOU : %', manquant;
  end if;
end
$garde$;
