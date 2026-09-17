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
