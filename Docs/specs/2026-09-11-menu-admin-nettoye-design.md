# Nettoyer le menu de Kolek · Admin — conception

**Date :** 2026-09-11.
**Statut :** périmètre approuvé par l'exploitant le 2026-09-11 — « retirer les
trois ».
**Place dans la suite :** chantier **A** sur quatre, dans l'ordre décidé le même
jour — A nettoyage du menu, B santé du système, C tableau de bord façon
maquette, D refonte visuelle du Super Admin. Chacun a sa conception, son plan et
son accord de poussée.

---

## Le problème

La console **Kolek · Admin** montre trois éléments qui ne mènent nulle part ou
qui affirment une chose fausse. Le design system l'interdit en deux endroits :
« ne jamais afficher un chiffre qu'on ne sait pas » (§2, principe 7) et « un
bouton qui n'écrit rien mais laisse croire le contraire » (§7, à éviter).

| Élément | Où | Pourquoi il n'a pas sa place |
|---|---|---|
| Entrée **« Encaisser »** | section Pilotage de la barre latérale ; ouvre `EncaisserMise.tsx` | L'écran dit lui-même qu'il ne sera jamais branché. La règle métier (cahier des charges §11 : l'argent est manié par le collecteur) et la base (politique `mises_insert` sur `collecteur_id = auth.uid()`) interdisent qu'un administrateur encaisse. Une entrée de menu pour une action impossible. |
| Bandeau **« Essai gratuit · 30 jours restants »** | en tête de chaque écran de l'admin (`BandeauOffre`) | Texte écrit en dur, valeurs par défaut du composant : **faux pour tout le monde**. GTCS n'est en essai chez personne. Son bouton « Voir les offres → » est désactivé. |
| Carte **« Passer à Pro »** | pied de la barre latérale, espace admin | Bouton désactivé (« Page des offres à venir »). Proposer à GTCS de passer à Pro n'a pas de sens : c'est GTCS qui vend Pro. |

## La décision

**Retirer les trois, et ce qui n'existait que pour eux.** Aucun remplacement :
les vraies alertes (abonnements qui échoient, collecteurs à risque) relèvent du
chantier C, qui refait le tableau de bord.

Alternatives écartées :

- *Retirer seulement « Encaisser »* — le bandeau faux resterait sur chaque écran.
- *Remplacer le bandeau par des alertes réelles dès maintenant* — contenu neuf,
  qui empiète sur C et ferait d'un ménage un chantier.

## Ce qui change, fichier par fichier

| Fichier | Changement |
|---|---|
| `packages/ui/src/BarreLaterale.tsx` | `'encaisser'` sort de `CleNavAdmin` et de `PILOTAGE`. La carte « Passer à Pro » sort du rendu, avec son commentaire. Le commentaire de `overflow-y-auto`, qui compte « deux raccourcis et un encart de promotion », est remis d'accord avec ce qui reste. |
| `packages/ui/src/BarreLaterale.test.tsx` | L'épreuve de l'espace plateforme garde son assertion sur « Passer à Pro » mais son commentaire change de raison. Deux épreuves neuves pour l'espace admin : aucune entrée « Encaisser », aucune carte « Passer à Pro ». |
| `apps/admin/src/Coquille.test.tsx` | Une épreuve neuve : la coquille de l'admin ne montre plus « 30 jours restants ». Le texte cherché est celui-là et non « Essai gratuit », que l'écran Demandes affiche à bon droit pour le palier gratuit. |
| `packages/ui/src/Bandeaux.tsx` | `BandeauOffre` est supprimé. `BandeauHorsLigne` et `useEnLigne` restent : l'application collecteur s'en sert. |
| `packages/ui/src/index.ts` | L'export de `BandeauOffre` disparaît. |
| `apps/admin/src/Coquille.tsx` | L'import et le rendu de `BandeauOffre` disparaissent, avec leur commentaire. L'import d'`EncaisserMise` et la route `page === 'encaisser'` aussi. |
| `apps/admin/src/ecrans/EncaisserMise.tsx` | Supprimé. |
| `packages/core/src/tokens.ts` | `degradePromo` est supprimé ; `theme.css` est régénéré par `npm run generer:theme`, jamais édité à la main. |
| `Docs/Kolek Design System.md` | Ligne 147 (`--degrade-promo`) retirée ; ligne 276 (`BandeauOffre`) retirée de l'inventaire ; lignes 356 et 364 (§5, « Free Plan Mode » et « Subscribe now ») disent que la console GTCS ne porte ni palier ni offre, puisque la plateforme n'est l'abonnée de personne. Les lignes 21 et 24 décrivent la maquette d'origine et restent telles quelles. |

## Ce qui ne change pas

- **Le reste du menu admin** : Tableau de bord, Collecteurs, Encours & Soldes ;
  Abonnements, Demandes ; Avis clients, Réglages.
- **Le Super Admin**, son menu et ses écrans (chantier D).
- **L'application collecteur** : son « Encaisser » est le vrai, il reste. Il
  vit dans deux autres types de `packages/ui` — `CleNavCollecteur`
  (`NavMobile.tsx`) et `CleNavBureau` (`NavBureau.tsx`) — que ce chantier ne
  touche pas. Seul `CleNavAdmin` perd sa clé.
- **La base, les Edge Functions, les migrations** : rien.

## Après

- Pilotage : Tableau de bord, Collecteurs, Encours & Soldes.
- Plus de bandeau en tête des écrans de l'admin.
- Le pied de la barre latérale ne porte plus que « Déconnexion ».

## Risques, et comment on les tient

- **Une référence oubliée à `'encaisser'`.** `CleNavAdmin` est un type fermé :
  `tsc -b` refuse toute clé qui n'y figure plus. La barrière de l'admin et celle
  de `packages/ui` le prouvent.
- **Le thème partagé.** `theme.css` sert les trois applications. Retirer une
  variable change donc l'empreinte de la feuille de style de l'application
  collecteur et, peut-être, de la vitrine — sans effet visible, la variable ne
  servant qu'à la carte supprimée. À la poussée, Netlify redéploie ces fronts ;
  la vérification compare les empreintes servies aux builds locaux et le dit.
- **`verifier:theme`** contrôle que `theme.css` sort bien de `tokens.ts` : il
  doit rester vert après la régénération.
- **Rien d'irréversible.** Aucune donnée n'est touchée ; un `git revert` rend
  l'état d'avant.

## Vérification

- Épreuves de `packages/ui` et de l'admin, dont les trois neuves, vues rouges
  avant le retrait.
- `tsc -b` dans `apps/admin`, `oxlint`.
- La chaîne complète, `npm run verifier`, quinze commandes lues.
- Après une poussée consentie : empreinte servie par `admin.kolek.cash` égale
  au build local ; empreintes des deux autres fronts relevées et expliquées ;
  job des fonctions : « Aucune Edge Function touchée ».
