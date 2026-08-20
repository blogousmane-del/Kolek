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
