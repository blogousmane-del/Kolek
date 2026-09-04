# 2026-09-04 — Trois défauts qu'aucun test ne voyait

Compte rendu de la journée. Trois défauts trouvés en production, corrigés,
déployés et mesurés. Ce document n'est pas une liste de correctifs : il porte
ce que les trois avaient en commun, qui est plus coûteux que les trois.

---

## Le fil commun

**Les trois suites étaient vertes.** Aucune n'a jamais rougi. Chacune vérifiait
que le code faisait ce que le code faisait.

- Le test de la porte de drainage présentait comme jeton `SUPABASE_SERVICE_ROLE_KEY`
  — la variable même que la fonction lisait pour comparer. Il mesurait la
  fonction contre sa propre constante. Il ne pouvait pas échouer.
- Le test du zéro ivoirien affirmait `composerE164('CI', '0700000000') === '+225700000000'`.
  Il encodait la règle fausse et la protégeait.
- Le test de la vitrine attendait `+225701020304` sous un commentaire qui
  nommait pourtant `400 Invalid phone number` comme le symptôme à éviter. Le
  diagnostic était écrit trois lignes au-dessus de l'assertion qui le
  provoquait.

Un contrôle qui ne peut pas échouer pour la bonne raison n'est pas un contrôle.
Chaque correctif de la journée a été validé en réintroduisant délibérément le
défaut et en observant tomber les tests nommés.

---

## 1. La porte de drainage refusait sa propre horloge

**Symptôme.** Sept heures de drainage arrêté. `envoyer-avis` rendait
`403 ACCES_RESERVE` à chaque passage de `pg_cron`.

**Cause.** La fonction comparait le jeton présenté à `SUPABASE_SERVICE_ROLE_KEY`.
L'horloge, elle, présentait `kolek_cle_service` tiré du Vault. La plateforme
Supabase injecte **trois** valeurs distinctes dans le runtime Edge sous trois
noms différents — mesuré au `docker inspect` :

```
SUPABASE_SERVICE_ROLE_KEY          = eyJhbGciOiJI…   (JWT hérité)
SUPABASE_INTERNAL_SECRET_KEY       = sb_secret_N7…
SUPABASE_INTERNAL_PUBLISHABLE_KEY  = sb_publishab…
```

Les deux côtés tenaient une clé légitime. Ce n'étaient pas les mêmes.

**Correctif.** Un secret dédié, `kolek_secret_drainage` côté Vault et
`DRAINAGE_SECRET` côté fonction, porté par l'en-tête `x-kolek-drainage`. Un
secret absent **ferme** la porte au lieu de l'ouvrir : `500 CONFIGURATION`, pas
un passage libre.

**Leçon de méthode.** Trois re-saisies manuelles du secret ont produit trois
valeurs différentes. La méthode qui a marché du premier coup : générer une
fois, écrire dans un fichier unique, s'en servir pour les deux côtés, vérifier
en comparant les empreintes SHA-256, supprimer le fichier. `supabase secrets list`
rend le SHA-256 brut de chaque valeur — deux côtés peuvent donc prouver qu'ils
tiennent le même secret sans qu'aucun ne le révèle.

---

## 2. Un seul message masquait trois causes de paiement

**Symptôme.** « Le service de paiement ne répond pas. Réessaie dans un moment. »

**Cause.** `CHECKOUT_IMPOSSIBLE` couvrait trois situations sans rapport :

| Ce qui se passait vraiment | Ce que la personne lisait |
|---|---|
| Secret de webhook collé dans `CHARIOW_CLE_API` | « réessaie dans un moment » |
| Clé API fausse ou révoquée — `401 Invalid API key` | « réessaie dans un moment » |
| `400 Invalid phone number` | « réessaie dans un moment » |

La première a été prouvée par empreinte : `CHARIOW_CLE_API` et le secret de
signature portaient le même SHA-256, `aa21a4ac…`.

Aucune des trois n'est « réessaie dans un moment ». Réessayer ne pouvait rien
donner, et le message invitait pourtant à ne faire que ça.

**Correctif.** `refusDeChariow(statut)` traduit le code HTTP :

```
401 / 403  CLE_CHARIOW_REFUSEE   500
404        PRODUIT_INTROUVABLE   500
400 / 422  SAISIE_REFUSEE        400
autre      CHECKOUT_IMPOSSIBLE   502
```

Un test de garde inter-catalogues impose que les deux catalogues de messages —
collecteur et vitrine — portent chacun les nouvelles clés.

**Correction d'une affirmation.** J'ai d'abord dit que la règle « tout refuser
avant la première écriture » s'appliquait ici. C'est faux. L'*absence* de
configuration refuse avant d'écrire ; une clé invalide ne se découvre qu'à
l'appel, après l'insertion. Mes sondes ont donc laissé des lignes.

---

## 3. Le zéro ivoirien tombait

**Symptôme.** `400 Invalid phone number` sur le réabonnement, numéro `0711282992`.

**Cause.** `sansZeroDeTete` retirait le zéro de tête de **tout** numéro
national, sur la foi d'un commentaire écrit comme une loi universelle :

> Le zéro national de tête ne fait pas partie du numéro pour Chariow.

C'est la règle de la France. Ce n'est pas celle de la Côte d'Ivoire, où le
numéro fait dix chiffres et **garde son zéro depuis le 31 janvier 2021**.
Préfixes : Orange 07/27, MTN 05/25, Moov 01/21.

**Portée réelle.** Tout numéro ivoirien partait chez Chariow amputé à neuf
chiffres. **Aucun abonnement n'a jamais pu être réglé depuis le pays du
pilote.** Le défaut a vécu aussi longtemps que la fonctionnalité.

**Correctif.** Un ensemble `PREFIXE_NATIONAL` explicite, dans les deux modules
qui portaient la règle — `supabase/functions/_shared/chariow.ts` et
`packages/ui/src/ChampTelephone.tsx`. Le docblock dit honnêtement que seule la
Côte d'Ivoire a été vérifiée à la source, et que cette vérification servait à
l'en retirer.

`nationalDe` rend le garde-fou que le retrait du zéro fournissait par accident :
sans lui, `composerE164('CI', '000')` rendait `+225000`.

**Falsification.** En remettant `national.replace(/^0+/, '')` : cinq tests de
`ChampTelephone` tombent, plus ceux de `chariow` et de la vitrine.

---

## Ce qui est prouvé, et par quelle mesure

| Fait | Mesure |
|---|---|
| Chaîne `npm run verifier` complète | code de sortie 0 |
| Correctif servi par la vitrine et l'app collecteur | `He.has(t)?e.replace(/^0+/,``):e` trouvé dans le JS téléchargé depuis `kolek.cash` et `app.kolek.cash` |
| Absent du bundle admin | attendu : l'admin n'importe pas `ChampTelephone` |
| `chariow-webhook` v16, `verify_jwt` toujours `false` | `functions list` après déploiement |
| Paiement réel abouti | essai de l'utilisateur, numéro ivoirien |
| Abonnement crédité | solde constaté par l'utilisateur |

La chaîne complète est prouvée pour la première fois : saisie ivoirienne,
checkout Chariow, Pulse signé, compte crédité.

---

## Ce qui reste ouvert

**Aucun SMS ne part.** Africa's Talking refuse les identifiants,
`401 The supplied authentication is invalid`, en production comme en bac à
sable. La forme est valide — donc clé révoquée, nom d'application qui ne
correspond pas, ou compte non validé. Les avis s'empilent dans la file.

**La CI ne déploie rien.** Le secret GitHub `SUPABASE_ACCESS_TOKEN` est refusé
à la forme : *« Invalid access token format. Must be like sbp_0102...1920 »*.
Les quatre fonctions de la journée sont parties d'un poste de travail. La CI
échoue dans un journal que personne ne lit — c'est-à-dire qu'elle ne signale
rien, ce qui est pire que de ne pas exister.

**Les numéros déjà enregistrés restent amputés.** `+225` suivi de neuf
chiffres, injoignables par SMS comme par Mobile Money. Migration écrite, non
lancée : elle touche des enregistrements réels. Elle compte avant d'écrire, et
son étape 2 doit rendre zéro ligne — `collecteurs.telephone` porte une
contrainte d'unicité, et un jumeau déjà correct ferait échouer la réécriture.

**Quatre lignes de sonde** à supprimer dans `demandes_ouverture`
(`sonde-diagnostic@`, `sonde-deux@`, `sonde-trois@`, `sonde-quatre@example.test`).

**Le drainage de bout en bout par `pg_cron`** n'a jamais été mesuré. Sans
risque aujourd'hui, puisque la passerelle SMS refuse tout.

**Trois ⚪️ du 18 août**, ouverts depuis trois semaines : longueur minimale de
mot de passe côté distant, limites de débit sur `/token`, test à deux comptes
en production.

---

## Le point aveugle de la grille

L'audit du 18 août a été ré-audité aujourd'hui : sept de ses affirmations sont
devenues fausses. Mais le défaut structurel de la grille compte davantage que
ses sept péremptions.

**Elle demande qui est refusé. Elle ne demande jamais si le service fonctionne.**

Vingt contrôles de sécurité, tous verts, pendant que le drainage était arrêté
depuis sept heures et qu'aucun paiement ivoirien n'avait jamais abouti. Une
porte parfaitement fermée sur une maison vide passe la grille sans une remarque.
