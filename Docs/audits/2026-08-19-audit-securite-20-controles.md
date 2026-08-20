# Audit de sécurité — Kolek

**Date :** 2026-08-19 · **Périmètre :** dépôt `blogousmane-del/Kolek`, projet
Supabase `kolek-prod` (`yfnwmokxkznejotgpfgf`, eu-west-3), trois sites Netlify
en production · **Méthode :** grille des 20 contrôles, mode complet · **Suite
de :** [audit du 2026-08-18](2026-08-18-audit-securite-20-controles.md).

**Verdict : PRÊT — rien ne bloque.**

Le socle tient : les neuf tables restent hors de portée de la clé anonyme
publiée, vérifié en direct et non déduit des migrations. Ce que cet audit
ajoute tient en une phrase : les trois campagnes précédentes ont fermé **qui**
écrit, **quelles colonnes** et **combien** sur les montants. Personne n'avait
regardé **la taille** de ce qui entre.

| | Nombre | Depuis |
|---|---|---|
| 🔴 Bloquant | 0 | — |
| 🟠 Important | 1 | **corrigé le jour même**, migration `20260819010000` |
| 🟡 À faire | 3 | dont **un durcissement à une case à cocher** : mots de passe divulgués non filtrés, confirmé le 2026-08-20 |
| ⚪️ Non vérifié | 0 | les trois sont tombés le 2026-08-20 |
| Non applicable | 3 | inchangés |

---

## 🟠 À corriger dans la semaine — **CORRIGÉ**

### 1. Aucune borne de longueur sur les dix colonnes texte que le client écrit — contrôle 14

**Où :** `public.clients` (`nom`, `telephone`, `photo_url`, `marche`,
`activite`), `public.collecteurs` (`nom`, `telephone`, `zone`),
`public.synchro_rejets` (`motif`, `charge_utile`).

**La preuve.** La liste blanche de la migration `20260817002000` énumère
exactement ces colonnes en `INSERT`/`UPDATE` pour `authenticated`. Aucune
contrainte de longueur n'existait sur le schéma : `pg_constraint` ne portait
que les cinq `check` d'énumération et les quatre bornes numériques. Le
« test du client déloyal » de la grille — appeler l'API hors de l'interface
avec une chaîne de dix mille caractères — n'avait jamais été joué. Il passait.

**Le problème.** Pas un vol de donnée : une facture et une base qu'on ne peut
plus purger. Un collecteur authentifié — donc un client payant muni d'un simple
`curl`, pas un inconnu — pouvait écrire une charge utile de plusieurs mégaoctets
dans `synchro_rejets.charge_utile`, ou dans le nom d'une fiche client, autant de
fois qu'il le voulait.

L'amplification est ce qui rend la chose sérieuse ici plutôt qu'ailleurs :
`journaliser()` recopie **la ligne entière** en jsonb dans `audit_log.donnees` à
chaque insertion sur `clients`, `cartes` et `mises`. Dix mégaoctets écrits en
coûtent vingt. Et `audit_log` est append-only par construction — le déclencheur
`audit_log_immuable` refuse `update` et `delete`, y compris à la clé de service.
Ce qui entre ne sort plus.

**La correction, appliquée.** Migration
`20260819010000_socle_bornes_texte.sql`. Bornes hautes seulement, larges à
dessein : elles doivent arrêter l'abus, jamais un nom ivoirien long ou un
libellé de marché à rallonge. Pas de borne basse — un champ vide est un défaut
de saisie, pas une faille, et une borne basse refuserait des lignes déjà en base.

```sql
alter table public.clients
  add constraint clients_nom_borne       check (length(nom) <= 120),
  add constraint clients_telephone_borne check (length(telephone) <= 32),
  add constraint clients_marche_borne    check (length(marche) <= 80),
  add constraint clients_activite_borne  check (length(activite) <= 80);

alter table public.synchro_rejets
  add constraint rejets_motif_borne        check (length(motif) <= 200),
  add constraint rejets_charge_utile_borne check (length(charge_utile::text) <= 8192);
```

`collecteurs.telephone` est borné à 64 et non à 32 comme celui du client :
`creer_collecteur_apres_signup` retombe sur `new.id::text` — un UUID de 36
caractères — quand l'inscription ne fournit pas de numéro. Une borne à 32 aurait
fait échouer la migration sur la première ligne créée par ce repli. Une
contrainte qui refuse une ligne que le produit écrit lui-même n'est pas une
contrainte, c'est une panne.

**Le garde-fou, et c'est lui qui compte.** Même principe que la liste blanche de
la migration 7 : on n'énumère pas les colonnes connues, on interroge l'état
réel. Toute colonne `text`, `varchar` ou `jsonb` que la liste blanche rend
écrivable à `authenticated` doit porter une contrainte qui borne sa longueur. Une
colonne ajoutée en J2a sans borne fera échouer la reconstruction, au lieu
d'attendre le prochain audit.

**Constaté après application**, en interrogeant les catalogues du distant et non
le fichier de migration. Douze contraintes en place — les onze de cette
migration plus `mises_montant_borne`, héritée de la veille :

```
clients_nom_borne            CHECK ((length(nom) <= 120))
clients_telephone_borne      CHECK ((length(telephone) <= 32))
clients_marche_borne         CHECK ((length(marche) <= 80))
clients_activite_borne       CHECK ((length(activite) <= 80))
clients_photo_url_borne      CHECK ((length(photo_url) <= 512))
clients_photo_url_https      CHECK (photo_url IS NULL OR photo_url ~~ 'https://%')
collecteurs_nom_borne        CHECK ((length(nom) <= 120))
collecteurs_telephone_borne  CHECK ((length(telephone) <= 64))
collecteurs_zone_borne       CHECK ((length(zone) <= 80))
rejets_motif_borne           CHECK ((length(motif) <= 200))
rejets_charge_utile_borne    CHECK ((length((charge_utile)::text) <= 8192))
```

Et la posture de sécurité inchangée, contrôlée dans la foulée : aucune politique
`UPDATE` ou `DELETE` sur `mises`, `retraits`, `audit_log` — l'append-only tient —
et `anon` sans un seul privilège de table.

**Une note de méthode, parce qu'elle a failli coûter cher.** Cette migration et
ce document sont restés plusieurs heures non commités et non appliqués, pendant
que le document affirmait « corrigé ». C'est l'audit suivant qui l'a vu, en
comparant `supabase_migrations.schema_migrations` au contenu du dossier — la
dernière version enregistrée était celle de la veille. Un écrit qui se déclare
appliqué sans que la base le confirme est pire qu'un écrit absent : il éteint la
question. La règle qui en sort tient en une ligne — **l'état appliqué se lit
dans le catalogue, jamais dans le dossier `migrations/`.**

---

## 🟡 Durcissement

### 1. Le déclencheur des mises renseignait sur les cartes d'autrui — **corrigé**

**Où :** `public.mises_avant_insert()`, `SECURITY DEFINER`.

L'audit du 2026-08-18 notait, au contrôle 7 : « une mise posée sur la carte
d'autrui se fait réécrire son `collecteur_id` par le trigger puis rejeter par le
`with check` ». C'est exact, et l'insertion était bien refusée. Mais le refus
n'arrivait qu'**après avoir répondu**.

`mises_avant_insert` est `SECURITY DEFINER` : son `select * from cartes` voit
toutes les cartes du produit, RLS comprise. Entre-temps, les messages levés
renseignaient donc sur une carte que l'appelant ne peut pas lire :

| Message obtenu | Ce qu'il apprend sur la carte d'autrui |
|---|---|
| `CARTE_INTROUVABLE` ou non | elle existe |
| `CARTE_CLOTUREE` | son statut |
| `CYCLE_COMPLET` | son avancement |
| `MONTANT_INVALIDE` | sa mise exacte, en quelques essais |

Un identifiant de carte est un UUID v4 : deviner n'est pas réaliste, et c'est la
seule raison pour laquelle ceci n'est pas classé plus haut. Un UUID qui fuit par
ailleurs — capture d'écran, export, journal applicatif — le redeviendrait.

**Corrigé.** Le refus remonte avant les tests d'état et se confond avec
l'absence : une carte qui ne vous appartient pas est une carte qui n'existe pas.

```sql
if auth.uid() is not null and c.collecteur_id <> auth.uid() then
  raise exception 'CARTE_INTROUVABLE';
end if;
```

`auth.uid() is not null` garde la porte ouverte aux Edge Functions à clé de
service, qui n'ont pas d'appelant et écriront la synchronisation en J2.

Deux durcissements de la même migration relèvent du même geste et n'ont pas de
section à eux :

- **`clients.photo_url` n'acceptait aucun schéma d'URL en particulier.** Aucun
  écran ne l'affiche encore — c'est le bon moment, exactement comme pour
  l'héritage de `storage` coupé la veille. Le jour où la valeur atterrit dans un
  `href`, un `javascript:` ou un `data:text/html` y serait déjà stocké, écrit par
  un collecteur, et le rendu le déclencherait chez l'administrateur qui consulte
  la fiche. Désormais : `photo_url is null or photo_url like 'https://%'`, plus
  une borne à 512 caractères.
- **`caisses_jour.date` n'avait aucune borne** — rien n'empêchait d'ouvrir une
  ligne de caisse par jour jusqu'en l'an 9999. La fenêtre reprend celle de
  `mises.encaisse_le` (un jour en avant, quatre-vingt-dix en arrière) et vit dans
  le déclencheur existant, `now()` étant interdit dans un `check`. Sur `INSERT`
  seulement : corriger le cash déclaré d'une journée ancienne reste légitime.

### 2. Mots de passe : seuil à 8, et **aucun filtre sur les fuites connues**

**Relevé le 2026-08-20**, au tableau de bord — Authentication → Policies. C'était
le dernier ⚪️ ; le chiffre étant connu, il change de catégorie.

`supabase/config.toml` porte `minimum_password_length = 10`. Le projet en ligne
applique **8**. Personne n'a baissé le seuil : ce fichier n'a jamais gouverné le
distant. C'est la quatrième divergence de la même famille, après l'exposition
automatique des tables, le `TRUNCATE` résiduel et les privilèges par défaut des
schémas `public` et `storage`. Le motif ne varie pas — **ce que le dépôt déclare
n'est pas ce que la plateforme applique**, et seul le distant fait foi.

Ce n'est pas exploitable en soi. Huit caractères restent au-dessus du défaut de
Supabase, l'inscription est fermée — donc les comptes sont créés à la main par
GTCS, pas par un inconnu — et le contrôle 11 vient de montrer que la force brute
bute sur un `429`. L'écart entre 8 et 10 vaut surtout comme signal : une
intention écrite dans le dépôt et jamais appliquée finit par être prise pour
acquise.

**À faire, dans cet ordre de valeur.** Le seuil se relève à 10 dans
Authentication → Policies, pour rejoindre l'intention. Ne pas passer par
`supabase config push` : il appliquerait le bloc `[auth]` entier, `site_url`
compris, qui pointe encore sur `127.0.0.1:3000` — casser l'authentification en
production pour aligner un entier serait un mauvais échange.

#### Le point qui compte vraiment : `Prevent use of leaked passwords` est **désactivé**

**Confirmé par l'exploitant le 2026-08-20**, au tableau de bord. C'est une
réponse déclarée, non mesurable de l'extérieur pour les raisons écrites plus bas
— mais elle est négative, et c'est le seul cas où une réponse déclarée suffit à
conclure : personne ne s'accuse à tort d'avoir laissé une protection ouverte.

Prises séparément, les deux valeurs sont anodines. Prises ensemble, elles
décrivent un état précis : **rien n'empêche aujourd'hui de fixer `12345678` ou
`password` sur le compte d'administration.** Huit caractères, c'est exactement la
longueur des mots de passe les plus reproduits des fuites publiques. Le filtre
qui les refuserait est éteint.

Ce que ce compte ouvre, si le mot de passe tombe : la lecture de **tous** les
collecteurs, **tous** les clients, **toutes** les mises et **tous** les
encaissements. Le portillon `est_admin()` fait son travail — il tient, on l'a
vérifié à trois niveaux — mais il ne protège de rien contre quelqu'un qui
présente les bons identifiants.

Les défenses qui restent alors sont minces et il faut les nommer honnêtement :
l'inscription est fermée, donc l'attaquant doit connaître l'adresse ; et le
plafond de débit se déclenche dans les dizaines de tentatives. Ni l'un ni
l'autre n'arrête un bourrage d'identifiants (*credential stuffing*), qui ne
devine pas : il rejoue un couple adresse/mot de passe déjà fuité ailleurs. Une
seule tentative suffit, et un plafond à trente-trois ne la voit pas passer.

**C'est le durcissement le plus rentable de tout cet audit** : une case à cocher,
zéro migration, zéro déploiement, aucun risque de régression. Elle vaut plus que
l'écart de 8 à 10 — un mot de passe de douze caractères qui figure dans une
fuite connue est plus faible qu'un de huit qui n'y figure pas.

Authentication → Policies → **Prevent use of leaked passwords**. Supabase
interroge Have I Been Pwned par k-anonymat : seuls les cinq premiers caractères
de l'empreinte SHA-1 sortent, jamais le mot de passe. Cocher cette case
n'expose rien.

### 3. Le jeton de session vit dans `localStorage` — reconduit, inchangé

Contrôle 9, déjà argumenté le 2026-08-18 et revérifié aujourd'hui : comportement
par défaut de `supabase-js`, non modifié. Le risque reste bas — `script-src
'self'` sans inline ni joker, aucun script tiers, aucun `dangerouslySetInnerHTML`,
`innerHTML` ni `v-html` dans `apps/` ni `packages/`. À revoir le jour où du
contenu riche est affiché.

Le point 2 du 2026-08-18 — `search_path = public` sur les fonctions
`SECURITY DEFINER` — reste délibérément tel quel, pour les raisons qui y sont
écrites. Les deux fonctions réécrites aujourd'hui conservent ce réglage plutôt
que d'introduire une troisième convention dans le même schéma.

---

## ⚪️ Non vérifié — **plus aucun**

Les trois de la première rédaction sont tombés le 2026-08-20.

1. ~~La longueur minimale du mot de passe côté distant.~~ **Relevée : 8.** Elle
   devient un 🟡, voir « 2. La longueur minimale de mot de passe » plus haut —
   un chiffre connu qui diverge de l'intention n'est plus un angle mort, c'est
   un durcissement.
2. ~~Les limites de débit sur la connexion~~ (contrôle 11) — **mesurées**, voir
   « Contrôle 11, mesuré trois fois » plus bas. Non lisibles de l'extérieur, mais
   observables, et c'est ce qui compte : le plafond existe et se déclenche.
3. ~~La suite de tests de la base n'a pas pu être rejouée~~ — **levé**, voir
   « Ce qui restait en suspens » : les 63 tests sont verts, migration comprise.

---

## Non applicable

Inchangés depuis le 2026-08-18 : contrôle 16 (aucun bucket — `storage.buckets`
répond toujours `[]`), contrôle 12 (aucun formulaire public, inscription fermée),
contrôle 13 (aucun SQL concaténé, aucun `execute` dynamique).

---

## Les 20 contrôles

| # | Contrôle | Statut | Preuve |
|---|---|---|---|
| 1 | Clés API cachées | conforme | scan sans motif de clé ; seules `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` exposées |
| 2 | Secrets purgés de Git | conforme | `git log --all --name-only` : seuls `apps/*/.env.example` ; `.env` et `.env.*` ignorés ; `git ls-files` ne suit aucun `.env` |
| 3 | Bonne clé côté client | conforme | deux `createClient` applicatifs sur la clé anonyme ; la clé de service n'apparaît que dans `supabase/tests/harnais.ts` ; `verifier:bundles` vert sur les trois `dist` |
| 4 | Row Level Security | conforme | attaque en direct : les neuf tables répondent `401 / 42501` à la clé anonyme publiée |
| 5 | Chiffrement des données sensibles | conforme au besoin | téléphones et noms en clair, inévitable pour un carnet de collecte ; aucune donnée bancaire stockée |
| 6 | Autorisation côté serveur | conforme | portillon admin sur `est_admin()` ; `rpc est_admin` sans session : `401 permission denied for function` |
| 7 | Verrouillage par enregistrement | conforme, **durci** | policies sur `collecteur_id = auth.uid()` ; le déclencheur ne renseigne plus sur les cartes d'autrui |
| 8 | Champs non modifiables | conforme | liste blanche de colonnes, garde-fous des migrations 7 et 8 |
| 9 | Cookies de session | 🟡 | jeton en `localStorage`, mitigé par la CSP |
| 10 | Mots de passe hachés | conforme, 🟡 sur le seuil | délégué à Supabase Auth, aucune colonne de mot de passe dans `public` ; longueur minimale relevée le 2026-08-20 : 8 en ligne contre 10 déclaré dans `config.toml` |
| 11 | Rate limiting | conforme | plafond mesuré trois fois le 2026-08-20 : `429 over_request_rate_limit` entre la 33ᵉ et la 54ᵉ tentative, en moins de 20 s ; inscription fermée (`disable_signup: true`, mesuré) |
| 12 | Anti-bot | non applicable | aucun formulaire public |
| 13 | Requêtes paramétrées | non applicable | aucun SQL concaténé |
| 14 | Validation des entrées | 🟠 **corrigé** | dix colonnes texte sans borne de longueur ; bornées et garde-fou posé, migration `20260819010000` |
| 15 | Échappement du contenu | conforme | aucun `dangerouslySetInnerHTML`, `innerHTML` ni `v-html` ; `photo_url` bornée au schéma `https` par anticipation |
| 16 | Uploads restreints | non applicable | `storage.buckets` vide ; héritage coupé et garde-fou posé le 2026-08-18 |
| 17 | Réponses API épurées | conforme | aucun `select('*')` applicatif ; le seul est dans `isolation.test.ts`, où c'est le test |
| 18 | Headers de sécurité | conforme | `npm run verifier:en-ligne` : trois cibles conformes |
| 19 | HTTPS forcé | conforme | contrôlé par le même script ; HSTS un an, sous-domaines |
| 20 | Dépendances scannées | conforme | `npm audit` : 0 vulnérabilité, dépendances de développement comprises |

---

## Ce qui a été fait pour le prouver

1. **Scan et relecture.** Le script des 15 contrôles automatisables, puis
   ouverture de chaque fichier signalé. Deux faux positifs, écartés — les mêmes
   que la veille : `createClient` dans le harnais de test, où la clé de service
   est à sa place, et le `select('*')` d'`isolation.test.ts`, qui est
   précisément l'attaque que ce test rejoue.

2. **Attaque depuis l'extérieur, avec la clé du bundle.** Neuf tables, la liste
   des buckets, le schéma OpenAPI, la fonction `est_admin` et les réglages
   d'authentification.

```
collecteurs 401 42501    mises          401 42501    admins    401 42501
clients     401 42501    retraits       401 42501    buckets   200 []
cartes      401 42501    caisses_jour   401 42501    est_admin 401 permission denied
audit_log   401 42501    synchro_rejets 401 42501    settings  disable_signup: true
```

3. **Lecture du schéma des huit migrations, colonne par colonne, contre la liste
   blanche des privilèges.** C'est ce croisement — et lui seul — qui a produit le
   🟠 : la liste blanche dit exactement quelles colonnes le client écrit, et il
   suffisait de demander laquelle de ces dix colonnes texte portait une borne.
   Aucune.

4. **Chaîne de construction complète.** `npm test` (50 tests),
   `npm run test:scripts` (22), `npm run test:db` (63), `verifier:theme`,
   `npm run build` sur les trois applications, `verifier:bundles`,
   `verifier:en-ligne`. Tout vert.

---

## Ce qui a été écrit aujourd'hui

- `supabase/migrations/20260819010000_socle_bornes_texte.sql` — dix bornes de
  longueur, la borne de schéma sur `photo_url`, la fenêtre de date sur
  `caisses_jour`, le refus muet sur la carte d'autrui, et le garde-fou qui
  interroge l'état réel plutôt qu'une liste d'interdits.
- `supabase/tests/bornes.test.ts` — neuf tests, un par borne posée, plus ceux
  qui vérifie qu'un rejet de synchronisation de taille normale passe toujours et
  que la correction d'une caisse ouverte reste possible. La leçon de F1 n'a pas
  changé : **aucun test ne posait la question.**

---

## Ce qui restait en suspens, et qui est clos

Rédigé le 2026-08-20, après coup. La première version de ce document classait la
suite de tests en ⚪️ : Docker Desktop refusait de démarrer sur le poste, et la
migration n'avait été validée que par l'analyseur PostgreSQL 17 (`libpg-query`),
ce qui prouve la syntaxe et rien d'autre.

**La panne locale, puisqu'elle se reproduira.** `supabase start` attend la sonde
de santé de *tous* les services. Cinq ne l'atteignent jamais ici —
`analytics`, `realtime`, `storage`, `pg_meta`, `studio` — parce que `vector`
n'arrive pas à lire le socket Docker après un redémarrage du moteur WSL :

```
vector::sources::docker_logs: Listing currently running containers failed.
error=ConnectError("tcp connect error", ConnectionRefused)
```

Le CLI démonte alors la pile entière, `kong`, `auth` et `rest` compris, alors
qu'ils étaient sains — d'où des services qui répondent `200` puis disparaissent
au milieu d'une exécution de tests. Le symptôme trompe : il ressemble à une
migration qui échoue. Il n'y en avait aucune. La parade, sans toucher à
`config.toml` — aucun de ces cinq services n'est utilisé par la suite de tests :

```bash
npx supabase start -x logflare,vector,realtime,storage-api,postgres-meta,studio,imgproxy,edge-runtime,supavisor
```

**Ce que l'exécution a donné.** `db reset` applique les neuf migrations,
`20260819010000` comprise ; ses trois garde-fous passent, ce qui se déduit du
succès lui-même — un `raise exception` dans un bloc `do $$` aurait arrêté le
reset. Puis 63 tests sur 63, dont les neuf de `bornes.test.ts`.

**Un test a dû être corrigé, et c'est le plus instructif du lot.**
`isolation.test.ts` n°4 attendait `42501` sur une mise posée sur la carte
d'autrui — la violation du `with check` de `mises_insert`. Il reçoit désormais
`P0001 CARTE_INTROUVABLE`. L'insertion était refusée avant, elle l'est toujours :
ce qui a changé, c'est que le refus arrive plus tôt, au déclencheur, avant que
les messages d'état ne décrivent une carte que l'appelant ne peut pas lire.
C'est exactement le durcissement décrit plus haut, et le test asserte maintenant
le contrat fort, en vérifiant explicitement que `MONTANT_INVALIDE` ne fuit plus.

**Sur `kolek-prod`.** La migration y est appliquée, confirmé au catalogue. Un
premier compte d'administration existe désormais — créé au tableau de bord, puis
inscrit dans `public.admins`, `est_admin()` rendant `true`. Contrôlé dans la
foulée : cela n'ouvre rien au rôle anonyme. Les neuf tables répondent toujours
`401 / 42501` à la clé publiée, `rpc est_admin` aussi, et `storage.buckets` reste
vide.

**Le « test du non-admin » était mal classé, et c'est corrigé.** Il figurait en
⚪️ depuis le 2026-08-18 comme s'il n'existait pas. Le contrat serveur, lui, est
tenu par un test vert depuis le premier jour — `isolation.test.ts`, « portillon
du Dashboard Admin » : `est_admin()` rend faux pour un collecteur ordinaire, vrai
une fois la ligne insérée dans `admins`, et la table reste inaccessible en
lecture dans les deux cas (`42501`).

Ce qui n'était couvert par rien, c'est la **branche d'interface**. `Portillon.tsx`
porte en commentaire la propriété qui compte — « un portillon qui s'ouvre quand
il ne sait pas n'est pas un portillon » — et aucun test ne la posait. Une erreur
réseau, un jet du constructeur de requête, une réponse qui n'arrive jamais :
trois chemins où un `useState` mal placé ouvrirait le tableau de bord à qui
passe. `apps/admin` n'avait d'ailleurs aucun harnais de test.

Ajouté : `apps/admin/src/Portillon.test.tsx`, cinq cas — la coquille s'ouvre sur
`true`, et reste fermée sur `false`, sur erreur, sur jet, et tant que la réponse
n'est pas arrivée. Le harnais reprend celui de `packages/ui` sans le modifier.
Le nettoyage entre rendus y est explicite : `@testing-library/react` ne branche
le sien qu'avec les globales de vitest, que ce dépôt n'active pas — sans lui, un
test de refus passe parce qu'il retrouve la coquille du test précédent.

### Contrôle 11, mesuré trois fois — et ce que les trois mesures apprennent

Le débit sur `/token` n'est pas lisible depuis l'extérieur — c'est ce qui le
maintenait en ⚪️ depuis le 2026-08-18. Il est en revanche **mesurable**.

Sonde : connexions échouées en rafale depuis une seule IP, sur une adresse qui
n'existe pas (`sonde-debit-inexistant@kolek.test`) — aucun compte réel touché,
aucun verrouillage provoqué.

```
2026-08-20, fenêtre non purgée    429 à la 54ᵉ tentative
2026-08-20, après 7 min de pause  429 à la 40ᵉ tentative, en 19 s
2026-08-20, fenêtre franchement froide  429 à la 33ᵉ tentative, en 17 s
```

**Le chiffre n'est pas stable, et c'est le résultat.** Trois mesures propres ou
semi-propres donnent 54, 40, 33. Une première rédaction de ce rapport annonçait
« une cinquantaine de tentatives par fenêtre » sur la foi de la première seule :
c'était une extrapolation à partir d'un échantillon de un, et elle était fausse.

Ce qu'on peut affirmer, et rien de plus :

- le plafond **existe** et se déclenche ;
- il tombe en **moins de 20 secondes** de martèlement continu ;
- il se situe dans les **dizaines** de tentatives, pas dans les centaines ni
  dans les unités.

Ce qu'on ne peut **pas** affirmer : la valeur du réglage. Une fenêtre glissante
ne rend pas le même compte selon l'instant où on l'attaque, et aucune des trois
sondes ne permet de dire si le réglage a été modifié entre-temps ou si l'écart
n'est que la respiration de la fenêtre. Le `sign_in_sign_ups = 30` de
`config.toml` reste sans valeur probante ici : ce fichier ne gouverne que le
conteneur local.

Large ne veut pas dire absent : une attaque par dictionnaire est ralentie de
plusieurs ordres de grandeur, et l'inscription étant fermée, `/token` est la
seule surface.

Si tu veux une valeur certaine plutôt qu'un ordre de grandeur, elle se lit dans
Authentication → Rate limits — et c'est le même genre de réglage que la longueur
minimale : **déclaré**, pas mesuré.

### Ce que `/auth/v1/settings` publie, et qui vaut d'être consigné

Cet endpoint ne dit rien des mots de passe, mais il dit tout de la **surface**
d'authentification, sans clé privilégiée. Relevé le 2026-08-20 :

```
disable_signup      true     inscription fermée — mesuré, plus seulement affirmé
anonymous_users     false    pas de session anonyme
email               true     seul fournisseur actif
phone               false    pas de SMS
mailer_autoconfirm  false    l'adresse doit être confirmée
saml_enabled        false    passkeys_enabled false
```

Les vingt-quatre fournisseurs externes — Google, GitHub, Apple, Azure, et le
reste — sont tous à `false`. Aucun OAuth à surveiller, aucune redirection
tierce, aucun `redirect_to` à valider chez un fournisseur. La surface
d'authentification de Kolek est un seul endpoint, `/token`, sur un seul
fournisseur, avec l'inscription fermée. C'est le meilleur résultat de cet audit
et il n'avait jamais été écrit noir sur blanc.

### La protection contre les mots de passe divulgués reste non mesurable

Elle ne s'applique qu'au moment où un mot de passe est **posé** : inscription,
changement, ou fin de récupération. Les trois sont hors de portée d'une sonde
inoffensive.

- L'inscription est fermée — `422 signup_disabled` tranche avant toute
  validation de mot de passe.
- `POST /auth/v1/recover` n'envoie qu'un courriel ; il ne pose aucun mot de
  passe.
- `PUT /auth/v1/user` avec un mot de passe notoirement compromis trancherait la
  question — et c'est précisément pour ça qu'il est écarté. En cas de refus on
  apprendrait que la protection est active ; en cas de succès on l'apprendrait
  aussi, **en ayant remplacé le mot de passe d'un vrai compte par un mot de
  passe figurant dans les fuites publiques**. La branche qui informe est la
  branche qui nuit.

Même règle que pour la longueur minimale, et pour la même raison : une sonde qui
modifie ce qu'elle mesure n'est pas une mesure. Ce réglage se lit dans
Authentication → Policies, et reste **déclaré**.

L'exploitant l'a lu le 2026-08-20 : **désactivé**. Conséquences en « 2. Mots de
passe » plus haut — c'est le durcissement prioritaire de ce rapport.

### Pourquoi la longueur minimale a dû être lue à la main

Le chiffre est connu — **8** — mais il vient du tableau de bord, pas d'une
sonde. Trois tentatives pour l'obtenir depuis le terminal ont échoué, et il vaut
mieux écrire pourquoi que de laisser croire qu'on n'a pas essayé.

- `/auth/v1/settings` ne publie pas les exigences de mot de passe.
- `POST /auth/v1/signup` avec un mot de passe de trois caractères rend
  `422 signup_disabled` : le refus d'inscription tranche avant la validation, la
  sonde n'apprend rien.
- `supabase config` n'a qu'un `push`, pas de `pull` — et pousser écraserait le
  distant avec le `config.toml` local, dont le `site_url` pointe encore sur
  `127.0.0.1:3000`. Casser l'authentification en production pour lire un réglage
  n'est pas un audit.

La quatrième voie — changer le mot de passe du compte admin avec une chaîne
courte pour voir si le serveur refuse — a été écartée volontairement : si aucun
minimum n'était appliqué, la sonde aurait réellement changé le mot de passe.
Une sonde qui modifie ce qu'elle mesure n'est pas une mesure.

D'où la règle tenue dans tout ce rapport : ce chiffre est **déclaré**, pas
**mesuré**, et il est écrit comme tel.

### Le parcours en production, fait de bout en bout — 2026-08-20

Ce point était laissé ouvert la veille au motif que créer un second compte
demandait le tableau de bord ou la clé de service. Le compte a été créé, et le
parcours joué en entier.

Vérification côté base, faite depuis le terminal sans clé de service, par
`supabase inspect db table-stats --linked` :

```
public.collecteurs   2 lignes
public.admins        1 ligne
```

Deux comptes Auth existent — le déclencheur `on_auth_user_created` crée une
ligne `collecteurs` par compte — et un seul figure dans `admins`. Réserve de
méthode, qui vaut d'être écrite : ces chiffres viennent de `pg_class.reltuples`,
une estimation rafraîchie par l'autovacuum, pas d'un `count(*)`. Sur des tables
de deux lignes elle est fiable, mais c'est une estimation.

Ce que l'estimation ne prouvait pas, l'écran l'a montré : connexion sur
`kolek-admin.netlify.app` avec le second compte, et le portillon rend « Accès
réservé — ce compte n'est pas un compte d'administration GTCS », avec pour seule
action « Se déconnecter ». Pas de coquille, pas de tableau de bord.

Les trois niveaux disent donc la même chose, ce qui est le seul résultat
intéressant : `est_admin()` rend faux côté serveur (`isolation.test.ts`), la
branche d'interface refuse et ne s'ouvre sur aucune incertitude
(`Portillon.test.tsx`), et la production se comporte comme les deux.
