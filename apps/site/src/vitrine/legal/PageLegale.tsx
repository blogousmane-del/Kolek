import type { ReactNode } from 'react';

import { MARQUEUR_TROU } from './identite';

/**
 * L'enveloppe des trois textes juridiques.
 *
 * Elle ne décore pas : elle donne un titre, une date de mise à jour — qu'un
 * lecteur cherche avant tout le reste — et un retour vers la vitrine. La
 * mesure de ligne est bornée : un texte juridique se lit mal en pleine
 * largeur d'écran.
 *
 * `bg-canvas` est posé ici et non laissé implicite : le fond du `<body>`
 * (`apps/site/src/styles.css`) est `--color-dark-canvas`, choisi pour
 * l'ouverture et la fermeture sombres de la vitrine commerciale. Sans un fond
 * clair propre à cette enveloppe, le texte — couleur `--color-ink`, posée par
 * `packages/core/src/base.css` — se lirait presque noir sur presque noir.
 *
 * `children` est optionnel : les squelettes `Conditions` et `Confidentialite`
 * de la tâche 1 s'écrivent en balise auto-fermante, avant que les tâches 2 et
 * 3 leur donnent un contenu.
 */
export function PageLegale({
  titre,
  miseAJour,
  children,
}: {
  titre: string;
  /** Date ISO, affichée telle quelle : une date localisée se discute. */
  miseAJour: string;
  children?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <a
          href="/"
          className="font-body text-sm text-primary underline underline-offset-2"
        >
          ← Retour à l’accueil
        </a>
        <h1 className="mt-6 font-headings text-3xl font-bold text-ink sm:text-4xl">{titre}</h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Dernière mise à jour : {miseAJour}
        </p>
        <div className="mt-8 flex flex-col gap-6 font-body text-base leading-relaxed text-ink">
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * Le titre d'une section, sur les trois pages légales.
 *
 * `className="font-headings text-xl font-bold text-ink"` était recopié sur
 * chaque `<h2>` de `Conditions.tsx` et de `MentionsLegales.tsx` — douze fois
 * plus six. Un habillage recopié douze fois se corrige douze fois ; un
 * habillage exporté se corrige une fois.
 */
export function TitreSection({ children }: { children: ReactNode }) {
  return <h2 className="font-headings text-xl font-bold text-ink">{children}</h2>;
}

/**
 * Un fait, ou la marque de son absence.
 *
 * Un trou rendu en blanc passerait en production sans qu'on le voie. Rendu en
 * pastille colorée avec le marqueur en toutes lettres, il arrête l'œil du
 * premier lecteur venu — y compris celui de l'exploitant qui relit sa propre
 * page.
 *
 * `bg-negative-tint text-negative` reprend l'habillage déjà employé par
 * `BadgeStatut` et `CarteStat` pour un état négatif sur fond clair (4,8:1 de
 * contraste) — pas `bg-negative/15 text-negative-tint`, qui n'est employé
 * dans ce dépôt que sur les fonds sombres du formulaire d'ouverture et de
 * l'écran de connexion, et y tomberait sous le seuil AA sur `bg-canvas`.
 */
export function Champ({ valeur, nom }: { valeur: string | number | null; nom: string }) {
  if (valeur === null) {
    return (
      <mark className="rounded-pill bg-negative-tint px-2 py-0.5 font-body text-sm font-semibold text-negative">
        {MARQUEUR_TROU} : {nom}
      </mark>
    );
  }
  return <>{valeur}</>;
}
