# Audit du chantier « trace de l'acceptation » — ce qui a été trouvé, et comment

**2026-09-19** · **Périmètre :** branche `trace-acceptation` à `67307a0`, **27
commits** depuis `46930d4`, 38 fichiers, 4 170 lignes ajoutées. PR #13, empilée
sur #11.

> Ce document existe parce que le dossier de relecture vivait dans
> `.superpowers/sdd/`, que `.gitignore` exclut. Vingt-et-un documents, 7,2 Mo —
> invisibles sur GitHub, effacés par un `git clean -fdx`, inconnus des sessions
> voisines. Ce qui suit est ce qu'un relecteur doit savoir avant de fusionner.

**Suite, ajoutée le 2026-09-19 au soir.** Fusionnée depuis, par commit de
fusion : #11 en `2bd9509`, #13 en `a0c830a`. La chaîne complète est constatée,
pas supposée — migration `20260918100000` appliquée sur le projet lié
(`local` et `remote` renseignés), puis **3 fonctions sur 19** ayant pris une
version à la vague de 18:58 : `demander-ouverture` (v40), `chariow-webhook`
(v19), `abonnement-payer` (v17). Le déploiement a d'abord échoué sur un jeton
Supabase expiré — voir `Docs/deploiement.md` §9.1, qui ne connaissait pas cet
état.

---

## Ce que le chantier livre

Une table `acceptations_conditions` — un événement par acceptation, jamais
écrasé — et l'empreinte de la version du texte accepté enregistrée avec chaque
ligne. Les trois chemins où un accord se forme l'écrivent : le formulaire
payant, le formulaire d'essai, le renouvellement dans l'application.

Le serveur **refuse une version qu'il ne connaît pas** plutôt que de croire le
client. Le renouvellement sert aussi de rattrapage : chaque collecteur déjà en
place accepte à son prochain paiement, sans écran bloquant en tournée.

`scripts/generer-cgu.mjs` rend les deux pages légales, écarte la navigation,
dépouille le reste en texte, et en tire l'empreinte **`e4adce80ca3bc9b1`**.
L'instantané correspondant vit dans `Docs/legal/`, et son nom porte l'empreinte
de son contenu : c'est la pièce qu'on produirait à l'audience.
`npm run verifier:cgu` entre au CI et échoue si l'une des trois constantes
engendrées diverge, ou si l'instantané ne retombe pas sur sa propre empreinte.

---

## Les défauts trouvés, et ce qui les a trouvés

Aucun de ceux qui suivent n'a été trouvé en relisant. Tous l'ont été en
mesurant, et plusieurs en mutant le code pour voir si une épreuve rougissait.

### La garde qui ne gardait qu'un nom de fichier

`estAJour` ne comparait que le suffixe du nom de l'instantané. Prouvé sur un
clone frais : `core.autocrlf` rendait le fichier en CRLF, son contenu
s'empreignait à `90202adfd1deb34b`, **et la garde restait verte**. La pièce
d'audience ne correspondait plus à l'empreinte que porte son propre nom. Fermé
des deux côtés — contrôle du contenu, et `.gitattributes`.

### Quatre phrases que personne n'avait écrites

La pièce portait « Gratuit pendant 30 jours.20 clients » : une `<ul>` ouvrante
après du texte en ligne ne produisait aucun saut, et la passe qui retire les
balises l'effaçait en silence. Trois lignes commençaient par un point, dont une
réduite au seul caractère « . ». Tous ces défauts venaient du code que le plan
dictait.

### Une épreuve neuve qui ne gardait rien

Le premier correctif du défaut ci-dessus était accompagné d'une épreuve qui
passait sans lui : sa `</p>` fournissait déjà la coupure. La mutation l'a dit.
Réécrite sur une liste imbriquée.

### Neuf sondes fausses

Réparties sur tout le chantier, dans mon travail comme dans celui des
sous-agents : un compteur d'apostrophes qui comptait le délimiteur de chaîne,
une commande de complétude verte qui ne mesurait rien, un `execFileSync` qui
rapportait rouge sur une suite verte. **Règle retenue : tout zéro vient avec un
cas dont on connaît la réponse.**

### Neuf épreuves préexistantes cassées sans que rien ne le dise

La tâche 5 a changé la forme du bouchon PostgREST ; `ouvrir-compte.test.ts`
rendait `TypeError: ...eq(...).is is not a function`. Corrigé en rendant le
bouchon chaînable, comme PostgREST.

### Une construction cassée depuis le chantier précédent

`MentionsLegales.test.tsx(59,43): error TS2345`, introduite par un commit de
`mentions-et-confidentialite` et non vue à sa clôture — où trois constructions
avaient pourtant été annoncées vertes. La PR aurait échoué au CI.

### Le mobilier de navigation dans la pièce d'audience

La pièce s'ouvrait sur « ← Retour à l'accueil » et se fermait sur « Conditions
générales · Mentions légales » — dont un document qu'elle ne contient pas. Le
vrai coût n'était pas cosmétique : **l'empreinte enregistrée avec chaque
acceptation dépendait de libellés de navigation.** Renommer un lien forçait une
réacceptation générale pour un changement sans contenu juridique.

### Une garde dont le remède détruisait la propriété gardée

Le correctif ci-dessus n'était tenu par rien. Mutation : retirer la marque
`data-hors-contrat` laissait 386 épreuves vertes ; seul `verifier:cgu`
rougissait, et son message dit « lance `npm run generer:cgu` » — le geste même
qui remet la navigation dans la pièce, en vert.

**C'est le motif le plus utile de ce chantier, et il vaut au-delà de lui :**
une garde dont le message de remède détruit ce qu'elle garde n'est pas une
garde. Il vaut la peine de chercher le même motif ailleurs dans le dépôt.

Fermé par deux blocs d'épreuves, sans Vite : l'un refuse la navigation dans
l'instantané en vigueur, l'autre exige les marques dans les sources. La première
version de ces épreuves portait **le même vice** — elle prenait « le premier
fichier du répertoire », alors que `Docs/legal/` est fait pour accumuler les
instantanés ; elle serait tombée sur une pièce périmée dès le deuxième
versement. Elle désigne maintenant la pièce par la constante engendrée.

### Deux faux positifs du retrait

`<p data-hors-contrat-bis>` et `<p title="data-hors-contrat">` voyaient leur
élément disparaître : la règle cherchait la chaîne n'importe où dans la balise.
Inaccessible dans les pages actuelles, mais la conséquence aurait été une
section de contrat disparue de la pièce, empreinte, et acceptée par des gens.

### Deux affirmations fausses dans le carnet de déploiement

Écrites par moi la veille, sans vérification : le déploiement automatique des
Edge Functions ne part que sur une poussée vers `main` **et** seulement si
`SUPABASE_ACCESS_TOKEN` est posé et accepté ; et la migration n'est pas sans
verrou — ses clés étrangères prennent un `SHARE ROW EXCLUSIVE` sur
`demandes_ouverture` et `auth.users`, écrite à chaque connexion.

---

## Ce que seul le CI pouvait trancher, et ses réponses

Trois questions étaient hors de portée du poste : `test:db` y est refusé comme
ressource partagée, et la pile locale ne montait pas. Le premier passage du
travail `Base` a rendu **11 épreuves rouges**, deux fichiers sur 77.

| Question | Réponse du CI |
|---|---|
| `CHARIOW_PRODUITS` nomme-t-elle `pro` ? | **Elle n'était posée nulle part.** `lireProduits` jetait, et `abonnement-payer` rendait `CONFIGURATION` 500 avant de lire la saisie |
| RLS refuse-t-elle vraiment `anon` ? | **Oui** — mesuré contre une table qui existe, cette fois. En local l'épreuve était verte parce que la table manquait |
| Les 7 épreuves de `abonnement-payer.test.ts` | **Vertes**, pour la première fois |

La première réponse a révélé une lacune de mon analyse : j'avais listé les
portes de `abonnement-payer` et sauté celle de `lireProduits`, faisant descendre
la garde de `CHARIOW_CLE_API` sous le contrôle de version sans voir qu'une
seconde porte rendait le même `CONFIGURATION` avant lui.

Les huit autres rouges venaient de `demander-ouverture.test.ts`, qui n'envoyait
pas de `version` : le fichier unitaire avait été mis à jour, celui d'intégration
jamais, et **il ne tourne que sous `test:db`**.

État actuel du CI : **78 fichiers d'épreuves verts**, les deux travaux au vert.

---

## Deux décisions de conception qui méritent l'attention du relecteur

**La garde de configuration est scindée.** `SUPABASE_SERVICE_ROLE_KEY` est
exigée tôt ; `CHARIOW_CLE_API` ne l'est qu'à son premier usage réel. Dire à
quelqu'un que son onglet est périmé ne demande aucun fournisseur de paiement, et
les lier rendait ce refus inobservable partout où il est éprouvé.

**L'acceptation s'écrit avant la vente, pas après.** La personne a coché et
appuyé sur payer : c'est là que le contrat se forme. Si la boutique ne répond
pas ensuite, elle a quand même accepté cette version-là, à cette heure-là.
N'avoir de preuve que des paiements réussis laisserait sans trace exactement les
cas où un litige naît. C'est aussi ce que fait déjà la voie publique.

Un index partiel `(collecteur_id, version) where demande_id is null` rend
l'écriture idempotente et borne une route que `consommer_debit` ne couvre pas.
`enregistrerAcceptation` lit `23505` comme un succès — le fait est déjà
enregistré.

---

## Ce qui reste ouvert

- **Les commits portent des attributions hétérogènes** (Haiku 4.5, Sonnet 5,
  Opus 5) selon le modèle du sous-agent. Sans conséquence, non uniformisé.
- **La spec décrit l'état d'avant le chantier**, et ses citations de lignes ont
  glissé — voir la note datée en tête du document.
- **La marque `data-hors-contrat` de `MentionsLegales.tsx` a été retirée** : le
  générateur ne rend pas cette page, et marquer ce qu'aucun code ne lit est de
  l'anticipation. Le jour où elle entrera dans la pièce, la marque ira avec.

---

## Avant de fusionner — le risque muet

**`npx supabase db push` doit passer avant la fusion**, et ce n'est pas une
formalité.

`enregistrerAcceptation` ne fait jamais échouer une requête : refuser une
ouverture de compte déjà payée pour une ligne de journal serait pire que le mal.
Mais si la migration est en retard, la table n'existe pas, chaque insertion
échoue, et :

- les comptes s'ouvrent normalement ;
- les paiements passent normalement ;
- **aucune acceptation n'est enregistrée** ;
- le CI est vert, Netlify est vert, et rien dans le produit ne l'indique.

C'est-à-dire exactement l'état que ce chantier existe pour quitter, atteint sans
qu'un seul signal le dise. Le §9 de `Docs/deploiement.md` donne l'ordre complet
et la requête de constat — avec l'avertissement qui compte : **zéro ligne ne
prouve rien tant que personne n'a accepté depuis la mise en ligne.** Le seul
constat qui vaut est une ligne dont on connaît l'auteur, après un geste qu'on a
fait soi-même.

---

*Kolek — audit du chantier `trace-acceptation`, 2026-09-19, écrit avant la
fusion de la PR #13 et complété après.*
