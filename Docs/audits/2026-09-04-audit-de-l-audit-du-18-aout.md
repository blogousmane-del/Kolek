# Audit de l'audit du 2026-08-18

**Date :** 2026-09-04 · **Objet :** `Docs/audits/2026-08-18-audit-securite-20-controles.md`
· **Méthode :** chaque affirmation du document confrontée à une mesure faite
aujourd'hui — dépôt, base distante, et les trois sites depuis l'extérieur.

**Verdict : le document n'est plus un état des lieux fiable.** Il n'a pas
menti ; il a été rattrapé. Sept de ses affirmations sont fausses aujourd'hui, et
sa grille ne couvre plus la surface du produit.

Ce n'est pas un reproche à son auteur. C'est la propriété d'un audit daté qu'on
laisse vieillir sans le relire : il continue de rassurer longtemps après avoir
cessé de décrire quoi que ce soit. Le relire coûte une heure ; s'y fier coûte
une panne.

---

## Ce qui est devenu faux

| Contrôle | Ce que l'audit affirme | Mesure du 2026-09-04 |
|---|---|---|
| 12 | « anti-bot : **non applicable**, aucun formulaire public » | Deux routes publiques — `demander-ouverture` et `mot-de-passe-oublie` — bornées par `consommer_debit`, une demande par minute. Ce n'est pas « non applicable », c'est « conforme par débit, pas par CAPTCHA » |
| — | « le formulaire de paiement du site vitrine est **délibérément inerte** » | Il encaisse depuis aujourd'hui : trois produits Chariow, un webhook signé, dix-neuf Edge Functions |
| 10 | « aucune colonne de mot de passe dans `public` » | `demandes_ouverture.mot_de_passe_hash`, née le 2026-09-03 |
| 4 | « RLS active sur les **neuf** tables » | Quinze tables |
| Durcissement 2 | « les **huit** fonctions `SECURITY DEFINER` » | Trente-huit migrations en déclarent |
| 3 | « **deux** `createClient` applicatifs » | Trois applications |
| 19 | « HSTS un an, sous-domaines et **`preload`** » | `preload` a disparu au passage à `kolek.cash` le 2026-08-26. Le dépôt le sait — `scripts/verifier-en-ligne.mjs` l'explique en commentaire — mais l'audit, lui, l'affirme encore |

Le dernier mérite qu'on s'y arrête, parce qu'il est le plus instructif : la
connaissance existait dans le dépôt, au bon endroit, écrite par quelqu'un qui
avait compris. Elle n'a simplement jamais remonté jusqu'au document que l'on
consulte pour savoir où l'on en est.

---

## Ce qui tient — remesuré, non recopié

```
signup                422  signup_disabled
OpenAPI /rest/v1/     401  schéma non énumérable
demandes_ouverture    401     paiements_abonnement  401
avis_clients          401     codes_promo           401
storage/v1/bucket     []      npm audit --omit=dev  0 vulnérabilité
select('*') applicatif  0 occurrence
```

Les quatre tables nées depuis l'audit sont hors de portée du rôle anonyme sans
que personne ait eu à y penser : le `revoke` de la migration 7 les couvre par
construction. C'est la meilleure nouvelle de ce passage — un socle qui protège
ce qui n'existait pas encore quand il a été posé vaut mieux qu'une vigilance qui
doit se répéter.

En-têtes et `robots.txt` mesurés sur les trois sites, tous conformes : CSP sans
joker ni `unsafe-inline` sur les scripts, `frame-ancestors 'none'`,
`X-Content-Type-Options`, `Referrer-Policy`, et `X-Robots-Tag: noindex` sur les
deux outils internes seulement.

---

## Les trois ⚪️ « non vérifié » ont trois semaines

Longueur minimale du mot de passe côté distant, limites de débit sur `/token`,
test des deux comptes en production. Aucun n'a bougé depuis le 2026-08-18.

Un « non vérifié » que personne ne relève finit par se lire comme un
« conforme ». C'est le mécanisme le plus discret de cette liste, et le seul dont
la correction ne demande aucun code — seulement d'ouvrir un tableau de bord.

---

## Le vrai défaut, et il n'est pas dans la grille

Cette grille demande **qui est refusé**. Elle ne demande jamais **si le service
fonctionne**.

C'est exactement l'angle mort qui a coûté la journée du 2026-09-04. La porte de
`envoyer-avis`, déclarée fermée le 3 septembre et vérifiée comme telle, refusait
aussi l'horloge : sept heures de drainage à l'arrêt, visibles nulle part sauf
dans `net._http_response`. Les vingt contrôles auraient tous été verts pendant
ce temps — et l'auraient été à juste titre, puisqu'aucun ne pose la question.

La sonde de la passerelle SMS, passée le même jour, a révélé au passage que
`COMPTE_REFUSE 401` sort d'Africa's Talking depuis une date inconnue. Là encore :
rien dans la grille ne l'aurait montré.

**Un audit de sécurité qui ne mesure que les refus déclare « sûr » un système à
l'arrêt.** La grille gagnerait un vingt-et-unième contrôle, et il tiendrait en
une question : *chaque chemin légitime a-t-il été parcouru en entier, en
production, depuis le dernier déploiement ?*

---

## Ce qu'il faut en faire

Le document du 2026-08-18 garde sa valeur d'archive — il dit ce qui était vrai
ce jour-là, et la migration `20260818010000` qu'il a produite tient toujours. Il
ne doit simplement plus servir à répondre « où en est la sécurité de Kolek ».

Pour ça, l'audit du 2026-09-04 est plus proche du réel, à sa correction près —
lui aussi a déclaré fermé un contrôle qui, déployé, refusait l'appelant
légitime.
