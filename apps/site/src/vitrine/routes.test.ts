import { describe, expect, it } from 'vitest';

// Par Vite et non par le disque, comme `sources.test-utils.ts` : sous jsdom,
// `import.meta.url` n'est pas une adresse `file:`, et un chemin relatif au
// répertoire courant changerait de sens selon d'où la suite est lancée.
import gabarit from '../../index.html?raw';
import { CONDITIONS, CONFIDENTIALITE, INSCRIPTION, MENTIONS_LEGALES } from './liens';
import { ROUTES } from './routes';

/**
 * La table des routes est la source unique du chemin, du fichier et des
 * balises de chaque page du site public.
 *
 * Ces épreuves ne vérifient pas du goût. Elles vérifient les contraintes qui,
 * violées, se paient en référencement sans qu'aucun écran ne change :
 *
 * - un titre de plus de 60 signes est tronqué par Google, et la coupure tombe
 *   où elle veut ;
 * - une description hors de 120-160 signes est tronquée ou complétée d'office
 *   par un extrait de la page, choisi par le robot et non par nous ;
 * - deux routes qui partagent un titre sont deux pages que Google tient pour
 *   la même, et il en garde une seule.
 *
 * Le défaut d'origine est celui-là, sous sa pire forme : au 2026-09-20 les
 * cinq routes servaient le même `index.html`, donc le même titre et la même
 * balise canonique.
 */
describe('la table des routes', () => {
  it('décrit les cinq routes du site public', () => {
    expect(ROUTES).toHaveLength(5);
  });

  it('emploie les chemins de liens.ts, et ne les recopie pas', () => {
    const chemins = ROUTES.map((r) => r.chemin);
    expect(chemins).toContain('/');
    expect(chemins).toContain(INSCRIPTION);
    expect(chemins).toContain(MENTIONS_LEGALES);
    expect(chemins).toContain(CONDITIONS);
    expect(chemins).toContain(CONFIDENTIALITE);
  });

  it('ne déclare jamais deux fois le même chemin', () => {
    const chemins = ROUTES.map((r) => r.chemin);
    expect(new Set(chemins).size).toBe(chemins.length);
  });

  it('écrit chaque chemin sans barre oblique finale, la racine exceptée', () => {
    for (const route of ROUTES) {
      if (route.chemin === '/') continue;
      expect(route.chemin.endsWith('/'), route.chemin).toBe(false);
      expect(route.chemin.startsWith('/'), route.chemin).toBe(true);
    }
  });

  it('donne à chaque route un fichier distinct, en forme de répertoire', () => {
    const fichiers = ROUTES.map((r) => r.fichier);
    expect(new Set(fichiers).size).toBe(fichiers.length);
    for (const route of ROUTES) {
      const attendu =
        route.chemin === '/' ? 'index.html' : `${route.chemin.slice(1)}/index.html`;
      expect(route.fichier, route.chemin).toBe(attendu);
    }
  });

  it('borne chaque titre à 60 signes, au-delà desquels Google tronque', () => {
    for (const route of ROUTES) {
      expect(route.titre.length, `${route.chemin} : « ${route.titre} »`).toBeLessThanOrEqual(60);
      expect(route.titre.length, route.chemin).toBeGreaterThan(0);
    }
  });

  it('tient chaque description entre 120 et 160 signes', () => {
    for (const route of ROUTES) {
      const repere = `${route.chemin} : ${route.description.length} signes`;
      expect(route.description.length, repere).toBeGreaterThanOrEqual(120);
      expect(route.description.length, repere).toBeLessThanOrEqual(160);
    }
  });

  it('ne donne jamais le même titre ni la même description à deux routes', () => {
    const titres = ROUTES.map((r) => r.titre);
    const descriptions = ROUTES.map((r) => r.description);
    expect(new Set(titres).size).toBe(titres.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('laisse le formulaire hors de l’index, et lui seul', () => {
    const horsIndex = ROUTES.filter((r) => !r.indexable).map((r) => r.chemin);
    expect(horsIndex).toEqual([INSCRIPTION]);
  });

  it('ne prérend pas le formulaire, et lui seul', () => {
    // Son contenu dépend de la chaîne de requête (`palierDepuisAdresse`), donc
    // un prérendu figé divergerait à l'hydratation. Rien à indexer sur un
    // formulaire : le rendre en chaîne ne rapporterait rien et coûterait cette
    // divergence.
    const nonRendues = ROUTES.filter((r) => !r.prerendu).map((r) => r.chemin);
    expect(nonRendues).toEqual([INSCRIPTION]);
  });
  /*
    Les mots que les collecteurs tapent, choisis par l’exploitant le
    2026-10-02 : tontine, collecte journalière, banquier ambulant, tontinier,
    carnet, Abidjan, Côte d’Ivoire. Le titre et la description sont ce que
    Google affiche dans ses résultats ; une réécriture qui les perdrait
    rendrait la page introuvable sur ces recherches sans qu’aucun écran ne
    change.
  */
  it('garde dans le titre et la description de l’accueil les mots que les collecteurs cherchent', () => {
    const accueil = ROUTES.find((r) => r.chemin === '/');

    for (const mot of ['tontine', 'collecte journalière']) {
      expect(accueil?.titre, mot).toContain(mot);
    }
    for (const mot of ['banquier ambulant', 'tontinier', 'carnet', 'Abidjan', 'Côte d’Ivoire']) {
      expect(accueil?.description, mot).toContain(mot);
    }
  });

  /*
    `index.html` est le gabarit que le prérendu remplit. Ses titre et
    description sont réécrits à la construction, mais ce sont eux que sert le
    serveur de développement, et eux qui restent si le prérendu ne passe pas.
    Deux formulations finissent par diverger : c’était déjà le cas, le
    gabarit portant encore « Kolek — » quand la table disait « Kolek · ».
  */
  it('laisse au gabarit index.html les titre et description de l’accueil', () => {
    const accueil = ROUTES.find((r) => r.chemin === '/');

    expect(gabarit.match(/<title>([^<]*)<\/title>/)?.[1]).toBe(accueil?.titre);
    expect(gabarit.match(/name="description"\s+content="([^"]*)"/)?.[1]).toBe(accueil?.description);
    expect(gabarit.match(/property="og:title" content="([^"]*)"/)?.[1]).toBe(accueil?.titre);
    expect(gabarit.match(/property="og:description"\s+content="([^"]*)"/)?.[1]).toBe(accueil?.description);
  });
});
