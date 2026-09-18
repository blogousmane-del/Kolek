# Mentions légales, CGU et politique de confidentialité — plan d'exécution

> **Pour l'exécutant :** SOUS-SKILL REQUISE — utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes se cochent (`- [ ]`).

**But :** servir trois textes juridiques sur la vitrine — mentions légales, conditions générales, politique de confidentialité — les lier depuis le pied de page et le formulaire d'ouverture, exiger une acceptation avant paiement, et rendre un vrai 404 sur l'inconnu.

**Architecture :** les faits d'identité vivent dans **un seul module**, `identite.ts`, que les trois pages lisent. Aucune page ne réécrit un nom, une adresse ou un numéro : deux copies finissent par diverger, et une divergence dans une mention légale est un défaut opposable. Les champs encore inconnus valent `null` et se rendent en marqueur visible, pour qu'une publication accidentelle se voie à l'œil nu. Les pages sont des composants ordinaires de la vitrine, routés par le `App.tsx` maison — pas de bibliothèque de routage, la règle du fichier tient.

**Tech :** React 19, TypeScript, Tailwind, Vitest + Testing Library, Netlify.

## Contraintes globales

- **Spec :** `Docs/specs/2026-09-18-mentions-cgu-confidentialite-design.md`. Toute question de contenu s'y tranche.
- **Exploitant :** BERTHE OUSMANE, personne physique, enseigne GSM TECHNOLOGIE CYBER SHOP, Saïoua (Côte d'Ivoire), compte contribuable **4212842W**, statut **entreprenant** — dispensé d'immatriculation au RCCM.
- **Contact unique :** `contact@kolek.cash`. Le `mailto:gsmtechnoloy@gmail.com` disparaît du dépôt.
- **Aucun numéro ARTCI n'est cité** : il n'en existe pas. Une page qui en inventerait un serait une fausse mention.
- **Pas d'« intérêt légitime »** : la notion n'existe pas en droit ivoirien (loi n° 2013-450, le terme n'apparaît qu'à l'article 27, sur les objectifs statutaires). Le fondement est le **consentement**.
- **L'effacement se dit « anonymisation »**, jamais « suppression totale » : aucune politique `for delete` n'existe dans la base, et les mises sont des pièces comptables à conserver dix ans.
- **Cinq trous connus** — adresse précise, numéro de déclaration d'activité, téléphone professionnel, confirmation de la boîte `contact@kolek.cash`, délai de réponse. Ils se rendent en marqueur, ils ne s'inventent pas.
- **Aucune migration, aucune Edge Function.** `supabase/` n'est pas touché.
- **Rouge d'abord.** Une épreuve qui ne tombe pas avant le correctif ne prouve rien.
- **Les 42 épreuves du site doivent rester vertes.**
- Branche `mentions-et-confidentialite`. **Aucune fusion sans accord explicite de l'exploitant, demandé pour ce geste-là.**

## Les fichiers

| Fichier | Rôle |
|---|---|
| `apps/site/src/vitrine/legal/identite.ts` | **Créer.** Les faits d'identité, source unique. Les trous valent `null`. |
| `apps/site/src/vitrine/legal/PageLegale.tsx` | **Créer.** L'enveloppe commune : titre, date, retour, et le rendu d'un trou. |
| `apps/site/src/vitrine/legal/MentionsLegales.tsx` | **Créer.** |
| `apps/site/src/vitrine/legal/Conditions.tsx` | **Créer.** |
| `apps/site/src/vitrine/legal/Confidentialite.tsx` | **Créer.** |
| `apps/site/src/App.tsx` | **Modifier.** Trois routes de plus. |
| `apps/site/src/vitrine/PiedDePage.tsx` | **Modifier.** Une colonne « Légal ». |
| `apps/site/src/vitrine/liens.ts` | **Modifier.** `CONTACT_DEMO` et les trois chemins. |
| `apps/site/src/vitrine/Inscription.tsx` | **Modifier.** La case d'acceptation. |
| `apps/site/public/404.html` | **Créer.** |
| `apps/site/netlify.toml` | **Modifier.** Routes nommées, plus de joker. |
| `scripts/verifier-mentions.mjs` | **Créer.** Garde de source. |

---

## Tâche 1 : le socle — identité, enveloppe, routes, mentions légales

**Fichiers :**
- Créer : `apps/site/src/vitrine/legal/identite.ts`
- Créer : `apps/site/src/vitrine/legal/PageLegale.tsx`
- Créer : `apps/site/src/vitrine/legal/MentionsLegales.tsx`
- Créer : `apps/site/src/vitrine/legal/MentionsLegales.test.tsx`
- Modifier : `apps/site/src/vitrine/liens.ts`
- Modifier : `apps/site/src/App.tsx`

**Interfaces produites :**
- `IDENTITE: Identite` — objet figé, champs `exploitant`, `enseigne`, `commune`, `adressePrecise`, `compteContribuable`, `declarationActivite`, `telephone`, `contact`, `delaiReponseJoursOuvres`.
- `type Trou = null` — un champ à combler vaut `null`.
- `<PageLegale titre miseAJour>{enfants}</PageLegale>`
- `<Champ valeur nom />` — rend la valeur, ou le marqueur si `null`.
- `MENTIONS_LEGALES = '/mentions-legales'`, `CONDITIONS = '/conditions'`, `CONFIDENTIALITE = '/confidentialite'` exportés de `liens.ts`.

- [ ] **Étape 1 : écrire l'épreuve qui tombe**

```tsx
// apps/site/src/vitrine/legal/MentionsLegales.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MentionsLegales } from './MentionsLegales';

describe('mentions légales', () => {
  it('nomme la personne physique, pas seulement l’enseigne', () => {
    render(<MentionsLegales />);
    // `getAllByText` et non `getByText` : le nom parait deux fois — comme
    // editeur, et comme directeur de la publication.
    expect(screen.getAllByText(/BERTHE OUSMANE/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/GSM TECHNOLOGIE CYBER SHOP/).length).toBeGreaterThan(0);
  });

  it('publie le compte contribuable, qu’exige l’article 9', () => {
    render(<MentionsLegales />);
    expect(screen.getByText(/4212842W/)).toBeTruthy();
  });

  it('nomme les hébergeurs et dit où la base est servie', () => {
    render(<MentionsLegales />);
    expect(screen.getAllByText(/Supabase/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Netlify/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Paris/).length).toBeGreaterThan(0);
  });

  it('donne l’adresse de contact au domaine, et jamais l’ancienne', () => {
    render(<MentionsLegales />);
    expect(screen.getAllByText(/contact@kolek\.cash/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/gmail\.com/)).toBeNull();
  });

  it('marque visiblement ce qui n’est pas encore renseigné', () => {
    render(<MentionsLegales />);
    // L'adresse précise et le téléphone valent `null` tant que l'exploitant
    // ne les a pas donnés. Un trou muet passerait en production sans qu'on
    // le voie ; un trou marqué arrête l'œil.
    expect(screen.getAllByText(/À COMPLÉTER/).length).toBeGreaterThan(0);
  });

  it('n’invente aucun numéro ARTCI', () => {
    const { container } = render(<MentionsLegales />);
    expect(container.textContent).not.toMatch(/ARTCI\s*n[°o]/i);
  });
});
```

- [ ] **Étape 2 : la faire tomber**

Run : `npm test -w @kolek/site -- --run src/vitrine/legal/MentionsLegales.test.tsx`
Attendu : ÉCHEC — `Failed to resolve import "./MentionsLegales"`.

- [ ] **Étape 3 : le module d'identité**

```ts
// apps/site/src/vitrine/legal/identite.ts
/**
 * Les faits d'identité de l'exploitant, en un seul endroit.
 *
 * Trois pages les citent. Deux copies d'un nom ou d'un numéro finissent par
 * diverger, et une divergence entre les mentions légales et la politique de
 * confidentialité est exactement le genre de détail qu'un adversaire relève.
 *
 * Un champ encore inconnu vaut `null`, jamais une chaîne inventée ni une
 * chaîne vide : `Champ` le rend en marqueur visible (voir `PageLegale`).
 *
 * Aucun script n’échoue sur un trou — c’est l’exploitant qui décide quand
 * publier, pas la chaîne de vérification. Le marqueur est là pour être vu,
 * et la tâche 7 en fait un point d’accord explicite.
 */

/** Un fait que l'exploitant n'a pas encore fourni. */
export type Trou = null;

export interface Identite {
  /** La personne physique. Une enseigne ne désigne personne en droit. */
  exploitant: string;
  enseigne: string;
  commune: string;
  /** Quartier, lot ou boîte postale. Une commune seule ne permet pas d'assigner. */
  adressePrecise: string | Trou;
  pays: string;
  compteContribuable: string;
  /** Déposée sans frais au greffe ; l'entreprenant en est dispensé de RCCM. */
  declarationActivite: string | Trou;
  telephone: string | Trou;
  contact: string;
  /** Annoncé dans la politique, donc opposable : ne pas promettre 48 h. */
  delaiReponseJoursOuvres: number | Trou;
}

export const IDENTITE: Readonly<Identite> = Object.freeze({
  exploitant: 'BERTHE OUSMANE',
  enseigne: 'GSM TECHNOLOGIE CYBER SHOP',
  commune: 'Saïoua',
  adressePrecise: null,
  pays: 'Côte d’Ivoire',
  compteContribuable: '4212842W',
  declarationActivite: null,
  telephone: null,
  contact: 'contact@kolek.cash',
  delaiReponseJoursOuvres: null,
});

/** Le texte que porte un champ non renseigné. Repris par la garde de source. */
export const MARQUEUR_TROU = 'À COMPLÉTER';
```

- [ ] **Étape 4 : l'enveloppe commune**

```tsx
// apps/site/src/vitrine/legal/PageLegale.tsx
import type { ReactNode } from 'react';

import { MARQUEUR_TROU } from './identite';

/**
 * L'enveloppe des trois textes juridiques.
 *
 * Elle ne décore pas : elle donne un titre, une date de mise à jour — qu'un
 * lecteur cherche avant tout le reste — et un retour vers la vitrine. La
 * mesure de ligne est bornée : un texte juridique se lit mal en pleine
 * largeur d'écran.
 */
export function PageLegale({
  titre,
  miseAJour,
  children,
}: {
  titre: string;
  /** Date ISO, affichée telle quelle : une date localisée se discute. */
  miseAJour: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <a
        href="/"
        className="font-body text-sm text-primary underline underline-offset-2"
      >
        ← Retour à l’accueil
      </a>
      <h1 className="mt-6 font-display text-3xl sm:text-4xl">{titre}</h1>
      <p className="mt-2 font-body text-sm text-muted-foreground">
        Dernière mise à jour : {miseAJour}
      </p>
      <div className="mt-8 flex flex-col gap-6 font-body text-base leading-relaxed">
        {children}
      </div>
    </main>
  );
}

/**
 * Un fait, ou la marque de son absence.
 *
 * Un trou rendu en blanc passerait en production sans qu'on le voie. Rendu en
 * capitales sur fond d'alerte, il arrête l'œil du premier lecteur venu — y
 * compris celui de l'exploitant qui relit sa propre page.
 */
export function Champ({ valeur, nom }: { valeur: string | number | null; nom: string }) {
  if (valeur === null) {
    return (
      <mark className="rounded bg-negative/15 px-1.5 font-semibold text-negative">
        {MARQUEUR_TROU} — {nom}
      </mark>
    );
  }
  return <>{valeur}</>;
}
```

- [ ] **Étape 5 : les mentions légales**

Rédiger `MentionsLegales.tsx` avec `PageLegale` et `Champ`. Contenu exigé, dans cet ordre :

1. **Éditeur** — « Le présent site est édité par **BERTHE OUSMANE**, personne physique exerçant sous l'enseigne **GSM TECHNOLOGIE CYBER SHOP** », statut d'entreprenant, commune + `<Champ>` adresse précise, `<Champ>` déclaration d'activité, compte contribuable 4212842W, `<Champ>` téléphone, `contact@kolek.cash`.
2. **Directeur de la publication** — BERTHE OUSMANE.
3. **Hébergement** — Supabase (base de données, authentification et fonctions, région `eu-west-3`, **Paris, France**) ; Netlify (hébergement du site et des applications).
4. **Nature du service** — Kolek est un outil de tenue de collecte. « GTCS n'est pas un établissement financier, ne reçoit aucun dépôt, et **aucun flux d'épargne ne transite par la plateforme** » — reprend mot pour mot ce que le pied de page affirme déjà.
5. **Propriété intellectuelle** — le nom Kolek, la marque et le code appartiennent à l'exploitant.
6. **Renvoi** — vers `/conditions` et `/confidentialite`.

- [ ] **Étape 6 : les trois chemins, dans `liens.ts`**

Ajouter à `apps/site/src/vitrine/liens.ts`, et **remplacer** `CONTACT_DEMO` :

```ts
/** Les trois textes juridiques. Servis par la vitrine, hors de l'index. */
export const MENTIONS_LEGALES = '/mentions-legales';
export const CONDITIONS = '/conditions';
export const CONFIDENTIALITE = '/confidentialite';

/**
 * L'adresse de l'exploitant. Elle reste offerte en dernier recours, sous le
 * formulaire — pour qui préfère écrire — mais n'est plus jamais le geste
 * principal.
 *
 * Au domaine depuis le 2026-09-18 : l'adresse d'un service commercial qui
 * figure dans des mentions légales et sert à exercer un droit d'accès ne peut
 * pas être un compte personnel chez un fournisseur grand public.
 */
export const CONTACT_DEMO =
  'mailto:contact@kolek.cash?subject=Kolek%20-%20demande%20de%20démo';
```

- [ ] **Étape 7 : la route**

Dans `apps/site/src/App.tsx`, remplacer le corps de la fonction :

```tsx
export default function App() {
  const chemin = window.location.pathname.replace(/\/+$/, '');

  if (chemin === '/inscription') return <Inscription />;
  if (chemin === MENTIONS_LEGALES) return <MentionsLegales />;
  if (chemin === CONDITIONS) return <Conditions />;
  if (chemin === CONFIDENTIALITE) return <Confidentialite />;
  return <Vitrine />;
}
```

Les trois composants n'existent pas encore tous : **créer `Conditions.tsx` et `Confidentialite.tsx` comme squelettes** rendant `<PageLegale titre="…" miseAJour="2026-09-18" />` vide, pour que le fichier compile. Les tâches 2 et 3 les remplissent.

- [ ] **Étape 8 : les faire passer**

Run : `npm test -w @kolek/site -- --run src/vitrine/legal/MentionsLegales.test.tsx`
Attendu : 6 passed.

- [ ] **Étape 9 : toutes les épreuves du site, et le linteur**

```bash
npm test -w @kolek/site
npm run verifier:lint
```

Attendu : 48 passed (42 de référence + 6), exit 0 des deux.

- [ ] **Étape 10 : commit**

```bash
git add apps/site/src/vitrine/legal apps/site/src/App.tsx apps/site/src/vitrine/liens.ts
git commit -m "feat(legal): les mentions legales, et le socle des trois textes" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 2 : les conditions générales

**Fichiers :**
- Modifier : `apps/site/src/vitrine/legal/Conditions.tsx`
- Créer : `apps/site/src/vitrine/legal/Conditions.test.tsx`

**Interfaces consommées :** `IDENTITE`, `PageLegale`, `Champ` (tâche 1) ; `PALIERS` de `@kolek/core`.

- [ ] **Étape 1 : écrire l'épreuve qui tombe**

```tsx
// apps/site/src/vitrine/legal/Conditions.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PALIERS } from '@kolek/core';

import { Conditions } from './Conditions';

describe('conditions générales', () => {
  it('nomme les parties', () => {
    render(<Conditions />);
    expect(screen.getAllByText(/BERTHE OUSMANE/).length).toBeGreaterThan(0);
  });

  it('affiche les prix réels de chaque palier, sans en inventer', () => {
    render(<Conditions />);
    for (const palier of PALIERS) {
      const attendu = palier.prix === 0 ? /gratuit/i : new RegExp(String(palier.prix));
      expect(screen.getAllByText(attendu).length).toBeGreaterThan(0);
    }
  });

  it('impose au collecteur d’informer ses clients avant de les inscrire', () => {
    render(<Conditions />);
    // Article 28 : la personne doit pouvoir refuser de figurer au fichier.
    // Aucun écran ne le permet ; l'obligation passe donc par le contrat.
    expect(screen.getByText(/refuser de figurer/i)).toBeTruthy();
  });

  it('désigne le droit ivoirien', () => {
    render(<Conditions />);
    expect(screen.getByText(/droit ivoirien|Côte d’Ivoire/)).toBeTruthy();
  });

  it('ne promet aucune disponibilité chiffrée', () => {
    const { container } = render(<Conditions />);
    // Un « 99,9 % » qu'aucune mesure ne soutient est une promesse qu'on perd.
    expect(container.textContent).not.toMatch(/9[0-9],?[0-9]*\s*%/);
  });
});
```

- [ ] **Étape 2 : la faire tomber**

Run : `npm test -w @kolek/site -- --run src/vitrine/legal/Conditions.test.tsx`
Attendu : ÉCHEC — le squelette ne contient aucun de ces textes.

- [ ] **Étape 3 : rédiger**

Sections exigées, dans cet ordre :

1. **Objet et définitions** — *collecteur*, *client du collecteur*, *tournée*, *mise*, *carte*.
2. **Accès au service** — pas d'inscription libre ; les comptes sont ouverts par l'exploitant après un premier échange, ce que la vitrine dit déjà.
3. **Les formules et leurs prix** — lues depuis `PALIERS`, jamais recopiées : `PALIERS.map(...)`. Prix mensuels en FCFA, limite de clients, fonctions incluses.
4. **Durée, reconduction, paiement** — mensuel, par Chariow ; l'échéance figure sur le compte.
5. **Suspension pour impayé** — ce que le collecteur garde (ses données, sa file hors ligne) et ce qu'il perd (l'accès).
6. **Résiliation** — de part et d'autre, et le sort des données : voir `/confidentialite`.
7. **Disponibilité** — obligation de moyens. **Aucun pourcentage.**
8. **Obligations du collecteur** — et c'est la section qui porte le risque de l'article 28 :
   - informer chaque client, **avant de l'inscrire**, de l'identité de l'exploitant, des finalités, des catégories de données, des destinataires, de la durée de conservation, de son droit d'accès et de rectification, du transfert hors CEDEAO, et de **la possibilité de refuser de figurer au fichier** ;
   - ne pas inscrire un client qui refuse ;
   - n'inscrire que ce qui sert la collecte ;
   - répondre de l'usage qu'il fait de l'envoi d'avis par SMS.
9. **Propriété intellectuelle.**
10. **Responsabilité** — l'exploitant n'est pas dépositaire des fonds ; il ne garantit pas les sommes encaissées par le collecteur auprès de ses clients.
11. **Droit applicable et juridiction** — droit ivoirien, juridictions ivoiriennes.
12. **Modification des conditions** — préavis, et la date de mise à jour en tête de page.

- [ ] **Étape 4 : les faire passer**

Run : `npm test -w @kolek/site -- --run src/vitrine/legal/Conditions.test.tsx`
Attendu : 5 passed.

- [ ] **Étape 5 : commit**

```bash
git add apps/site/src/vitrine/legal/Conditions.tsx apps/site/src/vitrine/legal/Conditions.test.tsx
git commit -m "feat(legal): les conditions generales, et l obligation de l article 28" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 3 : la politique de confidentialité

**Fichiers :**
- Modifier : `apps/site/src/vitrine/legal/Confidentialite.tsx`
- Créer : `apps/site/src/vitrine/legal/Confidentialite.test.tsx`

- [ ] **Étape 1 : écrire l'épreuve qui tombe**

```tsx
// apps/site/src/vitrine/legal/Confidentialite.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Confidentialite } from './Confidentialite';

describe('politique de confidentialité', () => {
  it('assume le transfert hors CEDEAO, au lieu de le taire', () => {
    render(<Confidentialite />);
    expect(screen.getAllByText(/CEDEAO/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Paris/).length).toBeGreaterThan(0);
  });

  it('nomme chaque sous-traitant, un par un', () => {
    render(<Confidentialite />);
    for (const nom of ['Supabase', 'Netlify', 'Twilio', 'Resend', 'Chariow', 'Google']) {
      // Chaque nom parait au moins deux fois : dans la liste des
      // sous-traitants, et dans la section du transfert hors CEDEAO.
      expect(screen.getAllByText(new RegExp(nom)).length).toBeGreaterThan(0);
    }
  });

  it('dit anonymisation, jamais suppression totale', () => {
    const { container } = render(<Confidentialite />);
    expect(container.textContent).toMatch(/anonymis/i);
    expect(container.textContent).not.toMatch(/suppression totale|effacement total/i);
  });

  it('n’invoque pas l’intérêt légitime, qui n’existe pas en droit ivoirien', () => {
    const { container } = render(<Confidentialite />);
    expect(container.textContent).not.toMatch(/intérêt légitime/i);
  });

  it('cite la loi applicable et l’autorité', () => {
    render(<Confidentialite />);
    expect(screen.getAllByText(/2013-450/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ARTCI/).length).toBeGreaterThan(0);
  });

  it('dit franchement qu’aucun écran n’existe pour exercer ses droits', () => {
    render(<Confidentialite />);
    expect(screen.getAllByText(/contact@kolek\.cash/).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Étape 2 : la faire tomber**

Run : `npm test -w @kolek/site -- --run src/vitrine/legal/Confidentialite.test.tsx`
Attendu : ÉCHEC.

- [ ] **Étape 3 : rédiger, sur le plan de l'article 9**

1. **Qui est responsable** — BERTHE OUSMANE, seul responsable du traitement, y compris pour les données des clients du collecteur. Compte contribuable. Contact.
2. **Ce qui est collecté, et d'où ça vient** — compte collecteur (nom, téléphone, zone, courriel) ; clients du collecteur (nom, téléphone, marché, activité), **saisis par le collecteur** ; données de collecte (cartes, mises, retraits, caisses) ; demandes d'ouverture ; journal d'audit ; avis SMS envoyés.
3. **Pourquoi** — finalité par catégorie, une phrase chacune.
4. **Sur quel fondement** — le **consentement** au sens de la loi n° 2013-450 : « manifestation de volonté expresse, non équivoque, libre, spécifique et informée ». Pour les clients du collecteur, recueilli par le collecteur, que les CGU obligent. **Dire que la trace de ce consentement n'est pas conservée aujourd'hui**, et que c'est un chantier ouvert.
5. **Combien de temps** — le tableau du §5.3 de la spec, tel quel.
6. **Qui y accède** — le collecteur pour sa propre tournée (RLS), ses collaborateurs dans la limite de leurs droits, l'exploitant pour l'administration et le support.
7. **Les destinataires et sous-traitants** — Supabase (base, authentification, fonctions — Paris), Netlify (hébergement), Twilio (SMS), Resend (courriel), Chariow (paiement), Google (connexion facultative).
8. **Le transfert hors CEDEAO** — la loi définit *pays tiers* comme tout État non membre de la CEDEAO. La base est à Paris. Le transfert est **quotidien et structurel**, et il est assumé ici.
9. **Les droits, et comment les exercer** — information, accès, rectification, opposition, et **effacement par anonymisation** : le nom et le numéro sont remplacés par une mention neutre, les montants restent, parce que la loi comptable impose de les conserver. Demande à `contact@kolek.cash`, réponse sous `<Champ>` jours ouvrés. **Aucun écran n'existe encore : la demande se traite à la main, et la politique le dit.**
10. **La sécurité** — chiffrement en transit, cloisonnement par RLS, clé de service jamais exposée au navigateur, journal d'audit.
11. **L'autorité** — ARTCI. Dire qu'aucune autorisation n'a encore été délivrée, si tel est encore le cas à la publication.
12. **Modification** — date de mise à jour en tête.

- [ ] **Étape 4 : les faire passer**

Run : `npm test -w @kolek/site -- --run src/vitrine/legal/Confidentialite.test.tsx`
Attendu : 6 passed.

- [ ] **Étape 5 : commit**

```bash
git add apps/site/src/vitrine/legal/Confidentialite.tsx apps/site/src/vitrine/legal/Confidentialite.test.tsx
git commit -m "feat(legal): la politique de confidentialite, sur le plan de l article 9" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 4 : le pied de page, et la garde de source

**Fichiers :**
- Modifier : `apps/site/src/vitrine/PiedDePage.tsx`
- Créer : `apps/site/src/vitrine/PiedDePage.test.tsx`
- Créer : `scripts/verifier-mentions.mjs`
- Créer : `scripts/verifier-mentions.test.mjs`
- Modifier : `package.json` (script `verifier:mentions`, et l'ajouter à `verifier`)

- [ ] **Étape 1 : écrire les épreuves qui tombent**

```tsx
// apps/site/src/vitrine/PiedDePage.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PiedDePage } from './PiedDePage';

describe('pied de page', () => {
  it('porte les trois textes juridiques', () => {
    render(<PiedDePage />);
    expect(screen.getByRole('link', { name: 'Mentions légales' }).getAttribute('href'))
      .toBe('/mentions-legales');
    expect(screen.getByRole('link', { name: 'Conditions générales' }).getAttribute('href'))
      .toBe('/conditions');
    expect(screen.getByRole('link', { name: 'Confidentialité' }).getAttribute('href'))
      .toBe('/confidentialite');
  });

  it('n’expose plus d’adresse personnelle', () => {
    const { container } = render(<PiedDePage />);
    expect(container.innerHTML).not.toMatch(/gmail\.com/);
  });
});
```

- [ ] **Étape 2 : la faire tomber**

Run : `npm test -w @kolek/site -- --run src/vitrine/PiedDePage.test.tsx`
Attendu : ÉCHEC — `Unable to find an accessible element with the role "link" and name "Mentions légales"`.

- [ ] **Étape 3 : la colonne « Légal »**

Dans `PiedDePage.tsx`, importer les trois chemins et ajouter une colonne à `COLONNES` :

```ts
  {
    titre: 'Légal',
    liens: [
      { href: MENTIONS_LEGALES, libelle: 'Mentions légales' },
      { href: CONDITIONS, libelle: 'Conditions générales' },
      { href: CONFIDENTIALITE, libelle: 'Confidentialité' },
    ],
  },
```

Et la grille passe de `md:grid-cols-3` à `md:grid-cols-2 lg:grid-cols-4` : le bloc du logo plus trois colonnes font quatre éléments, et trois colonnes en laisseraient un orphelin sur une ligne.

- [ ] **Étape 4 : la garde de source**

```js
// scripts/verifier-mentions.mjs
/**
 * Deux fautes que seule une lecture des sources attrape.
 *
 * 1. L'ancienne adresse personnelle qui reparaît — par un copier-coller, ou
 *    par une branche qui n'avait pas la correction.
 * 2. Un numéro ARTCI cité alors qu'aucune autorisation n'a été délivrée. Une
 *    fausse mention dans un texte juridique est pire que son absence.
 *
 * Le marqueur des trous, lui, n'est PAS une faute au sens de cette garde : il
 * est là pour être vu. C'est l'exploitant qui décide quand publier, pas ce
 * script. Il les compte et les nomme, sans échouer.
 */
import { globSync, readFileSync } from 'node:fs';

// Deux motifs plutot qu'une expansion d'accolades : `fs.globSync` ne la
// garantit pas, et un motif qui ne correspond a rien rend une liste vide —
// donc une garde qui passe sans rien avoir lu. Le compte est verifie plus bas.
const sources = [
  ...globSync('apps/**/*.ts'),
  ...globSync('apps/**/*.tsx'),
  ...globSync('packages/**/*.ts'),
  ...globSync('packages/**/*.tsx'),
].filter((p) => !p.includes('node_modules') && !p.includes('dist'));

// Temoin : une garde qui ne lit aucun fichier passerait toujours.
if (sources.length < 100) {
  console.error(`Seulement ${sources.length} sources lues : le motif est casse.`);
  process.exit(1);
}

const fautes = [];
for (const fichier of sources) {
  const texte = readFileSync(fichier, 'utf8');
  if (/gsmtechnoloy@gmail\.com/.test(texte)) {
    fautes.push(`${fichier} : adresse personnelle, remplacer par contact@kolek.cash`);
  }
  if (/ARTCI\s*n[°o]\s*\d/i.test(texte)) {
    fautes.push(`${fichier} : cite un numéro ARTCI, or aucune autorisation n'existe`);
  }
}

if (fautes.length > 0) {
  console.error(fautes.join('\n'));
  process.exit(1);
}
console.log(`Les ${sources.length} sources ne citent ni adresse personnelle ni numéro ARTCI.`);
```

Épreuves du script, dans `scripts/verifier-mentions.test.mjs` : un texte contenant l'ancienne adresse est refusé ; un texte citant « ARTCI n° 12345 » est refusé ; un texte portant le marqueur `À COMPLÉTER` est **accepté**.

- [ ] **Étape 5 : brancher la garde**

Dans `package.json` : ajouter `"verifier:mentions": "node scripts/verifier-mentions.mjs"`, et l'insérer dans la chaîne `verifier` **avant** `verifier:lint`.

- [ ] **Étape 6 : les faire passer**

```bash
npm test -w @kolek/site -- --run src/vitrine/PiedDePage.test.tsx
npm run verifier:mentions
npm run test:scripts
```

Attendu : 2 passed ; la garde exit 0 ; les épreuves de scripts montent de 3.

- [ ] **Étape 7 : commit**

```bash
git add apps/site/src/vitrine/PiedDePage.tsx apps/site/src/vitrine/PiedDePage.test.tsx scripts/verifier-mentions.mjs scripts/verifier-mentions.test.mjs package.json
git commit -m "feat(legal): le pied de page porte les trois textes, et une garde les protege" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 5 : l'acceptation avant paiement

**Fichiers :**
- Modifier : `apps/site/src/vitrine/Inscription.tsx`
- Modifier : `apps/site/src/vitrine/Inscription.test.tsx`

- [ ] **Étape 1 : écrire les épreuves qui tombent**

```tsx
// à ajouter dans apps/site/src/vitrine/Inscription.test.tsx
it('refuse l’envoi tant que les conditions ne sont pas acceptées', async () => {
  render(<Inscription />);
  remplirLeFormulaire(); // l'aide déjà présente dans ce fichier
  fireEvent.click(screen.getByRole('button', { name: /Payer|Envoyer ma demande/ }));
  expect(await screen.findByText(/accepter les conditions/i)).toBeTruthy();
  expect(envoyerDemande).not.toHaveBeenCalled();
});

it('n’est jamais pré-cochée', () => {
  render(<Inscription />);
  const case_ = screen.getByRole('checkbox', { name: /conditions/i });
  expect((case_ as HTMLInputElement).checked).toBe(false);
});

it('mène aux deux textes, sans quitter le formulaire rempli', () => {
  render(<Inscription />);
  const lien = screen.getByRole('link', { name: /conditions générales/i });
  expect(lien.getAttribute('target')).toBe('_blank');
  expect(lien.getAttribute('href')).toBe('/conditions');
});
```

- [ ] **Étape 2 : les faire tomber**

Run : `npm test -w @kolek/site -- --run src/vitrine/Inscription.test.tsx`
Attendu : ÉCHEC sur les trois — aucune case n'existe.

- [ ] **Étape 3 : la case**

Ajouter l'état `const [accepte, setAccepte] = useState(false);` près des autres (ligne ~91), et dans `soumettre`, **avant** `setEnvoi(true)** :

```tsx
    if (!accepte) {
      setErreur('Tu dois accepter les conditions générales et la politique de confidentialité.');
      return;
    }
```

Et, **au-dessus du bouton** (ligne ~404), une case non pré-cochée, dont les deux liens s'ouvrent dans un onglet neuf — un formulaire à moitié rempli ne doit pas être perdu pour avoir lu ce qu'on signe :

```tsx
              <label className="mb-4 flex items-start gap-2.5 font-body text-sm">
                <input
                  type="checkbox"
                  checked={accepte}
                  onChange={(e) => setAccepte(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span>
                  J’ai lu et j’accepte les{' '}
                  <a href={CONDITIONS} target="_blank" rel="noreferrer"
                     className="font-semibold underline underline-offset-2">
                    conditions générales
                  </a>{' '}
                  et la{' '}
                  <a href={CONFIDENTIALITE} target="_blank" rel="noreferrer"
                     className="font-semibold underline underline-offset-2">
                    politique de confidentialité
                  </a>.
                </span>
              </label>
```

Le bouton **n'est pas désactivé** tant que la case n'est pas cochée : un bouton grisé sans explication laisse le visiteur chercher pourquoi. Il part, et le message dit quoi faire.

- [ ] **Étape 4 : les faire passer**

Run : `npm test -w @kolek/site -- --run src/vitrine/Inscription.test.tsx`
Attendu : toutes vertes, dont les trois nouvelles.

- [ ] **Étape 5 : commit**

```bash
git add apps/site/src/vitrine/Inscription.tsx apps/site/src/vitrine/Inscription.test.tsx
git commit -m "feat(legal): on n ouvre plus un compte sans avoir accepte les conditions" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 6 : un vrai 404

**Le défaut :** `netlify.toml` réécrit `/*` vers `/index.html` en **200**. Toute adresse inconnue rend donc une page d'accueil avec un statut « tout va bien ». C'est le point A.3 de l'audit du 2026-09-04, ouvert depuis.

**Fichiers :**
- Créer : `apps/site/public/404.html`
- Modifier : `apps/site/netlify.toml`

- [ ] **Étape 1 : la page**

`apps/site/public/404.html` — page statique autonome, sans JavaScript, qui reprend les couleurs du site, dit « Cette page n'existe pas » et renvoie vers `/`. Vite copie `public/` dans `dist` sans transformation.

- [ ] **Étape 2 : nommer les routes au lieu du joker**

Dans `netlify.toml`, **remplacer** la règle `/*` par les routes réelles, en gardant la redirection de l'ancienne adresse **avant** elles :

```toml
[[redirects]]
  from = "/inscription"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "/mentions-legales"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "/conditions"
  to = "/index.html"
  status = 200

[[redirects]]
  from = "/confidentialite"
  to = "/index.html"
  status = 200
```

Sans joker, Netlify sert `404.html` avec un **statut 404** sur tout le reste. Commenter la raison dans le fichier, comme le reste de ce `netlify.toml` le fait : une route ajoutée à `App.tsx` sans sa règle ici rendrait un 404 en production alors qu'elle marche en développement.

- [ ] **Étape 3 : vérifier après déploiement** *(accord)*

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://kolek.cash/adresse-qui-n-existe-pas
curl -s -o /dev/null -w "%{http_code}\n" https://kolek.cash/confidentialite
```

Attendu : **404** puis **200**. Le contenu affiché ne prouve rien — c'est le statut qui compte.

- [ ] **Étape 4 : commit**

```bash
git add apps/site/public/404.html apps/site/netlify.toml
git commit -m "fix(site): l inconnu rend un vrai 404, au lieu d un 200 qui ment" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Tâche 7 : vérifier, puis livrer sur accord

**Aucun geste de cette tâche ne se fait sans un accord explicite de l'exploitant, demandé pour ce geste-là.**

- [ ] **Étape 1 : la vérification complète**

```bash
npm run verifier > verification.log 2>&1; echo "EXIT=$?"
```

**Ne jamais faire passer cette commande dans un tuyau** : le code de sortie serait celui du dernier maillon. Rediriger, puis lire le fichier.

- [ ] **Étape 2 : contrôler le périmètre**

```bash
git diff --stat main...HEAD -- supabase
git diff --name-only main...HEAD
```

Attendu : la première ne rend **rien**. La seconde ne liste que `apps/site`, `scripts`, `package.json` et `Docs/`.

- [ ] **Étape 3 : regarder les trois pages** *(accord)*

À 400 px de large et en pleine largeur. Contrôler que **chaque trou non comblé se voit** — le marqueur rouge doit sauter aux yeux, c'est sa seule raison d'être.

- [ ] **Étape 4 : les cinq trous** *(accord de l'exploitant, sur pièces)*

Rien ne part en ligne avant que `identite.ts` porte : l'adresse précise, le numéro de déclaration d'activité (ou la confirmation qu'il n'y en a pas encore), le téléphone professionnel, le délai de réponse — et avant que la boîte `contact@kolek.cash` ait reçu un message d'essai.

- [ ] **Étape 5 : livrer** *(accord)*

Pousser la branche, ouvrir une pull request vers `main`. Le travail `Base` de la CI couvre `test:db`, que le poste refuse. Le classificateur bloque `merge` sur `main` : la fusion revient à l'exploitant.

- [ ] **Étape 6 : consigner**

Au registre du chantier : les commits, les épreuves ajoutées, les trous encore ouverts, et la date à laquelle un avocat aura relu.

---

## Ce que ce plan ne fait pas, et qui reste dû

- **Le dossier d'autorisation ARTCI** (article 7) — document séparé, à porter par un avocat. Cette spec en contient toute la matière.
- **L'écran d'exercice des droits** — chantier suivant. La politique annonce la voie du courriel, et le dit franchement.
- **La suppression de `clients.photo_url`** — migration dédiée, après contrôle du nombre de lignes non nulles en production.
- **La trace du consentement des clients du collecteur** — le manque le plus exposé du dossier. Les CGU le reportent sur le collecteur ; seul un geste dans le produit le réglera.
