-- Le compteur de quota des avis, atomique.
--
-- Fichier séparé, et c'est la leçon : cette fonction avait d'abord été ajoutée
-- à la fin de `20260823140000_notifications_clients.sql`, déjà appliquée en
-- production. Supabase suit les migrations **par nom de fichier** : le fichier
-- étant déjà enregistré comme appliqué, l'ajout n'est jamais parti. Le local
-- l'avait — `db reset` rejoue tout — et le distant ne l'avait pas.
--
-- Un `db reset` local qui passe ne prouve donc rien sur le distant. C'est le
-- contrôle explicite en production qui l'a montré.

/**
 * Consomme le quota après un envoi réussi.
 *
 * Une fonction plutôt qu'un `update` depuis l'Edge Function : l'incrément doit
 * être atomique. Deux drainages concurrents qui liraient tous deux
 * `segments_consommes = 40` puis écriraient 41 auraient facturé deux messages
 * et n'en compteraient qu'un — et le quota, qui existe pour borner une
 * dépense, bornerait alors la mauvaise.
 *
 * Le compteur n'avance qu'**après** un envoi réussi : on ne fait pas payer au
 * collecteur les messages que la passerelle a refusés.
 */
create or replace function public.avis_consommer_quota(collecteur uuid, segments integer)
returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  update public.avis_reglages
     set segments_consommes = segments_consommes + greatest(segments, 0),
         modifie_le = now()
   where collecteur_id = collecteur;
$fn$;

revoke all on function public.avis_consommer_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.avis_consommer_quota(uuid, integer) to service_role;
