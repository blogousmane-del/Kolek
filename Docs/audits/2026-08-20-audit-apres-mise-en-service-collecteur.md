# Audit de sécurité — après la mise en service des écrans collecteur

**Date :** 2026-08-20 (troisième passe de la journée)
**Portée :** la surface nouvelle. Six écrans collecteur branchés sur la base, une
Edge Function qui écrit de l'argent, une table de retraits qui devient vivante.
**Méthode :** mesuré en production quand c'est possible, mesuré en local quand la
production ne peut pas être sondée sans dommage, déclaré uniquement quand ni l'un
ni l'autre n'existe — et dit comme tel.

---

## Ce que cette passe change par rapport aux deux précédentes

Les audits du 2026-08-19 et du matin du 2026-08-20 portaient sur une application
qui **lisait**. Depuis, `collecteur-cloturer-carte` est en ligne, et elle fait
sortir de l'argent du système : elle écrit dans `retraits`, table jusqu'ici vide,
et clôture des cartes.

C'est la première fois qu'une fonction à clé de service agit sur demande d'un
collecteur, et non d'un administrateur. Le contrôle d'accès n'y est donc plus
`est_admin()` mais RLS elle-même — et cette différence est le cœur de l'audit.

---

## Synthèse

| Verdict | Nombre | Note |
|---|---|---|
| 🔴 Critique | 1 | un compte de production porte un mot de passe de fuite publique — **il est toujours là** |
| 🟠 Sérieux | 0 | — |
| 🟡 Durcissement | 5 | dont deux reconduits des audits précédents |
| ✅ Conforme | 14 | dont sept mesurés en production ce soir |

---

## 🔴 Le compte de sonde n'a pas été supprimé

**Mesuré le 2026-08-20 à 21 h 55** : `public.collecteurs` compte toujours
**4 lignes**, contre 2 avant la sonde. Le compte créé avec `password123` est
vivant.

Ce que ce compte ouvre, exactement — et il faut être précis, ni dramatiser ni
minimiser :

- **Il ne voit pas les autres.** RLS le borne à ses propres clients, cartes,
  mises et caisse. Vérifié à nouveau ce soir, y compris sur les chemins neufs.
- **Il n'est pas administrateur.** Les trois Edge Functions le refusent.
- **Mais c'est un compte de production authentifiable**, dont le mot de passe
  figure **2 266 543 fois** dans des fuites publiques. Il peut ouvrir des clients,
  des cartes, encaisser des mises, déclarer une caisse et clôturer des cartes —
  au nom de GTCS, dans la base de production, sous une identité qui apparaîtra
  dans le tableau de bord d'administration comme un collecteur réel.

Le dégât n'est pas la fuite de données : c'est la **pollution du journal**. Les
tables `mises`, `retraits` et `audit_log` portent des déclencheurs d'immuabilité.
Ce qu'un intrus y écrirait ne pourrait pas être effacé.

**Geste : tableau de bord → Authentication → Users → supprimer.** Quinze
secondes. Je ne peux pas le faire — le rôle Postgres que le CLI ouvre pour ses
extractions n'a pas accès au schéma `auth` (`permission denied for schema auth`),
et la seule alternative technique serait d'exposer sur Internet un point d'entrée
capable d'effacer des comptes. Détail dans le rapport du 2026-08-19.

---

## 🟡 Les cinq durcissements

### 1. `auth.admin.createUser` ignore toute politique de mot de passe — chez l'éditeur

Défaut ouvert : [supabase/auth#1959](https://github.com/supabase/auth/issues/1959).
Traité le jour même dans `admin-creer-collecteur`, qui interroge Have I Been
Pwned lui-même par k-anonymat. **Mais la cause reste là.** Toute future création
de compte qui n'emprunterait pas cette fonction — un script, le tableau de bord
Supabase, une seconde Edge Function — retomberait dans le trou.

À faire le jour où un second chemin de création apparaît : lui faire traverser
`_shared/hibp.ts`, pas le réécrire.

### 2. Le journal d'audit couvre l'argent, pas les identités

Reconduit du 2026-08-20 matin, inchangé. `mises`, `cartes`, `retraits`,
`caisses_jour` sont journalisées ; `clients` et `collecteurs` ne le sont pas. Un
changement de nom de client ne laisse aucune trace.

Le SQL est rédigé dans le rapport de ce matin. Il demande une variante de
`journaliser()` parce que `collecteurs` a sa clé sur `id` et non `collecteur_id`.

### 3. `CLOTURE_PARTIELLE` : un état où l'argent est inscrit et la carte ouverte

Introduit ce soir, assumé, et nommé ici pour qu'il ne surprenne personne.

Si l'insertion dans `retraits` réussit et que la fermeture de la carte échoue, la
fonction rend **207** avec `CLOTURE_PARTIELLE` et le montant. Elle ne prétend pas
avoir échoué : annoncer un échec pousserait à recommencer, et le collecteur
rendrait l'argent deux fois.

L'état se répare tout seul au prochain appel — `retraits.carte_id` est unique,
donc la seconde tentative bute sur `23505`, que la fonction intercepte pour
poursuivre vers la fermeture. Couvert par quatre tests.

**Corrigé pendant la rédaction de ce rapport, et le défaut était pire que prévu.**
Je notais qu'il manquait une phrase. En allant l'écrire, j'ai trouvé que le
message n'aurait de toute façon jamais pu s'afficher : `functions.invoke` ne
remplit `error` que pour un statut **hors 2xx**, et 207 en est un. La clôture
partielle était donc lue comme une réussite, avec une commission indéfinie.

Le corps est désormais examiné même sur succès de transport, et le message dit
d'abord ce qu'il ne faut pas faire : *« Le retrait est déjà inscrit — ne rends pas
l'argent une seconde fois. »*

**Le même défaut existait côté administration**, sur `COMPLEMENT_INCOMPLET`, qui
rend lui aussi 207 : l'écran annonçait une création parfaite alors que la zone et
le palier n'avaient pas été enregistrés, et personne n'allait corriger la fiche.
Corrigé dans le même geste.

C'est la troisième fois de la journée qu'un défaut vient du même endroit : **une
supposition sur un chemin que je n'avais pas parcouru.** Les en-têtes CORS que je
déclarais au lieu de les observer, la sonde HIBP qui empruntait l'API qui ignore
la règle, et maintenant un statut 2xx que je traitais comme une erreur.

### 4. Dix commandes inertes dans l'application d'administration

Recherche + Filtrer + Exporter sur trois écrans, Calendrier, Créer un rapport,
Nouvel abonnement, et deux entrées de barre latérale — Transactions, Zones &
Marchés.

Toutes portent `disabled` et un `title="À venir"`, donc elles ne mentent pas.
C'est le motif honnête qu'on a retenu. Mais dix pastilles éteintes sur un tableau
de bord se lisent comme un produit cassé par qui n'a pas lu le code — c'est
exactement le reproche qui a été fait à l'application collecteur, et qui a
justifié le travail de ce soir.

L'application collecteur, elle, n'a **plus aucune commande inerte** : balayage
automatique, zéro `<button>` sans `onClick` ni `disabled`.

### 5. Le jeton de session vit dans `localStorage`

Reconduit sans changement des deux audits précédents. Comportement par défaut de
`supabase-js`. Le risque reste borné par une CSP sans `unsafe-eval`, sans script
tiers, et par l'absence de toute injection HTML dans le dépôt — revérifié ce soir.

---

## Les 20 contrôles

| № | Contrôle | Verdict | Preuve du 2026-08-20 soir |
|---|---|---|---|
| 1 | Secrets hors du dépôt | ✅ | `git ls-files` ne suit que `apps/*/.env.example` |
| 2 | Pas de clé de service dans les artefacts | ✅ | `verifier:bundles` — « Aucune fuite de clé de service » |
| 3 | `anon` sans accès aux tables | ✅ | neuf tables sondées en production, neuf fois `42501 permission denied` |
| 4 | `anon` sans accès aux fonctions | ✅ | `est_admin` et `admin_vue_globale` : `permission denied for function` |
| 5 | RLS effective entre collecteurs | ✅ | mesuré en local : insertion au nom d'un autre refusée `42501` |
| 6 | Écriture des retraits fermée au client | ✅ | mesuré : `42501` sur `retraits`, `insert` refusé sur `cartes.statut` |
| 7 | Liste blanche de colonnes de caisse | ✅ | `cash_attendu` refusé à l'insertion **et** à la mise à jour |
| 8 | Edge Functions : refus sans jeton | ✅ | trois fonctions, trois `401` |
| 9 | Edge Functions : refus d'un jeton anonyme | ✅ | `403` — `VERIFICATION_IMPOSSIBLE` ×2, `ACCES_RESERVE` ×1 |
| 10 | CORS : origine étrangère refusée | ✅ | aucun `Access-Control-Allow-Origin` rendu |
| 11 | CORS : cloisonnement entre applications | ✅ | l'origine collecteur n'obtient rien de la fonction d'administration |
| 12 | Inscription publique fermée | ✅ | `signup_disabled` en production |
| 13 | Mots de passe divulgués filtrés | ✅ | mesuré contre le service : `password123` → compromis, 2 266 543 |
| 14 | En-têtes de sécurité HTTP | ✅ | CSP, HSTS `preload`, `X-Frame-Options: DENY`, `nosniff`, Referrer, Permissions — sur les trois sites |
| 15 | Aucun bucket de stockage | ✅ | l'API refuse sans autorisation ; aucun bucket déclaré |
| 16 | Migrations : dépôt = production | ✅ | onze migrations, onze appariements, aucun écart |
| 17 | Immuabilité du journal | ✅ | couvert par `operations.test.ts`, revérifié |
| 18 | Idempotence de la clôture | ✅ | `retraits.carte_id unique` — second appel `23505`, intercepté |
| 19 | Journal des identités | 🟡 | `clients` et `collecteurs` non journalisés |
| 20 | Comptes de production sains | 🔴 | un compte porte un mot de passe de fuite publique |

---

## Ce que j'ai corrigé pendant cette passe

**`chargerAlertes` descendait toutes les mises sans borne.** Au bout d'un an
d'activité, chaque ouverture de l'écran aurait fait payer des milliers de lignes
en 3G. Fenêtre ramenée à quatre-vingt-dix jours — et surtout, la date d'ouverture
de la carte sert désormais de repli, sans quoi les cartes les plus endormies,
celles sans aucune mise récente, étaient précisément les seules à ne rien
déclencher. Un défaut qui se serait révélé exactement quand l'alerte servait.

**Deux hypothèses que j'avais justifiées sans les mesurer.** Le chemin d'écriture
du rapprochement — session du collecteur, RLS, liste blanche de colonnes —
n'était couvert par aucun test : `operations.test.ts` passe par la clé de
service, qui contourne les deux. Sept tests le couvrent maintenant, et l'un
d'eux prouve le choix de conception que j'avais seulement argumenté : un `upsert`
échoue bien en `42501` à la correction. Sept autres tests couvrent le contrat de
la clôture, dont les deux refus qui sont la seule raison d'être de l'Edge
Function.

**`_shared/cors.ts`** : deux constantes servaient de valeur par défaut à une
fonction déclarée avant elles. Sans conséquence — elles sont lues à l'appel —
mais remontées pour que l'ordre ne devienne jamais un piège.

---

## Deux erreurs à moi, consignées

**Le protocole de sonde du filtre HIBP était invalide.** Il traversait
`auth.admin.createUser`, la seule API qui ignore la politique de mot de passe.
Ma table à deux issues attribuait donc le bon résultat à la mauvaise cause.
C'est la deuxième fois de la journée que je conçois une sonde qui emprunte un
chemin différent de celui que la règle gouverne — la première étant la requête
CORS qui ne demandait que les en-têtes que j'avais moi-même déclarés.

**J'ai annoncé 249 tests dans le message du commit `4dd2b64`.** Le compte exact
est **244** : 149 base, 73 applications, 22 scripts. Le chiffre du commit reste
faux dans l'historique ; il est corrigé ici.

---

## Le compte des tests

| Suite | Tests |
|---|---|
| Base de données et Edge Functions | 149 |
| Applications | 73 |
| Scripts d'outillage | 22 |
| **Total** | **244** |

Ajoutés ce soir : 7 pour le contrat de clôture, 7 pour le rapprochement écrit par
le collecteur, 7 pour la parité de la formule de restitution entre `packages/core`
et le module Deno.

---

## L'ordre dans lequel traiter ce qui reste

1. **Supprimer le compte de sonde.** Quinze secondes, et c'est le seul 🔴.
2. **Le message de `CLOTURE_PARTIELLE`.** Quelques lignes, et elles servent au
   pire moment.
3. **Journaliser `clients` et `collecteurs`.** SQL déjà rédigé.
4. **Les dix commandes de l'administration** — construire, ou retirer. Les
   laisser éteintes est le choix qu'on vient de juger insuffisant côté collecteur.

---

# Suite du 2026-08-21 — les quatre points, traités

## 1. 🔴 → 🟢 : la suppression se fait maintenant depuis Kolek

Le constat disait « quinze secondes au tableau de bord Supabase, je ne peux pas
le faire ». C'était vrai, et c'était un mauvais produit : renvoyer l'exploitant
chez l'éditeur pour réparer un dégât causé ici. Le besoin reviendra, d'ailleurs —
tout compte créé pour un essai devra être retiré un jour.

`admin-supprimer-collecteur` est en ligne, et la fiche d'un collecteur porte une
zone de retrait en bas de page. Trois refus y sont écrits :

- **Un compte qui a encaissé ne se supprime pas.** La fonction compte les mises
  et les retraits avant de tenter quoi que ce soit. La base refuserait de toute
  façon — `on delete restrict`, *« on ne fait pas disparaître de l'argent
  encaissé en supprimant un compte »* — mais elle refuserait par une violation de
  clé étrangère, illisible. Le message dit le nombre : « ce collecteur a 2 mises
  à son nom ».
- **On ne se supprime pas soi-même.** Un administrateur est aussi une ligne
  `collecteurs` ; se retirer fermerait la porte de l'extérieur.
- **On ne supprime pas un autre administrateur.** La table `admins` est la seule
  source de ce droit, et son retrait n'a pas à tenir en un clic.

**Le geste pour toi, maintenant :** Collecteurs → ouvrir la fiche du compte de
sonde → bas de page → Supprimer.

## 2. `CLOTURE_PARTIELLE` — traité le 2026-08-20 au soir

Voir plus haut : le message n'aurait de toute façon jamais pu s'afficher, 207
étant un succès de transport. Corrigé des deux côtés.

## 3. Le journal des identités

Migration `20260821090000_journal_identites.sql`, appliquée en production.

`clients` et `collecteurs` sont journalisés en `insert or update`, et non en
`insert` seul comme `mises` : une mise est immuable, donc son insertion dit tout ;
une identité se corrige, et c'est la correction qu'on veut voir.

Une seconde fonction a été nécessaire, `journaliser_collecteur()` : l'originale
lit `new.collecteur_id`, colonne que `collecteurs` n'a pas — son identifiant
**est** le collecteur. La réutiliser aurait levé une erreur à chaque écriture,
donc rendu impossible la création d'un compte.

**Trouvé au passage :** `cartes` ne journalisait que l'ouverture. La clôture — le
moment où l'argent sort — ne laissait rien. Le retrait était bien tracé de son
côté, mais rien ne disait que la carte avait changé d'état. Corrigé.

Pas de `delete` au journal : la suppression passe par la fonction ci-dessus, qui
refuse tout compte ayant manié de l'argent, et un `after delete` échouerait de
toute façon puisque le journal référence `collecteur_id`.

Huit tests.

## 4. Les commandes inertes — et huit de plus que je n'avais pas vues

**Le balayage initial était incomplet.** Il cherchait `disponible: false` et les
`<button>` sans `onClick`. Il a manqué un cas que ni l'un ni l'autre ne révèle :

> `<ActionsRapides compact />` — sans propriété `actions`.

Le composant retombait sur une liste par défaut de **huit actions sans
gestionnaire**, celles de l'application collecteur. Le tableau de bord
d'administration affichait donc huit pastilles mortes portant les libellés d'une
autre application, et **rien dans son code ne le laissait deviner** : la liste
vivait dans le paquet d'interface.

C'est exactement ce qu'une valeur par défaut silencieuse produit — un composant
qui a l'air correct partout et faux à un endroit. La propriété `actions` est
désormais **obligatoire**, et `ACTIONS_PAR_DEFAUT` n'est plus exporté. Le défaut
ne peut plus se reproduire sans casser la compilation.

### Ce qui a été construit pour de vrai

| Commande | Devenue |
|---|---|
| Rechercher (Collecteurs) | recherche sur nom, téléphone et zone, plus trois filtres d'abonnement |
| Exporter (Collecteurs) | CSV de **ce qui est affiché**, filtre compris |
| Exporter (Abonnements) | CSV des abonnements avec le prix de la grille |
| Accès rapide (Tableau de bord) | quatre destinations réelles au lieu de huit promesses |
| Modifier (fiche collecteur) | nom, téléphone, zone, palier, statut d'abonnement |
| *(nouveau)* Supprimer | voir le point 1 |

L'export porte trois décisions qui décident s'il s'ouvre correctement à Abidjan :
point-virgule et non virgule (Excel francophone), BOM UTF-8 sans laquelle
« Adjamé » devient « AdjamÃ© », et montants en nombres bruts — `2 000 FCFA` est du
texte pour un tableur, `2000` est un nombre. Onze tests, dont celui du décalage
de colonnes qu'un nom de marché contenant un point-virgule provoquerait sur une
seule ligne, la plus difficile à voir.

### Ce qui a été retiré plutôt que construit

Rechercher et Calendrier du tableau de bord — il n'y a pas de liste à chercher ni
de rendez-vous en base. Créer un rapport — l'export vit dans les écrans qui ont
des lignes. Nouvel abonnement — un abonnement n'existe pas seul, il est porté par
la ligne `collecteurs`. Contacter — aucune messagerie n'existe et rien n'en
prévoit ; le téléphone est affiché juste au-dessus. Transactions et Zones &
Marchés de la barre latérale — leur contenu est déjà ailleurs.

Et **Retirer** sur le tableau de bord : le retrait existe désormais, mais côté
collecteur, et c'est définitif. Le cahier §11 pose que l'argent est manié par le
collecteur ; un retrait déclenché depuis un bureau GTCS n'aurait pas d'espèces en
face et fausserait son rapprochement de caisse. Ce bouton n'attendait pas son
tour — il ne devait pas exister ici.

## Deux de mes propres messages promettaient un écran inexistant

`COMPLEMENT_INCOMPLET` disait « corrige-les depuis sa fiche ». Le refus de
suppression disait « suspends son abonnement à la place ». Aucun des deux gestes
n'était possible.

C'est la même faute que celles déjà consignées, sous une autre forme : **écrire
une phrase sans parcourir le chemin qu'elle décrit.** Les deux écrans existent
maintenant.

## État après cette passe

| Mesure | Valeur |
|---|---|
| Fonctions Edge déployées | 5, toutes en `verify_jwt` |
| Commandes inertes, applications collecteur et admin | 0 |
| Migrations dépôt = production | 12 sur 12 |
| Tests | **262** — 157 base, 83 applications, 22 scripts |

Les cinq fonctions refusent un appel sans jeton (401), refusent un jeton anonyme
(403), et ne rendent aucun en-tête CORS à une origine étrangère. Mesuré ce matin.
