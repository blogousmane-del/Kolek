# Audit de sécurité — Kolek

**Date :** 2026-09-03 · **Périmètre :** dépôt au commit `5ddafe9`, base locale
`supabase_db_Kolek` interrogée en direct, en-têtes de `kolek.cash` mesurés en
production.

> Dixième passage des vingt contrôles. Le précédent date du 2026-09-02, commit
> `180c4b3`. Depuis : **81 fichiers, 14 594 lignes ajoutées** — les
> collaborateurs du forfait Illimité, le registre des paiements d'abonnement, et
> le contrat Chariow. Ce document remesure les vingt contrôles et regarde
> surtout ces trois arrivées.

**Verdict : PRÊT À LANCER, avec une correction dont l'échéance est désormais
franchement dépassée.** Aucun constat rouge. Le sous-système paiements est la
partie la mieux fermée du dépôt. Le seul point qui demande une décision est
celui que les audits des 25 et 28 août puis du 2 septembre ont déjà écrit :
`envoyer-avis` ne vérifie aucun appelant. C'est son **quatrième** passage.

| | Nombre |
|---|---|
| 🔴 Bloquant | 0 |
| 🟠 Important | 1 vérifié · 1 reporté sans revérification |
| 🟡 À faire | 8 |
| ⚪️ Non vérifié | 3 |

**La couverture de test s'est refermée.** L'audit du 2 septembre laissait 40
tests sur 484 non lancés, le moteur Edge local ne servant pas. Ici :
**598 tests sur 598 passent, 54 fichiers sur 54**, runtime compris. Les six
suites qui appellent une fonction par HTTP ont tourné.

---

## Ce qui a changé depuis le 2026-09-02

| Ajout | Ce que l'audit en dit |
|---|---|
| Registre des paiements (`20260902160000`, `20260902170000`) | **Le mieux fermé du dépôt.** RLS en lecture seule filtrée sur `auth.uid()`, **aucune policy d'écriture** — l'insertion est inexprimable via l'API. `crediter_abonnement` révoquée de `public, anon, authenticated`, accordée au seul `service_role`. Un déclencheur `paiements_immuables` interdit `DELETE` et le retour en arrière depuis `regle`/`abandonne` — il vaut **aussi contre la clé de service**, que RLS et les GRANT ne filtrent pas. |
| Collaborateurs (`collecteur-creer-collaborateur`, `collecteur-encaisser-pour`, `collecteur-cloturer-carte`) | **Sain.** Les trois lisent `Authorization`, résolvent l'appelant par `getUser()` **avant** de sortir la clé de service, puis vérifient `titulaire_id === appelant`. Même motif que les sept `admin-*`. `creer-collaborateur` passe en plus par `consommer_debit` et `verifierFuite` (HIBP). |
| `equipe_vue`, `equipe_clients` | **Sain.** `equipe_clients(p_collaborateur uuid)` prend un identifiant en paramètre mais le borne : `c.titulaire_id = auth.uid() or c.id = auth.uid()`. Hors équipe, elle rend `[]` et **jamais une erreur** — pas d'oracle d'existence. Fermées à `anon`. |
| Contrat Chariow (`_shared/chariow.ts`, `_shared/reconciliation.ts`) | **Écrit, non branché — donc hors surface d'attaque.** `reconciliation.ts` n'est importé par aucune Edge Function, et `chariow-webhook` n'existe pas dans `supabase/functions/`. Le `--no-verify-jwt` de `Docs/deploiement.md:1039` n'est pas encore actif. Voir le piège de déploiement ci-dessous. |
| `abonnement_ouvre_droit` | **Un 🟡 nouveau** : seule fonction de lecture qui ne borne pas son paramètre. Détail plus bas. |

---

## 🟠 À corriger

### 1. `envoyer-avis` ne vérifie toujours aucun appelant — contrôle n°6

**Où :** `supabase/functions/envoyer-avis/index.ts:57-88`

Ouvert le 2026-08-25, redit le 28, redit le 2 septembre, **inchangé au
2026-09-03**. Le point d'entrée ne contrôle que la méthode HTTP :

```ts
Deno.serve(async (requete) => {
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405);
  }
  // …puis SUPABASE_SERVICE_ROLE_KEY, et le drainage.
```

L'appelant légitime — `avis_declencher_drainage`, migration `20260823170000`
ligne 76 — envoie pourtant `Authorization: Bearer <clé de service>` depuis le
coffre. La fonction ne le lit jamais. Seule reste la barrière de plateforme
`verify_jwt`, que la clé publiable franchit : elle est servie dans le paquet
JavaScript des trois sites, par construction.

**Ce que cela coûte.** Le drainage ne réserve pas son lot : `index.ts:92-96`
lit cinquante lignes, envoie, puis marque `envoye` en `index.ts:122`. La table
`avis_clients` n'a pas d'état intermédiaire. Dix appels en parallèle envoient
dix fois le même message à de vrais clients et décomptent dix fois le quota du
collecteur, qui paie ce qu'il n'a pas demandé.

**Pourquoi l'échéance est dépassée.** L'audit du 28 posait la condition — « avant
que les identifiants de la passerelle n'arrivent, pas après ». La sonde
d'identifiants et le `trim()` de `_shared/passerelle-sms.ts` sont nés d'un vrai
`401` du 30 août : la passerelle existe. Je ne peux pas lire les secrets de
production, et c'est la seule inconnue qui sépare ce constat de la gravité
pleine.

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

Constat du 25 août, redit le 28 et le 2 septembre. **Non revérifié ici** : il se
lit dans le tableau de bord Supabase, hors du dépôt. Ouvert jusqu'à preuve du
contraire.

---

## 🟡 Durcissement

- **`abonnement_ouvre_droit(p_collecteur uuid)` ne borne pas son paramètre —
  nouveau.** Elle est `security definer`, fermée à `anon`, ouverte à
  `authenticated`, et son corps est un `exists` sur l'identifiant reçu, sans
  aucune comparaison à `auth.uid()`. Tout collecteur connecté peut donc
  demander si un identifiant arbitraire a un abonnement actif. C'est un oracle
  booléen : il faut déjà connaître l'UUID, et la réponse dit peu. Mais c'est le
  seul écart de motif avec `equipe_clients`, qui borne le sien à la ligne
  d'à côté. À aligner.
- **Trois fonctions `security definer` exécutables par `anon`, toutes inertes.**
  `journaliser_admin` (connu du 2 septembre), plus deux neuves :
  `paiements_immuables` et `paiements_naissance`. Les trois rendent `trigger` :
  PostgREST refuse de les exposer (`PGRST202`) et PostgreSQL refuse l'appel
  direct. À révoquer par hygiène, pas par urgence — mais le motif se répète à
  chaque migration, et mériterait un garde-fou dans `search-path.test.ts`.
- **Le CI déploiera `chariow-webhook` avec `verify_jwt` — piège à venir.**
  `.github/workflows/verification.yml:230` lance `supabase functions deploy`
  **sans argument**, ce qui déploie toutes les fonctions avec les réglages par
  défaut. `Docs/deploiement.md:1039` exige `--no-verify-jwt` sur cette seule
  fonction. Le jour où elle naîtra, le CI la republiera fermée et le webhook
  deviendra muet — panne silencieuse, pas faille. À trancher avant d'écrire la
  fonction : `verify_jwt = false` dans `[functions.chariow-webhook]` de
  `config.toml` plutôt qu'un drapeau de ligne de commande que le CI ignore.
- **`grouper_milliers` garde l'exécution PUBLIC.** Inchangé. Pas
  `security definer`, aucun accès aux données : c'est un `regexp_replace`.
- **Téléphones en clair.** Inchangé. Le chiffrement applicatif casserait
  l'envoi ; le sujet est le cloisonnement, pas la colonne.
- **Session dans `localStorage`.** Défaut de `supabase-js`, toujours sans
  vecteur : CSP en `script-src 'self'` sans `unsafe-inline`, zéro
  `dangerouslySetInnerHTML` dans tout le dépôt.
- **Borne publique par IP seulement.** `consommer_debit` compte sur
  `x-forwarded-for` (`_shared/debit.ts:28-34`). Un attaquant distribué passe.
  Aucun CAPTCHA.
- **`apps/admin/.env.prod.bak` traîne encore.** Demandé à la suppression le
  2 septembre, **non fait**. Vérifié inoffensif : il ne porte que
  `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`, deux valeurs publiques, et
  `.gitignore:17` l'ignore. Un fichier de configuration de production nommé
  `.bak` finit néanmoins par être copié ailleurs.

---

## ⚪️ Non vérifié

- **Le test de la clé publiable contre la production.** Le classificateur de
  l'outil a de nouveau refusé la boucle `curl`, et le refus est juste. À lancer
  à la main :
  ```bash
  curl "https://yfnwmokxkznejotgpfgf.supabase.co/rest/v1/collecteurs?select=*" \
    -H "apikey: <clé publiable de production>"
  ```
  Attendu : `42501`. **Le même test contre la base locale est passé sur les
  quinze tables, et les quinze refusent** (voir ci-dessous).
- **La lecture des `.env` de production.** Le classificateur a refusé d'ouvrir
  leur contenu — refus juste, et l'audit s'est rabattu sur les **noms** de
  variables seuls, ce qui a suffi : aucun des trois fichiers ne déclare autre
  chose que l'URL et la clé publiable.
- **L'écart entre les migrations et la base de production.** Tout ce qui est
  marqué « mesuré » ici l'a été sur la base **locale**. `verifier:migrations`
  existe désormais pour cela (`bf762c9`) mais demande le jeton du projet.

---

## Ce qui est vérifié et sain

**Les quinze tables refusent la clé publiable.** Chacune répond `42501` — le
refus vient du privilège, avant même que RLS n'entre en jeu :

```
collecteurs clients cartes mises retraits caisses_jour audit_log
admins avis_clients avis_reglages demandes_ouverture codes_promo
debit_public synchro_rejets paiements_abonnement  → 42501 pour les quinze
```

**RLS : 15 tables sur 15**, aucune laissée ouverte, et **aucune policy en
`using (true)`** dans tout le schéma `public`. Mesuré sur `pg_class` et
`pg_policy`.

**Aucune fonction `security definer` sans `search_path` durci.** La requête sur
`pg_proc.proconfig` ne rend rien — le garde-fou de
`20260830131000_search_path_pg_temp_en_dernier.sql` tient sur les fonctions
neuves des paiements et de l'équipe.

**598 tests sur 598 passent, 54 fichiers sur 54**, en 240 s, runtime Edge
compris.

**Les en-têtes en production**, mesurés sur `https://kolek.cash/` : CSP
complète, `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`. `http://` rend un `301`
vers `https://`.

**Aucun secret dans le dépôt.** `git ls-files` ne rend que les deux
`.env.example`. Les quatre `.env` réels sont couverts par `.gitignore:16-17`,
vérifié par `git check-ignore`. `npm run verifier:bundles` : « Aucune fuite dans
les artefacts. »

**`npm audit --omit=dev` : 0 vulnérabilité.**

---

## Les 20 contrôles

| # | Contrôle | Statut | Note |
|---|---|---|---|
| 1 | Clés API cachées | ✅ | Aucune clé secrète dans le code. Seules `VITE_SUPABASE_URL` et la clé publiable sont exposées, ce qui est leur rôle |
| 2 | Secrets purgés de Git | ✅ | `.env` et `.env.*` ignorés, deux `.env.example` suivis, historique propre |
| 3 | Bonne clé côté client | ✅ | `sb_publishable_` dans les trois applications ; `service_role` seulement dans les Edge Functions et le harnais de test |
| 4 | Row Level Security | ✅ | 15 tables sur 15, aucune policy en `using (true)`. Mesuré en direct |
| 5 | Chiffrement des données sensibles | 🟡 | Téléphones en clair — nécessaires à l'envoi |
| 6 | Autorisation côté serveur | 🟠 | 7 fonctions `admin-*`, 3 `super-admin-*` et 3 `collecteur-*` vérifient l'appelant avant de sortir la clé de service. `envoyer-avis` ne vérifie rien |
| 7 | Verrouillage par enregistrement | ✅ | Toutes les policies filtrent sur `auth.uid()`. `isolation.test.ts` et `collaborateurs.test.ts` le tiennent sur les chemins croisés, équipe comprise |
| 8 | Champs non modifiables | ✅ | GRANT de colonne partout. `paiements_abonnement` va plus loin : aucune policy d'écriture, plus un déclencheur d'immuabilité qui vaut contre `service_role` |
| 9 | Cookies de session | 🟡 | `localStorage`, défaut de `supabase-js`, sans vecteur sous cette CSP |
| 10 | Mots de passe hachés | ✅ | Délégué à Supabase Auth ; `verifierFuite` (HIBP) filtre en plus à la création d'un collaborateur |
| 11 | Rate limiting | 🟠 | `consommer_debit` borne les fonctions publiques et `creer-collaborateur` ; la limite Auth reste au défaut de la plateforme |
| 12 | Protection anti-bot | 🟡 | Aucun CAPTCHA. La borne par IP arrête l'attaque simple, pas la distribuée |
| 13 | Requêtes paramétrées | ✅ | Aucune concaténation SQL. Le SQL dynamique se limite aux `execute function` de déclencheurs |
| 14 | Validation des entrées | ✅ | `valider-demande`, `valider-collecteur`, `valider-email`, `estUuid`, `estDateIso`, plus les `check` de la base. `montantCoherent` ajoute une tolérance anti-fraude côté paiement |
| 15 | Échappement du contenu | ✅ | Zéro `dangerouslySetInnerHTML`, zéro `innerHTML` |
| 16 | Uploads restreints | ⚪️ | Non applicable : aucun bucket. `20260818010000` coupe l'héritage dans `storage` |
| 17 | Réponses API épurées | ✅ | Aucun `select('*')` dans le code applicatif — seulement dans les tests, où c'est le sujet |
| 18 | Headers de sécurité | ✅ | Mesurés en production |
| 19 | HTTPS forcé | ✅ | `301` mesuré, HSTS un an |
| 20 | Dépendances scannées | ✅ | 0 vulnérabilité |
