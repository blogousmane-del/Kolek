# Le tableau de bord Admin et ses vraies tendances — conception

**Date :** 2026-09-11.
**Statut :** conception approuvée par l'exploitant le 2026-09-11, section par
section.
**Place dans la suite :** chantier **C** sur quatre — A nettoyage du menu (en
production), B santé du système (en production), C tableau de bord, D refonte
visuelle du Super Admin. Chacun a sa conception, son plan et son accord de
poussée.

---

## Le problème

Le tableau de bord de Kolek · Admin ne sait pas dire ce qui a changé. Ses quatre
cartes portent des cumuls depuis l'ouverture, sans aucune variation ; sa fenêtre
de temps ne filtre qu'une liste de vingt mouvements ; sa barre de répartition et
son classement des zones parlent, eux aussi, depuis l'ouverture.

Ce n'est pas un oubli. La version du 2026-09-05 affichait des tendances : elle
multipliait les totaux par des coefficients écrits à la main — 0,12 pour la
journée, 0,35 pour sept jours, 0,85 pour trente. L'audit du
[2026-09-06](../audits/2026-09-06-audit-mode-demo-et-tableau-de-bord.md) les a
retirés, et le contrat de `CarteStat` porte depuis la règle en toutes lettres :
sans état passé, aucune tendance.

**Ce que ce chantier change : la base sait dire le passé, et elle n'a jamais
cessé de le savoir.** Les mises et les retraits portent une date. L'audit
proposait une table d'instantanés quotidiens comme préalable ; elle existe
maintenant pour les stocks (chantier B), mais les flux n'en ont pas besoin — ils
sont datés depuis le premier jour.

| Donnée | Source | Remonte à |
|---|---|---|
| Encaissé, commissions, restitutions, mises, retraits, par jour | `mises`, `retraits` | 2026-08-20 |
| Encaissé par zone, par jour | les mêmes, par le collecteur | 2026-08-20 |
| Dernière mise d'un collecteur | `mises` | 2026-08-20 |
| Encours, clients, cartes actives | `releves_quotidiens` | 2026-09-11 |

## Ce que la production dit aujourd'hui

Relevé le 2026-09-11, en lecture seule et en agrégats.

| Mesure | Valeur |
|---|---|
| Mises | 797, sur 19 jours d'activité, du 2026-08-20 au 2026-09-11 |
| Moyenne | 42 mises par jour ; 97 sur les dernières 24 heures |
| Retraits | 17 |
| Clients, cartes, collecteurs, zones | 89, 123, 7, 6 |
| Collecteurs actifs sans mise depuis 7 jours | 5 sur 7 |
| Caisses déclarées | 8, dont 4 avec un écart |
| Mises dont le jour d'encaissement diffère du jour de réception | 0 sur 797 |

**Deux conséquences.** Le volume est petit : un calcul par jour sur les tables
sources tient sans table intermédiaire ni cache. Et le décrochage des
collecteurs est le signal le plus fort que ces chiffres portent — cinq
abonnements actifs sur sept ne servent plus.

## Les décisions

| Question | Décision |
|---|---|
| À quoi sert l'écran | **Piloter la journée** : ce qui a été encaissé, par qui, et ce qui décroche. |
| Périodes | **Glissantes** : aujourd'hui contre hier, 7 jours contre les 7 précédents, 30 contre les 30 précédents. Toujours à durées égales. |
| Date qui fait foi | **`encaisse_le`**, l'heure du geste — la journée que le collecteur déclare en caisse. Une mise reçue en retard corrige donc un jour passé. |
| Périmètre | **Tendances et périodes, structure gardée.** Pas de refonte de mise en page : c'est le chantier D. |
| Portée de la période | **Les flux** : cartes, répartition, zones, mouvements. Les stocks restent à l'instant, et l'écran le dit. |
| Mouvements | Ceux de la période, **200 au plus**, avec leur compte total. |
| Décrochage | **Une carte et une liste courte**, qui mènent à l'écran Collecteurs. |
| Approche | **La base calcule, la route reçoit la période.** |

Approches écartées : faire découper la période par l'écran — il redeviendrait
l'endroit où des montants se calculent, ce que l'audit du 6 septembre a
justement corrigé ; et une Edge Function dédiée — une fonction de plus à
sécuriser, déployer et éprouver, quand le chantier B a tranché l'inverse dans le
même cas.

## En base — une fonction neuve, la partagée intacte

`public.admin_tendances(p_jours integer default 7)` : `sql`, `stable`,
`security definer`, `set search_path = public, pg_temp`, propriété `postgres`,
révoquée de `public`, `anon` et `authenticated`, exécutable par `service_role`,
avec un bloc de garde qui vérifie ces droits.

**Pourquoi une fonction neuve plutôt qu'un paramètre sur `admin_vue_globale()` :**

1. Trois migrations passées interrogent `pg_get_functiondef` sur
   `'public.admin_vue_globale()'::regprocedure` — une signature à un argument ne
   s'y résout plus, et `db:reset` tomberait, donc le job « Base » du CI avec lui.
2. Surcharger le même nom rendrait l'appel sans argument ambigu.
3. `releve_du_jour()`, en production depuis ce jour, appelle
   `admin_vue_globale()` sans argument chaque soir à 23 h 55.

Ce que `admin_tendances` rend, en un seul `jsonb` :

```json
{
  "periode":      { "jours": 7, "debut": "2026-09-05", "fin": "2026-09-11" },
  "depuis":       "2026-08-20",
  "flux":           { "encaisse": 0, "commissions": 0, "restitutions": 0, "mises": 0, "retraits": 0 },
  "flux_precedent": { "encaisse": 0, "commissions": 0, "restitutions": 0, "mises": 0, "retraits": 0 },
  "serie":        [ { "jour": "2026-09-05", "encaisse": 0, "commissions": 0, "restitutions": 0, "mises": 0 } ],
  "zones":        [ { "zone": "Cocody", "encaisse": 0, "mises": 0, "collecteurs": 0 } ],
  "mouvements":   [ { "type": "mise", "client": "", "collecteur_id": "", "collecteur": "", "montant": 0, "survenu_le": "" } ],
  "mouvements_total": 0,
  "collecteurs_sans_mise": [ { "id": "", "nom": "", "zone": null, "derniere_mise": null, "jours_sans": 0 } ]
}
```

**Les règles de calcul, et pourquoi elles sont celles-là.**

- **Un jour est un jour d'Abidjan** : `(encaisse_le at time zone
  'Africa/Abidjan')::date`, comme le relevé quotidien du chantier B.
- **La période précédente a la même longueur**, collée à la période courante :
  30 jours se comparent à 30 jours, jamais à un mois entamé.
- **Les commissions se comptent sur `mises.est_commission` seul.**
  `retraits.commission` en est une recopie : mesuré le 2026-09-11, les 16
  retraits porteurs d'une commission portent **exactement** le montant de la
  mise de commission de leur carte. Additionner les deux compterait
  335 000 FCFA deux fois. L'écran actuel compte déjà de cette façon.
- **La série porte les jours creux à zéro** (`generate_series`). Sans eux, une
  courbe qui saute les jours sans mise comprime le temps et invente une
  régularité.
- **La série couvre 90 jours au plus**, indépendamment de la période choisie :
  c'est le fond de courbe, pas la fenêtre de calcul.
- **`depuis` est la date de la première mise en base.** C'est ce qui permet à
  l'écran de dire qu'une comparaison n'est pas possible plutôt que d'afficher
  une variation contre un vide.
- **Le décrochage ne regarde que les collecteurs actifs**, dont la dernière mise
  remonte à plus de 7 jours, ou qui n'en ont jamais eu.

## La route

`admin-vue-globale` lit `jours` **dans la chaîne de requête et dans le corps** :
`functions.invoke` ne sait pas construire de chaîne de requête, et la chaîne
reste la forme lisible dans un journal ou une commande `curl`. C'est le montage
déjà éprouvé de `super-admin-journal`.

- Valeurs acceptées : **1, 7, 30**. Toute autre valeur est refusée par un
  `PERIODE_INVALIDE`, sans repli silencieux sur une valeur par défaut — un écran
  qui affiche sept jours quand on lui en a demandé trois cents ment.
- La réponse gagne **une seule clé, `tendances`**. `totaux`, `zones`,
  `mouvements`, `cartes` et `collecteurs` gardent leur sens « depuis
  l'ouverture » : **six écrans lisent le même appel**, et changer leur sens
  changerait Encours & Soldes, Abonnements, Collecteurs et la fiche d'un
  collecteur.
- `partie=tendances` fait répondre la seule clé `tendances`. C'est ce que
  l'écran demande à chaque changement de période : inutile de retélécharger 500
  cartes pour recalculer un total.
- **Si `admin_tendances` échoue, `tendances` vaut `null`** et le reste de la
  réponse part quand même. L'écran affiche alors ses chiffres d'ensemble et dit
  que les tendances sont indisponibles — même tolérance qu'au chantier B, et
  éprouvée de la même manière.

## L'écran

**Un seul sélecteur de période**, en barre haute : Aujourd'hui, 7 j, 30 j. Un
`role="group"` nommé, `aria-pressed` sur chaque bouton. La fenêtre de temps
locale de la liste des mouvements disparaît : deux commandes de temps sur un
même écran, c'est une de trop, et c'est ce qui avait rendu l'ancienne
multiplication crédible.

**Les quatre cartes du haut.** Chacune dit son temps.

| Carte | Temps | Tendance |
|---|---|---|
| Encaissé | la période | oui, contre la période précédente |
| Commissions GTCS | la période | oui |
| Encours clients | à l'instant | non : c'est un stock, la précision le dit |
| Sans mise depuis 7 jours | à l'instant | non ; mène à l'écran Collecteurs |

« Abonnements à échoir » quitte le haut de l'écran et descend en ligne dans la
carte du revenu récurrent, où il parle du même sujet.

**Deux encaissés sur un écran, et lequel est lequel.** La grande carte de gauche
porte aujourd'hui « Total encaissé — depuis l'ouverture ». Elle le garde : c'est
le cumul de toute la vie de la plateforme, et il n'a pas de tendance parce qu'il
n'a rien à quoi se comparer. La carte du haut, elle, s'intitule « Encaissé » et
porte la période en toutes lettres sous le titre — « 7 derniers jours ». Les deux
chiffres diffèrent, chacun dit son temps, et aucun des deux ne s'appelle
simplement « encaissé » sans dire de quand il parle.

**Aucune tendance inventée.** Quand la période précédente n'existe pas — elle
commence avant le 20 août — ou quand elle vaut zéro, la pastille disparaît et
une phrase factuelle prend sa place : « pas de comparaison avant le 20 août »,
« aucun encaissement la période précédente ». La règle est celle que
`CarteStat` porte déjà dans son contrat ; ce chantier ne l'assouplit pas, il lui
donne enfin de quoi s'appliquer.

**Au milieu.** La courbe de l'encaissé par jour — `CourbeEvolution`, écrite au
chantier B — avec trois séries au choix : encaissé, commissions, mises. Sous
elle, la répartition des flux sur la période. Sa pastille de période perd son
chevron : elle n'ouvre rien, et le Design System interdit un élément qui promet
ce qu'il ne fait pas (§7). Elle affiche désormais la période choisie.

**À droite.** Les zones de la période, classées par encaissé. Puis les
mouvements de la période, 200 au plus, avec « 200 derniers sur N » quand la
liste est tronquée — même honnêteté que le tableau des cartes, borné à 500
depuis le début. La recherche et le filtre par type restent.

**En bas à gauche.** Les collecteurs sans mise depuis 7 jours : cinq au plus,
nom, zone, date de la dernière mise, et un lien vers Collecteurs.

## Ce qui est éprouvé

| Où | Ce qui est vérifié |
|---|---|
| `packages/core` | le module pur de variation : signe, arrondi, division par zéro, période précédente absente, valeurs négatives |
| `packages/ui` | la barre de répartition sans son chevron, la période affichée |
| `apps/admin` | changer la période déplace les montants **et** la liste ; les stocks ne bougent pas ; aucune pastille sans période précédente ; le décrochage mène à Collecteurs |
| base (`supabase/tests`) | verrou : `anon` et un collecteur sont refusés. Justesse : une mise d'hier et une d'aujourd'hui tombent dans les bonnes cases, un jour creux vaut zéro, la commission est comptée une fois. Bornes : période invalide refusée, 200 mouvements au plus, le compte total dit la vérité |
| route | `tendances` est présent ; `partie=tendances` ne rend que lui ; une période invalide est refusée ; l'écran survit à l'absence de la fonction |

**Le test qui change, en connaissance de cause.** `TableauDeBord.test.tsx`
vérifie aujourd'hui que la phrase « vs période précédente » est **absente** de
l'écran. L'audit du 6 septembre l'avait annoncé : c'est le test à rouvrir le
jour où l'historique existe. Il est réécrit à l'endroit — la phrase doit
apparaître sur les deux cartes de flux, et rester absente des deux cartes de
stock.

## Risques, et comment on les tient

- **Casser la fonction partagée.** Elle n'est pas touchée. Les gardes des
  migrations passées la résolvent par sa signature sans argument, et le relevé
  de 23 h 55 l'appelle ainsi en production.
- **Changer le sens des chiffres des cinq autres écrans.** La réponse ne gagne
  qu'une clé ; aucune clé existante n'est modifiée.
- **La démonstration.** `VUE_DEMO` doit recevoir des tendances fictives, sous le
  bandeau qui dit déjà que rien n'y est réel. Sans elles, la démonstration
  montrerait un écran amputé.
- **Le CI rejoue toutes les migrations** au job « Base » : la migration neuve
  doit passer les gardes des anciennes.
- **Rien d'irréversible.** Aucune donnée n'est écrite. Un retour arrière est une
  migration neuve qui supprime la fonction, et un `git revert` côté écran.

## Hors périmètre

- La refonte de la mise en page façon maquette : chantier D.
- L'export du tableau de bord, et la pagination des mouvements.
- La reconstitution des stocks d'avant le 2026-09-11 : les relevés quotidiens
  commencent ce jour-là, et les recalculer autrement donnerait un second chiffre
  pour la même question.
- Toute alerte poussée : l'écran constate, il ne prévient pas.

## Vérification

- Épreuves neuves vues rouges avant leur code, dans les quatre couches.
- `tsc -b`, `oxlint`, puis la chaîne complète `npm run verifier`, quinze
  commandes, lue dans son journal.
- Un regard sur l'écran en local, branché sur la pile locale, avec des mises
  posées la veille et l'avant-veille pour que les trois périodes disent des
  chiffres différents.
- Après une poussée consentie : la migration appliquée à part, puis les
  empreintes servies par les trois fronts comparées aux builds locaux.
