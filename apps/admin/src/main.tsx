import { genererCssTokens } from '@kolek/core';
import '@kolek/core/base.css';
import './styles.css';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const feuille = document.createElement('style');
feuille.textContent = genererCssTokens();
document.head.prepend(feuille);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
