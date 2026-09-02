import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/sora/700.css';
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
import { createRoot } from 'react-dom/client';

import App from './App';

// Les fontes viennent de paquets npm, pas de Google Fonts : la CSP interdit
// `font-src` distant. La maquette Banani importait la feuille Google ; sur une
// page de vente ce serait aussi un appel tiers avant le premier octet utile.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Filet message="Une erreur a interrompu l’affichage de la page. Recharge : rien n’a été envoyé.">
      <App />
    </Filet>
  </StrictMode>,
);
