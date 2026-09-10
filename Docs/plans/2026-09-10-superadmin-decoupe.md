# Découper `SuperAdmin.tsx` — plan d'implémentation

> **Pour un exécutant :** les étapes sont cochables (`- [ ]`). Elles se suivent
> dans l'ordre. Chaque tâche finit par un commit et laisse le dépôt vert.

**But :** ramener `SuperAdmin.tsx` de 1 714 lignes à ~250, sans changer une
seule ligne de comportement, et en le prouvant plutôt qu'en l'affirmant.

**Architecture :** un dossier `apps/admin/src/ecrans/superadmin/`, un fichier
par onglet. `SuperAdmin.tsx` ne garde que la coquille, l'aiguillage sur
`onglet`, l'export CSV et les deux pastilles partagées. Les composants extraits
prennent déjà des propriétés explicites — le découpage est un déplacement de
texte, pas une refonte.

**Outillage :** React 19, Vite 8, Vitest 4, oxlint, TypeScript 7.

---

## Ce que ce plan corrige à la recommandation précédente

La recommandation du 2026-09-10 disait « pas maintenant, on découpe l'onglet
qu'on touche quand on le touche ». Elle partait d'un mauvais diagnostic : elle
traitait **la taille** comme le risque.

La taille n'est pas le risque. Trois mesures faites ce jour-là le montrent :

1. Les onze `describe` de `SuperAdmin.test.tsx` couvrent les **neuf**
   composants du fichier. Le filet existe.
2. Aucune épreuve ne nomme un interne — toutes pilotent par
   `<SuperAdmin>`. Un déplacement de fichier ne peut donc casser aucune
   d'elles.
3. Chaque composant reçoit des propriétés explicites et ne ferme sur rien du
   parent. Les frontières du découpage sont déjà écrites.

Un fichier gros dont les frontières sont nettes et le filet posé n'est pas un
risque : c'est un inconfort de lecture.

**Le risque est ailleurs, et il a été trouvé en cherchant.** Ligne 244,
`SuperAdmin` exporte en CSV le nom, le téléphone, la zone, le palier, le prix,
le statut, l'échéance et le nombre de clients de **tous** les collecteurs.
Aucune épreuve ne touche ce chemin — `csv`, `Csv`, `CSV`, `exporter` ne
paraissent nulle part dans les 963 lignes d'épreuves.

Et `versCsv` ne vérifie **aucune arité** :

```ts
export function versCsv(entetes: string[], lignes: Array<Array<unknown>>): string {
  return [entetes, ...lignes].map((ligne) => ligne.map(champ).join(';')).join('\r\n');
}
```

En-têtes et cellules sont assemblés séparément. Ajouter une colonne à l'un sans
l'autre rend un CSV **valide** dont les colonnes sont décalées : les téléphones
sous « Zone », les échéances sous « Statut ». Personne ne le voit à l'écran, et
le fichier part par courriel.

C'est ce chemin-là qu'il faut couvrir, et il faut le couvrir **avant** de
déplacer quoi que ce soit — c'est précisément pendant un découpage qu'une
colonne se perd.

## Ce qui rend ce plan « sans risque », concrètement

Trois dispositifs, dont le deuxième est le cœur.

**Un.** La tâche 1 ne déplace rien. Elle ajoute l'épreuve qui manque. Si elle
révèle un défaut existant, on l'apprend sur un dépôt qu'on n'a pas encore
remué.

**Deux — l'échafaudage d'empreintes.** La tâche 2 prend une empreinte du DOM
rendu des **six onglets**, avant tout déplacement. Les tâches 3 à 8 déplacent
du code ; à chacune, ces empreintes doivent rester **identiques au bit près**.
Un déplacement de texte qui change le rendu n'est pas un déplacement de texte.

> **La règle absolue de ce plan :** une empreinte qui diffère est un **défaut**,
> jamais une empreinte à mettre à jour. `vitest -u` est **interdit** des tâches
> 3 à 8. Si une empreinte bouge, on revient en arrière et on cherche pourquoi.

**Trois.** Une tâche par composant, un commit par tâche, du plus autonome au
plus lié. `git revert` d'un seul commit défait une seule extraction.

## Ce que ce plan ne corrige pas, et qu'il ne faut pas croire réglé

`superadmin/Abonnements.tsx` fera encore **~610 lignes** — troisième plus gros
fichier du dépôt. Le découpage par onglet ne résout pas `OngletAbonnements`,
qui mêle le filtrage, la pagination et le tableau. Le sortir demanderait un
second découpage, **par responsabilité et non par onglet**, et il n'est pas
dans ce plan.

Annoncer « `SuperAdmin` est réglé » à la fin de la tâche 9 serait inexact.
Ce qui sera vrai : le fichier passe de 1 714 à ~250 lignes, et six des sept
morceaux tiennent sous 300.

---

## Contraintes globales

- **Aucun changement de comportement.** Pas une classe, pas un mot, pas un
  espace dans le JSX déplacé. Renommer, reformater ou « améliorer au passage »
  est hors de ce plan — c'est ce qui rend l'échafaudage d'empreintes capable de
  prouver quelque chose.
- **`vitest -u` interdit** dans les tâches 3 à 8. Voir la règle absolue.
- **Aucune épreuve ne doit importer un interne.** Elles pilotent par
  `<SuperAdmin>` aujourd'hui ; c'est ce qui rend le découpage invisible pour
  elles, et il faut que ça le reste.
- **Le sous-dossier `superadmin/` n'est pas une préférence, il est imposé.**
  `apps/admin/src/ecrans/Abonnements.tsx` **existe déjà** — c'est l'écran
  Abonnements de l'administration ordinaire. Un fichier plat pour l'onglet
  Abonnements du Super Admin porterait le même nom. Même remarque pour
  `Reglages.tsx`. Le dossier lève la collision.
- Chaque tâche finit sur `npm test --workspace apps/admin` vert et un commit.
- La chaîne complète (`npm run verifier`) ne tourne qu'à la tâche 9 : elle
  prend une vingtaine de minutes, et les épreuves d'`apps/admin` suffisent à
  chaque pas.

---

## Structure de fichiers visée

| Fichier | ~lignes | Contenu |
|---|---|---|
| `ecrans/SuperAdmin.tsx` | 250 | coquille, `ONGLETS`, aiguillage, `exporter()`, `PastillePalier`, `PastilleStatut`, `dateLisible`, `mrrLisible` |
| `ecrans/superadmin/Abonnements.tsx` | 610 | `OngletAbonnements`, `MenuLigne`, `FILTRES`, `FiltreStatut`, `LARGEUR_MINIMALE_ABONNES` |
| `ecrans/superadmin/Promos.tsx` | 275 | `CodesPromo`, `Remises`, `LIBELLE_STATUT`, `TEINTE_STATUT` |
| `ecrans/superadmin/Journal.tsx` | 165 | `Journal`, `horodatage`, `Pastille` |
| `ecrans/superadmin/Paiement.tsx` | 135 | `Paiement`, `BOUTIQUE` |
| `ecrans/superadmin/Administrateurs.tsx` | 95 | `Administrateurs` |
| `ecrans/superadmin/Plateforme.tsx` | 75 | `Plateforme`, `LIBELLES_VOLUMES` |

`dateLisible` et `mrrLisible` sont appelés par **cinq** des sept fichiers. Ils
restent dans `SuperAdmin.tsx` et sont **exportés** ; les extraits les importent.
Les dupliquer serait le seul vrai défaut que ce découpage pourrait introduire.

---

### Tâche 1 : couvrir l'export CSV — avant tout déplacement

**Fichiers :** Test `apps/admin/src/ecrans/SuperAdmin.test.tsx` (ajout en fin
de fichier). Aucun fichier de production modifié.

**Interfaces :** aucune. Épreuve de caractérisation pure.

- [ ] **Étape 1 : écrire l'épreuve**

Le montage de `jsdom` est copié de `apps/admin/src/ecrans/Collecteurs.test.tsx`
(lignes 153-190), qui exerce déjà un export : `jsdom` n'implémente ni
`URL.createObjectURL` ni `URL.revokeObjectURL`, et `telechargerCsv` appelle les
deux. Le `Blob` est intercepté parce que c'est le seul endroit où le contenu
passe en clair.

```tsx
/**
 * L'export CSV des abonnés — le seul chemin de ce fichier qu'aucune épreuve ne
 * touchait avant le 2026-09-10.
 *
 * Il sort le nom, le téléphone, la zone, le palier, le prix, le statut,
 * l'échéance et le nombre de clients de **tous** les collecteurs. `versCsv` ne
 * vérifie aucune arité : en-têtes et cellules sont assemblés séparément.
 * Ajouter une colonne à l'un sans l'autre rend un CSV valide dont les colonnes
 * sont décalées — les téléphones sous « Zone ». Rien ne se voit à l'écran, et
 * le fichier part par courriel.
 *
 * Cette épreuve est écrite **avant** le découpage, et c'est tout son intérêt :
 * c'est pendant un déplacement de code qu'une colonne se perd.
 */
describe('l’export CSV des abonnés', () => {
  /** Rend le contenu du fichier produit par un clic sur « Exporter ». */
  function csvApresClic(): string {
    const vraiCreer = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((balise: string) =>
      vraiCreer(balise),
    );
    const url = URL as unknown as Record<string, unknown>;
    url.createObjectURL = vi.fn(() => 'blob:faux');
    url.revokeObjectURL = vi.fn();

    const contenus: string[] = [];
    const vraiBlob = globalThis.Blob;
    globalThis.Blob = class extends vraiBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        contenus.push(parts.map(String).join(''));
      }
    } as unknown as typeof Blob;

    try {
      rendre('abonnements');
      fireEvent.click(screen.getByRole('button', { name: 'Exporter' }));
      return contenus.join('');
    } finally {
      globalThis.Blob = vraiBlob;
      vi.restoreAllMocks();
    }
  }

  it('aligne chaque cellule sous son en-tête', () => {
    // Le contrôle que `versCsv` ne fait pas : autant de cellules que d'en-têtes,
    // sur chaque ligne. Un décalage rend un fichier valide et faux.
    const lignes = csvApresClic().split('\r\n').filter((l) => l.length > 0);
    const colonnes = lignes[0]!.split(';').length;

    expect(colonnes).toBe(8);
    for (const ligne of lignes) {
      expect(ligne.split(';')).toHaveLength(colonnes);
    }
  });

  it('nomme ses huit colonnes, dans cet ordre', () => {
    // L'ordre est le contrat : un tableur ouvre le fichier sans rien demander,
    // et une colonne déplacée se lit comme une donnée fausse.
    expect(csvApresClic().split('\r\n')[0]).toBe(
      '﻿Collecteur;Téléphone;Zone;Palier;Prix mensuel;Statut;Échéance;Clients',
    );
  });

  it('exporte tous les collecteurs, pas la page affichée', () => {
    // Même défaut que celui gardé par `Collecteurs.test.tsx` : un fichier de
    // cinquante lignes que l'administrateur croirait complet.
    const csv = csvApresClic();
    for (const c of VUE.collecteurs) {
      expect(csv).toContain(c.nom);
    }
  });
});
```

> **`rendre` et `VUE` existent déjà** dans ce fichier — `VUE` ligne 101,
> `function rendre(onglet: CleNavSuper)` ligne 172. Rien à créer ni à adapter :
> `rendre` prend déjà l'onglet. Les réutiliser tels quels ; en écrire un second
> jeu de données ferait diverger deux vérités dans le même fichier.

> **Le `﻿` :** `telechargerCsv` préfixe le contenu d'une marque d'ordre des
> octets, sans quoi Excel lit « Téléphone » comme « TÃ©lÃ©phone ». Elle est dans
> le `Blob`, donc dans ce qu'on mesure.

- [ ] **Étape 2 : la voir échouer, puis passer**

```bash
cd apps/admin && npx vitest run src/ecrans/SuperAdmin.test.tsx -t "export CSV"
```

**Si les trois passent du premier coup, c'est le résultat attendu** : c'est une
caractérisation, elle décrit l'existant. **Si l'une échoue, arrêter le plan** —
un défaut réel vient d'être trouvé sur le chemin d'export, et il se corrige
seul, dans son propre commit, avant tout découpage.

- [ ] **Étape 3 : commit**

```bash
git add apps/admin/src/ecrans/SuperAdmin.test.tsx
git commit -m "test(admin): couvrir l'export CSV des abonnes avant d'y toucher"
```

---

### Tâche 2 : l'échafaudage d'empreintes

**Fichiers :** Créer `apps/admin/src/ecrans/SuperAdmin.empreinte.test.tsx`.

**Interfaces :** aucune. Fichier **temporaire**, supprimé à la tâche 9.

- [ ] **Étape 1 : écrire les six empreintes**

```tsx
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Échafaudage. **À supprimer à la fin du découpage** — voir la tâche 9.
 *
 * ## Ce que ce fichier prouve, et pourquoi il ne survit pas
 *
 * Le découpage de `SuperAdmin.tsx` est un déplacement de texte. « Déplacement
 * de texte » est une affirmation, et ces six empreintes la transforment en
 * mesure : le DOM rendu de chaque onglet, avant et après, au bit près.
 *
 * Une empreinte qui diffère est un **défaut**, jamais une empreinte à mettre à
 * jour. `vitest -u` est interdit tant que ce fichier vit.
 *
 * Il ne survit pas au découpage, et c'est délibéré. Une empreinte de six écrans
 * entiers casse à chaque changement légitime ; gardée, elle apprendrait à faire
 * `-u` sans lire. C'est un outil de transformation, pas un filet de sécurité —
 * le filet, ce sont les onze `describe` de `SuperAdmin.test.tsx`.
 */

afterEach(cleanup);

// Reprendre ici, à l'identique, les `vi.mock` et le jeu de données de
// `SuperAdmin.test.tsx` (lignes 1 à 185). Les recopier plutôt que les importer :
// ce fichier meurt à la tâche 9, et un module partagé lui survivrait.

const ONGLETS = [
  'abonnements',
  'administrateurs',
  'promos',
  'securite',
  'paiement',
  'plateforme',
] as const;

describe('empreinte du rendu, avant et après le découpage', () => {
  for (const onglet of ONGLETS) {
    it(`l’onglet ${onglet} rend exactement le même DOM`, () => {
      const { container } = render(
        <SuperAdmin vue={VUE} onglet={onglet} onRecharger={() => {}} />,
      );

      expect(container.innerHTML).toMatchSnapshot();
    });
  }
});
```

> **Six et non sept :** `ONGLETS` dans `SuperAdmin.tsx` compte six entrées —
> `abonnements`, `administrateurs`, `promos`, `securite`, `paiement`,
> `plateforme`. Vérifier lignes 87-119 avant d'écrire, et faire échouer le
> fichier si le compte a changé depuis.

> **`container.innerHTML` et non `toMatchInlineSnapshot`** : le rendu fait des
> milliers de caractères. En ligne, il rendrait le fichier illisible et le diff
> de chaque tâche indéchiffrable.

> **L'onglet `securite` rend le journal vide.** `Journal` ne charge rien sans
> clic — c'est délibéré, chaque lecture s'inscrit au journal. L'empreinte
> capture donc l'écran d'invite, ce qui suffit : c'est le rendu de `Journal` que
> le déplacement doit préserver.

- [ ] **Étape 2 : engendrer les empreintes**

```bash
cd apps/admin && npx vitest run src/ecrans/SuperAdmin.empreinte.test.tsx
```

Attendu : `6 passed`, et un fichier
`src/ecrans/__snapshots__/SuperAdmin.empreinte.test.tsx.snap` créé.

- [ ] **Étape 3 : vérifier que l'échafaudage tient debout**

Une empreinte qui ne peut pas échouer ne prouve rien. La faire échouer une
fois, exprès :

```bash
# Changer temporairement un mot dans SuperAdmin.tsx — par exemple le titre
# « Administrateurs » de la table ONGLETS — puis :
cd apps/admin && npx vitest run src/ecrans/SuperAdmin.empreinte.test.tsx
```

Attendu : **au moins une empreinte en échec**. Annuler ensuite la modification
(`git checkout -- apps/admin/src/ecrans/SuperAdmin.tsx`) et relancer : `6 passed`.

> **Ne pas sauter cette étape.** C'est la seule qui distingue « les empreintes
> passent » de « les empreintes voient quelque chose ». Une sonde qui rend
> « rien » ne prouve rien tant qu'on ne l'a pas vue trouver quelque chose.

- [ ] **Étape 4 : commit**

```bash
git add apps/admin/src/ecrans/SuperAdmin.empreinte.test.tsx apps/admin/src/ecrans/__snapshots__/
git commit -m "test(admin): echafaudage d'empreintes pour le decoupage de SuperAdmin"
```

---

### Tâches 3 à 8 : les six extractions

**Elles suivent toutes le même geste.** Il est écrit une fois ici, et chaque
tâche ne donne que ce qui lui est propre.

#### Le geste, pour chaque extraction

- [ ] **Étape 1 : créer le fichier**

Créer `apps/admin/src/ecrans/superadmin/<Nom>.tsx`. Y **couper-coller** le
bloc, sans en changer un caractère. Ajouter `export` devant la déclaration du
composant.

- [ ] **Étape 2 : recâbler les imports**

Le fichier neuf importe ce que le bloc utilisait. Les chemins relatifs gagnent
un cran : `../donnees` devient `../../donnees`, `./FicheModifiable` devient
`../FicheModifiable`. `@kolek/core` et `@kolek/ui` ne bougent pas.

`SuperAdmin.tsx` importe le composant extrait et **perd** les imports devenus
inutiles — c'est `oxlint` qui les nomme.

- [ ] **Étape 3 : les empreintes n'ont pas bougé**

```bash
cd apps/admin && npx vitest run src/ecrans/SuperAdmin.empreinte.test.tsx
```

Attendu : **`6 passed`, aucune empreinte écrite.**

> **Une empreinte qui diffère est un défaut.** Ne pas lancer `-u`. Lire le diff :
> il nomme le caractère perdu au déplacement.

- [ ] **Étape 4 : le filet et le compilateur**

```bash
cd apps/admin && npx vitest run
cd ../.. && npx tsc --noEmit -p apps/admin/tsconfig.json && npx oxlint apps/admin/src
```

Attendu : toutes les épreuves d'`apps/admin` vertes, `tsc` muet, `oxlint` sans
reproche **nouveau**.

- [ ] **Étape 5 : commit**

Un commit par extraction, jamais deux ensemble : `git revert` doit pouvoir
défaire une seule extraction.

---

### Tâche 3 : `Plateforme` — la plus autonome

**Fichiers :** Créer `apps/admin/src/ecrans/superadmin/Plateforme.tsx` ·
Modifier `apps/admin/src/ecrans/SuperAdmin.tsx`

**Ce qui se déplace :** `Plateforme` (lignes 1653-1714) et `LIBELLES_VOLUMES`
(1641-1652), sa seule dépendance propre.

**Interfaces :** `export function Plateforme({ etat }: { etat: EtatSuperAdmin })`.

**Pourquoi celle-ci d'abord :** 62 lignes, une seule propriété, aucune fonction
de rappel. Si le protocole des cinq étapes a un défaut, il coûte ici le prix
d'un `git revert` de soixante lignes.

- [ ] Suivre **le geste** ci-dessus.
- [ ] Commit : `refactor(admin): sortir l'onglet Plateforme de SuperAdmin`

---

### Tâche 4 : `Paiement`

**Fichiers :** Créer `apps/admin/src/ecrans/superadmin/Paiement.tsx` ·
Modifier `SuperAdmin.tsx`

**Ce qui se déplace :** `Paiement` (1524-1640) et `BOUTIQUE` (1479-1493).

**Interfaces :** `export function Paiement({ paiement }: { paiement: EtatPaiement | null })`.

> **`Pastille` (1494-1523) ne se déplace pas ici.** Elle est **partagée** avec
> `Journal`. Elle part à la tâche 5, avec lui, et `Paiement` l'importera —
> vérifier ce point à l'étape 2 : `oxlint` signalera l'import manquant, `tsc`
> aussi.

- [ ] Suivre **le geste**.
- [ ] Commit : `refactor(admin): sortir l'onglet Paiement de SuperAdmin`

---

### Tâche 5 : `Journal`

**Fichiers :** Créer `apps/admin/src/ecrans/superadmin/Journal.tsx` ·
Modifier `SuperAdmin.tsx` et `superadmin/Paiement.tsx`

**Ce qui se déplace :** `Journal` (1359-1478), `horodatage` (1344-1358) et
`Pastille` (1494-1523).

**Interfaces :** `export function Journal()` et
`export function Pastille({ ok, libelle }: { ok: boolean; libelle: string })`.

`Paiement.tsx` importe désormais `{ Pastille } from './Journal'`.

> **Ne pas toucher au commentaire de `Journal`.** Il porte la raison pour
> laquelle le journal ne se charge pas seul : chaque lecture s'y inscrit, et
> l'ouvrir à l'affichage remplirait la table de la preuve qu'on la regarde. Ce
> raisonnement vaut plus que le code au-dessus duquel il est posé.

- [ ] Suivre **le geste**.
- [ ] Commit : `refactor(admin): sortir le journal de securite de SuperAdmin`

---

### Tâche 6 : `Administrateurs`

**Fichiers :** Créer `apps/admin/src/ecrans/superadmin/Administrateurs.tsx` ·
Modifier `SuperAdmin.tsx`

**Ce qui se déplace :** `Administrateurs` (989-1081).

**Interfaces :**

```tsx
export function Administrateurs({ etat, occupe, onDefinir, onRevoquer }: {
  etat: EtatSuperAdmin;
  occupe: boolean;
  onDefinir: (cible: string, niveau: AdministrateurSuper['niveau']) => void;
  onRevoquer: (cible: string) => void;
}): JSX.Element
```

> **`AdministrateurSuper['niveau']` et non `string`** — relevé lignes 989-999.
> Ce fichier importe donc aussi le type `AdministrateurSuper` depuis
> `../../superadmin`. Un `string` compilerait et rouvrirait l'union que ce type
> ferme.

- [ ] Suivre **le geste**.
- [ ] Commit : `refactor(admin): sortir l'onglet Administrateurs de SuperAdmin`

---

### Tâche 7 : `Promos`

**Fichiers :** Créer `apps/admin/src/ecrans/superadmin/Promos.tsx` ·
Modifier `SuperAdmin.tsx`

**Ce qui se déplace :** `CodesPromo` (1082-1305), `Remises` (1306-1341),
`LIBELLE_STATUT` (127-133) et `TEINTE_STATUT` (134-140).

**Interfaces :** `export function CodesPromo({ etat, vue, occupe, onCreer, onAppliquer })`
et `export function Remises({ etat }: { etat: EtatSuperAdmin })`.

> **`onAppliquer` est passée à `CodesPromo` **et** à `OngletAbonnements`** —
> même rappel, deux appelants. Elle reste dans `SuperAdmin.tsx`. Ne pas la
> dupliquer : deux copies divergeraient au premier changement de libellé.

`CodesPromo` et `Remises` partagent le même fichier parce que l'onglet `promos`
les rend tous deux, l'un sous l'autre. Deux fichiers pour un onglet
n'apporteraient rien.

- [ ] Suivre **le geste**.
- [ ] Commit : `refactor(admin): sortir les codes promo et les remises de SuperAdmin`

---

### Tâche 8 : `Abonnements` — la plus grosse, donc la dernière

**Fichiers :** Créer `apps/admin/src/ecrans/superadmin/Abonnements.tsx` ·
Modifier `SuperAdmin.tsx`

**Ce qui se déplace :** `OngletAbonnements` (383-896), `MenuLigne` (897-988),
`FILTRES` (120-126), le type `FiltreStatut` (72-80) et
`LARGEUR_MINIMALE_ABONNES` (146-149).

**Interfaces :**

```tsx
export function OngletAbonnements({
  vue, etat, occupe, onRecharger, onVerdict, onAppliquer,
}: {
  vue: VueGlobale;
  etat: EtatSuperAdmin;
  occupe: boolean;
  onRecharger: () => void;
  onVerdict: (ok: boolean, message: string) => void;
  onAppliquer: (demande: Extract<ActionSuperAdmin, { action: 'appliquer_code' }>) => void;
}): JSX.Element
```

Ce fichier importe `FicheModifiable` — chemin `../FicheModifiable`.

**Dernière parce que la plus grosse.** Les cinq extractions précédentes auront
éprouvé le protocole sur 500 lignes cumulées. Celle-ci en déplace 606 d'un
coup, et c'est la seule où une erreur de couper-coller a de quoi se cacher.

> **Ce fichier reste gros — ~610 lignes.** C'est le résultat attendu, pas un
> échec. Le découpage **par responsabilité** de cet onglet — filtrage,
> pagination, tableau — est un autre travail, qui demande son propre plan.

- [ ] Suivre **le geste**.
- [ ] Commit : `refactor(admin): sortir l'onglet Abonnements de SuperAdmin`

---

### Tâche 9 : retirer l'échafaudage, et mesurer

- [ ] **Étape 1 : une dernière fois, les empreintes**

```bash
cd apps/admin && npx vitest run src/ecrans/SuperAdmin.empreinte.test.tsx
```

Attendu : `6 passed`. Ces empreintes ont été engendrées **avant** la première
extraction et n'ont pas été réécrites depuis : leur passage prouve que le DOM
des six onglets est resté identique au bit près.

- [ ] **Étape 2 : supprimer l'échafaudage**

```bash
git rm apps/admin/src/ecrans/SuperAdmin.empreinte.test.tsx
git rm -r apps/admin/src/ecrans/__snapshots__/
```

> **Pourquoi le supprimer plutôt que le garder.** Une empreinte de six écrans
> entiers casse à chaque changement légitime. Gardée, elle apprendrait à faire
> `-u` sans lire — et le jour où elle attraperait une vraie régression, elle
> serait mise à jour comme les vingt fois précédentes. Le filet reste les onze
> `describe` de `SuperAdmin.test.tsx`, plus l'épreuve d'export de la tâche 1,
> qui décrivent des **intentions** et non un rendu.

- [ ] **Étape 3 : mesurer ce qui a été fait**

```bash
wc -l apps/admin/src/ecrans/SuperAdmin.tsx apps/admin/src/ecrans/superadmin/*.tsx
```

Attendu : `SuperAdmin.tsx` autour de 250 lignes ; six fichiers, dont cinq sous
300 et `Abonnements.tsx` autour de 610.

- [ ] **Étape 4 : la chaîne complète**

```bash
npm run verifier
```

> **Lire le journal, pas seulement le code de sortie.** Les quatorze étapes
> doivent y paraître une par une. Le 2026-09-10, un `echo "SORTIE=$?"` mal placé
> a rendu `0` sur une chaîne arrêtée à la quatrième étape sur quatorze. La forme
> qui ne ment pas :
>
> ```bash
> { npm run verifier; echo "SORTIE_NPM=$?"; } > /chemin/verifier.log 2>&1
> ```

- [ ] **Étape 5 : commit**

```bash
git add -A
git commit -m "refactor(admin): retirer l'echafaudage d'empreintes"
```

- [ ] **Étape 6 : après la poussée, lire ce qui est servi**

`admin.kolek.cash` est déployé par **Netlify**, sur poussée vers `main`, et non
par le CI. Netlify va plus vite que GitHub Actions — le 2026-09-10, le bundle
était servi alors que le CI affichait encore `in_progress`.

```bash
node -e '(async()=>{
  const r = await fetch("https://admin.kolek.cash/", { cache: "no-store" });
  const h = await r.text();
  const nom = [...h.matchAll(/assets\/(index-[A-Za-z0-9_-]+\.js)/g)].map(x => x[1])[0];
  console.log("servi :", nom);
})()'
```

Comparer à `apps/admin/dist/assets/index-*.js`.

> **Un découpage ne change aucune chaîne de caractères.** L'empreinte servie
> **peut donc légitimement ne pas bouger** si le regroupement de Vite rend les
> mêmes octets. Ici, contrairement à un ajout de fonctionnalité, une empreinte
> identique n'est **pas** une preuve de déploiement — et une empreinte
> différente n'est pas une alerte. Ce contrôle ne sert qu'à vérifier que le site
> répond et sert un bundle valide.

---

## Ce qui reste après ce plan

- **`superadmin/Abonnements.tsx`, ~610 lignes.** Découpage par responsabilité —
  filtrage, pagination, tableau. Demande son propre plan, et une spécification :
  ce n'est plus un déplacement de texte.
- **`apps/collecteur/src/ecrans/Clients.tsx`, 1 179 lignes**, deuxième plus gros
  fichier du dépôt. Même méthode applicable, même échafaudage.
