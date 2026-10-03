# Le billet : refonte visuelle du collecteur, fondations et écrans pilotes

Demande de l'exploitant, le 2026-10-02 : reprendre tout le design des
applications, sauf la vitrine, pour qu'il ne ressemble plus à un travail
de générateur. Le programme compte trois chantiers (voir « Découpage »). Ce
document couvre le premier : les **fondations** communes, les **composants
partagés** qu'elles touchent, et trois **écrans pilotes** du collecteur
(Accueil, Encaisser, Retrait).

Règle qui prime sur le reste, reprise du chantier D : **aucun chiffre que
l'état ne porte pas déjà**. Rien de ce qui suit ne demande une lecture
réseau nouvelle, une migration ou une fonction serveur.

## Ce que l'exploitant a validé

Tout a été montré en maquettes dans le compagnon visuel, puis validé un
écran après l'autre. Les maquettes sont versionnées, lisibles seules dans un
navigateur, avec les scripts qui les produisent :

- `Docs/maquettes/le-billet/accueil.html` : trois structures d'accueil.
  **B, « Le billet plein », est retenue** (clic dans le compagnon, puis
  « oui tout me va »). La planche du bas (couleurs, trois familles, ce qui
  part, ce qui reste) est validée avec elle.
- `Docs/maquettes/le-billet/encaisser.html` : l'encaissement en trois temps
  et le tampon. Validé (« oui c'est très excellent »).
- `Docs/maquettes/le-billet/retrait.html` : liste compacte, décompte,
  clôture. Validé, avec la conséquence sur la vitrine (« vas-y ») : la carte
  de collecte qu'elle montre dans son téléphone prend le nouveau dessin.
- `Docs/maquettes/le-billet/source/` : les générateurs (`node accueil.mjs
  <dossier>`). Les chantiers 2 et 3 partiront de `commun.mjs`.

La direction elle-même, « Le billet », avait été choisie avant les
maquettes : prolonger l'identité de kolek.cash (vert coffre, gravure
guillochée en signature discrète, montants en chiffres de caisse, interface
sobre), l'or réservé à la marque et jamais posé sur un montant.

## Ce qui a été mesuré, et où

Relevé sur `2281ec5` (main), avant toute proposition.

- **Les neuf tuiles pastel de l'accueil** viennent du gabarit Banani dont
  l'application est partie. `ActionsRapides.tsx` les peint avec quatre
  familles de jetons (`tokens.ts:105-112`, `tuileArgent` à
  `tuileGestionEncre`), que rien d'autre n'emploie.
- **L'icône « $ »** (`circle-dollar-sign`) dit « Encaisser » dans un produit
  qui compte en FCFA : `NavMobile.tsx:19`, `NavBureau.tsx`, `Accueil.tsx`,
  `Encaisser.tsx`, `FicheClient.tsx`, `Recus.tsx`, et `superadmin/Promos.tsx`
  côté administration.
- **Le bouton rond flotte au-dessus de la barre** : `NavMobile.tsx:88-90`,
  `-mt-5` et `w-14 h-14 rounded-pill`. C'est la signature la plus reconnaissable
  des gabarits de 2023.
- **L'onglet « Encaisser » ouvert sans carte est une impasse** :
  `Encaisser.tsx:99` affiche « Aucune carte choisie » et renvoie vers Clients.
- **L'encaissement dit trois fois la même chose** : le nom du client (bloc
  client, carte, bouton) et le montant (carte, encadré « Montant de la mise »
  à `Encaisser.tsx:140`, bouton à `:216`).
- **La carte de collecte porte le dégradé et le verre du gabarit** :
  `CarteCollecte.tsx:70` (`--degrade-carte`, vert-bleu-violet), deux cercles
  décoratifs (`:73-74`), des pastilles en `backdrop-blur-md` (`:82`, `:89`).
- **Trois chiffres dans trois cases égales** sous l'en-tête de l'accueil
  (`Accueil.tsx:214`, `grid grid-cols-3`), et une rosace qui tourne
  (`Accueil.tsx:152`, `animee`).
- **Le retrait est une suite de cartes de 240 px** (capture du 2026-10-02) :
  chaque carte répète la phrase de la commission (`Retrait.tsx:554`), et une
  carte à 0 FCFA pèse autant qu'une carte à rendre.

### Contraintes relevées

- **La carte de collecte est aussi sur la vitrine** : `Telephone.tsx` la rend
  telle quelle, exprès (« le jour où la carte de collecte change, cette
  vitrine change avec elle »). Elle sert aussi au carrousel de la fiche, en
  format réduit par requête de conteneur (`@max-[240px]:`).
- **Le jeu d'icônes est une union close** (`Icone.tsx`), trait 1,75 partout.
  Toute icône ajoutée entre dans les trois fronts : la table n'est pas élaguée.
- **Les gardes visuels existent et tiennent** : `verifier:rayons` (pas de
  `rounded-2xl`/`3xl` dans les applications), `verifier:tirets` (pas de tiret
  cadratin dans un libellé de moins de 70 caractères), `verifier:champs`
  (16 px minimum dans un champ), `verifier:contraste`, `verifier:theme`.
- **La tournée locale porte tout ce que le sélecteur de carte demande** :
  `listeDepuis` (`hors-ligne/vues.ts:134`) donne les clients (nom, marché,
  téléphone) et les cartes (mise, statut, mises encaissées). Le sélecteur
  marche donc hors ligne, sans lecture nouvelle.
- **Le numéro de reçu existe déjà** : `Recus.tsx` montre les huit premiers
  caractères de l'identifiant de la mise, en capitales. L'opération rendue
  par la file porte cet identifiant (`charge.id`, `hors-ligne/modele.ts:52`).
- **`Bouton` est partagé avec l'administration.** Ses variantes ne changent
  pas dans ce chantier.

## Les fondations

### Couleurs

Les jetons existants restent, valeurs comprises : `primary` (vert coffre,
`#14402C`), `sidebar` (nuit, `#0E2E1F`), `darkCanvas`, `ink`,
`mutedForeground`, `canvas` (toile), `surface` (papier), `hairline`,
`positive`, `negative`, `info` et leurs teintes, `marqueurActif`, l'échelle
`chart*`, `or` et `orDoux`. La vitrine les emploie : aucune valeur ne bouge.

**Un jeton arrive : `trait`, `#858B81`.** C'est la bordure des contrôles
(champ de recherche, segments, case à venir à 40 %, points de conduite à
50 %). `hairline` sépare, `trait` délimite ce qu'on touche. Mesuré : 3,5:1 sur
`surface`, 3,2:1 sur `canvas`, au-dessus des 3:1 que demande WCAG 1.4.11 pour
la limite d'un contrôle. Les maquettes montraient un gris plus clair ; voir
« Écarts assumés ».

**Part** : `degradeCarte`, dont le seul emploi disparaît avec l'ancienne
`CarteCollecte`. **Les huit jetons `tuile*` restent** jusqu'au chantier 3 :
`ActionsRapides` les porte, et le tableau de bord de l'administration
(`TableauDeBord.tsx:341`) l'emploie en plus de l'accueil du collecteur. Le
collecteur cesse de s'en servir dès ce chantier (voir `Outils`).

**L'or** reste où il est (la pièce du logo) et gagne une place : la gravure
sur fond sombre, entre 15 et 30 % d'opacité. Jamais sur un montant, jamais sur
un état.

**Rouge, bleu, vert clair** disent un état (erreur, information, envoyé) et
rien d'autre. Le tampon « Encaissé » est en `positive`, « Gardée » en `info`.

### Typographie

Trois familles, chacune avec un métier :

| Famille | Métier |
|---|---|
| Bricolage Grotesque (déjà là) | Titres, nom du client sur la carte, total du jour |
| Instrument Sans (déjà là) | Texte, boutons, libellés, l'unité « FCFA » |
| **IBM Plex Mono 500** (nouvelle dans les applications) | Tout montant qu'on compte : soldes, mises, relevés, décompte, reçus ; les compteurs (`29/31`), les heures, les numéros de reçu |

La règle tient en une ligne : **un montant qu'on compte est en Plex Mono ; le
total du jour est en Bricolage, c'est l'affiche.** Jamais une phrase en
chasse fixe : dans « Encaissé aujourd'hui · 23 mises », seul `23` l'est.

Les tailles restent celles de l'échelle (`taillesTexte`), avec leur rôle
documenté : nom sur la carte en `text-xl`, solde de carte en `text-2xl`,
montant de la caisse en `text-3xl`. **Un cran s'ajoute, `total` (44 px),**
pour le seul total du jour, à partir de `xs` (390 px) ; dessous, il passe en
`text-4xl`, selon la règle que `ruptures.xs` documente pour les montants à
sept chiffres. Aucune taille en dur.

Plex Mono est déjà une dépendance de la vitrine (`@fontsource/ibm-plex-mono`,
graisse 400). Le collecteur prend la **graisse 500 seule** : un fichier latin
de 14 888 octets, mesuré dans `node_modules`, que garde le cache HTTP
(`immutable`) ; le service worker ne précharge aucune police. Le jeton
`polices.mono` produit `--font-mono` dans `theme.css` : IBM Plex Mono en tête,
puis la liste mono de Tailwind recopiée telle quelle, pour que l'administration,
qui ne charge pas Plex, ne change pas. La déclaration locale de la vitrine
(`apps/site/src/styles.css:15`) est retirée : même famille en tête, seul le
repli s'allonge.

### Formes

L'échelle des rayons ne change pas. Ce chantier en fixe l'emploi :

| Rayon | Emploi |
|---|---|
| `xs` 2 px | Case de la carte de collecte : `rounded-xs`, le cran de Tailwind sous `sm`. Ce n'est pas l'exception que `tokens.ts` documente (la miniature de la vitrine, `rounded-[2px]`) |
| `md` 6 px | Bouton, champ, segment actif |
| `lg` 10 px | Liste, outil, piste des segments, touche « Encaisser » |
| `xl` 12 px | Carte de collecte, bloc de caisse, haut de la feuille |
| `pill` | Avatar, pastille du cycle, point d'état |

Les listes ne sont plus des piles de cartes : une surface `surface`, bordée
de `hairline`, des lignes séparées par un filet. Une carte n'existe que si
elle représente un objet : la carte de collecte.

### La gravure

La signature, et elle se mérite. Trois places, pas une de plus (les écrans de
connexion mis à part, voir plus bas) :

1. **L'en-tête de l'accueil** : rosace en filigrane à droite (`Rosace`,
   22 pétales, excentricité 0,38) et bande `Onde` en pied, or à 15 et 25 %.
   La rosace **ne tourne plus**.
2. **La bande de l'encaissement** : `Onde` seule, or à 30 %.
3. **Le bord haut de chaque carte de collecte** : `Onde` fine (10 px), vert
   coffre à 30 %. C'est elle qui fait de la carte un billet.

Les écrans secondaires n'en portent pas. Seuls font exception les trois
écrans de connexion (`EcranConnexion`, `MotDePasseOublie`,
`NouveauMotDePasse`) : ils portent déjà la gravure de la vitrine, rosace
tournante en or à 15 % et onde en or à 10 %, et la gardent jusqu'à leur
refonte (chantier 2).

### Icônes

Lucide reste : c'est la dépendance du projet et son registre est tenu.
Trois icônes entrent dans `Icone.tsx` : **`banknote`** (encaisser : un
billet, plus un « $ »), **`scale`** (rapprochement : la balance de la caisse)
et **`receipt-text`** (reçus : l'icône `receipt` de Lucide dessine un « $ »
sur le ticket). Toutes trois existent dans `lucide-react` 1.31.0, vérifié dans
ses déclarations. `circle-dollar-sign` et `receipt` quittent les écrans de ce
chantier ; ils restent dans le registre pour les autres écrans et
`superadmin/Promos.tsx`, jusqu'aux chantiers 2 et 3.

### Le tampon

Le geste qui ne se défait pas laisse une marque, comme au guichet. Un
composant `Tampon` : cadre double, capitales espacées en Bricolage 800, date
et heure de l'encaissement en Plex Mono (`02.10 · 11:47`), incliné de six
degrés, posé en haut à droite de la carte, par-dessus la pastille du cycle :
il ne cache ni les cases ni le solde. Le bloc du nom lui réserve sa largeur
(`pr-30`, 120 px) tant qu'il est là : le tampon se pose par-dessus sans rien
pousser, et un nom long ne passe pas dessous.

| Mot | Couleur | Quand |
|---|---|---|
| ENCAISSÉ | `positive` | La mise est partie au serveur |
| GARDÉE | `info` | La mise attend dans la file du téléphone |
| CLÔTURÉE | `positive` | Le retrait est inscrit |

Le tampon suit l'état de l'opération dans la file (`useHorsLigne`) : écran
ouvert, GARDÉE devient ENCAISSÉ dès que l'envoi part. **Une mise refusée par
le serveur ne reçoit aucun tampon** : la ligne d'état dit « Le serveur a
refusé cette mise. Le détail est dans les alertes. » Un tampon ENCAISSÉ sur
une mise refusée mentirait. Tant que l'écran n'a pas relu la file après
l'écriture, l'état est GARDÉE : c'est le plus prudent des deux. Il est
`aria-hidden` :
la ligne d'état en `role="status"` dit la même chose aux lecteurs d'écran.
Il arrive en `--duree-toucher` (150 ms, la durée des retours d'appui du
produit ; échelle 1,15 vers 1, opacité 0 vers 1) ; sous
`prefers-reduced-motion`, il apparaît sans mouvement.

### Le document de référence

`Docs/Kolek Design System.md` est mis à jour dans ce chantier : §3.1 (le
jeton `trait`, le départ de `degradeCarte`), §3.2 (il nomme encore Plus
Jakarta Sans et Sora, remplacées le 2026-09-17 ; Plex Mono et la règle des
montants), §3.5 et §3.6 (l'ombre d'action, les icônes sans « $ »), §4 (le
billet, la touche de la barre, les outils, les segments, `grand` et
`nomAccessible`), et trois sections nouvelles : le tampon, le décompte, la
gravure. La relecture y a ajouté ce que le billet rendait faux ailleurs : §1
et §2 (la place de l'or), §3.4 (les cases de la carte), la ligne `NavBureau`
de l'inventaire, §5 (les outils), §8.1 (l'état des écrans).

## Les composants partagés

| Composant | Ce qui change | Effet hors collecteur |
|---|---|---|
| `CarteCollecte` | Devient le billet : fond `surface`, filet `hairline`, `Onde` en haut, nom en Bricolage, mise et solde en Plex Mono, pastille du cycle quand l'écran le connaît. Cases : payées en `primary`, la prochaine cerclée de 2 px, à venir en `canvas` bordée de `trait`/40. Plus de dégradé, de cercles ni de verre. Mêmes propriétés, même sens de `jourCourant` (les mises encaissées) ; **`cycle` devient facultatif** : l'accueil et l'encaissement écrivaient « Cycle 1 » en dur, ce qui était faux pour un client à sa deuxième carte, et ne le passent plus. En plus, `neuve` (la case qu'on vient de payer, en `positive`), `tampon` et `surtitre` (des nœuds), `etiquetteSolde`, et `close` (une carte clôturée ne cercle plus de prochaine case). Le libellé « Mise / jour » et le montant qui le suit restent frères : la fiche les lit. Le compteur devient `29/31`, d'un seul tenant. Le format réduit garde ses huit colonnes sous 240 px. | **Vitrine** : le téléphone du hero montre le billet. Rien d'autre n'y bouge. **Fiche client** (chantier 2) : son carrousel montre déjà le billet. |
| `NavMobile` | Cinq entrées à plat. « Encaisser » devient une **touche** dans la barre (rectangle `primary`, rayon `lg`, icône `banknote`), plus un rond qui flotte. Onglet actif : encre `primary` et filet de 2 px collé sous le bord haut de la barre, hors du flux, `aria-current="page"`. | Aucun |
| `NavBureau` | Icône `banknote` | Aucun |
| **`Outils`** (nouveau) | La grille des outils de l'accueil : deux colonnes, quatre avec la barre latérale (`lg`), de boutons neutres (`surface`, `hairline`, rayon `lg`, 52 px), icône `primary` à gauche, libellé. Remplace `ActionsRapides` sur l'accueil du collecteur ; `ActionsRapides` ne bouge pas, l'administration s'en sert. | Aucun |
| `Bouton` | Cinq propriétés facultatives. `nomAccessible` (posée en `aria-label`, et qui contient le libellé visible) : le bouton « Encaisser 2 000 » de la carte doit dire sur quelle carte il agit. `grand` (56 px, `text-lg`) : le geste d'un écran qui fait bouger l'argent ; une hauteur passée par `className` se disputerait avec `min-h-11`. `decritPar` (posée en `aria-describedby`) : la raison d'un bouton éteint, quand cette phrase est déjà à l'écran (« Reçu » tant que la mise n'est que gardée) ; `title` reste l'infobulle. `deplie` et `panneau` (posées en `aria-expanded` et `aria-controls`) : un bouton qui ouvre un panneau dit son état et le désigne, comme « Activer une carte ». `Bouton` est un conteneur flex (`gap-2`) : un libellé qui mêle du texte et un montant en Plex Mono tient dans un seul `<span>`, sans quoi ses morceaux deviennent des éléments séparés ; le montant, insécable, ne passe plus à la ligne, le bouton ne se resserre plus et, à 320 px, « Fiche » sort de la carte de l'accueil. Variantes inchangées. | Aucun (rien ne les passe) |
| `Icone` | `banknote`, `scale`, `receipt-text` | Les trois fronts : quelques centaines d'octets |
| `Feuille` | Rayon `xl` en haut, poignée, voile `darkCanvas` à 48 %. Elle sert désormais au décompte du retrait. | Aucun |
| **`Tampon`** (nouveau) | Voir plus haut | Aucun |
| **`Segments`** (nouveau) | Rangée de trois à quatre choix exclusifs, chacun avec son compte, `aria-pressed`, dans une piste `lg` | Aucun |
| **`Decompte`** (nouveau) | Lignes « libellé, points de conduite, montant », total sous un double filet | Aucun |

`EnTeteEcran` (dans `apps/collecteur`) prend le dessin des écrans
secondaires : bouton de retour rond (`surface`, bordé de `trait`), titre en
Bricolage `text-xl` comme aujourd'hui, sous-titre en encre douce passé de
`text-xs` à `text-sm`. Il sert à quatorze écrans ; ce
chantier l'emploie sur Retrait, les autres le reçoivent sans autre changement.

## Les écrans pilotes

### Accueil (structure B)

- **En-tête sombre** pleine largeur (`--degrade-hero`), avec la rosace et
  l'onde. Le nom du collecteur et son avatar ; l'avatar mène au même écran que
  l'onglet Profil. Le bouton de déconnexion quitte l'en-tête : il existe déjà
  dans `Plus.tsx`, et la propriété `onDeconnexion` d'`Accueil` disparaît.
- « Encaissé aujourd'hui · 23 mises », puis le total en Bricolage (jeton
  `total`, `text-4xl` sous `xs`). Le nombre de mises est un champ de plus de
  `TableauCollecteur`, `misesAujourdhui`, compté par `tableauDepuis` sur les
  mêmes versements que `encaisseAujourdhui` (depuis minuit local). C'est un
  calcul sur la tournée, pas une lecture.
- **Les trois chiffres en ligne**, sous un filet : Clients, Cartes actives,
  Encours (FCFA). Valeurs en Plex Mono, séparées par des filets verticaux,
  alignées à gauche. Sans tournée, chaque valeur dit « — », comme aujourd'hui.
- `BandeauHorsLigne` reste dans l'en-tête.
- **La carte à finir** vient se poser sur l'en-tête (48 px de recouvrement).
  Elle garde son titre, posé dans la carte au-dessus du nom : « À finir en
  premier · la plus avancée de tes 35 cartes en cours », et le lien « Toutes les
  cartes » (le `surtitre` de la carte). C'est la première de `cartesAEncaisser`,
  dans l'ordre du premier temps d'Encaisser, donc jamais une carte pleine :
  « en cours » compte les cartes actives qui ont encore une case à payer
  (`cartesEnCours`), le mot du segment de Retrait. Quand toutes les cartes
  actives sont pleines, la place renvoie au retrait (« Toutes tes cartes actives
  sont pleines. », bouton « Aller au retrait »). Dans sa fente, deux `Bouton` :
  « Encaisser 2 000 » (nom accessible « Encaisser 2 000 FCFA sur la carte de
  Mariam Traoré ») et « Fiche » (« Ouvrir la fiche de Mariam Traoré »).
  `ActionsCarte` et ses pastilles rondes ne servent plus qu'au carrousel de la
  fiche, jusqu'au chantier 2.
- Les messages de la file (attente longue, refus, stockage) gardent leur
  place, entre la carte et les outils.
- **Outils** : Souscrire, Retrait, Rapprochement, Reçus, Alertes, Avis,
  Équipe (titulaire seulement), Plus. « Encaisser » et « Bilan » en sortent :
  la barre du bas les porte déjà.

### Encaisser, en trois temps

**Temps 1, choisir la carte** (l'onglet ouvert sans carte). Bande sombre
« Encaisser », sous-titre « Choisis la carte du client. » Champ de recherche
(nom, numéro ou marché : la règle `correspond` de `Clients.tsx`, déplacée
dans `recherche.ts` sous le nom `correspondClient` pour servir aux deux), puis
les cartes actives, **les plus avancées d'abord** (à égalité, par nom). Une
carte à 31 mises n'y figure pas : elle relève du retrait. Chaque ligne est un
bouton entier : nom, marché, mise par jour, jauge de 31 traits, `29/31`. La
liste vient d'une vue pure, `cartesAEncaisser(tournee)`, à côté de
`listeDepuis` : cartes au statut `active` sous 31 mises. Au-delà d'une page,
la pagination de l'écran Clients (`usePagination`,
`LIGNES_AFFICHEES_PAR_PAGE`) ; une recherche nouvelle repart de la page 1.

**Temps 2, confirmer.** Bande sombre « Encaisser une mise », retour vers le
temps 1. La carte (sans commandes), sa prochaine case cerclée. En bas, sous
le pouce, le bloc de caisse : « Mise du jour, case 30 », le montant en Plex
Mono `text-3xl`, « Solde après 58 000 FCFA » (`soldeRestituable` du moteur),
le bouton « Encaisser » de 56 px de haut, et « Montant fixé à l'ouverture de
la carte. » Sur un téléphone court, ce bloc est collant au-dessus de la barre
(`sticky bottom-nav`, `lg:static`) : le geste n'est jamais sous elle.
Cycle complet : bouton désactivé et phrase actuelle, inchangée.

**Temps 3, encaissé.** La case 30 se remplit en `positive`, le tampon se pose
sur la carte. La ligne d'état, en trois lignes : « 2 000 FCFA pour Mariam
Traoré, case 30. », puis « Envoyée. » ou, tant que l'opération attend dans la
file, « Gardée sur ce téléphone, elle partira avec le réseau. » (tampon
GARDÉE), puis « Reçu n° 7F3A21C9 ». L'heure est celle du tampon, l'heure de
l'encaissement : la file ne garde pas l'heure de l'envoi, et la maquette qui
écrivait « Envoyée à 11:47 » l'inventait. L'état vient d'une vue pure,
`etatEnvoiMise`, à côté de `enAttenteSurCarte`. Le numéro de reçu vient de
`numeroDeRecu(miseId)`, extrait de `Recus.tsx:507` pour servir aux deux
écrans. Deux commandes : **« Client suivant »** (retour au temps 1, recherche
vidée) et **« Reçu »** (les reçus de ce client, par le chemin `allerAuxRecus`
qui existe). « Reçu » est là dès que la mise est écrite, mais éteint tant
qu'elle n'est que gardée sur le téléphone : l'écran des reçus ne lit que le
journal du serveur, qui ne la connaît pas encore. Il s'allume quand la mise
est partie, et disparaît si le serveur la refuse. Il ne surgit jamais sous le
pouce : sa place est prise d'avance, car l'envoi arrive un aller-retour après
l'appui, quand le pouce vise « Client suivant ». Les deux commandes sont dans
un bloc collant au-dessus de la barre, comme le bloc de caisse. Après le
succès, le bouton « Encaisser » n'est plus rendu du tout : le serveur accepte
deux mises le même jour sur une carte, et l'écran ne doit pas en offrir une
seconde. Le focus qu'avait le bouton passe à la ligne d'état. Les erreurs
gardent leur forme et leur texte. Une mise que le serveur refuse ne remplit pas sa case et n'a ni
tampon, ni numéro de reçu, ni commande « Reçu » : il n'y a pas de reçu d'une
mise refusée. Reste « Client suivant ».

`Encaisser` reçoit deux propriétés de la coquille : `onChoisir(carte | null)`
(choisir dans la liste, revenir à la liste) et `onRecus(clientNom)`. Le
retour du temps 2 ne mène plus à Clients mais au temps 1.

### Retrait

**La liste.** `EnTeteEcran` « Retrait », « Clôturer une carte et rendre le
solde ». Recherche quand il y a plus d'une carte (comme aujourd'hui).
Les filtres deviennent des `Segments` : « Toutes 38 · Cycle terminé 3 · En
cours 35 », comptés après la recherche. Les libellés restent ceux
d'aujourd'hui, et le compte est `aria-hidden` : le nom de chaque segment est
son libellé seul, que les phrases d'annonce reprennent déjà (« masquée par le
filtre « Cycle terminé » »). Sous « Toutes », deux groupes titrés
avec leur compte : « Cycle terminé » puis « En cours ». Une ligne par carte :
nom, `31/31 · 1 000/j`, et à droite le montant à rendre en Plex Mono avec
« à rendre ». Un cycle terminé porte un trait `positive` à gauche.

**Le dépli.** Toucher une ligne la déplie (`aria-expanded`), une seule à la
fois : la phrase de la commission, dite une fois et plus sur chaque carte,
puis « Faire le retrait » et, pour un cycle terminé, « Activer une carte »
(`ActiverCarte`, mise reprise ; c'est un dépli : son bouton reste et le
panneau s'ouvre dessous). Le message de blocage (`retraitBloquePour`)
s'y lit. Changer de recherche, de filtre ou de page referme le dépli et la
confirmation, comme le code le fait aujourd'hui pour la confirmation.

**Le décompte.** « Faire le retrait » ouvre une `Feuille` titrée « Rendre
30 000 FCFA ? », sous-titrée « à Rokia Sangaré » (le titre de `Feuille` est
tronqué sur une ligne : le montant y tient, un nom long non), puis le
`Decompte` : « 31 mises × 1 000 »,
« Ta commission, case 1 » (« Part de ton titulaire » pour un collaborateur),
et « À rendre » sous le double filet. Puis : « La carte se clôture. C'est
définitif : le retrait ne pourra pas être défait. » Deux commandes : « Oui,
rendre 30 000 FCFA » et « Annuler ».

**Clôturée.** Sous-titre « Carte clôturée ». La carte rendue, `etiquetteSolde`
« Rendu au client », tampon CLÔTURÉE ; `close` : une carte rendue avant la fin
de son cycle ne cercle pas de prochaine case. « Remets 30 000 FCFA à Rokia Sangaré,
en main propre. » en Bricolage `text-xl`, puis « Le retrait est inscrit au
journal. Il ne peut plus être défait. » Deux commandes : « Retour aux
cartes » et, si le cycle était complet, « Activer une carte » (le même
`ActiverCarte` que dans le dépli). Sa phrase d'aujourd'hui (« son solde reste
dû au client ») serait fausse après un retrait : `ActiverCarte` reçoit une
propriété facultative, `explication`, et l'écran clôturé y passe « La carte
précédente est close. La nouvelle repart de la case 1. »

## Écarts assumés avec les maquettes

- **« À finir en premier » reste écrit.** La maquette B l'avait perdu. Le
  titre existe depuis qu'un collecteur a cru, le 2026-08-23, que son compte
  appartenait au client affiché (commentaire d'`Accueil.tsx`). Il passe dans
  la carte.
- **Les boutons secondaires gardent la variante `contour`** (bord et encre
  `primary`) au lieu du gris des maquettes : `Bouton` est partagé avec
  l'administration, et le contour vert délimite mieux.
- **`trait` est plus sombre que le gris des maquettes** (`#858B81` contre
  `#D5D8D1`) : le gris clair ne donnait que 1,4:1 à la limite d'un champ.
- **Le tampon de l'encaissement est en haut à droite** de la carte, plus sur
  les cases : posé dessus, il cachait la case qu'il célèbre.
- **Les libellés d'aujourd'hui restent** là où la maquette en inventait :
  « Cycle terminé » et non « Terminées », « Activer une carte » et non
  « Nouvelle carte ». Ce sont les noms que les phrases d'annonce, le composant
  `ActiverCarte` et les épreuves emploient déjà.
- **Le compteur de mises de la carte se lit `29/31`**, sans le pourcentage
  d'aujourd'hui (`29/31 j · 94 %`), comme sur la maquette ; les épreuves de la
  fiche qui le lisent passent au nouveau texte.
- **« Envoyée » ne porte pas d'heure.** La maquette écrivait « Envoyée à
  11:47 » ; la file ne garde pas l'heure d'envoi, et l'heure affichée est
  celle de l'encaissement, sur le tampon.

## Ce qui ne bouge pas

- Les données, les écritures, la file hors ligne, les droits : aucune
  migration, aucune fonction, aucune lecture réseau nouvelle.
- Les textes d'erreur, les gardes du retrait, les règles du cycle de 31 mises.
- La vitrine, hormis la carte dans son téléphone.
- L'administration, hormis les deux icônes ajoutées au registre.
- Les noms des propriétés de `CarteCollecte` (`jourCourant` compris : la
  vitrine et le carrousel les passent).

## Épreuves

Chaque comportement neuf arrive par une épreuve vue rouge avant le code.

**`@kolek/core`** : plus de `degradeCarte` (les `tuile*` restent, voir
« Couleurs ») ; `trait` présent et à 3:1 au moins sur `surface` et sur
`canvas` (épreuves de `tokens.test.ts` : `verifier:contraste` ne lit que le
blanc translucide des écrans) ; `--font-mono` et `--color-trait` dans
`theme.css` (`verifier:theme`).

**`@kolek/ui`**
- `CarteCollecte` : 31 cases, l'état de chacune lisible en attribut
  (`data-etat` : `payee`, `prochaine`, `neuve`, `a-venir`), solde et compteur
  rendus, emplacement du tampon, aucune classe `backdrop-blur`, format réduit
  conservé.
- `Tampon` : le mot, la date et l'heure, `aria-hidden`.
- `Segments` : `aria-pressed`, comptes, choix.
- `Decompte` : lignes, total, montants par `formatMontant`.
- `NavMobile` : cinq entrées, la touche dans la barre (plus de `-mt-5`),
  icône `banknote`, `aria-current` sur l'entrée active.
- `Outils` : deux colonnes, quatre avec la barre latérale (`lg`), aucune classe
  `tuile`, un bouton par outil.
- `Bouton` : `nomAccessible` devient l'`aria-label`, et son absence n'en pose
  aucun.

**Collecteur**
- `cartesAEncaisser` : seulement les cartes actives sous 31 mises, nom et
  marché joints, ordre décroissant des mises puis par nom.
- `etatEnvoiMise` : GARDÉE tant que l'opération est en file ou que la file
  n'a pas été relue ; ENVOYÉE quand l'opération a quitté la file et que la
  mise est dans la tournée ; REFUSÉE quand elle est à consigner ou refusée.
- `misesAujourdhui`, `correspondClient`, `numeroDeRecu`.
- Encaisser : sans carte, la liste ; une ligne mène à la confirmation ;
  « Solde après » juste ; succès, tampon ENCAISSÉ ou GARDÉE selon la file, pas
  de tampon sur un refus, numéro de reçu tiré de la mise ; plus de bouton
  « Encaisser » après le succès ; « Client suivant » ramène à la liste.
- Accueil : les trois chiffres, pas de bouton de déconnexion, la liste des
  outils (Équipe pour le titulaire seulement), le titre « À finir en
  premier » (témoin du défaut du 2026-08-23).
- Retrait : lignes compactes, dépli unique, phrase de commission dans le
  dépli seulement, feuille et décompte, fermeture sur recherche, filtre et
  page, état clôturé avec tampon, « Activer une carte » pour un cycle
  complet, avec la phrase d'après la clôture.

**Regard.** Captures par Chrome sans interface, sur la pile locale et jamais
sur 5173/5174 : les trois écrans dans chacun de leurs temps, à 360 × 800,
390 × 844 et 1280 de large. **La vitrine**, construite et prérendue, capturée
route par route avant et après : seule la zone du téléphone du hero diffère.

**Gardes, avant de rendre la main** : `npm test` sur les espaces de travail,
`npm run test:scripts`, la construction des trois fronts, `verifier:lint`,
`verifier:rayons`, `verifier:tirets`, `verifier:champs`, `verifier:contraste`,
`verifier:theme`. `test:db` est refusé sur ce poste : aucun export lu par
`supabase/tests` n'est renommé, et cela se vérifie par recherche avant chaque
renommage.

## Découpage du programme

1. **Ce document** : fondations, composants partagés, Accueil, Encaisser,
   Retrait. Un plan, une branche, une PR.
2. **Les seize autres écrans du collecteur** : Clients, FicheClient (et son
   carrousel), Reçus, Rapprochement, Bilan, Alertes, Avis, Plus, Abonnement,
   Équipe, EquipeClients, ActiverCarte et ChoixMise, Connexion,
   MotDePasseOublie, NouveauMotDePasse, RetourPaiement. Ils reçoivent les
   fondations et les composants de ce chantier ; chacun aura sa maquette.
3. **L'administration** : la coquille, la barre latérale et ses dix-huit
   écrans, Super Admin compris (refondu le 2026-09-12, à remettre dans le
   langage du billet). Son propre document.

## Hors périmètre

- La vitrine, hormis la carte de son téléphone.
- L'avis « Nouvelle version disponible » de la PWA : proposé le 2026-10-02,
  pas encore demandé.
- Un mode sombre, un changement de bibliothèque d'icônes.
- Toute fonction nouvelle au-delà des trois que les maquettes montrent et
  que les données portent déjà : le sélecteur de carte de l'onglet
  « Encaisser », « Solde après », « Activer une carte » après un retrait.
