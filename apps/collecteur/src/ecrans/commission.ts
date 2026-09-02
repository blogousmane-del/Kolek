import { useDonnees } from '../cache';
import { chargerProfil } from '../lectures-ecrans';

/**
 * Vrai si l'utilisateur est un collaborateur.
 *
 * Quatre écrans annoncent au collecteur que la commission de la première mise
 * est la sienne. Pour un collaborateur, c'est faux : les collaborateurs sont
 * salariés, pas commissionnés, et la commission revient toujours au titulaire —
 * quel que soit qui encaisse. Laisser ces quatre phrases en l'état lui
 * promettrait un revenu qu'il ne touchera pas, tous les jours, pendant qu'il
 * travaille.
 *
 * ## Pourquoi un hook et pas une propriété passée de haut en bas
 *
 * Les quatre écrans concernés n'ont pas de parent commun : `Bilan`, `Recus` et
 * `Retrait` sont des pages, `ChoixMise` est un morceau de formulaire rendu dans
 * trois écrans différents. Faire descendre la valeur imposerait de la traverser
 * dans la coquille et dans trois écrans qui n'en ont pas l'usage.
 *
 * La clé de cache est celle de l'écran « Plus », délibérément : le profil est
 * déjà lu là-bas, et deux clés pour la même ligne feraient deux requêtes et,
 * un jour, deux réponses différentes.
 */
export function useEstCollaborateur(): boolean {
  const { donnees } = useDonnees('profil', chargerProfil, {
    messageErreur: 'Fiche indisponible. Vérifie le réseau.',
  });

  // `!= null` et non `!!` : un identifiant est une chaîne, et la chaîne vide
  // n'est pas un état que la base peut produire — mais la lire comme « pas de
  // titulaire » serait une coïncidence, pas une intention.
  return donnees?.titulaireId != null;
}
