# J2b — le hors-ligne du collecteur · plan d'implémentation

> **Pour un exécutant (humain ou agent) :** SOUS-SKILL REQUIS — `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`, tâche par tâche. Les étapes sont cochables (`- [ ]`) et se suivent dans l'ordre. Chaque tâche finit par un commit et laisse le dépôt vert.

**But :** qu'un collecteur sans aucun réseau pendant toute une journée encaisse, inscrive, ouvre des cartes et déclare sa caisse, et que chaque opération arrive au serveur une fois et une seule — ou soit consignée intacte avec son motif.

**Architecture :** une base IndexedDB par collecteur garde trois choses : l'**instantané** du serveur, la **file** des opérations, et la copie des **refus**. Ce que l'écran montre est toujours l'instantané sur lequel on **réapplique** la file, calculé à la lecture. Un geste est donc une seule écriture sur le disque. Un synchroniseur vide la file dans l'ordre, classe chaque réponse par une fonction pure, relit avant de conclure, et consigne les refus dans `synchro_rejets`. Aucune table, colonne, droit ni Edge Function ne change.

**Outillage :** React 19, Vite 8, Vitest 4 (jsdom), TypeScript, oxlint, `idb` 7, `fake-indexeddb` 6, `@supabase/supabase-js` 2.112, Postgres local par `supabase start`.

**Conception :** `Docs/specs/2026-09-13-j2b-hors-ligne-design.md` (commit `ba10771`). Les numéros « §x » renvoient à ce document.

## Contraintes pour toutes les tâches

- **Aucune perte de données** (§1.1). Rien n'est montré comme fait avant d'être sur le disque. Une opération ne quitte la file que sur preuve : acceptée, doublon relu et confirmé, ou refus consigné.
- **Aucun fichier sous `supabase/migrations` ni `supabase/functions`** n'est modifié par la branche (§5.5, §9.5). `supabase/tests` peut l'être. Contrôle en fin de chantier : `git diff --stat main...HEAD -- supabase/migrations supabase/functions` rend une sortie vide.
- **La production est intouchable.** `apps/collecteur/.env` et `apps/admin/.env` pointent la production. Jamais de serveur sur 5173 ni 5174. Les essais manuels se font avec des variables en ligne vers `http://127.0.0.1:54321`, jamais en copiant `.env`. Les épreuves de base tournent sur la pile locale seulement.
- **Les épreuves d'abord.** Chaque étape de code est précédée d'une épreuve rouge, et la rougeur est constatée avant d'écrire l'implémentation.
- **Noms fixés par la spec :** base `kolek-collecteur-<id>` ; espaces `file`, `tournee`, `profil`, `refus` ; opération `version: 1`.
- **Nombres fixés par la spec :** sursis 6 s ; essais espacés de 30 s, 1 min, 2 min, 5 min, puis 10 min ; `INCONNU` consigné à la 5ᵉ tentative ; alerte à 75 jours ; fenêtre serveur de 90 jours ; bornes client nom ≤ 120, téléphone ≤ 32, marché ≤ 80, activité ≤ 80 ; `charge_utile` ≤ 8 192 caractères ; `motif` ≤ 200.
- **Dépendances :** `idb` en `^7.1.1` — la version déjà installée par la PWA, rien à télécharger ; `fake-indexeddb` en `^6.2.5`, en développement seulement, dans `apps/collecteur` et à la racine (pour `supabase/tests`).
- **Les phrases :** tutoiement, apostrophe typographique `’`, aucune phrase qui promet ce que le code ne fait pas.
- **Fins de ligne.** Mesuré par Node le 2026-09-13 sur les fichiers de ce chantier : tous en CRLF sauf `package.json` (racine), `apps/collecteur/src/Connexion.test.tsx`, `apps/collecteur/src/encaissement-differe.ts`, `apps/collecteur/src/encaissement-differe.test.ts`, `apps/collecteur/src/main.tsx`, `apps/collecteur/src/ecrans/Accueil.test.tsx`, `apps/collecteur/src/ecrans/Clients.test.tsx`, `apps/collecteur/src/ecrans/Encaisser.tsx`, `apps/collecteur/src/ecrans/Encaisser.test.tsx` et `apps/collecteur/src/ecrans/HistoriqueClient.tsx`, qui sont en LF. **Vérifier par Node avant chaque édition** (`crlf.mjs --mesurer`, ci-dessous) : `cat` et `grep` masquent les `\r` sous Git Bash. Une édition faite par l'outil d'édition dans un fichier CRLF peut y poser des LF : `crlf.mjs` remet le fichier d'aplomb, et chaque tâche dit quand l'appeler. **Tout fichier créé par ce chantier est en CRLF.**
- **Espaces insécables.** `FicheClient.test.tsx` en porte 31, `lectures-ecrans.test.ts`, `Encaisser.test.tsx` et `Retrait.test.tsx` une chacun (U+00A0, sorties de `formatMontant`). Ne jamais réécrire ces fichiers d'après ce qu'affiche l'outil de lecture : inventorier avant et après (`crlf.mjs --mesurer`). Ce plan n'en contient aucune : un montant attendu dans une épreuve se construit par `formatMontant`, ou s'écrit avec une espace ordinaire quand `getByText` compare (il ramène toute suite d'espaces à une seule).
- **Commandes.** Sous PowerShell, `npm` et `npx` s'appellent `npm.cmd` et `npx.cmd`. Épreuves d'un fichier : `npm run test -w @kolek/collecteur -- <chemin relatif à apps/collecteur>`. Épreuves de base : `npm run test:db -- <chemin>`. Typage de l'application : `npx tsc -b apps/collecteur`. Chaîne complète : `npm run verifier`.
- **Git.** Branche `hors-ligne-j2b`, déjà créée. Aucun `push`, aucune fusion sur `main` sans accord explicite de l'exploitant, chaque fois.

## Les deux outils de l'exécutant

Ils vivent **hors du dépôt**, dans le répertoire temporaire de l'exécutant, noté `$TMP`. Les tâches écrivent `node crlf.mjs …` et `node $TMP/remplacer-blocs.mjs …` : lancer les deux depuis la racine du dépôt, avec le chemin complet du script. Les créer avant la tâche 1.

`$TMP/crlf.mjs` — mesurer, ou remettre en CRLF :

```js
// Fins de ligne et insécables, mesurées par Node : sous Git Bash, cat et grep masquent les \r.
//   node crlf.mjs --mesurer <fichiers…>  affiche « CRLF | LF | MELE nbsp=<n> <fichier> »
//   node crlf.mjs <fichiers…>            remet chaque fichier en CRLF pur ; n'écrit que s'il change
// Refuse un fichier suivi par git et entièrement en LF : il l'est exprès (voir les contraintes).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const mesurer = args[0] === '--mesurer';
let refus = 0;
for (const fichier of mesurer ? args.slice(1) : args) {
  const texte = readFileSync(fichier, 'utf8');
  const crlf = (texte.match(/\r\n/g) ?? []).length;
  const lf = (texte.match(/(?<!\r)\n/g) ?? []).length;
  const convention = crlf > 0 && lf > 0 ? 'MELE' : crlf > 0 ? 'CRLF' : 'LF';
  const nbsp = texte.split('\u00a0').length - 1;
  if (mesurer) {
    console.log(`${convention} nbsp=${nbsp} ${fichier}`);
    continue;
  }
  const suivi = execFileSync('git', ['ls-files', '--', fichier], { encoding: 'utf8' }).trim() !== '';
  if (convention === 'LF' && suivi) {
    console.log(`REFUS ${fichier} : suivi par git et en LF pur, il ne se convertit pas.`);
    refus += 1;
    continue;
  }
  const pur = texte.replace(/\r?\n/g, '\r\n');
  if (pur !== texte) writeFileSync(fichier, pur);
  console.log(`CRLF nbsp=${nbsp} ${fichier}${pur !== texte ? ' (réécrit)' : ''}`);
}
process.exit(refus > 0 ? 1 : 0);
```

`$TMP/remplacer-blocs.mjs` — remplacer des blocs de lignes entre des ancres exactes, sans jamais retaper les lignes gardées (utile là où un fichier porte des insécables) :

```js
// node remplacer-blocs.mjs <travail.json>
// travail.json : { "fichier": "<chemin relatif à la racine>",
//                  "insecables": { "avant": <n>, "apres": <n> },
//                  "remplacements": [ { "debut": "<ligne exacte>", "avantDebut": <n>?,
//                                       "fin": "<ligne exacte>", "avantFin": <n>?,
//                                       "contenu": "<chemin du fichier qui porte le nouveau bloc>" } ] }
// Chaque ancre est une ligne entière, présente une seule fois. Le bloc remplacé va de la ligne
// index(debut) - avantDebut incluse à la ligne index(fin) - avantFin exclue. La convention CRLF/LF
// du fichier est gardée. Au moindre écart, le script lève et n'écrit rien.
import { readFileSync, writeFileSync } from 'node:fs';

const travail = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const brut = readFileSync(travail.fichier, 'utf8');
const crlf = brut.includes('\r\n');
if (crlf && /(?<!\r)\n/.test(brut)) {
  throw new Error(`${travail.fichier} mêle CRLF et LF : le remettre d'aplomb avant.`);
}
const insecables = (t) => t.split('\u00a0').length - 1;
if (insecables(brut) !== travail.insecables.avant) {
  throw new Error(`insécables avant : ${insecables(brut)}, attendu ${travail.insecables.avant}`);
}

const lignes = brut.replace(/\r\n/g, '\n').split('\n');
const trouver = (texte) => {
  const rangs = lignes.flatMap((l, i) => (l === texte ? [i] : []));
  if (rangs.length !== 1) throw new Error(`ancre trouvée ${rangs.length} fois : ${texte}`);
  return rangs[0];
};
const blocs = travail.remplacements
  .map((r) => {
    const debut = trouver(r.debut) - (r.avantDebut ?? 0);
    const fin = trouver(r.fin) - (r.avantFin ?? 0);
    if (debut < 0 || fin < debut) throw new Error(`bloc incohérent : ${r.debut} → ${r.fin}`);
    const contenu = readFileSync(r.contenu, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
    return { debut, fin, contenu };
  })
  .sort((a, b) => a.debut - b.debut);
for (let i = 1; i < blocs.length; i++) {
  if (blocs[i].debut < blocs[i - 1].fin) throw new Error('deux blocs se chevauchent');
}
// Du bas vers le haut : un remplacement ne décale pas les rangs des blocs au-dessus.
for (const b of [...blocs].reverse()) lignes.splice(b.debut, b.fin - b.debut, ...b.contenu.split('\n'));

const sortie = lignes.join('\n');
if (insecables(sortie) !== travail.insecables.apres) {
  throw new Error(`insécables après : ${insecables(sortie)}, attendu ${travail.insecables.apres}`);
}
writeFileSync(travail.fichier, crlf ? sortie.replace(/\n/g, '\r\n') : sortie);
console.log(
  `${travail.fichier} : ${blocs.length} bloc(s), insécables ${travail.insecables.avant} → ${travail.insecables.apres}, ${crlf ? 'CRLF' : 'LF'}`,
);
```

---

## Précisions apportées par ce plan à la spec

Trouvées en lisant le code avant d'écrire les tâches. Aucune ne touche au serveur ; chacune renforce une garantie de la spec ou comble un trou qu'elle n'avait pas vu. **Elles sont soumises à l'exploitant avec le plan.**

1. **Sans réseau, l'application renvoie à l'écran de connexion au bout d'une heure.** Le jeton d'accès dure 3 600 s. Quand il a expiré et que le renouvellement échoue faute de réseau, `supabase.auth.getSession()` rend `session: null` (constaté dans `@supabase/auth-js` 2.112.3, `GoTrueClient.__loadSession`), alors que la session reste gardée sur le disque. Le critère de réussite §1.3, étape 1, échouait donc à coup sûr. La tâche 11 reprend la session gardée quand l'échec est un échec réseau, et seulement dans ce cas.
2. **`App.tsx` prenait une erreur de lecture pour un compte orphelin.** Hors ligne, la lecture de `collecteurs` échoue, `data` vaut `null`, et l'écran affichait « Compte non rattaché ». Corrigé en tâche 11.
3. **`Coquille` lisait l'identité par `getUser()`**, qui fait un aller-retour réseau. Hors ligne, `collecteurId` restait nul et aucun geste n'était possible. L'identité vient désormais de la session, ou de la session gardée (tâche 11).
4. **La tournée affichée est calculée, pas recopiée.** Le disque garde l'instantané du serveur, et l'écran lit « instantané + file réappliquée ». La garantie §4.1 devient structurelle : un geste est **une** écriture (l'ajout à la file), il n'y a rien à tenir d'accord. À l'acceptation, le retrait de la file et l'application à l'instantané se font dans une même transaction. `appliquer` est idempotent par identifiant : un instantané plus récent qui contient déjà l'opération ne la compte pas deux fois.
5. **Un refus connu ne bloque pas la file.** §6.6 veut qu'on ne passe à la suivante qu'une fois la courante « acceptée ou consignée ». Une consignation qui échouerait durablement figerait alors toutes les mises suivantes, sans limite. Le plan garde l'ordre strict entre opérations **en attente**, et réessaie les consignations à part, sans fin et sans rien retirer. Une opération dont le parent est refusé est marquée `PARENT_REFUSE` sans jamais partir, comme le veut §6.6.
6. **Relire avant de consigner.** Avant de consigner un refus, le synchroniseur relit la ligne par identifiant. Si elle est déjà là, avec les mêmes valeurs, l'opération est acceptée. Cas couvert : l'insertion d'un client arrive, la réponse se perd, l'abonnement est suspendu, et le rejeu reçoit `42501`. Sans relecture, un client bien présent au serveur serait consigné comme refusé.
7. **Caisse hors fenêtre.** `caisses_calculer_attendu` n'applique la fenêtre de 90 jours qu'à l'**insertion**. Une déclaration en file sur une journée ancienne dont la ligne existe déjà passe donc par la mise à jour avant d'être déclarée refusée (§6.4, complété).
8. **`PHRASES` quitte `ecritures.ts` pour `phrases.ts`.** La file doit lire ces phrases sans charger le client réseau (`ecritures.ts` importe `./supabase`, qui lève sans configuration). La table reste unique ; `ecritures.ts` la réexporte. Elle gagne une seconde table, au passé, pour dire les refus (« La carte avait été clôturée »).
9. **`declarerCaisse` perd son paramètre `ligneId`.** L'identifiant de la déclaration vient désormais de la tournée (§6.4).
10. **Quand la tournée se recharge** (§5.2 ne le fixait pas) : au démarrage, au retour du réseau, au retour au premier plan, après une clôture, une correction de fiche ou un consentement, et au plus toutes les 5 minutes après un envoi qui a vidé la file. Recharger après chaque geste coûterait sept requêtes par mise en 3G.
11. **Le bandeau « liste incomplète » de l'écran des clients disparaît.** L'écran ne lit plus le serveur. Le recoupement qu'il faisait passe dans `rafraichir` : si le serveur compte plus de clients qu'il n'en a rendu, l'instantané n'est pas écrit.
12. **L'épreuve à l'écran coupe vraiment le réseau.** L'émulation de CDP ne s'applique pas au service worker. La coquille doit venir du cache : on arrête le serveur de prévisualisation et la passerelle `supabase_kong_Kolek`, puis on les relance (tâche 19).
13. **`EcranConnexion` (paquet `ui`) gagne une propriété `avis`**, pour la phrase « 3 opérations attendent sur ce téléphone » (§8.6).

---

## Les fichiers, et ce dont chacun répond

| Fichier | Responsabilité |
|---|---|
| `apps/collecteur/src/hors-ligne/modele.ts` | Les formes : opération, charges, tournée, profil, refus ; les délais et les seuils |
| `apps/collecteur/src/hors-ligne/appliquer.ts` | Appliquer une opération à une tournée, réappliquer une file — pur, idempotent |
| `apps/collecteur/src/hors-ligne/classer.ts` | Classer une réponse du serveur en sept cas — pur, table exhaustive |
| `apps/collecteur/src/hors-ligne/stockage-local.ts` | Ouvrir la base du collecteur, lire, compter, effacer, demander la persistance |
| `apps/collecteur/src/hors-ligne/file.ts` | Ajouter, annuler, avancer, marquer, retirer — chaque geste en une transaction |
| `apps/collecteur/src/hors-ligne/gestes.ts` | Vérifier un geste contre la tournée et construire son opération (§7) — pur |
| `apps/collecteur/src/hors-ligne/envoyer.ts` | Envoyer une opération, relire, consigner un refus |
| `apps/collecteur/src/hors-ligne/synchroniseur.ts` | Une passe : session, ordre, dépendances, essais, tentatives |
| `apps/collecteur/src/hors-ligne/rafraichir.ts` | Recharger l'instantané, le profil et les refus depuis le serveur |
| `apps/collecteur/src/hors-ligne/planificateur.ts` | Quand passer : une passe à la fois, réveils et délais |
| `apps/collecteur/src/hors-ligne/moteur.ts` | Le moteur du collecteur connecté : démarrage, écouteurs, verrou, notifications |
| `apps/collecteur/src/hors-ligne/vues.ts` | Ce que les écrans lisent, calculé sur la tournée — pur |
| `apps/collecteur/src/hors-ligne/useHorsLigne.ts` | Le crochet React : file, refus, tournée, état du stockage |
| `apps/collecteur/src/phrases.ts` | La table unique des phrases, et celle des refus |
| `apps/collecteur/src/session-gardee.ts` | La clé de session de supabase-js, et la session gardée lue sans réseau |
| `apps/collecteur/src/supabase.ts` | Passe la clé de session explicitement, et l'exporte |
| `apps/collecteur/src/App.tsx` | Démarrage sans réseau ; une erreur n'est plus un compte orphelin |
| `apps/collecteur/src/Coquille.tsx` | Démarre le moteur, relit sur changement, refuse la déconnexion avec une file |
| `apps/collecteur/src/Connexion.tsx` | Dit combien d'opérations attendent sur le téléphone |
| `apps/collecteur/src/ecritures.ts` | Les gestes passent par la file ; `codeDErreur` corrigé (écarts 1 et 2) |
| `apps/collecteur/src/ecritures-ecrans.ts` | La caisse passe par la file ; la clôture met l'instantané à jour |
| `apps/collecteur/src/lectures.ts` | Accueil et liste des clients lus sur la tournée |
| `apps/collecteur/src/lectures-ecrans.ts` | Fiche, rapprochement et profil lus sur la tournée |
| `apps/collecteur/src/encaissement-differe.ts` | `EnAttente` porte l'identifiant de l'opération |
| `apps/collecteur/src/postgrest-factice.ts` | Gagne `in`, pour éprouver `rafraichir` au-delà de mille lignes |
| `apps/collecteur/src/cache.ts` | En-tête mis à jour : la tournée est sur le disque, ailleurs |
| `apps/collecteur/src/ecrans/Accueil.tsx` | Bandeau de la file, refus à voir, attente longue, stockage non garanti |
| `apps/collecteur/src/ecrans/Clients.tsx` | Liste lue sur la tournée, bandeau, « pas encore envoyé » |
| `apps/collecteur/src/ecrans/FicheClient.tsx` | Le sursis entre dans la file à l'appui ; garde-fous des gestes en ligne |
| `apps/collecteur/src/ecrans/Encaisser.tsx` | Bandeau de la file |
| `apps/collecteur/src/ecrans/Rapprochement.tsx` | Déclaration par la file ; attendu provisoire dit comme tel |
| `apps/collecteur/src/ecrans/Retrait.tsx` | Retrait refusé tant que la carte a des opérations en file |
| `apps/collecteur/src/ecrans/Alertes.tsx` | Les refus en tête, lisibles hors ligne |
| `apps/collecteur/src/ecrans/Plus.tsx` | Phrases vraies sur le hors-ligne ; stockage non garanti |
| `apps/collecteur/src/ecrans/{Bilan,Recus,Avis,HistoriqueClient}.tsx` | « Cet écran demande le réseau » |
| `packages/ui/src/Bandeaux.tsx` | `messageFile` et un bandeau qui dit ce que la file contient (écart 3) |
| `packages/ui/src/EcranConnexion.tsx` | Propriété `avis` |
| `supabase/tests/harnais.ts` | `connecterAvec` : un client dont on tient le réseau |
| `supabase/tests/hors-ligne-synchro.test.ts` | Les huit épreuves §9.3, contre les vrais déclencheurs |

**Découpage.** Partie A (tâches 1 à 10) : le moteur, sans aucun changement visible. Partie B (tâches 11 à 18) : le branchement dans l'application. Tâche 19 : la vérification complète et le regard à l'écran. La fin de la partie A est un point d'arrêt sûr : le dépôt est vert et l'application se comporte comme aujourd'hui.

---

# Partie A — le moteur

Rien de ce qui suit ne change ce que voit le collecteur. Chaque tâche ajoute un module et ses épreuves.

## Tâche 1 : les dépendances et le modèle

**Fichiers :**
- Modifier : `apps/collecteur/package.json`, `package.json` (racine), `package-lock.json` (par `npm install`)
- Créer : `apps/collecteur/src/hors-ligne/modele.ts`, `apps/collecteur/src/hors-ligne/modele.test.ts`, `apps/collecteur/src/hors-ligne/fabriques.ts`
- Modifier : `apps/collecteur/src/postgrest-factice.ts`, `apps/collecteur/src/postgrest-factice.test.ts`

**Interfaces :**
- Produit : `VERSION_OPERATION`, `TENTATIVES_MAX`, `MARGE_SURSIS_MS`, `JOURS_ALERTE_ATTENTE`, `DELAIS_MS`, `delaiApres(echecs: number): number`, les types `TypeOperation`, `EtatOperation`, `ChargeMise`, `ChargeClientCarte`, `ChargeCarte`, `ChargeCaisse`, `OperationCommune`, `OperationMise`, `OperationClientCarte`, `OperationCarte`, `OperationCaisse`, `Operation`, `ClientLocal`, `CarteLocale`, `MiseLocale`, `RetraitLocal`, `CaisseLocale`, `Tournee`, `ProfilLocal`, `ChargeUtileRefus`, `RefusLocal`, et `tourneeVide(): Tournee`, `chargeUtileDe(op: Operation): ChargeUtileRefus`.
- Produit (épreuves seulement) : `fabriques.ts` — `COLLECTEUR`, `INSTANT`, `operationMise`, `operationClientCarte`, `operationCarte`, `operationCaisse`, `client`, `carte`, `tournee`.
- Produit : `tableFactice(...).in(colonne, valeurs)`.

- [ ] **Étape 1 : déclarer les dépendances**

```bash
npm install idb@^7.1.1 -w @kolek/collecteur
npm install -D fake-indexeddb@^6.2.5 -w @kolek/collecteur
npm install -D fake-indexeddb@^6.2.5
```

Attendu : `apps/collecteur/package.json` porte `"idb": "^7.1.1"` dans `dependencies` et `"fake-indexeddb": "^6.2.5"` dans `devDependencies` ; la racine porte `"fake-indexeddb": "^6.2.5"` dans `devDependencies`. Contrôler par Node que `apps/collecteur/package.json` est resté en CRLF pur et la racine en LF pur (npm conserve la convention qu'il trouve ; si ce n'est pas le cas, remettre la convention d'origine avant de continuer).

```bash
node -e "const f=require('fs');for(const p of ['apps/collecteur/package.json','package.json']){const s=f.readFileSync(p,'utf8');console.log(p,(s.match(/\r\n/g)||[]).length,s.split('\n').length-1)}"
```

Attendu : pour `apps/collecteur/package.json`, les deux nombres sont égaux ; pour `package.json`, le premier vaut `0`.

- [ ] **Étape 2 : écrire l'épreuve du modèle**

Créer `apps/collecteur/src/hors-ligne/modele.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { operationClientCarte, operationMise } from './fabriques';
import { chargeUtileDe, delaiApres, tourneeVide } from './modele';

describe('les délais entre deux essais (§5.3)', () => {
  it('suivent 30 s, 1 min, 2 min, 5 min, puis 10 min', () => {
    expect([1, 2, 3, 4, 5, 6, 40].map(delaiApres)).toEqual([
      30_000, 60_000, 120_000, 300_000, 600_000, 600_000, 600_000,
    ]);
  });

  it('séparent la première tentative de la cinquième de 8 min 30 s au plus (§6.6)', () => {
    expect(delaiApres(1) + delaiApres(2) + delaiApres(3) + delaiApres(4)).toBe(510_000);
  });

  it('traitent zéro échec comme un premier échec', () => {
    expect(delaiApres(0)).toBe(30_000);
  });
});

describe('la tournée vide', () => {
  it('n’a jamais été lue', () => {
    expect(tourneeVide()).toEqual({
      clients: [],
      cartes: [],
      mises: [],
      retraits: [],
      caisses: [],
      lueLe: null,
    });
  });

  it('est un objet neuf à chaque appel', () => {
    const a = tourneeVide();
    a.clients.push({
      id: 'x',
      nom: 'x',
      telephone: null,
      marche: null,
      activite: null,
      avisActifs: false,
    });
    expect(tourneeVide().clients).toEqual([]);
  });
});

describe('la charge consignée (§6.5)', () => {
  it('garde la charge intacte, et ce qui permet de la rejouer', () => {
    const op = operationMise(4, { carteId: 'k1' }, { dependDe: ['op-2'] });

    expect(chargeUtileDe(op)).toEqual({
      version: 1,
      type: 'mise',
      charge: op.charge,
      faiteLe: op.faiteLe,
      sequence: 4,
      dependDe: ['op-2'],
    });
  });

  it('garde l’avancement d’une inscription : le client a pu arriver sans sa carte', () => {
    const op = operationClientCarte(
      1,
      { clientId: 'c1', carteId: 'k1' },
      { etapes: { client: true, carte: false } },
    );

    expect(chargeUtileDe(op).etapes).toEqual({ client: true, carte: false });
  });

  it('tient loin sous la borne du serveur, pour la plus longue saisie permise', () => {
    // `length(charge_utile::text) <= 8192`. Le texte d'un jsonb ajoute une
    // espace après chaque `:` et chaque `,` : on garde une marge d'un facteur
    // quatre plutôt que de recopier ce format.
    const op = operationClientCarte(1, {
      clientId: '11111111-1111-4111-8111-111111111111',
      carteId: '22222222-2222-4222-8222-222222222222',
      nom: 'é'.repeat(120),
    });
    op.charge.client.telephone = '9'.repeat(32);
    op.charge.client.marche = 'm'.repeat(80);
    op.charge.client.activite = 'a'.repeat(80);

    expect(JSON.stringify(chargeUtileDe(op)).length).toBeLessThan(8192 / 4);
  });
});
```

- [ ] **Étape 3 : constater l'échec**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/modele.test.ts`
Attendu : FAIL, « Failed to resolve import "./fabriques" ».

- [ ] **Étape 4 : écrire le modèle**

Créer `apps/collecteur/src/hors-ligne/modele.ts` :

```ts
/**
 * Les formes du hors-ligne : ce que le téléphone garde, et ce qu'il envoie.
 *
 * Spec : `Docs/specs/2026-09-13-j2b-hors-ligne-design.md`, §5.1 et §6.1.
 *
 * ## Pourquoi une union et non `type` + `charge` séparés
 *
 * La spec décrit `type` et `charge` comme deux champs. Les lier dans une union
 * discriminée rend impossible, à la compilation, une opération `mise` qui
 * porterait la charge d'une caisse — donc un envoi qui écrirait dans la
 * mauvaise table. La forme stockée est exactement celle de la spec.
 *
 * ## Pourquoi `version`
 *
 * Une opération peut dormir des semaines sur un téléphone. La version suivante
 * de l'application doit savoir la relire : on ne change jamais la forme d'une
 * version publiée, on en ajoute une.
 */

export const VERSION_OPERATION = 1 as const;

/** À la cinquième tentative sans réponse reconnue, l'opération est consignée (§6.2). */
export const TENTATIVES_MAX = 5;

/**
 * Délai ajouté à la fin d'un sursis avant l'envoi.
 *
 * « Annuler » retire l'opération tant que l'heure est avant `envoyableApres` ;
 * le synchroniseur ne l'envoie qu'une seconde après. Les deux décisions lisent
 * la même horloge dans deux transactions distinctes : la seconde de marge
 * couvre un léger recul de l'horloge du téléphone entre les deux.
 */
export const MARGE_SURSIS_MS = 1000;

/** Au-delà, l'accueil prévient : le serveur refuse à 90 jours (§4.7). */
export const JOURS_ALERTE_ATTENTE = 75;

/** Les écarts entre deux essais (§5.3). */
export const DELAIS_MS = [30_000, 60_000, 120_000, 300_000, 600_000] as const;

/** L'attente après le n-ième échec consécutif. Au-delà du cinquième : 10 minutes. */
export function delaiApres(echecs: number): number {
  const rang = Math.min(Math.max(echecs, 1), DELAIS_MS.length) - 1;
  return DELAIS_MS[rang]!;
}

export type TypeOperation = 'mise' | 'client_carte' | 'carte' | 'caisse';
export type EtatOperation = 'en_attente' | 'refusee_a_consigner';

/** Les charges portent exactement les colonnes que l'écriture d'aujourd'hui envoie. */
export interface ChargeMise {
  id: string;
  carteId: string;
  montant: number;
  encaisseLe: string;
}

export interface ChargeClientCarte {
  client: {
    id: string;
    nom: string;
    telephone: string | null;
    marche: string | null;
    activite: string | null;
    avisActifs: boolean;
  };
  carte: { id: string; mise: number };
}

export interface ChargeCarte {
  id: string;
  clientId: string;
  mise: number;
}

export interface ChargeCaisse {
  id: string;
  date: string;
  cashDeclare: number;
}

export interface OperationCommune {
  version: typeof VERSION_OPERATION;
  /** Identifiant de l'opération. Devient l'identifiant de la ligne de refus. */
  id: string;
  /** Ordre d'entrée dans la file, strictement croissant. */
  sequence: number;
  collecteurId: string;
  /** Heure du geste, horloge du téléphone. */
  faiteLe: string;
  /** Avant cette heure, l'opération ne part pas et peut être annulée. */
  envoyableApres: string;
  /** Opérations dont celle-ci dépend : la carte d'une mise, le client d'une carte. */
  dependDe: string[];
  etat: EtatOperation;
  tentatives: number;
  prochainEssai: string | null;
  /** Code du refus, une fois connu. */
  motif?: string;
}

export type OperationMise = OperationCommune & { type: 'mise'; charge: ChargeMise };
export type OperationClientCarte = OperationCommune & {
  type: 'client_carte';
  charge: ChargeClientCarte;
  /** Étapes déjà acceptées par le serveur : un rejeu reprend là où il s'était arrêté. */
  etapes: { client: boolean; carte: boolean };
};
export type OperationCarte = OperationCommune & { type: 'carte'; charge: ChargeCarte };
export type OperationCaisse = OperationCommune & { type: 'caisse'; charge: ChargeCaisse };
export type Operation = OperationMise | OperationClientCarte | OperationCarte | OperationCaisse;

export interface ClientLocal {
  id: string;
  nom: string;
  telephone: string | null;
  marche: string | null;
  activite: string | null;
  avisActifs: boolean;
}

export interface CarteLocale {
  id: string;
  clientId: string;
  mise: number;
  statut: 'active' | 'cloturee';
  misesEncaissees: number;
  ouverteLe: string;
  clotureeLe: string | null;
}

export interface MiseLocale {
  id: string;
  carteId: string;
  montant: number;
  encaisseLe: string;
  /** Posé par le serveur ; provisoire tant que la mise n'est pas relue. */
  estCommission: boolean;
}

export interface RetraitLocal {
  id: string;
  carteId: string;
  montantRestitue: number;
  effectueLe: string;
}

export interface CaisseLocale {
  id: string;
  date: string;
  /** `null` tant que le serveur n'a pas calculé cette ligne. */
  cashAttendu: number | null;
  cashDeclare: number;
  ecart: number | null;
}

/**
 * La tournée : ce que le collecteur doit pouvoir consulter sans réseau.
 *
 * Bornée par construction (§5.1) : les cartes, les mises des cartes actives et
 * celles du jour, les retraits et les caisses du jour.
 */
export interface Tournee {
  clients: ClientLocal[];
  cartes: CarteLocale[];
  mises: MiseLocale[];
  retraits: RetraitLocal[];
  caisses: CaisseLocale[];
  /** Heure du dernier rafraîchissement réussi. `null` : jamais chargée sur ce téléphone. */
  lueLe: string | null;
}

export function tourneeVide(): Tournee {
  return { clients: [], cartes: [], mises: [], retraits: [], caisses: [], lueLe: null };
}

export interface ProfilLocal {
  nom: string;
  telephone: string;
  zone: string | null;
  palier: string;
  abonnementStatut: string;
  abonnementEcheance: string | null;
  titulaireId: string | null;
  lueLe: string;
}

/** Ce qui part dans `synchro_rejets.charge_utile` (§6.5). */
export interface ChargeUtileRefus {
  version: typeof VERSION_OPERATION;
  type: TypeOperation;
  charge: Operation['charge'];
  faiteLe: string;
  sequence: number;
  dependDe: string[];
  etapes?: { client: boolean; carte: boolean };
}

/** La copie locale d'un refus consigné. Une vue : la vérité est `synchro_rejets`. */
export interface RefusLocal {
  id: string;
  motif: string;
  chargeUtile: ChargeUtileRefus;
  creeLe: string;
}

export function chargeUtileDe(op: Operation): ChargeUtileRefus {
  const charge: ChargeUtileRefus = {
    version: op.version,
    type: op.type,
    charge: op.charge,
    faiteLe: op.faiteLe,
    sequence: op.sequence,
    dependDe: op.dependDe,
  };
  // L'avancement d'une inscription dit au rattrapage si le client est déjà au
  // serveur sans sa carte. Le perdre obligerait à le déduire en fouillant.
  return op.type === 'client_carte' ? { ...charge, etapes: op.etapes } : charge;
}
```

- [ ] **Étape 5 : écrire les fabriques d'épreuve**

Créer `apps/collecteur/src/hors-ligne/fabriques.ts` :

```ts
/**
 * Des opérations et des tournées de poche, pour les épreuves. Aucun module de
 * l'application ne l'importe — même statut que `postgrest-factice.ts`.
 *
 * Chaque fabrique rend une valeur complète et valide, qu'une épreuve modifie
 * sur le seul point qu'elle mesure.
 */

import {
  VERSION_OPERATION,
  tourneeVide,
  type CaisseLocale,
  type CarteLocale,
  type ChargeMise,
  type ClientLocal,
  type OperationCaisse,
  type OperationCarte,
  type OperationClientCarte,
  type OperationCommune,
  type OperationMise,
  type Tournee,
} from './modele';

export const COLLECTEUR = 'col-1';
export const INSTANT = '2026-09-13T09:00:00.000Z';

function commun(sequence: number): OperationCommune {
  return {
    version: VERSION_OPERATION,
    id: `op-${sequence}`,
    sequence,
    collecteurId: COLLECTEUR,
    faiteLe: INSTANT,
    envoyableApres: INSTANT,
    dependDe: [],
    etat: 'en_attente',
    tentatives: 0,
    prochainEssai: null,
  };
}

export function operationMise(
  sequence: number,
  charge: Partial<ChargeMise> & { carteId: string },
  reste: Partial<OperationCommune> = {},
): OperationMise {
  return {
    ...commun(sequence),
    ...reste,
    type: 'mise',
    charge: { id: `mise-${sequence}`, montant: 1000, encaisseLe: INSTANT, ...charge },
  };
}

export function operationClientCarte(
  sequence: number,
  saisie: { clientId: string; carteId: string; nom?: string; mise?: number },
  reste: Partial<OperationCommune> & { etapes?: OperationClientCarte['etapes'] } = {},
): OperationClientCarte {
  const { etapes = { client: false, carte: false }, ...autres } = reste;
  return {
    ...commun(sequence),
    ...autres,
    type: 'client_carte',
    charge: {
      client: {
        id: saisie.clientId,
        nom: saisie.nom ?? 'Awa',
        telephone: null,
        marche: null,
        activite: null,
        avisActifs: false,
      },
      carte: { id: saisie.carteId, mise: saisie.mise ?? 1000 },
    },
    etapes,
  };
}

export function operationCarte(
  sequence: number,
  saisie: { carteId: string; clientId: string; mise?: number },
  reste: Partial<OperationCommune> = {},
): OperationCarte {
  return {
    ...commun(sequence),
    ...reste,
    type: 'carte',
    charge: { id: saisie.carteId, clientId: saisie.clientId, mise: saisie.mise ?? 1000 },
  };
}

export function operationCaisse(
  sequence: number,
  saisie: { cashDeclare: number; id?: string; date?: string },
  reste: Partial<OperationCommune> = {},
): OperationCaisse {
  return {
    ...commun(sequence),
    ...reste,
    type: 'caisse',
    charge: {
      id: saisie.id ?? 'caisse-1',
      date: saisie.date ?? INSTANT.slice(0, 10),
      cashDeclare: saisie.cashDeclare,
    },
  };
}

export function client(id: string, nom = 'Awa'): ClientLocal {
  return { id, nom, telephone: null, marche: null, activite: null, avisActifs: false };
}

export function carte(id: string, clientId: string, reste: Partial<CarteLocale> = {}): CarteLocale {
  return {
    id,
    clientId,
    mise: 1000,
    statut: 'active',
    misesEncaissees: 0,
    ouverteLe: INSTANT,
    clotureeLe: null,
    ...reste,
  };
}

export function caisse(reste: Partial<CaisseLocale> & { cashDeclare: number }): CaisseLocale {
  return { id: 'caisse-serveur', date: INSTANT.slice(0, 10), cashAttendu: 0, ecart: 0, ...reste };
}

export function tournee(reste: Partial<Tournee> = {}): Tournee {
  return { ...tourneeVide(), lueLe: INSTANT, ...reste };
}
```

- [ ] **Étape 6 : constater le vert**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/modele.test.ts`
Attendu : PASS, 8 épreuves.

- [ ] **Étape 7 : écrire l'épreuve de `in` sur la table factice**

Ajouter à la fin de `apps/collecteur/src/postgrest-factice.test.ts` (fichier CRLF : poser par Node) :

```ts
describe('le filtre `in`', () => {
  it('ne garde que les lignes dont la colonne est dans la liste', async () => {
    const table = tableFactice([
      { id: 'a', carte_id: 'k1' },
      { id: 'b', carte_id: 'k2' },
      { id: 'c', carte_id: 'k3' },
    ]);

    const { data } = await table.select('id').in('carte_id', ['k1', 'k3']).order('id');

    expect(data.map((l) => l.id)).toEqual(['a', 'c']);
  });
});
```

Si `describe` n'est pas déjà importé dans ce fichier, l'ajouter à l'import de `vitest`.

Run : `npm run test -w @kolek/collecteur -- src/postgrest-factice.test.ts`
Attendu : FAIL, « table.select(...).in is not a function ».

- [ ] **Étape 8 : ajouter `in` à la table factice**

Dans `apps/collecteur/src/postgrest-factice.ts` (CRLF), ajouter au type `Requete`, après la ligne `gte: (colonne: string, valeur: string) => Requete;` :

```ts
  in: (colonne: string, valeurs: readonly unknown[]) => Requete;
```

et, dans l'objet rendu par `requete`, après la ligne `gte: …` :

```ts
    in: (colonne: string, valeurs: readonly unknown[]) =>
      suite({ lignes: lignes.filter((l) => valeurs.includes(l[colonne])) }),
```

Run : `npm run test -w @kolek/collecteur -- src/postgrest-factice.test.ts`
Attendu : PASS.

- [ ] **Étape 9 : typage, lint, commit**

```bash
npx tsc -b apps/collecteur
npm run verifier:lint
git add package.json package-lock.json apps/collecteur/package.json apps/collecteur/src/hors-ligne apps/collecteur/src/postgrest-factice.ts apps/collecteur/src/postgrest-factice.test.ts
git commit -m "feat(hors-ligne): le modele des operations et de la tournee" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Attendu : typage sans erreur, lint à 0 erreur.

---

## Tâche 2 : appliquer une opération à une tournée

**Fichiers :**
- Créer : `apps/collecteur/src/hors-ligne/appliquer.ts`, `apps/collecteur/src/hors-ligne/appliquer.test.ts`

**Interfaces :**
- Consomme : `Operation`, `Tournee`, fabriques (tâche 1) ; `MISES_PAR_CYCLE` de `@kolek/core`.
- Produit : `appliquer(tournee: Tournee, op: Operation): Tournee` et `reappliquer(instantane: Tournee, operations: readonly Operation[]): Tournee`. Ni l'une ni l'autre ne modifie ses arguments.

- [ ] **Étape 1 : écrire l'épreuve**

Créer `apps/collecteur/src/hors-ligne/appliquer.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { appliquer, reappliquer } from './appliquer';
import {
  INSTANT,
  caisse,
  carte,
  client,
  operationCaisse,
  operationCarte,
  operationClientCarte,
  operationMise,
  tournee,
} from './fabriques';

describe('une mise', () => {
  it('s’ajoute, et la carte gagne son jour', () => {
    const t = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 4 })] });

    const apres = appliquer(t, operationMise(1, { carteId: 'k1' }));

    expect(apres.cartes[0]!.misesEncaissees).toBe(5);
    expect(apres.mises).toEqual([
      { id: 'mise-1', carteId: 'k1', montant: 1000, encaisseLe: INSTANT, estCommission: false },
    ]);
  });

  it('marque la première mise d’une carte comme commission, provisoirement', () => {
    const t = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')] });

    expect(appliquer(t, operationMise(1, { carteId: 'k1' })).mises[0]!.estCommission).toBe(true);
  });

  it('ne compte pas deux fois une mise que l’instantané porte déjà', () => {
    // La réponse s'est perdue, la tournée a été relue : le serveur a la mise et
    // la file aussi. Le compteur du serveur l'inclut déjà.
    const t = tournee({
      clients: [client('c1')],
      cartes: [carte('k1', 'c1', { misesEncaissees: 5 })],
      mises: [{ id: 'mise-1', carteId: 'k1', montant: 1000, encaisseLe: INSTANT, estCommission: false }],
    });

    const apres = appliquer(t, operationMise(1, { carteId: 'k1' }));

    expect(apres.cartes[0]!.misesEncaissees).toBe(5);
    expect(apres.mises).toHaveLength(1);
  });

  it('laisse la tournée telle quelle sur une carte absente, clôturée ou pleine', () => {
    const t = tournee({
      clients: [client('c1')],
      cartes: [
        carte('close', 'c1', { statut: 'cloturee', clotureeLe: INSTANT }),
        carte('pleine', 'c1', { misesEncaissees: 31 }),
      ],
    });

    for (const carteId of ['absente', 'close', 'pleine']) {
      expect(appliquer(t, operationMise(1, { carteId }))).toEqual(t);
    }
  });
});

describe('une inscription', () => {
  it('ajoute le client et sa carte, à zéro mise', () => {
    const apres = appliquer(tournee(), operationClientCarte(1, { clientId: 'c1', carteId: 'k1', mise: 2000 }));

    expect(apres.clients.map((c) => c.id)).toEqual(['c1']);
    expect(apres.cartes).toEqual([carte('k1', 'c1', { mise: 2000 })]);
  });

  it('n’ajoute rien deux fois', () => {
    const op = operationClientCarte(1, { clientId: 'c1', carteId: 'k1' });

    const deuxFois = appliquer(appliquer(tournee(), op), op);

    expect(deuxFois.clients).toHaveLength(1);
    expect(deuxFois.cartes).toHaveLength(1);
  });
});

describe('une carte de plus', () => {
  it('s’ajoute au client', () => {
    const apres = appliquer(tournee({ clients: [client('c1')] }), operationCarte(1, { carteId: 'k2', clientId: 'c1' }));

    expect(apres.cartes.map((c) => c.id)).toEqual(['k2']);
  });

  it('ne s’ajoute pas à un client que la tournée ne connaît pas', () => {
    expect(appliquer(tournee(), operationCarte(1, { carteId: 'k2', clientId: 'inconnu' })).cartes).toEqual([]);
  });
});

describe('une déclaration de caisse', () => {
  it('crée la ligne du jour quand il n’y en a pas', () => {
    const apres = appliquer(tournee(), operationCaisse(1, { id: 'd1', cashDeclare: 5000 }));

    expect(apres.caisses).toEqual([
      { id: 'd1', date: '2026-09-13', cashAttendu: null, cashDeclare: 5000, ecart: null },
    ]);
  });

  it('remplace la déclaration de la ligne existante, et oublie un écart devenu faux', () => {
    const t = tournee({ caisses: [caisse({ cashDeclare: 3000, cashAttendu: 3000, ecart: 0 })] });

    const apres = appliquer(t, operationCaisse(1, { cashDeclare: 5000 }));

    expect(apres.caisses).toEqual([
      { id: 'caisse-serveur', date: '2026-09-13', cashAttendu: 3000, cashDeclare: 5000, ecart: null },
    ]);
  });
});

describe('réappliquer la file sur un instantané (§9.1)', () => {
  it('suit la séquence, pas l’ordre du tableau', () => {
    const file = [
      operationMise(2, { carteId: 'k1' }),
      operationClientCarte(1, { clientId: 'c1', carteId: 'k1' }),
    ];

    const apres = reappliquer(tournee(), file);

    expect(apres.cartes[0]!.misesEncaissees).toBe(1);
  });

  it('ignore une opération refusée : elle n’est pas faite', () => {
    const t = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 3 })] });

    const apres = reappliquer(t, [
      operationMise(1, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' }),
    ]);

    expect(apres.cartes[0]!.misesEncaissees).toBe(3);
  });

  it('sur un instantané plus ancien, ne perd aucune mise et ne fait reculer aucun compteur', () => {
    const ancien = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 2 })] });
    const file = [1, 2, 3].map((n) => operationMise(n, { carteId: 'k1' }));

    const apres = reappliquer(ancien, file);

    expect(apres.cartes[0]!.misesEncaissees).toBe(5);
    expect(apres.mises.map((m) => m.id)).toEqual(['mise-1', 'mise-2', 'mise-3']);
  });

  it('sur un instantané plus récent qui porte déjà une opération, ne la compte pas deux fois', () => {
    const recent = tournee({
      clients: [client('c1')],
      cartes: [carte('k1', 'c1', { misesEncaissees: 3 })],
      mises: [{ id: 'mise-1', carteId: 'k1', montant: 1000, encaisseLe: INSTANT, estCommission: false }],
    });

    const apres = reappliquer(recent, [
      operationMise(1, { carteId: 'k1' }),
      operationMise(2, { carteId: 'k1' }),
    ]);

    expect(apres.cartes[0]!.misesEncaissees).toBe(4);
    expect(apres.mises).toHaveLength(2);
  });

  it('ne modifie pas l’instantané qu’on lui donne', () => {
    const t = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')] });
    const copie = structuredClone(t);

    reappliquer(t, [operationMise(1, { carteId: 'k1' })]);

    expect(t).toEqual(copie);
  });
});
```

- [ ] **Étape 2 : constater l'échec**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/appliquer.test.ts`
Attendu : FAIL, « Failed to resolve import "./appliquer" ».

- [ ] **Étape 3 : écrire `appliquer`**

Créer `apps/collecteur/src/hors-ligne/appliquer.ts` :

```ts
import { MISES_PAR_CYCLE } from '@kolek/core';

import type { Operation, Tournee } from './modele';

/**
 * Ce qu'une opération change à la tournée, sans réseau.
 *
 * ## Idempotent par identifiant, et c'est ce qui rend la file sûre
 *
 * Une opération peut être dans la file **et** dans l'instantané : la réponse du
 * serveur s'est perdue, puis la tournée a été relue. Appliquer ne compte donc
 * rien qui soit déjà là — une mise présente ne rajoute pas de jour à sa carte,
 * un client présent n'est pas dupliqué. Sans cette règle, l'écran compterait
 * deux fois ce que le serveur n'a compté qu'une.
 *
 * ## Ce qui n'est pas appliqué
 *
 * Une mise sur une carte absente, clôturée ou pleine n'est pas montrée. Le
 * serveur la refusera ; la montrer ferait croire à un encaissement réussi. Le
 * geste l'a déjà vérifié avant d'entrer dans la file (§7), donc ce cas ne
 * survient qu'après un rafraîchissement qui a vu la carte changer ailleurs.
 */
export function appliquer(tournee: Tournee, op: Operation): Tournee {
  const copie = structuredClone(tournee);
  appliquerSur(copie, op);
  return copie;
}

/**
 * La tournée que l'écran montre : l'instantané, et la file par-dessus.
 *
 * Seules les opérations en attente comptent. Une opération refusée n'est pas
 * faite — elle est montrée dans les alertes, pas dans les soldes.
 */
export function reappliquer(instantane: Tournee, operations: readonly Operation[]): Tournee {
  const copie = structuredClone(instantane);
  const enAttente = operations
    .filter((o) => o.etat === 'en_attente')
    .sort((a, b) => a.sequence - b.sequence);
  for (const op of enAttente) appliquerSur(copie, op);
  return copie;
}

/** Modifie `t` sur place. Privée : les deux fonctions exportées copient d'abord. */
function appliquerSur(t: Tournee, op: Operation): void {
  switch (op.type) {
    case 'mise': {
      const { id, carteId, montant, encaisseLe } = op.charge;
      if (t.mises.some((m) => m.id === id)) return;
      const carte = t.cartes.find((c) => c.id === carteId);
      if (!carte || carte.statut !== 'active' || carte.misesEncaissees >= MISES_PAR_CYCLE) return;
      // La règle du serveur, `new.est_commission := (c.mises_encaissees = 0)`,
      // reprise pour l'affichage. Le serveur décide ; sa valeur remplace
      // celle-ci au rafraîchissement (§7).
      t.mises.push({ id, carteId, montant, encaisseLe, estCommission: carte.misesEncaissees === 0 });
      carte.misesEncaissees += 1;
      return;
    }
    case 'client_carte': {
      const { client, carte } = op.charge;
      if (!t.clients.some((c) => c.id === client.id)) t.clients.push({ ...client });
      if (!t.cartes.some((c) => c.id === carte.id)) {
        t.cartes.push({
          id: carte.id,
          clientId: client.id,
          mise: carte.mise,
          statut: 'active',
          misesEncaissees: 0,
          ouverteLe: op.faiteLe,
          clotureeLe: null,
        });
      }
      return;
    }
    case 'carte': {
      const { id, clientId, mise } = op.charge;
      if (t.cartes.some((c) => c.id === id)) return;
      if (!t.clients.some((c) => c.id === clientId)) return;
      t.cartes.push({
        id,
        clientId,
        mise,
        statut: 'active',
        misesEncaissees: 0,
        ouverteLe: op.faiteLe,
        clotureeLe: null,
      });
      return;
    }
    case 'caisse': {
      const { id, date, cashDeclare } = op.charge;
      const ligne = t.caisses.find((c) => c.date === date);
      if (ligne) {
        ligne.cashDeclare = cashDeclare;
        // L'écart du serveur portait sur l'ancienne déclaration. Le garder
        // montrerait un chiffre faux jusqu'au rafraîchissement.
        ligne.ecart = null;
        return;
      }
      t.caisses.push({ id, date, cashAttendu: null, cashDeclare, ecart: null });
      return;
    }
  }
}
```

- [ ] **Étape 4 : constater le vert**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/appliquer.test.ts`
Attendu : PASS, 15 épreuves.

- [ ] **Étape 5 : commit**

```bash
npx tsc -b apps/collecteur
git add apps/collecteur/src/hors-ligne/appliquer.ts apps/collecteur/src/hors-ligne/appliquer.test.ts
git commit -m "feat(hors-ligne): appliquer une operation a la tournee, sans rien compter deux fois" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 3 : classer une réponse du serveur

**Fichiers :**
- Créer : `apps/collecteur/src/hors-ligne/classer.ts`, `apps/collecteur/src/hors-ligne/classer.test.ts`

**Interfaces :**
- Produit : `CONTRAINTES_DE_MONTANT: readonly string[]`, `RLS_PORTES_D_ENTREE: RegExp`, `interface ReponseServeur { error: { code?: string | null; message?: string | null } | null; status?: number }`, `type Portee = 'mise' | 'client' | 'carte' | 'caisse' | 'consignation'`, `type Classement`, `classer(reponse: ReponseServeur, portee: Portee): Classement`.
- `Classement` vaut `{ cas: 'accepte' }`, `{ cas: 'deja_la' }`, `{ cas: 'mettre_a_jour' }`, `{ cas: 'refus'; motif: string }`, `{ cas: 'session' }`, `{ cas: 'passager' }` ou `{ cas: 'inconnu' }`.

- [ ] **Étape 1 : écrire l'épreuve — une ligne de §6.2 par épreuve**

Créer `apps/collecteur/src/hors-ligne/classer.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { classer, type Portee } from './classer';

const erreur = (code: string, message: string, status: number) => ({
  error: { code, message },
  status,
});

describe('succès', () => {
  it('accepte une réponse sans erreur', () => {
    expect(classer({ error: null, status: 201 }, 'mise')).toEqual({ cas: 'accepte' });
  });
});

describe('23505 sur la clé de l’opération : déjà là, à vérifier (§6.3)', () => {
  it('reconnaît le DOUBLON du déclencheur des mises', () => {
    expect(classer(erreur('23505', 'DOUBLON', 409), 'mise')).toEqual({ cas: 'deja_la' });
  });

  it.each([
    ['mise', 'mises_pkey'],
    ['client', 'clients_pkey'],
    ['client', 'clients_id_collecteur_unique'],
    ['carte', 'cartes_pkey'],
    ['consignation', 'synchro_rejets_pkey'],
  ] as Array<[Portee, string]>)('reconnaît %s par « %s »', (portee, contrainte) => {
    const message = `duplicate key value violates unique constraint "${contrainte}"`;
    expect(classer(erreur('23505', message, 409), portee)).toEqual({ cas: 'deja_la' });
  });
});

describe('épreuve de garde : aucun 23505 hors clé ne vaut succès', () => {
  it.each([
    ['mise', 'mises_une_commission_par_carte'],
    ['mise', 'clients_pkey'],
    ['client', 'cartes_pkey'],
    ['carte', 'clients_id_collecteur_unique'],
    ['carte', 'mises_pkey'],
    ['consignation', 'mises_pkey'],
    ['client', 'collecteurs_telephone_key'],
  ] as Array<[Portee, string]>)('%s sur « %s » est un refus CONFLIT_UNIQUE', (portee, contrainte) => {
    const message = `duplicate key value violates unique constraint "${contrainte}"`;
    expect(classer(erreur('23505', message, 409), portee)).toEqual({
      cas: 'refus',
      motif: 'CONFLIT_UNIQUE',
    });
  });

  it('ne prend pas un DOUBLON pour une clé hors des mises', () => {
    expect(classer(erreur('23505', 'DOUBLON', 409), 'carte')).toEqual({
      cas: 'refus',
      motif: 'CONFLIT_UNIQUE',
    });
  });
});

describe('23505 sur une caisse, quelle que soit la contrainte (§6.4)', () => {
  it.each(['caisses_jour_pkey', 'caisses_jour_collecteur_id_date_key'])('« %s » : à reprendre en mise à jour', (contrainte) => {
    const message = `duplicate key value violates unique constraint "${contrainte}"`;
    expect(classer(erreur('23505', message, 409), 'caisse')).toEqual({ cas: 'mettre_a_jour' });
  });
});

describe('refus métier du déclencheur', () => {
  it.each(['CARTE_INTROUVABLE', 'CARTE_CLOTUREE', 'CYCLE_COMPLET', 'MONTANT_INVALIDE', 'DATE_INVALIDE'])(
    '%s est un refus sous son propre code',
    (code) => {
      expect(classer(erreur('P0001', code, 400), 'mise')).toEqual({ cas: 'refus', motif: code });
    },
  );
});

describe('bornes, clés étrangères, droits', () => {
  it('23514 sur une longueur : BORNE', () => {
    const message = 'new row for relation "clients" violates check constraint "clients_nom_borne"';
    expect(classer(erreur('23514', message, 400), 'client')).toEqual({ cas: 'refus', motif: 'BORNE' });
  });

  it('23514 sur un montant : BORNE_MONTANT', () => {
    const message = 'new row for relation "cartes" violates check constraint "cartes_mise_check"';
    expect(classer(erreur('23514', message, 400), 'carte')).toEqual({ cas: 'refus', motif: 'BORNE_MONTANT' });
  });

  it('23503 : PARENT_ABSENT', () => {
    const message = 'insert or update on table "cartes" violates foreign key constraint "cartes_client_du_meme_collecteur"';
    expect(classer(erreur('23503', message, 409), 'carte')).toEqual({ cas: 'refus', motif: 'PARENT_ABSENT' });
  });

  it.each(['clients', 'cartes'])('42501 de politique sur %s : ABONNEMENT_INACTIF', (table) => {
    const message = `new row violates row-level security policy for table "${table}"`;
    expect(classer(erreur('42501', message, 403), 'client')).toEqual({
      cas: 'refus',
      motif: 'ABONNEMENT_INACTIF',
    });
  });

  it('42501 ailleurs : DROIT_REFUSE', () => {
    const message = 'new row violates row-level security policy for table "mises"';
    expect(classer(erreur('42501', message, 403), 'mise')).toEqual({ cas: 'refus', motif: 'DROIT_REFUSE' });
  });
});

describe('la session', () => {
  it('HTTP 401', () => {
    expect(classer(erreur('', 'Unauthorized', 401), 'mise')).toEqual({ cas: 'session' });
  });

  it.each(['PGRST301', 'PGRST303'])('%s, même sans statut', (code) => {
    expect(classer({ error: { code, message: 'JWT expired' } }, 'mise')).toEqual({ cas: 'session' });
  });
});

describe('les échecs passagers', () => {
  it('l’échec réseau de fetch, que supabase-js rend en statut 0', () => {
    expect(classer(erreur('', 'TypeError: Failed to fetch', 0), 'mise')).toEqual({ cas: 'passager' });
  });

  it('le délai dépassé, rendu en AbortError', () => {
    expect(classer(erreur('', 'AbortError: The operation was aborted', 0), 'mise')).toEqual({ cas: 'passager' });
  });

  it.each([500, 502, 503, 504, 408, 429])('HTTP %i', (status) => {
    expect(classer(erreur('', 'Erreur', status), 'mise')).toEqual({ cas: 'passager' });
  });
});

describe('le reste', () => {
  it('une réponse que rien ne reconnaît est inconnue, et ne vaut jamais succès', () => {
    expect(classer(erreur('PGRST116', 'JSON object requested', 406), 'mise')).toEqual({ cas: 'inconnu' });
  });
});
```

- [ ] **Étape 2 : constater l'échec**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/classer.test.ts`
Attendu : FAIL, « Failed to resolve import "./classer" ».

- [ ] **Étape 3 : écrire `classer`**

Créer `apps/collecteur/src/hors-ligne/classer.ts` :

```ts
/**
 * Ce que veut dire une réponse du serveur, pour une opération de la file.
 *
 * Spec §6.2. La table est exhaustive, chaque ligne a son épreuve, et **aucune
 * branche ne rend un succès sur une erreur** : un `23505` ne devient « déjà là »
 * que sur la clé de l'opération, et « déjà là » n'est encore qu'une hypothèse
 * que l'envoi vérifie en relisant (§6.3).
 *
 * Fonction pure : ni réseau, ni horloge, ni stockage.
 */

/**
 * Les contraintes CHECK qui portent sur un montant, et non sur une longueur.
 * Même liste, et même raison, que dans `ecritures.ts` : `mises_montant_borne`
 * et `clients_nom_borne` finissent tous deux par `_borne`.
 */
export const CONTRAINTES_DE_MONTANT: readonly string[] = [
  'cartes_mise_check',
  'mises_montant_borne',
  'mises_montant_check',
];

/** Les deux portes d'entrée que `abonnement_ouvre_droit` referme. */
export const RLS_PORTES_D_ENTREE = /row-level security policy for table "(clients|cartes)"/;

/** La forme commune à toute réponse de supabase-js. Une `PostgrestResponse` s'y range telle quelle. */
export interface ReponseServeur {
  error: { code?: string | null; message?: string | null } | null;
  status?: number;
}

/** Ce que l'envoi tentait d'écrire. Une inscription a deux portées, une par étape. */
export type Portee = 'mise' | 'client' | 'carte' | 'caisse' | 'consignation';

export type Classement =
  | { cas: 'accepte' }
  | { cas: 'deja_la' }
  | { cas: 'mettre_a_jour' }
  | { cas: 'refus'; motif: string }
  | { cas: 'session' }
  | { cas: 'passager' }
  | { cas: 'inconnu' };

/** Les contraintes qui sont la clé de chaque portée (§6.3). */
const CLES: Record<Exclude<Portee, 'caisse'>, readonly string[]> = {
  mise: ['mises_pkey'],
  client: ['clients_pkey', 'clients_id_collecteur_unique'],
  carte: ['cartes_pkey'],
  consignation: ['synchro_rejets_pkey'],
};

const MESSAGES_METIER = [
  'CARTE_INTROUVABLE',
  'CARTE_CLOTUREE',
  'CYCLE_COMPLET',
  'MONTANT_INVALIDE',
  'DATE_INVALIDE',
] as const;

export function classer(reponse: ReponseServeur, portee: Portee): Classement {
  const { error, status = 0 } = reponse;
  // PostgREST pose `error` sur toute réponse hors 2xx, et supabase-js le pose
  // aussi sur un échec de `fetch`. Sans erreur, l'écriture a eu lieu.
  if (!error) return { cas: 'accepte' };

  const code = error.code ?? '';
  const message = error.message ?? '';

  // La session d'abord : un jeton expiré se présente parfois sans statut.
  if (status === 401 || /^PGRST30[1-3]$/.test(code)) return { cas: 'session' };

  if (code === '23505') {
    // La caisse du jour s'écrit « dernière déclaration gagne » : ses deux
    // unicités mènent au même état voulu (§6.4), le nom n'a pas à être lu.
    if (portee === 'caisse') return { cas: 'mettre_a_jour' };
    // `mises_avant_insert` teste le doublon en tête et lève `DOUBLON` sous
    // `23505` : un rejeu de mise se présente toujours ainsi (J1 §4.3).
    if (portee === 'mise' && message.includes('DOUBLON')) return { cas: 'deja_la' };
    const cles = CLES[portee];
    return cles.some((nom) => message.includes(`"${nom}"`))
      ? { cas: 'deja_la' }
      : { cas: 'refus', motif: 'CONFLIT_UNIQUE' };
  }

  // Les messages des déclencheurs voyagent en `P0001` : on les cherche avant
  // de se rabattre sur le SQLSTATE.
  for (const cle of MESSAGES_METIER) {
    if (message.includes(cle)) return { cas: 'refus', motif: cle };
  }

  if (code === '23514') {
    return {
      cas: 'refus',
      motif: CONTRAINTES_DE_MONTANT.some((nom) => message.includes(nom)) ? 'BORNE_MONTANT' : 'BORNE',
    };
  }
  if (code === '23503') return { cas: 'refus', motif: 'PARENT_ABSENT' };
  if (code === '42501') {
    return {
      cas: 'refus',
      motif: RLS_PORTES_D_ENTREE.test(message) ? 'ABONNEMENT_INACTIF' : 'DROIT_REFUSE',
    };
  }

  // Statut 0 : `fetch` a échoué ou a été interrompu — supabase-js rattrape
  // l'exception et la rend ainsi. Rien n'est su de l'écriture : on réessaie,
  // et le rejeu tombera sur la clé si elle avait eu lieu.
  if (status === 0 || status === 408 || status === 429 || status >= 500) return { cas: 'passager' };

  return { cas: 'inconnu' };
}
```

- [ ] **Étape 4 : constater le vert**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/classer.test.ts`
Attendu : PASS, 40 épreuves.

- [ ] **Étape 5 : commit**

```bash
npx tsc -b apps/collecteur
git add apps/collecteur/src/hors-ligne/classer.ts apps/collecteur/src/hors-ligne/classer.test.ts
git commit -m "feat(hors-ligne): classer une reponse du serveur, sans jamais prendre une erreur pour un succes" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 4 : le stockage du téléphone

**Le code livré diffère de cette tâche.** Écart 20 (`dans` avorte la transaction quand le travail échoue ; compter ne crée aucune base, commit `2f2d089`) et écart 48 (écritures en `durability: 'strict'`, commit `519e6d1`). Le dépôt fait foi ; les blocs ci-dessous restent le plan d'origine.

**Fichiers :**
- Créer : `apps/collecteur/src/hors-ligne/stockage-local.ts`, `apps/collecteur/src/hors-ligne/stockage-local.test.ts`

**Interfaces :**
- Consomme : `Operation`, `Tournee`, `ProfilLocal`, `RefusLocal`, `tourneeVide` (tâche 1) ; `reappliquer` (tâche 2).
- Produit :
  - `PREFIXE_BASE = 'kolek-collecteur-'`, `VERSION_BASE = 1`, `CLE_INSTANTANE = 'instantane'`, `CLE_PROFIL = 'profil'` ;
  - `interface SchemaKolek`, `type BaseLocale = IDBPDatabase<SchemaKolek>` ;
  - `nomBase(collecteurId: string): string` ;
  - `dans<T>(tx: { done: Promise<void> }, travail: () => Promise<T>): Promise<T>` — exécute le travail et attend la fin de la transaction, sans rejet orphelin ;
  - `ouvrirBase(collecteurId: string): Promise<BaseLocale>` et `fermerBases(): Promise<void>` ;
  - `lireOperations(base): Promise<Operation[]>`, triées par séquence ;
  - `lireTournee(base): Promise<{ tournee: Tournee; operations: Operation[] }>` ;
  - `lireProfil(base): Promise<ProfilLocal | null>` et `lireRefus(base): Promise<RefusLocal[]>` ;
  - `compterFile(base): Promise<number>` ;
  - `modifierInstantane(base, modifier: (t: Tournee) => void): Promise<void>` ;
  - `effacerDonneesDeTournee(base): Promise<void>` ;
  - `compterOperationsSurCeTelephone(): Promise<number | null>` ;
  - `type EtatStockage = 'persistant' | 'non_garanti' | 'inconnu'` et `demanderPersistance(): Promise<EtatStockage>`.

- [ ] **Étape 1 : écrire l'épreuve**

Créer `apps/collecteur/src/hors-ligne/stockage-local.test.ts` :

```ts
import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { carte, client, operationMise, tournee } from './fabriques';
import {
  CLE_INSTANTANE,
  CLE_PROFIL,
  compterFile,
  compterOperationsSurCeTelephone,
  demanderPersistance,
  effacerDonneesDeTournee,
  fermerBases,
  lireOperations,
  lireProfil,
  lireRefus,
  lireTournee,
  modifierInstantane,
  nomBase,
  ouvrirBase,
} from './stockage-local';

beforeEach(async () => {
  await fermerBases();
  // Une fabrique neuve par épreuve : aucune base ne survit d'une épreuve à l'autre.
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PROFIL = {
  nom: 'Awa',
  telephone: '+2250700000000',
  zone: null,
  palier: 'pro',
  abonnementStatut: 'actif',
  abonnementEcheance: null,
  titulaireId: null,
  lueLe: '2026-09-13T09:00:00.000Z',
};

describe('une base par collecteur (§5.1)', () => {
  it('se nomme d’après le collecteur', () => {
    expect(nomBase('abc')).toBe('kolek-collecteur-abc');
  });

  it('porte les quatre espaces de la spec', async () => {
    const base = await ouvrirBase('a');
    expect([...base.objectStoreNames].sort()).toEqual(['file', 'profil', 'refus', 'tournee']);
  });

  it('n’ouvre jamais la base d’un autre collecteur', async () => {
    const a = await ouvrirBase('a');
    await a.add('file', operationMise(1, { carteId: 'k1' }));

    const b = await ouvrirBase('b');

    expect(await compterFile(a)).toBe(1);
    expect(await compterFile(b)).toBe(0);
  });

  it('rend la même base à deux appels', async () => {
    expect(await ouvrirBase('a')).toBe(await ouvrirBase('a'));
  });
});

describe('lire', () => {
  it('rend une tournée vide et une file vide sur un téléphone neuf', async () => {
    const base = await ouvrirBase('a');
    expect(await lireTournee(base)).toEqual({
      tournee: { clients: [], cartes: [], mises: [], retraits: [], caisses: [], lueLe: null },
      operations: [],
    });
  });

  it('montre l’instantané avec la file réappliquée', async () => {
    const base = await ouvrirBase('a');
    await base.put('tournee', tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')] }), CLE_INSTANTANE);
    await base.add('file', operationMise(1, { carteId: 'k1' }));

    const { tournee: t, operations } = await lireTournee(base);

    expect(t.cartes[0]!.misesEncaissees).toBe(1);
    expect(operations).toHaveLength(1);
  });

  it('rend la file dans l’ordre des séquences', async () => {
    const base = await ouvrirBase('a');
    await base.add('file', operationMise(3, { carteId: 'k1' }));
    await base.add('file', operationMise(1, { carteId: 'k1' }));

    expect((await lireOperations(base)).map((o) => o.sequence)).toEqual([1, 3]);
  });

  it('rend le profil et les refus gardés', async () => {
    const base = await ouvrirBase('a');
    expect(await lireProfil(base)).toBeNull();
    await base.put('profil', PROFIL, CLE_PROFIL);

    expect(await lireProfil(base)).toEqual(PROFIL);
    expect(await lireRefus(base)).toEqual([]);
  });
});

describe('ce qui survit, et ce qui s’efface', () => {
  it('garde tout à la réouverture — un rechargement de la page ne perd rien', async () => {
    const base = await ouvrirBase('a');
    await base.add('file', operationMise(1, { carteId: 'k1' }));
    await fermerBases();

    expect(await compterFile(await ouvrirBase('a'))).toBe(1);
  });

  it('efface tournée, profil et refus à la déconnexion, et garde la file', async () => {
    const base = await ouvrirBase('a');
    await base.put('tournee', tournee({ clients: [client('c1')] }), CLE_INSTANTANE);
    await base.put('profil', PROFIL, CLE_PROFIL);
    await base.add('file', operationMise(1, { carteId: 'k1' }));

    await effacerDonneesDeTournee(base);

    expect((await lireTournee(base)).tournee.clients).toEqual([]);
    expect(await lireProfil(base)).toBeNull();
    expect(await compterFile(base)).toBe(1);
  });

  it('modifie l’instantané en une écriture', async () => {
    const base = await ouvrirBase('a');
    await base.put('tournee', tournee({ clients: [client('c1')] }), CLE_INSTANTANE);

    await modifierInstantane(base, (t) => {
      t.clients[0]!.nom = 'Awa Traoré';
    });

    expect((await lireTournee(base)).tournee.clients[0]!.nom).toBe('Awa Traoré');
  });
});

describe('compter sans rien lire (§8.6)', () => {
  it('additionne les files de tous les collecteurs du téléphone', async () => {
    const a = await ouvrirBase('a');
    const b = await ouvrirBase('b');
    await a.add('file', operationMise(1, { carteId: 'k1' }));
    await a.add('file', operationMise(2, { carteId: 'k1' }));
    await b.add('file', operationMise(1, { carteId: 'k2' }));

    expect(await compterOperationsSurCeTelephone()).toBe(3);
  });

  it('se tait là où le navigateur ne sait pas lister ses bases', async () => {
    vi.stubGlobal('indexedDB', { databases: undefined });
    expect(await compterOperationsSurCeTelephone()).toBeNull();
  });
});

describe('le stockage persistant (§4.6)', () => {
  it('dit « inconnu » là où l’API manque, plutôt que d’inquiéter à tort', async () => {
    vi.stubGlobal('navigator', {});
    expect(await demanderPersistance()).toBe('inconnu');
  });

  it('ne redemande pas ce qui est déjà accordé', async () => {
    const persist = vi.fn();
    vi.stubGlobal('navigator', { storage: { persisted: async () => true, persist } });
    expect(await demanderPersistance()).toBe('persistant');
    expect(persist).not.toHaveBeenCalled();
  });

  it('dit « non garanti » quand le navigateur refuse', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist: async () => false } });
    expect(await demanderPersistance()).toBe('non_garanti');
  });
});
```

- [ ] **Étape 2 : constater l'échec**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/stockage-local.test.ts`
Attendu : FAIL, « Failed to resolve import "./stockage-local" ».

- [ ] **Étape 3 : écrire le stockage**

Créer `apps/collecteur/src/hors-ligne/stockage-local.ts` :

```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import { reappliquer } from './appliquer';
import {
  tourneeVide,
  type Operation,
  type ProfilLocal,
  type RefusLocal,
  type Tournee,
} from './modele';

/**
 * Le disque du téléphone : ouvrir, lire, compter, effacer. Aucune règle métier.
 *
 * ## Une base par collecteur
 *
 * Deux collecteurs se relaient parfois sur un même téléphone. Chacun a sa base,
 * `kolek-collecteur-<id>`, et le code n'ouvre jamais que celle de la session.
 * C'est plus sûr qu'un filtre : une requête oubliée ne peut pas lire les
 * opérations d'un autre, puisqu'elles ne sont pas dans la base ouverte.
 *
 * ## Pourquoi le disque, alors que `cache.ts` s'y refusait
 *
 * Décision de l'exploitant du 2026-09-13, spec §5.1 : le hors-ligne l'exige, et
 * la tournée s'efface à la déconnexion. La file, elle, reste : c'est de
 * l'argent qui n'est pas encore arrivé.
 */

export const PREFIXE_BASE = 'kolek-collecteur-';

/** Le numéro du schéma local. On ne modifie jamais une version publiée : on en ajoute une. */
export const VERSION_BASE = 1;

export const CLE_INSTANTANE = 'instantane';
export const CLE_PROFIL = 'profil';

export interface SchemaKolek extends DBSchema {
  file: { key: string; value: Operation; indexes: { par_sequence: number } };
  tournee: { key: string; value: Tournee };
  profil: { key: string; value: ProfilLocal };
  refus: { key: string; value: RefusLocal };
}

export type BaseLocale = IDBPDatabase<SchemaKolek>;

export function nomBase(collecteurId: string): string {
  return `${PREFIXE_BASE}${collecteurId}`;
}

/**
 * Le travail d'une transaction, et sa fin, attendus ensemble.
 *
 * `tx.done` rejette quand la transaction avorte — une contrainte violée, un
 * disque plein. Attendre le travail seul laisserait ce rejet sans preneur, et
 * attendre `tx.done` seul laisserait passer l'erreur du travail. `Promise.all`
 * prend les deux : le premier échec remonte, l'autre est tenu.
 */
export async function dans<T>(tx: { done: Promise<void> }, travail: () => Promise<T>): Promise<T> {
  const [resultat] = await Promise.all([travail(), tx.done]);
  return resultat;
}

const ouvertes = new Map<string, Promise<BaseLocale>>();

/**
 * Ouvre la base du collecteur, une fois par collecteur pour toute la session.
 *
 * `blocking` : une version plus récente de l'application, dans un autre onglet,
 * demande à faire monter le schéma. On ferme pour ne pas la bloquer ; le
 * prochain appel rouvre à la nouvelle version.
 */
export function ouvrirBase(collecteurId: string): Promise<BaseLocale> {
  const deja = ouvertes.get(collecteurId);
  if (deja) return deja;

  const ouverture: Promise<BaseLocale> = openDB<SchemaKolek>(nomBase(collecteurId), VERSION_BASE, {
    upgrade(db, ancienne) {
      if (ancienne < 1) {
        db.createObjectStore('file', { keyPath: 'id' }).createIndex('par_sequence', 'sequence', {
          unique: true,
        });
        db.createObjectStore('tournee');
        db.createObjectStore('profil');
        db.createObjectStore('refus', { keyPath: 'id' });
      }
    },
    blocking() {
      ouvertes.delete(collecteurId);
      void ouverture.then((base) => base.close());
    },
    terminated() {
      ouvertes.delete(collecteurId);
    },
  });

  ouvertes.set(collecteurId, ouverture);
  // Une ouverture ratée ne doit pas rester en mémoire : le prochain appel réessaie.
  void ouverture.catch(() => ouvertes.delete(collecteurId));
  return ouverture;
}

/** Ferme tout. Sert aux épreuves, qui simulent ainsi un rechargement de la page. */
export async function fermerBases(): Promise<void> {
  const toutes = [...ouvertes.values()];
  ouvertes.clear();
  for (const ouverture of toutes) {
    const base = await ouverture.catch(() => null);
    base?.close();
  }
}

export function lireOperations(base: BaseLocale): Promise<Operation[]> {
  return base.getAllFromIndex('file', 'par_sequence');
}

/** La tournée que l'écran montre, et la file qui y a été réappliquée — lues ensemble. */
export async function lireTournee(
  base: BaseLocale,
): Promise<{ tournee: Tournee; operations: Operation[] }> {
  const tx = base.transaction(['tournee', 'file'], 'readonly');
  const [instantane, operations] = await dans(tx, () =>
    Promise.all([
      tx.objectStore('tournee').get(CLE_INSTANTANE),
      tx.objectStore('file').index('par_sequence').getAll(),
    ]),
  );
  return { tournee: reappliquer(instantane ?? tourneeVide(), operations), operations };
}

export async function lireProfil(base: BaseLocale): Promise<ProfilLocal | null> {
  return (await base.get('profil', CLE_PROFIL)) ?? null;
}

export function lireRefus(base: BaseLocale): Promise<RefusLocal[]> {
  return base.getAll('refus');
}

export function compterFile(base: BaseLocale): Promise<number> {
  return base.count('file');
}

/** Change l'instantané après un geste resté en ligne — une clôture, une correction. */
export async function modifierInstantane(
  base: BaseLocale,
  modifier: (t: Tournee) => void,
): Promise<void> {
  const tx = base.transaction('tournee', 'readwrite');
  await dans(tx, async () => {
    const t = (await tx.store.get(CLE_INSTANTANE)) ?? tourneeVide();
    modifier(t);
    await tx.store.put(t, CLE_INSTANTANE);
  });
}

/** La déconnexion : tournée, profil et copie des refus. La file n'est jamais touchée ici. */
export async function effacerDonneesDeTournee(base: BaseLocale): Promise<void> {
  const tx = base.transaction(['tournee', 'profil', 'refus'], 'readwrite');
  await dans(tx, () =>
    Promise.all([
      tx.objectStore('tournee').clear(),
      tx.objectStore('profil').clear(),
      tx.objectStore('refus').clear(),
    ]),
  );
}

/**
 * Le nombre d'opérations qui attendent sur ce téléphone, tous comptes confondus.
 *
 * Lu avant toute connexion, pour l'écran de connexion (§8.6). `count()` ne lit
 * aucune opération : ni nom, ni montant ne sort d'ici. `null` là où le
 * navigateur ne sait pas lister ses bases — mieux vaut se taire qu'annoncer
 * zéro à tort.
 */
export async function compterOperationsSurCeTelephone(): Promise<number | null> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return null;
  try {
    let total = 0;
    for (const { name } of await indexedDB.databases()) {
      if (!name?.startsWith(PREFIXE_BASE)) continue;
      // Sans numéro de version : ouvre la base telle qu'elle est, sans la créer
      // ni la faire monter.
      const base = await openDB<SchemaKolek>(name);
      try {
        if (base.objectStoreNames.contains('file')) total += await base.count('file');
      } finally {
        base.close();
      }
    }
    return total;
  } catch {
    return null;
  }
}

export type EtatStockage = 'persistant' | 'non_garanti' | 'inconnu';

/**
 * Demande au navigateur de ne pas vider la base quand la place manque (§4.6).
 *
 * `inconnu` là où l'API manque : on ne prévient pas d'un risque qu'on ne sait
 * pas mesurer.
 */
export async function demanderPersistance(): Promise<EtatStockage> {
  const stockage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  if (typeof stockage?.persist !== 'function' || typeof stockage.persisted !== 'function') {
    return 'inconnu';
  }
  try {
    if (await stockage.persisted()) return 'persistant';
    return (await stockage.persist()) ? 'persistant' : 'non_garanti';
  } catch {
    return 'inconnu';
  }
}
```

- [ ] **Étape 4 : constater le vert**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/stockage-local.test.ts`
Attendu : PASS, 16 épreuves.

- [ ] **Étape 5 : commit**

```bash
npx tsc -b apps/collecteur
git add apps/collecteur/src/hors-ligne/stockage-local.ts apps/collecteur/src/hors-ligne/stockage-local.test.ts
git commit -m "feat(hors-ligne): une base par collecteur sur le telephone" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 5 : les phrases, les gestes et la file

**Le code livré diffère de cette tâche.** Écarts 22 et 23 (seules les erreurs du stockage deviennent `STOCKAGE` ; phrase neutre pour un refus sans motif reconnu, commits `e417613` et `7c6e6dd`) et écart 48 (`519e6d1`). Le dépôt fait foi ; les blocs ci-dessous restent le plan d'origine.

**Fichiers :**
- Créer : `apps/collecteur/src/phrases.ts`, `apps/collecteur/src/phrases.test.ts`
- Modifier : `apps/collecteur/src/ecritures.ts` (la table `PHRASES` et `EchecEcriture` viennent de `phrases.ts`)
- Créer : `apps/collecteur/src/hors-ligne/gestes.ts`, `apps/collecteur/src/hors-ligne/gestes.test.ts`
- Créer : `apps/collecteur/src/hors-ligne/file.ts`, `apps/collecteur/src/hors-ligne/file.test.ts`

**Interfaces :**
- Consomme : tâches 1, 2 et 4.
- Produit (`phrases.ts`) : `interface EchecEcriture { code: string; message: string }`, `PHRASES`, `PHRASES_REFUS`, `phraseEcriture(code: string): EchecEcriture`, `phraseRefus(motif: string): string`.
- Produit (`gestes.ts`) : `BORNES_CLIENT`, `interface ContexteGeste { collecteurId: string; maintenant: number; sursisMs?: number }`, `interface ContexteInscription extends ContexteGeste { abonnementStatut: string | null }`, `interface SaisieClient { nom: string; telephone?: string; marche?: string; activite?: string; mise: number; avisActifs?: boolean }`, `construireMise(ctx, { carteId, montant, encaisseLe: Date }): Construction<OperationMise>`, `construireClientCarte(ctx: ContexteInscription, saisie: SaisieClient): Construction<OperationClientCarte>`, `construireCarte(ctx: ContexteInscription, { clientId, mise }): Construction<OperationCarte>`, `construireCaisse(ctx, { date, montant }): Construction<OperationCaisse>`.
- Produit (`file.ts`) : `type Construction<O extends Operation> = (tournee: Tournee, operations: readonly Operation[], sequence: number) => { ok: true; operation: O } | { ok: false; echec: EchecEcriture }`, `type ResultatAjout<O>`, `ajouter<O>(base, construire): Promise<ResultatAjout<O>>`, `annuler(base, operationId, maintenant?): Promise<'annulee' | 'partie' | 'absente'>`, `avancer(base, operationId, maintenant?): Promise<void>`, `mettreAJour(base, op): Promise<void>`, `retirerAcceptee(base, op): Promise<void>`, `retirerEnRefus(base, op, maintenant?): Promise<void>`.

- [ ] **Étape 1 : écrire l'épreuve des phrases**

Créer `apps/collecteur/src/phrases.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { PHRASES, PHRASES_REFUS, phraseEcriture, phraseRefus } from './phrases';

describe('la table unique des phrases', () => {
  it('traduit un code connu', () => {
    expect(phraseEcriture('CARTE_CLOTUREE')).toEqual({
      code: 'CARTE_CLOTUREE',
      message: 'Cette carte est clôturée. Ouvre une nouvelle carte.',
    });
  });

  it('garde le code inconnu, avec la phrase générique', () => {
    expect(phraseEcriture('RIEN_DE_TEL')).toEqual({ code: 'RIEN_DE_TEL', message: PHRASES.INCONNU });
  });

  it('dit enfin DATE_INVALIDE, qui tombait sur « Réessaie » (écart 2)', () => {
    expect(phraseEcriture('DATE_INVALIDE').message).not.toMatch(/Réessaie/);
  });
});

describe('les phrases des refus, au passé (§8.4)', () => {
  it.each([
    'CARTE_INTROUVABLE',
    'CARTE_CLOTUREE',
    'CYCLE_COMPLET',
    'MONTANT_INVALIDE',
    'DATE_INVALIDE',
    'BORNE',
    'BORNE_MONTANT',
    'CONFLIT_UNIQUE',
    'PARENT_ABSENT',
    'PARENT_REFUSE',
    'ABONNEMENT_INACTIF',
    'DROIT_REFUSE',
    'DOUBLON_INVERIFIABLE',
    'INCONNU',
  ])('ont une phrase pour %s', (motif) => {
    expect(PHRASES_REFUS[motif]).toBeTruthy();
  });

  it('dit la carte clôturée comme la spec l’écrit', () => {
    expect(phraseRefus('CARTE_CLOTUREE')).toBe('La carte avait été clôturée.');
  });

  it('ne laisse jamais un motif sans phrase', () => {
    expect(phraseRefus('MOTIF_FUTUR')).toBe(PHRASES_REFUS.INCONNU);
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/phrases.test.ts`
Attendu : FAIL, « Failed to resolve import "./phrases" ».

- [ ] **Étape 2 : écrire `phrases.ts`**

Créer `apps/collecteur/src/phrases.ts` :

```ts
import { MISE_MIN } from '@kolek/core';

/**
 * Les phrases que lit le collecteur, en une seule table.
 *
 * Elles vivaient dans `ecritures.ts`. La file du hors-ligne doit les lire sans
 * charger le client réseau — `ecritures.ts` importe `./supabase`, qui lève sans
 * configuration — d'où ce module sans dépendance. `ecritures.ts` les
 * réexporte : la table reste unique (spec §8).
 *
 * Deux tables, deux temps. `PHRASES` parle d'un geste qui vient d'échouer sous
 * les yeux du collecteur, au présent. `PHRASES_REFUS` raconte ce qui est arrivé
 * à une opération partie plus tard, sans lui : « La carte avait été clôturée ».
 */

export interface EchecEcriture {
  /** Le code court, pour les épreuves et les journaux. */
  code: string;
  /** La phrase montrée au collecteur. */
  message: string;
}

export const PHRASES: Readonly<Record<string, string>> = {
  DOUBLON: 'Cette mise a déjà été enregistrée.',
  CARTE_INTROUVABLE: 'Cette carte n’existe pas ou ne t’appartient pas.',
  CARTE_CLOTUREE: 'Cette carte est clôturée. Ouvre une nouvelle carte.',
  CYCLE_COMPLET: 'Le cycle de 31 mises est complet. Il faut clôturer la carte.',
  MONTANT_INVALIDE: 'Le montant doit être égal à la mise de la carte.',
  DATE_INVALIDE:
    'Le serveur n’accepte une opération que d’un jour en avant à 90 jours en arrière. Vérifie la date du téléphone.',
  BORNE: 'Une des informations saisies est trop longue.',
  BORNE_MONTANT: 'Le serveur refuse ce montant. Choisis un des montants proposés.',
  CONFLIT_UNIQUE: 'Le serveur a déjà une ligne à cette place. Contacte GTCS.',
  PARENT_ABSENT: 'Le client ou la carte de cette opération n’existe pas au serveur.',
  DROIT_REFUSE: 'Tu n’as pas le droit d’écrire cette ligne.',
  ABONNEMENT_INACTIF:
    'Ton abonnement n’est plus actif. Tu peux encaisser sur les cartes déjà ouvertes, mais pas ajouter de client ni ouvrir de carte. Contacte GTCS.',
  RIEN_ECRIT: 'Le serveur n’a rien changé. Reconnecte-toi et réessaie.',
  RESEAU: 'Pas de réseau. Réessaie une fois connecté.',
  NOM_VIDE: 'Le nom du client est obligatoire.',
  MISE_HORS_BORNES: `La mise doit être d’au moins ${MISE_MIN} FCFA.`,
  CAISSE_INVALIDE: 'Le montant déclaré doit être un nombre positif.',
  CARTE_ABSENTE:
    'Cette carte n’est pas sur ce téléphone. Connecte-toi une fois au réseau pour recharger ta tournée.',
  CLIENT_INTROUVABLE:
    'Ce client n’est pas sur ce téléphone. Connecte-toi une fois au réseau pour recharger ta tournée.',
  STOCKAGE:
    'Enregistrement impossible sur ce téléphone : rien n’a été compté. Libère de la place, puis réessaie.',
  INCONNU: 'Enregistrement impossible. Réessaie.',
};

export const PHRASES_REFUS: Readonly<Record<string, string>> = {
  CARTE_INTROUVABLE: 'Le serveur ne connaissait pas cette carte.',
  CARTE_CLOTUREE: 'La carte avait été clôturée.',
  CYCLE_COMPLET: 'Le cycle de 31 mises était déjà complet.',
  MONTANT_INVALIDE: 'Le montant ne correspondait pas à la mise de la carte.',
  DATE_INVALIDE:
    'La date sortait de la fenêtre du serveur : plus de 90 jours d’attente, ou l’horloge du téléphone en avance.',
  BORNE: 'Une des informations saisies était trop longue.',
  BORNE_MONTANT: 'Le serveur a refusé ce montant.',
  CONFLIT_UNIQUE: 'Le serveur avait déjà une ligne à cette place.',
  PARENT_ABSENT: 'Le client ou la carte n’existait pas au serveur.',
  PARENT_REFUSE: 'L’opération dont elle dépendait a été refusée.',
  ABONNEMENT_INACTIF: 'L’abonnement n’était plus actif.',
  DROIT_REFUSE: 'Le serveur a refusé d’écrire cette ligne.',
  DOUBLON_INVERIFIABLE: 'Le serveur signalait un doublon qui n’a pas pu être vérifié.',
  INCONNU: 'Le serveur a répondu cinq fois sans motif reconnu.',
};

/** La phrase d'un code court. Exportée pour les écrans et pour `encaisserPour`. */
export function phraseEcriture(code: string): EchecEcriture {
  return { code, message: PHRASES[code] ?? PHRASES.INCONNU! };
}

/** Le motif d'un refus, en clair. */
export function phraseRefus(motif: string): string {
  return PHRASES_REFUS[motif] ?? PHRASES_REFUS.INCONNU!;
}
```

Run : `npm run test -w @kolek/collecteur -- src/phrases.test.ts`
Attendu : PASS, 19 épreuves.

- [ ] **Étape 3 : `ecritures.ts` lit la table de `phrases.ts`**

Dans `apps/collecteur/src/ecritures.ts` (CRLF, par Node) :

1. Remplacer la ligne `import { MISE_MIN, validerMise } from '@kolek/core';` par :

```ts
import { MISE_MIN, validerMise } from '@kolek/core';

import { PHRASES, phraseEcriture, type EchecEcriture } from './phrases';
```

(La ligne `import { supabase } from './supabase';` qui suit reste.)

2. Supprimer le bloc qui va de `export interface EchecEcriture {` jusqu'à la fin de la déclaration `const PHRASES: Record<string, string> = { … };` (lignes 33 à 54 aujourd'hui), et le remplacer par :

```ts
export type { EchecEcriture };
```

3. Supprimer la fonction `phraseEcriture` et sa documentation (lignes 129 à 141 aujourd'hui), et la remplacer par :

```ts
/**
 * La phrase d'un code court — voir `phrases.ts`, où vit désormais la table.
 * Réexportée ici parce que `encaisserPour` et les écrans l'importent d'ici.
 */
export { phraseEcriture };
```

Le reste du fichier lit `PHRASES.RIEN_ECRIT!` et `PHRASES.INCONNU!` : inchangé, le nom est le même.

Run : `npm run test -w @kolek/collecteur -- src/ecritures.test.ts src/phrases.test.ts`
Attendu : PASS — rien n'a changé pour `ecritures.test.ts`.

- [ ] **Étape 4 : écrire l'épreuve des gestes (§7)**

Créer `apps/collecteur/src/hors-ligne/gestes.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { carte, caisse, client, operationClientCarte, tournee } from './fabriques';
import {
  construireCaisse,
  construireCarte,
  construireClientCarte,
  construireMise,
  type SaisieClient,
} from './gestes';

const MAINTENANT = Date.parse('2026-09-13T10:00:00.000Z');
const CTX = { collecteurId: 'col-1', maintenant: MAINTENANT };
const INSCRIPTION = { ...CTX, abonnementStatut: 'actif' };

const UNE_CARTE = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 4 })] });

describe('encaisser une mise', () => {
  const mise = (t = UNE_CARTE, reste: Partial<{ carteId: string; montant: number }> = {}) =>
    construireMise(CTX, { carteId: 'k1', montant: 1000, encaisseLe: new Date(MAINTENANT), ...reste })(t, [], 7);

  it('construit l’opération, sa séquence et son heure', () => {
    const r = mise();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.operation).toMatchObject({
      version: 1,
      sequence: 7,
      collecteurId: 'col-1',
      type: 'mise',
      etat: 'en_attente',
      tentatives: 0,
      prochainEssai: null,
      dependDe: [],
      faiteLe: '2026-09-13T10:00:00.000Z',
      envoyableApres: '2026-09-13T10:00:00.000Z',
      charge: { carteId: 'k1', montant: 1000, encaisseLe: '2026-09-13T10:00:00.000Z' },
    });
    expect(r.operation.id).toHaveLength(36);
    expect(r.operation.charge.id).toHaveLength(36);
    expect(r.operation.charge.id).not.toBe(r.operation.id);
  });

  it('ne part qu’après le sursis quand il y en a un (§7)', () => {
    const r = construireMise({ ...CTX, sursisMs: 6000 }, { carteId: 'k1', montant: 1000, encaisseLe: new Date(MAINTENANT) })(UNE_CARTE, [], 1);
    expect(r.ok && r.operation.envoyableApres).toBe('2026-09-13T10:00:06.000Z');
  });

  it.each([
    ['une carte absente du téléphone', 'CARTE_ABSENTE', { carteId: 'k9' }],
    ['un montant différent de la mise', 'MONTANT_INVALIDE', { montant: 2000 }],
    ['un montant sous le minimum', 'MISE_HORS_BORNES', { montant: 100 }],
  ] as Array<[string, string, Partial<{ carteId: string; montant: number }>]>)('refuse %s', (_cas, code, reste) => {
    const r = mise(UNE_CARTE, reste);
    expect(r.ok ? null : r.echec.code).toBe(code);
  });

  it('refuse une carte clôturée et une carte pleine', () => {
    const close = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { statut: 'cloturee' })] });
    const pleine = tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 31 })] });
    expect(mise(close)).toMatchObject({ ok: false, echec: { code: 'CARTE_CLOTUREE' } });
    expect(mise(pleine)).toMatchObject({ ok: false, echec: { code: 'CYCLE_COMPLET' } });
  });

  it('dépend de l’inscription encore en file qui a créé la carte (§6.6)', () => {
    const inscription = operationClientCarte(1, { clientId: 'c2', carteId: 'k2' });
    const t = tournee({ clients: [client('c2')], cartes: [carte('k2', 'c2')] });

    const r = construireMise(CTX, { carteId: 'k2', montant: 1000, encaisseLe: new Date(MAINTENANT) })(t, [inscription], 2);

    expect(r.ok && r.operation.dependDe).toEqual(['op-1']);
  });
});

describe('inscrire un client et sa carte', () => {
  const inscrire = (saisie: Partial<SaisieClient> = {}, ctx: { collecteurId: string; maintenant: number; abonnementStatut: string | null } = INSCRIPTION) =>
    construireClientCarte(ctx, { nom: '  Awa  ', telephone: ' 0700 ', marche: '', mise: 1000, avisActifs: true, ...saisie })(tournee(), [], 3);

  it('construit les deux étapes, les champs nettoyés, rien de fait encore', () => {
    const r = inscrire();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.operation.charge.client).toMatchObject({
      nom: 'Awa',
      telephone: '0700',
      marche: null,
      activite: null,
      avisActifs: true,
    });
    expect(r.operation.charge.carte.mise).toBe(1000);
    expect(r.operation.etapes).toEqual({ client: false, carte: false });
  });

  it('n’enregistre aucun consentement sans numéro', () => {
    const r = inscrire({ telephone: '   ' });
    expect(r.ok && r.operation.charge.client.avisActifs).toBe(false);
  });

  it('refuse un nom vide', () => {
    expect(inscrire({ nom: '   ' })).toMatchObject({ ok: false, echec: { code: 'NOM_VIDE' } });
  });

  it.each([
    ['nom', 121],
    ['telephone', 33],
    ['marche', 81],
    ['activite', 81],
  ] as Array<[string, number]>)('refuse un %s au-delà de la borne du serveur', (champ, longueur) => {
    const saisie = { [champ]: 'x'.repeat(longueur) } as Partial<SaisieClient>;
    expect(inscrire(saisie)).toMatchObject({ ok: false, echec: { code: 'BORNE' } });
  });

  it('accepte chaque champ exactement à sa borne', () => {
    expect(inscrire({ nom: 'x'.repeat(120), telephone: '9'.repeat(32), marche: 'm'.repeat(80), activite: 'a'.repeat(80) }).ok).toBe(true);
  });

  it('refuse quand le dernier statut connu n’est pas actif', () => {
    expect(inscrire({}, { ...CTX, abonnementStatut: 'suspendu' })).toMatchObject({
      ok: false,
      echec: { code: 'ABONNEMENT_INACTIF' },
    });
  });

  it('laisse le serveur trancher quand le statut n’a jamais été lu', () => {
    expect(inscrire({}, { ...CTX, abonnementStatut: null }).ok).toBe(true);
  });
});

describe('ouvrir une carte', () => {
  it('construit la carte du client', () => {
    const r = construireCarte(INSCRIPTION, { clientId: 'c1', mise: 2000 })(UNE_CARTE, [], 1);
    expect(r.ok && r.operation.charge).toMatchObject({ clientId: 'c1', mise: 2000 });
  });

  it('refuse un client absent du téléphone, et un abonnement suspendu', () => {
    expect(construireCarte(INSCRIPTION, { clientId: 'c9', mise: 1000 })(UNE_CARTE, [], 1)).toMatchObject({
      ok: false,
      echec: { code: 'CLIENT_INTROUVABLE' },
    });
    expect(construireCarte({ ...CTX, abonnementStatut: 'expire' }, { clientId: 'c1', mise: 1000 })(UNE_CARTE, [], 1)).toMatchObject({
      ok: false,
      echec: { code: 'ABONNEMENT_INACTIF' },
    });
  });

  it('dépend de l’inscription du client encore en file', () => {
    const inscription = operationClientCarte(1, { clientId: 'c2', carteId: 'k2' });
    const t = tournee({ clients: [client('c2')], cartes: [carte('k2', 'c2')] });
    const r = construireCarte(INSCRIPTION, { clientId: 'c2', mise: 500 })(t, [inscription], 2);
    expect(r.ok && r.operation.dependDe).toEqual(['op-1']);
  });
});

describe('déclarer la caisse (§6.4)', () => {
  it('refuse un montant négatif ou décimal', () => {
    expect(construireCaisse(CTX, { date: '2026-09-13', montant: -1 })(tournee(), [], 1)).toMatchObject({
      ok: false,
      echec: { code: 'CAISSE_INVALIDE' },
    });
    expect(construireCaisse(CTX, { date: '2026-09-13', montant: 10.5 })(tournee(), [], 1).ok).toBe(false);
  });

  it('reprend l’identifiant de la ligne du jour', () => {
    const t = tournee({ caisses: [caisse({ id: 'ligne-du-jour', cashDeclare: 3000 })] });
    const r = construireCaisse(CTX, { date: '2026-09-13', montant: 5000 })(t, [], 1);
    expect(r.ok && r.operation.charge).toEqual({ id: 'ligne-du-jour', date: '2026-09-13', cashDeclare: 5000 });
  });

  it('tire un identifiant à la première déclaration de la journée', () => {
    const r = construireCaisse(CTX, { date: '2026-09-13', montant: 0 })(tournee(), [], 1);
    expect(r.ok && r.operation.charge.id).toHaveLength(36);
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/gestes.test.ts`
Attendu : FAIL, « Failed to resolve import "./gestes" ».

- [ ] **Étape 5 : écrire `file.ts` (le type `Construction` d'abord) et `gestes.ts`**

Créer `apps/collecteur/src/hors-ligne/file.ts` :

```ts
import { PHRASES, type EchecEcriture } from '../phrases';
import { appliquer, reappliquer } from './appliquer';
import { chargeUtileDe, tourneeVide, type Operation, type Tournee } from './modele';
import { CLE_INSTANTANE, dans, type BaseLocale } from './stockage-local';

/**
 * La file : chaque changement en une transaction, et rien d'autre.
 *
 * ## Un geste est une seule écriture
 *
 * La tournée montrée à l'écran est l'instantané **plus** la file réappliquée
 * (`lireTournee`). Ajouter une opération suffit donc à la montrer : il n'y a pas
 * de seconde écriture à tenir d'accord avec la première, et la garantie §4.1 —
 * « rien n'est fait avant d'être sur le disque » — ne dépend d'aucune
 * discipline. Si l'ajout échoue, rien n'est montré.
 *
 * ## Quitter la file
 *
 * Deux sorties seulement, chacune dans une transaction avec sa conséquence :
 * `retirerAcceptee` applique l'opération à l'instantané en même temps qu'elle la
 * retire ; `retirerEnRefus` en garde la copie dans `refus`. Entre les deux, une
 * coupure laisse l'opération dans la file, jamais nulle part.
 */

export type Construction<O extends Operation> = (
  tournee: Tournee,
  operations: readonly Operation[],
  sequence: number,
) => { ok: true; operation: O } | { ok: false; echec: EchecEcriture };

export type ResultatAjout<O extends Operation> =
  | { ok: true; operation: O }
  | { ok: false; echec: EchecEcriture };

/**
 * Vérifie le geste contre la tournée telle que l'écran la montre, et l'ajoute —
 * dans la même transaction, pour qu'aucun autre geste ne se glisse entre les
 * deux.
 */
export async function ajouter<O extends Operation>(
  base: BaseLocale,
  construire: Construction<O>,
): Promise<ResultatAjout<O>> {
  try {
    const tx = base.transaction(['file', 'tournee'], 'readwrite');
    const file = tx.objectStore('file');
    return await dans(tx, async () => {
      const [instantane, operations] = await Promise.all([
        tx.objectStore('tournee').get(CLE_INSTANTANE),
        file.index('par_sequence').getAll(),
      ]);
      const sequence = (operations.at(-1)?.sequence ?? 0) + 1;
      const resultat = construire(
        reappliquer(instantane ?? tourneeVide(), operations),
        operations,
        sequence,
      );
      if (resultat.ok) await file.add(resultat.operation);
      return resultat;
    });
  } catch {
    // Disque plein, stockage bloqué, base fermée : le geste est refusé à
    // l'écran, jamais montré comme réussi (§4.1).
    return { ok: false, echec: { code: 'STOCKAGE', message: PHRASES.STOCKAGE! } };
  }
}

/**
 * « Annuler » pendant le sursis (§7). Sans risque : l'opération n'est jamais
 * partie tant que l'heure est avant `envoyableApres`.
 */
export async function annuler(
  base: BaseLocale,
  operationId: string,
  maintenant: number = Date.now(),
): Promise<'annulee' | 'partie' | 'absente'> {
  const tx = base.transaction('file', 'readwrite');
  return dans(tx, async () => {
    const op = await tx.store.get(operationId);
    if (!op) return 'absente' as const;
    if (Date.parse(op.envoyableApres) <= maintenant) return 'partie' as const;
    await tx.store.delete(operationId);
    return 'annulee' as const;
  });
}

/** Fait partir tout de suite une opération encore en sursis : la fiche se ferme, l'application passe en arrière-plan. */
export async function avancer(
  base: BaseLocale,
  operationId: string,
  maintenant: number = Date.now(),
): Promise<void> {
  const tx = base.transaction('file', 'readwrite');
  await dans(tx, async () => {
    const op = await tx.store.get(operationId);
    if (op && Date.parse(op.envoyableApres) > maintenant) {
      await tx.store.put({ ...op, envoyableApres: new Date(maintenant).toISOString() });
    }
  });
}

/** Réécrit une opération encore en file. Ne ressuscite jamais une opération retirée entre-temps. */
export async function mettreAJour(base: BaseLocale, op: Operation): Promise<void> {
  const tx = base.transaction('file', 'readwrite');
  await dans(tx, async () => {
    if (await tx.store.get(op.id)) await tx.store.put(op);
  });
}

/** Le serveur a l'opération : elle quitte la file et entre dans l'instantané, ensemble. */
export async function retirerAcceptee(base: BaseLocale, op: Operation): Promise<void> {
  const tx = base.transaction(['file', 'tournee'], 'readwrite');
  const tournee = tx.objectStore('tournee');
  await dans(tx, async () => {
    const instantane = (await tournee.get(CLE_INSTANTANE)) ?? tourneeVide();
    await tournee.put(appliquer(instantane, op), CLE_INSTANTANE);
    await tx.objectStore('file').delete(op.id);
  });
}

/** Le refus est consigné au serveur : l'opération quitte la file, sa copie reste lisible hors ligne. */
export async function retirerEnRefus(
  base: BaseLocale,
  op: Operation,
  maintenant: number = Date.now(),
): Promise<void> {
  const tx = base.transaction(['file', 'refus'], 'readwrite');
  await dans(tx, async () => {
    await tx.objectStore('refus').put({
      id: op.id,
      motif: op.motif ?? 'INCONNU',
      chargeUtile: chargeUtileDe(op),
      creeLe: new Date(maintenant).toISOString(),
    });
    await tx.objectStore('file').delete(op.id);
  });
}
```

Créer `apps/collecteur/src/hors-ligne/gestes.ts` :

```ts
import { MISES_PAR_CYCLE, validerMise } from '@kolek/core';

import { phraseEcriture, type EchecEcriture } from '../phrases';
import type { Construction } from './file';
import {
  VERSION_OPERATION,
  type Operation,
  type OperationCaisse,
  type OperationCarte,
  type OperationClientCarte,
  type OperationCommune,
  type OperationMise,
} from './modele';

/**
 * Ce que le téléphone vérifie avant d'accepter un geste, et l'opération qu'il en
 * tire (spec §7).
 *
 * Fonctions pures, appelées par `ajouter` dans la transaction qui écrit : elles
 * voient la tournée exactement telle que l'écran la montre, file comprise.
 *
 * Les vérifications reprennent celles du serveur qu'on peut tenir sans lui.
 * Chacune évite un refus qui tomberait plus tard, loin des yeux du collecteur,
 * sur une opération déjà montrée comme faite.
 */

/** `20260819010000_socle_bornes_texte.sql`, lignes 41 à 44. */
export const BORNES_CLIENT = { nom: 120, telephone: 32, marche: 80, activite: 80 } as const;

export interface ContexteGeste {
  collecteurId: string;
  maintenant: number;
  /** Le sursis de la fiche client : 6 000. Absent pour un envoi immédiat. */
  sursisMs?: number;
}

export interface ContexteInscription extends ContexteGeste {
  /** Le dernier `abonnement_statut` connu. `null` : jamais lu sur ce téléphone. */
  abonnementStatut: string | null;
}

export interface SaisieClient {
  nom: string;
  telephone?: string;
  marche?: string;
  activite?: string;
  mise: number;
  /** Faux par défaut : laisser un numéro n'est pas consentir à être notifié. */
  avisActifs?: boolean;
}

function refus(code: string): { ok: false; echec: EchecEcriture } {
  return { ok: false, echec: phraseEcriture(code) };
}

function commun(ctx: ContexteGeste, sequence: number, dependDe: string[]): OperationCommune {
  return {
    version: VERSION_OPERATION,
    id: crypto.randomUUID(),
    sequence,
    collecteurId: ctx.collecteurId,
    faiteLe: new Date(ctx.maintenant).toISOString(),
    envoyableApres: new Date(ctx.maintenant + (ctx.sursisMs ?? 0)).toISOString(),
    dependDe,
    etat: 'en_attente',
    tentatives: 0,
    prochainEssai: null,
  };
}

/** L'opération encore en file qui crée cette carte, s'il y en a une. */
function createurDeCarte(operations: readonly Operation[], carteId: string): string[] {
  const createur = operations.find(
    (o) =>
      o.etat === 'en_attente' &&
      ((o.type === 'client_carte' && o.charge.carte.id === carteId) ||
        (o.type === 'carte' && o.charge.id === carteId)),
  );
  return createur ? [createur.id] : [];
}

/** L'inscription encore en file qui crée ce client, s'il y en a une. */
function createurDeClient(operations: readonly Operation[], clientId: string): string[] {
  const createur = operations.find(
    (o) => o.etat === 'en_attente' && o.type === 'client_carte' && o.charge.client.id === clientId,
  );
  return createur ? [createur.id] : [];
}

/** L'abonnement ferme l'ajout de client et l'ouverture de carte, jamais l'encaissement (§7). */
function abonnementFerme(ctx: ContexteInscription): boolean {
  return ctx.abonnementStatut !== null && ctx.abonnementStatut !== 'actif';
}

export function construireMise(
  ctx: ContexteGeste,
  saisie: { carteId: string; montant: number; encaisseLe: Date },
): Construction<OperationMise> {
  return (tournee, operations, sequence) => {
    if (!validerMise(saisie.montant)) return refus('MISE_HORS_BORNES');
    const carte = tournee.cartes.find((c) => c.id === saisie.carteId);
    if (!carte) return refus('CARTE_ABSENTE');
    if (carte.statut !== 'active') return refus('CARTE_CLOTUREE');
    if (carte.misesEncaissees >= MISES_PAR_CYCLE) return refus('CYCLE_COMPLET');
    if (carte.mise !== saisie.montant) return refus('MONTANT_INVALIDE');

    return {
      ok: true,
      operation: {
        ...commun(ctx, sequence, createurDeCarte(operations, carte.id)),
        type: 'mise',
        charge: {
          id: crypto.randomUUID(),
          carteId: carte.id,
          montant: saisie.montant,
          encaisseLe: saisie.encaisseLe.toISOString(),
        },
      },
    };
  };
}

export function construireClientCarte(
  ctx: ContexteInscription,
  saisie: SaisieClient,
): Construction<OperationClientCarte> {
  return (_tournee, _operations, sequence) => {
    const nom = saisie.nom.trim();
    if (!nom) return refus('NOM_VIDE');
    if (!validerMise(saisie.mise)) return refus('MISE_HORS_BORNES');

    // `|| null` : le journal d'audit doit lire « le champ était vide ».
    const telephone = saisie.telephone?.trim() || null;
    const marche = saisie.marche?.trim() || null;
    const activite = saisie.activite?.trim() || null;

    // Les bornes du serveur, pour qu'aucun refus `BORNE` ne tombe sur un client
    // déjà montré dans la tournée (§7).
    if (
      nom.length > BORNES_CLIENT.nom ||
      (telephone?.length ?? 0) > BORNES_CLIENT.telephone ||
      (marche?.length ?? 0) > BORNES_CLIENT.marche ||
      (activite?.length ?? 0) > BORNES_CLIENT.activite
    ) {
      return refus('BORNE');
    }
    if (abonnementFerme(ctx)) return refus('ABONNEMENT_INACTIF');

    return {
      ok: true,
      operation: {
        ...commun(ctx, sequence, []),
        type: 'client_carte',
        charge: {
          client: {
            id: crypto.randomUUID(),
            nom,
            telephone,
            marche,
            activite,
            // Sans numéro, le consentement n'a pas d'objet.
            avisActifs: Boolean(saisie.avisActifs) && telephone !== null,
          },
          carte: { id: crypto.randomUUID(), mise: saisie.mise },
        },
        etapes: { client: false, carte: false },
      },
    };
  };
}

export function construireCarte(
  ctx: ContexteInscription,
  saisie: { clientId: string; mise: number },
): Construction<OperationCarte> {
  return (tournee, operations, sequence) => {
    if (!validerMise(saisie.mise)) return refus('MISE_HORS_BORNES');
    if (!tournee.clients.some((c) => c.id === saisie.clientId)) return refus('CLIENT_INTROUVABLE');
    if (abonnementFerme(ctx)) return refus('ABONNEMENT_INACTIF');

    return {
      ok: true,
      operation: {
        ...commun(ctx, sequence, createurDeClient(operations, saisie.clientId)),
        type: 'carte',
        charge: { id: crypto.randomUUID(), clientId: saisie.clientId, mise: saisie.mise },
      },
    };
  };
}

export function construireCaisse(
  ctx: ContexteGeste,
  saisie: { date: string; montant: number },
): Construction<OperationCaisse> {
  return (tournee, _operations, sequence) => {
    if (!Number.isInteger(saisie.montant) || saisie.montant < 0) return refus('CAISSE_INVALIDE');

    // Tirée à la première déclaration du jour, réutilisée ensuite (§6.4). La
    // tournée montrée porte déjà la ligne du serveur ou une déclaration en file.
    const id = tournee.caisses.find((c) => c.date === saisie.date)?.id ?? crypto.randomUUID();

    return {
      ok: true,
      operation: {
        ...commun(ctx, sequence, []),
        type: 'caisse',
        charge: { id, date: saisie.date, cashDeclare: saisie.montant },
      },
    };
  };
}
```

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/gestes.test.ts`
Attendu : PASS.

- [ ] **Étape 6 : écrire l'épreuve de la file (§9.2)**

**Corrigé après exécution (écart 21).** Le second appel à `avancer` passait `MAINTENANT` : une échéance qui n'est pas passée, que le code du plan avance à juste titre, et l'épreuve tombait. Il passe désormais `MAINTENANT + 2000`, l'assertion est inchangée.

Créer `apps/collecteur/src/hors-ligne/file.test.ts` :

```ts
import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

import { carte, client, operationMise, tournee } from './fabriques';
import { ajouter, annuler, avancer, mettreAJour, retirerAcceptee, retirerEnRefus } from './file';
import { construireMise } from './gestes';
import type { OperationMise } from './modele';
import {
  CLE_INSTANTANE,
  compterFile,
  fermerBases,
  lireOperations,
  lireRefus,
  lireTournee,
  ouvrirBase,
} from './stockage-local';

const MAINTENANT = Date.parse('2026-09-13T10:00:00.000Z');

beforeEach(async () => {
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
});

async function baseAvecUneCarte() {
  const base = await ouvrirBase('col-1');
  await base.put('tournee', tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')] }), CLE_INSTANTANE);
  return base;
}

const mise = (sursisMs?: number) =>
  construireMise(
    { collecteurId: 'col-1', maintenant: MAINTENANT, sursisMs },
    { carteId: 'k1', montant: 1000, encaisseLe: new Date(MAINTENANT) },
  );

describe('ajouter', () => {
  it('écrit l’opération, et la tournée lue la montre aussitôt', async () => {
    const base = await baseAvecUneCarte();

    const r = await ajouter(base, mise());

    expect(r.ok).toBe(true);
    expect((await lireTournee(base)).tournee.cartes[0]!.misesEncaissees).toBe(1);
  });

  it('numérote les opérations dans l’ordre du geste', async () => {
    const base = await baseAvecUneCarte();
    for (let i = 0; i < 3; i += 1) await ajouter(base, mise());

    expect((await lireOperations(base)).map((o) => o.sequence)).toEqual([1, 2, 3]);
  });

  it('vérifie le geste contre la tournée file comprise : la 32e mise est refusée', async () => {
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 30 })] }), CLE_INSTANTANE);

    expect((await ajouter(base, mise())).ok).toBe(true);
    expect(await ajouter(base, mise())).toMatchObject({ ok: false, echec: { code: 'CYCLE_COMPLET' } });
    expect(await compterFile(base)).toBe(1);
  });

  it('n’écrit rien et ne montre rien quand le disque refuse (§4.1)', async () => {
    const base = await baseAvecUneCarte();
    // Une fonction ne se clone pas : l'ajout échoue dans la transaction, comme
    // sur un disque plein.
    const empoisonnee = (() => {
      const r = mise()(tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')] }), [], 1);
      if (!r.ok) throw new Error('fabrique');
      return { ...r.operation, charge: { ...r.operation.charge, montant: (() => 1000) as unknown as number } };
    })();

    const r = await ajouter(base, () => ({ ok: true, operation: empoisonnee }));

    expect(r).toMatchObject({ ok: false, echec: { code: 'STOCKAGE' } });
    expect(await compterFile(base)).toBe(0);
    expect((await lireTournee(base)).tournee.cartes[0]!.misesEncaissees).toBe(0);
  });
});

describe('le sursis (§7)', () => {
  it('« Annuler » avant l’échéance retire l’opération, et la case se revide', async () => {
    const base = await baseAvecUneCarte();
    const r = await ajouter(base, mise(6000));
    if (!r.ok) throw new Error('ajout');

    expect(await annuler(base, r.operation.id, MAINTENANT + 3000)).toBe('annulee');
    expect(await compterFile(base)).toBe(0);
    expect((await lireTournee(base)).tournee.cartes[0]!.misesEncaissees).toBe(0);
  });

  it('refuse d’annuler une opération dont l’heure est passée', async () => {
    const base = await baseAvecUneCarte();
    const r = await ajouter(base, mise(6000));
    if (!r.ok) throw new Error('ajout');

    expect(await annuler(base, r.operation.id, MAINTENANT + 6000)).toBe('partie');
    expect(await compterFile(base)).toBe(1);
  });

  it('dit « absente » d’une opération déjà sortie de la file', async () => {
    expect(await annuler(await baseAvecUneCarte(), 'op-inconnue', MAINTENANT)).toBe('absente');
  });

  it('garde l’opération quand la page se recharge pendant le sursis (écart 4)', async () => {
    const base = await baseAvecUneCarte();
    await ajouter(base, mise(6000));

    await fermerBases();
    const rouverte = await ouvrirBase('col-1');

    expect(await compterFile(rouverte)).toBe(1);
    expect((await lireTournee(rouverte)).tournee.cartes[0]!.misesEncaissees).toBe(1);
  });

  it('« avancer » fait partir tout de suite, et ne recule jamais une échéance passée', async () => {
    const base = await baseAvecUneCarte();
    const r = await ajouter(base, mise(6000));
    if (!r.ok) throw new Error('ajout');

    await avancer(base, r.operation.id, MAINTENANT + 1000);
    expect((await lireOperations(base))[0]!.envoyableApres).toBe('2026-09-13T10:00:01.000Z');

    await avancer(base, r.operation.id, MAINTENANT + 2000);
    expect((await lireOperations(base))[0]!.envoyableApres).toBe('2026-09-13T10:00:01.000Z');
  });
});

describe('quitter la file', () => {
  it('ne ressuscite pas une opération annulée', async () => {
    const base = await baseAvecUneCarte();
    const op = operationMise(1, { carteId: 'k1' });

    await mettreAJour(base, op);

    expect(await compterFile(base)).toBe(0);
  });

  it('acceptée : quitte la file et entre dans l’instantané, ensemble', async () => {
    const base = await baseAvecUneCarte();
    const r = await ajouter(base, mise());
    if (!r.ok) throw new Error('ajout');

    await retirerAcceptee(base, r.operation);

    expect(await compterFile(base)).toBe(0);
    expect((await lireTournee(base)).tournee.cartes[0]!.misesEncaissees).toBe(1);
  });

  it('acceptée mais l’instantané ne s’écrit pas : l’opération reste en file', async () => {
    const base = await baseAvecUneCarte();
    const r = await ajouter(base, mise());
    if (!r.ok) throw new Error('ajout');
    const empoisonnee: OperationMise = {
      ...r.operation,
      charge: { ...r.operation.charge, encaisseLe: (() => 'x') as unknown as string },
    };

    await expect(retirerAcceptee(base, empoisonnee)).rejects.toThrow();

    expect(await compterFile(base)).toBe(1);
  });

  it('refusée et consignée : quitte la file, sa copie reste lisible', async () => {
    const base = await baseAvecUneCarte();
    const op = operationMise(1, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' });
    await base.add('file', op);

    await retirerEnRefus(base, op, MAINTENANT);

    expect(await compterFile(base)).toBe(0);
    expect(await lireRefus(base)).toEqual([
      {
        id: 'op-1',
        motif: 'CARTE_CLOTUREE',
        chargeUtile: {
          version: 1,
          type: 'mise',
          charge: op.charge,
          faiteLe: op.faiteLe,
          sequence: 1,
          dependDe: [],
        },
        creeLe: '2026-09-13T10:00:00.000Z',
      },
    ]);
  });
});

describe('deux collecteurs sur un téléphone (§4.5)', () => {
  it('ne voient jamais la file l’un de l’autre', async () => {
    const a = await baseAvecUneCarte();
    await ajouter(a, mise());

    const b = await ouvrirBase('col-2');

    expect(await compterFile(b)).toBe(0);
    expect((await lireTournee(b)).tournee.cartes).toEqual([]);
  });
});
```

- [ ] **Étape 7 : constater le vert**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/file.test.ts src/hors-ligne/gestes.test.ts`
Attendu : PASS. Si « ajouter » échoue sur la 32e mise, vérifier que `construireMise` lit bien la tournée **réappliquée** passée par `ajouter`.

- [ ] **Étape 8 : commit**

```bash
npx tsc -b apps/collecteur
npm run verifier:lint
git add apps/collecteur/src/phrases.ts apps/collecteur/src/phrases.test.ts apps/collecteur/src/ecritures.ts apps/collecteur/src/hors-ligne/gestes.ts apps/collecteur/src/hors-ligne/gestes.test.ts apps/collecteur/src/hors-ligne/file.ts apps/collecteur/src/hors-ligne/file.test.ts
git commit -m "feat(hors-ligne): la file, et les gestes verifies contre la tournee" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 6 : envoyer, relire, consigner

**Le code livré diffère de cette tâche.** Écart 19 (une réponse ne vaut preuve que sur son statut : 201 à l'insertion, 200 à la relecture, commit `e179931`) et écart 26 (une inscription rejouée se relit par `collecteur_id`, commit `e8713bf`). Le dépôt fait foi ; les blocs ci-dessous restent le plan d'origine.

**Fichiers :**
- Créer : `apps/collecteur/src/hors-ligne/envoyer.ts`, `apps/collecteur/src/hors-ligne/envoyer.test.ts`

**Interfaces :**
- Consomme : `classer`, `Portee` (tâche 3) ; `Operation` et ses variantes, `chargeUtileDe` (tâche 1).
- Produit :
  - `type Issue = { issue: 'acceptee' } | { issue: 'refusee'; motif: string } | { issue: 'passager' } | { issue: 'session' } | { issue: 'inconnue' }` ;
  - `envoyer(client: SupabaseClient, op: Operation, noterEtapes: (etapes: { client: boolean; carte: boolean }) => Promise<void>): Promise<Issue>` ;
  - `consigner(client: SupabaseClient, op: Operation): Promise<Issue>`.

- [ ] **Étape 1 : écrire l'épreuve**

Créer `apps/collecteur/src/hors-ligne/envoyer.test.ts` :

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { consigner, envoyer } from './envoyer';
import { operationCaisse, operationCarte, operationClientCarte, operationMise } from './fabriques';
import { chargeUtileDe } from './modele';

interface Reponse {
  error: { code?: string; message?: string } | null;
  status: number;
  data?: unknown;
}

const OK: Reponse = { error: null, status: 201, data: null };
const RESEAU: Reponse = { error: { code: '', message: 'TypeError: Failed to fetch' }, status: 0 };
const doublon = (contrainte: string): Reponse => ({
  error: { code: '23505', message: `duplicate key value violates unique constraint "${contrainte}"` },
  status: 409,
});
const metier = (code: string): Reponse => ({ error: { code: 'P0001', message: code }, status: 400 });
/** `mises_avant_insert` lève `DOUBLON` sous `23505`, que PostgREST rend en 409. */
const DOUBLON: Reponse = { error: { code: '23505', message: 'DOUBLON' }, status: 409 };
const lu = (data: unknown): Reponse => ({ error: null, status: 200, data });

/**
 * Un client supabase de poche : chaque table rend, dans l'ordre, les réponses
 * qu'on lui a données ; tout le reste réussit. Chaque geste est noté.
 */
function clientFactice(scenario: {
  insert?: Record<string, Reponse[]>;
  relire?: Record<string, Reponse[]>;
  update?: Reponse[];
}) {
  const appels: Array<{ table: string; geste: string; valeur?: unknown; filtres?: Array<[string, unknown]> }> = [];
  const suivante = (liste: Reponse[] | undefined, defaut: Reponse) => liste?.shift() ?? defaut;

  const client = {
    from(table: string) {
      return {
        insert(valeur: unknown) {
          appels.push({ table, geste: 'insert', valeur });
          return Promise.resolve(suivante(scenario.insert?.[table], OK));
        },
        select() {
          const filtres: Array<[string, unknown]> = [];
          const chaine = {
            eq: (colonne: string, valeur: unknown) => {
              filtres.push([colonne, valeur]);
              return chaine;
            },
            maybeSingle: () => {
              appels.push({ table, geste: 'relire', filtres });
              return Promise.resolve(suivante(scenario.relire?.[table], lu(null)));
            },
          };
          return chaine;
        },
        update(valeur: unknown) {
          const filtres: Array<[string, unknown]> = [];
          appels.push({ table, geste: 'update', valeur, filtres });
          const chaine = {
            eq: (colonne: string, v: unknown) => {
              filtres.push([colonne, v]);
              return chaine;
            },
            select: () => Promise.resolve(suivante(scenario.update, lu([{ id: 'ligne' }]))),
          };
          return chaine;
        },
      };
    },
  };

  return { client: client as unknown as SupabaseClient, appels };
}

const rien = async () => {};

describe('une mise', () => {
  const op = operationMise(1, { carteId: 'k1', montant: 2000 });

  it('envoie les colonnes d’aujourd’hui, jamais est_commission', async () => {
    const { client, appels } = clientFactice({});

    expect(await envoyer(client, op, rien)).toEqual({ issue: 'acceptee' });
    expect(appels).toEqual([
      {
        table: 'mises',
        geste: 'insert',
        valeur: {
          id: 'mise-1',
          collecteur_id: 'col-1',
          carte_id: 'k1',
          montant: 2000,
          encaisse_le: '2026-09-13T09:00:00.000Z',
        },
      },
    ]);
  });

  it('prend un DOUBLON relu à l’identique pour une mise arrivée (§6.3)', async () => {
    const { client, appels } = clientFactice({
      insert: { mises: [DOUBLON] },
      relire: { mises: [lu({ carte_id: 'k1', montant: 2000 })] },
    });

    expect(await envoyer(client, op, rien)).toEqual({ issue: 'acceptee' });
    expect(appels[1]).toMatchObject({ table: 'mises', geste: 'relire', filtres: [['id', 'mise-1']] });
  });

  it('refuse un DOUBLON dont la ligne diffère, ou reste invisible', async () => {
    const differente = clientFactice({
      insert: { mises: [DOUBLON] },
      relire: { mises: [lu({ carte_id: 'k2', montant: 2000 })] },
    });
    const invisible = clientFactice({ insert: { mises: [DOUBLON] } });

    expect(await envoyer(differente.client, op, rien)).toEqual({ issue: 'refusee', motif: 'DOUBLON_INVERIFIABLE' });
    expect(await envoyer(invisible.client, op, rien)).toEqual({ issue: 'refusee', motif: 'DOUBLON_INVERIFIABLE' });
  });

  it('ne conclut rien quand la relecture n’aboutit pas : c’est passager', async () => {
    const { client } = clientFactice({ insert: { mises: [DOUBLON] }, relire: { mises: [RESEAU] } });
    expect(await envoyer(client, op, rien)).toEqual({ issue: 'passager' });
  });

  it('refuse CARTE_CLOTUREE après avoir vérifié que la mise n’est pas déjà là', async () => {
    const { client, appels } = clientFactice({ insert: { mises: [metier('CARTE_CLOTUREE')] } });

    expect(await envoyer(client, op, rien)).toEqual({ issue: 'refusee', motif: 'CARTE_CLOTUREE' });
    expect(appels.map((a) => a.geste)).toEqual(['insert', 'relire']);
  });

  it('rend passager, session et inconnue tels quels, sans relire', async () => {
    const cas: Array<[Reponse, string]> = [
      [RESEAU, 'passager'],
      [{ error: { code: 'PGRST303', message: 'JWT expired' }, status: 401 }, 'session'],
      [{ error: { code: 'PGRST116', message: '?' }, status: 406 }, 'inconnue'],
    ];
    for (const [reponse, issue] of cas) {
      const { client, appels } = clientFactice({ insert: { mises: [reponse] } });
      expect(await envoyer(client, op, rien)).toEqual({ issue });
      expect(appels).toHaveLength(1);
    }
  });
});

describe('une inscription, en deux étapes', () => {
  const op = operationClientCarte(1, { clientId: 'c1', carteId: 'k1', nom: 'Awa', mise: 1500 });

  it('écrit le client puis la carte, et note chaque étape acceptée', async () => {
    const { client, appels } = clientFactice({});
    const noter = vi.fn(rien);

    expect(await envoyer(client, op, noter)).toEqual({ issue: 'acceptee' });
    expect(appels.map((a) => [a.table, a.valeur])).toEqual([
      [
        'clients',
        { id: 'c1', collecteur_id: 'col-1', nom: 'Awa', telephone: null, marche: null, activite: null, avis_actifs: false },
      ],
      ['cartes', { id: 'k1', collecteur_id: 'col-1', client_id: 'c1', mise: 1500 }],
    ]);
    expect(noter.mock.calls).toEqual([[{ client: true, carte: false }], [{ client: true, carte: true }]]);
  });

  it('reprend à la carte quand le client est déjà accepté', async () => {
    const { client, appels } = clientFactice({});
    const reprise = { ...op, etapes: { client: true, carte: false } };

    expect(await envoyer(client, reprise, rien)).toEqual({ issue: 'acceptee' });
    expect(appels.map((a) => a.table)).toEqual(['cartes']);
  });

  it('s’arrête au client refusé, sans tenter la carte', async () => {
    const refus: Reponse = {
      error: { code: '42501', message: 'new row violates row-level security policy for table "clients"' },
      status: 403,
    };
    const { client, appels } = clientFactice({ insert: { clients: [refus] } });

    expect(await envoyer(client, op, rien)).toEqual({ issue: 'refusee', motif: 'ABONNEMENT_INACTIF' });
    expect(appels.map((a) => a.geste)).toEqual(['insert', 'relire']);
  });

  it('prend pour arrivé un client refusé que la relecture trouve (précision 6)', async () => {
    const refus: Reponse = {
      error: { code: '42501', message: 'new row violates row-level security policy for table "clients"' },
      status: 403,
    };
    const { client } = clientFactice({
      insert: { clients: [refus] },
      relire: { clients: [lu({ nom: 'Awa' })] },
    });
    const noter = vi.fn(rien);

    expect(await envoyer(client, op, noter)).toEqual({ issue: 'acceptee' });
    expect(noter).toHaveBeenCalledWith({ client: true, carte: false });
  });

  it('reconnaît l’inscription rejouée par ses deux clés', async () => {
    const { client } = clientFactice({
      insert: { clients: [doublon('clients_pkey')], cartes: [doublon('cartes_pkey')] },
      relire: { clients: [lu({ nom: 'Awa' })], cartes: [lu({ client_id: 'c1', mise: 1500 })] },
    });

    expect(await envoyer(client, op, rien)).toEqual({ issue: 'acceptee' });
  });
});

describe('une carte de plus', () => {
  it('envoie les colonnes d’aujourd’hui', async () => {
    const { client, appels } = clientFactice({});

    await envoyer(client, operationCarte(1, { carteId: 'k2', clientId: 'c1', mise: 500 }), rien);

    expect(appels[0]).toEqual({
      table: 'cartes',
      geste: 'insert',
      valeur: { id: 'k2', collecteur_id: 'col-1', client_id: 'c1', mise: 500 },
    });
  });
});

describe('une déclaration de caisse (§6.4)', () => {
  const op = operationCaisse(1, { id: 'd1', date: '2026-09-13', cashDeclare: 7000 });

  it('insère avec l’identifiant tiré sur le téléphone', async () => {
    const { client, appels } = clientFactice({});

    expect(await envoyer(client, op, rien)).toEqual({ issue: 'acceptee' });
    expect(appels[0]!.valeur).toEqual({ id: 'd1', collecteur_id: 'col-1', date: '2026-09-13', cash_declare: 7000 });
  });

  it.each(['caisses_jour_pkey', 'caisses_jour_collecteur_id_date_key'])(
    'sur « %s », met à jour la ligne de cette date : la dernière déclaration gagne',
    async (contrainte) => {
      const { client, appels } = clientFactice({ insert: { caisses_jour: [doublon(contrainte)] } });

      expect(await envoyer(client, op, rien)).toEqual({ issue: 'acceptee' });
      expect(appels[1]).toEqual({
        table: 'caisses_jour',
        geste: 'update',
        valeur: { cash_declare: 7000 },
        filtres: [
          ['collecteur_id', 'col-1'],
          ['date', '2026-09-13'],
        ],
      });
    },
  );

  it('ne conclut pas au succès quand la mise à jour ne touche aucune ligne', async () => {
    const { client } = clientFactice({ insert: { caisses_jour: [doublon('caisses_jour_pkey')] }, update: [lu([])] });
    expect(await envoyer(client, op, rien)).toEqual({ issue: 'inconnue' });
  });

  it('corrige une journée hors fenêtre dont la ligne existe (précision 7)', async () => {
    const { client } = clientFactice({ insert: { caisses_jour: [metier('DATE_INVALIDE')] } });
    expect(await envoyer(client, op, rien)).toEqual({ issue: 'acceptee' });
  });

  it('refuse une journée hors fenêtre sans ligne', async () => {
    const { client } = clientFactice({ insert: { caisses_jour: [metier('DATE_INVALIDE')] }, update: [lu([])] });
    expect(await envoyer(client, op, rien)).toEqual({ issue: 'refusee', motif: 'DATE_INVALIDE' });
  });

  it('reste passagère quand la mise à jour n’aboutit pas', async () => {
    const { client } = clientFactice({ insert: { caisses_jour: [doublon('caisses_jour_pkey')] }, update: [RESEAU] });
    expect(await envoyer(client, op, rien)).toEqual({ issue: 'passager' });
  });
});

describe('consigner un refus (§6.5)', () => {
  const op = operationMise(3, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' });

  it('écrit la ligne sous l’identifiant de l’opération, charge intacte', async () => {
    const { client, appels } = clientFactice({});

    expect(await consigner(client, op)).toEqual({ issue: 'acceptee' });
    expect(appels[0]).toEqual({
      table: 'synchro_rejets',
      geste: 'insert',
      valeur: { id: 'op-3', collecteur_id: 'col-1', motif: 'CARTE_CLOTUREE', charge_utile: chargeUtileDe(op) },
    });
  });

  it('ne crée pas de seconde ligne : une consignation rejouée est reconnue', async () => {
    const { client } = clientFactice({
      insert: { synchro_rejets: [doublon('synchro_rejets_pkey')] },
      relire: { synchro_rejets: [lu({ motif: 'CARTE_CLOTUREE' })] },
    });

    expect(await consigner(client, op)).toEqual({ issue: 'acceptee' });
  });

  it('consigne sous INCONNU une opération sans motif', async () => {
    const { client, appels } = clientFactice({});
    await consigner(client, { ...op, motif: undefined });
    expect((appels[0]!.valeur as { motif: string }).motif).toBe('INCONNU');
  });
});
```

- [ ] **Étape 2 : constater l'échec**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/envoyer.test.ts`
Attendu : FAIL, « Failed to resolve import "./envoyer" ».

- [ ] **Étape 3 : écrire `envoyer`**

Créer `apps/collecteur/src/hors-ligne/envoyer.ts` :

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

import { classer, type Classement } from './classer';
import {
  chargeUtileDe,
  type Operation,
  type OperationCaisse,
  type OperationCarte,
  type OperationClientCarte,
  type OperationMise,
} from './modele';

/**
 * Envoyer une opération, et dire ce qu'il en est advenu.
 *
 * Chaque envoi est l'écriture d'aujourd'hui, colonne pour colonne (§5.5). Ce
 * module n'ajoute que deux choses :
 *
 * - **relire avant de conclure.** Un « déjà là » n'est cru qu'après relecture
 *   de la ligne par identifiant (§6.3). Un refus aussi : la ligne a pu arriver
 *   lors d'un envoi dont la réponse s'est perdue (précision 6 du plan) ;
 * - **la caisse en « dernière déclaration gagne »** (§6.4).
 *
 * Il ne touche jamais au stockage : c'est le synchroniseur qui décide de ce que
 * l'issue fait à la file.
 */

export type Issue =
  | { issue: 'acceptee' }
  | { issue: 'refusee'; motif: string }
  | { issue: 'passager' }
  | { issue: 'session' }
  | { issue: 'inconnue' };

type Relecture = 'meme' | 'differente' | 'absente' | 'illisible';

async function relire(
  client: SupabaseClient,
  table: string,
  id: string,
  attendu: Record<string, unknown>,
): Promise<Relecture> {
  const { data, error } = await client
    .from(table)
    .select(Object.keys(attendu).join(', '))
    .eq('id', id)
    .maybeSingle();
  if (error) return 'illisible';
  if (!data) return 'absente';
  const ligne = data as unknown as Record<string, unknown>;
  return Object.entries(attendu).every(([colonne, valeur]) => ligne[colonne] === valeur)
    ? 'meme'
    : 'differente';
}

async function resoudre(c: Classement, relecture: () => Promise<Relecture>): Promise<Issue> {
  switch (c.cas) {
    case 'accepte':
      return { issue: 'acceptee' };
    case 'session':
      return { issue: 'session' };
    case 'passager':
      return { issue: 'passager' };
    case 'inconnu':
    case 'mettre_a_jour':
      return { issue: 'inconnue' };
    case 'deja_la': {
      const r = await relecture();
      if (r === 'meme') return { issue: 'acceptee' };
      if (r === 'illisible') return { issue: 'passager' };
      // Valeurs différentes, ou ligne que la session ne voit pas : ce n'est pas
      // notre opération, ou on ne peut pas le prouver. Consigner, jamais conclure.
      return { issue: 'refusee', motif: 'DOUBLON_INVERIFIABLE' };
    }
    case 'refus': {
      const r = await relecture();
      if (r === 'meme') return { issue: 'acceptee' };
      if (r === 'illisible') return { issue: 'passager' };
      return { issue: 'refusee', motif: c.motif };
    }
  }
}

async function envoyerMise(client: SupabaseClient, op: OperationMise): Promise<Issue> {
  const { id, carteId, montant, encaisseLe } = op.charge;
  const r = await client
    .from('mises')
    .insert({ id, collecteur_id: op.collecteurId, carte_id: carteId, montant, encaisse_le: encaisseLe });
  return resoudre(classer(r, 'mise'), () => relire(client, 'mises', id, { carte_id: carteId, montant }));
}

async function envoyerClientCarte(
  client: SupabaseClient,
  op: OperationClientCarte,
  noterEtapes: (etapes: { client: boolean; carte: boolean }) => Promise<void>,
): Promise<Issue> {
  const { client: fiche, carte } = op.charge;
  let etapes = op.etapes;

  if (!etapes.client) {
    const r = await client.from('clients').insert({
      id: fiche.id,
      collecteur_id: op.collecteurId,
      nom: fiche.nom,
      telephone: fiche.telephone,
      marche: fiche.marche,
      activite: fiche.activite,
      avis_actifs: fiche.avisActifs,
    });
    const issue = await resoudre(classer(r, 'client'), () =>
      relire(client, 'clients', fiche.id, { nom: fiche.nom }),
    );
    if (issue.issue !== 'acceptee') return issue;
    etapes = { ...etapes, client: true };
    await noterEtapes(etapes);
  }

  if (!etapes.carte) {
    const r = await client
      .from('cartes')
      .insert({ id: carte.id, collecteur_id: op.collecteurId, client_id: fiche.id, mise: carte.mise });
    const issue = await resoudre(classer(r, 'carte'), () =>
      relire(client, 'cartes', carte.id, { client_id: fiche.id, mise: carte.mise }),
    );
    if (issue.issue !== 'acceptee') return issue;
    etapes = { ...etapes, carte: true };
    await noterEtapes(etapes);
  }

  return { issue: 'acceptee' };
}

async function envoyerCarte(client: SupabaseClient, op: OperationCarte): Promise<Issue> {
  const { id, clientId, mise } = op.charge;
  const r = await client
    .from('cartes')
    .insert({ id, collecteur_id: op.collecteurId, client_id: clientId, mise });
  return resoudre(classer(r, 'carte'), () =>
    relire(client, 'cartes', id, { client_id: clientId, mise }),
  );
}

async function envoyerCaisse(client: SupabaseClient, op: OperationCaisse): Promise<Issue> {
  const { id, date, cashDeclare } = op.charge;
  const r = await client
    .from('caisses_jour')
    .insert({ id, collecteur_id: op.collecteurId, date, cash_declare: cashDeclare });
  const c = classer(r, 'caisse');
  if (c.cas === 'accepte') return { issue: 'acceptee' };

  // La fenêtre de 90 jours n'est appliquée qu'à l'insertion : une journée
  // ancienne dont la ligne existe se corrige encore (précision 7).
  const horsFenetre = c.cas === 'refus' && c.motif === 'DATE_INVALIDE';
  if (c.cas !== 'mettre_a_jour' && !horsFenetre) return resoudre(c, async () => 'absente');

  const u = await client
    .from('caisses_jour')
    .update({ cash_declare: cashDeclare })
    .eq('collecteur_id', op.collecteurId)
    .eq('date', date)
    .select('id');
  const cu = classer(u, 'caisse');
  if (cu.cas !== 'accepte') return resoudre(cu, async () => 'absente');
  // Le `select` sert à compter : un `update` que RLS écarte répond sans erreur.
  if ((u.data ?? []).length > 0) return { issue: 'acceptee' };
  return horsFenetre ? { issue: 'refusee', motif: 'DATE_INVALIDE' } : { issue: 'inconnue' };
}

export function envoyer(
  client: SupabaseClient,
  op: Operation,
  noterEtapes: (etapes: { client: boolean; carte: boolean }) => Promise<void>,
): Promise<Issue> {
  switch (op.type) {
    case 'mise':
      return envoyerMise(client, op);
    case 'client_carte':
      return envoyerClientCarte(client, op, noterEtapes);
    case 'carte':
      return envoyerCarte(client, op);
    case 'caisse':
      return envoyerCaisse(client, op);
  }
}

/**
 * Écrit le refus dans `synchro_rejets`, sous l'identifiant de l'opération :
 * un rejeu tombe sur la clé et se relit, il ne crée pas de seconde ligne.
 * `traite` n'est jamais écrit ici : il appartient au rattrapage (§6.5).
 */
export async function consigner(client: SupabaseClient, op: Operation): Promise<Issue> {
  const motif = op.motif ?? 'INCONNU';
  const r = await client.from('synchro_rejets').insert({
    id: op.id,
    collecteur_id: op.collecteurId,
    motif,
    charge_utile: chargeUtileDe(op),
  });
  return resoudre(classer(r, 'consignation'), () =>
    relire(client, 'synchro_rejets', op.id, { motif }),
  );
}
```

- [ ] **Étape 4 : constater le vert**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/envoyer.test.ts`
Attendu : PASS.

- [ ] **Étape 5 : commit**

```bash
npx tsc -b apps/collecteur
git add apps/collecteur/src/hors-ligne/envoyer.ts apps/collecteur/src/hors-ligne/envoyer.test.ts
git commit -m "feat(hors-ligne): envoyer une operation, relire avant de conclure, consigner un refus" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 7 : le synchroniseur

**Le code livré diffère de cette tâche.** Écarts 27, 28 et 29 (identité revérifiée avant tout refus ; échéance impossible ramenée à maintenant ; enfants d'un parent refusé marqués dans la même transaction, commit `692f22d`). Le dépôt fait foi ; les blocs ci-dessous restent le plan d'origine.

**Fichiers :**
- Créer : `apps/collecteur/src/hors-ligne/synchroniseur.ts`, `apps/collecteur/src/hors-ligne/synchroniseur.test.ts`

**Interfaces :**
- Consomme : `envoyer`, `consigner`, `Issue` (tâche 6) ; `mettreAJour`, `retirerAcceptee`, `retirerEnRefus` (tâche 5) ; `lireOperations`, `lireRefus`, `BaseLocale` (tâche 4) ; `MARGE_SURSIS_MS`, `TENTATIVES_MAX`, `delaiApres` (tâche 1).
- Produit :
  - `interface Dependances { client: SupabaseClient; base: BaseLocale; collecteurId: string; maintenant?: () => number; envoyer?: typeof envoyer; consigner?: typeof consigner }` ;
  - `interface BilanPasse { etat: 'vide' | 'attente' | 'hors_ligne' | 'session_finie' | 'autre_compte'; reveil: number | null; traitees: number }` ;
  - `type EtatSession = 'ok' | 'passager' | 'finie' | 'autre_compte'` ;
  - `verifierSession(client, collecteurId): Promise<EtatSession>` et `renouvelerSession(client, collecteurId): Promise<EtatSession>` ;
  - `passe(deps: Dependances): Promise<BilanPasse>`.

- [ ] **Étape 1 : écrire l'épreuve (§9.2)**

Créer `apps/collecteur/src/hors-ligne/synchroniseur.test.ts` :

```ts
import 'fake-indexeddb/auto';

import { AuthRetryableFetchError, AuthSessionMissingError, type SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Issue } from './envoyer';
import { carte, client, operationClientCarte, operationMise, tournee } from './fabriques';
import type { Operation } from './modele';
import {
  CLE_INSTANTANE,
  fermerBases,
  lireOperations,
  lireRefus,
  lireTournee,
  ouvrirBase,
  type BaseLocale,
} from './stockage-local';
import { passe } from './synchroniseur';

const T = Date.parse('2026-09-13T09:00:00.000Z');

const accepte = vi.fn(async (..._args: unknown[]) => ({ issue: 'acceptee' as const }));

beforeEach(async () => {
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
  // Partagé par plusieurs épreuves : sans cette remise à zéro, « non appelé »
  // compterait les appels de l'épreuve précédente.
  accepte.mockClear();
});

function authFactice(options: {
  session?: { user: { id: string } } | null;
  erreur?: unknown;
  renouvellement?: { data: { session: { user: { id: string } } | null }; error: unknown };
} = {}) {
  const refreshSession = vi.fn(async () =>
    options.renouvellement ?? { data: { session: { user: { id: 'col-1' } } }, error: null },
  );
  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: options.session === undefined ? { user: { id: 'col-1' } } : options.session },
        error: options.erreur ?? null,
      })),
      refreshSession,
    },
  };
  return { client: client as unknown as SupabaseClient, refreshSession };
}

async function baseAvec(...operations: Operation[]): Promise<BaseLocale> {
  const base = await ouvrirBase('col-1');
  await base.put(
    'tournee',
    tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1'), carte('k2', 'c1')] }),
    CLE_INSTANTANE,
  );
  for (const op of operations) await base.add('file', op);
  return base;
}

/** Un envoi scénarisé : une issue par appel, dans l'ordre, puis « acceptée ». */
function envoiScenarise(...issues: Issue[]) {
  return vi.fn(async (_client: SupabaseClient, _op: Operation) => issues.shift() ?? { issue: 'acceptee' as const });
}

describe('une file vide', () => {
  it('ne demande même pas la session', async () => {
    const { client: c } = authFactice();
    const base = await baseAvec();

    expect(await passe({ client: c, base, collecteurId: 'col-1', maintenant: () => T })).toEqual({
      etat: 'vide',
      reveil: null,
      traitees: 0,
    });
    expect(c.auth.getSession).not.toHaveBeenCalled();
  });
});

describe('l’ordre (§6.6)', () => {
  it('envoie dans l’ordre du geste, retire, et porte chaque mise dans l’instantané', async () => {
    const base = await baseAvec(
      operationMise(2, { carteId: 'k1' }),
      operationMise(1, { carteId: 'k2' }),
      operationMise(3, { carteId: 'k1' }),
    );
    const envoyer = envoiScenarise();

    const bilan = await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer });

    expect(bilan).toEqual({ etat: 'vide', reveil: null, traitees: 3 });
    expect(envoyer.mock.calls.map(([, op]) => op.sequence)).toEqual([1, 2, 3]);
    const { tournee: t, operations } = await lireTournee(base);
    expect(operations).toEqual([]);
    expect(t.cartes.map((k) => k.misesEncaissees)).toEqual([2, 1]);
  });

  it('s’arrête au premier échec passager : les suivantes attendent', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }), operationMise(2, { carteId: 'k1' }));
    const envoyer = envoiScenarise({ issue: 'passager' });

    const bilan = await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer });

    expect(bilan.etat).toBe('hors_ligne');
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect(await lireOperations(base)).toHaveLength(2);
  });
});

describe('le sursis (§7)', () => {
  it('attend la fin du sursis et sa marge avant d’envoyer', async () => {
    const op = operationMise(1, { carteId: 'k1' }, { envoyableApres: '2026-09-13T09:00:06.000Z' });
    const base = await baseAvec(op);

    const bilan = await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T + 6000, envoyer: accepte });

    expect(bilan).toEqual({ etat: 'attente', reveil: T + 7000, traitees: 0 });
    expect(accepte).not.toHaveBeenCalled();
  });

  it('envoie tout de suite une opération sans sursis', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }));
    const envoyer = envoiScenarise();

    await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer });

    expect(envoyer).toHaveBeenCalledTimes(1);
  });
});

describe('les refus', () => {
  it('consigne la chaîne dépendante en bloc, sans jamais envoyer l’enfant (§6.6)', async () => {
    const inscription = operationClientCarte(1, { clientId: 'c9', carteId: 'k9' });
    const miseEnfant = operationMise(2, { carteId: 'k9' }, { dependDe: ['op-1'] });
    const base = await baseAvec(inscription, miseEnfant);
    const envoyer = envoiScenarise({ issue: 'refusee', motif: 'ABONNEMENT_INACTIF' });
    const consigner = vi.fn(async () => ({ issue: 'acceptee' as const }));

    const bilan = await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer, consigner });

    expect(bilan).toMatchObject({ etat: 'vide', traitees: 4 });
    expect(envoyer).toHaveBeenCalledTimes(1);
    expect((await lireRefus(base)).map((r) => [r.id, r.motif]).sort()).toEqual([
      ['op-1', 'ABONNEMENT_INACTIF'],
      ['op-2', 'PARENT_REFUSE'],
    ]);
  });

  it('marque l’enfant d’un parent déjà consigné lors d’une passe précédente', async () => {
    const base = await baseAvec(operationMise(2, { carteId: 'k9' }, { dependDe: ['op-1'] }));
    await base.put('refus', {
      id: 'op-1',
      motif: 'ABONNEMENT_INACTIF',
      chargeUtile: { version: 1, type: 'client_carte', charge: operationClientCarte(1, { clientId: 'c9', carteId: 'k9' }).charge, faiteLe: 'x', sequence: 1, dependDe: [] },
      creeLe: 'x',
    });
    const envoyer = envoiScenarise();

    await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer, consigner: accepte });

    expect(envoyer).not.toHaveBeenCalled();
    expect((await lireRefus(base)).find((r) => r.id === 'op-2')?.motif).toBe('PARENT_REFUSE');
  });

  it('ne laisse pas une consignation impossible bloquer la file (précision 5)', async () => {
    const refusee = operationMise(1, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' });
    const suivante = operationMise(2, { carteId: 'k2' });
    const base = await baseAvec(refusee, suivante);
    const consigner = vi.fn(async () => ({ issue: 'refusee' as const, motif: 'DROIT_REFUSE' }));
    const envoyer = envoiScenarise();

    await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer, consigner });

    expect(envoyer).toHaveBeenCalledTimes(1);
    const reste = await lireOperations(base);
    expect(reste).toHaveLength(1);
    expect(reste[0]).toMatchObject({ id: 'op-1', etat: 'refusee_a_consigner', tentatives: 1, prochainEssai: '2026-09-13T09:00:30.000Z' });
  });

  it('consigne INCONNU à la cinquième tentative, 8 min 30 s après la première, puis continue', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }), operationMise(2, { carteId: 'k2' }));
    const envoyer = vi.fn(async (_c: SupabaseClient, op: Operation) =>
      op.id === 'op-1' ? { issue: 'inconnue' as const } : { issue: 'acceptee' as const },
    );
    let horloge = T;
    const deps = { client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => horloge, envoyer, consigner: accepte };

    const reveils: Array<number | null> = [];
    for (const decalage of [0, 30_000, 90_000, 210_000]) {
      horloge = T + decalage;
      reveils.push((await passe(deps)).reveil);
    }
    expect(reveils).toEqual([T + 30_000, T + 90_000, T + 210_000, T + 510_000]);

    horloge = T + 510_000;
    const bilan = await passe(deps);

    expect(bilan.etat).toBe('vide');
    expect(envoyer).toHaveBeenCalledTimes(6);
    expect((await lireRefus(base)).map((r) => r.motif)).toEqual(['INCONNU']);
  });

  it('n’essaie pas plus tôt que prévu, même relancé', async () => {
    const op = operationMise(1, { carteId: 'k1' }, { tentatives: 1, prochainEssai: '2026-09-13T09:00:30.000Z' });
    const base = await baseAvec(op);
    const envoyer = envoiScenarise();

    const bilan = await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T + 1000, envoyer });

    expect(bilan).toMatchObject({ etat: 'attente', reveil: T + 30_000 });
    expect(envoyer).not.toHaveBeenCalled();
  });
});

describe('la session (§4.5)', () => {
  it('n’envoie jamais sous une autre identité', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }));
    const { client: c } = authFactice({ session: { user: { id: 'col-2' } } });

    expect((await passe({ client: c, base, collecteurId: 'col-1', maintenant: () => T, envoyer: accepte })).etat).toBe('autre_compte');
    expect(accepte).not.toHaveBeenCalled();
  });

  it('attend le réseau quand le jeton ne peut pas être renouvelé faute de réseau', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }));
    const { client: c } = authFactice({ session: null, erreur: new AuthRetryableFetchError('Failed to fetch', 0) });

    expect((await passe({ client: c, base, collecteurId: 'col-1', maintenant: () => T })).etat).toBe('hors_ligne');
    expect(await lireOperations(base)).toHaveLength(1);
  });

  it('s’arrête sur une session finie, et garde la file', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }));
    const { client: c } = authFactice({
      session: null,
      renouvellement: { data: { session: null }, error: new AuthSessionMissingError() },
    });

    expect((await passe({ client: c, base, collecteurId: 'col-1', maintenant: () => T })).etat).toBe('session_finie');
    expect(await lireOperations(base)).toHaveLength(1);
  });

  it('renouvelle le jeton expiré en cours d’envoi, puis reprend', async () => {
    const base = await baseAvec(operationMise(1, { carteId: 'k1' }));
    const { client: c, refreshSession } = authFactice();
    const envoyer = envoiScenarise({ issue: 'session' });

    const bilan = await passe({ client: c, base, collecteurId: 'col-1', maintenant: () => T, envoyer });

    expect(bilan.etat).toBe('vide');
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(envoyer).toHaveBeenCalledTimes(2);
  });
});

describe('la mémoire des étapes', () => {
  it('garde le client accepté même quand la carte n’a pas pu partir', async () => {
    const base = await baseAvec(operationClientCarte(1, { clientId: 'c9', carteId: 'k9' }));
    const envoyer = vi.fn(async (_c: SupabaseClient, _op: Operation, noter: (e: { client: boolean; carte: boolean }) => Promise<void>) => {
      await noter({ client: true, carte: false });
      return { issue: 'passager' as const };
    });

    await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer });

    const [op] = await lireOperations(base);
    expect(op).toMatchObject({ type: 'client_carte', etapes: { client: true, carte: false } });
  });
});

describe('une opération de version 1, écrite par une version antérieure (§9.2)', () => {
  it('est lue et envoyée par le code courant', async () => {
    const base = await baseAvec();
    // Littéral figé : la forme exacte qu'une version 1 publiée écrit sur le disque.
    await base.add('file', {
      version: 1,
      id: 'ancienne',
      sequence: 1,
      collecteurId: 'col-1',
      type: 'mise',
      charge: { id: 'm-ancienne', carteId: 'k1', montant: 1000, encaisseLe: '2026-09-01T08:00:00.000Z' },
      faiteLe: '2026-09-01T08:00:00.000Z',
      envoyableApres: '2026-09-01T08:00:00.000Z',
      dependDe: [],
      etat: 'en_attente',
      tentatives: 0,
      prochainEssai: null,
    });
    const envoyer = envoiScenarise();

    expect((await passe({ client: authFactice().client, base, collecteurId: 'col-1', maintenant: () => T, envoyer })).etat).toBe('vide');
    expect(envoyer.mock.calls[0]![1]).toMatchObject({ id: 'ancienne', charge: { montant: 1000 } });
  });
});
```

- [ ] **Étape 2 : constater l'échec**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/synchroniseur.test.ts`
Attendu : FAIL, « Failed to resolve import "./synchroniseur" ».

- [ ] **Étape 3 : écrire le synchroniseur**

Créer `apps/collecteur/src/hors-ligne/synchroniseur.ts` :

```ts
import { isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';

import { consigner, envoyer } from './envoyer';
import { mettreAJour, retirerAcceptee, retirerEnRefus } from './file';
import { MARGE_SURSIS_MS, TENTATIVES_MAX, delaiApres, type Operation } from './modele';
import { lireOperations, lireRefus, type BaseLocale } from './stockage-local';

/**
 * Une passe : vider la file, dans l'ordre, jusqu'à ce qu'on ne puisse plus.
 *
 * Spec §6. Ce que la passe garantit :
 *
 * 1. **Rien ne part sans session, ni sous une autre identité** (§4.5). Sans
 *    session, supabase-js envoie la clé anonyme, RLS refuse en `42501`, et une
 *    opération valide serait consignée à tort.
 * 2. **L'ordre est strict entre opérations en attente.** Un échec passager
 *    arrête la passe ; une réponse inconnue aussi, jusqu'à la 5ᵉ tentative.
 * 3. **Un parent refusé emporte ses enfants**, qui ne partent jamais seuls.
 * 4. **Un refus connu ne bloque pas la file** (précision 5 du plan) : sa
 *    consignation est réessayée à part, sans fin, et rien n'est retiré tant
 *    qu'elle n'a pas réussi.
 *
 * La passe ne programme rien : elle dit quand revenir (`reveil`) et le
 * planificateur s'en charge.
 */

export interface Dependances {
  client: SupabaseClient;
  base: BaseLocale;
  collecteurId: string;
  maintenant?: () => number;
  /** Injectables pour les épreuves ; sinon les vrais. */
  envoyer?: typeof envoyer;
  consigner?: typeof consigner;
}

export interface BilanPasse {
  etat: 'vide' | 'attente' | 'hors_ligne' | 'session_finie' | 'autre_compte';
  /** Pour `attente` : l'heure à laquelle la file aura de nouveau du travail. */
  reveil: number | null;
  /** Opérations sorties de la file, ou passées en refus, pendant la passe. */
  traitees: number;
}

export type EtatSession = 'ok' | 'passager' | 'finie' | 'autre_compte';

const DE_SESSION: Record<Exclude<EtatSession, 'ok'>, BilanPasse['etat']> = {
  passager: 'hors_ligne',
  finie: 'session_finie',
  autre_compte: 'autre_compte',
};

/**
 * La session, sans conclure trop vite.
 *
 * Hors ligne, un jeton expiré rend `session: null` **avec** une erreur
 * `AuthRetryableFetchError` : la session existe encore, c'est le réseau qui
 * manque. Seul un renouvellement refusé pour une autre raison la déclare finie.
 */
export async function verifierSession(
  client: SupabaseClient,
  collecteurId: string,
): Promise<EtatSession> {
  const { data, error } = await client.auth.getSession();
  if (data.session) return data.session.user.id === collecteurId ? 'ok' : 'autre_compte';
  if (error && isAuthRetryableFetchError(error)) return 'passager';
  return renouvelerSession(client, collecteurId);
}

export async function renouvelerSession(
  client: SupabaseClient,
  collecteurId: string,
): Promise<EtatSession> {
  const { data, error } = await client.auth.refreshSession();
  if (error) return isAuthRetryableFetchError(error) ? 'passager' : 'finie';
  if (!data.session) return 'finie';
  return data.session.user.id === collecteurId ? 'ok' : 'autre_compte';
}

function estDue(op: Operation, t: number): boolean {
  return op.prochainEssai === null || Date.parse(op.prochainEssai) <= t;
}

/** L'heure où l'opération peut partir. Un sursis gagne sa marge ; un envoi immédiat, non. */
function envoyableA(op: Operation): number {
  const apres = Date.parse(op.envoyableApres);
  return apres > Date.parse(op.faiteLe) ? apres + MARGE_SURSIS_MS : apres;
}

export async function passe(deps: Dependances): Promise<BilanPasse> {
  const maintenant = deps.maintenant ?? Date.now;
  const envoyerOp = deps.envoyer ?? envoyer;
  const consignerOp = deps.consigner ?? consigner;
  let traitees = 0;
  const bilan = (etat: BilanPasse['etat'], reveil: number | null = null): BilanPasse => ({
    etat,
    reveil,
    traitees,
  });

  if ((await lireOperations(deps.base)).length === 0) return bilan('vide');

  const session = await verifierSession(deps.client, deps.collecteurId);
  if (session !== 'ok') return bilan(DE_SESSION[session]);

  /** Un renouvellement par opération et par passe ; au-delà, on revient plus tard. */
  const renouvelees = new Set<string>();
  async function apresSession(op: Operation): Promise<BilanPasse | null> {
    if (renouvelees.has(op.id)) return bilan('attente', maintenant() + delaiApres(1));
    renouvelees.add(op.id);
    const etat = await renouvelerSession(deps.client, deps.collecteurId);
    return etat === 'ok' ? null : bilan(DE_SESSION[etat]);
  }

  for (;;) {
    const operations = await lireOperations(deps.base);
    if (operations.length === 0) return bilan('vide');
    const t = maintenant();

    // 1. Les refus déjà connus partent au serveur.
    const aConsigner = operations.find((o) => o.etat === 'refusee_a_consigner' && estDue(o, t));
    if (aConsigner) {
      const issue = await consignerOp(deps.client, aConsigner);
      if (issue.issue === 'acceptee') {
        await retirerEnRefus(deps.base, aConsigner, maintenant());
        traitees += 1;
        continue;
      }
      if (issue.issue === 'passager') return bilan('hors_ligne');
      if (issue.issue === 'session') {
        const arret = await apresSession(aConsigner);
        if (arret) return arret;
        continue;
      }
      // La consignation elle-même est refusée : on ne retire rien, la charge
      // reste sur le téléphone, et on réessaie plus tard sans bloquer la file.
      const tentatives = aConsigner.tentatives + 1;
      await mettreAJour(deps.base, {
        ...aConsigner,
        tentatives,
        prochainEssai: new Date(maintenant() + delaiApres(tentatives)).toISOString(),
      });
      continue;
    }

    // 2. La première opération en attente.
    const courante = operations.find((o) => o.etat === 'en_attente');
    if (!courante) {
      const prochains = operations
        .map((o) => (o.prochainEssai ? Date.parse(o.prochainEssai) : Number.POSITIVE_INFINITY))
        .filter(Number.isFinite);
      return bilan('attente', prochains.length > 0 ? Math.min(...prochains) : null);
    }
    if (t < envoyableA(courante)) return bilan('attente', envoyableA(courante));
    if (!estDue(courante, t)) return bilan('attente', Date.parse(courante.prochainEssai!));

    // 3. Un parent refusé : l'enfant est consigné avec lui, jamais envoyé.
    const refuses = new Set([
      ...(await lireRefus(deps.base)).map((r) => r.id),
      ...operations.filter((o) => o.etat === 'refusee_a_consigner').map((o) => o.id),
    ]);
    if (courante.dependDe.some((id) => refuses.has(id))) {
      await mettreAJour(deps.base, {
        ...courante,
        etat: 'refusee_a_consigner',
        motif: 'PARENT_REFUSE',
        tentatives: 0,
        prochainEssai: null,
      });
      traitees += 1;
      continue;
    }

    // 4. L'envoi.
    let op: Operation = courante;
    const issue = await envoyerOp(deps.client, op, async (etapes) => {
      if (op.type !== 'client_carte') return;
      op = { ...op, etapes };
      await mettreAJour(deps.base, op);
    });

    switch (issue.issue) {
      case 'acceptee':
        await retirerAcceptee(deps.base, op);
        traitees += 1;
        continue;
      case 'refusee':
        await mettreAJour(deps.base, {
          ...op,
          etat: 'refusee_a_consigner',
          motif: issue.motif,
          tentatives: 0,
          prochainEssai: null,
        });
        traitees += 1;
        continue;
      case 'passager':
        return bilan('hors_ligne');
      case 'session': {
        const arret = await apresSession(op);
        if (arret) return arret;
        continue;
      }
      case 'inconnue': {
        const tentatives = op.tentatives + 1;
        if (tentatives >= TENTATIVES_MAX) {
          await mettreAJour(deps.base, {
            ...op,
            tentatives,
            etat: 'refusee_a_consigner',
            motif: 'INCONNU',
            prochainEssai: null,
          });
          traitees += 1;
          continue;
        }
        const prochain = maintenant() + delaiApres(tentatives);
        await mettreAJour(deps.base, { ...op, tentatives, prochainEssai: new Date(prochain).toISOString() });
        return bilan('attente', prochain);
      }
    }
  }
}
```

- [ ] **Étape 4 : constater le vert**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/synchroniseur.test.ts`
Attendu : PASS. L'épreuve de la chaîne dépendante compte `traitees: 4` : deux passages en refus, deux consignations.

- [ ] **Étape 5 : commit**

```bash
npx tsc -b apps/collecteur
git add apps/collecteur/src/hors-ligne/synchroniseur.ts apps/collecteur/src/hors-ligne/synchroniseur.test.ts
git commit -m "feat(hors-ligne): le synchroniseur, dans l'ordre, sans jamais rien retirer sans preuve" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 8 : recharger la tournée

**Le code livré diffère de cette tâche.** Écart 30 (une lecture ne vaut preuve que sur 200 ou 206, commit `51b0dcd`), écart 48 (`519e6d1`) et la trace des pannes du rafraîchissement (même commit). Le dépôt fait foi ; les blocs ci-dessous restent le plan d'origine.

**Fichiers :**
- Créer : `apps/collecteur/src/hors-ligne/rafraichir.ts`, `apps/collecteur/src/hors-ligne/rafraichir.test.ts`

**Interfaces :**
- Consomme : `chargerTout` (`apps/collecteur/src/pagination.ts`) ; `tableFactice` et son `in` (tâche 1) ; `CLE_INSTANTANE`, `CLE_PROFIL`, `dans`, `BaseLocale` (tâche 4).
- Produit : `TAILLE_LOT_IN = 50`, `rafraichir(client: SupabaseClient, base: BaseLocale, collecteurId: string, maintenant?: number): Promise<'fait' | 'impossible'>`.

- [ ] **Étape 1 : écrire l'épreuve**

Créer `apps/collecteur/src/hors-ligne/rafraichir.test.ts` :

```ts
import 'fake-indexeddb/auto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';

import { tableFactice, type Ligne } from '../postgrest-factice';
import { client, operationMise, tournee } from './fabriques';
import { rafraichir } from './rafraichir';
import { CLE_INSTANTANE, compterFile, fermerBases, lireProfil, lireRefus, lireTournee, ouvrirBase } from './stockage-local';

const MAINTENANT = Date.parse('2026-09-13T10:00:00.000Z');
/** Deux jours avant : hors de « la journée en cours » quel que soit le fuseau du poste. */
const AVANT = '2026-09-11T10:00:00.000Z';
const DU_JOUR = '2026-09-13T08:00:00.000Z';
const rang = (i: number) => String(i).padStart(4, '0');

const COLLECTEUR = { id: 'col-1', nom: 'Awa', telephone: '+2250700000000', zone: null, palier: 'pro', abonnement_statut: 'actif', abonnement_echeance: '2026-10-01', titulaire_id: null };

let tables: Record<string, unknown>;

function clientFactice(): SupabaseClient {
  return { from: (table: string) => tables[table] ?? tableFactice([]) } as unknown as SupabaseClient;
}

/** Une table en panne : toute requête rend une erreur. */
function tablePanne() {
  const reponse = { data: null, error: { message: 'panne' }, count: null };
  const chaine = Object.assign(Promise.resolve(reponse), {}) as unknown as Record<string, unknown>;
  for (const methode of ['select', 'eq', 'gte', 'in', 'order', 'range', 'limit']) chaine[methode] = () => chaine;
  chaine.maybeSingle = () => Promise.resolve(reponse);
  return chaine;
}

/** Une table qui compte plus de lignes qu'elle n'en rend. */
function tableComptee(lignes: Ligne[], count: number) {
  const chaine = {
    select: () => chaine,
    order: () => chaine,
    range: (debut: number, fin: number) =>
      Promise.resolve({ data: lignes.slice(debut, fin + 1), error: null, count }),
  };
  return chaine;
}

beforeEach(async () => {
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
  tables = { collecteurs: tableFactice([COLLECTEUR]) };
});

describe('ce qui est chargé (§5.1)', () => {
  it('charge tout au-delà de mille lignes, mises des cartes actives comprises', async () => {
    const n = 1001;
    tables.clients = tableFactice(Array.from({ length: n }, (_, i) => ({ id: `c${rang(i)}`, nom: `Client ${rang(i)}`, telephone: null, marche: null, activite: null, avis_actifs: false })));
    tables.cartes = tableFactice(Array.from({ length: n }, (_, i) => ({ id: `k${rang(i)}`, client_id: `c${rang(i)}`, mise: 500, statut: 'active', mises_encaissees: 1, ouverte_le: AVANT, cloturee_le: null })));
    tables.mises = tableFactice(Array.from({ length: n }, (_, i) => ({ id: `m${rang(i)}`, carte_id: `k${rang(i)}`, montant: 500, encaisse_le: AVANT, est_commission: true })));
    tables.retraits = tableFactice(Array.from({ length: n }, (_, i) => ({ id: `r${rang(i)}`, carte_id: `x${rang(i)}`, montant_restitue: 10, effectue_le: DU_JOUR })));
    const base = await ouvrirBase('col-1');

    expect(await rafraichir(clientFactice(), base, 'col-1', MAINTENANT)).toBe('fait');

    const { tournee: t } = await lireTournee(base);
    expect([t.clients.length, t.cartes.length, t.mises.length, t.retraits.length]).toEqual([n, n, n, n]);
    expect(t.lueLe).toBe('2026-09-13T10:00:00.000Z');
  });

  it('copie les mises du jour d’une carte clôturée, pas celles d’avant', async () => {
    tables.cartes = tableFactice([{ id: 'k1', client_id: 'c1', mise: 500, statut: 'cloturee', mises_encaissees: 2, ouverte_le: AVANT, cloturee_le: DU_JOUR }]);
    tables.mises = tableFactice([
      { id: 'ancienne', carte_id: 'k1', montant: 500, encaisse_le: AVANT, est_commission: true },
      { id: 'du-jour', carte_id: 'k1', montant: 500, encaisse_le: DU_JOUR, est_commission: false },
    ]);
    const base = await ouvrirBase('col-1');

    await rafraichir(clientFactice(), base, 'col-1', MAINTENANT);

    expect((await lireTournee(base)).tournee.mises.map((m) => m.id)).toEqual(['du-jour']);
  });

  it('ne copie pas deux fois la mise du jour d’une carte active', async () => {
    tables.cartes = tableFactice([{ id: 'k1', client_id: 'c1', mise: 500, statut: 'active', mises_encaissees: 1, ouverte_le: AVANT, cloturee_le: null }]);
    tables.mises = tableFactice([{ id: 'm1', carte_id: 'k1', montant: 500, encaisse_le: DU_JOUR, est_commission: true }]);
    const base = await ouvrirBase('col-1');

    await rafraichir(clientFactice(), base, 'col-1', MAINTENANT);

    expect((await lireTournee(base)).tournee.mises).toHaveLength(1);
  });

  it('garde le profil et remplace les refus par ceux du serveur', async () => {
    tables.caisses_jour = tableFactice([{ id: 'd1', date: '2026-09-13', cash_attendu: 1000, cash_declare: 900, ecart: -100 }]);
    tables.synchro_rejets = tableFactice([{ id: 'op-9', motif: 'CARTE_CLOTUREE', charge_utile: { version: 1 }, cree_le: DU_JOUR, traite: false }]);
    const base = await ouvrirBase('col-1');
    await base.put('refus', { id: 'vieux', motif: 'X', chargeUtile: { version: 1, type: 'mise', charge: operationMise(1, { carteId: 'k' }).charge, faiteLe: 'x', sequence: 1, dependDe: [] }, creeLe: 'x' });

    await rafraichir(clientFactice(), base, 'col-1', MAINTENANT);

    expect(await lireProfil(base)).toEqual({
      nom: 'Awa',
      telephone: '+2250700000000',
      zone: null,
      palier: 'pro',
      abonnementStatut: 'actif',
      abonnementEcheance: '2026-10-01',
      titulaireId: null,
      lueLe: '2026-09-13T10:00:00.000Z',
    });
    expect((await lireRefus(base)).map((r) => r.id)).toEqual(['op-9']);
    expect((await lireTournee(base)).tournee.caisses).toEqual([
      { id: 'd1', date: '2026-09-13', cashAttendu: 1000, cashDeclare: 900, ecart: -100 },
    ]);
  });
});

describe('ce qui n’est jamais écrit', () => {
  async function baseAvecAncienInstantane() {
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ clients: [client('c-hier')] }), CLE_INSTANTANE);
    return base;
  }

  it('une tournée amputée : une lecture en panne, et rien ne change', async () => {
    tables.cartes = tablePanne();
    const base = await baseAvecAncienInstantane();

    expect(await rafraichir(clientFactice(), base, 'col-1', MAINTENANT)).toBe('impossible');
    expect((await lireTournee(base)).tournee.clients.map((c) => c.id)).toEqual(['c-hier']);
  });

  it('une liste que le serveur dit plus longue que ce qu’il a rendu (précision 11)', async () => {
    tables.clients = tableComptee([{ id: 'c1', nom: 'A', telephone: null, marche: null, activite: null, avis_actifs: false }], 1200);
    const base = await baseAvecAncienInstantane();

    expect(await rafraichir(clientFactice(), base, 'col-1', MAINTENANT)).toBe('impossible');
    expect((await lireTournee(base)).tournee.clients.map((c) => c.id)).toEqual(['c-hier']);
  });

  it('une tournée sans fiche de collecteur', async () => {
    tables.collecteurs = tableFactice([]);
    const base = await baseAvecAncienInstantane();

    expect(await rafraichir(clientFactice(), base, 'col-1', MAINTENANT)).toBe('impossible');
  });

  it('la file : elle n’est jamais touchée, et reste montrée par-dessus', async () => {
    tables.clients = tableFactice([{ id: 'c1', nom: 'A', telephone: null, marche: null, activite: null, avis_actifs: false }]);
    tables.cartes = tableFactice([{ id: 'k1', client_id: 'c1', mise: 1000, statut: 'active', mises_encaissees: 0, ouverte_le: AVANT, cloturee_le: null }]);
    const base = await ouvrirBase('col-1');
    await base.add('file', operationMise(1, { carteId: 'k1' }));

    await rafraichir(clientFactice(), base, 'col-1', MAINTENANT);

    expect(await compterFile(base)).toBe(1);
    expect((await lireTournee(base)).tournee.cartes[0]!.misesEncaissees).toBe(1);
  });
});
```

- [ ] **Étape 2 : constater l'échec**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/rafraichir.test.ts`
Attendu : FAIL, « Failed to resolve import "./rafraichir" ».

- [ ] **Étape 3 : écrire `rafraichir`**

Créer `apps/collecteur/src/hors-ligne/rafraichir.ts` :

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

import { chargerTout } from '../pagination';
import type { CarteLocale, ChargeUtileRefus, MiseLocale, ProfilLocal, Tournee } from './modele';
import { CLE_INSTANTANE, CLE_PROFIL, dans, type BaseLocale } from './stockage-local';

/**
 * Recharger l'instantané, le profil et les refus depuis le serveur (§5.2).
 *
 * **Tout ou rien.** Une lecture en panne, une liste que le serveur dit plus
 * longue que ce qu'il a rendu, une fiche absente : rien n'est écrit, et
 * l'instantané d'hier reste. Une tournée d'hier est vraie à hier ; une tournée
 * amputée ment aujourd'hui.
 *
 * **La file n'est jamais touchée.** L'écran lit l'instantané avec la file
 * réappliquée : une opération pas encore arrivée ne disparaît donc pas quand un
 * instantané plus récent arrive.
 *
 * Toutes les listes épuisent leurs pages (`pagination.ts`) : `max_rows = 1000`
 * tronque sans rien dire.
 */

/**
 * Taille des lots de `carte_id` dans un filtre `in`. Cinquante identifiants font
 * moins de 2 Ko d'adresse ; bien en deçà des limites d'un proxy.
 */
export const TAILLE_LOT_IN = 50;

const COLONNES_MISES = 'id, carte_id, montant, encaisse_le, est_commission';

interface LigneClient {
  id: string;
  nom: string;
  telephone: string | null;
  marche: string | null;
  activite: string | null;
  avis_actifs: boolean;
}
interface LigneCarte {
  id: string;
  client_id: string;
  mise: number;
  statut: 'active' | 'cloturee';
  mises_encaissees: number;
  ouverte_le: string;
  cloturee_le: string | null;
}
interface LigneMise {
  id: string;
  carte_id: string;
  montant: number;
  encaisse_le: string;
  est_commission: boolean;
}
interface LigneRetrait {
  id: string;
  carte_id: string;
  montant_restitue: number;
  effectue_le: string;
}
interface LigneCaisse {
  id: string;
  date: string;
  cash_attendu: number;
  cash_declare: number;
  ecart: number;
}
interface LigneProfil {
  nom: string;
  telephone: string;
  zone: string | null;
  palier: string;
  abonnement_statut: string;
  abonnement_echeance: string | null;
  titulaire_id: string | null;
}
interface LigneRefus {
  id: string;
  motif: string;
  charge_utile: unknown;
  cree_le: string;
}

export async function rafraichir(
  client: SupabaseClient,
  base: BaseLocale,
  collecteurId: string,
  maintenant: number = Date.now(),
): Promise<'fait' | 'impossible'> {
  const instant = new Date(maintenant).toISOString();
  // Le jour du serveur est découpé en UTC (`cash_attendu_du_jour`) ; l'accueil
  // compte depuis minuit local. On prend le plus tôt des deux.
  const date = instant.slice(0, 10);
  const minuitLocal = new Date(maintenant);
  minuitLocal.setHours(0, 0, 0, 0);
  const depuis = new Date(Math.min(Date.parse(`${date}T00:00:00.000Z`), minuitLocal.getTime())).toISOString();

  try {
    const [rClients, rCartes, rMisesDuJour, rRetraits, rCaisses, rProfil, rRefus] = await Promise.all([
      chargerTout<LigneClient>((d, f) =>
        client
          .from('clients')
          .select('id, nom, telephone, marche, activite, avis_actifs', { count: 'exact' })
          .order('id')
          .range(d, f),
      ),
      chargerTout<LigneCarte>((d, f) =>
        client
          .from('cartes')
          .select('id, client_id, mise, statut, mises_encaissees, ouverte_le, cloturee_le')
          .order('id')
          .range(d, f),
      ),
      chargerTout<LigneMise>((d, f) =>
        client.from('mises').select(COLONNES_MISES).gte('encaisse_le', depuis).order('id').range(d, f),
      ),
      chargerTout<LigneRetrait>((d, f) =>
        client
          .from('retraits')
          .select('id, carte_id, montant_restitue, effectue_le')
          .gte('effectue_le', depuis)
          .order('id')
          .range(d, f),
      ),
      client.from('caisses_jour').select('id, date, cash_attendu, cash_declare, ecart').eq('date', date),
      client
        .from('collecteurs')
        .select('nom, telephone, zone, palier, abonnement_statut, abonnement_echeance, titulaire_id')
        .eq('id', collecteurId)
        .maybeSingle(),
      chargerTout<LigneRefus>((d, f) =>
        client
          .from('synchro_rejets')
          .select('id, motif, charge_utile, cree_le')
          .eq('traite', false)
          .order('id')
          .range(d, f),
      ),
    ]);

    if ([rClients, rCartes, rMisesDuJour, rRetraits, rCaisses, rProfil, rRefus].some((r) => r.error)) {
      return 'impossible';
    }
    if (typeof rClients.total === 'number' && rClients.total > rClients.data.length) return 'impossible';
    const fiche = rProfil.data as LigneProfil | null;
    if (!fiche) return 'impossible';

    const cartes: CarteLocale[] = rCartes.data.map((k) => ({
      id: k.id,
      clientId: k.client_id,
      mise: k.mise,
      statut: k.statut,
      misesEncaissees: k.mises_encaissees,
      ouverteLe: k.ouverte_le,
      clotureeLe: k.cloturee_le,
    }));

    const actives = cartes.filter((k) => k.statut === 'active').map((k) => k.id);
    const lots: string[][] = [];
    for (let i = 0; i < actives.length; i += TAILLE_LOT_IN) lots.push(actives.slice(i, i + TAILLE_LOT_IN));
    const rLots = await Promise.all(
      lots.map((lot) =>
        chargerTout<LigneMise>((d, f) =>
          client.from('mises').select(COLONNES_MISES).in('carte_id', lot).order('id').range(d, f),
        ),
      ),
    );
    if (rLots.some((r) => r.error)) return 'impossible';

    const mises = new Map<string, MiseLocale>();
    for (const m of [...rMisesDuJour.data, ...rLots.flatMap((r) => r.data)]) {
      mises.set(m.id, {
        id: m.id,
        carteId: m.carte_id,
        montant: m.montant,
        encaisseLe: m.encaisse_le,
        estCommission: m.est_commission,
      });
    }

    const tournee: Tournee = {
      clients: rClients.data.map((c) => ({
        id: c.id,
        nom: c.nom,
        telephone: c.telephone,
        marche: c.marche,
        activite: c.activite,
        avisActifs: c.avis_actifs,
      })),
      cartes,
      mises: [...mises.values()],
      retraits: rRetraits.data.map((r) => ({
        id: r.id,
        carteId: r.carte_id,
        montantRestitue: r.montant_restitue,
        effectueLe: r.effectue_le,
      })),
      caisses: ((rCaisses.data ?? []) as LigneCaisse[]).map((c) => ({
        id: c.id,
        date: c.date,
        cashAttendu: c.cash_attendu,
        cashDeclare: c.cash_declare,
        ecart: c.ecart,
      })),
      lueLe: instant,
    };

    const profil: ProfilLocal = {
      nom: fiche.nom,
      telephone: fiche.telephone,
      zone: fiche.zone,
      palier: fiche.palier,
      abonnementStatut: fiche.abonnement_statut,
      abonnementEcheance: fiche.abonnement_echeance,
      titulaireId: fiche.titulaire_id,
      lueLe: instant,
    };

    const tx = base.transaction(['tournee', 'profil', 'refus'], 'readwrite');
    await dans(tx, async () => {
      await tx.objectStore('tournee').put(tournee, CLE_INSTANTANE);
      await tx.objectStore('profil').put(profil, CLE_PROFIL);
      const refus = tx.objectStore('refus');
      await refus.clear();
      for (const r of rRefus.data) {
        await refus.put({
          id: r.id,
          motif: r.motif,
          chargeUtile: r.charge_utile as ChargeUtileRefus,
          creeLe: r.cree_le,
        });
      }
    });
    return 'fait';
  } catch {
    // Le constructeur de requête de supabase-js est un « thenable » : une
    // coupure franche le fait rejeter. Rien n'a été écrit.
    return 'impossible';
  }
}
```

- [ ] **Étape 4 : constater le vert**

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/rafraichir.test.ts`
Attendu : PASS, 8 épreuves.

- [ ] **Étape 5 : commit**

```bash
npx tsc -b apps/collecteur
git add apps/collecteur/src/hors-ligne/rafraichir.ts apps/collecteur/src/hors-ligne/rafraichir.test.ts
git commit -m "feat(hors-ligne): recharger la tournee, tout ou rien" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 9 : l'argent se prouve contre la base locale (§9.3)

**Le code livré diffère de cette tâche.** Quatre épreuves de base ajoutées (inscription rejouée d'un client renommé, abonnement suspendu entre-temps, réponse perdue puis redémarrage, inscription coupée entre ses étapes), commit `e23c611`. Le dépôt fait foi ; les blocs ci-dessous restent le plan d'origine.

**Fichiers :**
- Modifier : `supabase/tests/harnais.ts`
- Créer : `supabase/tests/hors-ligne-synchro.test.ts`

**Interfaces :**
- Consomme : `passe` (tâche 7), `rafraichir` (tâche 8), `ajouter`, `construire*` (tâche 5), `consigner` (tâche 6), `ouvrirBase`, `fermerBases`, `lireTournee`, `compterFile` (tâche 4), `admin`, `creerCollecteur`, `nettoyer` (harnais).
- Produit : `connecterAvec(c: CollecteurTest, fetch: typeof globalThis.fetch): Promise<SupabaseClient>` dans le harnais.

**Préalable :** la pile locale tourne (`docker ps` liste `supabase_db_Kolek`, `supabase_rest_Kolek`, `supabase_auth_Kolek`, `supabase_kong_Kolek`). Sinon : `npx supabase start -x studio,storage-api,imgproxy,realtime,vector,logflare,supavisor,mailpit`. **Jamais `--linked`.**

- [ ] **Étape 1 : un client dont on tient le réseau**

Dans `supabase/tests/harnais.ts` (CRLF, par Node), ajouter après la fonction `creerCollecteur` :

```ts
/**
 * Un second client connecté comme `c`, dont chaque requête passe par `fetch`.
 *
 * Pour les épreuves du hors-ligne : couper le réseau, perdre une réponse,
 * expirer un jeton — sur la vraie base, sous RLS, avec les vrais déclencheurs.
 * La session est la sienne : elle se renouvelle sans toucher à celle de `c`.
 */
export async function connecterAvec(
  c: CollecteurTest,
  fetch: typeof globalThis.fetch,
): Promise<SupabaseClient> {
  const client = createClient(url!, anonKey!, { ...sansSession, global: { fetch } });
  const { error } = await client.auth.signInWithPassword({ email: c.email, password: MOT_DE_PASSE });
  if (error) throw error;
  return client;
}
```

- [ ] **Étape 2 : écrire les huit épreuves**

Créer `supabase/tests/hors-ligne-synchro.test.ts` :

```ts
import 'fake-indexeddb/auto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { consigner } from '../../apps/collecteur/src/hors-ligne/envoyer';
import { ajouter } from '../../apps/collecteur/src/hors-ligne/file';
import {
  construireCaisse,
  construireClientCarte,
  construireMise,
} from '../../apps/collecteur/src/hors-ligne/gestes';
import type { Operation } from '../../apps/collecteur/src/hors-ligne/modele';
import { rafraichir } from '../../apps/collecteur/src/hors-ligne/rafraichir';
import {
  compterFile,
  fermerBases,
  lireOperations,
  lireRefus,
  lireTournee,
  ouvrirBase,
  type BaseLocale,
} from '../../apps/collecteur/src/hors-ligne/stockage-local';
import { passe } from '../../apps/collecteur/src/hors-ligne/synchroniseur';
import { admin, connecterAvec, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le hors-ligne contre la vraie base : clé anonyme, session du collecteur, RLS
 * active, déclencheurs réels. C'est ici que « aucune perte, aucun doublon » se
 * prouve — pas dans les épreuves de l'application, qui simulent le serveur.
 *
 * Le stockage du téléphone est `fake-indexeddb`, en mémoire. Le réseau est un
 * `fetch` qu'on tient : couper, perdre une réponse après l'écriture, rendre un
 * jeton expiré.
 */

afterAll(nettoyer);

beforeEach(async () => {
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
});

interface Reseau {
  coupe: boolean;
  /** La prochaine écriture arrive au serveur, puis sa réponse se perd. */
  perdreProchaineReponse: boolean;
  /** La prochaine requête d'API répond 401, jeton expiré. */
  expirerProchaineRequete: boolean;
  /** Nombre d'écritures encore permises avant la coupure. `null` : aucune coupure prévue. */
  ecrituresAvantCoupure: number | null;
  fetch: typeof globalThis.fetch;
}

function reseauFactice(): Reseau {
  const r: Reseau = {
    coupe: false,
    perdreProchaineReponse: false,
    expirerProchaineRequete: false,
    ecrituresAvantCoupure: null,
    fetch: async (entree, init) => {
      const adresse = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
      const methode = (init?.method ?? 'GET').toUpperCase();
      const api = adresse.includes('/rest/v1/');
      const ecriture = api && methode !== 'GET' && methode !== 'HEAD';

      if (r.coupe) throw new TypeError('Failed to fetch');
      if (api && r.expirerProchaineRequete) {
        r.expirerProchaineRequete = false;
        return new Response(JSON.stringify({ code: 'PGRST303', message: 'JWT expired', details: null, hint: null }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (ecriture && r.ecrituresAvantCoupure !== null) {
        if (r.ecrituresAvantCoupure === 0) throw new TypeError('Failed to fetch');
        r.ecrituresAvantCoupure -= 1;
      }
      if (ecriture && r.perdreProchaineReponse) {
        r.perdreProchaineReponse = false;
        await fetch(entree, init);
        throw new TypeError('Failed to fetch');
      }
      return fetch(entree, init);
    },
  };
  return r;
}

const telephone = () => `+22507${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

interface Poste {
  c: CollecteurTest;
  reseau: Reseau;
  client: SupabaseClient;
  base: BaseLocale;
}

async function poste(nom: string): Promise<Poste> {
  const c = await creerCollecteur(nom, telephone());
  const reseau = reseauFactice();
  const client = await connecterAvec(c, reseau.fetch);
  return { c, reseau, client, base: await ouvrirBase(c.id) };
}

async function carteEnLigne(p: Poste, mise = 1000): Promise<{ clientId: string; carteId: string }> {
  const clientId = crypto.randomUUID();
  const carteId = crypto.randomUUID();
  const r1 = await p.c.client.from('clients').insert({ id: clientId, collecteur_id: p.c.id, nom: 'Cliente' });
  if (r1.error) throw r1.error;
  const r2 = await p.c.client.from('cartes').insert({ id: carteId, collecteur_id: p.c.id, client_id: clientId, mise });
  if (r2.error) throw r2.error;
  return { clientId, carteId };
}

async function geste<O extends Operation>(p: Poste, construire: Parameters<typeof ajouter<O>>[1]): Promise<O> {
  const r = await ajouter(p.base, construire);
  if (!r.ok) throw new Error(`geste refusé : ${r.echec.code}`);
  return r.operation;
}

const ctx = (p: Poste) => ({ collecteurId: p.c.id, maintenant: Date.now() });
const deps = (p: Poste) => ({ client: p.client, base: p.base, collecteurId: p.c.id });

async function misesDeLaCarte(carteId: string) {
  const { data, error } = await admin.from('mises').select('id, montant, est_commission').eq('carte_id', carteId);
  if (error) throw error;
  return data;
}

async function compteurDe(carteId: string): Promise<number> {
  const { data, error } = await admin.from('cartes').select('mises_encaissees').eq('id', carteId).single();
  if (error) throw error;
  return data.mises_encaissees as number;
}

describe('J2b contre la base locale', () => {
  it('1. réponse perdue : une ligne, un jour de plus, une seule fois', async () => {
    const p = await poste('Perdue');
    const { carteId } = await carteEnLigne(p);
    expect(await rafraichir(p.client, p.base, p.c.id)).toBe('fait');
    const op = await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date() }));

    p.reseau.perdreProchaineReponse = true;
    expect((await passe(deps(p))).etat).toBe('hors_ligne');
    expect(await compterFile(p.base)).toBe(1);
    expect(await misesDeLaCarte(carteId)).toHaveLength(1);

    expect((await passe(deps(p))).etat).toBe('vide');
    expect((await misesDeLaCarte(carteId)).map((m) => m.id)).toEqual([op.charge.id]);
    expect(await compteurDe(carteId)).toBe(1);
    const { count } = await admin.from('synchro_rejets').select('id', { count: 'exact', head: true }).eq('collecteur_id', p.c.id);
    expect(count).toBe(0);
  });

  it('2. carte clôturée pendant l’attente : un refus consigné, charge complète, jamais deux', async () => {
    const p = await poste('Close');
    const { carteId } = await carteEnLigne(p);
    await rafraichir(p.client, p.base, p.c.id);
    const op = await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date() }));
    const clot = await admin.from('cartes').update({ statut: 'cloturee', cloturee_le: new Date().toISOString() }).eq('id', carteId);
    expect(clot.error).toBeNull();

    expect((await passe(deps(p))).etat).toBe('vide');

    const { data: rejets } = await admin.from('synchro_rejets').select('id, motif, charge_utile, traite').eq('collecteur_id', p.c.id);
    expect(rejets).toEqual([
      {
        id: op.id,
        motif: 'CARTE_CLOTUREE',
        traite: false,
        charge_utile: { version: 1, type: 'mise', charge: op.charge, faiteLe: op.faiteLe, sequence: op.sequence, dependDe: [] },
      },
    ]);
    expect(await misesDeLaCarte(carteId)).toEqual([]);

    // La consignation rejouée — la réponse s'était perdue — ne crée rien de plus.
    expect(await consigner(p.client, { ...op, etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' })).toEqual({ issue: 'acceptee' });
    const { count } = await admin.from('synchro_rejets').select('id', { count: 'exact', head: true }).eq('collecteur_id', p.c.id);
    expect(count).toBe(1);
    expect((await lireRefus(p.base)).map((r) => r.motif)).toEqual(['CARTE_CLOTUREE']);
  });

  it('3. abonnement suspendu pendant l’attente : la chaîne entière consignée, aucune ligne orpheline', async () => {
    const p = await poste('Suspendu');
    await rafraichir(p.client, p.base, p.c.id);
    const inscription = await geste(
      p,
      construireClientCarte({ ...ctx(p), abonnementStatut: 'actif' }, { nom: 'Nouvelle', mise: 1000 }),
    );
    const mise = await geste(
      p,
      construireMise(ctx(p), { carteId: inscription.charge.carte.id, montant: 1000, encaisseLe: new Date() }),
    );
    expect(mise.dependDe).toEqual([inscription.id]);
    const suspension = await admin.from('collecteurs').update({ abonnement_statut: 'suspendu' }).eq('id', p.c.id);
    expect(suspension.error).toBeNull();

    expect((await passe(deps(p))).etat).toBe('vide');

    const { data: rejets } = await admin.from('synchro_rejets').select('id, motif').eq('collecteur_id', p.c.id).order('motif');
    expect(rejets).toEqual([
      { id: inscription.id, motif: 'ABONNEMENT_INACTIF' },
      { id: mise.id, motif: 'PARENT_REFUSE' },
    ]);
    for (const [table, id] of [
      ['clients', inscription.charge.client.id],
      ['cartes', inscription.charge.carte.id],
      ['mises', mise.charge.id],
    ] as const) {
      const { count } = await admin.from(table).select('id', { count: 'exact', head: true }).eq('id', id);
      expect(count, table).toBe(0);
    }
  });

  it('4a. caisse sur une ligne existante, déclarée deux fois : la dernière gagne, à chaque rejeu', async () => {
    const p = await poste('Caisse');
    const existante = await p.c.client.from('caisses_jour').insert({ collecteur_id: p.c.id, date: aujourdhui(), cash_declare: 3000 });
    expect(existante.error).toBeNull();
    // Sans rafraîchir : le téléphone ignore la ligne, et tire son propre identifiant.
    await geste(p, construireCaisse(ctx(p), { date: aujourdhui(), montant: 5000 }));
    await geste(p, construireCaisse(ctx(p), { date: aujourdhui(), montant: 7000 }));

    expect((await passe(deps(p))).etat).toBe('vide');
    await geste(p, construireCaisse(ctx(p), { date: aujourdhui(), montant: 7000 }));
    expect((await passe(deps(p))).etat).toBe('vide');

    const { data } = await admin.from('caisses_jour').select('cash_declare').eq('collecteur_id', p.c.id);
    expect(data).toEqual([{ cash_declare: 7000 }]);
  });

  it('4b. caisse sans ligne, déclarée deux fois : une ligne, la dernière déclaration', async () => {
    const p = await poste('Caisse neuve');
    await geste(p, construireCaisse(ctx(p), { date: aujourdhui(), montant: 4000 }));
    await geste(p, construireCaisse(ctx(p), { date: aujourdhui(), montant: 6000 }));

    expect((await passe(deps(p))).etat).toBe('vide');

    const { data } = await admin.from('caisses_jour').select('cash_declare').eq('collecteur_id', p.c.id);
    expect(data).toEqual([{ cash_declare: 6000 }]);
  });

  it('5. mise vieille de 91 jours : DATE_INVALIDE consigné, jamais réessayé', async () => {
    const p = await poste('Ancienne');
    const { carteId } = await carteEnLigne(p);
    await rafraichir(p.client, p.base, p.c.id);
    await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date(Date.now() - 91 * 86_400_000) }));

    expect((await passe(deps(p))).etat).toBe('vide');

    expect((await lireRefus(p.base)).map((r) => r.motif)).toEqual(['DATE_INVALIDE']);
    expect(await misesDeLaCarte(carteId)).toEqual([]);
    expect(await lireOperations(p.base)).toEqual([]);
  });

  it('6. jeton expiré au milieu de l’envoi : renouvelé, repris, aucun doublon', async () => {
    const p = await poste('Expire');
    const { carteId } = await carteEnLigne(p);
    await rafraichir(p.client, p.base, p.c.id);
    await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date() }));
    const avant = (await p.client.auth.getSession()).data.session?.access_token;

    p.reseau.expirerProchaineRequete = true;
    expect((await passe(deps(p))).etat).toBe('vide');

    expect((await p.client.auth.getSession()).data.session?.access_token).not.toBe(avant);
    expect(await misesDeLaCarte(carteId)).toHaveLength(1);
  });

  it('7. envoi interrompu au milieu : au redémarrage, le reste part une fois', async () => {
    const p = await poste('Interrompu');
    const { carteId } = await carteEnLigne(p);
    await rafraichir(p.client, p.base, p.c.id);
    for (let i = 0; i < 3; i += 1) {
      await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date() }));
    }

    p.reseau.ecrituresAvantCoupure = 1;
    expect((await passe(deps(p))).etat).toBe('hors_ligne');
    expect(await compterFile(p.base)).toBe(2);

    // Le téléphone redémarre : la base se rouvre, le réseau revient.
    await fermerBases();
    p.base = await ouvrirBase(p.c.id);
    p.reseau.ecrituresAvantCoupure = null;
    expect((await passe(deps(p))).etat).toBe('vide');

    expect(await misesDeLaCarte(carteId)).toHaveLength(3);
    expect(await compteurDe(carteId)).toBe(3);
  });

  it('8. une tournée complète hors ligne : les totaux du serveur égalent ceux du téléphone', async () => {
    const p = await poste('Tournee');
    const cartes: string[] = [];
    for (let i = 0; i < 10; i += 1) cartes.push((await carteEnLigne(p)).carteId);
    await rafraichir(p.client, p.base, p.c.id);

    p.reseau.coupe = true;
    for (const carteId of cartes) {
      for (let j = 0; j < 5; j += 1) {
        await geste(p, construireMise(ctx(p), { carteId, montant: 1000, encaisseLe: new Date() }));
      }
    }
    const inscrits = [];
    for (const nom of ['Premiere', 'Seconde']) {
      const op = await geste(p, construireClientCarte({ ...ctx(p), abonnementStatut: 'actif' }, { nom, mise: 1000 }));
      await geste(p, construireMise(ctx(p), { carteId: op.charge.carte.id, montant: 1000, encaisseLe: new Date() }));
      inscrits.push(op);
    }
    const { construireCarte } = await import('../../apps/collecteur/src/hors-ligne/gestes');
    await geste(p, construireCarte({ ...ctx(p), abonnementStatut: 'actif' }, { clientId: inscrits[0]!.charge.client.id, mise: 2000 }));
    await geste(p, construireCaisse(ctx(p), { date: aujourdhui(), montant: 52_000 }));

    expect((await passe(deps(p))).etat).toBe('hors_ligne');
    const { tournee: telephone } = await lireTournee(p.base);

    p.reseau.coupe = false;
    expect((await passe(deps(p))).etat).toBe('vide');

    const { data: mises } = await admin.from('mises').select('montant, est_commission').eq('collecteur_id', p.c.id);
    const { data: cartesServeur } = await admin.from('cartes').select('id, mises_encaissees').eq('collecteur_id', p.c.id);
    const { data: caisses } = await admin.from('caisses_jour').select('cash_declare').eq('collecteur_id', p.c.id);
    const { count: clients } = await admin.from('clients').select('id', { count: 'exact', head: true }).eq('collecteur_id', p.c.id);

    const somme = (l: Array<{ montant: number }>) => l.reduce((t, m) => t + m.montant, 0);
    expect(mises!.length).toBe(telephone.mises.length);
    expect(mises!.length).toBe(52);
    expect(somme(mises!)).toBe(somme(telephone.mises));
    expect(mises!.filter((m) => m.est_commission).length).toBe(telephone.mises.filter((m) => m.estCommission).length);
    expect(Object.fromEntries(cartesServeur!.map((k) => [k.id, k.mises_encaissees]))).toEqual(
      Object.fromEntries(telephone.cartes.map((k) => [k.id, k.misesEncaissees])),
    );
    expect(caisses).toEqual([{ cash_declare: telephone.caisses[0]!.cashDeclare }]);
    expect(clients).toBe(telephone.clients.length);
    expect(await compterFile(p.base)).toBe(0);
  }, 120_000);
});
```

- [ ] **Étape 3 : constater l'échec, puis le vert**

Le harnais n'exporte pas encore `connecterAvec` si l'étape 1 a été sautée : l'épreuve échoue alors sur l'import. Avec l'étape 1 en place, les modules des tâches 4 à 8 existent déjà ; lancer :

Run : `npm run test:db -- supabase/tests/hors-ligne-synchro.test.ts`
Attendu : PASS, 9 épreuves.

Si une épreuve échoue, **ne pas corriger l'épreuve pour la faire passer** : c'est l'endroit où le plan prouve l'argent. Diagnostiquer (`superpowers:systematic-debugging`) et corriger le module en cause, avec une épreuve unitaire rouge d'abord.

- [ ] **Étape 4 : commit**

```bash
git add supabase/tests/harnais.ts supabase/tests/hors-ligne-synchro.test.ts
git commit -m "test(hors-ligne): aucune perte, aucun doublon, contre les vrais declencheurs" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 10 : le planificateur et le moteur

**Le code livré diffère de cette tâche.** Réveil borné, verrou en mémoire sans `navigator.locks`, effacements par collecteur (commit `1eeeb33`) ; écarts 34 et 35 (un rechargement demandé reste dû ; les pannes se journalisent, commit `1d7bddb`). Le délai de l'écart 33 est posé en tâche 11. Le dépôt fait foi ; les blocs ci-dessous restent le plan d'origine.

**Fichiers :**
- Créer : `apps/collecteur/src/hors-ligne/planificateur.ts`, `apps/collecteur/src/hors-ligne/planificateur.test.ts`
- Créer : `apps/collecteur/src/hors-ligne/moteur.ts`, `apps/collecteur/src/hors-ligne/moteur.test.ts`

**Interfaces :**
- Consomme : `passe`, `BilanPasse` (tâche 7) ; `rafraichir` (tâche 8) ; stockage (tâche 4) ; `delaiApres` (tâche 1).
- Produit (`planificateur.ts`) : `PERIODE_RAFRAICHISSEMENT_MS = 300_000`, `interface Taches { passe: () => Promise<BilanPasse>; rafraichir: () => Promise<'fait' | 'impossible'> }`, `interface Planificateur { demander(options?: { rafraichir?: boolean }): Promise<void>; arreter(): void }`, `creerPlanificateur(taches: Taches, surFin?: (bilan: BilanPasse, rafraichie: boolean) => void): Planificateur`.
- Produit (`moteur.ts`) : `ecouterChangements(ecouteur: () => void): () => void`, `signalerChangement(): void`, `collecteurCourant(): string | null`, `etatDuStockage(): EtatStockage`, `dernierBilan(): BilanPasse | null`, `sousVerrou<T>(nom: string, travail: () => Promise<T>, siOccupe: () => T): Promise<T>`, `demarrerMoteur(client: SupabaseClient, collecteurId: string): () => void`, `arreterMoteur(): void`, `apresGeste(): void`, `demanderRafraichissement(): void`, `lectureCourante(): Promise<{ tournee: Tournee; operations: Operation[]; refus: RefusLocal[]; profil: ProfilLocal | null }>`, `compterFileDe(collecteurId: string): Promise<number | null>`, `effacerTourneeDe(collecteurId: string): Promise<void>`.

- [ ] **Étape 1 : écrire l'épreuve du planificateur**

Créer `apps/collecteur/src/hors-ligne/planificateur.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { creerPlanificateur } from './planificateur';
import type { BilanPasse } from './synchroniseur';

const bilan = (etat: BilanPasse['etat'], reste: Partial<BilanPasse> = {}): BilanPasse => ({ etat, reveil: null, traitees: 0, ...reste });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-13T09:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('une passe à la fois', () => {
  it('ne lance pas une seconde passe pendant la première, mais la rejoue après', async () => {
    let finir: () => void = () => {};
    const passe = vi
      .fn<() => Promise<BilanPasse>>()
      .mockImplementationOnce(() => new Promise((r) => { finir = () => r(bilan('vide')); }))
      .mockResolvedValue(bilan('vide'));
    const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) });

    void p.demander();
    void p.demander();
    expect(passe).toHaveBeenCalledTimes(1);

    finir();
    await vi.runAllTimersAsync();
    expect(passe).toHaveBeenCalledTimes(2);
  });
});

describe('quand revenir (§5.3)', () => {
  it('revient à l’heure du réveil', async () => {
    const passe = vi.fn<() => Promise<BilanPasse>>().mockResolvedValueOnce(bilan('attente', { reveil: Date.now() + 7000 })).mockResolvedValue(bilan('vide'));
    const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) });

    await p.demander();
    await vi.advanceTimersByTimeAsync(6999);
    expect(passe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(passe).toHaveBeenCalledTimes(2);
  });

  it('hors ligne : 30 s, puis 1 min, puis 2 min', async () => {
    const passe = vi.fn(async () => bilan('hors_ligne'));
    const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) });

    await p.demander();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(passe).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(passe).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(passe).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(passe).toHaveBeenCalledTimes(4);
  });

  it('ne revient pas seul sur une file vide ou une session finie', async () => {
    for (const etat of ['vide', 'session_finie', 'autre_compte'] as const) {
      const passe = vi.fn(async () => bilan(etat));
      const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) });
      await p.demander();
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(passe, etat).toHaveBeenCalledTimes(1);
    }
  });

  it('une demande relance tout de suite, sans attendre le délai en cours', async () => {
    const passe = vi.fn(async () => bilan('hors_ligne'));
    const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) });

    await p.demander();
    await p.demander();
    expect(passe).toHaveBeenCalledTimes(2);
  });
});

describe('quand recharger la tournée (précision 10)', () => {
  it('à la demande, quand le serveur répond', async () => {
    const rafraichir = vi.fn(async () => 'fait' as const);
    const surFin = vi.fn();
    const p = creerPlanificateur({ passe: vi.fn(async () => bilan('vide')), rafraichir }, surFin);

    await p.demander({ rafraichir: true });

    expect(rafraichir).toHaveBeenCalledTimes(1);
    expect(surFin).toHaveBeenCalledWith(bilan('vide'), true);
  });

  it('jamais hors ligne : ce serait sept requêtes pour rien', async () => {
    const rafraichir = vi.fn(async () => 'fait' as const);
    const p = creerPlanificateur({ passe: vi.fn(async () => bilan('hors_ligne')), rafraichir });

    await p.demander({ rafraichir: true });

    expect(rafraichir).not.toHaveBeenCalled();
  });

  it('après un envoi qui vide la file, au plus toutes les 5 minutes', async () => {
    const rafraichir = vi.fn(async () => 'fait' as const);
    const p = creerPlanificateur({ passe: vi.fn(async () => bilan('vide', { traitees: 1 })), rafraichir });

    await p.demander();
    await p.demander();
    expect(rafraichir).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(300_000);
    await p.demander();
    expect(rafraichir).toHaveBeenCalledTimes(2);
  });
});

describe('arrêter', () => {
  it('ne lance plus rien, même au réveil prévu', async () => {
    const passe = vi.fn(async () => bilan('hors_ligne'));
    const p = creerPlanificateur({ passe, rafraichir: vi.fn(async () => 'fait' as const) });

    await p.demander();
    p.arreter();
    await vi.advanceTimersByTimeAsync(600_000);
    await p.demander();

    expect(passe).toHaveBeenCalledTimes(1);
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/planificateur.test.ts`
Attendu : FAIL, « Failed to resolve import "./planificateur" ».

- [ ] **Étape 2 : écrire le planificateur**

Créer `apps/collecteur/src/hors-ligne/planificateur.ts` :

```ts
import { delaiApres } from './modele';
import type { BilanPasse } from './synchroniseur';

/**
 * Quand passer, et une passe à la fois (§5.3).
 *
 * Une demande pendant une passe n'en lance pas une seconde : elle est retenue,
 * et rejouée à la fin. Une demande hors passe annule le délai en cours et part
 * tout de suite — le retour du réseau ne doit pas attendre la fin d'une attente
 * de dix minutes.
 *
 * `navigator.onLine` ne décide de rien : seul le bilan d'une passe fait foi.
 */

/** Au plus un rechargement de tournée toutes les cinq minutes après un envoi (précision 10). */
export const PERIODE_RAFRAICHISSEMENT_MS = 5 * 60_000;

export interface Taches {
  passe: () => Promise<BilanPasse>;
  rafraichir: () => Promise<'fait' | 'impossible'>;
}

export interface Planificateur {
  demander(options?: { rafraichir?: boolean }): Promise<void>;
  arreter(): void;
}

export function creerPlanificateur(
  taches: Taches,
  surFin: (bilan: BilanPasse, rafraichie: boolean) => void = () => {},
): Planificateur {
  let enCours: Promise<void> | null = null;
  let redemande: { rafraichir: boolean } | null = null;
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  let echecsPassagers = 0;
  let dernierRafraichissement = Number.NEGATIVE_INFINITY;
  let arrete = false;

  function annulerMinuteur() {
    if (minuteur !== null) clearTimeout(minuteur);
    minuteur = null;
  }

  function programmer(ms: number) {
    annulerMinuteur();
    minuteur = setTimeout(() => {
      minuteur = null;
      void demander();
    }, Math.max(0, ms));
  }

  async function tour(avecRafraichissement: boolean): Promise<void> {
    let bilan: BilanPasse;
    try {
      bilan = await taches.passe();
    } catch {
      bilan = { etat: 'hors_ligne', reveil: null, traitees: 0 };
    }
    echecsPassagers = bilan.etat === 'hors_ligne' ? echecsPassagers + 1 : 0;

    // Recharger n'a de sens que si le serveur vient de répondre.
    const joignable = bilan.etat === 'vide' || bilan.etat === 'attente';
    const perime = Date.now() - dernierRafraichissement >= PERIODE_RAFRAICHISSEMENT_MS;
    const apresEnvoi = bilan.etat === 'vide' && bilan.traitees > 0 && perime;
    let rafraichie = false;
    if (joignable && (avecRafraichissement || apresEnvoi)) {
      rafraichie = (await taches.rafraichir().catch(() => 'impossible' as const)) === 'fait';
      if (rafraichie) dernierRafraichissement = Date.now();
    }

    if (arrete) return;
    surFin(bilan, rafraichie);
    if (bilan.etat === 'attente' && bilan.reveil !== null) programmer(bilan.reveil - Date.now());
    else if (bilan.etat === 'hors_ligne') programmer(delaiApres(echecsPassagers));
  }

  function demander(options: { rafraichir?: boolean } = {}): Promise<void> {
    if (arrete) return Promise.resolve();
    const avec = Boolean(options.rafraichir);
    if (enCours) {
      redemande = { rafraichir: (redemande?.rafraichir ?? false) || avec };
      return enCours;
    }
    annulerMinuteur();
    enCours = tour(avec).finally(() => {
      enCours = null;
      const suite = redemande;
      redemande = null;
      if (suite && !arrete) void demander(suite);
    });
    return enCours;
  }

  return {
    demander,
    arreter() {
      arrete = true;
      annulerMinuteur();
    },
  };
}
```

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/planificateur.test.ts`
Attendu : PASS.

- [ ] **Étape 3 : écrire l'épreuve du moteur**

**Corrigé après exécution (écart 32).** Attendre un seul tour de boucle (`laisserTourner`) ne suffisait pas : l'ouverture d'IndexedDB à froid prend plusieurs tours, et l'épreuve tombait une fois sur quelques-unes. Le bloc ci-dessous attend désormais le premier tour par `vi.waitFor`. Le code du moteur est inchangé.

Créer `apps/collecteur/src/hors-ligne/moteur.test.ts` :

```ts
import 'fake-indexeddb/auto';

import type { SupabaseClient } from '@supabase/supabase-js';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const passe = vi.fn();
const rafraichir = vi.fn();

vi.mock('./synchroniseur', () => ({ passe: (...args: unknown[]) => passe(...args) }));
vi.mock('./rafraichir', () => ({ rafraichir: (...args: unknown[]) => rafraichir(...args) }));

const {
  apresGeste,
  arreterMoteur,
  collecteurCourant,
  compterFileDe,
  demarrerMoteur,
  ecouterChangements,
  effacerTourneeDe,
  lectureCourante,
  sousVerrou,
} = await import('./moteur');
const { CLE_INSTANTANE, fermerBases, ouvrirBase } = await import('./stockage-local');
const { client: fabriqueClient, operationMise, tournee } = await import('./fabriques');

const CLIENT = {} as SupabaseClient;

beforeEach(async () => {
  arreterMoteur();
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
  passe.mockReset().mockResolvedValue({ etat: 'vide', reveil: null, traitees: 0 });
  rafraichir.mockReset().mockResolvedValue('fait');
});

afterEach(() => {
  arreterMoteur();
  vi.unstubAllGlobals();
});

const laisserTourner = () => new Promise((r) => setTimeout(r, 0));

/** Attend la fin du premier tour — la passe, puis le rechargement — quelle que soit la lenteur d'une ouverture de base à froid. */
const premierTour = async () => {
  await vi.waitFor(() => expect(rafraichir).toHaveBeenCalledTimes(1));
  await laisserTourner();
};

describe('démarrer', () => {
  it('passe et recharge la tournée dès l’ouverture, puis prévient les écrans', async () => {
    const ecouteur = vi.fn();
    ecouterChangements(ecouteur);

    demarrerMoteur(CLIENT, 'col-1');
    await premierTour();

    expect(collecteurCourant()).toBe('col-1');
    expect(passe).toHaveBeenCalledTimes(1);
    expect(passe.mock.calls[0]![0]).toMatchObject({ client: CLIENT, collecteurId: 'col-1' });
    expect(rafraichir).toHaveBeenCalledTimes(1);
    expect(ecouteur).toHaveBeenCalled();
  });

  it('repasse au retour du réseau', async () => {
    demarrerMoteur(CLIENT, 'col-1');
    await premierTour();

    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(passe).toHaveBeenCalledTimes(2));

    expect(passe).toHaveBeenCalledTimes(2);
  });

  it('ne répond plus à rien une fois arrêté', async () => {
    const arreter = demarrerMoteur(CLIENT, 'col-1');
    await premierTour();
    arreter();

    window.dispatchEvent(new Event('online'));
    apresGeste();
    await laisserTourner();

    expect(passe).toHaveBeenCalledTimes(1);
    expect(collecteurCourant()).toBeNull();
  });
});

describe('après un geste', () => {
  it('prévient les écrans et demande une passe', async () => {
    demarrerMoteur(CLIENT, 'col-1');
    await premierTour();
    const ecouteur = vi.fn();
    ecouterChangements(ecouteur);

    apresGeste();
    await vi.waitFor(() => expect(passe).toHaveBeenCalledTimes(2));

    expect(ecouteur).toHaveBeenCalled();
    expect(passe).toHaveBeenCalledTimes(2);
  });
});

describe('lire et compter', () => {
  it('lit la tournée du collecteur connecté', async () => {
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ clients: [fabriqueClient('c1')] }), CLE_INSTANTANE);
    await base.add('file', operationMise(1, { carteId: 'k1' }));
    demarrerMoteur(CLIENT, 'col-1');

    const lu = await lectureCourante();

    expect(lu.tournee.clients.map((c) => c.id)).toEqual(['c1']);
    expect(lu.operations).toHaveLength(1);
    expect(lu.profil).toBeNull();
  });

  it('refuse de lire sans collecteur connecté', async () => {
    await expect(lectureCourante()).rejects.toThrow();
  });

  it('compte la file et efface la tournée, sans jamais toucher la file', async () => {
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ clients: [fabriqueClient('c1')] }), CLE_INSTANTANE);
    await base.add('file', operationMise(1, { carteId: 'k1' }));

    await effacerTourneeDe('col-1');

    expect(await compterFileDe('col-1')).toBe(1);
    expect((await base.get('tournee', CLE_INSTANTANE)) ?? null).toBeNull();
  });
});

describe('le verrou entre onglets', () => {
  it('exécute directement là où l’API manque', async () => {
    vi.stubGlobal('navigator', {});
    expect(await sousVerrou('v', async () => 'fait', () => 'occupe')).toBe('fait');
  });

  it('cède la place quand un autre onglet tient le verrou', async () => {
    vi.stubGlobal('navigator', {
      locks: { request: (_nom: string, _o: unknown, rappel: (verrou: unknown) => unknown) => Promise.resolve(rappel(null)) },
    });
    expect(await sousVerrou('v', async () => 'fait', () => 'occupe')).toBe('occupe');
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/moteur.test.ts`
Attendu : FAIL, « Failed to resolve import "./moteur" ».

- [ ] **Étape 4 : écrire le moteur**

Créer `apps/collecteur/src/hors-ligne/moteur.ts` :

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Operation, ProfilLocal, RefusLocal, Tournee } from './modele';
import { creerPlanificateur, type Planificateur } from './planificateur';
import { rafraichir } from './rafraichir';
import {
  compterFile,
  demanderPersistance,
  effacerDonneesDeTournee,
  lireProfil,
  lireRefus,
  lireTournee,
  ouvrirBase,
  type EtatStockage,
} from './stockage-local';
import { passe, type BilanPasse } from './synchroniseur';

/**
 * Le moteur du hors-ligne, pour le collecteur connecté.
 *
 * Un seul à la fois : `demarrerMoteur` arrête le précédent. Il porte ce que les
 * écrans et les écritures partagent sans se passer de propriétés — le
 * collecteur courant, l'avis « quelque chose a changé », et la demande de
 * passe après un geste.
 *
 * **Deux onglets.** `navigator.locks` garantit qu'un seul envoie. Là où l'API
 * manque, deux passes simultanées restent inoffensives : chaque envoi est
 * idempotent par identifiant, et chaque conclusion relit (§5.2).
 */

type Ecouteur = () => void;

const ecouteurs = new Set<Ecouteur>();
let courant: { collecteurId: string; planificateur: Planificateur; arreter: () => void } | null = null;
let stockage: EtatStockage = 'inconnu';
let dernier: BilanPasse | null = null;

export function ecouterChangements(ecouteur: Ecouteur): () => void {
  ecouteurs.add(ecouteur);
  return () => {
    ecouteurs.delete(ecouteur);
  };
}

export function signalerChangement(): void {
  for (const ecouteur of [...ecouteurs]) ecouteur();
}

export function collecteurCourant(): string | null {
  return courant?.collecteurId ?? null;
}

export function etatDuStockage(): EtatStockage {
  return stockage;
}

export function dernierBilan(): BilanPasse | null {
  return dernier;
}

export async function sousVerrou<T>(
  nom: string,
  travail: () => Promise<T>,
  siOccupe: () => T,
): Promise<T> {
  const verrous =
    typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : undefined;
  if (!verrous) return travail();
  return verrous.request(nom, { ifAvailable: true }, (verrou) => (verrou ? travail() : siOccupe()));
}

export function demarrerMoteur(client: SupabaseClient, collecteurId: string): () => void {
  arreterMoteur();
  const verrou = `kolek-synchro-${collecteurId}`;

  const planificateur = creerPlanificateur(
    {
      passe: () =>
        sousVerrou(
          verrou,
          async () => passe({ client, base: await ouvrirBase(collecteurId), collecteurId }),
          // Un autre onglet envoie : on repassera dans trente secondes.
          () => ({ etat: 'attente' as const, reveil: Date.now() + 30_000, traitees: 0 }),
        ),
      rafraichir: () =>
        sousVerrou(
          verrou,
          async () => rafraichir(client, await ouvrirBase(collecteurId), collecteurId),
          () => 'impossible' as const,
        ),
    },
    (bilan, rafraichie) => {
      dernier = bilan;
      if (bilan.traitees > 0 || rafraichie) signalerChangement();
    },
  );

  const surReseau = () => {
    void planificateur.demander({ rafraichir: true });
  };
  const surVisibilite = () => {
    if (document.visibilityState === 'visible') void planificateur.demander({ rafraichir: true });
  };
  window.addEventListener('online', surReseau);
  document.addEventListener('visibilitychange', surVisibilite);

  const arreter = () => {
    window.removeEventListener('online', surReseau);
    document.removeEventListener('visibilitychange', surVisibilite);
    planificateur.arreter();
    if (courant?.planificateur === planificateur) courant = null;
  };
  courant = { collecteurId, planificateur, arreter };

  void demanderPersistance().then((etat) => {
    stockage = etat;
    signalerChangement();
  });
  void planificateur.demander({ rafraichir: true });

  return arreter;
}

export function arreterMoteur(): void {
  courant?.arreter();
}

/** Après un geste : les écrans relisent, et la file part au plus tôt. */
export function apresGeste(): void {
  signalerChangement();
  void courant?.planificateur.demander();
}

/** Après un geste resté en ligne — clôture, correction, consentement : la tournée se relit. */
export function demanderRafraichissement(): void {
  void courant?.planificateur.demander({ rafraichir: true });
}

/** Tout ce que les écrans de collecte lisent, pour le collecteur connecté. */
export async function lectureCourante(): Promise<{
  tournee: Tournee;
  operations: Operation[];
  refus: RefusLocal[];
  profil: ProfilLocal | null;
}> {
  const id = collecteurCourant();
  if (!id) throw new Error('Aucun collecteur connecté.');
  const base = await ouvrirBase(id);
  const [{ tournee, operations }, refus, profil] = await Promise.all([
    lireTournee(base),
    lireRefus(base),
    lireProfil(base),
  ]);
  return { tournee, operations, refus, profil };
}

/** `null` quand la base ne peut pas être lue : on ne déconnecte pas sur un doute. */
export async function compterFileDe(collecteurId: string): Promise<number | null> {
  try {
    return await compterFile(await ouvrirBase(collecteurId));
  } catch {
    return null;
  }
}

export async function effacerTourneeDe(collecteurId: string): Promise<void> {
  try {
    await effacerDonneesDeTournee(await ouvrirBase(collecteurId));
  } catch {
    // Base illisible : il n'y a rien à effacer qu'on puisse atteindre. Le
    // prochain rafraîchissement remplacera la tournée de toute façon.
  }
}
```

- [ ] **Étape 5 : constater le vert, commit — fin de la partie A**

```bash
npm run test -w @kolek/collecteur -- src/hors-ligne
npx tsc -b apps/collecteur
npm run verifier:lint
git add apps/collecteur/src/hors-ligne/planificateur.ts apps/collecteur/src/hors-ligne/planificateur.test.ts apps/collecteur/src/hors-ligne/moteur.ts apps/collecteur/src/hors-ligne/moteur.test.ts
git commit -m "feat(hors-ligne): le planificateur et le moteur du collecteur connecte" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Attendu : toutes les épreuves de `src/hors-ligne` au vert. **Point d'arrêt sûr** : rien n'est encore branché, l'application se comporte comme sur `main`.

---

# Partie B — le branchement

À partir d'ici, l'application change. Chaque tâche laisse le dépôt vert : épreuves de l'application, typage, lint. **Aucune tâche de la partie B ne se pousse seule** : la branche entière part en production après la tâche 19, sur accord.

Rappel pour chaque fichier touché : mesurer avant (`node crlf.mjs --mesurer <fichier>`), éditer, remettre la convention d'origine (`node crlf.mjs <fichier>` pour un fichier CRLF ; rien pour un fichier LF), et vérifier que le nombre d'insécables n'a pas bougé. Voir « Fins de ligne » en tête du plan.

## Tâche 11 : ouvrir la tournée sans réseau, et démarrer le moteur

**Le code livré diffère de cette tâche.** Écarts 33 et 36 (délai de 30 s sur les requêtes de données seulement, par `db.timeout`), 38 (attente de session bornée) et 39 (tournée effacée aussi pour une session révoquée ou un autre compte) ; commits `3e11732`, `a7317b1`, `07aa00b`. Le dépôt fait foi ; les blocs ci-dessous restent le plan d'origine.

**Fichiers :**
- Créer : `apps/collecteur/src/session-gardee.ts`, `apps/collecteur/src/session-gardee.test.ts`, `apps/collecteur/src/App.test.tsx`
- Modifier : `apps/collecteur/src/supabase.ts`, `apps/collecteur/src/App.tsx`, `apps/collecteur/src/Coquille.tsx`, `apps/collecteur/src/Coquille.test.tsx`, `apps/collecteur/vitest.config.ts` (écart 37)

**Interfaces :**
- Consomme : `demarrerMoteur(client, collecteurId): () => void`, `ecouterChangements(ecouteur): () => void`, `effacerTourneeDe(collecteurId): Promise<void>` (tâche 10).
- Produit : `cleSessionPour(url: string): string`, `lireSessionGardee(stockage: Pick<Storage, 'getItem'>, cle: string): { userId: string } | null` ; `CLE_SESSION: string` exporté par `supabase.ts` ; `Coquille` reçoit `collecteurId: string` (plus jamais `null`) et le transmet aux écrans comme avant.
- Précisions 1, 2 et 3.

- [ ] **Étape 1 : écrire l'épreuve de la session gardée**

Créer `apps/collecteur/src/session-gardee.test.ts` :

```ts
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { cleSessionPour, lireSessionGardee } from './session-gardee';

const memoire = (valeurs: Record<string, string>) => ({
  getItem: (cle: string) => valeurs[cle] ?? null,
});

describe('la clé sous laquelle supabase-js garde la session', () => {
  it.each([
    ['https://abcdefghijklmnopqrst.supabase.co', 'sb-abcdefghijklmnopqrst-auth-token'],
    ['http://127.0.0.1:54321', 'sb-127-auth-token'],
  ])('%s se garde sous %s', (url, cle) => {
    expect(cleSessionPour(url)).toBe(cle);
  });

  it('est exactement celle que supabase-js calcule : une autre déconnecterait tout le monde', () => {
    for (const url of ['https://abcdefghijklmnopqrst.supabase.co', 'http://127.0.0.1:54321']) {
      const client = createClient(url, 'cle-publique', {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      expect(cleSessionPour(url)).toBe((client as unknown as { storageKey: string }).storageKey);
    }
  });
});

describe('la session gardée, lue sans réseau', () => {
  const CLE = 'sb-test-auth-token';

  it('rend le collecteur d’une session complète', () => {
    const session = JSON.stringify({
      access_token: 'a',
      refresh_token: 'r',
      expires_at: 1,
      user: { id: 'col-1' },
    });
    expect(lireSessionGardee(memoire({ [CLE]: session }), CLE)).toEqual({ userId: 'col-1' });
  });

  it('ne rend rien sans session, ou sous une autre clé', () => {
    expect(lireSessionGardee(memoire({}), CLE)).toBeNull();
    expect(lireSessionGardee(memoire({ autre: '{}' }), CLE)).toBeNull();
  });

  it.each([
    ['illisible', '{pas du json'],
    ['sans jeton de renouvellement', JSON.stringify({ user: { id: 'col-1' } })],
    ['sans utilisateur', JSON.stringify({ refresh_token: 'r' })],
    ['nulle', 'null'],
  ])('ne rend rien d’une session %s', (_cas, brut) => {
    expect(lireSessionGardee(memoire({ [CLE]: brut }), CLE)).toBeNull();
  });

  it('se tait quand le stockage du navigateur lève', () => {
    const bloque = {
      getItem: () => {
        throw new Error('stockage bloqué');
      },
    };
    expect(lireSessionGardee(bloque, CLE)).toBeNull();
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/session-gardee.test.ts`
Attendu : FAIL, « Failed to resolve import "./session-gardee" ».

- [ ] **Étape 2 : écrire `session-gardee.ts`**

Créer `apps/collecteur/src/session-gardee.ts` :

```ts
/**
 * La session que supabase-js garde sur le disque, lue sans réseau.
 *
 * ## Pourquoi on la lit soi-même
 *
 * Le jeton d'accès dure une heure. Passé ce délai, `getSession()` tente de le
 * renouveler ; sans réseau, le renouvellement échoue, et `getSession()` rend
 * `session: null` avec une `AuthRetryableFetchError` — alors que la session,
 * elle, reste intacte sur le disque (constaté dans `@supabase/auth-js` 2.112.3,
 * `GoTrueClient.__loadSession`). L'application renvoyait donc à l'écran de
 * connexion un collecteur qui n'avait rien perdu, au milieu du marché, sans
 * réseau pour se reconnecter. Plan J2b, précision 1.
 *
 * On n'en tire que l'identifiant du collecteur, pour ouvrir **sa** base locale.
 * Aucun jeton n'est utilisé d'ici : tout envoi repasse par supabase-js, qui
 * renouvelle la session au retour du réseau — ou la déclare finie.
 */

/** La formule de `SupabaseClient` (`@supabase/supabase-js`, `dist/index.mjs:635`). */
export function cleSessionPour(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

export function lireSessionGardee(
  stockage: Pick<Storage, 'getItem'>,
  cle: string,
): { userId: string } | null {
  try {
    const brut = stockage.getItem(cle);
    if (!brut) return null;
    const session = JSON.parse(brut) as {
      refresh_token?: unknown;
      user?: { id?: unknown } | null;
    } | null;
    // Sans jeton de renouvellement, la session ne pourra jamais reprendre :
    // ouvrir la tournée montrerait une file qui ne partira pas sous ce compte.
    if (!session || typeof session.refresh_token !== 'string') return null;
    const id = session.user?.id;
    return typeof id === 'string' && id !== '' ? { userId: id } : null;
  } catch {
    return null;
  }
}
```

Run : `npm run test -w @kolek/collecteur -- src/session-gardee.test.ts`
Attendu : PASS, 10 épreuves.

- [ ] **Étape 3 : `supabase.ts` passe la clé explicitement**

Remplacer tout le contenu de `apps/collecteur/src/supabase.ts` (CRLF) par :

```ts
import { createClient } from '@supabase/supabase-js';

import { cleSessionPour } from './session-gardee';

const url = import.meta.env.VITE_SUPABASE_URL;
const cle = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !cle) {
  throw new Error('Configuration Supabase absente. Copier .env.example vers .env.');
}

/**
 * La clé sous laquelle la session est gardée, exportée pour que `App.tsx` lise
 * la même sans la recalculer ailleurs. Sa valeur est celle que supabase-js
 * prenait déjà par défaut — `session-gardee.test.ts` le vérifie — donc aucune
 * session ouverte n'est perdue au déploiement.
 */
export const CLE_SESSION = cleSessionPour(url);

export const supabase = createClient(url, cle, { auth: { storageKey: CLE_SESSION } });
```

Puis `node crlf.mjs apps/collecteur/src/supabase.ts apps/collecteur/src/session-gardee.ts apps/collecteur/src/session-gardee.test.ts`.

- [ ] **Étape 4 : écrire l'épreuve du démarrage**

**Corrigé après exécution (écart 37).** Cette épreuve suppose un `localStorage`. Node 26 prive jsdom du sien, et `apps/collecteur/vitest.config.ts` ne branchait pas le module de préparation qui en fournit un (l'administration le fait). Sans lui, une épreuve qui vérifie qu'on n'écrit rien dans le navigateur passerait faute de navigateur. D'abord, dans le bloc `test` de `apps/collecteur/vitest.config.ts` :

```ts
    // Le même `localStorage` en mémoire que `packages/ui`, et une seule copie :
    // Node prive jsdom du sien, et sans lui un test qui vérifie qu'on n'écrit
    // rien dans le navigateur passerait faute de navigateur.
    setupFiles: ['../../packages/ui/vitest.setup.ts'],
```

Lancer la suite complète avant et après : une épreuve qui change de statut se voit. Ajouter `apps/collecteur/vitest.config.ts` au commit de la tâche.

Créer `apps/collecteur/src/App.test.tsx` :

```tsx
import { AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Le démarrage de l'application, avec et sans réseau (plan J2b, précisions 1
 * et 2). Le critère de réussite de la spec commence ici : « téléphone redémarré
 * au marché, il ouvre l'application et voit sa tournée ».
 */

const getSession = vi.fn();
const maybeSingle = vi.fn();
const effacerTourneeDe = vi.fn();
let surChangement: (evenement: string, session: unknown) => void = () => {};

vi.mock('./supabase', () => ({
  CLE_SESSION: 'sb-test-auth-token',
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (rappel: typeof surChangement) => {
        surChangement = rappel;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: () => Promise.resolve({ error: null }),
    },
    from: () => ({ select: () => ({ maybeSingle: () => maybeSingle() }) }),
  },
}));
vi.mock('./hors-ligne/moteur', () => ({
  effacerTourneeDe: (id: string) => effacerTourneeDe(id),
}));
vi.mock('./cache', () => ({ viderCache: () => {} }));
vi.mock('./Connexion', () => ({ Connexion: () => <div>écran de connexion</div> }));
vi.mock('./Coquille', () => ({
  Coquille: ({ collecteurId }: { collecteurId: string }) => <div>coquille de {collecteurId}</div>,
}));
vi.mock('./ecrans/MotDePasseOublie', () => ({ MotDePasseOublie: () => null }));
vi.mock('./ecrans/NouveauMotDePasse', () => ({ NouveauMotDePasse: () => null }));

const { default: App } = await import('./App');

const SESSION = { user: { id: 'col-1' } };
const GARDEE = JSON.stringify({
  access_token: 'a',
  refresh_token: 'r',
  expires_at: 1,
  user: { id: 'col-1' },
});

beforeEach(() => {
  maybeSingle.mockResolvedValue({ data: { id: 'col-1' }, error: null });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  getSession.mockReset();
  maybeSingle.mockReset();
  effacerTourneeDe.mockReset();
});

describe('ouvrir l’application', () => {
  it('ouvre la tournée du collecteur connecté', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null });

    render(<App />);

    expect(await screen.findByText('coquille de col-1')).toBeTruthy();
  });

  it('sans réseau et jeton expiré, reprend la session gardée sur le téléphone', async () => {
    localStorage.setItem('sb-test-auth-token', GARDEE);
    getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    });

    render(<App />);

    expect(await screen.findByText('coquille de col-1')).toBeTruthy();
  });

  it('ne reprend rien quand l’échec ne vient pas du réseau', async () => {
    // Une session que le serveur a refusée est finie : la rouvrir enverrait la
    // file sous une identité morte.
    localStorage.setItem('sb-test-auth-token', GARDEE);
    getSession.mockResolvedValue({ data: { session: null }, error: new AuthSessionMissingError() });

    render(<App />);

    expect(await screen.findByText('écran de connexion')).toBeTruthy();
  });

  it('renvoie à la connexion sans session gardée, même sans réseau', async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    });

    render(<App />);

    expect(await screen.findByText('écran de connexion')).toBeTruthy();
  });
});

describe('le compte non rattaché', () => {
  it('ne se déclare pas sur une lecture en échec (précision 2)', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'TypeError: Failed to fetch', code: '' },
    });

    render(<App />);
    await screen.findByText('coquille de col-1');
    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    await act(async () => {});

    expect(screen.queryByText('Compte non rattaché')).toBeNull();
    expect(screen.getByText('coquille de col-1')).toBeTruthy();
  });

  it('se déclare quand la fiche est vraiment absente', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    render(<App />);

    expect(await screen.findByText('Compte non rattaché')).toBeTruthy();
  });
});

describe('la fin de session', () => {
  it('efface la tournée du collecteur qui sort, et rend l’écran de connexion', async () => {
    getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    render(<App />);
    await screen.findByText('coquille de col-1');

    act(() => surChangement('SIGNED_OUT', null));

    expect(effacerTourneeDe).toHaveBeenCalledWith('col-1');
    expect(await screen.findByText('écran de connexion')).toBeTruthy();
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/App.test.tsx`
Attendu : FAIL. Au moins « sans réseau et jeton expiré » (l'écran de connexion s'affiche), « ne se déclare pas sur une lecture en échec » (« Compte non rattaché » s'affiche) et « efface la tournée » (`effacerTourneeDe` jamais appelé).

- [ ] **Étape 5 : réécrire `App.tsx`**

Remplacer tout le contenu de `apps/collecteur/src/App.tsx` (CRLF) par :

```tsx
import { Bouton, EcranMessage } from '@kolek/ui';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';

import { viderCache } from './cache';
import { Connexion } from './Connexion';
import { Coquille } from './Coquille';
import { MotDePasseOublie } from './ecrans/MotDePasseOublie';
import { NouveauMotDePasse } from './ecrans/NouveauMotDePasse';
import { effacerTourneeDe } from './hors-ligne/moteur';
import { lireSessionGardee } from './session-gardee';
import { CLE_SESSION, supabase } from './supabase';

/**
 * L'état du compte une fois la session ouverte.
 *
 * `orphelin` est le cas ajouté le 2026-08-23 avec la connexion Google : une
 * session valide dont l'utilisateur n'a **aucune ligne dans `collecteurs`**.
 *
 * Ce cas ne devrait pas se produire — `disable_signup` est vrai sur le projet,
 * donc GoTrue refuse une adresse inconnue avant même d'ouvrir une session. Mais
 * ce réglage vit dans un tableau de bord, pas dans ce dépôt : il se décoche en
 * deux clics, sans que personne relise ce fichier. Et le jour où il se décoche,
 * la différence entre « l'application s'ouvre vide » et « l'application dit
 * pourquoi » est la différence entre un collecteur qui appelle GTCS et un
 * collecteur qui croit avoir perdu ses clients.
 */
type Compte = 'inconnu' | 'collecteur' | 'orphelin';

/** La session gardée, ou rien — y compris quand le navigateur refuse l'accès au stockage. */
function collecteurGarde(): string | null {
  try {
    return lireSessionGardee(localStorage, CLE_SESSION)?.userId ?? null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  /**
   * Le collecteur d'une session gardée sur le téléphone, quand le réseau manque
   * pour la renouveler. Voir `session-gardee.ts` : sans lui, un collecteur hors
   * ligne depuis plus d'une heure retombait sur l'écran de connexion.
   */
  const [collecteurHorsLigne, setCollecteurHorsLigne] = useState<string | null>(null);
  const [pret, setPret] = useState(false);
  const [compte, setCompte] = useState<Compte>('inconnu');

  const collecteurId = session?.user.id ?? collecteurHorsLigne;

  /** Le dernier collecteur ouvert : c'est sa tournée qu'une fin de session efface. */
  const dernier = useRef<string | null>(null);
  useEffect(() => {
    if (collecteurId) dernier.current = collecteurId;
  }, [collecteurId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      setSession(data.session);
      // Seul un échec **réseau** autorise la reprise. Une session que le
      // serveur a refusée est finie : le collecteur doit se reconnecter.
      if (!data.session && error && isAuthRetryableFetchError(error)) {
        setCollecteurHorsLigne(collecteurGarde());
      }
      setPret(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evenement, s) => {
      // Toute fin de session vide le cache de navigation, pas seulement le
      // bouton « Déconnexion ». Corrigé par l'audit du 2026-08-23 : la coquille
      // appelait bien `viderCache` sur une sortie explicite, mais un jeton
      // expiré — ou une session révoquée depuis un autre appareil — laissait en
      // mémoire les noms et les soldes des clients jusqu'au rechargement.
      // `SIGNED_OUT` couvre les trois cas d'un seul endroit.
      if (evenement === 'SIGNED_OUT') {
        viderCache();
        setCompte('inconnu');
        setCollecteurHorsLigne(null);
        // La tournée s'efface avec la session ; la file, jamais (spec J2b
        // §4.5) : elle attend que ce collecteur se reconnecte pour partir.
        if (dernier.current) void effacerTourneeDe(dernier.current);
      }
      // Une vraie session remplace toujours la session gardée.
      if (s) setCollecteurHorsLigne(null);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let vivant = true;

    // La politique RLS borne déjà cette lecture à sa propre ligne : le compte
    // demande « ma fiche », et reçoit soit sa fiche, soit rien.
    void supabase
      .from('collecteurs')
      .select('id')
      .maybeSingle()
      .then(({ data, error }) => {
        // Une lecture en échec ne dit rien du compte. La prendre pour une
        // absence affichait « Compte non rattaché » à un collecteur qui n'avait
        // perdu que le réseau (plan J2b, précision 2). Le compte reste
        // `inconnu`, et la coquille s'ouvre.
        if (!vivant || error) return;
        setCompte(data ? 'collecteur' : 'orphelin');
      });

    return () => {
      vivant = false;
    };
  }, [session]);

  if (!pret) return null;

  // Deux chemins traités **avant** la session, et l'ordre compte. Le lien
  // d'invitation ouvre une session en atterrissant : sans ce branchement,
  // l'application afficherait sa coquille et le prospect n'aurait jamais
  // l'écran où choisir son mot de passe.
  //
  // Le chemin est lu une fois, comme le fait `apps/site/src/App.tsx` : deux
  // destinations ne justifient pas une bibliothèque de routage, et on n'y passe
  // qu'une fois.
  const chemin = window.location.pathname.replace(/\/+$/, '');
  if (chemin === '/nouveau-mot-de-passe') return <NouveauMotDePasse />;
  if (chemin === '/mot-de-passe-oublie') return <MotDePasseOublie />;

  if (!collecteurId) return <Connexion />;

  if (compte === 'orphelin') {
    return (
      <EcranMessage
        titre="Compte non rattaché"
        message="Cette adresse n’est associée à aucun collecteur Kolek. C’est GTCS qui ouvre les comptes : contacte ton interlocuteur pour faire activer le tien."
      >
        <Bouton onClick={() => void supabase.auth.signOut()}>Se déconnecter</Bouton>
      </EcranMessage>
    );
  }

  // `inconnu` : la fiche est en cours de lecture, ou le réseau manque. On montre
  // la coquille plutôt qu'un écran d'attente — elle a ses propres états de
  // chargement, et hors ligne c'est la seule chose utile à montrer.
  //
  // `key` : deux collecteurs se relaient sur un même téléphone. Un changement
  // de compte remonte la coquille entière, sans rien garder du précédent.
  return (
    <Coquille
      key={collecteurId}
      collecteurId={collecteurId}
      onDeconnexion={() => {
        setSession(null);
        setCollecteurHorsLigne(null);
      }}
    />
  );
}
```

Puis `node crlf.mjs apps/collecteur/src/App.tsx apps/collecteur/src/App.test.tsx`.

Run : `npm run test -w @kolek/collecteur -- src/App.test.tsx`
Attendu : PASS, 7 épreuves. (La coquille y est un témoin ; le typage de `Coquille.tsx`, qui ne connaît pas encore `collecteurId`, se règle à l'étape 7 et se vérifie à l'étape 8.)

- [ ] **Étape 6 : adapter l'épreuve de la coquille**

Dans `apps/collecteur/src/Coquille.test.tsx` (CRLF) :

1. Supprimer la ligne `const getUser = vi.fn();`.
2. Dans la simulation de `./supabase`, supprimer la ligne `      getUser: () => getUser(),`.
3. Juste après la ligne `vi.mock('./cache', () => ({ viderCache: vi.fn() }));`, ajouter :

```tsx
// Le moteur du hors-ligne est remplacé : la coquille le démarre, ce fichier
// vérifie qu'elle le fait pour le bon collecteur, pas ce que le moteur fait.
const demarrerMoteur = vi.fn((..._args: unknown[]) => () => {});
const ecouterChangements = vi.fn((..._args: unknown[]) => () => {});
vi.mock('./hors-ligne/moteur', () => ({
  demarrerMoteur: (...args: unknown[]) => demarrerMoteur(...args),
  ecouterChangements: (...args: unknown[]) => ecouterChangements(...args),
}));
```

4. Remplacer le témoin de `./ecrans/Clients` :

```tsx
vi.mock('./ecrans/Clients', () => ({
  Clients: ({ onRetrait }: { onRetrait: (c: { id: string; nom: string }) => void }) => (
    <>
      <div>écran Clients</div>
```

par :

```tsx
vi.mock('./ecrans/Clients', () => ({
  Clients: ({
    onRetrait,
    revision,
  }: {
    onRetrait: (c: { id: string; nom: string }) => void;
    revision: number;
  }) => (
    <>
      <div>écran Clients</div>
      <div>révision {revision}</div>
```

5. Dans `beforeEach`, supprimer la ligne `  getUser.mockResolvedValue({ data: { user: { id: 'collecteur-1' } } });`.
6. Dans `afterEach`, remplacer la ligne `  getUser.mockReset();` par :

```tsx
  demarrerMoteur.mockClear();
  ecouterChangements.mockClear();
```

7. Remplacer **toutes** les occurrences de `<Coquille onDeconnexion={vi.fn()} />` par `<Coquille collecteurId="collecteur-1" onDeconnexion={vi.fn()} />` (douze occurrences ; les compter avant et après).
8. Ajouter à la fin du fichier :

```tsx
describe('le moteur du hors-ligne', () => {
  it('démarre pour le collecteur de la session, et s’arrête avec la coquille', () => {
    const arreter = vi.fn();
    demarrerMoteur.mockReturnValueOnce(arreter);

    const { unmount } = render(<Coquille collecteurId="collecteur-1" onDeconnexion={vi.fn()} />);

    expect(demarrerMoteur).toHaveBeenCalledWith(expect.anything(), 'collecteur-1');
    unmount();
    expect(arreter).toHaveBeenCalled();
  });

  it('fait relire les écrans quand le moteur signale un changement', async () => {
    let signaler: () => void = () => {};
    ecouterChangements.mockImplementationOnce((...args: unknown[]) => {
      signaler = args[0] as () => void;
      return () => {};
    });

    render(<Coquille collecteurId="collecteur-1" onDeconnexion={vi.fn()} />);
    expect(await screen.findByText('révision 0')).toBeTruthy();

    act(() => signaler());

    expect(await screen.findByText('révision 1')).toBeTruthy();
  });
});
```

9. Ajouter `act` à l'import de `@testing-library/react` en tête du fichier.

Run : `npm run test -w @kolek/collecteur -- src/Coquille.test.tsx`
Attendu : FAIL — `demarrerMoteur` n'est jamais appelé, et « révision 1 » n'apparaît pas.

- [ ] **Étape 7 : la coquille reçoit l'identité et démarre le moteur**

Dans `apps/collecteur/src/Coquille.tsx` (CRLF) :

1. Après la ligne `import { Retrait } from './ecrans/Retrait';`, ajouter :

```tsx
import { demarrerMoteur, ecouterChangements } from './hors-ligne/moteur';
```

2. Remplacer :

```tsx
export function Coquille({ onDeconnexion }: { onDeconnexion: () => void }) {
```

par :

```tsx
export function Coquille({
  collecteurId,
  onDeconnexion,
}: {
  /**
   * L'identité vient de la session, ou de la session gardée quand le réseau
   * manque (`App.tsx`). Elle était lue ici par `getUser()`, qui fait un
   * aller-retour : hors ligne, elle restait nulle et aucun geste n'était
   * possible (plan J2b, précision 3).
   */
  collecteurId: string;
  onDeconnexion: () => void;
}) {
```

3. Supprimer la ligne `  const [collecteurId, setCollecteurId] = useState<string | null>(null);`.
4. Remplacer :

```tsx
  useEffect(() => {
    // `collecteur_id` doit accompagner chaque écriture : la politique RLS
    // l'exige au `with check`. On le lit une fois, à l'ouverture.
    void supabase.auth.getUser().then(({ data }) => setCollecteurId(data.user?.id ?? null));
  }, []);
```

par :

```tsx
  /**
   * Le collecteur dont le moteur du hors-ligne tourne.
   *
   * Les écrans lisent la tournée par `lectureCourante`, qui ne connaît que le
   * moteur démarré — et React lance les effets des enfants **avant** ceux du
   * parent. Sans cette attente, le premier écran lirait avant que le moteur
   * sache pour qui.
   */
  const [moteurDe, setMoteurDe] = useState<string | null>(null);

  useEffect(() => {
    const arreter = demarrerMoteur(supabase, collecteurId);
    setMoteurDe(collecteurId);
    return () => {
      arreter();
      setMoteurDe(null);
    };
  }, [collecteurId]);

  // Une passe qui a envoyé, une tournée rechargée : les écrans se relisent,
  // par la même révision qu'après une écriture.
  useEffect(() => ecouterChangements(() => setRevision((r) => r + 1)), []);
```

5. Remplacer la ligne `        {contenu}` par `        {moteurDe === collecteurId && contenu}`.

Puis `node crlf.mjs apps/collecteur/src/Coquille.tsx apps/collecteur/src/Coquille.test.tsx`.

Run : `npm run test -w @kolek/collecteur -- src/Coquille.test.tsx src/App.test.tsx src/session-gardee.test.ts`
Attendu : PASS — 14, 7 et 10 épreuves.

- [ ] **Étape 8 : toute l'application, typage, lint, commit**

```bash
npm run test -w @kolek/collecteur
npx tsc -b apps/collecteur
npm run verifier:lint
git add apps/collecteur/src/session-gardee.ts apps/collecteur/src/session-gardee.test.ts apps/collecteur/src/supabase.ts apps/collecteur/src/App.tsx apps/collecteur/src/App.test.tsx apps/collecteur/src/Coquille.tsx apps/collecteur/src/Coquille.test.tsx
git commit -m "feat(hors-ligne): ouvrir la tournee sans reseau, et demarrer le moteur" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Attendu : toutes les épreuves de l'application au vert, typage sans erreur, lint à 0 erreur.

---

## Tâche 12 : l'accueil, la liste et la fiche lisent la tournée

**Le code livré diffère de cette tâche.** Écart 40 (garde des épreuves contre la production, commit `6014efc`) et commentaires de `chargerProfil` corrigés (commit `2172e7c`). Le dépôt fait foi ; les blocs ci-dessous restent le plan d'origine.

**Fichiers :**
- Créer : `apps/collecteur/src/hors-ligne/vues.ts`, `apps/collecteur/src/hors-ligne/vues.test.ts`
- Modifier : `apps/collecteur/src/lectures.ts`, `apps/collecteur/src/lectures.test.ts`
- Modifier : `apps/collecteur/src/lectures-ecrans.ts` (`chargerProfil`, `chargerFicheClient`), `apps/collecteur/src/lectures-ecrans.test.ts`
- Modifier : `apps/collecteur/src/ecrans/Clients.tsx`, `apps/collecteur/src/ecrans/Clients.test.tsx` (LF)
- Modifier : `supabase/tests/lectures-paginees.test.ts`

**Interfaces :**
- Consomme : `lectureCourante()` (tâche 10) ; `Tournee`, `ProfilLocal` (tâche 1) ; les types `TableauCollecteur` (`lectures.ts`), `FicheClient` et `Profil` (`lectures-ecrans.ts`), inchangés.
- Produit (`vues.ts`) : `class TourneeAbsente extends Error`, `tableauDepuis(t: Tournee, maintenant: number): TableauCollecteur`, `interface ClientListe`, `interface CarteListe`, `interface ListeClients { clients: ClientListe[]; cartes: CarteListe[] }`, `listeDepuis(t: Tournee): ListeClients`, `MISES_SUR_FICHE = 40`, `ficheDepuis(t: Tournee, clientId: string): FicheClient | null`, `profilDepuis(p: ProfilLocal | null, t: Tournee): Profil`.
- Produit (`lectures.ts`) : `chargerListeClients(): Promise<ListeClients>`. `chargerTableauCollecteur`, `chargerProfil` et `chargerFicheClient` gardent leur signature.
- Précision 11.

- [ ] **Étape 1 : écrire l'épreuve des vues**

Créer `apps/collecteur/src/hors-ligne/vues.test.ts` :

```ts
import { soldeRestituable } from '@kolek/core';
import { describe, expect, it } from 'vitest';

import { INSTANT, carte, client, tournee } from './fabriques';
import type { MiseLocale, ProfilLocal } from './modele';
import { TourneeAbsente, ficheDepuis, listeDepuis, profilDepuis, tableauDepuis } from './vues';

const MAINTENANT = Date.parse('2026-09-13T12:00:00.000Z');
const ilYA = (ms: number) => new Date(MAINTENANT - ms).toISOString();
const mise = (id: string, carteId: string, quand: string, reste: Partial<MiseLocale> = {}): MiseLocale => ({
  id,
  carteId,
  montant: 1000,
  encaisseLe: quand,
  estCommission: false,
  ...reste,
});

describe('l’accueil, calculé sur la tournée', () => {
  // « Aujourd'hui » part de minuit local : la mise du jour est posée à l'instant
  // même, celle d'hier trente heures avant — vrai sous tous les fuseaux.
  const T = tournee({
    clients: [client('c1', 'Awa'), client('c2', 'Bintou')],
    cartes: [
      carte('k1', 'c1', { mise: 1000, misesEncaissees: 5 }),
      carte('k2', 'c2', { mise: 500, misesEncaissees: 30 }),
      carte('k3', 'c2', { mise: 2000, misesEncaissees: 31, statut: 'cloturee' }),
    ],
    mises: [
      mise('hier', 'k1', ilYA(30 * 3_600_000)),
      mise('m1', 'k1', ilYA(0)),
      mise('m2', 'k2', ilYA(0), { montant: 500, estCommission: true }),
    ],
  });

  it('compte les clients, les cartes actives, l’encours et l’encaissé depuis minuit', () => {
    expect(tableauDepuis(T, MAINTENANT)).toMatchObject({
      clients: 2,
      cartesActives: 2,
      encaisseAujourdhui: 1500,
      encoursTotal: soldeRestituable(5, 1000) + soldeRestituable(30, 500),
    });
  });

  it('propose la carte active la plus avancée, avec le nom de son client', () => {
    expect(tableauDepuis(T, MAINTENANT).carteDuJour).toEqual({
      carteId: 'k2',
      clientId: 'c2',
      nom: 'Bintou',
      mise: 500,
      misesEncaissees: 30,
      solde: soldeRestituable(30, 500),
    });
  });

  it('départage deux cartes aussi avancées par leur identifiant, pour ne pas changer d’un rendu à l’autre', () => {
    const egales = tournee({
      clients: [client('c1')],
      cartes: [carte('kb', 'c1', { misesEncaissees: 7 }), carte('ka', 'c1', { misesEncaissees: 7 })],
    });
    expect(tableauDepuis(egales, MAINTENANT).carteDuJour?.carteId).toBe('ka');
  });

  it('montre les cinq dernières mises, la plus récente d’abord, nommées', () => {
    const six = tournee({
      clients: [client('c1', 'Awa')],
      cartes: [carte('k1', 'c1')],
      mises: [1, 2, 3, 4, 5, 6].map((n) => mise(`m${n}`, 'k1', ilYA(n * 60_000))),
    });

    const { dernieres } = tableauDepuis(six, MAINTENANT);

    expect(dernieres.map((d) => d.quand)).toEqual([1, 2, 3, 4, 5].map((n) => ilYA(n * 60_000)));
    expect(dernieres[0]).toEqual({ nom: 'Awa', montant: 1000, estCommission: false, quand: ilYA(60_000) });
  });

  it('n’a pas de carte du jour sans carte active', () => {
    expect(tableauDepuis(tournee({ clients: [client('c1')] }), MAINTENANT).carteDuJour).toBeNull();
  });
});

describe('la liste des clients', () => {
  it('trie les noms à la française, accents compris, puis par identifiant', () => {
    const t = tournee({
      clients: [client('c3', 'Zoé'), client('c2', 'Émile'), client('c1', 'awa'), client('c0', 'Émile')],
    });
    expect(listeDepuis(t).clients.map((c) => c.id)).toEqual(['c1', 'c0', 'c2', 'c3']);
  });

  it('rend les colonnes que l’écran lisait du serveur, cartes clôturées comprises', () => {
    const t = tournee({
      clients: [{ ...client('c1', 'Awa'), marche: 'Adjamé', telephone: '0700', avisActifs: true }],
      cartes: [carte('k1', 'c1', { statut: 'cloturee', misesEncaissees: 31 })],
    });

    expect(listeDepuis(t)).toEqual({
      clients: [{ id: 'c1', nom: 'Awa', marche: 'Adjamé', telephone: '0700', avis_actifs: true }],
      cartes: [
        { id: 'k1', client_id: 'c1', mise: 1000, statut: 'cloturee', mises_encaissees: 31, ouverte_le: INSTANT },
      ],
    });
  });
});

describe('la fiche d’un client', () => {
  it('n’existe pas pour un client absent du téléphone', () => {
    expect(ficheDepuis(tournee(), 'c9')).toBeNull();
  });

  it('rend ses cartes, la plus récente d’abord, et les seules mises de ses cartes', () => {
    const t = tournee({
      clients: [client('c1', 'Awa'), client('c2', 'Bintou')],
      cartes: [
        carte('ancienne', 'c1', { ouverteLe: '2026-06-01T08:00:00.000Z', statut: 'cloturee' }),
        carte('recente', 'c1', { ouverteLe: '2026-09-01T08:00:00.000Z' }),
        carte('autre', 'c2'),
      ],
      mises: [mise('m1', 'recente', ilYA(60_000)), mise('m2', 'autre', ilYA(0)), mise('m3', 'recente', ilYA(0))],
    });

    const fiche = ficheDepuis(t, 'c1');

    expect(fiche?.cartes.map((k) => k.id)).toEqual(['recente', 'ancienne']);
    expect(fiche?.mises.map((m) => m.id)).toEqual(['m3', 'm1']);
  });

  it('borne les versements à quarante, comme la lecture qu’elle remplace', () => {
    const t = tournee({
      clients: [client('c1')],
      cartes: [carte('k1', 'c1')],
      mises: Array.from({ length: 45 }, (_, i) => mise(`m${i}`, 'k1', ilYA(i * 1000))),
    });
    expect(ficheDepuis(t, 'c1')?.mises).toHaveLength(40);
  });
});

describe('le profil', () => {
  const PROFIL: ProfilLocal = {
    nom: 'Awa',
    telephone: '+2250700000000',
    zone: 'Adjamé',
    palier: 'pro',
    abonnementStatut: 'actif',
    abonnementEcheance: null,
    titulaireId: null,
    lueLe: INSTANT,
  };

  it('compte les clients et les cartes actives de la tournée', () => {
    const t = tournee({
      clients: [client('c1'), client('c2')],
      cartes: [carte('k1', 'c1'), carte('k2', 'c2', { statut: 'cloturee' })],
    });

    expect(profilDepuis(PROFIL, t)).toEqual({
      nom: 'Awa',
      telephone: '+2250700000000',
      zone: 'Adjamé',
      palier: 'pro',
      abonnementStatut: 'actif',
      abonnementEcheance: null,
      titulaireId: null,
      clients: 2,
      cartesActives: 1,
    });
  });

  it('refuse d’inventer un profil jamais lu sur ce téléphone', () => {
    expect(() => profilDepuis(null, tournee())).toThrow(TourneeAbsente);
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts`
Attendu : FAIL, « Failed to resolve import "./vues" ».

- [ ] **Étape 2 : écrire `vues.ts`**

Créer `apps/collecteur/src/hors-ligne/vues.ts` :

```ts
import { soldeRestituable } from '@kolek/core';

import type { TableauCollecteur } from '../lectures';
import type { FicheClient, Profil } from '../lectures-ecrans';
import type { ProfilLocal, Tournee } from './modele';

/**
 * Ce que les écrans de collecte lisent, calculé sur la tournée du téléphone.
 *
 * Spec J2b §5.4 : en ligne comme hors ligne, un seul chemin. Chaque vue rend
 * exactement la forme de la lecture réseau qu'elle remplace, pour que les
 * écrans ne changent pas de forme en changeant de source.
 *
 * Fonctions pures : la tournée arrive déjà réappliquée (`lireTournee`), et
 * l'heure est un paramètre.
 */

/**
 * La tournée n'a jamais été chargée sur ce téléphone.
 *
 * Levée plutôt qu'une liste vide : « aucun client » dit à un collecteur qui en
 * a quarante que son carnet a disparu. La vérité est qu'il n'est pas encore là.
 */
export class TourneeAbsente extends Error {
  constructor() {
    super('Ta tournée n’est pas encore sur ce téléphone. Connecte-toi une fois au réseau pour la charger.');
    this.name = 'TourneeAbsente';
  }
}

/** Un ordre total, qui ne dépend ni de la langue ni du moteur de tri. */
function parId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Le plus récent d'abord. Par valeur d'horloge, pas par texte : le serveur écrit `+00:00`, le téléphone `Z`. */
function plusRecentDabord(a: string, b: string): number {
  return Date.parse(b) - Date.parse(a);
}

export function tableauDepuis(t: Tournee, maintenant: number): TableauCollecteur {
  const noms = new Map(t.clients.map((c) => [c.id, c.nom]));
  const cartes = new Map(t.cartes.map((k) => [k.id, k]));

  // Minuit local, pas UTC : « aujourd'hui » est la journée du collecteur, à Abidjan.
  const minuit = new Date(maintenant);
  minuit.setHours(0, 0, 0, 0);
  const encaisseAujourdhui = t.mises
    .filter((m) => Date.parse(m.encaisseLe) >= minuit.getTime())
    .reduce((somme, m) => somme + m.montant, 0);

  const actives = t.cartes.filter((k) => k.statut === 'active');
  // La plus avancée : c'est celle dont le cycle se termine en premier.
  const plusAvancee = [...actives].sort(
    (a, b) => b.misesEncaissees - a.misesEncaissees || parId(a, b),
  )[0];

  return {
    clients: t.clients.length,
    cartesActives: actives.length,
    encaisseAujourdhui,
    encoursTotal: actives.reduce((somme, k) => somme + soldeRestituable(k.misesEncaissees, k.mise), 0),
    carteDuJour: plusAvancee
      ? {
          carteId: plusAvancee.id,
          clientId: plusAvancee.clientId,
          nom: noms.get(plusAvancee.clientId) ?? 'Client',
          mise: plusAvancee.mise,
          misesEncaissees: plusAvancee.misesEncaissees,
          solde: soldeRestituable(plusAvancee.misesEncaissees, plusAvancee.mise),
        }
      : null,
    dernieres: [...t.mises]
      .sort((a, b) => plusRecentDabord(a.encaisseLe, b.encaisseLe) || parId(a, b))
      .slice(0, 5)
      .map((m) => {
        const carte = cartes.get(m.carteId);
        return {
          nom: (carte && noms.get(carte.clientId)) ?? 'Client',
          montant: m.montant,
          estCommission: m.estCommission,
          quand: m.encaisseLe,
        };
      }),
  };
}

/** Un client de la liste, sous les noms de colonnes que `Clients.tsx` lisait du serveur. */
export interface ClientListe {
  id: string;
  nom: string;
  marche: string | null;
  telephone: string | null;
  avis_actifs: boolean;
}

export interface CarteListe {
  id: string;
  client_id: string;
  mise: number;
  statut: 'active' | 'cloturee';
  mises_encaissees: number;
  ouverte_le: string;
}

export interface ListeClients {
  clients: ClientListe[];
  cartes: CarteListe[];
}

export function listeDepuis(t: Tournee): ListeClients {
  return {
    // « Émile » entre « awa » et « Zoé » : l'ordre d'un carnet, pas celui des octets.
    clients: [...t.clients]
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || parId(a, b))
      .map((c) => ({
        id: c.id,
        nom: c.nom,
        marche: c.marche,
        telephone: c.telephone,
        avis_actifs: c.avisActifs,
      })),
    cartes: [...t.cartes].sort(parId).map((k) => ({
      id: k.id,
      client_id: k.clientId,
      mise: k.mise,
      statut: k.statut,
      mises_encaissees: k.misesEncaissees,
      ouverte_le: k.ouverteLe,
    })),
  };
}

/** Les versements montrés sur la fiche : la borne de la lecture réseau qu'elle remplace. */
export const MISES_SUR_FICHE = 40;

export function ficheDepuis(t: Tournee, clientId: string): FicheClient | null {
  const client = t.clients.find((c) => c.id === clientId);
  if (!client) return null;

  // L'ordre d'ouverture décroissant : `FicheClient.tsx` en tire le numéro de cycle.
  const cartes = t.cartes
    .filter((k) => k.clientId === clientId)
    .sort((a, b) => plusRecentDabord(a.ouverteLe, b.ouverteLe) || parId(a, b));
  const siennes = new Set(cartes.map((k) => k.id));

  return {
    id: client.id,
    nom: client.nom,
    telephone: client.telephone,
    marche: client.marche,
    activite: client.activite,
    avisActifs: client.avisActifs,
    cartes: cartes.map((k) => ({
      id: k.id,
      mise: k.mise,
      statut: k.statut,
      misesEncaissees: k.misesEncaissees,
      ouverteLe: k.ouverteLe,
      clotureeLe: k.clotureeLe,
    })),
    // Les mises des cartes actives et celles du jour (§5.1). L'historique
    // complet d'une carte clôturée reste un écran en ligne.
    mises: t.mises
      .filter((m) => siennes.has(m.carteId))
      .sort((a, b) => plusRecentDabord(a.encaisseLe, b.encaisseLe) || parId(a, b))
      .slice(0, MISES_SUR_FICHE)
      .map((m) => ({
        id: m.id,
        montant: m.montant,
        encaisseLe: m.encaisseLe,
        estCommission: m.estCommission,
      })),
  };
}

export function profilDepuis(p: ProfilLocal | null, t: Tournee): Profil {
  // Jamais lu sur ce téléphone : mieux vaut « indisponible » qu'un palier ou un
  // statut d'abonnement inventés, qui décident de ce que l'écran permet.
  if (!p) throw new TourneeAbsente();
  return {
    nom: p.nom,
    telephone: p.telephone,
    zone: p.zone,
    palier: p.palier,
    abonnementStatut: p.abonnementStatut,
    abonnementEcheance: p.abonnementEcheance,
    titulaireId: p.titulaireId,
    clients: t.clients.length,
    cartesActives: t.cartes.filter((k) => k.statut === 'active').length,
  };
}
```

Puis `node crlf.mjs apps/collecteur/src/hors-ligne/vues.ts apps/collecteur/src/hors-ligne/vues.test.ts`.

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts`
Attendu : PASS, 12 épreuves.

- [ ] **Étape 3 : l'épreuve des lectures de l'accueil et de la liste**

Remplacer tout le contenu de `apps/collecteur/src/lectures.test.ts` (CRLF) par :

```ts
import { describe, expect, it, vi } from 'vitest';

import { carte, client, tournee } from './hors-ligne/fabriques';
import { tourneeVide, type Tournee } from './hors-ligne/modele';
import { TourneeAbsente } from './hors-ligne/vues';

/**
 * L'accueil et la liste des clients lisent le téléphone, jamais le réseau
 * (spec J2b §5.4).
 *
 * L'épreuve « au-delà de mille lignes » qui vivait ici a suivi la pagination
 * là où elle est partie : `hors-ligne/rafraichir.test.ts`, et contre le vrai
 * PostgREST, `supabase/tests/lectures-paginees.test.ts`.
 */

const lectureCourante = vi.fn();

vi.mock('./hors-ligne/moteur', () => ({ lectureCourante: () => lectureCourante() }));

const { chargerListeClients, chargerTableauCollecteur } = await import('./lectures');

const lu = (t: Tournee) => ({ tournee: t, operations: [], refus: [], profil: null });

describe('les lectures de la collecte', () => {
  it('calculent sur la tournée gardée', async () => {
    lectureCourante.mockResolvedValue(
      lu(tournee({ clients: [client('c1', 'Awa')], cartes: [carte('k1', 'c1')] })),
    );

    expect((await chargerTableauCollecteur()).clients).toBe(1);
    expect((await chargerListeClients()).clients.map((c) => c.nom)).toEqual(['Awa']);
  });

  it('disent que la tournée manque, plutôt que de rendre une liste vide', async () => {
    lectureCourante.mockResolvedValue(lu(tourneeVide()));

    await expect(chargerTableauCollecteur()).rejects.toThrow(TourneeAbsente);
    await expect(chargerListeClients()).rejects.toThrow(TourneeAbsente);
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/lectures.test.ts`
Attendu : FAIL, « chargerListeClients is not a function ».

- [ ] **Étape 4 : réécrire `lectures.ts`**

Remplacer tout le contenu de `apps/collecteur/src/lectures.ts` (CRLF) par :

```ts
import { lectureCourante } from './hors-ligne/moteur';
import { TourneeAbsente, listeDepuis, tableauDepuis, type ListeClients } from './hors-ligne/vues';

/**
 * Les chiffres du collecteur, pour l'écran d'accueil, et la liste de ses clients.
 *
 * Depuis J2b, ils se calculent sur la tournée gardée par le téléphone — en
 * ligne comme hors ligne, un seul chemin (spec §5.4). Le réseau n'entre ici que
 * par `hors-ligne/rafraichir.ts`, qui recharge la tournée tout ou rien.
 *
 * L'écran affichait jadis les chiffres de la maquette — « 48 500 FCFA »,
 * « 24 clients », « +8 % vs hier ». Depuis que le collecteur encaisse pour de
 * vrai, un montant inventé sur l'écran d'accueil est un montant qu'il peut
 * prendre pour sa recette du jour. La règle tient toujours : ne rendre que ce
 * que la tournée sait dire.
 */

export interface Carte {
  id: string;
  client_id: string;
  mise: number;
  statut: 'active' | 'cloturee';
  mises_encaissees: number;
}

export interface MiseRecente {
  id: string;
  carte_id: string;
  montant: number;
  est_commission: boolean;
  encaisse_le: string;
}

export interface TableauCollecteur {
  clients: number;
  cartesActives: number;
  encaisseAujourdhui: number;
  /** Ce que le collecteur doit encore à ses clients, toutes cartes actives. */
  encoursTotal: number;
  /**
   * La carte active la plus avancée : celle qu'on finit avant les autres.
   *
   * `carteId` et `clientId` l'accompagnent depuis le 2026-08-25 : sans eux, les
   * commandes posées sous la carte de l'accueil ne pouvaient que renvoyer vers
   * un écran — « Encaisser » ouvrait la liste des clients, à charge pour le
   * collecteur d'y retrouver celui qu'il venait de voir. Un bouton posé sous
   * une carte doit agir sur cette carte.
   */
  carteDuJour: {
    carteId: string;
    clientId: string;
    nom: string;
    mise: number;
    misesEncaissees: number;
    solde: number;
  } | null;
  dernieres: Array<{ nom: string; montant: number; estCommission: boolean; quand: string }>;
}

export async function chargerTableauCollecteur(): Promise<TableauCollecteur> {
  const { tournee } = await lectureCourante();
  if (tournee.lueLe === null) throw new TourneeAbsente();
  return tableauDepuis(tournee, Date.now());
}

/** La liste de l'écran des clients. Voir `listeDepuis` pour la forme. */
export async function chargerListeClients(): Promise<ListeClients> {
  const { tournee } = await lectureCourante();
  if (tournee.lueLe === null) throw new TourneeAbsente();
  return listeDepuis(tournee);
}
```

Puis `node crlf.mjs apps/collecteur/src/lectures.ts apps/collecteur/src/lectures.test.ts`.

Run : `npm run test -w @kolek/collecteur -- src/lectures.test.ts`
Attendu : PASS, 2 épreuves.

- [ ] **Étape 5 : le profil et la fiche lisent la tournée**

Mesurer d'abord : `node crlf.mjs --mesurer apps/collecteur/src/lectures-ecrans.ts apps/collecteur/src/lectures-ecrans.test.ts` — attendu `nbsp=0` et `nbsp=1`.

Dans `apps/collecteur/src/lectures-ecrans.test.ts` (CRLF) :

1. Dans la liste de l'import dynamique, supprimer la ligne `  chargerProfil,`.
2. Supprimer l'épreuve entière qui commence par `  it('chargerProfil compte tous les clients et toutes les cartes actives', async () => {` et finit à sa ligne `  });` (neuf lignes, suivies d'une ligne vide à supprimer aussi).

Dans `apps/collecteur/src/lectures-ecrans.ts` (CRLF) :

1. Après la ligne `import { chargerTout } from './pagination';`, ajouter :

```ts
import { lectureCourante } from './hors-ligne/moteur';
import { ficheDepuis, profilDepuis } from './hors-ligne/vues';
```

2. Remplacer la fonction `chargerProfil` entière — de `export async function chargerProfil(): Promise<Profil> {` jusqu'à sa accolade fermante, juste avant le commentaire `/* ------------------------ Cartes clôturables (Retrait) ------------------- */` — par :

```ts
/**
 * Le profil gardé sur le téléphone, et les comptes de la tournée (spec J2b
 * §5.4). Lu hors ligne : l'abonnement décide au geste de ce qu'on peut
 * inscrire (§7), et la coquille doit dire qui est connecté.
 *
 * Lève `TourneeAbsente` quand le profil n'a jamais été lu : les crochets de
 * `commission.ts` retombent alors sur leurs valeurs prudentes.
 */
export async function chargerProfil(): Promise<Profil> {
  const { tournee, profil } = await lectureCourante();
  return profilDepuis(profil, tournee);
}
```

3. Remplacer la documentation et le corps de `chargerFicheClient` — du bloc `/**` qui commence par ` * Tout ce que le collecteur doit savoir d'un client, en une lecture.` jusqu'à l'accolade fermante de la fonction, juste avant `/* ------------------------ Historique d'une carte ------------------------- */` — par :

```ts
/**
 * Tout ce que le collecteur doit savoir d'un client, lu sur la tournée du
 * téléphone (spec J2b §5.4) : ses cartes, et les mises de ses cartes actives et
 * du jour. L'historique complet d'une carte clôturée reste en ligne
 * (`chargerHistoriqueCarte`).
 *
 * `null` : ce client n'est pas sur ce téléphone.
 */
export async function chargerFicheClient(clientId: string): Promise<FicheClient | null> {
  const { tournee } = await lectureCourante();
  return ficheDepuis(tournee, clientId);
}
```

Puis `node crlf.mjs apps/collecteur/src/lectures-ecrans.ts apps/collecteur/src/lectures-ecrans.test.ts` — attendu `nbsp=0` et `nbsp=1`, inchangés.

Run : `npm run test -w @kolek/collecteur -- src/lectures-ecrans.test.ts`
Attendu : PASS.

- [ ] **Étape 6 : l'épreuve de l'écran des clients**

`apps/collecteur/src/ecrans/Clients.test.tsx` est en **LF** : ne pas lui passer `crlf.mjs`.

1. Remplacer la ligne `import { formatMontant, MISES_PAR_CYCLE } from '@kolek/core';` par `import { MISES_PAR_CYCLE } from '@kolek/core';`.
2. Remplacer :

```tsx
const from = vi.fn();

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => from(table),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'col1' } } }) },
  },
}));
```

par :

```tsx
const chargerListeClients = vi.fn();

// L'écran lit la tournée du téléphone (J2b) : c'est cette lecture qu'on
// remplace. Le module réseau l'est aussi, pour qu'aucun client Supabase ne se
// construise pendant les épreuves.
vi.mock('../lectures', () => ({ chargerListeClients: () => chargerListeClients() }));
vi.mock('../supabase', () => ({ supabase: {} }));
```

3. Remplacer la documentation et la fonction `brancherSupabase` — du bloc `/**` qui commence par ` * @param total Ce que le serveur dit posséder` jusqu'à l'accolade fermante de la fonction — par :

```tsx
/** La tournée que l'écran reçoit : les trois clients et les quatre cartes ci-dessus, par défaut. */
function brancherTournee(clients: unknown[] = CLIENTS, cartes: unknown[] = CARTES) {
  chargerListeClients.mockResolvedValue({ clients, cartes });
}
```

4. Remplacer **toutes** les occurrences de `brancherSupabase();` par `brancherTournee();`.
5. Dans `afterEach`, remplacer `  from.mockReset();` par `  chargerListeClients.mockReset();`.
6. Supprimer le bloc de documentation qui commence par `/**` suivi de ` * La liste tronquee, et pourquoi elle doit le dire.` **et** le `describe('liste tronquee par le serveur', () => { … });` qui le suit, jusqu'à sa ligne `});` incluse.
7. Dans la documentation du `describe('pagination de la liste'`, remplacer les trois lignes :

```tsx
 * solde restituable calcule sur le mauvais. C'est exactement le defaut que le
 * bandeau de troncature ci-dessus surveille — et une pagination mal branchee le
 * ferait rentrer par la porte de derriere, sans bandeau pour le dire.
```

par :

```tsx
 * solde restituable calcule sur le mauvais — et rien a l'ecran ne le dirait.
```

8. Supprimer la fonction `brancherListe` et sa documentation (`/** Les memes faux que \`brancherSupabase\`, avec une liste de clients au choix. */` et le corps jusqu'à son accolade fermante).
9. Remplacer **toutes** les occurrences de `brancherListe(beaucoup(120));` par `brancherTournee(beaucoup(120), []);`.
10. Ajouter à la fin du fichier :

```tsx
describe('la tournée pas encore chargée sur le téléphone', () => {
  it('le dit, au lieu d’annoncer « aucun client »', async () => {
    const { TourneeAbsente } = await import('../hors-ligne/vues');
    chargerListeClients.mockRejectedValue(new TourneeAbsente());

    rendre();

    // « Aucun client pour l'instant » dirait à un collecteur qui en a quarante
    // que son carnet a disparu.
    expect(await screen.findByText(/pas encore sur ce téléphone/)).toBeTruthy();
    expect(screen.queryByText('Aucun client pour l’instant.')).toBeNull();
  });
});
```

Contrôle : `grep -c "brancherSupabase\|brancherListe\|from\." apps/collecteur/src/ecrans/Clients.test.tsx` rend `0`.

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Clients.test.tsx`
Attendu : FAIL — l'écran appelle encore `supabase.from`, qui n'existe plus dans la simulation.

- [ ] **Étape 7 : l'écran des clients lit la tournée**

Mesurer : `node crlf.mjs --mesurer apps/collecteur/src/ecrans/Clients.tsx` — attendu `CRLF nbsp=0`.

Dans `apps/collecteur/src/ecrans/Clients.tsx` (CRLF) :

1. Remplacer :

```tsx
import { creerClientAvecCarte, definirConsentementAvis } from '../ecritures';
import { chargerTout, LIGNES_AFFICHEES_PAR_PAGE } from '../pagination';
import { rangCascade, usePremierRendu } from '../premier-rendu';
import { supabase } from '../supabase';
```

par :

```tsx
import { creerClientAvecCarte, definirConsentementAvis } from '../ecritures';
import { TourneeAbsente } from '../hors-ligne/vues';
import { chargerListeClients } from '../lectures';
import { LIGNES_AFFICHEES_PAR_PAGE } from '../pagination';
import { rangCascade, usePremierRendu } from '../premier-rendu';
```

2. Supprimer les trois lignes (la ligne `const [recherche, setRecherche] = useState('');` qui suit reste) :

```tsx
  /** Le nombre de clients que le serveur dit posséder, quand il en a rendu
      moins. `null` = liste entière, ou comptage indisponible. */
  const [totalServeur, setTotalServeur] = useState<number | null>(null);
```

3. Remplacer l'effet de chargement entier — de la ligne `  useEffect(() => {` qui précède `    let vivant = true;` et le commentaire `// Deux requêtes plutôt qu'une imbrication`, jusqu'à `  }, [revision]);` inclus — par :

```tsx
  useEffect(() => {
    let vivant = true;

    // La liste se lit sur la tournée du téléphone, en ligne comme hors ligne
    // (spec J2b §5.4). La pagination réseau et le recoupement du nombre de
    // clients vivent désormais dans `hors-ligne/rafraichir.ts` : une tournée
    // que le serveur dit plus longue que ce qu'il a rendu n'y est pas écrite,
    // donc cet écran ne peut plus recevoir une liste amputée (précision 11).
    void (async () => {
      try {
        const { clients, cartes } = await chargerListeClients();
        if (!vivant) return;

        const parClient = new Map<string, CarteClient[]>();
        for (const carte of cartes) {
          const liste = parClient.get(carte.client_id);
          if (liste) liste.push(carte);
          else parClient.set(carte.client_id, [carte]);
        }

        // Les clients arrivent déjà triés par nom. Les cartes d'un même client
        // sont rangées par avancement décroissant : celle qui se termine en
        // premier est celle qu'il ne faut pas oublier, et c'est elle que la
        // ligne résume.
        const construites: Ligne[] = clients.map((client) => ({
          cle: client.id,
          client,
          cartes: (parClient.get(client.id) ?? [])
            .filter((k) => k.statut === 'active')
            .sort((a, b) => b.mises_encaissees - a.mises_encaissees),
        }));

        setToutesCartes(cartes);
        setLignes(construites);
        // Une tournée arrivée après une première lecture sans elle efface le
        // message : sans cette ligne, il resterait au-dessus de la liste.
        setErreur(null);
      } catch (e) {
        if (!vivant) return;
        setErreur(e instanceof TourneeAbsente ? e.message : 'Impossible de charger tes clients.');
        // `toutesCartes` vide en même temps que `lignes` : le filtre
        // « Clôturées » lit `toutesCartes` et non `lignes`, et la liste rendue
        // n'est pas conditionnée par l'absence d'erreur.
        setLignes([]);
        setToutesCartes([]);
      }
    })();

    return () => {
      vivant = false;
    };
    // `revision` change après chaque écriture, et quand le moteur signale une
    // tournée rechargée : la liste se relit d'elle-même.
  }, [revision]);
```

4. Dans la documentation de la pagination d'affichage, remplacer les trois lignes :

```tsx
   * une personne, et un solde restituable calculé sur le mauvais — c'est
   * exactement ce que le bandeau de troncature ci-dessus surveille, et une
   * pagination posée à l'envers le ferait rentrer sans bandeau pour le dire.
```

par :

```tsx
   * une personne, et un solde restituable calculé sur le mauvais — et une
   * pagination posée à l'envers le ferait sans que rien à l'écran le dise.
```

5. Remplacer les quatre lignes :

```tsx
  // `total: totalFiltre` et non `total` : une variable du même nom vit déjà
  // dans la lecture asynchrone plus haut, où elle désigne le compte du serveur.
  // Deux `total` de sens différents dans un même fichier se confondent à la
  // relecture, et c'est la relecture qui compte ici.
```

par :

```tsx
  // `total: totalFiltre` : le nom dit ce qu'il compte — les lignes qui passent
  // la recherche et le filtre, pas les clients du collecteur.
```

6. Supprimer le commentaire qui commence par `      {/* La liste est-elle entière ?` et le bloc `{totalServeur !== null && ( … )}` qui le suit, jusqu'à sa ligne `      )}` incluse.
7. Remplacer :

```tsx
            <p className="text-sm font-body text-muted-foreground mt-1">
              La souscription arrive au jalon J2.
            </p>
```

par :

```tsx
            <p className="text-sm font-body text-muted-foreground mt-1">
              Inscris ton premier client avec le bouton ci-dessus.
            </p>
```

(La phrase annonçait pour « J2 » une souscription livrée depuis : une promesse fausse sur l'écran même que ce chantier touche.)

Puis `node crlf.mjs apps/collecteur/src/ecrans/Clients.tsx`.

Contrôle : `grep -n "supabase\|chargerTout\|totalServeur" apps/collecteur/src/ecrans/Clients.tsx` ne rend rien.

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Clients.test.tsx`
Attendu : PASS.

- [ ] **Étape 8 : la pagination se prouve contre le vrai PostgREST, là où elle a déménagé**

`chargerProfil` ne parle plus au serveur : l'épreuve qui le faisait compter 1 001 clients contre la base locale mesurerait désormais une tournée vide. Elle devient celle de `rafraichir`.

Dans `supabase/tests/lectures-paginees.test.ts` (CRLF) :

1. Tout en haut du fichier, avant la ligne `import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';`, ajouter :

```ts
import 'fake-indexeddb/auto';

```

2. Remplacer :

```ts
const { chargerCartesCloturables, chargerProfil } = await import(
  '../../apps/collecteur/src/lectures-ecrans'
);
```

par :

```ts
const { chargerCartesCloturables } = await import('../../apps/collecteur/src/lectures-ecrans');
const { rafraichir } = await import('../../apps/collecteur/src/hors-ligne/rafraichir');
const { lireProfil, lireTournee, ouvrirBase } = await import(
  '../../apps/collecteur/src/hors-ligne/stockage-local'
);
```

3. Remplacer l'épreuve :

```ts
  it('chargerProfil compte les 1 001 clients et les 1 001 cartes actives', async () => {
    const profil = await chargerProfil();

    expect(profil.clients).toBe(N);
    expect(profil.cartesActives).toBe(N);
  });
```

par :

```ts
  it('rafraichir copie sur le téléphone les 1 001 clients et les 1 001 cartes actives', async () => {
    // Remplace l'épreuve de `chargerProfil`, qui lit désormais la tournée du
    // téléphone (J2b §5.4) : c'est ici que le réseau est lu, donc ici que la
    // pagination doit tenir contre le vrai PostgREST.
    const base = await ouvrirBase(collecteur.id);

    expect(await rafraichir(collecteur.client, base, collecteur.id)).toBe('fait');

    const { tournee } = await lireTournee(base);
    expect(tournee.clients).toHaveLength(N);
    expect(tournee.cartes.filter((k) => k.statut === 'active')).toHaveLength(N);
    expect(await lireProfil(base)).not.toBeNull();
  }, 60_000);
```

Puis `node crlf.mjs supabase/tests/lectures-paginees.test.ts`.

Run (pile locale démarrée) : `npm run test:db -- supabase/tests/lectures-paginees.test.ts`
Attendu : PASS, 3 épreuves.

- [ ] **Étape 9 : toute l'application, typage, lint, commit**

```bash
npm run test -w @kolek/collecteur
npx tsc -b apps/collecteur
npm run verifier:lint
git add apps/collecteur/src/hors-ligne/vues.ts apps/collecteur/src/hors-ligne/vues.test.ts apps/collecteur/src/lectures.ts apps/collecteur/src/lectures.test.ts apps/collecteur/src/lectures-ecrans.ts apps/collecteur/src/lectures-ecrans.test.ts apps/collecteur/src/ecrans/Clients.tsx apps/collecteur/src/ecrans/Clients.test.tsx supabase/tests/lectures-paginees.test.ts
git commit -m "feat(hors-ligne): l'accueil, la liste et la fiche lisent la tournee du telephone" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Attendu : tout au vert. Si une épreuve d'un autre écran tombe sur « Aucun collecteur connecté », c'est qu'elle rend un écran qui lit la tournée sans simuler la lecture : simuler `../lectures` ou `../lectures-ecrans` dans cette épreuve, comme `Accueil.test.tsx` le fait déjà.

---

## Tâche 13 : les gestes de la collecte passent par la file

**Le code livré diffère de cette tâche.** Écarts 41 et 42 (la caisse du jour suit chaque mise acceptée ; elle compte ce que la main a encaissé, par `encaisse_par` et `restitue_par`, commit `c858944`). Le dépôt fait foi ; les blocs ci-dessous restent le plan d'origine.

**Fichiers :**
- Modifier : `apps/collecteur/src/ecritures.ts` (réécrit), `apps/collecteur/src/ecritures.test.ts`
- Modifier : `apps/collecteur/src/ecritures-ecrans.ts` ; créer `apps/collecteur/src/ecritures-ecrans.test.ts`
- Modifier : `apps/collecteur/src/hors-ligne/vues.ts`, `apps/collecteur/src/hors-ligne/vues.test.ts` (la caisse du jour)
- Modifier : `apps/collecteur/src/lectures-ecrans.ts` (`Rapprochement`, `chargerRapprochement`), `apps/collecteur/src/lectures-ecrans.test.ts`
- Modifier : `apps/collecteur/src/ecrans/Rapprochement.tsx` ; créer `apps/collecteur/src/ecrans/Rapprochement.test.tsx`

**Interfaces :**
- Consomme : `ajouter`, `annuler`, `avancer`, `Construction`, `ResultatAjout` (tâche 5) ; `construireMise`, `construireClientCarte`, `construireCarte`, `construireCaisse` (tâche 5) ; `ouvrirBase`, `lireProfil`, `modifierInstantane` (tâche 4) ; `CONTRAINTES_DE_MONTANT`, `RLS_PORTES_D_ENTREE` (tâche 3) ; `apresGeste`, `collecteurCourant`, `demanderRafraichissement`, `lectureCourante` (tâche 10) ; `TourneeAbsente` (tâche 12).
- Produit (`ecritures.ts`) :
  - `ajouterAuTelephone<O extends Operation>(collecteurId: string, construire: Construction<O>): Promise<ResultatAjout<O>>` ;
  - `enregistrerMise(collecteurId, carteId, montant, encaisseLe?: Date, options?: { sursisMs?: number }): Promise<{ ok: true; miseId: string; operationId: string } | { ok: false; echec: EchecEcriture }>` ;
  - `annulerMise(collecteurId: string, operationId: string): Promise<'annulee' | 'partie' | 'absente'>` ;
  - `avancerEnvoi(collecteurId: string, operationId: string): Promise<void>` ;
  - `creerClientAvecCarte`, `ouvrirCarte`, `definirConsentementAvis`, `modifierClient`, `codeDErreur`, `phraseEcriture` : mêmes signatures.
- Produit (`ecritures-ecrans.ts`) : `type ResultatCaisse = { ok: true } | { ok: false; echec: EchecEcriture }`, `declarerCaisse(collecteurId: string, date: string, montant: number): Promise<ResultatCaisse>`.
- Produit (`lectures-ecrans.ts`) : `interface Rapprochement { date: string; cashAttendu: number; cashDeclare: number | null; ecart: number | null; provisoire: boolean }` — `ligneId` disparaît.
- Produit (`vues.ts`) : `rapprochementDepuis(t: Tournee, operations: readonly Operation[], maintenant: number): Rapprochement`.
- Écarts 1 et 2 ; précisions 7 et 9.

- [ ] **Étape 1 : écrire l'épreuve des écritures**

Mesurer : `node crlf.mjs --mesurer apps/collecteur/src/ecritures.ts apps/collecteur/src/ecritures.test.ts` — attendu `CRLF nbsp=0` pour les deux.

Dans `apps/collecteur/src/ecritures.test.ts` :

1. Remplacer la première ligne `import { beforeEach, describe, expect, it, vi } from 'vitest';` par :

```ts
import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { carte, client, tournee } from './hors-ligne/fabriques';
import {
  CLE_INSTANTANE,
  CLE_PROFIL,
  compterFile,
  fermerBases,
  lireOperations,
  ouvrirBase,
} from './hors-ligne/stockage-local';
```

2. Juste après le bloc `vi.mock('./supabase', () => ({ … }));`, ajouter :

```ts
// Le moteur est remplacé : ce fichier vérifie qu'un geste le réveille, pas ce
// qu'une passe fait. Sans collecteur courant, les retouches de la tournée après
// une écriture en ligne ne s'appliquent pas — elles ont leur épreuve ailleurs.
const apresGeste = vi.fn();
vi.mock('./hors-ligne/moteur', () => ({
  apresGeste: () => apresGeste(),
  collecteurCourant: () => null,
  demanderRafraichissement: () => {},
}));
```

3. Remplacer l'import dynamique :

```ts
const {
  codeDErreur,
  creerClientAvecCarte,
  definirConsentementAvis,
  enregistrerMise,
  modifierClient,
} =
  await import('./ecritures');
```

par :

```ts
const {
  annulerMise,
  codeDErreur,
  creerClientAvecCarte,
  definirConsentementAvis,
  enregistrerMise,
  modifierClient,
  ouvrirCarte,
} = await import('./ecritures');
```

4. Remplacer l'épreuve :

```ts
  it('préfère le message du déclencheur au SQLSTATE', () => {
    // Un doublon remonte parfois en 23505 depuis la clé primaire, parfois en
    // P0001 depuis le déclencheur qui l'intercepte en premier. Les deux doivent
    // donner la même phrase.
    expect(codeDErreur({ code: '23505', message: 'duplicate key' })).toBe('DOUBLON');
    expect(codeDErreur({ code: 'P0001', message: 'DOUBLON' })).toBe('DOUBLON');
  });
```

par :

```ts
  it('préfère le message du déclencheur au SQLSTATE', () => {
    // `mises_avant_insert` lève `DOUBLON` sous 23505, avant toute autre règle.
    expect(codeDErreur({ code: '23505', message: 'DOUBLON' })).toBe('DOUBLON');
    expect(codeDErreur({ code: 'P0001', message: 'DOUBLON' })).toBe('DOUBLON');
  });

  it('ne prend pour un doublon qu’une clé primaire violée (écart 1)', () => {
    // Trois tables écrites par le collecteur ont d'autres unicités. Traduire
    // leur violation en « déjà enregistrée » annonçait un succès qui n'a pas eu lieu.
    const doublon = (contrainte: string) => ({
      code: '23505',
      message: `duplicate key value violates unique constraint "${contrainte}"`,
    });
    expect(codeDErreur(doublon('mises_pkey'))).toBe('DOUBLON');
    expect(codeDErreur(doublon('caisses_jour_collecteur_id_date_key'))).toBe('CONFLIT_UNIQUE');
    expect(codeDErreur(doublon('mises_une_commission_par_carte'))).toBe('CONFLIT_UNIQUE');
    expect(codeDErreur({ code: '23505', message: 'duplicate key' })).toBe('CONFLIT_UNIQUE');
  });

  it('nomme la fenêtre de date au lieu de dire « réessaie » (écart 2)', () => {
    expect(codeDErreur({ code: 'P0001', message: 'DATE_INVALIDE' })).toBe('DATE_INVALIDE');
  });
```

5. Supprimer les deux `describe` entiers `describe('refus décidés avant tout aller-retour', () => { … });` et `describe('ce que le téléphone envoie, et ce qu’il n’envoie pas', () => { … });`. Leurs garanties vivent désormais dans `hors-ligne/gestes.test.ts` (identifiant tiré sur le téléphone, champs vides en `null`, refus avant écriture) et `hors-ligne/envoyer.test.ts` (`est_commission` jamais envoyé).
6. À leur place, insérer :

```ts
describe('les gestes de la collecte entrent dans la file du téléphone (J2b)', () => {
  beforeEach(async () => {
    await fermerBases();
    globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
    insert.mockReset();
    apresGeste.mockReset();
    const base = await ouvrirBase(COLLECTEUR);
    await base.put(
      'tournee',
      tournee({
        clients: [client(CLIENT, 'Awa')],
        cartes: [carte(CARTE, CLIENT, { mise: 1000, misesEncaissees: 3 })],
      }),
      CLE_INSTANTANE,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('écrit la mise sur le téléphone, sans aller-retour réseau, et réveille le moteur', async () => {
    const r = await enregistrerMise(COLLECTEUR, CARTE, 1000);

    expect(r.ok).toBe(true);
    expect(insert).not.toHaveBeenCalled();
    const [op] = await lireOperations(await ouvrirBase(COLLECTEUR));
    expect(op).toMatchObject({
      type: 'mise',
      collecteurId: COLLECTEUR,
      charge: { carteId: CARTE, montant: 1000 },
    });
    if (!r.ok || op?.type !== 'mise') throw new Error('mise');
    expect(r.miseId).toBe(op.charge.id);
    expect(r.operationId).toBe(op.id);
    expect(apresGeste).toHaveBeenCalledTimes(1);
  });

  it('garde la mise de la fiche annulable six secondes, et l’annule', async () => {
    const r = await enregistrerMise(COLLECTEUR, CARTE, 1000, new Date(), { sursisMs: 6000 });
    if (!r.ok) throw new Error('mise');
    const [op] = await lireOperations(await ouvrirBase(COLLECTEUR));
    expect(Date.parse(op!.envoyableApres) - Date.parse(op!.faiteLe)).toBe(6000);

    expect(await annulerMise(COLLECTEUR, r.operationId)).toBe('annulee');
    expect(await compterFile(await ouvrirBase(COLLECTEUR))).toBe(0);
  });

  it('refuse une mise hors bornes, ou sur une carte absente du téléphone, sans rien écrire', async () => {
    expect(await enregistrerMise(COLLECTEUR, CARTE, 250)).toMatchObject({
      ok: false,
      echec: { code: 'MISE_HORS_BORNES' },
    });
    expect(await enregistrerMise(COLLECTEUR, 'carte-inconnue', 1000)).toMatchObject({
      ok: false,
      echec: { code: 'CARTE_ABSENTE' },
    });
    expect(await compterFile(await ouvrirBase(COLLECTEUR))).toBe(0);
    expect(apresGeste).not.toHaveBeenCalled();
  });

  it('inscrit le client et sa carte en une seule opération, champs vides en null', async () => {
    const r = await creerClientAvecCarte(COLLECTEUR, { nom: ' Bintou ', telephone: '  ', mise: 1000 });

    const ops = await lireOperations(await ouvrirBase(COLLECTEUR));
    expect(ops).toHaveLength(1);
    const [op] = ops;
    if (!r.ok || op?.type !== 'client_carte') throw new Error('inscription');
    expect(r.resultat).toEqual({ clientId: op.charge.client.id, carteId: op.charge.carte.id });
    expect(op.charge.client).toMatchObject({ nom: 'Bintou', telephone: null, marche: null });
  });

  it('ouvre une carte de plus sur un client du téléphone', async () => {
    const r = await ouvrirCarte(COLLECTEUR, CLIENT, 2000);

    const [op] = await lireOperations(await ouvrirBase(COLLECTEUR));
    if (!r.ok || op?.type !== 'carte') throw new Error('carte');
    expect(r.carteId).toBe(op.charge.id);
    expect(op.charge).toMatchObject({ clientId: CLIENT, mise: 2000 });
  });

  it('refuse l’inscription et la carte quand le dernier statut connu n’est pas actif', async () => {
    const base = await ouvrirBase(COLLECTEUR);
    await base.put(
      'profil',
      {
        nom: 'Awa',
        telephone: '+2250700000000',
        zone: null,
        palier: 'pro',
        abonnementStatut: 'suspendu',
        abonnementEcheance: null,
        titulaireId: null,
        lueLe: '2026-09-13T09:00:00.000Z',
      },
      CLE_PROFIL,
    );

    expect(await creerClientAvecCarte(COLLECTEUR, { nom: 'Bintou', mise: 1000 })).toMatchObject({
      ok: false,
      echec: { code: 'ABONNEMENT_INACTIF' },
    });
    expect(await ouvrirCarte(COLLECTEUR, CLIENT, 1000)).toMatchObject({
      ok: false,
      echec: { code: 'ABONNEMENT_INACTIF' },
    });
    // L'encaissement, lui, reste permis (§7).
    expect((await enregistrerMise(COLLECTEUR, CARTE, 1000)).ok).toBe(true);
  });

  it('dit « stockage » quand la base du téléphone ne s’ouvre pas, et ne montre rien', async () => {
    await fermerBases();
    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('stockage bloqué');
      },
    });

    expect(await enregistrerMise(COLLECTEUR, CARTE, 1000)).toMatchObject({
      ok: false,
      echec: { code: 'STOCKAGE' },
    });
    expect(apresGeste).not.toHaveBeenCalled();
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/ecritures.test.ts`
Attendu : FAIL — `annulerMise` et `ouvrirCarte` ne sont pas des fonctions, la mise part par `insert`, et `codeDErreur` rend `DOUBLON` sur `caisses_jour_collecteur_id_date_key`.

- [ ] **Étape 2 : réécrire `ecritures.ts`**

Remplacer tout le contenu de `apps/collecteur/src/ecritures.ts` par :

```ts
import { CONTRAINTES_DE_MONTANT, RLS_PORTES_D_ENTREE } from './hors-ligne/classer';
import { ajouter, annuler, avancer, type Construction, type ResultatAjout } from './hors-ligne/file';
import { construireCarte, construireClientCarte, construireMise } from './hors-ligne/gestes';
import type { Operation, Tournee } from './hors-ligne/modele';
import { apresGeste, collecteurCourant, demanderRafraichissement } from './hors-ligne/moteur';
import { lireProfil, modifierInstantane, ouvrirBase, type BaseLocale } from './hors-ligne/stockage-local';
import { PHRASES, phraseEcriture, type EchecEcriture } from './phrases';
import { supabase } from './supabase';

/**
 * Les écritures de l'application collecteur.
 *
 * ## Deux chemins, depuis J2b
 *
 * **Les gestes de la collecte** — encaisser, inscrire un client avec sa carte,
 * ouvrir une carte — entrent dans la file du téléphone (`hors-ligne/file.ts`),
 * en ligne comme hors ligne. Le geste est vérifié contre la tournée et écrit sur
 * le disque dans une même transaction ; le synchroniseur l'envoie ensuite, dans
 * l'ordre, et consigne tout refus. Rien n'est montré comme fait avant d'être sur
 * le disque (spec §4.1).
 *
 * **Les corrections** — consentement aux avis, fiche du client — restent en
 * ligne (spec §1.2) : ce sont des modifications, donc des conflits possibles
 * entre deux appareils. Après succès, la tournée du téléphone est retouchée pour
 * que l'écran ne montre pas l'ancienne valeur jusqu'au prochain rafraîchissement.
 *
 * Aucune Edge Function ici, et c'est voulu : les `GRANT INSERT` nomment les
 * colonnes qu'un collecteur peut écrire, et les politiques RLS exigent
 * `collecteur_id = auth.uid()`. Un serveur intermédiaire déplacerait le contrôle
 * hors de l'endroit où il est déjà appliqué.
 *
 * ## Les identifiants viennent du téléphone
 *
 * `crypto.randomUUID()`, pas la base (`hors-ligne/gestes.ts`). C'est le
 * mécanisme anti-double-comptage du produit : un rejeu porte le même
 * identifiant, la clé primaire est violée, et `mises_avant_insert` répond
 * `DOUBLON`. Laisser la base engendrer l'identifiant ferait de chaque rejeu une
 * seconde mise — de l'argent compté deux fois.
 */

export type { EchecEcriture };

/**
 * La phrase d'un code court — la table vit dans `phrases.ts`. Réexportée ici
 * parce que `encaisserPour` et les écrans l'importent d'ici.
 */
export { phraseEcriture };

/**
 * Traduit une erreur PostgREST en code court, pour les écritures restées en
 * ligne. Les opérations de la file, elles, passent par `hors-ligne/classer.ts`.
 *
 * L'ordre compte : les messages des déclencheurs voyagent dans `message` avec
 * le code SQLSTATE générique `P0001`, donc on les cherche avant de se rabattre
 * sur le SQLSTATE.
 */
export function codeDErreur(erreur: { code?: string; message?: string } | null): string {
  if (!erreur) return 'INCONNU';
  const message = erreur.message ?? '';

  for (const cle of [
    'DOUBLON',
    'CARTE_INTROUVABLE',
    'CARTE_CLOTUREE',
    'CYCLE_COMPLET',
    'MONTANT_INVALIDE',
    // Écart 2 : la fenêtre de date tombait sur « Réessaie », une consigne qui
    // ne peut pas réussir.
    'DATE_INVALIDE',
  ]) {
    if (message.includes(cle)) return cle;
  }

  // 23514 : une contrainte CHECK. Deux familles se cachent derrière ce seul
  // code — les bornes de longueur du texte et les bornes de montant — et
  // Postgres ne les distingue que par le nom de la contrainte, qu'il place dans
  // le message. L'écran d'ouverture de carte n'envoie que `mise` : y lire
  // « Une des informations saisies est trop longue » envoyait le collecteur
  // relire un nom de client qui n'était pas en cause.
  if (erreur.code === '23514') {
    return CONTRAINTES_DE_MONTANT.some((nom) => message.includes(nom)) ? 'BORNE_MONTANT' : 'BORNE';
  }
  // 23505 : une unicité violée. Doublon seulement sur une clé primaire — un
  // rejeu. Écart 1 : `caisses_jour (collecteur_id, date)` ou la commission
  // unique d'une carte sortaient aussi en « déjà enregistrée ».
  if (erreur.code === '23505') {
    return /_pkey"/.test(message) ? 'DOUBLON' : 'CONFLIT_UNIQUE';
  }
  // 42501 : RLS ou liste blanche de colonnes. Un refus de policy sur `clients`
  // ou `cartes` désigne l'abonnement — l'autre condition, `collecteur_id =
  // auth.uid()`, est posée depuis la session. Tout le reste est un défaut de
  // l'application, pas de la saisie.
  if (erreur.code === '42501') {
    return RLS_PORTES_D_ENTREE.test(message) ? 'ABONNEMENT_INACTIF' : 'DROIT_REFUSE';
  }

  return 'INCONNU';
}

function echec(erreur: { code?: string; message?: string } | null): EchecEcriture {
  return phraseEcriture(codeDErreur(erreur));
}

/**
 * Vérifie un geste contre la tournée et l'écrit dans la file, puis réveille le
 * moteur. Partagée avec `ecritures-ecrans.ts` pour la caisse du jour.
 *
 * Une base qui ne s'ouvre pas — stockage bloqué, navigation privée stricte —
 * refuse le geste avec `STOCKAGE` : rien n'est montré comme fait (§4.1).
 */
export async function ajouterAuTelephone<O extends Operation>(
  collecteurId: string,
  construire: Construction<O>,
): Promise<ResultatAjout<O>> {
  let base: BaseLocale;
  try {
    base = await ouvrirBase(collecteurId);
  } catch {
    return { ok: false, echec: phraseEcriture('STOCKAGE') };
  }
  const resultat = await ajouter(base, construire);
  if (resultat.ok) apresGeste();
  return resultat;
}

/** Le dernier `abonnement_statut` lu sur ce téléphone. `null` : jamais lu, le serveur tranchera. */
async function dernierStatutConnu(collecteurId: string): Promise<string | null> {
  try {
    return (await lireProfil(await ouvrirBase(collecteurId)))?.abonnementStatut ?? null;
  } catch {
    return null;
  }
}

/**
 * Après une écriture restée en ligne : la tournée du téléphone prend la valeur
 * écrite, puis le moteur la relit du serveur. Le report évite que l'écran
 * remontre l'ancienne valeur le temps d'un aller-retour ; le rafraîchissement
 * remet la vérité du serveur par-dessus.
 */
async function retoucherTournee(modifier: (t: Tournee) => void): Promise<void> {
  const collecteurId = collecteurCourant();
  if (!collecteurId) return;
  try {
    await modifierInstantane(await ouvrirBase(collecteurId), modifier);
  } catch {
    // Disque illisible : le rafraîchissement demandé ci-dessous remettra la
    // tournée d'accord.
  }
  demanderRafraichissement();
}

export interface NouveauClient {
  nom: string;
  telephone?: string;
  marche?: string;
  activite?: string;
  /** Mise journalière de la première carte. */
  mise: number;
  /** Le client accepte de recevoir un avis à chaque mouvement. Faux par
      défaut : laisser un numéro n'est pas consentir à être notifié. */
  avisActifs?: boolean;
}

export interface ResultatCreation {
  clientId: string;
  carteId: string;
}

/**
 * Inscrit un client et lui ouvre sa première carte — une seule opération.
 *
 * Le synchroniseur l'envoie en deux étapes, client puis carte, et garde
 * l'avancement de chacune : un rejeu reprend là où il s'était arrêté, et un
 * client arrivé sans sa carte ne se perd plus dans un message d'erreur.
 */
export async function creerClientAvecCarte(
  collecteurId: string,
  saisie: NouveauClient,
): Promise<{ ok: true; resultat: ResultatCreation } | { ok: false; echec: EchecEcriture }> {
  const abonnementStatut = await dernierStatutConnu(collecteurId);
  const resultat = await ajouterAuTelephone(
    collecteurId,
    construireClientCarte({ collecteurId, maintenant: Date.now(), abonnementStatut }, saisie),
  );
  if (!resultat.ok) return resultat;
  return {
    ok: true,
    resultat: {
      clientId: resultat.operation.charge.client.id,
      carteId: resultat.operation.charge.carte.id,
    },
  };
}

/**
 * Enregistre une mise sur une carte.
 *
 * `options.sursisMs` : le sursis de la fiche client (§7). L'opération est sur
 * le disque dès l'appui, et ne part qu'après ; « Annuler » la retire d'ici là
 * (`annulerMise`). Sans sursis, elle part au plus tôt.
 *
 * `est_commission` n'est jamais envoyé : le serveur le décide seul, en
 * regardant si la carte a déjà encaissé.
 */
export async function enregistrerMise(
  collecteurId: string,
  carteId: string,
  montant: number,
  /** Injectable pour les épreuves ; sinon l'heure du téléphone. */
  encaisseLe: Date = new Date(),
  options: { sursisMs?: number } = {},
): Promise<
  { ok: true; miseId: string; operationId: string } | { ok: false; echec: EchecEcriture }
> {
  const resultat = await ajouterAuTelephone(
    collecteurId,
    construireMise(
      { collecteurId, maintenant: Date.now(), sursisMs: options.sursisMs },
      { carteId, montant, encaisseLe },
    ),
  );
  if (!resultat.ok) return resultat;
  return { ok: true, miseId: resultat.operation.charge.id, operationId: resultat.operation.id };
}

/**
 * « Annuler » pendant le sursis. `'partie'` : l'heure est passée, l'opération
 * part ou est partie — l'écran le dit au lieu de promettre une annulation.
 */
export async function annulerMise(
  collecteurId: string,
  operationId: string,
): Promise<'annulee' | 'partie' | 'absente'> {
  const issue = await annuler(await ouvrirBase(collecteurId), operationId);
  if (issue === 'annulee') apresGeste();
  return issue;
}

/** Fait partir tout de suite une mise encore en sursis : la fiche se ferme, ou l'application passe en arrière-plan. */
export async function avancerEnvoi(collecteurId: string, operationId: string): Promise<void> {
  await avancer(await ouvrirBase(collecteurId), operationId);
  apresGeste();
}

/**
 * Enregistre — ou retire — le consentement d'un client aux avis. Reste en ligne.
 *
 * C'est la seule colonne de `clients` que cet écran écrit après coup, et la
 * seule écriture du produit qui engage la vie privée de quelqu'un qui n'est pas
 * l'utilisateur de l'application. Le collecteur est le bon porteur du geste :
 * il est devant le client. Et le retrait doit être aussi facile que l'octroi —
 * d'où un booléen plutôt qu'un `activerAvis`.
 */
export async function definirConsentementAvis(
  clientId: string,
  accepte: boolean,
): Promise<{ ok: true } | { ok: false; echec: EchecEcriture }> {
  const { data, error } = await supabase
    .from('clients')
    .update({ avis_actifs: accepte })
    .eq('id', clientId)
    .select('id');

  if (error) return { ok: false, echec: echec(error) };

  // Le `.select()` n'est pas là pour lire la ligne : il est là pour la
  // **compter**. Un `update().eq()` nu ne rend aucune erreur quand RLS ou un
  // privilège de colonne écarte la ligne — PostgREST répond 204, zéro ligne
  // touchée, `error` à null. Constaté le 2026-08-24. Un retrait de consentement
  // qu'on croit enregistré et qui ne l'est pas continue d'envoyer le solde
  // d'épargne de quelqu'un sur un téléphone qu'il partage.
  if (!data || data.length === 0) {
    return { ok: false, echec: { code: 'RIEN_ECRIT', message: PHRASES.RIEN_ECRIT! } };
  }

  await retoucherTournee((t) => {
    const client = t.clients.find((c) => c.id === clientId);
    if (client) client.avisActifs = accepte;
  });
  return { ok: true };
}

/** Les quatre champs qu'un collecteur peut corriger sur la fiche d'un client. */
export interface CorrectionClient {
  nom: string;
  telephone: string;
  marche: string;
  activite: string;
}

/**
 * Corrige la fiche d'un client. Reste en ligne.
 *
 * ## Pourquoi seuls les champs changés partent
 *
 * Envoyer tout le formulaire écraserait le marché d'un client avec une chaîne
 * vide si le champ n'avait pas été rechargé. Quand rien n'a changé, **rien ne
 * part** : pas de requête, pas de ligne au journal d'audit, et `ecrit: false`.
 *
 * ## Pourquoi le numéro emporte le consentement
 *
 * Le déclencheur de notification lit `client.telephone` **au moment de la
 * mise**. Corriger le numéro d'un client aux avis actifs enverrait son solde à
 * un numéro que personne n'a accepté. `avis_actifs: false` part **dans la même
 * requête** que le numéro : deux écritures laisseraient une fenêtre où le
 * nouveau numéro cohabite avec l'ancien consentement. Mesuré en production le
 * 2026-09-11 : 68 clients sur 81 ont les avis actifs.
 *
 * ## Pourquoi `.select('id')`
 *
 * Même raison que `definirConsentementAvis` : sans lui, un refus de RLS passe
 * pour un succès.
 */
export async function modifierClient(
  clientId: string,
  correction: CorrectionClient,
  origine: CorrectionClient,
): Promise<{ ok: true; ecrit: boolean } | { ok: false; echec: EchecEcriture }> {
  const nom = correction.nom.trim();
  if (!nom) return { ok: false, echec: phraseEcriture('NOM_VIDE') };

  const champs: Record<string, string | boolean | null> = {};

  if (nom !== origine.nom.trim()) champs.nom = nom;

  // `|| null` et non la chaîne vide : le journal d'audit doit lire « le champ
  // était vide ». La production n'a aucune chaîne vide dans ces colonnes
  // (mesuré le 2026-09-11) ; ce formulaire ne sera pas le premier à en écrire.
  for (const cle of ['telephone', 'marche', 'activite'] as const) {
    const valeur = correction[cle].trim();
    if (valeur !== origine[cle].trim()) champs[cle] = valeur || null;
  }

  // Dans la même requête, jamais dans une seconde — voir la note ci-dessus.
  if ('telephone' in champs) champs.avis_actifs = false;

  if (Object.keys(champs).length === 0) return { ok: true, ecrit: false };

  const { data, error } = await supabase
    .from('clients')
    .update(champs)
    .eq('id', clientId)
    .select('id');

  if (error) return { ok: false, echec: echec(error) };
  if (!data || data.length === 0) {
    return { ok: false, echec: { code: 'RIEN_ECRIT', message: PHRASES.RIEN_ECRIT! } };
  }

  await retoucherTournee((t) => {
    const client = t.clients.find((c) => c.id === clientId);
    if (!client) return;
    if (typeof champs.nom === 'string') client.nom = champs.nom;
    for (const cle of ['telephone', 'marche', 'activite'] as const) {
      if (cle in champs) client[cle] = champs[cle] as string | null;
    }
    if ('telephone' in champs) client.avisActifs = false;
  });
  return { ok: true, ecrit: true };
}

/**
 * Ouvre une nouvelle carte pour un client qui en avait déjà une.
 *
 * Un client ne s'inscrit qu'une fois ; il ouvre des cartes toute sa vie — après
 * les 31 mises d'un cycle, après une restitution, ou pour changer de montant.
 * Plusieurs carnets à la fois sont permis depuis
 * `20260825090000_cartes_multiples.sql` : chaque carte porte son solde, et
 * `retraits.carte_id` est unique, donc on rend l'argent d'une carte et jamais
 * d'un client.
 */
export async function ouvrirCarte(
  collecteurId: string,
  clientId: string,
  mise: number,
): Promise<{ ok: true; carteId: string } | { ok: false; echec: EchecEcriture }> {
  const abonnementStatut = await dernierStatutConnu(collecteurId);
  const resultat = await ajouterAuTelephone(
    collecteurId,
    construireCarte({ collecteurId, maintenant: Date.now(), abonnementStatut }, { clientId, mise }),
  );
  if (!resultat.ok) return resultat;
  return { ok: true, carteId: resultat.operation.charge.id };
}
```

Puis `node crlf.mjs apps/collecteur/src/ecritures.ts apps/collecteur/src/ecritures.test.ts`.

Run : `npm run test -w @kolek/collecteur -- src/ecritures.test.ts`
Attendu : PASS. `modifierClient` renvoie désormais la phrase de `NOM_VIDE` par `phraseEcriture` : le texte est identique (« Le nom du client est obligatoire. »), l'épreuve qui le lit reste verte.

- [ ] **Étape 3 : la caisse du jour, calculée sur la tournée**

Dans `apps/collecteur/src/hors-ligne/vues.test.ts` :

1. Remplacer la ligne `import { INSTANT, carte, client, tournee } from './fabriques';` par :

```ts
import { INSTANT, caisse, carte, client, operationMise, tournee } from './fabriques';
```

2. Remplacer la ligne `import { TourneeAbsente, ficheDepuis, listeDepuis, profilDepuis, tableauDepuis } from './vues';` par :

```ts
import {
  TourneeAbsente,
  ficheDepuis,
  listeDepuis,
  profilDepuis,
  rapprochementDepuis,
  tableauDepuis,
} from './vues';
```

3. Ajouter à la fin du fichier :

```ts
describe('la caisse du jour (§6.4)', () => {
  const MIDI = Date.parse('2026-09-13T12:00:00.000Z');
  const RELUE = '2026-09-13T08:00:00.000Z';

  it('reprend les chiffres du serveur quand rien du jour n’attend', () => {
    const t = tournee({
      lueLe: RELUE,
      caisses: [caisse({ id: 'l1', date: '2026-09-13', cashAttendu: 5000, cashDeclare: 4500, ecart: -500 })],
    });

    expect(rapprochementDepuis(t, [], MIDI)).toEqual({
      date: '2026-09-13',
      cashAttendu: 5000,
      cashDeclare: 4500,
      ecart: -500,
      provisoire: false,
    });
  });

  it('recalcule un attendu provisoire quand une mise du jour attend l’envoi', () => {
    const op = operationMise(1, { carteId: 'k1', encaisseLe: '2026-09-13T11:00:00.000Z' });
    // La tournée arrive réappliquée : la mise en file y est déjà.
    const t = tournee({
      lueLe: RELUE,
      mises: [mise('m0', 'k1', '2026-09-13T09:00:00.000Z'), mise(op.charge.id, 'k1', op.charge.encaisseLe)],
      retraits: [{ id: 'r1', carteId: 'k2', montantRestitue: 300, effectueLe: '2026-09-13T10:00:00.000Z' }],
      caisses: [caisse({ date: '2026-09-13', cashAttendu: 1000, cashDeclare: 1000, ecart: 0 })],
    });

    expect(rapprochementDepuis(t, [op], MIDI)).toEqual({
      date: '2026-09-13',
      cashAttendu: 1700,
      cashDeclare: 1000,
      ecart: -700,
      provisoire: true,
    });
  });

  it('sans déclaration ni attente, calcule ce que le serveur calculera', () => {
    const t = tournee({ lueLe: RELUE, mises: [mise('m1', 'k1', '2026-09-13T09:00:00.000Z')] });

    expect(rapprochementDepuis(t, [], MIDI)).toEqual({
      date: '2026-09-13',
      cashAttendu: 1000,
      cashDeclare: null,
      ecart: null,
      provisoire: false,
    });
  });

  it('se dit provisoire sur une tournée qui n’a pas été relue aujourd’hui', () => {
    expect(rapprochementDepuis(tournee({ lueLe: '2026-09-12T18:00:00.000Z' }), [], MIDI).provisoire).toBe(true);
  });

  it('découpe la journée en UTC, comme cash_attendu_du_jour', () => {
    const t = tournee({
      lueLe: RELUE,
      mises: [mise('veille', 'k1', '2026-09-12T23:30:00.000Z'), mise('jour', 'k1', '2026-09-13T00:30:00.000Z')],
    });
    expect(rapprochementDepuis(t, [], MIDI).cashAttendu).toBe(1000);
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts`
Attendu : FAIL, « rapprochementDepuis is not a function ».

- [ ] **Étape 4 : `rapprochementDepuis`, et le type qu'il rend**

Dans `apps/collecteur/src/lectures-ecrans.ts` (CRLF) :

1. Supprimer la fonction `dateUtcDuJour` et sa documentation — du bloc `/**` qui commence par ` * Le jour au sens du serveur, en UTC.` jusqu'à l'accolade fermante de la fonction. Son explication part dans `vues.ts`.
2. Remplacer l'interface `Rapprochement` et la fonction `chargerRapprochement` entières — de `export interface Rapprochement {` jusqu'à l'accolade fermante de `chargerRapprochement`, juste avant `/* -------------------------------- Profil --------------------------------- */` — par :

```ts
export interface Rapprochement {
  date: string;
  /** Posé par le serveur depuis les mises ; recalculé sur le téléphone tant que
      `provisoire`. Le collecteur ne l'écrit jamais. */
  cashAttendu: number;
  /** Ce que le collecteur déclare avoir en main. `null` s'il n'a rien déclaré. */
  cashDeclare: number | null;
  ecart: number | null;
  /** Le téléphone compte ce que le serveur n'a pas encore reçu — ou la tournée
      date d'avant aujourd'hui. Les chiffres du serveur reviennent au
      rafraîchissement. */
  provisoire: boolean;
}

/** La caisse du jour, lue sur la tournée du téléphone (spec J2b §5.4). */
export async function chargerRapprochement(): Promise<Rapprochement> {
  const { tournee, operations } = await lectureCourante();
  if (tournee.lueLe === null) throw new TourneeAbsente();
  return rapprochementDepuis(tournee, operations, Date.now());
}
```

3. Remplacer la ligne `import { ficheDepuis, profilDepuis } from './hors-ligne/vues';` par :

```ts
import { TourneeAbsente, ficheDepuis, profilDepuis, rapprochementDepuis } from './hors-ligne/vues';
```

Dans `apps/collecteur/src/lectures-ecrans.test.ts` (CRLF) : supprimer la ligne `  chargerRapprochement,` de l'import dynamique, et le `describe('le rapprochement d’une journée au-delà de mille lignes', () => { … });` entier avec la ligne vide qui le suit. Sa preuve vit dans `hors-ligne/rafraichir.test.ts` (les mises et retraits du jour, paginés).

Dans `apps/collecteur/src/hors-ligne/vues.ts` :

1. Remplacer les deux lignes d'import de types :

```ts
import type { FicheClient, Profil } from '../lectures-ecrans';
import type { ProfilLocal, Tournee } from './modele';
```

par :

```ts
import type { FicheClient, Profil, Rapprochement } from '../lectures-ecrans';
import type { Operation, ProfilLocal, Tournee } from './modele';
```

2. Ajouter à la fin du fichier :

```ts
/**
 * La caisse du jour (spec J2b §5.4, §6.4).
 *
 * **Le jour du serveur, en UTC.** `cash_attendu_du_jour` découpe la journée sur
 * `(encaisse_le at time zone 'UTC')::date`, explicitement. Même découpage ici,
 * sans quoi le collecteur déclarerait son cash pour une journée que le serveur
 * calcule autrement, et l'écart apparaîtrait sans cause visible. Abidjan est à
 * UTC+0 toute l'année : cela ne change rien aujourd'hui, par géographie et non
 * par intention.
 *
 * **Provisoire** tant que le téléphone sait quelque chose que le serveur n'a
 * pas encore compté — une mise ou une déclaration du jour en file — ou que la
 * tournée n'a pas été relue aujourd'hui. L'attendu est alors recalculé avec les
 * termes du serveur : les mises du jour, moins les restitutions du jour (depuis
 * le 2026-08-25).
 */
export function rapprochementDepuis(
  t: Tournee,
  operations: readonly Operation[],
  maintenant: number,
): Rapprochement {
  const date = new Date(maintenant).toISOString().slice(0, 10);
  const duJour = (iso: string) => new Date(iso).toISOString().slice(0, 10) === date;

  const enAttente = operations.some(
    (o) =>
      o.etat === 'en_attente' &&
      ((o.type === 'mise' && duJour(o.charge.encaisseLe)) ||
        (o.type === 'caisse' && o.charge.date === date)),
  );
  const relueAujourdhui = t.lueLe !== null && duJour(t.lueLe);
  const ligne = t.caisses.find((c) => c.date === date) ?? null;

  if (ligne && ligne.cashAttendu !== null && ligne.ecart !== null && !enAttente && relueAujourdhui) {
    return {
      date,
      cashAttendu: ligne.cashAttendu,
      cashDeclare: ligne.cashDeclare,
      ecart: ligne.ecart,
      provisoire: false,
    };
  }

  const encaisse = t.mises.filter((m) => duJour(m.encaisseLe)).reduce((s, m) => s + m.montant, 0);
  const restitue = t.retraits
    .filter((r) => duJour(r.effectueLe))
    .reduce((s, r) => s + r.montantRestitue, 0);
  const cashAttendu = encaisse - restitue;
  const cashDeclare = ligne?.cashDeclare ?? null;

  return {
    date,
    cashAttendu,
    cashDeclare,
    ecart: cashDeclare === null ? null : cashDeclare - cashAttendu,
    provisoire: ligne !== null || enAttente || !relueAujourdhui,
  };
}
```

Puis `node crlf.mjs apps/collecteur/src/hors-ligne/vues.ts apps/collecteur/src/hors-ligne/vues.test.ts apps/collecteur/src/lectures-ecrans.ts apps/collecteur/src/lectures-ecrans.test.ts` — `lectures-ecrans.test.ts` garde `nbsp=1`.

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts src/lectures-ecrans.test.ts`
Attendu : PASS — 17 épreuves pour les vues.

- [ ] **Étape 5 : écrire l'épreuve de la caisse et de la clôture**

Créer `apps/collecteur/src/ecritures-ecrans.test.ts` :

```ts
import 'fake-indexeddb/auto';

import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { caisse, carte, client, tournee } from './hors-ligne/fabriques';
import { CLE_INSTANTANE, fermerBases, lireOperations, lireTournee, ouvrirBase } from './hors-ligne/stockage-local';

const invoke = vi.fn();
const demanderRafraichissement = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock('./hors-ligne/moteur', () => ({
  apresGeste: () => {},
  collecteurCourant: () => 'col-1',
  demanderRafraichissement: () => demanderRafraichissement(),
}));

const { cloturerCarte, declarerCaisse } = await import('./ecritures-ecrans');

beforeEach(async () => {
  await fermerBases();
  globalThis.indexedDB = new IDBFactory() as unknown as typeof indexedDB;
  invoke.mockReset();
  demanderRafraichissement.mockReset();
});

describe('déclarer la caisse (§6.4)', () => {
  it('met la déclaration en file, sous l’identifiant de la ligne du jour', async () => {
    const base = await ouvrirBase('col-1');
    await base.put(
      'tournee',
      tournee({ caisses: [caisse({ id: 'ligne-du-jour', date: '2026-09-13', cashDeclare: 3000 })] }),
      CLE_INSTANTANE,
    );

    expect(await declarerCaisse('col-1', '2026-09-13', 5000)).toEqual({ ok: true });

    const [op] = await lireOperations(base);
    expect(op).toMatchObject({
      type: 'caisse',
      charge: { id: 'ligne-du-jour', date: '2026-09-13', cashDeclare: 5000 },
    });
  });

  it('refuse un montant négatif sans rien écrire', async () => {
    expect(await declarerCaisse('col-1', '2026-09-13', -1)).toMatchObject({
      ok: false,
      echec: { code: 'CAISSE_INVALIDE' },
    });
    expect(await lireOperations(await ouvrirBase('col-1'))).toEqual([]);
  });
});

describe('clôturer une carte, et le dire à la tournée', () => {
  it('porte la clôture et le retrait dans l’instantané, puis demande la relecture', async () => {
    const base = await ouvrirBase('col-1');
    await base.put(
      'tournee',
      tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1', { misesEncaissees: 31 })] }),
      CLE_INSTANTANE,
    );
    invoke.mockResolvedValue({ data: { montantRestitue: 30000, commission: 1000 }, error: null });

    expect(await cloturerCarte('k1')).toEqual({ ok: true, montantRestitue: 30000, commission: 1000 });

    const { tournee: t } = await lireTournee(base);
    // Sans ce report, la tournée proposerait d'encaisser sur une carte que le
    // serveur refusera, jusqu'au prochain rafraîchissement.
    expect(t.cartes[0]).toMatchObject({ statut: 'cloturee' });
    expect(t.retraits).toMatchObject([{ carteId: 'k1', montantRestitue: 30000 }]);
    expect(demanderRafraichissement).toHaveBeenCalled();
  });

  it('ne touche pas la tournée quand la clôture échoue', async () => {
    const base = await ouvrirBase('col-1');
    await base.put('tournee', tournee({ clients: [client('c1')], cartes: [carte('k1', 'c1')] }), CLE_INSTANTANE);
    invoke.mockResolvedValue({ data: { erreur: 'CLOTURE_PARTIELLE' }, error: null });

    expect(await cloturerCarte('k1')).toMatchObject({ ok: false, echec: { code: 'CLOTURE_PARTIELLE' } });

    expect((await lireTournee(base)).tournee.cartes[0]).toMatchObject({ statut: 'active' });
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/ecritures-ecrans.test.ts`
Attendu : FAIL — `declarerCaisse` appelle `supabase.from`, absent de la simulation ; la carte reste `active` après la clôture.

- [ ] **Étape 6 : `ecritures-ecrans.ts` — la caisse par la file, la clôture reportée**

Mesurer : `node crlf.mjs --mesurer apps/collecteur/src/ecritures-ecrans.ts` — attendu `CRLF nbsp=0`.

Dans `apps/collecteur/src/ecritures-ecrans.ts` :

1. Remplacer les deux premières lignes :

```ts
import { type EchecEcriture, codeDErreur, phraseEcriture } from './ecritures';
import { supabase } from './supabase';
```

par :

```ts
import { ajouterAuTelephone, phraseEcriture, type EchecEcriture } from './ecritures';
import { construireCaisse } from './hors-ligne/gestes';
import { collecteurCourant, demanderRafraichissement } from './hors-ligne/moteur';
import { modifierInstantane, ouvrirBase } from './hors-ligne/stockage-local';
import { supabase } from './supabase';
```

2. Dans l'en-tête du module, remplacer le paragraphe :

```ts
 * - **La caisse** s'écrit directement. `authenticated` a `insert (id,
 *   collecteur_id, date, cash_declare)` et `update (cash_declare)` sur
 *   `caisses_jour`, et rien de plus. `cash_attendu` est posé par un déclencheur
 *   depuis les mises, `ecart` est une colonne engendrée. Le collecteur déclare
 *   donc ce qu'il a en main sans jamais pouvoir toucher à ce qu'il devrait
 *   avoir — sinon masquer un manquant tiendrait en une requête.
```

par :

```ts
 * - **La caisse** entre dans la file du téléphone (J2b §6.4), et le
 *   synchroniseur l'écrit. `authenticated` a `insert (id, collecteur_id, date,
 *   cash_declare)` et `update (cash_declare)` sur `caisses_jour`, et rien de
 *   plus. `cash_attendu` est posé par un déclencheur depuis les mises, `ecart`
 *   est une colonne engendrée. Le collecteur déclare donc ce qu'il a en main
 *   sans jamais pouvoir toucher à ce qu'il devrait avoir — sinon masquer un
 *   manquant tiendrait en une requête.
```

3. Remplacer le type `ResultatCaisse`, la documentation de `declarerCaisse` et la fonction entière — de `export type ResultatCaisse =` jusqu'à l'accolade fermante de `declarerCaisse`, juste avant `/* ------------------------------- Retrait --------------------------------- */` — par :

```ts
export type ResultatCaisse = { ok: true } | { ok: false; echec: EchecEcriture };

/**
 * Déclare le cash réellement en main pour la journée — sur le téléphone d'abord.
 *
 * La déclaration entre dans la file ; le synchroniseur l'écrit « dernière
 * déclaration gagne » : insertion, puis mise à jour de `cash_declare` sur
 * conflit, sans jamais d'`upsert` — PostgREST y réaffecterait `id` et
 * `collecteur_id`, que `update` n'accorde pas (`hors-ligne/envoyer.ts`).
 *
 * L'identifiant de la ligne est tiré à la première déclaration du jour et repris
 * ensuite, depuis la tournée (plan J2b, précision 9). `cash_attendu` et `ecart`
 * restent posés par le serveur ; l'écran montre un attendu provisoire jusqu'au
 * rafraîchissement.
 */
export async function declarerCaisse(
  collecteurId: string,
  date: string,
  montant: number,
): Promise<ResultatCaisse> {
  const resultat = await ajouterAuTelephone(
    collecteurId,
    construireCaisse({ collecteurId, maintenant: Date.now() }, { date, montant }),
  );
  return resultat.ok ? { ok: true } : resultat;
}
```

4. Dans `cloturerCarte`, remplacer :

```ts
  const corps = data as { montantRestitue?: number; commission?: number; erreur?: string };
  if (corps.erreur) return { ok: false, echec: phrase(corps.erreur) };

  return {
```

par :

```ts
  const corps = data as { montantRestitue?: number; commission?: number; erreur?: string };
  if (corps.erreur) {
    // Une clôture partielle a déjà inscrit le retrait au serveur : la tournée
    // doit le relire, même si la carte n'est pas encore fermée.
    demanderRafraichissement();
    return { ok: false, echec: phrase(corps.erreur) };
  }

  await noterCloture(carteId, corps.montantRestitue ?? 0);
  return {
```

5. Juste avant la ligne `/* ------------------------------- L'équipe -------------------------------- */`, ajouter :

```ts
/**
 * La clôture réussie, portée dans l'instantané du téléphone.
 *
 * La clôture reste en ligne (spec J2b §1.2). Sans ce report, la tournée
 * garderait la carte active jusqu'au prochain rafraîchissement, et l'écran
 * proposerait d'encaisser sur une carte que le serveur refusera. Le retrait
 * noté ici porte un identifiant provisoire : le rafraîchissement le remplace
 * par la ligne du serveur.
 */
async function noterCloture(carteId: string, montantRestitue: number): Promise<void> {
  const collecteurId = collecteurCourant();
  if (!collecteurId) return;
  try {
    const maintenant = new Date().toISOString();
    await modifierInstantane(await ouvrirBase(collecteurId), (t) => {
      const carte = t.cartes.find((k) => k.id === carteId);
      if (!carte) return;
      carte.statut = 'cloturee';
      carte.clotureeLe = maintenant;
      if (!t.retraits.some((r) => r.carteId === carteId)) {
        t.retraits.push({ id: `retrait-${carteId}`, carteId, montantRestitue, effectueLe: maintenant });
      }
    });
  } catch {
    // Disque illisible : le rafraîchissement demandé ci-dessous remettra la
    // tournée d'accord.
  }
  demanderRafraichissement();
}

```

Puis `node crlf.mjs apps/collecteur/src/ecritures-ecrans.ts apps/collecteur/src/ecritures-ecrans.test.ts`.

Contrôle : `grep -n "codeDErreur\|ligneId" apps/collecteur/src/ecritures-ecrans.ts` ne rend rien.

Run : `npm run test -w @kolek/collecteur -- src/ecritures-ecrans.test.ts`
Attendu : PASS, 4 épreuves.

- [ ] **Étape 7 : écrire l'épreuve de l'écran de caisse**

Créer `apps/collecteur/src/ecrans/Rapprochement.test.tsx` :

```tsx
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** La caisse du jour, lue sur le téléphone et déclarée par la file (J2b §6.4). */

const chargerRapprochement = vi.fn();
const declarerCaisse = vi.fn();

vi.mock('../lectures-ecrans', () => ({ chargerRapprochement: () => chargerRapprochement() }));
vi.mock('../ecritures-ecrans', () => ({
  declarerCaisse: (...args: unknown[]) => declarerCaisse(...args),
}));

const { Rapprochement } = await import('./Rapprochement');
const { viderCache } = await import('../cache');

const DU_JOUR = { date: '2026-09-13', cashAttendu: 5000, cashDeclare: null, ecart: null, provisoire: false };

afterEach(() => {
  cleanup();
  viderCache();
  chargerRapprochement.mockReset();
  declarerCaisse.mockReset();
});

describe('l’attendu du jour', () => {
  it('se dit calculé par le serveur quand le serveur a tout compté', async () => {
    chargerRapprochement.mockResolvedValue(DU_JOUR);

    render(<Rapprochement collecteurId="col-1" revision={0} onRetour={vi.fn()} />);

    expect(await screen.findByText('Cash attendu — calculé par le serveur')).toBeTruthy();
  });

  it('se dit provisoire quand le téléphone compte ce que le serveur n’a pas reçu', async () => {
    chargerRapprochement.mockResolvedValue({ ...DU_JOUR, provisoire: true });

    render(<Rapprochement collecteurId="col-1" revision={0} onRetour={vi.fn()} />);

    expect(await screen.findByText('Cash attendu — provisoire, le serveur recalculera')).toBeTruthy();
  });
});

describe('déclarer', () => {
  it('passe la date et le montant, sans identifiant de ligne (précision 9)', async () => {
    chargerRapprochement.mockResolvedValue(DU_JOUR);
    declarerCaisse.mockResolvedValue({ ok: true });

    render(<Rapprochement collecteurId="col-1" revision={0} onRetour={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Cash déclaré (FCFA)'), { target: { value: '4500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Déclarer' }));

    await waitFor(() => expect(declarerCaisse).toHaveBeenCalledWith('col-1', '2026-09-13', 4500));
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Rapprochement.test.tsx`
Attendu : FAIL — « provisoire » introuvable, et `declarerCaisse` reçoit un quatrième argument `undefined`.

- [ ] **Étape 8 : l'écran de caisse**

Dans `apps/collecteur/src/ecrans/Rapprochement.tsx` (CRLF) :

1. Remplacer `    messageErreur: 'Caisse indisponible. Vérifie le réseau.',` par `    messageErreur: 'Caisse indisponible sur ce téléphone. Connecte-toi une fois au réseau pour charger ta tournée.',`.
2. Remplacer `    const resultat = await declarerCaisse(collecteurId, donnees.date, montant, donnees.ligneId);` par `    const resultat = await declarerCaisse(collecteurId, donnees.date, montant);`.
3. Remplacer :

```tsx
              <p className="text-white/60 text-xs font-body mb-0.5">
                Cash attendu — calculé par le serveur
              </p>
```

par :

```tsx
              <p className="text-white/60 text-xs font-body mb-0.5">
                {/* Provisoire : le téléphone compte des mises que le serveur n'a
                    pas encore reçues. Le dire évite qu'un écart d'attente se
                    lise comme un manquant. */}
                {donnees.provisoire
                  ? 'Cash attendu — provisoire, le serveur recalculera'
                  : 'Cash attendu — calculé par le serveur'}
              </p>
```

Puis `node crlf.mjs apps/collecteur/src/ecrans/Rapprochement.tsx apps/collecteur/src/ecrans/Rapprochement.test.tsx`.

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Rapprochement.test.tsx`
Attendu : PASS, 3 épreuves.

- [ ] **Étape 9 : toute l'application, typage, lint, commit**

```bash
npm run test -w @kolek/collecteur
npx tsc -b apps/collecteur
npm run verifier:lint
git add apps/collecteur/src/ecritures.ts apps/collecteur/src/ecritures.test.ts apps/collecteur/src/ecritures-ecrans.ts apps/collecteur/src/ecritures-ecrans.test.ts apps/collecteur/src/hors-ligne/vues.ts apps/collecteur/src/hors-ligne/vues.test.ts apps/collecteur/src/lectures-ecrans.ts apps/collecteur/src/lectures-ecrans.test.ts apps/collecteur/src/ecrans/Rapprochement.tsx apps/collecteur/src/ecrans/Rapprochement.test.tsx
git commit -m "feat(hors-ligne): encaisser, inscrire, ouvrir une carte et declarer la caisse passent par la file" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Attendu : tout au vert. **État de la branche à ce point** : chaque geste de la collecte est sur le disque avant d'être montré, et part par le synchroniseur. La fiche client garde encore son sursis en mémoire (six secondes avant l'appel à `enregistrerMise`) ; la tâche 15 le fait entrer dans la file dès l'appui.

---

## Tâche 14 : le bandeau dit ce que la file contient, la coquille protège la sortie

**Fichiers :**
- Modifier : `packages/ui/src/Bandeaux.tsx`, `packages/ui/src/index.ts` ; créer `packages/ui/src/Bandeaux.test.tsx`
- Modifier : `apps/collecteur/src/hors-ligne/vues.ts`, `apps/collecteur/src/hors-ligne/vues.test.ts` (l'état de la file)
- Créer : `apps/collecteur/src/hors-ligne/useHorsLigne.ts`, `apps/collecteur/src/hors-ligne/useHorsLigne.test.tsx`
- Modifier : `apps/collecteur/src/ecrans/Accueil.tsx`, `apps/collecteur/src/ecrans/Accueil.test.tsx` (LF)
- Modifier : `apps/collecteur/src/ecrans/Clients.tsx`, `apps/collecteur/src/ecrans/Clients.test.tsx` (LF)
- Modifier : `apps/collecteur/src/ecrans/Encaisser.tsx` (LF)
- Modifier : `apps/collecteur/src/Coquille.tsx`, `apps/collecteur/src/Coquille.test.tsx`
- Modifier : `apps/collecteur/src/ecrans/EquipeClients.tsx`, `apps/collecteur/src/ecrans/EquipeClients.test.tsx` (commentaires seulement)

**Interfaces :**
- Consomme : `lectureCourante`, `ecouterChangements`, `collecteurCourant`, `etatDuStockage`, `compterFileDe`, `effacerTourneeDe` (tâche 10) ; `chargerProfil` (tâche 12).
- Produit (`@kolek/ui`) : `interface CompteFile { mises: number; clients: number; cartes: number; caisses: number }`, `messageFile(enLigne: boolean, compte: CompteFile | null): string | null`, `BandeauHorsLigne({ enLigne: boolean; compte: CompteFile | null; className?: string })`. La propriété `enAttente` disparaît.
- Produit (`vues.ts`) : `interface EtatFile { mises: number; clients: number; cartes: number; caisses: number; enAttente: number; aConsigner: number; refusees: number; plusAncienne: string | null; plusAncienneType: TypeOperation | null }` — déclarée sans dépendre de `@kolek/ui`, et structurellement acceptée partout où `CompteFile` est attendu ; `etatFileDepuis(operations: readonly Operation[], refus: readonly RefusLocal[]): EtatFile`, `identifiantsEnAttente(operations: readonly Operation[]): Set<string>`.
- Produit (`useHorsLigne.ts`) : `interface EtatHorsLigne { operations: Operation[]; refus: RefusLocal[]; tournee: Tournee | null; file: EtatFile | null; stockage: EtatStockage }`, `useHorsLigne(): EtatHorsLigne`.
- Écart 3.

- [ ] **Étape 1 : écrire l'épreuve du bandeau**

Créer `packages/ui/src/Bandeaux.test.tsx` :

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BandeauHorsLigne, messageFile } from './Bandeaux';

// `globals` n'est pas activé dans ce paquet : sans cet appel, chaque rendu
// s'ajoute au précédent.
afterEach(cleanup);

const VIDE = { mises: 0, clients: 0, cartes: 0, caisses: 0 };

describe('ce que le bandeau dit de la file (spec J2b §8.1)', () => {
  it('se tait en ligne quand rien n’attend', () => {
    expect(messageFile(true, VIDE)).toBeNull();
    expect(messageFile(true, null)).toBeNull();
  });

  it('compte ce qui reste à envoyer, en ligne', () => {
    expect(messageFile(true, { ...VIDE, mises: 2 })).toBe('Envoi en cours · 2 restantes');
    expect(messageFile(true, { ...VIDE, caisses: 1 })).toBe('Envoi en cours · 1 restante');
  });

  it('énumère la file hors ligne, comme la spec l’écrit', () => {
    expect(messageFile(false, { ...VIDE, mises: 3, clients: 1 })).toBe(
      'Hors ligne · 3 mises et 1 client en attente d’envoi',
    );
    expect(messageFile(false, { mises: 1, clients: 2, cartes: 1, caisses: 1 })).toBe(
      'Hors ligne · 1 mise, 2 clients, 1 carte et 1 déclaration de caisse en attente d’envoi',
    );
  });

  it('ne dit « rien en attente » que s’il a pu compter', () => {
    expect(messageFile(false, VIDE)).toBe('Hors ligne · rien en attente d’envoi');
    expect(messageFile(false, null)).toBe('Hors ligne');
  });

  it('ne promet plus jamais une synchronisation (écart 3)', () => {
    for (const compte of [null, VIDE, { ...VIDE, mises: 1 }]) {
      for (const enLigne of [true, false]) {
        expect(messageFile(enLigne, compte) ?? '').not.toMatch(/synchronis/);
      }
    }
  });

  it('ne rend rien quand il n’a rien à dire', () => {
    const { container } = render(<BandeauHorsLigne enLigne compte={VIDE} />);
    expect(container.innerHTML).toBe('');
  });

  it('rend la phrase quand il a quelque chose à dire', () => {
    render(<BandeauHorsLigne enLigne={false} compte={{ ...VIDE, mises: 1 }} />);
    expect(screen.getByText('Hors ligne · 1 mise en attente d’envoi')).toBeTruthy();
  });
});
```

Run : `npm run test -w @kolek/ui -- src/Bandeaux.test.tsx`
Attendu : FAIL, « messageFile is not a function » (ou export introuvable).

- [ ] **Étape 2 : réécrire le bandeau**

Remplacer tout le contenu de `packages/ui/src/Bandeaux.tsx` (CRLF) par :

```tsx
import { useEffect, useState } from 'react';

import { Icone } from './Icone';

/** Ce que la file du téléphone contient, par nature d'opération. */
export interface CompteFile {
  mises: number;
  clients: number;
  cartes: number;
  caisses: number;
}

const NOMS: ReadonlyArray<readonly [keyof CompteFile, string, string]> = [
  ['mises', 'mise', 'mises'],
  ['clients', 'client', 'clients'],
  ['cartes', 'carte', 'cartes'],
  ['caisses', 'déclaration de caisse', 'déclarations de caisse'],
];

/**
 * La phrase du bandeau, ou `null` quand il n'a rien à dire (spec J2b §8.1).
 *
 * Elle ne dit que ce qu'on sait. Jusqu'à J2b, ce composant affichait « Hors
 * ligne · les encaissements seront synchronisés dès connexion » alors
 * qu'aucune file n'existait : un mensonge d'interface, et un collecteur qui
 * apprend que l'écran ment cesse de le croire quand il dit vrai. D'où : sans
 * compte lisible, « Hors ligne » et rien de plus.
 */
export function messageFile(enLigne: boolean, compte: CompteFile | null): string | null {
  const total = compte ? compte.mises + compte.clients + compte.cartes + compte.caisses : 0;
  if (enLigne) return total === 0 ? null : `Envoi en cours · ${total} restante${total > 1 ? 's' : ''}`;
  if (!compte) return 'Hors ligne';
  if (total === 0) return 'Hors ligne · rien en attente d’envoi';

  const parts = NOMS.filter(([cle]) => compte[cle] > 0).map(
    ([cle, un, plusieurs]) => `${compte[cle]} ${compte[cle] > 1 ? plusieurs : un}`,
  );
  const liste =
    parts.length === 1
      ? parts[0]!
      : `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]!}`;
  return `Hors ligne · ${liste} en attente d’envoi`;
}

/**
 * Le bandeau de la file. Il se tait seul quand il n'a rien à dire : les écrans
 * le rendent toujours, sans condition.
 */
export function BandeauHorsLigne({
  enLigne,
  compte,
  className = '',
}: {
  enLigne: boolean;
  /** `null` tant que la file n'a pas pu être lue. */
  compte: CompteFile | null;
  className?: string;
}) {
  const message = messageFile(enLigne, compte);
  if (message === null) return null;

  return (
    <div className={`flex items-center gap-2 bg-info-tint rounded-md px-3 py-2 ${className}`}>
      <Icone nom={enLigne ? 'refresh-cw' : 'wifi-off'} taille={14} className="text-info" />
      <p className="text-xs font-body font-medium text-info">{message}</p>
    </div>
  );
}

/**
 * `navigator.onLine` ne prouve pas qu'Internet répond — il dit seulement que
 * l'interface réseau est levée. C'est suffisant pour ce bandeau : il informe,
 * il ne décide de rien. Ce qui décide d'envoyer, c'est le résultat d'un envoi
 * (`apps/collecteur/src/hors-ligne/planificateur.ts`).
 */
export function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const monter = () => setEnLigne(true);
    const couper = () => setEnLigne(false);
    window.addEventListener('online', monter);
    window.addEventListener('offline', couper);
    return () => {
      window.removeEventListener('online', monter);
      window.removeEventListener('offline', couper);
    };
  }, []);

  return enLigne;
}
```

Dans `packages/ui/src/index.ts` (CRLF), remplacer la ligne `export { BandeauHorsLigne, useEnLigne } from './Bandeaux';` par :

```ts
export { BandeauHorsLigne, messageFile, useEnLigne, type CompteFile } from './Bandeaux';
```

Puis `node crlf.mjs packages/ui/src/Bandeaux.tsx packages/ui/src/Bandeaux.test.tsx packages/ui/src/index.ts`.

Run : `npm run test -w @kolek/ui -- src/Bandeaux.test.tsx`
Attendu : PASS, 7 épreuves.

Le typage de l'application casse à ce point — trois écrans rendent encore `<BandeauHorsLigne className=… />` sans `enLigne` ni `compte`. Les étapes 6 à 8 les branchent ; ne pas committer avant.

- [ ] **Étape 3 : l'état de la file, calculé**

Dans `apps/collecteur/src/hors-ligne/vues.test.ts` :

1. Remplacer la ligne `import { INSTANT, caisse, carte, client, operationMise, tournee } from './fabriques';` par :

```ts
import {
  INSTANT,
  caisse,
  carte,
  client,
  operationCaisse,
  operationCarte,
  operationClientCarte,
  operationMise,
  tournee,
} from './fabriques';
```

2. Remplacer la ligne `import type { MiseLocale, ProfilLocal } from './modele';` par :

```ts
import { chargeUtileDe, type MiseLocale, type ProfilLocal } from './modele';
```

3. Dans l'import de `./vues`, ajouter `etatFileDepuis,` et `identifiantsEnAttente,` (ordre alphabétique : après `TourneeAbsente,`).
4. Ajouter à la fin du fichier :

```ts
describe('ce que la file contient (§8.1)', () => {
  it('compte toute la file par nature, et sépare l’attente des refus à consigner', () => {
    const file = [
      operationMise(1, { carteId: 'k1' }, { faiteLe: '2026-07-01T08:00:00.000Z' }),
      operationMise(
        2,
        { carteId: 'k1' },
        { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE', faiteLe: '2026-06-01T08:00:00.000Z' },
      ),
      operationClientCarte(3, { clientId: 'c2', carteId: 'k2' }),
      operationCaisse(4, { cashDeclare: 5000 }),
    ];
    const refus = [
      {
        id: 'ancien',
        motif: 'INCONNU',
        chargeUtile: chargeUtileDe(operationCarte(9, { carteId: 'k9', clientId: 'c9' })),
        creeLe: INSTANT,
      },
    ];

    // La plus ancienne **en attente** : un refus à consigner ne sera plus
    // envoyé, la fenêtre des 90 jours ne le menace pas.
    expect(etatFileDepuis(file, refus)).toEqual({
      mises: 2,
      clients: 1,
      cartes: 0,
      caisses: 1,
      enAttente: 3,
      aConsigner: 1,
      refusees: 2,
      plusAncienne: '2026-07-01T08:00:00.000Z',
      plusAncienneType: 'mise',
    });
  });

  it('ne dit rien de plus ancien sur une file vide', () => {
    expect(etatFileDepuis([], [])).toEqual({
      mises: 0,
      clients: 0,
      cartes: 0,
      caisses: 0,
      enAttente: 0,
      aConsigner: 0,
      refusees: 0,
      plusAncienne: null,
      plusAncienneType: null,
    });
  });

  it('désigne ce qui n’a pas encore quitté le téléphone : clients, cartes et mises', () => {
    const ids = identifiantsEnAttente([
      operationClientCarte(1, { clientId: 'c2', carteId: 'k2' }),
      operationMise(2, { carteId: 'k2' }),
      operationCarte(3, { carteId: 'k3', clientId: 'c1' }),
      operationCaisse(4, { cashDeclare: 0 }),
    ]);
    expect([...ids].sort()).toEqual(['c2', 'k2', 'k3', 'mise-2']);
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts`
Attendu : FAIL, « etatFileDepuis is not a function ».

Dans `apps/collecteur/src/hors-ligne/vues.ts` :

1. Remplacer la ligne `import type { Operation, ProfilLocal, Tournee } from './modele';` par :

```ts
import type { Operation, ProfilLocal, RefusLocal, Tournee, TypeOperation } from './modele';
```

2. Ajouter à la fin du fichier :

```ts
/**
 * Ce que la file contient, pour le bandeau, l'accueil et les alertes.
 *
 * Les quatre comptes par nature portent **toute** la file, en attente comme
 * refusée à consigner : c'est ce qui n'a pas quitté le téléphone, donc ce que
 * la déconnexion attend (§7) et ce que le bandeau doit annoncer. Sans cela, le
 * bandeau dirait « rien en attente » à un collecteur à qui la déconnexion est
 * refusée.
 */
export interface EtatFile {
  mises: number;
  clients: number;
  cartes: number;
  caisses: number;
  /** Encore à envoyer. */
  enAttente: number;
  /** Refusées par le serveur, refus pas encore écrit dans `synchro_rejets`. */
  aConsigner: number;
  /** Les refus à montrer : ceux déjà consignés, et ceux à consigner. */
  refusees: number;
  /** Le plus ancien geste en attente : c'est lui que la fenêtre de 90 jours menace (§4.7). */
  plusAncienne: string | null;
  plusAncienneType: TypeOperation | null;
}

export function etatFileDepuis(
  operations: readonly Operation[],
  refus: readonly RefusLocal[],
): EtatFile {
  const par = (type: TypeOperation) => operations.filter((o) => o.type === type).length;
  const enAttente = operations.filter((o) => o.etat === 'en_attente');
  const aConsigner = operations.length - enAttente.length;
  const ancienne =
    [...enAttente].sort(
      (a, b) => Date.parse(a.faiteLe) - Date.parse(b.faiteLe) || a.sequence - b.sequence,
    )[0] ?? null;

  return {
    mises: par('mise'),
    clients: par('client_carte'),
    cartes: par('carte'),
    caisses: par('caisse'),
    enAttente: enAttente.length,
    aConsigner,
    refusees: refus.length + aConsigner,
    plusAncienne: ancienne?.faiteLe ?? null,
    plusAncienneType: ancienne?.type ?? null,
  };
}

/** Les clients, cartes et mises qui n'ont pas encore quitté le téléphone — « pas encore envoyé » (§8.3). */
export function identifiantsEnAttente(operations: readonly Operation[]): Set<string> {
  const ids = new Set<string>();
  for (const o of operations) {
    switch (o.type) {
      case 'mise':
        ids.add(o.charge.id);
        break;
      case 'client_carte':
        ids.add(o.charge.client.id);
        ids.add(o.charge.carte.id);
        break;
      case 'carte':
        ids.add(o.charge.id);
        break;
      case 'caisse':
        break;
    }
  }
  return ids;
}
```

Puis `node crlf.mjs apps/collecteur/src/hors-ligne/vues.ts apps/collecteur/src/hors-ligne/vues.test.ts`.

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts`
Attendu : PASS, 20 épreuves.

- [ ] **Étape 4 : écrire l'épreuve du crochet**

Créer `apps/collecteur/src/hors-ligne/useHorsLigne.test.tsx` :

```tsx
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { operationMise, tournee } from './fabriques';
import type { Operation } from './modele';

const lectureCourante = vi.fn();
let ecouteur: () => void = () => {};
let courant: string | null = 'col-1';

vi.mock('./moteur', () => ({
  collecteurCourant: () => courant,
  ecouterChangements: (f: () => void) => {
    ecouteur = f;
    return () => {
      ecouteur = () => {};
    };
  },
  etatDuStockage: () => 'non_garanti',
  lectureCourante: () => lectureCourante(),
}));

const { useHorsLigne } = await import('./useHorsLigne');

afterEach(() => {
  cleanup();
  lectureCourante.mockReset();
  courant = 'col-1';
});

const lu = (operations: Operation[]) => ({ tournee: tournee(), operations, refus: [], profil: null });

describe('le crochet du hors-ligne', () => {
  it('lit la file et l’état du stockage à l’ouverture', async () => {
    lectureCourante.mockResolvedValue(lu([operationMise(1, { carteId: 'k1' })]));

    const { result } = renderHook(() => useHorsLigne());

    await waitFor(() => expect(result.current.file?.mises).toBe(1));
    expect(result.current.stockage).toBe('non_garanti');
  });

  it('relit quand le moteur signale un changement', async () => {
    lectureCourante.mockResolvedValue(lu([]));
    const { result } = renderHook(() => useHorsLigne());
    await waitFor(() => expect(result.current.file?.mises).toBe(0));

    lectureCourante.mockResolvedValue(lu([operationMise(1, { carteId: 'k1' })]));
    act(() => ecouteur());

    await waitFor(() => expect(result.current.file?.mises).toBe(1));
  });

  it('ne laisse pas une lecture lente écraser une plus récente', async () => {
    let finirAncienne: (valeur: unknown) => void = () => {};
    lectureCourante.mockImplementationOnce(
      () =>
        new Promise((resoudre) => {
          finirAncienne = resoudre;
        }),
    );
    lectureCourante.mockResolvedValueOnce(
      lu([operationMise(1, { carteId: 'k1' }), operationMise(2, { carteId: 'k1' })]),
    );

    const { result } = renderHook(() => useHorsLigne());
    act(() => ecouteur());
    await waitFor(() => expect(result.current.file?.mises).toBe(2));

    await act(async () => finirAncienne(lu([])));

    expect(result.current.file?.mises).toBe(2);
  });

  it('ne lit rien sans collecteur connecté', () => {
    courant = null;

    const { result } = renderHook(() => useHorsLigne());

    expect(lectureCourante).not.toHaveBeenCalled();
    expect(result.current.file).toBeNull();
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/useHorsLigne.test.tsx`
Attendu : FAIL, « Failed to resolve import "./useHorsLigne" ».

- [ ] **Étape 5 : écrire le crochet**

Créer `apps/collecteur/src/hors-ligne/useHorsLigne.ts` :

```ts
import { useEffect, useState } from 'react';

import type { Operation, RefusLocal, Tournee } from './modele';
import { collecteurCourant, ecouterChangements, etatDuStockage, lectureCourante } from './moteur';
import type { EtatStockage } from './stockage-local';
import { etatFileDepuis, type EtatFile } from './vues';

export interface EtatHorsLigne {
  operations: Operation[];
  refus: RefusLocal[];
  /** `null` tant que rien n'a été lu. */
  tournee: Tournee | null;
  /** `null` tant que la file n'a pas pu être lue : le bandeau dit alors « Hors ligne », sans compte. */
  file: EtatFile | null;
  stockage: EtatStockage;
}

/**
 * La file, les refus et la tournée du collecteur connecté, relus à chaque
 * changement signalé par le moteur — un geste, une passe qui a envoyé, une
 * tournée rechargée.
 *
 * Les lectures se croisent : un geste pendant une relecture en lance une
 * seconde. Seule la dernière partie a le droit d'écrire l'état, sans quoi une
 * lecture lente remontrerait une file d'avant le geste.
 */
export function useHorsLigne(): EtatHorsLigne {
  const [etat, setEtat] = useState<EtatHorsLigne>(() => ({
    operations: [],
    refus: [],
    tournee: null,
    file: null,
    stockage: etatDuStockage(),
  }));

  useEffect(() => {
    let vivant = true;
    let tour = 0;

    const relire = () => {
      if (!collecteurCourant()) return;
      const ce = ++tour;
      lectureCourante().then(
        ({ tournee, operations, refus }) => {
          if (!vivant || ce !== tour) return;
          setEtat({
            operations,
            refus,
            tournee,
            file: etatFileDepuis(operations, refus),
            stockage: etatDuStockage(),
          });
        },
        () => {
          if (!vivant || ce !== tour) return;
          setEtat((avant) => ({ ...avant, stockage: etatDuStockage() }));
        },
      );
    };

    relire();
    const arreter = ecouterChangements(relire);
    return () => {
      vivant = false;
      arreter();
    };
  }, []);

  return etat;
}
```

Puis `node crlf.mjs apps/collecteur/src/hors-ligne/useHorsLigne.ts apps/collecteur/src/hors-ligne/useHorsLigne.test.tsx`.

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/useHorsLigne.test.tsx`
Attendu : PASS, 4 épreuves.

- [ ] **Étape 6 : l'accueil montre le compteur**

`apps/collecteur/src/ecrans/Accueil.test.tsx` est en **LF**.

1. Après le bloc `vi.mock('../supabase', () => ({ … }));`, ajouter :

```tsx
const FILE_VIDE = {
  mises: 0,
  clients: 0,
  cartes: 0,
  caisses: 0,
  enAttente: 0,
  aConsigner: 0,
  refusees: 0,
  plusAncienne: null,
  plusAncienneType: null,
};
let etatHorsLigne: Record<string, unknown> = {};
const horsLigne = (reste: Record<string, unknown> = {}) => ({
  operations: [],
  refus: [],
  tournee: null,
  file: FILE_VIDE,
  stockage: 'persistant',
  ...reste,
});

vi.mock('../hors-ligne/useHorsLigne', () => ({ useHorsLigne: () => etatHorsLigne }));
```

2. Remplacer :

```tsx
afterEach(() => {
  cleanup();
```

par :

```tsx
beforeEach(() => {
  etatHorsLigne = horsLigne();
});

afterEach(() => {
  cleanup();
  // L'état réseau simulé par une épreuve ne doit pas survivre à la suivante.
  delete (window.navigator as unknown as { onLine?: boolean }).onLine;
```

3. Ajouter `beforeEach` à l'import de `vitest` : `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';`.
4. Ajouter à la fin du fichier :

```tsx
describe('le compteur de la file sur l’accueil (§8.2)', () => {
  it('reste visible en ligne tant que la file n’est pas vide', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    etatHorsLigne = horsLigne({ file: { ...FILE_VIDE, mises: 2, enAttente: 2 } });

    rendre();

    expect(await screen.findByText('Envoi en cours · 2 restantes')).toBeTruthy();
  });

  it('dit ce que la file contient, hors ligne', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    etatHorsLigne = horsLigne({ file: { ...FILE_VIDE, mises: 3, clients: 1, enAttente: 4 } });

    rendre();

    expect(
      await screen.findByText('Hors ligne · 3 mises et 1 client en attente d’envoi'),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/synchronisés dès connexion/);
  });
});
```

Dans `apps/collecteur/src/ecrans/Accueil.tsx` (CRLF) :

1. Après la ligne `import type { CarteChoisie, Page } from '../Coquille';`, ajouter `import { useHorsLigne } from '../hors-ligne/useHorsLigne';`.
2. Après la ligne `  const estTitulaire = useEstTitulaire();`, ajouter `  const { file } = useHorsLigne();`.
3. Remplacer `    messageErreur: 'Chiffres indisponibles. Vérifie le réseau.',` par `    messageErreur: 'Chiffres indisponibles sur ce téléphone. Connecte-toi une fois au réseau pour charger ta tournée.',`.
4. Remplacer `        {!enLigne && <BandeauHorsLigne className="mt-4 relative z-10" />}` par :

```tsx
        {/* Toujours rendu : il se tait seul quand la file est vide et le réseau là.
            En ligne avec une file, il reste — le compteur ne quitte l'accueil
            qu'une fois tout parti (§8.2). */}
        <BandeauHorsLigne enLigne={enLigne} compte={file} className="mt-4 relative z-10" />
```

Puis `node crlf.mjs apps/collecteur/src/ecrans/Accueil.tsx` (pas `Accueil.test.tsx`, qui est en LF).

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Accueil.test.tsx`
Attendu : PASS, 5 épreuves.

- [ ] **Étape 7 : la liste des clients — bandeau et « pas encore envoyé »**

`apps/collecteur/src/ecrans/Clients.test.tsx` est en **LF**.

1. Après la ligne `vi.mock('./FicheClient', () => ({ FicheClient: () => null }));`, ajouter :

```tsx
let operationsEnFile: unknown[] = [];
vi.mock('../hors-ligne/useHorsLigne', () => ({
  useHorsLigne: () => ({
    operations: operationsEnFile,
    refus: [],
    tournee: null,
    file: null,
    stockage: 'inconnu',
  }),
}));
```

2. Après la ligne `import { afterEach, describe, expect, it, vi } from 'vitest';`, ajouter :

```tsx

import { operationCarte, operationClientCarte } from '../hors-ligne/fabriques';
```

3. Dans `afterEach`, après `  chargerListeClients.mockReset();`, ajouter `  operationsEnFile = [];`.
4. Ajouter à la fin du fichier :

```tsx
describe('ce qui n’a pas encore quitté le téléphone (§8.3)', () => {
  it('marque le client inscrit hors ligne, et lui seul', async () => {
    operationsEnFile = [operationClientCarte(1, { clientId: 'cli2', carteId: 'kx' })];
    brancherTournee();
    rendre();

    const ligne = (await screen.findByText('Ka')).closest('.bg-surface') as HTMLElement;

    expect(within(ligne).getByText('Pas encore envoyé')).toBeTruthy();
    expect(screen.getAllByText('Pas encore envoyé')).toHaveLength(1);
  });

  it('marque la carte ouverte hors ligne sur un client déjà envoyé', async () => {
    operationsEnFile = [operationCarte(1, { carteId: 'k1', clientId: 'cli1' })];
    brancherTournee();
    rendre();

    const ligne = (await screen.findByText('Hj')).closest('.bg-surface') as HTMLElement;

    expect(within(ligne).getByText('Carte pas encore envoyée')).toBeTruthy();
  });
});
```

Dans `apps/collecteur/src/ecrans/Clients.tsx` (CRLF) :

1. Remplacer la ligne `import { TourneeAbsente } from '../hors-ligne/vues';` par :

```tsx
import { useHorsLigne } from '../hors-ligne/useHorsLigne';
import { TourneeAbsente, identifiantsEnAttente } from '../hors-ligne/vues';
```

2. Remplacer la ligne `  const enLigne = useEnLigne();` (dans `Clients`, juste après `const [filtre, setFiltre] = useState<Filtre>('Tous');`) par :

```tsx
  const enLigne = useEnLigne();
  const { file, operations } = useHorsLigne();
  /** Ce qui n'a pas encore quitté le téléphone, pour « pas encore envoyé » (§8.3). */
  const pasEnvoyes = useMemo(() => identifiantsEnAttente(operations), [operations]);
```

3. Remplacer `        {!enLigne && <BandeauHorsLigne className="mt-3 relative z-10" />}` par `        <BandeauHorsLigne enLigne={enLigne} compte={file} className="mt-3 relative z-10" />`.
4. Remplacer :

```tsx
          <LigneClient
            ligne={ligne}
            onEcriture={onEcriture}
```

par :

```tsx
          <LigneClient
            ligne={ligne}
            mentionEnvoi={
              pasEnvoyes.has(ligne.client.id)
                ? 'Pas encore envoyé'
                : ligne.cartes.some((k) => pasEnvoyes.has(k.id))
                  ? 'Carte pas encore envoyée'
                  : null
            }
            onEcriture={onEcriture}
```

5. Dans la signature de `LigneClient`, remplacer :

```tsx
function LigneClient({
  ligne,
  onEcriture,
  onOuvrirFiche,
  onRetrait,
}: {
  ligne: Ligne;
```

par :

```tsx
function LigneClient({
  ligne,
  mentionEnvoi,
  onEcriture,
  onOuvrirFiche,
  onRetrait,
}: {
  ligne: Ligne;
  /** « Pas encore envoyé » quand le client, ou une de ses cartes, attend encore sur le téléphone. */
  mentionEnvoi: string | null;
```

6. Remplacer :

```tsx
        <p className="text-xs xs:text-sm text-muted-foreground font-body truncate">{sousTitre}</p>
```

par :

```tsx
        <p className="text-xs xs:text-sm text-muted-foreground font-body truncate">{sousTitre}</p>
        {mentionEnvoi && (
          <p className="text-xs font-body font-medium text-info">{mentionEnvoi}</p>
        )}
```

Puis `node crlf.mjs apps/collecteur/src/ecrans/Clients.tsx`.

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Clients.test.tsx`
Attendu : PASS.

- [ ] **Étape 8 : l'encaissement montre le compteur**

`apps/collecteur/src/ecrans/Encaisser.tsx` est en **LF** : ne pas lui passer `crlf.mjs`.

1. Après la ligne `import { enregistrerMise } from '../ecritures';`, ajouter `import { useHorsLigne } from '../hors-ligne/useHorsLigne';`.
2. Après la ligne `  const enLigne = useEnLigne();`, ajouter `  const { file } = useHorsLigne();`.
3. Remplacer `      {!enLigne && <BandeauHorsLigne className="mx-4 mt-3" />}` par `      <BandeauHorsLigne enLigne={enLigne} compte={file} className="mx-4 mt-3" />`.

Mesurer : `node crlf.mjs --mesurer apps/collecteur/src/ecrans/Encaisser.tsx` — attendu `LF`.

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Encaisser.test.tsx`
Attendu : PASS (le crochet, non simulé, ne lit rien sans collecteur courant).

- [ ] **Étape 9 : écrire l'épreuve de la sortie**

Dans `apps/collecteur/src/Coquille.test.tsx` (CRLF) :

1. Remplacer :

```tsx
const maybeSingle = vi.fn();
const signOut = vi.fn();
```

par :

```tsx
const signOut = vi.fn();
const chargerProfil = vi.fn();
const compterFileDe = vi.fn();
const effacerTourneeDe = vi.fn();
```

2. Dans la simulation de `./supabase`, supprimer la ligne `    from: () => ({ select: () => ({ maybeSingle: () => maybeSingle() }) }),`.
3. Remplacer :

```tsx
vi.mock('./hors-ligne/moteur', () => ({
  demarrerMoteur: (...args: unknown[]) => demarrerMoteur(...args),
  ecouterChangements: (...args: unknown[]) => ecouterChangements(...args),
}));
```

par :

```tsx
vi.mock('./hors-ligne/moteur', () => ({
  compterFileDe: (id: string) => compterFileDe(id),
  demarrerMoteur: (...args: unknown[]) => demarrerMoteur(...args),
  ecouterChangements: (...args: unknown[]) => ecouterChangements(...args),
  effacerTourneeDe: (id: string) => effacerTourneeDe(id),
}));
vi.mock('./lectures-ecrans', () => ({ chargerProfil: () => chargerProfil() }));
```

4. Dans `beforeEach`, remplacer la ligne `  maybeSingle.mockResolvedValue({ data: { nom: 'Awa' } });` par :

```tsx
  chargerProfil.mockResolvedValue({ nom: 'Awa', palier: 'pro', telephone: '+2250700000000' });
  compterFileDe.mockResolvedValue(0);
  effacerTourneeDe.mockResolvedValue(undefined);
```

5. Dans `afterEach`, remplacer la ligne `  maybeSingle.mockReset();` par :

```tsx
  chargerProfil.mockReset();
  compterFileDe.mockReset();
  effacerTourneeDe.mockReset();
```

6. Ajouter `waitFor` à l'import de `@testing-library/react`.
7. Ajouter à la fin du fichier :

```tsx
describe('la déconnexion ne détruit rien (§4.5, §8.5)', () => {
  const sortir = () => fireEvent.click(screen.getByRole('button', { name: 'Déconnexion' }));

  it('est refusée tant que des opérations attendent sur le téléphone', async () => {
    compterFileDe.mockResolvedValue(3);
    const onDeconnexion = vi.fn();
    render(<Coquille collecteurId="collecteur-1" onDeconnexion={onDeconnexion} />);

    sortir();

    expect(
      await screen.findByText('3 opérations pas encore envoyées. Retrouve du réseau avant de te déconnecter.'),
    ).toBeTruthy();
    expect(compterFileDe).toHaveBeenCalledWith('collecteur-1');
    expect(signOut).not.toHaveBeenCalled();
    expect(effacerTourneeDe).not.toHaveBeenCalled();
    expect(onDeconnexion).not.toHaveBeenCalled();
  });

  it('parle au singulier d’une seule opération', async () => {
    compterFileDe.mockResolvedValue(1);
    render(<Coquille collecteurId="collecteur-1" onDeconnexion={vi.fn()} />);

    sortir();

    expect(
      await screen.findByText('1 opération pas encore envoyée. Retrouve du réseau avant de te déconnecter.'),
    ).toBeTruthy();
  });

  it('est refusée quand la file ne peut pas être comptée : on ne sort pas sur un doute', async () => {
    compterFileDe.mockResolvedValue(null);
    render(<Coquille collecteurId="collecteur-1" onDeconnexion={vi.fn()} />);

    sortir();

    expect(
      await screen.findByText('Impossible de vérifier les opérations de ce téléphone. Réessaie.'),
    ).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('efface la tournée et sort quand la file est vide', async () => {
    signOut.mockResolvedValue({ error: null });
    const onDeconnexion = vi.fn();
    render(<Coquille collecteurId="collecteur-1" onDeconnexion={onDeconnexion} />);

    sortir();

    await waitFor(() => expect(onDeconnexion).toHaveBeenCalled());
    expect(effacerTourneeDe).toHaveBeenCalledWith('collecteur-1');
  });
});

describe('qui est connecté, hors ligne', () => {
  it('montre le nom du profil gardé sur le téléphone', async () => {
    chargerProfil.mockResolvedValue({ nom: 'Awa Traoré', palier: 'pro', telephone: '+2250700000000' });

    render(<Coquille collecteurId="collecteur-1" onDeconnexion={vi.fn()} />);

    expect(await screen.findByText('Awa Traoré')).toBeTruthy();
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/Coquille.test.tsx`
Attendu : FAIL — la déconnexion appelle `signOut` sans compter la file, et le nom n'est jamais lu depuis `chargerProfil`.

- [ ] **Étape 10 : la coquille lit le profil local et protège la sortie**

Dans `apps/collecteur/src/Coquille.tsx` (CRLF) :

1. Remplacer la ligne `import { demarrerMoteur, ecouterChangements } from './hors-ligne/moteur';` par :

```tsx
import {
  compterFileDe,
  demarrerMoteur,
  ecouterChangements,
  effacerTourneeDe,
} from './hors-ligne/moteur';
import { chargerProfil } from './lectures-ecrans';
```

2. Remplacer l'effet de lecture de la fiche :

```tsx
  useEffect(() => {
    // Le nom vient de `collecteurs`, pas des métadonnées du jeton : c'est la
    // ligne que le collecteur peut lui-même corriger, et l'écran doit montrer
    // ce qu'il a corrigé. La politique RLS la borne à sa propre ligne.
    void supabase
      .from('collecteurs')
      .select('nom, palier, telephone')
      .maybeSingle()
      .then(({ data }) => {
        const fiche = data as { nom?: string; palier?: string; telephone?: string } | null;
        setNomCollecteur(fiche?.nom ?? null);
        setPalierCollecteur(fiche?.palier ?? null);
        setTelephoneCollecteur(fiche?.telephone ?? null);
      });
  }, [collecteurId]);
```

par :

```tsx
  useEffect(() => {
    // Le nom vient de la fiche `collecteurs`, recopiée sur le téléphone à
    // chaque rafraîchissement (J2b §5.1) : hors ligne, la coquille doit encore
    // dire qui est connecté. C'est la ligne que le collecteur peut lui-même
    // corriger, et l'écran doit montrer ce qu'il a corrigé — d'où `revision`,
    // qui monte quand la tournée est rechargée.
    if (moteurDe !== collecteurId) return;
    let vivant = true;
    chargerProfil().then(
      (profil) => {
        if (!vivant) return;
        setNomCollecteur(profil.nom);
        setPalierCollecteur(profil.palier);
        setTelephoneCollecteur(profil.telephone);
      },
      () => {
        // Profil jamais lu sur ce téléphone : la coquille dit « Collecteur »,
        // sans rien inventer, jusqu'au premier rafraîchissement.
      },
    );
    return () => {
      vivant = false;
    };
  }, [collecteurId, moteurDe, revision]);
```

3. Remplacer la fonction `deconnecter` entière :

```tsx
  async function deconnecter() {
    setErreurSortie(null);
    const { error } = await supabase.auth.signOut();
```

jusqu'à son accolade fermante (après `onDeconnexion();`), par :

```tsx
  async function deconnecter() {
    setErreurSortie(null);

    // La file d'abord (spec J2b §4.5) : une opération pas encore envoyée est de
    // l'argent qui n'est pas arrivé. Rien ne l'efface ici, mais sortir la
    // laisserait sur un téléphone où le prochain collecteur ne la voit pas.
    // Un compte impossible vaut un refus : on ne sort pas sur un doute.
    const enFile = await compterFileDe(collecteurId);
    if (enFile === null) {
      setErreurSortie('Impossible de vérifier les opérations de ce téléphone. Réessaie.');
      return;
    }
    if (enFile > 0) {
      const s = enFile > 1 ? 's' : '';
      setErreurSortie(
        `${enFile} opération${s} pas encore envoyée${s}. Retrouve du réseau avant de te déconnecter.`,
      );
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      setErreurSortie('Déconnexion impossible. Vérifie le réseau et réessaie.');
      return;
    }
    // Avant de rendre la main : la tournée gardée sur le disque et les lectures
    // gardées en mémoire portent les noms et les soldes des clients. Deux
    // collecteurs se relaient sur le même téléphone, et le second ne doit rien
    // voir du premier. La base du collecteur reste, vide de tournée.
    await effacerTourneeDe(collecteurId);
    viderCache();
    onDeconnexion();
  }
```

Puis `node crlf.mjs apps/collecteur/src/Coquille.tsx apps/collecteur/src/Coquille.test.tsx`.

Run : `npm run test -w @kolek/collecteur -- src/Coquille.test.tsx`
Attendu : PASS, 19 épreuves.

- [ ] **Étape 11 : deux commentaires qui citaient l'ancienne phrase**

Dans `apps/collecteur/src/ecrans/EquipeClients.tsx` (CRLF), remplacer :

```tsx
 * La conséquence se paie ici. Rien n'entre dans la file de synchro, donc rien ne
 * partira à la reconnexion, et `BandeauHorsLigne` — qui promet « les
 * encaissements seront synchronisés dès connexion » — serait un mensonge sur cet
 * écran précis. D'où la phrase dédiée, qui dit la limite et rappelle qu'elle ne
 * vaut que là.
```

par :

```tsx
 * La conséquence se paie ici. Rien n'entre dans la file du téléphone, donc rien
 * ne partira à la reconnexion, et `BandeauHorsLigne` — qui compte la file du
 * collecteur — ne dirait rien de juste sur cet écran précis. D'où la phrase
 * dédiée, qui dit la limite et rappelle qu'elle ne vaut que là.
```

Dans `apps/collecteur/src/ecrans/EquipeClients.test.tsx` (CRLF), remplacer :

```tsx
 * passagère ; le bandeau générique `BandeauHorsLigne`, lui, promettrait une
 * synchro qui n'aura pas lieu.
```

par :

```tsx
 * passagère ; le bandeau générique `BandeauHorsLigne`, lui, compterait une file
 * où cet encaissement n'entre pas.
```

et :

```tsx
    // `BandeauHorsLigne` dit « les encaissements seront synchronisés dès
    // connexion ». C'est vrai de la tournée du collecteur, et faux ici : cet
    // encaissement passe par une Edge Function et n'entre dans aucune file.
```

par :

```tsx
    // Jusqu'à J2b, `BandeauHorsLigne` disait « les encaissements seront
    // synchronisés dès connexion ». Cet encaissement passe par une Edge
    // Function et n'entre dans aucune file : cette phrase ne doit jamais
    // reparaître ici.
```

Puis `node crlf.mjs apps/collecteur/src/ecrans/EquipeClients.tsx apps/collecteur/src/ecrans/EquipeClients.test.tsx`.

- [ ] **Étape 12 : toute la chaîne des deux paquets, commit**

```bash
npm run test -w @kolek/ui
npm run test -w @kolek/collecteur
npm run typecheck -w @kolek/ui
npx tsc -b apps/collecteur
npm run verifier:lint
git add packages/ui/src/Bandeaux.tsx packages/ui/src/Bandeaux.test.tsx packages/ui/src/index.ts apps/collecteur/src/hors-ligne/vues.ts apps/collecteur/src/hors-ligne/vues.test.ts apps/collecteur/src/hors-ligne/useHorsLigne.ts apps/collecteur/src/hors-ligne/useHorsLigne.test.tsx apps/collecteur/src/ecrans/Accueil.tsx apps/collecteur/src/ecrans/Accueil.test.tsx apps/collecteur/src/ecrans/Clients.tsx apps/collecteur/src/ecrans/Clients.test.tsx apps/collecteur/src/ecrans/Encaisser.tsx apps/collecteur/src/Coquille.tsx apps/collecteur/src/Coquille.test.tsx apps/collecteur/src/ecrans/EquipeClients.tsx apps/collecteur/src/ecrans/EquipeClients.test.tsx
git commit -m "feat(hors-ligne): le bandeau dit ce que la file contient, et la sortie attend qu'elle soit vide" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Attendu : tout au vert. `grep -rn "synchronisés dès connexion" apps packages --include=*.tsx --include=*.ts` ne trouve plus que des citations de l'ancienne phrase : le commentaire de `messageFile` (`Bandeaux.tsx`), le commentaire et l'assertion négative d'`EquipeClients.test.tsx`, et l'assertion négative d'`Accueil.test.tsx`. Aucune n'est affichée.

---

## Tâche 15 : la fiche client — le sursis entre dans la file dès l'appui

**Le code livré diffère de cette tâche.** Écart 43 (un refus n'attend plus sur la carte ; l'annulation se reconnaît par `operationId`, commit `21a2af3`). Le dépôt fait foi ; les blocs ci-dessous restent le plan d'origine.

**Fichiers :**
- Modifier : `apps/collecteur/src/encaissement-differe.ts`, `apps/collecteur/src/encaissement-differe.test.ts` (tous deux LF)
- Modifier : `apps/collecteur/src/hors-ligne/vues.ts`, `apps/collecteur/src/hors-ligne/vues.test.ts` (ce qui attend sur une carte)
- Modifier : `apps/collecteur/src/ecrans/FicheClient.tsx`, `apps/collecteur/src/ecrans/FicheClient.test.tsx` (31 insécables avant, 4 après)

**Interfaces :**
- Consomme : `enregistrerMise(…, encaisseLe, { sursisMs })`, `annulerMise`, `avancerEnvoi` (tâche 13) ; `useHorsLigne` et `identifiantsEnAttente` (tâche 14) ; `useEnLigne` (`@kolek/ui`).
- Produit (`encaissement-differe.ts`) : `EnAttente` gagne `operationId: string | null` ; `misesAffichees` ne compte le jour de plus que si `operationId` n'est pas `null`.
- Produit (`vues.ts`) : `interface AttenteCarte { mises: number; creation: boolean }`, `enAttenteSurCarte(operations: readonly Operation[], carteId: string): AttenteCarte`, `phraseAttenteCarte(attente: AttenteCarte): string | null`.
- Écart 4 ; spec §7 (sursis, garde-fous des gestes restés en ligne) et §8.3.

- [ ] **Étape 1 : l'attente porte l'opération**

Remplacer tout le contenu de `apps/collecteur/src/encaissement-differe.test.ts` (**LF** : ne pas lui passer `crlf.mjs`) par :

```ts
import { describe, expect, it } from 'vitest';

import {
  estRattrapee,
  misesAffichees,
  SURSIS_MS,
  SURSIS_S,
  type EnAttente,
} from './encaissement-differe';

function attente(partiel: Partial<EnAttente> = {}): EnAttente {
  return { carteId: 'k1', mise: 1000, base: 5, operationId: 'op-1', envoyee: false, ...partiel };
}

describe('misesAffichees', () => {
  it('rend le compte réel quand rien n\'attend', () => {
    expect(misesAffichees('k1', 5, null)).toBe(5);
  });

  it('ne touche pas aux cartes voisines', () => {
    // L'optimisme vaut pour la carte qu'on vient d'encaisser, et pour elle
    // seule. Une case remplie sur la carte d'à côté serait un mensonge.
    expect(misesAffichees('k2', 12, attente())).toBe(12);
  });

  it('compte le jour de plus sur la carte dont la mise est sur le téléphone', () => {
    expect(misesAffichees('k1', 5, attente())).toBe(6);
  });

  it('ne compte rien pour un appui que le téléphone a refusé', () => {
    // Rien n'est montré comme fait avant d'être sur le disque (spec J2b §4.1).
    expect(misesAffichees('k1', 5, attente({ operationId: null, envoyee: true, echec: 'Refus' }))).toBe(5);
  });

  it('ne fait jamais redescendre le compte', () => {
    // La relecture de la tournée compte déjà la mise en file. Si elle compte
    // davantage — une seconde mise partie d'ailleurs — c'est elle qui dit
    // vrai ; la case ne doit pas se revider pour autant.
    expect(misesAffichees('k1', 6, attente())).toBe(6);
    expect(misesAffichees('k1', 7, attente())).toBe(7);
  });
});

describe('estRattrapee', () => {
  it('reste fausse tant que la relecture n\'a rien ramené', () => {
    expect(estRattrapee(5, attente())).toBe(false);
  });

  it('devient vraie dès que la mise est comptée par la tournée', () => {
    expect(estRattrapee(6, attente())).toBe(true);
  });
});

describe('le sursis', () => {
  it('vaut six secondes, dites une seule fois', () => {
    // Les deux valeurs servent deux usages — l'échéance de l'opération et le
    // décompte affiché. Les laisser diverger ferait disparaître « Annuler » une
    // seconde avant, ou après, l'instant où il cesse d'être vrai.
    expect(SURSIS_S).toBe(6);
    expect(SURSIS_MS).toBe(SURSIS_S * 1000);
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/encaissement-differe.test.ts`
Attendu : FAIL — « ne compte rien pour un appui que le téléphone a refusé » rend 6.

Remplacer tout le contenu de `apps/collecteur/src/encaissement-differe.ts` (LF) par :

```ts
/**
 * Ce qui se décide pendant les six secondes de sursis, sans horloge ni réseau.
 *
 * ## Pourquoi un sursis, et pas une annulation
 *
 * `mises` est append-only : le trigger `mises_immuables` refuse `update` et
 * `delete`, et il est `BEFORE`, donc il s'applique aussi aux accès par clé de
 * service que RLS ne filtre pas. Une mise écrite au serveur ne se défait pas.
 *
 * « Annuler » ne peut donc exister qu'avant l'envoi. Depuis J2b, l'appui écrit
 * l'opération dans la file du téléphone avec une échéance à six secondes ; le
 * synchroniseur ne l'envoie qu'après, et « Annuler » la retire de la file d'ici
 * là (`hors-ligne/file.ts`, `annuler`). Un rechargement pendant le sursis ne
 * perd plus rien : l'opération est sur le disque.
 *
 * ## Pourquoi ces fonctions sont pures
 *
 * Le minuteur vit dans l'écran, où il a un cycle de vie. Ce qui se *décide* —
 * quel compte montrer, quand l'attente n'a plus d'objet — se teste sans
 * attendre six secondes, et se relit sans dérouler un rendu.
 */

/** Le sursis, en secondes. C'est aussi ce que le bouton « Annuler » décompte. */
export const SURSIS_S = 6;

/** Le même sursis, en millisecondes, pour l'échéance de l'opération. */
export const SURSIS_MS = SURSIS_S * 1000;

export interface EnAttente {
  carteId: string;
  mise: number;
  /** `misesEncaissees` au moment de l'appui. Sert à savoir quand purger. */
  base: number;
  /** L'opération dans la file du téléphone. `null` : rien n'a été écrit. */
  operationId: string | null;
  /** L'échéance est passée ou a été avancée : « Annuler » n'a plus d'objet. */
  envoyee: boolean;
  /** Renseigné quand l'enregistrement a échoué. */
  echec?: string;
}

/**
 * Le compte à montrer sur une carte.
 *
 * Le jour de plus ne compte que si l'opération est sur le disque (spec J2b
 * §4.1) : un refus n'a rien écrit, la case ne se remplit pas.
 *
 * `Math.max` et non `base + 1` : la relecture de la tournée compte déjà la mise
 * en file, et peut compter davantage. C'est elle qui dit vrai — mais la case ne
 * doit jamais se revider en chemin.
 */
export function misesAffichees(
  carteId: string,
  reelles: number,
  attente: EnAttente | null,
): number {
  if (!attente || attente.carteId !== carteId || attente.operationId === null) return reelles;
  return Math.max(reelles, attente.base + 1);
}

/** La relecture a-t-elle ramené la mise qu'on tenait à bout de bras ? */
export function estRattrapee(reelles: number, attente: EnAttente): boolean {
  return reelles > attente.base;
}
```

Run : `npm run test -w @kolek/collecteur -- src/encaissement-differe.test.ts`
Attendu : PASS, 9 épreuves.

- [ ] **Étape 2 : ce qui attend sur une carte**

Dans `apps/collecteur/src/hors-ligne/vues.test.ts`, ajouter `enAttenteSurCarte,` et `phraseAttenteCarte,` à l'import de `./vues` (ordre alphabétique), puis ajouter à la fin du fichier :

```ts
describe('ce qui attend sur une carte (§7)', () => {
  it('compte les mises de la carte, et elles seules', () => {
    const file = [
      operationMise(1, { carteId: 'k1' }),
      operationMise(2, { carteId: 'k1' }),
      operationMise(3, { carteId: 'k2' }),
    ];

    expect(enAttenteSurCarte(file, 'k1')).toEqual({ mises: 2, creation: false });
    expect(phraseAttenteCarte(enAttenteSurCarte(file, 'k1'))).toBe(
      '2 mises de cette carte pas encore envoyées.',
    );
    expect(phraseAttenteCarte(enAttenteSurCarte(file, 'k2'))).toBe(
      '1 mise de cette carte pas encore envoyée.',
    );
  });

  it('dit la carte elle-même pas encore envoyée, qu’elle vienne d’une inscription ou non', () => {
    expect(
      enAttenteSurCarte([operationClientCarte(1, { clientId: 'c1', carteId: 'k1' })], 'k1'),
    ).toEqual({ mises: 0, creation: true });
    expect(
      phraseAttenteCarte(enAttenteSurCarte([operationCarte(1, { carteId: 'k2', clientId: 'c1' })], 'k2')),
    ).toBe('Cette carte n’est pas encore envoyée.');
  });

  it('se tait quand rien de la carte n’est en file', () => {
    expect(phraseAttenteCarte(enAttenteSurCarte([operationCaisse(1, { cashDeclare: 0 })], 'k1'))).toBeNull();
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts`
Attendu : FAIL, « enAttenteSurCarte is not a function ».

Ajouter à la fin de `apps/collecteur/src/hors-ligne/vues.ts` :

```ts
/** Ce qui, sur une carte, n'a pas encore quitté le téléphone. */
export interface AttenteCarte {
  mises: number;
  /** La carte elle-même est encore en file — ouverte seule, ou avec son client. */
  creation: boolean;
}

export function enAttenteSurCarte(operations: readonly Operation[], carteId: string): AttenteCarte {
  let mises = 0;
  let creation = false;
  for (const o of operations) {
    if (o.type === 'mise' && o.charge.carteId === carteId) mises += 1;
    if (
      (o.type === 'carte' && o.charge.id === carteId) ||
      (o.type === 'client_carte' && o.charge.carte.id === carteId)
    ) {
      creation = true;
    }
  }
  return { mises, creation };
}

/**
 * Pourquoi le retrait de cette carte attend, ou `null` (spec J2b §7).
 *
 * La clôture recalcule au serveur ce qui est rendu, depuis les mises qu'il a
 * reçues. Tant qu'une opération de la carte est sur le téléphone, ce calcul en
 * manquerait une : le client repartirait avec moins que son dû, ou la clôture
 * tomberait sur une mise encore en route (`CARTE_CLOTUREE`).
 */
export function phraseAttenteCarte(attente: AttenteCarte): string | null {
  if (attente.creation) return 'Cette carte n’est pas encore envoyée.';
  if (attente.mises === 0) return null;
  const s = attente.mises > 1 ? 's' : '';
  return `${attente.mises} mise${s} de cette carte pas encore envoyée${s}.`;
}
```

Puis `node crlf.mjs apps/collecteur/src/hors-ligne/vues.ts apps/collecteur/src/hors-ligne/vues.test.ts`.

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts`
Attendu : PASS, 23 épreuves.

- [ ] **Étape 3 : réécrire les épreuves du sursis**

Mesurer d'abord : `node crlf.mjs --mesurer apps/collecteur/src/ecrans/FicheClient.test.tsx` — attendu `CRLF nbsp=31`. Les 31 insécables sont dans les noms de boutons « Encaisser 6 000 FCFA » et « Encaisser 2 000 FCFA » écrits à la main (`findByRole` compare le nom accessible sans normaliser les espaces). Les épreuves réécrites construisent ces noms avec `formatMontant` et n'en portent plus aucune ; quatre restent, dans l'épreuve « porte le montant de sa propre carte », qui ne change pas.

**3a.** Dans `apps/collecteur/src/ecrans/FicheClient.test.tsx`, par l'outil d'édition (ces lignes n'ont pas d'insécable) :

1. Remplacer la ligne `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';` par :

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { operationClientCarte, operationMise } from '../hors-ligne/fabriques';
```

2. Remplacer :

```tsx
const enregistrerMise = vi.fn();
const modifierClient = vi.fn();

vi.mock('../ecritures', () => ({
  definirConsentementAvis: vi.fn(),
  ouvrirCarte: vi.fn(),
  enregistrerMise: (collecteurId: string, carteId: string, montant: number) =>
    enregistrerMise(collecteurId, carteId, montant),
  modifierClient: (id: string, correction: unknown, origine: unknown) =>
    modifierClient(id, correction, origine),
}));
```

par :

```tsx
const enregistrerMise = vi.fn();
const annulerMise = vi.fn();
const avancerEnvoi = vi.fn();
const modifierClient = vi.fn();

vi.mock('../ecritures', () => ({
  definirConsentementAvis: vi.fn(),
  ouvrirCarte: vi.fn(),
  enregistrerMise: (...args: unknown[]) => enregistrerMise(...args),
  annulerMise: (...args: unknown[]) => annulerMise(...args),
  avancerEnvoi: (...args: unknown[]) => avancerEnvoi(...args),
  modifierClient: (id: string, correction: unknown, origine: unknown) =>
    modifierClient(id, correction, origine),
}));

/** La file du téléphone, telle que la fiche la lit. Vide par défaut. */
let operationsEnFile: unknown[] = [];
vi.mock('../hors-ligne/useHorsLigne', () => ({
  useHorsLigne: () => ({
    operations: operationsEnFile,
    refus: [],
    tournee: null,
    file: null,
    stockage: 'inconnu',
  }),
}));
```

3. Remplacer :

```tsx
afterEach(() => {
  cleanup();
  chargerFicheClient.mockReset();
  enregistrerMise.mockReset();
  vi.useRealTimers();
});
```

par :

```tsx
beforeEach(() => {
  annulerMise.mockResolvedValue('annulee');
  avancerEnvoi.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  chargerFicheClient.mockReset();
  enregistrerMise.mockReset();
  annulerMise.mockReset();
  avancerEnvoi.mockReset();
  operationsEnFile = [];
  delete (window.navigator as unknown as { onLine?: boolean }).onLine;
  vi.useRealTimers();
});

/**
 * Les noms des boutons d'encaissement portent l'insécable de `formatMontant`,
 * et `findByRole` compare le nom accessible sans normaliser les espaces. Ils se
 * construisent donc, ils ne se tapent pas.
 */
const ENCAISSER_6000 = `Encaisser ${formatMontant(6000)} FCFA`;
const ENCAISSER_2000 = `Encaisser ${formatMontant(2000)} FCFA`;
const ENCAISSER_3000 = `Encaisser ${formatMontant(3000)} FCFA`;

const MISE_ENREGISTREE = { ok: true, miseId: 'mise-1', operationId: 'op-1' };

/**
 * Laisse l'enregistrement simulé rendre la main : des promesses, aucun minuteur.
 * Utilisable sous minuteurs simulés, où `waitFor` resterait suspendu.
 */
const laisserEcrire = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

function rendreFiche(proprietes: Partial<Parameters<typeof FicheClient>[0]> = {}) {
  return render(
    <FicheClient
      clientId="cli3"
      revision={0}
      collecteurId="col1"
      onFermer={vi.fn()}
      onEcriture={vi.fn()}
      onRetrait={vi.fn()}
      {...proprietes}
    />,
  );
}
```

4. Dans la documentation du `describe('la correction résiste à ce qui se passe autour'`, remplacer :

```tsx
 * `CartesEnCours` écrit la mise différée six secondes après l'appui — ou tout de
 * suite quand l'application passe en arrière-plan — puis appelle
 * `onEcriture`. La coquille fait alors monter `revision`, la fiche repasse par
 * `null` avant de se relire, et tout le bloc `{fiche && (…)}` se démonte.
```

par :

```tsx
 * `CartesEnCours` enregistrait la mise six secondes après l'appui, puis
 * appelait `onEcriture`. La coquille faisait alors monter `revision`, et
 * jusqu'à J2b la fiche repassait par `null` avant de se relire, démontant tout
 * le bloc `{fiche && (…)}`.
```

**3b.** Écrire, dans le répertoire temporaire de l'exécutant (noté `$TMP`), le fichier `$TMP/fiche-bloc-a.tsx` — il remplace les épreuves du sursis du premier `describe` et tout le `describe('ce qui attend part quand on cesse de regarder'` :

```tsx
  it('met la mise sur le téléphone dès l’appui, sur la bonne carte, envoyable dans six secondes', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    rendreFiche();

    // Le tri met la plus avancée en premier : kB (20 mises) est en face, kA
    // (5 mises) est sa voisine. On amène la voisine, et c'est elle qu'on
    // touche — encaisser sur la mauvaise carte ne se rattrape pas.
    expect(await screen.findByRole('button', { name: ENCAISSER_6000 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));
    fireEvent.click(await screen.findByRole('button', { name: ENCAISSER_2000 }));

    // Plus de minuteur avant l'écriture (spec J2b §7) : l'opération est sur le
    // disque dès l'appui, et c'est son échéance qui porte le sursis. Un
    // rechargement pendant les six secondes ne la perd plus (écart 4).
    await waitFor(() => expect(enregistrerMise).toHaveBeenCalledTimes(1));
    const [collecteur, carte, montant, quand, options] = enregistrerMise.mock.calls[0]!;
    expect([collecteur, carte, montant]).toEqual(['col1', 'kA', 2000]);
    expect(quand).toBeInstanceOf(Date);
    expect(options).toEqual({ sursisMs: 6000 });
  });

  it('ne compte le jour qu’une fois la mise sur le téléphone', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    let ecrire: (valeur: unknown) => void = () => {};
    enregistrerMise.mockImplementation(
      () =>
        new Promise((resoudre) => {
          ecrire = resoudre;
        }),
    );
    rendreFiche();

    // kB est en face : 20 mises sur 31.
    expect(await screen.findByText('20/31 j · 65 %')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));

    // Rien n'est montré comme fait avant d'être sur le disque (§4.1).
    expect(screen.getByText('20/31 j · 65 %')).toBeTruthy();

    await act(async () => {
      ecrire(MISE_ENREGISTREE);
    });
    await laisserEcrire();

    expect(screen.getByText('21/31 j · 68 %')).toBeTruthy();
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();
  });

  it('n’enregistre qu’une mise sur un double appui', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    let ecrire: (valeur: unknown) => void = () => {};
    enregistrerMise.mockImplementationOnce(
      () =>
        new Promise((resoudre) => {
          ecrire = resoudre;
        }),
    );
    rendreFiche();

    const bouton = await screen.findByRole('button', { name: ENCAISSER_6000 });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await act(async () => {
      ecrire(MISE_ENREGISTREE);
    });
    await laisserEcrire();

    expect(enregistrerMise).toHaveBeenCalledTimes(1);
  });

  it('« Annuler » retire la mise du téléphone, et la case se revide', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    annulerMise.mockResolvedValue('annulee');
    rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    // Les minuteurs sont gelés **avant** l'appui : le sursis se pose dès que
    // l'écriture rend la main, et un minuteur né sous l'horloge réelle ne
    // répond pas à `advanceTimersByTime`.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await laisserEcrire();

    // L'opération n'était jamais partie : la retirer de la file suffit, et rien
    // n'a touché le serveur.
    expect(annulerMise).toHaveBeenCalledWith('col1', 'op-1');
    expect(screen.getByRole('button', { name: ENCAISSER_6000 })).toBeTruthy();
    expect(screen.getByText('20/31 j · 65 %')).toBeTruthy();
  });

  it('retire « Annuler » à la fin du sursis, et garde la mise', async () => {
    // Passé l'échéance, le synchroniseur peut l'envoyer. Laisser « Annuler » à
    // l'écran promettrait un retour arrière que la base refuse.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();
    expect(annulerMise).not.toHaveBeenCalled();
  });

  it('ne promet rien quand « Annuler » arrive après l’échéance', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    // L'horloge du téléphone a dépassé l'échéance entre l'affichage et l'appui.
    annulerMise.mockResolvedValue('partie');
    rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await laisserEcrire();

    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();
    expect(screen.getByText('21/31 j · 68 %')).toBeTruthy();
  });

  it('laisse le bandeau sur sa carte quand on en choisit une autre', async () => {
    // Le décompte court pendant que le collecteur va regarder l'autre carnet —
    // c'est même le geste que la rangée existe pour rendre facile. La mise qui
    // attend ne peut pas disparaître de l'écran à ce moment-là.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));

    // kA est désormais la carte choisie et porte son bouton — et le bandeau de
    // kB est toujours là, avec son « Annuler ».
    expect(screen.getByRole('button', { name: ENCAISSER_2000 })).toBeTruthy();
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
  });

  it('fait partir tout de suite la mise en sursis quand on encaisse une autre carte', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise
      .mockResolvedValueOnce(MISE_ENREGISTREE)
      .mockResolvedValueOnce({ ok: true, miseId: 'mise-2', operationId: 'op-2' });
    rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(avancerEnvoi).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_2000 }));
    await laisserEcrire();

    // Une seule attente à la fois. Celle qu'on abandonne ne se perd pas : elle
    // est déjà sur le disque, elle part maintenant au lieu de dans quatre secondes.
    expect(avancerEnvoi).toHaveBeenCalledWith('col1', 'op-1');
    expect(enregistrerMise).toHaveBeenCalledTimes(2);
    expect(enregistrerMise.mock.calls[1]!.slice(0, 3)).toEqual(['col1', 'kA', 2000]);
  });

  it('laisse la case vide sur un refus du téléphone, et « Réessayer » refait un appui', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValueOnce({
      ok: false,
      echec: {
        code: 'STOCKAGE',
        message:
          'Enregistrement impossible sur ce téléphone : rien n’a été compté. Libère de la place, puis réessaie.',
      },
    });
    rendreFiche();

    fireEvent.click(await screen.findByRole('button', { name: ENCAISSER_6000 }));

    expect(await screen.findByText(/rien n’a été compté/)).toBeTruthy();
    // Rien n'est sur le disque : la case le dit, et il n'y a rien à annuler.
    expect(screen.getByText('20/31 j · 65 %')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();

    enregistrerMise.mockResolvedValueOnce(MISE_ENREGISTREE);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(enregistrerMise).toHaveBeenCalledTimes(2));
    expect(enregistrerMise.mock.calls[1]!.slice(0, 3)).toEqual(['col1', 'kB', 6000]);
  });
});

/**
 * Le sursis est une échéance, pas une promesse d'oubli.
 *
 * Depuis J2b, la mise est sur le disque dès l'appui : ni une fiche refermée, ni
 * une application tuée en arrière-plan ne peuvent la perdre. Ce qui reste à
 * garantir, c'est qu'elle n'attende pas six secondes pour rien quand plus
 * personne ne regarde « Annuler ».
 */
describe('ce qui attend part quand on cesse de regarder', () => {
  it('avance l’envoi quand la fiche se referme pendant le sursis', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    const { rerender } = rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(avancerEnvoi).not.toHaveBeenCalled();

    // `clientId` à `null` referme la feuille, qui ne rend plus rien.
    act(() => {
      rerender(
        <FicheClient
          clientId={null}
          revision={0}
          collecteurId="col1"
          onFermer={vi.fn()}
          onEcriture={vi.fn()}
          onRetrait={vi.fn()}
        />,
      );
    });

    expect(avancerEnvoi).toHaveBeenCalledTimes(1);
    expect(avancerEnvoi).toHaveBeenCalledWith('col1', 'op-1');
  });

  it('avance l’envoi quand l’application passe en arrière-plan', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // `visibilityState` est un accesseur de `Document.prototype`, pas une
    // propriété propre du document : `vi.spyOn` n'a rien à remplacer dessus.
    // On pose l'accesseur sur l'instance, et on le retire ensuite.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    delete (document as unknown as { visibilityState?: DocumentVisibilityState }).visibilityState;

    expect(avancerEnvoi).toHaveBeenCalledTimes(1);
    expect(avancerEnvoi).toHaveBeenCalledWith('col1', 'op-1');
  });

  it('n’avance rien quand le sursis est déjà passé', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    const { rerender } = rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    act(() => {
      rerender(
        <FicheClient
          clientId={null}
          revision={0}
          collecteurId="col1"
          onFermer={vi.fn()}
          onEcriture={vi.fn()}
          onRetrait={vi.fn()}
        />,
      );
    });

    expect(avancerEnvoi).not.toHaveBeenCalled();
    expect(enregistrerMise).toHaveBeenCalledTimes(1);
  });

  it('garde le bandeau et « Annuler » quand la fiche se relit pendant le sursis', async () => {
    // Le geste signale un changement, la coquille fait monter `revision`, la
    // fiche se relit — et compte déjà la mise, puisque la tournée lue porte la
    // file. Jusqu'à J2b la fiche repassait par « Lecture… » et démontait le
    // bandeau : « Annuler » aurait disparu sous le doigt.
    const ficheRelue = {
      ...FICHE_DEUX_CARTES_ENCAISSABLES,
      cartes: FICHE_DEUX_CARTES_ENCAISSABLES.cartes.map((c) =>
        c.id === 'kB' ? { ...c, misesEncaissees: 21 } : c,
      ),
    };
    chargerFicheClient.mockResolvedValueOnce(FICHE_DEUX_CARTES_ENCAISSABLES).mockResolvedValue(ficheRelue);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    const { rerender } = rendreFiche();
    await screen.findByRole('button', { name: ENCAISSER_6000 });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: ENCAISSER_6000 }));
    await laisserEcrire();
    act(() => {
      rerender(
        <FicheClient
          clientId="cli3"
          revision={1}
          collecteurId="col1"
          onFermer={vi.fn()}
          onEcriture={vi.fn()}
          onRetrait={vi.fn()}
        />,
      );
    });
    await laisserEcrire();

    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
    // Compté une fois : la relecture et l'attente disent le même jour.
    expect(screen.getByText('21/31 j · 68 %')).toBeTruthy();
    expect(screen.queryByText(/22\/31 j/)).toBeNull();
  });
});
```

**3c.** Écrire `$TMP/fiche-bloc-b.tsx` — il remplace les `describe` de la relecture, de la fin de cycle, du rappel qui lève et de l'écriture qui ne rend rien, et ajoute les garde-fous :

```tsx
/**
 * La carte choisie vit dans `FicheClient`, pas dans `CartesEnCours` : voir le
 * commentaire posé sur ce `useState`. Une relecture ne doit jamais ramener le
 * choix sur la carte la plus avancée — même quand ce n'est pas celle qu'on
 * vient de payer.
 */
describe('la carte choisie survit à la relecture qui suit un encaissement', () => {
  it('reste sur la carte la moins avancée après le sursis et la relecture qui suit', async () => {
    const ficheApresEcriture = {
      ...FICHE_DEUX_CARTES_ENCAISSABLES,
      cartes: FICHE_DEUX_CARTES_ENCAISSABLES.cartes.map((c) =>
        c.id === 'kA' ? { ...c, misesEncaissees: 6 } : c,
      ),
    };
    chargerFicheClient
      .mockResolvedValueOnce(FICHE_DEUX_CARTES_ENCAISSABLES)
      .mockResolvedValue(ficheApresEcriture);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    const { rerender } = rendreFiche();

    // kB (20 mises) est en tête ; on amène kA (5 mises), la moins avancée.
    await screen.findByRole('button', { name: ENCAISSER_6000 });
    fireEvent.click(screen.getByRole('button', { name: 'Carte 2 sur 2' }));
    const bouton = await screen.findByRole('button', { name: ENCAISSER_2000 });

    vi.useFakeTimers();
    fireEvent.click(bouton);
    await laisserEcrire();
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    // La coquille relit la fiche en changeant `revision`.
    act(() => {
      rerender(
        <FicheClient
          clientId="cli3"
          revision={1}
          collecteurId="col1"
          onFermer={vi.fn()}
          onEcriture={vi.fn()}
          onRetrait={vi.fn()}
        />,
      );
    });
    await laisserEcrire();

    // kA est toujours la carte choisie : c'est son bouton, qui porte sa propre
    // mise, qui est à l'écran — pas une position de carrousel qui coïnciderait
    // par hasard avec le tri par avancement.
    expect(screen.getByRole('button', { name: ENCAISSER_2000 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: ENCAISSER_6000 })).toBeNull();
  });
});

/**
 * `mises` est append-only : une mise encore annulable n'est pas actée, donc le
 * panneau de fin de cycle — qui propose de rendre l'argent — ne doit pas
 * apparaître tant qu'elle peut encore l'être.
 */
describe('fin de cycle : le panneau attend que la mise ne soit plus annulable', () => {
  it('ne montre pas « Cycle terminé » tant que la mise du jour peut encore être annulée', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_CARTE_PRESQUE_COMPLETE);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);
    rendreFiche({ clientId: 'cli6' });

    const bouton = await screen.findByRole('button', { name: ENCAISSER_3000 });

    vi.useFakeTimers();
    fireEvent.click(bouton);
    await laisserEcrire();

    // La case affiche 31/31, et la mise peut encore être retirée de la file :
    // le panneau de fin de cycle ne doit pas apparaître à côté du bandeau.
    expect(screen.getByText(/FCFA encaissé/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aller au retrait' })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    // Le sursis est passé : la mise n'est plus annulable, le panneau peut enfin
    // proposer de rendre l'argent ou d'ouvrir une carte de plus.
    expect(screen.getByRole('button', { name: 'Aller au retrait' })).toBeTruthy();
  });
});

/**
 * Le rappel du composant appelant n'a rien à voir avec le succès de
 * l'enregistrement : un rejet qui y prend naissance ne doit pas se faire passer
 * pour un échec — avec un « Réessayer » qui écrirait une seconde mise.
 */
describe('un rappel qui lève après coup ne doit pas se faire passer pour un échec d’écriture', () => {
  it('ne montre aucune erreur si onEcriture lève après un enregistrement réussi', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockResolvedValue(MISE_ENREGISTREE);

    const onEcriture = vi.fn(() => {
      throw new Error('boom');
    });

    // `onEcriture` est hors de tout `try` : son rejet synchrone devient un rejet
    // de promesse « non gérée » au sens de Node — attendu ici, puisque c'est le
    // rappel qui lève exprès. Vitest ignore un rejet non géré dès qu'un second
    // écouteur existe sur l'événement (voir `listenForErrors` dans son
    // runtime) : ce test en pose un, pour la seule durée du test.
    //
    // Ce seuil est un détail d'implémentation de Vitest, pas un contrat. Si une
    // montée de version casse ce test, c'est la bonne direction — il passera au
    // rouge, jamais au vert silencieux.
    //
    // `process` n'a pas de types ici : `tsconfig.app.json` ne charge que
    // `vite/client`, pas `@types/node`.
    const proc = (
      globalThis as unknown as {
        process: {
          on: (evenement: string, ecouteur: () => void) => void;
          off: (evenement: string, ecouteur: () => void) => void;
        };
      }
    ).process;
    const surRejetAttendu = () => {};
    proc.on('unhandledRejection', surRejetAttendu);

    try {
      rendreFiche({ onEcriture });

      fireEvent.click(await screen.findByRole('button', { name: ENCAISSER_6000 }));

      await waitFor(() => expect(onEcriture).toHaveBeenCalledTimes(1));

      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
      // Le sursis est bien posé : « Annuler » est là.
      expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
      expect(enregistrerMise).toHaveBeenCalledTimes(1);
    } finally {
      proc.off('unhandledRejection', surRejetAttendu);
    }
  });
});

describe('quand l’enregistrement ne rend rien du tout', () => {
  it('ouvre une sortie sans rien promettre quand l’enregistrement lève', async () => {
    // `enregistrerMise` rend `{ ok: false }` sur tout refus connu. Un rejet ne
    // devrait jamais arriver ; s'il arrive, rien ne dit si l'opération a été
    // écrite avant. Sans filet, l'écran resterait figé, sans sortie.
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    enregistrerMise.mockRejectedValue(new Error('disque'));
    rendreFiche();

    fireEvent.click(await screen.findByRole('button', { name: ENCAISSER_6000 }));

    expect(await screen.findByText(/Vérifie la carte avant de réessayer/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
  });

  it('le dit tout de suite quand la session manque, sans rien écrire', async () => {
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES_ENCAISSABLES);
    rendreFiche({ collecteurId: null });

    fireEvent.click(await screen.findByRole('button', { name: ENCAISSER_6000 }));

    expect(enregistrerMise).not.toHaveBeenCalled();
    expect(screen.getByText(/Session perdue/)).toBeTruthy();
  });
});

/**
 * Les gestes restés en ligne, et leurs garde-fous (spec J2b §7).
 *
 * La clôture recalcule au serveur ce qui est rendu : tant qu'une opération de la
 * carte est sur le téléphone, ce calcul en manquerait une. La correction de
 * fiche et le consentement sont des modifications : sans réseau, ou sur un
 * client que le serveur ne connaît pas encore, ils partiraient dans le vide.
 */
describe('les gestes restés en ligne attendent la file et le réseau', () => {
  it('n’offre pas le retrait tant qu’une mise de la carte attend l’envoi', async () => {
    operationsEnFile = [operationMise(1, { carteId: 'k1' })];
    chargerFicheClient.mockResolvedValue(FICHE_DEUX_CARTES);
    rendreFiche({ clientId: 'cli1' });

    const retrait = (await screen.findByRole('button', { name: 'Aller au retrait' })) as HTMLButtonElement;

    expect(retrait.disabled).toBe(true);
    expect(screen.getByText('1 mise de cette carte pas encore envoyée.')).toBeTruthy();
  });

  it('demande le réseau pour le retrait, la correction de fiche et les avis', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    chargerFicheClient.mockResolvedValue({
      ...FICHE_DEUX_CARTES,
      telephone: '0709201790',
      avisActifs: true,
    });
    rendreFiche({ clientId: 'cli1' });

    const retrait = (await screen.findByRole('button', { name: 'Aller au retrait' })) as HTMLButtonElement;

    expect(retrait.disabled).toBe(true);
    expect(screen.getByText('Le retrait demande le réseau.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Corriger la fiche' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Ne plus prévenir' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Corriger la fiche ou les avis demande le réseau.')).toBeTruthy();
  });

  it('ne laisse pas corriger un client pas encore envoyé', async () => {
    operationsEnFile = [operationClientCarte(1, { clientId: 'cli8', carteId: 'seule' })];
    chargerFicheClient.mockResolvedValue(FICHE_AVEC_AVIS);
    rendreFiche({ clientId: 'cli8' });

    const corriger = (await screen.findByRole('button', { name: 'Corriger la fiche' })) as HTMLButtonElement;

    expect(corriger.disabled).toBe(true);
    expect(
      screen.getByText('Client pas encore envoyé : sa fiche se corrige une fois arrivé au serveur.'),
    ).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Ne plus prévenir' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('marque « pas encore envoyée » la mise en file, et elle seule, dans les derniers versements', async () => {
    operationsEnFile = [operationMise(1, { carteId: 'seule' })];
    chargerFicheClient.mockResolvedValue({
      ...FICHE_UNE_CARTE_EN_COURS,
      mises: [
        { id: 'mise-1', montant: 1000, encaisseLe: '2026-09-13T09:00:00.000Z', estCommission: false },
        { id: 'ancienne', montant: 1000, encaisseLe: '2026-09-12T09:00:00.000Z', estCommission: false },
      ],
    });
    rendreFiche({ clientId: 'cli7' });

    expect(await screen.findByText('1 mise de cette carte pas encore envoyée.')).toBeTruthy();
    expect(screen.getAllByText(/· pas encore envoyée$/)).toHaveLength(1);
  });
});
```

**3d.** Écrire `$TMP/fiche-epreuves.json` (les chemins en barres obliques, `$TMP` remplacé par sa valeur) :

```json
{
  "fichier": "apps/collecteur/src/ecrans/FicheClient.test.tsx",
  "insecables": { "avant": 31, "apres": 4 },
  "remplacements": [
    {
      "debut": "  it('n’écrit rien avant la fin du sursis, et écrit la bonne carte après', async () => {",
      "fin": "describe('numéro de cycle : l’ancienneté, jamais l’avancement', () => {",
      "avantFin": 1,
      "contenu": "$TMP/fiche-bloc-a.tsx"
    },
    {
      "debut": " * La carte choisie vit dans `FicheClient`, pas dans `CartesEnCours` : voir",
      "avantDebut": 1,
      "fin": " * L'historique complet, et la pilule dessinée à la main qui le précédait.",
      "avantFin": 2,
      "contenu": "$TMP/fiche-bloc-b.tsx"
    }
  ]
}
```

Puis : `node $TMP/remplacer-blocs.mjs $TMP/fiche-epreuves.json`
Attendu : `apps/collecteur/src/ecrans/FicheClient.test.tsx : 2 bloc(s), insécables 31 → 4, CRLF`. Toute autre sortie — ancre trouvée zéro ou deux fois, compte d'insécables différent — arrête l'étape sans rien écrire : relire les ancres contre le fichier, ne pas forcer.

Puis `node crlf.mjs apps/collecteur/src/ecrans/FicheClient.test.tsx` — attendu `CRLF nbsp=4`.

Run : `npm run test -w @kolek/collecteur -- src/ecrans/FicheClient.test.tsx`
Attendu : FAIL — la fiche attend encore six secondes avant d'appeler `enregistrerMise`, n'appelle ni `annulerMise` ni `avancerEnvoi`, et n'a aucun garde-fou.

- [ ] **Étape 4 : la fiche client**

Mesurer : `node crlf.mjs --mesurer apps/collecteur/src/ecrans/FicheClient.tsx` — attendu `CRLF nbsp=0`.

**4a.** Écrire `$TMP/cartes-en-cours.tsx` — la fonction `CartesEnCours` entière :

```tsx
function CartesEnCours({
  actives,
  nomClient,
  clientId,
  collecteurId,
  operations,
  enLigne,
  onRetrait,
  onEcriture,
  visibleId,
  onVisible,
}: {
  actives: Array<{ carte: CarteFiche; cycle: number }>;
  nomClient: string;
  clientId: string;
  collecteurId: string | null;
  /** La file du téléphone : une opération de la carte encore là ferme le retrait (§7). */
  operations: readonly Operation[];
  enLigne: boolean;
  /** Le nom accompagne la demande : l'écran de retrait s'ouvre réduit à ce
      client et doit pouvoir le nommer même quand il ne lui reste aucune carte. */
  onRetrait: (clientNom: string) => void;
  onEcriture: () => void;
  /** Tenue par `FicheClient`, qui survit à la relecture — voir le
      commentaire posé là-bas sur ce `useState`. */
  visibleId: string | null;
  onVisible: (id: string) => void;
}) {
  const [attente, setAttente] = useState<EnAttente | null>(null);
  const [restant, setRestant] = useState(0);
  /** Un enregistrement sur le téléphone est en vol : le bouton attend sa réponse. */
  const [occupe, setOccupe] = useState(false);

  const enCours = useRef<EnAttente | null>(null);
  /** La même garde, lue sans attendre un rendu : deux appuis dans la même image n'écrivent qu'une mise. */
  const ecriture = useRef(false);
  const sursis = useRef<number | null>(null);
  const decompte = useRef<number | null>(null);
  // Après le démontage, les références restent utiles — l'enregistrement en
  // cours les lit — mais l'état ne peut plus rien afficher.
  const monte = useRef(true);

  // Le contexte suit chaque rendu, pour la même raison que l'attente : la purge
  // part d'endroits qui ne referment rien.
  const contexte = useRef({ collecteurId, onEcriture });
  contexte.current = { collecteurId, onEcriture };

  function poser(en: EnAttente | null) {
    enCours.current = en;
    if (monte.current) setAttente(en);
  }

  function arreter() {
    if (sursis.current !== null) window.clearTimeout(sursis.current);
    if (decompte.current !== null) window.clearInterval(decompte.current);
    sursis.current = null;
    decompte.current = null;
    if (monte.current) setRestant(0);
  }

  /** Avance l'échéance d'une opération en file. Un échec la laisse partir à son heure : rien n'est perdu. */
  function faireAvancer(operationId: string) {
    const id = contexte.current.collecteurId;
    if (!id) return;
    avancerEnvoi(id, operationId).catch(() => {
      // L'opération reste en file avec son échéance d'origine.
    });
  }

  /** Ce qui était en sursis part maintenant : un autre appui, la fiche qui se ferme, l'arrière-plan. */
  function purger() {
    arreter();
    const en = enCours.current;
    // Rien sur le disque, ou déjà envoyable : il n'y a rien à avancer — et
    // surtout rien à réécrire, la mise est déjà dans la file.
    if (!en || en.envoyee || en.operationId === null) return;
    poser({ ...en, envoyee: true });
    faireAvancer(en.operationId);
  }

  async function encaisser(carte: CarteFiche) {
    if (ecriture.current) return;
    // Un second appui pendant un sursis fait partir le premier. Deux mises le
    // même jour sur la même carte sont acceptées par le serveur ; ce n'est pas
    // à cet écran de les interdire, seulement de ne pas les perdre.
    purger();

    const socle: EnAttente = {
      carteId: carte.id,
      mise: carte.mise,
      base: carte.misesEncaissees,
      operationId: null,
      envoyee: true,
    };

    const id = contexte.current.collecteurId;
    if (!id) {
      // Sans identifiant de collecteur, aucune base ne s'ouvre : le dire tout
      // de suite plutôt qu'au bout d'une attente.
      poser({ ...socle, echec: SESSION_PERDUE });
      return;
    }

    ecriture.current = true;
    if (monte.current) setOccupe(true);
    let resultat: Awaited<ReturnType<typeof enregistrerMise>>;
    try {
      resultat = await enregistrerMise(id, carte.id, carte.mise, new Date(), {
        sursisMs: SURSIS_MS,
      });
    } catch {
      poser({ ...socle, echec: ENREGISTREMENT_INCERTAIN });
      return;
    } finally {
      ecriture.current = false;
      if (monte.current) setOccupe(false);
    }

    if (!resultat.ok) {
      // Refusée par le téléphone — carte clôturée, disque plein : rien n'a été
      // écrit, la case ne se remplit pas.
      poser({ ...socle, echec: resultat.echec.message });
      return;
    }

    const operationId = resultat.operationId;
    const en: EnAttente = { ...socle, operationId, envoyee: false };
    if (!monte.current) {
      // La fiche s'est fermée pendant l'enregistrement : la mise est sur le
      // disque, et personne ne verra « Annuler ». Elle part tout de suite.
      faireAvancer(operationId);
      return;
    }

    poser(en);
    setRestant(SURSIS_S);
    decompte.current = window.setInterval(
      () => setRestant((seconde) => Math.max(0, seconde - 1)),
      1000,
    );
    sursis.current = window.setTimeout(() => {
      arreter();
      // L'attente a pu être annulée ou remplacée entre-temps.
      if (enCours.current !== en) return;
      poser({ ...en, envoyee: true });
    }, SURSIS_MS);

    // En dernier, et hors de tout `try` : un rappel qui lève n'a rien à voir
    // avec l'enregistrement, qui a réussi. Pris dans le `catch`, il afficherait
    // un échec sur une mise enregistrée — avec un « Réessayer » qui en
    // écrirait une seconde.
    contexte.current.onEcriture();
  }

  async function annuler() {
    const en = enCours.current;
    const id = contexte.current.collecteurId;
    if (!en || en.envoyee || en.operationId === null || !id) return;
    arreter();

    let issue: 'annulee' | 'partie' | 'absente';
    try {
      issue = await annulerMise(id, en.operationId);
    } catch {
      // Base illisible : l'opération ne peut pas être retirée, elle partira.
      issue = 'partie';
    }
    if (enCours.current !== en) return;

    if (issue === 'annulee') {
      poser(null);
      contexte.current.onEcriture();
      return;
    }
    // L'échéance était passée, ou l'opération a déjà quitté la file : elle est
    // partie. Le bandeau cesse de proposer ce qu'il ne peut plus tenir.
    poser({ ...en, envoyee: true });
  }

  function reessayer() {
    const en = enCours.current;
    if (!en) return;
    const carte = actives.find(({ carte: c }) => c.id === en.carteId)?.carte;
    poser(null);
    // Un appui neuf : un refus n'a rien écrit, et un échec incertain a demandé
    // de regarder la carte avant.
    if (carte) void encaisser(carte);
  }

  useEffect(() => {
    monte.current = true;
    return () => {
      // L'ordre compte : le témoin tombe d'abord, sinon `purger` tenterait de
      // poser un état sur un composant démonté.
      monte.current = false;
      purger();
    };
    // `purger` ne touche que des références : la refermer à chaque rendu ne
    // changerait rien, et ce dénouement appartient au seul démontage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function surMasquage() {
      // L'application passe en arrière-plan : plus personne ne regarde
      // « Annuler », et le système peut la tuer sans prévenir. Ce qui attendait
      // part maintenant.
      if (document.visibilityState === 'hidden') purger();
    }
    document.addEventListener('visibilitychange', surMasquage);
    return () => document.removeEventListener('visibilitychange', surMasquage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Le compte réel de la carte qui attend, s'il y en a une et qu'elle est
  // toujours là. `null` quand la carte a disparu de la fiche — clôturée.
  const reelles = attente
    ? (actives.find(({ carte: c }) => c.id === attente.carteId)?.carte.misesEncaissees ?? null)
    : null;

  useEffect(() => {
    if (!attente) return;
    if (reelles === null) {
      poser(null);
      return;
    }
    // Pendant le sursis, le bandeau reste même quand la relecture compte déjà
    // la mise : c'est lui qui porte « Annuler ». Il s'efface une fois
    // l'échéance passée et la mise comptée par la tournée.
    if (attente.envoyee && estRattrapee(reelles, attente)) poser(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attente, reelles]);

  const courant = actives.find(({ carte }) => carte.id === visibleId) ?? actives[0];
  const { carte } = courant;
  const misesCourantes = misesAffichees(carte.id, carte.misesEncaissees, attente);
  // Tant que la mise du jour peut encore être annulée sur cette carte, le cycle
  // n'est pas vraiment terminé : un appui peut encore la retirer. Proposer
  // « Aller au retrait » à cet instant rendrait de l'argent sur un dépôt qui
  // peut disparaître.
  const miseEnSursisSurCetteCarte =
    attente !== null && attente.carteId === carte.id && !attente.envoyee;
  const complete = misesCourantes >= MISES_PAR_CYCLE && !miseEnSursisSurCetteCarte;
  const solde = formatMontant(soldeRestituable(misesCourantes, carte.mise));
  /** Ce qui, sur la carte regardée, n'a pas encore quitté le téléphone (§8.3). */
  const attenteCarte = phraseAttenteCarte(enAttenteSurCarte(operations, carte.id));

  function rendreAction(item: CarteItem, choisie: boolean) {
    const trouvee = actives.find(({ carte: c }) => c.id === item.id);
    if (!trouvee) return null;
    const { carte: c } = trouvee;

    // Le bandeau passe avant le choix : une mise qui attend doit rester sous les
    // yeux même quand on est allé regarder la carte d'à côté. C'est la seule
    // chose qu'une carte non choisie ait le droit de montrer.
    if (attente && attente.carteId === c.id) {
      return (
        <BandeauSursis
          attente={attente}
          restant={restant}
          onAnnuler={() => void annuler()}
          onReessayer={reessayer}
        />
      );
    }

    // La commande d'argent, elle, ne sort que sur la carte choisie : deux
    // boutons visibles ensemble, et se tromper de cycle redevient possible.
    if (!choisie) return null;

    // Une carte au bout de son cycle ne s'encaisse plus : les deux portes de
    // fin de cycle vivent sous la rangée, où elles ont la place de s'expliquer.
    if (misesAffichees(c.id, c.misesEncaissees, attente) >= MISES_PAR_CYCLE) return null;

    return (
      <button
        type="button"
        // Le nom accessible porte le montant en toutes lettres, quelle que soit
        // la largeur : à 160 px le libellé se raccourcit, la mise annoncée non.
        aria-label={`Encaisser ${formatMontant(c.mise)} FCFA`}
        disabled={occupe}
        onClick={() => void encaisser(c)}
        className="anim-pression w-full min-h-11 px-4 rounded-md bg-primary text-primary-foreground border border-primary font-body font-semibold text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 @max-[240px]:min-h-11 @max-[240px]:px-2 @max-[240px]:text-xs @max-[240px]:gap-1"
      >
        <Icone nom="circle-dollar-sign" taille={16} />
        <span aria-hidden="true" className="@max-[240px]:hidden">
          Encaisser {formatMontant(c.mise)} FCFA
        </span>
        <span aria-hidden="true" className="hidden @max-[240px]:inline">
          Encaisser
        </span>
      </button>
    );
  }

  return (
    <section>
      <p className="font-headings font-bold text-base text-ink mb-2">
        {actives.length > 1 ? 'Cartes en cours' : 'Carte en cours'}
      </p>

      <CarrouselCartes
        cartes={actives.map(({ carte: c, cycle: rang }) => {
          const affichees = misesAffichees(c.id, c.misesEncaissees, attente);
          return {
            id: c.id,
            nomClient,
            misePar: formatMontant(c.mise),
            jourCourant: affichees,
            solde: formatMontant(soldeRestituable(affichees, c.mise)),
            cycle: String(rang),
          };
        })}
        visibleId={courant.carte.id}
        onVisible={onVisible}
        rendreAction={rendreAction}
      />

      {/* « Pas encore envoyée » sur la carte regardée (§8.3). C'est aussi ce qui
          dit pourquoi le retrait attend. */}
      {attenteCarte && (
        <p className="font-body text-xs font-medium text-info mt-2 mb-0">{attenteCarte}</p>
      )}

      {complete && (
        <div className="bg-positive-tint rounded-md p-3 mt-3 space-y-3">
          <div>
            <p className="font-body text-sm text-ink m-0">
              Cycle terminé — {MISES_PAR_CYCLE} mises sur {MISES_PAR_CYCLE}.
            </p>
            <p className="font-body text-xs text-muted-foreground mt-1">
              Tu peux lui rendre ses {solde} FCFA, ou lui activer une carte de plus juste en
              dessous. Tant qu'il n'y a pas de retrait, cette carte reste ouverte et son solde lui
              est dû.
            </p>
          </div>
          <Bouton
            variante="contour"
            icone="arrow-up-right"
            // La clôture recalcule au serveur ce qui est rendu : tant qu'une
            // opération de la carte est sur le téléphone, ce calcul en manquerait
            // une (§7). Et elle exige le réseau.
            disabled={attenteCarte !== null || !enLigne}
            onClick={() => onRetrait(nomClient)}
          >
            Aller au retrait
          </Bouton>
          {attenteCarte === null && !enLigne && (
            <p className="font-body text-xs text-muted-foreground m-0">
              Le retrait demande le réseau.
            </p>
          )}
        </div>
      )}

      {/* Hors du panneau de fin de cycle, et sans condition d'avancement.
          `cartes_multiples` nomme deux besoins, pas un : « un client épargne
          pour deux choses à deux rythmes » autant que « un client qui a rempli
          sa carte veut continuer ». Ouvrir une carte passe par la file : le
          geste reste permis hors ligne (§1.2).

          La mise préremplie est celle de la carte regardée au moment où ce bloc
          est monté, et elle ne suit pas le carrousel ensuite : `ActiverCarte`
          la lit dans un `useState` initial. C'est délibéré — la remonter à
          chaque défilement effacerait une saisie en cours. */}
      <div className="mt-3">
        <ActiverCarte
          collecteurId={collecteurId}
          clientId={clientId}
          misePreremplie={carte.mise}
          identifiant={`fiche-${carte.id}`}
          onOuverte={onEcriture}
        />
      </div>
    </section>
  );
}
```

**4b.** Écrire `$TMP/fiche-composant.json` :

```json
{
  "fichier": "apps/collecteur/src/ecrans/FicheClient.tsx",
  "insecables": { "avant": 0, "apres": 0 },
  "remplacements": [
    {
      "debut": "function CartesEnCours({",
      "fin": "function BandeauSursis({",
      "avantFin": 9,
      "contenu": "$TMP/cartes-en-cours.tsx"
    }
  ]
}
```

`avantFin: 9` : le bloc s'arrête avant la ligne vide qui précède les huit lignes de documentation de `BandeauSursis`. Puis : `node $TMP/remplacer-blocs.mjs $TMP/fiche-composant.json`
Attendu : `apps/collecteur/src/ecrans/FicheClient.tsx : 1 bloc(s), insécables 0 → 0, CRLF`. Contrôle : la ligne qui précède `/**` de la documentation de `BandeauSursis` est vide, et celle d'avant est l'accolade fermante de `CartesEnCours`.

**4c.** Puis, dans `apps/collecteur/src/ecrans/FicheClient.tsx`, par l'outil d'édition :

1. Remplacer `import { useCallback, useEffect, useRef, useState } from 'react';` par `import { useCallback, useEffect, useMemo, useRef, useState } from 'react';`.
2. Dans l'import de `@kolek/ui`, remplacer la ligne `  type CarteItem,` par :

```tsx
  useEnLigne,
  type CarteItem,
```

3. Remplacer :

```tsx
import {
  definirConsentementAvis,
  enregistrerMise,
```

par :

```tsx
import {
  annulerMise,
  avancerEnvoi,
  definirConsentementAvis,
  enregistrerMise,
```

4. Remplacer `} from '../encaissement-differe';` par :

```tsx
} from '../encaissement-differe';
import type { Operation } from '../hors-ligne/modele';
import { useHorsLigne } from '../hors-ligne/useHorsLigne';
import { enAttenteSurCarte, identifiantsEnAttente, phraseAttenteCarte } from '../hors-ligne/vues';
```

5. Remplacer `const SESSION_PERDUE = 'Session perdue. Reconnecte-toi avant de réessayer.';` par :

```tsx
const SESSION_PERDUE = 'Session perdue. Reconnecte-toi avant de réessayer.';

/**
 * Ce que voit le collecteur quand l'enregistrement sur le téléphone lève au lieu
 * de répondre. `enregistrerMise` rend `{ ok: false }` sur tout refus connu ; un
 * rejet ne dit pas si l'opération a été écrite avant. La phrase ne promet donc
 * rien, et demande de regarder la carte avant de recommencer.
 */
const ENREGISTREMENT_INCERTAIN =
  'Enregistrement incertain sur ce téléphone. Vérifie la carte avant de réessayer.';
```

6. Remplacer :

```tsx
  // La carte choisie vit ici, un cran au-dessus de `CartesEnCours`, et pas
  // dans son propre `useState`. `CartesEnCours` démonte et remonte à chaque
  // relecture réussie : l'effet ci-dessous fait passer `fiche` par `null`
  // avant de relire, ce qui emporte tout `{fiche && (…)}`. Un `useState` posé
  // plus bas s'y réinitialiserait sur `actives[0]` — la carte la plus avancée
  // — à chaque encaissement, exactement le défaut que ce bouton devait faire
  // disparaître, simplement relogé un niveau plus bas.
```

par :

```tsx
  // La carte choisie vit ici, un cran au-dessus de `CartesEnCours`, et pas
  // dans son propre `useState`. Jusqu'à J2b, `CartesEnCours` démontait et
  // remontait à chaque relecture : la fiche repassait par `null`. Elle ne le
  // fait plus qu'au changement de client, mais un `useState` posé plus bas
  // resterait à la merci du moindre démontage — et se réinitialiserait sur la
  // carte la plus avancée, pas sur celle qu'on vient de payer.
```

7. Remplacer :

```tsx
  // Le brouillon de correction vit ici, et non dans `CorrigerFiche` — même
  // raison que `visibleId` ci-dessus. La mise différée de `CartesEnCours`
  // part six secondes après l'appui et appelle `onEcriture` ; la coquille
  // fait monter `revision`, la fiche repasse par `null`, et le formulaire se
  // démonte. Un brouillon logé dedans s'effaçait sous les doigts du
  // collecteur — au moment exact où l'on corrige : il vient d'encaisser, et
  // le client lui dit que son numéro a changé. Constaté en relisant, le
  // 2026-09-11, avant toute mise en ligne.
  const [brouillon, setBrouillon] = useState<CorrectionClient | null>(null);
```

par :

```tsx
  // Le brouillon de correction vit ici, et non dans `CorrigerFiche` — même
  // raison que `visibleId` ci-dessus. Jusqu'à J2b, chaque écriture faisait
  // repasser la fiche par `null` et démontait le formulaire : un brouillon
  // logé dedans s'effaçait sous les doigts du collecteur, au moment exact où
  // l'on corrige. Constaté en relisant, le 2026-09-11.
  const [brouillon, setBrouillon] = useState<CorrectionClient | null>(null);
  const enLigne = useEnLigne();
  const { operations } = useHorsLigne();
  /** Ce qui n'a pas encore quitté le téléphone : clients, cartes, mises (§8.3). */
  const pasEnvoyes = useMemo(() => identifiantsEnAttente(operations), [operations]);
```

8. Remplacer :

```tsx
  useEffect(() => {
    // La fiche précédente est effacée avant la lecture : sans ça, ouvrir un
    // second client montre un instant les chiffres du premier — et un solde
    // qui appartient à quelqu'un d'autre est la pire chose à afficher ici.
    setFiche(null);
    setErreur(null);
    void relire();
  }, [relire, revision]);
```

par :

```tsx
  useEffect(() => {
    // La fiche précédente est effacée au changement de client : sans ça, ouvrir
    // un second client montre un instant les chiffres du premier — et un solde
    // qui appartient à quelqu'un d'autre est la pire chose à afficher ici.
    setFiche(null);
    setErreur(null);
  }, [clientId]);

  useEffect(() => {
    // Une relecture du même client, elle, ne vide rien (J2b) : la tournée est
    // sur le téléphone, la lecture est immédiate, et vider démontait le bandeau
    // du sursis — « Annuler » disparaissait sous le doigt.
    void relire();
  }, [relire, revision]);
```

9. Remplacer :

```tsx
    .sort((a, b) => b.carte.misesEncaissees - a.carte.misesEncaissees);
```

par :

```tsx
    .sort((a, b) => b.carte.misesEncaissees - a.carte.misesEncaissees);

  // Corriger la fiche et changer les avis restent en ligne (spec §1.2) : ce
  // sont des modifications, et un client pas encore envoyé n'existe pas au
  // serveur — la correction partirait sur une ligne absente.
  const correctionBloquee = !enLigne
    ? 'Corriger la fiche ou les avis demande le réseau.'
    : fiche && pasEnvoyes.has(fiche.id)
      ? 'Client pas encore envoyé : sa fiche se corrige une fois arrivé au serveur.'
      : null;
```

10. Remplacer :

```tsx
              <Coordonnees fiche={fiche} onChange={onEcriture} onRelire={relire} />
```

par :

```tsx
              <Coordonnees
                fiche={fiche}
                bloque={correctionBloquee !== null}
                onChange={onEcriture}
                onRelire={relire}
              />
```

11. Remplacer :

```tsx
              <Bouton
                variante="fantome"
                pleineLargeur
                onClick={() => setBrouillon(origineDe(fiche))}
              >
                Corriger la fiche
              </Bouton>
```

par :

```tsx
              <Bouton
                variante="fantome"
                pleineLargeur
                disabled={correctionBloquee !== null}
                onClick={() => setBrouillon(origineDe(fiche))}
              >
                Corriger la fiche
              </Bouton>
              {correctionBloquee && (
                <p className="font-body text-xs text-muted-foreground text-center m-0">
                  {correctionBloquee}
                </p>
              )}
```

12. Remplacer :

```tsx
              collecteurId={collecteurId}
              onRetrait={onRetrait}
```

par :

```tsx
              collecteurId={collecteurId}
              operations={operations}
              enLigne={enLigne}
              onRetrait={onRetrait}
```

13. Remplacer :

```tsx
                    meta={new Date(m.encaisseLe).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
```

par :

```tsx
                    meta={`${new Date(m.encaisseLe).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}${pasEnvoyes.has(m.id) ? ' · pas encore envoyée' : ''}`}
```

14. Remplacer :

```tsx
function Coordonnees({
  fiche,
  onChange,
  onRelire,
}: {
  fiche: Fiche;
  onChange: () => void;
```

par :

```tsx
function Coordonnees({
  fiche,
  bloque,
  onChange,
  onRelire,
}: {
  fiche: Fiche;
  /** Réseau absent, ou client pas encore envoyé : le consentement ne peut pas partir. */
  bloque: boolean;
  onChange: () => void;
```

15. Remplacer `          <Bouton onClick={() => void poser(true)} disabled={envoi}>` par `          <Bouton onClick={() => void poser(true)} disabled={envoi || bloque}>`.
16. Remplacer :

```tsx
        disabled={envoi}
        aria-pressed={fiche.avisActifs}
```

par :

```tsx
        disabled={envoi || bloque}
        aria-pressed={fiche.avisActifs}
```

17. Dans la documentation de `CartesEnCours`, remplacer :

```tsx
 * `mises` est append-only — voir `encaissement-differe.ts`, qui porte la règle.
 * L'appui remplit la case à l'écran et n'écrit rien ; l'insertion part six
 * secondes plus tard, et « Annuler » l'empêche jusque-là.
 *
 * Fermer la fiche ou passer l'application en arrière-plan ne perd pas la mise :
 * elle part tout de suite. Le décompte n'a plus de témoin, et le système peut
 * tuer une application masquée sans prévenir.
```

par :

```tsx
 * `mises` est append-only — voir `encaissement-differe.ts`, qui porte la règle.
 * Depuis J2b, l'appui écrit l'opération dans la file du téléphone, avec une
 * échéance à six secondes ; le synchroniseur ne l'envoie qu'après, et
 * « Annuler » la retire de la file d'ici là. La case ne se remplit qu'une fois
 * l'opération sur le disque (spec §4.1).
 *
 * Fermer la fiche ou passer l'application en arrière-plan avance l'échéance :
 * plus personne ne regarde « Annuler », la mise part tout de suite. Et un
 * rechargement pendant le sursis ne la perd plus — elle est sur le disque
 * (écart 4).
```

Puis `node crlf.mjs apps/collecteur/src/ecrans/FicheClient.tsx` — attendu `CRLF nbsp=0`.

Run : `npm run test -w @kolek/collecteur -- src/ecrans/FicheClient.test.tsx src/encaissement-differe.test.ts`
Attendu : PASS — 48 épreuves pour la fiche, 9 pour le sursis.

- [ ] **Étape 5 : toute l'application, typage, lint, commit**

```bash
npm run test -w @kolek/collecteur
npx tsc -b apps/collecteur
npm run verifier:lint
git add apps/collecteur/src/encaissement-differe.ts apps/collecteur/src/encaissement-differe.test.ts apps/collecteur/src/hors-ligne/vues.ts apps/collecteur/src/hors-ligne/vues.test.ts apps/collecteur/src/ecrans/FicheClient.tsx apps/collecteur/src/ecrans/FicheClient.test.tsx
git commit -m "feat(hors-ligne): le sursis de la fiche entre dans la file des l'appui" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Attendu : tout au vert. Contrôle : `grep -c "window.setTimeout" apps/collecteur/src/ecrans/FicheClient.tsx` rend `1` (le seul minuteur restant pose `envoyee`, il n'écrit plus rien).

---

## Tâche 16 : le retrait attend la file et le réseau

**Le code livré diffère de cette tâche.** Écart 44 (retrait gardé jusqu'au geste ; file non lue bloque ; lecture en échec lève ; filtre client, commits `fdc71bf` et `1851ffb`). Le dépôt fait foi ; les blocs ci-dessous restent le plan d'origine.

**Fichiers :**
- Modifier : `apps/collecteur/src/ecrans/Retrait.tsx`, `apps/collecteur/src/ecrans/Retrait.test.tsx` (CRLF, 1 insécable, inchangée)
- Modifier : `apps/collecteur/src/ecrans/ActiverCarte.tsx`

**Interfaces :**
- Consomme : `useHorsLigne` (tâche 14), `enAttenteSurCarte`, `phraseAttenteCarte` (tâche 15), `useEnLigne`.
- Spec §7 (« Clôture et retrait : bouton inactif tant qu'une opération de cette carte est en file, puis réseau requis »), §8.9.

- [ ] **Étape 1 : écrire l'épreuve**

Mesurer : `node crlf.mjs --mesurer apps/collecteur/src/ecrans/Retrait.test.tsx` — attendu `CRLF nbsp=1`.

Dans `apps/collecteur/src/ecrans/Retrait.test.tsx` :

1. Remplacer la ligne `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';` par :

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { operationMise } from '../hors-ligne/fabriques';
```

2. Après le bloc `vi.mock('../supabase', () => ({ … }));`, ajouter :

```tsx
/** La file du téléphone, telle que l'écran la lit. Vide par défaut. */
let operationsEnFile: unknown[] = [];
vi.mock('../hors-ligne/useHorsLigne', () => ({
  useHorsLigne: () => ({
    operations: operationsEnFile,
    refus: [],
    tournee: null,
    file: null,
    stockage: 'inconnu',
  }),
}));
```

3. Dans `afterEach`, après `  rafraichir.mockReset();`, ajouter :

```tsx
  operationsEnFile = [];
  delete (window.navigator as unknown as { onLine?: boolean }).onLine;
```

4. Ajouter à la fin du fichier :

```tsx
describe('le retrait attend la file et le réseau (§7)', () => {
  it('refuse le retrait d’une carte dont une mise attend l’envoi, et le dit', () => {
    // Le montant rendu est recalculé au serveur depuis les mises qu'il a
    // reçues. Tant qu'une mise de la carte est sur le téléphone, le client
    // repartirait avec moins que son dû.
    operationsEnFile = [operationMise(1, { carteId: 'k1' })];
    rendre();

    const boutons = screen.getAllByRole('button', { name: 'Faire le retrait' }) as HTMLButtonElement[];

    expect(boutons.map((b) => b.disabled)).toEqual([true, false, false]);
    expect(screen.getByText('1 mise de cette carte pas encore envoyée.')).toBeTruthy();
  });

  it('demande le réseau pour rendre l’argent', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    rendre();

    const boutons = screen.getAllByRole('button', { name: 'Faire le retrait' }) as HTMLButtonElement[];

    expect(boutons.every((b) => b.disabled)).toBe(true);
    expect(screen.getAllByText('Le retrait demande le réseau.')).toHaveLength(3);
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Retrait.test.tsx`
Attendu : FAIL — les boutons restent actifs.

- [ ] **Étape 2 : l'écran de retrait**

Dans `apps/collecteur/src/ecrans/Retrait.tsx` (CRLF) :

1. Remplacer `import { Bouton, Carte, Icone, Squelette } from '@kolek/ui';` par `import { Bouton, Carte, Icone, Squelette, useEnLigne } from '@kolek/ui';`.
2. Remplacer `import { cloturerCarte } from '../ecritures-ecrans';` par :

```tsx
import { cloturerCarte } from '../ecritures-ecrans';
import { useHorsLigne } from '../hors-ligne/useHorsLigne';
import { enAttenteSurCarte, phraseAttenteCarte } from '../hors-ligne/vues';
```

3. Remplacer `  const estCollaborateur = useEstCollaborateur();` par :

```tsx
  const estCollaborateur = useEstCollaborateur();
  const enLigne = useEnLigne();
  const { operations } = useHorsLigne();
```

4. Remplacer `    messageErreur: 'Cartes indisponibles. Vérifie le réseau.',` par `    messageErreur: 'Cet écran demande le réseau.',`.
5. Remplacer :

```tsx
              {visibles?.map((carte, rang) => {
              const enConfirmation = aConfirmer?.carteId === carte.carteId;
```

par :

```tsx
              {visibles?.map((carte, rang) => {
              const enConfirmation = aConfirmer?.carteId === carte.carteId;
              // Pourquoi le retrait de cette carte attend : une opération encore
              // sur le téléphone, ou pas de réseau pour la clôture.
              const retraitBloque =
                phraseAttenteCarte(enAttenteSurCarte(operations, carte.carteId)) ??
                (enLigne ? null : 'Le retrait demande le réseau.');
```

6. Remplacer :

```tsx
                    <div className="flex flex-wrap gap-2">
                      <Bouton variante="contour" onClick={() => setAConfirmer(carte)}>
                        Faire le retrait
                      </Bouton>
```

par :

```tsx
                    <div className="flex flex-wrap gap-2">
                      <Bouton
                        variante="contour"
                        disabled={retraitBloque !== null}
                        onClick={() => setAConfirmer(carte)}
                      >
                        Faire le retrait
                      </Bouton>
                      {retraitBloque && (
                        <p className="basis-full font-body text-xs text-muted-foreground m-0">
                          {retraitBloque}
                        </p>
                      )}
```

Puis `node crlf.mjs apps/collecteur/src/ecrans/Retrait.tsx apps/collecteur/src/ecrans/Retrait.test.tsx` — attendu `nbsp=1` pour l'épreuve, inchangée.

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Retrait.test.tsx`
Attendu : PASS, 11 épreuves.

- [ ] **Étape 3 : `ActiverCarte` ne parle plus du réseau**

Dans `apps/collecteur/src/ecrans/ActiverCarte.tsx` (CRLF), remplacer :

```tsx
    } catch {
      // Un rejet plutôt qu'un `{ ok: false }` : le réseau est tombé pendant
      // l'écriture. Sans ce filet, `envoi` resterait vrai et verrouillerait les
      // deux boutons du bloc — il faudrait recharger l'application pour en
      // sortir, debout dans un marché.
      setEnvoi(false);
      setErreur("Le réseau a coupé pendant l'ouverture. Vérifie la carte du client avant de réessayer.");
      return;
    }
```

par :

```tsx
    } catch {
      // Un rejet plutôt qu'un `{ ok: false }`. Depuis J2b l'ouverture passe par
      // la file du téléphone, qui rend `{ ok: false }` sur tout refus connu : un
      // rejet ne dit pas si la carte a été écrite avant. Sans ce filet, `envoi`
      // resterait vrai et verrouillerait les deux boutons du bloc.
      setEnvoi(false);
      setErreur(
        'L’ouverture n’a pas pu être confirmée sur ce téléphone. Vérifie les cartes du client avant de réessayer.',
      );
      return;
    }
```

Puis `node crlf.mjs apps/collecteur/src/ecrans/ActiverCarte.tsx`.

Run : `npm run test -w @kolek/collecteur -- src/ecrans/ActiverCarte.test.tsx`
Attendu : PASS (l'épreuve du rejet vérifie l'alerte et le déverrouillage, pas la phrase).

- [ ] **Étape 4 : toute l'application, typage, lint, commit**

```bash
npm run test -w @kolek/collecteur
npx tsc -b apps/collecteur
npm run verifier:lint
git add apps/collecteur/src/ecrans/Retrait.tsx apps/collecteur/src/ecrans/Retrait.test.tsx apps/collecteur/src/ecrans/ActiverCarte.tsx
git commit -m "feat(hors-ligne): le retrait attend que la carte n'ait plus rien en file" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 17 : les refus, l'attente et le stockage se lisent sur le téléphone

**Le code livré diffère de cette tâche.** Écarts 46 et 47 (phrase au-delà de 90 jours ; fiche et commission alignées sur « Plus », commit `b513dec`). Le dépôt fait foi ; les blocs ci-dessous restent le plan d'origine.

**Fichiers :**
- Modifier : `apps/collecteur/src/hors-ligne/vues.ts`, `apps/collecteur/src/hors-ligne/vues.test.ts`
- Modifier : `apps/collecteur/src/ecrans/Alertes.tsx` (CRLF, réécrit) ; créer `apps/collecteur/src/ecrans/Alertes.test.tsx`
- Modifier : `apps/collecteur/src/ecrans/Accueil.tsx` (CRLF), `apps/collecteur/src/ecrans/Accueil.test.tsx` (**LF**)
- Modifier : `apps/collecteur/src/ecrans/Plus.tsx`, `apps/collecteur/src/ecrans/Plus.test.tsx` (CRLF)
- Modifier : `packages/ui/src/EcranConnexion.tsx`, `packages/ui/src/EcranConnexion.test.tsx` (CRLF)
- Modifier : `apps/collecteur/src/Connexion.tsx` (CRLF), `apps/collecteur/src/Connexion.test.tsx` (**LF**)
- Modifier : `apps/collecteur/src/ecrans/Bilan.tsx`, `Recus.tsx`, `Avis.tsx` (CRLF), `HistoriqueClient.tsx` (**LF**)

**Interfaces :**
- Consomme : `RefusLocal`, `ChargeUtileRefus`, `chargeUtileDe`, `JOURS_ALERTE_ATTENTE`, `TypeOperation` (tâche 1) ; `phraseRefus` (tâche 5) ; `compterOperationsSurCeTelephone` (tâche 4) ; `EtatFile`, `etatFileDepuis`, `useHorsLigne` → `{ operations, refus, tournee, file, stockage }` (tâche 14).
- Produit (`vues.ts`) : `interface RefusAffiche { id: string; titre: string; detail: string; quand: string | null }` ; `refusAffichables(refus: readonly RefusLocal[], operations: readonly Operation[], tournee: Tournee | null): RefusAffiche[]` ; `joursDAttente(iso: string | null, maintenant: number): number` ; `phraseAttenteLongue(file: EtatFile | null, maintenant: number): string | null`.
- Produit (`@kolek/ui`) : `EcranConnexion` accepte `avis?: string | null`.
- Spec §8.4, §8.6, §8.7, §8.8, §8.9.

Aucune fin de ligne ne se devine : mesurer avant d'éditer.

```bash
node crlf.mjs --mesurer apps/collecteur/src/ecrans/Alertes.tsx apps/collecteur/src/ecrans/Accueil.tsx apps/collecteur/src/ecrans/Accueil.test.tsx apps/collecteur/src/ecrans/Plus.tsx apps/collecteur/src/ecrans/Plus.test.tsx packages/ui/src/EcranConnexion.tsx packages/ui/src/EcranConnexion.test.tsx apps/collecteur/src/Connexion.tsx apps/collecteur/src/Connexion.test.tsx apps/collecteur/src/ecrans/Bilan.tsx apps/collecteur/src/ecrans/Recus.tsx apps/collecteur/src/ecrans/Avis.tsx apps/collecteur/src/ecrans/HistoriqueClient.tsx
```

Attendu (mesuré le 2026-09-13) : `Accueil.test.tsx`, `Connexion.test.tsx` et `HistoriqueClient.tsx` en `LF`, tous les autres en `CRLF`, `nbsp=0` partout.

- [ ] **Étape 1 : écrire l'épreuve des refus lisibles**

Dans `apps/collecteur/src/hors-ligne/vues.test.ts` :

1. Remplacer la ligne `import { soldeRestituable } from '@kolek/core';` par :

```ts
import { formatMontant, soldeRestituable } from '@kolek/core';
```

2. Remplacer la ligne `import { chargeUtileDe, type MiseLocale, type ProfilLocal } from './modele';` par :

```ts
import {
  chargeUtileDe,
  type ChargeUtileRefus,
  type MiseLocale,
  type Operation,
  type ProfilLocal,
  type RefusLocal,
  type TypeOperation,
} from './modele';
```

3. Dans l'import de `./vues`, ajouter `joursDAttente,`, `phraseAttenteLongue,` et `refusAffichables,` (ordre alphabétique).
4. Ajouter à la fin du fichier :

```ts
describe('les refus, lisibles sans réseau (§8.4)', () => {
  const refusDe = (op: Operation, motif: string): RefusLocal => ({
    id: op.id,
    motif,
    chargeUtile: chargeUtileDe(op),
    creeLe: INSTANT,
  });

  it('titre chaque nature de geste, du plus récent au plus ancien', () => {
    const t = tournee({ clients: [client('c1', 'Awa')], cartes: [carte('k1', 'c1')] });
    const refus = [
      refusDe(
        operationMise(1, { carteId: 'k1', montant: 1000 }, { faiteLe: '2026-09-10T08:00:00.000Z' }),
        'CARTE_CLOTUREE',
      ),
      refusDe(
        operationCarte(2, { carteId: 'k2', clientId: 'c1', mise: 2000 }, { faiteLe: '2026-09-12T08:00:00.000Z' }),
        'ABONNEMENT_INACTIF',
      ),
      refusDe(
        operationCaisse(3, { cashDeclare: 5000, date: '2026-09-12' }, { faiteLe: '2026-09-11T08:00:00.000Z' }),
        'CONFLIT_UNIQUE',
      ),
    ];

    // Les montants passent par `formatMontant` : son séparateur est une
    // insécable, qu'on ne tape jamais à la main dans une épreuve.
    expect(refusAffichables(refus, [], t)).toEqual([
      {
        id: 'op-2',
        titre: `Awa — carte de ${formatMontant(2000)} FCFA`,
        detail: 'L’abonnement n’était plus actif.',
        quand: '2026-09-12T08:00:00.000Z',
      },
      {
        id: 'op-3',
        titre: `Caisse du 2026-09-12 — ${formatMontant(5000)} FCFA déclarés`,
        detail: 'Le serveur avait déjà une ligne à cette place.',
        quand: '2026-09-11T08:00:00.000Z',
      },
      {
        id: 'op-1',
        titre: `Awa — mise de ${formatMontant(1000)} FCFA`,
        detail: 'La carte avait été clôturée.',
        quand: '2026-09-10T08:00:00.000Z',
      },
    ]);
  });

  it('montre aussi les refus pas encore consignés, une seule fois chacun', () => {
    const t = tournee({ clients: [client('c1', 'Awa')], cartes: [carte('k1', 'c1')] });
    const aConsigner = operationMise(
      4,
      { carteId: 'k1' },
      { etat: 'refusee_a_consigner', motif: 'CYCLE_COMPLET' },
    );
    const enAttente = operationMise(5, { carteId: 'k1' });
    // La consignation est arrivée au serveur, la file n'a pas encore été
    // vidée : la même opération est des deux côtés, pour un seul geste.
    const dejaConsignee = operationMise(
      6,
      { carteId: 'k1' },
      { etat: 'refusee_a_consigner', motif: 'CARTE_CLOTUREE' },
    );

    const vus = refusAffichables(
      [refusDe(dejaConsignee, 'CARTE_CLOTUREE')],
      [aConsigner, enAttente, dejaConsignee],
      t,
    );

    expect(vus.map((r) => [r.id, r.detail])).toEqual([
      ['op-6', 'La carte avait été clôturée.'],
      ['op-4', 'Le cycle de 31 mises était déjà complet.'],
    ]);
  });

  it('nomme le client d’une inscription refusée, et la mise qui en dépendait', () => {
    // Ni ce client ni sa carte ne sont jamais entrés dans la tournée : le nom
    // n'existe que dans la charge de l'inscription.
    const inscription = operationClientCarte(1, { clientId: 'c9', carteId: 'k9', nom: 'Bintou', mise: 500 });
    const mise = operationMise(
      2,
      { carteId: 'k9', montant: 500 },
      { etat: 'refusee_a_consigner', motif: 'PARENT_REFUSE', dependDe: ['op-1'] },
    );

    expect(refusAffichables([refusDe(inscription, 'ABONNEMENT_INACTIF')], [mise], tournee())).toEqual([
      {
        id: 'op-1',
        titre: `Bintou — inscription et carte de ${formatMontant(500)} FCFA`,
        detail: 'L’abonnement n’était plus actif.',
        quand: INSTANT,
      },
      {
        id: 'op-2',
        titre: `Bintou — mise de ${formatMontant(500)} FCFA`,
        detail: 'L’opération dont elle dépendait a été refusée.',
        quand: INSTANT,
      },
    ]);
  });

  it('se replie sur ce qu’elle sait lire d’une charge d’une autre version', () => {
    const inconnue: RefusLocal = {
      id: 'x',
      motif: 'MOTIF_FUTUR',
      chargeUtile: {} as unknown as ChargeUtileRefus,
      creeLe: INSTANT,
    };
    const sansNom = refusDe(operationMise(7, { carteId: 'absente' }), 'CARTE_INTROUVABLE');

    expect(refusAffichables([inconnue, sansNom], [], null)).toEqual([
      {
        id: 'op-7',
        titre: `Mise de ${formatMontant(1000)} FCFA`,
        detail: 'Le serveur ne connaissait pas cette carte.',
        quand: INSTANT,
      },
      {
        id: 'x',
        titre: 'Opération refusée',
        detail: 'Le serveur a répondu cinq fois sans motif reconnu.',
        quand: null,
      },
    ]);
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts`
Attendu : FAIL, « refusAffichables is not a function ».

- [ ] **Étape 2 : écrire `refusAffichables`**

Dans `apps/collecteur/src/hors-ligne/vues.ts` :

1. Remplacer la ligne `import { soldeRestituable } from '@kolek/core';` par `import { formatMontant, soldeRestituable } from '@kolek/core';`.
2. Remplacer la ligne `import type { Operation, ProfilLocal, RefusLocal, Tournee, TypeOperation } from './modele';` par :

```ts
import { phraseRefus } from '../phrases';
import {
  chargeUtileDe,
  type Operation,
  type ProfilLocal,
  type RefusLocal,
  type Tournee,
  type TypeOperation,
} from './modele';
```

3. Ajouter à la fin du fichier :

```ts
/** Un refus, tel que l'écran des alertes le montre (spec J2b §8.4). */
export interface RefusAffiche {
  /** L'identifiant de l'opération, qui est aussi celui de la ligne de `synchro_rejets`. */
  id: string;
  /** Qui et combien : « Awa — mise de 1 000 FCFA ». */
  titre: string;
  /** Le motif, en clair et au passé. */
  detail: string;
  /** L'heure réelle du geste ; `null` quand la charge ne la porte pas. */
  quand: string | null;
}

type Brut = Record<string, unknown>;

function objet(valeur: unknown): Brut | null {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Brut)
    : null;
}

function champ(o: Brut | null, cle: string): Brut | null {
  return objet(o?.[cle]);
}

function texte(o: Brut | null, cle: string): string | null {
  const valeur = o?.[cle];
  return typeof valeur === 'string' && valeur !== '' ? valeur : null;
}

function nombre(o: Brut | null, cle: string): number | null {
  const valeur = o?.[cle];
  return typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;
}

/**
 * Les refus à montrer, du geste le plus récent au plus ancien.
 *
 * Deux sources, toutes deux lisibles sans réseau : la copie des refus consignés,
 * et les opérations refusées dont la consignation n'est pas encore faite. Une
 * opération présente des deux côtés — consignée, pas encore retirée de la file —
 * n'est montrée qu'une fois : deux lignes feraient croire à deux gestes.
 *
 * Une charge consignée est lue sans lui faire confiance. Elle a pu être écrite
 * par une autre version de l'application, il y a des semaines : un champ absent
 * ou d'un autre type ne fait pas tomber l'écran, le titre se replie sur ce
 * qu'on sait lire, jusqu'à « Opération refusée ».
 *
 * Le nom du client vient de la tournée, puis des charges d'inscription et
 * d'ouverture de carte de toute la file : un client refusé n'est jamais entré
 * dans la tournée, ni la carte de la mise qui dépendait de lui.
 */
export function refusAffichables(
  refus: readonly RefusLocal[],
  operations: readonly Operation[],
  tournee: Tournee | null,
): RefusAffiche[] {
  const vus = new Set<string>();
  const sources: { id: string; motif: string; charge: Brut | null }[] = [];
  for (const r of refus) {
    if (vus.has(r.id)) continue;
    vus.add(r.id);
    sources.push({ id: r.id, motif: r.motif, charge: objet(r.chargeUtile) });
  }
  for (const o of operations) {
    if (o.etat !== 'refusee_a_consigner' || vus.has(o.id)) continue;
    vus.add(o.id);
    sources.push({ id: o.id, motif: o.motif ?? 'INCONNU', charge: objet(chargeUtileDe(o)) });
  }

  const noms = new Map<string, string>();
  const clientDeCarte = new Map<string, string>();
  for (const c of tournee?.clients ?? []) noms.set(c.id, c.nom);
  for (const k of tournee?.cartes ?? []) clientDeCarte.set(k.id, k.clientId);
  const charges = [
    ...sources.map((s) => s.charge),
    ...operations.map((o) => objet(chargeUtileDe(o))),
  ];
  for (const cu of charges) {
    const charge = champ(cu, 'charge');
    const type = texte(cu, 'type');
    if (type === 'client_carte') {
      const clientId = texte(champ(charge, 'client'), 'id');
      const nom = texte(champ(charge, 'client'), 'nom');
      const carteId = texte(champ(charge, 'carte'), 'id');
      if (clientId !== null && nom !== null && !noms.has(clientId)) noms.set(clientId, nom);
      if (clientId !== null && carteId !== null && !clientDeCarte.has(carteId)) {
        clientDeCarte.set(carteId, clientId);
      }
    } else if (type === 'carte') {
      const carteId = texte(charge, 'id');
      const clientId = texte(charge, 'clientId');
      if (clientId !== null && carteId !== null && !clientDeCarte.has(carteId)) {
        clientDeCarte.set(carteId, clientId);
      }
    }
  }

  const nomDuClient = (clientId: string | null) =>
    clientId === null ? null : (noms.get(clientId) ?? null);
  const nomDeLaCarte = (carteId: string | null) =>
    carteId === null ? null : nomDuClient(clientDeCarte.get(carteId) ?? null);
  /** « Awa — mise de 1 000 FCFA », ou « Mise de 1 000 FCFA » quand le nom manque. */
  const pour = (nom: string | null, quoi: string) =>
    nom === null ? quoi.charAt(0).toUpperCase() + quoi.slice(1) : `${nom} — ${quoi}`;

  const titre = (cu: Brut | null): string => {
    const charge = champ(cu, 'charge');
    const type = texte(cu, 'type');
    if (type === 'mise') {
      const montant = nombre(charge, 'montant');
      if (montant !== null) {
        return pour(nomDeLaCarte(texte(charge, 'carteId')), `mise de ${formatMontant(montant)} FCFA`);
      }
    } else if (type === 'client_carte') {
      const mise = nombre(champ(charge, 'carte'), 'mise');
      if (mise !== null) {
        return pour(
          texte(champ(charge, 'client'), 'nom'),
          `inscription et carte de ${formatMontant(mise)} FCFA`,
        );
      }
    } else if (type === 'carte') {
      const mise = nombre(charge, 'mise');
      if (mise !== null) {
        return pour(nomDuClient(texte(charge, 'clientId')), `carte de ${formatMontant(mise)} FCFA`);
      }
    } else if (type === 'caisse') {
      const date = texte(charge, 'date');
      const declare = nombre(charge, 'cashDeclare');
      if (date !== null && declare !== null) {
        return `Caisse du ${date} — ${formatMontant(declare)} FCFA déclarés`;
      }
    }
    return 'Opération refusée';
  };

  const affiches = sources.map((s) => {
    const faiteLe = texte(s.charge, 'faiteLe');
    return {
      id: s.id,
      titre: titre(s.charge),
      detail: phraseRefus(s.motif),
      quand: faiteLe !== null && !Number.isNaN(Date.parse(faiteLe)) ? faiteLe : null,
    };
  });
  const instant = (quand: string | null) =>
    quand === null ? Number.NEGATIVE_INFINITY : Date.parse(quand);
  // `sort` est stable : à heure égale, l'ordre des sources est gardé.
  return affiches.sort((a, b) => {
    const ecart = instant(b.quand) - instant(a.quand);
    return Number.isNaN(ecart) ? 0 : ecart;
  });
}
```

`Number.isNaN(ecart)` couvre deux heures inconnues : `-Infinity - -Infinity` vaut `NaN`, et deux refus sans heure gardent leur ordre.

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts`
Attendu : PASS, 27 épreuves.

- [ ] **Étape 3 : l'attente longue, calculée**

Ajouter à la fin de `apps/collecteur/src/hors-ligne/vues.test.ts` :

```ts
describe('l’attente du plus ancien geste (§4.7, §8.8)', () => {
  it('compte les jours entiers écoulés, jamais en négatif', () => {
    expect(joursDAttente(null, MAINTENANT)).toBe(0);
    expect(joursDAttente('2026-06-29T12:00:01.000Z', MAINTENANT)).toBe(75);
    expect(joursDAttente('2026-06-28T12:00:00.000Z', MAINTENANT)).toBe(77);
    // Une horloge de téléphone en avance n'invente pas une attente.
    expect(joursDAttente('2026-09-14T12:00:00.000Z', MAINTENANT)).toBe(0);
  });

  it('prévient à partir de 75 jours, en nommant ce qui attend', () => {
    const avec = (plusAncienne: string | null, plusAncienneType: TypeOperation | null) => ({
      ...etatFileDepuis([], []),
      plusAncienne,
      plusAncienneType,
    });

    expect(phraseAttenteLongue(avec('2026-07-01T12:00:00.000Z', 'mise'), MAINTENANT)).toBeNull();
    expect(phraseAttenteLongue(avec('2026-06-30T12:00:00.000Z', 'mise'), MAINTENANT)).toBe(
      'Une mise attend depuis 75 jours. Retrouve du réseau avant 90 jours.',
    );
    expect(phraseAttenteLongue(avec('2026-06-25T12:00:00.000Z', 'caisse'), MAINTENANT)).toBe(
      'Une déclaration de caisse attend depuis 80 jours. Retrouve du réseau avant 90 jours.',
    );
    expect(phraseAttenteLongue(avec(null, null), MAINTENANT)).toBeNull();
    expect(phraseAttenteLongue(null, MAINTENANT)).toBeNull();
  });
});
```

`MAINTENANT` est déjà défini en tête du fichier : `2026-09-13T12:00:00.000Z`. Du 30 juin à midi au 13 septembre à midi, il y a 75 jours ; du 1er juillet, 74.

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts`
Attendu : FAIL, « joursDAttente is not a function ».

Dans `apps/collecteur/src/hors-ligne/vues.ts` :

1. Dans l'import de `./modele` posé à l'étape 2, ajouter `JOURS_ALERTE_ATTENTE,` en tête de la liste, avant `chargeUtileDe,`.
2. Ajouter à la fin du fichier :

```ts
/** Jours entiers écoulés depuis `iso`. Jamais négatif : une horloge en avance n'invente pas d'attente. */
export function joursDAttente(iso: string | null, maintenant: number): number {
  if (iso === null) return 0;
  const ecoule = maintenant - Date.parse(iso);
  return Number.isNaN(ecoule) ? 0 : Math.max(0, Math.floor(ecoule / 86_400_000));
}

const NATURE_EN_ATTENTE: Readonly<Record<TypeOperation, string>> = {
  mise: 'Une mise',
  client_carte: 'Une inscription',
  carte: 'Une carte',
  caisse: 'Une déclaration de caisse',
};

/**
 * L'avertissement de l'accueil quand le plus ancien geste en attente approche
 * de la fenêtre du serveur, ou `null` (spec J2b §4.7, §8.8).
 *
 * Il nomme ce qui attend. « Une mise » quand c'est une inscription enverrait
 * le collecteur chercher une mise qu'il ne trouvera pas.
 */
export function phraseAttenteLongue(file: EtatFile | null, maintenant: number): string | null {
  if (file === null || file.plusAncienne === null || file.plusAncienneType === null) return null;
  const jours = joursDAttente(file.plusAncienne, maintenant);
  if (jours < JOURS_ALERTE_ATTENTE) return null;
  return `${NATURE_EN_ATTENTE[file.plusAncienneType]} attend depuis ${jours} jours. Retrouve du réseau avant 90 jours.`;
}
```

Puis `node crlf.mjs apps/collecteur/src/hors-ligne/vues.ts apps/collecteur/src/hors-ligne/vues.test.ts` — attendu `nbsp=0` pour les deux.

Run : `npm run test -w @kolek/collecteur -- src/hors-ligne/vues.test.ts`
Attendu : PASS, 29 épreuves.

- [ ] **Étape 4 : écrire l'épreuve de l'écran des alertes**

Créer `apps/collecteur/src/ecrans/Alertes.test.tsx` :

```tsx
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { viderCache } from '../cache';
import { carte, client, operationMise, tournee } from '../hors-ligne/fabriques';
import { chargeUtileDe } from '../hors-ligne/modele';

/**
 * Les refus sur l'écran des alertes (spec J2b §8.4).
 *
 * Le fait mesuré : un refus se lit sans réseau, et sa présence interdit « Rien
 * à signaler ». Les autres alertes viennent du serveur ; sans réseau, l'écran
 * le dit au lieu de se taire.
 */

const chargerAlertes = vi.fn();
vi.mock('../lectures-ecrans', () => ({ chargerAlertes: () => chargerAlertes() }));

let etatHorsLigne: Record<string, unknown> = {};
vi.mock('../hors-ligne/useHorsLigne', () => ({ useHorsLigne: () => etatHorsLigne }));

const { Alertes } = await import('./Alertes');

const MISE_REFUSEE = operationMise(1, { carteId: 'k1' });
const REFUS = {
  id: MISE_REFUSEE.id,
  motif: 'CARTE_CLOTUREE',
  chargeUtile: chargeUtileDe(MISE_REFUSEE),
  creeLe: MISE_REFUSEE.faiteLe,
};

beforeEach(() => {
  etatHorsLigne = {
    operations: [],
    refus: [],
    tournee: tournee({ clients: [client('c1', 'Awa')], cartes: [carte('k1', 'c1')] }),
    file: null,
    stockage: 'persistant',
  };
});

afterEach(() => {
  cleanup();
  chargerAlertes.mockReset();
  // Le cache de `useDonnees` survit au démontage : sans cette purge, une
  // épreuve relirait les alertes de la précédente.
  viderCache();
});

function afficher() {
  render(<Alertes onRetour={() => {}} revision={0} />);
}

describe('les refus en tête des alertes (§8.4)', () => {
  it('se lisent sans réseau : client, montant, motif et heure du geste', async () => {
    chargerAlertes.mockRejectedValue(new Error('réseau'));
    etatHorsLigne = { ...etatHorsLigne, refus: [REFUS] };
    afficher();

    expect(await screen.findByText('Les autres alertes demandent le réseau.')).toBeTruthy();
    // Espaces ordinaires : `getByText` ramène l'insécable de `formatMontant` à
    // une espace avant de comparer.
    expect(screen.getByText('Awa — mise de 1 000 FCFA')).toBeTruthy();
    expect(screen.getByText('La carte avait été clôturée.')).toBeTruthy();
    expect(screen.getByText(/^Geste du /)).toBeTruthy();
    expect(screen.getByText('1 refusée')).toBeTruthy();
  });

  it('empêchent « Rien à signaler », même quand le serveur n’a rien', async () => {
    chargerAlertes.mockResolvedValue([]);
    etatHorsLigne = {
      ...etatHorsLigne,
      operations: [
        operationMise(2, { carteId: 'k1' }, { etat: 'refusee_a_consigner', motif: 'CYCLE_COMPLET' }),
      ],
    };
    afficher();
    // Laisser la lecture des autres alertes aboutir : c'est après elle que
    // « Rien à signaler » apparaîtrait.
    await act(async () => {});

    expect(screen.getByText('Le cycle de 31 mises était déjà complet.')).toBeTruthy();
    expect(
      screen.getByText('Rien n’est effacé : chaque opération refusée est gardée telle quelle, avec son motif.'),
    ).toBeTruthy();
    expect(screen.queryByText('Rien à signaler')).toBeNull();
  });

  it('sans refus ni réseau, disent que l’écran demande le réseau, et rien de rassurant', async () => {
    chargerAlertes.mockRejectedValue(new Error('réseau'));
    afficher();

    expect(await screen.findByText('Cet écran demande le réseau.')).toBeTruthy();
    expect(screen.getByText('Réseau requis')).toBeTruthy();
    expect(screen.queryByText('Rien à signaler')).toBeNull();
    expect(screen.queryByText('Rien d’urgent')).toBeNull();
  });

  it('laissent « Rien à signaler » quand rien n’est refusé ni à faire', async () => {
    chargerAlertes.mockResolvedValue([]);
    afficher();

    expect(await screen.findByText('Rien à signaler')).toBeTruthy();
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Alertes.test.tsx`
Attendu : FAIL sur les trois premières épreuves ; la quatrième passe déjà (c'est le comportement d'aujourd'hui, qu'elle garde).

- [ ] **Étape 5 : réécrire l'écran des alertes**

Remplacer tout le contenu de `apps/collecteur/src/ecrans/Alertes.tsx` par :

```tsx
import { Carte, Icone, Squelette } from '@kolek/ui';
import { useMemo } from 'react';

import { useDonnees } from '../cache';
import { useHorsLigne } from '../hors-ligne/useHorsLigne';
import { refusAffichables } from '../hors-ligne/vues';
import { chargerAlertes, type GraviteAlerte } from '../lectures-ecrans';
import { rangCascade, usePremierRendu } from '../premier-rendu';
import { CorpsEcran, EnTeteEcran, RienAMontrer } from './EnTeteEcran';

/**
 * Les alertes.
 *
 * Elles ne sont pas une table : elles sont **déduites de l'état** à chaque
 * ouverture de l'écran. Rien ne les stocke, donc rien ne peut les rendre
 * périmées, et il n'y a aucune liste à purger.
 *
 * Le revers, assumé : on ne peut pas les marquer « lues ». Une carte à clôturer
 * reste signalée tant qu'elle n'est pas clôturée. C'est exactement ce qu'on
 * attend d'un rappel qui porte sur de l'argent qu'un client attend.
 *
 * Aucune notification poussée : l'application n'en émet pas, et prétendre le
 * contraire ici ferait manquer une échéance à quelqu'un qui aurait cessé de
 * regarder.
 *
 * ## Les refus, depuis J2b
 *
 * Une opération partie du téléphone et refusée par le serveur, c'est de
 * l'argent qui a changé de main sans être compté. Elle passe en tête, avant
 * toute alerte, et se lit **sans réseau** : elle vient de la base du téléphone
 * — la copie des refus consignés, et les refus pas encore consignés (spec J2b
 * §8.4). Les autres alertes restent calculées par le serveur ; sans réseau,
 * l'écran dit qu'elles l'attendent au lieu d'annoncer « Rien à signaler ».
 *
 * Aucune action sur un refus dans J2b : rien ne s'efface, rien ne se rejoue
 * d'ici.
 */
const APPARENCE: Record<GraviteAlerte, { bordure: string; puce: string; icone: 'alert-circle' | 'info' }> = {
  action: { bordure: 'border-negative', puce: 'bg-negative-tint text-negative', icone: 'alert-circle' },
  attention: { bordure: 'border-hairline', puce: 'bg-info-tint text-info', icone: 'alert-circle' },
  information: { bordure: 'border-hairline', puce: 'bg-muted text-muted-foreground', icone: 'info' },
};

const LIBELLE: Record<GraviteAlerte, string> = {
  action: 'À faire',
  attention: 'À surveiller',
  information: 'Information',
};

/** « 12 septembre à 08:30 » : l'heure du geste, pas celle du refus. */
function heureDuGeste(iso: string): string {
  const quand = new Date(iso);
  const jour = quand.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const heure = quand.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${jour} à ${heure}`;
}

export function Alertes({ onRetour, revision }: { onRetour: () => void; revision: number }) {
  const { donnees: alertes, erreur } = useDonnees('alertes', chargerAlertes, {
    revision,
    messageErreur: 'Cet écran demande le réseau.',
  });
  const { operations, refus, tournee } = useHorsLigne();
  const refusees = useMemo(
    () => refusAffichables(refus, operations, tournee),
    [refus, operations, tournee],
  );

  const aFaire = alertes?.filter((a) => a.gravite === 'action').length ?? 0;
  // Voir `Recus` : l'escalier ne rejoue pas quand la liste se relit.
  const premier = usePremierRendu();

  // Un refus n'est pas « une chose à faire » : J2b n'offre aucune action sur
  // lui. Les deux se comptent à part.
  const resume = [
    ...(refusees.length > 0 ? [`${refusees.length} refusée${refusees.length > 1 ? 's' : ''}`] : []),
    ...(aFaire > 0 ? [`${aFaire} chose${aFaire > 1 ? 's' : ''} à faire`] : []),
  ].join(' · ');
  const sousTitre =
    resume !== '' ? resume : alertes !== null ? 'Rien d’urgent' : erreur ? 'Réseau requis' : 'Lecture…';

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran titre="Alertes" sousTitre={sousTitre} onRetour={onRetour} largeur="liste" />

      <CorpsEcran
        largeur="liste"
        enfants={
          <>
            {refusees.length > 0 && (
              <section aria-label="Refusées par le serveur" className="space-y-3">
                <p className="font-headings font-bold text-base text-ink px-1">Refusées par le serveur</p>
                {refusees.map((r) => (
                  <Carte
                    key={r.id}
                    className="p-4 rounded-2xl border border-negative shadow-xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-pill flex items-center justify-center shrink-0 bg-negative-tint text-negative">
                        <Icone nom="alert-circle" taille={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                          Refusée
                        </p>
                        <p className="font-headings font-bold text-base text-ink mb-1">{r.titre}</p>
                        <p className="font-body text-sm text-muted-foreground">{r.detail}</p>
                        {r.quand && (
                          <p className="font-body text-xs text-muted-foreground mt-1">
                            {`Geste du ${heureDuGeste(r.quand)}`}
                          </p>
                        )}
                      </div>
                    </div>
                  </Carte>
                ))}
                <p className="font-body text-xs text-muted-foreground px-1">
                  Rien n’est effacé : chaque opération refusée est gardée telle quelle, avec son motif.
                </p>
              </section>
            )}

            {erreur && (
              <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
                {/* Avec des refus à l'écran, « cet écran » dirait faux : une partie se lit. */}
                {refusees.length > 0 ? 'Les autres alertes demandent le réseau.' : erreur}
              </p>
            )}

            {!alertes && !erreur && (
              <div className="space-y-3">
                <Carte className="p-4 space-y-2.5">
                  <Squelette hauteur="h-4" largeur="w-20" />
                  <Squelette hauteur="h-5" largeur="w-48" />
                  <Squelette hauteur="h-4" largeur="w-3/4" />
                </Carte>
                <Carte className="p-4 space-y-2.5">
                  <Squelette hauteur="h-4" largeur="w-20" />
                  <Squelette hauteur="h-5" largeur="w-48" />
                  <Squelette hauteur="h-4" largeur="w-3/4" />
                </Carte>
              </div>
            )}

            {alertes?.length === 0 && refusees.length === 0 && (
              <RienAMontrer
                icone="bell"
                titre="Rien à signaler"
                detail="Aucune carte n'attend d'être clôturée, aucune ne dort, et ton abonnement est à jour."
              />
            )}

            {alertes?.map((alerte, rang) => {
              const style = APPARENCE[alerte.gravite];
              return (
                <Carte
                  key={alerte.cle}
                  className={`p-4 rounded-2xl border border-hairline/80 shadow-xs hover:shadow-sm transition-all ${style.bordure} ${premier ? 'anim-cascade' : ''}`}
                  style={rangCascade(rang, premier)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-pill flex items-center justify-center shrink-0 ${style.puce}`}
                    >
                      <Icone nom={style.icone} taille={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-body font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                        {LIBELLE[alerte.gravite]}
                      </p>
                      <p className="font-headings font-bold text-base text-ink mb-1">
                        {alerte.titre}
                      </p>
                      <p className="font-body text-sm text-muted-foreground">{alerte.detail}</p>
                    </div>
                  </div>
                </Carte>
              );
            })}

            {alertes && alertes.length > 0 && (
              <p className="font-body text-xs text-muted-foreground px-1">
                Ces alertes sont recalculées à chaque ouverture de l’écran. Elles disparaissent
                d’elles-mêmes quand la situation est réglée — il n’y a rien à cocher.
              </p>
            )}
          </>
        }
      />
    </div>
  );
}
```

Puis `node crlf.mjs apps/collecteur/src/ecrans/Alertes.tsx apps/collecteur/src/ecrans/Alertes.test.tsx` — le second est un fichier neuf, donc en CRLF.

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Alertes.test.tsx`
Attendu : PASS, 4 épreuves.

- [ ] **Étape 6 : écrire l'épreuve de l'accueil**

`apps/collecteur/src/ecrans/Accueil.test.tsx` est en **LF** : ne pas lui passer `crlf.mjs`. Ajouter à la fin du fichier :

```tsx
describe('ce que l’accueil signale de la file (§8.4, §8.7, §8.8)', () => {
  it('mène aux refus par un bandeau qui ne bloque rien', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    etatHorsLigne = horsLigne({ file: { ...FILE_VIDE, refusees: 2 } });
    const onNaviguer = vi.fn();
    rendre({ onNaviguer });

    fireEvent.click(await screen.findByRole('button', { name: '2 opérations refusées — à voir' }));

    expect(onNaviguer).toHaveBeenCalledWith('alertes');
  });

  it('prévient quand le plus ancien geste attend depuis 75 jours ou plus', async () => {
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    etatHorsLigne = horsLigne({
      file: {
        ...FILE_VIDE,
        mises: 1,
        enAttente: 1,
        // Une seconde de plus que 76 jours : la division ne tombe pas sur la frontière.
        plusAncienne: new Date(Date.now() - 76 * 86_400_000 - 1000).toISOString(),
        plusAncienneType: 'mise',
      },
    });
    rendre();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Une mise attend depuis 76 jours. Retrouve du réseau avant 90 jours.',
    );
  });

  it('dit une fois par lancement que le stockage n’est pas garanti', async () => {
    // La seule épreuve du fichier qui passe par `non_garanti` : le drapeau
    // « déjà dit » vit dans le module, pour toute la durée du lancement.
    const PHRASE =
      'Ce téléphone peut effacer les données de Kolek s’il manque de place. Garde l’application installée et envoie dès que possible.';
    chargerTableauCollecteur.mockResolvedValue(TABLEAU);
    etatHorsLigne = horsLigne({ stockage: 'non_garanti' });

    rendre();
    expect(await screen.findByText(PHRASE)).toBeTruthy();

    // Retour sur l'accueil pendant le même lancement.
    cleanup();
    rendre();
    expect(await screen.findByRole('button', { name: 'Encaisser sur la carte de Mariam' })).toBeTruthy();
    expect(screen.queryByText(PHRASE)).toBeNull();
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Accueil.test.tsx`
Attendu : FAIL sur les trois nouvelles épreuves.

- [ ] **Étape 7 : l'accueil**

Dans `apps/collecteur/src/ecrans/Accueil.tsx` :

1. Remplacer la ligne `} from '@kolek/ui';` (la fin de l'import multiligne de `@kolek/ui`) par :

```tsx
} from '@kolek/ui';
import { useEffect, useState } from 'react';
```

2. Remplacer la ligne `import { useHorsLigne } from '../hors-ligne/useHorsLigne';` par :

```tsx
import { useHorsLigne } from '../hors-ligne/useHorsLigne';
import { phraseAttenteLongue } from '../hors-ligne/vues';
```

3. Remplacer les deux lignes :

```tsx
/**
 * Écran d'accueil du collecteur.
```

par :

```tsx
/**
 * L'avertissement du stockage non garanti se dit une fois par lancement (spec
 * J2b §8.7). Répété à chaque retour sur l'accueil, il deviendrait un décor
 * qu'on ne lit plus ; `Plus` le garde en permanence pour qui le cherche.
 */
let stockageDejaSignale = false;

/**
 * Écran d'accueil du collecteur.
```

4. Remplacer la ligne `  const { file } = useHorsLigne();` par :

```tsx
  const { file, stockage } = useHorsLigne();
  const attenteLongue = phraseAttenteLongue(file, Date.now());
  const refusees = file?.refusees ?? 0;
  const [avisStockage, setAvisStockage] = useState(false);
  useEffect(() => {
    if (stockage !== 'non_garanti' || stockageDejaSignale) return;
    stockageDejaSignale = true;
    setAvisStockage(true);
  }, [stockage]);
```

5. Remplacer :

```tsx
      {erreur && (
        <p role="alert" className="mx-4 mt-3 text-sm font-body text-negative">
          {erreur}
        </p>
      )}
```

par :

```tsx
      {erreur && (
        <p role="alert" className="mx-4 mt-3 text-sm font-body text-negative">
          {erreur}
        </p>
      )}

      {/* Ce que la file demande au collecteur. Rien ici ne bloque un geste : un
          refus se lit dans les alertes, l'attente longue et le stockage se
          règlent en retrouvant du réseau (spec J2b §8.4, §8.7, §8.8). */}
      {(attenteLongue || refusees > 0 || avisStockage) && (
        <div className="mx-4 mt-3 space-y-2">
          {attenteLongue && (
            <p role="alert" className="rounded-md bg-negative-tint p-3 text-sm font-body text-negative">
              {attenteLongue}
            </p>
          )}
          {refusees > 0 && (
            <button
              type="button"
              onClick={() => onNaviguer('alertes')}
              className="anim-pression w-full cursor-pointer rounded-md border border-negative bg-surface p-3 text-left text-sm font-body font-medium text-negative"
            >
              {`${refusees} opération${refusees > 1 ? 's' : ''} refusée${refusees > 1 ? 's' : ''} — à voir`}
            </button>
          )}
          {avisStockage && (
            <p className="rounded-md bg-info-tint p-3 text-sm font-body text-info">
              Ce téléphone peut effacer les données de Kolek s’il manque de place. Garde
              l’application installée et envoie dès que possible.
            </p>
          )}
        </div>
      )}
```

Puis `node crlf.mjs apps/collecteur/src/ecrans/Accueil.tsx`.

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Accueil.test.tsx`
Attendu : PASS, 8 épreuves.

- [ ] **Étape 8 : écrire l'épreuve de « Plus »**

Dans `apps/collecteur/src/ecrans/Plus.test.tsx` :

1. Remplacer la ligne `import { afterEach, describe, expect, it, vi } from 'vitest';` par `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';`.
2. Remplacer :

```tsx
afterEach(() => {
  cleanup();
  viderCache();
});
```

par :

```tsx
afterEach(() => {
  cleanup();
  viderCache();
  // L'état réseau simulé par une épreuve ne doit pas survivre à la suivante.
  delete (window.navigator as unknown as { onLine?: boolean }).onLine;
});
```

3. Remplacer la ligne `const { Plus } = await import('./Plus');` par :

```tsx
const FILE_VIDE = {
  mises: 0,
  clients: 0,
  cartes: 0,
  caisses: 0,
  enAttente: 0,
  aConsigner: 0,
  refusees: 0,
  plusAncienne: null,
  plusAncienneType: null,
};
let etatHorsLigne: Record<string, unknown> = {};
vi.mock('../hors-ligne/useHorsLigne', () => ({ useHorsLigne: () => etatHorsLigne }));

beforeEach(() => {
  etatHorsLigne = { operations: [], refus: [], tournee: null, file: FILE_VIDE, stockage: 'persistant' };
});

const { Plus } = await import('./Plus');
```

4. Ajouter à la fin du fichier :

```tsx
describe('ce que « Plus » dit du téléphone (spec J2b §8.7)', () => {
  it('garde en permanence l’avertissement du stockage non garanti', async () => {
    profil.mockResolvedValue(PROFIL);
    etatHorsLigne = { ...etatHorsLigne, stockage: 'non_garanti' };
    afficher();

    expect(
      await screen.findByText(
        'Ce téléphone peut effacer les données de Kolek s’il manque de place. Garde l’application installée et envoie dès que possible.',
      ),
    ).toBeTruthy();
  });

  it('dit ce qui marche sans réseau, et ce qui attend sur le téléphone', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    profil.mockResolvedValue(PROFIL);
    etatHorsLigne = { ...etatHorsLigne, file: { ...FILE_VIDE, mises: 2, enAttente: 1, aConsigner: 1 } };
    afficher();

    expect(await screen.findByText(/^Sans réseau, tu peux encaisser, inscrire un client/)).toBeTruthy();
    expect(screen.getByText('2 opérations sur ce téléphone pas encore envoyées.')).toBeTruthy();
    // La phrase d'avant J2b, qui aurait fait refuser des encaissements possibles.
    expect(document.body.textContent).not.toMatch(/aucun encaissement ne peut être enregistré/);
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Plus.test.tsx`
Attendu : FAIL sur les deux nouvelles épreuves ; les trois du renouvellement restent vertes.

- [ ] **Étape 9 : l'écran « Plus »**

Dans `apps/collecteur/src/ecrans/Plus.tsx` :

1. Remplacer la ligne `import { useDonnees } from '../cache';` par :

```tsx
import { useDonnees } from '../cache';
import { useHorsLigne } from '../hors-ligne/useHorsLigne';
```

2. Remplacer la ligne `    messageErreur: 'Fiche indisponible. Vérifie le réseau.',` par :

```tsx
    messageErreur: 'Fiche indisponible sur ce téléphone. Connecte-toi une fois au réseau pour la charger.',
```

3. Remplacer la ligne `  const enLigne = useEnLigne();` par :

```tsx
  const enLigne = useEnLigne();
  const { file, stockage } = useHorsLigne();
  /** Tout ce qui n'a pas quitté le téléphone, refus à consigner compris : c'est ce que la déconnexion attend. */
  const enFile = file ? file.enAttente + file.aConsigner : 0;
```

4. Remplacer :

```tsx
                  <p className="font-body text-xs text-muted-foreground">
                    {enLigne
                      ? 'Tes encaissements partent au serveur au moment où tu les enregistres.'
                      : 'Sans réseau, les écrans montrent la dernière lecture connue et aucun encaissement ne peut être enregistré.'}
                  </p>
```

par :

```tsx
                  <p className="font-body text-xs text-muted-foreground">
                    {enLigne
                      ? 'Tes encaissements sont enregistrés sur ce téléphone, puis envoyés au serveur dans l’ordre.'
                      : 'Sans réseau, tu peux encaisser, inscrire un client, ouvrir une carte et déclarer ta caisse : tout est gardé sur ce téléphone et part au retour du réseau. Le retrait, le bilan et les reçus attendent le réseau.'}
                  </p>
                  {enFile > 0 && (
                    <p className="font-body text-xs font-medium text-ink mt-2">
                      {`${enFile} opération${enFile > 1 ? 's' : ''} sur ce téléphone pas encore envoyée${enFile > 1 ? 's' : ''}.`}
                    </p>
                  )}
                  {/* Permanent ici, une fois sur l'accueil (spec J2b §8.7). */}
                  {stockage === 'non_garanti' && (
                    <p className="mt-3 rounded-md bg-info-tint p-3 font-body text-sm text-info">
                      Ce téléphone peut effacer les données de Kolek s’il manque de place. Garde
                      l’application installée et envoie dès que possible.
                    </p>
                  )}
```

Puis `node crlf.mjs apps/collecteur/src/ecrans/Plus.tsx apps/collecteur/src/ecrans/Plus.test.tsx`.

Run : `npm run test -w @kolek/collecteur -- src/ecrans/Plus.test.tsx`
Attendu : PASS, 5 épreuves.

- [ ] **Étape 10 : l'avis avant connexion**

Ajouter à la fin de `packages/ui/src/EcranConnexion.test.tsx` :

```tsx
describe('l’avis avant connexion (spec J2b §8.6)', () => {
  it('dit ce qui attend sur le téléphone, sans le présenter comme une erreur', () => {
    render(<EcranConnexion {...BASE} avis="3 opérations attendent sur ce téléphone." />);

    expect(screen.getByRole('status').textContent).toBe('3 opérations attendent sur ce téléphone.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ne montre rien sans avis', () => {
    render(<EcranConnexion {...BASE} />);

    expect(screen.queryByRole('status')).toBeNull();
  });
});
```

Run : `npm run test -w @kolek/ui -- src/EcranConnexion.test.tsx`
Attendu : FAIL sur la première ; la seconde passe déjà, et garde l'écran muet pour l'administration et la vitrine, qui ne passent aucun avis.

Dans `packages/ui/src/EcranConnexion.tsx` :

1. Remplacer la ligne `  erreurInitiale?: string | null;` par :

```tsx
  erreurInitiale?: string | null;
  /** Une information à lire avant de se connecter, qui n'est pas une erreur :
      « 3 opérations attendent sur ce téléphone ». `role="status"` et non
      `alert` — rien n'a échoué. */
  avis?: string | null;
```

2. Remplacer la ligne `  erreurInitiale = null,` par :

```tsx
  erreurInitiale = null,
  avis = null,
```

3. Remplacer les deux lignes :

```tsx
        <Champ
          libelle="Email"
```

par :

```tsx
        {avis && (
          <p role="status" className="mb-4 rounded-md bg-white/10 p-3 font-body text-sm text-white">
            {avis}
          </p>
        )}

        <Champ
          libelle="Email"
```

Puis `node crlf.mjs packages/ui/src/EcranConnexion.tsx packages/ui/src/EcranConnexion.test.tsx`.

Run : `npm run test -w @kolek/ui -- src/EcranConnexion.test.tsx`
Attendu : PASS, 6 épreuves.

- [ ] **Étape 11 : la connexion du collecteur compte ce qui attend**

`apps/collecteur/src/Connexion.test.tsx` est en **LF**.

1. Remplacer la ligne `import { cleanup, render, screen } from '@testing-library/react';` par `import { act, cleanup, render, screen } from '@testing-library/react';`.
2. Remplacer la ligne `import { afterEach, describe, expect, it, vi } from 'vitest';` par `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';`.
3. Remplacer la ligne `const { Connexion } = await import('./Connexion');` par :

```tsx
const compter = vi.fn();
vi.mock('./hors-ligne/stockage-local', () => ({
  compterOperationsSurCeTelephone: () => compter(),
}));

const { Connexion } = await import('./Connexion');
```

4. Remplacer :

```tsx
afterEach(() => {
  cleanup();
```

par :

```tsx
beforeEach(() => {
  compter.mockResolvedValue(0);
});

afterEach(() => {
  cleanup();
  compter.mockReset();
```

5. Ajouter à la fin du fichier :

```tsx
describe('ce qui attend sur le téléphone (spec J2b §8.6)', () => {
  it('annonce les opérations en attente, sans nom ni montant', async () => {
    compter.mockResolvedValue(3);
    render(<Connexion />);

    expect((await screen.findByRole('status')).textContent).toBe(
      '3 opérations attendent sur ce téléphone. Reconnecte-toi avec le même compte pour les envoyer.',
    );
  });

  it('accorde la phrase à une seule opération', async () => {
    compter.mockResolvedValue(1);
    render(<Connexion />);

    expect((await screen.findByRole('status')).textContent).toBe(
      '1 opération attend sur ce téléphone. Reconnecte-toi avec le même compte pour l’envoyer.',
    );
  });

  it('se tait quand le navigateur ne sait pas compter', async () => {
    compter.mockResolvedValue(null);
    render(<Connexion />);
    // Laisser le compte aboutir avant de constater l'absence.
    await act(async () => {});

    expect(screen.queryByRole('status')).toBeNull();
  });
});
```

Run : `npm run test -w @kolek/collecteur -- src/Connexion.test.tsx`
Attendu : FAIL sur les deux premières ; la troisième passe déjà.

Dans `apps/collecteur/src/Connexion.tsx` :

1. Remplacer la ligne `} from './erreurOAuth';` par :

```tsx
} from './erreurOAuth';
import { compterOperationsSurCeTelephone } from './hors-ligne/stockage-local';
```

2. Remplacer :

```tsx
  useEffect(() => {
    nettoyerUrlOAuth();
  }, []);
```

par :

```tsx
  useEffect(() => {
    nettoyerUrlOAuth();
  }, []);

  // Une session finie ne vide pas la file : ce qui a été encaissé attend sur le
  // téléphone, dans la base du collecteur (spec J2b §8.6). Le dire ici, avant
  // qu'on se connecte avec un autre compte et qu'on croie l'argent perdu.
  // Rien qu'un nombre : aucun nom, aucun montant avant la connexion.
  const [avis, setAvis] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    compterOperationsSurCeTelephone().then(
      (n) => {
        if (!vivant || n === null || n === 0) return;
        setAvis(
          n === 1
            ? '1 opération attend sur ce téléphone. Reconnecte-toi avec le même compte pour l’envoyer.'
            : `${n} opérations attendent sur ce téléphone. Reconnecte-toi avec le même compte pour les envoyer.`,
        );
      },
      () => {},
    );
    return () => {
      vivant = false;
    };
  }, []);
```

3. Remplacer la ligne `      erreurInitiale={erreurRetour}` par :

```tsx
      erreurInitiale={erreurRetour}
      avis={avis}
```

Puis `node crlf.mjs apps/collecteur/src/Connexion.tsx` (pas l'épreuve, qui est en LF).

Run : `npm run test -w @kolek/collecteur -- src/Connexion.test.tsx`
Attendu : PASS, 6 épreuves.

- [ ] **Étape 12 : les écrans restés en ligne le disent (§8.9)**

Ces quatre écrans lisent le serveur et rien d'autre. Aucune épreuve ne cite leur message d'erreur (vérifié par `grep -rn "Vérifie le réseau" apps/collecteur/src --include=*.test.*` : aucune ligne).

1. `apps/collecteur/src/ecrans/Bilan.tsx` : remplacer `    messageErreur: 'Chiffres indisponibles. Vérifie le réseau.',` par `    messageErreur: 'Cet écran demande le réseau.',`.
2. `apps/collecteur/src/ecrans/Recus.tsx` : remplacer `    messageErreur: 'Reçus indisponibles. Vérifie le réseau.',` par `    messageErreur: 'Cet écran demande le réseau.',`.
3. `apps/collecteur/src/ecrans/Avis.tsx` : remplacer `    messageErreur: 'Avis indisponibles. Vérifie le réseau.',` par `    messageErreur: 'Cet écran demande le réseau.',`.
4. `apps/collecteur/src/ecrans/HistoriqueClient.tsx` (**LF**) : remplacer `    { revision, messageErreur: 'Historique de cette carte indisponible. Vérifie le réseau.' },` par `    { revision, messageErreur: 'Cet écran demande le réseau.' },`.

Puis `node crlf.mjs apps/collecteur/src/ecrans/Bilan.tsx apps/collecteur/src/ecrans/Recus.tsx apps/collecteur/src/ecrans/Avis.tsx` (pas `HistoriqueClient.tsx`).

Contrôle : `grep -rn "Vérifie le réseau" apps/collecteur/src/ecrans` ne rend plus que `Equipe.tsx` et `EquipeClients.tsx`, deux écrans qui passent par une Edge Function et le disent déjà.

- [ ] **Étape 13 : les deux paquets, typage, lint, commit**

```bash
npm run test -w @kolek/ui
npm run test -w @kolek/collecteur
npm run typecheck -w @kolek/ui
npx tsc -b apps/collecteur
npm run verifier:lint
node crlf.mjs --mesurer apps/collecteur/src/ecrans/Accueil.test.tsx apps/collecteur/src/Connexion.test.tsx apps/collecteur/src/ecrans/HistoriqueClient.tsx
git add apps/collecteur/src/hors-ligne/vues.ts apps/collecteur/src/hors-ligne/vues.test.ts apps/collecteur/src/ecrans/Alertes.tsx apps/collecteur/src/ecrans/Alertes.test.tsx apps/collecteur/src/ecrans/Accueil.tsx apps/collecteur/src/ecrans/Accueil.test.tsx apps/collecteur/src/ecrans/Plus.tsx apps/collecteur/src/ecrans/Plus.test.tsx packages/ui/src/EcranConnexion.tsx packages/ui/src/EcranConnexion.test.tsx apps/collecteur/src/Connexion.tsx apps/collecteur/src/Connexion.test.tsx apps/collecteur/src/ecrans/Bilan.tsx apps/collecteur/src/ecrans/Recus.tsx apps/collecteur/src/ecrans/Avis.tsx apps/collecteur/src/ecrans/HistoriqueClient.tsx
git commit -m "feat(hors-ligne): les refus, l'attente et le stockage se lisent sur le telephone" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Attendu : tout au vert ; les trois fichiers mesurés restent en `LF`.

---

## Tâche 18 : relire les promesses

**Fichiers :**
- Modifier : `apps/collecteur/src/cache.ts` (CRLF)
- Modifier : `apps/collecteur/src/main.tsx` (**LF**)

**Interfaces :** aucune. Cette tâche ne change aucun comportement ; elle corrige ce que le code **dit** de lui-même, là où J2b l'a rendu faux ou incomplet.

- [ ] **Étape 1 : l'en-tête du cache**

**Corrigé après exécution (écart 45).** Le texte prescrit disait « la base du collecteur est effacée à la déconnexion » : faux. La tournée, le profil et les refus s'effacent ; la file, jamais (spec §4, garantie 5). Il oubliait aussi trois écrans restés en ligne : retrait, historique, avis. Le texte ci-dessous est celui qui a été posé.

Dans `apps/collecteur/src/cache.ts`, remplacer :

```ts
 * **Il ne survit pas au rechargement.** Une `Map` en mémoire, pas
 * `localStorage`. Ces lectures portent les noms et les soldes des clients :
 * les écrire sur le disque du téléphone les laisserait lisibles après la
 * déconnexion, à qui a l'appareil en main. Le gain — un affichage instantané au
 * démarrage à froid — ne vaut pas ce prix.
```

par :

```ts
 * **Il ne survit pas au rechargement.** Une `Map` en mémoire, pas
 * `localStorage`. Les lectures des écrans restés en ligne — bilan, reçus,
 * retrait, historique, avis, alertes du serveur, équipe — portent les noms et
 * les soldes des clients : les écrire sur le disque du téléphone les laisserait
 * lisibles après la déconnexion, à qui a l'appareil en main. Le gain — un
 * affichage instantané au démarrage à froid — ne vaut pas ce prix.
 *
 * La tournée des écrans de collecte, elle, est sur le disque depuis J2b
 * (`hors-ligne/stockage-local.ts`, spec J2b §5.1) : sans elle, aucun
 * encaissement sans réseau. Ce prix-là est payé une fois, là-bas, et borné : la
 * tournée, le profil et les refus s'effacent avec la session. La file, jamais
 * (spec J2b §4.5) ; la coquille refuse la déconnexion tant qu'elle n'est pas
 * vide. Ce cache ne fait que garder en mémoire ce que ces écrans en ont lu.
```

Puis `node crlf.mjs apps/collecteur/src/cache.ts`.

- [ ] **Étape 2 : le filet de l'application**

`apps/collecteur/src/main.tsx` est en **LF**. La phrase affichée quand l'application plante disait vrai par hasard avant J2b (aucune mise n'était sur le téléphone) ; elle doit dire vrai par construction. Remplacer :

```tsx
      message="Rien n’est perdu : les mises déjà enregistrées sur ce téléphone restent en attente de synchronisation. Recharge l’écran."
```

par :

```tsx
      message="Rien n’est perdu : ce qui est enregistré sur ce téléphone y reste jusqu’à son envoi. Recharge l’écran."
```

Mesurer : `node crlf.mjs --mesurer apps/collecteur/src/main.tsx` — attendu `LF nbsp=0`.

- [ ] **Étape 3 : relire chaque phrase qui parle du réseau**

```bash
grep -rn -i -E "synchronis|file de synchro|hors ligne|Vérifie le réseau|jalon J2|en J2b" apps/collecteur/src packages/ui/src apps/collecteur/vite.config.ts --include=*.ts --include=*.tsx
```

Lire **chaque** ligne dans son contexte (dix lignes autour). Une phrase est fausse si, sur le comportement de cette branche :
- elle dit qu'encaisser, inscrire, ouvrir une carte ou déclarer la caisse demande le réseau ;
- elle promet qu'une chose « sera synchronisée » sans passer par la file ;
- elle dit que la tournée n'est gardée qu'en mémoire ;
- elle parle de J2b au futur.

Lignes connues avant cette branche, et leur verdict :

| Fichier | Phrase | Verdict |
|---|---|---|
| `ecrans/Equipe.tsx` | « il n'y a pas de file de synchro derrière » (création d'un collaborateur) | Vraie : Edge Function, rien n'entre dans la file. Garder. |
| `ecrans/Equipe.tsx` | « Ta tournée, elle, fonctionne hors ligne. » | Devenue vraie. Garder. |
| `ecrans/EquipeClients.tsx` | en-tête (réécrit en tâche 14) et « fonctionne hors ligne » | Vraies. Garder. |
| `ecritures-ecrans.ts` | `encaisserPour` : « Rien n'entre dans la file de synchro » | Vraie : Edge Function. Garder. |
| `ecrans/Recus.tsx` | « un rejeu de synchro » | Vraie : l'identifiant vient du téléphone. Garder. |
| `lectures-ecrans.ts` | « se contredirait à la synchronisation » | Vraie. Garder. |
| `pagination.ts`, `ecrans/Clients.tsx` | « travaille hors ligne » | Vraies. Garder. |
| `ecrans/Plus.tsx` | « Hors ligne » (état du réseau) | Vraie. Garder. |
| `packages/ui/src/Bandeaux.tsx` | commentaire de `messageFile` qui cite l'ancienne phrase | Citation datée. Garder. |
| `vite.config.ts` | manifeste : « Carnet de collecte numérique, hors-ligne d’abord » | Devenue vraie. Garder. |

Les lignes posées par les tâches 11 à 17 sont vraies par construction ; les relire quand même. Une ligne hors de cette table et fausse selon les quatre critères : la corriger dans ce commit et la nommer dans le message. Un doute : s'arrêter et demander à l'exploitant.

- [ ] **Étape 4 : commit**

```bash
npm run test -w @kolek/collecteur
npm run verifier:lint
git add apps/collecteur/src/cache.ts apps/collecteur/src/main.tsx
git commit -m "fix(hors-ligne): le cache et le filet disent ce que le telephone garde" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 19 : vérifier, regarder, livrer

**Fichiers :** aucun dans le dépôt. Quatre scripts dans un répertoire temporaire **hors du dépôt**, noté `$TMP/regard-j2b` (sous Git Bash, par exemple `$TMP` = le répertoire temporaire de la session de l'exécutant).

**Interfaces :** tout ce qui précède.

Les étapes 1 à 7 ne touchent que la pile locale. Les étapes 8 à 10 touchent la production : **chacune attend l'accord explicite de l'exploitant**, donné pour elle.

- [ ] **Étape 1 : la chaîne complète**

La pile locale doit être debout (voir la mémoire « pile Supabase locale » : `npx supabase start -x studio,storage-api,imgproxy,realtime,vector,logflare,supavisor,mailpit`).

```bash
npm run verifier
git diff --stat main...HEAD -- supabase/migrations supabase/functions
git log --oneline main..HEAD
```

Attendu : `verifier` vert de bout en bout (il commence par `db:reset` **local**) ; le `diff` ne rend **rien** ; le journal liste le commit de la spec puis dix-huit commits de tâches. Un échec de `test:db` sur `avis-drainage.test.ts` juste après un démarrage « depuis la sauvegarde » : relancer une fois avant de chercher un défaut (mémoire « pile Supabase locale »).

- [ ] **Étape 2 : construire contre la pile locale**

**Corrigé après exécution (écart 49).** Le motif `\.supabase\.co` du garde-fou comptait le joker `*.supabase.co` que supabase-js porte en littéral dans son propre code : un faux positif qui arrêtait tout. Il cherche désormais un hôte de projet (`<ref>.supabase.co`), plus la référence de production où qu'elle soit.

Créer `$TMP/regard-j2b/construire.mjs` :

```js
// Construit le collecteur contre la pile Supabase locale, sans afficher de clé.
// Usage, depuis la racine du dépôt : node "$TMP/regard-j2b/construire.mjs" "$TMP/dist-j2b"
import { execSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

if (!process.argv[2]) throw new Error('Donner le répertoire de sortie.');
const sortie = resolve(process.argv[2]);

const statut = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
if (statut.API_URL !== 'http://127.0.0.1:54321') throw new Error(`Pile inattendue : ${statut.API_URL}`);

// Les variables du processus priment sur `apps/collecteur/.env`, qui vise la
// production : c'est ce qui rend cette construction locale. Le compte plus bas
// le prouve au lieu de le supposer.
const r = spawnSync(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'build', 'apps/collecteur', '--outDir', sortie, '--emptyOutDir'],
  {
    stdio: 'inherit',
    env: { ...process.env, VITE_SUPABASE_URL: statut.API_URL, VITE_SUPABASE_ANON_KEY: statut.ANON_KEY },
  },
);
if (r.status !== 0) process.exit(r.status ?? 1);

let local = 0;
let distant = 0;
for (const nom of readdirSync(join(sortie, 'assets')).filter((n) => n.endsWith('.js'))) {
  const contenu = readFileSync(join(sortie, 'assets', nom), 'utf8');
  local += contenu.split('127.0.0.1:54321').length - 1;
  // Un hôte de projet (`<ref>.supabase.co`), pas le joker `*.supabase.co` que
  // supabase-js porte en littéral ; et la référence de production, où qu'elle soit.
  distant += (contenu.match(/[a-z0-9-]+\.supabase\.co(?![a-z0-9])/g) ?? []).length;
  distant += contenu.split('yfnwmokxkznejotgpfgf').length - 1;
}
console.log(`hôte local : ${local} ; hôte en .supabase.co : ${distant}`);
if (local === 0 || distant > 0) throw new Error('Le paquet ne vise pas la pile locale seule : ne pas le servir.');
```

```bash
node "$TMP/regard-j2b/construire.mjs" "$TMP/dist-j2b"
```

Attendu : la construction réussit, puis `hôte local : 1` ou plus, et `hôte en .supabase.co : 0`. Tout autre compte : **arrêt**, rien n'est servi.

- [ ] **Étape 3 : servir, préparer un compte, ouvrir Chrome**

**Corrigé après exécution (écarts 50 et 51).** `vite preview` passe par `vite.config.ts`, dont le garde refuse de servir sans `VITE_SUPABASE_*` : un lanceur les lui donne, ceux de la pile locale, sans les afficher. Chrome demande un profil au **chemin court** : dans `$TMP` (~150 caractères), le chemin de `CacheStorage` dépasse 260 caractères, `caches.open` lève `UnknownError` et le service worker ne s'installe jamais — un symptôme qui ressemble à un défaut de l'application. Enfin, la coupure de `cdp.mjs hors-ligne` tombait dès qu'une autre commande s'attachait à l'onglet (`navigator.onLine` repassait à vrai) : elle est réappliquée toutes les 250 ms.

Créer `$TMP/regard-j2b/servir.mjs` :

```js
// Sert le paquet local sur 5181. La configuration Vite exige les variables même
// pour servir : on lui donne celles de la pile locale, sans les afficher.
// Usage, depuis la racine du dépôt : node servir.mjs <répertoire du paquet>
import { execSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

if (!process.argv[2]) throw new Error('Donner le répertoire du paquet.');
const statut = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
if (statut.API_URL !== 'http://127.0.0.1:54321') throw new Error(`Pile inattendue : ${statut.API_URL}`);

const enfant = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', 'apps/collecteur', '--outDir', resolve(process.argv[2]), '--port', '5181', '--strictPort'],
  { stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: statut.API_URL, VITE_SUPABASE_ANON_KEY: statut.ANON_KEY } },
);
enfant.on('exit', (code) => process.exit(code ?? 1));
```

Servir le paquet sur **5181**, jamais sur 5173 ni 5174 (commande en arrière-plan) :

```bash
node "$TMP/regard-j2b/servir.mjs" "$TMP/dist-j2b"
```

Créer `$TMP/regard-j2b/preparer.mjs` :

```js
// Crée un collecteur sur la pile locale, avec des clients, des cartes et des mises.
// Usage, depuis la racine : node "$TMP/regard-j2b/preparer.mjs" <regard|mesure> <cartes> <mises par carte>
import { execSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { createClient } = createRequire(join(process.cwd(), 'package.json'))('@supabase/supabase-js');
const statut = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
if (statut.API_URL !== 'http://127.0.0.1:54321') throw new Error(`Pile inattendue : ${statut.API_URL}`);

const [role = 'regard', cartesTexte = '3', misesTexte = '1'] = process.argv.slice(2);
const nbCartes = Number(cartesTexte);
const nbMises = Number(misesTexte);
if (!(nbMises >= 0 && nbMises <= 30)) throw new Error('De 0 à 30 mises par carte : la 31e clôt le cycle.');

const sansSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(statut.API_URL, statut.SERVICE_ROLE_KEY, sansSession);

const email = `${role}-j2b-${randomUUID().slice(0, 8)}@kolek.test`;
const motDePasse = randomBytes(12).toString('base64url');
const { data, error } = await admin.auth.admin.createUser({
  email,
  password: motDePasse,
  email_confirm: true,
  user_metadata: { nom: `${role === 'mesure' ? 'Mesure' : 'Regard'} J2b`, telephone: `+22507${Date.now() % 1e8}` },
});
if (error) throw error;
const id = data.user.id;

// Les lignes s'écrivent avec la session du collecteur : les politiques RLS
// s'appliquent comme depuis l'application.
const collecteur = createClient(statut.API_URL, statut.ANON_KEY, sansSession);
const { error: erreurConnexion } = await collecteur.auth.signInWithPassword({ email, password: motDePasse });
if (erreurConnexion) throw erreurConnexion;

const MISE = 1000;
const clients = Array.from({ length: nbCartes }, (_, i) => ({
  id: randomUUID(),
  collecteur_id: id,
  nom: `Client ${String(i + 1).padStart(3, '0')}`,
}));
const cartes = clients.map((c) => ({ id: randomUUID(), collecteur_id: id, client_id: c.id, mise: MISE }));
for (const [table, lignes] of [['clients', clients], ['cartes', cartes]]) {
  const { error: erreur } = await collecteur.from(table).insert(lignes);
  if (erreur) throw erreur;
}

// Les mises une à une, carte après carte : les déclencheurs de compteur l'imposent.
// Huit cartes à la fois.
let suivante = 0;
async function ouvrier() {
  while (suivante < cartes.length) {
    const k = cartes[suivante++];
    for (let m = 0; m < nbMises; m += 1) {
      const { error: erreur } = await collecteur.from('mises').insert({
        id: randomUUID(),
        collecteur_id: id,
        carte_id: k.id,
        montant: MISE,
        encaisse_le: new Date(Date.now() - (nbMises - m) * 60_000).toISOString(),
      });
      if (erreur) throw erreur;
    }
  }
}
await Promise.all(Array.from({ length: 8 }, ouvrier));

writeFileSync(join(import.meta.dirname, `compte-${role}.json`), JSON.stringify({ email, motDePasse, id }));
console.log(`compte ${role} : ${nbCartes} carte(s), ${nbMises} mise(s) chacune ; identifiants dans compte-${role}.json`);
```

Créer `$TMP/regard-j2b/compter.mjs` :

```js
// Compte, sur la pile locale, les lignes d'un collecteur. Aucun nom, aucune clé.
// Usage, depuis la racine : node "$TMP/regard-j2b/compter.mjs" "$TMP/regard-j2b/compte-regard.json"
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const { createClient } = createRequire(join(process.cwd(), 'package.json'))('@supabase/supabase-js');
const statut = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));
if (statut.API_URL !== 'http://127.0.0.1:54321') throw new Error(`Pile inattendue : ${statut.API_URL}`);
const admin = createClient(statut.API_URL, statut.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { id } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const table of ['clients', 'cartes', 'mises', 'caisses_jour', 'synchro_rejets']) {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('collecteur_id', id);
  if (error) throw error;
  console.log(`${table} : ${count}`);
}

// PostgREST ne rend jamais plus de `max_rows` lignes (1 000, supabase/config.toml) :
// une lecture sans `range` tronque en silence. Lire par pages, jusqu'à la page courte.
async function toutLire(table, colonnes) {
  const lignes = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await admin
      .from(table)
      .select(colonnes)
      .eq('collecteur_id', id)
      .order('id')
      .range(debut, debut + 999);
    if (error) throw error;
    lignes.push(...data);
    if (data.length < 1000) return lignes;
  }
}

// Les totaux, pour les comparer à ce que le téléphone montrait avant l'envoi.
const mises = await toutLire('mises', 'id, montant, carte_id');
const cartes = await toutLire('cartes', 'id, mises_encaissees');
const caisses = await toutLire('caisses_jour', 'id, date, cash_declare');
console.log(`somme des mises : ${mises.reduce((s, m) => s + m.montant, 0)}`);
const parCarte = new Map();
for (const m of mises) parCarte.set(m.carte_id, (parCarte.get(m.carte_id) ?? 0) + 1);
const incoherentes = cartes.filter((k) => (parCarte.get(k.id) ?? 0) !== k.mises_encaissees);
console.log(`cartes dont le compteur diffère du nombre de mises : ${incoherentes.length}`);
console.log(`caisses : ${caisses.map((c) => `${c.date} = ${c.cash_declare}`).join(' ; ') || 'aucune'}`);
```

Créer `$TMP/regard-j2b/cdp.mjs` :

```js
// Pilote l'onglet de regard d'un Chrome sans interface (port 9333), une commande à la fois.
// Usage : node cdp.mjs <commande> [arguments]
//   ouvrir [url]              naviguer (seulement http://localhost:5181)
//   attendre <texte> [ms]     attendre qu'un texte paraisse
//   texte                     le texte visible de la page
//   cliquer <texte>           cliquer le seul bouton ou lien de ce texte (ou aria-label)
//   saisir <libellé> <valeur> taper dans un champ
//   connecter <compte.json>   remplir Email et Mot de passe depuis le fichier, puis « Se connecter »
//   capture <fichier> [px]    capture pleine page à cette largeur (390 par défaut), et débordement
//   base                      bases kolek-collecteur-* : file, refus, taille de l'instantané
//   sw                        le service worker contrôle-t-il la page ?
//   mesurer <texte>           cliquer ce bouton et mesurer le temps jusqu'à l'entrée dans la file
//   hors-ligne                couper le réseau de l'onglet tant que ce processus vit
//   fermer                    fermer l'onglet
import { readFileSync, writeFileSync } from 'node:fs';

const PORT = 9333;
const ORIGINE = 'http://localhost:5181';
const [commande, ...args] = process.argv.slice(2);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function ongletDeRegard() {
  const liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page =
    liste.find((o) => o.type === 'page' && o.url.startsWith(ORIGINE)) ?? liste.find((o) => o.type === 'page');
  return page ?? (await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json());
}

const onglet = await ongletDeRegard();
const ws = new WebSocket(onglet.webSocketDebuggerUrl);
await new Promise((ok, ko) => {
  ws.onopen = ok;
  ws.onerror = ko;
});
let numero = 0;
const attentes = new Map();
const exceptions = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.method === 'Runtime.exceptionThrown') {
    exceptions.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
  }
  if (d.id !== undefined && attentes.has(d.id)) {
    attentes.get(d.id)(d);
    attentes.delete(d.id);
  }
};
const envoyer = (method, params = {}) =>
  new Promise((ok, ko) => {
    const id = ++numero;
    attentes.set(id, (d) => (d.error ? ko(new Error(`${method} : ${d.error.message}`)) : ok(d.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluer = async (expression) => {
  const r = await envoyer('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
await envoyer('Runtime.enable');
await envoyer('Page.enable');

const TEXTE = 'document.body ? document.body.innerText : ""';
const OUVRIR_BASE = `(nom) => new Promise((ok, ko) => { const r = indexedDB.open(nom); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); })`;
const DEMANDE = `(requete) => new Promise((ok, ko) => { requete.onsuccess = () => ok(requete.result); requete.onerror = () => ko(requete.error); })`;
const LIRE_BASES = `(async () => {
  const ouvrir = ${OUVRIR_BASE}; const demande = ${DEMANDE};
  const sortie = [];
  for (const { name } of await indexedDB.databases()) {
    if (!name || !name.startsWith('kolek-collecteur-')) continue;
    const db = await ouvrir(name);
    const instantane = await demande(db.transaction('tournee').objectStore('tournee').get('instantane'));
    sortie.push({
      base: name.slice(0, 25) + '…',
      file: await demande(db.transaction('file').objectStore('file').count()),
      refus: await demande(db.transaction('refus').objectStore('refus').count()),
      caracteresInstantane: instantane ? JSON.stringify(instantane).length : 0,
      lueLe: instantane ? instantane.lueLe : null,
    });
    db.close();
  }
  return sortie;
})()`;

async function cliquer(cible) {
  const r = await evaluer(`(() => {
    const cible = ${JSON.stringify(cible)};
    const trouves = [...document.querySelectorAll('button, a, [role="button"]')].filter(
      (e) => e.innerText.trim() === cible || e.getAttribute('aria-label') === cible);
    if (trouves.length !== 1) return String(trouves.length);
    if (trouves[0].disabled) return 'inactif';
    trouves[0].click();
    return 'ok';
  })()`);
  if (r !== 'ok') throw new Error(`« ${cible} » : ${r === 'inactif' ? 'bouton inactif' : `${r} élément(s), 1 attendu`}`);
}

async function saisir(libelle, valeur) {
  const trouve = await evaluer(`(() => {
    const libelle = ${JSON.stringify(libelle)};
    const l = [...document.querySelectorAll('label')].find((e) => e.textContent.trim().startsWith(libelle));
    const champ = l && (l.control ?? l.querySelector('input, textarea'));
    if (!champ) return false;
    champ.focus();
    if (champ.select) champ.select();
    return true;
  })()`);
  if (!trouve) throw new Error(`Champ introuvable : ${libelle}`);
  await envoyer('Input.insertText', { text: valeur });
}

try {
  switch (commande) {
    case 'ouvrir': {
      const url = args[0] ?? `${ORIGINE}/`;
      if (!url.startsWith(ORIGINE)) throw new Error(`Refusé : ${url} n'est pas sur ${ORIGINE}.`);
      await envoyer('Page.navigate', { url });
      await pause(2000);
      console.log(`ouvert : ${await evaluer('location.href')}`);
      break;
    }
    case 'attendre': {
      const fin = Date.now() + Number(args[1] ?? 15000);
      while (!(await evaluer(TEXTE)).includes(args[0])) {
        if (Date.now() > fin) throw new Error(`Absent : ${args[0]}`);
        await pause(200);
      }
      console.log(`vu : ${args[0]}`);
      break;
    }
    case 'texte':
      console.log(await evaluer(TEXTE));
      break;
    case 'cliquer':
      await cliquer(args[0]);
      await pause(800);
      console.log(`cliqué : ${args[0]}`);
      break;
    case 'saisir':
      await saisir(args[0], args[1] ?? '');
      console.log(`saisi : ${args[0]}`);
      break;
    case 'connecter': {
      const compte = JSON.parse(readFileSync(args[0], 'utf8'));
      await saisir('Email', compte.email);
      await saisir('Mot de passe', compte.motDePasse);
      await cliquer('Se connecter');
      console.log('connexion demandée');
      break;
    }
    case 'capture': {
      const px = Number(args[1] ?? 390);
      await envoyer('Emulation.setDeviceMetricsOverride', { width: px, height: 844, deviceScaleFactor: 2, mobile: true });
      await pause(800);
      const deborde = await evaluer('document.documentElement.scrollWidth > innerWidth');
      const { data } = await envoyer('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      writeFileSync(args[0], Buffer.from(data, 'base64'));
      console.log(`capture ${args[0]} à ${px} px ; débordement horizontal : ${deborde}`);
      break;
    }
    case 'base':
      console.log(JSON.stringify(await evaluer(LIRE_BASES), null, 2));
      break;
    case 'eval':
      // Lire un état de la page ; la seule action permise est la navigation (écart 51).
      console.log(JSON.stringify(await evaluer(args[0]), null, 2));
      break;
    case 'sw':
      console.log(`service worker aux commandes : ${await evaluer('Boolean(navigator.serviceWorker && navigator.serviceWorker.controller)')}`);
      break;
    case 'mesurer': {
      const ms = await evaluer(`(async () => {
        const ouvrir = ${OUVRIR_BASE}; const demande = ${DEMANDE};
        const bases = [];
        for (const { name } of await indexedDB.databases()) {
          if (name && name.startsWith('kolek-collecteur-')) bases.push(await ouvrir(name));
        }
        const compter = async () => {
          let total = 0;
          for (const db of bases) total += await demande(db.transaction('file').objectStore('file').count());
          return total;
        };
        const avant = await compter();
        const cible = ${JSON.stringify(args[0])};
        const trouves = [...document.querySelectorAll('button')].filter((e) => e.innerText.trim() === cible);
        if (trouves.length !== 1) return 'bouton ' + trouves.length;
        const t0 = performance.now();
        trouves[0].click();
        while (performance.now() - t0 < 10000) {
          if ((await compter()) > avant) { bases.forEach((db) => db.close()); return Math.round(performance.now() - t0); }
          await new Promise((r) => setTimeout(r, 5));
        }
        bases.forEach((db) => db.close());
        return 'rien en file après 10 s';
      })()`);
      console.log(`appui jusqu'à la file : ${ms}${typeof ms === 'number' ? ' ms (borne haute : la lecture du compte s’y ajoute)' : ''}`);
      break;
    }
    case 'hors-ligne':
      await envoyer('Network.enable');
      await envoyer('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      console.log('Onglet hors ligne. Arrêter ce processus rend le réseau à l’onglet.');
      // La coupure tombe dès qu'une autre session CDP s'attache à l'onglet
      // (navigator.onLine repasse à true) : la réappliquer tant que ce processus vit.
      setInterval(() => {
        void envoyer('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      }, 250);
      await new Promise(() => {});
      break;
    case 'fermer':
      await fetch(`http://127.0.0.1:${PORT}/json/close/${onglet.id}`);
      console.log('onglet fermé');
      break;
    default:
      throw new Error(`Commande inconnue : ${commande}`);
  }
} finally {
  if (exceptions.length > 0) console.log('EXCEPTIONS DE LA PAGE :', exceptions);
  ws.close();
}
```

Préparer le compte du regard, puis lancer Chrome (en arrière-plan, profil jetable) :

```bash
node "$TMP/regard-j2b/preparer.mjs" regard 3 1
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=9333 --window-size=390,844 --user-data-dir="C:/Users/M.BERTHE/AppData/Local/Temp/kj2b" --no-first-run about:blank
```

Dans la suite, `C` désigne `node "$TMP/regard-j2b/cdp.mjs"`. Les libellés de boutons que ce plan ne fixe pas se lisent par `C texte` avant de cliquer.

- [ ] **Étape 4 : le regard, en ligne puis sans réseau**

**En ligne.**

1. `C ouvrir`, `C attendre "Se connecter"`, `C connecter "$TMP/regard-j2b/compte-regard.json"`. **Corrigé après exécution (écart 51)** : l'application s'ouvre sur « Clients » (écran initial antérieur à J2b), pas sur l'accueil. En sans-interface, deux barres de navigation coexistent, et `C cliquer "Accueil"` en trouve deux : cliquer la dernière par `C eval "(() => { const b = [...document.querySelectorAll('button, a')].filter((e) => e.innerText.trim() === 'Accueil'); b.at(-1).click(); return b.length; })()"`. Puis `C attendre "ENCAISSÉ AUJOURD’HUI"` : `innerText` rend les capitales de la feuille de style. Un titre qui n'apparaît pas se lit d'abord par `C texte`.
2. `C sw` — attendu `true` (relancer `C ouvrir` une fois si `false` : le service worker prend la main à son activation).
3. `C base` — attendu : une base, `file: 0`, `lueLe` non nul.

**Coupure.** Les deux, et dans cet ordre : la passerelle de la pile, qui coupe aussi le service worker (précision 12) ; puis l'onglet, pour que `navigator.onLine` dise faux.

```bash
docker stop supabase_kong_Kolek
node "$TMP/regard-j2b/cdp.mjs" hors-ligne
```

La seconde commande tourne en arrière-plan jusqu'à l'étape 6.

4. Encaisser une mise depuis l'accueil (« Encaisser sur la carte de Client 00x », puis la confirmation lue par `C texte`).
5. Inscrire un client avec sa carte (« Souscrire »).
6. Ouvrir une carte à un client existant, depuis sa fiche.
7. Déclarer la caisse (« Rapproch. »).
8. `C texte` — attendu sur l'accueil : `Hors ligne · 1 mise, 1 client, 1 carte et 1 déclaration de caisse en attente d’envoi`. Sur la liste des clients : `Pas encore envoyé` sur le client inscrit, `Carte pas encore envoyée` sur l'autre. Sur « Plus » : `4 opérations sur ce téléphone pas encore envoyées.`
9. Déconnexion (bouton « Se déconnecter » de l'accueil) — attendu : `4 opérations pas encore envoyées. Retrouve du réseau avant de te déconnecter.`, et l'écran reste sur la coquille.
10. La fiche du client encaissé au point 4 — attendu, sous sa carte : `1 mise de cette carte pas encore envoyée.`, et le bouton de retrait inactif. L'écran « Retrait » lui-même lit le serveur — attendu : `Cet écran demande le réseau.`
11. `C capture "$TMP/regard-j2b/accueil-390.png" 390` — attendu `débordement horizontal : false`. **Regarder l'image.**
12. `C base` — attendu `file: 4`.

- [ ] **Étape 5 : rouvrir l'application sans serveur ni réseau**

1. `C fermer`, puis arrêter le maintien hors ligne : son onglet n'existe plus.
2. Arrêter le serveur de prévisualisation (la tâche d'arrière-plan de l'étape 3). `curl -s -o /dev/null -w "%{http_code}" http://localhost:5181/` doit rendre `000`.
3. Relancer `node "$TMP/regard-j2b/cdp.mjs" hors-ligne` en arrière-plan : ne trouvant aucun onglet, il en ouvre un vierge et lui coupe le réseau.
4. `C ouvrir` (il reprend cet onglet vierge), puis `C attendre "Hors ligne ·" 30000` (écart 51 : l'écran initial est « Clients », le bandeau y figure aussi).
5. `C base` — attendu `file: 4`, `lueLe` inchangé. `C texte` — attendu : le même bandeau qu'au point 8.

La coquille doit venir du cache du service worker. **Si la page ne se charge pas, s'arrêter** : c'est le critère §1.3 qui tombe, et la correction touche la PWA — la décider avec l'exploitant, pas dans l'élan.

Contrôle en trois états (mémoire « regard par Chrome ») pour chaque phrase qui surprend : le fichier sur le disque, le paquet construit (`grep -lF "<phrase>" "$TMP/dist-j2b/assets/"*.js`), le texte de la page.

- [ ] **Étape 6 : le retour du réseau**

**Corrigé après exécution (écart 52).** La première version de `compter.mjs` lisait mises, cartes et caisses sans `range` : PostgREST ne rend jamais plus de `max_rows` lignes (1 000, `supabase/config.toml`). Sur la mesure de l'étape 7, elle affichait « somme 1 000 000 » et 284 cartes incohérentes pour 9 000 mises justes. La version ci-dessus lit par pages ; éprouvée le 2026-09-15 contre un recompte SQL (`docker exec supabase_db_Kolek psql`) : 9 000 mises, 9 000 000, 0 carte incohérente des deux côtés. Une perte annoncée par ce script se recompte en SQL avant d'y croire.

1. Arrêter le maintien hors ligne (tâche d'arrière-plan). `docker start supabase_kong_Kolek`. Relancer le serveur de prévisualisation (commande de l'étape 3).
2. `C ouvrir`, puis `C base` toutes les dix secondes — attendu : `file: 0` en moins de deux minutes.
3. `node "$TMP/regard-j2b/compter.mjs" "$TMP/regard-j2b/compte-regard.json"` — attendu : `clients : 4`, `cartes : 5`, `mises : 4`, `caisses_jour : 1`, `synchro_rejets : 0` ; `somme des mises` égale à 3 000 (les mises de la préparation) plus le montant encaissé au point 4 ; `cartes dont le compteur diffère du nombre de mises : 0` ; la caisse du jour égale au montant déclaré au point 7. Chaque geste une fois, aucun en double, les totaux du serveur égaux à ceux du téléphone (§9.4).
4. `C texte` — attendu : plus de bandeau, plus aucun « pas encore envoyé ».
5. Déconnexion — attendu : l'écran de connexion, sans avis (`C texte` ne contient pas « attendent sur ce téléphone »).

- [ ] **Étape 7 : mesurer la limite du document unique**

L'instantané est un seul document, réécrit à chaque acceptation (écart relevé plus bas). La mesure dit s'il tient une grosse tournée.

```bash
node "$TMP/regard-j2b/preparer.mjs" mesure 300 30
```

1. `C connecter "$TMP/regard-j2b/compte-mesure.json"`, puis `C base` jusqu'à `lueLe` non nul (écart 51 : aucun écran n'affiche « 300 cartes actives » ; le chargement complet prend ~9 s sur la pile locale).
2. `C base` — relever `caracteresInstantane`.
3. Ouvrir la fiche d'un client, puis `C mesurer "<libellé exact du bouton d'encaissement, lu par C texte>"` — relever la durée.
4. Déconnexion refusée tant que la mise est en file ; attendre `file: 0` par `C base`, puis se déconnecter.

Consigner les deux nombres dans le compte rendu. Au-delà de **250 ms** sur ce poste pour l'appui (un téléphone d'entrée de gamme est plusieurs fois plus lent), ou de **5 000 000** caractères d'instantané : ne pas livrer, et présenter la mesure à l'exploitant avec le découpage de l'instantané comme chantier.

Fin du regard : arrêter Chrome, le serveur de prévisualisation, et s'assurer que `supabase_kong_Kolek` tourne (`docker ps --filter name=supabase_kong_Kolek`). Les comptes créés vivent dans la pile locale ; le prochain `db:reset` les efface.

- [ ] **Étape 8 : fusionner sur `main` — sur accord de l'exploitant**

Présenter d'abord le compte rendu des étapes 1 à 7. Puis, **sur accord explicite** :

```bash
git checkout main
git merge --no-ff hors-ligne-j2b -m "Merge branch 'hors-ligne-j2b'"
npm run verifier
git diff --stat HEAD^1 HEAD -- supabase/migrations supabase/functions
```

`--no-ff` garde un commit de fusion : c'est lui que le retour arrière annule. Attendu : `verifier` vert, `diff` vide — donc aucune Edge Function ne partira en production avec la poussée.

- [ ] **Étape 9 : pousser — sur accord de l'exploitant**

Relever ce que sert la production **avant** :

```bash
curl -s https://app.kolek.cash/ | grep -o '/assets/index-[^"]*\.js'
```

Puis, **sur accord explicite**, pousser par PowerShell (l'outil Bash est refusé par le classificateur) :

```powershell
git push origin main
```

Netlify bâtit le collecteur. Une à deux minutes après :

```bash
npm run build -w @kolek/collecteur
ls apps/collecteur/dist/assets/index-*.js
grep -lF "Refusées par le serveur" apps/collecteur/dist/assets/*.js
curl -s https://app.kolek.cash/ | grep -o '/assets/index-[^"]*\.js'
```

La construction locale lit `apps/collecteur/.env`, comme Netlify : elle ne touche pas la production. Attendu : le marqueur est dans le paquet local ; le nom d'`index-*.js` servi a changé et égale le local. S'il diffère, suivre la mémoire « déploiement des fronts » (télécharger le fichier servi sous un nom unique et le comparer par `cmp`) avant de conclure quoi que ce soit.

La clé de session est celle que supabase-js calculait déjà (épreuve de la tâche 11) : la mise à jour ne déconnecte personne.

- [ ] **Étape 10 : le téléphone pilote — avec l'exploitant**

1. **Avant de couper le réseau**, chaque collecteur ouvre l'application **une fois connecté** après la mise à jour : c'est ce qui charge sa tournée sur le téléphone. Sans ce premier chargement, les écrans de collecte disent « Ta tournée n’est pas encore sur ce téléphone » — rien n'est perdu, rien n'est encaissable non plus.
2. Une journée de tournée sans réseau sur un téléphone pilote, puis retour du réseau : le bandeau se vide, « Plus » ne compte plus rien.
3. Les refus : l'écran « Santé du système » de l'administration porte déjà `rejets_non_traites`. À défaut, une requête agrégée, **SELECT seul**, qui ne rend qu'un nombre :

```bash
npx supabase db query --linked "select count(*) as rejets_non_traites from public.synchro_rejets where not traite"
```

Un refus apparu : le lire dans « Alertes » sur le téléphone concerné, avec le collecteur. Ne rien supprimer : c'est de l'argent qui a changé de main.

---

## Retour arrière

Aucune table, aucun droit, aucune fonction n'a changé : il n'y a rien à défaire côté serveur. Les lignes de `synchro_rejets` écrites par J2b restent — ce sont de vrais refus, à traiter.

**Avant d'annuler, vérifier que la file de chaque téléphone pilote est vide** (« Plus » n'affiche aucune ligne « opérations sur ce téléphone pas encore envoyées », l'accueil aucun bandeau). La version d'avant J2b ne lit pas la base du téléphone : une opération restée en file y dormirait, intacte mais invisible, jusqu'au redéploiement de J2b. Si un téléphone a encore une file et qu'on doit annuler malgré tout, le dire à l'exploitant, et demander au collecteur de **ne pas effacer les données du site ni désinstaller l'application**.

Puis, sur accord explicite :

```bash
git checkout main
git revert -m 1 <commit de fusion de l'étape 8>
npm run verifier
```

```powershell
git push origin main
```

Netlify redéploie le front seul. La base IndexedDB reste sur les téléphones, inerte. La clé de session n'ayant pas changé, personne n'est déconnecté par l'annulation.

---

## Écarts relevés

Ce que ce plan fait autrement que la spec, ou qu'elle ne disait pas. **Soumis à l'exploitant avec le plan.**

1. **Les treize précisions** en tête de ce plan.
2. **La session gardée n'est reprise que sur un échec réseau** (tâche 11). Un refus du serveur — compte supprimé, mot de passe changé — renvoie à la connexion, même avec une session sur le disque.
3. **La coquille n'affiche aucun écran avant que le moteur ait démarré** (tâche 11). React lance les effets des enfants avant ceux du parent : sans cette attente, le premier écran lirait la tournée avant que le moteur sache de quel collecteur il s'agit.
4. **Une tournée jamais chargée le dit** (tâche 12) : « Ta tournée n’est pas encore sur ce téléphone… » au lieu d'une liste vide, qui aurait fait croire à un carnet disparu.
5. **Le bandeau compte toute la file**, en attente et refus à consigner (tâche 14). Sinon il dirait « rien en attente » à un collecteur dont la déconnexion est refusée.
6. **La fiche client ne compte le jour qu'une fois la mise sur le disque** (tâche 15). L'affichage optimiste d'avant J2b disparaît : §4.1 appliqué à la lettre.
7. **« Enregistrement incertain sur ce téléphone. Vérifie la carte avant de réessayer. »** quand l'écriture locale lève au lieu de répondre (tâche 15), et une phrase de même prudence pour l'ouverture de carte (tâche 16). On ne sait pas si l'écriture a eu lieu : « Rien n’a été compté » pourrait être faux.
8. **« La souscription arrive au jalon J2. » retirée** de la liste des clients (tâche 12) : elle datait d'avant la souscription.
9. **Hors ligne, la fiche ne montre plus les mises des cartes clôturées** (tâche 12) : la tournée est bornée (§5.1). L'historique complet reste accessible en ligne.
10. **La pagination réseau quitte les écrans pour `rafraichir`** (tâche 12, précision 11), et sa preuve contre le vrai PostgREST passe dans `supabase/tests/lectures-paginees.test.ts`.
11. **Les alertes comptent les refus à part** (« 1 refusée ») des « choses à faire » (tâche 17) : J2b n'offre aucune action sur un refus. Sans réseau et sans refus, le sous-titre dit « Réseau requis » et non « Rien d’urgent ».
12. **L'avertissement des 75 jours nomme ce qui attend** (tâche 17) : « Une inscription attend depuis 80 jours » quand c'est une inscription. La spec n'écrivait que le cas d'une mise.
13. **Sur « Plus », l'avertissement du stockage vit dans la carte « Application »** (tâche 17), visible dès que la fiche du collecteur est lue sur le téléphone.
14. **Le message du filet de l'application change** (tâche 18) : « ce qui est enregistré sur ce téléphone y reste jusqu’à son envoi ».
15. **Limite connue : l'instantané est un document unique**, réécrit à chaque acceptation. Mesuré en tâche 19 sur 300 cartes de 30 mises ; au-delà des seuils de l'étape 7, le découper est un chantier à part.
16. **Un compte de refus peut compter une fois de trop, le temps d'une passe** : si la consignation arrive au serveur mais que la transaction locale qui retire l'opération échoue, `EtatFile.refusees` compte l'opération deux fois jusqu'à la passe suivante. La liste des alertes, elle, ne la montre qu'une fois (tâche 17).
17. **Après la mise à jour, une ouverture en ligne est nécessaire** avant la première tournée sans réseau (tâche 19, étape 10) : la tournée n'existe sur le téléphone qu'une fois chargée.
18. **Hors périmètre** : l'écart 5 de l'audit (mouvements et rattrapages), et toute action sur un refus.

### Relevés pendant l'exécution (19 à 52)

Présentés à l'exploitant le 2026-09-15, après la mise en ligne (`831036f`). « Décidé » renvoie à une question posée pendant le chantier ; les autres sont des corrections du texte de ce plan, sans effet sur le comportement voulu.

19. **Une réponse ne vaut preuve que sur son statut** (tâche 6, décidé « Exiger 201 »). postgrest-js 2.112.3 réécrit un 404 au corps vide en `{ error: null, status: 204 }` : une insertion serait prise pour acceptée sans être au serveur. Insertion exigée en 201, relecture en 200 sans tableau, mise à jour de caisse en 200 avec tableau. `e179931`.
20. **`dans` avorte la transaction quand le travail échoue, et compter ne crée aucune base** (tâche 4, décidé « Durcir »). `2f2d089`.
21. **Épreuve contradictoire de `avancer`** (tâche 5) : corrigée sur place.
22. **Seules les erreurs du stockage deviennent `STOCKAGE`** (tâche 5, décidé « Séparer ») : `DOMException` et `QuotaExceededError` ; toute autre exception devient `INCONNU` et se journalise. `e417613`, `7c6e6dd`.
23. **Un refus sans motif reconnu dit « Le serveur a refusé cette opération. »** (tâche 5, décidé « Phrase neutre ») au lieu de « cinq fois sans motif reconnu ». `e417613`.
24. **`DOUBLON` arrive sous `23505` en 409**, pas en `P0001` (tâche 6, `mises_avant_insert`) : corrigé sur place.
25. **`envoyerMise` en `async`** (tâche 6) : un `PostgrestBuilder` n'est qu'un `PromiseLike`, `.then` ne typait pas. Corrigé sur place.
26. **Une inscription rejouée se relit par `collecteur_id`**, pas par le nom (tâche 6, décidé « Comparer collecteur ») : le nom se modifie ailleurs. `e8713bf`.
27. **L'identité se revérifie avant tout refus ou tentative** (tâche 7, décidé « Revérifier »). `692f22d`.
28. **Une échéance impossible est ramenée à maintenant** (tâche 7, décidé « Borner ») : au-delà de dix minutes et sa marge, une horloge reculée bloquait la file. `692f22d`.
29. **Les enfants d'un parent refusé sont marqués `PARENT_REFUSE` dans la même transaction** (tâche 7, décidé « Marquer les enfants »). `692f22d`.
30. **Une lecture du rechargement ne vaut preuve que sur 200 ou 206** (tâche 8, même règle que l'écart 19) : un 404 réécrit en 204 aurait écrit une tournée vide. `51b0dcd`.
31. **`tablePanne` : conversion par `unknown`** (tâche 8, TS2322) : corrigé sur place.
32. **Épreuve du moteur instable à froid** (tâche 10) : corrigée sur place.
33. **Délai de 30 s sur les requêtes** (tâche 10, décidé « Délai 30 s », posé en tâche 11).
34. **Un rechargement demandé reste dû jusqu'à ce qu'il aboutisse** (tâche 10, décidé « Garder la demande »). `1d7bddb`.
35. **Les pannes de la passe et du rechargement se journalisent** (tâche 10, décidé « Journaliser »). `1d7bddb`.
36. **Le délai ne couvre que les requêtes de données** (tâche 11), par `db.timeout` (`DELAI_REQUETE_MS = 30 000`). Les fonctions en sont exclues : `encaisserPour` tire un nouvel identifiant à chaque appel, une relance après délai pourrait encaisser deux fois. La connexion aussi : couper un renouvellement de session peut révoquer la session. La session reste bornée par `verifierSession` et `renouvelerSession`. Écart à la décision de l'écart 33, **validé par l'exploitant le 2026-09-15 (« Garder »)**. `3e11732`, `a7317b1`.
37. **`localStorage` des épreuves du collecteur** (tâche 11) : corrigé sur place.
38. **L'attente de session est bornée** (tâche 11, décidé « Borner l'attente ») : 30 s pour vérifier ou renouveler, 5 s au démarrage, renouvellement anticipé cinq minutes avant l'expiration. `a7317b1`, `07aa00b`.
39. **La tournée s'efface aussi pour une session révoquée application fermée, ou un autre compte** (tâche 11, décidé « Effacer aussi ces cas »). `a7317b1`.
40. **Les épreuves ne peuvent plus joindre la production** (tâche 12, décidé « Poser la garde ») : Vitest chargeait l'URL et la clé de `.env`. `test.env` vers `127.0.0.1:9` dans les trois `vitest.config`, et une épreuve de garde par application. `6014efc`.
41. **La caisse du jour suit chaque mise acceptée** (tâche 13, décidé « Suivre chaque mise ») ; sans ligne du serveur, l'attendu est toujours provisoire. `c858944`.
42. **La caisse compte ce que la main a encaissé**, par `encaisse_par` et `restitue_par`, pas par la propriété des cartes (tâche 13, décidé « Compter la main »). `c858944`.
43. **Un refus n'attend plus sur la carte, et l'annulation se reconnaît par `operationId`** (tâche 15, décidés « Ne compter que l'attente » et « Corriger »). `21a2af3`.
44. **Le retrait est gardé jusqu'au geste** (tâche 16, décidés « Garder jusqu'au geste » et « Corriger la lecture ») : une file non lue bloque (« Opérations du téléphone pas encore vérifiées. »), une lecture en échec lève, le filtre par client ne dit plus « aucune carte » sur une liste non lue. `fdc71bf`, `1851ffb`.
45. **En-tête du cache** (tâche 18) : corrigé sur place.
46. **Au-delà de 90 jours, l'avertissement change** (tâche 17, décidé « Corriger ») : « passé 90 jours, le serveur refuse une mise ou une caisse, et le refus reste lisible dans les alertes ». Le serveur ne borne que les mises et les caisses. `b513dec`.
47. **Fiche et commission alignées** (tâche 17, décidé « Aligner maintenant ») : « Fiche indisponible sur ce téléphone. Connecte-toi une fois au réseau pour la charger. » `b513dec`.
48. **Les neuf transactions d'écriture en `durability: 'strict'`** (revue finale, décidé « Strict avant fusion »), et la trace des pannes du rafraîchissement. Une épreuve compte les écritures et leur mode. `519e6d1`.
49. **Garde-fou de la construction** (tâche 19, étape 2) : corrigé sur place.
50. **Servir et ouvrir Chrome** (tâche 19, étape 3) : corrigé sur place.
51. **Écran initial, casse, navigation et coupure du regard** (tâche 19, étapes 3 à 7) : corrigés sur place.
52. **Comptage non paginé** (tâche 19, étape 6) : corrigé sur place.

**Inexactitudes mineures du texte, laissées en l'état :** le rouge attendu à l'étape 3 de la tâche 12 ; celui de l'étape 9 de la tâche 14 (constaté : `TypeError` sur les 19 épreuves) ; `crlf.mjs` refuse un fichier réécrit en entier par Write (préférer Edit) ; la tâche 15 annonce 9 épreuves du sursis pour 8 écrites, et 23 pour les vues quand il y en a 25 (les deux de plus viennent du correctif de la tâche 13) ; le contrôle de l'étape 12 de la tâche 17 oubliait `commission.ts` et `FicheClient.tsx` (réglés par l'écart 47) ; le compte « 29 fichiers » de la tâche 18 (87 lignes sur 42 fichiers), dont le motif ne cherche ni « hors-ligne » ni « synchro ».

### Reportés au chantier suivant

Relevés en relecture ou au regard, jugés sans perte d'argent ni de données. À la revue finale, l'exploitant n'a retenu avant fusion que la trace du rafraîchissement (écart 48) ; le reste attend le chantier suivant :

- « Prévenir » de la liste des clients n'est pas gardé par la file (`Clients.tsx`).
- L'alerte au premier lancement (`Accueil.tsx`) — **pas reproduit le 2026-09-17**, à préciser : profil neuf, `persisted()` à `false`, l'avis s'affiche une fois puis se tait quand on revient sur l'accueil, et `Profil` le porte en permanence — conforme à §8.7. Seul écart consigné, sans tâche : `stockageDejaSignale` est une variable de module, donc un relais de collecteur sans rechargement de page ne le revoit pas (Docs/plans/2026-09-16-attente-et-messages.md).
- Une écriture dans la file juste après un effacement subi de la tournée (`file.ts`, `moteur.ts`).
- Un enfant encore en sursis quand son parent est refusé (`PARENT_REFUSE`, `FicheClient.tsx`).
- Le commentaire du 42501 sous `anon` (`synchroniseur.ts`).
- Deux onglets ouverts sur le même compte.
- Les angles morts de l'épreuve de durabilité (raccourcis `idb`, sous-dossiers, `.tsx`).
- La fiche d'un client sur une tournée jamais chargée dit « Fiche introuvable » au lieu de « pas encore sur ce téléphone ».
- L'avis rouge de déconnexion reste affiché — **pas reproduit le 2026-09-17**, à préciser : l'état ne vient que de `FicheClient.tsx:763`, atteint si `collecteurId` est absent, ce que le montage de `Coquille` interdit. Les deux autres échecs d'encaissement restent bien affichés jusqu'à « Réessayer » — ils n'ont rien écrit, c'est voulu.
- Hors ligne, file vide, l'écran Retrait reste vide ~7 s (trois relances de postgrest-js).
- Le commentaire d'`Abonnement.tsx` (« seul geste qui exige le réseau ») est faux.

**Clos le 2026-09-17 :** « La borne `integer` de `cash_declare` (`gestes.ts`) »,
par `Docs/specs/2026-09-17-borne-caisse-design.md` et son plan. Le téléphone
laissait passer un montant que la colonne ne porte pas ; PostgreSQL rendait
`22003`, que `classer` ne lisait pas, donc `inconnu` — le seul classement qui
arrête la passe. Huit minutes et demie pendant lesquelles les mises encaissées
derrière la déclaration ne partaient pas, puis le motif `INCONNU`. Livré sur
`main` en `e86b0ae`.

**Clos le 2026-09-17 :** « Le bandeau « Envoi en cours » ne montre aucun
progrès ». Reproduit sur la pile locale avant d’être touché : quatre mises
posées hors ligne, retour en ligne avec 1 500 ms de latence par requête, le
bandeau a tenu « Envoi en cours · 4 restantes » onze secondes puis a disparu
d’un coup. `signalerChangement()` n’était appelé qu’au rappel de fin de passe.
`passe` annonce maintenant chaque opération sortie de la file. Le même regard,
après : 4, 3, 2, 1, puis plus de bandeau. Tâche 4 de
`Docs/plans/2026-09-16-attente-et-messages.md`.
