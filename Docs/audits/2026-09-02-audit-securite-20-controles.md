# Audit de sécurité — Kolek

**Date :** 2026-09-02 · **Périmètre :** dépôt au commit `180c4b3`, base locale
`supabase_db_Kolek` interrogée en direct, en-têtes de `kolek.cash` mesurés en
production.

> Neuvième passage des vingt contrôles. Les huit précédents sont dans ce même
> dossier ; le dernier date du 2026-08-28, commit `65f631c`. Ce document ne
> refait pas leur travail : il remesure, et il regarde surtout **ce qui a été
> ajouté depuis** — 69 fichiers, 8 504 lignes, dont un sous-système
> super-admin entier, une passerelle SMS et le déplafonnement des mises.

**Verdict : PRÊT À LANCER, une correction dont l'échéance est probablement
arrivée.** Aucun constat rouge. Le seul point important est celui que l'audit
du 25 août a ouvert et que celui du 28 a redit mot pour mot — `envoyer-avis`
ne vérifie aucun appelant. L'audit du 28 fixait l'échéance : « avant que les
identifiants de la passerelle n'arrivent, pas après ». Depuis, la passerelle a
reçu 418 lignes de test et un diagnostic d'identifiants né d'un vrai `401` du
30 août. C'est le seul élément de ce rapport qui demande une décision cette
semaine.

| | Nombre |
|---|---|
| 🔴 Bloquant | 0 |
| 🟠 Important | 1 vérifié · 1 reporté sans revérification |
| 🟡 À faire | 6 |
| ⚪️ Non vérifié | 4 |

---

## Ce qui a changé depuis le 2026-08-28

| Ajout | Ce que l'audit en dit |
|---|---|
| Sous-système super-admin (3 Edge Functions, 4 fonctions SQL, journal des consultations) | **Sain.** Le portillon partagé vérifie le jeton de l'appelant par `est_super_admin()` **avant** de sortir la clé de service, et pose `x-kolek-acteur` pour l'imputation. Les 4 fonctions SQL sont `security definer`, `search_path = public, pg_temp`, exécution révoquée. |
| Passerelle SMS (`_shared/passerelle-sms.ts`) | **Aucun défaut propre.** Mais son arrivée fait échoir le délai du constat 🟠 ci-dessous. |
| Déplafonnement des mises (`20260901090000`) | **Sain.** `grouper_milliers` passe en `bigint` avant les bornes, deux fonctions `security definer` réécrites conservent leur `search_path` durci — vérifié par `search-path.test.ts`, qui passe. |
| `journaliser_admin`, déclencheur du journal de `public.admins` | **Un 🟡 nouveau** : exécution ouverte à `anon`. Inerte, démontré plus bas. |
| Chantier vitrine du 2026-09-02 (`apps/site`) | **Sans effet sur la surface.** Aucune écriture, aucun appel réseau nouveau ; la CSP de `apps/site/netlify.toml` est inchangée. |

---

## 🟠 À corriger

### 1. `envoyer-avis` ne vérifie toujours aucun appelant — contrôle n°6

**Où :** `supabase/functions/envoyer-avis/index.ts:57-88`

Ouvert le 2026-08-25, redit le 2026-08-28, **inchangé au 2026-09-02**. Le
fichier n'a pas bougé ; le constat est donc repris de l'audit du 28, qui le
décrit exactement. Ce qui a changé, c'est le calendrier.

Le point d'entrée ne contrôle que la méthode HTTP :

```ts
Deno.serve(async (requete) => {
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405);
  }
  // …puis SUPABASE_SERVICE_ROLE_KEY, et le drainage.
```

L'appelant légitime — `avis_declencher_drainage`, migration
`20260823170000` ligne 76 — envoie pourtant `Authorization: Bearer <clé de
service>` depuis le coffre. La fonction ne le lit jamais. Seule reste la
barrière de plateforme `verify_jwt`, que la clé publiable franchit : elle est
servie dans le paquet JavaScript des trois sites, par construction.

**Ce que cela coûte.** Le drainage ne réserve pas son lot
(`index.ts:92-96` lit cinquante lignes, envoie, puis marque `envoye` en
`index.ts:122`). La table `avis_clients` n'a pas d'état intermédiaire — son
`statut` est `a_envoyer`, `echoue`, `envoye`, `abandonne`. Dix appels en
parallèle envoient donc dix fois le même message à de vrais clients et
décomptent dix fois le quota du collecteur, qui paie ce qu'il n'a pas demandé.

**Pourquoi l'échéance est probablement arrivée.** L'audit du 28 posait la
condition : la faille ne coûte rien tant que `passerelleDepuis` ne trouve aucun
identifiant. Depuis, `_shared/passerelle-sms.ts` a reçu une sonde
d'identifiants et un `trim()` sur les quatre valeurs, dont le commentaire dit
qu'il vient de « l'impasse du 2026-08-30 » — c'est-à-dire d'un vrai `401` d'une
vraie passerelle. Je ne peux pas lire les secrets de production ; c'est la
seule question qui décide de la gravité.

**La correction, inchangée depuis le 25.**

```ts
const attendu = `Bearer ${cleService}`;
if (requete.headers.get('Authorization') !== attendu) {
  return reponse({ erreur: 'ACCES_RESERVE' }, 403);
}
```

Puis réserver le lot avant d'envoyer :
`update … set statut = 'en_cours' where id in (…) and statut in ('a_envoyer','echoue') returning …`,
et n'envoyer que ce que le `returning` rend.

### 2. Limite Auth restée au défaut de la plateforme — contrôle n°11 · *reporté*

Constat de l'audit du 25, redit le 28. **Non revérifié ici** : il se lit dans le
tableau de bord Supabase, hors du dépôt. Il reste ouvert jusqu'à preuve du
contraire.

---

## 🟡 Durcissement

- **`journaliser_admin` exécutable par `anon` — nouveau, et inerte.** Seule
  fonction `security definer` de `public` ouverte aux deux rôles clients, hors
  `est_admin` / `est_super_admin` qui le sont exprès. Elle rend `trigger` :
  PostgREST refuse de l'exposer (`PGRST202`) et PostgreSQL refuse l'appel
  direct (`trigger functions can only be called as triggers`) — les deux
  mesurés. À révoquer par hygiène, pas par urgence.
- **`grouper_milliers` garde l'exécution PUBLIC.** Inchangé depuis le 28. Pas
  `security definer`, aucun accès aux données : c'est un `regexp_replace`.
- **Téléphones en clair.** Inchangé. Le chiffrement applicatif casserait
  l'envoi ; le sujet est le cloisonnement, pas la colonne.
- **Session dans `localStorage`.** Défaut de `supabase-js`, inchangé, et
  toujours sans vecteur : CSP en `script-src 'self'` sans `unsafe-inline`,
  zéro `dangerouslySetInnerHTML` dans tout le dépôt.
- **Borne publique par IP seulement.** `consommer_debit` compte sur
  `x-forwarded-for` (`_shared/debit.ts:28-34`) : 1 demande/60 s et
  3 réinitialisations/900 s. Un attaquant distribué passe. Aucun CAPTCHA.
- **`apps/admin/.env.prod.bak` traîne dans l'arborescence.** Ignoré par git
  (`.gitignore:17`), donc non versionné. Il ne contient que l'URL et la clé
  publiable, toutes deux publiques. Un fichier de configuration de production
  nommé `.bak` finit néanmoins par être copié ailleurs : à supprimer.

---

## ⚪️ Non vérifié

- **Le test de la clé publiable contre la production.** Le classificateur de
  l'outil a refusé la boucle `curl` — une série de requêtes authentifiées vers
  une base distante ressemble à un test d'identifiants, et le refus est juste.
  À lancer à la main :
  ```bash
  curl "https://yfnwmokxkznejotgpfgf.supabase.co/rest/v1/collecteurs?select=*" \
    -H "apikey: sb_publishable_GNPigRBKvZbBFMFo9gSYLw_rYTasr_R"
  ```
  Attendu : `42501`. **Le même test contre la base locale a été passé sur les
  quatorze tables, et les quatorze refusent** (voir ci-dessous).
- **L'autorisation au niveau des Edge Functions.** 40 tests sur 484 n'ont pas
  tourné : les six suites qui appellent une fonction par HTTP échouent parce
  que le moteur Edge local ne sert pas (toute requête sur `/functions/v1/`
  rend 500, y compris sur une fonction triviale). Les 444 autres passent, dont
  les 42 des suites `isolation`, `search-path`, `super-admin-privileges` et
  `bornes`, relancées seules pour lever le doute.
- **L'écart entre les migrations et la base de production.** Tout ce qui est
  marqué « mesuré » ici l'a été sur la base **locale**.
- **La limite Auth** (🟠 n°2 ci-dessus).

---

## Ce qui est vérifié et sain

**Le test de la clé anon, sur les quatorze tables.** Chacune répond `42501` —
le refus vient du privilège, avant même que RLS n'entre en jeu :

```
collecteurs clients cartes mises retraits caisses_jour audit_log
admins avis_clients avis_reglages demandes_ouverture codes_promo
debit_public synchro_rejets     → 42501 pour les quatorze
```

**Les privilèges de colonne, qui ferment l'auto-promotion.** La policy
`collecteurs_update` n'interdit aucune colonne — mais
`20260817002000_socle_privileges_liste_blanche.sql:71` accorde
`update (nom, telephone, zone)` et rien d'autre. `palier`,
`abonnement_statut` et `abonnement_echeance` ne sont pas atteignables par
`authenticated`. `isolation.test.ts:154` — « modifie son profil mais ne peut
pas s'offrir un palier » — le tient en direct, et passe.

**Les en-têtes en production**, mesurés sur `https://kolek.cash/` :
CSP complète, `Strict-Transport-Security`, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`. `http://` rend un `301`
vers `https://`.

**Aucun secret dans le dépôt ni dans son historique.** `.gitignore` couvre
`.env` et `.env.*` avec `!.env.example` ; `git ls-files` ne rend que les deux
`.env.example`. Les occurrences de `sb_secret_` dans `apps/admin/dist` et
`apps/collecteur/dist` sont un faux positif : c'est le test de préfixe de
`supabase-js` lui-même (`e.startsWith('sb_publishable_') || e.startsWith('sb_secret_')`),
et `scripts/verifier-bundles.mjs` ne s'y trompe pas — son motif exige de la
matière derrière le préfixe.

**`npm audit --omit=dev` : 0 vulnérabilité.**

---

## Les 20 contrôles

| # | Contrôle | Statut | Note |
|---|---|---|---|
| 1 | Clés API cachées | ✅ | Aucune clé secrète dans le code. Seules `VITE_SUPABASE_URL` et la clé publiable sont exposées, ce qui est leur rôle |
| 2 | Secrets purgés de Git | ✅ | `.env` et `.env.*` ignorés, deux `.env.example` suivis, historique propre |
| 3 | Bonne clé côté client | ✅ | `sb_publishable_` dans les trois applications ; `service_role` seulement dans les Edge Functions et le harnais de test |
| 4 | Row Level Security | ✅ | 14 tables sur 14, aucune policy en `using (true)`, `audit_log` et `admins` fermées à tous. Mesuré en direct |
| 5 | Chiffrement des données sensibles | 🟡 | Téléphones en clair — nécessaires à l'envoi |
| 6 | Autorisation côté serveur | 🟠 | 7 fonctions `admin-*` et 3 `super-admin-*` vérifient l'appelant avant de sortir la clé de service. `envoyer-avis` ne vérifie rien |
| 7 | Verrouillage par enregistrement | ✅ | Toutes les policies filtrent sur `auth.uid()`. `isolation.test.ts` le tient sur six chemins croisés |
| 8 | Champs non modifiables | ✅ | GRANT de colonne partout : `collecteurs`, `caisses_jour`, `synchro_rejets`, `mises`, `cartes` |
| 9 | Cookies de session | 🟡 | `localStorage`, défaut de `supabase-js`, sans vecteur sous cette CSP |
| 10 | Mots de passe hachés | ✅ | Délégué à Supabase Auth ; aucune table maison ne stocke de mot de passe |
| 11 | Rate limiting | 🟠 | `consommer_debit` borne les deux fonctions publiques ; la limite Auth reste au défaut de la plateforme |
| 12 | Protection anti-bot | 🟡 | Aucun CAPTCHA. La borne par IP arrête l'attaque simple, pas la distribuée |
| 13 | Requêtes paramétrées | ✅ | Aucune concaténation SQL. Le SQL dynamique se limite aux `execute function` de déclencheurs |
| 14 | Validation des entrées | ✅ | `valider-demande`, `valider-collecteur`, `valider-email`, `estUuid`, `estDateIso`, plus les `check` de la base |
| 15 | Échappement du contenu | ✅ | Zéro `dangerouslySetInnerHTML`, zéro `innerHTML` |
| 16 | Uploads restreints | ⚪️ | Non applicable : aucun bucket. `20260818010000` coupe l'héritage dans `storage` et refuse tout bucket non déclaré |
| 17 | Réponses API épurées | ✅ | Aucun `select('*')` dans le code applicatif — seulement dans les tests, où c'est le sujet |
| 18 | Headers de sécurité | ✅ | Mesurés en production |
| 19 | HTTPS forcé | ✅ | `301` mesuré, HSTS un an |
| 20 | Dépendances scannées | ✅ | 0 vulnérabilité |
