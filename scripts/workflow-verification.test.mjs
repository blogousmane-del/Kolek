import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * La garde de `.github/workflows/verification.yml` : ce que ses jobs de `main`
 * doivent garder pour ne laisser aucune poussée hors de leur plage.
 *
 * Le défaut est revenu deux fois sous deux formes. Le 2026-09-09, le
 * déploiement des Edge Functions ne regardait que le dernier commit d'une
 * poussée de dix-sept. Le 2026-10-02, il regardait toute la poussée, mais pas
 * celle d'avant quand son run avait été annulé ; et le rappel des migrations
 * regardait encore le dernier commit seul. Aucune épreuve ne lisait ce
 * fichier : chaque fois, le défaut ne s'est vu qu'en le cherchant.
 *
 * Le fichier est lu comme du texte. Le dépôt n'embarque pas d'analyseur YAML,
 * et ce qui est vérifié ici tient à des lignes précises, pas à la structure.
 */

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const YML = readFileSync(join(RACINE, '.github/workflows/verification.yml'), 'utf8').replace(/\r\n/g, '\n');

/** Le texte d'un job, de sa clé à la clé du job suivant. */
function job(nom) {
  const lignes = YML.split('\n');
  const debut = lignes.indexOf(`  ${nom}:`);
  if (debut < 0) throw new Error(`job « ${nom} » introuvable dans verification.yml`);
  let fin = lignes.length;
  for (let i = debut + 1; i < lignes.length; i += 1) {
    if (/^ {2}[a-z][a-z-]*:\s*$/.test(lignes[i])) {
      fin = i;
      break;
    }
  }
  return lignes.slice(debut, fin).join('\n');
}

/** Sans les commentaires : un défaut raconté n'est pas un défaut présent. */
const sansCommentaires = (texte) =>
  texte
    .split('\n')
    .filter((ligne) => !ligne.trim().startsWith('#'))
    .join('\n');

describe('verification.yml, lu comme le lit GitHub', () => {
  it('témoin : les deux jobs gardés sont bien ceux qu’on croit', () => {
    // Sans ce témoin, un job renommé ferait lire un texte vide aux épreuves
    // suivantes, dont certaines passeraient sur ce vide.
    expect(job('fonctions')).toContain('supabase functions deploy');
    expect(job('rappel-migrations')).toContain('supabase/migrations');
  });

  it('ne mesure plus aucune plage depuis la poussée précédente', () => {
    const code = sansCommentaires(YML);

    expect(code).not.toContain('github.event.before');
    expect(code).not.toContain('HEAD~1');
  });

  it('n’annule jamais une exécution de main pour la suivante', () => {
    // Chaque fusion garde son verdict, et un déploiement commencé va à son
    // terme. Les branches de travail, elles, ne gardent que la dernière
    // poussée.
    expect(YML).toContain("cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}");
  });
});

describe.each(['fonctions', 'rappel-migrations'])('le job %s', (nom) => {
  it('lit sa plage depuis le dernier run vert, par le script éprouvé', () => {
    const code = sansCommentaires(job(nom));

    expect(code).toContain('node scripts/plage-depuis-le-dernier-vert.mjs');
    // Les runs verts de poussées sur main, et eux seuls : un run de branche ou
    // de PR n'a rien déployé.
    expect(code).toContain('branch=main');
    expect(code).toContain('event=push');
    expect(code).toContain('status=success');
  });

  it('a tout l’historique, jusqu’au dernier run vert', () => {
    expect(sansCommentaires(job(nom))).toContain('fetch-depth: 0');
  });

  it('a le droit de lire les runs du dépôt', () => {
    expect(sansCommentaires(job(nom))).toContain('actions: read');
  });
});

describe('le déploiement des fonctions', () => {
  it('échoue sans jeton au lieu de se déclarer réussi', () => {
    // Un run vert fait avancer la base de la plage. Un déploiement sauté en
    // vert sortirait donc ses fonctions de toute plage future ; en rouge, le
    // run suivant les reprend.
    const texte = job('fonctions');
    const debut = texte.indexOf('- name: Le jeton est-il posé ?');
    expect(debut).toBeGreaterThan(-1);
    const fin = texte.indexOf('\n      - ', debut + 1);
    const etape = texte.slice(debut, fin < 0 ? undefined : fin);

    expect(etape).toContain('exit 1');
    expect(etape).not.toContain('::warning');
  });
});
