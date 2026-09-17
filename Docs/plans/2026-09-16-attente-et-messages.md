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

## Tâche 4 : les correctifs constatés à la tâche 3

**À écrire à la fin de la tâche 3**, et pas avant : son contenu dépend de ce qui aura été reproduit. Écrire ici des étapes maintenant reviendrait à deviner le défaut, ce que ce chantier se refuse explicitement à faire.

Si les trois notes se révèlent non reproductibles, cette tâche disparaît et le chantier s'arrête à la tâche 5.

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
