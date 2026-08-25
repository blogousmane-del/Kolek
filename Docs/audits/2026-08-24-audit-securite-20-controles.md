# Audit de sécurité — Kolek

**Date :** 2026-08-24 · **Périmètre :** dépôt `blogousmane-del/Kolek`, projet Supabase
`yfnwmokxkznejotgpfgf`, sites `kolek-collecteur`, `kolek-admin` et `kolek-site`.

> **Ce verdict a été révisé le lendemain.** La vérification du 2026-08-25
> (`2026-08-25-verification-audit.md`) confirme onze constats à l'identique,
> mais relève un bloquant qu'aucun des vingt contrôles ne pouvait voir : une clé
> `service_role` publiée puis retirée le 24, et jamais révoquée depuis. Lire les
> deux documents ensemble.

**Verdict : PRÊT À LANCER.** Aucun constat bloquant. Les douze tables sont
sous RLS avec des politiques nominatives, le rôle anonyme n'a strictement aucun
privilège, et l'isolation entre collecteurs a été démontrée sur les données
réelles. Deux points demandent une correction dans la semaine, tous deux sur la
même faiblesse : rien ne borne le débit d'un appelant automatisé.

| | Nombre |
|---|---|
| 🔴 Bloquant | 0 |
| 🟠 Important | 2 |
| 🟡 À faire | 2 |
| ⚪️ Non applicable | 1 |
| Non vérifié | 0 |

## Ce qui change depuis l'audit du 2026-08-21

Trois différences de méthode, et elles comptent.

**L'accès a changé de nature.** Les audits précédents sondaient la production
depuis l'extérieur avec la clé anonyme, et devaient déduire. Celui-ci interroge
la base directement par la CLI liée : les privilèges, les politiques et les
déclencheurs sont **lus**, plus supposés.

**Deux tables sont apparues** — `avis_clients` et `avis_reglages`, arrivées avec
le dispositif de notification du 2026-08-23. Elles sont auditées ici pour la
première fois.

**La production a enfin rattrapé le dépôt.** Les audits des 2026-08-18 au
2026-08-21 constataient tous que les sites servaient une version antérieure au
code. Ce n'est plus le cas : les trois bundles en ligne correspondent au commit
courant.

---

## 🟠 À corriger dans la semaine

### 1. Le formulaire public d'ouverture de compte n'a aucune borne de débit — contrôle n°12

**Où :** `supabase/functions/demander-ouverture/index.ts`

**Le problème.** C'est le seul chemin d'écriture ouvert sans authentification.
Il valide correctement ce qu'il reçoit, ne rend rien de ce qu'il écrit, et
refuse un doublon — mais uniquement le **même** numéro :

```sql
CREATE UNIQUE INDEX demandes_telephone_en_attente
  ON public.demandes_ouverture (telephone) WHERE (statut = 'nouvelle')
```

Un script qui fait varier le numéro contourne l'index entièrement. Ni CAPTCHA,
ni limite par IP : `grep -cin "ratelimit\|captcha\|turnstile"` rend **0** sur la
fonction et sur les neuf modules partagés. Le commentaire de la fonction dit
lui-même que le filtre CORS « n'est pas une protection ».

Conséquence concrète : quelques milliers de fausses demandes noient les vraies
dans l'écran d'administration, et chaque ligne est un numéro de téléphone à
rappeler. Le dispositif d'accueil devient inutilisable sans qu'aucune donnée
n'ait fuité.

**La correction.** Cloudflare Turnstile sur le formulaire de la vitrine, vérifié
**côté Edge Function** et non dans le navigateur. En complément, une borne par
IP dans la fonction — une demande par minute suffit largement pour un formulaire
qu'un humain remplit une fois.

### 2. La limite sur les tentatives de connexion est trop lâche — contrôle n°11

**Où :** configuration Auth du projet Supabase.

**Le problème.** Mesuré en production contre un compte inexistant : le premier
`429` arrive à la **36ᵉ** tentative. C'est le seuil de plateforme par défaut,
jamais resserré. Le protocole vise environ cinq tentatives par quart d'heure sur
une page de connexion. À ce rythme, une seule adresse IP essaie des milliers de
mots de passe par jour, et un botnet multiplie ce chiffre sans effort.

Aucun verrouillage progressif de compte non plus : la limite est par IP, pas par
compte.

**Ce qui atténue déjà, et qu'il faut porter au crédit du projet.** L'inscription
publique est fermée (`disable_signup: true`, vérifié en ligne), il n'existe que
trois comptes, la longueur minimale est de dix caractères, et
`_shared/hibp.ts` refuse les mots de passe divulgués — un module écrit
spécialement parce que `auth.admin.createUser` ne fait tourner aucune règle de
Supabase. Le risque réel est donc faible ; il n'est pas nul.

Point positif mesuré : un compte inexistant et un mot de passe faux rendent le
**même** message, `invalid_credentials`. Pas d'énumération de comptes.

**La correction.** Resserrer les limites Auth dans le tableau de bord Supabase,
et ajouter un verrouillage progressif par compte.

---

## 🟡 Durcissement

**Contrôle n°5 — les numéros de téléphone sont en clair, et en double.** Quatre
numéros de clients, trois de collecteurs. Le déclencheur `clients_journal` écrit
`to_jsonb(new)` dans `audit_log`, donc chaque numéro y est recopié — mesuré :
quatre lignes du journal contiennent un téléphone. Le journal est fermé à tous
les rôles applicatifs et immuable, ce qui limite l'exposition à une fuite
complète de la base. À trancher : soit `pgcrypto`, soit retirer les colonnes
sensibles du `to_jsonb`.

**Contrôle n°9 — la session vit dans `localStorage`.** `createClient(url, cle)`
sans options : c'est le comportement par défaut de Supabase pour une application
monopage. Un jeton y est lisible par tout script de la page. Ce qui rend le
risque théorique ici : la CSP est `script-src 'self'`, sans `unsafe-inline` ni
`unsafe-eval`, et le dépôt ne contient **aucun** `dangerouslySetInnerHTML` ni
`innerHTML`. Il n'y a pas de vecteur XSS connu pour atteindre ce jeton. Passer à
un cookie `httpOnly` exigerait un rendu serveur que le produit n'a pas.

---

## Hors des vingt contrôles — un défaut d'exactitude comptable

**`cash_attendu_du_jour` ne soustrait pas les retraits.**
`supabase/migrations/20260816115500_durcissement_audit.sql:36`

```sql
select coalesce(sum(montant), 0)::integer
  from public.mises
 where collecteur_id = p_collecteur
   and (encaisse_le at time zone 'UTC')::date = p_date;
```

Le report était **délibéré et documenté** : la table `retraits` n'était pas
écrite avant J3, et le commentaire explique qu'ajouter une soustraction
qu'aucun test ne peut exercer reviendrait à écrire du code mort qu'on croirait
vérifié. Le raisonnement était bon.

Il a expiré. `retraits` contient aujourd'hui **2 lignes** en production, et
porte son déclencheur d'immuabilité. La condition du report n'est plus remplie.

Le défaut reste latent parce que `caisses_jour` est vide : personne n'a encore
rapproché sa caisse. Le premier collecteur qui clôture une carte puis compte sa
sacoche verra un attendu trop haut, et un écart négatif à tort — c'est-à-dire
qu'on lui reprochera un manquant qui n'existe pas. Sur un produit dont le sujet
est la confiance entre un collecteur et son argent, c'est le pire endroit où se
tromper.

**La correction :** `- (select coalesce(sum(montant_restitue), 0) from
public.retraits where collecteur_id = p_collecteur and (cloture_le at time zone
'UTC')::date = p_date)`, avec un test qui exerce une journée comportant une
clôture.

---

## ⚪️ Non applicable

**Contrôle n°16 — uploads.** `select id, public from storage.buckets` rend zéro
ligne : aucun bucket n'existe. La colonne `clients.photo_url` est prévue mais
rien ne l'alimente. Rien à restreindre aujourd'hui ; à réauditer le jour où un
bucket est créé.

---

## Les 20 contrôles

| # | Contrôle | Statut | Preuve |
|---|---|---|---|
| 1 | Clés API cachées | ✅ | Aucun motif `sk-`, `pk_live_`, `AKIA…` dans le dépôt |
| 2 | Secrets purgés de Git | ✅ | Historique complet : seuls des `.env.example` ; `.gitignore` couvre `.env` et `.env.*` |
| 3 | Bonne clé côté client | ✅ | Zéro `service_role` dans les trois bundles en ligne |
| 4 | Row Level Security | ✅ | **12 tables, 12 avec RLS**, zéro politique `true` |
| 5 | Chiffrement des données sensibles | 🟡 | 7 téléphones en clair, recopiés dans `audit_log` |
| 6 | Autorisation côté serveur | ✅ | `est_admin()` SECURITY DEFINER sur `auth.uid()` ; 7/7 fonctions admin appellent la garde ; `verify_jwt` sur les 10 |
| 7 | Verrouillage par enregistrement | ✅ | **Démontré :** 4 clients en base, A en voit 0, B en voit 1 |
| 8 | Champs non modifiables | ✅ | `authenticated` écrit 11 colonnes, toutes inoffensives ; aucun DELETE ; 3 déclencheurs d'immuabilité actifs |
| 9 | Cookies de session | 🟡 | `localStorage` par défaut ; CSP stricte, aucun vecteur XSS |
| 10 | Mots de passe hachés | ✅ | Supabase Auth ; aucune table maison ; refus HIBP en plus |
| 11 | Rate limiting connexion | 🟠 | **429 à la 36ᵉ tentative** ; pas de verrouillage par compte |
| 12 | Anti-bot | 🟠 | Aucun CAPTCHA ni borne sur le formulaire public |
| 13 | Requêtes paramétrées | ✅ | Aucun SQL dynamique dans les 18 migrations |
| 14 | Validation des entrées | ✅ | `validerDemande` testé ; contraintes `check` en base |
| 15 | Échappement du contenu | ✅ | Zéro `dangerouslySetInnerHTML`, zéro `innerHTML` |
| 16 | Uploads restreints | ⚪️ | Aucun bucket de stockage |
| 17 | Réponses API épurées | ✅ | Aucun `select('*')` dans le code applicatif |
| 18 | Headers de sécurité | ✅ | CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer, Permissions — mesurés sur les trois sites |
| 19 | HTTPS forcé | ✅ | 301 sur les trois sites ; HSTS `preload` |
| 20 | Dépendances scannées | ✅ | `npm audit --omit=dev` : 0 vulnérabilité |

## Ce qui mérite d'être souligné

Trois choses sortent de l'ordinaire pour un produit de cet âge.

**Le rôle anonyme n'a aucun privilège.** Pas « RLS le bloque » : il n'a
littéralement aucun `GRANT`, sur aucune colonne, sur aucune des douze tables.
Les treize sondes à la vraie clé de production rendent toutes `401 / 42501`.
C'est une défense en profondeur — même une politique RLS mal écrite ne
l'ouvrirait pas.

**Les privilèges sont accordés colonne par colonne.** `authenticated` peut
écrire 25 colonnes en insertion et 11 en mise à jour, nommément. Ni `palier`, ni
`mises_encaissees`, ni `statut`, ni `est_commission` n'y figurent. Une colonne
ajoutée n'hérite de rien.

**L'immuabilité est portée par des déclencheurs, pas par RLS.** `mises`,
`retraits` et `audit_log` refusent toute modification, y compris à la clé de
service — que RLS, elle, ne contraint pas.
