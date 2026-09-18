# La trace de l’acceptation des conditions — plan d’implémentation

> **Pour les ouvriers agentiques :** SOUS-COMPÉTENCE REQUISE : utiliser
> superpowers:subagent-driven-development (recommandé) ou
> superpowers:executing-plans pour exécuter ce plan tâche par tâche. Les étapes
> emploient la syntaxe à cases (`- [ ]`) pour le suivi.

**But :** enregistrer qui a accepté les conditions générales, quand, et quelle
version exacte du texte, pour qu’elles soient opposables à une personne précise.

**Architecture :** un générateur rend les deux pages légales en texte brut,
en calcule l’empreinte, écrit un instantané daté et la même constante en trois
endroits ; le navigateur envoie cette empreinte, le serveur la compare à la
sienne et refuse ce qu’il ne connaît pas ; une table `acceptations_conditions`
garde un événement par acceptation, jamais écrasé.

**Pile :** React 19, TypeScript, Vite, Vitest + Testing Library (jsdom),
Supabase (PostgreSQL + RLS + Edge Functions sous Deno), Netlify.

**Spécification :** `Docs/specs/2026-09-18-trace-acceptation-conditions-design.md`.
Elle est la source des valeurs ; ce plan est la source de la séquence.

## Contraintes globales

- **Fins de ligne CRLF** sur tout fichier du dépôt. **Vérifie par Node**, jamais
  par `grep` ni `cat` : sous Git Bash ils masquent les `\r`. Motif :
  `fs.readFileSync(f, 'latin1').match(/(?<!\r)\n/g)` doit rendre `null`.
- **Français intégral** : guillemets « », apostrophes typographiques ’.
- **Espaces insécables** bornées à `apps/site/src/vitrine/legal/`. Ne pas en
  semer ailleurs — `npm run verifier:champs` et les relectures les traquent.
- **Aucun cadratin (—) dans un texte rendu de moins de 70 caractères.**
  `npm run verifier:tirets` le garde.
- **Les antislash sont mangés par `node -e`** sous Git Bash. Écris tes scripts
  dans un fichier, et lance `node fichier.mjs`.
- **Un heredoc Bash casse sur les apostrophes droites** dans ce harnais. Écris
  les fichiers avec l’outil d’écriture, pas avec `cat <<EOF`.
- **`npm run db:reset` et `npm run test:db` sont refusés au poste** comme
  ressource partagée. Ne les lance pas, et ne demande à personne de les lancer.
  Le travail `Base` de la CI les couvre. **Mais** un test de
  `supabase/tests/` qui n’importe pas `./harnais` tourne sans la pile Docker :
  `npx.cmd vitest run --config supabase/tests/vitest.config.ts <fichier>`.
  Mesuré : `valider-demande.test.ts` passe ainsi, 24 épreuves, 1,16 s. Sers-t’en
  pour voir tes épreuves de module rouges d’abord.
- **Ne lance jamais de serveur de développement sur les ports 5173 / 5174** :
  ils pointent sur la production.
- **Ne lis jamais `.env`.** La pile locale se configure par variables en ligne.
- **Aucun `git merge`, aucun `git push`, aucun geste de production** sans accord
  explicite de l’exploitant demandé pour ce geste précis.
- **Sous PowerShell, `npx` est bloqué** : utiliser `npx.cmd`.
- **Une sonde muette ment.** Tout zéro ou toute liste vide doit s’accompagner
  d’un témoin dont on connaît la réponse.
- **Rouge d’abord.** Une épreuve qui n’a jamais échoué ne prouve rien. Note le
  message d’échec exact dans ton rapport.

## Ordre de déploiement — à lire avant la tâche 3

L’ordre habituel du dépôt est « la migration part avant les fronts ». Ici il
faut un cran de plus, parce que les Edge Functions vont **exiger** un champ que
les fronts d’aujourd’hui n’envoient pas :

1. **la migration** — sans la table, toute écriture d’acceptation échoue ;
2. **les fronts** — ils envoient `version`, qu’une fonction encore ancienne
   ignore sans dommage ;
3. **les Edge Functions** — elles commencent à refuser ce qui n’a pas de version.

Déployer les fonctions avant les fronts fermerait l’inscription et le
renouvellement pour tout le monde, le temps du décalage. Ce plan produit les
tâches dans l’ordre du dépôt, pas dans l’ordre du déploiement ; c’est
l’exploitant qui déploie, et cette section est pour lui.

## Structure des fichiers

**Créés :**

| Fichier | Responsabilité |
| --- | --- |
| `scripts/generer-cgu.mjs` | rend les deux pages, dépouille, calcule l’empreinte, écrit l’instantané et les trois constantes ; mode `--verifier` |
| `scripts/generer-cgu.test.mjs` | éprouve le dépouillement et la fraîcheur, sans toucher au réseau |
| `Docs/legal/conditions-<AAAA-MM-JJ>-<empreinte>.txt` | l’instantané produit au tribunal (engendré) |
| `apps/site/src/vitrine/legal/version-conditions.ts` | la constante lue par le formulaire public (engendré) |
| `apps/collecteur/src/version-conditions.ts` | la constante et les deux adresses absolues, lues par l’écran d’abonnement (engendré) |
| `supabase/functions/_shared/version-conditions.ts` | la constante lue par les deux Edge Functions (engendré) |
| `supabase/migrations/20260918100000_acceptations_conditions.sql` | la table, ses deux index, RLS et les droits |
| `supabase/functions/_shared/acceptation.ts` | écrit un événement d’acceptation ; partagé par les deux fonctions |
| `supabase/tests/acceptations-conditions.test.ts` | la table refuse `anon` et `authenticated`, et garde l’historique |

**Modifiés :**

| Fichier | Ce qui change |
| --- | --- |
| `apps/site/src/vitrine/legal/Conditions.tsx:160-179` | la phrase du titulaire répondant de ses collaborateurs |
| `apps/site/src/vitrine/legal/Conditions.test.tsx` | l’épreuve de cette phrase |
| `package.json` | `generer:cgu`, `verifier:cgu`, et la chaîne `verifier` |
| `.github/workflows/verification.yml` | l’étape `verifier:cgu` |
| `supabase/functions/_shared/valider-demande.ts` | `version` entre dans la saisie et dans le verdict |
| `supabase/functions/demander-ouverture/index.ts:239-243` | écrit l’acceptation après l’insertion de la demande |
| `supabase/functions/_shared/ouvrir-compte.ts:112-125` | pose `collecteur_id` sur l’acceptation de la demande |
| `apps/site/src/vitrine/demande.ts:24-49` | `version` dans `Demande` |
| `apps/site/src/vitrine/Inscription.tsx:119-131` | envoie la version acceptée |
| `supabase/functions/abonnement-payer/index.ts:162-176` | refuse une version inconnue |
| `apps/collecteur/src/abonnement.ts:72-77` | `version` dans `SaisiePaiement` |
| `apps/collecteur/src/ecrans/Abonnement.tsx` | la case, les deux liens, et la garde avant paiement |

---

### Tâche 1 : la phrase qui ferme le trou du collaborateur

**Pourquoi elle est première :** elle change le texte légal, donc l’empreinte.
La faire après la tâche 2 rendrait l’instantané périmé le jour de sa naissance.

**Fichiers :**
- Modifier : `apps/site/src/vitrine/legal/Conditions.tsx:160-179`
- Épreuve : `apps/site/src/vitrine/legal/Conditions.test.tsx`

**Interfaces :**
- Consomme : rien.
- Produit : rien de programmatique. La tâche 2 dépend du fait que le texte légal
  est figé à partir d’ici.

- [ ] **Étape 1 : écrire l’épreuve qui échoue**

Ajoute dans `apps/site/src/vitrine/legal/Conditions.test.tsx`, à l’intérieur du
`describe` existant :

```tsx
  it('met le titulaire en répondant des collaborateurs qu’il rattache', () => {
    const { container } = render(<Conditions />);
    // §3.4 de la spec : un collaborateur ne règle jamais d’abonnement, donc il
    // ne rencontre aucun des trois chemins où l’acceptation est recueillie.
    // Le trou se ferme par le contrat plutôt que par un écran de plus — et
    // c’est sur lui que pèse en fait l’obligation d’information de l’article 28,
    // puisque c’est lui qui inscrit les clients.
    expect(container.textContent).toMatch(/répondre des collaborateurs qu’il rattache/);
    expect(container.textContent).toMatch(/leur transmettre les obligations des présentes/);
  });
```

- [ ] **Étape 2 : la voir rouge**

Lance : `npm test -w @kolek/site -- --run Conditions`

Attendu : ÉCHEC, deux `expect(...).toMatch` non satisfaits. Note le message
exact.

- [ ] **Étape 3 : poser la phrase**

Dans `apps/site/src/vitrine/legal/Conditions.tsx`, section 8, ajoute un
quatrième élément à la liste, **après** `répondre de l’usage qu’il fait de
l’envoi d’avis par SMS à ses clients.` :

```tsx
          <li>
            répondre des collaborateurs qu’il rattache à son compte, et leur transmettre les
            obligations des présentes : le collaborateur ne règle aucun abonnement, n’accepte
            donc pas ces conditions pour son propre compte, et engage le titulaire par ce
            qu’il inscrit.
          </li>
```

- [ ] **Étape 4 : la voir verte**

Lance : `npm test -w @kolek/site -- --run Conditions`
Attendu : PASSE.

- [ ] **Étape 5 : les gardes de forme**

Lance, et rapporte chaque sortie :

```
npm run verifier:tirets
npm run verifier:mentions
```

Attendu : les deux passent. Vérifie par Node que `Conditions.tsx` et
`Conditions.test.tsx` sont en CRLF, `0` LF nu.

- [ ] **Étape 6 : commettre**

```bash
git add apps/site/src/vitrine/legal/Conditions.tsx apps/site/src/vitrine/legal/Conditions.test.tsx
git commit -m "feat(legal): le titulaire repond des collaborateurs qu il rattache"
```

Termine le message par :

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tâche 2 : le générateur de version

**Fichiers :**
- Créer : `scripts/generer-cgu.mjs`
- Créer : `scripts/generer-cgu.test.mjs`
- Modifier : `package.json`
- Modifier : `.github/workflows/verification.yml`
- Engendrés (commis) : `Docs/legal/conditions-<AAAA-MM-JJ>-<empreinte>.txt`,
  `apps/site/src/vitrine/legal/version-conditions.ts`,
  `apps/collecteur/src/version-conditions.ts`,
  `supabase/functions/_shared/version-conditions.ts`

**Interfaces :**
- Consomme : le texte légal figé par la tâche 1.
- Produit, dans les trois fichiers engendrés :
  - `export const VERSION_CONDITIONS = '<seize caractères hexadécimaux>';`
  - dans le seul fichier du collecteur, en plus :
    `export const URL_CONDITIONS = 'https://kolek.cash/conditions';`
    et `export const URL_CONFIDENTIALITE = 'https://kolek.cash/confidentialite';`
- Produit aussi, exportés par `scripts/generer-cgu.mjs` pour les épreuves :
  `enTexte(html: string): string`, `empreinteDe(texte: string): string`,
  `contenuConstante(empreinte: string, avecUrls: boolean): string`,
  `estAJour(): Promise<boolean>`.

**Ce que Node ne sait pas faire, et pourquoi ce script n’est pas comme les
trois autres.** `generer-theme.mjs`, `generer-marque.mjs` et
`generer-paliers-edge.mjs` importent du TypeScript **sans JSX** ; Node déshabille
le typage et cela marche. Node **ne transforme pas le JSX**. Mesuré sur ce poste,
Node v26.2.0 :

```
import packages/core/src/paliers.ts                        → OK, 4 paliers
import apps/site/src/vitrine/legal/Conditions.tsx
  → TypeError: Unknown file extension ".tsx"
```

D’où Vite en mode intergiciel, par `ssrLoadModule` : déjà résoluble à la racine,
c’est la transformation qui produit le site livré, et elle résout `@kolek/core`
sans alias à tenir.

- [ ] **Étape 1 : écrire les épreuves qui échouent**

Crée `scripts/generer-cgu.test.mjs` :

```js
import { describe, expect, it } from 'vitest';

import { contenuConstante, empreinteDe, enTexte } from './generer-cgu.mjs';

describe('enTexte', () => {
  it('coupe aux fermantes de bloc et retire les balises', () => {
    expect(enTexte('<p>Un</p><p>Deux</p>')).toBe('Un\nDeux');
  });

  it('décode &amp; en dernier, pour ne pas fabriquer une entité qui n’existait pas', () => {
    // `&amp;lt;` est le texte littéral « &lt; ». Décoder `&amp;` en premier le
    // transformerait en `&lt;`, que la passe suivante rendrait « < » — un
    // caractère que personne n’a écrit. L’ordre n’est pas un détail de style.
    expect(enTexte('<p>&amp;lt;</p>')).toBe('&lt;');
  });

  it('garde les espaces insécables, et réduit les autres', () => {
    // U+00A0 n’est pas de la mise en forme : les pages légales le posent devant
    // les deux-points et dans les montants. La règle qui réduit les suites
    // d’espaces ne doit pas le voir.
    // Écrit en échappement et non au caractère : une insécable tapée dans un
    // fichier est indiscernable d’une espace ordinaire à la relecture, et cette
    // épreuve passerait en mesurant exactement le contraire de ce qu’elle annonce.
    expect(enTexte('<p>2\u00a0500   FCFA</p>')).toBe('2\u00a0500 FCFA');
  });

  it('supprime les lignes vides', () => {
    expect(enTexte('<div></div><p>Seule</p><div>  </div>')).toBe('Seule');
  });
});

describe('empreinteDe', () => {
  it('rend seize caractères hexadécimaux', () => {
    expect(empreinteDe('quoi que ce soit')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('change quand le texte change', () => {
    expect(empreinteDe('a')).not.toBe(empreinteDe('b'));
  });
});

describe('contenuConstante', () => {
  it('porte la version, et un en-tête qui interdit la retouche à la main', () => {
    const texte = contenuConstante('0123456789abcdef', false);
    expect(texte).toMatch(/VERSION_CONDITIONS = '0123456789abcdef'/);
    expect(texte).toMatch(/ne pas modifier à la main/);
    expect(texte).not.toMatch(/URL_CONDITIONS/);
  });

  it('ajoute les deux adresses absolues pour le collecteur seulement', () => {
    const texte = contenuConstante('0123456789abcdef', true);
    // L’application du collecteur vit sur app.kolek.cash : un chemin relatif
    // comme `/conditions` y mènerait à une page qui n’existe pas.
    expect(texte).toMatch(/URL_CONDITIONS = 'https:\/\/kolek\.cash\/conditions'/);
    expect(texte).toMatch(/URL_CONFIDENTIALITE = 'https:\/\/kolek\.cash\/confidentialite'/);
  });
});
```

- [ ] **Étape 2 : les voir rouges**

Lance : `npm run test:scripts -- generer-cgu`

Attendu : ÉCHEC à l’import, `Cannot find module` ou
`Failed to load url ./generer-cgu.mjs`. Note le message exact.

- [ ] **Étape 3 : écrire le générateur**

Crée `scripts/generer-cgu.mjs` :

```js
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * La version du texte que les gens acceptent.
 *
 * Trois générateurs de ce dépôt suivent ce motif — `generer-theme.mjs`,
 * `generer-marque.mjs`, `generer-paliers-edge.mjs` — et celui-ci s'en écarte
 * sur un point : il doit charger du JSX, que Node refuse
 * (« Unknown file extension ".tsx" »). Vite le transforme, et c'est la même
 * transformation que celle qui produit le site livré : l'empreinte porte donc
 * sur ce que la personne lit, pas sur le résultat d'une seconde chaîne.
 *
 * L'empreinte porte sur le **texte rendu**, jamais sur les octets des fichiers
 * source : un commentaire ou une classe CSS changeraient les seconds sans que
 * le lecteur voie la moindre différence, et on enregistrerait « nouvelle
 * version acceptée » pour rien.
 */

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** L'origine publique du site, nommée une seule fois. Les chemins, eux, sont
    lus dans `liens.ts` : une deuxième liste de routes tenue à la main est la
    faute que `verifier-routes.mjs` existe pour attraper. */
const ORIGINE = 'https://kolek.cash';

export const CIBLE_SITE = join(RACINE, 'apps/site/src/vitrine/legal/version-conditions.ts');
export const CIBLE_COLLECTEUR = join(RACINE, 'apps/collecteur/src/version-conditions.ts');
export const CIBLE_EDGE = join(RACINE, 'supabase/functions/_shared/version-conditions.ts');
export const DOSSIER_INSTANTANES = join(RACINE, 'Docs/legal');

/** Les fermantes qui valent une fin de ligne. Sans elles, deux paragraphes
    voisins se colleraient en une phrase que personne n'a écrite. */
const FERMANTES_DE_BLOC =
  /<\/(?:p|li|h[1-6]|div|section|table|tr|td|th|ul|ol|main|header|footer|a)>/gi;

/**
 * Le HTML rendu, dépouillé en texte.
 *
 * Cette fonction **est** l'empreinte : deux dépouillements différents donnent
 * deux empreintes différentes pour le même texte lu. Son ordre est donc fixé,
 * et `&amp;` se décode en dernier — le décoder en premier transformerait le
 * texte littéral « &lt; » en un « < » que personne n'a écrit.
 */
export function enTexte(html) {
  return html
    .replace(FERMANTES_DE_BLOC, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    // Les espaces insécables U+00A0 traversent : elles ne sont pas de la mise
    // en forme, et `[ \t]` ne les décrit pas.
    .map((ligne) => ligne.replace(/[ \t]+/g, ' ').trim())
    .filter((ligne) => ligne.length > 0)
    .join('\n');
}

/** Seize caractères hexadécimaux : la valeur se lit dans un message d'erreur et
    se compare à l'œil pendant une mise au point. Une collision sur seize
    suppose un adversaire qui fabrique un second texte juridique de même
    empreinte — pas le risque qu'on traite. */
export function empreinteDe(texte) {
  return createHash('sha256').update(texte, 'utf8').digest('hex').slice(0, 16);
}

/** Lus dans `liens.ts`, jamais recopiés. Node importe ce `.ts` sans peine : il
    ne porte pas de JSX. */
const { CONDITIONS, CONFIDENTIALITE } = await import(
  pathToFileURL(join(RACINE, 'apps/site/src/vitrine/liens.ts')).href
);
const CHEMINS = { conditions: CONDITIONS, confidentialite: CONFIDENTIALITE };

const ENTETE = `// Fichier engendré par scripts/generer-cgu.mjs — ne pas modifier à la main.
// La source est le texte rendu de Conditions.tsx et Confidentialite.tsx.
// Relancer : npm run generer:cgu
//
// Cette constante est la preuve : c'est elle qu'on enregistre avec chaque
// acceptation, et elle désigne l'instantané de Docs/legal/ qu'on produirait
// devant un tribunal. Trois copies engendrées par le même passage — la vitrine,
// l'application du collecteur, les Edge Functions — et npm run verifier:cgu
// échoue si l'une diverge.

`;

export function contenuConstante(empreinte, avecUrls) {
  let texte = ENTETE + `export const VERSION_CONDITIONS = '${empreinte}';\n`;
  if (avecUrls) {
    texte +=
      `\n/** L'application du collecteur vit sur app.kolek.cash : un chemin\n` +
      `    relatif mènerait à une page qui n'existe pas. Les chemins viennent de\n` +
      `    apps/site/src/vitrine/liens.ts, l'origine est nommée dans le générateur. */\n` +
      `export const URL_CONDITIONS = '${ORIGINE}${CHEMINS.conditions}';\n` +
      `export const URL_CONFIDENTIALITE = '${ORIGINE}${CHEMINS.confidentialite}';\n`;
  }
  return texte;
}

/** Rend les deux pages et les dépouille. Le serveur Vite naît et meurt ici. */
export async function texteRendu() {
  const { createServer } = await import('vite');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');

  const serveur = await createServer({
    configFile: false,
    root: join(RACINE, 'apps/site'),
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const pageConditions = await serveur.ssrLoadModule('/src/vitrine/legal/Conditions.tsx');
    const pageConfidentialite = await serveur.ssrLoadModule(
      '/src/vitrine/legal/Confidentialite.tsx',
    );
    return (
      enTexte(renderToStaticMarkup(createElement(pageConditions.Conditions))) +
      '\n\n' +
      enTexte(renderToStaticMarkup(createElement(pageConfidentialite.Confidentialite)))
    );
  } finally {
    await serveur.close();
  }
}

/** Les fins de ligne ne sont pas du contenu : `core.autocrlf` rend en `\r\n`
    sur Windows, et sans cette normalisation le contrôle de fraîcheur échouerait
    sur tout dépôt fraîchement cloné. Même idiome que `generer-paliers-edge.mjs`. */
function normaliser(texte) {
  return texte.replace(/\r\n/g, '\n');
}

export async function estAJour() {
  const empreinte = empreinteDe(await texteRendu());
  const attendus = [
    [CIBLE_SITE, contenuConstante(empreinte, false)],
    [CIBLE_COLLECTEUR, contenuConstante(empreinte, true)],
    [CIBLE_EDGE, contenuConstante(empreinte, false)],
  ];
  for (const [chemin, attendu] of attendus) {
    try {
      if (normaliser(readFileSync(chemin, 'utf8')) !== normaliser(attendu)) return false;
    } catch {
      return false;
    }
  }
  // L'instantané doit exister pour cette empreinte, sinon la constante désigne
  // un document qu'on ne peut pas produire — la situation qu'on cherche à
  // quitter.
  try {
    return readdirSync(DOSSIER_INSTANTANES).some((nom) => nom.endsWith(`-${empreinte}.txt`));
  } catch {
    return false;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const verifier = process.argv.includes('--verifier');

  if (verifier) {
    if (await estAJour()) {
      console.log('La version des conditions est à jour.');
      process.exit(0);
    }
    console.error(
      'Le texte des conditions a bougé sans régénération. Lance `npm run generer:cgu`, et commets l’instantané.',
    );
    process.exit(1);
  }

  const texte = await texteRendu();
  const empreinte = empreinteDe(texte);
  const jour = new Date().toISOString().slice(0, 10);

  mkdirSync(DOSSIER_INSTANTANES, { recursive: true });
  writeFileSync(join(DOSSIER_INSTANTANES, `conditions-${jour}-${empreinte}.txt`), texte, 'utf8');

  for (const [chemin, avecUrls] of [
    [CIBLE_SITE, false],
    [CIBLE_COLLECTEUR, true],
    [CIBLE_EDGE, false],
  ]) {
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, contenuConstante(empreinte, avecUrls), 'utf8');
  }

  console.log(
    `Version ${empreinte} — ${texte.length} caractères, ${texte.split('\n').length} lignes.`,
  );
}
```

- [ ] **Étape 4 : les voir vertes**

Lance : `npm run test:scripts -- generer-cgu`
Attendu : PASSE, huit épreuves.

- [ ] **Étape 5 : engendrer, et lire le témoin**

Lance : `node scripts/generer-cgu.mjs`

Attendu, une ligne de la forme :
`Version <seize hex> — 12xxx caractères, 1xx lignes.`

**L’empreinte ne sera pas `670b774c2ad81b9e`.** Ce chiffre a été mesuré sur
`09dd081`, **avant** que la tâche 1 n’ajoute la phrase du titulaire : le texte a
changé, donc l’empreinte aussi. C’est le comportement attendu, et c’est même la
première preuve que la garde mesure quelque chose.

Ce qui doit tenir, en revanche — vérifie-le en lisant l’instantané par Node :

```
caractères entre 12 500 et 13 000
lignes entre 145 et 160
balises restantes : 0        (motif /<[a-z]/i)
entités restantes : 0        (motif /&[a-z#]+;/i)
insécables U+00A0 : au moins 60
```

Si l’un de ces cinq sort du cadre, la règle de dépouillement a été lue de
travers — ce n’est pas le texte qui a changé.

- [ ] **Étape 6 : câbler les scripts npm**

Dans `package.json`, à côté de `generer:paliers` et `verifier:paliers` :

```json
    "generer:cgu": "node scripts/generer-cgu.mjs",
    "verifier:cgu": "node scripts/generer-cgu.mjs --verifier",
```

Et dans la chaîne `verifier`, insère `&& npm run verifier:cgu` **immédiatement
après** `npm run verifier:paliers`. Les trois autres générateurs y figurent ; en
omettre un laisserait un générateur sur quatre hors du rang.

- [ ] **Étape 7 : voir la garde rouge, puis verte**

C’est l’épreuve qui compte le plus de ce plan. Fais-la dans cet ordre :

1. `npm run verifier:cgu` → attendu : `La version des conditions est à jour.`
2. Change une phrase de `apps/site/src/vitrine/legal/Conditions.tsx` — par
   exemple remplace `Tournée :` par `Tournee :` dans la section 1.
3. `npm run verifier:cgu` → attendu : ÉCHEC, code 1, message
   `Le texte des conditions a bougé sans régénération.` **Note-le exactement.**
4. Défais ta modification (`git checkout -- apps/site/src/vitrine/legal/Conditions.tsx`).
5. `npm run verifier:cgu` → attendu : à jour de nouveau.

Une garde qu’on n’a pas vue échouer ne garde rien.

- [ ] **Étape 8 : l’étape de CI**

Dans `.github/workflows/verification.yml`, après l’étape
`App.tsx et netlify.toml dispatchent les mêmes routes`, ajoute :

```yaml
      # La preuve qu'on enregistre avec chaque acceptation est une empreinte du
      # texte rendu. Si quelqu'un corrige une virgule des conditions sans
      # relancer le générateur, la constante désigne un instantané qui n'est
      # plus le texte affiché : on enregistrerait une acceptation pour un
      # document qu'on ne peut pas produire. Rien ne casse — le site se
      # construit, la page s'affiche, le formulaire répond — et c'est
      # précisément pourquoi seule une étape de CI l'attrape.
      - name: La version des conditions correspond au texte
        run: npm run verifier:cgu
```

Vérifie que le YAML reste analysable. **`node -e` est piégé ici** : écris un
script de fichier qui lit `.github/workflows/verification.yml` et compte les
étapes `- name:`.

- [ ] **Étape 9 : commettre**

```bash
git add scripts/generer-cgu.mjs scripts/generer-cgu.test.mjs package.json .github/workflows/verification.yml Docs/legal apps/site/src/vitrine/legal/version-conditions.ts apps/collecteur/src/version-conditions.ts supabase/functions/_shared/version-conditions.ts
git commit -m "feat(scripts): engendrer la version des conditions et la garder"
```

Termine le message par :

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tâche 3 : la table des acceptations

**Fichiers :**
- Créer : `supabase/migrations/20260918100000_acceptations_conditions.sql`
- Créer : `supabase/tests/acceptations-conditions.test.ts`

**Interfaces :**
- Consomme : rien.
- Produit : la table `public.acceptations_conditions`, colonnes
  `id uuid`, `demande_id uuid null`, `collecteur_id uuid null`,
  `version text not null`, `acceptee_le timestamptz not null default now()`.

**Tu ne peux pas lancer `test:db`.** Écris l’épreuve, vérifie que son SQL et ses
imports sont cohérents, et dis-le dans ton rapport : c’est le travail `Base` de
la CI qui la rendra verte. Ne cherche pas à contourner.

- [ ] **Étape 1 : écrire l’épreuve qui échoue**

Crée `supabase/tests/acceptations-conditions.test.ts` :

```ts
import { afterAll, describe, expect, it } from 'vitest';

import { admin, anon } from './harnais';

/**
 * La trace de l'acceptation des conditions.
 *
 * Spec : `Docs/specs/2026-09-18-trace-acceptation-conditions-design.md` §4.
 *
 * Deux propriétés, et elles ne se voient pas dans le schéma :
 *
 * 1. **Un événement par acceptation, jamais écrasé.** Le jour où les conditions
 *    changeront, une nouvelle acceptation ne doit pas effacer la précédente :
 *    un litige portant sur une période antérieure se retrouverait sans preuve.
 * 2. **Aucun navigateur n'écrit ici.** Ni `anon` ni `authenticated` : seules les
 *    Edge Functions, qui valident la version avant d'écrire.
 */

const MARQUE = crypto.randomUUID().slice(0, 8);
const posees: string[] = [];

afterAll(async () => {
  if (posees.length > 0) {
    await admin.from('acceptations_conditions').delete().in('id', posees);
  }
});

describe('acceptations_conditions', () => {
  it('garde deux acceptations du même compte, sans écraser la première', async () => {
    const { data: compte } = await admin
      .from('collecteurs')
      .select('id')
      .limit(1)
      .maybeSingle();
    // Témoin : sans collecteur en base, l'épreuve ne mesurerait rien.
    expect(compte?.id, 'aucun collecteur en base : la sonde ne mesure rien').toBeTruthy();

    const premiere = await admin
      .from('acceptations_conditions')
      .insert({ collecteur_id: compte!.id, version: `v1-${MARQUE}` })
      .select('id, acceptee_le')
      .single();
    expect(premiere.error).toBeNull();
    posees.push(premiere.data!.id);

    const seconde = await admin
      .from('acceptations_conditions')
      .insert({ collecteur_id: compte!.id, version: `v2-${MARQUE}` })
      .select('id')
      .single();
    expect(seconde.error).toBeNull();
    posees.push(seconde.data!.id);

    const { data: toutes } = await admin
      .from('acceptations_conditions')
      .select('version')
      .eq('collecteur_id', compte!.id)
      .like('version', `%${MARQUE}`);
    expect(toutes?.map((l) => l.version).sort()).toEqual([`v1-${MARQUE}`, `v2-${MARQUE}`]);
  });

  it('pose la date elle-même, sans croire le client', async () => {
    const { data: compte } = await admin.from('collecteurs').select('id').limit(1).maybeSingle();
    expect(compte?.id).toBeTruthy();

    const avant = new Date(Date.now() - 60_000);
    const { data, error } = await admin
      .from('acceptations_conditions')
      // Une date envoyée par le navigateur est une date que le navigateur
      // choisit : on n'en envoie pas, et le défaut serveur doit s'appliquer.
      .insert({ collecteur_id: compte!.id, version: `date-${MARQUE}` })
      .select('id, acceptee_le')
      .single();
    expect(error).toBeNull();
    posees.push(data!.id);
    expect(new Date(data!.acceptee_le).getTime()).toBeGreaterThan(avant.getTime());
  });

  it('refuse la lecture et l’écriture à un navigateur anonyme', async () => {
    const lecture = await anon.from('acceptations_conditions').select('id').limit(1);
    expect(lecture.error, 'anon ne doit pas pouvoir lire').not.toBeNull();

    const ecriture = await anon
      .from('acceptations_conditions')
      .insert({ version: `intrus-${MARQUE}` });
    expect(ecriture.error, 'anon ne doit pas pouvoir écrire').not.toBeNull();
  });
});
```

Vérifie dans `supabase/tests/harnais.ts` que `admin` et `anon` y sont bien
exportés sous ces noms ; si l’un porte un autre nom, emploie le vrai — ne
renomme rien dans le harnais.

- [ ] **Étape 2 : constater qu’elle ne peut pas être verte**

Lance : `npx.cmd vitest run --config supabase/tests/vitest.config.ts supabase/tests/acceptations-conditions.test.ts`

Attendu : ÉCHEC. Le harnais exige la pile locale, que tu n’as pas le droit de
démarrer par `db:reset`. **Note l’échec tel qu’il sort**, et dis dans ton rapport
que la vérification réelle revient au travail `Base` de la CI.

- [ ] **Étape 3 : écrire la migration**

Crée `supabase/migrations/20260918100000_acceptations_conditions.sql` :

```sql
-- La trace de l'acceptation des conditions générales.
--
-- Spec : Docs/specs/2026-09-18-trace-acceptation-conditions-design.md §4.
--
-- Un événement par acceptation, et non deux colonnes sur le compte. Le jour où
-- les conditions changeront — et elles changeront, l'autorisation ARTCI devra y
-- figurer quand elle arrivera — une nouvelle acceptation ne doit pas écraser la
-- précédente : un litige portant sur une période antérieure au changement se
-- retrouverait sans preuve.
create table if not exists public.acceptations_conditions (
  id uuid primary key default gen_random_uuid(),

  -- La demande où l'acte a eu lieu. Nulle au renouvellement, où la personne est
  -- authentifiée et où il n'y a pas de demande.
  --
  -- `on delete set null` est une ceinture, pas une règle qui s'exercera : la
  -- politique de confidentialité établit que « l'effacement se fait par
  -- anonymisation, jamais par suppression ». La clause couvre le jour où une
  -- purge serait écrite ; elle ne décrit rien d'existant.
  demande_id uuid references public.demandes_ouverture(id) on delete set null,

  -- Posé à la naissance du compte sur la voie payante, connu d'emblée au
  -- renouvellement, et jamais posé sur la voie essai : `admin-creer-collecteur`
  -- ignore la demande dont le compte provient (vérifié : aucune mention).
  --
  -- `on delete cascade` ne peut emporter que la trace d'un compte qui n'a jamais
  -- fait circuler un franc : `admin-supprimer-collecteur` refuse deux fois,
  -- COMPTE_A_ENCAISSE sur `mises` ou `retraits`, et COMPTE_A_PAYE sur
  -- `paiements_abonnement`. Un collecteur qui a réglé un abonnement est
  -- indélétable.
  collecteur_id uuid references auth.users(id) on delete cascade,

  -- L'empreinte du texte accepté, engendrée par scripts/generer-cgu.mjs. Elle
  -- désigne l'instantané de Docs/legal/ qu'on produirait devant un tribunal.
  version text not null,

  -- Du serveur. Une date envoyée par le navigateur est une date que le
  -- navigateur choisit.
  acceptee_le timestamptz not null default now()
);

comment on table public.acceptations_conditions is
  'Un événement par acceptation des conditions générales. Jamais écrasé : l''historique des versions est la preuve.';

-- Le webhook retrouve la ligne par la demande au moment de poser collecteur_id.
create index if not exists acceptations_conditions_demande_idx
  on public.acceptations_conditions (demande_id);

-- La question du jour du litige : qu'a accepté cette personne, et quand.
create index if not exists acceptations_conditions_collecteur_idx
  on public.acceptations_conditions (collecteur_id, acceptee_le desc);

-- Même dispositif que `demandes_ouverture` : RLS activée **et** droits révoqués.
-- L'activer sans révoquer, ou révoquer sans l'activer, laisserait la moitié de
-- la protection à la charge de l'autre.
alter table public.acceptations_conditions enable row level security;

revoke all on public.acceptations_conditions from public;
revoke all on public.acceptations_conditions from anon;
revoke all on public.acceptations_conditions from authenticated;
grant all on public.acceptations_conditions to service_role;
```

- [ ] **Étape 4 : vérifier la forme de la migration**

Lance : `npm run verifier:migrations`
Attendu : passe. Rapporte la sortie.

Vérifie par Node : CRLF, `0` LF nu, sur les deux fichiers créés.

- [ ] **Étape 5 : commettre**

```bash
git add supabase/migrations/20260918100000_acceptations_conditions.sql supabase/tests/acceptations-conditions.test.ts
git commit -m "feat(base): la table des acceptations de conditions"
```

Termine le message par :

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tâche 4 : `demander-ouverture` refuse une version inconnue et écrit l’acceptation

**Fichiers :**
- Créer : `supabase/functions/_shared/acceptation.ts`
- Modifier : `supabase/functions/_shared/valider-demande.ts:36-45`, `:169-180`
- Modifier : `supabase/functions/demander-ouverture/index.ts:239-243`
- Épreuve : `supabase/tests/valider-demande.test.ts`

**Interfaces :**
- Consomme : `VERSION_CONDITIONS` de
  `supabase/functions/_shared/version-conditions.ts` (tâche 2) ; la table de la
  tâche 3.
- Produit :
  `enregistrerAcceptation(client, { demandeId, collecteurId, version }): Promise<{ ok: boolean; message?: string }>`
  dans `_shared/acceptation.ts`, que la tâche 7 réutilise.
  Nouveau code d’erreur serveur : `VERSION_CONDITIONS_PERIMEE`.

- [ ] **Étape 1 : écrire l’épreuve qui échoue**

Ajoute à `supabase/tests/valider-demande.test.ts` :

```ts
  it('refuse une demande sans version des conditions', () => {
    const verdict = validerDemande({ ...demandeMinimale(), version: undefined });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.erreur).toBe('VERSION_CONDITIONS_PERIMEE');
  });

  it('refuse une version que le serveur ne connaît pas', () => {
    // Un onglet resté ouvert depuis une version précédente. Sans ce contrôle,
    // on enregistrerait une acceptation pour un texte qu'on ne peut pas
    // produire — exactement la situation qu'on cherche à quitter.
    const verdict = validerDemande({ ...demandeMinimale(), version: 'deadbeefdeadbeef' });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.erreur).toBe('VERSION_CONDITIONS_PERIMEE');
  });

  it('accepte la version courante et la rend dans le verdict', () => {
    const verdict = validerDemande({ ...demandeMinimale(), version: VERSION_CONDITIONS });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.version).toBe(VERSION_CONDITIONS);
  });
```

En tête du fichier, ajoute l’import :

```ts
import { VERSION_CONDITIONS } from '../functions/_shared/version-conditions.ts';
```

`demandeMinimale()` n’existe peut-être pas dans ce fichier. **Lis-le avant
d’écrire** : s’il construit ses saisies autrement, suis sa façon plutôt que
d’introduire une aide qui doublerait un motif existant. S’il n’a rien de tel,
écris-la, en reprenant exactement les valeurs qu’emploient les épreuves voisines.

- [ ] **Étape 2 : la voir rouge**

Lance : `npx.cmd vitest run --config supabase/tests/vitest.config.ts supabase/tests/valider-demande.test.ts`

Attendu : ÉCHEC, les trois nouvelles épreuves. La première et la deuxième parce
que `verdict.ok` vaut `true`, la troisième parce que `verdict.version` est
`undefined`. Note les messages exacts.

- [ ] **Étape 3 : la version entre dans le validateur**

Dans `supabase/functions/_shared/valider-demande.ts` :

Ajoute l’import en tête :

```ts
import { VERSION_CONDITIONS } from './version-conditions.ts';
```

Dans `DemandeBrute`, après `motDePasse?: unknown;` :

```ts
  /** L'empreinte du texte que la personne avait sous les yeux. Voir `Resultat`. */
  version?: unknown;
```

Dans `Resultat`, la branche de succès devient :

```ts
export type Resultat =
  | { ok: true; demande: DemandeValide; motDePasse: string | null; version: string }
  | { ok: false; erreur: string; champ: string };
```

Juste avant le `return { ok: true, ... }` final, ajoute :

```ts
  // L'empreinte voyage **à côté** de la demande, comme le mot de passe et pour
  // une raison voisine : `demande` est inséré tel quel dans
  // `demandes_ouverture`, qui n'a pas de colonne pour elle. L'acceptation est un
  // événement séparé, écrit dans sa propre table.
  //
  // Le serveur compare à la sienne plutôt que de croire le client : une version
  // envoyée et crue sur parole ne vaut pas mieux qu'aucune version.
  const version = typeof brut.version === 'string' ? brut.version.trim() : '';
  if (version !== VERSION_CONDITIONS) {
    return { ok: false, erreur: 'VERSION_CONDITIONS_PERIMEE', champ: 'version' };
  }
```

Et ajoute `version,` au littéral rendu par le `return { ok: true, ... }`.

- [ ] **Étape 4 : écrire l’écriture de l’acceptation**

Crée `supabase/functions/_shared/acceptation.ts` :

```ts
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * L'écriture d'un événement d'acceptation.
 *
 * Spec : `Docs/specs/2026-09-18-trace-acceptation-conditions-design.md` §4.
 *
 * Partagée par les deux chemins qui la recueillent — le formulaire public et le
 * renouvellement dans l'application — parce qu'une deuxième copie de ces dix
 * lignes finirait par écrire une colonne de moins que l'autre, et que
 * l'asymétrie ne se verrait qu'au tribunal.
 *
 * `acceptee_le` n'est jamais envoyé : le défaut de la colonne est `now()`, du
 * serveur. Une date envoyée par le navigateur est une date que le navigateur
 * choisit.
 */
export async function enregistrerAcceptation(
  client: SupabaseClient,
  acte: { demandeId?: string | null; collecteurId?: string | null; version: string },
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await client.from('acceptations_conditions').insert({
    demande_id: acte.demandeId ?? null,
    collecteur_id: acte.collecteurId ?? null,
    version: acte.version,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
```

Vérifie le chemin d’import de `SupabaseClient` employé par les autres fichiers
de `supabase/functions/_shared/` et **reprends le leur**, à la version près.

- [ ] **Étape 5 : la fonction écrit l’acceptation**

Dans `supabase/functions/demander-ouverture/index.ts`, ajoute l’import :

```ts
import { enregistrerAcceptation } from '../_shared/acceptation.ts';
```

Puis, juste après le bloc `if (error) { ... }` qui suit l’insertion dans
`demandes_ouverture` — c’est-à-dire avant le
`if (!payant || !preparation) { return reponse({ recue: true }, 201, requete); }` :

```ts
  // L'acceptation, écrite avec la demande dont elle est née. `collecteur_id`
  // reste nul : sur un palier payant, le webhook le posera à la naissance du
  // compte ; sur un essai, il ne sera jamais posé — `admin-creer-collecteur`
  // ignore la demande, et l'essai n'a pas d'argent en jeu.
  //
  // Un échec ici ne fait pas échouer la demande : elle est écrite, la personne
  // a bien accepté, et refuser maintenant lui ferait tout ressaisir pour une
  // ligne de journal. Mais il doit se voir dans les traces, parce qu'une
  // acceptation manquante est une preuve manquante.
  const trace = await enregistrerAcceptation(client, {
    demandeId: rangee.id,
    version: verdict.version,
  });
  if (!trace.ok) {
    console.error('[Ouverture] acceptation non enregistrée pour', rangee.id, ':', trace.message);
  }
```

- [ ] **Étape 6 : le message côté navigateur**

Dans `apps/site/src/vitrine/demande.ts`, ajoute à la table `MESSAGES` :

```ts
  VERSION_CONDITIONS_PERIMEE:
    'Les conditions générales ont changé depuis l’ouverture de cette page. Recharge-la, relis-les, et réessaie.',
```

Sans cette ligne, le refus s’afficherait comme une panne générique, et personne
ne saurait qu’il suffit de recharger.

- [ ] **Étape 7 : les voir vertes**

Lance : `npx.cmd vitest run --config supabase/tests/vitest.config.ts supabase/tests/valider-demande.test.ts`
Attendu : PASSE, les trois nouvelles comprises.

Lance : `npm run verifier:portillons`
Attendu : passe — le fichier `_shared/acceptation.ts` n’est pas une fonction, il
ne doit pas apparaître dans la table des portillons.

- [ ] **Étape 8 : commettre**

```bash
git add supabase/functions/_shared/acceptation.ts supabase/functions/_shared/valider-demande.ts supabase/functions/demander-ouverture/index.ts supabase/tests/valider-demande.test.ts apps/site/src/vitrine/demande.ts
git commit -m "feat(ouverture): refuser une version inconnue et tracer l acceptation"
```

Termine le message par :

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tâche 5 : le webhook relie l’acceptation au compte qui naît

**Fichiers :**
- Modifier : `supabase/functions/_shared/ouvrir-compte.ts:112-125`
- Épreuve : `supabase/tests/chariow-webhook.test.ts`

**Interfaces :**
- Consomme : la table de la tâche 3. **Pas** `enregistrerAcceptation` de la
  tâche 4 : ici la ligne existe déjà, écrite au formulaire, et il s’agit de la
  mettre à jour — pas d’en insérer une seconde.
- Produit : rien de nouveau. Elle rend vraie la phrase du §3.1 de la spec,
  « reliée au compte à sa naissance ».

- [ ] **Étape 1 : écrire l’épreuve qui échoue**

Ajoute à `supabase/tests/chariow-webhook.test.ts`, dans le `describe` qui couvre
l’ouverture du compte :

```ts
  it('relie l’acceptation au compte à sa naissance', async () => {
    // §3.1 de la spec : c'est le seul chemin où le contrat se forme sans
    // intervention humaine, donc le seul où la preuve doit désigner un compte et
    // pas seulement une demande.
    const { data: acceptation } = await admin
      .from('acceptations_conditions')
      .select('collecteur_id, version')
      .eq('demande_id', demandeId)
      .single();

    expect(acceptation?.collecteur_id, 'collecteur_id doit être posé').toBe(compteCree);
    expect(acceptation?.version, 'la version doit survivre').toBeTruthy();
  });
```

**Lis le fichier avant d’écrire** : il porte déjà des noms pour la demande et le
compte créé. Emploie les siens plutôt que `demandeId` et `compteCree` si les
siens diffèrent, et place l’épreuve dans le `describe` qui a déjà fait naître un
compte — n’en fabrique pas un second.

- [ ] **Étape 2 : la voir rouge**

Lance : `npx.cmd vitest run --config supabase/tests/vitest.config.ts supabase/tests/chariow-webhook.test.ts`

Attendu : ÉCHEC — la pile locale est requise pour ce fichier. **Note-le**, et dis
dans ton rapport que la vérification revient au travail `Base` de la CI.

- [ ] **Étape 3 : poser `collecteur_id`**

Dans `supabase/functions/_shared/ouvrir-compte.ts`, juste après le bloc qui pose
la zone (`if (demande.zone) { ... }`) et avant `return compte;` :

```ts
    // L'acceptation a été écrite au formulaire, avec la demande et sans compte —
    // il n'existait pas encore. C'est ici qu'elle rejoint la personne : c'est le
    // moment où le contrat se forme, « payer vaut accord ».
    //
    // Un échec ne fait pas échouer l'ouverture, pour la même raison que la zone :
    // le compte existe, le paiement est encaissé, et refuser maintenant
    // laisserait un client payant sans accès. Mais il se voit dans les traces —
    // une acceptation qui ne désigne pas de compte reste rattachée à sa demande,
    // avec le nom et le numéro, donc la preuve n'est pas perdue, seulement moins
    // directe.
    const { error: erreurAcceptation } = await clientService
      .from('acceptations_conditions')
      .update({ collecteur_id: compte })
      .eq('demande_id', demandeId)
      .is('collecteur_id', null);
    if (erreurAcceptation) {
      console.error(
        '[Abonnement] acceptation non reliée au compte',
        compte,
        ':',
        erreurAcceptation.message,
      );
    }
```

Le `.is('collecteur_id', null)` n’est pas décoratif : le webhook peut rejouer,
et une deuxième passe ne doit pas réécrire une ligne déjà reliée.

- [ ] **Étape 4 : vérifier ce qui est vérifiable**

Lance : `npm run verifier:portillons` et `npm run verifier:lint`
Attendu : les deux passent. Rapporte les sorties.

Vérifie par Node : CRLF, `0` LF nu, sur les deux fichiers touchés.

- [ ] **Étape 5 : commettre**

```bash
git add supabase/functions/_shared/ouvrir-compte.ts supabase/tests/chariow-webhook.test.ts
git commit -m "feat(ouverture): relier l acceptation au compte a sa naissance"
```

Termine le message par :

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tâche 6 : le formulaire public envoie la version acceptée

**Fichiers :**
- Modifier : `apps/site/src/vitrine/demande.ts:24-49`
- Modifier : `apps/site/src/vitrine/Inscription.tsx:119-131`
- Épreuve : `apps/site/src/vitrine/Inscription.test.tsx`

**Interfaces :**
- Consomme : `VERSION_CONDITIONS` de
  `apps/site/src/vitrine/legal/version-conditions.ts` (tâche 2).
- Produit : le champ `version: string` dans l’interface `Demande`.

- [ ] **Étape 1 : écrire l’épreuve qui échoue**

Ajoute à `apps/site/src/vitrine/Inscription.test.tsx` :

```tsx
  it('envoie la version des conditions acceptée', async () => {
    const envoi = vi.fn().mockResolvedValue({ ok: true });
    vi.mocked(envoyerDemande).mockImplementation(envoi);

    render(<Inscription />);
    await remplirLeFormulaire();
    await cocherLesConditions();
    await soumettre();

    // La case garde la soumission depuis la tâche 8 du chantier précédent, mais
    // rien de cet accord n'atteignait le serveur : ni indicateur, ni date, ni
    // version. Des conditions opposables en principe, improuvables contre une
    // personne précise.
    expect(envoi).toHaveBeenCalledWith(
      expect.objectContaining({ version: VERSION_CONDITIONS }),
    );
  });
```

Ajoute en tête du fichier :

```tsx
import { VERSION_CONDITIONS } from './legal/version-conditions';
```

`remplirLeFormulaire`, `cocherLesConditions` et `soumettre` sont les aides du
fichier. **Lis-le avant d’écrire** et emploie les noms qui s’y trouvent : le
chantier précédent y a introduit `remplirLeFormulaire()`. Si les deux autres
n’existent pas, fais leur travail en ligne plutôt que d’inventer des aides
qu’une seule épreuve emploierait.

- [ ] **Étape 2 : la voir rouge**

Lance : `npm test -w @kolek/site -- --run Inscription`
Attendu : ÉCHEC, `version` absent de l’objet passé à `envoyerDemande`. Note le
message exact.

- [ ] **Étape 3 : le champ dans le contrat**

Dans `apps/site/src/vitrine/demande.ts`, ajoute à l’interface `Demande`, après
`motDePasse: string;` :

```ts
  /** L'empreinte du texte que la personne avait sous les yeux en cochant la
      case, engendrée par `scripts/generer-cgu.mjs`. Le serveur la compare à la
      sienne et refuse ce qu'il ne connaît pas : un onglet resté ouvert depuis
      une version précédente ne doit pas produire une acceptation pour un texte
      qu'on ne peut plus produire. */
  version: string;
```

- [ ] **Étape 4 : le formulaire l’envoie**

Dans `apps/site/src/vitrine/Inscription.tsx`, ajoute l’import :

```tsx
import { VERSION_CONDITIONS } from './legal/version-conditions';
```

Puis, dans l’objet passé à `envoyerDemande`, après la ligne
`motDePasse: payant ? motDePasse : '',` :

```tsx
      // Lue depuis la constante engendrée, jamais écrite à la main : c'est la
      // même valeur que celle du serveur, par construction, et `verifier:cgu`
      // échoue si les deux divergent.
      version: VERSION_CONDITIONS,
```

- [ ] **Étape 5 : la voir verte**

Lance : `npm test -w @kolek/site -- --run Inscription`
Attendu : PASSE.

- [ ] **Étape 6 : la chaîne complète du site**

Lance, et rapporte chaque sortie :

```
npm test -w @kolek/site -- --run
npm run build -w @kolek/site
npm run verifier:tirets
```

Vérifie par Node : CRLF, `0` LF nu, sur les trois fichiers touchés.

- [ ] **Étape 7 : commettre**

```bash
git add apps/site/src/vitrine/demande.ts apps/site/src/vitrine/Inscription.tsx apps/site/src/vitrine/Inscription.test.tsx
git commit -m "feat(site): envoyer la version des conditions acceptee"
```

Termine le message par :

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tâche 7 : `abonnement-payer` refuse une version inconnue et écrit l’acceptation

**Fichiers :**
- Modifier : `supabase/functions/abonnement-payer/index.ts:162-176`, `:253-267`
- Modifier : `apps/collecteur/src/abonnement.ts:23-52`
- Épreuve : `supabase/tests/abonnement-payer.test.ts`

**Interfaces :**
- Consomme : `VERSION_CONDITIONS` de
  `supabase/functions/_shared/version-conditions.ts` (tâche 2) ;
  `enregistrerAcceptation` de `_shared/acceptation.ts` (tâche 4).
- Produit : le code d’erreur `VERSION_CONDITIONS_PERIMEE` sur cette fonction
  aussi, et sa phrase dans la table du collecteur.

**Attention à la table tenue complète.** `apps/collecteur/src/abonnement.ts`
porte un commentaire explicite : « La table est tenue **complète** par un test
qui lit les sources des deux Edge Functions : tout code qu'un serveur peut
rendre a sa phrase. » Ajouter le refus côté serveur **sans** sa phrase fera
échouer ce test. C’est voulu, et c’est le bon ordre : vois-le rouge, puis pose
la phrase.

- [ ] **Étape 1 : écrire l’épreuve qui échoue**

Ajoute à `supabase/tests/abonnement-payer.test.ts` :

```ts
  it('refuse une version des conditions que le serveur ne connaît pas', async () => {
    const reponse = await appeler({ palier: 'pro', version: 'deadbeefdeadbeef' });
    expect(reponse.status).toBe(400);
    expect((await reponse.json()).erreur).toBe('VERSION_CONDITIONS_PERIMEE');
  });

  it('écrit l’acceptation avec le collecteur connu d’emblée', async () => {
    // §3.3 : cette voie est plus propre que la voie publique — la personne est
    // authentifiée, donc `collecteur_id` est connu sans passer par une demande.
    // C'est aussi le rattrapage : chaque collecteur déjà en place accepte à son
    // prochain renouvellement, au moment où il y a de l'argent en jeu.
    await appeler({ palier: 'pro', version: VERSION_CONDITIONS });

    const { data } = await admin
      .from('acceptations_conditions')
      .select('collecteur_id, demande_id, version')
      .eq('collecteur_id', collecteurId)
      .order('acceptee_le', { ascending: false })
      .limit(1)
      .single();

    expect(data?.collecteur_id).toBe(collecteurId);
    expect(data?.demande_id, 'aucune demande sur cette voie').toBeNull();
    expect(data?.version).toBe(VERSION_CONDITIONS);
  });
```

**Lis le fichier avant d’écrire** : `appeler` et `collecteurId` sont les noms
supposés de ses aides. Emploie les siens.

- [ ] **Étape 2 : la voir rouge**

Lance : `npx.cmd vitest run --config supabase/tests/vitest.config.ts supabase/tests/abonnement-payer.test.ts`

Attendu : ÉCHEC — la pile locale est requise. Note-le, et dis dans ton rapport
que la vérification revient au travail `Base` de la CI.

Lance aussi : `npm test -w @kolek/collecteur -- --run abonnement`
Cette épreuve-là, tu peux la voir : elle vérifie que la table de phrases est
complète, et elle doit rester **verte** pour l’instant — le code serveur n’existe
pas encore.

- [ ] **Étape 3 : le refus côté serveur**

Dans `supabase/functions/abonnement-payer/index.ts`, ajoute les imports :

```ts
import { enregistrerAcceptation } from '../_shared/acceptation.ts';
import { VERSION_CONDITIONS } from '../_shared/version-conditions.ts';
```

Puis, juste après le contrôle du téléphone
(`if (!telephone) return reponse({ erreur: 'TELEPHONE_INVALIDE' }, 400, requete);`) :

```ts
  // Le serveur compare à la sienne plutôt que de croire le client. Sans ce
  // contrôle, on enregistrerait une acceptation pour un texte qu'on ne peut pas
  // produire — exactement la situation qu'on cherche à quitter.
  const version = typeof saisie.version === 'string' ? saisie.version.trim() : '';
  if (version !== VERSION_CONDITIONS) {
    return reponse({ erreur: 'VERSION_CONDITIONS_PERIMEE' }, 400, requete);
  }
```

- [ ] **Étape 4 : la voir rouge de l’autre côté**

Lance : `npm test -w @kolek/collecteur -- --run abonnement`

Attendu : ÉCHEC maintenant. L’épreuve de complétude lit les sources des deux
Edge Functions et trouve un code sans phrase. **Note le message exact** — c’est
la démonstration que ce filet fonctionne.

- [ ] **Étape 5 : la phrase**

Dans `apps/collecteur/src/abonnement.ts`, ajoute à la table `MESSAGES`, près de
`PALIER_INCONNU` :

```ts
  VERSION_CONDITIONS_PERIMEE:
    'Les conditions générales ont changé. Ferme l’application, rouvre-la, relis-les et réessaie.',
```

Le texte dit « ferme et rouvre » plutôt que « recharge la page » : l’application
du collecteur est une PWA, et personne n’y voit de bouton de rechargement.

- [ ] **Étape 6 : l’écriture de l’acceptation**

Toujours dans `supabase/functions/abonnement-payer/index.ts`, juste après le bloc
`if (erreurPose) { ... }` qui suit l’insertion dans `paiements_abonnement` :

```ts
  // L'acceptation, avec le collecteur connu d'emblée et sans demande : cette
  // voie n'en a pas. C'est le rattrapage des comptes déjà en place — chacun
  // accepte à son prochain renouvellement, au moment où il y a de l'argent en
  // jeu, et personne n'est bloqué en tournée devant un mur de texte.
  //
  // Un échec ne fait pas échouer le paiement : la vente existe chez Chariow et
  // le paiement est enregistré. Il se voit dans les traces.
  const trace = await enregistrerAcceptation(clientService, {
    collecteurId,
    version,
  });
  if (!trace.ok) {
    console.error('[Abonnement] acceptation non enregistrée pour', collecteurId, ':', trace.message);
  }
```

- [ ] **Étape 7 : les voir vertes**

Lance : `npm test -w @kolek/collecteur -- --run abonnement`
Attendu : PASSE de nouveau, la table étant complète.

Lance : `npm run verifier:portillons` et `npm run verifier:lint`
Attendu : les deux passent.

- [ ] **Étape 8 : commettre**

```bash
git add supabase/functions/abonnement-payer/index.ts apps/collecteur/src/abonnement.ts supabase/tests/abonnement-payer.test.ts
git commit -m "feat(abonnement): refuser une version inconnue et tracer l acceptation"
```

Termine le message par :

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Tâche 8 : la case d’acceptation au renouvellement

**Fichiers :**
- Modifier : `apps/collecteur/src/abonnement.ts:72-77` (`SaisiePaiement`)
- Modifier : `apps/collecteur/src/ecrans/Abonnement.tsx`
- Épreuve : `apps/collecteur/src/ecrans/Abonnement.test.tsx`

**Interfaces :**
- Consomme : `VERSION_CONDITIONS`, `URL_CONDITIONS` et `URL_CONFIDENTIALITE` de
  `apps/collecteur/src/version-conditions.ts` (tâche 2) ; le refus serveur de la
  tâche 7.
- Produit : le champ `version: string` dans `SaisiePaiement`.

**Pourquoi un lien et non le texte.** Embarquer les 12 500 caractères des deux
pages fabriquerait une seconde copie du texte légal — ce que le générateur
existe pour empêcher — et l’application est une PWA au cache agressif : elle
pourrait montrer une copie périmée pendant que le serveur refuse la version, ce
qui donne un mur sans issue. L’objection « hors ligne » ne tient pas : cet écran
dit déjà lui-même qu’il est « le seul geste du produit qui exige le réseau ».

- [ ] **Étape 1 : écrire l’épreuve qui échoue**

Crée ou complète `apps/collecteur/src/ecrans/Abonnement.test.tsx` :

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Abonnement } from './Abonnement';
import { demarrerPaiement } from '../abonnement';
import { URL_CONDITIONS, URL_CONFIDENTIALITE, VERSION_CONDITIONS } from '../version-conditions';

vi.mock('../abonnement', () => ({
  demarrerPaiement: vi.fn().mockResolvedValue({ ok: false, message: 'arrêt' }),
}));

describe('Abonnement', () => {
  it('ne laisse pas payer sans avoir accepté les conditions', async () => {
    render(<Abonnement palierCourant="essai" telephoneCollecteur="+2250700000000" onRetour={() => {}} />);

    const payer = screen.getByRole('button', { name: /payer/i });
    // C'est le moment où le contrat se forme pour un collecteur déjà en place :
    // le rattrapage se fait ici, au renouvellement, et non par un écran
    // bloquant au démarrage.
    expect(payer).toBeDisabled();
  });

  it('renvoie vers les deux textes par une adresse absolue', () => {
    render(<Abonnement palierCourant="essai" telephoneCollecteur="+2250700000000" onRetour={() => {}} />);

    // L'application vit sur app.kolek.cash : un chemin relatif comme
    // `/conditions` mènerait ici à une page qui n'existe pas.
    expect(screen.getByRole('link', { name: /conditions générales/i })).toHaveAttribute(
      'href',
      URL_CONDITIONS,
    );
    expect(screen.getByRole('link', { name: /politique de confidentialité/i })).toHaveAttribute(
      'href',
      URL_CONFIDENTIALITE,
    );
  });

  it('envoie la version acceptée avec le paiement', async () => {
    render(<Abonnement palierCourant="essai" telephoneCollecteur="+2250700000000" onRetour={() => {}} />);

    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /payer/i }));

    expect(vi.mocked(demarrerPaiement)).toHaveBeenCalledWith(
      expect.objectContaining({ version: VERSION_CONDITIONS }),
    );
  });
});
```

Si le fichier existe déjà, **lis-le** et ajoute tes trois épreuves à son
`describe`, sans redéfinir ses simulacres. Le bouton de paiement porte un nom
que tu dois lire dans `Abonnement.tsx` plutôt que deviner ; ajuste
`{ name: /payer/i }` à ce qu’il porte vraiment. Le troisième cas suppose un
numéro déjà valide : si `pretAPayer` exige `telephone.valide`, remplis le champ
téléphone comme le font les épreuves voisines de l’application, ou passe par le
même chemin qu’elles.

- [ ] **Étape 2 : les voir rouges**

Lance : `npm test -w @kolek/collecteur -- --run Abonnement`
Attendu : ÉCHEC des trois. Note les messages exacts.

- [ ] **Étape 3 : le champ dans le contrat**

Dans `apps/collecteur/src/abonnement.ts`, ajoute à `SaisiePaiement` :

```ts
  /** L'empreinte du texte accepté avant de payer. Le serveur la compare à la
      sienne et refuse ce qu'il ne connaît pas. */
  version: string;
```

- [ ] **Étape 4 : la case et les deux liens**

Dans `apps/collecteur/src/ecrans/Abonnement.tsx`, ajoute l’import :

```tsx
import { URL_CONDITIONS, URL_CONFIDENTIALITE, VERSION_CONDITIONS } from '../version-conditions';
```

Ajoute l’état, à côté des autres `useState` :

```tsx
  // Jamais pré-cochée : un accord donné par défaut n'en est pas un.
  const [accepte, setAccepte] = useState(false);
```

Ajoute `version: VERSION_CONDITIONS,` à l’objet passé à `demarrerPaiement`.

Durcis la garde :

```tsx
  const pretAPayer = enLigne && telephone.valide && accepte && !enCours;
```

Et pose la case juste avant le bouton de paiement, dans une `Carte` :

```tsx
            <Carte className="p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={accepte}
                  onChange={(evenement) => setAccepte(evenement.target.checked)}
                  className="mt-1 size-5 shrink-0 rounded"
                />
                <span className="font-body text-sm text-ink">
                  J’ai lu et j’accepte les{' '}
                  <a
                    href={URL_CONDITIONS}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    conditions générales
                  </a>{' '}
                  et la{' '}
                  <a
                    href={URL_CONFIDENTIALITE}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    politique de confidentialité
                  </a>
                  .
                </span>
              </label>
            </Carte>
```

`target="_blank"` avec `rel="noreferrer"` : la personne est au milieu d’un
paiement, et la renvoyer hors de l’application lui ferait tout reprendre.

- [ ] **Étape 5 : les voir vertes**

Lance : `npm test -w @kolek/collecteur -- --run Abonnement`
Attendu : PASSE, les trois.

- [ ] **Étape 6 : la chaîne complète du collecteur**

Lance, et rapporte chaque sortie :

```
npm test -w @kolek/collecteur -- --run
npm run build -w @kolek/collecteur
npm run verifier:lint
```

Vérifie par Node : CRLF, `0` LF nu, sur les trois fichiers touchés.

- [ ] **Étape 7 : commettre**

```bash
git add apps/collecteur/src/abonnement.ts apps/collecteur/src/ecrans/Abonnement.tsx apps/collecteur/src/ecrans/Abonnement.test.tsx
git commit -m "feat(collecteur): accepter les conditions avant de renouveler"
```

Termine le message par :

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Vérification finale, avant toute demande de fusion

Lance, et rapporte chaque sortie exacte :

```
npm run verifier:cgu
npm run verifier:tirets
npm run verifier:mentions
npm run verifier:routes
npm run verifier:migrations
npm run verifier:portillons
npm run verifier:lint
npm test
npm run test:scripts
npm run build
```

`npm run test:db` **n’est pas dans cette liste** et ne doit pas y entrer : il est
refusé au poste. Dis-le dans ton rapport, et nomme les fichiers d’épreuves dont
la vérification revient au travail `Base` de la CI :

- `supabase/tests/acceptations-conditions.test.ts` (tâche 3)
- `supabase/tests/chariow-webhook.test.ts`, épreuve ajoutée (tâche 5)
- `supabase/tests/abonnement-payer.test.ts`, épreuves ajoutées (tâche 7)

Puis relis l’ordre de déploiement en tête de ce plan et redis-le à l’exploitant :
**migration, puis fronts, puis Edge Functions.**

## Ce que ce plan ne fait pas

- Aucune acceptation rétroactive forcée : les comptes existants se rattrapent au
  renouvellement (tâche 8), pas par un écran bloquant.
- Aucun écran de ré-acceptation quand les conditions changeront. La table le
  permet ; l’écran n’est pas construit.
- Aucun lien entre un compte d’essai et son acceptation :
  `admin-creer-collecteur` ignore la demande, et l’essai n’a pas d’argent en jeu.
- Aucune acceptation propre au collaborateur : la tâche 1 ferme ce trou par le
  contrat.
- Aucun texte légal embarqué dans l’application du collecteur.
- Rien sur l’autorisation ARTCI, l’effacement à travers le journal d’audit, ni
  les aperçus de partage — trois chantiers ouverts ailleurs.
