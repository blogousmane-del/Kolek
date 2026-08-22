# Audit de sécurité — Kolek, 2026-08-21

**Verdict : la posture est saine, la livraison ne l'est pas.**
Les vingt contrôles ne relèvent aucune faille exploitable dans le code du dépôt,
et l'essentiel a été **mesuré en production** ce soir : la base refuse le rôle
anonyme sur ses neuf tables, les cinq Edge Functions refusent un appel sans
jeton, l'inscription publique est fermée, les en-têtes sont en place sur les
trois cibles. Ce qui ne va pas est ailleurs, et c'est le contrôle de fraîcheur
ajouté hier qui l'a dit : **les trois sites servent une construction plus
ancienne que le dépôt**, et l'un des deux instruments de contrôle de l'argent —
le rapprochement de caisse — est devenu faux le jour où la clôture de carte est
entrée en service.

| | Nombre |
|---|---|
| 🔴 Bloquant | 0 démontré |
| 🟠 Important | 3 |
| 🟡 À faire | 6 |
| ⚪️ Non vérifié | 3 |

**Méthode.** Scan automatique des quinze contrôles outillables, puis lecture des
cinq Edge Functions, des douze migrations et des chemins d'écriture des deux
applications. Sondes en production, sans écriture : rôle anonyme sur les neuf
tables, `est_admin` en RPC, les cinq fonctions sans jeton, préalable CORS depuis
une origine étrangère, en-têtes et artefacts des trois sites. Suite du dépôt
rejouée : 37 tests d'applications, 28 tests de scripts, 157 tests de base — tous
verts. `npm audit` : zéro vulnérabilité.

---

## 🟠 1. La production ne sert pas le code audité

**Mesuré le 2026-08-21 à 23 h 54**, par `npm run verifier:en-ligne` puis
confirmé au contenu des artefacts servis :

```
collecteur  servi /assets/index-CVKV-Zhh.js   attendu /assets/index-uyPsaSf3.js
admin       servi /assets/index-BrlYXVRl.js   attendu /assets/index-B1DQFKWf.js
site        servi /assets/index-8hmtC8NN.js   attendu /assets/index-aCUHLYwG.js
```

La divergence n'est pas une question d'empreinte : les marqueurs du code récent
sont **absents des paquets servis**, présents dans la construction locale.

| Marqueur cherché | En ligne | Local |
|---|---|---|
| `collecteur-cloturer-carte` | 0 | 1 |
| `Rapprochement` | 0 | 1 |
| `admin-supprimer-collecteur` | 0 | 1 |
| `admin-modifier-collecteur` | 0 | 1 |
| `MOT_DE_PASSE_COMPROMIS` | 0 | 1 |

Ce que cela veut dire concrètement : le collecteur qui ouvre l'application sur
son téléphone **n'a ni l'écran de clôture, ni le rapprochement de caisse**.
L'administrateur n'a ni la modification, ni la suppression d'un collecteur, ni
le message qui explique un mot de passe refusé.

Ce n'est pas une faille : rien ne s'ouvre, l'ancienne version est simplement
plus pauvre. C'est plus gênant que ça — **c'est la validité de l'audit
lui-même.** Trois passes d'audit successives ont conclu sur du code que personne
n'exécute. Tant que l'écart subsiste, chaque phrase de ce rapport décrit le
dépôt, pas le service rendu.

Deux points rassurants, mesurés séparément :

- **Les Edge Functions, elles, sont à jour.** Le préalable CORS depuis
  `https://evil.example` ne reçoit aucun `Access-Control-Allow-Origin`, celui de
  `https://kolek-admin.netlify.app` en reçoit un — c'est le comportement de
  `_shared/cors.ts` dans sa version corrigée. Les cinq fonctions répondent 401
  sans jeton, donc les cinq sont déployées. Le filtre des mots de passe
  divulgués est donc bien actif sur le seul chemin de création de compte.
- **Aucune fuite dans ce qui est servi.** Les artefacts en ligne ont été
  téléchargés et passés au détecteur de clés : rien.

**La correction :** redéployer les trois sites, puis rejouer
`npm run build && npm run verifier:en-ligne` jusqu'à obtenir les trois
« conforme ». Et déplacer ce contrôle là où il ne dépend pas d'une intention —
tant qu'il faut penser à le lancer, il redira « conforme » le jour où on
oubliera de le lancer.

---

## 🟠 2. Le rapprochement de caisse est faux depuis la mise en service de la clôture

**Où :** `supabase/migrations/20260816115500_durcissement_audit.sql:36-52`

```sql
create or replace function public.cash_attendu_du_jour(p_collecteur uuid, p_date date)
returns integer ...
  select coalesce(sum(montant), 0)::integer
    from public.mises
   where collecteur_id = p_collecteur
     and (encaisse_le at time zone 'UTC')::date = p_date;
```

La fonction somme les mises. Elle ne soustrait pas les restitutions. Le commentaire
qui l'accompagne l'annonce lui-même, et il a cessé d'être vrai :

> *« La formule n'est volontairement pas anticipée ici — la table `retraits`
> n'est écrite qu'à partir de J3 […] Tant que J3 n'est pas fait, l'attendu d'une
> journée avec clôture de carte est trop haut, et l'écart apparaîtra négatif à
> tort. »*

J3 est fait. `collecteur-cloturer-carte` est déployée et écrit dans `retraits`.
`caisses_jour.ecart` étant une colonne engendrée `cash_declare - cash_attendu`,
toute journée comportant une clôture affiche désormais **un manquant de caisse
exactement égal à l'argent rendu au client**.

Le dégât n'est pas la perte d'argent — le cash physique tranche. C'est que
l'instrument censé détecter un manquant en fabrique un à chaque clôture. Un
écart négatif cesse d'être un signal : il devient le bruit de fond, et un vrai
manquant s'y cache sans effort. C'est la seule ligne de défense contre le
détournement au marché, et elle est aveugle depuis hier.

**La correction :** un terme, au seul endroit prévu pour lui.

```sql
create or replace function public.cash_attendu_du_jour(p_collecteur uuid, p_date date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    coalesce((select sum(montant) from public.mises
               where collecteur_id = p_collecteur
                 and (encaisse_le at time zone 'UTC')::date = p_date), 0)
  - coalesce((select sum(montant_restitue) from public.retraits
               where collecteur_id = p_collecteur
                 and (effectue_le at time zone 'UTC')::date = p_date), 0)
  )::integer;
$$;
```

Deux conséquences à traiter dans la même migration, sinon la correction en
introduit une autre :

1. **La contrainte `caisses_cash_declare_positif` reste juste**, mais
   `cash_attendu` peut désormais devenir négatif — une journée sans encaissement
   et avec une clôture. Aucune contrainte ne l'interdit aujourd'hui ; le
   vérifier plutôt que le supposer.
2. **Un déclencheur de rafraîchissement manque côté `retraits`.**
   `mises_rafraichir_caisse` recalcule l'attendu à chaque mise ; rien
   d'équivalent n'existe à l'écriture d'un retrait. Sans lui, une clôture
   postérieure à la déclaration de caisse laisse l'écart faux pour toujours —
   exactement le défaut que ce déclencheur-là avait été écrit pour empêcher côté
   mises.

---

## 🟠 3. Une clôture rejouée rend un montant que le journal n'enregistre pas

**Où :** `supabase/functions/collecteur-cloturer-carte/index.ts:149-186`

L'en-tête du fichier décrit l'idempotence ainsi :

> *« une seconde tentative […] bute sur `23505`, et la fonction **reprend alors
> la ligne existante** au lieu d'échouer. »*

Elle ne la reprend pas. Elle ignore le `23505` et poursuit avec le montant
qu'elle vient de recalculer :

```ts
if (erreurRetrait && erreurRetrait.code !== '23505') { … }
// puis, plus bas, sans relire la ligne existante :
return reponse({ montantRestitue: partage.montantRestitue, commission: partage.commission }, 200, requete);
```

L'enchaînement qui rend les deux chiffres différents :

1. Une première tentative écrit la ligne de retrait — mettons 9 × mise — puis
   échoue à passer la carte en `cloturee`. La fonction rend `207
   CLOTURE_PARTIELLE`. **La carte reste active.**
2. La carte étant active, elle peut encore encaisser. Une mise de plus est
   enregistrée.
3. Seconde tentative : le montant est recalculé sur l'état courant, soit
   10 × mise. L'insertion bute sur `23505` et est ignorée. La carte se ferme.
   La fonction rend **200 avec 10 × mise**.

Le collecteur rend 10 × mise. `retraits` en porte 9. L'écart part dans la nature,
et la table est immuable : la ligne fausse ne se corrige pas.

C'est un chemin étroit — il exige l'échec de la seconde écriture — mais c'est le
chemin que le code prétend justement traiter, et aucun test ne l'exerce.
`supabase/tests/cloture-carte.test.ts:148-152` ne vérifie que la contrainte
d'unicité en base, jamais le comportement de la fonction au rejeu.

**La correction :** sur `23505`, relire la ligne et rendre ce qu'elle porte.

```ts
if (erreurRetrait?.code === '23505') {
  const { data: existant } = await clientService
    .from('retraits')
    .select('montant_restitue, commission')
    .eq('carte_id', carte.id)
    .maybeSingle();
  if (existant) partage = {
    montantRestitue: existant.montant_restitue,
    commission: existant.commission,
  };
}
```

Et un test qui écrit un retrait, ajoute une mise, puis appelle la fonction — il
doit rendre le montant journalisé, pas le montant recalculé.

---

## 🟡 Durcissement

1. **Le jeton de session vit dans `localStorage`** (contrôle 9). C'est le défaut
   de `supabase-js` et le choix normal d'une application à page unique. La CSP
   servie — `script-src 'self'`, `object-src 'none'`, `base-uri 'none'` — rend
   l'injection de script difficile, mais un jeton en `localStorage` reste
   lisible par tout script qui s'exécuterait dans la page.
2. **`style-src 'unsafe-inline'`** sur les trois cibles (contrôle 18). Sans
   conséquence directe — l'injection de style ne donne pas l'exécution — mais
   c'est la dernière source non nommée de ces CSP.
3. **Aucun rate limiting propre aux Edge Functions** (contrôle 11). Les cinq
   exigent un jeton valide, donc l'abus suppose déjà un compte ; l'authentification
   elle-même est bornée par la plateforme (`sign_in_sign_ups = 30` par tranche de
   cinq minutes). Le point à surveiller est `admin-creer-collecteur`, seul appel
   sortant du système (Have I Been Pwned) — réservé aux administrateurs.
4. **Les données personnelles ne sont chiffrées qu'au repos, par la plateforme**
   (contrôle 5). Noms, téléphones et marchés des clients sont en clair dans les
   colonnes. Acceptable au stade actuel ; à revoir si le pilote grandit.
5. **`auth.admin.createUser` ignore toujours les règles de mot de passe chez
   l'éditeur** ([supabase/auth#1959](https://github.com/supabase/auth/issues/1959)),
   constat reconduit des trois audits précédents. `_shared/hibp.ts` couvre le seul
   chemin existant. Toute création de compte future — script, second point
   d'entrée, tableau de bord Supabase — retombe dans le trou. Le jour venu, la
   faire passer par ce module, pas le réécrire.
6. **Les lectures de liste du collecteur n'ont pas de borne explicite.**
   `chargerBilan` et `chargerProfil` comptent `clients` et `cartes` sur les
   lignes rendues, et `max_rows = 1000` les tronque en silence. Aucun palier
   n'autorise mille clients aujourd'hui, donc le chiffre est juste — par
   circonstance, pas par construction. Un `count: 'exact', head: true` dirait la
   même chose sans dépendre du palier.

---

## ⚪️ Non vérifié

1. **Le compte de sonde de production**, 🔴 des deux audits précédents — celui
   créé avec `password123` avant que le filtre n'existe. Depuis,
   `admin-supprimer-collecteur` a été écrite et déployée pour permettre ce
   geste ; **rien ici ne prouve qu'il a été fait.** Lire `auth.users` exige la
   clé de service de production, absente de cette machine (seules les clés du
   conteneur local y sont). Et l'écran d'administration qui appellerait la
   fonction n'est pas en ligne — voir le 🟠 n°1.
   *Pour trancher, quinze secondes :* tableau de bord Supabase → Authentication →
   Users, et compter. Deux comptes attendus, quatre au dernier relevé.
2. **L'état des migrations en production.** Douze migrations existent dans le
   dépôt ; `Docs/deploiement.md:59` en annonce encore « sept ». Rien ne dit d'ici
   si les cinq dernières — dont `20260821090000_journal_identites` — sont
   appliquées au projet distant. Les garde-fous internes font échouer un
   `db push` incomplet, donc l'information existe : elle n'est simplement pas
   consignée.
   *Pour trancher :* `npx supabase migration list --linked`.
3. **Le hachage des mots de passe** (contrôle 10) reste déclaré, pas mesuré :
   `auth.users` n'est pas lisible, et il n'existe aucune sonde non destructrice.
   GoTrue utilise bcrypt ; le vérifier exigerait un accès que personne ne devrait
   avoir.

---

## Les vingt contrôles

| # | Contrôle | Statut | Note |
|---|---|---|---|
| 1 | Clés API cachées | ✅ | scan à blanc ; artefacts servis retéléchargés et passés au détecteur |
| 2 | Secrets purgés de Git | ✅ | aucun `.env` suivi ni présent dans l'historique ; `.gitignore` couvre `.env*` |
| 3 | Bonne clé côté client | ✅ | `anon` seule dans les deux applications ; `service_role` uniquement dans les Edge Functions et le harnais de test |
| 4 | Row Level Security | ✅ | **mesuré en production** : les neuf tables refusent `anon` (42501) ; 157 tests locaux d'isolation verts |
| 5 | Chiffrement des données sensibles | 🟡 | au repos seulement, par la plateforme |
| 6 | Autorisation côté serveur | ✅ | `est_admin()` appelée sous le jeton de l'appelant dans les quatre fonctions d'administration ; le portillon de l'interface n'est pas la garantie |
| 7 | Verrouillage par enregistrement | ✅ | `collecteur_id = auth.uid()` sur les sept tables métier ; la clôture prouve la propriété par la lecture RLS avant d'écrire |
| 8 | Champs non modifiables | ✅ | liste blanche par colonne, plus trois garde-fous qui font échouer la migration |
| 9 | Cookies de session | 🟡 | jeton en `localStorage` ; CSP stricte en atténuation |
| 10 | Mots de passe hachés | ⚪️ | délégué à GoTrue, non mesurable sans accès à `auth` |
| 11 | Rate limiting | 🟡 | plateforme côté authentification ; rien côté Edge Functions, mais jeton exigé |
| 12 | Protection anti-bot | NON APPLICABLE | inscription publique fermée — `disable_signup: true`, mesuré ce soir |
| 13 | Requêtes paramétrées | ✅ | aucun SQL concaténé ; PostgREST et fonctions SQL à paramètres typés |
| 14 | Validation des entrées | ✅ | `_shared/valider-collecteur.ts`, contraintes `CHECK`, déclencheurs — trois couches, testées |
| 15 | Échappement du contenu | ✅ | aucun `innerHTML`, aucun `dangerouslySetInnerHTML` |
| 16 | Uploads restreints | NON APPLICABLE | aucun bucket ; l'héritage de privilèges de `storage` est coupé et un garde-fou refuse tout bucket non déclaré |
| 17 | Réponses API épurées | ✅ | colonnes nommées partout ; le seul `select('*')` est dans un test d'isolation |
| 18 | Headers de sécurité | 🟡 | tous présents et mesurés en ligne ; `style-src 'unsafe-inline'` subsiste |
| 19 | HTTPS forcé | ✅ | HSTS un an, sous-domaines compris, sur les trois cibles |
| 20 | Dépendances scannées | ✅ | `npm audit` — zéro vulnérabilité, développement compris |

---

## Ce que je propose de faire, dans l'ordre

1. **Redéployer les trois sites**, et vérifier par le contrôle de fraîcheur.
   Sans cela, tout le reste porte sur du code que personne n'exécute.
2. **Corriger `cash_attendu_du_jour`** et lui adjoindre le déclencheur de
   rafraîchissement sur `retraits`. C'est le contrôle de l'argent, et il est
   faux aujourd'hui.
3. **Réparer le rejeu de la clôture**, avec le test qui manque.
4. **Trancher les trois ⚪️** — deux commandes et un coup d'œil au tableau de
   bord.

Je n'ai rien modifié : l'audit et la correction sont deux gestes. Dis-moi par
lequel commencer.
