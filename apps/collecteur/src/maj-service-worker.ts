/**
 * Recharger l'écran quand un nouveau service worker prend la main.
 *
 * ## Le défaut que ceci corrige
 *
 * `vite-plugin-pwa` est configuré en `registerType: 'autoUpdate'`. Le nouveau
 * service worker s'installe donc tout seul et réclame les pages ouvertes. Mais
 * *réclamer une page ne recharge pas son JavaScript* : l'onglet continue
 * d'exécuter le code de la version précédente, qu'il a chargé avant la mise à
 * jour.
 *
 * Conséquence observée le 2026-08-20, en production : après un déploiement, le
 * collecteur voyait encore l'ancienne application — bouton « Confirmer la
 * mise » grisé, mention « l'enregistrement arrive au jalon J2a » — alors que le
 * serveur servait déjà la version qui écrit en base. Le paquet livré était le
 * bon ; c'est la coquille précachée qui était vieille. Un rechargement ne
 * suffisait pas : il en fallait deux, le premier servant à installer.
 *
 * Sur une application posée sur l'écran d'accueil d'un téléphone, personne ne
 * recharge deux fois. La correction est donc obligatoire, pas cosmétique.
 *
 * ## Pourquoi `controllerchange` et pas autre chose
 *
 * C'est l'événement qui dit exactement ce qui nous intéresse : *un autre*
 * service worker contrôle désormais cette page. Il ne se déclenche qu'au
 * remplacement, donc jamais en régime normal.
 *
 * Deux garde-fous, et chacun évite une vraie panne :
 *
 * 1. **Ne rien faire à la première installation.** Sur une première visite, il
 *    n'y a aucun contrôleur, puis il y en a un — `controllerchange` se
 *    déclenche pour un remplacement qui n'en est pas un. Recharger ici
 *    infligerait un clignotement à chaque nouveau visiteur.
 *
 * 2. **Ne recharger qu'une fois.** Sans le drapeau, deux événements rapprochés
 *    déclencheraient deux rechargements, et un service worker qui échoue à
 *    s'activer proprement mettrait l'application en boucle — l'écran
 *    redémarrerait sans fin, en emportant la saisie en cours.
 */
export function surveillerMisesAJour(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  // Lu maintenant, avant tout enregistrement : c'est ce qui distingue une
  // première installation d'un remplacement.
  const avaitDejaUnControleur = Boolean(navigator.serviceWorker.controller);
  let rechargementLance = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!avaitDejaUnControleur) return;
    if (rechargementLance) return;
    rechargementLance = true;
    window.location.reload();
  });
}
