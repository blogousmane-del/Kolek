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

/**
 * Vrai si l'utilisateur peut avoir une équipe.
 *
 * Deux conditions, et il faut les deux : le forfait Illimité — c'est lui qui
 * inclut les trois places — et l'absence de titulaire, parce qu'un
 * collaborateur ne recrute pas. Un collaborateur peut très bien porter le palier
 * Illimité (il l'hérite de son titulaire à la création) ; le tester seul
 * ouvrirait « Mon équipe » à quelqu'un qui n'y verrait jamais personne.
 *
 * L'écran n'est pas la sécurité : `equipe_vue()` rend un tableau vide à qui
 * n'est pas titulaire, et `collecteur-creer-collaborateur` refuse en 403. Ce
 * hook évite de montrer une porte qui ne mène nulle part, rien de plus.
 */
export function useEstTitulaire(): boolean {
  const { donnees } = useDonnees('profil', chargerProfil, {
    messageErreur: 'Fiche indisponible. Vérifie le réseau.',
  });

  return donnees?.palier === 'illimite' && donnees.titulaireId == null;
}
