import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/sora/latin-700.css';
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Filet } from '@kolek/ui';

import App from './App';

// Les fontes viennent de paquets npm, pas de Google Fonts : la CSP interdit
// `font-src` distant.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Filet
      message="Aucune écriture n’a été faite. Recharge la page ; si l’écran retombe, préviens l’équipe technique."
    >
      <App />
    </Filet>
  </StrictMode>,
);
