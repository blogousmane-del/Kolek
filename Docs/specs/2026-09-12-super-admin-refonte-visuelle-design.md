# Chantier D — la refonte visuelle du Super Admin

Dernier des quatre chantiers du programme : A a nettoyé le menu Admin, B a
donné la santé du système au Super Admin, C a rendu au tableau de bord ses
vraies tendances. Tous trois sont en production. D remet la console de
plateforme au niveau du reste.

Règle qui prime sur le reste : **données réelles, clients réels**. Aucune
carte de ce chantier n'affiche un chiffre que l'état ne porte pas déjà.

## Ce qui a été mesuré, et où

Relevé le 2026-09-12, avant toute décision. Chaque ligne est vérifiable.

- **Le menu porte deux fois le même nom.** `BarreLaterale.tsx:64` (espace
  Admin) et `:105` (espace Super) déclarent tous deux « Abonnements » avec
  l'icône `credit-card`, pour deux écrans différents. Pire, `:116` donne la
  **même icône** à « Paiement ».
- **Un écran est écrit deux fois.** `Abonnements.tsx:248` côté Admin et
  `superadmin/Abonnements.tsx:369` rendent la même grille de paliers — même
  structure, mêmes classes, même source `PALIERS` et même `parPalier` — à
  l'apostrophe près. Les deux écrans servent le même public : l'entrée Admin
  vit sous une section commentée « La monétisation est le métier de GTCS ».
- **`estSuper` ne filtre pas la section Monétisation.** Lignes 416 et 419, les
  sections `PILOTAGE` et `MONETISATION` sont rendues sans condition ;
  `estSuper` ne garde que le sélecteur d'espace (`:395`). Un administrateur
  métier voit donc bien « Abonnements » : lui retirer l'écran n'est pas une
  option.
- **L'horodatage existe et ne s'affiche pas.** `superadmin.ts:98` porte
  `genere_le` ; aucun écran du dossier `superadmin/` ne le rend. À la place,
  un bouton « Rafraîchir » coiffe les six onglets (`SuperAdmin.tsx:160-183`).
- **L'introspection est présentée comme du pilotage.** `Plateforme.tsx` rend
  `Object.entries(etat.volumes)` en grille : le nombre de lignes par table.
- **La promotion demandée par l'audit n'a jamais eu lieu.**
  `rejets_non_traites` et `caisses_jour` n'apparaissent ni dans
  `TableauDeBord.tsx` ni dans `donnees.ts`. Le chantier C a refait cet écran
  sans les absorber ; ils ne vivent que dans la grille des volumes, avec
  l'alerte que `Plateforme.tsx` lève quand des rejets attendent.
- **Aucune carte-statistique hors Santé.** `CarteStat` ne paraît dans aucun
  des cinq autres onglets.
- **Le journal parle en identifiants.** `LigneJournal` porte `acteur_id`,
  `collecteur_id` et `ligne_id`, tous des UUID, et l'écran affiche
  « acteur 3f2a… · ligne 9c1b… ».

### Contraintes relevées avant de proposer quoi que ce soit

- **Le jeu d'icônes est une union close** de 46 noms (`Icone.tsx`) : une icône
  non déclarée est une erreur de compilation. Les icônes que l'audit
  suggérait — passerelle, clé — n'existent pas. `receipt` et `landmark`
  existent et ne servent dans aucun des deux menus.
- **`BarreHaute` n'a pas d'emplacement pour un horodatage** : son contrat est
  `{ filAriane, titre, actions }`, et chaque action se rend en bouton.
- **Aucun repli natif dans le produit** : ni `<details>` ni `<summary>` dans
  les quatre applications.
- **Aucun utilitaire de temps relatif** dans `@kolek/core` : `format.ts:50` ne
  rend que de l'absolu, et `sante.ts` écrit ses phrases en dur.
- **`PageJournal` n'a pas de total, exprès** — « le serveur lit une ligne de
  plus que demandé plutôt que de compter une table qui ne rétrécit jamais ».
  Le chiffre honnête du journal est `volumes.audit_log`.
- **La route du journal ne compose pas sa requête** : elle appelle
  `service.rpc('super_admin_journal', …)`. Nommer les acteurs coûte une
  migration, pas un déploiement d'Edge Function.
- **`BarreLaterale.test.tsx` n'asservit pas « Abonnements »** : il asservit
  `Administrateurs`, `Promotions`, `Sécurité`, `Santé du système`. Le libellé
  ambigu était le seul non asserté. Renommer n'en casse aucune ; il faudra en
  ajouter une.

## Les décisions

| Question | Décision | Pourquoi |
|---|---|---|
| Périmètre | Les quatre points de l'audit, les six onglets au standard, et la duplication tranchée | Renommer le menu sans dédupliquer les écrans traiterait le symptôme |
| La grille des paliers | Un composant partagé dans `packages/ui`, sa forme dans `@kolek/core` | Règle §7 du système de dessin ; personne ne perd son écran ; le bloc se refond une fois |
| Le menu | L'entrée Super devient « Facturation » ; « Paiement » prend `receipt` | On renomme du côté vu par une poignée, pas par tous les administrateurs |
| La tête des onglets | Une `CarteStat` par onglet, alimentée par l'état ; `BarreHaute` gagne `mesure` | Le standard posé par `Sante.tsx` au chantier B |
| Les volumes | Les deux signaux sortent, les sept autres comptages se replient | Une alerte qu'il faut déplier n'alerte plus |
| Le journal | Les acteurs sont nommés par une migration neuve | Une console de sécurité illisible ne remplit pas son rôle |

## L'architecture

Aucun écran nouveau, aucune route nouvelle, **aucune Edge Function modifiée** —
donc aucun redéploiement de fonction à la poussée. Une seule migration,
additive.

| Où | Quoi |
|---|---|
| `packages/core` | `LignePalier` quitte `apps/admin/src/donnees.ts` et rejoint `PALIERS` ; un utilitaire de temps relatif, pur, y naît |
| `packages/ui` | `GrillePaliers` (neuf) · `Repli` (neuf) · `BarreHaute` gagne `mesure` |
| `apps/admin` | Le menu · les six têtes d'onglet · les deux écrans qui appellent `GrillePaliers` · `Plateforme` scindée |
| `supabase/migrations` | Une migration neuve : `super_admin_journal` nomme ses acteurs |

### `GrillePaliers`, dans `packages/ui`

Le bloc dupliqué n'a besoin que de deux choses : `PALIERS`, déjà dans
`@kolek/core` avec `nom`, `prix`, `teinte`, `fond`, `texte` et `limiteClients` ;
et les comptes par palier — `LignePalier`, sept champs primitifs sans aucune
dépendance à l'application. Rien n'empêche donc le composant partagé, et la
forme monte dans `@kolek/core`, où vit déjà la grille tarifaire.

Les deux écrans l'appellent ensuite avec la même donnée qu'aujourd'hui. Aucun
changement visible pour qui que ce soit à cette étape : c'est une
déduplication, pas une refonte du bloc.

### `BarreHaute.mesure`, et la fin de « Rafraîchir »

`BarreHaute` reçoit une propriété facultative : un horodatage cliquable, qui
recharge. Elle remplace le bouton « Rafraîchir » sur les six onglets. Une
seule affordance, et elle porte l'information que le bouton masquait : de
quand datent ces chiffres.

L'heure s'écrit **en relatif** — « mesuré il y a 3 min ». C'est ce que le
bouton « Rafraîchir » masquait : ce qui compte n'est pas l'heure qu'il était,
c'est la fraîcheur du chiffre. Le calcul naît dans `@kolek/core`, pur et
éprouvé, puisque rien de tel n'y existe. Il se recalcule à chaque rendu de
l'écran, et bascule sur l'heure absolue au-delà d'une heure plutôt que
d'annoncer « il y a 97 min ».

### `Repli`, dans `packages/ui`

Un `<details>`/`<summary>` habillé aux jetons, puisque le motif n'existe nulle
part. Il sert au « Détail technique » des volumes, et reste disponible
ailleurs.

## Les six onglets, et d'où vient chaque chiffre

Aucune carte n'invente : chaque valeur est déjà dans `EtatSuperAdmin` ou dans
`VueGlobale`.

| Onglet | Ce que la tête annonce | Source |
|---|---|---|
| Facturation | MRR, collecteurs actifs, abonnements expirants | `abonnements.parPalier`, `vue.collecteurs` |
| Administrateurs | Comptes, dont super administrateurs | `administrateurs[]` |
| Promotions | Codes en cours, remises qui courent | `codes_promo[].statut`, `remises[]` |
| Sécurité | Lignes de journal, dernière écriture, tables tracées | `volumes.audit_log`, `journal` |
| Paiement | Produits déclarés sur le total, état de la boutique | `paiement` |
| Santé du système | Inchangé, plus les deux signaux sortis du repli | `sante`, `volumes` |

### Les volumes, et les deux signaux

`rejets_non_traites` et `caisses_jour` sortent de la grille et deviennent des
signaux visibles sur l'écran Santé, l'alerte des rejets conservée telle
quelle. Les sept autres comptages passent sous un `Repli` intitulé « Détail
technique » : c'est de l'exploitation, pas du pilotage.

Promouvoir ces deux signaux jusqu'au tableau de bord Admin — ce que l'audit
demandait — coûterait une migration, un changement de route et un passage sur
l'écran. Écarté de ce chantier, mais pas fermé : les volumes viennent
d'`admin_reglages()`, que la route Admin peut lire aussi.

## La migration du journal

Un fichier neuf, jamais une réécriture de `20260830120000` :
`create or replace function public.super_admin_journal(...)` avec deux
`left join public.collecteurs`, l'un sur `acteur_id`, l'autre sur
`collecteur_id`. Le nom se lit `coalesce(c.nom, 'Compte sans fiche')`, exactement
comme `20260822090000` et `20260830150000` le font déjà pour les
administrateurs.

Quand `acteur_id` est nul — les lignes antérieures au 2026-08-30 —, l'écran
écrit **« non attribué »**, le libellé que
`20260830090000_journal_acteur.sql:38` prescrit lui-même. L'écran dit
aujourd'hui « inconnu ».

La fonction garde son enveloppe : `language sql`, `stable`,
`security definer`, `set search_path = public, pg_temp`. Les garde-fous
`search-path` et `definers_exposes` la couvrent donc sans rien ajouter. La
route `super-admin-journal` ne change pas : elle passe la réponse telle
quelle.

## Les épreuves

- **`BarreLaterale.test.tsx`** : une épreuve neuve pour « Facturation » et pour
  l'icône distincte de « Paiement ». Rien à réparer — le libellé n'était pas
  asservi.
- **`GrillePaliers`, `Repli`, `BarreHaute.mesure`** : chacun la sienne dans
  `packages/ui`.
- **`SuperAdmin.test.tsx`** : les épreuves nommées que touchent le retrait de
  « Rafraîchir » et les nouvelles têtes diront ce qui change. C'est leur rôle,
  pas un dommage.
- **La base** : une épreuve dans `supabase/tests` sur les noms rendus par
  `super_admin_journal`, dont le cas `acteur_id` nul.
- **Le regard à l'écran**, en local et jamais sur la production : les quatre
  chantiers précédents ont chacun trouvé par là un défaut qu'aucune épreuve ne
  voyait.

## Les risques

- **Le déplacement de `LignePalier`** touche deux écrans, le mode démonstration
  et leurs épreuves. C'est mécanique, mais large.
- **La migration est la seule pièce qui atteint la production.** Son retour
  arrière est une migration neuve qui rétablit la version précédente de la
  fonction ; aucune donnée n'est écrite par ce chantier.
- **Le renommage du menu change une habitude.** « Abonnements » devient
  « Facturation » pour les super administrateurs, une poignée de personnes.

## Hors périmètre

- Promouvoir `rejets_non_traites` et `caisses_jour` jusqu'au tableau de bord
  Admin.
- Le point 5.1 de l'audit — l'écran Sécurité en panne — qui n'était pas un
  défaut de dessin, et que le chantier B a traversé sans le rencontrer. À
  confirmer au regard, non à corriger d'office.
- Toute fusion des deux écrans « Abonnements » : un administrateur métier voit
  le sien, et le lui retirer sortirait d'une refonte visuelle.
