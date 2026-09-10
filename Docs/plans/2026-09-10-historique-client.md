# Historique du client — plan d'implémentation

> **Pour un exécutant :** chaque étape est cochable. Suivre l'ordre ; chaque
> tâche finit sur un commit et laisse le dépôt vert.

**But :** donner au collecteur le passé complet d'un client, organisé par carte,
et doter la pagination partagée de numéros sur bureau et d'un sélecteur natif
sur mobile.

**Architecture :** la carte est l'unité de navigation — 31 cases plus une
ouverture plus une clôture, soit 33 événements bornés par construction. Niveau 1
la pile de cartes (paginée), niveau 2 le détail d'une carte (jamais paginé).
Spec : `Docs/specs/2026-09-10-historique-client-design.md`.

**Pile technique :** React 19, Tailwind v4, TypeScript 7, Vitest 4 + Testing
Library, oxlint. Supabase JS pour la lecture.

## Contraintes globales

Elles valent pour **toutes** les tâches ; aucune n'est rappelée ensuite.

- **44 px minimum** pour toute cible tactile (`min-w-11 min-h-11`).
- **Aucun rayon hors de l'échelle des jetons.** Pas de `rounded-[…]`.
- **Tout montant passe par `formatMontant()`** de `@kolek/core`. Elle **lève**
  sur un nombre non fini.
- **Le séparateur de milliers est U+00A0.** Les assertions lisent `textContent`,
  jamais `getByText` — le normaliseur de Testing Library écrase l'insécable.
- **Statuts par `BadgeStatut`** (`@kolek/ui`), jamais de pilule dessinée à la
  main. Union `Statut` existante ; ce plan n'y ajoute rien.
- **TDD strict.** Écrire l'épreuve, la voir échouer pour la bonne raison, puis
  implémenter. Une épreuve qui passe du premier coup ne prouve rien.
- Les tests se lancent **depuis le dossier de l'espace de travail**
  (`packages/ui`, `apps/collecteur`). Depuis la racine, `--dir` n'applique pas
  la configuration jsdom et tout tombe sur `document is not defined`.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `packages/ui/src/Pagination.tsx` *(modifié)* | `fenetrePages`, la bande numérotée, le sélecteur natif |
| `packages/ui/src/Pagination.test.tsx` *(modifié)* | caractérisation d'abord, puis les deux présentations |
| `apps/collecteur/src/lectures-ecrans.ts` *(modifié)* | `chargerHistoriqueCarte` |
| `apps/collecteur/src/ecrans/HistoriqueClient.tsx` *(créé)* | les deux niveaux de l'écran |
| `apps/collecteur/src/ecrans/HistoriqueClient.test.tsx` *(créé)* | ses épreuves |
| `apps/collecteur/src/ecrans/FicheClient.tsx` *(modifié)* | point d'entrée, et une pilule de moins |

`FicheClient.tsx` fait 860 lignes. L'historique n'y est pas ajouté : il prend son
fichier. Une sous-vue de 200 lignes de plus en ferait le deuxième plus gros
fichier du dépôt.

## À trancher avant la tâche 6 — le montant affiché

**Découvert le 2026-09-10, après l'écriture du plan.** La table `retraits`
porte `carte_id`, `montant_restitue` **et `commission`** :

```
id · collecteur_id · carte_id · montant_restitue · commission · effectue_le · restitue_par
```

Pour une carte **clôturée**, le montant rendu au client est donc un **fait
enregistré**, pas un calcul. Le recalculer par `soldeRestituable` reviendrait à
afficher un nombre qui peut contredire ce que le client a réellement touché —
sur l'écran même où il vient contester.

Pour une carte **active**, aucun retrait n'existe encore : seule la projection
`soldeRestituable(misesEncaissees, mise)` est disponible, et elle doit être
étiquetée comme telle.

**Ce que ça implique :** le niveau 1 ne dispose aujourd'hui que de
`CarteFiche`, qui ne porte pas le montant restitué. Trois issues :

| Issue | Ce qu'elle coûte |
|---|---|
| **A.** Charger les retraits au niveau 1 | une 4ᵉ requête dans `chargerFicheClient`, bornée par le nombre de cartes |
| **B.** N'afficher aucun montant au niveau 1 | la pile se lit « carte de mars, 31/31, cycle terminé » ; le montant apparaît au niveau 2 |
| **C.** Afficher la projection partout | **écarté** — un nombre recalculé qui contredit le versement réel est le pire défaut possible ici |

Recommandation : **A**, parce qu'un collecteur qui parcourt la pile cherche
justement « combien j'ai rendu sur cette carte-là », et le lui faire ouvrir
chaque carte pour l'obtenir manque le geste.

**Cette décision appartient à l'exploitant** : elle porte sur ce qu'un client
lit quand il conteste de l'argent. Les tâches 5 et 6 sont écrites pour **B** ;
retenir **A** demande d'étendre `CarteFiche` d'un champ
`montantRestitue: number | null` et la requête de `chargerFicheClient` d'une
lecture de `retraits`.

---

---

### Tâche 1 : figer le comportement actuel de `Pagination`

Six écrans l'utilisent. Avant de le changer, on écrit ce qu'il fait — sinon la
régression sera silencieuse.

**Fichiers :** Test — `packages/ui/src/Pagination.test.tsx`

**Interfaces :** consomme `Pagination({ page, pages, total, onAller })`. Produit
un filet, rien d'autre.

- [ ] **Étape 1 : écrire les épreuves de caractérisation**

À la fin de `packages/ui/src/Pagination.test.tsx` :

```tsx
describe('ce que les six écrans appelants tiennent pour acquis', () => {
  it('ne rend rien quand tout tient sur une page', () => {
    const { container } = render(<Pagination page={1} pages={1} total={12} onAller={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('garde les deux flèches et leurs libellés', () => {
    render(<Pagination page={2} pages={5} total={220} onAller={() => {}} />);
    expect(screen.getByLabelText('Page précédente')).toBeTruthy();
    expect(screen.getByLabelText('Page suivante')).toBeTruthy();
  });

  it('garde la région vive qui annonce le changement', () => {
    render(<Pagination page={2} pages={5} total={220} onAller={() => {}} />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toContain('220');
  });
});
```

- [ ] **Étape 2 : les lancer, et les voir PASSER**

```bash
cd packages/ui && npx vitest run src/Pagination.test.tsx
```

Attendu : **PASS**. Ce sont des épreuves de caractérisation, pas du TDD — elles
décrivent l'existant. Si l'une échoue, **arrêter** : le composant ne fait pas ce
que ce plan croit.

- [ ] **Étape 3 : commit**

```bash
git add packages/ui/src/Pagination.test.tsx
git commit -m "test(ui): figer le contrat de Pagination avant de le changer"
```

---

### Tâche 2 : `fenetrePages`, la fenêtre de numéros

C'est là que vivent les erreurs de bornes. Fonction pure, exportée, éprouvée
seule.

**Fichiers :** Modifier `packages/ui/src/Pagination.tsx` · Test
`packages/ui/src/Pagination.test.tsx`

**Interfaces :** produit
`fenetrePages(page: number, pages: number, rayon?: number): Array<number | '…'>`.
Consommée par la tâche 3.

- [ ] **Étape 1 : écrire l'épreuve qui échoue**

```tsx
import { fenetrePages } from './Pagination';

describe('fenetrePages', () => {
  it('rend tous les numéros quand ils tiennent', () => {
    expect(fenetrePages(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('coupe à droite quand on est au début', () => {
    expect(fenetrePages(1, 20)).toEqual([1, 2, 3, '…', 20]);
  });

  it('coupe à gauche quand on est à la fin', () => {
    expect(fenetrePages(20, 20)).toEqual([1, '…', 18, 19, 20]);
  });

  it('coupe des deux côtés au milieu', () => {
    expect(fenetrePages(10, 20)).toEqual([1, '…', 8, 9, 10, 11, 12, '…', 20]);
  });

  it('ne rend jamais deux coupures adjacentes', () => {
    for (let p = 1; p <= 12; p += 1) {
      const f = fenetrePages(p, 12);
      for (let i = 1; i < f.length; i += 1) {
        expect(f[i] === '…' && f[i - 1] === '…').toBe(false);
      }
    }
  });

  it('garde toujours le premier et le dernier', () => {
    for (let p = 1; p <= 40; p += 1) {
      const f = fenetrePages(p, 40);
      expect(f[0]).toBe(1);
      expect(f[f.length - 1]).toBe(40);
    }
  });

  it('n’invente jamais de page hors bornes', () => {
    for (let p = 1; p <= 40; p += 1) {
      for (const n of fenetrePages(p, 40)) {
        if (n !== '…') expect(n >= 1 && n <= 40).toBe(true);
      }
    }
  });
});
```

- [ ] **Étape 2 : la voir échouer**

```bash
cd packages/ui && npx vitest run src/Pagination.test.tsx -t fenetrePages
```

Attendu : `fenetrePages is not a function`.

- [ ] **Étape 3 : implémenter**

Dans `packages/ui/src/Pagination.tsx`, avant le composant :

```tsx
/**
 * Les numéros à montrer autour de la page courante.
 *
 * Le premier et le dernier sont toujours là — ce sont les deux sauts les plus
 * fréquents. Entre eux, `rayon` pages de part et d'autre de la courante, et `…`
 * pour ce qui est sauté.
 *
 * Une coupure n'est posée que si elle **économise** au moins une page : sauter
 * une seule page afficherait `1 … 3`, où `1 2 3` est plus court et cache moins.
 */
export function fenetrePages(page: number, pages: number, rayon = 2): Array<number | '…'> {
  const numeros = new Set<number>([1, pages]);
  for (let n = page - rayon; n <= page + rayon; n += 1) {
    if (n >= 1 && n <= pages) numeros.add(n);
  }

  const tries = [...numeros].sort((a, b) => a - b);
  const sortie: Array<number | '…'> = [];

  for (let i = 0; i < tries.length; i += 1) {
    const n = tries[i] as number;
    const precedent = tries[i - 1];
    if (precedent !== undefined && n - precedent === 2) sortie.push(precedent + 1);
    else if (precedent !== undefined && n - precedent > 2) sortie.push('…');
    sortie.push(n);
  }

  return sortie;
}
```

- [ ] **Étape 4 : la voir passer**

```bash
cd packages/ui && npx vitest run src/Pagination.test.tsx
```

Attendu : **PASS**, épreuves de la tâche 1 comprises.

- [ ] **Étape 5 : commit**

```bash
git add packages/ui/src/Pagination.tsx packages/ui/src/Pagination.test.tsx
git commit -m "feat(ui): fenetrePages, la fenetre de numeros et ses bornes"
```

---

### Tâche 3 : la bande numérotée, sur bureau

**Fichiers :** Modifier `packages/ui/src/Pagination.tsx` · Test
`packages/ui/src/Pagination.test.tsx`

**Interfaces :** consomme `fenetrePages`. Produit un
`<nav aria-label="Pages">` contenant les boutons numérotés.

> **Pourquoi le `aria-label` compte :** jsdom n'applique pas les requêtes média.
> La bande et le sélecteur de la tâche 4 sont donc « visibles » en même temps
> dans les épreuves. Chacun se cible par son libellé, jamais par un rôle nu.

- [ ] **Étape 1 : écrire les épreuves qui échouent**

Ajouter `within` et `userEvent` aux imports du fichier s'ils n'y sont pas.

```tsx
describe('la bande numérotée', () => {
  const bande = () => screen.getByRole('navigation', { name: 'Pages' });

  it('rend un bouton par numéro de la fenêtre', () => {
    render(<Pagination page={1} pages={3} total={140} onAller={() => {}} />);
    expect(within(bande()).getAllByRole('button').map((b) => b.textContent)).toEqual(['1', '2', '3']);
  });

  it('marque la page courante pour le lecteur d’écran', () => {
    render(<Pagination page={2} pages={3} total={140} onAller={() => {}} />);
    expect(within(bande()).getByRole('button', { current: 'page' }).textContent).toBe('2');
  });

  it('mène à la page demandée', async () => {
    const allerA = vi.fn();
    render(<Pagination page={1} pages={3} total={140} onAller={allerA} />);
    await userEvent.click(within(bande()).getByRole('button', { name: 'Page 3' }));
    expect(allerA).toHaveBeenCalledWith(3);
  });

  it('refuse le geste sur la page où l’on est déjà', async () => {
    const allerA = vi.fn();
    render(<Pagination page={2} pages={3} total={140} onAller={allerA} />);
    await userEvent.click(within(bande()).getByRole('button', { current: 'page' }));
    expect(allerA).not.toHaveBeenCalled();
  });

  it('rend la coupure sans en faire une cible', () => {
    render(<Pagination page={1} pages={40} total={2000} onAller={() => {}} />);
    expect(bande().textContent).toContain('…');
    for (const b of within(bande()).getAllByRole('button')) {
      expect(b.textContent).not.toBe('…');
    }
  });

  it('groupe les milliers du numéro, comme le reste du produit', () => {
    render(<Pagination page={1200} pages={1200} total={60000} onAller={() => {}} />);
    expect(within(bande()).getByRole('button', { current: 'page' }).textContent).toBe('1 200');
  });
});
```

- [ ] **Étape 2 : les voir échouer**

```bash
cd packages/ui && npx vitest run src/Pagination.test.tsx -t "bande numérotée"
```

Attendu : `Unable to find an accessible element with the role "navigation"`.

- [ ] **Étape 3 : implémenter**

À côté de `FLECHE` :

```tsx
/** Un numéro de page. Même gabarit que les flèches — 44 px, même rayon. */
const NUMERO =
  'min-w-11 min-h-11 inline-flex items-center justify-center rounded-xl border ' +
  'text-sm font-body tabular-nums transition-colors cursor-pointer ' +
  'border-hairline/80 bg-surface text-ink hover:border-primary ' +
  'aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground ' +
  'aria-[current=page]:border-primary aria-[current=page]:cursor-default';
```

Dans le `<div className="flex items-center gap-2">`, **entre** les deux flèches :

```tsx
        <nav aria-label="Pages" className="hidden sm:flex items-center gap-2">
          {fenetrePages(page, pages).map((n, i) =>
            n === '…' ? (
              // Pas un bouton : une coupure ne mène nulle part, et un bouton
              // inerte apprend au lecteur d'écran à se méfier des autres.
              <span
                key={`coupure-${i}`}
                aria-hidden="true"
                className="px-1 text-sm font-body text-muted-foreground"
              >
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                aria-label={`Page ${n}`}
                aria-current={n === page ? 'page' : undefined}
                onClick={() => {
                  if (n === page) return;
                  onAller(n);
                }}
                className={NUMERO}
              >
                {formatMontant(n)}
              </button>
            ),
          )}
        </nav>
```

- [ ] **Étape 4 : les voir passer**

```bash
cd packages/ui && npx vitest run src/Pagination.test.tsx
```

- [ ] **Étape 5 : commit**

```bash
git add packages/ui/src/Pagination.tsx packages/ui/src/Pagination.test.tsx
git commit -m "feat(ui): la bande numerotee, sur les largeurs qui la portent"
```

---

### Tâche 4 : le sélecteur natif, sur mobile

**Fichiers :** Modifier `packages/ui/src/Pagination.tsx` · Test
`packages/ui/src/Pagination.test.tsx`

**Interfaces :** produit un `<select aria-label="Aller à la page">`.

- [ ] **Étape 1 : écrire les épreuves qui échouent**

```tsx
describe('le sélecteur de page', () => {
  const select = () => screen.getByLabelText('Aller à la page') as HTMLSelectElement;

  it('porte une option par page', () => {
    render(<Pagination page={1} pages={4} total={200} onAller={() => {}} />);
    expect(select().options.length).toBe(4);
  });

  it('montre la page courante et le total, en toutes lettres', () => {
    render(<Pagination page={3} pages={27} total={1340} onAller={() => {}} />);
    expect(select().options[select().selectedIndex]?.textContent).toBe('Page 3 sur 27');
  });

  it('mène à la page choisie', async () => {
    const allerA = vi.fn();
    render(<Pagination page={1} pages={4} total={200} onAller={allerA} />);
    await userEvent.selectOptions(select(), '3');
    expect(allerA).toHaveBeenCalledWith(3);
  });

  it('groupe les milliers, comme partout ailleurs', () => {
    render(<Pagination page={1} pages={1200} total={60000} onAller={() => {}} />);
    expect(select().options[1199]?.textContent).toBe('Page 1 200 sur 1 200');
  });
});
```

- [ ] **Étape 2 : les voir échouer**

```bash
cd packages/ui && npx vitest run src/Pagination.test.tsx -t "sélecteur de page"
```

Attendu : `Unable to find a label with the text of: Aller à la page`.

- [ ] **Étape 3 : implémenter**

Remplacer le `<p role="status">` par ce bloc. La région vive **reste** : elle
passe seulement en `hidden sm:block`.

```tsx
      {/* Deux présentations, un seul pouvoir. Le sélecteur natif est délibéré :
          la liste du système s'ouvre en plein écran, fait défiler mille pages
          sans effort, tient les 44 px sans qu'on les dessine, reste accessible
          au clavier et au lecteur d'écran, et ne coûte pas un octet de
          JavaScript. Sur un téléphone d'entrée de gamme au soleil d'un marché,
          c'est plus sûr qu'un menu maison.

          `appearance-none` habille le déclencheur aux jetons ; la liste reste
          celle d'Android, et c'est ce qu'on veut. */}
      <select
        aria-label="Aller à la page"
        value={page}
        onChange={(e) => onAller(Number(e.target.value))}
        className="sm:hidden min-h-11 appearance-none rounded-xl border border-hairline/80 bg-surface px-3 text-sm font-body text-ink tabular-nums"
      >
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            Page {formatMontant(n)} sur {formatMontant(pages)}
          </option>
        ))}
      </select>

      <p
        role="status"
        aria-live="polite"
        className="hidden sm:block text-xs font-body text-muted-foreground"
      >
        Page {formatMontant(page)} sur {formatMontant(pages)} — {formatMontant(total)} au total
      </p>
```

> **Ne pas retirer le `<p>` en croyant le remplacer.** La tâche 1 éprouve que
> `role="status"` porte le total, et `hidden` est une classe CSS que jsdom
> n'applique pas — l'épreuve reste vraie, et l'utilisateur au lecteur d'écran en
> dépend.

- [ ] **Étape 4 : les voir passer**

```bash
cd packages/ui && npx vitest run src/Pagination.test.tsx
```

- [ ] **Étape 5 : les six écrans appelants n'ont pas bougé**

```bash
cd apps/admin && npx vitest run
cd ../collecteur && npx vitest run
```

Attendu : **PASS** des deux côtés. Si un écran tombe, c'est une régression du
composant, pas de l'écran — revenir en arrière plutôt que rapiécer l'appelant.

- [ ] **Étape 6 : commit**

```bash
git add packages/ui/src/Pagination.tsx packages/ui/src/Pagination.test.tsx
git commit -m "feat(ui): un selecteur natif la ou les numeros ne tiennent pas"
```

---

### Tâche 5 : `chargerHistoriqueCarte`

Le niveau 2 a besoin des mises **d'une carte**. La fiche client en charge 40,
toutes cartes confondues, et **sans `carte_id`** : impossible de les rattacher.

**Fichiers :** Modifier `apps/collecteur/src/lectures-ecrans.ts` · Test
`supabase/tests/historique-carte.test.ts`

**Interfaces :** produit

```ts
export interface EvenementCarte {
  id: string;
  genre: 'mise' | 'retrait';
  montant: number;
  date: string;
}
export async function chargerHistoriqueCarte(carteId: string): Promise<EvenementCarte[]>
```

Du plus récent au plus ancien. Consommé par la tâche 7.

- [ ] **Étape 0 : lire le schéma avant d'écrire la requête**

```bash
npx supabase db query --local "select column_name from information_schema.columns where table_name = 'retraits' order by 1"
```

Si la colonne de rattachement ne s'appelle pas `carte_id`, corriger la requête
**et** l'interface. Ne pas deviner.

- [ ] **Étape 1 : écrire l'épreuve qui échoue**

Créer `supabase/tests/historique-carte.test.ts`. **Copier le montage de
`supabase/tests/valider-collecteur.test.ts`** — il crée déjà un collecteur, un
client et une carte dans l’ordre imposé par le schéma, et son en-tête explique
pourquoi cet ordre-là. Ajouter une seconde carte, trois mises sur la première,
et un retrait qui la clôture.

```ts
it('rend les mises et le retrait d’une carte, du plus récent au plus ancien', async () => {
  const evenements = await chargerHistoriqueCarte(carteId);

  expect(evenements.map((e) => e.genre)).toEqual(['retrait', 'mise', 'mise', 'mise']);
  const dates = evenements.map((e) => e.date);
  expect([...dates].sort().reverse()).toEqual(dates);
});

it('ne rend rien d’une autre carte', async () => {
  expect(await chargerHistoriqueCarte(autreCarteId)).toEqual([]);
});
```

- [ ] **Étape 2 : la voir échouer**

```bash
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/historique-carte.test.ts
```

Attendu : `chargerHistoriqueCarte is not a function`.

- [ ] **Étape 3 : implémenter**

Dans la section « Fiche client » de `apps/collecteur/src/lectures-ecrans.ts` :

```ts
/**
 * Le passé d'une carte, mises et clôture mêlées.
 *
 * Borné par construction : une carte porte 31 cases, donc au plus 31 mises et
 * un retrait. Pas de `limit`, pas de pagination — c'est tout l'intérêt d'avoir
 * pris la carte pour unité plutôt que le mois.
 */
export async function chargerHistoriqueCarte(carteId: string): Promise<EvenementCarte[]> {
  const [rMises, rRetraits] = await Promise.all([
    supabase
      .from('mises')
      .select('id, montant, encaisse_le')
      .eq('carte_id', carteId)
      .order('encaisse_le', { ascending: false }),
    supabase.from('retraits').select('id, montant_restitue, effectue_le').eq('carte_id', carteId),
  ]);

  const mises = (rMises.data ?? []).map((m) => ({
    id: String(m.id),
    genre: 'mise' as const,
    montant: Number(m.montant),
    date: String(m.encaisse_le),
  }));

  const retraits = (rRetraits.data ?? []).map((r) => ({
    id: String(r.id),
    genre: 'retrait' as const,
    montant: Number(r.montant_restitue),
    date: String(r.effectue_le),
  }));

  return [...mises, ...retraits].sort((a, b) => (a.date < b.date ? 1 : -1));
}
```

- [ ] **Étape 4 : la voir passer**

```bash
npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/historique-carte.test.ts
```

- [ ] **Étape 5 : commit**

```bash
git add apps/collecteur/src/lectures-ecrans.ts supabase/tests/historique-carte.test.ts
git commit -m "feat(collecteur): chargerHistoriqueCarte, borne par la carte"
```

---

### Tâche 6 : l'écran, niveau 1 — la pile de cartes

**Fichiers :** Créer `apps/collecteur/src/ecrans/HistoriqueClient.tsx` · Test
`apps/collecteur/src/ecrans/HistoriqueClient.test.tsx`

**Interfaces :** consomme `CarteFiche` de `lectures-ecrans.ts`, `usePagination`,
`Pagination` et `BadgeStatut` de `@kolek/ui`. Produit

```tsx
export function HistoriqueClient({
  nomClient,
  cartes,
  onFermer,
}: {
  nomClient: string;
  cartes: CarteFiche[];
  onFermer: () => void;
}): JSX.Element
```

- [ ] **Étape 1 : écrire les épreuves qui échouent**

```tsx
const CARTE = (n: number, statut: 'active' | 'cloturee', encaissees: number): CarteFiche => ({
  id: `c${n}`,
  mise: 5000,
  statut,
  misesEncaissees: encaissees,
  ouverteLe: `2026-0${n}-01T08:00:00Z`,
  clotureeLe: statut === 'cloturee' ? `2026-0${n}-28T08:00:00Z` : null,
});

describe('HistoriqueClient — la pile', () => {
  it('montre une ligne par carte, la plus récente en tête', () => {
    render(
      <HistoriqueClient
        nomClient="Konfé Ali"
        cartes={[CARTE(3, 'active', 10), CARTE(2, 'cloturee', 31), CARTE(1, 'cloturee', 12)]}
        onFermer={() => {}}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('montre le solde restituable, pas la somme brute des mises', () => {
    render(
      <HistoriqueClient nomClient="Konfé Ali" cartes={[CARTE(2, 'cloturee', 31)]} onFermer={() => {}} />,
    );
    // `soldeRestituable(31, 5000)` vaut **150 000**, pas 155 000 : la 1re mise
    // de chaque carte est la commission du collecteur. Sur l'ecran meme ou un
    // client conteste un montant, la multiplication naive afficherait 5 000 de
    // trop. Separateur insecable, d'ou textContent.
    expect(screen.getAllByRole('listitem')[0]?.textContent).toContain('150 000');
  });

  it('dit « Cycle terminé » pour une carte pleine, « Clôturée » sinon', () => {
    render(
      <HistoriqueClient
        nomClient="Konfé Ali"
        cartes={[CARTE(2, 'cloturee', 31), CARTE(1, 'cloturee', 12)]}
        onFermer={() => {}}
      />,
    );
    const lignes = screen.getAllByRole('listitem');
    expect(lignes[0]?.textContent).toContain('Cycle terminé');
    expect(lignes[1]?.textContent).toContain('Clôturée');
  });

  it('montre l’historique d’un client qui n’a qu’une carte', () => {
    // `FicheClient` cachait sa section sous `cartes.length > 1`. Un historique
    // court reste un historique, et le cacher surprend le jour où il compte.
    render(
      <HistoriqueClient nomClient="Konfé Ali" cartes={[CARTE(1, 'active', 3)]} onFermer={() => {}} />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('dit ce qu’il n’a pas plutôt que de rendre une liste vide', () => {
    render(<HistoriqueClient nomClient="Konfé Ali" cartes={[]} onFermer={() => {}} />);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText(/aucune carte/i)).toBeTruthy();
  });
});
```

- [ ] **Étape 2 : les voir échouer**

```bash
cd apps/collecteur && npx vitest run src/ecrans/HistoriqueClient.test.tsx
```

Attendu : le module n'existe pas.

- [ ] **Étape 3 : implémenter le niveau 1**

Créer `apps/collecteur/src/ecrans/HistoriqueClient.tsx`. Le squelette, dont la
structure porte le contrat :

```tsx
import { formatMontant, MISES_PAR_CYCLE, soldeRestituable } from '@kolek/core';
import { BadgeStatut, Pagination, usePagination, type Statut } from '@kolek/ui';

import type { CarteFiche } from '../lectures-ecrans';
import { CorpsEcran, EnTeteEcran, RienAMontrer } from './EnTeteEcran';

/** Le statut d’une carte, dit par la seule table du produit. */
function statutDe(carte: CarteFiche): Statut {
  if (carte.statut === 'active') return 'Actif';
  return carte.misesEncaissees >= MISES_PAR_CYCLE ? 'Cycle terminé' : 'Clôturée';
}

export function HistoriqueClient({ nomClient, cartes, onFermer }: {
  nomClient: string;
  cartes: CarteFiche[];
  onFermer: () => void;
}) {
  const { page, pages, total, visibles, allerA } = usePagination(cartes);

  return (
    <>
      <EnTeteEcran titre="Toutes les cartes" sousTitre={nomClient} onRetour={onFermer} />
      <CorpsEcran>
        {cartes.length === 0 ? (
          <RienAMontrer icone="credit-card" titre="Aucune carte pour l’instant" detail="" />
        ) : (
          <>
            <ul className="flex flex-col">
              {visibles.map((carte, i) => (
                <li
                  key={carte.id}
                  className={i === visibles.length - 1 ? '' : 'border-b border-hairline'}
                >
                  {/* … libellé, période, X/31, BadgeStatut, montant à droite … */}
                </li>
              ))}
            </ul>
            <Pagination page={page} pages={pages} total={total} onAller={allerA} />
          </>
        )}
      </CorpsEcran>
    </>
  );
}
```

> Vérifier la signature réelle de `EnTeteEcran` et `RienAMontrer` dans
> `apps/collecteur/src/ecrans/EnTeteEcran.tsx` avant de les appeler, et le nom
> d’icône dans `packages/ui/src/Icone.tsx`. Ne pas deviner.

Points imposés pour le contenu de la ligne :

- `<ul>` / `<li>` — une pile de cartes **est** une liste, et le dire au lecteur
  d'écran ne coûte rien. C'est aussi ce que `getAllByRole('listitem')` cible.
- `usePagination(cartes)` puis `<Pagination page={page} pages={pages}
  total={total} onAller={allerA} />` sous la liste. Contrat exact, pas de
  variante.
- Statut : carte active → `'Actif'` ; clôturée →
  `misesEncaissees >= MISES_PAR_CYCLE ? 'Cycle terminé' : 'Clôturée'`.
  **Aucune pilule dessinée à la main.** `MISES_PAR_CYCLE` (= 31) et
  `soldeRestituable` viennent tous deux de `@kolek/core`, jamais réécrits.
- Montant : **`formatMontant(soldeRestituable(carte.misesEncaissees, carte.mise))`**,
  importé de `@kolek/core`. **Jamais `mise * misesEncaissees`** — la première
  mise de chaque carte est la commission du collecteur, donc la multiplication
  naïve annonce une mise de trop à quelqu'un qui vient contester un montant.
  L'étiquette dit « à restituer », pas « collecté » : ce sont deux nombres
  différents et les confondre est précisément le défaut.
- Vide : `RienAMontrer` de `./EnTeteEcran`, texte « Aucune carte pour l'instant ».
- En-tête par `EnTeteEcran`, titre « Toutes les cartes », sous-titre `nomClient`,
  retour par `onFermer`.

- [ ] **Étape 4 : les voir passer**

```bash
cd apps/collecteur && npx vitest run src/ecrans/HistoriqueClient.test.tsx
```

- [ ] **Étape 5 : commit**

```bash
git add apps/collecteur/src/ecrans/HistoriqueClient.tsx apps/collecteur/src/ecrans/HistoriqueClient.test.tsx
git commit -m "feat(collecteur): la pile de cartes d'un client, paginee"
```

---

### Tâche 7 : l'écran, niveau 2 — le détail d'une carte

**Fichiers :** Modifier `apps/collecteur/src/ecrans/HistoriqueClient.tsx` · Test
`apps/collecteur/src/ecrans/HistoriqueClient.test.tsx`

**Interfaces :** consomme `chargerHistoriqueCarte` de la tâche 5.

- [ ] **Étape 1 : écrire les épreuves qui échouent**

En tête du fichier de test, à côté des autres montages :

```tsx
const chargerHistoriqueCarte = vi.fn();
vi.mock('../lectures-ecrans', async (reel) => ({
  ...(await reel<typeof import('../lectures-ecrans')>()),
  chargerHistoriqueCarte: (id: string) => chargerHistoriqueCarte(id),
}));
```

```tsx
describe('HistoriqueClient — le détail d’une carte', () => {
  beforeEach(() => {
    chargerHistoriqueCarte.mockResolvedValue([
      { id: 'r1', genre: 'retrait', montant: 150000, date: '2026-02-28T08:00:00Z' },
      { id: 'm1', genre: 'mise', montant: 5000, date: '2026-02-02T08:00:00Z' },
    ]);
  });

  it('ouvre la carte et montre ses événements', async () => {
    render(
      <HistoriqueClient nomClient="Konfé Ali" cartes={[CARTE(2, 'cloturee', 31)]} onFermer={() => {}} />,
    );
    await userEvent.click(screen.getAllByRole('listitem')[0]!.querySelector('button')!);

    expect(await screen.findByText(/retrait/i)).toBeTruthy();
    expect(chargerHistoriqueCarte).toHaveBeenCalledWith('c2');
  });

  it('ne pagine jamais le détail — 33 lignes au maximum, par construction', async () => {
    chargerHistoriqueCarte.mockResolvedValue(
      Array.from({ length: 31 }, (_, i) => ({
        id: `m${i}`,
        genre: 'mise' as const,
        montant: 5000,
        date: `2026-02-${String(i + 1).padStart(2, '0')}T08:00:00Z`,
      })),
    );
    render(
      <HistoriqueClient nomClient="Konfé Ali" cartes={[CARTE(2, 'cloturee', 31)]} onFermer={() => {}} />,
    );
    await userEvent.click(screen.getAllByRole('listitem')[0]!.querySelector('button')!);
    await screen.findAllByRole('listitem');

    expect(screen.queryByLabelText('Aller à la page')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
  });
});
```

- [ ] **Étape 2 : les voir échouer**

```bash
cd apps/collecteur && npx vitest run src/ecrans/HistoriqueClient.test.tsx -t "détail d’une carte"
```

- [ ] **Étape 3 : implémenter**

Ajouter un état `carteOuverte: string | null`. Quand il est posé, charger par
`useDonnees` — même forme que `Recus` — et rendre la liste des événements :

- montant `text-positive` pour une mise, `text-negative` pour un retrait ;
- date en `text-xs text-muted-foreground`, format `fr-FR` ;
- séparateur hairline sauf sur la dernière ligne ;
- retour à la pile par la flèche de l'en-tête.

**Aucun `Pagination` à ce niveau.** C'est le point du dessin : 33 lignes au
maximum, pour toujours.

- [ ] **Étape 4 : les voir passer**

```bash
cd apps/collecteur && npx vitest run src/ecrans/HistoriqueClient.test.tsx
```

- [ ] **Étape 5 : commit**

```bash
git add apps/collecteur/src/ecrans/HistoriqueClient.tsx apps/collecteur/src/ecrans/HistoriqueClient.test.tsx
git commit -m "feat(collecteur): le detail d'une carte, jamais pagine"
```

---

### Tâche 8 : le point d'entrée, et une pilule de moins

**Fichiers :** Modifier `apps/collecteur/src/ecrans/FicheClient.tsx` (fonction
`Historique`, lignes 813-860) · Test
`apps/collecteur/src/ecrans/FicheClient.test.tsx`

- [ ] **Étape 1 : écrire les épreuves qui échouent**

Dans le `describe` existant qui rend une fiche à deux cartes :

```tsx
it('mène à l’historique complet', async () => {
  await userEvent.click(screen.getByRole('button', { name: /historique complet/i }));
  expect(await screen.findByText(/toutes les cartes/i)).toBeTruthy();
});

it('n’écrit plus « Rendue avant la fin » — le statut vient de BadgeStatut', () => {
  // Le mot n'est pas dans l'union `Statut`, et la règle 4.11 du système de
  // design dit « une seule table ». Le compte X/31 porte déjà la nuance.
  expect(screen.queryByText(/rendue avant la fin/i)).toBeNull();
});
```

- [ ] **Étape 2 : les voir échouer**

```bash
cd apps/collecteur && npx vitest run src/ecrans/FicheClient.test.tsx
```

- [ ] **Étape 3 : implémenter**

1. Remplacer le `<span className="px-2.5 py-1 rounded-pill …">` de la fonction
   `Historique` par
   `<BadgeStatut statut={k.misesEncaissees >= MISES_PAR_CYCLE ? 'Cycle terminé' : 'Clôturée'} />`.
2. Retirer la condition `fiche.cartes.length > 1` de la ligne 180 : la section
   devient un résumé, et le bouton mène toujours à l'écran complet.
3. Ajouter sous la section un bouton pleine largeur « Historique complet » qui
   monte `HistoriqueClient` avec `nomClient={fiche.nom}` et
   `cartes={fiche.cartes}`.

- [ ] **Étape 4 : les voir passer**

```bash
cd apps/collecteur && npx vitest run
```

Attendu : **PASS** des 25 fichiers (24 existants plus le nouveau).

- [ ] **Étape 5 : commit**

```bash
git add apps/collecteur/src/ecrans/FicheClient.tsx apps/collecteur/src/ecrans/FicheClient.test.tsx
git commit -m "feat(collecteur): mener a l'historique complet, et une pilule de moins"
```

---

### Tâche 9 : la vérification entière, avant de pousser

- [ ] **Étape 1 : la chaîne complète**

```bash
npm run verifier
```

Attendu : verte de bout en bout. Elle enchaîne `db:reset`, thème, marque,
paliers, champs, exemples d'environnement, manifeste, portillons, lint,
typecheck, les tests des trois applications, ceux des scripts, ceux de la base,
la construction et `verifier:bundles`.

- [ ] **Étape 2 : lire ce qui est servi, pas seulement ce qui est construit**

Après la poussée et le déploiement Netlify :

```bash
node -e '(async()=>{const r=await fetch("https://app.kolek.cash/");const h=await r.text();console.log([...h.matchAll(/assets\/(index-[A-Za-z0-9_-]+\.js)/g)].map(x=>x[1])[0]);})()'
```

Comparer à l'empreinte du `dist/` local. Sur ce dépôt, **un CI vert ne dit rien
de ce qui est servi** — c'est mesuré, pas supposé.
