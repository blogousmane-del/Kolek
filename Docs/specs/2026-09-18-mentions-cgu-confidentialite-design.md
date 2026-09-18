# Kolek — Mentions légales, CGU/CGV et politique de confidentialité · Spécification de conception

**2026-09-18** · Chantier ouvert par le constat de l’audit du 2026-09-04, section 1.1, resté ouvert quatorze jours : *« Aucune mention légale, sur une plateforme qui encaisse — grave. »*

> **Ce document n’est pas un avis juridique.** Il décrit fidèlement ce que le
> système fait, et organise trois textes autour de cette description. La valeur
> juridique vient de l’exactitude de la description et de la relecture d’un
> avocat inscrit au barreau de Côte d’Ivoire. Aucune des deux ne peut être
> remplacée par l’autre.

---

## 1. Pourquoi ce chantier existe

Kolek est en production. De vrais collecteurs encaissent, de vrais abonnements sont payés, et le formulaire d’ouverture collecte un nom, un numéro, une adresse électronique et un mot de passe avant de mener à un paiement.

Il n’existe aujourd’hui **aucune** mention légale, **aucune** condition générale, **aucune** politique de confidentialité, et **aucune** acceptation avant paiement. Vérifié le 2026-09-18 : zéro occurrence de *confidentialité*, *mentions légales*, *conditions*, *CGU*, *CGV*, *privacy* ou *terms* dans `PiedDePage.tsx`, et aucune route `/confidentialite` ni `/conditions`.

L’exposition ne se limite pas au collecteur. Kolek stocke le **nom, le numéro de téléphone, le marché et l’activité des clients du collecteur** — des personnes qui ne sont pas utilisatrices, n’ont rien signé, et à qui la passerelle envoie des SMS.

## 2. Le cadre légal, vérifié et non cité de mémoire

Texte applicable : **loi n° 2013-450 du 19 juin 2013** relative à la protection des données à caractère personnel, toujours en vigueur au 2026-09-18. Autorité : l’**ARTCI**, qui agit comme Autorité de protection.

### 2.1 Kolek relève de l’autorisation préalable, pas de la déclaration

L’**article 7** soumet à autorisation préalable, entre autres :

- le traitement portant sur « tout autre identifiant de la même nature, **notamment les numéros de téléphones** » ;
- le traitement comportant des **données biométriques** ;
- **le transfert de données à caractère personnel envisagé à destination d’un pays tiers**.

Kolek relève d’au moins deux de ces cas. Le troisième dépend de `clients.photo_url` — voir §4.4.

### 2.2 « Pays tiers » se définit par la CEDEAO, pas par l’Europe

La loi définit un pays tiers comme **« tout État non membre de la CEDEAO »**. `Docs/deploiement.md` fixe la région de production à `eu-west-3`, **Paris**. Supabase, Netlify, Twilio, Resend, Chariow et Google sont tous hors CEDEAO. Le transfert est donc constant et quotidien, et il doit être assumé en toutes lettres.

### 2.3 L’article 9 donne le plan des trois textes

L’article 9 énumère ce que doit contenir le dossier adressé à l’autorité, et cette liste est presque exactement le plan d’une politique de confidentialité honnête :

- l’identité, le domicile, l’adresse postale ou géographique du responsable du traitement, et **son numéro de déclaration fiscale** ;
- la ou les finalités du traitement et la description générale de ses fonctions ;
- les interconnexions envisagées ;
- les données traitées, leur origine, et les catégories de personnes concernées ;
- **la durée de conservation** ;
- les services et catégories de personnes qui ont directement accès aux données ;
- les destinataires habilités ;
- la fonction de la personne ou le service auprès duquel s’exerce le **droit d’accès** ;
- les dispositions prises pour la sécurité et la confidentialité ;
- **l’indication du recours à un sous-traitant ou du transfert vers un pays tiers**.

C’est pourquoi la politique et le futur dossier ARTCI s’écrivent ensemble : le second est la version administrative de la première.

### 2.5 Le consentement, et le droit de refuser de figurer au fichier

La loi ivoirienne est **centrée sur le consentement**, qu’elle définit comme
« toute manifestation de volonté expresse, non équivoque, libre, spécifique et
informée ». Elle ne connaît **pas** la notion d’intérêt légitime comme
fondement d’un traitement : le terme n’apparaît qu’à l’article 27, à propos des
objectifs statutaires des responsables. Une rédaction qui invoquerait un
« intérêt légitime » à la manière du RGPD serait hors sujet, et signalerait un
texte importé plutôt qu’écrit pour ce pays.

L’**article 28** énumère ce que le responsable doit fournir à la personne **au
moment de la collecte**, quels que soient les moyens employés : son identité et
celle de son représentant ; les finalités déterminées ; les catégories de
données ; les destinataires ; le droit d’accès et de rectification ; la durée de
conservation ; le transfert vers un pays tiers. Et, en toutes lettres :

> **« la possibilité de refuser de figurer sur le fichier en cause »**

C’est l’article qui gouverne le cas le plus délicat de Kolek. Un client de
collecteur a le droit de refuser d’être inscrit — et aujourd’hui **rien ne
permet de l’exercer** : ni un écran, ni une case, ni une mention que le
collecteur pourrait lire à son client. Le collecteur inscrit un nom et un
numéro sans qu’aucune trace du consentement n’existe.

Deux conséquences pour ce chantier :

- les CGU font porter au collecteur l’obligation d’informer son client des
  mentions de l’article 28 **avant** de l’inscrire, et de ne pas l’inscrire s’il
  refuse — c’est le seul montage tenable tant qu’aucun écran n’existe ;
- la politique de confidentialité décrit ce montage sans l’embellir, et nomme
  le manque : la trace du consentement n’est pas conservée, et le chantier des
  droits des personnes (§8) devra la produire.

**Ce point est le plus exposé du dossier.** Il ne se règle pas par une phrase
dans une page : il demande un geste dans le produit, et l’avocat qui relira
devra le savoir.

### 2.4 Ce que coûte le manquement

Sanctions pécuniaires administratives plafonnées à **10 000 000 FCFA**, portées jusqu’à **100 000 000** en cas de manquement réitéré dans les cinq ans, dans la limite de **500 000 000 FCFA**, « sans préjudice des sanctions pénales ». L’article 21 punit la collecte illicite de données sensibles de **dix à vingt ans d’emprisonnement** et de 20 à 40 millions d’amende.

## 3. Ce que l’exploitant a tranché

| Question | Décision | Conséquence |
|---|---|---|
| Statut ARTCI | **Rien n’est fait** | Aucun numéro n’est invoqué dans les pages. Le dossier d’autorisation est un livrable séparé. |
| Forme juridique | **Entreprenant**, dispensé d’immatriculation au RCCM (§9.1) | Les textes nomment la **personne physique** exploitant sous l’enseigne. Le patrimoine personnel répond. |
| Responsable du traitement | **L’exploitant, seul** | Conforme au code : il détermine finalités et moyens. Le collecteur est un utilisateur, tenu par les CGU d’informer ses clients. |
| Conservation | **Par catégorie, avec plancher comptable** | Tableau au §5.3. |
| `clients.photo_url` | **À supprimer** | Migration séparée, après contrôle en production. Retire la question biométrique du dossier. |
| Contact | **`contact@kolek.cash`** | Adresse unique : mentions légales, exercice des droits, notifications contractuelles. |

**Point à confirmer avant toute mise en ligne :** le domaine `kolek.cash` porte bien des enregistrements MX (`mx1.hostinger.com` priorité 5, `mx2.hostinger.com` priorité 10), mais l’existence et la relève de la boîte `contact@kolek.cash` n’ont pas pu être vérifiées depuis le dépôt. La politique annonce un délai de réponse ; ce délai démarre une horloge opposable. **La boîte doit exister et être relevée avant publication.**

## 4. Ce que le code sait faire, et ce qu’il ne sait pas

Un texte ne vaut que s’il décrit le système réel. Constats mesurés le 2026-09-18.

### 4.1 Rien ne peut être supprimé

Comptage sur toutes les migrations : `for select` 11 politiques, `for insert` 7, `for update` 21, **`for delete` : zéro**. Sous RLS, l’absence de politique vaut absence de droit. Aucun collecteur, aucun administrateur passant par la voie normale ne peut supprimer une ligne, dans aucune table.

### 4.2 Un collecteur qui a encaissé ne peut pas être supprimé

`mises.collecteur_id` est en `on delete restrict`. `admin-supprimer-collecteur` compte avant de tenter, et la base refuserait de toute façon.

### 4.3 L’effacement d’un client se heurte à la comptabilité

`cartes` référence `clients(id, collecteur_id) on delete cascade` ; `mises.carte_id` est en `on delete restrict`. Effacer un client cascaderait sur ses cartes, ce que les mises bloqueraient. Et ce blocage est **légitime** : une mise est une pièce comptable, que l’acte uniforme OHADA impose de conserver dix ans.

**Décision de conception, et c’est la plus importante du chantier : le droit d’effacement s’exerce par anonymisation, pas par suppression.** Le nom et le numéro sont remplacés par une mention neutre ; les montants restent, sans rien qui désigne la personne. C’est légal, c’est réalisable sur le schéma actuel, et c’est vrai. Promettre une « suppression totale » serait faux, et une promesse fausse dans une politique de confidentialité est précisément ce qu’un adversaire cherche.

### 4.4 `clients.photo_url` est une colonne morte

Zéro occurrence de `photo_url` ou `photoUrl` dans `apps/`, `packages/` et `supabase/functions`. Témoins de la même sonde : `nom` 133 fichiers, `telephone` 44, `marche` 19 — la sonde voit. La colonne existe pourtant au schéma, et `20260816115500_durcissement_audit.sql` accorde aux collecteurs l’`insert` et l’`update` dessus.

Une colonne que personne n’écrit, que personne ne lit, qui porte la catégorie de donnée la plus lourde du projet, et sur laquelle un client modifié pourrait écrire. Elle sort, par une migration dédiée, après contrôle du nombre de lignes non nulles en production.

### 4.5 L’adresse publique est un compte personnel

`liens.ts:47` expose `mailto:gsmtechnoloy@gmail.com` comme « l’adresse de GTCS », compilée dans le paquet public. Remplacée par `contact@kolek.cash`.

## 5. Les trois textes

### 5.1 Mentions légales — `/mentions-legales`

Identité de la personne physique exploitant sous l’enseigne GTCS ; adresse ; `contact@kolek.cash` ; directeur de la publication ; hébergeurs nommés — Supabase (base et fonctions, région `eu-west-3`, Paris) et Netlify (fronts) ; mention que GTCS n’est pas un établissement financier et qu’aucun flux d’épargne ne transite par la plateforme, ce que le pied de page affirme déjà.

### 5.2 Conditions générales — `/conditions`

Objet et définitions ; accès sur ouverture de compte par GTCS, sans inscription libre ; les quatre paliers et leurs prix réels tels que `paliers.ts` les porte ; durée, reconduction, paiement par Chariow ; suspension pour impayé et ce qu’elle change ; résiliation de part et d’autre ; disponibilité, sans promesse chiffrée que rien ne garantit ; propriété intellectuelle ; responsabilité et ses limites ; **obligations du collecteur** — informer ses clients des données inscrites, n’inscrire que ce qui sert la collecte, répondre de son usage de la passerelle SMS ; droit applicable ivoirien et juridiction compétente.

**Contrainte ferme :** les CGU ne décrivent que des prestations que le produit rend. C’est ce qui a motivé la PR #10 — la page des tarifs vendait un export CSV que le collecteur n’a jamais eu.

### 5.3 Politique de confidentialité — `/confidentialite`

Le plan de l’article 9, dans l’ordre, plus le tableau des durées :

| Donnée | Base | Durée |
|---|---|---|
| Compte collecteur (nom, téléphone, zone) | exécution du contrat | durée de la relation, puis archivage comptable |
| Clients du collecteur (nom, téléphone, marché, activité) | consentement recueilli par le collecteur (§2.5) | anonymisation à la fermeture du compte du collecteur, ou sur demande (§4.3) |
| Mises, cartes, retraits, caisses du jour | obligation comptable OHADA | 10 ans, accès restreint |
| Paiements d’abonnement | obligation comptable et fiscale | 10 ans |
| Demandes d’ouverture non converties | consentement du demandeur, donné en remplissant le formulaire | 1 an |
| Journal d’audit | sécurité | 1 an |
| Avis clients envoyés (SMS) | exécution du service | 1 an |

Sous-traitants nommés un par un, avec leur rôle : **Supabase** (hébergement de la base, de l’authentification et des fonctions, Paris), **Netlify** (hébergement des fronts), **Twilio** (SMS), **Resend** (courriel), **Chariow** (paiement), **Google** (connexion facultative). Transfert hors CEDEAO assumé, avec sa base et son caractère quotidien.

Droits : information, accès, rectification, opposition, et effacement **par anonymisation** au sens du §4.3. Procédure par `contact@kolek.cash`, avec un délai de réponse annoncé et tenable. La politique dit franchement qu’aucun écran n’existe encore pour cela, et que la demande se traite à la main.

## 6. La plomberie

- Trois routes dans `apps/site` : `/mentions-legales`, `/conditions`, `/confidentialite`.
- Les trois liens au pied de page, dans une colonne nommée.
- Dans `Inscription.tsx`, **au-dessus du bouton de paiement** : une case à cocher non pré-cochée, et un envoi refusé tant qu’elle ne l’est pas, avec le lien vers les deux textes.
- `liens.ts` : `CONTACT_DEMO` pointe sur `contact@kolek.cash`.
- **Défaut A.3 de l’audit du 4 septembre**, toujours ouvert : page 404 dédiée, et **statut 404 réel** — la redirection Netlify rend aujourd’hui 200 sur l’inconnu.

Chaque page est une page ordinaire de la vitrine, lisible sans JavaScript actif au-delà du rendu, et lisible à 400 px de large.

## 7. Comment on vérifie

- Épreuves d’écran : chaque route rend son titre ; le pied de page porte les trois liens ; le formulaire **refuse** l’envoi sans la case cochée ; la case n’est jamais pré-cochée.
- Une épreuve de source qui échoue si `gsmtechnoloy@gmail.com` reparaît dans `apps/` ou `packages/`.
- Une épreuve de source qui échoue si une page cite un numéro ARTCI tant qu’il n’existe pas.
- `verifier:tirets`, `verifier:contraste` et `verifier:champs` s’appliquent comme à toute page de la vitrine.
- Le 404 se vérifie par le statut HTTP rendu, pas par le contenu affiché.

## 8. Hors périmètre, assumé

- **Le dossier d’autorisation ARTCI** — document séparé, nourri par cette spec, à porter par un avocat.
- **L’écran d’exercice des droits** pour le collecteur et pour ses clients — chantier suivant. La procédure par courriel tient l’intervalle, et la politique le dit.
- **La suppression de `clients.photo_url`** — migration dédiée, avec contrôle préalable en production.
- **L’immatriculation** — hors de ce que le dépôt peut faire, et la protection la plus forte du lot.

## 9. L’identité de l’exploitant, et son statut

Fourni par l’exploitant le 2026-09-18 :

| Élément | Valeur |
| --- | --- |
| Enseigne | **GSM TECHNOLOGIE CYBER SHOP** — dont « GTCS » est le sigle employé partout dans le produit |
| Adresse | **Saïoua**, Côte d’Ivoire |
| Numéro de compte contribuable | **4212842W** |
| Statut | **Entreprenant** — impôt déclaré, **pas d’immatriculation au RCCM** |
| Contact | **contact@kolek.cash** |

### 9.1 L’absence de RCCM est régulière, et une note antérieure se trompait

Une première version de cette analyse affirmait que vendre un abonnement
mensuel imposait l’immatriculation au RCCM. **C’est faux pour le statut
d’entreprenant.** L’acte uniforme OHADA portant droit commercial général
dispense l’entreprenant de l’immatriculation et lui substitue une simple
**déclaration d’activité**, déposée sans frais au greffe de la juridiction
compétente. L’exploitant n’est donc pas en irrégularité.

Trois conséquences pour ce chantier :

1. **Le compte contribuable ne doit pas être annulé.** C’est exactement le
   numéro de déclaration fiscale qu’exige l’article 9 ; sans lui, le dossier
   ARTCI ne peut pas être déposé complet. L’exploitant a envisagé de le faire
   supprimer pour éviter un problème : ce serait en créer un autre, d’une
   nature bien plus lourde.
2. **Les mentions légales publieront le numéro de déclaration d’activité**
   dès qu’il existera, à côté du compte contribuable. C’est ce qui rend
   l’enseigne opposable.
3. **Un seuil est à surveiller.** L’entreprenant bascule obligatoirement vers
   le statut de commerçant, avec immatriculation au RCCM, si le chiffre
   d’affaires dépasse **10 millions FCFA** pour une entreprise de services
   pendant **deux années consécutives**. Aux paliers actuels, l’ordre de
   grandeur est de 83 collecteurs à 10 000 FCFA par mois, ou 330 à 2 500.

Ce qui reste vrai, et qui n’est pas une faute mais le prix du statut léger :
faute de personne morale, **le patrimoine personnel de l’exploitant répond**.
Les textes nomment donc la personne physique exploitant sous l’enseigne.

## 10. Ce qui manque encore, et qui interdit la publication

Aucune page ne part en ligne tant que ces trous ne sont pas comblés. Ils seront
marqués dans le texte de façon à ce qu’une publication accidentelle soit
visible à l’œil nu.

1. **Nom complet de la personne physique** exploitant sous l’enseigne — le nom
   d’une enseigne ne désigne personne en droit. **Seul trou réellement
   bloquant : sans lui, aucun des trois textes ne peut être rédigé.**
2. **Adresse plus précise que la seule commune** : quartier, lot, ou boîte
   postale. « Saïoua » seul ne permet ni de notifier ni d’assigner.
3. **Numéro de déclaration d’activité** au greffe, s’il existe déjà — sinon la
   démarche est gratuite et les mentions le porteront ensuite.
4. **Numéro de téléphone professionnel** à publier.
5. **Confirmation que `contact@kolek.cash` existe et est relevée** — les MX du
   domaine sont configurés, la boîte n’a pas pu être vérifiée depuis le dépôt.
6. **Délai de réponse** que l’exploitant s’engage à tenir sur les demandes
   d’exercice des droits. La politique l’annoncera, et il devient opposable.
   Sept jours ouvrés est tenable ; quarante-huit heures ne le serait pas.
