-- Kolek — la vérification de la remise entre dans le verrou
--
-- Constat d'audit de la session kolek-00, le 2026-08-30, sur
-- `appliquer_code_promo()` posée le matin même.
--
-- ## Le défaut
--
-- L'`UPDATE` sur `codes_promo` est bien atomique : le quota ne se fait pas
-- dépasser. Mais la lecture de `collecteurs.remise_fin`, qui décide du refus
-- `remise_deja_active`, se faisait **avant lui et sans verrou**.
--
-- Deux applications simultanées de deux codes différents sur le même
-- collecteur lisent donc toutes les deux `remise_fin` à `null`, passent toutes
-- les deux, et incrémentent deux compteurs distincts. Le second `UPDATE` sur
-- `collecteurs` attend le premier, puis l'écrase. Deux unités de quota brûlées,
-- une seule remise posée.
--
-- ## Le commentaire décrivait le défaut en croyant décrire la parade
--
-- La version d'origine portait : « Le collecteur est vérifié avant, hors de la
-- course ». C'est exact, et c'est précisément ce qui la crée — hors de la
-- course veut dire hors du verrou. La remarque est de kolek-00, elle est juste,
-- et elle vaut d'être gardée ici : un commentaire qui rassure est plus long à
-- corriger qu'un code qui échoue.
--
-- ## Le remède
--
-- `for update` sur la ligne du collecteur, dès la lecture. La seconde
-- transaction attend, relit, trouve la remise que la première vient de poser,
-- et refuse sans rien consommer.
--
-- L'ordre de verrouillage — collecteurs, puis codes_promo — est le même dans
-- toute la fonction, et aucune autre écriture ne prend les deux tables dans
-- l'ordre inverse. Rien à interbloquer.
--
-- ## Ce qui ne change pas
--
-- La portée. Ce défaut brûlait une unité de quota, il n'ouvrait aucun
-- privilège : il fallait deux clics de super admin au même instant sur le même
-- collecteur. Corrigé parce que le remède tient en deux mots, pas parce que le
-- risque pressait.

create or replace function public.appliquer_code_promo(p_collecteur uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  fin_courante date;
  promo public.codes_promo;
begin
  -- `for update` : la vérification et l'écriture doivent voir la même ligne.
  -- Sans lui, deux applications concurrentes la trouvent libre toutes les deux.
  select remise_fin into fin_courante
    from public.collecteurs
   where id = p_collecteur
     for update;

  if not found then
    return jsonb_build_object('applique', false, 'raison', 'collecteur_introuvable');
  end if;

  -- Deux campagnes superposées sur un même abonnement consommeraient deux
  -- quotas pour une seule remise visible, et personne ne saurait laquelle
  -- s'applique.
  if fin_courante is not null and fin_courante >= current_date then
    return jsonb_build_object('applique', false, 'raison', 'remise_deja_active');
  end if;

  update public.codes_promo
     set utilisations = utilisations + 1
   where code = p_code
     and current_date between valide_du and valide_au
     and (quota is null or utilisations < quota)
  returning * into promo;

  -- Un seul refus pour trois causes — code inconnu, hors période, quota
  -- atteint. Les distinguer dirait à qui appelle si un code existe, et cette
  -- fonction n'a aucune raison de le confirmer.
  if not found then
    return jsonb_build_object('applique', false, 'raison', 'code_indisponible');
  end if;

  update public.collecteurs
     set promo_code = promo.code,
         remise_pct = promo.remise_pct,
         remise_fin = promo.valide_au
   where id = p_collecteur;

  return jsonb_build_object(
    'applique',   true,
    'code',       promo.code,
    'remise_pct', promo.remise_pct,
    'remise_fin', promo.valide_au
  );
end;
$fn$;

alter function public.appliquer_code_promo(uuid, text) owner to postgres;

comment on function public.appliquer_code_promo is
  'Pose une remise sur un collecteur et consomme une unité de quota, atomiquement. La ligne du collecteur est prise en for update dès la lecture : sans elle, deux applications concurrentes brûlaient deux quotas pour une remise. Réservée à service_role ; le contrôle est_super_admin() se fait dans l''Edge Function appelante.';

-- `create or replace function` réattribue les droits par défaut sans rien dire.
revoke all on function public.appliquer_code_promo(uuid, text) from public, anon, authenticated;
grant execute on function public.appliquer_code_promo(uuid, text) to service_role;

do $garde$
begin
  if has_function_privilege('anon', 'public.appliquer_code_promo(uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.appliquer_code_promo(uuid, text)', 'execute') then
    raise exception
      'GARDE_FOU : appliquer_code_promo() est exécutable par anon ou authenticated. Elle pose des remises et ne doit être appelable que par service_role.';
  end if;
end;
$garde$;
