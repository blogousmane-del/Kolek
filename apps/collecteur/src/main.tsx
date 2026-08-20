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
import { surveillerMisesAJour } from './maj-service-worker';

// Les fontes viennent de paquets npm, pas de Google Fonts : la CSP interdit
// `font-src` distant, et un collecteur en 3G ne doit pas attendre un serveur
// tiers pour lire un montant.

// Avant le rendu : le remplaçement du service worker peut survenir dès les
// premières secondes, et l'écouteur doit être en place quand il arrive.
surveillerMisesAJour();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Filet
      message="Rien n’est perdu : les mises déjà enregistrées sur ce téléphone restent en attente de synchronisation. Recharge l’écran."
    >
      <App />
    </Filet>
  </StrictMode>,
);
