# Ce que l'écran dit quand il attend — plan d'exécution

> **Pour l'exécutant :** SOUS-SKILL REQUISE — utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes se cochent (`- [ ]`).

**But :** un collecteur hors ligne ne voit plus sept secondes de squelette qui lui promet des données impossibles, et une fiche non chargée ne se dit plus supprimée.

**Architecture :** un seul endroit décide, `useDonnees` dans `apps/collecteur/src/cache.ts`. Il gagne une option `besoinReseau` : quand elle vaut `true`, qu'aucune valeur n'est gardée et que `navigator.onLine` vaut `false`, l'erreur est posée immédiatement et la requête n'est pas lancée. Huit des quatorze appels la déclarent — les six autres lisent le disque du téléphone et réussissent hors ligne. Les écrans affichent déjà leur squelette sur `!donnees && !erreur` : poser l'erreur rend cette condition fausse, et **aucun rendu n'est modifié**.

**Pile :** React 19, TypeScript, Vitest 4 sous `jsdom`, `@testing-library/react`.

## Contraintes globales

- **Aucune perte de données.** Ce chantier ne touche ni une écriture, ni un calcul d'argent, ni la file hors ligne, ni le synchroniseur.
- **Aucune migration, aucune Edge Function.** `supabase/` n'est pas touché. La livraison ne déploie que le front du collecteur.
- **Rouge d'abord.** Une épreuve qui ne tombe pas avant la correction ne prouve rien. Chaque tâche fait tomber son épreuve avant d'écrire le correctif.
- **Les 654 épreuves du collecteur doivent rester vertes**, ou être relues une par une. Une épreuve qui tombe parce que le défaut est corrigé se met à jour ; une épreuve qui tombe pour une autre raison **arrête le chantier**.
- **On ne coupe que sur `navigator.onLine === false`.** Il ment quand il dit « en ligne » — un wifi de marché sans Internet — jamais quand il dit « hors ligne ». Et jamais quand une valeur gardée existe.
- **On ne modifie pas du code sur un souvenir.** Trois notes de J2b sont trop vagues ; elles sont reproduites avant d'être corrigées, ou renvoyées à la liste.
- Branche `attente-et-messages`. **Aucune fusion, aucun `git push`, aucun geste de production sans accord explicite de l'exploitant, demandé pour ce geste-là.**

---

## Structure des fichiers

| Fichier | Rôle | Sort |
|---|---|---|
| `apps/collecteur/src/cache.ts` | Le cache de navigation et `useDonnees` | **Modifié** — ajout de `horsLigne()` et du court-circuit |
| `apps/collecteur/src/cache.test.ts` | Éprouve les fonctions pures du cache | **Étendu** — `useDonnees` n'a aujourd'hui aucune épreuve directe |
| `apps/collecteur/src/ecrans/FicheClient.tsx` | La fiche d'un client | **Modifié** — un message, ligne 136 |
| `apps/collecteur/src/ecrans/FicheClient.test.tsx` | Épreuves de la fiche | **Étendu** |
| ~~`apps/collecteur/src/ecrans/Retrait.test.tsx`~~ | Épreuves de l'écran de retrait | **Retiré du chantier** — ce fichier remplace `../cache` en bloc (`vi.mock`, ligne 41) : une épreuve écrite là éprouverait le remplaçant, pas le crochet. Le cas est tenu dans `cache.test.ts`. |
| `Docs/plans/2026-09-16-attente-et-messages.md` | Ce plan | **Complété** à la tâche 3 |

Les huit appels réseau gagnent une ligne d'option chacun — `Alertes`, `Avis`, `Bilan`, `Equipe`, `EquipeClients`, `HistoriqueClient`, `Recus`, `Retrait`. Aucun rendu n'est touché, et rien dans `packages/ui`.

---

## Tâche 1 : `useDonnees` ne lance plus une requête vouée à l'échec

**Fichiers :**
- Modifier : `apps/collecteur/src/cache.ts` (ajout d'une fonction privée, et cinq lignes dans `useDonnees`)
- Éprouver : `apps/collecteur/src/cache.test.ts`

**Interfaces :**
- Consomme : rien des autres tâches.
- Produit : `useDonnees(cle, chargeur, { revision?, messageErreur, besoinReseau? })` — l'option est nouvelle et vaut `false` par défaut. Le retour est inchangé : `{ donnees, erreur, enCours, rafraichir }`. Seul le **moment** où `erreur` est posée change, et seulement pour les appels qui déclarent `besoinReseau: true`.

- [ ] **Étape 1 : écrire les trois épreuves qui tombent**

`cache.test.ts` n'éprouve aujourd'hui que les fonctions pures — `useDonnees` n'a **aucune épreuve directe**. Ces trois-là sont donc aussi le premier filet sous le hook.

Ajouter en tête du fichier, aux imports existants :

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PEREMPTION_MS, ecrireCache, lireCache, tailleCache, useDonnees, viderCache } from './cache';
```

Puis, à la fin du fichier :

```ts
/**
 * `useDonnees` hors ligne.
 *
 * Le défaut corrigé : sans valeur gardée, le hook lançait la requête même en
 * sachant le réseau absent. `postgrest-js` la retente trois fois — sept
 * secondes — et pendant ce temps `donnees` et `erreur` valent tous deux `null`,
 * l'état exact dans lequel les écrans affichent leur squelette. L'écran ne
 * restait pas muet : il **promettait** des données impossibles.
 *
 * L'épreuve qui compte est `expect(chargeur).not.toHaveBeenCalled()`. On
 * n'affirme pas « c'est plus rapide » — un délai ne s'éprouve pas — on affirme
 * que la requête n'a pas lieu.
 */
describe('useDonnees hors ligne', () => {
  const MESSAGE = 'Cet écran demande le réseau.';

  const couper = () =>
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });

  afterEach(() => {
    delete (window.navigator as unknown as { onLine?: boolean }).onLine;
  });

  it('sans rien de gardé, pose l’erreur sans lancer la requête', async () => {
    couper();
    const chargeur = vi.fn().mockResolvedValue({ encaisse: 12_000 });

    const { result } = renderHook(() => useDonnees('bilan', chargeur, { messageErreur: MESSAGE }));

    await waitFor(() => expect(result.current.erreur).toBe(MESSAGE));
    expect(chargeur).not.toHaveBeenCalled();
    expect(result.current.donnees).toBeNull();
    expect(result.current.enCours).toBe(false);
  });

  it('avec une valeur gardée, l’affiche et ne pose aucune erreur', async () => {
    ecrireCache('bilan', { encaisse: 12_000 });
    couper();
    const chargeur = vi.fn().mockResolvedValue({ encaisse: 99_000 });

    const { result } = renderHook(() => useDonnees('bilan', chargeur, { messageErreur: MESSAGE }));

    await waitFor(() => expect(result.current.donnees).toEqual({ encaisse: 12_000 }));
    expect(result.current.erreur).toBeNull();
  });

  it('en ligne, lance la requête comme avant', async () => {
    const chargeur = vi.fn().mockResolvedValue({ encaisse: 12_000 });

    const { result } = renderHook(() => useDonnees('bilan', chargeur, { messageErreur: MESSAGE }));

    await waitFor(() => expect(result.current.donnees).toEqual({ encaisse: 12_000 }));
    expect(chargeur).toHaveBeenCalledTimes(1);
    expect(result.current.erreur).toBeNull();
  });
});
```

- [ ] **Étape 2 : les faire tomber**

```bash
npm run test -w @kolek/collecteur -- src/cache.test.ts
```

Attendu : la première épreuve **échoue** — `chargeur` a été appelé, et `erreur` est restée `null` le temps de l'attente. Les deux autres passent déjà : elles sont là pour tenir le comportement existant pendant qu'on touche au hook.

**Si la première passe du premier coup, s'arrêter.** Cela voudrait dire que le court-circuit existe déjà, et le chantier n'a pas lieu d'être.

- [ ] **Étape 3 : le correctif**

Dans `apps/collecteur/src/cache.ts`, juste avant `export function useDonnees` (vers la ligne 133, sous la docstring du hook) :

```ts
/**
 * Le réseau est-il **certainement** absent ?
 *
 * `navigator.onLine` ne prouve jamais qu'Internet répond — c'est ce que dit
 * `packages/ui/src/Bandeaux.tsx` (lignes 70-75), et c'est vrai. Mais son erreur
 * n'est que dans un sens : il ment quand il dit « en ligne », jamais quand il
 * dit « hors ligne », où l'interface réseau est baissée. Cette fonction ne lit
 * donc que le `false`, la seule information fiable qu'il donne.
 *
 * `typeof navigator` est gardé pour le rendu hors navigateur.
 */
function horsLigne(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
```

Puis, dans l'effet de `useDonnees`, remplacer la branche `else` (ligne 169-171) :

```ts
    } else {
      setDonnees(null);
    }
```

par :

```ts
    } else {
      setDonnees(null);
      // Rien à montrer, et le réseau certainement absent : la requête échouera
      // au bout de trois relances de postgrest-js — sept secondes pendant
      // lesquelles `donnees` et `erreur` valent tous deux `null`, l'état où les
      // écrans affichent leur squelette. L'écran promettrait des données qu'il
      // sait impossibles. Poser l'erreur tout de suite est la seule chose vraie
      // qu'on puisse dire, et les écrans s'y accordent sans être modifiés.
      //
      // Une valeur gardée, même périmée, ne passe pas ici : elle est déjà à
      // l'écran, rien ne ment, et la revalidation peut tenter sa chance.
      if (horsLigne()) {
        setErreur(messageErreur);
        return;
      }
    }
```

- [ ] **Étape 4 : les faire passer**

```bash
npm run test -w @kolek/collecteur -- src/cache.test.ts
```

Attendu : les trois passent.

- [ ] **Étape 5 : toutes les épreuves du collecteur**

```bash
npm run test -w @kolek/collecteur
```

Attendu : 654 vertes, plus les trois nouvelles. **Chaque épreuve rouge est relue individuellement** avant toute correction : celle qui tombe parce qu'elle attendait l'ancien squelette se met à jour et le commit le dit ; celle qui tombe pour une autre raison arrête le chantier et remonte à l'exploitant.

- [ ] **Étape 6 : contrôle de type et linteur**

```bash
npm run verifier:lint
npm run typecheck --workspaces --if-present
```

Attendu : exit 0 des deux.

- [ ] **Étape 7 : commit**

```bash
git add apps/collecteur/src/cache.ts apps/collecteur/src/cache.test.ts
git commit -F - <<'EOF'
fix(cache): ne plus promettre des donnees que le telephone sait impossibles

Hors ligne et sans valeur gardee, useDonnees lancait la requete quand meme.
postgrest-js la retente trois fois : sept secondes pendant lesquelles donnees
et erreur valent tous deux null — l'etat exact ou les ecrans affichent
leur squelette. L'ecran ne restait pas muet, il promettait.

Il pose desormais l'erreur tout de suite, et ne lance rien. On ne coupe que
sur navigator.onLine a false, qui ment quand il dit « en ligne » mais jamais
quand il dit « hors ligne », et jamais quand une valeur gardee existe.

Aucun ecran n'est modifie : ils affichent leur squelette sur !donnees &&
!erreur, condition que l'erreur rend fausse immediatement.

useDonnees n'avait aucune epreuve directe. Il en a trois.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Tâche 2 : une fiche non chargée ne se dit plus supprimée

**Fichiers :**
- Modifier : `apps/collecteur/src/ecrans/FicheClient.tsx` (le bloc `if (lue === null)`, vers la ligne 134)
- Éprouver : `apps/collecteur/src/ecrans/FicheClient.test.tsx`

**Interfaces :**
- Consomme : rien de la tâche 1. Les deux tâches sont indépendantes.
- Produit : une constante exportable n'est pas nécessaire — les deux messages restent locaux au fichier.

- [ ] **Étape 1 : écrire l'épreuve qui tombe**

`FicheClient.test.tsx` sait déjà couper le réseau (ligne 1163). Ajouter, dans le fichier, une épreuve sur le même modèle :

```ts
  it('hors ligne, une fiche absente dit qu’elle n’est pas chargée, pas qu’elle est supprimée', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    chargerFicheClient.mockResolvedValue(null);

    rendre();

    expect(
      await screen.findByText(
        'Fiche indisponible sur ce téléphone. Connecte-toi une fois au réseau pour la charger.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/peut-être été supprimée/)).toBeNull();
  });

  it('en ligne, une fiche absente dit qu’elle a peut-être été supprimée', async () => {
    chargerFicheClient.mockResolvedValue(null);

    rendre();

    expect(await screen.findByText('Fiche introuvable. Elle a peut-être été supprimée.')).toBeTruthy();
  });
```

**Avant d'écrire ces lignes**, relire le haut de `FicheClient.test.tsx` : le nom exact du mock de `chargerFicheClient` et celui de l'aide `rendre()` y sont définis. Les reprendre tels quels plutôt que ceux écrits ici, qui sont le motif du fichier et non sa lettre.

- [ ] **Étape 2 : la faire tomber**

```bash
npm run test -w @kolek/collecteur -- src/ecrans/FicheClient.test.tsx
```

Attendu : la première **échoue** — l'écran affiche « Fiche introuvable. Elle a peut-être été supprimée. » dans les deux cas. La seconde passe déjà.

- [ ] **Étape 3 : le correctif**

Dans `apps/collecteur/src/ecrans/FicheClient.tsx`, le bloc actuel :

```ts
      const lue = await chargerFicheClient(clientId);
      if (lue === null) {
        setErreur('Fiche introuvable. Elle a peut-être été supprimée.');
        return;
      }
```

devient :

```ts
      const lue = await chargerFicheClient(clientId);
      if (lue === null) {
        // `null` a deux causes qu'on ne peut pas distinguer ici : le client a
        // été supprimé, ou cette tournée n'a jamais été chargée sur ce
        // téléphone. Hors ligne, la seconde est la seule plausible — dire
        // « supprimée » à un collecteur qui a le client sous les yeux lui
        // apprend que l'écran se trompe. Le message juste existait déjà six
        // lignes plus bas, dans le `catch` ; il sert ici aussi.
        setErreur(
          navigator.onLine === false
            ? 'Fiche indisponible sur ce téléphone. Connecte-toi une fois au réseau pour la charger.'
            : 'Fiche introuvable. Elle a peut-être été supprimée.',
        );
        return;
      }
```

- [ ] **Étape 4 : les faire passer**

```bash
npm run test -w @kolek/collecteur -- src/ecrans/FicheClient.test.tsx
```

Attendu : les deux passent, et le reste du fichier reste vert.

- [ ] **Étape 5 : toutes les épreuves du collecteur**

```bash
npm run test -w @kolek/collecteur
npm run verifier:lint
```

Attendu : vert, exit 0.

- [ ] **Étape 6 : commit**

```bash
git add apps/collecteur/src/ecrans/FicheClient.tsx apps/collecteur/src/ecrans/FicheClient.test.tsx
git commit -F - <<'EOF'
fix(fiche): une fiche pas encore chargee ne se dit plus supprimee

chargerFicheClient rend null pour deux raisons : le client a ete supprime, ou
cette tournee n'a jamais ete chargee sur ce telephone. L'ecran n'en disait
qu'une — la mauvaise pour un collecteur hors ligne, qui lisait qu'un client
present sous ses yeux avait disparu.

Le message juste existait deja six lignes plus bas, dans le catch. Il sert
maintenant aux deux cas hors ligne.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Tâche 3 : reproduire les trois notes floues, puis compléter ce plan

**Cette tâche ne produit pas de code.** Son livrable est un compte rendu écrit, et la suite du plan.

Trois notes de J2b tiennent en une ligne chacune, et le code les contredit en partie. Les corriger sans les avoir vues serait modifier du code sur un souvenir.

**Fichiers :**
- Compléter : `Docs/plans/2026-09-16-attente-et-messages.md` (ce fichier, section « Tâche 4 »)
- Compléter : `Docs/plans/2026-09-13-j2b-hors-ligne.md` (section « Reportés au chantier suivant ») pour ce qui n'est pas reproduit

- [ ] **Étape 1 : monter la pile locale et l'application**

```bash
npm run db:start
npm run db:reset
```

Puis le serveur de développement du collecteur, **avec la base locale en variables d'environnement en ligne** — jamais le `.env`, qui vise la production :

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<clé anon locale> npm run dev -w @kolek/collecteur
```

La clé anon locale est celle qu'affiche `npx supabase status`. **Ne jamais copier `.env`, ne jamais lire ses valeurs.**

- [ ] **Étape 2 : reproduire « l'avis rouge de déconnexion reste affiché »**

Le point de départ est `FicheClient.tsx:753` : `poser({ ...socle, echec: SESSION_PERDUE })`, atteint quand `contexte.current.collecteurId` est absent.

Chercher : après que l'avis « Session perdue. Reconnecte-toi avant de réessayer. » est apparu, une opération qui réussit l'efface-t-elle ? Noter **oui** ou **non**, et par quel geste exact.

- [ ] **Étape 3 : reproduire « le bandeau *Envoi en cours* ne montre aucun progrès »**

`packages/ui/src/Bandeaux.tsx:31` affiche « Envoi en cours · N restantes ». Poser plusieurs encaissements hors ligne, revenir en ligne, et regarder : **le compte décroît-il pendant l'envoi**, ou reste-t-il figé jusqu'à disparaître d'un coup ?

- [ ] **Étape 4 : reproduire « l'alerte au premier lancement (`Accueil.tsx`) »**

Compte neuf, aucune donnée, premier lancement. Noter quelle alerte s'affiche ou manque, et en quoi c'est un défaut. Si rien d'anormal n'apparaît, le dire.

- [ ] **Étape 5 : trancher, et écrire**

Pour chaque note :

- **Reproduite** → écrire sous « Tâche 4 » de ce plan une sous-tâche complète, au même format que les tâches 1 et 2 : fichiers, épreuve rouge d'abord avec son code, correctif avec son code, commandes, commit.
- **Non reproduite** → la renvoyer dans `Docs/plans/2026-09-13-j2b-hors-ligne.md`, section « Reportés au chantier suivant », avec la mention « pas reproduit le 2026-09-16, à préciser ».

- [ ] **Étape 6 : commit**

```bash
git add Docs/plans/2026-09-16-attente-et-messages.md Docs/plans/2026-09-13-j2b-hors-ligne.md
git commit -m "docs(plans): ce que les trois notes floues de J2b donnaient vraiment" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 4 : le bandeau d'envoi montre enfin ce qui reste

Écrite après la tâche 3, et seulement pour ce qu'elle a reproduit. Des trois notes, **une seule** a donné un défaut : le bandeau. Les deux autres sont reparties dans `Docs/plans/2026-09-13-j2b-hors-ligne.md`.

**Ce qui a été vu, le 2026-09-17**, sur la pile locale et l'application réelle (Chrome sans interface, compte de démonstration, quatre encaissements posés hors ligne puis retour en ligne avec 1 500 ms de latence par requête) :

```
--- hors ligne ---
Mariam : Hors ligne · 1 mise en attente d’envoi
Salif  : Hors ligne · 2 mises en attente d’envoi
Aïcha  : Hors ligne · 3 mises en attente d’envoi
Drissa : Hors ligne · 4 mises en attente d’envoi
--- retour en ligne, latence 1500 ms par requete ---
t+0.1s  : Envoi en cours · 4 restantes
t+11.2s : (aucun bandeau)
```

Onze secondes à « 4 restantes », puis plus rien. Jamais 3, jamais 2, jamais 1. Hors ligne, en revanche, le compte monte à chaque geste — parce que chaque geste passe par `apresGeste()`, qui appelle `signalerChangement()`.

**La cause, au code :** `signalerChangement()` n'est appelé, pendant un envoi, qu'au rappel de fin de passe (`moteur.ts:144`, `if (bilan.traitees > 0 || rafraichie)`), alors que `passe` (`synchroniseur.ts:192`) boucle en `for (;;)` sur toute la file et incrémente `traitees` à **cinq** endroits sans rien annoncer. Les écrans ne relisent qu'à ce signal : `Coquille.tsx:157`, `ecouterChangements(() => setRevision((r) => r + 1))`.

**Pourquoi ça compte pour un collecteur.** Le bandeau est la seule chose qui lui dit si son argent est parti. Figé, il ne distingue pas « ça avance » de « ça a calé ». Sur un réseau de marché, une passe de vingt mises tient plusieurs minutes : il lit « 20 restantes » tout du long, et peut fermer l'application en croyant que rien ne part.

**Fichiers :**
- Modifier : `apps/collecteur/src/hors-ligne/synchroniseur.ts` (`Dependances`, et les cinq `traitees += …`)
- Modifier : `apps/collecteur/src/hors-ligne/moteur.ts` (l'appel à `passe`, ligne 105)
- Éprouver : `apps/collecteur/src/hors-ligne/synchroniseur.test.ts`

**Interfaces :**
- Consomme : rien des tâches 1 et 2. La tâche est indépendante des deux.
- Produit : un champ facultatif `surProgres?: () => void` dans `Dependances`. Facultatif, donc les vingt et quelques appels à `passe` des épreuves existantes l'omettent sans changer.

- [ ] **Étape 1 : écrire les deux épreuves qui tombent**

Dans `apps/collecteur/src/hors-ligne/synchroniseur.test.ts`, à la fin du `describe('l’ordre (§6.6)')` — c'est là que vivent déjà les passes à plusieurs opérations :

```ts
  it('annonce chaque opération sortie de la file, et non la passe entière', async () => {
    const base = await baseAvec(
      operationMise(1, { carteId: 'k1' }),
      operationMise(2, { carteId: 'k1' }),
      operationMise(3, { carteId: 'k1' }),
    );
    const surProgres = vi.fn();
    // Ce que `surProgres` avait déjà annoncé au moment de chaque envoi. C'est
    // la seule chose qui distingue « pendant la passe » de « à la fin ».
    const annoncesAvantChaqueEnvoi: number[] = [];
    const envoyer = vi.fn(async () => {
      annoncesAvantChaqueEnvoi.push(surProgres.mock.calls.length);
      return { issue: 'acceptee' as const };
    });

    const bilan = await passe({
      client: authFactice().client,
      base,
      collecteurId: 'col-1',
      maintenant: () => T,
      envoyer,
      surProgres,
    });

    expect(bilan.traitees).toBe(3);
    expect(surProgres).toHaveBeenCalledTimes(3);
    expect(annoncesAvantChaqueEnvoi).toEqual([0, 1, 2]);
  });

  it('n’annonce rien quand rien ne sort de la file', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }), operationMise(2, { carteId: 'k1' }));
    const surProgres = vi.fn();

    const bilan = await passe({
      client: authFactice().client,
      base,
      collecteurId: 'col-1',
      maintenant: () => T,
      envoyer: envoiScenarise({ issue: 'passager' }),
      surProgres,
    });

    expect(bilan.etat).toBe('hors_ligne');
    expect(surProgres).not.toHaveBeenCalled();
  });
```

La seconde épreuve n'est pas un doublon : elle tient la main du correctif. Un `surProgres()` posé en tête de boucle, ou après le `switch` sans discernement, la ferait tomber — et c'est précisément l'erreur qui rendrait le bandeau bavard sur un réseau coupé.

`annoncesAvantChaqueEnvoi` est le témoin du « pendant » : déplacer l'annonce à la fin de `passe` rendrait `[0, 0, 0]` tout en gardant `toHaveBeenCalledTimes(3)` vert.

- [ ] **Étape 2 : les faire tomber**

```bash
npm test -w @kolek/collecteur -- --run src/hors-ligne/synchroniseur.test.ts
```

Attendu : **deux échecs**. La première sur `expected "spy" to be called 3 times, but got 0 times` — `surProgres` n'existe pas encore, l'objet le porte sans que `passe` le lise. La seconde **passe déjà** (rien n'annonce rien, donc « pas appelé » est vrai) : elle est là pour la suite, pas pour le rouge. Le noter tel quel dans le rapport ; une épreuve qui ne tombe pas ne prouve rien, et celle-ci ne prétend rien prouver aujourd'hui.

- [ ] **Étape 3 : le correctif**

Dans `synchroniseur.ts`, la dépendance :

```ts
export interface Dependances {
  client: SupabaseClient;
  base: BaseLocale;
  collecteurId: string;
  maintenant?: () => number;
  /** Injectables pour les épreuves ; sinon les vrais. */
  envoyer?: typeof envoyer;
  consigner?: typeof consigner;
  /**
   * Appelé à chaque opération sortie de la file, pendant la passe et non à sa
   * fin : c'est ce qui fait décroître « Envoi en cours · N restantes ». Une
   * passe de vingt mises tient plusieurs minutes sur un réseau de marché, et un
   * compte figé ne distingue pas « ça avance » de « ça a calé ».
   */
  surProgres?: () => void;
}
```

Puis, dans `passe`, juste après `let traitees = 0;` :

```ts
  /**
   * Une opération a quitté la file, ou changé d'état : le compte bouge, et les
   * écrans doivent le relire. Un seul endroit pour les deux gestes — sinon un
   * sixième `traitees +=` arriverait un jour sans son annonce.
   */
  function avancer(de = 1): void {
    traitees += de;
    deps.surProgres?.();
  }
```

Et les **cinq** incréments deviennent des appels :

| Ligne, **avant** le correctif | Avant | Après |
| --- | --- | --- |
| 206 | `traitees += 1 + (await retirerEnRefus(deps.base, aConsigner, maintenant()));` | `avancer(1 + (await retirerEnRefus(deps.base, aConsigner, maintenant())));` |
| 256 | `traitees += 1;` (parent refusé) | `avancer();` |
| 271 | `traitees += 1;` (acceptée) | `avancer();` |
| 284 | `traitees += 1;` (refusée) | `avancer();` |
| 307 | `traitees += 1;` (inconnue, au-delà de `TENTATIVES_MAX`) | `avancer();` |

Les numéros ci-dessus sont ceux d’**avant** le correctif. Une fois `avancer()` posée,
les cinq appels vivent aux lignes 222, 272, 287, 300 et 323.

Rien d'autre ne change dans ce fichier : les `return bilan(…)` des échecs passagers, de session et d'attente ne touchent pas `traitees`, donc n'annoncent rien — ce que la seconde épreuve tient.

Dans `moteur.ts`, le seul câblage :

```ts
      passe: () =>
        sousVerrou(
          verrou,
          async () =>
            passe({
              client,
              base: await ouvrirBase(collecteurId),
              collecteurId,
              // Le bandeau décroît pendant la passe. Le rappel de fin (plus bas)
              // reste : il porte aussi le rechargement de tournée.
              surProgres: signalerChangement,
            }),
          // Un autre onglet envoie : on repassera dans trente secondes.
          () => ({ etat: 'attente' as const, reveil: Date.now() + 30_000, traitees: 0 }),
        ),
```

Le rappel de fin de passe (`moteur.ts:144`) **ne change pas**. Il annonce aussi le rechargement de tournée (`rafraichie`), que `surProgres` ne couvre pas ; le retirer priverait les écrans de la relecture après rafraîchissement.

- [ ] **Étape 4 : les faire passer**

```bash
npm test -w @kolek/collecteur -- --run src/hors-ligne/synchroniseur.test.ts src/hors-ligne/moteur.test.ts
```

Attendu : tout vert, et les deux nouvelles avec.

- [ ] **Étape 5 : toutes les épreuves du collecteur**

```bash
npm test -w @kolek/collecteur
```

Attendu : le compte de la tâche 2 (662) plus 2.

- [ ] **Étape 6 : contrôle de type et linteur**

```bash
npx tsc -b apps/collecteur
npm run verifier:lint
```

Attendu : exit 0 des deux. Le contrôle de type compte ici plus qu'ailleurs : `surProgres` est un champ neuf sur une interface qu'une vingtaine d'appels partagent.

- [ ] **Étape 7 : commit**

```bash
git add apps/collecteur/src/hors-ligne/synchroniseur.ts apps/collecteur/src/hors-ligne/moteur.ts apps/collecteur/src/hors-ligne/synchroniseur.test.ts
git commit -m "fix(envoi): le bandeau decroit pendant la passe, au lieu de tomber d'un coup" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Ce que la tâche 3 a écarté, et pourquoi

**L'avis rouge « Session perdue » — pas reproduit, et pas reproductible.** L'état vient d'un seul endroit, `FicheClient.tsx:711`, atteint quand `contexte.current.collecteurId` est absent. Or il ne l'est jamais : `App.tsx:205` monte `Coquille` avec un `collecteurId: string`, `Coquille.tsx:345` le passe à `Clients` et `Clients.tsx:676` à `FicheClient`, et `Coquille.tsx:479` ne rend le contenu que si `moteurDe === collecteurId`. Le `string | null` des props est une prudence de signature, pas un état joignable. La note décrivait donc du code mort.

Ce qui est vrai, et qui reste : les deux **autres** échecs d'encaissement (`ENREGISTREMENT_INCERTAIN`, et le message d'un refus) partagent le même socle `{ operationId: null, envoyee: true }`, donc le même sort — `purger()` sort tôt (`if (!en || en.envoyee || en.operationId === null) return`), et l'effet d'effacement demande `estRattrapee(reelles, attente)`, c'est-à-dire `reelles > attente.base`, qui n'arrivera jamais puisque rien n'a été écrit. Seuls « Réessayer », la disparition de la carte ou le démontage de la fiche les enlèvent. **Ce n'est pas un défaut** : ces deux-là n'ont rien écrit, le collecteur doit décider, et le bandeau porte « Réessayer ». C'était le reproche de la note — « une reconnexion ne l'efface pas » — qui visait le seul cas où il aurait tenu, et ce cas n'existe pas.

**L'alerte du premier lancement — rien d'anormal.** Vu le 2026-09-17, profil neuf, `navigator.storage.persisted()` à `false` : l'accueil affiche « Ce téléphone peut effacer les données de Kolek s'il manque de place… », il ne le réaffiche pas quand on quitte l'accueil et qu'on y revient, et l'écran `Profil` le porte en permanence. C'est mot pour mot la spec J2b §8.7.

Un seul écart, mineur, consigné sans tâche : `stockageDejaSignale` est une variable de module (`Accueil.tsx:33`), donc une **seconde connexion sans rechargement de page** — deux collecteurs qui se relaient sur le même téléphone — ne revoit pas l'avis. Vérifié : première connexion « AVIS », déconnexion, reconnexion dans la même page « PAS D AVIS ». L'avertissement reste accessible sur `Profil`, et la spec dit « une fois par lancement » sans trancher ce que vaut un relais. À reprendre si J2b le remonte, pas à corriger sur une lecture.

### Deux choses vues en montant le regard, sans rapport avec les notes

1. **Le premier rechargement de tournée après connexion n'aboutit pas, en développement.** `StrictMode` monte le moteur deux fois ; le `navigator.locks.request(…, { ifAvailable: true })` de `sousVerrou` (`moteur.ts:92`) refuse le second, et le `demander({ rafraichir: true })` initial rend `impossible`. L'écran dit « Ta tournée n'est pas encore sur ce téléphone » pendant une trentaine de secondes, jusqu'à la reprise à trente secondes. Un `dispatchEvent(new Event('online'))` la fait venir tout de suite. **Artefact du mode développement** — React ne redouble pas les effets dans une construction de production — mais il faut le savoir pour tout regard futur : sans cela, on croit l'application cassée.
2. **Le compte de démonstration** vit dans `.superpowers/sdd/fixture-demo.mjs` (`awa@kolek.test`, quatre clients, quatre cartes) et le pilote Chrome dans `.superpowers/sdd/attente/regard.mjs`. Aucun des deux n'est suivi par git.

---

## Tâche 5 : vérifier, puis livrer sur accord

**Aucun geste de cette tâche ne se fait sans un accord explicite de l'exploitant, demandé pour ce geste-là.**

- [ ] **Étape 1 : la vérification complète**

```bash
npm run verifier
```

Attendu : exit 0. Repères de la dernière exécution connue (2026-09-16) : core 108, ui 181, admin 161, collecteur 654, site 42, scripts 198, `test:db` 864, 3 constructions. Le compte du collecteur aura augmenté du nombre d'épreuves ajoutées.

- [ ] **Étape 2 : contrôler le périmètre**

```bash
git diff --stat main...HEAD -- supabase
git diff --name-only main...HEAD
```

Attendu : la première commande ne rend **rien** — aucune migration, aucune Edge Function. La seconde ne liste que des fichiers de `apps/collecteur/src` et de `Docs/`.

- [ ] **Étape 3 : regarder l'écran** *(accord)*

Serveur de développement sur la base **locale** (voir tâche 3, étape 1), jamais sur le `.env` de production. Contrôler : hors ligne, l'écran Retrait montre l'erreur **sans passer par le squelette** ; une fiche non chargée dit « pas encore sur ce téléphone ».

- [ ] **Étape 4 : fusionner sur `main`, en local** *(accord)*

Le classificateur refuse `git merge` sur `main` dans les deux outils — constaté cinq fois le 2026-09-16. **Rendre la commande à l'exploitant** après deux essais, avec l'état d'avance de la branche.

```bash
git checkout main
git merge --no-ff attente-et-messages
npm run verifier
```

- [ ] **Étape 5 : pousser** *(accord)*

```powershell
git push origin main
```

Netlify déploie. **Aucune migration ne part** : `supabase db push` n'a pas lieu dans ce chantier. Le travail « Déploiement — Edge Functions » du CI doit journaliser « Aucune Edge Function touchée ».

- [ ] **Étape 6 : contrôler ce qui est servi**

```bash
npm run build -w @kolek/collecteur && ls apps/collecteur/dist/assets | grep -E '^index-.*\.js$'
curl -s https://app.kolek.cash/ | grep -oE '/assets/index-[^"]*\.js'
```

Attendu : le même nom des deux côtés. Netlify peut mettre du temps, ou refuser faute de crédits — c'est arrivé le 2026-09-16, sept heures d'écart. Un ancien front sur une base inchangée est sans danger ici : ce chantier ne touche pas le schéma.

- [ ] **Étape 7 : consigner**

Au registre du chantier : les commits, les épreuves ajoutées, ce que la tâche 3 a reproduit et ce qu'elle a renvoyé à la liste J2b.

---

## Écarts relevés en écrivant ce plan

1. **`useDonnees` n'avait aucune épreuve directe.** `cache.test.ts` n'éprouvait que les fonctions pures — `ecrireCache`, `lireCache`, `viderCache`. Le hook, qui porte la lecture de quatorze appels, n'était couvert qu'indirectement. Les épreuves de la tâche 1 sont donc aussi son premier filet.

2. **La conception de la tâche 1 était fausse, et la relecture l'a arrêtée.** Ce plan affirmait qu'aucun écran n'aurait à changer, et s'en félicitait. C'était le signe d'un défaut : six des quatorze appels lisent le disque du téléphone et réussissent hors ligne — les couper cassait le hors-ligne de J2b, jusqu'à promettre à un collaborateur la commission de la première mise. Le crochet ne pouvait pas le deviner ; huit appels le déclarent désormais par `besoinReseau: true`. Voir la spec, section 1, corrigée le 2026-09-16.

3. **La tâche 4 est délibérément vide.** Un plan qui décrirait la correction de trois défauts non reproduits ne serait pas un plan mais une supposition. Elle s'écrit après la tâche 3.
