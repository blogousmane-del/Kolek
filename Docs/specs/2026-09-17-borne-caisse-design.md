# Kolek — La borne de la caisse déclarée · Spécification de conception

> 2026-09-17. Un des treize défauts reportés du plan J2b (« La borne `integer` de `cash_declare` (`gestes.ts`) »), chantier **C** au découpage de `2026-09-15-mouvements-registre-design.md` §1.1.
> Décisions prises avec l'exploitant le 2026-09-17, question par question.
> Branche `borne-caisse`, dans le plan de travail isolé `Kolek-caisse`.

---

## 1. Le défaut

### 1.1 Ce que le téléphone laisse passer

Le collecteur déclare sa caisse du jour dans `Rapprochement.tsx`. Le champ est un `type="tel"`, la saisie est lue par `Number.parseInt`, et le garde de l'écran (ligne 61) ne regarde que deux choses :

```ts
const montant = Number.parseInt(saisie.replace(/\s/g, ''), 10);
if (!Number.isInteger(montant) || montant < 0) { … }
```

Le geste qui suit, `construireCaisse` (`gestes.ts:197`), pose exactement le même garde. Ni l'un ni l'autre ne regarde **vers le haut**. Un collecteur qui tape onze chiffres franchit les deux : `99999999999` est un entier, et il est positif.

Côté serveur, `caisses_jour.cash_declare` est un `integer`, borné par `check (cash_declare >= 0)` — une borne **basse seulement**, posée par `20260818010000_socle_storage_et_bornes.sql`. Au-delà de 2 147 483 647, PostgreSQL refuse.

### 1.2 Ce que le serveur répond, mesuré

Contre la pile locale, le 2026-09-17 :

```
HTTP 400
{"code":"22003","details":null,"hint":null,
 "message":"value \"99999999999\" is out of range for type integer"}
```

Et en base, avec `VERBOSITY verbose` : `ERROR: 22003: integer out of range`.

**Aucune branche de `classer` ne connaît 22003.** Le parcours est complet et sans ambiguïté : l'erreur existe donc ce n'est pas `accepte` ; le statut n'est ni 401 ni `PGRST30x` donc pas `session` ; le code n'est ni 23505, ni 23514, ni 23503, ni 42501 ; le message ne porte aucun des cinq `MESSAGES_METIER` ; et 400 n'est ni 0, ni 408, ni 429, ni ≥ 500, donc pas `passager`. Il tombe dans le `return { cas: 'inconnu' }` final.

### 1.3 Ce que ça coûte

`inconnu` est le seul classement qui **arrête la passe**. Dans `synchroniseur.ts`, la comparaison est nette :

| Issue | Ce que fait la passe |
|---|---|
| `refusee` | `continue` — l'opération est consignée, la passe **enchaîne sur la suivante** |
| `inconnue` | `return bilan('attente', prochain)` — la passe **s'arrête**, tout ce qui suit attend |

Les reculs entre essais sont `DELAIS_MS = [30 s, 60 s, 120 s, 300 s, 600 s]` et `TENTATIVES_MAX = 5`. Une caisse hors borne est donc essayée cinq fois, séparées par quatre attentes de 30 + 60 + 120 + 300 secondes : **8 minutes 30 pendant lesquelles rien ne quitte le téléphone** — les mises encaissées derrière elle comprises. Puis elle est consignée avec le motif `INCONNU`, dont la phrase est « Le serveur a répondu cinq fois sans motif reconnu ».

Le collecteur vit donc trois choses, et n'en comprend aucune : ses encaissements cessent de partir pendant huit minutes, sa déclaration de caisse est perdue, et l'application lui dit que le serveur n'a pas donné de motif — alors qu'il en a donné un, très clair, que personne ne lisait.

### 1.4 Comment le défaut a été établi

Par lecture du code pour le chemin, et par **une mesure** pour la réponse du serveur (§1.2) : le dépôt s'interdit de modifier du code sur un souvenir, et « PostgreSQL rend 22003 » était un souvenir tant qu'il n'était pas mesuré. Le reste — l'arrêt de la passe, les reculs, le motif final — se lit directement dans `synchroniseur.ts` et `modele.ts`, sans interprétation.

Ce que la lecture **ne** prouve pas, et que les épreuves du plan prouveront : que la file repart effectivement dès la première passe une fois 22003 classé en refus (§6, épreuve du synchroniseur).

---

## 2. La règle, et où elle vit

Dans `packages/core/src/calcul.ts`, à côté de `MISE_MIN` et `MISE_MAX_RESTITUABLE`.

```ts
/** Ce qu'une colonne `integer` de PostgreSQL porte. */
export const ENTIER_MAX = 2_147_483_647;

export const MISE_MAX_RESTITUABLE = Math.floor(ENTIER_MAX / (MISES_PAR_CYCLE - 1));

export const CAISSE_MAX = ENTIER_MAX;

export function validerCaisse(montant: number): boolean {
  return Number.isInteger(montant) && montant >= 0 && montant <= CAISSE_MAX;
}
```

### 2.1 Pourquoi `core`, et pas le collecteur

Le précédent est déjà là, et il est bon. `MISE_MAX_RESTITUABLE` borne la mise non pas sur la colonne qui la porte mais sur **l'opération qu'elle alimente** : la clôture écrit `(31 − 1) × mise` dans `retraits.montant_restitue`, un `integer`, et sa docstring explique qu'un dépassement y laisserait la carte active définitivement. La règle jumelle appartient au même endroit. Les séparer ferait qu'on en trouve une et pas l'autre.

`core` est par ailleurs le seul paquet, avec `ui`, que la chaîne type réellement — les applications ne le sont qu'à la construction.

### 2.2 Pourquoi `CAISSE_MAX` vaut la borne de la colonne

Contrairement à la mise, la caisse déclarée n'alimente qu'une opération : `ecart`, colonne générée `generated always as (cash_declare - cash_attendu) stored`. Tant que `cash_attendu >= 0` — ce que le serveur calcule à partir des mises, toutes positives — `ecart` ne dépasse jamais `cash_declare`. La borne d'opération et la borne de colonne coïncident donc ici, et il n'y a pas à diviser.

Décision de l'exploitant, prise le 2026-09-17 : **pas de plafond de plausibilité**. Le téléphone refuse exactement ce que la base refuse, ni plus ni moins. Un plafond métier — « un collecteur ne ramasse jamais plus de tant » — attraperait la faute de frappe plus tôt, mais demanderait un chiffre que rien dans le schéma ne justifie, et refuserait un jour exceptionnel légitime.

### 2.3 Nommer `2_147_483_647`

`MISE_MAX_RESTITUABLE` écrit aujourd'hui le nombre en clair dans son calcul. La nouvelle borne l'écrirait une seconde fois. `ENTIER_MAX` le dit une fois, et les deux en dérivent.

**La valeur de `MISE_MAX_RESTITUABLE` ne change pas** : 71 582 788 avant, 71 582 788 après. Une épreuve le verrouille explicitement (§6) — c'est le témoin qui prouve que nommer le nombre n'a rien déplacé.

---

## 3. Les trois consommateurs

| Où | Rôle | Ce qui change |
|---|---|---|
| `Rapprochement.tsx` (~61) | L'écran, sous les yeux du collecteur | Le garde passe par `validerCaisse`, et distingue « trop grand » de « pas un nombre positif » |
| `gestes.ts` `construireCaisse` | Le geste, le filet sous l'écran | Refuse `MONTANT_TROP_GRAND` au-dessus de `CAISSE_MAX` |
| `classer.ts` | La file, pour ce qui est déjà sur le disque | `22003` → `{ cas: 'refus', motif: 'MONTANT_TROP_GRAND' }` |

Les deux premiers empêchent d'en créer de nouvelles. Le troisième traite celles qui existent déjà : **la file vit dans IndexedDB**, et une déclaration hors borne enregistrée avant ce correctif y reste. Sans la branche de `classer`, ces téléphones-là gardent leurs 8 min 30 et leur `INCONNU` — le correctif ne les atteindrait pas.

### 3.1 Le chemin du refus dans `envoyerCaisse`

`envoyerCaisse` appelle `resoudre(c, async () => 'absente')` pour tout classement qui n'est ni `accepte`, ni `mettre_a_jour`, ni le hors-fenêtre. Un `refus` y suit donc la branche `case 'refus'` de `resoudre`, dont la relecture rend `'absente'` sans aller-retour réseau, et sort en `{ issue: 'refusee', motif }`. Aucune requête supplémentaire, aucun chemin nouveau.

### 3.2 Placement de la branche dans `classer`

Avec les autres SQLSTATE, près de `23514`. L'ordre n'a pas d'incidence : `22003` ne collisionne avec aucune autre branche, et la boucle `MESSAGES_METIER` qui la précède cherche des chaînes métier que le message de PostgreSQL ne porte pas.

---

## 4. Le motif, et ses deux phrases

Un motif neuf, `MONTANT_TROP_GRAND`, dans les deux tables de `phrases.ts` :

```ts
// PHRASES — un geste qui échoue sous les yeux du collecteur, au présent
MONTANT_TROP_GRAND: 'Ce montant est trop grand. Vérifie le nombre de chiffres.',

// PHRASES_REFUS — ce qui est arrivé à une opération partie plus tard, sans lui
MONTANT_TROP_GRAND: 'Le serveur a refusé ce montant : il dépassait ce qu’une ligne peut porter.',
```

Les deux tables sont des `Readonly<Record<string, string>>` : ajouter un motif n'élargit aucun type.

### 4.1 Pourquoi pas un motif existant

- `CAISSE_INVALIDE` dit « Le montant déclaré doit être un nombre positif. » Or un nombre trop grand **est** positif. La phrase enverrait le collecteur vérifier ce qui est déjà juste.
- `BORNE_MONTANT` dit « Le serveur refuse ce montant. Choisis un des montants proposés. » C'est une phrase de **mise** — il n'y a aucun montant proposé pour une déclaration de caisse.

Les deux remettraient un écran qui ment, c'est-à-dire le défaut que ce chantier corrige.

### 4.2 Pourquoi un seul motif pour le geste et pour le classificateur

Même cause, deux moments — ce qui est exactement la raison d'être des deux tables, dite en tête de `phrases.ts` : `PHRASES` parle au présent d'un geste qui vient d'échouer, `PHRASES_REFUS` raconte au passé ce qui est arrivé à une opération partie sans le collecteur.

---

## 5. Ce que ce chantier ne fait pas

- **Aucune migration.** La colonne borne déjà, et le refus arrive. Une contrainte `CHECK` explicite ne changerait que le SQLSTATE — `23514` au lieu de `22003` — donc le motif rendu, sans rien protéger de plus. Le déploiement ne porte que le front du collecteur et le paquet `core`.
- **Rien sur `mises`.** `MISE_MAX_RESTITUABLE` les borne déjà, et trente fois plus serré que la colonne.
- **Rien côté administration.** Le droit d'écrire `cash_declare` n'est donné qu'à `authenticated` (`20260817002000_socle_privileges_liste_blanche.sql`), et aucun fichier de `apps/admin` ne nomme la colonne.
- **Aucune écriture, aucun calcul d'argent, aucun format de la base IndexedDB n'est touché.**

---

## 6. Les épreuves

Rouge d'abord chacune : une épreuve qui ne tombe pas avant le correctif ne prouve rien.

| Fichier | Ce qu'elle tient |
|---|---|
| `packages/core/src/calcul.test.ts` | `validerCaisse` à `CAISSE_MAX`, à `CAISSE_MAX + 1`, à 0, à −1, à 1.5 — **et le témoin** : `MISE_MAX_RESTITUABLE === 71_582_788`, écrit en clair, qui prouve que `ENTIER_MAX` n'a rien déplacé |
| `apps/collecteur/src/hors-ligne/classer.test.ts` | `22003` rend `refus/MONTANT_TROP_GRAND`, et **pas** `inconnu` |
| `apps/collecteur/src/hors-ligne/gestes.test.ts` | `construireCaisse` accepte à la borne, refuse au-dessus |
| `apps/collecteur/src/hors-ligne/envoyer.test.ts` | Une insertion de caisse répondant `22003` rend `{ issue: 'refusee', motif: 'MONTANT_TROP_GRAND' }` |
| `apps/collecteur/src/hors-ligne/synchroniseur.test.ts` | **L'épreuve qui compte** : file `[caisse hors borne, mise]`, une seule passe, la mise part. Aujourd'hui elle ne part pas — ce sont les 8 min 30 rendues visibles |
| `apps/collecteur/src/ecrans/Rapprochement.test.tsx` | L'écran montre la phrase, et `declarerCaisse` n'est pas appelée |

Le message mesuré au §1.2 sert de jeu d'essai littéral aux épreuves de `classer` et d'`envoyer` : `{ code: '22003', message: 'value "99999999999" is out of range for type integer' }` avec `status: 400`. Une épreuve écrite sur un message inventé éprouverait l'invention.

---

## 7. Écarts relevés en écrivant cette spécification

1. **Les deux gardes de la caisse étaient déjà en double, et déjà incomplets tous les deux de la même façon.** `Rapprochement.tsx:61` et `gestes.ts:197` posent la même condition, mot pour mot. Ce n'est pas un défaut — l'écran parle vite, le geste protège la file — mais cela veut dire qu'une règle de montant oubliée l'est deux fois. Les faire passer tous deux par `validerCaisse` referme l'écart pour de bon.

2. **`INCONNU` est un motif honnête pour une réponse que le téléphone ne comprend pas, et un mauvais motif pour une réponse qu'il n'a simplement pas lue.** Sa phrase — « Le serveur a répondu cinq fois sans motif reconnu » — était fausse ici : le serveur avait donné un motif parfaitement clair dès le premier essai. Ce chantier corrige un cas ; il ne dit rien des autres SQLSTATE que `classer` ignore encore.

3. **Le gain réel n'est pas la déclaration de caisse sauvée, ce sont les mises qui repartent.** Une déclaration à onze chiffres est une faute de frappe : personne ne perd d'argent à ce qu'elle soit refusée. Ce qui coûtait, c'est que les encaissements derrière elle attendaient 8 min 30 sans que rien ne le dise. C'est pourquoi l'épreuve du synchroniseur est celle qui compte, et non celle de la borne.
