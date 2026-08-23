# Audit du 2026-08-23 — la vitrine, le cache de navigation, la posture en ligne

> **Périmètre.** Les deux livraisons du 22 août : le passage responsive de
> l'application collecteur avec son cache de navigation (`a7fecd4`), et la
> reconstruction du site public (`e4e4acc`). Plus une revérification de la
> posture de production, qui n'avait pas été mesurée depuis le déblocage de
> Netlify.
>
> **Verdict : trois défauts, dont un qui touchait à l'argent. Les trois sont
> corrigés dans cet audit.** La posture de sécurité, elle, est intacte sur les
> trois cibles.

---

## 1. Ce qui a été mesuré, et comment

Rien dans ce document n'est déclaré sur la foi du dépôt. Chaque ligne du
tableau ci-dessous vient d'une commande jouée contre la production ou contre
l'artefact construit.

| Contrôle | Méthode | Résultat |
|---|---|---|
| Les 6 Edge Functions sans jeton | `curl` sans en-tête `Authorization` | **401** sur les six |
| Les 9 tables face à la clé anonyme | `GET /rest/v1/<table>` avec la clé anonyme | **42501** sur les neuf |
| `admin_reglages` face à la clé anonyme | `POST /rest/v1/rpc/admin_reglages` | **42501** — `permission denied for function` |
| En-têtes de sécurité, 3 sites | `curl -I` | CSP, HSTS, `X-Frame-Options: DENY` présents partout |
| Indexation | en-tête `X-Robots-Tag` | `noindex` sur collecteur et admin, **absent du site** — voulu, c'est la surface commerciale |
| Conformité des artefacts servis | `npm run verifier:en-ligne` | les trois cibles servent ce que le dépôt déclare |
| Fuite de clé de service | `npm run verifier:bundles` | aucune |
| Appels tiers depuis la vitrine | `grep` des hôtes dans le paquet construit | **aucun** — voir §4 |

Les neuf tables sont bien `admins`, `audit_log`, `caisses_jour`, `cartes`,
`clients`, `collecteurs`, `mises`, `retraits`, `synchro_rejets` — lues dans
`pg_tables`, pas recopiées de mémoire. Une première passe de ce contrôle a
interrogé deux noms qui n'existent pas (`journal`, `abonnements`) et reçu un
`PGRST205` que j'aurais pu prendre pour un refus. Ce n'en est pas un : c'est
« table inconnue ». Un contrôle de sécurité qui se rassure sur une table
absente ne contrôle rien.

---

## 2. 🔴 Le rapprochement servait un « cash attendu » d'avant l'encaissement

**C'est le constat qui compte dans cet audit.**

Le cache de navigation livré la veille périme ses valeurs par une *révision* :
toute écriture du collecteur incrémente un compteur porté par la coquille, et
une valeur rangée sous une révision antérieure n'est jamais resservie. Le
module le documente noir sur blanc — « il ne sert jamais une valeur d'avant une
écriture », au motif exact qu'un solde périmé fait encaisser deux fois.

Six écrans recevaient cette révision. **Le rapprochement ne la recevait pas.**

```tsx
// Coquille.tsx — avant
{page === 'rapprochement' && (
  <Rapprochement collecteurId={collecteurId} onRetour={() => setPage('accueil')} />
)}
```

L'écran avait bien une révision, mais **la sienne**, incrémentée seulement
quand il enregistrait une déclaration de caisse. Un encaissement fait ailleurs
ne la touchait pas.

### Pourquoi c'est un défaut d'argent, pas d'affichage

`cash_attendu` est la somme des mises du jour — `chargerRapprochement` la
calcule ainsi lorsque aucune déclaration n'existe encore, et le déclencheur
serveur fait de même. **Encaisser une mise change donc ce nombre par
construction.**

Le scénario, entièrement à l'intérieur de la fenêtre de 45 secondes :

1. Le collecteur ouvre Rapprochement en fin de tournée. Attendu : 12 000 FCFA.
2. Un dernier client le rattrape. Il encaisse 500 FCFA.
3. Il rouvre Rapprochement. **L'écran affiche toujours 12 000.**
4. Il compte sa caisse : 12 500. L'écart annoncé serait **+500**.

Un excédent de caisse se lit comme « une mise encaissée mais pas enregistrée ».
Le collecteur cherche une erreur qui n'existe pas — ou, pire, corrige à la
main. L'écran qui existe pour détecter les écarts en fabriquait un.

### Correction

La révision de la coquille est passée à l'écran, et additionnée aux
déclarations locales :

```tsx
const [declarations, setDeclarations] = useState(0);

const { donnees, erreur: erreurLecture } = useDonnees('rapprochement', chargerRapprochement, {
  revision: revision + declarations,
  messageErreur: 'Caisse indisponible. Vérifie le réseau.',
});
```

Les deux compteurs restent distincts parce qu'ils ne disent pas la même chose :
déclarer sa caisse ne concerne aucun autre écran, donc rien ne justifie de
périmer leurs caches. La somme est monotone — les deux ne font que croître —
donc deux états différents ne peuvent pas retomber sur la même clé.

### Ce que la revue initiale a manqué

J'ai vérifié que chaque écran *recevait un cache*, pas que chaque écran
*recevait la bonne source d'invalidation*. Les deux se ressemblent à la
relecture, et un seul des deux protège l'argent. **C'est la quatrième fois dans
ce projet qu'un défaut naît d'un chemin supposé plutôt que parcouru** — après
la sonde HIBP, le `curl` CORS, et le 207 lu comme un succès.

---

## 3. 🟡 La vitrine annonçait respecter le mouvement réduit, et ne le faisait qu'à moitié

`animation.ts` porte cette phrase :

> `prefers-reduced-motion` est respecté via `gsap.matchMedia()` […] Ce n'est pas
> une politesse décorative — les animations de défilement sont précisément la
> catégorie qui déclenche les cinétoses.

C'était vrai des animations GSAP. Ça ne l'était pas des **trois artefacts de la
section Produit**, qui tournent sur `setInterval` brut, hors de GSAP :

| Artefact | Période | Ce qu'il fait |
|---|---|---|
| Mélangeur de cartes | 3 000 ms | Fait tourner trois cartes de collecte |
| Flux télémétrie | **34 ms** | Tape le journal de caisse caractère par caractère |
| Planificateur | 1 400 ms | Déplace un curseur, coche des jours |

Le second est le problème : **≈ 29 rendus par seconde, en continu, y compris
hors écran**, sur la page d'entrée d'un produit dont les visiteurs sont sur
téléphone d'entrée de gamme. Un visiteur qui a demandé « moins de mouvement »
le recevait quand même, et payait la batterie.

**Correction.** Un `useMouvementAccepte()` partagé, qui *suit* la préférence —
elle se change sans recharger la page, et un composant qui ne l'écoute qu'au
montage rate le changement.

Au repos, les trois cartes montrent leur **état final**, pas un état vide :
le journal complet, les deux jours déjà cochés. On retire l'animation, jamais
le contenu — une carte muette serait une régression pour la personne qui a
justement demandé à ne pas être distraite.

---

## 4. 🟡 Une lecture de cache qui modifiait le cache, pendant le rendu

`lireCache` supprimait l'entrée périmée au passage. Les écrans l'appellent
depuis l'initialiseur de `useState` — c'est-à-dire **pendant le rendu**, dont
React ne garantit rien : il peut l'abandonner, le rejouer, et sous StrictMode
il le rejoue systématiquement.

Aucun symptôme observable ici : les deux appels rendent le même résultat. Mais
c'est une mutation d'état global en phase de rendu, et la prochaine personne
qui étend ce module héritera du piège.

La purge n'était de toute façon pas nécessaire. Elle protégeait d'une
« résurrection » — revenir à une révision antérieure — que la monotonie des
compteurs rend impossible. `lireCache` est désormais pure ; `oublier()` reste
pour les cas où l'on veut vraiment jeter, et son seul appelant est
`rafraichir`, hors rendu.

Le test qui affirmait la suppression a été remplacé par deux tests qui
affirment la nouvelle règle : une lecture ne modifie rien, et une entrée
périmée est écrasée par la lecture suivante.

---

## 5. Ce qui a été vérifié et tenu

### Le débordement horizontal est réellement clos

`overflow-x: clip` est bien posé sur `html`, et non `hidden`. La distinction
n'est pas cosmétique : `hidden` transforme l'élément en conteneur de
défilement, ce qui aurait cassé le `position: sticky` de la barre du bas.
Contrôle : `position:sticky` est toujours présent dans la feuille construite du
collecteur.

### Les marges système sont émises

Les trois utilitaires `pt-entete`, `pb-barre`, `px-marge` sortent bien dans le
CSS construit, avec leur `env(safe-area-inset-*)`. Le point de rupture `xs`
produit bien un `@media (width>=390px)`. Vérifié dans l'artefact, pas dans la
source — un utilitaire Tailwind v4 déclaré peut ne pas être émis.

### La vitrine n'appelle personne

Trois hôtes apparaissent dans le paquet : `react.dev`, `gsap.com`,
`www.w3.org`. Les trois sont **inertes** — l'URL d'un message d'erreur React,
celle d'un avertissement GSAP, l'espace de noms SVG. Aucun `XMLHttpRequest`,
aucun `WebSocket`. Le seul `fetch(` est le pré-chargement de modules de Vite,
sur des `href` de même origine.

C'est cohérent avec la CSP du site, qui dit `connect-src 'self'` et
`form-action 'none'` : **aucune donnée ne quitte cette page**. C'est aussi ce
qui a dicté la direction visuelle — les guilloches et les rosaces sont
dessinées en SVG parce que `img-src 'self'` interdit Unsplash, et qu'une page
de vente qui appelle un CDN tiers avant son premier octet utile ralentit
exactement le téléphone qu'elle prétend servir.

---

## 6. 🟡 Reconduits, et assumés

### Le poids de la vitrine

**336 Ko de JavaScript, 113 Ko une fois comprimé.** GSAP et son ScrollTrigger
en sont l'essentiel. Sur une connexion de marché, c'est une à deux secondes
avant l'interactivité.

Le coût est assumé pour l'instant : la page est la surface commerciale, et son
animation *est* l'argument. Mais le chiffre est consigné ici pour qu'il soit
discuté plutôt que découvert. Deux sorties existent le jour où il gêne — ne
charger GSAP qu'au premier défilement, ou remplacer l'empilement du protocole
par des `position: sticky` en CSS pur, ce qui retirerait ScrollTrigger.

### L'adresse de contact en clair

Le CTA « Demander une démo » porte `gsmtechnoloy@gmail.com` en `mailto:`, sur
une page publique et dans un dépôt public. C'est un choix confirmé par le
propriétaire le 2026-08-22. Conséquence connue : cette adresse sera moissonnée.
Une adresse dédiée au produit la remplacerait sans rien coûter.

### `photo_url` face à la CSP

Reconduit des audits précédents. Le jour où les photos de clients seront
affichées : compartiment privé, URL signées, et l'origine exacte dans
`img-src` — jamais un joker.

---

## 7. 🟢 Clos pendant l'audit — le cache survivait à une session expirée

`viderCache()` n'était appelé que par le bouton « Déconnexion » de la coquille.
Un jeton expiré, ou une session révoquée depuis un autre appareil, laissait
donc en mémoire les noms et les soldes des clients jusqu'au rechargement de la
page.

Le risque était borné — mémoire seulement, jamais le disque — mais le correctif
tient en une ligne, au seul endroit qui voit les trois cas :

```tsx
supabase.auth.onAuthStateChange((evenement, s) => {
  if (evenement === 'SIGNED_OUT') viderCache();
  setSession(s);
});
```

C'est aussi le bon endroit : la coquille traitait un cas particulier, `App`
traite l'événement. Le module de cache annonçait « vidé à la déconnexion » ;
c'est maintenant vrai de toutes les déconnexions.

---

## 8. État de la chaîne

```
tsc            collecteur ✓   admin ✓   site ✓   ui ✓
oxlint         site ✓
tests          46 + 9 + 19 + 24 + 28 = 126
constructions  3 ✓
theme.css      à jour avec tokens.ts
paquets        aucune fuite de clé de service
en ligne       les trois cibles conformes aux artefacts du dépôt
```

Les 24 tests du collecteur comprennent les 14 du cache de navigation, dont les
deux écrits pendant cet audit.

---

## 9. Ce qui reste ouvert

| | Sujet | Action |
|---|---|---|
| 🟡 | Poids de la vitrine (113 Ko comprimés) | À trancher : chargement différé de GSAP, ou sticky CSS |
| 🟡 | Adresse Gmail publique sur le CTA | Une adresse dédiée au produit |
| 🟡 | `photo_url` et CSP | À traiter au moment de câbler les photos |

Aucun 🔴 ouvert à la clôture de cet audit.
