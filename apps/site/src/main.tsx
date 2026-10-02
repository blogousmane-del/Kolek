// Les deux familles du produit, en variable et en `wght` seul.
//
// Deux fichiers au lieu de cinq, et une graisse continue au lieu de quatre
// crans. La feuille déclare un `unicode-range` par sous-ensemble : le
// navigateur ne télécharge le latin étendu et le vietnamien que si la page en
// affiche un signe, ce qu'elle ne fait jamais ici.
//
// Les jeux `opsz` et `wdth` de Bricolage ne sont pas pris : leur fichier pèse
// 131 ko à lui seul. Le pourquoi du choix est dans `packages/core/src/tokens.ts`,
// avec les mesures.
import '@fontsource-variable/bricolage-grotesque/wght.css';
import '@fontsource-variable/instrument-sans/wght.css';
// La voix dramatique de la vitrine et la voix des données (monospace). En
// paquets npm comme les autres : la CSP interdit `font-src` distant, et c'est
// tant mieux — aucun appel tiers avant le premier octet.
//
// Bodoni Moda a remplacé Instrument Serif le 2026-09-02. Ce n'est pas un
// changement de goût : un Didone gravé est la typographie des coupures de
// banque, c'est-à-dire du sujet que le hero met en scène — rosace guillochée,
// valeur faciale, bande de sécurité. Instrument Serif n'était là que pour
// « faire premium », ce que n'importe quelle page peut dire.
//
// Un seul fichier : le régulier italique. Une graisse lourde en Didone épaissit
// les pleins et écrase les déliés — la police perd exactement ce pour quoi on
// la prend.
import '@fontsource/bodoni-moda/400-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import './styles.css';

import { Filet } from '@kolek/ui';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

import App from './App';

// Les fontes viennent de paquets npm, pas de Google Fonts : la CSP interdit
// `font-src` distant. La maquette Banani importait la feuille Google ; sur une
// page de vente ce serait aussi un appel tiers avant le premier octet utile.

const racine = document.getElementById('root')!;

const arbre = (
  <StrictMode>
    <Filet message="Une erreur a interrompu l’affichage de la page. Recharge : rien n’a été envoyé.">
      <App />
    </Filet>
  </StrictMode>
);

/*
  Hydrater ce qui a été prérendu, construire le reste.

  `scripts/prerendre.mjs` écrit le contenu de quatre routes directement dans le
  HTML servi, et marque leur `#root` d'un `data-prerendu`. Sur celles-là,
  `hydrateRoot` reprend le balisage existant : le texte est déjà peint quand
  React arrive, et il n'est pas repeint.

  `createRoot` reste pour les autres — aujourd'hui `/inscription`, dont le
  contenu dépend de la chaîne de requête et qui sert donc l'écran d'attente.
  L'hydrater reviendrait à demander à React de reconnaître un formulaire dans
  une barre de chargement : divergence signalée, arbre reconstruit, à chaque
  visite.

  Le marqueur est lu, et non deviné. Chercher si `#root` a des enfants ne
  distinguerait pas une page prérendue de l'écran d'attente, qui en a aussi.
*/
if (racine.hasAttribute('data-prerendu')) {
  hydrateRoot(racine, arbre);
} else {
  createRoot(racine).render(arbre);
}
