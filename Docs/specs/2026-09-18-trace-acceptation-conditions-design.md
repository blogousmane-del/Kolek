# La trace de l’acceptation des conditions

> Conception validée par l’exploitant le 2026-09-18. Chantier suivant de
> `2026-09-18-mentions-cgu-confidentialite-design.md`.

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
`supabase/functions/demander-ouverture/index.ts` le dit en toutes lettres. La
case à cocher n’est donc pas une formalité avant un échange : c’est **le moment
où le contrat se forme**. Un contrat dont on ne garde aucune trace de la
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
`supabase/functions/_shared/ouvrir-compte.ts:43` crée le compte.

L’acceptation est saisie au formulaire et **reliée au compte** à sa naissance :
cette voie connaît la demande dont le compte est né.

C’est le chemin où le contrat se forme, et c’est celui qui compte le plus.

### 3.2 Formulaire public, essai — couvert partiellement, et c’est assumé

Formulaire → demande → un administrateur marque la demande « ouverte »
(`supabase/migrations/20260823090000_demandes_ouverture.sql:172`,
`admin_traiter_demande`) **puis crée le compte séparément**.

**`admin-creer-collecteur` ignore la demande** — vérifié, la fonction n’en porte
aucune mention. Il n’existe donc aucun lien entre le compte créé et la demande
dont il provient.

L’acceptation restera attachée à la demande, avec le nom et le numéro, sans lien
direct vers le compte. **Décision : c’est suffisant.** L’essai est gratuit ; un
litige sur un essai n’a pas d’argent en jeu. Relier les deux imposerait de
modifier l’application d’administration, pour une voie sans enjeu monétaire.

### 3.3 Collecteur déjà en place qui paie — à couvrir, et c’est le rattrapage

`apps/collecteur/src/ecrans/Plus.tsx:155`, « Renouveler mon abonnement », appelle
`abonnement-payer`. Cette fonction ne reçoit que **le palier et le téléphone** :
aucune acceptation n’est recueillie aujourd’hui.

C’est un vrai trou, et il se referme avec une vertu que la conception initiale
n’avait pas vue : **si l’acceptation est demandée avant de payer dans
l’application, chaque collecteur déjà en place l’accepte à son prochain
renouvellement.** Le rattrapage des comptes existants se fait donc tout seul, au
moment où il y a de l’argent en jeu — et personne n’est bloqué en tournée devant
un mur de texte au démarrage.

Cette voie est même plus propre que la voie publique : la personne est
authentifiée, donc `collecteur_id` est connu directement, sans passer par une
demande.

### 3.4 Collaborateur — non couvert, et traité par le contrat

Un collaborateur ne paie jamais : son abonnement est réglé par son titulaire
(`Plus.tsx`, branche `profil.titulaireId`). Il ne rencontrera donc aucun des
trois chemins ci-dessus.

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

`on delete set null` sur la demande : la politique de confidentialité annonce
l’effacement d’une demande sur demande, sauf si un paiement s’y rattache. Si la
demande part, l’acceptation survit par le compte.

`on delete cascade` sur le compte : `admin-supprimer-collecteur` ne supprime
qu’un compte n’ayant **jamais manié d’argent**. Sans argent, pas de litige
monétaire, et la preuve n’a plus de sujet.

Aucun droit pour `anon` ni `authenticated`, comme `demandes_ouverture` : la
table n’est accessible qu’à la clé de service, donc qu’à travers les Edge
Functions qui valident avant d’écrire.

## 5. La version du texte, et pourquoi elle ne peut pas dériver

### 5.1 Le générateur, sur un motif que le dépôt connaît déjà

Trois scripts fonctionnent ainsi dans ce dépôt : `generer-theme.mjs`,
`generer-marque.mjs`, `generer-paliers-edge.mjs`. Chacun produit un artefact, et
son mode `--verifier` échoue si l’artefact en place ne correspond plus à sa
source. C’est l’idiome de la maison, et c’est celui qu’on suit.

`scripts/generer-cgu.mjs` :

1. rend `Conditions` et `Confidentialite` en **texte brut** — `react-dom` est
   déjà une dépendance du dépôt, donc `react-dom/server` ne coûte aucun paquet
   neuf ;
2. calcule l’empreinte de ce texte : **SHA-256, rendue en hexadécimal et
   tronquée à seize caractères**. Seize, parce que la valeur se lit dans un
   message d’erreur et se compare à l’œil pendant une mise au point ; et parce
   qu’une collision sur seize caractères hexadécimaux suppose un adversaire qui
   fabrique un second texte juridique de même empreinte, ce qui n’est pas le
   risque qu’on traite ici ;
3. écrit l’instantané dans `Docs/legal/conditions-<AAAA-MM-JJ>-<empreinte>.txt`,
   portant le texte rendu des deux pages — **c’est le document qu’on produit au
   tribunal**, pas un identifiant opaque. La date sert à le retrouver, l’empreinte
   à le relier à l’événement enregistré ; les deux figurent dans le nom pour
   qu’aucune recherche ne soit nécessaire ;
4. écrit la constante là où chaque partie la lit :
   - `apps/site/src/vitrine/legal/version-conditions.ts` — le formulaire public ;
   - `apps/collecteur/src/version-conditions.ts` — le renouvellement ;
   - `supabase/functions/_shared/version-conditions.ts` — les deux fonctions qui
     valident.

   Trois copies engendrées par le même passage, et non trois constantes tenues
   séparément : c’est `generer-paliers-edge.mjs` qui a déjà tranché cette
   question pour la grille tarifaire, et la garde échoue si l’une diverge.

`npm run verifier:cgu` échoue si le texte a bougé sans régénération. **Il entre
au CI**, aux côtés des trois gardes du chantier précédent.

### 5.2 Pourquoi le texte rendu, et non les fichiers source

Une empreinte des octets de `Conditions.tsx` changerait pour un commentaire ou
une classe CSS — on enregistrerait « nouvelle version acceptée » alors que le
lecteur ne voit aucune différence. L’empreinte porte sur ce que la personne a
réellement lu.

### 5.3 Pourquoi pas une version tenue à la main

Le chantier précédent a montré quatre fois que ce qui est tenu à la main dérive :
des citations `fichier:ligne` périmées, une liste de sections énumérée à la main
qui oubliait les trois pages les plus longues, un plancher de garde qui portait
sur une somme. C’est précisément la preuve qu’on cherche à rendre incontestable :
elle ne peut pas reposer sur quelqu’un qui pense à incrémenter un nombre.

## 6. Ce que le serveur refuse

Le client envoie l’empreinte ; **le serveur la compare à la sienne**, générée
dans le même passage.

Si elles diffèrent, c’est un onglet resté ouvert depuis une version précédente :
la demande est refusée, avec un message qui dit de recharger la page.

Sans ce contrôle, on enregistrerait une acceptation pour un texte qu’on ne peut
pas produire — c’est-à-dire exactement la situation qu’on cherche à quitter. Une
version envoyée par le client et crue sur parole ne vaut pas mieux qu’aucune
version.

## 7. Les épreuves qui comptent

Au-delà des épreuves ordinaires, cinq doivent exister, et chacune doit avoir été
vue rouge :

1. **La garde échoue quand le texte bouge sans régénération.** Modifier une
   phrase de `Conditions.tsx`, lancer `verifier:cgu`, constater l’échec.
2. **Le serveur refuse une version qu’il ne connaît pas.**
3. **L’événement est écrit** avec sa demande, sa version et sa date.
4. **`collecteur_id` est posé à la naissance du compte** sur la voie payante.
5. **Le renouvellement dans l’application écrit un événement** avec
   `collecteur_id` connu d’emblée.

## 8. Ce que ce chantier ne fait pas

- **Aucune acceptation rétroactive forcée.** Les comptes existants se rattrapent
  à leur prochain renouvellement (§3.3), pas par un écran bloquant.
- **Aucun écran de ré-acceptation** quand les conditions changeront. La table le
  permettra ; l’écran n’est pas construit.
- **Aucun lien entre un compte d’essai et son acceptation** (§3.2).
- **Aucune acceptation propre au collaborateur** (§3.4).
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

Rien. Les quatre arbitrages — périmètre, niveau de preuve, historique des
versions, mode de production de l’empreinte — ont été rendus par l’exploitant le
2026-09-18, et le chemin 3 a été ajouté au périmètre sur sa demande.
