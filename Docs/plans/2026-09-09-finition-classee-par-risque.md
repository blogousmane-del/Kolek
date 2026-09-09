# Finition — les points restants, classés par risque sur les données réelles

**But :** fermer ce que les audits des 3 et 9 septembre ont laissé ouvert, dans
un ordre dicté par une seule question — *est-ce que ce geste peut abîmer les
données des collecteurs en activité ?*

**Origine :** [audit de santé du 2026-09-09](../audits/2026-09-09-audit-sante-du-depot.md)
(un 🟠 et neuf 🟡 restants) et
[vérification de l'audit du 3 septembre](../audits/2026-09-09-verification-audit-du-3-septembre.md)
(deux migrations écrites, non déployées ; un constat de scalabilité rendu
visible mais non réparé).

**La contrainte qui gouverne l'ordre.** Des collecteurs travaillent en ce moment
sur la base de production. Les mises et les retraits y sont ajout-seul et
irréversibles. Un plan qui range les tâches par difficulté ou par satisfaction
range mal : on classe ici par **ce que le geste peut détruire**, et on descend.

---

## Le classement

| Zone | Ce que le geste touche | Points |
|---|---|---|
| 🔴 **Rouge** | Peut détruire des données réelles | A |
| 🟠 **Orange** | Modifie la base de production, volontairement | B |
| 🟡 **Jaune** | Modifie le code servi, pas les données | C, D, E, F |
| 🟢 **Vert** | Ne touche rien de vivant | G, H, I, J, K |

---

## 🔴 → ✅ A — La suite de tests n'a aucune garde sur sa cible

**Ce qui a été mesuré.** `supabase/tests/charger-env.ts` appelle
`process.loadEnvFile('supabase/tests/.env.test')`. Cette fonction **n'écrase
pas** une variable déjà présente dans l'environnement — vérifié en direct :

```
$ SUPABASE_URL=https://production.supabase.co node -e \
    "process.loadEnvFile('.env.test'); console.log(process.env.SUPABASE_URL)"
https://production.supabase.co
```

`npm run db:env` réécrit pourtant `.env.test` depuis `supabase status`, qui est
local par construction. Le fichier est juste. Il perd contre le shell.

**Ce que ça coûte.** `supabase/tests/avis-drainage.test.ts:141`, dans un
`beforeEach`, donc avant **chaque** test du fichier :

```ts
await admin.from('avis_clients').delete().not('id', 'is', null);
```

`admin` porte `SUPABASE_SERVICE_ROLE_KEY` : RLS est contournée, et
`not id is null` désigne toutes les lignes. Contre la production, cette ligne
vide `avis_clients` pour tous les collecteurs.

**Ce qu'on ne corrige pas.** Le test. Son balayage est global parce que la
réservation qu'il éprouve l'est — le borner par collecteur invaliderait ce
qu'il prouve. Les autres suppressions du harnais sont déjà bornées (`.eq`,
`.like`, `.in`) ; les deux autres `delete` non bornés sont sans danger, l'un
passant par le client anonyme pour vérifier que RLS le refuse.

**Ce qu'on corrige.** L'absence d'assertion sur la cible. Un garde-fou qui
refuse de lancer la suite contre autre chose que la pile locale.

**Liste d'autorisation, cette fois — et c'est l'inverse du garde-fou `.env.bak`
du même jour, à dessein.** On énumère le petit ensemble fermé. Pour les copies
de `.env`, le petit ensemble fermé était celui des suffixes de sauvegarde, et
les noms légitimes étaient sans limite. Ici c'est l'inverse : les adresses
locales se comptent sur une main, les adresses distantes sont sans limite. La
règle constante n'est pas « toujours refuser » ni « toujours autoriser », c'est
**énumérer le côté qui est fini**.

**Fini quand** un `SUPABASE_URL` distant fait échouer la suite avant le premier
`beforeEach`, avec un message qui nomme l'adresse trouvée.

## 🟠 B — Les deux migrations de sécurité ne sont pas en ligne

Elles vivent dans la branche et dans la base locale. En production, à cette
minute : `abonnement_ouvre_droit` reste un oracle, et les trois fonctions
`security definer` restent accordées à `PUBLIC`.

**Ce qui doit précéder le déploiement, et qui n'est pas fait :**

1. `npm run verifier:migrations` — la base distante porte-t-elle les 46
   migrations d'avant ? La passe de révocation est **dynamique** : elle referme
   ce qu'elle trouve ouvert le jour où elle s'applique. Si la production a
   dérivé — une fonction créée à la main, un droit accordé hors migration — elle
   révoquera aussi sur celle-là. C'est le comportement voulu, mais il faut le
   savoir avant, pas après.
2. Relire les deux sites d'appel de `abonnement_ouvre_droit` **sur la
   production**, pas en local. `create or replace` sur une fonction que deux
   policies consultent : si l'une d'elles passait autre chose que
   `(select auth.uid())` là-bas, le resserrage fermerait l'ouverture de client.

Les deux demandent des identifiants de production que cette session n'a pas.
**La décision de pousser appartient à l'exploitant, pas à ce plan.**

## 🟡 → ✅ C — Trois Edge Functions d'administration sans aucun test

`admin-avis`, `admin-modifier-collecteur`, `admin-reglages` — nommées dans zéro
des 64 fichiers de `supabase/tests/`. Leur portillon est relu et correct.
Deux d'entre elles **écrivent** : le collecteur modifié, et les réglages de la
plateforme. Un portillon juste et non testé reste juste jusqu'à la première
modification.

**Fini quand** chacune a au moins le triptyque des autres : refus sans jeton,
refus avec un jeton non-admin, acceptation avec un jeton admin.

## 🟡 D — Un seul morceau de JavaScript par application

`collecteur` : 565 ko, 158 ko compressés. Cible déclarée « téléphone d'entrée
de gamme », et le service worker ne met en cache qu'après le premier chargement
complet. C'est la seule application qui parte en itinérance.

## 🟡 E — `SuperAdmin.tsx`, 1 634 lignes

Plus du double du deuxième fichier du dépôt, et aucun test ne le nomme.

## 🟡 F — La pagination de la liste clients

Le bandeau posé aujourd'hui dit la troncature ; il ne la répare pas. Au-delà de
mille clients, un collecteur voit un avertissement et rien d'autre. Demande de
décider ce que devient la recherche — locale aujourd'hui, donc incapable de
trouver ce que le serveur n'a pas envoyé.

## 🟢 → ✅ G — Le README envoie le nouveau venu dans le mur

`apps/site/.env.example` n'existe pas ; le README affirme que la vitrine ne
parle à aucune API, alors que son formulaire poste nom, téléphone, courriel,
zone, palier et mot de passe vers `demander-ouverture`. `gardeEnv()` est posé
sur la vitrine et lève dans le hook `config` — un clone neuf qui suit le README
à la lettre ne démarre pas.

## 🟢 → ✅ H — Les couleurs hors du système

Cinq entrées sur neuf dans `packages/ui/src/ActionsRapides.tsx` mélangent
jetons et hexadécimaux en dur. `apps/collecteur/vite.config.ts` déclare
`background_color: '#FBFAF6'` — le jeton `paper`, supprimé le 2026-09-04.
L'écran de démarrage de l'application installée est donc la dernière surface du
produit peinte dans une couleur que le Design System ne connaît plus.
`apps/site/src/styles.css` porte `#ffffff` là où `surface` existe.

## 🟢 → ✅ I — Les comptes périmés dans les commentaires

`verification.yml` annonce 366 tests et treize fonctions ; il y en a ~726 et
vingt. Le raisonnement de chaque commentaire reste juste, et c'est lui qui
compte — mais un nombre invérifiable finit par faire douter du paragraphe.

## 🟢 J — Aucun plan ni spécification pour le travail des 4 au 6 septembre

`Docs/plans/` et `Docs/specs/` s'arrêtaient au 2026-09-02 avant ce fichier.

## 🟢 K — `npm test` à la racine est instable sur ce poste

Cinq espaces de travail en parallèle affament les workers vitest. Ce n'est pas
un défaut du code. À savoir avant d'aller chercher un bogue qui n'existe pas.

---

## Ordre d'exécution

1. **A** — le garde-fou de cible. Rien d'autre ne devrait tourner avant.
2. **G, H, I** — le vert, mécanique et sans risque, pendant que B attend une
   décision.
3. **C** — les trois portillons non testés.
4. **B** — sur décision de l'exploitant, après `verifier:migrations`.
5. **D, E, F** — chantiers à part entière, à ouvrir chacun avec son plan.

---

## Ce qui a été fait, et ce que ça a trouvé

Chaque garde-fou écrit ici a d'abord été **vu échouer sur le vrai dépôt**. C'est
la leçon de l'erreur d'ACL du matin : une vérification qui rend « rien » ne
prouve rien tant qu'on ne l'a pas vue trouver quelque chose.

| Point | Garde-fou | Ce qu'il a trouvé à son premier passage |
|---|---|---|
| A | `scripts/garde-base-locale.mjs` | Refus mesuré sur une cible distante, avant le premier `beforeEach` |
| C | `supabase/tests/portillons-admin.test.ts` | **`admin-vue-globale` ne contrôlait aucune méthode** — un `DELETE` traversait et repartait avec les chiffres de la plateforme, en `200` |
| G | `scripts/verifier-exemples-env.mjs` | `apps/site/.env.example` absent |
| H | `scripts/verifier-manifeste.mjs` | `background_color: '#FBFAF6'`, jeton supprimé cinq jours plus tôt |

**Décision prise sur H** (palette) : étendre plutôt que réduire. Deux familles
fonctionnelles — `ardoise` et `ocre` — entrent dans `tokens.ts`, et le Design
System écrit la frontière avec l'or de marque. Ramener les neuf boutons aux cinq
jetons sémantiques aurait rendu *Retrait* et *Bilan* identiques sur l'écran que
le collecteur utilise toute la journée.

## Ce qui reste, et pourquoi

- **B** — les deux migrations de sécurité, en attente d'une décision
  d'exploitation et de `verifier:migrations`.
- **D, E, F** — chantiers à part entière.
- **Le test intermittent `avis-drainage`.** Reproduit deux fois, jamais seul.
  Trois hypothèses écartées **par la mesure** : une seule signature dans
  `pg_proc` ; l'appel direct par PostgREST honore la borne ; la tâche `pg_cron`
  d'une minute sort sur `SECRETS_ABSENTS` tant que le coffre est vide, et il
  l'est. La cause reste inconnue. Aucun correctif n'a été posé — le test capture
  désormais l'état de la file, pour que la prochaine occurrence livre la preuve
  au lieu d'une hypothèse de plus.
