# Le prérendu des routes du site public — spécification

**Défaut corrigé :** le HTML servi par Netlify ne contient aucun texte de
vente. Mesuré le 2026-09-20 sur `apps/site/dist/index.html` : **14 mots
indexables**, qui sont l’écran d’attente et son diagnostic de panne.

```
« Kolek ! Ton Djè en Sécurité  Toujours rien ? Vérifie ta connexion et recharge la page. »
```

Aucune occurrence de `épargne`, `collecteur`, `FCFA`, `abonnement`. Les 663 mots
de la page vivent dans 395 ko de JavaScript.

**But :** servir, pour chacune des cinq routes, un fichier HTML qui porte son
propre texte, son propre titre, sa propre description et sa propre adresse
canonique — avant tout JavaScript.

## Ce que le défaut coûte, robot par robot

| Robot | Exécute le JavaScript | Ce qu’il voit aujourd’hui |
| --- | --- | --- |
| Google | oui, au second passage | la page, mais différée et moins bien notée |
| Bing, Qwant, Yandex | non | 14 mots |
| WhatsApp, Facebook, LinkedIn | jamais | 14 mots, et l’aperçu de la racine pour les cinq routes |

Le dernier rang est le plus cher : Kolek se vend de bouche à oreille, par lien
collé dans une conversation.

## Le second défaut, du même geste

`sitemap.xml` déclare quatre adresses. Les cinq routes sont servies par le même
`index.html`, donc par la même ligne :

```html
<link rel="canonical" href="https://kolek.cash/" />
```

`/mentions-legales`, `/conditions` et `/confidentialite` déclarent donc chacune
que leur vraie version est la racine. Le sitemap dit l’inverse. Google tranche
par la balise canonique : les trois sortent de l’index. Le commentaire de
`apps/site/index.html:15-33` nomme déjà ce défaut et le laisse ouvert ; cette
spécification le ferme.

## Faisabilité — mesurée avant d’être décidée

Trois sondes lancées le 2026-09-20, avec témoin à chaque fois.

**1. GSAP survit-il à un import hors navigateur ?** `animation.ts:4` appelle
`gsap.registerPlugin(ScrollTrigger)` au niveau du module. Témoin : une sonde
qui touche `document` doit échouer d’abord, et elle échoue
(`ReferenceError`). Puis :

```
GSAP import + registerPlugin     ok
react-dom/server                 ok
```

**2. L’arbre complet rend-il en chaîne ?** `Vitrine` chargée par
`vite.ssrLoadModule` et passée à `renderToString`, dans Node 26, sans DOM :

```
RENDU OK
  octets HTML      : 80160
  mots indexables  : 663
  <h1>             : 1
  <h2>             : 4
  <h3>             : 12
  contient « abonnement »      : true
  contient « FCFA »            : true
  contient « collecteur »      : true
  contient « MOT-ABSENT-XYZZY » : false
```

Le dernier témoin est là pour que les quatre `true` veuillent dire quelque
chose. 663 mots contre 14.

**3. Qu’est-ce qui touche le navigateur pendant le rendu ?** Balayage de
`apps/site/src` et de `packages/ui/src`. Deux seuls points, les deux au rendu
et non dans un `useEffect` :

| Fichier | Ce qu’il lit | Traitement |
| --- | --- | --- |
| `App.tsx:24` | `window.location.pathname` | devient une propriété |
| `Inscription.tsx:89` | `window.location.search` | la route n’est pas prérendue, voir plus bas |

`Bruit`, `Rosace` et `Onde` viennent de `packages/ui/src/Guilloche.tsx` — et
non de fichiers portant leur nom, ce qui a d’abord rendu la sonde muette sur
eux. Vérifiés : aucun `Math.random`, aucun `Date.now`, aucun `useId`. Le rendu
est reproductible.

## Architecture

### Une seule liste de routes

Les routes sont aujourd’hui écrites trois fois — `App.tsx`, `netlify.toml`,
`sitemap.xml` — et `scripts/verifier-routes.mjs` n’en compare que deux. Le
prérendu en ferait une quatrième. À la place, une source unique :

`apps/site/src/vitrine/routes.ts`

```ts
export type Route = {
  /** Le chemin servi, sans barre oblique finale. La racine est `/`. */
  chemin: string;
  /** Le fichier écrit dans `dist`. Forme répertoire : `/conditions` → `conditions/index.html`. */
  fichier: string;
  titre: string;
  description: string;
  /** Déclarée au sitemap et laissée à l’index. */
  indexable: boolean;
  /** Son contenu est rendu dans le HTML servi. */
  prerendu: boolean;
};
```

Lue par `App.tsx`, par `scripts/prerendre.mjs`, par
`scripts/engendrer-sitemap.mjs` et par `scripts/verifier-routes.mjs`. Une route
ajoutée à un seul endroit se propage ; une route oubliée dans `netlify.toml`
fait échouer la vérification.

### La table

| chemin | fichier | indexable | prérendu |
| --- | --- | --- | --- |
| `/` | `index.html` | oui | oui |
| `/mentions-legales` | `mentions-legales/index.html` | oui | oui |
| `/conditions` | `conditions/index.html` | oui | oui |
| `/confidentialite` | `confidentialite/index.html` | oui | oui |
| `/inscription` | `inscription/index.html` | **non** | **non** |

`/inscription` garde ses deux « non », et pour deux raisons distinctes.

*Pas indexable* : c’est le choix déjà pris, porté par le `X-Robots-Tag` du
`netlify.toml`. Une recherche « Kolek » doit tomber sur la page qui explique le
produit, pas sur un formulaire vide.

*Pas prérendu* : son contenu dépend de la chaîne de requête —
`palierDepuisAdresse(window.location.search)` à `Inscription.tsx:89`. Un
prérendu figé sur `?palier=` vide serait remplacé par un autre palier à
l’hydratation, ce qui est exactement la divergence qu’on cherche à éviter.
Rien à indexer sur un formulaire ; le rendre en chaîne ne rapporterait rien et
coûterait une divergence.

Elle reçoit tout de même son fichier, pour ses balises : un lien
d’inscription collé dans WhatsApp affiche aujourd’hui l’aperçu de la racine.
Son corps reste l’écran d’attente.

### Titres et descriptions

Distincts par route, c’est le point. Longueurs visées : titre sous 60 signes,
description entre 120 et 160 — au-delà, Google tronque.

| chemin | titre |
| --- | --- |
| `/` | `Kolek — L’épargne du marché, enfin sécurisée` |
| `/mentions-legales` | `Mentions légales — Kolek` |
| `/conditions` | `Conditions générales — Kolek` |
| `/confidentialite` | `Politique de confidentialité — Kolek` |
| `/inscription` | `Ouvrir un compte collecteur — Kolek` |

Le travail de mots-clés sur le `<h1>` et le corps de la vitrine — `tontine`,
`collecte journalière`, `Abidjan`, absents du site à ce jour — relève du point 2
de l’audit et n’est pas dans cette spécification. Ce qui est fait ici, c’est la
plomberie qui rendra ce travail visible.

### Le prérendu

`scripts/prerendre.mjs`, lancé après `vite build`.

1. Vite en mode middleware, `appType: 'custom'`. **Il n’écoute aucun port** —
   les 5173 et 5174 pointent sur la production, on ne s’en approche pas.
2. `cacheDir` sur un répertoire jetable, et non sur `node_modules/.vite` : un
   transformé périmé servi depuis le cache écrirait du HTML faux dans `dist`,
   et rien ne le dirait.
3. `ssrLoadModule('/src/App.tsx')`.
4. Pour chaque route prérendue, `renderToString(<App chemin={...} />)`.
5. Le gabarit est `dist/index.html` tel que Vite vient de l’écrire — il porte
   déjà les liens vers les paquets empreintés.
6. Pour chaque route : titre, description, canonique, `og:url`, `og:title`,
   `og:description` remplacés ; `<meta name="robots" content="noindex">` ajouté
   si la route n’est pas indexable ; le contenu de `<div id="root">` remplacé
   par le rendu.
7. Écriture dans `dist/<fichier>`.

L’écran d’attente est **remplacé**, pas conservé : sur une route prérendue, le
contenu rendu est lui-même le repli si le JavaScript ne démarre jamais, et il
dit beaucoup plus que « Toujours rien ? ».

`gardeEnv()` s’applique à ce chargement comme à la construction. C’est voulu :
le prérendu compile les mêmes valeurs que le paquet, il doit les exiger aussi.

### La garde de non-régression

Le prérendu **fait échouer la construction** si une route sort sous les
**200 mots indexables**, ou sans sa balise canonique. C’est la même logique que
`gardeEnv` : refuser d’écrire plutôt que de livrer un défaut muet. Le seuil est
bas au regard des 663 mots mesurés ; il attrape l’effondrement, pas la
variation.

### Hydratation

`main.tsx` passe de `createRoot(...).render(...)` à `hydrateRoot(...)`. Sans
cela, React jetterait le HTML prérendu pour tout reconstruire.

Deux divergences connues, les deux traitées :

**`useMouvementAccepte`** (`animation.ts:67`, trois appels dans
`Fonctionnalites.tsx`) lit `matchMedia` dans l’initialisateur d’état. Le
serveur rend `true` ; un visiteur en mouvement réduit rendrait `false` au
premier rendu client. Correction : rendre `true` au premier rendu, et corriger
dans le `useEffect` qui existe déjà. C’est le motif habituel, et il ne change
rien à ce que voit l’utilisateur — le `useEffect` s’exécute avant la peinture.

**`PiedDePage.tsx:97`** rend `new Date().getFullYear()`. Identique des deux
côtés, sauf pour une page construite en décembre et visitée en janvier.
Correction : `suppressHydrationWarning` sur ce nœud, qui est précisément le cas
que l’attribut nomme.

### Netlify

Les quatre réécritures cessent de pointer sur `/index.html` :

```toml
[[redirects]]
  from = "/conditions"
  to = "/conditions/index.html"
  status = 200
```

La cible est nommée plutôt que laissée à la résolution implicite des « jolies
adresses » de Netlify : une règle explicite se lit, et `verifier-routes.mjs`
peut la comparer à la table.

Le `X-Robots-Tag: noindex` sur `/inscription` reste. La balise `robots` écrite
dans son fichier le double : l’en-tête protège la route, la balise protège le
fichier si quelqu’un l’atteint autrement.

### Le sitemap engendré

`scripts/engendrer-sitemap.mjs` écrit `apps/site/public/sitemap.xml` depuis les
routes `indexable`. Le fichier reste versionné et lisible ; le générateur porte
un mode `--verifier` qui échoue si le fichier versionné ne correspond plus à la
table, sur le modèle de `scripts/generer-cgu.mjs`.

Toujours pas de `lastmod`, pour la raison déjà écrite dans le fichier : un
`lastmod` faux est pire qu’absent.

## Ce qui n’est pas dans cette spécification

- Les mots-clés du `<h1>` et du corps (point 2 de l’audit).
- Les données structurées JSON-LD (point 3).
- L’allègement des polices et de GSAP (point 4).
- `scripts/verifier-seo.mjs` (point 5) — la garde des 200 mots ci-dessus en
  tient lieu pour le seul défaut fermé ici.

## Mesure de réussite

Sur `dist`, après construction :

| Route | mots indexables avant | après, attendu |
| --- | --- | --- |
| `/` | 14 | ≥ 650 |
| `/mentions-legales` | 14 | ≥ 200 |
| `/conditions` | 14 | ≥ 200 |
| `/confidentialite` | 14 | ≥ 200 |

Et cinq balises canoniques distinctes, chacune égale à sa propre adresse.
