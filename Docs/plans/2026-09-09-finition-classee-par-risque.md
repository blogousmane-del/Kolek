# Finition — les points restants, classés par risque sur les données réelles

**But :** fermer ce que les audits des 3 et 9 septembre ont laissé ouvert, dans
un ordre dicté par une seule question — *est-ce que ce geste peut abîmer les
données des collecteurs en activité ?*

**Origine :** [audit de santé du 2026-09-09](../audits/2026-09-09-audit-sante-du-depot.md)
(un 🟠 et neuf 🟡 restants) et
[vérification de l'audit du 3 septembre](../audits/2026-09-09-verification-audit-du-3-septembre.md)
(deux migrations écrites, non déployées ; un constat de scalabilité rendu
visible mais non réparé).

**La contrainte qui gouverne l'ordre.** Des collecteurs travaillent en ce moment
sur la base de production. Les mises et les retraits y sont ajout-seul et
irréversibles. Un plan qui range les tâches par difficulté ou par satisfaction
range mal : on classe ici par **ce que le geste peut détruire**, et on descend.

---

## Le classement

| Zone | Ce que le geste touche | Points |
|---|---|---|
| 🔴 **Rouge** | Peut détruire des données réelles | A |
| 🟠 **Orange** | Modifie la base de production, volontairement | B |
| 🟡 **Jaune** | Modifie le code servi, pas les données | C, D, E, F |
| 🟢 **Vert** | Ne touche rien de vivant | G, H, I, J, K |

---

## 🔴 → ✅ A — La suite de tests n'a aucune garde sur sa cible

**Ce qui a été mesuré.** `supabase/tests/charger-env.ts` appelle
`process.loadEnvFile('supabase/tests/.env.test')`. Cette fonction **n'écrase
pas** une variable déjà présente dans l'environnement — vérifié en direct :

```
$ SUPABASE_URL=https://production.supabase.co node -e \
    "process.loadEnvFile('.env.test'); console.log(process.env.SUPABASE_URL)"
https://production.supabase.co
```

`npm run db:env` réécrit pourtant `.env.test` depuis `supabase status`, qui est
local par construction. Le fichier est juste. Il perd contre le shell.

**Ce que ça coûte.** `supabase/tests/avis-drainage.test.ts:141`, dans un
`beforeEach`, donc avant **chaque** test du fichier :

```ts
await admin.from('avis_clients').delete().not('id', 'is', null);
```

`admin` porte `SUPABASE_SERVICE_ROLE_KEY` : RLS est contournée, et
`not id is null` désigne toutes les lignes. Contre la production, cette ligne
vide `avis_clients` pour tous les collecteurs.

**Ce qu'on ne corrige pas.** Le test. Son balayage est global parce que la
réservation qu'il éprouve l'est — le borner par collecteur invaliderait ce
qu'il prouve. Les autres suppressions du harnais sont déjà bornées (`.eq`,
`.like`, `.in`) ; les deux autres `delete` non bornés sont sans danger, l'un
passant par le client anonyme pour vérifier que RLS le refuse.

**Ce qu'on corrige.** L'absence d'assertion sur la cible. Un garde-fou qui
refuse de lancer la suite contre autre chose que la pile locale.

**Liste d'autorisation, cette fois — et c'est l'inverse du garde-fou `.env.bak`
du même jour, à dessein.** On énumère le petit ensemble fermé. Pour les copies
de `.env`, le petit ensemble fermé était celui des suffixes de sauvegarde, et
les noms légitimes étaient sans limite. Ici c'est l'inverse : les adresses
locales se comptent sur une main, les adresses distantes sont sans limite. La
règle constante n'est pas « toujours refuser » ni « toujours autoriser », c'est
**énumérer le côté qui est fini**.

**Fini quand** un `SUPABASE_URL` distant fait échouer la suite avant le premier
`beforeEach`, avec un message qui nomme l'adresse trouvée.

## 🟠 B — Les deux migrations de sécurité ne sont pas en ligne

> **Les deux contrôles préalables sont faits. Voir « Avant-vol » en bas.**

Elles vivent dans la branche et dans la base locale. En production, à cette
minute : `abonnement_ouvre_droit` reste un oracle, et les trois fonctions
`security definer` restent accordées à `PUBLIC`.

**Ce qui doit précéder le déploiement, et qui n'est pas fait :**

1. `npm run verifier:migrations` — la base distante porte-t-elle les 46
   migrations d'avant ? La passe de révocation est **dynamique** : elle referme
   ce qu'elle trouve ouvert le jour où elle s'applique. Si la production a
   dérivé — une fonction créée à la main, un droit accordé hors migration — elle
   révoquera aussi sur celle-là. C'est le comportement voulu, mais il faut le
   savoir avant, pas après.
2. Relire les deux sites d'appel de `abonnement_ouvre_droit` **sur la
   production**, pas en local. `create or replace` sur une fonction que deux
   policies consultent : si l'une d'elles passait autre chose que
   `(select auth.uid())` là-bas, le resserrage fermerait l'ouverture de client.

Les deux demandent des identifiants de production que cette session n'a pas.
**La décision de pousser appartient à l'exploitant, pas à ce plan.**

## 🟡 → ✅ C — Trois Edge Functions d'administration sans aucun test

`admin-avis`, `admin-modifier-collecteur`, `admin-reglages` — nommées dans zéro
des 64 fichiers de `supabase/tests/`. Leur portillon est relu et correct.
Deux d'entre elles **écrivent** : le collecteur modifié, et les réglages de la
plateforme. Un portillon juste et non testé reste juste jusqu'à la première
modification.

**Fini quand** chacune a au moins le triptyque des autres : refus sans jeton,
refus avec un jeton non-admin, acceptation avec un jeton admin.

## 🟡 → ✅ D — Le poids d'installation, mesuré puis borné

> **Le titre de ce point était faux.** « Un seul morceau de JavaScript par
> application » ne décrit pas le dépôt : les trois `vite.config.ts` portent
> `manualChunks: decouperLib`, et `dist/` du collecteur contient bien trois
> morceaux. Le 565/158 cité plus bas était le **total après découpage**, pas la
> taille d'un morceau unique.

### Ce qui est réellement téléchargé à la première installation

Mesuré le 2026-09-10 sur une reconstruction complète — les empreintes du
collecteur sont ressorties identiques, donc la mesure porte bien sur le code
courant.

| Entrée préchargée | Brut | Compressé |
|---|---|---|
| `lib-supabase-H6RbKBY9.js` | 208 116 o | 53 226 o |
| `lib-react-DzH5Pu2p.js` | 189 605 o | 58 838 o |
| `index-nNqJp2EB.js` | 170 655 o | 45 127 o |
| `index-BcWeCpco.css` | 58 914 o | 10 442 o |
| `index.html`, `registerSW.js`, deux icônes, le manifeste | le reste | |
| **Total — 9 entrées** | **652 486 o** | **188 941 o** |

**Les polices n'y sont pas.** Le CSS les demande à la charge, et le navigateur
ne prend que le `woff2` de chaque graisse. Le double jeu `woff`/`woff2` ne coûte
donc rien à l'installation — c'était l'économie que je suis allé chercher en
premier, et elle n'existe pas.

### Ce que le découpage sert, et ce qu'il ne sert pas

Le commentaire de `apps/collecteur/vite.config.ts` le dit déjà et il a raison :
le service worker précharge **tout**, donc passer les écrans lourds en
`import()` ne retire pas un octet à la première installation. Le découpage sert
les **mises à jour** — un morceau dont l'empreinte n'a pas changé n'est pas
retéléchargé — et React comme `supabase-js` ne bougent qu'aux montées de
version.

### Le seul gain matériel restant, et pourquoi il n'est pas pris

`supabase-js` embarque son client `realtime`. Vérifié : **aucun écran du produit
n'ouvre de canal** — ni `.channel(`, ni `removeChannel`, ni `storage`. Le
paquet `@supabase/realtime-js` pèse 101 772 o de source, soit de l'ordre de 12 à
14 ko compressés dans le paquet servi — **environ 7 % du poids d'installation**.

L'enlever demande d'abandonner `createClient` et d'assembler `auth-js` et
`postgrest-js` à la main. Ça touche l'authentification d'un produit qui porte
l'épargne de dizaines de commerçants, pour 7 %. Le rapport n'y est pas.

**Ce qui rouvrirait le sujet :** une montée de version de `supabase-js` qui rend
`realtime` optionnel, ou un besoin produit qui fasse doubler `index.js`. Pas
avant.

## 🟡 E — `SuperAdmin.tsx`, 1 634 lignes

> **Le filet est posé. Le découpage reste à décider — voir en bas.**

Plus du double du deuxième fichier du dépôt. ~~Aucun test ne le nomme.~~ Faux :
`SuperAdmin.test.tsx` fait 644 lignes et couvre huit de ses parties.

## 🟡 → ✅ F — La pagination de la liste clients

Le bandeau posé aujourd'hui dit la troncature ; il ne la répare pas. Au-delà de
mille clients, un collecteur voit un avertissement et rien d'autre. Demande de
décider ce que devient la recherche — locale aujourd'hui, donc incapable de
trouver ce que le serveur n'a pas envoyé.

**Réglé en deux fois, et les deux moitiés ne se remplacent pas.**

*Le chargement*, d'abord : `apps/collecteur/src/pagination.ts` épuise les pages
jusqu'au bout, les quatre lectures du bilan comprises. La troncature à mille
lignes est fermée, et le bandeau est devenu un recoupement — le serveur dit
combien il possède, l'écran compare à ce qu'il a reçu. On le garde parce qu'un
contrôle qui ne peut plus rien attraper est exactement celui qu'on retire la
veille du jour où il aurait servi.

*La restitution*, ensuite : `packages/ui/src/Pagination.tsx` découpe la liste
déjà en mémoire, cinquante lignes à la fois. Ce n'est pas la même pagination et
elle ne remplace pas la première — le collecteur travaille hors ligne, et une
pagination qui demanderait la page suivante au réseau ne rendrait rien au
marché. Ce qu'elle gagne est le rendu : mille deux cents clients ne font plus
mille deux cents lignes dans le document sur un téléphone d'entrée de gamme.

**La question laissée ouverte trouve sa réponse dans l'ordre des deux
opérations.** On filtre, *puis* on découpe. L'inverse donnerait un écran qui a
l'air de marcher et qui ment : la recherche ne porterait plus que sur les
cinquante lignes dessinées, et le collecteur conclurait qu'un client inscrit ne
l'est pas — c'est-à-dire le défaut même que le bandeau surveille, rentré par la
porte de derrière et sans bandeau pour le dire. Les trois listes qui ont une
recherche portent chacune un test qui garde cet ordre : une ligne de la
troisième page doit remonter.

Branchée sur six listes. Une côté collecteur, `Clients` ; cinq côté
administration, `EncoursSoldes`, `Collecteurs`, `Abonnements`, `Demandes` et les
abonnés du Super Admin.

Cinq d'entre elles sont bornées par ailleurs — cinq cents cartes côté serveur,
quelques dizaines de comptes payants créés à la main — et n'afficheront donc
rien avant longtemps. On les pagine quand même : « borné par le modèle
d'affaires » est une hypothèse commerciale et non une contrainte technique, et
elle tombe le jour où l'entreprise réussit. La sixième, `Demandes`, n'est bornée
par personne : elle est alimentée par le formulaire public de la vitrine.

## 🟢 → ✅ G — Le README envoie le nouveau venu dans le mur

`apps/site/.env.example` n'existe pas ; le README affirme que la vitrine ne
parle à aucune API, alors que son formulaire poste nom, téléphone, courriel,
zone, palier et mot de passe vers `demander-ouverture`. `gardeEnv()` est posé
sur la vitrine et lève dans le hook `config` — un clone neuf qui suit le README
à la lettre ne démarre pas.

## 🟢 → ✅ H — Les couleurs hors du système

Cinq entrées sur neuf dans `packages/ui/src/ActionsRapides.tsx` mélangent
jetons et hexadécimaux en dur. `apps/collecteur/vite.config.ts` déclare
`background_color: '#FBFAF6'` — le jeton `paper`, supprimé le 2026-09-04.
L'écran de démarrage de l'application installée est donc la dernière surface du
produit peinte dans une couleur que le Design System ne connaît plus.
`apps/site/src/styles.css` porte `#ffffff` là où `surface` existe.

## 🟢 → ✅ I — Les comptes périmés dans les commentaires

`verification.yml` annonce 366 tests et treize fonctions ; il y en a ~726 et
vingt. Le raisonnement de chaque commentaire reste juste, et c'est lui qui
compte — mais un nombre invérifiable finit par faire douter du paragraphe.

## 🟢 J — Aucun plan ni spécification pour le travail des 4 au 6 septembre

`Docs/plans/` et `Docs/specs/` s'arrêtaient au 2026-09-02 avant ce fichier.

## 🟢 K — `npm test` à la racine est instable sur ce poste

Cinq espaces de travail en parallèle affament les workers vitest. Ce n'est pas
un défaut du code. À savoir avant d'aller chercher un bogue qui n'existe pas.

---

## Ordre d'exécution

1. **A** — le garde-fou de cible. Rien d'autre ne devrait tourner avant.
2. **G, H, I** — le vert, mécanique et sans risque, pendant que B attend une
   décision.
3. **C** — les trois portillons non testés.
4. **B** — sur décision de l'exploitant, après `verifier:migrations`.
5. **D, E, F** — chantiers à part entière, à ouvrir chacun avec son plan.
   **F est fait** — voir sa section, réglé en deux moitiés qui ne se remplacent
   pas. **D est fermé le 2026-09-10** — mesuré, borné, et le seul gain
   restant écarté avec son chiffre. **E reste ouvert.**

---

## Ce qui a été fait, et ce que ça a trouvé

Chaque garde-fou écrit ici a d'abord été **vu échouer sur le vrai dépôt**. C'est
la leçon de l'erreur d'ACL du matin : une vérification qui rend « rien » ne
prouve rien tant qu'on ne l'a pas vue trouver quelque chose.

| Point | Garde-fou | Ce qu'il a trouvé à son premier passage |
|---|---|---|
| A | `scripts/garde-base-locale.mjs` | Refus mesuré sur une cible distante, avant le premier `beforeEach` |
| C | `supabase/tests/portillons-admin.test.ts` | **`admin-vue-globale` ne contrôlait aucune méthode** — un `DELETE` traversait et repartait avec les chiffres de la plateforme, en `200` |
| G | `scripts/verifier-exemples-env.mjs` | `apps/site/.env.example` absent |
| H | `scripts/verifier-manifeste.mjs` | `background_color: '#FBFAF6'`, jeton supprimé cinq jours plus tôt |

**Décision prise sur H** (palette) : étendre plutôt que réduire. Deux familles
fonctionnelles — `ardoise` et `ocre` — entrent dans `tokens.ts`, et le Design
System écrit la frontière avec l'or de marque. Ramener les neuf boutons aux cinq
jetons sémantiques aurait rendu *Retrait* et *Bilan* identiques sur l'écran que
le collecteur utilise toute la journée.

## Ce qui reste, et pourquoi

- **B** — les deux migrations de sécurité, en attente d'une décision
  d'exploitation et de `verifier:migrations`.
- **D, E, F** — chantiers à part entière.
- **Le test intermittent `avis-drainage`.** Reproduit deux fois, jamais seul.
  Trois hypothèses écartées **par la mesure** : une seule signature dans
  `pg_proc` ; l'appel direct par PostgREST honore la borne ; la tâche `pg_cron`
  d'une minute sort sur `SECRETS_ABSENTS` tant que le coffre est vide, et il
  l'est. La cause reste inconnue. Aucun correctif n'a été posé — le test capture
  désormais l'état de la file, pour que la prochaine occurrence livre la preuve
  au lieu d'une hypothèse de plus.

---

## Avant-vol du point B — fait le 2026-09-09, en lecture seule

Deux commandes, aucune écriture : `supabase migration list --linked` et
`supabase db dump --linked --schema public`.

### 1. La production n'a pas dérivé au niveau des versions

```
2 migration(s) versionnée(s) et non appliquée(s) :
  - 20260909120000_abonnement_ouvre_droit_borne.sql
  - 20260909130000_definers_fermes_a_anon.sql
```

Exactement les deux nouvelles, et **zéro migration inconnue** — la base ne porte
rien que le dépôt ignore. Ce contrôle ne voit toutefois que la présence, pas le
contenu ; c'est le dump qui a levé le reste.

### 2. Le resserrage de `abonnement_ouvre_droit` ne peut rien fermer

Les deux seuls sites d'appel, lus **sur la production** :

```sql
CREATE POLICY "clients_insert" … WITH CHECK ((collecteur_id = (SELECT auth.uid()))
                                  AND abonnement_ouvre_droit((SELECT auth.uid())))
CREATE POLICY "cartes_insert"  … WITH CHECK (… même forme …)
```

`p_collecteur = auth.uid()` y est vrai par construction. Aucun troisième site.

### 3. Le constat du 3 septembre est confirmé en ligne

Aucune ligne `REVOKE … FROM PUBLIC` pour `journaliser_admin`,
`paiements_immuables` ni `paiements_naissance` dans le dump : `EXECUTE` y est
resté au défaut, donc ouvert à `PUBLIC`. Ce n'était pas qu'un état local.

### 4. Une dérive réelle, qu'aucun audit n'avait vue

47 fonctions `security definer` de chaque côté, et l'écart n'est pas nul :

| | |
|---|---|
| En production seulement | **`rls_auto_enable`** |
| En local seulement | `definers_exposes` (ma migration, non déployée) |

`rls_auto_enable()` rend `event_trigger` et active RLS sur toute table créée
dans `public`. Elle **n'est dans aucune migration du dépôt**. La passe dynamique
ne filtre pas sur le type de retour : elle la touchera.

**Mesuré plutôt que supposé**, sur une réplique locale jetable :

```
avant  : =X/postgres | postgres=X/postgres | service_role=X/postgres  → table créée, RLS = t
revoke all … from public, anon
après  : postgres=X/postgres | service_role=X/postgres                → table créée, RLS = t
```

Révoquer `EXECUTE` à `PUBLIC` ne casse pas un déclencheur d'événement. Le
`=X/postgres` de tête est le droit `PUBLIC` — la forme même qu'une recherche sur
le nom d'un rôle ne voit pas, et qui a produit l'erreur du matin.

**Conclusion : les deux migrations peuvent partir.** Ce qui reste est une
décision d'exploitation — le moment — et non une inconnue technique.

**À décider à part :** `rls_auto_enable` devrait
rejoindre une migration. Une fonction qui vit en production sans être dans le
dépôt est invisible à toute relecture, et le prochain `db reset` d'une base de
travail ne la recrée pas.

---

## 🟠 → ✅ B — Déployé le 2026-09-09

`npx supabase db push --linked --skip-vault --yes`, après un `--dry-run` qui a
rendu `"seeds":[]` et `"roles":[]` — les deux migrations et rien d'autre.

**`--skip-vault` n'était pas dans la commande demandée.** L'aide du CLI porte
une ligne qu'aucun de nos documents ne mentionnait : *« Vault secrets from
config.toml are updated before migrations unless `--skip-vault` is set. »* Le
drainage SMS de production lit `kolek_url`, `kolek_cle_service` et
`kolek_secret_drainage` dans ce coffre. `[db.vault]` est commenté dans
`config.toml`, donc rien n'aurait été écrasé — mais « d'après ma lecture du
fichier » est exactement la forme de raisonnement qui a produit l'erreur d'ACL
du matin. Le drapeau ne coûte rien si la lecture est juste, et protège la
passerelle si elle ne l'est pas.

### État vérifié après coup, sur le schéma de production re-extrait

| Contrôle | Résultat |
|---|---|
| `verifier:migrations` | « La base distante porte toutes les migrations du dépôt. » |
| `abonnement_ouvre_droit` | Corps borné à `(select auth.uid())`, commentaire à jour |
| `REVOKE … FROM PUBLIC` | 44 → **49** |

Les cinq ajouts, et aucune perte :

```
+ journaliser_admin, paiements_immuables, paiements_naissance   (les trois du 3 septembre)
+ rls_auto_enable                                               (la dérive, mesurée sans risque)
+ definers_exposes                                              (neuve, créée déjà refermée)
```

Le garde-fou interne de la seconde migration lève si une seule fonction reste
atteignable. La migration s'est appliquée sans erreur : il a donc passé, et
c'est cette absence d'erreur qui prouve l'état, pas le message de fin.

**Sans effet sur les applications en ligne.** `abonnement_ouvre_droit` n'est
appelée par aucune Edge Function ni par aucun écran — vérifié par recherche sur
`supabase/functions` et `apps`, où seuls deux commentaires la nomment. Ses deux
seuls consommateurs sont les policies `clients_insert` et `cartes_insert`, qui
lui passent `(select auth.uid())` : un collecteur à jour continue d'ouvrir des
clients et des cartes exactement comme avant.

**Le dépôt n'a pas été fusionné ni poussé.** Les migrations sont en base, le
code reste sur la branche. Rien n'a été déployé côté Edge Functions.

---

## 🟡 F — Fait en partie, et le reste est nommé

### Fermé

- **`Clients.tsx`** — les deux requêtes épuisent leurs pages. La seconde,
  `cartes`, se tronquait aussi et **rien ne pouvait le voir** : le comptage posé
  la veille ne portait que sur `clients`. Un collecteur au-delà de mille cartes
  aurait vu des clients dépourvus des leurs.
- **`chargerBilan()`** — ses quatre lectures. C'est celle qui comptait le plus :
  le bilan **somme de l'argent**, et une troncature n'y casse rien visiblement,
  elle rend un total plus petit que la réalité. Trente jours à cinquante
  encaissements par jour font mille cinq cents lignes de `mises`.

### Le dessin retenu, et pourquoi

Tout charger, pas paginer à l'écran. Le collecteur travaille **hors ligne** et
sa recherche filtre le tableau déjà chargé : une pagination à l'écran irait
demander au serveur ce que le collecteur n'a pas, c'est-à-dire rien, dans un
marché sans réseau.

`order('id')` avant `range` partout — une pagination sur un ordre non total peut
rendre deux fois la même ligne et en sauter une autre. `nom` n'est pas unique.

### Ce qui reste, et ce qu'il ne faut pas croire

Un balayage heuristique signale une vingtaine d'autres lectures sans borne dans
`lectures-ecrans.ts`, `lectures.ts` et `ecritures.ts`. **Cette liste n'est pas
exploitable telle quelle** : elle a signalé à tort les trois lectures du bilan
qui venaient d'être paginées, parce que le `.range()` tombait hors de sa fenêtre
de trois lignes. Beaucoup des autres sont naturellement bornées par un `.eq()`
sur un seul client.

Chaque site demande donc un jugement : *cette table peut-elle dépasser mille
lignes pour un collecteur, et que se passe-t-il si elle le fait ?* Le balayage
sert à ouvrir la liste, pas à la clore :

```
grep -rn "\.from('\(mises\|cartes\|clients\|retraits\)'" apps/collecteur/src
```

**Ordre suggéré, par conséquence :** ce qui affiche de l'argent d'abord
(`chargerRapprochement`, `chargerRecus`), puis ce qui compte
(`chargerProfil`, `chargerEtatAvis`), puis le reste.

Le corriger d'un coup n'était pas raisonnable : les treize requêtes concernées
sont simulées dans sept fichiers de test dont les faux imitent la chaîne courte.
Les changer toutes en une fois aurait produit une vague d'échecs sans rapport
avec le défaut, et un lot qu'on ne peut plus relire.

---

## 🟡 E — Le filet avant le découpage

Le découpage n'a **pas** été fait, et c'est délibéré. L'ordre juste est
l'inverse de celui qu'on prend d'instinct : déplacer 1 634 lignes sans filet,
c'est espérer que rien ne bouge sur l'écran d'administration de la plateforme.

### Ce que l'audit disait de travers

« Aucun test ne le nomme directement. » Le constat venait d'une recherche du
nom du fichier dans les tests — or `SuperAdmin.test.tsx` le rend par import.
644 lignes, 30 tests, huit parties couvertes. **Je l'ai répété sans vérifier
avant d'ouvrir le fichier.**

### Ce qui manquait vraiment

Le **filtrage des abonnés** : la seule logique de décision du fichier, sans
aucun test. Neuf posés, dont ceux qui tiennent les frontières :

| Ce qui est figé | Pourquoi ça casse en silence |
|---|---|
| `> 7` jours pour « Actif », `<= 7` pour « Expirant » | Sept jours pile bascule ; un `>=` à la place d'un `>` resterait vert |
| Deux heures de plus font passer d'« Expirant » à « Actif » | La frontière est éprouvée des **deux** côtés |
| « Suspendu » ramasse aussi `expire` | Deux statuts en base, un filtre à l'écran |
| La recherche ne mord qu'à **trois** caractères | Perdre le seuil ne casse rien de visible : le tableau se met à sauter dès la première lettre |

Ce sont des tests de **caractérisation** : ils passent dès l'écriture. Ce n'est
pas un défaut, c'est leur objet — ils ne cherchent pas un bogue, ils fixent le
comportement d'aujourd'hui. Un test qui passe du premier coup ne prouve rien sur
le code, seulement sur ce qu'on vient d'écrire, et le dire évite de le prendre
pour ce qu'il n'est pas.

### Trouvé en les écrivant, corrigé en TDD

Les quatre boutons de filtre ne se distinguaient que par leur couleur. Au
lecteur d'écran, ils étaient identiques : rien ne disait sur quel sous-ensemble
d'abonnés portait le tableau. `aria-pressed` le dit sans rien changer à l'œil.

### Ce qui reste à décider

Le découpage lui-même. Les seams sont nets — dix sous-composants internes, tous
déjà couverts sauf `OngletAbonnements`, qui l'est maintenant. Un fichier par
onglet suivrait la structure existante.

**Écart relevé au passage, non corrigé :** l'écran client du collecteur filtre
dès le premier caractère, l'admin à partir du troisième. Les deux se défendent
— le premier travaille sur une liste courte et locale, le second sur un tableau
dense. Mais rien n'indique que l'écart soit voulu plutôt que subi.
