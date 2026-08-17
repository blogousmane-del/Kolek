import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/sora/700.css';
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
