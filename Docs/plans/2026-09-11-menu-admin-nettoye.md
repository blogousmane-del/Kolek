# Nettoyer le menu de Kolek · Admin — plan d'implémentation

> **Pour un exécutant :** les étapes sont cochables (`- [ ]`). Elles se suivent
> dans l'ordre. Chaque tâche voit son épreuve rouge avant le retrait, finit par
> un commit et laisse le dépôt vert.
> **Rien ne se pousse sans l'accord explicite de l'exploitant** : pousser `main`
> redéploie `admin.kolek.cash`, `app.kolek.cash` et `kolek.cash` par Netlify.

**But :** retirer de la console Kolek · Admin les trois éléments qui mènent
nulle part ou affirment une chose fausse — l'entrée « Encaisser », le bandeau
« Essai gratuit · 30 jours restants », la carte « Passer à Pro » — et ce qui
n'existait que pour eux.

**Conception :** `Docs/specs/2026-09-11-menu-admin-nettoye-design.md`,
approuvée le 2026-09-11. Chantier **A** sur quatre.

**Outillage :** React 19, Vitest 4 + Testing Library, TypeScript (`tsc -b`),
oxlint, `scripts/generer-theme.mjs`.

## Contraintes pour toutes les tâches

- **Aucun essai manuel contre la production.** Les serveurs de dev en 5173/5174
  lisent `apps/*/.env`, qui pointent sur la production. Un contrôle visuel, s'il
  en faut un, se fait en 5175 avec des variables en ligne vers
  `http://127.0.0.1:54321`. Aucun `.env` copié.
- **`theme.css` n'est jamais édité à la main** : `npm run generer:theme`.
- **Types des apps** : l'étape `typecheck` de la chaîne ne type que `core` et
  `ui`. Après toute modification d'une app, `npx tsc -b` **depuis son dossier**.
- **Fins de ligne** : `BarreLaterale.tsx`, `Coquille.tsx`, `tokens.ts` et
  `Kolek Design System.md` sont en CRLF ; les fichiers d'épreuve,
  `Bandeaux.tsx` et `index.ts` en LF. Après chaque tâche, la sonde :

  ```bash
  node -e 'const fs=require("fs");for(const f of process.argv.slice(1)){const s=fs.readFileSync(f,"utf8");const n=s.split("\n").length-1,c=(s.match(/\r\n/g)||[]).length;console.log(f,c===n?"CRLF":c===0?"LF":"MELE "+c+"/"+n)}' <fichiers touchés>
  ```

  Un fichier `MELE` est remis dans sa convention d'origine avant le commit.
- **Commits** : message en français sans accents, comme l'historique, terminé
  par `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Tâche 1 : « Encaisser » quitte le menu de l'admin

**Fichiers :**
- Épreuve : `packages/ui/src/BarreLaterale.test.tsx` (nouveau `describe` en fin de fichier)
- Modifier : `packages/ui/src/BarreLaterale.tsx:10` et `:54`
- Modifier : `apps/admin/src/Coquille.tsx:16` et `:264`
- Supprimer : `apps/admin/src/ecrans/EncaisserMise.tsx`

**Interfaces :** `CleNavAdmin` perd `'encaisser'` et devient
`'tableau' | 'collecteurs' | 'encours' | 'abonnements' | 'demandes' | 'avis' | 'reglages'`.
`CleNavCollecteur` (`NavMobile.tsx`) et `CleNavBureau` (`NavBureau.tsx`)
gardent leur `'encaisser'` : c'est celui du collecteur, le vrai.

- [ ] **Étape 1 : écrire l'épreuve**

Ajouter en fin de `packages/ui/src/BarreLaterale.test.tsx` :

```tsx
/**
 * Le menu de Kolek · Admin ne montre que ce que l'administrateur peut faire.
 *
 * Nettoyé le 2026-09-11 (`Docs/specs/2026-09-11-menu-admin-nettoye-design.md`) :
 * une entrée « Encaisser » pour un geste que la base refuse à l'administrateur,
 * et une carte « Passer à Pro » proposée à GTCS, qui vend Pro.
 */
describe('le menu de Kolek · Admin', () => {
  it('n’offre pas d’encaisser : l’argent passe par le collecteur', () => {
    render(<BarreLaterale {...props} />);

    // La politique `mises_insert` n'accepte que `collecteur_id = auth.uid()`.
    expect(screen.queryByText('Encaisser')).toBeNull();
    // Le reste du pilotage est intact : une entrée en moins, pas un menu refait.
    expect(screen.getByText('Tableau de bord')).toBeDefined();
    expect(screen.getByText('Collecteurs')).toBeDefined();
    expect(screen.getByText('Encours & Soldes')).toBeDefined();
  });
});
```

- [ ] **Étape 2 : la voir rouge**

Run : `npm run test -w @kolek/ui -- BarreLaterale`
Attendu : 1 échec, `n’offre pas d’encaisser`, sur `expect(...).toBeNull()` —
l'entrée existe encore. Les 7 autres passent.

- [ ] **Étape 3 : retirer**

`packages/ui/src/BarreLaterale.tsx` — supprimer la ligne 10 :

```ts
  | 'encaisser'
```

et la ligne 54 :

```ts
  { cle: 'encaisser', icone: 'circle-dollar-sign', libelle: 'Encaisser', disponible: true },
```

`apps/admin/src/Coquille.tsx` — supprimer la ligne 16 :

```ts
import { EncaisserMise } from './ecrans/EncaisserMise';
```

et la ligne 264 :

```tsx
              {page === 'encaisser' && <EncaisserMise />}
```

Puis : `git rm apps/admin/src/ecrans/EncaisserMise.tsx`

- [ ] **Étape 4 : la voir verte, et les types**

Run : `npm run test -w @kolek/ui -- BarreLaterale` — attendu : 8 passent.
Run : `npx tsc -b` dans `packages/ui`, puis dans `apps/admin` — attendu : muets.
Run : `npm run test -w @kolek/admin` — attendu : tout passe.

- [ ] **Étape 5 : sonde des fins de ligne** sur les trois fichiers modifiés.

- [ ] **Étape 6 : commit**

```bash
git add packages/ui/src/BarreLaterale.tsx packages/ui/src/BarreLaterale.test.tsx apps/admin/src/Coquille.tsx
git commit -m "refactor(admin): retirer Encaisser du menu, un geste que la base refuse a l'admin"
```

(`EncaisserMise.tsx` est déjà indexé par `git rm`.)

---

### Tâche 2 : la carte « Passer à Pro » et son dégradé

**Fichiers :**
- Épreuve : `packages/ui/src/BarreLaterale.test.tsx`
- Modifier : `packages/ui/src/BarreLaterale.tsx:351-353` (commentaire), `:435` (marge), `:446-467` (carte)
- Modifier : `packages/core/src/tokens.ts:345`
- Régénérer : `packages/core/src/theme.css`
- Modifier : `Docs/Kolek Design System.md:147` et `:282`

- [ ] **Étape 1 : écrire l'épreuve**

Dans le `describe('le menu de Kolek · Admin')` de la tâche 1, après la
première épreuve :

```tsx
  it('ne propose pas Pro à GTCS, qui le vend', () => {
    render(<BarreLaterale {...props} />);

    expect(screen.queryByText('Passer à Pro')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Voir les offres' })).toBeNull();
    // Le pied de la barre ne garde que la sortie de session.
    expect(screen.getByText('Déconnexion')).toBeDefined();
  });
```

Et dans `remplace le menu entier dans l’espace plateforme`, remplacer le
commentaire des lignes 116-117 :

```tsx
    // Et la promotion d'offre avec lui : la plateforme n'est l'abonnée de
    // personne.
```

par :

```tsx
    // Pas de promotion d'offre non plus. Elle a quitté les deux espaces le
    // 2026-09-11 ; cette assertion garde qu'elle ne revienne pas par celui-ci.
```

- [ ] **Étape 2 : la voir rouge**

Run : `npm run test -w @kolek/ui -- BarreLaterale`
Attendu : 1 échec, `ne propose pas Pro à GTCS`, sur `queryByText('Passer à Pro')`.

- [ ] **Étape 3 : retirer la carte**

`packages/ui/src/BarreLaterale.tsx` — supprimer le bloc des lignes 446-467,
du commentaire `{/* Promotion d'offre.` jusqu'au `)}` qui ferme
`{!surPlateforme && (`, inclus.

La déconnexion devient le dernier élément de la barre : sa marge basse passe de
`mb-2` à `mb-6`, celle qu'avait la carte, pour ne pas coller au bord.

```tsx
      <div className="px-4 mb-6">
```

Remplacer le commentaire des lignes 351-353 :

```tsx
    // `overflow-y-auto` : la barre porte huit entrées, deux raccourcis et un
    // encart de promotion. Sur un portable en 768 px de haut, le bas était
    // coupé sans possibilité d'y accéder.
```

par :

```tsx
    // `overflow-y-auto` : la barre a porté huit entrées, deux raccourcis et un
    // encart de promotion, et sur un portable en 768 px de haut le bas était
    // coupé sans possibilité d'y accéder. Elle n'en porte plus que sept, sans
    // raccourci ni encart, depuis le 2026-09-11 — mais un tiroir ouvert sur un
    // téléphone couché n'a que 400 px de haut, et le défilement reste la seule
    // garantie d'atteindre la déconnexion.
```

- [ ] **Étape 4 : retirer le dégradé**

`packages/core/src/tokens.ts` — supprimer la ligne 345 :

```ts
  degradePromo: 'linear-gradient(135deg, #1C5A3D 0%, #0E2E1F 100%)',
```

Run : `npm run generer:theme` puis `npm run verifier:theme` — attendu : code 0.
`theme.css` perd `--degrade-promo` (le générateur l'écrit en LF ; `autocrlf`
normalise au `git add`, rien à reprendre).

`Docs/Kolek Design System.md` — supprimer la ligne 147 :

```md
| `--degrade-promo` | Carte d'upsell en pied de barre latérale. |
```

À la ligne 282, remplacer :

```md
Items icône + label, groupés par overline gris (« Pilotage », « Raccourcis »).
```

par :

```md
Items icône + label, groupés par overline gris (« Pilotage », « Monétisation », « Système »).
```

et remplacer, en fin de la même ligne :

```md
Carte promo en bas, sortie de session juste au-dessus.
```

par :

```md
Sortie de session seule en pied : la carte promo de la maquette a été retirée le 2026-09-11, GTCS vendant les paliers et n'en souscrivant aucun.
```

- [ ] **Étape 5 : la voir verte**

Run : `npm run test -w @kolek/ui -- BarreLaterale` — attendu : 9 passent.
Run : `npx tsc -b` dans `packages/ui` — attendu : muet.
Run : `npm run test -w @kolek/core` — attendu : tout passe.

- [ ] **Étape 6 : sonde des fins de ligne** sur `BarreLaterale.tsx`,
`BarreLaterale.test.tsx`, `tokens.ts`, `Kolek Design System.md`.

- [ ] **Étape 7 : commit**

```bash
git add packages/ui/src/BarreLaterale.tsx packages/ui/src/BarreLaterale.test.tsx packages/core/src/tokens.ts packages/core/src/theme.css "Docs/Kolek Design System.md"
git commit -m "refactor(ui): retirer la carte Passer a Pro et son degrade, GTCS vend Pro"
```

---

### Tâche 3 : le bandeau « Essai gratuit · 30 jours restants »

**Fichiers :**
- Épreuve : `apps/admin/src/Coquille.test.tsx`
- Modifier : `apps/admin/src/Coquille.tsx:2` et `:196-203`
- Modifier : `packages/ui/src/Bandeaux.tsx:5-36`
- Modifier : `packages/ui/src/index.ts:5`
- Modifier : `Docs/Kolek Design System.md:276`

**Interfaces :** `@kolek/ui` n'exporte plus `BandeauOffre`. `BandeauHorsLigne`
et `useEnLigne` restent, l'application collecteur s'en sert.

- [ ] **Étape 1 : écrire l'épreuve**

Dans `apps/admin/src/Coquille.test.tsx`, en dernière épreuve du `describe` :

```tsx
  it('ne montre pas de bandeau d’essai : GTCS n’est en essai chez personne', () => {
    render(<Coquille />);

    // « 30 jours restants » et non « Essai gratuit » : l'écran Demandes affiche
    // ce second libellé à bon droit, pour le palier gratuit d'un prospect.
    expect(screen.queryByText('30 jours restants')).toBeNull();
    expect(screen.queryByText('Voir les offres →')).toBeNull();
    expect(screen.getByText('écran tableau')).toBeDefined();
  });
```

- [ ] **Étape 2 : la voir rouge**

Run : `npm run test -w @kolek/admin -- Coquille`
Attendu : 1 échec, `ne montre pas de bandeau d’essai`, sur
`queryByText('30 jours restants')`. Les 5 autres passent.

- [ ] **Étape 3 : retirer**

`apps/admin/src/Coquille.tsx` — supprimer la ligne 2 :

```ts
  BandeauOffre,
```

et les lignes 196-203, commentaire, rendu et ligne vide qui suit :

```tsx
            {/* La maquette omettait ce bandeau sur la fiche collecteur. L'état de
                l'abonnement ne dépend pas de la page où l'on se trouve.

                Il ne dépend en revanche que de l'espace : la console de plateforme
                n'est l'abonnée de personne, et y afficher une échéance de palier
                parlerait de l'organisation qu'on vient de quitter. */}
            {espace === 'admin' && <BandeauOffre />}

```

`packages/ui/src/Bandeaux.tsx` — supprimer les lignes 5-36 : le commentaire
`/** Bandeau d'offre, en tête du Dashboard. */`, la fonction `BandeauOffre`
entière et la ligne vide qui la suit. Les imports restent : `Icone` sert
`BandeauHorsLigne`, `useEffect` et `useState` servent `useEnLigne`.

`packages/ui/src/index.ts` — la ligne 5 devient :

```ts
export { BandeauHorsLigne, useEnLigne } from './Bandeaux';
```

`Docs/Kolek Design System.md` — la ligne 276 devient :

```md
| `BandeauHorsLigne`, `useEnLigne` | `Bandeaux.tsx` | État réseau. |
```

- [ ] **Étape 4 : la voir verte, et les types**

Run : `npm run test -w @kolek/admin -- Coquille` — attendu : 6 passent.
Run : `npm run test -w @kolek/admin` et `npm run test -w @kolek/ui` — attendu : tout passe.
Run : `npx tsc -b` dans `packages/ui`, `apps/admin`, `apps/collecteur` — attendu : muets.
Run : `grep -rn "BandeauOffre" apps packages --include=*.ts --include=*.tsx` — attendu : rien.

- [ ] **Étape 5 : sonde des fins de ligne** sur les cinq fichiers modifiés.

- [ ] **Étape 6 : commit**

```bash
git add apps/admin/src/Coquille.tsx apps/admin/src/Coquille.test.tsx packages/ui/src/Bandeaux.tsx packages/ui/src/index.ts "Docs/Kolek Design System.md"
git commit -m "refactor(admin): retirer le bandeau Essai gratuit, faux pour tout le monde"
```

---

### Tâche 4 : la doc du §5, puis la chaîne complète

**Fichiers :**
- Modifier : `Docs/Kolek Design System.md:356` et `:364`
- Modifier : ce plan (section « Écarts »)

- [ ] **Étape 1 : §5 du Design System**

La ligne 356 devient :

```md
| « Free Plan Mode » | **Sans équivalent.** La console est celle de GTCS, qui vend les paliers et n'en souscrit aucun : un indicateur de palier y serait faux pour tout le monde. Retiré le 2026-09-11. |
```

La ligne 364 devient :

```md
| Subscribe now | **Sans équivalent**, pour la même raison. La carte « Passer à Pro » a été retirée le 2026-09-11. |
```

Les lignes 21 et 24 décrivent la maquette d'origine : elles restent.

- [ ] **Étape 2 : la pile locale**

Run : `npx supabase status`. Si `supabase_edge_runtime_Kolek` manque ou si la
pile est arrêtée : `npx supabase stop` puis
`npx supabase start -x studio,storage-api,imgproxy,realtime,vector,logflare,supavisor,mailpit`
(la sortie doit porter `FUNCTIONS_URL`).

- [ ] **Étape 3 : la chaîne**

Run : `npm run verifier`, journal dans un fichier temporaire.
Attendu : code 0 ; les quinze commandes lues dans le journal, de `db:reset` à
`verifier:bundles`. Un échec de `test:db` après un démarrage « depuis la
sauvegarde » se relance une fois avant toute enquête.

- [ ] **Étape 4 : écarts et commit**

Ajouter en fin de ce plan une section `## Écarts`, remplie de ce qui a
réellement divergé (ou « aucun »). Sonde des fins de ligne sur le Design System.

```bash
git add "Docs/Kolek Design System.md" Docs/plans/2026-09-11-menu-admin-nettoye.md
git commit -m "docs: le menu admin nettoye, le Design System remis d'accord"
```

---

## Après l'accord de poussée — et seulement après

Fusion dans `main` en local, chaîne relancée sur le résultat, puis poussée par
PowerShell. Ensuite :

- `admin.kolek.cash` sert un `index-*.js` d'empreinte égale au build local ;
- `app.kolek.cash` et `kolek.cash` : empreintes relevées et expliquées —
  `theme.css` a perdu une variable, leur feuille de style change donc
  d'empreinte, sans effet visible ;
- job des fonctions : « Aucune Edge Function touchée ».

## Écarts

Relevés à l'exécution, le 2026-09-11.

- **Deux ajouts au regard de la spec, prévus dès ce plan.** La ligne 282 du
  Design System décrivait encore la « carte promo en bas » et des sections
  « Pilotage », « Raccourcis » qui n'existent plus : la spec ne la citait pas,
  la tâche 2 l'a remise d'accord. La marge basse de la déconnexion est passée
  de `mb-2` à `mb-6`, celle qu'avait la carte : sans elle, le dernier bouton
  de la barre collait au bord.
- **`theme.css` sort du générateur en LF**, là où la copie de travail était en
  CRLF. Le fichier reste pur, `autocrlf` normalise au `git add`, et son diff ne
  porte qu'une ligne. Rien à reprendre.
- **La recherche de `degradePromo` a d'abord remonté `apps/admin/dist/`** :
  des builds anciens, hors dépôt. Relancée hors `dist`, elle ne trouve plus
  que la spec, ce plan et un audit du 2026-09-04 — de l'histoire.
- **Aucune épreuve n'a été vue verte avant son retrait**, aucune n'a demandé
  plus d'une implémentation : trois rouges, trois verts.
- **La chaîne complète**, `npm run verifier`, sort en code 0 : quatorze
  scripts racine et le `typecheck` des espaces de travail, soit les quinze
  commandes. `core` 69, `ui` 144, admin 130, collecteur 266, site 41,
  `test:scripts` 198, `test:db` 789 sur 67 fichiers ; les trois builds typent ;
  `verifier:bundles` : « Aucune fuite dans les artefacts ».
