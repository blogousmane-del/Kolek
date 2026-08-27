/**
 * Les courriels qui donnent accès au compte.
 *
 * Module sans aucune API Deno, comme `message-client.ts` : le texte est ce qui
 * se relit le plus souvent et se casse le plus discrètement.
 *
 * ## Ce qui ne doit jamais figurer ici
 *
 * **Un mot de passe.** Ni engendré, ni provisoire, ni « à changer à la première
 * connexion ». Un mot de passe écrit dans un courriel dort dans une boîte de
 * réception pour toujours, et rien n'oblige à le changer. Le lien à usage
 * unique laisse le prospect choisir le sien — et c'est ce qui permet à
 * l'invitation et à l'oubli de partager un seul dispositif.
 *
 * ## Deux messages, deux tons
 *
 * L'invitation nomme la personne : GTCS lui a parlé, l'a rappelée, et lui ouvre
 * son compte. La réinitialisation ne nomme personne — elle part sur une adresse
 * saisie par quelqu'un qui n'a pas encore prouvé qu'il la possède, et y écrire
 * le nom du titulaire livrerait un fait sur le compte à qui a tapé l'adresse au
 * hasard.
 *
 * Pas de conversion typographique ici, contrairement à `message-client.ts` :
 * un courriel se facture au message, pas au segment, et l'apostrophe française
 * n'y coûte rien.
 */

export interface Courriel {
  sujet: string;
  corps: string;
}

export type Evenement =
  | { type: 'invitation'; nom: string; lien: string }
  | { type: 'reinitialisation'; lien: string };

/** L'adresse de l'application, pour la ligne qui suit le clic. */
const APPLICATION = 'https://app.kolek.cash';

export function composer(evenement: Evenement): Courriel {
  if (evenement.type === 'invitation') {
    // Le nom peut manquer sur une demande déposée avant le 2026-08-27 : on
    // retombe sur une salutation sans nom plutôt que sur une virgule orpheline.
    const salutation = evenement.nom.trim() ? `Bonjour ${evenement.nom.trim()},` : 'Bonjour,';

    return {
      sujet: 'Ton compte Kolek est ouvert',
      corps: [
        salutation,
        '',
        'GTCS vient d’ouvrir ton compte collecteur.',
        '',
        'Choisis ton mot de passe ici. Le lien vaut une heure et ne sert qu’une fois :',
        evenement.lien,
        '',
        `Ensuite, tu te connectes sur ${APPLICATION} avec cette adresse et le mot de passe que tu viens de choisir.`,
        '',
        'Tu n’as rien demandé ? Ignore ce message : sans le clic, rien ne s’ouvre.',
        '',
        'GTCS — Kolek',
      ].join('\n'),
    };
  }

  return {
    sujet: 'Choisir un nouveau mot de passe Kolek',
    corps: [
      'Une réinitialisation de mot de passe a été demandée pour cette adresse.',
      '',
      'Choisis ton nouveau mot de passe ici. Le lien vaut une heure et ne sert qu’une fois :',
      evenement.lien,
      '',
      'Tu n’as rien demandé ? Ignore ce message. Ton mot de passe actuel reste valable, et personne n’a appris quoi que ce soit sur ton compte.',
      '',
      'GTCS — Kolek',
    ].join('\n'),
  };
}
