# Kolek — Déploiement

> Procédure de mise en ligne : un projet Supabase distant, trois sites Netlify.
> À faire une fois, avant J2 — pas après. Les défauts de la plateforme distante
> ne sont pas ceux du local, et on l'a déjà constaté en J1 sur les privilèges.

---

## Pourquoi maintenant, sur des coquilles vides

Déployer une application vide prend une demi-journée. Découvrir les mêmes écarts
avec une application complète en coûte plusieurs.

L'audit du 2026-08-16 en a donné deux exemples concrets :

- Les nouvelles tables ne sont plus exposées automatiquement à l'API de données.
  Le comportement local et le comportement cloud ont divergé en cours de route,
  et les migrations ont dû acquérir des `GRANT` explicites.
- `anon` et `authenticated` conservaient `TRUNCATE`, `REFERENCES` et `TRIGGER` —
  un privilège dormant que seule une interrogation des catalogues révélait.

Rien ne garantit que le projet distant se comporte comme le conteneur local. La
seule façon de le savoir est d'y appliquer les migrations et de refaire l'audit.

---

## Ce qui demande ton compte

Deux commandes à lancer toi-même. Elles ouvrent ton navigateur et stockent tes
accès dans ton profil utilisateur ; aucun secret n'a besoin de transiter par une
conversation.

```bash
npx supabase login
npx netlify login
```

---

## 1. Projet Supabase

**Région.** Abidjan n'a pas de région Supabase. La plus proche en latence est
Paris (`eu-west-3`), puis Francfort (`eu-central-1`) et Londres (`eu-west-2`).
Paris par défaut.

**Création et liaison.**

```bash
npx supabase projects create kolek-prod --region eu-west-3
npx supabase link --project-ref <ref-du-projet>
```

**Application du schéma.**

```bash
npx supabase db push
```

Les sept migrations s'appliquent dans l'ordre. Les trois dernières portent
chacune un bloc de contrôle qui fait échouer la migration plutôt que de laisser
passer :

- `..._socle_revoquer_privileges_implicites` échoue si `TRUNCATE`, `REFERENCES`
  ou `TRIGGER` restent accordés à `anon` ou `authenticated` ;
- `..._durcissement_audit` échoue si une colonne rendue au serveur redevient
  écrivable par le collecteur ;
- `..._socle_privileges_liste_blanche` compare les privilèges réellement en
  vigueur à une liste blanche exacte, et échoue **dans les deux sens** — un
  privilège en trop comme un privilège attendu et absent. Elle vérifie aussi
  qu'aucun `ALTER DEFAULT PRIVILEGES` ne subsiste pour ces deux rôles, sans quoi
  la prochaine table créée rouvrirait silencieusement ce qu'on vient de fermer.

Si le cloud accorde ces privilèges autrement que le local, `db push` le dira au
lieu de le taire. C'est le seul contrôle de cette procédure qui s'exécute sans
qu'on ait à y penser.

---

## 2. Durcissement — à faire dans le tableau de bord Supabase

`supabase/config.toml` ne pilote que la pile locale. Ces réglages-là se font sur
le projet distant, et **le projet ne doit pas hériter des défauts de la CLI**.

Depuis l'audit du 2026-08-16, `config.toml` porte néanmoins la même posture que
la production, et la pile locale tourne avec. Ce n'est pas de la décoration :
c'est la seule façon de découvrir ici, plutôt qu'en distant, qu'un réglage casse
quelque chose. Elle en a déjà fait tomber un — voir la note sous le tableau.

| Réglage | Défaut CLI | À mettre | Pourquoi |
|---|---|---|---|
| `[auth] enable_signup` | activé | **désactivé** | Le trigger `on_auth_user_created` provisionne un locataire en essai 30 jours à chaque inscription. Ouvert, n'importe qui crée des comptes à volonté. En Phase 1, c'est GTCS qui crée les comptes collecteurs, par l'API d'administration — que ce réglage ne bride pas. |
| Confirmation d'email | désactivée | **activée** | Sans elle, un compte se crée sur une adresse qu'on ne possède pas. |
| Longueur de mot de passe | 6 | **10 minimum** | Le compte donne accès à l'épargne de dizaines de commerçants. |
| API GraphQL publique | exposée | **désactivée** | Seconde surface d'API sur les mêmes tables, inutilisée par le produit. RLS s'y applique, ce n'est donc pas une brèche — mais une surface qu'on n'utilise pas est une surface à fermer. |
| `max_rows` | 1000 | à conserver | Contrainte de conception, pas un réglage à contourner : les écrans d'historique de J2 doivent paginer. |

> **Le piège de `[auth.email] enable_signup`.** Malgré son nom, ce réglage-là
> n'est pas « inscription par email » mais « fournisseur email activé ». À
> `false`, GoTrue répond `Email logins are disabled` et **plus personne ne se
> connecte** — les cinquante tests de base tombent d'un coup. La fermeture des
> inscriptions passe uniquement par `[auth] enable_signup`. Sur le tableau de
> bord Supabase, vérifier qu'on ferme bien *Allow new users to sign up* et pas
> le fournisseur *Email* lui-même.

**Sauvegardes.** Vérifier que les sauvegardes automatiques sont actives. C'est
l'épargne réelle de commerçants ; l'exigence de sauvegarde du cahier §7 ne se
satisfait pas d'un défaut supposé.

---

## 3. Sites Netlify

Trois sites distincts sur le même dépôt, conformément au dossier stratégique
§2.4. Chacun lit le `netlify.toml` de son répertoire de base.

| Site | Répertoire de base | Fichier lu | Public visé |
|---|---|---|---|
| `kolek-collecteur` | `apps/collecteur` | `apps/collecteur/netlify.toml` | Collecteurs, sur le terrain |
| `kolek-admin` | `apps/admin` | `apps/admin/netlify.toml` | GTCS et gérants |
| `kolek-site` | `apps/site` | `apps/site/netlify.toml` | Public — grille tarifaire |

Le dossier stratégique n'en prévoyait que deux : les deux applications. Le site
public est venu après, avec les maquettes de tarifs. Il ne partage avec elles que
`@kolek/ui` et `@kolek/core` — aucun compte, aucune session, aucune donnée.

**Déploiement continu.** Le dépôt est désormais sur GitHub
(`blogousmane-del/Kolek`, branche `main`) : les trois sites peuvent y être
branchés directement, plutôt que déployés à la main par
`npx netlify deploy --prod`. Le dépôt est **public** : rien de secret ne doit y
entrer, et `npm run verifier:bundles` ne contrôle que les artefacts, pas les
sources.

Un piège de monorepo à connaître avant de brancher : quand un répertoire de base
est réglé, Netlify décide de reconstruire ou non en regardant si ce répertoire a
changé. Or les trois sites dépendent de `packages/ui` et `packages/core`. Une
correction faite dans un paquet partagé ne touche aucun des trois répertoires de
base, et **aucun site ne se reconstruit** — les trois restent sur l'ancienne
version sans que rien ne signale l'écart. Le correctif est une commande `ignore`
par site, qui déclenche aussi sur les paquets :

```toml
[build]
  ignore = "cd ../.. && git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- apps/site packages"
```

À poser dans les trois `netlify.toml`, chacun avec son propre chemin
d'application. Sans quoi le premier symptôme sera un écran corrigé en local qui
reste cassé en ligne.

**Variables d'environnement.** Uniquement sur les deux applications :

```
VITE_SUPABASE_URL      = https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY = <clé anonyme du projet>
```

`kolek-site` n'en prend aucune. Il ne parle à aucune API — sa page de tarifs est
statique et son formulaire de paiement est délibérément inerte, faute de
partenaire agréé (cahier §11). Lui donner une clé, même anonyme, serait exposer
un secret sans usage.

**Content-Security-Policy à resserrer.** Les `netlify.toml` des deux
applications autorisent `connect-src https://*.supabase.co` parce que la
référence du projet n'était pas connue à leur écriture. Une fois le projet créé,
remplacer le joker par `https://<ref>.supabase.co` dans ces deux fichiers-là —
c'est un `sed`, et ça évite qu'une application compromise puisse parler à
n'importe quel projet Supabase.

Celui de `apps/site` est déjà au plus strict : `connect-src 'self'`, sans
exception Supabase. Il ne bouge que le jour où le tunnel de commande s'adresse à
un partenaire de paiement — et ce jour-là, vers l'origine exacte de ce
partenaire, pas vers un joker.

L'absence de `X-Robots-Tag: noindex` sur `apps/site` est délibérée : c'est la
surface commerciale, elle a vocation à être indexée. Elle n'est en revanche pas
délibérée sur `apps/collecteur`, qui n'en porte pas non plus — voir le point 7
de la vérification.

> La clé de service ne va sur **aucun** des trois sites. Elle ne vit que dans les
> Edge Functions. `npm run verifier:bundles` échoue si elle atteint un artefact —
> il contrôle les trois `dist`, et refuse de passer si l'un d'eux manque, pour
> qu'un site oublié ne soit jamais confondu avec un site propre. Mais ce
> garde-fou ne protège que du code : il ne protège pas d'une variable
> d'environnement mal nommée saisie à la main dans une interface.

---

## 4. Vérification après déploiement

Le déploiement n'est pas terminé tant que ces points ne sont pas constatés sur
l'environnement distant, pas sur le local.

1. **Le schéma est bien celui attendu.** Rejouer l'audit des privilèges sur le
   projet distant : RLS active sur les neuf tables, politiques identiques,
   aucun `TRUNCATE`/`REFERENCES`/`TRIGGER` pour `anon` ni `authenticated`, et
   aucun privilège d'écriture sur les colonnes que le serveur décide —
   `caisses_jour.cash_attendu`, `clients.id`, `clients.cree_le`,
   `synchro_rejets.cree_le`, `synchro_rejets.traite` à l'insertion. Les deux
   migrations de durcissement portent chacune un bloc de contrôle qui échoue
   plutôt que de laisser passer, donc `db push` le dira de lui-même.
2. **L'isolation tient en distant.** Créer deux collecteurs de test et rejouer
   les six tentatives d'intrusion contre le projet réel.
3. **Le portillon admin tient.** Se connecter au Dashboard avec un compte
   collecteur : il doit afficher « Accès réservé », pas le tableau de bord.
4. **Les applications se connectent** et n'embarquent que la clé anonyme —
   vérifiable dans les outils de développement du navigateur. Sur `kolek-site`,
   la vérification est inverse : aucune variable `VITE_SUPABASE_*` ne doit
   apparaître dans le paquet, puisque le site n'en reçoit aucune.
5. **La Content-Security-Policy ne casse rien.** `netlify.toml` n'est appliqué
   ni par `vite preview` ni par les tests : la politique n'a jamais tourné
   ailleurs qu'en production. Ouvrir la console sur les trois sites et vérifier
   l'absence de violation CSP — les points sensibles sont les fontes servies
   depuis l'origine (`@fontsource`, sous-ensemble latin), la largeur des jauges
   d'avancement posée en attribut `style`, l'enregistrement du service worker,
   et les appels vers Supabase. Le thème n'en est plus un : depuis le passage à
   Tailwind, c'est une feuille statique et non une injection JavaScript. Sur
   `kolek-site`, la politique est plus serrée que celle des applications, donc
   c'est celle qui a le plus de chances de casser quelque chose : y regarder les
   fontes, et le fait qu'aucune requête sortante ne parte de la page de tarifs.
6. **La PWA s'installe** depuis l'URL réelle, en HTTPS : manifeste détecté,
   service worker enregistré. Le service worker ne fonctionne qu'en contexte
   sécurisé, donc c'est le premier test qui a du sens hors du local. Ne concerne
   que les deux applications : `kolek-site` est une page, pas une application
   installable.
7. **L'indexation est celle qu'on veut.** `kolek-site` doit être indexable — pas
   de `X-Robots-Tag` — et `kolek-admin` porte bien `noindex, nofollow`.
   `kolek-collecteur` n'en porte aucun aujourd'hui : ce n'est pas une brèche,
   la page d'accueil est un écran de connexion, mais c'est une incohérence avec
   l'administration. À trancher avant le pilote, pas à découvrir dans un
   résultat de recherche.
8. **Les comptes de test sont supprimés** du projet de production avant le pilote.

---

## Ce que le déploiement ne fait pas

Il ne rend pas le produit vendable. Un collecteur qui ouvre l'application y
trouve un écran de connexion et une liste vide — la collecte arrive en J2.

Le site public trompe davantage, et c'est le risque qu'il faut voir avant de
mettre son URL sur une carte de visite : il affiche des prix, des boutons de
souscription et un formulaire de paiement, et **aucun des trois ne fait quoi que
ce soit**. Il n'y a pas de tunnel de commande, et il ne peut pas y en avoir tant
que le paiement ne passe pas par un partenaire agréé (cahier §11). Deux
conséquences pratiques : les montants affichés engagent commercialement dès la
première visite alors que la grille n'est pas arbitrée (voir
`packages/core/src/paliers.ts`), et un visiteur qui tente de payer n'obtient
rien. Publier ce site à une adresse connue avant d'avoir tranché ces deux points
est une décision commerciale, pas une étape technique.

Ce déploiement sert à trois choses : constater les écarts de plateforme pendant
qu'ils coûtent une demi-journée, avoir une URL à montrer, et faire du déploiement
une opération routinière plutôt qu'un événement redouté en fin de projet.

---

*Kolek — procédure de déploiement · 2026-08-16, révisée le 2026-08-17
(troisième site, dépôt GitHub).*
