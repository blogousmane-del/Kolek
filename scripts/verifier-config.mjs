/**
 * La configuration du projet distant suit-elle ce que le dépôt déclare ?
 *
 *   node scripts/verifier-config.mjs        (npm run verifier:config)
 *
 * Lecture seule. Une seule commande part vers la production :
 * `supabase config diff --output-format json`.
 *
 * ## Pourquoi ce script existe
 *
 * Six audits d'affilée, du 25 août au 4 septembre, ont porté la même ligne :
 * « la limite Auth reste au défaut de la plateforme ». Personne ne l'avait
 * ouverte. C'était une supposition reconduite, pas une mesure — exactement le
 * défaut que `verifier-derive.mjs` a été écrit pour corriger côté schéma.
 *
 * Le 2026-09-10, `supabase config diff` a rendu la lecture en une commande. Elle
 * disait autre chose que ce qui était classé :
 *
 *     auth.minimum_password_length     dépôt 10   production 6
 *     auth.email.secure_password_change dépôt true production false
 *
 * Le premier porte son motif écrit dans `config.toml` : « 10 et non 6 : le
 * compte donne accès au registre d'épargne de dizaines de commerçants. »
 * L'intention était dans le dépôt, elle n'était pas en vigueur. Le second est
 * plus tranchant : à `false`, changer de mot de passe ne demande pas de
 * reprouver son identité, et un jeton volé ne donne plus un accès temporaire
 * mais le compte.
 *
 * ## Ce qu'il compare, et ce qu'il ne peut pas comparer
 *
 * `config diff` ne rend que les **différences**. Un réglage identique des deux
 * côtés n'apparaît nulle part dans le rapport. Ce script ne peut donc pas
 * affirmer « la production vaut X » dans l'absolu — il affirme « la production
 * suit ce que le dépôt déclare », sur une liste de chemins choisis.
 *
 * La conséquence est une méthode, pas une limite subie : **resserrer une valeur
 * commence par la changer dans `config.toml`**. C'est ce geste qui rend l'écart
 * mesurable. `auth.rate_limit.sign_in_sign_ups` valait 30 des deux côtés et ce
 * contrôle se taisait ; le dépôt écrit 5 depuis le 2026-09-10, et il crie
 * jusqu'à ce que le tableau de bord suive.
 *
 * ## Deux tables plutôt qu'un seuil
 *
 * `POSTURE` — les chemins où la production doit suivre le dépôt. Un écart est
 * un reproche.
 *
 * `TOLERES` — les écarts classés, chacun avec son motif. Deux familles s'y
 * trouvent, et les mélanger serait malhonnête : ce que `config.toml` règle pour
 * la **pile locale** (`site_url` en `localhost`, `skip_nonce_check`), et ce que
 * la production tient **plus strictement** que le dépôt (`token_refresh` à 40
 * contre 150). Aligner cette seconde famille reviendrait à desserrer la
 * production ; le motif de chaque entrée dit laquelle des deux elle est.
 *
 * Un chemin qui n'est dans aucune des deux tables fait échouer le contrôle.
 * C'est voulu : une option qui apparaît chez Supabase et diverge sans que
 * personne ne la classe est précisément ce qui s'est produit ici.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne pousse rien. `supabase config push` existe et corrigerait un écart d'un
 * geste — il enverrait aussi `site_url = "http://localhost:5173"` en
 * production, cassant les liens de réinitialisation de mot de passe des vrais
 * utilisateurs. Les réglages de posture se changent un par un dans le tableau
 * de bord.
 *
 * Il n'est pas dans la chaîne `npm run verifier` ni dans le CI, comme
 * `verifier:derive` et `verifier:migrations` : il demande le réseau et un jeton
 * d'accès. Il se lance à la main, avant une passe de sécurité.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * Les chemins où la production doit suivre la déclaration du dépôt.
 *
 * Le motif de chaque entrée est repris tel quel dans le message d'échec : celui
 * qui lira l'échec dans six mois n'aura pas lu ce fichier.
 */
export const POSTURE = {
  'auth.minimum_password_length':
    'Le compte donne accès au registre d’épargne de dizaines de commerçants ; ' +
    'le dépôt exige 10 caractères et écrit pourquoi.',
  'auth.email.secure_password_change':
    'À false, changer de mot de passe ne demande pas de reprouver son identité. ' +
    'Avec la session en localStorage, un jeton volé donne le compte, définitivement.',
  'auth.enable_signup':
    'Aucune inscription libre : les comptes naissent par admin-creer-collecteur, ' +
    'qui vérifie l’abonnement et le rôle de l’appelant.',
  'auth.enable_anonymous_sign_ins':
    'Une session anonyme contournerait les policies qui s’appuient sur auth.uid() ' +
    'pour rattacher chaque ligne à son collecteur.',
  'auth.enable_manual_linking':
    'Lier deux identités à la main permettrait de rattacher un compte tiers à un ' +
    'collecteur existant sans repasser par le portillon admin.',
  'auth.rate_limit.sign_in_sign_ups':
    'Supabase la documente comme la borne des inscriptions et des connexions. ' +
    'Elle se câble en GOTRUE_RATE_LIMIT_OTP, et la pile locale ne permet pas de ' +
    'vérifier ce qu’elle couvre : sans GOTRUE_RATE_LIMIT_HEADER, aucune borne ' +
    'par IP ne s’y applique. À resserrer quand même — plus strict ne coûte rien ' +
    'ici — sans lui prêter une protection non mesurée.',
  'auth.rate_limit.token_verifications':
    'Un code OTP à six chiffres ne tient que par le nombre d’essais permis.',
  'auth.rate_limit.anonymous_users':
    'Borne sans objet tant que les sessions anonymes sont fermées, et qui doit le ' +
    'rester si elles s’ouvraient par accident.',
  'auth.sms.enable_signup':
    'Aucun écran n’ouvre de compte par téléphone ; l’activer ferait payer des SMS ' +
    'pour une porte que le produit n’utilise pas.',
  'auth.mfa.totp.enroll_enabled':
    'Aucun écran ne propose l’enrôlement TOTP ; une fonction allumée que personne ' +
    'ne pilote est de la surface sans usage.',
  'auth.mfa.totp.verify_enabled':
    'Même motif que l’enrôlement : rien dans le code n’appelle de vérification MFA.',
  'auth.oauth_server.enabled':
    'Kolek n’est serveur d’autorisation pour personne. Allumé, le projet expose un ' +
    'parcours de consentement dont aucun écran ne se sert.',
  'api.schemas':
    'Chaque schéma exposé est une surface d’API. graphql_public n’est appelé par ' +
    'aucune ligne du produit.',
};

/**
 * Les écarts classés, avec leur motif. Deux familles, jamais confondues.
 *
 * `local` — `config.toml` pilote la pile de développement, et ces valeurs-là
 * n'ont aucune raison de ressembler à la production.
 *
 * `plus strict` — la production tient la valeur mieux que le dépôt. L'aligner
 * reviendrait à la desserrer ; c'est le dépôt qui devrait suivre, un jour, sans
 * que ça bloque quoi que ce soit aujourd'hui.
 */
export const TOLERES = {
  'auth.sms.twilio.enabled':
    'non alignable — ce champ suit le **choix du fournisseur** dans la liste ' +
    'déroulante (« Twilio »), pas la bascule « Enable Phone provider ». Mesuré le ' +
    '2026-09-10 : le fournisseur Phone est éteint, ses identifiants sont vides, et ' +
    'la base porte 0 compte avec téléphone et 0 identité phone — personne ne peut ' +
    'se connecter ainsi. Ce qui garde vraiment la porte est ' +
    'auth.sms.enable_signup, tenu à false dans POSTURE. Avertissement pour la ' +
    'suite : les libellés du tableau de bord et le modèle de la CLI ne se ' +
    'recouvrent pas un pour un — enable_confirmations s’affiche allumé dans ' +
    'l’interface et se lit false par l’API. Ne pas déduire l’un de l’autre.',
  'auth.oauth_server.allow_dynamic_registration':
    'non lisible — l’API ne rend pas ce champ, donc le tenir pour une posture ' +
    'produirait un reproche perpétuel, et un contrôle toujours rouge finit ignoré. ' +
    'Sans objet tant que auth.oauth_server.enabled est false, ce que POSTURE ' +
    'vérifie juste au-dessus : un réglage d’un serveur éteint n’ouvre rien. ' +
    'Si le serveur OAuth est rallumé un jour, le reproche sur enabled reviendra ' +
    'et celui-ci redeviendra une question — à lire alors dans le tableau de bord.',
  'auth.site_url':
    'local — la pile de développement renvoie sur localhost:5173. Cette valeur ' +
    'poussée en production casserait les liens de réinitialisation.',
  'auth.additional_redirect_urls':
    'local — la liste du dépôt porte les ports de développement. Le joker ' +
    'https://app.kolek.cash/** côté production est un sujet à part, à resserrer ' +
    'dans le tableau de bord.',
  'auth.external.google.enabled':
    'local — Google est bien utilisé en production (erreurOAuth.ts, Connexion.tsx) ; ' +
    'la pile locale n’a pas d’identifiants OAuth.',
  'auth.external.google.client_id':
    'local — l’identifiant public du client Google n’est renseigné que côté distant.',
  'auth.external.google.skip_nonce_check':
    'local — à true seulement pour la pile locale, comme le dit son commentaire ' +
    'dans config.toml. La production le tient à false.',
  'auth.rate_limit.token_refresh':
    'plus strict — production 40, dépôt 150. Aligner reviendrait à desserrer la ' +
    'production.',
  'auth.email.otp_length':
    'plus strict — production 8 chiffres, dépôt 6.',
  'auth.email.max_frequency':
    'plus strict — production une minute entre deux envois, dépôt une seconde ' +
    'pour ne pas ralentir les épreuves locales.',
  'auth.password_requirements':
    'local — déclaré vide des deux côtés ; l’API ne rend pas ce champ, ce qui le ' +
    'fait passer pour un écart.',
  'auth.sms.twilio.account_sid':
    'local — identifiant de la passerelle Auth, absent du dépôt par construction.',
  'auth.sms.twilio.message_service_sid':
    'local — même motif que le account_sid.',
  'db.pooler.default_pool_size':
    'local — le dimensionnement du pooler suit la machine, pas la posture de ' +
    'sécurité.',
  'db.pooler.max_client_conn':
    'local — même motif que la taille de pool.',
  'storage.vector.enabled':
    'local — le stockage vectoriel sert à la pile de développement ; aucun bucket ' +
    'n’existe en production.',
  'storage.vector.max_buckets':
    'local — plafond de la pile de développement, sans objet côté distant.',
  'storage.vector.max_indexes':
    'local — même motif que le plafond de buckets.',
};

/** Le chemin pointé que portent les deux tables. */
export function chemin(morceaux) {
  return (morceaux ?? []).join('.');
}

/** Une valeur du rapport, rendue lisible dans un message d'échec. */
function valeur(v) {
  return Array.isArray(v) || v === null || typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/**
 * Le rapport permet-il de conclure ?
 *
 * Un rapport tronqué se lit « aucun écart », c'est-à-dire « tout va bien ».
 * C'est la même précaution que le « en trouve, avant de juger » de
 * `search-path.test.ts` : un contrôle devenu aveugle rend une liste vide, et
 * une liste vide est la forme la plus rassurante que puisse prendre une panne.
 */
export function rapportUtilisable(rapport) {
  const trouves = [];

  if (!Array.isArray(rapport?.changes)) {
    trouves.push(
      'Le rapport ne porte pas de liste d’écarts. Sans elle, « aucun écart » ne ' +
        'veut pas dire « rien n’a divergé » mais « je n’ai rien lu ».',
    );
  }

  const manquantes = rapport?.scope?.missing ?? [];
  const presentes = rapport?.scope?.present ?? [];

  if (manquantes.length > 0) {
    trouves.push(
      `Portées non comparées : ${manquantes.join(', ')}. Une famille entière de ` +
        'réglages n’a pas été lue, et le rapport la rend sous la forme d’une absence.',
    );
  } else if (presentes.length === 0) {
    trouves.push(
      'Aucune portée comparée. Le rapport est vide de bout en bout — vérifier le ' +
        'lien au projet et le jeton d’accès avant d’en conclure quoi que ce soit.',
    );
  }

  return trouves;
}

/**
 * Les reproches. Vide = la production suit le dépôt sur tout ce qui est classé.
 *
 * @param rapport Le JSON de `supabase config diff --output-format json`.
 */
export function reproches(rapport, posture = POSTURE, toleres = TOLERES) {
  const trouves = [...rapportUtilisable(rapport)];

  for (const ecart of rapport?.changes ?? []) {
    const cle = chemin(ecart.path);

    if (cle in posture) {
      trouves.push(
        `${cle} : le dépôt déclare ${valeur(ecart.local)}, la production porte ` +
          `${valeur(ecart.remote)}. ${posture[cle]}`,
      );
      continue;
    }

    if (cle in toleres) continue;

    trouves.push(
      `${cle} diverge sans être classé (dépôt ${valeur(ecart.local)}, production ` +
        `${valeur(ecart.remote)}). Le classer dans POSTURE ou TOLERES, avec son motif — ` +
        'un écart que personne n’a regardé est celui qui a coûté six audits ici.',
    );
  }

  // `unmanaged` est le piège discret : le chemin est déclaré, il n'apparaît pas
  // dans `changes`, et une lecture naïve en déduit « identique de part et
  // d'autre ». `masked` est le même piège pour les identifiants.
  for (const morceaux of [...(rapport?.unmanaged ?? []), ...(rapport?.masked ?? [])]) {
    const cle = chemin(morceaux);
    if (cle in posture) {
      trouves.push(
        `${cle} est tenu pour une posture, mais l’API ne le rend pas — on ne peut ` +
          'pas conclure. Le lire dans le tableau de bord, ou le sortir de POSTURE.',
      );
    }
  }

  return trouves;
}

/**
 * Les arguments de la lecture, selon qui l’appelle.
 *
 * Sur un poste, `supabase link` a déjà eu lieu et la référence vit dans
 * `supabase/.temp`, hors du dépôt. Le CI n’a pas ce lien : sans
 * `--project-ref`, la commande échoue sur « projet non lié » et le contrôle
 * passe pour cassé alors qu’il est seulement mal adressé.
 *
 * La référence n’est pas un secret — elle est déjà en clair dans la CSP des
 * trois `netlify.toml`, et le workflow de vérification le dit déjà pour son
 * job de déploiement.
 */
export function argumentsDiff(env = process.env) {
  const base = ['supabase', 'config', 'diff', '--output-format', 'json'];
  const projet = (env.PROJET ?? '').trim();

  return projet ? [...base, '--project-ref', projet] : base;
}

/** Le rapport du projet visé. Lecture seule. */
export function lireRapport(env = process.env) {
  const sortie = execFileSync('npx', argumentsDiff(env), {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'pipe',
  });

  return JSON.parse(sortie);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let rapport;

  try {
    rapport = lireRapport();
  } catch (erreur) {
    console.error('Impossible de lire la configuration du projet lié.');
    console.error(erreur.stdout ?? erreur.message);
    console.error('\nSi le projet n’est pas lié : npx supabase link --project-ref <ref>');
    process.exit(1);
  }

  const trouves = reproches(rapport);
  const compares = (rapport.scope?.present ?? []).length;
  const ecarts = (rapport.changes ?? []).length;

  console.log(`${compares} portées comparées, ${ecarts} écarts avec le dépôt.`);

  if (trouves.length > 0) {
    console.error('\nLa production ne suit pas le dépôt :');
    for (const r of trouves) console.error(`  ${r}`);
    process.exit(1);
  }

  console.log('La production suit le dépôt sur tout ce qui est classé.');
}
