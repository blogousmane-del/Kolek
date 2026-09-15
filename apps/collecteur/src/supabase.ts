import { createClient } from '@supabase/supabase-js';

import { OPTIONS_DONNEES } from './delai-requete';
import { cleSessionPour } from './session-gardee';

const url = import.meta.env.VITE_SUPABASE_URL;
const cle = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !cle) {
  throw new Error('Configuration Supabase absente. Copier .env.example vers .env.');
}

/**
 * La clé sous laquelle la session est gardée, exportée pour que `App.tsx` lise
 * la même sans la recalculer ailleurs. Sa valeur est celle que supabase-js
 * prenait déjà par défaut — `session-gardee.test.ts` le vérifie — donc aucune
 * session ouverte n'est perdue au déploiement.
 */
export const CLE_SESSION = cleSessionPour(url);

/** `OPTIONS_DONNEES` : une requête de données sans réponse est coupée à trente secondes (`delai-requete.ts`). */
export const supabase = createClient(url, cle, {
  auth: { storageKey: CLE_SESSION },
  db: OPTIONS_DONNEES,
});
