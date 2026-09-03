# Kolek J5 — L'abonnement encaissé en Mobile Money · Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un collecteur de régler son abonnement depuis son téléphone par Mobile Money, et faire du règlement un crédit fiable — idempotent, journalisé, impossible à obtenir sans avoir payé.

**Architecture:** Chariow est un checkout hébergé : une Edge Function crée la vente et rend une URL, le navigateur y va, et trois chemins indépendants — le retour de paiement, le webhook Chariow, l'ouverture de l'application — convergent vers une seule fonction de réconciliation qui relit le statut chez Chariow avant de créditer quoi que ce soit. Le crédit lui-même est une fonction SQL `security definer` : deux écritures qui doivent tenir ensemble, et PostgREST ne sait pas les rendre atomiques. L'idempotence est portée par une contrainte d'unicité en base, jamais par une condition dans du code.

**Tech Stack:** PostgreSQL 15 (Supabase), Edge Functions Deno, `@supabase/supabase-js` v2, TypeScript, Vitest, React 19, Vite.

**Spécification de référence :** `Docs/specs/2026-08-22-j5-abonnement-chariow-design.md`
**Contrat du fournisseur :** `Docs/Chariow.md`

## Mise à jour du 2026-09-02

Ce plan a été écrit le 2026-08-22 et n'a jamais été exécuté. Onze jours de
travail se sont intercalés — les codes promo le 30 août, les collaborateurs du
forfait Illimité le 2 septembre — et trois points du plan ne tiennent plus. Ils
sont corrigés ici, dans le corps des tâches concernées, et résumés une fois :

**Les deux migrations sont renumérotées** en `20260902160000` et
`20260902170000`. Les horodatages d'origine (`20260822…`) sont désormais
antérieurs à trente-quatre migrations déjà appliquées en production : poussées
telles quelles, elles arriveraient hors ordre, ce que `supabase db push`
refuse.

**Un collaborateur ne s'abonne pas** — tâches 5 et 11. Depuis
`20260902100000`, un collecteur peut porter un `titulaire_id`. Il hérite alors
du palier de son titulaire, qui paie pour lui, et `admin_vue_globale` ne compte
pas son abonnement (`titulaire_id is null`, migration `20260902140000`). Lui
vendre un forfait lui ferait payer ce qu'il a déjà. La fonction de checkout le
refuse, et l'écran ne lui est pas proposé.

**La remise interne devient un `discount_code` Chariow** — tâche 5, et une
tâche 14 neuve. Depuis `20260830100000`, un collecteur porte `promo_code`,
`remise_pct` et `remise_fin`, et le chiffre d'affaires compte déjà la remise
en fraction d'abonnement offerte. La documentation Chariow est formelle
(§3.1) : `discount_code` est le **seul** moyen de réduire un prix. Le checkout
envoie donc le code du collecteur, et le même code doit exister à l'identique
dans le tableau de bord Chariow.

C'est une source de vérité dupliquée, et elle porte le risque que l'en-tête de
`packages/core/src/paliers.ts` nomme déjà : « un prix qui diverge entre la page
de vente et l'écran d'administration n'est pas un défaut d'affichage, c'est un
litige commercial ». D'où la tâche 14 : `npm run verifier:promos` compare les
codes internes à ceux de Chariow et échoue sur toute divergence de pourcentage
ou toute absence.

---

## Global Constraints

- **Langue :** interface, libellés et messages d'erreur destinés à l'utilisateur en français. Codes d'erreur techniques en majuscules sans accents (`TELEPHONE_INVALIDE`), destinés au code, traduits une seule fois côté application.
- **Devise :** les montants du produit sont en FCFA entiers. Le montant d'un paiement, lui, vient de Chariow et se stocke en `numeric(12,2)` — voir spec §3.1.
- **Périmètre :** l'abonnement de GTCS, et rien d'autre. Aucun flux d'épargne client ne transite (cahier §169).
- **Clé de service et clé Chariow :** ne doivent apparaître dans aucun artefact d'application. Elles ne vivent que dans l'environnement des Edge Functions et le harnais de tests.
- **Identité :** jamais lue dans le corps d'une requête. Toujours `auth.getUser()` ou `auth.uid()`.
- **Ordre des statuts :** `unpaid` se teste **avant** `paid`. « unpaid » contient « paid ».
- **Jamais `now()`** pour dater un règlement : la date vient du fournisseur, à défaut du `cree_le` du paiement.
- **Immuabilité :** `regle` et `abandonne` sont définitifs, y compris sous la clé de service. `echoue` reste rattrapable quatorze jours.
- **Nommage :** le domaine s'écrit en français. Les modules `_shared` destinés aux tests n'utilisent **aucune API Deno** et **aucun spécificateur `npm:`** — sans quoi Vitest ne peut pas les charger.
- **Commits :** en français, préfixe conventionnel (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).

---

## Écart assumé avec la spécification

La spec §6 prévoyait `libphonenumber-js` pour la validation du téléphone. **Ce plan ne l'utilise pas**, et c'est une décision à valider en revue de la tâche 1.

La raison est une contrainte de double consommation : `_shared/chariow.ts` doit tourner sous Deno *et* être chargé par Vitest. Deno résout les paquets npm par le préfixe `npm:`, que Vitest ne sait pas lire ; Vitest résout les spécificateurs nus, que Deno ne lit pas sans carte d'import. Les deux modules `_shared` déjà couverts par des tests — `cors.ts` et `valider-collecteur.ts` — n'ont pour cette raison aucune dépendance externe.

Le remplacement est une table d'indicatifs explicite, et il coûte quelque chose de nommable : **un numéro d'un pays absent de la table, envoyé sans `paysTelephone`, est refusé** au lieu d'être déduit. Le formulaire envoie toujours le pays, donc le cas ne se produit que sur un appel forgé. La contrepartie est un module sans dépendance, testé par la suite du dépôt, et un paquet d'application qui ne grossit pas de 145 ko sur un téléphone en 3G.

---

## Structure de fichiers

| Fichier | Responsabilité |
|---|---|
| `supabase/functions/_shared/chariow.ts` | **Créer.** Contrat Chariow, sans API Deno : correspondance des statuts, résolution du téléphone, contrôle de montant, lecture des identifiants de produit, comparaison de secret en temps constant. |
| `supabase/functions/_shared/reconciliation.ts` | **Créer.** Le cœur du fulfilment : relit une vente chez Chariow, juge, appelle `crediter_abonnement`. Appelé par les trois chemins. |
| `supabase/functions/abonnement-payer/index.ts` | **Créer.** Crée la vente, rend `checkoutUrl`. |
| `supabase/functions/abonnement-verifier/index.ts` | **Créer.** Réconcilie les paiements de l'appelant. |
| `supabase/functions/chariow-webhook/index.ts` | **Créer.** Point d'entrée public, secret en URL, ne crédite rien lui-même. |
| `supabase/migrations/20260902160000_abonnements_paiements.sql` | **Créer.** Table, RLS, privilèges, immuabilité, journal, `crediter_abonnement`, garde-fous. |
| `supabase/migrations/20260902170000_admin_paiements.sql` | **Créer.** `admin_paiements_recents()` pour l'administration. |
| `supabase/config.toml` | **Modifier.** Première section `[functions]` : `verify_jwt = false` sur le seul webhook. |
| `supabase/functions/admin-supprimer-collecteur/index.ts:152-177` | **Modifier.** Compter les paiements avant de supprimer. |
| `supabase/functions/admin-vue-globale/index.ts:146-173` | **Modifier.** Joindre le bloc `paiements` à la réponse. |
| `scripts/verifier-bundles.mjs:7-17` | **Modifier.** Deux motifs de fuite propres à Chariow. |
| `packages/ui/src/ChampTelephone.tsx` | **Créer.** Sélecteur de pays + numéro local. |
| `apps/collecteur/src/abonnement.ts` | **Créer.** Les deux appels d'Edge Function et la traduction des codes d'erreur. |
| `apps/collecteur/src/ecrans/Abonnement.tsx` | **Créer.** Choix du palier, saisie du téléphone, départ vers Chariow. |
| `apps/collecteur/src/ecrans/RetourPaiement.tsx` | **Créer.** Sondage du retour, trois états. |
| `apps/collecteur/src/ecrans/Plus.tsx` | **Modifier.** Bloc « Renouveler mon abonnement », en-tête à corriger. |
| `apps/collecteur/src/Coquille.tsx` | **Modifier.** Écran de retour, paramètre d'URL, réconciliation à l'ouverture. |
| `apps/admin/src/donnees.ts` | **Modifier.** Type du bloc `paiements`. |
| `apps/admin/src/ecrans/Abonnements.tsx` | **Modifier.** Colonne « dernier paiement ». |
| `Docs/deploiement.md` | **Modifier.** Secrets, URL du webhook, déploiement sans vérification de jeton. |

Tests : `supabase/tests/chariow.test.ts` (pur), `supabase/tests/reconciliation.test.ts` (pur, `fetch` injecté), `supabase/tests/abonnement.test.ts` (base locale), `scripts/verifier-bundles.test.mjs` (modifier), `packages/ui/src/ChampTelephone.test.tsx`.

---

## Amendement du 2026-09-02 — payer vaut accord

Décision de l'exploitant, prise après la tâche 2 : **le paiement se fait au
moment de la demande d'ouverture, et il tient lieu d'accord.** Le compte naît
tout seul quand la réconciliation confirme le règlement ; plus d'étape humaine
entre le formulaire et le premier client encaissé.

Ce que cela change, et ce que cela coûte, écrit une fois ici plutôt que dispersé
dans les tâches.

### Le paiement précède le compte

`paiements_abonnement.collecteur_id` est `not null` et référence
`collecteurs`. Un prospect n'a pas de ligne. La migration
`20260902160000` est donc reprise : `collecteur_id` devient nullable, une
colonne `demande_id` la double, et une contrainte impose **exactement l'un des
deux**. Un paiement appartient à un compte ou à une demande, jamais aux deux,
jamais à aucun.

La migration n'est ni déployée ni poussée : elle se corrige sur place plutôt que
par une migration de rattrapage. Une migration de correction qui suit sa propre
migration de la veille est une dette qu'on lit six mois plus tard sans
comprendre pourquoi deux fichiers disent la même chose.

### Le compte naît de la réconciliation, pas d'un administrateur

Quand un paiement rattaché à une demande passe à `regle`, la même transaction
crée le compte et bascule la demande en `ouverte`. C'est `crediter_abonnement`
qui le fait, parce que c'est déjà elle qui fait tenir ensemble les deux écritures
que PostgREST ne sait pas rendre atomiques — et un état partiel signifierait ici
quelqu'un qui a payé et qui n'a pas de compte.

Le compte `auth.users` ne se crée pas en SQL : c'est l'Edge Function de
réconciliation qui appelle `auth.admin.createUser`, puis `crediter_abonnement`.
L'ordre importe — un compte sans abonnement se répare, un abonnement sans compte
ne se rattache à rien.

### Le mot de passe est choisi au formulaire

Le prospect n'a pas d'administrateur pour lui remettre des identifiants. Il
choisit donc son mot de passe dans le formulaire, **avant de payer**, et il est
validé là : `validerCollecteur` pour la forme, `verifierFuite` pour les fuites
connues. Refuser un mot de passe après l'encaissement serait le pire moment
possible.

Conséquence : **l'adresse électronique devient obligatoire** pour une demande
payante. Elle est facultative aujourd'hui (`demandes_ouverture.email` est
nullable) et le reste pour une demande d'essai.

### L'essai ne change pas

`essai` vaut zéro franc : il n'y a rien à encaisser. Une demande d'essai suit
le chemin d'aujourd'hui — elle attend un accord humain. Seuls les paliers
payants se règlent au formulaire. C'est aussi ce qui garde une porte d'entrée
pour qui n'a pas de moyen de paiement en ligne.

### Ce que GTCS perd, et ce qui le remplace

L'examen préalable. Un compte payant se crée désormais sans qu'un humain l'ait
regardé. `refusee` demeure, pour la fraude uniquement, et son coût est réel :
le remboursement est un geste manuel dans le tableau de bord Chariow, sans API.
À écrire dans `Docs/deploiement.md` §6 plutôt qu'à découvrir le jour où le cas
se présente.

Les garde-fous qui restent : l'unicité du téléphone sur les demandes en attente,
l'unicité de l'adresse en base d'authentification, le contrôle de mot de passe
divulgué, et la borne d'abus par empreinte de requête — cette dernière est ici
correctement clavetée sur l'adresse IP, puisque l'appelant est anonyme, à
l'inverse de `collecteur-creer-collaborateur` où elle a été corrigée ce matin.

### Les tâches touchées

| Tâche | Ce qui change |
|---|---|
| 2 | `collecteur_id` nullable, `demande_id` ajoutée, contrainte d'exclusivité, et `crediter_abonnement` sait basculer une demande |
| 5 | `abonnement-payer` reste pour le renouvellement ; `demander-ouverture` reçoit son propre chemin de checkout |
| 6 | le webhook et la réconciliation créent le compte avant de créditer |
| 11 | l'écran de demande d'ouverture du site vitrine gagne le choix du palier, le mot de passe et le départ vers Chariow |

---

## Task 1: Le contrat Chariow, sans dépendance

**Files:**
- Create: `supabase/functions/_shared/chariow.ts`
- Test: `supabase/tests/chariow.test.ts`

**Interfaces:**
- Consumes: `TARIFS` depuis `supabase/functions/_shared/paliers.ts` (fichier engendré, ne pas modifier à la main).
- Produces: `mapperStatut(brut: unknown): StatutPaiement` · `montantCoherent(distant: number, stocke: number): boolean` · `resoudreTelephone(saisie: SaisieTelephone): TelephoneChariow | null` · `lireProduits(brut: string | undefined | null): Record<string, string>` · `secretValide(recu: string | null, attendu: string): Promise<boolean>` · types `StatutPaiement`, `SaisieTelephone`, `TelephoneChariow`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `supabase/tests/chariow.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import {
  lireProduits,
  mapperStatut,
  montantCoherent,
  resoudreTelephone,
  secretValide,
} from '../functions/_shared/chariow';

/**
 * Ce fichier existe pour un piège précis, documenté dans `Docs/Chariow.md` §3.3 :
 * **« unpaid » contient « paid »**. Une correspondance de statuts qui teste les
 * succès avant les attentes crédite une vente non payée. Le premier test
 * ci-dessous est le seul qui compte vraiment.
 */

describe('mapperStatut', () => {
  it('rend « en attente » pour unpaid — avant tout test de succès', () => {
    expect(mapperStatut('unpaid')).toBe('en_attente');
    expect(mapperStatut('UNPAID')).toBe('en_attente');
  });

  it('reconnaît settled comme un paiement', () => {
    expect(mapperStatut('settled')).toBe('regle');
    expect(mapperStatut('settle')).toBe('regle');
    expect(mapperStatut('completed')).toBe('regle');
    expect(mapperStatut('paid')).toBe('regle');
    expect(mapperStatut('success')).toBe('regle');
  });

  it('sépare les échecs des abandons', () => {
    expect(mapperStatut('failed')).toBe('echoue');
    expect(mapperStatut('error')).toBe('echoue');
    expect(mapperStatut('cancelled')).toBe('abandonne');
    expect(mapperStatut('refunded')).toBe('abandonne');
    expect(mapperStatut('expired')).toBe('abandonne');
  });

  it('range l’inconnu en attente plutôt qu’en succès', () => {
    expect(mapperStatut('quelque_chose')).toBe('en_attente');
    expect(mapperStatut(null)).toBe('en_attente');
    expect(mapperStatut(42)).toBe('en_attente');
  });
});

describe('montantCoherent', () => {
  it('accepte l’écart nul et les écarts sous 5 %', () => {
    expect(montantCoherent(5000, 5000)).toBe(true);
    expect(montantCoherent(5200, 5000)).toBe(true);
  });

  it('refuse au-delà de la tolérance', () => {
    expect(montantCoherent(5300, 5000)).toBe(false);
    expect(montantCoherent(0, 5000)).toBe(false);
  });

  it('refuse ce qui n’est pas un nombre utilisable', () => {
    expect(montantCoherent(Number.NaN, 5000)).toBe(false);
    expect(montantCoherent(-1, 5000)).toBe(false);
  });
});

describe('resoudreTelephone', () => {
  it('retire le zéro national quand le pays est donné', () => {
    expect(
      resoudreTelephone({ paysTelephone: 'CI', telephoneLocal: '0700000000' }),
    ).toEqual({ number: '700000000', country_code: 'CI' });
  });

  it('déduit le pays d’un E.164 ivoirien sans pays fourni', () => {
    expect(resoudreTelephone({ telephone: '+225700000000' })).toEqual({
      number: '700000000',
      country_code: 'CI',
    });
  });

  it('accepte la forme 00 en tête', () => {
    expect(resoudreTelephone({ telephone: '00221771234567' })).toEqual({
      number: '771234567',
      country_code: 'SN',
    });
  });

  it('refuse un numéro français sans pays plutôt que de partir sans', () => {
    expect(resoudreTelephone({ telephone: '+33763627155' })).toBeNull();
  });

  it('accepte ce même numéro dès que le pays accompagne le local', () => {
    expect(
      resoudreTelephone({ paysTelephone: 'FR', telephoneLocal: '0763627155' }),
    ).toEqual({ number: '763627155', country_code: 'FR' });
  });

  it('refuse une saisie vide', () => {
    expect(resoudreTelephone({})).toBeNull();
    expect(resoudreTelephone({ paysTelephone: 'CI', telephoneLocal: '12' })).toBeNull();
  });
});

describe('lireProduits', () => {
  it('accepte les trois paliers payants', () => {
    const brut = '{"standard":"prod_a","pro":"prod_b","illimite":"prod_c"}';
    expect(lireProduits(brut)).toEqual({
      standard: 'prod_a',
      pro: 'prod_b',
      illimite: 'prod_c',
    });
  });

  it('lève si un palier payant manque', () => {
    expect(() => lireProduits('{"standard":"prod_a","pro":"prod_b"}')).toThrow(/illimite/);
  });

  it('lève si un palier gratuit y figure — on ne vend pas zéro franc', () => {
    const brut = '{"essai":"prod_z","standard":"a","pro":"b","illimite":"c"}';
    expect(() => lireProduits(brut)).toThrow(/essai/);
  });

  it('lève sur du JSON illisible ou absent', () => {
    expect(() => lireProduits('pas du json')).toThrow();
    expect(() => lireProduits(undefined)).toThrow();
  });
});

describe('secretValide', () => {
  it('accepte le secret exact', async () => {
    expect(await secretValide('s3cr3t', 's3cr3t')).toBe(true);
  });

  it('refuse un préfixe correct de même longueur', async () => {
    expect(await secretValide('s3cr3T', 's3cr3t')).toBe(false);
  });

  it('refuse une longueur différente, un secret vide, un secret absent', async () => {
    expect(await secretValide('s3cr3', 's3cr3t')).toBe(false);
    expect(await secretValide(null, 's3cr3t')).toBe(false);
    expect(await secretValide('s3cr3t', '')).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/chariow.test.ts`
Expected: FAIL — `Failed to resolve import "../functions/_shared/chariow"`.

- [ ] **Step 3: Écrire le module**

Créer `supabase/functions/_shared/chariow.ts` :

```ts
import { TARIFS } from './paliers.ts';

/**
 * Le contrat Chariow, réduit à ce que Kolek en utilise.
 *
 * Module sans aucune API Deno et **sans aucun spécificateur `npm:`**, pour la
 * même raison que `cors.ts` et `valider-collecteur.ts` : ce qui n'est pas
 * testable finit par être faux, et Vitest ne sait pas résoudre `npm:`. C'est
 * aussi ce qui explique l'absence de `libphonenumber` — voir la note d'écart en
 * tête du plan d'implémentation.
 */

export type StatutPaiement = 'en_attente' | 'regle' | 'echoue' | 'abandonne';

/**
 * L'ordre des tests **est** la règle, et il n'est pas négociable.
 *
 * `Docs/Chariow.md` §3.3 : « unpaid » contient « paid ». Tester les succès
 * d'abord créditerait une vente non payée. Et `settled` — « réglé, fonds
 * encaissés » — est un paiement : l'oublier a déjà coûté une vente jamais
 * créditée chez l'auteur du fournisseur.
 *
 * Tout ce qui n'est pas reconnu retombe en attente, jamais en succès. Un
 * statut qu'on ne comprend pas n'est pas une preuve de paiement.
 */
export function mapperStatut(brut: unknown): StatutPaiement {
  const valeur = typeof brut === 'string' ? brut.trim().toLowerCase() : '';
  if (!valeur) return 'en_attente';

  if (valeur.includes('unpaid') || valeur.includes('pending') || valeur.includes('await')) {
    return 'en_attente';
  }
  if (valeur.includes('fail') || valeur.includes('error') || valeur.includes('declin')) {
    return 'echoue';
  }
  if (
    valeur.includes('cancel') ||
    valeur.includes('abandon') ||
    valeur.includes('refund') ||
    valeur.includes('expire')
  ) {
    return 'abandonne';
  }
  if (
    valeur.includes('settle') ||
    valeur.includes('complete') ||
    valeur.includes('paid') ||
    valeur.includes('success')
  ) {
    return 'regle';
  }
  return 'en_attente';
}

/** Tolérance du contrôle anti-fraude sur les montants. */
export const TOLERANCE_MONTANT = 0.05;

/**
 * Le montant relu chez Chariow est-il celui qu'on a enregistré à la création ?
 *
 * Un écart signale une boutique dont le prix a bougé entre la création de la
 * vente et son règlement, ou un identifiant de vente qui ne désigne pas ce
 * qu'on croit. Dans les deux cas on ne crédite pas — on journalise.
 */
export function montantCoherent(distant: number, stocke: number): boolean {
  if (!Number.isFinite(distant) || !Number.isFinite(stocke)) return false;
  if (distant < 0 || stocke < 0) return false;
  if (stocke === 0) return distant === 0;
  return Math.abs(distant - stocke) / stocke <= TOLERANCE_MONTANT;
}

export interface SaisieTelephone {
  /** E.164 complet, tel que le formulaire l'a composé. */
  telephone?: unknown;
  /** ISO2 du sélecteur de pays. */
  paysTelephone?: unknown;
  /** Numéro national, tel que saisi — le zéro de tête est admis. */
  telephoneLocal?: unknown;
}

/** Ce que Chariow exige : un numéro national et un pays ISO2. Jamais un E.164. */
export interface TelephoneChariow {
  number: string;
  country_code: string;
}

/**
 * Les indicatifs que le repli sait reconnaître.
 *
 * Volontairement limité à l'Afrique de l'Ouest et centrale, plus le Maghreb :
 * c'est le marché du produit. Un pays absent d'ici reste joignable — il suffit
 * que le formulaire envoie `paysTelephone`, ce qu'il fait toujours. Cette table
 * ne sert qu'au cas où il ne l'aurait pas fait.
 */
const INDICATIFS: ReadonlyArray<readonly [string, string]> = [
  ['225', 'CI'], ['221', 'SN'], ['229', 'BJ'], ['228', 'TG'], ['226', 'BF'],
  ['223', 'ML'], ['227', 'NE'], ['245', 'GW'], ['224', 'GN'], ['238', 'CV'],
  ['237', 'CM'], ['241', 'GA'], ['242', 'CG'], ['243', 'CD'], ['235', 'TD'],
  ['236', 'CF'], ['240', 'GQ'], ['233', 'GH'], ['234', 'NG'], ['261', 'MG'],
  ['212', 'MA'], ['216', 'TN'], ['213', 'DZ'],
];

const LONGUEUR_MIN = 6;
const LONGUEUR_MAX = 15;

function chiffres(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\D/g, '') : '';
}

function iso2(v: unknown): string {
  if (typeof v !== 'string') return '';
  const nettoye = v.trim();
  return /^[A-Za-z]{2}$/.test(nettoye) ? nettoye.toUpperCase() : '';
}

/** Le zéro national de tête ne fait pas partie du numéro pour Chariow. */
function sansZeroDeTete(national: string): string {
  return national.replace(/^0+/, '');
}

function utilisable(national: string): boolean {
  return national.length >= LONGUEUR_MIN && national.length <= LONGUEUR_MAX;
}

/** Découpe un E.164 sur les indicatifs connus. Rend `null` si aucun ne colle. */
export function decouperIndicatif(brut: string): TelephoneChariow | null {
  const n = brut.replace(/^00/, '');
  for (const [indicatif, code] of INDICATIFS) {
    if (!n.startsWith(indicatif)) continue;
    const national = sansZeroDeTete(n.slice(indicatif.length));
    if (utilisable(national)) return { number: national, country_code: code };
  }
  return null;
}

/**
 * Trois tentatives, la première qui valide gagne.
 *
 * Rendre `null` plutôt que de deviner : un numéro envoyé sans pays à Chariow
 * revient en `400 Invalid phone number`, après que la requête est partie. Mieux
 * vaut refuser ici, avant tout appel sortant.
 */
export function resoudreTelephone(saisie: SaisieTelephone): TelephoneChariow | null {
  const pays = iso2(saisie.paysTelephone);
  const local = sansZeroDeTete(chiffres(saisie.telephoneLocal));
  const complet = chiffres(saisie.telephone);

  // 1. Le cas normal : le formulaire a envoyé les deux.
  if (pays && utilisable(local)) return { number: local, country_code: pays };

  // 2. Un E.164 seul, dont on sait reconnaître l'indicatif.
  const decoupe = decouperIndicatif(complet);
  if (decoupe) return decoupe;

  // 3. Un pays, et des chiffres dont on ne sait pas s'ils portent l'indicatif.
  if (pays) {
    const brut = sansZeroDeTete(complet);
    if (utilisable(brut)) return { number: brut, country_code: pays };
  }

  return null;
}

/** Les paliers qui ont un prix, donc un produit dans la boutique Chariow. */
export const PALIERS_PAYANTS: readonly string[] = TARIFS.filter((t) => t.prix > 0).map(
  (t) => t.cle,
);

/**
 * Lit `CHARIOW_PRODUITS`, et lève si la correspondance n'est pas exacte.
 *
 * Lever au démarrage plutôt que rendre un objet incomplet : un identifiant
 * manquant ne se verrait qu'au premier collecteur qui choisit ce palier-là,
 * c'est-à-dire au pire moment.
 */
export function lireProduits(brut: string | undefined | null): Record<string, string> {
  if (!brut) throw new Error('CHARIOW_PRODUITS absent');

  let lu: unknown;
  try {
    lu = JSON.parse(brut);
  } catch {
    throw new Error('CHARIOW_PRODUITS illisible');
  }
  if (!lu || typeof lu !== 'object' || Array.isArray(lu)) {
    throw new Error('CHARIOW_PRODUITS illisible');
  }

  const table = lu as Record<string, unknown>;

  for (const cle of Object.keys(table)) {
    if (!PALIERS_PAYANTS.includes(cle)) {
      throw new Error(`CHARIOW_PRODUITS nomme un palier qui ne se vend pas : ${cle}`);
    }
  }

  const produits: Record<string, string> = {};
  for (const cle of PALIERS_PAYANTS) {
    const valeur = table[cle];
    if (typeof valeur !== 'string' || !valeur.trim()) {
      throw new Error(`CHARIOW_PRODUITS ne nomme pas de produit pour : ${cle}`);
    }
    produits[cle] = valeur.trim();
  }
  return produits;
}

/**
 * Comparaison de secret à temps constant.
 *
 * Une comparaison de chaînes JavaScript s'arrête au premier caractère différent
 * et fuit donc la longueur du préfixe correct — de quoi reconstituer un secret
 * caractère par caractère. On compare les empreintes, de longueur fixe, en
 * accumulant les écarts sans jamais sortir de la boucle.
 */
export async function secretValide(recu: string | null, attendu: string): Promise<boolean> {
  if (!attendu) return false;

  const encodeur = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encodeur.encode(recu ?? '')),
    crypto.subtle.digest('SHA-256', encodeur.encode(attendu)),
  ]);

  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  let ecart = 0;
  for (let i = 0; i < ua.length; i += 1) ecart |= (ua[i] as number) ^ (ub[i] as number);
  return ecart === 0;
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/chariow.test.ts`
Expected: PASS — 20 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/chariow.ts supabase/tests/chariow.test.ts
git commit -m "feat(abonnement): le contrat Chariow, et le piège de « unpaid »"
```

---

## Task 2: Le registre des paiements et la fonction de crédit

**Files:**
- Create: `supabase/migrations/20260902160000_abonnements_paiements.sql`
- Test: `supabase/tests/abonnement.test.ts`

**Interfaces:**
- Consumes: `public.journaliser()` et `public.collecteurs` du socle ; le harnais `supabase/tests/harnais.ts` (`admin`, `anonyme`, `creerCollecteur`, `nettoyer`).
- Produces: table `public.paiements_abonnement` · fonction `public.crediter_abonnement(p_paiement uuid, p_regle_le timestamptz, p_montant numeric, p_devise text) returns table (credite boolean, echeance date)`, exécutable par `service_role` seul.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `supabase/tests/abonnement.test.ts` :

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, anonyme, creerCollecteur, nettoyer, type CollecteurTest } from './harnais';

/**
 * Le registre des paiements d'abonnement.
 *
 * Ce que ces tests protègent tient en une phrase : **un abonnement ne
 * s'obtient qu'en payant, et un paiement ne se crédite qu'une fois.** Le reste
 * — l'isolation, l'immuabilité — est le socle habituel du dépôt, appliqué à une
 * table qui porte de l'argent.
 */

let alice: CollecteurTest;
let bob: CollecteurTest;

/** Insère un paiement en attente, à la clé de service. */
async function poserPaiement(collecteurId: string, venteId: string, montant = 5000) {
  const { data, error } = await admin
    .from('paiements_abonnement')
    .insert({
      collecteur_id: collecteurId,
      palier: 'pro',
      vente_id: venteId,
      montant,
      devise: 'XOF',
      echeance_avant: '2026-01-01',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

beforeAll(async () => {
  alice = await creerCollecteur('Alice Paiement', `+225070000${Date.now() % 1000}`);
  bob = await creerCollecteur('Bob Paiement', `+225070001${Date.now() % 1000}`);
});

afterAll(async () => {
  await nettoyer();
});

describe('isolation', () => {
  it('un collecteur ne voit que ses propres paiements', async () => {
    await poserPaiement(alice.id, `vente-iso-${crypto.randomUUID()}`);

    const mien = await alice.client.from('paiements_abonnement').select('id');
    const autre = await bob.client.from('paiements_abonnement').select('id');

    expect(mien.error).toBeNull();
    expect(mien.data?.length).toBeGreaterThan(0);
    // Invisible, pas refusé : distinguer les deux dirait à Bob que la ligne existe.
    expect(autre.error).toBeNull();
    expect(autre.data).toEqual([]);
  });

  it('le rôle anonyme ne lit rien', async () => {
    const { error } = await anonyme.from('paiements_abonnement').select('id');
    expect(error).not.toBeNull();
  });

  it('un collecteur ne peut pas écrire son propre paiement', async () => {
    const { error } = await alice.client.from('paiements_abonnement').insert({
      collecteur_id: alice.id,
      palier: 'pro',
      vente_id: 'forge',
      montant: 5000,
      devise: 'XOF',
      echeance_avant: '2026-01-01',
    });
    expect(error).not.toBeNull();
  });
});

describe('immuabilité', () => {
  it('refuse la suppression, même à la clé de service', async () => {
    const id = await poserPaiement(alice.id, `vente-del-${crypto.randomUUID()}`);
    const { error } = await admin.from('paiements_abonnement').delete().eq('id', id);
    expect(error?.message).toContain('PAIEMENT_IMMUABLE');
  });

  it('refuse de rouvrir un paiement réglé', async () => {
    const id = await poserPaiement(alice.id, `vente-fig-${crypto.randomUUID()}`);
    await admin.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });

    const { error } = await admin
      .from('paiements_abonnement')
      .update({ statut: 'echoue' })
      .eq('id', id);
    expect(error?.message).toContain('PAIEMENT_TERMINAL');
  });

  it('autorise en revanche echoue → regle : c’est la fenêtre de rattrapage', async () => {
    const id = await poserPaiement(alice.id, `vente-ratt-${crypto.randomUUID()}`);
    await admin.from('paiements_abonnement').update({ statut: 'echoue' }).eq('id', id);

    const { data, error } = await admin.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });
    expect(error).toBeNull();
    expect(data?.[0]?.credite).toBe(true);
  });

  it('refuse de changer le collecteur pendant la transition', async () => {
    const id = await poserPaiement(alice.id, `vente-vol-${crypto.randomUUID()}`);
    const { error } = await admin
      .from('paiements_abonnement')
      .update({ collecteur_id: bob.id })
      .eq('id', id);
    expect(error?.message).toContain('PAIEMENT_IDENTITE_FIGEE');
  });
});

describe('crediter_abonnement', () => {
  it('crédite une fois, et une seule', async () => {
    const id = await poserPaiement(bob.id, `vente-idem-${crypto.randomUUID()}`);

    const premier = await admin.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });
    const second = await admin.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });

    expect(premier.data?.[0]?.credite).toBe(true);
    expect(second.data?.[0]?.credite).toBe(false);

    const { data } = await admin
      .from('collecteurs')
      .select('palier, abonnement_statut, abonnement_echeance')
      .eq('id', bob.id)
      .single();
    expect(data?.palier).toBe('pro');
    expect(data?.abonnement_statut).toBe('actif');
    // L'échéance du second appel doit être la même que celle du premier.
    expect(data?.abonnement_echeance).toBe(premier.data?.[0]?.echeance);
  });

  it('repart d’aujourd’hui quand l’échéance est passée', async () => {
    const retardataire = await creerCollecteur('Retard', `+225070002${Date.now() % 1000}`);
    await admin
      .from('collecteurs')
      .update({ abonnement_echeance: '2020-01-01' })
      .eq('id', retardataire.id);

    const id = await poserPaiement(retardataire.id, `vente-retard-${crypto.randomUUID()}`);
    const { data } = await admin.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });

    const attendu = new Date();
    attendu.setUTCDate(attendu.getUTCDate() + 30);
    // Sans le `greatest`, il aurait acheté du passé : 2020-01-31.
    expect(data?.[0]?.echeance).toBe(attendu.toISOString().slice(0, 10));
  });

  it('prolonge à partir de l’échéance quand elle est à venir', async () => {
    const enAvance = await creerCollecteur('Avance', `+225070003${Date.now() % 1000}`);
    await admin
      .from('collecteurs')
      .update({ abonnement_echeance: '2099-01-01' })
      .eq('id', enAvance.id);

    const id = await poserPaiement(enAvance.id, `vente-avance-${crypto.randomUUID()}`);
    const { data } = await admin.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });
    expect(data?.[0]?.echeance).toBe('2099-01-31');
  });

  it('n’est pas exécutable par un collecteur', async () => {
    const id = await poserPaiement(alice.id, `vente-priv-${crypto.randomUUID()}`);
    const { error } = await alice.client.rpc('crediter_abonnement', {
      p_paiement: id,
      p_regle_le: '2026-08-22T10:00:00Z',
      p_montant: 5000,
      p_devise: 'XOF',
    });
    expect(error).not.toBeNull();
  });
});

describe('contraintes', () => {
  it('refuse deux paiements pour la même vente', async () => {
    const vente = `vente-double-${crypto.randomUUID()}`;
    await poserPaiement(alice.id, vente);
    const { error } = await admin.from('paiements_abonnement').insert({
      collecteur_id: alice.id,
      palier: 'pro',
      vente_id: vente,
      montant: 5000,
      devise: 'XOF',
      echeance_avant: '2026-01-01',
    });
    expect(error?.code).toBe('23505');
  });

  it('refuse un palier qui ne se vend pas', async () => {
    const { error } = await admin.from('paiements_abonnement').insert({
      collecteur_id: alice.id,
      palier: 'essai',
      vente_id: `vente-essai-${crypto.randomUUID()}`,
      montant: 0,
      devise: 'XOF',
      echeance_avant: '2026-01-01',
    });
    expect(error?.code).toBe('23514');
  });

  it('journalise chaque écriture', async () => {
    const vente = `vente-journal-${crypto.randomUUID()}`;
    await poserPaiement(alice.id, vente);

    const { data } = await admin
      .from('audit_log')
      .select('table_cible, action')
      .eq('collecteur_id', alice.id)
      .eq('table_cible', 'paiements_abonnement');
    expect(data?.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/abonnement.test.ts`
Expected: FAIL — `relation "public.paiements_abonnement" does not exist`.

- [ ] **Step 3: Écrire la migration**

Créer `supabase/migrations/20260902160000_abonnements_paiements.sql` :

```sql
-- Kolek — J5 : le registre des paiements d'abonnement
--
-- Réf. Docs/specs/2026-08-22-j5-abonnement-chariow-design.md §3 et §4.
--
-- La base sait porter un abonnement depuis J1 — `palier`, `abonnement_statut`,
-- `abonnement_echeance` vivent sur la ligne du collecteur. Ce qu'elle ne sait
-- pas faire, c'est garder la trace de ce qui l'a payé. Cette migration ajoute ce
-- registre, et la seule fonction autorisée à le transformer en abonnement.

create table public.paiements_abonnement (
  id             uuid primary key default gen_random_uuid(),
  -- `restrict`, comme `mises` : on ne fait pas disparaître un encaissement en
  -- supprimant un compte. `admin-supprimer-collecteur` compte cette table avant
  -- de supprimer, pour nommer ce qui bloque plutôt que de laisser remonter une
  -- violation de clé étrangère que personne ne sait lire.
  collecteur_id  uuid not null references public.collecteurs(id) on delete restrict,
  palier         text not null check (palier in ('standard','pro','illimite')),
  statut         text not null default 'en_attente'
                   check (statut in ('en_attente','regle','echoue','abandonne')),
  -- Contrainte à une seule valeur aujourd'hui. Elle porte la clé d'unicité : le
  -- jour où un second encaisseur apparaît, deux ventes peuvent partager un
  -- identifiant sans collision, et cette ligne tombe seule.
  fournisseur    text not null default 'chariow' check (fournisseur = 'chariow'),
  vente_id       text not null check (length(vente_id) between 1 and 128),
  -- `numeric` et non `integer` comme partout ailleurs : ce montant vient de la
  -- boutique, pas de nous. Une boutique en euros rendrait `9.99`, qu'un entier
  -- tronquerait en `9` — un écart de montant fabriqué par le stockage, que le
  -- contrôle anti-fraude signalerait ensuite comme une anomalie.
  montant        numeric(12,2) not null check (montant >= 0),
  -- Jamais figée à 'XOF'. Piège n°2 de Docs/Chariow.md, et un incident réel.
  devise         text not null check (devise ~ '^[A-Z]{3}$'),
  -- La remise appliquée au moment de l'achat, en points de pourcentage. Elle
  -- est ici et non déduite de `collecteurs.remise_pct` parce qu'une remise
  -- expire : six mois plus tard, la fiche du collecteur ne dira plus ce qui a
  -- été accordé ce jour-là, et le contrôle de grille accuserait la boutique
  -- d'avoir débité un mauvais montant.
  remise_pct     smallint not null default 0 check (remise_pct between 0 and 100),
  echeance_avant date not null,
  echeance_apres date,
  regle_le       timestamptz,
  cree_le        timestamptz not null default now(),
  constraint paiements_vente_unique unique (fournisseur, vente_id),
  -- Un paiement réglé sans date ni échéance posée est une ligne à moitié
  -- écrite. On refuse l'état intermédiaire plutôt qu'un rapport le rencontre
  -- six mois plus tard.
  constraint paiements_regle_coherent
    check ((statut = 'regle') = (regle_le is not null and echeance_apres is not null))
);

comment on table public.paiements_abonnement is
  'Registre des règlements d''abonnement. Append-only : seul le passage d''un état non terminal à un état terminal est permis.';

create index paiements_collecteur_idx
  on public.paiements_abonnement(collecteur_id, cree_le desc);
create index paiements_en_attente_idx
  on public.paiements_abonnement(statut) where statut = 'en_attente';

-- ---------------------------------------------------------------------------
-- Row Level Security — lecture seule, sur ses propres lignes
-- ---------------------------------------------------------------------------
-- Aucune politique d'écriture : l'insertion devient inexprimable via l'API,
-- quel que soit l'appelant authentifié.
alter table public.paiements_abonnement enable row level security;

create policy paiements_select on public.paiements_abonnement
  for select using (collecteur_id = (select auth.uid()));

grant select on public.paiements_abonnement to authenticated;

-- ---------------------------------------------------------------------------
-- Immuabilité — le garde-fou qui vaut aussi pour la clé de service
-- ---------------------------------------------------------------------------
-- RLS et les GRANT ne filtrent pas `service_role`, qui est précisément le rôle
-- qui écrit ici. Les déclencheurs, si.
create or replace function public.paiements_immuables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'PAIEMENT_IMMUABLE';
  end if;

  -- Deux états sont définitifs. `echoue` ne l'est pas, et c'est délibéré :
  -- Chariow rend « failed » à des règlements qui aboutissent ensuite, et la
  -- fenêtre de rattrapage de quatorze jours en dépend.
  if old.statut in ('regle', 'abandonne') then
    raise exception 'PAIEMENT_TERMINAL';
  end if;

  -- Ce qui identifie la vente ne bouge jamais. `montant` et `devise` restent
  -- modifiables : Chariow est la source de vérité du montant réellement débité,
  -- et la réconciliation le relit.
  if new.collecteur_id  <> old.collecteur_id
     or new.vente_id    <> old.vente_id
     or new.fournisseur <> old.fournisseur
     or new.palier      <> old.palier
     or new.cree_le     <> old.cree_le
     or new.echeance_avant <> old.echeance_avant then
    raise exception 'PAIEMENT_IDENTITE_FIGEE';
  end if;

  return new;
end;
$$;

create trigger paiements_immuables
  before update or delete on public.paiements_abonnement
  for each row execute function public.paiements_immuables();

-- `journaliser()` lit `new.collecteur_id`, que cette table porte : la fonction
-- existante convient, sans la variante `journaliser_collecteur()`.
create trigger paiements_journal
  after insert or update on public.paiements_abonnement
  for each row execute function public.journaliser();

-- ---------------------------------------------------------------------------
-- Le crédit — deux écritures qui doivent tenir ensemble
-- ---------------------------------------------------------------------------
-- PostgREST ne rend pas deux écritures atomiques ; c'est la leçon de
-- `collecteur-cloturer-carte`, qui a dû accepter un état partiel. Ici un état
-- partiel signifierait un collecteur qui a payé sans être servi.
create or replace function public.crediter_abonnement(
  p_paiement uuid,
  p_regle_le timestamptz,
  p_montant  numeric,
  p_devise   text
)
returns table (credite boolean, echeance date)
language plpgsql
security definer
set search_path = public
as $$
declare v_paiement public.paiements_abonnement%rowtype;
        v_echeance date;
begin
  -- Le verrou et le filtre en une instruction : le webhook et l'ouverture de
  -- l'application ne peuvent pas lire tous les deux un paiement en attente.
  -- `regle` et `abandonne` sont exclus, donc un second appel sur un paiement
  -- déjà crédité ne trouve rien — l'idempotence tient ici.
  select * into v_paiement
    from public.paiements_abonnement
   where id = p_paiement and statut in ('en_attente', 'echoue')
     for update;

  if not found then
    return query select false, null::date;
    return;
  end if;

  -- Payer en avance prolonge ; payer en retard repart d'aujourd'hui. Sans le
  -- `greatest`, un collecteur avec soixante jours de retard paierait et
  -- resterait expiré — il aurait acheté du passé.
  select greatest(c.abonnement_echeance, current_date) + 30
    into v_echeance
    from public.collecteurs c
   where c.id = v_paiement.collecteur_id
     for update;

  update public.collecteurs
     set palier              = v_paiement.palier,
         abonnement_statut   = 'actif',
         abonnement_echeance = v_echeance
   where id = v_paiement.collecteur_id;

  update public.paiements_abonnement
     set statut         = 'regle',
         regle_le       = p_regle_le,
         montant        = p_montant,
         devise         = p_devise,
         echeance_apres = v_echeance
   where id = p_paiement;

  return query select true, v_echeance;
end;
$$;

comment on function public.crediter_abonnement is
  'Transforme un paiement en abonnement, une seule fois. Réservée à la clé de service : la décision de créditer se prend dans l''Edge Function, après relecture du statut chez le fournisseur.';

-- `create or replace function` réattribue EXECUTE à PUBLIC sans rien dire.
-- Même paire que la migration de la vue globale, pour la même raison.
revoke all on function public.crediter_abonnement(uuid, timestamptz, numeric, text)
  from public, anon, authenticated;
grant execute on function public.crediter_abonnement(uuid, timestamptz, numeric, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Garde-fou 1 — les privilèges de la nouvelle table, au caractère près
-- ---------------------------------------------------------------------------
do $$
declare surplus text;
begin
  select string_agg(grantee || '.' || privilege_type, ', ' order by grantee || '.' || privilege_type)
    into surplus
    from information_schema.table_privileges
   where table_schema = 'public'
     and table_name = 'paiements_abonnement'
     and grantee in ('anon', 'authenticated')
     and not (grantee = 'authenticated' and privilege_type = 'SELECT');

  if surplus is not null then
    raise exception 'Privilèges non prévus sur paiements_abonnement : %', surplus;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Garde-fou 2 — aucune colonne écrivable
-- ---------------------------------------------------------------------------
do $$
declare surplus text;
begin
  select string_agg(distinct grantee || '.' || column_name || '.' || privilege_type, ', ')
    into surplus
    from information_schema.column_privileges
   where table_schema = 'public'
     and table_name = 'paiements_abonnement'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

  if surplus is not null then
    raise exception 'Colonnes écrivables sur paiements_abonnement : %', surplus;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Garde-fou 3 — les déclencheurs et le privilège d'exécution
-- ---------------------------------------------------------------------------
-- Un déclencheur absent ne se voit pas : tout continue de fonctionner,
-- simplement sans trace ou sans verrou.
do $garde$
declare manquants text; ouverte boolean;
begin
  select string_agg(attendu, ', ')
    into manquants
    from (values ('paiements_immuables'), ('paiements_journal')) as t(attendu)
   where not exists (
     select 1 from pg_trigger where tgname = t.attendu and not tgisinternal
   );

  if manquants is not null then
    raise exception 'GARDE_FOU : déclencheurs absents : %', manquants;
  end if;

  select has_function_privilege('authenticated', 'public.crediter_abonnement(uuid, timestamptz, numeric, text)', 'EXECUTE')
    into ouverte;

  if ouverte then
    raise exception 'GARDE_FOU : crediter_abonnement est exécutable par authenticated';
  end if;
end
$garde$;
```

- [ ] **Step 4: Reconstruire la base et lancer les tests**

Run: `npm run db:reset && npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/abonnement.test.ts`
Expected: PASS — 14 tests. La migration s'applique sans qu'aucun garde-fou ne lève.

- [ ] **Step 5: Vérifier que la suite entière tient**

Run: `npx vitest run --config supabase/tests/vitest.config.ts`
Expected: PASS — 157 tests d'avant, plus les 14 nouveaux et les 20 de la tâche 1.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260902160000_abonnements_paiements.sql supabase/tests/abonnement.test.ts
git commit -m "feat(abonnement): le registre des paiements, et la seule fonction qui crédite"
```

---

## Task 3: La réconciliation — le cœur du fulfilment

> **Repris le 2026-09-03, à l'exécution.** Deux écarts avec le texte d'origine,
> tous deux corrigés ci-dessous plutôt que laissés à découvrir :
>
> - `remise_pct` était lu par le contrôle de grille sans figurer dans
>   `PaiementEnCours` — le module ne compilait pas ;
> - l'amendement « payer vaut accord » fait naître le compte **ici**. Le dépôt
>   gagne donc `ouvrirCompte`, `crediter` reçoit le compte en cinquième
>   argument, et `PaiementEnCours` porte les deux rattachements possibles.
>
> L'ordre est le sujet : vente reconnue réglée et cohérente, **puis** compte
> ouvert, **puis** crédit. Un compte sans abonnement se répare à la main ; un
> abonnement crédité sans compte ne se rattache à rien.

**Files:**
- Create: `supabase/functions/_shared/reconciliation.ts`
- Test: `supabase/tests/reconciliation.test.ts`

**Interfaces:**
- Consumes: `mapperStatut`, `montantCoherent` de `_shared/chariow.ts` ; `TARIFS` de `_shared/paliers.ts`.
- Produces: `type PaiementEnCours = { id: string; palier: string; vente_id: string; montant: number; devise: string; remise_pct: number; collecteur_id: string | null; demande_id: string | null; cree_le: string }` · `type Depot` (les quatre opérations dont la réconciliation a besoin — `lireVente`, `ouvrirCompte`, `crediter`, `marquer` — plus `journaliser`, toutes injectées pour les tests) · `reconcilier(paiements: PaiementEnCours[], depot: Depot): Promise<ResultatReconciliation>` · `type ResultatReconciliation = { credites: number; enAttente: number; echeance: string | null }`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `supabase/tests/reconciliation.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';

import { reconcilier, type Depot, type PaiementEnCours } from '../functions/_shared/reconciliation';

/**
 * Ce module décide de créditer ou non. Il est écrit avec ses effets de bord
 * injectés — lire une vente, ouvrir un compte, créditer — pour que ces
 * décisions soient testables sans réseau et sans base.
 *
 * Les trois cas qui comptent, et qui viennent tous d'incidents réels
 * documentés dans `Docs/Chariow.md` §10 :
 *   1. un statut non réglé ne crédite jamais ;
 *   2. un montant qui a bougé ne crédite pas, et se journalise ;
 *   3. la date de règlement vient du fournisseur, jamais de l'horloge locale.
 *
 * S'y ajoute depuis l'amendement « payer vaut accord » du 2026-09-02 : un
 * paiement peut arriver ici **sans compte**, parce qu'il règle une demande
 * d'ouverture. C'est alors la réconciliation qui fait naître le compte, et
 * l'ordre est le sujet — un compte sans abonnement se répare, un abonnement
 * sans compte ne se rattache à rien.
 */

function paiement(sur: Partial<PaiementEnCours> = {}): PaiementEnCours {
  return {
    id: 'p1',
    palier: 'pro',
    vente_id: 'vente-1',
    montant: 5000,
    devise: 'XOF',
    remise_pct: 0,
    collecteur_id: 'c1',
    demande_id: null,
    cree_le: '2026-08-20T08:00:00Z',
    ...sur,
  };
}

/** Le même paiement, mais né d'une demande d'ouverture : pas encore de compte. */
function prospect(sur: Partial<PaiementEnCours> = {}): PaiementEnCours {
  return paiement({ collecteur_id: null, demande_id: 'd1', ...sur });
}

function depot(sur: Partial<Depot> = {}): Depot {
  return {
    lireVente: vi.fn(async () => ({
      statut: 'settled',
      montant: 5000,
      devise: 'XOF',
      regleLe: '2026-08-21T20:04:00Z',
    })),
    ouvrirCompte: vi.fn(async () => 'compte-neuf'),
    crediter: vi.fn(async () => ({ credite: true, echeance: '2026-09-21' })),
    marquer: vi.fn(async () => {}),
    journaliser: vi.fn(),
    ...sur,
  };
}

describe('reconcilier', () => {
  it('crédite une vente réglée, avec la date du fournisseur', async () => {
    const d = depot();
    const resultat = await reconcilier([paiement()], d);

    expect(resultat.credites).toBe(1);
    expect(resultat.echeance).toBe('2026-09-21');
    expect(d.crediter).toHaveBeenCalledWith('p1', '2026-08-21T20:04:00Z', 5000, 'XOF', null);
  });

  it('retombe sur la date de création quand le fournisseur n’en donne pas', async () => {
    const d = depot({
      lireVente: vi.fn(async () => ({
        statut: 'settled',
        montant: 5000,
        devise: 'XOF',
        regleLe: null,
      })),
    });
    await reconcilier([paiement()], d);

    // Jamais `now()` : un rattrapage inscrirait la recette au mauvais jour.
    expect(d.crediter).toHaveBeenCalledWith('p1', '2026-08-20T08:00:00Z', 5000, 'XOF', null);
  });

  it('ne crédite pas une vente encore impayée', async () => {
    const d = depot({
      lireVente: vi.fn(async () => ({
        statut: 'unpaid',
        montant: 5000,
        devise: 'XOF',
        regleLe: null,
      })),
    });
    const resultat = await reconcilier([paiement()], d);

    expect(resultat.credites).toBe(0);
    expect(resultat.enAttente).toBe(1);
    expect(d.crediter).not.toHaveBeenCalled();
  });

  it('marque un échec sans créditer', async () => {
    const d = depot({
      lireVente: vi.fn(async () => ({
        statut: 'failed',
        montant: 5000,
        devise: 'XOF',
        regleLe: null,
      })),
    });
    const resultat = await reconcilier([paiement()], d);

    expect(resultat.credites).toBe(0);
    expect(d.marquer).toHaveBeenCalledWith('p1', 'echoue');
    expect(d.crediter).not.toHaveBeenCalled();
  });

  it('refuse de créditer un montant qui a bougé au-delà de la tolérance', async () => {
    const d = depot({
      lireVente: vi.fn(async () => ({
        statut: 'settled',
        montant: 500,
        devise: 'XOF',
        regleLe: '2026-08-21T20:04:00Z',
      })),
    });
    const resultat = await reconcilier([paiement()], d);

    expect(resultat.credites).toBe(0);
    expect(d.crediter).not.toHaveBeenCalled();
    expect(d.journaliser).toHaveBeenCalledWith(expect.stringContaining('ANOMALIE montant'));
  });

  it('avertit sans bloquer quand le montant s’écarte de la grille en FCFA', async () => {
    // 4900 contre 5000 stocké : dans la tolérance. Mais la grille dit 5000.
    const d = depot({
      lireVente: vi.fn(async () => ({
        statut: 'settled',
        montant: 4900,
        devise: 'XOF',
        regleLe: '2026-08-21T20:04:00Z',
      })),
    });
    const resultat = await reconcilier([paiement()], d);

    expect(resultat.credites).toBe(1);
    expect(d.journaliser).toHaveBeenCalledWith(expect.stringContaining('GRILLE'));
  });

  it('ne crie pas à la grille quand la remise explique l’écart', async () => {
    // Sans ce calcul, chaque paiement remisé écrirait une anomalie parfaitement
    // normale — et le jour où la boutique divergerait vraiment, la ligne se
    // perdrait dans le bruit qu'on aurait appris à ignorer.
    const d = depot({
      lireVente: vi.fn(async () => ({
        statut: 'settled',
        montant: 4000,
        devise: 'XOF',
        regleLe: '2026-08-21T20:04:00Z',
      })),
    });
    const resultat = await reconcilier([paiement({ montant: 4000, remise_pct: 20 })], d);

    expect(resultat.credites).toBe(1);
    expect(d.journaliser).not.toHaveBeenCalled();
  });

  it('ne compte pas deux fois un paiement que la base a déjà crédité', async () => {
    const d = depot({ crediter: vi.fn(async () => ({ credite: false, echeance: null })) });
    const resultat = await reconcilier([paiement()], d);

    expect(resultat.credites).toBe(0);
  });

  it('continue la liste quand une lecture échoue', async () => {
    const d = depot({
      lireVente: vi.fn(async (venteId: string) => {
        if (venteId === 'vente-1') throw new Error('réseau');
        return { statut: 'settled', montant: 5000, devise: 'XOF', regleLe: null };
      }),
    });
    const resultat = await reconcilier([paiement(), paiement({ id: 'p2', vente_id: 'vente-2' })], d);

    expect(resultat.credites).toBe(1);
    expect(resultat.enAttente).toBe(1);
  });

  describe('payer vaut accord — le compte naît ici', () => {
    it('ouvre le compte, puis crédite en le nommant', async () => {
      const d = depot();
      const resultat = await reconcilier([prospect()], d);

      expect(d.ouvrirCompte).toHaveBeenCalledTimes(1);
      expect(resultat.credites).toBe(1);
      expect(d.crediter).toHaveBeenCalledWith(
        'p1',
        '2026-08-21T20:04:00Z',
        5000,
        'XOF',
        'compte-neuf',
      );
    });

    it('ne crédite pas quand l’ouverture du compte échoue', async () => {
      // L'ordre est le sujet. Un compte sans abonnement se répare à la main ;
      // un abonnement crédité sans compte ne se rattache à rien, et la somme
      // encaissée n'appartient plus à personne.
      const d = depot({
        ouvrirCompte: vi.fn(async () => {
          throw new Error('adresse déjà prise');
        }),
      });
      const resultat = await reconcilier([prospect()], d);

      expect(resultat.credites).toBe(0);
      expect(resultat.enAttente).toBe(1);
      expect(d.crediter).not.toHaveBeenCalled();
      expect(d.journaliser).toHaveBeenCalledWith(expect.stringContaining('OUVERTURE'));
    });

    it('n’ouvre pas de second compte pour un paiement déjà rattaché', async () => {
      // Une demande servie porte les deux : sa demande d'origine et le compte
      // qu'elle a fait naître. Une seconde réconciliation ne doit pas relire
      // « demande_id présent » comme « compte à créer ».
      const d = depot();
      await reconcilier([paiement({ demande_id: 'd1' })], d);

      expect(d.ouvrirCompte).not.toHaveBeenCalled();
      expect(d.crediter).toHaveBeenCalledWith('p1', '2026-08-21T20:04:00Z', 5000, 'XOF', null);
    });

    it('n’ouvre aucun compte pour une vente qui n’est pas réglée', async () => {
      // Le contrôle du règlement précède la création : personne ne reçoit de
      // compte pour un paiement qui n'a pas abouti.
      const d = depot({
        lireVente: vi.fn(async () => ({
          statut: 'unpaid',
          montant: 5000,
          devise: 'XOF',
          regleLe: null,
        })),
      });
      await reconcilier([prospect()], d);

      expect(d.ouvrirCompte).not.toHaveBeenCalled();
    });

    it('n’ouvre aucun compte quand le montant relu a bougé', async () => {
      const d = depot({
        lireVente: vi.fn(async () => ({
          statut: 'settled',
          montant: 500,
          devise: 'XOF',
          regleLe: '2026-08-21T20:04:00Z',
        })),
      });
      await reconcilier([prospect()], d);

      expect(d.ouvrirCompte).not.toHaveBeenCalled();
      expect(d.crediter).not.toHaveBeenCalled();
    });

    it('refuse un paiement qui n’est rattaché à rien', async () => {
      // La contrainte `paiements_rattachement` l'interdit en base. Si une ligne
      // pareille arrive quand même ici, la traiter reviendrait à créditer un
      // abonnement sans savoir à qui.
      const d = depot();
      const resultat = await reconcilier([paiement({ collecteur_id: null, demande_id: null })], d);

      expect(resultat.credites).toBe(0);
      expect(d.ouvrirCompte).not.toHaveBeenCalled();
      expect(d.crediter).not.toHaveBeenCalled();
      expect(d.journaliser).toHaveBeenCalledWith(expect.stringContaining('ORPHELIN'));
    });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/reconciliation.test.ts`
Expected: FAIL — `Failed to resolve import "../functions/_shared/reconciliation"`.

- [ ] **Step 3: Écrire le module**

Créer `supabase/functions/_shared/reconciliation.ts` :

```ts
import { mapperStatut, montantCoherent, type StatutPaiement } from './chariow.ts';
import { tarifParCle } from './paliers.ts';

/**
 * Le cœur du fulfilment, appelé par les trois chemins : le retour de paiement,
 * le webhook, et l'ouverture de l'application.
 *
 * Ses effets de bord sont **injectés** — lire une vente chez le fournisseur,
 * ouvrir un compte, créditer en base. C'est ce qui rend testables sans réseau
 * les seules décisions qui comptent : créditer ou non, avec quelle date, à quel
 * montant, au profit de qui. La leçon vient du défaut CORS du 2026-08-20 : ce
 * qui n'est pas testable finit par être faux.
 *
 * ## Ce que l'amendement « payer vaut accord » ajoute ici
 *
 * Un paiement peut arriver **sans compte**, parce qu'il règle une demande
 * d'ouverture. C'est alors ce module qui fait naître le compte, et l'ordre est
 * le sujet : la vente est d'abord reconnue réglée et cohérente, le compte
 * ouvert ensuite, le crédit en dernier. Un compte sans abonnement se répare à
 * la main ; un abonnement crédité sans compte ne se rattache à rien, et la
 * somme encaissée n'appartient plus à personne.
 */

export interface PaiementEnCours {
  id: string;
  palier: string;
  vente_id: string;
  montant: number;
  devise: string;
  /** La remise portée par ce paiement, pas celle que la fiche porte aujourd'hui. */
  remise_pct: number;
  /** Nul tant que le compte n'existe pas — cas d'une demande d'ouverture. */
  collecteur_id: string | null;
  /** La demande d'origine, quand ce paiement en règle une. */
  demande_id: string | null;
  /** Sert de date de règlement de repli. Jamais `now()`. */
  cree_le: string;
}

export interface VenteDistante {
  statut: string;
  montant: number;
  devise: string;
  /** `settled_at`, `paid_at` ou `completed_at` selon la version. */
  regleLe: string | null;
}

export interface Depot {
  lireVente: (venteId: string) => Promise<VenteDistante>;
  /**
   * Crée le compte d'un prospect qui vient de payer, et rend son identifiant.
   *
   * La ligne `auth.users` ne se fabrique pas en SQL : c'est l'appelant qui la
   * crée, à partir de la demande d'ouverture, puis nomme le compte au crédit.
   */
  ouvrirCompte: (paiement: PaiementEnCours) => Promise<string>;
  crediter: (
    paiementId: string,
    regleLe: string,
    montant: number,
    devise: string,
    /** Le compte fraîchement ouvert ; nul pour un renouvellement. */
    collecteur: string | null,
  ) => Promise<{ credite: boolean; echeance: string | null }>;
  marquer: (paiementId: string, statut: StatutPaiement) => Promise<void>;
  journaliser: (message: string) => void;
}

export interface ResultatReconciliation {
  credites: number;
  enAttente: number;
  /** La dernière échéance obtenue, pour que l'écran de retour l'affiche. */
  echeance: string | null;
}

export async function reconcilier(
  paiements: PaiementEnCours[],
  depot: Depot,
): Promise<ResultatReconciliation> {
  let credites = 0;
  let enAttente = 0;
  let echeance: string | null = null;

  for (const paiement of paiements) {
    let vente: VenteDistante;
    try {
      vente = await depot.lireVente(paiement.vente_id);
    } catch (cause) {
      // Une panne de lecture n'est pas un échec de paiement : on laisse la ligne
      // en attente et on continue la liste.
      depot.journaliser(
        `lecture de ${paiement.vente_id} impossible : ${cause instanceof Error ? cause.message : 'inconnue'}`,
      );
      enAttente += 1;
      continue;
    }

    const statut = mapperStatut(vente.statut);

    if (statut !== 'regle') {
      if (statut === 'en_attente') {
        enAttente += 1;
      } else {
        await depot.marquer(paiement.id, statut);
      }
      continue;
    }

    // Contrôle principal : le montant relu contre celui enregistré à la
    // création de la vente. Un écart ne crédite pas.
    if (!montantCoherent(vente.montant, paiement.montant)) {
      depot.journaliser(
        `ANOMALIE montant — NON crédité : vente ${paiement.vente_id}, ` +
          `attendu ${paiement.montant} ${paiement.devise}, reçu ${vente.montant} ${vente.devise}`,
      );
      enAttente += 1;
      continue;
    }

    // Contrôle secondaire, purement informatif : l'écart avec la grille
    // tarifaire. Il détecte une boutique dont le prix a divergé. Il avertit et
    // ne bloque pas — le collecteur n'y est pour rien, et refuser après un
    // débit serait le punir d'une erreur de configuration de GTCS.
    if (vente.devise === 'XOF') {
      try {
        // Le prix de la grille, diminué de la remise **portée par le paiement**
        // — pas de celle que la fiche porte aujourd'hui. Sans ce calcul, chaque
        // paiement remisé écrirait une anomalie de grille parfaitement normale,
        // et le jour où la boutique Chariow divergerait vraiment, la ligne se
        // perdrait dans le bruit qu'on aurait appris à ignorer.
        //
        // `Math.round` : Chariow applique un pourcentage sur un entier en FCFA
        // et arrondit ; 15 000 à -20 % fait 12 000, mais 15 000 à -33 % fait
        // 10 050 chez eux et 10 050,0000001 ici si on ne borne pas.
        const plein = tarifParCle(paiement.palier).prix;
        const attendu = Math.round((plein * (100 - paiement.remise_pct)) / 100);
        if (vente.montant !== attendu) {
          depot.journaliser(
            `GRILLE — le produit ${paiement.palier} a débité ${vente.montant} XOF ` +
              `au lieu de ${attendu} XOF (grille ${plein}, remise ${paiement.remise_pct} %). ` +
              `Aligner la boutique Chariow sur la grille.`,
          );
        }
      } catch {
        depot.journaliser(`GRILLE — palier inconnu en base : ${paiement.palier}`);
      }
    }

    // --- À qui ce règlement profite-t-il ? ---
    //
    // Trois états possibles, et le troisième ne devrait pas exister.
    let compte: string | null = null;

    if (paiement.collecteur_id === null) {
      if (paiement.demande_id === null) {
        // La contrainte `paiements_rattachement` interdit cet état en base.
        // S'il arrive quand même ici, créditer reviendrait à encaisser sans
        // savoir qui servir. On ne le compte ni comme crédité ni comme en
        // attente : aucun passage suivant ne le résoudra, c'est une ligne à
        // regarder à la main.
        depot.journaliser(
          `ORPHELIN — paiement ${paiement.id} rattaché ni à un compte ni à une demande, NON crédité`,
        );
        continue;
      }

      // Le prospect a payé : son compte naît maintenant. Avant le crédit, et
      // seulement après que la vente a été reconnue réglée et cohérente —
      // personne ne reçoit de compte pour un paiement qui n'a pas abouti.
      try {
        compte = await depot.ouvrirCompte(paiement);
      } catch (cause) {
        depot.journaliser(
          `OUVERTURE — compte impossible pour la demande ${paiement.demande_id} : ` +
            `${cause instanceof Error ? cause.message : 'inconnue'} — NON crédité`,
        );
        enAttente += 1;
        continue;
      }
    }

    // La date vient du fournisseur, à défaut de la création du paiement.
    // Jamais `now()` : un rattrapage inscrirait la recette au mauvais jour.
    const regleLe = vente.regleLe ?? paiement.cree_le;

    const { credite, echeance: obtenue } = await depot.crediter(
      paiement.id,
      regleLe,
      vente.montant,
      vente.devise,
      compte,
    );

    if (credite) {
      credites += 1;
      echeance = obtenue ?? echeance;
    }
  }

  return { credites, enAttente, echeance };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/reconciliation.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/reconciliation.ts supabase/tests/reconciliation.test.ts
git commit -m "feat(abonnement): la réconciliation, avec ses effets de bord injectés"
```

---

## Task 4: L'adaptateur Chariow et la fonction de vérification

**Files:**
- Create: `supabase/functions/_shared/depot-chariow.ts`
- Create: `supabase/functions/abonnement-verifier/index.ts`

**Interfaces:**
- Consumes: `reconcilier`, `Depot`, `PaiementEnCours` de `_shared/reconciliation.ts` ; `entetesCors`, `listerOrigines`, `ORIGINES_COLLECTEUR` de `_shared/cors.ts`.
- Produces: `creerDepot(clientService: SupabaseClient, options: OptionsChariow): Depot` · `lireVenteChariow(venteId: string, options: OptionsChariow): Promise<VenteDistante>` · `chargerPaiementsRattrapables(clientService: SupabaseClient, collecteurId: string): Promise<PaiementEnCours[]>` · `OptionsChariow = { racine: string; cleApi: string }` · `JOURS_RATTRAPAGE = 14` · l'Edge Function `abonnement-verifier`, qui rend `{ credites, enAttente, echeance }`.

- [ ] **Step 1: Écrire l'adaptateur**

Créer `supabase/functions/_shared/depot-chariow.ts` :

```ts
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import type { StatutPaiement } from './chariow.ts';
import type { Depot, PaiementEnCours, VenteDistante } from './reconciliation.ts';

/**
 * Le branchement réel de la réconciliation : Chariow d'un côté, la base de
 * l'autre.
 *
 * Ce fichier est le seul du lot à toucher le réseau et la clé de service. Il
 * n'est pas couvert par la suite du dépôt — il n'y a rien à y décider, tout ce
 * qui décide vit dans `reconciliation.ts`, qui est testé. Ce découpage est
 * délibéré : le code non testé doit être du câblage, pas du jugement.
 */

/** La fenêtre de rattrapage d'un paiement refusé à tort. `Docs/Chariow.md` §5. */
export const JOURS_RATTRAPAGE = 14;

export interface OptionsChariow {
  racine: string;
  cleApi: string;
}

/** Les trois noms de date que Chariow emploie selon la version. */
function dateDeReglement(vente: Record<string, unknown>): string | null {
  for (const nom of ['settled_at', 'paid_at', 'completed_at']) {
    const valeur = vente[nom];
    if (typeof valeur === 'string' && valeur) return valeur;
  }
  return null;
}

export async function lireVenteChariow(
  venteId: string,
  options: OptionsChariow,
): Promise<VenteDistante> {
  const reponse = await fetch(`${options.racine}/sales/${encodeURIComponent(venteId)}`, {
    headers: { Authorization: `Bearer ${options.cleApi}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!reponse.ok) throw new Error(`HTTP_${reponse.status}`);

  const corps = (await reponse.json()) as { data?: Record<string, unknown> };
  const vente = (corps.data ?? {}) as Record<string, unknown>;
  const montant = (vente.amount ?? {}) as { value?: unknown; currency?: unknown };

  return {
    statut: typeof vente.status === 'string' ? vente.status : '',
    montant: Number(montant.value),
    devise: typeof montant.currency === 'string' ? montant.currency.toUpperCase() : '',
    regleLe: dateDeReglement(vente),
  };
}

/**
 * Les paiements qu'il vaut la peine de relire : ceux en attente, et ceux
 * refusés depuis moins de quatorze jours.
 */
export async function chargerPaiementsRattrapables(
  clientService: SupabaseClient,
  collecteurId: string,
): Promise<PaiementEnCours[]> {
  const depuis = new Date(Date.now() - JOURS_RATTRAPAGE * 86400000).toISOString();

  const { data, error } = await clientService
    .from('paiements_abonnement')
    .select('id, palier, vente_id, montant, devise, cree_le, statut')
    .eq('collecteur_id', collecteurId)
    .in('statut', ['en_attente', 'echoue'])
    .gte('cree_le', depuis)
    .order('cree_le', { ascending: true })
    .limit(20);

  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<PaiementEnCours & { statut: string }>).map((p) => ({
    id: p.id,
    palier: p.palier,
    vente_id: p.vente_id,
    montant: Number(p.montant),
    devise: p.devise,
    cree_le: p.cree_le,
  }));
}

export function creerDepot(
  clientService: SupabaseClient,
  options: OptionsChariow,
): Depot {
  return {
    lireVente: (venteId) => lireVenteChariow(venteId, options),

    crediter: async (paiementId, regleLe, montant, devise) => {
      const { data, error } = await clientService.rpc('crediter_abonnement', {
        p_paiement: paiementId,
        p_regle_le: regleLe,
        p_montant: montant,
        p_devise: devise,
      });
      if (error) throw new Error(error.message);
      const ligne = (data as Array<{ credite: boolean; echeance: string | null }>)?.[0];
      return { credite: ligne?.credite === true, echeance: ligne?.echeance ?? null };
    },

    marquer: async (paiementId, statut: StatutPaiement) => {
      const { error } = await clientService
        .from('paiements_abonnement')
        .update({ statut })
        .eq('id', paiementId);
      // Un refus du déclencheur d'immuabilité signifie que la ligne est déjà
      // terminale : ce n'est pas une erreur, c'est une course perdue.
      if (error && !error.message.includes('PAIEMENT_TERMINAL')) {
        throw new Error(error.message);
      }
    },

    journaliser: (message) => console.error('[Abonnement]', message),
  };
}
```

- [ ] **Step 2: Écrire la fonction de vérification**

Créer `supabase/functions/abonnement-verifier/index.ts` :

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_COLLECTEUR, entetesCors, listerOrigines } from '../_shared/cors.ts';
import { chargerPaiementsRattrapables, creerDepot } from '../_shared/depot-chariow.ts';
import { reconcilier } from '../_shared/reconciliation.ts';

/**
 * Réconcilier les paiements du collecteur appelant.
 *
 * Deux appelants, un seul code : l'écran de retour qui sonde après un paiement,
 * et l'ouverture de l'application. C'est ce second usage qui remplace un cron —
 * le carnet est l'outil de travail du collecteur, il le rouvre le lendemain
 * matin.
 *
 * La fonction ne prend aucun paramètre : **l'identité vient du jeton**, jamais
 * du corps. Un `collecteurId` reçu du téléphone serait un contrôle d'accès fait
 * par le client.
 */

const ORIGINES_AUTORISEES = listerOrigines(
  Deno.env.get('ORIGINES_COLLECTEUR'),
  ORIGINES_COLLECTEUR,
);

function entetesPour(requete: Request): Record<string, string> {
  return entetesCors({
    origine: requete.headers.get('Origin'),
    entetesDemandes: requete.headers.get('Access-Control-Request-Headers'),
    origines: ORIGINES_AUTORISEES,
  });
}

function reponse(corps: unknown, statut: number, requete: Request): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: entetesPour(requete) });
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesPour(requete) });
  }
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }

  const autorisation = requete.headers.get('Authorization');
  if (!autorisation?.startsWith('Bearer ')) {
    return reponse({ erreur: 'JETON_ABSENT' }, 401, requete);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const cleAnon = Deno.env.get('SUPABASE_ANON_KEY');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cleApi = Deno.env.get('CHARIOW_CLE_API');
  const racine = Deno.env.get('CHARIOW_API_URL') ?? 'https://api.chariow.com/v1';

  if (!url || !cleAnon || !cleService || !cleApi) {
    console.error('Configuration incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  // --- Identité, sous le jeton de l'appelant ---

  const clientAppelant = createClient(url, cleAnon, {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: utilisateur, error: erreurUtilisateur } = await clientAppelant.auth.getUser();
  if (erreurUtilisateur || !utilisateur.user) {
    return reponse({ erreur: 'ACCES_RESERVE' }, 403, requete);
  }

  // --- Passé ce point seulement, la clé de service sort ---

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const paiements = await chargerPaiementsRattrapables(clientService, utilisateur.user.id);
    const resultat = await reconcilier(paiements, creerDepot(clientService, { racine, cleApi }));
    return reponse(resultat, 200, requete);
  } catch (cause) {
    console.error('[Abonnement] réconciliation :', cause instanceof Error ? cause.message : cause);
    return reponse({ erreur: 'RECONCILIATION_IMPOSSIBLE' }, 500, requete);
  }
});
```

- [ ] **Step 3: Vérifier que rien n'est cassé**

Run: `npx vitest run --config supabase/tests/vitest.config.ts`
Expected: PASS — la suite entière. Les deux fichiers ajoutés ne sont pas importés par les tests ; ce passage vérifie qu'ils n'ont rien cassé par effet de bord.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/depot-chariow.ts supabase/functions/abonnement-verifier/
git commit -m "feat(abonnement): la vérification, appelée par le retour et par l'ouverture"
```

---

## Task 5: Créer la vente

**Files:**
- Create: `supabase/functions/abonnement-payer/index.ts`

**Interfaces:**
- Consumes: `resoudreTelephone`, `lireProduits` de `_shared/chariow.ts` ; `creerDepot`, `chargerPaiementsRattrapables` de `_shared/depot-chariow.ts` ; `reconcilier` de `_shared/reconciliation.ts`.
- Produces: l'Edge Function `abonnement-payer`, qui rend `{ checkoutUrl, paiementId }` en 201.

- [ ] **Step 1: Écrire la fonction**

Créer `supabase/functions/abonnement-payer/index.ts` :

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

import { ORIGINES_COLLECTEUR, entetesCors, listerOrigines } from '../_shared/cors.ts';
import { lireProduits, resoudreTelephone } from '../_shared/chariow.ts';
import { chargerPaiementsRattrapables, creerDepot } from '../_shared/depot-chariow.ts';
import { reconcilier } from '../_shared/reconciliation.ts';

/**
 * Créer la vente qui réglera l'abonnement d'un collecteur.
 *
 * ## Ce que le téléphone n'a pas le droit de décider
 *
 * Ni son identité — elle vient du jeton — ni le montant. Chariow débite le prix
 * du produit configuré dans sa boutique ; aucun montant ne transite par cette
 * fonction, et c'est une propriété, pas une limitation. Le corps ne porte que
 * le palier voulu et le téléphone à créditer.
 *
 * ## Pourquoi la clé de service sort si tard
 *
 * Tout ce qui peut refuser — palier inconnu, téléphone irrésoluble, appel
 * Chariow en échec — refuse avant. La clé ne sert qu'à écrire une ligne dont on
 * sait déjà qu'elle a un sens.
 */

const ORIGINES_AUTORISEES = listerOrigines(
  Deno.env.get('ORIGINES_COLLECTEUR'),
  ORIGINES_COLLECTEUR,
);

function entetesPour(requete: Request): Record<string, string> {
  return entetesCors({
    origine: requete.headers.get('Origin'),
    entetesDemandes: requete.headers.get('Access-Control-Request-Headers'),
    origines: ORIGINES_AUTORISEES,
  });
}

function reponse(corps: unknown, statut: number, requete: Request): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: entetesPour(requete) });
}

Deno.serve(async (requete) => {
  if (requete.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: entetesPour(requete) });
  }
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405, requete);
  }

  const autorisation = requete.headers.get('Authorization');
  if (!autorisation?.startsWith('Bearer ')) {
    return reponse({ erreur: 'JETON_ABSENT' }, 401, requete);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const cleAnon = Deno.env.get('SUPABASE_ANON_KEY');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cleApi = Deno.env.get('CHARIOW_CLE_API');
  const racine = Deno.env.get('CHARIOW_API_URL') ?? 'https://api.chariow.com/v1';
  const retour = Deno.env.get('URL_RETOUR_COLLECTEUR') ?? 'https://kolek-collecteur.netlify.app';

  if (!url || !cleAnon || !cleService || !cleApi) {
    console.error('Configuration incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  let produits: Record<string, string>;
  try {
    produits = lireProduits(Deno.env.get('CHARIOW_PRODUITS'));
  } catch (cause) {
    console.error('[Abonnement]', cause instanceof Error ? cause.message : cause);
    return reponse({ erreur: 'CONFIGURATION' }, 500, requete);
  }

  // --- Identité, sous le jeton de l'appelant ---

  const clientAppelant = createClient(url, cleAnon, {
    global: { headers: { Authorization: autorisation } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: utilisateur, error: erreurUtilisateur } = await clientAppelant.auth.getUser();
  if (erreurUtilisateur || !utilisateur.user) {
    return reponse({ erreur: 'ACCES_RESERVE' }, 403, requete);
  }
  const collecteurId = utilisateur.user.id;
  const courriel = utilisateur.user.email;
  if (!courriel) return reponse({ erreur: 'COMPTE_SANS_ADRESSE' }, 400, requete);

  // --- Saisie ---

  let saisie: Record<string, unknown>;
  try {
    saisie = (await requete.json()) as Record<string, unknown>;
  } catch {
    return reponse({ erreur: 'CORPS_ILLISIBLE' }, 400, requete);
  }

  const palier = typeof saisie.palier === 'string' ? saisie.palier.trim() : '';
  if (!palier) return reponse({ erreur: 'PALIER_INCONNU' }, 400, requete);
  if (!(palier in produits)) {
    // `essai` tombe ici : il n'a pas de produit, parce qu'on ne vend pas zéro
    // franc. Le message le distingue d'un palier qui n'existe pas du tout.
    return reponse({ erreur: 'PALIER_NON_PAYANT' }, 400, requete);
  }

  const telephone = resoudreTelephone({
    telephone: saisie.telephone,
    paysTelephone: saisie.paysTelephone,
    telephoneLocal: saisie.telephoneLocal,
  });
  if (!telephone) return reponse({ erreur: 'TELEPHONE_INVALIDE' }, 400, requete);

  // La fiche est lue sous l'identité de l'appelant, donc sous RLS : c'est RLS
  // qui prouve qu'il lit la sienne.
  const { data: fiche, error: erreurFiche } = await clientAppelant
    .from('collecteurs')
    .select('nom, abonnement_echeance, titulaire_id, promo_code, remise_pct, remise_fin')
    .eq('id', collecteurId)
    .maybeSingle();

  if (erreurFiche || !fiche) {
    console.error('[Abonnement] lecture fiche :', erreurFiche?.message);
    return reponse({ erreur: 'FICHE_INTROUVABLE' }, 404, requete);
  }

  // Un collaborateur ne s'abonne pas. Son palier vient de son titulaire, qui
  // paie pour lui, et `admin_vue_globale` ne compte pas son abonnement depuis
  // `20260902140000`. Encaisser ici lui vendrait ce qu'il a déjà, et la somme
  // n'apparaîtrait même pas au chiffre d'affaires.
  //
  // Le refus est un 403 nommé, pas un 404 : le collaborateur existe, sa
  // demande est légitime, elle n'a simplement pas d'objet. L'écran ne lui est
  // pas proposé (tâche 11) — ceci est la barrière serveur.
  if (fiche.titulaire_id !== null) {
    return reponse({ erreur: 'ABONNEMENT_DU_TITULAIRE' }, 403, requete);
  }

  // La remise interne devient un `discount_code` chez Chariow : c'est le seul
  // moyen que l'API offre de réduire un prix (Docs/Chariow.md §3.1). Le code
  // n'est envoyé que s'il est encore valide — `remise_fin` est une date, et un
  // code périmé fait répondre 422 à Chariow, que le collecteur lirait comme
  // « saisie refusée » alors que sa saisie est irréprochable.
  //
  // Comparaison de dates en ISO, sur des chaînes : `remise_fin` arrive de
  // PostgREST en `YYYY-MM-DD`, et l'ordre lexicographique y est l'ordre
  // chronologique. Fabriquer deux `Date` introduirait un fuseau là où il n'y
  // en a pas.
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const remiseActive =
    typeof fiche.promo_code === 'string' &&
    fiche.promo_code.length > 0 &&
    typeof fiche.remise_fin === 'string' &&
    fiche.remise_fin >= aujourdHui;

  // Chariow exige un prénom **et** un nom. Une fiche Kolek ne porte qu'un nom
  // complet : on le coupe, avec un repli plutôt qu'un refus — un collecteur
  // enregistré sous un seul mot ne doit pas être empêché de payer.
  const morceaux = String(fiche.nom).trim().split(/\s+/);
  const prenom = morceaux[0] ?? 'Collecteur';
  const nomFamille = morceaux.length > 1 ? morceaux.slice(1).join(' ') : 'Kolek';

  // --- Passé ce point seulement, la clé de service sort ---

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Supersession : les tentatives précédentes sont d'abord réconciliées, puis
  // abandonnées. Réconcilier avant de clore est la seule façon de ne pas
  // abandonner une vente qui vient d'être réglée.
  try {
    const anciens = await chargerPaiementsRattrapables(clientService, collecteurId);
    if (anciens.length > 0) {
      const depot = creerDepot(clientService, { racine, cleApi });
      await reconcilier(anciens, depot);
      await clientService
        .from('paiements_abonnement')
        .update({ statut: 'abandonne' })
        .eq('collecteur_id', collecteurId)
        .eq('statut', 'en_attente');
    }
  } catch (cause) {
    // Une supersession en échec ne doit pas empêcher de payer : au pire, une
    // ligne en attente de plus, que la réconciliation nettoiera.
    console.error('[Abonnement] supersession :', cause instanceof Error ? cause.message : cause);
  }

  // --- La vente ---

  let vente: { id?: unknown; amount?: { value?: unknown; currency?: unknown } };
  let checkoutUrl: string;
  try {
    const appel = await fetch(`${racine}/checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleApi}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        product_id: produits[palier],
        email: courriel,
        first_name: prenom,
        last_name: nomFamille,
        phone: telephone,
        // Absent plutôt que `null` quand il n'y a pas de remise : Chariow
        // valide la présence de la clé, pas seulement sa valeur.
        ...(remiseActive ? { discount_code: fiche.promo_code } : {}),
        redirect_url: `${retour}/?paiement=retour`,
        custom_metadata: {
          collecteurId,
          palier,
          echeanceAvant: fiche.abonnement_echeance,
          // Ce que Kolek croyait accorder, au moment de l'achat. La
          // réconciliation compare le montant réellement encaissé au prix du
          // palier ; sans cette trace, une divergence entre les deux
          // catalogues de codes serait indémêlable six mois plus tard.
          remisePct: remiseActive ? fiche.remise_pct : null,
          promoCode: remiseActive ? fiche.promo_code : null,
        },
      }),
    });

    if (!appel.ok) {
      const detail = await appel.text();
      console.error('[Abonnement] checkout refusé :', appel.status, detail.slice(0, 300));
      // 422 : le fournisseur a refusé la saisie — le seul cas qu'il vaut la
      // peine de distinguer pour le collecteur.
      return reponse(
        { erreur: appel.status === 422 ? 'SAISIE_REFUSEE' : 'CHECKOUT_IMPOSSIBLE' },
        appel.status === 422 ? 400 : 502,
        requete,
      );
    }

    const corps = (await appel.json()) as {
      data?: { purchase?: typeof vente; payment?: { checkout_url?: unknown } };
    };
    vente = corps.data?.purchase ?? {};
    const lien = corps.data?.payment?.checkout_url;

    // Jamais de redirection en dur sur une réponse incomplète.
    if (typeof vente.id !== 'string' || typeof lien !== 'string' || !lien) {
      console.error('[Abonnement] réponse de checkout incomplète');
      return reponse({ erreur: 'CHECKOUT_INCOMPLET' }, 502, requete);
    }
    checkoutUrl = lien;
  } catch (cause) {
    console.error('[Abonnement] checkout :', cause instanceof Error ? cause.message : cause);
    return reponse({ erreur: 'CHECKOUT_IMPOSSIBLE' }, 502, requete);
  }

  // Le montant et la devise viennent de la réponse, jamais de la grille : c'est
  // la boutique qui décide de ce qui sera débité.
  const montant = Number(vente.amount?.value);
  const devise =
    typeof vente.amount?.currency === 'string' ? vente.amount.currency.toUpperCase() : '';

  if (!Number.isFinite(montant) || !/^[A-Z]{3}$/.test(devise)) {
    console.error('[Abonnement] montant ou devise illisibles dans la réponse');
    return reponse({ erreur: 'CHECKOUT_INCOMPLET' }, 502, requete);
  }

  const { data: pose, error: erreurPose } = await clientService
    .from('paiements_abonnement')
    .insert({
      collecteur_id: collecteurId,
      palier,
      vente_id: vente.id as string,
      montant,
      devise,
      // Ce qui a été demandé à Chariow, et non ce que la fiche portera demain.
      remise_pct: remiseActive ? Number(fiche.remise_pct) : 0,
      echeance_avant: fiche.abonnement_echeance,
    })
    .select('id')
    .single();

  if (erreurPose) {
    // La vente existe chez Chariow mais nous ne l'avons pas enregistrée. Le
    // dire plutôt que de rendre le lien : un paiement fait sur une vente que
    // nous ignorons ne serait crédité par aucun des trois chemins.
    console.error('[Abonnement] enregistrement :', erreurPose.message);
    return reponse({ erreur: 'ENREGISTREMENT_IMPOSSIBLE' }, 500, requete);
  }

  return reponse({ checkoutUrl, paiementId: pose.id }, 201, requete);
});
```

- [ ] **Step 2: Vérifier que rien n'est cassé**

Run: `npx vitest run --config supabase/tests/vitest.config.ts`
Expected: PASS — la suite entière.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/abonnement-payer/
git commit -m "feat(abonnement): créer la vente, sans jamais laisser le téléphone fixer un montant"
```

---

## Task 6: Le webhook, premier point d'entrée public

**Files:**
- Create: `supabase/functions/chariow-webhook/index.ts`
- Modify: `supabase/config.toml` (ajouter la section `[functions.chariow-webhook]` en fin de fichier)

**Interfaces:**
- Consumes: `secretValide` de `_shared/chariow.ts` ; `creerDepot`, `chargerPaiementsRattrapables` ; `reconcilier`.
- Produces: l'Edge Function `chariow-webhook`. Aucune interface consommée par une tâche suivante.

- [ ] **Step 1: Écrire la fonction**

Créer `supabase/functions/chariow-webhook/index.ts` :

```ts
import { createClient } from 'npm:@supabase/supabase-js@2';

import { secretValide } from '../_shared/chariow.ts';
import { chargerPaiementsRattrapables, creerDepot } from '../_shared/depot-chariow.ts';
import { reconcilier } from '../_shared/reconciliation.ts';

/**
 * Le webhook « Pulse » de Chariow.
 *
 * ## Le premier point d'entrée public du projet
 *
 * Les six autres Edge Functions exigent toutes un jeton ; celle-ci ne peut pas.
 * Chariow ne signe pas ses appels — `Docs/Chariow.md` §7 — et le seul secret
 * partagé voyage dans l'URL. `supabase/config.toml` porte donc, pour cette
 * fonction et pour elle seule, `verify_jwt = false`.
 *
 * Quatre garde-fous en contrepartie :
 *
 * 1. **Le secret est comparé en temps constant.** Une comparaison de chaînes
 *    s'arrête au premier caractère différent et fuit la longueur du préfixe
 *    correct.
 * 2. **La fonction ne crédite rien par elle-même.** Le corps du webhook n'est
 *    pas une preuve de paiement : il dit seulement *quelle* vente relire. La
 *    décision vient toujours d'un `GET /sales/{id}`. C'est ce qui rend le
 *    secret non critique — le connaître permet de déclencher une relecture,
 *    pas d'obtenir un abonnement.
 * 3. **Aucun en-tête CORS.** Aucun navigateur n'appelle cette adresse.
 * 4. **200 même sur un événement inconnu**, pour ne pas provoquer de vagues de
 *    réessais ; 401 sur secret invalide, sans autre détail.
 */

const JSON_ENTETES = { 'Content-Type': 'application/json' };

function reponse(corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: JSON_ENTETES });
}

Deno.serve(async (requete) => {
  if (requete.method !== 'POST') {
    return reponse({ erreur: 'METHODE_NON_AUTORISEE' }, 405);
  }

  const secretAttendu = Deno.env.get('CHARIOW_SECRET_WEBHOOK') ?? '';
  const secretRecu = new URL(requete.url).searchParams.get('secret');

  if (!(await secretValide(secretRecu, secretAttendu))) {
    return reponse({ erreur: 'SECRET_INVALIDE' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const cleService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cleApi = Deno.env.get('CHARIOW_CLE_API');
  const racine = Deno.env.get('CHARIOW_API_URL') ?? 'https://api.chariow.com/v1';

  if (!url || !cleService || !cleApi) {
    console.error('Configuration incomplète.');
    return reponse({ erreur: 'CONFIGURATION' }, 500);
  }

  let charge: Record<string, unknown>;
  try {
    charge = (await requete.json()) as Record<string, unknown>;
  } catch {
    // Corps illisible : on accuse réception sans rien faire. Réessayer
    // n'améliorerait pas un corps mal formé.
    return reponse({ recu: true }, 200);
  }

  const donnees = (charge.data ?? charge) as Record<string, unknown>;
  const metadonnees = (donnees.custom_metadata ?? {}) as Record<string, unknown>;
  const venteId = typeof donnees.id === 'string' ? donnees.id : null;

  const clientService = createClient(url, cleService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Identifier le collecteur : d'abord par les métadonnées de la vente, sinon
  // en cherchant l'identifiant de vente dans notre registre.
  let collecteurId =
    typeof metadonnees.collecteurId === 'string' ? metadonnees.collecteurId : null;

  if (!collecteurId && venteId) {
    const { data } = await clientService
      .from('paiements_abonnement')
      .select('collecteur_id')
      .eq('vente_id', venteId)
      .maybeSingle();
    collecteurId = (data?.collecteur_id as string | undefined) ?? null;
  }

  if (!collecteurId) {
    // Événement qui ne nous concerne pas, ou vente inconnue. On accuse
    // réception : provoquer des réessais sur un événement étranger n'aide
    // personne.
    console.error('[Abonnement] webhook sans collecteur identifiable');
    return reponse({ recu: true }, 200);
  }

  try {
    const paiements = await chargerPaiementsRattrapables(clientService, collecteurId);
    const resultat = await reconcilier(paiements, creerDepot(clientService, { racine, cleApi }));
    return reponse({ recu: true, credites: resultat.credites }, 200);
  } catch (cause) {
    console.error('[Abonnement] webhook :', cause instanceof Error ? cause.message : cause);
    // 500 ici est utile : il fait réessayer Chariow, et une panne de notre côté
    // mérite un réessai.
    return reponse({ erreur: 'RECONCILIATION_IMPOSSIBLE' }, 500);
  }
});
```

- [ ] **Step 2: Ouvrir la fonction dans la configuration**

Ajouter en fin de `supabase/config.toml` :

```toml
# ---------------------------------------------------------------------------
# Edge Functions
# ---------------------------------------------------------------------------
# Première section [functions] du projet, et elle n'existe que pour une
# fonction. Les six autres exigent toutes un jeton ; celle-ci ne peut pas —
# Chariow ne signe pas ses webhooks et ne porte aucune identité Supabase.
#
# Ce que `verify_jwt = false` ouvre exactement : le droit d'atteindre le code
# de la fonction. Pas le droit d'obtenir quoi que ce soit — le secret d'URL est
# comparé en temps constant, et la fonction ne crédite jamais sur la foi du
# corps reçu : elle relit le statut chez Chariow avant toute décision.
#
# Au déploiement, la ligne de commande doit le redire :
#   npx supabase functions deploy chariow-webhook --no-verify-jwt
[functions.chariow-webhook]
verify_jwt = false
```

- [ ] **Step 3: Vérifier que la configuration est lisible**

Run: `npx supabase status -o json`
Expected: la commande répond sans erreur d'analyse du fichier `config.toml`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/chariow-webhook/ supabase/config.toml
git commit -m "feat(abonnement): le webhook Chariow, public mais incapable de créditer seul"
```

---

## Task 7: La suppression d'un collecteur compte les paiements

**Files:**
- Modify: `supabase/functions/admin-supprimer-collecteur/index.ts:152-177`
- Test: `supabase/tests/abonnement.test.ts` (ajouter un cas)

**Interfaces:**
- Consumes: la table `public.paiements_abonnement` de la tâche 2.
- Produces: le code d'erreur `COMPTE_A_PAYE` dans la réponse 409 de `admin-supprimer-collecteur`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `supabase/tests/abonnement.test.ts` :

```ts
describe('suppression d’un collecteur', () => {
  it('est refusée en base dès qu’un paiement existe', async () => {
    const payeur = await creerCollecteur('Payeur', `+225070004${Date.now() % 1000}`);
    await poserPaiement(payeur.id, `vente-suppr-${crypto.randomUUID()}`);

    // `on delete restrict` : la cascade depuis auth.users s'arrête net.
    const { error } = await admin.auth.admin.deleteUser(payeur.id);
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/abonnement.test.ts`
Expected: PASS déjà — la contrainte `on delete restrict` existe depuis la tâche 2. Ce test verrouille le comportement en base ; la modification de l'étape 3 sert à le rendre **lisible** côté Edge Function plutôt qu'à le créer.

Si le test échoue, la contrainte de clé étrangère de la tâche 2 n'a pas été écrite en `restrict` : la corriger avant de continuer.

- [ ] **Step 3: Compter les paiements dans la fonction**

Dans `supabase/functions/admin-supprimer-collecteur/index.ts`, remplacer le bloc des lignes 152 à 177 par :

```ts
  const [{ count: mises }, { count: retraits }, { count: paiements }, { count: clients }] =
    await Promise.all([
      clientService
        .from('mises')
        .select('id', { count: 'exact', head: true })
        .eq('collecteur_id', collecteurId),
      clientService
        .from('retraits')
        .select('id', { count: 'exact', head: true })
        .eq('collecteur_id', collecteurId),
      // Ajouté en J5 : `paiements_abonnement.collecteur_id` est en `on delete
      // restrict`, comme les deux précédentes. Sans ce comptage, le premier
      // collecteur ayant réglé son abonnement deviendrait indélétable avec une
      // violation de clé étrangère brute, illisible pour qui l'affiche.
      clientService
        .from('paiements_abonnement')
        .select('id', { count: 'exact', head: true })
        .eq('collecteur_id', collecteurId),
      clientService
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('collecteur_id', collecteurId),
    ]);

  if ((mises ?? 0) > 0 || (retraits ?? 0) > 0) {
    return reponse(
      {
        erreur: 'COMPTE_A_ENCAISSE',
        mises: mises ?? 0,
        retraits: retraits ?? 0,
      },
      409,
      requete,
    );
  }

  // Un compte qui n'a jamais encaissé mais qui a payé son abonnement reste une
  // écriture comptable de GTCS. Le message est distinct : le remède n'est pas
  // le même — on ne suspend pas un abonnement pour effacer une facture.
  if ((paiements ?? 0) > 0) {
    return reponse({ erreur: 'COMPTE_A_PAYE', paiements: paiements ?? 0 }, 409, requete);
  }
```

- [ ] **Step 4: Ajouter le message côté administration**

Dans `apps/admin/src/donnees.ts`, ajouter une entrée au dictionnaire `MESSAGES_SUPPRESSION` — celui que `supprimerCollecteur` consulte en dernier recours, après la branche nommée `COMPTE_A_ENCAISSE` :

```ts
  COMPTE_A_PAYE:
    'Ce collecteur a réglé au moins un abonnement. Son compte porte une écriture comptable et ne peut pas être supprimé — suspends son abonnement à la place.',
```

- [ ] **Step 5: Lancer la suite**

Run: `npx vitest run --config supabase/tests/vitest.config.ts && npm test`
Expected: PASS — suite de base et suites d'applications.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-supprimer-collecteur/index.ts supabase/tests/abonnement.test.ts apps/admin/src/donnees.ts
git commit -m "fix(admin): la suppression bute désormais sur les paiements en le disant"
```

---

## Task 8: Deux motifs de fuite propres à Chariow

**Files:**
- Modify: `scripts/verifier-bundles.mjs:7-17`
- Test: `scripts/verifier-bundles.test.mjs`

**Interfaces:**
- Consumes: `MOTIFS` et `chercherFuitesTexte`, déjà exportés.
- Produces: deux entrées de plus dans `MOTIFS`. `verifier-en-ligne.mjs` les applique automatiquement aux artefacts servis, sans modification.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `scripts/verifier-bundles.test.mjs` :

```js
describe('motifs Chariow', () => {
  it('signale un appel direct à Chariow depuis un artefact', () => {
    // Le front ne parle jamais à Chariow : il appelle une Edge Function, qui
    // détient la clé. Une adresse `api.chariow.com` dans un paquet signifie
    // qu'un appel est parti du navigateur — donc que la clé a suivi, ou est sur
    // le point de suivre.
    expect(chercherFuitesTexte('fetch("https://api.chariow.com/v1/checkout")')).toContain(
      'appel direct à Chariow',
    );
  });

  it('signale le nom de la variable de clé Chariow', () => {
    expect(chercherFuitesTexte('const k = import.meta.env.VITE_CHARIOW_CLE_API')).toContain(
      'clé Chariow exposée',
    );
  });

  it('laisse passer un artefact ordinaire', () => {
    expect(chercherFuitesTexte('const url = "https://exemple.supabase.co"')).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npx vitest run scripts/verifier-bundles.test.mjs`
Expected: FAIL — les deux premiers tests, `expected [] to include 'appel direct à Chariow'`.

- [ ] **Step 3: Ajouter les motifs**

Dans `scripts/verifier-bundles.mjs`, ajouter à la fin du tableau `MOTIFS` (après l'entrée `clé secrète Supabase`) :

```js
  // La forme du jeton Chariow n'est pas documentée, donc on ne la cherche pas :
  // on cherche l'**usage** qui la ferait fuir. Le front n'appelle jamais
  // Chariow — il passe par une Edge Function, qui seule détient la clé. Une
  // adresse du fournisseur dans un artefact signifie qu'un appel part du
  // navigateur, et un appel authentifié depuis le navigateur emporte la clé.
  { nom: 'appel direct à Chariow', regex: /api\.chariow\.com/ },
  // Et le cas franc : quelqu'un a préfixé la clé d'un `VITE_`, ce qui la publie
  // quel que soit le nom du fichier où elle est écrite.
  { nom: 'clé Chariow exposée', regex: /(VITE|REACT_APP|NEXT_PUBLIC)_CHARIOW/ },
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run scripts/verifier-bundles.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/verifier-bundles.mjs scripts/verifier-bundles.test.mjs
git commit -m "test(securite): chercher l'usage qui ferait fuir la clé Chariow, pas sa forme"
```

---

## Task 9: Le champ téléphone à sélecteur de pays

**Files:**
- Create: `packages/ui/src/ChampTelephone.tsx`
- Modify: `packages/ui/src/index.ts`
- Test: `packages/ui/src/ChampTelephone.test.tsx`

**Interfaces:**
- Consumes: rien.
- Produces: `ChampTelephone` · `type ValeurTelephone = { pays: string; local: string; e164: string; valide: boolean }` · `composerE164(pays: string, local: string): string` · `PAYS_TELEPHONE`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `packages/ui/src/ChampTelephone.test.tsx` :

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChampTelephone, composerE164 } from './ChampTelephone';

/**
 * Le formulaire de paiement envoie trois champs au serveur — E.164, pays ISO2,
 * numéro national. `Docs/Chariow.md` §3bis : la quasi-totalité des échecs de
 * création de checkout viennent d'un téléphone mal transmis, et le repli
 * serveur ne sait déduire le pays que des indicatifs africains.
 */

describe('composerE164', () => {
  it('retire le zéro national et pose l’indicatif', () => {
    expect(composerE164('CI', '0700000000')).toBe('+225700000000');
  });

  it('ignore les espaces et les tirets de saisie', () => {
    expect(composerE164('CI', '07 00 00 00 00')).toBe('+225700000000');
  });

  it('rend une chaîne vide sur un pays inconnu', () => {
    expect(composerE164('ZZ', '0700000000')).toBe('');
  });
});

describe('ChampTelephone', () => {
  it('remonte les trois formes à chaque frappe', () => {
    const onChange = vi.fn();
    render(<ChampTelephone libelle="Téléphone" valeur={{ pays: 'CI', local: '' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '0700000000' } });

    expect(onChange).toHaveBeenCalledWith({
      pays: 'CI',
      local: '0700000000',
      e164: '+225700000000',
      valide: true,
    });
  });

  it('marque invalide un numéro trop court', () => {
    const onChange = vi.fn();
    render(<ChampTelephone libelle="Téléphone" valeur={{ pays: 'CI', local: '' }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '070' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ valide: false }));
  });

  it('recompose l’E.164 quand le pays change', () => {
    const onChange = vi.fn();
    render(
      <ChampTelephone libelle="Téléphone" valeur={{ pays: 'CI', local: '0700000000' }} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('Pays'), { target: { value: 'SN' } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pays: 'SN', e164: '+221700000000' }),
    );
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test --workspace @kolek/ui`
Expected: FAIL — `Failed to resolve import "./ChampTelephone"`.

Si `@testing-library/react` n'est pas installé dans `packages/ui`, l'ajouter d'abord :
`npm install --save-dev --workspace @kolek/ui @testing-library/react`

- [ ] **Step 3: Écrire le composant**

Créer `packages/ui/src/ChampTelephone.tsx` :

```tsx
import { useId } from 'react';

/**
 * Saisie d'un numéro : un pays, un numéro national.
 *
 * Ce découpage n'est pas une préférence d'interface, c'est ce que le
 * fournisseur de paiement exige — `Docs/Chariow.md` §3bis. Un E.164 brut lui
 * revient en « 400 Invalid phone number », et un numéro sans pays n'est
 * rattrapable côté serveur que si son indicatif est africain.
 *
 * Le composant remonte les **trois** formes à chaque frappe. Le serveur les
 * reçoit toutes les trois et tranche lui-même : le front ne pré-nettoie rien.
 */

export interface PaysTelephone {
  /** ISO2, ce que le fournisseur attend. */
  code: string;
  nom: string;
  /** Indicatif, sans le `+`. */
  indicatif: string;
}

/** Les pays du marché. La Côte d'Ivoire d'abord : c'est celui du pilote. */
export const PAYS_TELEPHONE: readonly PaysTelephone[] = [
  { code: 'CI', nom: 'Côte d’Ivoire', indicatif: '225' },
  { code: 'SN', nom: 'Sénégal', indicatif: '221' },
  { code: 'BJ', nom: 'Bénin', indicatif: '229' },
  { code: 'TG', nom: 'Togo', indicatif: '228' },
  { code: 'BF', nom: 'Burkina Faso', indicatif: '226' },
  { code: 'ML', nom: 'Mali', indicatif: '223' },
  { code: 'NE', nom: 'Niger', indicatif: '227' },
  { code: 'GN', nom: 'Guinée', indicatif: '224' },
  { code: 'CM', nom: 'Cameroun', indicatif: '237' },
  { code: 'FR', nom: 'France', indicatif: '33' },
];

const LONGUEUR_MIN = 6;
const LONGUEUR_MAX = 15;

function chiffres(brut: string): string {
  return brut.replace(/\D/g, '');
}

function sansZeroDeTete(national: string): string {
  return national.replace(/^0+/, '');
}

/** Compose l'E.164. Rend une chaîne vide si le pays n'est pas dans la liste. */
export function composerE164(pays: string, local: string): string {
  const trouve = PAYS_TELEPHONE.find((p) => p.code === pays);
  if (!trouve) return '';
  const national = sansZeroDeTete(chiffres(local));
  if (!national) return '';
  return `+${trouve.indicatif}${national}`;
}

export interface ValeurTelephone {
  pays: string;
  local: string;
  e164: string;
  valide: boolean;
}

interface Props {
  libelle: string;
  valeur: { pays: string; local: string };
  onChange: (valeur: ValeurTelephone) => void;
  className?: string;
}

export function ChampTelephone({ libelle, valeur, onChange, className = '' }: Props) {
  const idPays = useId();
  const idNumero = useId();

  function remonter(pays: string, local: string) {
    const national = sansZeroDeTete(chiffres(local));
    onChange({
      pays,
      local,
      e164: composerE164(pays, local),
      valide: national.length >= LONGUEUR_MIN && national.length <= LONGUEUR_MAX,
    });
  }

  return (
    <div className={className}>
      <div className="flex gap-2">
        <div className="w-32 shrink-0">
          <label htmlFor={idPays} className="block text-sm font-body font-semibold text-ink mb-1.5">
            Pays
          </label>
          <select
            id={idPays}
            value={valeur.pays}
            onChange={(e) => remonter(e.target.value, valeur.local)}
            className="w-full min-h-11 px-2 bg-input border-[1.5px] border-hairline rounded-md text-base font-body text-ink outline-none focus:border-primary"
          >
            {PAYS_TELEPHONE.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} +{p.indicatif}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-0">
          <label
            htmlFor={idNumero}
            className="block text-sm font-body font-semibold text-ink mb-1.5"
          >
            {libelle}
          </label>
          <input
            id={idNumero}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={valeur.local}
            onChange={(e) => remonter(valeur.pays, e.target.value)}
            className="w-full min-h-11 px-3.5 bg-input border-[1.5px] border-hairline rounded-md text-base font-body text-ink outline-none focus:border-primary"
          />
        </div>
      </div>
      <p className="mt-1.5 text-xs font-body text-muted-foreground">
        Le numéro qui recevra la demande de paiement Mobile Money.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Exporter le composant**

Ajouter à `packages/ui/src/index.ts`, en respectant l'ordre alphabétique (après la ligne `Champ`) :

```ts
export {
  ChampTelephone,
  composerE164,
  PAYS_TELEPHONE,
  type PaysTelephone,
  type ValeurTelephone,
} from './ChampTelephone';
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test --workspace @kolek/ui`
Expected: PASS — 6 nouveaux tests.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/ChampTelephone.tsx packages/ui/src/ChampTelephone.test.tsx packages/ui/src/index.ts
git commit -m "feat(ui): un champ téléphone qui rend les trois formes que le paiement exige"
```

---

## Task 10: Les appels d'abonnement côté application

**Files:**
- Create: `apps/collecteur/src/abonnement.ts`
- Test: `apps/collecteur/src/abonnement.test.ts`

**Interfaces:**
- Consumes: `supabase` de `apps/collecteur/src/supabase.ts`.
- Produces: `demarrerPaiement(saisie: SaisiePaiement): Promise<ResultatPaiement>` · `verifierPaiements(): Promise<Verification>` · `messagePour(code: string): string` · types `SaisiePaiement`, `ResultatPaiement`, `Verification`.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `apps/collecteur/src/abonnement.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

const { supabase } = await import('./supabase');
const { demarrerPaiement, messagePour, verifierPaiements } = await import('./abonnement');

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

/**
 * Ce module traduit une fois, à un seul endroit, les codes courts du serveur en
 * phrases lisibles au marché. Les tests portent surtout sur la lecture du corps
 * d'une réponse non-2xx : sans elle, un refus légitime s'affiche comme « Edge
 * Function returned a non-2xx status code », et personne ne sait quoi en faire.
 */

describe('demarrerPaiement', () => {
  it('rend l’URL de paiement', async () => {
    invoke.mockResolvedValueOnce({ data: { checkoutUrl: 'https://pay.test/x' }, error: null });

    const resultat = await demarrerPaiement({
      palier: 'pro',
      telephone: '+225700000000',
      paysTelephone: 'CI',
      telephoneLocal: '0700000000',
    });

    expect(resultat).toEqual({ ok: true, checkoutUrl: 'https://pay.test/x' });
  });

  it('traduit le code d’erreur lu dans le corps de la réponse', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'non-2xx', context: { json: async () => ({ erreur: 'TELEPHONE_INVALIDE' }) } },
    });

    const resultat = await demarrerPaiement({
      palier: 'pro',
      telephone: '',
      paysTelephone: 'CI',
      telephoneLocal: '',
    });

    expect(resultat).toEqual({ ok: false, message: messagePour('TELEPHONE_INVALIDE') });
    expect(resultat).not.toEqual(expect.objectContaining({ message: 'non-2xx' }));
  });

  it('refuse une réponse sans URL plutôt que de partir nulle part', async () => {
    invoke.mockResolvedValueOnce({ data: {}, error: null });

    const resultat = await demarrerPaiement({
      palier: 'pro',
      telephone: '+225700000000',
      paysTelephone: 'CI',
      telephoneLocal: '0700000000',
    });

    expect(resultat.ok).toBe(false);
  });
});

describe('verifierPaiements', () => {
  it('rend le décompte du serveur', async () => {
    invoke.mockResolvedValueOnce({
      data: { credites: 1, enAttente: 0, echeance: '2026-09-21' },
      error: null,
    });

    expect(await verifierPaiements()).toEqual({ credites: 1, enAttente: 0, echeance: '2026-09-21' });
  });

  it('rend un décompte nul plutôt que de jeter quand le réseau manque', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'réseau' } });

    expect(await verifierPaiements()).toEqual({ credites: 0, enAttente: 0, echeance: null });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test --workspace @kolek/collecteur`
Expected: FAIL — `Cannot find module './abonnement'`.

- [ ] **Step 3: Écrire le module**

Créer `apps/collecteur/src/abonnement.ts` :

```ts
import { supabase } from './supabase';

/**
 * Les deux appels du paiement d'abonnement.
 *
 * Le montant n'apparaît nulle part ici, et c'est une propriété : le prix vit
 * dans la boutique du fournisseur, jamais dans une requête partie du téléphone.
 * Ce module n'envoie qu'un palier et un numéro.
 */

const MESSAGES: Record<string, string> = {
  JETON_ABSENT: 'Session expirée. Reconnecte-toi.',
  ACCES_RESERVE: 'Session invalide. Reconnecte-toi.',
  COMPTE_SANS_ADRESSE: 'Ton compte n’a pas d’adresse électronique. Contacte GTCS.',
  PALIER_INCONNU: 'Choisis une formule avant de payer.',
  PALIER_NON_PAYANT: 'La formule d’essai est gratuite : il n’y a rien à régler.',
  TELEPHONE_INVALIDE: 'Ce numéro n’est pas utilisable. Vérifie le pays et le numéro.',
  SAISIE_REFUSEE: 'Le service de paiement a refusé ces informations. Vérifie ton numéro.',
  FICHE_INTROUVABLE: 'Ta fiche est introuvable. Contacte GTCS.',
  ABONNEMENT_DU_TITULAIRE:
    'Ton abonnement est payé par ton titulaire. Tu n’as rien à régler.',
  CHECKOUT_IMPOSSIBLE: 'Le service de paiement ne répond pas. Réessaie dans un moment.',
  CHECKOUT_INCOMPLET: 'Le service de paiement a répondu incomplètement. Réessaie.',
  ENREGISTREMENT_IMPOSSIBLE:
    'Le paiement n’a pas pu être enregistré chez nous. N’envoie pas d’argent — préviens GTCS.',
  CONFIGURATION: 'Le paiement n’est pas configuré. Préviens GTCS.',
  RECONCILIATION_IMPOSSIBLE: 'Impossible de vérifier le paiement pour l’instant.',
  CORPS_ILLISIBLE: 'Requête mal formée.',
};

export function messagePour(code: string): string {
  return MESSAGES[code] ?? 'Paiement impossible. Réessaie.';
}

/** Lit le code d'erreur dans le corps d'une réponse non-2xx. */
async function codeDErreur(erreur: unknown): Promise<string | undefined> {
  try {
    const contexte = (erreur as { context?: Response }).context;
    if (contexte && typeof contexte.json === 'function') {
      return ((await contexte.json()) as { erreur?: string }).erreur;
    }
  } catch {
    // Corps illisible : on retombe sur le message générique.
  }
  return undefined;
}

export interface SaisiePaiement {
  palier: string;
  telephone: string;
  paysTelephone: string;
  telephoneLocal: string;
}

export type ResultatPaiement =
  | { ok: true; checkoutUrl: string }
  | { ok: false; message: string };

export async function demarrerPaiement(saisie: SaisiePaiement): Promise<ResultatPaiement> {
  const { data, error } = await supabase.functions.invoke('abonnement-payer', { body: saisie });

  if (error) {
    const code = await codeDErreur(error);
    return { ok: false, message: code ? messagePour(code) : messagePour('') };
  }

  const url = (data as { checkoutUrl?: unknown } | null)?.checkoutUrl;
  // Jamais de départ sur une réponse incomplète : mieux vaut un message qu'une
  // navigation vers rien.
  if (typeof url !== 'string' || !url) {
    return { ok: false, message: messagePour('CHECKOUT_INCOMPLET') };
  }
  return { ok: true, checkoutUrl: url };
}

export interface Verification {
  credites: number;
  enAttente: number;
  echeance: string | null;
}

/**
 * Appelée par l'écran de retour **et** à chaque ouverture de l'application.
 *
 * Ne jette jamais : à l'ouverture, une panne de réseau ne doit pas empêcher le
 * carnet de s'afficher. Un décompte nul se lit « rien de nouveau », ce qui est
 * exactement ce qu'on sait dans ce cas.
 */
export async function verifierPaiements(): Promise<Verification> {
  const { data, error } = await supabase.functions.invoke('abonnement-verifier', { body: {} });

  if (error || !data) return { credites: 0, enAttente: 0, echeance: null };

  const lu = data as Partial<Verification>;
  return {
    credites: Number(lu.credites ?? 0),
    enAttente: Number(lu.enAttente ?? 0),
    echeance: lu.echeance ?? null,
  };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test --workspace @kolek/collecteur`
Expected: PASS — 5 nouveaux tests.

- [ ] **Step 5: Commit**

```bash
git add apps/collecteur/src/abonnement.ts apps/collecteur/src/abonnement.test.ts
git commit -m "feat(collecteur): les deux appels du paiement, et leurs phrases"
```

---

## Task 11: Les deux écrans du collecteur

**Files:**
- Create: `apps/collecteur/src/ecrans/Abonnement.tsx`
- Create: `apps/collecteur/src/ecrans/RetourPaiement.tsx`
- Modify: `apps/collecteur/src/ecrans/Plus.tsx`
- Modify: `apps/collecteur/src/Coquille.tsx`

**Interfaces:**
- Consumes: `demarrerPaiement`, `verifierPaiements`, `messagePour` de `abonnement.ts` ; `ChampTelephone`, `type ValeurTelephone` de `@kolek/ui` ; `PALIERS`, `formatMontant` de `@kolek/core`.
- Produces: `Abonnement` · `RetourPaiement` · deux clés d'écran secondaire, `'abonnement'` et `'retour-paiement'`.

- [ ] **Step 1: Écrire l'écran de choix**

Créer `apps/collecteur/src/ecrans/Abonnement.tsx` :

```tsx
import { PALIERS, formatMontant } from '@kolek/core';
import { Bouton, Carte, ChampTelephone, useEnLigne, type ValeurTelephone } from '@kolek/ui';
import { useState } from 'react';

import { demarrerPaiement } from '../abonnement';
import { CorpsEcran, EnTeteEcran } from './EnTeteEcran';

/**
 * Régler son abonnement.
 *
 * Deux propriétés de cet écran méritent d'être dites, parce qu'elles ne se
 * voient pas :
 *
 * 1. **Aucun montant ne part d'ici.** L'écran affiche les prix de la grille,
 *    mais n'envoie qu'un nom de palier. Le prix débité est celui du produit
 *    configuré chez le fournisseur — c'est lui qui fait foi, et le laisser
 *    décider est ce qui rend impossible un débit fabriqué depuis le téléphone.
 * 2. **C'est le seul geste du produit qui exige le réseau.** Tout le reste est
 *    pensé hors-ligne d'abord. Le bouton le dit plutôt que de laisser partir un
 *    appel qui échouera.
 */

const PAYANTS = PALIERS.filter((p) => p.prix > 0);

export function Abonnement({
  palierCourant,
  telephoneCollecteur,
  onRetour,
}: {
  palierCourant: string;
  telephoneCollecteur: string;
  onRetour: () => void;
}) {
  const enLigne = useEnLigne();
  const [choisi, setChoisi] = useState(palierCourant === 'essai' ? 'pro' : palierCourant);
  const [telephone, setTelephone] = useState<ValeurTelephone>({
    pays: 'CI',
    local: telephoneCollecteur,
    e164: '',
    valide: false,
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function payer() {
    setErreur(null);
    setEnCours(true);

    const resultat = await demarrerPaiement({
      palier: choisi,
      telephone: telephone.e164,
      paysTelephone: telephone.pays,
      telephoneLocal: telephone.local,
    });

    if (!resultat.ok) {
      setErreur(resultat.message);
      setEnCours(false);
      return;
    }

    // Navigation de premier niveau, et non `fetch` : la page de paiement est
    // hébergée par le fournisseur, et la CSP ne l'autoriserait pas en `connect-src`.
    window.location.assign(resultat.checkoutUrl);
  }

  const pretAPayer = enLigne && telephone.valide && !enCours;

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran titre="Abonnement" sousTitre="Régler par Mobile Money" onRetour={onRetour} />

      <CorpsEcran
        enfants={
          <>
            {!enLigne && (
              <Carte>
                <p className="font-body text-sm text-ink">
                  Le paiement a besoin du réseau. Reviens ici une fois connecté — ta tournée,
                  elle, continue sans.
                </p>
              </Carte>
            )}

            {PAYANTS.map((palier) => {
              const actif = palier.cle === choisi;
              return (
                <button
                  key={palier.cle}
                  type="button"
                  onClick={() => setChoisi(palier.cle)}
                  aria-pressed={actif}
                  className={`w-full text-left rounded-lg border-[1.5px] p-4 cursor-pointer ${
                    actif ? 'border-primary bg-surface' : 'border-hairline bg-surface'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-headings font-bold text-lg text-ink">{palier.nom}</span>
                    <span className="font-headings font-bold text-lg text-primary">
                      {formatMontant(palier.prix)} FCFA
                    </span>
                  </div>
                  <p className="font-body text-sm text-muted-foreground mt-1">
                    {palier.limite} · par {palier.periode}
                  </p>
                </button>
              );
            })}

            <Carte>
              <ChampTelephone
                libelle="Numéro Mobile Money"
                valeur={{ pays: telephone.pays, local: telephone.local }}
                onChange={setTelephone}
              />
            </Carte>

            {erreur && (
              <Carte>
                <p className="font-body text-sm text-ink">{erreur}</p>
              </Carte>
            )}

            <Bouton
              pleineLargeur
              disabled={!pretAPayer}
              title={
                !enLigne
                  ? 'Le paiement a besoin du réseau.'
                  : !telephone.valide
                    ? 'Saisis un numéro complet.'
                    : undefined
              }
              onClick={() => void payer()}
            >
              {enCours ? 'Ouverture du paiement…' : 'Payer 30 jours'}
            </Bouton>

            <p className="font-body text-xs text-muted-foreground text-center">
              Le paiement se fait sur la page sécurisée de notre encaisseur. Ton abonnement
              s’active dès le règlement confirmé.
            </p>
          </>
        }
      />
    </div>
  );
}
```

- [ ] **Step 2: Écrire l'écran de retour**

Créer `apps/collecteur/src/ecrans/RetourPaiement.tsx` :

```tsx
import { Bouton, Carte } from '@kolek/ui';
import { useEffect, useRef, useState } from 'react';

import { verifierPaiements } from '../abonnement';
import { CorpsEcran, EnTeteEcran } from './EnTeteEcran';

/**
 * Le retour depuis la page de paiement.
 *
 * **Rien n'est conclu depuis l'URL.** Le fournisseur peut y poser un `status`,
 * et un collecteur peut le réécrire : c'est un indice, jamais une preuve. Le
 * seul verdict vient du serveur, qui relit la vente chez l'encaisseur.
 *
 * Le sondage s'arrête au bout d'une minute. Passé ce délai, l'écran ne ment pas
 * : il dit que la confirmation prendra un moment et que l'abonnement s'activera
 * seul — ce qui est vrai, le webhook et la prochaine ouverture s'en chargeront.
 */

const INTERVALLE_MS = 3000;
const LIMITE_MS = 60000;

type Etat =
  | { phase: 'attente' }
  | { phase: 'credite'; echeance: string | null }
  | { phase: 'lent' };

function dateLisible(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function RetourPaiement({ onTermine }: { onTermine: () => void }) {
  const [etat, setEtat] = useState<Etat>({ phase: 'attente' });
  const depart = useRef(Date.now());

  useEffect(() => {
    let vivant = true;
    let minuteur: ReturnType<typeof setTimeout>;

    async function sonder() {
      const resultat = await verifierPaiements();
      if (!vivant) return;

      if (resultat.credites > 0) {
        setEtat({ phase: 'credite', echeance: resultat.echeance });
        return;
      }
      if (Date.now() - depart.current >= LIMITE_MS) {
        setEtat({ phase: 'lent' });
        return;
      }
      minuteur = setTimeout(() => void sonder(), INTERVALLE_MS);
    }

    void sonder();
    return () => {
      vivant = false;
      clearTimeout(minuteur);
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran titre="Paiement" sousTitre="Confirmation" onRetour={onTermine} />

      <CorpsEcran
        enfants={
          <>
            {etat.phase === 'attente' && (
              <Carte>
                <p className="font-headings font-bold text-lg text-ink mb-1">
                  Confirmation en cours…
                </p>
                <p className="font-body text-sm text-muted-foreground">
                  On vérifie le règlement auprès de l’encaisseur. Ne ferme pas l’application.
                </p>
              </Carte>
            )}

            {etat.phase === 'credite' && (
              <Carte>
                <p className="font-headings font-bold text-lg text-ink mb-1">Abonnement actif</p>
                <p className="font-body text-sm text-muted-foreground">
                  {etat.echeance
                    ? `Ton abonnement court jusqu’au ${dateLisible(etat.echeance)}.`
                    : 'Ton abonnement est à jour.'}
                </p>
              </Carte>
            )}

            {etat.phase === 'lent' && (
              <Carte>
                <p className="font-headings font-bold text-lg text-ink mb-1">
                  Confirmation en attente
                </p>
                <p className="font-body text-sm text-muted-foreground">
                  Le règlement met plus de temps que d’habitude à nous parvenir. Si tu as bien
                  payé, ton abonnement s’activera tout seul — rouvre l’application dans un
                  moment. Rien à refaire, et surtout ne paie pas deux fois.
                </p>
              </Carte>
            )}

            <Bouton pleineLargeur variante="contour" onClick={onTermine}>
              Revenir au carnet
            </Bouton>
          </>
        }
      />
    </div>
  );
}
```

- [ ] **Step 3: Ouvrir l'écran depuis « Plus »**

Dans `apps/collecteur/src/ecrans/Plus.tsx` :

Remplacer le paragraphe de l'en-tête qui commence par « L'écran ne propose **aucune modification**. » par :

```
 * L'écran ne propose aucune modification **de fiche** : les colonnes `nom`,
 * `telephone` et `zone` sont bien ouvertes en écriture au collecteur, mais il
 * n'y a pas de formulaire ici — c'est un choix, pas une lacune.
 *
 * L'abonnement, lui, se règle depuis J5. Le collecteur ne *choisit* pas son
 * échéance, il l'achète : le palier ne change qu'après un règlement confirmé
 * par le serveur, jamais par un geste d'interface.
```

Ajouter `onAbonnement` à la signature du composant :

```tsx
export function Plus({ onRetour, onDeconnexion, onAbonnement }: {
  onRetour: () => void;
  onDeconnexion: () => void;
  onAbonnement: () => void;
}) {
```

Et, juste après la carte qui affiche le palier (repérable par l'usage de la variable `tarif`), insérer :

```tsx
            {estCollaborateur ? (
              <p className="font-body text-sm text-muted-foreground">
                Ton abonnement est payé par ton titulaire. Tu n’as rien à régler.
              </p>
            ) : (
              <Bouton pleineLargeur icone="credit-card" onClick={onAbonnement}>
                Renouveler mon abonnement
              </Bouton>
            )}
```

avec, en tête du composant :

```tsx
  const estCollaborateur = useEstCollaborateur();
```

et l'import correspondant :

```tsx
import { useEstCollaborateur } from './commission';
```

**Pourquoi une phrase et non rien.** Un collaborateur qui ne voit aucun bouton
d'abonnement, sur un écran qui affiche son palier Illimité juste au-dessus, se
demande où il paie — et finit par appeler GTCS. La phrase répond à la question
avant qu'elle ne se pose. Elle dit aussi quelque chose de vrai qu'il ignore
peut-être : ce n'est pas lui qui paie.

`useEstCollaborateur` existe déjà dans `apps/collecteur/src/ecrans/commission.ts`
(2026-09-02) : c'est le même hook qui retire à quatre écrans la promesse d'une
commission qui ne lui revient pas. Il lit la clé de cache `'profil'`, celle que
`Plus` alimente déjà — aucune requête de plus.

`credit-card` figure déjà dans `packages/ui/src/Icone.tsx` — rien à y ajouter.

**Le test à ajouter** dans `apps/collecteur/src/ecrans/Plus.test.tsx` — ou le
créer s'il n'existe pas :

```tsx
it('ne propose pas de payer à un collaborateur', async () => {
  chargerProfil.mockResolvedValue({ ...PROFIL, palier: 'illimite', titulaireId: 'patron-1' });
  render(<Plus onRetour={() => {}} onDeconnexion={() => {}} onAbonnement={() => {}} />);

  expect(await screen.findByText(/payé par ton titulaire/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Renouveler/ })).toBeNull();
});
```

Ne pas oublier `viderCache()` dans le `afterEach` : le cache de `useDonnees`
est au niveau du module et survit à `cleanup()` — un test qui suit lirait le
profil du précédent et passerait en mesurant autre chose.

- [ ] **Step 4: Câbler la coquille**

Dans `apps/collecteur/src/Coquille.tsx` :

Étendre le type des écrans secondaires :

```tsx
type EcranSecondaire =
  | 'retrait'
  | 'rapprochement'
  | 'recus'
  | 'alertes'
  | 'plus'
  | 'abonnement'
  | 'retour-paiement';
```

Ajouter les imports :

```tsx
import { verifierPaiements } from './abonnement';
import { Abonnement } from './ecrans/Abonnement';
import { RetourPaiement } from './ecrans/RetourPaiement';
```

Ajouter, après la déclaration d'état `page` :

```tsx
  // Le retour depuis la page de paiement.
  //
  // L'application n'a pas de routeur : la navigation est un état, et
  // `netlify.toml` réécrit toute route sur `index.html`. Un `redirect_url`
  // pointant vers `/paiement/retour` afficherait donc l'accueil. Le retour
  // passe par un paramètre sur la racine, qu'on efface aussitôt lu — sans quoi
  // un rechargement rejouerait l'écran de confirmation indéfiniment.
  useEffect(() => {
    const parametres = new URLSearchParams(window.location.search);
    if (parametres.get('paiement') !== 'retour') return;

    setPage('retour-paiement');
    parametres.delete('paiement');
    const reste = parametres.toString();
    window.history.replaceState({}, '', reste ? `/?${reste}` : '/');
  }, []);

  // Réconciliation silencieuse à l'ouverture : c'est ce qui remplace un cron.
  // Un collecteur qui a payé puis fermé l'onglet est crédité en rouvrant son
  // carnet. Sans effet visible, et sans message d'erreur : une panne de réseau
  // ne doit pas gêner l'affichage du carnet.
  useEffect(() => {
    void verifierPaiements();
  }, []);
```

Dans le rendu, ajouter les deux écrans à côté des autres écrans secondaires :

```tsx
      {page === 'abonnement' && (
        <Abonnement
          palierCourant={palierCollecteur ?? 'essai'}
          telephoneCollecteur={telephoneCollecteur ?? ''}
          onRetour={() => setPage('plus')}
        />
      )}
      {page === 'retour-paiement' && <RetourPaiement onTermine={() => setPage('plus')} />}
```

Et passer la nouvelle propriété à `Plus` :

```tsx
      {page === 'plus' && (
        <Plus
          onRetour={() => setPage('accueil')}
          onDeconnexion={onDeconnexion}
          onAbonnement={() => setPage('abonnement')}
        />
      )}
```

Enfin, étendre la lecture de fiche. Déclarer les deux états à côté de `nomCollecteur` :

```tsx
  const [palierCollecteur, setPalierCollecteur] = useState<string | null>(null);
  const [telephoneCollecteur, setTelephoneCollecteur] = useState<string | null>(null);
```

puis remplacer le second `useEffect` — celui qui lit `nom` dans `collecteurs` — par :

```tsx
  useEffect(() => {
    // Le nom vient de `collecteurs`, pas des métadonnées du jeton : c'est la
    // ligne que le collecteur peut lui-même corriger, et l'écran doit montrer
    // ce qu'il a corrigé. La politique RLS la borne à sa propre ligne.
    //
    // Le palier et le téléphone s'y ajoutent en J5 : l'écran d'abonnement
    // présélectionne la formule courante et pré-remplit le numéro, plutôt que
    // de faire ressaisir au marché ce que la base sait déjà.
    void supabase
      .from('collecteurs')
      .select('nom, palier, telephone')
      .maybeSingle()
      .then(({ data }) => {
        const fiche = data as { nom?: string; palier?: string; telephone?: string } | null;
        setNomCollecteur(fiche?.nom ?? null);
        setPalierCollecteur(fiche?.palier ?? null);
        setTelephoneCollecteur(fiche?.telephone ?? null);
      });
  }, [collecteurId]);
```

- [ ] **Step 5: Vérifier la construction et les tests**

Run: `npm test --workspace @kolek/collecteur && npm run build --workspace @kolek/collecteur`
Expected: PASS, puis une construction sans erreur TypeScript.

- [ ] **Step 6: Commit**

```bash
git add apps/collecteur/src/ecrans/Abonnement.tsx apps/collecteur/src/ecrans/RetourPaiement.tsx apps/collecteur/src/ecrans/Plus.tsx apps/collecteur/src/Coquille.tsx
git commit -m "feat(collecteur): régler son abonnement depuis le carnet"
```

---

## Task 12: L'argent visible côté administration

**Files:**
- Create: `supabase/migrations/20260902170000_admin_paiements.sql`
- Modify: `supabase/functions/admin-vue-globale/index.ts:146-173`
- Modify: `apps/admin/src/donnees.ts`
- Modify: `apps/admin/src/ecrans/Abonnements.tsx`

**Interfaces:**
- Consumes: `public.paiements_abonnement`.
- Produces: `public.admin_paiements_recents()` rendant `{ total_30j, devise, par_collecteur: [{ collecteur_id, dernier_le, dernier_montant }] }` · la clé `paiements` dans la réponse de `admin-vue-globale`.

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20260902170000_admin_paiements.sql` :

```sql
-- Kolek — J5 : ce que l'administration doit voir de l'argent encaissé
--
-- Fonction séparée plutôt qu'un bloc de plus dans `admin_vue_globale()` : cette
-- dernière fait déjà trois cents lignes, et l'Edge Function transmet tout ce
-- qu'elle reçoit sans énumérer les clés. Deux appels coûtent un aller-retour de
-- base ; réécrire une fonction de trois cents lignes pour y greffer un bloc
-- coûte une revue entière.

create or replace function public.admin_paiements_recents()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with regles as (
    select collecteur_id, montant, devise, regle_le
      from public.paiements_abonnement
     where statut = 'regle'
  ),
  derniers as (
    select distinct on (collecteur_id)
           collecteur_id,
           regle_le as dernier_le,
           montant  as dernier_montant,
           devise   as derniere_devise
      from regles
     order by collecteur_id, regle_le desc
  )
  select jsonb_build_object(
    'total_30j', coalesce((
      select sum(montant) from regles where regle_le >= now() - interval '30 days'
    ), 0),
    'nombre_30j', (
      select count(*) from regles where regle_le >= now() - interval '30 days'
    ),
    'par_collecteur', coalesce((
      select jsonb_agg(jsonb_build_object(
        'collecteur_id',   collecteur_id,
        'dernier_le',      dernier_le,
        'dernier_montant', dernier_montant,
        'derniere_devise', derniere_devise
      )) from derniers
    ), '[]'::jsonb)
  );
$$;

comment on function public.admin_paiements_recents is
  'Derniers règlements d''abonnement, par collecteur. Réservée à la clé de service : elle traverse toutes les lignes, ce qu''aucune politique RLS n''accorde.';

revoke all on function public.admin_paiements_recents() from public, anon, authenticated;
grant execute on function public.admin_paiements_recents() to service_role;

-- Garde-fou — le même que pour `admin_vue_globale`, et pour la même raison :
-- `create or replace` réattribue EXECUTE à PUBLIC sans rien dire.
do $$
declare ouverte boolean;
begin
  select has_function_privilege('authenticated', 'public.admin_paiements_recents()', 'EXECUTE')
    into ouverte;
  if ouverte then
    raise exception 'GARDE_FOU : admin_paiements_recents est exécutable par authenticated';
  end if;
end $$;
```

- [ ] **Step 2: Joindre le bloc à la vue globale**

Dans `supabase/functions/admin-vue-globale/index.ts`, ne toucher ni à l'appel `admin_vue_globale`, ni au calcul du MRR. Insérer le bloc ci-dessous **juste avant** le `return` final (ligne 173), et remplacer ce `return` par le sien :

```ts
  // Second appel, plutôt qu'un bloc de plus dans `admin_vue_globale()`. Un
  // échec ici ne doit pas priver l'administration de tout le tableau de bord :
  // les paiements sont une colonne en plus, pas le cœur de l'écran.
  let paiements: unknown = null;
  const { data: lus, error: erreurPaiements } = await clientService.rpc('admin_paiements_recents');
  if (erreurPaiements) {
    console.error('admin_paiements_recents a échoué :', erreurPaiements.message);
  } else {
    paiements = lus;
  }

  return reponse({ ...brut, genereLe: brut.genere_le, abonnements, paiements }, 200, requete);
```

- [ ] **Step 3: Déclarer le type côté application**

Dans `apps/admin/src/donnees.ts`, ajouter à l'interface `VueGlobale` (après `cartes_total_lignes`) :

```ts
  /** Ajouté en J5. `null` si l'agrégation des paiements a échoué — l'écran le
      dit alors, plutôt que d'afficher un tiret qui se lirait « jamais payé ». */
  paiements: {
    total_30j: number;
    nombre_30j: number;
    par_collecteur: Array<{
      collecteur_id: string;
      dernier_le: string;
      dernier_montant: number;
      derniere_devise: string;
    }>;
  } | null;
```

- [ ] **Step 4: Afficher la colonne**

Dans `apps/admin/src/ecrans/Abonnements.tsx` :

Passer la grille de six à sept colonnes :

```tsx
const COLONNES = '1fr 140px 110px 120px 130px 130px 150px';
const LARGEUR_MINIMALE = 'min-w-[1110px]';
```

Ajouter, à côté des autres fonctions d'affichage en tête de fichier :

```tsx
/**
 * Le dernier règlement d'un collecteur.
 *
 * Trois cas, et il faut les distinguer : GTCS n'a pas pu lire les paiements,
 * ce collecteur n'a jamais payé, ou voici sa dernière facture. Rendre le
 * premier comme le deuxième ferait passer une panne pour un impayé.
 */
function dernierPaiement(
  paiements: VueGlobale['paiements'],
  collecteurId: string,
): string {
  if (!paiements) return 'indisponible';
  const ligne = paiements.par_collecteur.find((p) => p.collecteur_id === collecteurId);
  if (!ligne) return 'jamais';
  return `${dateLisible(ligne.dernier_le)} · ${formatMontant(Number(ligne.dernier_montant))} ${ligne.derniere_devise === 'XOF' ? 'FCFA' : ligne.derniere_devise}`;
}
```

Ajouter l'en-tête `Dernier paiement` à la ligne d'en-têtes du tableau, et dans chaque ligne de collecteur, une cellule :

```tsx
        <span className="font-body text-sm text-muted-foreground truncate">
          {dernierPaiement(vue.paiements, collecteur.id)}
        </span>
```

- [ ] **Step 5: Vérifier**

Run: `npm run db:reset && npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts && npm test && npm run build`
Expected: PASS partout, construction sans erreur.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260902170000_admin_paiements.sql supabase/functions/admin-vue-globale/index.ts apps/admin/src/donnees.ts apps/admin/src/ecrans/Abonnements.tsx
git commit -m "feat(admin): voir l'argent des abonnements arriver"
```

---

## Task 13: Le mode d'emploi du déploiement

**Files:**
- Modify: `Docs/deploiement.md`

**Interfaces:**
- Consumes: rien.
- Produces: rien. Dernière tâche : elle consigne ce qu'un humain doit faire à la main.

- [ ] **Step 1: Écrire la section**

Ajouter à `Docs/deploiement.md`, avant la section des incidents connus :

````markdown
## Le paiement d'abonnement (J5)

### Ce qui se fait à la main chez Chariow, une fois

1. Créer **trois produits** dans la boutique GTCS, aux prix exacts de la grille
   (`packages/core/src/paliers.ts`) : Standard 2 500, Pro 5 000, Illimité 10 000 FCFA.
   Aucun montant custom ne passe par l'API : Chariow débite le prix de son produit.
   Un prix qui diverge de la grille est signalé au journal (`GRILLE — …`) sans bloquer
   le collecteur, qui n'y est pour rien.
2. Relever la clé d'API dans le tableau de bord Chariow.
3. Tirer un secret de webhook : `openssl rand -hex 32`.

### Les secrets des Edge Functions

```bash
npx supabase secrets set \
  CHARIOW_CLE_API="…" \
  CHARIOW_PRODUITS='{"standard":"prod_…","pro":"prod_…","illimite":"prod_…"}' \
  CHARIOW_SECRET_WEBHOOK="…" \
  URL_RETOUR_COLLECTEUR="https://kolek-collecteur.netlify.app"
```

`CHARIOW_API_URL` n'est à poser que pour viser un bac à sable ; le défaut est
`https://api.chariow.com/v1`.

`CHARIOW_PRODUITS` doit nommer **exactement** les trois paliers payants. Un palier
manquant, ou `essai` en trop, fait répondre `CONFIGURATION` à la première tentative
de paiement — la lecture lève au démarrage plutôt que de rendre une table incomplète
qui ne se verrait qu'au premier collecteur choisissant ce palier-là.

### Le déploiement des fonctions

```bash
npx supabase functions deploy abonnement-payer
npx supabase functions deploy abonnement-verifier
npx supabase functions deploy chariow-webhook --no-verify-jwt
```

**`--no-verify-jwt` n'est pas optionnel sur la troisième**, et c'est le seul endroit
du projet où il apparaît. Chariow ne signe pas ses webhooks et ne porte aucune
identité Supabase ; sans ce drapeau, la passerelle refuse l'appel avant que la
fonction ne le voie. Ce que le drapeau ouvre est le droit d'atteindre le code, pas
celui d'obtenir quoi que ce soit : le secret d'URL est comparé en temps constant, et
la fonction ne crédite jamais sur la foi du corps reçu.

### L'URL à coller chez Chariow

```
https://<référence-du-projet>.supabase.co/functions/v1/chariow-webhook?secret=<CHARIOW_SECRET_WEBHOOK>
```

### Vérifier après déploiement

```bash
# Sans secret : doit répondre 401.
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "https://<réf>.supabase.co/functions/v1/chariow-webhook" -d '{}'

# Sans jeton : doivent répondre 401.
for f in abonnement-payer abonnement-verifier; do
  curl -s -o /dev/null -w "$f %{http_code}\n" -X POST \
    "https://<réf>.supabase.co/functions/v1/$f" -H "apikey: <clé anon>" -d '{}'
done
```

Puis une vente réelle de bout en bout sur le palier Standard, en vérifiant que la
ligne de `paiements_abonnement` porte **la devise de la boutique** et non `XOF` écrit
en dur.
````

- [ ] **Step 2: Corriger le décompte des migrations**

Dans `Docs/deploiement.md`, remplacer « Les sept migrations s'appliquent dans l'ordre »
par « Les quatorze migrations s'appliquent dans l'ordre » — le décompte datait de J1 et
n'avait pas suivi.

- [ ] **Step 3: Lancer la vérification complète**

Run: `npm run verifier`
Expected: PASS de bout en bout — reconstruction de base, thème, paliers, tests
d'applications, tests de scripts, tests de base, construction, contrôle des paquets.

- [ ] **Step 4: Commit**

```bash
git add Docs/deploiement.md
git commit -m "docs(deploiement): les secrets Chariow, et le seul --no-verify-jwt du projet"
```

---

## Task 14: Les deux catalogues de codes ne doivent pas diverger

**Ajoutée le 2026-09-02.** Le checkout envoie `discount_code` (tâche 5), et
Chariow applique la remise de **son** catalogue, pas du nôtre. Deux sources de
vérité pour un même pourcentage : `codes_promo` chez nous, les Offres chez eux.
Rien ne les tient ensemble, et l'écart ne se voit pas — il se lit sur la
facture du collecteur.

C'est le risque que l'en-tête de `packages/core/src/paliers.ts` nomme déjà :
« un prix qui diverge entre la page de vente et l'écran d'administration n'est
pas un défaut d'affichage, c'est un litige commercial ». Ici, c'est pire : la
divergence est entre ce que Kolek promet et ce que le collecteur paie
réellement.

**Fichiers**
- Créer : `scripts/verifier-promos.mjs`
- Créer : `scripts/verifier-promos.test.mjs`
- Modifier : `package.json` — un script `verifier:promos`
- Modifier : `Docs/deploiement.md` §6.4 — le contrôle rejoint la liste d'après-déploiement

**Interfaces**
- Consomme : `codes_promo` (migration `20260830100000`), `GET /discounts?status=active`
  (Docs/Chariow.md §3.4).
- Produit : `comparer(internes, distants): Divergence[]` · type
  `Divergence = { code: string; genre: 'absent' | 'divergent' | 'inconnu'; interne?: number; distant?: number }`

- [ ] **Étape 1 : le test qui échoue**

Créer `scripts/verifier-promos.test.mjs` :

```js
import { describe, expect, it } from 'vitest';

import { comparer } from './verifier-promos.mjs';

/**
 * Deux catalogues de codes, un seul pourcentage vrai.
 *
 * `comparer` est pure : elle ne parle ni à la base ni à Chariow. C'est ce qui
 * permet de la tester sans clé d'API — et un contrôle qui exige la production
 * pour être vérifié n'est vérifié par personne.
 */

describe('comparaison des catalogues de remises', () => {
  it('se tait quand les deux côtés disent la même chose', () => {
    expect(
      comparer([{ code: 'LANCEMENT20', remise_pct: 20 }], [{ code: 'LANCEMENT20', percent: 20 }]),
    ).toEqual([]);
  });

  it('signale un code que Kolek promet et que Chariow ignore', () => {
    // Le cas qui coûte le plus cher : le collecteur voit -20 % dans
    // l'application, et Chariow lui débite le prix plein.
    expect(comparer([{ code: 'PILOTE50', remise_pct: 50 }], [])).toEqual([
      { code: 'PILOTE50', genre: 'absent', interne: 50 },
    ]);
  });

  it('signale un pourcentage qui ne correspond pas', () => {
    expect(
      comparer([{ code: 'PILOTE50', remise_pct: 50 }], [{ code: 'PILOTE50', percent: 40 }]),
    ).toEqual([{ code: 'PILOTE50', genre: 'divergent', interne: 50, distant: 40 }]);
  });

  it('signale un code qui n’existe que chez Chariow', () => {
    // Kolek ne l'enverra jamais, mais la page de paiement est hébergée : un
    // code qui traîne chez eux réduit un prix que personne ici n'a consenti.
    expect(comparer([], [{ code: 'VIEUXCODE', percent: 90 }])).toEqual([
      { code: 'VIEUXCODE', genre: 'inconnu', distant: 90 },
    ]);
  });

  it('ne se laisse pas troubler par la casse ni par l’ordre', () => {
    // `codes_promo_code_check` impose des majuscules côté Kolek ; rien ne
    // l'impose chez Chariow.
    expect(
      comparer(
        [{ code: 'B', remise_pct: 10 }, { code: 'A', remise_pct: 20 }],
        [{ code: 'a', percent: 20 }, { code: 'b', percent: 10 }],
      ),
    ).toEqual([]);
  });
});
```

- [ ] **Étape 2 : le lancer**

Run: `npx vitest run --dir scripts verifier-promos`
Expected: ÉCHEC — `Cannot find module './verifier-promos.mjs'`.

- [ ] **Étape 3 : le script**

Créer `scripts/verifier-promos.mjs` :

```js
// Les deux catalogues de codes de remise disent-ils la même chose ?
//
//   node scripts/verifier-promos.mjs        (npm run verifier:promos)
//
// Kolek garde ses codes dans `codes_promo` ; Chariow garde les siens dans sa
// boutique, et c'est LUI qui applique la remise au moment de payer. Le checkout
// se contente d'envoyer le code. Si les deux pourcentages divergent, le
// collecteur lit -20 % dans l'application et se fait débiter autre chose.
//
// Sortie non nulle à la première divergence. À lancer après chaque changement
// de code, des deux côtés.

const CHARIOW_API_URL = process.env.CHARIOW_API_URL ?? 'https://api.chariow.com/v1';

/**
 * La comparaison, séparée des deux lectures pour être testable sans clé d'API.
 *
 * Les codes sont comparés en majuscules : `codes_promo_code_check` les impose
 * chez nous, rien ne les impose chez Chariow, et une divergence de casse serait
 * une fausse alerte — le pire résultat possible pour un contrôle qu'on veut
 * voir tourner à chaque déploiement.
 */
export function comparer(internes, distants) {
  const parCode = new Map(distants.map((d) => [String(d.code).toUpperCase(), Number(d.percent)]));
  const vus = new Set();
  const divergences = [];

  for (const { code, remise_pct } of internes) {
    const cle = String(code).toUpperCase();
    vus.add(cle);
    const distant = parCode.get(cle);

    if (distant === undefined) {
      divergences.push({ code: cle, genre: 'absent', interne: Number(remise_pct) });
    } else if (distant !== Number(remise_pct)) {
      divergences.push({
        code: cle,
        genre: 'divergent',
        interne: Number(remise_pct),
        distant,
      });
    }
  }

  for (const [cle, distant] of parCode) {
    if (!vus.has(cle)) divergences.push({ code: cle, genre: 'inconnu', distant });
  }

  return divergences;
}

async function lireInternes(url, cleService) {
  const reponse = await fetch(
    `${url}/rest/v1/codes_promo?select=code,remise_pct,valide_au&valide_au=gte.${new Date().toISOString().slice(0, 10)}`,
    { headers: { apikey: cleService, Authorization: `Bearer ${cleService}` } },
  );
  if (!reponse.ok) throw new Error(`Kolek a répondu ${reponse.status}`);
  return reponse.json();
}

async function lireDistants(cleApi) {
  const reponse = await fetch(`${CHARIOW_API_URL}/discounts?status=active`, {
    headers: { Authorization: `Bearer ${cleApi}`, Accept: 'application/json' },
  });
  if (!reponse.ok) throw new Error(`Chariow a répondu ${reponse.status}`);
  const corps = await reponse.json();
  return corps.data ?? [];
}

if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  const url = process.env.SUPABASE_URL;
  const cleService = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cleApi = process.env.CHARIOW_API_KEY;

  if (!url || !cleService || !cleApi) {
    console.error(
      'Il manque SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ou CHARIOW_API_KEY. ' +
        'Ce contrôle interroge les deux catalogues : sans les deux clés, il ne peut rien affirmer.',
    );
    process.exit(1);
  }

  const [internes, distants] = await Promise.all([
    lireInternes(url, cleService),
    lireDistants(cleApi),
  ]);
  const divergences = comparer(internes, distants);

  if (divergences.length === 0) {
    console.log(`Les ${internes.length} code(s) de Kolek correspondent à ceux de Chariow.`);
    process.exit(0);
  }

  console.error(`${divergences.length} divergence(s) entre les deux catalogues de remises :`);
  for (const d of divergences) {
    if (d.genre === 'absent') {
      console.error(`  - ${d.code} : Kolek promet -${d.interne} %, Chariow ne connaît pas ce code.`);
    } else if (d.genre === 'divergent') {
      console.error(`  - ${d.code} : Kolek -${d.interne} %, Chariow -${d.distant} %.`);
    } else {
      console.error(`  - ${d.code} : -${d.distant} % chez Chariow, inconnu de Kolek.`);
    }
  }
  process.exit(1);
}
```

- [ ] **Étape 4 : relancer**

Run: `npx vitest run --dir scripts verifier-promos`
Expected: PASS — cinq cas.

- [ ] **Étape 5 : le déclarer**

Dans `package.json`, à côté de `verifier:migrations` :

```json
  "verifier:promos": "node scripts/verifier-promos.mjs",
```

**Hors de `npm run verifier`**, comme `verifier:migrations` et
`verifier:en-ligne` : il exige deux clés et le réseau, et la chaîne locale doit
tourner sans ni l'un ni l'autre.

Ajouter la ligne à `Docs/deploiement.md`, §6.4, à côté des deux autres
contrôles d'après-déploiement.

- [ ] **Étape 6 : commit**

```bash
git add scripts/verifier-promos.mjs scripts/verifier-promos.test.mjs package.json Docs/deploiement.md
git commit -m "feat(scripts): comparer les codes de remise de Kolek a ceux de Chariow"
```

---

## Task 15: L'état du paiement, visible depuis les réglages

**Ajoutée le 2026-09-02**, après la question : « il n'y a pas de place pour la
clé API Chariow dans les réglages ».

**Il ne doit pas y en avoir, et c'est le sujet de cette tâche.** Un champ de
saisie pour cette clé impose trois choses, toutes mauvaises : la clé traverse
le navigateur d'un administrateur, elle se pose quelque part en base, et elle
revient à l'écran chaque fois qu'on rouvre la page. Une clé qui encaisse de
l'argent ne doit vivre que dans l'environnement des Edge Functions — c'est déjà
la contrainte globale de ce plan, et celle qu'applique `verifier-bundles.mjs`
en refusant tout artefact qui en porterait la trace.

Ce qui manque n'est donc pas un champ, c'est une **réponse à la question que
l'administrateur se pose vraiment** : *le paiement est-il configuré, et est-ce
que ça marche ?* Aujourd'hui, la seule façon de le savoir est qu'un collecteur
échoue à payer.

L'écran gagne une section « Paiement » qui dit trois choses, sans jamais rendre
la clé : elle est posée ou non (avec ses quatre derniers caractères, assez pour
distinguer deux clés, pas assez pour en fabriquer une), les trois produits sont
déclarés ou non, et **la boutique répond ou non** — un appel réel à Chariow, qui
transforme « une clé est présente » en « cette clé fonctionne ». C'est la
différence entre une case cochée et un contrôle.

**Fichiers**
- Modifier : `supabase/functions/admin-reglages/index.ts`
- Modifier : `apps/admin/src/reglages.ts` — le type et rien d'autre
- Modifier : `apps/admin/src/ecrans/Reglages.tsx` — une section
- Test : `supabase/tests/admin-reglages-paiement.test.ts`

**Interfaces**
- Consomme : `lireProduits` et `PALIERS_PAYANTS` de `_shared/chariow.ts` (tâche 1).
- Produit : la clé `paiement` dans la réponse d'`admin-reglages`, de type
  `EtatPaiement`.

- [ ] **Étape 1 : le test qui échoue**

Créer `supabase/tests/admin-reglages-paiement.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import { etatPaiement } from '../functions/_shared/etat-paiement';

/**
 * Ce que les réglages disent du paiement — et ce qu'ils ne disent jamais.
 *
 * La fonction est pure et prend son environnement en argument : c'est ce qui
 * permet de vérifier, par un test et non par une relecture, que la clé ne sort
 * pas. Un contrôle de fuite qui repose sur la vigilance du prochain lecteur
 * n'est pas un contrôle.
 */

const CLE = 'chariow_sk_live_ABCDEFGHIJKLMNOP';

describe('l’état du paiement', () => {
  it('ne rend jamais la clé, seulement ses quatre derniers caractères', () => {
    const etat = etatPaiement({ cle: CLE, produits: '', secretWebhook: '' });

    expect(JSON.stringify(etat)).not.toContain(CLE);
    expect(JSON.stringify(etat)).not.toContain('ABCDEFGHIJKLMNOP');
    expect(etat.cleIndice).toBe('MNOP');
    expect(etat.cleConfiguree).toBe(true);
  });

  it('dit qu’il n’y a pas de clé plutôt que d’en inventer une vide', () => {
    const etat = etatPaiement({ cle: '', produits: '', secretWebhook: '' });

    expect(etat.cleConfiguree).toBe(false);
    expect(etat.cleIndice).toBeNull();
  });

  it('nomme les paliers dont le produit manque', () => {
    // Un produit manquant ne se voit pas avant qu'un collecteur choisisse ce
    // palier — et il choisit celui qu'on n'a pas déclaré, forcément un jour.
    //
    // `lireProduits` (tâche 1) **lève** dans ce cas, et c'est juste pour un
    // checkout : mieux vaut refuser au démarrage que vendre un palier sans
    // produit. Mais un écran de diagnostic qui lève n'affiche rien — il doit
    // au contraire savoir décrire une configuration incomplète. D'où une
    // lecture tolérante, propre à ce module.
    const etat = etatPaiement({
      cle: CLE,
      produits: '{"standard":"prod_1","illimite":"prod_3"}',
      secretWebhook: '',
    });

    expect(etat.produits).toEqual([
      { palier: 'standard', configure: true },
      { palier: 'pro', configure: false },
      { palier: 'illimite', configure: true },
    ]);
  });

  it('ne se casse pas sur un CHARIOW_PRODUITS illisible', () => {
    // Le cas d'une variable mal collée. L'écran doit le dire, pas tomber.
    const etat = etatPaiement({ cle: CLE, produits: 'pas du json', secretWebhook: '' });

    expect(etat.produits.every((p) => !p.configure)).toBe(true);
  });

  it('refuse un secret de webhook trop court', () => {
    // Le secret voyage dans l'URL du webhook. Court, il se devine ; et un
    // webhook qui se devine crédite des abonnements que personne n'a payés.
    expect(etatPaiement({ cle: CLE, produits: '', secretWebhook: 'court' }).webhookConfigure).toBe(
      false,
    );
    expect(
      etatPaiement({ cle: CLE, produits: '', secretWebhook: 'x'.repeat(32) }).webhookConfigure,
    ).toBe(true);
  });
});
```

- [ ] **Étape 2 : le lancer**

Run: `npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/admin-reglages-paiement.test.ts`
Expected: ÉCHEC — module introuvable.

- [ ] **Étape 3 : le module**

Créer `supabase/functions/_shared/etat-paiement.ts` — **aucune API Deno**, comme
`chariow.ts`, pour que Vitest puisse le charger :

```ts
import { PALIERS_PAYANTS } from './chariow.ts';

export interface EtatPaiement {
  cleConfiguree: boolean;
  /** Les quatre derniers caractères, ou `null`. Assez pour distinguer deux
      clés au téléphone, pas assez pour en reconstituer une. */
  cleIndice: string | null;
  webhookConfigure: boolean;
  produits: Array<{ palier: string; configure: boolean }>;
}

/** Longueur minimale du secret de webhook. Il voyage dans l'URL : c'est un mot
    de passe qui se promène, et il se traite comme tel. */
const SECRET_MIN = 32;

/**
 * La même variable que `lireProduits`, lue sans jamais lever.
 *
 * `lireProduits` lève sur une configuration incomplète, et c'est le bon
 * comportement pour un checkout : vendre un palier sans produit est pire que
 * refuser. Ici, l'incomplétude est précisément ce qu'on vient afficher — un
 * écran de diagnostic qui lève n'affiche rien, et l'administrateur reste devant
 * une page vide au moment où il cherche ce qui manque.
 */
function produitsDeclares(brut: string | undefined): Record<string, string> {
  if (!brut) return {};
  try {
    const lu = JSON.parse(brut) as unknown;
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) return {};
    const table: Record<string, string> = {};
    for (const [cle, valeur] of Object.entries(lu as Record<string, unknown>)) {
      if (typeof valeur === 'string' && valeur.trim()) table[cle] = valeur.trim();
    }
    return table;
  } catch {
    return {};
  }
}

export function etatPaiement(env: {
  cle: string | undefined;
  produits: string | undefined;
  secretWebhook: string | undefined;
}): EtatPaiement {
  const cle = env.cle ?? '';
  const produits = produitsDeclares(env.produits);

  return {
    cleConfiguree: cle.length > 0,
    cleIndice: cle.length >= 4 ? cle.slice(-4) : null,
    webhookConfigure: (env.secretWebhook ?? '').length >= SECRET_MIN,
    produits: PALIERS_PAYANTS.map((palier) => ({
      palier,
      configure: Boolean(produits[palier]),
    })),
  };
}
```

- [ ] **Étape 4 : relancer**

Run: `npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/admin-reglages-paiement.test.ts`
Expected: PASS — quatre cas.

- [ ] **Étape 5 : la boutique répond-elle ?**

Dans `supabase/functions/admin-reglages/index.ts`, après la lecture de
`admin_reglages` et avant la réponse :

```ts
  // L'état statique : ce que l'environnement déclare.
  const paiement = etatPaiement({
    cle: Deno.env.get('CHARIOW_API_KEY'),
    produits: Deno.env.get('CHARIOW_PRODUITS'),
    secretWebhook: Deno.env.get('CHARIOW_WEBHOOK_SECRET'),
  });

  // Puis l'état vivant : la clé fonctionne-t-elle ? Une clé présente et fausse
  // se comporte exactement comme une clé absente le jour du premier paiement,
  // et personne ne l'apprend avant. `GET /products` est la lecture la plus
  // inoffensive du contrat (Docs/Chariow.md §3.4).
  //
  // Trois secondes, et un échec qui ne fait pas échouer l'écran : les réglages
  // doivent s'afficher même quand Chariow est en panne — c'est justement le
  // moment où on vient les regarder.
  let boutique: 'joignable' | 'refusee' | 'injoignable' | 'non_configuree' = 'non_configuree';
  if (paiement.cleConfiguree) {
    try {
      const racine = Deno.env.get('CHARIOW_API_URL') ?? 'https://api.chariow.com/v1';
      const appel = await fetch(`${racine}/products`, {
        headers: {
          Authorization: `Bearer ${Deno.env.get('CHARIOW_API_KEY')}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(3000),
      });
      // 401 et 403 disent « la clé est mauvaise », le reste dit « le service
      // ne va pas ». Les confondre enverrait GTCS regénérer une clé correcte.
      boutique = appel.ok ? 'joignable' : appel.status === 401 || appel.status === 403 ? 'refusee' : 'injoignable';
    } catch {
      boutique = 'injoignable';
    }
  }
```

et ajouter `paiement: { ...paiement, boutique }` à l'objet rendu.

- [ ] **Étape 6 : le type côté administration**

Dans `apps/admin/src/reglages.ts`, ajouter à `EtatPlateforme` :

```ts
export interface EtatPaiement {
  cleConfiguree: boolean;
  cleIndice: string | null;
  webhookConfigure: boolean;
  produits: Array<{ palier: string; configure: boolean }>;
  boutique: 'joignable' | 'refusee' | 'injoignable' | 'non_configuree';
}
```

et `paiement: EtatPaiement;` dans `EtatPlateforme`.

- [ ] **Étape 7 : la section**

Dans `apps/admin/src/ecrans/Reglages.tsx`, une section sur le modèle exact de
`SectionAuth` — mêmes composants `Section`, `LigneEtat`, `LigneReglage`,
aucun style nouveau :

```tsx
function SectionPaiement({ paiement }: { paiement: EtatPaiement | null }) {
  if (!paiement) return null;

  const MOTS = {
    joignable: 'la boutique répond',
    refusee: 'la clé est refusée',
    injoignable: 'la boutique ne répond pas',
    non_configuree: 'aucune clé posée',
  } as const;

  return (
    <Section titre="Paiement" icone="credit-card">
      <LigneEtat
        terme="Clé Chariow"
        actif={paiement.cleConfiguree}
        vrai={paiement.cleIndice ? `posée (…${paiement.cleIndice})` : 'posée'}
        faux="absente"
      />
      <LigneEtat
        terme="Boutique"
        actif={paiement.boutique === 'joignable'}
        vrai={MOTS.joignable}
        faux={MOTS[paiement.boutique]}
      />
      <LigneEtat
        terme="Secret du webhook"
        actif={paiement.webhookConfigure}
        vrai="posé"
        faux="absent ou trop court"
      />
      {paiement.produits.map((p) => (
        <LigneEtat
          key={p.palier}
          terme={`Produit ${p.palier}`}
          actif={p.configure}
          vrai="déclaré"
          faux="manquant"
        />
      ))}

      {/* La clé ne se saisit pas ici, et l'écran le dit — sans quoi le
          prochain administrateur cherchera le champ, puis demandera qu'on
          l'ajoute. La commande est donnée : c'est ce dont il a besoin. */}
      <p className="mt-4 font-body text-sm text-muted-foreground">
        Ces valeurs ne se modifient pas depuis cet écran : une clé qui encaisse
        ne doit pas traverser un navigateur. Elles se posent en ligne de
        commande, une fois :
      </p>
      <pre className="mt-2 overflow-x-auto rounded-md bg-canvas p-3 font-mono text-xs">
{`npx supabase secrets set CHARIOW_API_KEY=…
npx supabase secrets set CHARIOW_PRODUITS='{"standard":"prod_…","pro":"prod_…","illimite":"prod_…"}'
npx supabase secrets set CHARIOW_WEBHOOK_SECRET=$(openssl rand -hex 24)`}
      </pre>
    </Section>
  );
}
```

et l'appeler dans `Reglages`, après `SectionAuth`.

- [ ] **Étape 8 : vérifier**

```
npm test --workspace @kolek/admin
npx tsc -b apps/admin
npx oxlint apps/admin/src supabase/functions
```

- [ ] **Étape 9 : commit**

```bash
git add supabase/functions/_shared/etat-paiement.ts supabase/functions/admin-reglages/index.ts \
        supabase/tests/admin-reglages-paiement.test.ts apps/admin/src
git commit -m "feat(admin): les reglages disent si le paiement est configure, sans jamais rendre la cle"
```

---

## Ce que ce plan ne fait pas

À dire à la livraison, pour que personne ne le découvre en production :

- **Aucun cron.** Un collecteur qui règle puis n'ouvre plus jamais l'application dépend
  du seul webhook. Si le pilote montre des paiements orphelins, la réponse est
  `pg_cron` + `pg_net` appelant `abonnement-verifier` — les trois chemins convergent
  déjà vers une seule fonction, donc rien d'autre ne bouge.
- **Aucun blocage à l'expiration.** Un collecteur en retard garde l'usage du produit ;
  c'est l'administration qui suspend à la main, comme avant.
- **Aucun plafond de clients par palier.** `limiteClients` reste décoratif.
- **La production sert une version antérieure aux six écrans collecteur** — constat de
  l'audit du 2026-08-21. Livrer le paiement sans refermer cet écart le rendrait
  invisible sur le terrain.
