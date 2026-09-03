import { afterEach, describe, expect, it } from 'vitest';

import { admin, anonyme } from './harnais';

/**
 * Le mot de passe qu'un prospect choisit avant de payer.
 *
 * L'amendement « payer vaut accord » du 2026-09-02 demandait deux choses qui ne
 * tenaient pas ensemble : le mot de passe est choisi **au formulaire**, et le
 * compte ne naît qu'au règlement confirmé. Entre les deux, rien ne disait où ce
 * mot de passe reposait — `demandes_ouverture` n'avait pas de colonne, et le
 * plan n'en parlait nulle part.
 *
 * La réponse, tranchée le 2026-09-03 : une **empreinte bcrypt**, jamais le
 * clair. `auth.admin.createUser` accepte `password_hash` ; le compte naît donc
 * avec le mot de passe choisi au formulaire, sans qu'il ait jamais reposé en
 * clair nulle part.
 *
 * ## Pourquoi ces tests, alors que la migration porte déjà ses garde-fous
 *
 * Un `do $garde$` ne rejoue pas. Il a mesuré l'état du jour où il a été
 * appliqué ; il ne dira rien de la migration que quelqu'un écrira dans trois
 * mois en remplaçant `journaliser_demande` ou en desserrant la contrainte.
 * C'est mot pour mot la leçon de `search-path.test.ts`, et il n'y a pas de
 * raison de la réapprendre.
 *
 * Ces tests-ci en ajoutent un que la migration ne pouvait pas faire :
 * `admin_demandes()` est appelée telle que la console l'appelle.
 */

/** Une empreinte de la bonne forme. Sa valeur n'a aucune importance : ce qui est
    éprouvé ici est la forme, et rien de ce fichier ne déchiffre quoi que ce soit. */
const EMPREINTE = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0';

const SERIE = String(Date.now()).slice(-7);
let compteur = 0;
const posees: string[] = [];

async function poser(motDePasse: string | null): Promise<{ id?: string; erreur?: string }> {
  compteur += 1;
  const { data, error } = await admin
    .from('demandes_ouverture')
    .insert({
      nom: `Prospect ${SERIE}-${compteur}`,
      telephone: `+2250${SERIE}${String(compteur).padStart(2, '0')}`,
      palier: 'standard',
      email: `prospect-${crypto.randomUUID()}@kolek.test`,
      mot_de_passe_hash: motDePasse,
    })
    .select('id')
    .single();

  if (error) return { erreur: error.message };
  const id = (data as { id: string }).id;
  posees.push(id);
  return { id };
}

afterEach(async () => {
  // Les lignes du journal, elles, restent : `audit_log` est immuable, et c'est
  // sa raison d'être. Elles ne portent rien de sensible — c'est justement ce
  // que le troisième test vérifie.
  for (const id of posees.splice(0)) {
    await admin.from('demandes_ouverture').delete().eq('id', id);
  }
});

describe('l’empreinte du mot de passe d’une demande', () => {
  it('refuse un mot de passe en clair', async () => {
    // Le garde-fou qui vaut le plus cher pour ce qu'il coûte. Le jour où
    // quelqu'un écrira ici la valeur reçue du formulaire au lieu de son
    // empreinte, la base refusera au lieu de conserver.
    const { erreur } = await poser('Kolek-2026-motdepasse');

    expect(erreur).toContain('demandes_mot_de_passe_empreinte');
  });

  it('accepte une empreinte, et l’absence de mot de passe', async () => {
    // Une contrainte qui refuserait tout passerait le test ci-dessus en
    // bloquant aussi l'usage légitime — et une demande d'essai n'en porte pas.
    expect((await poser(EMPREINTE)).erreur).toBeUndefined();
    expect((await poser(null)).erreur).toBeUndefined();
  });

  it('ne la recopie pas dans le journal', async () => {
    // La fuite que la migration du 2026-09-03 a fermée. `journaliser_demande`
    // écrivait `to_jsonb(new)`, c'est-à-dire toute la ligne, et
    // `super-admin-journal` la rend à qui sait lire une page du journal.
    const { id } = await poser(EMPREINTE);

    const { data } = await admin
      .from('audit_log')
      .select('donnees')
      .eq('ligne_id', id as string)
      .limit(1)
      .single();
    const trace = (data as { donnees: Record<string, unknown> }).donnees;

    expect(trace).not.toHaveProperty('mot_de_passe_hash');
    // Le journal doit avoir oublié l'empreinte, pas la demande. Sans cette
    // seconde assertion, un déclencheur qui n'écrirait plus rien passerait.
    expect(trace).toMatchObject({ palier: 'standard' });
  });

  it('ne la rend pas à la console d’administration', async () => {
    const { id } = await poser(EMPREINTE);

    const { data } = await admin.rpc('admin_demandes');
    const liste = data as Array<Record<string, unknown>>;
    const mienne = liste.find((d) => d.id === id);

    expect(mienne).toBeDefined();
    expect(mienne).not.toHaveProperty('mot_de_passe_hash');
    expect(JSON.stringify(liste)).not.toContain(EMPREINTE);
  });

  it('reste hors de portée d’un navigateur, colonne comprise', async () => {
    // La table entière est révoquée à `anon` depuis l'origine. On le remesure
    // ici parce que la colonne est neuve, et qu'un `grant` de confort posé un
    // jour pour déboguer livrerait des empreintes avec le reste.
    const { error } = await anonyme.from('demandes_ouverture').select('mot_de_passe_hash');

    expect(error).not.toBeNull();
  });
});
