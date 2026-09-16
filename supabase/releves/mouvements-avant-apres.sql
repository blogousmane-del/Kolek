-- Relevé du registre — le même avant la migration et après.
--
-- Spec : Docs/specs/2026-09-15-mouvements-registre-design.md §6.4.
--
-- Une seule instruction, qui ne fait que lire, et qui ne rend que des comptes,
-- des sommes et des empreintes md5 : jamais un nom, jamais un numéro.
--
-- Deux relevés ne se comparent que si leur bloc `calme` est identique : une
-- mise ou un retrait arrivé entre les deux change légitimement les sommes. Et
-- jamais à cheval sur minuit UTC, qui décale les séries par jour, ni vers
-- 23 h 55, quand le relevé du jour appelle la vue globale.
select jsonb_build_object(
  'calme', jsonb_build_object(
    'derniere_mise_recue', (select max(recu_le) from public.mises),
    'dernier_retrait',     (select max(effectue_le) from public.retraits),
    'jour_utc',            (now() at time zone 'UTC')::date
  ),

  'tables', jsonb_build_object(
    'mises',          (select count(*) from public.mises),
    'somme_mises',    (select coalesce(sum(montant), 0) from public.mises),
    'retraits',       (select count(*) from public.retraits),
    'somme_retraits', (select coalesce(sum(montant_restitue), 0) from public.retraits)
  ),

  'caisses', (
    select jsonb_build_object(
      'lignes',      count(*),
      -- Leur nombre avant la migration est la ligne de départ : il ne doit pas
      -- bouger. Une caisse peut diverger de son recalcul pour des raisons
      -- anciennes ; ce relevé ne juge pas cela, il juge le changement.
      'divergentes', count(*) filter (
                       where cash_attendu <> public.cash_attendu_du_jour(collecteur_id, date)
                     ),
      'recalcul',    md5(coalesce(string_agg(
                       id::text || '=' || public.cash_attendu_du_jour(collecteur_id, date)::text,
                       ',' order by id), ''))
    )
    from public.caisses_jour
  ),

  -- Une empreinte par clé, et non une pour tout : un écart dit alors lequel des
  -- chiffres a bougé. Les tableaux sont triés sur le texte de leurs éléments,
  -- pour qu'un ordre d'égalité ne compte pas comme une différence.
  'admin_vue_globale', (
    select jsonb_object_agg(cle, md5(
             case when jsonb_typeof(valeur) = 'array'
                  then coalesce((select string_agg(e::text, ',' order by e::text)
                                   from jsonb_array_elements(valeur) e), '')
                  else valeur::text end))
      from jsonb_each(public.admin_vue_globale()) as x(cle, valeur)
     where cle <> 'genere_le'
  ),
  'admin_tendances_7', (
    select jsonb_object_agg(cle, md5(
             case when jsonb_typeof(valeur) = 'array'
                  then coalesce((select string_agg(e::text, ',' order by e::text)
                                   from jsonb_array_elements(valeur) e), '')
                  else valeur::text end))
      from jsonb_each(public.admin_tendances(7)) as x(cle, valeur)
  ),
  'admin_tendances_30', (
    select jsonb_object_agg(cle, md5(
             case when jsonb_typeof(valeur) = 'array'
                  then coalesce((select string_agg(e::text, ',' order by e::text)
                                   from jsonb_array_elements(valeur) e), '')
                  else valeur::text end))
      from jsonb_each(public.admin_tendances(30)) as x(cle, valeur)
  ),
  'admin_tendances_90', (
    select jsonb_object_agg(cle, md5(
             case when jsonb_typeof(valeur) = 'array'
                  then coalesce((select string_agg(e::text, ',' order by e::text)
                                   from jsonb_array_elements(valeur) e), '')
                  else valeur::text end))
      from jsonb_each(public.admin_tendances(90)) as x(cle, valeur)
  )
) as releve;
