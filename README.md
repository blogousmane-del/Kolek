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
| `apps/site/` | Site public — grille tarifaire. Aucune session, aucune donnée |

## Démarrer

Prérequis : Node 26+, Docker en marche.

```bash
npm install
npm run db:start          # démarre Supabase en local (Docker)
npm run db:reset          # applique toutes les migrations
npm run db:env            # extrait les clés locales pour les tests

cp apps/collecteur/.env.example apps/collecteur/.env   # y coller les clés locales
cp apps/admin/.env.example apps/admin/.env

npm run dev -w @kolek/collecteur
npm run dev -w @kolek/admin
npm run dev -w @kolek/site      # aucun .env : le site ne parle à aucune API
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
- La clé de service ne quitte jamais le serveur. `npm run verifier:bundles`
  le contrôle à chaque build.
