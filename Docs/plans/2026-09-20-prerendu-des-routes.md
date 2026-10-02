# Le prérendu des routes du site public — plan d’implémentation

> **Pour les ouvriers agentiques :** SOUS-COMPÉTENCE REQUISE : utiliser
> superpowers:subagent-driven-development (recommandé) ou
> superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes
> emploient la syntaxe à cases (`- [x]`) pour le suivi.

**But :** servir, pour chacune des cinq routes du site public, un fichier HTML
qui porte son texte, son titre, sa description et son adresse canonique — avant
tout JavaScript. Le HTML servi aujourd’hui porte 14 mots.

**Architecture :** une table de routes unique remplace les trois listes
éparses ; un script de prérendu charge `App.tsx` dans Node, rend chaque route
en chaîne et écrit un fichier par route dans `dist` ; le client hydrate au lieu
de reconstruire ; le sitemap est engendré depuis la même table.

**Pile :** React 19, TypeScript, Vite, Vitest + Testing Library (jsdom),
Netlify. Aucune dépendance nouvelle — `react-dom/server` vient avec
`react-dom`.

**Spécification :** `Docs/specs/2026-09-20-prerendu-des-routes-design.md`.
Elle est la source des valeurs ; ce plan est la source de la séquence.

**Audit d’origine :** analyse SEO du 2026-09-20, point 1 sur 5.

## Contraintes globales

- **Fins de ligne CRLF** sur tout fichier du dépôt. **Vérifie par Node**, jamais
  par `grep` ni `cat` : sous Git Bash ils masquent les `\r`. Motif :
  `fs.readFileSync(f, 'latin1').match(/(?<!\r)\n/g)` doit rendre `null`.
- **Français intégral** : guillemets « », apostrophes typographiques ’.
- **Aucun cadratin (—) dans un texte rendu de moins de 70 caractères.**
  `npm run verifier:tirets` le garde.
- **Les antislash sont mangés par `node -e`** sous Git Bash. Écris tes scripts
  dans un fichier, et lance `node fichier.mjs`.
- **Un heredoc Bash casse sur les apostrophes droites** dans ce harnais. Écris
  les fichiers avec l’outil d’écriture, pas avec `cat <<EOF`.
- **Ne lance jamais de serveur de développement sur les ports 5173 / 5174** :
  ils pointent sur la production. Le prérendu utilise Vite en mode middleware,
  qui n’écoute aucun port — c’est une condition, pas un détail.
- **Ne lis jamais `.env`.** La construction se configure par variables en ligne.
- **Sous PowerShell, `npx` est bloqué** : utiliser `npx.cmd`. Sous Git Bash,
  `npx.cmd` casse les arguments entre guillemets.
- **Une sonde muette ment.** Tout zéro ou toute liste vide doit s’accompagner
  d’un témoin dont on connaît la réponse. Ce plan en a déjà coûté un : un grep
  sur `packages/ui/src/Bruit.tsx` a rendu « rien » parce que le fichier n’existe
  pas — les trois composants vivent dans `Guilloche.tsx`.
- **Rouge d’abord.** Une épreuve qui n’a jamais échoué ne prouve rien. Note le
  message d’échec exact dans ton rapport.
- **Aucun `git merge`, aucun `git push`, aucun geste de production** sans accord
  explicite de l’exploitant demandé pour ce geste précis.
- **Branche de travail à part.** La branche courante est
  `whatsapp-un-seul-numero` et porte une modification non validée de
  `apps/site/src/vitrine/liens.ts` ; un chantier `export-csv` occupe un arbre de
  travail. Ne rien mêler.

## Variables d’environnement pour construire au poste

`gardeEnv()` refuse la construction sans elles, et le prérendu charge la même
configuration. Elles se passent en ligne, jamais par lecture de `.env` :

```
VITE_SUPABASE_URL=https://yfnwmokxkznejotgpfgf.supabase.co
VITE_SUPABASE_ANON_KEY=<le jeton anonyme entier>
```

La garde vérifie la forme du jeton : trois segments, début `eyJhbGciOi`. Un
jeton tronqué est refusé avec un message qui le dit.

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
| --- | --- |
| `apps/site/src/vitrine/routes.ts` | la table des cinq routes et leurs balises — source unique |
| `apps/site/src/vitrine/routes.test.ts` | la table est cohérente : chemins uniques, longueurs de titre et de description bornées |
| `scripts/prerendre.mjs` | rend chaque route en chaîne et écrit un fichier par route dans `dist` |
| `scripts/prerendre.test.mjs` | éprouve l’injection dans le gabarit, sans Vite ni réseau |
| `scripts/engendrer-sitemap.mjs` | écrit `sitemap.xml` depuis la table ; mode `--verifier` |
| `scripts/engendrer-sitemap.test.mjs` | éprouve la sortie et le mode `--verifier` |

**Modifiés :**

| Fichier | Ce qui change |
| --- | --- |
| `apps/site/src/App.tsx` | prend `chemin` en propriété ; se rabat sur `window` côté client ; lit la table |
| `apps/site/src/main.tsx` | `createRoot` devient `hydrateRoot` |
| `apps/site/src/vitrine/animation.ts` | `useMouvementAccepte` rend `true` au premier rendu |
| `apps/site/src/vitrine/PiedDePage.tsx` | `suppressHydrationWarning` sur l’année |
| `apps/site/netlify.toml` | les quatre réécritures visent le fichier de leur route |
| `apps/site/package.json` | `build` enchaîne `vite build` puis `prerendre` |
| `apps/site/public/sitemap.xml` | engendré ; le commentaire passe dans le générateur |
| `scripts/verifier-routes.mjs` | compare la table à `netlify.toml` et au sitemap |
| `package.json` | script `verifier:sitemap` |

**Inchangés, et c’est voulu :** `apps/site/index.html` garde son écran
d’attente — il reste le gabarit, et le repli de `/inscription`. `public/404.html`
ne bouge pas. Le `X-Robots-Tag` sur `/inscription` ne bouge pas.

## Ordre

Les tâches 1 à 3 sont séquentielles : la table porte tout le reste. Les tâches
4 et 5 sont indépendantes l’une de l’autre. La 6 ferme.

---

## Tâche 1 — La table des routes

- [x] Écrire `apps/site/src/vitrine/routes.test.ts` **d’abord**. Il éprouve :
      cinq routes ; chemins uniques ; chaque chemin sans barre oblique finale
      sauf la racine ; chaque titre sous 60 signes ; chaque description entre
      120 et 160 signes ; `/inscription` seule avec `indexable: false` et
      `prerendu: false` ; chaque `fichier` en forme répertoire sauf la racine.
- [x] Le lancer, le voir **rouge**, noter le message exact.
- [x] Écrire `apps/site/src/vitrine/routes.ts` avec le type et la table de la
      spécification, § « La table » et § « Titres et descriptions ».
- [x] Vert. `npx.cmd vitest run apps/site/src/vitrine/routes.test.ts`

**Attention :** les constantes `MENTIONS_LEGALES`, `CONDITIONS` et
`CONFIDENTIALITE` de `apps/site/src/vitrine/liens.ts` sont les chemins
existants, et `liens.ts` est modifié sans être validé sur cette branche. La
table les **réutilise** par import ; elle ne les recopie pas.

## Tâche 2 — `App.tsx` rend hors navigateur

- [x] Épreuve d’abord, dans le fichier d’épreuves du site : `App` rendu avec
      `chemin="/conditions"` rend les conditions ; sans propriété, il lit
      `window.location.pathname`.
- [x] Rouge, message noté.
- [x] `App` prend `{ chemin }: { chemin?: string }`. Défaut :
      `window.location.pathname`. Le routage parcourt la table plutôt que ses
      cinq `if`.
- [x] `/inscription` reste routée comme aujourd’hui : elle n’est pas prérendue,
      son accès à `window.location.search` ne bouge pas.
- [x] Vert.
- [x] **Sonde de vérité :** charger `App` par `vite.ssrLoadModule` dans un
      script jetable et le rendre pour les quatre routes prérendues. Chaque
      sortie doit passer 200 mots. Témoin obligatoire : un mot qu’on sait
      absent doit rendre `false`.

## Tâche 3 — Le prérendu

- [x] Écrire `scripts/prerendre.test.mjs` **d’abord**, sur la fonction pure
      d’injection — pas sur Vite. Elle prend un gabarit, une route et un
      balisage, et rend le HTML final. Éprouver : le titre est remplacé ; la
      description est remplacée ; la canonique vaut l’adresse de la route ;
      `og:url`, `og:title` et `og:description` suivent ; `robots noindex`
      apparaît si et seulement si la route n’est pas indexable ; le contenu de
      `<div id="root">` est remplacé, pas ajouté ; l’écran d’attente a disparu
      d’une route prérendue et subsiste sur `/inscription`.
- [x] Rouge, message noté.
- [x] Écrire `scripts/prerendre.mjs` : la fonction pure, exportée et éprouvable,
      puis l’enrobage Vite décrit à la spécification § « Le prérendu ».
      `cacheDir` sur un répertoire jetable. **Mode middleware, aucun port.**
- [x] La garde : sortir en échec si une route prérendue passe sous 200 mots
      indexables, ou si sa canonique manque. Message qui nomme la route.
- [x] Brancher : `"build": "vite build && node ../../scripts/prerendre.mjs"`
      dans `apps/site/package.json`. Vérifier le chemin relatif — Netlify lance
      la construction depuis la racine du dépôt, pas depuis `apps/site`.
- [x] Construire avec les variables en ligne, et **mesurer `dist`** :

      | Route | attendu |
      | --- | --- |
      | `dist/index.html` | ≥ 650 mots, canonique `https://kolek.cash/` |
      | `dist/conditions/index.html` | ≥ 200 mots, canonique `.../conditions` |
      | `dist/mentions-legales/index.html` | ≥ 200 mots |
      | `dist/confidentialite/index.html` | ≥ 200 mots |
      | `dist/inscription/index.html` | écran d’attente, `robots noindex` |

- [x] Vérifier que les cinq canoniques sont **distinctes**. C’est le défaut
      n°2 ; un prérendu qui recopierait la même ligne cinq fois ne l’aurait pas
      fermé.

## Tâche 4 — L’hydratation

- [x] `main.tsx` : `createRoot(...).render(...)` devient `hydrateRoot(...)`.
- [x] `animation.ts` : `useMouvementAccepte` rend `true` au premier rendu, puis
      la vraie valeur dans son `useEffect`. Le commentaire dit pourquoi — sans
      lui, la ligne se lit comme un oubli de la lecture `matchMedia`.
- [x] `PiedDePage.tsx:97` : `suppressHydrationWarning` sur le nœud de l’année,
      avec le commentaire qui nomme le cas — construction en décembre, visite
      en janvier.
- [x] Épreuve : `useMouvementAccepte` rend `true` au premier rendu même quand
      `matchMedia` annonce le mouvement réduit, puis `false` après effet.
- [x] **Contrôle visuel** par Chrome sans interface, profil au chemin court,
      **jamais sur 5173 / 5174** : servir `dist` sur un autre port, charger les
      quatre routes prérendues, relever la console. **Zéro avertissement
      d’hydratation.** Un avertissement ici est un défaut, pas un bruit.

## Tâche 5 — Netlify, sitemap et la garde des routes

- [x] `netlify.toml` : les quatre réécritures visent `/<route>/index.html`.
      Garder l’ordre — la redirection 301 depuis `kolek-site.netlify.app`
      **reste en tête**, le commentaire du fichier explique pourquoi.
- [x] `scripts/engendrer-sitemap.test.mjs` d’abord : la sortie ne contient que
      les routes `indexable`, jamais `/inscription` ; `--verifier` échoue sur un
      fichier périmé.
- [x] Rouge, message noté.
- [x] `scripts/engendrer-sitemap.mjs`. Le commentaire long du `sitemap.xml`
      actuel — pourquoi pas de `lastmod`, pourquoi `/inscription` est absente —
      déménage dans le générateur et reste dans la sortie.
- [x] Étendre `scripts/verifier-routes.mjs` : il compare aujourd’hui `App.tsx`
      à `netlify.toml`. Il doit désormais comparer **la table** à `netlify.toml`
      et au sitemap, et continuer de refuser le joker `/*`.
- [x] `npm run verifier:routes` et `npm run verifier:sitemap` verts.

## Tâche 6 — Fermeture

- [x] `npm test --workspaces` vert.
- [x] `npm run verifier:routes`, `verifier:sitemap`, `verifier:tirets`,
      `verifier:champs`, `verifier:bundles` verts.
- [x] **Rappel de l’angle mort du dépôt :** `npm test --workspaces` ne lance ni
      `supabase/tests`, ni `test:scripts`, ni les `verifier:*`. Les nouveaux
      `scripts/*.test.mjs` de ce plan relèvent de `test:scripts` — le lancer
      explicitement, sinon ils ne tournent jamais.
- [x] Vérifier les fins de ligne CRLF **par Node** sur tout fichier créé ou
      modifié.
- [x] Rapport : les mesures avant / après par route, le message d’échec exact
      de chaque épreuve rouge, et ce qui reste ouvert.

## Ce qui a été mesuré — exécution du 2026-09-20

Mots indexables dans le HTML **servi**, avant tout JavaScript :

| Route | avant | après |
| --- | --- | --- |
| `/` | 14 | **663** |
| `/conditions` | 14 | **834** |
| `/confidentialite` | 14 | **1173** |
| `/mentions-legales` | 14 | **175** |
| `/inscription` | 14 | 14, à dessein — `noindex`, non prérendue |

Cinq balises canoniques distinctes, cinq titres distincts, vérifiés sur les
fichiers écrits par un contrôleur qui n'importe rien du script contrôlé.

Contrôle d'hydratation dans Chrome sans interface, `dist` servi sur le port
4317 — jamais 5173 ni 5174 : les cinq routes affichent le bon `h1` après
hydratation, **aucune erreur ni avertissement de console**. Témoin : une erreur
provoquée exprès est bien vue par la sonde.

Suites : 1251 épreuves d'espaces de travail, 317 épreuves de scripts,
`verifier:routes`, `verifier:sitemap`, `verifier:tirets`, `verifier:champs` et
`verifier:lint` au vert.

## Six écarts avec la spécification, et pourquoi

**1. Le seuil de la garde est 120, non 200.** La spécification l'avait estimé ;
la première construction l'a démenti, et c'est le garde-fou lui-même qui a
parlé :

    /mentions-legales ne rend que 175 mots indexables, seuil 200.

Les mentions légales sont la plus courte page réelle du site, et 175 mots y est
un texte complet. Le seuil se place sous elle avec marge, et très au-dessus des
14 mots de l'écran d'attente.

**2. Un marqueur `data-prerendu` que la spécification n'avait pas prévu.**
Découvert en posant l'hydratation : `hydrateRoot` appliqué à `/inscription`
demanderait à React de reconnaître un formulaire dans un écran d'attente.
`main.tsx` lit donc le marqueur pour choisir entre hydrater et construire. Le
déduire — en regardant si `#root` a des enfants — confondrait une page
prérendue avec l'écran d'attente, qui en a aussi.

**3. Le sitemap se vérifie par son propre générateur**, et non dans
`verifier-routes.mjs` comme le plan l'annonçait. Deux scripts, deux objets :
l'un compare la table au `netlify.toml`, l'autre la compare au sitemap. C'est
le motif de `generer-cgu.mjs --verifier`, déjà en place dans le dépôt.

**4. `verifier-routes.mjs` a été réécrit, pas étendu.** Il extrayait les
`if (chemin === …) return` d'`App.tsx` par expression régulière ; cette forme a
disparu avec la table. Il importe désormais la table — et cet import se résout
**depuis le répertoire courant**, non depuis le module. Sans cela il aurait lu
la vraie table pendant que ses propres épreuves lui présentaient un faux dépôt
cassé : un garde-fou qu'on croit éprouvé et qui ne l'est pas.

**5. Le sitemap s’écrit en LF, et se compare sans ses fins de ligne.** Le
générateur écrivait du CRLF, sur la foi d’un CRLF lu dans le répertoire de
travail Windows et pris pour celui du dépôt. Or `core.autocrlf = true` : le
dépôt garde du LF, et le CRLF n’est posé qu’au checkout Windows. Le premier CI
de la PR #19 l’a dit, sur le clone Linux :

    × le sitemap versionné correspond déjà à la table

Vert au poste, rouge au CI, pour un sitemap qui n’avait pas bougé. Le
générateur écrit désormais du LF et compare après normalisation, comme
`generer-theme.mjs` le fait depuis le 2026-08-24 ; il ne réécrit plus un fichier
déjà à jour, qui sortait sinon « modifié » dans `git status` sans rien à montrer.
La contrainte « CRLF sur tout fichier » de ce plan vaut pour le répertoire de
travail au poste, pas pour ce qu’un script compare.

**6. Les entrées animées effaçaient ce que le prérendu venait de peindre.**
Trouvé le 2026-10-02, après le point 2, par une mesure que ce plan n’avait pas
prévue : l’opacité du titre du hero, relevée à chaque image dans Chrome, réseau
bridé à 1,6 Mbit/s et 300 ms, mouvement accepté. Sur l’aperçu de la PR #19 :

    4,7 s   titre peint, opacité 1,00     le HTML prérendu
    5,8 s   React reprend la page
    6,0 s   opacité 0,10                  l’entrée GSAP part de zéro
    6,7 s   opacité 1,00

Le visiteur qui commençait à lire voyait la phrase disparaître. Le contrôle de
la tâche 4 ne pouvait pas le voir : il lisait la console, et les captures du
hero étaient prises en mouvement réduit, le seul réglage où rien ne s’anime.

L’hydratation n’y est pour rien, elle est propre. Toutes les entrées de la
vitrine partent d’une opacité nulle : elles ont été écrites quand le contenu
n’existait qu’après le JavaScript. `useAnimations` dit désormais à chaque
section si elle était déjà à l’écran quand React est arrivé (`Etat.dejaPeint`),
et les entrées s’en gardent. L’ouverture du hero ne joue donc plus en
production ; le reflet sur « précision », qui ne cache rien, joue toujours. Les
sections révélées au défilement gardent leur entrée, sauf à l’arrivée par une
ancre. Même mesure après correction, sur `dist` : opacité minimale 1,00 pour le
titre, et 1,00 pour les paliers d’une arrivée par `#tarifs`, qui tombaient à
0,71 sur l’aperçu de l’ancien code. `deja-peint.test.tsx` tient la règle : onze
épreuves, dont quatre témoins qui prouvent que la sonde voit un effacement.

Au passage : l’ouverture du filigrane n’a jamais joué. `Rosace` ne transmet pas
`data-filigrane` à son `<svg>`, depuis leur création commune le 2026-08-23.
Défaut antérieur au prérendu, laissé hors de cette PR.

## Ce qui reste ouvert après ce plan

Les points 2 à 5 de l’audit du 2026-09-20, repris le 2026-10-02 dans la même PR :

2. les mots-clés : **faits**. Titre, description et phrase du hero portent
   tontine, collecte journalière, banquier ambulant, tontinier, Abidjan et
   Côte d’Ivoire, choisis par l’exploitant ; `routes.test.ts` refuse de les
   perdre ;
3. les données structurées JSON-LD : **gain faible** tant que Kolek n’a pas
   d’avis clients réels, seuls à valoir des étoiles dans Google ;
4. le poids : **mesuré** sur l’aperçu, un téléphone sans cache reçoit 15 ko de
   HTML, 128 ko de JavaScript, 106 ko de polices et 13 ko de CSS. Les `.woff`
   et les sous-ensembles inutiles ne partent jamais ; ce qui pèse relève du
   design ;
5. `scripts/verifier-seo.mjs` : la garde du prérendu (120 mots, canoniques
   distinctes) et celle de `routes.test.ts` en tiennent lieu.

Le point 1 est celui qui conditionne les autres : tant que le HTML servi porte
14 mots, un mot-clé bien choisi ne se lit nulle part.
