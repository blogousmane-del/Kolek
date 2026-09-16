// Écrit supabase/retour/mouvements-registre.sql : les définitions d'avant,
// recopiées mot pour mot depuis les migrations qui les portent.
// Usage, depuis la racine : node "supabase/releves/construire-retour.mjs"
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const MIGRATIONS = 'supabase/migrations/';

function extraire(fichier, debut, fin) {
  const lignes = readFileSync(MIGRATIONS + fichier, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const debuts = lignes.filter((l) => l.startsWith(debut)).length;
  if (debuts !== 1) throw new Error(`${fichier} : ${debuts} début(s) « ${debut} », 1 attendu.`);
  const i = lignes.findIndex((l) => l.startsWith(debut));
  const j = lignes.findIndex((l, k) => k >= i && l.startsWith(fin));
  if (j < 0) throw new Error(`${fichier} : fin « ${fin} » introuvable.`);
  return lignes.slice(i, j + 1).join('\n');
}

const morceaux = [
  ['20260902120000_encaisse_par.sql',
   'create or replace function public.cash_attendu_du_jour',
   'revoke all on function public.cash_attendu_du_jour'],
  ['20260902150000_admin_voit_le_rattachement.sql',
   'CREATE OR REPLACE FUNCTION public.admin_vue_globale',
   '$function$;'],
  ['20260911210000_admin_tendances.sql',
   'create or replace function public.admin_tendances',
   'grant execute on function public.admin_tendances'],
  ['20260902130000_equipe_vue.sql',
   'create or replace function public.equipe_vue',
   'grant execute on function public.equipe_vue'],
].map(([fichier, debut, fin]) => extraire(fichier, debut, fin));

const entete = `-- Retour arrière du registre des mouvements.
--
-- Les quatre fonctions de lecture, telles qu'elles étaient avant le chantier du
-- 2026-09-15, recopiées mot pour mot depuis les migrations qui les portent —
-- 20260902120000, 20260902150000, 20260911210000, 20260902130000 — par
-- \`construire-retour.mjs\`.
--
-- Ce fichier n'est PAS une migration : il n'est pas dans supabase/migrations et
-- ne part donc jamais tout seul. En cas de retour, le copier sous
-- supabase/migrations/<horodatage>_mouvements_registre_retour.sql et le pousser
-- sur accord explicite de l'exploitant, pour que l'historique des migrations
-- reste vrai.
--
-- La table et la vue restent : vides et lues par personne, elles ne coûtent
-- rien. Le déclencheur de caisse des rattrapages, lui, part avec les fonctions.

`;

const pied = `

drop trigger if exists rattrapages_rafraichir_caisse on public.rattrapages;
drop function if exists public.caisses_rafraichir_apres_rattrapage();
`;

mkdirSync('supabase/retour', { recursive: true });
writeFileSync('supabase/retour/mouvements-registre.sql', entete + morceaux.join('\n\n') + pied);
console.log('supabase/retour/mouvements-registre.sql écrit.');
