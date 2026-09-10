# Corriger la fiche d'un client — dessin

**Date :** 2026-09-10 · **Application :** Collecteur

## Le problème, mesuré

Un collecteur inscrit un client au marché, debout, sur un téléphone d'entrée de
gamme. Il tape « GSM T » au lieu de « GSM Traoré », ou un chiffre de travers
dans le numéro. **Aujourd'hui, personne ne peut le réparer.**

Ce n'est pas une figure de style. Trois mesures du 2026-09-10 :

- L'application collecteur n'écrit dans `clients` qu'à deux endroits :
  `inscrireClient` (une insertion) et `definirConsentementAvis` (qui ne touche
  que `avis_actifs`). Aucun écran ne modifie le nom, le numéro, le marché ou
  l'activité.
- **Aucun écran d'administration ne touche `clients`.** `grep "from('clients')"`
  sur `apps/admin/src` ne rend rien. `FicheModifiable` corrige un *collecteur*,
  pas un client.
- La fiche client affiche, quand le numéro manque : « Ce client n'a pas de
  numéro : aucun avis ne peut lui être envoyé. » — sans aucun moyen d'en
  ajouter un.

Une faute de frappe faite au marché est donc définitive, et le seul recours
connu serait une requête SQL manuelle en production.

## Ce qui existe déjà, et qu'il ne faut pas réécrire

Le socle est **entièrement en place**. Ce dessin n'appelle aucune migration.

| Élément | État mesuré le 2026-09-10 |
|---|---|
| Politique RLS | `clients_update`, `USING` et `WITH CHECK` à `collecteur_id = auth.uid()` |
| Droits de colonne (`authenticated`) | `UPDATE` sur `nom`, `telephone`, `marche`, `activite`, `photo_url`, `avis_actifs` — **jamais** sur `id`, `collecteur_id`, `cree_le` |
| Journal d'audit | déclencheur `clients_journal`, `AFTER INSERT OR UPDATE OR DELETE`, appelle `journaliser()` |
| Bornes de texte | `nom` ≤ 120, `telephone` ≤ 32, `marche` ≤ 80, `activite` ≤ 80 |

**Conséquence sur le risque :** la surface de ce travail est un écran et une
fonction d'écriture. Rien à ouvrir en base, aucun droit à élargir. Toute
proposition qui demanderait une migration s'est trompée quelque part.

> **Une asymétrie relevée au passage, et laissée telle quelle.**
> `clients_insert` exige `abonnement_ouvre_droit(auth.uid())` ; `clients_update`
> ne l'exige pas. Un collecteur dont l'abonnement est suspendu ne peut donc plus
> inscrire, mais pourra corriger. C'est cohérent — corriger une faute de frappe
> n'est pas produire du service — et c'est déjà l'état de la base. Ce dessin ne
> le change pas, il le note pour que personne ne le découvre comme un défaut.

## Ce qui est retenu

### Les quatre champs

`nom`, `telephone`, `marche`, `activite` — exactement ceux que le formulaire
d'inscription fait saisir, et exactement ceux que la base autorise déjà.

`nom` reste obligatoire : la colonne est `NOT NULL`, et `inscrireClient` refuse
déjà un nom vide avec « Le nom du client est obligatoire. » Le même refus, mot
pour mot, au même endroit du raisonnement.

Les trois autres peuvent être **vidés**. Un marché saisi par erreur doit pouvoir
redevenir vide, et l'écriture envoie alors `null` — jamais la chaîne vide, pour
que le journal d'audit lise « le champ était vide » et non « le champ contenait
rien ». C'est le geste que `inscrireClient` fait déjà à la création
(`saisie.marche?.trim() || null`).

`photo_url` et `avis_actifs` sont hors de ce formulaire. La première n'est
alimentée nulle part dans le produit ; le second a déjà son geste, dans le bloc
`Coordonnees`, avec sa demande de consentement explicite.

### Seuls les champs changés partent

Le formulaire compare la saisie à la valeur d'origine et n'envoie que la
différence. C'est le geste de `FicheModifiable`, dont le motif est déjà écrit :

> « Envoyer tout le formulaire écraserait la zone d'un collecteur avec une
> chaîne vide si le champ n'avait pas été rechargé — et ce genre d'effacement ne
> se remarque que le jour où on trie par zone. »

Corollaire : si rien n'a changé, **rien ne part**. Le formulaire se ferme sans
écrire, sans ligne au journal, et sans message de succès qui mentirait.

### L'écriture compte les lignes

`modifierClient` ne se contente pas d'un `error === null`. Elle termine par
`.select('id')` et refuse un résultat vide. Le motif est déjà payé, dans
`definirConsentementAvis` :

> « Un `update().eq()` nu ne rend aucune erreur quand RLS ou un privilège de
> colonne écarte la ligne — PostgREST répond 204, zéro ligne touchée, `error` à
> null. L'appelant concluait au succès, l'écran se relisait et retrouvait
> l'ancienne valeur : le bouton semblait mort, sans qu'aucune trace n'existe
> nulle part. »

Sur cet écran, la conséquence serait pire qu'un bouton mort : le collecteur
croirait avoir corrigé le numéro d'un client, et continuerait d'appeler le
mauvais.

### Le numéro change, le consentement retombe

**C'est la décision centrale de ce dessin.**

Le déclencheur de notification lit `client.telephone` **au moment de la mise** :

```sql
if not found or client.telephone is null or not client.avis_actifs then
```

Corriger le numéro d'un client dont les avis sont actifs enverrait donc son
solde d'épargne au nouveau numéro, sans que personne ne l'ait accepté. Une
faute de frappe dans la correction l'enverrait à un inconnu.

`inscrireClient` a déjà tranché la question symétrique, et sa raison vaut ici
mot pour mot :

> « Sans numéro, le consentement n'a pas d'objet : on ne l'enregistre pas, sinon
> un numéro ajouté plus tard déclencherait des avis que personne n'a acceptés à
> ce moment-là. »

**Donc : dès que `telephone` change — corrigé, ajouté ou retiré —, `avis_actifs`
repasse à `false` dans la même écriture.** L'écran le dit avant d'enregistrer,
et le bloc `Coordonnees` reprend son cours normal : il proposera de redemander
le consentement, sur le nouveau numéro, avec la phrase qu'il porte déjà.

Deux précisions qui évitent des surprises :

- **Une seule écriture, pas deux.** `avis_actifs: false` part dans le même
  `update` que le numéro. Deux écritures successives laisseraient une fenêtre —
  courte, mais réelle — où le nouveau numéro est en base avec l'ancien
  consentement, et une mise encaissée dans cette fenêtre partirait au mauvais
  endroit.
- **Le consentement ne retombe que si le numéro change.** Corriger le seul nom
  d'un client ne coupe pas ses avis : ce serait punir une correction sans
  rapport.

### Où le geste se trouve

Un bouton **« Corriger la fiche »** dans la fiche client, sous le bloc
`Coordonnees`. Il ouvre le formulaire à la place du bloc, dans la même feuille —
pas un écran de plus.

La fiche est déjà l'endroit où le collecteur constate l'erreur : c'est là qu'il
lit « GSM T · BLE ZOKOU · 0709201790 ». Faire voyager vers un autre écran pour
réparer ce qu'on regarde est un détour que rien ne justifie.

## Ce qui a été écarté, et pourquoi

**Corriger depuis la liste des clients.** La ligne de liste ne montre pas le
marché ni l'activité ; on corrigerait à l'aveugle deux champs sur quatre. Et la
liste est l'écran de la tournée — on y encaisse, on n'y édite pas.

**Un écran de correction séparé.** Il faudrait une entrée de navigation, un
retour, et un identifiant de client dans l'état de la coquille. Trois pièces
pour un formulaire de quatre champs qui vit très bien là où l'erreur se voit.

**Demander à un administrateur.** C'est la situation actuelle, et elle ne marche
pas : aucun écran d'administration ne touche `clients`. Il faudrait donc
construire cet écran **et** un canal de demande — plus de travail, plus de
délai, pour un geste que la base autorise déjà au collecteur.

**Supprimer et réinscrire le client.** Impossible, et heureusement : les clés
étrangères de `mises` sont en `restrict`. Un client qui a versé une seule fois
ne peut plus être supprimé, et c'est l'invariant du journal d'audit.

**Journaliser la correction dans une table dédiée.** Inutile :
`clients_journal` enregistre déjà chaque `UPDATE`, avec l'ancienne et la
nouvelle valeur. Une seconde trace serait une seconde vérité.

## Ce que ce dessin ne fait pas

- **Aucune validation de format sur le téléphone.** Le produit n'en impose
  aucune à l'inscription — un numéro ivoirien s'écrit `0709201790` ou
  `+2250709201790`, et refuser l'une des deux formes au marché ferait plus de
  dégâts qu'une saisie libre. La seule borne est celle de la base, 32
  caractères.
- **Aucune détection de doublon.** Deux clients peuvent porter le même nom ;
  c'est déjà vrai à l'inscription, et un marché d'Abidjan compte plusieurs
  Traoré.
- **Aucun historique des corrections visible à l'écran.** Il est au journal,
  lisible par le Super Admin. L'exposer au collecteur est un autre travail.

## Épreuves qui décident

Le dessin est tenu si ces cinq-là passent :

1. Corriger le nom seul écrit le nom, et **ne touche pas** `avis_actifs`.
2. Corriger le numéro d'un client aux avis actifs écrit le numéro **et**
   `avis_actifs: false`, **dans la même requête**.
3. Vider le marché écrit `null`, et non `''`.
4. Un formulaire ouvert puis refermé sans modification n'écrit **rien** — aucune
   requête ne part.
5. Une écriture qui ne touche aucune ligne (RLS, privilège) rend un échec
   `RIEN_ECRIT` et **pas** un succès.

La cinquième est celle qui compte : c'est le défaut mesuré le 2026-08-24, et le
seul que la suite ne verrait pas sans qu'on l'écrive exprès.
