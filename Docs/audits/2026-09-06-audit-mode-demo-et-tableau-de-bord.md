# 2026-09-06 — Audit du mode démonstration et du tableau de bord Admin

**Périmètre :** les deux derniers commits du dépôt — `51623df` (« optimisation
du Tableau de Bord Admin et mode Demo », 2026-09-05) et `87b567b` (« repli
statique d'attente et diagnostic », 2026-09-06) — relus sous la grille des vingt
contrôles du [2026-09-04](2026-09-04-audit-securite-20-controles.md), puis sous
l'angle du design system.

**Verdict : aucune faille exploitable, mais l'application d'administration ne se
construisait plus, et son tableau de bord affichait des montants fabriqués.**

| | Nombre | État |
|---|---|---|
| 🔴 Bloquant | 1 | **corrigé** — la compilation |
| 🟠 Important | 2 | **corrigés** — la démonstration, les montants inventés |
| 🟡 À faire | 5 | 5 corrigés |
| Propositions | 6 | argumentées plus bas, non faites |

Le serveur n'a pas bougé : ni migration, ni Edge Function, ni policy. La RLS,
`est_admin()` et le portillon sont exactement ce que le 2026-09-04 a mesuré.
Tout ce qui suit se joue dans le navigateur — ce qui ne veut pas dire que c'est
sans conséquence, et le 🟠 n°2 explique pourquoi.

---

## 🔴 L'application d'administration ne se construisait plus

```
apps/admin/src/ecrans/TableauDeBord.tsx(127,13): error TS2322: Type '"rotate-cw"' is not assignable to type NomIcone
apps/admin/src/ecrans/TableauDeBord.tsx(258,26): error TS2322: Type '"grid"' …
apps/admin/src/ecrans/TableauDeBord.tsx(371,28): error TS2322: Type '"activity"' …
apps/admin/src/Connexion.tsx(1,10): error TS6133: 'Bouton' is declared but its value is never read.
```

Trois icônes absentes du registre, et un import laissé derrière. `Icone.tsx`
tient un registre explicite — c'est écrit dans le fichier : « une icône non
déclarée est une erreur de compilation, et le paquet ne contient que ce que les
écrans dessinent réellement ». Le garde-fou a fonctionné ; personne ne l'a lu.

`npm run build` de l'admin vaut `tsc -b && vite build`. Le commit `51623df` a
donc laissé le dépôt dans un état où **la console d'administration ne pouvait
plus être déployée**. Netlify aurait refusé la construction ; rien n'est parti
en ligne depuis, ce qui a limité les dégâts à la branche.

**Corrigé.** `refresh-cw` (qui existait déjà et que la barre haute utilise
ailleurs), `layout-dashboard` et `history` à la place des trois inconnues,
l'import mort retiré. `npx tsc -b apps/admin` sort à zéro.

---

## 🟠 1. Le mode démonstration passait devant la session

```tsx
// apps/admin/src/App.tsx, avant
if (modeDemo) {
  return <Coquille estSuper={true} modeDemoActive={true} onQuitterDemo={quitterDemo} />;
}
if (!pret) return null;
if (!session) return <Connexion onActiverDemo={activerDemo} />;
return <Portillon key={session.user.id} onActiverDemo={activerDemo} />;
```

`modeDemo` naissait d'une lecture de `localStorage.getItem('kolek_admin_demo')`.
Trois conséquences, dans l'ordre croissant de gravité.

**a. Un drapeau de navigateur ouvrait la coquille complète, `estSuper` forcé à
vrai.** N'importe qui atteignant l'adresse de l'admin — elle est publique, seule
son indexation est fermée — obtenait la console de plateforme, menus compris.
`Coquille.tsx` porte pourtant la règle inverse en commentaire : « inutile
d'apprendre à un administrateur métier qu'il existe un niveau au-dessus du
sien ».

Ce que ça ne donnait pas : rien. Chaque écran redemande ses données au serveur,
qui répond `401` sans session. La cartographie des Edge Functions est de toute
façon lisible dans le paquet JavaScript. Le contrôle n°6 — « aucune décision
d'accès ne repose sur le navigateur » — reste vrai côté serveur ; il devenait
faux comme description du code.

**b. Le bouton de démonstration figurait aussi sur l'écran de refus du
portillon.** Un compte authentifié mais non administrateur lisait « Accès
réservé », et juste en dessous « Accéder en mode Démo (Aperçu) ». Ce n'est pas
une faille, c'est pire à sa manière : c'est enseigner qu'un refus se contourne.

**c. `useVueGlobale` lisait le même drapeau de son côté — et c'est la moitié
coûteuse.** `localStorage` est partagé par tous les onglets d'une origine. Un
administrateur réel, connecté, sa console ouverte : quelqu'un active la
démonstration dans un autre onglet ; au premier `recharger()` — après avoir créé
un collecteur, modifié une fiche, supprimé une ligne — sa console réelle
affichait les chiffres de la démonstration. **Sans bandeau**, puisque son `App`
avait démarré hors démonstration. 1 420 clients et 24 650 000 FCFA inventés,
présentés comme sa caisse.

**Corrigé.** L'ordre des portes est renversé et le stockage disparaît :

```tsx
if (!pret) return null;
if (session) return <Portillon key={session.user.id} />;
if (vueDemo) return <Coquille estSuper={false} vueDemo={vueDemo} onQuitterDemo={…} />;
return <Connexion onActiverDemo={activerDemo} demoEnCoursDeChargement={chargementDemo} />;
```

- **La session d'abord**, toujours. Une démonstration qui passe devant une
  session n'est plus une démonstration.
- **`estSuper` à faux.** La console de plateforme n'a rien à montrer à un
  visiteur.
- **Aucune trace dans le navigateur** : ni `localStorage`, ni `sessionStorage`,
  ni paramètre d'adresse. La démonstration vit dans un état React et meurt avec
  l'onglet — c'est ce qui rend le cas (c) structurellement impossible.
- **`useVueGlobale(vueFournie?)`** ne lit plus rien nulle part : les chiffres
  fictifs ne peuvent entrer que par en haut, descendus par `App`.
- **Le bouton retiré du portillon**, et un commentaire à sa place qui dit
  pourquoi. La démonstration est proposée avant la connexion, où elle ne
  contredit aucun refus.
- **Les données de démonstration sont sorties dans leur propre module**,
  `demo.ts`, chargé par `import()` au clic. Constaté à la construction :
  `dist/assets/demo-CzAi8Jvp.js 4,04 kB` — un fragment séparé, que la console
  d'un administrateur ne télécharge jamais.
- **Le bandeau ne ment plus.** « Vos données de test sont chargées avec succès »
  laissait entendre que ces chiffres étaient les siens. Il dit maintenant
  « Démonstration · Chiffres fictifs. Aucune donnée réelle n'est affichée », sous
  `role="status"`.

Et **cinq tests** dans `apps/admin/src/App.test.tsx`, parce que la leçon de F1
tient toujours en une phrase — *aucun test ne posait la question*. Ils vérifient
l'ordre des portes, l'inefficacité du drapeau d'origine dans les deux sens, le
niveau plateforme refusé au visiteur, et l'absence de toute écriture dans le
navigateur.

> Note d'outillage : `apps/admin/vitest.config.ts` n'avait pas le `setupFiles` de
> `packages/ui`, qui pose un `localStorage` en mémoire — Node prive jsdom du
> sien. Sans lui, le test « n'écrit rien dans le navigateur » aurait passé faute
> de navigateur. Le fichier partagé couvre désormais aussi `sessionStorage`.

---

## 🟠 2. Le tableau de bord fabriquait ses montants

Le sélecteur de période, posé en haut de l'écran, agissait sur **tous** les
chiffres — en les multipliant par des coefficients écrits à la main :

```ts
case 'aujourdhui': return 0.12;
case '7j':         return 0.35;
case '30j':        return 0.85;
default:           return 1.0;
```

« 7 derniers jours » affichait donc 35 % de l'encaissé depuis l'ouverture,
présenté comme un montant lu. L'encours suivait la même règle, à 0,95.

Rien dans la base ne dit cela, et rien ne pouvait le dire : `VueGlobale.totaux`
est un cumul sans dimension temporelle. Seuls les `mouvements` portent une date.

Deux pourcentages étaient écrits en dur au-dessus des cartes — `+12.4%` sur
l'encours, `+8.1%` sur les commissions — et un badge « Activité saine »
s'affichait quels que soient les chiffres.

**Ce que la propriété `tendance` de `CarteStat` dit d'elle-même**, depuis le
jour où elle a été écrite :

> « Une tendance suppose un état passé auquel se comparer. La base ne garde aucun
> instantané […]. Tant qu'aucune table d'historique n'existe, tout pourcentage
> affiché ici serait inventé — et un chiffre inventé sur un tableau de bord de
> pilotage se croit longtemps. »

Le composant fait d'ailleurs plus que porter le chiffre : il écrit
« vs période précédente » sous le badge. Y glisser un taux d'activité — un
rapport, pas une variation — produirait une phrase fausse à partir d'un nombre
juste.

**Corrigé.**

- Les coefficients sont supprimés. Les montants affichés sont ceux de la vue,
  sans exception.
- La fenêtre de temps descend dans le panneau des mouvements, **le seul jeu de
  données daté**, et y filtre réellement sur `survenu_le`. « Aujourd'hui » compte
  depuis minuit local, comme la journée que le collecteur déclare en caisse.
- Aucune `tendance` n'est passée à aucune des quatre cartes. Ce qui est un
  rapport se dit dans `precision`, où rien ne prétend le comparer à hier.
- « Activité saine » devient « Depuis l'ouverture » — une date, pas un avis.

Et **cinq tests** dans `TableauDeBord.test.tsx` : les totaux sont ceux de la vue,
changer la fenêtre ne déplace aucun montant, la fenêtre filtre bien les
mouvements, la phrase « vs période précédente » est absente de l'écran, et les
deux groupes de filtres s'annoncent.

---

## 🟡 Design system — cinq écarts, tous corrigés

1. **L'anneau de focus éteint.** `focus:outline-hidden focus:border-primary` sur
   le champ de recherche : la seule marque du focus devenait un changement de
   couleur de bordure. C'est exactement ce que le commit `3696544` avait corrigé
   sur la vitrine trois jours plus tôt. Remplacé par
   `focus-visible:outline-2 outline-offset-1`, posé aussi sur les huit boutons de
   filtre et sur les deux boutons de la démonstration.

2. **Un champ sans étiquette.** L'`<input>` brut n'avait qu'un texte d'invite,
   qui disparaît dès qu'on tape. Une `<label class="sr-only">` et un `useId`,
   comme `Champ.tsx`.

3. **Des filtres muets pour l'assistance.** Huit boutons se suivaient sans
   `aria-pressed` ni regroupement : la couleur disait l'état à l'œil et à
   personne d'autre. Deux `role="group"` nommés, `aria-pressed` sur chaque
   bouton.

4. **Valeurs arbitraires hors échelle.** `text-[11px]` (deux occurrences) et
   `max-h-[520px]`. Le premier passe à `text-xs`, le second disparaît au profit
   de `flex-1 min-h-0` — le plafond en dur laissait un vide sur grand écran et
   coupait la liste sur petit.

5. **Casse de titre à l'anglaise.** « Raccourcis de Gestion », « Performance par
   Zone Géographique », « Flux & Transactions », « Total Encaissé », « Cartes
   Actives ». Remis en casse de phrase, et l'esperluette en « et ».

Deux défauts de moindre portée, corrigés au passage : une cinquième zone
reprenait la couleur de la première dans une liste où la pastille sert
d'identité — la liste est bornée à la palette ; et « Actualiser » appelait
`window.location.reload()`, qui repose les polices, rejoue le portillon et perd
la page ouverte pour rafraîchir un seul appel — il appelle `recharger`.

Enfin, l'entrée de la démonstration sur l'écran de connexion était une pastille
or flottante en bas à droite, avec émoji et `hover:scale-105`, dont le texte
mêlait le français et l'anglais (« Voir l'Admin Dashboard (Mode Démo) »). Sur un
écran de 360 px elle recouvrait le bouton « Se connecter ». Elle est centrée,
sobre, et en français.

---

## Le commit `87b567b` — rien à redire

L'écran d'attente ajouté aux trois `index.html` a été relu sous l'angle de la
CSP, seul endroit où il pouvait faire des dégâts.

| Point | Constat |
|---|---|
| `<style>` en ligne | autorisé — `style-src 'self' 'unsafe-inline'` sur les trois `netlify.toml` |
| `<script>` en ligne | **aucun** ; `script-src 'self'` reste intact |
| Ressource externe | aucune ; l'`<img>` pointe le favicon local |
| Thème | le repli de la vitrine est sombre (`#06140e`), les deux outils internes clairs — pas d'éclair blanc sur fond sombre |
| Mouvement réduit | `prefers-reduced-motion` traité, et le délai du diagnostic conservé |

Les couleurs y sont recopiées de `tokens.ts` plutôt qu'importées — le fichier
l'explique : le document est servi avant Tailwind. C'est un couplage assumé et
documenté, pas un oubli.

---

## Ce qui reste — six propositions, par ordre d'utilité

1. **Une table d'instantanés quotidiens.** C'est la racine des deux défauts du
   tableau de bord : sans passé, ni tendance ni période ne sont calculables, et
   l'écran a fini par en inventer. Une ligne par jour et par collecteur —
   encaissé, commissions, restitutions, encours, clients, cartes actives —
   écrite par la même horloge que le drainage des avis. Elle débloque d'un coup
   la propriété `tendance` de `CarteStat`, un vrai sélecteur de période sur les
   montants, et une courbe.

2. **Un paramètre de période sur `agregat_admin`.** Une fois les instantanés en
   place, le filtre doit être serveur : filtrer côté navigateur suppose d'avoir
   déjà tout téléchargé, ce que la borne de 500 lignes sur `cartes` interdit
   déjà.

3. **La carte « Abonnements à échoir » ne mène nulle part.** C'est la seule des
   quatre qui appelle une action. Un clic vers l'écran Abonnements, filtré sur
   les échéances à trente jours.

4. **Les compteurs bruts ne sont pas formatés.** « 8450 mises » s'écrit
   « 8 450 » partout ailleurs dans le produit. `formatMontant` sait déjà le
   faire ; il n'est appliqué qu'aux montants.

5. **Aucun export depuis le tableau de bord.** `exporter.ts` existe et sert
   ailleurs. La répartition des flux et les zones sont exactement ce qu'on
   recopie à la main aujourd'hui.

6. **Un lien d'évitement vers le contenu.** Au clavier, atteindre le tableau de
   bord demande de traverser toute la barre latérale à chaque changement de page.

Et les trois ⚪️ du 2026-09-04 restent ouverts, inchangés : longueur minimale des
mots de passe, limites de débit, essai des deux comptes en production. Ils se
lisent dans le tableau de bord Supabase, hors de portée d'ici.

---

## Ce qui a été mesuré, pas déduit

```
npx tsc -b apps/admin                     0 erreur      (4 avant)
npm run typecheck --workspaces            0 erreur
npm test                                  456 tests, 0 échec
  dont apps/admin                         85, dont 10 neufs
npm run build                             3 applications construites
  dist/assets/demo-CzAi8Jvp.js            4,04 kB — fragment séparé
npm run verifier:bundles                  « Aucune fuite dans les artefacts »
npm run verifier:theme                    « theme.css est à jour »
```

Les suites de base (`test:db`, 699 tests) n'ont pas été rejouées : aucune
migration, aucune fonction, aucune policy n'a été touchée. Le dire plutôt que
laisser croire à une vérification complète.
