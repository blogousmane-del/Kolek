# Audit de correction — ce que l'audit du 4 septembre disait, six jours plus tard

**2026-09-10** · **Périmètre :** dépôt à `0249b79`, **42 commits** après le
`569f4b4` de l'audit des vingt contrôles. Pile locale interrogée en direct.

> Ce n'est pas un douzième passage des vingt contrôles. C'est une **vérification
> de l'audit précédent** : ce qu'il affirmait tient-il encore, et ce qu'il
> laissait ouvert a-t-il bougé ?

**Contrainte de la nuit, et elle a tout cadré :** « sans risque ». Aucune
migration appliquée, **aucune Edge Function modifiée**, aucun déploiement. Le
travail de déploiement du CI ne se déclenche que si `supabase/functions` change
— vérifié dans le workflow avant de décider — donc rien de ce qui suit ne peut
partir en production tout seul.

---

## Ce qui a changé en mieux, et que l'audit ne pouvait pas savoir

### Les dix-neuf Edge Functions vérifient toutes leur appelant

L'audit du 2026-09-04 écrivait : « **16** fonctions détiennent la clé de
service, **14** vérifient leur appelant ». Les deux qui ne le faisaient pas —
`demander-ouverture` et `mot-de-passe-oublie` — sont publiques par construction
et bornées par `consommer_debit`.

Mesuré aujourd'hui, fonction par fonction, en lisant les sources :

| Portillon | Fonctions |
|---|---|
| `admin` — `est_admin` redemandé à la base | les 7 `admin-*` |
| `super-admin` — `est_super_admin` avec le jeton de l'appelant | les 3 `super-admin-*` |
| `session` — identité du porteur, refus sans | `abonnement-payer`, `abonnement-verifier`, les 3 `collecteur-*` |
| `secret-partage` — comparé en temps constant | `envoyer-avis`, `chariow-webhook` |
| `debit-public` — publique par construction, bornée | `demander-ouverture`, `mot-de-passe-oublie` |

**Dix-neuf sur dix-neuf.** Aucune porte sans garde.

**Une correction à ma propre méthode en cours de route.** Mon premier comptage,
par `grep` sur les marqueurs, donnait « zéro contrôle » aux trois
`super-admin-*`. C'était mon motif qui était faux : elles passent par
`_shared/portillon-super-admin.ts`, où le contrôle vit. Un comptage qui n'entre
pas dans les modules partagés ne mesure pas ce qu'il croit.

Le portillon lui-même est bien dessiné, et sa ligne la plus importante est un
commentaire :

```ts
// --- Passé ce point seulement, la clé de service sort ---
const service = createClient(url, cleService, { … });
```

`est_super_admin()` est redemandé **avec le jeton de l'appelant**, puis
`getUser()` confirme qu'il porte un compte. La clé de service n'est fabriquée
qu'après. Les trois fonctions appellent `ouvrir()` **et** traitent son refus —
vérifié ligne à ligne, parce que l'import seul ne prouve rien.

### Le webhook a gagné une barrière que l'audit ne décrit pas

L'audit détaille le secret d'URL. Depuis, `chariow-webhook` exige **aussi** une
signature HMAC-SHA256 du corps brut :

- lue sur les **octets reçus**, avant tout `JSON.parse` — un `stringify` de
  l'objet analysé ne rendrait pas les mêmes ;
- *fail-closed* comme le secret d'URL : `if (!secret || !entete) return false` ;
- comparée en **temps constant**, par le même `secretValide`.

Le point d'entrée public du projet est donc plus fermé que son audit ne le dit.

### `abonnement_ouvre_droit` borne son paramètre

C'était un 🟡 de la liste. Fermé le 2026-09-09 par la migration
`20260909120000_abonnement_ouvre_droit_borne`, **appliquée en production** le
même jour, avec `20260909130000_definers_fermes_a_anon`.

---

## Ce que j'ai ajouté cette nuit : le contrôle n°6 cesse d'être recompté à la main

C'est le seul apport en code, et il vient d'une observation sur les audits
eux-mêmes plutôt que sur le produit.

Le contrôle n°6 — « autorisation côté serveur » — a été **recompté à la main à
chaque passage** depuis le 18 août. Treize fonctions, puis seize, puis dix-neuf.
Chaque nombre était juste le jour de sa mesure et faux le mois suivant. La
question n'a jamais été de savoir si les fonctions sont gardées aujourd'hui,
c'est de savoir si **la vingtième** le sera — et un document ne garde rien.

`scripts/verifier-portillons.mjs` extrait la nature du portillon de chaque
fonction et la compare à une table déclarée. Quatre choses le font échouer :

1. une fonction du disque **absente de la table** — une nouveauté que personne
   n'a classée ;
2. une fonction qui **ne vérifie plus rien** ;
3. un portillon **affaibli** sans que la table suive — `admin` devenu `session`
   passe tous les tests existants et ouvre une console d'administration à
   n'importe quel compte connecté ;
4. un `ouvrir()` appelé **sans que son refus soit honoré**.

Le quatrième est le seul qui regarde la structure, et il existe pour une raison
précise : c'est la forme exacte du 🟠 n°1 du 2026-09-09, où l'import de
`gardeEnv` était bien présent et le greffon absent. Une recherche de motif
passe au vert sur ce défaut-là.

**Le garde a été vu échouer sur le vrai dépôt avant d'être déclaré bon.**
`est_admin` a été temporairement retiré d'`admin-vue-globale` :

```
Des Edge Functions ne gardent plus leur porte comme déclaré :
  admin-vue-globale ne vérifie plus rien : ni identité, ni rôle, ni secret
  partagé, ni débit public. Elle était déclarée « admin ».
```

Le fichier a été restauré par `git checkout`, et l'arbre vérifié propre.

Branché dans `npm run verifier` et dans le CI, à l'étape « Les Edge Functions
vérifient leur appelant ». Modifier le workflow ne déclenche aucun déploiement —
la portée du travail de déploiement est calculée sur `supabase/functions` seul.

---

## Ce qui reste ouvert, et pourquoi je n'y ai pas touché cette nuit

### 🟠 La limite Auth au défaut de la plateforme

Ouvert depuis le 25 août. Il se règle dans le tableau de bord Supabase, hors du
dépôt — **je n'y ai pas accès, et c'est très bien ainsi**. C'est le seul point
qui demande une main humaine et des identifiants.

### 🟡 Le webhook n'appelle pas `consommer_debit`

Toujours vrai. L'audit classait ce point en durcissement pour une bonne raison,
qui tient encore : un webhook légitime arrive **en rafale** après une vague de
paiements, et une borne mal calibrée ferait perdre des notifications de
règlement. Poser cette borne demande de choisir un seuil, donc de connaître le
volume réel — pas de le deviner à deux heures du matin.

Et sa conséquence reste bornée : le secret qui fuit permet de déclencher des
relectures chez Chariow, **pas d'obtenir un abonnement**, puisque la fonction ne
crédite jamais sur la foi du corps reçu.

### 🟡 Le secret de webhook n'a pas de longueur minimale à l'exécution

`etat-paiement.ts` exige 32 caractères pour **afficher** la passerelle comme
configurée ; la fonction, elle, accepte tout secret non vide. L'écart est
volontairement dans ce sens — un refus d'exécution ferait perdre des
notifications de paiement — et l'audit le disait déjà.

Le corriger demanderait de toucher une Edge Function. **Écarté par la contrainte
de la nuit**, et non parce que ce serait difficile.

### 🟡 Téléphones en clair, `localStorage`, absence de CAPTCHA

Trois choix de conception, tous documentés, aucun ne bouge sans décision
produit.

### ⚪️ → ✅ L'écart entre les migrations et la production — **mesuré, et nul**

L'audit du 2026-09-04 comptait **quatre migrations versionnées et non
appliquées**. Un `npx supabase db push` a été passé le 2026-09-09 — il applique
tout ce qui est en attente, donc ces quatre-là *avaient dû* partir avec les deux
de sécurité.

**« Avaient dû » n'était pas une mesure**, et ce point est resté ⚪️ toute la
nuit faute du jeton du projet. Mesuré le 2026-09-10 au matin, dès que
l'exploitant a été là :

```
supabase migration list --linked   →  48 entrées
```

| Contrôle | Résultat |
|---|---|
| Migrations versionnées **non appliquées** | aucune |
| Migrations en production **sans fichier local** | aucune |
| Désaccord entre `local` et `remote` | 0 |
| Fichiers `.sql` du dépôt | 48, tous présents dans la liste |

Les quatre nommées par l'audit précédent — `20260902160000`, `20260902170000`,
`20260903120000`, `20260903140000` — sont **toutes appliquées**.

**L'écart est donc nul dans les deux sens**, et le second sens est le plus
intéressant : aucune migration ne vit en production sans fichier au dépôt.

### Mais « aucun écart de migrations » ne veut pas dire « aucun écart de schéma »

`migration list` compare des **migrations**, pas des **objets**. Le jeton étant
enfin disponible, `verifier:derive` a tourné dans la foulée, et il dit autre
chose :

```
48 fonctions security definer en production, 47 écrites dans les migrations.

Dérive :
  public.rls_auto_enable() est security definer en production et n'est créée
  par aucune migration.
```

Ce n'est pas une découverte — la dérive est connue depuis le 2026-09-09 — mais
c'est la démonstration que les deux contrôles ne mesurent pas la même chose. Un
dépôt dont les migrations sont parfaitement synchronisées peut porter un objet
de production que personne ne peut reconstruire.

**Ce que ça coûte concrètement :** une base remontée depuis les seules
migrations n'aurait pas cette fonction, et toute passe qui balaie les `security
definer` — comme celle du 2026-09-09 qui a révoqué `EXECUTE` pour `PUBLIC` — la
touche sans que rien en local ne l'annonce.

Reste ouvert : l'adopter dans une migration demande de relire sa définition en
production, puis d'écrire un `CREATE OR REPLACE` idempotent, puis de pousser.
C'est une écriture en production, donc une décision de l'exploitant.

**Le contournement qui a permis la mesure**, noté parce qu'il resservira : sur
ce poste, PowerShell refuse `npx.ps1` — politique d'exécution — tandis que le
shim `npx.cmd` passe sans rien changer au système.

---

## Deux affirmations vérifiées plutôt que crues

### Les en-têtes de sécurité — contrôle n°18, remesuré

L'audit du 2026-09-04 portait `✅` avec cette réserve, écrite honnêtement :
« Mesurés en production au passage du 2026-09-03. **Non remesurés ici** — rien
n'a été déployé depuis, donc rien n'a pu changer, mais c'est un raisonnement et
non une mesure. »

Beaucoup a été déployé depuis. Remesuré cette nuit sur les **trois** fronts :

| En-tête | app | admin | site |
|---|---|---|---|
| `Strict-Transport-Security` (1 an, `includeSubDomains`) | ✅ | ✅ | ✅ |
| `Content-Security-Policy` (`default-src 'self'`) | ✅ | ✅ | ✅ |
| `X-Frame-Options: DENY` | ✅ | ✅ | ✅ |
| `X-Content-Type-Options: nosniff` | ✅ | ✅ | ✅ |
| `Referrer-Policy: strict-origin-when-cross-origin` | ✅ | ✅ | ✅ |
| `Permissions-Policy` | ✅ | ✅ | ✅ |

`camera=(self)` sur le collecteur seul — il en a besoin ; les deux autres
ferment. Le raisonnement est devenu une mesure.

### Le seul `.env` versionné du dépôt, et le garde qui le tient

`supabase/functions/.env` est **suivi par git**, et `.gitignore` l'exempte
explicitement. Vu de loin, c'est le défaut le plus grave qu'un dépôt puisse
porter.

L'exception est justifiée en commentaire : le runtime Edge local lit ce fichier
au démarrage, et sans lui une machine neuve voit toute la suite d'avis tomber
sans raison lisible. La production, elle, tient son secret par
`supabase secrets set`.

Ce commentaire affirme aussi qu'un test refuse toute autre valeur qu'une valeur
de test — et **une affirmation de ce genre est exactement ce qu'il ne faut pas
croire sur parole.** Vérifié : le garde existe, dans
`avis-drainage.test.ts:240`.

```ts
expect(SECRET_DRAINAGE).toMatch(/^test_local_/);
expect(SECRET_DRAINAGE.length).toBeGreaterThanOrEqual(32);
```

La valeur versionnée porte bien le préfixe `test_local_`, fait 43 caractères, et
n'a ni la forme d'un JWT ni celle d'un `sb_secret_`. Le second `expect` est le
plus fin des deux : sans lui, un secret trop court passerait ce test et se
ferait rejeter par `avis_declencher_drainage()` en `SECRET_DRAINAGE_COURT`, hors
de portée de toute mesure locale.

**J'ai d'abord conclu à tort que ce garde n'existait pas**, en lisant les
cinquante premières lignes du fichier là où l'assertion vit à la ligne 240. La
mesure a corrigé la lecture.

---

## Ce qui est mesuré et sain

- **1 491 tests passent** — 763 sur la base, 550 d'application, 178 de scripts.
  L'audit du 2026-09-04 en comptait 1 231. La cible locale de la suite de base
  est garantie par `scripts/garde-base-locale.mjs` : elle emploie la clé de rôle
  service et vide des tables entières.

  | Espace | Tests |
  |---|---|
  | base (65 fichiers) | 763 |
  | `@kolek/collecteur` | 203 |
  | `@kolek/admin` | 121 |
  | `@kolek/ui` | 116 |
  | `@kolek/core` | 69 |
  | `@kolek/site` | 41 |
  | scripts | 178 |

- **`npm audit` : 0 vulnérabilité**, dépendances de développement comprises.
- **Aucun `select('*')` applicatif** dans les trois applications, les deux
  paquets et les dix-neuf Edge Functions.
- **Aucun `dangerouslySetInnerHTML`, aucun `innerHTML`.**
- **`verify_jwt = false` n'apparaît qu'une fois** dans `config.toml`, sur
  `chariow-webhook`, et la ligne de commande de déploiement doit le redire.
- **Les six gardes de conception passent** : thème, marque, paliers, champs à
  16 px, exemples d'environnement, manifeste PWA.
- **`verifier:bundles` : aucune fuite** dans les artefacts, aucune copie de
  `.env` sur le poste.

---

## Deux fois où ma propre mesure était fausse

Écrites ici parce qu'elles disent comment ces audits peuvent se tromper, et que
la méthode compte autant que le résultat.

**Le comptage par `grep` a donné « zéro contrôle » aux trois `super-admin-*`.**
Elles passent par `_shared/portillon-super-admin.ts`, où le contrôle vit. Un
comptage qui n'entre pas dans les modules partagés ne mesure pas ce qu'il croit
mesurer — et l'erreur allait dans le sens alarmant, ce qui est le bon sens pour
une fausse alerte, mais reste une fausse alerte.

**J'ai conclu que le garde sur le `.env` versionné n'existait pas.** Il est à la
ligne 240 d'un fichier dont j'avais lu les cinquante premières. Cette
erreur-là allait dans le sens alarmant elle aussi ; la symétrique — conclure
qu'un garde existe alors qu'il n'existe pas — est celle qui coûte, et c'est
exactement ce que le 🟠 n°1 du 2026-09-09 a montré.

La leçon est la même dans les deux cas : **une sonde qui rend « rien » ne prouve
rien tant qu'on ne l'a pas vue trouver quelque chose.** C'est pourquoi le garde
ajouté cette nuit a été mis en échec sur le vrai dépôt avant d'être déclaré bon.

---

## Ce que cette nuit n'a pas fait, et qu'il faut savoir

Trois choses, écrites ici parce qu'un audit qui ne dit pas ses trous ment par
omission.

1. **Rien n'a été déployé.** Les commits sont locaux. Pousser réveillerait
   Netlify sur les trois fronts sans personne pour regarder le résultat, et
   « sans risque » excluait ça.
2. **Aucune Edge Function n'a été touchée**, ce qui écarte mécaniquement deux
   des 🟡 restants. C'était le choix le plus sûr, pas le plus complet.
3. ~~**L'écart avec la production n'est pas mesuré.**~~ **Mesuré le lendemain
   matin, et nul** — voir la section correspondante. C'était le dernier ⚪️ du
   dépôt.
