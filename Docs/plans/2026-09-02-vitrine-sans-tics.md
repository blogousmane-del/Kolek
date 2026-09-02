# Vitrine sans tics — plan d'implémentation

**But :** retirer de `apps/site` ce qui la fait lire comme une page engendrée par un
modèle, sans toucher à ce qu'elle a de juste.

**Origine :** audit du 2026-09-02 mené avec le skill `design-taste-frontend`.
Treize constats, gradés Grave / Important / Moyen.

**Ce que l'audit a trouvé de sain, et qu'on ne touche pas :** zéro couleur en dur
hors du système de tokens (admin, collecteur, ui) ; or sur `dark-canvas` à
**9,17:1** quand AA en demande 4,5 ; `prefers-reduced-motion` respecté partout ;
prix et bornes tirés de `@kolek/core`, jamais recopiés ; noms de démonstration
ivoiriens et crédibles.

## Décisions prises avant l'exécution

| Question | Décision |
|---|---|
| Le `h1` mélange Sora et Instrument Serif | **Bodoni Moda** remplace Instrument Serif. Un Didone gravé — la typographie des coupures de banque, c'est-à-dire du sujet que le hero met déjà en scène (rosace guillochée, valeur faciale 31, bande de sécurité). |
| `Docs/Kolek Design System.md` interdit l'or | La règle visait les **applications**. L'or est déjà dans `tokens.ts`, dans le favicon et dans l'image Open Graph. On écrit la distinction au lieu de la contredire en silence. |
| Zéro image sur tout le site | **Maquette du produit en CSS**, pas de photographie. Montre l'écran réel du collecteur avec des données de démonstration ; ne dépend d'aucun fichier à fournir. |

---

## Chantier 1 — Écrire le langage

**Fichier :** `Docs/Kolek Design System.md`

- § 1 : « Aucun or dans l'interface » devient « Aucun or dans les **applications** »,
  suivi de la règle qui manquait : l'or est une couleur de **marque**, interdite
  sur les surfaces qui manipulent l'argent.
- Principe 6 (« Palette resserrée ») renvoie à cette exception au lieu de la nier.
- § 3.2 : `--font-drama` documentée — Bodoni Moda, vitrine uniquement, avec deux
  règles qui découlent des défauts trouvés : **jamais deux familles dans un titre
  pour l'emphase**, et **`leading` ≥ 1,1 en display** à cause des jambages.

**Fini quand** le système de design ne contredit plus le code servi en production.

## Chantier 2 — La typographie du hero et du manifeste

**Fichiers :** `apps/site/package.json`, `apps/site/src/main.tsx`,
`apps/site/src/styles.css`, `Hero.tsx`, `Philosophie.tsx`

- `@fontsource/instrument-serif` sort, `@fontsource/bodoni-moda` entre.
- `lucide-react` sort : déclarée en dépendance, importée nulle part.
- `--font-drama: 'Bodoni Moda', 'Times New Roman', serif`.
- `Hero.tsx` : `leading-[0.95]` → `leading-[1.12]` + réserve basse. Le `p` de
  « précision » était rogné.
- `Philosophie.tsx` : `leading-[1.05]` → `leading-[1.15]` + réserve. Le `j` de
  « juste » était rogné.

**Fini quand** aucune jambe descendante n'est coupée à aucune largeur, et
qu'`Instrument Serif` n'apparaît plus dans `package-lock.json`.

## Chantier 3 — Montrer le produit, et pouvoir naviguer au téléphone

**Fichiers :** `apps/site/src/vitrine/Telephone.tsx` (créé), `Hero.tsx`, `Navbar.tsx`

- Une maquette d'écran collecteur en CSS, dans le hero, colonne droite à partir
  de `lg`. Le premier écran montre enfin ce qu'on vend.
- La navigation était `hidden … md:block` **sans rien pour la remplacer** :
  sous 768 px les quatre liens de section étaient inatteignables. On ajoute le
  panneau replié, avec `aria-expanded`, fermeture à l'`Échap` et au clic sur un lien.

**Fini quand** les quatre liens de section sont atteignables à 360 px de large.

## Chantier 4 — Le ménage

**Fichiers :** toutes les sections

- **Sur-titres** : 12 pour 7 sections → 3, et seulement là où ils marquent une
  vraie section de l'argumentaire. Les étiquettes internes aux cartes perdent le
  `tracking-widest` monospace sans perdre leur information.
- **Points qui clignotent** : 4 → 0. `animate-pulse` sur un point décoratif ne
  signale aucun état ; le curseur de la machine à écrire garde un vrai
  clignotement en `steps(1)`, qui est ce que fait un terminal.
- **Tirets cadratins** : le tiret est correct en français, douze sur une page ne
  le sont pas. Ceux qui portent une incise restent, les autres deviennent
  ponctuation ordinaire. `aria-label="Kolek — haut de page"` corrigé.
- **Sous-titre du hero** : 28 mots → sous 20.
- **Couture de fonds** : `Tarification` passe de `bg-paper` (#FBFAF6, chaud) à
  `bg-canvas` (#F4F5F2, froid) pour ne plus jouxter `Protocole` avec un écart
  trop petit pour se lire comme une intention.
- **Trois cartes égales** : décalage vertical de la carte centrale à partir de
  `lg`. Trois instruments restent trois, la grille cesse d'être un gabarit.
- **Deux appels à l'action pour le même geste** : la barre de navigation garde
  « Se connecter » (le visiteur qui revient) ; le bouton principal du hero passe
  à l'ouverture de compte (le visiteur qui arrive). Une surface, un travail.

**Fini quand** les comptages tombent : ≤ 3 sur-titres, 0 `animate-pulse` décoratif.

## Chantier 5 — La machine à écrire

**Fichier :** `apps/site/src/vitrine/Fonctionnalites.tsx`

`setInterval(…, 34)` appelle `setCourante` : environ 29 rendus React complets par
seconde, en continu, sur la cible déclarée du produit — un téléphone d'entrée de
gamme. On écrit dans le DOM par `ref`, sans état React. Le rendu visible est
identique.

**Fini quand** le composant ne provoque plus aucun rendu React pendant l'animation.
