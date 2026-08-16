import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chercherFuites } from './verifier-bundles.mjs';

function dossierAvec(contenu) {
  const base = mkdtempSync(join(tmpdir(), 'kolek-'));
  mkdirSync(join(base, 'assets'), { recursive: true });
  writeFileSync(join(base, 'assets', 'index-abc.js'), contenu);
  return base;
}

describe('chercherFuites', () => {
  it('détecte une clé de service dans un artefact', () => {
    const dir = dossierAvec('const k = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x";');
    expect(chercherFuites(dir)).toHaveLength(1);
  });

  it('détecte le libellé service_role en clair', () => {
    const dir = dossierAvec('const role = "service_role";');
    expect(chercherFuites(dir)).toHaveLength(1);
  });

  it('détecte une clé secrète au format actuel', () => {
    const dir = dossierAvec('const k = "sb_secret_AbCdEf123456";');
    expect(chercherFuites(dir)).toHaveLength(1);
  });

  it('laisse passer un artefact propre', () => {
    const dir = dossierAvec('const k = import.meta.env.VITE_SUPABASE_ANON_KEY;');
    expect(chercherFuites(dir)).toHaveLength(0);
  });
});
