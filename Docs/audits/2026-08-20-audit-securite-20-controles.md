# Audit de sécurité — Kolek, 2026-08-20

Second passage sur la grille des 20 contrôles, un jour après le premier
(`2026-08-19`). Celui-là partait des entrées : ce qui rentre, et quelle taille.
Celui-ci part des **sorties et des traces** : qui peut modifier quoi, et qu'est-ce
qui en reste écrit.

Tout ce qui suit a été vérifié aujourd'hui contre le projet **en ligne**, par
extraction du schéma distant (`supabase db dump --linked`) et par requêtes
directes sur les trois cibles Netlify. Rien n'est recopié du rapport de la
veille.

| | Nombre | Depuis |
|---|---|---|
| 🔴 Bloquant | 0 | — |
| 🟠 Important | 0 | celui de la veille est corrigé et vérifié en ligne |
| 🟡 Durcissement | 4 | dont **un traité le jour même** — constat 3, voir plus bas |
| ⚪️ Non vérifié | 0 | — |
| Reconduits | 3 | voir « Ce qui reste ouvert depuis hier » |

**Le point le plus urgent n'est pas dans ce rapport** : c'est toujours
`Prevent use of leaked passwords`, désactivé, documenté au rapport de la veille.
Une case à cocher. Rien ici ne passe devant.

---

## 🟡 1. La piste d'audit couvre l'argent, pas les identités

**Contrôle 8** — et c'est le vrai constat de la journée.

Quatre tables sont journalisées par le déclencheur `journaliser()` :
`mises`, `retraits`, `caisses_jour`, `cartes`. Trois d'entre elles sont en plus
rendues immuables par `interdire_modification()` — toute tentative d'`UPDATE` ou
de `DELETE` lève `LIGNE_IMMUABLE`. Le registre de l'argent est donc en ajout
seul et intégralement tracé. C'est bien fait.

**Deux tables échappent entièrement au journal, et ce sont celles qui donnent un
sens à l'argent :**

```
clients      UPDATE accordé sur nom, telephone, photo_url, marche, activite
collecteurs  UPDATE accordé sur nom, telephone, zone
```

Aucun déclencheur `journal` sur l'une ni sur l'autre. Un collecteur peut
renommer un de ses clients, changer son numéro, et **rien nulle part n'en garde
trace** — ni l'ancienne valeur, ni la date, ni le fait qu'un changement a eu lieu.

### Pourquoi ça compte ici précisément

Dans une tontine, l'identité du client **est** le lien entre une personne et son
argent. Les mises sont immuables et tracées, mais elles pointent vers une carte,
qui pointe vers un client — dont le nom peut changer silencieusement. Le registre
reste exact et intègre ; ce qu'il désigne, non.

Ce n'est pas une faille exploitable à distance : il faut être un collecteur
authentifié, et il ne peut toucher que ses propres clients. C'est un **trou dans
la capacité à constater après coup**, ce qui est exactement l'objet du
contrôle 8. Le jour où un litige survient sur un compte, la question posée sera
« ce nom a-t-il changé ? », et la base n'aura pas la réponse.

### Ce qui rend la correction possible aujourd'hui et pas hier

`journaliser()` copie la ligne entière dans `audit_log` via `to_jsonb(new)`.
Étendre le journal aux `clients` **avant** les bornes de longueur de la veille
aurait amplifié exactement le 🟠 corrigé hier : chaque modification aurait
recopié un texte sans limite dans une table en ajout seul. Les bornes posées le
2026-08-19 (`nom ≤ 120`, `telephone ≤ 32`, `photo_url ≤ 512`, `marche ≤ 80`,
`activite ≤ 80`) plafonnent une ligne de `clients` à moins d'un kilo-octet. La
correction d'hier est la précondition de celle-ci.

### La correction

`clients` porte une colonne `collecteur_id` : `journaliser()` s'y attache tel
quel. `collecteurs` n'en a pas — sa clé est `id` — donc `new.collecteur_id`
vaudrait `NULL`. Il faut une variante, et c'est la seule subtilité :

```sql
create or replace function public.journaliser_collecteur() returns trigger
  language plpgsql security definer set search_path to 'public' as $fn$
begin
  insert into public.audit_log (collecteur_id, table_cible, ligne_id, action, donnees)
  values (new.id, tg_table_name, new.id, lower(tg_op), to_jsonb(new));
  return null;
end;
$fn$;

create trigger clients_journal
  after insert or update on public.clients
  for each row execute function public.journaliser();

create trigger collecteurs_journal
  after insert or update on public.collecteurs
  for each row execute function public.journaliser_collecteur();
```

Et tant qu'on y est, `cartes_journal` est déclaré `AFTER INSERT` seul. Les
colonnes `statut`, `cloturee_le` et `mises_encaissees` changent après coup — la
dernière à chaque mise, par `mises_apres_insert()`. Aucune n'est modifiable par
un collecteur, donc le risque est faible, mais une clôture de carte faite en
`service_role` ne laisse aujourd'hui aucune trace. `AFTER INSERT OR UPDATE`
comblerait ça.

---

## 🟡 2. `photo_url` accepte du `https://` que la CSP interdit d'afficher

**Contrôles 15 et 16.** Deux protections correctes qui, mises bout à bout, ne
décrivent aucun chemin fonctionnel.

Mesuré aujourd'hui :

```
clients.photo_url   INSERT+UPDATE accordés, contraint à like 'https://%', ≤ 512
storage/v1/bucket   []                       aucun bucket n'existe
CSP admin           img-src 'self' data:     aucune origine externe autorisée
```

Une photo de client ne peut donc être ni stockée chez Supabase — il n'y a pas de
bucket — ni affichée si elle venait d'ailleurs, la CSP refusant toute origine
externe. La colonne est ouverte à l'écriture et son contenu est inaffichable.

Ce n'est pas dangereux. Le danger est dans **ce qui va se passer quand quelqu'un
câblera la fonctionnalité** : la photo ne s'affichera pas, la console pointera la
CSP, et le réflexe sera `img-src *`. Ce serait rendre exploitable la borne
`https://` posée hier — qui protège l'écriture, pas le rendu.

**La réponse sûre, à écrire maintenant plutôt qu'en urgence :** créer le bucket,
le laisser privé, servir les images par URL signée, et ajouter à la CSP
**l'origine exacte** du projet, jamais un joker :

```
img-src 'self' data: https://yfnwmokxkznejotgpfgf.supabase.co;
```

C'est déjà la forme retenue pour `connect-src`, qui nomme l'origine du projet et
rien d'autre. La CSP admin est par ailleurs excellente et mérite d'être citée :
`base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'`,
`object-src 'none'`, aucun `unsafe-inline` sur les scripts.

---

## ~~🟡 3. Le tableau de bord admin est une maquette~~ — **traité le jour même**

**Contrôles 3 et 6.** Le constat, mesuré le matin :

```
apps/admin/src        1 seul appel à la base : rpc('est_admin')
6 écrans              données en dur (TRANSACTIONS, ZONES, REPARTITION…)
politiques RLS        16, toutes en collecteur_id = auth.uid()
                      aucune n'accorde à un admin la lecture d'autrui
```

Le risque annoncé était le suivant : celui qui câblerait les vrais chiffres se
cognerait au mur des politiques RLS, et le raccourci qui se présenterait est le
premier de la liste des quatre failles à chercher en priorité — la clé
`service_role` posée côté client.

### Ce qui a été fait, l'après-midi même

La voie recommandée a été suivie sans dévier. Deux Edge Functions,
`admin-vue-globale` et `admin-creer-collecteur`, tenant le même dispositif :

1. Un jeton est exigé. Sans lui, `401`.
2. `est_admin()` est appelée **avec le jeton de l'appelant**, jamais avec la clé
   de service. Interroger `admins` avec la clé de service répondrait à une autre
   question et laisserait passer un jeton révoqué.
3. Seulement ensuite la clé de service sort — côté serveur, jamais livrée.

Et un second verrou, indépendant du premier : `admin_vue_globale()` porte
`revoke all from public / anon / authenticated`, avec un bloc de garde qui fait
échouer la migration si un `create or replace` ultérieur réattribuait les droits
par défaut. Un administrateur ne peut donc pas appeler la fonction directement
depuis la console de son navigateur ; il doit passer par l'Edge Function, qui
est le seul endroit où le portillon vit.

Vérifié en production le 2026-08-20 :

```
sans jeton                      401  UNAUTHORIZED_NO_AUTH_HEADER
clé anon comme jeton            403  VERIFICATION_IMPOSSIBLE
fonction SQL appelée par anon   401  42501 permission denied for function
création de collecteur, anon    403  VERIFICATION_IMPOSSIBLE
collecteurs après la sonde      2 lignes — aucun compte intrus créé
```

`verifier:bundles` continue de répondre « Aucune fuite de clé de service dans
les artefacts » sur les trois paquets construits.

### Une correction à mon propre compte rendu

Le commit de câblage annonce « les six écrans lisent la base ». **C'était cinq
sur six.** `EncaisserMise` est resté une maquette entière, avec un client nommé,
un cycle et un solde qui n'existaient nulle part.

L'écran n'a pas été câblé, et ne le sera pas : le cahier des charges §11 pose
que l'argent est manié par le collecteur, pas par la plateforme. Une mise saisie
depuis un bureau n'aurait pas d'espèces en face, et fausserait le rapprochement
de caisse du collecteur — qui compare chaque soir `cash_declare` à
`cash_attendu`. La base défend déjà cette règle : la politique d'insertion sur
`mises` exige `collecteur_id = auth.uid()`. L'écran dit désormais cela, au lieu
d'afficher des chiffres inventés.

---

## 🟡 4. Des commandes inertes dans les trois applications

Trouvé en vérifiant les deux écrans ci-dessus, par un balayage de tous les
`<button>` sans `onClick` ni `disabled`. Ce n'est pas une faille, mais c'est de
la même famille que les chiffres inventés : **l'interface affirme quelque chose
qui n'est pas vrai**, et l'utilisateur qui s'en aperçoit cesse de la croire
ailleurs.

Cinq trouvées, cinq traitées :

| Où | Quoi | Traitement |
|---|---|---|
| `packages/ui/BarreHaute` | **aucun `onClick` du tout** | le composant ne pouvait rien déclencher ; `onActiver` ajouté, `disponible` déduit de sa présence |
| `admin/EncaisserMise` | « Retirer ce client » | écran remplacé par la raison de son indisponibilité |
| `collecteur/Clients` | « Filtrer » | retiré — les pastilles en dessous filtraient déjà |
| `ui/Bandeaux` | « Voir les offres → » | désactivé, avec sa raison en infobulle |
| `site/Tarifs` | « Essai gratuit », modes de paiement | le premier mène au formulaire, le second devient un vrai sélecteur |

Le cas de `BarreHaute` mérite d'être retenu : le composant portait un champ
`disponible` documenté et respecté à l'affichage, mais **aucun gestionnaire de
clic**. Toutes ses actions étaient mortes, y compris celles déclarées
disponibles. `disponible` se déduit désormais de la présence d'un `onActiver`,
ce qui rend un bouton actif sans effet impossible à écrire.

### Une incohérence de modèle sur la page publique

L'arbitrage tarifaire du 2026-08-20 a retenu le modèle du cahier §5 — le client
payant est un collecteur. Les prix affichés sur la page de vente ont suivi
aussitôt, puisqu'ils viennent de `@kolek/core`. Mais son formulaire demandait
encore « Nom de l'organisation » et « Responsable ».

C'est la pire forme d'incohérence : une page qui vend à un collecteur en lui
demandant le nom de son organisation. Les champs décrivent désormais un
collecteur — nom, téléphone, courriel, marché.

---

---

## Ce qui reste ouvert depuis hier

Rien de neuf, rappelé pour que ce rapport se suffise :

1. ~~**`Prevent use of leaked passwords` désactivé**~~ — **fait le 2026-08-20**,
   dans la journée. Le durcissement le plus rentable des deux rapports a coûté
   une case à cocher.
2. ~~**Longueur minimale à 8**~~ là où `config.toml` déclare 10 — **portée à 10
   le 2026-08-20**, dans le même geste et au tableau de bord, jamais par
   `supabase config push` qui aurait écrasé `site_url`.

   Les deux sont **déclarés**, pas mesurés : `/auth/v1/settings` ne publie pas la
   politique de mot de passe, et c'est le bon comportement. Le filtre HIBP admet
   toutefois une sonde non destructrice via `admin-creer-collecteur` ; elle est
   décrite dans le rapport d'hier, section « 2. Mots de passe ».
3. **Jeton de session dans `localStorage`** — comportement par défaut de
   `supabase-js`, risque bas tant que la CSP reste ce qu'elle est. Revérifié
   aujourd'hui : aucun `innerHTML`, `dangerouslySetInnerHTML`, `eval` ni
   `new Function` dans `apps/` ni `packages/`.

---

## Les 20 contrôles

| № | Contrôle | Verdict | Preuve du 2026-08-20 |
|---|---|---|---|
| 1 | Cacher les clés API | conforme | seuls `apps/*/.env.example` sont suivis par git |
| 2 | Purger les secrets de l'historique | conforme | historique complet balayé : 4 correspondances, toutes des leurres de test (`sb_secret_AbCdEf123456`, signature `.x`) |
| 3 | Clé publique côté client | conforme | les deux jetons livrés portent `role=anon` (charge utile décodée, clé jamais affichée) |
| 4 | Row Level Security | conforme | RLS active sur les 9 tables ; 16 politiques, toutes en `= auth.uid()` |
| 5 | Chiffrer les données sensibles | non applicable | aucun secret applicatif stocké ; pas de données de paiement |
| 6 | Authentification côté serveur | conforme | `est_admin()` en `SECURITY DEFINER`, `REVOKE ALL FROM PUBLIC` puis `GRANT` au seul rôle `authenticated` |
| 7 | Accès par enregistrement | conforme | politiques par ligne **plus** clé étrangère composite `cartes_client_du_meme_collecteur (client_id, collecteur_id)` — une carte ne peut pointer un client d'autrui |
| 8 | Champs sensibles verrouillés | **🟡 partiel** | `palier`, `abonnement_statut`, `abonnement_echeance` hors liste blanche : un collecteur ne peut pas s'auto-promouvoir. Mais `clients` et `collecteurs` sont modifiables **sans journal** — constat 1 |
| 9 | Sessions | reconduit 🟡 | `localStorage`, par défaut ; CSP compensatoire vérifiée |
| 10 | Hachage des mots de passe | conforme | délégué à GoTrue, jamais manipulé par le code |
| 11 | Limiter les tentatives | conforme | `429 over_request_rate_limit` à la 33ᵉ tentative, en 17 s, sur adresse inexistante |
| 12 | Anti-bot | non applicable | inscription fermée — `disable_signup: true`, mesuré |
| 13 | Requêtes SQL paramétrées | conforme | un seul `EXECUTE format()` dans tout le schéma, dans `rls_auto_enable()`, sur `object_identity` issu de `pg_event_trigger_ddl_commands()` — jamais d'entrée utilisateur ; `search_path` figé à `pg_catalog` |
| 14 | Valider les entrées | conforme | 13 contraintes `CHECK` en ligne, dont les 10 bornes de longueur d'hier |
| 15 | Échapper le contenu | conforme | zéro `innerHTML` / `dangerouslySetInnerHTML` / `eval` / `new Function` |
| 16 | Restreindre les uploads | **🟡 à préparer** | aucun bucket n'existe ; `photo_url` ouvert mais inaffichable — constat 2 |
| 17 | Épurer les réponses | conforme | l'app collecteur nomme ses colonnes (`select('id, nom, marche')`), aucun `select('*')` |
| 18 | Headers de sécurité | conforme | les 7 présents sur les 3 cibles ; CSP sans `unsafe-inline` sur `script-src` |
| 19 | Forcer HTTPS | conforme | `301` vers `https://` sur les 3 domaines ; HSTS `max-age=31536000; includeSubDomains; preload` |
| 20 | Scanner les dépendances | conforme | `npm audit` : `found 0 vulnerabilities` |

Sur les 9 fonctions `SECURITY DEFINER` du schéma, **9 portent un `search_path`
explicite**. Le rôle `anon` ne détient que `GRANT USAGE ON SCHEMA public` —
aucun droit sur aucune table. `admins` et `audit_log` n'ont ni politique ni
`GRANT` : inaccessibles à `authenticated` par construction.

---

## Méthode

Ce qui a produit les trois constats, dans l'ordre où ça a marché :

1. **Extraction du schéma distant** plutôt que lecture des migrations. Le rapport
   de la veille avait établi que le dépôt et la plateforme divergent en quatre
   endroits ; partir du dump supprime la question.
2. **Croisement des `GRANT` de colonnes avec la liste des déclencheurs.** C'est
   ce croisement seul qui produit le constat 1 : la liste blanche dit exactement
   quelles colonnes bougent, la liste des déclencheurs dit lesquelles sont
   tracées, et la différence tient en deux tables.
3. **Croisement de la contrainte `photo_url` avec la CSP servie et l'inventaire
   des buckets.** Trois faits corrects séparément, incohérents ensemble.
4. **Inventaire des appels à la base dans `apps/admin`**, qui donne 1 — et change
   la lecture de tout l'écran admin.

Chaîne complète rejouée aujourd'hui : 63 tests base sur pile locale, 55 tests
application, 22 tests de scripts, build des trois applications,
`verifier:theme`, `verifier:bundles`, `verifier:en-ligne`. Tout vert.
