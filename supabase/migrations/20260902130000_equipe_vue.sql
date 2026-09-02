-- Les deux portes par lesquelles un titulaire voit son équipe.
--
-- Aucune policy n'est élargie pour cela, et c'est la décision structurante de
-- cette conception : `collecteur_id = auth.uid()` reste vrai mot pour mot, donc
-- les 35 sites de lecture de l'application collecteur gardent leur sens — quand
-- l'écran somme les mises du jour, il somme toujours LES SIENNES.

-- ---------------------------------------------------------------------------
-- equipe_vue() — sans paramètre, et c'est la propriété de sûreté
-- ---------------------------------------------------------------------------
-- Elle lit `auth.uid()` elle-même : il n'existe aucune manière de demander
-- l'équipe de quelqu'un d'autre. Même forme qu'`admin_vue_globale`, qui fait
-- déjà exactement cela pour l'administration.
create or replace function public.equipe_vue()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with membres as (
    select c.id, c.nom, c.telephone
      from public.collecteurs c
     where c.titulaire_id = (select auth.uid())
  ),
  mises_par as (
    select m.collecteur_id,
           coalesce(sum(m.montant) filter (where not m.est_commission), 0) as du_aux_clients,
           coalesce(sum(m.montant) filter (where m.est_commission), 0)     as commissions
      from public.mises m
      join membres b on b.id = m.collecteur_id
     group by m.collecteur_id
  ),
  retraits_par as (
    select r.collecteur_id, coalesce(sum(r.montant_restitue), 0) as restitutions
      from public.retraits r
      join membres b on b.id = r.collecteur_id
     group by r.collecteur_id
  ),
  clients_par as (
    select cl.collecteur_id, count(*) as clients
      from public.clients cl
      join membres b on b.id = cl.collecteur_id
     group by cl.collecteur_id
  ),
  cartes_par as (
    select ca.collecteur_id, count(*) filter (where ca.statut = 'active') as cartes_actives
      from public.cartes ca
      join membres b on b.id = ca.collecteur_id
     group by ca.collecteur_id
  ),
  -- La caisse du jour se lit sur `caisses_jour`, et non par un appel à
  -- `cash_attendu_du_jour` : la ligne du jour n'existe qu'une fois la caisse
  -- déclarée, et son absence est une information — « il n'a pas encore compté ».
  -- La fabriquer ici afficherait un attendu sans déclaré, c'est-à-dire un écart
  -- qui n'existe pas.
  caisse_du_jour as (
    select cj.collecteur_id, cj.cash_attendu, cj.cash_declare, cj.ecart, cj.date
      from public.caisses_jour cj
      join membres b on b.id = cj.collecteur_id
     where cj.date = (now() at time zone 'UTC')::date
  )
  select coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'id',                   b.id,
         'nom',                  b.nom,
         'telephone',            b.telephone,
         'clients',              coalesce(cl.clients, 0),
         'cartes_actives',       coalesce(ca.cartes_actives, 0),
         'encours',              coalesce(m.du_aux_clients, 0) - coalesce(r.restitutions, 0),
         -- Les commissions du collaborateur reviennent au titulaire : c'est pour
         -- cela que la ligne figure ici, et qu'elle a disparu du Bilan du
         -- collaborateur.
         'commissions',          coalesce(m.commissions, 0),
         'cash_attendu',         k.cash_attendu,
         'cash_declare',         k.cash_declare,
         'ecart',                k.ecart,
         'derniere_declaration', k.date
       ) order by b.nom)
       from membres b
       left join clients_par  cl on cl.collecteur_id = b.id
       left join cartes_par   ca on ca.collecteur_id = b.id
       left join mises_par    m  on m.collecteur_id  = b.id
       left join retraits_par r  on r.collecteur_id  = b.id
       left join caisse_du_jour k on k.collecteur_id = b.id),
    '[]'::jsonb);
$fn$;

comment on function public.equipe_vue() is
  'Les collaborateurs de l''appelant, avec leurs totaux et leur caisse du jour. '
  'Sans paramètre : l''identité vient de auth.uid(), donc on ne peut pas demander l''équipe d''autrui. '
  'Tableau vide si l''appelant n''est pas titulaire — ne pas avoir d''équipe est un état normal.';

revoke all on function public.equipe_vue() from public, anon;
grant execute on function public.equipe_vue() to authenticated;

-- ---------------------------------------------------------------------------
-- equipe_clients(uuid) — elle prend un paramètre, donc elle le vérifie
-- ---------------------------------------------------------------------------
create or replace function public.equipe_clients(p_collaborateur uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'id',        cl.id,
         'nom',       cl.nom,
         'telephone', cl.telephone,
         'cartes',    coalesce((
           select jsonb_agg(
                    jsonb_build_object(
                      'id',               ca.id,
                      'mise',             ca.mise,
                      'mises_encaissees', ca.mises_encaissees,
                      -- La première mise du cycle est la commission : elle ne
                      -- revient pas au client. Même règle que `soldeRestituable`
                      -- dans packages/core.
                      'solde_restituable', greatest(ca.mises_encaissees - 1, 0)::bigint * ca.mise
                    ) order by ca.ouverte_le)
             from public.cartes ca
            where ca.client_id = cl.id and ca.statut = 'active'), '[]'::jsonb)
       ) order by cl.nom)
       from public.clients cl
      where cl.collecteur_id = p_collaborateur
        -- La vérification du paramètre, et la seule. Un identifiant hors équipe
        -- rend un tableau vide, jamais une erreur : une erreur dirait si
        -- l'identifiant existe.
        and exists (
          select 1 from public.collecteurs c
           where c.id = p_collaborateur
             and (c.titulaire_id = (select auth.uid()) or c.id = (select auth.uid()))
        )),
    '[]'::jsonb);
$fn$;

comment on function public.equipe_clients(uuid) is
  'Les clients d''un collaborateur de l''appelant — ou de l''appelant lui-même — avec leurs cartes actives. '
  'Tableau vide pour tout autre identifiant, y compris un identifiant qui existe : ne rien dire de ce qu''on n''a pas le droit de voir.';

revoke all on function public.equipe_clients(uuid) from public, anon;
grant execute on function public.equipe_clients(uuid) to authenticated;

-- ------------------------------- Garde-fou --------------------------------
--
-- Un `revoke` oublié sur une `security definer` est exactement le défaut qui ne
-- se voit pas. Même forme que dans `20260823090000` et `20260827090000`.
do $garde$
begin
  if has_function_privilege('anon', 'public.equipe_vue()', 'execute') then
    raise exception 'GARDE_FOU : equipe_vue est exécutable par anon.';
  end if;
  if has_function_privilege('anon', 'public.equipe_clients(uuid)', 'execute') then
    raise exception 'GARDE_FOU : equipe_clients est exécutable par anon.';
  end if;
  if not has_function_privilege('authenticated', 'public.equipe_vue()', 'execute') then
    raise exception 'GARDE_FOU : equipe_vue n''est exécutable par personne.';
  end if;
  if not has_function_privilege('authenticated', 'public.equipe_clients(uuid)', 'execute') then
    raise exception 'GARDE_FOU : equipe_clients n''est exécutable par personne.';
  end if;

  -- `equipe_clients` prend un paramètre : sans vérification, elle rendrait les
  -- clients de n'importe qui à n'importe qui. C'est la seule ligne du fichier
  -- dont l'absence serait une fuite de données, donc elle a son garde-fou.
  if position('titulaire_id = (select auth.uid())' in
       pg_get_functiondef('public.equipe_clients(uuid)'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : equipe_clients ne vérifie pas son paramètre.';
  end if;
end;
$garde$;
