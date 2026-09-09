# Kolek

SaaS de gestion pour banquiers ambulants — Abidjan, Côte d'Ivoire.
Éditeur : GSM Technologie Cyber Shop (GTCS).

L'argent reste du cash manié par le collecteur. La plateforme ne gère que des
registres — voir `Docs/Kolek Cahier de charges consolide.md` §11.

## Structure

| Dossier | Contenu |
|---|---|
| `Docs/` | Cahier de charges, Design System, spécifications et plans |
| `packages/core/` | Moteur de calcul, formatage FCFA, paliers tarifaires, tokens du Design System |
| `packages/ui/` | Composants partagés par les trois applications |
| `supabase/` | Migrations, Edge Functions, tests de base |
| `apps/collecteur/` | PWA terrain, hors-ligne d'abord |
| `apps/admin/` | Dashboard de pilotage GTCS |
| `apps/site/` | Site public — grille tarifaire et formulaire d'ouverture de compte. Aucune session, mais il **poste** vers `demander-ouverture` |

## Démarrer

Prérequis : Node 26+, Docker en marche.

```bash
npm install
npm run db:start          # démarre Supabase en local (Docker)
npm run db:reset          # applique toutes les migrations
npm run db:env            # extrait les clés locales pour les tests

cp apps/collecteur/.env.example apps/collecteur/.env   # y coller les clés locales
cp apps/admin/.env.example apps/admin/.env
cp apps/site/.env.example apps/site/.env

npm run dev -w @kolek/collecteur
npm run dev -w @kolek/admin
npm run dev -w @kolek/site      # le .env est requis : gardeEnv() lève sans lui
```

### Si `npm run db:start` échoue localement

Sur certaines machines, `npx supabase start` échoue avec une
`LegacyHealthCheckTimeoutError` et le conteneur de logs `vector` boucle en
crash. Si c'est le cas, démarrer seulement les services nécessaires aux
migrations et aux tests, en ignorant le health check :

```bash
npx supabase start --exclude realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,postgres-meta,mailpit --ignore-health-check
```

## Tests

```bash
npm test               # moteur de calcul, formatage, paliers, composants
npm run test:scripts   # garde-fous d'outillage
npm run test:db        # contraintes, idempotence, immuabilité, isolation RLS
npm run verifier       # tout ce qui précède, plus thème, build et fuite de clé
```

`npm run verifier` réinitialise la base locale. C'est la seule commande à lancer
avant de pousser : elle échoue si un artefact de build manque, plutôt que de
contrôler ce qui reste d'un build précédent.

## Règles à ne pas contourner

- Montants en entiers FCFA. Jamais de flottant, jamais de centimes.
- Le solde restituable n'est jamais stocké : `(mises encaissées − 1) × mise`.
- Les mises et les retraits sont append-only. Ne pas ajouter de politique
  `update` ou `delete` sur ces tables.
- `caisses_jour.cash_attendu` n'est jamais écrit par le collecteur : il se
  calcule depuis les mises et se recalcule à chaque mise datée du jour. Un
  rapprochement de caisse dont le contrôlé écrit les deux termes ne contrôle
  rien.
- Tout ce que le serveur décide se refuse aussi au niveau du privilège de
  colonne, pas seulement au niveau de RLS — qui ne sait pas filtrer par colonne.
  Un `grant` de table sur une table qui a des champs serveur est un défaut.
- Le Dashboard Admin vérifie `est_admin()` avant d'afficher quoi que ce soit.
  Une session valide n'est pas une autorisation : un collecteur en possède une.
- Aucune valeur visuelle en dur : tout vient de `packages/core/src/tokens.ts`.
- Aucun champ de saisie sous 16 px — `text-champ`, jamais `text-base` ni plus
  petit. Sous ce seuil, Safari sur iPhone zoome la page dès qu'on touche le
  champ, et il n'existe aucun attribut pour l'en empêcher.
  `npm run verifier:champs` le contrôle sur les trois applications.
- Un import inutilisé est une **erreur** de lint, pas un avertissement. C'est
  la forme qu'avait le défaut du 2026-09-09 : `gardeEnv` importé dans le
  `vite.config.ts` du collecteur sans jamais être posé dans `plugins`. `oxlint`
  sort à zéro sur un avertissement — l'escalade est ce qui rend l'étape utile.
- **Les tests de base ne tournent que contre la pile locale.** La suite utilise
  la clé de rôle service — RLS contournée — et vide des tables entières entre
  deux tests. `process.loadEnvFile` n'écrase pas une variable déjà posée dans le
  shell : un `SUPABASE_URL` exporté fait donc viser la production malgré un
  `.env.test` juste. `supabase/tests/charger-env.ts` refuse toute cible qui
  n'est pas une adresse de bouclage.
- Chaque application a un `.env.example` qui déclare exactement les variables
  `VITE_` que son code lit — ni moins, ni plus. `npm run verifier:exemples-env`.
- Les couleurs du manifeste PWA sont comparées à `tokens.ts`, pas relues.
  `npm run verifier:manifeste`. Elles vivent hors de toute feuille de style et
  ne réapparaissent que dans un artefact engendré.
- Aucune fonction `security definer` ne vit en production sans être écrite dans
  une migration. `npm run verifier:derive` — lecture seule, contre le projet
  lié, donc à lancer à la main comme `verifier:migrations`. Il existe parce que
  `verifier:migrations` ne compare que la **présence des versions** : le
  2026-09-09 il rendait « aucune migration inconnue », vrai, pendant que la
  production portait `public.rls_auto_enable()` que le dépôt ne crée nulle part.
- La clé de service ne quitte jamais le serveur. `npm run verifier:bundles`
  le contrôle à chaque build.
