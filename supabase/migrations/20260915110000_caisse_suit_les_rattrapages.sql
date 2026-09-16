-- La caisse du jour se calcule sur le registre, et un rattrapage la rattrape.
--
-- Spec : Docs/specs/2026-09-15-mouvements-registre-design.md §2.3 et §3.1.
--
-- Même résultat qu'avant sur les mêmes données : entrées moins sorties, par la
-- main qui a tenu l'argent, sur la journée UTC. Ce qui change est qu'un
-- rattrapage y entre — et qu'il y entre au jour de la mise refusée, pas au jour
-- de sa saisie.

create or replace function public.cash_attendu_du_jour(p_collecteur uuid, p_date date)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  -- `main_id` et non le propriétaire de la carte : c'est ce qui est passé par
  -- cette main-là qui doit se retrouver dans cette sacoche-là.
  --
  -- `at time zone 'UTC'` explicite, et non `survenu_le::date` : ce dernier
  -- découpe la journée selon le fuseau de la session. Abidjan est à UTC+0 toute
  -- l'année, donc les deux coïncident aujourd'hui — par géographie, pas par
  -- intention. Une Edge Function lancée avec un autre `TimeZone` déplacerait la
  -- frontière du jour, et donc l'écart de caisse.
  --
  -- `sens * montant` : les entrées s'ajoutent, les sorties se retirent. La
  -- sortie d'un retrait vaut le montant restitué, jamais restitué + commission
  -- — la commission reste chez le collecteur, et elle est déjà comptée du côté
  -- des entrées. La soustraire ici la retirerait deux fois.
  select coalesce(sum(sens * montant), 0)::integer
    from public.mouvements
   where main_id = p_collecteur
     and (survenu_le at time zone 'UTC')::date = p_date;
$fn$;

revoke all on function public.cash_attendu_du_jour(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Le rattrapage rafraîchit la caisse de son jour, comme le fait une mise
-- ---------------------------------------------------------------------------
-- Calqué sur `caisses_rafraichir_apres_mise`. S'il n'existe pas de caisse ce
-- jour-là, rien n'est créé : l'absence de ligne est une information — « il n'a
-- pas encore compté » — et la fabriquer afficherait un écart qui n'existe pas.
create or replace function public.caisses_rafraichir_apres_rattrapage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  update public.caisses_jour
     set cash_attendu = public.cash_attendu_du_jour(
           new.main_id, (new.encaisse_le at time zone 'UTC')::date)
   where collecteur_id = new.main_id
     and date = (new.encaisse_le at time zone 'UTC')::date;
  return null;
end;
$fn$;

revoke all on function public.caisses_rafraichir_apres_rattrapage() from public, anon, authenticated;

create trigger rattrapages_rafraichir_caisse
  after insert on public.rattrapages
  for each row execute function public.caisses_rafraichir_apres_rattrapage();

-- ---------------------------------------------------------------- Garde-fou
do $garde$
begin
  if position('mouvements' in
       pg_get_functiondef('public.cash_attendu_du_jour(uuid, date)'::regprocedure)) = 0 then
    raise exception 'GARDE_FOU : le cash attendu ne lit pas le registre.';
  end if;

  if has_function_privilege('anon', 'public.cash_attendu_du_jour(uuid, date)', 'execute')
     or has_function_privilege('authenticated', 'public.cash_attendu_du_jour(uuid, date)', 'execute') then
    raise exception 'GARDE_FOU : le cash attendu est exécutable depuis un navigateur.';
  end if;
end
$garde$;
