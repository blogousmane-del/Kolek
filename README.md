# Kolek

SaaS de gestion pour banquiers ambulants — Abidjan, Côte d'Ivoire.
Éditeur : GSM Technologie Cyber Shop (GTCS).

L'argent reste du cash manié par le collecteur. La plateforme ne gère que des
registres — voir `Docs/Kolek Cahier de charges consolide.md` §11.

## Structure

| Dossier | Contenu |
|---|---|
| `Docs/` | Cahier de charges, Design System, spécifications et plans |
| `packages/core/` | Moteur de calcul, formatage FCFA, tokens du Design System |
| `supabase/` | Migrations, Edge Functions, tests de base |
| `apps/collecteur/` | PWA terrain, hors-ligne d'abord |
| `apps/admin/` | Dashboard de pilotage GTCS |

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
npm test              # moteur de calcul et formatage
npm run test:db       # contraintes, idempotence, immuabilité, isolation RLS
npm run verifier:j1   # les cinq vérifications du jalon J1
```

## Règles à ne pas contourner

- Montants en entiers FCFA. Jamais de flottant, jamais de centimes.
- Le solde restituable n'est jamais stocké : `(mises encaissées − 1) × mise`.
- Les mises et les retraits sont append-only. Ne pas ajouter de politique
  `update` ou `delete` sur ces tables.
- Aucune valeur visuelle en dur : tout vient de `packages/core/src/tokens.ts`.
- La clé de service ne quitte jamais le serveur. `npm run verifier:bundles`
  le contrôle à chaque build.
