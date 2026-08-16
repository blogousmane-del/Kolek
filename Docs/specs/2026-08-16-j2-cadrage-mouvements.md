# Kolek — Notes de cadrage J2 : le registre des mouvements

> Décisions d'architecture prises le 2026-08-16, avant le cadrage complet du jalon J2.
> Elles découlent de la résolution des rejets de synchro — voir `2026-08-15-j1-socle-design.md` §4.5.
>
> **Ce document n'est pas la spécification de J2.** J2 aura son propre cycle cadrage → spécification → plan. Ces trois décisions sont consignées ici parce qu'elles engagent la structure et qu'elles seraient coûteuses à re-déduire une fois J2 commencé.

---

## 1. Le problème que ces décisions règlent

Le rattrapage (§4.5 de la spec J1) enregistre une mise physiquement encaissée que le serveur a refusée. Il en découle que la somme encaissée sur une carte ne se lit plus dans la seule table `mises`.

Ce serait un détail si le rattrapage était la dernière exception. Il ne l'est pas :

| Ce qui arrive | Quand | Nouvel argent hors de `mises` |
|---|---|---|
| Rattrapage | J2 | Une mise encaissée que le serveur a refusée. |
| Mobile Money via partenaire agréé | Phase 2 | Des versements arrivant par un autre canal. |
| Bonus de fin de cycle, parrainage | Phase 2 | De la valeur attribuée à un client fidèle. |

À chaque fois, la même question — « combien a-t-on encaissé ? » — et à chaque fois, la même réponse fausse si l'on compte les lignes de `mises`.

Trois écrans se cassent, et chacun accuse quelqu'un :

- **Le score de régularité.** Un client qui a versé 31 fois en affiche 30 : le système le marque comme ayant sauté un jour, pour une panne de réseau qui n'est pas la sienne. En Phase 3, ce score décide de l'éligibilité au micro-crédit — la panne lui coûterait un prêt.
- **Le rapprochement de caisse.** L'argent est réellement dans la poche du collecteur. Si le cash attendu l'ignore, le collecteur apparaît avec un excédent inexpliqué — le système le fait passer pour quelqu'un qui garde ce qui ne lui appartient pas.
- **Le bilan du jour.** Sous-estimé, plus discrètement.

Ces bugs sont invisibles en développement : les rejets de synchro sont rares. On les découvre en production, sur de l'argent réel.

---

## 2. Décision — une seule surface de lecture de l'argent

Plus personne ne lit `mises` pour répondre à une question d'argent. Tout passe par une vue.

```sql
create view public.mouvements with (security_invoker = true) as
select m.id, m.collecteur_id, c.client_id, m.carte_id,
       'mise'::text as nature, m.montant, m.encaisse_le, m.est_commission
  from public.mises m
  join public.cartes c on c.id = m.carte_id
union all
select r.id, r.collecteur_id, r.client_id, r.carte_id,
       'rattrapage', r.montant, r.encaisse_le, false
  from public.rattrapages r;
```

Le Mobile Money ajoutera une branche. Les bonus en ajouteront une. **Les bilans, le score et le rapprochement ne changeront pas** : ils lisaient déjà `mouvements`.

> ### Avertissement de sécurité — `security_invoker = true`
>
> Ce paramètre n'est pas décoratif. Par défaut, une vue PostgreSQL s'exécute avec les droits de son propriétaire et **contourne les politiques RLS des tables sous-jacentes**. Sans `security_invoker = true`, cette vue exposerait à chaque collecteur l'argent de tous les autres — elle annulerait à elle seule l'isolation multi-tenant que J1 a mise en place et vérifiée par six tests d'intrusion.
>
> Le test à écrire en même temps que la vue : le collecteur A interroge `mouvements`, et ne voit que ses propres lignes.

`mises` reste lue directement pour ce qui n'est pas une question d'argent : l'affichage des 31 cases d'une carte, par exemple, qui porte sur le cycle et non sur des totaux.

---

## 3. Décision — un jeu de test empoisonné

Une vue ne protège que si on l'utilise, et rien n'oblige un développeur pressé à le faire. La documentation ne suffira pas : elle ne casse rien quand on l'ignore.

**Le scénario de §4.5 entre dans le jeu de données standard des tests de bilan** : une carte de 31 mises encaissées, dont une existe sous forme de rattrapage.

À partir de là, tout écran de bilan écrit sur `mises` seule annonce 30 000 FCFA au lieu de 31 000, et **son test échoue à la première exécution**. Le défaut passe d'invisible-jusqu'en-production à rouge-en-développement.

C'est ce mécanisme qui protège, pas la présente note.

---

## 4. Décision — le cash attendu se calcule, il ne se fige pas

Un rattrapage porte la date de la mise d'origine (`encaisse_le` recopié depuis la charge utile refusée), pas celle de sa saisie. La mise a eu lieu lundi ; le rattrapage est saisi mercredi ; c'est le lundi qu'il faut réparer.

Cela ne fonctionne qu'à une condition : que `caisses_jour.cash_attendu` soit **calculé à la lecture depuis `mouvements`**, et non figé en base le soir même.

Le déroulé : lundi, le collecteur a 1 000 FCFA de plus que ce que le serveur attendait — écart inexpliqué. Mercredi, le rattrapage arrive daté du lundi, l'attendu du lundi se recalcule, l'écart se referme de lui-même. Si le chiffre est figé, cet écart reste faux pour toujours et personne ne saura jamais pourquoi.

Une remarque de la revue de branche J1 va dans le même sens : `cash_attendu` est aujourd'hui inscriptible par le collecteur, et rien ne le calcule encore. Le privilège doit se resserrer à `grant update (cash_declare)` quand J4 câblera le calcul.

---

## 5. Décision — les reçus passent par une file, pas par un appel direct

Le rattrapage doit envoyer un reçu au client (§4.5, règle 2). Mais la passerelle WhatsApp arrive en J3, et le rattrapage en J2.

Le vrai problème n'est pas l'ordre des jalons : c'est que le rattrapage appellerait WhatsApp directement, donc ne pourrait pas exister avant lui. On casse ce lien — le rattrapage n'envoie rien, il **dépose une intention d'envoi**.

```
recus_a_envoyer( id, collecteur_id, client_id, canal, contenu,
                 cree_le, envoye_le, tentatives )
```

Ce que cela donne :

- Le rattrapage sort en J2 sans attendre, et empile des reçus en attente.
- En J3, la passerelle vide la file — y compris les reçus des semaines précédentes. Rien à rebrancher, rien à oublier : les lignes en attente sont visibles et réclament d'elles-mêmes.
- La même file sert les reçus de mises et de retraits en J3. Elle n'est donc pas construite pour le rattrapage : elle est construite pour J3, simplement avancée.
- **Elle est nécessaire de toute façon.** WhatsApp échouera — réseau, numéro invalide, quota. Un envoi direct perd le reçu. `tentatives` et `envoye_le` permettent de réessayer. Ce n'est pas de l'anticipation, c'est une exigence du canal.

Comme ailleurs, seule la colonne d'état est modifiable : `grant update (envoye_le, tentatives)`, jamais un droit de modification sur toute la ligne. Le contenu d'un reçu déjà émis ne se réécrit pas.

---

## 6. Ce que J2 construit, au total

| Élément | Nature |
|---|---|
| Table `rattrapages` | Append-only sauf `regle_le`, en privilège de colonne. |
| Vue `mouvements` | `security_invoker = true`, plus son test d'isolation. |
| Jeu de test empoisonné | Le cas de §4.5 dans les fixtures de bilan. |
| Table `recus_a_envoyer` | Append-only sauf `envoye_le` et `tentatives`. |
| Écran des rejets | Voir un rejet, le rattraper, suivre ce qui reste dû. |

Le surcoût par rapport à « une table `rattrapages` et trois écrans rapiécés » est faible : la file de reçus était requise pour J3, la vue tient en dix lignes, le jeu empoisonné est un jeu de données.

Ce qu'il achète : les trois écrans de J4 ne se réécriront pas à l'arrivée du Mobile Money, et l'erreur qui coûterait de l'argent à un client réel devient une erreur qui casse un test.

---

## 7. Ce qui reste ouvert

- **Le rattrapage sort-il en J2 ou en J3 ?** La file de reçus rend les deux viables : en J2 il naît muet et parle dès J3. À trancher au cadrage, selon la charge de J2.
- **Le client qui saute longtemps** — carte en veille, relance automatique ? Point ouvert du cahier §11. Touche le score de régularité et les alertes retard : à trancher avant J4.

---

*Kolek — notes de cadrage J2 · 2026-08-16 · à reprendre au démarrage du jalon.*
