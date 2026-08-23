import { loadEnv } from 'vite';

/**
 * Le garde-fou de configuration, au moment de la construction.
 *
 * ## Pourquoi il existe
 *
 * Le 2026-08-23, la vitrine a été déployée trois fois de suite avec une
 * mauvaise valeur dans `VITE_SUPABASE_ANON_KEY` : d'abord une clé anonyme
 * amputée de son premier caractère, puis une clé `sb_secret_`, puis le **JWT
 * de rôle service**. Chaque fois, la construction a réussi, le déploiement est
 * parti, et le fichier JavaScript servi à tous les visiteurs a porté la valeur
 * telle quelle.
 *
 * Tout ce qui commence par `VITE_` est compilé dans le paquet public. Il n'y a
 * donc aucune différence, pour Vite, entre une clé publique et la clé maîtresse
 * du projet : les deux sont des chaînes, et les deux partent.
 *
 * Le contrôle en ligne voyait la fuite — mais **après** la mise en ligne. Entre
 * les deux, la clé était lisible par n'importe qui. Ce garde-fou déplace la
 * détection avant : une valeur douteuse fait échouer la construction, donc rien
 * n'est déployé, donc rien n'est exposé.
 *
 * ## Pourquoi on décode le jeton plutôt que d'en mesurer la longueur
 *
 * Les deux clés du projet se ressemblent : même en-tête, même émetteur, même
 * apparence. Seule la charge utile les distingue — `"role":"anon"` contre
 * `"role":"service_role"`. Compter les caractères marcherait aujourd'hui et
 * cesserait de marcher au premier jeton de longueur différente. Lire le rôle
 * est exact, et le restera.
 */

/** Ce qu'une adresse de projet peut valoir. Le développement local pointe sur
    la pile Supabase du poste, qui n'est pas en `supabase.co`. */
const ADRESSES = [/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/, /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/];

/** Décode un segment de JWT sans vérifier la signature — on ne cherche pas à
    l'authentifier, seulement à savoir ce qu'il prétend être. */
function segment(jeton, rang) {
  const parts = String(jeton).split('.');
  if (parts.length !== 3) return null;
  try {
    const brut = Buffer.from(parts[rang].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    );
    const objet = JSON.parse(brut);
    return typeof objet === 'object' && objet !== null ? objet : null;
  } catch {
    return null;
  }
}

/**
 * L'en-tête. Contrôlé, et pas seulement la charge utile.
 *
 * C'est ce qui rattrape la première fuite du 2026-08-23 : une clé amputée de
 * son **premier** caractère garde une charge utile intacte et un rôle `anon`
 * parfaitement lisible. Seul l'en-tête est abîmé — et c'est pourtant ce jeton
 * que le serveur d'authentification refusait par un 401.
 *
 * Le défaut a été trouvé par le test, pas par la relecture : la première
 * version de ce garde-fou ne lisait que la charge utile et laissait donc passer
 * exactement le cas qui l'avait motivé.
 */
export function enTete(jeton) {
  const objet = segment(jeton, 0);
  return objet && typeof objet.alg === 'string' ? objet : null;
}

/** La charge utile : c'est elle qui porte le rôle. */
export function chargeUtile(jeton) {
  return segment(jeton, 1);
}

/**
 * Rend la liste des reproches. Vide = configuration acceptable.
 *
 * Fonction pure et exportée : c'est elle qui porte les décisions, et c'est elle
 * que les tests exercent. Le greffon Vite ne fait que la brancher.
 */
export function verifierEnv({ url, cle }) {
  const reproches = [];

  if (!url) {
    reproches.push('VITE_SUPABASE_URL est absente.');
  } else if (url.startsWith('eyJ') || url.startsWith('sb_')) {
    // Le défaut du 2026-08-23 sur kolek-admin : l'adresse et la clé inversées.
    reproches.push(
      'VITE_SUPABASE_URL contient une clé, pas une adresse. Elle doit commencer par « https:// ».',
    );
  } else if (!ADRESSES.some((forme) => forme.test(url))) {
    reproches.push(`VITE_SUPABASE_URL ne ressemble pas à une adresse de projet : ${url}`);
  }

  if (!cle) {
    reproches.push('VITE_SUPABASE_ANON_KEY est absente.');
    return reproches;
  }

  if (cle.startsWith('sb_secret_')) {
    reproches.push(
      'VITE_SUPABASE_ANON_KEY contient une clé SECRÈTE (sb_secret_). ' +
        'Elle serait publiée dans le paquet JavaScript. Utiliser la clé anon ou sb_publishable_.',
    );
    return reproches;
  }

  if (cle.startsWith('sb_publishable_')) return reproches;

  const charge = chargeUtile(cle);
  if (charge === null || enTete(cle) === null) {
    reproches.push(
      'VITE_SUPABASE_ANON_KEY n’est pas un jeton lisible — valeur tronquée ou recopiée de travers. ' +
        'Un jeton entier commence par « eyJhbGciOi » et compte trois segments séparés par des points.',
    );
    return reproches;
  }

  if (charge.role === 'service_role') {
    reproches.push(
      'VITE_SUPABASE_ANON_KEY contient le JWT de rôle SERVICE. ' +
        'Publié, il donne à n’importe quel visiteur la lecture et l’écriture de toute la base, ' +
        'politiques RLS ignorées. Utiliser la clé anon.',
    );
  } else if (charge.role !== 'anon') {
    reproches.push(`VITE_SUPABASE_ANON_KEY porte le rôle « ${charge.role} », attendu « anon ».`);
  }

  return reproches;
}

/**
 * Le greffon Vite.
 *
 * Il lève dans le hook `config`, avant toute transformation : rien n'est écrit
 * dans `dist/`, donc rien ne peut être ramassé par un déploiement.
 */
export function gardeEnv() {
  return {
    name: 'kolek-garde-env',
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), 'VITE_');
      const reproches = verifierEnv({
        url: env.VITE_SUPABASE_URL,
        cle: env.VITE_SUPABASE_ANON_KEY,
      });

      if (reproches.length > 0) {
        throw new Error(
          `Configuration refusée — la construction s'arrête avant d'écrire quoi que ce soit :\n` +
            reproches.map((r) => `  • ${r}`).join('\n') +
            `\n\nCes valeurs sont compilées dans le paquet servi à tous les visiteurs.`,
        );
      }
    },
  };
}
