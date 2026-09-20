import type { ComponentType } from 'react';

import { Inscription } from './vitrine/Inscription';
import { Vitrine } from './vitrine/Vitrine';
import { Confidentialite } from './vitrine/legal/Confidentialite';
import { Conditions } from './vitrine/legal/Conditions';
import { MentionsLegales } from './vitrine/legal/MentionsLegales';
import { CONDITIONS, CONFIDENTIALITE, INSCRIPTION, MENTIONS_LEGALES } from './vitrine/liens';

/**
 * Le routage du site public.
 *
 * Cinq destinations, donc pas de bibliothèque de routage : `react-router`
 * pèserait une quinzaine de kilo-octets pour remplacer les quelques lignes
 * ci-dessous, sur une page dont le poids est déjà un constat d'audit ouvert.
 *
 * Les pages ne se répondent que par des liens ordinaires — un `<a href>` qui
 * recharge — et c'est suffisant ici : on ne passe du formulaire à la vitrine
 * qu'une fois, et le rechargement remet la page à zéro, ce qui est exactement
 * ce qu'on veut après un envoi.
 *
 * ## Pourquoi le chemin est une propriété
 *
 * Il était lu dans `window.location.pathname` pendant le rendu. C'est ce qui
 * rendait le prérendu impossible : `scripts/prerendre.mjs` rend ces pages dans
 * Node, où il n'y a pas de `window`, et les cinq routes seraient sorties
 * identiques. Le repli sur le navigateur reste — c'est le chemin que prend
 * `main.tsx`, qui ne passe rien.
 *
 * La liste des chemins servis est `vitrine/routes.ts`. Elle n'est pas importée
 * ici : ce module-ci associe un chemin à un composant React, celui-là décrit
 * des fichiers et des balises et se fait lire par Node, qui n'a que faire de
 * React. Ce qui lie les deux est une épreuve — `App.test.tsx` vérifie qu'aucune
 * route de la table ne tombe en silence sur la vitrine.
 */
const PAGES: Record<string, ComponentType> = {
  [INSCRIPTION]: Inscription,
  [MENTIONS_LEGALES]: MentionsLegales,
  [CONDITIONS]: Conditions,
  [CONFIDENTIALITE]: Confidentialite,
};

export default function App({ chemin }: { chemin?: string }) {
  const brut = chemin ?? (typeof window === 'undefined' ? null : window.location.pathname);

  /*
    Sans `window` et sans propriété, il n'y a pas de repli honnête.

    Se rabattre sur la racine serait pire que d'échouer : le prérendu écrirait
    cinq fichiers portant chacun sa bonne balise canonique et, dessous, le
    **même** contenu de vitrine. La garde des 200 mots passerait, les
    canoniques seraient bien distinctes, et le défaut qu'on est en train de
    corriger reviendrait sous une forme qu'aucun contrôle n'attrape.
  */
  if (brut === null) {
    throw new Error(
      'App rendu sans chemin et hors navigateur. Le prérendu doit passer `chemin`.',
    );
  }

  // La barre oblique finale est retirée avant la recherche : Netlify normalise
  // déjà `/conditions/` en `/conditions` côté serveur, mais un lien collé à la
  // main arrive tel quel dans le navigateur.
  const normalise = brut.replace(/\/+$/, '') || '/';
  const Page = PAGES[normalise];

  return Page ? <Page /> : <Vitrine />;
}
