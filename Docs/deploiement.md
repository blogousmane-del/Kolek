# Kolek — Déploiement

> Procédure de mise en ligne : un projet Supabase distant, deux sites Netlify.
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

Les six migrations s'appliquent dans l'ordre. Les deux dernières contiennent
chacune un bloc de contrôle : la première échoue si `TRUNCATE`, `REFERENCES` ou
`TRIGGER` restent accordés à `anon` ou `authenticated`, la seconde si une
colonne rendue au serveur redevient écrivable par le collecteur. Si le cloud
accorde ces privilèges autrement que le local, `db push` le dira au lieu de le
taire.

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

Deux sites distincts sur le même dépôt, conformément au dossier stratégique §2.4.
Chacun lit le `netlify.toml` de son répertoire de base.

| Site | Répertoire de base | Fichier lu |
|---|---|---|
| `kolek-collecteur` | `apps/collecteur` | `apps/collecteur/netlify.toml` |
| `kolek-admin` | `apps/admin` | `apps/admin/netlify.toml` |

Le déploiement continu depuis git suppose un dépôt distant. Le dépôt est
aujourd'hui purement local — il faudra le pousser sur GitHub, ou déployer au
départ par `npx netlify deploy --prod` depuis le poste.

**Variables d'environnement**, à régler sur chaque site :

```
VITE_SUPABASE_URL      = https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY = <clé anonyme du projet>
```

**Content-Security-Policy à resserrer.** Les deux `netlify.toml` autorisent
`connect-src https://*.supabase.co` parce que la référence du projet n'était pas
connue à leur écriture. Une fois le projet créé, remplacer le joker par
`https://<ref>.supabase.co` dans les deux fichiers — c'est un `sed`, et ça évite
qu'une application compromise puisse parler à n'importe quel projet Supabase.

> La clé de service ne va sur **aucun** des deux sites. Elle ne vit que dans les
> Edge Functions. `npm run verifier:bundles` échoue si elle atteint un artefact,
> mais ce garde-fou ne protège que du code — il ne protège pas d'une variable
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
   vérifiable dans les outils de développement du navigateur.
5. **La Content-Security-Policy ne casse rien.** `netlify.toml` n'est appliqué
   ni par `vite preview` ni par les tests : la politique n'a jamais tourné
   ailleurs qu'en production. Ouvrir la console sur les deux sites et vérifier
   l'absence de violation CSP — les points sensibles sont les fontes servies
   depuis l'origine (`@fontsource`, sous-ensemble latin), la largeur des jauges
   d'avancement posée en attribut `style`, l'enregistrement du service worker,
   et les appels vers Supabase. Le thème n'en est plus un : depuis le passage à
   Tailwind, c'est une feuille statique et non une injection JavaScript.
6. **La PWA s'installe** depuis l'URL réelle, en HTTPS : manifeste détecté,
   service worker enregistré. Le service worker ne fonctionne qu'en contexte
   sécurisé, donc c'est le premier test qui a du sens hors du local.
7. **Les comptes de test sont supprimés** du projet de production avant le pilote.

---

## Ce que le déploiement ne fait pas

Il ne rend pas le produit vendable. Un collecteur qui ouvre l'application y
trouve un écran de connexion et une liste vide — la collecte arrive en J2.

Ce déploiement sert à trois choses : constater les écarts de plateforme pendant
qu'ils coûtent une demi-journée, avoir une URL à montrer, et faire du déploiement
une opération routinière plutôt qu'un événement redouté en fin de projet.

---

*Kolek — procédure de déploiement · 2026-08-16.*
