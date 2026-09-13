# Kolek — J2b : le hors-ligne · Spécification de conception

> 2026-09-13. Suite de `2026-08-16-j2a-collecte-en-ligne-design.md`, qui a découpé J2 en deux et reporté cette moitié.
> Architecture de la synchro tranchée par `2026-08-15-j1-socle-design.md` §4 ; ce document ne la rouvre pas, il la réalise.
> Décisions prises avec l'exploitant le 2026-09-13, question par question.

---

## 1. Pourquoi ce chantier existe

L'audit des forfaits du 2026-09-13 a comparé la grille tarifaire au produit. La grille vend « Encaissement hors ligne » **aux quatre forfaits** ; le produit n'en a pas. `enregistrerMise` écrit directement au serveur (`apps/collecteur/src/ecritures.ts:257`), et sans réseau l'application répond « Pas de réseau. Réessaie une fois connecté. »

Ce n'est pas une fonction parmi d'autres. Le cahier des charges en fait **le différenciateur** de Kolek (§1 : « hors-ligne d'abord [...] encaisser sans réseau, synchroniser après »), l'exige dans M2, M3, P2 et §7 (« sans perte ni doublon »), et en décrit l'outil au §8 (« PWA hors-ligne (IndexedDB + file de synchro) »).

J2a l'avait reporté à dessein — « déboguer la synchro sous la pression d'une démonstration » — en préparant le terrain. J2b n'a jamais été construit.

L'audit a ouvert quatre chantiers : **hors-ligne**, expiration des abonnements, plafond de clients, exports CSV. Celui-ci passe en premier, sur décision de l'exploitant, parce qu'il est promis à tous et qu'il fixe la règle « un refus du serveur ne perd jamais rien » dont les suivants dépendent. Le **rattrapage** (§10) le suit immédiatement.

### 1.1 La contrainte absolue — aucune perte de données

Posée par l'exploitant. Dans ce document, elle veut dire exactement :

- aucune mise, aucun client, aucune carte, aucune déclaration de caisse **perdu**, ni **compté deux fois** ;
- rien n'est montré au collecteur comme fait sans être écrit sur le disque du téléphone ;
- aucune règle nouvelle ne supprime ni ne cache une donnée existante ;
- aucune modification du schéma serveur n'est prévue ; s'il en fallait une, elle serait additive et soumise à un accord séparé.

### 1.2 Périmètre

**Fonctionne sans réseau**

- Encaisser une mise.
- Inscrire un client avec sa première carte.
- Ouvrir une carte à un client existant.
- Déclarer la caisse du jour.
- Consulter les écrans de collecte : accueil, clients, fiche client, encaissement, ouverture de carte, caisse du jour.

**Reste en ligne, et le dit**

- Clôture et retrait — le serveur recalcule le montant rendu (`collecteur-cloturer-carte`).
- Corriger une fiche, consentement aux avis.
- Encaisser pour un collaborateur, équipe, abonnement, mot de passe.
- Bilan, reçus, historique, avis ; dans `Alertes`, tout ce qui n'est pas un refus de synchro (§8).

**Hors périmètre** — voir §10.

### 1.3 Critère de réussite

Un collecteur **sans aucun réseau pendant toute une journée**, téléphone redémarré au marché :

1. ouvre l'application et voit sa tournée ;
2. encaisse des mises, inscrit un client avec sa carte, ouvre une carte, déclare sa caisse ;
3. voit à tout moment combien d'opérations attendent l'envoi ;
4. retrouve le réseau le soir : chaque opération arrive **une fois et une seule**, et les totaux du serveur égalent au franc près ceux du téléphone ;
5. toute opération que le serveur refuse reste visible, intacte, avec son motif en clair.

---

## 2. Ce qui existe déjà, et que J2b ne rouvre pas

| Acquis | Où | Ce qu'il garantit |
|---|---|---|
| Identifiants tirés sur le téléphone | `mises.id`, `clients.id`, `cartes.id` (`crypto.randomUUID()`) | Un rejeu porte le même identifiant. |
| Doublon testé **en premier** | `mises_avant_insert` (`20260902120000_encaisse_par.sql:79`) | Un rejeu se présente toujours comme `DOUBLON`, quel que soit l'état de la carte depuis (J1 §4.3). |
| Verrou de ligne sur la carte | même déclencheur, `for update` | Deux mises simultanées ne créent pas deux commissions. |
| Fenêtre de date | même déclencheur, et `caisses_calculer_attendu` | `encaisse_le` et `caisses_jour.date` acceptés d'un jour en avant à **90 jours en arrière** — « le mode de fonctionnement normal du produit ». |
| Table des refus | `synchro_rejets` (`20260815232256_socle_operations.sql:16`) | `insert (id, collecteur_id, charge_utile, motif)` accordé au collecteur ; charge bornée à 8 192 caractères, motif à 200. |
| Clôture rejouable | `collecteur-cloturer-carte` | `retraits.carte_id` unique ; une seconde tentative reprend la ligne existante. |
| Coquille hors ligne | `vite-plugin-pwa` | L'application s'ouvre sans réseau. |
| Compteur des refus côté GTCS | santé du système | Lit déjà `synchro_rejets where not traite`. |

---

## 3. Écarts trouvés en préparant ce chantier

Chacun est corrigé par J2b, sauf mention contraire.

1. **Tout `23505` est traduit en `DOUBLON`** (`ecritures.ts:111`). Un doublon ne vaut succès que s'il porte sur la clé de l'opération. Trois tables écrites par le collecteur ont d'autres unicités : `clients (id, collecteur_id)`, `mises (carte_id) where est_commission`, et `caisses_jour (collecteur_id, date)`. Aujourd'hui l'écran de caisse affiche « Enregistrement impossible » ; une file qui ferait confiance à la traduction actuelle perdrait la déclaration sans un mot.
2. **`DATE_INVALIDE` n'est pas traduit.** Une mise ou une caisse hors fenêtre s'affiche « Enregistrement impossible. Réessaie. » — une consigne qui ne peut pas réussir. Pour une file, ce serait un refus définitif traité en erreur passagère.
3. **Le bandeau hors ligne ment en production.** `BandeauHorsLigne` sans compteur dit « Hors ligne · les encaissements seront synchronisés dès connexion » (`packages/ui/src/Bandeaux.tsx:20`) sur l'accueil, la liste des clients et l'encaissement. Aucune file n'existe. Le commentaire du composant met en garde contre ce mensonge précis.
4. **Une mise en sursis peut disparaître.** Sur la fiche client, la mise attend 6 secondes en mémoire avant d'être écrite. `surveillerMisesAJour` recharge la page dès qu'un nouveau service worker prend la main (`maj-service-worker.ts:52`), sans attendre : un déploiement pendant le sursis efface une mise dont la case est déjà cochée à l'écran.
5. **La vue `mouvements` et la table `rattrapages` n'existent pas.** Décidées par le cadrage J2 et par J1 §4.5, jamais construites. Hors périmètre de J2b : c'est l'objet du chantier rattrapage (§10).
6. **`idb` n'est présent que par transitivité**, tiré par la PWA. Il sera déclaré explicitement.
7. **Trois modules parlent directement à la base** alors que J2a voulait une frontière unique : `ecrans/Clients.tsx:235-250` (lecture des clients et des cartes), `Coquille.tsx:127` (fiche du collecteur), et l'authentification. Les deux premiers passent derrière les modules de lecture.
8. **Le sursis n'existe que sur la fiche client.** `Encaisser.tsx:59` écrit immédiatement. Chaque écran garde son comportement.

---

## 4. Les garanties

Validées par l'exploitant avant toute architecture. Tout le reste en découle.

1. **Rien n'est « fait » avant d'être sur le disque.** L'opération entre dans la file et la tournée est mise à jour **dans une même transaction IndexedDB**. Si elle échoue — disque plein, stockage bloqué — le geste est refusé à l'écran, jamais montré comme réussi.
2. **Une opération ne quitte la file que sur preuve** : le serveur l'a acceptée ; ou il signale un doublon **et** une relecture par identifiant confirme la même ligne ; ou son refus est consigné dans `synchro_rejets`. Une coupure ou un jeton expiré la laissent en file. Une erreur inconnue aussi — jusqu'à la 5ᵉ tentative, où elle est consignée intacte sous le motif `INCONNU` pour ne pas bloquer indéfiniment les opérations suivantes (§6.2).
3. **`23505` ne vaut doublon que sur la clé de l'opération** (§6.3). La caisse du jour s'écrit en « dernière déclaration gagne », rejouable par nature.
4. **L'ordre est respecté.** Les opérations partent dans l'ordre du geste. Si une opération est refusée, celles qui en dépendent sont consignées avec elle, jamais envoyées seules.
5. **La déconnexion ne détruit rien.** Volontaire : refusée tant que la file n'est pas vide. Subie (session révoquée, mot de passe changé) : la file est gardée, liée à ce collecteur, et reprise à sa prochaine connexion. Jamais envoyée sous une autre identité ; un autre collecteur sur le même téléphone ne la voit pas.
6. **Le navigateur ne doit pas vider la file.** L'application demande le stockage persistant (`navigator.storage.persist()`) et dit clairement s'il est refusé.
7. **Les 90 jours ne surprennent personne.** Une opération qui attend depuis 75 jours déclenche une alerte. Refusée quand même, elle est consignée, pas perdue.
8. **Ce qu'aucun logiciel ne rattrape** — un téléphone perdu ou cassé avant tout envoi — **se réduit** : envoi au moindre réseau, compteur toujours visible sur l'accueil tant que la file n'est pas vide.

---

## 5. Architecture

### 5.1 Le stockage du téléphone

Une base IndexedDB **par collecteur**, nommée `kolek-collecteur-<id>`. Un second collecteur sur le même téléphone ouvre la sienne ; il n'ouvre jamais celle du premier.

| Espace | Contenu | À la déconnexion |
|---|---|---|
| `file` | les opérations en attente et les opérations refusées pas encore consignées (§6.1) | **gardé** |
| `tournee` | clients (`id, nom, telephone, marche, activite, avis_actifs`), cartes (`id, client_id, mise, statut, mises_encaissees, ouverte_le, cloturee_le`), mises des cartes actives (`id, carte_id, montant, encaisse_le, est_commission`), retraits et caisse du jour | effacé |
| `profil` | nom, forfait, `abonnement_statut`, `abonnement_echeance`, `titulaire_id`, date du dernier rafraîchissement | effacé |
| `refus` | copie des refus déjà consignés dans `synchro_rejets`, pour les montrer hors ligne (§8) — une vue, la vérité est au serveur | effacé |

**La tournée est bornée par construction** : les cartes actives, 31 mises au plus chacune, plus la journée en cours. Les mises des cartes clôturées ne sont pas copiées ; leur historique complet reste un écran en ligne.

**Décision revue.** Le cache de navigation actuel est en mémoire seulement, par choix écrit (`cache.ts:24-28`) : noms et soldes sur le disque « lisibles après la déconnexion, à qui a l'appareil en main ». Le hors-ligne l'exige ; l'exploitant a tranché le 2026-09-13 pour la tournée sur le disque, effacée à la déconnexion. L'exposition ajoutée se limite à un téléphone déverrouillé et hors réseau : la session est déjà conservée sur le disque (`createClient` par défaut), donc en ligne l'application montre déjà tout à qui l'ouvre. `cache.ts` garde son rôle pour les écrans restés en ligne, et son en-tête est mis à jour pour renvoyer ici.

### 5.2 Cinq modules, un rôle chacun

1. **`stockage-local`** — ouvre la base du collecteur, porte le numéro de version du schéma local, demande le stockage persistant, fournit les transactions. Aucune règle métier.
2. **`appliquer`** — fonctions **pures** : appliquer une opération à une tournée (carte créée, compteur + 1, mise ajoutée avec commission provisoire), et réappliquer une liste d'opérations sur un instantané serveur. Les calculs viennent de `@kolek/core` (`soldeRestituable`, `commission`, `peutEncaisser`), les mêmes qu'aujourd'hui.
3. **`file`** — ajoute une opération **et** l'applique à la tournée dans la même transaction ; retire une opération en sursis ; compte ce qui attend. `enregistrerMise`, `creerClientAvecCarte`, `ouvrirCarte` et `declarerCaisse` gardent leur signature et passent par elle.
4. **`synchroniseur`** — vide la file dans l'ordre (§6). Un seul à la fois, même avec deux onglets ouverts (`navigator.locks.request`) ; là où l'API manque, l'idempotence rend un double envoi inoffensif.
5. **`rafraichir`** — en ligne, recharge la tournée depuis le serveur avec les lectures paginées actuelles, **puis réapplique par-dessus les opérations encore en file**. Un instantané serveur ne fait donc jamais disparaître une opération pas encore arrivée.

### 5.3 Quand le synchroniseur tourne

Au démarrage de l'application ; au retour du réseau (`online`) ; au retour au premier plan (`visibilitychange`) ; après chaque geste ; puis, tant qu'il reste du travail, à intervalles croissants : 30 s, 1 min, 2 min, 5 min, puis toutes les 10 min.

`navigator.onLine` ne décide de rien : seul le résultat d'un envoi fait foi. Le bandeau, lui, peut s'en servir pour informer (`Bandeaux.tsx:31-35` l'avait prévu).

### 5.4 Les lectures

Les écrans de collecte lisent **toujours** la tournée locale, en ligne comme hors ligne — un seul chemin, un affichage immédiat :

| Écran | Aujourd'hui | Avec J2b |
|---|---|---|
| Accueil | `chargerTableauCollecteur` (`lectures.ts`) | même forme, calculée sur la tournée |
| Clients | lecture directe dans `Clients.tsx` | déplacée dans le module de lecture, sur la tournée |
| Fiche client | `chargerFicheClient` | sur la tournée ; mises des cartes actives |
| Encaisser, ouvrir une carte | cartes du client | sur la tournée |
| Caisse du jour | `chargerRapprochement` | sur la tournée ; attendu provisoire tant que le serveur n'a pas répondu |

Les autres écrans restent en ligne, avec `cache.ts`, et affichent « Cet écran demande le réseau » quand il manque.

### 5.5 Ce qui ne change pas côté serveur

Aucune table, aucune colonne, aucun droit, aucune Edge Function. Chaque envoi est l'écriture d'aujourd'hui — à une exception : la caisse envoie désormais un identifiant tiré sur le téléphone, colonne déjà accordée en insertion.

Les reçus au client partent quand la mise arrive au serveur, datés de `encaisse_le`, l'heure réelle du geste. Les refus apparaissent d'eux-mêmes dans la santé du système.

---

## 6. La file et le synchroniseur

### 6.1 Une opération

```ts
interface Operation {
  /** Format de cette ligne. Une version future de l'application sait lire les anciennes. */
  version: 1;
  /** Identifiant de l'opération. Devient l'identifiant de la ligne de refus. */
  id: string;
  /** Ordre d'entrée dans la file, strictement croissant. */
  sequence: number;
  collecteurId: string;
  type: 'mise' | 'client_carte' | 'carte' | 'caisse';
  charge: ChargeMise | ChargeClientCarte | ChargeCarte | ChargeCaisse;
  /** Heure du geste, horloge du téléphone. */
  faiteLe: string;
  /** Avant cette heure, l'opération ne part pas et peut être annulée. */
  envoyableApres: string;
  /** Pour `client_carte` : étapes déjà acceptées par le serveur. */
  etapes?: { client: boolean; carte: boolean };
  /** Opérations dont celle-ci dépend : la carte d'une mise, le client d'une carte. */
  dependDe: string[];
  etat: 'en_attente' | 'refusee_a_consigner';
  tentatives: number;
  prochainEssai: string | null;
  /** Code du refus, une fois connu. */
  motif?: string;
}

/** Les charges portent exactement les colonnes que l'écriture d'aujourd'hui envoie. */
interface ChargeMise { id: string; carteId: string; montant: number; encaisseLe: string }
interface ChargeClientCarte {
  client: { id: string; nom: string; telephone: string | null; marche: string | null;
            activite: string | null; avisActifs: boolean };
  carte: { id: string; mise: number };
}
interface ChargeCarte { id: string; clientId: string; mise: number }
interface ChargeCaisse { id: string; date: string; cashDeclare: number }
```

`collecteur_id` n'est pas dans les charges : il vient de `Operation.collecteurId`, et le serveur le vérifie contre la session comme aujourd'hui.

Une opération `refusee_a_consigner` n'a pas encore pu écrire sa ligne dans `synchro_rejets` (le refus a été reçu, puis le réseau a coupé). Elle reste en file jusqu'à ce que la consignation réussisse. Elle ne quitte la file qu'à ce moment.

**Le téléphone garde aussi une copie locale des refus consignés**, pour les montrer hors ligne (§7). Cette copie est une vue : la vérité est `synchro_rejets`.

### 6.2 Classer une réponse

Une fonction pure, `classer`, rend l'un des cinq cas. Sa table est **exhaustive** et chaque ligne a son épreuve.

| Réponse | Cas | Suite |
|---|---|---|
| Succès | **accepté** | retirer de la file ; marquer l'étape pour `client_carte` |
| `23505` sur la clé de l'opération (§6.3) | **déjà là, à vérifier** | relire par identifiant ; mêmes valeurs → comme accepté ; valeurs différentes ou ligne invisible → refus `DOUBLON_INVERIFIABLE` |
| `23505` sur toute autre contrainte | **refus** `CONFLIT_UNIQUE` | consigner |
| `23505` sur une opération `caisse`, quelle que soit la contrainte | **à reprendre en mise à jour** | §6.4 |
| Message `CARTE_INTROUVABLE`, `CARTE_CLOTUREE`, `CYCLE_COMPLET`, `MONTANT_INVALIDE`, `DATE_INVALIDE` | **refus** (le code) | consigner, puis les dépendantes |
| `23514` | **refus** `BORNE` ou `BORNE_MONTANT` (règle actuelle) | consigner |
| `23503` (clé étrangère : client ou carte absent) | **refus** `PARENT_ABSENT` | consigner |
| `42501` sur `clients` ou `cartes` | **refus** `ABONNEMENT_INACTIF` | consigner, puis les dépendantes |
| `42501` ailleurs | **refus** `DROIT_REFUSE` | consigner |
| HTTP 401, `PGRST301` (jeton expiré) | **session** | `refreshSession()` puis nouvel essai ; si le renouvellement est refusé, session finie : arrêter, garder la file |
| Échec réseau (`TypeError` de `fetch`), délai dépassé, HTTP 5xx, 408, 429 | **passager** | nouvel essai selon §5.3, sans compter de tentative métier |
| Toute autre réponse | **inconnu** | nouvel essai ; à la **5ᵉ** tentative, refus `INCONNU` consigné, et la file continue |

`codeDErreur` actuel est remplacé pour les quatre gestes par `classer` ; les écrans restés en ligne gardent le leur, corrigé des écarts 1 et 2 (§3).

### 6.3 Reconnaître un vrai doublon

Un `23505` ne vaut « déjà là » que si la contrainte nommée dans le message est la clé de l'opération, **puis** si la relecture le confirme :

| Opération | Contraintes reconnues | Relecture | Doit correspondre |
|---|---|---|---|
| `mise` | message `DOUBLON`, `mises_pkey` | `mises` par `id` | `carte_id`, `montant` |
| `client_carte`, étape client | `clients_pkey`, `clients_id_collecteur_unique` | `clients` par `id` | `nom` |
| `client_carte`, étape carte ; `carte` | `cartes_pkey` | `cartes` par `id` | `client_id`, `mise` |
| `caisse` | toute contrainte de `caisses_jour` | — | rejouable par nature, voir §6.4 |
| consignation d'un refus | `synchro_rejets_pkey` | `synchro_rejets` par `id` | `motif` |

### 6.4 La caisse du jour

Une déclaration porte `{ id, date, cashDeclare }`, `id` tiré sur le téléphone à la première déclaration de la journée et réutilisé ensuite.

1. Insérer `{ id, collecteur_id, date, cash_declare }`.
2. Si `23505` : mettre à jour `cash_declare` pour cette date. Les deux seules unicités de la table — sa clé et `(collecteur_id, date)` — mènent au même état voulu, « la ligne de ce jour porte ce montant » ; le nom de la contrainte n'a donc pas à être lu.
3. Accepté quand la mise à jour a touché une ligne.

Deux déclarations en file pour la même date partent dans l'ordre : **la dernière gagne**, à chaque rejeu. `cash_attendu` et `ecart` restent posés par le serveur et remplacent l'attendu provisoire au rafraîchissement.

### 6.5 Consigner un refus

```ts
supabase.from('synchro_rejets').insert({
  id: operation.id,
  collecteur_id: operation.collecteurId,
  motif: operation.motif,
  charge_utile: { version, type, charge, faiteLe, sequence, dependDe },
});
```

L'identifiant de la ligne est celui de l'opération : rejouer une consignation ne crée pas de seconde ligne (§6.3). Les opérations dépendantes sont consignées dans la foulée, motif `PARENT_REFUSE`, charge intacte. Une charge dépasse de loin ce qu'une opération contient avant d'atteindre 8 192 caractères ; une épreuve le vérifie sur la plus longue saisie permise.

`traite` n'est jamais touché par J2b : il appartient au rattrapage.

### 6.6 Les dépendances

`dependDe` se remplit au geste : une mise sur une carte créée par une opération encore en file dépend de cette opération ; une carte ouverte sur un client inscrit hors ligne dépend de l'inscription.

**L'ordre est strict.** Le synchroniseur ne passe à l'opération suivante que lorsque la courante est acceptée ou consignée. Une opération en échec passager bloque donc les suivantes — sans dommage : sans réseau, elles échoueraient aussi. Une opération en erreur inconnue les bloque au plus le temps de ses cinq tentatives (§5.3 : 30 s, 1 min, 2 min puis 5 min d'écart, soit 8 min 30 s entre la première et la cinquième), puis elle est consignée et la file reprend.

Une opération n'est envoyée que lorsque toutes celles dont elle dépend ont été acceptées. Si l'une est refusée, elle est consignée avec le motif `PARENT_REFUSE` sans être envoyée — la mise ne peut pas arriver sur une carte que le serveur n'a jamais reçue, et elle ne doit pas partir en `CARTE_INTROUVABLE` sous un motif trompeur.

---

## 7. Les gestes

| Geste hors ligne | Vérifié par le téléphone avant | Opération |
|---|---|---|
| **Encaisser une mise** | carte présente dans la tournée, `statut = 'active'`, moins de 31 mises, montant égal à la mise de la carte, validation `validerMise` | `mise`, `id` tiré au geste, `faiteLe` = heure de l'appui |
| **Inscrire un client et sa carte** | nom non vide, `validerMise` (règles actuelles) ; **longueurs du serveur** : nom ≤ 120, téléphone ≤ 32, marché ≤ 80, activité ≤ 80 (`20260819010000_socle_bornes_texte.sql:41-44`), pour qu'aucun refus `BORNE` ne tombe sur un client déjà en tournée ; dernier `abonnement_statut` connu = `actif` | `client_carte`, deux étapes ; l'avancement de chaque étape est gardé, un rejeu reprend là où il s'était arrêté |
| **Ouvrir une carte** | client présent dans la tournée, `validerMise`, dernier statut connu = `actif` | `carte` |
| **Déclarer la caisse** | montant entier positif (règle actuelle) | `caisse` (§6.4) |

**Le sursis de la fiche client.** L'opération entre dans la file **dès l'appui**, avec `envoyableApres` = appui + 6 s. « Annuler » la retire de la file et de la tournée, dans une transaction — sans risque, elle n'a jamais été envoyée. Un rechargement pendant le sursis ne la perd plus : elle est sur le disque et partira ; seul le bouton « Annuler » disparaît avec la page. `Encaisser.tsx` garde son envoi immédiat : `envoyableApres` = appui.

**Abonnement suspendu.** Si le dernier statut connu n'est pas `actif`, inscrire un client ou ouvrir une carte est refusé au geste avec la phrase actuelle d'`ABONNEMENT_INACTIF`. Encaisser reste permis, comme aujourd'hui : l'abonnement n'a jamais son mot à dire sur l'encaissement d'une carte déjà ouverte.

**Commission provisoire.** Une mise hors ligne affiche la commission selon la règle de la première mise de la carte. Le serveur décide ; sa valeur remplace l'affichage au rafraîchissement.

**Gestes restés en ligne, et leurs garde-fous**

- **Clôture et retrait** : bouton inactif tant qu'une opération de cette carte est en file (« 2 mises de cette carte pas encore envoyées »), puis réseau requis. C'est ce qui supprime `CARTE_CLOTUREE` pour un collecteur seul sur son téléphone.
- **Corriger une fiche, consentement aux avis** : réseau requis ; inactifs sur un client pas encore envoyé.
- **Encaisser pour un collaborateur, équipe, abonnement, mot de passe** : réseau requis, comme aujourd'hui.

**Déconnexion.** Refusée tant que la file contient une opération (`en_attente` ou `refusee_a_consigner`). Une fois vide : tournée, profil et copie des refus effacés, base du collecteur conservée vide.

---

## 8. Ce que voit le collecteur

Tout réutilise l'existant — `BandeauHorsLigne`, l'écran `Alertes`, les mentions de `Plus`. Aucune entrée de menu nouvelle.

1. **Le bandeau dit ce que la file contient.** Hors ligne : « Hors ligne · 3 mises et 1 client en attente d'envoi ». En ligne avec du travail : « Envoi en cours · 2 restantes ». En ligne, rien en attente : pas de bandeau. La phrase sans compteur de `Bandeaux.tsx:20` disparaît.
2. **Le compteur reste sur l'accueil tant que la file n'est pas vide**, même en ligne.
3. **« pas encore envoyé »** sur la ligne du client, de la carte ou de la mise concernée ; la mention disparaît à l'envoi.
4. **Les refus** en tête de `Alertes`, qui est déjà « déduit de l'état ». Ils se lisent hors ligne, depuis l'espace `refus` et les opérations `refusee_a_consigner` ; les autres alertes de l'écran demandent le réseau, et le disent. Chacun intact : client, carte, montant, heure réelle du geste, motif en clair (« La carte avait été clôturée »). Sur l'accueil, un bandeau non bloquant « 1 opération refusée — à voir » y mène. **Aucune action dans J2b** : rien ne s'efface.
5. **Déconnexion refusée** : « 3 opérations pas encore envoyées. Retrouve du réseau avant de te déconnecter. »
6. **Session terminée avec une file** : l'écran de connexion dit « 3 opérations attendent sur ce téléphone. Reconnecte-toi avec le même compte pour les envoyer. » Aucun nom, aucun montant n'est montré avant connexion : le nombre vient de `indexedDB.databases()` (bases `kolek-collecteur-*`) et du compte de l'espace `file`, sans lire une seule opération. Là où `indexedDB.databases()` n'existe pas, la phrase n'est pas affichée — mieux vaut se taire qu'annoncer zéro à tort.
7. **Stockage non garanti** : si `persist()` est refusé, `Plus` l'affiche en permanence, l'accueil une fois : « Ce téléphone peut effacer les données de Kolek s'il manque de place. Garde l'application installée et envoie dès que possible. »
8. **Limite des 90 jours** : dès qu'une opération attend depuis 75 jours, sur l'accueil : « Une mise attend depuis 76 jours. Retrouve du réseau avant 90 jours. »
9. **Écrans restés en ligne** : « Cet écran demande le réseau », comme `Abonnement` et `Équipe` le font déjà.

Les phrases des refus viennent d'une table unique, `PHRASES` de `ecritures.ts`, complétée de `DATE_INVALIDE`, `CONFLIT_UNIQUE`, `PARENT_ABSENT`, `PARENT_REFUSE`, `DOUBLON_INVERIFIABLE` et `INCONNU`.

---

## 9. Épreuves et vérification

Écrites avant le code. Chaque étage prouve ce que le précédent ne peut pas prouver.

### 9.1 Logique pure

- **`appliquer`** : chaque opération sur une tournée ; réapplication des opérations en file sur un instantané serveur **plus ancien** — aucune mise ne disparaît, aucun compteur ne recule ; commission provisoire.
- **`classer`** : une épreuve par ligne de la table §6.2, dont chaque contrainte `23505` nommée, les deux `42501`, `PGRST301`, l'échec réseau, 5xx et 429. **Épreuve de garde : aucun `23505` hors clé ne sort en succès.**

### 9.2 File et stockage (`fake-indexeddb`)

- Atomicité : une transaction interrompue ne laisse ni l'opération sans la tournée, ni la tournée sans l'opération.
- Sursis : annuler retire les deux ; un rechargement simulé pendant le sursis garde l'opération.
- Déconnexion volontaire refusée avec une file ; file gardée après une déconnexion subie ; deux collecteurs isolés.
- Ordre strict ; chaîne dépendante consignée en bloc ; `INCONNU` consigné à la 5ᵉ tentative puis la file continue.
- Lecture d'une opération de `version: 1` par le code courant.

### 9.3 Contre la base locale (`supabase/tests`)

C'est ici que l'argent se prouve, contre les vrais déclencheurs et les vraies politiques :

1. **Réponse perdue** : l'insertion réussit, la réponse n'arrive pas, la file renvoie → une ligne, `mises_encaissees` + 1 une seule fois.
2. **Carte clôturée pendant l'attente** → une ligne dans `synchro_rejets`, charge complète ; consignation rejouée → toujours une ligne.
3. **Abonnement suspendu pendant l'attente** → client, carte et mises consignés ensemble ; zéro ligne orpheline dans `clients`, `cartes`, `mises`.
4. **Caisse déclarée deux fois**, dont une sur une ligne existante → `cash_declare` = dernière déclaration, à chaque rejeu.
5. **Mise vieille de 91 jours** → `DATE_INVALIDE` classé refus, consigné, jamais réessayé.
6. **Session expirée au milieu de l'envoi** → renouvellement, reprise, aucun doublon.
7. **Envoi interrompu au milieu** → au redémarrage, le reste part une fois.
8. **Tournée complète** : 50 mises sur 10 cartes, 2 clients inscrits avec leur carte, 1 carte ouverte, 1 caisse, hors ligne, puis synchronisation → **les totaux du serveur égalent ceux du téléphone** : somme des montants, compteur de chaque carte, nombre de commissions, `cash_declare`.

### 9.4 À l'écran

Chrome sans interface piloté par CDP, contre la pile locale, jamais sur 5173 ni 5174. Réseau coupé par `Network.emulateNetworkConditions` :

- encaisser, inscrire un client, ouvrir une carte, déclarer la caisse ;
- **tuer l'onglet, rouvrir hors ligne** → tournée et file intactes ;
- rétablir le réseau → file vide, base conforme ligne à ligne ;
- déconnexion refusée ; compteurs exacts ; bandeau juste ; largeur 390 px.

Le module servi est comparé au disque avant de croire une capture (piège du transformé périmé, 2026-09-12).

### 9.5 Avant la production

- `npm run verifier` complet, vert.
- Aucune Edge Function ni migration modifiée par la branche (`git diff --stat main...HEAD -- supabase`) : déploiement du front seul. Si le plan découvre qu'il en faut, il le dit, et le geste a son accord séparé.
- Chaque geste de production sur accord explicite de l'exploitant.

### 9.6 Après la production

- Empreintes des paquets servis comparées aux paquets construits.
- **Un premier téléphone pilote** avant de considérer le chantier livré : une journée réelle hors ligne, puis contrôle du compteur de refus dans la santé du système et des totaux du collecteur.

---

## 10. Hors périmètre, et ce qui suit

**Chantier suivant : le rattrapage.** Table `rattrapages`, vue `mouvements` comme seule surface de lecture de l'argent, reçu au client, et reprise de chaque lecteur d'argent — bilans, rapprochement, tableaux de bord de l'administration. Il donne aux refus de J2b leur résolution et leur sens à `traite`.

**Chantiers déjà ouverts, dans l'ordre retenu** : expiration des abonnements ; plafond de clients ; exports CSV. Chacun avec sa spec et son plan.

**Écartés de J2b**

- Clôture et retrait hors ligne : le montant rendu dépend des mises que le serveur a reçues.
- Correction de fiche et consentement aux avis hors ligne : modifications, donc conflits possibles entre appareils.
- Encaissement pour un collaborateur hors ligne : passe par une Edge Function sous clé de service.
- Chiffrement local par code : écarté par l'exploitant le 2026-09-13.
- Notification poussée : l'application n'en émet pas.

**Tant que J2b n'est pas en production, la grille continue de vendre l'encaissement hors ligne.** La corriger reste possible à tout moment, indépendamment de ce chantier. L'écart 3 (§3) peut aussi être corrigé seul et vite : la phrase du bandeau dit une chose fausse aujourd'hui.

---

## 11. Décisions prises le 2026-09-13

| Question | Retenu | Écarté |
|---|---|---|
| Premier chantier | Hors-ligne | petits chantiers d'abord ; règles serveur d'abord |
| Gestes hors ligne | La collecte | collecte + clôture ; encaisser seulement |
| Données sur le téléphone | Tournée, effacée à la déconnexion | file seulement ; tournée chiffrée par code |
| Approche | File et copie locale dans l'application | rejeu par service worker ; moteur de synchro tiers |
| Rattrapage | Chantier suivant, séparé | inclus dans J2b |
| Garanties, architecture, gestes, écrans, épreuves | Validés section par section | — |
