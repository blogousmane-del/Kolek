# Kolek — J2a : la collecte en ligne · Spécification de conception

> Premier jalon produisant quelque chose d'utilisable sur le terrain.
> Date : 2026-08-16 · Statut : validé, prêt pour plan d'implémentation
> Documents parents : `Kolek Cahier de charges consolide.md` · `Kolek Design System.md` · `2026-08-15-j1-socle-design.md` · `2026-08-16-j2-cadrage-mouvements.md`

---

## 1. Pourquoi J2a existe

Le cahier prévoit un jalon J2 unique : souscription, carte, encaissement **et** synchronisation hors-ligne. Ces deux moitiés n'ont pas la même difficulté. La souscription et la carte sont du travail d'application ordinaire. La file de synchro est le risque produit numéro un du cahier, et le seul endroit où un défaut coûte de l'argent réel.

Les mener ensemble, c'est déboguer la synchro sous la pression d'une démonstration.

**J2a** livre la collecte en ligne : un collecteur avec du réseau fait sa tournée entière.
**J2b** ajoute IndexedDB, la file, l'écran des rejets et le rattrapage.

Ce découpage n'est possible que grâce à une décision de J1 : les mises s'écrivent par `INSERT` direct avec un identifiant généré sur le téléphone. C'est déjà le chemin d'écriture hors-ligne. J2b insère une file **devant** le même appel — c'est additif. Si J1 avait choisi une Edge Function par mise, découper serait un piège.

### 1.1 Périmètre

**Inclus**
- M1 Souscription : fiche client, mise journalière, ouverture de la carte.
- M2 Carte de collecte : les 31 cases, le solde restituable, l'historique.
- M3 Encaissement, en ligne, avec confirmation.
- Annulation d'une mise saisie par erreur.
- Écran d'accueil : la tournée du jour.

**Exclu**
- Hors-ligne, IndexedDB, file de synchro, écran des rejets, rattrapage — J2b.
- Retrait, clôture, reçus WhatsApp — J3.
- Bilans, score de régularité, rapprochement de caisse — J4.
- Photo du client (§8.1) et suite d'une carte complète (§8.2).

### 1.2 Critère de réussite

Un collecteur connecté peut souscrire une cliente, ouvrir sa carte, encaisser une mise, en annuler une saisie par erreur, et retrouver le lendemain sa tournée avec l'état de chacun. Les vérifications de §7 passent sur une base reconstruite.

---

## 2. Une correction du schéma de J1

J1 laisse un défaut que seule la décision d'annulation révèle. Il se corrige avant tout écran.

### 2.1 Le défaut

Deux règles de J1 se contredisent dès qu'une mise peut être annulée :

```sql
new.est_commission := (c.mises_encaissees = 0);          -- trigger, ligne 36

create unique index mises_une_commission_par_carte        -- ligne 23
  on public.mises(carte_id) where est_commission;
```

Une mise annulée fait redescendre `mises_encaissees`. La mise suivante est donc marquée commission à son tour — et **viole l'index d'unicité**, puisque la mise annulée porte toujours `est_commission = true` et qu'elle est immuable.

La carte devient définitivement inencaissable. Pire, l'erreur remontée est `23505`, précisément le code que le client de synchro de J2b interprétera comme « déjà enregistrée, tout va bien » : une carte morte passerait pour une synchronisation réussie.

### 2.2 La cause

`est_commission` est une **donnée dérivée stockée**. La commission est la première mise non annulée d'une carte ; cela se calcule.

J1 a appliqué ce principe au solde restituable et l'a écrit noir sur blanc : *« Le solde restituable n'est pas stocké mais calculé à la volée — une seule source de vérité. »* `est_commission` enfreint la même règle, et c'est ce qui casse.

### 2.3 La correction

Supprimer la colonne et son index. La commission se dérive dans la vue `mouvements` (§4). Toute la classe de défaut disparaît, y compris les cas qu'on n'a pas encore imaginés.

Le trigger `mises_avant_insert` perd sa ligne 36 ; le reste — test de doublon, verrou de ligne, contrôles métier, réécriture du `collecteur_id` — est inchangé.

> **Note.** La revue finale de J1 concluait que rien n'aurait à être défait pour J2. Elle ne pouvait pas voir ce défaut : la décision d'annulation n'existait pas encore. Rien n'est déployé et aucune donnée n'existe, donc c'est le moment le moins cher.

---

## 3. Le modèle : les annulations

```
annulations( id, collecteur_id →collecteurs, mise_id →mises (unique),
             motif, annule_le )
```

| Colonne | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Généré côté téléphone, comme les mises. |
| `collecteur_id` | `uuid` FK | Dénormalisé pour RLS ; réécrit par le trigger depuis la carte. |
| `mise_id` | `uuid` FK **unique** | On n'annule pas deux fois la même mise. |
| `motif` | `text` | `mauvais_client` \| `montant_errone` \| `double_saisie` \| `autre`, par CHECK. |
| `annule_le` | `timestamptz` | Défaut `now()`. |

Une liste fermée de motifs plutôt que du texte libre : J4 doit pouvoir en tirer quelque chose, et un champ libre sur un téléphone au marché ne sera pas rempli.

### 3.1 Triggers

**`annulations_avant_insert`** (`BEFORE INSERT`, `SECURITY DEFINER`, `search_path` épinglé)
1. Charge la mise et sa carte. Absente : `MISE_INTROUVABLE`.
2. Si la carte est clôturée : `CARTE_CLOTUREE`. Voir §3.2.
3. Réécrit `NEW.collecteur_id` depuis la carte — comme pour les mises, un payload forgé ne décide de rien.

**`annulations_apres_insert`** (`AFTER INSERT`, `SECURITY DEFINER`)
Décrémente `cartes.mises_encaissees`. `SECURITY DEFINER` pour la même raison qu'à l'insertion d'une mise : aucune politique n'autorise le collecteur à écrire dans `cartes`.

**`annulations_immuables`** (`BEFORE UPDATE OR DELETE`)
Réutilise `interdire_modification()`. On n'annule pas une annulation.

### 3.2 Pourquoi l'annulation est refusée sur une carte clôturée

À la clôture, le solde a été calculé et remis en espèces. Annuler après coup rendrait faux un registre sur lequel de l'argent a déjà changé de main.

Ce cas relève du **rattrapage** (spec J1 §4.5) : une écriture qui enregistre ce qui est dû, pas une réécriture du passé.

Aucune carte ne se clôture en J2a — la clôture arrive en J3. La règle se pose maintenant parce qu'elle est gratuite maintenant, et parce que J3 la rendra atteignable sans qu'on y repense.

### 3.3 Privilèges et politiques

Mêmes motifs qu'en J1.

```sql
grant select, insert on public.annulations to authenticated;
grant all           on public.annulations to service_role;
```

Ni `update` ni `delete` pour `authenticated` : l'immuabilité se refuse aussi au niveau des privilèges. `TRUNCATE`, `REFERENCES` et `TRIGGER` sont déjà écartés pour les tables futures par l'`alter default privileges` de la migration d'audit.

RLS activée. Deux politiques, `select` et `insert`, sur `collecteur_id = (select auth.uid())`.

---

## 4. La vue `mouvements`

Le cadrage J2 la prévoyait pour le rattrapage. L'annulation l'avance en J2a, puisque c'est elle qui dérive la commission.

```sql
create view public.mouvements with (security_invoker = true) as
with actives as (
  select m.*,
         row_number() over (partition by m.carte_id
                            order by m.encaisse_le, m.recu_le, m.id) as rang
    from public.mises m
   where not exists (select 1 from public.annulations a where a.mise_id = m.id)
)
select a.id, a.collecteur_id, c.client_id, a.carte_id,
       a.montant, a.encaisse_le, a.recu_le,
       (a.rang = 1) as est_commission
  from actives a
  join public.cartes c on c.id = a.carte_id;
```

> ### `security_invoker = true` n'est pas décoratif
>
> Par défaut une vue s'exécute avec les droits de son propriétaire et **contourne RLS**. Sans ce paramètre, chaque collecteur verrait l'argent de tous les autres — la vue annulerait à elle seule l'isolation que J1 a vérifiée par six tests d'intrusion.
>
> Un test l'accompagne obligatoirement : le collecteur A interroge `mouvements` et ne voit que ses propres lignes.

**La vue ne contient que l'argent qui compte.** Les mises annulées en sont absentes. C'est délibéré : un calcul de solde ne peut pas oublier de les exclure puisqu'elles n'y sont pas.

L'historique d'une carte, lui, les affiche — la transparence se fait à l'écran, pas dans la surface de calcul. Cet écran lit `mises` et `annulations` directement, en toute connaissance de cause.

Le tri est déterministe : `encaisse_le`, puis `recu_le`, puis `id`. Deux mises encaissées dans la même seconde hors-ligne doivent quand même donner la même commission à chaque lecture.

---

## 5. Le module `donnees.ts`

Aucun écran ne connaît Supabase. Toute lecture et toute écriture passent par un module unique, dans `apps/collecteur/src/donnees.ts`.

```ts
chargerTournee(): Promise<Tournee>
souscrireClient(fiche: FicheClient): Promise<{ clientId: string; carteId: string }>
chargerCarte(carteId: string): Promise<CarteDetail>
encaisserMise(carteId: string): Promise<Mise>
annulerMise(miseId: string, motif: MotifAnnulation): Promise<void>
```

**Pourquoi cette frontière.** En J2b, l'intérieur de ce module devient IndexedDB plus une file de synchro. Les cinq écrans ne changent pas d'une ligne. Sans elle, découper J2 en deux ne servirait à rien : il faudrait rouvrir chaque écran.

**Deux règles que le module tient.**

`encaisserMise` génère l'identifiant de la mise avec `crypto.randomUUID()` **dès aujourd'hui**. C'est le mécanisme d'idempotence de J2b ; le poser maintenant coûte une ligne et évite une reprise.

Le module refuse localement avant que la base ne refuse, via `peutEncaisser()` de `@kolek/core` — déjà écrit et testé en J1. Une carte clôturée ou complète produit une erreur en quelques millisecondes plutôt qu'un aller-retour réseau. La base reste l'autorité ; le module lui évite des questions dont il connaît la réponse.

### 5.1 Formes de données

```ts
interface Tournee {
  parMarche: Array<{
    marche: string;
    clients: Array<{
      clientId: string; carteId: string; nom: string;
      mise: number; misesEncaissees: number; verseAujourdhui: boolean;
    }>;
  }>;
  visitesAujourdhui: number;
  totalClients: number;
  encaisseAujourdhui: number;
}

interface CarteDetail {
  carte: Carte;                 // type de @kolek/core
  client: { nom: string; telephone: string | null; marche: string | null };
  soldeRestituable: number;     // calculé par @kolek/core, jamais lu en base
  historique: Array<{
    miseId: string; montant: number; encaisseLe: string;
    estCommission: boolean; annulee: boolean; motifAnnulation: string | null;
  }>;
}
```

`verseAujourdhui` se lit dans `mouvements` sur `encaisse_le` du jour. L'index `mises_collecteur_date_idx (collecteur_id, encaisse_le desc)` de J1 sert exactement à ça.

---

## 6. Les écrans

> **Corrigé le 2026-08-16.** Cette section supposait des écrans à dessiner. Ils
> le sont : les six écrans du flow Banani *Kolek Design System* sont
> implémentés, en Tailwind v4 sur le thème engendré depuis `tokens.ts`. Le
> travail de J2a n'est donc plus de les concevoir mais de **les brancher**, plus
> trois écrans que la maquette ne couvre pas.

Tous les jetons visuels viennent de `@kolek/core` par les classes Tailwind. Aucune couleur en dur, aucun or. Composants partagés dans `packages/ui`.

**Ce qui existe et reste à brancher**

| Écran | Fichier | État |
|---|---|---|
| **Tournée** (Accueil) | `apps/collecteur/src/ecrans/Accueil.tsx` | Dessiné, données de démonstration. À brancher sur `mouvements` et la caisse du jour. |
| **Liste clients** | `apps/collecteur/src/ecrans/Clients.tsx` | **Déjà branché** sur `clients` et `cartes`. À enrichir : le badge « En retard » et le filtre « Non visités » attendent la date de dernière mise, que J2a apporte. |
| **Encaissement** | `apps/collecteur/src/ecrans/Encaisser.tsx` | Dessiné, sélection fonctionnelle, bouton de confirmation désactivé. À brancher sur l'insertion de mise. |

**Ce qui reste à dessiner**

**Carte** — les 31 cases en grille (composant `CarteCollecte`, déjà écrit), le solde restituable en Metric XL, l'historique en `LigneTransaction`, un bouton Encaisser en action primaire unique. Les mises annulées apparaissent barrées, avec leur motif.

**Souscription** — nom, téléphone, marché, activité, et le sélecteur de mise en pilules `500 / 1 000 / 2 000 / 5 000 / 10 000` prévu au Design System §4.14.

**Confirmation d'encaissement** — feuille avec le nom du client en grand et le montant. Un appui de plus, qui coûte une demi-seconde et évite l'erreur qu'on vient de rendre réparable. Le geste reste « en un geste » au sens du cahier : ouvrir la fiche, appuyer, confirmer.

**Annulation** — depuis l'historique de la carte. Choix du motif dans la liste, confirmation.

**Deux dettes d'honnêteté à solder.** L'écran Accueil et l'écran Encaisser affichent aujourd'hui les chiffres de la maquette. Tant qu'ils ne sont pas branchés, ils mentent à qui les regarde. Le bouton « Confirmer la mise » est désactivé pour cette raison précise, et le restera jusqu'à ce qu'il écrive vraiment.

---

## 7. Vérification de fin de J2a

Automatisée, exécutable par une commande unique : `npm run verifier`. *(Le renommage depuis `verifier:j1`, prévu ici, a été fait le 2026-08-16 ; la commande enchaîne désormais reconstruction, fraîcheur du thème, tests des trois paquets, tests de base, builds et garde anti-fuite.)*

Point de départ à battre — état au 2026-08-16, sortie 0 : **6 migrations**, 34 tests `@kolek/core`, 9 tests `@kolek/ui`, 8 tests de scripts, **50 tests de base**, soit 101 au total.

1. **Reconstruction complète.** Les migrations s'appliquent sur base vierge, y compris la suppression de `est_commission`.
2. **La carte ne se bloque plus.** Encaisser, annuler, réencaisser : la seconde mise devient la commission, aucune violation d'unicité. C'est le test du défaut de §2.1.
3. **Le compteur suit.** Trois mises, une annulation : `mises_encaissees` vaut 2, et `mouvements` renvoie 2 lignes.
4. **La commission se déplace.** Annuler la première mise fait de la deuxième la commission.
5. **Annulation refusée sur carte clôturée.**
6. **Annulations immuables**, y compris sous clé de service.
7. **Isolation de la vue.** Le collecteur A n'obtient de `mouvements` que ses propres lignes — le test qui accompagne `security_invoker`.
8. **Le jeu de test empoisonné.** Une carte portant une mise annulée entre dans les fixtures standard. Tout calcul écrit sur `mises` seule échoue dès la première exécution, au lieu d'attendre la production.
9. **Aucun écran ne ment.** Plus aucune donnée de démonstration dans `apps/collecteur` : le contrôle est textuel, sur la présence des noms de la maquette (« Kouamé Assi », « Mariam Koné ») hors fichiers de test.

---

## 8. Mises à l'écart assumées

### 8.1 La photo du client

Listée au cahier §5 (M1), reportée. Rien ne s'en sert en J2a : elle ne participe ni au calcul, ni à la tournée, ni au reçu. L'appareil photo et le stockage d'images sur téléphone d'entrée de gamme sont un sujet en soi — compression, quota, coût de synchronisation hors-ligne. À décider quand quelque chose en dépendra.

### 8.2 Une carte complète n'a pas de suite

À 31 mises, la carte attend son retrait, qui arrive en J3. L'écran affiche le badge « Prête à clôturer » du Design System §4.11 plutôt qu'un bouton inerte. Le renouvellement multi-cycles est écarté en Phase 1 par le cahier lui-même.

### 8.3 Les trois écrans d'administration

Dessinés et implémentés, mais alimentés par des données de démonstration jusqu'à J4. Leurs agrégats traversent tous les locataires — solde total géré, commissions du mois, répartition — et RLS interdit à juste titre de les calculer depuis le navigateur. Ils passeront par des Edge Functions, qui ne sont pas du périmètre de J2a.

---

## 9. Points ouverts

| Point | Échéance | Note |
|---|---|---|
| Faut-il borner l'annulation dans le temps ? | Avant J3 | Aujourd'hui sans limite. Une annulation réduit ce que le collecteur doit — le contre-pouvoir est le reçu au client, qui arrive en J3. À reconsidérer quand il existera. |
| Le rattrapage sort-il en J2b ou en J3 ? | Cadrage J2b | La file de reçus rend les deux viables. |
| Le client qui saute longtemps | Avant J4 | Point ouvert du cahier §11. |

---

*Kolek — J2a · spécification validée le 2026-08-16 · prochaine étape : plan d'implémentation.*
