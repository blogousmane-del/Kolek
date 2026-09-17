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
      message="Rien n’est perdu : ce qui est enregistré sur ce téléphone y reste jusqu’à son envoi. Recharge l’écran."
    >
      <App />
    </Filet>
  </StrictMode>,
);
