# Vérification de l'audit du 2026-08-24

**Date :** 2026-08-25 · **Objet :** reprendre chaque constat de
`2026-08-24-audit-securite-20-controles.md` et le remesurer, plutôt que le
relire.

**Verdict : le « 0 bloquant » ne tient plus.** Non parce qu'un contrôle était
mal fait, mais parce qu'aucun des vingt ne pouvait voir ce qui s'est passé le
même jour : une clé `service_role` a été publiée puis retirée, et elle n'a
jamais été révoquée. Onze constats sont confirmés à l'identique, deux défauts
sont corrigés par ce commit, un troisième est décrit ici parce qu'il ne **peut
pas** être corrigé depuis le dépôt.

| | Nombre |
|---|---|
| 🔴 Bloquant (nouveau) | 1 |
| 🔴 Corrigé ici | 1 |
| 🟡 Corrigé ici | 1 |
| 🟡 Ouvert, hors de portée du dépôt | 1 |
| ✅ Confirmé par nouvelle mesure | 11 |

---

## 🔴 Le verdict « PRÊT À LANCER » est caduc

**Le contrôle n°3 dit vrai et conclut faux.** « Zéro `service_role` dans les
trois bundles en ligne » : remesuré aujourd'hui, c'est exact — les trois
paquets servis en contiennent zéro.

Mais le 2026-08-24, `kolek-site` a servi pendant plusieurs minutes un paquet
contenant le JWT de rôle service en clair, à la suite d'une valeur collée dans
`VITE_SUPABASE_ANON_KEY`. Le paquet a été remplacé. **La clé, elle, n'a pas été
révoquée.**

Mesure du jour, faite avec la clé publique uniquement — si le secret JWT avait
tourné, la clé anonyme d'avant l'incident serait morte elle aussi :

```
clé anon d'avant l'incident → /auth/v1/settings : 200
```

Elle répond. Donc le secret n'a pas tourné. Donc la clé `service_role` publiée
ce jour-là est **toujours valide** : lecture et écriture de la base entière,
politiques RLS ignorées, jusqu'en 2036.

Un contrôle qui regarde l'état courant ne peut pas voir une clé déjà copiée.
C'est la limite de la méthode, pas une erreur de l'auditeur — mais la
conséquence est qu'aucun autre constat de l'audit ne compte tant que celui-ci
tient.

**Correction — et elle n'appartient pas au dépôt :** Supabase → Settings → API →
JWT Secret → *Generate new secret*. Puis la nouvelle clé `anon` dans les trois
sites Netlify, et redéployer. Toutes les sessions ouvertes tombent ; c'est le
prix, et il est très inférieur à celui d'une base ouverte.

*Ce qui empêche que cela se reproduise est déjà en place :* le greffon
`scripts/garde-env.mjs`, ajouté le 24, fait échouer la construction — code de
sortie 1, donc déploiement interrompu — quand la configuration porte un
`service_role`, un `sb_secret_`, un jeton tronqué, ou l'adresse et la clé
inversées.

---

## 🔴 Corrigé — le cash attendu accusait le collecteur à tort

L'audit le classait « hors des vingt contrôles ». C'est pourtant le défaut le
plus coûteux du lot, parce qu'il ne fuit rien : il **accuse**.

`cash_attendu_du_jour` n'additionnait que les mises. Un collecteur qui clôture
une carte le matin — il sort l'argent de sa sacoche et le rend à sa cliente —
puis compte le soir se voyait annoncer un attendu contenant toujours cette
somme. Il constatait un manquant qui n'existait pas. Sur un produit dont le
sujet est la confiance entre un collecteur et son argent, le dispositif censé le
rassurer devenait celui qui l'accusait.

Confirmé sur la définition en base, pas sur le fichier : la fonction ne
mentionnait pas `retraits`.

**Le piège que la correction proposée contenait.** L'audit écrivait
`cloture_le`. Cette colonne n'existe pas — `retraits` porte `effectue_le`.
Appliquée telle quelle, la correction aurait échoué en `42703`. C'est
exactement pourquoi une correction d'argent se vérifie par un test qui exerce
la journée, et ne se recopie pas.

Trois pièces, parce qu'un seul des trois endroits aurait laissé une incohérence
visible par le collecteur :

1. `cash_attendu_du_jour` soustrait les restitutions du jour ;
2. un déclencheur `retraits_rafraichir_caisse`, jumeau de celui des mises, sans
   lequel une clôture postérieure à une déclaration laisserait le chiffre figé ;
3. le miroir côté téléphone, qui calcule l'attendu **avant** toute écriture —
   s'ils divergent, le nombre change au moment où le collecteur déclare,
   c'est-à-dire au moment où il compte.

Deux tests exercent la journée entière : encaisser, rendre, déclarer ; puis
déclarer, rendre, relire.

---

## 🟡 Corrigé — un `journaliser` resté ouvert

`journaliser` et `journaliser_demande` sont révoquées ; `journaliser_collecteur`
gardait le droit d'exécution par défaut, c'est-à-dire PUBLIC.

L'impact réel est faible : une fonction qui rend `trigger` n'est pas exposée par
PostgREST, et appelée hors déclencheur elle échoue. Ce qui compte est
l'asymétrie — trois fonctions sœurs, deux fermées, une ouverte, sans raison
écrite nulle part. C'est ainsi qu'une quatrième naîtra ouverte.

---

## 🟡 Ouvert — `pg_net` accorde l'appel HTTP à `anon` et `authenticated`

Absent de l'audit, et pour une raison compréhensible : l'extension est arrivée
la veille, avec le drainage planifié des avis
(`20260823170000_avis_drainage_planifie.sql`).

Mesuré :

```
net.http_get  | anon=X/supabase_admin  authenticated=X/supabase_admin  service_role=X/…
net.http_post | anon=X/supabase_admin  authenticated=X/supabase_admin  service_role=X/…
schéma net, usage → anon: true, authenticated: true
```

C'est le pouvoir de faire émettre à la base une requête HTTP arbitraire —
depuis l'intérieur du réseau Supabase — accordé à tout porteur de la clé
anonyme.

**Ce n'est pas une porte ouverte aujourd'hui.** PostgREST n'expose que le schéma
`public` (`schemas = ["public"]`), `net` n'est pas dans `extra_search_path`, et
la sonde en production le confirme :

```
POST /rest/v1/rpc/http_post → 404
```

**Et ce n'est pas corrigeable depuis une migration.** Les droits ont été
accordés par `supabase_admin` ; `postgres`, sous lequel tournent les migrations,
n'en est pas le donneur. PostgreSQL n'échoue pas — il émet `WARNING: no
privileges could be revoked for "net"` et ne change rien. Mesuré, pas supposé.
Une révocation laissée dans la migration serait un no-op qui ressemble à une
protection : pire qu'une absence, parce qu'on croirait le sujet traité.

**Ce qu'il faut donc surveiller**, puisqu'on ne peut pas fermer : ne jamais
ajouter `net` à `[api] schemas` ni à `extra_search_path`, et n'écrire aucune
fonction `security invoker` de `public` qui appelle `net`. Le sujet est à
remonter à Supabase.

---

## ⚠️ Hors sécurité — deux migrations partageaient le même numéro

`20260825090000_cartes_multiples.sql` existait déjà quand la correction du cash
attendu a été écrite sous le même préfixe.

```
supabase_migrations.schema_migrations : PRIMARY KEY (version)
```

La version est le nombre qui ouvre le nom de fichier. Deux fichiers le
partageant ne laissent qu'une ligne : l'un des deux n'atteint jamais le distant.
C'est le défaut du 2026-08-23 — un ajout à une migration déjà appliquée qui
n'était jamais parti — sous une autre forme. Renommé en `20260825110000`.

---

## Confirmé par nouvelle mesure

| Contrôle | Mesure du 2026-08-25 |
|---|---|
| 1 — clés en dur | 0 motif `sk-`, `AKIA…`, `pk_live_` |
| 3 — bonne clé côté client | 0 `service_role` dans les trois paquets servis |
| 4 — RLS | 12 tables, 12 avec RLS, 0 politique `true` |
| 6 — autorisation serveur | 7 fonctions `admin-*`, 7 appellent `est_admin` |
| 8 — champs non modifiables | `authenticated` : 25 colonnes en insertion, 11 en mise à jour |
| 13 — SQL dynamique | aucun dans les 20 migrations |
| 15 — échappement | 0 `dangerouslySetInnerHTML`, 0 `innerHTML` |
| 17 — réponses épurées | 0 `select('*')` hors tests |
| 18 — en-têtes | 6/6 sur les trois sites |
| 19 — HTTPS | 301 + HSTS sur les trois |
| 20 — dépendances | `npm audit --omit=dev` : 0 vulnérabilité |

Le rôle anonyme a toujours **0 privilège** sur les douze tables — pas « RLS le
bloque » : aucun `GRANT`, sur aucune colonne.

---

## Une observation d'outillage

La suite de tests de base échoue par intermittence sous charge : `hookTimeout`
est à 10 s, et `creerCollecteur` fait de vrais appels d'authentification. Deux
fichiers ont expiré pendant une exécution concurrente à trois constructions, et
sont repassés au vert isolés. Ce ne sont pas des régressions — mais un échec qui
dépend de la charge de la machine finira par être lu comme du bruit, et c'est
ainsi qu'on cesse de regarder les échecs.
