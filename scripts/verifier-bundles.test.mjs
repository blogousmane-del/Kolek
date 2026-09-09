import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chercherCopiesDEnv, chercherFuites, chercherFuitesTexte } from './verifier-bundles.mjs';

function dossierAvec(contenu) {
  const base = mkdtempSync(join(tmpdir(), 'kolek-'));
  mkdirSync(join(base, 'assets'), { recursive: true });
  writeFileSync(join(base, 'assets', 'index-abc.js'), contenu);
  return base;
}

/** Une arborescence entière, chemin relatif → contenu. */
function arborescenceAvec(fichiers) {
  const base = mkdtempSync(join(tmpdir(), 'kolek-'));
  for (const [relatif, contenu] of Object.entries(fichiers)) {
    const chemin = join(base, relatif);
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, contenu);
  }
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

describe('motifs Chariow', () => {
  // La forme du jeton Chariow n'est pas documentée : on ne peut pas la
  // chercher. Ce qui se cherche, c'est l'**usage** qui la ferait fuir.

  it('signale un appel direct à Chariow depuis un artefact', () => {
    // Le front ne parle jamais à Chariow : il appelle une Edge Function, qui
    // détient la clé. Une adresse `api.chariow.com` dans un paquet signifie
    // qu'un appel est parti du navigateur — donc que la clé a suivi, ou est sur
    // le point de suivre.
    expect(chercherFuitesTexte('fetch("https://api.chariow.com/v1/checkout")')).toContain(
      'appel direct à Chariow',
    );
  });

  it('signale le nom de la variable de clé Chariow', () => {
    expect(chercherFuitesTexte('const k = import.meta.env.VITE_CHARIOW_CLE_API')).toContain(
      'clé Chariow exposée',
    );
  });

  it('signale le préfixe public des autres outils de construction', () => {
    // Un jour quelqu'un portera un écran sous Next : le motif ne doit pas
    // s'arrêter au préfixe de Vite.
    expect(chercherFuitesTexte('NEXT_PUBLIC_CHARIOW_TOKEN')).toContain('clé Chariow exposée');
    expect(chercherFuitesTexte('REACT_APP_CHARIOW_TOKEN')).toContain('clé Chariow exposée');
  });

  it('laisse passer un artefact ordinaire', () => {
    expect(chercherFuitesTexte('const url = "https://exemple.supabase.co"')).toEqual([]);
  });

  it('ne vise que l’hôte d’API, pas le nom du fournisseur', () => {
    // Le motif nomme `api.chariow.com` et pas `chariow`. La page de paiement
    // hébergée, dont l'adresse vient de la réponse `checkout_url`, se trouve
    // sur un autre hôte que la documentation ne fixe pas — un motif sur le seul
    // nom du fournisseur refuserait un jour le seul chemin de paiement prévu.
    expect(chercherFuitesTexte('const marque = "Chariow"')).toEqual([]);
  });
});

/**
 * Les copies de fichiers d'environnement.
 *
 * `apps/admin/.env.prod.bak` a traîné du 2026-09-02 au 2026-09-09, demandé à la
 * suppression par trois audits successifs. Il ne portait que deux valeurs
 * publiques — vérifié à chaque passage — et c'est justement pourquoi il est
 * resté : chacun le trouvait inoffensif, et personne ne le supprimait.
 *
 * Ce que le contrôle vise n'est pas ce fichier-là, c'est le geste. Un
 * `cp .env .env.bak` avant une manipulation est un réflexe ordinaire ; le
 * fichier survit à la manipulation, change de machine avec le dossier, et le
 * jour où quelqu'un fait le même geste sur un `.env` qui porte une clé de
 * service, plus rien ne le distingue du premier.
 *
 * Ce contrôle ne tourne utilement qu'en local : `.gitignore` couvre `.env.*`,
 * donc le CI part d'un clone qui n'en a jamais. C'est cohérent — la copie naît
 * sur un poste, elle doit mourir sur ce poste.
 */
describe('copies de fichiers d’environnement', () => {
  it('signale une sauvegarde de .env', () => {
    const dossier = arborescenceAvec({ 'apps/admin/.env.prod.bak': 'VITE_SUPABASE_URL=https://x' });

    expect(chercherCopiesDEnv(dossier)).toEqual(['apps/admin/.env.prod.bak']);
  });

  it('reconnaît les autres formes du même geste', () => {
    const dossier = arborescenceAvec({
      '.env.old': 'x',
      '.env.save': 'x',
      '.env.production.copie': 'x',
      'apps/site/.env~': 'x',
    });

    expect(chercherCopiesDEnv(dossier).sort()).toEqual([
      '.env.old',
      '.env.production.copie',
      '.env.save',
      'apps/site/.env~',
    ]);
  });

  it('laisse tranquilles les fichiers légitimes', () => {
    // `.env` et `.env.production` sont les fichiers de travail ;
    // `.env.example` est versionné exprès. Un contrôle qui crierait sur eux
    // serait désarmé le jour même.
    const dossier = arborescenceAvec({
      'apps/admin/.env': 'x',
      'apps/admin/.env.example': 'x',
      'apps/admin/.env.production': 'x',
      'supabase/functions/.env': 'x',
    });

    expect(chercherCopiesDEnv(dossier)).toEqual([]);
  });
});
