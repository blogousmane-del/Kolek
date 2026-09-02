# Audit de sécurité — Kolek, après le déploiement des collaborateurs

**Date :** 2026-09-02, en fin de journée · **Périmètre :** dépôt au commit
`bf762c9`, **base de production interrogée en direct**, base locale
`supabase_db_Kolek` pour le détail des catalogues, sites mesurés sur
`kolek.cash`, `app.kolek.cash` et `admin.kolek.cash`.

> Dixième passage des vingt contrôles, et le premier qui tombe **après** une
> mise en production. Le neuvième, du matin même (commit `180c4b3`), laissait
> quatre points en ⚪️ non vérifié. Trois sont fermés ici, et par la mesure, pas
> par le raisonnement.
>
> Ce qui a été livré entre les deux : 53 fichiers, 9 336 lignes — les
> collaborateurs du forfait Illimité, trois Edge Functions, six migrations —
> puis le déploiement de tout cela sur le projet distant.

**Conflit d'intérêts, déclaré.** Ce rapport audite du code que j'ai écrit
aujourd'hui. Un auteur qui se relit voit ce qu'il a voulu écrire. Les constats
ci-dessous s'appuient donc sur des mesures — catalogues interrogés, requêtes
réelles contre la production, tests exécutés — et non sur la lecture du code par
son auteur. Les deux endroits où je n'ai qu'une lecture à offrir sont marqués
comme tels.

**Verdict : SAIN, avec un déploiement à moitié fait et une échéance dépassée.**
Aucun constat rouge. La surface ouverte cette semaine — une colonne de
rattachement, deux fonctions de lecture d'équipe, trois Edge Functions — n'a
élargi aucune policy, et cela se mesure. Le point qui demande une décision reste
le même depuis le 25 août : `envoyer-avis` ne vérifie aucun appelant.

| | Nombre |
|---|---|
| 🔴 Bloquant | 0 |
| 🟠 Important | 1 (inchangé, échéance dépassée) |
| 🟡 À faire | 6 |
| ⚪️ Non vérifié | 1 |

---

## Ce que ce passage ferme

Trois des quatre ⚪️ du neuvième audit tombent, mesurés :

| Point laissé ouvert le matin | Ce qui a été mesuré depuis |
|---|---|
| **La clé publiable contre la production.** Le classificateur avait refusé la boucle `curl`, et l'audit ne pouvait affirmer que le local. | Passée. `collecteurs`, `mises`, `audit_log`, `admins` interrogées sur `yfnwmokxkznejotgpfgf.supabase.co` avec la clé publiable : **`42501` sur les quatre.** Le refus vient du privilège, avant que RLS n'entre en jeu. |
| **L'autorisation au niveau des Edge Functions.** 40 tests sur 484 n'avaient jamais tourné — le moteur Edge local ne servait pas. | Fermé, et pour une raison banale : **le conteneur était éteint.** `Exited (255)` depuis 23 heures. Rallumé, les 8 suites passent. La suite de base est à **528 verts sur 528**, dont les 12 des deux nouvelles fonctions. |
| **L'écart entre les migrations et la base de production.** Tout ce qui était « mesuré » l'avait été en local. | Fermé deux fois : les sept migrations en retard ont été poussées, et `npm run verifier:migrations` — écrit aujourd'hui — répond désormais *« La base distante porte toutes les migrations du dépôt. »* |

Le quatrième, la limite Auth de la plateforme, reste ⚪️ : elle se lit dans le
tableau de bord Supabase, et rien dans le dépôt ne peut l'affirmer.

**Ce que les 40 tests réveillés ont trouvé.** Ils n'ont pas seulement passé.
Deux défauts réels sont tombés au premier lancement de
`collecteur-creer-collaborateur` :

- la borne d'abus était clavetée sur l'**adresse IP** (`empreinteRequete`, un
  helper dont l'en-tête dit lui-même qu'il sert « un appelant public »), sur une
  route où l'appelant est authentifié. Trois titulaires derrière un même relais
  — cybercafé, 4G partagée, c'est ce marché — partageaient un quota de trois
  créations par heure ;
- elle était consommée **avant** la validation du corps, donc trois adresses mal
  tapées coûtaient une heure d'attente sans qu'aucun compte n'existe.

Corrigés en `a9b717f`. Ils n'auraient été trouvés par aucune relecture : il
fallait exécuter.

---

## 🟠 À corriger

### 1. `envoyer-avis` ne vérifie toujours aucun appelant — contrôle n°6

**Où :** `supabase/functions/envoyer-avis/index.ts`

Ouvert le 2026-08-25, redit le 28, redit le matin du 2026-09-02, **inchangé ce
soir**. Le fichier n'a pas bougé ; le constat de l'audit du 28 le décrit
exactement et n'est pas recopié ici.

Ce qui a changé, c'est l'échéance. L'audit du 28 la fixait : « avant que les
identifiants de la passerelle n'arrivent, pas après ». La passerelle SMS est
arrivée, et le déploiement de ce soir met en production six migrations et trois
fonctions — sans toucher à celle-là. La branche `avis-drainage-ferme` existe,
vide, créée ce matin puis mise de côté à la demande de l'exploitant pour traiter
une capture d'écran.

**La décision est simple :** ou bien la fermer, ou bien écrire pourquoi elle
reste ouverte. Trois audits qui répètent la même phrase sans que rien ne bouge
finissent par apprendre au lecteur à sauter ce paragraphe.

---

## 🟡 Durcissement

- **Le déploiement est à moitié fait — nouveau.** Le schéma et les trois Edge
  Functions sont en production ; **les trois sites servent encore la
  construction d'avant la fusion.** Mesuré : `npm run verifier:en-ligne` refuse
  les trois cibles sur la fraîcheur des artefacts, deux fois à dix minutes
  d'intervalle. `npx netlify status` répond « session expirée », donc l'état des
  constructions n'a pas pu être lu d'ici.

  Le sens de l'écart est le sens sûr — le schéma en avance, jamais l'inverse —
  mais il a une conséquence visible aujourd'hui : un collecteur dont
  l'abonnement n'est pas `actif` ne peut plus ajouter de client depuis que
  `20260902110000` est passée, et l'application déployée lui répond encore
  *« Tu n'as pas le droit d'écrire cette ligne »* au lieu de la phrase qui
  explique. **À déclencher depuis le tableau de bord Netlify.**

- **`journaliser_admin` et `grouper_milliers` restent exécutables par PUBLIC.**
  Inchangé depuis le 2026-09-02 matin. Les seules deux fonctions de `public`
  dans ce cas, sur 40 `security definer` — mesuré. `journaliser_admin` rend
  `trigger` : PostgREST refuse de l'exposer et PostgreSQL refuse l'appel direct.
  `grouper_milliers` n'est pas `security definer` et ne lit aucune donnée. À
  révoquer par hygiène.

- **Téléphones en clair.** Inchangé. Le chiffrement applicatif casserait
  l'envoi ; le sujet est le cloisonnement.

- **Session dans `localStorage`.** Défaut de `supabase-js`, inchangé, sans
  vecteur sous cette CSP.

- **Borne publique par IP seulement, pour les deux routes publiques.**
  `demander-ouverture` et `mot-de-passe-oublie` comptent toujours sur
  `x-forwarded-for` — et c'est correct pour elles : leur appelant n'a pas de
  nom. Un attaquant distribué passe. Aucun CAPTCHA.

- **`apps/admin/.env.prod.bak` traîne encore.** Ignoré par git, ne contient que
  l'URL et la clé publiable. À supprimer.

---

## ⚪️ Non vérifié

- **La limite Auth de la plateforme** (tentatives de connexion par heure). Elle
  se règle et se lit dans le tableau de bord Supabase ; aucun élément du dépôt
  ne permet de l'affirmer. Reporté pour la troisième fois.

---

## Ce qui est vérifié et sain

**La surface ouverte cette semaine n'a élargi aucune policy.** C'était la
décision structurante de la conception, et elle se mesure plutôt qu'elle ne se
raconte :

```
collecteurs_select | SELECT | id = auth.uid()
collecteurs_update | UPDATE | id = auth.uid()   (with check identique)
```

Deux policies, inchangées. Un titulaire ne lit pas les lignes de son
collaborateur par PostgREST : il passe par `equipe_vue()`, qui décide elle-même
qui appelle. `isolation.test.ts` tient les six chemins croisés, **y compris
entre un titulaire et son collaborateur**, et passe.

**Les colonnes que le serveur décide restent hors de portée.** `authenticated`
n'a d'`UPDATE` que sur `nom`, `telephone`, `zone` — mesuré dans
`information_schema.column_privileges`. `titulaire_id` est **lisible et non
écrivable** : un collecteur ne peut ni se rattacher, ni se détacher, ni
rattacher quelqu'un. `palier`, `abonnement_statut`, `abonnement_echeance` :
inatteignables, comme avant.

**Les colonnes neuves du chemin de l'argent ne sont pas écrivables non plus.**
Sur `mises`, `authenticated` peut insérer `id`, `carte_id`, `collecteur_id`,
`montant`, `encaisse_le` — et rien d'autre : `encaisse_par` est posée par le
déclencheur. Sur `retraits`, `authenticated` n'a **aucun** privilège
d'insertion : un retrait ne naît que par Edge Function.

**Les déclencheurs d'immuabilité sont bien rallumés.** `20260902120000` les
désactive le temps de remplir deux colonnes sur des lignes existantes. Mesuré
après coup : `mises_immuables` et `retraits_immuables` sont `actif` tous les
deux. C'est le contrôle qui manquerait le plus si la migration s'était arrêtée
en son milieu.

**Les 40 fonctions `security definer` de `public` portent toutes `pg_temp` en
dernier.** Zéro exception — mesuré, pas déduit. Sept d'entre elles ont été
réécrites cette semaine ; `search-path.test.ts` est le filet qui l'a tenu à
chaque fois.

**Les trois Edge Functions touchées cette semaine — deux neuves, une modifiée —
vérifient l'appelant avant de sortir la clé de service.** `getUser()` d'abord, clé de service ensuite, propriété de la carte
enfin. `collecteur-creer-collaborateur` ajoute un portillon à quatre conditions
— palier Illimité, abonnement actif, pas de titulaire soi-même, place restante —
et le déclencheur `collecteurs_valider_rattachement` reste la dernière barrière,
côté base. *Lecture, appuyée sur 12 tests exécutés ce soir.*

**Les trois routes neuves répondent `401` sans jeton, en production** — elles
rendaient `404` il y a une heure.

**Le chiffre d'affaires ne compte plus une équipe comme quatre abonnements**, et
le garde-fou de la migration échoue si la correction se perd à la prochaine
recopie de la vue.

**RLS active sur les 14 tables, aucune policy en `using (true)`, aucun
`TRUNCATE`/`REFERENCES`/`TRIGGER` pour `anon` ni `authenticated`** — mesuré.

**`npm audit --omit=dev` : 0 vulnérabilité.**

---

## Les 20 contrôles

| # | Contrôle | Statut | Note |
|---|---|---|---|
| 1 | Clés API cachées | ✅ | Aucune clé secrète dans le code |
| 2 | Secrets purgés de Git | ✅ | Inchangé |
| 3 | Bonne clé côté client | ✅ | Inchangé |
| 4 | Row Level Security | ✅ | 14 tables sur 14, aucune `using (true)`. Mesuré |
| 5 | Chiffrement des données sensibles | 🟡 | Téléphones en clair — nécessaires à l'envoi |
| 6 | Autorisation côté serveur | 🟠 | 13 fonctions vérifient l'appelant avant la clé de service : les 10 d'hier, les 2 neuves, et `collecteur-cloturer-carte` qui n'y recourait pas avant. `envoyer-avis` ne vérifie rien |
| 7 | Verrouillage par enregistrement | ✅ | Six chemins croisés tenus, titulaire ↔ collaborateur compris |
| 8 | Champs non modifiables | ✅ | GRANT de colonne. `titulaire_id` lisible, non écrivable ; `encaisse_par` posée par le serveur |
| 9 | Cookies de session | 🟡 | `localStorage`, sans vecteur sous cette CSP |
| 10 | Mots de passe hachés | ✅ | Délégué à Supabase Auth |
| 11 | Rate limiting | 🟠→🟡 | Les deux routes publiques bornées par IP ; `creer-collaborateur` bornée **par titulaire** depuis `a9b717f`. La limite Auth reste au défaut de la plateforme (⚪️) |
| 12 | Protection anti-bot | 🟡 | Aucun CAPTCHA |
| 13 | Requêtes paramétrées | ✅ | Aucune concaténation SQL |
| 14 | Validation des entrées | ✅ | Inchangé, plus `validerCollecteur` sur la route neuve |
| 15 | Échappement du contenu | ✅ | Zéro `dangerouslySetInnerHTML` |
| 16 | Uploads restreints | ⚪️ | Non applicable : aucun bucket |
| 17 | Réponses API épurées | ✅ | Inchangé |
| 18 | Headers de sécurité | ✅ | Mesurés en production ce soir |
| 19 | HTTPS forcé | ✅ | Inchangé |
| 20 | Dépendances scannées | ✅ | 0 vulnérabilité |

---

## Ce que cet audit dit de la méthode, et pas du code

Deux choses se sont répétées aujourd'hui, et elles valent d'être écrites parce
qu'elles se répéteront.

**Ce qui n'est pas exécuté n'est pas vérifié.** 40 tests étaient déclarés
« environnementaux » depuis des jours. Ils ne l'étaient pas : un conteneur était
éteint. Une fois rallumé, ils ont trouvé deux défauts réels en une minute, dont
un qui aurait bloqué de vrais collecteurs derrière un même relais. Un test qui
ne tourne pas n'est pas un test, c'est une intention.

**Ce qui n'est pas mesuré n'est pas su.** Le neuvième audit disait « l'écart
entre les migrations et la base de production » sans pouvoir le chiffrer. Cet
écart valait sept migrations, et c'est un collecteur devant un client qui l'a
signalé, en lisant « Le serveur refuse ce montant ». La commande qui répond à
cette question existe depuis ce soir, et elle prend huit secondes.

---

*Kolek — dixième passage des vingt contrôles · 2026-09-02, après déploiement.*
