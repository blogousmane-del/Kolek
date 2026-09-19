# La trace de l’acceptation des conditions

> **Note du 2026-09-19 — ce document décrit l'état d'*avant* le chantier.**
>
> Sa prose est conservée telle quelle : c'est le témoignage d'une décision à
> une date, et la réécrire pour qu'elle corresponde au livré détruirait ce
> qu'elle sert à établir. Deux conséquences pour qui la lit aujourd'hui :
>
> - **Ses citations de lignes ont glissé**, puisque le chantier a modifié les
>   fichiers qu'elle cite. `apps/collecteur/src/abonnement.ts:80` tombe
>   aujourd'hui sur `version: string;` — le champ même dont ce document dit
>   qu'il n'existe pas. Les numéros valent pour le dépôt au 2026-09-18.
> - **La conception a bougé en cours de route.** « Deux index » en sont trois
>   depuis qu'un index partiel rend l'écriture idempotente au renouvellement ;
>   l'acceptation s'écrit avant la vente et non après ; la garde de
>   configuration est scindée. Ce qui a été livré, et pourquoi, est dans
>   `Docs/audits/2026-09-19-audit-du-chantier-trace-acceptation.md`.

> Conception validée par l’exploitant le 2026-09-18. Chantier suivant de
> `2026-09-18-mentions-cgu-confidentialite-design.md`.
>
> **Révisée le 2026-09-18 après audit.** Six affirmations ont été rejouées sur
> la source et corrigées, et les deux points que l’audit a trouvés non tranchés
> le sont au §5.1 et au §3.3. Le détail est au §11.

## 1. Le défaut

Le chantier précédent a écrit des conditions générales, et fait en sorte qu’on
ne puisse pas ouvrir un compte sans les accepter. La case est posée avant la
soumission, et la garde vit dans `soumettre` : `apps/site/src/vitrine/Inscription.tsx:111`.

**Mais rien de cette acceptation n’atteint le serveur.** Ni indicateur, ni date,
ni version du texte. On a donc des conditions opposables en principe et
**improuvables contre une personne précise**.

Ce n’est pas théorique. Depuis l’amendement « payer vaut accord » du 2026-09-03,
sur un palier payant **l’acceptation puis le règlement valent ouverture du
compte, sans intervention humaine** — le commentaire de
`supabase/functions/demander-ouverture/index.ts:44-51` le dit en toutes lettres.
La case à cocher n’est donc pas une formalité avant un échange : c’est **le
moment où le contrat se forme**. Un contrat dont on ne garde aucune trace de la
formation.

## 2. Ce qu’il faut pouvoir produire

Arbitrage de l’exploitant : **le fait, la date, et le texte exact**.

Le jour où un collecteur conteste, il faut pouvoir dire « cette personne a
accepté le 12 mars à 14 h 07, et voici mot pour mot ce qu’elle avait sous les
yeux ». Le fait et la date seuls ne suffisent pas : si le texte a changé depuis,
elle peut soutenir qu’elle avait accepté autre chose.

Un horodatage par un tiers a été écarté : disproportionné pour des abonnements à
2 500 FCFA, et il ajoute un prestataire, un coût récurrent et une dépendance
extérieure.

## 3. Les quatre chemins, et ce que chacun donne

C’est la partie qu’il faut lire en entier : ils ne se valent pas, et deux
d’entre eux n’ont été découverts qu’en lisant le code.

### 3.1 Formulaire public, palier payant — couvert entièrement

Formulaire → `demander-ouverture` → vente Chariow → webhook →
`supabase/functions/_shared/ouvrir-compte.ts:55`, `ouvrirCompteDepuisDemande`,
qui fait naître le compte à `:95` par `auth.admin.createUser`.

Cette voie **connaît la demande** : elle lit `paiement.demande_id` à `:57` et
refuse d’aller plus loin sans lui (`:58`). L’acceptation est donc saisie au
formulaire, écrite avec la demande, et **reliée au compte à sa naissance**.

C’est le chemin où le contrat se forme, et c’est celui qui compte le plus.

### 3.2 Formulaire public, essai — couvert partiellement, et c’est assumé

Formulaire → demande → un administrateur marque la demande « ouverte »
(`supabase/migrations/20260823090000_demandes_ouverture.sql:172`,
`admin_traiter_demande`) **puis crée le compte séparément**.

**`admin-creer-collecteur` ignore la demande.** Vérifié, et le zéro n’est pas
une sonde muette : le fichier existe, 209 lignes, **dix-sept** occurrences de
`collecteur` et **aucune** de `demande`. Il n’existe donc aucun lien entre le
compte créé et la demande dont il provient.

L’acceptation restera attachée à la demande, avec le nom et le numéro, sans lien
direct vers le compte. **Décision : c’est suffisant.** L’essai est gratuit ; un
litige sur un essai n’a pas d’argent en jeu. Relier les deux imposerait de
modifier l’application d’administration, pour une voie sans enjeu monétaire.

### 3.3 Collecteur déjà en place qui paie — à couvrir, et c’est le rattrapage

`apps/collecteur/src/ecrans/Plus.tsx:155`, « Renouveler mon abonnement », mène à
`abonnement-payer` par `apps/collecteur/src/abonnement.ts:80`. Cette fonction
reçoit quatre champs — `palier`, `telephone`, `paysTelephone`, `telephoneLocal`
(`supabase/functions/abonnement-payer/index.ts:162-175`) — et **aucune
acceptation**.

C’est un vrai trou, et il se referme avec une vertu que la conception initiale
n’avait pas vue : **si l’acceptation est demandée avant de payer dans
l’application, chaque collecteur déjà en place l’accepte à son prochain
renouvellement.** Le rattrapage des comptes existants se fait donc tout seul, au
moment où il y a de l’argent en jeu — et personne n’est bloqué en tournée devant
un mur de texte au démarrage.

Cette voie est même plus propre que la voie publique : la personne est
authentifiée, donc `collecteur_id` est connu directement, sans passer par une
demande.

#### Ce que le collecteur a sous les yeux, et pourquoi c’est un lien

L’application du collecteur ne porte aujourd’hui **aucun texte de conditions et
aucun lien vers eux**. `apps/site/src/vitrine/liens.ts:43-45` donne
`/mentions-legales`, `/conditions` et `/confidentialite` — des chemins
**relatifs au site**, inutilisables depuis `app.kolek.cash`, qui est un site
Netlify distinct.

**Décision : la case renvoie par lien absolu, elle n’embarque pas le texte.**

- Embarquer les 12 538 caractères des deux pages dans l’application fabriquerait
  une **seconde copie du texte légal** — précisément ce que le générateur du §5
  existe pour empêcher. Et l’application est une PWA au cache agressif : elle
  pourrait montrer une copie périmée pendant que le serveur refuse la version,
  ce qui donne un mur sans issue.
- L’objection « hors ligne » ne tient pas ici : le renouvellement appelle une
  Edge Function puis s’en va vers la page de paiement du fournisseur. Il ne
  fonctionne déjà pas hors ligne. Il n’y a donc pas de cas où le lien échoue
  alors que le paiement réussirait.
- La preuve produite au tribunal n’est pas la capture de l’écran : c’est
  l’instantané du §5.1 que l’empreinte enregistrée désigne. Un lien vers le
  texte vivant montre par construction le texte dont l’empreinte sera acceptée.

Les deux adresses absolues sont **engendrées**, pas recopiées : `generer-cgu.mjs`
lit les chemins dans `liens.ts` et les préfixe par l’origine, qu’il nomme une
seule fois. Une troisième liste de routes tenue à la main serait la faute même
que `verifier-routes.mjs` a été écrit pour attraper.

### 3.4 Collaborateur — non couvert, et traité par le contrat

Un collaborateur ne paie jamais : son abonnement est réglé par son titulaire
(`Plus.tsx:149`, branche `profil.titulaireId` ; et
`supabase/functions/abonnement-payer/index.ts:118`, « Un collaborateur ne
s’abonne pas »). Il ne rencontrera donc aucun des trois chemins ci-dessus.

Or il inscrit des clients, et c’est sur lui que pèse en fait l’obligation de
l’article 28 — informer le client avant de l’inscrire, et ne pas l’inscrire s’il
refuse.

**Plutôt qu’un écran de plus, une phrase dans les conditions générales :** le
titulaire répond des collaborateurs qu’il rattache et leur transmet les
obligations des présentes. Le trou se ferme contractuellement, sans rien
construire.

Un collaborateur reste sans acceptation propre. C’est dit ici plutôt que
découvert plus tard.

## 4. Ce qu’on enregistre

Une table `acceptations_conditions` — **un événement par acceptation**, et non
deux colonnes sur le compte.

Le motif est l’arbitrage de l’exploitant : le jour où les conditions changeront
— et elles changeront, l’autorisation ARTCI devra y figurer quand elle arrivera
— une nouvelle acceptation **ne doit pas écraser la précédente**. Un litige
portant sur une période antérieure au changement se retrouverait sans preuve.

| Colonne | Rôle |
| --- | --- |
| `id` | `uuid`, clé primaire |
| `demande_id` | la demande où l’acte a eu lieu ; `on delete set null` |
| `collecteur_id` | posé à la naissance du compte sur la voie payante, connu d’emblée au renouvellement, **et jamais posé sur la voie essai** (§3.2) ; `on delete cascade` |
| `version` | l’empreinte du texte accepté |
| `acceptee_le` | `timestamptz not null default now()` |

**`acceptee_le` vient du serveur.** Une date envoyée par le navigateur est une
date que le navigateur choisit.

**Deux index**, et non zéro : sur `demande_id`, parce que le webhook retrouve la
ligne par là au moment de poser `collecteur_id` ; sur `collecteur_id`, parce que
c’est la question qu’on posera le jour du litige — « qu’a accepté cette
personne, et quand ».

### Les deux règles de suppression, et ce qu’elles valent vraiment

`on delete cascade` sur le compte **tient, et pour une raison plus forte que
prévu**. `admin-supprimer-collecteur` refuse deux fois : `COMPTE_A_ENCAISSE` si
`mises` ou `retraits` existent (`:176`), et `COMPTE_A_PAYE` si un
`paiements_abonnement` existe (`:193`). Un collecteur qui a réglé ne serait-ce
qu’un abonnement est **indélétable**. La cascade ne peut donc emporter que la
trace d’un compte qui n’a jamais fait circuler un franc.

`on delete set null` sur la demande est une **ceinture, pas une règle qui
s’exercera**. Il faut le dire ainsi plutôt que de lui inventer un motif :
`Confidentialite.tsx:20-23` établit que « l’effacement se fait par
anonymisation, jamais par suppression : aucune politique `for delete` n’existe
dans la base ». Une demande n’est donc pas détruite, elle est neutralisée sur
place. La clause couvre le jour où une purge serait écrite ; elle ne décrit rien
d’existant, et on ne prétend pas le contraire.

### Droits

`enable row level security` sur la table — la poser sans l’activer laisserait la
protection reposer sur les seuls `grant`, ce que `demandes_ouverture` ne fait
pas : elle active RLS à `:72` **et** révoque à `:82-84`.

Puis le même dispositif qu’elle : `revoke all` pour `public`, `anon` et
`authenticated`, `grant all` au seul `service_role`. La table n’est donc
accessible qu’à travers les Edge Functions, qui valident avant d’écrire.

## 5. La version du texte, et pourquoi elle ne peut pas dériver

### 5.1 Le générateur

Trois scripts fonctionnent ainsi dans ce dépôt : `generer-theme.mjs`,
`generer-marque.mjs`, `generer-paliers-edge.mjs`. Chacun produit un artefact, et
son mode `--verifier` échoue si l’artefact en place ne correspond plus à sa
source. C’est l’idiome de la maison, et c’est celui qu’on suit — **avec une
différence qu’il faut nommer, sous peine de bloquer l’implémenteur au bout de
trois minutes.**

#### Pourquoi Node seul ne suffit pas, et ce qu’on emploie

Les trois générateurs cités importent du TypeScript **sans JSX** — par exemple
`generer-paliers-edge.mjs:5`, qui importe `PALIERS` depuis
`packages/core/src/paliers.ts`. Node déshabille le typage et cela fonctionne.
Mesuré sur ce poste, Node v26.2.0 :

```
import packages/core/src/paliers.ts          → OK, 4 paliers
import apps/site/src/vitrine/legal/Conditions.tsx
  → TypeError: Unknown file extension ".tsx"
```

**Node ne transforme pas le JSX, et ne le transformera pas.** `esbuild` n’est
pas résoluble depuis la racine ; `vite` et `typescript` le sont.

On emploie donc **Vite en mode intergiciel, par `ssrLoadModule`**. Trois raisons,
dans l’ordre : c’est déjà une dépendance résoluble à la racine, sans paquet neuf ;
c’est **exactement la transformation qui produit le site livré**, donc le texte
dont on calcule l’empreinte est celui que la personne lit, et non le résultat
d’une seconde chaîne qui pourrait en différer ; et elle résout seule
`@kolek/core`, dont `Conditions.tsx` dépend, sans alias à tenir à jour.

Le script reste `node scripts/generer-cgu.mjs`, comme les trois autres : le
serveur Vite naît et meurt à l’intérieur.

Vérifié le 2026-09-18 sur `09dd081` — les deux modules se chargent et rendent :

```
exports Conditions: [ Conditions ] | Confidentialite: [ Confidentialite ]
HTML longueur: 7708
```

#### La règle du texte brut — elle **est** l’empreinte

`renderToStaticMarkup` rend du HTML. La règle de dépouillement n’est donc pas un
détail de mise en forme : deux dépouillements différents donnent deux empreintes
différentes pour le même texte lu. Elle est fixée ici, dans cet ordre :

1. une fin de ligne à chaque balise fermante de bloc — `p`, `li`, `h1` à `h6`,
   `div`, `section`, `table`, `tr`, `td`, `th`, `ul`, `ol`, `main`, `header`,
   `footer`, `a` — et à chaque `<br>` ;
2. toutes les balises restantes retirées ;
3. les cinq entités que React produit décodées : `&amp;`, `&lt;`, `&gt;`,
   `&quot;`, `&#x27;` ;
4. sur chaque ligne, les suites d’espaces ordinaires et de tabulations réduites à
   une espace, puis la ligne ébarbée ;
5. les lignes vides supprimées, le reste joint par une fin de ligne ;
6. **les espaces insécables U+00A0 traversent intactes.** Elles ne sont pas de la
   mise en forme : les pages légales les posent devant les deux-points et dans
   les montants, et la règle 4 ne les touche pas.

Les deux pages sont dépouillées séparément puis jointes par une ligne vide,
`Conditions` d’abord.

**Témoin mesuré le 2026-09-18 sur `09dd081`**, à reproduire au premier essai :

```
caracteres: 12538 | lignes: 149 | empreinte: 670b774c2ad81b9e
insecables U+00A0 gardees: 69
balises restantes: 0 | entites restantes: 0
```

Ce témoin **n’entre dans aucune épreuve** : il bougera au premier mot changé
dans les conditions, et une épreuve qui l’affirmerait serait à réécrire à chaque
révision du texte. Il sert une fois, à l’implémentation : une sortie qui en
diffère signifie que la règle ci-dessus a été lue de travers, pas que le texte a
changé.

La première ligne du texte est le lien de navigation de `PageLegale`, « Retour à
l’accueil ». Il reste. L’exclure demanderait une règle de sélection qui
dériverait, et son retrait silencieux changerait **toutes** les empreintes.

#### Ce que le script écrit

1. l’empreinte : **SHA-256, rendue en hexadécimal et tronquée à seize
   caractères**. Seize, parce que la valeur se lit dans un message d’erreur et se
   compare à l’œil pendant une mise au point ; et parce qu’une collision sur
   seize caractères hexadécimaux suppose un adversaire qui fabrique un second
   texte juridique de même empreinte, ce qui n’est pas le risque qu’on traite ;
2. l’instantané dans `Docs/legal/conditions-<AAAA-MM-JJ>-<empreinte>.txt`,
   portant le texte dépouillé des deux pages — **c’est le document qu’on produit
   au tribunal**, pas un identifiant opaque. La date sert à le retrouver,
   l’empreinte à le relier à l’événement enregistré ; les deux figurent dans le
   nom pour qu’aucune recherche ne soit nécessaire. Le répertoire `Docs/legal/`
   **n’existe pas** : le script le crée ;
3. la constante là où chaque partie la lit :
   - `apps/site/src/vitrine/legal/version-conditions.ts` — le formulaire public ;
   - `apps/collecteur/src/version-conditions.ts` — le renouvellement, qui y
     trouve aussi les **deux adresses absolues** du §3.3 ;
   - `supabase/functions/_shared/version-conditions.ts` — les deux fonctions qui
     valident.

   Trois copies engendrées par le même passage, et non trois constantes tenues
   séparément : c’est `generer-paliers-edge.mjs` qui a déjà tranché cette
   question pour la grille tarifaire, et la garde échoue si l’une diverge.

`npm run verifier:cgu` échoue si le texte a bougé sans régénération. Il entre
**au CI**, aux côtés des trois gardes du chantier précédent, **et dans la chaîne
`npm run verifier`**, où `verifier:theme`, `verifier:marque` et
`verifier:paliers` figurent déjà. Les deux : la chaîne commence par `db:reset` et
personne ne la lance, c’est le CI qui garde réellement — mais l’y omettre
laisserait un générateur sur quatre hors du rang.

### 5.2 Pourquoi le texte rendu, et non les fichiers source

Une empreinte des octets de `Conditions.tsx` changerait pour un commentaire ou
une classe CSS — on enregistrerait « nouvelle version acceptée » alors que le
lecteur ne voit aucune différence. L’empreinte porte sur ce que la personne a
réellement lu.

### 5.3 Pourquoi pas une version tenue à la main

Le chantier précédent a montré quatre fois que ce qui est tenu à la main dérive :
des citations `fichier:ligne` périmées, une liste de sections énumérée à la main
qui oubliait les trois pages les plus longues, un plancher de garde qui portait
sur une somme. L’audit de la présente conception en a trouvé trois de plus, dans
ce document même (§11). C’est précisément la preuve qu’on cherche à rendre
incontestable : elle ne peut pas reposer sur quelqu’un qui pense à incrémenter
un nombre.

## 6. Ce que le serveur refuse

Le client envoie l’empreinte ; **le serveur la compare à la sienne**.

La sienne n’est pas calculée à l’exécution : les Edge Functions tournent sous
Deno, ne voient pas les paquets de l’espace de travail npm, et ne rendent aucun
React. Elles lisent la constante de
`supabase/functions/_shared/version-conditions.ts`, **écrite par le même passage
du générateur** que celle du navigateur. C’est la garde `verifier:cgu` qui rend
impossible qu’elles divergent.

Si les deux empreintes diffèrent, c’est un onglet resté ouvert depuis une
version précédente : la demande est refusée, avec un message qui dit de
recharger la page. Les deux fonctions valident : `demander-ouverture` et
`abonnement-payer`.

Sans ce contrôle, on enregistrerait une acceptation pour un texte qu’on ne peut
pas produire — c’est-à-dire exactement la situation qu’on cherche à quitter. Une
version envoyée par le client et crue sur parole ne vaut pas mieux qu’aucune
version.

## 7. Les épreuves qui comptent

Au-delà des épreuves ordinaires, cinq doivent exister, et chacune doit avoir été
vue rouge :

1. **La garde échoue quand le texte bouge sans régénération.** Modifier une
   phrase de `Conditions.tsx`, lancer `verifier:cgu`, constater l’échec.
2. **Le serveur refuse une version qu’il ne connaît pas** — les deux fonctions.
3. **L’événement est écrit** avec sa demande, sa version et sa date, sur la voie
   publique.
4. **`collecteur_id` est posé à la naissance du compte** sur la voie payante.
5. **Le renouvellement dans l’application écrit un événement** avec
   `collecteur_id` connu d’emblée et `demande_id` nul.

## 8. Ce que ce chantier ne fait pas

- **Aucune acceptation rétroactive forcée.** Les comptes existants se rattrapent
  à leur prochain renouvellement (§3.3), pas par un écran bloquant.
- **Aucun écran de ré-acceptation** quand les conditions changeront. La table le
  permettra ; l’écran n’est pas construit.
- **Aucun lien entre un compte d’essai et son acceptation** (§3.2).
- **Aucune acceptation propre au collaborateur** (§3.4).
- **Aucun texte légal embarqué dans l’application du collecteur** (§3.3).
- Il ne touche ni à l’autorisation ARTCI, ni à l’effacement à travers le journal
  d’audit, ni aux aperçus de partage — trois chantiers ouverts, consignés dans la
  demande de fusion du chantier précédent.

## 9. Contraintes

- **Migrations et Edge Functions sont dans le périmètre**, contrairement au
  chantier précédent. Chaque geste de base demande l’accord explicite de
  l’exploitant. `db:reset` et `test:db` sont refusés au poste comme ressource
  partagée : le travail `Base` de la CI les couvre.
- **Fins de ligne CRLF** sur tout fichier du dépôt.
- **Français intégral**, guillemets « », apostrophes typographiques.
- **Espaces insécables** bornées à `apps/site/src/vitrine/legal/`.
- **Aucun cadratin** dans un texte rendu de moins de 70 caractères.
- **La migration part avant les fronts** : un front neuf sur une base non migrée
  écrirait dans une table qui n’existe pas.

## 10. Ce qui reste à trancher

Rien. Aux quatre arbitrages de l’exploitant du 2026-09-18 — périmètre, niveau de
preuve, historique des versions, mode de production de l’empreinte — s’ajoutent
les deux que l’audit a révélés non tranchés, et qui le sont désormais :

- **le transformateur JSX** : Vite par `ssrLoadModule` (§5.1) ;
- **ce que le collecteur lit au renouvellement** : un lien absolu, pas le texte
  embarqué (§3.3).

## 11. Ce que l’audit a corrigé dans ce document

Toutes les citations ont été rejouées sur la source. Six affirmations étaient
fausses ou imprécises :

| Où | Ce qui était écrit | Ce qui est vrai |
| --- | --- | --- |
| §5.1 | un générateur `node` sur le modèle des trois autres | Node refuse le `.tsx` ; il fallait nommer la transformation |
| §3.3 | pas de décision sur ce que le collecteur lit | l’application n’a ni texte ni lien ; tranché au §3.3 |
| §5.1 | « texte brut », non défini | la règle de dépouillement **est** l’empreinte ; fixée en six points |
| §3.1 | `ouvrir-compte.ts:43` crée le compte | `:43` est la déclaration `DemandeReglee` ; le compte naît à `:95` |
| §4 | `on delete set null` justifié par l’effacement d’une demande | une demande n’est jamais supprimée (`Confidentialite.tsx:20-23`) |
| §3.3 | `abonnement-payer` reçoit le palier et le téléphone | quatre champs (`:162-175`) |

Trois omissions ont été comblées : `enable row level security`, les index, et
l’absence du répertoire `Docs/legal/`.

Ce qui a été vérifié juste et n’a pas bougé : `Inscription.tsx:111` ;
`demandes_ouverture.sql:172` ; `Plus.tsx:155` et `:149` ; les droits de
`demandes_ouverture` ; 2 500 FCFA ; `react-dom` résoluble depuis la racine ; les
trois pages légales sans crochet ni DOM, donc rendables côté serveur ;
`admin-creer-collecteur` qui ignore la demande, avec témoin positif.

Une remarque hors périmètre, relevée en lisant le texte rendu et laissée telle
quelle : la première phrase de la section 2 des conditions, « il n’existe aucune
inscription en libre-service », se tient mal avec le paragraphe qui suit deux
lignes plus bas, « le compte naît du paiement confirmé, par un traitement
automatique, sans intervention humaine ». Les deux paragraphes explicatifs
lèvent l’ambiguïté pour qui lit la section entière. Ce n’est pas ce chantier.
