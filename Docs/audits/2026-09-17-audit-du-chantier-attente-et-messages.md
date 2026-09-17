# Audit du chantier « attente et messages » — ce que la PR #8 affirme tient-il ?

**2026-09-17** · **Périmètre :** branche `attente-et-messages` à `cd08b7e`,
cinq commits au-dessus de `09a8641`, fusion de `origin/main` comprise. Pile
locale debout, application réelle conduite par Chrome sans interface.

> Ce n'est pas une relecture du diff — elle a déjà eu lieu, tâche par tâche.
> C'est un audit **de mes propres affirmations** : le correctif fait-il ce que
> j'ai écrit qu'il faisait, à quel prix, et les documents disent-ils vrai ?

**Aucune écriture de production, aucune migration, aucune Edge Function.**
`git diff --stat origin/main...HEAD -- supabase` rend vide. Tout ce qui suit a
été mesuré sur la base locale.

---

## Ce que j'ai cherché à mettre en défaut, et qui a tenu

### Le correctif fait ce qu'il annonce

Deux regards indépendants, même protocole : quatre mises posées hors ligne,
retour en ligne avec latence imposée par requête.

| | avant `b66ccb7` | après |
| --- | --- | --- |
| bandeau | « 4 restantes » **figé 11,1 s** puis disparition | 4 → 3 → 2 → 1 → éteint |

### L'argent arrive, et la file se vide

Le point qui méritait le plus de méfiance : un bandeau qui décroît plus vite que
l'envoi mentirait dans le sens le plus grave. Contrôlé de bout en bout — quatre
mises posées hors ligne, retour en ligne, puis lecture directe de la file du
téléphone et de la base :

- bandeau après la passe : **éteint**
- magasin `file` d'IndexedDB : **`[]`**
- écran `Alertes` : « Rien à signaler »
- table `mises` : **+4** (16 → 20)

Une mesure antérieure avait laissé croire à 2 envois sur 4. C'était **ma boucle
d'échantillonnage** qui sortait avant la fin de la passe, pas le code : reprise
avec une attente sur la disparition du bandeau, le compte tombe juste.

---

## Le défaut que je cherchais, et qui n'était pas là

**L'hypothèse.** `lireCache` (`cache.ts:102`) rend `null` dès que la révision
change. Or chaque annonce de `surProgres` fait monter `revision` dans la
coquille (`Coquille.tsx:157`), et **sept des onze écrans** portent
`besoinReseau: true` en suivant cette révision. En théorie, une passe de N
opérations devait donc coûter N invalidations, N passages par l'état
`donnees === null, erreur === null` — c'est-à-dire **le squelette** — et N
requêtes réseau. Exactement le défaut que ce chantier existe pour supprimer.

**La mesure dit non.** Installé sur l'écran `Bilan`, qui lit le réseau et suit
la révision, pendant une passe de quatre mises :

```
squelettes simultanés max : 0
passages par le squelette  : 0
requêtes REST pendant      : 1 lecture de Bilan (mouvements, cartes, clients)
```

**Avec témoin**, parce qu'un zéro sans témoin ne vaut rien : la même sonde voit
**12 squelettes** au premier chargement du même écran, et le texte confirme
qu'on est bien sur le `Bilan`. Le zéro est donc un vrai zéro.

Une lecture par passe — soit ce que coûtait déjà le rappel de fin de passe avant
le correctif. **Le coût n'a pas augmenté.**

> Ce que l'audit ne tranche pas : *pourquoi* les quatre annonces ne produisent
> qu'une relecture. Le regroupement automatique des rendus de React est
> l'explication probable, elle n'est pas démontrée ici. Le fait mesuré — zéro
> squelette, une lecture — ne dépend pas de l'explication ; mais si une version
> future de React changeait ce regroupement, l'hypothèse redeviendrait vivante.
> **À reprendre si le bandeau se met à faire clignoter les écrans.**

---

## Le défaut trouvé, et corrigé

**Neuf renvois `fichier:ligne` sur dix ne montraient plus ce qu'ils
annonçaient.** Mes propres insertions les avaient décalés, et la fusion de
`main` a fait le reste. Un lecteur qui suivait `FicheClient.tsx:763` — le renvoi
qui porte toute la démonstration du « code mort » — tombait sur
`contexte.current.onEcriture()`.

| annoncé | trouvait | vrai |
| --- | --- | --- |
| `moteur.ts:135` | `return 'impossible'` | `144` |
| `synchroniseur.ts:161` | `const consignerOp = …` | `192` |
| `Coquille.tsx:154` | ligne vide | `157` |
| `FicheClient.tsx:763` | `contexte.current.onEcriture()` | `711` |
| `Coquille.tsx:326` | `{erreurSortie}` | `345` |
| `Clients.tsx:669` | `<Pagination …>` | `676` |
| `Coquille.tsx:452` | un commentaire | `479` |
| `Accueil.tsx:35` | `/**` | `33` |
| `passe`, ligne 104 | `async () =>` | `105` |

Corrigés en `af1af95`, puis **revérifiés un par un** : onze renvois contrôlés,
zéro douteux. Le corps de la PR #8 portait le même renvoi faux ; corrigé aussi.

Le tableau des cinq incréments garde ses numéros d'avant le correctif — c'est ce
qu'il décrit — mais son en-tête le dit désormais, et une phrase donne les
positions d'après.

**La leçon, au-delà de ce chantier :** un document qui cite `fichier:ligne`
pourrit dès que le fichier bouge, et il pourrit **en silence**. Ici, c'est le
commit qui corrigeait le défaut qui a cassé les renvois décrivant ce défaut.
Vérifier les renvois **après** le correctif et **après** toute fusion, pas au
moment de les écrire.

---

## Ce qui reste ouvert

- **`db:reset` et `test:db` n'ont pas tourné sur ce poste** — refusés comme
  ressource partagée, à juste titre : les conteneurs sont communs aux worktrees
  et une session voisine ouverte depuis quatre jours ne répond à personne. C'est
  le travail `Base` de la CI qui les couvre, et il **passe** (3 min 30).
- **Quatre contrôles rouges sur la PR**, tous du projet Netlify
  `helpful-kleicha-e77441`. Les mêmes quatre étaient rouges sur la **PR #7, déjà
  fusionnée** : projet mort accroché au dépôt, pas une régression. À décrocher.
- **`stockageDejaSignale`**, variable de module : un relais de collecteur sans
  rechargement de page ne revoit pas l'avis de stockage. Consigné sans tâche,
  l'avertissement restant accessible sur `Profil`.

---

## Verdict

Le correctif tient, ne coûte rien de plus qu'avant, et ne perd pas d'argent —
mesuré, avec témoins, pas déduit. Les documents, eux, mentaient sur neuf renvois
et ont été corrigés. **La PR #8 est livrable.**
