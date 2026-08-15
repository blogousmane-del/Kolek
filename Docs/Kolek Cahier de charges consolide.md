# Kolek — Cahier de charges consolidé

> **Kolek** — SaaS de gestion pour banquiers ambulants (collecteurs journaliers / tontine)
> Éditeur : GSM Technologie Cyber Shop (GTCS) · Marché : Abidjan, Côte d'Ivoire
> Modèle : outil de gestion (l'argent reste cash) · Document de travail

Ce document regroupe le **cahier de charges Phase 1** (Partie I), le **dossier stratégique** — architecture, fidélisation, monétisation (Partie II) — et un rappel d'**identité de marque** (Annexe).

---

# PARTIE I — CAHIER DE CHARGES PHASE 1

## 1. Contexte & objectifs

**Le métier ciblé.** Le banquier ambulant (« collecteur » / tontine) enrôle des clients, souvent des commerçants de marché. Chaque client s'engage à verser une **mise journalière fixe**. Le collecteur passe chaque jour encaisser en espèces, tient un carnet à cases, garde une mise comme commission et restitue l'épargne en fin de cycle. Le système repose sur la confiance et la traçabilité du carnet.

**Le problème.** Le carnet papier se perd, se falsifie et ne donne aucune vue d'ensemble : impossible de savoir qui est à jour, combien de cash devrait être en caisse, ou quel est le bilan du mois. Les litiges naissent de ces zones d'ombre.

**L'objectif.** Fournir au collecteur un carnet numérique fiable et un tableau de bord utilisable **hors-ligne dans les marchés**, générant automatiquement reçus et bilans. GTCS vend un logiciel par abonnement — **l'argent ne transite jamais par la plateforme**, ce qui maintient le produit hors du champ réglementé de la collecte de dépôts.

**Différenciateur.** Face aux solutions existantes (SmartMifin, My Tontine, TontiGo…), pensées pour la tontine de groupe et la connexion permanente, l'angle de Kolek est **« hors-ligne d'abord » et pensé pour le collecteur ambulant ivoirien** : encaisser sans réseau, synchroniser après, envoyer un reçu au client.

## 2. Périmètre de la Phase 1

**Inclus — Phase 1**
- Comptes collecteurs et abonnement au SaaS (super-admin).
- Souscription et fiche client.
- Carte de collecte numérique de 31 mises, fonctionnant hors-ligne.
- Encaissement des mises + reçu automatique horodaté.
- Retrait / clôture de carte avec application de la commission.
- Registres et bilans : journalier, mensuel, annuel.
- Suivi innovant : score de régularité, alertes retard, rapprochement de caisse, tableau de bord.

**Reporté — Phase 2 et au-delà**
- Renouvellement automatique multi-cycles (nouvelle carte enchaînée, historique cumulé).
- Intégration Mobile Money pour les flux clients (Orange Money / Wave / MTN) — via partenaire agréé.
- Application côté client final (consultation du solde).
- Multi-collecteurs sous une même organisation / supervision d'équipe.
- Produits dérivés (crédit, micro-assurance).

> **Décision de cadrage.** En Phase 1, un client possède **une carte active à la fois**. Le renouvellement est écarté pour livrer vite un produit vendable, puis ajouté en Phase 2.

## 3. Acteurs & rôles

| Acteur | Rôle | Accès |
|---|---|---|
| **Super-admin** (GTCS) | Crée et gère les comptes collecteurs, gère les abonnements, supervise l'usage global. | Tous les comptes ; aucune donnée client individuelle hors support. |
| **Collecteur** (client payant) | Gère ses clients, encaisse, effectue les retraits, consulte ses bilans. | Uniquement ses clients et ses cartes. |
| **Client final** (déposant) | Verse ses mises, reçoit un reçu, retire son épargne. | Pas de compte en Phase 1 ; reçus par WhatsApp / SMS. |

## 4. Règles métier — le moteur de calcul

| Paramètre | Règle |
|---|---|
| Mise journalière | Montant fixe `M` défini à la souscription, **de 500 à 10 000 FCFA** (ex. 500, 1 000, 2 000, 5 000, 10 000). |
| Cycle | **31 mises encaissées** — on compte les versements réels, pas les jours du calendrier. |
| Commission collecteur | **1 mise par carte.** La 1ʳᵉ mise encaissée est fléchée « commission ». |
| Retrait | Possible **à tout moment**. Le retrait **clôture la carte** ; la commission d'une mise est prélevée sur le solde encaissé. |

### Formule universelle

```
Solde restituable = (mises encaissées − 1) × M
```

La 1ʳᵉ mise de chaque carte est la commission du collecteur ; tout le reste est de l'épargne restituable (plafonné à 30 × M).

### Vérifications (M = 1 000 FCFA)

| Situation | Restitué au client | Gardé par le collecteur |
|---|---|---|
| Carte complète — 31 mises | 30 000 FCFA | 1 000 FCFA |
| Retrait anticipé — 15 mises | 14 000 FCFA | 1 000 FCFA |
| Retrait après 1 seule mise | 0 FCFA | 1 000 FCFA |

> **Règle retenue — seuil de retrait.** Retrait autorisé à tout moment, **sans seuil bloquant**. En deçà de 2 mises, le solde restituable est nul (la 1ʳᵉ mise étant la commission) ; dès la 2ᵉ mise, le client récupère (mises − 1) × M. La formule gère nativement ce cas.

## 5. Modules fonctionnels

| Code | Module | Priorité | Contenu |
|---|---|---|---|
| **M1** | Souscription client | Haute | Fiche (nom, téléphone, photo, zone/marché, activité) ; mise `M` ; création d'un identifiant et d'une carte active. |
| **M2** | Carte de collecte numérique | Haute | Carnet 31 cases digitalisé ; **fonctionne hors-ligne** ; synchronisation au retour du réseau. |
| **M3** | Encaissement des mises | Haute | Enregistrement en un geste, horodaté, hors-ligne ; reçu auto au client (WhatsApp prioritaire, repli SMS) ; mise à jour du solde. |
| **M4** | Retrait & clôture | Haute | Affiche le solde restituable ; prélève la commission (1 mise) ; clôture la carte ; reçu de retrait. |
| **M5** | Registres & bilans | Moyenne | Bilans journalier / mensuel / annuel ; filtres par client et zone ; export PDF/Excel. |
| **M6** | Suivi innovant | Différenciateur | Score de régularité ; alertes retard ; rapprochement de caisse (cash attendu vs déclaré) ; tableau de bord. |
| **M7** | Comptes & abonnements | Super-admin | Création/suspension des comptes ; suivi des abonnements ; encaissement en Orange Money / Wave. |

## 6. Parcours utilisateurs clés

- **P1 — Souscrire un client.** Collecteur → « Nouveau client » → fiche + mise → carte active → reçu de bienvenue.
- **P2 — Encaisser une mise (hors-ligne).** Ouvre la carte → « Encaisser » → case cochée, solde mis à jour localement → reçu dès qu'il y a du réseau → synchro serveur.
- **P3 — Retrait / clôturer.** Carte client → « Retrait » → affichage du restituable → confirmation → commission prélevée, carte clôturée, reçu.
- **P4 — Bilan du jour.** Tableau de bord → total encaissé, clients visités, cash attendu → saisie du cash réel → écart affiché.

## 7. Exigences non-fonctionnelles

| Exigence | Attendu |
|---|---|
| Hors-ligne d'abord | Toutes les opérations de collecte fonctionnent sans réseau ; synchro transparente, sans perte ni doublon. |
| Sécurité & isolation | Chaque collecteur ne voit que ses données (isolation par rôle) ; authentification obligatoire. |
| Performance | Utilisable sur smartphones d'entrée de gamme et en connexion faible. |
| Langue & devise | Interface en français, montants en FCFA. |
| Reçus | **WhatsApp prioritaire** (gratuit, quasi universel à Abidjan) + **repli SMS automatique** ; à chaque encaissement et retrait. |
| Traçabilité | Chaque mise et retrait horodaté et non modifiable après coup (journal d'audit). |
| Sauvegarde | Données répliquées côté serveur ; aucune perte si le téléphone est cassé ou volé. |

## 8. Architecture technique & modèle de données

| Couche | Choix | Rôle |
|---|---|---|
| Base de données | Supabase (PostgreSQL) | Stockage central, relations, journal d'audit. |
| Authentification & sécurité | Supabase Auth + RLS | Isolation stricte par collecteur. |
| Application | PWA hors-ligne (IndexedDB + file de synchro) | Collecte sans réseau, installable. |
| Hébergement | Netlify | Diffusion de l'app, mises à jour continues. |
| Paiement abonnement | Orange Money / Wave / MTN | Encaissement de l'abonnement collecteur. |
| Reçus | Passerelle WhatsApp / SMS | Notification client à chaque opération. |

**Aperçu du modèle de données (Phase 1)**

```
collecteurs( id, nom, telephone, zone, abonnement_statut, abonnement_echeance, cree_le )

clients( id, collecteur_id →collecteurs, nom, telephone, photo_url, marche, activite, cree_le )

cartes( id, client_id →clients, mise, statut[active|cloturee],
        mises_encaissees, ouverte_le, cloturee_le )

mises( id, carte_id →cartes, montant, encaisse_le, est_commission[bool], synchro[bool] )

retraits( id, carte_id →cartes, montant_restitue, commission, effectue_le )

caisses_jour( id, collecteur_id →collecteurs, date, cash_attendu, cash_declare, ecart )
```

> **Note.** `est_commission` marque la 1ʳᵉ mise de chaque carte. Le solde restituable n'est **pas stocké** mais calculé à la volée : `(mises_encaissees − 1) × mise` — une seule source de vérité.

## 9. Modèle économique

Un logiciel vendu au collecteur, pas un service financier. Abonnement mensuel, payé en Mobile Money.

| Palier | Prix / mois | Clients gérés | Inclus |
|---|---|---|---|
| **Essai** | Gratuit · 30 jours | Jusqu'à 20 | Toutes les fonctions, pour tester. |
| **Standard** | 2 500 FCFA | Jusqu'à 50 | Collecte, retraits, reçus, bilans. |
| **Pro** | 5 000 FCFA | Jusqu'à 150 | Standard + suivi innovant, exports. |
| **Illimité** | 10 000 FCFA | Illimité | Pro + multi-zones, priorité support. |

> **Logique de prix.** Un collecteur de 100 clients à 1 000 FCFA de mise encaisse ~100 000 FCFA de commissions par cycle. L'abonnement est une part minime de ses revenus ; l'argument de vente est le temps gagné et la fin des litiges. Grille de lancement, à ajuster après le pilote.

## 10. Livrables & jalons

| Jalon | Contenu | Résultat |
|---|---|---|
| J1 — Socle | Modèle de données Supabase + auth + isolation par rôle. | Base sécurisée prête. |
| J2 — Collecte | M1 Souscription, M2 Carte, M3 Encaissement (hors-ligne + synchro). | Le collecteur encaisse et suit ses clients. |
| J3 — Retraits | M4 Retrait / clôture + reçus. | Cycle de vie complet d'une carte. |
| J4 — Pilotage | M5 Bilans, M6 Suivi innovant. | Vue d'ensemble & différenciateur. |
| J5 — Commercial | M7 Comptes & abonnements, essai pilote. | Produit vendable. |

## 11. Points ouverts & conformité

**Points ouverts à trancher**
- Gestion d'un client qui « saute » longtemps : carte en veille ? relance automatique ?

*Tranchés : seuil de retrait (§4) · grille tarifaire (§9) · canal de reçu, WhatsApp prioritaire avec repli SMS (§7).*

**Conformité — le garde-fou.** Tant que l'argent reste du cash manié par le collecteur et que la plateforme ne fait que **gérer des registres**, Kolek vend un logiciel et reste hors du champ des Systèmes Financiers Décentralisés (SFD). Dès que des dépôts transiteraient par la plateforme, on entre dans la collecte de dépôts remboursables — activité réservée aux acteurs agréés par la BCEAO. Toute évolution Mobile Money doit passer par un **partenaire agréé**.

**Risques produit** : adoption terrain (gagner du temps dès le 1ᵉʳ jour) ; fiabilité de la synchro hors-ligne (pas de double comptage) ; confiance du client final (le reçu automatique est l'argument clé).

## 12. Glossaire

| Terme | Définition |
|---|---|
| Banquier ambulant / collecteur | Personne qui collecte l'épargne journalière sur le terrain. |
| Mise | Montant fixe versé chaque jour par le client. |
| Carte | Un cycle de 31 mises pour un client donné. |
| Commission | 1 mise par carte, gardée par le collecteur (la 1ʳᵉ mise). |
| Solde restituable | Épargne à rendre : (mises encaissées − 1) × M. |
| Rapprochement de caisse | Comparaison cash attendu / cash déclaré en fin de journée. |
| PWA | Application web installable, fonctionnant hors-ligne. |
| SFD | Système Financier Décentralisé — cadre réglementé de la microfinance (BCEAO). |

---

# PARTIE II — DOSSIER STRATÉGIQUE

*Architecture, fidélisation & monétisation — poser des fondations qui tiennent à l'échelle.*

## 1. Le principe : un backend, deux applications

Kolek est une plateforme : une base unique alimente deux produits distincts qui se déploient et évoluent séparément.

```
                 ┌─────────────────────────────────────────┐
                 │        BACKEND UNIQUE — Supabase          │
                 │  PostgreSQL · Auth · RLS · Edge Functions │
                 │            · Storage · Realtime           │
                 └─────────────────────────────────────────┘
                          │                        │
        ┌─────────────────┘                        └─────────────────┐
  ┌───────────────────────┐                    ┌───────────────────────┐
  │  Sous-projet A         │                    │  Sous-projet B         │
  │  APP COLLECTEUR         │                    │  DASHBOARD ADMIN        │
  │  PWA hors-ligne, mobile │                    │  Web, riche             │
  │  (produit vendu)        │                    │  (pilotage GTCS)        │
  └───────────────────────┘                    └───────────────────────┘

  Services : WhatsApp/SMS · Mobile Money (Phase 2) · Passerelle crédit (Phase 3)
```

> **Pourquoi ça tient.** Une seule source de vérité (une base, une authentification) : pas de double saisie, pas de synchro entre deux systèmes. Mais deux codebases séparées : l'app terrain reste légère et rapide, le dashboard peut être aussi riche qu'on veut sans alourdir le collecteur.

## 2. Scalabilité — les 5 décisions structurantes

1. **Multi-tenant par collecteur.** Chaque collecteur est un « locataire » isolé. Toutes les données portent un `collecteur_id`, et les règles RLS garantissent qu'un collecteur ne voit jamais celles d'un autre. Un seul Postgres sert des milliers de collecteurs.
2. **Journal d'événements append-only + synchro idempotente.** Chaque mise est un événement horodaté avec un identifiant généré côté téléphone. À la reconnexion, le serveur ignore les doublons → hors-ligne fiable, jamais de double comptage.
3. **Logique de confiance côté serveur (Edge Functions).** Clôture de cycle, calcul de commission, envoi des reçus, encaissement des abonnements s'exécutent sur le serveur. L'app propose, le backend décide.
4. **Déploiements séparés.** App Collecteur et Dashboard Admin sont deux sites Netlify indépendants sur le même backend.
5. **Vues dédiées pour l'analytique.** Les requêtes lourdes de l'admin (encours total, MRR, churn) passent par des vues matérialisées, pas par des scans qui ralentiraient l'app terrain.

## 3. Rôles & sécurité

| Rôle | Application | Accès |
|---|---|---|
| **Collecteur** | App Collecteur | Uniquement ses clients et ses cartes (RLS stricte). |
| **Admin** (GTCS) | Dashboard Admin | Vue globale via fonctions sécurisées côté serveur. |
| **Superviseur** *(plus tard)* | Dashboard Admin | Supervise les collecteurs d'une zone. |
| **Support** *(plus tard)* | Dashboard Admin | Dépannage avec accès temporaire et tracé. |

> **Règle de sécurité.** La clé « service » de Supabase (qui contourne l'isolation) ne vit que côté serveur, dans les Edge Functions. Le Dashboard Admin ne l'embarque jamais dans le navigateur — il appelle des fonctions qui, elles, ont le privilège.

## 4. Fidélisation — deux niveaux

**Niveau 1 · fonctionnalité produit — fidéliser les clients du collecteur**
- Score & séries : badges de régularité (« 30 jours sans manquer »).
- Bonus fin de cycle : le collecteur récompense un client fidèle.
- Parrainage : un client qui en amène un autre gagne un avantage.
- Reçus & historique : la transparence crée la confiance.

**Niveau 2 · stratégie Kolek — fidéliser le collecteur (le payeur)**
- Verrou par la donnée : plus il a de clients et d'historique, plus partir coûte cher.
- Programme collecteur : ancienneté = réduction ; parrainage = mois offerts.
- Déblocage de fonctions avec la fidélité et la croissance.
- Fiabilité & support : un outil qui ne lâche jamais en pleine tournée.

> **L'idée clé.** Le Niveau 1 est un **argument de vente** ; le Niveau 2 **protège directement le revenu** de Kolek. Les deux se renforcent.

## 5. Système de monétisation

Cinq couches empilées, activées par phases. Le socle est récurrent ; les relais de croissance viennent ensuite.

1. **Abonnement par paliers** *(Phase 1 · socle)* — cœur du revenu, mensuel et prévisible (grille §9).
2. **Freemium d'adoption** *(Phase 1)* — palier gratuit + essai pour bâtir vite un volume de collecteurs.
3. **Fonctions premium / upsell** *(Phase 1-2)* — analytique avancée, exports, reçus brandés, multi-zones.
4. **Add-on Mobile Money** *(Phase 2)* — fonctionnalité payante ; flux via **partenaire agréé** ; Kolek touche une commission d'apport, sans détenir les fonds.
5. **Passerelle crédit — le vrai levier** *(Phase 3)* — la donnée de régularité devient un actif : les bons épargnants sont éligibles à un micro-crédit via un SFD partenaire ; commission d'apport par crédit octroyé.

**Récapitulatif**

| Source | Phase | Type | Récurrence |
|---|---|---|---|
| Abonnement paliers | 1 | SaaS | Mensuel récurrent |
| Fonctions premium | 1-2 | Add-on SaaS | Mensuel |
| Add-on Mobile Money | 2 | Add-on + commission | Mensuel + par volume |
| Reçus brandés / white-label léger | 2 | Option | Mensuel |
| Passerelle crédit (donnée) | 3 | Commission d'apport | Par crédit octroyé |

> **Recommandation.** Démarrer sur les couches 1 et 2 (abonnement + freemium) dès le lancement, ajouter l'upsell tôt. Garder Mobile Money et surtout la **passerelle crédit** comme relais : c'est la donnée accumulée en Phase 1 qui rend la Phase 3 possible — donc on la structure proprement dès maintenant.

## 6. Dashboard Admin — périmètre

- **Collecteurs** : créer, suspendre, réactiver ; voir l'activité de chacun.
- **Abonnements & paiements** : paliers, échéances, relances, blocage auto à l'expiration.
- **Supervision** : collecteurs et clients actifs, encours total suivi, volume encaissé.
- **Monétisation** : MRR, churn, progression par palier.
- **Alertes** : collecteurs à risque de départ, abonnements échus.
- **Support** : dépannage tracé, gestion de la grille tarifaire.
- **Partenaires** *(Phase 3)* : pilotage de la passerelle crédit et des commissions.

## 7. Feuille de route par phases

| Phase | Produit | Monétisation activée |
|---|---|---|
| **1 — Socle** | App Collecteur (cycle complet) + Dashboard Admin de base, backend multi-tenant. | Abonnement + freemium + upsell. |
| **2 — Extension** | Renouvellement multi-cartes, Mobile Money via partenaire, reçus brandés, superviseurs. | Add-on Mobile Money + white-label. |
| **3 — Levier** | Scoring de régularité exploité, passerelle crédit avec un SFD. | Commission d'apport crédit. |

## 8. Décisions à valider

- Le système de monétisation proposé convient-il comme base ?
- Priorité après le socle : renouvellement multi-cartes, ou Mobile Money d'abord ?
- Programme de fidélité collecteur : réductions à l'ancienneté et/ou parrainage « mois offerts » ?

---

# ANNEXE — IDENTITÉ DE MARQUE

**Nom du produit :** Kolek — court, moderne, dit clairement la collecte. Libre côté fintech ivoirienne (à sécuriser : domaines `kolek.ci`/`kolek.app`, nom Play Store, dépôt de marque **OAPI**). Voisin phonétique à connaître : « Kolo » (app de transfert).

**Slogan (piste recommandée) :** « Chaque mise compte » — double sens : chaque versement compte pour le client, et il est compté par l'app.
*Autres pistes : « La collecte, sans le carnet » · « Ta tournée dans la poche » · « L'épargne qui passe te voir » · « Collecte. Suivi. Confiance. »*

**Logo :** monogramme « k » géométrique dont l'articulation est une **pièce d'or** — l'argent au cœur de la collecte.

**Typographie :** grotesque géométrique grasse (Poppins / Sora / Manrope), poids 800.

**Palette :**

| Couleur | Hex | Usage |
|---|---|---|
| Vert Kolek | `#14402C` | Primaire — confiance, épargne |
| Or / pièce | `#D9A84E` | Accent — la valeur qui s'accumule |
| Or foncé | `#B07D2B` | Accent secondaire |
| Encre | `#171A17` | Texte |
| Papier | `#FBFAF6` | Fond |

**Livrables associés du projet :** cahier de charges Phase 1 (HTML), prototype cliquable de l'écran collecteur (PWA de démo), planche de concept de logo (HTML/SVG).
