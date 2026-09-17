import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Pas de tiret cadratin dans un texte que le collecteur lit.
 *
 * ## Le défaut que ce fichier empêche
 *
 * Le tiret cadratin est une ponctuation française parfaitement légitime, et ce
 * contrôle ne prétend pas le contraire. Ce qu'il empêche, c'est sa densité : au
 * 2026-09-16, soixante-trois lignes d'interface en portaient un, commentaires
 * exclus. À cette densité, il cesse d'être une ponctuation et devient une
 * signature — celle du texte engendré, qui l'emploie partout où une virgule,
 * un deux-points ou un point suffiraient.
 *
 * Et dans un libellé de bouton, il n'a aucune excuse :
 *
 *     `Confirmer la mise — ${formatMontant(carte.mise)} FCFA`
 *
 * Un libellé d'action n'est pas une phrase. Le cadratin y remplace un mot
 * manquant (« de »), au prix d'une ponctuation que personne ne prononce.
 *
 * ## Ce qu'il laisse passer, et pourquoi
 *
 * **La prose.** L'écran de réglages explique en trois paragraphes ce que le
 * serveur répond ; le tiret cadratin y est la ponctuation juste, et l'interdire
 * reviendrait à interdire d'écrire en français. Un garde-fou qui crie sur du
 * texte correct finit désarmé dans la semaine, et ce dépôt en a déjà fait
 * l'expérience avec la comparaison octet à octet de `generer-theme.mjs`.
 *
 * La coupure est donc la **longueur du texte qui porte le tiret**, et non le
 * fichier où il vit. Sous 70 caractères, on n'est plus dans une phrase mais
 * dans un libellé : un titre, un sous-titre, un bouton, une ligne de statut.
 * Là, le cadratin ne ponctue rien — il remplace un mot qu'on a omis d'écrire.
 *
 *     `Confirmer la mise — ${formatMontant(carte.mise)} FCFA`   →  « de »
 *     sousTitre="Sa tournée — tu encaisses à sa place"          →  deux-points
 *
 * **Le cadratin seul**, entre guillemets, comme marque de valeur absente :
 *
 *     valeur={profil.telephone || '—'}
 *
 * Ce n'est pas de la prose, c'est une convention de tableau, aussi ancienne que
 * les tableaux. Elle dit « rien ici » sans occuper une phrase, et la remplacer
 * par « Non renseigné » rallongerait chaque ligne vide d'une fiche.
 *
 * **Les commentaires** : ils ne sont lus que par nous.
 *
 * ## Pourquoi un contrôle de source
 *
 * Parce que c'est le seul endroit où le défaut se voit tout entier. Une ligne
 * isolée ne dit rien ; c'est le compte qui accuse. Aucun test d'interface ne
 * compte des caractères sur soixante fichiers, et aucune relecture ne le fait
 * non plus.
 */

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Les arbres soumis au contrôle.
 *
 * Les `.ts` autant que les `.tsx` : la moitié des phrases du produit vit dans
 * des tables de messages — `ecritures-ecrans.ts`, `donnees.ts`, `vues.ts` — et
 * un contrôle borné aux composants les manquerait toutes.
 */
const ARBRES = ['apps/admin/src', 'apps/collecteur/src', 'apps/site/src', 'packages/ui/src'];

/** Le cadratin et le demi-cadratin. Le second sert parfois de séparateur
    d'intervalle, où le trait d'union ordinaire fait le même travail. */
const TIRETS = /[—–]/;

/**
 * Au-delà, c'est une phrase ; en-deçà, c'est un libellé.
 *
 * 70 caractères n'est pas un chiffre rond tiré au sort : c'est à peu près la
 * longueur de la plus longue chose qu'on écrit encore sur un bouton ou dans un
 * sous-titre, et le seuil sous lequel aucun des paragraphes explicatifs de
 * l'administration ne tombe. Les deux populations sont franchement séparées
 * dans ce dépôt, il n'y a presque rien entre 60 et 120.
 */
const LONGUEUR_LIBELLE = 70;

/**
 * Les unités de texte d'une source : ce que le lecteur voit d'un seul tenant.
 *
 * Deux formes, et il faut les deux. Une chaîne entre guillemets couvre les
 * tables de messages et les propriétés (`sousTitre="…"`). Un passage de texte
 * JSX — tout ce qui sépare un `>` d'un `<` — couvre les paragraphes écrits
 * directement dans le balisage, qui sont l'essentiel de la prose du produit.
 *
 * Le passage JSX peut contenir des accolades : `{PRIX_SEGMENT}` au milieu d'une
 * phrase ne la coupe pas en deux pour le lecteur, et la couper ici ferait passer
 * chaque moitié sous le seuil de libellé. C'est exactement le faux positif que
 * ce contrôle doit éviter.
 *
 * Les deux lectures se recouvrent, et c'est voulu : **c'est la plus longue qui
 * décide**. Une apostrophe française — « l'instant », « n'est » — ouvre une
 * fausse chaîne pour qui lit les guillemets, et en découpe un morceau de trente
 * caractères au milieu d'un paragraphe. Ce morceau existe, mais le passage JSX
 * qui le contient est plus long, donc c'est lui qui qualifie le tiret. Le piège
 * est le même que celui documenté dans `verifier-champs.mjs` ; la parade est
 * différente parce qu'ici on mesure au lieu de borner.
 */
const PASSAGE_JSX = />([^<>]+)</g;
const CHAINE = /(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;

/**
 * Ce qu'une accolade retire au texte.
 *
 * `{MISES_PAR_CYCLE}` n'est pas lu : il est remplacé, à l'exécution, par un
 * nombre de deux chiffres. Le compter pour sa longueur écrite ferait passer
 * « Cycle terminé — {MISES_PAR_CYCLE} mises sur {MISES_PAR_CYCLE}. » pour une
 * phrase de quatre-vingts caractères, alors que le lecteur en voit quarante.
 *
 * Et dans l'autre sens : un `<span>` dont tout le contenu est une expression
 * n'a aucun texte propre. Sans ce nettoyage, il passerait pour un long
 * paragraphe et couvrirait le libellé de bouton qu'il contient.
 */
const EXPRESSION = /\{[^{}]*\}/g;

/**
 * Les balises qui ne coupent pas une phrase.
 *
 * « Le consulter s'enregistre </strong> — c'est pourquoi… » est une seule
 * phrase pour le lecteur, et deux passages pour l'analyseur. Sans ce nettoyage,
 * chaque moitié tombe sous le seuil de libellé et le contrôle signale de la
 * prose parfaitement écrite.
 */
const BALISES_EN_LIGNE = /<\/?(?:strong|em|b|i|u|code|small|span|br)\b[^>]*>/g;

/**
 * Le cadratin employé seul, comme marque de valeur absente.
 *
 * Les espaces autour sont tolérées : `' — '` reste une marque de vide, pas une
 * phrase. Ce qui compte est qu'il n'y ait rien d'autre entre les guillemets.
 */
const MARQUE_DE_VIDE = /(['"`])\s*[—–]\s*\1/g;

function fichiers(dossier) {
  let entrees;
  try {
    entrees = readdirSync(dossier);
  } catch {
    return [];
  }
  return entrees.flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    if (!chemin.endsWith('.tsx') && !chemin.endsWith('.ts')) return [];
    if (chemin.includes('.test.')) return [];
    return [chemin];
  });
}

/** Les fichiers que le contrôle lit. Exporté pour que le test puisse vérifier
    qu'il en trouve — un contrôle qui ne lit rien est vert pour rien. */
export function sources() {
  return ARBRES.flatMap((arbre) => fichiers(join(RACINE, arbre)));
}

/**
 * Blanchit les commentaires, sans décaler les lignes.
 *
 * Les commentaires de ce dépôt sont longs et portent beaucoup de cadratins —
 * celui que vous lisez en est un. Les compter reviendrait à interdire d'écrire
 * en français dans les marges, ce qui n'est pas le sujet.
 *
 * Chaque caractère retiré est remplacé par une espace plutôt que supprimé :
 * les numéros de ligne restent justes, et c'est tout ce qu'on demande au
 * message d'erreur.
 */
function sansCommentaires(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (ligne, avant) => avant + ' '.repeat(ligne.length - avant.length));
}

/**
 * Toutes les unités de texte d'une source, avec leur position.
 *
 * Le passage JSX n'est cherché que dans un `.tsx` : dans un `.ts`, un `>` suivi
 * d'un `<` n'est jamais du balisage, c'est une flèche de fonction suivie d'une
 * comparaison, et le « texte » entre les deux est du code. Le laisser courir
 * fabriquerait de longues unités imaginaires qui couvriraient de vrais libellés.
 */
function unites(propre, chemin) {
  const trouvees = [];

  if (chemin.endsWith('.tsx')) {
    PASSAGE_JSX.lastIndex = 0;
    let coup;
    while ((coup = PASSAGE_JSX.exec(propre)) !== null) {
      const brut = coup[1];
      // Une flèche ou un point-virgule dans le « texte » : ce n'en est pas.
      if (/[;]|=>/.test(brut)) continue;
      trouvees.push({
        debut: coup.index + 1,
        fin: coup.index + 1 + brut.length,
        lisible: brut.replace(EXPRESSION, ' ').replace(/\s+/g, ' ').trim(),
        // Ce que le message d'erreur montrera. `lisible` sert à mesurer, pas à
        // citer : ses accolades vidées rendent le texte méconnaissable pour
        // qui doit ensuite le retrouver dans le fichier.
        brut: brut.replace(/\s+/g, ' ').trim(),
      });
      PASSAGE_JSX.lastIndex = coup.index + 1;
    }
  }

  CHAINE.lastIndex = 0;
  let coup;
  while ((coup = CHAINE.exec(propre)) !== null) {
    const brut = coup[2];
    trouvees.push({
      debut: coup.index + 1,
      fin: coup.index + 1 + brut.length,
      // Les interpolations comptent pour ce qu'elles valent à l'écran, pas pour
      // ce qu'elles pèsent dans la source. Sans ça, un gabarit court mais très
      // interpolé — trois ternaires de pluriel autour de deux mots — passait
      // pour une phrase de quatre-vingt-huit caractères et échappait au
      // contrôle. C'était le cas du bandeau d'opérations refusées de l'accueil.
      lisible: brut.replace(EXPRESSION, ' ').replace(/\s+/g, ' ').trim(),
      brut: brut.replace(/\s+/g, ' ').trim(),
    });
  }

  return trouvees;
}

/**
 * Les tirets trouvés dans un libellé, pas ceux d'une phrase.
 *
 * Pour chaque tiret, on retient **la plus longue unité qui le contient** : c'est
 * elle qui dit si le lecteur voit une phrase ou une étiquette. Voir le
 * commentaire de `PASSAGE_JSX` pour la raison.
 */
export function chercherTirets(source, chemin = '') {
  const propre = sansCommentaires(source)
    .replace(MARQUE_DE_VIDE, (m) => ' '.repeat(m.length))
    .replace(BALISES_EN_LIGNE, (m) => ' '.repeat(m.length));

  const toutes = unites(propre, chemin || 'x.tsx');
  const trouves = [];

  for (let i = 0; i < propre.length; i += 1) {
    if (!TIRETS.test(propre[i])) continue;

    const contenantes = toutes.filter((u) => u.debut <= i && i < u.fin);
    if (contenantes.length === 0) continue;

    const plusLongue = contenantes.reduce((a, b) => (b.lisible.length > a.lisible.length ? b : a));
    if (plusLongue.lisible.length >= LONGUEUR_LIBELLE) continue;

    trouves.push({
      chemin,
      ligne: propre.slice(0, i).split('\n').length,
      texte: plusLongue.brut,
    });
  }

  // Deux tirets dans un même libellé ne font qu'un défaut à corriger.
  const vues = new Set();
  return trouves.filter((t) => !vues.has(`${t.ligne}:${t.texte}`) && vues.add(`${t.ligne}:${t.texte}`));
}

/** Le même contrôle, sur l'ensemble du dépôt. */
export function chercherDansLeDepot() {
  return sources().flatMap((chemin) =>
    chercherTirets(readFileSync(chemin, 'utf8'), relative(RACINE, chemin).replace(/\\/g, '/')),
  );
}

// Comparaison via `pathToFileURL` plutôt qu'un gabarit `file://${...}` : ce
// dernier échoue sous Windows et empêcherait le bloc CLI de s'exécuter, en
// silence. Même raison que dans `verifier-champs.mjs`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fautifs = chercherDansLeDepot();

  if (fautifs.length > 0) {
    console.error('Tiret cadratin dans un texte d’interface :');
    for (const f of fautifs) {
      console.error(`  ${f.chemin}:${f.ligne} — ${f.texte.slice(0, 96)}`);
    }
    console.error('\nUn point, une virgule, un deux-points ou une parenthèse font le même travail.');
    console.error('Le cadratin seul entre guillemets reste permis : c’est la marque de valeur absente.');
    process.exit(1);
  }

  console.log(`Les ${sources().length} sources d’interface sont sans cadratin de prose.`);
}
