# 2026-09-09 — Vérification de l'audit du 3 septembre

**Périmètre :** les onze constats laissés ouverts par
[l'audit du 2026-09-03](2026-09-03-audit-securite-20-controles.md), remesurés un
par un contre le dépôt d'aujourd'hui et contre la base locale interrogée en
direct. Ce document ne rejoue pas les vingt contrôles : il vérifie ce que le
précédent a laissé, et corrige ce qui pouvait l'être.

**Verdict : trois constats étaient déjà fermés, quatre sont fermés ici, et
l'un d'eux n'était pas fermé du tout — je l'avais déclaré à tort.**

| | Nombre |
|---|---|
| 🟠 fermé depuis | 1 |
| 🟡 fermé ici | 4 |
| 🟡 resté ouvert, argumenté | 4 |
| ⚪️ toujours hors de portée | 2 |
| 🔵 ajouté aujourd'hui | 1 — scalabilité |

---

## L'erreur de vérification, d'abord

Il faut la mettre en tête parce qu'elle change la lecture de tout le reste.

En vérifiant le constat « trois fonctions `security definer` exécutables par
`anon` », j'ai interrogé le catalogue ainsi :

```sql
where array_to_string(p.proacl, ',') like '%anon=%'
```

Zéro ligne. J'en ai conclu, et écrit, que les trois étaient refermées.

**C'était faux.** Le droit accordé à `PUBLIC` s'écrit `=X/postgres` dans
`pg_proc.proacl` : la partie avant le `=` est le bénéficiaire, et pour `PUBLIC`
elle est **vide**. Un droit accordé à tout le monde ne nomme donc personne, et
une recherche sur le nom d'un rôle ne le voit pas. Les trois fonctions étaient
grandes ouvertes :

```
public.journaliser_admin()     [=X/postgres | postgres=X/postgres | service_role=X/postgres]
public.paiements_immuables()   [=X/postgres | …]
public.paiements_naissance()   [=X/postgres | …]
```

Ce qui l'a rattrapé n'est pas une relecture : c'est le garde-fou écrit ensuite,
qui a échoué à son premier passage. La leçon vaut plus que le correctif — **une
vérification à la main qui rend « rien » ne prouve rien tant qu'on ne l'a pas
vue trouver quelque chose.**

---

## Fermés ici

### 🟡 `abonnement_ouvre_droit` ne répond plus que sur son appelant

Migration `20260909120000`. La fonction était `security definer`, ouverte à
`authenticated`, et son corps un `exists` sur l'identifiant reçu — sans aucune
comparaison à `auth.uid()`. Tout collecteur connecté pouvait demander si un
identifiant arbitraire portait un abonnement actif.

C'est un oracle booléen : il faut déjà connaître l'UUID, et la réponse dit peu.
Ce qui justifiait la correction n'est pas sa gravité, c'est que c'était le
**seul écart de motif** du schéma — `equipe_clients`, écrite le même jour, borne
le sien à la ligne d'à côté. Une exception qui traîne devient le précédent qu'on
cite.

Mesuré avant : `expected true to be false`. Le resserrage ne casse rien, et
c'est vérifié plutôt que supposé : les deux seuls sites d'appel sont les
policies `clients_insert` et `cartes_insert`, lues sur `pg_policies` et non dans
un fichier de migration qui pourrait avoir été remplacé depuis ; toutes deux
passent `(select auth.uid())`. Aucune Edge Function ne l'appelle.

Trois tests, dont un qui garde l'autre bord : un resserrage rendant `false` pour
tout le monde fermerait l'ouverture de client aux collecteurs à jour, et le
premier test resterait vert.

### 🟡 Aucune fonction `security definer` n'est plus atteignable sans session

Migration `20260909130000`. Le 3 septembre demandait « un garde-fou » ; le voici,
avec la révocation qui allait avec.

La passe est dynamique plutôt que nominative — trois noms en dur corrigeraient
trois fonctions et vieilliraient mal. Elle referme ce qui est ouvert le jour où
elle s'applique ; le contrôle en dessous prouve qu'elle a travaillé.

Le motif se répète parce que c'est un **défaut de fabrique** : PostgreSQL
accorde `EXECUTE` à `PUBLIC` sur toute fonction neuve. Ce n'est pas un oubli
occasionnel, c'est le comportement par défaut — celui qu'on ne remarque que si
quelque chose le regarde. D'où un test dans `search-path.test.ts`, qui rejoue à
chaque exécution du CI contre une base fraîchement migrée.

Révoquer `EXECUTE` ne casse aucun déclencheur : PostgreSQL ne vérifie pas ce
privilège quand il en déclenche un. Mesuré, pas supposé — 52 tests de journal et
de paiements passent après la révocation.

**Ce que ce contrôle ne prétend pas.** « Inerte » n'est pas « fermé ». Ces trois
fonctions rendent `trigger`, donc PostgREST refuse de les exposer et PostgreSQL
refuse l'appel direct. C'est une propriété du typage, pas une décision de ce
dépôt. Le jour où l'une cesse de rendre `trigger`, elle devient appelable sans
session et rien n'aura changé dans son fichier. C'est cette bascule que le
contrôle attrape.

### 🟡 `apps/admin/.env.prod.bak` est supprimé, et le geste est gardé

Réclamé les 2, 3 et 4 septembre. Inspecté avant suppression : deux variables,
`VITE_SUPABASE_URL` et une clé `sb_publishable_`, toutes deux publiques par
construction ; jamais suivi par git, couvert par `.gitignore:17`.

Il est resté trois semaines **parce qu'il était inoffensif** — chacun le
vérifiait, le trouvait vide de secret, et ne le supprimait pas.

Le contrôle ajouté à `verifier-bundles.mjs` ne vise donc pas ce fichier mais le
geste. Un `cp .env .env.bak` avant une manipulation est un réflexe ordinaire ;
le fichier survit à la manipulation, suit le dossier d'une machine à l'autre, et
le jour où le même geste porte sur un `.env` contenant une clé de service, rien
ne le distingue du premier.

Liste de **refus** — `.bak`, `.old`, `.save`, `.orig`, `.copie`, `.copy`, `~` —
et non liste d'autorisation : l'inverse aurait paru plus sûr et vieillirait mal,
puisqu'un `.env.staging` légitime la ferait élargir jusqu'à ce qu'elle
n'interdise plus rien. Ce contrôle ne mord qu'en local, et c'est cohérent : le
CI part d'un clone qui n'a jamais vu ces fichiers. La copie naît sur un poste,
elle doit mourir sur ce poste.

### 🟡 Le piège `chariow-webhook` était déjà désamorcé

Le 3 septembre prévoyait que le CI redéploierait la fonction avec `verify_jwt`
et la rendrait muette. La sortie retenue était la bonne : `config.toml` porte
`[functions.chariow-webhook] verify_jwt = false`. Vérifié aussi qu'elle est la
**seule** — les six fonctions ajoutées depuis n'ont pas élargi la brèche.

---

## Restés ouverts, et pourquoi

- **Limite Auth au défaut de la plateforme.** Se règle dans le tableau de bord
  Supabase, hors du dépôt. Toujours hors de portée d'ici.
- **Borne publique par IP seulement.** `consommer_debit` compte sur
  `x-forwarded-for`. Un attaquant distribué passe. Aucun CAPTCHA. Inchangé —
  c'est un choix de produit, pas un oubli.
- **Téléphones en clair.** Inchangé, et toujours pour la même raison : le
  chiffrement applicatif casserait l'envoi.
- **Session dans `localStorage`.** Défaut de `supabase-js`, toujours sans
  vecteur sous cette CSP.
- **`grouper_milliers` garde l'exécution `PUBLIC`.** Vu par le nouveau contrôle
  et délibérément hors de sa portée : elle n'est pas `security definer`, c'est un
  `regexp_replace` sans accès aux données.

## ⚪️ Toujours non vérifié

- **La clé publiable contre la production**, et **l'écart entre les migrations
  et la base de production**. Les deux demandent des identifiants de production
  que cette session n'a pas. `verifier:migrations` et `verifier:en-ligne`
  existent pour ça et se lancent à la main.

---

## 🔵 Ajouté : la liste tronquée en silence

Ce point ne vient pas du 3 septembre. Il est apparu en cherchant la scalabilité
plutôt que la sécurité.

`supabase/config.toml` pose `max_rows = 1000`. PostgREST rend donc au plus mille
lignes **sans erreur et sans en-tête d'avertissement**. `Clients.tsx` chargeait
`clients` et `cartes` sans borne : au-delà du millier, l'écran affichait une
liste incomplète ayant exactement l'air d'une liste complète.

Le coût se cumule avec le défaut du compteur de recherche relevé le même jour :
le collecteur cherche un client, ne le trouve pas, en conclut qu'il n'est pas
inscrit, et le réinscrit. Deux clients pour une personne, deux carnets, et un
solde restituable calculé sur le mauvais. La recherche étant locale, elle ne va
pas chercher les lignes que le serveur n'a pas envoyées : elle ne peut pas
rattraper la troncature.

La correction n'est **pas** la pagination — c'est un chantier, et il demande de
décider ce que devient la recherche. C'est que l'écran cesse de mentir par
omission en attendant : `count: 'exact'` demande au serveur combien de lignes il
possède, et un bandeau `role="alert"` le dit quand il en a rendu moins.

Le coût du comptage est un `count(*)` sur un ensemble déjà filtré par RLS et
indexé par `clients_collecteur_idx`. Le rapporté est qu'un défaut silencieux
devient visible. Un défaut visible se corrige ; un défaut silencieux se paie.

**Ce qui reste à faire, et qu'il faut décider plutôt que subir :** la pagination
de la liste, et une recherche qui interroge le serveur au lieu du tableau déjà
chargé. Tant que ce n'est pas fait, le bandeau est la seule chose qui sépare un
collecteur d'une double inscription.

---

## Ce qui reste vrai du 3 septembre

Revérifié sans changement : `envoyer-avis` **vérifie désormais son appelant** —
fermé le 2026-09-03 même, par `secretValide` et un secret de drainage dédié, la
comparaison passant par SHA-256 en temps constant plutôt que par `===`. Les
quinze tables refusent la clé publiable. RLS sur toutes, aucune policy en
`using (true)`. Aucune fonction `security definer` sans `search_path` durci.
`npm audit` : zéro vulnérabilité.

Les index méritent d'être nommés, puisque la question posée était aussi celle de
la tenue dans le temps : **45 index** sur le schéma `public`, dont `collecteur_id`
sur chaque table chaude et des index **partiels** sur les trois files d'attente
— `avis_a_traiter`, `paiements_en_attente_idx`, `synchro_rejets_a_traiter_idx`.
Les lectures d'historique sont bornées (`limit`) là où la table grandit avec le
temps. Ce n'est pas ce qui plafonnera.
