# Audit de sécurité — Kolek

**Date :** 2026-09-04 · **Périmètre :** dépôt au commit `569f4b4`, base locale
`supabase_db_Kolek` interrogée en direct.

> Onzième passage des vingt contrôles. Le précédent date du 2026-09-03, commit
> `59e76e5`. Depuis : le plan J5 a été exécuté en entier — le webhook Chariow,
> l'ouverture de compte au règlement, les deux écrans du collecteur, le
> formulaire de la vitrine, la comparaison des catalogues de remises. Et le
> défaut 🟠 ouvert depuis le 25 août a été fermé.

**Verdict : PRÊT À LANCER.** Zéro constat rouge, et — pour la première fois
depuis le 25 août — **zéro constat orange vérifiable dans le dépôt**. Le seul
orange restant se lit dans le tableau de bord Supabase, hors de portée d'ici.

En contrepartie, le dépôt porte désormais **son premier point d'entrée public**,
`chariow-webhook`, seul endroit du projet où `verify_jwt = false`. Il est
examiné en détail plus bas : ce que ce drapeau ouvre, et ce qu'il n'ouvre pas.

| | Nombre |
|---|---|
| 🔴 Bloquant | 0 |
| 🟠 Important | 0 vérifié · 1 reporté sans revérification |
| 🟡 À faire | 11 |
| ⚪️ Non vérifié | 3 |

**1 231 tests passent** — 699 sur la base, 532 d'application et de scripts —
plus le typecheck, la construction des trois applications et
« Aucune fuite dans les artefacts ».

---

## Ce qui s'est fermé depuis hier

### 🟠 → ✅ `envoyer-avis` vérifie enfin son appelant — contrôle n°6

Ouvert le 2026-08-25, redit le 28, le 2 et le 3 septembre. **Fermé le
2026-09-03**, commit `95a5898`.

Deux choses, et il fallait les deux :

```ts
const porteur = requete.headers.get('Authorization')?.replace(/^Bearer /, '') ?? null;
if (!(await secretValide(porteur, cleService))) {
  return reponse({ erreur: 'ACCES_RESERVE' }, 403, requete);
}
```

La comparaison passe par `secretValide` — SHA-256 des deux côtés puis
comparaison en temps constant — et non par `===`, qui s'arrête au premier
caractère différent et fuit la longueur du préfixe correct.

Et la réservation du lot, qui était l'autre moitié du défaut. `avis_reserver_lot`
marque `en_cours` et ne rend que ce qu'elle a marqué, sous `for update skip
locked`. Vérifié en direct sur `pg_proc` : la fonction existe et sa source porte
bien la clause. Dix appels simultanés ne voient plus jamais la même ligne.

**Limite écrite plutôt que cachée.** Le contrôle de la clause est un contrôle de
**forme** — il lit la source de la fonction. Le test de concurrence qui aurait
mesuré le comportement passait avec la clause retirée, PostgREST sérialisant les
appels : il a été supprimé plutôt que gardé. Un contrôle qui ne peut pas échouer
pour la bonne raison n'est pas un contrôle.

#### Correction du 2026-09-04, après déploiement — le code cité ci-dessus était faux

Ce paragraphe a été écrit avant que quoi que ce soit ne soit en ligne. Déployée
le 2026-09-04 à 07:50 UTC, la porte a refusé **l'horloge elle-même** : `403
ACCES_RESERVE` à chaque réveil, mesuré dans `net._http_response` à 08:12 et 08:13.

`cleService` vaut `SUPABASE_SERVICE_ROLE_KEY`, que la plateforme injecte, tandis
que `avis_declencher_drainage()` présente ce que Vault contient. Les deux ont été
tenues pour la même valeur ; elles ne le sont pas. Le runtime expose
`SUPABASE_SERVICE_ROLE_KEY = eyJ…` (JWT hérité) à côté de
`SUPABASE_INTERNAL_SECRET_KEY = sb_secret_…`, et Vault porte la seconde forme
depuis le 2026-08-28 — vérifié : préfixe `sb_secret_`, 41 caractères.

**Ce qui était juste, et ce qui ne l'était pas.** La faille de sécurité était
bien fermée : la clé publiable ne passait plus. C'est la disponibilité qui est
tombée — la porte refusait tout le monde, l'appelant légitime compris. Un audit
de sécurité qui ne regarde que « qui est refusé » ne voit pas cette moitié-là.

**Ce que la suite de tests n'a pas vu, et pourquoi.** `avis-drainage.test.ts`
présentait `SUPABASE_SERVICE_ROLE_KEY` en porteur — la variable que la fonction
lisait elle-même. Il mesurait la fonction contre sa propre constante, jamais
contre ce que l'appelant réel envoie. Le défaut était donc reproductible en
local depuis le premier jour ; c'est le test qui regardait ailleurs.

Corrigé par `20260904090000_avis_secret_dedie` : un secret partagé dédié,
`kolek_secret_drainage` côté Vault et `DRAINAGE_SECRET` côté fonction, présenté
dans l'en-tête `x-kolek-drainage`. Plus aucune rotation de clé Supabase ne touche
cette porte. Le test qui manquait — `refuse la clé de service seule` — échoue
bien quand on réintroduit l'ancien couplage, vérifié.

### L'empreinte de mot de passe ne sort par aucune des trois portes

`demandes_ouverture.mot_de_passe_hash` est né le 2026-09-03. Trois sorties
possibles, les trois mesurées en direct aujourd'hui :

| Sortie | Mesure | Résultat |
|---|---|---|
| Par la table | `information_schema.table_privileges` et `column_privileges`, `grantee in ('anon','authenticated')` | **0 privilège**, colonne comprise |
| Par la console | `pg_proc.prosrc` de `admin_demandes` contient-il `mot_de_passe_hash` ? | **non** — la fonction nomme ses champs un à un, un `select *` aurait emporté la colonne neuve |
| Par le journal | `pg_proc.prosrc` de `journaliser_demande` contient-il `- 'mot_de_passe_hash'` ? | **oui** — l'empreinte est retirée de `to_jsonb(new)` avant écriture |

C'était la vraie fuite : `super-admin-journal` rend le journal à qui sait lire
une page, et la ligne entière s'y écrivait.

Une contrainte impose en plus la **forme** d'une empreinte bcrypt. Le jour où
quelqu'un écrira ici la valeur reçue du formulaire, la base refusera au lieu de
conserver.

---

## Le premier point d'entrée public : `chariow-webhook`

Toutes les autres Edge Functions exigent un jeton. Celle-ci ne peut pas —
Chariow ne signe pas ses appels et ne porte aucune identité Supabase.
`verify_jwt = false` n'apparaît **qu'une fois** dans `supabase/config.toml`,
mesuré, et sur cette fonction seule.

**Ce que le drapeau ouvre :** le droit d'atteindre le code. Rien d'autre.

**Ce qu'il n'ouvre pas, et pourquoi :**

- Le secret d'URL est comparé par `secretValide`, en temps constant.
- **Sans secret configuré, tout est refusé, la chaîne vide comprise.** Une
  fonction déployée avant que son secret ne soit posé ne s'ouvre à personne.
  C'est mesuré : `CHARIOW_SECRET_WEBHOOK` n'existe ni en local ni au CI, et les
  cinq tests de porte constatent le refus.
- **La fonction ne crédite rien sur la foi du corps reçu.** Le corps dit
  seulement *quelles lignes relire* ; la décision vient toujours d'un
  `GET /sales/{id}` chez le fournisseur. C'est ce qui rend le secret non
  critique : le connaître permet de déclencher une relecture, pas d'obtenir un
  abonnement.
- Des métadonnées forgées désignent des lignes, et chaque ligne porte son propre
  rattachement, **relu en base** et jamais dans le corps reçu.

**La mesure qui distingue les deux refus.** Un refus de la plateforme et un refus
de la fonction portent tous deux `401` : le statut seul ne dirait rien. Les tests
portent donc sur le **corps** — Kong rend son message, la fonction rend
`SECRET_INVALIDE`. Vérifié en retirant la section de `config.toml` et en
redémarrant la pile : `3 failed | 2 passed`.

**L'ouverture de compte est la seule opération irréversible du dispositif**, et
c'est le webhook seul qui l'injecte. `creerDepot` refuse par défaut, bruyamment ;
`abonnement-verifier` ne peut donc pas faire naître un compte, même par erreur de
branchement. Dix-sept assertions couvrent l'ouverture, dont les deux qui portent
la propriété de sécurité — une reprise de compte exige que le numéro **et**
l'adresse concordent, et tout autre échec refuse sans chercher.

---

## 🟠 À corriger

### Limite Auth restée au défaut de la plateforme — contrôle n°11 · *reporté*

Constat du 25 août, redit le 28 août, le 2 et le 3 septembre. **Non revérifié
ici** : il se lit dans le tableau de bord Supabase, hors du dépôt. Ouvert
jusqu'à preuve du contraire.

---

## 🟡 Durcissement

Les huit points du 2026-09-03 tiennent — téléphones en clair, `localStorage`,
absence de CAPTCHA, `abonnement_ouvre_droit` qui ne borne pas son paramètre, et
les autres. Trois s'y ajoutent, tous nés du dispositif de paiement.

- **Le webhook n'a pas de borne d'abus — nouveau.** Il n'appelle pas
  `consommer_debit`. Chaque appel peut déclencher jusqu'à vingt lectures chez
  Chariow. Le secret est la seule porte ; s'il fuit, un attaquant consomme le
  quota d'API du fournisseur sans rien obtenir d'autre. La borne n'est pas
  triviale à poser — un webhook légitime arrive en rafale après une vague de
  paiements — d'où le classement en durcissement et non en correction.
- **`demander-ouverture` coûte désormais bien plus cher par requête —
  nouveau.** Un palier payant déclenche un bcrypt à coût 10 (≈ 180 ms mesurées
  dans ce runtime), un appel à Have I Been Pwned et un appel de checkout. Avant
  l'amendement, la fonction n'écrivait qu'une ligne. **La borne, elle, n'a pas
  bougé** : une demande par minute et par adresse IP. Elle protège la partie
  chère — `consommer_debit` est appelée avant tout ce travail, vérifié — mais un
  réseau d'adresses coûte maintenant cent fois plus qu'hier.
- **Le secret de webhook n'a pas de longueur minimale à l'exécution.**
  `etat-paiement.ts` en exige 32 pour *afficher* la passerelle comme configurée,
  mais la fonction accepte n'importe quel secret non vide. Un secret court
  s'affiche donc en rouge dans les réglages tout en fonctionnant. L'écart est
  volontairement dans ce sens — un refus d'exécution ferait perdre des
  notifications de paiement — mais il mérite d'être su.

---

## ⚪️ Non vérifié

Les trois du 2026-09-03, inchangés :

- **Le test de la clé publiable contre la production.** Mesuré en local, où les
  quinze tables refusent (voir plus bas).
- **La lecture des `.env` de production.**
- **L'écart entre les migrations et la base de production.** Il s'est creusé :
  **quatre migrations** sont désormais versionnées et non appliquées —
  `20260902160000`, `20260902170000`, `20260903120000`, `20260903140000`.
  `verifier:migrations` le dirait, mais demande le jeton du projet, lequel est
  périmé.

---

## Ce qui est vérifié et sain

**Les quinze tables refusent la clé publiable.** Mesuré aujourd'hui par HTTP,
table par table : les quinze rendent `401` avec le code PostgreSQL `42501` — le
refus vient du privilège, avant même que RLS n'entre en jeu.

```
collecteurs clients cartes mises retraits caisses_jour audit_log
admins avis_clients avis_reglages demandes_ouverture codes_promo
debit_public synchro_rejets paiements_abonnement  → 42501 pour les quinze
```

**RLS : 15 tables sur 15**, et **aucune policy en `using (true)`** dans tout le
schéma `public`. Mesuré sur `pg_class` et `pg_policies`.

**Aucune fonction `security definer` sans `pg_temp` en fin de `search_path`.**
La requête sur `pg_proc.proconfig` rend zéro, les fonctions neuves comprises —
`avis_reserver_lot`, `avis_reservation_verrouillee`, `crediter_abonnement`.

**`crediter_abonnement` n'est exécutable par personne d'autre que
`service_role`.** Mesuré : zéro privilège pour `anon`, `authenticated` et
`PUBLIC`. C'est la fonction qui transforme un paiement en abonnement.

**Seize fonctions détiennent la clé de service, quatorze vérifient leur
appelant avant de s'en servir.** Les deux autres sont publiques par
construction — un visiteur qui découvre Kolek et quelqu'un qui a oublié son mot
de passe n'ont, par définition, pas de session — et toutes deux passent par
`consommer_debit`. Deux des quatorze contrôlent un secret partagé plutôt qu'une
identité : `envoyer-avis`, appelé par le coffre de `pg_cron`, et
`chariow-webhook`, appelé par le fournisseur.

**Aucun `select('*')` applicatif.** Zéro occurrence dans les trois
applications, les deux paquets et les Edge Functions — mesuré aujourd'hui. Les
seules se trouvent dans les tests, où c'est le sujet.

**Aucun montant ne part d'un client.** Ni l'écran du collecteur, ni le formulaire
de la vitrine, ni `creerVenteChariow` n'envoient de prix : Chariow débite le
produit configuré dans sa boutique, et un code de remise est le seul moyen de le
réduire. Un test mesure l'absence de montant dans la requête de checkout, et un
autre mesure que le corps envoyé par l'application ne porte que quatre clés.

**1 231 tests passent** — 699 sur la base, 532 d'application et de scripts —
typecheck, construction des trois applications, et
« Aucune fuite dans les artefacts. » `verifier-bundles` refuse en plus
`api.chariow.com` et les variables `(VITE|REACT_APP|NEXT_PUBLIC)_CHARIOW` : la
clé du fournisseur ne peut apparaître dans aucun artefact livré.

**`npm audit` : 0 vulnérabilité**, dépendances de développement comprises.

---

## Le seul chiffre qui a bougé dans les vingt contrôles

Le contrôle n°20 était `✅` hier, mesuré `npm audit --omit=dev`. Sans ce
drapeau, il rendait aujourd'hui **une vulnérabilité de gravité haute** :
`fast-uri` 3.1.5, quatre avis publiés — confusion d'hôte et SSRF par
normalisation d'IPv6 et de pourcentages.

Ce n'est donc pas une régression de la mesure d'hier : `--omit=dev` excluait
cette dépendance par construction. C'est un élargissement de la focale, et il
valait la peine — `fast-uri` arrive par vite-plugin-pwa → workbox-build → ajv, et
tourne sur le poste qui **construit le service worker**, en lisant des URL de
manifeste. Corrigé le jour même (`569f4b4`) : 3.1.7 installée, construction du
PWA au vert, `npm audit` muet sans aucun drapeau.

---

## Les 20 contrôles

| # | Contrôle | Statut | Note |
|---|---|---|---|
| 1 | Clés API cachées | ✅ | Aucune clé secrète dans le code. La clé Chariow n'a **aucun champ de saisie** nulle part et ne vit qu'en secret d'Edge Function |
| 2 | Secrets purgés de Git | ✅ | `.env` et `.env.*` ignorés, deux `.env.example` suivis |
| 3 | Bonne clé côté client | ✅ | `sb_publishable_` dans les trois applications ; `service_role` seulement dans les Edge Functions et le harnais |
| 4 | Row Level Security | ✅ | 15 tables sur 15, aucune policy en `using (true)`. Mesuré en direct |
| 5 | Chiffrement des données sensibles | 🟡 | Téléphones en clair — nécessaires à l'envoi. Le mot de passe d'un prospect, lui, ne repose qu'en empreinte bcrypt |
| 6 | Autorisation côté serveur | ✅ | **Fermé.** Mesuré aujourd'hui : **16 Edge Functions détiennent la clé de service, 14 vérifient leur appelant avant de s'en servir.** Les deux qui ne le font pas — `demander-ouverture` et `mot-de-passe-oublie` — sont publiques par construction et bornées par `consommer_debit` |
| 7 | Verrouillage par enregistrement | ✅ | Toutes les policies filtrent sur `auth.uid()` |
| 8 | Champs non modifiables | ✅ | GRANT de colonne partout. `paiements_abonnement` : aucune policy d'écriture, plus un déclencheur d'immuabilité qui vaut contre `service_role` |
| 9 | Cookies de session | 🟡 | `localStorage`, défaut de `supabase-js`, sans vecteur sous cette CSP |
| 10 | Mots de passe hachés | ✅ | Délégué à Supabase Auth. Le mot de passe d'un prospect est haché par `bcryptjs` **avant** la première écriture, et `auth.admin.createUser({ password_hash })` reprend l'empreinte au règlement |
| 11 | Rate limiting | 🟠 | `consommer_debit` borne les fonctions publiques ; la limite Auth reste au défaut de la plateforme. Le webhook n'est pas borné — voir 🟡 |
| 12 | Protection anti-bot | 🟡 | Aucun CAPTCHA. La borne par IP arrête l'attaque simple, pas la distribuée — et le coût par requête a augmenté |
| 13 | Requêtes paramétrées | ✅ | Aucune concaténation SQL |
| 14 | Validation des entrées | ✅ | `valider-demande`, `valider-collecteur`, `valider-email`, plus les `check` de la base. `montantCoherent` ajoute la tolérance anti-fraude côté paiement |
| 15 | Échappement du contenu | ✅ | Zéro `dangerouslySetInnerHTML`, zéro `innerHTML` |
| 16 | Uploads restreints | ⚪️ | Non applicable : aucun bucket |
| 17 | Réponses API épurées | ✅ | Aucun `select('*')` applicatif. Le webhook ne rend qu'un accusé et un décompte |
| 18 | Headers de sécurité | ✅ | Mesurés en production au passage du 2026-09-03. **Non remesurés ici** — rien n'a été déployé depuis, donc rien n'a pu changer, mais c'est un raisonnement et non une mesure |
| 19 | HTTPS forcé | ✅ | `301` mesuré, HSTS un an |
| 20 | Dépendances scannées | ✅ | **0 vulnérabilité, développement compris.** Une « high » trouvée et corrigée aujourd'hui |

---

## Ce qui reste, et qui ne s'écrit pas dans le dépôt

Le dispositif de paiement est **entier dans le dépôt et absent de la
production**. Rien n'encaisse, et rien ne le fera avant trois gestes qui
demandent des identifiants :

1. **Régénérer `SUPABASE_ACCESS_TOKEN`.** *Fait le 2026-09-04 à 07:00 ; reste à
   éprouver.*

   > **Correction du 2026-09-04.** La première rédaction de cette ligne disait
   > « le travail de déploiement du CI est rouge à chaque poussée depuis ».
   > C'est faux, et l'historique des exécutions le dit : le job a été **rouge une
   > seule fois**, le 2026-09-03 à 16:46 (exécution 33780606136), à l'étape
   > « Le jeton est-il accepté ? ». Le secret a ensuite été retiré, et depuis, le
   > job **passe au vert en sautant le déploiement** — l'étape « Le jeton est-il
   > posé ? » répond non et pose un avertissement.
   >
   > La nuance compte : un job rouge se voit, un job vert qui n'a rien déployé ne
   > se voit pas. C'est exactement le piège que le commentaire du workflow décrit
   > pour les « ✓ en 7 secondes » qui ne déployaient rien, et je l'ai reproduit
   > en lisant un verdict d'exécution sans lire ses étapes.
2. **Appliquer les quatre migrations**, avant les fonctions.
3. **Poser les quatre secrets Chariow**, et déployer le webhook avec
   `--no-verify-jwt` — le seul endroit du projet où ce drapeau paraît.

`Docs/deploiement.md` §7 dit l'ordre et les six pièges.
