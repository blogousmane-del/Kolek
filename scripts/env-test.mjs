import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const statut = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }));

mkdirSync('supabase/tests', { recursive: true });
writeFileSync(
  'supabase/tests/.env.test',
  [
    `SUPABASE_URL=${statut.API_URL}`,
    `SUPABASE_ANON_KEY=${statut.ANON_KEY}`,
    `SUPABASE_SERVICE_ROLE_KEY=${statut.SERVICE_ROLE_KEY}`,
    '',
  ].join('\n'),
);

console.log('supabase/tests/.env.test écrit');
