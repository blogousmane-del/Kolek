# 2026-09-09 — Audit de santé du dépôt

**Périmètre :** l'état de l'arbre au commit `05a269e`, branche `main`, sans
modification en attente. Passage large plutôt que profond : ce qui se construit,
ce qui se teste, ce que les garde-fous gardent vraiment, ce que les documents
promettent encore et qui n'est plus vrai. La grille des vingt contrôles de
sécurité n'est **pas** rejouée ici — le dernier passage date du
[2026-09-04](2026-09-04-audit-securite-20-controles.md) et le serveur n'a pas
bougé depuis.

**Verdict : le dépôt est sain et se construit, mais un garde-fou de sécurité est
débranché dans l'application collecteur, et le README envoie tout nouveau venu
dans le mur sur la vitrine.**

| | Nombre |
|---|---|
| 🔴 Bloquant | 0 |
| 🟠 Important | ~~2~~ · **1** — le premier fermé le jour même |
| 🟡 À faire | ~~10~~ · **9** — le premier fermé le jour même |
| ⚪️ Non vérifié | ~~2~~ · **1** — le second levé le jour même |

**556 tests passent** — 456 d'application, 100 de scripts. Les trois
constructions sortent à zéro. `npm audit` ne trouve aucune vulnérabilité.

Les tests de base n'ont d'abord pas pu tourner, Docker refusant de répondre.
**Repris en fin de journée : 722 passent, 64 fichiers sur 64.** Voir la section
« Non vérifié » plus bas, qui garde le détail et une réserve.

---

## 🟠 → ✅ 1. Le garde-fou de configuration était débranché sur le collecteur

> **Fermé le jour même.** `gardeEnv()` est posé en tête de `plugins`, comme dans
> les deux autres applications. Et pour que ça ne revienne pas, la vérification
> ne repose plus sur une relecture : `scripts/garde-env.test.mjs` importe les
> **trois** `vite.config.ts` et exige `kolek-garde-env` dans leurs greffons.
> Le contrôle porte sur la configuration réelle, pas sur le texte du fichier —
> un test qui aurait cherché « gardeEnv » dans la source serait passé au vert
> sur le défaut même qu'il doit voir, puisque l'import était bien là.
> Vu échouer sur le seul collecteur avant correction, vert sur les trois après.
> L'avertissement `no-unused-vars` d'`oxlint` a disparu par la même occasion.

```ts
// apps/collecteur/vite.config.ts
import { gardeEnv } from '../../scripts/garde-env.mjs';   // ligne 6
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),          // ← gardeEnv() n'est pas là
    tailwindcss(),
    VitePWA({ … }),
  ],
});
```

L'import est écrit. Le greffon n'est jamais posé dans `plugins`. Les deux autres
applications l'ont :

```ts
// apps/admin/vite.config.ts et apps/site/vite.config.ts
plugins: [gardeEnv(), react(), tailwindcss()],
```

**Ce que ça retire.** `garde-env.mjs` existe à cause du 2026-08-23, où la
vitrine est partie en ligne trois fois de suite avec une mauvaise valeur dans
`VITE_SUPABASE_ANON_KEY` : une clé anonyme amputée de son premier caractère,
puis une `sb_secret_`, puis le **JWT de rôle service**. Le greffon lève dans le
hook `config`, avant toute écriture dans `dist/`. Vérifié en direct :

```
$ node -e "import('./scripts/garde-env.mjs').then(m=>console.log(m.verifierEnv({url:undefined,cle:undefined})))"
[ 'VITE_SUPABASE_URL est absente.', 'VITE_SUPABASE_ANON_KEY est absente.' ]
```

Sur le collecteur, aucune de ces valeurs n'est examinée. La construction accepte
une adresse vide, une clé tronquée, une adresse et une clé inversées.

**Ce que ça ne retire pas — et c'est pourquoi ce n'est pas rouge.**
`verifier:bundles` inspecte les **trois** `dist`, collecteur compris, et refuse
`service_role`, un JWT de rôle service et `sb_secret_`. Ce filet-là tourne à
chaque poussée dans le CI. Le pire cas — la clé maîtresse publiée — reste donc
attrapé après la construction, avant le déploiement.

Ce qui passe désormais sans un mot sur le collecteur, c'est exactement le
**premier** défaut du 2026-08-23 : une clé anonyme valide en apparence mais
tronquée. Aucun motif de `verifier-bundles.mjs` ne la reconnaît — ce n'est ni un
libellé de service, ni un secret, ni une clé Chariow. L'artefact part, le
service worker le met en cache, et le symptôme sur le terrain est une
application qui rend `401` sur tout, hors ligne comprise, sans que rien n'ait
échoué nulle part. Le collecteur est précisément l'application où ce symptôme
coûte le plus cher : c'est la seule qui parte en itinérance.

**Le défaut se déclare de lui-même.** `npx oxlint` dans `apps/collecteur` :

```
vite.config.ts:6:10: warning eslint(no-unused-vars): Identifier 'gardeEnv' is imported but never used.
```

Il l'a toujours dit. Personne ne l'a lu — voir le 🟡 n°1.

**Correction :** poser `gardeEnv()` en tête de `plugins`, comme dans les deux
autres applications.

---

## 🟠 2. Le README envoie le nouveau venu dans le mur sur la vitrine

Trois affirmations du README, toutes fausses depuis le 2026-08-23 :

| README | Réalité |
|---|---|
| « `apps/site/` — Site public. Aucune session, aucune donnée » | Le formulaire poste nom, téléphone, courriel, zone, palier **et mot de passe** vers `demander-ouverture` |
| « `npm run dev -w @kolek/site` — aucun `.env` : le site ne parle à aucune API » | `apps/site/src/vitrine/demande.ts` lit `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` |
| L'étape `cp .env.example .env` ne nomme que `collecteur` et `admin` | `apps/site/.env.example` **n'existe pas** |

Ce n'est pas une coquille de documentation, c'est un blocage. `gardeEnv()` est
posé sur la vitrine, il lève dans le hook `config` — qui s'exécute en `dev`
comme en `build`. Un clone neuf qui suit le README à la lettre obtient :

```
Configuration refusée — la construction s'arrête avant d'écrire quoi que ce soit :
  • VITE_SUPABASE_URL est absente.
  • VITE_SUPABASE_ANON_KEY est absente.
```

Et il n'a aucun fichier à copier pour s'en sortir. Ce poste-ci ne le voit pas :
`apps/site/.env` et `apps/site/.env.production` y traînent depuis le 28 août.

La même affirmation périmée se lit une seconde fois dans le code, en commentaire
de `scripts/verifier-bundles.mjs` : « Le site public n'appelle aucune API
aujourd'hui ».

**Correction :** ajouter `apps/site/.env.example` sur le modèle de celui du
collecteur, nommer la vitrine dans l'étape de copie, et réécrire la ligne du
tableau — « aucune session » reste vrai, « aucune donnée » ne l'est plus.

---

## 🟡 À faire

**1. ~~`oxlint` est installé, câblé, et jamais lancé.~~ — fermé le jour même.**
Les trois applications déclaraient `"lint": "oxlint"` et la dépendance
`oxlint@^1.75.0` ; ni `npm run verifier` ni le workflow ne l'appelaient. C'est
lui qui voyait le 🟠 n°1.

Désormais dans les deux, mais **pas tel quel** — et c'est là que se jouait
l'utilité de l'étape. `oxlint` sort à **zéro sur un avertissement**, mesuré :

```
oxlint nu              : exit=0
oxlint --deny-warnings : exit=1
```

Or `no-unused-vars` était un avertissement. Câbler la commande sans rien changer
d'autre aurait donc produit une étape verte qui n'aurait **pas** vu le défaut
qui l'a motivée — un garde-fou décoratif, la pire espèce.

`no-unused-vars` est donc passé à `"error"` dans les trois `.oxlintrc.json`.
Vérifié en désarmant volontairement la correction du 🟠 n°1 :

```
vite.config.ts:6:10: error eslint(no-unused-vars): Identifier 'gardeEnv' is imported but never used.
exit=1
```

`--deny-warnings` a été écarté : il aurait promu `react/only-export-components`,
que les trois configurations mettent délibérément à `"warn"`. C'est un conseil
de confort de développement, pas une règle de correction, et le rendre bloquant
aurait fait échouer la construction sur deux fichiers que personne n'a demandé
de réécrire. La chaîne complète sort à zéro, ces deux avis compris.

**2. Cinq couleurs en dur dans `packages/ui/src/ActionsRapides.tsx`.** La règle
du README est sans nuance : « Aucune valeur visuelle en dur : tout vient de
`packages/core/src/tokens.ts` ». La même table mélange les deux régimes :

```tsx
'circle-dollar-sign': { fond: 'bg-positive-tint', icone: 'text-positive', … },   // jetons
'bar-chart-2':        { fond: 'bg-[#EBF2F7]',     icone: 'text-[#2B6082]', … },  // en dur
```

`#EBF5EE`, `#EBF2F7`, `#2B6082`, `#FBF6E9`, `#96741F`, `#F8F5EC`, `#7D6B35`,
`#EFF2F9`, `#475569` : aucun n'existe dans `tokens.ts`. Cinq entrées sur neuf.
C'est exactement ce que le commit `c1d21ce` (« un seul jeu de neutres ») venait
fermer ailleurs.

**3. Le manifeste PWA porte un jeton supprimé.** `apps/collecteur/vite.config.ts`
déclare `background_color: '#FBFAF6'`. Dans `tokens.ts` :

```ts
// `paper: '#FBFAF6'` a été supprimé le 2026-09-04. Il n'avait qu'un seul…
```

L'écran de démarrage de l'application installée est donc la dernière surface du
produit peinte dans une couleur que le Design System ne connaît plus. `canvas`
vaut `#F4F5F2`.

**4. Trois Edge Functions n'ont aucun test.** `admin-avis`,
`admin-modifier-collecteur` et `admin-reglages` ne sont nommées dans aucun des
64 fichiers de `supabase/tests/`. Leur portillon est pourtant relu ici et il est
correct — `est_admin()` par RPC, `403` sur `ACCES_RESERVE` comme sur
`VERIFICATION_IMPOSSIBLE`, identique aux autres. Deux d'entre elles écrivent :
le collecteur modifié et les réglages de la plateforme. Un portillon juste et
non testé reste juste jusqu'à la première modification.

**5. Les comptes dans les commentaires ne suivent plus.** Trois endroits
affirment des nombres qui étaient vrais et ne le sont plus :

| Écrit | Réel |
|---|---|
| `verification.yml` : « les 366 tests de `supabase/tests/` » | 64 fichiers, ~699 tests |
| `verification.yml` : « treize fonctions », « une fonction sur treize » | 19 fonctions |
| `admin-reglages/index.ts` : « les quatre autres fonctions d'administration » | six autres |

Le raisonnement de chacun de ces commentaires reste juste — c'est le
raisonnement qui compte, et il vaut mieux un nombre périmé qu'aucune
explication. Mais un nombre qu'on ne peut plus vérifier finit par faire douter
du reste du paragraphe.

**6. Un seul morceau de JavaScript par application, 565 ko.**

```
admin      566,13 ko │ gzip 156,21 ko   (+ demo 4,04 ko, seul morceau détaché)
collecteur 565,30 ko │ gzip 157,91 ko
site       367,38 ko │ gzip 124,33 ko
```

Vite avertit sur les trois. Le collecteur est celui qui compte : cible déclarée
« téléphone d'entrée de gamme », marché d'Abidjan, et le service worker ne met
en cache qu'après le premier chargement complet. `@supabase/supabase-js` et les
écrans lourds — `SuperAdmin.tsx` fait 1 634 lignes, `Clients.tsx` 887 —
gagneraient à passer en `import()` dynamique. L'admin montre que le découpage
marche déjà : `demo-CzAi8Jvp.js` est sorti tout seul.

**7. `SuperAdmin.tsx`, 1 634 lignes.** Plus du double du deuxième fichier du
dépôt. Aucun test ne le nomme directement.

**8. Deux couleurs en dur dans `apps/site/src/styles.css`.**
`outline-color: #ffffff` (ligne 41) et `#fff8e1` dans le dégradé `.reflet-or`
(ligne 84). Les deux sont argumentées en commentaire, ce qui est mieux que rien,
mais le blanc a un jeton — `surface` — et le second n'en a pas.

**9. Aucun plan ni spécification pour le travail des 4 au 6 septembre.**
`Docs/plans/` et `Docs/specs/` s'arrêtent au 2026-09-02. Les quatre commits
suivants — refonte des neutres, Tableau de Bord Admin, mode démonstration, repli
statique — n'ont ni l'un ni l'autre, alors que chaque lot précédent a les deux.
Seuls les audits en gardent trace.

**10. `npm test` à la racine est instable sur ce poste.** Premier passage :

```
Error: [vitest-pool]: Failed to start forks worker for test files …/Fonctionnalites.test.tsx
Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond
```

Les cinq espaces de travail lancés en parallèle affament les workers. Relancés
un par un : 456 tests, zéro échec. Ce n'est pas un défaut du code — c'est un
poste sous contrainte, le même qui n'arrive plus à démarrer Docker. À savoir
avant d'aller chercher un bogue qui n'existe pas. Détail au passage : `apps/site`
épingle `vitest@^4.1.11`, les cinq autres `^4.1.10`.

---

## ⚪️ Non vérifié

**~~Les 699 tests de base.~~ — levé le jour même.** Au moment de l'audit,
`docker ps` rendait `Error response from daemon: Docker Desktop is unable to
start`. Docker s'est révélé **éteint**, pas en panne : service
`com.docker.service` à `Stopped`, distribution WSL `docker-desktop` à `Stopped`.
Relancé, puis la pile remontée avec la liste d'exclusions habituelle — le
`FUNCTIONS_URL` de la sortie confirme que `supabase_edge_runtime_Kolek` est
monté, et l'appel non authentifié à `admin-vue-globale` rend bien `401` là où il
rendait `503`.

**722 tests de base passent, 64 fichiers sur 64.** Ils sont 722 et non 699 :
la suite a grossi depuis le 2026-09-04.

Une réserve, écrite plutôt que cachée. La **première** exécution a échoué sur un
test, `avis-drainage.test.ts > borne la taille du lot des deux côtés` —
`reserver(1)` rendant trois lignes. Investigué sans rien corriger : la fonction
en base est identique à sa migration au caractère près (`pg_get_functiondef`),
il n'existe qu'une seule signature `avis_reserver_lot(p_taille integer)`, et
`fileParallelism: false` exclut toute pollution entre fichiers. Trois lignes
sous `limit 1` est arithmétiquement impossible : `p_taille` n'était pas parvenu
jusqu'à la fonction, et la valeur par défaut de 50 s'est appliquée. Le fichier
seul passe (21/21) ; la suite complète relancée passe (722/722). L'hypothèse la
mieux étayée — **non prouvée** — est le cache de signatures de PostgREST, froid
au tout premier appel après un démarrage `Starting database from backup...`.
C'est un artefact de la pile locale, pas un chemin que la production emprunte.
Noté dans la mémoire de projet pour qu'on ne reparte pas en chasse dessus.

**Les quatre contrôles de production.** `verifier:dns`, `verifier:en-ligne`,
`verifier:migrations`, `verifier:promos` interrogent la production et n'ont pas
été lancés ici.

---

## Ce qui est vert, et qui mérite d'être nommé

- **`npm audit` : zéro vulnérabilité**, avec et sans les dépendances de
  développement.
- **Les trois constructions sortent à zéro.** Le 🔴 du 2026-09-06 — l'admin qui
  ne compilait plus — est bien fermé.
- **Les quatre générateurs sont synchronisés** : `theme.css` est à jour, le
  favicon et les icônes aussi, `_shared/paliers.ts` aussi, et « Aucune fuite
  dans les artefacts ».
- **Zéro `TODO`, `FIXME`, `HACK` ou `XXX`** dans tout le code.
- **Zéro fichier source orphelin** : chaque module d'`apps/` et de `packages/`
  est importé par quelqu'un.
- **`verify_jwt = false` sur `chariow-webhook` et sur rien d'autre.** Confirmé
  dans `config.toml` malgré les fonctions ajoutées depuis le dernier audit.
- **Les trois `netlify.toml` portent une CSP nommant l'origine exacte, HSTS,
  `frame-ancestors 'none'`, `object-src 'none'`.** Le `noindex` de la vitrine
  est posé sur `/inscription` seulement, ce que le commentaire d'en haut
  explique.
- **Le CI ne déploie qu'après les deux vérifications**, avec un groupe de
  concurrence distinct et sans annulation pour le déploiement.
- **Un registre d'icônes explicite** dans `packages/ui/src/Icone.tsx` : une
  seule porte d'entrée pour `lucide-react` dans tout le dépôt.

---

## Revue du lot avant mise en ligne — six trous dans le travail neuf

Le lot corrigeant les 🟠 et les 🟡 ci-dessus a été relu avant d'être versé.
Aucune régression : rien ne cassait un test, une construction ou un garde-fou
existant. Mais **six trous dans le travail neuf lui-même**, tous fermés, chacun
avec son test.

**1. Le garde-fou des champs ne voyait pas l'absence de taille.** Il refusait
`text-xs`, `text-sm`, `text-base` — et laissait passer un champ n'en déclarant
**aucune**. Or un champ muet n'hérite pas d'une valeur neutre : la préflight de
Tailwind lui pose `font: inherit`, donc les 15 px du corps, donc le zoom. Quatre
champs du dépôt sont dans ce cas ; tous sont des cases à cocher, qui ne
reçoivent pas de saisie et sont désormais exemptées explicitement. Le trou,
lui, est fermé : sans taille déclarée, c'est un refus.

**2. Le même garde-fou s'arrêtait sur un `>` posé dans une chaîne.** Après la
flèche du `onChange`, la deuxième forme du même défaut : `placeholder="a > b"`
fermait la balise pour le lecteur, et `className` n'était jamais atteint. Le
lecteur ignore maintenant chaînes et commentaires. Ce n'était pas théorique —
les balises de ce dépôt portent des commentaires en français, et une apostrophe
de « croix d'effacement » ouvrait une chaîne qui avalait la suite de la balise.

**3. `role="status"` était monté en même temps que son texte.** Un lecteur
d'écran annonce les changements survenant dans une région live qu'il observe
**déjà** ; il n'annonce pas l'insertion d'une région déjà remplie. Le compteur
de résultats était donc correct à la relecture et muet à l'usage. La région est
maintenant présente en permanence, vide tant qu'on n'a pas cherché.

**4. Le compteur mentait quand le filtre cachait le client.** Il comptait
`visibles`, rétréci par la recherche **et** par la pastille de filtre. Un client
trouvé mais masqué par « Avec carte » donnait « Aucun client trouvé ». C'est le
pire mensonge que cet écran puisse faire : le collecteur en conclut que la
personne n'est pas inscrite et la réinscrit — deux clients pour une personne,
deux carnets, et un solde restituable calculé sur le mauvais. Le compte porte
désormais sur la recherche seule, et nomme le filtre quand c'est lui qui cache.

**5. La recherche ne normalisait ni les accents ni les séparateurs.**
« adjame » ne trouvait pas « Adjamé », et « 0708 » ne trouvait pas
« 07 08 09 10 11 » — les deux formes que l'invite du champ propose pourtant
elle-même. Personne ne compose un accent sur un clavier de téléphone au marché.
Repli sur les caractères nus pour le texte, chiffres contre chiffres pour le
numéro.

**6. L'escalade du linter ne couvrait que `apps/*`.** `npm run lint
--workspaces --if-present` ne touche que les espaces de travail déclarant un
script `lint` — soit les trois applications. `packages/core`, `packages/ui` et
`scripts/`, 77 fichiers dont les composants partagés et les garde-fous
eux-mêmes, étaient sautés en silence. Mesuré : un import mort dans
`packages/ui` ne faisait rien échouer. Un `.oxlintrc.json` racine et un script
`verifier:lint` couvrent maintenant l'ensemble ; le même import mort sort à 1.

---

## Ordre suggéré

1. Poser `gardeEnv()` dans `apps/collecteur/vite.config.ts` (🟠 1) — une ligne.
2. Ajouter `npm run lint --workspaces --if-present` à `verifier` et au CI
   (🟡 1) — c'est ce qui empêche le point 1 de revenir.
3. Créer `apps/site/.env.example` et corriger les trois affirmations du README
   (🟠 2).
4. Les trois couleurs en dur et le `background_color` du manifeste (🟡 2, 3, 8).
5. Le reste quand il y aura de la place.
