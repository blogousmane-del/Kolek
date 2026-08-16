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

Les cinq migrations s'appliquent dans l'ordre. La dernière contient un bloc de
contrôle qui échoue si `TRUNCATE`, `REFERENCES` ou `TRIGGER` restent accordés à
`anon` ou `authenticated` — donc si le cloud accorde ces privilèges autrement
que le local, `db push` le dira au lieu de le taire.

---

## 2. Durcissement — à faire dans le tableau de bord Supabase

`supabase/config.toml` ne pilote que la pile locale. Ces réglages-là se font sur
le projet distant, et **le projet ne doit pas hériter des défauts de la CLI**.

| Réglage | Défaut CLI | À mettre | Pourquoi |
|---|---|---|---|
| Inscription ouverte | activée | **désactivée** | Le trigger `on_auth_user_created` provisionne un locataire en essai 30 jours à chaque inscription. Ouverte, n'importe qui crée des comptes à volonté. En Phase 1, c'est GTCS qui crée les comptes collecteurs. |
| Confirmation d'email | désactivée | **activée** | Sans elle, un compte se crée sur une adresse qu'on ne possède pas. |
| Longueur de mot de passe | 6 | **10 minimum** | Le compte donne accès à l'épargne de dizaines de commerçants. |
| API GraphQL publique | exposée | **désactivée** | Seconde surface d'API sur les mêmes tables, inutilisée par le produit. RLS s'y applique, ce n'est donc pas une brèche — mais une surface qu'on n'utilise pas est une surface à fermer. |
| `max_rows` | 1000 | à conserver | Contrainte de conception, pas un réglage à contourner : les écrans d'historique de J2 doivent paginer. |

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
   aucun `TRUNCATE`/`REFERENCES`/`TRIGGER` pour `anon` ni `authenticated`.
2. **L'isolation tient en distant.** Créer deux collecteurs de test et rejouer
   les six tentatives d'intrusion contre le projet réel.
3. **Les applications se connectent** et n'embarquent que la clé anonyme —
   vérifiable dans les outils de développement du navigateur.
4. **La PWA s'installe** depuis l'URL réelle, en HTTPS : manifeste détecté,
   service worker enregistré. Le service worker ne fonctionne qu'en contexte
   sécurisé, donc c'est le premier test qui a du sens hors du local.
5. **Les comptes de test sont supprimés** du projet de production avant le pilote.

---

## Ce que le déploiement ne fait pas

Il ne rend pas le produit vendable. Un collecteur qui ouvre l'application y
trouve un écran de connexion et une liste vide — la collecte arrive en J2.

Ce déploiement sert à trois choses : constater les écarts de plateforme pendant
qu'ils coûtent une demi-journée, avoir une URL à montrer, et faire du déploiement
une opération routinière plutôt qu'un événement redouté en fin de projet.

---

*Kolek — procédure de déploiement · 2026-08-16.*
