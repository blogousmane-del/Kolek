import { Bouton } from '@kolek/ui';
import { useState } from 'react';

import { ouvrirCarte } from '../ecritures';
import { ChoixMise } from './ChoixMise';

/**
 * Ouvrir une carte de plus, sans toucher à celles qui existent déjà.
 *
 * Le composant sert deux moments, et non un seul :
 *
 * - **la fin d'un cycle**, où il est la seconde porte du carrefour. La première
 *   rend l'argent et clôture ; celle-ci laisse le solde chez le collecteur et
 *   rouvre un cycle. Rien à inventer en base : une carte à 31/31 reste `active`
 *   et refuse simplement d'en prendre davantage, donc son solde reste dû tant
 *   qu'aucun retrait n'a eu lieu ;
 * - **le milieu d'un cycle**, où le client veut épargner pour une seconde chose
 *   à un autre rythme. C'est l'autre besoin que nomme la migration
 *   `20260825090000_cartes_multiples`, et il n'avait aucune porte jusqu'au
 *   2026-09-01 : la fiche ne montrait ce bloc que sur une carte pleine.
 *
 * D'où le texte du panneau, qui ne présuppose **aucun** avancement. Le plan du
 * 2026-08-25 avait relevé le piège dans l'autre sens — « il annonce que la carte
 * pleine reste ouverte, or il n'y en a pas » — et l'avait contourné en ne posant
 * pas le bloc là où la phrase serait fausse. Le contournement ne tient plus dès
 * que le bloc paraît en milieu de cycle : c'est la phrase qui a dû changer.
 *
 * Le bloc est replié par défaut. Déplié, il montre le montant et demande une
 * confirmation : ouvrir une carte engage une commission — la première mise du
 * nouveau cycle — et cela ne se déclenche pas d'un doigt qui glisse.
 *
 * Un fichier à part pour deux appelants : la fiche du client et l'écran de
 * retrait. Écrit deux fois, il divergerait à la première correction.
 */
export function ActiverCarte({
  collecteurId,
  clientId,
  misePreremplie,
  identifiant,
  onOuverte,
}: {
  /**
   * L'identifiant du collecteur, donné et non lu ici.
   *
   * `collecteur_id` accompagne l'écriture : la politique RLS l'exige au
   * `with check`. Ce bloc le lisait lui-même par `supabase.auth.getUser()`, qui
   * fait un aller-retour réseau — et la liste des clients en affiche un
   * exemplaire par carte pleine. Cinq cartes pleines, cinq appels, en 3G, pour
   * une valeur que la coquille tient déjà et passe en propriété.
   */
  collecteurId: string | null;
  clientId: string;
  /** Le montant de la carte qui vient d'être remplie. Proposé, pas imposé. */
  misePreremplie: number;
  /** Préfixe des `id` du choix de mise : deux blocs peuvent coexister. */
  identifiant: string;
  onOuverte: () => void;
}) {
  const [deplie, setDeplie] = useState(false);
  const [mise, setMise] = useState<number | null>(misePreremplie);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ouvrir() {
    // `envoi` dans la garde : sans lui, un « Annuler » touché pendant la
    // requête en vol retombe à `envoi = false` à la réponse, et un second
    // appui sur « Ouvrir la carte » repart pour un second appel — donc une
    // seconde commission, sur une carte que le client n'a jamais demandée.
    if (!collecteurId || envoi || mise === null) return;
    setEnvoi(true);
    setErreur(null);

    let resultat;
    try {
      resultat = await ouvrirCarte(collecteurId, clientId, mise);
    } catch {
      // Un rejet plutôt qu'un `{ ok: false }` : le réseau est tombé pendant
      // l'écriture. Sans ce filet, `envoi` resterait vrai et verrouillerait les
      // deux boutons du bloc — il faudrait recharger l'application pour en
      // sortir, debout dans un marché.
      setEnvoi(false);
      setErreur("Le réseau a coupé pendant l'ouverture. Vérifie la carte du client avant de réessayer.");
      return;
    }
    setEnvoi(false);
    if (!resultat.ok) {
      // Le bloc reste ouvert : le refermer effacerait le montant choisi et
      // obligerait à tout refaire pour lire la raison du refus.
      setErreur(resultat.echec.message);
      return;
    }
    setDeplie(false);
    onOuverte();
  }

  if (!deplie) {
    return (
      <Bouton variante="contour" icone="plus" onClick={() => setDeplie(true)}>
        Activer une carte
      </Bouton>
    );
  }

  return (
    <div className="border border-hairline rounded-md p-3 space-y-3">
      {/* Aucune mention de « carte pleine » : ce bloc paraît aussi en milieu de
          cycle depuis le 2026-09-01. La phrase doit rester vraie à 12/31 comme
          à 31/31 — et dans les deux cas, ce qu'elle rassure est le même : rien
          de ce qui est déjà ouvert ne bouge. */}
      <p className="font-body text-sm text-ink m-0">
        Celle-ci s'ajoute. Ce qui est déjà ouvert ne bouge pas, et son solde reste dû au client.
      </p>

      <ChoixMise
        mise={mise}
        onChoisir={(montant) => {
          setMise(montant);
          // Changer de montant est une correction : laisser le refus précédent
          // à l'écran le ferait passer pour un second refus, sur une saisie que
          // le serveur n'a jamais vue.
          setErreur(null);
        }}
        identifiant={identifiant}
      />

      {erreur && (
        <p role="alert" className="font-body text-sm text-negative m-0">
          {erreur}
        </p>
      )}

      <div className="flex gap-2">
        <Bouton onClick={ouvrir} disabled={envoi || collecteurId === null || mise === null}>
          {envoi ? 'Ouverture…' : 'Ouvrir la carte'}
        </Bouton>
        <Bouton variante="contour" onClick={() => setDeplie(false)} disabled={envoi}>
          {/* Tant que l'écriture est en vol, on ne quitte pas le bloc qui en
              montrera le résultat : replier ici, c'est perdre l'alerte de
              refus et laisser croire qu'aucun appel n'est parti. */}
          Annuler
        </Bouton>
      </div>
    </div>
  );
}
