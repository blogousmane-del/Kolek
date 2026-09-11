# Borner le webhook Chariow — plan d'implémentation

> **Pour un exécutant :** les étapes sont cochables (`- [ ]`). Elles se suivent
> dans l'ordre. Chaque tâche finit par un commit et laisse le dépôt vert.
> **Rien ne se pousse sans l'accord explicite de l'exploitant** : toucher
> `supabase/functions` déploie en production à la poussée.

**But :** fermer les deux 🟡 de `Docs/audits/2026-09-10-audit-de-correction.md`
qui portent sur `chariow-webhook` — sans jamais risquer de perdre une
notification de paiement.

**Outillage :** Deno (Edge Functions), Vitest 4 (`supabase/tests`), PostgreSQL
local. `consommer_debit` existe déjà (`20260827090000_debit_public.sql`).

**Décidé par l'exploitant le 2026-09-11 :** décision 1 — exécuter en local,
tâches 1 à 4, rien de poussé sans nouvel accord ; décision 2 — **reclasser
sans code**.

---

## Ce que la relecture du 2026-09-11 change à l'audit du 10

L'audit écrivait : « le secret qui fuit permet de déclencher des relectures
chez Chariow ». **Ce n'est plus vrai depuis le 2026-09-04** (`ce440bc`), six
jours avant l'audit : le webhook vérifie aussi `x-chariow-signature`, un
HMAC-SHA256 du corps brut clé par `CHARIOW_SECRET_SIGNATURE` — fail-closed,
avant toute lecture en base et tout appel à Chariow
(`supabase/functions/chariow-webhook/index.ts`, lignes 78-86).

Un secret d'URL volé seul ne passe donc plus. **Ce qui reste :**

- **Le rejeu.** La signature porte sur le corps et sur rien d'autre — pas
  d'horodatage, pas de nonce. Un Pulse authentique capturé (journal du
  fournisseur, capture réseau) se rejoue tel quel, indéfiniment. Chaque rejeu
  fait lire une vente chez Chariow, sur notre quota d'API. Il ne **crédite
  jamais** rien : `reconcilier` relit la vente et ne recharge que les paiements
  `en_attente` ou `echoue`.
- **`Docs/Chariow.md` §7 est périmé** : il dit encore « Chariow n'a pas de
  signature ». Ce document décrit une autre application (communautés,
  Express) ; il sert de référence au contrat HTTP, pas à notre webhook.

## Décision 1 — la borne, **par vente** et non globale

L'objection de l'audit tenait à une borne **globale** : « un webhook légitime
arrive en rafale après une vague de paiements ». Une vague de paiements, c'est
**beaucoup de ventes différentes**. Un rejeu, c'est **toujours la même
vente** — l'attaquant ne peut signer que ce qu'il a capturé.

Compter par vente borne le rejeu sans jamais toucher une vague légitime.

| Réglage | Valeur | Pourquoi |
|---|---|---|
| Empreinte | `chariow-webhook:vente:<id>` ; à défaut `…:collecteur:<id>`, `…:demande:<id>`, `…:sans-cible` | ce que l'attaquant ne peut pas faire varier sans une autre signature |
| Plafond | **20 par heure et par vente** | Chariow émet au plus trois événements de succès par vente (`successful`, `settled`, `completed`), plus ses réessais sur nos 500. Vingt laisse six fois de marge. |
| Place | **après** la signature et l'analyse du corps, **avant** toute lecture en base | un appel non signé ne coûte toujours ni lecture ni écriture ; un rejeu ne coûte plus qu'une écriture de compteur |
| Au-delà | **`429`**, et non `200` | `Docs/Chariow.md` : Chariow réessaie tout ce qui n'est pas 2xx. Un Pulse légitime refusé par excès — après une longue panne de notre côté — sera donc rejoué plus tard, quand la fenêtre aura glissé. Un rejeu n'obtient rien. |
| Compteur en panne | **laisser passer** et journaliser | l'inverse des formulaires publics, fail-closed. Ici l'enjeu d'un refus à tort est un paiement non reconnu ; l'enjeu d'un passage à tort est une lecture d'API. |

## Décision 2 — la longueur minimale du secret d'URL : **ne pas l'imposer**

L'audit l'écartait parce qu'un refus à l'exécution couperait les paiements si
le secret de production faisait moins de 32 caractères. La signature retire
l'autre plateau de la balance : le secret d'URL ne répond plus de l'origine, il
écarte le bruit sans calcul. Un secret court ne fait plus entrer personne.

L'imposer n'ajouterait donc **que** le risque. Recommandation : reclasser le 🟡
en ✅ « rendu caduc par la signature », dans l'audit de suivi.

**Variante, si l'exploitant préfère l'imposer quand même :** regarder d'abord
Super Admin › Paiement en production. « Secret de webhook : **Posé** » y veut
dire 32 caractères ou plus (`etat-paiement.ts`, `SECRET_MIN`) — personne n'a
à lire le secret. Seulement alors, ajouter le contrôle à la fonction.

---

## Contraintes globales

- **Aucune notification de paiement ne doit pouvoir se perdre** par l'effet de
  ce travail. Le compteur en panne laisse passer ; l'excès rend `429`, que
  Chariow réessaie.
- **La production ne se touche que par la poussée**, avec l'accord explicite
  de l'exploitant, et se vérifie ensuite par une sonde **non signée** — qui ne
  peut rien déclencher.
- **Aucun secret n'est affiché ni écrit** : pas de valeur, pas d'empreinte en
  clair dans un journal ou un fichier. Les comparaisons d'empreintes se font
  en mémoire et ne rendent que « identique » ou « différent ».
- `supabase/functions/.env` est commité et ne sert qu'à la pile locale
  (précédent : `DRAINAGE_SECRET`). Le CI déploie par
  `supabase functions deploy --project-ref "$PROJET"` — sans `secrets set`,
  sans `--env-file` (`.github/workflows/verification.yml`, ligne 351).

---

## Vérification préalable — avant la tâche 1

- [ ] **Empreintes des secrets de production**, relevées **sans les
  afficher** : `supabase secrets list --project-ref <ref> -o json`, gardées en
  mémoire d'un script qui ne rend que les **noms** présents. On veut
  `CHARIOW_SECRET_WEBHOOK`, `CHARIOW_SECRET_SIGNATURE`, `CHARIOW_CLE_API`.
  L'empreinte de chacun est conservée dans la mémoire du script pour la
  comparaison de la tâche 5, jamais sur disque.
- [ ] **Volume réel**, en comptes agrégés seulement :
  `select count(*), count(distinct vente_id) from paiements_abonnement`.
  Aucun nom, aucun numéro.

> **Relevé le 2026-09-11.** Les trois secrets Chariow sont présents en
> production (22 secrets au total, noms seuls affichés) ; l'empreinte de leur
> liste est gardée hors du dépôt pour la comparaison de la tâche 5. Volume :
> **6 paiements, 6 ventes distinctes, les 6 dans les 7 derniers jours** — une
> vente par paiement. Vingt Pulses par heure et par vente laissent une marge
> sans commune mesure avec ce trafic.

---

### Tâche 1 : l'empreinte d'un Pulse — module pur, épreuves sans réseau

**Fichiers :** Modifier `supabase/functions/_shared/debit.ts` ·
Créer `supabase/tests/debit-pulse.test.ts`

**Interfaces :**
`export function empreintePulse(c: { vente: string | null; collecteur: string | null; demande: string | null }): string`
et `export const PULSE_PLAFOND = 20`, `export const PULSE_FENETRE_SECONDES = 3600`.

- [ ] Épreuves d'abord : la vente prime ; à défaut le collecteur, puis la
  demande, puis `sans-cible` ; deux ventes donnent deux empreintes ; la
  longueur ne dépasse jamais `EMPREINTE_MAX` (200), même avec un identifiant
  de 500 caractères ; le préfixe `chariow-webhook:` ne peut pas être imité par
  un identifiant qui contiendrait `:`.
- [ ] Les voir échouer, implémenter, les voir passer.
- [ ] Commit : `feat(chariow): l'empreinte d'un Pulse, par vente`

### Tâche 2 : la borne dans le webhook

**Fichiers :** Modifier `supabase/functions/chariow-webhook/index.ts`

- [ ] Après `JSON.parse` et l'extraction de `venteId`, `collecteurMeta`,
  `demandeMeta` — donc avant toute lecture de `paiements_abonnement` :

```ts
const { data: dansLePlafond, error: erreurDebit } = await clientService.rpc('consommer_debit', {
  cle: empreintePulse({ vente: venteId, collecteur: collecteurMeta, demande: demandeMeta }),
  plafond: PULSE_PLAFOND,
  fenetre_secondes: PULSE_FENETRE_SECONDES,
});
if (erreurDebit) {
  // Laisser passer : un paiement non reconnu coûte plus qu'une lecture d'API.
  console.error('[Abonnement] compteur du webhook indisponible :', erreurDebit.message);
} else if (dansLePlafond === false) {
  return reponse({ erreur: 'TROP_DE_PULSES' }, 429);
}
```

  Le client de service est créé **avant** ce bloc (il l'est aujourd'hui
  juste après) ; l'en-tête de la fonction gagne un cinquième garde-fou.
- [ ] Commit : `feat(chariow): borner le rejeu d'un Pulse, par vente`

### Tâche 3 : l'éprouver sur la pile locale

**Fichiers :** Modifier `supabase/functions/.env` et
`supabase/tests/chariow-webhook.test.ts`

Pour atteindre la borne, une requête doit passer le secret **et** la
signature. La pile locale reçoit donc deux valeurs **locales**, sans rapport
avec la production, comme `DRAINAGE_SECRET` : `CHARIOW_SECRET_WEBHOOK` et
`CHARIOW_SECRET_SIGNATURE`.

> **Pas `CHARIOW_CLE_API`** — corrigé le 2026-09-11, avant exécution.
> `abonnement-payer.test.ts` (l. 123) et `abonnement-verifier.test.ts` (l. 98)
> attendent `CONFIGURATION` justement parce qu'elle manque en local ; la poser
> les ferait tomber. La tâche 2 descend donc le contrôle de `cleApi` là où il
> sert — juste avant `creerDepot` — au lieu de l'exiger dès l'entrée. En
> production la clé est posée : rien ne change. En local, un Pulse signé pour
> une vente inconnue atteint la borne, puis répond `200` sans aucun appel.
> Seules `chariow-webhook` et `super-admin-etat` (affichage) lisent les deux
> secrets ; aucune épreuve locale ne suppose leur absence, hormis celle que
> cette tâche réécrit.

Un Pulse signé pour une vente inconnue, sans métadonnées, ne trouve aucune
cible : la fonction répond `200` **sans aucun appel réseau**. C'est ce qui rend
l'épreuve possible sans Chariow.

- [ ] Épreuves : vingt Pulses signés de la même vente passent (`200`), le
  vingt-et-unième rend `429 TROP_DE_PULSES` ; une autre vente passe encore ;
  un Pulse **non signé** ne touche jamais au compteur (compté en base :
  aucune ligne `chariow-webhook:%` après cent appels non signés).
- [ ] Réécrire « refuse tout tant qu'aucun secret n'est posé » en « refuse un
  secret faux, et une signature fausse » : la pile locale a désormais un
  secret. La propriété fail-closed reste éprouvée sur pièce dans
  `secret.test.ts` (attendu vide ⇒ refus).
- [ ] `docker restart supabase_edge_runtime_Kolek` avant de lancer : le
  runtime ne relit pas `.env` à chaud (mémoire `pile-supabase-locale`).
- [ ] Commit : `test(chariow): la borne du webhook, eprouvee sur la pile locale`

### Tâche 4 : les documents

- [ ] Audit de suivi : les deux 🟡 — le premier fermé par la borne, le second
  reclassé ✅ « rendu caduc par la signature » (ou fermé, selon la décision 2).
- [ ] `Docs/Chariow.md` §7 : une note en tête — Kolek vérifie la signature
  depuis le 2026-09-04, ce paragraphe décrit une autre application.
- [ ] Commit : `docs: le webhook Chariow borne, et un document perime signale`

### Tâche 5 : la chaîne complète, puis — **avec accord** — la production

- [ ] `{ npm run verifier; echo "SORTIE_NPM=$?"; } > journal 2>&1`, lu étape
  par étape.
- [ ] **Accord explicite de l'exploitant** pour pousser. Le CI déploie
  `chariow-webhook` en production.
- [ ] Après le déploiement :
  1. empreintes des trois secrets Chariow **identiques** à celles de la
     vérification préalable (le déploiement n'en a écrit aucun) ;
  2. sonde **non signée** : `POST` sans secret ⇒ `401 SECRET_INVALIDE` ;
     `GET` ⇒ `405`. Aucune des deux ne peut rien déclencher ;
  3. au prochain paiement réel, `paiements_abonnement` le reconnaît comme
     avant — compté, pas nommé.

---

## Ce qui reste après ce plan

- **Le rejeu reste possible sous la borne** : vingt lectures par heure et par
  vente capturée. Le fermer tout à fait demanderait un horodatage signé, que
  Chariow n'émet pas.
- **Un prospect n'a que le webhook** : aucune tâche planifiée ne réconcilie
  ses paiements. Un collecteur existant, lui, est rattrapé par
  `abonnement-verifier`. Ce plan ne change rien à cette asymétrie — il
  s'assure seulement de ne pas l'aggraver (`429` réessayé, compteur
  fail-open).
