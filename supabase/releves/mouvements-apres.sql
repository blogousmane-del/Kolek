-- La vue rend-elle, ligne à ligne, ce que portent les tables ?
--
-- Se lit **après** la migration, en une seule instruction : les deux côtés sont
-- alors mesurés au même instant, et aucune fenêtre calme n'est nécessaire.
--
-- C'est la preuve la plus forte du chantier : si la vue reproduit exactement les
-- tables, alors tout lecteur qui passe de l'une à l'autre rend les mêmes
-- chiffres, sans qu'on ait à les comparer un par un.
select jsonb_build_object(
  'lignes_tables', (select count(*) from public.mises)
                   + (select count(*) from public.retraits)
                   + (select count(*) from public.rattrapages),
  'lignes_vue',    (select count(*) from public.mouvements),
  'rattrapages',   (select count(*) from public.rattrapages),

  'somme_vue',    (select coalesce(sum(sens * montant), 0) from public.mouvements),
  'somme_tables', (select coalesce(sum(montant), 0) from public.mises)
                  - (select coalesce(sum(montant_restitue), 0) from public.retraits)
                  + (select coalesce(sum(montant), 0) from public.rattrapages),

  'vue_egale_tables', (
    select md5(coalesce(string_agg(l, ',' order by l), '')) from (
      select concat_ws('|', m.id, 'mise', 1, m.montant, m.collecteur_id, m.encaisse_par,
                       m.carte_id, ca.client_id, m.encaisse_le, m.est_commission) as l
        from public.mises m join public.cartes ca on ca.id = m.carte_id
      union all
      select concat_ws('|', r.id, 'retrait', -1, r.montant_restitue, r.collecteur_id, r.restitue_par,
                       r.carte_id, ca.client_id, r.effectue_le, false)
        from public.retraits r join public.cartes ca on ca.id = r.carte_id
      union all
      select concat_ws('|', t.id, 'rattrapage', 1, t.montant, t.collecteur_id, t.main_id,
                       t.carte_id, ca.client_id, t.encaisse_le, false)
        from public.rattrapages t join public.cartes ca on ca.id = t.carte_id
    ) depuis_les_tables
  ) = (
    select md5(coalesce(string_agg(l, ',' order by l), '')) from (
      select concat_ws('|', id, nature, sens, montant, collecteur_id, main_id,
                       carte_id, client_id, survenu_le, est_commission) as l
        from public.mouvements
    ) depuis_la_vue
  )
) as releve;
