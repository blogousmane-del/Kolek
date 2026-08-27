# Le prospect devient collecteur par lui-même

**Date :** 2026-08-27 · **État :** validé, prêt pour le plan d'exécution.

## Le problème

Un prospect remplit le formulaire de la vitrine. Sa demande arrive en base, GTCS
la voit dans l'écran d'administration — et la chaîne s'arrête là. Le formulaire
ne demande **pas d'adresse e-mail**, donc rien ne permet de le joindre autrement
qu'en composant son numéro. Et rien, dans le produit, ne transforme une demande
accordée en compte utilisable.

Il manque aussi une porte de secours : **« mot de passe oublié » n'existe nulle
part**. Ni dans `apps/collecteur/src/Connexion.tsx`, ni dans
`packages/ui/src/EcranConnexion.tsx`. Un collecteur qui perd son mot de passe
perd son accès, et la seule issue est un appel à GTCS.

## Ce qu'on construit

Le prospect saisit son adresse. GTCS accorde. Le compte naît, et le prospect
reçoit un courriel portant un lien : il choisit son mot de passe et entre. S'il
l'oublie plus tard, le même dispositif le lui rend.

## Les quatre décisions, et pourquoi

**L'accès voyage par lien d'invitation, jamais par mot de passe.** Un mot de
passe écrit dans un courriel dort dans une boîte de réception pour toujours, et
rien n'oblige à le changer. Le lien à usage unique laisse le prospect choisir le
sien — et le contrôle HIBP déjà en place (`_shared/hibp.ts`) s'applique à ce
choix. Bénéfice secondaire décisif : c'est **exactement la même mécanique** que
« mot de passe oublié ». Un seul dispositif à construire, configurer et
surveiller.

**Nous composons et déclenchons l'envoi ; un fournisseur achemine.** Supabase
peut envoyer lui-même via un SMTP réglé au tableau de bord ; on ne le fait pas.
Le service intégré plafonne à deux courriels par heure — `email_sent = 2` dans
`config.toml` — et le troisième prospect de la journée ne recevrait rien sans
qu'aucune erreur ne le dise. Une clé d'API chez un fournisseur reste nécessaire
dans les deux cas, ainsi que la vérification DNS de `kolek.cash` ; ce que ce
choix nous donne, c'est la maîtrise du texte du message et un chemin unique pour
l'invitation comme pour l'oubli.

**L'adresse devient obligatoire dans le formulaire public.** Le dépôt affirme
aujourd'hui le contraire — `admin-creer-collecteur` explique que « attendre une
confirmation par courriel bloquerait un collecteur qui n'a pas d'adresse à lui —
cas courant sur ce marché ». C'est vrai du collecteur qu'on équipe sur place. Ce
n'est pas vrai de celui qui remplit le formulaire d'abonnement : il choisit une
offre, il paiera, il gérera son activité. Une adresse créée pour l'occasion
suffit, et sans elle aucun des trois services demandés ne peut exister.

**`admin-creer-collecteur` reste tel quel.** GTCS garde la possibilité de créer
un compte avec un mot de passe et de le remettre en main propre. Le dépôt
n'aime pas les doubles chemins, et le fichier le dit lui-même — mais ici les
deux chemins servent deux situations réelles : le prospect à distance qui
s'invite, et le collecteur équipé au comptoir. Ce qui est interdit reste
interdit : ni l'un ni l'autre ne contourne `disable_signup`.

---

## Architecture

### La passerelle courriel

`supabase/functions/_shared/passerelle-courriel.ts`, calquée sur
`_shared/passerelle-sms.ts` — même forme, mêmes garanties :

```ts
export function passerelleDepuis(env: Record<string, string>): Passerelle | null;
export function envoyer(p: Passerelle, destinataire: string, sujet: string, corps: string): Promise<Issue>;
export function lireIssue(statut: number): Issue;
export type Issue = { ok: true } | { ok: false; reessayable: boolean; raison: string };
```

Le principe est repris tel quel de l'en-tête de la passerelle SMS : **elle ne
prétend jamais avoir envoyé**. Sans identifiants, `passerelleDepuis` rend `null`
et l'appelant le dit ; il n'y a pas d'envoi simulé, pas de ligne marquée
« envoyé ». *Un système qui prétendrait avoir prévenu sans avoir prévenu serait
pire que son absence.*

Resend derrière par défaut. `lireIssue` traduit le statut HTTP comme son jumeau
— 429 en `DEBIT_DEPASSE` réessayable, 5xx réessayable, 401/403 en
`IDENTIFIANTS_REFUSES` définitif. Changer de fournisseur ne touche que ce
fichier.

### Le formulaire public

`DemandeBrute` et `DemandeValide` gagnent `email` dans
`_shared/valider-demande.ts`, avec sa borne dans `BORNES` et trois refus
nommés — `EMAIL_MANQUANT`, `EMAIL_INVALIDE`, `EMAIL_TROP_LONG` — traduits dans
`apps/site/src/vitrine/demande.ts` comme les autres. La validation reste sans
API Deno, donc couverte par la suite de tests du dépôt.

`Inscription.tsx` gagne le champ, en `type="email"`, après le nom.

### La base — migration `demandes_email`

Colonne `email text` sur `demandes_ouverture`, **nullable**. Les demandes déjà
déposées n'en portent pas, et un `not null` rétroactif obligerait à inventer une
adresse pour les satisfaire. L'obligation vit à l'entrée, dans la validation ;
la colonne enregistre ce qui est arrivé.

S'y ajoutent une contrainte `check` de bornes — jumelle de `demandes_nom_borne`
et consorts — et un index unique partiel sur `lower(email)` où
`statut = 'nouvelle'`, jumeau de `demandes_telephone_en_attente`. Sans lui, une
même adresse dépose mille demandes.

`admin_traiter_demande` rend aujourd'hui `{id, statut}` ; elle rendra aussi
`email`, `nom`, `telephone` et `palier` — la fonction appelante en a besoin pour
composer le compte, et un second aller-retour en base pour relire la ligne
qu'on vient de mettre à jour serait du gaspillage.

### L'accord — `admin-demandes`

Quand le statut demandé vaut `ouverte`, la fonction enchaîne :

1. `generateLink({ type: 'invite', email, options: { data: { nom, telephone }, redirectTo } })`.
   Cet appel **crée le compte et rend le lien sans rien envoyer** — c'est
   exactement ce qu'il nous faut. Le déclencheur `on_auth_user_created`
   (`creer_collecteur_apres_signup`) compose alors la ligne `collecteurs` en
   lisant `raw_user_meta_data->>'nom'` et `'telephone'` : le chemin déjà en
   place, celui qu'`admin-creer-collecteur` emprunte aussi.
2. Palier et zone sont posés depuis la demande, comme le fait déjà
   `admin-creer-collecteur` — ils ne figurent pas dans les métadonnées
   d'inscription.
3. Le courriel part par la passerelle.
4. **Alors seulement** la demande passe à `ouverte`.

**L'ordre est le cœur de ce dessin.** Marquer la demande traitée avant l'envoi
produirait, à la première panne de la passerelle, une demande classée
« ouverte » dont le prospect n'a jamais rien reçu — invisible dans l'écran
d'administration, découverte des semaines plus tard par un appel. En marquant
après, un échec d'envoi laisse la demande en l'état et rend un code distinct :
`COURRIEL_NON_PARTI`. L'administrateur lit « compte créé, courriel non parti »
et peut relancer.

Le compte, lui, existe déjà à ce stade. C'est assumé : `generateLink` est
idempotent sur une adresse connue, une relance rend un nouveau lien pour le même
compte sans en créer un second.

### Le mot de passe oublié — `mot-de-passe-oublie`

Nouvelle Edge Function **publique**, la deuxième du produit après
`demander-ouverture`. Elle prend `{ email }`, engendre un lien
`type: 'recovery'`, et l'envoie.

**Elle rend toujours la même réponse**, que l'adresse soit connue ou non.
L'audit du 2026-08-25 a mesuré que Kolek ne permet pas d'énumérer ses comptes —
un compte inexistant et un mot de passe faux rendent le même
`invalid_credentials`. Ce nouvel accès ne doit pas ouvrir ce que le reste
ferme : une réponse qui distingue « adresse inconnue » de « courriel envoyé »
est un annuaire de comptes.

CORS restreint à l'origine de l'application collecteur, par `_shared/cors.ts`.

### La borne de débit

Deux fonctions publiques au lieu d'une, et l'audit chiffre déjà l'absence de
borne sur la première : `grep -cin "ratelimit\|captcha\|turnstile"` rend **0**.
Livrer la seconde sans rien serait doubler un manquement connu.

Un compteur en base — table `debit_public (empreinte text, fenetre timestamptz,
compte int)`, écrite par une fonction `security definer` appelée par les deux
Edge Functions, avec l'adresse IP de l'appelant et le nom de la route pour
empreinte. Pas de Redis : la base est déjà là, déjà sous RLS, déjà auditée, et
un service de plus serait un secret de plus à faire tourner.

Une demande d'ouverture par minute et par IP ; trois demandes de
réinitialisation par quart d'heure. Au-delà, `429` — et pour la
réinitialisation, la **même réponse** que le cas normal, pour la raison
ci-dessus.

### Les écrans

`packages/ui/src/EcranConnexion.tsx` gagne un lien « Mot de passe oublié ? »
sous le formulaire, optionnel : les trois applications partagent ce composant, et
l'administration n'a pas le même besoin.

`apps/collecteur` gagne deux écrans :

- **`MotDePasseOublie`** — une adresse, un envoi, et un message qui ne dit
  jamais si le compte existe : « Si un compte porte cette adresse, le lien est
  parti. »
- **`NouveauMotDePasse`** — où atterrissent l'invité **et** celui qui a oublié.
  Supabase pose une session depuis le fragment de l'adresse ; l'écran demande le
  mot de passe, le soumet au contrôle HIBP, puis appelle `updateUser`. Un seul
  écran pour les deux parcours : ils demandent exactement la même chose.

### Deux réglages hors code

`config.toml` : `additional_redirect_urls` ne contient aujourd'hui que
`localhost`. Sans `https://app.kolek.cash/nouveau-mot-de-passe`, Supabase refuse
la redirection et le lien mène nulle part. À poser aussi dans le tableau de bord
du projet distant — le fichier local ne pilote pas la production.

Et la clé du fournisseur, en secret d'Edge Function, plus les enregistrements
DNS de `kolek.cash` chez lui.

---

## Ce qui est vérifié, et comment

| Étage | Contrôle |
|---|---|
| `valider-demande` | Adresse absente, mal formée, trop longue, valide ; les refus existants ne bougent pas |
| `passerelle-courriel` | Configurée, absente (rend `null`), en échec réessayable, en échec définitif |
| Migration | Colonne nullable, contrainte de borne, index unique partiel ; une seconde demande sur la même adresse en attente est refusée |
| `admin-demandes` | Accord réussi : compte créé, courriel parti, demande `ouverte`. **Courriel en échec : demande inchangée**, code `COURRIEL_NON_PARTI` |
| `mot-de-passe-oublie` | Adresse connue et inconnue rendent une réponse **identique**, octet pour octet |
| Borne de débit | La deuxième demande dans la minute est refusée ; la fenêtre expirée réarme |
| Vitrine | Le champ existe, un envoi sans adresse est refusé côté client comme serveur |
| Collecteur | Les deux écrans ; un mot de passe divulgué est refusé |

Puis `npm run verifier` en entier, et un essai de bout en bout sur le projet
distant : déposer une demande depuis `kolek.cash`, l'accorder depuis
`admin.kolek.cash`, recevoir le courriel, choisir un mot de passe, entrer dans
`app.kolek.cash`.

## Ce que ce lot ne fait pas

Il ne touche ni au paiement de l'abonnement, ni à la révocation d'un accès, ni à
la vérification de l'adresse avant l'accord — un prospect peut saisir une
adresse qui n'est pas la sienne, et c'est GTCS qui tranche en accordant. Il ne
remplace pas non plus `admin-creer-collecteur`.

Et il ne règle pas le bloquant ouvert depuis le 2026-08-24 : la clé
`service_role` publiée ce jour-là n'est toujours pas révoquée. Ces deux nouvelles
fonctions s'appuieront sur elle comme les autres.
